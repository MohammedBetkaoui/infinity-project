-- Add the student gender required by the Edition 02 registration form and
-- extend the existing server-only AIVEX admin gateway with gender-aware list
-- filtering and a bounded export. Historical rows stay NULL: no demographic
-- value is inferred or fabricated for a registration collected before this
-- field existed.

begin;

alter table public.aivex_students
  add column if not exists gender text;

alter table public.aivex_students
  drop constraint if exists aivex_students_gender_check;

alter table public.aivex_students
  add constraint aivex_students_gender_check
  check (gender is null or gender in ('male', 'female'));

comment on column public.aivex_students.gender is
  'Canonical student gender (male/female). NULL is retained only for historical registrations collected before this field existed.';

create index if not exists aivex_students_registration_gender_idx
  on public.aivex_students (registration_id, gender);

drop function if exists public.admin_list_aivex_cases(
  smallint, integer, integer, text, text, text, text, text, text, text, date, date, text
);

create function public.admin_list_aivex_cases(
  p_edition smallint,
  p_page integer,
  p_limit integer,
  p_query text,
  p_registration_status text,
  p_document_status text,
  p_wilaya text,
  p_institution text,
  p_complete text,
  p_signed text,
  p_date_from date,
  p_date_to date,
  p_sort text,
  p_gender text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
set statement_timeout = '8s'
as $$
  with edition_rows as materialized (
    select overview.*
      from public.admin_aivex_case_overview as overview
     where overview.edition = p_edition
  ),
  filtered as materialized (
    select overview.*
      from edition_rows as overview
     where (nullif(btrim(p_query), '') is null or overview.search_text ilike '%' || btrim(p_query) || '%')
       and (p_registration_status is null or overview.registration_status = p_registration_status)
       and (p_document_status is null or overview.document_status = p_document_status)
       and (p_wilaya is null or case when p_wilaya ~ '^\d{2}$'
              then overview.wilaya_code = p_wilaya
              else overview.wilaya_name = p_wilaya end)
       and (p_institution is null or overview.institution_name = p_institution)
       and (p_complete is null
            or (p_complete = 'complete' and overview.completeness = 100)
            or (p_complete = 'incomplete' and overview.completeness < 100))
       and (p_signed is null
            or (p_signed = 'present' and overview.signed_document_received)
            or (p_signed = 'absent' and not overview.signed_document_received))
       and (p_gender is null or exists (
         select 1 from public.aivex_students as student
          where student.registration_id = overview.registration_id
            and student.gender = p_gender
       ))
       and (p_date_from is null or overview.submitted_at >= p_date_from::timestamptz)
       and (p_date_to is null or overview.submitted_at < (p_date_to + 1)::timestamptz)
  ),
  page_rows as materialized (
    select filtered.*,
           row_number() over (
             order by
               case when p_sort = 'attention_asc' then attention_rank end asc,
               case when p_sort = 'attention_desc' then attention_rank end desc,
               case when p_sort = 'completion_asc' then completeness end asc,
               case when p_sort = 'completion_desc' then completeness end desc,
               case when p_sort = 'reference_asc' then reference end asc,
               case when p_sort = 'reference_desc' then reference end desc,
               case when p_sort = 'team_asc' then team_name end asc,
               case when p_sort = 'team_desc' then team_name end desc,
               case when p_sort = 'institution_asc' then institution_name end asc,
               case when p_sort = 'institution_desc' then institution_name end desc,
               case when p_sort = 'wilaya_asc' then wilaya_code end asc,
               case when p_sort = 'wilaya_desc' then wilaya_code end desc,
               case when p_sort = 'registration_asc' then registration_status end asc,
               case when p_sort = 'registration_desc' then registration_status end desc,
               case when p_sort = 'document_asc' then document_status end asc,
               case when p_sort = 'document_desc' then document_status end desc,
               case when p_sort = 'submitted_asc' then submitted_at end asc,
               case when p_sort = 'submitted_desc' then submitted_at end desc,
               case when p_sort = 'updated_asc' then updated_at end asc,
               case when p_sort = 'updated_desc' then updated_at end desc,
               submitted_at desc,
               reference asc
           ) as internal_row_number
      from filtered
     offset (greatest(p_page, 1) - 1) * least(greatest(p_limit, 1), 100)
     limit least(greatest(p_limit, 1), 100)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        to_jsonb(page_row) - 'registration_id' - 'search_text' - 'internal_row_number'
        order by page_row.internal_row_number
      ) from page_rows as page_row
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'summary', jsonb_build_object(
      'registered', (select count(*) from edition_rows),
      'complete', (select count(*) from edition_rows where completeness = 100),
      'awaitingSignature', (select count(*) from edition_rows where document_status = 'awaiting_signature'),
      'signedReceived', (select count(*) from edition_rows where signed_document_received),
      'underReview', (select count(*) from edition_rows where document_status = 'under_review'),
      'corrections', (select count(*) from edition_rows where document_status = 'changes_required'),
      'validated', (select count(*) from edition_rows where document_status = 'validated'),
      'documentCounts', jsonb_build_object(
        'not_generated', (select count(*) from edition_rows where document_status = 'not_generated'),
        'generating', (select count(*) from edition_rows where document_status = 'generating'),
        'awaiting_signature', (select count(*) from edition_rows where document_status = 'awaiting_signature'),
        'signed_document_uploaded', (select count(*) from edition_rows where document_status = 'signed_document_uploaded'),
        'under_review', (select count(*) from edition_rows where document_status = 'under_review'),
        'changes_required', (select count(*) from edition_rows where document_status = 'changes_required'),
        'validated', (select count(*) from edition_rows where document_status = 'validated'),
        'generation_failed', (select count(*) from edition_rows where document_status = 'generation_failed'),
        'expired', (select count(*) from edition_rows where document_status = 'expired')
      )
    ),
    'facets', jsonb_build_object(
      'wilayas', coalesce((
        select jsonb_agg(facet.label order by facet.label)
          from (
            select distinct concat(overview.wilaya_code, ' · ', overview.wilaya_name) as label
              from edition_rows as overview
             where overview.wilaya_code is not null and overview.wilaya_name is not null
          ) as facet
      ), '[]'::jsonb),
      'institutions', coalesce((
        select jsonb_agg(facet.institution_name order by facet.institution_name)
          from (
            select distinct overview.institution_name
              from edition_rows as overview
             where overview.institution_name is not null
          ) as facet
      ), '[]'::jsonb)
    )
  );
$$;

-- Keep the one-call detail architecture while extending only the student
-- projection. The existing bundled function remains untouched for backwards
-- compatibility; this wrapper replaces its student array with the new safe
-- projection (private paths remain presence booleans).
create or replace function public.admin_get_aivex_detail_v2(p_reference text)
returns jsonb
language sql
stable
security invoker
set search_path = public
set statement_timeout = '8s'
as $$
  with base as materialized (
    select public.admin_get_aivex_detail(p_reference) as payload
  ),
  registration as materialized (
    select registration.id
      from public.aivex_registrations as registration
     where registration.reference = p_reference
       and registration.form_version = 4
     limit 1
  ),
  students as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'position', student.position,
        'full_name', student.full_name,
        'phone', student.phone,
        'gender', student.gender,
        'bac_year', student.bac_year,
        'rfid_number', student.rfid_number,
        'student_card_path', student.student_card_path is not null,
        'student_card_mime', student.student_card_mime,
        'student_card_size_bytes', student.student_card_size_bytes,
        'created_at', student.created_at,
        'updated_at', student.updated_at
      ) order by student.position
    ), '[]'::jsonb) as payload
      from registration
      join public.aivex_students as student on student.registration_id = registration.id
  )
  select case when base.payload is null then null
    else jsonb_set(base.payload, '{students}', students.payload, true) end
    from base cross join students;
$$;

create or replace function public.admin_export_aivex_cases(
  p_admin_user_id uuid,
  p_edition smallint,
  p_query text,
  p_registration_status text,
  p_document_status text,
  p_wilaya text,
  p_institution text,
  p_complete text,
  p_signed text,
  p_gender text,
  p_date_from date,
  p_date_to date,
  p_sort text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '12s'
as $$
declare
  administrator_role text;
  result jsonb;
begin
  select admin_user.role into administrator_role
    from public.admin_users as admin_user
   where admin_user.id = p_admin_user_id
     and admin_user.is_active = true;

  if administrator_role is null or administrator_role not in ('super_admin', 'administrator') then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;
  if p_gender is not null and p_gender not in ('male', 'female') then
    raise exception 'invalid_gender_filter' using errcode = '22023';
  end if;

  with filtered_teams as materialized (
    select overview.*
      from public.admin_aivex_case_overview as overview
     where overview.edition = p_edition
       and (nullif(btrim(p_query), '') is null or overview.search_text ilike '%' || btrim(p_query) || '%')
       and (p_registration_status is null or overview.registration_status = p_registration_status)
       and (p_document_status is null or overview.document_status = p_document_status)
       and (p_wilaya is null or case when p_wilaya ~ '^\d{2}$'
              then overview.wilaya_code = p_wilaya
              else overview.wilaya_name = p_wilaya end)
       and (p_institution is null or overview.institution_name = p_institution)
       and (p_complete is null
            or (p_complete = 'complete' and overview.completeness = 100)
            or (p_complete = 'incomplete' and overview.completeness < 100))
       and (p_signed is null
            or (p_signed = 'present' and overview.signed_document_received)
            or (p_signed = 'absent' and not overview.signed_document_received))
       and (p_gender is null or exists (
         select 1 from public.aivex_students as matching_student
          where matching_student.registration_id = overview.registration_id
            and matching_student.gender = p_gender
       ))
       and (p_date_from is null or overview.submitted_at >= p_date_from::timestamptz)
       and (p_date_to is null or overview.submitted_at < (p_date_to + 1)::timestamptz)
  ),
  ordered_rows as materialized (
    select team.reference, team.edition, team.team_name, team.wilaya_code, team.wilaya_name,
           team.institution_name, team.registration_status, team.document_status, team.submitted_at,
           student.position, student.full_name, student.gender, student.phone, student.bac_year,
           student.rfid_number,
           row_number() over (
             order by
               case when p_sort = 'attention_asc' then team.attention_rank end asc,
               case when p_sort = 'attention_desc' then team.attention_rank end desc,
               case when p_sort = 'completion_asc' then team.completeness end asc,
               case when p_sort = 'completion_desc' then team.completeness end desc,
               case when p_sort = 'reference_asc' then team.reference end asc,
               case when p_sort = 'reference_desc' then team.reference end desc,
               case when p_sort = 'team_asc' then team.team_name end asc,
               case when p_sort = 'team_desc' then team.team_name end desc,
               case when p_sort = 'institution_asc' then team.institution_name end asc,
               case when p_sort = 'institution_desc' then team.institution_name end desc,
               case when p_sort = 'wilaya_asc' then team.wilaya_code end asc,
               case when p_sort = 'wilaya_desc' then team.wilaya_code end desc,
               case when p_sort = 'registration_asc' then team.registration_status end asc,
               case when p_sort = 'registration_desc' then team.registration_status end desc,
               case when p_sort = 'document_asc' then team.document_status end asc,
               case when p_sort = 'document_desc' then team.document_status end desc,
               case when p_sort = 'submitted_asc' then team.submitted_at end asc,
               case when p_sort = 'submitted_desc' then team.submitted_at end desc,
               case when p_sort = 'updated_asc' then team.updated_at end asc,
               case when p_sort = 'updated_desc' then team.updated_at end desc,
               team.submitted_at desc, team.reference asc, student.position asc
           ) as export_row_number
      from filtered_teams as team
      join public.aivex_students as student
        on student.registration_id = team.registration_id
       and (p_gender is null or student.gender = p_gender)
     order by export_row_number
     limit 15001
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(to_jsonb(export_row) - 'export_row_number' order by export_row.export_row_number)
        from ordered_rows as export_row
       where export_row.export_row_number <= 15000
    ), '[]'::jsonb),
    'truncated', exists(select 1 from ordered_rows where export_row_number > 15000)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_list_aivex_cases(
  smallint, integer, integer, text, text, text, text, text, text, text, date, date, text, text
) from public, anon, authenticated;
grant execute on function public.admin_list_aivex_cases(
  smallint, integer, integer, text, text, text, text, text, text, text, date, date, text, text
) to service_role;

revoke all on function public.admin_get_aivex_detail_v2(text)
  from public, anon, authenticated;
grant execute on function public.admin_get_aivex_detail_v2(text)
  to service_role;

revoke all on function public.admin_export_aivex_cases(
  uuid, smallint, text, text, text, text, text, text, text, text, date, date, text
) from public, anon, authenticated;
grant execute on function public.admin_export_aivex_cases(
  uuid, smallint, text, text, text, text, text, text, text, text, date, date, text
) to service_role;

comment on function public.admin_list_aivex_cases(
  smallint, integer, integer, text, text, text, text, text, text, text, date, date, text, text
) is 'Returns one paginated, gender-filterable AIVEX admin queue payload; service-role-only.';

comment on function public.admin_get_aivex_detail_v2(text) is
  'Returns the existing one-call AIVEX detail bundle with canonical student gender and no private Storage paths.';

comment on function public.admin_export_aivex_cases(
  uuid, smallint, text, text, text, text, text, text, text, text, date, date, text
) is 'Returns at most 15,000 student rows from teams matching the authenticated administrator export filters; service-role-only.';

commit;
