-- Live, searchable Activity Log for the protected administration workspace.
-- Returns only presentation-safe fields; raw metadata and object identifiers
-- never leave the database function.

begin;

create index if not exists admin_audit_created_idx
  on public.admin_audit_events (created_at desc, id desc);

create or replace function public.admin_list_activity_log(
  p_page integer,
  p_limit integer,
  p_query text,
  p_actor text,
  p_object_type text,
  p_action text,
  p_sensitivity text,
  p_date_from date,
  p_date_to date,
  p_sort text
)
returns jsonb
language sql
security invoker
set search_path = public
set statement_timeout = '5s'
as $$
  with runtime as materialized (
    select
      greatest(1, least(coalesce(p_page, 1), 100000)) as page_number,
      greatest(1, least(coalesce(p_limit, 12), 50)) as page_size,
      nullif(btrim(coalesce(p_query, '')), '') as search_query,
      nullif(btrim(coalesce(p_actor, '')), '') as actor_filter,
      nullif(btrim(coalesce(p_object_type, '')), '') as object_filter,
      nullif(btrim(coalesce(p_action, '')), '') as action_filter,
      nullif(btrim(coalesce(p_sensitivity, '')), '') as sensitivity_filter,
      case when p_sort in (
        'created_desc', 'created_asc', 'action_asc', 'action_desc',
        'actor_asc', 'actor_desc', 'object_asc', 'object_desc',
        'subject_asc', 'subject_desc', 'sensitivity_asc', 'sensitivity_desc'
      ) then p_sort else 'created_desc' end as sort_order
  ),
  activity_rows as materialized (
    select
      audit.id,
      audit.admin_user_id,
      audit.action,
      audit.object_type,
      audit.sensitivity,
      audit.created_at,
      coalesce(administrator.display_name, 'Infinity Administration') as actor,
      coalesce(
        case when application.id is not null
          then concat_ws(' · ', application.full_name, application.reference) end,
        case when registration.id is not null
          then concat_ws(' · ', registration.team_name, registration.reference) end,
        member.full_name,
        staff_member.full_name,
        case when audit.object_type = 'aivex_settings'
          then 'AIVEX Edition ' || coalesce(audit.metadata ->> 'edition', '2') || ' campaign' end,
        case when audit.object_type = 'staff_link_export'
          then 'Staff private-link export · ' || coalesce(audit.metadata ->> 'row_count', '0') || ' candidate(s)' end,
        case audit.object_type
          when 'join_application' then 'Join application'
          when 'aivex_registration' then 'AIVEX registration'
          when 'aivex_document' then 'AIVEX document'
          when 'club_member' then 'Member profile'
          when 'club_staff' then 'Staff profile'
          else 'Administrative record'
        end
      ) as subject,
      nullif(left(audit.metadata ->> 'reason', 2000), '') as note
    from public.admin_audit_events as audit
    left join public.admin_users as administrator
      on administrator.id = audit.admin_user_id
    left join public.membership_applications as application
      on audit.object_type = 'join_application' and application.id = audit.object_id
    left join public.aivex_registrations as registration
      on audit.object_type in ('aivex_registration', 'aivex_document') and registration.id = audit.object_id
    left join public.club_members as member
      on audit.object_type = 'club_member' and member.id = audit.object_id
    left join public.club_staff_profiles as staff
      on audit.object_type = 'club_staff' and staff.id = audit.object_id
    left join public.club_members as staff_member
      on staff_member.id = staff.member_id
  ),
  filtered_rows as materialized (
    select activity.*
    from activity_rows as activity
    cross join runtime
    where (runtime.actor_filter is null or activity.actor = runtime.actor_filter)
      and (runtime.object_filter is null or activity.object_type = runtime.object_filter)
      and (runtime.action_filter is null or activity.action = runtime.action_filter)
      and (runtime.sensitivity_filter is null or activity.sensitivity = runtime.sensitivity_filter)
      and (p_date_from is null or activity.created_at >= (p_date_from::timestamp at time zone 'Africa/Algiers'))
      and (p_date_to is null or activity.created_at < (((p_date_to + 1)::date)::timestamp at time zone 'Africa/Algiers'))
      and (
        runtime.search_query is null
        or concat_ws(' ', activity.action, replace(activity.action, '_', ' '), activity.subject, activity.actor, activity.object_type)
          ilike '%' || runtime.search_query || '%'
      )
  ),
  page_rows as materialized (
    select activity.*
    from filtered_rows as activity
    cross join runtime
    order by
      case when runtime.sort_order = 'created_asc' then activity.created_at end asc,
      case when runtime.sort_order = 'created_desc' then activity.created_at end desc,
      case when runtime.sort_order = 'action_asc' then activity.action end asc,
      case when runtime.sort_order = 'action_desc' then activity.action end desc,
      case when runtime.sort_order = 'actor_asc' then activity.actor end asc,
      case when runtime.sort_order = 'actor_desc' then activity.actor end desc,
      case when runtime.sort_order = 'object_asc' then activity.object_type end asc,
      case when runtime.sort_order = 'object_desc' then activity.object_type end desc,
      case when runtime.sort_order = 'subject_asc' then activity.subject end asc,
      case when runtime.sort_order = 'subject_desc' then activity.subject end desc,
      case when runtime.sort_order = 'sensitivity_asc' then activity.sensitivity end asc,
      case when runtime.sort_order = 'sensitivity_desc' then activity.sensitivity end desc,
      activity.created_at desc,
      activity.id desc
    limit (select page_size from runtime)
    offset (select (page_number - 1) * page_size from runtime)
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id,
        'action', page.action,
        'subject', page.subject,
        'actor', page.actor,
        'objectType', page.object_type,
        'sensitivity', page.sensitivity,
        'createdAt', page.created_at,
        'note', page.note
      ) order by
        case when runtime.sort_order = 'created_asc' then page.created_at end asc,
        case when runtime.sort_order = 'created_desc' then page.created_at end desc,
        case when runtime.sort_order = 'action_asc' then page.action end asc,
        case when runtime.sort_order = 'action_desc' then page.action end desc,
        case when runtime.sort_order = 'actor_asc' then page.actor end asc,
        case when runtime.sort_order = 'actor_desc' then page.actor end desc,
        case when runtime.sort_order = 'object_asc' then page.object_type end asc,
        case when runtime.sort_order = 'object_desc' then page.object_type end desc,
        case when runtime.sort_order = 'subject_asc' then page.subject end asc,
        case when runtime.sort_order = 'subject_desc' then page.subject end desc,
        case when runtime.sort_order = 'sensitivity_asc' then page.sensitivity end asc,
        case when runtime.sort_order = 'sensitivity_desc' then page.sensitivity end desc,
        page.created_at desc,
        page.id desc
      )
      from page_rows as page
      cross join runtime
    ), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'page', runtime.page_number,
      'limit', runtime.page_size,
      'total', (select count(*) from filtered_rows)
    ),
    'summary', jsonb_build_object(
      'recordedActions', (select count(*) from activity_rows),
      'confidentialEvents', (select count(*) from activity_rows where sensitivity = 'confidential'),
      'administrators', (select count(distinct admin_user_id) from activity_rows where admin_user_id is not null)
    ),
    'facets', jsonb_build_object(
      'actors', coalesce((
        select jsonb_agg(facet.actor order by facet.actor)
        from (select distinct actor from activity_rows order by actor limit 200) as facet
      ), '[]'::jsonb),
      'actions', coalesce((
        select jsonb_agg(facet.action order by facet.action)
        from (select distinct action from activity_rows order by action limit 200) as facet
      ), '[]'::jsonb),
      'objectTypes', coalesce((
        select jsonb_agg(facet.object_type order by facet.object_type)
        from (select distinct object_type from activity_rows order by object_type limit 20) as facet
      ), '[]'::jsonb)
    )
  )
  from runtime;
$$;

revoke all on function public.admin_list_activity_log(
  integer, integer, text, text, text, text, text, date, date, text
) from public, anon, authenticated;
grant execute on function public.admin_list_activity_log(
  integer, integer, text, text, text, text, text, date, date, text
) to service_role;

comment on function public.admin_list_activity_log(
  integer, integer, text, text, text, text, text, date, date, text
) is 'Bounded service-role-only Activity Log projection. Whitelists the note field and never returns raw metadata or object IDs.';

commit;
