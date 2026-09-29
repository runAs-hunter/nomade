import "server-only";

import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import {
  verifyAccessToken,
  type VerifiedAccess,
} from "@/lib/auth/verify-access-token";
import type { Logger } from "@/lib/log";

export type RequireAccessOptions = {
  /** F1.8 request id — attached to UNAUTHENTICATED envelope. */
  requestId: string;
  /** Optional child logger; never pass Authorization / JWT fields. */
  logger?: Logger;
  /** Log message when auth fails (default: "unauthenticated"). */
  failMessage?: string;
};

/**
 * Shared App Router auth gate (F2.5 / F2.1 §6).
 *
 * Opt-in per route — not Next.js Edge middleware. Verifies Bearer via
 * env-scoped `auth.getUser(jwt)` (`createAnonClient`). On failure returns
 * F1.8 401 `UNAUTHENTICATED` (never logs token bodies).
 *
 * Usage:
 * ```ts
 * const auth = await requireAccess(request, { requestId, logger });
 * if (auth instanceof NextResponse) return auth;
 * // auth.userId / auth.user / auth.accessToken
 * ```
 */
export async function requireAccess(
  request: Request,
  options: RequireAccessOptions,
): Promise<VerifiedAccess | NextResponse> {
  const { requestId, logger, failMessage = "unauthenticated" } = options;
  const verified = await verifyAccessToken(
    request.headers.get("authorization"),
  );

  if (!verified.ok) {
    logger?.info(failMessage, {
      code: ERROR_CODES.UNAUTHENTICATED,
      reason: verified.reason,
    });
    return jsonError({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: "Missing or invalid access token",
      requestId,
      status: 401,
    });
  }

  return verified.value;
}

/**
 * Future IDOR guard (F2.1 §6.5). Returns 403 FORBIDDEN response when the
 * authenticated user does not own the resource; otherwise null.
 */
export function assertSameUser(
  authUserId: string,
  resourceUserId: string,
  requestId: string,
): NextResponse | null {
  if (authUserId === resourceUserId) return null;
  return jsonError({
    code: ERROR_CODES.FORBIDDEN,
    message: "Forbidden",
    requestId,
    status: 403,
  });
}
