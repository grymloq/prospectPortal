import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { localMode } from "@/server/config";
import { sameOrigin } from "@/server/session";
import { authClient } from "@/server/supabase";
import { cloudView } from "@/server/cloud-store";
import { catalogue } from "@/lib/catalogue";
import { fetchNewRecruitArmy } from "@/server/newrecruit-army";
import { summarizeLibraryArmy } from "@/server/army-library-summary";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    sameOrigin(req);
    const { url, patchId } = z
      .object({
        url: z.string().max(2000),
        patchId: z.string().min(1).max(100),
      })
      .parse(await req.json());
    let view;
    if (localMode()) {
      const { sessionUserId } = await import("@/server/local/session");
      const { readState } = await import("@/server/store");
      const { viewState } = await import("@/server/service");
      const state = readState();
      const actor = state.users.find(
        (u) => u.id === sessionUserId(req) && !u.removedAt,
      );
      if (!actor)
        return NextResponse.json(
          { error: "Sign in to continue." },
          { status: 401, headers },
        );
      view = viewState(state, actor);
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
      view = await cloudView(user);
    }
    const patch = view.patches.find((p) => p.id === patchId && !p.removedAt);
    if (!patch) throw new Error("Choose an available ruleset.");
    const army = await fetchNewRecruitArmy(url, patch.catalogue || catalogue);
    army.summary = summarizeLibraryArmy(army, patchId, view);
    return NextResponse.json({ army }, { headers });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? "The shared list contains unsupported data."
            : error instanceof Error &&
                !["SyntaxError", "TypeError", "TimeoutError"].includes(
                  error.name,
                )
              ? error.message
              : "Could not load the New Recruit list. Check the link and try again.",
      },
      { status: 400, headers },
    );
  }
}
