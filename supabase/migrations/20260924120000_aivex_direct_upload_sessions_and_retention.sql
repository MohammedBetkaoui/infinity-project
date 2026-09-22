-- AIVEX direct-upload sessions and approval-gated identity-document retention.
-- Additive only. This migration does not enable a campaign, delete an object,
-- schedule a purge, or change an existing registration.

create table if not exists public.aivex_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('registration', 'signed_document')),
  edition smallint not null check (edition > 0),
  submission_id uuid,
  upload_id uuid,
  registration_id uuid references public.aivex_registrations (id) on delete cascade,
  payload_fingerprint text,
  expected_files jsonb not null,
  status text not null default 'initialized'
    check (status in ('initialized', 'finalizing', 'completed', 'failed')),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (payload_fingerprint is null or payload_fingerprint ~ '^[0-9a-f]{64}$'),
  check (
    (kind = 'registration' and submission_id is not null and upload_id is null and registration_id is null)
    or
    (kind = 'signed_document' and submission_id is null and upload_id is not null and registration_id is not null)
  )
);

create index if not exists aivex_upload_sessions_submission_idx
  on public.aivex_upload_sessions (submission_id, created_at desc)
  where kind = 'registration';

create index if not exists aivex_upload_sessions_upload_idx
  on public.aivex_upload_sessions (upload_id, registration_id, created_at desc)
  where kind = 'signed_document';

create index if not exists aivex_upload_sessions_expiry_idx
  on public.aivex_upload_sessions (status, expires_at);

alter table public.aivex_upload_sessions enable row level security;
revoke all on table public.aivex_upload_sessions from anon, authenticated;
grant select, insert, update, delete on table public.aivex_upload_sessions to service_role;

create or replace function public.aivex_upload_sessions_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists aivex_upload_sessions_touch_updated_at on public.aivex_upload_sessions;
create trigger aivex_upload_sessions_touch_updated_at
before update on public.aivex_upload_sessions
for each row execute function public.aivex_upload_sessions_touch_updated_at();

alter table public.aivex_settings
  add column if not exists identity_document_retention_days integer,
  add column if not exists identity_document_retention_trigger text,
  add column if not exists identity_document_retention_policy_version text,
  add column if not exists identity_document_retention_approved_at timestamptz,
  add column if not exists identity_document_retention_approved_by text,
  add column if not exists identity_document_purge_enabled boolean not null default false;

alter table public.aivex_settings
  drop constraint if exists aivex_settings_identity_document_retention_days_check;
alter table public.aivex_settings
  add constraint aivex_settings_identity_document_retention_days_check
  check (identity_document_retention_days is null or identity_document_retention_days > 0);

alter table public.aivex_registrations
  add column if not exists delegation_head_id_card_purged_at timestamptz,
  add column if not exists driver_id_card_purged_at timestamptz;

comment on table public.aivex_upload_sessions is
  'Short-lived server-owned manifests for private direct uploads. Contains no file bytes or candidate PII.';
comment on column public.aivex_settings.identity_document_purge_enabled is
  'Must remain false until retention duration, trigger, policy version and university approval metadata are complete.';
