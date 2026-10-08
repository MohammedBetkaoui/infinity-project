begin;

-- Safe retention primitive for a trusted scheduled job or an explicit
-- operator run. No scheduler is introduced here. Recipient rows are removed
-- by the notification FK cascade.
create or replace function public.admin_prune_notifications()
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  delete from public.admin_notifications
   where created_at < now() - interval '90 days'
      or (expires_at is not null and expires_at <= now());
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.admin_prune_notifications()
  from public, anon, authenticated;
grant execute on function public.admin_prune_notifications()
  to service_role;

commit;
