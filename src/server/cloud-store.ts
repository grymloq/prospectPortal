import "server-only";
import type { User as AuthUser } from "@supabase/supabase-js";
import type { State, User, View } from "@/lib/types";
import { catalogue } from "@/lib/catalogue";
import { databaseClient } from "./supabase";
import { execute, viewState } from "./service";
import { ensurePatches } from "@/lib/patches";

function ensureProfile(
  state: State,
  identity: AuthUser,
): { actor: User; changed: boolean } {
  let actor = state.users.find((u) => u.id === identity.id);
  if (actor) {
    const role =
      identity.app_metadata.portal_role === "admin" ? "admin" : "member";
    const changed = actor.role !== role || actor.email !== identity.email;
    actor.role = role;
    actor.email = identity.email || "";
    return { actor, changed };
  }
  // Roles come from trusted app metadata, never editable user metadata.
  actor = {
    id: identity.id,
    email: identity.email || "",
    name: String(identity.user_metadata.name || "New player").slice(0, 100),
    role: identity.app_metadata.portal_role === "admin" ? "admin" : "member",
    faction: catalogue.factions[0].id,
    city: "",
    bio: "",
    phaseId: null,
    rejected: false,
    application: "",
  };
  state.users.push(actor);
  return { actor, changed: true };
}

export async function cloudView(
  identity: AuthUser,
  command?: unknown,
): Promise<View> {
  const db = databaseClient();
  for (let attempt = 0; attempt < 12; attempt++) {
    const { data, error } = await db
      .from("portal_state")
      .select("revision,value")
      .eq("id", 1)
      .single();
    if (error) {
      console.error("Portal read failed:", error.code);
      throw new Error("The workspace is temporarily unavailable.");
    }
    const state = data.value as State;
    const migrated = ensurePatches(state);
    const { actor, changed } = ensureProfile(state, identity);
    if (command !== undefined) execute(state, actor, command);
    const view = viewState(state, actor);
    if (!changed && !migrated && command === undefined) return view;
    const result = await db.rpc("portal_commit", {
      expected_revision: data.revision,
      next_value: state,
    });
    if (result.error) {
      console.error("Portal commit failed:", result.error.code);
      throw new Error("Could not save your changes.");
    }
    if (result.data === true) return view;
    // Re-run validation against the winning transaction, preserving caps and evaluation conflicts.
  }
  throw new Error("The workspace is busy. Please try again.");
}
