-- Keep the global purge isolated from concurrent AIVEX writes without
-- blocking ordinary admin reads. The previous ACCESS EXCLUSIVE lock competed
-- with the detail page's read traffic and could hit lock/statement timeouts on
-- a small database instance under memory pressure.

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
security definer
set search_path = public
set lock_timeout = '5s'
set statement_timeout = '15s'
as $$
declare
  v_role text;
  v_operation_id uuid := gen_random_uuid();
  v_deleted_registrations bigint := 0;
  v_deleted_upload_sessions bigint := 0;
begin
  if p_now is null then
    raise exception 'invalid_purge_timestamp' using errcode = '22023';
  end if;

  select admin_user.role into v_role
    from public.admin_users as admin_user
   where admin_user.id = p_admin_user_id
     and admin_user.is_active = true;

  if v_role is distinct from 'super_admin' then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;

  -- SHARE ROW EXCLUSIVE blocks INSERT/UPDATE/DELETE writers while allowing
  -- ACCESS SHARE readers. This preserves one atomic global purge without
  -- making an administrator viewing a file contend with the operation.
  lock table
    public.aivex_registrations,
    public.aivex_members,
    public.aivex_students,
    public.aivex_upload_sessions,
    public.aivex_generated_documents,
    public.aivex_submitted_documents,
    public.aivex_magic_links,
    public.aivex_admin_case_reviews,
    public.aivex_admin_document_reviews,
    public.aivex_correction_requests,
    public.aivex_correction_items
  in share row exclusive mode;

  delete from public.aivex_correction_items;
  delete from public.aivex_correction_requests;
  delete from public.aivex_admin_document_reviews;
  delete from public.aivex_admin_case_reviews;
  delete from public.aivex_magic_links;
  delete from public.aivex_submitted_documents;
  delete from public.aivex_generated_documents;
  delete from public.aivex_students;
  delete from public.aivex_members;

  delete from public.aivex_upload_sessions;
  get diagnostics v_deleted_upload_sessions = row_count;

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
  'Atomically deletes the complete AIVEX registration graph for an active super administrator. Uses write-exclusive/read-compatible locks; SECURITY DEFINER and service-role-only.';

commit;
