import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogue } from "../src/lib/catalogue";
import type { Army, MatrixList, State, User } from "../src/lib/types";
import { armyFromNewRecruit } from "../src/server/newrecruit-army";
import { ensureArmyLibrary } from "../src/server/army-library-versions";
import { archetypeId } from "../src/server/army-library-identity";
import {
  inventoryLibraryRosterSources,
  importLibraryRosters,
  applyLibraryRosterImports,
  importedMatrixArmy,
} from "../src/server/army-library-import";

const faction = catalogue.factions.find((row) => row.name === "Orks")!;
const detachment = faction.detachments.find((row) => row.name === "Dread Mob")!;
const disposition = catalogue.dispositions.find(
  (row) => row.name === "Purge the Foe",
)!;
const url = "https://www.newrecruit.eu/app/list/import-fixture";
type Option = {
  name: string;
  option_id: string;
  options: Option[];
  amount?: number;
  catalogue_id?: string;
  associated?: unknown;
  type?: string;
};
const option = (
  name: string,
  id: string,
  options: Option[] = [],
  amount?: number,
): Option => ({
  name,
  option_id: id,
  options,
  ...(amount === undefined ? {} : { amount }),
});
function payload() {
  const roster = option("Army Roster", "roster", [
    option("Configuration", "config", [
      option("Detachment", "detachments", [
        option(detachment.name, detachment.id, [], 1),
      ]),
      option("Force Disposition", "dispositions", [
        option(disposition.name, disposition.id, [], 1),
      ]),
      option("Battle Size", "battle-size", [
        option("Strike Force", "2000", [], 1),
      ]),
    ]),
    option("Infantry", "category", [
      option(
        "Fixture unit",
        "unit",
        [
          option("Models", "model-group", [
            {
              ...option(
                "Fixture model",
                "model",
                [option("Weapon", "weapon", [], 1)],
                5,
              ),
              type: "model",
            },
          ]),
        ],
        2,
      ),
    ]),
  ]);
  roster.catalogue_id = "verified-bs-catalogue";
  roster.options[1].options[0].associated = [
    { uid: "selected-leader-instance", label: "Leading", amount: 1 },
  ];
  return {
    id_system: catalogue.systemId,
    id_book: faction.id,
    nrversion: 3,
    books_revision: ["Main faction: 7", "Unselected shared library: 2"],
    army: option("Current external name", "army", [
      option("Faction", "faction-container", [roster]),
    ]),
  };
}
const imported = () => armyFromNewRecruit(payload(), url, catalogue);
function fixture() {
  const admin = {
    id: "admin",
    name: "Admin",
    role: "admin",
    confirmedMember: true,
  } as User;
  const member = {
    id: "member",
    name: "Member",
    role: "member",
    confirmedMember: true,
  } as User;
  const army: Army = {
    ...imported(),
    listName: "Stored original name",
    composition: undefined,
    scope: undefined,
  };
  const matrix: MatrixList = {
    id: "matrix",
    userId: member.id,
    patchId: "patch",
    army: structuredClone(army),
    authorName: member.name,
    updatedAt: "2026-10-08T09:00:00.000Z",
  };
  const state: State = {
    users: [admin, member],
    phases: [],
    games: [],
    evaluations: [],
    messages: [],
    goals: [],
    events: [],
    applications: [],
    audit: [],
    patches: [
      { id: "patch", name: "Stored ruleset", date: "2026-10-09", catalogue },
    ],
    savedArmies: [
      {
        id: "saved",
        userId: member.id,
        ownerName: member.name,
        shared: false,
        patchId: "patch",
        army: structuredClone(army),
        updatedAt: matrix.updatedAt,
      },
    ],
    matrixLists: [matrix],
  };
  ensureArmyLibrary(state);
  return { state, admin, member, matrix, army };
}

test("observed New Recruit annotations and explicit catalogue ancestry preserve exact selected units", () => {
  const army = imported();
  assert.equal(army.composition?.status, "complete");
  const unit = army.composition!.selections[0];
  assert.equal(unit.kind, "unit");
  assert.equal(unit.quantity, 2);
  assert.match(unit.sourceId, /:verified-bs-catalogue:unit$/);
  assert.equal(unit.selections[0].selections[0].kind, "model");
  assert.equal(unit.selections[0].selections[0].quantity, 5);
  const changed = payload();
  changed.army.options[0].options[0].options[1].options[0].associated = [
    { uid: "different-volatile-instance", label: "Supporting", amount: 1 },
  ];
  assert.equal(
    armyFromNewRecruit(changed, url, catalogue).composition?.fingerprint,
    army.composition?.fingerprint,
  );
  changed.army.options[0].options[0].options[1].options[0].associated = [
    { uid: "unknown", label: "Unknown semantics", amount: 1 },
  ];
  assert.equal(
    armyFromNewRecruit(changed, url, catalogue).composition?.status,
    "partial",
  );
});

test("discarded repeated force groups and unknown wrapper metadata remain partial", () => {
  const repeated = payload();
  repeated.army.options[0].amount = 2;
  assert.equal(
    armyFromNewRecruit(repeated, url, catalogue).composition?.status,
    "partial",
  );
  const unknown = payload();
  (unknown.army as Option & { otherSelections?: unknown }).otherSelections = [
    { source: "unparsed" },
  ];
  assert.equal(
    armyFromNewRecruit(unknown, url, catalogue).composition?.status,
    "partial",
  );
  const repeatedModels = payload();
  repeatedModels.army.options[0].options[0].options[1].options[0].options[0].amount = 2;
  assert.equal(
    armyFromNewRecruit(repeatedModels, url, catalogue).composition?.status,
    "partial",
  );
});

test("inventory covers stored source locations without inferring missing historical rulesets", () => {
  const { state, army } = fixture();
  state.games = [
    {
      id: "game",
      userId: "member",
      own: army,
      enemy: army,
      updatedAt: "historical",
    },
  ] as State["games"];
  state.matrixListHistory = [
    {
      army,
      authorName: "Historical label",
      updatedAt: "historical",
      patchId: "patch",
    },
  ];
  state.scrims = [
    {
      id: "scrim",
      revision: 1,
      patchId: "patch",
      teams: [
        { id: "a", entries: [{ id: "entry", army }] },
        { id: "b", entries: [] },
      ],
    },
  ] as unknown as State["scrims"];
  const sources = inventoryLibraryRosterSources(state);
  assert.deepEqual(
    new Set(sources.map((row) => row.sourceKind)),
    new Set([
      "saved",
      "matrix",
      "version",
      "journal-own",
      "journal-enemy",
      "scrim",
      "matrix-history",
    ]),
  );
  assert.equal(
    sources.find((row) => row.sourceKind === "journal-own")!.patchId,
    "",
  );
  assert.equal("opponent" in sources[0], false);
});

test("imports deduplicate URL and ruleset, preserve private publication and immutable history, and are idempotent", async () => {
  const { state, admin, army } = fixture();
  state.games = [
    {
      id: "game",
      userId: "member",
      patchId: "patch",
      own: army,
      enemy: army,
      updatedAt: "historical",
    },
  ] as State["games"];
  const history = structuredClone({
    version: state.armyVersions![0],
    games: state.games,
  });
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return imported();
  };
  const batch = await importLibraryRosters(state, fetcher);
  assert.equal(calls, 1);
  assert.equal(batch.uniqueSources, 1);
  assert.equal(batch.totalSources, 5);
  const beforeArchetype = archetypeId(
    state.savedArmies![0].army,
    "patch",
    state,
  );
  const report = applyLibraryRosterImports(state, admin, batch.results);
  assert.equal(report.updated, 1);
  assert.equal(state.armyVersions!.length, 2);
  assert.deepEqual(state.armyVersions![0], history.version);
  assert.deepEqual(state.games, history.games);
  assert.ok(state.armyVersions!.every((row) => !row.published));
  assert.equal(state.savedArmies![0].army.listName, "Stored original name");
  assert.equal(state.savedArmies![0].army.scope?.battleSize, undefined);
  assert.equal(
    state.savedArmies![0].army.scope?.systemId,
    String(catalogue.systemId),
  );
  assert.equal(
    archetypeId(state.savedArmies![0].army, "patch", state),
    beforeArchetype,
  );
  const revision = state.savedArmies![0].listRevision;
  const second = await importLibraryRosters(state, fetcher);
  assert.equal(
    applyLibraryRosterImports(state, admin, second.results).updated,
    0,
  );
  assert.equal(state.savedArmies![0].listRevision, revision);
  assert.equal(state.armyVersions!.length, 2);
});

test("import commit requires current admin and rejects source, configuration and publication races", async () => {
  for (const mutate of [
    (state: State) => {
      state.savedArmies![0].army.listUrl =
        "https://www.newrecruit.eu/app/list/changed";
    },
    (state: State) => {
      state.savedArmies![0].army.listName = "Changed stored name";
    },
    (state: State) => {
      state.savedArmies![0].shared = true;
    },
    (state: State) => {
      state.users[1].removedAt = "now";
    },
    (state: State) => {
      state.patches![0].catalogue = {
        ...catalogue,
        systemId: catalogue.systemId + 1,
      };
    },
  ]) {
    const { state, admin } = fixture();
    const batch = await importLibraryRosters(state, async () => imported());
    mutate(state);
    const report = applyLibraryRosterImports(state, admin, batch.results);
    assert.equal(
      report.sources.find((row) => row.sourceKey === "saved:saved")!.status,
      "stale",
    );
    assert.equal(state.armyVersions!.length, 1);
  }
  const { state, member, admin } = fixture();
  const batch = await importLibraryRosters(state, async () => imported());
  assert.throws(
    () => applyLibraryRosterImports(state, member, batch.results),
    /Administrator/,
  );
  state.users[0].confirmedMember = false;
  assert.throws(
    () => applyLibraryRosterImports(state, admin, batch.results),
    /Administrator/,
  );
});

test("current matrix sidecars are usable only while their original source remains authoritative", async () => {
  const { state, admin, matrix } = fixture();
  matrix.army.composition = imported().composition;
  assert.equal(importedMatrixArmy(state, matrix).composition, undefined);
  delete matrix.army.composition;
  const batch = await importLibraryRosters(state, async () => imported());
  applyLibraryRosterImports(state, admin, batch.results);
  assert.equal(matrix.army.composition, undefined);
  assert.equal(
    importedMatrixArmy(state, matrix).composition?.status,
    "complete",
  );
  const failed = await importLibraryRosters(state, async () => {
    throw new Error("Temporary source failure");
  });
  assert.ok(applyLibraryRosterImports(state, admin, failed.results).failed > 0);
  assert.equal(
    importedMatrixArmy(state, matrix).composition?.status,
    "complete",
  );
  matrix.army.listUrl = "https://www.newrecruit.eu/app/list/new-source";
  assert.equal(importedMatrixArmy(state, matrix).composition, undefined);
});

test("changed source configuration, partial and unavailable retrievals do not overwrite complete evidence", async () => {
  const { state, admin } = fixture();
  let batch = await importLibraryRosters(state, async () => ({
    ...imported(),
    disposition: "different-config",
  }));
  assert.equal(
    applyLibraryRosterImports(state, admin, batch.results).updated,
    0,
  );
  assert.equal(state.savedArmies![0].army.composition, undefined);
  batch = await importLibraryRosters(state, async () => imported());
  applyLibraryRosterImports(state, admin, batch.results);
  const complete = structuredClone(state.savedArmies![0].army);
  batch = await importLibraryRosters(state, async () => {
    const partial = imported();
    partial.composition!.status = "partial";
    partial.composition!.reasons = ["Unknown equipment field"];
    return partial;
  });
  assert.equal(
    applyLibraryRosterImports(state, admin, batch.results).updated,
    0,
  );
  assert.deepEqual(state.savedArmies![0].army, complete);
});

test("batch pagination limits unique requests, bounded workers, and unsupported historical URLs", async () => {
  const { state, admin } = fixture();
  state.matrixLists = Array.from({ length: 7 }, (_, index) => ({
    ...state.matrixLists![0],
    id: `matrix-${index}`,
    army: {
      ...state.matrixLists![0].army,
      listUrl: `https://www.newrecruit.eu/app/list/fixture-${index}`,
    },
  }));
  state.savedArmies![0].army.listUrl = "https://unsupported.example/list";
  let active = 0;
  let maximum = 0;
  const calls: string[] = [];
  const fetcher = async (sourceUrl: string) => {
    calls.push(sourceUrl);
    maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return { ...imported(), listUrl: sourceUrl };
  };
  const first = await importLibraryRosters(state, fetcher, { limit: 4 });
  assert.equal(first.nextOffset, 4);
  assert.equal(first.remaining, 4); // seven matrix sources plus the retained immutable version URL
  assert.equal(
    first.results.filter((row) => row.status === "unsupported").length,
    1,
  );
  applyLibraryRosterImports(state, admin, first.results);
  const last = await importLibraryRosters(state, fetcher, {
    offset: first.nextOffset,
    limit: 4,
  });
  assert.equal(last.nextOffset, undefined);
  assert.equal(last.remaining, 0);
  assert.equal(new Set(calls).size, 8);
  assert.ok(maximum <= 3);
  assert.equal(
    last.results.some((row) => row.status === "unsupported"),
    false,
  );
});
