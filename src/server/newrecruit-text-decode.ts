import { createHash } from "node:crypto";
import type {
  RosterComposition,
  RosterSelection,
  NewRecruitTextFormat,
} from "@/lib/types";

export const cleanExportLine = (value: string) =>
  value.trim().replace(/[*`]/g, "");
export const rosterHeading =
  /^(?:#+\s*)?(?:epic heroes?|epic hero|characters?|battleline|dedicated transports?|other datasheets|allied units|infantry|vehicles?|monsters?|attached units)(?:\s*[\[(].*)?$/i;
const cost =
  "(?:\\(([\\d,]+)\\s*(?:points?|pts)\\)|\\[([\\d,]+)\\s*(?:points?|pts)\\])";
const rootPattern = new RegExp(
  `^(?:(?:Char|Unit)\\d+\\s*:\\s*)?(?:-\\s*)?(?:(\\d+)\\s*x\\s*)?(.+?)\\s*${cost}(.*)$`,
  "i",
);
export function isTextUnitLine(raw: string) {
  const line = cleanExportLine(raw);
  return (
    !/^\s|^[+•◦#]/.test(raw) &&
    !rosterHeading.test(line) &&
    rootPattern.test(line)
  );
}
const id = (kind: string, name: string) =>
  `newrecruit:text:${createHash("sha256")
    .update(`${kind}:${name.normalize("NFKC").toLowerCase()}`)
    .digest("hex")}`;
const quantity = (input: string | undefined) => {
  const result = input === undefined ? 1 : Number(input);
  if (!Number.isInteger(result) || result < 1 || result > 10000)
    throw new Error("Unsupported quantity in the text export.");
  return result;
};
const node = (
  name: string,
  kind: RosterSelection["kind"],
  amount = 1,
): RosterSelection => ({
  sourceId: id(kind, name),
  name: name.slice(0, 300),
  kind,
  quantity: amount,
  selections: [],
});
const stripCosts = (value: string) =>
  value
    .replace(/\[[\d,]+\s*(?:pts|points?)\]|\([+\d,]+\s*(?:pts|points?)\)/gi, "")
    .trim();
function splitOptions(value: string) {
  const result: string[] = [];
  let start = 0,
    depth = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(" || value[i] === "[") depth++;
    if (value[i] === ")" || value[i] === "]") depth--;
    if (value[i] === "," && depth === 0) {
      result.push(value.slice(start, i));
      start = i + 1;
    }
  }
  result.push(value.slice(start));
  return result.map((s) => s.trim()).filter(Boolean);
}
function options(value: string, enhancement = false): RosterSelection[] {
  return splitOptions(value)
    .slice(0, 500)
    .map((part) => {
      const text = stripCosts(part).replace(/^[•◦-]\s*/, "");
      const match = /^(?:(\d+)\s*x\s*|(\d+)\s+with\s+)?(.+)$/i.exec(text)!;
      const result = node(
        match[3],
        enhancement ? "enhancement" : "option",
        quantity(match[1] || match[2]),
      );
      // Keep source-written group labels and their explicit nested choices.
      const nested = /^(.+?)\s*\((.+)\)$/.exec(result.name);
      if (nested && /\d+\s*x\s*/i.test(nested[2])) {
        result.name = nested[1];
        result.sourceId = id(result.kind, result.name);
        result.selections = splitOptions(nested[2])
          .slice(0, 100)
          .map((label) => {
            const inner = /^(?:(\d+)\s*x\s*)?(.+)$/.exec(label)!;
            return node(inner[2], "option", quantity(inner[1]));
          });
      }
      return result;
    });
}

export function detectNewRecruitTextFormat(text: string): NewRecruitTextFormat {
  if (/^\+\s*FACTION KEYWORD\s*:/im.test(text)) return "Tournament";
  if (/^(?:#+\s*|\*\*)Configuration(?:\*\*)?\s*$/im.test(text)) return "NR";
  if (
    /^Unnamed list|^.+\([\d,]+\s*Points\)/im.test(text) &&
    /^(?:CHARACTERS|BATTLELINE|ATTACHED UNITS)\s*$/im.test(text)
  )
    return "GW";
  const first = text.trim().split(/\r?\n/)[0];
  if (/\s+-\s+/.test(first) && !/\[.*pts\]/i.test(first)) return "Short";
  if (/\s+-\s+/.test(first) && /\[.*pts\]/i.test(first)) return "Simple";
  // Legacy pasted exports with category headings use the GW/NR root layout.
  return /^(?:#+|\*\*)/m.test(text) ? "NR" : "GW";
}
export type DecodedTextRoster = {
  format: NewRecruitTextFormat;
  composition: RosterComposition;
  unitCount: number;
  unitPointsTotal: number;
  declaredPoints?: number;
  declaredUnits?: number;
};

function decodeRoster(
  text: string,
  format: NewRecruitTextFormat,
): DecodedTextRoster {
  if (!text.trim() || text.length > 100000)
    throw new Error(
      "Paste a New Recruit text export (up to 100,000 characters).",
    );
  const rows = text.replace(/\r\n?/g, "\n").split("\n");
  const selections: RosterSelection[] = [];
  const reasons = new Set([
    "Text exports do not include verified catalogue identities; exact roster variations remain unclassified.",
  ]);
  const units: {
    selection: RosterSelection;
    prefix?: number;
    rows: string[];
    group?: string;
    role?: string;
    leading?: string;
    attachedTo?: string;
  }[] = [];
  let inRoster = format === "Short" || format === "Simple",
    group: string | undefined;
  let unitPointsTotal = 0,
    attachmentsRecorded = false;
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i],
      line = cleanExportLine(raw);
    if (
      i === 0 &&
      /\s+-\s+/.test(line) &&
      (format === "Simple" || format === "Short")
    )
      continue;
    if (rosterHeading.test(line)) {
      inRoster = true;
      group = undefined;
      continue;
    }
    const attached = /^Attached unit\s+(\d+)$/i.exec(line);
    if (attached) {
      group = attached[1];
      attachmentsRecorded = true;
      continue;
    }
    const root = isTextUnitLine(raw) && rootPattern.exec(line);
    if (
      root &&
      (inRoster ||
        /^(?:Char|Unit)\d+\s*:/i.test(line) ||
        (format === "Tournament" && units.length))
    ) {
      const selection = node(root[2].trim(), "unit");
      selection.instanceId = `text-unit-${units.length + 1}`;
      const prefix = root[1] ? quantity(root[1]) : undefined;
      const tail = root[5].replace(/^:\s*/, "").trim();
      if (tail) selection.selections = options(tail);
      units.push({ selection, prefix, rows: [], group });
      selections.push(selection);
      unitPointsTotal += Number((root[3] || root[4]).replaceAll(",", ""));
      if (units.length > 500)
        throw new Error("This export has too many units.");
    } else if (units.length && !/^Created with|^Exported with/i.test(line))
      units.at(-1)!.rows.push(raw);
  }
  for (const unit of units) {
    let model: RosterSelection | undefined;
    for (let i = 0; i < unit.rows.length; i++) {
      const raw = unit.rows[i],
        line = cleanExportLine(raw).replace(/^[•◦-]\s*/, "");
      if (!line) continue;
      const role = /^Attached as:\s*(Leader|Bodyguard)/i.exec(line);
      if (role) {
        unit.role = role[1].toLowerCase();
        continue;
      }
      const leading = /^Leading[:\s]+(.+)$/i.exec(line);
      const target = /^(?:Attached to\s+|:\s*)(.+)$/i.exec(line);
      if (leading || target) {
        attachmentsRecorded = true;
        if (leading) unit.leading = leading[1].trim();
        else unit.attachedTo = target![1].trim();
        continue;
      }
      if (/^Enhancements?:/i.test(line)) {
        unit.selection.selections.push(
          ...options(line.replace(/^Enhancements?:\s*/i, ""), true),
        );
        continue;
      }
      const selected = /^(\d+)\s*x\s*(.+?)(?::\s*(.*))?$/i.exec(line);
      const hasNested =
        /^\s*[◦]/.test(unit.rows[i + 1] || "") ||
        /^\s{4,}\d+\s+with\b/i.test(unit.rows[i + 1] || "");
      const modelRow =
        selected &&
        ((format === "NR" &&
          selected[3] !== undefined &&
          /^[•-]/.test(raw.trim())) ||
          (format === "Simple" && /^[•-]/.test(raw.trim())) ||
          (format === "Tournament" && /^[•-]/.test(raw.trim())) ||
          hasNested) &&
        !/^\s*[◦]/.test(raw) &&
        !/Enhancement/i.test(line);
      if (modelRow) {
        model = node(selected[2], "model", quantity(selected[1]));
        if (format === "Simple") model.quantityKnown = false; // Simple can omit champions/default models.
        if (selected[3]) model.selections = options(selected[3]);
        unit.selection.selections.push(model);
      } else {
        const parent =
          model && (/^\s*[◦]/.test(raw) || /^\s{2,}/.test(raw))
            ? model
            : unit.selection;
        parent.selections.push(...options(line));
      }
    }
    const models = unit.selection.selections.filter((s) => s.kind === "model");
    if (unit.prefix !== undefined && !models.length)
      unit.selection.selections.push(
        node(`${unit.selection.name} models`, "model", unit.prefix),
      );
    if (
      unit.prefix !== undefined &&
      models.length &&
      models.reduce((sum, s) => sum + s.quantity, 0) !== unit.prefix
    ) {
      models.forEach((s) => {
        s.quantityKnown = false;
      });
      reasons.add("Some model counts disagree with their unit header.");
    }
    if (unit.selection.selections.length > 500)
      throw new Error("This export has too many selections in one unit.");
  }
  const associations = new Map<RosterSelection, Set<RosterSelection>>();
  const link = (leader: RosterSelection, bodyguard: RosterSelection) => {
    if (leader === bodyguard) return;
    const leaders = associations.get(bodyguard) || new Set();
    leaders.add(leader);
    associations.set(bodyguard, leaders);
  };
  for (const unit of units) {
    if (unit.group && unit.role === "bodyguard")
      for (const leader of units.filter(
        (u) => u.group === unit.group && u.role === "leader",
      ))
        link(leader.selection, unit.selection);
    for (const [name, isLeader] of [
      [unit.leading, true],
      [unit.attachedTo, false],
    ] as const) {
      if (!name) continue;
      const matches = units.filter(
        (u) =>
          u.selection.name.normalize("NFKC").toLowerCase() ===
          name.normalize("NFKC").toLowerCase(),
      );
      if (matches.length === 1) {
        if (isLeader) link(unit.selection, matches[0].selection);
        else link(matches[0].selection, unit.selection);
      } else
        reasons.add(
          "An explicit leader attachment could not be resolved unambiguously.",
        );
    }
  }
  for (const [bodyguard, leaders] of associations)
    bodyguard.associations = [...leaders].map((leader) => ({
      instanceId: leader.instanceId!,
      role: "Leading",
      quantity: 1,
    }));
  const declared =
    /^\+\s*TOTAL ARMY POINTS:\s*([\d,]+)/im.exec(text) ||
    /^(?:.*\s+-\s*)?[^\n]+?[\[(]([\d,]+)\s*(?:pts|points)/im.exec(text);
  const declaredUnits = /^\+\s*NUMBER OF UNITS:\s*(\d+)/im.exec(text);
  if (declaredUnits && Number(declaredUnits[1]) !== units.length)
    reasons.add("The declared unit count differs from the decoded roster.");
  return {
    format,
    unitCount: units.length,
    unitPointsTotal,
    declaredPoints: declared
      ? Number(declared[1].replaceAll(",", ""))
      : undefined,
    declaredUnits: declaredUnits ? Number(declaredUnits[1]) : undefined,
    composition: {
      status: units.length ? "partial" : "unavailable",
      normalizationVersion: "newrecruit-text-v2",
      ...(attachmentsRecorded
        ? { attachmentsVersion: "newrecruit-associations-v1" as const }
        : {}),
      selections,
      reasons: [...reasons],
      source: { provider: "newrecruit" },
    },
  };
}
export const decodeGwText = (text: string) => decodeRoster(text, "GW");
export const decodeSimpleText = (text: string) => decodeRoster(text, "Simple");
export const decodeNrText = (text: string) => decodeRoster(text, "NR");
export const decodeShortText = (text: string) => decodeRoster(text, "Short");
export const decodeTournamentText = (text: string) =>
  decodeRoster(text, "Tournament");
export function decodeNewRecruitText(text: string): DecodedTextRoster {
  const decoders = {
    GW: decodeGwText,
    Simple: decodeSimpleText,
    NR: decodeNrText,
    Short: decodeShortText,
    Tournament: decodeTournamentText,
  };
  return decoders[detectNewRecruitTextFormat(text)](text);
}
