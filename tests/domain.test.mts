import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
mkdirSync(path.join(process.cwd(), ".local"), { recursive: true });
const scratch = mkdtempSync(path.join(process.cwd(), ".local", "qa-"));
process.env.TEAM_DB_PATH = path.join(scratch, "test.sqlite");
const { readState, db, transaction } = await import("../src/server/store");
const { execute, viewState } = await import("../src/server/service");
const { armySnapshot, catalogue, dispositionsFor } =
  await import("../src/lib/catalogue");
const baseline = readState();
after(() => {
  db.close();
  rmSync(scratch, { recursive: true, force: true });
});
test("member response excludes other profiles, evaluations, internal messages and applications", () => {
  const s = structuredClone(baseline),
    u = s.users.find((u) => u.id === "p1")!,
    view = viewState(s, u);
  assert.equal(view.users.length, 1);
  assert.equal(view.users[0].password, undefined);
  assert.equal(view.evaluations.length, 0);
  assert.equal(view.audit.length, 0);
  assert.ok(view.messages.every((m) => m.userId === u.id && !m.internal));
  assert.ok(view.games.every((g) => g.userId === u.id));
  assert.ok(view.goals.every((g) => g.userId === u.id));
  assert.ok(view.applications.every((a) => a.userId === u.id));
  assert.ok(!JSON.stringify(view).includes("Internal sample note"));
});
test("members cannot forge access to admin actions or other players", () => {
  const s = structuredClone(baseline),
    u = s.users.find((u) => u.id === "p1")!;
  for (const command of [
    {
      type: "phase",
      userId: "p2",
      phaseId: "selected",
      rejected: false,
      reason: "forged",
    },
    { type: "message", userId: "p2", internal: false, text: "forged" },
    { type: "message", userId: "p1", internal: true, text: "forged" },
    {
      type: "evaluation",
      userId: "p1",
      revision: 1,
      ratings: Array.from({ length: 18 }, () => ({ score: 5, note: "" })),
    },
  ])
    assert.throws(() => execute(s, u, command));
});
test("eight selected places are enforced; rejection releases a place", () => {
  const s = structuredClone(baseline),
    admin = s.users[0];
  for (const u of s.users.slice(1)) u.phaseId = "phase1";
  for (const u of s.users.slice(1, 9)) {
    u.phaseId = "selected";
    u.rejected = false;
  }
  assert.throws(
    () =>
      execute(s, admin, {
        type: "phase",
        userId: "p9",
        phaseId: "selected",
        rejected: false,
        reason: "test",
      }),
    /eight/,
  );
  execute(s, admin, {
    type: "phase",
    userId: "p1",
    phaseId: "selected",
    rejected: true,
    reason: "test",
  });
  execute(s, admin, {
    type: "phase",
    userId: "p9",
    phaseId: "selected",
    rejected: false,
    reason: "test",
  });
  assert.equal(s.users.find((u) => u.id === "p9")!.phaseId, "selected");
});
test("shared evaluation rejects stale writes and invalid scores", () => {
  const s = structuredClone(baseline),
    admin = s.users[0],
    ratings = Array.from({ length: 18 }, () => ({
      score: 4,
      note: "Observed at practice",
    }));
  execute(s, admin, { type: "evaluation", userId: "p1", revision: 1, ratings });
  assert.deepEqual(
    s.evaluationHistory?.[0],
    baseline.evaluations.find((e) => e.userId === "p1"),
  );
  assert.throws(
    () =>
      execute(s, admin, {
        type: "evaluation",
        userId: "p1",
        revision: 1,
        ratings,
      }),
    /Another admin/,
  );
  assert.throws(() =>
    execute(s, admin, {
      type: "evaluation",
      userId: "p1",
      revision: 2,
      ratings: ratings.map((r) => ({ ...r, score: 6 })),
    }),
  );
});
test("event capacity, duplicate applications, withdrawal and reapplication", () => {
  const s = structuredClone(baseline),
    admin = s.users[0],
    player = s.users.find((u) => u.id === "p1")!;
  s.events[0].capacity = 1;
  s.events[0].endsAt = "2099-09-19T16:00:00.000Z";
  assert.throws(
    () =>
      execute(s, admin, {
        type: "eventDecision",
        id: "a2",
        status: "Approved",
      }),
    /full/,
  );
  assert.throws(
    () =>
      execute(s, player, {
        type: "eventApply",
        eventId: "event1",
        withdraw: false,
      }),
    /already/,
  );
  execute(s, player, { type: "eventApply", eventId: "event1", withdraw: true });
  execute(s, admin, { type: "eventDecision", id: "a2", status: "Approved" });
  execute(s, player, {
    type: "eventApply",
    eventId: "event1",
    withdraw: false,
  });
  assert.equal(
    s.applications.filter((a) => a.userId === "p1" && a.eventId === "event1")
      .length,
    1,
  );
  assert.equal(s.applications.find((a) => a.id === "a1")!.status, "Pending");
});
test("goal evidence must belong to the player and completion needs admin", () => {
  const s = structuredClone(baseline),
    u = s.users.find((u) => u.id === "p2")!,
    goal = s.goals.find((g) => g.userId === u.id)!;
  assert.throws(
    () =>
      execute(s, u, {
        type: "goalProgress",
        id: goal.id,
        status: "Completed",
        evidence: "Done",
        gameId: "",
      }),
    /admin/,
  );
  assert.throws(
    () =>
      execute(s, u, {
        type: "goalProgress",
        id: goal.id,
        status: "Ready for review",
        evidence: "Done",
        gameId: s.games.find((g) => g.userId === "p1")!.id,
      }),
    /this player/,
  );
  execute(s, u, {
    type: "goalProgress",
    id: goal.id,
    status: "Ready for review",
    evidence: "Reviewed three games",
    gameId: s.games.find((g) => g.userId === u.id)!.id,
  });
  assert.equal(goal.status, "Ready for review");
});
test("catalogue inheritance, disposition union, three-detachment limit and immutable snapshots", () => {
  const orks = catalogue.factions.find((f) => f.name === "Orks")!,
    fists = catalogue.factions.find((f) => f.name === "Imperial Fists")!,
    templars = catalogue.factions.find((f) => f.name === "Black Templars")!;
  assert.equal(orks.detachments.length, 15);
  assert.ok(fists.detachments.some((d) => d.name === "Gladius Task Force"));
  assert.ok(!templars.detachments.some((d) => d.name === "Librarius Conclave"));
  const selected = orks.detachments.slice(0, 3).map((d) => d.id),
    options = dispositionsFor(orks.id, selected);
  assert.deepEqual(
    new Set(options.map((d) => d.id)),
    new Set(orks.detachments.slice(0, 3).flatMap((d) => d.dispositions)),
  );
  const a = armySnapshot({
    faction: orks.id,
    detachments: selected,
    disposition: options[0].id,
    listUrl: "",
  });
  assert.equal(a.detachmentNames.length, 3);
  assert.equal(a.revision, orks.revision);
  assert.throws(() =>
    armySnapshot({
      ...a,
      detachments: orks.detachments.slice(0, 4).map((d) => d.id),
    }),
  );
  assert.throws(() => armySnapshot({ ...a, disposition: "invalid" }));
});
test("game boundaries validate score, URL, ownership and date", () => {
  const s = structuredClone(baseline),
    u = s.users.find((u) => u.id === "p1")!,
    g = s.games.find((g) => g.userId === u.id)!;
  for (const patch of [
    { score: 21 },
    { score: -1 },
    { date: "2026-02-31" },
    { own: { ...g.own, listUrl: "javascript:alert(1)" } },
    { id: s.games.find((g) => g.userId === "p2")!.id },
  ])
    assert.throws(() => execute(s, u, { ...g, type: "game", ...patch }));
  execute(s, u, { ...g, type: "game", score: 20, notes: "Updated reflection" });
  assert.equal(s.games.find((v) => v.id === g.id)!.score, 20);
});
test("phase configuration protects occupied stages and stable roles", () => {
  const s = structuredClone(baseline),
    admin = s.users[0];
  assert.throws(
    () =>
      execute(s, admin, {
        type: "phases",
        phases: s.phases.filter((p) => p.id !== "phase1"),
      }),
    /Move players/,
  );
  assert.throws(
    () =>
      execute(s, admin, { type: "phases", phases: [...s.phases].reverse() }),
    /first/,
  );
});
test("failed transaction rolls back persisted state", () => {
  const previous = readState().users[0].name;
  assert.throws(() =>
    transaction((s) => {
      s.users[0].name = "Uncommitted";
      throw new Error("rollback");
    }),
  );
  assert.equal(readState().users[0].name, previous);
});
