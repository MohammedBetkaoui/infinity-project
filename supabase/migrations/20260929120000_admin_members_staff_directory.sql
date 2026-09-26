-- Real member and staff directories derived from accepted Join applications.
-- Server/service-role only. No browser table access and no demo seed data.

begin;

create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  source_application_id uuid unique
    references public.membership_applications (id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  study_year text not null,
  speciality text not null,
  availability text not null,
  primary_pole text not null default 'Unassigned',
  skills text,
  cohort text not null,
  status text not null default 'active',
  joined_at date not null default current_date,
  last_activity_at timestamptz,
  created_by_admin_user_id uuid references public.admin_users (id) on delete set null,
  updated_by_admin_user_id uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint club_members_name_check check (full_name = btrim(full_name) and char_length(full_name) between 3 and 120),
  constraint club_members_email_check check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  constraint club_members_phone_check check (phone is null or char_length(phone) between 6 and 32),
  constraint club_members_study_year_check check (study_year in ('L1','L2','L3','M1','M2','E1','E2','E3','E4','E5','other')),
  constraint club_members_speciality_check check (speciality = btrim(speciality) and char_length(speciality) between 2 and 160),
  constraint club_members_availability_check check (availability in ('weekly','events','flexible')),
  constraint club_members_pole_check check (primary_pole = btrim(primary_pole) and char_length(primary_pole) between 2 and 120),
  constraint club_members_skills_check check (skills is null or char_length(skills) <= 1000),
  constraint club_members_cohort_check check (cohort ~ '^[0-9]{4}/[0-9]{2}$'),
  constraint club_members_status_check check (status in ('active','on_pause','inactive','alumni','archived'))
);

create table if not exists public.club_staff_profiles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.club_members (id) on delete cascade,
  requested_department text,
  current_department text not null,
  internal_role text not null default 'Unassigned',
  status text not null default 'active',
  created_by_admin_user_id uuid references public.admin_users (id) on delete set null,
  updated_by_admin_user_id uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint club_staff_requested_department_check check (
    requested_department is null or requested_department in ('dev-tech','design-content','management-logistics')
  ),
  constraint club_staff_current_department_check check (
    current_department in ('dev-tech','design-content','management-logistics')
  ),
  constraint club_staff_role_check check (internal_role = btrim(internal_role) and char_length(internal_role) between 2 and 120),
  constraint club_staff_status_check check (status in ('active','on_pause','inactive','archived'))
);

create table if not exists public.club_staff_project_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.club_staff_profiles (id) on delete cascade,
  project_name text not null,
  assigned_by_admin_user_id uuid references public.admin_users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  constraint club_staff_project_name_check check (project_name = btrim(project_name) and char_length(project_name) between 2 and 160),
  constraint club_staff_project_unique unique (staff_profile_id, project_name)
);

create table if not exists public.club_member_event_participation (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.club_members (id) on delete cascade,
  event_name text not null,
  attended_on date,
  recorded_by_admin_user_id uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint club_member_event_name_check check (event_name = btrim(event_name) and char_length(event_name) between 2 and 160),
  constraint club_member_event_unique unique (member_id, event_name)
);

create table if not exists public.club_member_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.club_members (id) on delete cascade,
  author_admin_user_id uuid references public.admin_users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint club_member_note_body_check check (body = btrim(body) and char_length(body) between 1 and 4000)
);

create index if not exists club_members_directory_idx on public.club_members (status, joined_at desc);
create index if not exists club_members_name_idx on public.club_members (lower(full_name));
create index if not exists club_staff_directory_idx on public.club_staff_profiles (status, current_department, created_at desc);
create index if not exists club_member_notes_idx on public.club_member_notes (member_id, created_at desc);
create index if not exists club_staff_projects_idx on public.club_staff_project_assignments (staff_profile_id, assigned_at desc);

-- A single read model gives the API one stable vocabulary for both pages.
create or replace view public.admin_people_directory
with (security_invoker = true)
as
select
  'members'::text as kind,
  member.id as profile_id,
  member.id as member_id,
  member.source_application_id,
  member.full_name,
  member.email,
  member.phone,
  member.study_year,
  member.speciality,
  member.availability,
  member.primary_pole as structure,
  null::text as requested_department,
  null::text as internal_role,
  member.cohort,
  member.status,
  member.joined_at,
  member.last_activity_at,
  (select count(*)::integer from public.club_member_event_participation event where event.member_id = member.id) as activity_count,
  exists (select 1 from public.club_staff_profiles staff where staff.member_id = member.id) as has_staff_profile,
  member.created_at,
  member.updated_at
from public.club_members member
union all
select
  'staff'::text as kind,
  staff.id as profile_id,
  member.id as member_id,
  member.source_application_id,
  member.full_name,
  member.email,
  member.phone,
  member.study_year,
  member.speciality,
  member.availability,
  staff.current_department as structure,
  staff.requested_department,
  staff.internal_role,
  member.cohort,
  staff.status,
  member.joined_at,
  member.last_activity_at,
  (select count(*)::integer from public.club_staff_project_assignments assignment where assignment.staff_profile_id = staff.id) as activity_count,
  true as has_staff_profile,
  staff.created_at,
  greatest(member.updated_at, staff.updated_at) as updated_at
from public.club_staff_profiles staff
join public.club_members member on member.id = staff.member_id;

-- Accepted Join records become authoritative directory profiles. The trigger
-- is idempotent and also allows a previously accepted row to be replayed.
create or replace function public.club_sync_accepted_application()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  member_id_value uuid;
  department_value text;
  joined_date date := coalesce(new.reviewed_at, new.updated_at, now())::date;
  cohort_value text := extract(year from joined_date)::integer::text || '/' || right((extract(year from joined_date)::integer + 1)::text, 2);
begin
  if new.status <> 'accepted' or new.accepted_as not in ('member', 'staff') then
    return new;
  end if;

  insert into public.club_members (
    source_application_id, full_name, email, phone, study_year, speciality,
    availability, primary_pole, skills, cohort, status, joined_at,
    created_by_admin_user_id, updated_by_admin_user_id, created_at, updated_at
  ) values (
    new.id, btrim(new.full_name), lower(btrim(new.email)), nullif(btrim(new.phone), ''), new.study_year,
    btrim(new.department), new.availability,
    case when new.accepted_as = 'member' then btrim(new.primary_field) else 'Unassigned' end,
    case when new.accepted_as = 'member' then btrim(new.primary_field) else null end,
    cohort_value, 'active', joined_date,
    new.reviewed_by_admin_user_id, new.reviewed_by_admin_user_id,
    coalesce(new.reviewed_at, now()), coalesce(new.updated_at, now())
  )
  on conflict (source_application_id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone,
        study_year = excluded.study_year,
        speciality = excluded.speciality,
        availability = excluded.availability,
        updated_by_admin_user_id = excluded.updated_by_admin_user_id,
        updated_at = excluded.updated_at
  returning id into member_id_value;

  if new.accepted_as = 'staff' then
    department_value := coalesce(new.assigned_staff_department, new.staff_department);
    insert into public.club_staff_profiles (
      member_id, requested_department, current_department, internal_role, status,
      created_by_admin_user_id, updated_by_admin_user_id, created_at, updated_at
    ) values (
      member_id_value, new.staff_department, department_value, 'Unassigned', 'active',
      new.reviewed_by_admin_user_id, new.reviewed_by_admin_user_id,
      coalesce(new.reviewed_at, now()), coalesce(new.updated_at, now())
    )
    on conflict (member_id) do update
      set requested_department = excluded.requested_department,
          current_department = excluded.current_department,
          updated_by_admin_user_id = excluded.updated_by_admin_user_id,
          updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists club_sync_accepted_application on public.membership_applications;
create trigger club_sync_accepted_application
  after insert or update of status, accepted_as, assigned_staff_department on public.membership_applications
  for each row execute function public.club_sync_accepted_application();

-- Backfill applications accepted before this directory existed. Assigning the
-- existing value deliberately fires the column-specific trigger above; the
-- synchronization itself is idempotent through the source_application_id key.
update public.membership_applications
   set accepted_as = accepted_as
 where status = 'accepted' and accepted_as in ('member', 'staff');

-- Create a manual directory record through the same protected server actor.
create or replace function public.admin_create_club_profile(
  p_kind text,
  p_admin_user_id uuid,
  p_payload jsonb,
  p_now timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  administrator_role text;
  member_id_value uuid;
  profile_id_value uuid;
  department_value text;
  changed_at timestamptz := coalesce(p_now, now());
  joined_date date := coalesce((p_payload->>'joinedAt')::date, changed_at::date);
  cohort_value text := coalesce(nullif(btrim(p_payload->>'cohort'), ''), extract(year from joined_date)::integer::text || '/' || right((extract(year from joined_date)::integer + 1)::text, 2));
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if p_kind not in ('members','staff') then raise exception 'invalid_profile_kind' using errcode = '22023'; end if;

  department_value := p_payload->>'department';
  if p_kind = 'staff' and department_value not in ('dev-tech','design-content','management-logistics') then
    raise exception 'invalid_staff_department' using errcode = '22023';
  end if;

  insert into public.club_members (
    full_name, email, phone, study_year, speciality, availability, primary_pole,
    cohort, status, joined_at, created_by_admin_user_id, updated_by_admin_user_id,
    created_at, updated_at
  ) values (
    btrim(p_payload->>'fullName'), lower(btrim(p_payload->>'email')),
    nullif(btrim(p_payload->>'phone'), ''), p_payload->>'studyYear', btrim(p_payload->>'speciality'),
    p_payload->>'availability', coalesce(nullif(btrim(p_payload->>'pole'), ''), 'Unassigned'),
    cohort_value, 'active', joined_date, p_admin_user_id, p_admin_user_id, changed_at, changed_at
  ) returning id into member_id_value;

  if p_kind = 'staff' then
    insert into public.club_staff_profiles (
      member_id, requested_department, current_department, internal_role, status,
      created_by_admin_user_id, updated_by_admin_user_id, created_at, updated_at
    ) values (
      member_id_value, null, department_value, btrim(p_payload->>'role'), 'active',
      p_admin_user_id, p_admin_user_id, changed_at, changed_at
    ) returning id into profile_id_value;
  else
    profile_id_value := member_id_value;
  end if;

  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, case when p_kind = 'staff' then 'club_staff' else 'club_member' end,
          profile_id_value, 'create_profile', 'standard', jsonb_build_object('kind', p_kind), changed_at);
  return profile_id_value;
end;
$$;

create or replace function public.admin_apply_club_profile_action(
  p_kind text,
  p_profile_id uuid,
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
  administrator_role text;
  member_row public.club_members%rowtype;
  staff_row public.club_staff_profiles%rowtype;
  member_id_value uuid;
  changed_at timestamptz := coalesce(p_now, now());
  clean_note text;
  next_status text;
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  if p_kind not in ('members','staff') then raise exception 'invalid_profile_kind' using errcode = '22023'; end if;

  if p_kind = 'members' then
    select * into member_row from public.club_members where id = p_profile_id for update;
    if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;
    member_id_value := member_row.id;
    if member_row.updated_at <> p_expected_updated_at then raise exception 'profile_conflict' using errcode = '40001'; end if;

    if p_action = 'update_profile' then
      update public.club_members set
        full_name = btrim(p_payload->>'fullName'), email = lower(btrim(p_payload->>'email')),
        phone = nullif(btrim(p_payload->>'phone'), ''), study_year = p_payload->>'studyYear',
        speciality = btrim(p_payload->>'speciality'), updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at
      where id = member_row.id;
    elsif p_action = 'change_pole' then
      update public.club_members set primary_pole = btrim(p_payload->>'pole'), updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = member_row.id;
    elsif p_action = 'promote_to_staff' then
      if p_payload->>'department' not in ('dev-tech','design-content','management-logistics') then raise exception 'invalid_staff_department' using errcode = '22023'; end if;
      if exists (select 1 from public.club_staff_profiles where member_id = member_row.id) then raise exception 'profile_already_staff' using errcode = '22023'; end if;
      insert into public.club_staff_profiles (member_id, current_department, internal_role, status, created_by_admin_user_id, updated_by_admin_user_id, created_at, updated_at)
      values (member_row.id, p_payload->>'department', btrim(p_payload->>'role'), 'active', p_admin_user_id, p_admin_user_id, changed_at, changed_at);
      update public.club_members set updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = member_row.id;
    elsif p_action = 'set_status' then
      next_status := p_payload->>'status';
      if next_status not in ('active','on_pause','inactive','alumni','archived') then raise exception 'invalid_profile_status' using errcode = '22023'; end if;
      update public.club_members set status = next_status, updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = member_row.id;
      if next_status in ('on_pause','inactive','alumni','archived') then
        update public.club_staff_profiles
           set status = case when next_status in ('alumni','archived') then 'archived' else next_status end,
               updated_by_admin_user_id = p_admin_user_id,
               updated_at = changed_at
         where member_id = member_row.id;
      end if;
    elsif p_action = 'add_note' then
      clean_note := nullif(btrim(coalesce(p_payload->>'note','')), '');
      if clean_note is null or char_length(clean_note) > 4000 then raise exception 'invalid_profile_note' using errcode = '22023'; end if;
      insert into public.club_member_notes (member_id, author_admin_user_id, body, created_at) values (member_row.id, p_admin_user_id, clean_note, changed_at);
      update public.club_members set updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = member_row.id;
    else raise exception 'unsupported_profile_action' using errcode = '22023';
    end if;
  else
    -- Keep one lock order for every cross-profile mutation: member first, then
    -- staff. This prevents a member-status change and a staff action from
    -- deadlocking each other under concurrent administration.
    select member_id into member_id_value from public.club_staff_profiles where id = p_profile_id;
    if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;
    select * into member_row from public.club_members where id = member_id_value for update;
    select * into staff_row from public.club_staff_profiles where id = p_profile_id for update;
    if not found then raise exception 'profile_not_found' using errcode = 'P0002'; end if;
    if greatest(member_row.updated_at, staff_row.updated_at) <> p_expected_updated_at then raise exception 'profile_conflict' using errcode = '40001'; end if;

    if p_action = 'assign_role' then
      update public.club_staff_profiles set internal_role = btrim(p_payload->>'role'), updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = staff_row.id;
    elsif p_action = 'move_department' then
      if p_payload->>'department' not in ('dev-tech','design-content','management-logistics') then raise exception 'invalid_staff_department' using errcode = '22023'; end if;
      update public.club_staff_profiles set current_department = p_payload->>'department', updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = staff_row.id;
    elsif p_action = 'assign_project' then
      insert into public.club_staff_project_assignments (staff_profile_id, project_name, assigned_by_admin_user_id, assigned_at)
      values (staff_row.id, btrim(p_payload->>'project'), p_admin_user_id, changed_at)
      on conflict (staff_profile_id, project_name) do nothing;
      update public.club_staff_profiles set updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = staff_row.id;
    elsif p_action = 'change_availability' then
      if p_payload->>'availability' not in ('weekly','events','flexible') then raise exception 'invalid_availability' using errcode = '22023'; end if;
      update public.club_members set availability = p_payload->>'availability', updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = member_row.id;
      update public.club_staff_profiles set updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = staff_row.id;
    elsif p_action = 'set_status' then
      next_status := p_payload->>'status';
      if next_status not in ('active','on_pause','inactive','archived') then raise exception 'invalid_profile_status' using errcode = '22023'; end if;
      update public.club_staff_profiles set status = next_status, updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = staff_row.id;
    elsif p_action = 'add_note' then
      clean_note := nullif(btrim(coalesce(p_payload->>'note','')), '');
      if clean_note is null or char_length(clean_note) > 4000 then raise exception 'invalid_profile_note' using errcode = '22023'; end if;
      insert into public.club_member_notes (member_id, author_admin_user_id, body, created_at) values (member_row.id, p_admin_user_id, clean_note, changed_at);
      update public.club_staff_profiles set updated_by_admin_user_id = p_admin_user_id, updated_at = changed_at where id = staff_row.id;
    else raise exception 'unsupported_profile_action' using errcode = '22023';
    end if;
  end if;

  insert into public.admin_audit_events (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, case when p_kind = 'staff' then 'club_staff' else 'club_member' end,
          p_profile_id, p_action, 'standard', jsonb_strip_nulls(jsonb_build_object('reason', nullif(btrim(coalesce(p_reason,'')),''))), changed_at);
  return changed_at;
end;
$$;

-- Extend the existing audit vocabulary without replacing other constraints.
alter table public.admin_audit_events drop constraint if exists admin_audit_object_type_check;
alter table public.admin_audit_events add constraint admin_audit_object_type_check
  check (object_type in ('join_application','aivex_registration','aivex_document','club_member','club_staff'));

alter table public.club_members enable row level security;
alter table public.club_staff_profiles enable row level security;
alter table public.club_staff_project_assignments enable row level security;
alter table public.club_member_event_participation enable row level security;
alter table public.club_member_notes enable row level security;

revoke all on table public.club_members, public.club_staff_profiles, public.club_staff_project_assignments,
  public.club_member_event_participation, public.club_member_notes, public.admin_people_directory from anon, authenticated;
grant select, insert, update on table public.club_members, public.club_staff_profiles to service_role;
grant select, insert, update, delete on table public.club_staff_project_assignments, public.club_member_event_participation, public.club_member_notes to service_role;
grant select on table public.admin_people_directory to service_role;

revoke all on function public.admin_create_club_profile(text,uuid,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_create_club_profile(text,uuid,jsonb,timestamptz) to service_role;
revoke all on function public.admin_apply_club_profile_action(text,uuid,uuid,text,timestamptz,text,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_apply_club_profile_action(text,uuid,uuid,text,timestamptz,text,jsonb,timestamptz) to service_role;

comment on table public.club_members is 'Authoritative member directory. Created from accepted Join applications or explicit audited administration actions.';
comment on table public.club_staff_profiles is 'Operational staff assignment linked one-to-one to a club member.';
comment on view public.admin_people_directory is 'Server-only read model for the Members and Staff administration pages.';

commit;
