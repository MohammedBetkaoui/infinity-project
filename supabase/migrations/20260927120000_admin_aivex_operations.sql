-- Infinity Administration — production AIVEX case management.
--
-- Prerequisites:
--   20260918120000_aivex_v4_contract.sql through
--   20260924120000_aivex_direct_upload_sessions_and_retention.sql
--   20260925120000_admin_authentication.sql
--   20260926120000_admin_join_applications.sql
--
-- This migration is additive. It never publishes a Storage object, never
-- stores a signed URL, and never copies private paths into an audit event.

begin;

create table if not exists public.aivex_admin_case_reviews (
  registration_id uuid primary key
    references public.aivex_registrations (id) on delete cascade,
  activity_official_verified boolean not null default false,
  updated_by_admin_user_id uuid
    references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aivex_admin_document_reviews (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null
    references public.aivex_registrations (id) on delete cascade,
  document_key text not null,
  review_status text not null default 'pending',
  note text,
  reviewed_by_admin_user_id uuid
    references public.admin_users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint aivex_admin_document_reviews_key_check
    check (document_key ~ '^(student-[1-3]|delegation-leader|driver|signed-v[1-9][0-9]*)$'),
  constraint aivex_admin_document_reviews_status_check
    check (review_status in ('pending', 'verified', 'invalid')),
  constraint aivex_admin_document_reviews_note_check
    check (note is null or char_length(note) between 1 and 2000),
  constraint aivex_admin_document_reviews_registration_key
    unique (registration_id, document_key)
);

create table if not exists public.aivex_correction_requests (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null
    references public.aivex_registrations (id) on delete cascade,
  items jsonb not null,
  team_message text not null,
  internal_note text not null,
  due_at date not null,
  requested_by_admin_user_id uuid
    references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_admin_user_id uuid
    references public.admin_users (id) on delete set null,

  constraint aivex_correction_requests_items_check
    check (
      jsonb_typeof(items) = 'array'
      and jsonb_array_length(items) between 1 and 8
      and octet_length(items::text) <= 2048
    ),
  constraint aivex_correction_requests_message_check
    check (char_length(team_message) between 1 and 2000),
  constraint aivex_correction_requests_note_check
    check (char_length(internal_note) between 1 and 2000),
  constraint aivex_correction_requests_resolution_check
    check (
      (resolved_at is null and resolved_by_admin_user_id is null)
      or resolved_at is not null
    )
);

create index if not exists aivex_document_reviews_registration_idx
  on public.aivex_admin_document_reviews (registration_id, document_key);
create index if not exists aivex_corrections_registration_created_idx
  on public.aivex_correction_requests (registration_id, created_at desc);
create index if not exists aivex_corrections_open_idx
  on public.aivex_correction_requests (registration_id, due_at)
  where resolved_at is null;

drop trigger if exists aivex_admin_case_reviews_touch_updated_at
  on public.aivex_admin_case_reviews;
create trigger aivex_admin_case_reviews_touch_updated_at
  before update on public.aivex_admin_case_reviews
  for each row execute function public.aivex_touch_updated_at();

drop trigger if exists aivex_admin_document_reviews_touch_updated_at
  on public.aivex_admin_document_reviews;
create trigger aivex_admin_document_reviews_touch_updated_at
  before update on public.aivex_admin_document_reviews
  for each row execute function public.aivex_touch_updated_at();

-- Service-role-only operational view. It exposes presence/verification
-- signals, never a private Storage path, checksum, token or national ID.
create or replace view public.admin_aivex_case_overview
with (security_invoker = true)
as
select overview.*,
  (
    overview.team_information_complete::integer
    + overview.activity_official_verified::integer
    + overview.delegation_head_verified::integer
    + overview.driver_verified::integer
    + overview.exact_student_count::integer
    + overview.student_cards_present::integer
    + overview.identity_documents_present::integer
    + overview.official_form_generated::integer
    + overview.signed_document_received::integer
    + overview.signed_document_verified::integer
  ) * 10 as completeness,
  case overview.document_status
    when 'generation_failed' then 0
    when 'changes_required' then 1
    when 'signed_document_uploaded' then 2
    when 'under_review' then 3
    when 'awaiting_signature' then 4
    when 'not_generated' then 5
    when 'generating' then 6
    when 'expired' then 7
    when 'validated' then 8
    else 9
  end as attention_rank
from (
  select
    registration.id as registration_id,
    registration.reference,
    registration.edition,
    registration.form_version,
    registration.team_name,
    registration.wilaya_code,
    registration.wilaya_name,
    registration.institution_name,
    registration.institution_custom,
    registration.activity_official_name,
    registration.activity_official_role,
    registration.registration_status,
    registration.document_status,
    registration.submitted_at,
    registration.created_at,
    registration.updated_at,
    concat_ws(' ',
      registration.reference,
      registration.team_name,
      registration.institution_name,
      registration.activity_official_name,
      registration.wilaya_name,
      (select string_agg(student.full_name, ' ' order by student.position)
         from public.aivex_students student
        where student.registration_id = registration.id)
    ) as search_text,
    (
      registration.team_name is not null
      and registration.wilaya_code is not null
      and registration.wilaya_name is not null
      and registration.institution_name is not null
      and registration.activity_official_name is not null
      and registration.activity_official_email is not null
      and registration.activity_official_phone is not null
    ) as team_information_complete,
    coalesce(case_review.activity_official_verified, false) as activity_official_verified,
    exists (
      select 1 from public.aivex_admin_document_reviews review
       where review.registration_id = registration.id
         and review.document_key = 'delegation-leader'
         and review.review_status = 'verified'
    ) as delegation_head_verified,
    exists (
      select 1 from public.aivex_admin_document_reviews review
       where review.registration_id = registration.id
         and review.document_key = 'driver'
         and review.review_status = 'verified'
    ) as driver_verified,
    (select count(*) = 3 from public.aivex_students student
      where student.registration_id = registration.id) as exact_student_count,
    (select count(*) = 3 from public.aivex_students student
      where student.registration_id = registration.id
        and student.student_card_path is not null) as student_cards_present,
    (
      registration.delegation_head_id_card_path is not null
      and registration.driver_id_card_path is not null
    ) as identity_documents_present,
    exists (
      select 1 from public.aivex_generated_documents generated
       where generated.registration_id = registration.id
         and generated.document_type = 'docx'
         and generated.generation_status = 'generated'
    ) as official_form_generated,
    exists (
      select 1 from public.aivex_submitted_documents submitted
       where submitted.registration_id = registration.id
    ) as signed_document_received,
    exists (
      select 1
        from public.aivex_submitted_documents submitted
        join public.aivex_admin_document_reviews review
          on review.registration_id = submitted.registration_id
         and review.document_key = 'signed-v' || submitted.version::text
         and review.review_status = 'verified'
       where submitted.registration_id = registration.id
         and submitted.version = (
           select max(latest.version)
             from public.aivex_submitted_documents latest
            where latest.registration_id = registration.id
         )
    ) as signed_document_verified,
    (
      select count(*) = 3
        from public.aivex_students student
        join public.aivex_admin_document_reviews review
          on review.registration_id = student.registration_id
         and review.document_key = 'student-' || student.position::text
         and review.review_status = 'verified'
       where student.registration_id = registration.id
    ) as student_cards_verified
  from public.aivex_registrations registration
  left join public.aivex_admin_case_reviews case_review
    on case_review.registration_id = registration.id
  where registration.form_version = 4
) overview;

create or replace function public.admin_apply_aivex_action(
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
  registration_row public.aivex_registrations%rowtype;
  administrator_role text;
  next_registration_status text;
  next_document_status text;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  document_key text;
  review_status text;
  audit_sensitivity text := 'standard';
  changed_at timestamptz;
  latest_signed_version integer;
begin
  select role into administrator_role
    from public.admin_users
   where id = p_admin_user_id and is_active = true;

  if administrator_role is null then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;

  if p_action not in (
    'start_review', 'approve_registration', 'request_corrections',
    'validate_file', 'reject_registration', 'cancel_registration',
    'verify_activity_official', 'verify_document', 'invalidate_document'
  ) then
    raise exception 'invalid_aivex_action' using errcode = '22023';
  end if;

  if administrator_role = 'reviewer' and p_action not in (
    'start_review', 'request_corrections', 'verify_activity_official',
    'verify_document', 'invalidate_document'
  ) then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;

  if clean_reason is null or char_length(clean_reason) > 2000 then
    raise exception 'aivex_reason_required' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 8192 then
    raise exception 'invalid_aivex_payload' using errcode = '22023';
  end if;

  select * into registration_row
    from public.aivex_registrations
   where id = p_registration_id and form_version = 4
   for update;

  if not found then
    raise exception 'aivex_registration_not_found' using errcode = 'P0002';
  end if;

  if registration_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'aivex_registration_conflict' using errcode = '40001';
  end if;

  next_registration_status := registration_row.registration_status;
  next_document_status := registration_row.document_status;

  if p_action = 'start_review' then
    next_registration_status := 'under_review';
    if registration_row.document_status in ('signed_document_uploaded', 'changes_required', 'under_review') then
      next_document_status := 'under_review';
    end if;

  elsif p_action = 'approve_registration' then
    next_registration_status := 'approved';

  elsif p_action = 'request_corrections' then
    if jsonb_typeof(p_payload -> 'items') is distinct from 'array'
       or jsonb_array_length(p_payload -> 'items') not between 1 and 8
       or char_length(btrim(coalesce(p_payload ->> 'message', ''))) not between 1 and 2000
       or coalesce(p_payload ->> 'deadline', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or (p_payload ->> 'deadline')::date < p_now::date then
      raise exception 'invalid_correction_request' using errcode = '22023';
    end if;

    insert into public.aivex_correction_requests (
      registration_id, items, team_message, internal_note, due_at,
      requested_by_admin_user_id, created_at
    ) values (
      p_registration_id, p_payload -> 'items', btrim(p_payload ->> 'message'),
      clean_reason, (p_payload ->> 'deadline')::date, p_admin_user_id, p_now
    );
    next_document_status := 'changes_required';

  elsif p_action = 'verify_activity_official' then
    if jsonb_typeof(p_payload -> 'verified') is distinct from 'boolean' then
      raise exception 'invalid_activity_verification' using errcode = '22023';
    end if;
    insert into public.aivex_admin_case_reviews (
      registration_id, activity_official_verified, updated_by_admin_user_id,
      created_at, updated_at
    ) values (
      p_registration_id, (p_payload ->> 'verified')::boolean,
      p_admin_user_id, p_now, p_now
    )
    on conflict (registration_id) do update
      set activity_official_verified = excluded.activity_official_verified,
          updated_by_admin_user_id = excluded.updated_by_admin_user_id,
          updated_at = excluded.updated_at;

  elsif p_action in ('verify_document', 'invalidate_document') then
    document_key := btrim(coalesce(p_payload ->> 'documentKey', ''));
    if document_key !~ '^(student-[1-3]|delegation-leader|driver|signed-v[1-9][0-9]*)$' then
      raise exception 'invalid_aivex_document' using errcode = '22023';
    end if;

    if document_key like 'student-%' and not exists (
      select 1 from public.aivex_students student
       where student.registration_id = p_registration_id
         and student.position = substring(document_key from '[1-3]$')::integer
         and student.student_card_path is not null
    ) then
      raise exception 'aivex_document_not_found' using errcode = 'P0002';
    elsif document_key = 'delegation-leader'
      and registration_row.delegation_head_id_card_path is null then
      raise exception 'aivex_document_not_found' using errcode = 'P0002';
    elsif document_key = 'driver'
      and registration_row.driver_id_card_path is null then
      raise exception 'aivex_document_not_found' using errcode = 'P0002';
    elsif document_key like 'signed-v%' and not exists (
      select 1 from public.aivex_submitted_documents submitted
       where submitted.registration_id = p_registration_id
         and submitted.version = substring(document_key from '[0-9]+$')::integer
    ) then
      raise exception 'aivex_document_not_found' using errcode = 'P0002';
    end if;

    review_status := case when p_action = 'verify_document' then 'verified' else 'invalid' end;
    audit_sensitivity := 'confidential';
    insert into public.aivex_admin_document_reviews (
      registration_id, document_key, review_status, note,
      reviewed_by_admin_user_id, reviewed_at, created_at, updated_at
    ) values (
      p_registration_id, document_key, review_status, clean_reason,
      p_admin_user_id, p_now, p_now, p_now
    )
    on conflict (registration_id, document_key) do update
      set review_status = excluded.review_status,
          note = excluded.note,
          reviewed_by_admin_user_id = excluded.reviewed_by_admin_user_id,
          reviewed_at = excluded.reviewed_at,
          updated_at = excluded.updated_at;

    if p_action = 'invalidate_document' then
      next_document_status := 'changes_required';
    end if;

  elsif p_action = 'validate_file' then
    select max(version) into latest_signed_version
      from public.aivex_submitted_documents
     where registration_id = p_registration_id;

    if registration_row.registration_status <> 'approved'
       or not exists (
         select 1 from public.admin_aivex_case_overview overview
          where overview.registration_id = p_registration_id
            and overview.completeness = 100
            and overview.student_cards_verified = true
       )
       or latest_signed_version is null then
      raise exception 'aivex_validation_incomplete' using errcode = '22023';
    end if;
    next_document_status := 'validated';
    update public.aivex_correction_requests
       set resolved_at = p_now, resolved_by_admin_user_id = p_admin_user_id
     where registration_id = p_registration_id and resolved_at is null;

  elsif p_action = 'reject_registration' then
    next_registration_status := 'rejected';

  elsif p_action = 'cancel_registration' then
    next_registration_status := 'cancelled';
  end if;

  update public.aivex_registrations
     set registration_status = next_registration_status,
         document_status = next_document_status,
         updated_at = p_now
   where id = p_registration_id
  returning updated_at into changed_at;

  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id,
    case when p_action in ('verify_document', 'invalidate_document')
      then 'aivex_document' else 'aivex_registration' end,
    p_registration_id,
    p_action,
    audit_sensitivity,
    jsonb_strip_nulls(jsonb_build_object(
      'reason', clean_reason,
      'document_key', document_key,
      'previous_registration_status', registration_row.registration_status,
      'next_registration_status', next_registration_status,
      'previous_document_status', registration_row.document_status,
      'next_document_status', next_document_status
    )),
    p_now
  );

  return changed_at;
end;
$$;

alter table public.aivex_admin_case_reviews enable row level security;
alter table public.aivex_admin_document_reviews enable row level security;
alter table public.aivex_correction_requests enable row level security;

revoke all on table public.aivex_admin_case_reviews from public, anon, authenticated;
revoke all on table public.aivex_admin_document_reviews from public, anon, authenticated;
revoke all on table public.aivex_correction_requests from public, anon, authenticated;
revoke all on table public.admin_aivex_case_overview from public, anon, authenticated;

grant select, insert, update, delete on table public.aivex_admin_case_reviews to service_role;
grant select, insert, update, delete on table public.aivex_admin_document_reviews to service_role;
grant select, insert, update, delete on table public.aivex_correction_requests to service_role;
grant select on table public.admin_aivex_case_overview to service_role;

revoke all on function public.admin_apply_aivex_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_apply_aivex_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) to service_role;

comment on table public.aivex_admin_case_reviews is
  'Server-only manual AIVEX case checks associated with the authenticated administrator.';
comment on table public.aivex_admin_document_reviews is
  'Server-only AIVEX document verification decisions. document_key is an opaque logical key, never a Storage path.';
comment on table public.aivex_correction_requests is
  'Append-only AIVEX correction requests with an internal note and an external team message.';
comment on view public.admin_aivex_case_overview is
  'Service-role-only AIVEX work queue. Contains no private Storage path, checksum, token or national ID.';

commit;

-- Manual verification after applying:
-- select relname, relrowsecurity from pg_class
--  where relname in ('aivex_admin_case_reviews','aivex_admin_document_reviews','aivex_correction_requests');
-- select tablename, policyname from pg_policies
--  where tablename in ('aivex_admin_case_reviews','aivex_admin_document_reviews','aivex_correction_requests');
-- Expected: RLS true and zero policies.
