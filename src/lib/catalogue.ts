import data from "@/data/catalogue.json";
import type { Army } from "./types";
export const catalogue = data;
export function dispositionsFor(factionId: string, selected: string[]) {
  const faction = data.factions.find((f) => f.id === factionId);
  const ids = new Set(
    faction?.detachments
      .filter((d) => selected.includes(d.id))
      .flatMap((d) => d.dispositions),
  );
  if (faction?.titan)
    return data.dispositions.filter((d) => d.name === "Take and Hold");
  return data.dispositions.filter((d) => ids.has(d.id));
}
export function armySnapshot(input: {
  faction: string;
  detachments: string[];
  disposition: string;
  listUrl: string;
}): Army {
  const faction = data.factions.find((f) => f.id === input.faction);
  if (!faction) throw new Error("Choose a valid faction.");
  const selected = faction.detachments.filter((d) =>
    input.detachments.includes(d.id),
  );
  if (
    input.detachments.length > 3 ||
    selected.length !== input.detachments.length ||
    new Set(input.detachments).size !== input.detachments.length ||
    (!faction.titan && !selected.length)
  )
    throw new Error("Choose one to three valid, distinct detachments.");
  const disposition = dispositionsFor(input.faction, input.detachments).find(
    (d) => d.id === input.disposition,
  );
  if (!disposition)
    throw new Error("Choose a disposition provided by your detachments.");
  return {
    ...input,
    revision: faction.revision,
    factionName: faction.name,
    detachmentNames: selected.map((d) => d.name),
    dispositionName: disposition.name,
  };
}
