const fail = (stage, error) => {
  throw Object.assign(new Error(stage), {
    stage,
    code: error?.code || error?.statusCode || error?.status || 'database_error',
    databaseMessage: error?.message,
  })
}

const FALLBACK_LIMIT = 2000
const missingRpc = (error) => ['PGRST202', '42883'].includes(error?.code)
const unique = (values) => [...new Set(values.filter(Boolean))]

const algiersDateKey = (value) => {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const part = (type) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

async function rowsByIds(supabase, table, columns, ids) {
  const values = unique(ids)
  if (!values.length) return []
  const rows = []
  for (let index = 0; index < values.length; index += 200) {
    const { data, error } = await supabase.from(table).select(columns).in('id', values.slice(index, index + 200))
    if (error) fail(`admin_activity_${table}`, error)
    rows.push(...(data || []))
  }
  return rows
}

const actorName = (row) => {
  const administrator = Array.isArray(row.administrator) ? row.administrator[0] : row.administrator
  return administrator?.display_name || 'Infinity Administration'
}

const compare = (left, right, sort) => {
  const [field, direction] = sort.split('_')
  const sign = direction === 'asc' ? 1 : -1
  const key = field === 'created' ? 'createdAt' : field === 'object' ? 'objectType' : field
  if (key === 'createdAt') return (new Date(left.createdAt) - new Date(right.createdAt)) * sign
  return String(left[key] || '').localeCompare(String(right[key] || ''), 'en', { numeric: true }) * sign
}

async function fallbackList(supabase, options) {
  const { data, error } = await supabase.from('admin_audit_events')
    .select('id, admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at, administrator:admin_users!admin_audit_actor_fkey(display_name)')
    .order('created_at', { ascending: false })
    .limit(FALLBACK_LIMIT)
  if (error) fail('admin_activity_fallback', error)
  const auditRows = data || []

  const ids = (type) => auditRows.filter((row) => row.object_type === type).map((row) => row.object_id)
  const [applications, registrations, members, staff, events] = await Promise.all([
    rowsByIds(supabase, 'membership_applications', 'id, full_name, reference', ids('join_application')),
    rowsByIds(supabase, 'aivex_registrations', 'id, team_name, reference', [
      ...ids('aivex_registration'), ...ids('aivex_document'),
    ]),
    rowsByIds(supabase, 'club_members', 'id, full_name', ids('club_member')),
    rowsByIds(supabase, 'club_staff_profiles', 'id, member_id', ids('club_staff')),
    rowsByIds(supabase, 'club_events', 'id, title, event_type', ids('club_event')),
  ])
  const staffMembers = await rowsByIds(supabase, 'club_members', 'id, full_name', staff.map((row) => row.member_id))
  const applicationMap = new Map(applications.map((row) => [row.id, [row.full_name, row.reference].filter(Boolean).join(' · ')]))
  const registrationMap = new Map(registrations.map((row) => [row.id, [row.team_name, row.reference].filter(Boolean).join(' · ')]))
  const memberMap = new Map(members.map((row) => [row.id, row.full_name]))
  const staffMemberMap = new Map(staffMembers.map((row) => [row.id, row.full_name]))
  const staffMap = new Map(staff.map((row) => [row.id, staffMemberMap.get(row.member_id)]))
  const eventMap = new Map(events.map((row) => [row.id, [row.title, row.event_type].filter(Boolean).join(' · ')]))
  const subject = (row) => {
    if (row.object_type === 'join_application') return applicationMap.get(row.object_id) || 'Join application'
    if (['aivex_registration', 'aivex_document'].includes(row.object_type)) return registrationMap.get(row.object_id) || 'AIVEX registration'
    if (row.object_type === 'club_member') return memberMap.get(row.object_id) || 'Member profile'
    if (row.object_type === 'club_staff') return staffMap.get(row.object_id) || 'Staff profile'
    if (row.object_type === 'aivex_settings') return `AIVEX Edition ${row.metadata?.edition || 2} campaign`
    if (row.object_type === 'staff_link_export') return `Staff private-link export · ${Number(row.metadata?.row_count || 0)} candidate(s)`
    if (row.object_type === 'club_event') return eventMap.get(row.object_id) || 'Club event'
    return 'Administrative record'
  }
  const allRows = auditRows.map((row) => ({
    id: row.id,
    adminUserId: row.admin_user_id,
    action: row.action,
    subject: subject(row),
    actor: actorName(row),
    objectType: row.object_type,
    sensitivity: row.sensitivity,
    createdAt: row.created_at,
    note: typeof row.metadata?.reason === 'string' ? row.metadata.reason.slice(0, 2000) : null,
  }))
  const query = String(options.q || '').toLocaleLowerCase('en')
  const filtered = allRows.filter((row) => {
    if (options.actor && row.actor !== options.actor) return false
    if (options.objectType && row.objectType !== options.objectType) return false
    if (options.action && row.action !== options.action) return false
    if (options.sensitivity && row.sensitivity !== options.sensitivity) return false
    const dateKey = algiersDateKey(row.createdAt)
    if (options.dateFrom && dateKey < options.dateFrom) return false
    if (options.dateTo && dateKey > options.dateTo) return false
    if (query && !`${row.action} ${row.action.replaceAll('_', ' ')} ${row.subject} ${row.actor} ${row.objectType}`.toLocaleLowerCase('en').includes(query)) return false
    return true
  }).sort((left, right) => compare(left, right, options.sort))
  const from = (options.page - 1) * options.limit
  return {
    generatedAt: new Date().toISOString(),
    rows: filtered.slice(from, from + options.limit),
    pagination: { page: options.page, limit: options.limit, total: filtered.length },
    summary: {
      recordedActions: allRows.length,
      confidentialEvents: allRows.filter((row) => row.sensitivity === 'confidential').length,
      administrators: new Set(allRows.map((row) => row.adminUserId).filter(Boolean)).size,
    },
    facets: {
      actors: unique(allRows.map((row) => row.actor)).sort(),
      actions: unique(allRows.map((row) => row.action)).sort(),
      objectTypes: unique(allRows.map((row) => row.objectType)).sort(),
    },
  }
}

export function createAdminActivityStore(supabase) {
  if (!supabase) {
    throw Object.assign(new Error('admin_activity_store_unavailable'), {
      stage: 'configuration', code: 'configuration_error',
    })
  }

  return {
    async list(options) {
      const { data, error } = await supabase.rpc('admin_list_activity_log', {
        p_page: options.page,
        p_limit: options.limit,
        p_query: options.q || null,
        p_actor: options.actor || null,
        p_object_type: options.objectType || null,
        p_action: options.action || null,
        p_sensitivity: options.sensitivity || null,
        p_date_from: options.dateFrom || null,
        p_date_to: options.dateTo || null,
        p_sort: options.sort,
      })
      if (error && missingRpc(error)) return fallbackList(supabase, options)
      if (error) fail('admin_activity_list', error)
      return data
    },
  }
}
