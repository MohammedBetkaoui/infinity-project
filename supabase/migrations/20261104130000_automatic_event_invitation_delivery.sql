-- Durable automatic workshop invitations and n8n delivery outbox.
--
-- Delivery is intentionally at-least-once. A timeout can happen after n8n
-- accepted a request, so the workflow must deduplicate the Idempotency-Key
-- header. Private credentials are never stored in the outbox: only the
-- invitation row, its hash/version metadata, and the delivery state persist.
--
-- This migration does not enqueue historical invitations. New membership
-- applications and events that become eligible are automatic; a super admin
-- can explicitly queue already-existing invitations through the RPC below.

begin;

create or replace function public.is_automatic_workshop_invitation_eligible(
  p_event_type text,
  p_status text
) returns boolean
language sql
immutable
set search_path = public
as $$
  select p_event_type = 'workshop'
    and p_status in ('planned', 'registration_open', 'registration_closed', 'ongoing');
$$;

create table public.event_invitation_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_events (id) on delete cascade,
  invitation_id uuid not null references public.club_event_invitations (id) on delete cascade,
  membership_application_id uuid not null references public.membership_applications (id) on delete cascade,
  delivery_purpose text not null default 'n8n_registration_invitation',
  delivery_status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  last_error_code text,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_invitation_delivery_purpose_check
    check (delivery_purpose = 'n8n_registration_invitation'),
  constraint event_invitation_delivery_status_check
    check (delivery_status in ('pending', 'processing', 'delivered', 'failed', 'retry_scheduled')),
  constraint event_invitation_delivery_attempts_check
    check (attempt_count >= 0 and max_attempts between 1 and 20 and attempt_count <= max_attempts),
  constraint event_invitation_delivery_error_code_check
    check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,64}$'),
  constraint event_invitation_delivery_delivered_check
    check ((delivery_status = 'delivered') = (delivered_at is not null)),
  constraint event_invitation_delivery_lease_check
    check (
      (delivery_status = 'processing' and lease_token is not null and lease_expires_at is not null)
      or (delivery_status <> 'processing' and lease_token is null and lease_expires_at is null)
    ),
  constraint event_invitation_delivery_unique unique (invitation_id, delivery_purpose)
);

-- Bind all three references to the same invitation, rather than merely to
-- independently valid event/application rows.
alter table public.club_event_invitations
  add constraint club_event_invitation_delivery_identity_unique
    unique (id, event_id, membership_application_id);

alter table public.event_invitation_delivery_jobs
  add constraint event_invitation_delivery_identity_fk
    foreign key (invitation_id, event_id, membership_application_id)
    references public.club_event_invitations (id, event_id, membership_application_id)
    on delete cascade;

create index event_invitation_delivery_due_idx
  on public.event_invitation_delivery_jobs (next_attempt_at, created_at)
  where delivery_status in ('pending', 'retry_scheduled');
create index event_invitation_delivery_lease_idx
  on public.event_invitation_delivery_jobs (lease_expires_at)
  where delivery_status = 'processing';
create index event_invitation_delivery_event_status_idx
  on public.event_invitation_delivery_jobs (event_id, delivery_status);

create table public.event_invitation_backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.club_events (id) on delete cascade,
  backfill_status text not null default 'pending',
  cursor_application_id uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_invitation_backfill_status_check
    check (backfill_status in ('pending', 'processing', 'completed', 'failed')),
  constraint event_invitation_backfill_error_code_check
    check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,64}$'),
  constraint event_invitation_backfill_lease_check
    check (
      (backfill_status = 'processing' and lease_token is not null and lease_expires_at is not null)
      or (backfill_status <> 'processing' and lease_token is null and lease_expires_at is null)
    )
);

create index event_invitation_backfill_claim_idx
  on public.event_invitation_backfill_jobs (updated_at, created_at)
  where backfill_status in ('pending', 'processing');

-- Every new invitation for an eligible event gets exactly one outbox row.
create or replace function public.queue_new_event_invitation_delivery()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status in ('invited', 'registered')
    and exists (
      select 1 from public.club_events event
       where event.id = new.event_id
         and public.is_automatic_workshop_invitation_eligible(event.event_type, event.status)
    )
  then
    insert into public.event_invitation_delivery_jobs
      (event_id, invitation_id, membership_application_id, created_at, updated_at)
    values
      (new.event_id, new.id, new.membership_application_id, coalesce(new.invited_at, now()), now())
    on conflict (invitation_id, delivery_purpose) do nothing;
  end if;
  return new;
end;
$$;

create trigger club_event_invitation_delivery_after_insert
after insert on public.club_event_invitations
for each row execute function public.queue_new_event_invitation_delivery();

-- The membership insert, invitation creation, and outbox insertion share the
-- same transaction. A webhook outage can therefore never lose an invitation,
-- and the public Join response never waits for n8n.
create or replace function public.auto_invite_new_membership_application()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.join_type not in ('member', 'staff') then return new; end if;

  insert into public.club_event_invitations
    (event_id, membership_application_id, status, invited_at, invited_by_admin_user_id, created_at)
  select event.id, new.id, 'invited', coalesce(new.submitted_at, now()), null, now()
    from public.club_events event
   where public.is_automatic_workshop_invitation_eligible(event.event_type, event.status)
  on conflict (event_id, membership_application_id) do nothing;

  -- Also repair the durable job if the invitation already existed because of
  -- a concurrent administrative action.
  insert into public.event_invitation_delivery_jobs
    (event_id, invitation_id, membership_application_id, created_at, updated_at)
  select invitation.event_id, invitation.id, invitation.membership_application_id, now(), now()
    from public.club_event_invitations invitation
    join public.club_events event on event.id = invitation.event_id
   where invitation.membership_application_id = new.id
     and invitation.status in ('invited', 'registered')
     and public.is_automatic_workshop_invitation_eligible(event.event_type, event.status)
  on conflict (invitation_id, delivery_purpose) do nothing;

  return new;
end;
$$;

create trigger membership_application_auto_event_invitations
after insert on public.membership_applications
for each row execute function public.auto_invite_new_membership_application();

-- New events and transitions from an ineligible to an eligible lifecycle are
-- paginated by the worker. No rows are seeded here, so deployment itself does
-- not send historical invitations.
create or replace function public.queue_event_invitation_backfill()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  became_eligible boolean;
begin
  became_eligible := public.is_automatic_workshop_invitation_eligible(new.event_type, new.status)
    and (
      tg_op = 'INSERT'
      or not public.is_automatic_workshop_invitation_eligible(old.event_type, old.status)
    );

  if became_eligible then
    insert into public.event_invitation_backfill_jobs
      (event_id, backfill_status, cursor_application_id, lease_token, lease_expires_at, last_error_code, created_at, updated_at)
    values (new.id, 'pending', null, null, null, null, now(), now())
    on conflict (event_id) do update set
      backfill_status = 'pending', cursor_application_id = null,
      lease_token = null, lease_expires_at = null, last_error_code = null,
      updated_at = excluded.updated_at;
  elsif not public.is_automatic_workshop_invitation_eligible(new.event_type, new.status) then
    update public.event_invitation_backfill_jobs
       set backfill_status = 'failed', lease_token = null, lease_expires_at = null,
           last_error_code = 'event_ineligible', updated_at = now()
     where event_id = new.id and backfill_status <> 'completed';
  end if;
  return new;
end;
$$;

create trigger club_event_invitation_backfill_after_insert
after insert on public.club_events
for each row execute function public.queue_event_invitation_backfill();
create trigger club_event_invitation_backfill_after_eligibility_change
after update of event_type, status on public.club_events
for each row
when (old.event_type is distinct from new.event_type or old.status is distinct from new.status)
execute function public.queue_event_invitation_backfill();

-- Claim due deliveries atomically. Expired processing leases are reclaimable;
-- SKIP LOCKED lets concurrent Vercel workers receive disjoint batches.
create or replace function public.worker_claim_event_invitation_deliveries(
  p_lease_token uuid,
  p_limit integer default 25,
  p_lease_seconds integer default 45,
  p_now timestamptz default null
) returns table (
  job_id uuid,
  event_id uuid,
  invitation_id uuid,
  membership_application_id uuid,
  full_name text,
  email text,
  invitation_status text,
  token_hash text,
  expires_at timestamptz,
  revoked_at timestamptz,
  credential_version integer,
  derivation_version integer,
  event_starts_at timestamptz,
  event_ends_at timestamptz,
  attempt_count integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare changed_at timestamptz := coalesce(p_now, now());
begin
  if p_lease_token is null or p_limit not between 1 and 100 or p_lease_seconds not between 15 and 240
  then raise exception 'invalid_delivery_claim' using errcode = '22023'; end if;

  -- A worker that disappeared during its final allowed attempt must not leave
  -- the row in processing forever.
  update public.event_invitation_delivery_jobs
     set delivery_status = 'failed', next_attempt_at = changed_at,
         last_error_code = 'max_attempts_exhausted',
         lease_token = null, lease_expires_at = null, updated_at = changed_at
   where delivery_status = 'processing'
     and lease_expires_at <= changed_at
     and attempt_count >= max_attempts;

  -- Terminalize links/events that must never be sent. A missing credential is
  -- valid and will be created by worker_ensure_event_invitation_link.
  update public.event_invitation_delivery_jobs job
     set delivery_status = 'failed', next_attempt_at = changed_at,
         last_error_code = case
           when invitation.link_revoked_at is not null then 'link_revoked'
           when invitation.invite_token_hash is not null and invitation.invite_expires_at <= changed_at then 'link_expired'
           when invitation.status not in ('invited', 'registered') then 'invitation_inactive'
           else 'event_ineligible'
         end,
         lease_token = null, lease_expires_at = null, updated_at = changed_at
    from public.club_event_invitations invitation, public.club_events event
   where job.invitation_id = invitation.id and job.event_id = event.id
     and job.delivery_status in ('pending', 'retry_scheduled', 'processing')
     and (
       not public.is_automatic_workshop_invitation_eligible(event.event_type, event.status)
       or invitation.status not in ('invited', 'registered')
       or invitation.link_revoked_at is not null
       or (invitation.invite_token_hash is not null and invitation.invite_expires_at <= changed_at)
     );

  return query
  with claimed as (
    update public.event_invitation_delivery_jobs job
       set delivery_status = 'processing',
           attempt_count = job.attempt_count + 1,
           last_attempt_at = changed_at,
           lease_token = p_lease_token,
           lease_expires_at = changed_at + make_interval(secs => p_lease_seconds),
           last_error_code = null,
           updated_at = changed_at
     where job.id in (
       select candidate.id
         from public.event_invitation_delivery_jobs candidate
        where candidate.attempt_count < candidate.max_attempts
          and (
            (candidate.delivery_status in ('pending', 'retry_scheduled') and candidate.next_attempt_at <= changed_at)
            or (candidate.delivery_status = 'processing' and candidate.lease_expires_at <= changed_at)
          )
        order by candidate.next_attempt_at, candidate.created_at, candidate.id
        for update skip locked
        limit p_limit
     )
    returning job.*
  )
  select claimed.id, claimed.event_id, claimed.invitation_id, claimed.membership_application_id,
         application.full_name, application.email, invitation.status,
         invitation.invite_token_hash, invitation.invite_expires_at, invitation.link_revoked_at,
         invitation.credential_version, invitation.credential_derivation_version,
         event.starts_at, event.ends_at, claimed.attempt_count
    from claimed
    join public.club_event_invitations invitation on invitation.id = claimed.invitation_id
    join public.membership_applications application on application.id = claimed.membership_application_id
    join public.club_events event on event.id = claimed.event_id;
end;
$$;

-- Create the first stable credential only when none exists. Existing active
-- credentials are returned unchanged; expired/revoked credentials are refused
-- instead of silently rotated.
create or replace function public.worker_ensure_event_invitation_link(
  p_job_id uuid,
  p_lease_token uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_now timestamptz default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed_at timestamptz := coalesce(p_now, now());
  job_row public.event_invitation_delivery_jobs%rowtype;
  invitation_row public.club_event_invitations%rowtype;
  event_row public.club_events%rowtype;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_expires_at <= changed_at
  then raise exception 'invalid_invitation_credential' using errcode = '22023'; end if;

  select * into job_row from public.event_invitation_delivery_jobs
   where id = p_job_id and delivery_status = 'processing'
     and lease_token = p_lease_token and lease_expires_at > changed_at
   for update;
  if not found then raise exception 'delivery_lease_lost' using errcode = '40001'; end if;

  select * into invitation_row from public.club_event_invitations
   where id = job_row.invitation_id for update;
  select * into event_row from public.club_events where id = job_row.event_id for share;

  if not public.is_automatic_workshop_invitation_eligible(event_row.event_type, event_row.status)
    or invitation_row.status not in ('invited', 'registered')
  then raise exception 'invitation_not_active' using errcode = '22023'; end if;
  if invitation_row.link_revoked_at is not null
  then raise exception 'invitation_link_revoked' using errcode = '22023'; end if;

  if invitation_row.invite_token_hash is not null then
    if invitation_row.invite_expires_at <= changed_at
    then raise exception 'invitation_link_expired' using errcode = '22023'; end if;
  else
    update public.club_event_invitations set
      invite_token_hash = p_token_hash,
      invite_expires_at = p_expires_at,
      credential_version = 1,
      credential_derivation_version = 1,
      link_revoked_at = null
    where id = invitation_row.id
    returning * into invitation_row;
  end if;

  return jsonb_build_object(
    'invitation_id', invitation_row.id,
    'token_hash', invitation_row.invite_token_hash,
    'expires_at', invitation_row.invite_expires_at,
    'revoked_at', invitation_row.link_revoked_at,
    'credential_version', invitation_row.credential_version,
    'derivation_version', invitation_row.credential_derivation_version
  );
end;
$$;

create or replace function public.worker_finish_event_invitation_delivery(
  p_job_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_error_code text default null,
  p_retryable boolean default true,
  p_now timestamptz default null
) returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed_at timestamptz := coalesce(p_now, now());
  job_row public.event_invitation_delivery_jobs%rowtype;
  next_status text;
  safe_error text;
  delay_seconds integer;
begin
  select * into job_row from public.event_invitation_delivery_jobs
   where id = p_job_id and delivery_status = 'processing' and lease_token = p_lease_token
   for update;
  if not found then raise exception 'delivery_lease_lost' using errcode = '40001'; end if;

  safe_error := lower(coalesce(p_error_code, 'delivery_failed'));
  if safe_error !~ '^[a-z0-9_]{1,64}$' then safe_error := 'delivery_failed'; end if;

  if p_succeeded then
    update public.event_invitation_delivery_jobs set
      delivery_status = 'delivered', delivered_at = changed_at,
      next_attempt_at = changed_at, last_error_code = null,
      lease_token = null, lease_expires_at = null, updated_at = changed_at
    where id = job_row.id;
    return 'delivered';
  end if;

  if p_retryable and job_row.attempt_count < job_row.max_attempts then
    next_status := 'retry_scheduled';
    delay_seconds := least(21600, (30 * power(2, greatest(0, job_row.attempt_count - 1)))::integer);
    update public.event_invitation_delivery_jobs set
      delivery_status = next_status,
      next_attempt_at = changed_at + make_interval(secs => delay_seconds),
      last_error_code = safe_error, lease_token = null, lease_expires_at = null,
      updated_at = changed_at
    where id = job_row.id;
  else
    next_status := 'failed';
    update public.event_invitation_delivery_jobs set
      delivery_status = next_status, next_attempt_at = changed_at,
      last_error_code = safe_error, lease_token = null, lease_expires_at = null,
      updated_at = changed_at
    where id = job_row.id;
  end if;
  return next_status;
end;
$$;

create or replace function public.worker_claim_event_invitation_backfills(
  p_lease_token uuid,
  p_limit integer default 2,
  p_lease_seconds integer default 45,
  p_now timestamptz default null
) returns table (job_id uuid, event_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare changed_at timestamptz := coalesce(p_now, now());
begin
  if p_lease_token is null or p_limit not between 1 and 10 or p_lease_seconds not between 15 and 240
  then raise exception 'invalid_backfill_claim' using errcode = '22023'; end if;
  return query
  with claimed as (
    update public.event_invitation_backfill_jobs job
       set backfill_status = 'processing', lease_token = p_lease_token,
           lease_expires_at = changed_at + make_interval(secs => p_lease_seconds),
           last_error_code = null, updated_at = changed_at
     where job.id in (
       select candidate.id from public.event_invitation_backfill_jobs candidate
        where candidate.backfill_status = 'pending'
           or (candidate.backfill_status = 'processing' and candidate.lease_expires_at <= changed_at)
        order by candidate.updated_at, candidate.created_at, candidate.id
        for update skip locked
        limit p_limit
     )
    returning job.id, job.event_id
  )
  select claimed.id, claimed.event_id from claimed;
end;
$$;

create or replace function public.worker_process_event_invitation_backfill_page(
  p_job_id uuid,
  p_lease_token uuid,
  p_page_size integer default 200,
  p_now timestamptz default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  changed_at timestamptz := coalesce(p_now, now());
  job_row public.event_invitation_backfill_jobs%rowtype;
  event_row public.club_events%rowtype;
  target_ids uuid[];
  target_count integer := 0;
  added_count integer := 0;
  queued_count integer := 0;
  next_cursor uuid;
  has_more boolean := false;
begin
  if p_page_size not between 1 and 500
  then raise exception 'invalid_backfill_page' using errcode = '22023'; end if;
  select * into job_row from public.event_invitation_backfill_jobs
   where id = p_job_id and backfill_status = 'processing'
     and lease_token = p_lease_token and lease_expires_at > changed_at
   for update;
  if not found then raise exception 'backfill_lease_lost' using errcode = '40001'; end if;
  select * into event_row from public.club_events where id = job_row.event_id for share;
  if not public.is_automatic_workshop_invitation_eligible(event_row.event_type, event_row.status) then
    update public.event_invitation_backfill_jobs set
      backfill_status = 'failed', last_error_code = 'event_ineligible',
      lease_token = null, lease_expires_at = null, updated_at = changed_at
    where id = job_row.id;
    return jsonb_build_object('processed', 0, 'added', 0, 'queued', 0, 'completed', true);
  end if;

  select coalesce(array_agg(candidate.id order by candidate.id), '{}') into target_ids
    from (
      select application.id from public.membership_applications application
       where application.join_type in ('member', 'staff')
         and (job_row.cursor_application_id is null or application.id > job_row.cursor_application_id)
       order by application.id
       limit p_page_size
    ) candidate;
  target_count := coalesce(array_length(target_ids, 1), 0);

  if target_count > 0 then
    insert into public.club_event_invitations
      (event_id, membership_application_id, status, invited_at, invited_by_admin_user_id, created_at)
    select event_row.id, application_id, 'invited', changed_at, null, changed_at
      from unnest(target_ids) as selected(application_id)
    on conflict (event_id, membership_application_id) do nothing;
    get diagnostics added_count = row_count;

    -- Existing invitations (for example from a concurrent admin action) also
    -- receive a job. The unique constraint keeps this idempotent.
    insert into public.event_invitation_delivery_jobs
      (event_id, invitation_id, membership_application_id, created_at, updated_at)
    select invitation.event_id, invitation.id, invitation.membership_application_id, changed_at, changed_at
      from public.club_event_invitations invitation
     where invitation.event_id = event_row.id
       and invitation.membership_application_id = any(target_ids)
       and invitation.status in ('invited', 'registered')
    on conflict (invitation_id, delivery_purpose) do nothing;
    get diagnostics queued_count = row_count;

    next_cursor := target_ids[target_count];
    select exists (
      select 1 from public.membership_applications application
       where application.join_type in ('member', 'staff') and application.id > next_cursor
    ) into has_more;
  end if;

  update public.event_invitation_backfill_jobs set
    backfill_status = case when has_more then 'pending' else 'completed' end,
    cursor_application_id = coalesce(next_cursor, cursor_application_id),
    lease_token = null, lease_expires_at = null, last_error_code = null,
    updated_at = changed_at
  where id = job_row.id;

  return jsonb_build_object(
    'processed', target_count, 'added', added_count, 'queued', queued_count,
    'completed', not has_more
  );
end;
$$;

create or replace function public.worker_release_event_invitation_backfill(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text default 'backfill_failed',
  p_now timestamptz default null
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare changed_at timestamptz := coalesce(p_now, now()); safe_error text;
begin
  safe_error := lower(coalesce(p_error_code, 'backfill_failed'));
  if safe_error !~ '^[a-z0-9_]{1,64}$' then safe_error := 'backfill_failed'; end if;
  update public.event_invitation_backfill_jobs set
    backfill_status = 'pending', lease_token = null, lease_expires_at = null,
    last_error_code = safe_error, updated_at = changed_at
  where id = p_job_id and backfill_status = 'processing' and lease_token = p_lease_token;
  return found;
end;
$$;

-- Explicit historical queueing and manual retry remain super-admin-only and
-- independent from CSV link_exported_at.
create or replace function public.admin_queue_existing_event_invitation_deliveries(
  p_event_id uuid,
  p_admin_user_id uuid,
  p_now timestamptz default null
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare administrator_role text; event_row public.club_events%rowtype; changed_at timestamptz := coalesce(p_now, now()); queued integer;
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;
  select * into event_row from public.club_events where id = p_event_id for share;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if not public.is_automatic_workshop_invitation_eligible(event_row.event_type, event_row.status)
  then raise exception 'event_not_available' using errcode = '22023'; end if;

  insert into public.event_invitation_delivery_jobs
    (event_id, invitation_id, membership_application_id, created_at, updated_at)
  select invitation.event_id, invitation.id, invitation.membership_application_id, changed_at, changed_at
    from public.club_event_invitations invitation
   where invitation.event_id = p_event_id
     and invitation.status in ('invited', 'registered')
     and invitation.link_revoked_at is null
     and (invitation.invite_token_hash is null or invitation.invite_expires_at > changed_at)
  on conflict (invitation_id, delivery_purpose) do nothing;
  get diagnostics queued = row_count;

  insert into public.admin_audit_events
    (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id, 'workshop_invitation_deliveries_queued', 'sensitive',
    jsonb_build_object('queued', queued), changed_at);
  return queued;
end;
$$;

create or replace function public.admin_retry_event_invitation_deliveries(
  p_event_id uuid,
  p_admin_user_id uuid,
  p_now timestamptz default null
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare administrator_role text; changed_at timestamptz := coalesce(p_now, now()); retried integer;
begin
  select role into administrator_role from public.admin_users where id = p_admin_user_id and is_active = true;
  if administrator_role <> 'super_admin' then raise exception 'administrator_not_authorized' using errcode = '42501'; end if;

  update public.event_invitation_delivery_jobs job set
    delivery_status = 'pending', attempt_count = 0, next_attempt_at = changed_at,
    last_attempt_at = null, delivered_at = null, last_error_code = null,
    lease_token = null, lease_expires_at = null, updated_at = changed_at
  from public.club_event_invitations invitation, public.club_events event
  where job.event_id = p_event_id and job.delivery_status = 'failed'
    and invitation.id = job.invitation_id and event.id = job.event_id
    and public.is_automatic_workshop_invitation_eligible(event.event_type, event.status)
    and invitation.status in ('invited', 'registered')
    and invitation.link_revoked_at is null
    and (invitation.invite_token_hash is null or invitation.invite_expires_at > changed_at);
  get diagnostics retried = row_count;

  insert into public.admin_audit_events
    (admin_user_id, object_type, object_id, action, sensitivity, metadata, created_at)
  values (p_admin_user_id, 'club_event', p_event_id, 'workshop_invitation_deliveries_retried', 'sensitive',
    jsonb_build_object('retried', retried), changed_at);
  return retried;
end;
$$;

alter table public.event_invitation_delivery_jobs enable row level security;
alter table public.event_invitation_backfill_jobs enable row level security;

revoke all on table public.event_invitation_delivery_jobs, public.event_invitation_backfill_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.event_invitation_delivery_jobs, public.event_invitation_backfill_jobs to service_role;

revoke all on function public.is_automatic_workshop_invitation_eligible(text,text) from public, anon, authenticated;
revoke all on function public.worker_claim_event_invitation_deliveries(uuid,integer,integer,timestamptz) from public, anon, authenticated;
revoke all on function public.worker_ensure_event_invitation_link(uuid,uuid,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.worker_finish_event_invitation_delivery(uuid,uuid,boolean,text,boolean,timestamptz) from public, anon, authenticated;
revoke all on function public.worker_claim_event_invitation_backfills(uuid,integer,integer,timestamptz) from public, anon, authenticated;
revoke all on function public.worker_process_event_invitation_backfill_page(uuid,uuid,integer,timestamptz) from public, anon, authenticated;
revoke all on function public.worker_release_event_invitation_backfill(uuid,uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_queue_existing_event_invitation_deliveries(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.admin_retry_event_invitation_deliveries(uuid,uuid,timestamptz) from public, anon, authenticated;

grant execute on function public.is_automatic_workshop_invitation_eligible(text,text) to service_role;
grant execute on function public.worker_claim_event_invitation_deliveries(uuid,integer,integer,timestamptz) to service_role;
grant execute on function public.worker_ensure_event_invitation_link(uuid,uuid,text,timestamptz,timestamptz) to service_role;
grant execute on function public.worker_finish_event_invitation_delivery(uuid,uuid,boolean,text,boolean,timestamptz) to service_role;
grant execute on function public.worker_claim_event_invitation_backfills(uuid,integer,integer,timestamptz) to service_role;
grant execute on function public.worker_process_event_invitation_backfill_page(uuid,uuid,integer,timestamptz) to service_role;
grant execute on function public.worker_release_event_invitation_backfill(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.admin_queue_existing_event_invitation_deliveries(uuid,uuid,timestamptz) to service_role;
grant execute on function public.admin_retry_event_invitation_deliveries(uuid,uuid,timestamptz) to service_role;

comment on table public.event_invitation_delivery_jobs is
  'Durable at-least-once n8n invitation delivery outbox. Stores references and delivery state only; never a raw private token or URL.';
comment on table public.event_invitation_backfill_jobs is
  'Paginated durable work for inviting existing member/staff applications when an event becomes automatically eligible.';
comment on column public.event_invitation_delivery_jobs.last_error_code is
  'Bounded non-sensitive category only. Never store response bodies, emails, URLs, tokens, or credentials.';

commit;
