-- Server-mediated portal storage. No browser/Auth-role access to private state.
begin;
create table if not exists public.portal_state (
  id integer primary key check (id = 1),
  revision bigint not null default 0,
  value jsonb not null check (jsonb_typeof(value) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.portal_state enable row level security;
revoke all on public.portal_state from anon, authenticated;
grant select, update on public.portal_state to service_role;

insert into public.portal_state(id, value) values (1, '{"users":[],"phases":[{"id":"application","name":"Application","kind":"application"},{"id":"phase1","name":"Phase 1","kind":"review"},{"id":"phase2","name":"Phase 2","kind":"review"},{"id":"selected","name":"Selected","kind":"selected"}],"games":[],"evaluations":[],"evaluationHistory":[],"messages":[],"goals":[],"events":[],"applications":[],"audit":[]}') on conflict (id) do nothing;

create or replace function public.portal_commit(expected_revision bigint, next_value jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.portal_state set value = next_value, revision = revision + 1, updated_at = now()
  where id = 1 and revision = expected_revision;
  return found;
end;
$$;
revoke all on function public.portal_commit(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.portal_commit(bigint,jsonb) to service_role;
commit;
