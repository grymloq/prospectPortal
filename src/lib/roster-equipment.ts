import data from "@/data/equipment-defaults.json";
import type { RosterComposition, RosterSelection } from "./types";

const defaults: Record<string, number> = data.defaults;
const books: Record<
  string,
  { name: string; revision: number; catalogueId?: string }
> = data.books;
const catalogueBooks = new Map(
  Object.entries(books).flatMap(([id, book]) =>
    book.catalogueId ? [[book.catalogueId, id] as const] : [],
  ),
);
const containers = new Set(data.containers);
function source(id: string) {
  const parts = id.split(":");
  try {
    const catalogue = decodeURIComponent(parts[2] || "");
    const bookId = Object.hasOwn(books, catalogue)
      ? catalogue
      : catalogueBooks.get(catalogue);
    if (
      parts.length !== 4 ||
      parts[0] !== "newrecruit" ||
      parts[1] !== data.systemId ||
      !bookId
    )
      return undefined;
    return {
      catalogue: bookId,
      id: decodeURIComponent(parts[3]),
    };
  } catch {
    return undefined;
  }
}

/** Remove only catalogue-confirmed standard quantities from the display, never the stored roster. */
export function visibleEquipment(
  selections: RosterSelection[],
  parent: RosterSelection | undefined,
  composition: RosterComposition,
  depth = 0,
): RosterSelection[] {
  if (depth > 40 || composition.status !== "complete") return selections;
  const previous = parent && source(parent.sourceId);
  return selections.flatMap((selection) => {
    if (!selection.quantity) return [];
    const current = source(selection.sourceId);
    const supportedRevision =
      !current ||
      !composition.source.catalogues?.some(
        (book) =>
          book.id === current.catalogue &&
          book.revision > books[current.catalogue].revision,
      );
    const standard =
      current &&
      previous &&
      supportedRevision &&
      selection.kind === "option" &&
      selection.quantityKnown !== false
        ? defaults[`${previous.id}/${current.id}`] || 0
        : 0;
    const children = visibleEquipment(
      selection.selections,
      selection,
      composition,
      depth + 1,
    );
    const quantity = Math.max(0, selection.quantity - standard);
    // Upgrades on omitted standard copies remain visible alongside any additional weapon copies.
    let promoted: RosterSelection[] = [];
    const hiddenQuantity = selection.quantity - quantity;
    if (hiddenQuantity) {
      if (
        children.some(
          (child) => !Number.isSafeInteger(child.quantity * hiddenQuantity),
        )
      )
        return [selection];
      promoted = children.map((child) => ({
        ...child,
        quantity: child.quantity * hiddenQuantity,
      }));
    }
    if (!quantity) return promoted;
    if (
      current &&
      containers.has(current.id) &&
      selection.selections.length &&
      !children.length
    )
      return [];
    return [{ ...selection, quantity, selections: children }, ...promoted];
  });
}

export function catalogueRevisions(entries: string[]) {
  return entries.flatMap((entry) => {
    const match = /^(.*):\s*(\d+)$/.exec(entry);
    if (!match) return [];
    const book = Object.entries(books).find(
      ([, book]) => book.name === match[1],
    );
    const revision = Number(match[2]);
    return book && Number.isSafeInteger(revision) && revision <= 100000
      ? [{ id: book[0], revision }]
      : [];
  });
}
