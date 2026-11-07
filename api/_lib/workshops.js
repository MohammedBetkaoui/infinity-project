import { createServerSupabaseClient } from './aivex-server.js'
import { createWorkshopsStore } from './workshops-store.js'
import {
  WORKSHOP_CREDENTIAL_DERIVATION_VERSION, buildWorkshopQrPayload, generateWorkshopToken,
  hashWorkshopToken, prepareStableWorkshopCredential, workshopInvitationLinkSecret,
} from './workshop-tokens.js'

const genericPrivateError = (status = 'invalid') => ({ ok: false, status, message: 'This private workshop link is invalid or no longer active.' })
const scannerError = () => ({ ok: false, status: 'invalid', message: 'This scanner access is invalid or no longer active.' })
const mappedError = (error, scanner = false) => {
  const message = String(error?.databaseMessage || '')
  if (message.includes('registration_not_open')) return { ok: false, status: 'closed', message: 'Workshop registration is not open.' }
  if (message.includes('check_in_not_open')) return { ok: false, status: 'not_open', message: 'Workshop check-in is not open.' }
  if (message.includes('scanner_not_available')
    || message.includes('invalid_scanner')) return scannerError()
  if (message.includes('invalid_invitation') || message.includes('invalid_registration')
    || message.includes('participant_credential_conflict')) return genericPrivateError()
  return scanner ? null : null
}

// New registrations are closed unless WORKSHOP_REGISTRATION_OPEN=true. Only
// people who have no registration yet are turned away: anyone already
// registered keeps opening their invitation to see (and re-download) the pass.
const registrationOpen = (env) => String(env?.WORKSHOP_REGISTRATION_OPEN || '').trim().toLowerCase() === 'true'
const closedError = () => ({ ok: false, status: 'closed', message: 'Workshop registration is closed.' })

const eventView = (row) => ({
  id: row.event_id, title: row.event_title, startsAt: row.starts_at, endsAt: row.ends_at || null,
  location: row.location, speaker: row.speaker_name || '',
})

export function createWorkshopsService({ store, now = () => new Date(), origin, env = process.env, tokenGenerator = generateWorkshopToken } = {}) {
  if (!store) throw Object.assign(new Error('workshops_store_required'), { code: 'configuration_error', stage: 'workshops' })
  return {
    async invitation(rawToken) {
      const row = await store.openInvitation({ tokenHash: hashWorkshopToken(rawToken), now: now() })
      if (!row) return genericPrivateError()
      if (!row.registration_status && !registrationOpen(env)) return closedError()
      return {
        ok: true,
        invitation: {
          status: row.invitation_status,
          alreadyRegistered: Boolean(row.registration_status),
          fullName: row.full_name,
        },
        registration: row.registration_status
          ? { status: row.registration_status, universitySpeciality: row.university_speciality || '' }
          : null,
        event: eventView(row),
      }
    },
    async register(input) {
      const invitationTokenHash = hashWorkshopToken(input.token)
      let invitation
      try {
        invitation = await store.openInvitation({ tokenHash: invitationTokenHash, now: now() })
      } catch (error) {
        const mapped = mappedError(error)
        if (mapped) return mapped
        throw error
      }
      if (!invitation) return genericPrivateError()
      if (!invitation.registration_status && !registrationOpen(env)) return closedError()
      // The opaque QR badge is derived from the registration's current stable
      // credential version, so a revisit re-derives the identical credential.
      const qrCredential = prepareStableWorkshopCredential({
        purpose: 'participant-pass', subjectId: invitation.invitation_id,
        credentialVersion: Number(invitation.qr_credential_version || 1),
        derivationVersion: Number(invitation.qr_derivation_version || WORKSHOP_CREDENTIAL_DERIVATION_VERSION),
        env, secret: workshopInvitationLinkSecret(env),
      })
      const current = now()
      const eventEnd = new Date(invitation.ends_at || invitation.starts_at).getTime()
      const qrExpiresAt = new Date(Math.max(current.getTime() + 60 * 60 * 1000, eventEnd + 24 * 60 * 60 * 1000))
      try {
        const row = await store.register({
          invitationTokenHash, universitySpeciality: input.universitySpeciality,
          qrTokenHash: qrCredential.tokenHash, qrCredentialVersion: qrCredential.credentialVersion,
          qrDerivationVersion: qrCredential.derivationVersion, qrExpiresAt, now: current,
        })
        const qrPayload = buildWorkshopQrPayload(origin, qrCredential.rawToken)
        if (!qrPayload) throw Object.assign(new Error('workshop_origin_missing'), { code: 'configuration_error', stage: 'workshop_origin' })
        return {
          ok: true, alreadyRegistered: Boolean(row.already_registered),
          pass: {
            participantName: row.full_name, universitySpeciality: row.university_speciality,
            event: eventView(row), qrPayload, qrExpiresAt: row.qr_expires_at,
          },
        }
      } catch (error) {
        const mapped = mappedError(error)
        if (mapped) return mapped
        throw error
      }
    },
    async exchangeScanner(rawToken) {
      const sessionToken = tokenGenerator()
      const current = now()
      const sessionExpiresAt = new Date(current.getTime() + 8 * 60 * 60 * 1000)
      try {
        const context = await store.exchangeScanner({
          accessTokenHash: hashWorkshopToken(rawToken), sessionTokenHash: hashWorkshopToken(sessionToken),
          sessionExpiresAt, now: current,
        })
        return { ok: true, sessionToken, context: this.mapScannerContext(context) }
      } catch (error) {
        const mapped = mappedError(error, true)
        if (mapped) return mapped
        throw error
      }
    },
    mapScannerContext(row) {
      const registered = Number(row.registered || 0)
      const present = Number(row.present || 0)
      return {
        eventId: row.event_id, eventTitle: row.event_title,
        startsAt: row.starts_at, location: row.location, eventStatus: row.event_status || null,
        registered, present, remaining: Math.max(0, registered - present), sessionExpiresAt: row.session_expires_at,
      }
    },
    async scannerContext(sessionToken) {
      try {
        const row = await store.scannerContext({ sessionTokenHash: hashWorkshopToken(sessionToken), now: now() })
        return { ok: true, context: this.mapScannerContext(row) }
      } catch (error) {
        const mapped = mappedError(error, true)
        if (mapped) return mapped
        throw error
      }
    },
    async checkIn({ sessionToken, qrToken }) {
      try {
        const result = await store.checkIn({
          sessionTokenHash: hashWorkshopToken(sessionToken), qrTokenHash: hashWorkshopToken(qrToken), now: now(),
        })
        return { ok: true, result: {
          status: result.status, participantName: result.participant_name || null,
          universitySpeciality: result.university_speciality || null, checkedInAt: result.checked_in_at || null,
        } }
      } catch (error) {
        const mapped = mappedError(error, true)
        if (mapped) return mapped
        throw error
      }
    },
  }
}

export function createServerWorkshopsService(options = {}) {
  return createWorkshopsService({ store: createWorkshopsStore(createServerSupabaseClient()), ...options })
}
