import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalogue } from "../src/lib/catalogue";
import {
  inspectNewRecruitText,
  armyFromNewRecruitText,
} from "../src/server/newrecruit-text";
import { decodeNewRecruitText } from "../src/server/newrecruit-text-decode";
import { summarizeLibraryArmy } from "../src/server/army-library-summary";
import { variationId } from "../src/server/army-library-identity";

const formats = ["GW", "Simple", "NR", "Short", "Tournament"] as const;
const exports = Object.fromEntries(
  formats.map((format) => [
    format,
    readFileSync(
      new URL(`./fixtures/newrecruit-text/${format}.txt`, import.meta.url),
      "utf8",
    ),
  ]),
);
const rules = structuredClone(catalogue);
const faction = rules.factions.find((f) => f.name === "World Eaters")!;
// This supplied export explicitly records the current 2 DP cost; the bundled
// older catalogue still has 3 DP and must continue rejecting that ruleset.
const warband = faction.detachments.find(
  (d) => d.name === "Berzerker Warband",
)!;
warband.points = 2;
const engines = faction.detachments.find((d) => d.name === "Brazen Engines")!;
const disposition = rules.dispositions.find((d) => d.name === "Purge the Foe")!;
const missingChoices = {
  detachments: [warband.id, engines.id],
  disposition: disposition.id,
};
const state = {
  patches: [
    { id: "p", name: "Export rules", date: "2026-10-10", catalogue: rules },
  ],
};
const expected = [
  ["Angron", 1],
  ["Chaos Rhino", 1],
  ["Defiler", 1],
  ["Eightbound", 2],
  ["Exalted Eightbound", 1],
  ["Forgefiend", 3],
  ["Jakhals", 1],
  ["Khârn the Betrayer", 1],
  ["Khorne Berzerkers", 1],
  ["Slaughterbound", 1],
];

for (const format of formats)
  test(`${format} supplied export decodes the same 13-unit roster and configuration`, () => {
    const text = exports[format];
    const { review, decoded } = inspectNewRecruitText(text, rules);
    assert.equal(review.format, format);
    assert.equal(review.faction, faction.id);
    assert.equal(decoded.unitCount, 13);
    assert.equal(decoded.unitPointsTotal, 1995);
    assert.deepEqual(
      review.missing,
      format === "Simple"
        ? ["detachments", "disposition"]
        : format === "Short"
          ? ["disposition"]
          : [],
    );
    const supplied = Object.fromEntries(
      review.missing.map((key) => [key, missingChoices[key]]),
    );
    const army = armyFromNewRecruitText(text, rules, supplied);
    assert.deepEqual(
      [...army.detachments].sort(),
      [warband.id, engines.id].sort(),
    );
    assert.equal(army.disposition, disposition.id);
    assert.equal(army.listText, text);
    const summary = summarizeLibraryArmy(army, "p", state);
    assert.deepEqual(
      summary.units.map((u) => [u.name, u.quantity]),
      expected,
    );
    assert.equal(summary.rosterStatus, "partial");
    assert.equal(variationId(army, "p", state), undefined);
    assert.ok(!army.composition!.canonical && !army.composition!.fingerprint);
    if (format === "Simple")
      assert.ok(summary.units.every((u) => u.modelCount === undefined));
    else {
      assert.equal(
        summary.units.find((u) => u.name === "Eightbound")!.modelCount,
        6,
      );
      assert.equal(
        summary.units.find((u) => u.name === "Jakhals")!.modelCount,
        10,
      );
      assert.equal(
        summary.units.find((u) => u.name === "Khorne Berzerkers")!.modelCount,
        10,
      );
    }
    const units = army.composition!.selections;
    const bodyguard = units.find((u) => u.name === "Exalted Eightbound")!;
    const leader = units.find((u) => u.name === "Slaughterbound")!;
    if (format === "Short") {
      assert.equal(bodyguard.associations, undefined);
      assert.equal(army.composition!.attachmentsVersion, undefined);
      assert.ok(
        units.every((u) => u.selections.every((s) => s.kind === "model")),
      );
    } else
      assert.deepEqual(bodyguard.associations, [
        { instanceId: leader.instanceId, role: "Leading", quantity: 1 },
      ]);
    if (format === "GW" || format === "NR")
      assert.equal(
        summary.units.find((u) => u.name === "Forgefiend")!.modelCount,
        undefined,
      );
  });

test("text loadouts retain nested models, repeated equipment and explicitly labelled enhancements", () => {
  for (const format of ["GW", "NR", "Tournament"] as const) {
    const { composition } = decodeNewRecruitText(exports[format]);
    const names = JSON.stringify(composition.selections);
    assert.match(names, /Hades autocannon/);
    assert.match(names, /Battle-lust/);
    assert.match(names, /Khorne Berzerker Champion/);
    assert.match(names, /Khornate eviscerator/);
    const rhino = composition.selections.find((u) => u.name === "Chaos Rhino")!;
    const bolters = rhino.selections.filter((s) => s.name === "Combi-bolter");
    assert.equal(
      bolters.reduce((sum, s) => sum + s.quantity, 0),
      2,
    );
  }
  const nr = decodeNewRecruitText(exports.NR).composition;
  const champion = nr.selections.find((u) => u.name === "Eightbound")!
    .selections[0];
  assert.equal(champion.kind, "model");
  assert.equal(champion.selections[0].name, "Chainblades");
  const gw = decodeNewRecruitText(exports.GW).composition;
  assert.equal(
    gw.selections
      .find((u) => u.name === "Slaughterbound")!
      .selections.find((s) => s.name === "Battle-lust")!.kind,
    "enhancement",
  );
});

test("only missing choices can be supplied, and patch limits still apply", () => {
  assert.throws(
    () => armyFromNewRecruitText(exports.Simple, rules),
    /omits detachments/,
  );
  assert.throws(
    () => armyFromNewRecruitText(exports.Short, rules),
    /omits force disposition/,
  );
  assert.throws(
    () => armyFromNewRecruitText(exports.NR, rules, missingChoices),
    /cannot be overridden/,
  );
  assert.throws(
    () => armyFromNewRecruitText(exports.Short, rules, missingChoices),
    /cannot be overridden/,
  );
  assert.throws(() =>
    armyFromNewRecruitText(exports.Simple, rules, {
      ...missingChoices,
      detachments: ["forged"],
    }),
  );
  assert.throws(() =>
    armyFromNewRecruitText(exports.Simple, rules, {
      ...missingChoices,
      disposition: "forged",
    }),
  );
  assert.throws(() => armyFromNewRecruitText(exports.NR, catalogue), /3 DP/);
  assert.throws(
    () =>
      inspectNewRecruitText(
        exports.NR.replace("Purge the Foe", "Unknown"),
        rules,
      ),
    /disposition/,
  );
});

test("ambiguous attachment targets and unlabeled equipment never invent roster facts", () => {
  const duplicate = exports.NR.replace(
    "Exalted Eightbound [130 pts]:",
    "Exalted Eightbound [130 pts]:\nExalted Eightbound [130 pts]:",
  ).replace("  • : Slaughterbound", "");
  const decoded = decodeNewRecruitText(duplicate);
  assert.ok(decoded.composition.selections.every((u) => !u.associations));
  assert.ok(decoded.composition.reasons.some((r) => /unambiguously/.test(r)));
  const equipment = decodeNewRecruitText(
    "## Configuration\n## Vehicle\nRhino [75 pts]:\n  • 2x Combi-bolter\n",
  ).composition.selections[0];
  assert.equal(equipment.selections[0].kind, "option");
  assert.throws(() => decodeNewRecruitText("x".repeat(100001)), /100,000/);
  assert.throws(
    () => decodeNewRecruitText("BATTLELINE\n10001x Boyz (80 Points)"),
    /quantity/,
  );
});
