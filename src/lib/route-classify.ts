import type Anthropic from "@anthropic-ai/sdk";
import {
  TOPICS,
  coerceRouteResponse,
  fallbackRoute,
  type RouteRequest,
  type RouteResponse,
} from "@/data/route-schema";

/**
 * Topic-routing classifier (E6 backend). One fast Anthropic call, forced to
 * emit strict JSON via a tool, then validated + fallback-guarded by
 * `coerceRouteResponse`. Pure enough to unit-test with an injected client.
 *
 * A small/fast model is intentional here — this call gates the send UX and runs
 * on every new-subject message, so latency matters (companion issue nomade#1).
 */

/** Fast, cheap classify model. Distinct from the chat model in `chat/route.ts`. */
export const ROUTE_MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are a router for a chat app about the Italy Digital Nomad Visa. Each conversation thread is about ONE visa subject. Given a new user message and the user's existing threads, decide which subject the message belongs to.

Rules:
- Pick a "topic" from the fixed taxonomy.
- If the message clearly continues one of the existing threads, return that thread's "threadId". Prefer continuing an existing thread when the subject genuinely matches; otherwise return null to start a new thread.
- When starting a new thread, write a concise "title" (a few words naming the subject, e.g. "Proving €28k income").
- Give a one-line "rationale".
- Only use "general" when nothing more specific fits.`;

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_topic",
  description:
    "Classify the user's message into a visa topic and decide thread routing.",
  input_schema: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        enum: [...TOPICS],
        description: "The visa subject this message is about.",
      },
      threadId: {
        type: ["string", "null"],
        description:
          "The id of an existing thread to continue, or null to open a new thread.",
      },
      title: {
        type: "string",
        description: "A concise title for the thread (few words).",
      },
      rationale: {
        type: "string",
        description: "One-line reason for the classification.",
      },
    },
    required: ["topic", "threadId", "title"],
  },
};

function buildUserContent(req: RouteRequest): string {
  const threads =
    req.existingThreads.length === 0
      ? "(none yet)"
      : req.existingThreads
          .map((t) => `- id=${t.id} | topic=${t.topic} | title="${t.title}"`)
          .join("\n");
  return `New message:\n"${req.message}"\n\nExisting threads:\n${threads}`;
}

/**
 * Classify a message. Returns a validated `RouteResponse`; on any model or
 * transport failure, returns the degraded `general` fallback (never throws).
 */
export async function classifyMessage(
  client: Anthropic,
  req: RouteRequest
): Promise<RouteResponse> {
  const sentThreadIds = req.existingThreads.map((t) => t.id);
  try {
    const res = await client.messages.create({
      model: ROUTE_MODEL,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserContent(req) }],
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "tool", name: "classify_topic" },
    });
    const toolUse = res.content.find((b) => b.type === "tool_use");
    return coerceRouteResponse(toolUse?.input, sentThreadIds, req.message);
  } catch {
    return fallbackRoute(req.message);
  }
}
