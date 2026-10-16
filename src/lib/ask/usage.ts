/**
 * F11b rate limit + metadata events (`internal.ask_usage` / `internal.ask_events`).
 * No question/answer text is ever written here.
 */

import { createHash } from "crypto";
import type { AccountDbClient } from "@/lib/account/export";
import type { AskOutcome } from "@/lib/ask/copy";
import { ASK_UNGATED_DAILY, type AskConfig } from "@/lib/env";

/** UTC day key (YYYY-MM-DD). */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Next UTC midnight (ISO) — when the daily counter resets. */
export function resetAtFor(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return d.toISOString();
}

/** Cap decision 5: 10 for everyone while the gate is off; else free/paid. */
export function dailyLimitFor(args: { gateEnabled: boolean; journeyFull: boolean; config: AskConfig }): {
  limit: number;
  tier: "ungated" | "free" | "paid";
} {
  if (!args.gateEnabled) return { limit: ASK_UNGATED_DAILY, tier: "ungated" };
  return args.journeyFull
    ? { limit: args.config.paidDaily, tier: "paid" }
    : { limit: args.config.freeDaily, tier: "free" };
}

/** Short, stable, non-reversible user tag for logs and gateway attribution. */
export function userHash(userId: string): string {
  return createHash("sha256").update(`nomade-ask:${userId}`).digest("hex").slice(0, 16);
}

/** Atomic consume. Remaining after this question, or -1 when over the limit. */
export async function consumeAsk(
  service: AccountDbClient,
  userId: string,
  limit: number,
  day: string,
): Promise<{ ok: true; remaining: number } | { ok: false }> {
  try {
    const res = await service
      .schema("internal")
      .rpc("ask_consume", { p_user: userId, p_limit: limit, p_day: day });
    if (res.error || typeof res.data !== "number") return { ok: false };
    return { ok: true, remaining: res.data };
  } catch {
    return { ok: false };
  }
}

/** Best-effort refund after an upstream failure. */
export async function refundAsk(service: AccountDbClient, userId: string, day: string): Promise<void> {
  try {
    await service.schema("internal").rpc("ask_refund", { p_user: userId, p_day: day });
  } catch {
    // best effort
  }
}

export async function readAskUsed(
  service: AccountDbClient,
  userId: string,
  day: string,
): Promise<{ ok: true; used: number } | { ok: false }> {
  try {
    const res = await service
      .schema("internal")
      .from("ask_usage")
      .select("count")
      .eq("user_id", userId)
      .eq("day", day)
      .maybeSingle();
    if (res.error) return { ok: false };
    const row = res.data as { count?: number } | null;
    return { ok: true, used: typeof row?.count === "number" ? row.count : 0 };
  } catch {
    return { ok: false };
  }
}

export type AskEventInput = {
  outcome: AskOutcome;
  sourceIds?: string[];
  focusStepId?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
};

/** Metadata-only event (never text). Best effort: returns false on failure. */
export async function recordAskEvent(
  service: AccountDbClient,
  userId: string,
  ev: AskEventInput,
): Promise<boolean> {
  try {
    const res = await service
      .schema("internal")
      .from("ask_events")
      .insert({
        user_id: userId,
        outcome: ev.outcome,
        source_ids: ev.sourceIds ?? [],
        focus_step_id: ev.focusStepId ?? null,
        model: ev.model ?? null,
        input_tokens: ev.inputTokens ?? null,
        output_tokens: ev.outputTokens ?? null,
        latency_ms: ev.latencyMs ?? null,
      });
    return !res.error;
  } catch {
    return false;
  }
}
