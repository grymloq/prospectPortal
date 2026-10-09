import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { LibraryQuery, State, User } from "@/lib/types";
import { localMode } from "@/server/config";
import { authClient } from "@/server/supabase";
import { cloudView } from "@/server/cloud-store";
import { previewCookie, previewView } from "@/server/access-preview";
import { queryArmyLibrary } from "@/server/army-library";
import { consolidationPreview } from "@/server/army-library-identity";
import { requireMember } from "@/server/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const id = z.string().min(1).max(300);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schema = z.object({
  relatedPage: z.coerce.number().int().min(1).max(100000).optional(),
  tab: z.enum(["lists", "archetypes"]).optional(),
  targetKind: z.enum(["list", "archetype"]).optional(),
  targetId: id.optional(),
  versionId: id.optional(),
  patchId: id.optional(),
  search: z.string().max(200).optional(),
  faction: id.optional(),
  detachments: z.array(id).max(3).optional(),
  disposition: id.optional(),
  opponentFaction: id.optional(),
  opponentArchetypeId: id.optional(),
  opponentListId: id.optional(),
  opponentVariationId: id.optional(),
  deploymentId: id.optional(),
  missionId: id.optional(),
  dateFrom: day.optional(),
  dateTo: day.optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
  sort: z.enum(["name", "score", "matches"]).optional(),
  action: z.enum(["consolidationPreview", "ownVersions"]).optional(),
  listId: id.optional(),
});

export async function GET(req: NextRequest) {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams);
    const detachments = req.nextUrl.searchParams
      .getAll("detachments")
      .flatMap((v) => v.split(","))
      .filter(Boolean);
    const parsed = schema.parse({
      ...params,
      ...(detachments.length ? { detachments } : {}),
    });
    const { targetKind, targetId, action, listId, ...filters } = parsed;
    if (!!targetKind !== !!targetId)
      throw new Error("Choose a valid library target.");
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
      throw new Error("Choose a valid date range.");
    const query: LibraryQuery = {
      ...filters,
      ...(targetKind && targetId
        ? { target: { kind: targetKind, id: targetId } }
        : {}),
    };
    let result: unknown;
    const inspect = (state: State, actor: User) => {
      const viewer = previewView(
        state,
        actor,
        req.cookies.get(previewCookie)?.value,
      ).me;
      requireMember(viewer);
      if (action === "consolidationPreview") {
        if (req.cookies.has(previewCookie))
          throw new Error("Exit access preview before consolidating.");
        result = { preview: consolidationPreview(state, viewer) };
      } else if (action === "ownVersions") {
        if (
          !listId ||
          !state.savedArmies?.some(
            (a) => a.id === listId && a.userId === viewer.id,
          )
        )
          throw new Error("Army list is unavailable.");
        result = {
          versions: (state.armyVersions || [])
            .filter((v) => v.listId === listId && v.userId === viewer.id)
            .map((v) => ({
              id: v.id,
              number: v.number,
              patchId: v.patchId,
              createdAt: v.createdAt,
              published: v.published,
            })),
        };
      } else result = { library: queryArmyLibrary(state, viewer, query) };
    };
    if (localMode()) {
      const { sessionUserId } = await import("@/server/local/session");
      const { transaction } = await import("@/server/store");
      const actorId = sessionUserId(req);
      if (!actorId)
        return NextResponse.json(
          { error: "Sign in to continue." },
          { status: 401, headers },
        );
      transaction((state) => {
        const actor = state.users.find((u) => u.id === actorId);
        if (!actor) throw new Error("Sign in to continue.");
        inspect(state, actor);
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
      await cloudView(
        user,
        undefined,
        undefined,
        inspect,
        req.cookies.get(previewCookie)?.value,
      );
    }
    return NextResponse.json(result, { headers });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Choose valid library filters."
        : (error as Error).message;
    return NextResponse.json(
      { error: message },
      { status: /unavailable/i.test(message) ? 404 : 400, headers },
    );
  }
}
