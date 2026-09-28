# Join form security

How the public Infinity Club membership form (`/join`) is protected, what each layer does, and what it does not do. The approach is defence in depth: every layer reduces abuse, none eliminates it, and the form is not "100% secure".

## Trust boundaries

```
Browser (untrusted)            Vercel Function (trusted)                 Supabase (authority)
JoinPage / joinModel  ──POST──▶ api/join.js ──service role──▶ public.membership_applications
Turnstile widget               ├─ Cloudflare Siteverify                     RLS on, anon/authenticated revoked
                               └─ Upstash Redis (rate limit)                unique indexes, CHECK constraints
```

- **Everything from the browser is untrusted.** Dropdowns, `disabled` fields, client validation, and the hidden `form`, `version` and `source` values are conveniences only. The API re-validates every field against explicit allowlists and builds the row itself, so unknown keys (`role`, `status`, `isAdmin`, …) never reach the database.
- **The browser never talks to the database.** `SUPABASE_SECRET_KEY` exists only in the function's environment. `membership_applications` has RLS enabled, no privileges for `anon` or `authenticated`, and no policies. Only `service_role` reads and writes it.
- **The database has the last word** on uniqueness, the Faculty → Department pair, and the phone normalization.

## Request pipeline (`api/join.js`)

Each step answers on its own and stops the request:

| Step | Refusal |
|---|---|
| Method must be `POST` | 405 + `Allow: POST` |
| `Content-Type: application/json` | 415 |
| Declared `Content-Length` ≤ 64 KB | 413 |
| Same-site `Origin`/`Referer` (Vercel deployments) | 403 |
| Rate limit: 8 requests / 10 min / client | 429 + `Retry-After` |
| Raw body read with a 64 KB cap; valid JSON object | 413 / 400 |
| Honeypot (`website`) filled | neutral 201, nothing written, no Turnstile call |
| Form version ≥ 4 (older tabs are asked to reload) | 400 |
| Field validation, including the Faculty → Department pair | 400 + `field` |
| Turnstile Siteverify | 403 (refused) / 503 (unreachable) |
| Duplicate lookup, then insert (unique indexes) | 409, neutral message |

Invalid payloads are refused before the Turnstile check, so junk never spends a Cloudflare call. Duplicate checks run after it, so every duplicate probe costs a solved challenge.

## Cloudflare Turnstile

- The widget (`src/components/forms/TurnstileWidget.jsx`) loads Cloudflare's script only on the Join page and renders explicitly, bound to `action: 'join'`.
- **The token lives in React state only.** It is never stored in form values, the draft, `localStorage`, the database or logs, and the API never echoes it back.
- Tokens are single-use. After any request that carried one (success or failure), the page mounts a fresh widget. An expired or errored widget clears the token. Nothing resubmits automatically.
- **Server side**, `api/_lib/turnstile.js` posts the secret, the token and the client IP to Siteverify (5 s timeout) and requires `success: true` and `action: 'join'`. A client flag such as `verified: true` is meaningless.
- **Failure modes:**
  - A refused token gets 403: "We couldn't verify the security check. Please try again."
  - An unreachable Cloudflare gets 503. The form fails closed.
- **Configuration:**
  - `TURNSTILE_SECRET_KEY` is mandatory on every Vercel deployment. Without it, `/api/join` answers 503 rather than accepting unverified submissions.
  - Local development (`npm run dev:api`) without a secret skips the check and logs a warning.
  - Cloudflare's testing keys pass locally and on previews but are refused in production (`VERCEL_ENV=production`, logged as `testing_key`).

## Rate limiting

- `api/_lib/distributed-rate-limit.js` keeps one fixed-window counter per client in Upstash Redis through its REST API, using a single Lua `EVAL` so the counter can never lose its expiry. No SDK dependency.
- **Keys** are `join:<HMAC-SHA-256(RATE_LIMIT_HASH_SECRET, ip)>`, so no raw IP address is stored. Without the secret the hash is unkeyed and therefore reversible by brute force over IPv4: set it.
- **Fallback:** if Redis is not configured, returns an error, or times out (1.5 s), the per-instance in-memory limiter in `api/_lib/security.js` takes over. The function logs `[join] distributed rate limiter unavailable` with a code, never the URL or token. After a failure, that instance skips Redis for 30 s to avoid stacking timeouts. Availability is preserved; the protection in that window is per instance only.

## Duplicate protection

- **One application per e-mail address and per phone number**, enforced by unique indexes from `20261009120000_membership_join_security.sql`:
  - `membership_applications_email_unique_idx` on `lower(btrim(email))`.
  - `membership_applications_phone_unique_idx` on `phone_normalized`, where not null.
- **Early lookup:** the API first does two indexed equality lookups (`email = $1`, `phone_normalized = $1`, `limit 1`) in parallel. It no longer loads stored phone numbers into Node. A concurrent twin that slips past the lookup is refused by the index (`23505`).
- **Neutral answers:** both paths return the same 409, "An application with these contact details may already exist. Please contact the club if you need help.", and log only `reason: 'duplicate_contact'`. The response never says which contact matched.
- **Limitation:** a 409 still reveals that *some* application uses these details. That is inherent to refusing duplicates at all. Turnstile, the rate limit and the absence of detail keep this from scaling into enumeration.

### Normalized phone

- `phone_normalized` is a **generated column** (`public.membership_phone_key(phone)`). The database computes it for every row, past and future, and no client can set it.
- **The rule:** keep ASCII digits only, drop a `00213`/`213` country prefix, and restore the leading `0` of a 9-digit national number. So `+213 555 01 02 03`, `00213 555 01 02 03` and `0555 01 02 03` all become `0555010203`. Other numbers keep their full digit string.
- The rule exists twice, in `api/_lib/membership-phone.js` (for the early lookup) and in SQL. `tests/join-security.test.mjs` checks the SQL copy.

### Resolving existing duplicates

If historical rows already share an e-mail address or phone number, the migration stops with `membership_applications contains N duplicated e-mail group(s) and M duplicated phone group(s); nothing was changed.` It never deletes or merges applications. List the groups (read-only):

```sql
select lower(btrim(email)) as email_key, array_agg(reference order by submitted_at) as references
  from public.membership_applications
 group by 1 having count(*) > 1;

-- Same rule as public.membership_phone_key(), inlined: the function does not
-- exist yet when the migration has stopped.
with cleaned as (
  select reference, submitted_at, regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') as digits
    from public.membership_applications
), stripped as (
  select reference, submitted_at,
         case when digits like '00213%' then substr(digits, 6)
              when digits like '213%' and length(digits) > 9 then substr(digits, 4)
              else digits end as local_digits
    from cleaned
)
select case when length(local_digits) = 9 then '0' || local_digits else local_digits end as phone_key,
       array_agg(reference order by submitted_at) as references
  from stripped
 where local_digits <> ''
 group by 1 having count(*) > 1;
```

Decide each group by hand, for example by removing an obvious test or spam row, or by correcting a mistyped contact. Archiving is not enough: the unique indexes cover every row, whatever its status. Then run the migration again.

## Database constraints

- `faculty` must be one of `fmi`, `fst`, `fsnv`, `fsecg`, `fll`, `fdsp`, `fshs`, and `(faculty, department)` must be a pair from `public.membership_department_label()`. Both come from `20261008120000_membership_faculty_department.sql`, mirroring `shared/membership/university-structure.js`.
- Legacy rows (faculty null, free-text department) stay valid and untouched.
- `staff_department` is the Infinity internal team. It is unrelated to the university `department`.

## Privacy

- **Source:** only `window.location.pathname` is sent as `source`. The server reduces anything else, including the full URLs older clients sent, to a safe path or null. Query strings and fragments are never stored.
- **Draft:** the sessionStorage draft (`infinity-membership-draft-v4`, per tab) keeps progress fields only: name, study level, faculty, department, role and preferences. E-mail, phone, consent, the honeypot and the Turnstile token are never written. The draft is an allowlist (`DRAFT_FIELDS`), so new fields stay out by default. Older drafts (v1–v3, which held e-mail and phone) are deleted on load.
- **Logs** carry fixed messages and error codes only. The body, name, e-mail, phone, IP address, token, secrets and `process.env` are never logged; `tests/join-security.test.mjs` asserts this.
- **Public errors** never mention Supabase, SQL, tables, Redis, Cloudflare internals, environment variable names or stack traces.

## Browser hardening (`vercel.json`)

- **Site CSP:** `default-src 'self'`, `base-uri 'self'`, `object-src 'none'`, `frame-ancestors 'self'`, `form-action 'self'`, and `script-src 'self' https://challenges.cloudflare.com`: no inline scripts, no `eval`. `frame-src` allows only Turnstile. `connect-src` allows `'self'`, Supabase Storage (`*.supabase.co`, for AIVEX direct uploads) and Turnstile. Fonts come from Google Fonts and Fontshare.
- **`style-src` keeps `'unsafe-inline'`.** Framer Motion's `AnimatePresence mode="popLayout"` (community team carousel) injects a `<style>` element at runtime. A strict policy was measured to block it. Style injection is far less dangerous than script injection, and scripts stay strict.
- **Admin CSP** (`/admin…`) is the same without Turnstile, plus `frame-src 'self' blob:` and `object-src 'self' blob:`. The AIVEX document viewer shows PDFs as `blob:` URLs in an iframe, and those documents inherit the page's policy.
- **Other headers:**
  - `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff`.
  - `Referrer-Policy: strict-origin-when-cross-origin`, except `/aivex/status`, which keeps `no-referrer`.
  - `Permissions-Policy` disabling camera, microphone, geolocation, payment and USB.
  - `Strict-Transport-Security: max-age=63072000`. It omits `includeSubDomains` because not every subdomain of the production domain has been confirmed HTTPS-only. Add it, and consider preload, once that is verified.
- Applicant values render as React text everywhere (Join and admin). No `dangerouslySetInnerHTML` or `innerHTML` touches them (static test).

## Remaining limitations

- Turnstile raises the cost of automation. It does not stop humans, CAPTCHA-solving services or a determined attacker with many IP addresses.
- The rate limit keys on the client IP. Shared networks (a university NAT) share a budget, and IP rotation evades it.
- When Redis is down, limiting is per serverless instance.
- The duplicate 409 is necessarily an oracle for "these details were already used" (see above).
- `style-src 'unsafe-inline'` remains (see above).
- `NOT NULL` on `faculty` is deferred until legacy rows are handled.
