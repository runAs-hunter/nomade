import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { RouteRequestSchema, fallbackRoute } from "@/data/route-schema";
import { classifyMessage } from "@/lib/route-classify";
import { requireAccess } from "@/lib/auth/require-access";
import { log } from "@/lib/log";
import { getRequestId } from "@/lib/request-id";

/**
 * POST /api/route — chat topic-routing / classify endpoint (E6, nomade#1).
 *
 * Given a new message + the user's existing thread metadata, returns
 * `{ topic, threadId, title, rationale }`: `threadId` names an existing thread
 * to continue, or is null to open a new one. Classification runs server-side
 * (where ANTHROPIC_API_KEY lives) via a fast model. On any failure it returns a
 * degraded `general` fallback with HTTP 200 so the client is never blocked.
 *
 * F11 step 0: requires a signed-in user (Bearer, `requireAccess`) so the
 * endpoint no longer spends ANTHROPIC_API_KEY anonymously. Unauthenticated
 * requests get the standard 401 UNAUTHENTICATED envelope (with requestId)
 * before the body is parsed or the model is called.
 */

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const logger = log.child({ requestId });
  const auth = await requireAccess(req, {
    requestId,
    logger,
    failMessage: "route unauthenticated",
  });
  if (auth instanceof NextResponse) return auth;

  let message = "";
  try {
    const body = await req.json();
    const parsed = RouteRequestSchema.safeParse(body);
    if (!parsed.success || !parsed.data.message.trim()) {
      return new Response("Missing or empty message", { status: 400 });
    }
    message = parsed.data.message;

    const result = await classifyMessage(client, parsed.data);
    return Response.json(result);
  } catch (err) {
    // classifyMessage already degrades gracefully; this covers body-parse or
    // client-construction failures. Never block the client (AC #5).
    // Never log message content (F11 lock); error name only.
    logger.error("route api error", {
      userId: auth.userId,
      errorName: err instanceof Error ? err.name : "unknown",
    });
    return Response.json(fallbackRoute(message));
  }
}
