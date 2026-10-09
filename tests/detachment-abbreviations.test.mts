import assert from "node:assert/strict";
import test from "node:test";
import { catalogue } from "../src/lib/catalogue";
import { detachmentAbbreviation } from "../src/lib/detachment-abbreviations";

test("detachment display aliases remain readable and distinguish colliding catalogue initials", () => {
  const names = [
    ...new Set(
      catalogue.factions.flatMap((f) => f.detachments.map((d) => d.name)),
    ),
  ];
  const abbreviations = names.map(detachmentAbbreviation);
  assert.equal(
    new Set(abbreviations.map((name) => name.toLowerCase())).size,
    names.length,
  );
  assert.ok(
    abbreviations.every((name) => name.length > 0 && name.length <= 12),
  );
  assert.equal(detachmentAbbreviation("Bringers of Flame"), "BoF");
  assert.equal(detachmentAbbreviation("Dread Mob"), "DM");
  assert.equal(detachmentAbbreviation("Mont'ka"), "Mont'ka");
  assert.notEqual(
    detachmentAbbreviation("Shield Host"),
    detachmentAbbreviation("Silent Hunters"),
  );
});

test("historical and unknown detachment names can be abbreviated without editing their source", () => {
  assert.equal(detachmentAbbreviation("Historical Test Detachment"), "HTD");
  assert.equal(detachmentAbbreviation(""), "");
  assert.equal(detachmentAbbreviation("!!!"), "!!!");
});
