import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { State, User } from "@/lib/types";
import { localMode } from "@/server/config";
import { sameOrigin } from "@/server/session";
import { authClient } from "@/server/supabase";
import { cloudView } from "@/server/cloud-store";
import { previewCookie } from "@/server/access-preview";
import { requireMember } from "@/server/membership";
import {
  importLibraryRosters,
  applyLibraryRosterImports,
} from "@/server/army-library-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };
const input = z.object({
  offset: z.number().int().min(0).max(100000).default(0),
});
function authorize(actor: User) {
  requireMember(actor);
  if (actor.role !== "admin") throw new Error("Administrator access required.");
}

/** Network retrieval precedes the transaction; source signatures guard the commit. */
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    if (req.cookies.has(previewCookie))
      throw new Error("Exit access preview before importing lists.");
    const { offset } = input.parse(await req.json());
    let snapshot: State | undefined;
    let commit: (
      batch: Awaited<ReturnType<typeof importLibraryRosters>>,
    ) => Promise<ReturnType<typeof applyLibraryRosterImports>>;
    if (localMode()) {
      const { sessionUserId } = await import("@/server/local/session");
      const { readState, transaction } = await import("@/server/store");
      const actorId = sessionUserId(req);
      snapshot = readState();
      const actor = snapshot.users.find((user) => user.id === actorId);
      if (!actor)
        return NextResponse.json(
          { error: "Sign in to continue." },
          { status: 401, headers },
        );
      authorize(actor);
      commit = async (batch) =>
        transaction((state) => {
          const current = state.users.find((user) => user.id === actorId);
          if (!current) throw new Error("Sign in to continue.");
          authorize(current);
          return applyLibraryRosterImports(state, current, batch.results);
        });
    } else {
      const {
        data: { user },
        error,
      } = await (await authClient()).auth.getUser();
      if (error || !user)
        return NextResponse.json(
          { error: "Sign in to continue." },
          { status: 401, headers },
        );
      await cloudView(user, undefined, undefined, (state, actor) => {
        authorize(actor);
        snapshot = structuredClone(state);
      });
      commit = async (batch) => {
        let report: ReturnType<typeof applyLibraryRosterImports> | undefined;
        await cloudView(user, undefined, (state, actor) => {
          authorize(actor);
          report = applyLibraryRosterImports(state, actor, batch.results);
        });
        return report!;
      };
    }
    if (!snapshot) throw new Error("The workspace is temporarily unavailable.");
    const batch = await importLibraryRosters(snapshot, undefined, {
      offset,
      limit: 20,
    });
    const report = await commit(batch);
    return NextResponse.json(
      {
        report,
        nextOffset: batch.nextOffset,
        summary: `${report.updated} saved lists updated; ${report.complete} complete roster sources, ${report.partial} partial, ${report.failed} failed, ${report.unsupported} unsupported, ${report.skipped} skipped. Historical snapshots were preserved.`,
      },
      { headers },
    );
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Choose a valid import batch."
        : (error as Error).message;
    return NextResponse.json(
      { error: message },
      { status: /access|required|preview/i.test(message) ? 403 : 400, headers },
    );
  }
}
