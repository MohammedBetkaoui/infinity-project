import { UNIVERSITY_FACULTIES, describeAcademicDepartment } from '../../shared/membership/university-structure.js'
import { createStaffConfirmationsStore } from './staff-confirmations-store.js'

const APPLICATION_COLUMNS = [
  'id', 'reference', 'full_name', 'email', 'phone', 'study_year', 'faculty', 'department',
  'join_type', 'staff_department', 'primary_field', 'experience', 'availability',
  'consent', 'source', 'form_version', 'status', 'decision_reason',
  'requested_information', 'accepted_as', 'assigned_staff_department',
  'submitted_at', 'created_at', 'updated_at', 'reviewed_at',
].join(', ')

const STATUS_VALUES = ['new', 'in_review', 'interview', 'accepted', 'declined', 'archived']
const SORT_COLUMNS = Object.freeze({
  submitted: 'submitted_at',
  updated: 'updated_at',
  name: 'full_name',
  type: 'join_type',
  level: 'study_year',
  track: 'primary_field',
  availability: 'availability',
  status: 'status',
})

const fail = (stage, error) => {
  throw Object.assign(new Error(stage), { stage, code: error?.code || 'database_error', databaseMessage: error?.message })
}

const safeSearch = (value) => String(value || '')
  .normalize('NFKC')
  .replace(/[^\p{L}\p{N}\s@.+_-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 100)

const endOfDate = (date) => `${date}T23:59:59.999Z`

const UNIVERSITY_DEPARTMENTS = UNIVERSITY_FACULTIES.flatMap((faculty) => faculty.departments)

// Form v3 rows store faculty/department slugs, legacy rows free text. A search
// for "Computer Science" must find both, so matching labels are translated to
// their slugs (letters and hyphens only: safe inside the or() filter).
function academicSearchFilters(search) {
  const needle = search.toLowerCase()
  const faculties = UNIVERSITY_FACULTIES.filter((faculty) => faculty.label.toLowerCase().includes(needle)).map((faculty) => faculty.value)
  const departments = UNIVERSITY_DEPARTMENTS.filter((department) => department.label.toLowerCase().includes(needle)).map((department) => department.value)
  return [
    ...(faculties.length ? [`faculty.in.(${faculties.join(',')})`] : []),
    ...(departments.length ? [`department.in.(${departments.join(',')})`] : []),
  ]
}

// The department filter is a readable value from the facet list: legacy free
// text equal to it, or the slug of the structured department carrying it.
const departmentFilterValues = (value) => [
  value,
  ...UNIVERSITY_DEPARTMENTS.filter((department) => department.label === value).map((department) => department.value),
]

function applyFilters(query, options, { includeStatus = true } = {}) {
  let next = query
  const search = safeSearch(options.q)
  if (search) {
    const pattern = `%${search}%`
    next = next.or([
      `reference.ilike.${pattern}`, `full_name.ilike.${pattern}`, `email.ilike.${pattern}`,
      `department.ilike.${pattern}`, `primary_field.ilike.${pattern}`, ...academicSearchFilters(search),
    ].join(','))
  }
  if (includeStatus && options.status) next = next.eq('status', options.status)
  if (options.type) next = next.eq('join_type', options.type)
  if (options.studyYear) next = next.eq('study_year', options.studyYear)
  if (options.speciality) next = next.in('department', departmentFilterValues(options.speciality))
  if (options.track) next = next.eq('primary_field', options.track)
  if (options.experience) next = next.eq('experience', options.experience)
  if (options.availability) next = next.eq('availability', options.availability)
  if (options.dateFrom) next = next.gte('submitted_at', `${options.dateFrom}T00:00:00.000Z`)
  if (options.dateTo) next = next.lte('submitted_at', endOfDate(options.dateTo))
  return next
}

export function createAdminApplicationsStore(supabase) {
  if (!supabase) throw Object.assign(new Error('admin_applications_store_unavailable'), { stage: 'configuration', code: 'configuration_error' })
  const staffConfirmations = createStaffConfirmationsStore(supabase)

  return {
    async list(options) {
      const [sortName, sortDirection] = options.sort.split('_')
      const sortColumn = SORT_COLUMNS[sortName] || 'submitted_at'
      const from = (options.page - 1) * options.limit
      const to = from + options.limit - 1
      let query = supabase.from('membership_applications').select(APPLICATION_COLUMNS, { count: 'exact' })
      query = applyFilters(query, options)
        .order(sortColumn, { ascending: sortDirection === 'asc' })
        .range(from, to)
      const { data, error, count } = await query
      if (error) fail('applications_list', error)
      return { rows: data || [], count: Number(count || 0) }
    },

    async statusCounts(options) {
      const entries = await Promise.all(STATUS_VALUES.map(async (status) => {
        let query = supabase.from('membership_applications').select('id', { count: 'exact', head: true })
        query = applyFilters(query, options, { includeStatus: false }).eq('status', status)
        const { error, count } = await query
        if (error) fail('applications_counts', error)
        return [status, Number(count || 0)]
      }))
      return Object.fromEntries(entries)
    },

    // Readable department values: labels for structured rows, free text for legacy ones.
    async specialities() {
      const { data, error } = await supabase
        .from('membership_applications')
        .select('faculty, department')
        .not('department', 'is', null)
        .limit(1000)
      if (error) fail('applications_facets', error)
      return [...new Set((data || []).map((row) => describeAcademicDepartment(row.faculty, row.department)).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right))
    },

    async find(applicationId) {
      const { data, error } = await supabase
        .from('membership_applications')
        .select(APPLICATION_COLUMNS)
        .eq('id', applicationId)
        .maybeSingle()
      if (error) fail('application_detail', error)
      return data
    },

    async notes(applicationId) {
      const { data, error } = await supabase
        .from('membership_application_notes')
        .select('id, body, created_at, author:admin_users!membership_notes_author_fkey(display_name)')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
      if (error) fail('application_notes', error)
      return data || []
    },

    async interviews(applicationId) {
      const { data, error } = await supabase
        .from('membership_interviews')
        .select('id, scheduled_at, location, status, internal_reason, created_at, creator:admin_users!membership_interviews_creator_fkey(display_name)')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
      if (error) fail('application_interviews', error)
      return data || []
    },

    async audit(applicationId) {
      const { data, error } = await supabase
        .from('admin_audit_events')
        .select('id, action, sensitivity, metadata, created_at, administrator:admin_users!admin_audit_actor_fkey(display_name)')
        .eq('object_type', 'join_application')
        .eq('object_id', applicationId)
        .order('created_at', { ascending: false })
      if (error) fail('application_audit', error)
      return data || []
    },

    async applyAction({ applicationId, adminUserId, action, expectedUpdatedAt, reason, payload, now }) {
      const { data, error } = await supabase.rpc('admin_apply_membership_application_action', {
        p_application_id: applicationId,
        p_admin_user_id: adminUserId,
        p_action: action,
        p_expected_updated_at: expectedUpdatedAt,
        p_reason: reason || null,
        p_payload: payload || {},
        p_now: now.toISOString(),
      })
      if (error) fail('application_action', error)
      return Array.isArray(data) ? data[0] : data
    },

    staffConfirmation: (applicationId, options) => staffConfirmations.forApplication(applicationId, options),
    listStaffConfirmations: (options) => staffConfirmations.list(options),
    staffConfirmationCounts: (options) => staffConfirmations.counts(options),
    applyStaffConfirmationAction: (input) => staffConfirmations.applyAdminAction(input),
  }
}
