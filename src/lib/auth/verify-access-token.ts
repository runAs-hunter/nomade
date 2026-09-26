import "server-only";

import type { User } from "@supabase/supabase-js";
import { createAnonClient } from "@/lib/supabase/server";

export type VerifiedAccess = {
  user: User;
  userId: string;
  accessToken: string;
};

export type VerifyAccessTokenResult =
  | { ok: true; value: VerifiedAccess }
  | { ok: false; reason: "missing" | "invalid" };

/**
 * Extract Bearer token and verify via env-scoped Supabase Auth (F2.3 / F2.1 §6).
 * Uses current project's URL + anon key only — Preview (nomade-dev) never accepts
 * prod JWTs because Preview env points at nomade-dev keys.
 *
 * Prefer getUser(jwt) over jose + JWT secret so we stay on existing env vars.
 */
export function extractBearerToken(
  authorizationHeader: string | null,
): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  return match?.[1] ?? null;
}

export async function verifyAccessToken(
  authorizationHeader: string | null,
): Promise<VerifyAccessTokenResult> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return { ok: false, reason: "missing" };
  }

  try {
    const client = createAnonClient();
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user?.id) {
      return { ok: false, reason: "invalid" };
    }
    return {
      ok: true,
      value: {
        user: data.user,
        userId: data.user.id,
        accessToken: token,
      },
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

/**
 * Resolve Apple identity binding from a verified Auth user.
 * Prefer identity.id; fall back to identity_data.sub.
 * Returns null when no usable Apple binding (treat as UNAUTHENTICATED).
 */
export function resolveAppleProviderSubject(user: User): string | null {
  const identities = user.identities ?? [];
  const apple = identities.find((i) => i.provider === "apple");
  if (!apple) return null;

  const fromId = typeof apple.id === "string" ? apple.id.trim() : "";
  if (fromId) return fromId;

  const data = apple.identity_data as Record<string, unknown> | undefined;
  const sub = data?.sub;
  if (typeof sub === "string" && sub.trim()) return sub.trim();

  return null;
}

/** Log-safe prefix of a subject (never full Apple sub). */
export function subjectPrefix(subject: string, len = 8): string {
  if (subject.length <= len) return subject.slice(0, Math.max(1, len / 2)) + "…";
  return subject.slice(0, len) + "…";
}
