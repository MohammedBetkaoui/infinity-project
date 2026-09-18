-- AIVEX registration — form v3: replace the v2 trigger on aivex_members.
--
-- Symptom: after the contract step dropped aivex_members.role, every student
-- insert fails with 42703 'record "new" has no field "role"'. The API then
-- rolls the whole registration back and answers 500.
--
-- Order in a fresh replay: after _v3_expand.sql, before _v3_contract.sql.
-- It also works after the contract step (that is how it was first applied).
--
-- What it does:
--   1. Unbinds every trigger on aivex_members whose function reads NEW.role
--      or OLD.role. The functions themselves are NOT dropped: their code stays
--      in the database for reference (listed by the query at the end).
--   2. Installs the v3 trigger: edition is copied from the parent
--      registration (the API never sends it, the column is NOT NULL).
--      Positions 1..3 and one row per position are already enforced by
--      aivex_members_position_check and aivex_members_registration_position_uidx.
--
-- Safe to run more than once.

begin;

-- 1. Unbind the v2 role trigger(s).
do $$
declare
  trigger_row record;
begin
  for trigger_row in
    select t.tgname, p.oid::regprocedure::text as function_name
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'public.aivex_members'::regclass
       and not t.tgisinternal
       and p.prosrc ~* '\m(new|old)\.role\M'
  loop
    execute format('drop trigger %I on public.aivex_members', trigger_row.tgname);
    raise notice 'Trigger % dropped (function % kept for reference).', trigger_row.tgname, trigger_row.function_name;
  end loop;
end $$;

-- 2. v3 trigger: a student always carries the edition of its registration.
create or replace function public.aivex_members_v3_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_edition smallint;
begin
  select r.edition into parent_edition
    from public.aivex_registrations r
   where r.id = new.registration_id;

  if parent_edition is null then
    raise exception 'Unknown registration for this student.' using errcode = '23503';
  end if;

  new.edition := parent_edition;
  return new;
end;
$$;

comment on function public.aivex_members_v3_before_write() is
  'AIVEX v3: copies edition from the parent registration. No role logic: every aivex_members row is a student.';

drop trigger if exists aivex_members_v3_before_write on public.aivex_members;
create trigger aivex_members_v3_before_write
  before insert or update of registration_id on public.aivex_members
  for each row execute function public.aivex_members_v3_before_write();

commit;

-- 3. Result: the triggers now active on aivex_members, and the unbound v2
--    function(s) still present for reference.
select 'active trigger' as kind, t.tgname as name, p.proname as function_name
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.aivex_members'::regclass
   and not t.tgisinternal
union all
select 'unbound v2 function', null, p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosrc ~* '\m(new|old)\.role\M'
   and not exists (select 1 from pg_trigger t where t.tgfoid = p.oid)
 order by 1, 2;
