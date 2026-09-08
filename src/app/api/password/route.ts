import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authClient } from "@/server/supabase";
import { sameOrigin } from "@/server/session";
import { requiredEnv } from "@/server/config";
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const { email } = z
      .object({ email: z.email().max(150) })
      .parse(await req.json());
    const supabase = await authClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("/auth/callback?next=reset", requiredEnv("SITE_URL"))
        .href,
    });
    return NextResponse.json({
      message:
        "If this address has an account, a password reset link will arrive shortly.",
    });
  } catch {
    return NextResponse.json(
      { error: "Could not request a reset. Please try again." },
      { status: 400 },
    );
  }
}
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req);
    const { password } = z
      .object({ password: z.string().min(8).max(128) })
      .parse(await req.json());
    const supabase = await authClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Open a fresh password reset link first." },
        { status: 401 },
      );
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    await supabase.auth.signOut({ scope: "global" });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not update the password. Try another password or request a new link.",
      },
      { status: 400 },
    );
  }
}
