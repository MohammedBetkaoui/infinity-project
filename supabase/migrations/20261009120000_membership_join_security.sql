-- Join form security hardening (form v4).
--
-- Expand-only and safe to run more than once. Apply it AFTER
-- 20261008120000_membership_faculty_department.sql and BEFORE deploying the
-- matching api/join.js. The API that is live today keeps working once it is
-- applied: it never writes the new column, and it already refuses duplicate
-- contacts.
--
--   1. phone_normalized: the canonical phone number, computed by the database
--      itself (same rule as api/_lib/membership-phone.js).
--   2. One application per e-mail address and per phone number, enforced by
--      unique indexes. They are the final authority against two identical
--      submissions racing past the API's early lookup; the API only turns
--      their 23505 into a neutral answer.
--   3. The existing access model, re-asserted: RLS on, no anon/authenticated
--      access, service_role only. No policy is created.
--
-- Existing duplicates are never deleted or merged. If any exist, the
-- migration stops with an explicit error and changes nothing; see
-- docs/join-security.md ("Resolving existing duplicates").

begin;

-- 1. The only SQL copy of the phone rule. Mirrors normalizeMembershipPhone()
--    exactly (tests/join-security.test.mjs keeps the two aligned): ASCII
--    digits only; 00213 / 213 country prefixes removed; a 9-digit national
--    number gets its leading 0 back. Null when no digit remains.
create or replace function public.membership_phone_key(p_phone text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select nullif(case when length(local_digits) = 9 then '0' || local_digits else local_digits end, '')
  from (
    select case
      when digits like '00213%' then substr(digits, 6)
      when digits like '213%' and length(digits) > 9 then substr(digits, 4)
      else digits
    end as local_digits
    from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as digits) as cleaned
  ) as stripped;
$$;

-- Generated, so every row has it — rows written by the current API, rows
-- written before this migration — and no client can ever set it.
alter table public.membership_applications
  add column if not exists phone_normalized text
    generated always as (public.membership_phone_key(phone)) stored;

comment on column public.membership_applications.phone_normalized is
  'Canonical phone number computed from phone (public.membership_phone_key). Carries the one-application-per-phone unique index.';

-- 2. Stop before any unique index could fail half-way on historical data.
do $$
declare
  duplicated_emails integer;
  duplicated_phones integer;
begin
  select count(*) into duplicated_emails
    from (
      select 1
        from public.membership_applications
       where email is not null
       group by lower(btrim(email))
      having count(*) > 1
    ) as email_groups;

  select count(*) into duplicated_phones
    from (
      select 1
        from public.membership_applications
       where phone_normalized is not null
       group by phone_normalized
      having count(*) > 1
    ) as phone_groups;

  if duplicated_emails > 0 or duplicated_phones > 0 then
    raise exception 'membership_applications contains % duplicated e-mail group(s) and % duplicated phone group(s); nothing was changed.',
      duplicated_emails, duplicated_phones
      using errcode = '23505',
            hint = 'List them with the read-only queries in docs/join-security.md, resolve them by hand, then run this migration again. No application is deleted or merged automatically.';
  end if;
end $$;

create unique index if not exists membership_applications_email_unique_idx
  on public.membership_applications (lower(btrim(email)));

create unique index if not exists membership_applications_phone_unique_idx
  on public.membership_applications (phone_normalized)
  where phone_normalized is not null;

-- Serves the API's early `email = $1` lookup (it sends the address already
-- trimmed and lowercased).
create index if not exists membership_applications_email_lookup_idx
  on public.membership_applications (email);

-- 3. Access model, unchanged and re-asserted.
alter table public.membership_applications enable row level security;
revoke all on table public.membership_applications from anon, authenticated;
grant select, insert, update on table public.membership_applications to service_role;

revoke all on function public.membership_phone_key(text) from public, anon, authenticated;
grant execute on function public.membership_phone_key(text) to service_role;

-- Table privileges are revoked, so a policy for these roles grants nothing
-- today. One left over from before the server API is still worth removing.
do $$
begin
  if exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'membership_applications'
       and roles && array['public', 'anon', 'authenticated']::name[]
  ) then
    raise warning 'public.membership_applications still has a policy for public/anon/authenticated. It is inert while table privileges stay revoked; review and drop it (docs/join-security.md).';
  end if;
end $$;

commit;
