-- AIVEX registration — form v3 (Institution / Delegation / Students / Review).
--
-- STEP 1 of 2: EXPAND. This file only ADDS columns and RELAXES old ones, so
-- it is safe to run while the current (v2) api/aivex/register.js is still
-- live: existing writes keep working. Run the matching _contract.sql only
-- AFTER the v3 API is deployed.
--
-- What the form now sends (payload version 3):
--   team            -> name, wilaya {code,name}, institution {id,name,custom}
--   activityOfficial-> role, fullName, email, phone
--   delegationHead  -> fullName, phone, nationalId
--   driver          -> fullName, phone, nationalId
--   students[3]     -> position, fullName, registrationNumber, studyLevel,
--                      phone, studentCard (multipart file studentCard_1..3)
-- The "team leader" no longer exists.
--
-- PERSONAL DATA: delegation_head_national_id and driver_national_id hold
-- national ID numbers. They stay text (leading zeros are part of the number),
-- are never indexed, never logged and reachable through the service role
-- only — RLS on these tables must stay enabled.
--
-- Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 1. New columns on aivex_registrations
-- ---------------------------------------------------------------------------
alter table public.aivex_registrations
  -- STEP 1 — Institution
  add column if not exists wilaya_code text,
  add column if not exists wilaya_name text,
  add column if not exists institution_id text,
  add column if not exists institution_name text,
  add column if not exists institution_custom boolean not null default false,
  -- STEP 1 — Activity administration contact
  add column if not exists activity_official_role text,
  add column if not exists activity_official_name text,
  add column if not exists activity_official_email text,
  add column if not exists activity_official_phone text,
  -- STEP 2 — Delegation
  add column if not exists delegation_head_name text,
  add column if not exists delegation_head_phone text,
  add column if not exists delegation_head_national_id text,
  add column if not exists driver_name text,
  add column if not exists driver_phone text,
  add column if not exists driver_national_id text,
  -- STEP 3 — Students (always three)
  add column if not exists student_count smallint not null default 3;

comment on column public.aivex_registrations.wilaya_code is
  'Official wilaya code 01-58, from src/data/algeriaHigherEducation.js. Stable identifier: filter on this, not on the label.';
comment on column public.aivex_registrations.wilaya_name is
  'French label of the wilaya at submission time (kept for exports; labels may change).';
comment on column public.aivex_registrations.institution_id is
  'Institution id from the same dataset, or ''other'' when the team typed the name itself.';
comment on column public.aivex_registrations.institution_custom is
  'true when institution_name is free text ("Other / Institution not listed").';
comment on column public.aivex_registrations.activity_official_role is
  'sub_director_activities | activities_officer.';
comment on column public.aivex_registrations.delegation_head_national_id is
  'PERSONAL DATA — national ID number. Text on purpose: leading zeros matter. Service role only.';
comment on column public.aivex_registrations.driver_national_id is
  'PERSONAL DATA — national ID number. Text on purpose: leading zeros matter. Service role only.';

-- ---------------------------------------------------------------------------
-- 2. Carry existing v2 rows over (no data is lost before the contract step)
--    - the free-text university becomes a custom institution
--    - the team email becomes the contact email
-- 3. Then stop requiring the columns the v3 API no longer writes.
--
-- Everything here is guarded on the column still existing, so this file stays
-- re-runnable even after the contract step has dropped them.
-- ---------------------------------------------------------------------------
do $$
declare
  has_column boolean;
begin
  select count(*) = 4 into has_column
    from information_schema.columns
   where table_schema = 'public' and table_name = 'aivex_registrations'
     and column_name in ('university', 'leader_name', 'team_email', 'member_count');

  if has_column then
    update public.aivex_registrations
       set institution_id = coalesce(institution_id, 'other'),
           institution_name = coalesce(institution_name, university),
           institution_custom = true
     where institution_name is null
       and university is not null;

    update public.aivex_registrations
       set activity_official_email = team_email
     where activity_official_email is null
       and team_email is not null;

    update public.aivex_registrations
       set student_count = member_count
     where member_count is not null;

    alter table public.aivex_registrations
      alter column university drop not null,
      alter column leader_name drop not null,
      alter column team_email drop not null,
      alter column member_count drop not null;
  else
    raise notice 'v2 columns already removed: backfill skipped.';
  end if;

  -- 'leader' / 'member' is gone: every row in aivex_members is a student.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'aivex_members' and column_name = 'role'
  ) then
    alter table public.aivex_members alter column role drop not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Drop the v2 CHECK constraints, whatever name they were created with
--    (team size, form version, member role, member position).
-- ---------------------------------------------------------------------------
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conrelid::regclass::text as table_name, conname
      from pg_constraint
     where conrelid in ('public.aivex_registrations'::regclass, 'public.aivex_members'::regclass)
       and contype = 'c'
       and (pg_get_constraintdef(oid) ilike '%form_version%'
         or pg_get_constraintdef(oid) ilike '%member_count%'
         or pg_get_constraintdef(oid) ilike '%role%'
         or pg_get_constraintdef(oid) ilike '%position%')
  loop
    execute format('alter table %s drop constraint %I', constraint_row.table_name, constraint_row.conname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. New shape rules. Every check tolerates NULL so the expand step can run
--    before the v3 API is deployed; completeness is enforced per form version
--    by aivex_registrations_v3_required_check.
-- ---------------------------------------------------------------------------
alter table public.aivex_registrations
  drop constraint if exists aivex_registrations_form_version_check,
  drop constraint if exists aivex_registrations_wilaya_code_check,
  drop constraint if exists aivex_registrations_institution_check,
  drop constraint if exists aivex_registrations_activity_role_check,
  drop constraint if exists aivex_registrations_activity_email_check,
  drop constraint if exists aivex_registrations_phones_check,
  drop constraint if exists aivex_registrations_national_ids_check,
  drop constraint if exists aivex_registrations_student_count_check,
  drop constraint if exists aivex_registrations_v3_required_check;

alter table public.aivex_registrations
  add constraint aivex_registrations_form_version_check
    check (form_version between 1 and 3),

  add constraint aivex_registrations_wilaya_code_check
    check (wilaya_code is null or wilaya_code ~ '^(0[1-9]|[1-4][0-9]|5[0-8])$'),

  -- 'other' and the free-text flag always travel together.
  add constraint aivex_registrations_institution_check
    check (
      institution_id is null
      or (
        institution_id ~ '^[a-z0-9-]{2,60}$'
        and (institution_id = 'other') = institution_custom
        and institution_name is not null
        and char_length(institution_name) between 2 and 180
      )
    ),

  add constraint aivex_registrations_activity_role_check
    check (activity_official_role is null
           or activity_official_role in ('sub_director_activities', 'activities_officer')),

  -- Stored lowercase by the API; the pattern is a sanity check, not an RFC.
  add constraint aivex_registrations_activity_email_check
    check (activity_official_email is null
           or (activity_official_email = lower(activity_official_email)
               and activity_official_email like '%_@_%.__%'
               and char_length(activity_official_email) <= 254)),

  -- Phones arrive normalised: optional '+', then 9 to 15 digits.
  add constraint aivex_registrations_phones_check
    check (
      (activity_official_phone is null or activity_official_phone ~ '^\+?[0-9]{9,15}$')
      and (delegation_head_phone is null or delegation_head_phone ~ '^\+?[0-9]{9,15}$')
      and (driver_phone is null or driver_phone ~ '^\+?[0-9]{9,15}$')
    ),

  add constraint aivex_registrations_national_ids_check
    check (
      (delegation_head_national_id is null or delegation_head_national_id ~ '^[A-Za-z0-9]{6,20}$')
      and (driver_national_id is null or driver_national_id ~ '^[A-Za-z0-9]{6,20}$')
    ),

  -- Official rule from v3 on: a team is exactly three students. Older rows
  -- keep whatever team size they were submitted with.
  add constraint aivex_registrations_student_count_check
    check (form_version < 3 or student_count = 3),

  -- A v3 row is complete or it is not written at all.
  add constraint aivex_registrations_v3_required_check
    check (
      form_version < 3
      or (
        wilaya_code is not null and wilaya_name is not null
        and institution_id is not null and institution_name is not null
        and activity_official_role is not null and activity_official_name is not null
        and activity_official_email is not null and activity_official_phone is not null
        and delegation_head_name is not null and delegation_head_phone is not null
        and delegation_head_national_id is not null
        and driver_name is not null and driver_phone is not null
        and driver_national_id is not null
      )
    );

-- ---------------------------------------------------------------------------
-- 6. Students: positions are now 1..3 and unique inside a registration.
--    Added NOT VALID so a legacy team of four cannot block the migration,
--    then validated automatically when the table is already clean.
-- ---------------------------------------------------------------------------
alter table public.aivex_members
  drop constraint if exists aivex_members_position_check,
  drop constraint if exists aivex_members_study_level_check,
  drop constraint if exists aivex_members_registration_number_check,
  drop constraint if exists aivex_members_phone_check;

alter table public.aivex_members
  add constraint aivex_members_position_check
    check (position between 1 and 3) not valid,
  add constraint aivex_members_study_level_check
    check (study_level in ('Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2',
                           'Engineering cycle', 'Doctorate', 'Other')) not valid,
  add constraint aivex_members_registration_number_check
    check (registration_number ~ '^[0-9]{6,20}$') not valid,
  add constraint aivex_members_phone_check
    check (phone ~ '^\+?[0-9]{9,15}$') not valid;

do $$
declare
  constraint_name text;
begin
  foreach constraint_name in array array[
    'aivex_members_position_check',
    'aivex_members_study_level_check',
    'aivex_members_registration_number_check',
    'aivex_members_phone_check'
  ] loop
    begin
      execute format('alter table public.aivex_members validate constraint %I', constraint_name);
    exception when check_violation then
      raise notice 'Legacy rows do not satisfy % — left NOT VALID (new rows are still checked).', constraint_name;
    end;
  end loop;
end $$;

create unique index if not exists aivex_members_registration_position_uidx
  on public.aivex_members (registration_id, position);

comment on table public.aivex_members is
  'The three students of a registration. Head of delegation and driver are NOT students: they live on aivex_registrations.';

-- ---------------------------------------------------------------------------
-- 7. Organiser lookups: teams per wilaya / institution.
-- ---------------------------------------------------------------------------
create index if not exists aivex_registrations_wilaya_idx
  on public.aivex_registrations (edition, wilaya_code, institution_id);

commit;

-- RLS is row-level: the new columns are covered by the existing policies and
-- nothing needs to be granted. Keep the anon key away from both tables.
