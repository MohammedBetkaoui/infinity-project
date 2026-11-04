-- Supabase Cron trigger for the workshop invitation delivery worker.
--
-- Vercel Hobby only allows daily cron jobs, so the one-minute trigger moved
-- from vercel.json (Phase 2) to Supabase Cron: pg_cron schedules the call and
-- pg_net performs the HTTP request to the unchanged Vercel worker endpoint.
--
-- SECURITY MODEL
--   - The bearer token (same value as the server-side CRON_SECRET on Vercel)
--     lives in Supabase Vault under the name "infinity_worker_cron_secret".
--     A trusted operator inserts it with vault.create_secret(); it is NEVER
--     written by this migration and NEVER persisted in SQL text, logs, or
--     function results.
--   - The secret is read from vault.decrypted_secrets at HTTP-call time by a
--     SECURITY DEFINER function whose EXECUTE privilege is limited to the
--     postgres maintenance role. anon/authenticated/public get nothing.
--   - The scheduled cron command contains no secret and no SQL-built token:
--     it purges old manifest rows, inserts the pg_net request id into a
--     durable manifest table and calls the trigger function, which fetches
--     the secret from Vault.
--
-- ACTIVATION IS EXPLICIT AND SEPARATED (safe-by-default):
--   This migration prepares the objects only. Nothing is scheduled here.
--   An operator activates scheduling, after configuring the Vault secret:
--     select public.activate_event_invitation_worker_cron();
--   (An optional https origin parameter targets a staging deployment, e.g.
--    'https://preview-project.vercel.app'. Production is the default.)
--   Deactivation (keeps queued invitations and all data):
--     select public.deactivate_event_invitation_worker_cron();
--   Diagnostics (cron state, recent HTTP outcomes, queue overview):
--     select public.event_invitation_worker_cron_status();
--
-- Requires public.event_invitation_delivery_jobs from
-- 20261104130000_automatic_event_invitation_delivery.sql (applied earlier).
-- Rollback: deactivate first, then use the drop statements listed at the
-- bottom. Extensions are intentionally kept.

begin;

-- ---------------------------------------------------------------------------
-- Extensions (idempotent, checked up-front, actionable diagnostics)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise exception 'pg_cron_unavailable' using errcode = 'feature_not_supported';
  end if;
  if not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise exception 'pg_net_unavailable' using errcode = 'feature_not_supported';
  end if;
end $$;

-- pg_cron installs the cron schema and API. Supabase keeps the binaries
-- pre-installed, so this only enables them for the project.
create extension if not exists pg_cron;

-- pg_net always creates its own net schema; the schema clause matches the
-- Supabase security check. A pre-existing installation in another schema
-- (older projects) is left untouched.
create schema if not exists extensions;
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    begin
      create extension pg_net with schema extensions;
    exception
      when others then
        create extension if not exists pg_net;
    end;
  end if;
end $$;

-- Fail safe with actionable diagnostics instead of later cryptic errors.
do $$
begin
  if to_regprocedure('cron.schedule(text, text, text)') is null then
    raise exception 'pg_cron_schedule_not_available' using errcode = 'feature_not_supported';
  end if;
  if to_regprocedure('net.http_get(text, jsonb, jsonb, integer)') is null then
    raise exception 'pg_net_http_get_not_available' using errcode = 'feature_not_supported';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Durable manifest of fired trigger requests
-- ---------------------------------------------------------------------------

-- One row per cron tick, holding the pg_net request id. HTTP outcomes are
-- attributed exactly through it, surviving pg_net unlogged tables and
-- cron.job_run_details volatility. Retained 24 hours; the scheduled command
-- purges older rows every tick.
create table if not exists public.event_invitation_worker_cron_requests (
  request_id bigint primary key,
  created_at timestamptz not null default now()
);

alter table public.event_invitation_worker_cron_requests enable row level security;

revoke all on table public.event_invitation_worker_cron_requests from public, anon, authenticated;
grant insert, select, delete on table public.event_invitation_worker_cron_requests to service_role;

comment on table public.event_invitation_worker_cron_requests is
  'Durable manifest of Supabase Cron trigger request ids for HTTP diagnostics. Never stores worker payload data.';

-- ---------------------------------------------------------------------------
-- Vault secret guard
-- ---------------------------------------------------------------------------

-- Returns whether the Vault currently holds a usable bearer token for the
-- worker: readable table, known name, at least 32 characters. Never returns
-- or logs the value.
create or replace function public.event_invitation_worker_cron_secret_ok()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  return exists (
    select 1
      from vault.decrypted_secrets v
     where v.name = 'infinity_worker_cron_secret'
       and length(trim(v.decrypted_secret)) >= 32
       and v.decrypted_secret is not null
  );
end;
$$;

comment on function public.event_invitation_worker_cron_secret_ok() is
  'Config-state check for the Vault bearer token of the invitation worker. Boolean only; never exposes the value.';

-- ---------------------------------------------------------------------------
-- Target origin helper
-- ---------------------------------------------------------------------------

-- Validates the operator-provided worker origin (activation parameter) or
-- falls back to production. The canonical worker path is appended by the
-- trigger function below, so an operator can only ever target the worker
-- endpoint, never an arbitrary URL.
create or replace function public.event_invitation_worker_target_origin(p_origin text default null)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_origin is null then
    return 'https://www.infinty-bba.com';
  end if;
  if lower(btrim(p_origin)) !~ '^https://[a-z0-9.-]+(:[0-9]{2,5})?$' then
    raise exception 'invalid_worker_origin' using errcode = '22023';
  end if;
  return lower(btrim(p_origin));
end;
$$;

-- ---------------------------------------------------------------------------
-- HTTP trigger target (executed by the scheduled cron command)
-- ---------------------------------------------------------------------------

-- Fires the one-minute worker call. The secret is fetched from Vault at call
-- time (name "infinity_worker_cron_secret", value equal to the targeted
-- deployment's CRON_SECRET). Returns the pg_net request id for diagnostics;
-- pg_net is asynchronous, so delivery truth remains in
-- public.event_invitation_delivery_jobs. A missing/too-short secret fails
-- loudly with a fixed code and never exposes the value.
create or replace function public.event_invitation_worker_cron_target(p_origin text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origin text;
  v_url text;
  v_secret text;
begin
  v_origin := public.event_invitation_worker_target_origin(p_origin);
  v_url := v_origin || '/api/event-invitation-worker';
  -- https only, exact worker path: a second guard over the helper above.
  if v_url !~ '^https://[a-z0-9.-]+(:[0-9]{2,5})?/api/event-invitation-worker$' then
    raise exception 'invalid_worker_origin' using errcode = '22023';
  end if;

  if not public.event_invitation_worker_cron_secret_ok() then
    raise exception 'worker_cron_secret_not_configured' using errcode = '22023';
  end if;
  select trim(v.decrypted_secret) into v_secret
    from vault.decrypted_secrets v
   where v.name = 'infinity_worker_cron_secret'
   order by v.created_at desc
   limit 1;
  -- The helper already guaranteed exactly this shape; belt and braces.
  if v_secret is null or length(v_secret) < 32 then
    raise exception 'worker_cron_secret_not_configured' using errcode = '22023';
  end if;

  -- 30 s covers a fully degraded invocation (3 webhook waves plus SQL);
  -- a pg_net timeout does not cancel a Vercel invocation, it only caps
  -- this trigger's interest in the response.
  return net.http_get(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Cache-Control', 'no-store',
      'X-Infinity-Trigger', 'supabase-cron'
    ),
    timeout_milliseconds := 30000
  );
end;
$$;

comment on function public.event_invitation_worker_cron_target(text) is
  'Cron trigger: reads the Vault bearer token at call time and fires the worker GET. Returns the pg_net request id.';

-- ---------------------------------------------------------------------------
-- Activation / deactivation
-- ---------------------------------------------------------------------------

-- Schedules or refreshes the one-minute trigger. Idempotent: the canonical
-- job name is unscheduled first, and any stray job that also calls this
-- trigger is refused with a fixed error so duplicates never accumulate.
-- Requires the Vault secret to be configured first: preview branches or fresh
-- projects without it cannot be activated (explicit configuration required).
create or replace function public.activate_event_invitation_worker_cron(p_origin text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jobname constant text := 'infinity-event-invitation-worker';
  v_origin text;
  v_url text;
  v_command text;
  v_scheduled integer;
begin
  if not public.event_invitation_worker_cron_secret_ok() then
    raise exception 'worker_cron_secret_not_configured' using errcode = '22023';
  end if;

  v_origin := public.event_invitation_worker_target_origin(p_origin);
  v_url := v_origin || '/api/event-invitation-worker';

  -- Refuse stray duplicates BEFORE touching anything: any other job whose
  -- command also calls this trigger must be resolved by an operator.
  if exists (
    select 1 from cron.job
     where coalesce(jobname, '') <> v_jobname
       and command like '%event_invitation_worker%'
  ) then
    raise exception 'duplicate_worker_cron_job' using errcode = '22023';
  end if;

  -- Unschedule every existing job under the canonical name, then create
  -- exactly one; re-running replaces schedule/origin in place.
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = v_jobname;

  v_command := format(
    'delete from public.event_invitation_worker_cron_requests'
    ' where created_at < now() - interval %L;'
    ' insert into public.event_invitation_worker_cron_requests (request_id)'
    ' select public.event_invitation_worker_cron_target(%L);',
    '24 hours', v_origin
  );

  perform cron.schedule(v_jobname, '* * * * *', v_command);

  select count(*)::integer into v_scheduled from cron.job j where j.jobname = v_jobname;
  if v_scheduled <> 1 then
    raise exception 'double_scheduled_worker_cron' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'jobname', v_jobname,
    'schedule', '* * * * *',
    'target_url', v_url,
    'manifest_table', 'public.event_invitation_worker_cron_requests'
  );
end;
$$;

comment on function public.activate_event_invitation_worker_cron(text) is
  'Operator action: enables the one-minute worker trigger, replacing any previous scheduling of the same job name. Requires the Vault secret.';

-- Stops the automatic trigger. Queued invitations, delivery jobs and student
-- data are untouched; the worker endpoint can still be fired manually by an
-- authorized secret holder.
create or replace function public.deactivate_event_invitation_worker_cron()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jobname constant text := 'infinity-event-invitation-worker';
  v_removed integer := 0;
  v_job_id bigint;
begin
  for v_job_id in select c.jobid from cron.job c where c.jobname = v_jobname loop
    perform cron.unschedule(v_job_id);
    v_removed := v_removed + 1;
  end loop;
  return v_removed;
end;
$$;

comment on function public.deactivate_event_invitation_worker_cron() is
  'Operator action: unschedules the worker trigger job(s) and returns how many were removed.';

-- ---------------------------------------------------------------------------
-- Diagnostics (secret-free, Phase 7 operator checks)
-- ---------------------------------------------------------------------------

-- Delivery queue overview straight from the outbox (delivery state only).
create or replace function public.event_invitation_worker_cron_queue_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts jsonb;
  v_oldest timestamptz;
  v_expired_processing integer;
begin
  select coalesce(jsonb_object_agg(q.delivery_status, q.jobs), '{}'::jsonb)
    into v_counts
    from (
      select j.delivery_status, count(*)::integer as jobs
        from public.event_invitation_delivery_jobs j
       group by j.delivery_status
    ) q;

  select min(j.next_attempt_at) into v_oldest
    from public.event_invitation_delivery_jobs j
   where j.delivery_status in ('pending', 'retry_scheduled');

  select count(*)::integer into v_expired_processing
    from public.event_invitation_delivery_jobs j
   where j.delivery_status = 'processing'
     and j.lease_expires_at <= now();

  return jsonb_build_object(
    'by_status', v_counts,
    'oldest_due_at', v_oldest,
    'processing_lease_expired', v_expired_processing
  );
end;
$$;

comment on function public.event_invitation_worker_cron_queue_status() is
  'Delivery queue overview (status counts, oldest due job, expired leases).';

-- HTTP outcome aggregates for manifest requests of the last 24 hours.
-- net._http_response is an unlogged pg_net table with a 6h retention, so
-- missing responses for older requests are reported as unresolved, not as
-- failures. A transport timeout is ambiguous: the durable job states in
-- event_invitation_delivery_jobs remain the source of truth.
create or replace function public.event_invitation_worker_cron_http_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested integer;
  v_responded integer;
  v_latest record;
  v_window constant text := '24 hours';
begin
  select count(*)::integer into v_requested
    from public.event_invitation_worker_cron_requests r
   where r.created_at >= now() - make_interval(hours => 24);

  if to_regclass('net._http_response') is null then
    return jsonb_build_object(
      'available', false, 'reason', 'pg_net_unavailable', 'requested_24h', v_requested
    );
  end if;

  select count(*)::integer into v_responded
    from net._http_response n
   where n.id in (
     select r.request_id from public.event_invitation_worker_cron_requests r
      where r.created_at >= now() - interval '24 hours'
   );

  select n.status_code as status_code, n.timed_out as timed_out,
         n.error_msg as error_msg, n.created as created
    into v_latest
    from net._http_response n
   where n.id in (
     select r.request_id from public.event_invitation_worker_cron_requests r
      where r.created_at >= now() - interval '24 hours'
   )
   order by n.created desc
   limit 1;

  return jsonb_build_object(
    'available', true,
    'requested_24h', v_requested,
    'responded_24h', v_responded,
    'unresolved_24h', greatest(0, v_requested - v_responded),
    'ok_24h', public.event_invitation_worker_cron_http_count('ok', v_window),
    'refused_24h', public.event_invitation_worker_cron_http_count('refused', v_window),
    'server_error_24h', public.event_invitation_worker_cron_http_count('server_error', v_window),
    'timed_out_24h', public.event_invitation_worker_cron_http_count('timed_out', v_window),
    'transport_error_24h', public.event_invitation_worker_cron_http_count('transport_error', v_window),
    'latest', case
      when v_latest.created is null then null
      else jsonb_build_object(
        'status_code', v_latest.status_code,
        'timed_out', coalesce(v_latest.timed_out, false),
        'error_msg', left(coalesce(v_latest.error_msg, ''), 200),
        'created_at', v_latest.created
      )
    end
  );
end;
$$;

comment on function public.event_invitation_worker_cron_http_status() is
  'Aggregate HTTP outcomes of cron-triggered worker calls over the last 24 hours, categorized. Response bodies are never returned.';

-- Shared counting helper, one category at a time.
create or replace function public.event_invitation_worker_cron_http_count(
  p_category text,
  p_window text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_category not in ('ok', 'refused', 'server_error', 'timed_out', 'transport_error')
     or p_window <> '24 hours' then
    raise exception 'invalid_http_status_category' using errcode = '22023';
  end if;

  with requests as (
    select r.request_id from public.event_invitation_worker_cron_requests r
     where r.created_at >= now() - interval '24 hours'
  )
  select count(*)::integer into v_count
    from net._http_response n
    join requests q on q.request_id = n.id
   where case p_category
            when 'ok' then n.status_code between 200 and 299
            when 'refused' then n.status_code between 400 and 499
            when 'server_error' then n.status_code >= 500
            when 'timed_out' then coalesce(n.timed_out, false)
              and (n.status_code is null or n.status_code < 200 or n.status_code >= 300)
            else n.error_msg is not null
              and (n.status_code is null or coalesce(n.timed_out, false))
          end;

  return v_count;
end;
$$;

-- Full operator report: scheduling state, recent SQL runs, last-24h run
-- statistics, HTTP outcomes, delivery queue, and Vault secret config state.
create or replace function public.event_invitation_worker_cron_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jobname constant text := 'infinity-event-invitation-worker';
  v_job_row record;
  v_now timestamptz := now();
  v_runs jsonb;
  v_run_stats jsonb;
  v_secret_ok boolean;
begin
  v_secret_ok := public.event_invitation_worker_cron_secret_ok();

  select jobid, jobname, schedule, active into v_job_row
    from cron.job c where c.jobname = v_jobname order by c.jobid limit 1;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'started_at', dr.start_time, 'status', dr.status,
             'request_id', left(coalesce(dr.return_message, ''), 32)
           ) order by dr.start_time desc), '[]'::jsonb)
    into v_runs
    from (
      select source.start_time, source.status, source.return_message
        from cron.job_run_details source
       where source.jobid = v_job_row.jobid
       order by source.start_time desc
       limit 10
    ) dr;

  select jsonb_build_object(
           'total', count(*)::integer,
           'failed', count(*) filter (where dr.status = 'failed')::integer,
           'window_hours', 24
         )
    into v_run_stats
    from cron.job_run_details dr
   where dr.jobid = v_job_row.jobid
     and dr.start_time >= v_now - interval '24 hours';

  if v_job_row.jobid is null then
    return jsonb_build_object(
      'generated_at', v_now,
      'cron', jsonb_build_object(
        'job_exists', false,
        'jobname', v_jobname,
        'hint', case
                  when v_secret_ok then 'run select public.activate_event_invitation_worker_cron();'
                  else 'configure the Vault secret first, then run select public.activate_event_invitation_worker_cron();'
                end
      ),
      'secret_configured', v_secret_ok,
      'runs', v_runs,
      'run_stats_24h', v_run_stats,
      'http', jsonb_build_object('available', false, 'reason', 'cron_not_scheduled'),
      'queue', public.event_invitation_worker_cron_queue_status()
    );
  end if;

  return jsonb_build_object(
    'generated_at', v_now,
    'cron', jsonb_build_object(
      'job_exists', true,
      'jobname', v_jobname,
      'schedule', v_job_row.schedule,
      'active', v_job_row.active
    ),
    'secret_configured', v_secret_ok,
    'runs', v_runs,
    'run_stats_24h', v_run_stats,
    'http', public.event_invitation_worker_cron_http_status(),
    'queue', public.event_invitation_worker_cron_queue_status()
  );
end;
$$;

comment on function public.event_invitation_worker_cron_status() is
  'Operator diagnostic: cron state, recent runs, HTTP outcomes (24h), delivery queue overview. Never returns secrets, emails, tokens or links.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke execute on function public.event_invitation_worker_cron_secret_ok() from public, anon, authenticated;
revoke execute on function public.event_invitation_worker_target_origin(text) from public, anon, authenticated;
revoke execute on function public.event_invitation_worker_cron_target(text) from public, anon, authenticated;
revoke execute on function public.activate_event_invitation_worker_cron(text) from public, anon, authenticated;
revoke execute on function public.deactivate_event_invitation_worker_cron() from public, anon, authenticated;
revoke execute on function public.event_invitation_worker_cron_status() from public, anon, authenticated;
revoke execute on function public.event_invitation_worker_cron_http_status() from public, anon, authenticated;
revoke execute on function public.event_invitation_worker_cron_http_count(text, text) from public, anon, authenticated;
revoke execute on function public.event_invitation_worker_cron_queue_status() from public, anon, authenticated;

-- Scheduling happens under the postgres role: it performs activation and
-- executes the cron command. service_role keeps status diagnostics only, so
-- no backend role can trigger or reschedule without an operator.
grant execute on function public.event_invitation_worker_cron_secret_ok() to postgres, service_role;
grant execute on function public.event_invitation_worker_target_origin(text) to postgres, service_role;
grant execute on function public.event_invitation_worker_cron_target(text) to postgres;
grant execute on function public.activate_event_invitation_worker_cron(text) to postgres;
grant execute on function public.deactivate_event_invitation_worker_cron() to postgres;
grant execute on function public.event_invitation_worker_cron_status() to postgres, service_role;
grant execute on function public.event_invitation_worker_cron_http_status() to postgres, service_role;
grant execute on function public.event_invitation_worker_cron_http_count(text, text) to postgres, service_role;
grant execute on function public.event_invitation_worker_cron_queue_status() to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Rollback (run manually, AFTER a deactivate call, from the SQL editor):
--
-- begin;
-- revoke all on function public.event_invitation_worker_cron_secret_ok() from postgres, service_role;
-- revoke all on function public.event_invitation_worker_target_origin(text) from postgres, service_role;
-- revoke all on function public.event_invitation_worker_cron_target(text) from postgres;
-- revoke all on function public.activate_event_invitation_worker_cron(text) from postgres;
-- revoke all on function public.deactivate_event_invitation_worker_cron() from postgres;
-- revoke all on function public.event_invitation_worker_cron_status() from postgres, service_role;
-- revoke all on function public.event_invitation_worker_cron_http_status() from postgres, service_role;
-- revoke all on function public.event_invitation_worker_cron_http_count(text, text) from postgres, service_role;
-- revoke all on function public.event_invitation_worker_cron_queue_status() from postgres, service_role;
-- drop function if exists public.event_invitation_worker_cron_status();
-- drop function if exists public.event_invitation_worker_cron_http_status();
-- drop function if exists public.event_invitation_worker_cron_http_count(text, text);
-- drop function if exists public.event_invitation_worker_cron_queue_status();
-- drop function if exists public.deactivate_event_invitation_worker_cron();
-- drop function if exists public.activate_event_invitation_worker_cron(text);
-- drop function if exists public.event_invitation_worker_cron_target(text);
-- drop function if exists public.event_invitation_worker_target_origin(text);
-- drop function if exists public.event_invitation_worker_cron_secret_ok();
-- drop table if exists public.event_invitation_worker_cron_requests;
-- commit;
-- Extensions pg_cron/pg_net are intentionally kept (other features may rely
-- on them; removal touches no invitation data either way).
--
-- Vault cleanup (never while staging/production still rely on the value):
--   select id from vault.secrets where name = 'infinity_worker_cron_secret';
--   delete from vault.secrets where id = '<uuid above>';
-- ---------------------------------------------------------------------------

commit;
