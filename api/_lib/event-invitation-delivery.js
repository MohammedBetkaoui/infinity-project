import { randomUUID } from 'node:crypto'
import {
  WORKSHOP_CREDENTIAL_DERIVATION_VERSION, buildWorkshopRegistrationUrl,
  prepareStableWorkshopCredential, workshopInvitationLinkSecret,
} from './workshop-tokens.js'

const DELIVERY_BATCH_SIZE = 25
const BACKFILL_BATCH_SIZE = 2
const BACKFILL_PAGE_SIZE = 200
const LEASE_SECONDS = 45

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

export function createEventInvitationDeliveryService({
  store,
  dispatcher,
  origin,
  env = process.env,
  now = () => new Date(),
  randomUuid = randomUUID,
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
      const leaseToken = randomUuid()
      const current = now()
      const jobs = await store.claimBackfills({
        leaseToken, limit: BACKFILL_BATCH_SIZE, leaseSeconds: LEASE_SECONDS, now: current,
      })
      const summary = { claimed: jobs.length, processed: 0, invitationsAdded: 0, deliveriesQueued: 0, failed: 0 }
      for (const job of jobs) {
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
      const leaseToken = randomUuid()
      const jobs = await store.claimDeliveries({
        leaseToken, limit: DELIVERY_BATCH_SIZE, leaseSeconds: LEASE_SECONDS, now: now(),
      })
      const summary = { claimed: jobs.length, delivered: 0, retryScheduled: 0, failed: 0 }
      for (const job of jobs) {
        let privateRegistrationLink
        try {
          privateRegistrationLink = await preparePrivateLink(job, leaseToken, now())
        } catch (error) {
          await store.finishDelivery({
            jobId: job.job_id, leaseToken, succeeded: false,
            errorCode: credentialErrorCode(error), retryable: false, now: now(),
          }).catch(() => {})
          summary.failed += 1
          continue
        }

        const result = await dispatcher.dispatch({
          jobId: job.job_id, fullName: job.full_name, email: job.email, privateRegistrationLink,
        })
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
      return summary
    },
  }
}

export const EVENT_INVITATION_WORKER_LIMITS = Object.freeze({
  deliveryBatchSize: DELIVERY_BATCH_SIZE,
  backfillBatchSize: BACKFILL_BATCH_SIZE,
  backfillPageSize: BACKFILL_PAGE_SIZE,
  leaseSeconds: LEASE_SECONDS,
})
