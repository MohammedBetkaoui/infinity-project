-- Event creation: each day of an event has its own date and hours.
--
--   * club_events.schedule_days jsonb stores the day list as
--       [{"date":"2026-10-28","startTime":"09:00","endTime":"12:00"}, ...]
--     in Africa/Algiers local time (1 to 14 days, dates strictly increasing).
--   * starts_at / ends_at stay the absolute bounds of that list (first day
--     start, last day end), derived by the API, so the scanner window, link
--     expiry, sorting and every public page keep working unchanged.
--   * Events saved before this migration keep an empty list; the admin UI
--     rebuilds a day list from starts_at / ends_at for them.
-- Forward-only. Requires 20261101120000 (speaker_names).

begin;

alter table public.club_events
  add column if not exists schedule_days jsonb not null default '[]'::jsonb;

alter table public.club_events drop constraint if exists club_events_schedule_days_check;
alter table public.club_events add constraint club_events_schedule_days_check
  check (jsonb_typeof(schedule_days) = 'array' and jsonb_array_length(schedule_days) <= 14);

-- Directory read model: same shape as 20261101120000 plus schedule_days.
drop view if exists public.admin_club_events_directory;

create view public.admin_club_events_directory
with (security_invoker = true)
as
select
  event.id,
  event.event_type,
  event.title,
  event.description,
  event.starts_at,
  event.ends_at,
  event.schedule_days,
  event.location,
  event.speaker_name,
  event.speaker_names,
  event.visibility,
  event.status,
  (select count(*)::integer from public.club_event_invitations invitation
    where invitation.event_id = event.id and invitation.status <> 'cancelled') as invited_count,
  (select count(*)::integer from public.club_event_registrations registration
    where registration.event_id = event.id and registration.status <> 'cancelled') as registered_count,
  (select count(*)::integer from public.club_event_registrations registration
    where registration.event_id = event.id and registration.status = 'checked_in') as present_count,
  (select count(*)::integer from public.club_event_registrations registration
    where registration.event_id = event.id and registration.status = 'registered'
      and registration.checked_in_at is null and registration.absent_at is null) as not_checked_in_count,
  (select count(*)::integer from public.club_event_registrations registration
    where registration.event_id = event.id and registration.absent_at is not null) as absent_count,
  (select count(*)::integer from public.club_event_registrations registration
    where registration.event_id = event.id and registration.status <> 'cancelled') as attendance_count,
  event.created_by_admin_user_id,
  event.updated_by_admin_user_id,
  event.created_at,
  event.updated_at
from public.club_events event;

revoke all on table public.admin_club_events_directory from anon, authenticated;
grant select on table public.admin_club_events_directory to service_role;
comment on view public.admin_club_events_directory is
  'Server-only read model for the Events administration pages with invitation, registration and attendance aggregates.';

create or replace function public.admin_create_club_event(
  p_admin_user_id uuid,
  p_payload jsonb,
  p_now timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  administrator_role text;
  event_id_value uuid;
  starts_at_value timestamptz;
  ends_at_value timestamptz;
  status_value text;
  speaker_names_value text[];
  schedule_days_value jsonb;
  changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if p_payload->>'eventType' is distinct from 'workshop' then raise exception 'unsupported_event_type' using errcode = '22023'; end if;

  if jsonb_typeof(p_payload->'speakerNames') is distinct from 'array' then
    raise exception 'workshop_speaker_required' using errcode = '22023';
  end if;
  select array_agg(btrim(item.name) order by item.ord)
    into speaker_names_value
    from jsonb_array_elements_text(p_payload->'speakerNames') with ordinality as item(name, ord);
  if speaker_names_value is null or cardinality(speaker_names_value) > 8
    or exists (select 1 from unnest(speaker_names_value) as listed(name) where char_length(listed.name) not between 2 and 120) then
    raise exception 'workshop_speaker_required' using errcode = '22023';
  end if;

  schedule_days_value := case when jsonb_typeof(p_payload->'scheduleDays') = 'array' then p_payload->'scheduleDays' else '[]'::jsonb end;
  if jsonb_array_length(schedule_days_value) > 14 then raise exception 'invalid_event_schedule' using errcode = '22023'; end if;

  starts_at_value := (p_payload->>'startsAt')::timestamptz;
  ends_at_value := nullif(btrim(coalesce(p_payload->>'endsAt','')), '')::timestamptz;
  if starts_at_value is null then raise exception 'invalid_event_start' using errcode = '22023'; end if;
  if ends_at_value is not null and ends_at_value <= starts_at_value then raise exception 'invalid_event_window' using errcode = '22023'; end if;
  status_value := coalesce(p_payload->>'status', 'draft');
  if status_value not in ('draft','planned') then raise exception 'invalid_event_status' using errcode = '22023'; end if;

  insert into public.club_events (
    event_type, title, starts_at, ends_at, schedule_days, location, speaker_name, speaker_names,
    visibility, status, created_by_admin_user_id, updated_by_admin_user_id, created_at, updated_at
  ) values (
    'workshop', btrim(p_payload->>'title'), starts_at_value, ends_at_value, schedule_days_value, btrim(p_payload->>'location'),
    array_to_string(speaker_names_value, ', '), speaker_names_value,
    'internal', status_value, p_admin_user_id, p_admin_user_id, changed_at, changed_at
  ) returning id into event_id_value;

  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', event_id_value, 'event_created', 'standard',
          jsonb_build_object('event_type', 'workshop', 'status', status_value,
                             'days', jsonb_array_length(schedule_days_value)), changed_at);
  return event_id_value;
end;
$$;

create or replace function public.admin_update_club_event(
  p_event_id uuid, p_admin_user_id uuid, p_expected_updated_at timestamptz, p_payload jsonb, p_now timestamptz
) returns timestamptz
language plpgsql security invoker set search_path = public as $$
declare
  administrator_role text; event_row public.club_events%rowtype;
  starts_at_value timestamptz; ends_at_value timestamptz; speaker_names_value text[]; schedule_days_value jsonb;
  changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  select * into event_row from public.club_events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if event_row.updated_at <> p_expected_updated_at then raise exception 'event_conflict' using errcode = '40001'; end if;
  if p_payload->>'eventType' is distinct from event_row.event_type or p_payload->>'status' is distinct from event_row.status
  then raise exception 'invalid_event_transition' using errcode = '22023'; end if;

  if jsonb_typeof(p_payload->'speakerNames') is distinct from 'array' then
    raise exception 'workshop_speaker_required' using errcode = '22023';
  end if;
  select array_agg(btrim(item.name) order by item.ord)
    into speaker_names_value
    from jsonb_array_elements_text(p_payload->'speakerNames') with ordinality as item(name, ord);
  if speaker_names_value is null or cardinality(speaker_names_value) > 8
    or exists (select 1 from unnest(speaker_names_value) as listed(name) where char_length(listed.name) not between 2 and 120) then
    raise exception 'workshop_speaker_required' using errcode = '22023';
  end if;

  schedule_days_value := case when jsonb_typeof(p_payload->'scheduleDays') = 'array' then p_payload->'scheduleDays' else '[]'::jsonb end;
  if jsonb_array_length(schedule_days_value) > 14 then raise exception 'invalid_event_schedule' using errcode = '22023'; end if;

  starts_at_value := (p_payload->>'startsAt')::timestamptz;
  ends_at_value := nullif(btrim(coalesce(p_payload->>'endsAt','')), '')::timestamptz;
  if starts_at_value is null or (ends_at_value is not null and ends_at_value <= starts_at_value)
  then raise exception 'invalid_event_window' using errcode = '22023'; end if;

  update public.club_events set title = btrim(p_payload->>'title'),
    starts_at = starts_at_value, ends_at = ends_at_value, schedule_days = schedule_days_value,
    location = btrim(p_payload->>'location'),
    speaker_name = array_to_string(speaker_names_value, ', '), speaker_names = speaker_names_value,
    updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at
   where id = p_event_id;
  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id, 'event_updated', 'standard', jsonb_build_object('status', event_row.status), changed_at);
  return changed_at;
end;
$$;

revoke all on function public.admin_create_club_event(uuid,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_create_club_event(uuid,jsonb,timestamptz) to service_role;
revoke all on function public.admin_update_club_event(uuid,uuid,timestamptz,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_update_club_event(uuid,uuid,timestamptz,jsonb,timestamptz) to service_role;

comment on column public.club_events.schedule_days is
  'Per-day schedule in Africa/Algiers local time: [{date, startTime, endTime}]. starts_at / ends_at are its absolute bounds. Empty for events saved before per-day hours existed.';

commit;
