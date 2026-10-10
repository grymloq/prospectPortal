begin;
set local lock_timeout = '5s';

-- A one-revision marker, set only by the service-only cell transaction. Ordinary
-- portal_commit increments revision without this marker, so always runs sync.
alter table public.portal_state add column scrim_score_revision bigint;

create function public.scrim_score_member(value jsonb, actor_id text) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare actor jsonb;
begin
  select item into actor from jsonb_array_elements(value->'users') records(item)
    where item->>'id'=actor_id;
  if actor is null then raise exception 'Sign in to continue.'; end if;
  if coalesce(actor->>'removedAt','')<>'' or coalesce(actor->>'accountDeletedAt','')<>'' then
    raise exception 'Your portal access has been removed.';
  end if;
  if not coalesce((actor->>'confirmedMember')::boolean,false) then
    raise exception 'Your account is awaiting confirmation by a team administrator.';
  end if;
  return jsonb_strip_nulls(jsonb_build_object('id',actor->'id','name',actor->'name',
    'role',actor->'role','confirmedMember',actor->'confirmedMember'));
end;
$$;

create function public.scrim_score_team(scrim jsonb, team_id text, actor_id text) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare team jsonb;
begin
  if scrim is null then raise exception 'Scrim not found.'; end if;
  if coalesce((scrim->>'cancelled')::boolean,false) then raise exception 'This scrim has been cancelled.'; end if;
  select item into team from jsonb_array_elements(scrim->'teams') records(item) where item->>'id'=team_id;
  if team is null then raise exception 'Team not found.'; end if;
  if team->>'captainId' is distinct from actor_id and not exists(
    select 1 from jsonb_array_elements(coalesce(team->'additionalCaptains','[]') ||
      coalesce(team->'coaches','[]') || coalesce(team->'entries','[]')) staff(item)
    where item->>'userId'=actor_id
  ) then raise exception 'Only team members can change their team''s matrix.'; end if;
  return team;
end;
$$;

-- Configuration identity and shared seed scores need no roster text/composition,
-- profiles, reflections, discussions or evaluations.
create function public.scrim_score_army(army jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select army - 'composition' - 'summary' - 'listText';
$$;

create function public.scrim_score_context(actor_id text, scrim_id text, team_id text) returns json
language plpgsql stable security invoker set search_path='' as $$
declare v jsonb; r bigint; actor jsonb; scrim jsonb;
begin
  -- Materialize once instead of repeatedly detoasting the large workspace.
  select value || '{}'::jsonb,revision into v,r from public.portal_state where id=1;
  actor:=public.scrim_score_member(v,actor_id);
  select item into scrim from jsonb_array_elements(coalesce(v->'scrims','[]')) records(item) where item->>'id'=scrim_id;
  perform public.scrim_score_team(scrim,team_id,actor_id);
  return json_build_object('revision',r,'actor',actor,'state',json_build_object(
    'users',(select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',u->'id','removedAt',u->'removedAt'))),'[]') from jsonb_array_elements(v->'users') users(u)),
    'scrims',jsonb_build_array(scrim),
    'games',(select coalesce(jsonb_agg(jsonb_build_object('id',g->'id','userId',g->'userId','patchId',g->'patchId',
      'own',public.scrim_score_army(g->'own'),'enemy',public.scrim_score_army(g->'enemy'),'score',g->'score',
      'layout',g->'layout','scrimPairingId',g->'scrimPairingId')),'[]') from jsonb_array_elements(coalesce(v->'games','[]')) games(g)
      where (actor->>'role'='admin' or g->>'userId'=actor_id) and g->>'patchId'=scrim->>'patchId'),
    'savedArmies',(select coalesce(jsonb_agg((a-'army') || jsonb_build_object('army',public.scrim_score_army(a->'army'))),'[]')
      from jsonb_array_elements(coalesce(v->'savedArmies','[]')) armies(a)
      where coalesce((a->>'shared')::boolean,false) and a->>'patchId'=scrim->>'patchId'
      and exists(select 1 from jsonb_array_elements(v->'users') users(u) where u->>'id'=a->>'userId' and coalesce(u->>'removedAt','')='')),
    'matrixLists',(select coalesce(jsonb_agg((a-'army') || jsonb_build_object('army',public.scrim_score_army(a->'army'))),'[]')
      from jsonb_array_elements(coalesce(v->'matrixLists','[]')) armies(a) where a->>'patchId'=scrim->>'patchId'),
    'matrixListHistory',(select coalesce(jsonb_agg((a-'army') || jsonb_build_object('army',public.scrim_score_army(a->'army'))),'[]')
      from jsonb_array_elements(coalesce(v->'matrixListHistory','[]')) armies(a) where a->>'patchId'=scrim->>'patchId'),
    'manualEstimates',(select coalesce(jsonb_agg(a),'[]') from jsonb_array_elements(coalesce(v->'manualEstimates','[]')) estimates(a) where a->>'patchId'=scrim->>'patchId'),
    'events','[]'::json,'audit','[]'::json));
end;
$$;

-- Server computes cells with the existing domain code from the exact revision
-- above. A global CAS invalidates that computation on ANY concurrent permission,
-- source-list, shared-estimate or scrim change. Reauthorization also happens here.
create function public.scrim_score_commit(actor_id text, expected_revision bigint,
  scrim_id text, expected_scrim_revision bigint, team_id text, cell_changes jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v jsonb; r bigint; actor jsonb; scrim jsonb; si integer; ti integer;
  ci integer; change jsonb; cell jsonb; cells jsonb; next_scrim jsonb;
begin
  select value || '{}'::jsonb,revision into v,r from public.portal_state where id=1 for update;
  if r is distinct from expected_revision then return false; end if;
  actor:=public.scrim_score_member(v,actor_id);
  select item,(n-1)::integer into scrim,si from jsonb_array_elements(coalesce(v->'scrims','[]')) with ordinality records(item,n) where item->>'id'=scrim_id;
  perform public.scrim_score_team(scrim,team_id,actor_id);
  if (scrim->>'revision')::bigint is distinct from expected_scrim_revision then
    raise exception 'This scrim changed. Refresh the workspace and review the latest version before saving.';
  end if;
  if jsonb_typeof(cell_changes) is distinct from 'array' or jsonb_array_length(cell_changes)=0 then
    raise exception 'No cell changes supplied.';
  end if;
  next_scrim:=scrim;
  for change in select item from jsonb_array_elements(cell_changes) records(item) loop
    cell:=change->'cell';
    select (n-1)::integer into ti from jsonb_array_elements(next_scrim->'teams') with ordinality teams(t,n) where t->>'id'=change->>'teamId';
    if ti is null or coalesce(cell->>'ownId','')='' or coalesce(cell->>'enemyId','')='' then
      raise exception 'Invalid cell changes.';
    end if;
    cells:=next_scrim->'teams'->ti->'estimates';
    select (n-1)::integer into ci from jsonb_array_elements(cells) with ordinality estimates(e,n)
      where e->>'ownId'=cell->>'ownId' and e->>'enemyId'=cell->>'enemyId';
    if ci is null then cells:=cells || jsonb_build_array(cell);
    else cells:=jsonb_set(cells,array[ci::text],cell); end if;
    next_scrim:=jsonb_set(next_scrim,array['teams',ti::text,'estimates'],cells);
  end loop;
  next_scrim:=jsonb_set(next_scrim,'{revision}',to_jsonb(expected_scrim_revision+1));
  update public.portal_state set value=jsonb_set(v,array['scrims',si::text],next_scrim),
    revision=r+1,scrim_score_revision=r+1,updated_at=now() where id=1;
  return true;
end;
$$;

create or replace function public.library_state_changed() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.scrim_score_revision=new.revision and new.scrim_score_revision is distinct from old.scrim_score_revision then
    -- The dedicated RPC changes only planning cells/history and scrim revision.
    -- None of those are library facts; its mirror is already current.
    update public.library_meta set revision=new.revision where id=1;
  else
    perform public.library_sync(new.value,old.value,new.revision);
  end if;
  return new;
end;
$$;

revoke all on function public.scrim_score_member(jsonb,text), public.scrim_score_team(jsonb,text,text),
  public.scrim_score_army(jsonb), public.scrim_score_context(text,text,text),
  public.scrim_score_commit(text,bigint,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.scrim_score_member(jsonb,text), public.scrim_score_team(jsonb,text,text),
  public.scrim_score_army(jsonb), public.scrim_score_context(text,text,text),
  public.scrim_score_commit(text,bigint,text,bigint,text,jsonb) to service_role;
commit;
