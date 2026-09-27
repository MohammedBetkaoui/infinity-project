-- Complete the AIVEX admin/correction/Magic-Link workflow.
-- Forward-only: no production data, object, or historical migration is removed.

begin;

-- Structured correction items + deadline are authoritative. Keep the legacy
-- message column nullable so existing rows survive while new requests carry no
-- automatically generated English prose.
alter table public.aivex_correction_requests
  alter column team_message drop not null;
alter table public.aivex_correction_requests
  drop constraint if exists aivex_correction_requests_message_check;
alter table public.aivex_correction_requests
  add constraint aivex_correction_requests_message_check
    check (team_message is null or char_length(team_message) between 1 and 2000);

comment on column public.aivex_correction_requests.team_message is
  'Optional legacy/custom team message. Normal correction instructions are localized from items, statuses and due_at.';

-- Reuse the private direct-upload session state machine for an object-scoped,
-- authenticated administrator upload capability. The browser never chooses a
-- bucket, registration UUID, correction row, or final object path.
alter table public.aivex_upload_sessions
  add column if not exists admin_user_id uuid references public.admin_users (id) on delete cascade,
  add column if not exists expected_updated_at timestamptz;

alter table public.aivex_upload_sessions
  drop constraint if exists aivex_upload_sessions_kind_check,
  drop constraint if exists aivex_upload_sessions_kind_columns_check;

alter table public.aivex_upload_sessions
  add constraint aivex_upload_sessions_kind_check
    check (kind in ('registration', 'signed_document', 'correction_document', 'admin_identity_replacement')),
  add constraint aivex_upload_sessions_kind_columns_check
    check (
      (kind = 'registration' and submission_id is not null and upload_id is null
        and registration_id is null and admin_user_id is null and expected_updated_at is null)
      or
      (kind in ('signed_document', 'correction_document') and submission_id is null
        and upload_id is not null and registration_id is not null
        and admin_user_id is null and expected_updated_at is null)
      or
      (kind = 'admin_identity_replacement' and submission_id is null
        and upload_id is not null and registration_id is not null
        and admin_user_id is not null and expected_updated_at is not null)
    );

create index if not exists aivex_upload_sessions_admin_identity_idx
  on public.aivex_upload_sessions (admin_user_id, registration_id, upload_id, created_at desc)
  where kind = 'admin_identity_replacement';

-- Database-level candidate deadline enforcement. Date-only deadlines are
-- inclusive through the due date in the event timezone. Identity replacement
-- rows are deliberately excluded because those bytes can only be supplied by
-- an authenticated administrator through the RPC below.
create or replace function public.aivex_enforce_candidate_correction_deadline()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_due_at date;
  v_resolved_at timestamptz;
begin
  if old.status = 'open' and new.status = 'submitted'
     and new.item not in ('Delegation leader ID', 'Driver ID') then
    select request.due_at, request.resolved_at
      into v_due_at, v_resolved_at
      from public.aivex_correction_requests as request
     where request.id = new.correction_request_id
       and request.registration_id = new.registration_id
     for update;

    if v_due_at is null or v_resolved_at is not null then
      raise exception 'aivex_correction_item_not_ready' using errcode = '55000';
    end if;
    if v_due_at < (statement_timestamp() at time zone 'Africa/Algiers')::date then
      raise exception 'correction_deadline_expired' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists aivex_candidate_correction_deadline
  on public.aivex_correction_items;
create trigger aivex_candidate_correction_deadline
  before update of status on public.aivex_correction_items
  for each row execute function public.aivex_enforce_candidate_correction_deadline();

-- Identity corrections become submitted only after a replacement passed the
-- server's byte validation. The older trigger incorrectly staged an item when
-- somebody merely reviewed the existing document.
drop trigger if exists aivex_managed_document_correction_stage
  on public.aivex_admin_document_reviews;
drop function if exists public.aivex_stage_managed_document_correction();

-- New correction requests use structured data only and start review as part
-- of the same transaction. Signature receipt is the last candidate-owned
-- state; requesting corrections is meaningful administrative review work.
create or replace function public.admin_request_aivex_corrections(
  p_registration_id uuid,
  p_admin_user_id uuid,
  p_action text,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_payload jsonb,
  p_now timestamptz
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_registration public.aivex_registrations%rowtype;
  v_role text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_request_id uuid;
  v_deadline date;
  v_changed_at timestamptz;
  v_next_registration_status text;
begin
  select admin_user.role into v_role
    from public.admin_users as admin_user
   where admin_user.id = p_admin_user_id and admin_user.is_active = true;
  if v_role is null or v_role not in ('super_admin', 'administrator', 'reviewer') then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;
  if p_action <> 'request_corrections' or v_reason is null or char_length(v_reason) > 2000
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 8192 then
    raise exception 'invalid_correction_request' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'items') is distinct from 'array'
     or jsonb_array_length(p_payload -> 'items') not between 1 and 8
     or coalesce(p_payload ->> 'deadline', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid_correction_request' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_payload -> 'items') as requested(value)
     where requested.value not in (
       'Team information', 'Activities manager', 'Delegation leader ID', 'Driver ID',
       'Student card 01', 'Student card 02', 'Student card 03', 'Signed and stamped form'
     )
  ) or (
    select count(*) <> count(distinct requested.value)
      from jsonb_array_elements_text(p_payload -> 'items') as requested(value)
  ) then
    raise exception 'invalid_correction_request' using errcode = '22023';
  end if;
  v_deadline := (p_payload ->> 'deadline')::date;
  if v_deadline < (p_now at time zone 'Africa/Algiers')::date then
    raise exception 'invalid_correction_deadline' using errcode = '22023';
  end if;

  select registration.* into v_registration
    from public.aivex_registrations as registration
   where registration.id = p_registration_id and registration.form_version = 4
   for update;
  if not found then
    raise exception 'aivex_registration_not_found' using errcode = 'P0002';
  end if;
  if v_registration.updated_at is distinct from p_expected_updated_at then
    raise exception 'aivex_registration_conflict' using errcode = '40001';
  end if;
  if v_registration.registration_status in ('rejected', 'cancelled')
     or v_registration.document_status not in ('signed_document_uploaded', 'under_review') then
    raise exception 'aivex_review_not_ready' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.aivex_correction_requests as request
     where request.registration_id = p_registration_id and request.resolved_at is null
  ) then
    raise exception 'aivex_correction_cycle_active' using errcode = '23505';
  end if;

  insert into public.aivex_correction_requests (
    registration_id, items, team_message, internal_note, due_at,
    requested_by_admin_user_id, created_at
  ) values (
    p_registration_id, p_payload -> 'items', null, v_reason, v_deadline,
    p_admin_user_id, p_now
  ) returning id into v_request_id;

  insert into public.aivex_correction_items (correction_request_id, registration_id, item, kind)
  select v_request_id, p_registration_id, requested.value,
    case when requested.value in ('Team information', 'Activities manager') then 'field' else 'document' end
  from jsonb_array_elements_text(p_payload -> 'items') as requested(value);

  v_next_registration_status := case
    when v_registration.registration_status = 'submitted' then 'under_review'
    else v_registration.registration_status
  end;
  update public.aivex_registrations
     set registration_status = v_next_registration_status,
         document_status = 'changes_required',
         updated_at = p_now
   where id = p_registration_id
   returning updated_at into v_changed_at;

  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id, 'aivex_registration', p_registration_id,
    'request_corrections', 'standard',
    jsonb_build_object(
      'reason', v_reason,
      'items', p_payload -> 'items',
      'due_at', v_deadline,
      'previous_registration_status', v_registration.registration_status,
      'next_registration_status', v_next_registration_status,
      'previous_document_status', v_registration.document_status,
      'next_document_status', 'changes_required'
    ), p_now
  );
  return v_changed_at;
end;
$$;

-- Wrap only the meaningful review actions. The pre-transition deliberately
-- leaves updated_at unchanged so the existing optimistic-concurrency check
-- remains valid inside admin_apply_aivex_action; both updates are one DB
-- transaction and roll back together on any failure.
create or replace function public.admin_apply_aivex_review_action(
  p_registration_id uuid,
  p_admin_user_id uuid,
  p_action text,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_payload jsonb,
  p_now timestamptz
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_registration public.aivex_registrations%rowtype;
begin
  if p_action not in ('verify_activity_official', 'verify_document', 'invalidate_document') then
    raise exception 'invalid_aivex_action' using errcode = '22023';
  end if;
  select registration.* into v_registration
    from public.aivex_registrations as registration
   where registration.id = p_registration_id and registration.form_version = 4
   for update;
  if not found then
    raise exception 'aivex_registration_not_found' using errcode = 'P0002';
  end if;
  if v_registration.updated_at is distinct from p_expected_updated_at then
    raise exception 'aivex_registration_conflict' using errcode = '40001';
  end if;
  if v_registration.registration_status = 'submitted'
     and v_registration.document_status = 'signed_document_uploaded' then
    update public.aivex_registrations
       set registration_status = 'under_review', document_status = 'under_review'
     where id = p_registration_id;
  end if;
  return public.admin_apply_aivex_action(
    p_registration_id, p_admin_user_id, p_action, p_expected_updated_at,
    p_reason, p_payload, p_now
  );
end;
$$;

create or replace function public.admin_extend_aivex_correction_deadline(
  p_registration_id uuid,
  p_admin_user_id uuid,
  p_action text,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_payload jsonb,
  p_now timestamptz
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_registration public.aivex_registrations%rowtype;
  v_request public.aivex_correction_requests%rowtype;
  v_role text;
  v_new_deadline date;
  v_changed_at timestamptz;
begin
  select admin_user.role into v_role
    from public.admin_users as admin_user
   where admin_user.id = p_admin_user_id and admin_user.is_active = true;
  if v_role is null or v_role not in ('super_admin', 'administrator') then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;
  if p_action <> 'extend_correction_deadline'
     or coalesce(p_payload ->> 'deadline', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid_correction_deadline' using errcode = '22023';
  end if;
  v_new_deadline := (p_payload ->> 'deadline')::date;
  if v_new_deadline < (p_now at time zone 'Africa/Algiers')::date then
    raise exception 'invalid_correction_deadline' using errcode = '22023';
  end if;

  select registration.* into v_registration
    from public.aivex_registrations as registration
   where registration.id = p_registration_id and registration.form_version = 4
   for update;
  if not found then raise exception 'aivex_registration_not_found' using errcode = 'P0002'; end if;
  if v_registration.updated_at is distinct from p_expected_updated_at then
    raise exception 'aivex_registration_conflict' using errcode = '40001';
  end if;
  select request.* into v_request
    from public.aivex_correction_requests as request
   where request.registration_id = p_registration_id and request.resolved_at is null
   for update;
  if not found then raise exception 'aivex_correction_item_not_found' using errcode = 'P0002'; end if;

  update public.aivex_correction_requests set due_at = v_new_deadline where id = v_request.id;
  update public.aivex_registrations set updated_at = p_now where id = p_registration_id
    returning updated_at into v_changed_at;
  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id, 'aivex_registration', p_registration_id,
    'extend_correction_deadline', 'standard',
    jsonb_build_object('old_deadline', v_request.due_at, 'new_deadline', v_new_deadline), p_now
  );
  return v_changed_at;
end;
$$;

-- Restricted administrator-only identity replacement. Storage has already
-- been byte-validated server-side; this transaction switches the active
-- private object, invalidates any older review, marks the item submitted,
-- and writes a path-free confidential audit event. It never verifies the file.
create or replace function public.admin_submit_aivex_identity_replacement(
  p_registration_id uuid,
  p_admin_user_id uuid,
  p_expected_updated_at timestamptz,
  p_item_id uuid,
  p_document_key text,
  p_file_path text,
  p_file_mime text,
  p_file_size bigint,
  p_file_sha256 text,
  p_now timestamptz
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_registration public.aivex_registrations%rowtype;
  v_item public.aivex_correction_items%rowtype;
  v_role text;
  v_expected_item text;
  v_expected_folder text;
  v_path_pattern text;
  v_changed_at timestamptz;
begin
  select admin_user.role into v_role
    from public.admin_users as admin_user
   where admin_user.id = p_admin_user_id and admin_user.is_active = true;
  if v_role is null or v_role not in ('super_admin', 'administrator') then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;
  v_expected_item := case p_document_key
    when 'delegation-leader' then 'Delegation leader ID'
    when 'driver' then 'Driver ID'
    else null
  end;
  v_expected_folder := case p_document_key
    when 'delegation-leader' then 'delegation-head'
    when 'driver' then 'driver'
    else null
  end;
  if v_expected_item is null or p_file_path is null
     or p_file_mime is null or p_file_mime not in ('image/jpeg', 'image/png')
     or p_file_size is null or p_file_size not between 1 and 5242880
     or p_file_sha256 is null or p_file_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_identity_replacement' using errcode = '22023';
  end if;

  select registration.* into v_registration
    from public.aivex_registrations as registration
   where registration.id = p_registration_id and registration.form_version = 4
   for update;
  if not found then raise exception 'aivex_registration_not_found' using errcode = 'P0002'; end if;
  if v_registration.updated_at is distinct from p_expected_updated_at then
    raise exception 'aivex_registration_conflict' using errcode = '40001';
  end if;
  v_path_pattern := '^edition-' || v_registration.edition::text || '/'
    || lower(p_registration_id::text) || '/' || v_expected_folder
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png)$';
  if p_file_path !~ v_path_pattern
     or (p_file_mime = 'image/jpeg' and p_file_path !~ '[.]jpg$')
     or (p_file_mime = 'image/png' and p_file_path !~ '[.]png$') then
    raise exception 'invalid_identity_replacement_path' using errcode = '22023';
  end if;

  select item.* into v_item
    from public.aivex_correction_items as item
    join public.aivex_correction_requests as request
      on request.id = item.correction_request_id and request.resolved_at is null
   where item.id = p_item_id and item.registration_id = p_registration_id
     and item.item = v_expected_item and item.kind = 'document' and item.status = 'open'
   for update of item;
  if not found then raise exception 'aivex_correction_item_not_found' using errcode = 'P0002'; end if;

  delete from public.aivex_admin_document_reviews
   where registration_id = p_registration_id and document_key = p_document_key;

  if p_document_key = 'delegation-leader' then
    update public.aivex_registrations
       set delegation_head_id_card_path = p_file_path,
           delegation_head_id_card_mime = p_file_mime,
           delegation_head_id_card_size = p_file_size,
           delegation_head_id_card_sha256 = p_file_sha256,
           delegation_head_id_card_purged_at = null,
           registration_status = case when registration_status = 'submitted' then 'under_review' else registration_status end,
           updated_at = p_now
     where id = p_registration_id returning updated_at into v_changed_at;
  else
    update public.aivex_registrations
       set driver_id_card_path = p_file_path,
           driver_id_card_mime = p_file_mime,
           driver_id_card_size = p_file_size,
           driver_id_card_sha256 = p_file_sha256,
           driver_id_card_purged_at = null,
           registration_status = case when registration_status = 'submitted' then 'under_review' else registration_status end,
           updated_at = p_now
     where id = p_registration_id returning updated_at into v_changed_at;
  end if;

  update public.aivex_correction_items
     set status = 'submitted', submitted_document_key = p_document_key,
         submitted_at = p_now, reviewed_at = null,
         reviewed_by_admin_user_id = null, review_note = null
   where id = p_item_id;

  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id, 'aivex_document', p_registration_id,
    'identity_document_replacement_uploaded', 'confidential',
    jsonb_build_object('document_key', p_document_key, 'correction_item', v_expected_item), p_now
  );
  return v_changed_at;
end;
$$;

revoke all on function public.admin_request_aivex_corrections(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_request_aivex_corrections(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) to service_role;

revoke all on function public.admin_apply_aivex_review_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_apply_aivex_review_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) to service_role;

revoke all on function public.admin_extend_aivex_correction_deadline(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_extend_aivex_correction_deadline(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) to service_role;

revoke all on function public.admin_submit_aivex_identity_replacement(
  uuid, uuid, timestamptz, uuid, text, text, text, bigint, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_submit_aivex_identity_replacement(
  uuid, uuid, timestamptz, uuid, text, text, text, bigint, text, timestamptz
) to service_role;

commit;
