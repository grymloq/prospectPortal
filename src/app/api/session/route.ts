import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { localMode, requiredEnv } from "@/server/config";
import { authClient } from "@/server/supabase";
import { sameOrigin } from "@/server/session";
export const runtime = "nodejs";
const schema = z.object({
  email: z
    .email()
    .max(150)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(2).max(100).optional(),
  register: z.boolean().optional(),
});
export async function POST(req: NextRequest) {
  if (localMode())
    return (await import("@/server/local/session-route")).POST(req);
  try {
    sameOrigin(req);
    const input = schema.parse(await req.json());
    const supabase = await authClient();
    if (input.register) {
      if (!input.name) throw new Error("Please enter your name.");
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: { name: input.name },
          emailRedirectTo: new URL("/auth/callback", requiredEnv("SITE_URL"))
            .href,
        },
      });
      if (error) throw error;
      return NextResponse.json(
        {
          ok: true,
          message: data.session
            ? undefined
            : "Check your email to confirm your account, then sign in.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error)
      throw new Error(
        "Could not sign in. Check your email, password, and email confirmation.",
      );
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
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
export async function DELETE(req: NextRequest) {
  if (localMode())
    return (await import("@/server/local/session-route")).DELETE(req);
  try {
    sameOrigin(req);
    const supabase = await authClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not sign out." }, { status: 400 });
  }
}
