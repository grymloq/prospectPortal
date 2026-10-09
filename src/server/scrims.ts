import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { armyFromNewRecruitText } from "./newrecruit-text";
import type { Army, Layout, Scrim, ScrimTeam, State, User } from "@/lib/types";
import { matchupDatabase } from "@/lib/matchup-database";
import { armySnapshot, catalogue } from "@/lib/catalogue";
import { armyKey, cellKey, layouts, outcomeForScore } from "@/lib/matchups";
import {
  compositionSchema,
  scopeSchema,
  gameContextSchema,
  ensureArmyLibrary,
  validateRecordedContext,
} from "./army-library-versions";
import {
  maintainLibraryMemberships,
  normalizeRosterIdentity,
} from "./army-library-identity";
import {
  onScrimTeam,
  isScrimCaptain,
  rosterWarnings,
  scrimScore,
  scrimListsSubmitted,
} from "@/lib/scrims";

const id = z.string().min(1).max(100);
const label = z.string().trim().min(1).max(150);
const link = z
  .string()
  .max(2000)
  .refine(
    (v) => !v || (/^https?:\/\//i.test(v) && URL.canParse(v)),
    "Use an http or https link.",
  );
const score = z.number().int().min(0).max(20);
const estimate = z.number().min(0).max(20).nullable();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().startsWith(v),
    "Invalid game date.",
  );
const ref = { scrimId: id, revision: z.number().int().min(0) };
const army = z.object({
  composition: compositionSchema.optional(),
  scope: scopeSchema.optional(),
  listName: label.max(100),
  listText: z
    .string()
    .max(100000)
    .refine((v) => !!v.trim(), "Paste your army list.")
    .optional(),
  faction: id,
  detachments: z.array(id).max(3),
  disposition: id,
  listUrl: link,
});
export const scrimCommands = [
  z.object({
    type: z.literal("scrimStaff"),
    ...ref,
    teamId: id,
    captainId: id,
    additionalCaptainIds: z.array(id).max(20),
    coachIds: z.array(id).max(20),
  }),
  z.object({
    type: z.literal("scrimCreate"),
    title: label,
    kind: z.enum(["internal", "external"]),
    teamSize: z.number().int().min(1).max(64),
    patchId: id,
    submissionDeadline: z.iso.datetime(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    location: z.string().trim().max(300),
    online: z.boolean(),
    onlineUrl: link,
    description: z.string().max(5000),
    teams: z.tuple([
      z.object({ name: label, captainId: id }),
      z.object({ name: label, captainId: z.string().max(100) }),
    ]),
  }),
  z.object({
    type: z.literal("scrimTeamName"),
    ...ref,
    teamId: id,
    name: label,
  }),
  z.object({
    type: z.literal("scrimRoster"),
    ...ref,
    teamId: id,
    entries: z
      .array(
        z.object({
          userId: id.optional(),
          id: id.optional(),
          name: label.optional(),
        }),
      )
      .max(64),
  }),
  z.object({
    type: z.literal("scrimSubmit"),
    ...ref,
    teamId: id,
    entryId: id,
    savedArmyId: id.optional(),
    army: army.optional(),
    listText: z.string().min(1).max(100000).optional(),
  }),
  z.object({
    type: z.literal("scrimFinalize"),
    ...ref,
    teamId: id,
    finalized: z.boolean(),
  }),
  z.object({
    type: z.literal("scrimPairings"),
    ...ref,
    pairings: z
      .array(z.object({ aId: id, bId: id, layout: z.enum(["A", "B", "C"]) }))
      .min(1)
      .max(64),
  }),
  z.object({
    type: z.literal("scrimLayoutEstimate"),
    ...ref,
    teamId: id,
    ownId: id,
    enemyId: id,
    ownArmyKey: z.string().min(1).max(2000),
    enemyArmyKey: z.string().min(1).max(2000),
    layout: z.enum(["A", "B", "C"]),
    score: estimate,
    expectedScore: estimate,
  }),
  z.object({
    type: z.literal("scrimEstimate"),
    ...ref,
    teamId: id,
    ownId: id,
    enemyId: id,
    scores: z.object({ A: estimate, B: estimate, C: estimate }),
  }),
  z.object({
    type: z.literal("scrimPlanComment"),
    ...ref,
    teamId: id,
    ownId: id,
    enemyId: id,
    text: z.string().trim().min(1).max(3000),
  }),
  z.object({
    type: z.literal("scrimReport"),
    ...ref,
    pairingId: id,
    perspective: z.enum(["a", "b"]),
    score,
    date,
    notes: z.string().max(5000).optional(),
    gameContext: gameContextSchema.optional(),
  }),
  z.object({
    type: z.literal("scrimMatchComment"),
    ...ref,
    pairingId: id,
    text: z.string().trim().min(1).max(3000),
  }),
  z.object({
    type: z.literal("scrimJournalNotes"),
    gameId: id,
    notes: z.string().max(5000),
  }),
  z.object({ type: z.literal("scrimCancel"), ...ref }),
] as const;
const schema = z.discriminatedUnion("type", scrimCommands);

function manage(actor: User, scrim: Scrim, team?: ScrimTeam) {
  return (
    actor.role === "admin" ||
    (team
      ? isScrimCaptain(team, actor.id) ||
        (team.external && isScrimCaptain(scrim.teams[0], actor.id))
      : scrim.teams.some((t) => isScrimCaptain(t, actor.id)))
  );
}
function rulesFor(state: State, scrim: Scrim) {
  return (
    state.patches?.find((p) => p.id === scrim.patchId)?.catalogue || catalogue
  );
}
function databaseMatrix(state: State, scrim: Scrim, actor?: User) {
  const source = {
    ...state,
    savedArmies: (state.savedArmies || []).filter(
      (entry) =>
        entry.shared &&
        state.users.some((user) => user.id === entry.userId && !user.removedAt),
    ),
  };
  const shared = matchupDatabase({ ...source, games: [] }, scrim.patchId);
  const visible = actor
    ? matchupDatabase(
        {
          ...source,
          games: state.games.filter(
            (game) => actor.role === "admin" || game.userId === actor.id,
          ),
        },
        scrim.patchId,
      )
    : shared;
  // Journal configurations follow the same authorized source as the main matrix.
  // Journal scores remain personal reference data, never shared plan defaults.
  return {
    ...visible,
    effective: shared.effective,
    cells: shared.cells,
    manual: shared.manual,
  };
}
function databaseId(army: Army) {
  return `db:${createHash("sha256").update(armyKey(army)).digest("hex")}`;
}
function databaseEntries(
  state: State,
  scrim: Scrim,
  matrix = databaseMatrix(state, scrim),
) {
  return matrix.armies.map(({ army }) => ({
    id: databaseId(army),
    name: army.listName || army.factionName,
    army,
  }));
}
function preparationCell(
  state: State,
  scrim: Scrim,
  own: import("@/lib/types").ScrimEntry,
  enemy: import("@/lib/types").ScrimEntry,
  matrix = databaseMatrix(state, scrim),
) {
  const shared = matrix.effective.get(
    cellKey(armyKey(own.army!), armyKey(enemy.army!)),
  );
  return {
    ownId: own.id,
    enemyId: enemy.id,
    scores: Object.fromEntries(
      layouts.map((layout) => [
        layout,
        shared?.[layout].count ? shared[layout].average : null,
      ]),
    ) as Record<Layout, number | null>,
    comments: [],
  };
}
function seedEstimates(state: State, scrim: Scrim) {
  // Only already-shared estimates seed a team plan. Private journals never become team data.
  const shared = databaseMatrix(state, scrim);
  for (const team of scrim.teams) {
    if (team.external) {
      team.estimates = [];
      continue;
    }
    const enemy = scrim.teams.find((t) => t.id !== team.id)!;
    const preparation = team.estimates.filter((e) =>
      e.enemyId.startsWith("db:"),
    );
    team.estimates = [
      ...preparation,
      ...team.entries.flatMap((own) =>
        enemy.entries.map((opponent) => {
          const existing = team.estimates.find(
            (e) => e.ownId === own.id && e.enemyId === opponent.id,
          );
          const target = opponent.army && databaseId(opponent.army);
          const prepared =
            target &&
            preparation.find((e) => e.ownId === own.id && e.enemyId === target);
          if (
            prepared &&
            (!existing?.updatedAt ||
              (prepared.updatedAt || "") > existing.updatedAt)
          )
            return { ...structuredClone(prepared), enemyId: opponent.id };
          if (existing) return existing;
          const cell =
            own.army && opponent.army
              ? shared.effective.get(
                  cellKey(armyKey(own.army), armyKey(opponent.army)),
                )
              : undefined;
          return {
            ownId: own.id,
            enemyId: opponent.id,
            scores: Object.fromEntries(
              layouts.map((layout) => [
                layout,
                cell?.[layout].count ? cell[layout].average : null,
              ]),
            ) as Record<Layout, number | null>,
            comments: [],
          };
        }),
      ),
    ];
  }
}

export function scrimView(state: State, scrim: Scrim, actor: User): Scrim {
  const visible = structuredClone(scrim);
  const revealed =
    Date.now() >= Date.parse(scrim.submissionDeadline) &&
    scrimListsSubmitted(scrim);
  visible.listsRevealed = revealed;
  const database = databaseMatrix(state, scrim, actor);
  visible.databaseEntries = databaseEntries(state, scrim, database);
  if (revealed) seedEstimates(state, visible);
  for (const team of visible.teams) {
    const ownTeam =
      onScrimTeam(team, actor.id) ||
      (team.external && isScrimCaptain(scrim.teams[0], actor.id));
    if (!scrim.completedAt && !ownTeam) team.estimates = [];
    else if (!revealed) {
      team.estimates = team.entries
        .filter((e) => e.army)
        .flatMap((own) =>
          visible.databaseEntries!.map(
            (enemy) =>
              team.estimates.find(
                (e) => e.ownId === own.id && e.enemyId === enemy.id,
              ) || preparationCell(state, scrim, own, enemy, database),
          ),
        );
    } else
      team.estimates = team.estimates.filter(
        (e) => !e.enemyId.startsWith("db:"),
      );
    if (!revealed && !ownTeam && actor.role !== "admin") {
      team.entries = [];
    }
    // Library identifiers are private and unnecessary outside a player's own submission.
    for (const entry of team.entries)
      if (entry.userId !== actor.id) delete entry.savedArmyId;
  }
  return visible;
}

export function executeScrim(state: State, actor: User, input: unknown) {
  const command = schema.parse(input);
  const now = new Date().toISOString();
  const audit = (text: string) =>
    state.audit.unshift({
      id: randomUUID(),
      actor: actor.id,
      text: `${actor.name} ${text}`,
      createdAt: now,
    });
  state.scrims ||= [];
  if (command.type === "scrimJournalNotes") {
    const game = state.games.find(
      (g) =>
        g.id === command.gameId && g.scrimPairingId && g.userId === actor.id,
    );
    if (!game) throw new Error("Choose a scrim game from your own journal.");
    game.notes = command.notes;
    game.updatedAt = now;
    return;
  }
  if (command.type === "scrimCreate") {
    if (actor.role !== "admin") throw new Error("Admin access required.");
    const patch = state.patches?.find(
      (p) => p.id === command.patchId && !p.removedAt,
    );
    if (!patch) throw new Error("Choose an available rules patch.");
    if (
      command.teamSize >
      (patch.catalogue || catalogue).dispositions.length * 2
    )
      throw new Error(
        "Team size exceeds the maximum of two lists per disposition.",
      );
    if (
      Date.parse(command.submissionDeadline) <= Date.now() ||
      Date.parse(command.submissionDeadline) > Date.parse(command.startsAt) ||
      Date.parse(command.startsAt) >= Date.parse(command.endsAt)
    )
      throw new Error(
        "Use a future submission deadline, followed by the pairing date and game end.",
      );
    if (!command.online && !command.location)
      throw new Error("Enter a location for an in-person scrim.");
    const teams = command.teams.map((t, index): ScrimTeam => {
      const external = command.kind === "external" && index === 1;
      const captain = state.users.find(
        (u) => u.id === t.captainId && u.confirmedMember && !u.removedAt,
      );
      if (!external && !captain)
        throw new Error(
          "Choose a confirmed member as captain for each internal team.",
        );
      return {
        id: randomUUID(),
        name: t.name,
        external,
        captainId: external ? "" : captain!.id,
        captainName: external ? "External team" : captain!.name,
        entries: [],
        estimates: [],
      };
    }) as [ScrimTeam, ScrimTeam];
    if (!teams[1].external && teams[0].captainId === teams[1].captainId)
      throw new Error("Choose a different captain for each team.");
    const scrimId = randomUUID(),
      eventId = randomUUID();
    state.scrims.push({
      id: scrimId,
      eventId,
      revision: 0,
      kind: command.kind,
      teamSize: command.teamSize,
      patchId: patch.id,
      submissionDeadline: command.submissionDeadline,
      teams,
      pairings: [],
    });
    state.events.push({
      id: eventId,
      scrimId,
      title: command.title,
      location: command.location,
      online: command.online,
      onlineUrl: command.onlineUrl,
      startsAt: command.startsAt,
      endsAt: command.endsAt,
      capacity: command.teamSize * (command.kind === "internal" ? 2 : 1),
      description: command.description,
      cancelled: false,
    });
    audit(`created scrim ${command.title}.`);
    return;
  }
  const scrim = state.scrims.find((s) => s.id === command.scrimId);
  if (!scrim) throw new Error("Scrim not found.");
  if (command.revision !== scrim.revision)
    throw new Error(
      "This scrim changed. Refresh the workspace and review the latest version before saving.",
    );
  if (scrim.cancelled) throw new Error("This scrim has been cancelled.");
  const event = state.events.find((e) => e.id === scrim.eventId)!;
  const team =
    "teamId" in command
      ? scrim.teams.find((t) => t.id === command.teamId)
      : undefined;
  if ("teamId" in command && !team) throw new Error("Team not found.");
  const drafting = () => {
    if (scrim.pairedAt || Date.now() >= Date.parse(scrim.submissionDeadline))
      throw new Error(
        "The submission deadline has passed. Rosters and lists are locked.",
      );
    if (team?.finalizedAt)
      throw new Error("Reopen the team submission before editing it.");
  };
  switch (command.type) {
    case "scrimStaff": {
      if (actor.role !== "admin")
        throw new Error("Only admins can change team captains and coaches.");
      if (team!.external)
        throw new Error("Staff assignments require an internal team.");
      if (scrim.completedAt) throw new Error("This scrim is complete.");
      const ids = [
        command.captainId,
        ...command.additionalCaptainIds,
        ...command.coachIds,
      ];
      if (new Set(ids).size !== ids.length)
        throw new Error("Each person can have only one staff role.");
      const other = scrim.teams.find((t) => t.id !== team!.id)!;
      const members = ids.map((id) => {
        const user = state.users.find(
          (u) => u.id === id && u.confirmedMember && !u.removedAt,
        );
        if (!user)
          throw new Error("Choose a confirmed member for each staff role.");
        if (onScrimTeam(other, id))
          throw new Error("Staff cannot belong to opposing teams.");
        if (
          command.coachIds.includes(id) &&
          team!.entries.some((entry) => entry.userId === id)
        )
          throw new Error("Coaches must be non-playing team members.");
        return user;
      });
      const person = (id: string) => {
        const user = members.find((u) => u.id === id)!;
        return { userId: id, name: user.name };
      };
      team!.captainId = command.captainId;
      team!.captainName = members[0].name;
      team!.additionalCaptains = command.additionalCaptainIds.map(person);
      team!.coaches = command.coachIds.map(person);
      audit(
        `updated captains and non-playing coaches for ${team!.name}: captains ${[team!.captainName, ...team!.additionalCaptains.map((p) => p.name)].join(", ")}; coaches ${team!.coaches.map((p) => p.name).join(", ") || "none"}.`,
      );
      break;
    }
    case "scrimTeamName": {
      if (!manage(actor, scrim, team))
        throw new Error(
          "Only this team's captain or an admin can rename the team.",
        );
      const previous = team!.name;
      team!.name = command.name;
      audit(`renamed scrim team ${previous} to ${team!.name}.`);
      break;
    }
    case "scrimRoster": {
      if (!manage(actor, scrim, team))
        throw new Error(
          "Only this team's captain or an admin can assign players.",
        );
      drafting();
      if (command.entries.length > scrim.teamSize)
        throw new Error("The team is full.");
      const other = scrim.teams.find((t) => t.id !== team!.id)!;
      const entries = command.entries.map((e) => {
        if (team!.external) {
          if (e.userId || !e.name)
            throw new Error("Enter a name for each external player.");
          const old = e.id
            ? team!.entries.find((entry) => entry.id === e.id)
            : undefined;
          if (e.id && !old) throw new Error("External player not found.");
          return { ...old, id: old?.id || randomUUID(), name: e.name };
        }
        const user = state.users.find(
          (u) => u.id === e.userId && u.confirmedMember && !u.removedAt,
        );
        if (!user) throw new Error("Choose a confirmed member.");
        if (
          other.entries.some((entry) => entry.userId === user.id) ||
          onScrimTeam(other, user.id)
        )
          throw new Error("A player or captain cannot belong to both teams.");
        if (team!.coaches?.some((person) => person.userId === user.id))
          throw new Error(
            "Remove the coach assignment before adding this person as a player.",
          );
        const old = team!.entries.find((entry) => entry.userId === user.id);
        return {
          ...old,
          id: old?.id || randomUUID(),
          userId: user.id,
          name: user.name,
        };
      });
      if (
        new Set(entries.map((e) => e.id)).size !== entries.length ||
        new Set(command.entries.filter((e) => e.userId).map((e) => e.userId))
          .size !== command.entries.filter((e) => e.userId).length
      )
        throw new Error("Each player can appear only once.");
      team!.entries = entries;
      scrim.teams.forEach((t) => {
        t.estimates = t.estimates.filter(
          (e) =>
            e.enemyId.startsWith("db:") &&
            t.entries.some((entry) => entry.id === e.ownId),
        );
      });
      audit(`updated the ${team!.name} scrim roster.`);
      break;
    }
    case "scrimSubmit": {
      const entry = team!.entries.find((e) => e.id === command.entryId);
      if (!entry || (!manage(actor, scrim, team) && entry.userId !== actor.id))
        throw new Error(
          "Submit only your own list or a list for a team you captain.",
        );
      drafting();
      let snapshot: Army;
      if (
        command.listText !== undefined &&
        (command.savedArmyId || command.army)
      )
        throw new Error("Choose one list submission method.");
      let savedArmyId = command.savedArmyId;
      if (savedArmyId) {
        const saved = state.savedArmies?.find(
          (a) =>
            a.id === savedArmyId &&
            a.userId === entry.userId &&
            a.patchId === scrim.patchId &&
            (a.userId === actor.id || a.shared),
        );
        if (!saved)
          throw new Error(
            "Choose an available saved army belonging to this player and rules patch.",
          );
        snapshot = structuredClone(saved.army);
      } else {
        if (command.listText !== undefined)
          snapshot = armyFromNewRecruitText(
            command.listText,
            rulesFor(state, scrim),
          );
        else {
          if (!command.army) throw new Error("Enter an army list.");
          snapshot = armySnapshot(command.army, rulesFor(state, scrim), 3);
        }
        if (snapshot.composition)
          snapshot.composition = normalizeRosterIdentity(snapshot.composition);
        if (entry.userId) {
          savedArmyId = randomUUID();
          (state.savedArmies ||= []).push({
            id: savedArmyId,
            userId: entry.userId,
            patchId: scrim.patchId,
            army: structuredClone(snapshot),
            shared: false,
            ownerName: entry.name,
            updatedAt: now,
          });
        }
      }
      const changed = !entry.army || armyKey(entry.army) !== armyKey(snapshot);
      entry.army = snapshot;
      entry.savedArmyId = savedArmyId;
      if (savedArmyId) {
        ensureArmyLibrary(state);
        entry.listVersionId = state.savedArmies!.find(
          (a) => a.id === savedArmyId,
        )?.currentVersionId;
        maintainLibraryMemberships(state, [savedArmyId]);
      } else delete entry.listVersionId;
      scrim.teams.forEach((t) => {
        t.estimates = t.estimates.filter(
          (e) =>
            e.enemyId.startsWith("db:") &&
            !(changed && t.id === team!.id && e.ownId === entry.id),
        );
      });
      audit(`submitted ${entry.name}'s list for ${team!.name}.`);
      break;
    }
    case "scrimFinalize": {
      if (!manage(actor, scrim, team))
        throw new Error(
          "Only this team's captain or an admin can finalize its submission.",
        );
      if (Date.now() >= Date.parse(scrim.submissionDeadline) || scrim.pairedAt)
        throw new Error(
          "The submission deadline has passed. Rosters and lists are locked.",
        );
      if (command.finalized) {
        const warnings = rosterWarnings(
          scrim,
          team!,
          rulesFor(state, scrim).dispositions,
        );
        if (warnings.length) throw new Error(warnings.join(" "));
        team!.finalizedAt = now;
      } else team!.finalizedAt = undefined;
      if (scrim.teams.every((t) => t.finalizedAt)) seedEstimates(state, scrim);
      audit(
        `${command.finalized ? "finalized" : "reopened"} the ${team!.name} submission.`,
      );
      break;
    }
    case "scrimPairings": {
      if (!manage(actor, scrim))
        throw new Error("Only captains or admins can enter pairings.");
      if (scrim.pairedAt) throw new Error("Published pairings are locked.");
      if (Date.now() < Date.parse(scrim.submissionDeadline))
        throw new Error("Pairings open at the list submission deadline.");
      if (!scrim.teams.every((t) => t.finalizedAt))
        throw new Error("Both teams must finalize their lists before pairing.");
      if (
        command.pairings.length !== scrim.teamSize ||
        new Set(command.pairings.map((p) => p.aId)).size !== scrim.teamSize ||
        new Set(command.pairings.map((p) => p.bId)).size !== scrim.teamSize
      )
        throw new Error("Pair every player exactly once.");
      for (const pair of command.pairings) {
        if (
          !scrim.teams[0].entries.some((e) => e.id === pair.aId) ||
          !scrim.teams[1].entries.some((e) => e.id === pair.bId)
        )
          throw new Error("Choose players from opposite teams.");
      }
      scrim.pairings = command.pairings.map((p) => ({
        ...p,
        id: randomUUID(),
        round: 1,
        comments: [],
      }));
      scrim.pairedAt = now;
      audit(`published pairings for ${event.title}.`);
      break;
    }
    case "scrimEstimate":
    case "scrimLayoutEstimate":
    case "scrimPlanComment": {
      if (!onScrimTeam(team!, actor.id))
        throw new Error("Only team members can change their team's matrix.");
      const revealed =
        Date.now() >= Date.parse(scrim.submissionDeadline) &&
        scrimListsSubmitted(scrim);
      if (revealed) seedEstimates(state, scrim);
      else if (!command.enemyId.startsWith("db:"))
        throw new Error("Opposing lists are not revealed yet.");
      if (revealed && command.enemyId.startsWith("db:"))
        throw new Error("Choose an opposing team's submitted list.");
      let cell = team!.estimates.find(
        (e) => e.ownId === command.ownId && e.enemyId === command.enemyId,
      );
      if (!revealed) {
        const own = team!.entries.find((e) => e.id === command.ownId && e.army);
        const database = databaseMatrix(state, scrim, actor);
        const enemy = databaseEntries(state, scrim, database).find(
          (e) => e.id === command.enemyId,
        );
        if (!own || !enemy)
          throw new Error(
            "Choose a submitted team list and a public database list.",
          );
        if (!cell) {
          cell = preparationCell(state, scrim, own, enemy, database);
          team!.estimates.push(cell);
        }
      }
      if (!cell) throw new Error("Matchup not found.");
      if (command.type === "scrimLayoutEstimate") {
        const own = team!.entries.find((e) => e.id === command.ownId)?.army;
        const enemy = revealed
          ? scrim.teams
              .find((t) => t.id !== team!.id)
              ?.entries.find((e) => e.id === command.enemyId)?.army
          : databaseEntries(
              state,
              scrim,
              databaseMatrix(state, scrim, actor),
            ).find((e) => e.id === command.enemyId)?.army;
        if (
          !own ||
          !enemy ||
          armyKey(own) !== command.ownArmyKey ||
          armyKey(enemy) !== command.enemyArmyKey
        )
          throw new Error(
            "These army lists changed. Refresh the workspace before saving.",
          );
        if (cell.scores[command.layout] !== command.expectedScore)
          throw new Error(
            "This estimate changed. Refresh the workspace and review the latest value before saving.",
          );
      }
      if (
        command.type === "scrimEstimate" ||
        command.type === "scrimLayoutEstimate"
      ) {
        const scores =
          command.type === "scrimLayoutEstimate"
            ? { ...cell.scores, [command.layout]: command.score }
            : command.scores;
        cell.history ||= [
          {
            scores: { ...cell.scores },
            authorName: "Shared starting estimates",
            createdAt: now,
          },
        ];
        cell.history.push({
          scores: { ...scores },
          authorName: actor.name,
          createdAt: now,
        });
        cell.scores = scores;
      } else
        cell.comments.push({
          id: randomUUID(),
          authorId: actor.id,
          authorName: actor.name,
          text: command.text,
          createdAt: now,
        });
      cell.updatedBy = actor.name;
      cell.updatedAt = now;
      break;
    }
    case "scrimReport": {
      const pair = scrim.pairings.find((p) => p.id === command.pairingId);
      if (!pair) throw new Error("Pairing not found.");
      const a = scrim.teams[0].entries.find((e) => e.id === pair.aId)!;
      const b = scrim.teams[1].entries.find((e) => e.id === pair.bId)!;
      const own = command.perspective === "a" ? a : b;
      if (!manage(actor, scrim) && own.userId !== actor.id)
        throw new Error(
          "Only the paired players, captains, or admins may report a result.",
        );
      if (Date.now() < Date.parse(event.startsAt))
        throw new Error("The pairing date has not arrived yet.");
      const localDay = (value: string) =>
        new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Europe/Stockholm",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(value));
      if (
        command.date < localDay(event.startsAt) ||
        command.date > localDay(event.endsAt) ||
        command.date > localDay(now)
      )
        throw new Error(
          "Use a played date within the scrim's date span, no later than today.",
        );
      pair.scoreA =
        command.perspective === "a" ? command.score : 20 - command.score;
      pair.date = command.date;
      pair.updatedBy = actor.name;
      pair.updatedAt = now;
      if (command.gameContext) {
        const recorded = validateRecordedContext(command.gameContext)!;
        pair.gameContext =
          command.perspective === "a"
            ? recorded
            : {
                ...recorded,
                ownMission: recorded.enemyMission,
                enemyMission: recorded.ownMission,
              };
      }
      for (const [player, opponent, value] of [
        [a, b, pair.scoreA],
        [b, a, 20 - pair.scoreA],
      ] as const) {
        if (!player.userId) continue;
        const previous = state.games.find(
          (g) => g.scrimPairingId === pair.id && g.userId === player.userId,
        );
        const notes =
          actor.id === player.userId && command.notes !== undefined
            ? command.notes
            : previous?.notes || "";
        const game = {
          id: previous?.id || randomUUID(),
          userId: player.userId,
          date: command.date,
          opponent: opponent.name,
          opponentUserId: opponent.userId,
          own: structuredClone(player.army!),
          enemy: structuredClone(opponent.army!),
          ownListVersionId: player.listVersionId,
          enemyListVersionId: opponent.listVersionId,
          gameContext: pair.gameContext
            ? structuredClone(
                player === a
                  ? pair.gameContext
                  : {
                      ...pair.gameContext,
                      ownMission: pair.gameContext.enemyMission,
                      enemyMission: pair.gameContext.ownMission,
                    },
              )
            : undefined,
          score: value,
          layout: pair.layout,
          patchId: scrim.patchId,
          outcome: outcomeForScore(value),
          context: "Scrim",
          eventId: event.id,
          notes,
          updatedAt: now,
          scrimId: scrim.id,
          scrimPairingId: pair.id,
        };
        if (previous) Object.assign(previous, game);
        else state.games.push(game);
      }
      if (scrimScore(scrim).complete) scrim.completedAt ||= now;
      audit(
        `reported ${a.name} ${pair.scoreA}–${20 - pair.scoreA} ${b.name} in ${event.title}.`,
      );
      break;
    }
    case "scrimMatchComment": {
      const pair = scrim.pairings.find((p) => p.id === command.pairingId);
      if (!pair) throw new Error("Pairing not found.");
      const paired = scrim.teams
        .flatMap((t) => t.entries)
        .some(
          (e) =>
            (e.id === pair.aId || e.id === pair.bId) && e.userId === actor.id,
        );
      if (!paired && !manage(actor, scrim))
        throw new Error(
          "Only the paired players, captains, or admins may comment on this match.",
        );
      pair.comments.push({
        id: randomUUID(),
        authorId: actor.id,
        authorName: actor.name,
        text: command.text,
        createdAt: now,
      });
      break;
    }
    case "scrimCancel": {
      if (actor.role !== "admin") throw new Error("Admin access required.");
      if (scrim.completedAt)
        throw new Error("A completed scrim cannot be cancelled.");
      scrim.cancelled = true;
      event.cancelled = true;
      audit(`cancelled ${event.title}.`);
      break;
    }
  }
  scrim.revision++;
}
