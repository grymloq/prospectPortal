import assert from "node:assert/strict";
import { test, after, mock } from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import type { State, User } from "../src/lib/types";
mkdirSync(path.resolve(".local"), { recursive: true });
const scratch = mkdtempSync(path.resolve(".local/scrim-tests-"));
process.env.TEAM_DB_PATH = path.join(scratch, "test.sqlite");
const { readState, db, transaction } = await import("../src/server/store");
const { execute, viewState } = await import("../src/server/service");
const { catalogue, armySnapshot } = await import("../src/lib/catalogue");
const { armyKey, buildMatchups } = await import("../src/lib/matchups");
const { matchupDatabase } = await import("../src/lib/matchup-database");
const { scrimScore } = await import("../src/lib/scrims");
const { ensureMembership } = await import("../src/server/membership");
const { stockholmLocal } = await import("../src/lib/stockholm");
const { validateGameVersion } =
  await import("../src/server/army-library-versions");
const base = readState();
after(() => {
  db.close();
  if (!scratch.startsWith(path.resolve(".local") + path.sep))
    throw new Error("Unsafe cleanup path");
  rmSync(scratch, { recursive: true, force: true });
});

function at<T>(when: number, work: () => T): T {
  // Advance both Date.now() and new Date() across Stockholm day boundaries.
  mock.timers.enable({ apis: ["Date"], now: when });
  try {
    return work();
  } finally {
    mock.timers.reset();
  }
}
function armyFor(index: number) {
  const disposition =
    catalogue.dispositions[index % catalogue.dispositions.length];
  for (const faction of catalogue.factions) {
    const detachment = faction.detachments.find(
      (d) => d.points <= 3 && d.dispositions.includes(disposition.id),
    );
    if (detachment)
      return {
        listName: `List ${index + 1}`,
        faction: faction.id,
        detachments: [detachment.id],
        disposition: disposition.id,
        listUrl: `https://example.com/list-${index + 1}`,
      };
  }
  throw new Error("No army for disposition");
}
function fixture(size = 2, kind: "internal" | "external" = "internal") {
  const s: State = structuredClone(base);
  for (let i = 13; i <= 20; i++)
    s.users.push({
      ...s.users[1],
      id: `p${i}`,
      name: `Player ${i}`,
      email: `p${i}@test.invalid`,
    });
  const admin = s.users[0];
  const member = (i: number) => s.users.find((u) => u.id === `p${i}`)!;
  const deadline = Date.now() + 3600_000,
    start = deadline + 3600_000;
  const create = {
    type: "scrimCreate",
    title: "Test scrim",
    kind,
    teamSize: size,
    patchId: s.patches![0].id,
    submissionDeadline: new Date(deadline).toISOString(),
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 3 * 86400_000).toISOString(),
    location: "Online",
    online: true,
    onlineUrl: "",
    description: "",
    teams: [
      { name: "Blue", captainId: member(1).id },
      {
        name: "Yellow",
        captainId: kind === "internal" ? member(size + 1).id : "",
      },
    ],
  };
  execute(s, admin, create);
  const scrim = s.scrims![0];
  const run = (actor: User, command: object) =>
    execute(s, actor, {
      scrimId: scrim.id,
      revision: scrim.revision,
      ...command,
    });
  const fill = () => {
    for (const [t, team] of scrim.teams.entries()) {
      run(admin, {
        type: "scrimRoster",
        teamId: team.id,
        entries: Array.from({ length: size }, (_, i) =>
          team.external
            ? { name: `External ${i + 1}` }
            : { userId: member(t * size + i + 1).id },
        ),
      });
      for (const [i, entry] of team.entries.entries())
        run(admin, {
          type: "scrimSubmit",
          teamId: team.id,
          entryId: entry.id,
          army: armyFor(i),
        });
      run(admin, { type: "scrimFinalize", teamId: team.id, finalized: true });
    }
  };
  const pair = () =>
    at(deadline + 1, () =>
      run(admin, {
        type: "scrimPairings",
        pairings: scrim.teams[0].entries.map((e, i) => ({
          aId: e.id,
          bId: scrim.teams[1].entries[i].id,
          layout: "A",
        })),
      }),
    );
  const report = (
    i: number,
    score: number,
    actor = admin,
    perspective = "a",
    notes?: string,
  ) =>
    at(start + 60_000, () =>
      run(actor, {
        type: "scrimReport",
        pairingId: scrim.pairings[i].id,
        perspective,
        score,
        date: stockholmLocal(new Date(start).toISOString()).slice(0, 10),
        ...(notes !== undefined ? { notes } : {}),
      }),
    );
  return {
    s,
    admin,
    member,
    scrim,
    create,
    run,
    fill,
    pair,
    report,
    deadline,
    start,
  };
}

test("team names are validated and revision-protected; captains rename only their own side", () => {
  const f = fixture();
  const team = f.scrim.teams[0],
    other = f.scrim.teams[1];
  const rename = {
    type: "scrimTeamName",
    teamId: team.id,
    name: "  Blue Falcons  ",
  };
  assert.throws(() => f.run(f.member(2), rename), /captain or an admin/);
  assert.throws(() => f.run(f.member(3), rename), /captain or an admin/);
  const previousRevision = f.scrim.revision;
  f.run(f.member(1), rename);
  assert.equal(team.name, "Blue Falcons");
  assert.equal(other.name, "Yellow");
  assert.equal(f.scrim.revision, previousRevision + 1);
  assert.match(f.s.audit[0].text, /renamed scrim team Blue to Blue Falcons/);
  assert.throws(
    () => f.run(f.admin, { ...rename, revision: previousRevision }),
    /changed/,
  );
  assert.throws(() => f.run(f.admin, { ...rename, name: "   " }));
  assert.throws(() => f.run(f.admin, { ...rename, name: "x".repeat(151) }));
  f.fill();
  f.pair();
  f.report(0, 15);
  f.report(1, 10);
  f.run(f.admin, { ...rename, name: "Champion Falcons" });
  assert.equal(scrimScore(f.scrim).winner, "Champion Falcons");
  const external = fixture(2, "external");
  external.run(external.member(1), {
    type: "scrimTeamName",
    teamId: external.scrim.teams[1].id,
    name: "Visiting team",
  });
  assert.equal(external.scrim.teams[1].name, "Visiting team");
});

test("existing users migrate without losing content; new pending users cannot read or write", () => {
  const s = structuredClone(base);
  delete s.membershipCutoverAt;
  for (const user of s.users) delete user.confirmedMember;
  const before = JSON.stringify(s.games);
  assert.equal(ensureMembership(s), true);
  assert.ok(s.users.every((u) => u.confirmedMember));
  assert.equal(JSON.stringify(s.games), before);
  s.users[1].confirmedMember = false;
  assert.equal(ensureMembership(s), false);
  assert.throws(() => viewState(s, s.users[1]), /awaiting confirmation/);
  assert.throws(
    () => execute(s, s.users[1], { type: "defaultArmy", id: "" }),
    /awaiting confirmation/,
  );
  s.users.push({
    ...s.users[1],
    id: "new-without-flag",
    confirmedMember: undefined,
  });
  ensureMembership(s);
  assert.equal(s.users.at(-1)!.confirmedMember, false);
});
test("confirmation is admin-only, prevents self-lockout and is independent of selection", () => {
  const f = fixture();
  const user = f.member(2),
    phase = user.phaseId;
  assert.throws(
    () =>
      f.run(user, {
        type: "userConfirmation",
        userId: user.id,
        confirmed: true,
      }),
    /Admin/,
  );
  assert.throws(
    () =>
      f.run(f.admin, {
        type: "userConfirmation",
        userId: f.admin.id,
        confirmed: false,
      }),
    /own access/,
  );
  f.run(f.admin, {
    type: "userConfirmation",
    userId: user.id,
    confirmed: false,
  });
  assert.throws(() => viewState(f.s, user), /awaiting confirmation/);
  f.run(f.admin, {
    type: "userConfirmation",
    userId: user.id,
    confirmed: true,
  });
  assert.equal(user.phaseId, phase);
});
test("scrim creation requires an admin, valid captains, feasible size, rules and dates", () => {
  const f = fixture();
  assert.throws(() => execute(f.s, f.member(1), f.create), /Admin/);
  assert.throws(
    () => execute(f.s, f.admin, { ...f.create, teamSize: 11 }),
    /maximum/,
  );
  assert.throws(
    () =>
      execute(f.s, f.admin, {
        ...f.create,
        teams: [f.create.teams[0], f.create.teams[0]],
      }),
    /different captain/,
  );
  assert.throws(
    () =>
      execute(f.s, f.admin, {
        ...f.create,
        submissionDeadline: new Date(Date.now() - 1).toISOString(),
      }),
    /deadline/,
  );
  assert.throws(
    () => execute(f.s, f.admin, { ...f.create, patchId: "missing" }),
    /patch/,
  );
  assert.equal(f.s.events.at(-1)?.scrimId, f.scrim.id);
});
test("captains may be non-playing and roster permissions cannot cross teams", () => {
  const f = fixture();
  const team = f.scrim.teams[0];
  assert.throws(
    () =>
      f.run(f.member(3), {
        type: "scrimRoster",
        teamId: team.id,
        entries: [{ userId: "p2" }],
      }),
    /captain/,
  );
  f.run(f.member(1), {
    type: "scrimRoster",
    teamId: team.id,
    entries: [{ userId: "p2" }],
  });
  assert.equal(
    team.entries.some((e) => e.userId === "p1"),
    false,
  );
  assert.throws(
    () =>
      f.run(f.member(1), {
        type: "scrimRoster",
        teamId: team.id,
        entries: [{ userId: "p3" }],
      }),
    /both teams/,
  );
  assert.throws(
    () =>
      f.run(f.member(1), {
        type: "scrimRoster",
        teamId: team.id,
        entries: [{ userId: "p2" }, { userId: "p2" }],
      }),
    /once/,
  );
  assert.throws(
    () =>
      f.run(f.member(1), {
        type: "scrimRoster",
        teamId: team.id,
        entries: [{ userId: "p2" }, { userId: "p4" }, { userId: "p5" }],
      }),
    /full/,
  );
  f.member(2).confirmedMember = false;
  assert.throws(
    () =>
      f.run(f.admin, {
        type: "scrimRoster",
        teamId: team.id,
        entries: [{ userId: "p2" }],
      }),
    /confirmed/,
  );
});
test("drafts tolerate duplicates but smaller teams finalize with distinct dispositions", () => {
  const f = fixture();
  const t = f.scrim.teams[0];
  f.run(f.admin, {
    type: "scrimRoster",
    teamId: t.id,
    entries: [{ userId: "p1" }, { userId: "p2" }],
  });
  for (const e of t.entries)
    f.run(f.admin, {
      type: "scrimSubmit",
      teamId: t.id,
      entryId: e.id,
      army: armyFor(0),
    });
  assert.throws(
    () =>
      f.run(f.admin, { type: "scrimFinalize", teamId: t.id, finalized: true }),
    /maximum 1/,
  );
  f.run(f.member(2), {
    type: "scrimSubmit",
    teamId: t.id,
    entryId: t.entries[1].id,
    army: armyFor(1),
  });
  f.run(f.member(1), { type: "scrimFinalize", teamId: t.id, finalized: true });
  assert.ok(t.finalizedAt);
});
test("eight-player final submissions require all dispositions and no more than two each", () => {
  const f = fixture(8);
  f.fill();
  const t = f.scrim.teams[0];
  assert.ok(t.finalizedAt);
  f.run(f.admin, { type: "scrimFinalize", teamId: t.id, finalized: false });
  f.run(f.admin, {
    type: "scrimSubmit",
    teamId: t.id,
    entryId: t.entries[4].id,
    army: armyFor(0),
  });
  assert.throws(
    () =>
      f.run(f.admin, { type: "scrimFinalize", teamId: t.id, finalized: true }),
    /Missing.*|maximum 2/,
  );
});
test("captain submissions save into the player's own library, without granting private library access", () => {
  const f = fixture();
  f.fill();
  const team = f.scrim.teams[0],
    entry = team.entries[1];
  const saved = f.s.savedArmies!.find((a) => a.id === entry.savedArmyId)!;
  assert.equal(saved.userId, "p2");
  assert.equal(saved.shared, false);
  assert.ok(
    viewState(f.s, f.member(2)).savedArmies!.some((a) => a.id === saved.id),
  );
  assert.ok(
    !viewState(f.s, f.member(1)).savedArmies!.some((a) => a.id === saved.id),
  );
  f.run(f.admin, { type: "scrimFinalize", teamId: team.id, finalized: false });
  assert.throws(
    () =>
      f.run(f.member(1), {
        type: "scrimSubmit",
        teamId: team.id,
        entryId: entry.id,
        savedArmyId: saved.id,
      }),
    /available saved army/,
  );
  f.run(f.member(2), {
    type: "scrimSubmit",
    teamId: team.id,
    entryId: entry.id,
    savedArmyId: saved.id,
  });
  const oldName = entry.army!.listName;
  f.run(f.member(2), {
    type: "saveArmy",
    id: saved.id,
    patchId: f.scrim.patchId,
    army: { ...saved.army, listName: "Changed later" },
  });
  assert.equal(entry.army!.listName, oldName);
});
test("text-only scrim submission reads configuration on the server and rejects forged mixed inputs", () => {
  const f = fixture();
  f.fill();
  const team = f.scrim.teams[0];
  const entry = team.entries[1];
  const owner = f.member(2);
  f.run(f.admin, { type: "scrimFinalize", teamId: team.id, finalized: false });
  const config = armySnapshot(armyFor(1));
  const listText = `Text-only army (2000 Points)\n${config.factionName}\n${config.detachmentNames.join(" and ")} (3 Detachment Points)\n${config.dispositionName}\n\nCHARACTERS\nFixture leader (75 Points)\n  • Fixture weapon\n`;
  const command = {
    type: "scrimSubmit",
    teamId: team.id,
    entryId: entry.id,
    listText,
  };
  f.run(owner, command);
  assert.equal(entry.army!.listText, listText);
  assert.equal(entry.army!.faction, config.faction);
  assert.equal(entry.army!.disposition, config.disposition);
  assert.equal(entry.army!.listUrl, "");
  assert.equal(entry.army!.listName, "Text-only army");
  assert.equal(entry.army!.summary!.units[0].name, "Fixture leader");
  assert.equal(entry.army!.summary!.units[0].quantity, 1);
  assert.equal(
    entry.army!.summary!.archetypeId,
    f.s.libraryMemberships!.find((m) => m.versionId === entry.listVersionId)!
      .archetypeId,
  );
  assert.equal(
    f.s.savedArmies!.find((a) => a.id === entry.savedArmyId)!.army.listText,
    listText,
  );
  const before = JSON.stringify(entry);
  assert.throws(
    () => f.run(owner, { ...command, listText: "Missing export header" }),
    /faction/,
  );
  assert.throws(
    () => f.run(owner, { ...command, army: armyFor(0) }),
    /one list submission method/,
  );
  assert.throws(
    () => f.run(owner, { ...command, savedArmyId: entry.savedArmyId }),
    /one list submission method/,
  );
  assert.equal(JSON.stringify(entry), before);
  assert.throws(() => f.run(f.member(3), command), /own list|captain/);
});

test("scrim text submissions accept only missing choices and preserve server privacy and history", () => {
  const f = fixture();
  f.fill();
  const team = f.scrim.teams[0];
  const entry = team.entries[1];
  const owner = f.member(2);
  f.run(f.admin, { type: "scrimFinalize", teamId: team.id, finalized: false });
  const config = armySnapshot(armyFor(1));
  const textConfiguration = {
    detachments: config.detachments,
    disposition: config.disposition,
  };
  const sourceName = catalogue.factions.find(
    (f) => f.id === config.faction,
  )!.sourceName;
  const listText = `${sourceName} - My army - [100 pts]\n\nFixture unit [100 pts]\n• 3x Fixture model\n`;
  const command = {
    type: "scrimSubmit",
    teamId: team.id,
    entryId: entry.id,
    listText,
    textConfiguration,
  };
  f.run(owner, command);
  assert.equal(entry.army!.listText, listText);
  assert.equal(entry.army!.disposition, config.disposition);
  assert.equal(entry.army!.summary!.units[0].quantity, 1);
  assert.equal(entry.army!.summary!.units[0].modelCount, undefined);
  const version = f.s.armyVersions!.find((v) => v.id === entry.listVersionId)!;
  assert.equal(version.army.listText, listText);
  assert.equal(
    viewState(f.s, f.member(3)).scrims![0].teams[0].entries.length,
    0,
  );
  const before = JSON.stringify(entry);
  assert.throws(
    () => f.run(owner, { ...command, textConfiguration: {} }),
    /omits detachments/,
  );
  assert.throws(
    () => f.run(owner, { ...command, listText: undefined, army: armyFor(1) }),
    /text submission/,
  );
  assert.throws(() => f.run(f.member(3), command), /own list|captain/);
  assert.equal(JSON.stringify(entry), before);
});

test("pasted scrim exports retain formatting, privacy and independent list versions", () => {
  const f = fixture();
  f.fill();
  const team = f.scrim.teams[0];
  const entry = team.entries[1];
  const owner = f.member(2);
  f.run(f.admin, { type: "scrimFinalize", teamId: team.id, finalized: false });
  const formats = [
    "My army (2000 Points)\r\n\r\nCHARACTERS\r\n  Warboss (75 Points)\r\n    • 1x Power klaw\r\n",
    "+++++++++++++++++++++++++++++++++++++++++++++++\n+ FACTION KEYWORD: Xenos - Orks\n+ DETACHMENT: Dread Mob\n+++++++++++++++++++++++++++++++++++++++++++++++\n\n1x Warboss: Power klaw\n",
    "**My army**\n\n*Warboss*\n- Power klaw\n<script>alert('literal export text')</script>\n",
  ];
  for (const listText of formats) {
    f.run(owner, {
      type: "scrimSubmit",
      teamId: team.id,
      entryId: entry.id,
      army: { ...armyFor(1), listUrl: "", listText },
    });
    const saved = f.s.savedArmies!.find((a) => a.id === entry.savedArmyId)!;
    const version = f.s.armyVersions!.find(
      (v) => v.id === entry.listVersionId,
    )!;
    assert.equal(entry.army!.listText, listText);
    assert.equal(saved.army.listText, listText);
    assert.equal(version.army.listText, listText);
    assert.equal(saved.shared, false);
    assert.equal(saved.army.composition, undefined);
    assert.throws(
      () =>
        validateGameVersion(
          f.s,
          owner,
          version.id,
          { ...version.army, listText: "Different submitted text" },
          f.scrim.patchId,
          true,
        ),
      /does not match/,
    );
    assert.ok(!viewState(f.s, f.member(3)).scrims![0].teams[0].entries.length);
    assert.ok(
      !viewState(f.s, f.member(1)).savedArmies!.some((a) => a.id === saved.id),
    );
    f.run(owner, {
      type: "saveArmy",
      id: saved.id,
      patchId: f.scrim.patchId,
      army: { ...saved.army, listText: "Changed after submitting\n" },
      expectedRevision: saved.listRevision,
    });
    assert.notEqual(saved.currentVersionId, version.id);
    assert.equal(entry.army!.listText, listText);
    assert.equal(version.army.listText, listText);
    f.run(owner, {
      type: "scrimSubmit",
      teamId: team.id,
      entryId: entry.id,
      savedArmyId: saved.id,
    });
    assert.equal(entry.army!.listText, "Changed after submitting\n");
  }
  const command = { type: "scrimSubmit", teamId: team.id, entryId: entry.id };
  assert.throws(() =>
    f.run(owner, { ...command, army: { ...armyFor(1), listText: "   \n" } }),
  );
  assert.throws(() =>
    f.run(owner, {
      ...command,
      army: { ...armyFor(1), listText: "x".repeat(100001) },
    }),
  );
  assert.throws(
    () =>
      f.run(f.member(3), {
        ...command,
        army: { ...armyFor(1), listText: formats[0] },
      }),
    /own list|captain/,
  );
  f.run(f.admin, { type: "scrimFinalize", teamId: team.id, finalized: true });
  const revealed = at(f.deadline + 1, () => viewState(f.s, f.member(3)));
  assert.equal(
    revealed.scrims![0].teams[0].entries[1].army!.listText,
    entry.army!.listText,
  );
  f.pair();
  f.report(1, 12);
  const journals = f.s.games.filter(
    (g) => g.scrimPairingId === f.scrim.pairings[1].id,
  );
  assert.equal(journals.length, 2);
  assert.equal(
    journals.find((g) => g.userId === owner.id)!.own.listText,
    entry.army!.listText,
  );
  assert.equal(
    journals.find((g) => g.userId !== owner.id)!.enemy.listText,
    entry.army!.listText,
  );
});

test("server hides opponent lists before the deadline and all private plans until completion", () => {
  const f = fixture();
  f.fill();
  let v = viewState(f.s, f.member(1));
  assert.ok(v.scrims![0].teams[0].entries[0].army);
  assert.equal(v.scrims![0].teams[1].entries.length, 0);
  assert.equal(v.scrims![0].listsRevealed, false);
  assert.ok(
    v.scrims![0].teams[0].estimates.every((cell) =>
      cell.enemyId.startsWith("db:"),
    ),
  );
  at(f.deadline + 1, () => {
    v = viewState(f.s, f.member(1));
    assert.ok(v.scrims![0].teams[1].entries[0].army);
    assert.equal(v.scrims![0].listsRevealed, true);
    assert.ok(v.scrims![0].teams[0].estimates.length);
    assert.equal(v.scrims![0].teams[1].estimates.length, 0);
    assert.ok(
      viewState(f.s, f.admin).scrims![0].teams.every(
        (t) => t.estimates.length === 0,
      ),
    );
  });
});
test("list lock alone does not reveal incomplete or unfinalized opposing rosters", () => {
  const f = fixture();
  f.fill();
  const army = f.scrim.teams[1].entries[0].army;
  delete f.scrim.teams[1].entries[0].army;
  at(f.deadline + 1, () => {
    const view = viewState(f.s, f.member(1));
    assert.equal(view.scrims![0].listsRevealed, false);
    assert.equal(view.scrims![0].teams[1].entries.length, 0);
    assert.ok(
      view.scrims![0].teams[0].estimates.every((cell) =>
        cell.enemyId.startsWith("db:"),
      ),
    );
    assert.equal(viewState(f.s, f.admin).scrims![0].teams[1].entries.length, 2);
  });
  f.scrim.teams[1].entries[0].army = army;
  delete f.scrim.teams[1].finalizedAt;
  at(f.deadline + 1, () => {
    assert.equal(viewState(f.s, f.member(1)).scrims![0].listsRevealed, false);
  });
  f.scrim.teams[1].finalizedAt = new Date().toISOString();
  f.scrim.teams[1].entries.pop();
  at(f.deadline + 1, () => {
    assert.equal(viewState(f.s, f.member(1)).scrims![0].listsRevealed, false);
  });
});

test("single-layout scrim edits clear only the targeted score and retain revisions, army identity and team privacy", () => {
  const f = fixture();
  f.fill();
  at(f.deadline + 1, () => {
    const team = f.scrim.teams[0],
      own = team.entries[0],
      enemy = f.scrim.teams[1].entries[0];
    f.run(f.member(1), {
      type: "scrimEstimate",
      teamId: team.id,
      ownId: own.id,
      enemyId: enemy.id,
      scores: { A: 4, B: 11, C: 0 },
    });
    const edit = {
      type: "scrimLayoutEstimate",
      teamId: team.id,
      ownId: own.id,
      enemyId: enemy.id,
      ownArmyKey: armyKey(own.army!),
      enemyArmyKey: armyKey(enemy.army!),
      layout: "A",
      score: null,
      expectedScore: 4,
    };
    const revision = f.scrim.revision;
    f.run(f.member(1), edit);
    const cell = team.estimates.find(
      (c) => c.ownId === own.id && c.enemyId === enemy.id,
    )!;
    assert.deepEqual(cell.scores, { A: null, B: 11, C: 0 });
    assert.equal(f.scrim.revision, revision + 1);
    assert.deepEqual(cell.history!.at(-1)!.scores, cell.scores);
    assert.throws(
      () => f.run(f.member(1), { ...edit, revision }),
      /scrim changed/,
    );
    assert.throws(() => f.run(f.member(1), edit), /estimate changed/);
    assert.throws(
      () =>
        f.run(f.member(1), {
          ...edit,
          expectedScore: null,
          ownArmyKey: "wrong",
        }),
      /army lists changed/,
    );
    assert.throws(
      () => f.run(f.member(3), { ...edit, expectedScore: null }),
      /Only team/,
    );
    assert.throws(
      () => f.run(f.admin, { ...edit, expectedScore: null }),
      /Only team/,
    );
    const other = viewState(f.s, f.member(3)).scrims![0].teams[0];
    assert.equal(other.estimates.length, 0);
  });
});

test("team members edit only their own matrix, with comments and independent shared seeds", () => {
  const f = fixture();
  f.s.manualEstimates = [
    {
      userId: f.admin.id,
      patchId: f.scrim.patchId,
      row: armyKey(armySnapshot(armyFor(0))),
      column: armyKey(armySnapshot(armyFor(1))),
      layout: "A",
      score: 13,
      authorName: "Shared author",
      updatedAt: new Date().toISOString(),
    },
  ];
  f.fill();
  const t = f.scrim.teams[0],
    cell = t.estimates.find(
      (c) =>
        c.ownId === t.entries[0].id &&
        c.enemyId === f.scrim.teams[1].entries[1].id,
    )!;
  assert.equal(cell.scores.A, 13);
  at(f.deadline + 1, () => {
    const target = { teamId: t.id, ownId: cell.ownId, enemyId: cell.enemyId };
    assert.throws(
      () =>
        f.run(f.member(3), {
          type: "scrimEstimate",
          ...target,
          scores: { A: 1, B: 2, C: 3 },
        }),
      /Only team/,
    );
    f.run(f.member(2), {
      type: "scrimEstimate",
      ...target,
      scores: { A: 15, B: null, C: 11 },
    });
    f.run(f.member(2), {
      type: "scrimPlanComment",
      ...target,
      text: "Private plan",
    });
    assert.equal(cell.scores.A, 15);
    assert.equal(f.s.manualEstimates![0].score, 13);
    assert.equal(
      JSON.stringify(viewState(f.s, f.member(3))).includes("Private plan"),
      false,
    );
    assert.equal(
      JSON.stringify(viewState(f.s, f.member(2))).includes("Private plan"),
      true,
    );
  });
});
test("pre-lock database planning stays private to one scrim and carries into matching opposing lists", () => {
  const f = fixture();
  f.s.games = [];
  f.fill();
  const enemyArmy = f.scrim.teams[1].entries[0].army!;
  f.s.matrixLists = [
    {
      id: "public-list",
      userId: f.admin.id,
      patchId: f.scrim.patchId,
      army: enemyArmy,
      authorName: f.admin.name,
      updatedAt: new Date().toISOString(),
    },
  ];
  const globalBefore = JSON.stringify({
    lists: f.s.matrixLists,
    estimates: f.s.manualEstimates,
  });
  const team = f.scrim.teams[0];
  const prep = viewState(f.s, f.member(1)).scrims![0];
  assert.equal(prep.listsRevealed, false);
  assert.equal(prep.databaseEntries!.length, 1);
  const target = {
    teamId: team.id,
    ownId: team.entries[0].id,
    enemyId: prep.databaseEntries![0].id,
  };
  f.run(f.member(1), {
    type: "scrimEstimate",
    ...target,
    scores: { A: 17, B: 12, C: null },
  });
  f.run(f.member(2), {
    type: "scrimPlanComment",
    ...target,
    text: "Secret preparation",
  });
  assert.equal(
    viewState(f.s, f.member(2)).scrims![0].teams[0].estimates[0].scores.A,
    17,
  );
  for (const actor of [f.member(3), f.member(20), f.admin]) {
    assert.equal(
      JSON.stringify(viewState(f.s, actor)).includes("Secret preparation"),
      false,
    );
  }
  assert.throws(
    () =>
      f.run(f.member(3), {
        type: "scrimEstimate",
        ...target,
        scores: { A: 1, B: 1, C: 1 },
      }),
    /Only team/,
  );
  assert.throws(
    () =>
      f.run(f.member(1), {
        type: "scrimEstimate",
        ...target,
        enemyId: "db:forged",
        scores: { A: 1, B: 1, C: 1 },
      }),
    /public database/,
  );
  assert.equal(
    JSON.stringify({ lists: f.s.matrixLists, estimates: f.s.manualEstimates }),
    globalBefore,
  );
  at(f.deadline + 1, () => {
    const revealed = viewState(f.s, f.member(1)).scrims![0];
    const cell = revealed.teams[0].estimates.find(
      (e) =>
        e.ownId === target.ownId &&
        e.enemyId === f.scrim.teams[1].entries[0].id,
    )!;
    assert.equal(cell.scores.A, 17);
    assert.equal(cell.comments[0].text, "Secret preparation");
    assert.equal(
      revealed.teams[0].estimates.some((e) => e.enemyId.startsWith("db:")),
      false,
    );
    f.run(f.member(1), {
      type: "scrimEstimate",
      teamId: team.id,
      ownId: cell.ownId,
      enemyId: cell.enemyId,
      scores: { A: 19, B: 10, C: 9 },
    });
    assert.equal(
      viewState(f.s, f.member(2)).scrims![0].teams[0].estimates.find(
        (e) => e.ownId === cell.ownId && e.enemyId === cell.enemyId,
      )!.scores.A,
      19,
    );
    assert.equal(
      JSON.stringify(viewState(f.s, f.member(3))).includes(
        "Secret preparation",
      ),
      false,
    );
  });
});
test("scrim preparation includes shared army archives and historical configurations for its patch", () => {
  const f = fixture();
  f.s.games = [];
  f.fill();
  f.s.matrixLists = [];
  const publicArmy = armySnapshot(armyFor(2));
  const historicalArmy = armySnapshot(armyFor(3));
  const privateArmy = armySnapshot(armyFor(4));
  f.s.savedArmies = [
    {
      id: "archive-public",
      userId: "p3",
      patchId: f.scrim.patchId,
      army: publicArmy,
      shared: true,
      ownerName: "Archive author",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "archive-private",
      userId: "p3",
      patchId: f.scrim.patchId,
      army: privateArmy,
      shared: false,
      ownerName: "Private author",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "wrong-patch",
      userId: "p3",
      patchId: "other-patch",
      army: privateArmy,
      shared: true,
      ownerName: "Archive author",
      updatedAt: new Date().toISOString(),
    },
  ];
  f.s.matrixListHistory = [
    {
      patchId: f.scrim.patchId,
      army: historicalArmy,
      authorName: "Archive author",
      updatedAt: new Date().toISOString(),
    },
  ];
  const visible = viewState(f.s, f.member(1)).scrims![0];
  assert.deepEqual(
    new Set(visible.databaseEntries!.map((entry) => armyKey(entry.army!))),
    new Set(
      matchupDatabase(viewState(f.s, f.member(1)), f.scrim.patchId).armies.map(
        (entry) => entry.key,
      ),
    ),
  );
  assert.deepEqual(
    new Set(visible.databaseEntries!.map((e) => armyKey(e.army!))),
    new Set([armyKey(publicArmy), armyKey(historicalArmy)]),
  );
  assert.equal(visible.teams[0].estimates.length, 4);
  const target = visible.databaseEntries!.find(
    (e) => armyKey(e.army!) === armyKey(publicArmy),
  )!;
  f.run(f.member(1), {
    type: "scrimEstimate",
    teamId: f.scrim.teams[0].id,
    ownId: f.scrim.teams[0].entries[0].id,
    enemyId: target.id,
    scores: { A: 16, B: null, C: null },
  });
  assert.equal(
    viewState(f.s, f.member(2)).scrims![0].teams[0].estimates.find(
      (e) => e.enemyId === target.id,
    )!.scores.A,
    16,
  );
  assert.equal(
    viewState(f.s, f.member(3)).scrims![0].teams[0].estimates.length,
    0,
  );
});
test("preparation includes journal configurations visible in the member's main matrix without sharing private journals", () => {
  const f = fixture();
  f.fill();
  f.s.matrixLists = [];
  f.s.savedArmies = [];
  f.s.matrixListHistory = [];
  const journal = {
    ...f.s.games[0],
    id: "private-journal",
    userId: "p1",
    patchId: f.scrim.patchId,
    own: armySnapshot(armyFor(2)),
    enemy: armySnapshot(armyFor(3)),
    notes: "PRIVATE REFLECTION",
    score: 19,
  };
  f.s.games = [journal];
  const visible = viewState(f.s, f.member(1)).scrims![0];
  assert.deepEqual(
    new Set(visible.databaseEntries!.map((e) => armyKey(e.army!))),
    new Set([armyKey(journal.own), armyKey(journal.enemy)]),
  );
  const teammate = viewState(f.s, f.member(2));
  assert.equal(teammate.scrims![0].databaseEntries!.length, 0);
  assert.equal(JSON.stringify(teammate).includes("PRIVATE REFLECTION"), false);
  assert.ok(
    visible.teams[0].estimates.every((cell) =>
      Object.values(cell.scores).every((score) => score === null),
    ),
  );
  const enemyId = visible.databaseEntries!.find(
    (e) => armyKey(e.army!) === armyKey(journal.enemy),
  )!.id;
  f.run(f.member(1), {
    type: "scrimEstimate",
    teamId: f.scrim.teams[0].id,
    ownId: f.scrim.teams[0].entries[0].id,
    enemyId,
    scores: { A: 14, B: null, C: null },
  });
  assert.throws(
    () =>
      f.run(f.member(2), {
        type: "scrimEstimate",
        teamId: f.scrim.teams[0].id,
        ownId: f.scrim.teams[0].entries[0].id,
        enemyId,
        scores: { A: 1, B: 1, C: 1 },
      }),
    /public database/,
  );
});
test("deadline and finalization lock rosters/lists, including admin writes", () => {
  const f = fixture();
  f.fill();
  const team = f.scrim.teams[0];
  assert.throws(
    () =>
      f.run(f.admin, {
        type: "scrimSubmit",
        teamId: team.id,
        entryId: team.entries[0].id,
        army: armyFor(1),
      }),
    /Reopen/,
  );
  at(f.deadline + 1, () => {
    for (const command of [
      { type: "scrimRoster", teamId: team.id, entries: [] },
      {
        type: "scrimSubmit",
        teamId: team.id,
        entryId: team.entries[0].id,
        army: armyFor(1),
      },
      { type: "scrimFinalize", teamId: team.id, finalized: false },
    ])
      assert.throws(() => f.run(f.admin, command), /deadline/);
  });
});
test("pairings need all players once, valid sides and layouts; publication locks them", () => {
  const f = fixture();
  f.fill();
  const pairs = f.scrim.teams[0].entries.map((e, i) => ({
    aId: e.id,
    bId: f.scrim.teams[1].entries[i].id,
    layout: "B",
  }));
  assert.throws(
    () => f.run(f.admin, { type: "scrimPairings", pairings: pairs }),
    /deadline/,
  );
  at(f.deadline + 1, () => {
    assert.throws(
      () => f.run(f.member(2), { type: "scrimPairings", pairings: pairs }),
      /captains/,
    );
    assert.throws(
      () =>
        f.run(f.admin, {
          type: "scrimPairings",
          pairings: [pairs[0], pairs[0]],
        }),
      /exactly once/,
    );
    assert.throws(() =>
      f.run(f.admin, {
        type: "scrimPairings",
        pairings: pairs.map((p) => ({ ...p, layout: "D" })),
      }),
    );
    f.run(f.member(1), { type: "scrimPairings", pairings: pairs });
    assert.equal(
      f.scrim.pairings.every((p) => p.layout === "B"),
      true,
    );
    assert.throws(
      () => f.run(f.admin, { type: "scrimPairings", pairings: pairs }),
      /locked/,
    );
  });
});
test("one report atomically mirrors journals, preserves private notes and deduplicates known matches", () => {
  const f = fixture();
  f.fill();
  f.pair();
  f.report(0, 13, f.member(1), "a", "My private reflection");
  const games = f.s.games.filter((g) => g.scrimId === f.scrim.id);
  assert.equal(games.length, 2);
  assert.equal(games.find((g) => g.userId === "p1")!.score, 13);
  assert.equal(games.find((g) => g.userId === "p3")!.score, 7);
  assert.equal(games.find((g) => g.userId === "p3")!.notes, "");
  assert.equal(
    JSON.stringify(viewState(f.s, f.member(3))).includes(
      "My private reflection",
    ),
    false,
  );
  f.report(0, 9, f.member(3), "b", "Opponent private reflection");
  assert.equal(f.s.games.filter((g) => g.scrimId === f.scrim.id).length, 2);
  assert.equal(games.find((g) => g.userId === "p1")!.score, 11);
  assert.equal(
    games.find((g) => g.userId === "p1")!.notes,
    "My private reflection",
  );
  assert.equal(buildMatchups(games).included, 1);
  assert.equal(
    buildMatchups(games.filter((g) => g.userId === "p1")).included,
    1,
  );
});
test("result permissions, score validation and playing span are server enforced", () => {
  const f = fixture();
  f.fill();
  f.pair();
  assert.throws(() => f.report(0, 13, f.member(2)), /paired players/);
  assert.throws(() => f.report(0, 21));
  assert.throws(() => f.report(0, 10.5));
  assert.throws(
    () =>
      f.run(f.admin, {
        type: "scrimReport",
        pairingId: f.scrim.pairings[0].id,
        perspective: "a",
        score: 10,
        date: "2026-01-01",
      }),
    /pairing date has not arrived/,
  );
  at(f.start + 60_000, () =>
    assert.throws(
      () =>
        f.run(f.admin, {
          type: "scrimReport",
          pairingId: f.scrim.pairings[0].id,
          perspective: "a",
          score: 10,
          date: "2026-01-01",
        }),
      /within/,
    ),
  );
  f.report(0, 10, f.member(3), "a"); // opposing captain can act for a match
});
test("a scrim completes only after all results and uses the five-point difference draw band", () => {
  const f = fixture(8);
  f.fill();
  f.pair();
  for (let i = 0; i < 7; i++) f.report(i, 10);
  assert.equal(scrimScore(f.scrim).winner, null);
  f.report(7, 12);
  assert.equal(scrimScore(f.scrim).a, 82);
  assert.equal(scrimScore(f.scrim).b, 78);
  assert.equal(scrimScore(f.scrim).winner, "Draw");
  f.report(7, 13);
  assert.equal(scrimScore(f.scrim).winner, "Blue");
  assert.ok(
    at(f.start + 60_000, () =>
      viewState(f.s, f.member(20)),
    ).scrims![0].teams.every((t) => t.estimates.length === 64),
  );
  assert.equal(
    viewState(f.s, f.member(20)).games.some((g) => g.scrimId === f.scrim.id),
    false,
  );
});
test("stale writes cannot overwrite results and linked journals cannot be detached or deleted", () => {
  const f = fixture();
  f.fill();
  f.pair();
  const stale = f.scrim.revision;
  f.report(0, 10, f.member(1));
  assert.throws(
    () =>
      at(f.start + 60_000, () =>
        f.run(f.member(1), {
          type: "scrimReport",
          revision: stale,
          pairingId: f.scrim.pairings[0].id,
          perspective: "a",
          score: 20,
          date: stockholmLocal(new Date(f.start).toISOString()).slice(0, 10),
        }),
      ),
    /changed/,
  );
  const g = f.s.games.find(
    (g) => g.scrimId === f.scrim.id && g.userId === "p1",
  )!;
  assert.throws(
    () => f.run(f.member(1), { type: "deleteGame", id: g.id }),
    /cannot be deleted/,
  );
  assert.throws(
    () => f.run(f.member(1), { ...g, type: "game" }),
    /shared result/,
  );
  f.run(f.member(1), {
    type: "scrimJournalNotes",
    gameId: g.id,
    notes: "Private note only",
  });
  assert.equal(g.score, 10);
  assert.throws(
    () =>
      f.run(f.member(2), {
        type: "scrimJournalNotes",
        gameId: g.id,
        notes: "intrusion",
      }),
    /own journal/,
  );
});
test("external teams need no accounts and only portal players receive journals", () => {
  const f = fixture(2, "external");
  f.fill();
  assert.equal(f.scrim.teams[1].estimates.length, 0);
  f.pair();
  f.report(0, 14, f.member(1));
  const games = f.s.games.filter((g) => g.scrimId === f.scrim.id);
  assert.equal(games.length, 1);
  assert.equal(games[0].opponent, "External 1");
  assert.equal(games[0].opponentUserId, undefined);
  assert.equal(f.s.savedArmies!.filter((a) => !a.userId).length, 0);
});
test("match comments are public scrim data, planning stays private and cancellation preserves history", () => {
  const f = fixture();
  f.fill();
  f.pair();
  f.report(0, 10);
  const cmd = {
    type: "scrimMatchComment",
    pairingId: f.scrim.pairings[0].id,
    text: "Finished on time",
  };
  assert.throws(() => f.run(f.member(2), cmd), /paired players/);
  f.run(f.member(1), cmd);
  assert.ok(
    JSON.stringify(viewState(f.s, f.member(20)).scrims).includes(
      "Finished on time",
    ),
  );
  f.run(f.admin, { type: "scrimCancel" });
  assert.ok(f.scrim.cancelled);
  assert.equal(f.s.games.filter((g) => g.scrimId === f.scrim.id).length, 2);
  assert.throws(() => f.report(1, 10), /cancelled/);
});
test("transaction rollback retains history when a scrim write fails", () => {
  const before = JSON.stringify(readState());
  assert.throws(() =>
    transaction((s) => {
      s.users[0].name = "Should roll back";
      execute(s, s.users[0], { type: "scrimCreate" });
    }),
  );
  assert.equal(JSON.stringify(readState()), before);
});

test("admins replace and add captains and non-playing coaches with revision and team boundaries", () => {
  const f = fixture();
  f.fill();
  const team = f.scrim.teams[0],
    other = f.scrim.teams[1];
  const command = {
    type: "scrimStaff",
    teamId: team.id,
    captainId: f.member(13).id,
    additionalCaptainIds: [f.member(14).id],
    coachIds: [f.member(15).id],
  };
  assert.throws(() => f.run(f.member(1), command), /Only admins/);
  assert.throws(
    () => f.run(f.admin, { ...command, coachIds: [team.entries[0].userId] }),
    /non-playing/,
  );
  assert.throws(
    () => f.run(f.admin, { ...command, captainId: other.captainId }),
    /opposing/,
  );
  assert.throws(
    () => f.run(f.admin, { ...command, coachIds: [f.member(14).id] }),
    /only one staff/,
  );
  const entries = structuredClone(team.entries);
  at(f.deadline + 1, () => f.run(f.admin, command));
  assert.deepEqual(team.entries, entries);
  assert.equal(team.captainId, f.member(13).id);
  assert.equal(team.additionalCaptains![0].userId, f.member(14).id);
  assert.equal(team.coaches![0].userId, f.member(15).id);
  f.run(f.member(14), {
    type: "scrimTeamName",
    teamId: team.id,
    name: "Captain renamed",
  });
  assert.throws(
    () =>
      f.run(f.member(15), {
        type: "scrimTeamName",
        teamId: team.id,
        name: "Coach renamed",
      }),
    /captain or an admin/,
  );
  execute(f.s, f.admin, {
    type: "matrixList",
    patchId: f.scrim.patchId,
    army: armyFor(0),
  });
  const own = team.entries[0];
  const enemy = viewState(f.s, f.member(15)).scrims![0].databaseEntries![0];
  f.run(f.member(15), {
    type: "scrimPlanComment",
    teamId: team.id,
    ownId: own.id,
    enemyId: enemy.id,
    text: "Private coach analysis",
  });
  assert.ok(
    viewState(f.s, f.member(15)).scrims![0].teams[0].estimates.some(
      (estimate) =>
        estimate.comments.some(
          (comment) => comment.text === "Private coach analysis",
        ),
    ),
  );
  assert.equal(
    viewState(f.s, f.member(3)).scrims![0].teams[0].estimates.length,
    0,
  );
  f.run(f.admin, { ...command, coachIds: [], additionalCaptainIds: [] });
  assert.equal(
    viewState(f.s, f.member(15)).scrims![0].teams[0].estimates.length,
    0,
  );
  assert.throws(() => f.run(f.admin, { ...command, revision: 0 }), /changed/);
});
