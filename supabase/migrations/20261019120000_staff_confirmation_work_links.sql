-- Optional "Portfolio or links to your work" for Staff motivation submissions.
-- Forward-only: apply after 20261018120000_fix_stable_staff_link_audit_and_regeneration.sql.
--
-- Links belong to one immutable submission version, never to the confirmation:
-- a revision creates a new version with its own motivation and its own links,
-- written in the same transaction. The API validates and canonicalises every
-- URL (absolute http/https only, no embedded credentials); the database
-- re-checks the bounds and the scheme prefix. Nothing ever fetches these URLs.
--
-- Backward compatible: existing rows get an empty list, and the original
-- three-argument RPC keeps working for code deployed before this migration.

begin;

-- Element rules shared by the column constraint and the submission RPC.
create function public.membership_staff_work_links_valid(p_links text[])
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select p_links is not null
     and cardinality(p_links) <= 5
     and coalesce(array_ndims(p_links), 1) = 1
     and not exists (
       select 1
         from unnest(p_links) as link (value)
        where link.value is null
           or char_length(link.value) not between 1 and 500
           or link.value !~ '^https?://[^[:space:][:cntrl:]]+$'
     );
$$;

alter table public.membership_staff_confirmation_submissions
  add column work_links text[] not null default '{}';

alter table public.membership_staff_confirmation_submissions
  add constraint membership_staff_confirmation_submissions_work_links_count_check
    check (cardinality(work_links) <= 5),
  add constraint membership_staff_confirmation_submissions_work_links_check
    check (public.membership_staff_work_links_valid(work_links));

-- Same lock order, lifecycle checks and idempotency as staff_submit_confirmation
-- in 20261017120000_stable_staff_confirmation_links.sql; the only addition is
-- the work-link list stored on the new version row.
create function public.staff_submit_confirmation_v2(
  p_token_hash text,
  p_motivation text,
  p_work_links text[],
  p_now timestamptz
)
returns table (
  application_id uuid,
  application_reference text,
  confirmation_id uuid,
  submission_id uuid,
  submission_version integer,
  submitted_at timestamptz,
  already_submitted boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  token_identity record;
  token_row public.membership_staff_confirmation_tokens%rowtype;
  confirmation_row public.membership_staff_confirmations%rowtype;
  application_row public.membership_applications%rowtype;
  existing_submission public.membership_staff_confirmation_submissions%rowtype;
  next_submission public.membership_staff_confirmation_submissions%rowtype;
  clean_motivation text := btrim(replace(replace(coalesce(p_motivation, ''), chr(13) || chr(10), chr(10)), chr(13), chr(10)));
  clean_work_links text[] := coalesce(p_work_links, '{}'::text[]);
  changed_at timestamptz := coalesce(p_now, now());
  next_version integer;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'staff_confirmation_invalid_token' using errcode = '28000';
  end if;
  if char_length(clean_motivation) not between 150 and 2000 then
    raise exception 'staff_confirmation_invalid_motivation' using errcode = '22023';
  end if;
  if not public.membership_staff_work_links_valid(clean_work_links) then
    raise exception 'staff_confirmation_invalid_work_links' using errcode = '22023';
  end if;

  -- Preliminary lookup discovers the application. Authoritative checks happen
  -- again after acquiring application -> credential -> confirmation locks,
  -- matching every administrative mutation and the application-close trigger.
  select token.id, token.confirmation_id, confirmation.application_id
    into token_identity
    from public.membership_staff_confirmation_tokens token
    join public.membership_staff_confirmations confirmation on confirmation.id = token.confirmation_id
   where token.token_hash = p_token_hash;
  if not found then
    raise exception 'staff_confirmation_invalid_token' using errcode = '28000';
  end if;

  select * into application_row
    from public.membership_applications
   where id = token_identity.application_id
   for update;

  select * into token_row
    from public.membership_staff_confirmation_tokens
   where id = token_identity.id and token_hash = p_token_hash
   for update;
  if not found or token_row.revoked_at is not null then
    raise exception 'staff_confirmation_invalid_token' using errcode = '28000';
  end if;
  if token_row.blocked_at is not null then
    raise exception 'staff_confirmation_unavailable' using errcode = '28000';
  end if;

  select * into confirmation_row
    from public.membership_staff_confirmations
   where id = token_row.confirmation_id
   for update;
  if not found
     or application_row.id is null
     or application_row.join_type <> 'staff'
     or application_row.status in ('declined', 'archived') then
    raise exception 'staff_confirmation_inactive' using errcode = '28000';
  end if;

  if confirmation_row.status in ('submitted', 'confirmed') then
    select * into existing_submission
      from public.membership_staff_confirmation_submissions submission
     where submission.confirmation_id = confirmation_row.id
     order by submission.version desc
     limit 1;
    if not found then
      raise exception 'staff_confirmation_inactive' using errcode = '28000';
    end if;
    return query select application_row.id, application_row.reference, confirmation_row.id,
      existing_submission.id, existing_submission.version, existing_submission.submitted_at, true;
    return;
  end if;

  if confirmation_row.status not in ('invited', 'revision_requested') then
    raise exception 'staff_confirmation_inactive' using errcode = '28000';
  end if;
  if confirmation_row.expires_at <= changed_at
     or (token_row.link_nonce is null and token_row.expires_at <= changed_at) then
    raise exception 'staff_confirmation_expired' using errcode = '28000';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
    from public.membership_staff_confirmation_submissions submission
   where submission.confirmation_id = confirmation_row.id;

  insert into public.membership_staff_confirmation_submissions (
    confirmation_id, token_id, version, motivation, work_links, submitted_at
  ) values (
    confirmation_row.id, token_row.id, next_version, clean_motivation, clean_work_links, changed_at
  ) returning * into next_submission;

  update public.membership_staff_confirmation_tokens
     set first_used_at = coalesce(first_used_at, changed_at),
         last_used_at = changed_at,
         updated_at = changed_at
   where id = token_row.id;

  update public.membership_staff_confirmations
     set status = 'submitted',
         submitted_at = changed_at,
         revision_message = null,
         updated_at = changed_at
   where id = confirmation_row.id;

  return query select application_row.id, application_row.reference,
    confirmation_row.id, next_submission.id, next_submission.version,
    next_submission.submitted_at, false;
end;
$$;

-- The original RPC stays callable for code deployed before this migration. It
-- now delegates to v2 without links, so the lifecycle exists in one place.
create or replace function public.staff_submit_confirmation(
  p_token_hash text,
  p_motivation text,
  p_now timestamptz
)
returns table (
  application_id uuid,
  application_reference text,
  confirmation_id uuid,
  submission_id uuid,
  submission_version integer,
  submitted_at timestamptz,
  already_submitted boolean
)
language sql
security invoker
set search_path = public
as $$
  select * from public.staff_submit_confirmation_v2(p_token_hash, p_motivation, '{}'::text[], p_now);
$$;

revoke all on function public.membership_staff_work_links_valid(text[]) from public, anon, authenticated;
grant execute on function public.membership_staff_work_links_valid(text[]) to service_role;
revoke all on function public.staff_submit_confirmation_v2(text, text, text[], timestamptz) from public, anon, authenticated;
grant execute on function public.staff_submit_confirmation_v2(text, text, text[], timestamptz) to service_role;
revoke all on function public.staff_submit_confirmation(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.staff_submit_confirmation(text, text, timestamptz) to service_role;

comment on table public.membership_staff_confirmation_submissions is
  'Immutable versioned Staff motivation letters with their optional work links. Stored and rendered as plain text.';
comment on column public.membership_staff_confirmation_submissions.work_links is
  'Optional public work/portfolio URLs (0-5) submitted with this version. Canonical absolute http(s) URLs validated by the API; never fetched by the server.';
comment on function public.staff_submit_confirmation_v2(text, text, text[], timestamptz) is
  'Atomically records one Staff motivation version and its work links through a stable private credential.';

commit;
