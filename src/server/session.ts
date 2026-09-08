import type { NextRequest } from "next/server";
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host"))
    throw new Error("Request origin is not allowed.");
}
