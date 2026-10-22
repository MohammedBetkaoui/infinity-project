-- Scanner context reports the workshop lifecycle status so organizer scanner
-- clients can gate the check-in UX on 'ongoing' before submitting scans.
-- Forward-only: public_check_in_event_participant keeps its server-side
-- 'ongoing' gate unchanged.

begin;

create or replace function public.public_exchange_event_scanner_token(
  p_access_token_hash text, p_session_token_hash text, p_session_expires_at timestamptz, p_now timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  access_row public.club_event_scanner_access%rowtype;
  organizer_row public.club_event_organizers%rowtype;
  event_row public.club_events%rowtype;
  organizer_name text;
  changed_at timestamptz := coalesce(p_now, now());
begin
  if p_access_token_hash !~ '^[a-f0-9]{64}$' or p_session_token_hash !~ '^[a-f0-9]{64}$'
    or p_session_expires_at <= changed_at or p_session_expires_at > changed_at + interval '12 hours'
  then raise exception 'invalid_scanner_access' using errcode = '22023'; end if;
  select * into access_row from public.club_event_scanner_access where token_hash = p_access_token_hash for update;
  if not found or access_row.status <> 'active' or access_row.revoked_at is not null
    or access_row.starts_at > changed_at or access_row.expires_at <= changed_at
  then raise exception 'invalid_scanner_access' using errcode = '22023'; end if;
  select * into organizer_row from public.club_event_organizers where id = access_row.event_organizer_id for share;
  if not found or organizer_row.event_id <> access_row.event_id or not organizer_row.scanner_enabled
  then raise exception 'invalid_scanner_access' using errcode = '22023'; end if;
  select event.* into event_row from public.club_events event where event.id = access_row.event_id;
  if event_row.status not in ('registration_open','registration_closed','ongoing') then raise exception 'scanner_not_available' using errcode = '22023'; end if;
  select member.full_name into organizer_name from public.club_staff_profiles staff
    join public.club_members member on member.id = staff.member_id
    where staff.id = organizer_row.staff_profile_id and staff.status = 'active';
  if organizer_name is null then raise exception 'invalid_scanner_access' using errcode = '22023'; end if;

  update public.club_event_scanner_sessions set status = 'revoked', revoked_at = changed_at
   where scanner_access_id = access_row.id and status = 'active';
  insert into public.club_event_scanner_sessions
    (event_id, scanner_access_id, token_hash, status, expires_at, created_at)
  values (access_row.event_id, access_row.id, p_session_token_hash, 'active', least(p_session_expires_at, access_row.expires_at), changed_at);
  update public.club_event_scanner_access set last_used_at = changed_at where id = access_row.id;
  return jsonb_build_object(
    'event_id', event_row.id, 'event_title', event_row.title, 'organizer_name', organizer_name,
    'starts_at', event_row.starts_at, 'location', event_row.location,
    'event_status', event_row.status,
    'session_expires_at', least(p_session_expires_at, access_row.expires_at)
  );
end;
$$;

create or replace function public.public_event_scanner_context(p_session_token_hash text, p_now timestamptz)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare result jsonb; changed_at timestamptz := coalesce(p_now, now());
begin
  select jsonb_build_object(
    'event_id', event.id, 'event_title', event.title, 'organizer_name', member.full_name,
    'starts_at', event.starts_at, 'location', event.location,
    'event_status', event.status,
    'registered', (select count(*) from public.club_event_invitations i where i.event_id = event.id and i.invitation_status = 'registered'),
    'present', (select count(*) from public.club_event_attendance a where a.event_id = event.id and a.attendance_status = 'present')
  ) into result
  from public.club_event_scanner_sessions session
  join public.club_event_scanner_access access on access.id = session.scanner_access_id and access.event_id = session.event_id
  join public.club_event_organizers organizer on organizer.id = access.event_organizer_id and organizer.event_id = access.event_id
  join public.club_staff_profiles staff on staff.id = organizer.staff_profile_id
  join public.club_members member on member.id = staff.member_id
  join public.club_events event on event.id = session.event_id
  where session.token_hash = p_session_token_hash and session.status = 'active' and session.revoked_at is null and session.expires_at > changed_at
    and access.status = 'active' and access.revoked_at is null and access.expires_at > changed_at
    and organizer.scanner_enabled = true and staff.status = 'active' and event.status in ('registration_open','registration_closed','ongoing');
  if result is null then raise exception 'invalid_scanner_session' using errcode = '22023'; end if;
  return result;
end;
$$;

revoke all on function public.public_exchange_event_scanner_token(text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.public_event_scanner_context(text,timestamptz) from public, anon, authenticated;

grant execute on function public.public_exchange_event_scanner_token(text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.public_event_scanner_context(text,timestamptz) to service_role;

commit;
