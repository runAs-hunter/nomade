import "server-only";

/**
 * Per-IP burst guard for POST /api/waitlist.
 * Prefers a global count in internal.waitlist_rate_limits (migration
 * 20261105120000). Fails open if the store is unavailable so real signups
 * never break. In-memory is intentionally NOT used as the primary store:
 * on serverless it is per-instance and not a global limit.
 */

export const WAITLIST_RATE_LIMIT = 5;
export const WAITLIST_RATE_WINDOW_SECONDS = 60;

export type RateLimitDecision =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number };

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 100);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 100) : null;
}

/**
 * Atomically increment the per-IP window counter via RPC/SQL when available.
 * Returns fail-open (not limited) on any error or missing IP.
 */
export async function checkWaitlistRateLimit(
  request: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { schema: (s: string) => any },
): Promise<RateLimitDecision> {
  const ip = clientIp(request);
  if (!ip) return { limited: false };

  const windowStart = new Date(
    Math.floor(Date.now() / (WAITLIST_RATE_WINDOW_SECONDS * 1000)) *
      WAITLIST_RATE_WINDOW_SECONDS *
      1000,
  ).toISOString();

  try {
    const { data, error } = await client
      .schema("internal")
      .rpc("waitlist_rate_limit_hit", {
        p_ip: ip,
        p_window_start: windowStart,
        p_limit: WAITLIST_RATE_LIMIT,
      });

    if (error) {
      // Table/RPC missing (migration not applied) → fail open.
      return { limited: false };
    }

    // RPC returns { allowed: bool, count: number } or a boolean.
    if (data === true || data === false) {
      if (data) return { limited: false };
      return { limited: true, retryAfterSeconds: WAITLIST_RATE_WINDOW_SECONDS };
    }
    if (data && typeof data === "object") {
      const allowed = (data as { allowed?: boolean }).allowed;
      if (allowed === false) {
        return { limited: true, retryAfterSeconds: WAITLIST_RATE_WINDOW_SECONDS };
      }
      return { limited: false };
    }
    return { limited: false };
  } catch {
    return { limited: false };
  }
}
