import type {
  Army,
  LibraryArmySummary,
  RosterComposition,
  State,
} from "@/lib/types";
import { decodeNewRecruitText } from "./newrecruit-text-decode";
import { archetypeId, archetypeName } from "./army-library-identity";
import { libraryUnitCounts } from "./army-library-norm";

// Bump when the decoder, classifier or unit-counting semantics change. Only
// patch IDs and system namespaces affect summaries; catalogue labels are
// already recorded in the immutable army snapshots.
const MAINTENANCE_VERSION = "army-summary-maintenance-v1";
function summaryRevision(state: State): string {
  return JSON.stringify([
    MAINTENANCE_VERSION,
    (state.patches || [])
      .map((patch) => [patch.id, patch.catalogue?.systemId ?? null])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  ]);
}

/** A persisted marker makes ordinary reads independent of roster size. */
export function ensureLibraryArmySummaries(state: State): boolean {
  return state.armySummaryRevision === summaryRevision(state)
    ? false
    : maintainLibraryArmySummaries(state);
}

/** Shared format decoders supply display evidence, never exact variations. */
export function textRosterSummary(listText: string): RosterComposition {
  try {
    return decodeNewRecruitText(listText).composition;
  } catch {
    // Existing manually recorded text remains readable even if it is not a
    // supported export. Strict text submissions validate through the decoder.
    return {
      status: "unavailable",
      normalizationVersion: "newrecruit-text-v2",
      selections: [],
      reasons: [
        "This recorded text could not be decoded as a New Recruit roster.",
      ],
      source: { provider: "newrecruit" },
    };
  }
}

/** Exactly the unit counting and configuration identity used by Army libraries. */
export function summarizeLibraryArmy(
  army: Army,
  patchId: string,
  state: Pick<State, "patches">,
): LibraryArmySummary {
  const composition =
    army.composition ||
    (army.listText ? textRosterSummary(army.listText) : undefined);
  return {
    version: "army-library-summary-v1",
    archetypeId: archetypeId(army, patchId, state),
    archetypeName: archetypeName(army),
    rosterStatus: composition?.status || "unavailable",
    units: libraryUnitCounts({ ...army, composition }),
  };
}

function* armyReferences(
  state: State,
  includeHistory = true,
): Generator<[Army | undefined, string | undefined]> {
  for (const row of state.savedArmies || []) yield [row.army, row.patchId];
  for (const row of state.armyVersions || []) yield [row.army, row.patchId];
  for (const row of state.matrixLists || []) yield [row.army, row.patchId];
  for (const row of state.libraryRosterImports || [])
    yield [row.army, row.patchId];
  if (!includeHistory) return;
  yield* historicalArmyReferences(state);
}

function* historicalArmyReferences(
  state: State,
): Generator<[Army | undefined, string | undefined]> {
  for (const row of state.matrixListHistory || [])
    yield [row.army, row.patchId];
  for (const game of state.games || []) {
    yield [game.own, game.patchId];
    yield [game.enemy, game.patchId];
  }
  for (const scrim of state.scrims || [])
    for (const team of scrim.teams)
      for (const entry of team.entries) yield [entry.army, scrim.patchId];
}

/** Commands replace changed army snapshots; retain references without visiting rosters. */
export function snapshotArmyReferences(
  state: State,
): ReadonlyMap<Army, string | undefined> {
  return new Map(
    [...armyReferences(state)].filter(
      (row): row is [Army, string | undefined] => !!row[0],
    ),
  );
}

export function maintainLibraryArmySummaries(
  state: State,
  previousSnapshots?: ReadonlyMap<Army, string | undefined>,
): boolean {
  let changed = false;
  const revision = summaryRevision(state);
  const refreshAll =
    state.armySummaryRevision !== revision || !previousSnapshots;
  // PostgreSQL jsonb can reorder keys. Derived metadata must remain idempotent
  // after storage so ordinary cloud reads do not become migration writes.
  const signature = (summary: LibraryArmySummary | undefined) =>
    summary &&
    JSON.stringify([
      summary.version,
      summary.archetypeId,
      summary.archetypeName,
      summary.rosterStatus,
      summary.units.map((unit) => [
        unit.sourceId,
        unit.name,
        unit.quantity,
        unit.quantityKnown,
        unit.modelCount,
        unit.modelSizes?.map((size) => [size.models, size.quantity]),
      ]),
    ]);
  const update = (
    army: Army | undefined,
    patchId: string | undefined,
    historical = false,
  ) => {
    if (!army || !patchId) return;
    if ((!refreshAll || historical) && previousSnapshots?.get(army) === patchId)
      return;
    const summary = summarizeLibraryArmy(army, patchId, state);
    if (signature(army.summary) !== signature(summary)) {
      army.summary = summary;
      changed = true;
    }
  };
  for (const [army, patchId] of armyReferences(state, false))
    update(army, patchId);
  // Existing journal/scrim/history snapshots remain frozen. Only newly written
  // snapshots receive derived metadata; a deployment does not enlarge history.
  if (previousSnapshots)
    for (const [army, patchId] of historicalArmyReferences(state))
      update(army, patchId, true);
  if (state.armySummaryRevision !== revision) {
    state.armySummaryRevision = revision;
    changed = true;
  }
  return changed;
}
