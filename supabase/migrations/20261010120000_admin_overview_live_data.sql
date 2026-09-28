-- One bounded, service-role-only read model for the real administration
-- overview. It aggregates operational counts without exposing record UUIDs,
-- private document metadata, contact details, credentials, or Storage paths.

begin;

create index if not exists admin_audit_events_recent_idx
  on public.admin_audit_events (created_at desc);

create or replace function public.admin_get_overview_dashboard(
  p_aivex_edition smallint default 2
)
returns jsonb
language sql
stable
security invoker
set search_path = public
set statement_timeout = '5s'
set timezone = 'Africa/Algiers'
as $$
  with
  runtime as materialized (
    select current_date as today, current_timestamp as generated_at
  ),
  application_stats as materialized (
    select
      count(*) filter (where application.status = 'new') as new_applications,
      count(*) filter (where application.status in ('new', 'in_review', 'interview')) as pending_applications,
      count(*) filter (
        where application.status = 'interview'
          and not exists (
            select 1
              from public.membership_interviews as interview
             where interview.application_id = application.id
               and interview.status = 'scheduled'
          )
      ) as interviews_to_schedule
      from public.membership_applications as application
  ),
  member_stats as materialized (
    select
      count(*) as active_members,
      count(*) filter (where member.study_year in ('L1', 'L2', 'L3')) as licence,
      count(*) filter (where member.study_year in ('M1', 'M2')) as master,
      count(*) filter (where member.study_year in ('E1', 'E2', 'E3', 'E4', 'E5')) as engineer,
      count(*) filter (where member.study_year not in ('L1', 'L2', 'L3', 'M1', 'M2', 'E1', 'E2', 'E3', 'E4', 'E5')) as other
      from public.club_members as member
     where member.status = 'active'
       and not exists (
         select 1 from public.club_staff_profiles as staff
          where staff.member_id = member.id
       )
  ),
  staff_stats as materialized (
    select
      count(*) filter (where staff.status = 'active') as active_staff,
      count(distinct staff.current_department) filter (where staff.status = 'active') as connected_departments
      from public.club_staff_profiles as staff
  ),
  aivex_base as materialized (
    select
      registration.id,
      registration.document_status,
      exists (
        select 1 from public.aivex_generated_documents as generated
         where generated.registration_id = registration.id
           and generated.document_type = 'docx'
           and generated.generation_status = 'generated'
      ) as form_ready,
      exists (
        select 1 from public.aivex_submitted_documents as submitted
         where submitted.registration_id = registration.id
      ) as signed_document
      from public.aivex_registrations as registration
     where registration.form_version = 4
       and registration.edition = p_aivex_edition
  ),
  aivex_stats as materialized (
    select
      count(*) as teams,
      count(*) filter (where document_status in ('signed_document_uploaded', 'under_review', 'changes_required')) as files_to_verify,
      count(*) filter (where document_status = 'signed_document_uploaded') as signed_documents,
      count(*) filter (where document_status = 'generation_failed') as generation_issues,
      count(*) filter (where form_ready) as form_ready,
      count(*) filter (where signed_document) as signed_document,
      count(*) filter (where document_status in ('under_review', 'changes_required', 'validated')) as organizer_review,
      count(*) filter (where document_status = 'validated') as validated
      from aivex_base
  ),
  correction_stats as materialized (
    select count(distinct correction.registration_id) as due_soon
      from public.aivex_correction_requests as correction
      join public.aivex_registrations as registration
        on registration.id = correction.registration_id
      cross join runtime
     where correction.resolved_at is null
       and correction.due_at <= runtime.today + 3
       and registration.form_version = 4
       and registration.edition = p_aivex_edition
  ),
  department_rows as materialized (
    select
      department.key,
      (
        select count(*)
          from public.club_staff_profiles as staff
         where staff.current_department = department.key
           and staff.status = 'active'
      ) as active,
      (
        select count(*)
          from public.membership_applications as application
         where application.join_type = 'staff'
           and application.status in ('new', 'in_review', 'interview')
           and application.staff_department = department.key
      ) as waiting
      from (values
        ('dev-tech'::text),
        ('design-content'::text),
        ('management-logistics'::text)
      ) as department(key)
  ),
  series_buckets as materialized (
    select
      bucket.index,
      runtime.today - (29 - bucket.index * 5) as start_date,
      least(runtime.today, runtime.today - (29 - bucket.index * 5) + 4) as end_date
      from generate_series(0, 5) as bucket(index)
      cross join runtime
  ),
  series_rows as materialized (
    select
      bucket.index,
      bucket.start_date,
      bucket.end_date,
      (
        select count(*) from public.membership_applications as application
         where application.join_type = 'member'
           and application.submitted_at >= bucket.start_date::timestamptz
           and application.submitted_at < (bucket.end_date + 1)::timestamptz
      ) as member,
      (
        select count(*) from public.membership_applications as application
         where application.join_type = 'staff'
           and application.submitted_at >= bucket.start_date::timestamptz
           and application.submitted_at < (bucket.end_date + 1)::timestamptz
      ) as staff,
      (
        select count(*) from public.aivex_registrations as registration
         where registration.form_version = 4
           and registration.edition = p_aivex_edition
           and registration.submitted_at >= bucket.start_date::timestamptz
           and registration.submitted_at < (bucket.end_date + 1)::timestamptz
      ) as aivex
      from series_buckets as bucket
  ),
  recent_audit as materialized (
    select audit.admin_user_id, audit.object_type, audit.object_id,
           audit.action, audit.sensitivity, audit.created_at
      from public.admin_audit_events as audit
     order by audit.created_at desc
     limit 8
  ),
  activity_rows as materialized (
    select
      audit.action,
      audit.object_type,
      audit.sensitivity,
      audit.created_at,
      coalesce(administrator.display_name, 'Infinity Administration') as actor,
      coalesce(
        case when application.id is not null then concat_ws(' · ', application.full_name, application.reference) end,
        case when registration.id is not null then concat_ws(' · ', registration.team_name, registration.reference) end,
        member.full_name,
        staff_member.full_name,
        'Administrative record'
      ) as subject
      from recent_audit as audit
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
     order by audit.created_at desc
  )
  select jsonb_build_object(
    'generatedAt', runtime.generated_at,
    'edition', p_aivex_edition,
    'stats', jsonb_build_object(
      'newApplications', application_stats.new_applications,
      'pendingApplications', application_stats.pending_applications,
      'activeMembers', member_stats.active_members,
      'activeStaff', staff_stats.active_staff,
      'aivexTeams', aivex_stats.teams,
      'filesToVerify', aivex_stats.files_to_verify,
      'connectedDepartments', staff_stats.connected_departments
    ),
    'priorities', jsonb_build_object(
      'newApplications', application_stats.new_applications,
      'interviewsToSchedule', application_stats.interviews_to_schedule,
      'signedDocuments', aivex_stats.signed_documents,
      'correctionsDue', correction_stats.due_soon,
      'generationIssues', aivex_stats.generation_issues
    ),
    'community', jsonb_build_object(
      'members', member_stats.active_members,
      'staff', staff_stats.active_staff,
      'pending', application_stats.pending_applications,
      'studyLevels', jsonb_build_object(
        'licence', member_stats.licence,
        'master', member_stats.master,
        'engineer', member_stats.engineer,
        'other', member_stats.other
      )
    ),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', department.key,
        'active', department.active,
        'waiting', department.waiting
      ) order by department.key)
      from department_rows as department
    ), '[]'::jsonb),
    'aivexPipeline', jsonb_build_object(
      'registered', aivex_stats.teams,
      'formReady', aivex_stats.form_ready,
      'signedDocument', aivex_stats.signed_document,
      'organizerReview', aivex_stats.organizer_review,
      'validated', aivex_stats.validated
    ),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'startDate', series.start_date,
        'endDate', series.end_date,
        'member', series.member,
        'staff', series.staff,
        'aivex', series.aivex
      ) order by series.index)
      from series_rows as series
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', activity.action,
        'subject', activity.subject,
        'actor', activity.actor,
        'objectType', activity.object_type,
        'sensitivity', activity.sensitivity,
        'createdAt', activity.created_at
      ) order by activity.created_at desc)
      from activity_rows as activity
    ), '[]'::jsonb)
  )
  from runtime
  cross join application_stats
  cross join member_stats
  cross join staff_stats
  cross join aivex_stats
  cross join correction_stats;
$$;

revoke all on function public.admin_get_overview_dashboard(smallint)
  from public, anon, authenticated;
grant execute on function public.admin_get_overview_dashboard(smallint)
  to service_role;

comment on function public.admin_get_overview_dashboard(smallint) is
  'Returns a bounded, aggregate-only live administration overview in one service-role database call.';

commit;
