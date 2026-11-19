-- Fix: deleting an auth user failed with "permission denied for function
-- sync_reminders". Cascaded child deletes / ON DELETE SET NULL updates fired the
-- reminder trigger under the Auth service role. Nested trigger events never
-- need their own sync: the top-level row's trigger (which always fires after
-- the cascades, e.g. loans_schedule → loans_sync_reminders) re-syncs once, and
-- when the whole account is removed there is nothing left to sync.
create or replace function public.trg_sync_reminders()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Account deletion runs as the Auth service role, which has no access to app
  -- functions or tables; everything owned is being removed, so skip quietly.
  if not has_function_privilege('public.sync_reminders(uuid)', 'execute') then
    return null;
  end if;
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform public.sync_reminders(old.owner_id);
  else
    perform public.sync_reminders(new.owner_id);
    if tg_op = 'UPDATE' and old.owner_id is distinct from new.owner_id then
      perform public.sync_reminders(old.owner_id);
    end if;
  end if;
  return null;
end $$;
