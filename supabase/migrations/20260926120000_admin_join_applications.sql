-- Real administrative workflow for Infinity Club Join applications.
--
-- Apply manually after 20260925120000_admin_authentication.sql. The migration
-- is additive, creates no user, and keeps the public Join write path intact.

begin;

-- Normalize the historical public-form status into the administrative
-- vocabulary used by the dashboard.
alter table public.membership_applications
  add column if not exists decision_reason text,
  add column if not exists requested_information text,
  add column if not exists accepted_as text,
  add column if not exists assigned_staff_department text,
  add column if not exists reviewed_by_admin_user_id uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
declare
  constraint_row record;
begin
  -- The original table predates the repository migrations. Remove only CHECK
  -- constraints that explicitly constrain its status column.
  for constraint_row in
    select conname
      from pg_constraint
     where conrelid = 'public.membership_applications'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ~* '\mstatus\M'
  loop
    execute format(
      'alter table public.membership_applications drop constraint %I',
      constraint_row.conname
    );
  end loop;
end $$;

update public.membership_applications
   set status = case lower(replace(btrim(status), ' ', '_'))
     when 'pending' then 'new'
     when 'new' then 'new'
     when 'in_review' then 'in_review'
     when 'interview' then 'interview'
     when 'accepted' then 'accepted'
     when 'declined' then 'declined'
     when 'refused' then 'declined'
     when 'archived' then 'archived'
     else 'new'
   end,
       updated_at = coalesce(updated_at, created_at, submitted_at, now());

alter table public.membership_applications
  alter column status set default 'new',
  alter column status set not null;

alter table public.membership_applications
  drop constraint if exists membership_applications_admin_status_check,
  drop constraint if exists membership_applications_accepted_as_check,
  drop constraint if exists membership_applications_assigned_department_check,
  drop constraint if exists membership_applications_reviewer_fkey;

alter table public.membership_applications
  add constraint membership_applications_admin_status_check
    check (status in ('new', 'in_review', 'interview', 'accepted', 'declined', 'archived')),
  add constraint membership_applications_accepted_as_check
    check (accepted_as is null or accepted_as in ('member', 'staff')),
  add constraint membership_applications_assigned_department_check
    check (
      assigned_staff_department is null
      or assigned_staff_department in ('dev-tech', 'design-content', 'management-logistics')
    ),
  add constraint membership_applications_reviewer_fkey
    foreign key (reviewed_by_admin_user_id)
    references public.admin_users (id) on delete set null;

create table if not exists public.membership_application_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  author_admin_user_id uuid,
  body text not null,
  created_at timestamptz not null default now(),

  constraint membership_notes_application_fkey
    foreign key (application_id)
    references public.membership_applications (id) on delete cascade,
  constraint membership_notes_author_fkey
    foreign key (author_admin_user_id)
    references public.admin_users (id) on delete set null,
  constraint membership_notes_body_check
    check (body = btrim(body) and char_length(body) between 1 and 4000)
);

create table if not exists public.membership_interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  scheduled_at timestamptz not null,
  location text not null,
  status text not null default 'scheduled',
  internal_reason text,
  created_by_admin_user_id uuid,
  updated_by_admin_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint membership_interviews_application_fkey
    foreign key (application_id)
    references public.membership_applications (id) on delete cascade,
  constraint membership_interviews_creator_fkey
    foreign key (created_by_admin_user_id)
    references public.admin_users (id) on delete set null,
  constraint membership_interviews_updater_fkey
    foreign key (updated_by_admin_user_id)
    references public.admin_users (id) on delete set null,
  constraint membership_interviews_status_check
    check (status in ('scheduled', 'completed', 'cancelled')),
  constraint membership_interviews_location_check
    check (location = btrim(location) and char_length(location) between 2 and 240),
  constraint membership_interviews_reason_check
    check (internal_reason is null or char_length(internal_reason) <= 2000)
);

-- Business audit is intentionally separate from authentication events so
-- authentication logs stay minimal and workflow history remains queryable.
create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  object_type text not null,
  object_id uuid not null,
  action text not null,
  sensitivity text not null default 'standard',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint admin_audit_actor_fkey
    foreign key (admin_user_id)
    references public.admin_users (id) on delete set null,
  constraint admin_audit_object_type_check
    check (object_type in ('join_application', 'aivex_registration', 'aivex_document')),
  constraint admin_audit_action_check
    check (action ~ '^[a-z][a-z0-9_]{1,79}$'),
  constraint admin_audit_sensitivity_check
    check (sensitivity in ('standard', 'confidential')),
  constraint admin_audit_metadata_check
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096)
);

create index if not exists membership_applications_admin_queue_idx
  on public.membership_applications (status, submitted_at desc);
create index if not exists membership_applications_admin_type_idx
  on public.membership_applications (join_type, study_year, submitted_at desc);
create index if not exists membership_notes_application_created_idx
  on public.membership_application_notes (application_id, created_at desc);
create index if not exists membership_interviews_application_created_idx
  on public.membership_interviews (application_id, created_at desc);
create index if not exists admin_audit_object_created_idx
  on public.admin_audit_events (object_type, object_id, created_at desc);
create index if not exists admin_audit_actor_created_idx
  on public.admin_audit_events (admin_user_id, created_at desc);

create or replace function public.admin_apply_membership_application_action(
  p_application_id uuid,
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
  application_row public.membership_applications%rowtype;
  administrator_role text;
  next_status text;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  clean_note text;
  clean_message text;
  interview_at timestamptz;
  interview_location text;
  department_slug text;
  department_label text;
  changed_at timestamptz := coalesce(p_now, now());
begin
  select role into administrator_role
    from public.admin_users
   where id = p_admin_user_id and is_active = true;

  if administrator_role is null then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;

  if p_action not in (
    'start_review', 'schedule_interview', 'request_information',
    'accept_member', 'accept_staff', 'change_staff_department',
    'decline', 'archive', 'add_note'
  ) then
    raise exception 'unsupported_application_action' using errcode = '22023';
  end if;

  if administrator_role = 'reviewer'
     and p_action in ('accept_member', 'accept_staff', 'change_staff_department', 'decline', 'archive') then
    raise exception 'administrator_not_authorized' using errcode = '42501';
  end if;

  select * into application_row
    from public.membership_applications
   where id = p_application_id
   for update;

  if not found then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  if p_expected_updated_at is null or application_row.updated_at <> p_expected_updated_at then
    raise exception 'application_conflict' using errcode = '40001';
  end if;

  if p_action <> 'add_note' and clean_reason is null then
    raise exception 'internal_reason_required' using errcode = '22023';
  end if;
  if clean_reason is not null and char_length(clean_reason) > 2000 then
    raise exception 'internal_reason_too_long' using errcode = '22023';
  end if;

  next_status := application_row.status;

  if p_action = 'add_note' then
    clean_note := nullif(btrim(coalesce(p_payload->>'note', '')), '');
    if clean_note is null or char_length(clean_note) > 4000 then
      raise exception 'invalid_internal_note' using errcode = '22023';
    end if;
    insert into public.membership_application_notes (
      application_id, author_admin_user_id, body, created_at
    ) values (p_application_id, p_admin_user_id, clean_note, changed_at);

  elsif p_action = 'start_review' then
    if application_row.status not in ('new', 'interview') then
      raise exception 'invalid_application_transition' using errcode = '22023';
    end if;
    next_status := 'in_review';

  elsif p_action = 'schedule_interview' then
    if application_row.status not in ('new', 'in_review', 'interview') then
      raise exception 'invalid_application_transition' using errcode = '22023';
    end if;
    begin
      interview_at := (p_payload->>'scheduledAt')::timestamptz;
    exception when others then
      raise exception 'invalid_interview_date' using errcode = '22023';
    end;
    interview_location := nullif(btrim(coalesce(p_payload->>'location', '')), '');
    if interview_at is null or interview_location is null or char_length(interview_location) > 240 then
      raise exception 'invalid_interview_details' using errcode = '22023';
    end if;
    insert into public.membership_interviews (
      application_id, scheduled_at, location, status, internal_reason,
      created_by_admin_user_id, updated_by_admin_user_id, created_at, updated_at
    ) values (
      p_application_id, interview_at, interview_location, 'scheduled', clean_reason,
      p_admin_user_id, p_admin_user_id, changed_at, changed_at
    );
    next_status := 'interview';

  elsif p_action = 'request_information' then
    if application_row.status in ('accepted', 'declined', 'archived') then
      raise exception 'invalid_application_transition' using errcode = '22023';
    end if;
    clean_message := nullif(btrim(coalesce(p_payload->>'message', '')), '');
    if clean_message is null or char_length(clean_message) > 4000 then
      raise exception 'invalid_information_request' using errcode = '22023';
    end if;
    update public.membership_applications
       set requested_information = clean_message
     where id = p_application_id;

  elsif p_action = 'accept_member' then
    if application_row.join_type <> 'member'
       or application_row.status not in ('new', 'in_review', 'interview') then
      raise exception 'invalid_application_transition' using errcode = '22023';
    end if;
    next_status := 'accepted';
    update public.membership_applications
       set accepted_as = 'member', decision_reason = clean_reason
     where id = p_application_id;

  elsif p_action = 'accept_staff' then
    if application_row.join_type <> 'staff'
       or application_row.status not in ('new', 'in_review', 'interview') then
      raise exception 'invalid_application_transition' using errcode = '22023';
    end if;
    next_status := 'accepted';
    update public.membership_applications
       set accepted_as = 'staff',
           assigned_staff_department = staff_department,
           decision_reason = clean_reason
     where id = p_application_id;

  elsif p_action = 'change_staff_department' then
    if application_row.join_type <> 'staff'
       or application_row.status in ('accepted', 'declined', 'archived') then
      raise exception 'invalid_application_transition' using errcode = '22023';
    end if;
    department_slug := p_payload->>'department';
    department_label := case department_slug
      when 'dev-tech' then 'Dev / Tech'
      when 'design-content' then 'Design / Content Creation'
      when 'management-logistics' then 'Management / Logistics'
      else null
    end;
    if department_label is null then
      raise exception 'invalid_staff_department' using errcode = '22023';
    end if;
    update public.membership_applications
       set staff_department = department_slug,
           primary_field = department_label
     where id = p_application_id;

  elsif p_action = 'decline' then
    if application_row.status in ('accepted', 'declined', 'archived') then
      raise exception 'invalid_application_transition' using errcode = '22023';
    end if;
    next_status := 'declined';
    update public.membership_applications
       set decision_reason = clean_reason
     where id = p_application_id;

  elsif p_action = 'archive' then
    if application_row.status = 'archived' then
      raise exception 'invalid_application_transition' using errcode = '22023';
    end if;
    next_status := 'archived';
  end if;

  update public.membership_applications
     set status = next_status,
         reviewed_by_admin_user_id = p_admin_user_id,
         reviewed_at = changed_at,
         updated_at = changed_at
   where id = p_application_id;

  insert into public.admin_audit_events (
    admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at
  ) values (
    p_admin_user_id,
    'join_application',
    p_application_id,
    p_action,
    'standard',
    jsonb_strip_nulls(jsonb_build_object(
      'previous_status', application_row.status,
      'next_status', next_status
    )),
    changed_at
  );

  return changed_at;
end;
$$;

alter table public.membership_applications enable row level security;
alter table public.membership_application_notes enable row level security;
alter table public.membership_interviews enable row level security;
alter table public.admin_audit_events enable row level security;

revoke all on table public.membership_applications from anon, authenticated;
revoke all on table public.membership_application_notes from anon, authenticated;
revoke all on table public.membership_interviews from anon, authenticated;
revoke all on table public.admin_audit_events from anon, authenticated;

grant select, insert, update on table public.membership_applications to service_role;
grant select, insert, update, delete on table public.membership_application_notes to service_role;
grant select, insert, update, delete on table public.membership_interviews to service_role;
grant select, insert on table public.admin_audit_events to service_role;

revoke all on function public.admin_apply_membership_application_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_apply_membership_application_action(
  uuid, uuid, text, timestamptz, text, jsonb, timestamptz
) to service_role;

comment on table public.membership_application_notes is
  'Append-only internal notes for Join applications. Server/service-role access only.';
comment on table public.membership_interviews is
  'Administrative interview schedule for Join applications.';
comment on table public.admin_audit_events is
  'Server-authored business audit trail. Never stores credentials, cookies, tokens, or private file paths.';

commit;

