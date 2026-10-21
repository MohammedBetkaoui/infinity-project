import { createServerSupabaseClient } from './aivex-server.js'
import { canManageEvents } from './admin-events-permissions.js'
import { createAdminEventsStore } from './admin-events-store.js'

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
    updatedAt: row.updated_at,
  }
}

function publicEventError(error) {
  const message = error?.databaseMessage || ''
  if (error?.code === '42501' || message.includes('administrator_not_authorized')) return { status: 403, message: 'You do not have permission to perform this action.' }
  if (error?.code === 'P0002' || message.includes('event_not_found')) return { status: 404, message: 'This event no longer exists.' }
  if (message.includes('organizer_not_found')) return { status: 404, message: 'This organizer is no longer part of the event.' }
  if (error?.code === '40001' || message.includes('event_conflict')) return { status: 409, message: 'This event was updated by another administrator. Refresh it before continuing.' }
  if (message.includes('unknown_member')) return { status: 409, message: 'Some selected members are no longer available. Refresh the list and try again.' }
  if (message.includes('unknown_staff')) return { status: 409, message: 'Some selected organizers are no longer available. Refresh the list and try again.' }
  if (error?.code === '23503') return { status: 409, message: 'Some selected people are no longer available. Refresh the list and try again.' }
  if (error?.code === '23505') return { status: 409, message: 'This change conflicts with an existing record.' }
  if (error?.code === '22023' || error?.code === '23514') return { status: 409, message: 'This action is not valid for the current event.' }
  return null
}

export function createAdminEventsService({ store, now = () => new Date() } = {}) {
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
        return { ok: true, enabled: input.enabled, organizers: rows.map((row) => mapOrganizer(row)) }
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

export function createServerAdminEventsService() {
  return createAdminEventsService({ store: createAdminEventsStore(createServerSupabaseClient()) })
}
