# Army libraries implementation report

Implemented locally on `codex/army-libraries`, 9 October 2026. The handoff and existing product guidance remain the scope boundary. Production data, infrastructure, credentials and deployment were not changed.

## Coordination and review increments

Agent 0 first established shared contracts and file ownership. Roster identity/import, analytics/query and UI packages then ran in parallel. The coordinator integrated version lifecycle, persistence adapters, game/scrim references and API registration. Dedicated discussions followed the visibility contracts; independent integration/HTTP/browser QA followed real endpoint integration.

| Increment | Commit | Scope |
| --- | --- | --- |
| Contracts | `582b5a0` | Shared domain/DTO contracts and ownership/privacy decisions |
| Foundation | `dd09bb6` | Immutable versions, additive migration, normalization/classification, consolidation |
| Shared library services | `8fe8f9e` | Authorized purpose-specific queries, analytics, discussions and API |
| UI and game capture | `830421c` | Existing workspace navigation, library screens, publication/consent and recorded game context |

Final hardening and validation are recorded in the subsequent commit. Adopted product defaults are in `product-design.md` section 18; precise contracts are in `army-library-contracts.md`.

## Implemented modules

- `src/server/army-library-versions.ts`: immutable saved-list snapshots, no-op detection, optimistic list revisions, idempotent legacy initialization, publication checks and submitted game-version/context validation.
- `src/server/newrecruit-army.ts` and `army-library-identity.ts`: bounded selected-roster parsing, nested quantities/loadouts/options, zero-selection exclusion, source namespaces, conservative completeness, canonical fingerprints, scoped archetypes/variations and admin preview/apply. Unknown quantities remain explicitly unknown. Apply can repair public derived memberships without modifying source lists or snapshots; stale previews fail inside the existing transaction boundary.
- `src/server/army-library.ts` and `src/lib/army-library-analytics.ts`: paginated authorized list/archetype/detail DTOs, weighted recorded-score statistics, canonical match/side handling, conflict exclusion, composable context filters, conservative uncertainty, observed trends, leading-variation eligibility and separated patch history. Compact rows omit full roster payloads. Related lists, variations, versions and discussions paginate at 20 records; authorized ancestors accompany discussion replies.
- `src/server/library-discussions.ts`: dedicated list/archetype/configuration-only targets, inherited contextual threads/replies, author edits/deletion and administrator moderation. Current target, author membership, context and ancestor visibility are checked on every operation.
- `src/app/api/army-library/route.ts`: authenticated, no-store, purpose-specific GET queries, admin consolidation previews and owner-only version-publication metadata. Writes use the existing state command endpoint, origin checks, sessions, access-preview block and atomic persistence.
- `src/components/army-libraries.tsx` and scoped CSS: list/archetype tabs, search/configuration/result filters, sorting/pagination, restored navigation/detail sections, source drawer, numeric trends, published history, exact known roster differences, discussions and consolidation. Existing page/panel/tab/field/modal/disposition controls and visual tokens are reused.
- `workspace.tsx`, `my-armies.tsx`, `journal.tsx`, `scrim-report.tsx`, `game-context-fields.tsx` and `src/server/scrims.ts`: menu integration, prior-version publication, explicit per-game consent, immutable version selection and actual recorded mission/deployment context. Mobile More inherits Army libraries without replacing primary destinations. Shared scrim context is canonical to side A and mirrored correctly to each player's journal; corrections retain independent contribution consent.
- The existing `.army-summary` style receives only `min-width: 0` and `overflow-wrap: anywhere`, fixing an observed 320px journal-dialog overflow with an unbroken long saved-list name. Existing tokens and presentation remain intact.

## Migration and authorization

Both SQLite and cloud document adapters invoke the same additive initializer. Each existing saved army receives one initial `${listId}:v1` snapshot from known saved data. Initialization is idempotent and retains existing lists, users, sessions and journals. It does not infer earlier versions, fetch current external content for historical games, or guess historical variation links. Existing sharing initializes only the current known version's publication; it grants no game contribution consent.

`Army.revision` retains its catalogue meaning. Configuration/composition/ruleset changes create new list versions; name/source-link changes retain historical labels and expose the current external source separately. Ownership and original list IDs never merge. Known complete rosters alone deduplicate into variations; partial/unavailable compositions remain separately unclassified.

The shared dataset is identical for admins and members. It excludes raw private journals, reflections, opponent identities, evaluations, internal messages, hidden scrim facts and raw version/membership/discussion collections from `/api/state`. Own-perspective consent is separate from roster publication. Advanced opponent dimensions require independent public visibility. Unsharing clears historical publication; re-sharing exposes only the current version. Consent withdrawal, list deletion, version withdrawal and membership removal immediately affect shared metrics, counts, facets, context and discussions because no cross-permission cache is used.

## Validation

| Check | Final result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run build` | Passed, including TypeScript validation |
| `npm test` | 126 passed, 0 failed |
| `npm run test:http` | 52 passed, 0 failed |
| `git diff --check` | Passed; Windows newline conversion notices only |
| Browser/visual checks | Passed in Chromium at 1440×1000, 390×1000 and 320×1000; 23 captured states, no page errors or horizontal overflow |

Tests use isolated temporary SQLite databases or in-memory fixtures. Required coverage includes private-ID guesses, same admin/member shared output, publication versus consent, withdrawal/re-sharing, contextual discussion revocation, stale edits/previews, migration reruns, source history preservation, mirror/conflict counting, weighted samples, hidden scrim facts, absent context and read-only access preview. Additional tests cover side-specific scrim context, unknown quantities, paginated reply ancestry and derived-membership repair.

Browser QA compared My armies, Player profile and Matchup matrix with the library list, archetype and history screens at all three sizes. It exercised keyboard Enter detail activation, selected-detail/search/ruleset restoration after reload, mobile More, empty search, an injected HTTP 500 with Retry recovery, earlier published-version selection, and long army names. The journal form persisted both selected immutable version IDs; contribution consent initially remained off and saved only after explicit selection. The repaired 320px journal dialog measured 284px for both client and scroll width. QA ran with reduced motion enabled. Chromium screenshots were visually inspected; this is not a full assistive-technology or physical-device audit.

Local evidence and reproducer are preserved in [browser-evidence.json](../.local/army-library-browser-qa-2026-10-09/browser-evidence.json) and its sibling screenshots. The isolated QA server was stopped and scratch SQLite files removed. The user's `.local/team-sweden.sqlite` was untouched.

## Representative payload measurements

Local in-memory fixture: 200 public lists, 1,000 recorded games, 50 roster selections per list. A 20-list page measured 15,990 bytes and 12.2 ms; first-page archetype detail measured 419,537 bytes and 40.2 ms. The comparable existing authorized state-shaped response measured 4,761,824 bytes. These are representative local measurements, not hosted latency guarantees; related pagination and compact payloads avoid sending all state to the client.

## Remaining limits

- Missing historical roster/context data stays unknown; it cannot support exact variation attribution.
- Unsupported New Recruit selection associations and ambiguous catalogue provenance remain partial. Live external import availability was not exercised; parser/network failure behavior was tested with fixtures.
- Unknown edition/battle-size metadata keeps classification in explicit patch-scoped cohorts. Cross-patch/source-ID continuity needs verified trusted mapping metadata; this release does not infer it from names or URLs.
- Observational metrics and conservative intervals cannot remove player skill, opponent selection or event concentration effects. Thin evidence remains uncertain; equal/indistinguishable leaders remain labelled honestly.
- Live Supabase persistence/deployment was not tested or changed. The existing cloud document commit boundary is preserved; local migration and document-shape behavior are tested. There is no new SQL schema or infrastructure migration.
