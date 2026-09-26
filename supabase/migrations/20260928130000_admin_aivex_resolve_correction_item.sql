-- AIVEX per-item correction resolution — RPC changes.
--
-- Two additions to admin_apply_aivex_action, same signature as
-- 20260927130000_fix_admin_aivex_document_actions.sql (no drop needed):
--
--   1. request_corrections now also populates aivex_correction_items (one
--      row per requested item, kind derived from the fixed vocabulary) —
--      previously only the atomic aivex_correction_requests row existed.
--
--   2. A new action, resolve_correction_item, lets an admin (or reviewer —
--      the same role that may request a correction may resolve one) accept
--      or bounce back one resubmitted item. When every item of a request is
--      verified, the request auto-resolves and, if the registration is
--      still sitting in 'changes_required' for it, document_status advances
--      to 'under_review' — the same transition start_review already
--      performs, now reachable without an extra manual click once every
--      requested fix is actually confirmed.
--
-- Prerequisite: 20260928120000_aivex_correction_items.sql.

begin;

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
security invoker
set search_path = public
as $$
declare
  v_registration public.aivex_registrations%rowtype;
  v_correction_item public.aivex_correction_items%rowtype;
  v_administrator_role text;
  v_next_registration_status text;
  v_next_document_status text;
  v_clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_document_key text;
  v_review_status text;
  v_audit_sensitivity text := 'standard';
  v_changed_at timestamptz;
  v_latest_signed_version integer;
  v_correction_request_id uuid;
  v_correction_item_id uuid;
  v_decision text;
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

  if v_clean_reason is null or char_length(v_clean_reason) > 2000 then
    raise exception 'aivex_reason_required' using errcode = '22023';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 8192 then
    raise exception 'invalid_aivex_payload' using errcode = '22023';
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

  v_next_registration_status := v_registration.registration_status;
  v_next_document_status := v_registration.document_status;

  if p_action = 'start_review' then
    v_next_registration_status := 'under_review';
    if v_registration.document_status in ('signed_document_uploaded', 'changes_required', 'under_review') then
      v_next_document_status := 'under_review';
    end if;

  elsif p_action = 'approve_registration' then
    v_next_registration_status := 'approved';

  elsif p_action = 'request_corrections' then
    if jsonb_typeof(p_payload -> 'items') is distinct from 'array'
       or jsonb_array_length(p_payload -> 'items') not between 1 and 8
       or char_length(btrim(coalesce(p_payload ->> 'message', ''))) not between 1 and 2000
       or coalesce(p_payload ->> 'deadline', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or (p_payload ->> 'deadline')::date < p_now::date then
      raise exception 'invalid_correction_request' using errcode = '22023';
    end if;

    insert into public.aivex_correction_requests (
      registration_id, items, team_message, internal_note, due_at,
      requested_by_admin_user_id, created_at
    ) values (
      p_registration_id, p_payload -> 'items', btrim(p_payload ->> 'message'),
      v_clean_reason, (p_payload ->> 'deadline')::date, p_admin_user_id, p_now
    )
    returning id into v_correction_request_id;

    insert into public.aivex_correction_items (correction_request_id, registration_id, item, kind)
    select v_correction_request_id, p_registration_id, requested_item.value,
      case requested_item.value
        when 'Team information' then 'field'
        when 'Activities manager' then 'field'
        else 'document'
      end
    from jsonb_array_elements_text(p_payload -> 'items') as requested_item(value);

    v_next_document_status := 'changes_required';

  elsif p_action = 'resolve_correction_item' then
    v_decision := p_payload ->> 'decision';
    if v_decision not in ('verified', 'rejected') then
      raise exception 'invalid_correction_resolution' using errcode = '22023';
    end if;
    if coalesce(p_payload ->> 'itemId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'invalid_correction_resolution' using errcode = '22023';
    end if;
    v_correction_item_id := (p_payload ->> 'itemId')::uuid;

    select item.* into v_correction_item
      from public.aivex_correction_items as item
     where item.id = v_correction_item_id
       and item.registration_id = p_registration_id
       and item.status = 'submitted'
     for update;

    if not found then
      raise exception 'aivex_correction_item_not_found' using errcode = 'P0002';
    end if;

    if v_decision = 'verified' then
      update public.aivex_correction_items
         set status = 'verified', reviewed_at = p_now,
             reviewed_by_admin_user_id = p_admin_user_id, review_note = v_clean_reason
       where id = v_correction_item_id;
    else
      -- Bounced back: the row returns to 'open' with the rejected attempt
      -- cleared (aivex_correction_items_submission_shape_check requires an
      -- 'open' row to carry no submission) — the rejection itself is kept
      -- on record below via reviewed_at/reviewed_by/review_note, and in the
      -- audit event this whole action already produces.
      update public.aivex_correction_items
         set status = 'open', submitted_fields = null, submitted_document_key = null, submitted_at = null,
             reviewed_at = p_now, reviewed_by_admin_user_id = p_admin_user_id, review_note = v_clean_reason
       where id = v_correction_item_id;
    end if;

    if v_decision = 'verified' and not exists (
      select 1 from public.aivex_correction_items as remaining
       where remaining.correction_request_id = v_correction_item.correction_request_id
         and remaining.status <> 'verified'
    ) then
      update public.aivex_correction_requests
         set resolved_at = p_now, resolved_by_admin_user_id = p_admin_user_id
       where id = v_correction_item.correction_request_id
         and resolved_at is null;
      if v_registration.document_status = 'changes_required' then
        v_next_document_status := 'under_review';
      end if;
    end if;

  elsif p_action = 'verify_activity_official' then
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

  elsif p_action in ('verify_document', 'invalidate_document') then
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

    -- Keep a matching per-item correction (if any) in step with this
    -- document review: verify_document/invalidate_document is the ONLY
    -- reviewer-facing way a document gets checked, so a resubmitted student
    -- card, or a re-signed form, is resolved through the very same click an
    -- admin already makes here — never a second, separate action for it.
    -- (The two identity-document items never reach 'submitted' this way, by
    -- construction: they have no self-service resubmission path.)
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
           set status = 'verified', reviewed_at = p_now,
               reviewed_by_admin_user_id = p_admin_user_id, review_note = v_clean_reason
         where id = v_correction_item.id;

        if not exists (
          select 1 from public.aivex_correction_items as remaining
           where remaining.correction_request_id = v_correction_item.correction_request_id
             and remaining.status <> 'verified'
        ) then
          update public.aivex_correction_requests
             set resolved_at = p_now, resolved_by_admin_user_id = p_admin_user_id
           where id = v_correction_item.correction_request_id
             and resolved_at is null;
          if v_registration.document_status = 'changes_required' then
            v_next_document_status := 'under_review';
          end if;
        end if;
      else
        update public.aivex_correction_items
           set status = 'open', submitted_fields = null, submitted_document_key = null, submitted_at = null,
               reviewed_at = p_now, reviewed_by_admin_user_id = p_admin_user_id, review_note = v_clean_reason
         where id = v_correction_item.id;
      end if;
    end if;

    if p_action = 'invalidate_document' then
      v_next_document_status := 'changes_required';
    end if;

  elsif p_action = 'validate_file' then
    select max(submitted.version) into v_latest_signed_version
      from public.aivex_submitted_documents as submitted
     where submitted.registration_id = p_registration_id;

    if v_registration.registration_status <> 'approved'
       or not exists (
         select 1 from public.admin_aivex_case_overview as overview
          where overview.registration_id = p_registration_id
            and overview.completeness = 100
            and overview.student_cards_verified = true
       )
       or v_latest_signed_version is null then
      raise exception 'aivex_validation_incomplete' using errcode = '22023';
    end if;
    v_next_document_status := 'validated';
    update public.aivex_correction_requests as correction
       set resolved_at = p_now,
           resolved_by_admin_user_id = p_admin_user_id
     where correction.registration_id = p_registration_id
       and correction.resolved_at is null;

  elsif p_action = 'reject_registration' then
    v_next_registration_status := 'rejected';

  elsif p_action = 'cancel_registration' then
    v_next_registration_status := 'cancelled';
  end if;

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

revoke all on function public.admin_apply_aivex_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_apply_aivex_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) to service_role;

comment on function public.admin_apply_aivex_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) is 'Applies an authenticated AIVEX administrative action, including per-item correction resolution (resolve_correction_item).';

commit;

-- Check the result (read-only):
--
--   select pg_get_functiondef('public.admin_apply_aivex_action(uuid, uuid, text, timestamptz, text, jsonb, timestamptz)'::regprocedure);
--
--   -- After requesting a correction with 2 items, both rows exist and are 'open':
--   select item, kind, status from public.aivex_correction_items
--    where correction_request_id = '<the new request id>';
