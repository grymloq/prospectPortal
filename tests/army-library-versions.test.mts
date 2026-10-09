import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
mkdirSync(".local", { recursive: true });
const scratch = mkdtempSync(path.resolve(".local/library-version-qa-"));
process.env.TEAM_DB_PATH = path.join(scratch, "test.sqlite");
const { db, readState, transaction } = await import("../src/server/store");
const { execute, viewState } = await import("../src/server/service");
const { ensureArmyLibrary } =
  await import("../src/server/army-library-versions");
const baseline = readState();
after(() => {
  db.close();
  rmSync(scratch, { recursive: true, force: true });
});
function fixture() {
  const state = structuredClone(baseline);
  state.savedArmies = [];
  state.armyVersions = [];
  state.libraryMemberships = [];
  const actor = state.users.find((u) => u.role === "member")!;
  const source = state.games.find((g) => g.userId === actor.id)!;
  const army = { ...source.own, listName: "Version fixture", listUrl: "" };
  return { state, actor, source, army };
}

test("list migration is additive, idempotent and never infers legacy game versions or consent", () => {
  const { state, actor, source, army } = fixture();
  delete state.armyVersions;
  state.savedArmies = [
    {
      id: "legacy",
      userId: actor.id,
      patchId: source.patchId!,
      army,
      shared: true,
      ownerName: actor.name,
      updatedAt: source.updatedAt,
    },
  ];
  const games = structuredClone(state.games);
  assert.equal(ensureArmyLibrary(state), true);
  assert.equal(state.armyVersions!.length, 1);
  assert.equal(state.armyVersions![0].id, "legacy:v1");
  assert.equal(state.armyVersions![0].published, true);
  assert.equal(ensureArmyLibrary(state), false);
  assert.deepEqual(state.games, games);
  assert.equal(state.savedArmies[0].listRevision, 1);
});

test("versions deduplicate no-op/reordered saves, separate publication, and reject stale edits", () => {
  const { state, actor, source, army } = fixture();
  execute(state, actor, { type: "saveArmy", patchId: source.patchId, army });
  const saved = state.savedArmies![0];
  const initial = structuredClone(state.armyVersions![0]);
  execute(state, actor, {
    type: "saveArmy",
    id: saved.id,
    patchId: saved.patchId,
    army: { ...army, detachments: [...army.detachments].reverse() },
    expectedRevision: 1,
  });
  assert.equal(state.armyVersions!.length, 1);
  execute(state, actor, { type: "shareArmy", id: saved.id, shared: true });
  assert.equal(state.armyVersions!.length, 1);
  execute(state, actor, {
    type: "saveArmy",
    id: saved.id,
    patchId: saved.patchId,
    army: { ...army, scope: { battleSize: "2000" } },
    expectedRevision: saved.listRevision,
  });
  assert.equal(state.armyVersions!.length, 2);
  assert.equal(state.armyVersions![0].army.revision, initial.army.revision);
  assert.deepEqual(state.armyVersions![0].army, initial.army);
  assert.throws(
    () =>
      execute(state, actor, {
        type: "saveArmy",
        id: saved.id,
        patchId: saved.patchId,
        army,
        expectedRevision: 1,
      }),
    /changed/,
  );
  execute(state, actor, { type: "shareArmy", id: saved.id, shared: false });
  assert.ok(state.armyVersions!.every((v) => !v.published));
  execute(state, actor, { type: "shareArmy", id: saved.id, shared: true });
  assert.deepEqual(
    state.armyVersions!.map((v) => v.published),
    [false, true],
  );
  const view = viewState(state, actor);
  assert.equal("armyVersions" in view, false);
  assert.equal("libraryMemberships" in view, false);
  assert.equal("libraryDiscussions" in view, false);
});

test("game version references are authorized and immutable after later edits and list deletion", () => {
  const { state, actor, source, army } = fixture();
  execute(state, actor, { type: "saveArmy", patchId: source.patchId, army });
  const saved = state.savedArmies![0];
  const command = {
    type: "game",
    date: "2026-09-10",
    opponent: "Recorded opponent",
    own: saved.army,
    enemy: source.enemy,
    score: 13,
    layout: "A",
    patchId: source.patchId,
    context: "Practice",
    notes: "Private notes",
    eventId: "",
    ownListVersionId: saved.currentVersionId,
  };
  execute(state, actor, command);
  const logged = state.games.at(-1)!;
  assert.equal(logged.libraryContribution, false);
  const historical = structuredClone(logged.own);
  const foreign = state.users.find(
    (u) => u.id !== actor.id && u.role === "member",
  )!;
  assert.throws(() => execute(state, foreign, command), /unavailable/);
  assert.throws(
    () => execute(state, actor, { ...command, patchId: "wrong" }),
    /valid patch/,
  );
  execute(state, actor, {
    type: "saveArmy",
    id: saved.id,
    patchId: saved.patchId,
    army: { ...army, scope: { battleSize: "3000" } },
  });
  assert.deepEqual(logged.own, historical);
  assert.notEqual(logged.ownListVersionId, saved.currentVersionId);
  execute(state, actor, { type: "deleteArmy", id: saved.id });
  assert.deepEqual(logged.own, historical);
  execute(state, actor, { ...command, id: logged.id, score: 14 });
  assert.equal(state.games.at(-1)!.ownListVersionId, command.ownListVersionId);
});

test("game contribution requires its owner and actual game context is versioned explicit input", () => {
  const { state, actor, source } = fixture();
  const other = state.users.find(
    (u) => u.id !== actor.id && u.role === "admin",
  )!;
  assert.throws(
    () =>
      execute(state, other, {
        type: "libraryGameContribution",
        id: source.id,
        contribution: true,
      }),
    /own recorded/,
  );
  execute(state, actor, {
    type: "libraryGameContribution",
    id: source.id,
    contribution: true,
  });
  assert.equal(source.libraryContribution, true);
  execute(state, actor, {
    type: "libraryGameContribution",
    id: source.id,
    contribution: false,
  });
  assert.equal(source.libraryContribution, false);
  const fields = { ...source, type: "game", layout: source.layout || "A" };
  const deployment = { id: "diagonal", name: "Diagonal", version: "source-v1" };
  assert.throws(
    () =>
      execute(state, actor, {
        ...fields,
        gameContext: { version: "1", deployment },
      }),
    /mission pack/,
  );
  execute(state, actor, {
    ...fields,
    gameContext: {
      version: "1",
      missionPack: {
        id: "recorded-pack",
        name: "Player-recorded pack",
        version: "2026-10",
      },
      deployment,
    },
  });
  assert.deepEqual(
    state.games.find((g) => g.id === source.id)!.gameContext?.deployment,
    deployment,
  );
});

test("local transaction rolls back invalid nested roster input without changing source state", () => {
  const before = readState();
  assert.throws(
    () =>
      transaction((state) => {
        const actor = state.users.find((u) => u.role === "member")!;
        let nested: unknown = {};
        for (let i = 0; i < 60; i++) nested = { selections: [nested] };
        execute(state, actor, { type: "saveArmy", army: nested });
      }),
    /too complex/,
  );
  assert.deepEqual(readState(), before);
});

test("discussion pagination keeps ancestors visible while all authorized replies remain discoverable", async () => {
  const { queryArmyLibrary } = await import("../src/server/army-library");
  const { state, actor, source, army } = fixture();
  execute(state, actor, { type: "saveArmy", patchId: source.patchId, army });
  const saved = state.savedArmies![0];
  execute(state, actor, { type: "shareArmy", id: saved.id, shared: true });
  const target = { kind: "list" as const, id: saved.id };
  execute(state, actor, {
    type: "libraryDiscussion",
    target,
    text: "Parent thread",
  });
  const parentId = state.libraryDiscussions!.at(-1)!.id;
  for (let i = 0; i < 40; i++)
    execute(state, actor, {
      type: "libraryDiscussion",
      target,
      parentId,
      text: `Reply ${i}`,
    });
  const seen = new Set<string>();
  for (let page = 1; page <= 3; page++) {
    const detail = queryArmyLibrary(state, actor, {
      target,
      patchId: saved.patchId,
      relatedPage: page,
    }).detail!;
    assert.equal(detail.relatedPagination!.discussions, 41);
    assert.ok(detail.discussions.some((d) => d.id === parentId));
    for (const row of detail.discussions) seen.add(row.id);
    assert.ok(detail.discussions.length <= 21);
  }
  assert.equal(seen.size, 41);
});

test("unknown roster quantities stay visibly unknown and cannot become exact variations", async () => {
  const { normalizeRosterIdentity, variationId } =
    await import("../src/server/army-library-identity");
  const { army, source } = fixture();
  const composition = normalizeRosterIdentity({
    status: "complete",
    normalizationVersion: "newrecruit-selected-v1",
    reasons: [],
    source: {
      provider: "newrecruit",
      systemId: "system",
      catalogueId: "catalogue",
    },
    selections: [
      {
        sourceId: "newrecruit:system:catalogue:unit",
        name: "Quantity unavailable",
        kind: "unit",
        quantity: 1,
        quantityKnown: false,
        selections: [],
      },
    ],
  });
  assert.equal(composition.status, "partial");
  assert.equal(composition.selections[0].quantityKnown, false);
  assert.equal(composition.fingerprint, undefined);
  assert.equal(
    variationId({ ...army, composition }, source.patchId!),
    undefined,
  );
});

test("admin consolidation repairs derived memberships without mutating original lists or history", async () => {
  const { consolidationPreview, applyConsolidation } =
    await import("../src/server/army-library-identity");
  const { state, actor, source, army } = fixture();
  execute(state, actor, { type: "saveArmy", patchId: source.patchId, army });
  const saved = state.savedArmies![0];
  execute(state, actor, { type: "shareArmy", id: saved.id, shared: true });
  const expected = structuredClone(state.libraryMemberships![0]);
  const originals = structuredClone({
    lists: state.savedArmies,
    versions: state.armyVersions,
  });
  state.libraryMemberships![0].archetypeId = "corrupted-derived-id";
  const admin = state.users.find((u) => u.role === "admin")!;
  const preview = consolidationPreview(state, admin);
  assert.equal(preview.membershipChanges, 1);
  applyConsolidation(state, admin, preview.sourceRevision);
  assert.deepEqual(state.libraryMemberships![0], expected);
  assert.deepEqual(
    { lists: state.savedArmies, versions: state.armyVersions },
    originals,
  );
  assert.equal(consolidationPreview(state, admin).membershipChanges, 0);
});
