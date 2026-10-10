import type {
  Army,
  ArmyLibraryDTO,
  ArmyListVersion,
  LibraryArchetypeRow,
  LibraryDetail,
  LibraryFilters,
  LibraryListRow,
  LibraryMembership,
  LibraryQuery,
  LibraryVariation,
  State,
  User,
  GameContextReference,
} from "@/lib/types";
import { createHash } from "node:crypto";
import { defaultPatchId, initialPatch } from "@/lib/patches";
import { armyKey } from "@/lib/matchups";
import { scrimListsSubmitted } from "@/lib/scrims";
import {
  archetypeId,
  archetypeName,
  libraryIdentityAliases,
} from "./army-library-identity";
import { summarizeLibraryArmy } from "./army-library-summary";
import { libraryDiscussionView } from "./library-discussions";
import { createLibraryNorms } from "./army-library-norm";
import { importedMatrixArmy } from "./army-library-import";
import {
  filterLibraryObservations,
  LEADING_MINIMUM_MATCHES,
  libraryMatchups,
  libraryMetrics,
  libraryRecentTrend,
  libraryTrends,
  UNCERTAINTY_POLICY,
  type LibraryObservation,
} from "@/lib/army-library-analytics";

type PublicVersion = {
  version: ArmyListVersion;
  membership?: LibraryMembership;
  archetypeId: string;
  variationId?: string;
};
function indexBy<T>(
  values: Iterable<T>,
  key: (value: T) => string | undefined,
) {
  const index = new Map<string, T[]>();
  for (const value of values) {
    const id = key(value);
    if (id === undefined) continue;
    const bucket = index.get(id);
    if (bucket) bucket.push(value);
    else index.set(id, [value]);
  }
  return index;
}
const active = (user: User | undefined): user is User =>
  !!user &&
  user.confirmedMember === true &&
  !user.removedAt &&
  !user.accountDeletedAt;
const publicArmy = (army: Army): Army => {
  const copy = structuredClone(army);
  if (copy.composition) delete copy.composition.canonical;
  return copy;
};
function compactArmy(army: Army): Army {
  const compact = { ...army };
  delete compact.composition;
  // Roster summaries are returned with authorized details, not every table row.
  delete compact.summary;
  return publicArmy(compact);
}
function historyArmy(army: Army): Army {
  const compact = compactArmy(army);
  if (army.composition) {
    compact.composition = structuredClone({
      ...army.composition,
      selections: [],
      canonical: undefined,
    });
    delete compact.composition.canonical;
  }
  return compact;
}
const withinPatch = (patch: string, filters: LibraryFilters) =>
  filters.patchId === "all" || patch === filters.patchId;

export function libraryContextId(
  reference: GameContextReference | undefined,
  pack?: GameContextReference,
): string | undefined {
  if (!reference) return undefined;
  return `context-v1-${createHash("sha256")
    .update(
      JSON.stringify([
        pack?.id || "UNKNOWN",
        pack?.version || "UNKNOWN",
        pack?.source || "UNKNOWN",
        reference.id,
        reference.version,
        reference.source || "UNKNOWN",
      ]),
    )
    .digest("hex")}`;
}
function contextName(
  reference: GameContextReference | undefined,
  pack?: GameContextReference,
) {
  return reference
    ? `${reference.name} · ${reference.version}${pack ? ` · ${pack.name} ${pack.version}` : ""}`
    : undefined;
}

function matchesArmy(army: Army, name: string, filters: LibraryFilters) {
  const search = filters.search?.trim().toLocaleLowerCase();
  return (
    (!filters.faction || army.faction === filters.faction) &&
    (!filters.disposition || army.disposition === filters.disposition) &&
    (!filters.detachments?.length ||
      filters.detachments.every((id) => army.detachments.includes(id))) &&
    (!search ||
      [name, army.factionName, ...army.detachmentNames, army.dispositionName]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search))
  );
}

function publishedVersions(state: State) {
  const aliases = libraryIdentityAliases(state);
  const users = new Map(state.users.map((user) => [user.id, user]));
  const shared = new Map(
    (state.savedArmies || [])
      .filter((list) => list.shared && active(users.get(list.userId)))
      .map((list) => [list.id, list]),
  );
  const memberships = new Map(
    (state.libraryMemberships || []).map((member) => [
      member.versionId,
      member,
    ]),
  );
  const versions = new Map<string, PublicVersion>();
  for (const version of state.armyVersions || []) {
    const list = shared.get(version.listId);
    if (!version.published || !list || list.userId !== version.userId) continue;
    const membership = memberships.get(version.id);
    const validMembership =
      membership &&
      membership.listId === version.listId &&
      membership.patchId === version.patchId
        ? membership
        : undefined;
    versions.set(version.id, {
      version,
      membership: validMembership,
      archetypeId:
        (validMembership &&
          (aliases.archetypes.get(validMembership.archetypeId) ||
            validMembership.archetypeId)) ||
        archetypeId(version.army, version.patchId, state),
      variationId:
        version.army.composition?.status === "complete"
          ? validMembership?.variationId &&
            (aliases.variations.get(validMembership.variationId) ||
              validMembership.variationId)
          : undefined,
    });
  }
  return { users, shared, versions, aliases };
}

function publicRows(
  state: State,
  filters: LibraryFilters,
  sources: ReturnType<typeof publishedVersions>,
) {
  const rows: LibraryListRow[] = [];
  const versionsByList = indexBy(
    [...sources.versions.values()].filter((p) =>
      withinPatch(p.version.patchId, filters),
    ),
    (p) => p.version.listId,
  );
  const sharedSources = new Set(
    [...sources.shared.values()]
      .filter((list) => list.army.listUrl)
      .map((list) =>
        JSON.stringify([list.userId, list.patchId, list.army.listUrl]),
      ),
  );
  for (const list of sources.shared.values()) {
    const eligible = (versionsByList.get(list.id) || []).sort(
      (a, b) =>
        b.version.number - a.version.number ||
        b.version.id.localeCompare(a.version.id),
    );
    const selected =
      eligible.find((p) => p.version.id === list.currentVersionId) ||
      eligible[0];
    if (
      !selected &&
      (list.currentVersionId || !withinPatch(list.patchId, filters))
    )
      continue;
    const army = selected?.version.army || list.army;
    const patchId = selected?.version.patchId || list.patchId;
    rows.push({
      id: list.id,
      kind: "saved",
      name: list.army.listName || army.listName || army.factionName,
      ownerName: sources.users.get(list.userId)!.name,
      army: compactArmy(army),
      patchId,
      versionId: selected?.version.id,
      archetypeId: selected?.archetypeId || archetypeId(army, patchId, state),
      variationId: selected?.variationId,
      compositionStatus: army.composition?.status || "unavailable",
      metrics: libraryMetrics([]),
    });
  }
  const sourcesSeen = new Set<string>();
  for (const matrix of state.matrixLists || []) {
    if (
      !active(sources.users.get(matrix.userId)) ||
      !withinPatch(matrix.patchId, filters)
    )
      continue;
    // Only an explicit source link establishes a duplicate; equal configurations do not.
    if (
      sources.shared.has(matrix.id) ||
      (!!matrix.army.listUrl &&
        sharedSources.has(
          JSON.stringify([matrix.userId, matrix.patchId, matrix.army.listUrl]),
        ))
    )
      continue;
    const source = matrix.army.listUrl
      ? `${matrix.userId}\u0000${matrix.patchId}\u0000${matrix.army.listUrl}`
      : matrix.id;
    if (sourcesSeen.has(source)) continue;
    sourcesSeen.add(source);
    const army = importedMatrixArmy(state, matrix);
    rows.push({
      id: `matrix:${matrix.id}`,
      kind: "matrix",
      name: army.listName || army.factionName,
      ownerName: sources.users.get(matrix.userId)!.name,
      army: compactArmy(army),
      patchId: matrix.patchId,
      archetypeId: archetypeId(army, matrix.patchId, state),
      compositionStatus: army.composition?.status || "unavailable",
      metrics: libraryMetrics([]),
    });
  }
  return rows;
}

/** Resolve facts before filtering; canonical conflicts cannot disappear through a filter. */
function contributedObservations(
  state: State,
  sources: ReturnType<typeof publishedVersions>,
) {
  const observations: LibraryObservation[] = [];
  const conflicts: LibraryObservation[] = [];
  const grouped = new Map<string, LibraryObservation[]>();
  const publicConfigurations = new Map<string, Army>();
  for (const source of sources.versions.values())
    publicConfigurations.set(source.archetypeId, source.version.army);
  for (const source of sources.shared.values())
    if (!source.currentVersionId)
      publicConfigurations.set(
        archetypeId(source.army, source.patchId, state),
        source.army,
      );
  for (const source of state.matrixLists || [])
    if (active(sources.users.get(source.userId)))
      publicConfigurations.set(
        archetypeId(source.army, source.patchId, state),
        source.army,
      );
  for (const game of state.games) {
    if (
      game.libraryContribution !== true ||
      !active(sources.users.get(game.userId))
    )
      continue;
    let own = game.own,
      enemy = game.enemy,
      score = game.score,
      date = game.date;
    let patchId = game.patchId || initialPatch.id;
    let versionId = game.ownListVersionId,
      enemyVersionId = game.enemyListVersionId;
    let context = game.gameContext;
    let matchId = game.canonicalMatchId
      ? `linked:${game.canonicalMatchId}`
      : `journal:${game.id}`;
    let sideId = game.userId;
    if (game.scrimId || game.scrimPairingId) {
      const scrim = (state.scrims || []).find((s) => s.id === game.scrimId);
      const pairing = scrim?.pairings.find((p) => p.id === game.scrimPairingId);
      if (
        !scrim ||
        !pairing ||
        scrim.cancelled ||
        !(Date.now() >= Date.parse(scrim.submissionDeadline)) ||
        !scrimListsSubmitted(scrim) ||
        pairing.scoreA === undefined ||
        !pairing.date
      )
        continue;
      const a = scrim.teams[0].entries.find(
        (entry) => entry.id === pairing.aId,
      );
      const b = scrim.teams[1].entries.find(
        (entry) => entry.id === pairing.bId,
      );
      const ownEntry =
        a?.userId === game.userId
          ? a
          : b?.userId === game.userId
            ? b
            : undefined;
      const enemyEntry = ownEntry === a ? b : a;
      if (!ownEntry?.army || !enemyEntry?.army) continue;
      own = ownEntry.army;
      enemy = enemyEntry.army;
      versionId = ownEntry.listVersionId;
      enemyVersionId = enemyEntry.listVersionId;
      score = ownEntry === a ? pairing.scoreA : 20 - pairing.scoreA;
      date = pairing.date;
      patchId = scrim.patchId;
      context = pairing.gameContext;
      if (ownEntry !== a && context)
        context = {
          ...context,
          ownMission: context.enemyMission,
          enemyMission: context.ownMission,
        };
      matchId = `scrim:${scrim.id}:${pairing.id}`;
      sideId = ownEntry === a ? "a" : "b";
    }
    if (
      !Number.isFinite(score) ||
      score < 0 ||
      score > 20 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    )
      continue;
    const publicOwn = versionId ? sources.versions.get(versionId) : undefined;
    const ownVersion =
      publicOwn &&
      publicOwn.version.userId === game.userId &&
      publicOwn.version.patchId === patchId &&
      armyKey(publicOwn.version.army) === armyKey(own)
        ? publicOwn
        : undefined;
    // Consent is not publication of a private or withdrawn list snapshot.
    if (versionId && !ownVersion) continue;
    const publicEnemy = enemyVersionId
      ? sources.versions.get(enemyVersionId)
      : undefined;
    const enemyVersion =
      publicEnemy &&
      publicEnemy.version.patchId === patchId &&
      armyKey(publicEnemy.version.army) === armyKey(enemy)
        ? publicEnemy
        : undefined;
    const independentlyPublicEnemy = publicConfigurations.get(
      archetypeId(enemy, patchId, state),
    );
    const observation: LibraryObservation = {
      matchId,
      sideId,
      contributorId: game.userId,
      patchId,
      date,
      score,
      army: ownVersion?.version.army || own,
      archetypeId: ownVersion?.archetypeId || archetypeId(own, patchId, state),
      listId: ownVersion?.version.listId,
      versionId: ownVersion?.version.id,
      variationId: ownVersion?.variationId,
      // The consenting perspective authorizes faction-level facts; finer enemy dimensions require independent publication.
      opponentFaction: enemy.faction,
      opponentFactionName: enemy.factionName,
      opponentArchetypeId:
        enemyVersion?.archetypeId ||
        (independentlyPublicEnemy
          ? archetypeId(enemy, patchId, state)
          : undefined),
      opponentArchetypeName: enemyVersion
        ? archetypeName(enemyVersion.version.army)
        : independentlyPublicEnemy
          ? archetypeName(independentlyPublicEnemy)
          : undefined,
      opponentListId: enemyVersion?.version.listId,
      opponentListName:
        enemyVersion?.version.army.listName ||
        (enemyVersion ? enemyVersion.version.army.factionName : undefined),
      opponentVariationId: enemyVersion?.variationId,
      deploymentId: libraryContextId(context?.deployment, context?.missionPack),
      deploymentName: contextName(context?.deployment, context?.missionPack),
      missionId: libraryContextId(context?.ownMission, context?.missionPack),
      missionName: contextName(context?.ownMission, context?.missionPack),
    };
    grouped.set(matchId, [...(grouped.get(matchId) || []), observation]);
  }
  for (const [matchId, group] of grouped) {
    const sides = new Map<string, LibraryObservation[]>();
    for (const o of group)
      sides.set(o.sideId, [...(sides.get(o.sideId) || []), o]);
    const unique = [...sides.values()].map((items) => items[0]);
    const sideConflict = [...sides.values()].some((items) =>
      items.some(
        (o) =>
          o.score !== items[0].score ||
          o.patchId !== items[0].patchId ||
          o.date !== items[0].date ||
          o.archetypeId !== items[0].archetypeId ||
          o.versionId !== items[0].versionId ||
          o.opponentFaction !== items[0].opponentFaction ||
          o.opponentArchetypeId !== items[0].opponentArchetypeId ||
          o.opponentListId !== items[0].opponentListId ||
          o.opponentVariationId !== items[0].opponentVariationId ||
          o.deploymentId !== items[0].deploymentId ||
          o.missionId !== items[0].missionId,
      ),
    );
    const crossConflict =
      !matchId.startsWith("scrim:") &&
      (unique.length > 2 ||
        unique.some(
          (o) => o.patchId !== unique[0].patchId || o.date !== unique[0].date,
        ) ||
        (unique.length === 2 &&
          (unique[0].score + unique[1].score !== 20 ||
            unique[0].army.faction !== unique[1].opponentFaction ||
            unique[1].army.faction !== unique[0].opponentFaction)));
    if (sideConflict || crossConflict) conflicts.push(...unique);
    else observations.push(...unique);
  }
  return { observations, conflicts };
}

function rank<
  T extends {
    id: string;
    name: string;
    metrics: ReturnType<typeof libraryMetrics>;
  },
>(rows: T[], sort: LibraryQuery["sort"]) {
  return rows.sort(
    (a, b) =>
      (sort === "score"
        ? (b.metrics.averageScore ?? -1) - (a.metrics.averageScore ?? -1)
        : sort === "matches"
          ? b.metrics.recordedMatches - a.metrics.recordedMatches
          : 0) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}

/** Purpose-built shared DTO. Admin access uses exactly the member-visible sources. */
export function queryArmyLibrary(
  state: State,
  actor: User,
  query: LibraryQuery,
): ArmyLibraryDTO {
  if (!active(state.users.find((user) => user.id === actor.id)))
    throw new Error("Confirmed membership required.");
  const sources = publishedVersions(state);
  // Standards use all published sources, independent of search, paging and game filters.
  let norms: ReturnType<typeof createLibraryNorms> | undefined;
  const getNorms = () =>
    (norms ||= createLibraryNorms(state, actor, sources.versions.values()));
  const matrixRows = new Map(
    (state.matrixLists || []).map((entry) => [`matrix:${entry.id}`, entry]),
  );
  const rosterArmy = (row: LibraryListRow): Army => {
    const version = sources.versions.get(row.versionId || "");
    if (version) return version.version.army;
    if (row.kind === "matrix") {
      const matrix = matrixRows.get(row.id);
      if (matrix) return importedMatrixArmy(state, matrix);
    }
    return row.army;
  };
  const filters: LibraryFilters = {
    patchId: query.patchId || defaultPatchId(state),
    search: query.search,
    faction: query.faction,
    detachments: query.detachments,
    disposition: query.disposition,
    opponentFaction: query.opponentFaction,
    opponentArchetypeId:
      query.opponentArchetypeId &&
      (sources.aliases.archetypes.get(query.opponentArchetypeId) ||
        query.opponentArchetypeId),
    opponentListId: query.opponentListId,
    opponentVariationId:
      query.opponentVariationId &&
      (sources.aliases.variations.get(query.opponentVariationId) ||
        query.opponentVariationId),
    deploymentId: query.deploymentId,
    missionId: query.missionId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  };
  const visibleRows = publicRows(state, filters, sources);
  const built = contributedObservations(state, sources);
  const observations = filterLibraryObservations(built.observations, filters);
  const conflicts = filterLibraryObservations(built.conflicts, filters);
  const segmented = filters.patchId === "all";
  const byList = indexBy(observations, (o) => o.listId);
  const byVersion = indexBy(observations, (o) => o.versionId);
  const byArchetype = indexBy(observations, (o) => o.archetypeId);
  const byVariation = indexBy(observations, (o) => o.variationId);
  const listObservations = (id: string) => byList.get(id) || [];
  const versionObservations = (id: string) => byVersion.get(id) || [];
  const archetypeObservations = (id: string) => byArchetype.get(id) || [];
  const withNorm = (row: LibraryListRow): LibraryListRow => ({
    ...row,
    norm: getNorms().summary(
      rosterArmy(row),
      row.archetypeId,
      row.patchId,
      row.versionId,
      row.kind === "saved",
    ),
  });
  const rows: LibraryListRow[] = visibleRows
    .filter((row) =>
      matchesArmy(row.army, `${row.name} ${row.ownerName}`, filters),
    )
    .map((row) => ({
      ...row,
      norm: undefined,
      metrics: libraryMetrics(
        row.kind === "saved" ? listObservations(row.id) : [],
        segmented,
      ),
      recentTrend: libraryRecentTrend(
        row.kind === "saved" ? listObservations(row.id) : [],
        segmented,
      ),
    }));
  const publicMembers = [...sources.versions.values()].filter((p) =>
    withinPatch(p.version.patchId, filters),
  );
  const membersByArchetype = indexBy(publicMembers, (p) => p.archetypeId);
  const visibleById = new Map(visibleRows.map((row) => [row.id, row]));
  const groupedRows = new Map<string, LibraryListRow[]>();
  // Public historical memberships stay discoverable even after configuration edits.
  for (const row of rows)
    groupedRows.set(row.archetypeId, [
      ...(groupedRows.get(row.archetypeId) || []),
      row,
    ]);
  for (const member of publicMembers) {
    if (
      !matchesArmy(
        member.version.army,
        member.version.army.listName || member.version.army.factionName,
        filters,
      )
    )
      continue;
    if (
      groupedRows
        .get(member.archetypeId)
        ?.some((row) => row.id === member.version.listId)
    )
      continue;
    const row = visibleById.get(member.version.listId);
    if (row)
      groupedRows.set(member.archetypeId, [
        ...(groupedRows.get(member.archetypeId) || []),
        {
          ...row,
          army: compactArmy(member.version.army),
          patchId: member.version.patchId,
          archetypeId: member.archetypeId,
          variationId: member.variationId,
          versionId: member.version.id,
          compositionStatus:
            member.version.army.composition?.status || "unavailable",
          norm: undefined,
        },
      ]);
  }
  const archetypes: LibraryArchetypeRow[] = [...groupedRows].map(
    ([id, lists]) => {
      const listIds = new Set(lists.map((row) => row.id));
      const members = (membersByArchetype.get(id) || []).filter((member) =>
        listIds.has(member.version.listId),
      );
      const known = new Set(
        members.filter((m) => m.variationId).map((m) => m.version.listId),
      );
      return {
        id,
        name: archetypeName(lists[0].army),
        army: publicArmy(lists[0].army),
        publicLists: listIds.size,
        variations: new Set(
          members.map((member) => member.variationId).filter(Boolean),
        ).size,
        unclassifiedLists: [...listIds].filter((listId) => !known.has(listId))
          .length,
        patchIds: [
          ...new Set([
            ...lists.map((list) => list.patchId),
            ...members.map((m) => m.version.patchId),
          ]),
        ].sort(),
        metrics: libraryMetrics(archetypeObservations(id), segmented),
        recentTrend: libraryRecentTrend(archetypeObservations(id), segmented),
      };
    },
  );
  rank(rows, query.sort);
  rank(archetypes, query.sort);
  let detail: LibraryDetail | undefined;
  if (query.target) {
    const target =
      query.target.kind === "archetype"
        ? {
            ...query.target,
            id:
              sources.aliases.archetypes.get(query.target.id) ||
              query.target.id,
          }
        : query.target;
    const list =
      target.kind === "list"
        ? rows.find((row) => row.id === target.id)
        : undefined;
    const archetype =
      target.kind === "archetype"
        ? archetypes.find((row) => row.id === target.id)
        : undefined;
    if (!list && !archetype) throw new Error("Library target unavailable.");
    const identity = list || archetype!;
    let items = list
      ? listObservations(list.id)
      : archetypeObservations(archetype!.id);
    const versions = publicMembers.filter((m) =>
      list ? m.version.listId === list.id : m.archetypeId === archetype!.id,
    );
    const selected = query.versionId
      ? versions.find((m) => m.version.id === query.versionId)
      : undefined;
    if (query.versionId && (!list || !selected))
      throw new Error("Library version unavailable.");
    if (selected) items = versionObservations(selected.version.id);
    const members = selected ? [selected] : versions;
    const variations: LibraryVariation[] = [
      ...new Set(
        members.map((m) => m.variationId).filter((id): id is string => !!id),
      ),
    ]
      .map((id) => {
        const matching = members.filter((m) => m.variationId === id);
        const pooled = byVariation.get(id) || [];
        return {
          id,
          listIds: [...new Set(matching.map((m) => m.version.listId))].sort(),
          composition: structuredClone(matching[0].version.army.composition!),
          metrics: libraryMetrics(pooled, segmented),
          leading: false,
        };
      })
      .sort(
        (a, b) =>
          (b.metrics.averageScore ?? -1) - (a.metrics.averageScore ?? -1) ||
          a.id.localeCompare(b.id),
      );
    const eligible = variations.filter(
      (v) =>
        v.metrics.recordedMatches >= LEADING_MINIMUM_MATCHES &&
        v.metrics.averageScore !== null,
    );
    const best = eligible[0];
    if (best)
      for (const v of eligible)
        v.leading =
          v.metrics.scoreInterval![1] >= best.metrics.scoreInterval![0];
    const relevantConflicts = conflicts.filter((o) =>
      selected
        ? o.versionId === selected.version.id
        : list
          ? o.listId === list.id
          : o.archetypeId === archetype!.id,
    );
    const segmentIds = [
      ...new Set([
        ...members.map((m) => m.version.patchId),
        ...items.map((o) => o.patchId),
        ...(list ? [list.patchId] : archetype!.patchIds),
      ]),
    ].sort();
    detail = {
      target,
      name: identity.name,
      army: publicArmy(
        selected?.version.army ||
          (list?.versionId
            ? sources.versions.get(list.versionId)?.version.army
            : members[0]?.version.army) ||
          (list ? rosterArmy(list) : identity.army),
      ),
      ownerName: list?.ownerName,
      currentSourceUrl:
        list?.kind === "saved"
          ? sources.shared.get(list.id)?.army.listUrl
          : list?.army.listUrl,
      archetypeId: selected?.archetypeId || list?.archetypeId || archetype!.id,
      metrics: libraryMetrics(items, segmented),
      matchups: libraryMatchups(items, segmented),
      trends: libraryTrends(items),
      versions: versions
        .map((m) => ({
          id: m.version.id,
          number: m.version.number,
          patchId: m.version.patchId,
          army: historyArmy(m.version.army),
          createdAt: m.version.createdAt,
          metrics: libraryMetrics(versionObservations(m.version.id)),
        }))
        .sort((a, b) => b.number - a.number || a.id.localeCompare(b.id)),
      variations,
      lists: list
        ? [list]
        : (groupedRows.get(archetype!.id) || []).map((row) => ({
            ...row,
            metrics: libraryMetrics(
              items.filter((o) => o.listId === row.id),
              segmented,
            ),
            recentTrend: libraryRecentTrend(
              items.filter((o) => o.listId === row.id),
              segmented,
            ),
          })),
      discussions: libraryDiscussionView(state, actor, target, {
        patchId: filters.patchId,
        versionId: query.versionId,
      }),
      segments: segmentIds.map((patchId) => ({
        patchId,
        metrics: libraryMetrics(items.filter((o) => o.patchId === patchId)),
        publicLists: new Set([
          ...members
            .filter((m) => m.version.patchId === patchId)
            .map((m) => m.version.listId),
          ...(list
            ? list.patchId === patchId
              ? [list.id]
              : []
            : (groupedRows.get(archetype!.id) || [])
                .filter((row) => row.patchId === patchId)
                .map((row) => row.id)),
        ]).size,
        variations: new Set(
          members
            .filter((m) => m.version.patchId === patchId)
            .map((m) => m.variationId)
            .filter(Boolean),
        ).size,
      })),
      coverage: {
        unclassifiedAppearances: items.filter((o) => !o.variationId).length,
        missingDeployment: items.filter((o) => !o.deploymentId).length,
        missingMission: items.filter((o) => !o.missionId).length,
        conflicts: new Set(relevantConflicts.map((o) => o.matchId)).size,
      },
    };
    const selectedArmy =
      selected?.version.army ||
      (list?.versionId
        ? sources.versions.get(list.versionId)?.version.army
        : undefined) ||
      (list ? rosterArmy(list) : detail.army);
    const comparisonPatch = selected?.version.patchId || list?.patchId;
    if (list && comparisonPatch)
      detail.norm = getNorms().compare(
        selectedArmy,
        detail.archetypeId,
        comparisonPatch,
      );
    if (list && selected)
      detail.lists = [
        {
          ...list,
          army: compactArmy(selected.version.army),
          patchId: selected.version.patchId,
          archetypeId: selected.archetypeId,
          versionId: selected.version.id,
          variationId: selected.variationId,
          metrics: libraryMetrics(items, segmented),
          recentTrend: libraryRecentTrend(items, segmented),
          compositionStatus:
            selected.version.army.composition?.status || "unavailable",
          norm: undefined,
        },
      ];
    if (list)
      detail.army.summary = summarizeLibraryArmy(
        detail.army,
        selected?.version.patchId || list.patchId,
        state,
      );
    detail.standards = segmentIds.flatMap((patchId) => {
      const standard = getNorms().standard(detail!.archetypeId, patchId);
      return standard ? [standard] : [];
    });
    rank(detail.lists, query.sort);
    const relatedPageSize = 20;
    const relatedTotals = {
      discussions: detail.discussions.length,
      lists: detail.lists.length,
      versions: detail.versions.length,
      variations: detail.variations.length,
    };
    const totalPages = Math.max(
      1,
      Math.ceil(
        Math.max(
          relatedTotals.lists,
          relatedTotals.versions,
          relatedTotals.variations,
          relatedTotals.discussions,
        ) / relatedPageSize,
      ),
    );
    const relatedPage = Math.min(
      totalPages,
      Math.max(1, Math.floor(query.relatedPage || 1)),
    );
    const relatedStart = (relatedPage - 1) * relatedPageSize;
    detail.relatedPagination = {
      page: relatedPage,
      pageSize: relatedPageSize,
      ...relatedTotals,
      totalPages,
    };
    detail.lists = detail.lists
      .slice(relatedStart, relatedStart + relatedPageSize)
      .map(withNorm);
    detail.versions = detail.versions.slice(
      relatedStart,
      relatedStart + relatedPageSize,
    );
    detail.variations = detail.variations.slice(
      relatedStart,
      relatedStart + relatedPageSize,
    );
    const discussionRows = new Map(
      detail.discussions.map((row) => [row.id, row]),
    );
    const pagedDiscussions = new Map<
      string,
      (typeof detail.discussions)[number]
    >();
    for (const row of detail.discussions.slice(
      relatedStart,
      relatedStart + relatedPageSize,
    )) {
      let current: typeof row | undefined = row;
      for (let depth = 0; current && depth <= 30; depth++) {
        pagedDiscussions.set(current.id, current);
        current = current.parentId
          ? discussionRows.get(current.parentId)
          : undefined;
      }
    }
    detail.discussions = [...pagedDiscussions.values()].sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  }
  const facets = {
    factions: new Map<string, string>(),
    detachments: new Map<string, string>(),
    dispositions: new Map<string, string>(),
  };
  for (const army of [
    ...visibleRows.map((row) => row.army),
    ...publicMembers.map((member) => member.version.army),
  ]) {
    facets.factions.set(army.faction, army.factionName);
    if (filters.faction && army.faction !== filters.faction) continue;
    army.detachments.forEach((id, i) =>
      facets.detachments.set(id, army.detachmentNames[i] || id),
    );
    if (
      filters.detachments?.length &&
      !filters.detachments.every((id) => army.detachments.includes(id))
    )
      continue;
    facets.dispositions.set(army.disposition, army.dispositionName);
  }
  const facetRows = (map: Map<string, string>) =>
    [...map]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const pageSize = Math.min(100, Math.max(1, Math.floor(query.pageSize || 20)));
  const tab = query.tab || "lists";
  const total = tab === "lists" ? rows.length : archetypes.length;
  const page = Math.min(
    Math.max(1, Math.floor(query.page || 1)),
    Math.max(1, Math.ceil(total / pageSize)),
  );
  const start = (page - 1) * pageSize;
  const factionGroups = new Map<
    string,
    { id: string; name: string; archetypes: number; listIds: Set<string> }
  >();
  for (const archetype of archetypes) {
    const id = archetype.army.faction;
    const group = factionGroups.get(id) || {
      id,
      name: archetype.army.factionName,
      archetypes: 0,
      listIds: new Set<string>(),
    };
    group.archetypes++;
    for (const row of groupedRows.get(archetype.id) || [])
      group.listIds.add(row.id);
    factionGroups.set(id, group);
  }
  return {
    tab,
    filters,
    page,
    pageSize,
    total,
    lists:
      tab === "lists" ? rows.slice(start, start + pageSize).map(withNorm) : [],
    archetypes:
      tab === "archetypes" ? archetypes.slice(start, start + pageSize) : [],
    factionGroups: [...factionGroups.values()]
      .map(({ listIds, ...group }) => ({ ...group, lists: listIds.size }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    detail,
    patches: (state.patches || [])
      .map(({ id, name, date }) => ({ id, name, date }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
    facets: {
      factions: facetRows(facets.factions),
      detachments: facetRows(facets.detachments),
      dispositions: facetRows(facets.dispositions),
    },
    policy: {
      leadingMinimumMatches: LEADING_MINIMUM_MATCHES,
      uncertainty: UNCERTAINTY_POLICY,
    },
  };
}
