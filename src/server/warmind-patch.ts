import { createHash } from "node:crypto";
import type { Patch } from "@/lib/types";
import { z } from "zod";
import { extractWarmindFactions } from "@/lib/warmind-catalogue.mjs";
import { catalogue, type Catalogue } from "@/lib/catalogue";
export const warmindUrl = "https://warmind.online/";
export function patchFromWarmind(html: string): Patch {
  const line = html.match(
    /<span\s+class=["']ver-line["']>([^<]+)<\/span>/i,
  )?.[1];
  const match = line?.match(
    /MFM\s+v(\d+(?:\.\d+)+)\s*(?:&#183;|&middot;|·)\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/,
  );
  if (!match)
    throw new Error("Warmind’s published MFM version could not be verified.");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months.indexOf(match[3]);
  if (month < 0) throw new Error("Invalid Warmind rules date.");
  const date = `${match[4]}-${String(month + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  const updatedAt = `${date}T00:00:00.000Z`;
  if (
    new Date(updatedAt).toISOString().slice(0, 10) !== date ||
    Date.parse(updatedAt) > Date.now()
  )
    throw new Error("Invalid Warmind rules date.");
  const revision = createHash("sha256")
    .update(`mfm:${match[1]}:${date}`)
    .digest("hex");
  return {
    id: `warmind-${revision}`,
    name: `Warmind · MFM v${match[1]}`,
    date,
    source: {
      provider: "warmind",
      url: warmindUrl,
      revision,
      updatedAt,
      importedAt: new Date().toISOString(),
      books: [],
    },
  };
}
const factionSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      version: z.string().min(1),
      generatedAt: z.string().datetime(),
      detachments: z
        .array(
          z.object({
            name: z.string().min(1),
            points: z.number().nonnegative(),
            objectives: z.array(z.string().min(1)).min(1),
          }),
        )
        .min(1),
    }),
  )
  .min(20);
const normalize = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]/g, "");
export function catalogueFromWarmind(bundle: string): Catalogue {
  const raw = factionSchema.parse(extractWarmindFactions(bundle));
  const dispositions = catalogue.dispositions;
  const factions = raw.map((f) => {
    const known = catalogue.factions.find(
      (c) => normalize(c.name) === normalize(f.name),
    );
    const detachments = f.detachments.map((d) => ({
      id:
        known?.detachments.find((v) => normalize(v.name) === normalize(d.name))
          ?.id ||
        `warmind-${createHash("sha256").update(`${f.id}:${d.name}`).digest("hex").slice(0, 24)}`,
      name: d.name,
      points: d.points,
      dispositions: [
        ...new Set(
          d.objectives.map((o) => {
            const disposition = dispositions.find(
              (v) => normalize(v.name) === normalize(o),
            );
            if (!disposition)
              throw new Error("Warmind returned an unknown force disposition.");
            return disposition.id;
          }),
        ),
      ],
    }));
    if (new Set(detachments.map((d) => d.id)).size !== detachments.length)
      throw new Error("Warmind returned duplicate detachment choices.");
    return {
      id: known?.id || `warmind-${f.id}`,
      name: f.name,
      sourceName: f.name,
      revision: parseInt(
        createHash("sha256")
          .update(JSON.stringify(detachments))
          .digest("hex")
          .slice(0, 8),
        16,
      ),
      updatedAt: f.generatedAt,
      detachments,
      titan: false,
    };
  });
  return {
    source: "Warmind",
    sourceUrl: warmindUrl,
    retrievedAt: new Date().toISOString(),
    systemId: catalogue.systemId,
    systemRevision: 11,
    dispositions,
    factions,
    note: "Warmind 11th edition current detachments, excluding codex previews. Dispositions are the union of selected detachment objectives.",
  };
}
async function fetchText(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Warmind is unavailable.");
  const text = await response.text();
  if (text.length > 30000000) throw new Error("Warmind response is too large.");
  return text;
}
export async function fetchWarmindPatch() {
  const response = await fetch(warmindUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Warmind is unavailable.");
  const patch = patchFromWarmind(await response.text());
  const html = await fetchText("https://warmind.online/builder/");
  const path = html.match(
    /<script[^>]+src=["'](\/builder\/assets\/index-[a-zA-Z0-9_-]+\.js)["']/,
  )?.[1];
  if (!path) throw new Error("Warmind’s builder catalogue is unavailable.");
  patch.catalogue = catalogueFromWarmind(
    await fetchText(new URL(path, warmindUrl).href),
  );
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        mfm: patch.source!.revision,
        factions: patch.catalogue.factions.map((f) => ({
          id: f.id,
          detachments: f.detachments,
        })),
      }),
    )
    .digest("hex");
  patch.id = `warmind-${revision}`;
  patch.source!.releaseRevision = patch.source!.revision;
  patch.source!.revision = revision;
  patch.source!.updatedAt = patch.catalogue.factions
    .map((f) => f.updatedAt)
    .sort()
    .at(-1)!;
  return patch;
}
