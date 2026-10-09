import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScrimLayoutEdit, ScrimScoreUpdate, View } from "../src/lib/types";
import {
  applyScrimScoreUpdate,
  createScrimScoreQueue,
} from "../src/lib/scrim-score-queue";

function fixture() {
  return {
    me: { id: "player" },
    games: [],
    savedArmies: [],
    matrixLists: [],
    scrims: [
      {
        id: "scrim",
        revision: 5,
        teams: [
          {
            id: "team",
            entries: [],
            estimates: [
              {
                ownId: "own",
                enemyId: "enemy",
                scores: { A: 4, B: 11, C: null },
                comments: [],
              },
            ],
          },
          { id: "other", entries: [], estimates: [] },
        ],
      },
    ],
  } as unknown as View;
}
const command = (
  layout: "A" | "B" | "C",
  score: number | null,
): ScrimLayoutEdit => ({
  type: "scrimLayoutEstimate",
  scrimId: "scrim",
  revision: 5,
  teamId: "team",
  ownId: "own",
  enemyId: "enemy",
  ownArmyKey: "own-key",
  enemyArmyKey: "enemy-key",
  layout,
  score,
  expectedScore: layout === "A" ? 4 : layout === "B" ? 11 : null,
});
test("rapid clearing and zero edits serialize with accepted revisions and retain unrelated workspace references", async () => {
  let view = fixture();
  const initial = view;
  const sent: ScrimLayoutEdit[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const save = createScrimScoreQueue({
    read: () => view,
    apply: (update) => {
      view = applyScrimScoreUpdate(view, update);
    },
    request: async (c) => {
      sent.push(c);
      if (sent.length === 1) await gate;
      const cell = view.scrims![0].teams[0].estimates[0];
      return {
        kind: "scrim-score",
        viewerId: "player",
        scrimId: "scrim",
        revision: c.revision + 1,
        teamId: "team",
        cell: { ...cell, scores: { ...cell.scores, [c.layout]: c.score } },
      };
    },
  });
  const a = save(command("A", null)),
    b = save(command("B", null)),
    c = save(command("C", 0));
  await Promise.resolve();
  assert.equal(sent.length, 1);
  release();
  await Promise.all([a, b, c]);
  assert.deepEqual(
    sent.map((c) => c.revision),
    [5, 6, 7],
  );
  assert.deepEqual(
    sent.map((c) => c.expectedScore),
    [4, 11, null],
  );
  assert.deepEqual(view.scrims![0].teams[0].estimates[0].scores, {
    A: null,
    B: null,
    C: 0,
  });
  assert.equal(view.games, initial.games);
  assert.equal(view.savedArmies, initial.savedArmies);
  assert.equal(view.matrixLists, initial.matrixLists);
  assert.equal(view.scrims![0].teams[1], initial.scrims![0].teams[1]);
  assert.equal(
    view.scrims![0].teams[0].entries,
    initial.scrims![0].teams[0].entries,
  );
});
test("queued edits cannot cross viewer/preview boundaries and stale responses cannot roll back revisions", async () => {
  let view = fixture();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const save = createScrimScoreQueue({
    read: () => view,
    apply: (update) => {
      view = applyScrimScoreUpdate(view, update);
    },
    request: async (c) => {
      calls++;
      await gate;
      return {
        kind: "scrim-score",
        viewerId: "player",
        scrimId: "scrim",
        revision: c.revision + 1,
        teamId: "team",
        cell: view.scrims![0].teams[0].estimates[0],
      };
    },
  });
  const a = save(command("A", null)),
    b = save(command("B", null));
  await Promise.resolve();
  view = { ...view, me: { ...view.me, id: "other-player" } };
  release();
  await assert.rejects(a, /access changed/);
  await assert.rejects(b, /access changed/);
  assert.equal(calls, 1);
  const update = {
    kind: "scrim-score",
    viewerId: "player",
    scrimId: "scrim",
    revision: 4,
    teamId: "team",
    cell: fixture().scrims![0].teams[0].estimates[0],
  } as ScrimScoreUpdate;
  assert.throws(
    () => applyScrimScoreUpdate(fixture(), update),
    /scrim changed/,
  );
  assert.throws(
    () =>
      applyScrimScoreUpdate(
        {
          ...fixture(),
          accessPreview: { active: true, actorName: "Admin", users: [] },
        },
        { ...update, revision: 6 },
      ),
    /access changed/,
  );
});
