# Matrix and Army library performance validation

Measured 10 October 2026. Baseline: commit `851f493` (the preceding production release).

The release removes full workspace projections from Army library reads and notification polling, uses compact committed responses for main and scrim matrix score edits, and retains unrelated browser collections when applying main matrix updates. Library search waits 250 ms after typing. Game observations and published versions use indexes within each request. Roster comparisons are calculated only for the returned page; archetype standards still use the entire eligible published dataset. The matrix reuses logged-game aggregates when only manual scores change.

## Method

`scripts/benchmark-performance.mts` starts a local Next.js production build on port 3109 with a newly generated synthetic SQLite database. It never opens or replaces `.local/team-sweden.sqlite`. Each endpoint has three warm-ups and fifteen sequential samples; elapsed time includes receiving the complete HTTP body. The concurrent case sends ten library requests in one batch. Node: 24.15.0, Windows, loopback networking. Byte counts are uncompressed JSON response bodies.

The same fixtures, account and commands were used before and after. Both fixtures include twenty units with nested options per roster, three published versions per list and explicitly contributed games. The score-save benchmark uses an administrator to exercise the largest authorized workspace response. Five library result fingerprints (browse, archetypes, search/sort, list detail and score-sorted pagination) match exactly before and after in both fixtures.

These measurements isolate application work. They are **not authenticated Vercel response times**, a production load test, or a throughput guarantee. SQLite reads also rewrite the JSON document in a transaction; the cloud path instead reads Supabase `portal_state` and commits only when needed. The removed cloud library workspace projections are additional savings that this local library benchmark does not measure. Small samples and machine load limit precision, especially tail latency.

## 25 lists, 75 versions, 100 games — 3.42 MB state

| Request | Median before → after | Observed p95 before → after |
| --- | --- | --- |
| Library list page | 48.8 → 44.6 ms | 50.7 → 46.5 ms |
| Archetype browse | 48.5 → 32.5 ms | 69.1 → 35.6 ms |
| List detail | 49.8 → 45.4 ms | 57.7 → 48.1 ms |
| Notification polling | 48.5 → 33.3 ms | 63.0 → 37.0 ms |
| Matrix score save | 81.6 → 72.2 ms | 87.8 → 81.5 ms |
| Ten simultaneous list-page reads | 283.2 → 260.5 ms | 532.8 → 492.0 ms |

The score response decreased from **2,670,502 to 19,500 bytes (99.27%)**. Library and notification response contents and byte sizes are unchanged.

## 200 lists, 600 versions, 1,000 games — 31.76 MB state

| Request | Median before → after | Observed p95 before → after |
| --- | --- | --- |
| Library list page | 447.2 → 382.8 ms | 602.3 → 412.5 ms |
| Archetype browse | 460.7 → 346.2 ms | 560.0 → 394.3 ms |
| List detail | 452.4 → 384.6 ms | 472.0 → 402.1 ms |
| Notification polling | 496.8 → 339.4 ms | 514.8 → 386.4 ms |
| Matrix score save | 795.2 → 687.2 ms | 951.8 → 713.8 ms |
| Ten simultaneous list-page reads | 2,531.0 → 2,150.6 ms | 4,857.0 → 4,051.7 ms |

The score response decreased from **25,209,634 to 19,500 bytes (99.92%)**. This growth fixture still demonstrates the cost of parsing, maintaining and writing a single JSON workspace. Moving high-volume records to indexed tables is the next substantial scaling step; that migration is outside this release.

## Privacy and correctness

- Server authentication, confirmed membership, account removal, same-origin writes and read-only access previews remain enforced. Lightweight reads resolve the effective preview actor without constructing a workspace.
- Library publication, withdrawal, version, contributor-consent and scrim-reveal checks run before request indexes or pagination. There is no shared cross-request cache that could retain withdrawn data.
- Compact main matrix updates contain shared changes, estimates and relevant matrix configurations only. They cannot return profiles, evaluations, feedback, journal entries or private discussions.
- Compact scrim responses require membership of the edited team, preserve cell identity and optimistic revisions, and do not return opposing plans or unrelated scrims.
- Rapid main matrix edits serialize; responses superseded by a workspace refresh, preview or account change are rejected. Zero, clearing and failure recovery are covered. Logged-game aggregates remain immutable.
- Regression validation: lint, production build, 221 domain tests and 64 HTTP integration checks. Browser QA covers search, faction/archetype expansion, list comparisons, roster viewing, complementary zero scores, clearing, and mobile matrix/navigation. No browser console errors were observed.

## Reproduce

With a current production build and port 3109 free:

```powershell
npx tsx scripts/benchmark-performance.mts after 25 100
npx tsx scripts/benchmark-performance.mts after 200 1000
```

Results are saved in `.local/performance-<lists>-<games>-after.json`. To reproduce the baseline, copy this benchmark script into an isolated checkout of `851f493`, install its dependencies, build it and run the same commands with `before`. Keep that checkout's databases isolated. Copy the resulting before JSON files into the current checkout's `.local` directory before running `after` to enable fingerprint comparison. Reusing the `before` label with the new build does not reproduce the old implementation.
