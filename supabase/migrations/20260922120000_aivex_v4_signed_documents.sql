-- AIVEX registration — candidate signed-document upload (Phase 5B).
--
-- Prerequisites (already applied in production):
--   20260918120000_aivex_v4_contract.sql
--   20260919120000_aivex_v4_write_path.sql
--   20260920120000_aivex_v4_generated_documents.sql
--   20260921120000_aivex_v4_magic_links.sql
--
-- Additive and non-destructive: only adds a new table and a new private
-- Storage bucket. No existing table, column, row or bucket is touched.
--
-- What this adds:
--   aivex_submitted_documents  one row per uploaded signed-document
--                              VERSION (never overwritten -- see
--                              api/_lib/aivex-signed-document-upload.js).
--                              `status` is deliberately a single allowed
--                              value today ('uploaded'): Phase 5C/5D adds
--                              review states with an additive
--                              `alter ... check` on this same column and
--                              column(s) for the reviewer's decision,
--                              never a redesign of this table.
--   storage                    bucket aivex-signed-forms, PRIVATE, holding
--                              the uploaded PDF/JPG/PNG files. Separate
--                              from aivex-generated-forms (the official,
--                              server-generated DOCX) -- these are two
--                              different documents.
--
-- Safe to run more than once.

begin;

create table if not exists public.aivex_submitted_documents (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null
    references public.aivex_registrations (id) on delete cascade,
  -- Not in the brief's suggested column list, but needed the same way it
  -- is on aivex_generated_documents: the deterministic Storage path is
  -- namespaced by edition, and a CHECK constraint below verifies it.
  edition smallint not null,
  -- 1, 2, 3, ... per registration; never reused, never decreased. Allocated
  -- by the application (highest existing + 1, retried on a collision) --
  -- see api/_lib/aivex-signed-document-upload.js for why a DB sequence
  -- alone would not be enough (it would not stay in step with a specific
  -- registration's own version history).
  version integer not null,
  file_path text not null,
  -- Metadata only -- NEVER used to build file_path (see the check below
  -- and api/_lib/aivex-signed-document-upload.js's sanitiser). A candidate
  -- filename containing '../', a null byte or a path separator can end up
  -- here as inert text, never as part of a Storage path.
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  -- SHA-256 of the exact bytes stored, computed server-side from the
  -- upload -- never a value the browser supplies.
  checksum_sha256 text not null,
  -- The client-generated idempotency key for ONE upload attempt (see
  -- submission_id on aivex_registrations for the same pattern applied to
  -- registrations). NULL for a row inserted without one; unique whenever
  -- present, so a browser's retried request can never create a second
  -- version for what was really one candidate action.
  upload_id uuid,
  uploaded_at timestamptz not null default now(),
  uploaded_by text not null default 'candidate_magic_link',
  -- Single allowed value today; see the header note above.
  status text not null default 'uploaded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint aivex_submitted_documents_edition_check
    check (edition > 0),
  constraint aivex_submitted_documents_version_check
    check (version > 0),
  -- The one rule versioning depends on: never two rows claiming the same
  -- version for the same registration. This is what makes a version
  -- collision under concurrent uploads fail loudly (23505) instead of
  -- silently, so the application can retry with a fresh version number.
  constraint aivex_submitted_documents_registration_version_key
    unique (registration_id, version),
  -- Idempotency: at most one row per upload attempt. Postgres allows any
  -- number of NULLs through a UNIQUE constraint, so rows without an
  -- upload_id (none are expected in practice, but nothing requires one)
  -- are unaffected.
  constraint aivex_submitted_documents_upload_id_key
    unique (upload_id),
  constraint aivex_submitted_documents_mime_check
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  constraint aivex_submitted_documents_size_check
    check (size_bytes between 1 and 10485760),
  constraint aivex_submitted_documents_checksum_check
    check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint aivex_submitted_documents_status_check
    check (status in ('uploaded')),
  constraint aivex_submitted_documents_uploaded_by_check
    check (uploaded_by in ('candidate_magic_link')),
  -- Defense in depth on the metadata column itself, even though it is
  -- never used to build a path: no control character (a null byte is
  -- already impossible in a Postgres text column) and no path separator.
  constraint aivex_submitted_documents_file_name_check
    check (
      char_length(original_file_name) between 1 and 255
      and original_file_name !~ '[[:cntrl:]]'
      and position('/' in original_file_name) = 0
      and position(chr(92) in original_file_name) = 0
    ),
  -- Deterministic private path: edition-{edition}/{registration_id}/signed/v{version}.{ext}
  -- Mirrors aivex_generated_documents_path_check's shape exactly.
  constraint aivex_submitted_documents_path_check
    check (file_path ~ ('^edition-' || edition::text || '/' || registration_id::text || '/signed/v' || version::text || '\.(pdf|jpg|png)$'))
);

comment on table public.aivex_submitted_documents is
  'Candidate-uploaded signed/stamped copies of the official AIVEX document (Phase 5B), one row per version, never overwritten. Files live in the private bucket aivex-signed-forms; this table only holds metadata. Distinct from aivex_generated_documents (the server-generated official DOCX) -- these are two different files.';
comment on column public.aivex_submitted_documents.file_path is
  'Path inside the PRIVATE bucket aivex-signed-forms, built entirely server-side. Never derived from original_file_name; never a public URL.';
comment on column public.aivex_submitted_documents.original_file_name is
  'Untrusted candidate-supplied file name, kept as display metadata only -- never used to build file_path.';
comment on column public.aivex_submitted_documents.upload_id is
  'Client-generated idempotency key for one upload attempt (mirrors aivex_registrations.submission_id). NULL-safe unique: prevents a browser retry from creating a duplicate version.';
comment on column public.aivex_submitted_documents.status is
  'Per-document-version status. Only ''uploaded'' exists in Phase 5B; Phase 5C/5D extends this check constraint additively for a review workflow, never by redesigning this table.';

drop trigger if exists aivex_submitted_documents_touch_updated_at on public.aivex_submitted_documents;
create trigger aivex_submitted_documents_touch_updated_at
  before update on public.aivex_submitted_documents
  for each row execute function public.aivex_touch_updated_at();

-- Row level security: service role only, same posture as every other v4
-- table (no policy -> anon/authenticated see nothing; the API uses the
-- secret key server-side). The browser NEVER queries this table directly.
-- No delete grant: nothing in Phase 5B deletes a row (only a cascade from
-- aivex_registrations does) -- minimum privilege.
alter table public.aivex_submitted_documents enable row level security;
revoke all on table public.aivex_submitted_documents from anon, authenticated;
grant select, insert, update on table public.aivex_submitted_documents to service_role;

-- Storage: the signed-forms bucket is PRIVATE, separate from
-- aivex-generated-forms. No policy is added: anon/authenticated get no
-- access, the service role uploads, and any future admin review reads
-- through the backend, never a public or signed URL to the candidate.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'aivex-signed-forms', 'aivex-signed-forms', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set public = false;

commit;

-- Check the result (read-only):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.aivex_submitted_documents'::regclass order by conname;
--   select indexname, indexdef from pg_indexes
--    where schemaname = 'public' and tablename = 'aivex_submitted_documents';
--   select policyname, roles, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'aivex_submitted_documents';
--   -- expected: 0 rows (no policy -> RLS default-denies anon/authenticated)
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'aivex-signed-forms';
