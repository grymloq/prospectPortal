import assert from "node:assert/strict";

export async function testScrimHttp({ request, check, admin, player }) {
  const current = await request("/api/state", null, admin.cookie);
  const rules =
    current.data.patches.find((p) => p.id === "2026-09-02")?.catalogue ||
    current.data.catalogue;
  const armies = rules.dispositions.slice(0, 2).map((disposition, index) => {
    for (const faction of rules.factions) {
      const detachment = faction.detachments.find(
        (d) => d.points <= 3 && d.dispositions.includes(disposition.id),
      );
      if (detachment)
        return {
          listName: `HTTP scrim list ${index + 1}`,
          faction: faction.id,
          detachments: [detachment.id],
          disposition: disposition.id,
          listUrl: "https://example.com/scrim-list",
        };
    }
    throw new Error("Missing disposition fixture");
  });
  const pastedFaction = rules.factions.find((f) => f.id === armies[0].faction);
  const pastedDetachment = pastedFaction.detachments.find(
    (d) => d.id === armies[0].detachments[0],
  );
  const pastedDisposition = rules.dispositions.find(
    (d) => d.id === armies[0].disposition,
  );
  const pastedList = `HTTP scrim list (2000 Points)\n${pastedFaction.name}\n${pastedDetachment.name} (${pastedDetachment.points} Detachment Points)\n${pastedDisposition.name}\n\nCHARACTERS\nFixture leader (75 Points)\n  • 1x Fixture weapon\n\nBATTLELINE\nFixture unit (80 Points)\n  10x Fixture models\n`;
  armies[0] = { ...armies[0], listUrl: "", listText: pastedList };
  const other = await request("/api/session", {
    email: "player3@teamsweden.local",
    password: "Sweden40k!",
  });
  const outsider = await request("/api/session", {
    email: "player5@teamsweden.local",
    password: "Sweden40k!",
  });
  assert.equal(other.status, 200);
  assert.equal(outsider.status, 200);
  const deadline = Date.now() + 12_000,
    start = deadline + 200;
  const create = {
    type: "scrimCreate",
    title: "HTTP internal scrim",
    kind: "internal",
    teamSize: 2,
    patchId: "2026-09-02",
    submissionDeadline: new Date(deadline).toISOString(),
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 86400_000).toISOString(),
    location: "Online",
    online: true,
    onlineUrl: "",
    description: "HTTP acceptance",
    teams: [
      { name: "HTTP Blue", captainId: "p1" },
      { name: "HTTP Yellow", captainId: "p3" },
    ],
  };
  assert.equal(
    (await request("/api/state", create, player.cookie)).status,
    400,
  );
  let response = await request("/api/state", create, admin.cookie);
  assert.equal(response.status, 200, JSON.stringify(response.data));
  let scrim = response.data.scrims.at(-1);
  const run = async (command, cookie = admin.cookie) => {
    const response = await request(
      "/api/state",
      { scrimId: scrim.id, revision: scrim.revision, ...command },
      cookie,
    );
    if (response.status === 200)
      scrim = response.data.scrims.find((s) => s.id === scrim.id);
    return response;
  };
  for (let t = 0; t < 2; t++) {
    const teamId = scrim.teams[t].id;
    response = await run({
      type: "scrimRoster",
      teamId,
      entries: [{ userId: `p${t * 2 + 1}` }, { userId: `p${t * 2 + 2}` }],
    });
    assert.equal(response.status, 200);
    for (let i = 0; i < 2; i++) {
      response = await run({
        type: "scrimSubmit",
        teamId,
        entryId: scrim.teams[t].entries[i].id,
        ...(i === 0 ? { listText: pastedList } : { army: armies[i] }),
      });
      assert.equal(response.status, 200, JSON.stringify(response.data));
    }
    response = await run({ type: "scrimFinalize", teamId, finalized: true });
    assert.equal(response.status, 200);
  }
  const privateView = await request("/api/state", null, player.cookie);
  const privateScrim = privateView.data.scrims.find((s) => s.id === scrim.id);
  check(
    "pasted scrim lists retain full text in submissions, private saved armies and versions",
    () => {
      const entry = privateScrim.teams[0].entries[0];
      assert.equal(entry.army.listText, pastedList);
      assert.equal(entry.army.listUrl, "");
      const saved = privateView.data.savedArmies.find(
        (a) => a.id === entry.savedArmyId,
      );
      assert.equal(saved.army.listText, pastedList);
      assert.equal(saved.shared, false);
      assert.deepEqual(entry.army.summary, saved.army.summary);
      assert.deepEqual(
        entry.army.summary.units.map((u) => [u.name, u.quantity]),
        [
          ["Fixture leader", 1],
          ["Fixture unit", 1],
        ],
      );
      assert.ok(entry.army.summary.archetypeId.startsWith("archetype-v1-"));
      assert.ok(entry.listVersionId);
    },
  );
  check(
    "scrim deadlines are on the calendar and opponent draft lists are server-hidden",
    () => {
      assert.ok(privateView.data.events.some((e) => e.scrimId === scrim.id));
      assert.equal(privateScrim.teams[1].entries.length, 0);
      assert.equal(privateScrim.listsRevealed, false);
      assert.equal(privateScrim.teams[1].estimates.length, 0);
    },
  );
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, start + 20 - Date.now())),
  );
  const rename = {
    type: "scrimTeamName",
    teamId: scrim.teams[0].id,
    name: "HTTP renamed Blue",
  };
  assert.equal((await run(rename, other.cookie)).status, 400);
  assert.equal((await run(rename, outsider.cookie)).status, 400);
  response = await run(rename, player.cookie);
  assert.equal(response.status, 200);
  check(
    "captains rename their own team after the deadline and other members are blocked",
    () => {
      assert.equal(scrim.teams[0].name, "HTTP renamed Blue");
      assert.equal(scrim.teams[1].name, "HTTP Yellow");
    },
  );
  response = await run(
    {
      type: "scrimPairings",
      pairings: scrim.teams[0].entries.map((e, i) => ({
        aId: e.id,
        bId: scrim.teams[1].entries[i].id,
        layout: "C",
      })),
    },
    player.cookie,
  );
  assert.equal(response.status, 200, JSON.stringify(response.data));
  const cell = scrim.teams[0].estimates[0];
  await run(
    {
      type: "scrimEstimate",
      teamId: scrim.teams[0].id,
      ownId: cell.ownId,
      enemyId: cell.enemyId,
      scores: { A: 4, B: 11, C: 0 },
    },
    player.cookie,
  );
  const ownArmy = scrim.teams[0].entries.find((e) => e.id === cell.ownId).army;
  const enemyArmy = scrim.teams[1].entries.find(
    (e) => e.id === cell.enemyId,
  ).army;
  const key = (army) =>
    JSON.stringify([
      army.faction,
      [...army.detachments].sort(),
      army.disposition,
    ]);
  const inline = {
    type: "scrimLayoutEstimate",
    scrimId: scrim.id,
    revision: scrim.revision,
    teamId: scrim.teams[0].id,
    ownId: cell.ownId,
    enemyId: cell.enemyId,
    ownArmyKey: key(ownArmy),
    enemyArmyKey: key(enemyArmy),
    layout: "A",
    score: null,
    expectedScore: 4,
  };
  assert.equal((await request("/api/state", inline, other.cookie)).status, 400);
  assert.equal((await request("/api/state", inline, admin.cookie)).status, 400);
  const cleared = await request("/api/state", inline, player.cookie);
  check(
    "inline scrim clears return only the authorized cell and preserve other layouts and stale-write protection",
    () => {
      assert.equal(cleared.status, 200);
      assert.equal(cleared.data.kind, "scrim-score");
      assert.deepEqual(cleared.data.cell.scores, { A: null, B: 11, C: 0 });
      assert.deepEqual(
        Object.keys(cleared.data).sort(),
        ["kind", "viewerId", "scrimId", "revision", "teamId", "cell"].sort(),
      );
      assert.equal(cleared.data.viewerId, "p1");
    },
  );
  assert.equal(
    (await request("/api/state", inline, player.cookie)).status,
    400,
  );
  scrim = (await request("/api/state", null, player.cookie)).data.scrims.find(
    (s) => s.id === scrim.id,
  );
  response = await run(
    {
      type: "scrimPlanComment",
      teamId: scrim.teams[0].id,
      ownId: cell.ownId,
      enemyId: cell.enemyId,
      text: "HTTP confidential pairing plan",
    },
    player.cookie,
  );
  assert.equal(response.status, 200);
  const opposite = await request("/api/state", null, other.cookie);
  check("scrim planning comments stay hidden across team boundaries", () => {
    assert.equal(
      JSON.stringify(opposite.data).includes("HTTP confidential pairing plan"),
      false,
    );
    assert.equal(
      JSON.stringify(
        opposite.data.scrims.find((s) => s.id === scrim.id).teams[0].estimates,
      ),
      "[]",
    );
  });
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const report = {
    type: "scrimReport",
    scrimId: scrim.id,
    revision: scrim.revision,
    pairingId: scrim.pairings[0].id,
    perspective: "a",
    score: 13,
    date,
    notes: "HTTP private scrim reflection",
  };
  assert.equal(
    (await request("/api/state", report, outsider.cookie)).status,
    400,
  );
  const simultaneous = await Promise.all([
    request("/api/state", report, player.cookie),
    request(
      "/api/state",
      {
        ...report,
        perspective: "b",
        score: 7,
        notes: "HTTP other private reflection",
      },
      other.cookie,
    ),
  ]);
  check(
    "simultaneous scrim reports commit once and reject a stale competing write",
    () =>
      assert.deepEqual(simultaneous.map((r) => r.status).sort(), [200, 400]),
  );
  let all = await request("/api/state", null, admin.cookie);
  scrim = all.data.scrims.find((s) => s.id === scrim.id);
  const linked = all.data.games.filter(
    (g) => g.scrimPairingId === scrim.pairings[0].id,
  );
  check(
    "a shared scrim report creates complementary journal records exactly once",
    () => {
      assert.equal(linked.length, 2);
      assert.deepEqual(
        linked.map((g) => g.score).sort((a, b) => a - b),
        [7, 13],
      );
      assert.ok(
        linked.every((g) => g.layout === "C" && g.patchId === scrim.patchId),
      );
    },
  );
  const opponentView = await request("/api/state", null, other.cookie);
  assert.ok(opponentView.data.games.every((g) => g.userId === "p3"));
  assert.equal(
    opponentView.data.games.some(
      (g) => g.notes === "HTTP private scrim reflection",
    ),
    false,
  );
  const final = await run({
    type: "scrimReport",
    pairingId: scrim.pairings[1].id,
    perspective: "a",
    score: 10,
    date,
  });
  assert.equal(final.status, 200);
  const completed = await request("/api/state", null, outsider.cookie);
  const finished = completed.data.scrims.find((s) => s.id === scrim.id);
  check(
    "completed scrims reveal both plans while journals and private reflections stay restricted",
    () => {
      assert.ok(finished.completedAt);
      assert.ok(finished.teams.every((t) => t.estimates.length === 4));
      assert.equal(
        completed.data.games.some((g) => g.scrimId === scrim.id),
        false,
      );
      assert.equal(
        finished.pairings.reduce((sum, p) => sum + p.scoreA, 0),
        23,
      );
    },
  );
}
