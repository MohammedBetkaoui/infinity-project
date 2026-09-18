-- AIVEX registration — official document generation (Phase 4).
--
-- Prerequisites (already applied in production):
--   20260918120000_aivex_v4_contract.sql
--   20260919120000_aivex_v4_write_path.sql
--
-- Additive and non-destructive: only adds a new table and a new private
-- Storage bucket. No existing table, column or row is touched.
--
-- What this adds:
--   aivex_generated_documents  one row per (registration, document type).
--                              document_type: 'docx' | 'pdf'.
--                              generation_status: 'generating' | 'generated'
--                              | 'failed'. A retry overwrites the existing
--                              row for that (registration, type) pair rather
--                              than accumulating history — see
--                              api/_lib/aivex-document-generation.js.
--   storage                    bucket aivex-generated-forms, PRIVATE, holding
--                              the generated .docx/.pdf files.
--
-- Safe to run more than once.

begin;

create table if not exists public.aivex_generated_documents (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null
    references public.aivex_registrations (id) on delete cascade,
  edition smallint not null,
  document_type text not null,
  generation_status text not null default 'generating',
  -- Populated once generation_status = 'generated'; null before that (or if
  -- generation failed before the file could be produced/uploaded).
  file_path text,
  mime_type text,
  file_size_bytes bigint,
  -- The template file (public/word-form/...) that produced this document.
  -- Lets a future template change be traced back per generated file.
  template_version text not null,
  -- Short diagnostic code on failure (e.g. 'template_load_failed',
  -- 'render_failed', 'upload_failed', 'pdf_conversion_not_configured').
  -- Never a raw error message or stack trace — same discipline as the
  -- registration write path's logs.
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint aivex_generated_documents_type_check
    check (document_type in ('docx', 'pdf')),
  constraint aivex_generated_documents_status_check
    check (generation_status in ('generating', 'generated', 'failed')),
  -- One current row per document type per registration: a retry updates
  -- this row in place (see the migration header note above).
  constraint aivex_generated_documents_registration_type_key
    unique (registration_id, document_type),
  constraint aivex_generated_documents_template_version_check
    check (char_length(template_version) between 1 and 200),
  constraint aivex_generated_documents_error_code_check
    check (error_code is null or char_length(error_code) between 1 and 100),
  -- A 'generated' row must carry its file's metadata; a 'generating' or
  -- 'failed' row must not claim to have one.
  constraint aivex_generated_documents_file_fields_check
    check (
      (generation_status = 'generated'
        and file_path is not null and mime_type is not null and file_size_bytes is not null)
      or
      (generation_status <> 'generated'
        and file_path is null and mime_type is null and file_size_bytes is null)
    ),
  constraint aivex_generated_documents_mime_check
    check (mime_type is null or mime_type in (
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf'
    )),
  constraint aivex_generated_documents_size_check
    check (file_size_bytes is null or file_size_bytes between 1 and 10485760),
  -- Deterministic private path: edition-{edition}/{registration_id}/{reference}.{ext}
  -- (docType).
  constraint aivex_generated_documents_path_check
    check (file_path is null or file_path ~ ('^edition-' || edition::text || '/' || registration_id::text || '/[0-9A-Za-z-]+\.(docx|pdf)$'))
);

comment on table public.aivex_generated_documents is
  'Generated official AIVEX documents (Word + PDF), one current row per (registration, document_type). Files live in the private bucket aivex-generated-forms; this table only holds metadata. Never holds the student cards (those stay in aivex_students / aivex-student-cards).';
comment on column public.aivex_generated_documents.file_path is
  'Path inside the PRIVATE bucket aivex-generated-forms. Never a public URL; read only through short-lived signed URLs issued by the backend.';
comment on column public.aivex_generated_documents.generation_status is
  'generating | generated | failed. A failed row (in particular pdf with error_code = pdf_conversion_not_configured) does not block the registration''s own document_status, which reflects the docx outcome.';

create index if not exists aivex_generated_documents_status_idx
  on public.aivex_generated_documents (edition, generation_status, document_type);

drop trigger if exists aivex_generated_documents_touch_updated_at on public.aivex_generated_documents;
create trigger aivex_generated_documents_touch_updated_at
  before update on public.aivex_generated_documents
  for each row execute function public.aivex_touch_updated_at();

-- Row level security: service role only, same posture as the other v4
-- tables (no policy -> anon/authenticated see nothing; the API uses the
-- secret key server-side).
alter table public.aivex_generated_documents enable row level security;
revoke all on table public.aivex_generated_documents from anon, authenticated;
grant select, insert, update, delete on table public.aivex_generated_documents to service_role;

-- Storage: the generated-forms bucket is PRIVATE. No policy is added:
-- anon/authenticated get no access, the service role writes, and any future
-- signature/admin workflow reads through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'aivex-generated-forms', 'aivex-generated-forms', false, 10485760,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf']
)
on conflict (id) do update set public = false;

commit;

-- Check the result (read-only):
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'aivex-generated-forms';
--   select policyname, roles, cmd from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and (coalesce(qual, '') ilike '%aivex-generated-forms%'
--           or coalesce(with_check, '') ilike '%aivex-generated-forms%');
--   -- expected: 0 rows (no storage policy opens this bucket to anon/authenticated)
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.aivex_generated_documents'::regclass order by conname;
