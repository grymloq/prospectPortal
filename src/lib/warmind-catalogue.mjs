import { parse } from "acorn";
function property(node, name) {
  return node?.properties?.find((p) => (p.key?.name || p.key?.value) === name)
    ?.value;
}
function literal(node) {
  if (!node) return undefined;
  if (node.type === "Literal") return node.value;
  if (node.type === "ArrayExpression") return node.elements.map(literal);
  if (node.type === "UnaryExpression" && node.operator === "!")
    return !literal(node.argument);
  throw new Error("Unsupported Warmind catalogue value.");
}
export function extractWarmindFactions(bundle) {
  const ast = parse(bundle, { ecmaVersion: "latest", sourceType: "module" });
  const candidates = [];
  for (const statement of ast.body) {
    for (const declaration of statement.declarations || []) {
      const array = declaration.init;
      if (array?.type !== "ArrayExpression") continue;
      const first = array.elements[0];
      if (
        !property(first, "detachments") ||
        !property(first, "generatedAt") ||
        literal(property(first, "edition")) !== "11e"
      )
        continue;
      candidates.push(array);
    }
  }
  if (candidates.length !== 1)
    throw new Error("Warmind’s 11th edition catalogue could not be verified.");
  return candidates[0].elements.map((f) => ({
    id: literal(property(f, "id")),
    name: literal(property(f, "name")),
    version: literal(property(f, "version")),
    generatedAt: literal(property(f, "generatedAt")),
    detachments: property(f, "detachments")
      .elements.filter((d) => !literal(property(d, "codexPreview")))
      .map((d) => ({
        name: literal(property(d, "name")),
        points: literal(property(d, "dp")),
        objectives: property(d, "objectiveAlternatives")
          ? literal(property(d, "objectiveAlternatives"))
          : [literal(property(d, "objective"))],
      })),
  }));
}
