import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  Army,
  ArmyListVersion,
  RosterSelection,
  State,
  User,
} from "../src/lib/types";
import {
  archetypeId,
  classifyLibraryVersion,
  normalizeRosterIdentity,
} from "../src/server/army-library-identity";
import {
  createLibraryNorms,
  libraryUnitCounts,
  publicNormVersions,
  setLibraryArchetypeDefault,
} from "../src/server/army-library-norm";
import { queryArmyLibrary } from "../src/server/army-library";

const actor: User = {
  id: "member",
  name: "Member",
  email: "m@example.com",
  role: "member",
  confirmedMember: true,
  faction: "f",
  city: "",
  bio: "",
  phaseId: null,
  rejected: false,
  application: "",
};
const admin: User = { ...actor, id: "admin", name: "Admin", role: "admin" };
const unit = (
  name: string,
  quantity = 1,
  selections: RosterSelection[] = [],
  kind: RosterSelection["kind"] = "unit",
): RosterSelection => ({
  sourceId: `newrecruit:system:catalogue:${name}`,
  name,
  kind,
  quantity,
  selections,
});
function army(units = [unit("Troops", 2)], patch = "p"): Army {
  return {
    listName: "List",
    faction: "f",
    factionName: "Faction",
    detachments: ["d"],
    detachmentNames: ["Detachment"],
    disposition: "s",
    dispositionName: "Disposition",
    revision: 1,
    listUrl: "",
    composition: normalizeRosterIdentity({
      status: "complete",
      normalizationVersion: "newrecruit-selected-v1",
      selections: units,
      reasons: [],
      source: {
        provider: "newrecruit",
        systemId: "system",
        catalogueId: "catalogue",
      },
    }),
    scope: {
      systemId: "system",
      continuityKey: patch === "cross" ? "continuity" : undefined,
    },
  };
}
function fixture() {
  const state: State = {
    users: [structuredClone(actor), structuredClone(admin)],
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
  };
  function add(
    id: string,
    roster = army(),
    patchId = "p",
    number = 1,
    published = true,
  ) {
    const version: ArmyListVersion = {
      id: `${id}:v${number}`,
      listId: id,
      userId: actor.id,
      number,
      patchId,
      army: structuredClone(roster),
      createdAt: `2026-10-${String(number).padStart(2, "0")}T00:00:00.000Z`,
      published,
    };
    state.armyVersions!.push(version);
    state.libraryMemberships!.push(classifyLibraryVersion(version, state));
    let saved = state.savedArmies!.find((entry) => entry.id === id);
    if (!saved) {
      saved = {
        id,
        userId: actor.id,
        patchId,
        army: structuredClone(roster),
        shared: true,
        ownerName: actor.name,
        updatedAt: version.createdAt,
      };
      state.savedArmies!.push(saved);
    }
    saved.army = structuredClone(roster);
    saved.patchId = patchId;
    saved.currentVersionId = version.id;
    return version;
  }
  const norms = () =>
    createLibraryNorms(state, actor, publicNormVersions(state));
  return { state, add, norms };
}

test("standard frequency counts distinct latest public lists, never their repeated history", () => {
  const { add, norms } = fixture();
  const old = army([unit("Old", 1)]),
    current = army([unit("Current", 3)]);
  for (let number = 1; number <= 10; number++) add("history", old, "p", number);
  add("history", current, "p", 11);
  add("second", current);
  add("third", old);
  const standard = norms().standard(archetypeId(current, "p"), "p")!;
  assert.equal(standard.repetitions, 2);
  assert.equal(standard.units[0].name, "Current");
  assert.equal(standard.selection, "most-repeated");
});

test("latest partial representative does not fall back to its old complete roster for frequency", () => {
  const { add, norms } = fixture();
  const version = add("only");
  const partial = army();
  partial.composition!.status = "partial";
  add("only", partial, "p", 2);
  assert.equal(
    norms().standard(archetypeId(version.army, "p"), "p"),
    undefined,
  );
});

test("equal frequency has a deterministic winner independent of collection order", () => {
  const { state, add, norms } = fixture();
  const a = add("z", army([unit("A")]));
  add("a", army([unit("B")]));
  const first = norms().standard(archetypeId(a.army, "p"), "p");
  state.armyVersions!.reverse();
  state.savedArmies!.reverse();
  assert.deepEqual(norms().standard(archetypeId(a.army, "p"), "p"), first);
});

test("explicit administrator default pins a public immutable version and CAS clearing retains revisions", () => {
  const { state, add, norms } = fixture();
  const minority = add("minority", army([unit("Elite")]));
  add("popular-a");
  add("popular-b");
  const id = archetypeId(minority.army, "p", state);
  setLibraryArchetypeDefault(state, admin, {
    archetypeId: id,
    patchId: "p",
    versionId: minority.id,
    expectedRevision: 0,
  });
  let standard = norms().standard(id, "p")!;
  assert.equal(standard.versionId, minority.id);
  assert.equal(standard.selection, "marked");
  assert.equal(standard.repetitions, 1);
  assert.equal(
    norms().summary(minority.army, id, "p", minority.id).isDefault,
    true,
  );
  add("minority", army([unit("Changed")]), "p", 2);
  assert.equal(norms().standard(id, "p")!.versionId, minority.id);
  assert.throws(
    () =>
      setLibraryArchetypeDefault(state, admin, {
        archetypeId: id,
        patchId: "p",
        expectedRevision: 0,
      }),
    /changed/,
  );
  setLibraryArchetypeDefault(state, admin, {
    archetypeId: id,
    patchId: "p",
    expectedRevision: 1,
  });
  standard = norms().standard(id, "p")!;
  assert.equal(standard.selection, "most-repeated");
  assert.equal(standard.defaultRevision, 2);
  assert.equal(state.libraryDefaults![0].versionId, undefined);
  assert.equal(state.audit.length, 2);
});

test("withdrawn pinned versions immediately lose default status without exposing their roster", () => {
  const { state, add, norms } = fixture();
  const pinned = add("secret", army([unit("SECRET")]));
  const publicVersion = add("public");
  const id = archetypeId(pinned.army, "p");
  setLibraryArchetypeDefault(state, admin, {
    archetypeId: id,
    patchId: "p",
    versionId: pinned.id,
    expectedRevision: 0,
  });
  state.savedArmies!.find((list) => list.id === "secret")!.shared = false;
  assert.equal(norms().standard(id, "p")!.versionId, publicVersion.id);
  assert.ok(!JSON.stringify(norms().standard(id, "p")).includes("SECRET"));
  assert.equal(norms().revision(id, "p"), 1);
});

test("publication and current membership gates revoke baseline candidates", () => {
  for (const revoke of [
    "unpublished",
    "unconfirmed",
    "removed",
    "deleted",
  ] as const) {
    const { state, add, norms } = fixture();
    const version = add("only");
    if (revoke === "unpublished") version.published = false;
    else if (revoke === "unconfirmed") state.users[0].confirmedMember = false;
    else if (revoke === "removed") state.users[0].removedAt = "2026-10-09";
    else state.savedArmies = [];
    const result = createLibraryNorms(state, admin, publicNormVersions(state));
    assert.equal(
      result.standard(archetypeId(version.army, "p"), "p"),
      undefined,
    );
    if (revoke === "unconfirmed" || revoke === "removed")
      assert.throws(norms, /membership/);
  }
});

test("default writes enforce current administrator role, completeness, patch and archetype", () => {
  const { state, add } = fixture();
  const version = add("public");
  const id = archetypeId(version.army, "p");
  const command = {
    archetypeId: id,
    patchId: "p",
    versionId: version.id,
    expectedRevision: 0,
  };
  assert.throws(
    () => setLibraryArchetypeDefault(state, actor, command),
    /Administrator/,
  );
  assert.throws(
    () =>
      setLibraryArchetypeDefault(state, admin, {
        ...command,
        archetypeId: "other",
      }),
    /Published complete/,
  );
  assert.throws(
    () =>
      setLibraryArchetypeDefault(state, admin, { ...command, patchId: "q" }),
    /Published complete/,
  );
  assert.throws(
    () =>
      setLibraryArchetypeDefault(state, admin, { ...command, patchId: "all" }),
    /one ruleset/,
  );
  version.army.composition!.status = "partial";
  assert.throws(
    () => setLibraryArchetypeDefault(state, admin, command),
    /Published complete/,
  );
  state.users[1].role = "member";
  assert.throws(
    () => setLibraryArchetypeDefault(state, admin, command),
    /Administrator/,
  );
  assert.equal(state.libraryDefaults, undefined);
});

test("unit deviations aggregate namespaced units and separate nested models and equipment", () => {
  const { add, norms } = fixture();
  const base = army([
    unit("Troops", 2, [
      unit("Soldier", 5, [unit("Rifle", 1, [], "option")], "model"),
    ]),
    unit("Tank"),
  ]);
  add("baseline", base);
  add("identical", base);
  const changed = army([
    unit("Troops", 3, [unit("Soldier", 6, [], "model")]),
    unit("Transport", 2),
  ]);
  const comparison = norms().compare(changed, archetypeId(base, "p"), "p");
  assert.equal(comparison.status, "different");
  assert.deepEqual(
    comparison.units.map((unit) => [unit.name, unit.quantity, unit.modelCount]),
    [
      ["Transport", 2, undefined],
      ["Troops", 3, 18],
    ],
  );
  assert.deepEqual(
    comparison.deviations.map((unit) => [unit.name, unit.delta]),
    [
      ["Tank", -1],
      ["Transport", 2],
      ["Troops", 1],
    ],
  );
  const summary = norms().summary(changed, archetypeId(base, "p"), "p");
  assert.equal(summary.addedUnits, 3);
  assert.equal(summary.removedUnits, 1);
  assert.equal(summary.changedUnits, 3);
  assert.deepEqual(summary.deviations, comparison.deviations);
});

test("model-size changes are visible even when unit count is unchanged", () => {
  const { add, norms } = fixture();
  const base = army([unit("Troops", 1, [unit("Model", 5, [], "model")])]);
  add("base", base);
  const changed = army([unit("Troops", 1, [unit("Model", 10, [], "model")])]);
  const comparison = norms().compare(changed, archetypeId(base, "p"), "p");
  assert.equal(comparison.deviations[0].delta, 0);
  assert.equal(comparison.deviations[0].baselineModels, 5);
  assert.equal(comparison.deviations[0].listModels, 10);
});

test("loadout-only changes differ in exact composition without invented unit deltas", () => {
  const { add, norms } = fixture();
  const base = army([unit("Tank", 1, [unit("Gun A", 1, [], "option")])]);
  add("base", base);
  const changed = army([unit("Tank", 1, [unit("Gun B", 1, [], "option")])]);
  const comparison = norms().compare(changed, archetypeId(base, "p"), "p");
  assert.equal(comparison.status, "same");
  assert.equal(comparison.compositionMatches, false);
  assert.deepEqual(comparison.deviations, []);
  assert.equal(comparison.units[0].modelCount, undefined);
  assert.deepEqual(
    comparison.loadoutDeviations[0].removed.map((item) => item.name),
    ["Gun A"],
  );
  assert.deepEqual(
    comparison.loadoutDeviations[0].added.map((item) => item.name),
    ["Gun B"],
  );
});

test("partial and unavailable rosters never receive definite deltas or default eligibility", () => {
  const { add, norms } = fixture();
  const base = add("base");
  for (const status of ["partial", "unavailable"] as const) {
    const changed = army([unit("Unknown", 3)]);
    changed.composition!.status = status;
    const comparison = norms().compare(
      changed,
      archetypeId(base.army, "p"),
      "p",
    );
    assert.equal(comparison.status, status);
    assert.deepEqual(comparison.deviations, []);
    assert.deepEqual(comparison.loadoutDeviations, []);
    assert.equal(
      norms().summary(changed, archetypeId(base.army, "p"), "p", "v")
        .canSetDefault,
      false,
    );
  }
});

test("unit source namespaces remain distinct and descendant units are not double counted", () => {
  const other = unit("Same");
  other.sourceId = "newrecruit:system:other:Same";
  const counts = libraryUnitCounts(
    army([unit("Same", 2, [unit("Nested", 10)]), other, unit("Same", 1)]),
  );
  assert.equal(counts.length, 2);
  assert.deepEqual(counts.map((unit) => unit.quantity).sort(), [1, 3]);
});

test("unit deltas retain the recorded sizes of added and removed squads", () => {
  const { add, norms } = fixture();
  const squad = (size: number) =>
    unit("Eightbound", 1, [unit("Eightbound model", size, [], "model")]);
  const base = army([squad(3)]);
  add("base", base);
  const comparison = norms().compare(
    army([squad(3), squad(6)]),
    archetypeId(base, "p"),
    "p",
  );
  assert.equal(comparison.deviations[0].delta, 1);
  assert.deepEqual(comparison.deviations[0].listModelSizes, [
    { models: 6, quantity: 1 },
  ]);
  const removed = norms().compare(army([unit("Other")]), archetypeId(base, "p"), "p");
  assert.deepEqual(removed.deviations[0].baselineModelSizes, [
    { models: 3, quantity: 1 },
  ]);
  assert.equal(removed.deviations[0].listModels, 0);
});

test("mixed and unknown squad sizes never turn into an invented average", () => {
  const known = unit("Eightbound", 2, [unit("Model", 3, [], "model")]);
  const large = unit("Eightbound", 1, [unit("Model", 6, [], "model")]);
  assert.deepEqual(libraryUnitCounts(army([known, large]))[0].modelSizes, [
    { models: 3, quantity: 2 },
    { models: 6, quantity: 1 },
  ]);
  assert.equal(
    libraryUnitCounts(army([known, unit("Eightbound")]))[0].modelSizes,
    undefined,
  );
  assert.equal(
    libraryUnitCounts(army([unit("Eightbound"), known]))[0].modelSizes,
    undefined,
  );
});

test("changed squad-size distribution is visible even with identical total units and models", () => {
  const { add, norms } = fixture();
  const squad = (size: number) =>
    unit("Troops", 1, [unit("Model", size, [], "model")]);
  const base = army([squad(3), squad(9)]);
  add("base", base);
  const comparison = norms().compare(
    army([squad(6), squad(6)]),
    archetypeId(base, "p"),
    "p",
  );
  assert.equal(comparison.deviations[0].baselineModels, 12);
  assert.equal(comparison.deviations[0].listModels, 12);
  assert.deepEqual(comparison.deviations[0].listModelSizes, [
    { models: 6, quantity: 2 },
  ]);
});

test("character enhancements and nested upgrades change independently of unit counts", () => {
  const { add, norms } = fixture();
  const character = (enhancement: string, weapon: string) =>
    unit("Captain", 1, [
      unit("Captain model", 1, [unit(weapon, 1, [], "option")], "model"),
      unit(
        "Enhancement choices",
        1,
        [unit(enhancement, 1, [], "enhancement")],
        "option",
      ),
    ]);
  const base = army([character("Old enhancement", "Old weapon")]);
  add("base", base);
  const changed = army([character("New enhancement", "New weapon")]);
  const comparison = norms().compare(changed, archetypeId(base, "p"), "p");
  assert.deepEqual(comparison.deviations, []);
  assert.deepEqual(
    comparison.loadoutDeviations[0].added.map((item) => [
      item.name,
      item.kind,
      item.quantity,
    ]),
    [
      ["New enhancement", "enhancement", 1],
      ["New weapon", "option", 1],
    ],
  );
  assert.deepEqual(
    comparison.loadoutDeviations[0].removed.map((item) => item.name),
    ["Old enhancement", "Old weapon"],
  );
  assert.deepEqual(
    norms().summary(changed, archetypeId(base, "p"), "p").loadoutDeviations,
    comparison.loadoutDeviations,
  );
});

test("extra copies of an identical loadout do not invent equipment changes", () => {
  const { add, norms } = fixture();
  const base = army([unit("Captain", 1, [unit("Sword", 1, [], "option")])]);
  add("base", base);
  const more = army([unit("Captain", 2, [unit("Sword", 1, [], "option")])]);
  assert.deepEqual(
    norms().compare(more, archetypeId(base, "p"), "p").loadoutDeviations,
    [],
  );
});

test("changed unit-group counts use before/after loadouts without guessing a surviving character", () => {
  const { add, norms } = fixture();
  const base = army([unit("Captain", 2, [unit("Sword", 1, [], "option")])]);
  add("base", base);
  const changed = army([unit("Captain", 1, [unit("Hammer", 1, [], "option")])]);
  const comparison = norms().compare(changed, archetypeId(base, "p"), "p");
  const loadout = comparison.loadoutDeviations[0];
  assert.deepEqual(loadout.added, []);
  assert.deepEqual(loadout.removed, []);
  assert.equal(loadout.before![0].quantity, 2);
  assert.equal(loadout.after![0].name, "Hammer");
});

test("loadout renaming/order/instance IDs do not change gear and source namespaces stay distinct", () => {
  const { add, norms } = fixture();
  const base = army([
    unit("Captain", 1, [
      unit("Sword", 1, [], "option"),
      unit("Shield", 1, [], "option"),
    ]),
  ]);
  add("base", base);
  const reordered = army([
    unit("Captain", 1, [
      unit("Shield", 1, [], "option"),
      {
        ...unit("Sword", 1, [], "option"),
        name: "Renamed sword",
        instanceId: "volatile",
      },
    ]),
  ]);
  assert.deepEqual(
    norms().compare(reordered, archetypeId(base, "p"), "p").loadoutDeviations,
    [],
  );
  const different = structuredClone(reordered);
  different.composition!.selections[0].selections[1].sourceId =
    "newrecruit:system:other:Sword";
  different.composition = normalizeRosterIdentity(different.composition!);
  const change = norms().compare(different, archetypeId(base, "p"), "p")
    .loadoutDeviations[0];
  assert.notEqual(change.added[0].sourceId, change.removed[0].sourceId);
});

test("standards remain separate for rulesets and ignore public matrix frequency", () => {
  const { state, add, norms } = fixture();
  const p = add("p-list", army([unit("P")]), "p");
  const q = add("q-list", army([unit("Q")]), "q");
  for (let index = 0; index < 10; index++)
    state.matrixLists!.push({
      id: String(index),
      userId: actor.id,
      patchId: "p",
      army: army([unit("Matrix")]),
      authorName: actor.name,
      updatedAt: "2026-10-09",
    });
  assert.equal(
    norms().standard(archetypeId(p.army, "p"), "p")!.listId,
    "p-list",
  );
  assert.equal(
    norms().standard(archetypeId(q.army, "q"), "q")!.listId,
    "q-list",
  );
  assert.equal(norms().standard(archetypeId(p.army, "p"), "q"), undefined);
});

test("library query search, pagination and game filters cannot change the shared standard", () => {
  const { state, add } = fixture();
  const a = add("a");
  add("b");
  const minority = add("c", army([unit("Elite")]));
  state.savedArmies!.find((list) => list.id === "c")!.army.listName = "Find me";
  const query = { patchId: "p", target: { kind: "list" as const, id: "c" } };
  const regular = queryArmyLibrary(state, actor, query).detail!.norm!;
  const filtered = queryArmyLibrary(state, actor, {
    ...query,
    search: "Find me",
    pageSize: 1,
    page: 100,
    opponentFaction: "none",
    dateFrom: "2099-01-01",
  }).detail!.norm!;
  assert.equal(regular.standard!.repetitions, 2);
  assert.equal(regular.standard!.versionId, a.id);
  assert.deepEqual(filtered, regular);
  const adminDto = queryArmyLibrary(state, admin, query);
  assert.deepEqual(adminDto, queryArmyLibrary(state, actor, query));
  assert.equal(adminDto.detail!.lists[0].norm!.isDefault, false);
  assert.equal(adminDto.detail!.lists[0].norm!.canSetDefault, true);
  assert.equal(
    adminDto.detail!.norm!.deviations[0].name,
    minority.army.composition!.selections[0].name,
  );
  assert.ok(!JSON.stringify(adminDto.lists).includes('"canonical"'));
});

test("selected historical details compare and mark the selected immutable version", () => {
  const { state, add } = fixture();
  const old = add("edited", army([unit("Old")]));
  const current = add("edited", army([unit("New")]), "p", 2);
  const dto = queryArmyLibrary(state, actor, {
    patchId: "p",
    target: { kind: "list", id: "edited" },
    versionId: old.id,
  });
  assert.equal(dto.detail!.norm!.standard!.versionId, current.id);
  assert.equal(dto.detail!.norm!.units[0].name, "Old");
  assert.equal(dto.detail!.lists[0].versionId, old.id);
  assert.equal(dto.detail!.lists[0].norm!.status, "different");
  assert.equal(dto.detail!.lists[0].norm!.canSetDefault, true);
});
