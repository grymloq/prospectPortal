import type { State } from "./types";
import { matrixWithManual } from "./matchups";

// Pass only server-authorized journals. Both matrix screens use this source.
export function matchupDatabase(
  source: Pick<
    State,
    | "games"
    | "matrixLists"
    | "matrixListHistory"
    | "savedArmies"
    | "manualEstimates"
  >,
  patchId: string,
) {
  return matrixWithManual(
    source.games,
    patchId,
    [
      ...(source.matrixListHistory || []).map((entry, index) => ({
        ...entry,
        id: `history-${index}`,
        userId: "",
      })),
      ...(source.savedArmies || [])
        .filter((entry) => entry.shared)
        .map((entry) => ({ ...entry, authorName: entry.ownerName })),
      ...(source.matrixLists || []),
    ],
    source.manualEstimates || [],
  );
}
