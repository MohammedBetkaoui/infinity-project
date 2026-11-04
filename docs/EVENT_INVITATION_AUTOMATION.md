# Automatic workshop invitation delivery

This document describes the durable invitation pipeline and its scheduler.
The scheduler moved from **Vercel Cron to Supabase Cron** on 2026-11 because
Vercel Hobby deployments only accept daily cron expressions while the club
needs a one-minute trigger. Nothing else changed: the database remains
responsible for eligibility, the invitation outbox and recovery; Vercel keeps
hosting the worker function; n8n still sends the emails.

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

## Architecture

Previous architecture (until 2026-11-05):

```text
Supabase PostgreSQL
        |
        v
event_invitation_delivery_jobs (outbox)
        |
        v
Vercel Cron ("* * * * *")
        |
        v
Vercel Invitation Worker (GET /api/event-invitation-worker)
        |
        v
n8n Webhook
        |
        v
Student email
```

Current architecture:

```text
Supabase PostgreSQL
        |                      (ownership: events, invitations, outbox)
        v
pg_cron schedule "infinity-event-invitation-worker" (* * * * *)
        |
        v
public.event_invitation_worker_cron_target()   <- secret read at call time
        |                                         from Supabase Vault
        v
pg_net HTTP GET + Bearer <CRON_SECRET from Vault>
        |
        v
Vercel Invitation Worker (GET /api/event-invitation-worker)
        |
        v
Supabase RPC atomic claim (FOR UPDATE SKIP LOCKED + lease token)
        |
        v
private registration link (stable HMAC credential, hash stored only)
        |
        v
n8n Webhook (multipart/form-data + Idempotency-Key)
        |
        v
Student email
```

### Why Vercel Cron was removed

Vercel Hobby allows only `0 0 * * *`-style daily cron expressions for any
cron entry that exists in `vercel.json`; `* * * * *` can block or break the
deployment of the whole project. Slowing the worker to once a day was not an
option for an invitation pipeline, so the trigger moved into Supabase.

### Why Supabase Cron

- It lives inside the same PostgreSQL instance that owns the outbox, so the
  trigger needs no extra service and no extra subscription.
- `pg_cron` supports `* * * * *` (one-minute) schedules.
- `pg_net` performs the asynchronous HTTP call without holding a connection.
- Supabase Vault stores the bearer token encrypted at rest; the scheduled SQL
  never embeds it.
- Run history (`cron.job_run_details`) and the delivery queue can be inspected
  from the same place.

## 1. Preparing the extensions

Supabase ships the binaries; enable them on the production project (Dashboard
> Database > Extensions, or the SQL editor):

```sql
create extension if not exists pg_cron;
create schema if not exists extensions;
create extension pg_net with schema extensions; -- skipped if already installed
```

Then apply the migration (Supabase Dashboard > SQL editor, or the CLI against
the staging branch first):

- `supabase/migrations/20261104130000_automatic_event_invitation_delivery.sql`
  (the outbox, triggers and worker RPCs — must already be applied)
- `supabase/migrations/20261106120000_supabase_cron_invitation_worker.sql`
  (the pg_cron/pg_net preparation, activation/deactivation functions and the
  durable request manifest)

The second migration prepares objects only. It never schedules anything by
itself, and it fails with a named error if `pg_cron` or `pg_net` is missing
(`pg_cron_unavailable`, `pg_net_unavailable`,
`pg_cron_schedule_not_available`, `pg_net_http_get_not_available`).

## 2. Configuring Supabase Vault

The worker endpoint accepts `GET` with `Authorization: Bearer CRON_SECRET`
where `CRON_SECRET` is the server-side Vercel variable. The **same value**
must be stored in Supabase Vault under the name
`infinity_worker_cron_secret`. Insert it through the SQL editor (never commit
the value; never log it):

```sql
-- 1) Generate the secret OUTSIDE the repository (trusted machine):
--    node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
-- 2) Put the same value in Vercel env var CRON_SECRET (Production).
-- 3) Store it in Vault (replace <value> when pasting in the SQL editor):
select vault.create_secret(
  '<value>',
  'infinity_worker_cron_secret',
  'Bearer token for GET /api/event-invitation-worker; equals Vercel CRON_SECRET.'
);
-- Rotation: create a new value, update Vercel, then
-- select vault.update_secret('<uuid of the previous entry>', '<new value>');
```

The migration's helper `public.event_invitation_worker_cron_secret_ok()`
returns whether the entry exists and is at least 32 characters. It returns a
boolean only: the value is never selected by any caller-facing function.
Verify the instance keeps the Vault private:

```sql
-- On Supabase, anon/authenticated must not reach the vault:
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'vault';
```

`anon` and `authenticated` must be absent from the result. Only `postgres`
(and the extension owner) should hold grants there.

## 3. Runtime variables (Vercel, server only)

| Variable | Role |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | service-role access from the worker |
| `PUBLIC_SITE_ORIGIN` | canonical https origin inside private links |
| `WORKSHOP_INVITATION_LINK_SECRET` | stable HMAC credentials (>= 32 bytes) |
| `N8N_REGISTRATION_WEBHOOK_URL` | n8n webhook (https, server-side only) |
| `N8N_WEBHOOK_SECRET` | optional shared Bearer secret validated by n8n |
| `CRON_SECRET` | Bearer token required by the worker (>= 32 chars) |

Never prefix them with `VITE_`, never return them from an API, and never put
real values in the repository.

## 4. Activation, deactivation, verification

Activation is manual and explicit (production defaults to
`https://www.infinty-bba.com/api/event-invitation-worker`; a staging origin
may be passed for a controlled test):

```sql
-- Whitelist the transaction-level schedule and activate:
select public.activate_event_invitation_worker_cron();
-- Optional staging trigger (https only, same worker path):
select public.activate_event_invitation_worker_cron('https://project-preview.vercel.app');
```

Activation refuses to run without the Vault secret
(`worker_cron_secret_not_configured`), refuses a second scheduling of the
trigger (`duplicate_worker_cron_job` for stray jobs, `double_scheduled_worker_cron`
after scheduling), and always replaces the previous scheduling of the canonical
job name `infinity-event-invitation-worker`, so re-running is safe.

Pause (keeps the queue, invitations and student data intact; the worker can
still be fired manually with a valid Bearer token):

```sql
select public.deactivate_event_invitation_worker_cron(); -- returns removed count
```

Verification helpers:

```sql
-- Full report (job state, last runs, HTTP outcomes, delivery queue):
select public.event_invitation_worker_cron_status();
-- The scheduled SQL text must contain no secret:
select jobname, schedule, command from cron.job
 where jobname = 'infinity-event-invitation-worker';
```

The scheduled command persisted in `cron.job` is:

```sql
delete from public.event_invitation_worker_cron_requests
 where created_at < now() - interval '24 hours';
insert into public.event_invitation_worker_cron_requests (request_id)
select public.event_invitation_worker_cron_target('<origin>');
```

It contains no secret: the token is read from Vault inside the target function
at call time. The manifest table stores only the pg_net request id and a
timestamp, enabling exact attribution of HTTP responses.

## 5. Identifying errors

`public.event_invitation_worker_cron_status()` aggregates (never emails,
names, tokens or links):

- `cron`: whether the job exists, its schedule and `active` state.
- `runs`: the last 10 cron runs (`start_time`, `status`, `request_id`).
- `run_stats_24h`: total and failed runs over 24 hours.
- `http`: last-24h outcomes attributed through the manifest — `ok_24h`,
  `refused_24h` (4xx), `server_error_24h` (5xx), `timed_out_24h`,
  `transport_error_24h`, `unresolved_24h`, and the latest single response
  (status code, timed_out, transport `error_msg` truncated to 200 chars).
- `queue`: delivery outbox counts by status, oldest due job, and the number of
  `processing` jobs whose lease expired (stalled but recoverable).
- `secret_configured`: boolean for the Vault entry.

Scenario guide:

| Symptom | Meaning | Action |
| --- | --- | --- |
| `http.ok_24h` grows, `queue.pending` drains | normal | none |
| `http.refused_24h > 0` | Worker answered 401: Vault secret differs from Vercel `CRON_SECRET`, or the env var is missing | compare lengths/prefixes without printing; rotate both values together |
| `http.server_error_24h > 0` or `run_stats_24h.failed` | Worker answered 503 (configuration/Supabase unreachable) or crashed | check Vercel logs (error codes only), then queue status; jobs stay claimable |
| `timed_out_24h` / `transport_error_24h` | pg_net gave up waiting; the invocation may still have completed | rely on `queue` and per-job states, not on `net._http_response` alone |
| no responses at all, `cron.runs` shows SQL errors | Vault removed or target function error | re-create the Vault entry; inspect `cron.job_run_details.return_message` |
| `cron.job_exists = false` | never activated or unscheduled | run the activation call |
| `queue.processing_lease_expired > 0` | stalled in-flight jobs (crashed invocation) | they are reclaimed automatically after the 90 s lease; do not edit rows by hand |

Detailed transport table (optional, runs inside the SQL editor):

```sql
select n.created, n.status_code, n.timed_out, left(coalesce(n.error_msg, ''), 200)
  from net._http_response n
  join public.event_invitation_worker_cron_requests r on r.request_id = n.id
 order by n.created desc
 limit 20;
```

pg_net keeps responses for 6 hours on unlogged tables: missing rows are
diagnostic noise, never proof of failure — the delivery queue is the truth.

## 6. Worker tuning on Vercel Hobby

The worker runs inside `api/join.js` (`maxDuration: 60` — the Hobby maximum).
One invocation is bounded by an explicit time budget:

| Limit | Value |
| --- | --- |
| Delivery batch per invocation | 8 jobs |
| Concurrent webhook lanes | 3 |
| Backfill claims per invocation | 2 pages (`BACKFILL_PAGE_SIZE 200`) |
| Delivery/backfill lease | 90 s (claim SQL bounds: 15..240) |
| Webhook timeout | 8 s (`N8N_WEBHOOK_TIMEOUT_MS`) |
| Invocation time budget | 40 s (`EVENT_INVITATION_WORKER_LIMITS.invocationTimeBudgetMs`) |
| Budget gate before starting one more job | webhook timeout + 4 s |

Worst case per invocation: claim + 8 prepare RPCs (~1.2 s) + 3 waves x 8 s
timeouts + 8 finish RPCs ≈ 28-30 s < 40 s budget < 60 s max duration < 90 s
lease < 60 s tick interval (minute). Jobs skipped when the budget runs out
keep their processing lease and are claimed again atomically later, so no job
is lost; the budget alone can never starve the queue because each minute
starts fresh.

Concurrent workers (Cron overlap, manual runs, admin-triggered runs) claim
disjoint rows through `FOR UPDATE SKIP LOCKED` with a unique lease token and
expiring leases; abandoned jobs are reclaimed when `lease_expires_at` passes.
Delivery stays **at least once**: a timeout does not prove n8n failed, so the
job is retried with exponential backoff (30·2^(n-1) seconds, capped at 6 h,
max 8 attempts). An unexpected dispatcher crash is converted to a bounded
retryable failure instead of aborting the whole claim.

## 7. n8n contract and duplication safety

The worker posts `multipart/form-data` with exactly:

- `full_name`
- `email`
- `private_registration_link` (`https://<origin>/workshops/register?t=<token>`)

Headers: `Idempotency-Key: <delivery job uuid>` and, when configured,
`Authorization: Bearer N8N_WEBHOOK_SECRET`. Transport retries keep the same
key, so the workflow must durably store every used `Idempotency-Key` BEFORE
sending the email and answer 2xx for repeats. The website cannot verify the
workflow's behavior: **n8n-side deduplication remains an external
dependency** — coordinate it with whoever owns the workflow. The outbox never
stores raw tokens or private URLs; only HMAC hashes and versions persist in
the database.

## 8. Reliability and data boundaries

The outbox stores invitation/application references, status, attempts, lease
metadata, and bounded error categories. It never stores a raw token or
private URL. The worker derives the existing stable HMAC credential at
dispatch time, checks its hash, and refuses revoked or expired links. Existing
active tokens are reused and never rotated by automatic delivery.

CSV export remains available and `link_exported_at` remains CSV-only. Webhook
delivery state is independent. Both delivery tables have RLS enabled, no
`anon` or `authenticated` privileges, and service-role-only RPC access.
Manual queue and retry RPCs independently verify an active `super_admin`, in
addition to the authenticated, same-origin admin API checks. The Admin
Dashboard keeps reading live counts (pending/processing/delivered/failed/
retry scheduled) and the **Retry failed deliveries** and **Queue existing
invitations** actions; the scheduler choice does not change them.

Server logs are limited to fixed categories and counts (for example
`execution_status`, `duration_ms`, `claimed_jobs`, `delivered_jobs`,
`retry_scheduled`, `failed_jobs`, `budget_skipped`, `error_code`); they never
contain a name, email, token, private link or secret.

## 9. Suspending and rolling back

- Suspend the automation only: `select public.deactivate_event_invitation_worker_cron();`
  (jobs stay queued; nothing is deleted) — or flip the same job to `active=false`
  through the Dashboard cron interface.
- Suspend delivery entirely without touching the scheduler: keep the cron but
  rely on the Vault state — moving the secret out of Vault makes every trigger
  fail closed (`worker_cron_secret_not_configured`). Restore it to resume.
- Full rollback of the scheduler: deactivate, then drop the cron objects with
  the rollback block in
  `supabase/migrations/20261106120000_supabase_cron_invitation_worker.sql`,
  and (only if needed) restore the previous `vercel.json` crons — accepting
  Hobby's daily limitation or moving to a paid plan.

No destructive migration exists for this feature: invitations, delivery jobs,
student data and CSV history survive any rollback.

## 10. Plan limitations worth knowing

- **Vercel Hobby**: cron CRUD is limited to daily expressions; functions max
  duration is 60 s (`api/join.js` now declares exactly that for the worker
  lane); a failed monitoring window also never restarts a batch.
- **Supabase Cron/pg_cron**: one-minute is the minimum granular cron interval
  (seconds expressions also exist but are unnecessary here); job runs are
  retained approximately 7 days in `cron.job_run_details`; a run has no
  "overlap lock", overlap safety comes from the outbox leases; the
  recommendation is to keep only a few concurrent jobs.
- **pg_net**: responses live 6 hours in unlogged `net._http_response` tables
  (lost on crash by design, never treated as delivery proof); it targets
  about 200 requests/second per instance — the club sends one request per
  minute, far below that ceiling; requests are fire-and-forget.
- The trigger measures only SQL time; HTTP outcomes are diagnostics
  (`event_invitation_worker_cron_status().http`); the delivery truth stays in
  `event_invitation_delivery_jobs`.
