-- Workshop registration architecture change:
--   * participants are membership_applications rows (join_type = 'member'), not
--     club_members; invitations are issued per application;
--   * registration captures ONLY the university speciality; identity always
--     comes from the application behind the private invitation;
--   * attendance lives on club_event_registrations (checked_in_at / absent_at);
--   * ONE shared event-scoped scanner link replaces per-organizer scanner
--     access; check-ins are attributed to the scanner access row itself.
-- Forward-only correction for environments that already applied the earlier
-- workshop migrations. It renames invitation token columns, backfills
-- membership_application_id from club_members.source_application_id, removes
-- invitations whose member cannot be mapped to a member application (legacy
-- test data), rebuilds the scanner persistence and rewrites the public RPCs.
-- No production club data is modified beyond that derived backfill.

begin;

drop view if exists public.admin_club_events_directory;

-- 1. Replaced public/admin functions -------------------------------------------------

drop function if exists public.admin_invite_club_event_members(uuid,uuid,uuid[],text,text,timestamptz);
drop function if exists public.admin_assign_club_event_organizers(uuid,uuid,uuid[],timestamptz);
drop function if exists public.admin_remove_club_event_organizer(uuid,uuid,uuid,timestamptz);
drop function if exists public.admin_set_club_event_scanner_access(uuid,uuid,boolean,uuid,timestamptz);
drop function if exists public.admin_generate_event_scanner_access(uuid,uuid,uuid,text,timestamptz,timestamptz,timestamptz);
drop function if exists public.admin_revoke_event_scanner_access(uuid,uuid,uuid,timestamptz);
drop function if exists public.admin_prepare_event_invitation_delivery(uuid,uuid,uuid,text,timestamptz,timestamptz);
drop function if exists public.admin_finish_event_invitation_delivery(uuid,uuid,uuid,boolean,text,boolean,timestamptz);
drop function if exists public.admin_set_event_invitation_link(uuid,uuid,uuid,text,text,integer,integer,timestamptz,timestamptz);
drop function if exists public.public_open_event_invitation(text,timestamptz);
drop function if exists public.public_register_event_participant(text,text,text,integer,integer,timestamptz,timestamptz);
drop function if exists public.public_register_event_participant(text,text,text,text,text,integer,integer,timestamptz,timestamptz);
drop function if exists public.public_register_event_participant(text,text,text,text,text,integer,integer,timestamptz,timestamptz,timestamptz);
drop function if exists public.public_exchange_event_scanner_token(text,text,timestamptz,timestamptz);
drop function if exists public.public_event_scanner_context(text,timestamptz);
drop function if exists public.public_check_in_event_participant(text,text,timestamptz);
drop function if exists public.admin_finalize_club_event_attendance(uuid,uuid,timestamptz);

-- 2. Removed organizer / attendance / credential persistence -------------------------

drop table if exists public.club_event_scanner_sessions;
drop table if exists public.club_event_participant_credentials;
drop table if exists public.club_event_attendance;
drop table if exists public.club_event_scanner_access;
drop table if exists public.club_event_organizers;

-- 3. Invitations target membership applications --------------------------------------

alter table public.club_event_invitations
  add column if not exists membership_application_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'club_event_invitations'
       and column_name = 'token_hash'
  ) then
    alter table public.club_event_invitations rename column token_hash to invite_token_hash;
    alter table public.club_event_invitations rename column token_expires_at to invite_expires_at;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'club_event_invitations'
       and column_name = 'invitation_status'
  ) then
    alter table public.club_event_invitations rename column invitation_status to status;
  end if;
end $$;

-- The in-application email provider and the stored participant names are gone:
-- identity is read from the membership application at request time.
alter table public.club_event_invitations
  drop column if exists sent_at,
  drop column if exists opened_at,
  drop column if exists email_delivery_status,
  drop column if exists email_provider_message_id,
  drop column if exists participant_first_name,
  drop column if exists participant_last_name;

alter table public.club_event_invitations
  drop constraint if exists club_event_invitation_registered_at_check;

update public.club_event_invitations invitation
   set membership_application_id = member.source_application_id
  from public.club_members member
 where invitation.member_id = member.id
   and member.source_application_id is not null
   and invitation.membership_application_id is null;

-- Legacy invitations that cannot be tied to a member application keep no
-- meaning in the new architecture and are removed with their member_id column.
delete from public.club_event_invitations invitation
 where invitation.membership_application_id is null
    or not exists (
      select 1 from public.membership_applications application
       where application.id = invitation.membership_application_id
         and application.join_type = 'member'
    );

alter table public.club_event_invitations
  drop constraint if exists club_event_invitation_unique,
  drop column if exists member_id;

alter table public.club_event_invitations
  add constraint club_event_invitation_application_fk
    foreign key (membership_application_id)
    references public.membership_applications (id) on delete cascade,
  alter column membership_application_id set not null,
  add constraint club_event_invitation_application_unique unique (event_id, membership_application_id);

-- The renamed status column keeps the domain check from the original events
-- migration; rewrite it explicitly so the constraint name matches the column.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.club_event_invitations'::regclass
       and conname = 'club_event_invitation_status_check'
  ) then
    alter table public.club_event_invitations drop constraint club_event_invitation_status_check;
  end if;
end $$;
alter table public.club_event_invitations
  add constraint club_event_invitation_status_check
    check (status in ('invited','registered','declined','cancelled'));

create index if not exists club_event_invitation_application_idx
  on public.club_event_invitations (membership_application_id);
drop index if exists public.club_event_invitation_token_hash_unique;
create unique index if not exists club_event_invitation_invite_token_hash_unique
  on public.club_event_invitations (invite_token_hash) where invite_token_hash is not null;

-- 4. Shared event-scoped scanner link and short-lived sessions -----------------------

create table public.club_event_scanner_access (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_events (id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  credential_version integer not null default 1,
  credential_derivation_version integer not null default 1,
  created_by_admin_user_id uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint club_event_scanner_token_check check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint club_event_scanner_status_check check (status in ('active','revoked','expired')),
  constraint club_event_scanner_active_state_check check (
    (status = 'active' and revoked_at is null) or status <> 'active'
  ),
  constraint club_event_scanner_window_check check (expires_at > starts_at),
  constraint club_event_scanner_versions_check check (credential_version >= 1 and credential_derivation_version = 1),
  -- Anchors the composite foreign keys so a grant can never be referenced by a
  -- registration or session of another event.
  constraint club_event_scanner_id_event_unique unique (id, event_id),
  -- Exactly one shared scanner credential per workshop; regeneration updates
  -- this single row in place.
  constraint club_event_scanner_event_unique unique (event_id)
);

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
  constraint club_event_scanner_session_active_check check (
    (status = 'active' and revoked_at is null) or status <> 'active'
  ),
  constraint club_event_scanner_session_window_check check (expires_at > created_at),
  constraint club_event_scanner_session_access_fk foreign key (scanner_access_id, event_id)
    references public.club_event_scanner_access (id, event_id) on delete cascade
);

create index club_event_scanner_sessions_access_idx
  on public.club_event_scanner_sessions (scanner_access_id, status, expires_at);
create unique index club_event_scanner_session_active_unique
  on public.club_event_scanner_sessions (scanner_access_id) where status = 'active';

-- 5. Registrations carry the invitation outcome, badge credential and attendance ----

create table public.club_event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_events (id) on delete cascade,
  invitation_id uuid not null unique references public.club_event_invitations (id) on delete cascade,
  membership_application_id uuid not null references public.membership_applications (id) on delete cascade,
  university_speciality text not null,
  qr_token_hash text not null unique,
  status text not null default 'registered',
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,
  checked_in_by_scanner_access_id uuid,
  absent_at timestamptz,
  credential_version integer not null default 1,
  credential_derivation_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint club_event_registration_speciality_check
    check (university_speciality = btrim(university_speciality) and char_length(university_speciality) between 2 and 160),
  constraint club_event_registration_qr_hash_check check (qr_token_hash ~ '^[a-f0-9]{64}$'),
  constraint club_event_registration_status_check check (status in ('registered','checked_in','cancelled')),
  constraint club_event_registration_check_in_state_check check ((status = 'checked_in') = (checked_in_at is not null)),
  constraint club_event_registration_absent_state_check check (absent_at is null or status = 'registered'),
  constraint club_event_registration_versions_check check (credential_version >= 1 and credential_derivation_version = 1),
  -- One registration per participant and event: the invitation unique index
  -- plus this pair both guard against duplicate check-in identities.
  constraint club_event_registration_unique unique (event_id, membership_application_id),
  constraint club_event_registration_scanner_event_fk foreign key (checked_in_by_scanner_access_id, event_id)
    references public.club_event_scanner_access (id, event_id) on delete set null (checked_in_by_scanner_access_id)
);

create index club_event_registrations_event_idx
  on public.club_event_registrations (event_id, status);
create index club_event_registrations_application_idx
  on public.club_event_registrations (membership_application_id);

-- 6. Directory read model ------------------------------------------------------------

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
    where invitation.event_id = event.id and invitation.status <> 'cancelled') as invited_count,
  (select count(*)::integer from public.club_event_registrations registration
    where registration.event_id = event.id and registration.status <> 'cancelled') as registered_count,
  (select count(*)::integer from public.club_event_registrations registration
    where registration.event_id = event.id and registration.status = 'checked_in') as present_count,
  (select count(*)::integer from public.club_event_registrations registration
    where registration.event_id = event.id and registration.status = 'registered'
      and registration.checked_in_at is null and registration.absent_at is null) as not_checked_in_count,
  (select count(*)::integer from public.club_event_registrations registration
    where registration.event_id = event.id and registration.absent_at is not null) as absent_count,
  (select count(*)::integer from public.club_event_registrations registration
    where registration.event_id = event.id and registration.status <> 'cancelled') as attendance_count,
  event.created_by_admin_user_id,
  event.updated_by_admin_user_id,
  event.created_at,
  event.updated_at
from public.club_events event;

-- 7. Inviting member applicants -------------------------------------------------------

create or replace function public.admin_invite_club_event_applicants(
  p_event_id uuid,
  p_admin_user_id uuid,
  p_application_ids uuid[] default null,
  p_scope text default null,
  p_now timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  administrator_role text;
  event_row public.club_events%rowtype;
  application_ids_clean uuid[];
  requested_count integer := 0;
  added_count integer := 0;
  changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if p_application_ids is not null and p_scope is not null
    then raise exception 'invalid_invitation_scope' using errcode = '22023'; end if;
  if p_application_ids is null and coalesce(p_scope, '') <> 'all_member_applicants'
    then raise exception 'invalid_invitation_scope' using errcode = '22023'; end if;

  select * into event_row from public.club_events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if event_row.event_type <> 'workshop' or event_row.status in ('cancelled','archived')
    then raise exception 'event_not_available' using errcode = '22023'; end if;

  if p_application_ids is not null then
    if coalesce(array_length(p_application_ids, 1), 0) < 1
      or coalesce(array_length(p_application_ids, 1), 0) > 500
      or (select count(distinct selected.application_id)
            from unnest(p_application_ids) as selected(application_id))
         <> coalesce(array_length(p_application_ids, 1), 0)
    then raise exception 'invalid_invitation_applicants' using errcode = '22023'; end if;
    -- Eligibility is exactly join_type = 'member': every review status of a
    -- member application is invited; staff applications are never accepted.
    if (select count(*) from public.membership_applications
         where id = any(p_application_ids) and join_type = 'member')
       <> coalesce(array_length(p_application_ids, 1), 0)
    then raise exception 'unknown_application' using errcode = '22023'; end if;
    select coalesce(array_agg(id order by id), '{}') into application_ids_clean
      from public.membership_applications
     where id = any(p_application_ids) and join_type = 'member';
    requested_count := coalesce(array_length(application_ids_clean, 1), 0);
  else
    select count(*) into requested_count from public.membership_applications where join_type = 'member';
  end if;

  with target as (
    select application.id
    from public.membership_applications application
    where application.join_type = 'member'
      and (
        (application_ids_clean is not null and application.id = any(application_ids_clean))
        or p_scope = 'all_member_applicants'
      )
  ), inserted as (
    insert into public.club_event_invitations
      (event_id, membership_application_id, status, invited_at, invited_by_admin_user_id, created_at)
    select p_event_id, target.id, 'invited', changed_at, p_admin_user_id, changed_at
    from target
    on conflict (event_id, membership_application_id) do nothing
    returning membership_application_id
  )
  select count(*) into added_count from inserted;

  update public.club_events
     set updated_at = changed_at, updated_by_admin_user_id = p_admin_user_id
   where id = event_row.id;

  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id, 'workshop_applicants_invited', 'standard',
    jsonb_build_object(
      'requested', requested_count,
      'added', added_count,
      'scope', coalesce(p_scope, 'applications')
    ), changed_at);
  return jsonb_build_object('requested', requested_count, 'added', added_count);
end;
$$;

-- 8. Stable private invitation links --------------------------------------------------

create or replace function public.admin_set_event_invitation_link(
  p_event_id uuid, p_invitation_id uuid, p_admin_user_id uuid,
  p_action text, p_token_hash text, p_credential_version integer,
  p_derivation_version integer, p_expires_at timestamptz, p_now timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  administrator_role text;
  invitation_row public.club_event_invitations%rowtype;
  event_row public.club_events%rowtype;
  changed_at timestamptz := coalesce(p_now, now());
  expected_version integer;
begin
  select role into administrator_role from public.admin_users
   where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;
  if p_action not in ('ensure','regenerate')
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_credential_version < 1 or p_derivation_version <> 1
    or p_expires_at <= changed_at
  then raise exception 'invalid_invitation_credential' using errcode = '22023'; end if;

  select * into invitation_row from public.club_event_invitations
   where id = p_invitation_id and event_id = p_event_id for update;
  if not found then raise exception 'invitation_not_found' using errcode = 'P0002'; end if;
  if invitation_row.status in ('cancelled','declined') then
    raise exception 'invitation_not_active' using errcode = '22023';
  end if;
  select * into event_row from public.club_events where id = p_event_id;
  if not found or event_row.event_type <> 'workshop' or event_row.status in ('cancelled','archived') then
    raise exception 'event_not_available' using errcode = '22023';
  end if;

  if p_action = 'ensure'
    and invitation_row.invite_token_hash is not null
    and invitation_row.credential_derivation_version = 1
  then
    return jsonb_build_object(
      'invitation_id', invitation_row.id,
      'credential_version', invitation_row.credential_version,
      'derivation_version', invitation_row.credential_derivation_version,
      'token_hash', invitation_row.invite_token_hash,
      'expires_at', invitation_row.invite_expires_at,
      'revoked_at', invitation_row.link_revoked_at
    );
  end if;

  expected_version := case
    when p_action = 'regenerate' then coalesce(invitation_row.credential_version, 0) + 1
    else 1
  end;
  if p_credential_version <> expected_version then
    raise exception 'invitation_credential_conflict' using errcode = '40001';
  end if;

  update public.club_event_invitations set
    invite_token_hash = p_token_hash,
    invite_expires_at = p_expires_at,
    credential_version = p_credential_version,
    credential_derivation_version = p_derivation_version,
    link_revoked_at = null
  where id = invitation_row.id;

  if p_action = 'regenerate' then
    insert into public.admin_audit_events
      (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
    values (
      p_admin_user_id, 'club_event', p_event_id,
      'workshop_invitation_link_regenerated', 'sensitive',
      jsonb_build_object('invitation_id', p_invitation_id, 'credential_version', p_credential_version),
      changed_at
    );
  end if;

  return jsonb_build_object(
    'invitation_id', invitation_row.id,
    'credential_version', p_credential_version,
    'derivation_version', p_derivation_version,
    'token_hash', p_token_hash,
    'expires_at', p_expires_at,
    'revoked_at', null
  );
end;
$$;

-- 9. Public registration flow ---------------------------------------------------------

create or replace function public.public_open_event_invitation(p_token_hash text, p_now timestamptz)
returns table (
  invitation_id uuid, invitation_status text, full_name text,
  event_id uuid, event_title text, starts_at timestamptz, ends_at timestamptz,
  location text, speaker_name text,
  registration_status text, university_speciality text,
  qr_credential_version integer, qr_derivation_version integer
)
language plpgsql security invoker set search_path = public as $$
declare changed_at timestamptz := coalesce(p_now, now());
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then return; end if;
  return query
    select invitation.id, invitation.status, application.full_name,
      event.id, event.title, event.starts_at, event.ends_at, event.location, event.speaker_name,
      registration.status, registration.university_speciality,
      registration.credential_version, registration.credential_derivation_version
    from public.club_event_invitations invitation
    join public.club_events event on event.id = invitation.event_id
    join public.membership_applications application on application.id = invitation.membership_application_id
    left join public.club_event_registrations registration on registration.invitation_id = invitation.id
    where invitation.invite_token_hash = p_token_hash
      and invitation.invite_expires_at > changed_at
      and invitation.link_revoked_at is null
      and invitation.status in ('invited','registered')
      and event.event_type = 'workshop'
      and event.status in ('registration_open','registration_closed','ongoing','completed');
end;
$$;

-- The participant name never comes from the form: it is resolved from the
-- membership application behind the private invitation. The form inputs only
-- the university speciality, which is stored on the registration alone and
-- never writes back to the application.
create or replace function public.public_register_event_participant(
  p_invitation_token_hash text, p_university_speciality text,
  p_qr_token_hash text, p_qr_credential_version integer, p_qr_derivation_version integer,
  p_qr_expires_at timestamptz, p_now timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  invitation_row public.club_event_invitations%rowtype;
  event_row public.club_events%rowtype;
  application_row public.membership_applications%rowtype;
  registration_row public.club_event_registrations%rowtype;
  changed_at timestamptz := coalesce(p_now, now());
  already_registered boolean;
  speciality text;
begin
  speciality := btrim(coalesce(p_university_speciality, ''));
  if p_invitation_token_hash !~ '^[a-f0-9]{64}$' or p_qr_token_hash !~ '^[a-f0-9]{64}$'
    or p_qr_credential_version < 1 or p_qr_derivation_version <> 1
    or p_qr_expires_at <= changed_at
    or char_length(speciality) not between 2 and 160
  then raise exception 'invalid_registration' using errcode = '22023'; end if;

  select * into invitation_row from public.club_event_invitations
   where invite_token_hash = p_invitation_token_hash for update;
  if not found or invitation_row.invite_expires_at <= changed_at
    or invitation_row.link_revoked_at is not null
    or invitation_row.status in ('declined','cancelled')
  then raise exception 'invalid_invitation' using errcode = '22023'; end if;

  select * into event_row from public.club_events where id = invitation_row.event_id for share;
  select * into registration_row from public.club_event_registrations
   where invitation_id = invitation_row.id for update;
  already_registered := registration_row.id is not null;
  if event_row.event_type <> 'workshop'
    or (not already_registered and event_row.status <> 'registration_open')
    or (already_registered and event_row.status not in ('registration_open','registration_closed','ongoing','completed'))
  then raise exception 'registration_not_open' using errcode = '22023'; end if;

  select * into application_row from public.membership_applications
   where id = invitation_row.membership_application_id;
  if not found then raise exception 'invalid_invitation' using errcode = '22023'; end if;

  if already_registered then
    -- Revisiting an already registered invitation returns the same opaque QR
    -- credential; only the workshop speciality may be corrected.
    if registration_row.credential_version <> p_qr_credential_version
      or registration_row.credential_derivation_version <> p_qr_derivation_version
      or registration_row.qr_token_hash <> p_qr_token_hash
    then raise exception 'participant_credential_conflict' using errcode = '40001'; end if;
    update public.club_event_registrations set
      university_speciality = speciality, updated_at = changed_at
    where id = registration_row.id returning * into registration_row;
  else
    insert into public.club_event_registrations
      (event_id, invitation_id, membership_application_id, university_speciality,
       qr_token_hash, status, registered_at, checked_in_at, absent_at,
       credential_version, credential_derivation_version, created_at, updated_at)
    values
      (invitation_row.event_id, invitation_row.id, invitation_row.membership_application_id, speciality,
       p_qr_token_hash, 'registered', changed_at, null, null,
       p_qr_credential_version, p_qr_derivation_version, changed_at, changed_at)
    returning * into registration_row;
    update public.club_event_invitations set
      registered_at = coalesce(registered_at, changed_at)
    where id = invitation_row.id;
  end if;

  if not already_registered then
    insert into public.admin_audit_events
      (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
    values (
      null, 'club_event', invitation_row.event_id, 'participant_registered', 'standard',
      jsonb_build_object('invitation_id', invitation_row.id, 'registration_id', registration_row.id), changed_at
    );
  end if;
  return jsonb_build_object(
    'event_id', event_row.id, 'event_title', event_row.title, 'starts_at', event_row.starts_at,
    'ends_at', event_row.ends_at, 'location', event_row.location,
    'full_name', application_row.full_name, 'university_speciality', speciality,
    'already_registered', already_registered,
    'qr_credential_version', registration_row.credential_version,
    'qr_derivation_version', registration_row.credential_derivation_version,
    'qr_expires_at', p_qr_expires_at
  );
end;
$$;

-- 10. Shared scanner link persistence -------------------------------------------------

create or replace function public.admin_set_event_scanner_access(
  p_event_id uuid, p_admin_user_id uuid, p_action text,
  p_token_hash text, p_credential_version integer,
  p_starts_at timestamptz, p_expires_at timestamptz, p_now timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  administrator_role text;
  event_row public.club_events%rowtype;
  access_row public.club_event_scanner_access%rowtype;
  changed_at timestamptz := coalesce(p_now, now());
  existed boolean;
  expected_version integer;
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if p_action not in ('ensure','regenerate')
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_credential_version < 1
    or p_expires_at <= greatest(p_starts_at, changed_at)
  then raise exception 'invalid_scanner_credential' using errcode = '22023'; end if;

  select * into event_row from public.club_events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if event_row.event_type <> 'workshop' or event_row.status in ('cancelled','archived') then
    raise exception 'event_not_available' using errcode = '22023';
  end if;

  select * into access_row from public.club_event_scanner_access where event_id = p_event_id for update;
  existed := access_row.id is not null;
  expected_version := case when existed then coalesce(access_row.credential_version, 0) + 1 else 1 end;

  -- An active stable link survives a concurrent ensure unchanged: only its
  -- validity window may be widened, the token itself is never rotated here.
  if p_action = 'ensure' and access_row.id is not null
    and access_row.status = 'active' and access_row.revoked_at is null
    and access_row.expires_at > changed_at
    and access_row.credential_version = p_credential_version
    and access_row.token_hash = p_token_hash
  then
    update public.club_event_scanner_access set
      starts_at = least(p_starts_at, access_row.starts_at),
      expires_at = greatest(access_row.expires_at, p_expires_at),
      updated_at = changed_at
    where id = access_row.id returning * into access_row;
    return jsonb_build_object(
      'id', access_row.id, 'event_id', p_event_id, 'created', false, 'regenerated', false,
      'credential_version', access_row.credential_version,
      'derivation_version', access_row.credential_derivation_version,
      'token_hash', access_row.token_hash, 'status', access_row.status,
      'starts_at', access_row.starts_at, 'expires_at', access_row.expires_at,
      'revoked_at', access_row.revoked_at
    );
  end if;

  if p_credential_version <> expected_version then
    raise exception 'scanner_credential_conflict' using errcode = '40001';
  end if;

  -- Regeneration invalidates the previous link: live sessions are revoked so
  -- no scanner window outlives the credential it was derived from.
  update public.club_event_scanner_sessions set status = 'revoked', revoked_at = changed_at
   where event_id = p_event_id and status = 'active';

  if access_row.id is not null then
    update public.club_event_scanner_access set
      token_hash = p_token_hash, status = 'active', revoked_at = null,
      credential_version = p_credential_version, credential_derivation_version = 1,
      starts_at = p_starts_at, expires_at = p_expires_at, updated_at = changed_at
    where id = access_row.id returning * into access_row;
  else
    insert into public.club_event_scanner_access
      (event_id, token_hash, status, starts_at, expires_at,
       credential_version, credential_derivation_version,
       created_by_admin_user_id, created_at, updated_at)
    values
      (p_event_id, p_token_hash, 'active', p_starts_at, p_expires_at,
       p_credential_version, 1, p_admin_user_id, changed_at, changed_at)
    returning * into access_row;
  end if;

  insert into public.admin_audit_events
    (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (
    p_admin_user_id, 'club_event', p_event_id,
    case when existed then 'scanner_access_regenerated' else 'scanner_access_generated' end,
    'standard',
    jsonb_build_object('scanner_access_id', access_row.id, 'credential_version', p_credential_version),
    changed_at
  );

  return jsonb_build_object(
    'id', access_row.id, 'event_id', p_event_id, 'created', not existed, 'regenerated', existed,
    'credential_version', p_credential_version, 'derivation_version', 1,
    'token_hash', p_token_hash, 'status', access_row.status,
    'starts_at', access_row.starts_at, 'expires_at', access_row.expires_at, 'revoked_at', null
  );
end;
$$;

create or replace function public.admin_revoke_club_event_scanner_access(
  p_event_id uuid, p_admin_user_id uuid, p_now timestamptz
) returns boolean
language plpgsql security invoker set search_path = public as $$
declare administrator_role text; changed_at timestamptz := coalesce(p_now, now()); revoked_count integer;
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.club_events where id = p_event_id) then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  update public.club_event_scanner_sessions session set status = 'revoked', revoked_at = changed_at
   where session.event_id = p_event_id and session.status = 'active';
  update public.club_event_scanner_access set status = 'revoked', revoked_at = changed_at, updated_at = changed_at
   where event_id = p_event_id and status = 'active';
  get diagnostics revoked_count = row_count;
  if revoked_count > 0 then
    insert into public.admin_audit_events
      (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
    values (p_admin_user_id, 'club_event', p_event_id, 'scanner_access_revoked', 'standard',
      jsonb_build_object('event_id', p_event_id), changed_at);
  end if;
  return revoked_count > 0;
end;
$$;

-- 11. Public scanner flow -------------------------------------------------------------

create or replace function public.public_exchange_event_scanner_token(
  p_access_token_hash text, p_session_token_hash text, p_session_expires_at timestamptz, p_now timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  access_row public.club_event_scanner_access%rowtype;
  event_row public.club_events%rowtype;
  changed_at timestamptz := coalesce(p_now, now());
begin
  if p_access_token_hash !~ '^[a-f0-9]{64}$' or p_session_token_hash !~ '^[a-f0-9]{64}$'
    or p_session_expires_at <= changed_at or p_session_expires_at > changed_at + interval '12 hours'
  then raise exception 'invalid_scanner_access' using errcode = '22023'; end if;
  select * into access_row from public.club_event_scanner_access where token_hash = p_access_token_hash for update;
  if not found or access_row.status <> 'active' or access_row.revoked_at is not null
    or access_row.starts_at > changed_at or access_row.expires_at <= changed_at
  then raise exception 'invalid_scanner_access' using errcode = '22023'; end if;
  select event.* into event_row from public.club_events event where event.id = access_row.event_id;
  if event_row.status not in ('registration_open','registration_closed','ongoing')
    then raise exception 'scanner_not_available' using errcode = '22023'; end if;

  update public.club_event_scanner_sessions set status = 'revoked', revoked_at = changed_at
   where scanner_access_id = access_row.id and status = 'active';
  insert into public.club_event_scanner_sessions
    (event_id, scanner_access_id, token_hash, status, expires_at, created_at)
  values (access_row.event_id, access_row.id, p_session_token_hash, 'active',
          least(p_session_expires_at, access_row.expires_at), changed_at);
  update public.club_event_scanner_access set last_used_at = changed_at where id = access_row.id;
  return jsonb_build_object(
    'event_id', event_row.id, 'event_title', event_row.title,
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
    'event_id', event.id, 'event_title', event.title,
    'starts_at', event.starts_at, 'location', event.location,
    'event_status', event.status,
    'registered', (select count(*) from public.club_event_registrations r where r.event_id = event.id and r.status <> 'cancelled'),
    'present', (select count(*) from public.club_event_registrations r where r.event_id = event.id and r.status = 'checked_in')
  ) into result
  from public.club_event_scanner_sessions session
  join public.club_event_scanner_access access on access.id = session.scanner_access_id and access.event_id = session.event_id
  join public.club_events event on event.id = session.event_id
  where session.token_hash = p_session_token_hash and session.status = 'active' and session.revoked_at is null
    and session.expires_at > changed_at
    and access.status = 'active' and access.revoked_at is null and access.expires_at > changed_at
    and event.status in ('registration_open','registration_closed','ongoing');
  if result is null then raise exception 'invalid_scanner_session' using errcode = '22023'; end if;
  return result;
end;
$$;

-- Row locks serialize two simultaneous scans of the same badge. Exactly one
-- caller moves registered -> checked_in; later callers receive the original
-- authoritative check-in timestamp. Every rejected badge shares ONE generic
-- invalid state with no participant information.
create or replace function public.public_check_in_event_participant(
  p_session_token_hash text, p_qr_token_hash text, p_now timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  session_row public.club_event_scanner_sessions%rowtype;
  access_row public.club_event_scanner_access%rowtype;
  registration_row public.club_event_registrations%rowtype;
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
  if not exists (select 1 from public.club_events where id = session_row.event_id and status = 'ongoing')
  then raise exception 'check_in_not_open' using errcode = '22023'; end if;

  select * into registration_row from public.club_event_registrations where qr_token_hash = p_qr_token_hash for update;
  -- Unknown, cross-event and cancelled badges merge into one generic invalid
  -- response that reveals nothing about workshop participants.
  if not found or registration_row.event_id <> session_row.event_id or registration_row.status = 'cancelled'
  then return jsonb_build_object('status', 'invalid'); end if;
  if registration_row.status = 'checked_in' then
    return jsonb_build_object(
      'status', 'already_checked_in',
      'participant_name', (select full_name from public.membership_applications a
        where a.id = registration_row.membership_application_id),
      'university_speciality', registration_row.university_speciality,
      'checked_in_at', registration_row.checked_in_at
    );
  end if;
  update public.club_event_registrations set
    status = 'checked_in', checked_in_at = changed_at,
    checked_in_by_scanner_access_id = access_row.id, updated_at = changed_at
  where id = registration_row.id;
  update public.club_event_scanner_sessions set last_used_at = changed_at where id = session_row.id;
  update public.club_event_scanner_access set last_used_at = changed_at where id = access_row.id;
  insert into public.admin_audit_events
    (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (null, 'club_event', session_row.event_id, 'participant_checked_in', 'standard',
    jsonb_build_object('registration_id', registration_row.id, 'scanner_access_id', access_row.id), changed_at);
  return jsonb_build_object(
    'status', 'checked_in',
    'participant_name', (select full_name from public.membership_applications a
      where a.id = registration_row.membership_application_id),
    'university_speciality', registration_row.university_speciality,
    'checked_in_at', changed_at
  );
end;
$$;

-- 12. Lifecycle and attendance finalization -------------------------------------------

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
  -- Registrar-based finalize: participants who never scanned are marked absent
  -- explicitly; checked-in participants keep their authoritative check-in.
  update public.club_event_registrations set absent_at = changed_at, updated_at = changed_at
   where event_id = p_event_id and status = 'registered' and checked_in_at is null and absent_at is null;
  get diagnostics finalized = row_count;
  insert into public.admin_audit_events
    (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id, 'attendance_finalized', 'standard',
    jsonb_build_object('absent_count', finalized), changed_at);
  return finalized;
end;
$$;

-- 13. Hardening -----------------------------------------------------------------------

alter table public.club_event_invitations enable row level security;
alter table public.club_event_registrations enable row level security;
alter table public.club_event_scanner_access enable row level security;
alter table public.club_event_scanner_sessions enable row level security;

revoke all on table public.club_event_invitations, public.club_event_registrations,
  public.club_event_scanner_access, public.club_event_scanner_sessions, public.admin_club_events_directory
  from anon, authenticated;
grant select, insert, update, delete on table public.club_event_invitations to service_role;
grant select, insert, update, delete on table public.club_event_registrations,
  public.club_event_scanner_access, public.club_event_scanner_sessions to service_role;
grant select on table public.admin_club_events_directory to service_role;

revoke all on function public.admin_invite_club_event_applicants(uuid,uuid,uuid[],text,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_invite_club_event_applicants(uuid,uuid,uuid[],text,timestamptz) to service_role;
revoke all on function public.admin_set_event_invitation_link(uuid,uuid,uuid,text,text,integer,integer,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_set_event_invitation_link(uuid,uuid,uuid,text,text,integer,integer,timestamptz,timestamptz) to service_role;
revoke all on function public.public_open_event_invitation(text,timestamptz) from public, anon, authenticated;
grant execute on function public.public_open_event_invitation(text,timestamptz) to service_role;
revoke all on function public.public_register_event_participant(text,text,text,integer,integer,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.public_register_event_participant(text,text,text,integer,integer,timestamptz,timestamptz) to service_role;
revoke all on function public.admin_set_event_scanner_access(uuid,uuid,text,text,integer,timestamptz,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_set_event_scanner_access(uuid,uuid,text,text,integer,timestamptz,timestamptz,timestamptz) to service_role;
revoke all on function public.admin_revoke_club_event_scanner_access(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_revoke_club_event_scanner_access(uuid,uuid,timestamptz) to service_role;
revoke all on function public.public_exchange_event_scanner_token(text,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.public_exchange_event_scanner_token(text,text,timestamptz,timestamptz) to service_role;
revoke all on function public.public_event_scanner_context(text,timestamptz) from public, anon, authenticated;
grant execute on function public.public_event_scanner_context(text,timestamptz) to service_role;
revoke all on function public.public_check_in_event_participant(text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.public_check_in_event_participant(text,text,timestamptz) to service_role;
revoke all on function public.admin_finalize_club_event_attendance(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_finalize_club_event_attendance(uuid,uuid,timestamptz) to service_role;

comment on table public.club_event_invitations is
  'Per-application invitation state for a club event: one private hashed link per member application. Identity is never duplicated here.';
comment on table public.club_event_registrations is
  'Workshop registration, opaque hashed QR badge credential, check-in and explicit absence per participant. One row per participant and event.';
comment on table public.club_event_scanner_access is
  'Single shared, hashed scanner credential per event. Regeneration overwrites this row in place; raw tokens are never stored.';
comment on table public.club_event_scanner_sessions is
  'Short-lived capability sessions exchanged from the shared event scanner link.';
comment on column public.club_event_registrations.university_speciality is
  'University speciality typed by the participant at registration. Never written back to the membership application.';
comment on column public.club_event_scanner_access.event_id is
  'Unique per event: the workshop has exactly one shared scanner credential.';
comment on view public.admin_club_events_directory is
  'Server-only read model for the Events administration pages with invitation, registration and attendance aggregates.';

commit;
