# Army library implementation contracts

Adopted implementation defaults, 9 October 2026. This record freezes Gate A for the implementation handoff; it does not change the existing matchup matrix identity or scoring. The living product decisions remain in `product-design.md`.

## Ownership and dependency gates

The coordinator owns `src/server/service.ts`, persistence adapters, `src/server/scrims.ts`, the dedicated API route, version lifecycle module, integration checks, and product documentation. Agent 0 owns the initial `src/lib/types.ts` additions and this contract; after Gate A the coordinator alone changes shared types. The importer agent owns `src/server/newrecruit-army.ts`, new `src/server/army-library-identity.ts`, and dedicated normalization/classification tests. The analytics/discussion agent owns `src/server/army-library.ts`, `src/server/library-discussions.ts`, and focused tests. The UI agent owns new Army libraries components and scoped CSS plus explicitly delegated `workspace.tsx`, `mobile-navigation.tsx`, `my-armies.tsx`, and `journal.tsx`. Independent QA begins after those implementations integrate and owns its dedicated regression files. No agent edits another owner's file without an explicit assignment.

Gate B integrates immutable versions, safe legacy initialization and classification. Gate C integrates real purpose-specific library queries, consent, discussions and UI. Gate D runs lint, build, domain tests, HTTP tests after the build, and available desktop/mobile checks against isolated data. There is no production deployment or database reset in this handoff.

## Frozen shared entities

All additions to persisted legacy entities are optional. `Army.revision` retains its catalogue/source meaning. `Army.composition` is a `RosterComposition` with `complete | partial | unavailable` status, versioned normalization, nested selections, reasons and source provenance. A `RosterSelection` has a namespaced `sourceId`, display name, quantity, `unit | model | option | enhancement` kind and children. `quantityKnown=false` marks an absent observed quantity and prevents complete classification. Canonical identity ignores display names, owners, source URLs, ordering and patch-specific points; it preserves relevant IDs, kind, grouping, selected quantities and options. Partial/unavailable snapshots never receive an exact variation ID.

`Army.scope` separately records known system, edition, battle size and verified `continuityKey`; absent information stays absent. A configured archetype wraps the existing faction/sorted-unique-detachments/disposition identity in a namespaced scope. When continuity is unverified, the patch is included conservatively; unknown system/edition/battle-size cohorts are explicitly labelled unknown. Cross-provider or source-ID continuity requires explicit verified mappings and is not inferred from names.

Same-ruleset grouping uses that exact ruleset's saved catalogue as the authoritative system namespace. An import's matching system ID is redundant and does not separate it from a legacy list lacking that field; the legacy archetype ID stays stable. Explicit conflicting system IDs, edition/battle-size differences, missing ruleset catalogue metadata and cross-patch continuity remain conservative. Published sources supply authorized aliases for the earlier redundant-system archetype/variation IDs, preserving existing detail links and discussion contexts. Alias access is withdrawn with source publication/member visibility. Consolidation preview/apply repairs derived memberships without rewriting source snapshots.

`SavedArmy` preserves list identity/owner and adds `currentVersionId` and optimistic `listRevision`. `ArmyListVersion` has immutable `id`, `listId`, owner, number, patch, army snapshot and created timestamp. Mutable `published` is access metadata, never a roster rewrite. Initial migration uses deterministic `${saved.id}:v1`, number/revision 1 and known saved timestamp; it invents no earlier history. Actual content changes create a new version, while identical no-op saves and sharing-only changes do not. Version comparisons normalize unordered detachments and canonical composition ordering. Historical game snapshots and references survive subsequent edits/deletion.

`LibraryMembership` persists stable version/list/patch/archetype/variation IDs and classification provenance. The algorithm version is constant in the identity helper. Classification never mutates source lists, publication, ownership, game facts or old roster snapshots. Membership records for previously classified versions may remain in storage, but public query authorization controls visibility on every read.

`Game` adds explicit own/enemy version references, optional canonical match ID, per-game `libraryContribution` and optional `RecordedGameContext`. Scrim entries capture `listVersionId`, and pairings can capture recorded context. Context has schema version `1`, mission-pack/deployment and side-specific mission references with identity, name, source and source/mapping version. Manual entry represents the player's explicit recorded selection. Disposition-derived suggestions are never persisted as confirmed selections. Unknown legacy context remains absent. Existing A/B/C layout remains independent.

## Authorization and contribution

Shared libraries require current confirmed active membership. Members and admins receive the same shared dataset. No private journals, evaluations, internal discussions, opponent identities, sensitive event labels, or unrevealed scrim information enter the DTO. `/api/state` retains existing authorized behavior and omits raw `armyVersions`, `libraryMemberships` and `libraryDiscussions`; `View` excludes these collections in its type.

A saved list must be currently shared and its owner currently active and confirmed to appear. Its version must independently have `published=true`. Publishing a current version never publishes earlier private versions. Unsharing clears publication on every version; re-sharing publishes only the current version. Deletion hides every version through the absent live-list check while retaining owner-authorized snapshots. History, discussion context, facets and variation counts all apply the same live checks. Matrix entries are labelled configuration-only and never classified as verified complete unit rosters; repeated matrix history does not produce current list rows.

Per-game consent defaults to false, including all migrated games. Only the game owner may opt in or withdraw; administrator visibility of private games is not contribution permission. Consent authorizes that owner's score/date/ruleset/layout/configuration and explicitly recorded context. It never authorizes the other side's private identity, roster or unpublished version. Opponent faction/configuration may be generalized only against independently public configurations; exact opponent list/variation requires independently public version access. Unrevealed scrim games and hidden configurations never seed shared labels/counts. Revocation, unsharing, deletion and membership changes immediately affect recomputed query results; no cross-permission cache is introduced.

Version references on game save are server-validated for access, matching patch and matching configuration snapshot. Historical owner references remain useful when their original list is deleted. New enemy references require independently authorized publication or an already revealed scrim submission. Matchmaking or similar names/URLs never establish historical variation attribution.

## Exported helper contracts and integration

The version module is coordinator-owned and initializes optional arrays/idempotent migrated versions in both persistence adapters before authorized queries. It updates only affected memberships on writes; ordinary library reads do not rebuild classification. Existing document compare-and-swap/SQLite transactions remain the persistence boundary.

Identity helper `src/server/army-library-identity.ts` exports:

```ts
archetypeId(army: Army, patchId: string): string
variationId(army: Army, patchId: string): string | undefined
classifyLibraryVersion(version: ArmyListVersion): LibraryMembership
maintainLibraryMemberships(state: State): void
consolidationPreview(state: State, actor: User): ConsolidationPreview
applyConsolidation(state: State, actor: User, sourceRevision: string): void
```

It may add focused normalization exports and incremental helper exports, but consumers use these names. Preview/apply require admin membership. Preview returns a deterministic source signature from relevant versions/publication/membership/algorithm inputs, counts, reasons and proposed memberships. Apply compares that signature inside the normal atomic transaction; stale input fails safely. Repeated application preserves identities and creates no duplicates. No external requests occur inside retried transactions. The safe rebuild action is preview followed by apply.

Library query helper `src/server/army-library.ts` exports:

```ts
queryArmyLibrary(state: State, actor: User, query: LibraryQuery): ArmyLibraryDTO
```

`LibraryQuery` accepts `lists | archetypes`, optional detail `target`, version, filters, page/pageSize and stable name/score/matches sorting. `patchId` omitted uses the current team default; literal `all` makes all eligible rulesets discoverable and returns separate patch segments. Query validation bounds page size and string lengths at the server. Unknown/unauthorized direct targets fail with a neutral unavailable error.

`ArmyLibraryDTO` returns only the requested page, authorized facets, small patch references, policy and optional authorized detail. List rows distinguish saved/matrix sources. Archetype rows distinguish public lists, known variations and unclassified lists. Detail contains scoped metrics, matchups, trends, published version history, variations/public-list links, authorized discussions, patch segments and coverage. It does not include raw games, users, hidden IDs or unbounded state collections. Empty metrics have null averages/win rate/intervals, never invented zero performance. Endpoints use no-store responses and existing request/session/origin/access-preview protection.

Discussion helper `src/server/library-discussions.ts` exports `libraryCommands` (Zod discriminated command schemas) and `executeLibraryCommand(state, actor, command): boolean` (true when handled, false otherwise). Commands are:

```ts
{ type: "libraryDiscussion", target: LibraryTarget, parentId?: string,
  context?: LibraryDiscussionContext, text: string }
{ type: "libraryDiscussionEdit", id: string, text: string }
{ type: "libraryDiscussionDelete", id: string }
```

Threads/replies share dedicated library storage. Author editing/deletion and administrator moderation require fresh target/context authorization; parent targets must match. List contexts may identify only published versions of that list. Archetype version/variation/opponent contexts must correspond to visible current membership. Text is length-bounded and rendered as plain React text. Deleted rows may be retained as tombstones but public DTOs omit hidden text. Private profile conversations are never repurposed.

Coordinator command integration adds `libraryConsolidationApply` with `sourceRevision` and an explicit own-game contribution command or extends validated `game` writes with `libraryContribution`. List saves add optional `expectedRevision` for legacy compatibility; new UI always sends it when editing. `/api/army-library` accepts query parameters and returns `{ library: ArmyLibraryDTO }`. Admin preview is a separately authorized query operation (`action=consolidationPreview`) returning `{ preview: ConsolidationPreview }`. UI mutations use the existing mutate channel; the server continues blocking every write during access preview.

## Shared analytical definitions

One shared helper defines score-derived outcomes: 0–9 loss, 10 draw, 11–20 win. Metrics aggregate underlying eligible observations: score sum/appearances, wins/appearances, actual W/D/L, distinct canonical match count and distinct consenting contributor count. A linked scrim pairing defines a canonical match; ordinary games use an explicit canonical link or their own IDs. At most one consenting observation per match side is accepted. Complementary inconsistent scores or contradictory reports are excluded and counted as conflicts; they are never averaged into an invented result.

List metrics require explicit list/version references. Variations may pool independently public complete identical roster references; archetypes may use eligible known configurations with unclassified coverage. Two mirror sides remain actual wins/losses, with two appearances but one match. Mirror matchup summaries stay separately labelled. Manual estimates and discussion opinions never count as recorded appearances.

Uncertainty uses a conservative 95% Hoeffding interval on bounded 0–20 scores, grouping each canonical match's eligible appearances to preserve mirror dependence. The radius around the displayed appearance-weighted mean is `20 * sqrt(log(40) / 2 * sum(matchAppearanceWeight^2))`, clamped to 0–20. Equal-sized match groups reduce to `20 * sqrt(log(40) / (2 * matchCount))`; unequal groups receive a more conservative interval. A matchup is good only when its lower bound exceeds 10, bad only when its upper bound is below 10, otherwise uncertain. The method assumes independent matches and cannot remove player/event concentration or selection effects. Thin samples remain visible and uncertain.

Compact rows omit full roster payloads and expose an optional server-calculated recent observed score change between the latest two nonempty monthly buckets of one ruleset. Mission/deployment analytical IDs include mission-pack identity/source/version and reference identity/source/version, so reused raw labels never pool incompatible context silently. Detail related lists, versions, variations and discussion records paginate at 20 items using `relatedPage`; full counts, metrics and leader eligibility are computed before slicing. Discussion pages include currently authorized ancestors so replies remain usable. `currentSourceUrl` identifies the live external source separately from immutable historical snapshots. Current source/name edits do not create a new roster version.

The leading observed variation threshold is centralized at 10 distinct eligible canonical matches in the active scope. The label is conditional on the active average-score metric and filters, includes counts, flags single-contributor concentration, and treats equal/indistinguishable leaders honestly. It is an observation rather than proof of roster superiority. Every filter applies consistently to metrics, eligibility, comparisons and trends. Missing mission/deployment excludes only analyses requiring that dimension. Monthly trend buckets preserve gaps and patch IDs; All rulesets returns segmented history without silently pooled performance.

## Verification responsibilities

Dedicated isolated tests cover normalization/quantities/nesting, immutable versions/no-op/migration reruns, unsafe reference rejection, consent/non-retroactivity/withdrawal, member removal, hidden scrim data, admin/member dataset equality, canonical conflict/mirror counting, weighted averages, missing context, stale/idempotent consolidation and discussion access. Integration checks also verify access-preview write blocking and HTTP payloads. Source New Recruit metadata is preserved; missing old unit/context data remains labelled unknown rather than fabricated.
