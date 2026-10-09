-- Fixes two defects in 20261017120000_stable_staff_confirmation_links.sql.
-- Forward-only: apply after 20261017120000_stable_staff_confirmation_links.sql.
--
-- 1. admin_record_staff_link_audit records every private-link CSV export with
--    object_type 'staff_link_export', which admin_audit_object_type_check
--    rejected (23514): each export created its links, then failed without
--    returning the CSV.
-- 2. admin_apply_stable_staff_confirmation_action returns a column named
--    expires_at. Two UPDATE statements read the table column of the same name
--    unqualified, which PL/pgSQL rejects as ambiguous (42702): regenerating a
--    link and converting a legacy credential always failed. The function body
--    is otherwise unchanged; only those two statements now qualify their
--    columns.

begin;

alter table public.admin_audit_events
  drop constraint if exists admin_audit_object_type_check;
alter table public.admin_audit_events
  add constraint admin_audit_object_type_check
  check (object_type in (
    'join_application', 'aivex_registration', 'aivex_document',
    'club_member', 'club_staff', 'aivex_settings', 'staff_link_export'
  ));

create or replace function public.admin_apply_stable_staff_confirmation_action(
  p_application_id uuid,
  p_admin_user_id uuid,
  p_action text,
  p_expected_application_updated_at timestamptz,
  p_expected_confirmation_updated_at timestamptz,
  p_proposed_confirmation_id uuid,
  p_link_nonce text,
  p_token_hash text,
  p_credential_version integer,
  p_derivation_version integer,
  p_expires_at timestamptz,
  p_message text,
  p_convert_legacy boolean,
  p_now timestamptz
)
returns table (
  confirmation_id uuid,
  confirmation_status text,
  confirmation_updated_at timestamptz,
  application_updated_at timestamptz,
  credential_id uuid,
  link_nonce text,
  credential_version integer,
  derivation_version integer,
  token_hash text,
  blocked_at timestamptz,
  expires_at timestamptz,
  credential_created boolean,
  previous_credential_version integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  application_row public.membership_applications%rowtype;
  confirmation_row public.membership_staff_confirmations%rowtype;
  credential_row public.membership_staff_confirmation_tokens%rowtype;
  administrator_role text;
  changed_at timestamptz := coalesce(p_now, now());
  clean_message text := nullif(btrim(coalesce(p_message, '')), '');
  has_confirmation boolean := false;
  needs_credential boolean := false;
  creates_confirmation boolean := false;
  has_legacy boolean := false;
  max_version integer := 0;
  next_status text;
  audit_action text;
  audit_metadata jsonb := '{}'::jsonb;
  latest_version integer;
  previous_version integer;
begin
  select role into administrator_role
    from public.admin_users
   where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;
  if p_action not in (
    'invite_staff_confirmation', 'ensure_staff_confirmation_link',
    'create_stable_staff_confirmation_link', 'regenerate_staff_confirmation_link',
    'block_staff_confirmation_link', 'unblock_staff_confirmation_link',
    'extend_staff_confirmation_deadline', 'request_staff_confirmation_revision',
    'confirm_staff_membership'
  ) then
    raise exception 'unsupported_staff_confirmation_action' using errcode = '22023';
  end if;

  select * into application_row
    from public.membership_applications
   where id = p_application_id
   for update;
  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;
  if application_row.join_type <> 'staff'
     or application_row.status not in ('new', 'in_review', 'interview') then
    raise exception 'invalid_staff_confirmation_application' using errcode = '22023';
  end if;
  if p_action <> 'ensure_staff_confirmation_link'
     and (p_expected_application_updated_at is null or application_row.updated_at <> p_expected_application_updated_at) then
    raise exception 'application_conflict' using errcode = '40001';
  end if;

  select * into confirmation_row
    from public.membership_staff_confirmations
   where application_id = p_application_id;
  has_confirmation := found;

  if not has_confirmation then
    if p_action not in ('invite_staff_confirmation', 'ensure_staff_confirmation_link') then
      raise exception 'staff_confirmation_not_found' using errcode = 'P0002';
    end if;
    if p_proposed_confirmation_id is null then
      raise exception 'invalid_staff_confirmation_invitation' using errcode = '22023';
    end if;
    creates_confirmation := true;
  else
    -- Application is already locked. Lock credentials before confirmation to
    -- match the candidate submission and application-close paths.
    perform token.id
      from public.membership_staff_confirmation_tokens token
     where token.confirmation_id = confirmation_row.id
       and token.revoked_at is null
     order by token.created_at desc
     for update;
    select * into confirmation_row
      from public.membership_staff_confirmations
     where application_id = p_application_id
     for update;
    if p_action not in ('ensure_staff_confirmation_link', 'create_stable_staff_confirmation_link')
       and (p_expected_confirmation_updated_at is null or confirmation_row.updated_at <> p_expected_confirmation_updated_at) then
      raise exception 'staff_confirmation_conflict' using errcode = '40001';
    end if;
  end if;

  if has_confirmation then
    select * into credential_row
      from public.membership_staff_confirmation_tokens token
     where token.confirmation_id = confirmation_row.id
       and token.revoked_at is null
     order by (token.link_nonce is not null) desc, token.created_at desc
     limit 1;
    select exists (
      select 1 from public.membership_staff_confirmation_tokens token
       where token.confirmation_id = confirmation_row.id
         and token.revoked_at is null
         and token.link_nonce is null
    ) into has_legacy;
    select coalesce(max(token.credential_version), 0) into max_version
      from public.membership_staff_confirmation_tokens token
     where token.confirmation_id = confirmation_row.id;
  end if;

  -- Ensure is deliberately a no-op when a reconstructable credential exists.
  -- Repeated exports therefore do not update timestamps or rotate links.
  if p_action = 'ensure_staff_confirmation_link'
     and credential_row.id is not null
     and credential_row.link_nonce is not null then
    return query select confirmation_row.id, confirmation_row.status, confirmation_row.updated_at,
      application_row.updated_at, credential_row.id, credential_row.link_nonce,
      credential_row.credential_version, credential_row.derivation_version,
      credential_row.token_hash, credential_row.blocked_at, confirmation_row.expires_at,
      false, null::integer;
    return;
  end if;

  if p_action = 'invite_staff_confirmation' and has_confirmation then
    raise exception 'staff_confirmation_already_exists' using errcode = '22023';
  end if;
  if p_action = 'create_stable_staff_confirmation_link'
     and (not has_confirmation or (credential_row.id is not null and credential_row.link_nonce is not null)) then
    raise exception 'stable_staff_confirmation_link_already_exists' using errcode = '22023';
  end if;
  if p_action in ('ensure_staff_confirmation_link', 'create_stable_staff_confirmation_link')
     and has_legacy and not coalesce(p_convert_legacy, false) then
    raise exception 'staff_confirmation_legacy_conversion_required' using errcode = '22023';
  end if;

  needs_credential := p_action in (
    'invite_staff_confirmation', 'ensure_staff_confirmation_link',
    'create_stable_staff_confirmation_link', 'regenerate_staff_confirmation_link'
  );
  if needs_credential then
    if p_link_nonce is null or p_link_nonce !~ '^[A-Za-z0-9_-]{22}$'
       or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
       or p_credential_version is null or p_credential_version <> max_version + 1
       or p_derivation_version <> 1
       or p_expires_at is null or p_expires_at <= changed_at
       or p_expires_at > changed_at + interval '90 days' then
      raise exception 'invalid_stable_staff_confirmation_credential' using errcode = '22023';
    end if;
  elsif p_action in ('extend_staff_confirmation_deadline', 'request_staff_confirmation_revision') then
    if p_expires_at is null or p_expires_at <= changed_at
       or p_expires_at > changed_at + interval '90 days' then
      raise exception 'invalid_staff_confirmation_deadline' using errcode = '22023';
    end if;
  end if;

  if creates_confirmation then
    insert into public.membership_staff_confirmations (
      id, application_id, status, invited_by_admin_user_id, invited_at,
      expires_at, created_at, updated_at
    ) values (
      p_proposed_confirmation_id, p_application_id, 'invited', p_admin_user_id, changed_at,
      p_expires_at, changed_at, changed_at
    ) returning * into confirmation_row;
    has_confirmation := true;
    next_status := 'invited';
  end if;

  if p_action in ('invite_staff_confirmation', 'ensure_staff_confirmation_link', 'create_stable_staff_confirmation_link') then
    if not creates_confirmation then
      next_status := case
        when confirmation_row.status in ('revoked', 'expired') then 'invited'
        else confirmation_row.status
      end;
      update public.membership_staff_confirmations confirmation
         set status = next_status,
             invited_by_admin_user_id = case when confirmation.status in ('revoked', 'expired') then p_admin_user_id else confirmation.invited_by_admin_user_id end,
             invited_at = case when confirmation.status in ('revoked', 'expired') then changed_at else confirmation.invited_at end,
             expires_at = case
               when confirmation.expires_at <= changed_at or confirmation.status in ('revoked', 'expired') then p_expires_at
               else confirmation.expires_at
             end,
             updated_at = changed_at
       where confirmation.id = confirmation_row.id
       returning * into confirmation_row;
    end if;
    audit_action := 'staff_fixed_link_created';

  elsif p_action = 'regenerate_staff_confirmation_link' then
    previous_version := credential_row.credential_version;
    next_status := case
      when confirmation_row.status in ('revoked', 'expired') then 'invited'
      else confirmation_row.status
    end;
    update public.membership_staff_confirmations confirmation
       set status = next_status,
           invited_by_admin_user_id = p_admin_user_id,
           invited_at = case when confirmation.status in ('revoked', 'expired') then changed_at else confirmation.invited_at end,
           expires_at = case when confirmation.expires_at <= changed_at or confirmation.status in ('revoked', 'expired') then p_expires_at else confirmation.expires_at end,
           updated_at = changed_at
     where confirmation.id = confirmation_row.id
     returning * into confirmation_row;
    audit_action := 'staff_link_regenerated';
    audit_metadata := jsonb_build_object(
      'previous_credential_version', previous_version,
      'new_credential_version', p_credential_version
    );

  elsif p_action = 'block_staff_confirmation_link' then
    if credential_row.id is null or credential_row.blocked_at is not null then
      raise exception 'invalid_staff_link_access_transition' using errcode = '22023';
    end if;
    update public.membership_staff_confirmation_tokens
       set blocked_at = changed_at,
           blocked_by_admin_user_id = p_admin_user_id,
           updated_at = changed_at
     where id = credential_row.id
     returning * into credential_row;
    update public.membership_staff_confirmations set updated_at = changed_at
     where id = confirmation_row.id returning * into confirmation_row;
    audit_action := 'staff_link_blocked';

  elsif p_action = 'unblock_staff_confirmation_link' then
    if credential_row.id is null or credential_row.blocked_at is null then
      raise exception 'invalid_staff_link_access_transition' using errcode = '22023';
    end if;
    update public.membership_staff_confirmation_tokens
       set blocked_at = null,
           blocked_by_admin_user_id = null,
           updated_at = changed_at
     where id = credential_row.id
     returning * into credential_row;
    update public.membership_staff_confirmations set updated_at = changed_at
     where id = confirmation_row.id returning * into confirmation_row;
    audit_action := 'staff_link_unblocked';

  elsif p_action = 'extend_staff_confirmation_deadline' then
    if confirmation_row.status not in ('invited', 'revision_requested', 'expired') or credential_row.id is null then
      raise exception 'invalid_staff_confirmation_transition' using errcode = '22023';
    end if;
    next_status := case
      when confirmation_row.status = 'expired' and confirmation_row.revision_message is not null then 'revision_requested'
      when confirmation_row.status = 'expired' then 'invited'
      else confirmation_row.status
    end;
    update public.membership_staff_confirmations
       set status = next_status, expires_at = p_expires_at, updated_at = changed_at
     where id = confirmation_row.id returning * into confirmation_row;
    update public.membership_staff_confirmation_tokens
       set expires_at = p_expires_at, updated_at = changed_at
     where id = credential_row.id returning * into credential_row;
    audit_action := 'staff_confirmation_deadline_extended';

  elsif p_action = 'request_staff_confirmation_revision' then
    if confirmation_row.status <> 'submitted'
       or clean_message is null or char_length(clean_message) > 1000
       or credential_row.id is null then
      raise exception 'invalid_staff_confirmation_revision' using errcode = '22023';
    end if;
    next_status := 'revision_requested';
    update public.membership_staff_confirmations
       set status = next_status,
           revision_message = clean_message,
           expires_at = p_expires_at,
           reviewed_by_admin_user_id = p_admin_user_id,
           reviewed_at = changed_at,
           updated_at = changed_at
     where id = confirmation_row.id returning * into confirmation_row;
    update public.membership_staff_confirmation_tokens
       set expires_at = p_expires_at, updated_at = changed_at
     where id = credential_row.id returning * into credential_row;
    audit_action := 'staff_confirmation_revision_requested';

  elsif p_action = 'confirm_staff_membership' then
    if confirmation_row.status <> 'submitted' then
      raise exception 'invalid_staff_confirmation_transition' using errcode = '22023';
    end if;
    select max(version) into latest_version
      from public.membership_staff_confirmation_submissions submission
     where submission.confirmation_id = confirmation_row.id;
    if latest_version is null then
      raise exception 'staff_confirmation_submission_required' using errcode = '22023';
    end if;
    next_status := 'confirmed';
    update public.membership_staff_confirmations
       set status = next_status,
           reviewed_by_admin_user_id = p_admin_user_id,
           reviewed_at = changed_at,
           confirmed_at = changed_at,
           updated_at = changed_at
     where id = confirmation_row.id returning * into confirmation_row;
    update public.membership_applications
       set status = 'accepted',
           accepted_as = 'staff',
           assigned_staff_department = staff_department,
           decision_reason = 'Staff confirmation approved',
           reviewed_by_admin_user_id = p_admin_user_id,
           reviewed_at = changed_at,
           updated_at = changed_at
     where id = p_application_id
     returning updated_at into application_updated_at;
    application_row.updated_at := application_updated_at;
    audit_action := 'staff_membership_confirmed';
    audit_metadata := jsonb_build_object('submission_version', latest_version);
  end if;

  if needs_credential then
    update public.membership_staff_confirmation_tokens token
       set revoked_at = changed_at, updated_at = changed_at
     where token.confirmation_id = confirmation_row.id
       and token.revoked_at is null;

    insert into public.membership_staff_confirmation_tokens (
      confirmation_id, token_hash, purpose, expires_at,
      created_by_admin_user_id, created_at, link_nonce,
      credential_version, derivation_version, blocked_at,
      blocked_by_admin_user_id, updated_at
    ) values (
      confirmation_row.id, p_token_hash,
      case when p_action = 'regenerate_staff_confirmation_link' then 'replacement' else 'initial' end,
      confirmation_row.expires_at, p_admin_user_id, changed_at, p_link_nonce,
      p_credential_version, p_derivation_version,
      case when p_action in ('ensure_staff_confirmation_link', 'create_stable_staff_confirmation_link') then credential_row.blocked_at end,
      case when p_action in ('ensure_staff_confirmation_link', 'create_stable_staff_confirmation_link') then credential_row.blocked_by_admin_user_id end,
      changed_at
    ) returning * into credential_row;
  end if;

  if p_action <> 'confirm_staff_membership' then
    update public.membership_applications
       set reviewed_by_admin_user_id = p_admin_user_id,
           reviewed_at = changed_at,
           updated_at = changed_at
     where id = p_application_id
     returning updated_at into application_updated_at;
  end if;

  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id, 'join_application', p_application_id, audit_action, 'standard',
    jsonb_strip_nulls(jsonb_build_object(
      'confirmation_id', confirmation_row.id,
      'confirmation_status', confirmation_row.status,
      'credential_version', case when needs_credential then credential_row.credential_version end,
      'expires_at', confirmation_row.expires_at
    ) || audit_metadata),
    changed_at
  );

  return query select confirmation_row.id, confirmation_row.status, confirmation_row.updated_at,
    application_updated_at, credential_row.id, credential_row.link_nonce,
    credential_row.credential_version, credential_row.derivation_version,
    credential_row.token_hash, credential_row.blocked_at, confirmation_row.expires_at,
    needs_credential, previous_version;
end;
$$;

revoke all on function public.admin_apply_stable_staff_confirmation_action(
  uuid, uuid, text, timestamptz, timestamptz, uuid, text, text, integer, integer,
  timestamptz, text, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_apply_stable_staff_confirmation_action(
  uuid, uuid, text, timestamptz, timestamptz, uuid, text, text, integer, integer,
  timestamptz, text, boolean, timestamptz
) to service_role;

commit;
