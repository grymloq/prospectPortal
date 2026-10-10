begin;
-- Service-only transport validation. Both the legacy and dedicated transaction
-- execute normally, then roll back ALL their writes before returning success.
-- Never use this function for actual user saves.
create function public.scrim_score_probe(actor_id text, expected_revision bigint,
  scrim_id text, expected_scrim_revision bigint, team_id text, cell_changes jsonb,
  legacy_value jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare accepted boolean;
begin
  begin
    if legacy_value is null then
      accepted:=public.scrim_score_commit(actor_id,expected_revision,scrim_id,expected_scrim_revision,team_id,cell_changes);
    else
      accepted:=public.portal_commit(expected_revision,legacy_value);
    end if;
    if not accepted then return false; end if;
    raise exception using errcode='Z0001',message='Intentional transport validation rollback';
  exception when sqlstate 'Z0001' then return accepted; end;
end;
$$;
revoke all on function public.scrim_score_probe(text,bigint,text,bigint,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.scrim_score_probe(text,bigint,text,bigint,text,jsonb,jsonb) to service_role;
commit;
