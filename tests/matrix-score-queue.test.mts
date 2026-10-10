import assert from "node:assert/strict";
import { test } from "node:test";
import type { View } from "../src/lib/types";
import {
  applyMatrixScoreUpdate,
  createMatrixScoreQueue,
  type MatrixScoreEdit,
  type MatrixScoreUpdate,
} from "../src/lib/matrix-score-queue";

const edit = (score: number | null): MatrixScoreEdit => ({
  type: "manualEstimate",
  patchId: "patch",
  own: {} as MatrixScoreEdit["own"],
  enemy: {} as MatrixScoreEdit["enemy"],
  layout: "A",
  score,
});
const response = (command: MatrixScoreEdit): MatrixScoreUpdate => {
  const change = {
    patchId: "patch",
    row: "a",
    column: "b",
    layout: "A" as const,
    score: command.score,
    userId: "member",
    authorName: "Member",
    updatedAt: "2026-10-10T00:00:00.000Z",
  };
  return {
    kind: "matrix-score",
    viewerId: "member",
    change,
    estimate:
      command.score === null ? null : { ...change, score: command.score },
    lists: [],
  };
};
const fixture = () =>
  ({
    me: { id: "member" },
    games: [],
    savedArmies: [],
    scrims: [],
    matrixLists: [],
    manualEstimates: [],
    matrixChanges: [],
  }) as unknown as View;

test("main matrix rapid zero/clear edits serialize, recover after failure, and retain unrelated collections", async () => {
  let view = fixture();
  const initial = view;
  const sent: (number | null)[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const save = createMatrixScoreQueue({
    read: () => view,
    epoch: () => 1,
    apply: (update) => {
      view = applyMatrixScoreUpdate(view, update);
    },
    request: async (command) => {
      sent.push(command.score);
      if (sent.length === 1) await gate;
      if (command.score === 7) throw new Error("Save failed");
      return response(command);
    },
  });
  const zero = save(edit(0)),
    clear = save(edit(null));
  await Promise.resolve();
  assert.deepEqual(sent, [0]);
  release();
  await zero;
  assert.equal(view.manualEstimates![0].score, 0);
  await clear;
  assert.equal(view.manualEstimates!.length, 0);
  await assert.rejects(save(edit(7)), /Save failed/);
  await save(edit(12));
  assert.equal(view.manualEstimates![0].score, 12);
  assert.deepEqual(sent, [0, null, 7, 12]);
  for (const key of ["games", "savedArmies", "scrims", "matrixLists"] as const)
    assert.equal(view[key], initial[key]);
});

test("in-flight and queued main matrix responses cannot cross refresh, logout or preview boundaries", async () => {
  for (const boundary of ["refresh", "logout", "preview"] as const) {
    let view: View | null = fixture(),
      epoch = 1,
      calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = createMatrixScoreQueue({
      read: () => view,
      epoch: () => epoch,
      apply: () => {
        throw new Error("Must not apply stale response");
      },
      request: async (command) => {
        calls++;
        await gate;
        return response(command);
      },
    });
    const pending = save(edit(0)),
      queued = save(edit(null));
    await Promise.resolve();
    if (boundary === "refresh") epoch++;
    else if (boundary === "logout") view = null;
    else
      view = {
        ...view!,
        accessPreview: { active: true, actorName: "Admin", users: [] },
      };
    release();
    await assert.rejects(pending, /workspace changed/);
    await assert.rejects(queued, /workspace changed/);
    assert.equal(calls, 1);
  }
  assert.throws(
    () =>
      applyMatrixScoreUpdate(
        { ...fixture(), me: { ...fixture().me, id: "other" } },
        response(edit(0)),
      ),
    /access changed/,
  );
});
