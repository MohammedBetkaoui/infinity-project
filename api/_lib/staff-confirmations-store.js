const fail = (stage, error) => {
  throw Object.assign(new Error(stage), {
    stage,
    code: error?.code || error?.statusCode || error?.status || 'database_error',
    databaseMessage: error?.message,
  })
}

const firstRow = (value) => Array.isArray(value) ? value[0] : value

const CONFIRMATION_COLUMNS = [
  'id', 'application_id', 'status', 'invited_by_admin_user_id', 'invited_at', 'expires_at',
  'revision_message', 'submitted_at', 'reviewed_by_admin_user_id', 'reviewed_at',
  'confirmed_at', 'created_at', 'updated_at',
].join(', ')

const APPLICATION_SAFE_COLUMNS = [
  'id', 'reference', 'full_name', 'join_type', 'staff_department', 'primary_field', 'status',
  'study_year', 'faculty', 'department', 'experience', 'availability', 'submitted_at', 'updated_at',
].join(', ')

const SORT_COLUMNS = Object.freeze({
  invited: 'invited_at', submitted: 'submitted_at', name: 'candidate_name', status: 'effective_status',
})

const safeSearch = (value) => String(value || '')
  .normalize('NFKC')
  .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 100)

function applyListFilters(query, options, { includeStatus = true } = {}) {
  let next = query
  const search = safeSearch(options.q)
  if (search) next = next.or(`candidate_name.ilike.%${search}%,reference.ilike.%${search}%`)
  if (includeStatus && options.status) next = next.eq('effective_status', options.status)
  if (options.linkAccess) next = next.eq('link_access', options.linkAccess)
  if (options.department) next = next.eq('staff_department', options.department)
  return next
}

export function createStaffConfirmationsStore(supabase) {
  if (!supabase) fail('staff_confirmations_store_unavailable', { code: 'configuration_error' })

  return {
    async tokenByHash(tokenHash) {
      const { data, error } = await supabase.from('membership_staff_confirmation_tokens')
        .select('id, confirmation_id, purpose, expires_at, consumed_at, revoked_at, blocked_at, link_nonce, credential_version, derivation_version, first_used_at, last_used_at, created_at')
        .eq('token_hash', tokenHash)
        .maybeSingle()
      if (error) fail('staff_confirmation_token_lookup', error)
      return data
    },

    async confirmation(confirmationId) {
      const { data, error } = await supabase.from('membership_staff_confirmations')
        .select(CONFIRMATION_COLUMNS)
        .eq('id', confirmationId)
        .maybeSingle()
      if (error) fail('staff_confirmation_lookup', error)
      return data
    },

    async application(applicationId) {
      const { data, error } = await supabase.from('membership_applications')
        .select(APPLICATION_SAFE_COLUMNS)
        .eq('id', applicationId)
        .maybeSingle()
      if (error) fail('staff_confirmation_application_lookup', error)
      return data
    },

    async submit({ tokenHash, motivation, now }) {
      const { data, error } = await supabase.rpc('staff_submit_confirmation', {
        p_token_hash: tokenHash,
        p_motivation: motivation,
        p_now: now.toISOString(),
      })
      if (error) fail('staff_confirmation_submit', error)
      return firstRow(data)
    },

    async forApplication(applicationId, { submissions = false } = {}) {
      const { data, error } = await supabase.from('membership_staff_confirmations')
        .select(CONFIRMATION_COLUMNS)
        .eq('application_id', applicationId)
        .maybeSingle()
      if (error) fail('staff_confirmation_application_detail', error)
      if (!data) return data
      const { data: credential, error: credentialError } = await supabase
        .from('membership_staff_confirmation_tokens')
        .select('id, link_nonce, blocked_at, revoked_at, credential_version, derivation_version, created_at')
        .eq('confirmation_id', data.id)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (credentialError) fail('staff_confirmation_credential_detail', credentialError)
      const detail = {
        ...data,
        link_access: !credential ? 'none' : !credential.link_nonce ? 'legacy' : credential.blocked_at ? 'blocked' : 'active',
        link_reconstructable: Boolean(credential?.link_nonce),
      }
      if (!submissions) return detail
      const { data: versions, error: versionsError } = await supabase.from('membership_staff_confirmation_submissions')
        .select('id, version, motivation, submitted_at')
        .eq('confirmation_id', data.id)
        .order('version', { ascending: false })
      if (versionsError) fail('staff_confirmation_submissions', versionsError)
      return { ...detail, submissions: versions || [] }
    },

    async list(options) {
      const [sortName, sortDirection] = options.sort.split('_')
      const sortColumn = SORT_COLUMNS[sortName] || 'submitted_at'
      const from = (options.page - 1) * options.limit
      let query = supabase.from('admin_staff_confirmations').select('*', { count: 'exact' })
      query = applyListFilters(query, options)
        .order(sortColumn, { ascending: sortDirection === 'asc', nullsFirst: false })
        .range(from, from + options.limit - 1)
      const { data, error, count } = await query
      if (error) fail('staff_confirmations_list', error)
      return { rows: data || [], count: Number(count || 0) }
    },

    async counts(options) {
      const statuses = ['not_invited', 'invited', 'submitted', 'revision_requested', 'confirmed', 'expired']
      const entries = await Promise.all(statuses.map(async (status) => {
        let query = supabase.from('admin_staff_confirmations').select('confirmation_id', { count: 'exact', head: true })
        query = applyListFilters(query, options, { includeStatus: false }).eq('effective_status', status)
        const { error, count } = await query
        if (error) fail('staff_confirmations_counts', error)
        return [status, Number(count || 0)]
      }))
      return Object.fromEntries(entries)
    },

    async applyAdminAction(input) {
      const { data, error } = await supabase.rpc('admin_apply_stable_staff_confirmation_action', {
        p_application_id: input.applicationId,
        p_admin_user_id: input.adminUserId,
        p_action: input.action,
        p_expected_application_updated_at: input.expectedApplicationUpdatedAt,
        p_expected_confirmation_updated_at: input.expectedConfirmationUpdatedAt || null,
        p_proposed_confirmation_id: input.proposedConfirmationId || null,
        p_link_nonce: input.linkNonce || null,
        p_token_hash: input.tokenHash || null,
        p_credential_version: input.credentialVersion || null,
        p_derivation_version: input.derivationVersion || null,
        p_expires_at: input.expiresAt?.toISOString() || null,
        p_message: input.message || null,
        p_convert_legacy: input.convertLegacy === true,
        p_now: input.now.toISOString(),
      })
      if (error) fail('staff_confirmation_admin_action', error)
      return firstRow(data)
    },

    async credentialForApplication(applicationId) {
      const { data, error } = await supabase.from('admin_staff_link_credentials')
        .select('*')
        .eq('application_id', applicationId)
        .maybeSingle()
      if (error) fail('staff_confirmation_credential_lookup', error)
      return data
    },

    async nextCredentialVersion(confirmationId) {
      if (!confirmationId) return 1
      const { data, error } = await supabase.from('membership_staff_confirmation_tokens')
        .select('credential_version')
        .eq('confirmation_id', confirmationId)
        .order('credential_version', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) fail('staff_confirmation_credential_version', error)
      return Number(data?.credential_version || 0) + 1
    },

    async staffLinkExportCandidates() {
      const rows = []
      const batchSize = 500
      for (let from = 0; ; from += batchSize) {
        const { data, error } = await supabase.from('admin_staff_link_credentials')
          .select('*')
          .in('application_status', ['new', 'in_review', 'interview'])
          .order('application_id', { ascending: true })
          .range(from, from + batchSize - 1)
        if (error) fail('staff_confirmation_export_candidates', error)
        rows.push(...(data || []))
        if (!data || data.length < batchSize) break
      }
      return rows
    },

    async recordLinkAudit({ applicationId, adminUserId, action, metadata, now }) {
      const { error } = await supabase.rpc('admin_record_staff_link_audit', {
        p_application_id: applicationId || null,
        p_admin_user_id: adminUserId,
        p_action: action,
        p_metadata: metadata || {},
        p_now: now.toISOString(),
      })
      if (error) fail('staff_confirmation_link_audit', error)
    },
  }
}
