import { randomUUID } from 'node:crypto'
import { describeAcademicDepartment, getFacultyLabel } from '../../shared/membership/university-structure.js'
import { createServerSupabaseClient } from './aivex-server.js'
import {
  allowedApplicationActions, canBulkManageApplications, canManageApplication,
} from './admin-applications-permissions.js'
import { createAdminApplicationsStore } from './admin-applications-store.js'
import {
  STAFF_DEPARTMENT_LABELS, effectiveStaffConfirmationStatus, reconstructStaffConfirmationLink,
  staffConfirmationInvitationMessage,
} from './staff-confirmations.js'
import {
  prepareStableStaffConfirmationCredential, staffConfirmationExpiryFrom, staffConfirmationLinkSecret,
} from './staff-confirmation-tokens.js'

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
  accept_member: 'Accepted as member',
  accept_staff: 'Accepted into staff',
  change_staff_department: 'Requested department changed',
  decline: 'Application declined',
  archive: 'Application archived',
  add_note: 'Internal note added',
  invite_staff_confirmation: 'Staff confirmation invited',
  create_stable_staff_confirmation_link: 'Stable Staff confirmation link created',
  regenerate_staff_confirmation_link: 'Staff confirmation link regenerated',
  block_staff_confirmation_link: 'Staff confirmation link blocked',
  unblock_staff_confirmation_link: 'Staff confirmation link unblocked',
  extend_staff_confirmation_deadline: 'Staff confirmation deadline extended',
  request_staff_confirmation_revision: 'Staff confirmation revision requested',
  confirm_staff_membership: 'Staff membership confirmed',
})
const STAFF_CONFIRMATION_ACTIONS = new Set([
  'invite_staff_confirmation', 'create_stable_staff_confirmation_link',
  'regenerate_staff_confirmation_link', 'block_staff_confirmation_link',
  'unblock_staff_confirmation_link', 'extend_staff_confirmation_deadline',
  'request_staff_confirmation_revision',
  'confirm_staff_membership',
])
const CREDENTIAL_ACTIONS = new Set([
  'invite_staff_confirmation', 'create_stable_staff_confirmation_link', 'regenerate_staff_confirmation_link',
])
const ELIGIBLE_STAFF_STATUSES = new Set(['new', 'in_review', 'interview'])
const STAFF_LINK_EXPORT_HEADERS = Object.freeze([
  'Reference', 'Full Name', 'Email', 'Requested Staff Department',
  'Application Status', 'Confirmation Status', 'Link Status', 'Private Link',
  'Phone', 'Study Level', 'Faculty', 'Academic Department', 'Submitted At', 'Deadline',
])

const csvCell = (value, { protectFormula = true } = {}) => {
  let text = value == null ? '' : String(value).replace(/\r\n?/g, '\n')
  if (protectFormula && /^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function buildStaffPrivateLinksCsv(rows) {
  const lines = [STAFF_LINK_EXPORT_HEADERS.map((value) => csvCell(value)).join(',')]
  for (const row of rows) {
    const values = [
      row.reference,
      row.full_name,
      row.email,
      STAFF_DEPARTMENT_LABELS[row.staff_department] || row.primary_field || '',
      STATUS_LABELS[row.application_status] || row.application_status,
      row.confirmation_status || 'not_invited',
      row.linkStatus,
      row.privateLink,
      row.phone,
      row.study_year,
      getFacultyLabel(row.faculty) || row.faculty || '',
      describeAcademicDepartment(row.faculty, row.department),
      row.application_submitted_at,
      row.expires_at,
    ]
    lines.push(values.map((value, index) => csvCell(value, { protectFormula: index !== 7 })).join(','))
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
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

function mapStaffConfirmation(row, now = new Date()) {
  if (!row) return null
  const statusKey = row.effective_status || effectiveStaffConfirmationStatus(row, now)
  return {
    id: row.id || row.confirmation_id,
    applicationId: row.application_id,
    statusKey,
    storedStatus: row.stored_status || row.status,
    invitedAt: row.invited_at,
    expiresAt: row.expires_at,
    revisionMessage: row.revision_message || '',
    submittedAt: row.submitted_at,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
    linkAccess: row.link_access || 'none',
    linkReconstructable: row.link_reconstructable === true,
    submissions: (row.submissions || []).map((submission) => ({
      id: submission.id,
      version: submission.version,
      motivation: submission.motivation,
      workLinks: Array.isArray(submission.work_links) ? submission.work_links : [],
      submittedAt: submission.submitted_at,
    })),
  }
}

function mapApplication(row, role, extras = {}) {
  const latestInterview = extras.interviews?.[0]
  const staffConfirmation = mapStaffConfirmation(extras.staffConfirmation)
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
    // University faculty/department (never the staff department). Legacy rows
    // have no faculty and keep the free text the applicant typed.
    faculty: getFacultyLabel(row.faculty) || null,
    speciality: describeAcademicDepartment(row.faculty, row.department),
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
    decisionReason: row.decision_reason || '',
    acceptedAs: row.accepted_as || null,
    assignedStaffDepartment: row.assigned_staff_department || null,
    interviewAt: latestInterview?.scheduled_at || null,
    interviewLocation: latestInterview?.location || null,
    updatedAt: row.updated_at,
    allowedActions: allowedApplicationActions(role, row, staffConfirmation ? { ...extras.staffConfirmation, effective_status: staffConfirmation.statusKey } : null),
    staffConfirmation,
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
  if (message.includes('staff_confirmation_conflict')) {
    return { status: 409, message: 'This Staff confirmation was updated by another administrator. Refresh it before continuing.' }
  }
  if (error?.code === '40001' || message.includes('application_conflict')) {
    return { status: 409, message: 'This application was updated by another administrator. Refresh it before continuing.' }
  }
  if (message.includes('staff_confirmation_required')) {
    return { status: 409, message: 'A submitted Staff confirmation is required before this application can be accepted.' }
  }
  if (message.includes('staff_confirmation_legacy_conversion_required')) {
    return { status: 409, message: 'This legacy credential must be explicitly converted before its private link can be displayed.' }
  }
  if (error?.code === 'credential_derivation_mismatch') {
    return { status: 503, message: 'The stable Staff-link credential could not be verified.' }
  }
  if (error?.stage === 'staff_link_secret' || message.includes('stable_staff_link_service_not_configured')) {
    return { status: 503, message: 'Stable Staff-link service is not configured.' }
  }
  if (error?.code === '22023') {
    return { status: 409, message: 'This action is not available for the current application state.' }
  }
  return null
}

export function createAdminApplicationsService({
  store,
  now = () => new Date(),
  staffConfirmationEnabled = true,
  env = process.env,
  createId = randomUUID,
} = {}) {
  if (!store) throw Object.assign(new Error('admin_applications_store_required'), { stage: 'configuration', code: 'configuration_error' })

  const requireStableLinkSecret = () => staffConfirmationLinkSecret(env)

  const credentialProposal = async (current) => {
    const confirmationId = current?.confirmation_id || createId()
    const credentialVersion = await store.nextCredentialVersion(current?.confirmation_id)
    const expiresAt = current?.expires_at && new Date(current.expires_at).getTime() > now().getTime()
      ? new Date(current.expires_at)
      : staffConfirmationExpiryFrom(now())
    return {
      ...prepareStableStaffConfirmationCredential({
        confirmationId,
        credentialVersion,
        env,
        secret: requireStableLinkSecret(),
      }),
      expiresAt,
    }
  }

  const revealedCredential = (credential, origin) => {
    if (!origin) throw Object.assign(new Error('staff_link_origin_unavailable'), { code: 'configuration_error', stage: 'staff_link_origin' })
    const { url } = reconstructStaffConfirmationLink({
      origin,
      credential,
      secret: requireStableLinkSecret(),
    })
    if (!url) throw Object.assign(new Error('staff_link_origin_unavailable'), { code: 'configuration_error', stage: 'staff_link_origin' })
    return url
  }

  const ensureStableCredential = async (candidate, user, { origin, convertLegacy }) => {
    if (candidate.link_nonce) {
      return {
        ...candidate,
        privateLink: revealedCredential(candidate, origin),
        linkStatus: candidate.blocked_at ? 'Blocked' : 'Active',
      }
    }
    const proposal = await credentialProposal(candidate)
    const result = await store.applyStaffConfirmationAction({
      applicationId: candidate.application_id,
      adminUserId: user.id,
      action: 'ensure_staff_confirmation_link',
      expectedApplicationUpdatedAt: null,
      expectedConfirmationUpdatedAt: null,
      proposedConfirmationId: proposal.confirmationId,
      linkNonce: proposal.linkNonce,
      tokenHash: proposal.tokenHash,
      credentialVersion: proposal.credentialVersion,
      derivationVersion: proposal.derivationVersion,
      expiresAt: proposal.expiresAt,
      convertLegacy,
      now: now(),
    })
    const stable = { ...candidate, ...result }
    return {
      ...stable,
      privateLink: revealedCredential(stable, origin),
      linkStatus: stable.blocked_at ? 'Blocked' : 'Active',
    }
  }

  const detail = async (applicationId, user) => {
    const row = await store.find(applicationId)
    if (!row) return null
    const [notes, interviews, audit, staffConfirmation] = await Promise.all([
      store.notes(applicationId), store.interviews(applicationId), store.audit(applicationId),
      staffConfirmationEnabled && typeof store.staffConfirmation === 'function'
        ? store.staffConfirmation(applicationId, { submissions: true })
        : null,
    ])
    return mapApplication(row, user.role, { notes, interviews, audit, staffConfirmation })
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

    async listStaffConfirmations(options) {
      const [{ rows, count }, counts] = await Promise.all([
        store.listStaffConfirmations(options), store.staffConfirmationCounts(options),
      ])
      return {
        data: rows.map((row) => ({
          id: row.confirmation_id || row.application_id,
          applicationId: row.application_id,
          name: row.candidate_name,
          ref: row.reference || `JOIN-${String(row.application_id).slice(0, 8).toUpperCase()}`,
          staffDepartment: STAFF_DEPARTMENT_LABELS[row.staff_department] || row.staff_department_label,
          staffDepartmentKey: row.staff_department,
          applicationStatus: STATUS_LABELS[row.application_status] || row.application_status,
          statusKey: row.effective_status,
          linkAccess: row.link_access,
          linkReconstructable: row.link_reconstructable === true,
          invitedAt: row.invited_at,
          expiresAt: row.expires_at,
          submittedAt: row.submitted_at,
          confirmedAt: row.confirmed_at,
          updatedAt: row.updated_at,
          submissionCount: row.submission_count,
        })),
        pagination: {
          page: options.page,
          limit: options.limit,
          total: count,
          pages: Math.max(1, Math.ceil(count / options.limit)),
        },
        counts,
      }
    },

    async act(applicationId, input, user, context = {}) {
      if (!canManageApplication(user.role, input.action)) {
        return { ok: false, status: 403, message: 'You do not have permission to perform this action.' }
      }
      try {
        if (STAFF_CONFIRMATION_ACTIONS.has(input.action)) {
          if (!staffConfirmationEnabled) {
            return { ok: false, status: 503, message: 'Staff confirmation workflow is not enabled yet.' }
          }
          const current = CREDENTIAL_ACTIONS.has(input.action)
            ? await store.credentialForApplication(applicationId)
            : null
          const proposal = CREDENTIAL_ACTIONS.has(input.action) ? await credentialProposal(current) : null
          const deadline = ['request_staff_confirmation_revision', 'extend_staff_confirmation_deadline'].includes(input.action)
            ? staffConfirmationExpiryFrom(now())
            : proposal?.expiresAt
          const actionResult = await store.applyStaffConfirmationAction({
            applicationId,
            adminUserId: user.id,
            action: input.action,
            expectedApplicationUpdatedAt: input.expectedUpdatedAt,
            expectedConfirmationUpdatedAt: input.payload.confirmationUpdatedAt,
            proposedConfirmationId: proposal?.confirmationId,
            linkNonce: proposal?.linkNonce,
            tokenHash: proposal?.tokenHash,
            credentialVersion: proposal?.credentialVersion,
            derivationVersion: proposal?.derivationVersion,
            expiresAt: deadline,
            message: input.payload.revisionMessage,
            convertLegacy: input.action === 'create_stable_staff_confirmation_link',
            now: now(),
          })
          const application = await detail(applicationId, user)
          if (!CREDENTIAL_ACTIONS.has(input.action)) return { ok: true, application }
          const url = revealedCredential(actionResult, context.origin)
          const invitationView = {
            candidate: application.name,
            reference: application.ref,
            url,
            expiresAt: actionResult.expires_at,
            linkState: actionResult.blocked_at ? 'blocked' : 'active',
          }
          invitationView.message = staffConfirmationInvitationMessage({
            ...invitationView, expiresAt: new Date(actionResult.expires_at),
          })
          return { ok: true, application, invitation: invitationView }
        }
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
      if (STAFF_CONFIRMATION_ACTIONS.has(input.action)) {
        return { ok: false, status: 400, message: 'Staff confirmation actions must be completed from an individual candidate dossier.' }
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

    async revealStaffLink(applicationId, user, context = {}) {
      if (user?.role !== 'super_admin') {
        return { ok: false, status: 403, message: 'You do not have permission to reveal private Staff links.' }
      }
      if (!staffConfirmationEnabled) {
        return { ok: false, status: 503, message: 'Staff confirmation workflow is not enabled yet.' }
      }
      try {
        const credential = await store.credentialForApplication(applicationId)
        if (!credential?.confirmation_id || !credential?.credential_id) {
          return { ok: false, status: 404, message: 'No Staff confirmation link exists for this application.' }
        }
        if (!credential.link_nonce) {
          return { ok: false, status: 409, message: 'This is a legacy private link and cannot be displayed. Create a stable link explicitly.' }
        }
        const privateLink = revealedCredential(credential, context.origin)
        await store.recordLinkAudit({
          applicationId,
          adminUserId: user.id,
          action: 'staff_link_revealed',
          metadata: { confirmation_id: credential.confirmation_id, credential_version: credential.credential_version },
          now: now(),
        })
        return {
          ok: true,
          reference: credential.reference || `JOIN-${String(applicationId).slice(0, 8).toUpperCase()}`,
          privateLink,
          linkState: credential.blocked_at ? 'blocked' : 'active',
          expiresAt: credential.expires_at,
        }
      } catch (error) {
        const publicError = publicActionError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },

    async previewStaffLinkExport(user) {
      if (user?.role !== 'super_admin') {
        return { ok: false, status: 403, message: 'You do not have permission to export private Staff links.' }
      }
      if (!staffConfirmationEnabled) {
        return { ok: false, status: 503, message: 'Staff confirmation workflow is not enabled yet.' }
      }
      try {
        requireStableLinkSecret()
        const candidates = await store.staffLinkExportCandidates()
        return {
          ok: true,
          preview: {
            eligible: candidates.length,
            existing: candidates.filter((row) => row.link_nonce).length,
            missing: candidates.filter((row) => !row.credential_id).length,
            legacy: candidates.filter((row) => row.credential_id && !row.link_nonce).length,
            blocked: candidates.filter((row) => row.blocked_at).length,
          },
        }
      } catch (error) {
        const publicError = publicActionError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },

    async exportStaffLinks(user, context = {}) {
      if (user?.role !== 'super_admin') {
        return { ok: false, status: 403, message: 'You do not have permission to export private Staff links.' }
      }
      if (!staffConfirmationEnabled) {
        return { ok: false, status: 503, message: 'Staff confirmation workflow is not enabled yet.' }
      }
      try {
        requireStableLinkSecret()
        const candidates = await store.staffLinkExportCandidates()
        const rows = []
        let created = 0
        let convertedLegacy = 0
        for (const candidate of candidates) {
          if (!ELIGIBLE_STAFF_STATUSES.has(candidate.application_status)) continue
          const wasLegacy = Boolean(candidate.credential_id && !candidate.link_nonce)
          const wasMissing = !candidate.credential_id
          const stable = await ensureStableCredential(candidate, user, {
            origin: context.origin,
            convertLegacy: context.convertLegacy === true,
          })
          if (wasMissing) created += 1
          if (wasLegacy) convertedLegacy += 1
          rows.push({
            ...candidate,
            ...stable,
            confirmation_status: stable.confirmation_status || candidate.confirmation_status || 'invited',
          })
        }
        await store.recordLinkAudit({
          applicationId: null,
          adminUserId: user.id,
          action: 'staff_link_csv_exported',
          metadata: { row_count: rows.length, created_count: created, converted_legacy_count: convertedLegacy },
          now: now(),
        })
        return {
          ok: true,
          csv: buildStaffPrivateLinksCsv(rows),
          fileName: `infinity-staff-private-links-${now().toISOString().slice(0, 10)}.csv`,
          rowCount: rows.length,
          created,
          convertedLegacy,
        }
      } catch (error) {
        const publicError = publicActionError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },
  }
}

export function createServerAdminApplicationsService({ env = process.env } = {}) {
  return createAdminApplicationsService({
    store: createAdminApplicationsStore(createServerSupabaseClient()),
    staffConfirmationEnabled: env.STAFF_CONFIRMATION_API_ENABLED === 'true',
    env,
  })
}
