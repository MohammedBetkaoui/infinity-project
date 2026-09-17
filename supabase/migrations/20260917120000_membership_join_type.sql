-- Member / Staff applications (join form v2).
--
-- Run this BEFORE deploying the matching api/join.js: the new function
-- writes join_type and staff_department, no longer writes motivation, and
-- accepts Engineering study years (E1-E5).
--
-- Safe to run more than once.

begin;

-- 1. Participation mode. Existing rows were all member applications.
alter table public.membership_applications
  add column if not exists join_type text not null default 'member',
  add column if not exists staff_department text;

alter table public.membership_applications
  drop constraint if exists membership_applications_join_type_check,
  drop constraint if exists membership_applications_staff_department_check,
  drop constraint if exists membership_applications_staff_department_required;

alter table public.membership_applications
  add constraint membership_applications_join_type_check
    check (join_type in ('member', 'staff')),
  add constraint membership_applications_staff_department_check
    check (staff_department is null or staff_department in ('dev-tech', 'design-content', 'management-logistics')),
  -- Staff rows always name a department; member rows never keep one.
  add constraint membership_applications_staff_department_required
    check ((join_type = 'staff') = (staff_department is not null));

-- 2. The "Why Infinity, and why now?" essay is gone. Existing answers are
--    kept; new rows simply leave the column empty.
alter table public.membership_applications
  alter column motivation drop not null;

do $$
declare
  constraint_row record;
begin
  -- Drop any CHECK on motivation (e.g. a minimum length) and any CHECK on
  -- study_year, whatever name it was created with.
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.membership_applications'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%motivation%' or pg_get_constraintdef(oid) ilike '%study_year%')
  loop
    execute format('alter table public.membership_applications drop constraint %I', constraint_row.conname);
  end loop;
end $$;

-- 3. Study levels, now including the five Engineering years.
alter table public.membership_applications
  add constraint membership_applications_study_year_check
    check (study_year in ('L1', 'L2', 'L3', 'M1', 'M2', 'E1', 'E2', 'E3', 'E4', 'E5', 'other'));

create index if not exists membership_applications_join_type_idx
  on public.membership_applications (join_type, staff_department);

commit;
