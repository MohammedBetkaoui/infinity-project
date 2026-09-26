-- AIVEX per-item correction resubmission — data model.
--
-- Until now, a correction request (aivex_correction_requests) was one
-- atomic blob: a list of item labels, a deadline, a message. Nothing
-- tracked whether the team had actually fixed any ONE of them, and the only
-- way the row ever got resolved was full final file acceptance
-- (admin_apply_aivex_action's validate_file branch, or
-- admin_accept_aivex_team). This migration adds per-item tracking so each
-- requested item can move open -> submitted -> verified on its own, and lets
-- the candidate resubmit a fix through the Magic Link for the first time.
--
-- Prerequisite: 20260927130000_fix_admin_aivex_document_actions.sql,
-- 20260924120000_aivex_direct_upload_sessions_and_retention.sql.
--
-- Additive only. No existing table, column, row, constraint or bucket is
-- dropped or rewritten; aivex_upload_sessions gains one new allowed `kind`
-- value alongside its two existing ones.

begin;

-- ---------------------------------------------------------------------------
-- 1. aivex_correction_items — one row per item of a correction request.
-- ---------------------------------------------------------------------------
create table if not exists public.aivex_correction_items (
  id uuid primary key default gen_random_uuid(),
  correction_request_id uuid not null
    references public.aivex_correction_requests (id) on delete cascade,
  -- Denormalized from the parent request, same convention as
  -- aivex_students.edition: simple queries/RLS without a join, and every
  -- row of one correction request always shares one registration anyway.
  registration_id uuid not null
    references public.aivex_registrations (id) on delete cascade,
  item text not null,
  kind text not null,
  status text not null default 'open',
  -- 'field' items only: the new values the team proposed (validated shape
  -- mirrors shared/aivex/contract-v4.js's team/activityOfficial payloads).
  submitted_fields jsonb,
  -- 'document' items only: the document_key the resubmitted file now lives
  -- under (student-1..3, delegation-leader, driver, or signed-vN).
  submitted_document_key text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_admin_user_id uuid
    references public.admin_users (id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),

  constraint aivex_correction_items_item_check
    check (item in (
      'Team information', 'Activities manager', 'Delegation leader ID', 'Driver ID',
      'Student card 01', 'Student card 02', 'Student card 03', 'Signed and stamped form'
    )),
  constraint aivex_correction_items_kind_check
    check (kind in ('field', 'document')),
  constraint aivex_correction_items_status_check
    check (status in ('open', 'submitted', 'verified')),
  constraint aivex_correction_items_submission_shape_check
    check (
      (status = 'open' and submitted_fields is null and submitted_document_key is null and submitted_at is null)
      or (status in ('submitted', 'verified') and submitted_at is not null
          and (submitted_fields is not null) != (submitted_document_key is not null))
    ),
  constraint aivex_correction_items_fields_size_check
    check (submitted_fields is null or octet_length(submitted_fields::text) <= 2048),
  constraint aivex_correction_items_document_key_check
    check (submitted_document_key is null
           or submitted_document_key ~ '^(student-[1-3]|delegation-leader|driver|signed-v[1-9][0-9]*)$'),
  -- A verified item must record who verified it and when. An 'open' item may
  -- also already carry a review (a previously rejected attempt, kept as
  -- context for the admin UI even after the row resets for another try) —
  -- so this only constrains the 'verified' direction, not its converse.
  constraint aivex_correction_items_review_check
    check (status <> 'verified' or (reviewed_at is not null and reviewed_by_admin_user_id is not null)),
  constraint aivex_correction_items_note_check
    check (review_note is null or char_length(review_note) between 1 and 2000),
  constraint aivex_correction_items_request_item_key
    unique (correction_request_id, item)
);

create index if not exists aivex_correction_items_registration_idx
  on public.aivex_correction_items (registration_id, status);
create index if not exists aivex_correction_items_request_idx
  on public.aivex_correction_items (correction_request_id);

comment on table public.aivex_correction_items is
  'One row per item of an aivex_correction_requests bundle, tracked independently: open (nothing resubmitted yet) -> submitted (candidate resubmitted, awaiting admin review) -> verified (admin accepted the fix). A rejected resubmission goes back to open for another attempt; the rejection itself is recorded in admin_audit_events (action resolve_correction_item), not as a fourth status here.';
comment on column public.aivex_correction_items.submitted_fields is
  'field-kind items only: pending team/activity-official values proposed by the candidate in the validated shared contract shape. A later workflow migration applies them only after administrator verification.';
comment on column public.aivex_correction_items.submitted_document_key is
  'document-kind items only: the document_key (api/_lib/admin-aivex-validation.js vocabulary) the resubmitted file now lives under, so the existing SecureViewer / verify_document review UI can open it directly.';

alter table public.aivex_correction_items enable row level security;
revoke all on table public.aivex_correction_items from public, anon, authenticated;
grant select, insert, update, delete on table public.aivex_correction_items to service_role;

-- ---------------------------------------------------------------------------
-- 2. aivex_upload_sessions gains a third `kind`: 'correction_document', for
--    replacing one student/identity card through the Magic Link. Its shape
--    requirements are identical to 'signed_document' (upload_id +
--    registration_id, no submission_id) — the WHICH correction item a
--    session is for travels inside expected_files[0].field (the item's
--    aivex_correction_items.id), exactly how 'field' already carries meaning
--    for the other two kinds. No new column needed.
--
--    The table's two original CHECK constraints were left unnamed by
--    20260924120000, so this drops them by inspecting their real (Postgres-
--    assigned) names rather than guessing — safer to apply blind — and
--    replaces both with explicitly named equivalents.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.aivex_upload_sessions'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.aivex_upload_sessions drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.aivex_upload_sessions
  add constraint aivex_upload_sessions_kind_check
    check (kind in ('registration', 'signed_document', 'correction_document')),
  add constraint aivex_upload_sessions_kind_columns_check
    check (
      (kind = 'registration' and submission_id is not null and upload_id is null and registration_id is null)
      or (kind in ('signed_document', 'correction_document')
          and submission_id is null and upload_id is not null and registration_id is not null)
    );

create index if not exists aivex_upload_sessions_correction_idx
  on public.aivex_upload_sessions (upload_id, registration_id, created_at desc)
  where kind = 'correction_document';

commit;

-- Check the result (read-only):
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'aivex_correction_items'
--    order by ordinal_position;
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.aivex_upload_sessions'::regclass and contype = 'c';
--
--   -- RLS: 0 rows (no policy is created; revoke alone denies anon/authenticated).
--   select policyname from pg_policies
--    where schemaname = 'public' and tablename = 'aivex_correction_items';
--
--   select relrowsecurity from pg_class where oid = 'public.aivex_correction_items'::regclass;
