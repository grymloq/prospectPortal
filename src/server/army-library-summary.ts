import type {
  Army,
  LibraryArmySummary,
  RosterComposition,
  State,
} from "@/lib/types";
import { decodeNewRecruitText } from "./newrecruit-text-decode";
import { archetypeId, archetypeName } from "./army-library-identity";
import { libraryUnitCounts } from "./army-library-norm";

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

/** Additive derived metadata across creation paths; no roster or history is rewritten. */
export function snapshotArmyReferences(state: State): Set<Army> {
  return new Set([
    ...(state.games || []).flatMap((game) => [game.own, game.enemy]),
    ...(state.matrixListHistory || []).map((row) => row.army),
    ...(state.scrims || []).flatMap((scrim) =>
      scrim.teams.flatMap((team) =>
        team.entries.flatMap((entry) => (entry.army ? [entry.army] : [])),
      ),
    ),
  ]);
}

export function maintainLibraryArmySummaries(
  state: State,
  previousSnapshots?: ReadonlySet<Army>,
): boolean {
  let changed = false;
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
  const update = (army: Army | undefined, patchId: string | undefined) => {
    if (!army || !patchId) return;
    const summary = summarizeLibraryArmy(army, patchId, state);
    if (signature(army.summary) !== signature(summary)) {
      army.summary = summary;
      changed = true;
    }
  };
  for (const row of state.savedArmies || []) update(row.army, row.patchId);
  for (const row of state.armyVersions || []) update(row.army, row.patchId);
  for (const row of state.matrixLists || []) update(row.army, row.patchId);
  for (const row of state.libraryRosterImports || [])
    update(row.army, row.patchId);
  if (previousSnapshots) {
    const updateNew = (army: Army | undefined, patchId: string | undefined) => {
      if (army && !previousSnapshots.has(army)) update(army, patchId);
    };
    for (const row of state.matrixListHistory || [])
      updateNew(row.army, row.patchId);
    for (const game of state.games || []) {
      updateNew(game.own, game.patchId);
      updateNew(game.enemy, game.patchId);
    }
    for (const scrim of state.scrims || [])
      for (const team of scrim.teams)
        for (const entry of team.entries) updateNew(entry.army, scrim.patchId);
  }
  return changed;
}
