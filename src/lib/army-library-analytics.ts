import type {
  Army,
  LibraryFilters,
  LibraryMetrics,
  LibraryMatchup,
  LibraryTrend,
  LibraryListRow,
} from "./types";

/** One consented perspective, kept server-side; never returned as a DTO. */
export type LibraryObservation = {
  matchId: string;
  sideId: string;
  contributorId: string;
  patchId: string;
  date: string;
  score: number;
  army: Army;
  archetypeId: string;
  listId?: string;
  versionId?: string;
  variationId?: string;
  opponentFaction: string;
  opponentFactionName: string;
  opponentArchetypeId?: string;
  opponentArchetypeName?: string;
  opponentListId?: string;
  opponentListName?: string;
  opponentVariationId?: string;
  deploymentId?: string;
  deploymentName?: string;
  missionId?: string;
  missionName?: string;
};

export const LEADING_MINIMUM_MATCHES = 10;
export const UNCERTAINTY_POLICY =
  "95% Hoeffding score interval, grouping dependent perspectives by canonical match. Good/bad requires the entire interval above/below 10. Player and event concentration remain observational limitations.";

/** Hoeffding uses canonical groups' appearance weights, not journal-row n. */
export function libraryMetrics(
  observations: LibraryObservation[],
  segmented = false,
): LibraryMetrics {
  const appearances = observations.length;
  const groups = new Map<string, number>();
  for (const o of observations)
    groups.set(o.matchId, (groups.get(o.matchId) || 0) + 1);
  const wins = observations.filter((o) => o.score > 10).length;
  const draws = observations.filter((o) => o.score === 10).length;
  const averageScore = appearances
    ? observations.reduce((sum, o) => sum + o.score, 0) / appearances
    : null;
  const weightSquares = [...groups.values()].reduce(
    (sum, n) => sum + (n / appearances) ** 2,
    0,
  );
  const radius = 20 * Math.sqrt((Math.log(40) * weightSquares) / 2);
  const contributors = new Set(observations.map((o) => o.contributorId)).size;
  return {
    averageScore: segmented ? null : averageScore,
    winRate: segmented || !appearances ? null : wins / appearances,
    wins,
    draws,
    losses: appearances - wins - draws,
    recordedMatches: groups.size,
    appearances,
    contributors,
    scoreInterval:
      segmented || averageScore === null
        ? null
        : [
            Math.max(0, averageScore - radius),
            Math.min(20, averageScore + radius),
          ],
    singleContributor: contributors === 1,
  };
}

export function filterLibraryObservations(
  observations: LibraryObservation[],
  filters: LibraryFilters,
) {
  return observations.filter(
    (o) =>
      (!filters.patchId ||
        filters.patchId === "all" ||
        o.patchId === filters.patchId) &&
      (!filters.faction || o.army.faction === filters.faction) &&
      (!filters.disposition || o.army.disposition === filters.disposition) &&
      (!filters.detachments?.length ||
        filters.detachments.every((id) => o.army.detachments.includes(id))) &&
      (!filters.opponentFaction ||
        o.opponentFaction === filters.opponentFaction) &&
      (!filters.opponentArchetypeId ||
        o.opponentArchetypeId === filters.opponentArchetypeId) &&
      (!filters.opponentListId ||
        o.opponentListId === filters.opponentListId) &&
      (!filters.opponentVariationId ||
        o.opponentVariationId === filters.opponentVariationId) &&
      (!filters.deploymentId || o.deploymentId === filters.deploymentId) &&
      (!filters.missionId || o.missionId === filters.missionId) &&
      (!filters.dateFrom || o.date >= filters.dateFrom) &&
      (!filters.dateTo || o.date <= filters.dateTo),
  );
}

export function libraryTrends(
  observations: LibraryObservation[],
): LibraryTrend[] {
  const buckets = new Map<string, LibraryObservation[]>();
  for (const o of observations) {
    const key = `${o.patchId}\u0000${o.date.slice(0, 7)}`;
    buckets.set(key, [...(buckets.get(key) || []), o]);
  }
  return [...buckets.values()]
    .map((items) => ({
      month: items[0].date.slice(0, 7),
      patchId: items[0].patchId,
      metrics: libraryMetrics(items),
    }))
    .sort(
      (a, b) =>
        a.month.localeCompare(b.month) || a.patchId.localeCompare(b.patchId),
    );
}

export function libraryRecentTrend(
  observations: LibraryObservation[],
  segmented = false,
): LibraryListRow["recentTrend"] {
  if (segmented || new Set(observations.map((o) => o.patchId)).size !== 1)
    return undefined;
  const periods = libraryTrends(observations);
  if (periods.length < 2) return undefined;
  const previous = periods[periods.length - 2],
    current = periods[periods.length - 1];
  return {
    change: current.metrics.averageScore! - previous.metrics.averageScore!,
    from: previous.month,
    to: current.month,
    previousMatches: previous.metrics.recordedMatches,
    currentMatches: current.metrics.recordedMatches,
  };
}

export function libraryMatchups(
  observations: LibraryObservation[],
  segmented = false,
): LibraryMatchup[] {
  const buckets = new Map<
    string,
    {
      dimension: LibraryMatchup["dimension"];
      id: string;
      label: string;
      mirror: boolean;
      observations: LibraryObservation[];
    }
  >();
  for (const o of observations) {
    const dimensions: [
      LibraryMatchup["dimension"],
      string | undefined,
      string | undefined,
    ][] = [
      ["faction", o.opponentFaction, o.opponentFactionName],
      ["archetype", o.opponentArchetypeId, o.opponentArchetypeName],
      ["list", o.opponentListId, o.opponentListName],
      ["variation", o.opponentVariationId, "Public roster variation"],
      ["deployment", o.deploymentId, o.deploymentName],
      ["mission", o.missionId, o.missionName],
    ];
    for (const [dimension, id, label] of dimensions) {
      if (!id) continue;
      const mirror =
        !!o.opponentArchetypeId && o.archetypeId === o.opponentArchetypeId;
      const key = `${dimension}\u0000${id}\u0000${mirror}`;
      const bucket = buckets.get(key) || {
        dimension,
        id,
        label: label || id,
        mirror,
        observations: [],
      };
      bucket.observations.push(o);
      buckets.set(key, bucket);
    }
  }
  return [...buckets.values()]
    .map(({ observations: items, ...bucket }) => {
      const metrics = libraryMetrics(items, segmented);
      const interval = metrics.scoreInterval;
      const classification: LibraryMatchup["classification"] =
        interval && interval[0] > 10
          ? "good"
          : interval && interval[1] < 10
            ? "bad"
            : "uncertain";
      return { ...bucket, metrics, classification };
    })
    .sort(
      (a, b) =>
        Number(a.mirror) - Number(b.mirror) ||
        a.dimension.localeCompare(b.dimension) ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id),
    );
}
