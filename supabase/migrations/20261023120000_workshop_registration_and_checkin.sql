-- Events phase 2: private invitations, participant passes and capability-only
-- scanner sessions. Forward-only; apply after 20261022120000_admin_club_events.sql.

begin;

alter table public.club_event_invitations
  add column if not exists token_hash text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists email_delivery_status text not null default 'not_sent',
  add column if not exists email_provider_message_id text,
  add column if not exists participant_first_name text,
  add column if not exists participant_last_name text;

alter table public.club_event_invitations
  add constraint club_event_invitation_token_hash_check
    check (token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
  add constraint club_event_invitation_token_window_check
    check ((token_hash is null and token_expires_at is null) or (token_hash is not null and token_expires_at is not null)),
  add constraint club_event_invitation_delivery_check
    check (email_delivery_status in ('not_sent','pending','sent','failed')),
  add constraint club_event_invitation_provider_id_check
    check (email_provider_message_id is null or char_length(email_provider_message_id) between 1 and 255),
  add constraint club_event_invitation_first_name_check
    check (participant_first_name is null or (participant_first_name = btrim(participant_first_name) and char_length(participant_first_name) between 1 and 80)),
  add constraint club_event_invitation_last_name_check
    check (participant_last_name is null or (participant_last_name = btrim(participant_last_name) and char_length(participant_last_name) between 1 and 80));

create unique index if not exists club_event_invitation_token_hash_unique
  on public.club_event_invitations (token_hash) where token_hash is not null;
alter table public.club_event_invitations
  add constraint club_event_invitation_id_event_unique unique (id, event_id);

create table public.club_event_participant_credentials (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_events (id) on delete cascade,
  invitation_id uuid not null unique references public.club_event_invitations (id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_presented_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_event_participant_credential_hash_check check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint club_event_participant_credential_status_check check (status in ('active','revoked','expired')),
  constraint club_event_participant_credential_window_check check (expires_at > issued_at),
  constraint club_event_participant_credential_active_check check ((status = 'active' and revoked_at is null) or status <> 'active'),
  constraint club_event_participant_invitation_event_fk foreign key (invitation_id, event_id)
    references public.club_event_invitations (id, event_id) on delete cascade
);

alter table public.club_event_scanner_access
  add constraint club_event_scanner_token_hash_format_check check (token_hash ~ '^[a-f0-9]{64}$');
create unique index if not exists club_event_scanner_token_hash_unique on public.club_event_scanner_access (token_hash);

create table public.club_event_scanner_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_events (id) on delete cascade,
  scanner_access_id uuid not null,
  token_hash text not null unique,
  status text not null default 'active',
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint club_event_scanner_session_hash_check check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint club_event_scanner_session_status_check check (status in ('active','revoked','expired')),
  constraint club_event_scanner_session_active_check check ((status = 'active' and revoked_at is null) or status <> 'active'),
  constraint club_event_scanner_session_window_check check (expires_at > created_at),
  constraint club_event_scanner_session_access_fk foreign key (scanner_access_id, event_id)
    references public.club_event_scanner_access (id, event_id) on delete cascade
);

create index club_event_participant_credentials_event_idx on public.club_event_participant_credentials (event_id, status);
create index club_event_scanner_sessions_access_idx on public.club_event_scanner_sessions (scanner_access_id, status, expires_at);
create unique index club_event_scanner_session_active_unique on public.club_event_scanner_sessions (scanner_access_id) where status = 'active';

-- Creates/rotates the private invitation credential before the mail provider
-- is called. A failed provider call is explicitly recorded as failed; it is
-- never reported as a successful delivery.
create or replace function public.admin_prepare_event_invitation_delivery(
  p_invitation_id uuid, p_event_id uuid, p_admin_user_id uuid,
  p_token_hash text, p_expires_at timestamptz, p_now timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  administrator_role text;
  invitation_row public.club_event_invitations%rowtype;
  event_row public.club_events%rowtype;
  member_row public.club_members%rowtype;
  changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_expires_at <= changed_at then raise exception 'invalid_invitation_credential' using errcode = '22023'; end if;
  select * into invitation_row from public.club_event_invitations where id = p_invitation_id and event_id = p_event_id for update;
  if not found then raise exception 'invitation_not_found' using errcode = 'P0002'; end if;
  select * into event_row from public.club_events where id = invitation_row.event_id;
  if event_row.event_type <> 'workshop' or event_row.status <> 'registration_open' then raise exception 'registration_not_open' using errcode = '22023'; end if;
  if invitation_row.invitation_status in ('cancelled','declined') then raise exception 'invitation_not_active' using errcode = '22023'; end if;
  select * into member_row from public.club_members where id = invitation_row.member_id;
  if not found then raise exception 'member_not_found' using errcode = 'P0002'; end if;

  update public.club_event_invitations set
    token_hash = p_token_hash, token_expires_at = p_expires_at,
    email_delivery_status = 'pending', email_provider_message_id = null
  where id = invitation_row.id;

  return jsonb_build_object(
    'invitation_id', invitation_row.id, 'email', member_row.email, 'member_name', member_row.full_name,
    'event_title', event_row.title, 'starts_at', event_row.starts_at, 'ends_at', event_row.ends_at,
    'location', event_row.location, 'speaker_name', event_row.speaker_name,
    'resent', invitation_row.sent_at is not null
  );
end;
$$;

create or replace function public.admin_finish_event_invitation_delivery(
  p_invitation_id uuid, p_event_id uuid, p_admin_user_id uuid,
  p_success boolean, p_provider_message_id text, p_resent boolean, p_now timestamptz
) returns boolean
language plpgsql security invoker set search_path = public as $$
declare
  administrator_role text;
  changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  update public.club_event_invitations set
    email_delivery_status = case when p_success then 'sent' else 'failed' end,
    email_provider_message_id = case when p_success then nullif(btrim(coalesce(p_provider_message_id,'')), '') else null end,
    sent_at = case when p_success then changed_at else sent_at end
  where id = p_invitation_id and event_id = p_event_id;
  if not found then raise exception 'invitation_not_found' using errcode = 'P0002'; end if;
  if p_success then
    insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
    values (p_admin_user_id, 'club_event', p_event_id,
      case when p_resent then 'invitation_resent' else 'invitation_sent' end,
      'standard', jsonb_build_object('invitation_id', p_invitation_id), changed_at);
  end if;
  return p_success;
end;
$$;

create or replace function public.public_open_event_invitation(p_token_hash text, p_now timestamptz)
returns table (
  invitation_id uuid, invitation_status text, member_name text,
  event_id uuid, event_title text, starts_at timestamptz, ends_at timestamptz,
  location text, speaker_name text, registered_first_name text, registered_last_name text
)
language plpgsql security invoker set search_path = public as $$
declare changed_at timestamptz := coalesce(p_now, now());
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then return; end if;
  update public.club_event_invitations invitation set opened_at = coalesce(invitation.opened_at, changed_at)
   where invitation.token_hash = p_token_hash
     and invitation.token_expires_at > changed_at
     and invitation.invitation_status in ('invited','registered');
  return query
    select invitation.id, invitation.invitation_status, member.full_name,
      event.id, event.title, event.starts_at, event.ends_at, event.location, event.speaker_name,
      invitation.participant_first_name, invitation.participant_last_name
    from public.club_event_invitations invitation
    join public.club_events event on event.id = invitation.event_id
    join public.club_members member on member.id = invitation.member_id
    where invitation.token_hash = p_token_hash
      and invitation.token_expires_at > changed_at
      and invitation.invitation_status in ('invited','registered')
      and event.event_type = 'workshop'
      and event.status in ('registration_open','registration_closed','ongoing','completed');
end;
$$;

-- Registration and credential rotation happen under one invitation row lock.
-- Revisiting an already registered invitation returns the same registration
-- while rotating its opaque QR credential, so only one QR remains valid.
create or replace function public.public_register_event_participant(
  p_invitation_token_hash text, p_first_name text, p_last_name text,
  p_qr_token_hash text, p_qr_expires_at timestamptz, p_now timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  invitation_row public.club_event_invitations%rowtype;
  event_row public.club_events%rowtype;
  changed_at timestamptz := coalesce(p_now, now());
  already_registered boolean;
begin
  if p_invitation_token_hash !~ '^[a-f0-9]{64}$' or p_qr_token_hash !~ '^[a-f0-9]{64}$'
    or p_qr_expires_at <= changed_at
    or char_length(btrim(coalesce(p_first_name,''))) not between 1 and 80
    or char_length(btrim(coalesce(p_last_name,''))) not between 1 and 80
  then raise exception 'invalid_registration' using errcode = '22023'; end if;

  select * into invitation_row from public.club_event_invitations
   where token_hash = p_invitation_token_hash for update;
  if not found or invitation_row.token_expires_at <= changed_at
    or invitation_row.invitation_status in ('declined','cancelled')
  then raise exception 'invalid_invitation' using errcode = '22023'; end if;
  select * into event_row from public.club_events where id = invitation_row.event_id for share;
  already_registered := invitation_row.invitation_status = 'registered';
  if event_row.event_type <> 'workshop'
    or (not already_registered and event_row.status <> 'registration_open')
    or (already_registered and event_row.status not in ('registration_open','registration_closed','ongoing'))
  then raise exception 'registration_not_open' using errcode = '22023'; end if;
  update public.club_event_invitations set
    invitation_status = 'registered', registered_at = coalesce(registered_at, changed_at),
    participant_first_name = btrim(p_first_name), participant_last_name = btrim(p_last_name)
  where id = invitation_row.id;

  insert into public.club_event_attendance (event_id, member_id, attendance_status, created_at, updated_at)
  values (invitation_row.event_id, invitation_row.member_id, 'expected', changed_at, changed_at)
  on conflict (event_id, member_id) do nothing;

  insert into public.club_event_participant_credentials
    (event_id, invitation_id, token_hash, status, issued_at, expires_at, created_at, updated_at)
  values (invitation_row.event_id, invitation_row.id, p_qr_token_hash, 'active', changed_at, p_qr_expires_at, changed_at, changed_at)
  on conflict (invitation_id) do update set
    token_hash = excluded.token_hash, status = 'active', issued_at = excluded.issued_at,
    expires_at = excluded.expires_at, revoked_at = null, updated_at = excluded.updated_at;

  if not already_registered then
    insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
    values (null, 'club_event', invitation_row.event_id, 'participant_registered', 'standard',
      jsonb_build_object('invitation_id', invitation_row.id), changed_at);
  end if;
  return jsonb_build_object(
    'event_id', event_row.id, 'event_title', event_row.title, 'starts_at', event_row.starts_at,
    'ends_at', event_row.ends_at, 'location', event_row.location,
    'first_name', btrim(p_first_name), 'last_name', btrim(p_last_name),
    'already_registered', already_registered, 'qr_expires_at', p_qr_expires_at
  );
end;
$$;

create or replace function public.admin_generate_event_scanner_access(
  p_event_id uuid, p_event_organizer_id uuid, p_admin_user_id uuid,
  p_token_hash text, p_starts_at timestamptz, p_expires_at timestamptz, p_now timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  administrator_role text;
  organizer_row public.club_event_organizers%rowtype;
  changed_at timestamptz := coalesce(p_now, now());
  regenerated boolean;
  access_id uuid;
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_expires_at <= greatest(p_starts_at, changed_at)
  then raise exception 'invalid_scanner_credential' using errcode = '22023'; end if;
  select * into organizer_row from public.club_event_organizers
   where id = p_event_organizer_id and event_id = p_event_id for update;
  if not found then raise exception 'organizer_not_found' using errcode = 'P0002'; end if;
  if not organizer_row.scanner_enabled then raise exception 'scanner_not_enabled' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.club_staff_profiles staff
    where staff.id = organizer_row.staff_profile_id and staff.status = 'active'
  ) then raise exception 'organizer_not_eligible' using errcode = '42501'; end if;

  select exists(select 1 from public.club_event_scanner_access where event_organizer_id = organizer_row.id) into regenerated;
  update public.club_event_scanner_access set status = 'revoked', revoked_at = changed_at
   where event_organizer_id = organizer_row.id and status = 'active';
  update public.club_event_scanner_sessions session set status = 'revoked', revoked_at = changed_at
   where session.scanner_access_id in (select id from public.club_event_scanner_access where event_organizer_id = organizer_row.id)
     and session.status = 'active';

  insert into public.club_event_scanner_access
    (event_id, event_organizer_id, token_hash, status, starts_at, expires_at, created_by_admin_user_id, created_at)
  values (p_event_id, organizer_row.id, p_token_hash, 'active', p_starts_at, p_expires_at, p_admin_user_id, changed_at)
  returning id into access_id;
  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id,
    case when regenerated then 'scanner_access_regenerated' else 'scanner_access_generated' end,
    'standard', jsonb_build_object('event_organizer_id', organizer_row.id, 'scanner_access_id', access_id), changed_at);
  return jsonb_build_object('id', access_id, 'regenerated', regenerated, 'starts_at', p_starts_at, 'expires_at', p_expires_at);
end;
$$;

create or replace function public.admin_revoke_event_scanner_access(
  p_event_id uuid, p_event_organizer_id uuid, p_admin_user_id uuid, p_now timestamptz
) returns boolean
language plpgsql security invoker set search_path = public as $$
declare administrator_role text; changed_at timestamptz := coalesce(p_now, now()); revoked_count integer;
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if not exists(select 1 from public.club_event_organizers where id = p_event_organizer_id and event_id = p_event_id)
  then raise exception 'organizer_not_found' using errcode = 'P0002'; end if;
  update public.club_event_scanner_sessions session set status = 'revoked', revoked_at = changed_at
   where session.scanner_access_id in (
     select id from public.club_event_scanner_access where event_id = p_event_id and event_organizer_id = p_event_organizer_id
   ) and session.status = 'active';
  update public.club_event_scanner_access set status = 'revoked', revoked_at = changed_at
   where event_id = p_event_id and event_organizer_id = p_event_organizer_id and status = 'active';
  get diagnostics revoked_count = row_count;
  if revoked_count > 0 then
    insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
    values (p_admin_user_id, 'club_event', p_event_id, 'scanner_access_revoked', 'standard',
      jsonb_build_object('event_organizer_id', p_event_organizer_id), changed_at);
  end if;
  return revoked_count > 0;
end;
$$;

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

-- Row locks serialize two simultaneous scans of the same participant. Exactly
-- one caller changes expected -> present; later callers receive the original
-- authoritative check-in timestamp.
create or replace function public.public_check_in_event_participant(
  p_session_token_hash text, p_qr_token_hash text, p_now timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  session_row public.club_event_scanner_sessions%rowtype;
  access_row public.club_event_scanner_access%rowtype;
  credential_row public.club_event_participant_credentials%rowtype;
  invitation_row public.club_event_invitations%rowtype;
  attendance_row public.club_event_attendance%rowtype;
  participant_name text;
  changed_at timestamptz := coalesce(p_now, now());
begin
  if p_session_token_hash !~ '^[a-f0-9]{64}$' or p_qr_token_hash !~ '^[a-f0-9]{64}$'
  then raise exception 'invalid_check_in' using errcode = '22023'; end if;
  select * into session_row from public.club_event_scanner_sessions where token_hash = p_session_token_hash for update;
  if not found or session_row.status <> 'active' or session_row.revoked_at is not null or session_row.expires_at <= changed_at
  then raise exception 'invalid_scanner_session' using errcode = '22023'; end if;
  select * into access_row from public.club_event_scanner_access where id = session_row.scanner_access_id for share;
  if not found or access_row.status <> 'active' or access_row.revoked_at is not null or access_row.expires_at <= changed_at
  then raise exception 'invalid_scanner_session' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.club_event_organizers organizer
    join public.club_staff_profiles staff on staff.id = organizer.staff_profile_id and staff.status = 'active'
    where organizer.id = access_row.event_organizer_id and organizer.event_id = session_row.event_id and organizer.scanner_enabled = true
  ) then raise exception 'invalid_scanner_session' using errcode = '22023'; end if;
  if not exists(select 1 from public.club_events where id = session_row.event_id and status = 'ongoing')
  then raise exception 'check_in_not_open' using errcode = '22023'; end if;

  select * into credential_row from public.club_event_participant_credentials where token_hash = p_qr_token_hash for update;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if credential_row.event_id <> session_row.event_id then return jsonb_build_object('status', 'wrong_workshop'); end if;
  if credential_row.status <> 'active' or credential_row.revoked_at is not null or credential_row.expires_at <= changed_at
  then return jsonb_build_object('status', 'expired'); end if;
  select * into invitation_row from public.club_event_invitations where id = credential_row.invitation_id and event_id = session_row.event_id for share;
  if not found or invitation_row.invitation_status <> 'registered' then return jsonb_build_object('status', 'invalid'); end if;
  select * into attendance_row from public.club_event_attendance
   where event_id = session_row.event_id and member_id = invitation_row.member_id for update;
  if not found then raise exception 'attendance_not_found' using errcode = 'P0002'; end if;
  participant_name := concat_ws(' ', invitation_row.participant_first_name, invitation_row.participant_last_name);
  if attendance_row.attendance_status = 'present' then
    return jsonb_build_object('status', 'already_checked_in', 'participant_name', participant_name, 'checked_in_at', attendance_row.checked_in_at);
  end if;
  update public.club_event_attendance set attendance_status = 'present', checked_in_at = changed_at,
    checked_in_by_scanner_access_id = access_row.id, updated_at = changed_at where id = attendance_row.id;
  update public.club_event_participant_credentials set last_presented_at = changed_at, updated_at = changed_at where id = credential_row.id;
  update public.club_event_scanner_sessions set last_used_at = changed_at where id = session_row.id;
  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (null, 'club_event', session_row.event_id, 'participant_checked_in', 'standard',
    jsonb_build_object('invitation_id', invitation_row.id, 'scanner_access_id', access_row.id), changed_at);
  return jsonb_build_object('status', 'checked_in', 'participant_name', participant_name, 'checked_in_at', changed_at);
end;
$$;

create or replace function public.admin_transition_club_event(
  p_event_id uuid, p_admin_user_id uuid, p_next_status text, p_expected_updated_at timestamptz, p_now timestamptz
) returns timestamptz
language plpgsql security invoker set search_path = public as $$
declare administrator_role text; event_row public.club_events%rowtype; changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  select * into event_row from public.club_events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if event_row.updated_at <> p_expected_updated_at then raise exception 'event_conflict' using errcode = '40001'; end if;
  if not (
    (event_row.status = 'draft' and p_next_status in ('planned','cancelled')) or
    (event_row.status = 'planned' and p_next_status in ('registration_open','cancelled')) or
    (event_row.status = 'registration_open' and p_next_status in ('registration_closed','cancelled')) or
    (event_row.status = 'registration_closed' and p_next_status in ('ongoing','cancelled')) or
    (event_row.status = 'ongoing' and p_next_status in ('completed','cancelled')) or
    (event_row.status in ('completed','cancelled') and p_next_status = 'archived')
  ) then raise exception 'invalid_event_transition' using errcode = '22023'; end if;
  update public.club_events set status = p_next_status, updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = p_event_id;
  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id, 'workshop_status_changed', 'standard',
    jsonb_build_object('from', event_row.status, 'to', p_next_status), changed_at);
  return changed_at;
end;
$$;

create or replace function public.admin_finalize_club_event_attendance(
  p_event_id uuid, p_admin_user_id uuid, p_now timestamptz
) returns integer
language plpgsql security invoker set search_path = public as $$
declare administrator_role text; event_status text; changed_at timestamptz := coalesce(p_now, now()); finalized integer;
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  select status into event_status from public.club_events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if event_status <> 'completed' then raise exception 'attendance_not_finalizable' using errcode = '22023'; end if;
  update public.club_event_attendance set attendance_status = 'absent', updated_at = changed_at
   where event_id = p_event_id and attendance_status = 'expected';
  get diagnostics finalized = row_count;
  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id, 'attendance_finalized', 'standard', jsonb_build_object('absent_count', finalized), changed_at);
  return finalized;
end;
$$;

-- Basic-information edits may no longer change lifecycle state. Transitions
-- are exclusively controlled by admin_transition_club_event above.
create or replace function public.admin_update_club_event(
  p_event_id uuid, p_admin_user_id uuid, p_expected_updated_at timestamptz, p_payload jsonb, p_now timestamptz
) returns timestamptz
language plpgsql security invoker set search_path = public as $$
declare
  administrator_role text; event_row public.club_events%rowtype;
  starts_at_value timestamptz; ends_at_value timestamptz; changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  select * into event_row from public.club_events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if event_row.updated_at <> p_expected_updated_at then raise exception 'event_conflict' using errcode = '40001'; end if;
  if p_payload->>'eventType' is distinct from event_row.event_type or p_payload->>'status' is distinct from event_row.status
  then raise exception 'invalid_event_transition' using errcode = '22023'; end if;
  if event_row.event_type = 'workshop' and nullif(btrim(coalesce(p_payload->>'speakerName','')), '') is null
  then raise exception 'workshop_speaker_required' using errcode = '22023'; end if;
  starts_at_value := (p_payload->>'startsAt')::timestamptz;
  ends_at_value := nullif(btrim(coalesce(p_payload->>'endsAt','')), '');
  if starts_at_value is null or (ends_at_value is not null and ends_at_value <= starts_at_value)
  then raise exception 'invalid_event_window' using errcode = '22023'; end if;
  update public.club_events set title = btrim(p_payload->>'title'),
    description = nullif(btrim(coalesce(p_payload->>'description','')), ''), starts_at = starts_at_value,
    ends_at = ends_at_value, location = btrim(p_payload->>'location'),
    speaker_name = nullif(btrim(coalesce(p_payload->>'speakerName','')), ''),
    updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = p_event_id;
  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id, 'event_updated', 'standard', jsonb_build_object('status', event_row.status), changed_at);
  return changed_at;
end;
$$;

alter table public.club_event_participant_credentials enable row level security;
alter table public.club_event_scanner_sessions enable row level security;
revoke all on table public.club_event_participant_credentials, public.club_event_scanner_sessions from anon, authenticated;
grant select, insert, update, delete on table public.club_event_participant_credentials, public.club_event_scanner_sessions to service_role;

revoke all on function public.admin_prepare_event_invitation_delivery(uuid,uuid,uuid,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_finish_event_invitation_delivery(uuid,uuid,uuid,boolean,text,boolean,timestamptz) from public, anon, authenticated;
revoke all on function public.public_open_event_invitation(text,timestamptz) from public, anon, authenticated;
revoke all on function public.public_register_event_participant(text,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_generate_event_scanner_access(uuid,uuid,uuid,text,timestamptz,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_revoke_event_scanner_access(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.public_exchange_event_scanner_token(text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.public_event_scanner_context(text,timestamptz) from public, anon, authenticated;
revoke all on function public.public_check_in_event_participant(text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_transition_club_event(uuid,uuid,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_finalize_club_event_attendance(uuid,uuid,timestamptz) from public, anon, authenticated;

grant execute on function public.admin_prepare_event_invitation_delivery(uuid,uuid,uuid,text,timestamptz,timestamptz) to service_role;
grant execute on function public.admin_finish_event_invitation_delivery(uuid,uuid,uuid,boolean,text,boolean,timestamptz) to service_role;
grant execute on function public.public_open_event_invitation(text,timestamptz) to service_role;
grant execute on function public.public_register_event_participant(text,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.admin_generate_event_scanner_access(uuid,uuid,uuid,text,timestamptz,timestamptz,timestamptz) to service_role;
grant execute on function public.admin_revoke_event_scanner_access(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.public_exchange_event_scanner_token(text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.public_event_scanner_context(text,timestamptz) to service_role;
grant execute on function public.public_check_in_event_participant(text,text,timestamptz) to service_role;
grant execute on function public.admin_transition_club_event(uuid,uuid,text,timestamptz,timestamptz) to service_role;
grant execute on function public.admin_finalize_club_event_attendance(uuid,uuid,timestamptz) to service_role;

comment on table public.club_event_participant_credentials is 'One opaque, hashed QR check-in credential per registered event invitation.';
comment on table public.club_event_scanner_sessions is 'Short-lived capability sessions exchanged from private organizer scanner links.';

commit;
