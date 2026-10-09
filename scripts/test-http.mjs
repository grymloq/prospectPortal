import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { testScrimHttp } from "./test-scrim-http.mjs";
import { testArmyLibraryHttp } from "./test-army-library-http.mjs";
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
  const feedbackSubmission = await request(
    "/api/state",
    {
      type: "feedback",
      category: "Bug",
      text: "HTTP feedback test",
      page: "Profile",
      attachments: [
        {
          name: "test.png",
          data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4b8AAAAASUVORK5CYII=",
        },
      ],
    },
    player.cookie,
  );
  const feedbackAdmin = await request("/api/state", null, admin.cookie);
  check("feedback submission is persisted and hidden from members", () => {
    assert.equal(feedbackSubmission.status, 200);
    assert.deepEqual(feedbackSubmission.data.feedback, []);
    assert.equal(feedbackAdmin.data.feedback[0].text, "HTTP feedback test");
    assert.equal(feedbackAdmin.data.feedback[0].attachments[0].data, undefined);
  });
  const imagePath = `/api/feedback/${feedbackAdmin.data.feedback[0].id}/0`;
  const adminImage = await fetch(origin + imagePath, {
    headers: { Cookie: admin.cookie },
  });
  const blockedImage = await fetch(origin + imagePath, {
    headers: { Cookie: player.cookie },
  });
  const anonymousImage = await fetch(origin + imagePath);
  check("feedback images require an admin session and are not cached", () => {
    assert.equal(adminImage.status, 200);
    assert.equal(adminImage.headers.get("content-type"), "image/png");
    assert.match(adminImage.headers.get("cache-control"), /no-store/);
    assert.equal(blockedImage.status, 403);
    assert.equal(anonymousImage.status, 401);
  });
  const feedbackId = feedbackAdmin.data.feedback[0].id;
  const forbiddenRead = await request(
    "/api/state",
    { type: "feedbackRead", id: feedbackId, read: true },
    player.cookie,
  );
  const readFeedback = await request(
    "/api/state",
    { type: "feedbackRead", id: feedbackId, read: true },
    admin.cookie,
  );
  const deletedFeedback = await request(
    "/api/state",
    { type: "feedbackDelete", id: feedbackId },
    admin.cookie,
  );
  const deletedImage = await fetch(origin + imagePath, {
    headers: { Cookie: admin.cookie },
  });
  const restoredFeedback = await request(
    "/api/state",
    { type: "feedbackRestore", id: feedbackId },
    admin.cookie,
  );
  const unreadFeedback = await request(
    "/api/state",
    { type: "feedbackRead", id: feedbackId, read: false },
    admin.cookie,
  );
  check(
    "only admins mark feedback read or unread, delete and restore it",
    () => {
      assert.equal(forbiddenRead.status, 400);
      assert.equal(readFeedback.status, 200);
      assert.ok(readFeedback.data.feedback[0].readAt);
      assert.ok(deletedFeedback.data.feedback[0].deletedAt);
      assert.equal(deletedImage.status, 404);
      assert.equal(restoredFeedback.data.feedback[0].deletedAt, undefined);
      assert.equal(unreadFeedback.data.feedback[0].readAt, undefined);
    },
  );
  const importBody = {
    url: "https://www.newrecruit.eu/app/list/OxJAH",
    patchId: "2026-09-02",
  };
  assert.equal((await request("/api/army-import", importBody)).status, 401);
  assert.equal(
    (
      await request("/api/army-import", importBody, player.cookie, "POST", {
        Origin: "https://other.example",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/army-import",
        { ...importBody, url: "https://example.com/app/list/OxJAH" },
        player.cookie,
      )
    ).status,
    400,
  );
  check(
    "army imports require sign-in, same origin, and a New Recruit shared URL",
    () => {},
  );
  const blockedDirectory = await request(
    "/api/admin/users",
    null,
    player.cookie,
  );
  const anonDirectory = await request("/api/admin/users");
  const blockedInvite = await request(
    "/api/admin/users",
    { name: "Unauthorized", email: "blocked@example.com" },
    player.cookie,
  );
  check("user directory and invitations require an administrator", () => {
    assert.equal(anonDirectory.status, 401);
    assert.equal(blockedDirectory.status, 403);
    assert.equal(blockedInvite.status, 403);
  });
  const anonPatchImport = await request("/api/patch-import", {});
  const memberPatchImport = await request(
    "/api/patch-import",
    {},
    player.cookie,
  );
  check("New Recruit rules imports require an administrator", () => {
    assert.equal(anonPatchImport.status, 401);
    assert.equal(memberPatchImport.status, 403);
  });
  const inviteResult = await request(
    "/api/admin/users",
    { name: "Invited QA", email: "invited@example.com" },
    admin.cookie,
  );
  assert.equal(inviteResult.status, 200);
  const token = new URL(inviteResult.data.inviteUrl).searchParams.get("token");
  assert(!JSON.stringify(inviteResult.data.view).includes(token));
  const accept = await request("/api/admin/users/accept", {
    token,
    password: "InvitationQA123!",
  });
  const reuse = await request("/api/admin/users/accept", {
    token,
    password: "InvitationQA123!",
  });
  const invited = await request("/api/session", {
    email: "invited@example.com",
    password: "InvitationQA123!",
  });
  const invitedView = await request("/api/state", null, invited.cookie);
  check(
    "one-time invitations create accounts without exposing tokens in state",
    () => {
      assert.equal(accept.status, 200);
      assert.equal(reuse.status, 400);
      assert.equal(invited.status, 200);
      assert.ok(invitedView.data.me.acceptedAt);
    },
  );
  const target = invitedView.data.me.id;
  assert.equal(
    (
      await request(
        "/api/state",
        { type: "userRole", userId: target, role: "admin" },
        admin.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request("/api/admin/users", null, invited.cookie)).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/api/state",
        { type: "userRole", userId: target, role: "member" },
        admin.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request("/api/admin/users", null, invited.cookie)).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/state",
        { type: "removeUser", userId: target },
        admin.cookie,
      )
    ).status,
    200,
  );
  check(
    "role changes apply to current sessions and removal revokes access",
    () => {},
  );
  const removedView = await request("/api/state", null, invited.cookie);
  const removedWrite = await request(
    "/api/state",
    { type: "applyTeam", application: "removed" },
    invited.cookie,
  );
  check("removed sessions cannot read or mutate the workspace", () => {
    assert.equal(removedView.status, 401);
    assert.equal(removedWrite.status, 401);
  });

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
  const blockedDefault = await request(
    "/api/state",
    { type: "defaultPatch", patchId: "2026-10-01" },
    player.cookie,
  );
  const changedDefault = await request(
    "/api/state",
    { type: "defaultPatch", patchId: "2026-09-02" },
    admin.cookie,
  );
  const defaultForPlayer = await request("/api/state", null, player.cookie);
  check(
    "administrators choose the shared new-game default without changing history",
    () => {
      assert.equal(blockedDefault.status, 400);
      assert.equal(changedDefault.status, 200);
      assert.equal(defaultForPlayer.data.defaultPatchId, "2026-09-02");
      assert.deepEqual(
        defaultForPlayer.data.games,
        patchesForPlayer.data.games,
      );
    },
  );
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
  check(
    "registration waits for membership confirmation without issuing a session",
    () => {
      assert.equal(registered.cookie, undefined);
      assert.match(registered.data.message, /awaiting confirmation/i);
    },
  );
  const waitingLogin = await request("/api/session", {
    email: "qa@example.test",
    password: "Local-test-123",
  });
  assert.equal(waitingLogin.status, 400);
  const directory = await request("/api/admin/users", null, admin.cookie);
  const waitingUser = directory.data.view.users.find(
    (u) => u.email === "qa@example.test",
  );
  assert.equal(waitingUser.confirmedMember, false);
  const selfConfirm = await request(
    "/api/state",
    { type: "userConfirmation", userId: waitingUser.id, confirmed: true },
    player.cookie,
  );
  assert.equal(selfConfirm.status, 400);
  const confirmed = await request(
    "/api/state",
    { type: "userConfirmation", userId: waitingUser.id, confirmed: true },
    admin.cookie,
  );
  assert.equal(confirmed.status, 200);
  const confirmedLogin = await request("/api/session", {
    email: "qa@example.test",
    password: "Local-test-123",
  });
  assert.equal(confirmedLogin.status, 200);
  registered.cookie = confirmedLogin.cookie;
  const revoked = await request(
    "/api/state",
    { type: "userConfirmation", userId: waitingUser.id, confirmed: false },
    admin.cookie,
  );
  assert.equal(revoked.status, 200);
  assert.equal(
    (await request("/api/state", null, registered.cookie)).status,
    401,
  );
  assert.equal(
    (await request("/api/army-import", importBody, registered.cookie)).status,
    401,
  );
  assert.equal(
    (await request("/api/admin/users", null, registered.cookie)).status,
    401,
  );
  await request(
    "/api/state",
    { type: "userConfirmation", userId: waitingUser.id, confirmed: true },
    admin.cookie,
  );
  check(
    "only admins confirm members and revocation blocks existing sessions",
    () => {},
  );
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
  const armySaved = await request(
    "/api/state",
    {
      type: "saveArmy",
      patchId: game.patchId,
      army: { ...game.own, listName: "HTTP saved list" },
    },
    registered.cookie,
  );
  assert.equal(armySaved.status, 200);
  const list = armySaved.data.savedArmies[0];
  const ownerReload = await request("/api/state", null, registered.cookie);
  const privateView = await request("/api/state", null, player.cookie);
  check("saved armies persist privately and reject other owners", () => {
    assert.equal(ownerReload.data.savedArmies[0].id, list.id);
    assert.equal(privateView.data.savedArmies.length, 0);
  });
  const forbiddenArmy = await request(
    "/api/state",
    { type: "shareArmy", id: list.id, shared: true },
    player.cookie,
  );
  assert.equal(forbiddenArmy.status, 400);
  await request(
    "/api/state",
    { type: "shareArmy", id: list.id, shared: true },
    registered.cookie,
  );
  const sharedView = await request("/api/state", null, player.cookie);
  check("shared saved armies become visible and can be withdrawn", () =>
    assert.equal(sharedView.data.savedArmies[0].id, list.id),
  );
  await request(
    "/api/state",
    { type: "shareArmy", id: list.id, shared: false },
    registered.cookie,
  );
  assert.equal(
    (await request("/api/state", null, player.cookie)).data.savedArmies.length,
    0,
  );
  const armyText = `HTTP pasted army (75 Points)\n${game.own.factionName}\n${game.own.detachmentNames.join(", ")}\n${game.own.dispositionName}\n\nCHARACTERS\nFixture leader (75 Points)\n  • 1x Fixture weapon\n`;
  const textCommand = {
    type: "saveArmy",
    patchId: game.patchId,
    listText: armyText,
  };
  const textSaved = await request("/api/state", textCommand, registered.cookie);
  assert.equal(textSaved.status, 200, JSON.stringify(textSaved.data));
  const pastedArmy = textSaved.data.savedArmies.find(
    (a) => a.army.listText === armyText,
  );
  const textReload = await request("/api/state", null, registered.cookie);
  check(
    "My armies saves pasted text with a summary privately and rejects conflicting configuration",
    () => {
      assert.equal(pastedArmy.shared, false);
      assert.equal(pastedArmy.army.summary.units[0].name, "Fixture leader");
      assert.ok(pastedArmy.army.summary.archetypeId);
      assert.equal(
        textReload.data.savedArmies.find((a) => a.id === pastedArmy.id).army
          .listText,
        armyText,
      );
    },
  );
  assert.equal(
    (await request("/api/state", null, player.cookie)).data.savedArmies.length,
    0,
  );
  assert.equal(
    (
      await request(
        "/api/state",
        {
          ...textCommand,
          id: pastedArmy.id,
          expectedRevision: pastedArmy.listRevision,
        },
        player.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/state",
        { ...textCommand, army: game.own },
        registered.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/state",
        {
          ...textCommand,
          textConfiguration: { disposition: game.own.disposition },
        },
        registered.cookie,
      )
    ).status,
    400,
  );
  const incompleteText = `HTTP missing choices (75 Points)\n${game.own.factionName}\n\nCHARACTERS\nFixture leader (75 Points)\n  • 1x Fixture weapon\n`;
  const missingCommand = { ...textCommand, listText: incompleteText };
  const missingReview = await request(
    "/api/army-import",
    { patchId: game.patchId, listText: incompleteText },
    registered.cookie,
  );
  assert.equal(missingReview.status, 200, JSON.stringify(missingReview.data));
  assert.deepEqual(missingReview.data.review.missing, [
    "detachments",
    "disposition",
  ]);
  assert.equal(
    (await request("/api/state", missingCommand, registered.cookie)).status,
    400,
  );
  const completedText = await request(
    "/api/state",
    {
      ...missingCommand,
      textConfiguration: {
        detachments: game.own.detachments,
        disposition: game.own.disposition,
      },
    },
    registered.cookie,
  );
  assert.equal(completedText.status, 200, JSON.stringify(completedText.data));
  check(
    "pasted armies require only absent detachment and disposition choices",
    () => {
      const army = completedText.data.savedArmies.find(
        (a) => a.army.listText === incompleteText,
      ).army;
      assert.deepEqual(army.detachments, game.own.detachments);
      assert.equal(army.disposition, game.own.disposition);
    },
  );
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
  const notificationAnon = await request("/api/notifications");
  check("notifications require authentication", () =>
    assert.equal(notificationAnon.status, 401),
  );
  const dispatchAnon = await request("/api/notifications/dispatch");
  check("notification worker rejects unauthenticated requests", () =>
    assert.equal(dispatchAnon.status, 401),
  );
  const playerNotifications = await request(
    "/api/notifications",
    undefined,
    player.cookie,
  );
  check(
    "notification inbox excludes admin records and delivery secrets",
    () => {
      assert.equal(playerNotifications.status, 200);
      assert.ok(
        playerNotifications.data.notifications.every(
          (n) => n.userId === "p1" && !n.adminOnly && !n.deliveries,
        ),
      );
    },
  );
  const readNotifications = await request(
    "/api/state",
    { type: "notificationRead" },
    player.cookie,
  );
  check("mark all notifications read persists", () => {
    assert.equal(readNotifications.status, 200);
    assert.ok(readNotifications.data.notifications.every((n) => n.readAt));
  });
  await testArmyLibraryHttp({ request, check, admin, player });
  await testScrimHttp({ request, check, admin, player });
  const deniedPreview = await request(
    "/api/admin/view-as",
    { userId: "p1", role: "admin" },
    player.cookie,
  );
  const anonymousPreview = await request("/api/admin/view-as", {
    userId: "p1",
    role: "actual",
  });
  check("access preview requires an authenticated administrator", () => {
    assert.equal(deniedPreview.status, 403);
    assert.equal(anonymousPreview.status, 401);
  });
  const preview = await request(
    "/api/admin/view-as",
    { userId: "p1", role: "actual" },
    admin.cookie,
  );
  assert.equal(preview.status, 200);
  const previewSession = `${admin.cookie}; ${preview.cookie}`;
  const previewRead = await request("/api/state", null, previewSession);
  check(
    "user preview applies server privacy filtering and retains the actual admin session",
    () => {
      assert.equal(previewRead.status, 200);
      assert.equal(previewRead.data.me.id, "p1");
      assert.equal(previewRead.data.me.role, "member");
      assert.deepEqual(
        previewRead.data.users.map((u) => u.id),
        ["p1"],
      );
      assert.deepEqual(previewRead.data.feedback, []);
      assert.ok(previewRead.data.games.every((g) => g.userId === "p1"));
      assert.ok(previewRead.data.accessPreview.active);
      assert.ok(!JSON.stringify(previewRead.data).includes('"password"'));
    },
  );
  for (const [route, method, body] of [
    ["/api/state", "POST", { type: "profile", name: "Preview write" }],
    ["/api/admin/users", "DELETE", { userId: "p1" }],
    ["/api/password", "POST", {}],
    ["/api/army-import", "POST", {}],
    ["/api/patch-import", "POST", {}],
  ]) {
    const result = await request(route, body, previewSession, method);
    assert.equal(result.status, 403);
    assert.match(result.data.error, /read-only/);
  }
  check(
    "preview blocks writes across state, account, password and import routes",
    () => {},
  );
  const forgedPreviewCookie = `${player.cookie}; team_access_preview=${encodeURIComponent(JSON.stringify({ actorId: "p1", userId: "admin", role: "admin" }))}`;
  assert.equal(
    (await request("/api/state", null, forgedPreviewCookie)).status,
    403,
  );
  const wrongOwner = `${admin.cookie}; team_access_preview=${encodeURIComponent(JSON.stringify({ actorId: "p1", userId: "admin", role: "admin" }))}`;
  assert.equal((await request("/api/state", null, wrongOwner)).status, 403);
  const rolePreview = await request(
    "/api/admin/view-as",
    { userId: "admin", role: "member" },
    previewSession,
  );
  assert.equal(rolePreview.status, 200);
  assert.equal(rolePreview.data.me.role, "member");
  assert.deepEqual(
    rolePreview.data.users.map((u) => u.id),
    ["admin"],
  );
  const restored = await request(
    "/api/admin/view-as",
    null,
    `${admin.cookie}; ${rolePreview.cookie}`,
    "DELETE",
  );
  check(
    "forged previews are rejected, role simulation works and exit restores admin access",
    () => {
      assert.equal(restored.status, 200);
      assert.equal(restored.data.me.id, "admin");
      assert.equal(restored.data.me.role, "admin");
      assert.equal(restored.data.accessPreview.active, false);
      assert.ok(restored.data.users.length > 1);
    },
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
  const forbiddenDelete = await request(
    "/api/admin/users",
    { userId },
    player.cookie,
    "DELETE",
  );
  assert.equal(forbiddenDelete.status, 403);
  const selfDelete = await request(
    "/api/admin/users",
    { userId: (await request("/api/state", null, admin.cookie)).data.me.id },
    admin.cookie,
    "DELETE",
  );
  assert.equal(selfDelete.status, 400);
  const deleted = await request(
    "/api/admin/users",
    { userId },
    admin.cookie,
    "DELETE",
  );
  assert.equal(deleted.status, 200);
  const deletedUser = deleted.data.view.users.find((u) => u.id === userId);
  assert.ok(deletedUser.accountDeletedAt);
  assert.ok(deletedUser.removedAt);
  assert.ok(deleted.data.view.games.some((g) => g.id === game.id));
  const retryDelete = await request(
    "/api/admin/users",
    { userId },
    admin.cookie,
    "DELETE",
  );
  assert.equal(retryDelete.status, 200);
  check(
    "account deletion is admin-only, protects self, retains journal history and retries safely",
    () =>
      assert.equal(
        retryDelete.data.view.users.find((u) => u.id === userId)
          .accountDeletedAt,
        deletedUser.accountDeletedAt,
      ),
  );
  console.log(`${passed} HTTP integration checks passed.`);
} finally {
  child.kill();
  await new Promise((resolve) => child.once("close", resolve));
  await rm(scratch, { recursive: true, force: true });
}
