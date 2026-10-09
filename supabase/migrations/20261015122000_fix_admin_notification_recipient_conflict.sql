-- Fix PL/pgSQL output-column shadowing in the recipient upsert. The function
-- returns a column named notification_id, so an unqualified
-- ON CONFLICT (notification_id, admin_user_id) is ambiguous inside the body.

begin;

create or replace function public.admin_create_notification(
  p_kind text,
  p_source text,
  p_severity text,
  p_entity_type text,
  p_entity_id text,
  p_action_path text,
  p_dedupe_key text,
  p_payload jsonb,
  p_recipient_roles text[],
  p_recipient_user_ids uuid[],
  p_actor_admin_user_id uuid,
  p_created_at timestamptz,
  p_expires_at timestamptz
)
returns table (notification_id uuid, created boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_id uuid;
begin
  if p_recipient_roles is null or exists (
    select 1 from unnest(p_recipient_roles) role_name
     where role_name not in ('super_admin', 'administrator', 'reviewer')
  ) then
    raise exception 'invalid notification recipients' using errcode = '22023';
  end if;

  insert into public.admin_notifications (
    kind, source, severity, entity_type, entity_id, action_path,
    dedupe_key, payload, created_at, expires_at
  ) values (
    p_kind, p_source, p_severity, p_entity_type, p_entity_id, p_action_path,
    p_dedupe_key, coalesce(p_payload, '{}'::jsonb), p_created_at, p_expires_at
  )
  on conflict (dedupe_key) do nothing
  returning id into next_id;

  if next_id is null then
    select id into next_id
      from public.admin_notifications
     where dedupe_key = p_dedupe_key;
    return query select next_id, false;
    return;
  end if;

  insert into public.admin_notification_recipients (
    notification_id, admin_user_id, created_at
  )
  select next_id, administrator.id, p_created_at
    from public.admin_users administrator
    left join public.admin_user_preferences preference
      on preference.admin_user_id = administrator.id
   where administrator.is_active = true
     and (p_actor_admin_user_id is null or administrator.id <> p_actor_admin_user_id)
     and (
       administrator.role = any(p_recipient_roles)
       or (p_recipient_user_ids is not null and administrator.id = any(p_recipient_user_ids))
     )
     and case p_source
       when 'aivex' then coalesce(preference.aivex_notifications_enabled, true)
       when 'join' then coalesce(preference.join_notifications_enabled, true)
       else true
     end
  on conflict on constraint admin_notification_recipients_pkey do nothing;

  return query select next_id, true;
end;
$$;

revoke all on function public.admin_create_notification(
  text, text, text, text, text, text, text, jsonb, text[], uuid[], uuid,
  timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_create_notification(
  text, text, text, text, text, text, text, jsonb, text[], uuid[], uuid,
  timestamptz, timestamptz
) to service_role;

commit;
