import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { State, User } from "@/lib/types";
import { catalogue, armySnapshot } from "@/lib/catalogue";
import { ensurePatches } from "@/lib/patches";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const digest = scryptSync(password, salt, 64);
  return timingSafeEqual(digest, Buffer.from(hash, "hex"));
}
const databasePath =
  process.env.TEAM_DB_PATH ||
  path.join(process.cwd(), ".local", "team-sweden.sqlite");
mkdirSync(path.dirname(databasePath), { recursive: true });
const globalDb = globalThis as unknown as { teamDb?: DatabaseSync };
export const db = globalDb.teamDb ?? new DatabaseSync(databasePath);
globalDb.teamDb = db;
db.exec(
  "PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);",
);

function seed(): State {
  const password = hashPassword("Sweden40k!");
  const names = [
    "Alex Berg",
    "Robin Lind",
    "Sam Nyström",
    "Kim Dahl",
    "Charlie Ek",
    "Dani Holm",
    "Jamie Lund",
    "Taylor Sjö",
    "Elliot Sand",
    "Noel Vik",
    "Mika Sol",
    "Lo Gran",
  ];
  const armies = [
    "Orks",
    "Aeldari",
    "Space Marines",
    "Tyranids",
    "Necrons",
    "Astra Militarum",
    "Adeptus Custodes",
    "Death Guard",
    "Drukhari",
    "T'au Empire",
    "World Eaters",
    "Chaos Knights",
  ];
  const phases: State["phases"] = [
    { id: "application", name: "Application", kind: "application" },
    { id: "phase1", name: "Phase 1", kind: "review" },
    { id: "phase2", name: "Phase 2", kind: "review" },
    { id: "selected", name: "Selected", kind: "selected" },
  ];
  const users: User[] = [
    {
      id: "admin",
      name: "Team captain",
      email: "admin@teamsweden.local",
      role: "admin",
      faction: catalogue.factions.find((f) => f.name === "Orks")!.id,
      city: "Stockholm",
      bio: "Local demonstration admin account.",
      phaseId: null,
      rejected: false,
      application: "",
      password,
    },
    ...names.map((name, i): User => ({
      id: `p${i + 1}`,
      name,
      email:
        i === 0 ? "player@teamsweden.local" : `player${i + 1}@teamsweden.local`,
      role: "member",
      faction:
        catalogue.factions.find((f) => f.name === armies[i])?.id ||
        catalogue.factions[0].id,
      city: ["Stockholm", "Göteborg", "Malmö", "Uppsala"][i % 4],
      bio: "Focused on better decisions, consistent practice, and playing for the team.",
      phaseId: [
        "selected",
        "phase2",
        "phase1",
        "application",
        "application",
        "phase1",
        "selected",
        "phase2",
        "application",
        "selected",
        "phase1",
        "application",
      ][i],
      rejected: false,
      application:
        "I would like to represent Sweden. I can attend team practice and keep a regular game journal.",
      password,
    })),
  ];
  function army(faction: string) {
    const f = catalogue.factions.find((f) => f.id === faction)!;
    const d = f.detachments[0];
    return armySnapshot({
      faction,
      detachments: d ? [d.id] : [],
      disposition:
        d?.dispositions[0] ||
        catalogue.dispositions.find((d) => d.name === "Take and Hold")!.id,
      listUrl: "",
    });
  }
  const games: State["games"] = users.slice(1).flatMap((u, i) =>
    Array.from({ length: i < 4 ? 3 : 2 }, (_, j) => ({
      id: `g${i}-${j}`,
      userId: u.id,
      date: `2026-09-${String(1 + ((i + j) % 8)).padStart(2, "0")}`,
      opponent: ["Practice partner", "Club opponent", "Training partner"][j],
      own: army(u.faction),
      enemy: army(users[1 + ((i + 2) % 12)].faction),
      score: [15, 8, 12, 10, 17, 6][(i + j) % 6],
      outcome: ([15, 8, 12, 10, 17, 6][(i + j) % 6] > 10
        ? "Win"
        : [15, 8, 12, 10, 17, 6][(i + j) % 6] === 10
          ? "Draw"
          : "Loss") as "Win" | "Draw" | "Loss",
      context: "Team practice",
      notes:
        "Good objective discipline. Review the deployment plan before the next game.",
      eventId: "",
      updatedAt: new Date().toISOString(),
    })),
  );
  const goals: State["goals"] = users.slice(1).flatMap((u, i) => [
    {
      id: `goal${i}`,
      userId: u.id,
      title: [
        "Improve clock discipline",
        "Plan the first two turns",
        "Refine deployment",
        "Review target priority",
      ][i % 4],
      description:
        "Record three practice games and explain the decisions that changed the result.",
      due: "2026-09-30",
      status: (i % 3 === 0 ? "Completed" : "In progress") as
        "Completed" | "In progress",
      evidence: "",
      gameId: "",
      createdBy: "Team captain",
    },
  ]);
  return {
    users,
    phases,
    games,
    goals,
    evaluations: users.slice(1).map((u, i) => ({
      userId: u.id,
      revision: 1,
      ratings: Array.from({ length: 18 }, (_, j) => ({
        score: i > 8 ? null : 3 + ((i + j) % 3),
        note: "",
      })),
      updatedBy: "Team captain",
      updatedAt: new Date().toISOString(),
    })),
    messages: [
      {
        id: "welcome",
        userId: "p1",
        authorId: "admin",
        authorName: "Team captain",
        internal: false,
        text: "Welcome back, Alex. For the next practice, focus on your deployment plan and leave time to review it together.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "internal1",
        userId: "p1",
        authorId: "admin",
        authorName: "Team captain",
        internal: true,
        text: "Internal sample note: review consistency across different matchups before the next selection discussion.",
        createdAt: new Date().toISOString(),
      },
    ],
    events: [
      {
        id: "event1",
        title: "Stockholm training day",
        location: "Stockholm gaming club",
        startsAt: "2026-09-19T08:00:00.000Z",
        endsAt: "2026-09-19T16:00:00.000Z",
        capacity: 8,
        description:
          "Two practice rounds, pairing discussions, and a shared review of deployment decisions. Bring your army and a current list.",
        cancelled: false,
      },
      {
        id: "event2",
        title: "Team practice weekend",
        location: "Göteborg",
        startsAt: "2026-10-03T08:00:00.000Z",
        endsAt: "2026-10-04T15:00:00.000Z",
        capacity: 16,
        description:
          "A full weekend of match practice and collaborative review.",
        cancelled: false,
      },
    ],
    applications: [
      {
        id: "a1",
        eventId: "event1",
        userId: "p1",
        status: "Approved",
        updatedAt: new Date().toISOString(),
      },
      {
        id: "a2",
        eventId: "event1",
        userId: "p2",
        status: "Pending",
        updatedAt: new Date().toISOString(),
      },
    ],
    audit: [],
  };
}
if (!db.prepare("SELECT id FROM app_state WHERE id=1").get())
  db.prepare("INSERT OR IGNORE INTO app_state VALUES(1,?)").run(
    JSON.stringify(seed()),
  );
export function readState(): State {
  const state: State = JSON.parse(
    (
      db.prepare("SELECT value FROM app_state WHERE id=1").get() as {
        value: string;
      }
    ).value,
  );
  ensurePatches(state);
  return state;
}
export function transaction<T>(work: (s: State) => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const s = readState();
    const result = work(s);
    db.prepare("UPDATE app_state SET value=? WHERE id=1").run(
      JSON.stringify(s),
    );
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function publicUser(user: User): User {
  const safe = { ...user };
  delete safe.password;
  return safe;
}
