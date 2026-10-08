import { buildCatalogue } from "../src/lib/build-catalogue.mjs";
import fs from "node:fs/promises";
import path from "node:path";
const base = "https://www.newrecruit.eu/api/rpc";
const systemId = 827374861;
const cache = path.resolve(".cache/newrecruit");
await fs.mkdir(cache, { recursive: true });
async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`New Recruit ${r.status}`);
  return r.json();
}
const library = await get(`${base}?p0=get_library`);
const system = library.find((s) => s.id === systemId);
if (!system) throw new Error("11th edition system missing");
const books = system.books.filter((b) => !b.deleted && b.bsid);
const rows = [];
for (let i = 0; i < books.length; i += 4) {
  rows.push(
    ...(await Promise.all(
      books.slice(i, i + 4).map(async (book) => {
        const file = path.join(cache, `${book.id}-${book.nrversion}.json`);
        let row;
        try {
          row = JSON.parse(await fs.readFile(file, "utf8"));
        } catch {
          row = await get(
            `${base}?p0=books_get_book_row&p1=${systemId}&p2=${book.id}`,
          );
          await fs.writeFile(file, JSON.stringify(row));
        }
        const content = JSON.parse(row.content);
        return { book, catalogue: content.catalogue || content.gameSystem };
      }),
    )),
  );
}
const output = buildCatalogue(rows, systemId);
const factions = output.factions;
await fs.mkdir("src/data", { recursive: true });
await fs.writeFile(
  "src/data/catalogue.json.tmp",
  JSON.stringify(output, null, 2),
);
await fs.rename("src/data/catalogue.json.tmp", "src/data/catalogue.json");
console.log(
  JSON.stringify({
    factions: factions.length,
    detachments: factions.reduce((n, f) => n + f.detachments.length, 0),
    missing: factions.filter((f) => !f.detachments.length).map((f) => f.name),
  }),
);
