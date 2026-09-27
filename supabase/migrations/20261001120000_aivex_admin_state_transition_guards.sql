-- Prevent administrative AIVEX actions from reopening or contradicting a
-- terminal registration/document state. The existing implementation is kept
-- private and is reachable only through the guarded RPC below.

begin;

alter function public.admin_apply_aivex_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) rename to admin_apply_aivex_action_unchecked;

revoke all on function public.admin_apply_aivex_action_unchecked(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.aivex_admin_action_transition_allowed(
  p_action text,
  p_registration_status text,
  p_document_status text,
  p_has_open_correction boolean
)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = public
as $$
  select case
    -- A rejected/cancelled registration and a validated document are closed.
    -- No action handled by the legacy administrative RPC may mutate them.
    when p_registration_status in ('rejected', 'cancelled')
      or p_document_status = 'validated'
      then false

    -- Manual review start is intentionally narrower than the automatic review
    -- wrapper: it is a one-way submitted -> under_review transition after the
    -- signed form has arrived, never a way out of a correction/final state.
    when p_action = 'start_review'
      then p_registration_status = 'submitted'
       and p_document_status = 'signed_document_uploaded'
       and not p_has_open_correction

    -- Preserve the historical two-step approval path for trusted callers, but
    -- only once the file is genuinely under review and no correction is open.
    -- Normal dashboard acceptance remains the atomic admin_accept_aivex_team RPC.
    when p_action = 'approve_registration'
      then p_registration_status = 'under_review'
       and p_document_status = 'under_review'
       and not p_has_open_correction

    -- Rejection and cancellation are terminal decisions. They may only close
    -- an active (submitted/reviewing) registration and can never replace an
    -- existing approved, rejected, or cancelled decision.
    when p_action in ('reject_registration', 'cancel_registration')
      then p_registration_status in ('submitted', 'under_review')

    -- Correction/review actions retain their existing detailed validation in
    -- the implementation RPC; the terminal-state rule above still applies.
    else true
  end;
$$;

revoke all on function public.aivex_admin_action_transition_allowed(
  text, text, text, boolean
) from public, anon, authenticated, service_role;

create or replace function public.admin_apply_aivex_action(
  p_registration_id uuid,
  p_admin_user_id uuid,
  p_action text,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_payload jsonb,
  p_now timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.aivex_registrations%rowtype;
  v_administrator_role text;
  v_has_open_correction boolean;
begin
  select admin_user.role into v_administrator_role
    from public.admin_users as admin_user
   where admin_user.id = p_admin_user_id
     and admin_user.is_active = true;

  if v_administrator_role is null then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;

  if p_action not in (
    'start_review', 'approve_registration', 'request_corrections',
    'validate_file', 'reject_registration', 'cancel_registration',
    'verify_activity_official', 'verify_document', 'invalidate_document',
    'resolve_correction_item'
  ) then
    raise exception 'invalid_aivex_action' using errcode = '22023';
  end if;

  if v_administrator_role = 'reviewer' and p_action not in (
    'start_review', 'request_corrections', 'verify_activity_official',
    'verify_document', 'invalidate_document', 'resolve_correction_item'
  ) then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;

  select registration.* into v_registration
    from public.aivex_registrations as registration
   where registration.id = p_registration_id
     and registration.form_version = 4
   for update;

  if not found then
    raise exception 'aivex_registration_not_found' using errcode = 'P0002';
  end if;

  -- Keep optimistic concurrency ahead of the state decision. A stale admin
  -- tab receives the established conflict response, never a decision made
  -- against newer state.
  if v_registration.updated_at is distinct from p_expected_updated_at then
    raise exception 'aivex_registration_conflict' using errcode = '40001';
  end if;

  select exists (
    select 1
      from public.aivex_correction_requests as correction
     where correction.registration_id = p_registration_id
       and correction.resolved_at is null
  ) into v_has_open_correction;

  if not public.aivex_admin_action_transition_allowed(
    p_action,
    v_registration.registration_status,
    v_registration.document_status,
    v_has_open_correction
  ) then
    raise exception 'aivex_invalid_state_transition' using errcode = '55000';
  end if;

  return public.admin_apply_aivex_action_unchecked(
    p_registration_id,
    p_admin_user_id,
    p_action,
    p_expected_updated_at,
    p_reason,
    p_payload,
    p_now
  );
end;
$$;

revoke all on function public.admin_apply_aivex_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_apply_aivex_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) to service_role;

comment on function public.admin_apply_aivex_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) is 'Applies an authenticated AIVEX administrative action after enforcing optimistic concurrency and terminal-state transition guards.';

comment on function public.aivex_admin_action_transition_allowed(
  text, text, text, boolean
) is 'Internal AIVEX state-machine policy used by admin_apply_aivex_action; not executable by API roles.';

commit;

