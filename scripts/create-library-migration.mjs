// Regenerate the SQL body, retaining the filename allocated by the Supabase CLI.
import { writeFileSync } from "node:fs";
const path = process.argv[2];
if (!/^supabase\/migrations\/\d+_library_read_tables\.sql$/.test(path || ""))
  throw new Error("Choose the CLI-created library migration.");
const collections = {
  members: "users",
  lists: "savedArmies",
  versions: "armyVersions",
  memberships: "libraryMemberships",
  matrices: "matrixLists",
  patches: "patches",
  games: "games",
  scrims: "scrims",
  defaults: "libraryDefaults",
  discussions: "libraryDiscussions",
  imports: "libraryRosterImports",
};
const picks = (keys) =>
  `jsonb_strip_nulls(jsonb_build_object(${keys.flatMap((k) => [`'${k}'`, `item->'${k}'`]).join(", ")}))`;
const payload = (kind) =>
  kind === "members"
    ? picks([
        "id",
        "name",
        "role",
        "confirmedMember",
        "removedAt",
        "accountDeletedAt",
      ])
    : kind === "games"
      ? picks([
          "id",
          "userId",
          "date",
          "own",
          "enemy",
          "score",
          "patchId",
          "ownListVersionId",
          "enemyListVersionId",
          "libraryContribution",
          "canonicalMatchId",
          "gameContext",
          "scrimId",
          "scrimPairingId",
        ])
      : kind === "scrims"
        ? `(${picks(["id", "patchId", "cancelled", "submissionDeadline", "teamSize"])} || jsonb_build_object(
    'teams', (select coalesce(jsonb_agg(jsonb_build_object('id', t->'id', 'finalizedAt', t->'finalizedAt', 'entries',
      (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', e->'id', 'userId', e->'userId', 'army', e->'army', 'savedArmyId', e->'savedArmyId', 'listVersionId', e->'listVersionId')) order by en), '[]'::jsonb)
       from jsonb_array_elements(t->'entries') with ordinality entries(e,en))) order by tn), '[]'::jsonb)
      from jsonb_array_elements(item->'teams') with ordinality teams(t,tn)),
    'pairings', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', p->'id', 'aId', p->'aId', 'bId', p->'bId', 'scoreA', p->'scoreA', 'date', p->'date', 'gameContext', p->'gameContext')) order by pn), '[]'::jsonb)
      from jsonb_array_elements(item->'pairings') with ordinality pairings(p,pn))))`
        : "item";
let sql = `-- Transactional library read model. portal_state remains the compatibility write
-- source during this stage, so reverting the application never loses new writes.
begin;
create table public.library_meta (id integer primary key check(id=1), revision bigint not null, default_patch_id text);
alter table public.library_meta enable row level security;
revoke all on public.library_meta from public, anon, authenticated;
grant select, insert, update, delete on public.library_meta to service_role;
`;
for (const kind of Object.keys(collections))
  sql += `
create table public.library_${kind} (
  id text primary key, owner_id text, list_id text, patch_id text,
  visible boolean not null, ordinal bigint not null,
  payload jsonb not null check(jsonb_typeof(payload)='object')
);
alter table public.library_${kind} enable row level security;
revoke all on public.library_${kind} from public, anon, authenticated;
grant select, insert, update, delete on public.library_${kind} to service_role;
`;
sql += `
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
`;
for (const [kind, field] of Object.entries(collections)) {
  const visibility =
    kind === "members"
      ? "coalesce((item->>'confirmedMember')::boolean,false) and coalesce(item->>'removedAt','')='' and coalesce(item->>'accountDeletedAt','')=''"
      : kind === "lists"
        ? "coalesce((item->>'shared')::boolean,false)"
        : kind === "versions"
          ? "coalesce((item->>'published')::boolean,false)"
          : kind === "games"
            ? "coalesce((item->>'libraryContribution')::boolean,false)"
            : "true";
  sql += `
  if previous_state is null or next_state->'${field}' is distinct from previous_state->'${field}' then
    insert into public.library_${kind} as target (id,owner_id,list_id,patch_id,visible,ordinal,payload)
    select ${kind === "defaults" ? "jsonb_build_array(item->>'archetypeId',item->>'patchId')::text" : "item->>'id'"}, item->>'${kind === "discussions" ? "authorId" : "userId"}', item->>'${kind === "memberships" ? "versionId" : "listId"}', item->>'patchId',
      ${visibility}, n, ${payload(kind)}
    from jsonb_array_elements(coalesce(next_state->'${field}','[]'::jsonb)) with ordinality records(item,n)
    on conflict(id) do update set owner_id=excluded.owner_id,list_id=excluded.list_id,patch_id=excluded.patch_id,
      visible=excluded.visible,ordinal=excluded.ordinal,payload=excluded.payload
    where (target.owner_id,target.list_id,target.patch_id,target.visible,target.ordinal,target.payload)
      is distinct from (excluded.owner_id,excluded.list_id,excluded.patch_id,excluded.visible,excluded.ordinal,excluded.payload);
    delete from public.library_${kind} where id not in
      (select ${kind === "defaults" ? "jsonb_build_array(item->>'archetypeId',item->>'patchId')::text" : "item->>'id'"} from jsonb_array_elements(coalesce(next_state->'${field}','[]'::jsonb)) records(item));
  end if;
`;
}
sql += `
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

create function public.library_read_context(actor_id text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare actor jsonb; result jsonb;
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
  select jsonb_build_object(
    'revision', meta.revision, 'actor',actor, 'state',jsonb_build_object(
      'defaultPatchId',meta.default_patch_id,
      'users',(select coalesce(jsonb_agg(payload order by ordinal),'[]'::jsonb) from public.library_members),
      'savedArmies',(select coalesce(jsonb_agg(payload order by ordinal),'[]'::jsonb) from active_lists),
      'armyVersions',(select coalesce(jsonb_agg(payload order by ordinal),'[]'::jsonb) from public_versions),
      'libraryMemberships',(select coalesce(jsonb_agg(x.payload order by x.ordinal),'[]'::jsonb) from public.library_memberships x join public_versions v on v.id=x.list_id),
      'matrixLists',(select coalesce(jsonb_agg(payload order by ordinal),'[]'::jsonb) from public_matrices),
      'games',(select coalesce(jsonb_agg(payload order by ordinal),'[]'::jsonb) from contributions),
      'scrims',(select coalesce(jsonb_agg(s.payload order by s.ordinal),'[]'::jsonb) from public.library_scrims s
        where not coalesce((s.payload->>'cancelled')::boolean,false) and (s.payload->>'submissionDeadline')::timestamptz<=statement_timestamp()
        and not exists(select 1 from jsonb_array_elements(s.payload->'teams') teams(t)
          where coalesce(t->>'finalizedAt','')='' or jsonb_array_length(t->'entries')<>(s.payload->>'teamSize')::integer
          or exists(select 1 from jsonb_array_elements(t->'entries') entries(e) where e->'army' is null or e->'army'='null'::jsonb))
        and exists(select 1 from contributions g where g.payload->>'scrimId'=s.id)),
      'patches',(select coalesce(jsonb_agg(case when exists(
        select 1 from public.library_imports i join public_matrices m on i.payload->>'sourceKey'='matrix:'||m.id
        where i.patch_id=p.id and i.payload->'army'->'composition' is not null
        ) then p.payload else (p.payload-'catalogue') || case when p.payload->'catalogue'->'systemId' is not null
          then jsonb_build_object('catalogue',jsonb_build_object('systemId',p.payload->'catalogue'->'systemId')) else '{}'::jsonb end end order by p.ordinal),'[]'::jsonb) from public.library_patches p),
      'libraryRosterImports',(select coalesce(jsonb_agg(i.payload order by i.ordinal),'[]'::jsonb) from public.library_imports i
        join public_matrices m on i.payload->>'sourceKey'='matrix:'||m.id),
      'libraryDefaults',(select coalesce(jsonb_agg(payload order by ordinal),'[]'::jsonb) from public.library_defaults),
      'libraryDiscussions',(select coalesce(jsonb_agg(payload order by ordinal),'[]'::jsonb) from public.library_discussions),
      'phases','[]'::jsonb,'evaluations','[]'::jsonb,'messages','[]'::jsonb,'goals','[]'::jsonb,'events','[]'::jsonb,'applications','[]'::jsonb,'audit','[]'::jsonb
    )) into result from public.library_meta meta where id=1;
  return result;
end;
$$;
revoke all on function public.library_read_context(text) from public,anon,authenticated;
grant execute on function public.library_read_context(text) to service_role;
commit;
`;
// Build the transport envelope as json: jsonb aggregation needlessly copies and
// normalizes every nested roster again. Stored snapshots remain exact jsonb.
const readStart = sql.indexOf("create function public.library_read_context");
sql =
  sql.slice(0, readStart) +
  sql
    .slice(readStart)
    .replace("returns jsonb", "returns json")
    .replace("result jsonb", "result json")
    .replaceAll("jsonb_agg(", "json_agg(")
    .replaceAll("'[]'::jsonb", "'[]'::json")
    .replace("select jsonb_build_object(", "select json_build_object(")
    .replace("'state',jsonb_build_object(", "'state',json_build_object(");
writeFileSync(path, sql);
