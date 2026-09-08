import type { Army, Game, Layout } from "./types";

export const layouts: Layout[] = ["A", "B", "C"];
export function outcomeForScore(score: number): Game["outcome"] {
  return score === 10 ? "Draw" : score > 10 ? "Win" : "Loss";
}
// Source IDs, not names/URLs/revisions, identify a configuration. Order is irrelevant.
export function armyKey(army: Army) {
  return JSON.stringify([
    army.faction,
    [...army.detachments].sort(),
    army.disposition,
  ]);
}
export type MatrixArmy = { key: string; army: Army };
export type Estimate = { total: number; count: number; average: number };
export type Matchup = Record<Layout, Estimate>;
const blank = (): Matchup =>
  Object.fromEntries(
    layouts.map((l) => [l, { total: 0, count: 0, average: 0 }]),
  ) as Matchup;
export function cellKey(row: string, column: string) {
  return JSON.stringify([row, column]);
}
// Weight by recorded games, including all layouts; absent matchups contribute nothing.
export function armyAverage(
  cells: Map<string, Matchup>,
  army: string,
  opponents: string[],
): Estimate {
  let total = 0,
    count = 0;
  for (const opponent of opponents) {
    const cell = cells.get(cellKey(army, opponent));
    if (!cell) continue;
    for (const layout of layouts) {
      total += cell[layout].total;
      count += cell[layout].count;
    }
  }
  return { total, count, average: count ? total / count : 0 };
}
export function buildMatchups(games: Game[], patchId?: string) {
  const armies = new Map<string, MatrixArmy>(),
    cells = new Map<string, Matchup>();
  let included = 0,
    missingLayout = 0;
  function add(row: string, column: string, layout: Layout, score: number) {
    const key = cellKey(row, column),
      cell = cells.get(key) || blank();
    const estimate = cell[layout];
    estimate.total += score;
    estimate.count++;
    estimate.average = estimate.total / estimate.count;
    cells.set(key, cell);
  }
  for (const game of games) {
    if (patchId && game.patchId !== patchId) continue;
    const row = armyKey(game.own),
      column = armyKey(game.enemy);
    armies.set(row, { key: row, army: game.own });
    armies.set(column, { key: column, army: game.enemy });
    if (!game.layout || !layouts.includes(game.layout)) {
      missingLayout++;
      continue;
    }
    included++;
    // Identical configurations pool both perspectives: 10 points per game, counted once.
    if (row === column) add(row, column, game.layout, 10);
    else {
      add(row, column, game.layout, game.score);
      add(column, row, game.layout, 20 - game.score);
    }
  }
  return {
    armies: [...armies.values()].sort(
      (a, b) =>
        a.army.factionName.localeCompare(b.army.factionName) ||
        a.key.localeCompare(b.key),
    ),
    cells,
    included,
    missingLayout,
  };
}
