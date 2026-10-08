import { NextRequest, NextResponse } from "next/server";
import { localMode } from "@/server/config";
import { sameOrigin } from "@/server/session";
import {
  previewCookie,
  previewSchema,
  previewView,
} from "@/server/access-preview";
import { authClient } from "@/server/supabase";
import { cloudView } from "@/server/cloud-store";
import type { View } from "@/lib/types";
const headers = { "Cache-Control": "private, no-store" };
async function change(req: NextRequest, exit: boolean) {
  try {
    sameOrigin(req);
    const choice = exit ? null : previewSchema.parse(await req.json());
    let value = "";
    let view: View;
    if (localMode()) {
      const { sessionUserId } = await import("@/server/local/session");
      const { readState } = await import("@/server/store");
      const state = readState();
      const actor = state.users.find((u) => u.id === sessionUserId(req));
      if (!actor)
        return NextResponse.json(
          { error: "Sign in to continue." },
          { status: 401, headers },
        );
      value = choice ? JSON.stringify({ ...choice, actorId: actor.id }) : "";
      view = previewView(state, actor, value);
    } else {
      const auth = await authClient();
      const {
        data: { user },
        error,
      } = await auth.auth.getUser();
      if (error || !user)
        return NextResponse.json(
          { error: "Sign in to continue." },
          { status: 401, headers },
        );
      value = choice ? JSON.stringify({ ...choice, actorId: user.id }) : "";
      view = await cloudView(user, undefined, undefined, undefined, value);
    }
    const response = NextResponse.json(view, { headers });
    if (exit) response.cookies.delete(previewCookie);
    else
      response.cookies.set(previewCookie, value, {
        httpOnly: true,
        secure: req.nextUrl.protocol === "https:",
        sameSite: "lax",
        path: "/",
      });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 403, headers },
    );
  }
}
export const POST = (req: NextRequest) => change(req, false);
export const DELETE = (req: NextRequest) => change(req, true);
