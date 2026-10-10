import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import type { Army, ArmyListVersion, State, User } from "../../src/lib/types";
import {
  classifyLibraryVersion,
  normalizeRosterIdentity,
} from "../../src/server/army-library-identity";
export const migrationPath =
  "supabase/migrations/20261010004231_library_read_tables.sql";
export const member: User = {
  id: "member",
  name: "Member",
  email: "PRIVATE EMAIL",
  role: "member",
  confirmedMember: true,
  faction: "f",
  city: "PRIVATE CITY",
  bio: "PRIVATE BIO",
  phaseId: null,
  rejected: false,
  application: "PRIVATE APPLICATION",
};
export function libraryFixture(lists = 12, games = 60): State {
  const state: State = {
    users: [
      member,
      { ...member, id: "admin", role: "admin" },
      { ...member, id: "removed", removedAt: "2026-10-01" },
      { ...member, id: "pending", confirmedMember: false },
    ],
    phases: [],
    games: [],
    evaluations: [],
    messages: [],
    goals: [],
    events: [],
    applications: [],
    audit: [],
    savedArmies: [],
    armyVersions: [],
    libraryMemberships: [],
    matrixLists: [],
    patches: [{ id: "p", name: "Patch", date: "2026-10-01" }],
    defaultPatchId: "p",
  };
  for (let i = 0; i < lists; i++) {
    const army: Army = {
      faction: `f${i % 3}`,
      factionName: `Faction ${i % 3}`,
      detachments: ["d"],
      detachmentNames: ["Detachment"],
      disposition: "s",
      dispositionName: "Disposition",
      listUrl: "",
      listName: `List ${i}`,
      revision: 1,
      composition: normalizeRosterIdentity({
        status: "complete",
        normalizationVersion: "newrecruit-selected-v1",
        selections: Array.from({ length: 20 }, (_, n) => ({
          sourceId: `newrecruit:system:catalogue:unit-${n}`,
          name: `Unit ${n}`,
          kind: "unit" as const,
          quantity: 1 + (i % 2),
          selections: [],
        })),
        reasons: [],
        source: {
          provider: "newrecruit",
          systemId: "system",
          catalogueId: "catalogue",
        },
      }),
    };
    for (let number = 1; number <= 3; number++) {
      const version: ArmyListVersion = {
        id: `list-${i}:v${number}`,
        listId: `list-${i}`,
        userId: member.id,
        number,
        patchId: "p",
        army: structuredClone(army),
        createdAt: `2026-10-0${number}T00:00:00.000Z`,
        published: number !== 2,
      };
      state.armyVersions!.push(version);
      state.libraryMemberships!.push(classifyLibraryVersion(version, state));
    }
    state.savedArmies!.push({
      id: `list-${i}`,
      userId: member.id,
      ownerName: member.name,
      patchId: "p",
      army,
      shared: i !== lists - 1,
      currentVersionId: `list-${i}:v3`,
      listRevision: 3,
      updatedAt: "2026-10-03T00:00:00.000Z",
    });
  }
  for (let i = 0; i < games; i++)
    state.games.push({
      id: `game-${i}`,
      userId: member.id,
      date: "2026-10-01",
      opponent: "PRIVATE OPPONENT",
      own: structuredClone(state.savedArmies![i % lists].army),
      enemy: structuredClone(state.savedArmies![(i + 1) % lists].army),
      score: 10 + (i % 5),
      patchId: "p",
      outcome: "Win",
      context: "PRIVATE CONTEXT",
      notes: "PRIVATE NOTES",
      eventId: "PRIVATE EVENT",
      updatedAt: "2026-10-01",
      libraryContribution: i % 2 === 0,
      ownListVersionId: `list-${i % lists}:v3`,
    });
  return state;
}
export async function postgresFixture(state: State) {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  await db.exec(
    readFileSync("supabase/migrations/202609080001_portal.sql", "utf8"),
  );
  await db.query("update public.portal_state set value=$1::jsonb where id=1", [
    JSON.stringify(state),
  ]);
  return db;
}
export async function migrateLibrary(db: PGlite) {
  await db.exec(readFileSync(migrationPath, "utf8"));
}
export async function readLibrary(db: PGlite, actorId = member.id) {
  const { rows } = await db.query<{
    context: { state: State; actor: User; revision: number };
  }>("select public.library_read_context($1) context", [actorId]);
  return rows[0].context;
}
