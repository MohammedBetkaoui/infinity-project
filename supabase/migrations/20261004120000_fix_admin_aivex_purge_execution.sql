-- Make the global AIVEX purge independent from historical FK/grant drift.
--
-- Production reached this RPC but rolled the transaction back before any row
-- was deleted.  The original function relied on every historical foreign key
-- having ON DELETE CASCADE and executed with the caller's table privileges.
-- This forward migration keeps the same API while making one database layer
-- authoritative: it locks the AIVEX write set, deletes children explicitly,
-- verifies the active super administrator, and remains callable only by the
-- service role.

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

  -- A global purge must not interleave with registration/finalisation writes.
  -- The short lock timeout makes unexpected contention fail quickly instead
  -- of consuming the serverless function timeout.
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
  in access exclusive mode;

  -- Delete the complete child graph explicitly. This is safe both when the
  -- production FK is CASCADE and when an older installation retained NO
  -- ACTION. Settings and audit history deliberately remain untouched.
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
  'Atomically deletes the complete AIVEX registration graph for an active super administrator. SECURITY DEFINER, service-role-only; private Storage cleanup remains server-mediated.';

commit;
