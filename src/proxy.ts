import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  if (
    req.cookies.has("team_access_preview") &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.nextUrl.pathname !== "/api/admin/view-as" &&
    !(req.nextUrl.pathname === "/api/session" && req.method === "DELETE")
  ) {
    return NextResponse.json(
      { error: "Access preview is read-only. Exit preview to make changes." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return NextResponse.next();
}
export const config = { matcher: "/api/:path*" };
