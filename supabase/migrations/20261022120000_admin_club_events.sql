-- Real events operations for Infinity Club (Workshops first, generic core).
-- Server/service-role only. No browser table access and no demo seed data.
--
-- Phase 1 keeps the core generic (event types, statuses) but exposes only the
-- Workshop workflow: create, list, invitations, organizers, scanner-prep and
-- attendance views. Scanner links/tokens stay out of the database until the
-- dedicated check-in phase; this migration only prepares the persistence.

begin;

create table if not exists public.club_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null,
  speaker_name text,
  visibility text not null default 'internal',
  status text not null default 'draft',
  created_by_admin_user_id uuid references public.admin_users (id) on delete set null,
  updated_by_admin_user_id uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint club_events_type_check check (
    event_type in ('workshop','competition','conference','open_day','hackathon','meeting','training','other')
  ),
  constraint club_events_title_check check (title = btrim(title) and char_length(title) between 3 and 160),
  constraint club_events_description_check check (
    description is null or (description = btrim(description) and char_length(description) <= 2000)
  ),
  constraint club_events_window_check check (ends_at is null or ends_at > starts_at),
  constraint club_events_location_check check (location = btrim(location) and char_length(location) between 2 and 160),
  constraint club_events_speaker_check check (
    speaker_name is null or (speaker_name = btrim(speaker_name) and char_length(speaker_name) between 2 and 120)
  ),
  constraint club_events_visibility_check check (visibility in ('internal','public')),
  constraint club_events_status_check check (
    status in ('draft','planned','registration_open','registration_closed','ongoing','completed','cancelled','archived')
  )
);

create table if not exists public.club_event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_events (id) on delete cascade,
  member_id uuid not null references public.club_members (id) on delete cascade,
  invitation_status text not null default 'invited',
  invited_at timestamptz not null default now(),
  invited_by_admin_user_id uuid references public.admin_users (id) on delete set null,
  registered_at timestamptz,
  created_at timestamptz not null default now(),

  constraint club_event_invitation_status_check check (invitation_status in ('invited','registered','declined','cancelled')),
  constraint club_event_invitation_registered_at_check check (registered_at is null or invitation_status = 'registered'),
  constraint club_event_invitation_unique unique (event_id, member_id)
);

create table if not exists public.club_event_organizers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_events (id) on delete cascade,
  staff_profile_id uuid not null references public.club_staff_profiles (id) on delete cascade,
  role_label text,
  scanner_enabled boolean not null default false,
  assigned_by_admin_user_id uuid references public.admin_users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint club_event_organizer_role_check check (
    role_label is null or (role_label = btrim(role_label) and char_length(role_label) between 2 and 120)
  ),
  constraint club_event_organizer_unique unique (event_id, staff_profile_id),
  -- Anchors the composite foreign key from club_event_scanner_access so a
  -- scanner grant can never be created for an organizer of another event.
  constraint club_event_organizer_id_event_unique unique (id, event_id)
);

create table if not exists public.club_event_scanner_access (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_events (id) on delete cascade,
  event_organizer_id uuid not null,
  token_hash text not null,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by_admin_user_id uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint club_event_scanner_token_check check (char_length(token_hash) between 32 and 128),
  constraint club_event_scanner_status_check check (status in ('active','revoked','expired')),
  constraint club_event_scanner_active_state_check check (
    (status = 'active' and revoked_at is null) or status <> 'active'
  ),
  constraint club_event_scanner_event_fk foreign key (event_organizer_id, event_id)
    references public.club_event_organizers (id, event_id) on delete cascade,
  constraint club_event_scanner_id_event_unique unique (id, event_id),
  constraint club_event_scanner_window_check check (expires_at is null or expires_at > starts_at)
);

create table if not exists public.club_event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_events (id) on delete cascade,
  member_id uuid not null references public.club_members (id) on delete cascade,
  attendance_status text not null default 'expected',
  checked_in_at timestamptz,
  checked_in_by_scanner_access_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint club_event_attendance_status_check check (attendance_status in ('expected','present','absent','excused')),
  constraint club_event_attendance_checkin_check check (attendance_status <> 'present' or checked_in_at is not null),
  constraint club_event_attendance_unique unique (event_id, member_id),
  constraint club_event_attendance_scanner_event_fk foreign key (checked_in_by_scanner_access_id, event_id)
    references public.club_event_scanner_access (id, event_id) on delete set null (checked_in_by_scanner_access_id)
);

create index if not exists club_events_schedule_idx on public.club_events (status, starts_at desc);
create index if not exists club_events_type_idx on public.club_events (event_type, starts_at desc);
create index if not exists club_event_invitations_event_idx on public.club_event_invitations (event_id, invitation_status);
create index if not exists club_event_organizers_event_idx on public.club_event_organizers (event_id, staff_profile_id);
create index if not exists club_event_attendance_event_idx on public.club_event_attendance (event_id, attendance_status);
-- Only one active scanner grant per organizer; re-granting supersedes by
-- revoking the previous row first (server logic, phase 2).
create unique index if not exists club_event_scanner_active_unique
  on public.club_event_scanner_access (event_organizer_id)
  where status = 'active';

-- A single read model gives the API one stable vocabulary for the list page,
-- the detail page, statistics and the global search.
create or replace view public.admin_club_events_directory
with (security_invoker = true)
as
select
  event.id,
  event.event_type,
  event.title,
  event.description,
  event.starts_at,
  event.ends_at,
  event.location,
  event.speaker_name,
  event.visibility,
  event.status,
  (select count(*)::integer from public.club_event_invitations invitation
    where invitation.event_id = event.id and invitation.invitation_status <> 'cancelled') as invited_count,
  (select count(*)::integer from public.club_event_invitations invitation
    where invitation.event_id = event.id and invitation.invitation_status = 'registered') as registered_count,
  (select count(*)::integer from public.club_event_attendance attendance
    where attendance.event_id = event.id and attendance.attendance_status = 'expected') as expected_count,
  (select count(*)::integer from public.club_event_attendance attendance
    where attendance.event_id = event.id and attendance.attendance_status = 'present') as present_count,
  (select count(*)::integer from public.club_event_attendance attendance
    where attendance.event_id = event.id and attendance.attendance_status = 'absent') as absent_count,
  (select count(*)::integer from public.club_event_attendance attendance
    where attendance.event_id = event.id and attendance.attendance_status = 'excused') as excused_count,
  (select count(*)::integer from public.club_event_attendance attendance
    where attendance.event_id = event.id) as attendance_count,
  (select count(*)::integer from public.club_event_organizers organizer
    where organizer.event_id = event.id) as organizer_count,
  (select count(*)::integer from public.club_event_organizers organizer
    where organizer.event_id = event.id and organizer.scanner_enabled = true) as scanner_enabled_count,
  event.created_by_admin_user_id,
  event.updated_by_admin_user_id,
  event.created_at,
  event.updated_at
from public.club_events event;

-- Create a club event through the protected server actor. Phase 1 creates
-- workshops only; the generic table still accepts every future event type.
create or replace function public.admin_create_club_event(
  p_admin_user_id uuid,
  p_payload jsonb,
  p_now timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  administrator_role text;
  event_id_value uuid;
  starts_at_value timestamptz;
  ends_at_value timestamptz;
  status_value text;
  changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if p_payload->>'eventType' is distinct from 'workshop' then raise exception 'unsupported_event_type' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_payload->>'speakerName','')), '') is null then raise exception 'workshop_speaker_required' using errcode = '22023'; end if;

  starts_at_value := (p_payload->>'startsAt')::timestamptz;
  ends_at_value := nullif(btrim(coalesce(p_payload->>'endsAt','')), '');
  if starts_at_value is null then raise exception 'invalid_event_start' using errcode = '22023'; end if;
  if ends_at_value is not null and ends_at_value <= starts_at_value then raise exception 'invalid_event_window' using errcode = '22023'; end if;
  status_value := coalesce(p_payload->>'status', 'draft');
  if status_value not in ('draft','planned') then raise exception 'invalid_event_status' using errcode = '22023'; end if;

  insert into public.club_events (
    event_type, title, description, starts_at, ends_at, location, speaker_name,
    visibility, status, created_by_admin_user_id, updated_by_admin_user_id, created_at, updated_at
  ) values (
    'workshop', btrim(p_payload->>'title'), nullif(btrim(coalesce(p_payload->>'description','')), ''),
    starts_at_value, ends_at_value, btrim(p_payload->>'location'),
    nullif(btrim(coalesce(p_payload->>'speakerName','')), ''),
    'internal', status_value, p_admin_user_id, p_admin_user_id, changed_at, changed_at
  ) returning id into event_id_value;

  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', event_id_value, 'event_created', 'standard',
          jsonb_build_object('event_type', 'workshop', 'status', status_value), changed_at);
  return event_id_value;
end;
$$;

-- Update workshop basic information with optimistic concurrency: the caller
-- proves it saw the current updated_at before overwriting it.
create or replace function public.admin_update_club_event(
  p_event_id uuid,
  p_admin_user_id uuid,
  p_expected_updated_at timestamptz,
  p_payload jsonb,
  p_now timestamptz
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  administrator_role text;
  event_row public.club_events%rowtype;
  starts_at_value timestamptz;
  ends_at_value timestamptz;
  status_value text;
  changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;

  select * into event_row from public.club_events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if event_row.updated_at <> p_expected_updated_at then raise exception 'event_conflict' using errcode = '40001'; end if;
  if p_payload->>'eventType' is distinct from event_row.event_type then raise exception 'unsupported_event_type' using errcode = '22023'; end if;
  if event_row.event_type = 'workshop' and nullif(btrim(coalesce(p_payload->>'speakerName','')), '') is null then
    raise exception 'workshop_speaker_required' using errcode = '22023';
  end if;

  starts_at_value := (p_payload->>'startsAt')::timestamptz;
  ends_at_value := nullif(btrim(coalesce(p_payload->>'endsAt','')), '');
  if starts_at_value is null then raise exception 'invalid_event_start' using errcode = '22023'; end if;
  if ends_at_value is not null and ends_at_value <= starts_at_value then raise exception 'invalid_event_window' using errcode = '22023'; end if;
  status_value := coalesce(p_payload->>'status', event_row.status);
  if status_value not in ('draft','planned','registration_open','registration_closed','ongoing','completed','cancelled','archived') then
    raise exception 'invalid_event_status' using errcode = '22023';
  end if;

  update public.club_events set
    title = btrim(p_payload->>'title'),
    description = nullif(btrim(coalesce(p_payload->>'description','')), ''),
    starts_at = starts_at_value,
    ends_at = ends_at_value,
    location = btrim(p_payload->>'location'),
    speaker_name = nullif(btrim(coalesce(p_payload->>'speakerName','')), ''),
    status = status_value,
    updated_by_admin_user_id = p_admin_user_id,
    updated_at = changed_at
  where id = event_row.id;

  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', event_row.id, 'event_updated', 'standard',
          jsonb_build_object(
            'status', status_value,
            'status_changed', status_value is distinct from event_row.status
          ), changed_at);
  return changed_at;
end;
$$;

-- Invite members to an event. Either an explicit member list or a scope
-- ('all_active' or 'primary_pole' with the pole). Every invited member also
-- gets an 'expected' attendance row; re-running is idempotent and never
-- duplicates invitations.
create or replace function public.admin_invite_club_event_members(
  p_event_id uuid,
  p_admin_user_id uuid,
  p_member_ids uuid[],
  p_scope text,
  p_pole text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  administrator_role text;
  event_row public.club_events%rowtype;
  member_ids_clean uuid[];
  requested_count integer := 0;
  added_count integer := 0;
  changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if p_member_ids is not null and p_scope is not null then raise exception 'invalid_invitation_scope' using errcode = '22023'; end if;
  if p_member_ids is null and p_scope not in ('all_active','primary_pole') then raise exception 'invalid_invitation_scope' using errcode = '22023'; end if;
  if p_scope = 'primary_pole' and (p_pole is null or char_length(btrim(p_pole)) < 2 or char_length(btrim(p_pole)) > 120) then
    raise exception 'invalid_invitation_pole' using errcode = '22023';
  end if;

  select * into event_row from public.club_events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;

  if p_member_ids is not null then
    if coalesce(array_length(p_member_ids, 1), 0) < 1 or coalesce(array_length(p_member_ids, 1), 0) > 500
      or (select count(distinct selected.member_id) from unnest(p_member_ids) as selected(member_id)) <> coalesce(array_length(p_member_ids, 1), 0) then
      raise exception 'invalid_invitation_members' using errcode = '22023';
    end if;
    -- Unknown member identifiers are rejected; known but inactive members are
    -- simply skipped and reported in the result.
    if (select count(*) from public.club_members where id = any(p_member_ids)) <> coalesce(array_length(p_member_ids, 1), 0) then
      raise exception 'unknown_member' using errcode = '22023';
    end if;
    select coalesce(array_agg(id order by id), '{}') into member_ids_clean
      from public.club_members where id = any(p_member_ids) and status = 'active';
    requested_count := coalesce(array_length(member_ids_clean, 1), 0);
  elsif p_scope = 'all_active' then
    select count(*) into requested_count from public.club_members where status = 'active';
  else
    select count(*) into requested_count from public.club_members where status = 'active' and primary_pole = btrim(p_pole);
  end if;

  with target as (
    select member.id
    from public.club_members member
    where member.status = 'active'
      and (
        (member_ids_clean is not null and member.id = any(member_ids_clean))
        or (p_scope = 'all_active')
        or (p_scope = 'primary_pole' and member.primary_pole = btrim(p_pole))
      )
  ), inserted as (
    insert into public.club_event_invitations (event_id, member_id, invitation_status, invited_at, invited_by_admin_user_id, created_at)
    select p_event_id, target.id, 'invited', changed_at, p_admin_user_id, changed_at
    from target
    on conflict (event_id, member_id) do nothing
    returning member_id
  )
  select count(*) into added_count from inserted;

  -- One attendance row per invited member, whatever path led here.
  insert into public.club_event_attendance (event_id, member_id, attendance_status, created_at, updated_at)
  select invitation.event_id, invitation.member_id, 'expected', changed_at, changed_at
  from public.club_event_invitations invitation
  where invitation.event_id = p_event_id
  on conflict (event_id, member_id) do nothing;

  update public.club_events
     set updated_at = changed_at, updated_by_admin_user_id = p_admin_user_id
   where id = event_row.id;

  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id, 'members_invited', 'standard',
          jsonb_build_object(
            'requested', requested_count,
            'added', added_count,
            'scope', coalesce(p_scope, 'members'),
            'pole', nullif(btrim(coalesce(p_pole,'')), '')
          ), changed_at);
  return jsonb_build_object('requested', requested_count, 'added', added_count);
end;
$$;

-- Assign staff members as event organizers. Unknown staff identifiers are
-- rejected; known but inactive staff are skipped and reported.
create or replace function public.admin_assign_club_event_organizers(
  p_event_id uuid,
  p_admin_user_id uuid,
  p_staff_profile_ids uuid[],
  p_now timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  administrator_role text;
  event_row public.club_events%rowtype;
  requested_count integer := 0;
  added_count integer := 0;
  changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if p_staff_profile_ids is null or coalesce(array_length(p_staff_profile_ids, 1), 0) < 1
    or coalesce(array_length(p_staff_profile_ids, 1), 0) > 50
    or (select count(distinct selected.staff_profile_id) from unnest(p_staff_profile_ids) as selected(staff_profile_id)) <> coalesce(array_length(p_staff_profile_ids, 1), 0) then
    raise exception 'invalid_event_organizers' using errcode = '22023';
  end if;

  select * into event_row from public.club_events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if (select count(*) from public.club_staff_profiles where id = any(p_staff_profile_ids)) <> coalesce(array_length(p_staff_profile_ids, 1), 0) then
    raise exception 'unknown_staff' using errcode = '22023';
  end if;

  with target as (
    select staff.id
    from public.club_staff_profiles staff
    where staff.id = any(p_staff_profile_ids) and staff.status = 'active'
  ), inserted as (
    insert into public.club_event_organizers (event_id, staff_profile_id, assigned_by_admin_user_id, assigned_at, created_at)
    select p_event_id, target.id, p_admin_user_id, changed_at, changed_at
    from target
    on conflict (event_id, staff_profile_id) do nothing
    returning staff_profile_id
  )
  select coalesce((select count(*) from target), 0), (select count(*) from inserted)
    into requested_count, added_count;

  update public.club_events
     set updated_at = changed_at, updated_by_admin_user_id = p_admin_user_id
   where id = event_row.id;

  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id, 'organizer_added', 'standard',
          jsonb_build_object('requested', requested_count, 'added', added_count), changed_at);
  return jsonb_build_object('requested', requested_count, 'added', added_count);
end;
$$;

-- Remove one organizer. Scanner grants cascade through the foreign key.
create or replace function public.admin_remove_club_event_organizer(
  p_event_id uuid,
  p_staff_profile_id uuid,
  p_admin_user_id uuid,
  p_now timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  administrator_role text;
  event_row public.club_events%rowtype;
  changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;

  select * into event_row from public.club_events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;

  delete from public.club_event_organizers
   where event_id = p_event_id and staff_profile_id = p_staff_profile_id;
  if not found then raise exception 'organizer_not_found' using errcode = 'P0002'; end if;

  update public.club_events
     set updated_at = changed_at, updated_by_admin_user_id = p_admin_user_id
   where id = event_row.id;

  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id, 'organizer_removed', 'standard',
          jsonb_build_object('staff_profile_id', p_staff_profile_id), changed_at);
  return true;
end;
$$;

-- Prepare (enable) or withdraw (disable) scanner access for one organizer.
-- Phase 1 only flips the flag and writes the audit entry; no token, link or
-- QR exists yet.
create or replace function public.admin_set_club_event_scanner_access(
  p_event_id uuid,
  p_staff_profile_id uuid,
  p_enabled boolean,
  p_admin_user_id uuid,
  p_now timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  administrator_role text;
  event_row public.club_events%rowtype;
  changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if p_enabled is null then raise exception 'invalid_scanner_state' using errcode = '22023'; end if;

  select * into event_row from public.club_events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;

  update public.club_event_organizers
     set scanner_enabled = p_enabled
   where event_id = p_event_id and staff_profile_id = p_staff_profile_id;
  if not found then raise exception 'organizer_not_found' using errcode = 'P0002'; end if;

  update public.club_events
     set updated_at = changed_at, updated_by_admin_user_id = p_admin_user_id
   where id = event_row.id;

  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id,
          case when p_enabled then 'scanner_access_prepared' else 'scanner_access_revoked' end,
          'standard', jsonb_build_object('staff_profile_id', p_staff_profile_id, 'enabled', p_enabled), changed_at);
  return p_enabled;
end;
$$;

-- Extend the existing audit vocabulary without replacing other constraints.
alter table public.admin_audit_events drop constraint if exists admin_audit_object_type_check;
alter table public.admin_audit_events add constraint admin_audit_object_type_check
  check (object_type in (
    'join_application', 'aivex_registration', 'aivex_document',
    'club_member', 'club_staff', 'aivex_settings', 'staff_link_export', 'club_event'
  ));

alter table public.club_events enable row level security;
alter table public.club_event_invitations enable row level security;
alter table public.club_event_organizers enable row level security;
alter table public.club_event_scanner_access enable row level security;
alter table public.club_event_attendance enable row level security;

revoke all on table public.club_events, public.club_event_invitations, public.club_event_organizers,
  public.club_event_scanner_access, public.club_event_attendance, public.admin_club_events_directory
  from anon, authenticated;
grant select, insert, update, delete on table public.club_events, public.club_event_invitations,
  public.club_event_organizers, public.club_event_scanner_access, public.club_event_attendance to service_role;
grant select on table public.admin_club_events_directory to service_role;

revoke all on function public.admin_create_club_event(uuid,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_create_club_event(uuid,jsonb,timestamptz) to service_role;
revoke all on function public.admin_update_club_event(uuid,uuid,timestamptz,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_update_club_event(uuid,uuid,timestamptz,jsonb,timestamptz) to service_role;
revoke all on function public.admin_invite_club_event_members(uuid,uuid,uuid[],text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_invite_club_event_members(uuid,uuid,uuid[],text,text,timestamptz) to service_role;
revoke all on function public.admin_assign_club_event_organizers(uuid,uuid,uuid[],timestamptz) from public, anon, authenticated;
grant execute on function public.admin_assign_club_event_organizers(uuid,uuid,uuid[],timestamptz) to service_role;
revoke all on function public.admin_remove_club_event_organizer(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_remove_club_event_organizer(uuid,uuid,uuid,timestamptz) to service_role;
revoke all on function public.admin_set_club_event_scanner_access(uuid,uuid,boolean,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_set_club_event_scanner_access(uuid,uuid,boolean,uuid,timestamptz) to service_role;

comment on table public.club_events is 'Generic club events core. Phase 1 exposes the workshop workflow only.';
comment on table public.club_event_invitations is 'Per-member invitation state for a club event. One row per member and event.';
comment on table public.club_event_organizers is 'Staff members responsible for running a club event. Carries the phase-2 scanner-enable flag.';
comment on table public.club_event_scanner_access is 'Scanner grant persistence for phase 2. Tokens are stored as hashes only; no rows are created in phase 1.';
comment on table public.club_event_attendance is 'Per-member attendance state for a club event. One row per member and event.';
comment on view public.admin_club_events_directory is 'Server-only read model for the Events administration pages with invitation, attendance and organizer aggregates.';

commit;
