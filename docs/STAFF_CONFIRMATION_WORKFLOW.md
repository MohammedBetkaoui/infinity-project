# Infinity Staff Confirmation Workflow

## Business flow

Every eligible Staff Join candidate has one stable private confirmation URL. An invitation creates the confirmation lifecycle and its first stable credential. The candidate can submit a 150–2000 character motivation letter, and the same URL later reports that the submission was received. If a super administrator requests a revision, the same URL shows the revision message and accepts exactly one next version.

Confirmation state and link access are independent:

- Confirmation: `not_invited`, `invited`, `submitted`, `revision_requested`, `confirmed`, or a closed/expired state.
- Link access: `active`, `blocked`, `legacy`, or `none`.

Blocking is a temporary access suspension. Unblocking restores the byte-for-byte same URL. Regeneration is a security rotation: it creates a different URL and permanently invalidates the previous one.

## Stable link architecture

PostgreSQL never stores a raw bearer token or full private URL. A reconstructable credential stores:

- confirmation UUID;
- random 16-byte base64url `link_nonce`;
- monotonic `credential_version`;
- `derivation_version` (currently `1`);
- SHA-256 `token_hash`;
- access and usage metadata.

The server reconstructs the 43-character token with HMAC-SHA256:

```text
canonical material =
staff-confirmation:v1:<confirmation-uuid>:<credential-version>:<link-nonce>

token = base64url(HMAC-SHA256(STAFF_CONFIRMATION_LINK_SECRET, canonical material))
```

Before revealing or exporting a URL, the server always checks that `SHA-256(derived token)` exactly equals the stored `token_hash`. A mismatch fails closed with the safe code `credential_derivation_mismatch`; the credential is never returned.

Candidate verification remains hash based: the received token is SHA-256 hashed and looked up by `token_hash`. Public endpoints never accept an application ID as authentication.

## Server secret

`STAFF_CONFIRMATION_LINK_SECRET` is server-only high-entropy material of at least 32 bytes. It must never use a `VITE_` prefix and must remain stable. If it is absent or too short, creation, reveal, and private-link CSV export fail closed with “Stable Staff-link service is not configured.” Existing candidate verification by stored hash can continue.

Changing this secret changes every derived token. Future master-key rotation therefore requires a deliberate multi-key or credential-migration plan. Do not silently rotate it.

## Database

The original migration `20261016120000_staff_confirmation_workflow.sql` remains unchanged. Forward migration `20261017120000_stable_staff_confirmation_links.sql` adds stable credential metadata, access state, indexes, views, and replacement RPC behavior.

Important functions:

- `staff_submit_confirmation(text, text, timestamptz)` locks application → credential → confirmation, validates eligibility/access/deadline, creates one immutable next version, and moves the confirmation to `submitted`. The credential is not consumed. A concurrent or repeated POST sees `submitted` and returns the existing version.
- `admin_apply_stable_staff_confirmation_action(...)` is the authoritative transaction for create/ensure, block, unblock, regenerate, deadline extension, revision, and final confirmation.
- `admin_record_staff_link_audit(...)` records reveal/export events without credential material.
- `membership_require_staff_confirmation()` remains the acceptance guard; Staff cannot be accepted before confirmation.
- `membership_close_staff_confirmation()` invalidates current credentials immediately when an application is declined or archived.

The service-only `admin_staff_link_credentials` view carries nonce/version/hash metadata required for reconstruction. It contains no raw token or URL and is not granted to `public`, `anon`, or `authenticated`.

## Link lifecycle

### Create / invite

The server creates a random nonce, derives the token with the server secret, and sends only nonce/version/hash into the transaction. Concurrent exports are serialized by the application lock and database uniqueness; if a stable credential already exists, `ensure_staff_confirmation_link` returns it without changing timestamps or rotating it.

### Block / unblock

`block_staff_confirmation_link` sets `blocked_at` and the authenticated super administrator ID. Verification returns the neutral candidate message “This Staff confirmation link is currently unavailable. Please contact Infinity Club.” `unblock_staff_confirmation_link` clears those fields. Neither action changes nonce, version, hash, or URL.

### Regenerate

`regenerate_staff_confirmation_link` increments the credential version, creates a new nonce/hash, and sets `revoked_at` on every prior current credential. The old URL can never become valid again. Audits record only confirmation ID and previous/new versions.

### Deadline

The seven-day value is a business submission deadline, not a token-rotation schedule. Passing the deadline temporarily makes the same URL unavailable. `extend_staff_confirmation_deadline` adds seven days without changing the credential. No automatic regeneration occurs.

### Submission and revision

Submission updates `first_used_at`/`last_used_at` but does not consume the credential. `submitted` returns “already submitted.” Revision changes only the confirmation state/message/deadline; the same stable credential accepts version 2. Database locks ensure two simultaneous POSTs cannot create versions N and N+1.

After final confirmation, the same link reports completion and does not accept another submission. Declined or archived applications make the link unavailable immediately.

## Legacy links

Rows created before the stable-link migration have a hash but no nonce. Their raw URL cannot be reconstructed and the dashboard reports `Legacy credential`.

Deployment does not rotate them. A super administrator must explicitly choose **Create stable link**, or explicitly confirm the sensitive Staff CSV export preflight. Conversion revokes all legacy current rows and creates the first reconstructable credential. A legacy link is never fabricated from its hash.

## Admin dashboard

Only `super_admin` can access Join administration or private-link APIs. Normal application detail payloads expose only `linkAccess` and `linkReconstructable`; they do not include nonce, hash, token, or URL.

The Staff confirmations queue includes eligible applications without confirmation rows, a **Not invited** tab, confirmation filters, a separate link-access filter, compact Copy/Open controls, and mobile-safe controls. Reveal is a dedicated strict-Origin POST with `Cache-Control: no-store`. Returned URLs remain transient React state only; they are never stored in localStorage, sessionStorage, IndexedDB, search, notifications, or analytics.

The candidate dossier distinguishes:

- Create stable link for legacy/no-link cases;
- Copy/Open for reconstructable links;
- Block/Unblock for reversible suspension;
- Regenerate for permanent rotation;
- Extend deadline without URL change.

Revision copy explicitly says the existing private link remains valid.

## Staff private-link CSV

**Export Staff + private links** is a separate super-admin-only action. Generic application and filtered exports must never include private links.

Preflight reports eligible candidates, existing stable links, missing links, legacy credentials requiring explicit replacement, and blocked links. Confirmed export:

1. starts from all eligible Staff applications (`new`, `in_review`, `interview`), including candidates without confirmation rows;
2. reuses every existing stable credential unchanged;
3. creates only missing credentials;
4. explicitly converts disclosed legacy credentials;
5. includes blocked URLs unchanged with `Link Status = Blocked`;
6. audits counts only and never logs or persists CSV content.

The CSV is UTF-8 with BOM, RFC-style quoted fields, and spreadsheet-formula protection for candidate-controlled values. The private URL itself is quoted but never prefixed with an apostrophe, preserving the exact value for browsers and n8n.

Column order:

1. Reference
2. Full Name
3. Email
4. Requested Staff Department
5. Application Status
6. Confirmation Status
7. Link Status
8. Private Link
9. Phone
10. Study Level
11. Faculty
12. Academic Department
13. Submitted At
14. Deadline

Blocked URLs are included so administrators can identify credentials; n8n must send only rows whose `Link Status` is `Active`.

## n8n readiness

n8n reads the CSV and maps `Email`, `Full Name`, `Reference`, `Requested Staff Department`, and `Private Link`. It must filter `Link Status = Active` before email. n8n never generates tokens. Re-sending uses the same URL; regenerate only after compromise, wrong-recipient delivery, or another security incident.

## Security and audit

Audited actions are `staff_fixed_link_created`, `staff_link_blocked`, `staff_link_unblocked`, `staff_link_regenerated`, `staff_link_revealed`, and `staff_link_csv_exported`. Audit metadata never contains token, URL, nonce, or server secret. Notifications continue to deep-link only to the authenticated dossier and never contain the credential.

The candidate route remains `noindex,nofollow`, uses `Referrer-Policy: no-referrer`, captures the fragment into memory, and immediately cleans the address bar.

## Production rollout

Do not deploy or apply migrations from development work. Production setup order is:

1. Back up and inspect current Staff confirmations and credentials.
2. Deploy code capable of reading both legacy and stable credentials while keeping the feature flag controlled.
3. Apply `20261017120000_stable_staff_confirmation_links.sql`.
4. Generate a 256-bit-or-stronger production secret outside the repository.
5. Set `STAFF_CONFIRMATION_LINK_SECRET` server-side and keep the exact value in the approved secret manager.
6. Verify a known derivation/self-check in the target environment.
7. Set/confirm `STAFF_CONFIRMATION_API_ENABLED=true` only after schema and secret checks pass.
8. Do not auto-convert existing legacy invitations.
9. Create one test stable link and confirm reveal is byte-for-byte stable after closing/reopening the dashboard.
10. Export twice and verify every existing candidate URL is identical.
11. Verify block → unavailable → unblock restores the same URL.
12. Verify revision version 2 uses the same URL.
13. Verify regenerate invalidates the old URL and export returns the new URL.
14. Verify PostgreSQL and logs contain no raw token or private URL.

## Manual validation

Use one designated Staff test candidate. Create and copy a stable link, reopen/reveal it, export twice, submit motivation, request a revision on the same link, block/unblock the same URL, regenerate, and finally confirm the old URL fails while the new one appears in CSV. Inspect the credential row to confirm only nonce, versions, hash, and state metadata are stored.
