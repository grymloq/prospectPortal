import { createHash } from "node:crypto";
import type { Catalogue } from "@/lib/catalogue";
import { armyKey } from "@/lib/matchups";
import type {
  Army,
  LibraryRosterImport,
  LibraryRosterSourceKind,
  MatrixList,
  State,
  User,
} from "@/lib/types";
import {
  canonicalRoster,
  maintainLibraryMemberships,
} from "./army-library-identity";
import { updateArmyVersion } from "./army-library-versions";
import { fetchNewRecruitArmy, newRecruitListUrl } from "./newrecruit-army";
import { rosterAttachmentSignature } from "@/lib/roster-display";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type LibraryRosterSource = {
  sourceKey: string;
  sourceRevision: string;
  sourceKind: LibraryRosterSourceKind;
  patchId: string;
  sourceUrl: string;
  army: Army;
};

/** Inventory is private administrative maintenance data, never a public DTO. */
export function inventoryLibraryRosterSources(
  state: State,
): LibraryRosterSource[] {
  const sources: LibraryRosterSource[] = [];
  const rulesetRevisions = new Map(
    (state.patches || []).map((patch) => [
      patch.id,
      hash([patch.catalogue, patch.source]),
    ]),
  );
  function add(
    sourceKind: LibraryRosterSourceKind,
    id: string,
    patchId: string | undefined,
    army: Army | undefined,
    provenance: unknown,
  ) {
    if (!army?.listUrl.trim()) return;
    const sourceKey = `${sourceKind}:${id}`;
    sources.push({
      sourceKind,
      sourceKey,
      patchId: patchId || "",
      sourceUrl: army.listUrl,
      sourceRevision: hash([
        sourceKey,
        patchId || "",
        rulesetRevisions.get(patchId || ""),
        army,
        provenance,
      ]),
      army: structuredClone(army),
    });
  }
  const owner = (id: string) => {
    const user = state.users.find((row) => row.id === id);
    return (
      user && [
        user.id,
        user.confirmedMember,
        user.removedAt,
        user.accountDeletedAt,
      ]
    );
  };
  for (const row of state.savedArmies || [])
    add("saved", row.id, row.patchId, row.army, [
      row.userId,
      row.shared,
      row.listRevision,
      row.currentVersionId,
      owner(row.userId),
    ]);
  for (const row of state.matrixLists || [])
    add("matrix", row.id, row.patchId, row.army, [
      row.userId,
      row.updatedAt,
      owner(row.userId),
    ]);
  for (const row of state.armyVersions || [])
    add("version", row.id, row.patchId, row.army, [
      row.listId,
      row.userId,
      row.published,
      owner(row.userId),
    ]);
  for (const row of state.games) {
    add("journal-own", row.id, row.patchId, row.own, [
      row.userId,
      row.updatedAt,
      owner(row.userId),
    ]);
    add("journal-enemy", row.id, row.patchId, row.enemy, [
      row.userId,
      row.updatedAt,
      owner(row.userId),
    ]);
  }
  for (const scrim of state.scrims || [])
    for (const team of scrim.teams)
      for (const entry of team.entries)
        add(
          "scrim",
          `${scrim.id}:${team.id}:${entry.id}`,
          scrim.patchId,
          entry.army,
          [
            scrim.revision,
            team.finalizedAt,
            entry.userId,
            entry.savedArmyId,
            entry.listVersionId,
          ],
        );
  (state.matrixListHistory || []).forEach((row, index) =>
    add("matrix-history", String(index), row.patchId, row.army, [
      row.authorName,
      row.updatedAt,
    ]),
  );
  return sources;
}

export type LibraryRosterFetcher = (
  url: string,
  rules: Catalogue,
) => Promise<Army>;

/** Fetch outside transactions, sharing one bounded request per URL and ruleset. */
export async function importLibraryRosters(
  state: State,
  fetcher: LibraryRosterFetcher = fetchNewRecruitArmy,
  options: { offset?: number; limit?: number } = {},
): Promise<{
  results: LibraryRosterImport[];
  remaining: number;
  totalSources: number;
  uniqueSources: number;
  nextOffset?: number;
}> {
  const offset = Math.max(0, Math.floor(options.offset || 0));
  const limit = Math.max(1, Math.min(20, Math.floor(options.limit || 20)));
  const sources = inventoryLibraryRosterSources(state);
  const results: LibraryRosterImport[] = [];
  const jobs = new Map<
    string,
    { url: string; rules: Catalogue; sources: LibraryRosterSource[] }
  >();
  const record = (
    source: LibraryRosterSource,
    status: LibraryRosterImport["status"],
    army?: Army,
    error?: string,
  ): LibraryRosterImport => ({
    id: `roster-import-${hash([source.sourceKey, source.sourceRevision])}`,
    sourceKey: source.sourceKey,
    sourceRevision: source.sourceRevision,
    sourceKind: source.sourceKind,
    patchId: source.patchId,
    sourceUrl: source.sourceUrl,
    importedAt: new Date().toISOString(),
    status,
    ...(army ? { army: structuredClone(army) } : {}),
    ...(error ? { error: error.slice(0, 300) } : {}),
  });
  for (const source of sources) {
    const rules = state.patches?.find(
      (row) => row.id === source.patchId,
    )?.catalogue;
    if (!rules) {
      if (!offset)
        results.push(
          record(
            source,
            "unsupported",
            undefined,
            "The stored ruleset has no source catalogue; its historical ruleset cannot be inferred.",
          ),
        );
      continue;
    }
    let url: string;
    try {
      url = newRecruitListUrl(source.sourceUrl).url;
    } catch {
      if (!offset)
        results.push(
          record(
            source,
            "unsupported",
            undefined,
            "This source is not a supported New Recruit shared-list link.",
          ),
        );
      continue;
    }
    const key = JSON.stringify([url, source.patchId]);
    const job = jobs.get(key) || { url, rules, sources: [] };
    job.sources.push(source);
    jobs.set(key, job);
  }
  const allJobs = [...jobs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, job]) => job);
  const queue = allJobs.slice(offset, offset + limit);
  let next = 0;
  async function worker() {
    while (next < queue.length) {
      const job = queue[next++];
      try {
        const army = await fetcher(job.url, job.rules);
        if (army.composition?.source.systemId !== String(job.rules.systemId))
          throw new Error(
            "The imported roster does not match the stored game system.",
          );
        for (const source of job.sources)
          results.push(
            record(source, army.composition?.status || "unavailable", army),
          );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The external source could not be imported.";
        for (const source of job.sources)
          results.push(record(source, "failed", undefined, message));
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, () => worker()),
  );
  const nextOffset = offset + queue.length;
  return {
    results: results.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
    remaining: Math.max(0, allJobs.length - nextOffset),
    totalSources: sources.length,
    uniqueSources: allJobs.length,
    ...(nextOffset < allJobs.length ? { nextOffset } : {}),
  };
}

export type LibraryRosterImportReport = {
  fetched: number;
  updated: number;
  skipped: number;
  failed: number;
  complete: number;
  partial: number;
  unavailable: number;
  unsupported: number;
  sources: {
    sourceKey: string;
    sourceKind: LibraryRosterSourceKind;
    patchId: string;
    sourceUrl: string;
    status: LibraryRosterImport["status"] | "stale" | "configuration-changed";
    updated: boolean;
    error?: string;
  }[];
};

function requireAdmin(state: State, actor: User) {
  const user = state.users.find((row) => row.id === actor.id);
  if (
    !user ||
    user.role !== "admin" ||
    !user.confirmedMember ||
    user.removedAt ||
    user.accountDeletedAt
  )
    throw new Error("Administrator access required.");
}
function compositionContent(army: Army) {
  const composition = army.composition;
  return (
    composition &&
    JSON.stringify([
      composition.status,
      composition.normalizationVersion,
      composition.source.provider,
      composition.source.systemId,
      composition.source.catalogueId,
      composition.source.catalogueRevision,
      canonicalRoster(composition),
      rosterAttachmentSignature(composition),
      composition.reasons,
    ])
  );
}

/** Apply inside the existing atomic state transaction; recheck every occurrence. */
export function applyLibraryRosterImports(
  state: State,
  actor: User,
  results: LibraryRosterImport[],
): LibraryRosterImportReport {
  requireAdmin(state, actor);
  const current = new Map(
    inventoryLibraryRosterSources(state).map((row) => [row.sourceKey, row]),
  );
  const report: LibraryRosterImportReport = {
    fetched: results.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    complete: 0,
    partial: 0,
    unavailable: 0,
    unsupported: 0,
    sources: [],
  };
  state.libraryRosterImports ||= [];
  for (const result of results) {
    const source = current.get(result.sourceKey);
    const detail: LibraryRosterImportReport["sources"][number] = {
      sourceKey: result.sourceKey,
      sourceKind: result.sourceKind,
      patchId: result.patchId,
      sourceUrl: result.sourceUrl,
      status: result.status,
      updated: false,
      ...(result.error ? { error: result.error } : {}),
    };
    report.sources.push(detail);
    if (
      !source ||
      source.sourceRevision !== result.sourceRevision ||
      source.patchId !== result.patchId ||
      source.sourceKind !== result.sourceKind ||
      source.sourceUrl !== result.sourceUrl
    ) {
      report.skipped++;
      detail.status = "stale";
      continue;
    }
    report[result.status]++;
    const priorIndex = state.libraryRosterImports.findIndex(
      (row) => row.id === result.id,
    );
    const previous = state.libraryRosterImports[priorIndex];
    // Retain the last verified retrieval after a temporary source failure. Its
    // composition provenance retains the actual successful retrieval timestamp.
    const stored = structuredClone(result);
    if (!stored.army && previous?.army)
      stored.army = structuredClone(previous.army);
    if (priorIndex < 0) state.libraryRosterImports.push(stored);
    else state.libraryRosterImports[priorIndex] = stored;
    if (
      !result.army ||
      !result.army.composition ||
      result.army.composition.status === "unavailable"
    ) {
      report.skipped++;
      continue;
    }
    if (
      armyKey(source.army) !== armyKey(result.army) ||
      (source.army.scope?.systemId &&
        source.army.scope.systemId !== result.army.composition.source.systemId)
    ) {
      report.skipped++;
      detail.status = "configuration-changed";
      detail.error =
        "The current external list has a different configuration. The stored snapshot was preserved.";
      continue;
    }
    if (source.sourceKind !== "saved") continue;
    const saved = state.savedArmies!.find(
      (row) => `saved:${row.id}` === source.sourceKey,
    )!;
    if (
      saved.army.composition?.status === "complete" &&
      result.army.composition.status !== "complete"
    ) {
      report.skipped++;
      detail.error =
        "An incomplete retrieval did not replace the existing complete roster.";
      continue;
    }
    if (
      compositionContent(saved.army) === compositionContent(result.army) &&
      saved.army.scope?.systemId === result.army.composition.source.systemId
    )
      continue;
    // Names, source link, catalogue configuration and established scope belong
    // to the saved list. Importing never adds guessed edition/battle-size scope.
    const army = {
      ...saved.army,
      scope: {
        ...saved.army.scope,
        systemId: result.army.composition.source.systemId,
      },
      composition: structuredClone(result.army.composition),
    };
    updateArmyVersion(
      state,
      saved,
      army,
      saved.patchId,
      result.importedAt,
      saved.listRevision,
    );
    maintainLibraryMemberships(state, [saved.id]);
    report.updated++;
    detail.updated = true;
  }
  return report;
}

/** Current public matrix callers must authorize the matrix independently. */
export function importedMatrixArmy(state: State, matrix: MatrixList): Army {
  const configuration = { ...matrix.army };
  delete configuration.composition;
  const source = inventoryLibraryRosterSources({
    ...state,
    patches: state.patches?.filter((patch) => patch.id === matrix.patchId),
    savedArmies: [],
    armyVersions: [],
    games: [],
    scrims: [],
    matrixListHistory: [],
    matrixLists: [matrix],
  })[0];
  if (!source) return configuration;
  const imported = state.libraryRosterImports?.find(
    (row) =>
      row.sourceKey === source.sourceKey &&
      row.sourceRevision === source.sourceRevision &&
      row.army?.composition &&
      row.army.composition.source.systemId ===
        String(
          state.patches?.find((patch) => patch.id === matrix.patchId)?.catalogue
            ?.systemId,
        ) &&
      (!matrix.army.scope?.systemId ||
        matrix.army.scope.systemId === row.army.composition.source.systemId) &&
      armyKey(row.army) === armyKey(matrix.army),
  );
  return imported?.army
    ? {
        ...matrix.army,
        composition: structuredClone(imported.army.composition),
      }
    : configuration;
}
