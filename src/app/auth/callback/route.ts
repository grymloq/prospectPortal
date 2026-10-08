import { NextRequest, NextResponse } from "next/server";
import { authClient } from "@/server/supabase";
import { requiredEnv } from "@/server/config";
import { cloudView } from "@/server/cloud-store";
import { pendingMembership } from "@/server/membership";
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const origin = requiredEnv("SITE_URL");
  if (code) {
    const supabase = await authClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (req.nextUrl.searchParams.get("next") !== "reset" && data.user) {
        try {
          await cloudView(data.user);
        } catch (error) {
          await supabase.auth.signOut();
          return NextResponse.redirect(
            new URL(
              (error as Error).message === pendingMembership
                ? "/auth/pending"
                : "/auth/error",
              origin,
            ),
          );
        }
      }
      return NextResponse.redirect(
        new URL(
          req.nextUrl.searchParams.get("next") === "reset"
            ? "/reset-password"
            : "/",
          origin,
        ),
      );
    }
  }
  return NextResponse.redirect(new URL("/auth/error", origin));
}
