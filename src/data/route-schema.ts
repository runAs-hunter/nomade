import { z } from "zod";

/**
 * Chat topic-routing contract (E6). Shared shape between the `POST /api/route`
 * endpoint and the iOS client's `RoutingService`. The iOS `ChatTopic` enum
 * mirrors `TOPICS` verbatim — keep the two in sync (a fixed taxonomy, like an
 * API enum).
 */

// ─── Topic taxonomy ──────────────────────────────────────────────────────────

/** The fixed set of visa subjects a thread can be about. Derived from the
 *  journey (italy.yaml phases/tasks). `general` is the catch-all fallback. */
export const TOPICS = [
  "passport_docs",
  "income_proof",
  "health_insurance",
  "accommodation",
  "criminal_record",
  "cover_letter",
  "consulate_appointment",
  "visa_fee",
  "permesso",
  "codice_fiscale",
  "anagrafe",
  "family_dependents",
  "general",
] as const;

export const TopicSchema = z.enum(TOPICS);
export type Topic = z.infer<typeof TopicSchema>;

// ─── Request ─────────────────────────────────────────────────────────────────

export const ThreadRefSchema = z.object({
  id: z.string(),
  topic: z.string(),
  title: z.string(),
});
export type ThreadRef = z.infer<typeof ThreadRefSchema>;

export const RouteRequestSchema = z.object({
  message: z.string(),
  existingThreads: z.array(ThreadRefSchema).default([]),
});
export type RouteRequest = z.infer<typeof RouteRequestSchema>;

// ─── Response ────────────────────────────────────────────────────────────────

export const RouteResponseSchema = z.object({
  topic: TopicSchema,
  /** An id from `existingThreads` to continue, or null to open a new thread. */
  threadId: z.string().nullable(),
  title: z.string().min(1),
  rationale: z.string().optional(),
});
export type RouteResponse = z.infer<typeof RouteResponseSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** A concise thread title derived from the message (fallback when the model
 *  doesn't supply one). Trims to a phrase, never empty. */
export function titleFromMessage(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New chat";
  return trimmed.length > 48 ? trimmed.slice(0, 47).trimEnd() + "…" : trimmed;
}

/** The degraded classification returned whenever the model output is missing,
 *  malformed, or the endpoint errors — a new `general` thread. The client is
 *  never blocked (AC #5). */
export function fallbackRoute(message: string): RouteResponse {
  return { topic: "general", threadId: null, title: titleFromMessage(message) };
}

/**
 * Validate a raw model classification into a `RouteResponse`, applying the
 * degraded fallback on any problem. Also enforces that a non-null `threadId` is
 * one of the ids we actually sent (defense in depth; the client re-checks per 3A).
 */
export function coerceRouteResponse(
  candidate: unknown,
  sentThreadIds: string[],
  message: string
): RouteResponse {
  const parsed = RouteResponseSchema.safeParse(candidate);
  if (!parsed.success) return fallbackRoute(message);

  let { threadId } = parsed.data;
  if (threadId !== null && !sentThreadIds.includes(threadId)) {
    threadId = null; // hallucinated id → treat as a new thread
  }
  return { ...parsed.data, threadId };
}
