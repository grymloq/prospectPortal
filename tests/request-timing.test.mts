import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import {
  timed,
  timedSync,
  timingJson,
  timingRetry,
  withRequestTiming,
  type TimingRecord,
} from "../src/server/request-timing";

test("request timing isolates concurrent requests and logs only allowlisted measurements", async () => {
  const records: TimingRecord[] = [];
  const responses = await Promise.all([
    withRequestTiming(
      "library.lists",
      async () => {
        await timed(
          "auth",
          async () => new Promise((resolve) => setTimeout(resolve, 8)),
        );
        timingRetry();
        return timingJson({
          private: "PRIVATE_NAME_COOKIE_TOKEN_BODY",
          text: "å",
        });
      },
      (record) => records.push(record),
    ),
    withRequestTiming(
      "notifications.read",
      async () => {
        timedSync("state.project", () => "PRIVATE_FILTER_ID");
        return timingJson(
          { error: "PRIVATE_ERROR_MESSAGE" },
          { status: 401, headers: { "Cache-Control": "private, no-store" } },
        );
      },
      (record) => records.push(record),
    ),
  ]);
  const first = records.find((record) => record.operation === "library.lists")!;
  const second = records.find(
    (record) => record.operation === "notifications.read",
  )!;
  assert.equal(first.retries, 1);
  assert.equal(second.retries, 0);
  assert.equal(second.status, 401);
  assert.ok("auth" in first.phasesMs && !("auth" in second.phasesMs));
  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    const record = response.status === 401 ? second : first;
    assert.equal(
      record.responseBytes,
      Buffer.byteLength(await response.text()),
    );
    assert.ok(
      record.elapsedMs >= 0 &&
        Object.values(record.phasesMs).every((ms) => ms! >= 0),
    );
    assert.deepEqual(
      Object.keys(record).sort(),
      [
        "event",
        "version",
        "operation",
        "status",
        "elapsedMs",
        "phasesMs",
        "responseBytes",
        "retries",
        "firstRequestInProcess",
      ].sort(),
    );
  }
  assert.ok(!JSON.stringify(records).includes("PRIVATE"));
  assert.equal(responses[1].headers.get("Cache-Control"), "private, no-store");
});

test("timing includes failed phases without recording errors and never disrupts responses", async () => {
  const records: TimingRecord[] = [];
  await assert.rejects(
    withRequestTiming(
      "matrix.score",
      async () => {
        return timed("db.commit", async () => {
          throw new Error("PRIVATE_FAILURE_REASON");
        });
      },
      (record) => records.push(record),
    ),
    /PRIVATE_FAILURE_REASON/,
  );
  assert.equal(records[0].status, 500);
  assert.ok("db.commit" in records[0].phasesMs);
  assert.ok(!JSON.stringify(records).includes("PRIVATE"));
  const response = await withRequestTiming(
    "state.read",
    async () => timingJson({ ok: true }),
    () => {
      throw new Error("sink unavailable");
    },
  );
  assert.equal(response.status, 200);
  await assert.rejects(
    withRequestTiming("PRIVATE_QUERY_STRING" as never, async () =>
      timingJson({}),
    ),
    /Unknown timing operation/,
  );
});

test("production timing reports aggregate only measurements, separating status and process-first requests", () => {
  const sample = {
    event: "portal_timing",
    version: 1,
    operation: "library.lists",
    status: 200,
    elapsedMs: 10,
    responseBytes: 100,
    retries: 0,
    firstRequestInProcess: false,
    phasesMs: { auth: 2, PRIVATE_FILTER: 999 },
    PRIVATE_BODY: "PRIVATE_EMAIL",
  };
  const input = [
    sample,
    { message: JSON.stringify({ ...sample, elapsedMs: 20 }) },
    { ...sample, status: 401 },
    { ...sample, firstRequestInProcess: true },
    { ...sample, operation: "PRIVATE_URL" },
    { message: "PRIVATE_RUNTIME_ERROR" },
  ]
    .map((record) => JSON.stringify(record))
    .join("\n");
  const result = spawnSync(
    process.execPath,
    ["scripts/summarize-request-timings.mjs"],
    { input, encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  assert.ok(!result.stdout.includes("PRIVATE"));
  const groups = JSON.parse(result.stdout);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].samples, 2);
  assert.deepEqual(groups[0].measurements.elapsedMs, { median: 10, p95: 20 });
});
