import { createServerSupabaseClient } from './aivex-server.js'
import { canManageEvents } from './admin-events-permissions.js'
import { createAdminEventsStore } from './admin-events-store.js'
import {
  WORKSHOP_CREDENTIAL_DERIVATION_VERSION, buildWorkshopRegistrationUrl, buildWorkshopScannerUrl,
  prepareStableWorkshopCredential, workshopInvitationLinkSecret,
} from './workshop-tokens.js'

const TYPE_LABELS = Object.freeze({
  workshop: 'Workshop', competition: 'Competition', conference: 'Conference',
  open_day: 'Open Day', hackathon: 'Hackathon', meeting: 'Meeting', training: 'Training', other: 'Other',
})
const STATUS_LABELS = Object.freeze({
  draft: 'Draft', planned: 'Planned', registration_open: 'Registration open',
  registration_closed: 'Registration closed', ongoing: 'Ongoing',
  completed: 'Completed', cancelled: 'Cancelled', archived: 'Archived',
})
const INVITATION_LABELS = Object.freeze({ invited: 'Invited', registered: 'Registered', declined: 'Declined', cancelled: 'Cancelled' })
const REGISTRATION_LABELS = Object.freeze({ registered: 'Registered', checked_in: 'Checked in', cancelled: 'Cancelled' })
const PARTICIPANT_TYPE_LABELS = Object.freeze({ member: 'Member', staff: 'Staff' })
const ACTION_TITLES = Object.freeze({
  event_created: 'Event created',
  event_updated: 'Event updated',
  workshop_applicants_invited: 'Member applicants invited to workshop',
  workshop_invitation_links_exported: 'Workshop invitation links exported',
  workshop_invitation_link_regenerated: 'Workshop invitation link regenerated',
  participant_registered: 'Participant registered',
  scanner_access_generated: 'Workshop scanner link generated',
  scanner_access_regenerated: 'Workshop scanner link regenerated',
  scanner_access_revoked: 'Workshop scanner link revoked',
  participant_checked_in: 'Participant checked in',
  attendance_finalized: 'Attendance finalized',
  workshop_status_changed: 'Workshop status changed',
})
const initials = (name) => String(name || '').split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
const firstEmbed = (value) => Array.isArray(value) ? (value[0] || null) : (value || null)

// Statistics come straight from the directory read model: the UI never
// aggregates counts itself. Presence is authoritative once registered;
// Not checked in only turns into absent after explicit finalization.
function mapEvent(row) {
  const presentCount = Number(row.present_count || 0)
  const notCheckedInCount = Number(row.not_checked_in_count || 0)
  const absentCount = Number(row.absent_count || 0)
  const attendanceEligible = presentCount + notCheckedInCount + absentCount
  return {
    id: row.id,
    ref: `EVT-${String(row.id).slice(0, 8).toUpperCase()}`,
    type: row.event_type,
    typeLabel: TYPE_LABELS[row.event_type] || row.event_type,
    title: row.title,
    description: row.description || '',
    startsAt: row.starts_at,
    endsAt: row.ends_at || null,
    location: row.location,
    speaker: row.speaker_name || '',
    // speaker_names is the source of truth; speaker_name stays the joined
    // display line the public workshop pages already read.
    speakers: Array.isArray(row.speaker_names) && row.speaker_names.length
      ? row.speaker_names
      : (row.speaker_name ? [row.speaker_name] : []),
    visibility: row.visibility,
    status: STATUS_LABELS[row.status] || row.status,
    statusKey: row.status,
    invitedCount: Number(row.invited_count || 0),
    registeredCount: Number(row.registered_count || 0),
    presentCount,
    notCheckedInCount,
    absentCount,
    attendanceCount: Number(row.attendance_count || 0),
    attendanceRate: attendanceEligible > 0 ? Math.round((presentCount / attendanceEligible) * 100) : 0,
    attendanceState: attendanceEligible > 0 ? 'in_progress' : 'not_started',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function eventStatistics(event) {
  return {
    totalInvited: event.invitedCount,
    totalRegistered: event.registeredCount,
    totalPresent: event.presentCount,
    totalNotCheckedIn: event.notCheckedInCount,
    totalAbsent: event.absentCount,
    attendanceRate: event.attendanceRate,
    attendanceState: event.attendanceState,
  }
}

function mapHistory(entries) {
  return (entries || [])
    .map((item) => ({
      title: ACTION_TITLES[item.action] || 'Event updated',
      actor: item.administrator?.display_name || 'Infinity Administration',
      at: item.created_at,
      kind: 'Event',
    }))
    .filter((item) => item.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at))
}

// One row of admin_event_applicant_links: an application with the link and
// registration state it has for this event (invitation_id null = no link yet).
function mapParticipant(row) {
  const invitationStatusKey = row.invitation_id ? String(row.invitation_status) : null
  const registrationStatusKey = row.registration_status ? String(row.registration_status) : null
  let attendance = null
  if (registrationStatusKey) {
    if (row.absent_at) attendance = 'absent'
    else if (registrationStatusKey === 'checked_in') attendance = 'present'
    else if (registrationStatusKey === 'registered') attendance = 'not_checked_in'
  }
  const linkReady = Boolean(
    row.invitation_id
    && row.invite_token_hash
    && row.credential_derivation_version === WORKSHOP_CREDENTIAL_DERIVATION_VERSION
    && !row.link_revoked_at
    && row.invitation_status !== 'declined'
    && row.invitation_status !== 'cancelled',
  )
  const exportable = Boolean(row.invitation_id && ['invited', 'registered'].includes(row.invitation_status))
  const specialitySource = row.university_speciality ? 'registration' : 'application'
  return {
    id: row.application_id,
    invitationId: row.invitation_id || null,
    name: row.full_name,
    initials: initials(row.full_name),
    email: row.email || '',
    type: row.join_type,
    typeLabel: PARTICIPANT_TYPE_LABELS[row.join_type] || row.join_type,
    universitySpeciality: row.university_speciality || row.department || '',
    specialitySource,
    invitationStatus: invitationStatusKey
      ? (INVITATION_LABELS[invitationStatusKey] || invitationStatusKey)
      : 'Not invited',
    invitationStatusKey,
    invitationReady: Boolean(row.invitation_id),
    privateLinkReady: linkReady,
    linkExportedAt: row.link_exported_at || null,
    // A link that exists but was never written to a CSV is a "new" one.
    linkIsNew: exportable && !row.link_exported_at,
    invitedAt: row.invited_at || null,
    registeredAt: row.registration_registered_at || row.invitation_registered_at || null,
    registrationStatus: registrationStatusKey
      ? (REGISTRATION_LABELS[registrationStatusKey] || registrationStatusKey)
      : null,
    attendance,
    checkedInAt: row.checked_in_at || null,
    absentAt: row.absent_at || null,
  }
}

function mapAttendanceRow(row) {
  const application = firstEmbed(row.application) || {}
  return {
    id: row.id,
    applicationId: row.membership_application_id,
    name: application.full_name || 'Unknown participant',
    initials: initials(application.full_name),
    email: application.email || '',
    universitySpeciality: row.university_speciality || '',
    registeredAt: row.registered_at || null,
    checkedInAt: row.checked_in_at || null,
    absentAt: row.absent_at || null,
    checkedInBy: row.checked_in_at ? 'Workshop scanner' : null,
    updatedAt: row.updated_at,
  }
}

const csvCell = (value, { protectFormula = true } = {}) => {
  let text = value == null ? '' : String(value).replace(/\r\n?/g, '\n')
  if (protectFormula && /^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

const splitExportName = (row) => {
  const words = String(row.full_name || '').trim().split(/\s+/).filter(Boolean)
  return { firstName: words[0] || '', lastName: words.slice(1).join(' ') }
}

export function buildWorkshopInvitationsCsv(rows) {
  const headers = [
    'workshop_reference', 'workshop_title', 'first_name', 'last_name', 'full_name', 'email',
    'speciality', 'participant_type', 'invitation_status', 'registration_status', 'private_registration_link',
  ]
  const lines = [headers.map((value) => csvCell(value)).join(',')]
  for (const row of rows) {
    const { firstName, lastName } = splitExportName(row)
    const values = [
      row.workshopReference, row.workshopTitle, firstName, lastName,
      row.full_name || '', row.email || '', row.department || '',
      row.join_type, row.invitation_status,
      row.registration_status || row.invitation_registered_at ? 'registered' : 'not_registered', row.privateRegistrationLink,
    ]
    lines.push(values.map((value) => csvCell(value)).join(','))
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

function publicEventError(error) {
  const message = error?.databaseMessage || ''
  if (error?.code === '42501' || message.includes('administrator_not_authorized')) return { status: 403, message: 'You do not have permission to perform this action.' }
  if (error?.code === 'P0002' || message.includes('event_not_found')) return { status: 404, message: 'This event no longer exists.' }
  if (message.includes('invitation_not_found')) return { status: 404, message: 'This invitation no longer exists.' }
  // Credential conflicts must win over the generic optimistic-lock mapping:
  // they describe a different recovery action.
  if (message.includes('invitation_credential_conflict') || message.includes('invalid_invitation_credential')) return { status: 409, message: 'This invitation link changed concurrently. Reload the participants list before retrying.' }
  if (message.includes('scanner_credential_conflict') || message.includes('invalid_scanner_credential')) return { status: 409, message: 'The scanner link changed concurrently. Reload the scanner panel before retrying.' }
  if (error?.code === '40001' || message.includes('event_conflict')) return { status: 409, message: 'This event was updated by another administrator. Refresh it before continuing.' }
  if (message.includes('unknown_application')) return { status: 409, message: 'Some selected applications are no longer available. Refresh the list and try again.' }
  if (message.includes('invalid_invitation_applicants')) return { status: 409, message: 'Some selected applications cannot be invited. Refresh the list and try again.' }
  if (message.includes('invalid_invitation_scope')) return { status: 409, message: 'Choose one invitation scope or an explicit application selection.' }
  if (message.includes('event_not_available')) return { status: 409, message: 'This event cannot accept invitations right now.' }
  if (message.includes('invitation_not_active')) return { status: 409, message: 'One or more invitation links are no longer active.' }
  if (message.includes('attendance_not_finalizable')) return { status: 409, message: 'Attendance can only be finalized after the workshop is completed.' }
  if (error?.code === '23503') return { status: 409, message: 'Some selected people are no longer available. Refresh the list and try again.' }
  if (error?.code === '23505') return { status: 409, message: 'This change conflicts with an existing record.' }
  if (error?.code === '22023' || error?.code === '23514') return { status: 409, message: 'This action is not valid for the current event.' }
  return null
}

export function createAdminEventsService({
  store, now = () => new Date(), origin, env = process.env,
} = {}) {
  if (!store) throw Object.assign(new Error('admin_events_store_required'), { stage: 'configuration', code: 'configuration_error' })
  const stableSecret = () => workshopInvitationLinkSecret(env)
  const linkExpiry = (event, current) => {
    const eventEnd = new Date(event.ends_at || event.starts_at).getTime() + 24 * 60 * 60 * 1000
    return new Date(Math.max(current.getTime() + 60 * 60 * 1000, eventEnd))
  }
  // The shared scanner link stays valid until the event ends plus a small
  // grace window, capped above by at least one hour from now.
  const scannerWindow = (event, current) => {
    const eventEnd = new Date(event.ends_at || event.starts_at).getTime() + 12 * 60 * 60 * 1000
    return new Date(Math.max(current.getTime() + 60 * 60 * 1000, eventEnd))
  }
  const isUsableScannerAccess = (access, current = now()) => Boolean(
    access
    && access.status === 'active'
    && !access.revoked_at
    && access.credential_derivation_version === WORKSHOP_CREDENTIAL_DERIVATION_VERSION
    && new Date(access.expires_at).getTime() > current.getTime(),
  )
  const revealScannerLink = (access) => {
    if (!origin) throw Object.assign(new Error('workshop_origin_missing'), { code: 'configuration_error', stage: 'workshop_origin' })
    const credential = prepareStableWorkshopCredential({
      purpose: 'event-scanner', subjectId: access.event_id,
      credentialVersion: Number(access.credential_version),
      derivationVersion: Number(access.credential_derivation_version || WORKSHOP_CREDENTIAL_DERIVATION_VERSION),
      env, secret: stableSecret(),
    })
    if (credential.tokenHash !== access.token_hash) {
      throw Object.assign(new Error('scanner_credential_conflict'), { databaseMessage: 'scanner_credential_conflict', code: '40001' })
    }
    return buildWorkshopScannerUrl(origin, credential.rawToken)
  }
  const revealInvitationLink = async ({ event, eventId, invitationId, adminUserId, action = 'ensure' }) => {
    const existing = await store.invitationCredential(eventId, invitationId)
    if (!existing) throw Object.assign(new Error('invitation_not_found'), { databaseMessage: 'invitation_not_found', code: 'P0002' })
    if (!origin) throw Object.assign(new Error('workshop_origin_missing'), { code: 'configuration_error', stage: 'workshop_origin' })
    const current = now()
    const isStable = Boolean(
      existing.token_hash
      && existing.credential_derivation_version === WORKSHOP_CREDENTIAL_DERIVATION_VERSION,
    )
    const existingExpiresAt = existing.expires_at ? new Date(existing.expires_at) : null
    const isExpired = !existingExpiresAt || Number.isNaN(existingExpiresAt.getTime()) || existingExpiresAt <= current
    const isRevoked = Boolean(existing.revoked_at)
    const mustRegenerate = action === 'regenerate' || (action === 'ensure' && isStable && (isExpired || isRevoked))
    const effectiveAction = mustRegenerate ? 'regenerate' : action
    const credentialVersion = effectiveAction === 'regenerate'
      ? Number(existing.credential_version || 0) + 1
      : (isStable ? Number(existing.credential_version) : 1)
    const credential = prepareStableWorkshopCredential({
      purpose: 'invitation', subjectId: invitationId, credentialVersion, env, secret: stableSecret(),
    })
    let persisted = existing
    if (effectiveAction === 'regenerate' || !isStable) {
      persisted = await store.setInvitationLink({
        eventId, invitationId, adminUserId, action: effectiveAction, tokenHash: credential.tokenHash,
        credentialVersion: credential.credentialVersion, derivationVersion: credential.derivationVersion,
        expiresAt: linkExpiry(event, current), now: current,
      })
    }
    const persistedRevokedAt = persisted.revoked_at
    const persistedExpiresAt = persisted.expires_at
    if (persistedRevokedAt || new Date(persistedExpiresAt || 0) <= current) {
      throw Object.assign(new Error('invitation_not_active'), { databaseMessage: 'invitation_not_active', code: '22023' })
    }
    if (persisted.token_hash !== credential.tokenHash) {
      throw Object.assign(new Error('invitation_credential_conflict'), { databaseMessage: 'invitation_credential_conflict', code: '40001' })
    }
    return {
      privateLink: buildWorkshopRegistrationUrl(origin, credential.rawToken),
      credentialVersion: credential.credentialVersion,
      expiresAt: persistedExpiresAt,
    }
  }
  // Counts for the "private links" panel. missing = applications that joined
  // (or were never linked) and still have no private link for this event.
  const invitationOverview = async (eventId) => {
    const counts = await store.invitationCounts(eventId)
    const section = (members, staff) => ({ members, staff, total: members + staff })
    return {
      eligible: section(counts.eligibleMembers, counts.eligibleStaff),
      linked: section(counts.linkedMembers, counts.linkedStaff),
      missing: section(
        Math.max(0, counts.eligibleMembers - counts.linkedMembers),
        Math.max(0, counts.eligibleStaff - counts.linkedStaff),
      ),
      unexported: section(counts.unexportedMembers, counts.unexportedStaff),
    }
  }
  const detail = async (eventId) => {
    const row = await store.find(eventId)
    if (!row) return null
    const audit = await store.audit(eventId)
    const event = mapEvent(row)
    return { ...event, statistics: eventStatistics(event), history: mapHistory(audit) }
  }
  const scannerView = async (eventId) => {
    const access = await store.scannerAccess(eventId)
    const current = now()
    const usable = isUsableScannerAccess(access, current)
    return {
      access: access ? {
        id: access.id,
        status: access.status,
        startsAt: access.starts_at,
        expiresAt: access.expires_at,
        lastUsedAt: access.last_used_at || null,
        revokedAt: access.revoked_at || null,
        credentialVersion: access.credential_version,
      } : null,
      copyable: usable,
    }
  }
  return {
    async list(options) {
      const nowIso = now().toISOString()
      const [{ rows, count }, counts] = await Promise.all([
        store.list({ ...options, now: nowIso }),
        store.summaryCounts({ now: nowIso }),
      ])
      return {
        data: rows.map((row) => mapEvent(row)),
        summary: [
          { key: 'upcoming', label: 'Upcoming', value: counts.upcoming },
          { key: 'ongoing', label: 'Ongoing', value: counts.ongoing },
          { key: 'completed', label: 'Completed', value: counts.completed },
          { key: 'total', label: 'Total events', value: counts.total },
        ],
        pagination: {
          page: options.page,
          limit: options.limit,
          total: count,
          pages: Math.max(1, Math.ceil(count / options.limit)),
        },
      }
    },
    detail,
    async create(payload, user) {
      if (!canManageEvents(user.role, 'create_event')) return { ok: false, status: 403, message: 'You do not have permission to create events.' }
      try {
        const eventId = await store.createEvent({ adminUserId: user.id, payload, now: now() })
        return { ok: true, event: await detail(eventId, user) }
      } catch (error) {
        const publicError = publicEventError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async update(eventId, input, user) {
      if (!canManageEvents(user.role, 'update_event')) return { ok: false, status: 403, message: 'You do not have permission to update this event.' }
      try {
        await store.updateEvent({ eventId, adminUserId: user.id, expectedUpdatedAt: input.expectedUpdatedAt, payload: input.payload, now: now() })
        return { ok: true, event: await detail(eventId, user) }
      } catch (error) {
        const publicError = publicEventError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async participants(eventId, options) {
      if (!await store.find(eventId)) return null
      const { rows, count } = await store.participants(eventId, options)
      return {
        data: rows.map(mapParticipant),
        pagination: {
          page: options.page,
          limit: options.limit,
          total: count,
          pages: Math.max(1, Math.ceil(count / options.limit)),
        },
      }
    },
    async invitationOverview(eventId) {
      if (!await store.find(eventId)) return null
      return invitationOverview(eventId)
    },
    async invite(eventId, input, user) {
      if (!canManageEvents(user.role, 'invite_applicants')) return { ok: false, status: 403, message: 'You do not have permission to invite workshop applicants.' }
      try {
        const result = await store.inviteApplications({
          eventId, adminUserId: user.id, applicationIds: input.applicationIds ?? null,
          scope: input.scope ?? null, now: now(),
        })
        return {
          ok: true,
          invited: {
            requested: Number(result?.requested || 0),
            added: Number(result?.added || 0),
            addedMembers: Number(result?.added_members || 0),
            addedStaff: Number(result?.added_staff || 0),
          },
        }
      } catch (error) {
        const publicError = publicEventError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async invitationLink(eventId, invitationId, input, user) {
      if (user?.role !== 'super_admin') return { ok: false, status: 403, message: 'You do not have permission to reveal private workshop links.' }
      try {
        const event = await store.find(eventId)
        if (!event) return { ok: false, status: 404, message: 'Event not found.' }
        const link = await revealInvitationLink({ event, eventId, invitationId, adminUserId: user.id, action: input.action })
        return { ok: true, ...link }
      } catch (error) {
        const publicError = publicEventError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async exportInvitations(eventId, user, { scope = 'all' } = {}) {
      if (user?.role !== 'super_admin') return { ok: false, status: 403, message: 'You do not have permission to export private workshop links.' }
      try {
        stableSecret()
        if (!origin) return { ok: false, status: 503, message: 'The public workshop origin is not configured.' }
        const event = await store.find(eventId)
        if (!event) return { ok: false, status: 404, message: 'Event not found.' }
        if (event.event_type !== 'workshop') return { ok: false, status: 409, message: 'Invitation links can only be exported for workshops.' }
        if (['cancelled', 'archived'].includes(event.status)) return { ok: false, status: 409, message: 'Invitation links cannot be exported for this workshop.' }
        const onlyNew = scope === 'new'
        const candidates = await store.exportInvitationRows(eventId, { onlyNew })
        if (!candidates.length) {
          return {
            ok: false, status: 409,
            message: onlyNew ? 'There are no new private links to export.' : 'No active invitations are available to export.',
          }
        }
        const rows = []
        for (const candidate of candidates) {
          const link = await revealInvitationLink({
            event, eventId, invitationId: candidate.invitation_id, adminUserId: user.id, action: 'ensure',
          })
          rows.push({
            ...candidate,
            workshopReference: `EVT-${String(eventId).slice(0, 8).toUpperCase()}`,
            workshopTitle: event.title,
            privateRegistrationLink: link.privateLink,
          })
        }
        await store.recordInvitationExport({
          eventId, adminUserId: user.id, invitationIds: rows.map((row) => row.invitation_id), scope: onlyNew ? 'new' : 'all', now: now(),
        })
        return {
          ok: true,
          csv: buildWorkshopInvitationsCsv(rows),
          fileName: `infinity-workshop-${onlyNew ? 'new-invitations' : 'invitations'}-${String(eventId).slice(0, 8)}-${now().toISOString().slice(0, 10)}.csv`,
          rowCount: rows.length,
        }
      } catch (error) {
        const publicError = publicEventError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async scanner(eventId) {
      if (!await store.find(eventId)) return null
      return scannerView(eventId)
    },
    async scannerAction(eventId, input, user) {
      if (!canManageEvents(user.role, 'manage_scanner')) return { ok: false, status: 403, message: 'You do not have permission to manage the workshop scanner link.' }
      const current = now()
      try {
        const access = await store.scannerAccess(eventId)
        if (input.action === 'revoke') {
          const revoked = await store.revokeScannerAccess({ eventId, adminUserId: user.id, now: current })
          return { ok: true, revoked, ...(await scannerView(eventId)) }
        }
        if (input.action === 'copy') {
          if (!isUsableScannerAccess(access, current)) {
            return { ok: false, status: 409, message: 'There is no active workshop scanner link to copy. Generate one first.' }
          }
          return { ok: true, copied: true, privateUrl: revealScannerLink(access), expiresAt: access.expires_at }
        }
        if (!origin) return { ok: false, status: 503, message: 'The public workshop origin is not configured.' }
        const event = await store.find(eventId)
        if (!event) return { ok: false, status: 404, message: 'Event not found.' }
        if (event.event_type !== 'workshop') return { ok: false, status: 409, message: 'Scanner links are only available for workshops.' }
        if (['cancelled', 'archived'].includes(event.status)) return { ok: false, status: 409, message: 'Scanner links cannot be issued for this workshop.' }
        // Generating keeps an already usable shared link untouched; only a
        // missing, revoked or expired credential writes through the RPC.
        if (input.action === 'generate' && isUsableScannerAccess(access, current)) {
          return { ok: true, created: false, regenerated: false, privateUrl: revealScannerLink(access), expiresAt: access.expires_at, ...(await scannerView(eventId)) }
        }
        const effectiveAction = input.action === 'generate' && !access ? 'ensure' : 'regenerate'
        const credentialVersion = access
          ? Number(access.credential_version || 0) + 1
          : 1
        const credential = prepareStableWorkshopCredential({
          purpose: 'event-scanner', subjectId: eventId, credentialVersion,
          env, secret: stableSecret(),
        })
        const persisted = await store.persistScannerAccess({
          eventId, adminUserId: user.id, action: effectiveAction, tokenHash: credential.tokenHash,
          credentialVersion: credential.credentialVersion, startsAt: current,
          expiresAt: scannerWindow(event, current), now: current,
        })
        if (persisted.token_hash !== credential.tokenHash) {
          throw Object.assign(new Error('scanner_credential_conflict'), { databaseMessage: 'scanner_credential_conflict', code: '40001' })
        }
        return {
          ok: true,
          created: !access,
          regenerated: Boolean(access),
          privateUrl: buildWorkshopScannerUrl(origin, credential.rawToken),
          expiresAt: persisted.expires_at,
          ...(await scannerView(eventId)),
        }
      } catch (error) {
        const publicError = publicEventError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async transition(eventId, input, user) {
      if (!canManageEvents(user.role, 'update_event')) return { ok: false, status: 403, message: 'You do not have permission to change this workshop.' }
      try {
        await store.transitionEvent({ eventId, adminUserId: user.id, ...input, now: now() })
        return { ok: true, event: await detail(eventId) }
      } catch (error) {
        const publicError = publicEventError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async finalizeAttendance(eventId, user) {
      if (!canManageEvents(user.role, 'update_event')) return { ok: false, status: 403, message: 'You do not have permission to finalize attendance.' }
      try {
        const finalized = await store.finalizeAttendance({ eventId, adminUserId: user.id, now: now() })
        return { ok: true, finalized }
      } catch (error) {
        const publicError = publicEventError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async attendance(eventId, options) {
      const eventRow = await store.find(eventId)
      if (!eventRow) return null
      const [{ rows, count }, scanner] = await Promise.all([
        store.attendance(eventId, options),
        store.scannerAccess(eventId),
      ])
      const event = mapEvent(eventRow)
      return {
        data: rows.map(mapAttendanceRow),
        summary: {
          registered: event.registeredCount,
          present: event.presentCount,
          remaining: Math.max(0, event.registeredCount - event.presentCount),
          notCheckedIn: event.notCheckedInCount,
          absent: event.absentCount,
          attendanceRate: event.attendanceRate,
          finalized: event.absentCount > 0,
        },
        scanner: scanner ? {
          status: scanner.status,
          lastUsedAt: scanner.last_used_at || null,
          revokedAt: scanner.revoked_at || null,
        } : null,
        pagination: {
          page: options.page,
          limit: options.limit,
          total: count,
          pages: Math.max(1, Math.ceil(count / options.limit)),
        },
      }
    },
  }
}

export function createServerAdminEventsService(options = {}) {
  return createAdminEventsService({ store: createAdminEventsStore(createServerSupabaseClient()), ...options })
}
