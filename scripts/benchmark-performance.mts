// Repeatable production-build HTTP measurements against synthetic, isolated data.
// Usage: npx tsx scripts/benchmark-performance.mts before|after [lists] [games]
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Army, ArmyListVersion, RosterSelection } from "../src/lib/types";
import { armySnapshot, catalogue } from "../src/lib/catalogue";
import {
  classifyLibraryVersion,
  normalizeRosterIdentity,
} from "../src/server/army-library-identity";
import { queryArmyLibrary } from "../src/server/army-library";

const label = process.argv[2] || "before";
const lists = Number(process.argv[3] || 200),
  games = Number(process.argv[4] || 1000);
mkdirSync(".local", { recursive: true });
const scratch = mkdtempSync(path.resolve(".local/performance-"));
process.env.TEAM_DB_PATH = path.join(scratch, "synthetic.sqlite");
const { db, readState } = await import("../src/server/store");
const state = readState();
const patchId = state.patches!.at(-1)!.id;
state.games = [];
state.savedArmies = [];
state.armyVersions = [];
state.libraryMemberships = [];
state.matrixLists = [];
state.manualEstimates = [];
state.matrixChanges = [];
// Synthetic fixtures bypass domain writes; force the same legacy backfill as
// preexisting production data instead of retaining the seed's current marker.
delete state.armySummaryRevision;
const factions = catalogue.factions
  .filter((f) => f.detachments.length)
  .slice(0, 8);
const unit = (
  id: number,
  quantity: number,
  nested = false,
): RosterSelection => ({
  sourceId: `newrecruit:system:catalogue:${nested ? "option" : "unit"}-${id}`,
  name: `${nested ? "Equipment" : "Unit"} ${id}`,
  kind: nested ? "option" : "unit",
  quantity,
  selections: nested ? [] : [unit(id, 1, true), unit(id + 20, 2, true)],
});
for (let i = 0; i < lists; i++) {
  const faction = factions[i % factions.length],
    detachment = faction.detachments[0];
  const army: Army = armySnapshot(
    {
      faction: faction.id,
      detachments: [detachment.id],
      disposition: detachment.dispositions[0] || catalogue.dispositions[0].id,
      listUrl: "",
    },
    state.patches!.at(-1)!.catalogue,
  );
  army.listName = `Synthetic list ${String(i).padStart(4, "0")}`;
  army.composition = normalizeRosterIdentity({
    status: "complete",
    normalizationVersion: "newrecruit-selected-v1",
    selections: Array.from({ length: 20 }, (_, j) =>
      unit(j, 1 + ((i + j) % 3)),
    ),
    reasons: [],
    source: {
      provider: "newrecruit",
      systemId: "system",
      catalogueId: "catalogue",
    },
  });
  const user = state.users[1 + (i % (state.users.length - 1))];
  for (let v = 1; v <= 3; v++) {
    const version: ArmyListVersion = {
      id: `synthetic-${i}:v${v}`,
      listId: `synthetic-${i}`,
      userId: user.id,
      number: v,
      patchId,
      army: structuredClone(army),
      published: true,
      createdAt: `2026-10-0${v}T00:00:00.000Z`,
    };
    state.armyVersions.push(version);
    state.libraryMemberships.push(classifyLibraryVersion(version, state));
  }
  state.savedArmies.push({
    id: `synthetic-${i}`,
    userId: user.id,
    patchId,
    army,
    shared: true,
    currentVersionId: `synthetic-${i}:v3`,
    ownerName: user.name,
    updatedAt: "2026-10-03T00:00:00.000Z",
  });
}
for (let i = 0; i < games; i++) {
  const own = state.savedArmies[i % lists],
    enemy = state.savedArmies[(i + 3) % lists];
  state.games.push({
    id: `synthetic-game-${i}`,
    userId: own.userId,
    patchId,
    own: structuredClone(own.army),
    enemy: structuredClone(enemy.army),
    ownListVersionId: own.currentVersionId,
    enemyListVersionId: enemy.currentVersionId,
    libraryContribution: true,
    date: `2026-10-${String(1 + (i % 9)).padStart(2, "0")}`,
    opponent: "Synthetic opponent",
    score: i % 21,
    outcome: i % 21 > 10 ? "Win" : i % 21 === 10 ? "Draw" : "Loss",
    layout: (["A", "B", "C"] as const)[i % 3],
    context: "Synthetic practice",
    notes: "",
    eventId: "",
    updatedAt: "2026-10-03T00:00:00.000Z",
  });
}
db.prepare("UPDATE app_state SET value=? WHERE id=1").run(
  JSON.stringify(state),
);
db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
  "synthetic-benchmark",
  "admin",
  Date.now() + 3600000,
);
db.close();
const actor = state.users[0];
const queries = [
  { patchId },
  { patchId, tab: "archetypes" as const },
  { patchId, search: "Synthetic list 00", sort: "matches" as const },
  { patchId, target: { kind: "list" as const, id: "synthetic-0" } },
  { patchId, page: 3, sort: "score" as const },
];
const fingerprints = queries.map((query) =>
  createHash("sha256")
    .update(JSON.stringify(queryArmyLibrary(state, actor, query)))
    .digest("hex"),
);
const prefix = `.local/performance-${lists}-${games}`;
const baselineLabel = label.replace(/after$/, "before");
if (label.endsWith("after") && existsSync(`${prefix}-${baselineLabel}.json`)) {
  const before = JSON.parse(
    readFileSync(`${prefix}-${baselineLabel}.json`, "utf8"),
  );
  if (JSON.stringify(before.fingerprints) !== JSON.stringify(fingerprints))
    throw new Error(
      "Library DTO changed from baseline: inspect before measuring.",
    );
}
const origin = "http://127.0.0.1:3109";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3109",
  ],
  {
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
let logs = "";
child.stdout.on("data", (value) => (logs += value));
child.stderr.on("data", (value) => (logs += value));
async function request(route: string, body?: object) {
  const start = performance.now();
  const response = await fetch(origin + route, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      Cookie: "team_session=synthetic-benchmark",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status}: ${text}`);
  return { ms: performance.now() - start, bytes: Buffer.byteLength(text) };
}
const percentile = (values: number[], p: number) =>
  values.slice().sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
try {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      await request("/api/notifications");
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const measurements: Record<string, unknown> = {};
  const endpoints = [
    ["library", `/api/army-library?patchId=${patchId}`],
    ["archetypes", `/api/army-library?patchId=${patchId}&tab=archetypes`],
    [
      "detail",
      `/api/army-library?patchId=${patchId}&targetKind=list&targetId=synthetic-0`,
    ],
    ["notifications", "/api/notifications"],
    ["matrixScore", "/api/state?response=matrix-score"],
  ];
  for (const [name, route] of endpoints) {
    const body =
      name === "matrixScore"
        ? {
            type: "manualEstimate",
            patchId,
            own: state.savedArmies[0].army,
            enemy: state.savedArmies[1].army,
            layout: "A",
            score: 12,
          }
        : undefined;
    for (let i = 0; i < 3; i++) await request(route, body);
    const samples = [];
    for (let i = 0; i < 15; i++) samples.push(await request(route, body));
    measurements[name] = {
      medianMs: percentile(
        samples.map((s) => s.ms),
        0.5,
      ),
      p95Ms: percentile(
        samples.map((s) => s.ms),
        0.95,
      ),
      bytes: samples.at(-1)!.bytes,
    };
    console.log(name, measurements[name]);
  }
  const concurrent = await Promise.all(
    Array.from({ length: 10 }, () =>
      request(`/api/army-library?patchId=${patchId}`),
    ),
  );
  measurements.concurrentLibrary = {
    medianMs: percentile(
      concurrent.map((s) => s.ms),
      0.5,
    ),
    p95Ms: percentile(
      concurrent.map((s) => s.ms),
      0.95,
    ),
  };
  const output = {
    label,
    lists,
    versions: lists * 3,
    games,
    stateBytes: Buffer.byteLength(JSON.stringify(state)),
    node: process.version,
    samples: 15,
    fingerprints,
    measurements,
  };
  writeFileSync(`${prefix}-${label}.json`, JSON.stringify(output, null, 2));
  // Retain only our allowlisted measurement events, never arbitrary runtime logs.
  const timingLines = logs.split(/\r?\n/).filter((line) => {
    try {
      return JSON.parse(line).event === "portal_timing";
    } catch {
      return false;
    }
  });
  writeFileSync(`${prefix}-${label}-timings.jsonl`, timingLines.join("\n"));
  console.log(JSON.stringify(output, null, 2));
} finally {
  child.kill();
}
