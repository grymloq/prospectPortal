-- Transactional library read model. portal_state remains the compatibility write
-- source during this stage, so reverting the application never loses new writes.
begin;
create table public.library_meta (id integer primary key check(id=1), revision bigint not null, default_patch_id text);
alter table public.library_meta enable row level security;
revoke all on public.library_meta from public, anon, authenticated;
grant select, insert, update, delete on public.library_meta to service_role;

create table public.library_members (
  id text primary key, owner_id text, list_id text, patch_id text,
  visible boolean not null, ordinal bigint not null,
  payload jsonb not null check(jsonb_typeof(payload)='object')
);
alter table public.library_members enable row level security;
revoke all on public.library_members from public, anon, authenticated;
grant select, insert, update, delete on public.library_members to service_role;

create table public.library_lists (
  id text primary key, owner_id text, list_id text, patch_id text,
  visible boolean not null, ordinal bigint not null,
  payload jsonb not null check(jsonb_typeof(payload)='object')
);
alter table public.library_lists enable row level security;
revoke all on public.library_lists from public, anon, authenticated;
grant select, insert, update, delete on public.library_lists to service_role;

create table public.library_versions (
  id text primary key, owner_id text, list_id text, patch_id text,
  visible boolean not null, ordinal bigint not null,
  payload jsonb not null check(jsonb_typeof(payload)='object')
);
alter table public.library_versions enable row level security;
revoke all on public.library_versions from public, anon, authenticated;
grant select, insert, update, delete on public.library_versions to service_role;

create table public.library_memberships (
  id text primary key, owner_id text, list_id text, patch_id text,
  visible boolean not null, ordinal bigint not null,
  payload jsonb not null check(jsonb_typeof(payload)='object')
);
alter table public.library_memberships enable row level security;
revoke all on public.library_memberships from public, anon, authenticated;
grant select, insert, update, delete on public.library_memberships to service_role;

create table public.library_matrices (
  id text primary key, owner_id text, list_id text, patch_id text,
  visible boolean not null, ordinal bigint not null,
  payload jsonb not null check(jsonb_typeof(payload)='object')
);
alter table public.library_matrices enable row level security;
revoke all on public.library_matrices from public, anon, authenticated;
grant select, insert, update, delete on public.library_matrices to service_role;

create table public.library_patches (
  id text primary key, owner_id text, list_id text, patch_id text,
  visible boolean not null, ordinal bigint not null,
  payload jsonb not null check(jsonb_typeof(payload)='object')
);
alter table public.library_patches enable row level security;
revoke all on public.library_patches from public, anon, authenticated;
grant select, insert, update, delete on public.library_patches to service_role;

create table public.library_games (
  id text primary key, owner_id text, list_id text, patch_id text,
  visible boolean not null, ordinal bigint not null,
  payload jsonb not null check(jsonb_typeof(payload)='object')
);
alter table public.library_games enable row level security;
revoke all on public.library_games from public, anon, authenticated;
grant select, insert, update, delete on public.library_games to service_role;

create table public.library_scrims (
  id text primary key, owner_id text, list_id text, patch_id text,
  visible boolean not null, ordinal bigint not null,
  payload jsonb not null check(jsonb_typeof(payload)='object')
);
alter table public.library_scrims enable row level security;
revoke all on public.library_scrims from public, anon, authenticated;
grant select, insert, update, delete on public.library_scrims to service_role;

create table public.library_defaults (
  id text primary key, owner_id text, list_id text, patch_id text,
  visible boolean not null, ordinal bigint not null,
  payload jsonb not null check(jsonb_typeof(payload)='object')
);
alter table public.library_defaults enable row level security;
revoke all on public.library_defaults from public, anon, authenticated;
grant select, insert, update, delete on public.library_defaults to service_role;

create table public.library_discussions (
  id text primary key, owner_id text, list_id text, patch_id text,
  visible boolean not null, ordinal bigint not null,
  payload jsonb not null check(jsonb_typeof(payload)='object')
);
alter table public.library_discussions enable row level security;
revoke all on public.library_discussions from public, anon, authenticated;
grant select, insert, update, delete on public.library_discussions to service_role;

create table public.library_imports (
  id text primary key, owner_id text, list_id text, patch_id text,
  visible boolean not null, ordinal bigint not null,
  payload jsonb not null check(jsonb_typeof(payload)='object')
);
alter table public.library_imports enable row level security;
revoke all on public.library_imports from public, anon, authenticated;
grant select, insert, update, delete on public.library_imports to service_role;

create index library_lists_owner on public.library_lists(owner_id, id);
create index library_lists_public on public.library_lists(patch_id, owner_id) where visible;
create index library_versions_list on public.library_versions(list_id, owner_id);
create index library_versions_public on public.library_versions(patch_id, list_id) where visible;
create index library_games_consent on public.library_games(owner_id, patch_id) where visible;
create index library_memberships_version on public.library_memberships(list_id);
create index library_imports_patch on public.library_imports(patch_id);

create function public.library_sync(next_state jsonb, previous_state jsonb, next_revision bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin

  if previous_state is null or next_state->'users' is distinct from previous_state->'users' then
    insert into public.library_members as target (id,owner_id,list_id,patch_id,visible,ordinal,payload)
    select item->>'id', item->>'userId', item->>'listId', item->>'patchId',
      coalesce((item->>'confirmedMember')::boolean,false) and coalesce(item->>'removedAt','')='' and coalesce(item->>'accountDeletedAt','')='', n, jsonb_strip_nulls(jsonb_build_object('id', item->'id', 'name', item->'name', 'role', item->'role', 'confirmedMember', item->'confirmedMember', 'removedAt', item->'removedAt', 'accountDeletedAt', item->'accountDeletedAt'))
    from jsonb_array_elements(coalesce(next_state->'users','[]'::jsonb)) with ordinality records(item,n)
    on conflict(id) do update set owner_id=excluded.owner_id,list_id=excluded.list_id,patch_id=excluded.patch_id,
      visible=excluded.visible,ordinal=excluded.ordinal,payload=excluded.payload
    where (target.owner_id,target.list_id,target.patch_id,target.visible,target.ordinal,target.payload)
      is distinct from (excluded.owner_id,excluded.list_id,excluded.patch_id,excluded.visible,excluded.ordinal,excluded.payload);
    delete from public.library_members where id not in
      (select item->>'id' from jsonb_array_elements(coalesce(next_state->'users','[]'::jsonb)) records(item));
  end if;

  if previous_state is null or next_state->'savedArmies' is distinct from previous_state->'savedArmies' then
    insert into public.library_lists as target (id,owner_id,list_id,patch_id,visible,ordinal,payload)
    select item->>'id', item->>'userId', item->>'listId', item->>'patchId',
      coalesce((item->>'shared')::boolean,false), n, item
    from jsonb_array_elements(coalesce(next_state->'savedArmies','[]'::jsonb)) with ordinality records(item,n)
    on conflict(id) do update set owner_id=excluded.owner_id,list_id=excluded.list_id,patch_id=excluded.patch_id,
      visible=excluded.visible,ordinal=excluded.ordinal,payload=excluded.payload
    where (target.owner_id,target.list_id,target.patch_id,target.visible,target.ordinal,target.payload)
      is distinct from (excluded.owner_id,excluded.list_id,excluded.patch_id,excluded.visible,excluded.ordinal,excluded.payload);
    delete from public.library_lists where id not in
      (select item->>'id' from jsonb_array_elements(coalesce(next_state->'savedArmies','[]'::jsonb)) records(item));
  end if;

  if previous_state is null or next_state->'armyVersions' is distinct from previous_state->'armyVersions' then
    insert into public.library_versions as target (id,owner_id,list_id,patch_id,visible,ordinal,payload)
    select item->>'id', item->>'userId', item->>'listId', item->>'patchId',
      coalesce((item->>'published')::boolean,false), n, item
    from jsonb_array_elements(coalesce(next_state->'armyVersions','[]'::jsonb)) with ordinality records(item,n)
    on conflict(id) do update set owner_id=excluded.owner_id,list_id=excluded.list_id,patch_id=excluded.patch_id,
      visible=excluded.visible,ordinal=excluded.ordinal,payload=excluded.payload
    where (target.owner_id,target.list_id,target.patch_id,target.visible,target.ordinal,target.payload)
      is distinct from (excluded.owner_id,excluded.list_id,excluded.patch_id,excluded.visible,excluded.ordinal,excluded.payload);
    delete from public.library_versions where id not in
      (select item->>'id' from jsonb_array_elements(coalesce(next_state->'armyVersions','[]'::jsonb)) records(item));
  end if;

  if previous_state is null or next_state->'libraryMemberships' is distinct from previous_state->'libraryMemberships' then
    insert into public.library_memberships as target (id,owner_id,list_id,patch_id,visible,ordinal,payload)
    select item->>'id', item->>'userId', item->>'versionId', item->>'patchId',
      true, n, item
    from jsonb_array_elements(coalesce(next_state->'libraryMemberships','[]'::jsonb)) with ordinality records(item,n)
    on conflict(id) do update set owner_id=excluded.owner_id,list_id=excluded.list_id,patch_id=excluded.patch_id,
      visible=excluded.visible,ordinal=excluded.ordinal,payload=excluded.payload
    where (target.owner_id,target.list_id,target.patch_id,target.visible,target.ordinal,target.payload)
      is distinct from (excluded.owner_id,excluded.list_id,excluded.patch_id,excluded.visible,excluded.ordinal,excluded.payload);
    delete from public.library_memberships where id not in
      (select item->>'id' from jsonb_array_elements(coalesce(next_state->'libraryMemberships','[]'::jsonb)) records(item));
  end if;

  if previous_state is null or next_state->'matrixLists' is distinct from previous_state->'matrixLists' then
    insert into public.library_matrices as target (id,owner_id,list_id,patch_id,visible,ordinal,payload)
    select item->>'id', item->>'userId', item->>'listId', item->>'patchId',
      true, n, item
    from jsonb_array_elements(coalesce(next_state->'matrixLists','[]'::jsonb)) with ordinality records(item,n)
    on conflict(id) do update set owner_id=excluded.owner_id,list_id=excluded.list_id,patch_id=excluded.patch_id,
      visible=excluded.visible,ordinal=excluded.ordinal,payload=excluded.payload
    where (target.owner_id,target.list_id,target.patch_id,target.visible,target.ordinal,target.payload)
      is distinct from (excluded.owner_id,excluded.list_id,excluded.patch_id,excluded.visible,excluded.ordinal,excluded.payload);
    delete from public.library_matrices where id not in
      (select item->>'id' from jsonb_array_elements(coalesce(next_state->'matrixLists','[]'::jsonb)) records(item));
  end if;

  if previous_state is null or next_state->'patches' is distinct from previous_state->'patches' then
    insert into public.library_patches as target (id,owner_id,list_id,patch_id,visible,ordinal,payload)
    select item->>'id', item->>'userId', item->>'listId', item->>'patchId',
      true, n, item
    from jsonb_array_elements(coalesce(next_state->'patches','[]'::jsonb)) with ordinality records(item,n)
    on conflict(id) do update set owner_id=excluded.owner_id,list_id=excluded.list_id,patch_id=excluded.patch_id,
      visible=excluded.visible,ordinal=excluded.ordinal,payload=excluded.payload
    where (target.owner_id,target.list_id,target.patch_id,target.visible,target.ordinal,target.payload)
      is distinct from (excluded.owner_id,excluded.list_id,excluded.patch_id,excluded.visible,excluded.ordinal,excluded.payload);
    delete from public.library_patches where id not in
      (select item->>'id' from jsonb_array_elements(coalesce(next_state->'patches','[]'::jsonb)) records(item));
  end if;

  if previous_state is null or next_state->'games' is distinct from previous_state->'games' then
    insert into public.library_games as target (id,owner_id,list_id,patch_id,visible,ordinal,payload)
    select item->>'id', item->>'userId', item->>'listId', item->>'patchId',
      coalesce((item->>'libraryContribution')::boolean,false), n, jsonb_strip_nulls(jsonb_build_object('id', item->'id', 'userId', item->'userId', 'date', item->'date', 'own', item->'own', 'enemy', item->'enemy', 'score', item->'score', 'patchId', item->'patchId', 'ownListVersionId', item->'ownListVersionId', 'enemyListVersionId', item->'enemyListVersionId', 'libraryContribution', item->'libraryContribution', 'canonicalMatchId', item->'canonicalMatchId', 'gameContext', item->'gameContext', 'scrimId', item->'scrimId', 'scrimPairingId', item->'scrimPairingId'))
    from jsonb_array_elements(coalesce(next_state->'games','[]'::jsonb)) with ordinality records(item,n)
    on conflict(id) do update set owner_id=excluded.owner_id,list_id=excluded.list_id,patch_id=excluded.patch_id,
      visible=excluded.visible,ordinal=excluded.ordinal,payload=excluded.payload
    where (target.owner_id,target.list_id,target.patch_id,target.visible,target.ordinal,target.payload)
      is distinct from (excluded.owner_id,excluded.list_id,excluded.patch_id,excluded.visible,excluded.ordinal,excluded.payload);
    delete from public.library_games where id not in
      (select item->>'id' from jsonb_array_elements(coalesce(next_state->'games','[]'::jsonb)) records(item));
  end if;

  if previous_state is null or next_state->'scrims' is distinct from previous_state->'scrims' then
    insert into public.library_scrims as target (id,owner_id,list_id,patch_id,visible,ordinal,payload)
    select item->>'id', item->>'userId', item->>'listId', item->>'patchId',
      true, n, (jsonb_strip_nulls(jsonb_build_object('id', item->'id', 'patchId', item->'patchId', 'cancelled', item->'cancelled', 'submissionDeadline', item->'submissionDeadline', 'teamSize', item->'teamSize')) || jsonb_build_object(
    'teams', (select coalesce(jsonb_agg(jsonb_build_object('id', t->'id', 'finalizedAt', t->'finalizedAt', 'entries',
      (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', e->'id', 'userId', e->'userId', 'army', e->'army', 'savedArmyId', e->'savedArmyId', 'listVersionId', e->'listVersionId')) order by en), '[]'::jsonb)
       from jsonb_array_elements(t->'entries') with ordinality entries(e,en))) order by tn), '[]'::jsonb)
      from jsonb_array_elements(item->'teams') with ordinality teams(t,tn)),
    'pairings', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', p->'id', 'aId', p->'aId', 'bId', p->'bId', 'scoreA', p->'scoreA', 'date', p->'date', 'gameContext', p->'gameContext')) order by pn), '[]'::jsonb)
      from jsonb_array_elements(item->'pairings') with ordinality pairings(p,pn))))
    from jsonb_array_elements(coalesce(next_state->'scrims','[]'::jsonb)) with ordinality records(item,n)
    on conflict(id) do update set owner_id=excluded.owner_id,list_id=excluded.list_id,patch_id=excluded.patch_id,
      visible=excluded.visible,ordinal=excluded.ordinal,payload=excluded.payload
    where (target.owner_id,target.list_id,target.patch_id,target.visible,target.ordinal,target.payload)
      is distinct from (excluded.owner_id,excluded.list_id,excluded.patch_id,excluded.visible,excluded.ordinal,excluded.payload);
    delete from public.library_scrims where id not in
      (select item->>'id' from jsonb_array_elements(coalesce(next_state->'scrims','[]'::jsonb)) records(item));
  end if;

  if previous_state is null or next_state->'libraryDefaults' is distinct from previous_state->'libraryDefaults' then
    insert into public.library_defaults as target (id,owner_id,list_id,patch_id,visible,ordinal,payload)
    select jsonb_build_array(item->>'archetypeId',item->>'patchId')::text, item->>'userId', item->>'listId', item->>'patchId',
      true, n, item
    from jsonb_array_elements(coalesce(next_state->'libraryDefaults','[]'::jsonb)) with ordinality records(item,n)
    on conflict(id) do update set owner_id=excluded.owner_id,list_id=excluded.list_id,patch_id=excluded.patch_id,
      visible=excluded.visible,ordinal=excluded.ordinal,payload=excluded.payload
    where (target.owner_id,target.list_id,target.patch_id,target.visible,target.ordinal,target.payload)
      is distinct from (excluded.owner_id,excluded.list_id,excluded.patch_id,excluded.visible,excluded.ordinal,excluded.payload);
    delete from public.library_defaults where id not in
      (select jsonb_build_array(item->>'archetypeId',item->>'patchId')::text from jsonb_array_elements(coalesce(next_state->'libraryDefaults','[]'::jsonb)) records(item));
  end if;

  if previous_state is null or next_state->'libraryDiscussions' is distinct from previous_state->'libraryDiscussions' then
    insert into public.library_discussions as target (id,owner_id,list_id,patch_id,visible,ordinal,payload)
    select item->>'id', item->>'authorId', item->>'listId', item->>'patchId',
      true, n, item
    from jsonb_array_elements(coalesce(next_state->'libraryDiscussions','[]'::jsonb)) with ordinality records(item,n)
    on conflict(id) do update set owner_id=excluded.owner_id,list_id=excluded.list_id,patch_id=excluded.patch_id,
      visible=excluded.visible,ordinal=excluded.ordinal,payload=excluded.payload
    where (target.owner_id,target.list_id,target.patch_id,target.visible,target.ordinal,target.payload)
      is distinct from (excluded.owner_id,excluded.list_id,excluded.patch_id,excluded.visible,excluded.ordinal,excluded.payload);
    delete from public.library_discussions where id not in
      (select item->>'id' from jsonb_array_elements(coalesce(next_state->'libraryDiscussions','[]'::jsonb)) records(item));
  end if;

  if previous_state is null or next_state->'libraryRosterImports' is distinct from previous_state->'libraryRosterImports' then
    insert into public.library_imports as target (id,owner_id,list_id,patch_id,visible,ordinal,payload)
    select item->>'id', item->>'userId', item->>'listId', item->>'patchId',
      true, n, item
    from jsonb_array_elements(coalesce(next_state->'libraryRosterImports','[]'::jsonb)) with ordinality records(item,n)
    on conflict(id) do update set owner_id=excluded.owner_id,list_id=excluded.list_id,patch_id=excluded.patch_id,
      visible=excluded.visible,ordinal=excluded.ordinal,payload=excluded.payload
    where (target.owner_id,target.list_id,target.patch_id,target.visible,target.ordinal,target.payload)
      is distinct from (excluded.owner_id,excluded.list_id,excluded.patch_id,excluded.visible,excluded.ordinal,excluded.payload);
    delete from public.library_imports where id not in
      (select item->>'id' from jsonb_array_elements(coalesce(next_state->'libraryRosterImports','[]'::jsonb)) records(item));
  end if;

  insert into public.library_meta(id,revision,default_patch_id) values(1,next_revision,next_state->>'defaultPatchId')
  on conflict(id) do update set revision=excluded.revision,default_patch_id=excluded.default_patch_id;
end;
$$;
revoke all on function public.library_sync(jsonb,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.library_sync(jsonb,jsonb,bigint) to service_role;

create function public.library_state_changed() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform public.library_sync(new.value,old.value,new.revision);
  return new;
end;
$$;
revoke all on function public.library_state_changed() from public,anon,authenticated;
grant execute on function public.library_state_changed() to service_role;
create trigger library_state_changed after update of value on public.portal_state
for each row execute function public.library_state_changed();

-- Backfill under the same lock used by portal_commit; no gap with concurrent writes.
lock table public.portal_state in share row exclusive mode;
select public.library_sync(value,null,revision) from public.portal_state where id=1;

create function public.library_read_context(actor_id text) returns json
language plpgsql stable security invoker set search_path='' as $$
declare actor jsonb; result json;
begin
  select payload into actor from public.library_members where id=actor_id;
  if actor is null then return null; end if;
  if coalesce(actor->>'removedAt','')<>'' or coalesce(actor->>'accountDeletedAt','')<>'' then
    raise exception 'Your portal access has been removed.';
  end if;
  if not coalesce((actor->>'confirmedMember')::boolean,false) then
    raise exception 'Your account is awaiting confirmation by a team administrator.';
  end if;
  with active_lists as materialized (
    select l.* from public.library_lists l join public.library_members m on m.id=l.owner_id
    where l.visible and m.visible
  ), public_versions as materialized (
    select v.* from public.library_versions v join active_lists l on l.id=v.list_id and l.owner_id=v.owner_id where v.visible
  ), public_matrices as materialized (
    select x.* from public.library_matrices x join public.library_members m on m.id=x.owner_id where m.visible
  ), contributions as materialized (
    select g.* from public.library_games g join public.library_members m on m.id=g.owner_id where g.visible and m.visible
  )
  select json_build_object(
    'revision', meta.revision, 'actor',actor, 'state',json_build_object(
      'defaultPatchId',meta.default_patch_id,
      'users',(select coalesce(json_agg(payload order by ordinal),'[]'::json) from public.library_members),
      'savedArmies',(select coalesce(json_agg(payload order by ordinal),'[]'::json) from active_lists),
      'armyVersions',(select coalesce(json_agg(payload order by ordinal),'[]'::json) from public_versions),
      'libraryMemberships',(select coalesce(json_agg(x.payload order by x.ordinal),'[]'::json) from public.library_memberships x join public_versions v on v.id=x.list_id),
      'matrixLists',(select coalesce(json_agg(payload order by ordinal),'[]'::json) from public_matrices),
      'games',(select coalesce(json_agg(payload order by ordinal),'[]'::json) from contributions),
      'scrims',(select coalesce(json_agg(s.payload order by s.ordinal),'[]'::json) from public.library_scrims s
        where not coalesce((s.payload->>'cancelled')::boolean,false) and (s.payload->>'submissionDeadline')::timestamptz<=statement_timestamp()
        and not exists(select 1 from jsonb_array_elements(s.payload->'teams') teams(t)
          where coalesce(t->>'finalizedAt','')='' or jsonb_array_length(t->'entries')<>(s.payload->>'teamSize')::integer
          or exists(select 1 from jsonb_array_elements(t->'entries') entries(e) where e->'army' is null or e->'army'='null'::jsonb))
        and exists(select 1 from contributions g where g.payload->>'scrimId'=s.id)),
      'patches',(select coalesce(json_agg(case when exists(
        select 1 from public.library_imports i join public_matrices m on i.payload->>'sourceKey'='matrix:'||m.id
        where i.patch_id=p.id and i.payload->'army'->'composition' is not null
        ) then p.payload else (p.payload-'catalogue') || case when p.payload->'catalogue'->'systemId' is not null
          then jsonb_build_object('catalogue',jsonb_build_object('systemId',p.payload->'catalogue'->'systemId')) else '{}'::jsonb end end order by p.ordinal),'[]'::json) from public.library_patches p),
      'libraryRosterImports',(select coalesce(json_agg(i.payload order by i.ordinal),'[]'::json) from public.library_imports i
        join public_matrices m on i.payload->>'sourceKey'='matrix:'||m.id),
      'libraryDefaults',(select coalesce(json_agg(payload order by ordinal),'[]'::json) from public.library_defaults),
      'libraryDiscussions',(select coalesce(json_agg(payload order by ordinal),'[]'::json) from public.library_discussions),
      'phases','[]'::json,'evaluations','[]'::json,'messages','[]'::json,'goals','[]'::json,'events','[]'::json,'applications','[]'::json,'audit','[]'::json
    )) into result from public.library_meta meta where id=1;
  return result;
end;
$$;
revoke all on function public.library_read_context(text) from public,anon,authenticated;
grant execute on function public.library_read_context(text) to service_role;
commit;
