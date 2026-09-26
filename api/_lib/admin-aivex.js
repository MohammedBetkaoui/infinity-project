import { createServerSupabaseClient } from './aivex-server.js'
import { createSupabaseDocumentStore } from './aivex-document-store.js'
import { generateOfficialDocuments } from './aivex-document-generation.js'
import {
  allowedAivexActions, canAccessAivexDocuments, canManageAivex,
} from './admin-aivex-permissions.js'
import { createAdminAivexStore } from './admin-aivex-store.js'
import { CORRECTION_ITEM_DOCUMENT_KEY } from '../../shared/aivex/correction-items.js'

const REGISTRATION_LABELS = Object.freeze({
  submitted: 'Submitted', under_review: 'Under review', approved: 'Approved',
  rejected: 'Rejected', cancelled: 'Cancelled',
})
const DOCUMENT_LABELS = Object.freeze({
  not_generated: 'Not generated', generating: 'Generating', awaiting_signature: 'Awaiting signature',
  signed_document_uploaded: 'Signed document received', under_review: 'Under review',
  changes_required: 'Corrections needed', validated: 'Validated',
  generation_failed: 'Generation issue', expired: 'Expired',
})
const ROLE_LABELS = Object.freeze({
  sub_director_activities: 'Deputy director of activities',
  activities_officer: 'Activities manager',
})
const ACTION_TITLES = Object.freeze({
  start_review: 'File moved to review',
  approve_registration: 'Registration approved',
  request_corrections: 'Corrections requested',
  validate_file: 'AIVEX team accepted',
  reject_registration: 'Registration rejected',
  cancel_registration: 'Registration cancelled',
  verify_activity_official: 'Activities manager verification updated',
  verify_document: 'Confidential document verified',
  invalidate_document: 'Document marked invalid',
  retry_generation: 'Official form generation retried',
  resolve_correction_item: 'Correction item reviewed',
  confidential_document_opened: 'Confidential document opened',
  official_document_downloaded: 'Official form downloaded',
})
const STANDARD_ACTION_REASONS = Object.freeze({
  start_review: 'File moved to administrative review',
  approve_registration: 'Registration approved by an authorised administrator',
  request_corrections: 'Corrections requested for the selected file elements',
  validate_file: 'Administrative verification completed and team accepted',
  reject_registration: 'Registration rejected by an authorised administrator',
  cancel_registration: 'Registration cancelled by an authorised administrator',
  verify_document: 'Document verified in the confidential viewer',
  invalidate_document: 'Document marked invalid in the confidential viewer',
  retry_generation: 'Official form generation retried by an authorised administrator',
})

function normalizeActionInput(input) {
  const payload = { ...(input.payload || {}) }
  let reason = STANDARD_ACTION_REASONS[input.action] || ACTION_TITLES[input.action] || 'AIVEX file updated'
  if (input.action === 'verify_activity_official') {
    reason = payload.verified
      ? 'Activities manager marked as administratively verified'
      : 'Activities manager verification removed'
  }
  if (input.action === 'request_corrections') {
    payload.message = `Corrections are required for: ${payload.items.join(', ')}. Please complete them by ${payload.deadline}.`
  }
  if (input.action === 'resolve_correction_item') {
    reason = payload.decision === 'verified'
      ? 'Correction item accepted by an authorised administrator'
      : 'Correction item sent back to the team for another attempt'
  }
  return { ...input, reason, payload }
}

const formatBytes = (value) => {
  const bytes = Number(value || 0)
  if (!bytes) return '—'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

const fileType = (mime) => ({
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
})[mime] || 'FILE'

const extensionFor = (mime) => ({
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
})[mime] || 'bin'

function mapOverview(row) {
  return {
    id: row.reference,
    ref: row.reference,
    name: row.team_name,
    institution: row.institution_name,
    institutionType: row.institution_custom ? 'Custom institution' : 'Official institution',
    wilaya: `${row.wilaya_code} · ${row.wilaya_name}`,
    wilayaCode: row.wilaya_code,
    manager: row.activity_official_name,
    managerRole: ROLE_LABELS[row.activity_official_role] || row.activity_official_role,
    registration: REGISTRATION_LABELS[row.registration_status] || row.registration_status,
    registrationKey: row.registration_status,
    document: DOCUMENT_LABELS[row.document_status] || row.document_status,
    documentKey: row.document_status,
    completeness: Number(row.completeness || 0),
    submitted: row.submitted_at || row.created_at,
    submittedAt: row.submitted_at || row.created_at,
    updated: row.updated_at,
    updatedAt: row.updated_at,
    signed: row.signed_document_received === true,
    edition: row.edition === 2 ? 'Second edition' : `Edition ${row.edition}`,
    editionNumber: row.edition,
    checklist: [
      row.team_information_complete === true,
      row.activity_official_verified === true,
      row.delegation_head_verified === true,
      row.driver_verified === true,
      row.exact_student_count === true,
      row.student_cards_present === true,
      row.identity_documents_present === true,
      row.official_form_generated === true,
      row.signed_document_received === true,
      row.signed_document_verified === true,
    ],
    studentCardsVerified: row.student_cards_verified === true,
  }
}

const reviewMap = (reviews) => new Map(reviews.map((review) => [review.document_key, review]))
const reviewStatus = (review, present, missing = 'Absent', correction) => {
  if (!present) return missing
  if (correction?.status === 'submitted') return 'Correction submitted'
  if (correction?.status === 'open') return 'Replacement requested'
  if (review?.review_status === 'verified') return 'Verified'
  if (review?.review_status === 'invalid') return 'Invalid'
  return 'Present'
}

function mapDocuments(registration, students, generatedDocuments, submittedDocuments, reviews, activeCorrectionItems = []) {
  const byKey = reviewMap(reviews)
  const correctionFor = (key, category) => activeCorrectionItems.find((item) => (
    item.submitted_document_key === key
    || CORRECTION_ITEM_DOCUMENT_KEY[item.item] === key
    || (category === 'signed' && item.item === 'Signed and stamped form')
  ))
  const official = generatedDocuments.find((document) => document.document_type === 'docx')
  const generatedStatus = official?.generation_status === 'generated'
    ? 'Generated' : official?.generation_status === 'generating'
      ? 'Generating' : official?.generation_status === 'failed'
        ? 'Generation issue' : 'Not generated'
  const documents = [{
    id: 'official', category: 'official', name: `${registration.reference}.docx`,
    person: registration.team_name, kind: 'Official participation form',
    type: 'DOCX', size: formatBytes(official?.file_size_bytes), status: generatedStatus,
    created: official?.updated_at || registration.updated_at,
    template: official?.template_version || registration.template_version || 'Not assigned',
    revision: official?.generation_status === 'generated' ? Math.max(1, registration.current_form_revision || 0) : 0,
    canOpen: official?.generation_status === 'generated', confidential: false,
    errorCode: official?.error_code || null,
  }]

  for (const student of students) {
    const key = `student-${student.position}`
    const review = byKey.get(key)
    const correction = correctionFor(key, 'student')
    const present = Boolean(student.student_card_path)
    documents.push({
      id: key, category: 'student',
      name: `student-card-${String(student.position).padStart(2, '0')}.${extensionFor(student.student_card_mime)}`,
      person: student.full_name, kind: 'Student card', type: fileType(student.student_card_mime),
      size: formatBytes(student.student_card_size_bytes), status: reviewStatus(review, present, 'Absent', correction),
      created: student.created_at, canOpen: present, confidential: true,
      correctionStatus: correction?.status || null,
      reviewedAt: review?.reviewed_at || null,
      reviewedBy: review?.reviewer?.display_name || null,
    })
  }

  for (const identity of [
    { id: 'delegation-leader', prefix: 'delegation_head', person: registration.delegation_head_name, kind: 'Delegation leader · National identity card' },
    { id: 'driver', prefix: 'driver', person: registration.driver_name, kind: 'Driver · National identity card' },
  ]) {
    const review = byKey.get(identity.id)
    const correction = correctionFor(identity.id, 'identity')
    const path = registration[`${identity.prefix}_id_card_path`]
    const mime = registration[`${identity.prefix}_id_card_mime`]
    const purgedAt = registration[`${identity.prefix}_id_card_purged_at`]
    documents.push({
      id: identity.id, category: 'identity', name: `${identity.id}-id.${extensionFor(mime)}`,
      person: identity.person, kind: identity.kind, type: fileType(mime),
      size: formatBytes(registration[`${identity.prefix}_id_card_size`]),
      status: purgedAt ? 'Expired' : reviewStatus(review, Boolean(path), 'Absent', correction),
      created: registration.submitted_at || registration.created_at,
      canOpen: Boolean(path), confidential: true,
      correctionStatus: correction?.status || null,
      reviewedAt: review?.reviewed_at || null,
      reviewedBy: review?.reviewer?.display_name || null,
    })
  }

  const activeVersion = Math.max(0, ...submittedDocuments.map((document) => document.version))
  for (const document of submittedDocuments) {
    const key = `signed-v${document.version}`
    const review = byKey.get(key)
    const correction = document.version === activeVersion ? correctionFor(key, 'signed') : null
    documents.push({
      id: key, category: 'signed', name: document.original_file_name,
      person: registration.team_name, kind: 'Signed participation form',
      type: fileType(document.mime_type), size: formatBytes(document.size_bytes),
      status: reviewStatus(review, true, 'Absent', correction), created: document.uploaded_at || document.created_at,
      version: document.version, active: document.version === activeVersion,
      canOpen: true, confidential: true,
      correctionStatus: correction?.status || null,
      reviewedAt: review?.reviewed_at || null,
      reviewedBy: review?.reviewer?.display_name || null,
    })
  }
  return documents
}

function buildReviewSummary(base, documents, documentsVerified, activeCorrectionItems = []) {
  const confidentialDocuments = documents.filter((document) => (
    document.category === 'student' || document.category === 'identity'
  ))
  const activeSignedDocument = documents.find((document) => document.category === 'signed' && document.active)
  const verifiedDocuments = [
    ...confidentialDocuments,
    ...(activeSignedDocument ? [activeSignedDocument] : []),
  ].filter((document) => document.status === 'Verified').length
  const pendingConfidentialDocuments = confidentialDocuments.filter((document) => document.status !== 'Verified').length

  const groups = [
    {
      key: 'team',
      complete: [base.checklist[0], base.checklist[4]].filter(Boolean).length,
      total: 2,
    },
    {
      key: 'people',
      complete: [base.checklist[1], base.checklist[2], base.checklist[3]].filter(Boolean).length,
      total: 3,
    },
    {
      key: 'documents',
      complete: [base.checklist[7], base.checklist[8], documentsVerified].filter(Boolean).length,
      total: 3,
    },
  ].map((group) => {
    const correctionBlocksGroup = activeCorrectionItems.some((item) => (
      group.key === 'team' ? item.item === 'Team information'
        : group.key === 'people' ? ['Activities manager', 'Delegation leader ID', 'Driver ID'].includes(item.item)
          : item.kind === 'document'
    ))
    const complete = correctionBlocksGroup ? Math.min(group.complete, group.total - 1) : group.complete
    return { ...group, complete, ready: complete === group.total }
  })

  const blockers = []
  if (!base.checklist[0]) blockers.push({ key: 'team_information', tab: 'Team overview' })
  if (!base.checklist[4]) blockers.push({ key: 'student_roster', tab: 'Team overview' })
  if (!base.checklist[1]) blockers.push({ key: 'activities_manager', tab: 'Verification' })
  if (!base.checklist[7]) blockers.push({ key: 'official_form', tab: 'Documents' })
  if (!base.checklist[8]) blockers.push({ key: 'signed_form_missing', tab: 'Documents' })
  if (pendingConfidentialDocuments > 0) {
    blockers.push({ key: 'confidential_documents', count: pendingConfidentialDocuments, tab: 'Documents' })
  }
  if (activeSignedDocument && activeSignedDocument.status !== 'Verified') {
    blockers.push({ key: 'signed_form_review', tab: 'Documents' })
  }
  if (activeCorrectionItems.length > 0) {
    blockers.push({ key: 'correction_cycle', count: activeCorrectionItems.length, tab: 'Verification' })
  }
  const isClosed = ['rejected', 'cancelled'].includes(base.registrationKey)
  const readyForFinalValidation = !isClosed
    && base.completeness === 100
    && documentsVerified
    && activeCorrectionItems.length === 0
  let nextAction = { key: 'review_required', tab: blockers[0]?.tab || 'Verification' }

  if (base.documentKey === 'validated') nextAction = { key: 'complete', tab: 'History' }
  else if (isClosed) nextAction = { key: 'closed', tab: 'History' }
  else if (readyForFinalValidation) nextAction = { key: 'validate_file', tab: 'Verification' }

  return {
    groups,
    blockers,
    documents: { verified: verifiedDocuments, total: 6 },
    readyForFinalValidation,
    nextAction,
  }
}

function mapHistory(registration, generated, submitted, corrections, audit) {
  return [
    {
      title: 'Registration created', actor: 'AIVEX registration form',
      at: registration.submitted_at || registration.created_at, kind: 'Registration',
    },
    ...generated.map((document) => ({
      title: document.generation_status === 'generated' ? 'Official DOCX generated' : 'Official document generation failed',
      actor: 'AIVEX document service', at: document.updated_at || document.created_at,
      kind: 'Document', note: document.error_code || undefined,
    })),
    ...submitted.map((document) => ({
      title: `Signed document deposited · v${document.version}`,
      actor: 'Team secure upload', at: document.uploaded_at || document.created_at,
      kind: 'Upload',
    })),
    ...corrections.map((correction) => ({
      title: 'Corrections requested', actor: correction.requester?.display_name || 'Infinity Administration',
      at: correction.created_at, kind: 'Administration',
    })),
    ...audit.map((event) => ({
      title: ACTION_TITLES[event.action] || 'AIVEX file updated',
      actor: event.administrator?.display_name || 'Infinity Administration',
      at: event.created_at, kind: event.sensitivity === 'confidential' ? 'Confidential' : 'Administration',
      documentKey: event.metadata?.document_key,
      sensitivity: event.sensitivity,
    })),
  ].filter((item) => item.at).sort((left, right) => new Date(left.at) - new Date(right.at))
}

function publicActionError(error) {
  const message = error?.databaseMessage || ''
  if (error?.code === '42501' || message.includes('administrator_not_authorized')) {
    return { status: 403, message: 'You do not have permission to perform this action.' }
  }
  if (error?.code === 'P0002' || message.includes('not_found')) {
    return { status: 404, message: 'This AIVEX file or document no longer exists.' }
  }
  if (error?.code === '40001' || message.includes('aivex_registration_conflict')) {
    return { status: 409, message: 'This file was updated by another administrator. Refresh it before continuing.' }
  }
  if (error?.code === '23505' || message.includes('aivex_correction_cycle_active')) {
    return { status: 409, message: 'A correction cycle is already active for this team. Finish it before creating another one.' }
  }
  if (error?.code === '22023') {
    return { status: 409, message: message.includes('aivex_validation_incomplete') || message.includes('aivex_correction_cycle_active')
      ? 'The file still contains unverified or missing information.'
      : 'This action is not available for the current AIVEX file.' }
  }
  return null
}

export function createAdminAivexService({ store, documentStore, now = () => new Date() } = {}) {
  if (!store) throw Object.assign(new Error('admin_aivex_store_required'), { stage: 'configuration', code: 'configuration_error' })

  const detail = async (reference, user) => {
    const registration = await store.findByReference(reference)
    if (!registration) return null
    const [overview, students, generated, submitted, reviews, corrections, correctionItems, audit] = await Promise.all([
      store.overview(registration.id), store.students(registration.id),
      store.generatedDocuments(registration.id), store.submittedDocuments(registration.id),
      store.documentReviews(registration.id), store.corrections(registration.id),
      store.correctionItems(registration.id), store.audit(registration.id),
    ])
    if (!overview) return null
    const base = mapOverview(overview)
    const latestCorrection = corrections.find((correction) => !correction.resolved_at)
    const activeCorrectionItems = latestCorrection
      ? correctionItems.filter((item) => item.correction_request_id === latestCorrection.id && item.status !== 'verified')
      : []
    const docs = mapDocuments(registration, students, generated, submitted, reviews, activeCorrectionItems)
    const documentsVerified = docs
      .filter((document) => document.category === 'student' || document.category === 'identity' || (document.category === 'signed' && document.active))
      .every((document) => document.status === 'Verified')
    const reviewSummary = buildReviewSummary(base, docs, documentsVerified, activeCorrectionItems)
    return {
      ...base,
      managerEmail: registration.activity_official_email,
      managerPhone: registration.activity_official_phone,
      leader: registration.delegation_head_name,
      leaderPhone: registration.delegation_head_phone,
      leaderRfid: registration.delegation_head_rfid,
      driver: registration.driver_name,
      driverPhone: registration.driver_phone,
      driverRfid: registration.driver_rfid,
      formVersion: `AIVEX-${registration.form_version}.0`,
      source: registration.source || 'AIVEX registration form',
      students: students.map((student) => ({
        position: String(student.position).padStart(2, '0'),
        name: student.full_name, phone: student.phone,
        bac: String(student.bac_year), rfid: student.rfid_number,
      })),
      docs,
      documentsVerified,
      reviewSummary,
      canValidate: reviewSummary.readyForFinalValidation,
      canRequestCorrections: !latestCorrection && ['signed_document_uploaded', 'under_review'].includes(base.documentKey),
      allowedActions: allowedAivexActions(user.role),
      correctionRequest: latestCorrection ? {
        id: latestCorrection.id,
        items: latestCorrection.items,
        deadline: latestCorrection.due_at,
        message: latestCorrection.team_message,
        itemStatuses: correctionItems
          .filter((item) => item.correction_request_id === latestCorrection.id)
          .map((item) => ({
            id: item.id,
            item: item.item,
            kind: item.kind,
            status: item.status,
            submittedFields: item.submitted_fields,
            submittedDocumentKey: item.submitted_document_key,
            submittedAt: item.submitted_at,
            reviewedAt: item.reviewed_at,
            reviewNote: item.review_note,
            reviewer: item.reviewer?.display_name || null,
          })),
      } : null,
      history: mapHistory(registration, generated, submitted, corrections, audit),
      documentAccess: audit.filter((event) => event.action === 'confidential_document_opened').map((event) => ({
        actor: event.administrator?.display_name || 'Infinity Administration',
        at: event.created_at,
        documentKey: event.metadata?.document_key,
      })),
    }
  }

  return {
    async list(options, user) {
      const [{ rows, count }, summaryRows] = await Promise.all([
        store.list(options), store.summaryRows(options.edition),
      ])
      const documentCounts = Object.fromEntries(Object.keys(DOCUMENT_LABELS).map((status) => [status, 0]))
      for (const row of summaryRows) documentCounts[row.document_status] = (documentCounts[row.document_status] || 0) + 1
      return {
        data: rows.map(mapOverview),
        pagination: { page: options.page, limit: options.limit, total: count, pages: Math.max(1, Math.ceil(count / options.limit)) },
        summary: {
          registered: summaryRows.length,
          complete: summaryRows.filter((row) => Number(row.completeness) === 100).length,
          awaitingSignature: documentCounts.awaiting_signature || 0,
          signedReceived: summaryRows.filter((row) => row.signed_document_received).length,
          underReview: documentCounts.under_review || 0,
          corrections: documentCounts.changes_required || 0,
          validated: documentCounts.validated || 0,
          documentCounts,
        },
        facets: {
          wilayas: [...new Set(summaryRows.map((row) => `${row.wilaya_code} · ${row.wilaya_name}`).filter(Boolean))],
          institutions: [...new Set(summaryRows.map((row) => row.institution_name).filter(Boolean))].sort(),
        },
        role: user.role,
      }
    },

    detail,

    async act(reference, input, user) {
      if (!canManageAivex(user.role, input.action)) {
        return { ok: false, status: 403, message: 'You do not have permission to perform this action.' }
      }
      const normalizedInput = normalizeActionInput(input)
      const registration = await store.findByReference(reference)
      if (!registration) return { ok: false, status: 404, message: 'This AIVEX file no longer exists.' }
      try {
        if (normalizedInput.action === 'retry_generation') {
          if (new Date(registration.updated_at).getTime() !== new Date(normalizedInput.expectedUpdatedAt).getTime()) {
            return { ok: false, status: 409, message: 'This file was updated by another administrator. Refresh it before continuing.' }
          }
          if (!documentStore) throw Object.assign(new Error('aivex_document_store_required'), { stage: 'configuration', code: 'configuration_error' })
          const result = await generateOfficialDocuments({ store: documentStore, registrationId: registration.id, now: now() })
          if (!result.attempted) return { ok: false, status: 409, message: 'Document generation is already complete or currently in progress.' }
          await store.auditEvent({
            registrationId: registration.id, adminUserId: user.id, action: 'retry_generation',
            metadata: { reason: normalizedInput.reason, generated: result.docx === true }, now: now(),
          })
          return { ok: true, team: await detail(reference, user) }
        }

        await store.applyAction({
          registrationId: registration.id,
          adminUserId: user.id,
          action: normalizedInput.action,
          expectedUpdatedAt: normalizedInput.expectedUpdatedAt,
          reason: normalizedInput.reason,
          payload: normalizedInput.payload,
          now: now(),
        })
        return { ok: true, team: await detail(reference, user) }
      } catch (error) {
        const publicError = publicActionError(error)
        if (publicError) return { ok: false, ...publicError }
        throw error
      }
    },

    async document(reference, documentKey, user) {
      if (!canAccessAivexDocuments(user.role)) return { ok: false, status: 403, message: 'You do not have permission to open this document.' }
      const registration = await store.findByReference(reference)
      if (!registration) return { ok: false, status: 404, message: 'Document not found.' }
      const resolved = await store.resolveDocument(registration, documentKey)
      if (!resolved) return { ok: false, status: 404, message: 'Document not found.' }

      const accessTime = now()
      await store.auditEvent({
        registrationId: registration.id,
        adminUserId: user.id,
        action: resolved.confidential ? 'confidential_document_opened' : 'official_document_downloaded',
        sensitivity: resolved.confidential ? 'confidential' : 'standard',
        metadata: { document_key: documentKey },
        now: accessTime,
      })
      const buffer = await store.downloadDocument(resolved.bucket, resolved.path)
      return { ok: true, ...resolved, buffer }
    },
  }
}

export function createServerAdminAivexService() {
  const supabase = createServerSupabaseClient()
  return createAdminAivexService({
    store: createAdminAivexStore(supabase),
    documentStore: createSupabaseDocumentStore(supabase),
  })
}
