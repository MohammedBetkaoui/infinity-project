-- Persist personal administrator interface and secure-viewer preferences.
-- This table is server-only: authenticated browser identities never access it
-- directly, and missing rows intentionally resolve to application defaults.

begin;

create table public.admin_user_preferences (
  admin_user_id uuid primary key
    references public.admin_users (id) on delete cascade,
  table_density text not null default 'comfortable',
  review_notifications_enabled boolean not null default true,
  viewer_timeout_seconds integer not null default 120,
  reduced_motion boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint admin_user_preferences_table_density_check
    check (table_density in ('comfortable', 'compact')),
  constraint admin_user_preferences_viewer_timeout_check
    check (viewer_timeout_seconds in (60, 120, 300))
);

create trigger admin_user_preferences_touch_updated_at
  before update on public.admin_user_preferences
  for each row execute function public.admin_users_touch_updated_at();

alter table public.admin_user_preferences enable row level security;

revoke all on table public.admin_user_preferences from public, anon, authenticated;
grant select, insert, update on table public.admin_user_preferences to service_role;

comment on table public.admin_user_preferences is
  'Personal administrator preferences. Server/service-role access only; no operational campaign settings or credentials.';

commit;
