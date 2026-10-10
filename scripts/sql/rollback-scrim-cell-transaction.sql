-- Optional database rollback AFTER reverting the app or selecting legacy mode.
-- Keep the additive column/functions and all saved cells/history. Restore the
-- former trigger, so every portal write runs the original atomic library sync.
begin;
set local lock_timeout = '5s';
create or replace function public.library_state_changed() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform public.library_sync(new.value,old.value,new.revision);
  return new;
end;
$$;
commit;
