import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { localMode, requiredEnv } from "@/server/config";
import { sameOrigin } from "@/server/session";
import { authClient, databaseClient } from "@/server/supabase";
import { cloudView, ensureProfile } from "@/server/cloud-store";
import { viewState } from "@/server/service";
import { catalogue } from "@/lib/catalogue";
import type { State, User } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .email()
    .max(150)
    .transform((v) => v.toLowerCase()),
});
function admin(actor: User) {
  if (actor.removedAt || actor.role !== "admin")
    throw new Error("Admin access required.");
}
function inviteAllowed(s: State, email: string) {
  const existing = s.users.find((u) => u.email.toLowerCase() === email);
  if (
    existing &&
    (existing.removedAt || !existing.invitedAt || existing.acceptedAt)
  )
    throw new Error(
      "An account with this email already exists. Manage it in the user list.",
    );
  return existing;
}
function record(s: State, actor: User, user: User) {
  admin(actor);
  const existing = inviteAllowed(s, user.email);
  if (existing && existing.id !== user.id)
    throw new Error("This email belongs to another account.");
  if (existing) Object.assign(existing, { ...user, role: existing.role });
  else s.users.push(user);
  s.audit.unshift({
    id: randomUUID(),
    actor: actor.id,
    text: `${actor.name} created an invitation link for ${user.name} (${user.email}).`,
    createdAt: new Date().toISOString(),
  });
}
async function handle(req: NextRequest, invite: boolean) {
  try {
    if (invite) sameOrigin(req);
    const input = invite ? schema.parse(await req.json()) : null;
    if (localMode()) {
      const { sessionUserId } = await import("@/server/local/session");
      const { transaction, readState } = await import("@/server/store");
      const actorId = sessionUserId(req),
        actor = readState().users.find((u) => u.id === actorId);
      if (!actor)
        return NextResponse.json(
          { error: "Sign in to continue." },
          { status: 401, headers },
        );
      admin(actor);
      if (!input)
        return NextResponse.json(
          { view: viewState(readState(), actor) },
          { headers },
        );
      const token = randomBytes(32).toString("hex");
      const view = transaction((s) => {
        const current = s.users.find((u) => u.id === actorId)!;
        admin(current);
        const existing = inviteAllowed(s, input.email);
        const user: User = {
          id: existing?.id || randomUUID(),
          name: input.name,
          email: input.email,
          role: "member",
          faction: catalogue.factions[0].id,
          city: "",
          bio: "",
          phaseId: null,
          rejected: false,
          application: "",
          invitedAt: new Date().toISOString(),
          inviteTokenHash: createHash("sha256").update(token).digest("hex"),
          inviteExpiresAt: Date.now() + 86400000,
        };
        record(s, current, user);
        return viewState(s, current);
      });
      const url = new URL("/accept-invite", req.nextUrl.origin);
      url.searchParams.set("token", token);
      return NextResponse.json(
        {
          view,
          inviteUrl: url.href,
          message:
            "Copy and share this one-time invitation. No email was sent. Local links expire after 24 hours.",
        },
        { headers },
      );
    }
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
    admin((await cloudView(user)).me);
    const db = databaseClient();
    // Include auth accounts that have registered but have never opened the portal.
    const identities: import("@supabase/supabase-js").User[] = [];
    for (let page = 1; ; page++) {
      const { data, error } = await db.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error("Could not load the account directory.");
      identities.push(...data.users);
      if (data.users.length < 200) break;
    }
    const view = await cloudView(user, undefined, (s, actor) => {
      admin(actor);
      for (const identity of identities) {
        if (s.users.find((u) => u.id === identity.id)?.removedAt) continue;
        const profile = ensureProfile(s, identity).actor;
        if (identity.invited_at) profile.invitedAt ||= identity.invited_at;
        if (identity.last_sign_in_at)
          profile.acceptedAt ||= identity.last_sign_in_at;
      }
    });
    if (!input) return NextResponse.json({ view }, { headers });
    inviteAllowed(view, input.email);
    const result = await db.auth.admin.generateLink({
      type: "invite",
      email: input.email,
      options: { data: { name: input.name } },
    });
    if (
      result.error ||
      !result.data.user ||
      !result.data.properties?.hashed_token
    )
      throw new Error(
        "Could not create invitation. The email may already have an active account.",
      );
    const invited = result.data.user;
    const next = await cloudView(user, undefined, (s, actor) =>
      record(s, actor, {
        id: invited.id,
        name: input.name,
        email: input.email,
        role: "member",
        faction: catalogue.factions[0].id,
        city: "",
        bio: "",
        phaseId: null,
        rejected: false,
        application: "",
        invitedAt: new Date().toISOString(),
      }),
    );
    const url = new URL("/auth/confirm", requiredEnv("SITE_URL"));
    url.searchParams.set("type", "invite");
    url.searchParams.set("token_hash", result.data.properties.hashed_token);
    return NextResponse.json(
      {
        view: next,
        inviteUrl: url.href,
        message:
          "Copy and share this one-time invitation. No email was sent. If it expires, generate a new link for the invited user.",
      },
      { headers },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError ? e.issues[0].message : (e as Error).message,
      },
      {
        status: (e as Error).message === "Admin access required." ? 403 : 400,
        headers,
      },
    );
  }
}
export const GET = (req: NextRequest) => handle(req, false);
export const POST = (req: NextRequest) => handle(req, true);
