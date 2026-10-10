import assert from "node:assert/strict";
import { test } from "node:test";
import {
  libraryFixture,
  member,
  migrateLibrary,
  postgresFixture,
  readLibrary,
} from "../scripts/lib/library-postgres-fixture.mjs";
import { queryArmyLibrary } from "../src/server/army-library";
import type { LibraryQuery, State } from "../src/lib/types";
import { catalogue } from "../src/lib/catalogue";
import { inventoryLibraryRosterSources } from "../src/server/army-library-import";
import { archetypeId } from "../src/server/army-library-identity";
const queries: LibraryQuery[] = [
  { patchId: "all" },
  { patchId: "p", tab: "archetypes" },
  { patchId: "p", search: "List", pageSize: 3, page: 2, sort: "score" },
  { patchId: "p", opponentFaction: "f1", sort: "matches" },
  { patchId: "p", target: { kind: "list", id: "list-0" } },
  {
    patchId: "p",
    target: { kind: "list", id: "list-0" },
    versionId: "list-0:v1",
  },
];
function parity(
  state: State,
  context: Awaited<ReturnType<typeof readLibrary>>,
) {
  for (const query of queries) {
    let expected;
    try {
      expected = queryArmyLibrary(state, member, query);
    } catch (error) {
      assert.throws(
        () => queryArmyLibrary(context.state, context.actor, query),
        { message: (error as Error).message },
      );
      continue;
    }
    assert.deepEqual(
      queryArmyLibrary(context.state, context.actor, query),
      expected,
    );
  }
}
test("Postgres migration preserves snapshots, query parity, privacy, atomic commits and rollback", async () => {
  const state = libraryFixture();
  const db = await postgresFixture(state);
  try {
    await migrateLibrary(db);
    const context = await readLibrary(db);
    parity(state, context);
    assert.ok(!JSON.stringify(context).includes("PRIVATE"));
    assert.equal(
      context.state.savedArmies!.length,
      state.savedArmies!.length - 1,
    );
    assert.ok(!context.state.armyVersions!.some((v) => v.number === 2));
    assert.deepEqual(
      (
        await db.query<{ payload: unknown }>(
          "select payload from library_versions order by ordinal",
        )
      ).rows.map((r) => r.payload),
      state.armyVersions,
    );
    const preserved = structuredClone(state.armyVersions);
    state.savedArmies![0].shared = false;
    state.games[0].libraryContribution = false;
    assert.equal(
      (
        await db.query<{ committed: boolean }>(
          "select portal_commit(0,$1::jsonb) committed",
          [JSON.stringify(state)],
        )
      ).rows[0].committed,
      true,
    );
    parity(state, await readLibrary(db));
    // A mirror failure must abort the compatibility write as well.
    const invalid = structuredClone(state);
    invalid.savedArmies![0].army.listName = "Invalid duplicate snapshot";
    invalid.savedArmies!.push(structuredClone(invalid.savedArmies![0]));
    await assert.rejects(
      () =>
        db.query("select portal_commit(1,$1::jsonb)", [
          JSON.stringify(invalid),
        ]),
      /cannot affect row a second time/,
    );
    assert.equal(
      (
        await db.query<{ revision: number }>(
          "select revision from portal_state where id=1",
        )
      ).rows[0].revision,
      1,
    );
    parity(state, await readLibrary(db));
    assert.deepEqual(
      (
        await db.query<{ payload: unknown }>(
          "select payload from library_versions order by ordinal",
        )
      ).rows.map((r) => r.payload),
      preserved,
    );
    assert.equal(
      (
        await db.query<{ committed: boolean }>(
          "select portal_commit(0,$1::jsonb) committed",
          [JSON.stringify(libraryFixture())],
        )
      ).rows[0].committed,
      false,
    );
    parity(state, await readLibrary(db));
    // Revert to legacy reads after a post-cutover write: all data is current.
    const legacy = (
      await db.query<{ value: State }>(
        "select value from portal_state where id=1",
      )
    ).rows[0].value;
    parity(legacy, await readLibrary(db));
    await db.exec("begin");
    const removed = structuredClone(state);
    removed.users[0].removedAt = "2026-10-10";
    await db.query("select portal_commit(1,$1::jsonb)", [
      JSON.stringify(removed),
    ]);
    await assert.rejects(() => readLibrary(db), /removed/);
    await db.exec("rollback");
    parity(state, await readLibrary(db));
    await assert.rejects(
      () => readLibrary(db, "pending"),
      /awaiting confirmation/,
    );
    await assert.rejects(() => readLibrary(db, "removed"), /removed/);
    assert.equal(await readLibrary(db, "unknown"), null);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        () => db.query("select * from library_versions"),
        /permission denied/,
      );
      await assert.rejects(() => readLibrary(db), /permission denied/);
      await assert.rejects(
        () => db.query("select library_sync('{}'::jsonb,null,100)"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    parity(state, await readLibrary(db));
    await db.exec("reset role");
    const security = await db.query<{ relrowsecurity: boolean }>(
      "select relname,relrowsecurity from pg_class where relname like 'library_%' and relkind='r'",
    );
    assert.ok(security.rows.every((r) => r.relrowsecurity));
  } finally {
    await db.close();
  }
});
test("database reads preserve global defaults, discussion ancestors and verified matrix imports", async () => {
  let state = libraryFixture();
  state.patches![0].catalogue = catalogue;
  state.libraryDefaults = [
    {
      archetypeId: archetypeId(state.armyVersions![0].army, "p", state),
      patchId: "p",
      versionId: "list-0:v1",
      revision: 1,
      updatedBy: "admin",
      updatedAt: "2026-10-01",
    },
  ];
  state.libraryDiscussions = [
    {
      id: "parent",
      target: { kind: "list", id: "list-0" },
      context: { versionId: "list-0:v1", patchId: "p" },
      authorId: member.id,
      authorName: member.name,
      text: "Deleted text",
      deletedAt: "2026-10-02",
      createdAt: "2026-10-01",
    },
    {
      id: "reply",
      parentId: "parent",
      target: { kind: "list", id: "list-0" },
      context: { versionId: "list-0:v1", patchId: "p" },
      authorId: member.id,
      authorName: member.name,
      text: "Public reply",
      createdAt: "2026-10-02",
    },
  ];
  const matrix = {
    id: "matrix",
    userId: member.id,
    authorName: member.name,
    patchId: "p",
    army: {
      ...structuredClone(state.savedArmies![1].army),
      listUrl: "https://www.newrecruit.eu/app/list/fixture",
    },
    updatedAt: "2026-10-01",
  };
  state.matrixLists = [matrix];
  const db = await postgresFixture(state);
  // Import provenance is generated from the jsonb representation read in cloud mode.
  state = (
    await db.query<{ value: State }>(
      "select value from portal_state where id=1",
    )
  ).rows[0].value;
  const importedArmy = structuredClone(matrix.army);
  importedArmy.composition!.source.systemId = String(catalogue.systemId);
  const source = inventoryLibraryRosterSources(state).find(
    (s) => s.sourceKey === "matrix:matrix",
  )!;
  state.libraryRosterImports = [
    {
      id: "import",
      sourceKey: source.sourceKey,
      sourceRevision: source.sourceRevision,
      sourceKind: "matrix",
      patchId: "p",
      sourceUrl: matrix.army.listUrl,
      importedAt: "2026-10-01",
      status: "complete",
      army: importedArmy,
    },
  ];
  try {
    await db.query("update portal_state set value=$1::jsonb where id=1", [
      JSON.stringify(state),
    ]);
    await migrateLibrary(db);
    const context = await readLibrary(db);
    assert.ok(context.state.patches![0].catalogue!.factions.length);
    parity(state, context);
    state.libraryRosterImports = [];
    await db.query("select portal_commit(0,$1::jsonb)", [
      JSON.stringify(state),
    ]);
    const compact = await readLibrary(db);
    assert.equal(compact.state.patches![0].catalogue!.factions, undefined);
    parity(state, compact);
  } finally {
    await db.close();
  }
});
test("scrim facts enter the read context only after reveal and complete submissions", async () => {
  const state = libraryFixture();
  const team = (id: string, index: number) => ({
    id,
    name: "PRIVATE TEAM",
    external: false,
    captainId: "PRIVATE CAPTAIN",
    captainName: "PRIVATE CAPTAIN",
    finalizedAt: "2026-10-01",
    estimates: [],
    entries: [
      {
        id,
        userId: index === 0 ? member.id : "admin",
        name: "PRIVATE ENTRY",
        army: state.savedArmies![index].army,
        listVersionId: `list-${index}:v3`,
      },
    ],
  });
  state.scrims = [
    {
      id: "scrim",
      eventId: "PRIVATE EVENT",
      revision: 1,
      kind: "internal",
      teamSize: 1,
      patchId: "p",
      submissionDeadline: "2099-10-01T00:00:00.000Z",
      teams: [team("a", 0), team("b", 1)],
      pairings: [
        {
          id: "pair",
          round: 1,
          aId: "a",
          bId: "b",
          layout: "A",
          scoreA: 12,
          date: "2026-10-01",
          comments: [
            {
              id: "comment",
              authorId: "admin",
              authorName: "PRIVATE AUTHOR",
              text: "PRIVATE SCRIM NOTE",
              createdAt: "2026-10-01",
            },
          ],
        },
      ],
    },
  ];
  Object.assign(state.games[0], { scrimId: "scrim", scrimPairingId: "pair" });
  const db = await postgresFixture(state);
  try {
    await migrateLibrary(db);
    assert.equal((await readLibrary(db)).state.scrims!.length, 0);
    parity(state, await readLibrary(db));
    state.scrims[0].submissionDeadline = "2026-10-01T00:00:00.000Z";
    await db.query("select portal_commit(0,$1::jsonb)", [
      JSON.stringify(state),
    ]);
    const revealed = await readLibrary(db);
    assert.equal(revealed.state.scrims!.length, 1);
    assert.ok(!JSON.stringify(revealed).includes("PRIVATE"));
    parity(state, revealed);
    state.scrims[0].teams[1].finalizedAt = undefined;
    await db.query("select portal_commit(1,$1::jsonb)", [
      JSON.stringify(state),
    ]);
    assert.equal((await readLibrary(db)).state.scrims!.length, 0);
    parity(state, await readLibrary(db));
  } finally {
    await db.close();
  }
});
