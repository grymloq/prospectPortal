import type {
  Army,
  LibraryLoadoutDeviation,
  LibraryLoadoutItem,
  RosterSelection,
} from "@/lib/types";
import { canonicalRoster } from "./army-library-identity";
import { visibleEquipment } from "@/lib/roster-equipment";

type UnitLoadouts = {
  name: string;
  quantity: number;
  items: Map<string, LibraryLoadoutItem>;
  variants: Set<string>;
};
function selectedLoadouts(army: Army) {
  const units = new Map<string, UnitLoadouts>();
  let visited = 0,
    valid = true;
  function items(
    nodes: RosterSelection[],
    result: UnitLoadouts,
    multiplier: number,
    depth: number,
  ) {
    if (depth > 40) {
      valid = false;
      return;
    }
    for (const node of nodes) {
      if (++visited > 20000) {
        valid = false;
        return;
      }
      if (!node.quantity || node.kind === "unit") continue;
      const quantity = multiplier * node.quantity;
      if (node.quantityKnown === false || !Number.isSafeInteger(quantity)) {
        valid = false;
        continue;
      }
      // Selection containers do not constitute additional upgrades. Retain named enhancement choices.
      if (
        node.kind === "enhancement" ||
        (node.kind === "option" &&
          !node.selections.some((child) => child.quantity > 0))
      ) {
        const key = JSON.stringify([node.sourceId, node.kind]);
        const previous = result.items.get(key);
        const total = (previous?.quantity || 0) + quantity;
        if (!Number.isSafeInteger(total)) {
          valid = false;
          continue;
        }
        result.items.set(key, {
          sourceId: node.sourceId,
          name:
            previous && previous.name.localeCompare(node.name) < 0
              ? previous.name
              : node.name,
          kind: node.kind,
          quantity: total,
        });
      }
      items(node.selections, result, quantity, depth + 1);
    }
  }
  function walk(nodes: RosterSelection[], depth = 0) {
    if (depth > 40) {
      valid = false;
      return;
    }
    for (const node of nodes) {
      if (++visited > 20000) {
        valid = false;
        return;
      }
      if (!node.quantity) continue;
      if (node.kind !== "unit") {
        walk(node.selections, depth + 1);
        continue;
      }
      if (node.quantityKnown === false) {
        valid = false;
        continue;
      }
      const entry = units.get(node.sourceId) || {
        name: node.name,
        quantity: 0,
        items: new Map(),
        variants: new Set<string>(),
      };
      entry.name = [entry.name, node.name].sort()[0];
      entry.quantity += node.quantity;
      entry.variants.add(
        canonicalRoster({
          ...army.composition!,
          selections: [{ ...node, quantity: 1 }],
        }),
      );
      items(
        visibleEquipment(node.selections, node, army.composition!),
        entry,
        node.quantity,
        depth + 1,
      );
      units.set(node.sourceId, entry);
    }
  }
  walk(army.composition?.selections || []);
  return valid ? units : null;
}
const sorted = (items: Iterable<LibraryLoadoutItem>) =>
  [...items].sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.sourceId.localeCompare(b.sourceId),
  );

/** Call only after the shared-library publication and complete-composition gates. */
export function libraryLoadoutChanges(
  baseline: Army,
  current: Army,
): LibraryLoadoutDeviation[] {
  if (
    baseline.composition?.status !== "complete" ||
    current.composition?.status !== "complete"
  )
    return [];
  const before = selectedLoadouts(baseline),
    after = selectedLoadouts(current);
  if (!before || !after) return [];
  const result: LibraryLoadoutDeviation[] = [];
  for (const [unitSourceId, list] of after) {
    const base = before.get(unitSourceId);
    // A newly added/removed unit is already listed as a unit delta, not a changed existing character.
    if (!base) continue;
    const added: LibraryLoadoutItem[] = [],
      removed: LibraryLoadoutItem[] = [];
    for (const key of new Set([...base.items.keys(), ...list.items.keys()])) {
      const old = base.items.get(key),
        now = list.items.get(key);
      const delta = (now?.quantity || 0) - (old?.quantity || 0);
      if (delta > 0) added.push({ ...now!, quantity: delta });
      if (delta < 0) removed.push({ ...old!, quantity: -delta });
    }
    if (!added.length && !removed.length) continue;
    const change = {
      unitSourceId,
      unitName: list.name,
      added: sorted(added),
      removed: sorted(removed),
    };
    if (base.quantity === list.quantity) result.push(change);
    else if (
      base.variants.size !== list.variants.size ||
      [...base.variants].some((variant) => !list.variants.has(variant))
    ) {
      // Unequal group sizes cannot identify the surviving character. Show recorded group totals instead.
      const changedItems = new Set(
        [...added, ...removed].map((item) =>
          JSON.stringify([item.sourceId, item.kind]),
        ),
      );
      result.push({
        ...change,
        added: [],
        removed: [],
        before: sorted(base.items.values()).filter((item) =>
          changedItems.has(JSON.stringify([item.sourceId, item.kind])),
        ),
        after: sorted(list.items.values()).filter((item) =>
          changedItems.has(JSON.stringify([item.sourceId, item.kind])),
        ),
      });
    }
  }
  return result.sort(
    (a, b) =>
      a.unitName.localeCompare(b.unitName) ||
      a.unitSourceId.localeCompare(b.unitSourceId),
  );
}
