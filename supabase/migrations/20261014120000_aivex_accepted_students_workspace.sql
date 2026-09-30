-- Server-only accepted-student directory for AIVEX Edition 2.
-- Final acceptance is the existing atomic approved + validated state.

begin;

create index if not exists aivex_registrations_accepted_edition_idx
  on public.aivex_registrations (edition, id)
  where form_version = 4
    and registration_status = 'approved'
    and document_status = 'validated';

create or replace function public.admin_list_accepted_aivex_students(
  p_edition smallint,
  p_page integer,
  p_limit integer,
  p_query text,
  p_gender text,
  p_wilaya text,
  p_institution text,
  p_bac_year smallint,
  p_sort text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
set statement_timeout = '8s'
as $$
declare
  result jsonb;
begin
  if p_edition is null or p_edition < 1
     or p_page is null or p_page < 1 or p_page > 100000
     or p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'invalid_accepted_student_pagination' using errcode = '22023';
  end if;
  if p_gender is not null and p_gender not in ('male', 'female') then
    raise exception 'invalid_gender_filter' using errcode = '22023';
  end if;
  if p_bac_year is not null and (p_bac_year < 2019 or p_bac_year > 2026) then
    raise exception 'invalid_bac_year_filter' using errcode = '22023';
  end if;
  if p_sort not in (
    'name_asc', 'name_desc', 'gender_asc', 'gender_desc', 'team_asc', 'team_desc',
    'institution_asc', 'institution_desc', 'wilaya_asc', 'wilaya_desc',
    'bac_asc', 'bac_desc', 'submitted_asc', 'submitted_desc'
  ) then
    raise exception 'invalid_accepted_student_sort' using errcode = '22023';
  end if;

  with accepted_students as materialized (
    select registration.reference, registration.team_name, registration.institution_name,
           registration.wilaya_code, registration.wilaya_name, registration.submitted_at,
           student.position, student.full_name, student.phone, student.gender,
           student.bac_year, student.rfid_number
      from public.aivex_registrations as registration
      join public.aivex_students as student
        on student.registration_id = registration.id
     where registration.edition = p_edition
       and registration.form_version = 4
       and registration.registration_status = 'approved'
       and registration.document_status = 'validated'
  ),
  filtered_students as materialized (
    select accepted.*
      from accepted_students as accepted
     where (nullif(btrim(p_query), '') is null or concat_ws(' ',
              accepted.full_name, accepted.phone, accepted.rfid_number,
              accepted.team_name, accepted.reference, accepted.institution_name,
              accepted.wilaya_code, accepted.wilaya_name
            ) ilike '%' || btrim(p_query) || '%')
       and (p_gender is null or accepted.gender = p_gender)
       and (p_wilaya is null or case when p_wilaya ~ '^\d{2}$'
              then accepted.wilaya_code = p_wilaya
              else accepted.wilaya_name = p_wilaya end)
       and (p_institution is null or accepted.institution_name = p_institution)
       and (p_bac_year is null or accepted.bac_year = p_bac_year)
  ),
  ordered_students as materialized (
    select filtered.*,
           row_number() over (
             order by
               case when p_sort = 'name_asc' then lower(filtered.full_name) end asc,
               case when p_sort = 'name_desc' then lower(filtered.full_name) end desc,
               case when p_sort = 'gender_asc' then filtered.gender end asc nulls last,
               case when p_sort = 'gender_desc' then filtered.gender end desc nulls last,
               case when p_sort = 'team_asc' then lower(filtered.team_name) end asc,
               case when p_sort = 'team_desc' then lower(filtered.team_name) end desc,
               case when p_sort = 'institution_asc' then lower(filtered.institution_name) end asc,
               case when p_sort = 'institution_desc' then lower(filtered.institution_name) end desc,
               case when p_sort = 'wilaya_asc' then filtered.wilaya_code end asc,
               case when p_sort = 'wilaya_desc' then filtered.wilaya_code end desc,
               case when p_sort = 'bac_asc' then filtered.bac_year end asc,
               case when p_sort = 'bac_desc' then filtered.bac_year end desc,
               case when p_sort = 'submitted_asc' then filtered.submitted_at end asc,
               case when p_sort = 'submitted_desc' then filtered.submitted_at end desc,
               lower(filtered.full_name) asc, filtered.reference asc, filtered.position asc
           ) as sort_ordinal
      from filtered_students as filtered
  ),
  page_rows as materialized (
    select ordered.*
      from ordered_students as ordered
     where ordered.sort_ordinal > ((p_page - 1) * p_limit)
       and ordered.sort_ordinal <= (p_page * p_limit)
  ),
  wilaya_facets as (
    select distinct accepted.wilaya_code as code,
           accepted.wilaya_code || ' · ' || accepted.wilaya_name as label
      from accepted_students as accepted
     where accepted.wilaya_code is not null and accepted.wilaya_name is not null
  ),
  institution_facets as (
    select distinct accepted.institution_name as label
      from accepted_students as accepted
     where accepted.institution_name is not null
  ),
  bac_facets as (
    select distinct accepted.bac_year as value
      from accepted_students as accepted
     where accepted.bac_year is not null
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(to_jsonb(page_row) - 'sort_ordinal' order by page_row.sort_ordinal)
        from page_rows as page_row
    ), '[]'::jsonb),
    'total', (select count(*) from filtered_students),
    'summary', jsonb_build_object(
      'total', (select count(*) from accepted_students),
      'female', (select count(*) from accepted_students where gender = 'female'),
      'male', (select count(*) from accepted_students where gender = 'male'),
      'unknown', (select count(*) from accepted_students where gender is null),
      'teams', (select count(distinct reference) from accepted_students)
    ),
    'facets', jsonb_build_object(
      'wilayas', coalesce((select jsonb_agg(label order by code) from wilaya_facets), '[]'::jsonb),
      'institutions', coalesce((select jsonb_agg(label order by label) from institution_facets), '[]'::jsonb),
      'bacYears', coalesce((select jsonb_agg(value order by value desc) from bac_facets), '[]'::jsonb)
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.admin_export_accepted_aivex_students(
  p_admin_user_id uuid,
  p_edition smallint,
  p_query text,
  p_gender text,
  p_wilaya text,
  p_institution text,
  p_bac_year smallint,
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
  if p_edition is null or p_edition < 1 then
    raise exception 'invalid_edition' using errcode = '22023';
  end if;
  if p_gender is not null and p_gender not in ('male', 'female') then
    raise exception 'invalid_gender_filter' using errcode = '22023';
  end if;
  if p_bac_year is not null and (p_bac_year < 2019 or p_bac_year > 2026) then
    raise exception 'invalid_bac_year_filter' using errcode = '22023';
  end if;
  if p_sort not in (
    'name_asc', 'name_desc', 'gender_asc', 'gender_desc', 'team_asc', 'team_desc',
    'institution_asc', 'institution_desc', 'wilaya_asc', 'wilaya_desc',
    'bac_asc', 'bac_desc', 'submitted_asc', 'submitted_desc'
  ) then
    raise exception 'invalid_accepted_student_sort' using errcode = '22023';
  end if;

  with filtered_students as materialized (
    select registration.reference, registration.team_name, registration.institution_name,
           registration.wilaya_code, registration.wilaya_name, registration.submitted_at,
           student.position, student.full_name, student.phone, student.gender,
           student.bac_year, student.rfid_number
      from public.aivex_registrations as registration
      join public.aivex_students as student
        on student.registration_id = registration.id
     where registration.edition = p_edition
       and registration.form_version = 4
       and registration.registration_status = 'approved'
       and registration.document_status = 'validated'
       and (nullif(btrim(p_query), '') is null or concat_ws(' ',
              student.full_name, student.phone, student.rfid_number,
              registration.team_name, registration.reference, registration.institution_name,
              registration.wilaya_code, registration.wilaya_name
            ) ilike '%' || btrim(p_query) || '%')
       and (p_gender is null or student.gender = p_gender)
       and (p_wilaya is null or case when p_wilaya ~ '^\d{2}$'
              then registration.wilaya_code = p_wilaya
              else registration.wilaya_name = p_wilaya end)
       and (p_institution is null or registration.institution_name = p_institution)
       and (p_bac_year is null or student.bac_year = p_bac_year)
  ),
  ordered_rows as materialized (
    select filtered.*,
           row_number() over (
             order by
               case when p_sort = 'name_asc' then lower(filtered.full_name) end asc,
               case when p_sort = 'name_desc' then lower(filtered.full_name) end desc,
               case when p_sort = 'gender_asc' then filtered.gender end asc nulls last,
               case when p_sort = 'gender_desc' then filtered.gender end desc nulls last,
               case when p_sort = 'team_asc' then lower(filtered.team_name) end asc,
               case when p_sort = 'team_desc' then lower(filtered.team_name) end desc,
               case when p_sort = 'institution_asc' then lower(filtered.institution_name) end asc,
               case when p_sort = 'institution_desc' then lower(filtered.institution_name) end desc,
               case when p_sort = 'wilaya_asc' then filtered.wilaya_code end asc,
               case when p_sort = 'wilaya_desc' then filtered.wilaya_code end desc,
               case when p_sort = 'bac_asc' then filtered.bac_year end asc,
               case when p_sort = 'bac_desc' then filtered.bac_year end desc,
               case when p_sort = 'submitted_asc' then filtered.submitted_at end asc,
               case when p_sort = 'submitted_desc' then filtered.submitted_at end desc,
               lower(filtered.full_name) asc, filtered.reference asc, filtered.position asc
           ) as export_row_number
      from filtered_students as filtered
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

revoke all on function public.admin_list_accepted_aivex_students(
  smallint, integer, integer, text, text, text, text, smallint, text
) from public, anon, authenticated;
grant execute on function public.admin_list_accepted_aivex_students(
  smallint, integer, integer, text, text, text, text, smallint, text
) to service_role;

revoke all on function public.admin_export_accepted_aivex_students(
  uuid, smallint, text, text, text, text, smallint, text
) from public, anon, authenticated;
grant execute on function public.admin_export_accepted_aivex_students(
  uuid, smallint, text, text, text, text, smallint, text
) to service_role;

comment on function public.admin_list_accepted_aivex_students(
  smallint, integer, integer, text, text, text, text, smallint, text
) is 'Lists students from atomically accepted AIVEX teams with global gender totals and server-side filters; service-role-only.';

comment on function public.admin_export_accepted_aivex_students(
  uuid, smallint, text, text, text, text, smallint, text
) is 'Exports at most 15,000 accepted-student rows after verifying the active administrator role; service-role-only.';

commit;
