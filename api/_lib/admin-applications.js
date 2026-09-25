import { createServerSupabaseClient } from './aivex-server.js'
import {
  allowedApplicationActions, canBulkManageApplications, canManageApplication,
} from './admin-applications-permissions.js'
import { createAdminApplicationsStore } from './admin-applications-store.js'

const STATUS_LABELS = Object.freeze({
  new: 'New', in_review: 'In review', interview: 'Interview',
  accepted: 'Accepted', declined: 'Declined', archived: 'Archived',
})
const TYPE_LABELS = Object.freeze({ member: 'Member', staff: 'Staff' })
const EXPERIENCE_LABELS = Object.freeze({
  starting: 'Starting out', learning: 'Already learning', building: 'Building projects',
})
const AVAILABILITY_LABELS = Object.freeze({
  weekly: 'A few hours each week',
  events: 'Mostly around events and projects',
  flexible: 'Variable during the semester',
})
const DEPARTMENT_SLUGS = Object.freeze({
  'Dev / Tech': 'dev-tech',
  'Design / Content Creation': 'design-content',
  'Management / Logistics': 'management-logistics',
})
const ACTION_TITLES = Object.freeze({
  start_review: 'Application moved to review',
  schedule_interview: 'Interview scheduled',
  request_information: 'More information requested',
  accept_member: 'Accepted as member',
  accept_staff: 'Accepted into staff',
  change_staff_department: 'Requested department changed',
  decline: 'Application declined',
  archive: 'Application archived',
  add_note: 'Internal note added',
})

const administrativeReason = (action, reason) => {
  const supplied = typeof reason === 'string' ? reason.trim() : ''
  if (supplied || action === 'add_note') return supplied
  return ACTION_TITLES[action] || 'Application updated'
}

const initials = (name) => String(name || '').split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase()

function normalizePayload(action, payload) {
  if (action === 'change_staff_department') {
    return { ...payload, department: DEPARTMENT_SLUGS[payload.department] || payload.department }
  }
  return payload
}

function mapApplication(row, role, extras = {}) {
  const latestInterview = extras.interviews?.[0]
  const history = [
    {
      title: 'Application received', actor: 'Infinity Join form',
      at: row.submitted_at || row.created_at, kind: 'Submission',
    },
    ...(extras.interviews || []).map((item) => ({
      title: 'Interview scheduled', actor: item.creator?.display_name || 'Infinity Administration',
      at: item.created_at, kind: 'Interview', note: `${item.scheduled_at} · ${item.location}`,
    })),
    ...(extras.notes || []).map((item) => ({
      title: 'Internal note added', actor: item.author?.display_name || 'Infinity Administration',
      at: item.created_at, kind: 'Internal note', note: item.body,
    })),
    ...(extras.audit || []).filter((item) => !['schedule_interview', 'add_note'].includes(item.action)).map((item) => ({
      title: ACTION_TITLES[item.action] || 'Application updated',
      actor: item.administrator?.display_name || 'Infinity Administration',
      at: item.created_at, kind: 'Administration',
    })),
  ].filter((item) => item.at).sort((left, right) => new Date(left.at) - new Date(right.at))

  return {
    id: row.id,
    ref: row.reference || `JOIN-${String(row.id).slice(0, 8).toUpperCase()}`,
    name: row.full_name,
    initials: initials(row.full_name),
    email: row.email,
    phone: row.phone,
    level: row.study_year === 'other' ? 'Other' : row.study_year,
    speciality: row.department,
    type: TYPE_LABELS[row.join_type] || row.join_type,
    track: row.primary_field,
    experience: EXPERIENCE_LABELS[row.experience] || row.experience,
    availability: AVAILABILITY_LABELS[row.availability] || row.availability,
    date: row.submitted_at || row.created_at,
    submittedAt: row.submitted_at || row.created_at,
    status: STATUS_LABELS[row.status] || row.status,
    statusKey: row.status,
    source: row.source || 'Infinity Join form',
    form: `JOIN-${row.form_version || 1}`,
    consent: row.consent === true,
    requestMessage: row.requested_information || '',
    decisionReason: row.decision_reason || '',
    acceptedAs: row.accepted_as || null,
    assignedStaffDepartment: row.assigned_staff_department || null,
    interviewAt: latestInterview?.scheduled_at || null,
    interviewLocation: latestInterview?.location || null,
    updatedAt: row.updated_at,
    allowedActions: allowedApplicationActions(role, row),
    history,
  }
}

function publicActionError(error) {
  const message = error?.databaseMessage || ''
  if (error?.code === '42501' || message.includes('administrator_not_authorized')) {
    return { status: 403, message: 'You do not have permission to perform this action.' }
  }
  if (error?.code === 'P0002' || message.includes('application_not_found')) {
    return { status: 404, message: 'This application no longer exists.' }
  }
  if (error?.code === '40001' || message.includes('application_conflict')) {
    return { status: 409, message: 'This application was updated by another administrator. Refresh it before continuing.' }
  }
  if (error?.code === '22023') {
    return { status: 409, message: 'This action is not available for the current application state.' }
  }
  return null
}

export function createAdminApplicationsService({ store, now = () => new Date() } = {}) {
  if (!store) throw Object.assign(new Error('admin_applications_store_required'), { stage: 'configuration', code: 'configuration_error' })

  const detail = async (applicationId, user) => {
    const row = await store.find(applicationId)
    if (!row) return null
    const [notes, interviews, audit] = await Promise.all([
      store.notes(applicationId), store.interviews(applicationId), store.audit(applicationId),
    ])
    return mapApplication(row, user.role, { notes, interviews, audit })
  }

  return {
    async list(options, user) {
      const [{ rows, count }, counts, specialities] = await Promise.all([
        store.list(options), store.statusCounts(options), store.specialities(),
      ])
      return {
        data: rows.map((row) => mapApplication(row, user.role)),
        pagination: {
          page: options.page,
          limit: options.limit,
          total: count,
          pages: Math.max(1, Math.ceil(count / options.limit)),
        },
        counts,
        facets: { specialities },
      }
    },

    detail,

    async act(applicationId, input, user) {
      if (!canManageApplication(user.role, input.action)) {
        return { ok: false, status: 403, message: 'You do not have permission to perform this action.' }
      }
      try {
        await store.applyAction({
          applicationId,
          adminUserId: user.id,
          action: input.action,
          expectedUpdatedAt: input.expectedUpdatedAt,
          reason: administrativeReason(input.action, input.reason),
          payload: normalizePayload(input.action, input.payload),
          now: now(),
        })
        return { ok: true, application: await detail(applicationId, user) }
      } catch (error) {
        const publicError = publicActionError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },

    async bulk(input, user) {
      if (!canBulkManageApplications(user.role) || !canManageApplication(user.role, input.action)) {
        return { ok: false, status: 403, message: 'You do not have permission to perform this action.' }
      }
      const succeeded = []
      const failed = []
      for (const record of input.records) {
        const result = await this.act(record.id, {
          action: input.action,
          expectedUpdatedAt: record.expectedUpdatedAt,
          reason: input.reason,
          payload: {},
        }, user)
        if (result.ok) succeeded.push(record.id)
        else failed.push({ id: record.id, status: result.status, message: result.message })
      }
      return { ok: true, succeeded, failed }
    },
  }
}

export function createServerAdminApplicationsService() {
  return createAdminApplicationsService({
    store: createAdminApplicationsStore(createServerSupabaseClient()),
  })
}
