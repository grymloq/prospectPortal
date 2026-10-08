export function buildCatalogue(rows, systemId = 827374861) {
  const byCatalogue = new Map(rows.map((r) => [r.book.bsid, r]));
  function collect(o, map) {
    if (!o || typeof o !== "object") return;
    if (o.id && !o.targetId) map.set(o.id, o);
    for (const value of Object.values(o))
      if (Array.isArray(value)) value.forEach((v) => collect(v, map));
  }
  const systemRow = rows.find((r) => r.book.id === systemId);
  const sysIndex = new Map();
  collect(systemRow.catalogue, sysIndex);
  const dispGroup = [...sysIndex.values()].find(
    (o) => o.name === "Force Disposition" && o.selectionEntries,
  );
  const dispositions = dispGroup.selectionEntries.map((o) => ({
    id: o.id,
    name: o.name,
  }));
  if (!dispositions.length)
    throw new Error("Catalogue has no force dispositions");
  const dispositionNames = new Set(dispositions.map((d) => d.name));
  const factions = rows
    .filter((r) => r.book.playable)
    .map(({ book, catalogue }) => {
      const index = new Map(sysIndex);
      const visited = new Set();
      function imports(cat) {
        if (!cat || visited.has(cat.id)) return;
        visited.add(cat.id);
        for (const link of cat.catalogueLinks || [])
          imports(byCatalogue.get(link.targetId)?.catalogue);
        collect(cat, index);
      }
      imports(catalogue);
      function findRoot(cat, searched = new Set()) {
        if (!cat || searched.has(cat.id)) return;
        searched.add(cat.id);
        const own = (cat.entryLinks || []).find((o) =>
          /^Detachments?$/.test(o.name),
        );
        if (own) return own;
        for (const link of cat.catalogueLinks || [])
          if (link.importRootEntries && /Space Marines/.test(link.name)) {
            const root = findRoot(
              byCatalogue.get(link.targetId)?.catalogue,
              searched,
            );
            if (root) return root;
          }
      }
      const root = findRoot(catalogue);
      const choices = new Map();
      const seen = new Set();
      function resolve(o) {
        if (!o || seen.has(o.id)) return;
        seen.add(o.id);
        if (o.targetId) {
          resolve(index.get(o.targetId));
          return;
        }
        const dp = o.costs?.find((c) => c.name === "Detachment Points");
        if (dp) {
          const matches = (c) =>
            c.scope === "primary-catalogue"
              ? c.type === "instanceOf"
                ? c.childId === catalogue.id
                : c.type === "notInstanceOf"
                  ? c.childId !== catalogue.id
                  : false
              : false;
          const groupMatches = (g) =>
            g.type === "or"
              ? [
                  ...(g.conditions || []).map(matches),
                  ...(g.conditionGroups || []).map(groupMatches),
                ].some(Boolean)
              : [
                  ...(g.conditions || []).map(matches),
                  ...(g.conditionGroups || []).map(groupMatches),
                ].every(Boolean);
          const applies = (m) =>
            (m.conditions?.length || m.conditionGroups?.length) &&
            (m.conditions || []).every(matches) &&
            (m.conditionGroups || []).every(groupMatches);
          const hiddenByChapter = (o.modifiers || []).some(
            (m) => m.field === "hidden" && m.value === true && applies(m),
          );
          if (hiddenByChapter) return;
          const ds = (o.categoryLinks || [])
            .filter((c) => dispositionNames.has(c.name))
            .map((c) => dispositions.find((d) => d.name === c.name).id);
          let points = dp.value;
          for (const mod of o.modifiers || [])
            if (mod.field === dp.typeId && mod.type === "set" && applies(mod))
              points = mod.value;
          if (ds.length)
            choices.set(o.id, {
              id: o.id,
              name: o.name,
              points,
              dispositions: ds,
            });
          return;
        }
        for (const key of [
          "entryLinks",
          "selectionEntries",
          "selectionEntryGroups",
        ])
          for (const child of o[key] || []) resolve(child);
      }
      resolve(root);
      return {
        id: String(book.id),
        name: book.name
          .replace(/^(Imperium|Xenos|Chaos) - /, "")
          .replace("Adeptus Astartes - ", ""),
        sourceName: book.name,
        revision: book.nrversion,
        updatedAt: book.last_updated,
        detachments: [...choices.values()].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        titan: /Titanicus/.test(book.name),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  if (
    !factions.length ||
    !factions.some((f) => f.name === "Orks" && f.detachments.length >= 10) ||
    factions.some((f) => !f.titan && !f.detachments.length) ||
    factions.some((f) =>
      f.detachments.some((d) => !d.id || !d.name || !Number.isFinite(d.points)),
    )
  )
    throw new Error("Catalogue validation failed");
  return {
    source: "New Recruit / BSData",
    sourceUrl: "https://www.newrecruit.eu",
    retrievedAt: new Date().toISOString(),
    systemId,
    systemRevision: systemRow.book.nrversion,
    dispositions,
    factions,
    note: "Disposition choices are the union of categories contributed by selected detachments. This is a journal selector, not a full roster legality engine.",
  };
}
