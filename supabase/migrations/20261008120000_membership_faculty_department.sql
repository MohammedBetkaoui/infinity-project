-- Join form v3: the free-text "Department or speciality" becomes a
-- Faculty -> Department choice.
--
-- Expand-only and safe to run more than once. Apply it BEFORE deploying the
-- matching api/join.js (which starts writing `faculty`). The API that is live
-- today keeps working in between: every new rule below only applies to rows
-- that carry a faculty.
--
-- membership_applications.department keeps its name and every existing value:
--   * legacy rows (form v1/v2): faculty is null and department is the free
--     text the applicant typed. Nothing is guessed or rewritten for them.
--   * form v3 rows: faculty and department are slugs from
--     shared/membership/university-structure.js. Labels are resolved at
--     display time.
-- `department` is the student's university department. It is unrelated to
-- staff_department (the Infinity Club internal team).
--
-- NOT NULL is deliberately not added: legacy rows have no faculty. Once they
-- have been handled, a later contract migration can require it.

begin;

-- 1. The only SQL copy of the academic structure. Returns the readable label
--    of a valid (faculty, department) pair and null for anything else,
--    including a department of another faculty. It must mirror
--    shared/membership/university-structure.js exactly: the test
--    tests/membership-academic-structure.test.mjs compares the two.
--    To add a department later, `create or replace` this function in a new
--    migration. Never remove a pair that stored rows still use: CHECK
--    constraints are not re-validated when the function changes.
create or replace function public.membership_department_label(p_faculty text, p_department text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case p_faculty
    when 'fmi' then case p_department
      when 'computer-science' then 'Computer Science'
      when 'mathematics' then 'Mathematics'
    end
    when 'fst' then case p_department
      when 'automatic-control' then 'Automatic Control'
      when 'electromechanics' then 'Electromechanics'
      when 'electronics' then 'Electronics'
      when 'electrical-engineering' then 'Electrical Engineering'
      when 'civil-engineering' then 'Civil Engineering'
      when 'mechanical-engineering' then 'Mechanical Engineering'
      when 'process-engineering' then 'Process Engineering'
      when 'telecommunications' then 'Telecommunications'
    end
    when 'fsnv' then case p_department
      when 'biology' then 'Biology'
      when 'agronomy' then 'Agronomy'
      when 'ecology-environment' then 'Ecology and Environment'
      when 'nutrition' then 'Nutrition Sciences'
    end
    when 'fsecg' then case p_department
      when 'economic-sciences' then 'Economic Sciences'
      when 'management-sciences' then 'Management Sciences'
      when 'commercial-sciences' then 'Commercial Sciences'
      when 'finance-accounting' then 'Financial and Accounting Sciences'
    end
    when 'fll' then case p_department
      when 'arabic' then 'Arabic Language and Literature'
      when 'french' then 'French Language'
      when 'english' then 'English Language'
    end
    when 'fdsp' then case p_department
      when 'law' then 'Law'
      when 'political-science' then 'Political Science'
    end
    when 'fshs' then case p_department
      when 'psychology' then 'Psychology'
      when 'sociology' then 'Sociology'
    end
  end;
$$;

-- 2. Applications: a nullable faculty next to the existing department.
alter table public.membership_applications
  add column if not exists faculty text;

alter table public.membership_applications
  drop constraint if exists membership_applications_faculty_check,
  drop constraint if exists membership_applications_faculty_department_check;

-- Every existing row has faculty = null, so both constraints validate
-- immediately without touching legacy data.
alter table public.membership_applications
  add constraint membership_applications_faculty_check
    check (faculty is null or faculty in ('fmi', 'fst', 'fsnv', 'fsecg', 'fll', 'fdsp', 'fshs')),
  -- With a faculty, the department must be one of that faculty's own
  -- departments: ('fmi', 'civil-engineering') is refused.
  add constraint membership_applications_faculty_department_check
    check (faculty is null or public.membership_department_label(faculty, department) is not null);

comment on column public.membership_applications.faculty is
  'University faculty slug (Join form v3+). Null on legacy rows, whose department column holds free text.';
comment on column public.membership_applications.department is
  'University department: a slug of the row''s faculty when faculty is set (Join form v3+), the applicant''s free text on legacy rows. Unrelated to staff_department.';

-- 3. Directory profiles: the faculty travels with an accepted application.
--    speciality stays the readable, admin-editable department text: legacy
--    and manual profiles keep their free text, new profiles start from the
--    department label.
alter table public.club_members
  add column if not exists faculty text;

alter table public.club_members
  drop constraint if exists club_members_faculty_check;

alter table public.club_members
  add constraint club_members_faculty_check
    check (faculty is null or faculty in ('fmi', 'fst', 'fsnv', 'fsecg', 'fll', 'fdsp', 'fshs'));

comment on column public.club_members.faculty is
  'University faculty slug copied from the accepted Join application. Null for legacy and manually created profiles.';

-- Same function as 20260929120000_admin_members_staff_directory.sql, with the
-- faculty copied and a readable department label instead of a slug in
-- speciality. Legacy applications (faculty null) behave exactly as before.
create or replace function public.club_sync_accepted_application()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  member_id_value uuid;
  department_value text;
  joined_date date := coalesce(new.reviewed_at, new.updated_at, now())::date;
  cohort_value text := extract(year from joined_date)::integer::text || '/' || right((extract(year from joined_date)::integer + 1)::text, 2);
begin
  if new.status <> 'accepted' or new.accepted_as not in ('member', 'staff') then
    return new;
  end if;

  insert into public.club_members (
    source_application_id, full_name, email, phone, study_year, faculty, speciality,
    availability, primary_pole, skills, cohort, status, joined_at,
    created_by_admin_user_id, updated_by_admin_user_id, created_at, updated_at
  ) values (
    new.id, btrim(new.full_name), lower(btrim(new.email)), nullif(btrim(new.phone), ''), new.study_year,
    new.faculty,
    coalesce(public.membership_department_label(new.faculty, new.department), btrim(new.department)),
    new.availability,
    case when new.accepted_as = 'member' then btrim(new.primary_field) else 'Unassigned' end,
    case when new.accepted_as = 'member' then btrim(new.primary_field) else null end,
    cohort_value, 'active', joined_date,
    new.reviewed_by_admin_user_id, new.reviewed_by_admin_user_id,
    coalesce(new.reviewed_at, now()), coalesce(new.updated_at, now())
  )
  on conflict (source_application_id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone,
        study_year = excluded.study_year,
        faculty = excluded.faculty,
        speciality = excluded.speciality,
        availability = excluded.availability,
        updated_by_admin_user_id = excluded.updated_by_admin_user_id,
        updated_at = excluded.updated_at
  returning id into member_id_value;

  if new.accepted_as = 'staff' then
    department_value := coalesce(new.assigned_staff_department, new.staff_department);
    insert into public.club_staff_profiles (
      member_id, requested_department, current_department, internal_role, status,
      created_by_admin_user_id, updated_by_admin_user_id, created_at, updated_at
    ) values (
      member_id_value, new.staff_department, department_value, 'Unassigned', 'active',
      new.reviewed_by_admin_user_id, new.reviewed_by_admin_user_id,
      coalesce(new.reviewed_at, now()), coalesce(new.updated_at, now())
    )
    on conflict (member_id) do update
      set requested_department = excluded.requested_department,
          current_department = excluded.current_department,
          updated_by_admin_user_id = excluded.updated_by_admin_user_id,
          updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;

-- Same read model, with faculty appended as the last column (the only
-- change `create or replace view` allows) so the admin API can show it.
create or replace view public.admin_people_directory
with (security_invoker = true)
as
select
  'members'::text as kind,
  member.id as profile_id,
  member.id as member_id,
  member.source_application_id,
  member.full_name,
  member.email,
  member.phone,
  member.study_year,
  member.speciality,
  member.availability,
  member.primary_pole as structure,
  null::text as requested_department,
  null::text as internal_role,
  member.cohort,
  member.status,
  member.joined_at,
  member.last_activity_at,
  (select count(*)::integer from public.club_member_event_participation event where event.member_id = member.id) as activity_count,
  exists (select 1 from public.club_staff_profiles staff where staff.member_id = member.id) as has_staff_profile,
  member.created_at,
  member.updated_at,
  member.faculty
from public.club_members member
union all
select
  'staff'::text as kind,
  staff.id as profile_id,
  member.id as member_id,
  member.source_application_id,
  member.full_name,
  member.email,
  member.phone,
  member.study_year,
  member.speciality,
  member.availability,
  staff.current_department as structure,
  staff.requested_department,
  staff.internal_role,
  member.cohort,
  staff.status,
  member.joined_at,
  member.last_activity_at,
  (select count(*)::integer from public.club_staff_project_assignments assignment where assignment.staff_profile_id = staff.id) as activity_count,
  true as has_staff_profile,
  staff.created_at,
  greatest(member.updated_at, staff.updated_at) as updated_at,
  member.faculty
from public.club_staff_profiles staff
join public.club_members member on member.id = staff.member_id;

-- Same server-only access model as the rest of the Join/directory tables.
-- The CHECK constraints and the trigger call the label function as the
-- writing role, which is always service_role (or the owner).
revoke all on function public.membership_department_label(text, text) from public, anon, authenticated;
grant execute on function public.membership_department_label(text, text) to service_role;
revoke all on table public.admin_people_directory from anon, authenticated;
grant select on table public.admin_people_directory to service_role;

commit;
