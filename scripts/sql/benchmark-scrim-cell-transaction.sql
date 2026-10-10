-- Production-safe comparison: both writes are rolled back in subtransactions.
-- Returns measurements/booleans only. No identity, cell, score or history data.
do $$
declare v jsonb; r bigint; scrim jsonb; team jsonb; cell jsonb; actor jsonb;
  si integer; ti integer; ci integer; next_cell jsonb; next_value jsonb;
  started timestamptz; elapsed numeric; mode text; ok boolean; report jsonb:='{}';
  ctx json; mirror_revision bigint; mirror_rows bigint;
begin
  foreach mode in array array['legacy','cell'] loop
    begin
      select value || '{}'::jsonb,revision into v,r from public.portal_state where id=1 for update;
      select s,t,c,(sn-1)::integer,(tn-1)::integer,(cn-1)::integer
        into scrim,team,cell,si,ti,ci
        from jsonb_array_elements(v->'scrims') with ordinality scrims(s,sn)
        cross join lateral jsonb_array_elements(s->'teams') with ordinality teams(t,tn)
        cross join lateral jsonb_array_elements(t->'estimates') with ordinality cells(c,cn)
        where not coalesce((s->>'cancelled')::boolean,false)
          and exists(select 1 from jsonb_array_elements(v->'users') users(u)
            where u->>'id'=t->>'captainId' and coalesce(u->>'removedAt','')=''
            and coalesce((u->>'confirmedMember')::boolean,false))
        limit 1;
      if cell is null then raise exception 'No eligible existing planning cell for benchmark.'; end if;
      actor:=public.scrim_score_member(v,team->>'captainId');
      select revision into mirror_revision from public.library_meta where id=1;
      select count(*) into mirror_rows from public.library_versions;
      -- Same score, extra history record, exactly as a normal accepted edit.
      next_cell:=cell || jsonb_build_object('updatedBy',actor->'name','updatedAt',clock_timestamp(),
        'history',coalesce(cell->'history',jsonb_build_array(jsonb_build_object('scores',cell->'scores',
          'authorName','Shared starting estimates','createdAt',clock_timestamp()))) ||
        jsonb_build_array(jsonb_build_object('scores',cell->'scores','authorName',actor->'name','createdAt',clock_timestamp())));
      next_value:=jsonb_set(jsonb_set(v,array['scrims',si::text,'teams',ti::text,'estimates',ci::text],next_cell),
        array['scrims',si::text,'revision'],to_jsonb((scrim->>'revision')::bigint+1));
      if mode='cell' then
        started:=clock_timestamp();
        ctx:=public.scrim_score_context(actor->>'id',scrim->>'id',team->>'id');
        report:=report || jsonb_build_object('context_ms',extract(epoch from clock_timestamp()-started)*1000,
          'context_bytes',octet_length(ctx::text),'write_bytes',octet_length(jsonb_build_array(jsonb_build_object('teamId',team->'id','cell',next_cell))::text),
          'legacy_write_bytes',octet_length(v::text));
      end if;
      started:=clock_timestamp();
      if mode='legacy' then ok:=public.portal_commit(r,next_value);
      else ok:=public.scrim_score_commit(actor->>'id',r,scrim->>'id',(scrim->>'revision')::bigint,team->>'id',
        jsonb_build_array(jsonb_build_object('teamId',team->'id','cell',next_cell))); end if;
      elapsed:=extract(epoch from clock_timestamp()-started)*1000;
      if not ok then raise exception 'Unexpected benchmark CAS rejection.'; end if;
      report:=report || jsonb_build_object(mode||'_commit_ms',elapsed,mode||'_exact_state',
        (select value=next_value from public.portal_state where id=1));
      raise exception using errcode='Z0001',message='Intentional benchmark rollback';
    exception when sqlstate 'Z0001' then null; end;
    report:=report || jsonb_build_object(mode||'_rollback_preserved_state',
      (select value=v and revision=r from public.portal_state where id=1),
      mode||'_rollback_preserved_mirror_revision',(select revision=mirror_revision from public.library_meta where id=1),
      mode||'_rollback_preserved_versions',(select count(*)=mirror_rows from public.library_versions));
  end loop;
  perform set_config('portal_diag.scrim_cell_benchmark',report::text,false);
end $$;
select current_setting('portal_diag.scrim_cell_benchmark')::jsonb as measurement;
