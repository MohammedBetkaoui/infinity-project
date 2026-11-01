const DIRECTORY_COLUMNS = [
  'id', 'event_type', 'title', 'description', 'starts_at', 'ends_at', 'location', 'speaker_name', 'speaker_names', 'schedule_days',
  'visibility', 'status', 'invited_count', 'registered_count', 'present_count', 'not_checked_in_count',
  'absent_count', 'attendance_count', 'created_at', 'updated_at',
].join(', ')

const SORT_COLUMNS = Object.freeze({
  starts: 'starts_at', created: 'created_at', title: 'title', type: 'event_type',
  location: 'location', status: 'status', speaker: 'speaker_name',
  invited: 'invited_count', present: 'present_count',
})
const EXPORTABLE_STATUSES = ['invited', 'registered']
const APPLICANT_COLUMNS = [
  'application_id', 'join_type', 'full_name', 'email', 'department', 'staff_department',
  'invitation_id', 'invitation_status', 'invited_at', 'invitation_registered_at', 'link_revoked_at',
  'invite_token_hash', 'invite_expires_at', 'credential_version', 'credential_derivation_version',
  'link_exported_at', 'registration_status', 'university_speciality', 'registration_registered_at',
  'checked_in_at', 'absent_at',
].join(', ')
const fail = (stage, error) => { throw Object.assign(new Error(stage), { stage, code: error?.code || 'database_error', databaseMessage: error?.message }) }
const safeSearch = (value) => String(value || '').normalize('NFKC').replace(/[^\p{L}\p{N}\s@.+_-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)

// The 'other' quick filter covers every remaining event type so each chip is
// disjoint and the full list is always reachable through one of them.
function applyFilters(query, options, { includeStatus = true } = {}) {
  let next = query
  const search = safeSearch(options.q)
  if (search) {
    const pattern = `%${search}%`
    next = next.or(`title.ilike.${pattern},speaker_name.ilike.${pattern},location.ilike.${pattern}`)
  }
  if (options.type === 'other') {
    next = next.not('event_type', 'in', '(workshop,competition,conference)')
  } else if (options.type) {
    next = next.eq('event_type', options.type)
  }
  if (includeStatus && options.status === 'upcoming') {
    next = next.gte('starts_at', options.now).not('status', 'in', '(ongoing,completed,cancelled,archived)')
  } else if (includeStatus && options.status) {
    next = next.eq('status', options.status)
  }
  return next
}

// Participant list filters: free text, member/staff, and the private-link
// state (missing = generated for nobody yet, new = never exported).
function applyApplicantFilters(query, options) {
  let next = query
  const search = safeSearch(options.q)
  if (search) {
    const pattern = `%${search}%`
    next = next.or(`full_name.ilike.${pattern},email.ilike.${pattern},department.ilike.${pattern}`)
  }
  if (options.type) next = next.eq('join_type', options.type)
  if (options.link === 'missing') next = next.is('invitation_id', null)
  else if (options.link === 'ready') next = next.not('invitation_id', 'is', null)
  else if (options.link === 'new') next = next.in('invitation_status', EXPORTABLE_STATUSES).is('link_exported_at', null)
  return next
}

// Attendance filters read from club_event_registrations: present (checked
// in), not checked in yet, explicitly absent after finalize, or cancelled.
const REGISTRATION_FILTERS = Object.freeze({
  present: (query) => query.eq('status', 'checked_in'),
  not_checked_in: (query) => query.eq('status', 'registered').is('absent_at', null),
  absent: (query) => query.eq('status', 'registered').not('absent_at', 'is', null),
  cancelled: (query) => query.eq('status', 'cancelled'),
})

export function createAdminEventsStore(supabase) {
  if (!supabase) throw Object.assign(new Error('admin_events_store_unavailable'), { stage: 'configuration', code: 'configuration_error' })
  return {
    async list(options) {
      const [sortName, sortDirection] = options.sort.split('_')
      const from = (options.page - 1) * options.limit
      let query = supabase.from('admin_club_events_directory').select(DIRECTORY_COLUMNS, { count: 'exact' })
      query = applyFilters(query, options)
        .order(SORT_COLUMNS[sortName] || 'starts_at', { ascending: sortDirection === 'asc' })
        .range(from, from + options.limit - 1)
      const { data, error, count } = await query
      if (error) fail('events_list', error)
      return { rows: data || [], count: Number(count || 0) }
    },
    async summaryCounts({ now }) {
      const run = async (apply) => {
        const { error, count } = await apply(supabase.from('admin_club_events_directory').select('id', { count: 'exact', head: true }))
        if (error) fail('events_counts', error)
        return Number(count || 0)
      }
      const [total, upcoming, ongoing, completed] = await Promise.all([
        run((query) => query),
        run((query) => query.gte('starts_at', now).not('status', 'in', '(ongoing,completed,cancelled,archived)')),
        run((query) => query.eq('status', 'ongoing')),
        run((query) => query.eq('status', 'completed')),
      ])
      return { total, upcoming, ongoing, completed }
    },
    async find(eventId) {
      const { data, error } = await supabase.from('admin_club_events_directory').select(DIRECTORY_COLUMNS).eq('id', eventId).maybeSingle()
      if (error) fail('events_detail', error)
      return data
    },
    async audit(eventId) {
      const { data, error } = await supabase.from('admin_audit_events')
        .select('id, action, metadata, created_at, administrator:admin_users!admin_audit_actor_fkey(display_name)')
        .eq('object_type', 'club_event').eq('object_id', eventId)
        .order('created_at', { ascending: false })
      if (error) fail('events_audit', error)
      return data || []
    },
    // Every member and staff application, with the private-link state it has
    // for THIS event (invitation_id is null until a link is generated).
    async participants(eventId, options) {
      const from = (options.page - 1) * options.limit
      let query = supabase.from('admin_event_applicant_links')
        .select(APPLICANT_COLUMNS, { count: 'exact' })
        .eq('event_id', eventId)
      query = applyApplicantFilters(query, options)
      const { data, error, count } = await query
        .order('full_name', { ascending: true })
        .range(from, from + options.limit - 1)
      if (error) fail('events_participants', error)
      return { rows: data || [], count: Number(count || 0) }
    },
    // Counts behind the "private links" panel: who is eligible, who already
    // has a link, and which links were never written to a CSV.
    async invitationCounts(eventId) {
      const count = async (apply) => {
        const { error, count: total } = await apply(
          supabase.from('admin_event_applicant_links').select('application_id', { count: 'exact', head: true }).eq('event_id', eventId),
        )
        if (error) fail('events_invitation_counts', error)
        return Number(total || 0)
      }
      const ofType = (type) => (query) => query.eq('join_type', type)
      const linked = (type) => (query) => query.eq('join_type', type).not('invitation_id', 'is', null)
      const unexported = (type) => (query) => query.eq('join_type', type).in('invitation_status', EXPORTABLE_STATUSES).is('link_exported_at', null)
      const [eligibleMembers, eligibleStaff, linkedMembers, linkedStaff, unexportedMembers, unexportedStaff] = await Promise.all([
        count(ofType('member')), count(ofType('staff')), count(linked('member')), count(linked('staff')),
        count(unexported('member')), count(unexported('staff')),
      ])
      return { eligibleMembers, eligibleStaff, linkedMembers, linkedStaff, unexportedMembers, unexportedStaff }
    },
    async attendance(eventId, options) {
      const from = (options.page - 1) * options.limit
      let query = supabase.from('club_event_registrations')
        .select('id, membership_application_id, university_speciality, status, registered_at, checked_in_at, absent_at, updated_at, application:membership_applications(full_name, email, department)', { count: 'exact' })
        .eq('event_id', eventId)
      const filter = options.status && REGISTRATION_FILTERS[options.status]
      if (filter) query = filter(query)
      const { data, error, count } = await query
        .order('created_at', { ascending: true })
        .range(from, from + options.limit - 1)
      if (error) fail('events_attendance', error)
      return { rows: data || [], count: Number(count || 0) }
    },
    async createEvent({ adminUserId, payload, now }) {
      const { data, error } = await supabase.rpc('admin_create_club_event', {
        p_admin_user_id: adminUserId, p_payload: payload, p_now: now.toISOString(),
      })
      if (error) fail('events_create', error)
      return Array.isArray(data) ? data[0] : data
    },
    async updateEvent({ eventId, adminUserId, expectedUpdatedAt, payload, now }) {
      const { data, error } = await supabase.rpc('admin_update_club_event', {
        p_event_id: eventId, p_admin_user_id: adminUserId, p_expected_updated_at: expectedUpdatedAt,
        p_payload: payload, p_now: now.toISOString(),
      })
      if (error) fail('events_update', error)
      return Array.isArray(data) ? data[0] : data
    },
    async inviteApplications({ eventId, adminUserId, applicationIds, scope, now }) {
      const { data, error } = await supabase.rpc('admin_invite_club_event_applicants', {
        p_event_id: eventId, p_admin_user_id: adminUserId, p_application_ids: applicationIds || null,
        p_scope: scope || null, p_now: now.toISOString(),
      })
      if (error) fail('events_invite', error)
      return Array.isArray(data) ? data[0] : data
    },
    async invitationCredential(eventId, invitationId) {
      const { data, error } = await supabase.from('club_event_invitations')
        .select('id, event_id, status, token_hash:invite_token_hash, expires_at:invite_expires_at, credential_version, credential_derivation_version, revoked_at:link_revoked_at')
        .eq('event_id', eventId).eq('id', invitationId).maybeSingle()
      if (error) fail('events_invitation_credential', error)
      return data
    },
    // Active links for the CSV; onlyNew keeps the ones never exported before.
    async exportInvitationRows(eventId, { onlyNew = false } = {}) {
      const rows = []
      const pageSize = 500
      for (let from = 0; ; from += pageSize) {
        let query = supabase.from('admin_event_applicant_links')
          .select(APPLICANT_COLUMNS)
          .eq('event_id', eventId)
          .in('invitation_status', EXPORTABLE_STATUSES)
        if (onlyNew) query = query.is('link_exported_at', null)
        const { data, error } = await query
          .order('invited_at', { ascending: true })
          .order('application_id', { ascending: true })
          .range(from, from + pageSize - 1)
        if (error) fail('events_invitation_export_rows', error)
        rows.push(...(data || []))
        if (!data || data.length < pageSize) break
      }
      return rows
    },
    async setInvitationLink({ eventId, invitationId, adminUserId, action, tokenHash, credentialVersion, derivationVersion, expiresAt, now }) {
      const { data, error } = await supabase.rpc('admin_set_event_invitation_link', {
        p_event_id: eventId, p_invitation_id: invitationId, p_admin_user_id: adminUserId,
        p_action: action, p_token_hash: tokenHash, p_credential_version: credentialVersion,
        p_derivation_version: derivationVersion, p_expires_at: expiresAt.toISOString(), p_now: now.toISOString(),
      })
      if (error) fail('events_set_invitation_link', error)
      return Array.isArray(data) ? data[0] : data
    },
    // Marks the exported links (first export date is kept) and audits the export.
    async recordInvitationExport({ eventId, adminUserId, invitationIds, scope, now }) {
      const { data, error } = await supabase.rpc('admin_record_event_invitation_export', {
        p_event_id: eventId, p_admin_user_id: adminUserId, p_invitation_ids: invitationIds,
        p_scope: scope, p_now: now.toISOString(),
      })
      if (error) fail('events_record_invitation_export', error)
      return Number(Array.isArray(data) ? data[0] : data)
    },
    async scannerAccess(eventId) {
      const { data, error } = await supabase.from('club_event_scanner_access')
        .select('id, event_id, status, starts_at, expires_at, last_used_at, revoked_at, credential_version, credential_derivation_version, created_at, updated_at')
        .eq('event_id', eventId)
        .maybeSingle()
      if (error) fail('events_scanner_state', error)
      return data
    },
    async persistScannerAccess({ eventId, adminUserId, action, tokenHash, credentialVersion, startsAt, expiresAt, now }) {
      const { data, error } = await supabase.rpc('admin_set_event_scanner_access', {
        p_event_id: eventId, p_admin_user_id: adminUserId, p_action: action, p_token_hash: tokenHash,
        p_credential_version: credentialVersion, p_starts_at: startsAt.toISOString(),
        p_expires_at: expiresAt.toISOString(), p_now: now.toISOString(),
      })
      if (error) fail('events_persist_scanner_access', error)
      return Array.isArray(data) ? data[0] : data
    },
    async revokeScannerAccess({ eventId, adminUserId, now }) {
      const { data, error } = await supabase.rpc('admin_revoke_club_event_scanner_access', {
        p_event_id: eventId, p_admin_user_id: adminUserId, p_now: now.toISOString(),
      })
      if (error) fail('events_revoke_scanner_access', error)
      return Boolean(Array.isArray(data) ? data[0] : data)
    },
    async transitionEvent({ eventId, adminUserId, nextStatus, expectedUpdatedAt, now }) {
      const { data, error } = await supabase.rpc('admin_transition_club_event', {
        p_event_id: eventId, p_admin_user_id: adminUserId, p_next_status: nextStatus,
        p_expected_updated_at: expectedUpdatedAt, p_now: now.toISOString(),
      })
      if (error) fail('events_transition', error)
      return Array.isArray(data) ? data[0] : data
    },
    async finalizeAttendance({ eventId, adminUserId, now }) {
      const { data, error } = await supabase.rpc('admin_finalize_club_event_attendance', {
        p_event_id: eventId, p_admin_user_id: adminUserId, p_now: now.toISOString(),
      })
      if (error) fail('events_finalize_attendance', error)
      return Number(Array.isArray(data) ? data[0] : data)
    },
  }
}
