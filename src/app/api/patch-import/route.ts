import { NextRequest, NextResponse } from "next/server";
import { localMode } from "@/server/config";
import { sameOrigin } from "@/server/session";
import { authClient } from "@/server/supabase";
import { cloudView } from "@/server/cloud-store";
import { z } from "zod";
import { fetchWarmindPatch } from "@/server/warmind-patch";
import {
  fetchNewRecruitPatch,
  importNewRecruitPatch,
  requirePatchAdmin,
} from "@/server/newrecruit-patch";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    sameOrigin(req);
    const { provider } = z
      .object({
        provider: z.enum(["newrecruit", "warmind"]).default("newrecruit"),
      })
      .parse(await req.json());
    const fetchPatch =
      provider === "warmind" ? fetchWarmindPatch : fetchNewRecruitPatch;
    if (localMode()) {
      const { sessionUserId } = await import("@/server/local/session");
      const { readState, transaction } = await import("@/server/store");
      const { viewState } = await import("@/server/service");
      const id = sessionUserId(req);
      const actor = readState().users.find((u) => u.id === id && !u.removedAt);
      if (!actor)
        return NextResponse.json(
          { error: "Sign in to continue." },
          { status: 401, headers },
        );
      requirePatchAdmin(actor);
      const patch = await fetchPatch();
      const view = transaction((state) => {
        const current = state.users.find((u) => u.id === id);
        if (!current) throw new Error("Admin access required.");
        importNewRecruitPatch(state, current, patch);
        return viewState(state, current);
      });
      return NextResponse.json(view, { headers });
    }
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
    requirePatchAdmin((await cloudView(user)).me);
    const patch = await fetchPatch();
    return NextResponse.json(
      await cloudView(user, undefined, (state, actor) => {
        importNewRecruitPatch(state, actor, patch);
      }),
      { headers },
    );
  } catch (e) {
    const message = (e as Error).message;
    const forbidden = message === "Admin access required.";
    return NextResponse.json(
      {
        error: forbidden
          ? message
          : "Could not import the rules patch from the selected source. Try again later.",
      },
      { status: forbidden ? 403 : 400, headers },
    );
  }
}
