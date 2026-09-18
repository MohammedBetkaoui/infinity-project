-- AIVEX registration — form v3, STEP 2 of 2: CONTRACT.
--
-- Run this ONLY after:
--   1. 20260917200000_aivex_registration_v3_expand.sql has been applied, and
--   2. the v3 api/aivex/register.js is deployed (it must no longer write
--      team_email / university / leader_name / member_count / role).
--
-- Running it earlier breaks every submission served by the v2 function.
--
-- Safe to run more than once. Not reversible: the dropped columns are the
-- v2 model (team leader, free-text university, team email). The expand step
-- already copied university -> institution_name and team_email ->
-- activity_official_email; leader_name has no v3 equivalent and is lost.

begin;

-- 0. Pre-flight. Dropping a column does not break a trigger function at DDL
--    time — it breaks it at the next INSERT. Refuse to run if one of them
--    still reads the v2 columns (e.g. a trigger maintaining member_count).
do $$
declare
  offenders text;
begin
  select string_agg(distinct p.proname, ', ') into offenders
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_class c on c.oid = t.tgrelid
   where c.relname in ('aivex_registrations', 'aivex_members')
     and not t.tgisinternal
     and (p.prosrc ilike '%member_count%'
       or p.prosrc ilike '%team_email%'
       or p.prosrc ilike '%leader_name%'
       or p.prosrc ilike '%university%'
       -- NEW.role / OLD.role only, so 'service_role' is not a false positive.
       or p.prosrc ~* '\m(new|old)\.role\M');
  if offenders is not null then
    raise exception 'Trigger function(s) % still reference the v2 columns. Update them first.', offenders;
  end if;
end $$;

-- 1. The team leader, the free-text university and the team mailbox are gone.
--    Dropping team_email also drops aivex_registrations_edition_email_uidx.
alter table public.aivex_registrations
  drop column if exists leader_name,
  drop column if exists university,
  drop column if exists team_email,
  drop column if exists member_count;

-- 2. Every aivex_members row is a student now.
alter table public.aivex_members
  drop column if exists role;

-- 3. The duplicate key moves to the activity administration contact.
--    One contact e-mail = one team per edition, which is what the API
--    reports as a 409 "A registration using this email already exists".
--    If an administration is allowed to enter several teams, drop this
--    index and rely on the per-student registration number uniqueness only.
create unique index if not exists aivex_registrations_edition_contact_uidx
  on public.aivex_registrations (edition, lower(activity_official_email));

-- 4. Now that no legacy column is left, the v3 fields can be mandatory.
--    (The CHECK added in the expand step already enforces this per form
--    version; these NOT NULLs are the stronger, final state.)
do $$
begin
  if not exists (
    select 1 from public.aivex_registrations
     where wilaya_code is null or institution_id is null
        or activity_official_email is null or delegation_head_name is null
        or driver_name is null
  ) then
    alter table public.aivex_registrations
      alter column wilaya_code set not null,
      alter column wilaya_name set not null,
      alter column institution_id set not null,
      alter column institution_name set not null,
      alter column activity_official_role set not null,
      alter column activity_official_name set not null,
      alter column activity_official_email set not null,
      alter column activity_official_phone set not null,
      alter column delegation_head_name set not null,
      alter column delegation_head_phone set not null,
      alter column delegation_head_national_id set not null,
      alter column driver_name set not null,
      alter column driver_phone set not null,
      alter column driver_national_id set not null;
  else
    raise notice 'Rows with missing v3 fields remain: NOT NULL not applied. Fix them, then re-run this file.';
  end if;
end $$;

commit;

-- Check the result:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'aivex_registrations'
--    order by ordinal_position;
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.aivex_registrations'::regclass and contype = 'c';
