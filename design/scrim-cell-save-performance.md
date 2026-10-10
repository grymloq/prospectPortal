# Scrim matrix cell saves — 10 October 2026

## Change and authorization

Cloud `scrimLayoutEstimate` saves use a dedicated `scrim_score_context` read and
`scrim_score_commit` transaction. The browser request and compact response are
unchanged. The server reads only the selected scrim, configuration sources,
shared starting estimates and the actor's authorized journal configurations.
Journal reflections, profiles, messages and evaluations are excluded. Only the
edited team's cell is returned to the browser.

The server reuses `executeScrim` for validation, army identities, expected-score
checks, deadline/reveal behavior, preparation carry-forward and history. It sends
only changed cells; the first post-reveal edit can also materialize shared seeds,
as the legacy domain operation did. Actor identity comes from Supabase `getUser`,
never from the command. Same-origin checks and read-only access preview remain.

The database locks the existing workspace row, checks its global revision and
the scrim revision, and rechecks current member status and team membership.
Concurrent permission, list, shared-estimate and scrim changes invalidate the
snapshot and trigger fresh validation. Admin/Organizer status alone does not
grant another team's private matrix access.

Only planning cells/history and the scrim revision change. An additive,
single-revision marker lets the library trigger advance its revision without
scanning unrelated collections. Ordinary commits always run the original mirror
sync, including publication withdrawal, removal, consent and result changes.
The existing JSON remains authoritative and contains every accepted edit,
historical author, comment and army version, so application rollback loses no data.
All functions are service-only SECURITY INVOKER with an empty search path;
anonymous/authenticated database clients cannot execute them or read portal state.

Planning scores generate no notifications. They no longer invoke the background
worker on every keystroke; the existing deadline/delivery scheduler continues.
Other mutations retain their notification behavior. Timings use the fixed
`scrim.score` operation and numerical allowlisted fields only.

## Production measurements

Actual earlier warm, successful compact scrim save requests on deployment
`dpl_BzRx1NpfmNCaT91U4QGfhWSJke9M` had **6,205.06 ms median** and
**15,341.27 ms p95** (8 samples). Median commit was 4,926.94 ms. Legacy timings
called these `state.write`; `--legacy-scrim` selects successful compact responses,
excluding whole-workspace responses. These include auth and request work, but
exclude browser queue/network time. They are a separate observation from the
controlled comparison below.

A protected, unpromoted production candidate in `dub1`, using the existing
production Supabase database, compared both paths against the same existing cell.
Both paths execute normal domain validation and database commits inside a
service-only probe that intentionally rolls back its entire transaction.
No login is impersonated, no test edit/history is retained, and no private data
is logged. Six samples per path came from two candidate server instances.

| Production transport measurement | Legacy | Dedicated cell |
| --- | ---: | ---: |
| Read + domain validation + commit median | 1,201 ms | 336 ms |
| Read + validation + commit p95 | 1,941 ms | 532 ms |
| Commit median | 944 ms | 155 ms |
| Commit p95 | 1,565 ms | 269 ms |
| Write request size | 3,259,985 bytes | 1,260 bytes |

Percentiles use the same nearest-rank method as the request timing reporter.
These are **production server-to-database save-path timings**, including SDK
serialization/transfer and domain checks, but excluding Auth verification,
browser network time and browser queueing. They are not post-deployment
authenticated user-request percentiles. The new fixed request metric provides
that evidence as real traffic arrives.

Database-only rolled-back comparisons produced exact legacy/dedicated state
equality and retained source/mirror revisions and all versions. SQL times varied
(legacy 118–267 ms; cell 88–245 ms across three paired samples); they do not
demonstrate a consistent database-only CPU improvement. The measured transport
improvement comes principally from removing the whole-document transfer.
Production source/mirror stayed at revision 526 through the controlled tests;
all 19 lists and 33 versions remain.

Ignored numeric evidence: `.local/scrim-save-production-before.json` and
`.local/scrim-production-transport.json`. Reproduce transport validation only on
an unpromoted production candidate with `SCRIM_SCORE_PROBE_ENABLED=1`, invoke
`/api/state` through `vercel curl`, then pipe candidate logs through
`scripts/summarize-scrim-probe.mjs`. The flag is absent on the final public
deployment; normal startup does no probe work. Probe RPCs always roll back and
are inaccessible to browser roles. SQL-only validation is reproducible with
`scripts/sql/benchmark-scrim-cell-transaction.sql`.

## Validation and deployment

Lint, production build, 239 domain/Postgres tests and 65 HTTP integration checks
passed. New PostgreSQL tests exercise service/denied roles, removed and pending
members, team staff and cancelled/completed rules, global/scrim/army/score
conflicts, clearing, seeding, preparation comments and historical names, exact
versions, normal mirror updates after a cell save, probe rollback and legacy
trigger rollback. HTTP tests use an isolated local store and cover origin,
authentication, preview, privacy and stale-write behavior; cloud transaction
behavior is separately tested against PostgreSQL and the production candidate.

Production RPC privileges and source/mirror revisions were verified. Security
advisors introduced no new warnings; existing findings remain for `pg_net`, the
existing `rls_auto_enable` helper and leaked-password protection. See
[database advisor guidance](https://supabase.com/docs/guides/database/database-linter)
and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

An initial unpromoted CLI candidate included local files because the CLI did not
honor `.gitignore`; that candidate was removed before promotion. `.vercelignore`
now explicitly excludes local stores, environment files, caches and the user's
untracked plan. A CLI dry-run verified zero private files in the corrected upload.
The public alias remained on the previous deployment throughout candidate tests.

## Rollback

From the linked project, restore the verified previous application deployment:

```powershell
npx vercel rollback dpl_BzRx1NpfmNCaT91U4QGfhWSJke9M --yes --timeout 60s
```

The old application reads every new cell/history from the existing portal JSON.
Keep the additive database schema in place. No snapshot restore or data deletion
is required. Alternatively set `SCRIM_SCORE_WRITE_MODE=legacy` and redeploy.
Verify the public alias, authorized team-cell access and subsequent writes.

If the database trigger itself needs reversal, first switch the application to
legacy, then apply `scripts/sql/rollback-scrim-cell-transaction.sql`. This restores
the previous mirror trigger without removing any saved data. PostgreSQL tests
verify this rollback and subsequent legacy commits.

This compatibility step still locks/rewrites the singleton JSON inside Postgres.
It removes the large external transfer and unrelated synchronization, rather than
providing independent per-scrim storage. Concurrent legacy workspace/library writes
can still delay that lock; eliminating that bottleneck requires a later migration
of scrim records with equally fresh permission/dependency checks.
