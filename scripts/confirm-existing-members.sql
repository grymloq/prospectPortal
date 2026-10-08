-- Target: prospect-portal (obahctwhpbmtyeybxodq) only.
-- Additive, idempotent rollout of membership approval. Existing auth-only accounts
-- are grandfathered by their Auth creation time when first provisioned by the app.
begin;
do $$
declare
  previous jsonb;
  updated jsonb;
begin
  select value into strict previous from public.portal_state where id = 1 for update;
  if previous ? 'membershipCutoverAt' then
    return;
  end if;
  updated := jsonb_set(previous, '{users}', (
    select coalesce(jsonb_agg(jsonb_set(u, '{confirmedMember}', 'true'::jsonb) order by position), '[]'::jsonb)
    from jsonb_array_elements(previous->'users') with ordinality as member(u, position)
  ));
  updated := jsonb_set(updated, '{membershipCutoverAt}', to_jsonb(to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  if (updated - 'users' - 'membershipCutoverAt') is distinct from (previous - 'users' - 'membershipCutoverAt') then
    raise exception 'Unexpected non-membership change';
  end if;
  if jsonb_array_length(updated->'users') <> jsonb_array_length(previous->'users') then
    raise exception 'Membership count changed';
  end if;
  update public.portal_state set value = updated, revision = revision + 1 where id = 1;
end $$;
commit;
