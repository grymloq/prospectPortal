import type { State, User } from "@/lib/types";
import { execute } from "./service";
import { randomUUID } from "node:crypto";

export function prepareAccountDeletion(
  state: State,
  actor: User,
  userId: string,
) {
  if (actor.role !== "admin" || !actor.confirmedMember || actor.removedAt)
    throw new Error("Admin access required.");
  const target = state.users.find((user) => user.id === userId);
  if (!target) throw new Error("User not found.");
  if (target.id === actor.id)
    throw new Error("Ask another administrator to delete your account.");
  if (!target.removedAt) execute(state, actor, { type: "removeUser", userId });
  return target;
}

export function completeAccountDeletion(
  state: State,
  actor: User,
  userId: string,
) {
  const target = prepareAccountDeletion(state, actor, userId);
  if (target.accountDeletedAt) return;
  target.password = undefined;
  target.inviteTokenHash = undefined;
  target.inviteExpiresAt = undefined;
  target.accountDeletedAt = new Date().toISOString();
  state.audit.unshift({
    id: randomUUID(),
    actor: actor.id,
    text: `${actor.name} deleted the login account for ${target.name}. Journals and team history retained.`,
    createdAt: target.accountDeletedAt,
  });
}
