-- Secure Staff confirmation and motivation workflow for Join applications.
-- Forward-only: apply after 20261015122000_fix_admin_notification_recipient_conflict.sql.

begin;

create table public.membership_staff_confirmations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique
    references public.membership_applications (id) on delete cascade,
  status text not null default 'invited',
  invited_by_admin_user_id uuid
    references public.admin_users (id) on delete set null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revision_message text,
  submitted_at timestamptz,
  reviewed_by_admin_user_id uuid
    references public.admin_users (id) on delete set null,
  reviewed_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint membership_staff_confirmations_status_check
    check (status in ('invited', 'submitted', 'revision_requested', 'confirmed', 'revoked', 'expired')),
  constraint membership_staff_confirmations_expiry_check
    check (expires_at > invited_at),
  constraint membership_staff_confirmations_revision_check
    check (revision_message is null or (revision_message = btrim(revision_message) and char_length(revision_message) between 1 and 1000)),
  constraint membership_staff_confirmations_confirmed_check
    check ((status = 'confirmed') = (confirmed_at is not null))
);

create table public.membership_staff_confirmation_tokens (
  id uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null
    references public.membership_staff_confirmations (id) on delete cascade,
  token_hash text not null unique,
  purpose text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_by_admin_user_id uuid
    references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint membership_staff_confirmation_tokens_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint membership_staff_confirmation_tokens_purpose_check
    check (purpose in ('initial', 'revision', 'replacement')),
  constraint membership_staff_confirmation_tokens_expiry_check
    check (expires_at > created_at),
  constraint membership_staff_confirmation_tokens_consumed_check
    check (consumed_at is null or consumed_at >= created_at),
  constraint membership_staff_confirmation_tokens_revoked_check
    check (revoked_at is null or revoked_at >= created_at)
);

create table public.membership_staff_confirmation_submissions (
  id uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null
    references public.membership_staff_confirmations (id) on delete cascade,
  token_id uuid
    references public.membership_staff_confirmation_tokens (id) on delete set null,
  version integer not null,
  motivation text not null,
  submitted_at timestamptz not null default now(),

  constraint membership_staff_confirmation_submissions_version_check
    check (version >= 1),
  constraint membership_staff_confirmation_submissions_motivation_check
    check (motivation = btrim(motivation) and char_length(motivation) between 150 and 2000),
  constraint membership_staff_confirmation_submissions_version_unique
    unique (confirmation_id, version)
);

create index membership_staff_confirmations_status_idx
  on public.membership_staff_confirmations (status, updated_at desc);
create index membership_staff_confirmations_invited_idx
  on public.membership_staff_confirmations (invited_at desc);
create index membership_staff_confirmations_submitted_idx
  on public.membership_staff_confirmations (submitted_at desc)
  where submitted_at is not null;
create index membership_staff_confirmation_tokens_confirmation_idx
  on public.membership_staff_confirmation_tokens (confirmation_id, created_at desc);
create unique index membership_staff_confirmation_tokens_one_active_idx
  on public.membership_staff_confirmation_tokens (confirmation_id)
  where consumed_at is null and revoked_at is null;
create index membership_staff_confirmation_submissions_confirmation_idx
  on public.membership_staff_confirmation_submissions (confirmation_id, submitted_at desc);

create or replace function public.membership_staff_confirmation_touch_updated_at()
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

create trigger membership_staff_confirmations_touch_updated_at
  before update on public.membership_staff_confirmations
  for each row execute function public.membership_staff_confirmation_touch_updated_at();

-- Candidate submission is a single lock-protected transaction. A retry with
-- the same consumed token returns the original submission instead of making a
-- second version.
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
  token_row public.membership_staff_confirmation_tokens%rowtype;
  confirmation_row public.membership_staff_confirmations%rowtype;
  existing_submission public.membership_staff_confirmation_submissions%rowtype;
  next_submission public.membership_staff_confirmation_submissions%rowtype;
  clean_motivation text := btrim(replace(replace(coalesce(p_motivation, ''), chr(13) || chr(10), chr(10)), chr(13), chr(10)));
  changed_at timestamptz := coalesce(p_now, now());
  next_version integer;
  reference_value text;
  application_id_value uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'staff_confirmation_invalid_token' using errcode = '28000';
  end if;
  if char_length(clean_motivation) not between 150 and 2000 then
    raise exception 'staff_confirmation_invalid_motivation' using errcode = '22023';
  end if;

  select * into token_row
    from public.membership_staff_confirmation_tokens
   where token_hash = p_token_hash
   for update;
  if not found then
    raise exception 'staff_confirmation_invalid_token' using errcode = '28000';
  end if;
  if token_row.revoked_at is not null then
    raise exception 'staff_confirmation_inactive' using errcode = '28000';
  end if;

  if token_row.consumed_at is not null then
    select * into existing_submission
      from public.membership_staff_confirmation_submissions submission
     where submission.token_id = token_row.id
     order by submission.submitted_at desc
     limit 1;
    if not found then
      raise exception 'staff_confirmation_inactive' using errcode = '28000';
    end if;
    select c.application_id, a.reference into application_id_value, reference_value
      from public.membership_staff_confirmations c
      join public.membership_applications a on a.id = c.application_id
     where c.id = token_row.confirmation_id;
    return query select application_id_value, reference_value, token_row.confirmation_id,
      existing_submission.id, existing_submission.version, existing_submission.submitted_at, true;
    return;
  end if;

  if token_row.expires_at <= changed_at then
    raise exception 'staff_confirmation_expired' using errcode = '28000';
  end if;

  select * into confirmation_row
    from public.membership_staff_confirmations
   where id = token_row.confirmation_id
   for update;
  if not found or confirmation_row.status not in ('invited', 'revision_requested') then
    raise exception 'staff_confirmation_inactive' using errcode = '28000';
  end if;
  if confirmation_row.expires_at <= changed_at then
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
     set consumed_at = changed_at
   where id = token_row.id;

  update public.membership_staff_confirmations
     set status = 'submitted',
         submitted_at = changed_at,
         revision_message = null,
         updated_at = changed_at
   where id = confirmation_row.id;

  select reference into reference_value
    from public.membership_applications
   where id = confirmation_row.application_id;

  return query select confirmation_row.application_id, reference_value,
    confirmation_row.id, next_submission.id, next_submission.version,
    next_submission.submitted_at, false;
end;
$$;

-- All administrative Staff-confirmation mutations share one transaction and
-- the same optimistic-concurrency checks as the existing Join workflow.
create or replace function public.admin_apply_staff_confirmation_action(
  p_application_id uuid,
  p_admin_user_id uuid,
  p_action text,
  p_expected_application_updated_at timestamptz,
  p_expected_confirmation_updated_at timestamptz,
  p_token_hash text,
  p_token_purpose text,
  p_expires_at timestamptz,
  p_message text,
  p_now timestamptz
)
returns table (
  confirmation_id uuid,
  confirmation_status text,
  confirmation_updated_at timestamptz,
  application_updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  application_row public.membership_applications%rowtype;
  confirmation_row public.membership_staff_confirmations%rowtype;
  administrator_role text;
  changed_at timestamptz := coalesce(p_now, now());
  clean_message text := nullif(btrim(coalesce(p_message, '')), '');
  has_confirmation boolean := false;
  next_status text;
  audit_action text;
  latest_version integer;
begin
  select role into administrator_role
    from public.admin_users
   where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;
  if p_action not in (
    'invite_staff_confirmation', 'regenerate_staff_confirmation_link',
    'request_staff_confirmation_revision', 'revoke_staff_confirmation',
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
  if p_expected_application_updated_at is null or application_row.updated_at <> p_expected_application_updated_at then
    raise exception 'application_conflict' using errcode = '40001';
  end if;
  if application_row.join_type <> 'staff'
     or application_row.status not in ('new', 'in_review', 'interview') then
    raise exception 'invalid_staff_confirmation_application' using errcode = '22023';
  end if;

  select * into confirmation_row
    from public.membership_staff_confirmations
   where application_id = p_application_id;
  has_confirmation := found;

  if p_action <> 'invite_staff_confirmation' then
    if not has_confirmation then
      raise exception 'staff_confirmation_not_found' using errcode = 'P0002';
    end if;

    -- Candidate submission locks token then confirmation. Lock in the same
    -- order here so regeneration/revocation cannot deadlock with submission.
    perform token.id
      from public.membership_staff_confirmation_tokens token
     where token.confirmation_id = confirmation_row.id
       and token.consumed_at is null
       and token.revoked_at is null
     for update;
    select * into confirmation_row
      from public.membership_staff_confirmations
     where application_id = p_application_id
     for update;

    if p_expected_confirmation_updated_at is null or confirmation_row.updated_at <> p_expected_confirmation_updated_at then
      raise exception 'staff_confirmation_conflict' using errcode = '40001';
    end if;
  elsif has_confirmation then
    raise exception 'staff_confirmation_already_exists' using errcode = '22023';
  end if;

  if p_action in (
    'invite_staff_confirmation', 'regenerate_staff_confirmation_link',
    'request_staff_confirmation_revision'
  ) then
    if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
       or p_token_purpose not in ('initial', 'revision', 'replacement')
       or p_expires_at is null or p_expires_at <= changed_at
       or p_expires_at > changed_at + interval '30 days' then
      raise exception 'invalid_staff_confirmation_invitation' using errcode = '22023';
    end if;
  end if;

  if p_action = 'invite_staff_confirmation' then
    insert into public.membership_staff_confirmations (
      application_id, status, invited_by_admin_user_id, invited_at,
      expires_at, created_at, updated_at
    ) values (
      p_application_id, 'invited', p_admin_user_id, changed_at,
      p_expires_at, changed_at, changed_at
    ) returning * into confirmation_row;
    next_status := 'invited';
    audit_action := 'staff_confirmation_invited';

  elsif p_action = 'regenerate_staff_confirmation_link' then
    if confirmation_row.status not in ('invited', 'revision_requested', 'revoked', 'expired') then
      raise exception 'invalid_staff_confirmation_transition' using errcode = '22023';
    end if;
    next_status := case
      when confirmation_row.status = 'revision_requested' or confirmation_row.revision_message is not null then 'revision_requested'
      else 'invited'
    end;
    update public.membership_staff_confirmations
       set status = next_status,
           invited_by_admin_user_id = p_admin_user_id,
           invited_at = changed_at,
           expires_at = p_expires_at,
           updated_at = changed_at
     where id = confirmation_row.id
     returning * into confirmation_row;
    audit_action := 'staff_confirmation_link_regenerated';

  elsif p_action = 'request_staff_confirmation_revision' then
    if confirmation_row.status <> 'submitted'
       or clean_message is null or char_length(clean_message) > 1000 then
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
     where id = confirmation_row.id
     returning * into confirmation_row;
    audit_action := 'staff_confirmation_revision_requested';

  elsif p_action = 'revoke_staff_confirmation' then
    if confirmation_row.status not in ('invited', 'revision_requested', 'expired') then
      raise exception 'invalid_staff_confirmation_transition' using errcode = '22023';
    end if;
    next_status := 'revoked';
    update public.membership_staff_confirmations
       set status = next_status,
           reviewed_by_admin_user_id = p_admin_user_id,
           reviewed_at = changed_at,
           updated_at = changed_at
     where id = confirmation_row.id
     returning * into confirmation_row;
    audit_action := 'staff_confirmation_invitation_revoked';

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
     where id = confirmation_row.id
     returning * into confirmation_row;

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
    audit_action := 'staff_membership_confirmed';
  end if;

  if p_action in (
    'invite_staff_confirmation', 'regenerate_staff_confirmation_link',
    'request_staff_confirmation_revision'
  ) then
    update public.membership_staff_confirmation_tokens token
       set revoked_at = changed_at
     where token.confirmation_id = confirmation_row.id
       and token.consumed_at is null
       and token.revoked_at is null;

    insert into public.membership_staff_confirmation_tokens (
      confirmation_id, token_hash, purpose, expires_at,
      created_by_admin_user_id, created_at
    ) values (
      confirmation_row.id, p_token_hash, p_token_purpose, p_expires_at,
      p_admin_user_id, changed_at
    );
  elsif p_action = 'revoke_staff_confirmation' then
    update public.membership_staff_confirmation_tokens token
       set revoked_at = changed_at
     where token.confirmation_id = confirmation_row.id
       and token.consumed_at is null
       and token.revoked_at is null;
  end if;

  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id, 'join_application', p_application_id, audit_action, 'standard',
    jsonb_strip_nulls(jsonb_build_object(
      'confirmation_id', confirmation_row.id,
      'confirmation_status', next_status,
      'submission_version', latest_version,
      'expires_at', case when p_expires_at is not null then p_expires_at end
    )),
    changed_at
  );

  if p_action <> 'confirm_staff_membership' then
    update public.membership_applications
       set reviewed_by_admin_user_id = p_admin_user_id,
           reviewed_at = changed_at,
           updated_at = changed_at
     where id = p_application_id
     returning updated_at into application_updated_at;
  end if;

  return query select confirmation_row.id, next_status, confirmation_row.updated_at, application_updated_at;
end;
$$;

-- An accepted Staff transition is authoritative only after confirmation.
-- Already-accepted historical rows are untouched because the guard runs only
-- when a row enters the accepted Staff state.
create or replace function public.membership_require_staff_confirmation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.join_type = 'staff'
     and new.status = 'accepted'
     and new.accepted_as = 'staff'
     and (old.status is distinct from 'accepted' or old.accepted_as is distinct from 'staff')
     and not exists (
       select 1 from public.membership_staff_confirmations confirmation
        where confirmation.application_id = new.id
          and confirmation.status = 'confirmed'
     ) then
    raise exception 'staff_confirmation_required' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger membership_require_staff_confirmation
  before update of status, accepted_as on public.membership_applications
  for each row execute function public.membership_require_staff_confirmation();

-- Declining or archiving a pending application invalidates any outstanding
-- invitation without touching immutable motivation history.
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
      -- Match candidate submission's token -> confirmation lock order.
      perform token.id
        from public.membership_staff_confirmation_tokens token
       where token.confirmation_id = confirmation_value
         and token.consumed_at is null
         and token.revoked_at is null
       for update;
      update public.membership_staff_confirmations confirmation
       set status = 'revoked',
           reviewed_by_admin_user_id = new.reviewed_by_admin_user_id,
           reviewed_at = coalesce(new.reviewed_at, now()),
           updated_at = coalesce(new.updated_at, now())
       where confirmation.id = confirmation_value
         and confirmation.status <> 'confirmed';
      update public.membership_staff_confirmation_tokens token
         set revoked_at = coalesce(new.updated_at, now())
       where token.confirmation_id = confirmation_value
         and token.consumed_at is null
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

create trigger membership_close_staff_confirmation
  after update of status on public.membership_applications
  for each row execute function public.membership_close_staff_confirmation();

create view public.admin_staff_confirmations
with (security_invoker = true)
as
select
  confirmation.id as confirmation_id,
  confirmation.application_id,
  application.reference,
  application.full_name as candidate_name,
  application.staff_department,
  application.primary_field as staff_department_label,
  application.status as application_status,
  confirmation.status as stored_status,
  case
    when confirmation.status in ('invited', 'revision_requested') and confirmation.expires_at <= now() then 'expired'
    else confirmation.status
  end as effective_status,
  confirmation.invited_at,
  confirmation.expires_at,
  confirmation.submitted_at,
  confirmation.confirmed_at,
  confirmation.updated_at,
  (select count(*)::integer from public.membership_staff_confirmation_submissions submission
    where submission.confirmation_id = confirmation.id) as submission_count,
  (select max(submission.submitted_at) from public.membership_staff_confirmation_submissions submission
    where submission.confirmation_id = confirmation.id) as latest_submission_at
from public.membership_staff_confirmations confirmation
join public.membership_applications application on application.id = confirmation.application_id;

alter table public.membership_staff_confirmations enable row level security;
alter table public.membership_staff_confirmation_tokens enable row level security;
alter table public.membership_staff_confirmation_submissions enable row level security;

revoke all on table public.membership_staff_confirmations from public, anon, authenticated;
revoke all on table public.membership_staff_confirmation_tokens from public, anon, authenticated;
revoke all on table public.membership_staff_confirmation_submissions from public, anon, authenticated;
revoke all on table public.admin_staff_confirmations from public, anon, authenticated;

grant select, insert, update on table public.membership_staff_confirmations to service_role;
grant select, insert, update on table public.membership_staff_confirmation_tokens to service_role;
grant select, insert on table public.membership_staff_confirmation_submissions to service_role;
grant select on table public.admin_staff_confirmations to service_role;

revoke all on function public.staff_submit_confirmation(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.staff_submit_confirmation(text, text, timestamptz) to service_role;
revoke all on function public.admin_apply_staff_confirmation_action(
  uuid, uuid, text, timestamptz, timestamptz, text, text, timestamptz, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_apply_staff_confirmation_action(
  uuid, uuid, text, timestamptz, timestamptz, text, text, timestamptz, text, timestamptz
) to service_role;

-- Allow exactly the new Staff confirmation deep link, without widening the
-- notification system to arbitrary query strings.
alter table public.admin_notifications
  drop constraint if exists admin_notifications_action_path_check;
alter table public.admin_notifications
  add constraint admin_notifications_action_path_check
  check (
    action_path is null
    or action_path ~ '^/admin/(overview|activity|settings|applications|aivex)$'
    or action_path ~ '^/admin/applications\?record=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    or action_path ~ '^/admin/applications\?view=staff-confirmations&record=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    or action_path ~ '^/admin/aivex/AIVEX[1-9][0-9]?-[0-9A-HJKMNP-TV-Z]{8}$'
  );

comment on table public.membership_staff_confirmations is
  'One Staff confirmation lifecycle per Join application. Server/service-role access only.';
comment on table public.membership_staff_confirmation_tokens is
  'Append-only invitation credential history. Stores SHA-256 token hashes only, never bearer tokens.';
comment on table public.membership_staff_confirmation_submissions is
  'Immutable versioned Staff motivation letters. Stored and rendered as plain text.';

commit;
