import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  Army,
  ArmyListVersion,
  RecordedGameContext,
  RosterSelection,
  SavedArmy,
  State,
  User,
} from "@/lib/types";
import { armyKey } from "@/lib/matchups";
import { canonicalRoster } from "./army-library-identity";
import { rosterAttachmentSignature } from "@/lib/roster-display";
import { maintainLibraryArmySummaries } from "./army-library-summary";

const label = z.string().trim().min(1).max(300);
const selection: z.ZodType<RosterSelection> = z.lazy(() =>
  z.object({
    sourceId: label,
    instanceId: label.optional(),
    associations: z
      .array(
        z.object({
          instanceId: label,
          role: z.enum(["Leading", "Supporting"]),
          quantity: z.number().int().min(1).max(10000),
        }),
      )
      .max(500)
      .optional(),
    name: z.string().max(300),
    kind: z.enum(["unit", "model", "option", "enhancement"]),
    quantity: z.number().int().min(1).max(10000),
    quantityKnown: z.boolean().optional(),
    selections: z.array(selection).max(500),
  }),
);
export const compositionSchema = z.object({
  attachmentsVersion: z.literal("newrecruit-associations-v1").optional(),
  status: z.enum(["complete", "partial", "unavailable"]),
  normalizationVersion: label,
  selections: z.array(selection).max(500),
  reasons: z.array(z.string().max(300)).max(30),
  source: z.object({
    provider: z.literal("newrecruit"),
    systemId: label.optional(),
    catalogueId: label.optional(),
    catalogueRevision: label.optional(),
    catalogues: z
      .array(
        z.object({ id: label, revision: z.number().int().min(0).max(100000) }),
      )
      .max(100)
      .optional(),
    importedAt: z.iso.datetime().optional(),
  }),
});
export const scopeSchema = z.object({
  systemId: label.optional(),
  edition: label.optional(),
  battleSize: label.optional(),
});
const contextRef = z.object({
  id: label,
  name: label,
  version: label,
  source: z.string().max(2000).optional(),
});
export const gameContextSchema = z.object({
  version: z.literal("1"),
  missionPack: contextRef.optional(),
  deployment: contextRef.optional(),
  ownMission: contextRef.optional(),
  enemyMission: contextRef.optional(),
});

/** Bound attacker-controlled nested data before the recursive schema sees it. */
export function validateLibraryPayload(input: unknown) {
  let count = 0;
  const visit = (value: unknown, depth: number) => {
    if (++count > 20000 || depth > 45)
      throw new Error("This army data is too complex.");
    if (Array.isArray(value)) value.forEach((v) => visit(v, depth + 1));
    else if (value && typeof value === "object")
      Object.values(value).forEach((v) => visit(v, depth + 1));
  };
  visit(input, 0);
}

/** Additive, idempotent initialization. Never infer earlier versions or game attribution. */
export function ensureArmyLibrary(state: State): boolean {
  let changed = false;
  if (!state.armyVersions) {
    state.armyVersions = [];
    changed = true;
  }
  if (!state.libraryMemberships) {
    state.libraryMemberships = [];
    changed = true;
  }
  if (!state.libraryDiscussions) {
    state.libraryDiscussions = [];
    changed = true;
  }
  for (const saved of state.savedArmies || []) {
    if (
      saved.currentVersionId &&
      state.armyVersions.some(
        (v) => v.id === saved.currentVersionId && v.listId === saved.id,
      )
    )
      continue;
    const version = state.armyVersions.find((v) => v.listId === saved.id) || {
      id: `${saved.id}:v1`,
      listId: saved.id,
      userId: saved.userId,
      number: 1,
      patchId: saved.patchId,
      army: structuredClone(saved.army),
      createdAt: saved.updatedAt,
      published: saved.shared,
    };
    if (!state.armyVersions.includes(version)) state.armyVersions.push(version);
    saved.currentVersionId = version.id;
    saved.listRevision ||= 1;
    changed = true;
  }
  return maintainLibraryArmySummaries(state) || changed;
}

function versionContent(army: Army, patchId: string) {
  return JSON.stringify([
    patchId,
    armyKey(army),
    army.revision,
    army.listText || null,
    army.scope
      ? [
          army.scope.systemId,
          army.scope.edition,
          army.scope.battleSize,
          army.scope.continuityKey,
        ]
      : null,
    army.composition
      ? [
          army.composition.status,
          army.composition.normalizationVersion,
          army.composition.source.provider,
          army.composition.source.systemId,
          army.composition.source.catalogueId,
          army.composition.source.catalogueRevision,
          canonicalRoster(army.composition),
          rosterAttachmentSignature(army.composition),
        ]
      : null,
  ]);
}

export function updateArmyVersion(
  state: State,
  saved: SavedArmy,
  army: Army,
  patchId: string,
  now: string,
  expectedRevision?: number,
) {
  ensureArmyLibrary(state);
  if (expectedRevision !== undefined && expectedRevision !== saved.listRevision)
    throw new Error("This army list changed. Reload before saving.");
  const previous = state.armyVersions!.find(
    (v) => v.id === saved.currentVersionId,
  )!;
  const changed =
    versionContent(previous.army, previous.patchId) !==
    versionContent(army, patchId);
  if (changed) {
    const version: ArmyListVersion = {
      id: randomUUID(),
      listId: saved.id,
      userId: saved.userId,
      number:
        Math.max(
          ...state
            .armyVersions!.filter((v) => v.listId === saved.id)
            .map((v) => v.number),
        ) + 1,
      patchId,
      army: structuredClone(army),
      createdAt: now,
      published: saved.shared,
    };
    state.armyVersions!.push(version);
    saved.currentVersionId = version.id;
  }
  if (
    changed ||
    JSON.stringify({ ...saved.army, summary: undefined }) !==
      JSON.stringify({ ...army, summary: undefined }) ||
    saved.patchId !== patchId
  ) {
    saved.listRevision = (saved.listRevision || 1) + 1;
    saved.updatedAt = now;
  }
  saved.army = army;
  saved.patchId = patchId;
  return changed;
}

export function isPublicLibraryVersion(state: State, version: ArmyListVersion) {
  return (
    version.published &&
    (state.savedArmies || []).some(
      (a) => a.id === version.listId && a.shared && a.userId === version.userId,
    ) &&
    state.users.some(
      (u) => u.id === version.userId && u.confirmedMember && !u.removedAt,
    )
  );
}

export function validateGameVersion(
  state: State,
  actor: User,
  versionId: string | undefined,
  army: Army,
  patchId: string,
  own: boolean,
  previousVersionId?: string,
) {
  if (!versionId) return undefined;
  const version = state.armyVersions?.find((v) => v.id === versionId);
  if (
    !version ||
    (own
      ? version.userId !== actor.id
      : version.userId !== actor.id &&
        !isPublicLibraryVersion(state, version) &&
        previousVersionId !== version.id)
  )
    throw new Error("Army list version is unavailable.");
  if (
    version.patchId !== patchId ||
    armyKey(version.army) !== armyKey(army) ||
    ((army.composition ||
      version.army.composition ||
      army.listText ||
      version.army.listText) &&
      versionContent(version.army, patchId) !== versionContent(army, patchId))
  )
    throw new Error(
      "Army list version does not match this game snapshot or ruleset.",
    );
  return version.id;
}

export function validateRecordedContext(
  context: RecordedGameContext | undefined,
) {
  if (!context) return undefined;
  const result = gameContextSchema.parse(context);
  if (
    (result.ownMission || result.enemyMission || result.deployment) &&
    !result.missionPack
  )
    throw new Error(
      "Record the mission pack and version for this game context.",
    );
  return structuredClone(result);
}
