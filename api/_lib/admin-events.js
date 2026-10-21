import { createServerSupabaseClient } from './aivex-server.js'
import { canManageEvents } from './admin-events-permissions.js'
import { createAdminEventsStore } from './admin-events-store.js'
import { createWorkshopEmailProvider, workshopInvitationEmail } from './admin-events-email.js'
import {
  buildWorkshopRegistrationUrl, buildWorkshopScannerUrl, generateWorkshopToken, hashWorkshopToken,
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
const ATTENDANCE_LABELS = Object.freeze({ expected: 'Expected', present: 'Present', absent: 'Absent', excused: 'Excused' })
const DEPARTMENT_LABELS = Object.freeze({ 'dev-tech': 'Dev / Tech', 'design-content': 'Design / Content Creation', 'management-logistics': 'Management / Logistics' })
const ACTION_TITLES = Object.freeze({
  event_created: 'Event created',
  event_updated: 'Event updated',
  members_invited: 'Members invited to event',
  organizer_added: 'Event organizer added',
  organizer_removed: 'Event organizer removed',
  scanner_access_prepared: 'Scanner access enabled for organizer',
  scanner_access_revoked: 'Scanner access disabled for organizer',
  invitation_sent: 'Workshop invitation sent',
  invitation_resent: 'Workshop invitation resent',
  participant_registered: 'Participant registered',
  scanner_access_generated: 'Private scanner access generated',
  scanner_access_regenerated: 'Private scanner access regenerated',
  participant_checked_in: 'Participant checked in',
  attendance_finalized: 'Attendance finalized',
  workshop_status_changed: 'Workshop status changed',
})
const initials = (name) => String(name || '').split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase()

const attendanceState = (presentCount, absentCount, excusedCount, expectedCount) => {
  if (presentCount + absentCount + excusedCount === 0) return 'not_started'
  return expectedCount > 0 ? 'in_progress' : 'completed'
}

// Statistics are computed server-side from the directory read model: the UI
// never aggregates counts itself.
function mapEvent(row) {
  const expectedCount = Number(row.expected_count || 0)
  const presentCount = Number(row.present_count || 0)
  const absentCount = Number(row.absent_count || 0)
  const excusedCount = Number(row.excused_count || 0)
  // Attendance rate counts everyone whose attendance was expected and is not
  // excused: present / (expected + present + absent).
  const attendanceEligible = expectedCount + presentCount + absentCount
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
    visibility: row.visibility,
    status: STATUS_LABELS[row.status] || row.status,
    statusKey: row.status,
    invitedCount: Number(row.invited_count || 0),
    registeredCount: Number(row.registered_count || 0),
    expectedCount,
    presentCount,
    absentCount,
    excusedCount,
    attendanceCount: Number(row.attendance_count || 0),
    organizerCount: Number(row.organizer_count || 0),
    scannerEnabledCount: Number(row.scanner_enabled_count || 0),
    attendanceRate: attendanceEligible > 0 ? Math.round((presentCount / attendanceEligible) * 100) : 0,
    attendanceState: attendanceState(presentCount, absentCount, excusedCount, expectedCount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function eventStatistics(event) {
  return {
    totalInvited: event.invitedCount,
    totalRegistered: event.registeredCount,
    totalOrganizers: event.organizerCount,
    scannerEnabledOrganizers: event.scannerEnabledCount,
    expectedAttendance: event.expectedCount,
    presentCount: event.presentCount,
    absentCount: event.absentCount,
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

function mapInvitedMember(row) {
  const raw = Array.isArray(row.invitation) ? (row.invitation[0] || null) : (row.invitation || null)
  return {
    id: row.id,
    name: row.full_name,
    initials: initials(row.full_name),
    pole: row.primary_pole || 'Unassigned',
    level: row.study_year === 'other' ? 'Other' : row.study_year,
    invitation: raw
      ? {
          status: INVITATION_LABELS[raw.invitation_status] || raw.invitation_status,
          statusKey: raw.invitation_status,
          registeredAt: raw.registered_at || null,
        }
      : null,
  }
}

function mapOrganizer(row) {
  const staff = row.staff || {}
  const member = staff.member || {}
  const accesses = (Array.isArray(row.scanner_access) ? row.scanner_access : [row.scanner_access]).filter(Boolean)
  const access = accesses.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null
  return {
    id: row.id,
    staffProfileId: row.staff_profile_id,
    name: member.full_name || 'Unknown staff member',
    initials: initials(member.full_name),
    department: DEPARTMENT_LABELS[staff.current_department] || staff.current_department || 'Not assigned',
    departmentKey: staff.current_department || null,
    role: staff.internal_role || 'Unassigned',
    staffStatus: staff.status || null,
    scannerEnabled: Boolean(row.scanner_enabled),
    scannerAccess: access ? {
      id: access.id, status: access.status, startsAt: access.starts_at, expiresAt: access.expires_at,
      lastUsedAt: access.last_used_at || null, revokedAt: access.revoked_at || null,
    } : null,
    assignedAt: row.assigned_at,
  }
}

function mapEligibleStaff(row, assignedIds) {
  return {
    id: row.profile_id,
    memberId: row.member_id,
    name: row.full_name,
    initials: initials(row.full_name),
    department: DEPARTMENT_LABELS[row.structure] || row.structure || 'Not assigned',
    departmentKey: row.structure || null,
    role: row.internal_role || 'Unassigned',
    status: row.status,
    assigned: assignedIds.has(row.profile_id),
  }
}

function mapAttendanceRow(row) {
  const member = row.member || {}
  return {
    id: row.id,
    memberId: row.member_id,
    name: member.full_name || 'Unknown member',
    initials: initials(member.full_name),
    pole: member.primary_pole || 'Unassigned',
    level: member.study_year === 'other' ? 'Other' : member.study_year,
    status: ATTENDANCE_LABELS[row.attendance_status] || row.attendance_status,
    statusKey: row.attendance_status,
    checkedInAt: row.checked_in_at || null,
    checkedInBy: row.scanner?.organizer?.staff?.member?.full_name || null,
    updatedAt: row.updated_at,
  }
}

function mapHistoricalInvitation(row) {
  const member = row.member || {}
  const registeredName = [row.participant_first_name, row.participant_last_name].filter(Boolean).join(' ')
  return {
    id: row.id, memberId: row.member_id, name: registeredName || member.full_name || 'Unknown member',
    canonicalName: member.full_name || '', initials: initials(registeredName || member.full_name),
    email: member.email || '', pole: member.primary_pole || 'Unassigned', level: member.study_year || '',
    memberStatus: member.status || null, invitationStatus: row.invitation_status,
    emailDeliveryStatus: row.email_delivery_status, invitedAt: row.invited_at,
    sentAt: row.sent_at || null, openedAt: row.opened_at || null, registeredAt: row.registered_at || null,
    tokenExpiresAt: row.token_expires_at || null,
  }
}

function publicEventError(error) {
  const message = error?.databaseMessage || ''
  if (error?.code === '42501' || message.includes('administrator_not_authorized')) return { status: 403, message: 'You do not have permission to perform this action.' }
  if (error?.code === 'P0002' || message.includes('event_not_found')) return { status: 404, message: 'This event no longer exists.' }
  if (message.includes('organizer_not_found') || message.includes('invitation_not_found')) return { status: 404, message: 'This event relationship no longer exists.' }
  if (error?.code === '40001' || message.includes('event_conflict')) return { status: 409, message: 'This event was updated by another administrator. Refresh it before continuing.' }
  if (message.includes('unknown_member')) return { status: 409, message: 'Some selected members are no longer available. Refresh the list and try again.' }
  if (message.includes('unknown_staff')) return { status: 409, message: 'Some selected organizers are no longer available. Refresh the list and try again.' }
  if (message.includes('registration_not_open')) return { status: 409, message: 'Open workshop registration before sending invitations.' }
  if (message.includes('scanner_not_enabled')) return { status: 409, message: 'Enable scanner eligibility for this organizer first.' }
  if (message.includes('organizer_not_eligible')) return { status: 409, message: 'This organizer is no longer active staff.' }
  if (message.includes('invalid_event_transition')) return { status: 409, message: 'This workshop cannot move to that lifecycle state.' }
  if (message.includes('attendance_not_finalizable')) return { status: 409, message: 'Attendance can only be finalized after the workshop is completed.' }
  if (error?.code === '23503') return { status: 409, message: 'Some selected people are no longer available. Refresh the list and try again.' }
  if (error?.code === '23505') return { status: 409, message: 'This change conflicts with an existing record.' }
  if (error?.code === '22023' || error?.code === '23514') return { status: 409, message: 'This action is not valid for the current event.' }
  return null
}

export function createAdminEventsService({
  store, now = () => new Date(), origin, emailProvider = createWorkshopEmailProvider(), tokenGenerator = generateWorkshopToken,
} = {}) {
  if (!store) throw Object.assign(new Error('admin_events_store_required'), { stage: 'configuration', code: 'configuration_error' })
  const detail = async (eventId) => {
    const row = await store.find(eventId)
    if (!row) return null
    const audit = await store.audit(eventId)
    const event = mapEvent(row)
    return { ...event, statistics: eventStatistics(event), history: mapHistory(audit) }
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
    async members(eventId, options) {
      if (!await store.find(eventId)) return null
      const [{ rows, count }, poles] = await Promise.all([
        store.eligibleMembers(eventId, options),
        store.memberPoles(),
      ])
      return {
        data: rows.map((row) => mapInvitedMember(row)),
        facets: { poles },
        pagination: {
          page: options.page,
          limit: options.limit,
          total: count,
          pages: Math.max(1, Math.ceil(count / options.limit)),
        },
      }
    },
    async invitations(eventId, options) {
      if (!await store.find(eventId)) return null
      const { rows, count } = await store.invitedParticipants(eventId, options)
      return {
        data: rows.map(mapHistoricalInvitation),
        pagination: { page: options.page, limit: options.limit, total: count, pages: Math.max(1, Math.ceil(count / options.limit)) },
        emailConfigured: Boolean(emailProvider.configured),
      }
    },
    async invite(eventId, input, user) {
      if (!canManageEvents(user.role, 'invite_members')) return { ok: false, status: 403, message: 'You do not have permission to invite members.' }
      try {
        const result = await store.inviteMembers({ eventId, adminUserId: user.id, memberIds: input.memberIds, scope: input.scope, pole: input.pole, now: now() })
        return { ok: true, invited: result }
      } catch (error) {
        const publicError = publicEventError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async organizers(eventId) {
      if (!await store.find(eventId)) return null
      const rows = await store.organizers(eventId)
      return { data: rows.map((row) => mapOrganizer(row)) }
    },
    async staff(eventId, options) {
      if (!await store.find(eventId)) return null
      const [{ rows, count }, organizers] = await Promise.all([
        store.eligibleStaff(options),
        store.organizers(eventId),
      ])
      const assignedIds = new Set(organizers.map((row) => row.staff_profile_id))
      return {
        data: rows.map((row) => mapEligibleStaff(row, assignedIds)),
        pagination: {
          page: options.page,
          limit: options.limit,
          total: count,
          pages: Math.max(1, Math.ceil(count / options.limit)),
        },
      }
    },
    async assignOrganizers(eventId, input, user) {
      if (!canManageEvents(user.role, 'assign_organizers')) return { ok: false, status: 403, message: 'You do not have permission to assign organizers.' }
      try {
        const result = await store.assignOrganizers({ eventId, adminUserId: user.id, staffProfileIds: input.staffProfileIds, now: now() })
        const rows = await store.organizers(eventId)
        return { ok: true, added: Number(result.added || 0), skipped: Number(result.requested || 0) - Number(result.added || 0), organizers: rows.map((row) => mapOrganizer(row)) }
      } catch (error) {
        const publicError = publicEventError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async removeOrganizer(eventId, input, user) {
      if (!canManageEvents(user.role, 'remove_organizer')) return { ok: false, status: 403, message: 'You do not have permission to remove organizers.' }
      try {
        await store.removeOrganizer({ eventId, staffProfileId: input.staffProfileId, adminUserId: user.id, now: now() })
        const rows = await store.organizers(eventId)
        return { ok: true, organizers: rows.map((row) => mapOrganizer(row)) }
      } catch (error) {
        const publicError = publicEventError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async setScannerAccess(eventId, input, user) {
      if (!canManageEvents(user.role, 'set_scanner_access')) return { ok: false, status: 403, message: 'You do not have permission to change scanner access.' }
      try {
        await store.setScannerAccess({ eventId, staffProfileId: input.staffProfileId, enabled: input.enabled, adminUserId: user.id, now: now() })
        const rows = await store.organizers(eventId)
        if (!input.enabled) {
          const organizer = rows.find((row) => row.staff_profile_id === input.staffProfileId)
          if (organizer) await store.revokeScannerAccess({ eventId, eventOrganizerId: organizer.id, adminUserId: user.id, now: now() })
        }
        return { ok: true, enabled: input.enabled, organizers: rows.map((row) => mapOrganizer(row)) }
      } catch (error) {
        const publicError = publicEventError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async sendInvitations(eventId, input, user) {
      if (!canManageEvents(user.role, 'invite_members')) return { ok: false, status: 403, message: 'You do not have permission to send invitations.' }
      if (!emailProvider.configured) return { ok: false, status: 503, message: 'Workshop email delivery is not configured.' }
      if (!origin) return { ok: false, status: 503, message: 'The public workshop origin is not configured.' }
      const invitationIds = input.all ? await store.allInvitationIds(eventId) : input.invitationIds
      const outcomes = []
      let cursor = 0
      const worker = async () => {
        while (cursor < invitationIds.length) {
          const invitationId = invitationIds[cursor++]
          const rawToken = tokenGenerator()
          const current = now()
          let prepared = null
          try {
            const event = await store.find(eventId)
            if (!event) throw Object.assign(new Error('event_not_found'), { databaseMessage: 'event_not_found', code: 'P0002' })
            const eventEnd = new Date(event.ends_at || event.starts_at).getTime() + 12 * 60 * 60 * 1000
            const expiresAt = new Date(Math.max(current.getTime() + 60 * 60 * 1000, eventEnd))
            prepared = await store.prepareInvitationDelivery({
              invitationId, eventId, adminUserId: user.id, tokenHash: hashWorkshopToken(rawToken), expiresAt, now: current,
            })
            const registrationUrl = buildWorkshopRegistrationUrl(origin, rawToken)
            const message = workshopInvitationEmail({
              eventTitle: prepared.event_title, memberName: prepared.member_name, startsAt: prepared.starts_at,
              location: prepared.location, speakerName: prepared.speaker_name, registrationUrl,
            })
            const delivered = await emailProvider.send({ to: prepared.email, ...message })
            await store.finishInvitationDelivery({
              invitationId, eventId, adminUserId: user.id, success: delivered.ok,
              providerMessageId: delivered.messageId, resent: Boolean(prepared.resent), now: now(),
            })
            outcomes.push({ id: invitationId, ok: delivered.ok })
          } catch (error) {
            if (prepared) await store.finishInvitationDelivery({
              invitationId, eventId, adminUserId: user.id, success: false,
              providerMessageId: null, resent: Boolean(prepared.resent), now: now(),
            }).catch(() => {})
            const mapped = publicEventError(error)
            if (mapped && invitationIds.length === 1) throw error
            outcomes.push({ id: invitationId, ok: false })
          }
        }
      }
      try {
        await Promise.all(Array.from({ length: Math.min(5, invitationIds.length) }, worker))
      } catch (error) {
        const publicError = publicEventError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
      const sent = outcomes.filter((item) => item.ok).length
      return { ok: true, sent, failed: outcomes.length - sent, total: outcomes.length }
    },
    async scannerCredential(eventId, input, user) {
      if (!canManageEvents(user.role, 'set_scanner_access')) return { ok: false, status: 403, message: 'You do not have permission to manage scanner links.' }
      try {
        if (input.action === 'revoke') {
          const revoked = await store.revokeScannerAccess({ eventId, eventOrganizerId: input.eventOrganizerId, adminUserId: user.id, now: now() })
          return { ok: true, revoked }
        }
        if (!origin) return { ok: false, status: 503, message: 'The public workshop origin is not configured.' }
        const event = await store.find(eventId)
        if (!event) return { ok: false, status: 404, message: 'Event not found.' }
        const current = now()
        const rawToken = tokenGenerator()
        const eventEnd = new Date(event.ends_at || event.starts_at).getTime() + 12 * 60 * 60 * 1000
        const expiresAt = new Date(Math.max(current.getTime() + 60 * 60 * 1000, eventEnd))
        const access = await store.generateScannerAccess({
          eventId, eventOrganizerId: input.eventOrganizerId, adminUserId: user.id,
          tokenHash: hashWorkshopToken(rawToken), startsAt: current, expiresAt, now: current,
        })
        return { ok: true, access, privateUrl: buildWorkshopScannerUrl(origin, rawToken) }
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
      const [{ rows, count }, eventRow, invitations] = await Promise.all([
        store.attendance(eventId, options),
        store.find(eventId),
        store.invitationStates(eventId),
      ])
      const invitationByMember = new Map(invitations.map((item) => [item.member_id, item]))
      const event = eventRow ? mapEvent(eventRow) : null
      if (!event) return null
      return {
        data: rows.map((row) => ({
          ...mapAttendanceRow(row),
          registration: (invitationByMember.get(row.member_id)?.invitation_status) === 'registered' ? 'Registered' : '',
        })),
        summary: event
          ? {
              registered: event.registeredCount,
              present: event.presentCount,
              remaining: Math.max(0, event.registeredCount - event.presentCount),
              absent: event.absentCount,
              attendanceRate: event.attendanceRate,
            }
          : null,
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
