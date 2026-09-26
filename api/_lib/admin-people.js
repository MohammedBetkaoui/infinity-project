import { createServerSupabaseClient } from './aivex-server.js'
import { allowedPeopleActions, canBulkManagePeople, canManagePeople } from './admin-people-permissions.js'
import { createAdminPeopleStore } from './admin-people-store.js'

const STATUS_LABELS = Object.freeze({ active: 'Active', on_pause: 'On pause', inactive: 'Inactive', alumni: 'Alumni', archived: 'Archived' })
const AVAILABILITY_LABELS = Object.freeze({ weekly: 'A few hours each week', events: 'Mostly around events and projects', flexible: 'Variable during the semester' })
const DEPARTMENT_LABELS = Object.freeze({ 'dev-tech': 'Dev / Tech', 'design-content': 'Design / Content Creation', 'management-logistics': 'Management / Logistics' })
const ACTION_TITLES = Object.freeze({
  update_profile: 'Profile information updated', change_pole: 'Primary pole changed', promote_to_staff: 'Promoted to staff',
  assign_role: 'Internal role assigned', move_department: 'Staff department changed', assign_project: 'Project assigned',
  change_availability: 'Availability changed', set_status: 'Profile status changed',
  add_note: 'Internal note added', create_profile: 'Profile created',
})
const initials = (name) => String(name || '').split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
const dateLabel = (value) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Algiers' }).format(date) : 'Not recorded'
}

function mapPerson(row, role, extras = {}) {
  const isStaff = row.kind === 'staff'
  const activities = extras.activities || []
  const history = [
    { title: isStaff ? 'Staff profile created' : 'Member joined Infinity', actor: row.source_application_id ? 'Infinity Join workflow' : 'Infinity Administration', at: row.created_at, kind: 'Directory' },
    ...(extras.notes || []).map((item) => ({ title: 'Internal note added', actor: item.author?.display_name || 'Infinity Administration', at: item.created_at, kind: 'Internal note', note: item.body })),
    ...(extras.audit || []).filter((item) => item.action !== 'add_note').map((item) => ({ title: ACTION_TITLES[item.action] || 'Profile updated', actor: item.administrator?.display_name || 'Infinity Administration', at: item.created_at, kind: 'Administration' })),
  ].filter((item) => item.at).sort((a, b) => new Date(a.at) - new Date(b.at))
  return {
    id: row.profile_id, ref: `${isStaff ? 'STF' : 'MEM'}-${String(row.profile_id).slice(0, 8).toUpperCase()}`,
    memberId: row.member_id,
    name: row.full_name, initials: initials(row.full_name), email: row.email, phone: row.phone || 'Not provided',
    level: row.study_year === 'other' ? 'Other' : row.study_year, speciality: row.speciality,
    availability: AVAILABILITY_LABELS[row.availability] || row.availability,
    availabilityKey: row.availability, status: STATUS_LABELS[row.status] || row.status, statusKey: row.status,
    cohort: row.cohort, joined: dateLabel(row.joined_at), joinedAt: row.joined_at,
    last: row.last_activity_at ? dateLabel(row.last_activity_at) : 'No activity recorded', lastActivityAt: row.last_activity_at,
    pole: isStaff ? undefined : row.structure, department: isStaff ? (DEPARTMENT_LABELS[row.structure] || row.structure) : undefined,
    departmentKey: isStaff ? row.structure : undefined,
    requested: isStaff ? (DEPARTMENT_LABELS[row.requested_department] || row.requested_department || 'Not requested') : undefined,
    role: isStaff ? row.internal_role : undefined, skills: isStaff ? undefined : '',
    events: isStaff ? undefined : activities.map((item) => item.event_name),
    assignedProjects: isStaff ? activities.map((item) => item.project_name) : undefined,
    activityCount: Number(row.activity_count || 0), hasStaffProfile: Boolean(row.has_staff_profile),
    updatedAt: row.updated_at, allowedActions: allowedPeopleActions(role, row.kind, row), history,
  }
}

function publicActionError(error) {
  const message = error?.databaseMessage || ''
  if (error?.code === '42501' || message.includes('administrator_not_authorized')) return { status: 403, message: 'You do not have permission to perform this action.' }
  if (error?.code === 'P0002' || message.includes('profile_not_found')) return { status: 404, message: 'This profile no longer exists.' }
  if (error?.code === '40001' || message.includes('profile_conflict')) return { status: 409, message: 'This profile was updated by another administrator. Refresh it before continuing.' }
  if (error?.code === '23505') return { status: 409, message: 'A profile with these identifying details already exists.' }
  if (error?.code === '22023' || error?.code === '23514') return { status: 409, message: 'This action is not valid for the current profile.' }
  return null
}

export function createAdminPeopleService({ store, now = () => new Date() } = {}) {
  if (!store) throw Object.assign(new Error('admin_people_store_required'), { stage: 'configuration', code: 'configuration_error' })
  const detail = async (kind, profileId, user) => {
    const row = await store.find(kind, profileId)
    if (!row) return null
    const [notes, activities, audit] = await Promise.all([store.notes(row.member_id), store.activities(kind, row), store.audit(kind, profileId)])
    return mapPerson(row, user.role, { notes, activities, audit })
  }
  return {
    async list(kind, options, user) {
      const [{ rows, count }, counts, facets] = await Promise.all([store.list(kind, options), store.statusCounts(kind, options), store.facets(kind)])
      return { data: rows.map((row) => mapPerson(row, user.role)), pagination: { page: options.page, limit: options.limit, total: count, pages: Math.max(1, Math.ceil(count / options.limit)) }, counts, facets: { ...facets, structures: kind === 'staff' ? facets.structures.map((value) => DEPARTMENT_LABELS[value] || value) : facets.structures } }
    },
    detail,
    async create(kind, payload, user) {
      if (!canManagePeople(user.role, kind, kind === 'staff' ? 'assign_role' : 'update_profile')) return { ok: false, status: 403, message: 'You do not have permission to create profiles.' }
      try {
        const profileId = await store.createProfile({ kind, adminUserId: user.id, payload, now: now() })
        return { ok: true, profile: await detail(kind, profileId, user) }
      } catch (error) {
        const publicError = publicActionError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async act(kind, profileId, input, user) {
      if (!canManagePeople(user.role, kind, input.action)) return { ok: false, status: 403, message: 'You do not have permission to perform this action.' }
      try {
        await store.applyAction({ kind, profileId, adminUserId: user.id, ...input, now: now() })
        return { ok: true, profile: await detail(kind, profileId, user) }
      } catch (error) {
        const publicError = publicActionError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
    async bulk(kind, input, user) {
      if (!canBulkManagePeople(user.role) || !canManagePeople(user.role, kind, input.action)) return { ok: false, status: 403, message: 'You do not have permission to perform this action.' }
      const succeeded = []; const failed = []
      for (const record of input.records) {
        const result = await this.act(kind, record.id, { action: input.action, payload: input.payload, reason: input.reason, expectedUpdatedAt: record.expectedUpdatedAt }, user)
        if (result.ok) succeeded.push(record.id); else failed.push({ id: record.id, status: result.status, message: result.message })
      }
      return { ok: true, succeeded, failed }
    },
  }
}

export function createServerAdminPeopleService() {
  return createAdminPeopleService({ store: createAdminPeopleStore(createServerSupabaseClient()) })
}
