-- Workshop private links: members AND staff, "new applications" tracking, and
-- registration that no longer depends on the event lifecycle.
--
--   * Eligible participants are now every membership application whose
--     join_type is 'member' or 'staff' (any review status), not members only.
--   * admin_event_applicant_links is a per-event read model: one row per
--     (event, application) with the invitation / link / registration state.
--     A NULL invitation_id means "no private link generated yet", which is how
--     the dashboard finds the applications that joined after the first batch.
--   * club_event_invitations.link_exported_at records the first CSV export of a
--     link, so "export only the new ones" is a plain filter.
--   * Registration through a private link is open at every lifecycle status
--     except cancelled and archived. The workshop can therefore go straight
--     from planned to ongoing; the registration_open / registration_closed
--     states stay valid for existing events.
-- Forward-only. Check-in (scanner) is untouched and still requires 'ongoing'.

begin;

-- 1. Export tracking ---------------------------------------------------------------------

alter table public.club_event_invitations
  add column if not exists link_exported_at timestamptz;

create index if not exists club_event_invitation_unexported_idx
  on public.club_event_invitations (event_id)
  where link_exported_at is null;

-- Links exported before this column existed: an export materialises every
-- active link, so invitations created before the last recorded export of their
-- event count as exported.
update public.club_event_invitations invitation
   set link_exported_at = exported.last_exported_at
  from (
    select audit.object_id as event_id, max(audit.created_at) as last_exported_at
      from public.admin_audit_events audit
     where audit.object_type = 'club_event'
       and audit.action = 'workshop_invitation_links_exported'
     group by audit.object_id
  ) exported
 where invitation.event_id = exported.event_id
   and invitation.link_exported_at is null
   and invitation.invite_token_hash is not null
   and invitation.invited_at <= exported.last_exported_at;

-- 2. Per-event applicant / link read model ------------------------------------------------

drop view if exists public.admin_event_applicant_links;

create view public.admin_event_applicant_links
with (security_invoker = true)
as
select
  event.id as event_id,
  application.id as application_id,
  application.join_type,
  application.full_name,
  application.email,
  application.department,
  application.staff_department,
  application.submitted_at as application_submitted_at,
  invitation.id as invitation_id,
  invitation.status as invitation_status,
  invitation.invited_at,
  invitation.registered_at as invitation_registered_at,
  invitation.link_revoked_at,
  invitation.invite_token_hash,
  invitation.invite_expires_at,
  invitation.credential_version,
  invitation.credential_derivation_version,
  invitation.link_exported_at,
  registration.status as registration_status,
  registration.university_speciality,
  registration.registered_at as registration_registered_at,
  registration.checked_in_at,
  registration.absent_at
from public.club_events event
cross join public.membership_applications application
left join public.club_event_invitations invitation
  on invitation.event_id = event.id and invitation.membership_application_id = application.id
left join public.club_event_registrations registration
  on registration.invitation_id = invitation.id
where application.join_type in ('member', 'staff');

revoke all on table public.admin_event_applicant_links from anon, authenticated;
grant select on table public.admin_event_applicant_links to service_role;
comment on view public.admin_event_applicant_links is
  'Server-only: every member and staff application crossed with each event, with its private-link, export and registration state. invitation_id IS NULL means no link was generated yet.';

-- 3. Generating links for members and staff ---------------------------------------------

drop function if exists public.admin_invite_club_event_applicants(uuid,uuid,uuid[],text,timestamptz);

create function public.admin_invite_club_event_applicants(
  p_event_id uuid,
  p_admin_user_id uuid,
  p_application_ids uuid[] default null,
  p_scope text default null,
  p_now timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  administrator_role text;
  event_row public.club_events%rowtype;
  application_ids_clean uuid[];
  requested_count integer := 0;
  added_count integer := 0;
  added_members integer := 0;
  added_staff integer := 0;
  changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if p_application_ids is not null and p_scope is not null
    then raise exception 'invalid_invitation_scope' using errcode = '22023'; end if;
  if p_application_ids is null and coalesce(p_scope, '') <> 'all_applicants'
    then raise exception 'invalid_invitation_scope' using errcode = '22023'; end if;

  select * into event_row from public.club_events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if event_row.event_type <> 'workshop' or event_row.status in ('cancelled','archived')
    then raise exception 'event_not_available' using errcode = '22023'; end if;

  if p_application_ids is not null then
    if coalesce(array_length(p_application_ids, 1), 0) < 1
      or coalesce(array_length(p_application_ids, 1), 0) > 500
      or (select count(distinct selected.application_id)
            from unnest(p_application_ids) as selected(application_id))
         <> coalesce(array_length(p_application_ids, 1), 0)
    then raise exception 'invalid_invitation_applicants' using errcode = '22023'; end if;
    -- Eligibility is join_type in ('member','staff'): every review status.
    if (select count(*) from public.membership_applications
         where id = any(p_application_ids) and join_type in ('member','staff'))
       <> coalesce(array_length(p_application_ids, 1), 0)
    then raise exception 'unknown_application' using errcode = '22023'; end if;
    select coalesce(array_agg(id order by id), '{}') into application_ids_clean
      from public.membership_applications
     where id = any(p_application_ids) and join_type in ('member','staff');
    requested_count := coalesce(array_length(application_ids_clean, 1), 0);
  else
    select count(*) into requested_count
      from public.membership_applications where join_type in ('member','staff');
  end if;

  with target as (
    select application.id, application.join_type
    from public.membership_applications application
    where application.join_type in ('member','staff')
      and (
        (application_ids_clean is not null and application.id = any(application_ids_clean))
        or p_scope = 'all_applicants'
      )
  ), inserted as (
    insert into public.club_event_invitations
      (event_id, membership_application_id, status, invited_at, invited_by_admin_user_id, created_at)
    select p_event_id, target.id, 'invited', changed_at, p_admin_user_id, changed_at
    from target
    on conflict (event_id, membership_application_id) do nothing
    returning membership_application_id
  )
  select
    count(*)::integer,
    count(*) filter (where target.join_type = 'member')::integer,
    count(*) filter (where target.join_type = 'staff')::integer
    into added_count, added_members, added_staff
    from inserted
    join target on target.id = inserted.membership_application_id;

  update public.club_events
     set updated_at = changed_at, updated_by_admin_user_id = p_admin_user_id
   where id = event_row.id;

  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id, 'workshop_applicants_invited', 'standard',
    jsonb_build_object(
      'requested', requested_count,
      'added', added_count,
      'added_members', added_members,
      'added_staff', added_staff,
      'scope', coalesce(p_scope, 'applications')
    ), changed_at);
  return jsonb_build_object(
    'requested', requested_count, 'added', added_count,
    'added_members', added_members, 'added_staff', added_staff
  );
end;
$$;

-- 4. Recording a CSV export ---------------------------------------------------------------

create or replace function public.admin_record_event_invitation_export(
  p_event_id uuid, p_admin_user_id uuid, p_invitation_ids uuid[], p_scope text, p_now timestamptz
) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  administrator_role text;
  changed_at timestamptz := coalesce(p_now, now());
  marked integer;
begin
  select role into administrator_role from public.admin_users
   where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;
  if p_scope is null or p_scope not in ('all','new')
    or p_invitation_ids is null
    or coalesce(array_length(p_invitation_ids, 1), 0) < 1
    or not exists (select 1 from public.club_events where id = p_event_id and event_type = 'workshop')
  then raise exception 'invalid_export' using errcode = '22023'; end if;

  -- The first export date is kept: re-exporting everything never turns an
  -- already exported link back into a "new" one.
  update public.club_event_invitations
     set link_exported_at = coalesce(link_exported_at, changed_at)
   where event_id = p_event_id and id = any(p_invitation_ids);
  get diagnostics marked = row_count;

  insert into public.admin_audit_events
    (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (
    p_admin_user_id, 'club_event', p_event_id,
    'workshop_invitation_links_exported', 'sensitive',
    jsonb_build_object('row_count', coalesce(array_length(p_invitation_ids, 1), 0), 'scope', p_scope), changed_at
  );
  return marked;
end;
$$;

-- 5. Registration is open whatever the lifecycle status (except cancelled/archived) ------

create or replace function public.public_open_event_invitation(p_token_hash text, p_now timestamptz)
returns table (
  invitation_id uuid, invitation_status text, full_name text,
  event_id uuid, event_title text, starts_at timestamptz, ends_at timestamptz,
  location text, speaker_name text,
  registration_status text, university_speciality text,
  qr_credential_version integer, qr_derivation_version integer
)
language plpgsql security invoker set search_path = public as $$
declare changed_at timestamptz := coalesce(p_now, now());
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then return; end if;
  return query
    select invitation.id, invitation.status, application.full_name,
      event.id, event.title, event.starts_at, event.ends_at, event.location, event.speaker_name,
      registration.status, registration.university_speciality,
      registration.credential_version, registration.credential_derivation_version
    from public.club_event_invitations invitation
    join public.club_events event on event.id = invitation.event_id
    join public.membership_applications application on application.id = invitation.membership_application_id
    left join public.club_event_registrations registration on registration.invitation_id = invitation.id
    where invitation.invite_token_hash = p_token_hash
      and invitation.invite_expires_at > changed_at
      and invitation.link_revoked_at is null
      and invitation.status in ('invited','registered')
      and event.event_type = 'workshop'
      and event.status not in ('cancelled','archived');
end;
$$;

create or replace function public.public_register_event_participant(
  p_invitation_token_hash text, p_university_speciality text,
  p_qr_token_hash text, p_qr_credential_version integer, p_qr_derivation_version integer,
  p_qr_expires_at timestamptz, p_now timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  invitation_row public.club_event_invitations%rowtype;
  event_row public.club_events%rowtype;
  application_row public.membership_applications%rowtype;
  registration_row public.club_event_registrations%rowtype;
  changed_at timestamptz := coalesce(p_now, now());
  already_registered boolean;
  speciality text;
begin
  speciality := btrim(coalesce(p_university_speciality, ''));
  if p_invitation_token_hash !~ '^[a-f0-9]{64}$' or p_qr_token_hash !~ '^[a-f0-9]{64}$'
    or p_qr_credential_version < 1 or p_qr_derivation_version <> 1
    or p_qr_expires_at <= changed_at
    or char_length(speciality) not between 2 and 160
  then raise exception 'invalid_registration' using errcode = '22023'; end if;

  select * into invitation_row from public.club_event_invitations
   where invite_token_hash = p_invitation_token_hash for update;
  if not found or invitation_row.invite_expires_at <= changed_at
    or invitation_row.link_revoked_at is not null
    or invitation_row.status in ('declined','cancelled')
  then raise exception 'invalid_invitation' using errcode = '22023'; end if;

  select * into event_row from public.club_events where id = invitation_row.event_id for share;
  select * into registration_row from public.club_event_registrations
   where invitation_id = invitation_row.id for update;
  already_registered := registration_row.id is not null;
  if event_row.event_type <> 'workshop' or event_row.status in ('cancelled','archived')
  then raise exception 'registration_not_open' using errcode = '22023'; end if;

  select * into application_row from public.membership_applications
   where id = invitation_row.membership_application_id;
  if not found then raise exception 'invalid_invitation' using errcode = '22023'; end if;

  if already_registered then
    -- Revisiting an already registered invitation returns the same opaque QR
    -- credential; only the workshop speciality may be corrected.
    if registration_row.credential_version <> p_qr_credential_version
      or registration_row.credential_derivation_version <> p_qr_derivation_version
      or registration_row.qr_token_hash <> p_qr_token_hash
    then raise exception 'participant_credential_conflict' using errcode = '40001'; end if;
    update public.club_event_registrations set
      university_speciality = speciality, updated_at = changed_at
    where id = registration_row.id returning * into registration_row;
  else
    insert into public.club_event_registrations
      (event_id, invitation_id, membership_application_id, university_speciality,
       qr_token_hash, status, registered_at, checked_in_at, absent_at,
       credential_version, credential_derivation_version, created_at, updated_at)
    values
      (invitation_row.event_id, invitation_row.id, invitation_row.membership_application_id, speciality,
       p_qr_token_hash, 'registered', changed_at, null, null,
       p_qr_credential_version, p_qr_derivation_version, changed_at, changed_at)
    returning * into registration_row;
    update public.club_event_invitations set
      registered_at = coalesce(registered_at, changed_at)
    where id = invitation_row.id;
  end if;

  if not already_registered then
    insert into public.admin_audit_events
      (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
    values (
      null, 'club_event', invitation_row.event_id, 'participant_registered', 'standard',
      jsonb_build_object('invitation_id', invitation_row.id, 'registration_id', registration_row.id), changed_at
    );
  end if;
  return jsonb_build_object(
    'event_id', event_row.id, 'event_title', event_row.title, 'starts_at', event_row.starts_at,
    'ends_at', event_row.ends_at, 'location', event_row.location,
    'full_name', application_row.full_name, 'university_speciality', speciality,
    'already_registered', already_registered,
    'qr_credential_version', registration_row.credential_version,
    'qr_derivation_version', registration_row.credential_derivation_version,
    'qr_expires_at', p_qr_expires_at
  );
end;
$$;

-- 6. Lifecycle: registration no longer needs its own steps -------------------------------

create or replace function public.admin_transition_club_event(
  p_event_id uuid, p_admin_user_id uuid, p_next_status text, p_expected_updated_at timestamptz, p_now timestamptz
) returns timestamptz
language plpgsql security invoker set search_path = public as $$
declare administrator_role text; event_row public.club_events%rowtype; changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  select * into event_row from public.club_events where id = p_event_id for update;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if event_row.updated_at <> p_expected_updated_at then raise exception 'event_conflict' using errcode = '40001'; end if;
  if not (
    (event_row.status = 'draft' and p_next_status in ('planned','cancelled')) or
    (event_row.status = 'planned' and p_next_status in ('registration_open','ongoing','cancelled')) or
    (event_row.status = 'registration_open' and p_next_status in ('registration_closed','ongoing','cancelled')) or
    (event_row.status = 'registration_closed' and p_next_status in ('ongoing','cancelled')) or
    (event_row.status = 'ongoing' and p_next_status in ('completed','cancelled')) or
    (event_row.status in ('completed','cancelled') and p_next_status = 'archived')
  ) then raise exception 'invalid_event_transition' using errcode = '22023'; end if;
  update public.club_events set status = p_next_status, updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = p_event_id;
  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id, 'workshop_status_changed', 'standard',
    jsonb_build_object('from', event_row.status, 'to', p_next_status), changed_at);
  return changed_at;
end;
$$;

-- 7. Hardening ---------------------------------------------------------------------------

revoke all on function public.admin_invite_club_event_applicants(uuid,uuid,uuid[],text,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_invite_club_event_applicants(uuid,uuid,uuid[],text,timestamptz) to service_role;
revoke all on function public.admin_record_event_invitation_export(uuid,uuid,uuid[],text,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_record_event_invitation_export(uuid,uuid,uuid[],text,timestamptz) to service_role;
revoke all on function public.public_open_event_invitation(text,timestamptz) from public, anon, authenticated;
grant execute on function public.public_open_event_invitation(text,timestamptz) to service_role;
revoke all on function public.public_register_event_participant(text,text,text,integer,integer,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.public_register_event_participant(text,text,text,integer,integer,timestamptz,timestamptz) to service_role;
revoke all on function public.admin_transition_club_event(uuid,uuid,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_transition_club_event(uuid,uuid,text,timestamptz,timestamptz) to service_role;

comment on column public.club_event_invitations.link_exported_at is
  'First time this private link was written to a CSV export. NULL = never exported ("new" link).';

commit;
