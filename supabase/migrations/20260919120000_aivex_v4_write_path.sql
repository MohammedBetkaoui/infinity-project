-- AIVEX registration — form v4 WRITE PATH (Phase 2).
--
-- Complements 20260918120000_aivex_v4_contract.sql. Apply both, in order,
-- BEFORE deploying the v4 api/aivex/register.js: that API writes the columns
-- and the table created by these two files.
--
-- Additive and non-destructive: no table, column or row is dropped, and the
-- v3 API still deployed during the switch keeps working (every new column
-- has a default, every new rule is scoped to form_version >= 4 or to
-- aivex_students, which v3 never touches).
--
--   1. submission_fingerprint — SHA-256 of the validated answers. A replayed
--      submissionId with DIFFERENT answers is answered 409 instead of being
--      merged into the existing registration.
--   2. submission_id — target schema is NOT NULL UNIQUE: DEFAULT
--      gen_random_uuid(), legacy (v1-v3) rows backfilled with a random value
--      (no browser ever sent one, so it can never match a replay), then
--      NOT NULL. The default covers v3 inserts during the switch.
--   3. form_version — DEFAULT 4 (the API always sends it explicitly).
--   4. Student card path carries the edition:
--        edition-{edition}/{registration_id}/student-{position}.{ext}
--   5. Explicit rights for the service role on the v4 tables.
--
-- Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 1. Idempotency fingerprint
-- ---------------------------------------------------------------------------
alter table public.aivex_registrations
  add column if not exists submission_fingerprint text;

alter table public.aivex_registrations
  drop constraint if exists aivex_registrations_submission_fingerprint_check,
  drop constraint if exists aivex_registrations_v4_fingerprint_check;

alter table public.aivex_registrations
  add constraint aivex_registrations_submission_fingerprint_check
    check (submission_fingerprint is null or submission_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint aivex_registrations_v4_fingerprint_check
    check (form_version < 4 or submission_fingerprint is not null);

comment on column public.aivex_registrations.submission_fingerprint is
  'V4 — SHA-256 (hex) of the validated answers of the submission. Same submission_id + same fingerprint = idempotent replay; different fingerprint = 409.';

-- ---------------------------------------------------------------------------
-- 2. submission_id NOT NULL (UNIQUE already: aivex_registrations_submission_id_uidx)
-- ---------------------------------------------------------------------------
alter table public.aivex_registrations
  alter column submission_id set default gen_random_uuid();

update public.aivex_registrations
   set submission_id = gen_random_uuid()
 where submission_id is null;

alter table public.aivex_registrations
  alter column submission_id set not null;

-- ---------------------------------------------------------------------------
-- 3. form_version default
-- ---------------------------------------------------------------------------
alter table public.aivex_registrations
  alter column form_version set default 4;

-- ---------------------------------------------------------------------------
-- 4. Card path with the edition prefix. aivex_students is still empty before
--    the v4 API goes live; NOT VALID + VALIDATE keeps the file safe anyway.
-- ---------------------------------------------------------------------------
alter table public.aivex_students
  drop constraint if exists aivex_students_card_path_check;

alter table public.aivex_students
  add constraint aivex_students_card_path_check
    check (student_card_path = 'edition-' || edition::text || '/' || registration_id::text
           || '/student-' || position::text || '.'
           || case student_card_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end)
    not valid;

do $$
begin
  alter table public.aivex_students validate constraint aivex_students_card_path_check;
exception when check_violation then
  raise notice 'Existing aivex_students rows use the old card path: constraint left NOT VALID (new rows are checked).';
end $$;

comment on column public.aivex_students.student_card_path is
  'Path inside the PRIVATE bucket aivex-student-cards: edition-{edition}/{registration_id}/student-{position}.{ext}. Read through short-lived signed URLs from the backend only; never a public URL.';

-- ---------------------------------------------------------------------------
-- 5. Rights: the API uses the service role; anon/authenticated get nothing.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on table public.aivex_registrations to service_role;
grant select, insert, update, delete on table public.aivex_students to service_role;
grant select, insert, update, delete on table public.aivex_settings to service_role;
revoke all on table public.aivex_students from anon, authenticated;
revoke all on table public.aivex_settings from anon, authenticated;

commit;

-- Check the result (read-only):
--   select column_name, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'aivex_registrations'
--      and column_name in ('submission_id', 'submission_fingerprint', 'form_version', 'reference');
--   select conname, convalidated from pg_constraint
--    where conrelid = 'public.aivex_students'::regclass and conname = 'aivex_students_card_path_check';
