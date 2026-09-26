-- One-step final AIVEX team acceptance.
--
-- The administrator makes one final decision after every administrative and
-- document check is complete. Registration approval and file validation are
-- committed atomically so the UI never exposes a half-approved team.

begin;

create or replace function public.admin_accept_aivex_team(
  p_registration_id uuid,
  p_admin_user_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_now timestamptz
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_registration public.aivex_registrations%rowtype;
  v_administrator_role text;
  v_clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_is_complete boolean := false;
  v_latest_signed_version integer;
  v_changed_at timestamptz;
begin
  select admin_user.role into v_administrator_role
    from public.admin_users as admin_user
   where admin_user.id = p_admin_user_id
     and admin_user.is_active = true;

  if v_administrator_role is null
     or v_administrator_role not in ('super_admin', 'administrator') then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;

  if v_clean_reason is null or char_length(v_clean_reason) > 2000 then
    raise exception 'aivex_reason_required' using errcode = '22023';
  end if;

  select registration.* into v_registration
    from public.aivex_registrations as registration
   where registration.id = p_registration_id
     and registration.form_version = 4
   for update;

  if not found then
    raise exception 'aivex_registration_not_found' using errcode = 'P0002';
  end if;

  if v_registration.updated_at is distinct from p_expected_updated_at then
    raise exception 'aivex_registration_conflict' using errcode = '40001';
  end if;

  if v_registration.registration_status in ('rejected', 'cancelled') then
    raise exception 'aivex_registration_closed' using errcode = '22023';
  end if;

  select (
    overview.completeness = 100
    and overview.student_cards_verified = true
  ) into v_is_complete
    from public.admin_aivex_case_overview as overview
   where overview.registration_id = p_registration_id;

  select max(submitted.version) into v_latest_signed_version
    from public.aivex_submitted_documents as submitted
   where submitted.registration_id = p_registration_id;

  if coalesce(v_is_complete, false) = false or v_latest_signed_version is null then
    raise exception 'aivex_validation_incomplete' using errcode = '22023';
  end if;

  update public.aivex_registrations as registration
     set registration_status = 'approved',
         document_status = 'validated',
         updated_at = p_now
   where registration.id = p_registration_id
  returning registration.updated_at into v_changed_at;

  update public.aivex_correction_requests as correction
     set resolved_at = p_now,
         resolved_by_admin_user_id = p_admin_user_id
   where correction.registration_id = p_registration_id
     and correction.resolved_at is null;

  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id,
    'aivex_registration',
    p_registration_id,
    'validate_file',
    'standard',
    jsonb_build_object(
      'reason', v_clean_reason,
      'previous_registration_status', v_registration.registration_status,
      'next_registration_status', 'approved',
      'previous_document_status', v_registration.document_status,
      'next_document_status', 'validated'
    ),
    p_now
  );

  return v_changed_at;
end;
$$;

revoke all on function public.admin_accept_aivex_team(
  uuid, uuid, timestamptz, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_accept_aivex_team(
  uuid, uuid, timestamptz, text, timestamptz
) to service_role;

comment on function public.admin_accept_aivex_team(
  uuid, uuid, timestamptz, text, timestamptz
) is 'Atomically approves an administratively complete AIVEX registration and validates its file.';

commit;
