import { pushConfigured } from "@/server/notification-worker";
export function GET() {
  return Response.json(
    { publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
