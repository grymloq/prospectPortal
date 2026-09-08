import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { localMode } from "@/server/config";
import { authClient } from "@/server/supabase";
import { cloudView } from "@/server/cloud-store";
import { sameOrigin } from "@/server/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function handle(req: NextRequest, mutate: boolean) {
  try {
    if (mutate) sameOrigin(req);
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
    return NextResponse.json(
      await cloudView(user, mutate ? await req.json() : undefined),
      { headers },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError ? e.issues[0].message : (e as Error).message,
      },
      {
        status:
          (e as Error).message === "Your portal access has been removed."
            ? 401
            : 400,
        headers,
      },
    );
  }
}
export async function GET(req: NextRequest) {
  if (localMode()) return (await import("@/server/local/state-route")).GET(req);
  return handle(req, false);
}
export async function POST(req: NextRequest) {
  if (localMode())
    return (await import("@/server/local/state-route")).POST(req);
  return handle(req, true);
}
