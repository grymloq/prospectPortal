import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { State, User, View, Army } from "@/lib/types";
import { armySnapshot, catalogue } from "@/lib/catalogue";
import { publicUser } from "./public-user";
import { armyKey, outcomeForScore } from "@/lib/matchups";
import { ensurePatches, defaultPatchId } from "@/lib/patches";
import { ensureMembership, requireMember } from "./membership";
import { executeScrim, scrimCommands, scrimView } from "./scrims";
import { feedbackCommand, submitFeedback } from "./feedback";
const text = z.string().trim().min(1).max(5000),
  id = z.string().min(1).max(100);
const url = z
  .string()
  .max(2000)
  .refine(
    (v) => !v || (/^https?:\/\//i.test(v) && URL.canParse(v)),
    "Use an http or https link.",
  );
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().startsWith(v),
    "Invalid date",
  );
const army = z.object({
  listName: z.string().trim().max(100).optional(),
  faction: id,
  detachments: z.array(id).max(3),
  disposition: id,
  listUrl: url,
});
const commands = z.discriminatedUnion("type", [
  feedbackCommand,
  z.object({ type: z.literal("feedbackRead"), id, read: z.boolean() }),
  z.object({ type: z.literal("feedbackDelete"), id }),
  z.object({ type: z.literal("feedbackRestore"), id }),
  ...scrimCommands,
  z.object({
    type: z.literal("userConfirmation"),
    userId: id,
    confirmed: z.boolean(),
  }),
  z.object({ type: z.literal("defaultArmy"), id: z.string().max(100) }),
  z.object({
    type: z.literal("saveArmy"),
    id: id.optional(),
    patchId: id,
    army,
  }),
  z.object({ type: z.literal("shareArmy"), id, shared: z.boolean() }),
  z.object({ type: z.literal("deleteArmy"), id }),
  z.object({
    type: z.literal("userRole"),
    userId: id,
    role: z.enum(["admin", "member"]),
  }),
  z.object({ type: z.literal("removeUser"), userId: id }),
  z.object({ type: z.literal("matrixList"), patchId: id, army }),

  z.object({
    type: z.literal("manualEstimate"),
    patchId: id,
    own: army,
    enemy: army,
    layout: z.enum(["A", "B", "C"]),
    score: z.number().min(0).max(20).nullable(),
  }),
  z.object({ type: z.literal("patch"), name: text.max(100), date }),
  z.object({ type: z.literal("defaultPatch"), patchId: id }),
  z.object({ type: z.literal("removePatchImport"), patchId: id }),
  z.object({ type: z.literal("restorePatchImport"), patchId: id }),
  z.object({
    type: z.literal("renamePatch"),
    patchId: id,
    name: text.max(100),
  }),
  z.object({
    type: z.literal("profile"),
    preferredFactions: z.array(id).max(50).optional(),
    name: text.max(100),
    city: z.string().max(100),
    discordName: z.string().trim().max(100).optional(),
    bio: z.string().max(3000),
    faction: id,
  }),
  z.object({ type: z.literal("applyTeam"), application: text }),
  z.object({
    type: z.literal("phase"),
    userId: id,
    phaseId: z.string().nullable(),
    rejected: z.boolean(),
    reason: text,
  }),
  z.object({
    type: z.literal("phases"),
    phases: z
      .array(
        z.object({
          id,
          name: text.max(40),
          kind: z.enum(["application", "review", "selected"]),
        }),
      )
      .min(3)
      .max(12),
  }),
  z.object({
    type: z.literal("evaluation"),
    userId: id,
    revision: z.number().int(),
    ratings: z
      .array(
        z.object({
          score: z.number().int().min(1).max(5).nullable(),
          note: z.string().max(2000),
        }),
      )
      .length(18),
  }),
  z.object({
    type: z.literal("message"),
    userId: id,
    internal: z.boolean(),
    text,
  }),
  z.object({
    type: z.literal("goal"),
    userId: id,
    title: text.max(200),
    description: text,
    due: z.union([date, z.literal("")]),
  }),
  z.object({
    type: z.literal("goalProgress"),
    id,
    status: z.enum([
      "Not started",
      "In progress",
      "Ready for review",
      "Completed",
    ]),
    evidence: z.string().max(5000),
    gameId: z.string(),
  }),
  z.object({
    type: z.literal("game"),
    id: z.string().optional(),
    date,
    opponent: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((name) => name || "unnamed player"),
    opponentUserId: z.string().max(100).optional(),
    own: army,
    enemy: army,
    score: z.number().int().min(0).max(20),
    layout: z.enum(["A", "B", "C"]).optional(),
    patchId: id.optional(),
    context: text.max(200),
    notes: z.string().max(5000),
    eventId: z.string(),
  }),
  z.object({ type: z.literal("deleteGame"), id }),
  z.object({
    type: z.literal("event"),
    id: z.string().optional(),
    title: text.max(150),
    location: z.string().trim().max(300),
    online: z.boolean().optional(),
    onlineUrl: url.optional(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    capacity: z.number().int().min(1).max(1000),
    description: z.string().max(5000),
    cancelled: z.boolean(),
  }),
  z.object({
    type: z.literal("eventApply"),
    eventId: id,
    withdraw: z.boolean(),
  }),
  z.object({
    type: z.literal("eventDecision"),
    id,
    status: z.enum(["Approved", "Declined"]),
  }),
]);
export function viewState(s: State, actor: User): View {
  ensurePatches(s);
  ensureMembership(s);
  requireMember(actor);
  const admin = actor.role === "admin";
  return {
    me: publicUser(actor),
    feedback: admin
      ? (s.feedback || []).map((f) => ({
          ...f,
          attachments: f.attachments.map((a) => ({ name: a.name })),
        }))
      : [],
    scrims: (s.scrims || []).map((scrim) => scrimView(s, scrim, actor)),
    playerOptions: s.users
      .filter((u) => !u.removedAt && u.confirmedMember && u.id !== actor.id)
      .map((u) => ({ id: u.id, name: u.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    savedArmies: (s.savedArmies || []).filter(
      (a) =>
        a.userId === actor.id ||
        (a.shared && s.users.some((u) => u.id === a.userId && !u.removedAt)),
    ),
    matrixListHistory: s.matrixListHistory || [],
    matrixChanges: s.matrixChanges || [],
    matrixLists: s.matrixLists || [],
    manualEstimates: s.manualEstimates || [],
    patches: [...s.patches!].sort((a, b) => b.date.localeCompare(a.date)),
    defaultPatchId: defaultPatchId(s),
    catalogue: s.catalogue || catalogue,
    users: s.users.filter((u) => admin || u.id === actor.id).map(publicUser),
    phases: s.phases,
    games: s.games
      .filter((g) => admin || g.userId === actor.id)
      .map((g) => ({
        ...g,
        outcome: outcomeForScore(g.score),
        layout: g.layout || null,
      })),
    goals: s.goals.filter((g) => admin || g.userId === actor.id),
    evaluations: admin ? s.evaluations : [],
    evaluationHistory: admin ? s.evaluationHistory || [] : [],
    messages: s.messages.filter(
      (m) => admin || (m.userId === actor.id && !m.internal),
    ),
    events: s.events,
    applications: s.applications.filter((a) => admin || a.userId === actor.id),
    audit: admin ? s.audit : [],
    occupancy: Object.fromEntries(
      s.events.map((e) => [
        e.id,
        s.applications.filter(
          (a) => a.eventId === e.id && a.status === "Approved",
        ).length,
      ]),
    ),
  };
}
export function execute(s: State, actor: User, input: unknown) {
  ensureMembership(s);
  requireMember(actor);
  ensurePatches(s);
  const c = commands.parse(input);
  if (c.type === "feedback") {
    submitFeedback(s, actor, c);
    return;
  }
  if (c.type.startsWith("scrim")) {
    executeScrim(s, actor, c);
    return;
  }
  const admin = actor.role === "admin";
  const now = new Date().toISOString();
  const requireAdmin = () => {
    if (!admin) throw new Error("Admin access required.");
  };
  const own = (userId: string) => {
    if (!admin && actor.id !== userId)
      throw new Error("You cannot access another player.");
    if (!s.users.some((u) => u.id === userId))
      throw new Error("Player not found.");
  };
  const audit = (message: string) =>
    s.audit.unshift({
      id: randomUUID(),
      actor: actor.name,
      text: message,
      createdAt: now,
    });
  switch (c.type) {
    case "feedbackRead":
    case "feedbackDelete":
    case "feedbackRestore": {
      requireAdmin();
      const feedback = s.feedback?.find((f) => f.id === c.id);
      if (!feedback) throw new Error("Feedback not found.");
      if (c.type === "feedbackRead") {
        if (feedback.deletedAt) throw new Error("Restore this feedback first.");
        feedback.readAt = c.read ? now : undefined;
        feedback.readBy = c.read ? actor.id : undefined;
      } else if (c.type === "feedbackDelete") feedback.deletedAt ||= now;
      else delete feedback.deletedAt;
      return;
    }
    case "userConfirmation": {
      requireAdmin();
      const user = s.users.find((u) => u.id === c.userId && !u.removedAt);
      if (!user) throw new Error("Active user not found.");
      if (user.id === actor.id && !c.confirmed)
        throw new Error("Ask another administrator to change your own access.");
      if (
        !c.confirmed &&
        user.role === "admin" &&
        s.users.filter(
          (u) => u.role === "admin" && u.confirmedMember && !u.removedAt,
        ).length <= 1
      )
        throw new Error("At least one confirmed administrator must remain.");
      user.confirmedMember = c.confirmed;
      audit(
        `${actor.name} ${c.confirmed ? "confirmed membership for" : "revoked membership confirmation for"} ${user.name}.`,
      );
      break;
    }
    case "defaultArmy": {
      if (
        c.id &&
        !s.savedArmies?.some(
          (a) =>
            a.id === c.id &&
            a.userId === actor.id &&
            s.patches!.some((p) => p.id === a.patchId && !p.removedAt),
        )
      )
        throw new Error("Choose one of your armies for an available ruleset.");
      actor.defaultArmyId = c.id;
      break;
    }
    case "saveArmy": {
      const existing = c.id
        ? s.savedArmies?.find((a) => a.id === c.id)
        : undefined;
      if (c.id && (!existing || existing.userId !== actor.id))
        throw new Error("You can edit only your own army lists.");
      const patch = s.patches!.find((p) => p.id === c.patchId && !p.removedAt);
      if (!patch) throw new Error("Choose an available rules patch.");
      if (!c.army.listName?.trim()) throw new Error("Name your army list.");
      const snapshot = armySnapshot(c.army, patch.catalogue || catalogue, 3);
      s.savedArmies ||= [];
      if (existing)
        Object.assign(existing, {
          patchId: patch.id,
          army: snapshot,
          updatedAt: now,
          ownerName: actor.name,
        });
      else
        s.savedArmies.push({
          id: randomUUID(),
          userId: actor.id,
          patchId: patch.id,
          army: snapshot,
          shared: false,
          ownerName: actor.name,
          updatedAt: now,
        });
      break;
    }
    case "shareArmy":
    case "deleteArmy": {
      const saved = s.savedArmies?.find((a) => a.id === c.id);
      if (!saved || saved.userId !== actor.id)
        throw new Error("You can change only your own army lists.");
      if (c.type === "shareArmy") saved.shared = c.shared;
      else {
        s.savedArmies = s.savedArmies!.filter((a) => a.id !== c.id);
        if (actor.defaultArmyId === c.id) actor.defaultArmyId = "";
      }
      break;
    }
    case "userRole":
    case "removeUser": {
      requireAdmin();
      const user = s.users.find((u) => u.id === c.userId && !u.removedAt);
      if (!user) throw new Error("Active user not found.");
      if (user.id === actor.id)
        throw new Error("Ask another administrator to change your own access.");
      if (
        user.role === "admin" &&
        (c.type === "removeUser" || c.role === "member") &&
        s.users.filter((u) => u.role === "admin" && !u.removedAt).length <= 1
      )
        throw new Error("At least one administrator must remain.");
      if (c.type === "userRole") {
        user.role = c.role;
        audit(`${actor.name} changed ${user.name} to ${c.role}.`);
      } else {
        user.removedAt = now;
        user.phaseId = null;
        user.inviteTokenHash = undefined;
        user.inviteExpiresAt = undefined;
        for (const a of s.applications)
          if (
            a.userId === user.id &&
            (a.status === "Pending" || a.status === "Approved")
          ) {
            a.status = "Withdrawn";
            a.updatedAt = now;
          }
        audit(
          `${actor.name} removed portal access for ${user.name}. Journals and history retained.`,
        );
      }
      break;
    }
    case "matrixList": {
      if (!s.patches!.some((p) => p.id === c.patchId))
        throw new Error("Choose a rules patch.");
      const snapshot = armySnapshot(
        c.army,
        s.patches!.find((p) => p.id === c.patchId)?.catalogue || catalogue,
      );
      (s.matrixListHistory ||= []).push({
        authorName: actor.name,
        updatedAt: now,
        patchId: c.patchId,
        army: snapshot,
      });
      s.matrixLists ||= [];
      const existing = s.matrixLists.find(
        (v) => v.patchId === c.patchId && armyKey(v.army) === armyKey(snapshot),
      );
      if (existing)
        Object.assign(existing, {
          army: snapshot,
          userId: actor.id,
          authorName: actor.name,
          updatedAt: now,
        });
      else
        s.matrixLists.push({
          id: randomUUID(),
          userId: actor.id,
          patchId: c.patchId,
          army: snapshot,
          authorName: actor.name,
          updatedAt: now,
        });
      break;
    }
    case "manualEstimate": {
      if (!s.patches!.some((p) => p.id === c.patchId))
        throw new Error("Choose a rules patch.");
      const rules =
        s.patches!.find((p) => p.id === c.patchId)?.catalogue || catalogue;
      let row = armyKey(armySnapshot(c.own, rules)),
        column = armyKey(armySnapshot(c.enemy, rules));
      let score = c.score;
      if (row === column && score !== null && score !== 10)
        throw new Error(
          "Identical configurations have a symmetric score of 10.",
        );
      if (row > column) {
        [row, column] = [column, row];
        if (score !== null) score = 20 - score;
      }
      s.manualEstimates = (s.manualEstimates || []).filter(
        (v) =>
          !(
            v.patchId === c.patchId &&
            v.row === row &&
            v.column === column &&
            v.layout === c.layout
          ),
      );
      (s.matrixChanges ||= []).push({
        userId: actor.id,
        patchId: c.patchId,
        row,
        column,
        layout: c.layout,
        score,
        updatedAt: now,
        authorName: actor.name,
      });
      if (score !== null) {
        // Publishing a team estimate also makes its configurations available to teammates without those logs.
        s.matrixLists ||= [];
        for (const input of [c.own, c.enemy]) {
          const snapshot = armySnapshot(input, rules);
          if (
            !s.matrixLists.some(
              (v) =>
                v.patchId === c.patchId &&
                armyKey(v.army) === armyKey(snapshot),
            )
          )
            s.matrixLists.push({
              id: randomUUID(),
              userId: actor.id,
              patchId: c.patchId,
              army: snapshot,
              authorName: actor.name,
              updatedAt: now,
            });
        }
        s.manualEstimates.push({
          userId: actor.id,
          patchId: c.patchId,
          row,
          column,
          layout: c.layout,
          score,
          updatedAt: now,
          authorName: actor.name,
        });
      }
      break;
    }
    case "patch": {
      requireAdmin();
      if (s.patches!.some((p) => p.date === c.date))
        throw new Error("A patch already exists for this date.");
      s.patches!.push({
        id: c.date,
        name: c.name,
        date: c.date,
        catalogue: s.catalogue || catalogue,
      });
      audit("Added patch: " + c.name + " — " + c.date);
      break;
    }
    case "defaultPatch": {
      requireAdmin();
      const patch = s.patches!.find((p) => p.id === c.patchId && !p.removedAt);
      if (!patch) throw new Error("Choose an available rules patch.");
      s.defaultPatchId = patch.id;
      audit(`Set default rules patch: ${patch.name}`);
      break;
    }
    case "removePatchImport":
    case "restorePatchImport": {
      requireAdmin();
      const patch = s.patches!.find((p) => p.id === c.patchId);
      if (!patch) throw new Error("Choose an available rules patch.");
      if (c.type === "removePatchImport") {
        if (patch.id === defaultPatchId(s))
          throw new Error(
            "Select another default rules patch before removing this import.",
          );
        if (!patch.removedAt) {
          patch.removedAt = now;
          audit(`Removed rules import: ${patch.name}`);
        }
      } else if (patch.removedAt) {
        delete patch.removedAt;
        audit(`Restored rules import: ${patch.name}`);
      }
      break;
    }
    case "renamePatch": {
      requireAdmin();
      const patch = s.patches!.find((p) => p.id === c.patchId);
      if (!patch) throw new Error("Patch not found.");
      if (patch.name === c.name) break;
      const previous = patch.name;
      patch.name = c.name;
      audit(`Renamed patch: ${previous} → ${c.name} — ${patch.date}`);
      break;
    }
    case "profile": {
      const factions = [
        ...catalogue.factions,
        ...(s.catalogue?.factions || []),
      ];
      const preferredFactions = [
        ...new Set(c.preferredFactions ?? [c.faction]),
      ];
      if (
        ![c.faction, ...preferredFactions].every((id) =>
          factions.some((f) => f.id === id),
        )
      )
        throw new Error("Unknown faction.");
      Object.assign(actor, {
        name: c.name,
        city: c.city,
        discordName: c.discordName ?? actor.discordName,
        bio: c.bio,
        faction: c.faction,
        preferredFactions,
      });
      break;
    }
    case "applyTeam": {
      if (actor.phaseId && !actor.rejected)
        throw new Error("You already have an active application.");
      actor.application = c.application;
      actor.phaseId = s.phases.find((p) => p.kind === "application")!.id;
      actor.rejected = false;
      audit(`${actor.name} submitted a team application.`);
      break;
    }
    case "phase": {
      requireAdmin();
      own(c.userId);
      const user = s.users.find((u) => u.id === c.userId)!;
      const phase = s.phases.find((p) => p.id === c.phaseId);
      if (!phase && !c.rejected) throw new Error("Choose a phase.");
      if (
        phase?.kind === "selected" &&
        !c.rejected &&
        s.users.filter(
          (u) =>
            u.id !== user.id &&
            !u.rejected &&
            s.phases.find((p) => p.id === u.phaseId)?.kind === "selected",
        ).length >= 8
      )
        throw new Error("All eight selected places are filled.");
      user.phaseId = c.phaseId;
      user.rejected = c.rejected;
      audit(
        `${user.name}: ${c.rejected ? "Not selected" : phase?.name}. ${c.reason}`,
      );
      break;
    }
    case "phases": {
      requireAdmin();
      if (
        new Set(c.phases.map((p) => p.id)).size !== c.phases.length ||
        new Set(c.phases.map((p) => p.name.toLowerCase())).size !==
          c.phases.length
      )
        throw new Error("Phase names and identifiers must be unique.");
      if (
        c.phases[0].kind !== "application" ||
        c.phases.at(-1)!.kind !== "selected" ||
        c.phases.filter((p) => p.kind === "application").length !== 1 ||
        c.phases.filter((p) => p.kind === "selected").length !== 1
      )
        throw new Error("Keep Application first and Selected last.");
      for (const old of s.phases) {
        const next = c.phases.find((p) => p.id === old.id);
        if (next && next.kind !== old.kind)
          throw new Error("A phase role cannot change.");
        if (!next && s.users.some((u) => u.phaseId === old.id))
          throw new Error("Move players out of a phase before removing it.");
      }
      s.phases = c.phases;
      audit("Updated selection phases.");
      break;
    }
    case "evaluation": {
      requireAdmin();
      own(c.userId);
      const previous = s.evaluations.find((e) => e.userId === c.userId);
      if ((previous?.revision || 0) !== c.revision)
        throw new Error(
          "Another admin updated this evaluation. Reload the profile before saving.",
        );
      audit(
        `Updated evaluation for ${s.users.find((u) => u.id === c.userId)!.name}. Previous ratings: ${previous?.ratings.map((r) => r.score ?? "–").join(", ") || "Unrated"}`,
      );
      if (previous) {
        s.evaluationHistory ??= [];
        s.evaluationHistory.push(structuredClone(previous));
      }
      s.evaluations = s.evaluations.filter((e) => e.userId !== c.userId);
      s.evaluations.push({
        userId: c.userId,
        ratings: c.ratings,
        revision: c.revision + 1,
        updatedBy: actor.name,
        updatedAt: now,
      });
      break;
    }
    case "message": {
      own(c.userId);
      if (c.internal) requireAdmin();
      s.messages.push({
        id: randomUUID(),
        userId: c.userId,
        authorId: actor.id,
        authorName: actor.name,
        internal: c.internal,
        text: c.text,
        createdAt: now,
      });
      break;
    }
    case "goal": {
      requireAdmin();
      own(c.userId);
      s.goals.push({
        id: randomUUID(),
        userId: c.userId,
        title: c.title,
        description: c.description,
        due: c.due,
        status: "Not started",
        evidence: "",
        gameId: "",
        createdBy: actor.name,
      });
      audit(`Created focus goal: ${c.title}.`);
      break;
    }
    case "goalProgress": {
      const goal = s.goals.find((g) => g.id === c.id);
      if (!goal) throw new Error("Goal not found.");
      own(goal.userId);
      if (!admin && (c.status === "Completed" || goal.status === "Completed"))
        throw new Error("An admin reviews completed goals.");
      if (
        c.gameId &&
        !s.games.some((g) => g.id === c.gameId && g.userId === goal.userId)
      )
        throw new Error("Choose a game from this player’s journal.");
      Object.assign(goal, {
        status: c.status,
        evidence: c.evidence,
        gameId: c.gameId,
      });
      break;
    }
    case "game": {
      const old = c.id ? s.games.find((g) => g.id === c.id) : undefined;
      if (old?.scrimPairingId)
        throw new Error(
          "Update this shared result through the scrim. Journal reflections stay private.",
        );
      if (
        c.opponentUserId &&
        c.opponentUserId !== old?.opponentUserId &&
        !s.users.some(
          (u) => u.id === c.opponentUserId && !u.removedAt && u.id !== actor.id,
        )
      )
        throw new Error("Choose an active opponent player.");
      if (!c.patchId || !s.patches!.some((p) => p.id === c.patchId))
        throw new Error("Choose a valid patch.");
      if (!c.layout) throw new Error("Choose layout A, B, or C.");
      if (
        s.patches!.find((p) => p.id === c.patchId)?.removedAt &&
        old?.patchId !== c.patchId
      )
        throw new Error(
          "This rules import has been removed. Choose an available patch.",
        );
      if (c.id && (!old || old.userId !== actor.id))
        throw new Error("You can edit only your own games.");
      if (c.eventId && !s.events.some((e) => e.id === c.eventId))
        throw new Error("Event not found.");
      if (s.events.some((e) => e.id === c.eventId && e.scrimId))
        throw new Error("Select the scrim pairing to report this game.");
      const { type: _, ...fields } = c;
      void _;
      const gameRules =
        s.patches!.find((p) => p.id === c.patchId)?.catalogue || catalogue;
      const snapshot = (input: typeof c.own, previous?: Army) => {
        if (
          previous &&
          old?.patchId === c.patchId &&
          input.faction === previous.faction &&
          input.disposition === previous.disposition &&
          [...input.detachments].sort().join("|") ===
            [...previous.detachments].sort().join("|")
        ) {
          return { ...previous, ...input };
        }
        return armySnapshot(input, gameRules, 3);
      };
      const game = {
        ...fields,
        outcome: outcomeForScore(c.score),
        id: old?.id || randomUUID(),
        userId: actor.id,
        own: snapshot(c.own, old?.own),
        enemy: snapshot(c.enemy, old?.enemy),
        updatedAt: now,
      };
      s.games = s.games.filter((g) => g.id !== game.id);
      s.games.push(game);
      break;
    }
    case "deleteGame": {
      const game = s.games.find((g) => g.id === c.id);
      if (game?.scrimPairingId)
        throw new Error(
          "A shared scrim result cannot be deleted from one journal.",
        );
      if (!game || game.userId !== actor.id)
        throw new Error("You can delete only your own games.");
      s.games = s.games.filter((g) => g.id !== c.id);
      for (const goal of s.goals) if (goal.gameId === c.id) goal.gameId = "";
      break;
    }
    case "event": {
      if (!c.online && !c.location)
        throw new Error("Enter a location for an in-person event.");
      requireAdmin();
      if (Date.parse(c.endsAt) <= Date.parse(c.startsAt))
        throw new Error("End time must follow start time.");
      const old = c.id ? s.events.find((e) => e.id === c.id) : undefined;
      if (old?.scrimId) throw new Error("Manage this event from its scrim.");
      if (c.id && !old) throw new Error("Event not found.");
      if (
        s.applications.filter(
          (a) => a.eventId === c.id && a.status === "Approved",
        ).length > c.capacity
      )
        throw new Error("Capacity is below the number already approved.");
      const { type: _, ...fields } = c;
      void _;
      const event = { ...fields, id: old?.id || randomUUID() };
      s.events = s.events.filter((e) => e.id !== event.id);
      s.events.push(event);
      audit(`${old ? "Updated" : "Created"} event: ${event.title}.`);
      break;
    }
    case "eventApply": {
      const event = s.events.find((e) => e.id === c.eventId);
      if (!event) throw new Error("Event not found.");
      if (event.scrimId)
        throw new Error("Scrim captains assign players directly.");
      if (
        !c.withdraw &&
        (event.cancelled || Date.parse(event.endsAt) < Date.now())
      )
        throw new Error("Applications are closed for this event.");
      const old = s.applications.find(
        (a) => a.eventId === event.id && a.userId === actor.id,
      );
      if (!c.withdraw && old && ["Pending", "Approved"].includes(old.status))
        throw new Error("You have already applied.");
      if (old)
        Object.assign(old, {
          status: c.withdraw ? "Withdrawn" : "Pending",
          updatedAt: now,
        });
      else if (!c.withdraw)
        s.applications.push({
          id: randomUUID(),
          eventId: event.id,
          userId: actor.id,
          status: "Pending",
          updatedAt: now,
        });
      break;
    }
    case "eventDecision": {
      requireAdmin();
      const app = s.applications.find((a) => a.id === c.id);
      if (!app || app.status === "Withdrawn")
        throw new Error("Application is no longer active.");
      const event = s.events.find((e) => e.id === app.eventId)!;
      if (event.cancelled) throw new Error("This event is cancelled.");
      if (
        c.status === "Approved" &&
        app.status !== "Approved" &&
        s.applications.filter(
          (a) => a.eventId === app.eventId && a.status === "Approved",
        ).length >= event.capacity
      )
        throw new Error("This event is full.");
      app.status = c.status;
      app.updatedAt = now;
      audit(
        `${c.status} ${s.users.find((u) => u.id === app.userId)?.name} for ${event.title}.`,
      );
      break;
    }
  }
}
