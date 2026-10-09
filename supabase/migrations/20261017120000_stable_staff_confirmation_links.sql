-- Stable, server-reconstructable Staff confirmation credentials.
-- Forward-only: apply after 20261016120000_staff_confirmation_workflow.sql.

begin;

alter table public.membership_staff_confirmation_tokens
  add column link_nonce text,
  add column credential_version integer not null default 1,
  add column derivation_version integer not null default 1,
  add column blocked_at timestamptz,
  add column blocked_by_admin_user_id uuid
    references public.admin_users (id) on delete set null,
  add column first_used_at timestamptz,
  add column last_used_at timestamptz,
  add column updated_at timestamptz not null default now();

alter table public.membership_staff_confirmation_tokens
  add constraint membership_staff_confirmation_tokens_nonce_check
    check (link_nonce is null or link_nonce ~ '^[A-Za-z0-9_-]{22}$'),
  add constraint membership_staff_confirmation_tokens_credential_version_check
    check (credential_version >= 1),
  add constraint membership_staff_confirmation_tokens_derivation_version_check
    check (derivation_version = 1),
  add constraint membership_staff_confirmation_tokens_blocked_check
    check ((blocked_at is null) = (blocked_by_admin_user_id is null)),
  add constraint membership_staff_confirmation_tokens_usage_check
    check (
      (first_used_at is null or first_used_at >= created_at)
      and (last_used_at is null or last_used_at >= created_at)
      and (first_used_at is null or last_used_at is null or last_used_at >= first_used_at)
    );

create unique index membership_staff_confirmation_tokens_one_stable_current_idx
  on public.membership_staff_confirmation_tokens (confirmation_id)
  where link_nonce is not null and revoked_at is null;

create index membership_staff_confirmation_tokens_access_idx
  on public.membership_staff_confirmation_tokens (confirmation_id, blocked_at, created_at desc)
  where revoked_at is null;

create or replace function public.membership_staff_confirmation_token_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger membership_staff_confirmation_tokens_touch_updated_at
  before update on public.membership_staff_confirmation_tokens
  for each row execute function public.membership_staff_confirmation_token_touch_updated_at();

-- Tokens remain hash-looked-up bearer credentials. Stable credentials are no
-- longer consumed: the confirmation status provides idempotency while the
-- token and confirmation locks serialize concurrent submissions.
create or replace function public.staff_submit_confirmation(
  p_token_hash text,
  p_motivation text,
  p_now timestamptz
)
returns table (
  application_id uuid,
  application_reference text,
  confirmation_id uuid,
  submission_id uuid,
  submission_version integer,
  submitted_at timestamptz,
  already_submitted boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  token_identity record;
  token_row public.membership_staff_confirmation_tokens%rowtype;
  confirmation_row public.membership_staff_confirmations%rowtype;
  application_row public.membership_applications%rowtype;
  existing_submission public.membership_staff_confirmation_submissions%rowtype;
  next_submission public.membership_staff_confirmation_submissions%rowtype;
  clean_motivation text := btrim(replace(replace(coalesce(p_motivation, ''), chr(13) || chr(10), chr(10)), chr(13), chr(10)));
  changed_at timestamptz := coalesce(p_now, now());
  next_version integer;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'staff_confirmation_invalid_token' using errcode = '28000';
  end if;
  if char_length(clean_motivation) not between 150 and 2000 then
    raise exception 'staff_confirmation_invalid_motivation' using errcode = '22023';
  end if;

  -- Preliminary lookup discovers the application. Authoritative checks happen
  -- again after acquiring application -> credential -> confirmation locks,
  -- matching every administrative mutation and the application-close trigger.
  select token.id, token.confirmation_id, confirmation.application_id
    into token_identity
    from public.membership_staff_confirmation_tokens token
    join public.membership_staff_confirmations confirmation on confirmation.id = token.confirmation_id
   where token.token_hash = p_token_hash;
  if not found then
    raise exception 'staff_confirmation_invalid_token' using errcode = '28000';
  end if;

  select * into application_row
    from public.membership_applications
   where id = token_identity.application_id
   for update;

  select * into token_row
    from public.membership_staff_confirmation_tokens
   where id = token_identity.id and token_hash = p_token_hash
   for update;
  if not found or token_row.revoked_at is not null then
    raise exception 'staff_confirmation_invalid_token' using errcode = '28000';
  end if;
  if token_row.blocked_at is not null then
    raise exception 'staff_confirmation_unavailable' using errcode = '28000';
  end if;

  select * into confirmation_row
    from public.membership_staff_confirmations
   where id = token_row.confirmation_id
   for update;
  if not found
     or application_row.id is null
     or application_row.join_type <> 'staff'
     or application_row.status in ('declined', 'archived') then
    raise exception 'staff_confirmation_inactive' using errcode = '28000';
  end if;

  if confirmation_row.status in ('submitted', 'confirmed') then
    select * into existing_submission
      from public.membership_staff_confirmation_submissions submission
     where submission.confirmation_id = confirmation_row.id
     order by submission.version desc
     limit 1;
    if not found then
      raise exception 'staff_confirmation_inactive' using errcode = '28000';
    end if;
    return query select application_row.id, application_row.reference, confirmation_row.id,
      existing_submission.id, existing_submission.version, existing_submission.submitted_at, true;
    return;
  end if;

  if confirmation_row.status not in ('invited', 'revision_requested') then
    raise exception 'staff_confirmation_inactive' using errcode = '28000';
  end if;
  if confirmation_row.expires_at <= changed_at
     or (token_row.link_nonce is null and token_row.expires_at <= changed_at) then
    raise exception 'staff_confirmation_expired' using errcode = '28000';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
    from public.membership_staff_confirmation_submissions submission
   where submission.confirmation_id = confirmation_row.id;

  insert into public.membership_staff_confirmation_submissions (
    confirmation_id, token_id, version, motivation, submitted_at
  ) values (
    confirmation_row.id, token_row.id, next_version, clean_motivation, changed_at
  ) returning * into next_submission;

  update public.membership_staff_confirmation_tokens
     set first_used_at = coalesce(first_used_at, changed_at),
         last_used_at = changed_at,
         updated_at = changed_at
   where id = token_row.id;

  update public.membership_staff_confirmations
     set status = 'submitted',
         submitted_at = changed_at,
         revision_message = null,
         updated_at = changed_at
   where id = confirmation_row.id;

  return query select application_row.id, application_row.reference,
    confirmation_row.id, next_submission.id, next_submission.version,
    next_submission.submitted_at, false;
end;
$$;

-- One authoritative mutation RPC manages the business lifecycle and the
-- independent credential-access lifecycle. The server supplies only a random
-- nonce and HMAC hash; raw bearer tokens never enter PostgreSQL.
create function public.admin_apply_stable_staff_confirmation_action(
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
      update public.membership_staff_confirmations
         set status = next_status,
             invited_by_admin_user_id = case when status in ('revoked', 'expired') then p_admin_user_id else invited_by_admin_user_id end,
             invited_at = case when status in ('revoked', 'expired') then changed_at else invited_at end,
             expires_at = case
               when expires_at <= changed_at or status in ('revoked', 'expired') then p_expires_at
               else expires_at
             end,
             updated_at = changed_at
       where id = confirmation_row.id
       returning * into confirmation_row;
    end if;
    audit_action := 'staff_fixed_link_created';

  elsif p_action = 'regenerate_staff_confirmation_link' then
    previous_version := credential_row.credential_version;
    next_status := case
      when confirmation_row.status in ('revoked', 'expired') then 'invited'
      else confirmation_row.status
    end;
    update public.membership_staff_confirmations
       set status = next_status,
           invited_by_admin_user_id = p_admin_user_id,
           invited_at = case when status in ('revoked', 'expired') then changed_at else invited_at end,
           expires_at = case when expires_at <= changed_at or status in ('revoked', 'expired') then p_expires_at else expires_at end,
           updated_at = changed_at
     where id = confirmation_row.id
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

-- Reveal/export events are recorded without credential material.
create function public.admin_record_staff_link_audit(
  p_application_id uuid,
  p_admin_user_id uuid,
  p_action text,
  p_metadata jsonb,
  p_now timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  administrator_role text;
begin
  select role into administrator_role
    from public.admin_users
   where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;
  if p_action not in ('staff_link_revealed', 'staff_link_csv_exported') then
    raise exception 'unsupported_staff_link_audit' using errcode = '22023';
  end if;
  if p_action = 'staff_link_revealed' and not exists (
    select 1 from public.membership_applications application
     where application.id = p_application_id and application.join_type = 'staff'
  ) then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id,
    case when p_action = 'staff_link_csv_exported' then 'staff_link_export' else 'join_application' end,
    coalesce(p_application_id, p_admin_user_id), p_action, 'standard',
    coalesce(p_metadata, '{}'::jsonb) - 'token' - 'privateLink' - 'private_link' - 'link_nonce' - 'secret',
    coalesce(p_now, now())
  );
end;
$$;

-- Decline/archive permanently invalidates every current credential, including
-- already-used legacy rows. Motivation history remains immutable.
create or replace function public.membership_close_staff_confirmation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  confirmation_value uuid;
begin
  if new.status in ('declined', 'archived') and old.status is distinct from new.status then
    select confirmation.id into confirmation_value
      from public.membership_staff_confirmations confirmation
     where confirmation.application_id = new.id
       and confirmation.status <> 'confirmed';
    if confirmation_value is not null then
      perform token.id
        from public.membership_staff_confirmation_tokens token
       where token.confirmation_id = confirmation_value
         and token.revoked_at is null
       order by token.created_at desc
       for update;
      update public.membership_staff_confirmations confirmation
         set status = 'revoked',
             reviewed_by_admin_user_id = new.reviewed_by_admin_user_id,
             reviewed_at = coalesce(new.reviewed_at, now()),
             updated_at = coalesce(new.updated_at, now())
       where confirmation.id = confirmation_value
         and confirmation.status <> 'confirmed';
      update public.membership_staff_confirmation_tokens token
         set revoked_at = coalesce(new.updated_at, now()),
             updated_at = coalesce(new.updated_at, now())
       where token.confirmation_id = confirmation_value
         and token.revoked_at is null;
      insert into public.admin_audit_events (
        admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
      ) values (
        new.reviewed_by_admin_user_id, 'join_application', new.id,
        'staff_confirmation_invitation_revoked', 'standard',
        jsonb_build_object('confirmation_id', confirmation_value, 'reason', 'application_' || new.status),
        coalesce(new.updated_at, now())
      );
    end if;
  end if;
  return new;
end;
$$;

drop view public.admin_staff_confirmations;

create view public.admin_staff_confirmations
with (security_invoker = true)
as
select
  confirmation.id as confirmation_id,
  application.id as application_id,
  application.reference,
  application.full_name as candidate_name,
  application.staff_department,
  application.primary_field as staff_department_label,
  application.status as application_status,
  confirmation.status as stored_status,
  case
    when confirmation.id is null then 'not_invited'
    when confirmation.status in ('invited', 'revision_requested') and confirmation.expires_at <= now() then 'expired'
    else confirmation.status
  end as effective_status,
  case
    when credential.id is null then 'none'
    when credential.link_nonce is null then 'legacy'
    when credential.blocked_at is not null then 'blocked'
    else 'active'
  end as link_access,
  credential.link_nonce is not null as link_reconstructable,
  confirmation.invited_at,
  confirmation.expires_at,
  confirmation.submitted_at,
  confirmation.confirmed_at,
  coalesce(confirmation.updated_at, application.updated_at) as updated_at,
  (select count(*)::integer from public.membership_staff_confirmation_submissions submission
    where submission.confirmation_id = confirmation.id) as submission_count,
  (select max(submission.submitted_at) from public.membership_staff_confirmation_submissions submission
    where submission.confirmation_id = confirmation.id) as latest_submission_at
from public.membership_applications application
left join public.membership_staff_confirmations confirmation on confirmation.application_id = application.id
left join lateral (
  select token.id, token.link_nonce, token.blocked_at
    from public.membership_staff_confirmation_tokens token
   where token.confirmation_id = confirmation.id
     and token.revoked_at is null
   order by (token.link_nonce is not null) desc, token.created_at desc
   limit 1
) credential on true
where application.join_type = 'staff'
  and (application.status in ('new', 'in_review', 'interview') or confirmation.id is not null);

-- Service-only source for explicit reveal and sensitive CSV generation. It
-- contains derivation metadata but never a bearer token or full URL.
create view public.admin_staff_link_credentials
with (security_invoker = true)
as
select
  application.id as application_id,
  application.reference,
  application.full_name,
  application.email,
  application.phone,
  application.study_year,
  application.faculty,
  application.department,
  application.staff_department,
  application.primary_field,
  application.status as application_status,
  application.submitted_at as application_submitted_at,
  application.updated_at as application_updated_at,
  confirmation.id as confirmation_id,
  confirmation.status as confirmation_status,
  confirmation.expires_at,
  confirmation.submitted_at,
  confirmation.updated_at as confirmation_updated_at,
  credential.id as credential_id,
  credential.token_hash,
  credential.link_nonce,
  credential.credential_version,
  credential.derivation_version,
  credential.blocked_at,
  credential.revoked_at
from public.membership_applications application
left join public.membership_staff_confirmations confirmation on confirmation.application_id = application.id
left join lateral (
  select token.*
    from public.membership_staff_confirmation_tokens token
   where token.confirmation_id = confirmation.id
     and token.revoked_at is null
   order by (token.link_nonce is not null) desc, token.created_at desc
   limit 1
) credential on true
where application.join_type = 'staff'
  and (application.status in ('new', 'in_review', 'interview') or confirmation.id is not null);

revoke all on table public.admin_staff_confirmations from public, anon, authenticated;
revoke all on table public.admin_staff_link_credentials from public, anon, authenticated;
grant select on table public.admin_staff_confirmations to service_role;
grant select on table public.admin_staff_link_credentials to service_role;

revoke all on function public.admin_apply_stable_staff_confirmation_action(
  uuid, uuid, text, timestamptz, timestamptz, uuid, text, text, integer, integer,
  timestamptz, text, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_apply_stable_staff_confirmation_action(
  uuid, uuid, text, timestamptz, timestamptz, uuid, text, text, integer, integer,
  timestamptz, text, boolean, timestamptz
) to service_role;
revoke all on function public.admin_record_staff_link_audit(uuid, uuid, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_record_staff_link_audit(uuid, uuid, text, jsonb, timestamptz)
  to service_role;

comment on column public.membership_staff_confirmation_tokens.link_nonce is
  'Random per-credential nonce. Not a bearer credential without the server-only HMAC secret.';
comment on column public.membership_staff_confirmation_tokens.credential_version is
  'Monotonic version used in stable token derivation. Regeneration increments it permanently.';
comment on column public.membership_staff_confirmation_tokens.derivation_version is
  'Version of the canonical server-side HMAC derivation format.';
comment on column public.membership_staff_confirmation_tokens.blocked_at is
  'Temporary access suspension. Clearing it restores the exact same derived private URL.';
comment on view public.admin_staff_link_credentials is
  'Service-role-only derivation metadata for explicit Staff-link reveal and sensitive CSV export. Contains no raw token or URL.';

commit;
