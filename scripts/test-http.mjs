import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
await mkdir(".local", { recursive: true });
const scratch = await mkdtemp(path.resolve(".local/http-qa-"));
const origin = "http://127.0.0.1:3107";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3107",
  ],
  {
    env: { ...process.env, TEAM_DB_PATH: path.join(scratch, "test.sqlite") },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
let logs = "";
child.stdout.on("data", (b) => (logs += b));
child.stderr.on("data", (b) => (logs += b));
let passed = 0;
async function request(
  route,
  body,
  cookie,
  method = body ? "POST" : "GET",
  headers = {},
) {
  const r = await fetch(origin + route, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
function check(name, fn) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try {
      const r = await fetch(origin + "/api/state");
      if (r.status === 401) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw new Error("Test server did not start. " + logs);
  const anon = await request("/api/state");
  check("anonymous access blocked", () => assert.equal(anon.status, 401));
  const admin = await request("/api/session", {
    email: "admin@teamsweden.local",
    password: "Sweden40k!",
  });
  assert.equal(admin.status, 200);
  const player = await request("/api/session", {
    email: "player@teamsweden.local",
    password: "Sweden40k!",
  });
  assert.equal(player.status, 200);
  const memberView = await request("/api/state", null, player.cookie);
  const patchCommand = {
    type: "patch",
    name: "HTTP test patch",
    date: "2026-10-01",
  };
  const blockedPatch = await request("/api/state", patchCommand, player.cookie);
  const createdPatch = await request("/api/state", patchCommand, admin.cookie);
  const patchesForPlayer = await request("/api/state", null, player.cookie);
  check("admin-only patch creation and historical backfill", () => {
    assert.equal(blockedPatch.status, 400);
    assert.equal(createdPatch.status, 200);
    assert.equal(patchesForPlayer.data.patches[0].date, "2026-10-01");
    assert.ok(memberView.data.games.every((g) => g.patchId === "2026-09-02"));
  });
  check("private server response", () => {
    assert.equal(memberView.data.users.length, 1);
    assert.equal(memberView.data.evaluations.length, 0);
    assert.equal(memberView.data.evaluationHistory.length, 0);
    assert.ok(!JSON.stringify(memberView.data).includes("Internal sample"));
    assert.ok(!JSON.stringify(memberView.data).includes("password"));
  });
  const forged = await request(
    "/api/state",
    {
      type: "phase",
      userId: "p2",
      phaseId: "selected",
      rejected: false,
      reason: "forged",
    },
    player.cookie,
  );
  check("forged admin mutation blocked", () =>
    assert.equal(forged.status, 400),
  );
  const cross = await request(
    "/api/state",
    { type: "message", userId: "p1", internal: false, text: "cross-site" },
    player.cookie,
    "POST",
    { Origin: "https://elsewhere.invalid" },
  );
  check("cross-origin mutation blocked", () => assert.equal(cross.status, 400));
  const registered = await request("/api/session", {
    register: true,
    name: "HTTP test player",
    email: "qa@example.test",
    password: "Local-test-123",
  });
  assert.equal(registered.status, 200);
  let applied = await request(
    "/api/state",
    {
      type: "applyTeam",
      application: "Available for practice and ready to improve.",
    },
    registered.cookie,
  );
  const userId = applied.data.me.id;
  check("registration and open application", () =>
    assert.equal(applied.data.me.phaseId, "application"),
  );
  const phase = await request(
    "/api/state",
    {
      type: "phase",
      userId,
      phaseId: "phase1",
      rejected: false,
      reason: "Review complete",
    },
    admin.cookie,
  );
  assert.equal(phase.status, 200);
  const latest = await request("/api/state", null, registered.cookie);
  check("player sees current phase", () =>
    assert.equal(latest.data.me.phaseId, "phase1"),
  );
  const ratings = Array.from({ length: 18 }, () => ({
    score: 4,
    note: "Observed in practice",
  }));
  const evaluation = await request(
    "/api/state",
    { type: "evaluation", userId, revision: 0, ratings },
    admin.cookie,
  );
  assert.equal(evaluation.status, 200);
  const stale = await request(
    "/api/state",
    { type: "evaluation", userId, revision: 0, ratings },
    admin.cookie,
  );
  check("stale evaluation rejected", () => assert.equal(stale.status, 400));
  await request(
    "/api/state",
    {
      type: "message",
      userId,
      internal: true,
      text: "Private evaluation context",
    },
    admin.cookie,
  );
  await request(
    "/api/state",
    { type: "message", userId, internal: false, text: "Shared feedback" },
    admin.cookie,
  );
  const messages = await request("/api/state", null, registered.cookie);
  check("separate message visibility", () => {
    assert.equal(messages.data.messages.length, 1);
    assert.equal(messages.data.messages[0].text, "Shared feedback");
  });
  const created = await request(
    "/api/state",
    {
      type: "event",
      title: "Test practice",
      location: "Test venue",
      startsAt: "2099-09-19T08:00:00.000Z",
      endsAt: "2099-09-19T16:00:00.000Z",
      capacity: 1,
      description: "Integration test",
      cancelled: false,
    },
    admin.cookie,
  );
  assert.equal(created.status, 200);
  const event = created.data.events.find((e) => e.title === "Test practice");
  const a = await request(
    "/api/state",
    { type: "eventApply", eventId: event.id, withdraw: false },
    registered.cookie,
  );
  const b = await request(
    "/api/state",
    { type: "eventApply", eventId: event.id, withdraw: false },
    player.cookie,
  );
  const one = a.data.applications.find((a) => a.eventId === event.id),
    two = b.data.applications.find((a) => a.eventId === event.id);
  const approvals = await Promise.all(
    [one, two].map((a) =>
      request(
        "/api/state",
        { type: "eventDecision", id: a.id, status: "Approved" },
        admin.cookie,
      ),
    ),
  );
  check("concurrent event approvals cannot overbook", () =>
    assert.deepEqual(approvals.map((r) => r.status).sort(), [200, 400]),
  );
  const base = memberView.data.games[0];
  const saved = await request(
    "/api/state",
    {
      ...base,
      id: undefined,
      type: "game",
      layout: "B",
      outcome: "Invalid client outcome is ignored",
      notes: "HTTP integration reflection",
    },
    registered.cookie,
  );
  assert.equal(saved.status, 200);
  const game = saved.data.games[0];
  check("journal persists game and snapshot", () => {
    assert.equal(game.score, base.score);
    assert.equal(game.own.factionName, base.own.factionName);
    assert.equal(game.notes, "HTTP integration reflection");
    assert.equal(game.layout, "B");
    assert.equal(game.patchId, "2026-09-02");
    assert.equal(
      game.outcome,
      game.score === 10 ? "Draw" : game.score > 10 ? "Win" : "Loss",
    );
  });
  const goal = await request(
    "/api/state",
    {
      type: "goal",
      userId,
      title: "Review three games",
      description: "Show deployment improvements",
      due: "",
    },
    admin.cookie,
  );
  const goalId = goal.data.goals.find((g) => g.userId === userId).id;
  const progress = await request(
    "/api/state",
    {
      type: "goalProgress",
      id: goalId,
      status: "Ready for review",
      evidence: "Practice review complete",
      gameId: game.id,
    },
    registered.cookie,
  );
  check("goal evidence and review workflow", () =>
    assert.equal(progress.data.goals[0].status, "Ready for review"),
  );
  const logout = await request(
    "/api/session",
    null,
    registered.cookie,
    "DELETE",
  );
  assert.equal(logout.status, 200);
  const expired = await request("/api/state", null, registered.cookie);
  check("logout invalidates session", () => assert.equal(expired.status, 401));
  console.log(`${passed} HTTP integration checks passed.`);
} finally {
  child.kill();
  await new Promise((resolve) => child.once("close", resolve));
  await rm(scratch, { recursive: true, force: true });
}
