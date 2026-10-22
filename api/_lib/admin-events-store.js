const DIRECTORY_COLUMNS = [
  'id', 'event_type', 'title', 'description', 'starts_at', 'ends_at', 'location', 'speaker_name',
  'visibility', 'status', 'invited_count', 'registered_count', 'expected_count', 'present_count',
  'absent_count', 'excused_count', 'attendance_count', 'organizer_count', 'scanner_enabled_count',
  'created_at', 'updated_at',
].join(', ')

const SORT_COLUMNS = Object.freeze({
  starts: 'starts_at', created: 'created_at', title: 'title', type: 'event_type',
  location: 'location', status: 'status', speaker: 'speaker_name',
  invited: 'invited_count', present: 'present_count',
})
const MEMBER_SORT_COLUMNS = Object.freeze({ name: 'full_name', pole: 'primary_pole' })
const STAFF_SORT_COLUMNS = Object.freeze({ name: 'full_name', department: 'structure' })
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
    async organizers(eventId) {
      const { data, error } = await supabase.from('club_event_organizers')
        .select('id, staff_profile_id, role_label, scanner_enabled, assigned_at, staff:club_staff_profiles(id, internal_role, current_department, status, member:club_members(full_name)), scanner_access:club_event_scanner_access(id, status, starts_at, expires_at, revoked_at, last_used_at, created_at)')
        .eq('event_id', eventId)
        .order('assigned_at', { ascending: true })
      if (error) fail('events_organizers', error)
      return data || []
    },
    async invitedParticipants(eventId, options) {
      const from = (options.page - 1) * options.limit
      let query = supabase.from('club_event_invitations')
        .select('id, event_id, member_id, invitation_status, invited_at, registered_at, opened_at, token_hash, token_expires_at, credential_version, credential_derivation_version, link_revoked_at, participant_first_name, participant_last_name, member:club_members(full_name, email, phone, primary_pole, study_year, status)', { count: 'exact' })
        .eq('event_id', eventId)
      const search = safeSearch(options.q)
      if (search) query = query.or(`participant_first_name.ilike.%${search}%,participant_last_name.ilike.%${search}%`)
      const { data, error, count } = await query.order('invited_at', { ascending: false }).range(from, from + options.limit - 1)
      if (error) fail('events_invited_participants', error)
      return { rows: data || [], count: Number(count || 0) }
    },
    async memberPoles() {
      const { data, error } = await supabase.from('club_members').select('primary_pole').eq('status', 'active').limit(5000)
      if (error) fail('events_poles', error)
      const counts = new Map()
      for (const row of data || []) {
        const pole = row.primary_pole || 'Unassigned'
        counts.set(pole, (counts.get(pole) || 0) + 1)
      }
      return [...counts.entries()]
        .map(([pole, count]) => ({ pole, count }))
        .sort((a, b) => b.count - a.count || a.pole.localeCompare(b.pole, 'en'))
    },
    async eligibleMembers(eventId, options) {
      const from = (options.page - 1) * options.limit
      let query = supabase.from('club_members')
        .select('id, full_name, study_year, primary_pole, invitation:club_event_invitations(invitation_status, registered_at)', { count: 'exact' })
        .eq('status', 'active')
        .eq('invitation.event_id', eventId)
      const search = safeSearch(options.q)
      if (search) {
        const pattern = `%${search}%`
        query = query.or(`full_name.ilike.${pattern},primary_pole.ilike.${pattern}`)
      }
      if (options.pole) query = query.eq('primary_pole', options.pole)
      const [sortName, sortDirection] = options.sort.split('_')
      const { data, error, count } = await query
        .order(MEMBER_SORT_COLUMNS[sortName] || 'full_name', { ascending: sortDirection === 'asc' })
        .range(from, from + options.limit - 1)
      if (error) fail('events_members', error)
      return { rows: data || [], count: Number(count || 0) }
    },
    async invitationStates(eventId) {
      const { data, error } = await supabase.from('club_event_invitations').select('member_id, invitation_status, registered_at').eq('event_id', eventId)
      if (error) fail('events_invitations', error)
      return data || []
    },
    async eligibleStaff(options) {
      const from = (options.page - 1) * options.limit
      let query = supabase.from('admin_people_directory')
        .select('profile_id, member_id, full_name, internal_role, structure, status', { count: 'exact' })
        .eq('kind', 'staff')
        .eq('status', 'active')
      const search = safeSearch(options.q)
      if (search) {
        const pattern = `%${search}%`
        query = query.or(`full_name.ilike.${pattern},internal_role.ilike.${pattern},structure.ilike.${pattern}`)
      }
      if (options.department) query = query.eq('structure', options.department)
      const [sortName, sortDirection] = options.sort.split('_')
      const { data, error, count } = await query
        .order(STAFF_SORT_COLUMNS[sortName] || 'full_name', { ascending: sortDirection === 'asc' })
        .range(from, from + options.limit - 1)
      if (error) fail('events_staff', error)
      return { rows: data || [], count: Number(count || 0) }
    },
    async attendance(eventId, options) {
      const from = (options.page - 1) * options.limit
      let query = supabase.from('club_event_attendance')
        .select('id, member_id, attendance_status, checked_in_at, updated_at, member:club_members(full_name, primary_pole, study_year), scanner:club_event_scanner_access(event_organizer_id, organizer:club_event_organizers(staff:club_staff_profiles(member:club_members(full_name))))', { count: 'exact' })
        .eq('event_id', eventId)
      if (options.status) query = query.eq('attendance_status', options.status)
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
    async inviteMembers({ eventId, adminUserId, memberIds, scope, pole, now }) {
      const { data, error } = await supabase.rpc('admin_invite_club_event_members', {
        p_event_id: eventId, p_admin_user_id: adminUserId, p_member_ids: memberIds || null,
        p_scope: scope || null, p_pole: pole || null, p_now: now.toISOString(),
      })
      if (error) fail('events_invite', error)
      return Array.isArray(data) ? data[0] : data
    },
    async assignOrganizers({ eventId, adminUserId, staffProfileIds, now }) {
      const { data, error } = await supabase.rpc('admin_assign_club_event_organizers', {
        p_event_id: eventId, p_admin_user_id: adminUserId, p_staff_profile_ids: staffProfileIds, p_now: now.toISOString(),
      })
      if (error) fail('events_assign_organizers', error)
      return Array.isArray(data) ? data[0] : data
    },
    async removeOrganizer({ eventId, staffProfileId, adminUserId, now }) {
      const { data, error } = await supabase.rpc('admin_remove_club_event_organizer', {
        p_event_id: eventId, p_staff_profile_id: staffProfileId, p_admin_user_id: adminUserId, p_now: now.toISOString(),
      })
      if (error) fail('events_remove_organizer', error)
      return Array.isArray(data) ? data[0] : data
    },
    async setScannerAccess({ eventId, staffProfileId, enabled, adminUserId, now }) {
      const { data, error } = await supabase.rpc('admin_set_club_event_scanner_access', {
        p_event_id: eventId, p_staff_profile_id: staffProfileId, p_enabled: enabled,
        p_admin_user_id: adminUserId, p_now: now.toISOString(),
      })
      if (error) fail('events_scanner_access', error)
      return Array.isArray(data) ? data[0] : data
    },
    async invitationCredential(eventId, invitationId) {
      const { data, error } = await supabase.from('club_event_invitations')
        .select('id, event_id, invitation_status, token_hash, token_expires_at, credential_version, credential_derivation_version, link_revoked_at')
        .eq('event_id', eventId).eq('id', invitationId).maybeSingle()
      if (error) fail('events_invitation_credential', error)
      return data
    },
    async exportInvitationRows(eventId) {
      const rows = []
      const pageSize = 500
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase.from('club_event_invitations')
          .select('id, event_id, invitation_status, invited_at, registered_at, token_hash, token_expires_at, credential_version, credential_derivation_version, link_revoked_at, participant_first_name, participant_last_name, member:club_members(full_name, email, phone, primary_pole, study_year)')
          .eq('event_id', eventId)
          .in('invitation_status', ['invited', 'registered'])
          .order('invited_at', { ascending: true })
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
    async recordInvitationExport({ eventId, adminUserId, rowCount, now }) {
      const { data, error } = await supabase.rpc('admin_record_workshop_invitation_export', {
        p_event_id: eventId, p_admin_user_id: adminUserId, p_row_count: rowCount, p_now: now.toISOString(),
      })
      if (error) fail('events_record_invitation_export', error)
      return Boolean(Array.isArray(data) ? data[0] : data)
    },
    async generateScannerAccess({ eventId, eventOrganizerId, adminUserId, tokenHash, startsAt, expiresAt, now }) {
      const { data, error } = await supabase.rpc('admin_generate_event_scanner_access', {
        p_event_id: eventId, p_event_organizer_id: eventOrganizerId, p_admin_user_id: adminUserId,
        p_token_hash: tokenHash, p_starts_at: startsAt.toISOString(), p_expires_at: expiresAt.toISOString(), p_now: now.toISOString(),
      })
      if (error) fail('events_generate_scanner_access', error)
      return Array.isArray(data) ? data[0] : data
    },
    async revokeScannerAccess({ eventId, eventOrganizerId, adminUserId, now }) {
      const { data, error } = await supabase.rpc('admin_revoke_event_scanner_access', {
        p_event_id: eventId, p_event_organizer_id: eventOrganizerId,
        p_admin_user_id: adminUserId, p_now: now.toISOString(),
      })
      if (error) fail('events_revoke_scanner_access', error)
      return Array.isArray(data) ? data[0] : data
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
