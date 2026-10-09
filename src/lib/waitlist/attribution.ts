import { z } from "zod";

/**
 * Waitlist signup attribution (UTMs + referrer host), server-side sanitizing.
 *
 * Attribution is best-effort: every field is optional and any invalid value is
 * DROPPED (stored as null). A signup must never fail because of attribution.
 * Never stores IP, user agent, or a full referrer URL.
 */

export const ATTRIBUTION_MAX_LENGTH = 100;

export const ATTRIBUTION_FIELDS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "referrer_host",
] as const;

export type AttributionField = (typeof ATTRIBUTION_FIELDS)[number];
export type WaitlistAttribution = Record<AttributionField, string | null>;

/** Optional, trimmed, lowercased, charset [a-z0-9._-], max 100. */
export const attributionValueSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(ATTRIBUTION_MAX_LENGTH)
  .regex(/^[a-z0-9._-]+$/);

export function sanitizeAttributionValue(raw: unknown): string | null {
  const parsed = attributionValueSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function bareHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

/** Hostnames (no port) that identify this site for the given request. */
export function ownHostsFromRequest(request: Request): string[] {
  const hosts = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value) return;
    for (const part of value.split(",")) {
      try {
        const hostname = new URL(`http://${part.trim()}`).hostname;
        if (hostname) hosts.add(bareHost(hostname));
      } catch {
        // ignore unparseable header values
      }
    }
  };
  try {
    add(new URL(request.url).host);
  } catch {
    // ignore
  }
  add(request.headers.get("host"));
  add(request.headers.get("x-forwarded-host"));
  return [...hosts];
}

/**
 * Pick attribution fields off an untrusted JSON payload.
 * referrer_host is dropped when it equals one of `ownHosts` (www-insensitive).
 */
export function sanitizeWaitlistAttribution(
  payload: unknown,
  ownHosts: readonly string[] = [],
): WaitlistAttribution {
  const source =
    payload !== null && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const out = {} as WaitlistAttribution;
  for (const field of ATTRIBUTION_FIELDS) {
    out[field] = sanitizeAttributionValue(source[field]);
  }
  if (out.referrer_host) {
    const ref = bareHost(out.referrer_host);
    if (ownHosts.some((h) => bareHost(h) === ref)) {
      out.referrer_host = null;
    }
  }
  return out;
}
