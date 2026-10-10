// Isolated PostgreSQL (PGlite), including JSON transfer/parsing and unchanged domain analytics.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  libraryFixture,
  member,
  migrateLibrary,
  postgresFixture,
  readLibrary,
} from "./lib/library-postgres-fixture.mjs";
import { queryArmyLibrary } from "../src/server/army-library";
import type { State } from "../src/lib/types";
const lists = Number(process.argv[2] || 200),
  games = Number(process.argv[3] || 1000);
const state = libraryFixture(lists, games);
// Private workspace growth must not enter the library read model.
state.messages = Array.from({ length: games }, (_, i) => ({
  id: `private-${i}`,
  userId: member.id,
  authorId: "admin",
  authorName: "Admin",
  internal: true,
  text: "PRIVATE INTERNAL DISCUSSION ".repeat(100),
  createdAt: "2026-10-01",
}));
const db = await postgresFixture(state);
const percentile = (values: number[], p: number) =>
  values.slice().sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
async function measure(mode: "before" | "after") {
  const output: Record<string, unknown> = {};
  for (const [name, query] of Object.entries({
    browse: { patchId: "p" },
    archetypes: { patchId: "p", tab: "archetypes" as const },
    detail: { patchId: "p", target: { kind: "list" as const, id: "list-0" } },
  })) {
    const samples: number[] = [];
    let bytes = 0;
    for (let i = 0; i < 18; i++) {
      const start = performance.now();
      const raw =
        mode === "before"
          ? (
              await db.query<{ value: State }>(
                "select value from portal_state where id=1",
              )
            ).rows[0].value
          : (await readLibrary(db)).state;
      const serialized = JSON.stringify(raw);
      bytes = Buffer.byteLength(serialized);
      const result = queryArmyLibrary(JSON.parse(serialized), member, query);
      if (i === 0)
        assert.deepEqual(result, queryArmyLibrary(state, member, query));
      if (i >= 3) samples.push(performance.now() - start);
    }
    output[name] = {
      medianMs: percentile(samples, 0.5),
      p95Ms: percentile(samples, 0.95),
      readBytes: bytes,
    };
  }
  return output;
}
try {
  const before = await measure("before");
  const next = JSON.stringify({
    ...state,
    audit: [
      {
        id: "audit",
        actor: "admin",
        text: "Measurement",
        createdAt: "2026-10-01",
      },
    ],
  });
  const beforeWriteStart = performance.now();
  await db.query("select portal_commit(0,$1::jsonb)", [next]);
  const beforeWriteMs = performance.now() - beforeWriteStart;
  await migrateLibrary(db);
  const after = await measure("after");
  // Unrelated writes still update the compatibility revision without changing library rows.
  const writeStart = performance.now();
  await db.query("select portal_commit(1,$1::jsonb)", [next]);
  const writeMs = performance.now() - writeStart;
  const output = {
    lists,
    versions: lists * 3,
    games,
    samples: 15,
    engine: "PGlite PostgreSQL; local, no network",
    before,
    after,
    compatibilityCommitMs: { before: beforeWriteMs, after: writeMs },
  };
  mkdirSync(".local", { recursive: true });
  writeFileSync(
    `.local/library-database-${lists}-${games}.json`,
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify(output, null, 2));
} finally {
  await db.close();
}
