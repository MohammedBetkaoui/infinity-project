-- Workshop invitation correction: n8n-ready stable private links and stable
-- participant passes. This migration is forward-only and intentionally keeps
-- the legacy email-delivery columns from the already-applied phase-2 schema;
-- application code no longer reads or writes them.

begin;

alter table public.club_event_invitations
  add column if not exists credential_version integer,
  add column if not exists credential_derivation_version integer,
  add column if not exists link_revoked_at timestamptz;

alter table public.club_event_invitations
  add constraint club_event_invitation_credential_version_check
    check (credential_version is null or credential_version >= 1),
  add constraint club_event_invitation_derivation_version_check
    check (credential_derivation_version is null or credential_derivation_version = 1);

alter table public.club_event_participant_credentials
  add column if not exists credential_version integer,
  add column if not exists credential_derivation_version integer;

alter table public.club_event_participant_credentials
  add constraint club_event_participant_credential_version_check
    check (credential_version is null or credential_version >= 1),
  add constraint club_event_participant_derivation_version_check
    check (credential_derivation_version is null or credential_derivation_version = 1);

-- These RPCs belonged to the removed in-application email provider. The
-- delivery columns remain as harmless legacy columns for forward compatibility.
drop function if exists public.admin_prepare_event_invitation_delivery(uuid,uuid,uuid,text,timestamptz,timestamptz);
drop function if exists public.admin_finish_event_invitation_delivery(uuid,uuid,uuid,boolean,text,boolean,timestamptz);

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
  if invitation_row.invitation_status in ('cancelled','declined') then
    raise exception 'invitation_not_active' using errcode = '22023';
  end if;
  select * into event_row from public.club_events where id = p_event_id;
  if not found or event_row.event_type <> 'workshop' or event_row.status in ('cancelled','archived') then
    raise exception 'event_not_available' using errcode = '22023';
  end if;

  if p_action = 'ensure'
    and invitation_row.token_hash is not null
    and invitation_row.credential_derivation_version = 1
  then
    return jsonb_build_object(
      'invitation_id', invitation_row.id,
      'credential_version', invitation_row.credential_version,
      'derivation_version', invitation_row.credential_derivation_version,
      'token_hash', invitation_row.token_hash,
      'expires_at', invitation_row.token_expires_at,
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
    token_hash = p_token_hash,
    token_expires_at = p_expires_at,
    credential_version = p_credential_version,
    credential_derivation_version = p_derivation_version,
    link_revoked_at = null,
    opened_at = null
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

create or replace function public.admin_record_workshop_invitation_export(
  p_event_id uuid, p_admin_user_id uuid, p_row_count integer, p_now timestamptz
) returns boolean
language plpgsql security invoker set search_path = public as $$
declare administrator_role text; changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users
   where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;
  if p_row_count < 0 or not exists (
    select 1 from public.club_events where id = p_event_id and event_type = 'workshop'
  ) then raise exception 'invalid_export' using errcode = '22023'; end if;
  insert into public.admin_audit_events
    (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (
    p_admin_user_id, 'club_event', p_event_id,
    'workshop_invitation_links_exported', 'sensitive',
    jsonb_build_object('row_count', p_row_count), changed_at
  );
  return true;
end;
$$;

drop function if exists public.public_open_event_invitation(text,timestamptz);

create function public.public_open_event_invitation(p_token_hash text, p_now timestamptz)
returns table (
  invitation_id uuid, invitation_status text, member_name text,
  event_id uuid, event_title text, starts_at timestamptz, ends_at timestamptz,
  location text, speaker_name text, registered_first_name text, registered_last_name text,
  qr_credential_version integer, qr_derivation_version integer
)
language plpgsql security invoker set search_path = public as $$
declare changed_at timestamptz := coalesce(p_now, now());
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then return; end if;
  update public.club_event_invitations invitation set opened_at = coalesce(invitation.opened_at, changed_at)
   where invitation.token_hash = p_token_hash
     and invitation.token_expires_at > changed_at
     and invitation.link_revoked_at is null
     and invitation.invitation_status in ('invited','registered');
  return query
    select invitation.id, invitation.invitation_status, member.full_name,
      event.id, event.title, event.starts_at, event.ends_at, event.location, event.speaker_name,
      invitation.participant_first_name, invitation.participant_last_name,
      credential.credential_version, credential.credential_derivation_version
    from public.club_event_invitations invitation
    join public.club_events event on event.id = invitation.event_id
    join public.club_members member on member.id = invitation.member_id
    left join public.club_event_participant_credentials credential on credential.invitation_id = invitation.id
    where invitation.token_hash = p_token_hash
      and invitation.token_expires_at > changed_at
      and invitation.link_revoked_at is null
      and invitation.invitation_status in ('invited','registered')
      and event.event_type = 'workshop'
      and event.status in ('registration_open','registration_closed','ongoing','completed');
end;
$$;

drop function if exists public.public_register_event_participant(text,text,text,text,timestamptz,timestamptz);

create function public.public_register_event_participant(
  p_invitation_token_hash text, p_first_name text, p_last_name text,
  p_qr_token_hash text, p_qr_credential_version integer, p_qr_derivation_version integer,
  p_qr_expires_at timestamptz, p_now timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  invitation_row public.club_event_invitations%rowtype;
  event_row public.club_events%rowtype;
  credential_row public.club_event_participant_credentials%rowtype;
  changed_at timestamptz := coalesce(p_now, now());
  already_registered boolean;
  effective_first_name text;
  effective_last_name text;
begin
  if p_invitation_token_hash !~ '^[a-f0-9]{64}$' or p_qr_token_hash !~ '^[a-f0-9]{64}$'
    or p_qr_credential_version < 1 or p_qr_derivation_version <> 1
    or p_qr_expires_at <= changed_at
    or char_length(btrim(coalesce(p_first_name,''))) not between 1 and 80
    or char_length(btrim(coalesce(p_last_name,''))) not between 1 and 80
  then raise exception 'invalid_registration' using errcode = '22023'; end if;

  select * into invitation_row from public.club_event_invitations
   where token_hash = p_invitation_token_hash for update;
  if not found or invitation_row.token_expires_at <= changed_at
    or invitation_row.link_revoked_at is not null
    or invitation_row.invitation_status in ('declined','cancelled')
  then raise exception 'invalid_invitation' using errcode = '22023'; end if;
  select * into event_row from public.club_events where id = invitation_row.event_id for share;
  already_registered := invitation_row.invitation_status = 'registered';
  if event_row.event_type <> 'workshop'
    or (not already_registered and event_row.status <> 'registration_open')
    or (already_registered and event_row.status not in ('registration_open','registration_closed','ongoing','completed'))
  then raise exception 'registration_not_open' using errcode = '22023'; end if;

  effective_first_name := case when already_registered then coalesce(invitation_row.participant_first_name, btrim(p_first_name)) else btrim(p_first_name) end;
  effective_last_name := case when already_registered then coalesce(invitation_row.participant_last_name, btrim(p_last_name)) else btrim(p_last_name) end;
  update public.club_event_invitations set
    invitation_status = 'registered', registered_at = coalesce(registered_at, changed_at),
    participant_first_name = effective_first_name, participant_last_name = effective_last_name
  where id = invitation_row.id;

  insert into public.club_event_attendance (event_id, member_id, attendance_status, created_at, updated_at)
  values (invitation_row.event_id, invitation_row.member_id, 'expected', changed_at, changed_at)
  on conflict (event_id, member_id) do nothing;

  select * into credential_row from public.club_event_participant_credentials
   where invitation_id = invitation_row.id for update;
  if not found then
    insert into public.club_event_participant_credentials
      (event_id, invitation_id, token_hash, credential_version, credential_derivation_version,
       status, issued_at, expires_at, created_at, updated_at)
    values (
      invitation_row.event_id, invitation_row.id, p_qr_token_hash,
      p_qr_credential_version, p_qr_derivation_version,
      'active', changed_at, p_qr_expires_at, changed_at, changed_at
    ) returning * into credential_row;
  elsif credential_row.credential_derivation_version is null then
    -- One-time conversion of a pre-correction random credential whose raw
    -- value was deliberately never persisted and therefore cannot be replayed.
    update public.club_event_participant_credentials set
      token_hash = p_qr_token_hash,
      credential_version = p_qr_credential_version,
      credential_derivation_version = p_qr_derivation_version,
      status = 'active', issued_at = changed_at, expires_at = p_qr_expires_at,
      revoked_at = null, updated_at = changed_at
    where id = credential_row.id returning * into credential_row;
  elsif credential_row.credential_version <> p_qr_credential_version
    or credential_row.credential_derivation_version <> p_qr_derivation_version
    or credential_row.token_hash <> p_qr_token_hash
  then raise exception 'participant_credential_conflict' using errcode = '40001';
  end if;

  if not already_registered then
    insert into public.admin_audit_events
      (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
    values (
      null, 'club_event', invitation_row.event_id, 'participant_registered', 'standard',
      jsonb_build_object('invitation_id', invitation_row.id), changed_at
    );
  end if;
  return jsonb_build_object(
    'event_id', event_row.id, 'event_title', event_row.title, 'starts_at', event_row.starts_at,
    'ends_at', event_row.ends_at, 'location', event_row.location,
    'first_name', effective_first_name, 'last_name', effective_last_name,
    'already_registered', already_registered,
    'qr_credential_version', credential_row.credential_version,
    'qr_derivation_version', credential_row.credential_derivation_version,
    'qr_expires_at', credential_row.expires_at
  );
end;
$$;

revoke all on function public.admin_set_event_invitation_link(uuid,uuid,uuid,text,text,integer,integer,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_record_workshop_invitation_export(uuid,uuid,integer,timestamptz) from public, anon, authenticated;
revoke all on function public.public_open_event_invitation(text,timestamptz) from public, anon, authenticated;
revoke all on function public.public_register_event_participant(text,text,text,text,integer,integer,timestamptz,timestamptz) from public, anon, authenticated;

grant execute on function public.admin_set_event_invitation_link(uuid,uuid,uuid,text,text,integer,integer,timestamptz,timestamptz) to service_role;
grant execute on function public.admin_record_workshop_invitation_export(uuid,uuid,integer,timestamptz) to service_role;
grant execute on function public.public_open_event_invitation(text,timestamptz) to service_role;
grant execute on function public.public_register_event_participant(text,text,text,text,integer,integer,timestamptz,timestamptz) to service_role;

comment on column public.club_event_invitations.credential_version is
  'Version used to deterministically derive a private invitation token server-side.';
comment on column public.club_event_participant_credentials.credential_version is
  'Version used to deterministically derive the opaque participant QR token server-side.';

commit;
