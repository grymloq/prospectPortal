import "server-only";
import type { ScrimLayoutEdit, State, User } from "@/lib/types";
import { armyKey } from "@/lib/matchups";
import { databaseClient } from "./supabase";
import { scrimView } from "./scrims";
import { planScrimCell } from "./scrim-cell-plan";

function currentEdit(
  state: State,
  actor: User,
  scrimId: string,
  teamId: string,
): ScrimLayoutEdit {
  const scrim = scrimView(
    state,
    state.scrims!.find((s) => s.id === scrimId)!,
    actor,
  );
  const team = scrim.teams.find((t) => t.id === teamId)!;
  for (const cell of team.estimates) {
    const own = team.entries.find((e) => e.id === cell.ownId)?.army;
    const enemy = (
      cell.enemyId.startsWith("db:")
        ? scrim.databaseEntries
        : scrim.teams.find((t) => t.id !== team.id)?.entries
    )?.find((e) => e.id === cell.enemyId)?.army;
    if (own && enemy)
      return {
        type: "scrimLayoutEstimate",
        scrimId,
        teamId,
        revision: scrim.revision,
        ownId: cell.ownId,
        enemyId: cell.enemyId,
        ownArmyKey: armyKey(own),
        enemyArmyKey: armyKey(enemy),
        layout: "A",
        score: cell.scores.A,
        expectedScore: cell.scores.A,
      };
  }
  throw new Error("No eligible planning cell.");
}

/** No endpoint, session impersonation, retained edits or private log fields. */
export async function validateScrimScoreTransport() {
  const db = databaseClient();
  try {
    const initial = await db
      .from("portal_state")
      .select("value")
      .eq("id", 1)
      .single();
    if (initial.error) throw initial.error;
    const state = initial.data.value as State;
    const eligible = state.scrims
      ?.flatMap((s) =>
        s.cancelled ? [] : s.teams.map((t) => ({ scrim: s, team: t })),
      )
      .find(
        ({ team }) =>
          team.entries.some((e) => e.army) &&
          state.users.some(
            (u) => u.id === team.captainId && u.confirmedMember && !u.removedAt,
          ),
      );
    if (!eligible) throw new Error("No eligible scrim.");
    const actorId = eligible.team.captainId,
      scrimId = eligible.scrim.id,
      teamId = eligible.team.id;
    for (let sample = 0; sample < 3; sample++) {
      for (const mode of ["legacy", "cell"] as const) {
        const started = performance.now();
        const read =
          mode === "legacy"
            ? await db
                .from("portal_state")
                .select("revision,value")
                .eq("id", 1)
                .single()
            : await db.rpc("scrim_score_context", {
                actor_id: actorId,
                scrim_id: scrimId,
                team_id: teamId,
              });
        const readMs = performance.now() - started;
        if (read.error || !read.data) throw new Error("Probe read failed.");
        const context =
          mode === "legacy"
            ? {
                state: read.data.value as State,
                actor: (read.data.value as State).users.find(
                  (u) => u.id === actorId,
                )!,
                revision: read.data.revision as number,
              }
            : (read.data as { state: State; actor: User; revision: number });
        const command = currentEdit(
          context.state,
          context.actor,
          scrimId,
          teamId,
        );
        const plan = planScrimCell(context.state, context.actor, command);
        const parameters = {
          actor_id: actorId,
          expected_revision: context.revision,
          scrim_id: scrimId,
          expected_scrim_revision: command.revision,
          team_id: teamId,
          cell_changes: mode === "cell" ? plan.changes : null,
          legacy_value: mode === "legacy" ? context.state : null,
        };
        const commitStart = performance.now();
        const write = await db.rpc("scrim_score_probe", parameters);
        const commitMs = performance.now() - commitStart;
        if (write.error || write.data !== true)
          throw new Error("Probe commit failed.");
        console.info(
          JSON.stringify({
            event: "scrim_transport_probe",
            mode,
            sample,
            readMs: Math.round(readMs),
            commitMs: Math.round(commitMs),
            elapsedMs: Math.round(performance.now() - started),
            writeBytes: Buffer.byteLength(JSON.stringify(parameters)),
            rolledBack: true,
          }),
        );
      }
    }
  } catch {
    console.error(
      JSON.stringify({ event: "scrim_transport_probe", failed: true }),
    );
  }
}
