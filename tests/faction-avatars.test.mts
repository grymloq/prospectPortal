import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalogue } from "../src/lib/catalogue";
import { factionAvatar } from "../src/lib/faction-avatars";

test("every catalogue faction has a distinct local, inert vector avatar", () => {
  const paths = new Set<string>();
  for (const faction of catalogue.factions) {
    const path = factionAvatar(faction.name);
    assert.ok(path, faction.name);
    assert.ok(!paths.has(path), `${faction.name} needs its own avatar`);
    paths.add(path);
    const svg = readFileSync(
      new URL(`../public${path}`, import.meta.url),
      "utf8",
    );
    assert.match(svg, /<svg[^>]*viewBox="[^"]+"/);
    assert.match(svg, /<(path|polygon|circle)/);
    assert.doesNotMatch(
      svg,
      /<(script|foreignObject|image|use|style|a)\b|\bon\w+\s*=|href\s*=|url\(/i,
    );
  }
});

test("recorded names and known provider aliases resolve without changing labels", () => {
  for (const [alias, name] of [
    ["T’au Empire", "T'au Empire"],
    ["Emperor’s Children", "Emperor's Children"],
    ["Adeptus Astartes", "Space Marines"],
    ["Imperial Agents", "Agents of the Imperium"],
    ["Questor Traitoris", "Chaos Knights"],
  ])
    assert.equal(factionAvatar(alias), factionAvatar(name));
  assert.equal(factionAvatar("New unknown faction"), undefined);
  assert.equal(factionAvatar(""), undefined);
});
