import assert from "node:assert/strict";
import { test } from "node:test";
import { armySnapshot, catalogue } from "../src/lib/catalogue";
import {
  summarizeLibraryArmy,
  textRosterSummary,
  maintainLibraryArmySummaries,
} from "../src/server/army-library-summary";
import type { State } from "../src/lib/types";
import {
  classifyLibraryVersion,
  normalizeRosterIdentity,
  variationId,
} from "../src/server/army-library-identity";

const faction = catalogue.factions.find((f) => f.name === "Orks")!;
const detachment = faction.detachments.find((d) => d.points <= 3)!;
const configuration = armySnapshot({
  faction: faction.id,
  detachments: [detachment.id],
  disposition: detachment.dispositions[0],
  listUrl: "",
});
const state = {
  patches: [{ id: "p", name: "Ruleset", date: "2026-10-10", catalogue }],
};

test("text summary recognizes GW, NR/Discord and WTC units without counting nested equipment or header points", () => {
  const exports = [
    "Army (2000 Points)\nCHARACTERS\nWarboss (75 Points)\n  • 1x Power klaw\nBATTLELINE\nBoyz (80 Points)\n  • 10x Boy\nBoyz (80 Points)",
    "Army [2000 pts]\n## Characters [75 pts]\nWarboss [75 pts]: Power klaw\n## Battleline [160 pts]\nBoyz [80 pts]\n  10x Boy\nBoyz [80 pts]",
    "Army [2000 pts]\n**Characters [75 pts]**\n- **Warboss [75 pts]**: Power klaw\n**Battleline [160 pts]**\n- **Boyz [80 pts]**\n  - 10x Boy\n- **Boyz [80 pts]**",
    "+ TOTAL ARMY POINTS: 2000pts\nChar1: 1x Warboss (75 pts): Power klaw\nUnit1: 1x Boyz (80 pts)\nUnit2: 1x Boyz (80 pts)",
  ];
  for (const listText of exports) {
    const summary = summarizeLibraryArmy(
      { ...configuration, listText },
      "p",
      state,
    );
    assert.deepEqual(
      summary.units.map((u) => [u.name, u.quantity]),
      [
        ["Boyz", 2],
        ["Warboss", 1],
      ],
    );
    assert.equal(summary.rosterStatus, "partial");
    assert.ok(
      summary.units.every(
        (u) =>
          u.modelCount === (/Char1:/.test(listText) ? u.quantity : undefined),
      ),
    );
    const composition = textRosterSummary(listText);
    assert.equal(
      variationId({ ...configuration, composition }, "p", state),
      undefined,
    );
    assert.ok(!composition.canonical && !composition.fingerprint);
  }
});

test("summaries use the library classifier and count complete units/models with the same source identities", () => {
  const army = {
    ...configuration,
    composition: normalizeRosterIdentity({
      status: "complete" as const,
      normalizationVersion: "newrecruit-selected-v1",
      reasons: [],
      source: {
        provider: "newrecruit" as const,
        systemId: String(catalogue.systemId),
        catalogueId: "book",
      },
      selections: [
        {
          sourceId: "newrecruit:system:book:boyz",
          name: "Boyz",
          kind: "unit" as const,
          quantity: 2,
          selections: [
            {
              sourceId: "newrecruit:system:book:boy",
              name: "Boy",
              kind: "model" as const,
              quantity: 10,
              selections: [],
            },
          ],
        },
      ],
    }),
  };
  const summary = summarizeLibraryArmy(army, "p", state);
  assert.equal(summary.rosterStatus, "complete");
  assert.equal(summary.units[0].quantity, 2);
  assert.equal(summary.units[0].modelCount, 20);
  assert.deepEqual(summary.units[0].modelSizes, [{ models: 10, quantity: 2 }]);
  const membership = classifyLibraryVersion(
    {
      id: "v",
      listId: "l",
      userId: "u",
      number: 1,
      patchId: "p",
      army,
      published: false,
      createdAt: "2026-10-10T00:00:00Z",
    },
    state,
  );
  assert.equal(summary.archetypeId, membership.archetypeId);
  assert.ok(membership.variationId);
  assert.equal(
    summarizeLibraryArmy(
      {
        ...army,
        listName: "Other name",
        listUrl: "https://example.com",
        detachments: [...army.detachments].reverse(),
      },
      "p",
      state,
    ).archetypeId,
    summary.archetypeId,
  );
});

test("missing text roster remains unknown and export root multipliers count models, not squads", () => {
  const empty = summarizeLibraryArmy(configuration, "p", state);
  assert.equal(empty.rosterStatus, "unavailable");
  assert.deepEqual(empty.units, []);
  const partial = summarizeLibraryArmy(
    { ...configuration, listText: "BATTLELINE\n10x Boyz (80 Points)" },
    "p",
    state,
  );
  assert.notEqual(partial.units[0].quantityKnown, false);
  assert.equal(partial.units[0].quantity, 1);
  assert.equal(partial.units[0].modelCount, 10);
});

test("persisted summaries remain idempotent when cloud JSON object keys are reordered", () => {
  const data = {
    ...state,
    savedArmies: [
      { id: "l", patchId: "p", army: structuredClone(configuration) },
    ],
  } as State;
  assert.equal(maintainLibraryArmySummaries(data), true);
  const restored = JSON.parse(
    JSON.stringify(data, (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    ),
  ) as State;
  assert.equal(maintainLibraryArmySummaries(restored), false);
  assert.equal(
    restored.savedArmies![0].army.summary!.archetypeId,
    data.savedArmies![0].army.summary!.archetypeId,
  );
});
