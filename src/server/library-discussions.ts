import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  ArmyListVersion,
  LibraryDiscussion,
  LibraryDiscussionContext,
  LibraryQuery,
  LibraryTarget,
  State,
  User,
} from "@/lib/types";
import { archetypeId, variationId } from "./army-library-identity";

const id = z.string().trim().min(1).max(200);
const targetSchema = z.object({ kind: z.enum(["list", "archetype"]), id });
const contextSchema = z.object({
  patchId: id.optional(),
  versionId: id.optional(),
  variationId: id.optional(),
  opponentArchetypeId: id.optional(),
});
const text = z.string().trim().min(1).max(5000);
export const libraryCommands = [
  z.object({
    type: z.literal("libraryDiscussion"),
    target: targetSchema,
    parentId: id.optional(),
    context: contextSchema.optional(),
    text,
  }),
  z.object({ type: z.literal("libraryDiscussionEdit"), id, text }),
  z.object({ type: z.literal("libraryDiscussionDelete"), id }),
] as const;
const commands = z.discriminatedUnion("type", libraryCommands);
const unavailable = () => new Error("Library discussion unavailable.");
const active = (user: User | undefined): user is User =>
  !!user && !!user.confirmedMember && !user.removedAt && !user.accountDeletedAt;

function authorizedActor(state: State, actor: User) {
  const current = state.users.find((user) => user.id === actor.id);
  if (!active(current)) throw unavailable();
  return current;
}

function publicSources(state: State) {
  const users = new Map(state.users.map((user) => [user.id, user]));
  const lists = new Map(
    (state.savedArmies || [])
      .filter((list) => list.shared && active(users.get(list.userId)))
      .map((list) => [list.id, list]),
  );
  const versions = (state.armyVersions || []).filter(
    (version) =>
      version.published && lists.get(version.listId)?.userId === version.userId,
  );
  const matrices = (state.matrixLists || []).filter((matrix) =>
    active(users.get(matrix.userId)),
  );
  const archetypes = new Set([
    ...versions.map((version) => archetypeId(version.army, version.patchId)),
    ...matrices.map((matrix) => archetypeId(matrix.army, matrix.patchId)),
  ]);
  return { users, versions, matrices, archetypes };
}
type Sources = ReturnType<typeof publicSources>;
function sameTarget(a: LibraryTarget, b: LibraryTarget) {
  return a.kind === b.kind && a.id === b.id;
}
function targetVersions(sources: Sources, target: LibraryTarget) {
  return sources.versions.filter((version) =>
    target.kind === "list"
      ? version.listId === target.id
      : archetypeId(version.army, version.patchId) === target.id,
  );
}
function visibleTarget(sources: Sources, target: LibraryTarget) {
  return target.kind === "archetype"
    ? sources.archetypes.has(target.id)
    : targetVersions(sources, target).length > 0 ||
        sources.matrices.some((matrix) => `matrix:${matrix.id}` === target.id);
}
function visibleContext(
  sources: Sources,
  target: LibraryTarget,
  context?: LibraryDiscussionContext,
) {
  if (!visibleTarget(sources, target)) return false;
  if (!context) return true;
  const matrix =
    target.kind === "list"
      ? sources.matrices.find((entry) => `matrix:${entry.id}` === target.id)
      : undefined;
  if (
    matrix &&
    (context.versionId ||
      context.variationId ||
      (context.patchId && context.patchId !== matrix.patchId))
  )
    return false;
  const versions = targetVersions(sources, target);
  const scopedVersions = versions.filter(
    (version) => !context.patchId || version.patchId === context.patchId,
  );
  if (
    context.patchId &&
    !scopedVersions.length &&
    !matrix &&
    !(
      target.kind === "archetype" &&
      sources.matrices.some(
        (matrix) =>
          matrix.patchId === context.patchId &&
          archetypeId(matrix.army, matrix.patchId) === target.id,
      )
    )
  )
    return false;
  let referencedVersion: ArmyListVersion | undefined;
  if (context.versionId) {
    referencedVersion = scopedVersions.find(
      (version) => version.id === context.versionId,
    );
    if (!referencedVersion) return false;
  }
  if (
    context.variationId &&
    !(referencedVersion ? [referencedVersion] : scopedVersions).some(
      (version) =>
        variationId(version.army, version.patchId) === context.variationId,
    )
  )
    return false;
  if (
    context.opponentArchetypeId &&
    (!sources.archetypes.has(context.opponentArchetypeId) ||
      (context.patchId &&
        !sources.versions.some(
          (version) =>
            version.patchId === context.patchId &&
            archetypeId(version.army, version.patchId) ===
              context.opponentArchetypeId,
        ) &&
        !sources.matrices.some(
          (entry) =>
            entry.patchId === context.patchId &&
            archetypeId(entry.army, entry.patchId) ===
              context.opponentArchetypeId,
        )))
  )
    return false;
  return true;
}

function discussionVisible(
  sources: Sources,
  rows: Map<string, LibraryDiscussion>,
  discussion: LibraryDiscussion,
  visiting = new Set<string>(),
): boolean {
  if (
    visiting.size > 30 ||
    visiting.has(discussion.id) ||
    !active(sources.users.get(discussion.authorId)) ||
    !visibleContext(sources, discussion.target, discussion.context)
  )
    return false;
  if (!discussion.parentId) return true;
  const parent = rows.get(discussion.parentId);
  if (!parent || !sameTarget(parent.target, discussion.target)) return false;
  visiting.add(discussion.id);
  return discussionVisible(sources, rows, parent, visiting);
}

/** Recheck the target, every referenced entity and every ancestor on each read. */
export function libraryDiscussionView(
  state: State,
  actor: User,
  target: LibraryTarget,
  filters?: Pick<LibraryQuery, "patchId" | "versionId">,
): LibraryDiscussion[] {
  authorizedActor(state, actor);
  const sources = publicSources(state);
  if (!visibleTarget(sources, target)) throw unavailable();
  const rows = new Map(
    (state.libraryDiscussions || []).map((row) => [row.id, row]),
  );
  return [...rows.values()]
    .filter(
      (row) =>
        sameTarget(row.target, target) &&
        discussionVisible(sources, rows, row) &&
        (!filters?.patchId ||
          filters.patchId === "all" ||
          !row.context?.patchId ||
          row.context.patchId === filters.patchId) &&
        (!filters?.versionId ||
          !row.context?.versionId ||
          row.context.versionId === filters.versionId),
    )
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    .map((row) => ({
      ...structuredClone(row),
      text: row.deletedAt ? "" : row.text,
    }));
}

export function executeLibraryCommand(
  state: State,
  actor: User,
  input: unknown,
): boolean {
  if (
    !input ||
    typeof input !== "object" ||
    ![
      "libraryDiscussion",
      "libraryDiscussionEdit",
      "libraryDiscussionDelete",
    ].includes(String((input as { type?: unknown }).type))
  )
    return false;
  const command = commands.parse(input);
  const current = authorizedActor(state, actor);
  const sources = publicSources(state);
  const rows = new Map(
    (state.libraryDiscussions || []).map((row) => [row.id, row]),
  );
  const now = new Date().toISOString();
  if (command.type === "libraryDiscussion") {
    const parent = command.parentId ? rows.get(command.parentId) : undefined;
    if (
      command.parentId &&
      (!parent ||
        parent.deletedAt ||
        !sameTarget(parent.target, command.target) ||
        !discussionVisible(sources, rows, parent))
    )
      throw unavailable();
    const context = parent?.context || command.context;
    if (
      parent &&
      command.context &&
      JSON.stringify(command.context) !== JSON.stringify(parent.context)
    )
      throw unavailable();
    if (!visibleContext(sources, command.target, context)) throw unavailable();
    const row: LibraryDiscussion = {
      id: randomUUID(),
      target: command.target,
      ...(parent ? { parentId: parent.id } : {}),
      ...(context ? { context: structuredClone(context) } : {}),
      authorId: current.id,
      authorName: current.name,
      text: command.text,
      createdAt: now,
    };
    if (!discussionVisible(sources, rows, row)) throw unavailable();
    state.libraryDiscussions ||= [];
    state.libraryDiscussions.push(row);
  } else {
    const row = rows.get(command.id);
    if (
      !row ||
      row.deletedAt ||
      !discussionVisible(sources, rows, row) ||
      (row.authorId !== current.id && current.role !== "admin")
    )
      throw unavailable();
    if (command.type === "libraryDiscussionEdit") {
      // Administrators moderate by removing content; authors edit their own words.
      if (row.authorId !== current.id) throw unavailable();
      row.text = command.text;
      row.updatedAt = now;
    } else {
      row.deletedAt = now;
      row.updatedAt = now;
    }
  }
  return true;
}
