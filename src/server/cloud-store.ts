import "server-only";
import type { User as AuthUser } from "@supabase/supabase-js";
import type { State, User, View } from "@/lib/types";
import { catalogue } from "@/lib/catalogue";
import { databaseClient } from "./supabase";
import { execute, viewState } from "./service";
import { ensurePatches } from "@/lib/patches";
import { accessError, ensureMembership } from "./membership";

export function ensureProfile(
  state: State,
  identity: AuthUser,
): { actor: User; changed: boolean } {
  let actor = state.users.find((u) => u.id === identity.id);
  if (actor) {
    if (actor.removedAt)
      throw new Error("Your portal access has been removed.");
    // Once provisioned, portal roles are authoritative and changed atomically by admins.
    const accepted =
      !!identity.last_sign_in_at && !!actor.invitedAt && !actor.acceptedAt;
    const changed = actor.email !== identity.email || accepted;
    actor.email = identity.email || "";
    if (accepted) actor.acceptedAt = identity.last_sign_in_at;
    return { actor, changed };
  }
  // Roles come from trusted app metadata, never editable user metadata.
  actor = {
    id: identity.id,
    email: identity.email || "",
    name: String(identity.user_metadata.name || "New player").slice(0, 100),
    role: identity.app_metadata.portal_role === "admin" ? "admin" : "member",
    confirmedMember:
      !!state.membershipCutoverAt &&
      Date.parse(identity.created_at) <= Date.parse(state.membershipCutoverAt),
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
  trustedUpdate?: (state: State, actor: User) => void,
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
    const patchMigration = ensurePatches(state);
    const memberMigration = ensureMembership(state);
    const migrated = patchMigration || memberMigration;
    const { actor, changed } = ensureProfile(state, identity);
    const denied = accessError(actor);
    if (!denied) {
      if (command !== undefined) execute(state, actor, command);
      if (trustedUpdate) trustedUpdate(state, actor);
    }
    const view = denied ? null : viewState(state, actor);
    if (
      !changed &&
      !migrated &&
      (denied || (command === undefined && !trustedUpdate))
    ) {
      if (denied) throw new Error(denied);
      return view!;
    }
    const result = await db.rpc("portal_commit", {
      expected_revision: data.revision,
      next_value: state,
    });
    if (result.error) {
      console.error("Portal commit failed:", result.error.code);
      throw new Error("Could not save your changes.");
    }
    if (result.data === true) {
      if (denied) throw new Error(denied);
      return view!;
    }
    // Re-run validation against the winning transaction, preserving caps and evaluation conflicts.
  }
  throw new Error("The workspace is busy. Please try again.");
}
