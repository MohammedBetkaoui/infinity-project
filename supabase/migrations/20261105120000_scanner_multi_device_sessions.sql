-- Workshop scanner: the shared link works on several phones at the same time.
--
-- Until now, exchanging the shared scanner link for a session revoked every
-- other live session of that link, and a unique index allowed only one active
-- session per link. Opening the link on a second phone therefore signed the
-- first phone out: its next context refresh answered 401 "invalid scanner
-- session".
--
-- Each phone now keeps its own session until it expires (8 hours by default,
-- never beyond the link's own expiry) or until an administrator regenerates
-- or revokes the link. Both admin actions still end every session at once
-- (admin_set_event_scanner_access and admin_revoke_club_event_scanner_access
-- are unchanged). Scanning the same badge on two phones stays safe: check-in
-- locks the registration row, so exactly one phone records the check-in and
-- the other is told "already checked in".
--
-- Requires 20261104120000 (same function, same status gate). Forward-only.

begin;

drop index if exists public.club_event_scanner_session_active_unique;

create or replace function public.public_exchange_event_scanner_token(
  p_access_token_hash text, p_session_token_hash text, p_session_expires_at timestamptz, p_now timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  access_row public.club_event_scanner_access%rowtype;
  event_row public.club_events%rowtype;
  changed_at timestamptz := coalesce(p_now, now());
begin
  if p_access_token_hash !~ '^[a-f0-9]{64}$' or p_session_token_hash !~ '^[a-f0-9]{64}$'
    or p_session_expires_at <= changed_at or p_session_expires_at > changed_at + interval '12 hours'
  then raise exception 'invalid_scanner_access' using errcode = '22023'; end if;
  select * into access_row from public.club_event_scanner_access where token_hash = p_access_token_hash for update;
  if not found or access_row.status <> 'active' or access_row.revoked_at is not null
    or access_row.starts_at > changed_at or access_row.expires_at <= changed_at
  then raise exception 'invalid_scanner_access' using errcode = '22023'; end if;
  select event.* into event_row from public.club_events event where event.id = access_row.event_id;
  if event_row.status in ('completed','cancelled','archived')
    then raise exception 'scanner_not_available' using errcode = '22023'; end if;

  -- Housekeeping only: sessions of this link that have already run out are
  -- marked expired. Live sessions on other phones are left untouched.
  update public.club_event_scanner_sessions set status = 'expired'
   where scanner_access_id = access_row.id and status = 'active' and expires_at <= changed_at;

  insert into public.club_event_scanner_sessions
    (event_id, scanner_access_id, token_hash, status, expires_at, created_at)
  values (access_row.event_id, access_row.id, p_session_token_hash, 'active',
          least(p_session_expires_at, access_row.expires_at), changed_at);
  update public.club_event_scanner_access set last_used_at = changed_at where id = access_row.id;
  return jsonb_build_object(
    'event_id', event_row.id, 'event_title', event_row.title,
    'starts_at', event_row.starts_at, 'location', event_row.location,
    'event_status', event_row.status,
    'session_expires_at', least(p_session_expires_at, access_row.expires_at)
  );
end;
$$;

revoke all on function public.public_exchange_event_scanner_token(text,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.public_exchange_event_scanner_token(text,text,timestamptz,timestamptz) to service_role;

comment on table public.club_event_scanner_sessions is
  'Short-lived scanner sessions exchanged from the shared event scanner link. Several phones may hold one at the same time; regenerating or revoking the link ends them all.';

commit;
