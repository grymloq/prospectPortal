import type { RosterComposition, RosterSelection } from "./types";

export type DisplayLeader = {
  selection: RosterSelection;
  role: "Leading" | "Supporting";
  quantity: number;
};
export type DisplayUnit = {
  key: string;
  name: string;
  quantity: number;
  quantityKnown: boolean;
  leaders: DisplayLeader[];
  variants: { quantity: number; selection: RosterSelection }[];
  notes: string[];
};

/** Names and selected-instance IDs are omitted from semantic loadout identity. */
function loadout(selection: RosterSelection): string {
  function identity(node: RosterSelection, depth = 0): unknown[] {
    if (depth > 40) return ["unsupported-depth"];
    return [
      node.sourceId,
      node.kind,
      node.quantityKnown !== false,
      node.selections
        .map((child) => [child.quantity, identity(child, depth + 1)])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ];
  }
  return JSON.stringify(identity(selection));
}
function rosterUnits(composition: RosterComposition) {
  const units: RosterSelection[] = [];
  function visit(nodes: RosterSelection[], depth = 0) {
    if (depth > 40) return;
    for (const node of nodes) {
      if (!node.quantity) continue;
      if (node.kind === "unit") units.push(node);
      else visit(node.selections, depth + 1);
    }
  }
  visit(composition.selections);
  return units;
}

/** Attachment changes create a version; volatile instance-ID/export ordering changes do not. */
export function rosterAttachmentSignature(
  composition: RosterComposition,
): string {
  const units = rosterUnits(composition);
  const byId = new Map<string, RosterSelection[]>();
  for (const unit of units)
    if (unit.instanceId)
      byId.set(unit.instanceId, [...(byId.get(unit.instanceId) || []), unit]);
  return JSON.stringify([
    composition.attachmentsVersion || "unknown",
    units
      .flatMap((unit) =>
        (unit.associations || []).map((reference) => [
          loadout(unit),
          unit.quantity,
          reference.role,
          reference.quantity,
          (byId.get(reference.instanceId) || []).map(loadout).sort(),
        ]),
      )
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ]);
}

/** Explicit references only; neither names nor legality rules infer an attachment. */
export function consolidateRoster(composition: RosterComposition): {
  units: DisplayUnit[];
  other: RosterSelection[];
} {
  const units = rosterUnits(composition);
  const byId = new Map<string, RosterSelection[]>();
  for (const unit of units)
    if (unit.instanceId)
      byId.set(unit.instanceId, [...(byId.get(unit.instanceId) || []), unit]);
  const referenced = new Map<RosterSelection, number>();
  for (const unit of units)
    for (const reference of unit.associations || []) {
      const targets = byId.get(reference.instanceId);
      if (reference.role === "Leading" && targets?.length === 1)
        referenced.set(
          targets[0],
          (referenced.get(targets[0]) || 0) + reference.quantity,
        );
    }
  const groups = new Map<string, DisplayUnit>();
  for (const unit of units) {
    const hiddenQuantity = referenced.get(unit) || 0;
    // Chains/cycles, conflicting allocations and unknown quantities remain standalone.
    const removable =
      unit.quantityKnown !== false &&
      hiddenQuantity <= unit.quantity &&
      !unit.associations?.length
        ? hiddenQuantity
        : 0;
    if (removable === unit.quantity) continue;
    const quantity = unit.quantity - removable;
    const leaders: DisplayLeader[] = [];
    const notes: string[] = [];
    for (const reference of unit.associations || []) {
      const targets = byId.get(reference.instanceId);
      const target = targets?.length === 1 ? targets[0] : undefined;
      if (
        !target ||
        target === unit ||
        target.quantityKnown === false ||
        reference.quantity > target.quantity ||
        (reference.role === "Leading" &&
          (referenced.get(target) || 0) > target.quantity)
      ) {
        notes.push(
          "An attachment reference could not be resolved unambiguously.",
        );
        continue;
      }
      leaders.push({
        selection: target,
        role: reference.role,
        quantity: reference.quantity,
      });
    }
    const uniqueNotes = [...new Set(notes)];
    const key = JSON.stringify([
      unit.sourceId,
      unit.quantityKnown !== false,
      leaders
        .map((leader) => [
          loadout(leader.selection),
          leader.role,
          leader.quantity,
        ])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      uniqueNotes,
    ]);
    const group = groups.get(key) || {
      key,
      name: unit.name,
      quantity: 0,
      quantityKnown: unit.quantityKnown !== false,
      leaders: leaders.map((leader) => ({ ...leader })),
      variants: [],
      notes: uniqueNotes,
    };
    if (groups.has(key))
      for (const leader of group.leaders)
        leader.quantity += leaders.find(
          (other) =>
            loadout(other.selection) === loadout(leader.selection) &&
            other.role === leader.role,
        )!.quantity;
    group.quantity += quantity;
    const variant = group.variants.find(
      (item) => loadout(item.selection) === loadout(unit),
    );
    if (variant) variant.quantity += quantity;
    else group.variants.push({ quantity, selection: unit });
    groups.set(key, group);
  }
  return {
    units: [...groups.values()],
    other: composition.selections.filter(
      (selection) =>
        selection.kind !== "unit" &&
        !rosterUnits({ ...composition, selections: [selection] }).length,
    ),
  };
}
