import type { NextRequest } from "next/server";
import { db, readState } from "../store";
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host"))
    throw new Error("Request origin is not allowed.");
}
export function sessionUserId(req: NextRequest) {
  const token = req.cookies.get("team_session")?.value;
  if (!token) return null;
  const row = db
    .prepare("SELECT user_id FROM sessions WHERE token=? AND expires>?")
    .get(token, Date.now()) as { user_id: string } | undefined;
  if (
    !row ||
    !readState().users.some((u) => u.id === row.user_id && !u.removedAt)
  )
    return null;
  return row.user_id;
}
