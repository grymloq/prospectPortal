import type { State } from "./types";
import { matrixBase, matrixWithEstimates } from "./matchups";

// Pass only server-authorized journals. Both matrix screens use this source.
export function matchupDatabaseBase(
  source: Pick<
    State,
    "games" | "matrixLists" | "matrixListHistory" | "savedArmies"
  >,
  patchId: string,
) {
  return matrixBase(source.games, patchId, [
    ...(source.matrixListHistory || []).map((entry, index) => ({
      ...entry,
      id: `history-${index}`,
      userId: "",
    })),
    ...(source.savedArmies || [])
      .filter((entry) => entry.shared)
      .map((entry) => ({ ...entry, authorName: entry.ownerName })),
    ...(source.matrixLists || []),
  ]);
}

export function matchupDatabase(
  source: Parameters<typeof matchupDatabaseBase>[0] &
    Pick<State, "manualEstimates">,
  patchId: string,
) {
  return matrixWithEstimates(
    matchupDatabaseBase(source, patchId),
    patchId,
    source.manualEstimates || [],
  );
}
