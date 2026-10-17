import { handleAsk } from "@/lib/ask/handler";
import { gatewayAskModel } from "@/lib/ask/model";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/ask (F11b "Ask Nomade") — Bearer + active account. ASK_ENABLED only
 * (503 ASK_DISABLED). Grounded in active internal.sources + the user's visible
 * checklist + intake. SSE: {delta:{text}}… {final:{…}} [DONE]. See docs/ask.md.
 */
export async function POST(request: Request): Promise<Response> {
  return handleAsk(request, { service: createServiceClient, model: gatewayAskModel });
}
