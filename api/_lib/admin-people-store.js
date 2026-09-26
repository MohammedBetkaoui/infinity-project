const DIRECTORY_COLUMNS = [
  'kind', 'profile_id', 'member_id', 'source_application_id', 'full_name', 'email', 'phone',
  'study_year', 'speciality', 'availability', 'structure', 'requested_department', 'internal_role',
  'cohort', 'status', 'joined_at', 'last_activity_at', 'activity_count', 'has_staff_profile',
  'created_at', 'updated_at',
].join(', ')

const STATUS_VALUES = Object.freeze({
  members: ['active', 'on_pause', 'inactive', 'alumni', 'archived'],
  staff: ['active', 'on_pause', 'inactive', 'archived'],
})
const SORT_COLUMNS = Object.freeze({ joined: 'joined_at', updated: 'updated_at', name: 'full_name', status: 'status', structure: 'structure', level: 'study_year', availability: 'availability' })
const fail = (stage, error) => { throw Object.assign(new Error(stage), { stage, code: error?.code || 'database_error', databaseMessage: error?.message }) }
const safeSearch = (value) => String(value || '').normalize('NFKC').replace(/[^\p{L}\p{N}\s@.+_-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)

function applyFilters(query, kind, options, { includeStatus = true } = {}) {
  let next = query.eq('kind', kind)
  const search = safeSearch(options.q)
  if (search) {
    const pattern = `%${search}%`
    next = next.or(`full_name.ilike.${pattern},email.ilike.${pattern},speciality.ilike.${pattern},structure.ilike.${pattern},internal_role.ilike.${pattern}`)
  }
  if (includeStatus && options.status) next = next.eq('status', options.status)
  if (options.studyYear) next = next.eq('study_year', options.studyYear)
  if (options.speciality) next = next.eq('speciality', options.speciality)
  if (options.structure) next = next.eq('structure', options.structure)
  if (options.availability) next = next.eq('availability', options.availability)
  if (options.dateFrom) next = next.gte('joined_at', options.dateFrom)
  if (options.dateTo) next = next.lte('joined_at', options.dateTo)
  return next
}

export function createAdminPeopleStore(supabase) {
  if (!supabase) throw Object.assign(new Error('admin_people_store_unavailable'), { stage: 'configuration', code: 'configuration_error' })
  return {
    async list(kind, options) {
      const [sortName, sortDirection] = options.sort.split('_')
      const from = (options.page - 1) * options.limit
      let query = supabase.from('admin_people_directory').select(DIRECTORY_COLUMNS, { count: 'exact' })
      query = applyFilters(query, kind, options).order(SORT_COLUMNS[sortName] || 'joined_at', { ascending: sortDirection === 'asc' }).range(from, from + options.limit - 1)
      const { data, error, count } = await query
      if (error) fail('people_list', error)
      return { rows: data || [], count: Number(count || 0) }
    },
    async statusCounts(kind, options) {
      const entries = await Promise.all(STATUS_VALUES[kind].map(async (status) => {
        let query = supabase.from('admin_people_directory').select('profile_id', { count: 'exact', head: true })
        query = applyFilters(query, kind, options, { includeStatus: false }).eq('status', status)
        const { error, count } = await query
        if (error) fail('people_counts', error)
        return [status, Number(count || 0)]
      }))
      return Object.fromEntries(entries)
    },
    async facets(kind) {
      const { data, error } = await supabase.from('admin_people_directory').select('speciality, structure').eq('kind', kind).limit(2000)
      if (error) fail('people_facets', error)
      return {
        specialities: [...new Set((data || []).map((row) => row.speciality).filter(Boolean))].sort(),
        structures: [...new Set((data || []).map((row) => row.structure).filter(Boolean))].sort(),
      }
    },
    async find(kind, profileId) {
      const { data, error } = await supabase.from('admin_people_directory').select(DIRECTORY_COLUMNS).eq('kind', kind).eq('profile_id', profileId).maybeSingle()
      if (error) fail('people_detail', error)
      return data
    },
    async notes(memberId) {
      const { data, error } = await supabase.from('club_member_notes').select('id, body, created_at, author:admin_users(display_name)').eq('member_id', memberId).order('created_at', { ascending: false })
      if (error) fail('people_notes', error)
      return data || []
    },
    async activities(kind, row) {
      if (kind === 'staff') {
        const { data, error } = await supabase.from('club_staff_project_assignments').select('id, project_name, assigned_at').eq('staff_profile_id', row.profile_id).order('assigned_at', { ascending: false })
        if (error) fail('people_projects', error)
        return data || []
      }
      const { data, error } = await supabase.from('club_member_event_participation').select('id, event_name, attended_on, created_at').eq('member_id', row.member_id).order('created_at', { ascending: false })
      if (error) fail('people_events', error)
      return data || []
    },
    async audit(kind, profileId) {
      const { data, error } = await supabase.from('admin_audit_events').select('id, action, metadata, created_at, administrator:admin_users!admin_audit_actor_fkey(display_name)').eq('object_type', kind === 'staff' ? 'club_staff' : 'club_member').eq('object_id', profileId).order('created_at', { ascending: false })
      if (error) fail('people_audit', error)
      return data || []
    },
    async createProfile({ kind, adminUserId, payload, now }) {
      const { data, error } = await supabase.rpc('admin_create_club_profile', { p_kind: kind, p_admin_user_id: adminUserId, p_payload: payload, p_now: now.toISOString() })
      if (error) fail('people_create', error)
      return Array.isArray(data) ? data[0] : data
    },
    async applyAction({ kind, profileId, adminUserId, action, expectedUpdatedAt, reason, payload, now }) {
      const { data, error } = await supabase.rpc('admin_apply_club_profile_action', {
        p_kind: kind, p_profile_id: profileId, p_admin_user_id: adminUserId, p_action: action,
        p_expected_updated_at: expectedUpdatedAt, p_reason: reason || null, p_payload: payload || {}, p_now: now.toISOString(),
      })
      if (error) fail('people_action', error)
      return Array.isArray(data) ? data[0] : data
    },
  }
}
