import { createHash } from "node:crypto";
import { armyKey } from "@/lib/matchups";
import type {
  Army,
  ArmyListVersion,
  ConsolidationPreview,
  LibraryMembership,
  RosterComposition,
  RosterSelection,
  State,
  User,
} from "@/lib/types";

export const ROSTER_NORMALIZATION_VERSION = "newrecruit-selected-v1";
export const LIBRARY_CLASSIFICATION_VERSION = "army-library-v1";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Names and point costs intentionally never enter composition identity. */
export function canonicalRoster(composition: RosterComposition): string {
  let count = 0;
  function selections(input: RosterSelection[], depth = 0): unknown[] {
    if (depth > 40 || !Array.isArray(input))
      throw new Error("Invalid normalized roster.");
    const merged = new Map<string, { identity: unknown[]; quantity: number }>();
    for (const selection of input) {
      if (
        ++count > 20000 ||
        !selection ||
        typeof selection.sourceId !== "string" ||
        !selection.sourceId.startsWith("newrecruit:") ||
        !Number.isSafeInteger(selection.quantity) ||
        selection.quantity < 0 ||
        selection.quantity > 10000
      )
        throw new Error("Invalid normalized roster.");
      if (!selection.quantity) continue;
      const identity = [
        selection.sourceId,
        selection.kind,
        selections(selection.selections, depth + 1),
      ];
      const key = JSON.stringify(identity);
      const previous = merged.get(key);
      merged.set(key, {
        identity,
        quantity: (previous?.quantity || 0) + selection.quantity,
      });
    }
    return [...merged.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, entry]) => [...entry.identity, entry.quantity]);
  }
  return JSON.stringify([
    composition.normalizationVersion,
    composition.source.provider,
    composition.source.systemId || "UNKNOWN",
    composition.source.catalogueId || "UNKNOWN",
    selections(composition.selections),
  ]);
}

export function rosterFingerprint(composition: RosterComposition): string {
  return createHash("sha256")
    .update(canonicalRoster(composition))
    .digest("hex");
}

export function normalizeRosterIdentity(
  composition: RosterComposition,
): RosterComposition {
  const result = structuredClone(composition);
  delete result.canonical;
  delete result.fingerprint;
  if (result.status === "complete") {
    result.canonical = canonicalRoster(result);
    result.fingerprint = rosterFingerprint(result);
  }
  return result;
}

export function archetypeId(army: Army, patchId: string): string {
  const scope = army.scope;
  const continuity =
    scope?.systemId && scope.edition && scope.battleSize && scope.continuityKey
      ? ["verified", scope.continuityKey]
      : ["ruleset", patchId];
  return `archetype-v1-${hash([scope?.systemId || "UNKNOWN", scope?.edition || "UNKNOWN", scope?.battleSize || "UNKNOWN", continuity, armyKey({ ...army, detachments: [...new Set(army.detachments)] })])}`;
}

export function variationId(army: Army, patchId: string): string | undefined {
  const composition = army.composition;
  if (
    !composition ||
    composition.status !== "complete" ||
    composition.normalizationVersion !== ROSTER_NORMALIZATION_VERSION ||
    !composition.selections.length ||
    !composition.source.systemId ||
    !composition.source.catalogueId
  )
    return undefined;
  try {
    const fingerprint = rosterFingerprint(composition);
    if (
      composition.fingerprint !== fingerprint ||
      composition.canonical !== canonicalRoster(composition)
    )
      return undefined;
    return `variation-v1-${hash([archetypeId(army, patchId), fingerprint])}`;
  } catch {
    return undefined;
  }
}

export function classifyLibraryVersion(
  version: ArmyListVersion,
): LibraryMembership {
  return {
    id: `membership-v1-${hash([version.id, LIBRARY_CLASSIFICATION_VERSION])}`,
    listId: version.listId,
    versionId: version.id,
    patchId: version.patchId,
    archetypeId: archetypeId(version.army, version.patchId),
    variationId: variationId(version.army, version.patchId),
    classificationVersion: LIBRARY_CLASSIFICATION_VERSION,
    // Version creation is stable provenance, so repeated previews are deterministic.
    classifiedAt: version.createdAt,
  };
}

/** Fill only missing derived rows. Older classifications remain immutable history. */
export function maintainLibraryMemberships(
  state: State,
  affectedListIds?: readonly string[],
): void {
  const memberships = state.libraryMemberships || [];
  const existing = new Set(
    memberships
      .filter(
        (row) => row.classificationVersion === LIBRARY_CLASSIFICATION_VERSION,
      )
      .map((row) => row.versionId),
  );
  const affected = affectedListIds && new Set(affectedListIds);
  const additions = (state.armyVersions || [])
    .filter(
      (version) =>
        !existing.has(version.id) &&
        (!affected || affected.has(version.listId)),
    )
    .map(classifyLibraryVersion);
  if (additions.length)
    state.libraryMemberships = [...memberships, ...additions];
}

function requireAdmin(state: State, actor: User): void {
  const current = state.users.find((user) => user.id === actor.id);
  if (
    !current ||
    current.role !== "admin" ||
    !current.confirmedMember ||
    current.removedAt ||
    current.accountDeletedAt
  )
    throw new Error("Administrator access required.");
}

function publicVersions(state: State): ArmyListVersion[] {
  const owners = new Set(
    state.users
      .filter(
        (user) =>
          user.confirmedMember && !user.removedAt && !user.accountDeletedAt,
      )
      .map((user) => user.id),
  );
  const lists = new Map(
    (state.savedArmies || [])
      .filter((list) => list.shared && owners.has(list.userId))
      .map((list) => [list.id, list]),
  );
  return (state.armyVersions || []).filter(
    (version) =>
      version.published && lists.get(version.listId)?.userId === version.userId,
  );
}

function sourceRevision(state: State): string {
  // Include publication and classification inputs; changing privacy invalidates a preview.
  return hash({
    users: state.users
      .map((user) => [
        user.id,
        user.role,
        user.confirmedMember,
        user.removedAt,
        user.accountDeletedAt,
      ])
      .sort(),
    lists: (state.savedArmies || [])
      .map((list) => [
        list.id,
        list.userId,
        list.shared,
        list.currentVersionId,
        list.listRevision,
      ])
      .sort(),
    versions: [...(state.armyVersions || [])].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    memberships: [...(state.libraryMemberships || [])].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
  });
}

export function consolidationPreview(
  state: State,
  actor: User,
): ConsolidationPreview {
  requireAdmin(state, actor);
  const versions = publicVersions(state);
  const memberships = versions.map(classifyLibraryVersion);
  const publicIds = new Set(versions.map((version) => version.id));
  const existing = (state.libraryMemberships || []).filter((row) =>
    publicIds.has(row.versionId),
  );
  const existingArchetypes = new Set(existing.map((row) => row.archetypeId));
  const existingVariations = new Set(
    existing.flatMap((row) => (row.variationId ? [row.variationId] : [])),
  );
  const archetypes = new Set(memberships.map((row) => row.archetypeId));
  const variations = new Set(
    memberships.flatMap((row) => (row.variationId ? [row.variationId] : [])),
  );
  const listsByVariation = new Map<string, Set<string>>();
  for (const membership of memberships)
    if (membership.variationId) {
      const lists =
        listsByVariation.get(membership.variationId) || new Set<string>();
      lists.add(membership.listId);
      listsByVariation.set(membership.variationId, lists);
    }
  return {
    sourceRevision: sourceRevision(state),
    classificationVersion: LIBRARY_CLASSIFICATION_VERSION,
    newArchetypes: [...archetypes].filter((id) => !existingArchetypes.has(id))
      .length,
    existingArchetypes: [...archetypes].filter((id) =>
      existingArchetypes.has(id),
    ).length,
    newVariations: [...variations].filter((id) => !existingVariations.has(id))
      .length,
    duplicateCompositions: [...listsByVariation.values()].reduce(
      (sum, lists) => sum + Math.max(0, lists.size - 1),
      0,
    ),
    unclassified: versions
      .filter((version) => !variationId(version.army, version.patchId))
      .map((version) => ({
        listId: version.listId,
        reason:
          version.army.composition?.reasons.join("; ") ||
          "Complete normalized roster unavailable.",
      })),
    memberships,
  };
}

export function applyConsolidation(
  state: State,
  actor: User,
  revision: string,
): void {
  requireAdmin(state, actor);
  if (revision !== sourceRevision(state))
    throw new Error(
      "Consolidation preview is stale. Preview again before applying.",
    );
  maintainLibraryMemberships(state);
}
