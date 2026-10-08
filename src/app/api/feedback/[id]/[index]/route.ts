import { NextRequest, NextResponse } from "next/server";
import { localMode } from "@/server/config";
import { authClient } from "@/server/supabase";
import { cloudView } from "@/server/cloud-store";
import { feedbackAttachment } from "@/server/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; index: string }> },
) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const { id, index } = await context.params;
    if (!/^\d+$/.test(index)) throw new Error("Attachment not found.");
    let image: ReturnType<typeof feedbackAttachment> | undefined;
    if (localMode()) {
      const { sessionUserId } = await import("@/server/local/session");
      const { readState } = await import("@/server/store");
      const s = readState();
      const actor = s.users.find((u) => u.id === sessionUserId(req));
      if (!actor)
        return NextResponse.json(
          { error: "Sign in to continue." },
          { status: 401, headers },
        );
      image = feedbackAttachment(s, actor, id, Number(index));
    } else {
      const auth = await authClient();
      const {
        data: { user },
        error,
      } = await auth.auth.getUser();
      if (!user || error)
        return NextResponse.json(
          { error: "Sign in to continue." },
          { status: 401, headers },
        );
      await cloudView(user, undefined, undefined, (s, actor) => {
        image = feedbackAttachment(s, actor, id, Number(index));
      });
    }
    return new NextResponse(new Uint8Array(image!.bytes), {
      headers: { ...headers, "Content-Type": image!.contentType },
    });
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json(
      { error: message },
      { status: message === "Admin access required." ? 403 : 404, headers },
    );
  }
}
