import { catalogue } from "./catalogue";

const connectingWords = new Set(["a", "an", "and", "at", "of", "the"]);
function words(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/['’]/g, "")
      .match(/[\p{L}\p{N}]+/gu) || []
  );
}
function initials(name: string, length = 1) {
  const parts = words(name);
  if (parts.length === 1) return name;
  return parts
    .map((word) =>
      connectingWords.has(word.toLowerCase())
        ? word[0].toLowerCase()
        : word.slice(0, length),
    )
    .join("");
}

/** Display aliases only. Catalogue IDs, full names and historical snapshots stay intact. */
const names = [
  ...new Set(
    catalogue.factions.flatMap((faction) =>
      faction.detachments.map((detachment) => detachment.name),
    ),
  ),
];
const aliases = new Map(names.map((name) => [name, initials(name)]));
const groups = new Map<string, string[]>();
for (const name of names) {
  const key = initials(name).toLowerCase();
  groups.set(key, [...(groups.get(key) || []), name]);
}
for (const group of groups.values()) {
  if (group.length < 2) continue;
  // Expand colliding initials together, so similarly named detachments remain distinct.
  let length = 3;
  const maxLength = Math.max(...group.map((name) => name.length));
  while (
    length < maxLength &&
    new Set(group.map((name) => initials(name, length).toLowerCase())).size <
      group.length
  )
    length++;
  for (const name of group) aliases.set(name, initials(name, length));
}
export function detachmentAbbreviation(name: string) {
  return aliases.get(name) || initials(name) || name;
}
