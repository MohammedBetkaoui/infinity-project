-- Persistent administrator notifications and private Web Push subscriptions.
--
-- Forward-only migration. Apply manually after
-- 20261012120000_admin_user_preferences.sql. Browser roles never access these
-- tables directly; the authenticated /api/admin/* gateway is the only client.

begin;

alter table public.admin_user_preferences
  add column if not exists aivex_notifications_enabled boolean not null default true,
  add column if not exists join_notifications_enabled boolean not null default true,
  add column if not exists notification_sound_enabled boolean not null default false;

-- Preserve the intent of the former review-queue preference for existing
-- administrators when this migration is first applied.
update public.admin_user_preferences
   set aivex_notifications_enabled = review_notifications_enabled;

create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  source text not null,
  severity text not null default 'info',
  entity_type text,
  entity_id text,
  action_path text,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz,

  constraint admin_notifications_kind_check
    check (kind ~ '^[a-z][a-z0-9_]{2,79}$'),
  constraint admin_notifications_source_check
    check (source in ('aivex', 'join', 'system', 'security')),
  constraint admin_notifications_severity_check
    check (severity in ('info', 'success', 'warning', 'critical')),
  constraint admin_notifications_entity_type_check
    check (entity_type is null or entity_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint admin_notifications_entity_id_check
    check (entity_id is null or char_length(entity_id) between 1 and 160),
  constraint admin_notifications_action_path_check
    check (
      action_path is null
      or action_path ~ '^/admin/(overview|activity|settings|applications|aivex)$'
      or action_path ~ '^/admin/applications\?record=[0-9a-fA-F-]{36}$'
      or action_path ~ '^/admin/aivex/AIVEX[1-9][0-9]?-[0-9A-HJKMNP-TV-Z]{8}$'
    ),
  constraint admin_notifications_dedupe_key_check
    check (char_length(dedupe_key) between 3 and 300),
  constraint admin_notifications_payload_check
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 4096),
  constraint admin_notifications_expiry_check
    check (expires_at is null or expires_at > created_at)
);

create table public.admin_notification_recipients (
  notification_id uuid not null
    references public.admin_notifications (id) on delete cascade,
  admin_user_id uuid not null
    references public.admin_users (id) on delete cascade,
  delivered_at timestamptz,
  seen_at timestamptz,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (notification_id, admin_user_id),

  constraint admin_notification_recipients_delivery_check
    check (delivered_at is null or delivered_at >= created_at),
  constraint admin_notification_recipients_seen_check
    check (seen_at is null or seen_at >= created_at),
  constraint admin_notification_recipients_read_check
    check (read_at is null or read_at >= created_at),
  constraint admin_notification_recipients_archived_check
    check (archived_at is null or archived_at >= created_at)
);

create table public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null
    references public.admin_users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  failure_count integer not null default 0,
  last_failure_at timestamptz,

  constraint admin_push_subscriptions_endpoint_check
    check (endpoint ~ '^https://' and char_length(endpoint) between 16 and 2048),
  constraint admin_push_subscriptions_p256dh_check
    check (p256dh ~ '^[A-Za-z0-9_-]+$' and char_length(p256dh) between 40 and 512),
  constraint admin_push_subscriptions_auth_check
    check (auth ~ '^[A-Za-z0-9_-]+$' and char_length(auth) between 8 and 256),
  constraint admin_push_subscriptions_user_agent_check
    check (user_agent is null or char_length(user_agent) between 1 and 512),
  constraint admin_push_subscriptions_device_label_check
    check (device_label is null or char_length(device_label) between 1 and 120),
  constraint admin_push_subscriptions_failure_count_check
    check (failure_count >= 0),
  constraint admin_push_subscriptions_revoked_check
    check (revoked_at is null or revoked_at >= created_at)
);

create index admin_notifications_created_idx
  on public.admin_notifications (created_at desc);
create index admin_notifications_expiry_idx
  on public.admin_notifications (expires_at)
  where expires_at is not null;
create index admin_notification_recipients_unread_idx
  on public.admin_notification_recipients (admin_user_id, read_at, created_at desc);
create index admin_notification_recipients_active_idx
  on public.admin_notification_recipients (admin_user_id, archived_at, created_at desc);
create index admin_push_subscriptions_user_active_idx
  on public.admin_push_subscriptions (admin_user_id, last_seen_at desc)
  where revoked_at is null;

create trigger admin_push_subscriptions_touch_updated_at
  before update on public.admin_push_subscriptions
  for each row execute function public.admin_users_touch_updated_at();

-- Notification row creation, recipient resolution and recipient inserts are
-- one transaction. The unique dedupe key makes API retries return the
-- existing notification without producing another recipient/push wave.
create or replace function public.admin_create_notification(
  p_kind text,
  p_source text,
  p_severity text,
  p_entity_type text,
  p_entity_id text,
  p_action_path text,
  p_dedupe_key text,
  p_payload jsonb,
  p_recipient_roles text[],
  p_recipient_user_ids uuid[],
  p_actor_admin_user_id uuid,
  p_created_at timestamptz,
  p_expires_at timestamptz
)
returns table (notification_id uuid, created boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_id uuid;
begin
  if p_recipient_roles is null or exists (
    select 1 from unnest(p_recipient_roles) role_name
     where role_name not in ('super_admin', 'administrator', 'reviewer')
  ) then
    raise exception 'invalid notification recipients' using errcode = '22023';
  end if;

  insert into public.admin_notifications (
    kind, source, severity, entity_type, entity_id, action_path,
    dedupe_key, payload, created_at, expires_at
  ) values (
    p_kind, p_source, p_severity, p_entity_type, p_entity_id, p_action_path,
    p_dedupe_key, coalesce(p_payload, '{}'::jsonb), p_created_at, p_expires_at
  )
  on conflict (dedupe_key) do nothing
  returning id into next_id;

  if next_id is null then
    select id into next_id
      from public.admin_notifications
     where dedupe_key = p_dedupe_key;
    return query select next_id, false;
    return;
  end if;

  insert into public.admin_notification_recipients (
    notification_id, admin_user_id, created_at
  )
  select next_id, administrator.id, p_created_at
    from public.admin_users administrator
    left join public.admin_user_preferences preference
      on preference.admin_user_id = administrator.id
   where administrator.is_active = true
     and (p_actor_admin_user_id is null or administrator.id <> p_actor_admin_user_id)
     and (
       administrator.role = any(p_recipient_roles)
       or (p_recipient_user_ids is not null and administrator.id = any(p_recipient_user_ids))
     )
     and case p_source
       when 'aivex' then coalesce(preference.aivex_notifications_enabled, true)
       when 'join' then coalesce(preference.join_notifications_enabled, true)
       else true
     end
  on conflict (notification_id, admin_user_id) do nothing;

  return query select next_id, true;
end;
$$;

create or replace function public.admin_record_push_failure(
  p_subscription_id uuid,
  p_permanent boolean,
  p_now timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.admin_push_subscriptions
     set failure_count = failure_count + 1,
         last_failure_at = p_now,
         revoked_at = case when p_permanent then coalesce(revoked_at, p_now) else revoked_at end
   where id = p_subscription_id;
  return found;
end;
$$;

alter table public.admin_notifications enable row level security;
alter table public.admin_notification_recipients enable row level security;
alter table public.admin_push_subscriptions enable row level security;

revoke all on table public.admin_notifications from public, anon, authenticated;
revoke all on table public.admin_notification_recipients from public, anon, authenticated;
revoke all on table public.admin_push_subscriptions from public, anon, authenticated;

grant select, insert, update, delete on table public.admin_notifications to service_role;
grant select, insert, update, delete on table public.admin_notification_recipients to service_role;
grant select, insert, update, delete on table public.admin_push_subscriptions to service_role;

revoke all on function public.admin_create_notification(
  text, text, text, text, text, text, text, jsonb, text[], uuid[], uuid,
  timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function public.admin_record_push_failure(uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_create_notification(
  text, text, text, text, text, text, text, jsonb, text[], uuid[], uuid,
  timestamptz, timestamptz
) to service_role;
grant execute on function public.admin_record_push_failure(uuid, boolean, timestamptz)
  to service_role;

comment on table public.admin_notifications is
  'Persistent, deduplicated administrator notification events. Payloads contain no confidential application or identity-document content.';
comment on table public.admin_notification_recipients is
  'Per-administrator delivery, seen, read and archive state; authoritative for unread counts.';
comment on table public.admin_push_subscriptions is
  'Private per-device Web Push subscriptions. Server/service-role access only.';

commit;
