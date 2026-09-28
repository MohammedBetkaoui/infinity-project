-- Make the global AIVEX purge pass pg-safeupdate on the Supabase Data API.
--
-- When pg-safeupdate is loaded on the API (PostgREST) connections, which is
-- what `session_preload_libraries = safeupdate` on the authenticator role
-- does, every DELETE or UPDATE without a WHERE clause is rejected with
-- "DELETE requires a WHERE clause" (SQLSTATE 21000). The check runs at
-- parse analysis, so it also applies to the statements inside a function
-- called through the API. Every previous version of this function deleted
-- with a bare `delete from <table>;`: the RPC therefore failed on its first
-- delete, before removing a single row, and the admin API answered 503. The
-- same call from the SQL editor (a session without safeupdate) succeeds,
-- which hid the cause.
--
-- `where true` is the qualification pg-safeupdate itself documents for an
-- intentional full-table delete. Everything else is unchanged from
-- 20261005120000_reduce_aivex_purge_lock_contention.sql: same API, same
-- write-exclusive/read-compatible locks, same deletion graph and audit.

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

  -- Every delete is deliberately qualified: see the header (pg-safeupdate).
  delete from public.aivex_correction_items where true;
  delete from public.aivex_correction_requests where true;
  delete from public.aivex_admin_document_reviews where true;
  delete from public.aivex_admin_case_reviews where true;
  delete from public.aivex_magic_links where true;
  delete from public.aivex_submitted_documents where true;
  delete from public.aivex_generated_documents where true;
  delete from public.aivex_students where true;
  delete from public.aivex_members where true;

  delete from public.aivex_upload_sessions where true;
  get diagnostics v_deleted_upload_sessions = row_count;

  delete from public.aivex_registrations where true;
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
  'Atomically deletes the complete AIVEX registration graph for an active super administrator. Every delete is WHERE-qualified so the call passes pg-safeupdate on the Data API. Write-exclusive/read-compatible locks; SECURITY DEFINER and service-role-only.';

commit;

-- Check once applied (read-only). Expected: one row, unqualified_deletes = 0.
--   select p.oid::regprocedure as function_name,
--          (select count(*) from regexp_matches(lower(p.prosrc), 'delete from public\.[a-z_]+\s*;', 'g')) as unqualified_deletes
--     from pg_proc as p
--    where p.proname = 'admin_purge_all_aivex_data';
