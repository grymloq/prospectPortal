import type { State, User } from "@/lib/types";

export const pendingMembership =
  "Your account is awaiting confirmation by a team administrator.";

// Old records are grandfathered once. Every new registration explicitly sets false.
export function ensureMembership(state: State) {
  let changed = false;
  const legacy = !state.membershipCutoverAt;
  if (!state.membershipCutoverAt) {
    state.membershipCutoverAt = new Date().toISOString();
    changed = true;
  }
  for (const user of state.users) {
    if (user.confirmedMember === undefined) {
      user.confirmedMember = legacy;
      changed = true;
    }
  }
  return changed;
}

export function accessError(user: User) {
  if (user.removedAt) return "Your portal access has been removed.";
  if (!user.confirmedMember) return pendingMembership;
  return null;
}

export function requireMember(user: User) {
  const error = accessError(user);
  if (error) throw new Error(error);
}
