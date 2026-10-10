import {
  generateDeadlineNotifications,
  notifyRegistration,
} from "./notifications";
import "server-only";
import type { User as AuthUser } from "@supabase/supabase-js";
import type { State, User, View } from "@/lib/types";
import { catalogue } from "@/lib/catalogue";
import { databaseClient } from "./supabase";
import { execute } from "./service";
import { ensurePatches } from "@/lib/patches";
import { accessError, ensureMembership } from "./membership";
import { previewView } from "./access-preview";
import { ensureArmyLibrary } from "./army-library-versions";
import { maintainLibraryMemberships } from "./army-library-identity";
import {
  maintainLibraryArmySummaries,
  snapshotArmyReferences,
} from "./army-library-summary";
import { timed, timedSync, timingRetry } from "./request-timing";

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
  notifyRegistration(state, actor);
  return { actor, changed: true };
}

export async function cloudView(
  identity: AuthUser,
  command?: unknown,
  trustedUpdate?: (state: State, actor: User) => void,
  inspect?: (state: State, actor: User) => void,
  preview?: string,
): Promise<View> {
  return cloudResult(
    identity,
    (state, actor) => {
      const view = previewView(state, actor, preview);
      inspect?.(state, actor);
      return view;
    },
    command,
    trustedUpdate,
  );
}

/** Project an authorized result within the same revision-checked transaction. */
export async function cloudResult<T>(
  identity: AuthUser,
  project: (state: State, actor: User) => T,
  command?: unknown,
  trustedUpdate?: (state: State, actor: User) => void,
): Promise<T> {
  const db = databaseClient();
  for (let attempt = 0; attempt < 12; attempt++) {
    const { data, error } = await timed("db.read", async () =>
      db.from("portal_state").select("revision,value").eq("id", 1).single(),
    );
    if (error) {
      console.error("Portal read failed:", error.code);
      throw new Error("The workspace is temporarily unavailable.");
    }
    const state = data.value as State;
    const { actor, changed, migrated } = timedSync("state.prepare", () => {
      const patchMigration = ensurePatches(state);
      const memberMigration = ensureMembership(state);
      const libraryMigration = ensureArmyLibrary(state);
      if (libraryMigration) maintainLibraryMemberships(state);
      return {
        ...ensureProfile(state, identity),
        migrated: patchMigration || memberMigration || libraryMigration,
      };
    });
    const denied = accessError(actor);
    if (!denied) {
      if (command !== undefined)
        timedSync("state.command", () => execute(state, actor, command));
      if (trustedUpdate) {
        timedSync("state.command", () => {
          const previousArmies = snapshotArmyReferences(state);
          trustedUpdate(state, actor);
          maintainLibraryArmySummaries(state, previousArmies);
        });
      }
    }
    const notificationChanged = timedSync("state.notifications", () => {
      const before = JSON.stringify(state.notifications);
      generateDeadlineNotifications(state);
      return before !== JSON.stringify(state.notifications);
    });
    const resultValue = denied
      ? null
      : timedSync("state.project", () => project(state, actor));
    if (
      !notificationChanged &&
      !changed &&
      !migrated &&
      (denied || (command === undefined && !trustedUpdate))
    ) {
      if (denied) throw new Error(denied);
      return resultValue!;
    }
    const result = await timed("db.commit", async () =>
      db.rpc("portal_commit", {
        expected_revision: data.revision,
        next_value: state,
      }),
    );
    if (result.error) {
      console.error("Portal commit failed:", result.error.code);
      throw new Error("Could not save your changes.");
    }
    if (result.data === true) {
      if (denied) throw new Error(denied);
      return resultValue!;
    }
    // Re-run validation against the winning transaction, preserving caps and evaluation conflicts.
    timingRetry();
  }
  throw new Error("The workspace is busy. Please try again.");
}
