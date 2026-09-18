-- AIVEX registration — Data Contract V4 (form_version = 4). PREPARATORY.
--
-- !! DO NOT RUN AUTOMATICALLY. Review it, apply it on a staging project
-- !! first, then by hand in the Supabase SQL editor when the v4 write path
-- !! (Phase 2) is ready. See docs/aivex-data-contract-v4.md.
--
-- Additive and non-destructive: no table, column or row is dropped. Only two
-- rules are RELAXED, and only for v4 rows:
--   - delegation_head_national_id / driver_national_id lose NOT NULL
--     (v4 never collects national ID numbers; v3 rows still require them
--     through aivex_registrations_v3_required_check);
--   - the unique "one registration per contact e-mail and edition" index is
--     replaced by the same index restricted to form_version < 4 (one
--     activities official may register several teams in v4).
--
-- Compatible with the form v3 API currently deployed: every new rule is
-- scoped to form_version >= 4 or to the new tables, and every new column has
-- a default, so v3 inserts behave exactly as before.
--
-- What V4 adds:
--   aivex_registrations  submission_id (idempotency, UNIQUE),
--                        delegation_head_rfid, driver_rfid,
--                        registration_status, document_status,
--                        current_form_revision, template_version, updated_at
--   aivex_students       NEW: the three students of a v4 registration
--                        (bac_year, rfid_number, private student card).
--                        aivex_members stays as the legacy v1-v3 table.
--   aivex_settings       NEW: one row per edition (dates, template, switches)
--   storage              bucket aivex-student-cards guaranteed PRIVATE
--
-- Prerequisites (already applied in production):
--   20260917200000_aivex_registration_v3_expand.sql
--   20260917200050_aivex_members_v3_trigger.sql
--   20260917200100_aivex_registration_v3_contract.sql
--
-- Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 0. Shared helper: updated_at is maintained by the database.
-- ---------------------------------------------------------------------------
create or replace function public.aivex_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. aivex_registrations — new columns (all nullable or defaulted).
-- ---------------------------------------------------------------------------
alter table public.aivex_registrations
  add column if not exists submission_id uuid,
  add column if not exists delegation_head_rfid text,
  add column if not exists driver_rfid text,
  add column if not exists document_status text not null default 'not_generated',
  add column if not exists current_form_revision smallint not null default 0,
  add column if not exists template_version text;

-- registration_status and updated_at get a one-shot backfill the first time
-- they are added, so a re-run never overwrites later changes.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'aivex_registrations'
       and column_name = 'registration_status'
  ) then
    alter table public.aivex_registrations
      add column registration_status text not null default 'submitted';

    -- Carry over legacy statuses that already mean the same thing. Anything
    -- else ('pending', ...) starts as 'submitted'. The legacy column stays.
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'aivex_registrations'
         and column_name = 'status'
    ) then
      execute $sql$
        update public.aivex_registrations
           set registration_status = status::text
         where status::text in ('submitted', 'under_review', 'approved', 'rejected', 'cancelled')
      $sql$;
    end if;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'aivex_registrations'
       and column_name = 'updated_at'
  ) then
    alter table public.aivex_registrations
      add column updated_at timestamptz not null default now();

    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'aivex_registrations'
         and column_name = 'created_at'
    ) then
      execute 'update public.aivex_registrations set updated_at = created_at where created_at is not null';
    end if;
  end if;
end $$;

-- v4 rows never carry a national ID number (v3 rows keep requiring one).
alter table public.aivex_registrations
  alter column delegation_head_national_id drop not null,
  alter column driver_national_id drop not null;

-- ---------------------------------------------------------------------------
-- 2. aivex_registrations — rules. The v3 rule is re-created identical for
--    form_version 1..3 (it used to say "form_version < 3 or ...", which would
--    also have caught v4 rows).
-- ---------------------------------------------------------------------------
alter table public.aivex_registrations
  drop constraint if exists aivex_registrations_form_version_check,
  drop constraint if exists aivex_registrations_v3_required_check,
  drop constraint if exists aivex_registrations_rfids_check,
  drop constraint if exists aivex_registrations_registration_status_check,
  drop constraint if exists aivex_registrations_document_status_check,
  drop constraint if exists aivex_registrations_form_revision_check,
  drop constraint if exists aivex_registrations_template_version_check,
  drop constraint if exists aivex_registrations_v4_required_check;

alter table public.aivex_registrations
  add constraint aivex_registrations_form_version_check
    check (form_version between 1 and 4),

  add constraint aivex_registrations_v3_required_check
    check (
      form_version <> 3
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
    ),

  -- RFID: text on purpose (leading zeros), trimmed, 1..64 characters, no
  -- control characters. No business format has been confirmed yet.
  add constraint aivex_registrations_rfids_check
    check (
      (delegation_head_rfid is null
        or (char_length(delegation_head_rfid) between 1 and 64
            and delegation_head_rfid = btrim(delegation_head_rfid)
            and delegation_head_rfid !~ '[[:cntrl:]]'))
      and (driver_rfid is null
        or (char_length(driver_rfid) between 1 and 64
            and driver_rfid = btrim(driver_rfid)
            and driver_rfid !~ '[[:cntrl:]]'))
    ),

  add constraint aivex_registrations_registration_status_check
    check (registration_status in ('submitted', 'under_review', 'approved', 'rejected', 'cancelled')),

  add constraint aivex_registrations_document_status_check
    check (document_status in ('not_generated', 'generating', 'awaiting_signature', 'signed_document_uploaded',
                               'under_review', 'changes_required', 'validated', 'generation_failed', 'expired')),

  add constraint aivex_registrations_form_revision_check
    check (current_form_revision >= 0),

  add constraint aivex_registrations_template_version_check
    check (template_version is null or char_length(template_version) between 1 and 64),

  -- A v4 row is complete or it is not written at all. The existing checks
  -- (wilaya, institution, role, e-mail, phones, student_count = 3) already
  -- apply to v4 rows as they are.
  add constraint aivex_registrations_v4_required_check
    check (
      form_version < 4
      or (
        submission_id is not null
        and submitted_at is not null
        and consent is true
        and student_count = 3
        and wilaya_code is not null and wilaya_name is not null
        and institution_id is not null and institution_name is not null
        and activity_official_role is not null and activity_official_name is not null
        and activity_official_email is not null and activity_official_phone is not null
        and delegation_head_name is not null and delegation_head_phone is not null
        and delegation_head_rfid is not null
        and driver_name is not null and driver_phone is not null
        and driver_rfid is not null
        -- v4 never collects national ID numbers.
        and delegation_head_national_id is null
        and driver_national_id is null
      )
    );

-- ---------------------------------------------------------------------------
-- 3. aivex_registrations — keys and indexes.
-- ---------------------------------------------------------------------------

-- Idempotency: one registration per browser submission. NULL for legacy rows
-- (NULLs never collide). Non-partial on purpose: usable by ON CONFLICT.
create unique index if not exists aivex_registrations_submission_id_uidx
  on public.aivex_registrations (submission_id);

-- The contact e-mail is NOT unique in v4. The v3 rule is kept for v3 rows
-- only (the name still contains "contact", which the v3 API relies on to
-- word its 409 message). Created before the old index is dropped: no gap.
create unique index if not exists aivex_registrations_edition_contact_v3_uidx
  on public.aivex_registrations (edition, lower(activity_official_email))
  where form_version < 4;

drop index if exists public.aivex_registrations_edition_contact_uidx;

-- The public reference must be unique. Added only if no unique index on
-- (reference) exists yet, whatever its name.
do $$
begin
  if not exists (
    select 1
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
     where i.indrelid = 'public.aivex_registrations'::regclass
       and i.indisunique
       and i.indnkeyatts = 1
       and i.indpred is null
       and a.attname = 'reference'
  ) then
    create unique index aivex_registrations_reference_uidx
      on public.aivex_registrations (reference);
  end if;
end $$;

-- Organiser work queues.
create index if not exists aivex_registrations_status_idx
  on public.aivex_registrations (edition, registration_status, document_status);

drop trigger if exists aivex_registrations_touch_updated_at on public.aivex_registrations;
create trigger aivex_registrations_touch_updated_at
  before update on public.aivex_registrations
  for each row execute function public.aivex_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. aivex_registrations — field status (legacy / v4).
-- ---------------------------------------------------------------------------
comment on column public.aivex_registrations.submission_id is
  'V4 idempotency key: UUID v4 generated once per submission by the browser. A retry with the same value returns the existing registration. NULL for v1-v3 rows.';
comment on column public.aivex_registrations.reference is
  'Public / administrative reference. Server-generated only (target v4 format AX{edition}-{yy}-{8 hex}); the browser never chooses it.';
comment on column public.aivex_registrations.delegation_head_rfid is
  'V4 — RFID of the head of delegation. Text (leading zeros kept), 1-64 chars. Replaces delegation_head_national_id.';
comment on column public.aivex_registrations.driver_rfid is
  'V4 — RFID of the driver. Text (leading zeros kept), 1-64 chars. Replaces driver_national_id.';
comment on column public.aivex_registrations.delegation_head_national_id is
  'DEPRECATED (form v3 only) — PERSONAL DATA. Always NULL for v4 rows; replaced by delegation_head_rfid. Kept for existing v3 rows.';
comment on column public.aivex_registrations.driver_national_id is
  'DEPRECATED (form v3 only) — PERSONAL DATA. Always NULL for v4 rows; replaced by driver_rfid. Kept for existing v3 rows.';
comment on column public.aivex_registrations.activity_official_email is
  'Activity administration contact e-mail, stored lowercase. NOT unique in v4: one official may register several teams.';
comment on column public.aivex_registrations.registration_status is
  'submitted | under_review | approved | rejected | cancelled. Server-owned.';
comment on column public.aivex_registrations.document_status is
  'Official document workflow: not_generated | generating | awaiting_signature | signed_document_uploaded | under_review | changes_required | validated | generation_failed | expired. Server-owned.';
comment on column public.aivex_registrations.current_form_revision is
  'Revision of the generated official document (0 = never generated).';
comment on column public.aivex_registrations.template_version is
  'Version of the Word template used for the current document revision.';

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'aivex_registrations'
       and column_name = 'status'
  ) then
    comment on column public.aivex_registrations.status is
      'LEGACY (form v1-v3 API). Superseded by registration_status for the v4 workflow.';
  end if;
end $$;

comment on table public.aivex_members is
  'LEGACY (form v1-v3): the students of v1-v3 registrations. Form v4 writes public.aivex_students instead. Kept read-only in intent; not dropped.';

-- ---------------------------------------------------------------------------
-- 5. aivex_students — the three students of a v4 registration.
-- ---------------------------------------------------------------------------
create table if not exists public.aivex_students (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null
    references public.aivex_registrations (id) on delete cascade,
  -- Copied from the parent registration by trigger (server-authoritative).
  edition smallint not null,
  position smallint not null,
  full_name text not null,
  phone text not null,
  bac_year smallint not null,
  rfid_number text not null,
  -- INTERNAL VERIFICATION DATA: private Storage object, never printed.
  student_card_path text not null,
  student_card_mime text not null,
  student_card_size_bytes bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint aivex_students_position_check
    check (position between 1 and 3),
  constraint aivex_students_registration_position_key
    unique (registration_id, position),
  -- Three different students inside one registration. Uniqueness across a
  -- whole edition (edition, rfid_number) is NOT imposed: open business decision.
  constraint aivex_students_registration_rfid_key
    unique (registration_id, rfid_number),
  constraint aivex_students_full_name_check
    check (char_length(full_name) between 3 and 120),
  constraint aivex_students_phone_check
    check (phone ~ '^\+?[0-9]{9,15}$'),
  -- Static sanity bounds; the upper bound "current year + 1" is dynamic and
  -- enforced by the API and by aivex_students_before_write().
  constraint aivex_students_bac_year_check
    check (bac_year between 1990 and 2100),
  constraint aivex_students_rfid_check
    check (char_length(rfid_number) between 1 and 64
           and rfid_number = btrim(rfid_number)
           and rfid_number !~ '[[:cntrl:]]'),
  constraint aivex_students_card_mime_check
    check (student_card_mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint aivex_students_card_size_check
    check (student_card_size_bytes between 1 and 5242880),
  -- Deterministic private path: a card can only belong to its own student.
  constraint aivex_students_card_path_check
    check (student_card_path = registration_id::text || '/student-' || position::text || '.'
           || case student_card_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end)
);

comment on table public.aivex_students is
  'Form v4: exactly three students per registration (positions 1-3). Replaces the legacy aivex_members for v4. student_card_* is internal verification data (private bucket aivex-student-cards), never printed.';
comment on column public.aivex_students.rfid_number is
  'Student RFID. Text (leading zeros kept), 1-64 chars, unique inside the registration.';
comment on column public.aivex_students.student_card_path is
  'Path inside the PRIVATE bucket aivex-student-cards: {registration_id}/student-{position}.{ext}. Read through short-lived signed URLs from the backend only; never a public URL.';

-- Edition from the parent; only v4 registrations; BAC year not in the future.
create or replace function public.aivex_students_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent record;
begin
  select r.edition, r.form_version into parent
    from public.aivex_registrations r
   where r.id = new.registration_id;

  if not found then
    raise exception 'Unknown registration for this student.' using errcode = '23503';
  end if;
  if parent.form_version < 4 then
    raise exception 'aivex_students only holds form v4 registrations (v1-v3 students live in aivex_members).'
      using errcode = '23514';
  end if;
  if new.bac_year > extract(year from now())::int + 1 then
    raise exception 'The BAC year cannot be later than next year.' using errcode = '23514';
  end if;

  new.edition := parent.edition;
  return new;
end;
$$;

drop trigger if exists aivex_students_before_write on public.aivex_students;
create trigger aivex_students_before_write
  before insert or update on public.aivex_students
  for each row execute function public.aivex_students_before_write();

-- Exactly three students, checked at COMMIT: a registration has 0 students
-- (not written yet / being cleaned up) or 3. The API must therefore insert
-- the three rows in one statement (or one transaction).
create or replace function public.aivex_students_team_size_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  targets uuid[] := '{}';
  target uuid;
  total integer;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    targets := targets || new.registration_id;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    targets := targets || old.registration_id;
  end if;

  foreach target in array targets loop
    select count(*) into total from public.aivex_students where registration_id = target;
    if total not in (0, 3) then
      raise exception 'A v4 registration has exactly 3 students (found %).', total using errcode = '23514';
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists aivex_students_team_size on public.aivex_students;
create constraint trigger aivex_students_team_size
  after insert or update of registration_id or delete on public.aivex_students
  deferrable initially deferred
  for each row execute function public.aivex_students_team_size_check();

drop trigger if exists aivex_students_touch_updated_at on public.aivex_students;
create trigger aivex_students_touch_updated_at
  before update on public.aivex_students
  for each row execute function public.aivex_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. aivex_settings — one row per edition (used from Phase 2 on).
-- ---------------------------------------------------------------------------
create table if not exists public.aivex_settings (
  edition smallint primary key,
  edition_name text not null,
  event_start_date date,
  event_end_date date,
  submission_deadline timestamptz,
  submission_email text,
  template_version text,
  registration_open_at timestamptz,
  registration_close_at timestamptz,
  signed_document_deadline timestamptz,
  registration_enabled boolean not null default false,
  document_upload_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint aivex_settings_edition_check
    check (edition > 0),
  constraint aivex_settings_edition_name_check
    check (char_length(edition_name) between 1 and 200),
  constraint aivex_settings_event_dates_check
    check (event_start_date is null or event_end_date is null or event_end_date >= event_start_date),
  constraint aivex_settings_registration_window_check
    check (registration_open_at is null or registration_close_at is null or registration_close_at > registration_open_at),
  constraint aivex_settings_submission_email_check
    check (submission_email is null
           or (submission_email = lower(submission_email)
               and submission_email like '%_@_%.__%'
               and char_length(submission_email) <= 254)),
  constraint aivex_settings_template_version_check
    check (template_version is null or char_length(template_version) between 1 and 64)
);

comment on table public.aivex_settings is
  'One row per AIVEX edition: official dates, submission deadline and e-mail, Word template version, feature switches. Server-side only. Rows are created deliberately by the organisers (no seed).';

drop trigger if exists aivex_settings_touch_updated_at on public.aivex_settings;
create trigger aivex_settings_touch_updated_at
  before update on public.aivex_settings
  for each row execute function public.aivex_touch_updated_at();

-- No seed on purpose: the official values (name as printed, dates, e-mail)
-- must come from the organisers. Template for later:
--   insert into public.aivex_settings (edition, edition_name, template_version)
--   values (2, '<official edition name>', '<template version>')
--   on conflict (edition) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Row level security: service role only. No policy is created, so anon
--    and authenticated see nothing; the API uses the secret key server-side.
--    Future admin reads go through the backend, not the browser.
-- ---------------------------------------------------------------------------
alter table public.aivex_registrations enable row level security;
alter table public.aivex_members enable row level security;
alter table public.aivex_students enable row level security;
alter table public.aivex_settings enable row level security;

revoke all on table public.aivex_students from anon, authenticated;
revoke all on table public.aivex_settings from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Storage: the student card bucket is PRIVATE. Created if missing; if it
--    exists, only `public` is forced back to false (its other settings are
--    left as they are). No storage policy is added: anon/authenticated get
--    no access, the service role uploads, admins will read through
--    short-lived signed URLs issued by the backend.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aivex-student-cards', 'aivex-student-cards', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

commit;

-- Check the result (read-only):
--
--   -- The bucket must be private.
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'aivex-student-cards';
--
--   -- No storage policy may open the bucket to anon/authenticated (expected: 0 rows).
--   select policyname, roles, cmd
--     from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and (coalesce(qual, '') ilike '%aivex-student-cards%'
--           or coalesce(with_check, '') ilike '%aivex-student-cards%');
--
--   -- Policies on the AIVEX tables (expected: 0 rows).
--   select tablename, policyname, roles, cmd
--     from pg_policies where schemaname = 'public' and tablename like 'aivex\_%';
--
--   -- Constraints now active on aivex_registrations.
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.aivex_registrations'::regclass
--    order by conname;
--
--   -- Current reference generator (to confirm the v4 reference strategy).
--   select column_default from information_schema.columns
--    where table_schema = 'public' and table_name = 'aivex_registrations'
--      and column_name = 'reference';
--   select tgname, pg_get_triggerdef(t.oid)
--     from pg_trigger t
--    where tgrelid = 'public.aivex_registrations'::regclass and not tgisinternal;
