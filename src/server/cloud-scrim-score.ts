import "server-only";
import type { User as AuthUser } from "@supabase/supabase-js";
import type { ScrimLayoutEdit, State, User } from "@/lib/types";
import { databaseClient } from "./supabase";
import { planScrimCell } from "./scrim-cell-plan";
import { timed, timedSync, timingRetry } from "./request-timing";

export async function cloudScrimScore(
  identity: AuthUser,
  command: ScrimLayoutEdit,
) {
  const db = databaseClient();
  for (let attempt = 0; attempt < 12; attempt++) {
    const read = await timed("db.read", async () =>
      db.rpc("scrim_score_context", {
        actor_id: identity.id,
        scrim_id: command.scrimId,
        team_id: command.teamId,
      }),
    );
    if (read.error) throw new Error(read.error.message);
    if (!read.data)
      throw new Error("The workspace is temporarily unavailable.");
    const context = read.data as {
      revision: number;
      state: State;
      actor: User;
    };
    const plan = timedSync("state.command", () =>
      planScrimCell(context.state, context.actor, command),
    );
    const write = await timed("db.commit", async () =>
      db.rpc("scrim_score_commit", {
        actor_id: identity.id,
        expected_revision: context.revision,
        scrim_id: command.scrimId,
        expected_scrim_revision: command.revision,
        team_id: command.teamId,
        cell_changes: plan.changes,
      }),
    );
    if (write.error) {
      console.error("Scrim cell commit failed:", write.error.code);
      throw new Error("Could not save your changes.");
    }
    if (write.data === true) return plan.response;
    // Permission/dependency changes invalidate the snapshot; validate afresh.
    timingRetry();
  }
  throw new Error("The workspace is busy. Please try again.");
}
