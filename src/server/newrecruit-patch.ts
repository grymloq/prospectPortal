import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Patch, State, User } from "@/lib/types";
import { ensurePatches } from "@/lib/patches";
import { buildCatalogue } from "@/lib/build-catalogue.mjs";
import { catalogue } from "@/lib/catalogue";

export const newRecruitLibraryUrl =
  "https://www.newrecruit.eu/api/rpc?p0=get_library";
const systemId = 827374861;
const timestamp = z.string().datetime();
const bookSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(200),
  nrversion: z.number().int().nonnegative(),
  sha: z.string().regex(/^[a-f0-9]{40}$/),
  last_updated: timestamp,
});

export function patchFromLibrary(library: unknown): Patch {
  const systems = z
    .array(z.object({ id: z.number() }).passthrough())
    .parse(library);
  const system = systems.find((s) => s.id === systemId);
  if (!system) throw new Error("New Recruit’s 40k system is unavailable.");
  const raw = z
    .object({
      short: z.literal("wh40k-11e"),
      books: z.array(
        z
          .object({
            deleted: z.boolean().optional(),
            bsid: z.string().optional(),
          })
          .passthrough(),
      ),
    })
    .parse(system);
  const books = raw.books
    .filter((b) => !b.deleted && b.bsid)
    .map((b) => bookSchema.parse(b))
    .sort((a, b) => a.id - b.id);
  if (!books.length)
    throw new Error("New Recruit returned no rules catalogues.");
  const updatedAt = books
    .map((b) => b.last_updated)
    .sort()
    .at(-1)!;
  const revision = createHash("sha256")
    .update(JSON.stringify(books.map((b) => [b.id, b.nrversion, b.sha])))
    .digest("hex");
  const date = updatedAt.slice(0, 10);
  return {
    id: `newrecruit-${revision}`,
    name: `New Recruit catalogue update (${revision.slice(0, 8)})`,
    date,
    source: {
      provider: "newrecruit",
      systemId,
      revision,
      updatedAt,
      importedAt: new Date().toISOString(),
      books: books.map((b) => ({
        id: b.id,
        name: b.name,
        revision: b.nrversion,
        sha: b.sha,
      })),
    },
  };
}

export async function fetchNewRecruitPatch(): Promise<Patch> {
  const response = await fetch(newRecruitLibraryUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      "Could not fetch the New Recruit rules update. Try again later.",
    );
  const library = await response.json();
  const patch = patchFromLibrary(library);
  const system = library.find((s: { id: number }) => s.id === systemId);
  const books = system.books.filter(
    (b: { deleted?: boolean; bsid?: string }) => !b.deleted && b.bsid,
  );
  const rows: unknown[] = [];
  for (let i = 0; i < books.length; i += 6) {
    rows.push(
      ...(await Promise.all(
        books
          .slice(i, i + 6)
          .map(async (book: { id: number; nrversion: number; sha: string }) => {
            const r = await fetch(
              `https://www.newrecruit.eu/api/rpc?p0=books_get_book_row&p1=${systemId}&p2=${book.id}`,
              {
                cache: "no-store",
                signal: AbortSignal.timeout(20000),
              },
            );
            if (!r.ok)
              throw new Error("Could not fetch New Recruit catalogue data.");
            const row = await r.json();
            if (
              row.id !== book.id ||
              row.nrversion !== book.nrversion ||
              row.sha !== book.sha
            )
              throw new Error(
                "New Recruit changed during import. Please retry.",
              );
            const content = JSON.parse(row.content);
            const rules = content.catalogue || content.gameSystem;
            if (!rules)
              throw new Error("New Recruit returned invalid rules data.");
            return { book, catalogue: rules };
          }),
      )),
    );
  }
  patch.catalogue = buildCatalogue(rows);
  return patch;
}

export function requirePatchAdmin(actor: User) {
  if (actor.removedAt || actor.role !== "admin")
    throw new Error("Admin access required.");
}

export function importNewRecruitPatch(state: State, actor: User, patch: Patch) {
  requirePatchAdmin(actor);
  ensurePatches(state);
  const existing = state.patches!.find((p) => p.id === patch.id);
  const updatedCatalogue = patch.catalogue || state.catalogue || catalogue;
  if (patch.catalogue) state.catalogue = patch.catalogue;
  if (existing && patch.catalogue) existing.catalogue = patch.catalogue;
  if (existing && !existing.removedAt) return false;
  if (existing) {
    delete existing.removedAt;
    state.audit.unshift({
      id: randomUUID(),
      actor: actor.name,
      text: `Restored rules import: ${existing.name} — ${existing.date}`,
      createdAt: new Date().toISOString(),
    });
    return true;
  }
  state.patches!.push(
    structuredClone({ ...patch, catalogue: updatedCatalogue }),
  );
  state.audit.unshift({
    id: randomUUID(),
    actor: actor.name,
    text: `Imported rules patch: ${patch.name} — ${patch.date}`,
    createdAt: new Date().toISOString(),
  });
  return true;
}
