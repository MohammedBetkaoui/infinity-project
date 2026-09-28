-- Operational arrival tracking for teams whose AIVEX file is fully accepted.
-- This is deliberately separate from the registration/document state machine:
-- attendance can never approve, reject, reopen, or otherwise mutate a file.

begin;

create table if not exists public.aivex_team_attendance (
  registration_id uuid primary key
    references public.aivex_registrations (id) on delete cascade,
  status text not null default 'expected',
  checked_at timestamptz,
  checked_by_admin_user_id uuid
    references public.admin_users (id) on delete set null,
  updated_by_admin_user_id uuid
    references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint aivex_team_attendance_status_check
    check (status in ('expected', 'present', 'absent')),
  constraint aivex_team_attendance_check_shape
    check (
      (status = 'expected' and checked_at is null and checked_by_admin_user_id is null)
      or (status in ('present', 'absent') and checked_at is not null and checked_by_admin_user_id is not null)
    )
);

drop trigger if exists aivex_team_attendance_touch_updated_at
  on public.aivex_team_attendance;
create trigger aivex_team_attendance_touch_updated_at
  before update on public.aivex_team_attendance
  for each row execute function public.aivex_touch_updated_at();

alter table public.aivex_team_attendance enable row level security;
revoke all on table public.aivex_team_attendance from public, anon, authenticated;
grant select, insert, update on table public.aivex_team_attendance to service_role;

create or replace function public.admin_list_aivex_attendance(p_edition smallint)
returns jsonb
language sql
stable
security invoker
set search_path = public
set statement_timeout = '5s'
as $$
  with accepted as materialized (
    select
      registration.id as registration_id,
      registration.reference,
      registration.team_name,
      registration.institution_name,
      registration.wilaya_code,
      registration.wilaya_name,
      coalesce(attendance.status, 'expected') as attendance_status,
      attendance.checked_at,
      checker.display_name as checked_by,
      coalesce(attendance.updated_at, registration.updated_at) as attendance_updated_at
    from public.aivex_registrations as registration
    left join public.aivex_team_attendance as attendance
      on attendance.registration_id = registration.id
    left join public.admin_users as checker
      on checker.id = attendance.checked_by_admin_user_id
    where registration.form_version = 4
      and registration.edition = p_edition
      and registration.registration_status = 'approved'
      and registration.document_status = 'validated'
  )
  select jsonb_build_object(
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reference', accepted.reference,
        'teamName', accepted.team_name,
        'institutionName', accepted.institution_name,
        'wilaya', concat(accepted.wilaya_code, ' · ', accepted.wilaya_name),
        'status', accepted.attendance_status,
        'checkedAt', accepted.checked_at,
        'checkedBy', accepted.checked_by,
        'updatedAt', accepted.attendance_updated_at
      ) order by
        case accepted.attendance_status when 'expected' then 0 when 'absent' then 1 else 2 end,
        accepted.team_name,
        accepted.reference
      ) from accepted
    ), '[]'::jsonb),
    'summary', jsonb_build_object(
      'accepted', (select count(*) from accepted),
      'present', (select count(*) from accepted where attendance_status = 'present'),
      'absent', (select count(*) from accepted where attendance_status = 'absent'),
      'expected', (select count(*) from accepted where attendance_status = 'expected')
    )
  );
$$;

create or replace function public.admin_set_aivex_attendance(
  p_reference text,
  p_admin_user_id uuid,
  p_status text,
  p_expected_updated_at timestamptz,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
set statement_timeout = '5s'
as $$
declare
  v_registration public.aivex_registrations%rowtype;
  v_attendance public.aivex_team_attendance%rowtype;
  v_role text;
  v_current_updated_at timestamptz;
  v_checked_by text;
begin
  if p_status is null or p_status not in ('expected', 'present', 'absent') or p_now is null
     or p_expected_updated_at is null then
    raise exception 'invalid_aivex_attendance' using errcode = '22023';
  end if;

  select admin_user.role into v_role
    from public.admin_users as admin_user
   where admin_user.id = p_admin_user_id
     and admin_user.is_active = true;

  if v_role is null or v_role not in ('super_admin', 'administrator') then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;

  select registration.* into v_registration
    from public.aivex_registrations as registration
   where registration.reference = p_reference
   for update;

  if not found then
    raise exception 'aivex_registration_not_found' using errcode = 'P0002';
  end if;

  if v_registration.form_version <> 4
     or v_registration.registration_status <> 'approved'
     or v_registration.document_status <> 'validated' then
    raise exception 'aivex_attendance_file_not_accepted' using errcode = '55000';
  end if;

  select attendance.* into v_attendance
    from public.aivex_team_attendance as attendance
   where attendance.registration_id = v_registration.id
   for update;

  v_current_updated_at := case when found then v_attendance.updated_at else v_registration.updated_at end;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'aivex_attendance_conflict' using errcode = '40001';
  end if;

  insert into public.aivex_team_attendance (
    registration_id, status, checked_at, checked_by_admin_user_id,
    updated_by_admin_user_id, created_at, updated_at
  ) values (
    v_registration.id,
    p_status,
    case when p_status = 'expected' then null else p_now end,
    case when p_status = 'expected' then null else p_admin_user_id end,
    p_admin_user_id,
    p_now,
    p_now
  )
  on conflict (registration_id) do update
    set status = excluded.status,
        checked_at = excluded.checked_at,
        checked_by_admin_user_id = excluded.checked_by_admin_user_id,
        updated_by_admin_user_id = excluded.updated_by_admin_user_id,
        updated_at = excluded.updated_at
  returning * into v_attendance;

  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id,
    'aivex_registration',
    v_registration.id,
    case p_status
      when 'present' then 'aivex_team_arrival_confirmed'
      when 'absent' then 'aivex_team_marked_absent'
      else 'aivex_team_attendance_reset'
    end,
    'standard',
    jsonb_build_object('attendance_status', p_status),
    p_now
  );

  select admin_user.display_name into v_checked_by
    from public.admin_users as admin_user
   where admin_user.id = v_attendance.checked_by_admin_user_id;

  return jsonb_build_object(
    'reference', v_registration.reference,
    'teamName', v_registration.team_name,
    'institutionName', v_registration.institution_name,
    'wilaya', concat(v_registration.wilaya_code, ' · ', v_registration.wilaya_name),
    'status', v_attendance.status,
    'checkedAt', v_attendance.checked_at,
    'checkedBy', v_checked_by,
    'updatedAt', v_attendance.updated_at
  );
end;
$$;

revoke all on function public.admin_list_aivex_attendance(smallint)
  from public, anon, authenticated;
grant execute on function public.admin_list_aivex_attendance(smallint)
  to service_role;

revoke all on function public.admin_set_aivex_attendance(text, uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_set_aivex_attendance(text, uuid, text, timestamptz, timestamptz)
  to service_role;

comment on table public.aivex_team_attendance is
  'Operational competition-day attendance for fully accepted AIVEX teams; separate from file approval state.';

comment on function public.admin_set_aivex_attendance(text, uuid, text, timestamptz, timestamptz) is
  'Records accepted-team arrival/absence with optimistic concurrency and an administrator audit event.';

commit;
