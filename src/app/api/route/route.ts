import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { RouteRequestSchema, fallbackRoute } from "@/data/route-schema";
import { classifyMessage } from "@/lib/route-classify";

/**
 * POST /api/route — chat topic-routing / classify endpoint (E6, nomade#1).
 *
 * Given a new message + the user's existing thread metadata, returns
 * `{ topic, threadId, title, rationale }`: `threadId` names an existing thread
 * to continue, or is null to open a new one. Classification runs server-side
 * (where ANTHROPIC_API_KEY lives) via a fast model. On any failure it returns a
 * degraded `general` fallback with HTTP 200 so the client is never blocked.
 */

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
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
    console.error("Route API error:", err);
    return Response.json(fallbackRoute(message));
  }
}
