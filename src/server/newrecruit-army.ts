import { armySnapshot, type Catalogue } from "@/lib/catalogue";
import { z } from "zod";
import type { RosterComposition, RosterSelection } from "@/lib/types";
import {
  canonicalRoster,
  rosterFingerprint,
  ROSTER_NORMALIZATION_VERSION,
} from "./army-library-identity";
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
  type?: string;
  id_book?: string | number;
  catalogue_id?: string;
  uid?: string;
  associated?: {
    uid: string;
    label: "Leading" | "Supporting";
    amount: number;
  }[];
  unsupported?: boolean;
};
const maximumPayloadBytes = 2000000;
function validateOptions(input: unknown): Option {
  let count = 0;
  function visit(value: unknown, depth = 0): Option {
    if (depth > 40 || ++count > 20000)
      throw new Error("This army list is too complex to import.");
    const node = z
      .object({
        name: z.string().max(200).optional(),
        option_id: z.string().max(300).optional(),
        options: z.array(z.unknown()).max(20000).optional(),
        amount: z.number().int().min(0).max(10000).optional(),
        type: z.string().max(100).optional(),
        id_book: z.union([z.string().max(100), z.number().int()]).optional(),
        catalogue_id: z.string().max(300).optional(),
        uid: z.string().min(1).max(300).optional(),
      })
      .parse(value);
    const displayFields = new Set([
      "name",
      "option_id",
      "options",
      "amount",
      "type",
      "id_book",
      "catalogue_id",
      "uid",
      "link_id",
      "customName",
      "maxCosts",
      "costs",
      "points",
      "totalCost",
    ]);
    // New Recruit exports attachment annotations separately from selected
    // entries. Their volatile UIDs identify selected instances, not equipment.
    // Accept only the observed, bounded reference shape; unfamiliar association
    // data still makes exact roster identity unavailable.
    const associations = z
      .array(
        z
          .object({
            uid: z.string().min(1).max(300),
            label: z.enum(["Leading", "Supporting"]),
            amount: z.number().int().min(1).max(10000),
          })
          .strict(),
      )
      .max(500);
    const parsedAssociations = associations.safeParse(
      (value as Record<string, unknown>).associated,
    );
    if (
      Object.prototype.hasOwnProperty.call(value, "associated") &&
      parsedAssociations.success
    )
      displayFields.add("associated");
    const unsupported = Object.entries(value as Record<string, unknown>).some(
      ([key, extra]) =>
        !displayFields.has(key) &&
        !(Array.isArray(extra) && extra.length === 0),
    );
    return {
      ...node,
      ...(parsedAssociations.success
        ? { associated: parsedAssociations.data }
        : {}),
      unsupported,
      options: node.options?.map((child) => visit(child, depth + 1)),
    };
  }
  return visit(input);
}
function nodes(root: Option): Option[] {
  if (root.amount === 0) return [];
  return [root, ...(root.options || []).flatMap(nodes)];
}
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function selectedComposition(
  root: Option,
  systemId: string,
  catalogueId: string,
  catalogueRevision: string | undefined,
  multipleCatalogues: boolean,
): RosterComposition {
  const reasons = new Set<string>();
  if (nodes(root).some((node) => node.unsupported))
    reasons.add(
      "Selected roster data contains unsupported selection metadata.",
    );
  const namespace = (catalogue: string, id: string) =>
    `newrecruit:${encodeURIComponent(systemId)}:${encodeURIComponent(catalogue)}:${encodeURIComponent(id)}`;
  function selection(
    node: Option,
    unit = false,
    parentCatalogue = catalogueId,
  ): RosterSelection | undefined {
    if (node.amount === 0) return undefined;
    const catalogue =
      node.catalogue_id ||
      (node.id_book === undefined ? parentCatalogue : String(node.id_book));
    if (node.unsupported)
      reasons.add(
        "A selected roster entry contains unsupported selection data.",
      );
    if (!node.option_id)
      reasons.add("A selected roster entry has no source identifier.");
    if (node.amount === undefined && (!node.options?.length || unit))
      reasons.add("A selected roster entry has an unknown quantity.");
    if (!unit && node.type === "unit")
      reasons.add("Nested unit selection semantics are ambiguous.");
    if (
      !unit &&
      node.type !== "model" &&
      (node.amount || 0) > 1 &&
      (node.options || []).some((child) =>
        nodes(child).some(
          (entry) => entry.type === "model" || entry.type === "unit",
        ),
      )
    )
      reasons.add(
        "A selected model or unit has an ambiguous repeated option ancestor.",
      );
    const kind = unit
      ? "unit"
      : node.type === "model"
        ? "model"
        : node.type === "enhancement"
          ? "enhancement"
          : "option";
    return {
      sourceId: namespace(catalogue, node.option_id || "UNKNOWN"),
      name: node.name || "Unknown selection",
      kind,
      quantity: node.amount ?? 1,
      ...(unit && node.uid ? { instanceId: node.uid } : {}),
      ...(unit && node.associated?.length
        ? {
            associations: node.associated.map((reference) => ({
              instanceId: reference.uid,
              role: reference.label,
              quantity: reference.amount,
            })),
          }
        : {}),
      ...(node.amount === undefined && (!node.options?.length || unit)
        ? { quantityKnown: false }
        : {}),
      selections: (node.options || []).flatMap((child) => {
        const result = selection(child, false, catalogue);
        return result ? [result] : [];
      }),
    };
  }
  const rosterRoots: { node: Option; catalogue: string }[] = [];
  function findRosters(node: Option, parentCatalogue: string) {
    if (node.amount === 0) return;
    if (node.amount !== undefined && node.amount > 1)
      reasons.add(
        "A roster ancestor has an ambiguous repeated group quantity.",
      );
    const catalogue =
      node.catalogue_id ||
      (node.id_book === undefined ? parentCatalogue : String(node.id_book));
    if (node.name === "Army Roster") {
      rosterRoots.push({ node, catalogue });
      return;
    }
    for (const child of node.options || []) findRosters(child, catalogue);
  }
  findRosters(root, catalogueId);
  const unitNodes: { node: Option; catalogue: string; unit: boolean }[] = [];
  if (rosterRoots.length) {
    for (const { node: roster, catalogue: rosterCatalogue } of rosterRoots) {
      for (const category of roster.options || []) {
        if (category.amount === 0) continue;
        const catalogue =
          category.catalogue_id ||
          (category.id_book === undefined
            ? rosterCatalogue
            : String(category.id_book));
        if (category.name === "Configuration") {
          for (const extra of category.options || [])
            if (
              ![
                "Detachment",
                "Force Disposition",
                "Battle Size",
                "Show/Hide Options",
              ].includes(extra.name || "")
            )
              unitNodes.push({ node: extra, catalogue, unit: false });
          continue;
        }
        if (category.unsupported)
          reasons.add("A roster category contains unsupported selection data.");
        if (category.amount !== undefined) {
          unitNodes.push({ node: category, catalogue, unit: true });
          reasons.add("Unrecognized roster category structure.");
        } else
          unitNodes.push(
            ...(category.options || [])
              .filter((node) => node.amount !== 0)
              .map((node) => ({ node, catalogue, unit: true })),
          );
      }
    }
  } else {
    function explicitUnits(node: Option, parentCatalogue: string): void {
      if (node.amount === 0) return;
      const catalogue =
        node.catalogue_id ||
        (node.id_book === undefined ? parentCatalogue : String(node.id_book));
      if (node.type === "unit") {
        unitNodes.push({ node, catalogue, unit: true });
        return;
      }
      if (node.amount !== undefined && node.amount > 1)
        reasons.add(
          "A roster ancestor has an ambiguous repeated group quantity.",
        );
      for (const child of node.options || []) explicitUnits(child, catalogue);
    }
    explicitUnits(root, catalogueId);
    if (!unitNodes.length) {
      reasons.add("Selected unit structure is unavailable.");
      // Preserve ambiguous selections for display without claiming known units.
      for (const node of root.options || [])
        if (
          node.amount !== 0 &&
          ![
            "Detachment",
            "Force Disposition",
            "Battle Size",
            "Configuration",
          ].includes(node.name || "")
        )
          unitNodes.push({ node, catalogue: catalogueId, unit: false });
    }
  }
  if (
    multipleCatalogues &&
    unitNodes.some(
      ({ node, catalogue }) =>
        node.id_book === undefined &&
        !node.catalogue_id &&
        catalogue === catalogueId,
    )
  )
    reasons.add(
      "Multiple source catalogues lack per-unit catalogue provenance.",
    );
  const selections = unitNodes.flatMap(({ node, catalogue, unit }) => {
    const result = selection(node, unit, catalogue);
    return result ? [result] : [];
  });
  if (!selections.length) reasons.add("No selected units were supplied.");
  const composition: RosterComposition = {
    attachmentsVersion: "newrecruit-associations-v1",
    status: !selections.length
      ? "unavailable"
      : reasons.size
        ? "partial"
        : "complete",
    normalizationVersion: ROSTER_NORMALIZATION_VERSION,
    selections,
    reasons: [...reasons],
    source: {
      provider: "newrecruit",
      systemId,
      catalogueId,
      catalogueRevision,
      importedAt: new Date().toISOString(),
    },
  };
  if (composition.status === "complete") {
    composition.canonical = canonicalRoster(composition);
    composition.fingerprint = rosterFingerprint(composition);
  }
  return composition;
}
export function armyFromNewRecruit(
  input: unknown,
  listUrl: string,
  rules: Catalogue,
) {
  let encoded: string;
  try {
    encoded = JSON.stringify(input);
  } catch {
    throw new Error("Invalid New Recruit shared list.");
  }
  if (!encoded || Buffer.byteLength(encoded, "utf8") > maximumPayloadBytes)
    throw new Error("This shared list is too large to import.");
  const validatedUrl = newRecruitListUrl(listUrl).url;
  const data = z
    .object({
      name: z.string().max(100).optional(),
      id_book: z.union([z.string(), z.number()]),
      id_system: z.union([z.string(), z.number()]),
      nrversion: z.union([z.string(), z.number()]).optional(),
      edition: z.string().max(100).optional(),
      books_revision: z.array(z.string().max(300)).max(100).optional(),
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
  const root = validateOptions(data.army);
  const all = nodes(root);
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
  const snapshot = armySnapshot(
    {
      faction: faction.id,
      detachments,
      disposition: choices[0]!,
      listName: data.army.name || data.name || "Imported army list",
      listUrl: validatedUrl,
    },
    rules,
    3,
  );
  if (snapshot.listName?.trim().toLowerCase() === "unnamed list")
    snapshot.listName = [
      snapshot.factionName,
      snapshot.detachmentNames.join(" + "),
      snapshot.dispositionName,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 100);
  const battleSizes = selections("Battle Size").filter(
    (node) => !node.options?.length && node.option_id,
  );
  snapshot.scope = {
    systemId: String(data.id_system),
    edition: data.edition,
    battleSize:
      battleSizes.length === 1
        ? `newrecruit:${String(data.id_system)}:${String(data.id_book)}:${battleSizes[0].option_id}`
        : undefined,
  };
  snapshot.composition = selectedComposition(
    root,
    String(data.id_system),
    String(data.id_book),
    data.nrversion === undefined ? undefined : String(data.nrversion),
    (data.books_revision?.length || 0) > 1,
  );
  return snapshot;
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
  const reader = response.body?.getReader();
  if (!reader) throw new Error("New Recruit returned an empty shared list.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumPayloadBytes) {
        await reader.cancel();
        throw new Error("This shared list is too large to import.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (data?.obfuscated === true && typeof data.data === "string") {
      const decoded = Buffer.from(data.data, "base64");
      if (decoded.byteLength > maximumPayloadBytes)
        throw new Error("oversized");
      data = JSON.parse(decoded.toString("utf8"));
    }
  } catch {
    throw new Error("New Recruit returned an invalid shared list.");
  }
  if (!data?.army)
    throw new Error(
      "Shared list not found. Check that the New Recruit link is available to others.",
    );
  return armyFromNewRecruit(data, link.url, rules);
}
