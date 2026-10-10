import type { State, User } from "@/lib/types";
import type {
  MatrixScoreEdit,
  MatrixScoreUpdate,
} from "@/lib/matrix-score-queue";
import { requireMember } from "./membership";
import { armyKey } from "@/lib/matchups";

/** Only shared matrix records; the command has already passed execute's validation. */
export function matrixScoreResponse(
  state: State,
  actor: User,
  command: MatrixScoreEdit,
): MatrixScoreUpdate {
  requireMember(actor);
  const change = state.matrixChanges?.at(-1);
  if (
    !change ||
    change.userId !== actor.id ||
    change.patchId !== command.patchId ||
    change.layout !== command.layout
  )
    throw new Error("This matrix update is unavailable.");
  const estimate =
    state.manualEstimates?.find(
      (entry) =>
        entry.patchId === change.patchId &&
        entry.row === change.row &&
        entry.column === change.column &&
        entry.layout === change.layout,
    ) || null;
  return {
    kind: "matrix-score",
    viewerId: actor.id,
    change,
    estimate,
    lists: (state.matrixLists || []).filter(
      (entry) =>
        entry.patchId === change.patchId &&
        [change.row, change.column].includes(armyKey(entry.army)),
    ),
  };
}
