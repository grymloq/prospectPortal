import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { localMode } from "@/server/config";
import { sameOrigin } from "@/server/session";
export async function POST(req: NextRequest) {
  if (!localMode())
    return NextResponse.json(
      { error: "Use your Supabase invitation link." },
      { status: 404 },
    );
  try {
    sameOrigin(req);
    const input = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        password: z.string().min(8).max(128),
      })
      .parse(await req.json());
    const { transaction, hashPassword } = await import("@/server/store");
    const hash = createHash("sha256").update(input.token).digest("hex");
    transaction((s) => {
      const user = s.users.find(
        (u) =>
          u.inviteTokenHash === hash &&
          !u.removedAt &&
          (u.inviteExpiresAt || 0) > Date.now(),
      );
      if (!user) throw new Error("Invitation is invalid or expired.");
      user.password = hashPassword(input.password);
      user.acceptedAt = new Date().toISOString();
      delete user.inviteTokenHash;
      delete user.inviteExpiresAt;
    });
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Invitation is invalid, expired, or password is shorter than eight characters.",
      },
      { status: 400 },
    );
  }
}
