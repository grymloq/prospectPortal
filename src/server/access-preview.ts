import type { State, User, View } from "@/lib/types";
import { z } from "zod";
import { requireMember } from "./membership";
import { viewState } from "./service";

export const previewCookie = "team_access_preview";
export const previewSchema = z.object({
  userId: z.string().min(1).max(100),
  role: z.enum(["actual", "member", "admin"]),
});
export function previewActor(state: State, actor: User, raw?: string): User {
  requireMember(actor);
  if (raw && actor.role !== "admin")
    throw new Error("Only administrators can preview access.");
  let target = actor;
  if (raw) {
    const parsed = previewSchema
      .extend({ actorId: z.literal(actor.id) })
      .parse(JSON.parse(raw));
    const user = state.users.find((u) => u.id === parsed.userId);
    if (!user) throw new Error("Preview user not found.");
    requireMember(user);
    target = {
      ...user,
      role: parsed.role === "actual" ? user.role : parsed.role,
    };
  }
  return target;
}
export function previewView(state: State, actor: User, raw?: string): View {
  const view = viewState(state, previewActor(state, actor, raw));
  if (actor.role === "admin") {
    view.accessPreview = {
      active: !!raw,
      actorName: actor.name,
      users: state.users
        .filter((u) => u.confirmedMember && !u.removedAt)
        .map((u) => ({ id: u.id, name: u.name, role: u.role }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  return view;
}
