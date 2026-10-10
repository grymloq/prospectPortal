import { timed, timingJson, withRequestTiming } from "@/server/request-timing";
import { scrimScoreStateResponse } from "@/server/scrim-score-response";
import { matrixScoreResponse } from "@/server/matrix-score-response";
import type { MatrixScoreEdit } from "@/lib/matrix-score-queue";
import type { ScrimLayoutEdit } from "@/lib/types";
import { after } from "next/server";
import { deliverNotifications } from "@/server/notification-worker";
import { NextRequest } from "next/server";
import { z } from "zod";
import { localMode } from "@/server/config";
import { authClient } from "@/server/supabase";
import { cloudResult, cloudView } from "@/server/cloud-store";
import { cloudScrimScore } from "@/server/cloud-scrim-score";
import { sameOrigin } from "@/server/session";
import { pendingMembership } from "@/server/membership";
import { previewCookie } from "@/server/access-preview";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function handle(req: NextRequest, mutate: boolean) {
  try {
    if (mutate) sameOrigin(req);
    const {
      data: { user },
      error,
    } = await timed("auth", async () => (await authClient()).auth.getUser());
    if (error || !user)
      return timingJson(
        { error: "Sign in to continue." },
        { status: 401, headers },
      );
    const command = mutate ? await req.json() : undefined;
    if (
      command?.type === "scrimLayoutEstimate" ||
      (command?.type === "manualEstimate" &&
        req.nextUrl.searchParams.get("response") === "matrix-score")
    ) {
      if (req.cookies.has(previewCookie))
        throw new Error(
          "Access preview is read-only. Exit preview to make changes.",
        );
      const result =
        command.type === "scrimLayoutEstimate" &&
        process.env.SCRIM_SCORE_WRITE_MODE !== "legacy"
          ? await cloudScrimScore(user, command as ScrimLayoutEdit)
          : await cloudResult(
              user,
              (state, actor) =>
                command.type === "scrimLayoutEstimate"
                  ? scrimScoreStateResponse(
                      state,
                      actor,
                      command as ScrimLayoutEdit,
                    )
                  : matrixScoreResponse(
                      state,
                      actor,
                      command as MatrixScoreEdit,
                    ),
              command,
            );
      return timingJson(result, { headers });
    }
    const view = await cloudView(
      user,
      command,
      undefined,
      undefined,
      req.cookies.get(previewCookie)?.value,
    );
    return timingJson(view, { headers });
  } catch (e) {
    return timingJson(
      {
        error:
          e instanceof z.ZodError ? e.issues[0].message : (e as Error).message,
      },
      {
        status: [
          "Your portal access has been removed.",
          pendingMembership,
        ].includes((e as Error).message)
          ? 401
          : 400,
        headers,
      },
    );
  }
}
export async function GET(req: NextRequest) {
  return withRequestTiming("state.read", async () => {
    if (localMode())
      return (await import("@/server/local/state-route")).GET(req);
    return handle(req, false);
  });
}
export async function POST(req: NextRequest) {
  // Planning scores create no notifications. Deadline delivery has a scheduler.
  const scoreOnly =
    (
      await req
        .clone()
        .json()
        .catch(() => null)
    )?.type === "scrimLayoutEstimate";
  if (!scoreOnly)
    after(async () => {
      try {
        await deliverNotifications();
      } catch {
        console.error("Notification delivery deferred to scheduled retry.");
      }
    });
  return withRequestTiming(
    scoreOnly
      ? "scrim.score"
      : req.nextUrl.searchParams.get("response") === "matrix-score"
        ? "matrix.score"
        : "state.write",
    async () => {
      if (localMode())
        return (await import("@/server/local/state-route")).POST(req);
      return handle(req, true);
    },
  );
}
