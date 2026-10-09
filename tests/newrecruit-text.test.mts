import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogue } from "../src/lib/catalogue";
import { armyFromNewRecruitText } from "../src/server/newrecruit-text";

const faction = catalogue.factions.find((f) => f.name === "Orks")!;
const detachment = faction.detachments.find((d) => d.name === "Dread Mob")!;
const disposition = catalogue.dispositions.find((d) =>
  detachment.dispositions.includes(d.id),
)!;
const body =
  "\n\nCHARACTERS\nWarboss (75 Points)\n  • 1x Power klaw\n<script>literal text</script>\n";
const header = `+ FACTION KEYWORD: ${faction.sourceName}\n+ DETACHMENT: ${detachment.name}\n+ FORCE DISPOSITION: ${disposition.name}\n+ TOTAL ARMY POINTS: 2000pts`;

test("text-only import reads New Recruit GW, NR, Discord and tournament configurations and preserves exports", () => {
  const formats = [
    `My Orks (2,000 Points)\n\nOrks\nDread Mob (1 Detachment Points)\n${disposition.name}\nStrike Force (2,000 Points)${body}`,
    `${faction.sourceName} - My Orks - [2000 pts]\n\n# ++ Army Roster ++ [2000 pts]\n\n## Configuration\nDetachment: Dread Mob\nForce Disposition: ${disposition.name}${body}`,
    `Alex - ${faction.sourceName} - My Orks - [2000 pts]\n\n**Configuration**\n- **Detachment:** Dread Mob\n- **Force Disposition:** ${disposition.name}${body}`,
    `+++++++++++++++++++++++++++++++++++++++++++++++\n${header}\n+++++++++++++++++++++++++++++++++++++++++++++++${body}`,
  ];
  for (const listText of formats) {
    const army = armyFromNewRecruitText(listText, catalogue);
    assert.equal(army.faction, faction.id);
    assert.deepEqual(army.detachments, [detachment.id]);
    assert.equal(army.disposition, disposition.id);
    assert.equal(army.listText, listText);
    assert.equal(army.listUrl, "");
    assert.equal(army.composition?.status, "partial");
    assert.equal(army.composition?.selections[0].name, "Warboss");
    assert.ok(army.listName);
  }
  assert.equal(
    armyFromNewRecruitText(formats[0], catalogue).listName,
    "My Orks",
  );
  assert.equal(
    armyFromNewRecruitText(formats[1], catalogue).listName,
    "My Orks",
  );
  assert.equal(
    armyFromNewRecruitText(formats[2], catalogue).listName,
    "My Orks",
  );
  const crlf = formats[0].replaceAll("\n", "\r\n");
  assert.equal(armyFromNewRecruitText(crlf, catalogue).listText, crlf);
  const warmind = structuredClone(catalogue);
  warmind.factions.forEach((f) => {
    f.sourceName = f.name;
  });
  assert.equal(armyFromNewRecruitText(formats[3], warmind).faction, faction.id);
});

test("GW chapter headers distinguish Space Marines from the specific chapter", () => {
  const chapter = catalogue.factions.find((f) => f.name === "Blood Angels")!;
  const d = chapter.detachments.find((d) => d.points <= 3)!;
  const disp = catalogue.dispositions.find((row) =>
    d.dispositions.includes(row.id),
  )!;
  const army = armyFromNewRecruitText(
    `Chapter army (2000 Points)\nSpace Marines\nBlood Angels\n${d.name} (${d.points} Detachment Points)\n${disp.name}${body}`,
    catalogue,
  );
  assert.equal(army.faction, chapter.id);
});

test("text parser rejects incomplete, ambiguous and incompatible exports without using body text as configuration", () => {
  for (const listText of [
    " ",
    "x".repeat(100001),
    body,
    header.replace(/\+ FORCE DISPOSITION: .*/, ""),
    header.replace("Dread Mob", "Dread Mob, Unknown Detachment"),
    header + "\n+ FORCE DISPOSITION: Unknown disposition",
    header + "\n+ FACTION KEYWORD: Xenos - Aeldari",
    header.replace("Dread Mob", "Unknown Detachment") +
      "\nCHARACTERS\nDetachment: Dread Mob",
  ])
    assert.throws(() => armyFromNewRecruitText(listText, catalogue));
  const removed = structuredClone(catalogue);
  removed.factions = removed.factions.filter((f) => f.id !== faction.id);
  assert.throws(() => armyFromNewRecruitText(header, removed), /faction/);
  const expensiveRules = structuredClone(catalogue);
  expensiveRules.factions
    .find((f) => f.id === faction.id)!
    .detachments.find((d) => d.id === detachment.id)!.points = 4;
  assert.throws(() => armyFromNewRecruitText(header, expensiveRules), /3 DP/);
});

test("text parser reads three detachments joined with GW punctuation and keeps name generation bounded", () => {
  const choices = faction.detachments
    .filter((d) => d.points === 1 && d.dispositions.includes(disposition.id))
    .slice(0, 3);
  assert.equal(choices.length, 3);
  const text = header.replace(
    "Dread Mob",
    `${choices[0].name}, ${choices[1].name}, and ${choices[2].name}`,
  );
  const army = armyFromNewRecruitText(text, catalogue);
  assert.deepEqual(
    [...army.detachments].sort(),
    choices.map((d) => d.id).sort(),
  );
  assert.ok(army.listName!.length <= 100);
});
