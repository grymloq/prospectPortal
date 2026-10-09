import { armySnapshot, type Catalogue } from "@/lib/catalogue";
import {
  decodeNewRecruitText,
  isTextUnitLine,
  rosterHeading,
} from "./newrecruit-text-decode";
import type { NewRecruitTextReview } from "@/lib/types";

const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const clean = (value: string) =>
  value
    .trim()
    .replace(/^[\s+*#>•-]+/, "")
    .replace(/[*`]/g, "")
    .trim();
const withoutCosts = (value: string) =>
  value.replace(/\([^)]*\)|\[[^\]]*\]/g, "").trim();

/** Reads export configuration only, never claims source-verified unit identity.
 * Formats checked against New Recruit's GW, NR/Discord and Tournament/WTC
 * exporters at https://www.newrecruit.eu/_nuxt/F5pCgVQB.js (10 October 2026).
 */
export function inspectNewRecruitText(listText: string, rules: Catalogue) {
  if (!listText.trim() || listText.length > 100000)
    throw new Error(
      "Paste a complete New Recruit text export (up to 100,000 characters).",
    );
  const rows: string[] = [];
  for (const raw of listText.replace(/\r\n?/g, "\n").split("\n")) {
    const row = clean(raw);
    if (
      rosterHeading.test(row) ||
      (rows.length > 0 && isTextUnitLine(raw) && !/^\s*\+/.test(raw)) ||
      /^(?:char|unit)\d+\s*:/i.test(row)
    )
      break;
    if (row && !/^[+=_-]+$/.test(row)) rows.push(row);
    if (rows.length >= 100) break;
  }
  const fields = (pattern: RegExp) =>
    rows.flatMap((row) => {
      const match = pattern.exec(row);
      return match ? [match[1].trim()] : [];
    });
  const factionFields = fields(
    /^(?:faction keyword|faction|army)\s*:\s*(.+)$/i,
  );
  const aliases = (faction: Catalogue["factions"][number]) =>
    [
      faction.name,
      faction.sourceName,
      ...(faction.name === "Space Marines" ? ["Adeptus Astartes"] : []),
    ].map(normalize);
  const matchesFaction = (
    row: string,
    faction: Catalogue["factions"][number],
  ) =>
    aliases(faction).includes(normalize(row)) ||
    aliases(faction).includes(normalize(row.split(/\s+-\s+/).at(-1) || ""));
  let factionRows = factionFields;
  if (!factionRows.length) {
    // GW uses standalone faction/chapter lines; NR starts with the book name.
    factionRows = rows.filter((row) =>
      rules.factions.some((f) => matchesFaction(row, f)),
    );
    if (!factionRows.length)
      factionRows = rules.factions
        .filter((f) =>
          ` ${normalize(rows[0] || "")} `.includes(
            ` ${normalize(f.sourceName)} `,
          ),
        )
        .map((f) => f.sourceName);
  }
  let factions = rules.factions.filter((f) =>
    factionRows.some((row) => matchesFaction(row, f)),
  );
  // GW includes the generic Space Marines line before a named chapter.
  if (
    !factionFields.length &&
    factions.length > 1 &&
    factions.some(
      (f) =>
        /adeptus astartes/i.test(f.sourceName) && f.name !== "Space Marines",
    )
  )
    factions = factions.filter((f) => f.name !== "Space Marines");
  if (
    factions.length !== 1 ||
    factionFields.some((row) => !matchesFaction(row, factions[0]))
  )
    throw new Error(
      "Could not read one faction for this rules patch. Paste the complete New Recruit export, including its header.",
    );
  const faction = factions[0];
  const decoded = decodeNewRecruitText(listText);
  const factionIndex = rows.findIndex((row) => matchesFaction(row, faction));
  const configRows = factionIndex >= 0 ? rows.slice(factionIndex + 1) : [];

  function detachmentsFrom(value: string) {
    let remaining = ` ${normalize(withoutCosts(value))} `;
    const selected = faction.detachments
      .slice()
      .sort((a, b) => b.name.length - a.name.length)
      .filter((detachment) => {
        const name = ` ${normalize(detachment.name)} `;
        if (!remaining.includes(name)) return false;
        remaining = remaining.split(name).join(" ");
        return true;
      });
    remaining = remaining.replace(/\b(?:and|\d+x)\b/g, "").trim();
    return selected.length && !remaining ? selected.map((d) => d.id) : null;
  }
  const detachmentFields = fields(
    /^detachments?(?:\s*(?:\([^)]*\)|\[[^\]]*\]))?\s*:\s*(.+)$/i,
  );
  const sourceIndex = normalize(rows[0] || "").indexOf(
    normalize(faction.sourceName),
  );
  const shortConfiguration =
    decoded.format === "Short"
      ? rows[0]
          .split(/\s+-\s+/)
          .slice(2)
          .join(" - ")
      : "";
  const detachmentSources = detachmentFields.length
    ? detachmentFields
    : shortConfiguration
      ? [shortConfiguration]
      : configRows.filter((row) => detachmentsFrom(row));
  if (detachmentSources.some((row) => !detachmentsFrom(row)))
    throw new Error(
      "Could not read the detachments for this rules patch. Paste the complete New Recruit export, including its configuration.",
    );
  const detachments = [
    ...new Set(detachmentSources.flatMap((row) => detachmentsFrom(row) || [])),
  ];
  const dispositionFields = fields(
    /^(?:force disposition|disposition)\s*:\s*(.+)$/i,
  );
  const dispositionSources = dispositionFields.length
    ? dispositionFields
    : configRows.filter((row) =>
        rules.dispositions.some(
          (d) => normalize(withoutCosts(row)) === normalize(d.name),
        ),
      );
  const dispositions = rules.dispositions.filter((d) =>
    dispositionSources.some(
      (row) => normalize(withoutCosts(row)) === normalize(d.name),
    ),
  );
  if (
    dispositions.length > 1 ||
    dispositionSources.some(
      (row) =>
        !dispositions[0] ||
        normalize(withoutCosts(row)) !== normalize(dispositions[0].name),
    )
  )
    throw new Error(
      "Could not read one force disposition. Paste the complete New Recruit export, including its force disposition.",
    );
  const nameFields = fields(
    /^(?:list name|army name|roster name)\s*:\s*(.+)$/i,
  );
  let listName = nameFields[0];
  if (
    !listName &&
    factionIndex > 0 &&
    /\([\d,]+\s*(?:points?|pts)\)/i.test(rows[0])
  )
    listName = withoutCosts(rows[0]);
  const exactSourceIndex = (rows[0] || "").indexOf(faction.sourceName + " - ");
  if (
    !listName &&
    decoded.format !== "Short" &&
    factionIndex < 0 &&
    sourceIndex >= 0 &&
    exactSourceIndex >= 0
  )
    listName = withoutCosts(
      rows[0].slice(exactSourceIndex + faction.sourceName.length + 3),
    ).replace(/\s+-\s*$/, "");
  const review: NewRecruitTextReview = {
    format: decoded.format,
    faction: faction.id,
    factionName: faction.name,
    detachments:
      detachmentSources.length || faction.titan ? detachments : undefined,
    disposition: dispositions[0]?.id,
    missing: [
      ...(!detachmentSources.length && !faction.titan
        ? ["detachments" as const]
        : []),
      ...(!dispositions.length ? ["disposition" as const] : []),
    ],
    unitCount: decoded.unitCount,
  };
  return { review, listName, decoded };
}

export type TextConfiguration = {
  detachments?: string[];
  disposition?: string;
};
export function armyFromNewRecruitText(
  listText: string,
  rules: Catalogue,
  supplied: TextConfiguration = {},
) {
  const { review, listName, decoded } = inspectNewRecruitText(listText, rules);
  if (
    supplied.detachments !== undefined &&
    !review.missing.includes("detachments")
  )
    throw new Error(
      "The export already contains detachments; they cannot be overridden.",
    );
  if (
    supplied.disposition !== undefined &&
    !review.missing.includes("disposition")
  )
    throw new Error(
      "The export already contains a force disposition; it cannot be overridden.",
    );
  const detachments = review.detachments ?? supplied.detachments;
  const disposition = review.disposition ?? supplied.disposition;
  if (!detachments)
    throw new Error(
      "This export omits detachments. Choose the missing detachments or paste a complete export.",
    );
  if (!disposition)
    throw new Error(
      "This export omits force disposition. Choose the missing force disposition or paste a complete export.",
    );
  const snapshot = armySnapshot(
    {
      faction: review.faction,
      detachments,
      disposition,
      listName: listName?.slice(0, 100),
      listText,
      listUrl: "",
    },
    rules,
    3,
  );
  snapshot.composition = decoded.composition;
  if (!snapshot.listName || /^unnamed list$/i.test(snapshot.listName))
    snapshot.listName = [
      snapshot.factionName,
      snapshot.detachmentNames.join(" + "),
      snapshot.dispositionName,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 100);
  return snapshot;
}
