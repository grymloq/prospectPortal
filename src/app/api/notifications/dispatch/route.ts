import { timingSafeEqual } from "node:crypto";
import { deliverNotifications } from "@/server/notification-worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await deliverNotifications(), {
    headers: { "Cache-Control": "no-store" },
  });
}
