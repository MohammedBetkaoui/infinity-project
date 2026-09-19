-- AIVEX registration — candidate Magic Link access (Phase 5A).
--
-- Prerequisites (already applied in production):
--   20260918120000_aivex_v4_contract.sql
--   20260919120000_aivex_v4_write_path.sql
--   20260920120000_aivex_v4_generated_documents.sql
--
-- Additive and non-destructive: only adds a new table. No existing table,
-- column, row or Storage bucket is touched.
--
-- What this adds:
--   aivex_magic_links   one row per issued Magic Link. Lets a candidate
--                       reopen their AIVEX registration and re-download its
--                       official DOCX without the original browser session
--                       (api/aivex/magic-link.js, api/aivex/magic-link/
--                       verify.js, api/aivex/magic-link/document.js).
--                       The raw token is NEVER stored here — only its
--                       SHA-256 hash (token_hash); the raw token exists
--                       only in the URL handed to the candidate and cannot
--                       be recovered from this table. One active link per
--                       registration: issuing a new one revokes the
--                       previous one (revoked_at), never deletes it.
--
-- Safe to run more than once.

begin;

create table if not exists public.aivex_magic_links (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null
    references public.aivex_registrations (id) on delete cascade,
  -- SHA-256 hex digest (64 hex chars) of the raw bearer token. Never the
  -- raw token itself — see api/_lib/aivex-magic-link.js.
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  -- NULL while active. A rotation (a new link issued for the same
  -- registration) sets this instead of deleting the row, keeping a trail
  -- of superseded links rather than silently losing them.
  revoked_at timestamptz,
  -- Optional forensic signal only (e.g. "opened from a very different
  -- network than it was issued on"); hashed, never the raw IP/User-Agent.
  -- Nothing in Phase 5A reads these back.
  created_ip_hash text,
  user_agent_hash text,

  constraint aivex_magic_links_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint aivex_magic_links_expires_after_created_check
    check (expires_at > created_at),
  constraint aivex_magic_links_revoked_after_created_check
    check (revoked_at is null or revoked_at >= created_at),
  constraint aivex_magic_links_last_used_after_created_check
    check (last_used_at is null or last_used_at >= created_at)
);

comment on table public.aivex_magic_links is
  'Candidate Magic Link access tokens for AIVEX registrations (Phase 5A). Only a SHA-256 hash of the raw token is stored (token_hash) -- the raw token is never written to the database, never logged, and exists only in the URL handed to the candidate. One active (not revoked, not expired) link per registration; issuing a new one revokes the previous row rather than deleting it.';
comment on column public.aivex_magic_links.token_hash is
  'SHA-256 hex digest of the raw bearer token. Never the raw token itself.';
comment on column public.aivex_magic_links.revoked_at is
  'Set when this link is superseded by a newer one (rotation) or manually revoked. NULL means still active (subject to expires_at).';
comment on column public.aivex_magic_links.created_ip_hash is
  'SHA-256 of the issuing request''s client IP, or NULL. Forensic signal only, never the raw IP.';
comment on column public.aivex_magic_links.user_agent_hash is
  'SHA-256 of the issuing request''s User-Agent header, or NULL. Forensic signal only, never the raw header.';

-- token_hash is looked up on every verify/download call: unique (also
-- enforces at most one row per raw token) and indexed.
create unique index if not exists aivex_magic_links_token_hash_key
  on public.aivex_magic_links (token_hash);
-- Rotation ("revoke the previous active link for this registration") scans
-- by registration_id.
create index if not exists aivex_magic_links_registration_id_idx
  on public.aivex_magic_links (registration_id);
-- Supports a future cleanup/report query over stale links.
create index if not exists aivex_magic_links_expires_at_idx
  on public.aivex_magic_links (expires_at);

-- Row level security: service role only, same posture as every other v4
-- table (no policy -> anon/authenticated see nothing; the API uses the
-- secret key server-side). The browser NEVER queries this table directly.
-- No delete grant: the app only ever revokes (update) or lets a cascade
-- from aivex_registrations remove rows -- minimum privilege, nothing in
-- Phase 5A ever issues a DELETE against this table itself.
alter table public.aivex_magic_links enable row level security;
revoke all on table public.aivex_magic_links from anon, authenticated;
grant select, insert, update on table public.aivex_magic_links to service_role;

commit;

-- Check the result (read-only):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.aivex_magic_links'::regclass order by conname;
--   select indexname, indexdef from pg_indexes
--    where schemaname = 'public' and tablename = 'aivex_magic_links';
--   select policyname, roles, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'aivex_magic_links';
--   -- expected: 0 rows (no policy -> RLS default-denies anon/authenticated)
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'aivex_magic_links';
--   -- expected: only service_role (select, insert, update)
