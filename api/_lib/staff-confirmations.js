import { createServerSupabaseClient } from './aivex-server.js'
import { emitStaffMotivationNotification } from './admin-notifications.js'
import { createStaffConfirmationsStore } from './staff-confirmations-store.js'
import {
  buildStaffConfirmationUrl,
  generateStaffConfirmationToken,
  hashStaffConfirmationToken,
  isPlausibleStaffConfirmationToken,
  staffConfirmationExpiryFrom,
} from './staff-confirmation-tokens.js'

const STAFF_DEPARTMENT_LABELS = Object.freeze({
  'dev-tech': 'Dev / Tech',
  'design-content': 'Design / Content Creation',
  'management-logistics': 'Management / Logistics',
})

const terminalApplication = (status) => ['accepted', 'declined', 'archived'].includes(status)

export function effectiveStaffConfirmationStatus(confirmation, now = new Date()) {
  if (!confirmation) return 'not_invited'
  if (['invited', 'revision_requested'].includes(confirmation.status)
    && new Date(confirmation.expires_at).getTime() <= now.getTime()) return 'expired'
  return confirmation.status
}

function candidateProjection(confirmation, application, now) {
  const status = effectiveStaffConfirmationStatus(confirmation, now)
  return {
    reference: application.reference || `JOIN-${String(application.id).slice(0, 8).toUpperCase()}`,
    displayName: application.full_name,
    staffDepartment: STAFF_DEPARTMENT_LABELS[application.staff_department] || application.primary_field,
    status,
    expiresAt: confirmation.expires_at,
    revisionMessage: status === 'revision_requested' ? confirmation.revision_message : null,
  }
}

export function createStaffConfirmationsService({ store, notify, now = () => new Date() } = {}) {
  if (!store) throw Object.assign(new Error('staff_confirmations_store_required'), { code: 'configuration_error' })

  return {
    async verify(rawToken) {
      if (!isPlausibleStaffConfirmationToken(rawToken)) return { ok: false, status: 'invalid' }
      const token = await store.tokenByHash(hashStaffConfirmationToken(rawToken))
      if (!token || token.revoked_at) return { ok: false, status: 'invalid' }
      const clock = now()
      if (new Date(token.expires_at).getTime() <= clock.getTime()) return { ok: false, status: 'expired' }
      if (token.consumed_at) return { ok: true, status: 'already_submitted' }

      const confirmation = await store.confirmation(token.confirmation_id)
      if (!confirmation) return { ok: false, status: 'invalid' }
      const application = await store.application(confirmation.application_id)
      if (!application || application.join_type !== 'staff' || terminalApplication(application.status)) {
        return { ok: false, status: 'invalid' }
      }
      const status = effectiveStaffConfirmationStatus(confirmation, clock)
      if (status === 'expired') return { ok: false, status: 'expired' }
      if (status === 'submitted' || status === 'confirmed') return { ok: true, status: 'already_submitted' }
      if (!['invited', 'revision_requested'].includes(status)) return { ok: false, status: 'invalid' }
      return { ok: true, status: 'valid', confirmation: candidateProjection(confirmation, application, clock) }
    },

    async submit(rawToken, motivation) {
      if (!isPlausibleStaffConfirmationToken(rawToken)) return { ok: false, status: 'invalid' }
      try {
        const result = await store.submit({
          tokenHash: hashStaffConfirmationToken(rawToken), motivation, now: now(),
        })
        if (!result) throw Object.assign(new Error('staff_confirmation_submit_empty'), { code: 'database_error' })
        await notify?.({
          applicationId: result.application_id,
          confirmationId: result.confirmation_id,
          version: Number(result.submission_version),
          createdAt: new Date(result.submitted_at),
        }).catch((error) => {
          console.error('[staff-confirmation] Administrator notification failed', { code: error?.code || 'notification_error' })
        })
        return {
          ok: true,
          status: result.already_submitted ? 'already_submitted' : 'submitted',
          reference: result.application_reference,
          submittedAt: result.submitted_at,
        }
      } catch (error) {
        const message = String(error?.databaseMessage || '')
        if (message.includes('staff_confirmation_expired')) return { ok: false, status: 'expired' }
        if (message.includes('staff_confirmation_already_submitted')) return { ok: true, status: 'already_submitted' }
        if (['28000', 'P0002'].includes(error?.code)
          || message.includes('staff_confirmation_invalid')
          || message.includes('staff_confirmation_inactive')) return { ok: false, status: 'invalid' }
        if (error?.code === '22023') return { ok: false, status: 'invalid_motivation' }
        throw error
      }
    },
  }
}

export function createServerStaffConfirmationsService() {
  const supabase = createServerSupabaseClient()
  return createStaffConfirmationsService({
    store: createStaffConfirmationsStore(supabase),
    notify: (input) => emitStaffMotivationNotification({ supabase, ...input }),
  })
}

export function prepareStaffConfirmationInvitation({ origin, purpose, now = new Date(), generateToken = generateStaffConfirmationToken }) {
  const token = generateToken()
  const expiresAt = staffConfirmationExpiryFrom(now)
  return {
    rawToken: token,
    tokenHash: hashStaffConfirmationToken(token),
    tokenPurpose: purpose,
    expiresAt,
    url: buildStaffConfirmationUrl(origin, token),
  }
}

export function staffConfirmationInvitationMessage({ candidate, reference, url, expiresAt }) {
  const deadline = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Algiers',
  }).format(expiresAt)
  return [
    'Hello,',
    '',
    `Your Infinity Club Staff application${candidate ? `, ${candidate},` : ''} has moved to the next stage.`,
    '',
    'Application reference:',
    reference,
    '',
    'Please submit your Staff confirmation and motivation using your private link:',
    '',
    url,
    '',
    'Deadline:',
    deadline,
    '',
    'Please do not share this link with anyone.',
    '',
    '— Infinity Club',
  ].join('\n')
}

export { STAFF_DEPARTMENT_LABELS }
