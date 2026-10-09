# Infinity Staff Confirmation Workflow

Status: repository implementation only. The migration has not been applied, the feature flag remains disabled by default, and no message is sent automatically.

## Business flow

This workflow extends the existing Join application; it is not a second recruitment system.

1. A candidate submits the existing Join form as `staff`.
2. A super administrator reviews the original application and selects **Invite to Staff confirmation**.
3. The server creates a seven-day invitation and returns its private link once.
4. An administrator copies the generated message and sends it manually.
5. The candidate opens `/join/staff-confirmation#token=...`, verifies the invitation, and submits a 150–2000 character motivation letter.
6. Infinity Administration receives one deduplicated notification and the candidate appears in the Staff confirmations queue.
7. A super administrator can confirm membership, request a revision with a fresh private link, revoke the invitation, or decline/archive through the existing application workflow.
8. Final confirmation marks the original application accepted as Staff. The existing accepted-application synchronization trigger remains the only path into the current Staff directory.

The main application statuses remain `new`, `in_review`, `interview`, `accepted`, `declined`, and `archived`. Staff confirmation uses its own lifecycle and does not change the Member workflow.

## Security model

The `JOIN-...` reference is display context, never authentication. Possession of a valid private token authorizes candidate verification and one motivation submission.

- Tokens are generated server-side from 32 cryptographically random bytes and encoded as base64url.
- Only `SHA-256(token)` is persisted. Raw tokens and complete private links are not stored, audited, logged, or returned by later reads.
- The token is placed in the URL fragment, which browsers do not send in the HTTP request. React reads it into component memory and immediately removes the fragment with `history.replaceState`.
- The candidate page does not use cookies, `localStorage`, `sessionStorage`, IndexedDB, or direct Supabase access for the token.
- Initial, revision, and replacement tokens expire after seven days. Generating a replacement revokes every prior unconsumed token.
- Candidate APIs accept only JSON, read at most 16 KiB, validate exact request shapes, require an exact same-host HTTPS `Origin` on Vercel, and use separate distributed rate-limit buckets.
- Candidate responses expose only the reference, display name, Staff department, deadline, confirmation state, and an applicable revision message. Invalid and revoked tokens fail generically.
- All three tables have RLS enabled, no browser policies, explicit `anon`/`authenticated` revocation, and only the service role receives the required grants.
- Motivation is normalized and stored as plain text. React renders it as escaped text; Markdown and HTML rendering are not supported.
- Admin actions retain the existing session, trusted-origin, role, audit, and optimistic-concurrency protections. A stale application or confirmation returns HTTP 409.

## Database

The forward migration is `supabase/migrations/20261016120000_staff_confirmation_workflow.sql`.

### Tables

- `membership_staff_confirmations`: one lifecycle per Staff Join application.
- `membership_staff_confirmation_tokens`: append-only hash and revocation history for initial, revision, and replacement credentials.
- `membership_staff_confirmation_submissions`: immutable, sequentially versioned motivation letters.

Confirmation statuses are `invited`, `submitted`, `revision_requested`, `confirmed`, `revoked`, and `expired`. An invited or revision-requested row whose deadline has passed is treated as effectively expired without a scheduler.

### Transactional functions and guards

- `staff_submit_confirmation(text, text, timestamptz)` locks the token and confirmation, validates both, creates exactly one immutable version, consumes the token, and moves the confirmation to `submitted`. A retry with the same consumed token returns the original submission instead of creating another version.
- `admin_apply_staff_confirmation_action(...)` validates the super administrator and optimistic-concurrency timestamps, rotates tokens, writes audit history, and performs final confirmation plus application acceptance in one database transaction.
- `membership_require_staff_confirmation()` blocks every new accepted-Staff transition unless that application has a confirmed workflow. Historical accepted Staff rows are untouched.
- `membership_close_staff_confirmation()` revokes outstanding confirmation access when the existing application is declined or archived.
- `admin_staff_confirmations` is a security-invoker queue projection with effective expiry and submission counts.

The existing accepted-application synchronization trigger continues to populate `club_members` and `club_staff_profiles`, including its existing `source_application_id` uniqueness behavior. No parallel directory or legacy-data backfill is introduced.

## Admin actions

Only `super_admin` can use the workflow actions:

- `invite_staff_confirmation`: eligible Staff application in `new`, `in_review`, or `interview`; creates the lifecycle and an initial token.
- `regenerate_staff_confirmation_link`: revokes the current live token and creates a replacement.
- `request_staff_confirmation_revision`: requires `submitted`, stores a message of at most 1000 characters, and creates a revision token.
- `revoke_staff_confirmation`: invalidates an outstanding invitation.
- `confirm_staff_membership`: requires a submitted motivation, confirms the lifecycle, and accepts the original application as Staff atomically.

The former direct `accept_staff` action is unavailable through the application API and is also blocked by the database guard. Member acceptance remains unchanged.

New-token actions return an `invitation` object containing candidate, reference, URL, expiry, and a copyable message. It is shown once. If the dialog is closed before copying, regenerate the link; it cannot be recovered from the hash.

## Public endpoints

The public URLs are routed through the existing `api/join.js` function to preserve the deployment's twelve-function limit:

- `POST /api/join/staff-confirmation/verify` with `{ "token": "..." }`
- `POST /api/join/staff-confirmation/submit` with `{ "token": "...", "motivation": "..." }`

`STAFF_CONFIRMATION_API_ENABLED` fail-closes both candidate endpoints and the related admin routes until the migration is ready.

## Public page

`/join/staff-confirmation` is lazy-loaded and uses the public Infinity visual system. It supports verifying, form, submitting, success, expired, already-submitted, revision-requested, invalid-link, missing-fragment, and service-unavailable states. The textarea is labelled, has an accessible live character count and linked error, receives focus after validation failure, and cannot be submitted twice while pending.

The route uses `noindex,nofollow`, has no canonical or social metadata, is excluded from generated sitemap output, is disallowed in `robots.txt`, and receives `Referrer-Policy: no-referrer`.

## Admin experience

Applications now has a **Staff confirmations** workspace with server-side pagination, counts, search by candidate/reference, status and department filters, and sorting. Opening a queue item uses the existing candidate dossier. Staff dossiers show deadline, lifecycle state, revision message, current motivation, and every prior immutable version. The existing global Join-reference search remains the route to the underlying application, so no duplicate search index was added.

The invitation dialog exposes **Copy link** and **Copy message**. No email, WhatsApp, or other delivery provider is called.

## Notifications

Successful motivation submission emits `staff_motivation_submitted` for super administrators. Its dedupe key includes confirmation ID and submission version, so retries do not create another notification. The payload contains no motivation, raw token, private link, name, email, or phone. Its strictly allowlisted action path is:

`/admin/applications?view=staff-confirmations&record=<application UUID>`

## Production rollout

1. Keep `STAFF_CONFIRMATION_API_ENABLED=false` and retain a known-good application rollback target.
2. Review and test the forward migration on staging against a recent production-schema copy. Confirm existing accepted Staff applications are unchanged.
3. Apply `supabase/migrations/20261016120000_staff_confirmation_workflow.sql` through the project's approved Supabase migration process.
4. In Supabase SQL Editor, verify all three tables have RLS enabled; `anon` and `authenticated` have no direct table/function access; `service_role` has only the documented grants; and both RPCs are executable only by `service_role`.
5. Confirm the production server already has `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, Upstash credentials, `RATE_LIMIT_HASH_SECRET`, admin secrets, and existing notification configuration. Never expose server values through a `VITE_` variable.
6. Deploy the reviewed application with the feature flag still false and run smoke checks for the existing Join, Member acceptance, admin authentication, notification center, and Staff directory.
7. Set the server-only `STAFF_CONFIRMATION_API_ENABLED=true` and redeploy.
8. Execute the manual scenario below with a designated test Staff application. Do not use a real candidate until the scenario passes.
9. Inspect server logs for stage/code-only failures and verify that no raw token, private URL, motivation text, or candidate PII appears.

A non-destructive emergency rollback is to set `STAFF_CONFIRMATION_API_ENABLED=false` and redeploy. This closes public verification/submission and workflow admin routes while preserving all rows and audit history. Do not reverse the additive migration or delete submissions after use begins.

## Manual test plan

1. Create a Staff Join application and record its generated Join reference.
2. Sign in as a super administrator, open the candidate, and select **Invite to Staff confirmation**.
3. Confirm the one-time dialog shows candidate, reference, exact seven-day deadline, private link, and copyable message.
4. Copy the private link and open it in a private/incognito browser.
5. Confirm the fragment disappears immediately and the verified reference and Staff department appear without entering a reference.
6. Confirm a motivation below 150 characters is rejected and focus returns to the textarea.
7. Submit a 150–2000 character motivation and confirm the success state does not promise acceptance.
8. Retry the consumed link and confirm it shows already submitted without revealing the motivation.
9. Confirm exactly one super-admin notification exists and opens the correct Staff dossier.
10. Confirm the queue filters/counts work and version 1 renders as plain text.
11. Request a revision with a clear message and copy the new private link.
12. Confirm the original link is unusable, then open the revision link and confirm the message is visible.
13. Submit revision version 2; confirm versions 1 and 2 both remain visible and only one notification exists for each version.
14. In two admin sessions, load the same dossier; act in one, then confirm the stale action in the other returns a refresh/conflict message.
15. Confirm Staff membership and verify the confirmation is `confirmed`, the original application is `accepted` with `accepted_as=staff`, and the requested Staff department is retained.
16. Confirm the person appears once in the existing Staff directory and no parallel or duplicate member was created.
17. Separately confirm a Member cannot be invited and the existing Member acceptance path still succeeds.
18. Generate another test invitation, regenerate it, and confirm only the newest link works; then revoke it and confirm it fails generically.
19. Test the public page at 375, 430, 768, 1024, and 1440 CSS pixels, including keyboard-only use and reduced motion.

## Operational notes

- Refreshing after the fragment has been cleared intentionally loses the credential; reopen the original private link.
- Bulk invitation is intentionally not part of the first release. Individual generation keeps each one-time private link visible only to the initiating administrator and avoids accidental private-link exports.
- Expiry is computed during reads/actions; no cron job is required for correctness.
