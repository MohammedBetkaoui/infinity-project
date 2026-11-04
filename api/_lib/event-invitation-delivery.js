import { randomUUID } from 'node:crypto'
import {
  WORKSHOP_CREDENTIAL_DERIVATION_VERSION, buildWorkshopRegistrationUrl,
  prepareStableWorkshopCredential, workshopInvitationLinkSecret,
} from './workshop-tokens.js'
import { N8N_WEBHOOK_TIMEOUT_MS } from './event-invitation-webhook.js'

// Runtime budget for one worker invocation on Vercel Hobby.
//
// The worker runs inside api/join.js (maxDuration 60 in vercel.json). Supabase
// Cron triggers it once per minute, so every invocation must finish well
// inside its own maximum duration AND before the delivery lease expires.
//
// Worst case per invocation:
//   backfill claim/page RPCs        ~1-2 s (2 pages, single bounded SQL each)
//   delivery claim + prepare RPCs   ~1-2 s (8 lanes of bounded SQL)
//   webhook waves                   3 waves x N8N_WEBHOOK_TIMEOUT_MS = 24 s
//   finish RPCs                     ~1-2 s
//   total worst case               ~28-30 s
//
// That stays below the 40 s invocation budget, below the 60 s Vercel maximum
// duration, and below the 90 s lease (SQL claim functions accept 15..240).
// Jobs skipped because the budget ran out keep their processing lease and are
// reclaimed atomically by a later invocation (at-least-once, no job lost).
const DELIVERY_BATCH_SIZE = 8
const DELIVERY_CONCURRENCY = 3
const BACKFILL_BATCH_SIZE = 2
const BACKFILL_PAGE_SIZE = 200
const LEASE_SECONDS = 90
const INVOCATION_TIME_BUDGET_MS = 40_000
// A delivery needs at most one webhook timeout plus SQL time to complete, so
// the worker only starts work when that much budget is still available.
const DELIVERY_MIN_RESERVE_MS = N8N_WEBHOOK_TIMEOUT_MS + 4_000
// A backfill page is one bounded SQL call that never waits on n8n.
const BACKFILL_MIN_RESERVE_MS = 8_000

const linkExpiry = (job, current) => {
  const eventEnd = new Date(job.event_ends_at || job.event_starts_at || current).getTime() + 24 * 60 * 60 * 1000
  return new Date(Math.max(current.getTime() + 60 * 60 * 1000, eventEnd))
}

const credentialErrorCode = (error) => {
  const message = String(error?.databaseMessage || error?.message || '')
  if (message.includes('revoked')) return 'link_revoked'
  if (message.includes('expired')) return 'link_expired'
  if (message.includes('not_active')) return 'invitation_inactive'
  if (message.includes('lease_lost')) return 'lease_lost'
  return error?.code === 'credential_error' ? 'credential_error' : 'delivery_prepare_failed'
}

// An unexpected dispatcher throw must never abort the whole invocation: other
// lanes would lose their finish updates and the rows would idle in processing
// until the lease expires. Converting it to a bounded retryable failure keeps
// the remaining jobs moving.
const dispatcherFailure = (error) => ({
  ok: false,
  errorCode: typeof error?.errorCode === 'string' && /^[a-z0-9_]{1,64}$/.test(error.errorCode)
    ? error.errorCode
    : 'dispatch_failed',
  retryable: true,
})

export function createEventInvitationDeliveryService({
  store,
  dispatcher,
  origin,
  env = process.env,
  now = () => new Date(),
  randomUuid = randomUUID,
  timeBudgetMs = INVOCATION_TIME_BUDGET_MS,
} = {}) {
  let canonicalOrigin = null
  try {
    const parsed = new URL(String(origin || '').trim())
    if (parsed.protocol === 'https:') canonicalOrigin = parsed.origin
  } catch { /* handled by the configuration guard below */ }
  if (!store || !dispatcher || !canonicalOrigin) {
    throw Object.assign(new Error('event_invitation_delivery_configuration_error'), { code: 'configuration_error' })
  }
  const stableSecret = workshopInvitationLinkSecret(env)

  // One shared wall-clock deadline for both work buckets of an invocation:
  // backfills start first and must not consume the whole budget.
  let deadlineMs = null
  const budgetRemainingMs = () => {
    if (deadlineMs === null) deadlineMs = now().getTime() + timeBudgetMs
    return deadlineMs - now().getTime()
  }

  const preparePrivateLink = async (job, leaseToken, current) => {
    const proposed = prepareStableWorkshopCredential({
      purpose: 'invitation', subjectId: job.invitation_id, credentialVersion: 1,
      derivationVersion: WORKSHOP_CREDENTIAL_DERIVATION_VERSION, secret: stableSecret, env,
    })
    const persisted = await store.ensureInvitationLink({
      jobId: job.job_id, leaseToken, tokenHash: proposed.tokenHash,
      expiresAt: linkExpiry(job, current), now: current,
    })
    if (persisted?.revoked_at || new Date(persisted?.expires_at || 0) <= current) {
      throw Object.assign(new Error('invitation_link_inactive'), { code: 'credential_error' })
    }
    const credential = prepareStableWorkshopCredential({
      purpose: 'invitation', subjectId: job.invitation_id,
      credentialVersion: Number(persisted?.credential_version),
      derivationVersion: Number(persisted?.derivation_version), secret: stableSecret, env,
    })
    if (credential.tokenHash !== persisted?.token_hash) {
      throw Object.assign(new Error('invitation_credential_conflict'), { code: 'credential_error' })
    }
    const privateLink = buildWorkshopRegistrationUrl(canonicalOrigin, credential.rawToken)
    if (!privateLink) throw Object.assign(new Error('invitation_url_invalid'), { code: 'credential_error' })
    return privateLink
  }

  return {
    async processBackfills() {
      const summary = { claimed: 0, processed: 0, invitationsAdded: 0, deliveriesQueued: 0, failed: 0 }
      if (budgetRemainingMs() < BACKFILL_MIN_RESERVE_MS) return summary
      const leaseToken = randomUuid()
      const current = now()
      const jobs = await store.claimBackfills({
        leaseToken, limit: BACKFILL_BATCH_SIZE, leaseSeconds: LEASE_SECONDS, now: current,
      })
      summary.claimed = jobs.length
      for (const job of jobs) {
        if (budgetRemainingMs() < BACKFILL_MIN_RESERVE_MS) {
          if (summary.budgetSkipped === undefined) summary.budgetSkipped = 0
          summary.budgetSkipped += 1
          continue
        }
        try {
          const result = await store.processBackfillPage({
            jobId: job.job_id, leaseToken, pageSize: BACKFILL_PAGE_SIZE, now: now(),
          })
          summary.processed += Number(result.processed || 0)
          summary.invitationsAdded += Number(result.added || 0)
          summary.deliveriesQueued += Number(result.queued || 0)
        } catch {
          summary.failed += 1
          await store.releaseBackfill({
            jobId: job.job_id, leaseToken, errorCode: 'backfill_failed', now: now(),
          }).catch(() => {})
        }
      }
      return summary
    },

    async processDeliveries() {
      const summary = { claimed: 0, delivered: 0, retryScheduled: 0, failed: 0 }
      if (budgetRemainingMs() < DELIVERY_MIN_RESERVE_MS) return summary
      const leaseToken = randomUuid()
      const current = now()
      const jobs = await store.claimDeliveries({
        leaseToken, limit: DELIVERY_BATCH_SIZE, leaseSeconds: LEASE_SECONDS, now: current,
      })
      summary.claimed = jobs.length
      if (!jobs.length) return summary
      const budgetSkip = () => {
        if (summary.budgetSkipped === undefined) summary.budgetSkipped = 0
        summary.budgetSkipped += 1
      }

      // 1) Derive/persist the private credential under the job lease. These
      // are short SQL calls, processed sequentially and gated by the budget:
      // a job skipped here keeps its processing lease and is reclaimed later.
      const ready = []
      for (const job of jobs) {
        if (budgetRemainingMs() < DELIVERY_MIN_RESERVE_MS) { budgetSkip(); continue }
        try {
          ready.push({
            job,
            privateRegistrationLink: await preparePrivateLink(job, leaseToken, now()),
          })
        } catch (error) {
          await store.finishDelivery({
            jobId: job.job_id, leaseToken, succeeded: false,
            errorCode: credentialErrorCode(error), retryable: false, now: now(),
          }).catch(() => {})
          summary.failed += 1
        }
      }

      // 2) Deliver over n8n with bounded concurrency. Every item stays
      // individually gated: at most one webhook timeout (plus SQL time) may
      // start, so the invocation can never drift past its budget.
      let cursor = 0
      const dispatchOne = async () => {
        const next = ready[cursor++]
        if (budgetRemainingMs() < DELIVERY_MIN_RESERVE_MS) { budgetSkip(); return }
        const { job, privateRegistrationLink } = next
        let result
        try {
          result = await dispatcher.dispatch({
            jobId: job.job_id, fullName: job.full_name, email: job.email, privateRegistrationLink,
          })
        } catch (error) {
          result = dispatcherFailure(error)
        }
        try {
          const status = await store.finishDelivery({
            jobId: job.job_id, leaseToken, succeeded: result.ok,
            errorCode: result.ok ? null : result.errorCode,
            retryable: result.ok ? false : result.retryable, now: now(),
          })
          if (status === 'delivered') summary.delivered += 1
          else if (status === 'retry_scheduled') summary.retryScheduled += 1
          else summary.failed += 1
        } catch {
          // The lease may expire after n8n accepted the request. Leaving the
          // row recoverable preserves at-least-once semantics.
          summary.failed += 1
        }
      }
      const lanes = Array.from(
        { length: Math.max(1, Math.min(DELIVERY_CONCURRENCY, ready.length)) },
        () => (async () => {
          while (cursor < ready.length) await dispatchOne()
        })(),
      )
      await Promise.all(lanes)
      return summary
    },
  }
}

export const EVENT_INVITATION_WORKER_LIMITS = Object.freeze({
  deliveryBatchSize: DELIVERY_BATCH_SIZE,
  deliveryConcurrency: DELIVERY_CONCURRENCY,
  backfillBatchSize: BACKFILL_BATCH_SIZE,
  backfillPageSize: BACKFILL_PAGE_SIZE,
  leaseSeconds: LEASE_SECONDS,
  invocationTimeBudgetMs: INVOCATION_TIME_BUDGET_MS,
  deliveryMinReserveMs: DELIVERY_MIN_RESERVE_MS,
  backfillMinReserveMs: BACKFILL_MIN_RESERVE_MS,
})
