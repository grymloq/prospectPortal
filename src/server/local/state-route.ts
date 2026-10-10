import { timingJson } from "../request-timing";
import { scrimScoreStateResponse } from "../scrim-score-response";
import { matrixScoreResponse } from "../matrix-score-response";
import { generateDeadlineNotifications } from "../notifications";
import { NextRequest } from "next/server";
import { z } from "zod";
import { transaction } from "@/server/store";
import { viewState, execute } from "@/server/service";
import { sessionUserId, sameOrigin } from "./session";
import { previewCookie, previewView } from "../access-preview";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const id = sessionUserId(req);
  const s = transaction((s) => {
    generateDeadlineNotifications(s);
    return s;
  });
  const user = s.users.find((u) => u.id === id);
  if (!user)
    return timingJson({ error: "Sign in to continue." }, { status: 401 });
  try {
    return timingJson(
      previewView(s, user, req.cookies.get(previewCookie)?.value),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return timingJson(
      { error: (error as Error).message },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const id = sessionUserId(req);
    if (!id)
      return timingJson({ error: "Sign in to continue." }, { status: 401 });
    const body = await req.json();
    if (req.cookies.has(previewCookie))
      throw new Error(
        "Access preview is read-only. Exit preview to make changes.",
      );
    const view = transaction((s) => {
      const actor = s.users.find((u) => u.id === id);
      if (!actor) throw new Error("Account not found.");
      execute(s, actor, body);
      if (body.type === "scrimLayoutEstimate")
        return scrimScoreStateResponse(s, actor, body);
      if (
        body.type === "manualEstimate" &&
        req.nextUrl.searchParams.get("response") === "matrix-score"
      )
        return matrixScoreResponse(s, actor, body);
      return viewState(s, actor);
    });
    return timingJson(view, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return timingJson(
      {
        error:
          e instanceof z.ZodError ? e.issues[0].message : (e as Error).message,
      },
      { status: 400 },
    );
  }
}
