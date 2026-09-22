# AIVEX production readiness

Status: **CONDITIONAL / NOT DEPLOYED** — code preparation only. No production migration, setting change, deployment, commit or push was performed by this work.

## 1. Architecture after direct upload

Registration and signed-document bytes now follow: browser → one-object Supabase signed upload capability → private `staging/` prefix → JSON finalize → authoritative server inspection → private permanent path. Vercel receives small JSON and downloads staged objects only during verification; candidate upload request bodies no longer cross Vercel's payload boundary. The backend still owns validation, DB transitions, DOCX generation and Magic Link issuance.

## 2. Registration workflow

`POST /api/aivex/register/init` validates V4 payload, edition, file manifest and campaign, resolves an idempotent session and returns five scoped capabilities. The browser uploads exactly five files. `POST /api/aivex/register/finalize` rechecks the campaign/payload/session, verifies exact inventory and real bytes, then reuses `registerV4`, reference/fingerprint/idempotency/compensation, DOCX and Magic Link workflows.

## 3. Signed-document workflow

The Magic Link resolves the registration at init and finalize; candidate-supplied registration IDs are ignored. A single private staging object is verified and copied to a new immutable version. Checksum, `uploadId` replay and collision retry remain server-owned.

## 4. Campaign gates

`loadAivexOperationalSettings`, `canRegister` and `canUploadSignedDocument` fail closed. Init and finalize both check enabled flags and instants. No grace period is implemented. Business instants are stored explicitly with Algeria's `+01:00` offset.

Target manual values for edition 2, subject to production review:

- `registration_open_at = 2026-10-01T00:00:00+01:00`
- `registration_close_at = 2026-10-25T23:59:59+01:00`
- `signed_document_deadline = 2026-10-25T23:59:59+01:00`
- `registration_enabled = true`
- `document_upload_enabled = true`

## 5. Correction workflow

`changes_required` is upload-eligible on both frontend and backend. A successful correction creates the next version and transitions back to `signed_document_uploaded`; old submitted documents and administrative review history are not deleted.

## 6. Storage buckets

No new bucket is required. Staging is isolated under `staging/` in the existing private `aivex-student-cards`, `aivex-id-cards`, and `aivex-signed-forms` buckets. `aivex-generated-forms` remains private and unchanged. Signed upload URLs authorize a write to one derived object; they are not read URLs or permanent public URLs.

## 7. Data protection and retention

See `aivex-identity-document-retention-policy.md`. Approval fields are nullable and purge defaults false. Purge and staging cleanup are manual, dry-run-first scripts; no cron exists.

## 8. CI and repository controls

`.github/workflows/ci.yml` runs Node 22, `npm ci`, lint, tests and build for pull requests and pushes to main, without production secrets or deployment. Adding a workflow does not gate merges by itself. Manually configure GitHub Settings → Branches/Rulesets → protect `main` → require pull request and the CI status check.

## 9. Read-only production audit — 2026-09-22

- Project inspected: production host only; no values containing PII were printed.
- Buckets: all four AIVEX buckets exist and are private. Student cards 5 MB JPEG/PNG/WEBP; ID cards 5 MB JPEG/PNG; generated forms 10 MB DOCX/PDF; signed forms 10 MB PDF/JPEG/PNG.
- Counts observed without identifying data: 5 registrations, 15 students, 5 generated documents, 5 Magic Links, 6 submitted documents.
- Edition 2 operational settings: both enabled flags false; open/close/deadline null; submission e-mail is a placeholder.
- Existing schema supports V4, write path, generated documents, Magic Links, signed documents and identity documents. The new upload-session/retention migration is necessarily MISSING until reviewed/applied.
- Live RLS grants/policies could not be conclusively introspected through the available REST credential; migrations specify RLS/default-deny and require verification in Supabase SQL Editor before launch.

## 10. Official e-mail blocker

`aivex_settings.submission_email` is a placeholder. **BLOCKED: OFFICIAL AIVEX SUBMISSION EMAIL REQUIRED.** Do not enable the campaign or invent an address.

## 11. Pilot, rollback and operations

Run `aivex-pilot-60-75.md`; it remains NOT RUN. Before deployment export/confirm backups, apply the reviewed migration, inspect settings/buckets/RLS, pin the known-good deployment and record its rollback target. Roll back application deployment if init/finalize errors rise; disable the two settings flags to fail closed. Do not roll back by deleting registrations/files or reversing an additive migration while sessions/data exist.

## 12. Known limitations and manual decisions

- Supabase signed upload capabilities have the provider-defined lifetime; the application session expires after 30 minutes and finalize fails closed after expiry.
- Standard signed uploads expose progress and safe whole-file retry, but are not resumable chunk uploads. Pilot slow-4G/background behavior is a GO/NO-GO input.
- In-memory rate limiting is per warm Vercel instance, not distributed.
- Retention duration, trigger, approver, policy version, controller/contact, exceptional holds and provider-transfer approval are unset.
- Official e-mail, campaign activation, migration application, production deployment, branch protection and real pilot require authorized manual action.
- Read-only verification cannot prove anonymous Storage/RLS posture as conclusively as a privileged SQL audit; perform the provided launch checklist in Supabase.
