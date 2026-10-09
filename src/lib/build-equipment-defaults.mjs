/** Derive display-only defaults from catalogue constraints, never names or weapon legality. */
export function buildEquipmentDefaults(catalogues) {
  const definitions = new Map(),
    affected = new Set();
  function collect(node) {
    if (!node || typeof node !== "object") return;
    if (
      node.id &&
      (node.type === "upgrade" ||
        node.type === "model" ||
        node.type === "unit" ||
        node.type === "selectionEntry" ||
        node.type === "selectionEntryGroup" ||
        node.selectionEntries ||
        node.selectionEntryGroups ||
        node.entryLinks ||
        node.typeName)
    ) {
      const record = {};
      for (const key of [
        "id",
        "targetId",
        "type",
        "typeName",
        "defaultSelectionEntryId",
        "constraints",
      ])
        if (node[key] !== undefined) record[key] = node[key];
      for (const key of [
        "selectionEntries",
        "selectionEntryGroups",
        "entryLinks",
      ])
        if (node[key])
          record[key] = node[key].map((child) => ({ id: child.id }));
      if (node.profiles)
        record.profiles = node.profiles.map((profile) => ({
          typeName: profile.typeName,
        }));
      if (node.infoLinks)
        record.infoLinks = node.infoLinks.map((link) => ({
          targetId: link.targetId,
        }));
      const values = definitions.get(node.id) || new Map();
      values.set(JSON.stringify(record), record);
      definitions.set(node.id, values);
    }
    for (const modifier of node.modifiers || [])
      if (typeof modifier.field === "string") affected.add(modifier.field);
    for (const value of Object.values(node))
      if (Array.isArray(value)) value.forEach(collect);
  }
  catalogues.forEach(collect);
  const records = new Map(
    [...definitions].map(([id, variants]) => [id, [...variants.values()]]),
  );
  const resolved = new Map();
  function resolve(node, seen = new Set()) {
    if (!node.targetId) return [node];
    if (seen.has(node.targetId)) return [];
    const next = new Set([...seen, node.targetId]);
    const results = (records.get(node.targetId) || []).flatMap((target) =>
      resolve(target, next).map((base) => ({
        ...base,
        id: node.id,
        constraints: [...(base.constraints || []), ...(node.constraints || [])],
        modifiers: [...(base.modifiers || []), ...(node.modifiers || [])],
        modifierGroups: [
          ...(base.modifierGroups || []),
          ...(node.modifierGroups || []),
        ],
        entryLinks: [...(base.entryLinks || []), ...(node.entryLinks || [])],
        selectionEntries: [
          ...(base.selectionEntries || []),
          ...(node.selectionEntries || []),
        ],
        selectionEntryGroups: [
          ...(base.selectionEntryGroups || []),
          ...(node.selectionEntryGroups || []),
        ],
      })),
    );
    return [
      ...new Map(
        results.map((result) => [JSON.stringify(result), result]),
      ).values(),
    ];
  }
  function variants(node) {
    if (!resolved.has(node)) resolved.set(node, resolve(node));
    return resolved.get(node);
  }
  function weapon(node) {
    if (node.type !== "upgrade") return false;
    const profiles = [
      ...(node.profiles || []),
      ...(node.infoLinks || []).flatMap(
        (link) => records.get(link.targetId) || [],
      ),
    ];
    return profiles.some((profile) =>
      /^(Ranged|Melee) Weapons?$/.test(profile.typeName || ""),
    );
  }
  function minimum(node) {
    const constraints = (node.constraints || []).filter(
      (c) => c.field === "selections" && c.scope === "parent",
    );
    if (
      !constraints.length ||
      constraints.some(
        (c) => c.percentValue || c.includeChildSelections || affected.has(c.id),
      )
    )
      return undefined;
    const values = constraints
      .filter((c) => c.type === "min")
      .map((c) => Number(c.value));
    if (
      !values.length ||
      values.some((value) => !Number.isSafeInteger(value) || value < 0)
    )
      return undefined;
    // Conflicting link/target constraints require the catalogue engine; do not infer their result.
    if (new Set(values).size !== 1) return undefined;
    return values[0];
  }
  const observations = new Map();
  for (const entries of records.values())
    for (const rawParent of entries)
      for (const parent of variants(rawParent)) {
        for (const childReference of [
          ...(parent.selectionEntries || []),
          ...(parent.selectionEntryGroups || []),
          ...(parent.entryLinks || []),
        ])
          for (const child of records.get(childReference.id) || []) {
            const choices = variants(child);
            if (!choices.length) continue;
            let defaultQuantity;
            const optionalParent =
              minimum(parent) === 0 ||
              (parent.constraints || []).some((constraint) =>
                affected.has(constraint.id),
              );
            if (!optionalParent && choices.every(weapon)) {
              const mins = choices.map(minimum);
              if (
                mins.every((value) => value !== undefined && value > 0) &&
                new Set(mins).size === 1
              )
                defaultQuantity = mins[0];
              else if (
                parent.defaultSelectionEntryId === child.id &&
                !affected.has("defaultSelectionEntryId")
              ) {
                const value = minimum(parent);
                if (value > 0) defaultQuantity = value;
              }
            }
            // Every historical definition of this edge must agree before equipment can be hidden.
            for (const id of new Set(
              [child.id, child.targetId].filter(Boolean),
            )) {
              const key = `${rawParent.id}/${id}`;
              const observed = observations.get(key) || new Set();
              observed.add(defaultQuantity || 0);
              observations.set(key, observed);
            }
          }
      }
  const containers = [...records]
    .filter(([, entries]) =>
      entries.every(
        (entry) =>
          variants(entry).length &&
          variants(entry).every(
            (node) =>
              !["unit", "model", "upgrade"].includes(node.type) &&
              ((node.selectionEntries || []).length ||
                (node.selectionEntryGroups || []).length ||
                (node.entryLinks || []).length),
          ),
      ),
    )
    .map(([id]) => id)
    .sort();
  return {
    defaults: Object.fromEntries(
      [...observations]
        .filter(([, values]) => values.size === 1 && !values.has(0))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, values]) => [key, [...values][0]]),
    ),
    containers,
  };
}
