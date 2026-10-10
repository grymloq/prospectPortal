import { NextRequest, NextResponse } from "next/server";
import type { State, User } from "@/lib/types";
import { localMode } from "@/server/config";
import { authClient } from "@/server/supabase";
import { cloudResult } from "@/server/cloud-store";
import { previewActor, previewCookie } from "@/server/access-preview";
import {
  generateDeadlineNotifications,
  notificationView,
} from "@/server/notifications";
import { pendingMembership } from "@/server/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  try {
    const project = (state: State, actor: User) => ({
      notifications: notificationView(
        state,
        previewActor(state, actor, req.cookies.get(previewCookie)?.value),
      ),
    });
    if (localMode()) {
      const { sessionUserId } = await import("@/server/local/session");
      const { transaction } = await import("@/server/store");
      const id = sessionUserId(req);
      if (!id)
        return NextResponse.json(
          { error: "Sign in to continue." },
          { status: 401, headers },
        );
      const result = transaction((state) => {
        const actor = state.users.find((user) => user.id === id);
        if (!actor) throw new Error("Sign in to continue.");
        generateDeadlineNotifications(state);
        return project(state, actor);
      });
      return NextResponse.json(result, { headers });
    }
    const {
      data: { user },
      error,
    } = await (await authClient()).auth.getUser();
    if (error || !user)
      return NextResponse.json(
        { error: "Sign in to continue." },
        { status: 401, headers },
      );
    return NextResponse.json(await cloudResult(user, project), { headers });
  } catch (error) {
    const message = (error as Error).message;
    const status = localMode()
      ? 403
      : [pendingMembership, "Your portal access has been removed."].includes(
            message,
          )
        ? 401
        : 400;
    return NextResponse.json({ error: message }, { status, headers });
  }
}
