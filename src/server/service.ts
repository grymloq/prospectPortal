import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { State, User, View } from "@/lib/types";
import { armySnapshot, catalogue } from "@/lib/catalogue";
import { publicUser } from "./public-user";
import { outcomeForScore } from "@/lib/matchups";
import { ensurePatches } from "@/lib/patches";
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
  faction: id,
  detachments: z.array(id).max(3),
  disposition: id,
  listUrl: url,
});
const commands = z.discriminatedUnion("type", [
  z.object({ type: z.literal("patch"), name: text.max(100), date }),
  z.object({
    type: z.literal("profile"),
    name: text.max(100),
    city: z.string().max(100),
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
    opponent: text.max(120),
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
    location: text.max(300),
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
  const admin = actor.role === "admin";
  return {
    me: publicUser(actor),
    patches: [...s.patches!].sort((a, b) => b.date.localeCompare(a.date)),
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
  ensurePatches(s);
  const c = commands.parse(input);
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
    case "patch": {
      requireAdmin();
      if (s.patches!.some((p) => p.date === c.date))
        throw new Error("A patch already exists for this date.");
      s.patches!.push({ id: c.date, name: c.name, date: c.date });
      audit("Added patch: " + c.name + " — " + c.date);
      break;
    }
    case "profile": {
      if (!catalogue.factions.some((f) => f.id === c.faction))
        throw new Error("Unknown faction.");
      Object.assign(actor, {
        name: c.name,
        city: c.city,
        bio: c.bio,
        faction: c.faction,
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
      if (!c.patchId || !s.patches!.some((p) => p.id === c.patchId))
        throw new Error("Choose a valid patch.");
      if (!c.layout) throw new Error("Choose layout A, B, or C.");
      const old = c.id ? s.games.find((g) => g.id === c.id) : undefined;
      if (c.id && (!old || old.userId !== actor.id))
        throw new Error("You can edit only your own games.");
      if (c.eventId && !s.events.some((e) => e.id === c.eventId))
        throw new Error("Event not found.");
      const { type: _, ...fields } = c;
      void _;
      const game = {
        ...fields,
        outcome: outcomeForScore(c.score),
        id: old?.id || randomUUID(),
        userId: actor.id,
        own: armySnapshot(c.own),
        enemy: armySnapshot(c.enemy),
        updatedAt: now,
      };
      s.games = s.games.filter((g) => g.id !== game.id);
      s.games.push(game);
      break;
    }
    case "deleteGame": {
      const game = s.games.find((g) => g.id === c.id);
      if (!game || game.userId !== actor.id)
        throw new Error("You can delete only your own games.");
      s.games = s.games.filter((g) => g.id !== c.id);
      for (const goal of s.goals) if (goal.gameId === c.id) goal.gameId = "";
      break;
    }
    case "event": {
      requireAdmin();
      if (Date.parse(c.endsAt) <= Date.parse(c.startsAt))
        throw new Error("End time must follow start time.");
      const old = c.id ? s.events.find((e) => e.id === c.id) : undefined;
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
