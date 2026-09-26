-- Harden the AIVEX correction state machine.
--
-- One registration has at most one active correction cycle. Candidate field
-- edits remain pending until an administrator verifies the corresponding
-- item. Requesting a replacement invalidates the previous review, and final
-- acceptance is impossible while any correction cycle is active.

begin;

-- Close legacy cycles whose items were all verified but whose parent row was
-- left open by an interrupted older action.
update public.aivex_correction_requests as request
   set resolved_at = coalesce((
     select max(item.reviewed_at)
       from public.aivex_correction_items as item
      where item.correction_request_id = request.id
   ), now())
 where request.resolved_at is null
   and exists (
     select 1 from public.aivex_correction_items as item
      where item.correction_request_id = request.id
   )
   and not exists (
     select 1 from public.aivex_correction_items as item
      where item.correction_request_id = request.id
        and item.status <> 'verified'
   );

-- Repair legacy overlap deterministically before enforcing the invariant.
with ranked as (
  select id,
         row_number() over (partition by registration_id order by created_at desc, id desc) as position
    from public.aivex_correction_requests
   where resolved_at is null
)
update public.aivex_correction_requests as request
   set resolved_at = now()
  from ranked
 where ranked.id = request.id
   and ranked.position > 1;

create unique index if not exists aivex_corrections_one_open_per_registration
  on public.aivex_correction_requests (registration_id)
  where resolved_at is null;

update public.aivex_registrations as registration
   set document_status = 'under_review',
       updated_at = now()
 where registration.document_status = 'changes_required'
   and not exists (
     select 1 from public.aivex_correction_requests as correction
      where correction.registration_id = registration.id
        and correction.resolved_at is null
   );

create or replace function public.aivex_guard_correction_request()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_registration_status text;
  v_document_status text;
begin
  select registration_status, document_status
    into v_registration_status, v_document_status
    from public.aivex_registrations
   where id = new.registration_id;
  if not found then
    raise exception 'aivex_registration_not_found' using errcode = 'P0002';
  end if;
  if v_registration_status in ('rejected', 'cancelled')
     or v_document_status = 'validated' then
    raise exception 'aivex_registration_closed' using errcode = '22023';
  end if;
  if v_document_status not in ('signed_document_uploaded', 'under_review') then
    raise exception 'aivex_review_not_ready' using errcode = '22023';
  end if;
  if new.due_at < new.created_at::date then
    raise exception 'invalid_correction_deadline' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists aivex_correction_request_guard on public.aivex_correction_requests;
create trigger aivex_correction_request_guard
  before insert on public.aivex_correction_requests
  for each row execute function public.aivex_guard_correction_request();

-- `changes_required` always means that the team has an actionable request
-- with item-level instructions. A bare invalidation may remain an internal
-- review result, but it cannot put the team page into a dead-end state.
create or replace function public.aivex_guard_changes_required_status()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.document_status = 'changes_required'
     and old.document_status is distinct from new.document_status
     and not exists (
       select 1 from public.aivex_correction_requests as correction
        where correction.registration_id = new.id
          and correction.resolved_at is null
     ) then
    raise exception 'aivex_correction_request_required' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists aivex_changes_required_guard on public.aivex_registrations;
create trigger aivex_changes_required_guard
  before update of document_status on public.aivex_registrations
  for each row execute function public.aivex_guard_changes_required_status();

-- Candidate-side field submission: one atomic open -> submitted transition.
-- The registration itself is deliberately untouched here.
create or replace function public.candidate_submit_aivex_field_correction(
  p_item_id uuid,
  p_registration_id uuid,
  p_submitted_fields jsonb,
  p_now timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.aivex_correction_items%rowtype;
begin
  if p_submitted_fields is null
     or jsonb_typeof(p_submitted_fields) <> 'object'
     or octet_length(p_submitted_fields::text) > 2048 then
    raise exception 'invalid_correction_fields' using errcode = '22023';
  end if;

  select item.* into v_item
    from public.aivex_correction_items as item
    join public.aivex_correction_requests as request
      on request.id = item.correction_request_id
     and request.resolved_at is null
   where item.id = p_item_id
     and item.registration_id = p_registration_id
     and item.kind = 'field'
     and item.status = 'open'
   for update of item;

  if not found then
    raise exception 'aivex_correction_item_not_ready' using errcode = '55000';
  end if;

  update public.aivex_correction_items
     set status = 'submitted',
         submitted_fields = p_submitted_fields,
         submitted_at = p_now,
         reviewed_at = null,
         reviewed_by_admin_user_id = null,
         review_note = null
   where id = p_item_id;

  return p_item_id;
end;
$$;

revoke all on function public.candidate_submit_aivex_field_correction(
  uuid, uuid, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.candidate_submit_aivex_field_correction(
  uuid, uuid, jsonb, timestamptz
) to service_role;

-- Candidate-side student-card submission: the replacement metadata and the
-- correction item transition commit together after the bytes are verified.
create or replace function public.candidate_submit_aivex_card_correction(
  p_item_id uuid,
  p_registration_id uuid,
  p_position integer,
  p_file_path text,
  p_file_mime text,
  p_file_size bigint,
  p_document_key text,
  p_now timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.aivex_correction_items%rowtype;
begin
  if p_position not between 1 and 3
     or p_document_key <> ('student-' || p_position::text)
     or p_file_path is null
     or p_file_mime not in ('image/jpeg', 'image/png', 'image/webp')
     or p_file_size <= 0 then
    raise exception 'invalid_correction_document' using errcode = '22023';
  end if;

  select item.* into v_item
    from public.aivex_correction_items as item
    join public.aivex_correction_requests as request
      on request.id = item.correction_request_id
     and request.resolved_at is null
   where item.id = p_item_id
     and item.registration_id = p_registration_id
     and item.item = ('Student card 0' || p_position::text)
     and item.kind = 'document'
     and item.status = 'open'
   for update of item;

  if not found then
    raise exception 'aivex_correction_item_not_ready' using errcode = '55000';
  end if;

  update public.aivex_students
     set student_card_path = p_file_path,
         student_card_mime = p_file_mime,
         student_card_size_bytes = p_file_size,
         updated_at = p_now
   where registration_id = p_registration_id
     and position = p_position;
  if not found then
    raise exception 'aivex_student_not_found' using errcode = 'P0002';
  end if;

  update public.aivex_correction_items
     set status = 'submitted',
         submitted_document_key = p_document_key,
         submitted_at = p_now,
         reviewed_at = null,
         reviewed_by_admin_user_id = null,
         review_note = null
   where id = p_item_id;
  return p_item_id;
end;
$$;

revoke all on function public.candidate_submit_aivex_card_correction(
  uuid, uuid, integer, text, text, bigint, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.candidate_submit_aivex_card_correction(
  uuid, uuid, integer, text, text, bigint, text, timestamptz
) to service_role;

create or replace function public.candidate_submit_aivex_signed_correction(
  p_registration_id uuid,
  p_document_key text,
  p_now timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item_id uuid;
begin
  if p_document_key !~ '^signed-v[1-9][0-9]*$' then
    raise exception 'invalid_correction_document' using errcode = '22023';
  end if;

  select item.id into v_item_id
    from public.aivex_correction_items as item
    join public.aivex_correction_requests as request
      on request.id = item.correction_request_id
     and request.resolved_at is null
   where item.registration_id = p_registration_id
     and item.item = 'Signed and stamped form'
     and item.kind = 'document'
     and item.status = 'open'
   for update of item;

  if v_item_id is null then return null; end if;
  update public.aivex_correction_items
     set status = 'submitted',
         submitted_document_key = p_document_key,
         submitted_at = p_now,
         reviewed_at = null,
         reviewed_by_admin_user_id = null,
         review_note = null
   where id = v_item_id;
  return v_item_id;
end;
$$;

revoke all on function public.candidate_submit_aivex_signed_correction(
  uuid, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.candidate_submit_aivex_signed_correction(
  uuid, text, timestamptz
) to service_role;

-- A newly requested item immediately invalidates the decision it replaces.
create or replace function public.aivex_prepare_correction_item()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_document_key text;
begin
  if new.item = 'Activities manager' then
    update public.aivex_admin_case_reviews
       set activity_official_verified = false,
           updated_at = new.created_at
     where registration_id = new.registration_id;
  end if;

  v_document_key := case new.item
    when 'Delegation leader ID' then 'delegation-leader'
    when 'Driver ID' then 'driver'
    when 'Student card 01' then 'student-1'
    when 'Student card 02' then 'student-2'
    when 'Student card 03' then 'student-3'
    else null
  end;

  if v_document_key is not null then
    delete from public.aivex_admin_document_reviews
     where registration_id = new.registration_id
       and document_key = v_document_key;
  end if;
  return new;
end;
$$;

drop trigger if exists aivex_correction_item_prepare on public.aivex_correction_items;
create trigger aivex_correction_item_prepare
  after insert on public.aivex_correction_items
  for each row execute function public.aivex_prepare_correction_item();

-- Apply an accepted field proposal and only then make it authoritative.
create or replace function public.aivex_apply_verified_field_correction()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status <> 'submitted' or new.status <> 'verified' or new.kind <> 'field' then
    return new;
  end if;

  if new.item = 'Team information' then
    update public.aivex_registrations
       set team_name = new.submitted_fields ->> 'name',
           wilaya_code = new.submitted_fields #>> '{wilaya,code}',
           wilaya_name = new.submitted_fields #>> '{wilaya,name}',
           institution_id = new.submitted_fields #>> '{institution,id}',
           institution_name = new.submitted_fields #>> '{institution,name}',
           institution_custom = coalesce((new.submitted_fields #>> '{institution,custom}')::boolean, false)
     where id = new.registration_id;
  elsif new.item = 'Activities manager' then
    update public.aivex_registrations
       set activity_official_role = new.submitted_fields ->> 'role',
           activity_official_name = new.submitted_fields ->> 'fullName',
           activity_official_email = new.submitted_fields ->> 'email',
           activity_official_phone = new.submitted_fields ->> 'phone'
     where id = new.registration_id;

    insert into public.aivex_admin_case_reviews (
      registration_id, activity_official_verified, updated_by_admin_user_id,
      created_at, updated_at
    ) values (
      new.registration_id, true, new.reviewed_by_admin_user_id,
      new.reviewed_at, new.reviewed_at
    )
    on conflict on constraint aivex_admin_case_reviews_pkey do update
      set activity_official_verified = true,
          updated_by_admin_user_id = excluded.updated_by_admin_user_id,
          updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists aivex_correction_field_apply on public.aivex_correction_items;
create trigger aivex_correction_field_apply
  after update of status on public.aivex_correction_items
  for each row execute function public.aivex_apply_verified_field_correction();

-- Identity replacements are handled through the organisers' restricted
-- process. Once the replacement is reviewed in the secure viewer, stage its
-- open item so the existing admin action resolves it in the same transaction.
create or replace function public.aivex_stage_managed_document_correction()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item_label text;
begin
  v_item_label := case new.document_key
    when 'delegation-leader' then 'Delegation leader ID'
    when 'driver' then 'Driver ID'
    else null
  end;
  if v_item_label is null then return new; end if;

  update public.aivex_correction_items as item
     set status = 'submitted',
         submitted_document_key = new.document_key,
         submitted_at = new.reviewed_at,
         reviewed_at = null,
         reviewed_by_admin_user_id = null,
         review_note = null
    from public.aivex_correction_requests as request
   where item.correction_request_id = request.id
     and request.resolved_at is null
     and item.registration_id = new.registration_id
     and item.item = v_item_label
     and item.status = 'open';
  return new;
end;
$$;

drop trigger if exists aivex_managed_document_correction_stage
  on public.aivex_admin_document_reviews;
create trigger aivex_managed_document_correction_stage
  after insert or update on public.aivex_admin_document_reviews
  for each row execute function public.aivex_stage_managed_document_correction();

-- Final acceptance remains a single atomic decision and now explicitly
-- enforces the correction-cycle invariant at database level.
create or replace function public.admin_accept_aivex_team(
  p_registration_id uuid,
  p_admin_user_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_now timestamptz
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_registration public.aivex_registrations%rowtype;
  v_administrator_role text;
  v_clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_is_complete boolean := false;
  v_latest_signed_version integer;
  v_changed_at timestamptz;
begin
  select admin_user.role into v_administrator_role
    from public.admin_users as admin_user
   where admin_user.id = p_admin_user_id
     and admin_user.is_active = true;

  if v_administrator_role is null
     or v_administrator_role not in ('super_admin', 'administrator') then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;
  if v_clean_reason is null or char_length(v_clean_reason) > 2000 then
    raise exception 'aivex_reason_required' using errcode = '22023';
  end if;

  select registration.* into v_registration
    from public.aivex_registrations as registration
   where registration.id = p_registration_id
     and registration.form_version = 4
   for update;

  if not found then
    raise exception 'aivex_registration_not_found' using errcode = 'P0002';
  end if;
  if v_registration.updated_at is distinct from p_expected_updated_at then
    raise exception 'aivex_registration_conflict' using errcode = '40001';
  end if;
  if v_registration.registration_status in ('rejected', 'cancelled') then
    raise exception 'aivex_registration_closed' using errcode = '22023';
  end if;
  if v_registration.document_status not in ('signed_document_uploaded', 'under_review') then
    raise exception 'aivex_validation_incomplete' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.aivex_correction_requests as correction
     where correction.registration_id = p_registration_id
       and correction.resolved_at is null
  ) then
    raise exception 'aivex_correction_cycle_active' using errcode = '22023';
  end if;

  select (overview.completeness = 100 and overview.student_cards_verified = true)
    into v_is_complete
    from public.admin_aivex_case_overview as overview
   where overview.registration_id = p_registration_id;
  select max(submitted.version) into v_latest_signed_version
    from public.aivex_submitted_documents as submitted
   where submitted.registration_id = p_registration_id;

  if coalesce(v_is_complete, false) = false or v_latest_signed_version is null then
    raise exception 'aivex_validation_incomplete' using errcode = '22023';
  end if;

  update public.aivex_registrations
     set registration_status = 'approved', document_status = 'validated', updated_at = p_now
   where id = p_registration_id
  returning updated_at into v_changed_at;

  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id, 'aivex_registration', p_registration_id, 'validate_file', 'standard',
    jsonb_build_object(
      'reason', v_clean_reason,
      'previous_registration_status', v_registration.registration_status,
      'next_registration_status', 'approved',
      'previous_document_status', v_registration.document_status,
      'next_document_status', 'validated'
    ), p_now
  );
  return v_changed_at;
end;
$$;

revoke all on function public.admin_accept_aivex_team(
  uuid, uuid, timestamptz, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_accept_aivex_team(
  uuid, uuid, timestamptz, text, timestamptz
) to service_role;

commit;
