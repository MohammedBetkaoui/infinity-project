import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const WORKER_ROUTE = '/api/event-invitation-worker'
const WORKER_ACTION = '/api/join?__join_action=event-invitation-worker'
const CRON_JOBNAME = 'infinity-event-invitation-worker'
const CRON_MIGRATION = 'supabase/migrations/20261106120000_supabase_cron_invitation_worker.sql'

test('vercel.json is valid JSON, has no Vercel Cron, and keeps the worker route available', async () => {
  const config = JSON.parse(await read('vercel.json'))
  assert.equal(config.crons, undefined, 'Vercel Cron must be removed: Hobby only allows daily schedules')

  const worker = (config.rewrites || []).find(({ source }) => source === WORKER_ROUTE)
  assert.deepEqual(worker, { source: WORKER_ROUTE, destination: WORKER_ACTION },
    'the worker stays reachable via GET /api/event-invitation-worker')

  // All Join Club / staff / workshop / scanner API routes are preserved.
  const destinations = (config.rewrites || []).map(({ destination }) => destination)
  for (const fragment of [
    'staff-confirmation-verify', 'staff-confirmation-submit', 'workshop-invitation', 'workshop-register',
    'workshop-scanner-session', 'workshop-scanner-context', 'workshop-scanner-check-in',
  ]) {
    assert.ok(destinations.some((entry) => entry.includes(fragment)), `missing rewrite for ${fragment}`)
  }

  // Public pages keep their rewrites.
  const sources = (config.rewrites || []).map(({ source }) => source)
  for (const page of ['/aivex', '/about', '/community', '/contact', '/events', '/join', '/workshops/register', '/workshops/scan', '/admin']) {
    assert.ok(sources.includes(page), `missing page rewrite for ${page}`)
  }

  // Security headers/CSP are untouched.
  const headersJson = JSON.stringify(config.headers || [])
  for (const header of ['X-Frame-Options', 'Strict-Transport-Security', 'Content-Security-Policy', 'Referrer-Policy', 'Permissions-Policy']) {
    assert.ok(headersJson.includes(header), `security header ${header} was removed by mistake`)
  }
})

test('the worker host function declares a duration allowed on Vercel Hobby', async () => {
  const config = JSON.parse(await read('vercel.json'))
  const functions = config.functions || {}
  // The worker executes inside api/join.js through the rewrite above: it needs
  // an explicit duration, and Hobby's maximum is 60 seconds per function.
  assert.ok(functions['api/join.js'], 'api/join.js must declare a maxDuration for the worker lane')
  for (const [name, options] of Object.entries(functions)) {
    const duration = Number(options.maxDuration || 0)
    assert.ok(duration >= 0 && duration <= 60, `${name} exceeds the Vercel Hobby maximum duration`)
  }
  assert.ok(!Object.keys(functions).some((name) => name.includes('event-invitation-worker')),
    'the worker has no dedicated function file; it runs inside api/join.js')
})

test('the Supabase Cron migration prepares pg_cron and pg_net with fail-safe checks', async () => {
  const migration = await read(CRON_MIGRATION)
  assert.match(migration, /create extension if not exists pg_cron/i)
  assert.match(migration, /create extension pg_net with schema extensions/i)
  assert.match(migration, /to_regprocedure\('cron\.schedule\(text, text, text\)'\)/)
  assert.match(migration, /to_regprocedure\('net\.http_get\(text, jsonb, jsonb, integer\)'\)/)
  assert.match(migration, /pg_cron_unavailable/)
  assert.match(migration, /pg_net_unavailable/)
})

test('scheduling is separated from installation and never auto-activates', async () => {
  const migration = await read(CRON_MIGRATION)
  // Only the availability probe (to_regprocedure) and the activation function
  // may mention cron.schedule; the migration body itself never schedules.
  const directCalls = migration.match(/(?<!to_regprocedure\(')cron\.schedule\(/g) || []
  assert.equal(directCalls.length, 1, 'cron.schedule appears only inside the activation function')
  const scheduleAt = migration.indexOf('perform cron.schedule')
  const activationAt = migration.indexOf('create or replace function public.activate_event_invitation_worker_cron')
  assert.ok(activationAt > 0)
  assert.ok(scheduleAt > activationAt, 'the migration body must never schedule the job itself')
  assert.ok(scheduleAt < migration.lastIndexOf('commit;'), 'every object ships inside the migration transaction')
})

test('the trigger runs every minute with one idempotent, non-duplicated job', async () => {
  const migration = await read(CRON_MIGRATION)
  assert.match(migration, /'\* \* \* \* \*'/)
  assert.match(migration, new RegExp(CRON_JOBNAME))
  // Activation removes the canonical job first and refuses stray duplicates.
  assert.match(migration, /perform cron\.unschedule\(j\.jobid\) from cron\.job j where j\.jobname = v_jobname/)
  assert.match(migration, /duplicate_worker_cron_job/)
  assert.match(migration, /double_scheduled_worker_cron/)
})

test('the scheduled command uses pg_net and persists only a request id manifest', async () => {
  const migration = await read(CRON_MIGRATION)
  assert.match(migration, /return net\.http_get\(/)
  assert.match(migration, /insert into public\.event_invitation_worker_cron_requests \(request_id\)/)
  assert.match(migration, /delete from public\.event_invitation_worker_cron_requests/)
  assert.match(migration, /event_invitation_worker_cron_target\(%L\)/)
  // The manifest stays small and is purged each tick by the scheduled command.
  assert.match(migration, /interval %L/)
})

test('the Vault-backed secret is fetched at call time and never hardcoded or exposed', async () => {
  const migration = await read(CRON_MIGRATION)
  assert.match(migration, /infinity_worker_cron_secret/)
  assert.match(migration, /vault\.decrypted_secrets/)
  assert.match(migration, /'Bearer ' \|\| v_secret/)
  assert.match(migration, /worker_cron_secret_not_configured/)
  assert.match(migration, /length\(v_secret\) < 32/)
  // No bearer-shaped literal anywhere: only the runtime concatenation may build the header.
  assert.doesNotMatch(migration, /Bearer ['"]?[A-Za-z0-9+/=_.-]{24,}/)
})

test('status diagnostics never touch the decrypted secret value', async () => {
  const migration = await read(CRON_MIGRATION)
  const start = migration.indexOf('create or replace function public.event_invitation_worker_cron_status')
  const end = migration.indexOf('-- ---------------------------------------------------------------------------', start)
  const statusBody = migration.slice(start, end)
  assert.ok(start > 0 && end > start, 'status function section not found')
  assert.match(statusBody, /public\.event_invitation_worker_cron_secret_ok\(\)/)
  assert.doesNotMatch(statusBody, /decrypted_secret/)
})

test('activation is explicit, origin-validated, and requires the Vault secret first', async () => {
  const migration = await read(CRON_MIGRATION)
  assert.match(migration, /https:\/\/www\.infinty-bba\.com/)
  // Only https origins with the fixed worker path are accepted (default falls back to production).
  assert.match(migration, /\^https:\/\/\[a-z0-9\.\-\]\+\(\:\[0-9\]\{2,5\}\)\?\$/)
  assert.match(migration, /api\/event-invitation-worker\$/)
  assert.match(migration, /invalid_worker_origin/)
})

test('deactivation is available and keeps delivery data untouched', async () => {
  const migration = await read(CRON_MIGRATION)
  assert.match(migration, /create or replace function public\.deactivate_event_invitation_worker_cron/i)
  assert.match(migration, /select public\.deactivate_event_invitation_worker_cron/)
  // No destructive change on the invitation outbox: it is only read for diagnostics.
  assert.doesNotMatch(migration, /drop table if exists public\.event_invitation_delivery_jobs/i)
  assert.doesNotMatch(migration, /alter table public\.event_invitation_delivery_jobs/i)
  assert.doesNotMatch(migration, /delete from public\.event_invitation_delivery_jobs/i)
})

test('operator diagnostics expose cron state, HTTP outcomes, and the delivery queue without PII', async () => {
  const migration = await read(CRON_MIGRATION)
  assert.match(migration, /create or replace function public\.event_invitation_worker_cron_status/i)
  assert.match(migration, /create or replace function public\.event_invitation_worker_cron_http_status/i)
  assert.match(migration, /create or replace function public\.event_invitation_worker_cron_queue_status/i)
  assert.match(migration, /cron\.job_run_details/)
  assert.match(migration, /net\._http_response/)
  assert.match(migration, /processing_lease_expired/)
  assert.match(migration, /oldest_due_at/)
})

test('cron objects follow the repository privilege pattern: no public/anon/authenticated access', async () => {
  const migration = await read(CRON_MIGRATION)
  assert.match(migration, /alter table public\.event_invitation_worker_cron_requests enable row level security/i)
  assert.match(migration, /revoke all on table public\.event_invitation_worker_cron_requests from public, anon, authenticated/i)
  for (const fn of [
    'event_invitation_worker_cron_target',
    'activate_event_invitation_worker_cron',
    'deactivate_event_invitation_worker_cron',
    'event_invitation_worker_cron_status',
    'event_invitation_worker_cron_queue_status',
    'event_invitation_worker_cron_http_status',
    'event_invitation_worker_cron_http_count',
    'event_invitation_worker_cron_secret_ok',
  ]) {
    assert.match(migration, new RegExp(`revoke execute on function public\\.${fn}\\(?[^;]*? from public, anon, authenticated`, 'i'))
  }
  assert.match(migration, /grant execute on function public\.event_invitation_worker_cron_target\(text\) to postgres/)
  // service_role keeps diagnostics only: it can never trigger nor reschedule.
  assert.doesNotMatch(migration, /grant execute on function public\.event_invitation_worker_cron_target\(text\) to postgres, service_role/)
  assert.match(migration, /grant execute on function public\.event_invitation_worker_cron_status\(\) to postgres, service_role/)
})

test('the deployment needs the documented Vault secret and CRON_SECRET variables', async () => {
  const envExample = await read('.env.example')
  assert.match(envExample, /^CRON_SECRET=$/m)
  assert.match(envExample, /N8N_REGISTRATION_WEBHOOK_URL=/)
  assert.match(envExample, /N8N_WEBHOOK_SECRET=/)
  assert.match(envExample, /WORKSHOP_INVITATION_LINK_SECRET=/)
  assert.match(envExample, /PUBLIC_SITE_ORIGIN=/)
  assert.match(envExample, /SUPABASE_URL=/)
  assert.match(envExample, /SUPABASE_SECRET_KEY=/)
})

test('documentation covers the Supabase Cron switch, activation, and rollback', async () => {
  const docs = await read('docs/EVENT_INVITATION_AUTOMATION.md')
  for (const needle of [
    'Supabase Cron', 'infinity_worker_cron_secret', 'activate_event_invitation_worker_cron',
    'deactivate_event_invitation_worker_cron', 'event_invitation_worker_cron_status',
    'net._http_response', 'at least once',
  ]) {
    assert.ok(docs.includes(needle), `docs must cover ${needle}`)
  }
  assert.doesNotMatch(docs, /every minute\. The endpoint accepts only GET with Authorization: Bearer \$CRON_SECRET/, 'stale Vercel Cron wording removed')
})

test('plpgsql bodies use only declared identifiers (regression: 42601 loop variable, undeclared jobname)', async () => {
  const migration = await read(CRON_MIGRATION)

  // The deactivate row loop must declare its loop variable — Postgres rejects
  // `for j in select ...` with an undeclared scalar (error 42601).
  assert.match(migration, /for v_job_id in select c\.jobid from cron\.job c where c\.jobname = v_jobname loop/)
  assert.match(migration, /v_job_id bigint;/)
  assert.doesNotMatch(migration, /for j in select/, 'no undeclared loop variable of the kind Postgres rejected')

  // jsonb_build_object keys must reference the declared local, never the bare
  // column name — bare `jobname` aborts activation and diagnostics at runtime.
  const bare = migration.match(/'jobname', jobname\b/g) || []
  assert.equal(bare.length, 0, 'bare jobname identifier used instead of v_jobname')
  const paired = migration.match(/'jobname', v_jobname/g) || []
  assert.ok(paired.length >= 3, "activate + both status branches return the declared v_jobname")
})
