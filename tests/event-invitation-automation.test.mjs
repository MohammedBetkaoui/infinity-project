import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createAdminEventsService } from '../api/_lib/admin-events.js'
import { createEventInvitationDeliveryService, EVENT_INVITATION_WORKER_LIMITS } from '../api/_lib/event-invitation-delivery.js'
import { createN8nRegistrationDispatcher, N8N_WEBHOOK_TIMEOUT_MS } from '../api/_lib/event-invitation-webhook.js'
import { prepareStableWorkshopCredential } from '../api/_lib/workshop-tokens.js'
import { createEventInvitationWorkerHandler } from '../api/_lib/event-invitation-worker.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const SECRET = 'correct-horse-battery-staple-workshop-secret-2026'
const ENV = { WORKSHOP_INVITATION_LINK_SECRET: SECRET }
const ORIGIN = 'https://www.infinty-bba.com'
const NOW = new Date('2026-11-04T10:00:00.000Z')
const JOB_ID = '11111111-1111-4111-8111-111111111111'
const EVENT_ID = '22222222-2222-4222-8222-222222222222'
const INVITATION_ID = '33333333-3333-4333-8333-333333333333'
const APPLICATION_ID = '44444444-4444-4444-8444-444444444444'
const LEASE_ID = '55555555-5555-4555-8555-555555555555'

const deliveryJob = (changes = {}) => ({
  job_id: JOB_ID, event_id: EVENT_ID, invitation_id: INVITATION_ID,
  membership_application_id: APPLICATION_ID, full_name: 'Amel Benali',
  email: 'amel@example.invalid', invitation_status: 'invited', token_hash: null,
  expires_at: null, revoked_at: null, credential_version: null, derivation_version: null,
  event_starts_at: '2026-11-05T09:00:00.000Z', event_ends_at: '2026-11-05T12:00:00.000Z',
  attempt_count: 1, ...changes,
})

class DeliveryStore {
  constructor(jobs = [deliveryJob()]) { this.jobs = jobs; this.finished = []; this.backfills = [] }
  async claimDeliveries() { return this.jobs }
  async ensureInvitationLink(input) {
    const credential = prepareStableWorkshopCredential({
      purpose: 'invitation', subjectId: this.jobs.find((job) => job.job_id === input.jobId).invitation_id,
      credentialVersion: 1, env: ENV,
    })
    return {
      invitation_id: INVITATION_ID, token_hash: credential.tokenHash,
      expires_at: input.expiresAt.toISOString(), revoked_at: null,
      credential_version: 1, derivation_version: 1,
    }
  }
  async finishDelivery(input) {
    this.finished.push(input)
    return input.succeeded ? 'delivered' : (input.retryable ? 'retry_scheduled' : 'failed')
  }
  async claimBackfills() { return this.backfills }
  async processBackfillPage() { return { processed: 200, added: 198, queued: 200, completed: false } }
  async releaseBackfill() { return true }
}

test('n8n success uses multipart with exactly the three contract fields and server-only headers', async () => {
  let captured
  const dispatcher = createN8nRegistrationDispatcher({
    env: { N8N_REGISTRATION_WEBHOOK_URL: 'https://n8n.example.invalid/webhook/test', N8N_WEBHOOK_SECRET: 'shared-secret' },
    fetchImpl: async (url, init) => { captured = { url, init }; return new Response(null, { status: 204 }) },
  })
  const result = await dispatcher.dispatch({
    jobId: JOB_ID, fullName: 'Amel Benali', email: 'amel@example.invalid',
    privateRegistrationLink: `${ORIGIN}/workshops/register?t=private-token`,
  })
  assert.deepEqual(result, { ok: true })
  assert.equal(captured.url, 'https://n8n.example.invalid/webhook/test')
  assert.equal(captured.init.method, 'POST')
  assert.equal(captured.init.headers.Authorization, 'Bearer shared-secret')
  assert.equal(captured.init.headers['Idempotency-Key'], JOB_ID)
  assert.deepEqual([...captured.init.body.keys()], ['full_name', 'email', 'private_registration_link'])
  assert.equal(captured.init.body.get('full_name'), 'Amel Benali')
})

test('n8n timeout is retryable because receipt is ambiguous', async () => {
  const dispatcher = createN8nRegistrationDispatcher({
    env: { N8N_REGISTRATION_WEBHOOK_URL: 'https://n8n.example.invalid/webhook/test' },
    timeoutMs: 15,
    fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
    }),
  })
  assert.deepEqual(await dispatcher.dispatch({
    jobId: JOB_ID, fullName: 'A', email: 'a@example.invalid', privateRegistrationLink: 'https://example.invalid/private',
  }), { ok: false, errorCode: 'timeout', retryable: true })
})

test('n8n HTTP 500 is a bounded retryable error without reading or logging its body', async () => {
  const dispatcher = createN8nRegistrationDispatcher({
    env: { N8N_REGISTRATION_WEBHOOK_URL: 'https://n8n.example.invalid/webhook/test' },
    fetchImpl: async () => new Response('contains-secret-data', { status: 500 }),
  })
  assert.deepEqual(await dispatcher.dispatch({
    jobId: JOB_ID, fullName: 'A', email: 'a@example.invalid', privateRegistrationLink: 'https://example.invalid/private',
  }), { ok: false, errorCode: 'http_500', retryable: true })
})

test('automatic delivery creates missing stable links and reuses existing invitation credentials', async () => {
  const existing = prepareStableWorkshopCredential({ purpose: 'invitation', subjectId: INVITATION_ID, credentialVersion: 1, env: ENV })
  const store = new DeliveryStore([deliveryJob({ token_hash: existing.tokenHash, credential_version: 1, derivation_version: 1 })])
  const sent = []
  store.ensureInvitationLink = async () => ({
    invitation_id: INVITATION_ID, token_hash: existing.tokenHash, expires_at: '2026-11-06T12:00:00.000Z',
    revoked_at: null, credential_version: 1, derivation_version: 1,
  })
  const service = createEventInvitationDeliveryService({
    store, dispatcher: { dispatch: async (payload) => { sent.push(payload); return { ok: true } } },
    origin: ORIGIN, env: ENV, now: () => NOW, randomUuid: () => LEASE_ID,
  })
  assert.deepEqual(await service.processDeliveries(), { claimed: 1, delivered: 1, retryScheduled: 0, failed: 0 })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].privateRegistrationLink, `${ORIGIN}/workshops/register?t=${existing.rawToken}`)
  assert.equal(store.finished[0].succeeded, true)
})

test('multiple eligible event jobs are each dispatched and no eligible jobs is a no-op', async () => {
  const secondInvitation = '66666666-6666-4666-8666-666666666666'
  const jobs = [deliveryJob(), deliveryJob({
    job_id: '77777777-7777-4777-8777-777777777777',
    invitation_id: secondInvitation, event_id: '88888888-8888-4888-8888-888888888888',
  })]
  const store = new DeliveryStore(jobs)
  store.ensureInvitationLink = async ({ jobId, expiresAt }) => {
    const invitationId = jobs.find((job) => job.job_id === jobId).invitation_id
    const credential = prepareStableWorkshopCredential({ purpose: 'invitation', subjectId: invitationId, credentialVersion: 1, env: ENV })
    return { token_hash: credential.tokenHash, expires_at: expiresAt.toISOString(), revoked_at: null, credential_version: 1, derivation_version: 1 }
  }
  const service = createEventInvitationDeliveryService({
    store, dispatcher: { dispatch: async () => ({ ok: true }) }, origin: ORIGIN, env: ENV,
    now: () => NOW, randomUuid: () => LEASE_ID,
  })
  assert.equal((await service.processDeliveries()).delivered, 2)
  store.jobs = []
  assert.deepEqual(await service.processDeliveries(), { claimed: 0, delivered: 0, retryScheduled: 0, failed: 0 })
})

test('webhook failures schedule retry while revoked or expired preparation fails terminally', async () => {
  const retryStore = new DeliveryStore()
  const retryService = createEventInvitationDeliveryService({
    store: retryStore, dispatcher: { dispatch: async () => ({ ok: false, errorCode: 'http_500', retryable: true }) },
    origin: ORIGIN, env: ENV, now: () => NOW, randomUuid: () => LEASE_ID,
  })
  assert.equal((await retryService.processDeliveries()).retryScheduled, 1)
  assert.equal(retryStore.finished[0].errorCode, 'http_500')

  for (const databaseMessage of ['invitation_link_revoked', 'invitation_link_expired']) {
    const store = new DeliveryStore()
    store.ensureInvitationLink = async () => { throw Object.assign(new Error('prepare failed'), { databaseMessage }) }
    const service = createEventInvitationDeliveryService({
      store, dispatcher: { dispatch: async () => { throw new Error('must not dispatch') } },
      origin: ORIGIN, env: ENV, now: () => NOW, randomUuid: () => LEASE_ID,
    })
    assert.equal((await service.processDeliveries()).failed, 1)
    assert.equal(store.finished[0].retryable, false)
  }
})

test('existing-student backfill is paginated and records only aggregate results', async () => {
  const store = new DeliveryStore([])
  store.backfills = [{ job_id: JOB_ID, event_id: EVENT_ID }]
  const service = createEventInvitationDeliveryService({
    store, dispatcher: { dispatch: async () => ({ ok: true }) }, origin: ORIGIN, env: ENV,
    now: () => NOW, randomUuid: () => LEASE_ID,
  })
  assert.deepEqual(await service.processBackfills(), {
    claimed: 1, processed: 200, invitationsAdded: 198, deliveriesQueued: 200, failed: 0,
  })
})

test('automatic eligibility is global, has no per-event toggle, and excludes inactive statuses', async () => {
  const migration = await read('supabase/migrations/20261104130000_automatic_event_invitation_delivery.sql')
  assert.match(migration, /p_status in \('planned', 'registration_open', 'registration_closed', 'ongoing'\)/)
  assert.doesNotMatch(migration, /add\s+column[^;]*auto_invite_new_members|auto_invite_new_members\s+boolean/i)
  for (const status of ['draft', 'completed', 'cancelled', 'archived']) {
    assert.doesNotMatch(migration, new RegExp(`p_status in \\([^)]*'${status}'`))
  }
  assert.match(migration, /membership_application_auto_event_invitations/)
  assert.match(migration, /club_event_invitation_backfill_after_eligibility_change/)
})

test('outbox SQL is idempotent, lease-safe, recoverable, private, and independent from CSV state', async () => {
  const migration = await read('supabase/migrations/20261104130000_automatic_event_invitation_delivery.sql')
  assert.match(migration, /unique \(invitation_id, delivery_purpose\)/i)
  assert.match(migration, /for update skip locked/i)
  assert.match(migration, /lease_expires_at <= changed_at/i)
  assert.match(migration, /retry_scheduled/)
  assert.match(migration, /power\(2, greatest\(0, job_row\.attempt_count - 1\)\)/)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /from public, anon, authenticated/i)
  assert.match(migration, /to service_role/i)
  assert.doesNotMatch(migration, /private_registration_link\s+text/i)
  assert.doesNotMatch(migration, /set\s+link_exported_at/i)
})

test('concurrent workers use disjoint atomic claims and abandoned leases are recoverable', async () => {
  const migration = await read('supabase/migrations/20261104130000_automatic_event_invitation_delivery.sql')
  const claim = migration.slice(
    migration.indexOf('create or replace function public.worker_claim_event_invitation_deliveries'),
    migration.indexOf('create or replace function public.worker_ensure_event_invitation_link'),
  )
  assert.match(claim, /delivery_status = 'processing'/)
  assert.match(claim, /attempt_count = job\.attempt_count \+ 1/)
  assert.match(claim, /candidate\.delivery_status = 'processing' and candidate\.lease_expires_at <= changed_at/)
  assert.match(claim, /last_error_code = 'max_attempts_exhausted'/)
  assert.match(claim, /for update skip locked/)
})

test('historical queue/retry actions reject non-super-admin callers before touching storage', async () => {
  const service = createAdminEventsService({ store: {}, now: () => NOW, origin: ORIGIN, env: ENV })
  const lowerRole = { id: APPLICATION_ID, role: 'admin' }
  assert.equal((await service.queueExistingDeliveries(EVENT_ID, lowerRole)).status, 403)
  assert.equal((await service.retryDeliveries(EVENT_ID, lowerRole)).status, 403)
})

test('authorized historical queue and failed retry use the authenticated administrator id', async () => {
  const calls = []
  const store = {
    queueExistingInvitationDeliveries: async (input) => { calls.push(['queue', input]); return 3 },
    retryInvitationDeliveries: async (input) => { calls.push(['retry', input]); return 2 },
  }
  const service = createAdminEventsService({ store, now: () => NOW, origin: ORIGIN, env: ENV })
  const admin = { id: APPLICATION_ID, role: 'super_admin' }
  assert.deepEqual(await service.queueExistingDeliveries(EVENT_ID, admin), { ok: true, queued: 3 })
  assert.deepEqual(await service.retryDeliveries(EVENT_ID, admin), { ok: true, retried: 2 })
  assert.equal(calls[0][1].adminUserId, APPLICATION_ID)
  assert.equal(calls[1][1].adminUserId, APPLICATION_ID)
})

test('worker endpoint requires a long server secret and leaks no credential details', async () => {
  const handler = createEventInvitationWorkerHandler({ env: { CRON_SECRET: 'x'.repeat(32) } })
  const logs = []
  const original = console.error
  console.error = (...args) => logs.push(args.join(' '))
  try {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v }, end(value) { this.body = JSON.parse(value) } }
    await handler({ method: 'GET', headers: { authorization: 'Bearer wrong-secret' } }, res)
    assert.equal(res.statusCode, 401)
    assert.doesNotMatch(JSON.stringify(res.body), /SUPABASE|N8N|token|private|email/i)
    assert.equal(logs.length, 0)
  } finally { console.error = original }
})

test('worker endpoint answers 405 with an Allow GET hint and never touches secrets', async () => {
  const handler = createEventInvitationWorkerHandler({ env: { CRON_SECRET: 'x'.repeat(32) } })
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v }, end(value) { this.body = JSON.parse(value) } }
  await handler({ method: 'POST', headers: { authorization: `Bearer ${'x'.repeat(32)}` } }, res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.Allow, 'GET')
  assert.equal(res.body.success, false)
})

test('worker safety limits keep one invocation inside the Vercel Hobby duration, the lease, and the minute', () => {
  const {
    deliveryBatchSize, deliveryConcurrency, backfillBatchSize, backfillPageSize,
    leaseSeconds, invocationTimeBudgetMs, deliveryMinReserveMs, backfillMinReserveMs,
  } = EVENT_INVITATION_WORKER_LIMITS
  // Bounded batches: 8 deliveries over 3 lanes stay far below the historical
  // 25-delivery sequential batch that could run for ~200 s.
  assert.equal(deliveryBatchSize, 8)
  assert.equal(deliveryConcurrency, 3)
  assert.equal(backfillBatchSize, 2)
  assert.equal(backfillPageSize, 200)
  // SQL claim functions accept leases between 15 and 240 seconds.
  assert.ok(leaseSeconds >= 15 && leaseSeconds <= 240)
  // Worst case: ceil(8/3) waves x webhook timeout + SQL margin fits the budget,
  // the budget fits the lease, and everything fits the 60 s Hobby function cap.
  const waves = Math.ceil(deliveryBatchSize / deliveryConcurrency)
  assert.equal(waves, 3)
  assert.ok(waves * N8N_WEBHOOK_TIMEOUT_MS + 6_000 <= invocationTimeBudgetMs)
  assert.ok(invocationTimeBudgetMs < leaseSeconds * 1000)
  assert.ok(invocationTimeBudgetMs < 60_000)
  assert.equal(deliveryMinReserveMs, N8N_WEBHOOK_TIMEOUT_MS + 4_000)
  assert.ok(backfillMinReserveMs > 0 && backfillMinReserveMs < invocationTimeBudgetMs)
})

test('deliveries run with bounded concurrency and hand the durable lease to the store', async () => {
  const jobs = [deliveryJob(), deliveryJob({
    job_id: '77777777-7777-4777-8777-777777777777',
    invitation_id: '66666666-6666-4666-8666-666666666666',
  }), deliveryJob({
    job_id: '99999999-9999-4999-8999-999999999999',
    invitation_id: 'aaaaaaa1-1111-4111-8111-111111111111',
  })]
  const store = new DeliveryStore(jobs)
  const claimArgs = {}
  store.claimDeliveries = async (input) => { Object.assign(claimArgs, input); return store.jobs }
  let inflight = 0
  let maxInflight = 0
  const gates = []
  const dispatcher = { dispatch: async () => {
    inflight += 1
    maxInflight = Math.max(maxInflight, inflight)
    if (inflight < 3) await new Promise((release) => gates.push(release))
    else while (gates.length) gates.pop()()
    inflight -= 1
    return { ok: true }
  } }
  const service = createEventInvitationDeliveryService({
    store, dispatcher, origin: ORIGIN, env: ENV, now: () => NOW, randomUuid: () => LEASE_ID,
  })
  const summary = await service.processDeliveries()
  assert.equal(summary.delivered, 3)
  assert.equal(maxInflight, 3, 'dispatch stays bounded to the configured concurrent lanes')
  assert.equal(claimArgs.leaseSeconds, EVENT_INVITATION_WORKER_LIMITS.leaseSeconds)
  assert.equal(claimArgs.limit, EVENT_INVITATION_WORKER_LIMITS.deliveryBatchSize)
  assert.equal(store.finished.length, 3)
})

test('the invocation budget stops dispatching mid-batch and leaves skipped jobs to lease recovery', async () => {
  const jobs = [deliveryJob(), deliveryJob(), deliveryJob(), deliveryJob()]
  const store = new DeliveryStore(jobs)
  let nowMs = NOW.getTime()
  const service = createEventInvitationDeliveryService({
    store,
    dispatcher: { dispatch: async () => { nowMs += 7_000; return { ok: true } } },
    origin: ORIGIN, env: ENV, now: () => new Date(nowMs), randomUuid: () => LEASE_ID,
    timeBudgetMs: 20_000,
  })
  const summary = await service.processDeliveries()
  assert.equal(summary.claimed, 4)
  assert.equal(summary.delivered, 2, 'only jobs that fit the remaining time budget are dispatched')
  assert.equal(summary.budgetSkipped, 2, 'over-pessimistic skipping is bounded to the same batch')
  assert.equal(store.finished.length, 2, 'skipped jobs are not marked failed; their lease simply expires and a later invocation reclaims them')
})

test('an exhausted budget claims nothing and touches no rows', async () => {
  const store = new DeliveryStore([deliveryJob()])
  const service = createEventInvitationDeliveryService({
    store, dispatcher: { dispatch: async () => { throw new Error('must not dispatch') } },
    origin: ORIGIN, env: ENV, now: () => NOW,
    timeBudgetMs: 2_000,
  })
  assert.deepEqual(await service.processDeliveries(), { claimed: 0, delivered: 0, retryScheduled: 0, failed: 0 })
  assert.deepEqual(await service.processBackfills(), { claimed: 0, processed: 0, invitationsAdded: 0, deliveriesQueued: 0, failed: 0 })
  assert.equal(store.finished.length, 0)
})

test('an unexpected dispatcher throw becomes one bounded retryable failure, never a lost job', async () => {
  const store = new DeliveryStore()
  const service = createEventInvitationDeliveryService({
    store, dispatcher: { dispatch: async () => { throw new Error('renderer crash') } },
    origin: ORIGIN, env: ENV, now: () => NOW, randomUuid: () => LEASE_ID,
  })
  const summary = await service.processDeliveries()
  assert.equal(summary.retryScheduled, 1)
  assert.equal(store.finished[0].errorCode, 'dispatch_failed')
  assert.equal(store.finished[0].retryable, true)
})
