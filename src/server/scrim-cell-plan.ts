import type { ScrimLayoutEdit, ScrimTeam, State, User } from "@/lib/types";
import { requireMember } from "./membership";
import { executeScrim } from "./scrims";
import { scrimScoreStateResponse } from "./scrim-score-response";

export type ScrimCellChange = {
  teamId: string;
  cell: ScrimTeam["estimates"][number];
};

/** Reuse domain validation and reveal-time seeding; transmit only changed cells. */
export function planScrimCell(
  state: State,
  actor: User,
  input: ScrimLayoutEdit,
) {
  requireMember(actor);
  const before = structuredClone(
    state.scrims?.find((s) => s.id === input.scrimId),
  );
  executeScrim(state, actor, input);
  const scrim = state.scrims!.find((s) => s.id === input.scrimId)!;
  const changes: ScrimCellChange[] = [];
  for (const team of scrim.teams) {
    const previous = before?.teams.find((t) => t.id === team.id);
    for (const cell of team.estimates) {
      const old = previous?.estimates.find(
        (e) => e.ownId === cell.ownId && e.enemyId === cell.enemyId,
      );
      if (JSON.stringify(old) !== JSON.stringify(cell))
        changes.push({ teamId: team.id, cell });
    }
  }
  return { changes, response: scrimScoreStateResponse(state, actor, input) };
}
