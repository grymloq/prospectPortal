import { after } from "next/server";
import { deliverNotifications } from "@/server/notification-worker";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { localMode } from "@/server/config";
import { authClient, databaseClient } from "@/server/supabase";
import { sameOrigin } from "@/server/session";
import { cloudView } from "@/server/cloud-store";
import { pendingMembership } from "@/server/membership";
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
  after(async () => {
    try {
      await deliverNotifications();
    } catch {
      console.error("Notification delivery deferred to scheduled retry.");
    }
  });
  if (localMode())
    return (await import("@/server/local/session-route")).POST(req);
  try {
    sameOrigin(req);
    const input = schema.parse(await req.json());
    if (input.register) {
      if (!input.name) throw new Error("Please enter your name.");
      // Server-only creation does not send a confirmation email or issue a session.
      // Portal membership remains pending until explicitly approved by an admin.
      const { data, error } = await databaseClient().auth.admin.createUser({
        email: input.email,
        password: input.password,
        user_metadata: { name: input.name },
        email_confirm: true,
      });
      if (error) throw error;
      if (data.user) {
        try {
          await cloudView(data.user);
        } catch (error) {
          if ((error as Error).message !== pendingMembership) throw error;
        }
      }
      return NextResponse.json(
        {
          ok: true,
          message:
            "Registration received. No email confirmation is needed. An administrator must confirm your membership before you can sign in.",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const supabase = await authClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error)
      throw new Error(
        "Could not sign in. Check your email, password, and email confirmation.",
      );
    try {
      if (!data.user) throw new Error(pendingMembership);
      await cloudView(data.user);
    } catch (error) {
      await supabase.auth.signOut();
      throw error;
    }
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
    const response = NextResponse.json({ ok: true });
    response.cookies.delete("team_access_preview");
    return response;
  } catch {
    return NextResponse.json({ error: "Could not sign out." }, { status: 400 });
  }
}
