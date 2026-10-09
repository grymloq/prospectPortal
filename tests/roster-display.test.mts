import assert from "node:assert/strict";
import { test } from "node:test";
import type { RosterComposition, RosterSelection } from "../src/lib/types";
import {
  consolidateRoster,
  rosterAttachmentSignature,
} from "../src/lib/roster-display";
import { canonicalRoster } from "../src/server/army-library-identity";
import {
  compositionSchema,
  ensureArmyLibrary,
  updateArmyVersion,
} from "../src/server/army-library-versions";
import { catalogue, armySnapshot } from "../src/lib/catalogue";
import type { State } from "../src/lib/types";

function unit(
  name: string,
  id: string,
  quantity = 1,
  weapon = "Rifle",
): RosterSelection {
  return {
    name,
    sourceId: `newrecruit:system:faction:${name}`,
    instanceId: id,
    kind: "unit",
    quantity,
    selections: [
      {
        name: weapon,
        sourceId: `newrecruit:system:faction:${weapon}`,
        kind: "option",
        quantity: 1,
        selections: [],
      },
    ],
  };
}
function roster(selections: RosterSelection[]): RosterComposition {
  return {
    attachmentsVersion: "newrecruit-associations-v1",
    status: "complete",
    normalizationVersion: "newrecruit-selected-v1",
    selections,
    reasons: [],
    source: {
      provider: "newrecruit",
      systemId: "system",
      catalogueId: "faction",
    },
  };
}

test("consolidated units combine repeated types and retain separate expandable loadouts", () => {
  const display = consolidateRoster(
    roster([unit("Infantry", "a", 1), unit("Infantry", "b", 2, "Pistol")]),
  );
  assert.equal(display.units.length, 1);
  assert.equal(display.units[0].quantity, 3);
  assert.equal(display.units[0].variants.length, 2);
  assert.deepEqual(
    display.units[0].variants.map((v) => v.quantity),
    [1, 2],
  );
});
test("explicit leaders appear with their unit; identical names never infer attachments", () => {
  const host = unit("Infantry", "host"),
    leader = unit("Captain", "leader");
  host.associations = [{ instanceId: "leader", role: "Leading", quantity: 1 }];
  const display = consolidateRoster(
    roster([leader, host, unit("Captain", "unattached")]),
  );
  assert.equal(display.units.length, 2);
  assert.equal(
    display.units.find((u) => u.name === "Infantry")?.leaders[0].selection
      .instanceId,
    "leader",
  );
  assert.equal(display.units.find((u) => u.name === "Captain")?.quantity, 1);
});
test("unit groups with different leader assignments stay separate and supporting units stay standalone", () => {
  const first = unit("Infantry", "a"),
    second = unit("Infantry", "b"),
    supporting = unit("Mek", "mek");
  first.associations = [{ instanceId: "mek", role: "Supporting", quantity: 1 }];
  const display = consolidateRoster(roster([first, second, supporting]));
  assert.equal(display.units.length, 3);
  assert.equal(display.units[0].leaders[0].role, "Supporting");
  assert.equal(display.units[2].name, "Mek");
});
test("unresolved, conflicting and self attachment references never hide selected units", () => {
  for (const target of ["missing", "host", "leader"]) {
    const host = unit("Infantry", "host"),
      leader = unit("Captain", "leader");
    host.associations = [{ instanceId: target, role: "Leading", quantity: 2 }];
    const display = consolidateRoster(roster([host, leader]));
    assert.equal(display.units.length, 2);
    assert.equal(display.units[0].leaders.length, 0);
    assert.equal(display.units[0].notes.length, 1);
  }
  const a = unit("Infantry", "a"),
    b = unit("Infantry", "b"),
    leader = unit("Captain", "leader");
  for (const host of [a, b])
    host.associations = [
      { instanceId: "leader", role: "Leading", quantity: 1 },
    ];
  assert.ok(
    consolidateRoster(roster([a, b, leader])).units.some(
      (u) => u.name === "Captain",
    ),
  );
});
test("attachment signature ignores volatile IDs and export order but captures changed assignments", () => {
  const host = unit("Infantry", "host"),
    alternate = unit("Tank", "tank"),
    leader = unit("Captain", "leader");
  host.associations = [{ instanceId: "leader", role: "Leading", quantity: 1 }];
  const before = roster([host, alternate, leader]);
  const reordered = structuredClone(before);
  reordered.selections.reverse();
  for (const selection of reordered.selections) {
    selection.instanceId += "-renamed";
    for (const reference of selection.associations || [])
      reference.instanceId += "-renamed";
  }
  assert.equal(
    rosterAttachmentSignature(before),
    rosterAttachmentSignature(reordered),
  );
  const moved = structuredClone(before);
  moved.selections[1].associations = moved.selections[0].associations;
  delete moved.selections[0].associations;
  assert.notEqual(
    rosterAttachmentSignature(before),
    rosterAttachmentSignature(moved),
  );
  assert.equal(canonicalRoster(before), canonicalRoster(moved));
});
test("save validation preserves recorded assignments and rejects unbounded attachment fields", () => {
  const host = unit("Infantry", "host");
  host.associations = [{ instanceId: "leader", role: "Leading", quantity: 1 }];
  const parsed = compositionSchema.parse(roster([host]));
  assert.deepEqual(parsed.selections[0].associations, host.associations);
  host.associations[0].quantity = -1;
  assert.throws(() => compositionSchema.parse(roster([host])));
});

test("nested loadout identities remain bounded instead of repeatedly escaping child strings", () => {
  const host = unit("Infantry", "host"),
    leader = unit("Captain", "leader");
  let child = host.selections[0];
  for (let i = 0; i < 30; i++) {
    const next: RosterSelection = { ...child, selections: [] };
    child.selections = [next];
    child = next;
  }
  host.associations = [{ instanceId: "leader", role: "Leading", quantity: 1 }];
  assert.ok(rosterAttachmentSignature(roster([host, leader])).length < 10000);
  assert.equal(consolidateRoster(roster([host, leader])).units.length, 1);
});
test("new attachment metadata creates an immutable version once, without roster variation changes", () => {
  const faction = catalogue.factions.find(
    (faction) => faction.detachments.length,
  )!;
  const detachment = faction.detachments[0];
  const army = armySnapshot(
    {
      faction: faction.id,
      detachments: [detachment.id],
      disposition: detachment.dispositions[0],
      listUrl: "",
      listName: "Fixture",
    },
    catalogue,
  );
  army.composition = roster([
    unit("Infantry", "host"),
    unit("Captain", "leader"),
  ]);
  delete army.composition.attachmentsVersion;
  const saved = {
    id: "saved",
    userId: "owner",
    patchId: "patch",
    army,
    shared: true,
    ownerName: "Owner",
    updatedAt: "2026-10-09T00:00:00.000Z",
  };
  const state = { savedArmies: [saved] } as State;
  ensureArmyLibrary(state);
  const old = structuredClone(state.armyVersions![0]);
  const next = structuredClone(army);
  next.composition!.attachmentsVersion = "newrecruit-associations-v1";
  next.composition!.selections[0].associations = [
    { instanceId: "leader", role: "Leading", quantity: 1 },
  ];
  assert.equal(
    updateArmyVersion(state, saved, next, "patch", "2026-10-09T01:00:00.000Z"),
    true,
  );
  assert.equal(
    updateArmyVersion(
      state,
      saved,
      structuredClone(next),
      "patch",
      "2026-10-09T02:00:00.000Z",
    ),
    false,
  );
  assert.deepEqual(state.armyVersions![0], old);
  assert.equal(state.armyVersions!.length, 2);
});
