import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readState, transaction } from "@/server/store";
import { viewState, execute } from "@/server/service";
import { sessionUserId, sameOrigin } from "./session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const id = sessionUserId(req);
  const s = readState();
  const user = s.users.find((u) => u.id === id);
  if (!user)
    return NextResponse.json(
      { error: "Sign in to continue." },
      { status: 401 },
    );
  return NextResponse.json(viewState(s, user), {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const id = sessionUserId(req);
    if (!id)
      return NextResponse.json(
        { error: "Sign in to continue." },
        { status: 401 },
      );
    const body = await req.json();
    const view = transaction((s) => {
      const actor = s.users.find((u) => u.id === id);
      if (!actor) throw new Error("Account not found.");
      execute(s, actor, body);
      return viewState(s, actor);
    });
    return NextResponse.json(view, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError ? e.issues[0].message : (e as Error).message,
      },
      { status: 400 },
    );
  }
}
