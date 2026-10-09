import { randomUUID } from "node:crypto";
import type {
  Army,
  ArmyListVersion,
  LibraryArchetypeStandard,
  LibraryNormComparison,
  LibraryNormSummary,
  LibraryUnitCount,
  RosterSelection,
  State,
  User,
} from "@/lib/types";
import {
  archetypeId,
  libraryIdentityAliases,
  variationId,
} from "./army-library-identity";

export type PublicRosterVersion = {
  version: ArmyListVersion;
  archetypeId: string;
  variationId?: string;
};
const active = (user: User | undefined): user is User =>
  !!user &&
  user.confirmedMember === true &&
  !user.removedAt &&
  !user.accountDeletedAt;
const key = (archetype: string, patch: string) =>
  JSON.stringify([archetype, patch]);

/** Count selected parent units once; nested models/equipment are not extra units. */
export function libraryUnitCounts(army: Army): LibraryUnitCount[] {
  const units = new Map<string, LibraryUnitCount>();
  let visited = 0;
  function models(nodes: RosterSelection[], depth: number): number | undefined {
    let total = 0,
      found = false,
      known = true;
    function walkModels(children: RosterSelection[], level: number) {
      if (level > 40) {
        known = false;
        return;
      }
      for (const node of children) {
        if (++visited > 20000) {
          known = false;
          return;
        }
        if (!node.quantity) continue;
        if (node.kind === "model") {
          found = true;
          if (node.quantityKnown === false) known = false;
          else total += node.quantity;
        } else walkModels(node.selections, level + 1);
      }
    }
    walkModels(nodes, depth);
    return found && known ? total : undefined;
  }
  function walk(nodes: RosterSelection[], depth = 0) {
    if (depth > 40) return;
    for (const node of nodes) {
      if (++visited > 20000) return;
      if (!node.quantity) continue;
      if (node.kind !== "unit") {
        walk(node.selections, depth + 1);
        continue;
      }
      const previous = units.get(node.sourceId);
      const modelCount = models(node.selections, depth + 1);
      units.set(node.sourceId, {
        sourceId: node.sourceId,
        name:
          previous && previous.name.localeCompare(node.name) < 0
            ? previous.name
            : node.name,
        quantity: (previous?.quantity || 0) + node.quantity,
        ...(node.quantityKnown === false || previous?.quantityKnown === false
          ? { quantityKnown: false }
          : {}),
        ...(modelCount === undefined ||
        (previous && previous.modelCount === undefined)
          ? {}
          : {
              modelCount:
                (previous?.modelCount || 0) + modelCount * node.quantity,
            }),
      });
    }
  }
  walk(army.composition?.selections || []);
  return [...units.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.sourceId.localeCompare(b.sourceId),
  );
}

/** Same publication gates as shared library queries; admin visibility adds no private candidates. */
export function publicNormVersions(state: State): PublicRosterVersion[] {
  const users = new Map(state.users.map((user) => [user.id, user]));
  const lists = new Map(
    (state.savedArmies || [])
      .filter((list) => list.shared && active(users.get(list.userId)))
      .map((list) => [list.id, list]),
  );
  const memberships = new Map(
    (state.libraryMemberships || []).map((membership) => [
      membership.versionId,
      membership,
    ]),
  );
  const aliases = libraryIdentityAliases(state);
  return (state.armyVersions || []).flatMap((version) => {
    if (
      !version.published ||
      lists.get(version.listId)?.userId !== version.userId
    )
      return [];
    const member = memberships.get(version.id);
    const classified =
      member?.listId === version.listId && member.patchId === version.patchId
        ? member.archetypeId
        : archetypeId(version.army, version.patchId, state);
    return [
      {
        version,
        archetypeId: aliases.archetypes.get(classified) || classified,
        variationId: variationId(version.army, version.patchId, state),
      },
    ];
  });
}

export function createLibraryNorms(
  state: State,
  actor: User,
  candidates: Iterable<PublicRosterVersion>,
) {
  if (!active(state.users.find((user) => user.id === actor.id)))
    throw new Error("Confirmed membership required.");
  const sources = [...candidates];
  const aliases = libraryIdentityAliases(state);
  const canonical = (id: string) => aliases.archetypes.get(id) || id;
  const records = new Map<
    string,
    NonNullable<State["libraryDefaults"]>[number]
  >();
  for (const record of [...(state.libraryDefaults || [])].sort(
    (a, b) =>
      a.updatedAt.localeCompare(b.updatedAt) ||
      a.revision - b.revision ||
      a.archetypeId.localeCompare(b.archetypeId),
  ))
    records.set(key(canonical(record.archetypeId), record.patchId), record);
  const representatives = new Map<string, PublicRosterVersion>();
  for (const candidate of sources) {
    const cohort = key(
      canonical(candidate.archetypeId),
      candidate.version.patchId,
    );
    const id = JSON.stringify([cohort, candidate.version.listId]);
    const previous = representatives.get(id);
    if (
      !previous ||
      candidate.version.number > previous.version.number ||
      (candidate.version.number === previous.version.number &&
        candidate.version.id.localeCompare(previous.version.id) < 0)
    )
      representatives.set(id, candidate);
  }
  const groups = new Map<string, Map<string, PublicRosterVersion[]>>();
  for (const candidate of representatives.values()) {
    const exact = variationId(
      candidate.version.army,
      candidate.version.patchId,
      state,
    );
    if (!exact) continue;
    const cohort = key(
      canonical(candidate.archetypeId),
      candidate.version.patchId,
    );
    const variants =
      groups.get(cohort) || new Map<string, PublicRosterVersion[]>();
    variants.set(exact, [...(variants.get(exact) || []), candidate]);
    groups.set(cohort, variants);
  }
  const standards = new Map<string, LibraryArchetypeStandard>();
  const cohorts = new Set([...groups.keys(), ...records.keys()]);
  for (const cohort of cohorts) {
    const record = records.get(cohort);
    const variants = groups.get(cohort);
    const pinned =
      record?.versionId &&
      sources.find(
        (candidate) =>
          candidate.version.id === record.versionId &&
          key(canonical(candidate.archetypeId), candidate.version.patchId) ===
            cohort &&
          variationId(candidate.version.army, candidate.version.patchId, state),
      );
    const winner =
      variants &&
      [...variants].sort(
        ([a, aa], [b, bb]) => bb.length - aa.length || a.localeCompare(b),
      )[0];
    const representative =
      pinned ||
      winner?.[1]
        .slice()
        .sort(
          (a, b) =>
            a.version.listId.localeCompare(b.version.listId) ||
            a.version.id.localeCompare(b.version.id),
        )[0];
    if (!representative) continue;
    const version = representative.version;
    const exact = variationId(version.army, version.patchId, state)!;
    const list = state.savedArmies?.find(
      (entry) => entry.id === version.listId,
    );
    standards.set(cohort, {
      archetypeId: canonical(representative.archetypeId),
      patchId: version.patchId,
      listId: version.listId,
      versionId: version.id,
      name:
        list?.army.listName ||
        version.army.listName ||
        version.army.factionName,
      ownerName:
        state.users.find((user) => user.id === version.userId)?.name || "",
      variationId: exact,
      repetitions: variants?.get(exact)?.length || 0,
      selection: pinned ? "marked" : "most-repeated",
      defaultRevision: record?.revision || 0,
      units: libraryUnitCounts(version.army),
    });
  }
  const revision = (archetype: string, patch: string) =>
    records.get(key(canonical(archetype), patch))?.revision || 0;
  const standard = (archetype: string, patch: string) =>
    standards.get(key(canonical(archetype), patch));
  function compare(
    army: Army,
    archetype: string,
    patch: string,
  ): LibraryNormComparison {
    const baseline = standard(archetype, patch);
    const units = libraryUnitCounts(army);
    const exact = variationId(army, patch, state);
    if (!army.composition || army.composition.status === "unavailable")
      return {
        status: "unavailable",
        standard: baseline,
        units,
        deviations: [],
      };
    if (!exact)
      return { status: "partial", standard: baseline, units, deviations: [] };
    if (!baseline) return { status: "no-standard", units, deviations: [] };
    const current = new Map(units.map((unit) => [unit.sourceId, unit]));
    const previous = new Map(
      baseline.units.map((unit) => [unit.sourceId, unit]),
    );
    const deviations = [...new Set([...current.keys(), ...previous.keys()])]
      .flatMap((sourceId) => {
        const list = current.get(sourceId),
          base = previous.get(sourceId);
        const baselineQuantity = base?.quantity || 0,
          listQuantity = list?.quantity || 0;
        const modelsChanged =
          base?.modelCount !== undefined &&
          list?.modelCount !== undefined &&
          base.modelCount !== list.modelCount;
        if (baselineQuantity === listQuantity && !modelsChanged) return [];
        return [
          {
            sourceId,
            name: list?.name || base!.name,
            baselineQuantity,
            listQuantity,
            delta: listQuantity - baselineQuantity,
            baselineModels: base?.modelCount,
            listModels: list?.modelCount,
          },
        ];
      })
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name) || a.sourceId.localeCompare(b.sourceId),
      );
    const compositionMatches = exact === baseline.variationId;
    return {
      status: deviations.length ? "different" : "same",
      standard: baseline,
      units,
      deviations,
      compositionMatches,
    };
  }
  function summary(
    army: Army,
    archetype: string,
    patch: string,
    versionId?: string,
    saved = true,
  ): LibraryNormSummary {
    const comparison = compare(army, archetype, patch);
    return {
      status: comparison.status,
      baselineName: comparison.standard?.name,
      addedUnits: comparison.deviations.reduce(
        (sum, unit) => sum + Math.max(0, unit.delta),
        0,
      ),
      removedUnits: comparison.deviations.reduce(
        (sum, unit) => sum + Math.max(0, -unit.delta),
        0,
      ),
      changedUnits: comparison.deviations.length,
      deviations: comparison.deviations,
      isDefault:
        !!versionId &&
        comparison.standard?.selection === "marked" &&
        comparison.standard.versionId === versionId,
      canSetDefault: saved && !!versionId && !!variationId(army, patch, state),
      defaultRevision: revision(archetype, patch),
      compositionMatches: comparison.compositionMatches,
    };
  }
  return { standard, compare, summary, revision };
}

/** Run inside the existing atomic state transaction; a clear remains a revision tombstone. */
export function setLibraryArchetypeDefault(
  state: State,
  actor: User,
  command: {
    archetypeId: string;
    patchId: string;
    versionId?: string;
    expectedRevision: number;
  },
) {
  const currentActor = state.users.find((user) => user.id === actor.id);
  if (!active(currentActor) || currentActor.role !== "admin")
    throw new Error("Administrator access required.");
  if (command.patchId === "all")
    throw new Error("Choose one ruleset for an archetype default.");
  const sources = publicNormVersions(state);
  const aliases = libraryIdentityAliases(state);
  const canonical =
    aliases.archetypes.get(command.archetypeId) || command.archetypeId;
  const norms = createLibraryNorms(state, actor, sources);
  if (
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision !== norms.revision(canonical, command.patchId)
  )
    throw new Error("Archetype default changed. Reload and try again.");
  const eligible = sources.filter(
    (source) =>
      source.archetypeId === canonical &&
      source.version.patchId === command.patchId,
  );
  if (
    !eligible.length ||
    (command.versionId &&
      !eligible.some(
        (source) =>
          source.version.id === command.versionId &&
          variationId(source.version.army, command.patchId, state),
      ))
  )
    throw new Error(
      "Published complete list version required for this archetype and ruleset.",
    );
  state.libraryDefaults = [
    ...(state.libraryDefaults || []).filter(
      (record) =>
        (aliases.archetypes.get(record.archetypeId) || record.archetypeId) !==
          canonical || record.patchId !== command.patchId,
    ),
    {
      archetypeId: canonical,
      patchId: command.patchId,
      versionId: command.versionId,
      revision: command.expectedRevision + 1,
      updatedBy: actor.id,
      updatedAt: new Date().toISOString(),
    },
  ];
  state.audit.unshift({
    id: randomUUID(),
    actor: currentActor.name,
    text: `${command.versionId ? "Set" : "Cleared"} archetype standard for ruleset ${command.patchId}.`,
    createdAt: new Date().toISOString(),
  });
}
