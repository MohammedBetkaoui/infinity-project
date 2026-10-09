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
  if (options.department) next = next.eq('staff_department', options.department)
  return next
}

export function createStaffConfirmationsStore(supabase) {
  if (!supabase) fail('staff_confirmations_store_unavailable', { code: 'configuration_error' })

  return {
    async tokenByHash(tokenHash) {
      const { data, error } = await supabase.from('membership_staff_confirmation_tokens')
        .select('id, confirmation_id, purpose, expires_at, consumed_at, revoked_at, created_at')
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
      if (!data || !submissions) return data
      const { data: versions, error: versionsError } = await supabase.from('membership_staff_confirmation_submissions')
        .select('id, version, motivation, submitted_at')
        .eq('confirmation_id', data.id)
        .order('version', { ascending: false })
      if (versionsError) fail('staff_confirmation_submissions', versionsError)
      return { ...data, submissions: versions || [] }
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
      const statuses = ['invited', 'submitted', 'revision_requested', 'confirmed', 'expired']
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
      const { data, error } = await supabase.rpc('admin_apply_staff_confirmation_action', {
        p_application_id: input.applicationId,
        p_admin_user_id: input.adminUserId,
        p_action: input.action,
        p_expected_application_updated_at: input.expectedApplicationUpdatedAt,
        p_expected_confirmation_updated_at: input.expectedConfirmationUpdatedAt || null,
        p_token_hash: input.tokenHash || null,
        p_token_purpose: input.tokenPurpose || null,
        p_expires_at: input.expiresAt?.toISOString() || null,
        p_message: input.message || null,
        p_now: input.now.toISOString(),
      })
      if (error) fail('staff_confirmation_admin_action', error)
      return firstRow(data)
    },
  }
}
