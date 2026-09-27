-- Make the first meaningful AIVEX review action one atomic database action.
--
-- The previous wrapper updated a fresh registration before delegating to two
-- more RPC layers. aivex_registrations_touch_updated_at changes updated_at on
-- every UPDATE, so that pre-transition invalidated p_expected_updated_at
-- inside the same request. This function owns validation, the registration
-- lock, the automatic review transition, the review write, and the audit.

begin;

create or replace function public.admin_apply_aivex_review_action(
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
security invoker
set search_path = public
set lock_timeout = '3s'
as $$
declare
  v_registration public.aivex_registrations%rowtype;
  v_correction_item public.aivex_correction_items%rowtype;
  v_administrator_role text;
  v_observed_updated_at timestamptz;
  v_next_registration_status text;
  v_next_document_status text;
  v_clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_document_key text;
  v_review_status text;
  v_audit_sensitivity text := 'standard';
  v_changed_at timestamptz;
  v_decision text;
begin
  select admin_user.role into v_administrator_role
    from public.admin_users as admin_user
   where admin_user.id = p_admin_user_id
     and admin_user.is_active = true;

  if v_administrator_role is null
     or v_administrator_role not in ('super_admin', 'administrator', 'reviewer') then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;

  if p_action not in ('verify_activity_official', 'verify_document', 'invalidate_document') then
    raise exception 'invalid_aivex_action' using errcode = '22023';
  end if;

  if v_clean_reason is null or char_length(v_clean_reason) > 2000 then
    raise exception 'aivex_reason_required' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 8192 then
    raise exception 'invalid_aivex_payload' using errcode = '22023';
  end if;

  -- A stale browser token can be rejected from the last committed row without
  -- waiting behind a concurrent writer. The value is checked again after the
  -- one authoritative row lock to close the read/lock race.
  select registration.updated_at into v_observed_updated_at
    from public.aivex_registrations as registration
   where registration.id = p_registration_id
     and registration.form_version = 4;

  if not found then
    raise exception 'aivex_registration_not_found' using errcode = 'P0002';
  end if;

  if v_observed_updated_at is distinct from p_expected_updated_at then
    raise exception 'aivex_registration_conflict' using errcode = '40001';
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

  -- Preserve the terminal-state policy introduced by
  -- 20261001120000_aivex_admin_state_transition_guards.sql.
  if v_registration.registration_status in ('rejected', 'cancelled')
     or v_registration.document_status = 'validated' then
    raise exception 'aivex_invalid_state_transition' using errcode = '55000';
  end if;

  v_next_registration_status := v_registration.registration_status;
  v_next_document_status := v_registration.document_status;

  if v_registration.registration_status = 'submitted'
     and v_registration.document_status = 'signed_document_uploaded' then
    v_next_registration_status := 'under_review';
    v_next_document_status := 'under_review';
  end if;

  if p_action = 'verify_activity_official' then
    if jsonb_typeof(p_payload -> 'verified') is distinct from 'boolean' then
      raise exception 'invalid_activity_verification' using errcode = '22023';
    end if;

    insert into public.aivex_admin_case_reviews (
      registration_id, activity_official_verified, updated_by_admin_user_id,
      created_at, updated_at
    ) values (
      p_registration_id, (p_payload ->> 'verified')::boolean,
      p_admin_user_id, p_now, p_now
    )
    on conflict on constraint aivex_admin_case_reviews_pkey do update
      set activity_official_verified = excluded.activity_official_verified,
          updated_by_admin_user_id = excluded.updated_by_admin_user_id,
          updated_at = excluded.updated_at;

  else
    v_document_key := btrim(coalesce(p_payload ->> 'documentKey', ''));
    if v_document_key !~ '^(student-[1-3]|delegation-leader|driver|signed-v[1-9][0-9]*)$' then
      raise exception 'invalid_aivex_document' using errcode = '22023';
    end if;

    if v_document_key like 'student-%' and not exists (
      select 1 from public.aivex_students as student
       where student.registration_id = p_registration_id
         and student.position = substring(v_document_key from '[1-3]$')::integer
         and student.student_card_path is not null
    ) then
      raise exception 'aivex_document_not_found' using errcode = 'P0002';
    elsif v_document_key = 'delegation-leader'
      and v_registration.delegation_head_id_card_path is null then
      raise exception 'aivex_document_not_found' using errcode = 'P0002';
    elsif v_document_key = 'driver'
      and v_registration.driver_id_card_path is null then
      raise exception 'aivex_document_not_found' using errcode = 'P0002';
    elsif v_document_key like 'signed-v%' and not exists (
      select 1 from public.aivex_submitted_documents as submitted
       where submitted.registration_id = p_registration_id
         and submitted.version = substring(v_document_key from '[0-9]+$')::integer
    ) then
      raise exception 'aivex_document_not_found' using errcode = 'P0002';
    end if;

    v_review_status := case when p_action = 'verify_document' then 'verified' else 'invalid' end;
    v_audit_sensitivity := 'confidential';

    insert into public.aivex_admin_document_reviews (
      registration_id, document_key, review_status, note,
      reviewed_by_admin_user_id, reviewed_at, created_at, updated_at
    ) values (
      p_registration_id, v_document_key, v_review_status, v_clean_reason,
      p_admin_user_id, p_now, p_now, p_now
    )
    on conflict on constraint aivex_admin_document_reviews_registration_key do update
      set review_status = excluded.review_status,
          note = excluded.note,
          reviewed_by_admin_user_id = excluded.reviewed_by_admin_user_id,
          reviewed_at = excluded.reviewed_at,
          updated_at = excluded.updated_at;

    -- Keep a submitted document correction synchronized with its SecureViewer
    -- decision. The registration lock above remains the only registration lock.
    select item.* into v_correction_item
      from public.aivex_correction_items as item
     where item.registration_id = p_registration_id
       and item.submitted_document_key = v_document_key
       and item.status = 'submitted'
     for update;

    if found then
      v_decision := case when p_action = 'verify_document' then 'verified' else 'rejected' end;

      if p_action = 'verify_document' then
        update public.aivex_correction_items
           set status = 'verified',
               reviewed_at = p_now,
               reviewed_by_admin_user_id = p_admin_user_id,
               review_note = v_clean_reason
         where id = v_correction_item.id;

        if not exists (
          select 1 from public.aivex_correction_items as remaining
           where remaining.correction_request_id = v_correction_item.correction_request_id
             and remaining.status <> 'verified'
        ) then
          update public.aivex_correction_requests
             set resolved_at = p_now,
                 resolved_by_admin_user_id = p_admin_user_id
           where id = v_correction_item.correction_request_id
             and resolved_at is null;

          if v_registration.document_status = 'changes_required' then
            v_next_document_status := 'under_review';
          end if;
        end if;
      else
        update public.aivex_correction_items
           set status = 'open',
               submitted_fields = null,
               submitted_document_key = null,
               submitted_at = null,
               reviewed_at = p_now,
               reviewed_by_admin_user_id = p_admin_user_id,
               review_note = v_clean_reason
         where id = v_correction_item.id;
      end if;
    end if;

    if p_action = 'invalidate_document' then
      v_next_document_status := 'changes_required';
    end if;
  end if;

  -- This is the only registration UPDATE in the review action. The touch
  -- trigger may now advance updated_at without invalidating a nested call.
  update public.aivex_registrations as registration
     set registration_status = v_next_registration_status,
         document_status = v_next_document_status,
         updated_at = p_now
   where registration.id = p_registration_id
  returning registration.updated_at into v_changed_at;

  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id,
    case when p_action in ('verify_document', 'invalidate_document')
      then 'aivex_document' else 'aivex_registration' end,
    p_registration_id,
    p_action,
    v_audit_sensitivity,
    jsonb_strip_nulls(jsonb_build_object(
      'reason', v_clean_reason,
      'document_key', v_document_key,
      'correction_item', v_correction_item.item,
      'correction_decision', v_decision,
      'previous_registration_status', v_registration.registration_status,
      'next_registration_status', v_next_registration_status,
      'previous_document_status', v_registration.document_status,
      'next_document_status', v_next_document_status
    )),
    p_now
  );

  return v_changed_at;
end;
$$;

revoke all on function public.admin_apply_aivex_review_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_apply_aivex_review_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) to service_role;

comment on function public.admin_apply_aivex_review_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) is 'Atomically applies an AIVEX review action with one registration lock, automatic first-review transition, optimistic concurrency, terminal-state guards, and a three-second lock timeout.';

commit;
