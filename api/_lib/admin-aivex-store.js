const OVERVIEW_COLUMNS = [
  'reference', 'edition', 'form_version', 'team_name', 'wilaya_code', 'wilaya_name',
  'institution_name', 'institution_custom', 'activity_official_name',
  'activity_official_role', 'registration_status', 'document_status',
  'submitted_at', 'created_at', 'updated_at', 'team_information_complete',
  'activity_official_verified', 'delegation_head_verified', 'driver_verified',
  'exact_student_count', 'student_cards_present', 'identity_documents_present',
  'official_form_generated', 'signed_document_received', 'signed_document_verified',
  'student_cards_verified', 'completeness', 'attention_rank',
].join(', ')

const REGISTRATION_COLUMNS = [
  'id', 'reference', 'edition', 'form_version', 'team_name', 'wilaya_code', 'wilaya_name',
  'institution_id', 'institution_name', 'institution_custom', 'activity_official_role',
  'activity_official_name', 'activity_official_email', 'activity_official_phone',
  'delegation_head_name', 'delegation_head_phone', 'delegation_head_rfid',
  'delegation_head_id_card_path', 'delegation_head_id_card_mime',
  'delegation_head_id_card_size', 'delegation_head_id_card_purged_at',
  'driver_name', 'driver_phone', 'driver_rfid', 'driver_id_card_path',
  'driver_id_card_mime', 'driver_id_card_size', 'driver_id_card_purged_at',
  'student_count', 'registration_status', 'document_status', 'current_form_revision',
  'template_version', 'source', 'submitted_at', 'created_at', 'updated_at',
].join(', ')

const SORT_COLUMNS = Object.freeze({
  attention: 'attention_rank',
  completion: 'completeness',
  reference: 'reference',
  team: 'team_name',
  institution: 'institution_name',
  wilaya: 'wilaya_code',
  registration: 'registration_status',
  document: 'document_status',
  submitted: 'submitted_at',
  updated: 'updated_at',
})

const fail = (stage, error) => {
  throw Object.assign(new Error(stage), {
    stage,
    code: error?.code || error?.statusCode || error?.status || 'database_error',
    databaseMessage: error?.message,
  })
}

const safeSearch = (value) => String(value || '')
  .normalize('NFKC')
  .replace(/[^\p{L}\p{N}\s@.+_-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 120)

function applyFilters(query, options) {
  let next = query.eq('edition', options.edition)
  const search = safeSearch(options.q)
  if (search) next = next.ilike('search_text', `%${search}%`)
  if (options.registration) next = next.eq('registration_status', options.registration)
  if (options.document) next = next.eq('document_status', options.document)
  if (options.wilaya) {
    next = /^\d{2}$/.test(options.wilaya)
      ? next.eq('wilaya_code', options.wilaya)
      : next.eq('wilaya_name', options.wilaya)
  }
  if (options.institution) next = next.eq('institution_name', options.institution)
  if (options.complete === 'complete') next = next.eq('completeness', 100)
  if (options.complete === 'incomplete') next = next.lt('completeness', 100)
  if (options.signed === 'present') next = next.eq('signed_document_received', true)
  if (options.signed === 'absent') next = next.eq('signed_document_received', false)
  if (options.dateFrom) next = next.gte('submitted_at', `${options.dateFrom}T00:00:00.000Z`)
  if (options.dateTo) next = next.lte('submitted_at', `${options.dateTo}T23:59:59.999Z`)
  return next
}

export function createAdminAivexStore(supabase) {
  if (!supabase) throw Object.assign(new Error('admin_aivex_store_unavailable'), { stage: 'configuration', code: 'configuration_error' })

  return {
    async list(options) {
      const [sortName, sortDirection] = options.sort.split('_')
      const sortColumn = SORT_COLUMNS[sortName] || 'attention_rank'
      const from = (options.page - 1) * options.limit
      const to = from + options.limit - 1
      let query = supabase.from('admin_aivex_case_overview').select(OVERVIEW_COLUMNS, { count: 'exact' })
      query = applyFilters(query, options)
        .order(sortColumn, { ascending: sortDirection === 'asc' })
        .order('submitted_at', { ascending: false })
        .range(from, to)
      const { data, error, count } = await query
      if (error) fail('aivex_list', error)
      return { rows: data || [], count: Number(count || 0) }
    },

    async summaryRows(edition) {
      const { data, error } = await supabase
        .from('admin_aivex_case_overview')
        .select('reference, registration_status, document_status, completeness, signed_document_received, wilaya_code, wilaya_name, institution_name')
        .eq('edition', edition)
        .order('submitted_at', { ascending: false })
        .limit(5000)
      if (error) fail('aivex_summary', error)
      return data || []
    },

    async findByReference(reference) {
      const { data, error } = await supabase
        .from('aivex_registrations')
        .select(REGISTRATION_COLUMNS)
        .eq('reference', reference)
        .eq('form_version', 4)
        .maybeSingle()
      if (error) fail('aivex_registration', error)
      return data
    },

    async overview(registrationId) {
      const { data, error } = await supabase
        .from('admin_aivex_case_overview')
        .select(OVERVIEW_COLUMNS)
        .eq('registration_id', registrationId)
        .maybeSingle()
      if (error) fail('aivex_overview', error)
      return data
    },

    async students(registrationId) {
      const { data, error } = await supabase
        .from('aivex_students')
        .select('position, full_name, phone, bac_year, rfid_number, student_card_path, student_card_mime, student_card_size_bytes, created_at, updated_at')
        .eq('registration_id', registrationId)
        .order('position', { ascending: true })
      if (error) fail('aivex_students', error)
      return data || []
    },

    async generatedDocuments(registrationId) {
      const { data, error } = await supabase
        .from('aivex_generated_documents')
        .select('document_type, generation_status, mime_type, file_size_bytes, template_version, error_code, created_at, updated_at')
        .eq('registration_id', registrationId)
        .order('created_at', { ascending: false })
      if (error) fail('aivex_generated_documents', error)
      return data || []
    },

    async submittedDocuments(registrationId) {
      const { data, error } = await supabase
        .from('aivex_submitted_documents')
        .select('version, original_file_name, mime_type, size_bytes, status, uploaded_at, created_at, updated_at')
        .eq('registration_id', registrationId)
        .order('version', { ascending: false })
      if (error) fail('aivex_submitted_documents', error)
      return data || []
    },

    async documentReviews(registrationId) {
      const { data, error } = await supabase
        .from('aivex_admin_document_reviews')
        .select('document_key, review_status, note, reviewed_at, reviewer:admin_users!aivex_admin_document_reviews_reviewed_by_admin_user_id_fkey(display_name)')
        .eq('registration_id', registrationId)
      if (error) fail('aivex_document_reviews', error)
      return data || []
    },

    async corrections(registrationId) {
      const { data, error } = await supabase
        .from('aivex_correction_requests')
        .select('items, team_message, internal_note, due_at, created_at, resolved_at, requester:admin_users!aivex_correction_requests_requested_by_admin_user_id_fkey(display_name)')
        .eq('registration_id', registrationId)
        .order('created_at', { ascending: false })
      if (error) fail('aivex_corrections', error)
      return data || []
    },

    async audit(registrationId) {
      const { data, error } = await supabase
        .from('admin_audit_events')
        .select('action, sensitivity, metadata, created_at, administrator:admin_users!admin_audit_actor_fkey(display_name)')
        .in('object_type', ['aivex_registration', 'aivex_document'])
        .eq('object_id', registrationId)
        .order('created_at', { ascending: false })
      if (error) fail('aivex_audit', error)
      return data || []
    },

    async applyAction({ registrationId, adminUserId, action, expectedUpdatedAt, reason, payload, now }) {
      const { data, error } = await supabase.rpc('admin_apply_aivex_action', {
        p_registration_id: registrationId,
        p_admin_user_id: adminUserId,
        p_action: action,
        p_expected_updated_at: expectedUpdatedAt,
        p_reason: reason,
        p_payload: payload || {},
        p_now: now.toISOString(),
      })
      if (error) fail('aivex_action', error)
      return Array.isArray(data) ? data[0] : data
    },

    async auditEvent({ registrationId, adminUserId, action, sensitivity = 'standard', metadata = {}, now }) {
      const { error } = await supabase.from('admin_audit_events').insert({
        admin_user_id: adminUserId,
        object_type: action.includes('document') ? 'aivex_document' : 'aivex_registration',
        object_id: registrationId,
        action,
        sensitivity,
        metadata,
        created_at: now.toISOString(),
      })
      if (error) fail('aivex_audit_write', error)
    },

    async resolveDocument(registration, documentKey) {
      const registrationId = registration.id
      if (documentKey === 'official') {
        const { data, error } = await supabase.from('aivex_generated_documents')
          .select('file_path, mime_type, file_size_bytes')
          .eq('registration_id', registrationId).eq('document_type', 'docx')
          .eq('generation_status', 'generated').maybeSingle()
        if (error) fail('aivex_document_resolve', error)
        return data ? {
          bucket: 'aivex-generated-forms', path: data.file_path, mimeType: data.mime_type,
          size: data.file_size_bytes, name: `${registration.reference}.docx`, confidential: false,
        } : null
      }

      const signed = documentKey.match(/^signed-v([1-9][0-9]*)$/)
      if (signed) {
        const version = Number(signed[1])
        const { data, error } = await supabase.from('aivex_submitted_documents')
          .select('file_path, original_file_name, mime_type, size_bytes')
          .eq('registration_id', registrationId).eq('version', version).maybeSingle()
        if (error) fail('aivex_document_resolve', error)
        return data ? {
          bucket: 'aivex-signed-forms', path: data.file_path, mimeType: data.mime_type,
          size: data.size_bytes, name: data.original_file_name, confidential: true,
        } : null
      }

      const student = documentKey.match(/^student-([1-3])$/)
      if (student) {
        const position = Number(student[1])
        const { data, error } = await supabase.from('aivex_students')
          .select('student_card_path, student_card_mime, student_card_size_bytes')
          .eq('registration_id', registrationId).eq('position', position).maybeSingle()
        if (error) fail('aivex_document_resolve', error)
        return data?.student_card_path ? {
          bucket: 'aivex-student-cards', path: data.student_card_path,
          mimeType: data.student_card_mime, size: data.student_card_size_bytes,
          name: `student-card-${String(position).padStart(2, '0')}.${data.student_card_mime === 'image/png' ? 'png' : data.student_card_mime === 'image/webp' ? 'webp' : 'jpg'}`,
          confidential: true,
        } : null
      }

      const identity = documentKey === 'delegation-leader'
        ? { prefix: 'delegation_head', name: 'delegation-leader-id' }
        : documentKey === 'driver' ? { prefix: 'driver', name: 'driver-id' } : null
      if (!identity) return null
      const path = registration[`${identity.prefix}_id_card_path`]
      const mimeType = registration[`${identity.prefix}_id_card_mime`]
      if (!path || !mimeType) return null
      return {
        bucket: 'aivex-id-cards', path, mimeType,
        size: registration[`${identity.prefix}_id_card_size`],
        name: `${identity.name}.${mimeType === 'image/png' ? 'png' : 'jpg'}`,
        confidential: true,
      }
    },

    async downloadDocument(bucketName, path) {
      const { data, error } = await supabase.storage.from(bucketName).download(path)
      if (error || !data) fail('aivex_document_download', error)
      return Buffer.from(await data.arrayBuffer())
    },
  }
}

