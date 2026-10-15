-- Use one campaign-wide deadline for every existing Staff candidate private link.
-- The instant below is 1 November 2026 at 23:59:59.999 in Africa/Algiers.

begin;

update public.membership_staff_confirmations
   set expires_at = timestamptz '2026-11-01 23:59:59.999+01',
       updated_at = now()
 where expires_at is distinct from timestamptz '2026-11-01 23:59:59.999+01';

update public.membership_staff_confirmation_tokens
   set expires_at = timestamptz '2026-11-01 23:59:59.999+01',
       updated_at = now()
 where expires_at is distinct from timestamptz '2026-11-01 23:59:59.999+01';

commit;
