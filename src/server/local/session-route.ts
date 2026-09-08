import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  db,
  readState,
  checkPassword,
  hashPassword,
  transaction,
} from "@/server/store";
import { sameOrigin } from "./session";
import { catalogue } from "@/lib/catalogue";
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
  try {
    sameOrigin(req);
    const input = schema.parse(await req.json());
    let user;
    if (input.register) {
      if (!input.name) throw new Error("Please enter your name.");
      user = transaction((s) => {
        if (s.users.some((u) => u.email === input.email))
          throw new Error("An account with that email already exists.");
        const u = {
          id: randomBytes(16).toString("hex"),
          name: input.name!,
          email: input.email,
          password: hashPassword(input.password),
          role: "member" as const,
          city: "",
          bio: "",
          faction: catalogue.factions[0].id,
          phaseId: null,
          rejected: false,
          application: "",
        };
        s.users.push(u);
        return u;
      });
    } else {
      user = readState().users.find((u) => u.email === input.email);
      if (
        !user ||
        user.removedAt ||
        !user.password ||
        !checkPassword(input.password, user.password)
      )
        throw new Error("Email or password is incorrect.");
    }
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
      token,
      user.id,
      Date.now() + 7 * 86400000,
    );
    const response = NextResponse.json({ ok: true });
    response.cookies.set("team_session", token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 86400,
      secure: false,
    });
    return response;
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
  try {
    sameOrigin(req);
    const token = req.cookies.get("team_session")?.value;
    if (token) db.prepare("DELETE FROM sessions WHERE token=?").run(token);
    const response = NextResponse.json({ ok: true });
    response.cookies.delete("team_session");
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }
}
