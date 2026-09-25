-- Infinity Club administration authentication.
--
-- This migration intentionally creates no administrator and contains no
-- credential. Apply it manually, then run `npm run admin:create-user` from a
-- trusted operator machine with the server-only Supabase credentials.

begin;

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_normalized text not null unique,
  display_name text not null,
  password_hash text not null,
  role text not null default 'administrator',
  is_active boolean not null default true,
  failed_login_count integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  password_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint admin_users_username_check
    check (username = btrim(username) and char_length(username) between 3 and 64),
  constraint admin_users_username_normalized_check
    check (
      username_normalized = lower(btrim(username))
      and username_normalized ~ '^[a-z0-9][a-z0-9._-]{2,63}$'
    ),
  constraint admin_users_display_name_check
    check (display_name = btrim(display_name) and char_length(display_name) between 2 and 120),
  constraint admin_users_password_hash_check
    check (password_hash like 'scrypt$v=1$%'),
  constraint admin_users_role_check
    check (role in ('super_admin', 'administrator', 'reviewer')),
  constraint admin_users_failed_login_count_check
    check (failed_login_count >= 0)
);

create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null
    references public.admin_users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,

  constraint admin_sessions_token_hash_check
    check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint admin_sessions_expiry_check
    check (expires_at > created_at),
  constraint admin_sessions_last_seen_check
    check (last_seen_at >= created_at and last_seen_at <= expires_at)
);

create table public.admin_auth_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid
    references public.admin_users (id) on delete set null,
  event_type text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,

  constraint admin_auth_events_type_check
    check (event_type in (
      'login_success', 'login_failure', 'logout', 'session_expired',
      'password_changed', 'account_locked'
    )),
  constraint admin_auth_events_metadata_check
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 2048)
);

-- Persistent, pseudonymous burst protection. key_hash is an HMAC produced by
-- the server; raw usernames and IP addresses are never stored here.
create table public.admin_login_rate_limits (
  key_type text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  attempt_count integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (key_type, key_hash),

  constraint admin_login_rate_limits_type_check
    check (key_type in ('username', 'ip')),
  constraint admin_login_rate_limits_hash_check
    check (key_hash ~ '^[a-f0-9]{64}$'),
  constraint admin_login_rate_limits_attempt_count_check
    check (attempt_count >= 0)
);

create index admin_sessions_user_active_idx
  on public.admin_sessions (admin_user_id, expires_at)
  where revoked_at is null;
create index admin_sessions_expiry_idx
  on public.admin_sessions (expires_at)
  where revoked_at is null;
create index admin_auth_events_user_created_idx
  on public.admin_auth_events (admin_user_id, created_at desc);
create index admin_auth_events_created_idx
  on public.admin_auth_events (created_at desc);
create index admin_login_rate_limits_updated_idx
  on public.admin_login_rate_limits (updated_at);

create or replace function public.admin_users_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger admin_users_touch_updated_at
  before update on public.admin_users
  for each row execute function public.admin_users_touch_updated_at();

-- Atomic persistent limiter used before any username lookup. Limits are
-- supplied by the server so the same function can protect username and IP
-- keys with different windows.
create or replace function public.admin_consume_login_rate_limit(
  p_key_type text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer,
  p_now timestamptz
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_row public.admin_login_rate_limits%rowtype;
  next_count integer;
  next_blocked_until timestamptz;
begin
  if p_key_type not in ('username', 'ip')
     or p_key_hash !~ '^[a-f0-9]{64}$'
     or p_limit < 1
     or p_window_seconds < 1
     or p_block_seconds < 1 then
    raise exception 'invalid rate limit parameters' using errcode = '22023';
  end if;

  insert into public.admin_login_rate_limits (
    key_type, key_hash, window_started_at, attempt_count, updated_at
  ) values (p_key_type, p_key_hash, p_now, 0, p_now)
  on conflict (key_type, key_hash) do nothing;

  select * into current_row
    from public.admin_login_rate_limits
   where key_type = p_key_type and key_hash = p_key_hash
   for update;

  if current_row.blocked_until is not null and current_row.blocked_until > p_now then
    return query select false, greatest(1, ceil(extract(epoch from current_row.blocked_until - p_now))::integer);
    return;
  end if;

  if current_row.window_started_at + make_interval(secs => p_window_seconds) <= p_now then
    next_count := 1;
    current_row.window_started_at := p_now;
  else
    next_count := current_row.attempt_count + 1;
  end if;

  next_blocked_until := case
    when next_count > p_limit then p_now + make_interval(secs => p_block_seconds)
    else null
  end;

  update public.admin_login_rate_limits
     set window_started_at = current_row.window_started_at,
         attempt_count = next_count,
         blocked_until = next_blocked_until,
         updated_at = p_now
   where key_type = p_key_type and key_hash = p_key_hash;

  return query select
    next_blocked_until is null,
    case when next_blocked_until is null then 0 else p_block_seconds end;
end;
$$;

-- Account-level consecutive-failure tracking. The fifth failure locks the
-- account for fifteen minutes. The event contains no username, password or IP.
create or replace function public.admin_record_login_failure(
  p_admin_user_id uuid,
  p_now timestamptz
)
returns table (failure_count integer, locked_until timestamptz, just_locked boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  user_row public.admin_users%rowtype;
  next_count integer;
  next_locked_until timestamptz;
  did_lock boolean := false;
begin
  select * into user_row
    from public.admin_users
   where id = p_admin_user_id
   for update;

  if not found then
    raise exception 'admin user not found' using errcode = 'P0002';
  end if;

  if user_row.locked_until is not null and user_row.locked_until > p_now then
    insert into public.admin_auth_events (admin_user_id, event_type)
    values (p_admin_user_id, 'login_failure');
    return query select user_row.failed_login_count, user_row.locked_until, false;
    return;
  end if;

  next_count := case
    when user_row.locked_until is not null and user_row.locked_until <= p_now then 1
    else user_row.failed_login_count + 1
  end;
  next_locked_until := null;

  if next_count >= 5 then
    next_locked_until := p_now + interval '15 minutes';
    did_lock := true;
  end if;

  update public.admin_users
     set failed_login_count = next_count,
         locked_until = next_locked_until
   where id = p_admin_user_id;

  insert into public.admin_auth_events (admin_user_id, event_type)
  values (p_admin_user_id, 'login_failure');

  if did_lock then
    insert into public.admin_auth_events (admin_user_id, event_type)
    values (p_admin_user_id, 'account_locked');
  end if;

  return query select next_count, next_locked_until, did_lock;
end;
$$;

-- Login state, session creation and its audit event are committed together.
create or replace function public.admin_create_login_session(
  p_admin_user_id uuid,
  p_token_hash text,
  p_expected_password_changed_at timestamptz,
  p_now timestamptz,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_session_id uuid;
begin
  update public.admin_users
     set failed_login_count = 0,
         locked_until = null,
         last_login_at = p_now
   where id = p_admin_user_id
     and is_active = true
     and password_changed_at = p_expected_password_changed_at
     and (locked_until is null or locked_until <= p_now);

  if not found then
    raise exception 'active admin user not found' using errcode = 'P0002';
  end if;

  insert into public.admin_sessions (
    admin_user_id, token_hash, created_at, last_seen_at, expires_at
  ) values (p_admin_user_id, p_token_hash, p_now, p_now, p_expires_at)
  returning id into new_session_id;

  insert into public.admin_auth_events (admin_user_id, event_type)
  values (p_admin_user_id, 'login_success');

  return new_session_id;
end;
$$;

create or replace function public.admin_revoke_session(
  p_session_id uuid,
  p_event_type text,
  p_now timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected_user_id uuid;
begin
  if p_event_type not in ('logout', 'session_expired') then
    raise exception 'invalid session event' using errcode = '22023';
  end if;

  update public.admin_sessions
     set revoked_at = p_now
   where id = p_session_id and revoked_at is null
  returning admin_user_id into affected_user_id;

  if affected_user_id is null then
    return false;
  end if;

  insert into public.admin_auth_events (admin_user_id, event_type)
  values (affected_user_id, p_event_type);
  return true;
end;
$$;

-- Password update + revocation + explicit current-session rotation are one
-- transaction. Only hashes enter this function; plaintext never reaches SQL.
create or replace function public.admin_change_password_and_rotate(
  p_admin_user_id uuid,
  p_current_session_id uuid,
  p_password_hash text,
  p_token_hash text,
  p_now timestamptz,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_session_id uuid;
begin
  if not exists (
    select 1 from public.admin_sessions
     where id = p_current_session_id
       and admin_user_id = p_admin_user_id
       and revoked_at is null
  ) then
    raise exception 'current session is not active' using errcode = '28000';
  end if;

  update public.admin_users
     set password_hash = p_password_hash,
         password_changed_at = p_now,
         failed_login_count = 0,
         locked_until = null
   where id = p_admin_user_id and is_active = true;

  if not found then
    raise exception 'active admin user not found' using errcode = 'P0002';
  end if;

  update public.admin_sessions
     set revoked_at = p_now
   where admin_user_id = p_admin_user_id and revoked_at is null;

  insert into public.admin_sessions (
    admin_user_id, token_hash, created_at, last_seen_at, expires_at
  ) values (p_admin_user_id, p_token_hash, p_now, p_now, p_expires_at)
  returning id into new_session_id;

  insert into public.admin_auth_events (admin_user_id, event_type)
  values (p_admin_user_id, 'password_changed');

  return new_session_id;
end;
$$;

alter table public.admin_users enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_auth_events enable row level security;
alter table public.admin_login_rate_limits enable row level security;

revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.admin_sessions from anon, authenticated;
revoke all on table public.admin_auth_events from anon, authenticated;
revoke all on table public.admin_login_rate_limits from anon, authenticated;

grant select, insert, update, delete on table public.admin_users to service_role;
grant select, insert, update, delete on table public.admin_sessions to service_role;
grant select, insert on table public.admin_auth_events to service_role;
grant select, insert, update, delete on table public.admin_login_rate_limits to service_role;

revoke all on function public.admin_consume_login_rate_limit(text, text, integer, integer, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_record_login_failure(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_create_login_session(uuid, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_revoke_session(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_change_password_and_rotate(uuid, uuid, text, text, timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.admin_consume_login_rate_limit(text, text, integer, integer, integer, timestamptz) to service_role;
grant execute on function public.admin_record_login_failure(uuid, timestamptz) to service_role;
grant execute on function public.admin_create_login_session(uuid, text, timestamptz, timestamptz, timestamptz) to service_role;
grant execute on function public.admin_revoke_session(uuid, text, timestamptz) to service_role;
grant execute on function public.admin_change_password_and_rotate(uuid, uuid, text, text, timestamptz, timestamptz) to service_role;

comment on table public.admin_users is
  'Server-only Infinity Administration identities. Password hashes never leave the server.';
comment on table public.admin_sessions is
  'Server-side opaque admin sessions. token_hash is SHA-256; raw tokens exist only in HttpOnly cookies.';
comment on table public.admin_auth_events is
  'Minimal authentication audit trail. Never store passwords, cookies, tokens or request bodies.';
comment on table public.admin_login_rate_limits is
  'Persistent HMAC-keyed login burst limits. Raw usernames and IP addresses are not retained.';

commit;

-- Manual verification after applying (expected: RLS true and zero policies):
-- select relname, relrowsecurity from pg_class
--  where relname in ('admin_users','admin_sessions','admin_auth_events','admin_login_rate_limits');
-- select tablename, policyname from pg_policies where tablename like 'admin_%';
