# AIVEX Security & Data Protection

> **Status: Phase 4D audit — 2026-09-19. Audit only; the production DOCX workflow (registration → Supabase → private storage → DOCX → secure download) is unchanged.**
>
> This document records what the current, live implementation actually does. It does not make a legal determination — Algerian data-protection compliance is the university's/DPO's decision (§18).

## 1. Architecture

```
Browser
  │  multipart POST (payload JSON + 3 card images)
  ▼
Vercel Serverless Function — api/aivex/register.js  (Node, region: iad1 — see §14)
  │  validate → write → generate the official DOCX
  ▼
Supabase PostgreSQL            Supabase Storage (private)
  aivex_registrations            aivex-student-cards
  aivex_students                 aivex-generated-forms
  aivex_settings
  aivex_generated_documents
  │
  ▼ (on request, later)
Vercel Serverless Function — api/aivex/document.js
  │  POST { reference, submissionId } → the stored .docx, streamed back
  ▼
Browser (downloads the file, converts/prints/signs it by hand)
```

No PDF conversion, no external document-processing service, no user accounts. `api/join.js` (the separate membership form) shares the same Supabase project and the same secret-handling pattern but is a different data flow — not analysed here.

## 2. Data inventory

| Field | Table.column | Sensitivity |
|---|---|---|
| Team name, wilaya, institution | `aivex_registrations` | Organisational |
| Activity official: role, name, e-mail, phone | `aivex_registrations` | Personal (staff) |
| Delegation head: name, phone, RFID | `aivex_registrations` | Personal (staff) |
| Driver: name, phone, RFID | `aivex_registrations` | Personal (staff) |
| Student: name, phone, BAC year, RFID | `aivex_students` (3 rows/registration) | Personal (student) |
| Student-card image | Storage `aivex-student-cards`, path in `aivex_students.student_card_path` | **Personal, identity document** |
| Submission metadata: `submission_id` (UUID), `submission_fingerprint` (SHA-256), source page, timestamps | `aivex_registrations` | Technical/operational |
| Edition settings: dates, deadline, submission e-mail, template version | `aivex_settings` | Organisational |
| Generated DOCX + its metadata | Storage `aivex-generated-forms`, row in `aivex_generated_documents` | **Personal (recombines everything above into one document)** |

Current production inventory (2026-09-19, read-only, no personal values reproduced here): **2 registrations**, 6 student rows, 3 generated-document rows (2 `docx` generated, 1 legacy `pdf` failed — see §17). Both registrations pre-date this audit; one (`AIVEX2-7ZS7057Y`) was flagged to the project owner in the Phase 4C report as unexplained and not created by any known test run.

Student-card images are the most sensitive item: they are identity-document photographs, stored as files (not database rows), never included in the generated DOCX (§4), and never served through a public or signed URL (§8).

## 3. Data flow

| Step | What travels | Where | External service involved |
|---|---|---|---|
| A. Registration submit | Full multipart payload (all fields in §2 except the generated DOCX) | Browser → `api/aivex/register.js` (Vercel) → Supabase Postgres | None |
| B. Student-card images | 3 image files (≤5 MB each, JPEG/PNG/WEBP) | Browser → `api/aivex/register.js` → Supabase Storage (`aivex-student-cards`, private) | None |
| C. Generated DOCX | Registration + student data, rendered into the fixed template | Server-side only: `api/_lib/aivex-document-generation.js` reads Postgres, writes to Storage (`aivex-generated-forms`, private) | None |
| D. Downloaded DOCX | The stored `.docx` bytes | Supabase Storage → `api/aivex/document.js` (server reads with the service key) → browser, as a response body | None |
| E. Logs | Stage name + numeric/string error code only (§10) | Vercel's own log pipeline | None (Vercel is the hosting/runtime platform itself, not a third-party processor of content) |
| F. Any external service | — | — | **None.** Confirmed by dependency audit (§16): no CloudConvert, Microsoft Graph, ConvertAPI, or any other document/PDF service is called, imported, or configured anywhere in the codebase. |

PDF conversion was removed in an earlier phase; this audit re-confirms (§16) that no code path calls out to a PDF provider.

## 4. Storage

- **`aivex-student-cards`** — private (`public = false`), 5 MB/file limit, MIME allow-list `image/jpeg`, `image/png`, `image/webp`. No `storage.objects` policy exists for it, so `anon`/`authenticated` have no read or write access through the Storage API; only the service-role key (server-side) can reach it.
- **`aivex-generated-forms`** — private (`public = false`), 10 MB/file limit, MIME allow-list `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (docx) and `application/pdf` (kept for a possible future signed-document upload — nothing writes a `pdf` file today). Same access model: no policy, service-role only.
- No `getPublicUrl` or `createSignedUrl` call exists anywhere in `api/`, `shared/`, or `src/` (enforced by tests in `tests/aivex-contract-v4.test.mjs`, `tests/aivex-document-generation.test.mjs`, and the new `tests/aivex-security-audit.test.mjs`). Files are only ever read server-side and streamed back through `api/aivex/document.js`.
- Card images are **never** embedded in the generated DOCX (verified in production during Phase 4/4C: the only two images inside a generated document are the template's own logos, byte-identical to the source template).

**Status: PASS.**

## 5. Secrets

- `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are read only via `process.env` in `api/aivex/register.js`, `api/aivex/document.js`, `api/join.js`, and `scripts/aivex-retry-documents.mjs` — all server-side (Vercel Functions or a manually-run Node script). No occurrence in `src/` (the frontend).
- `vite.config.js` sets `envPrefix: ['VITE_', 'INFINITY_', 'AIVEX_']`. Neither `SUPABASE_SECRET_KEY` nor `SUPABASE_URL` starts with any of these prefixes, so even a future mistaken `import.meta.env.SUPABASE_SECRET_KEY` reference could not be inlined into the browser bundle by Vite. A regression test now asserts this statically (`tests/aivex-security-audit.test.mjs`).
- A production build was rebuilt and its output (`dist/`) scanned: no occurrence of the secret variable names.
- `.env.local` (the only file holding real credentials on this machine) is listed in `.gitignore` and has never been tracked by Git (`git ls-files` confirms only `.env.example` — which is explicitly whitelisted with `!.env.example` — is tracked). `.env.example` contains only empty placeholders for both variables.
- **Hardened in this phase:** `.gitignore` previously covered `.env`, `.env.local`, and `.env.*.local` but not the bare mode-specific files Vite also recognises (`.env.production`, `.env.development`, `.env.test` — no `.local` suffix). Tested directly with `git check-ignore`: these were **not** ignored before this change. None of these files exist in the project today, so nothing was exposed by this gap, but it's now closed — a future `.env.production` created by habit (common with Vite projects) can no longer be committed by accident.
- **Git history scan** (63 commits, full history, no filter): no file matching an env/secret-like name was ever added except `.env.example`; no line ever set `SUPABASE_SECRET_KEY` to a non-empty value; no Supabase-JWT-shaped string (`eyJ...`) or new-format key (`sb_secret_...`) appears anywhere in history. **No secret values detected in repository history.**
- **OneDrive risk (operational, not code):** the repository sits under `C:\Users\HP\OneDrive\Desktop\infinity-project`, and `.env.local` — which does hold the real `SUPABASE_SECRET_KEY` on this machine — is a real file inside that folder tree. Being gitignored means Git never uploaded it anywhere via this repository, but OneDrive itself may still sync that file's plaintext contents to the associated Microsoft cloud account and to any other device signed into it, independently of Git. This is a genuine exposure surface if that OneDrive account is not considered a trusted secret store. **I did not move the repository, delete the file, or rotate anything** — this is flagged as a manual decision in §18.

**Status: PASS** for everything checkable in code and Git history. The OneDrive sync surface is a manual operational risk, not a code defect — see §18 for the recommended action.

## 6. API security

**`api/aivex/register.js`**
- Origin check (`isTrustedOrigin`) enforced only on Vercel (`process.env.VERCEL`), same-origin/no-header-fails-open pattern documented in `api/_lib/security.js`.
- Rate limit: 5 requests / 15 minutes / client IP, in-memory (per warm instance — see §9).
- Multipart limits: 3 files max, 5 MB/file, 30 MB/request, only the `payload` field and `studentCard_1..3` fields accepted.
- Full field validation (`validateRegistrationV4`) before any write; student-card bytes checked by magic number (`file-type`), not just declared MIME.
- Honeypot field answered with a neutral success and no write/upload.
- Idempotent on `submissionId`: a replay returns the same reference, never a duplicate row.
- Errors never expose Supabase internals, stack traces, or SQL (`registrationResponsesV4.failed`, fixed message set).

**`api/aivex/document.js`**
- Requires **both** `reference` and `submissionId` in the JSON body (never a query string); both are validated by format before any lookup (`REGISTRATION_REFERENCE_PATTERN`, `isUuidV4`).
- The registration is looked up by **both values together** (`eq('submission_id', …).eq('reference', …)`); a wrong reference with the right submissionId, and a right reference with a wrong submissionId, both produce the **same 404 response body**, verified live in production (Phase 4B production test) — no way to distinguish "wrong pair" from "unknown reference" from the response.
- Response headers: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Type` = the exact DOCX MIME type, `Content-Disposition: attachment; filename="fiche-officielle-{reference}.docx"`. No storage path, bucket name, or Supabase URL ever appears in a response body.
- Same origin check and a slightly looser rate limit (20/15 min/IP — downloads can legitimately be retried more than one registration submission).
- On a still-`generation_failed` document, it retries generation once (claim-guarded, the same pipeline as the registration path) before answering; a second failure returns 409, never an internal error detail.

**Status: PASS** against everything checkable without a live pentest (no automated fuzz/pentest was run in this phase).

## 7. RLS (Row-Level Security)

| Table | RLS enabled | Policies | Effective access for `anon`/`authenticated` |
|---|---|---|---|
| `aivex_registrations` | Yes | **0** | None (RLS enabled + zero policies = default deny for every command, per Postgres semantics) |
| `aivex_students` | Yes | **0** | None (plus an explicit `revoke all … from anon, authenticated`) |
| `aivex_settings` | Yes | **0** | None (plus an explicit `revoke all … from anon, authenticated`) |
| `aivex_generated_documents` | Yes | **0** | None (plus an explicit `revoke all … from anon, authenticated`) |
| `aivex_members` (V3-era, unused by current code) | Yes | **0** | None |

No policy anywhere grants `anon` or `authenticated` any access — the "zero-policy" pattern is intentional and documented in the migration itself (`20260918120000_aivex_v4_contract.sql`, §7 comment: *"service role only. No policy is created, so anon and authenticated see nothing; the API uses the secret key server-side."*). The service role (used only inside `api/_lib` and `scripts/`) is the sole path to this data.

**One informational note, not a gap:** `aivex_registrations` and `aivex_members` don't carry the same explicit `revoke all … from anon, authenticated` that `aivex_students`, `aivex_settings`, and `aivex_generated_documents` have. Because RLS with zero policies already denies every command regardless of table-level grants, this has no actual effect on access today — it's a consistency/defense-in-depth nicety, not a hole. No migration was written for this in this phase (schema changes are out of scope unless a concrete issue requires them, per the phase's own constraints).

**Status: PASS.**

## 8. Storage policies

Covered in §4. Summary: both buckets private, zero `storage.objects` policies for either, service-role-only access, no public/signed URLs anywhere in the codebase (grep-verified and test-enforced). **Status: PASS.**

## 9. Rate limiting

| Endpoint | Limit | Window | Key | Scope |
|---|---|---|---|---|
| `POST /api/aivex/register` | 5 | 15 min | Client IP (`X-Forwarded-For` first entry, else `X-Real-Ip`, else socket address) | Per warm serverless instance (in-memory `Map`) |
| `POST /api/aivex/document` | 20 | 15 min | Same IP resolution | Per warm serverless instance |
| `POST /api/join` | Same limiter, separate key prefix | — | Same | Per warm serverless instance |

This is **best-effort, not distributed**: Vercel can route consecutive requests to different warm instances (or spin up a new cold one), each with its own counter, so a determined attacker spreading requests across instances could exceed the nominal limit. This was already true before this phase and is documented in `api/_lib/security.js` itself as an accepted MVP trade-off, with a named upgrade path (Upstash Redis / Vercel KV) behind the same function signature if abuse is ever observed. **No such external service was added in this phase**, per the explicit instruction not to introduce new infrastructure.

**Status: PARTIAL** — functionally present and verified live (the 21st download request in a burst returned 429 in the Phase 4B production test), but not a hard global guarantee.

## 10. Logging

Grep-audited every `console.log/error/warn` call in `api/_lib/aivex-*.js`, `api/aivex/*.js`, and `scripts/aivex-retry-documents.mjs`:

- All of them log a fixed message string plus, at most, `{ stage, code }` or a reference/status pair — e.g. `console.error('[aivex] Document download failed', { stage, code })`.
- **Zero** occurrences of a name, phone number, e-mail, RFID, student-card path, request body, or full registration object being logged anywhere in the AIVEX code path.
- This is enforced by three separate regression tests (`tests/aivex-contract-v4.test.mjs`, `tests/aivex-document-generation.test.mjs`, and the new `tests/aivex-security-audit.test.mjs` covering `api/aivex/document.js` independently), which scan every `console.*` call's arguments for PII-shaped words (`path|payload|body|registration|email|rfid|phone|message`).
- `api/join.js` (separate form) follows the same discipline — it logs a field *name* (`duplicateField: 'email'`) on a duplicate-application block, never the value.

**Status: PASS** for everything the tests and manual grep can see. This does not rule out PII appearing in a raw stack trace if an *unexpected* exception type were thrown with a message containing user data (e.g., a database driver echoing a value in its own error message) — none was observed, and Supabase's client errors expose only `code`/`message` fields that this codebase already narrows to `code` before logging.

## 11. Retention

**`NO RETENTION POLICY IMPLEMENTED.`**

- No Vercel Cron job exists (`vercel.json` has no `crons` key).
- No scheduled deletion, expiry job, or TTL logic exists anywhere in `api/`, `scripts/`, or the database migrations (grep-verified for `retention|expire|expiry|ttl|purge`).
- `document_status` does define an `'expired'` enum value in the shared contract, but nothing in the current code ever sets it — it is a placeholder for a future, deliberately-triggered state, not an active mechanism.
- Registrations, student-card images, and generated DOCX files persist indefinitely today, until someone with the service key deletes them by hand (as was done for 5 test registrations in Phase 4C).

**Recommendation (not implemented, per this phase's scope):** the organiser/university should define, separately:
1. How long a **registration record** (names, phones, RFIDs) is kept after the event concludes.
2. How long a **student-card image** — the most sensitive item, an identity document — is kept; a shorter retention than the registration record itself is a common practice for this category of data.
3. How long a **generated Word document** is kept once the applicant has downloaded and had it signed.
4. (Future) The same question for a signed-document upload, once that feature exists.

Implementing any automatic deletion against these categories was explicitly out of scope for this phase and was not done.

## 12. Deletion

Verified two ways: schema analysis, and a real deletion performed in Phase 4C (5 confirmed test registrations, not synthetic-only — real database rows and real storage objects in the live project).

- **Registration row deleted** → `aivex_students` rows for it are removed automatically (`on delete cascade` FK, `20260918120000_aivex_v4_contract.sql`).
- **Registration row deleted** → `aivex_generated_documents` rows for it are removed automatically (`on delete cascade` FK, `20260920120000_aivex_v4_generated_documents.sql`).
- **Storage objects are NOT cascaded** — Supabase Storage objects are not foreign-keyed to Postgres rows, so student-card files and the generated DOCX file must be deleted separately (`storage.remove()`), which Phase 4C did explicitly before deleting each registration row. Verified after the fact: all 5 deleted registrations' Storage folders were empty (0 files) afterward, and no other registration's files were touched.

**Status: PASS** for the cascade behaviour that exists; **the storage side requires an explicit extra step**, which is a real operational fact to know (there is no one-call "delete everything for this registration" today) rather than a defect — it was handled correctly by hand in Phase 4C, and any future deletion tooling must do the same two-step removal.

## 13. Backups

`Manual dashboard verification required.` Supabase project backup configuration (automatic daily backups, point-in-time recovery availability and window, Storage object versioning/backup) is a project-level setting visible only in the Supabase dashboard and was not queried via any API in this audit — the service-role key used here does not expose backup configuration, and no Supabase Management API credential is available in this environment. **UNKNOWN — REQUIRES MANUAL VERIFICATION.**

## 14. Hosting regions

- **Vercel function region:** **VERIFIED live**, 2026-09-19 — a direct request to each of the three functions returned `X-Vercel-Id: cdg1::iad1::…` for all three (`api/aivex/register`, `api/aivex/document`, `api/join`). The `iad1` segment is the function's execution region (US East, Washington D.C. area); the `cdg1` segment in front of it is the Cloudflare/Vercel edge point-of-presence that received the request, not where the function ran. **No `regions` key exists in `vercel.json`** — this is Vercel's account/project default, not something pinned in this repository's code. It could change if the project's default region setting is changed in the Vercel dashboard, independently of any commit here.
- **Supabase project region:** **UNKNOWN — manual dashboard verification required.** I deliberately did not infer it from Cloudflare edge headers, DNS, or latency (a request to the Supabase REST endpoint returned `cf-ray: …-ALG`, i.e., a Cloudflare Algiers edge PoP — this is the edge location that served *my* request, not the database's physical region, and the task's own instructions correctly warn against this inference). The actual Postgres/Storage region must be read from the Supabase dashboard (Project Settings → General → Region).

## 15. Cross-border data flow

Documenting the technical facts only — no legal conclusion is drawn:

- The registration function executes in Vercel's `iad1` region (United States), per §14. Every registration submission (all personal data in §2, including student-card images in transit before they reach Storage) passes through a process running there before being written to Supabase.
- The Supabase project's actual data-at-rest region is unverified (§14) — it may or may not be inside Algeria.
- If the Supabase database/storage region is outside Algeria, personal data of Algerian students and university staff is stored outside the country. If it is inside Algeria, the Vercel processing step still means the data is *processed* (validated, held in memory, forwarded) by infrastructure outside Algeria, even before storage.
- Student-card images — identity documents — follow the exact same path as every other field: browser → Vercel function (iad1) → Supabase Storage. No student-card image is sent to any other service.
- No external processor beyond Vercel (compute) and Supabase (database + storage) is involved anywhere in this flow (§16 confirms no PDF/document/AI third party is called).

**These facts — not a compliance verdict — are what the university/DPO needs to evaluate against Algerian Law 18-07 (personal data protection), in particular its provisions on transferring personal data abroad. This determination is theirs to make, not this audit's.**

## 16. Third-party services

Every dependency in `package.json` was reviewed; the only one that receives AIVEX personal data at runtime is:

| Service | Purpose | Data sent | Required? |
|---|---|---|---|
| **Supabase** (`@supabase/supabase-js`) | Database (Postgres) + file storage | Everything in §2 | Yes — the application's only backing store |

Confirmed **not** present anywhere in the codebase (import, `fetch()` call, dependency, or configuration): CloudConvert, Microsoft Graph / `graph.microsoft.com`, ConvertAPI, LibreOffice, or any other document-conversion or AI service. A grep across `api/`, `shared/`, and `scripts/` for any `fetch()`/`http(s)://` target other than `*.supabase.co` or `localhost` returned nothing. The remaining dependencies (`busboy`, `file-type`, `jszip`, React/animation libraries, `eslint`/`vite`/`tailwind` dev tooling) are local, in-process libraries — none of them transmit data anywhere.

**Status: PASS.**

## 17. Known limitations

- **Legacy `pdf` rows.** One row remains in `aivex_generated_documents` with `document_type = 'pdf'`, `generation_status = 'failed'`, `error_code = 'pdf_conversion_not_configured'`, no file — a leftover from before automatic PDF generation was removed, belonging to registration `AIVEX2-GPR3443P` (not a Claude-created test row; left untouched deliberately, per the standing instruction never to delete or modify that registration without clarified ownership).
- **Rate limiting is per-instance, not distributed** (§9).
- **Storage deletion is a manual, separate step from the database delete** (§12) — there is no single "delete a registration and everything it owns" operation today.
- **The DOCX download only works from the browser tab that submitted the registration** (documented in the Phase 4B production report): after a reload or closing the tab, the `submissionId` needed to authorise the download is gone from that browser, and the file can only be retrieved by the organisers going directly to Storage.
- **`aivex_members`** is an unused, V3-era table still present in the schema (protected by the same zero-policy RLS, but otherwise orphaned) — not a security issue, but schema debt.
- **Supabase's project region is unverified** (§14) — a real gap in what this audit can confirm without dashboard access.
- **Backup/PITR configuration is unverified** (§13) — same reason.

## 18. Manual university/DPO decisions required

These require a person, not code, and were **not** decided or implemented in this phase:

1. **Confirm the Supabase project's actual region** (dashboard → Project Settings → General).
2. **Confirm whether the Vercel project's default function region should be pinned explicitly** (currently an account/dashboard default, `iad1`, not committed in code).
3. **Decide whether the `SUPABASE_SECRET_KEY` currently in `.env.local` should be rotated**, given it has resided in a OneDrive-synced folder (§5) — the key itself was never committed to Git, but OneDrive's own cloud sync is a separate, uncontrolled channel.
4. **Move the repository (and therefore `.env.local`) out of the OneDrive-synced folder**, as a standing recommendation from earlier phases, still open.
5. **Define a retention period** for each of: registration records, student-card images, generated Word documents, and (later) signed documents (§11) — none exists today.
6. **Investigate `AIVEX2-7ZS7057Y`** — a registration that appeared during the Phase 4C testing window, was not created by any known test run, and uses a real institution name (flagged in the Phase 4C report; still open).
7. **Make the actual legal determination** under Algerian Law 18-07 regarding cross-border processing/storage of student and staff personal data (§15) — this document only lays out the technical facts; the conclusion is the university's/DPO's to reach.
8. **Confirm Supabase's own backup/PITR configuration and retention** meets the university's requirements (§13).
9. **Set the real AIVEX submission e-mail** in `aivex_settings.submission_email` (still the placeholder `xxx@univ-bba.dz` as of this audit) — a data-quality issue flagged in Phase 4C, repeated here because it is printed on every official document sent to applicants.
