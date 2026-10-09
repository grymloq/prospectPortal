import assert from "node:assert/strict";
import test from "node:test";
import { buildEquipmentDefaults } from "../src/lib/build-equipment-defaults.mjs";
import {
  visibleEquipment,
  catalogueRevisions,
} from "../src/lib/roster-equipment";
import type { RosterComposition, RosterSelection } from "../src/lib/types";
import type { Army } from "../src/lib/types";
import { libraryLoadoutChanges } from "../src/server/army-library-loadouts";

const constraint = (type: string, value: number, id = type) => ({
  id,
  type,
  field: "selections",
  scope: "parent",
  value,
});
const weapon = (id: string, min = 1) => ({
  id,
  type: "upgrade",
  profiles: [{ typeName: "Melee Weapons" }],
  constraints: [
    constraint("min", min, `${id}-min`),
    constraint("max", 1, `${id}-max`),
  ],
});
test("catalogue constraints distinguish fixed weapons, optional choices and link aliases", () => {
  const catalogue = {
    id: "cat",
    sharedSelectionEntries: [
      weapon("fixed"),
      weapon("bolt", 0),
      weapon("plasma", 0),
    ],
    sharedSelectionEntryGroups: [
      {
        id: "gear",
        selectionEntries: [weapon("direct")],
        entryLinks: [
          { id: "fixed-link", targetId: "fixed", type: "selectionEntry" },
        ],
      },
      {
        id: "pistol",
        defaultSelectionEntryId: "bolt-link",
        constraints: [constraint("min", 1)],
        entryLinks: [
          { id: "bolt-link", targetId: "bolt", type: "selectionEntry" },
          { id: "plasma-link", targetId: "plasma", type: "selectionEntry" },
        ],
      },
    ],
  };
  const { defaults } = buildEquipmentDefaults([catalogue]);
  assert.equal(defaults["gear/direct"], 1);
  assert.equal(defaults["gear/fixed-link"], 1);
  assert.equal(defaults["gear/fixed"], 1);
  assert.equal(defaults["pistol/bolt-link"], 1);
  assert.equal(defaults["pistol/plasma-link"], undefined);
});
test("conditional or historically conflicting defaults and nonweapon choices remain visible", () => {
  const original = {
    id: "gear",
    selectionEntries: [
      weapon("fixed"),
      { ...weapon("ability"), profiles: [{ typeName: "Abilities" }] },
    ],
  };
  assert.equal(
    buildEquipmentDefaults([
      original,
      { id: "gear", selectionEntries: [weapon("fixed", 0)] },
    ]).defaults["gear/fixed"],
    undefined,
  );
  assert.equal(
    buildEquipmentDefaults([
      original,
      { modifiers: [{ field: "fixed-min", type: "set", value: 0 }] },
    ]).defaults["gear/fixed"],
    undefined,
  );
  assert.equal(
    buildEquipmentDefaults([original]).defaults["gear/ability"],
    undefined,
  );
  assert.equal(
    buildEquipmentDefaults([
      { ...original, constraints: [constraint("min", 0)] },
    ]).defaults["gear/fixed"],
    undefined,
  );
});

const selection = (
  id: string,
  name: string,
  quantity = 1,
  selections: RosterSelection[] = [],
): RosterSelection => ({
  sourceId: `newrecruit:827374861:3934587149:${id}`,
  kind: "option",
  name,
  quantity,
  selections,
});
const standard = () =>
  selection("a085-ae61-1810-46d0", "Lacerator and daemonic claw");
const parent = selection("f5e1-8fe6-3747-10fd", "Wargear");
const composition: RosterComposition = {
  status: "complete",
  normalizationVersion: "newrecruit-selected-v1",
  selections: [],
  reasons: [],
  source: {
    provider: "newrecruit",
    systemId: "827374861",
    catalogueId: "3934587149",
  },
};
test("source-backed Slaughterbound standard weapon is omitted without changing its snapshot", () => {
  const source = [standard()];
  const before = structuredClone(source);
  assert.deepEqual(visibleEquipment(source, parent, composition), []);
  assert.deepEqual(source, before);
});
test("New Recruit catalogue UUID namespaces resolve to their book definitions", () => {
  const namespace = (entry: RosterSelection): RosterSelection => ({
    ...entry,
    sourceId: entry.sourceId.replace("3934587149", "df9a-59b2-f464-59ad"),
  });
  assert.deepEqual(
    visibleEquipment([namespace(standard())], namespace(parent), composition),
    [],
  );
});
test("additional weapon quantities and optional upgrades on standard weapons remain visible", () => {
  const extra = { ...standard(), quantity: 2 };
  assert.equal(visibleEquipment([extra], parent, composition)[0].quantity, 1);
  const upgrade = {
    ...selection("optional", "Optional weapon upgrade"),
    kind: "enhancement" as const,
  };
  const equipped = { ...standard(), selections: [upgrade] };
  assert.deepEqual(visibleEquipment([equipped], parent, composition), [
    upgrade,
  ]);
  assert.deepEqual(equipped.selections, [upgrade]);
  const both = visibleEquipment(
    [{ ...extra, selections: [upgrade] }],
    parent,
    composition,
  );
  assert.equal(both[0].quantity, 1);
  assert.deepEqual(both[0].selections, [upgrade]);
  assert.deepEqual(both[1], upgrade);
});
test("unknown identities, partial data, future catalogues and enhancement selections are not hidden", () => {
  assert.deepEqual(
    visibleEquipment([standard()], parent, {
      ...composition,
      status: "partial",
    }),
    [standard()],
  );
  const future = {
    ...composition,
    source: {
      ...composition.source,
      catalogues: [{ id: "3934587149", revision: 100000 }],
    },
  };
  assert.deepEqual(visibleEquipment([standard()], parent, future), [
    standard(),
  ]);
  const unknown = {
    ...standard(),
    sourceId: "newrecruit:827374861:3934587149:%",
  };
  assert.deepEqual(visibleEquipment([unknown], parent, composition), [unknown]);
  const enhancement = { ...standard(), kind: "enhancement" as const };
  assert.deepEqual(visibleEquipment([enhancement], parent, composition), [
    enhancement,
  ]);
});
test("actual book revisions are parsed separately from export/app nrversion", () => {
  assert.deepEqual(
    catalogueRevisions([
      "Chaos - World Eaters: 15",
      "Unknown: 5",
      "Chaos - World Eaters: 9999999999999999999999",
    ]),
    [{ id: "3934587149", revision: 15 }],
  );
});

const army = (selections: RosterSelection[]): Army => ({
  listName: "Equipment fixture",
  faction: "3934587149",
  factionName: "World Eaters",
  detachments: [],
  detachmentNames: [],
  disposition: "",
  dispositionName: "",
  revision: 1,
  listUrl: "",
  composition: { ...composition, selections },
});
const slaughterbound = (quantity: number, extras: RosterSelection[] = []) => ({
  ...selection("71c9-b10b-b55f-483e", "Slaughterbound", quantity, [
    { ...parent, selections: [standard()] },
    ...extras,
  ]),
  kind: "unit" as const,
});
test("standard Slaughterbound weapons never create equipment deltas when unit counts change", () => {
  assert.deepEqual(
    libraryLoadoutChanges(army([slaughterbound(2)]), army([slaughterbound(3)])),
    [],
  );
});
test("changed group comparisons omit unchanged gear and retain both totals of a changed optional choice", () => {
  const ability = selection("battle-lust", "Battle-lust");
  const glaive = selection("glaive", "Berzerker Glaive");
  const upgrade = (quantity: number) =>
    selection("optional-weapon", "Optional weapon", quantity);
  const before = army([
    slaughterbound(1, [ability, glaive, upgrade(2)]),
    slaughterbound(1),
  ]);
  const after = army([
    slaughterbound(1, [ability, upgrade(3)]),
    slaughterbound(2),
  ]);
  const original = structuredClone([before, after]);
  const change = libraryLoadoutChanges(before, after)[0];
  assert.deepEqual(
    change.before?.map((item) => [item.name, item.quantity]),
    [
      ["Berzerker Glaive", 1],
      ["Optional weapon", 2],
    ],
  );
  assert.deepEqual(
    change.after?.map((item) => [item.name, item.quantity]),
    [["Optional weapon", 3]],
  );
  assert.deepEqual([before, after], original);
});
