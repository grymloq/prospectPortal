import type { ScrimLayoutEdit, ScrimScoreUpdate, View } from "@/lib/types";
import { onScrimTeam } from "@/lib/scrims";

/** Project only the existing server-authorized view, after the atomic commit. */
export function scrimScoreResponse(
  view: View,
  command: ScrimLayoutEdit,
): ScrimScoreUpdate {
  const scrim = view.scrims?.find((s) => s.id === command.scrimId);
  const team = scrim?.teams.find((t) => t.id === command.teamId);
  const cell = team?.estimates.find(
    (e) => e.ownId === command.ownId && e.enemyId === command.enemyId,
  );
  if (
    !scrim ||
    !team ||
    !cell ||
    !onScrimTeam(team, view.me.id) ||
    view.accessPreview?.active
  )
    throw new Error("This team's matrix is unavailable.");
  return {
    kind: "scrim-score",
    viewerId: view.me.id,
    scrimId: scrim.id,
    revision: scrim.revision,
    teamId: team.id,
    cell,
  };
}
