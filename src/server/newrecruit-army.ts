import { armySnapshot, type Catalogue } from "@/lib/catalogue";
import { z } from "zod";
export function newRecruitListUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Paste a New Recruit shared-list link.");
  }
  const match = /^\/app\/list\/([A-Za-z0-9_-]{1,100})\/?$/.exec(url.pathname);
  if (
    url.protocol !== "https:" ||
    !["www.newrecruit.eu", "newrecruit.eu"].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    !match
  )
    throw new Error("Use a https://www.newrecruit.eu/app/list/… link.");
  return {
    id: match[1],
    url: `https://www.newrecruit.eu/app/list/${match[1]}`,
  };
}
type Option = {
  name?: string;
  option_id?: string;
  options?: Option[];
  amount?: number;
};
function nodes(root: Option, depth = 0): Option[] {
  if (depth > 40) throw new Error("This army list is too complex to import.");
  return [root, ...(root.options || []).flatMap((n) => nodes(n, depth + 1))];
}
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function armyFromNewRecruit(
  input: unknown,
  listUrl: string,
  rules: Catalogue,
) {
  const data = z
    .object({
      name: z.string().max(100).optional(),
      id_book: z.union([z.string(), z.number()]),
      id_system: z.union([z.string(), z.number()]),
      army: z
        .object({
          name: z.string().max(100).optional(),
          options: z.array(z.unknown()),
        })
        .passthrough(),
    })
    .parse(input);
  if (String(data.id_system) !== String(rules.systemId))
    throw new Error("This list belongs to a different game system.");
  const all = nodes(data.army as Option);
  const faction =
    rules.factions.find((f) => f.id === String(data.id_book)) ||
    rules.factions.find((f) =>
      all.some((n) => n.name === f.sourceName || n.name === f.name),
    );
  if (!faction)
    throw new Error("This faction is unavailable in the selected ruleset.");
  const selections = (name: string) =>
    all
      .filter((n) => n.name === name)
      .flatMap((n) => nodes(n))
      .filter(
        (n) => n.name !== name && (n.amount === undefined || n.amount > 0),
      );
  const selected = selections("Detachment").filter((n) => !n.options?.length);
  const detachments = [
    ...new Set(
      selected.map((n) => {
        const found =
          faction.detachments.find((d) => d.id === n.option_id) ||
          faction.detachments.find(
            (d) => normalize(d.name) === normalize(n.name || ""),
          );
        if (!found)
          throw new Error(
            "A detachment is unavailable in the selected ruleset. Choose a matching ruleset.",
          );
        return found.id;
      }),
    ),
  ];
  const dispositions = selections("Force Disposition").filter(
    (n) => !n.options?.length,
  );
  const choices = [
    ...new Set(
      dispositions
        .map(
          (n) =>
            (
              rules.dispositions.find((d) => d.id === n.option_id) ||
              rules.dispositions.find(
                (d) => normalize(d.name) === normalize(n.name || ""),
              )
            )?.id,
        )
        .filter(Boolean),
    ),
  ];
  if (choices.length !== 1)
    throw new Error("The shared list must contain one force disposition.");
  return armySnapshot(
    {
      faction: faction.id,
      detachments,
      disposition: choices[0]!,
      listName: data.army.name || data.name || "Imported army list",
      listUrl,
    },
    rules,
    3,
  );
}
export async function fetchNewRecruitArmy(input: string, rules: Catalogue) {
  const link = newRecruitListUrl(input);
  const response = await fetch(
    "https://www.newrecruit.eu/api/rpc?m=open_share_link",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "open_share_link", params: [link.id] }),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
      redirect: "error",
    },
  );
  if (!response.ok)
    throw new Error(
      "New Recruit could not load this shared list. Try again later.",
    );
  const raw = await response.text();
  if (raw.length > 2000000)
    throw new Error("This shared list is too large to import.");
  let data = JSON.parse(raw);
  if (data?.obfuscated === true && typeof data.data === "string")
    data = JSON.parse(Buffer.from(data.data, "base64").toString("utf8"));
  if (!data?.army)
    throw new Error(
      "Shared list not found. Check that the New Recruit link is available to others.",
    );
  return armyFromNewRecruit(data, link.url, rules);
}
