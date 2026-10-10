import "server-only";
import type { User as AuthUser } from "@supabase/supabase-js";
import type { State, User } from "@/lib/types";
import { databaseClient } from "./supabase";
import { timed, timedSync } from "./request-timing";
import { cloudResult } from "./cloud-store";

/** The service-only RPC uses one database snapshot and fresh portal membership.
 * Publication and consent are narrowed in SQL and rechecked by the domain query.
 * Keep the compatibility read switch until the write-store migration is complete.
 */
export async function libraryDatabaseResult<T>(
  identity: AuthUser,
  project: (state: State, actor: User) => T,
): Promise<T> {
  if (process.env.LIBRARY_READ_MODE === "legacy")
    return cloudResult(identity, project);
  const { data, error } = await timed("db.read", async () =>
    databaseClient().rpc("library_read_context", { actor_id: identity.id }),
  );
  if (error) {
    const allowed = [
      "Your portal access has been removed.",
      "Your account is awaiting confirmation by a team administrator.",
    ];
    if (error.code === "P0001" && allowed.includes(error.message))
      throw new Error(error.message);
    console.error("Library read failed:", error.code);
    throw new Error("The library is temporarily unavailable.");
  }
  // First login provisions a portal profile through the existing trusted path.
  if (!data) return cloudResult(identity, project);
  const context = data as { state: State; actor: User };
  return timedSync("state.project", () =>
    project(context.state, context.actor),
  );
}
