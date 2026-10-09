import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogue } from "../src/lib/catalogue";
import type { Army, ArmyListVersion, State, User } from "../src/lib/types";
import {
  armyFromNewRecruit,
  newRecruitListUrl,
  fetchNewRecruitArmy,
} from "../src/server/newrecruit-army";
import {
  archetypeId,
  variationId,
  classifyLibraryVersion,
  maintainLibraryMemberships,
  consolidationPreview,
  applyConsolidation,
  normalizeRosterIdentity,
} from "../src/server/army-library-identity";

const faction = catalogue.factions.find((item) => item.name === "Orks")!;
const detachment = faction.detachments.find(
  (item) => item.name === "Dread Mob",
)!;
const disposition = catalogue.dispositions.find(
  (item) => item.name === "Purge the Foe",
)!;
const url = "https://www.newrecruit.eu/app/list/fixture";
type FixtureOption = {
  name: string;
  option_id: string;
  options: FixtureOption[];
  amount?: number;
};
const option = (
  name: string,
  option_id: string,
  options: FixtureOption[] = [],
  amount?: number,
): FixtureOption => ({
  name,
  option_id,
  options,
  ...(amount === undefined ? {} : { amount }),
});
function payload() {
  return {
    id_system: catalogue.systemId,
    id_book: faction.id,
    nrversion: 1,
    edition: "11",
    army: option("Roster name", "roster", [
      option("Army Roster", "force", [
        option("Configuration", "config", [
          option("Detachment", "d", [
            option(detachment.name, detachment.id, [], 1),
          ]),
          option("Force Disposition", "f", [
            option(disposition.name, disposition.id, [], 1),
          ]),
          option("Battle Size", "b", [option("Strike Force", "2000", [], 1)]),
        ]),
        option("Character", "category", [
          option(
            "Unit A",
            "unit-a",
            [
              option("Models", "models", [
                option(
                  "Model",
                  "model-a",
                  [option("Weapon", "weapon-a", [], 1)],
                  5,
                ),
              ]),
              option(
                "Unused",
                "unused",
                [option("Hidden option", "hidden", [], 1)],
                0,
              ),
            ],
            1,
          ),
          option("Unit B", "unit-b", [option("Upgrade", "upgrade", [], 1)], 1),
        ]),
      ]),
    ]),
  };
}
function imported(input = payload()): Army {
  return armyFromNewRecruit(input, url, catalogue);
}
function unit(input: ReturnType<typeof payload>) {
  return input.army.options[0].options[1].options[0];
}
function version(
  army = imported(),
  id = "list-a:v1",
  listId = "list-a",
  userId = "member",
): ArmyListVersion {
  return {
    id,
    listId,
    userId,
    number: 1,
    patchId: "patch",
    army,
    createdAt: "2026-10-09T12:00:00.000Z",
    published: true,
  };
}
function fixture() {
  const admin = {
    id: "admin",
    role: "admin",
    confirmedMember: true,
    name: "Admin",
    rejected: false,
  } as User;
  const member = {
    id: "member",
    role: "member",
    confirmedMember: true,
    name: "Member",
    rejected: false,
  } as User;
  const versions = [version(), version(imported(), "list-b:v1", "list-b")];
  const state: State = {
    users: [admin, member],
    phases: [],
    games: [],
    evaluations: [],
    messages: [],
    goals: [],
    events: [],
    applications: [],
    audit: [],
    armyVersions: versions,
    libraryMemberships: [],
    savedArmies: versions.map((v) => ({
      id: v.listId,
      userId: v.userId,
      patchId: v.patchId,
      army: structuredClone(v.army),
      shared: true,
      ownerName: "Member",
      updatedAt: v.createdAt,
      currentVersionId: v.id,
    })),
  };
  return { state, admin, member };
}

test("selected roster preserves nested quantities and skips zero subtrees", () => {
  const army = imported();
  assert.equal(army.composition?.status, "complete");
  assert.equal(army.composition!.selections.length, 2);
  const selected = army.composition!.selections[0];
  assert.equal(selected.kind, "unit");
  assert.equal(selected.selections[0].selections[0].quantity, 5);
  assert.equal(selected.selections.length, 1);
  assert.match(selected.sourceId, /^newrecruit:/);
  assert.ok(variationId(army, "patch"));
});

test("renaming, export ordering and point costs preserve exact roster identity", () => {
  const original = imported();
  const input = payload();
  input.army.name = "Other player renamed roster";
  const selected = unit(input);
  selected.name = "Different unit presentation";
  selected.options[0].options[0].name = "Different model presentation";
  input.army.options[0].options[1].options.reverse();
  (selected as unknown as Record<string, unknown>).points = 800;
  input.nrversion = 2;
  const changed = imported(input);
  assert.equal(
    changed.composition!.fingerprint,
    original.composition!.fingerprint,
  );
  assert.equal(variationId(changed, "patch"), variationId(original, "patch"));
  assert.notEqual(
    variationId(changed, "new-patch"),
    variationId(original, "patch"),
  );
});

test("changed unit/model quantities and equipment produce distinct variations", () => {
  const original = variationId(imported(), "patch");
  const units = payload();
  unit(units).amount = 2;
  const models = payload();
  unit(models).options[0].options[0].amount = 6;
  const equipment = payload();
  unit(equipment).options[0].options[0].options[0].option_id = "weapon-b";
  for (const changed of [units, models, equipment])
    assert.notEqual(variationId(imported(changed), "patch"), original);
});

test("archetypes keep unordered unique detachments, disposition, system and unknown cohorts separate", () => {
  const army = imported();
  army.detachments = ["b", "a"];
  assert.equal(
    archetypeId(army, "patch"),
    archetypeId({ ...army, detachments: ["a", "b", "a"] }, "patch"),
  );
  assert.notEqual(
    archetypeId(army, "patch"),
    archetypeId({ ...army, disposition: "other" }, "patch"),
  );
  assert.notEqual(
    archetypeId(army, "patch"),
    archetypeId(
      { ...army, scope: { ...army.scope, systemId: "other" } },
      "patch",
    ),
  );
  assert.notEqual(archetypeId(army, "patch"), archetypeId(army, "next"));
  army.scope!.continuityKey = "verified-faction-semantics";
  assert.equal(archetypeId(army, "patch"), archetypeId(army, "next"));
  delete army.scope!.battleSize;
  assert.notEqual(archetypeId(army, "patch"), archetypeId(army, "next"));
});

test("partial quantities, missing IDs, ambiguous provenance and unsupported gameplay data never deduplicate", () => {
  const missingId = payload();
  delete (unit(missingId) as { option_id?: string }).option_id;
  const missingQuantity = payload();
  delete unit(missingQuantity).amount;
  const associated = payload();
  (unit(associated) as unknown as Record<string, unknown>).associated = [
    { uid: "other", amount: 1 },
  ];
  const multiple = payload();
  (multiple as unknown as Record<string, unknown>).books_revision = [
    "A:1",
    "B:1",
  ];
  for (const input of [missingId, missingQuantity, associated, multiple]) {
    const army = imported(input);
    assert.equal(army.composition?.status, "partial");
    assert.equal(variationId(army, "patch"), undefined);
    assert.ok(army.composition?.reasons.length);
  }
  const input = payload();
  input.army.options[0].options.splice(1);
  assert.equal(imported(input).composition?.status, "unavailable");
});

test("normalization recomputes hashes and rejects forged complete fingerprints", () => {
  const army = imported();
  army.composition!.fingerprint = "forged";
  assert.equal(variationId(army, "patch"), undefined);
  army.composition = normalizeRosterIdentity(army.composition!);
  assert.ok(variationId(army, "patch"));
  army.composition.status = "partial";
  assert.equal(
    normalizeRosterIdentity(army.composition).fingerprint,
    undefined,
  );
});

test("membership maintenance is incremental and idempotent without changing source lists", () => {
  const { state } = fixture();
  const listsBefore = structuredClone(state.savedArmies);
  maintainLibraryMemberships(state, ["list-a"]);
  assert.equal(state.libraryMemberships!.length, 1);
  maintainLibraryMemberships(state);
  assert.equal(state.libraryMemberships!.length, 2);
  const snapshot = JSON.stringify(state.libraryMemberships);
  maintainLibraryMemberships(state);
  assert.equal(JSON.stringify(state.libraryMemberships), snapshot);
  assert.deepEqual(state.savedArmies, listsBefore);
  assert.deepEqual(
    classifyLibraryVersion(state.armyVersions![0]),
    state.libraryMemberships![0],
  );
});

test("admin previews count only independently public active-owner versions and preserve original data", () => {
  const { state, admin, member } = fixture();
  const privateVersion = version(imported(), "private:v1", "private");
  state.armyVersions!.push(privateVersion);
  state.savedArmies!.push({
    ...state.savedArmies![0],
    id: "private",
    shared: false,
    currentVersionId: privateVersion.id,
  });
  state.armyVersions!.push(version(imported(), "scrim-only:v1", "scrim-only"));
  const original = JSON.stringify({
    versions: state.armyVersions,
    lists: state.savedArmies,
  });
  const preview = consolidationPreview(state, admin);
  assert.equal(preview.memberships.length, 2);
  assert.equal(preview.newVariations, 1);
  assert.equal(preview.duplicateCompositions, 1);
  assert.throws(() => consolidationPreview(state, member), /Administrator/);
  applyConsolidation(state, admin, preview.sourceRevision);
  assert.equal(
    JSON.stringify({ versions: state.armyVersions, lists: state.savedArmies }),
    original,
  );
  const next = consolidationPreview(state, admin);
  assert.equal(next.newArchetypes, 0);
  assert.equal(next.newVariations, 0);
  applyConsolidation(state, admin, next.sourceRevision);
  member.removedAt = "2026-10-09";
  assert.equal(consolidationPreview(state, admin).memberships.length, 0);
});

test("stale preview rejects publication and roster changes atomically", () => {
  for (const change of [
    (state: State) => {
      state.savedArmies![0].shared = false;
    },
    (state: State) => {
      state.armyVersions![0].army.detachments = ["changed"];
    },
  ]) {
    const { state, admin } = fixture();
    const preview = consolidationPreview(state, admin);
    change(state);
    assert.throws(
      () => applyConsolidation(state, admin, preview.sourceRevision),
      /stale/,
    );
    assert.equal(state.libraryMemberships!.length, 0);
  }
});

test("import retains URL allowlist, bounds, and validation of selected and zero quantity trees", () => {
  for (const bad of [
    "https://evil.invalid/app/list/x",
    "https://newrecruit.eu:444/app/list/x",
    "https://newrecruit.eu/app/list/x/extra",
    "https://user@newrecruit.eu/app/list/x",
  ])
    assert.throws(() => newRecruitListUrl(bad));
  const invalid = payload();
  unit(invalid).amount = -1;
  assert.throws(() => imported(invalid));
  const deep = payload();
  let cursor = unit(deep);
  for (let depth = 0; depth < 42; depth++) {
    const child = option("Nested", "nested", [], 1);
    cursor.options = [child];
    cursor = child;
  }
  assert.throws(() => imported(deep), /complex/);
  const oversized = payload();
  (oversized as unknown as Record<string, unknown>).extra = "x".repeat(2000001);
  assert.throws(() => imported(oversized), /large/);
});

test("network importer bounds streamed payload and rejects malformed obfuscated data", async () => {
  const fetchBefore = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("x".repeat(2000001));
    await assert.rejects(() => fetchNewRecruitArmy(url, catalogue), /large/);
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          obfuscated: true,
          data: Buffer.from("not JSON").toString("base64"),
        }),
      );
    await assert.rejects(() => fetchNewRecruitArmy(url, catalogue), /invalid/);
    globalThis.fetch = async () => new Response(JSON.stringify(payload()));
    assert.equal(
      (await fetchNewRecruitArmy(url, catalogue)).composition?.status,
      "complete",
    );
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
