# Library database cutover — 2026-10-10

Library browsing, archetype queries and details now read from dedicated Postgres
tables through a service-only RPC. The HTTP contract and domain analytics are
unchanged. Owner version management and administrator consolidation maintenance
continue through the compatibility store in this stage.

## Storage and consistency

Migration `20261010004231_library_read_tables.sql` creates separate lists,
immutable version snapshots, publication columns, membership, matrix, consented
game facts, scrim facts, defaults, discussions, imports, rulesets and member
authorization tables. It was allocated by the Supabase CLI and aligned with the
version assigned by the production MCP migration ledger. The existing scheduler
migration was not reapplied.

`portal_commit` still validates a whole-workspace revision and domain commands.
An invoker trigger synchronizes changed library collections in that same
transaction. Only changed rows are updated. A failed sync aborts the entire
write. No asynchronous queue, stale shared cache or independent dual writes are
involved. A read uses one stable RPC snapshot with fresh membership, publication
and consent. Indexes cover owner/list/patch/publication lookup. JSON transport
aggregation avoids recopying nested rosters into a new jsonb tree.

The compatibility JSON remains the write source and is retained for rollback.
This stage removes whole-workspace reads from ordinary library requests. Domain
analytics still scan eligible public history, and sorting/pagination remain in
TypeScript so locale ordering, global standards, facets and historical grouping
stay identical. Moving those aggregates and pagination into SQL, then removing
the compatibility write document, is a subsequent scaling step.

## Privacy and immutable history

All 12 library tables have RLS enabled, with no browser access policies. Explicit
table and function privileges deny both `anon` and `authenticated`. Only the
server service role can use the RPC. Functions use `security invoker` and an
empty search path. The server passes the identity verified by Supabase Auth;
neither a query parameter nor editable JWT metadata selects the actor.

Members contain only identity, display name and current authority facts.
Recorded-game facts exclude opponent names, private context, notes and event
identity. Scrim facts omit staff identities, estimates, comments and planning
history, and enter the read context only after the deadline with complete
finalized submissions. Publication, owner eligibility, per-game consent,
canonical conflict handling, independently public opponent detail and discussion
ancestor/context visibility are rechecked by the existing domain query.

Rulesets normally return only metadata and system namespace. A ruleset with a
matrix roster sidecar retains its full catalogue in the server context so
existing source-revision hashes remain verifiable. No historical roster is
reconstructed from a newer catalogue.

Production backfill at revision 515 copied all 19 saved armies and all 33
versions. Every saved-army payload matched its original. The ordered versions
had the same hash before and after (`6ea019d4cbd83b610fa8912454cf7edc`). Number,
creation time, patch, army content and publication flags were unchanged.

## Measurements

Production Postgres 17.6, 15 warm samples after 3 warmups, sequential calls:

| Measurement | Before | After |
| --- | ---: | ---: |
| Database read plus text serialization, median | 30.63 ms | 20.15 ms |
| Same measurement, observed p95 | 70.87 ms | 43.87 ms |
| Serialized database payload | 3,405,246 bytes | 535,726 bytes |

Before executes `EXPLAIN (ANALYZE, BUFFERS) SELECT octet_length(value::text)`
against the one workspace row. After executes the library RPC for an active
member and text-serializes its complete context. This measures database work,
not authenticated browser or Vercel request latency. Payload is about 84%
smaller. The short sample's p95 is descriptive, not a production SLO.

Isolated PGlite PostgreSQL benchmark, 200 lists / 600 immutable versions / 1,000
games, including JSON transfer simulation/parsing and the unchanged domain query,
15 samples after 3 warmups:

| Query | Median before | Median after | p95 before | p95 after |
| --- | ---: | ---: | ---: | ---: |
| Browse | 110.10 ms | 75.98 ms | 119.55 ms | 88.80 ms |
| Archetypes | 104.51 ms | 61.98 ms | 112.13 ms | 79.65 ms |
| Detail | 120.52 ms | 75.27 ms | 122.48 ms | 90.97 ms |

Read payload falls from 14,424,820 to 6,506,747 bytes. At 25 lists / 100 games,
browse median falls from 14.26 to 10.20 ms; detail from 14.11 to 10.50 ms.
These are local engine measurements without network time. Fixtures deliberately
include private internal-discussion growth, which is excluded from library reads.

The compatibility trigger adds write work: a single large-fixture unrelated
commit measured 189.79 ms before versus 226.22 ms after; small-fixture commit
20.53 versus 24.25 ms. These single samples are not a latency distribution.
The original whole-document write cost remains. Observe production timings
before choosing the next write-store or aggregate migration.

Reproduce with `npx tsx scripts/benchmark-library-database.mts 200 1000` (or
`25 100`). Results go to ignored `.local/library-database-*.json`; no personal
SQLite database is read, reset or deleted. A separate existing SQLite HTTP
baseline was captured but is not presented as the database migration comparison.

## Validation and rollout

Lint and production build passed. All 229 domain/Postgres tests and 65 HTTP
integration checks passed. HTTP integration uses the isolated local store;
the new database read behavior is exercised independently against PostgreSQL.

Postgres tests compare real RPC/domain results with legacy results for browse,
archetypes, search, score/match sorting, pagination, filters, detail and immutable
historical selection. They cover withdrawal, consent, pending/removed membership,
default pins, discussion ancestors/tombstones, verified matrix imports, scrim
reveal/submission gating, denied database roles, rejected stale writes, failed
mirror rollback and legacy rollback after a new write.

Production checks confirmed matching source/mirror revisions, exact snapshots,
service-only privileges and all RLS flags. A service-role commit inside an
explicit rollback transaction verified stale-write rejection and atomic mirror
revision advancement without retaining a production edit. The revision stayed
515 afterward.

The security advisor adds only intentional deny-all `RLS enabled, no policy`
information for the new tables. Index-use information is expected with the tiny
current dataset. Existing warnings remain for public `pg_net`, the existing
`rls_auto_enable` helper's execute privileges and disabled leaked-password
protection. See [Supabase database advisor guidance](https://supabase.com/docs/guides/database/database-linter)
and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Rollback

Immediate application rollback, from this linked Vercel project:

```powershell
npx vercel rollback dpl_EJBMGjLZtN2Maco8Q2Pdtg8kNqwC --yes --timeout 60s
```

That verified pre-cutover deployment reads `portal_state`, which continues to
receive every successful post-cutover write. Keep the additive schema and trigger
in place. No database restore, dropped tables, rewritten history or old snapshot
replacement is required. Verify the production alias and an authenticated
library read after rolling back.

Alternatively set production `LIBRARY_READ_MODE=legacy` and redeploy the current
code. Leaving it unset uses the database model. Do not automatically fall back
on RPC errors; the normal path fails closed. A missing first-login profile is
provisioned only through the existing trusted cloud-store flow.

Local tests exercised both read paths after new writes and rolled back a failed
transaction. Production rollback capability was verified with the current
deployment identity and CLI syntax; the public alias was not flipped merely to
test rollback.
