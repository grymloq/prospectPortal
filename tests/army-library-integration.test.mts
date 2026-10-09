import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import type { State } from "../src/lib/types";
mkdirSync(".local", { recursive: true });
const scratch = mkdtempSync(path.resolve(".local/library-integration-qa-"));
process.env.TEAM_DB_PATH = path.join(scratch, "isolated.sqlite");
const { db, readState, transaction } = await import("../src/server/store");
const { execute, viewState } = await import("../src/server/service");
const { ensureArmyLibrary } =
  await import("../src/server/army-library-versions");
const { queryArmyLibrary, libraryContextId } =
  await import("../src/server/army-library");
const { consolidationPreview } =
  await import("../src/server/army-library-identity");
const { previewView } = await import("../src/server/access-preview");
const baseline = readState();
after(() => {
  db.close();
  assert.ok(scratch.startsWith(path.resolve(".local") + path.sep));
  rmSync(scratch, { recursive: true, force: true });
});

function fixture() {
  const state: State = structuredClone(baseline);
  state.savedArmies = [];
  state.armyVersions = [];
  state.libraryMemberships = [];
  state.libraryDiscussions = [];
  state.matrixLists = [];
  state.games = [];
  state.scrims = [];
  const actor = state.users.find((user) => user.id === "p1")!;
  const other = state.users.find((user) => user.id === "p3")!;
  const admin = state.users.find((user) => user.role === "admin")!;
  const source = baseline.games.find((game) => game.userId === actor.id)!;
  const army = { ...source.own, listName: "Integration list", listUrl: "" };
  execute(state, actor, { type: "saveArmy", patchId: source.patchId, army });
  const list = state.savedArmies![0];
  return { state, actor, other, admin, source, army, list };
}
function detail(state: State, actor: State["users"][number], id: string) {
  return queryArmyLibrary(state, actor, {
    patchId:
      state.savedArmies?.find((list) => list.id === id)?.patchId || "all",
    target: { kind: "list", id },
  }).detail!;
}

test("public queries expose identical admin/member data and never private state collections", () => {
  const { state, actor, other, admin, source, army, list } = fixture();
  execute(state, actor, { type: "shareArmy", id: list.id, shared: true });
  execute(state, other, {
    type: "saveArmy",
    patchId: source.patchId,
    army: { ...army, listName: "SECRET_OTHER_PRIVATE_LIST" },
  });
  const member = queryArmyLibrary(state, actor, { patchId: "all" });
  assert.deepEqual(queryArmyLibrary(state, admin, { patchId: "all" }), member);
  assert.equal(member.total, 1);
  const serialized = JSON.stringify(member);
  for (const secret of [
    "SECRET_OTHER_PRIVATE_LIST",
    '"games"',
    '"evaluations"',
    '"audit"',
    '"password"',
  ])
    assert.ok(!serialized.includes(secret));
  const privateId = state.savedArmies!.at(-1)!.id;
  assert.throws(() => detail(state, actor, privateId), /unavailable/);
  assert.throws(() => detail(state, admin, privateId), /unavailable/);
  const view = viewState(state, actor);
  for (const collection of [
    "armyVersions",
    "libraryMemberships",
    "libraryDiscussions",
  ])
    assert.ok(!(collection in view));
});

test("publication is not statistical consent; consent, withdrawal and membership changes invalidate metrics", () => {
  const { state, actor, admin, source, list } = fixture();
  execute(state, actor, { type: "shareArmy", id: list.id, shared: true });
  execute(state, actor, {
    type: "game",
    date: "2026-09-12",
    own: list.army,
    enemy: source.enemy,
    ownListVersionId: list.currentVersionId,
    patchId: list.patchId,
    layout: "A",
    score: 17,
    context: "Practice",
    notes: "PRIVATE_RESULT_REFLECTION",
    eventId: "",
    opponent: "PRIVATE_OPPONENT_NAME",
  });
  const game = state.games[0];
  assert.equal(detail(state, actor, list.id).metrics.recordedMatches, 0);
  assert.throws(
    () =>
      execute(state, admin, {
        type: "libraryGameContribution",
        id: game.id,
        contribution: true,
      }),
    /own recorded/,
  );
  execute(state, actor, {
    type: "libraryGameContribution",
    id: game.id,
    contribution: true,
  });
  const dto = detail(state, admin, list.id);
  assert.equal(dto.metrics.averageScore, 17);
  assert.ok(!JSON.stringify(dto).includes("PRIVATE_"));
  execute(state, actor, {
    type: "libraryGameContribution",
    id: game.id,
    contribution: false,
  });
  assert.equal(detail(state, actor, list.id).metrics.averageScore, null);
  execute(state, actor, {
    type: "libraryGameContribution",
    id: game.id,
    contribution: true,
  });
  execute(state, actor, { type: "shareArmy", id: list.id, shared: false });
  assert.equal(queryArmyLibrary(state, admin, { patchId: "all" }).total, 0);
  execute(state, actor, { type: "shareArmy", id: list.id, shared: true });
  actor.confirmedMember = false;
  assert.equal(queryArmyLibrary(state, admin, { patchId: "all" }).total, 0);
  assert.throws(
    () => queryArmyLibrary(state, actor, { patchId: "all" }),
    /member|unavailable|approved|confirmed/i,
  );
});

test("private version history stays private through edits, alias changes and first publication", () => {
  const { state, actor, army, list } = fixture();
  const first = structuredClone(state.armyVersions![0]);
  execute(state, actor, {
    type: "saveArmy",
    id: list.id,
    patchId: list.patchId,
    army: { ...army, listName: "New display alias" },
    expectedRevision: list.listRevision,
  });
  assert.equal(state.armyVersions!.length, 1);
  assert.deepEqual(state.armyVersions![0], first);
  const expected = list.listRevision;
  execute(state, actor, {
    type: "saveArmy",
    id: list.id,
    patchId: list.patchId,
    army: { ...army, scope: { battleSize: "different-size" } },
    expectedRevision: expected,
  });
  assert.throws(
    () =>
      execute(state, actor, {
        type: "saveArmy",
        id: list.id,
        patchId: list.patchId,
        army,
        expectedRevision: expected,
      }),
    /changed/,
  );
  execute(state, actor, { type: "shareArmy", id: list.id, shared: true });
  assert.deepEqual(
    state.armyVersions!.map((v) => v.published),
    [false, true],
  );
  assert.equal(detail(state, actor, list.id).versions.length, 1);
  assert.throws(
    () =>
      queryArmyLibrary(state, actor, {
        target: { kind: "list", id: list.id },
        versionId: first.id,
        patchId: "all",
      }),
    /unavailable/,
  );
});

test("legacy migration survives document JSON round trips, is idempotent and leaves source observations unchanged", () => {
  const { state, list } = fixture();
  delete state.armyVersions;
  delete state.libraryMemberships;
  delete state.libraryDiscussions;
  delete list.currentVersionId;
  delete list.listRevision;
  const gamesBefore = structuredClone(state.games);
  assert.equal(ensureArmyLibrary(state), true);
  const afterFirst = JSON.stringify(state);
  assert.equal(ensureArmyLibrary(state), false);
  assert.equal(JSON.stringify(state), afterFirst);
  assert.deepEqual(state.games, gamesBefore);
  const documentState: State = JSON.parse(JSON.stringify(state));
  assert.equal(ensureArmyLibrary(documentState), false);
  assert.deepEqual(documentState.armyVersions, state.armyVersions);
  assert.deepEqual(documentState.savedArmies, state.savedArmies);
});

test("failed stale revision transactions retain list version and classification state", () => {
  const { state, actor, army, list } = fixture();
  transaction((stored) => Object.assign(stored, state));
  transaction((stored) =>
    execute(
      stored,
      stored.users.find((u) => u.id === actor.id)!,
      {
        type: "saveArmy",
        id: list.id,
        patchId: list.patchId,
        army: { ...army, scope: { battleSize: "updated" } },
        expectedRevision: 1,
      },
    ),
  );
  const saved = readState();
  assert.throws(
    () =>
      transaction((stored) =>
        execute(
          stored,
          stored.users.find((u) => u.id === actor.id)!,
          {
            type: "saveArmy",
            id: list.id,
            patchId: list.patchId,
            army,
            expectedRevision: 1,
          },
        ),
      ),
    /changed/,
  );
  assert.deepEqual(readState(), saved);
});

test("consolidation catches visibility changes and effective viewer cannot see another owner's version actions", () => {
  const { state, actor, other, admin, list } = fixture();
  execute(state, actor, { type: "shareArmy", id: list.id, shared: true });
  const preview = consolidationPreview(state, admin);
  execute(state, actor, { type: "shareArmy", id: list.id, shared: false });
  assert.throws(
    () =>
      execute(state, admin, {
        type: "libraryConsolidationApply",
        sourceRevision: preview.sourceRevision,
      }),
    /stale/,
  );
  assert.throws(
    () =>
      execute(state, other, {
        type: "libraryVersionPublication",
        id: list.currentVersionId,
        published: true,
      }),
    /own|unavailable/i,
  );
  const effective = previewView(
    state,
    admin,
    JSON.stringify({ actorId: admin.id, userId: other.id, role: "actual" }),
  ).me;
  assert.equal(effective.id, other.id);
  assert.throws(() => detail(state, effective, list.id), /unavailable/);
});

test("recorded context has version-specific identities and unknown contexts do not fabricate matchups", () => {
  const { state, actor, source, list } = fixture();
  execute(state, actor, { type: "shareArmy", id: list.id, shared: true });
  const pack = { id: "pack", name: "Pack", version: "v1" };
  const deployment = { id: "map", name: "Map", version: "v1" };
  assert.notEqual(
    libraryContextId(deployment, pack),
    libraryContextId({ ...deployment, version: "v2" }, pack),
  );
  assert.notEqual(
    libraryContextId(deployment, pack),
    libraryContextId(deployment, { ...pack, version: "v2" }),
  );
  const command = {
    type: "game",
    date: "2026-09-12",
    own: list.army,
    enemy: source.enemy,
    ownListVersionId: list.currentVersionId,
    patchId: list.patchId,
    layout: "A",
    score: 11,
    context: "Practice",
    notes: "",
    eventId: "",
    libraryContribution: true,
  };
  execute(state, actor, command);
  const unknown = detail(state, actor, list.id);
  assert.equal(unknown.metrics.recordedMatches, 1);
  assert.equal(
    unknown.matchups.filter((m) => m.dimension === "deployment").length,
    0,
  );
  assert.throws(
    () =>
      execute(state, actor, {
        ...command,
        gameContext: { version: "1", deployment },
      }),
    /mission pack/,
  );
  execute(state, actor, {
    ...command,
    gameContext: { version: "1", missionPack: pack, deployment },
  });
  assert.equal(
    detail(state, actor, list.id).matchups.filter(
      (m) => m.dimension === "deployment",
    ).length,
    1,
  );
});

test("hidden scrim-linked results never contribute through independent roster publication", () => {
  const { state, actor, source, list } = fixture();
  execute(state, actor, { type: "shareArmy", id: list.id, shared: true });
  state.games.push({
    ...source,
    id: "hidden-game",
    own: list.army,
    ownListVersionId: list.currentVersionId,
    libraryContribution: true,
    scrimId: "hidden-scrim",
    scrimPairingId: "hidden-pairing",
    notes: "HIDDEN_SCRIM_REFLECTION",
  });
  assert.equal(detail(state, actor, list.id).metrics.recordedMatches, 0);
  assert.ok(
    !JSON.stringify(
      queryArmyLibrary(state, actor, { patchId: "all" }),
    ).includes("hidden-"),
  );
});

test("perspective-b scrim context maps canonical missions and complementary journals while corrections retain consent", () => {
  const { state, actor, other, source, list } = fixture();
  state.events.push({
    id: "context-event",
    scrimId: "context-scrim",
    title: "Context scrim",
    location: "Online",
    startsAt: "2026-09-10T08:00:00.000Z",
    endsAt: "2026-09-13T18:00:00.000Z",
    capacity: 2,
    description: "",
    cancelled: false,
  });
  state.scrims = [
    {
      id: "context-scrim",
      eventId: "context-event",
      revision: 1,
      kind: "internal",
      teamSize: 1,
      patchId: list.patchId,
      submissionDeadline: "2026-09-10T07:00:00.000Z",
      pairedAt: "2026-09-10T08:00:00.000Z",
      pairings: [
        {
          id: "context-pair",
          round: 1,
          aId: "entry-a",
          bId: "entry-b",
          layout: "A",
          comments: [],
        },
      ],
      teams: [
        {
          id: "team-a",
          name: "A",
          external: false,
          captainId: actor.id,
          captainName: actor.name,
          finalizedAt: "2026-09-10T06:00:00.000Z",
          estimates: [],
          entries: [
            {
              id: "entry-a",
              userId: actor.id,
              name: actor.name,
              army: list.army,
              listVersionId: list.currentVersionId,
            },
          ],
        },
        {
          id: "team-b",
          name: "B",
          external: false,
          captainId: other.id,
          captainName: other.name,
          finalizedAt: "2026-09-10T06:00:00.000Z",
          estimates: [],
          entries: [
            {
              id: "entry-b",
              userId: other.id,
              name: other.name,
              army: source.enemy,
            },
          ],
        },
      ],
    },
  ];
  const pack = { id: "pack", name: "Pack", version: "v1" };
  const ownMission = { id: "b-mission", name: "B mission", version: "v2" };
  const enemyMission = { id: "a-mission", name: "A mission", version: "v3" };
  execute(state, other, {
    type: "scrimReport",
    scrimId: "context-scrim",
    revision: 1,
    pairingId: "context-pair",
    perspective: "b",
    score: 14,
    date: "2026-09-12",
    gameContext: { version: "1", missionPack: pack, ownMission, enemyMission },
  });
  const pair = state.scrims[0].pairings[0];
  assert.equal(pair.scoreA, 6);
  assert.deepEqual(pair.gameContext?.ownMission, enemyMission);
  assert.deepEqual(pair.gameContext?.enemyMission, ownMission);
  const a = state.games.find((game) => game.userId === actor.id)!;
  const b = state.games.find((game) => game.userId === other.id)!;
  assert.deepEqual(a.gameContext?.ownMission, enemyMission);
  assert.deepEqual(b.gameContext?.ownMission, ownMission);
  assert.deepEqual(b.gameContext?.enemyMission, enemyMission);
  execute(state, actor, {
    type: "libraryGameContribution",
    id: a.id,
    contribution: true,
  });
  execute(state, other, {
    type: "scrimReport",
    scrimId: "context-scrim",
    revision: state.scrims[0].revision,
    pairingId: "context-pair",
    perspective: "b",
    score: 15,
    date: "2026-09-12",
  });
  assert.equal(a.libraryContribution, true);
  assert.equal(b.libraryContribution, undefined);
  assert.equal(a.score, 5);
  assert.equal(b.score, 15);
  assert.deepEqual(b.gameContext?.ownMission, ownMission);
});
