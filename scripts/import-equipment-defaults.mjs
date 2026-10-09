import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { buildEquipmentDefaults } from "../src/lib/build-equipment-defaults.mjs";

const repository = path.resolve(
  process.argv[2] || ".local/weapon-defaults/bsdata",
);
const git = (...args) =>
  execFileSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    maxBuffer: 30000000,
  });
const commit = git("rev-parse", "HEAD").trim();
const library = JSON.parse(
  await fs.readFile(".local/weapon-defaults/library.json", "utf8"),
);
if (library.repoUrl !== "BSData/wh40k-11e" || library.sha !== commit)
  throw new Error("Source does not match the New Recruit library snapshot.");
const objects = git("rev-list", "--objects", "--all")
  .trim()
  .split(/\r?\n/)
  .filter((line) => line.endsWith(".json"))
  .map((line) => line.split(" ")[0]);
function compact(node) {
  if (!node || typeof node !== "object") return node;
  const result = {};
  for (const key of [
    "id",
    "targetId",
    "type",
    "typeName",
    "defaultSelectionEntryId",
    "constraints",
    "modifiers",
    "modifierGroups",
    "profiles",
    "infoLinks",
    "selectionEntries",
    "selectionEntryGroups",
    "entryLinks",
    "sharedSelectionEntries",
    "sharedSelectionEntryGroups",
    "sharedProfiles",
  ]) {
    const value = node[key];
    if (value !== undefined)
      result[key] = Array.isArray(value) ? value.map(compact) : value;
  }
  // Constraint/modifier properties are required, while profile statistics and prose are not.
  for (const key of [
    "field",
    "scope",
    "value",
    "percentValue",
    "includeChildSelections",
  ])
    if (node[key] !== undefined) result[key] = node[key];
  return result;
}
const snapshots = [];
let invalidSnapshots = 0;
for (const object of new Set(objects)) {
  let data;
  try {
    data = JSON.parse(git("cat-file", "blob", object));
  } catch {
    invalidSnapshots++;
    continue;
  }
  const root = data.catalogue || data.gameSystem;
  if (root) snapshots.push(compact(root));
}
const { defaults, containers } = buildEquipmentDefaults(snapshots);
const books = Object.fromEntries(
  library.books
    .filter((book) => !book.deleted)
    .map((book) => [
      String(book.id),
      {
        name: book.name,
        revision: book.nrversion,
        catalogueId: book.bsid,
      },
    ]),
);
const output = {
  systemId: String(library.id),
  repository: "https://github.com/BSData/wh40k-11e",
  commit,
  snapshots: snapshots.length,
  invalidSnapshots,
  books,
  defaults,
  containers,
};
await fs.writeFile("src/data/equipment-defaults.json", JSON.stringify(output));
console.log(
  JSON.stringify({
    snapshots: snapshots.length,
    defaultWeaponEdges: Object.keys(defaults).length,
    bytes: Buffer.byteLength(JSON.stringify(output)),
  }),
);
