-- Reduce the number of PostgREST/database round trips needed by the AIVEX
-- admin and candidate pages. All functions remain server-only and return no
-- private Storage path, raw Magic Link token, or administrator credential.

begin;

create index if not exists aivex_registrations_admin_queue_idx
  on public.aivex_registrations (form_version, edition, submitted_at desc);

create index if not exists admin_audit_events_aivex_object_created_idx
  on public.admin_audit_events (object_id, created_at desc)
  where object_type in ('aivex_registration', 'aivex_document');

create or replace function public.admin_list_aivex_cases(
  p_edition smallint,
  p_page integer,
  p_limit integer,
  p_query text,
  p_registration_status text,
  p_document_status text,
  p_wilaya text,
  p_institution text,
  p_complete text,
  p_signed text,
  p_date_from date,
  p_date_to date,
  p_sort text
)
returns jsonb
language sql
stable
security invoker
set search_path = public
set statement_timeout = '8s'
as $$
  with edition_rows as materialized (
    select overview.*
      from public.admin_aivex_case_overview as overview
     where overview.edition = p_edition
  ),
  filtered as materialized (
    select overview.*
      from edition_rows as overview
     where (nullif(btrim(p_query), '') is null or overview.search_text ilike '%' || btrim(p_query) || '%')
       and (p_registration_status is null or overview.registration_status = p_registration_status)
       and (p_document_status is null or overview.document_status = p_document_status)
       and (p_wilaya is null or case when p_wilaya ~ '^\d{2}$'
              then overview.wilaya_code = p_wilaya
              else overview.wilaya_name = p_wilaya end)
       and (p_institution is null or overview.institution_name = p_institution)
       and (p_complete is null
            or (p_complete = 'complete' and overview.completeness = 100)
            or (p_complete = 'incomplete' and overview.completeness < 100))
       and (p_signed is null
            or (p_signed = 'present' and overview.signed_document_received)
            or (p_signed = 'absent' and not overview.signed_document_received))
       and (p_date_from is null or overview.submitted_at >= p_date_from::timestamptz)
       and (p_date_to is null or overview.submitted_at < (p_date_to + 1)::timestamptz)
  ),
  page_rows as materialized (
    select filtered.*,
           row_number() over (
             order by
               case when p_sort = 'attention_asc' then attention_rank end asc,
               case when p_sort = 'attention_desc' then attention_rank end desc,
               case when p_sort = 'completion_asc' then completeness end asc,
               case when p_sort = 'completion_desc' then completeness end desc,
               case when p_sort = 'reference_asc' then reference end asc,
               case when p_sort = 'reference_desc' then reference end desc,
               case when p_sort = 'team_asc' then team_name end asc,
               case when p_sort = 'team_desc' then team_name end desc,
               case when p_sort = 'institution_asc' then institution_name end asc,
               case when p_sort = 'institution_desc' then institution_name end desc,
               case when p_sort = 'wilaya_asc' then wilaya_code end asc,
               case when p_sort = 'wilaya_desc' then wilaya_code end desc,
               case when p_sort = 'registration_asc' then registration_status end asc,
               case when p_sort = 'registration_desc' then registration_status end desc,
               case when p_sort = 'document_asc' then document_status end asc,
               case when p_sort = 'document_desc' then document_status end desc,
               case when p_sort = 'submitted_asc' then submitted_at end asc,
               case when p_sort = 'submitted_desc' then submitted_at end desc,
               case when p_sort = 'updated_asc' then updated_at end asc,
               case when p_sort = 'updated_desc' then updated_at end desc,
               submitted_at desc,
               reference asc
           ) as internal_row_number
      from filtered
     offset (greatest(p_page, 1) - 1) * least(greatest(p_limit, 1), 100)
     limit least(greatest(p_limit, 1), 100)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        to_jsonb(page_row) - 'registration_id' - 'search_text' - 'internal_row_number'
        order by page_row.internal_row_number
      )
        from page_rows as page_row
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'summary', jsonb_build_object(
      'registered', (select count(*) from edition_rows),
      'complete', (select count(*) from edition_rows where completeness = 100),
      'awaitingSignature', (select count(*) from edition_rows where document_status = 'awaiting_signature'),
      'signedReceived', (select count(*) from edition_rows where signed_document_received),
      'underReview', (select count(*) from edition_rows where document_status = 'under_review'),
      'corrections', (select count(*) from edition_rows where document_status = 'changes_required'),
      'validated', (select count(*) from edition_rows where document_status = 'validated'),
      'documentCounts', jsonb_build_object(
        'not_generated', (select count(*) from edition_rows where document_status = 'not_generated'),
        'generating', (select count(*) from edition_rows where document_status = 'generating'),
        'awaiting_signature', (select count(*) from edition_rows where document_status = 'awaiting_signature'),
        'signed_document_uploaded', (select count(*) from edition_rows where document_status = 'signed_document_uploaded'),
        'under_review', (select count(*) from edition_rows where document_status = 'under_review'),
        'changes_required', (select count(*) from edition_rows where document_status = 'changes_required'),
        'validated', (select count(*) from edition_rows where document_status = 'validated'),
        'generation_failed', (select count(*) from edition_rows where document_status = 'generation_failed'),
        'expired', (select count(*) from edition_rows where document_status = 'expired')
      )
    ),
    'facets', jsonb_build_object(
      'wilayas', coalesce((
        select jsonb_agg(facet.label order by facet.label)
          from (
            select distinct concat(overview.wilaya_code, ' · ', overview.wilaya_name) as label
              from edition_rows as overview
             where overview.wilaya_code is not null and overview.wilaya_name is not null
          ) as facet
      ), '[]'::jsonb),
      'institutions', coalesce((
        select jsonb_agg(facet.institution_name order by facet.institution_name)
          from (
            select distinct overview.institution_name
              from edition_rows as overview
             where overview.institution_name is not null
          ) as facet
      ), '[]'::jsonb)
    )
  );
$$;

create or replace function public.admin_get_aivex_detail(p_reference text)
returns jsonb
language sql
stable
security invoker
set search_path = public
set statement_timeout = '8s'
as $$
  with registration as materialized (
    select registration.*
      from public.aivex_registrations as registration
     where registration.reference = p_reference
       and registration.form_version = 4
     limit 1
  )
  select jsonb_build_object(
    'registration',
      to_jsonb(registration)
      || jsonb_build_object(
        'delegation_head_id_card_path', registration.delegation_head_id_card_path is not null,
        'driver_id_card_path', registration.driver_id_card_path is not null
      )
      - 'delegation_head_id_card_sha256'
      - 'driver_id_card_sha256',
    'overview', (
      select to_jsonb(overview) - 'registration_id' - 'search_text'
        from public.admin_aivex_case_overview as overview
       where overview.registration_id = registration.id
    ),
    'students', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position', student.position,
          'full_name', student.full_name,
          'phone', student.phone,
          'bac_year', student.bac_year,
          'rfid_number', student.rfid_number,
          'student_card_path', student.student_card_path is not null,
          'student_card_mime', student.student_card_mime,
          'student_card_size_bytes', student.student_card_size_bytes,
          'created_at', student.created_at,
          'updated_at', student.updated_at
        ) order by student.position
      ) from public.aivex_students as student
         where student.registration_id = registration.id
    ), '[]'::jsonb),
    'generatedDocuments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'document_type', generated.document_type,
          'generation_status', generated.generation_status,
          'mime_type', generated.mime_type,
          'file_size_bytes', generated.file_size_bytes,
          'template_version', generated.template_version,
          'error_code', generated.error_code,
          'created_at', generated.created_at,
          'updated_at', generated.updated_at
        ) order by generated.created_at desc
      ) from public.aivex_generated_documents as generated
         where generated.registration_id = registration.id
    ), '[]'::jsonb),
    'submittedDocuments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'version', submitted.version,
          'original_file_name', submitted.original_file_name,
          'mime_type', submitted.mime_type,
          'size_bytes', submitted.size_bytes,
          'status', submitted.status,
          'uploaded_at', submitted.uploaded_at,
          'created_at', submitted.created_at,
          'updated_at', submitted.updated_at
        ) order by submitted.version desc
      ) from public.aivex_submitted_documents as submitted
         where submitted.registration_id = registration.id
    ), '[]'::jsonb),
    'documentReviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'document_key', review.document_key,
        'review_status', review.review_status,
        'note', review.note,
        'reviewed_at', review.reviewed_at,
        'reviewer', case when reviewer.id is null then null
          else jsonb_build_object('display_name', reviewer.display_name) end
      ))
        from public.aivex_admin_document_reviews as review
        left join public.admin_users as reviewer
          on reviewer.id = review.reviewed_by_admin_user_id
       where review.registration_id = registration.id
    ), '[]'::jsonb),
    'corrections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', correction.id,
        'items', correction.items,
        'team_message', correction.team_message,
        'internal_note', correction.internal_note,
        'due_at', correction.due_at,
        'created_at', correction.created_at,
        'resolved_at', correction.resolved_at,
        'requester', case when requester.id is null then null
          else jsonb_build_object('display_name', requester.display_name) end
      ) order by correction.created_at desc)
        from public.aivex_correction_requests as correction
        left join public.admin_users as requester
          on requester.id = correction.requested_by_admin_user_id
       where correction.registration_id = registration.id
    ), '[]'::jsonb),
    'correctionItems', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'correction_request_id', item.correction_request_id,
        'item', item.item,
        'kind', item.kind,
        'status', item.status,
        'submitted_fields', item.submitted_fields,
        'submitted_document_key', item.submitted_document_key,
        'submitted_at', item.submitted_at,
        'reviewed_at', item.reviewed_at,
        'review_note', item.review_note,
        'reviewer', case when reviewer.id is null then null
          else jsonb_build_object('display_name', reviewer.display_name) end
      ) order by item.created_at)
        from public.aivex_correction_items as item
        left join public.admin_users as reviewer
          on reviewer.id = item.reviewed_by_admin_user_id
       where item.registration_id = registration.id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', audit.action,
        'sensitivity', audit.sensitivity,
        'metadata', audit.metadata,
        'created_at', audit.created_at,
        'administrator', case when administrator.id is null then null
          else jsonb_build_object('display_name', administrator.display_name) end
      ) order by audit.created_at desc)
        from public.admin_audit_events as audit
        left join public.admin_users as administrator
          on administrator.id = audit.admin_user_id
       where audit.object_type in ('aivex_registration', 'aivex_document')
         and audit.object_id = registration.id
    ), '[]'::jsonb)
  )
  from registration;
$$;

create or replace function public.server_get_aivex_magic_link_status(
  p_token_hash text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '5s'
as $$
declare
  v_link public.aivex_magic_links%rowtype;
  v_registration public.aivex_registrations%rowtype;
  v_signed jsonb;
  v_correction jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_now is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  select link.* into v_link
    from public.aivex_magic_links as link
   where link.token_hash = p_token_hash;

  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if v_link.revoked_at is not null then return jsonb_build_object('status', 'revoked'); end if;
  if v_link.expires_at <= p_now then return jsonb_build_object('status', 'expired'); end if;

  select registration.* into v_registration
    from public.aivex_registrations as registration
   where registration.id = v_link.registration_id;

  if not found then return jsonb_build_object('status', 'registration_not_found'); end if;

  -- `last_used_at` is only a coarse forensic signal. Throttling this write
  -- prevents every status read from generating WAL and row contention.
  if v_link.last_used_at is null or v_link.last_used_at <= p_now - interval '6 hours' then
    update public.aivex_magic_links
       set last_used_at = p_now
     where id = v_link.id;
  end if;

  if v_registration.document_status not in ('not_generated', 'generating') then
    select jsonb_build_object('version', submitted.version, 'uploadedAt', submitted.uploaded_at)
      into v_signed
      from public.aivex_submitted_documents as submitted
     where submitted.registration_id = v_registration.id
     order by submitted.version desc
     limit 1;
  end if;

  select jsonb_build_object(
    'deadline', correction.due_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'item', item.item,
        'kind', item.kind,
        'status', item.status
      ) order by item.created_at)
        from public.aivex_correction_items as item
       where item.correction_request_id = correction.id
    ), '[]'::jsonb)
  ) into v_correction
    from public.aivex_correction_requests as correction
   where correction.registration_id = v_registration.id
     and correction.resolved_at is null
   order by correction.created_at desc
   limit 1;

  return jsonb_build_object(
    'status', 'valid',
    'registration', jsonb_build_object(
      'reference', v_registration.reference,
      'team_name', v_registration.team_name,
      'wilaya_code', v_registration.wilaya_code,
      'wilaya_name', v_registration.wilaya_name,
      'institution_id', v_registration.institution_id,
      'institution_name', v_registration.institution_name,
      'institution_custom', v_registration.institution_custom,
      'activity_official_role', v_registration.activity_official_role,
      'activity_official_name', v_registration.activity_official_name,
      'activity_official_email', v_registration.activity_official_email,
      'activity_official_phone', v_registration.activity_official_phone,
      'student_count', v_registration.student_count,
      'registration_status', v_registration.registration_status,
      'document_status', v_registration.document_status
    ),
    'signedDocument', v_signed,
    'correctionRequest', v_correction
  );
end;
$$;

revoke all on function public.admin_list_aivex_cases(
  smallint, integer, integer, text, text, text, text, text, text, text, date, date, text
) from public, anon, authenticated;
grant execute on function public.admin_list_aivex_cases(
  smallint, integer, integer, text, text, text, text, text, text, text, date, date, text
) to service_role;

revoke all on function public.admin_get_aivex_detail(text)
  from public, anon, authenticated;
grant execute on function public.admin_get_aivex_detail(text)
  to service_role;

revoke all on function public.server_get_aivex_magic_link_status(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.server_get_aivex_magic_link_status(text, timestamptz)
  to service_role;

comment on function public.admin_list_aivex_cases(
  smallint, integer, integer, text, text, text, text, text, text, text, date, date, text
) is 'Returns one paginated AIVEX admin queue payload from one materialized view evaluation; service-role-only.';

comment on function public.admin_get_aivex_detail(text) is
  'Returns one server-only AIVEX detail bundle without exposing private Storage paths.';

comment on function public.server_get_aivex_magic_link_status(text, timestamptz) is
  'Resolves one hashed Magic Link into candidate-safe status in one call and throttles forensic writes; service-role-only.';

commit;
