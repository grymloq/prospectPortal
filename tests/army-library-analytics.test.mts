import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  Army,
  ArmyListVersion,
  Game,
  Scrim,
  State,
  User,
} from "../src/lib/types";
import { libraryContextId, queryArmyLibrary } from "../src/server/army-library";
import { catalogue } from "../src/lib/catalogue";
import {
  archetypeId,
  classifyLibraryVersion,
  normalizeRosterIdentity,
  ROSTER_NORMALIZATION_VERSION,
  consolidationPreview,
  applyConsolidation,
} from "../src/server/army-library-identity";
import {
  libraryMetrics,
  type LibraryObservation,
} from "../src/lib/army-library-analytics";

function user(id: string, role: User["role"] = "member"): User {
  return {
    id,
    name: `Public ${id}`,
    email: `${id}@private.invalid`,
    role,
    confirmedMember: true,
    faction: "f",
    city: "",
    bio: "",
    phaseId: null,
    rejected: false,
    application: "",
  };
}
function army(unit = "tank", faction = "f"): Army {
  return {
    faction,
    factionName: `Faction ${faction}`,
    detachments: ["d"],
    detachmentNames: ["Detachment"],
    disposition: "p",
    dispositionName: "Disposition",
    listUrl: "https://newrecruit.eu/list/test",
    revision: 1,
    listName: `List ${unit}`,
    composition: normalizeRosterIdentity({
      status: "complete",
      normalizationVersion: ROSTER_NORMALIZATION_VERSION,
      selections: [
        {
          sourceId: `newrecruit:system:catalogue:${unit}`,
          name: unit,
          kind: "unit",
          quantity: 1,
          selections: [],
        },
      ],
      reasons: [],
      source: {
        provider: "newrecruit",
        systemId: "system",
        catalogueId: "catalogue",
      },
    }),
  };
}
function fixture() {
  const a = user("a"),
    b = user("b"),
    admin = user("admin", "admin");
  const state: State = {
    users: [a, b, admin],
    phases: [],
    games: [],
    evaluations: [],
    messages: [],
    goals: [],
    events: [],
    applications: [],
    audit: [],
    savedArmies: [],
    armyVersions: [],
    libraryMemberships: [],
    patches: [
      { id: "p1", name: "Patch 1", date: "2026-09-01" },
      { id: "p2", name: "Patch 2", date: "2026-10-01" },
    ],
    defaultPatchId: "p1",
  };
  addList(state, "list-a", a, army());
  addList(state, "list-b", b, army());
  return { state, a, b, admin };
}
function addList(
  state: State,
  id: string,
  owner: User,
  configuration: Army,
  patchId = "p1",
) {
  const version: ArmyListVersion = {
    id: `${id}:v1`,
    listId: id,
    userId: owner.id,
    number: 1,
    patchId,
    army: configuration,
    createdAt: "2026-09-01T10:00:00Z",
    published: true,
  };
  state.savedArmies!.push({
    id,
    userId: owner.id,
    ownerName: owner.name,
    patchId,
    army: configuration,
    currentVersionId: version.id,
    listRevision: 1,
    shared: true,
    updatedAt: version.createdAt,
  });
  state.armyVersions!.push(version);
  state.libraryMemberships!.push(classifyLibraryVersion(version));
  return version;
}
function game(id: string, userId = "a", overrides: Partial<Game> = {}): Game {
  return {
    id,
    userId,
    date: "2026-09-10",
    own: army(),
    enemy: army("private-unit", "enemy"),
    score: 16,
    outcome: "Win",
    opponent: "PRIVATE OPPONENT",
    opponentUserId: "private-id",
    notes: "PRIVATE NOTES",
    context: "PRIVATE EVENT",
    eventId: "private-event",
    updatedAt: "2026-09-10T10:00:00Z",
    patchId: "p1",
    ownListVersionId: `list-${userId}:v1`,
    libraryContribution: true,
    ...overrides,
  };
}
const detail = (state: State, actor: User, id = "list-a", more = {}) =>
  queryArmyLibrary(state, actor, { target: { kind: "list", id }, ...more })
    .detail!;

test("public identical rosters remain two lists and one variation with no invented no-game performance", () => {
  const { state, a } = fixture();
  const result = queryArmyLibrary(state, a, { tab: "archetypes" });
  assert.equal(result.total, 1);
  assert.equal(result.archetypes[0].publicLists, 2);
  assert.equal(result.archetypes[0].variations, 1);
  assert.equal(result.archetypes[0].metrics.averageScore, null);
  assert.equal(result.archetypes[0].metrics.winRate, null);
  assert.equal(detail(state, a).variations[0].leading, false);
});

test("list references stay specific while variation comparison pools public identical versions", () => {
  const { state, a } = fixture();
  state.games = [
    game("a1", "a", { score: 20 }),
    game("b1", "b", { score: 0 }),
    game("b2", "b", { score: 0 }),
    game("legacy", "a", { ownListVersionId: undefined, score: 0 }),
  ];
  const list = detail(state, a);
  assert.equal(list.metrics.averageScore, 20);
  assert.equal(list.metrics.appearances, 1);
  assert.equal(list.variations[0].metrics.averageScore, 20 / 3);
  const archetype = queryArmyLibrary(state, a, { tab: "archetypes" })
    .archetypes[0];
  assert.equal(archetype.metrics.averageScore, 5);
  assert.equal(archetype.metrics.appearances, 4);
});

test("sharing never opts private journals in and shared admin/member DTOs match", () => {
  const { state, a, admin } = fixture();
  state.games = [
    game("private", "a", { libraryContribution: undefined }),
    game("withdrawn", "a", { libraryContribution: false }),
  ];
  assert.equal(detail(state, a).metrics.appearances, 0);
  assert.deepEqual(
    queryArmyLibrary(state, admin, {}),
    queryArmyLibrary(state, a, {}),
  );
});

test("consent only exposes controlled facts and independently public enemy dimensions", () => {
  const { state, a, b } = fixture();
  state.games = [
    game("one", "a", { enemy: army("tank"), enemyListVersionId: undefined }),
  ];
  let dto = queryArmyLibrary(state, a, {
    target: { kind: "list", id: "list-a" },
  });
  const serialized = JSON.stringify(dto);
  for (const secret of [
    "PRIVATE OPPONENT",
    "private-id",
    "PRIVATE NOTES",
    "PRIVATE EVENT",
    "private-event",
    a.email,
    b.email,
  ])
    assert.ok(!serialized.includes(secret), secret);
  assert.ok(
    !dto.detail!.matchups.some(
      (row) => row.dimension === "list" || row.dimension === "variation",
    ),
  );
  state.games[0].enemyListVersionId = "list-b:v1";
  dto = queryArmyLibrary(state, a, { target: { kind: "list", id: "list-a" } });
  assert.ok(
    dto.detail!.matchups.some(
      (row) => row.dimension === "list" && row.id === "list-b",
    ),
  );
});

test("withdrawn versions, deleted lists and removed owners disappear from sources, counts and facts", () => {
  const { state, a, b } = fixture();
  state.games = [game("b", "b")];
  state.savedArmies![1].shared = false;
  assert.equal(
    queryArmyLibrary(state, a, { tab: "archetypes" }).archetypes[0].metrics
      .appearances,
    0,
  );
  assert.throws(() => detail(state, a, "list-b"), /unavailable/);
  state.savedArmies![1].shared = true;
  b.removedAt = "2026-10-01";
  assert.equal(queryArmyLibrary(state, a, {}).total, 1);
  assert.throws(() => queryArmyLibrary(state, b, {}), /membership/);
  state.savedArmies = [];
  assert.equal(queryArmyLibrary(state, a, {}).total, 0);
});

test("private historical versions stay hidden even when the current version is published", () => {
  const { state, a } = fixture();
  const hidden = {
    ...state.armyVersions![0],
    id: "hidden-v0",
    number: 0,
    published: false,
    army: army("SECRET HISTORICAL ROSTER"),
  };
  state.armyVersions!.push(hidden);
  state.libraryMemberships!.push(classifyLibraryVersion(hidden));
  assert.equal(detail(state, a).versions.length, 1);
  assert.throws(
    () => detail(state, a, "list-a", { versionId: hidden.id }),
    /unavailable/,
  );
  assert.ok(
    !JSON.stringify(
      queryArmyLibrary(state, a, {
        patchId: "all",
        target: { kind: "list", id: "list-a" },
      }),
    ).includes("SECRET HISTORICAL ROSTER"),
  );
});

test("canonical ordinary reports are explicit, grouped once and conflicting scores excluded", () => {
  const { state, a } = fixture();
  state.games = [
    game("one", "a", { canonicalMatchId: "linked", enemy: army(), score: 16 }),
    game("two", "b", { canonicalMatchId: "linked", enemy: army(), score: 4 }),
  ];
  let result = queryArmyLibrary(state, a, {
    target: { kind: "archetype", id: archetypeId(army(), "p1") },
  }).detail!;
  assert.equal(result.metrics.recordedMatches, 1);
  assert.equal(result.metrics.appearances, 2);
  assert.equal(result.metrics.wins, 1);
  assert.equal(result.metrics.losses, 1);
  assert.equal(result.metrics.draws, 0);
  assert.equal(result.matchups[0].mirror, true);
  state.games[1].score = 6;
  result = queryArmyLibrary(state, a, {
    target: { kind: "archetype", id: archetypeId(army(), "p1") },
  }).detail!;
  assert.equal(result.metrics.recordedMatches, 0);
  assert.equal(result.coverage.conflicts, 1);
  state.games = [game("one"), game("two")];
  assert.equal(detail(state, a).metrics.recordedMatches, 2);
});

test("same-side canonical duplicate reports do not increase samples and contradictory context is excluded", () => {
  const { state, a } = fixture();
  state.games = [
    game("one", "a", { canonicalMatchId: "same" }),
    game("two", "a", { canonicalMatchId: "same" }),
  ];
  assert.equal(detail(state, a).metrics.appearances, 1);
  state.games[1].score = 14;
  assert.equal(detail(state, a).metrics.appearances, 0);
  assert.equal(detail(state, a).coverage.conflicts, 1);
});

test("manual estimates and matrix history do not add played games or public list rows; linked sources deduplicate", () => {
  const { state, a } = fixture();
  state.matrixListHistory = [
    {
      authorName: "HISTORY ONLY",
      patchId: "p1",
      army: army("history"),
      updatedAt: "2026-09-01",
    },
  ];
  state.matrixLists = [
    {
      id: "linked",
      userId: "a",
      patchId: "p1",
      army: army(),
      authorName: "a",
      updatedAt: "2026-09-01",
    },
    {
      id: "matrix",
      userId: "a",
      patchId: "p1",
      army: { ...army("matrix"), listUrl: "" },
      authorName: "a",
      updatedAt: "2026-09-01",
    },
  ];
  state.manualEstimates = [
    {
      userId: "a",
      patchId: "p1",
      row: "x",
      column: "y",
      layout: "A",
      score: 20,
      updatedAt: "today",
      authorName: "a",
    },
  ];
  const result = queryArmyLibrary(state, a, {});
  assert.equal(result.total, 3);
  assert.equal(
    result.lists.find((row) => row.kind === "matrix")!.compositionStatus,
    "unavailable",
  );
  assert.equal(
    result.lists.find((row) => row.kind === "matrix")!.army.composition,
    undefined,
  );
  assert.equal(detail(state, a).metrics.recordedMatches, 0);
});

test("missing context affects only filters requiring it; filters and leaders share scope", () => {
  const { state, a } = fixture();
  state.games = Array.from({ length: 10 }, (_, i) =>
    game(`g${i}`, "a", {
      gameContext:
        i < 9
          ? {
              version: "1",
              deployment: {
                id: "deploy",
                name: "Deployment",
                version: "mapping-1",
              },
              ownMission: { id: "mission", name: "Mission", version: "pack-1" },
            }
          : undefined,
    }),
  );
  assert.equal(detail(state, a).metrics.appearances, 10);
  assert.equal(detail(state, a).variations[0].leading, true);
  const scoped = detail(state, a, "list-a", {
    deploymentId: libraryContextId({
      id: "deploy",
      name: "Deployment",
      version: "mapping-1",
    }),
    missionId: libraryContextId({
      id: "mission",
      name: "Mission",
      version: "pack-1",
    }),
    opponentFaction: "enemy",
  });
  assert.equal(scoped.metrics.appearances, 9);
  assert.equal(scoped.variations[0].leading, false);
  assert.equal(scoped.trends[0].metrics.appearances, 9);
  assert.equal(detail(state, a).coverage.missingDeployment, 1);
  assert.equal(
    detail(state, a, "list-a", { dateFrom: "2026-09-11" }).metrics.appearances,
    0,
  );
});

test("all-ruleset histories preserve patch boundaries without silently pooled performance", () => {
  const { state, a } = fixture();
  const next = addList(state, "next", a, army("next"), "p2");
  state.games = [
    game("old", "a", { score: 20 }),
    game("next", "a", {
      own: next.army,
      ownListVersionId: next.id,
      patchId: "p2",
      date: "2026-10-02",
      score: 0,
    }),
  ];
  assert.equal(queryArmyLibrary(state, a, {}).total, 2);
  const all = queryArmyLibrary(state, a, { patchId: "all" });
  assert.equal(all.total, 3);
  assert.ok(all.lists.every((row) => row.metrics.averageScore === null));
  const list = detail(state, a, "next", { patchId: "all" });
  assert.equal(list.metrics.averageScore, null);
  assert.equal(list.segments[0].metrics.averageScore, 0);
  assert.equal(list.trends[0].patchId, "p2");
});

test("pagination, filtering and stable sorting stay purpose-specific without changing source state", () => {
  const { state, a } = fixture();
  const before = JSON.stringify(state);
  const result = queryArmyLibrary(state, a, { page: 2, pageSize: 1 });
  assert.equal(result.total, 2);
  assert.equal(result.lists.length, 1);
  assert.equal(result.archetypes.length, 0);
  assert.equal(result.lists[0].id, "list-b");
  assert.equal(result.facets.factions.length, 1);
  assert.equal(
    queryArmyLibrary(state, a, { search: "does not exist" }).total,
    0,
  );
  assert.equal(JSON.stringify(state), before);
});

test("library facets cascade by faction and the complete selected detachment combination", () => {
  const { state, a, b, admin } = fixture();
  const configuration = (
    faction: string,
    detachments: string[],
    disposition: string,
  ): Army => ({
    ...army("filter", faction),
    detachments,
    detachmentNames: detachments.map((id) => `Detachment ${id}`),
    disposition,
    dispositionName: `Disposition ${disposition}`,
  });
  addList(state, "first", a, configuration("f", ["x"], "p2"));
  addList(state, "combination", b, configuration("f", ["d", "x"], "p3"));
  addList(state, "foreign", b, configuration("g", ["foreign", "x"], "p4"));
  addList(state, "next-patch", b, configuration("f", ["future"], "p5"), "p2");
  const hidden = addList(
    state,
    "private",
    b,
    configuration("f", ["secret"], "private"),
  );
  hidden.published = false;
  state.savedArmies!.find((list) => list.id === hidden.listId)!.shared = false;
  const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();
  const before = JSON.stringify(state);
  for (const tab of ["lists", "archetypes"] as const) {
    for (const actor of [a, admin]) {
      const base = queryArmyLibrary(state, actor, { tab, faction: "f" });
      assert.deepEqual(ids(base.facets.factions), ["f", "g"]);
      assert.deepEqual(ids(base.facets.detachments), ["d", "x"]);
      assert.deepEqual(ids(base.facets.dispositions), ["p", "p2", "p3"]);
      const one = queryArmyLibrary(state, actor, {
        tab,
        faction: "f",
        detachments: ["x"],
        disposition: "p2",
        search: "no matching text",
        pageSize: 1,
      });
      assert.equal(one.total, 0);
      assert.deepEqual(ids(one.facets.detachments), ["d", "x"]);
      assert.deepEqual(ids(one.facets.dispositions), ["p2", "p3"]);
      const combination = queryArmyLibrary(state, actor, {
        tab,
        faction: "f",
        detachments: ["d", "x"],
      });
      assert.deepEqual(ids(combination.facets.dispositions), ["p3"]);
      assert.deepEqual(
        queryArmyLibrary(state, actor, {
          tab,
          faction: "f",
          detachments: ["foreign"],
        }).facets.dispositions,
        [],
      );
      assert.deepEqual(
        ids(
          queryArmyLibrary(state, actor, {
            tab,
            patchId: "all",
            faction: "f",
          }).facets.detachments,
        ),
        ["d", "future", "x"],
      );
    }
  }
  assert.equal(JSON.stringify(state), before);
});

test("published historical configurations remain available to dependent filters", () => {
  const { state, a } = fixture();
  const historical = state.armyVersions!.find(
    (version) => version.listId === "list-a",
  )!;
  const current: ArmyListVersion = {
    ...historical,
    id: "list-a:v2",
    number: 2,
    army: {
      ...army("new", "g"),
      detachments: ["new"],
      detachmentNames: ["New detachment"],
      disposition: "new-disposition",
      dispositionName: "New disposition",
    },
  };
  state.armyVersions!.push(current);
  state.libraryMemberships!.push(classifyLibraryVersion(current));
  Object.assign(
    state.savedArmies!.find((list) => list.id === "list-a")!,
    {
      army: current.army,
      currentVersionId: current.id,
      listRevision: 2,
    },
  );
  const old = queryArmyLibrary(state, a, { faction: "f", detachments: ["d"] });
  assert.deepEqual(
    old.facets.detachments.map((row) => row.id),
    ["d"],
  );
  assert.deepEqual(
    old.facets.dispositions.map((row) => row.id),
    ["p"],
  );
  const next = queryArmyLibrary(state, a, {
    faction: "g",
    detachments: ["new"],
  });
  assert.deepEqual(
    next.facets.detachments.map((row) => row.id),
    ["new"],
  );
  assert.deepEqual(
    next.facets.dispositions.map((row) => row.id),
    ["new-disposition"],
  );
});

test("uncertainty groups dependent mirror appearances and accounts for unequal match weights", () => {
  const base = {
    contributorId: "a",
    patchId: "p1",
    date: "2026-09-10",
    army: army(),
    archetypeId: "archetype",
    opponentFaction: "f",
    opponentFactionName: "Faction",
  };
  const observations: LibraryObservation[] = [
    { ...base, matchId: "one", sideId: "a", score: 20 },
    { ...base, matchId: "one", sideId: "b", score: 0 },
    { ...base, matchId: "two", sideId: "a", score: 20 },
  ];
  const result = libraryMetrics(observations);
  assert.equal(result.recordedMatches, 2);
  assert.equal(result.appearances, 3);
  assert.equal(result.averageScore, 40 / 3);
  const radius = 20 * Math.sqrt((Math.log(40) / 2) * (4 / 9 + 1 / 9));
  assert.deepEqual(result.scoreInterval, [
    Math.max(0, 40 / 3 - radius),
    Math.min(20, 40 / 3 + radius),
  ]);
});

test("good/bad classifications require an uncertainty interval excluding neutral score", () => {
  const { state, a } = fixture();
  state.games = [game("one", "a", { score: 20 })];
  assert.equal(detail(state, a).matchups[0].classification, "uncertain");
  state.games = Array.from({ length: 20 }, (_, i) =>
    game(`win-${i}`, "a", { score: 20 }),
  );
  assert.equal(detail(state, a).matchups[0].classification, "good");
  state.games.forEach((g) => (g.score = 0));
  assert.equal(detail(state, a).matchups[0].classification, "bad");
});

test("hidden scrim matches contribute no facts; revealed canonical sides use authoritative score/context", () => {
  const { state, a, b } = fixture();
  const scrim = {
    id: "scrim",
    eventId: "secret-event",
    revision: 1,
    kind: "internal" as const,
    teamSize: 1,
    patchId: "p1",
    submissionDeadline: "2026-09-01T10:00:00Z",
    teams: [
      {
        id: "ta",
        name: "ta",
        external: false,
        captainId: a.id,
        captainName: a.name,
        entries: [
          {
            id: "ea",
            userId: a.id,
            name: a.name,
            army: army(),
            listVersionId: "list-a:v1",
          },
        ],
        estimates: [],
        finalizedAt: "2026-09-01",
      },
      {
        id: "tb",
        name: "tb",
        external: false,
        captainId: b.id,
        captainName: b.name,
        entries: [
          {
            id: "eb",
            userId: b.id,
            name: b.name,
            army: army(),
            listVersionId: "list-b:v1",
          },
        ],
        estimates: [],
        finalizedAt: undefined,
      },
    ] as Scrim["teams"],
    pairings: [
      {
        id: "pair",
        round: 1,
        aId: "ea",
        bId: "eb",
        layout: "A" as const,
        scoreA: 18,
        date: "2026-09-10",
        comments: [],
        gameContext: {
          version: "1" as const,
          ownMission: { id: "a-mission", name: "A mission", version: "1" },
          enemyMission: { id: "b-mission", name: "B mission", version: "1" },
        },
      },
    ],
  };
  state.scrims = [scrim];
  state.games = [
    game("a", "a", { score: 3, scrimId: scrim.id, scrimPairingId: "pair" }),
    game("b", "b", { score: 17, scrimId: scrim.id, scrimPairingId: "pair" }),
    game("dup", "a", { scrimId: scrim.id, scrimPairingId: "pair" }),
  ];
  assert.equal(detail(state, a).metrics.recordedMatches, 0);
  scrim.teams[1].finalizedAt = "2026-09-01";
  const archetype = queryArmyLibrary(state, a, {
    target: { kind: "archetype", id: archetypeId(army(), "p1") },
  }).detail!;
  assert.equal(archetype.metrics.recordedMatches, 1);
  assert.equal(archetype.metrics.appearances, 2);
  assert.equal(archetype.metrics.wins, 1);
  assert.equal(archetype.metrics.losses, 1);
  assert.equal(detail(state, a).metrics.averageScore, 18);
  assert.equal(detail(state, b, "list-b").metrics.averageScore, 2);
  assert.equal(
    detail(state, b, "list-b", {
      missionId: libraryContextId({
        id: "b-mission",
        name: "B mission",
        version: "1",
      }),
    }).metrics.appearances,
    1,
  );
  scrim.submissionDeadline = new Date(Date.now() + 60_000).toISOString();
  assert.equal(detail(state, a).metrics.recordedMatches, 0);
});

test("team-application rejection does not revoke confirmed membership or public contributions", () => {
  const { state, a } = fixture();
  a.rejected = true;
  state.games = [game("one")];
  assert.equal(queryArmyLibrary(state, a, {}).total, 2);
  assert.equal(detail(state, a).metrics.recordedMatches, 1);
});

test("live list labels/source updates retain historical snapshots and version selector options", () => {
  const { state, a } = fixture();
  const previous = state.armyVersions![0];
  const next = { ...previous, id: "list-a:v2", number: 2, army: army("next") };
  state.armyVersions!.push(next);
  state.libraryMemberships!.push(classifyLibraryVersion(next));
  state.savedArmies![0].currentVersionId = next.id;
  state.savedArmies![0].army = {
    ...next.army,
    listName: "Renamed live list",
    listUrl: "https://newrecruit.eu/list/now",
  };
  const selected = detail(state, a, "list-a", { versionId: previous.id });
  assert.equal(selected.name, "Renamed live list");
  assert.equal(selected.currentSourceUrl, "https://newrecruit.eu/list/now");
  assert.equal(selected.versions.length, 2);
  assert.equal(selected.army.listName, previous.army.listName);
  assert.equal(selected.army.listUrl, previous.army.listUrl);
});

test("same faction alone never invents an exact-archetype mirror", () => {
  const { state, a } = fixture();
  state.games = [
    game("one", "a", {
      enemy: {
        ...army(),
        disposition: "private-disposition",
        dispositionName: "PRIVATE DISPOSITION",
      },
    }),
  ];
  const result = detail(state, a);
  assert.equal(result.matchups[0].mirror, false);
  assert.ok(!JSON.stringify(result).includes("PRIVATE DISPOSITION"));
});

test("large archetype details page all related lists/variations/version history with complete totals", () => {
  const { state, a } = fixture();
  for (let i = 0; i < 200; i++)
    addList(state, `extra-${i}`, a, army(`unit-${i}`));
  const target = { kind: "archetype" as const, id: archetypeId(army(), "p1") };
  const first = queryArmyLibrary(state, a, { target }).detail!;
  assert.equal(first.relatedPagination!.lists, 202);
  assert.equal(first.relatedPagination!.variations, 201);
  assert.equal(first.relatedPagination!.versions, 202);
  assert.equal(first.lists.length, 20);
  assert.equal(first.variations.length, 20);
  assert.equal(first.versions.length, 20);
  const seen = {
    lists: new Set<string>(),
    versions: new Set<string>(),
    variations: new Set<string>(),
  };
  for (
    let relatedPage = 1;
    relatedPage <= first.relatedPagination!.totalPages;
    relatedPage++
  ) {
    const page = queryArmyLibrary(state, a, { target, relatedPage }).detail!;
    page.lists.forEach((row) => seen.lists.add(row.id));
    page.versions.forEach((row) => seen.versions.add(row.id));
    page.variations.forEach((row) => seen.variations.add(row.id));
    assert.ok(page.lists.every((row) => !row.army.composition));
    assert.ok(
      page.versions.every(
        (row) => row.army.composition?.selections.length === 0,
      ),
    );
  }
  assert.equal(seen.lists.size, 202);
  assert.equal(seen.versions.size, 202);
  assert.equal(seen.variations.size, 201);
});

test("compact recent trends use the latest nonempty periods of a single patch and scoped counts", () => {
  const { state, a } = fixture();
  state.games = [
    game("previous", "a", { date: "2026-08-10", score: 8 }),
    game("current", "a", { date: "2026-10-01", score: 16 }),
  ];
  const row = queryArmyLibrary(state, a, {}).lists.find(
    (row) => row.id === "list-a",
  )!;
  assert.deepEqual(row.recentTrend, {
    change: 8,
    from: "2026-08",
    to: "2026-10",
    previousMatches: 1,
    currentMatches: 1,
  });
  assert.equal(
    queryArmyLibrary(state, a, { patchId: "all" }).lists[0].recentTrend,
    undefined,
  );
  assert.equal(
    queryArmyLibrary(state, a, { dateFrom: "2026-09-01" }).lists[0].recentTrend,
    undefined,
  );
});

test("mission/deployment dimensions preserve pack/source/reference versions instead of pooling equal raw IDs", () => {
  const { state, a } = fixture();
  const pack = {
    id: "pack",
    name: "Mission pack",
    version: "2026",
    source: "official",
  };
  const ref = {
    id: "mission",
    name: "Mission",
    version: "1",
    source: "official",
  };
  state.games = [
    game("one", "a", {
      gameContext: { version: "1", missionPack: pack, ownMission: ref },
    }),
    game("two", "a", {
      gameContext: {
        version: "1",
        missionPack: { ...pack, version: "2027" },
        ownMission: ref,
      },
    }),
    game("three", "a", {
      gameContext: {
        version: "1",
        missionPack: pack,
        ownMission: { ...ref, version: "2" },
      },
    }),
  ];
  const matchups = detail(state, a).matchups.filter(
    (row) => row.dimension === "mission",
  );
  assert.equal(matchups.length, 3);
  assert.equal(new Set(matchups.map((row) => row.id)).size, 3);
  assert.ok(matchups.every((row) => row.metrics.appearances === 1));
  assert.equal(
    detail(state, a, "list-a", { missionId: libraryContextId(ref, pack) })
      .metrics.appearances,
    1,
  );
});

test("legacy and newly imported same-patch configurations group together and retain authorized old links", () => {
  const { state, a, admin } = fixture();
  state.patches![0].catalogue = catalogue;
  for (const version of state.armyVersions!) delete version.army.composition;
  state.armyVersions![1].army.scope = { systemId: String(catalogue.systemId) };
  state.libraryMemberships = state.armyVersions!.map((version) =>
    classifyLibraryVersion(version),
  );
  const oldImportedId = state.libraryMemberships[1].archetypeId;
  const originalSources = structuredClone({
    versions: state.armyVersions,
    lists: state.savedArmies,
  });
  const dto = queryArmyLibrary(state, a, { patchId: "p1", tab: "archetypes" });
  assert.equal(dto.archetypes.length, 1);
  assert.equal(dto.archetypes[0].publicLists, 2);
  assert.equal(dto.archetypes[0].variations, 0);
  assert.equal(dto.archetypes[0].unclassifiedLists, 2);
  const oldDetail = queryArmyLibrary(state, a, {
    patchId: "p1",
    target: { kind: "archetype", id: oldImportedId },
  });
  assert.equal(oldDetail.detail!.target.id, dto.archetypes[0].id);
  const preview = consolidationPreview(state, admin);
  assert.equal(preview.membershipChanges, 1);
  applyConsolidation(state, admin, preview.sourceRevision);
  assert.equal(
    state.libraryMemberships[0].archetypeId,
    state.libraryMemberships[1].archetypeId,
  );
  assert.deepEqual(
    { versions: state.armyVersions, lists: state.savedArmies },
    originalSources,
  );
  assert.equal(consolidationPreview(state, admin).membershipChanges, 0);
  state.savedArmies![1].shared = false;
  assert.throws(
    () =>
      queryArmyLibrary(state, a, {
        patchId: "p1",
        target: { kind: "archetype", id: oldImportedId },
      }),
    /unavailable/,
  );
});
