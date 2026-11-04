# Automatic workshop invitation delivery

## Runtime flow

New `member` and `staff` rows in `membership_applications` are handled by a
database trigger in the same transaction as the Join insert. For each eligible
workshop it creates the existing `club_event_invitations` row and one durable
`event_invitation_delivery_jobs` outbox row. The Join request never calls n8n
and does not wait for email delivery.

Eligible means the existing `workshop` event type in one of these active
statuses: `planned`, `registration_open`, `registration_closed`, or `ongoing`.
`registration_closed` is included because the current workshop business rules
explicitly allow invitation links and registration in that state. `draft`,
`completed`, `cancelled`, and `archived` are excluded. Visibility does not
change eligibility in the existing event model.

When a new event is inserted in an eligible state, or changes from an
ineligible to an eligible state, a durable backfill job pages through existing
member/staff applications. The migration deliberately does not seed backfill
or delivery rows for historical data. A super administrator must use **Queue
existing invitations** for historical links that should be sent.

Vercel invokes `/api/event-invitation-worker` every minute. The endpoint accepts
only `GET` with `Authorization: Bearer $CRON_SECRET`. Supabase RPCs claim small
batches with row locks, `SKIP LOCKED`, and expiring leases. Abandoned processing
jobs are reclaimable after the lease expires.

## n8n contract

The worker sends `multipart/form-data` containing exactly:

- `full_name`
- `email`
- `private_registration_link`

It also sends `Idempotency-Key: <delivery-job-uuid>`. If
`N8N_WEBHOOK_SECRET` is configured it sends `Authorization: Bearer <secret>`.
Configure the n8n Webhook node or an early validation step to reject a missing
or incorrect secret. Store processed idempotency keys in durable n8n-accessible
storage before sending email, and return a 2xx response for repeated keys.

Delivery is **at least once**. A request timeout does not prove that n8n failed
to receive the request, so the job is retried with exponential backoff. If the
n8n workflow cannot deduplicate `Idempotency-Key`, duplicate emails are
possible after timeouts or response loss.

Coordinate the recipient duplicate-email policy with the workflow owner. The
website prevents duplicate membership contacts using unique normalized email
and phone indexes, but n8n idempotency is still required for transport retries.

## Secrets and deployment

Set these server-only Vercel variables in Production (and Preview only when a
non-production webhook is available):

- `N8N_REGISTRATION_WEBHOOK_URL`
- `N8N_WEBHOOK_SECRET` (optional but recommended)
- `CRON_SECRET` (at least 32 random characters)
- existing `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `PUBLIC_SITE_ORIGIN`, and
  `WORKSHOP_INVITATION_LINK_SECRET`

Never prefix them with `VITE_`. Do not test against the production webhook.
Apply `20261104130000_automatic_event_invitation_delivery.sql` before deploying
the worker/UI code. Then deploy, verify one synthetic invitation with a staging
n8n workflow, and only then enable the production webhook URL.

## Reliability and data boundaries

The outbox stores invitation/application references, status, attempts, lease
metadata, and bounded error categories. It never stores a raw token or private
URL. The worker derives the existing stable HMAC credential at dispatch time,
checks its hash, and refuses revoked or expired links. Existing active tokens
are reused and never rotated by automatic delivery.

CSV export remains available and `link_exported_at` remains CSV-only. Webhook
delivery state is independent. Tables have RLS enabled, no `anon` or
`authenticated` privileges, and service-role-only RPC access. Manual queue and
retry RPCs independently verify an active `super_admin`, in addition to the
existing authenticated, same-origin admin API checks.
