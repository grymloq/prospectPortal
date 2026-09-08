import assert from "node:assert/strict";
import { test } from "node:test";
import type { Army, Game } from "../src/lib/types";
import {
  armyKey,
  armyAverage,
  matrixWithManual,
  buildMatchups,
  cellKey,
  outcomeForScore,
} from "../src/lib/matchups";
const army = (
  faction: string,
  detachments = ["d1", "d2"],
  disposition = "p",
): Army => ({
  faction,
  detachments,
  disposition,
  listUrl: "",
  revision: 1,
  factionName: faction,
  detachmentNames: detachments,
  dispositionName: disposition,
});
const a = army("Orks"),
  b = army("Aeldari");
function game(score: number, layout: Game["layout"], own = a, enemy = b): Game {
  return {
    id: crypto.randomUUID(),
    userId: "member",
    date: "2026-09-08",
    opponent: "Opponent",
    own,
    enemy,
    score,
    layout,
    outcome: outcomeForScore(score),
    context: "Practice",
    notes: "",
    eventId: "",
    updatedAt: "",
  };
}
test("score boundaries have one deterministic outcome", () => {
  for (const score of [0, 9, 10, 11, 20])
    assert.equal(
      outcomeForScore(score),
      score === 10 ? "Draw" : score > 10 ? "Win" : "Loss",
    );
});
test("configuration keys ignore order and URLs but distinguish faction, detachment set and disposition", () => {
  assert.equal(
    armyKey(a),
    armyKey({
      ...a,
      detachments: ["d2", "d1"],
      revision: 2,
      listUrl: "https://example.com/list",
    }),
  );
  for (const other of [
    b,
    army("Orks", ["d1"]),
    army("Orks", ["d1", "d2"], "other"),
  ])
    assert.notEqual(armyKey(a), armyKey(other));
});
test("matrix separates layouts, weights each logged game and reverses the score perspective", () => {
  const data = buildMatchups([
    game(12, "A"),
    game(16, "A"),
    game(5, "B"),
    game(1, "C", b, a),
    game(20, null),
  ]);
  const forward = data.cells.get(cellKey(armyKey(a), armyKey(b)))!;
  const reverse = data.cells.get(cellKey(armyKey(b), armyKey(a)))!;
  assert.deepEqual(forward.A, { total: 28, count: 2, average: 14 });
  assert.equal(forward.B.average, 5);
  assert.equal(forward.C.average, 19);
  assert.equal(reverse.A.average, 6);
  assert.equal(reverse.B.average, 15);
  assert.equal(reverse.C.average, 1);
  assert.equal(data.included, 4);
  assert.equal(data.missingLayout, 1);
});
test("unknown layouts do not invent observations; self matches pool perspectives without counting twice", () => {
  const data = buildMatchups([game(18, "A", a, a), game(20, undefined, a, b)]);
  const self = data.cells.get(cellKey(armyKey(a), armyKey(a)))!;
  assert.deepEqual(self.A, { total: 10, count: 1, average: 10 });
  assert.equal(self.B.count, 0);
  assert.equal(data.cells.has(cellKey(armyKey(a), armyKey(b))), false);
  assert.equal(data.armies.length, 2);
});
test("matrix can only aggregate the games supplied by the authorized view", () => {
  const all = [game(20, "A"), { ...game(0, "A"), userId: "other" }];
  const own = buildMatchups(all.filter((g) => g.userId === "member"));
  assert.equal(own.cells.get(cellKey(armyKey(a), armyKey(b)))!.A.average, 20);
  assert.equal(
    buildMatchups(all).cells.get(cellKey(armyKey(a), armyKey(b)))!.A.average,
    10,
  );
});
test("patch filters separate averages and list axes across rules versions", () => {
  const data = [
    { ...game(18, "A"), patchId: "2026-09-02" },
    { ...game(2, "A"), patchId: "2026-10-01" },
    { ...game(8, "B", army("Necrons"), b), patchId: "2026-10-01" },
  ];
  assert.equal(
    buildMatchups(data, "2026-09-02").cells.get(
      cellKey(armyKey(a), armyKey(b)),
    )!.A.average,
    18,
  );
  assert.equal(buildMatchups(data, "2026-09-02").armies.length, 2);
  assert.equal(
    buildMatchups(data, "2026-10-01").cells.get(
      cellKey(armyKey(a), armyKey(b)),
    )!.A.average,
    2,
  );
  assert.equal(buildMatchups(data, "2026-10-01").armies.length, 3);
  assert.equal(
    buildMatchups(data).cells.get(cellKey(armyKey(a), armyKey(b)))!.A.average,
    10,
  );
  assert.equal(buildMatchups(data, "missing").included, 0);
});

test("axis averages weight games, respect opponents and use each army perspective", () => {
  const c = army("Necrons");
  const { cells } = buildMatchups([
    game(20, "A"),
    game(10, "B"),
    game(12, "B"),
    game(0, "C", a, c),
  ]);
  const result = armyAverage(cells, armyKey(a), [armyKey(b), armyKey(c)]);
  assert.equal(result.average, 10.5);
  assert.equal(result.count, 4);
  assert.equal(armyAverage(cells, armyKey(a), [armyKey(b)]).average, 14);
  assert.equal(armyAverage(cells, armyKey(b), [armyKey(a)]).average, 6);
  assert.equal(armyAverage(cells, armyKey(c), [armyKey(b)]).count, 0);
});

test("manual estimates replace layout scores, reverse perspective and preserve logs", () => {
  const keyA = armyKey(a),
    keyB = armyKey(b),
    patchId = "2026-09-02";
  const g = { ...game(11, "A"), patchId };
  const estimate = {
    userId: "u",
    authorName: "Team",
    updatedAt: "2026-09-08",
    patchId,
    row: keyA,
    column: keyB,
    layout: "A" as const,
    score: 16,
  };
  const data = matrixWithManual([g], patchId, [], [estimate]);
  assert.equal(data.cells.get(cellKey(keyA, keyB))!.A.average, 11);
  assert.equal(data.effective.get(cellKey(keyA, keyB))!.A.average, 16);
  assert.equal(data.effective.get(cellKey(keyB, keyA))!.A.average, 4);
  assert.equal(
    matrixWithManual([g], patchId, [], []).effective.get(cellKey(keyA, keyB))!.A
      .average,
    11,
  );
  assert.equal(
    matrixWithManual([g], "", [], [estimate]).effective.get(
      cellKey(keyA, keyB),
    )!.A.average,
    11,
  );
  const added = matrixWithManual(
    [],
    patchId,
    [
      {
        id: "list",
        userId: "u",
        authorName: "Team",
        updatedAt: "2026-09-08",
        patchId,
        army: a,
      },
    ],
    [],
  );
  assert.equal(added.armies.length, 1);
  assert.equal(added.included, 0);
});
