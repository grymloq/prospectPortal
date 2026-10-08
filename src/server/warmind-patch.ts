import { createHash } from "node:crypto";
import type { Patch } from "@/lib/types";
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
export async function fetchWarmindPatch() {
  const response = await fetch(warmindUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Warmind is unavailable.");
  return patchFromWarmind(await response.text());
}
