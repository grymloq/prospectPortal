import { NextRequest } from "next/server";
import { GET as state } from "../state/route";
export async function GET(request: NextRequest) {
  const response = await state(request);
  if (!response.ok) return response;
  const view = await response.json();
  return Response.json(
    { notifications: view.notifications || [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
