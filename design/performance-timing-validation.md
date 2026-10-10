# Production timings and army summary maintenance

Measured 10 October 2026. Baseline: `74e183e`, the preceding production release.

This release adds privacy-safe server request timings and removes repeated roster-summary calculations from ordinary reads. Summary maintenance now runs when an army is created, replaced or imported. Existing saved armies, immutable versions, current matrix lists and import sidecars receive a versioned, additive backfill within the existing atomic revision commit. Existing journal, scrim and matrix-history snapshots remain frozen; new snapshots receive their summaries during writes.

## Summary validity

The server-only `armySummaryRevision` marker includes a maintenance version and the sorted ruleset/system namespaces used by the classifier. JSON object key ordering does not invalidate it. Change `MAINTENANCE_VERSION` when decoder, classifier or unit-counting semantics change. A ruleset namespace change or older/missing marker triggers one refresh. No new army version is invented by summary maintenance.

Commands retain a request-local map of army references and patch IDs, then update only replaced/new army snapshots. Creation, saved-list revisions, pasted text, matrix entries, scrim submissions, paired journals and administrative roster imports are covered. Submitted summaries are not trusted. Published list details reuse the authorized version's stored summary; legacy or dynamically assembled matrix evidence has a bounded detail-only fallback.

Cloud backfills and writes continue through `portal_commit` with the current expected revision. Competing commits rerun authorization, validation and summary maintenance against the winning state. The backfill occurs on the first authorized cloud access after deployment; it does not require a SQL schema migration. There is no cross-request private-data cache.

## Timing records

One `portal_timing` JSON record is emitted for each instrumented request in production, including rejected requests. It contains only version, fixed operation name, HTTP status, elapsed milliseconds, allowlisted phase durations, response byte count, revision retry count and whether this is the first timed request handled by that module instance.

Operations cover state reads/writes, compact matrix scores, library lists/archetypes/details/version actions/admin preview, and notifications. Cloud phases cover authentication, Supabase document retrieval, state preparation, command execution, deadline notifications, authorized projection, commits and serialization. Local validation records SQLite read/work/commit phases. Retry phases accumulate across attempts.

There are no request URLs, query/filter values, IDs, names, email addresses, roles, cookies, tokens, command bodies, rosters, private reflections or error messages in these records. Logs remain in the project's existing private Vercel runtime logs. No public metrics endpoint or third-party analytics service was introduced. Measurement errors cannot fail a request. Set `PORTAL_TIMING_ENABLED=0` to disable emission.

`elapsedMs` ends after the response is constructed, including serialization. It excludes browser/network download time, edge queueing and background notification delivery. `db.read` includes the Supabase HTTP round trip and JSON parsing, rather than isolated SQL execution. `firstRequestInProcess` identifies the first timed request, not a precise measure of Vercel cold-start time. Response bytes count the uncompressed JSON body, serialized once without cloning a response stream.

Export JSONL runtime events and run `node scripts/summarize-request-timings.mjs path/to/events.jsonl` to get median/p95 measurements grouped by operation, status and process-first flag. The script also accepts Vercel JSONL records containing a JSON `message`, including the current request envelope's nested `logs` array. It ignores unrelated or malformed logs and outputs only aggregated measurements. Use successful authenticated samples separately from rejected requests; small sample counts cannot establish a production latency percentile.

Verified CLI export: `npx vercel logs --environment production --since 15m --json --limit 200 | node scripts/summarize-request-timings.mjs`. Avoid filtering by the timing message in the CLI query: the request envelope's top-level message describes the request, while console events are nested. Production smoke checks confirmed timing emission and private/no-store 401 responses from all three protected endpoints. These rejected requests do not measure authenticated production navigation or database latency.

Vercel may repeat the same console event in its envelope message and nested logs. The report deduplicates within each request envelope, preserving separate requests even when their measurements match. After deployment, a natural authenticated notification read was also captured and the summary marker persisted atomically at revision 506, retaining 19 saved armies and 33 versions. That initial read took 2,268 ms, including 720 ms for cloud retrieval and 1,345 ms for a commit; it is an initial-maintenance observation, not a steady-state production latency estimate. More successful authenticated samples are needed for meaningful live median/p95 comparisons.

## Local before/after measurements

The existing benchmark uses a local production build, Node 24.15.0, Windows, synthetic isolated SQLite databases, three warm-ups and fifteen samples per endpoint. Elapsed time includes receiving the entire HTTP body. The concurrency case is one ten-request batch. Fixtures have twenty units with nested equipment per roster, three published versions per list and explicitly contributed games. The final after runs were isolated from other repository validation.

The same five library result fingerprints match before/after in both fixtures. Library, detail, notification and compact score response byte counts are unchanged. Timing instrumentation is enabled in the after measurements. Synthetic fixtures bypass domain writes, so the benchmark explicitly removes the seed's summary marker to exercise the legacy backfill before warmed measurements. It never opens or replaces `.local/team-sweden.sqlite`.

### 25 lists, 75 versions, 100 games — initial 3.42 MB state

| Request                          | Median before → after | Observed p95 before → after |
| -------------------------------- | --------------------- | --------------------------- |
| Library list page                | 44.8 → 43.6 ms        | 48.4 → 48.7 ms              |
| Archetype browse                 | 33.0 → 32.2 ms        | 34.9 → 35.7 ms              |
| List detail                      | 46.3 → 43.7 ms        | 48.8 → 46.2 ms              |
| Notifications                    | 32.5 → 30.5 ms        | 36.8 → 39.5 ms              |
| Matrix score save                | 70.4 → 63.4 ms        | 75.4 → 69.5 ms              |
| Ten simultaneous list-page reads | 255.4 → 238.5 ms      | 480.1 → 452.8 ms            |

### 200 lists, 600 versions, 1,000 games — initial 31.76 MB state

| Request                          | Median before → after | Observed p95 before → after |
| -------------------------------- | --------------------- | --------------------------- |
| Library list page                | 363.6 → 340.4 ms      | 398.0 → 495.7 ms            |
| Archetype browse                 | 330.4 → 295.8 ms      | 379.7 → 336.8 ms            |
| List detail                      | 380.0 → 338.8 ms      | 427.2 → 380.8 ms            |
| Notifications                    | 327.7 → 282.3 ms      | 368.4 → 377.0 ms            |
| Matrix score save                | 662.8 → 559.3 ms      | 715.7 → 614.4 ms            |
| Ten simultaneous list-page reads | 2,085.9 → 1,943.0 ms  | 3,925.3 → 3,671.4 ms        |

Median improvements range from about 2% to 10% in the smaller fixture and 6% to 16% in the larger fixture. Tail measurements are mixed: list-page and notification p95 increased in the larger fixture. With fifteen samples, reported p95 is the largest sample; these results do not establish a consistent slow-request improvement. They are local application measurements, not authenticated production timings or a throughput guarantee. SQLite still parses and rewrites the entire workspace for reads, unlike the cloud commit-only-when-needed path.

After timing records show warmed list-page state preparation at a median 0.03 ms in the smaller fixture and 0.89 ms in the larger fixture, with no roster-summary traversal. The large fixture still spends most time parsing and writing the single JSON document. Indexed records remain the next structural scaling improvement.

## Validation and privacy

- Lint and production build pass; 226 domain tests and 65 HTTP checks pass.
- New tests cover versioned backfill, unchanged-read roster avoidance, ruleset namespace invalidation, frozen history, changed-army summaries and JSON key-order idempotence.
- Tests cover concurrent timing isolation, failed phases, safe log fields, UTF-8 byte counts, telemetry sink failure, and aggregate report filtering. HTTP tests confirm records for authenticated and rejected requests contain no private request/response values.
- Existing server privacy, preview ownership, removal/revocation, list publication and withdrawal, private version history, contributor consent, scrim reveal/team boundaries, stale revisions, paired journals and capacity tests pass unchanged.
- Read-only production verification confirmed the `prospect-portal` Supabase target is healthy in `eu-west-1`, with RLS enabled on `portal_state` and no direct SELECT privilege for `anon` or `authenticated`. Before release the state had 19 saved armies, 33 versions and no summary marker at revision 505.
- After release, read-only verification confirmed the summary marker at revision 506 with the saved-army and version counts unchanged. Successful authenticated and rejected requests both emitted the expected privacy-safe timing records.
- This release changes server behavior only. No new visual acceptance claim or authenticated production latency claim is made.

## Reproduce

With the appropriate production build and port 3109 free:

```powershell
npx tsx scripts/benchmark-performance.mts summaries-before 25 100
npx tsx scripts/benchmark-performance.mts summaries-before 200 1000
# Build the updated release before running these:
npx tsx scripts/benchmark-performance.mts summaries-after 25 100
npx tsx scripts/benchmark-performance.mts summaries-after 200 1000
node scripts/summarize-request-timings.mjs .local/performance-200-1000-summaries-after-timings.jsonl
```

Use the baseline checkout/build for `summaries-before`. Outputs and raw synthetic timing records stay in ignored `.local`. Rollback is a redeployment of the preceding release; the added marker is backward-compatible, and army content, versions, visibility and privacy rules are unchanged.
