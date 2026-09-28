-- Super-administrator-only purge for every AIVEX team file.
--
-- The browser never calls this function directly. The authenticated admin
-- API re-verifies the current password, then invokes this service-role-only
-- RPC. Child rows are removed transactionally with their registration. The
-- server empties the four private Storage buckets after this transaction and
-- records that separate result without ever exposing an object path.

begin;

create or replace function public.admin_purge_all_aivex_data(
  p_admin_user_id uuid,
  p_now timestamptz
)
returns table (
  operation_id uuid,
  deleted_registrations bigint,
  deleted_upload_sessions bigint
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role text;
  v_operation_id uuid := gen_random_uuid();
  v_deleted_registrations bigint := 0;
  v_deleted_upload_sessions bigint := 0;
begin
  perform set_config('lock_timeout', '5s', true);

  if p_now is null then
    raise exception 'invalid_purge_timestamp' using errcode = '22023';
  end if;

  select role into v_role
    from public.admin_users
   where id = p_admin_user_id
     and is_active = true;

  if v_role is distinct from 'super_admin' then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;

  -- Includes abandoned registration staging sessions which are not attached
  -- to a registration yet, plus signed/identity upload sessions which are.
  delete from public.aivex_upload_sessions;
  get diagnostics v_deleted_upload_sessions = row_count;

  -- Legacy form v1-v3 students are kept in aivex_members. Delete explicitly
  -- so the purge remains compatible with installations whose historical
  -- foreign key was not created with ON DELETE CASCADE.
  delete from public.aivex_members;

  -- V4 students, generated/submitted documents, Magic Links, correction
  -- items, reviews, and registration-bound upload sessions cascade here.
  delete from public.aivex_registrations;
  get diagnostics v_deleted_registrations = row_count;

  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id,
    'aivex_registration',
    v_operation_id,
    'aivex_all_files_deleted',
    'confidential',
    jsonb_build_object(
      'deleted_registration_count', v_deleted_registrations,
      'deleted_upload_session_count', v_deleted_upload_sessions,
      'storage_cleanup_pending', true
    ),
    p_now
  );

  return query select
    v_operation_id,
    v_deleted_registrations,
    v_deleted_upload_sessions;
end;
$$;

revoke all on function public.admin_purge_all_aivex_data(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_purge_all_aivex_data(uuid, timestamptz)
  to service_role;

comment on function public.admin_purge_all_aivex_data(uuid, timestamptz) is
  'Deletes all AIVEX team records transactionally after server-side password reauthentication. Service-role only; private Storage cleanup is performed by the admin API.';

commit;
