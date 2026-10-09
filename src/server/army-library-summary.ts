import type {
  Army,
  LibraryArmySummary,
  RosterComposition,
  RosterSelection,
  State,
} from "@/lib/types";
import { createHash } from "node:crypto";
import { archetypeId, archetypeName } from "./army-library-identity";
import { libraryUnitCounts } from "./army-library-norm";

/** Display evidence only. Text labels never become verified catalogue identities. */
export function textRosterSummary(listText: string): RosterComposition {
  const selections: RosterSelection[] = [];
  let inRoster = false;
  for (const raw of listText
    .slice(0, 100000)
    .replace(/\r\n?/g, "\n")
    .split("\n")) {
    const line = raw.trim().replace(/[*`]/g, "");
    if (
      /^(?:#+\s*)?(?:characters?|battleline|dedicated transports|other datasheets|allied units|infantry|vehicles|monsters|attached units)(?:\s*[\[(].*)?$/i.test(
        line,
      )
    ) {
      inRoster = true;
      continue;
    }
    // GW/NR root units carry points; WTC identifies CharN/UnitN explicitly.
    // Indented equipment/model entries and header totals are never parent units.
    const wtc =
      /^(?:char|unit)\d+\s*:\s*(?:(\d+)\s*x\s*)?(.+?)\s*(?:\([\d,]+\s*(?:points?|pts)\)|\[[\d,]+\s*(?:points?|pts)\])/i.exec(
        line,
      );
    const root =
      !/^\s/.test(raw) && inRoster
        ? /^(?:-\s*)?(?:(\d+)\s*x\s*)?(.+?)\s*(?:\([\d,]+\s*(?:points?|pts)\)|\[[\d,]+\s*(?:points?|pts)\])/i.exec(
            line,
          )
        : null;
    const match = wtc || root;
    if (!match) continue;
    const name = match[2].trim().replace(/:\s*$/, "");
    if (
      !name ||
      name.length > 300 ||
      /^(?:exported with|attached unit\s*\d|total|configuration)\b/i.test(name)
    )
      continue;
    // Multipliers may describe models or repeated units. Keep them unknown
    // rather than turning a model count into an invented unit count.
    selections.push({
      sourceId: `newrecruit:text:${createHash("sha256").update(name.toLowerCase()).digest("hex")}`,
      name,
      kind: "unit",
      quantity: 1,
      ...(Number(match[1]) > 1 ? { quantityKnown: false } : {}),
      selections: [],
    });
    if (selections.length >= 500) break;
  }
  return {
    status: selections.length ? "partial" : "unavailable",
    normalizationVersion: "newrecruit-text-summary-v1",
    selections,
    reasons: [
      "Text export unit labels are display evidence; catalogue IDs, model counts and loadouts are not verified.",
    ],
    source: { provider: "newrecruit" },
  };
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
