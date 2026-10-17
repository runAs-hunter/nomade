import { handleAskUsage } from "@/lib/ask/handler";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ask/usage (F11b) — Bearer + active. Today's question counter. */
export async function GET(request: Request): Promise<Response> {
  return handleAskUsage(request, { service: createServiceClient });
}
