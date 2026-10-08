import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
mkdirSync(path.join(process.cwd(), ".local"), { recursive: true });
const scratch = mkdtempSync(path.join(process.cwd(), ".local", "qa-"));
process.env.TEAM_DB_PATH = path.join(scratch, "test.sqlite");
const { readState, db, transaction } = await import("../src/server/store");
const { execute, viewState } = await import("../src/server/service");
const { armySnapshot, catalogue, dispositionsFor, defaultDisposition } =
  await import("../src/lib/catalogue");
const baseline = readState();

test("admins manage feedback read status and reversible deletion", async () => {
  const s = structuredClone(baseline);
  const member = s.users.find((u) => u.role === "member")!;
  const admin = s.users.find((u) => u.role === "admin")!;
  execute(s, member, {
    type: "feedback",
    category: "Bug",
    text: "A bug",
    page: "Profile",
    attachments: [],
  });
  const f = s.feedback![0];
  assert.equal(f.readAt, undefined);
  for (const command of [
    { type: "feedbackRead", id: f.id, read: true },
    { type: "feedbackDelete", id: f.id },
    { type: "feedbackRestore", id: f.id },
  ])
    assert.throws(() => execute(s, member, command), /Admin/);
  execute(s, admin, { type: "feedbackRead", id: f.id, read: true });
  assert.ok(f.readAt);
  assert.equal(f.readBy, admin.id);
  execute(s, admin, { type: "feedbackRead", id: f.id, read: false });
  assert.equal(f.readAt, undefined);
  assert.equal(f.readBy, undefined);
  execute(s, admin, { type: "feedbackDelete", id: f.id });
  assert.ok(f.deletedAt);
  assert.throws(
    () => execute(s, admin, { type: "feedbackRead", id: f.id, read: true }),
    /Restore/,
  );
  execute(s, admin, { type: "feedbackRestore", id: f.id });
  assert.equal(f.deletedAt, undefined);
  assert.equal(f.text, "A bug");
  assert.throws(
    () => execute(s, admin, { type: "feedbackDelete", id: "missing" }),
    /not found/,
  );
});

test("feedback preserves sender identity and is visible only to admins", async () => {
  const s = structuredClone(baseline);
  const member = s.users.find((u) => u.role === "member")!;
  const admin = s.users.find((u) => u.role === "admin")!;
  const { feedbackAttachment } = await import("../src/server/feedback");
  const data =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4b8AAAAASUVORK5CYII=";
  execute(s, member, {
    type: "feedback",
    category: "Bug",
    text: "The matrix needs a fix",
    page: "Matchup matrix",
    userId: admin.id,
    authorName: "Forged",
    attachments: [{ name: "screen.png", data }],
  });
  const feedback = s.feedback![0];
  assert.equal(feedback.userId, member.id);
  assert.equal(feedback.authorName, member.name);
  assert.equal(feedback.authorEmail, member.email);
  assert.deepEqual(viewState(s, member).feedback, []);
  const shown = viewState(s, admin).feedback![0];
  assert.equal(shown.text, "The matrix needs a fix");
  assert.deepEqual(shown.attachments, [{ name: "screen.png" }]);
  assert.throws(() => feedbackAttachment(s, member, feedback.id, 0), /Admin/);
  assert.equal(
    feedbackAttachment(s, admin, feedback.id, 0).contentType,
    "image/png",
  );
  assert.throws(
    () => feedbackAttachment(s, admin, feedback.id, 9),
    /not found/,
  );
  admin.confirmedMember = false;
  assert.throws(() => feedbackAttachment(s, admin, feedback.id, 0));
});

test("feedback rejects empty messages, unsupported labels and invalid attachments", () => {
  const s = structuredClone(baseline);
  const member = s.users.find((u) => u.role === "member")!;
  const c = {
    type: "feedback",
    category: "Suggestion",
    text: "",
    page: "Profile",
    attachments: [],
  };
  assert.throws(() => execute(s, member, c), /Enter feedback/);
  assert.throws(() =>
    execute(s, member, { ...c, text: "hi", category: "Other" }),
  );
  for (const data of [
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,YmFk",
    `data:image/jpeg;base64,${"A".repeat(700001)}`,
  ]) {
    assert.throws(() =>
      execute(s, member, { ...c, attachments: [{ name: "image", data }] }),
    );
  }
  assert.equal(s.feedback?.length || 0, 0);
  execute(s, member, {
    ...c,
    category: "Request",
    text: "Please add this feature.",
  });
  assert.equal(s.feedback![0].category, "Request");
});
test("online calendar events accept a join link without a venue and keep admin authorization", () => {
  const s = structuredClone(baseline);
  const admin = s.users.find((u) => u.role === "admin")!;
  const member = s.users.find((u) => u.role === "member")!;
  const command = {
    type: "event",
    title: "Internal online scrim",
    location: "",
    online: true,
    onlineUrl: "https://discord.gg/example",
    startsAt: "2026-11-01T17:00:00Z",
    endsAt: "2026-11-01T20:00:00Z",
    capacity: 8,
    description: "Team practice",
    cancelled: false,
  };
  assert.throws(() => execute(s, member, command), /Admin/);
  execute(s, admin, command);
  const event = s.events.at(-1)!;
  assert.equal(event.online, true);
  assert.equal(event.onlineUrl, command.onlineUrl);
  assert.throws(() =>
    execute(s, admin, { ...command, onlineUrl: "javascript:alert(1)" }),
  );
  assert.throws(
    () => execute(s, admin, { ...command, online: false }),
    /location/,
  );
  execute(s, admin, { ...command, id: event.id, onlineUrl: "" });
  assert.equal(s.events.at(-1)!.online, true);
});
const { armyFromNewRecruit, newRecruitListUrl } =
  await import("../src/server/newrecruit-army");
test("New Recruit list imports map configurations and reject incompatible sources", () => {
  const faction = catalogue.factions.find((f) => f.name === "Orks")!;
  const detachment = faction.detachments.find((d) => d.name === "Dread Mob")!;
  const option = (
    name: string,
    option_id: string,
    options: unknown[] = [],
  ) => ({ name, option_id, options });
  const input = {
    id_system: catalogue.systemId,
    id_book: faction.id,
    name: "Practice",
    army: {
      name: "Practice",
      options: [
        option("Detachment", "group", [option(detachment.name, detachment.id)]),
        option("Force Disposition", "group2", [
          option("Purge the Foe", "7da4-f0a6-65ec-da48"),
        ]),
      ],
    },
  };
  const url = "https://www.newrecruit.eu/app/list/OxJAH";
  const army = armyFromNewRecruit(input, url, catalogue);
  assert.equal(army.listName, "Practice");
  assert.equal(
    armyFromNewRecruit(
      { ...input, army: { ...input.army, name: " Unnamed List " } },
      url,
      catalogue,
    ).listName,
    "Orks · Dread Mob · Purge the Foe",
  );
  assert.deepEqual(army.detachmentNames, ["Dread Mob"]);
  assert.equal(army.dispositionName, "Purge the Foe");
  assert.equal(army.listUrl, url);
  const warmindRules = structuredClone(catalogue);
  warmindRules.factions
    .find((f) => f.id === faction.id)!
    .detachments.find((d) => d.id === detachment.id)!.id = "warmind-detachment";
  assert.deepEqual(armyFromNewRecruit(input, url, warmindRules).detachments, [
    "warmind-detachment",
  ]);
  assert.throws(
    () => armyFromNewRecruit({ ...input, id_system: "other" }, url, catalogue),
    /different game system/,
  );
  assert.throws(
    () =>
      armyFromNewRecruit(
        {
          ...input,
          army: {
            options: [
              option("Detachment", "g", [option("Missing", "unknown")]),
            ],
          },
        },
        url,
        catalogue,
      ),
    /unavailable/,
  );
  assert.equal(newRecruitListUrl(url).id, "OxJAH");
  for (const bad of [
    "https://example.com/app/list/OxJAH",
    "http://www.newrecruit.eu/app/list/OxJAH",
    "https://www.newrecruit.eu/other",
    "https://user:pass@www.newrecruit.eu/app/list/OxJAH",
  ])
    assert.throws(() => newRecruitListUrl(bad));
});
test("disposition defaults select the only option or prefer a non-Disruption choice", () => {
  const disruption = { id: "d", name: "Disruption" };
  const recon = { id: "r", name: "Reconnaissance" };
  assert.equal(defaultDisposition([]), "");
  assert.equal(defaultDisposition([disruption]), "d");
  assert.equal(defaultDisposition([recon]), "r");
  assert.equal(defaultDisposition([disruption, recon]), "r");
  assert.equal(defaultDisposition([recon, disruption]), "r");
});
const { patchFromWarmind } = await import("../src/server/warmind-patch");
test("Warmind import uses the MFM release metadata, not the app version", () => {
  const html =
    '<span class="ver-line">v1.0.6 &#183; MFM v1.5 &#183; 2 Oct 2026</span>';
  const patch = patchFromWarmind(html);
  assert.equal(patch.date, "2026-10-02");
  assert.equal(patch.name, "Warmind · MFM v1.5");
  assert.equal(patch.source!.provider, "warmind");
  assert.equal(patchFromWarmind(html.replace("v1.0.6", "v1.0.7")).id, patch.id);
  assert.notEqual(
    patchFromWarmind(html.replace("MFM v1.5", "MFM v1.6")).id,
    patch.id,
  );
  assert.throws(() => patchFromWarmind("<span>App v1.0.6</span>"));
  assert.throws(() => patchFromWarmind(html.replace("2 Oct", "32 Oct")));
});
test("team ruleset defaults and removal are admin-only and preserve history", () => {
  const s = structuredClone(baseline);
  const admin = s.users.find((u) => u.role === "admin")!;
  const member = s.users.find((u) => u.role === "member")!;
  const patch = patchFromWarmind(
    '<span class="ver-line">v1.0.6 · MFM v1.5 · 2 Oct 2026</span>',
  );
  s.patches!.push(patch);
  const games = structuredClone(s.games);
  const command = { type: "defaultPatch", patchId: patch.id };
  assert.throws(() => execute(s, member, command), /Admin/);
  execute(s, admin, command);
  assert.equal(viewState(s, member).defaultPatchId, patch.id);
  assert.throws(
    () => execute(s, admin, { type: "removePatchImport", patchId: patch.id }),
    /another default/,
  );
  execute(s, admin, { type: "defaultPatch", patchId: s.patches![0].id });
  assert.throws(
    () => execute(s, member, { type: "removePatchImport", patchId: patch.id }),
    /Admin/,
  );
  execute(s, admin, { type: "removePatchImport", patchId: patch.id });
  assert.ok(patch.removedAt);
  assert.throws(() => execute(s, admin, command), /available/);
  assert.deepEqual(s.games, games);
  execute(s, admin, { type: "restorePatchImport", patchId: patch.id });
  assert.equal(patch.removedAt, undefined);
  assert.deepEqual(s.games, games);
  execute(s, admin, command);
  execute(s, admin, { type: "removePatchImport", patchId: s.patches![0].id });
  assert.ok(s.patches![0].removedAt);
  assert.deepEqual(s.games, games);
});
test("removed imports cannot be used for new games but historical games stay editable", () => {
  const s = structuredClone(baseline);
  const historical = s.games[0];
  const actor = s.users.find((u) => u.id === historical.userId)!;
  const patch = s.patches!.find((p) => p.id === historical.patchId)!;
  patch.removedAt = new Date().toISOString();
  const command = { ...historical, type: "game", layout: "A" };
  assert.throws(
    () => execute(s, actor, { ...command, id: undefined }),
    /removed/,
  );
  execute(s, actor, command);
  assert.equal(s.games.find((g) => g.id === historical.id)!.patchId, patch.id);
});
test("patch renaming is admin-only and preserves references and source metadata", () => {
  const s = structuredClone(baseline);
  const admin = s.users.find((u) => u.role === "admin")!;
  const member = s.users.find((u) => u.role === "member")!;
  const patch = s.patches![0];
  const original = structuredClone(patch);
  const games = structuredClone(s.games);
  const command = {
    type: "renamePatch",
    patchId: patch.id,
    name: "September rules",
  };
  assert.throws(() => execute(s, member, command), /Admin/);
  assert.throws(() => execute(s, admin, { ...command, name: "   " }));
  assert.throws(
    () => execute(s, admin, { ...command, patchId: "missing" }),
    /Patch not found/,
  );
  execute(s, admin, command);
  assert.deepEqual(patch, { ...original, name: command.name });
  assert.deepEqual(s.games, games);
  assert.match(s.audit[0].text, /Renamed patch/);
});
const { patchFromLibrary, importNewRecruitPatch } =
  await import("../src/server/newrecruit-patch");
const rulesLibrary = [
  {
    id: 827374861,
    short: "wh40k-11e",
    books: [
      {
        id: 1,
        name: "Core",
        bsid: "core",
        nrversion: 3,
        sha: "a".repeat(40),
        last_updated: "2026-10-07T22:00:00.000Z",
      },
      {
        id: 2,
        name: "Orks",
        bsid: "orks",
        nrversion: 7,
        sha: "b".repeat(40),
        last_updated: "2026-10-06T22:00:00.000Z",
      },
    ],
  },
];
test("New Recruit import is admin-only, idempotent, and preserves historical games", () => {
  const s = structuredClone(baseline);
  const patch = patchFromLibrary(rulesLibrary);
  const games = structuredClone(s.games);
  const member = s.users.find((u) => u.role === "member")!;
  const admin = s.users.find((u) => u.role === "admin")!;
  assert.equal(patch.date, "2026-10-07");
  assert.equal(patch.source!.books.length, 2);
  assert.throws(() => importNewRecruitPatch(s, member, patch), /Admin/);
  assert.equal(importNewRecruitPatch(s, admin, patch), true);
  assert.equal(importNewRecruitPatch(s, admin, patch), false);
  const imported = s.patches!.find((p) => p.id === patch.id)!;
  imported.name = "Team rules";
  imported.removedAt = new Date().toISOString();
  assert.equal(importNewRecruitPatch(s, admin, patch), true);
  assert.equal(imported.removedAt, undefined);
  assert.equal(imported.name, "Team rules");
  assert.equal(s.patches!.filter((p) => p.id === patch.id).length, 1);
  assert.deepEqual(s.games, games);
  const reversed = structuredClone(rulesLibrary);
  reversed[0].books.reverse();
  assert.equal(patchFromLibrary(reversed).id, patch.id);
  reversed[0].books[0].sha = "c".repeat(40);
  assert.notEqual(patchFromLibrary(reversed).id, patch.id);
});
test("New Recruit rejects missing or malformed catalogue metadata", () => {
  assert.throws(() => patchFromLibrary([]));
  const malformed = structuredClone(rulesLibrary);
  malformed[0].books[0].last_updated = "not-a-date";
  assert.throws(() => patchFromLibrary(malformed));
  malformed[0].books = [];
  assert.throws(() => patchFromLibrary(malformed));
});
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
test("preferred armies support multiple selections and validate faction IDs", () => {
  const s = structuredClone(baseline);
  const member = s.users.find((u) => u.role === "member")!;
  const ids = catalogue.factions.slice(0, 2).map((f) => f.id);
  const command = {
    type: "profile",
    name: member.name,
    city: member.city,
    bio: member.bio,
    faction: ids[0],
    preferredFactions: [...ids, ids[0]],
  };
  execute(s, member, command);
  assert.deepEqual(viewState(s, member).me.preferredFactions, ids);
  assert.throws(
    () => execute(s, member, { ...command, preferredFactions: ["unknown"] }),
    /Unknown faction/,
  );
  assert.deepEqual(member.preferredFactions, ids);
  execute(s, member, { ...command, preferredFactions: [] });
  assert.deepEqual(member.preferredFactions, []);
});

test("game army snapshots enforce the 3 DP budget for either army", () => {
  const s = structuredClone(baseline);
  const member = s.users.find((u) => u.id === "p1")!;
  const game = s.games.find((g) => g.userId === member.id)!;
  const rules = structuredClone(catalogue);
  const faction = rules.factions.find((f) => f.detachments.length >= 2)!;
  faction.detachments[0].points = 2;
  faction.detachments[1].points = 1;
  const detachments = faction.detachments.slice(0, 2).map((d) => d.id);
  const army = {
    faction: faction.id,
    detachments,
    disposition: dispositionsFor(faction.id, detachments, rules)[0].id,
    listUrl: "",
  };
  const patch = s.patches!.find((p) => p.id === game.patchId)!;
  patch.catalogue = rules;
  const command = {
    ...game,
    id: undefined,
    type: "game",
    layout: "A",
    own: army,
    enemy: army,
  };
  execute(s, member, command);
  const count = s.games.length;
  faction.detachments[1].points = 2;
  for (const side of ["own", "enemy"]) {
    const valid = {
      ...army,
      detachments: [detachments[0]],
      disposition: dispositionsFor(faction.id, [detachments[0]], rules)[0].id,
    };
    assert.throws(
      () =>
        execute(s, member, {
          ...command,
          own: valid,
          enemy: valid,
          [side]: army,
        }),
      /at most 3 DP/,
    );
    assert.equal(s.games.length, count);
  }
});

test("saved army lists are private by default, owner-managed, and preserve game snapshots", () => {
  const s = structuredClone(baseline);
  const member = s.users.find((u) => u.id === "p1")!;
  const other = s.users.find((u) => u.id === "p2")!;
  const admin = s.users.find((u) => u.role === "admin")!;
  const game = s.games.find((g) => g.userId === member.id)!;
  const faction = catalogue.factions.find(
    (f) =>
      !f.titan &&
      f.detachments.some((d) => d.points <= 3 && d.dispositions.length),
  )!;
  const detachment = faction.detachments.find(
    (d) => d.points <= 3 && d.dispositions.length,
  )!;
  const army = {
    faction: faction.id,
    detachments: [detachment.id],
    disposition: detachment.dispositions[0],
    listName: "Practice list",
    listUrl: "https://www.newrecruit.eu/example",
  };
  const command = { type: "saveArmy", patchId: game.patchId, army };
  execute(s, member, command);
  const saved = s.savedArmies![0];
  execute(s, member, { type: "defaultArmy", id: saved.id });
  assert.equal(viewState(s, member).me.defaultArmyId, saved.id);
  assert.throws(
    () => execute(s, other, { type: "defaultArmy", id: saved.id }),
    /one of your armies/,
  );
  assert.throws(
    () => execute(s, member, { type: "defaultArmy", id: "missing" }),
    /one of your armies/,
  );
  const directory = viewState(s, member).playerOptions;
  assert.ok(directory.some((u) => u.id === other.id));
  assert.ok(
    directory.every((u) => Object.keys(u).sort().join(",") === "id,name"),
  );
  assert.equal(saved.shared, false);
  assert.equal(viewState(s, member).savedArmies!.length, 1);
  assert.equal(viewState(s, other).savedArmies!.length, 0);
  assert.equal(viewState(s, admin).savedArmies!.length, 0);
  for (const actor of [other, admin]) {
    assert.throws(
      () => execute(s, actor, { ...command, id: saved.id }),
      /only your own/,
    );
    assert.throws(
      () =>
        execute(s, actor, { type: "shareArmy", id: saved.id, shared: true }),
      /only your own/,
    );
    assert.throws(
      () => execute(s, actor, { type: "deleteArmy", id: saved.id }),
      /only your own/,
    );
  }
  execute(s, member, { type: "shareArmy", id: saved.id, shared: true });
  assert.equal(viewState(s, other).savedArmies![0].id, saved.id);
  execute(s, member, {
    ...game,
    id: undefined,
    type: "game",
    layout: "A",
    opponentUserId: other.id,
    own: saved.army,
    enemy: saved.army,
  });
  const snapshots = structuredClone(s.games);
  assert.equal(s.games.at(-1)!.opponentUserId, other.id);
  assert.throws(
    () =>
      execute(s, member, {
        ...game,
        id: undefined,
        type: "game",
        layout: "A",
        opponentUserId: "missing",
        own: saved.army,
        enemy: saved.army,
      }),
    /active opponent/,
  );
  execute(s, member, {
    ...command,
    id: saved.id,
    army: { ...army, listName: "Revised list" },
  });
  assert.deepEqual(s.games, snapshots);
  execute(s, member, { type: "shareArmy", id: saved.id, shared: false });
  assert.equal(viewState(s, other).savedArmies!.length, 0);
  assert.throws(
    () => execute(s, member, { ...command, army: { ...army, listName: "" } }),
    /Name your army/,
  );
  assert.throws(
    () => execute(s, member, { ...command, patchId: "missing" }),
    /available rules patch/,
  );
  execute(s, member, { type: "deleteArmy", id: saved.id });
  assert.equal(s.savedArmies!.length, 0);
  assert.equal(member.defaultArmyId, "");
  assert.deepEqual(s.games, snapshots);
});

test("game boundaries validate score, URL, ownership and date", () => {
  const s = structuredClone(baseline),
    u = s.users.find((u) => u.id === "p1")!,
    g = s.games.find((g) => g.userId === u.id)!;
  for (const patch of [
    { layout: "D" },
    { layout: undefined },
    { score: 21 },
    { score: -1 },
    { date: "2026-02-31" },
    { own: { ...g.own, listUrl: "javascript:alert(1)" } },
    { id: s.games.find((g) => g.userId === "p2")!.id },
  ])
    assert.throws(() =>
      execute(s, u, { ...g, layout: "A", type: "game", ...patch }),
    );
  execute(s, u, {
    ...g,
    layout: "A",
    type: "game",
    score: 20,
    outcome: "Loss",
    notes: "Updated reflection",
  });
  assert.equal(s.games.find((v) => v.id === g.id)!.score, 20);
  assert.equal(s.games.find((v) => v.id === g.id)!.outcome, "Win");
  assert.equal(s.games.find((v) => v.id === g.id)!.layout, "A");
  for (const [score, outcome] of [
    [9, "Loss"],
    [10, "Draw"],
    [11, "Win"],
  ] as const) {
    execute(s, u, { ...g, type: "game", layout: "B", score, outcome: "Win" });
    assert.equal(s.games.find((v) => v.id === g.id)!.outcome, outcome);
  }
  const legacy = structuredClone(baseline);
  legacy.games[0].score = 10;
  legacy.games[0].outcome = "Loss";
  assert.equal(viewState(legacy, legacy.users[0]).games[0].outcome, "Draw");
  assert.equal(viewState(legacy, legacy.users[0]).games[0].layout, null);
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
test("patch migration and administrator-controlled release dates", () => {
  const s = structuredClone(baseline),
    admin = s.users[0],
    member = s.users.find((u) => u.id === "p1")!;
  assert.equal(viewState(s, admin).patches[0].date, "2026-09-02");
  assert.ok(viewState(s, admin).games.every((g) => g.patchId === "2026-09-02"));
  assert.throws(
    () =>
      execute(s, member, { type: "patch", name: "Forged", date: "2026-10-01" }),
    /Admin/,
  );
  execute(s, admin, {
    type: "patch",
    name: "Balance update",
    date: "2026-10-01",
  });
  assert.equal(viewState(s, member).patches[0].name, "Balance update");
  assert.throws(
    () =>
      execute(s, admin, {
        type: "patch",
        name: "Duplicate",
        date: "2026-10-01",
      }),
    /already exists/,
  );
  assert.throws(() =>
    execute(s, admin, { type: "patch", name: "Bad date", date: "2026-02-30" }),
  );
  const g = s.games.find((g) => g.userId === member.id)!;
  assert.throws(
    () =>
      execute(s, member, {
        ...g,
        type: "game",
        layout: "A",
        patchId: "missing",
      }),
    /valid patch/,
  );
  execute(s, member, {
    ...g,
    type: "game",
    layout: "A",
    patchId: "2026-10-01",
  });
  assert.equal(s.games.find((x) => x.id === g.id)!.patchId, "2026-10-01");
  assert.equal(
    viewState(s, admin).games.find((x) => x.id === g.id)!.patchId,
    "2026-10-01",
  );
});

test("team members share matrix lists and overrides with server-owned attribution and clear history", () => {
  const s = structuredClone(baseline),
    first = s.users.find((u) => u.id === "p1")!,
    second = s.users.find((u) => u.id === "p2")!;
  const own = s.games[0].own,
    enemy = s.games[0].enemy,
    patchId = "2026-09-02";
  execute(s, first, {
    type: "matrixList",
    patchId,
    army: { ...own, listName: "Team list" },
  });
  assert.equal(viewState(s, second).matrixLists![0].army.listName, "Team list");
  assert.equal(
    s.manualEstimates?.length || 0,
    0,
    "Adding a shared list must not create estimates",
  );
  execute(s, second, {
    type: "matrixList",
    patchId,
    army: { ...own, listName: "Revised" },
  });
  assert.equal(s.matrixLists!.length, 1);
  assert.equal(s.matrixLists![0].authorName, second.name);
  assert.equal(s.matrixListHistory!.length, 2);
  execute(s, first, {
    type: "manualEstimate",
    patchId,
    own,
    enemy,
    layout: "A",
    score: 14,
    authorName: "Forged",
  });
  assert.equal(s.manualEstimates![0].authorName, first.name);
  assert.equal(viewState(s, second).manualEstimates!.length, 1);
  execute(s, second, {
    type: "manualEstimate",
    patchId,
    own: enemy,
    enemy: own,
    layout: "A",
    score: 5,
  });
  assert.equal(s.manualEstimates!.length, 1);
  assert.equal(s.manualEstimates![0].authorName, second.name);
  execute(s, second, {
    type: "manualEstimate",
    patchId,
    own,
    enemy,
    layout: "A",
    score: null,
  });
  assert.equal(s.manualEstimates!.length, 0);
  assert.equal(s.matrixChanges!.length, 3);
  assert.equal(s.matrixChanges!.at(-1)!.score, null);
  assert.throws(() =>
    execute(s, first, {
      type: "manualEstimate",
      patchId,
      own,
      enemy,
      layout: "A",
      score: 21,
    }),
  );
  assert.throws(() =>
    execute(s, first, { type: "matrixList", patchId: "bad", army: own }),
  );
});

test("administrators manage access, protect themselves and retain removed players' history", () => {
  const s = structuredClone(baseline),
    admin = s.users[0],
    member = s.users.find((u) => u.id === "p1")!;
  assert.throws(() =>
    execute(s, member, { type: "userRole", userId: member.id, role: "admin" }),
  );
  assert.throws(() =>
    execute(s, admin, { type: "userRole", userId: admin.id, role: "member" }),
  );
  assert.throws(() =>
    execute(s, admin, { type: "removeUser", userId: admin.id }),
  );
  execute(s, admin, { type: "userRole", userId: member.id, role: "admin" });
  assert.equal(member.role, "admin");
  execute(s, admin, { type: "userRole", userId: member.id, role: "member" });
  assert.equal(member.role, "member");
  s.applications.push({
    id: "qa-remove",
    userId: member.id,
    eventId: "qa-event",
    status: "Approved",
    updatedAt: "",
  });
  const games = s.games.filter((g) => g.userId === member.id).length;
  execute(s, admin, { type: "removeUser", userId: member.id });
  assert.ok(member.removedAt);
  assert.equal(member.phaseId, null);
  assert.equal(
    s.applications.find((a) => a.id === "qa-remove")!.status,
    "Withdrawn",
  );
  assert.equal(s.games.filter((g) => g.userId === member.id).length, games);
  assert.throws(() =>
    execute(s, member, { type: "applyTeam", application: "forged" }),
  );
  member.inviteTokenHash = "secret";
  member.inviteExpiresAt = 123;
  assert.equal(JSON.stringify(viewState(s, admin)).includes("secret"), false);
});

test("imported rulesets drive army validation and preserve historical snapshots", () => {
  const s = structuredClone(baseline);
  const game = s.games[0];
  const actor = s.users.find((u) => u.id === game.userId)!;
  const admin = s.users.find((u) => u.role === "admin")!;
  const updated = structuredClone(catalogue);
  const faction = updated.factions.find((f) => f.id === game.own.faction)!;
  faction.revision += 1;
  const disposition = { id: "qa-new-disposition", name: "New disposition" };
  updated.dispositions.push(disposition);
  const detachment = {
    ...faction.detachments[0],
    id: "qa-new-detachment",
    name: "New detachment",
    dispositions: [disposition.id],
  };
  faction.detachments.push(detachment);
  const patch = { ...patchFromLibrary(rulesLibrary), catalogue: updated };
  const historical = structuredClone(s.games);
  importNewRecruitPatch(s, admin, patch);
  assert.deepEqual(s.games, historical);
  assert.equal(
    viewState(s, actor).catalogue!.factions.find((f) => f.id === faction.id)!
      .revision,
    faction.revision,
  );
  const own = {
    ...game.own,
    detachments: [detachment.id],
    disposition: disposition.id,
  };
  execute(s, actor, {
    ...game,
    type: "game",
    id: undefined,
    patchId: patch.id,
    layout: "A",
    own,
  });
  const created = s.games.at(-1)!;
  assert.equal(created.own.revision, faction.revision);
  assert.deepEqual(created.own.detachmentNames, ["New detachment"]);
  assert.equal(created.own.dispositionName, "New disposition");
  assert.throws(() =>
    execute(s, actor, {
      ...game,
      type: "game",
      id: undefined,
      layout: "A",
      own,
    }),
  );
  execute(s, actor, {
    ...game,
    type: "game",
    layout: "A",
    context: "Updated note",
  });
  assert.deepEqual(
    s.games.find((g) => g.id === game.id)!.own,
    historical[0].own,
  );
});

test("Warmind selectors retain alternatives, exclude previews, and never execute source code", async () => {
  const { catalogueFromWarmind } = await import("../src/server/warmind-patch");
  const { extractWarmindFactions } =
    await import("../src/lib/warmind-catalogue.mjs");
  const factions = Array.from({ length: 20 }, (_, i) => ({
    id: "faction-" + i,
    name: i === 0 ? "Orks" : "Faction " + i,
    edition: "11e",
    generatedAt: "2026-10-08T00:00:00.000Z",
    version: "1.5",
    detachments: [
      {
        name: "Current",
        dp: 2,
        objective: "TAKE AND HOLD",
        objectiveAlternatives: ["TAKE AND HOLD", "DISRUPTION"],
      },
      {
        name: "Preview",
        dp: 1,
        objective: "PURGE THE FOE",
        codexPreview: "Future Codex",
      },
    ],
  }));
  const bundle = "const data=" + JSON.stringify(factions) + ";";
  const rules = catalogueFromWarmind(bundle);
  assert.equal(
    rules.factions[0].id,
    catalogue.factions.find((f) => f.name === "Orks")!.id,
  );
  assert.deepEqual(
    rules.factions[0].detachments.map((d) => d.name),
    ["Current"],
  );
  assert.equal(rules.factions[0].detachments[0].dispositions.length, 2);
  assert.equal(rules.source, "Warmind");
  const s = structuredClone(baseline);
  const admin = s.users.find((u) => u.role === "admin")!;
  const old = patchFromWarmind(
    '<span class="ver-line">v1.0.6 · MFM v1.5 · 2 Oct 2026</span>',
  );
  old.name = "Team Warmind rules";
  s.patches!.push(old);
  const upgraded = {
    ...old,
    id: "warmind-catalogue-revision",
    catalogue: rules,
    source: {
      ...old.source!,
      releaseRevision: old.source!.revision,
      revision: "catalogue-revision",
    },
  };
  importNewRecruitPatch(s, admin, upgraded);
  assert.equal(old.catalogue!.source, "Warmind");
  assert.equal(old.name, "Team Warmind rules");
  assert.equal(s.patches!.length, baseline.patches!.length + 1);
  importNewRecruitPatch(s, admin, upgraded);
  assert.equal(s.patches!.length, baseline.patches!.length + 1);
  assert.throws(() =>
    catalogueFromWarmind(bundle.replace("DISRUPTION", "UNKNOWN")),
  );
  assert.throws(() =>
    extractWarmindFactions(
      bundle.replace('"dp":2', '"dp":(()=>{throw new Error("executed")})()'),
    ),
  );
  assert.throws(() => extractWarmindFactions("const data=[];"));
});

test("account deletion revokes access before completion and clears credentials idempotently", async () => {
  const { prepareAccountDeletion, completeAccountDeletion } =
    await import("../src/server/account-deletion");
  const state = structuredClone(baseline);
  const admin = state.users.find((user) => user.role === "admin")!;
  const member = state.users.find((user) => user.role === "member")!;
  const games = structuredClone(state.games);
  assert.throws(
    () => prepareAccountDeletion(state, member, admin.id),
    /Admin access/,
  );
  assert.throws(
    () => prepareAccountDeletion(state, admin, admin.id),
    /another administrator/,
  );
  prepareAccountDeletion(state, admin, member.id);
  assert.ok(member.removedAt);
  assert.equal(member.accountDeletedAt, undefined);
  completeAccountDeletion(state, admin, member.id);
  assert.ok(member.accountDeletedAt);
  assert.equal(member.password, undefined);
  const auditLength = state.audit.length;
  completeAccountDeletion(state, admin, member.id);
  assert.equal(state.audit.length, auditLength);
  assert.deepEqual(state.games, games);
});
