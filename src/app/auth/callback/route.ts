import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/server/supabase";
import { requiredEnv } from "@/server/config";
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const origin = requiredEnv("SITE_URL");
  if (code) {
    const supabase = await authClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          req.nextUrl.searchParams.get("next") === "reset"
            ? "/reset-password"
            : "/",
          origin,
        ),
      );
  }
  return NextResponse.redirect(new URL("/auth/error", origin));
}
