-- Schedule the Edition 2 registration campaign and add the atomic,
-- super-administrator-only mutation used by /api/admin/aivex/settings.
-- Registration and signed-document uploads remain independent switches.

begin;

insert into public.aivex_settings (
  edition,
  edition_name,
  registration_enabled,
  registration_open_at,
  registration_close_at,
  signed_document_deadline
) values (
  2,
  'AIVEX Edition 02',
  true,
  '2026-10-25T00:00:00+01:00'::timestamptz,
  '2026-11-20T23:59:59+01:00'::timestamptz,
  '2026-11-20T23:59:59+01:00'::timestamptz
)
on conflict (edition) do update
set registration_enabled = excluded.registration_enabled,
    registration_open_at = excluded.registration_open_at,
    registration_close_at = excluded.registration_close_at,
    signed_document_deadline = excluded.signed_document_deadline;

alter table public.aivex_settings
  drop constraint if exists aivex_settings_signed_deadline_after_registration_check;
alter table public.aivex_settings
  add constraint aivex_settings_signed_deadline_after_registration_check
  check (
    signed_document_deadline is null
    or registration_close_at is null
    or signed_document_deadline >= registration_close_at
  );

alter table public.admin_audit_events
  drop constraint if exists admin_audit_object_type_check;
alter table public.admin_audit_events
  add constraint admin_audit_object_type_check
  check (object_type in (
    'join_application', 'aivex_registration', 'aivex_document',
    'club_member', 'club_staff', 'aivex_settings'
  ));

create or replace function public.admin_update_aivex_campaign_settings(
  p_admin_user_id uuid,
  p_edition smallint,
  p_registration_enabled boolean,
  p_registration_open_at timestamptz,
  p_registration_close_at timestamptz,
  p_signed_document_deadline timestamptz,
  p_now timestamptz
)
returns table (
  edition smallint,
  registration_enabled boolean,
  registration_open_at timestamptz,
  registration_close_at timestamptz,
  signed_document_deadline timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role text;
  v_old public.aivex_settings%rowtype;
  v_object_id uuid;
begin
  perform set_config('timezone', 'Africa/Algiers', true);

  select admin_user.role into v_role
    from public.admin_users as admin_user
   where admin_user.id = p_admin_user_id
     and admin_user.is_active = true;

  if v_role is distinct from 'super_admin' then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;

  if p_edition is null or p_edition <= 0
     or p_registration_enabled is null
     or p_registration_open_at is null
     or p_registration_close_at is null
     or p_signed_document_deadline is null
     or p_now is null then
    raise exception 'invalid_campaign_settings' using errcode = '22023';
  end if;
  if p_registration_close_at <= p_registration_open_at then
    raise exception 'invalid_registration_window' using errcode = '22023';
  end if;
  if p_signed_document_deadline < p_registration_close_at then
    raise exception 'invalid_signed_document_deadline' using errcode = '22023';
  end if;

  select * into v_old
    from public.aivex_settings
   where aivex_settings.edition = p_edition
   for update;
  if not found then
    raise exception 'aivex_settings_not_found' using errcode = 'P0002';
  end if;

  update public.aivex_settings
     set registration_enabled = p_registration_enabled,
         registration_open_at = p_registration_open_at,
         registration_close_at = p_registration_close_at,
         signed_document_deadline = p_signed_document_deadline
   where aivex_settings.edition = p_edition;

  v_object_id := format(
    '00000000-0000-0000-0000-%s',
    lpad(p_edition::text, 12, '0')
  )::uuid;

  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id,
    'aivex_settings',
    v_object_id,
    'aivex_campaign_settings_updated',
    'standard',
    jsonb_build_object(
      'edition', p_edition,
      'oldRegistrationEnabled', v_old.registration_enabled,
      'newRegistrationEnabled', p_registration_enabled,
      'oldRegistrationOpenAt', v_old.registration_open_at,
      'newRegistrationOpenAt', p_registration_open_at,
      'oldRegistrationCloseAt', v_old.registration_close_at,
      'newRegistrationCloseAt', p_registration_close_at,
      'oldSignedDocumentDeadline', v_old.signed_document_deadline,
      'newSignedDocumentDeadline', p_signed_document_deadline
    ),
    p_now
  );

  return query
  select settings.edition,
         settings.registration_enabled,
         settings.registration_open_at,
         settings.registration_close_at,
         settings.signed_document_deadline
    from public.aivex_settings as settings
   where settings.edition = p_edition;
end;
$$;

revoke all on function public.admin_update_aivex_campaign_settings(
  uuid, smallint, boolean, timestamptz, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_update_aivex_campaign_settings(
  uuid, smallint, boolean, timestamptz, timestamptz, timestamptz, timestamptz
) to service_role;

comment on function public.admin_update_aivex_campaign_settings(
  uuid, smallint, boolean, timestamptz, timestamptz, timestamptz, timestamptz
) is
  'Atomically updates only AIVEX campaign registration dates/flag and the signed-document deadline for an active super administrator, with a safe audit event.';

commit;
