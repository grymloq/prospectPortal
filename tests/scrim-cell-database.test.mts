import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { ScrimLayoutEdit, State } from "../src/lib/types";
import { armyKey } from "../src/lib/matchups";
import { planScrimCell } from "../src/server/scrim-cell-plan";
import { executeScrim } from "../src/server/scrims";
import {
  libraryFixture,
  migrateLibrary,
  postgresFixture,
} from "../scripts/lib/library-postgres-fixture.mjs";

const initial = libraryFixture(4, 6);
const own = initial.savedArmies![0].army;
const enemy = initial.savedArmies![1].army;
initial.scrims = [
  {
    id: "scrim",
    revision: 1,
    eventId: "event",
    kind: "internal",
    teamSize: 1,
    patchId: "p",
    submissionDeadline: "2000-01-01T00:00:00Z",
    teams: [
      {
        id: "blue",
        name: "Blue",
        captainId: "member",
        captainName: "Member",
        external: false,
        finalizedAt: "2000-01-01",
        entries: [{ id: "own", name: "Own", userId: "member", army: own }],
        estimates: [],
      },
      {
        id: "yellow",
        name: "Yellow",
        captainId: "other",
        captainName: "Other",
        external: false,
        finalizedAt: "2000-01-01",
        entries: [{ id: "enemy", name: "Enemy", userId: "other", army: enemy }],
        estimates: [],
      },
    ],
    pairings: [],
  },
];
initial.users.push({ ...initial.users[0], id: "other" });
const db = await postgresFixture(initial);
await migrateLibrary(db);
await db.exec(
  readFileSync(
    "supabase/migrations/20261010010824_scrim_cell_transaction.sql",
    "utf8",
  ),
);
await db.exec(
  readFileSync(
    "supabase/migrations/20261010011425_scrim_cell_validation_probe.sql",
    "utf8",
  ),
);
after(() => db.close());
async function reset(state = initial) {
  await db.query(
    "update public.portal_state set value=$1::jsonb,revision=1,scrim_score_revision=null where id=1",
    [JSON.stringify(state)],
  );
}
async function context(actor = "member", team = "blue") {
  return (
    await db.query<{
      c: { state: State; actor: State["users"][number]; revision: number };
    }>("select public.scrim_score_context($1,'scrim',$2) c", [actor, team])
  ).rows[0].c;
}
const command = (revision = 1): ScrimLayoutEdit => ({
  type: "scrimLayoutEstimate",
  scrimId: "scrim",
  revision,
  teamId: "blue",
  ownId: "own",
  enemyId: "enemy",
  ownArmyKey: armyKey(own),
  enemyArmyKey: armyKey(enemy),
  layout: "A",
  score: 14,
  expectedScore: null,
});
async function commit(
  c: Awaited<ReturnType<typeof context>>,
  edit = command(),
  changes = planScrimCell(c.state, c.actor, edit).changes,
) {
  return (
    await db.query<{ ok: boolean }>(
      "select public.scrim_score_commit($1,$2,'scrim',$3,$4,$5::jsonb) ok",
      [
        c.actor.id,
        c.revision,
        edit.revision,
        edit.teamId,
        JSON.stringify(changes),
      ],
    )
  ).rows[0].ok;
}
async function persisted() {
  return (
    await db.query<{ value: State; revision: number }>(
      "select value,revision from public.portal_state where id=1",
    )
  ).rows[0];
}

test("cell transaction preserves seed scores, every history, unrelated state and rollback-compatible JSON", async () => {
  await reset();
  const c = await context();
  const reference = structuredClone(initial);
  executeScrim(reference, reference.users[0], command());
  const plan = planScrimCell(c.state, c.actor, command());
  assert.equal(await commit(c, command(), plan.changes), true);
  const saved = await persisted();
  assert.equal(saved.revision, 2);
  const actual = saved.value.scrims![0];
  assert.equal(actual.revision, reference.scrims![0].revision);
  for (const [i, team] of actual.teams.entries()) {
    assert.deepEqual(
      team.estimates.map((e) => e.scores),
      reference.scrims![0].teams[i].estimates.map((e) => e.scores),
    );
  }
  assert.deepEqual(actual.teams[0].estimates[0], plan.response.cell);
  assert.equal(plan.response.cell.history!.length, 2);
  assert.equal(
    plan.response.cell.history![1].authorName,
    initial.users[0].name,
  );
  assert.deepEqual({ ...saved.value, scrims: [] }, { ...initial, scrims: [] });
  assert.deepEqual(saved.value.armyVersions, initial.armyVersions);
  assert.equal(
    (
      await db.query<{ r: number }>(
        "select revision r from public.library_meta where id=1",
      )
    ).rows[0].r,
    2,
  );
  // Another cell save appends history; it does not overwrite prior comments/names.
  const next = await context();
  const second = { ...command(2), expectedScore: 14, score: null };
  assert.equal(await commit(next, second), true);
  const cell = (await persisted()).value.scrims![0].teams[0].estimates[0];
  assert.equal(cell.history!.length, 3);
  assert.equal(cell.scores.A, null);
});

test("fresh SQL gates reject removed, pending, other-team admins and organizers", async () => {
  await reset();
  await assert.rejects(() => context("removed"), /access has been removed/);
  await assert.rejects(() => context("pending"), /awaiting confirmation/);
  await assert.rejects(() => context("admin"), /Only team members/);
  await assert.rejects(() => context("other"), /Only team members/);
  const c = await context();
  const revoked = structuredClone(initial);
  revoked.users[0].removedAt = "2026-10-01";
  await db.query("select public.portal_commit(1,$1::jsonb)", [
    JSON.stringify(revoked),
  ]);
  assert.equal(await commit(c), false);
  await assert.rejects(() => context(), /access has been removed/);
  assert.equal((await persisted()).value.scrims![0].revision, 1);
});

test("global CAS and scrim/army/expected-score validation protect concurrent edits", async () => {
  await reset();
  const first = await context(),
    second = await context();
  assert.equal(await commit(first), true);
  assert.equal(await commit(second), false);
  await assert.rejects(
    async () =>
      planScrimCell((await context()).state, initial.users[0], command()),
    /This scrim changed/,
  );
  const fresh = await context();
  assert.throws(
    () =>
      planScrimCell(structuredClone(fresh.state), fresh.actor, {
        ...command(2),
        ownArmyKey: "old",
      }),
    /army lists changed/,
  );
  assert.throws(
    () => planScrimCell(structuredClone(fresh.state), fresh.actor, command(2)),
    /estimate changed/,
  );
  const state = (await persisted()).value;
  const old = await context();
  state.scrims![0].teams[0].coaches = [];
  state.users[0].role = "admin";
  assert.equal(
    (
      await db.query<{ ok: boolean }>(
        "select public.portal_commit(2,$1::jsonb) ok",
        [JSON.stringify(state)],
      )
    ).rows[0].ok,
    true,
  );
  assert.equal(await commit(old, { ...command(2), expectedScore: 14 }), false);
  assert.equal((await persisted()).value.scrims![0].revision, 2);
});

test("pre-reveal preparation uses authorized configurations, never private journal seed scores", async () => {
  const state = structuredClone(initial);
  state.scrims![0].submissionDeadline = "2999-01-01T00:00:00Z";
  state.manualEstimates = [
    {
      patchId: "p",
      row: armyKey(own),
      column: armyKey(enemy),
      layout: "A",
      score: 8,
    },
  ] as State["manualEstimates"];
  await reset(state);
  const c = await context();
  const serialized = JSON.stringify(c);
  for (const secret of [
    "PRIVATE NOTES",
    "PRIVATE OPPONENT",
    "PRIVATE EMAIL",
    "PRIVATE BIO",
    "PRIVATE APPLICATION",
  ])
    assert.equal(serialized.includes(secret), false);
  const edit = {
    ...command(),
    enemyId: `db:${createHash("sha256").update(armyKey(enemy)).digest("hex")}`,
    expectedScore: 8,
  };
  const plan = planScrimCell(c.state, c.actor, edit);
  assert.equal(plan.changes.length, 1);
  assert.equal(await commit(c, edit, plan.changes), true);
  assert.equal(
    (await persisted()).value.scrims![0].teams[0].estimates[0].history![0]
      .scores.A,
    8,
  );
});

test("normal commits after a cell save still mirror publication/privacy changes and reject stale legacy writes", async () => {
  await reset();
  const c = await context();
  assert.equal(await commit(c), true);
  const state = (await persisted()).value;
  state.savedArmies![0].shared = false;
  assert.equal(
    (
      await db.query<{ ok: boolean }>(
        "select public.portal_commit(1,$1::jsonb) ok",
        [JSON.stringify(initial)],
      )
    ).rows[0].ok,
    false,
  );
  assert.equal(
    (
      await db.query<{ ok: boolean }>(
        "select public.portal_commit(2,$1::jsonb) ok",
        [JSON.stringify(state)],
      )
    ).rows[0].ok,
    true,
  );
  assert.equal(
    (
      await db.query<{ visible: boolean }>(
        "select visible from public.library_lists where id='list-0'",
      )
    ).rows[0].visible,
    false,
  );
  assert.equal(
    (
      await db.query<{ r: number }>(
        "select revision r from public.library_meta where id=1",
      )
    ).rows[0].r,
    3,
  );
});

test("anonymous/authenticated database clients cannot read planning context or execute transactions", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(() => context(), /permission denied/);
      await assert.rejects(
        () =>
          db.query(
            "select public.scrim_score_commit('member',1,'scrim',1,'blue','[]')",
          ),
        /permission denied/,
      );
      await assert.rejects(
        () => db.query("select * from public.portal_state"),
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  }
});

test("service role can save, coaches retain team access, and cancelled/completed rules are unchanged", async () => {
  const state = structuredClone(initial);
  state.scrims![0].teams[0].coaches = [{ userId: "other", name: "Coach" }];
  state.scrims![0].completedAt = "2000-01-01";
  await reset(state);
  await db.exec("set role service_role");
  try {
    const c = await context("other");
    assert.equal(await commit(c), true);
  } finally {
    await db.exec("reset role");
  }
  state.scrims![0].cancelled = true;
  await reset(state);
  await assert.rejects(() => context(), /cancelled/);
});

test("reveal carries preparation comments and historical authors into both teams without losing library facts", async () => {
  const state = structuredClone(initial);
  const dbEnemy = `db:${createHash("sha256").update(armyKey(enemy)).digest("hex")}`;
  state.scrims![0].teams[0].estimates.push({
    ownId: "own",
    enemyId: dbEnemy,
    scores: { A: 9, B: 12, C: null },
    comments: [
      {
        id: "comment",
        authorId: "member",
        authorName: "Historical name",
        createdAt: "2000-01-01",
        text: "Preparation",
      },
    ],
    history: [
      {
        scores: { A: 9, B: 12, C: null },
        authorName: "Historical name",
        createdAt: "2000-01-01",
      },
    ],
    updatedAt: "2000-01-01",
    updatedBy: "Historical name",
  });
  await reset(state);
  const mirror = await db.query(
    "select payload from public.library_scrims order by id",
  );
  const c = await context();
  const edit = { ...command(), expectedScore: 9 };
  const plan = planScrimCell(c.state, c.actor, edit);
  assert.equal(await commit(c, edit, plan.changes), true);
  const cells = (await persisted()).value.scrims![0].teams[0].estimates;
  const submitted = cells.find((e) => e.enemyId === "enemy")!;
  assert.deepEqual(
    submitted.comments,
    state.scrims![0].teams[0].estimates[0].comments,
  );
  assert.equal(submitted.history![0].authorName, "Historical name");
  assert.equal(submitted.history!.length, 2);
  assert.equal(cells.find((e) => e.enemyId === dbEnemy)!.history!.length, 1);
  assert.deepEqual(
    (await db.query("select payload from public.library_scrims order by id"))
      .rows,
    mirror.rows,
  );
});

test("database rollback restores the previous trigger while retaining every committed cell", async () => {
  await reset();
  assert.equal(await commit(await context()), true);
  const saved = await persisted();
  await db.exec(
    readFileSync("scripts/sql/rollback-scrim-cell-transaction.sql", "utf8"),
  );
  assert.deepEqual(await persisted(), saved);
  const state = structuredClone(saved.value);
  state.savedArmies![0].shared = false;
  assert.equal(
    (
      await db.query<{ ok: boolean }>(
        "select public.portal_commit(2,$1::jsonb) ok",
        [JSON.stringify(state)],
      )
    ).rows[0].ok,
    true,
  );
  assert.deepEqual((await persisted()).value.scrims, saved.value.scrims);
  assert.equal(
    (
      await db.query<{ visible: boolean }>(
        "select visible from public.library_lists where id='list-0'",
      )
    ).rows[0].visible,
    false,
  );
});

test("transport probes use the same transaction but roll back state, mirror revisions and history", async () => {
  await reset();
  const c = await context();
  const plan = planScrimCell(c.state, c.actor, command());
  const snapshot = await persisted();
  for (const legacy of [false, true]) {
    const next = structuredClone(initial);
    executeScrim(next, next.users[0], command());
    const result = await db.query<{ ok: boolean }>(
      "select public.scrim_score_probe('member',1,'scrim',1,'blue',$1::jsonb,$2::jsonb) ok",
      [
        legacy ? null : JSON.stringify(plan.changes),
        legacy ? JSON.stringify(next) : null,
      ],
    );
    assert.equal(result.rows[0].ok, true);
    assert.deepEqual(await persisted(), snapshot);
    assert.equal(
      (
        await db.query<{ r: number }>(
          "select revision r from public.library_meta where id=1",
        )
      ).rows[0].r,
      1,
    );
  }
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(
        () =>
          db.query(
            "select public.scrim_score_probe('member',1,'scrim',1,'blue',null,'{}')",
          ),
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  }
});
