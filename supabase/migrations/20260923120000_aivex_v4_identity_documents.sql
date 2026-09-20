-- AIVEX registration — identity documents of the delegation (form v4).
--
-- Every NEW registration now carries one national identity card IMAGE for the
-- head of delegation and one for the driver. This migration adds where those
-- two files live; the files themselves are never stored in PostgreSQL.
--
-- Prerequisites (already applied in production):
--   20260918120000_aivex_v4_contract.sql
--   20260919120000_aivex_v4_write_path.sql
--
-- Apply it BEFORE deploying the API that writes these columns: that API
-- selects and inserts them, and answers 500 to a registration while they do
-- not exist.
--
-- Additive and non-destructive:
--   - no table, column, row, constraint or bucket is dropped or rewritten;
--   - the eight new columns are NULLABLE, so every existing registration
--     stays valid as it is (historical rows simply have no identity card
--     metadata — they are NOT asked to provide one retroactively);
--   - the API, not the database, requires the two documents for a new
--     registration (a NULL-only rule cannot tell a new row from an old one);
--   - the two new CHECK constraints are satisfied by an all-NULL row, so
--     adding them cannot fail on existing data;
--   - RLS is untouched and no policy is created: anon/authenticated still
--     read and write nothing, the API reaches the data with the server-side
--     service role only. Table privileges are deliberately left as they are.
--
-- What is stored, per document (and nothing else — no image, no URL, no
-- signed URL, no base64, no OCR result, no number read from the card):
--   *_id_card_path    private path inside the bucket aivex-id-cards, built by
--                     the server: edition-{edition}/{registration_id}/
--                     {delegation-head|driver}/{random uuid}.{jpg|png}
--   *_id_card_mime    image/jpeg | image/png, from the file's real bytes
--   *_id_card_size    bytes (1 .. 5 MB)
--   *_id_card_sha256  SHA-256 (lowercase hex) computed by the server
--
-- What this adds:
--   aivex_registrations  delegation_head_id_card_{path,mime,size,sha256}
--                        driver_id_card_{path,mime,size,sha256}
--   storage              bucket aivex-id-cards, PRIVATE (5 MB, JPEG/PNG only),
--                        separate from aivex-student-cards so that access to
--                        identity documents can be granted and audited on
--                        its own.
--
-- Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 1. Columns (all nullable: see above).
-- ---------------------------------------------------------------------------
alter table public.aivex_registrations
  add column if not exists delegation_head_id_card_path text,
  add column if not exists delegation_head_id_card_mime text,
  add column if not exists delegation_head_id_card_size bigint,
  add column if not exists delegation_head_id_card_sha256 text,
  add column if not exists driver_id_card_path text,
  add column if not exists driver_id_card_mime text,
  add column if not exists driver_id_card_size bigint,
  add column if not exists driver_id_card_sha256 text;

-- ---------------------------------------------------------------------------
-- 2. Rules. Per document, the four columns are ALL NULL (historical rows, or
--    a registration that never had one) or ALL valid: never a half-recorded
--    document. Each branch spells out `is not null` because a CHECK treats a
--    NULL result as a pass. The path can only belong to its own registration
--    and its own person (edition + registration id + folder), whatever the
--    client sent, and its extension must match the recorded type.
-- ---------------------------------------------------------------------------
alter table public.aivex_registrations
  drop constraint if exists aivex_registrations_delegation_head_id_card_check,
  drop constraint if exists aivex_registrations_driver_id_card_check;

alter table public.aivex_registrations
  add constraint aivex_registrations_delegation_head_id_card_check
    check (
      (delegation_head_id_card_path is null
        and delegation_head_id_card_mime is null
        and delegation_head_id_card_size is null
        and delegation_head_id_card_sha256 is null)
      or (
        delegation_head_id_card_path is not null
        and delegation_head_id_card_mime is not null
        and delegation_head_id_card_size is not null
        and delegation_head_id_card_sha256 is not null
        and delegation_head_id_card_mime in ('image/jpeg', 'image/png')
        and delegation_head_id_card_size between 1 and 5242880
        and delegation_head_id_card_sha256 ~ '^[0-9a-f]{64}$'
        and delegation_head_id_card_path ~ (
          '^edition-' || edition::text || '/' || id::text || '/delegation-head/'
          || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.'
          || case delegation_head_id_card_mime when 'image/jpeg' then 'jpg' else 'png' end || '$'
        )
      )
    ),
  add constraint aivex_registrations_driver_id_card_check
    check (
      (driver_id_card_path is null
        and driver_id_card_mime is null
        and driver_id_card_size is null
        and driver_id_card_sha256 is null)
      or (
        driver_id_card_path is not null
        and driver_id_card_mime is not null
        and driver_id_card_size is not null
        and driver_id_card_sha256 is not null
        and driver_id_card_mime in ('image/jpeg', 'image/png')
        and driver_id_card_size between 1 and 5242880
        and driver_id_card_sha256 ~ '^[0-9a-f]{64}$'
        and driver_id_card_path ~ (
          '^edition-' || edition::text || '/' || id::text || '/driver/'
          || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.'
          || case driver_id_card_mime when 'image/jpeg' then 'jpg' else 'png' end || '$'
        )
      )
    );

-- ---------------------------------------------------------------------------
-- 3. Documentation.
-- ---------------------------------------------------------------------------
comment on column public.aivex_registrations.delegation_head_id_card_path is
  'V4 identity document — INTERNAL VERIFICATION DATA. Path inside the PRIVATE bucket aivex-id-cards: edition-{edition}/{registration_id}/delegation-head/{random uuid}.{jpg|png}. Built by the server; never a public or signed URL; never sent to a browser. NULL for registrations made before identity documents were collected.';
comment on column public.aivex_registrations.delegation_head_id_card_mime is
  'image/jpeg | image/png, detected from the stored file''s real bytes. NULL together with the other delegation_head_id_card_* columns.';
comment on column public.aivex_registrations.delegation_head_id_card_size is
  'Size in bytes of the stored image (1 to 5 MB).';
comment on column public.aivex_registrations.delegation_head_id_card_sha256 is
  'SHA-256 (lowercase hex) of the stored image, computed by the server from the received bytes, for later integrity checks. Never supplied by the browser.';
comment on column public.aivex_registrations.driver_id_card_path is
  'V4 identity document — INTERNAL VERIFICATION DATA. Path inside the PRIVATE bucket aivex-id-cards: edition-{edition}/{registration_id}/driver/{random uuid}.{jpg|png}. Built by the server; never a public or signed URL; never sent to a browser. NULL for registrations made before identity documents were collected.';
comment on column public.aivex_registrations.driver_id_card_mime is
  'image/jpeg | image/png, detected from the stored file''s real bytes. NULL together with the other driver_id_card_* columns.';
comment on column public.aivex_registrations.driver_id_card_size is
  'Size in bytes of the stored image (1 to 5 MB).';
comment on column public.aivex_registrations.driver_id_card_sha256 is
  'SHA-256 (lowercase hex) of the stored image, computed by the server from the received bytes, for later integrity checks. Never supplied by the browser.';

-- ---------------------------------------------------------------------------
-- 4. Storage: a PRIVATE bucket, separate from aivex-student-cards. Created if
--    missing; if it exists, only `public` is forced back to false. No storage
--    policy is added: anon/authenticated get no access, the service role
--    (server side) uploads, and any future admin review reads through the
--    backend — never through a public URL, never through the candidate's
--    Magic Link.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aivex-id-cards', 'aivex-id-cards', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false;

commit;

-- Check the result (read-only):
--
--   -- The eight columns exist and are all nullable.
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'aivex_registrations'
--      and (column_name like 'delegation\_head\_id\_card\_%' or column_name like 'driver\_id\_card\_%')
--    order by column_name;
--
--   -- Historical registrations are untouched: nothing here has metadata (expected:
--   -- with_identity_card = 0 until the first new registration is made).
--   select count(*) as registrations,
--          count(*) filter (where delegation_head_id_card_path is not null) as with_head_card,
--          count(*) filter (where driver_id_card_path is not null) as with_driver_card
--     from public.aivex_registrations;
--
--   -- The two new rules are active.
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.aivex_registrations'::regclass
--      and conname in ('aivex_registrations_delegation_head_id_card_check', 'aivex_registrations_driver_id_card_check');
--
--   -- The bucket must be private (expected: public = false, 5242880, {image/jpeg,image/png}).
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'aivex-id-cards';
--
--   -- No storage policy may open the bucket to anon/authenticated (expected: 0 rows).
--   select policyname, roles, cmd
--     from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and (coalesce(qual, '') ilike '%aivex-id-cards%'
--           or coalesce(with_check, '') ilike '%aivex-id-cards%');
--
--   -- Policies on the AIVEX tables (expected: 0 rows).
--   select tablename, policyname, roles, cmd
--     from pg_policies where schemaname = 'public' and tablename like 'aivex\_%';
--
--   -- After the first real registration: it must have BOTH documents (expected: 0 rows).
--   -- (Registrations made before the deployment legitimately have none: filter on submitted_at.)
--   select reference, submitted_at
--     from public.aivex_registrations
--    where form_version >= 4
--      and submitted_at >= timestamptz '<time this migration and the API were deployed>'
--      and (delegation_head_id_card_path is null or driver_id_card_path is null);
