import "server-only";

import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import {
  extractBearerToken,
  verifyAccessToken,
} from "@/lib/auth/verify-access-token";
import {
  getServerEnv,
  getSourcesAdminUserIds,
  secretTokenMatches,
} from "@/lib/env";
import type { Logger } from "@/lib/log";

export type SourcesAdmin =
  | { kind: "service" }
  | { kind: "user"; userId: string };

/**
 * F8 admin write gate for /api/sources POST/PATCH/DELETE.
 *
 * Accepts either:
 *  - `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (server-to-server /
 *    Visa Ops tooling; constant-time compare), or
 *  - a valid Supabase user JWT whose user id is in SOURCES_ADMIN_USER_IDS
 *    (Cap-approved admins).
 *
 * Missing/invalid token → 401 UNAUTHENTICATED. Valid user, not admin → 403 FORBIDDEN.
 * Never logs the token.
 */
export async function requireSourcesAdmin(
  request: Request,
  opts: { requestId: string; logger?: Logger },
): Promise<SourcesAdmin | NextResponse> {
  const { requestId, logger } = opts;
  const authorization = request.headers.get("authorization");
  const token = extractBearerToken(authorization);

  const unauthenticated = (reason: string) => {
    logger?.info("sources admin unauthenticated", {
      code: ERROR_CODES.UNAUTHENTICATED,
      reason,
    });
    return jsonError({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: "Missing or invalid access token",
      requestId,
      status: 401,
    });
  };

  if (!token) return unauthenticated("missing");

  let serviceRoleKey: string;
  try {
    serviceRoleKey = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  } catch {
    logger?.error("sources admin env invalid", { code: ERROR_CODES.ENV_INVALID });
    return jsonError({
      code: ERROR_CODES.ENV_INVALID,
      message: "Server not configured",
      requestId,
      status: 500,
    });
  }

  if (secretTokenMatches(token, serviceRoleKey)) {
    return { kind: "service" };
  }

  const verified = await verifyAccessToken(authorization);
  if (!verified.ok) return unauthenticated(verified.reason);

  const admins = getSourcesAdminUserIds();
  if (!admins.includes(verified.value.userId.toLowerCase())) {
    logger?.info("sources admin forbidden", {
      code: ERROR_CODES.FORBIDDEN,
      userId: verified.value.userId,
    });
    return jsonError({
      code: ERROR_CODES.FORBIDDEN,
      message: "Sources admin required",
      requestId,
      status: 403,
    });
  }

  return { kind: "user", userId: verified.value.userId };
}
