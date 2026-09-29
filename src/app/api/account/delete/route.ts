import { NextResponse } from "next/server";
import {
  isValidDeleteConfirm,
  readAppleAuthorizationCode,
  softDeleteAccount,
} from "@/lib/account/delete";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { requireAccess } from "@/lib/auth/require-access";
import { log } from "@/lib/log";
import { getRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withRequestId<T>(
  body: T,
  status: number,
  requestId: string,
): NextResponse<T> {
  const res = NextResponse.json(body, { status });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}

/**
 * POST /api/account/delete (F2.6 + F2.6r)
 * Bearer via requireAccess + body {"confirm":"DELETE"}.
 * Optional appleAuthorizationCode (native SIWA): revoke at Apple before soft-delete.
 * Soft-delete → pending_deletion; closes active auth_identities.
 * Idempotent 200 when already pending (skips Apple revoke). No Auth deleteUser / purge.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  // 1. requireAccess → userId
  const auth = await requireAccess(request, {
    requestId,
    logger,
    failMessage: "delete unauthenticated",
  });
  if (auth instanceof NextResponse) return auth;

  // 2. Validate confirm
  let parsed: unknown = null;
  const raw = await request.text();
  if (raw.trim().length > 0) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return jsonError({
        code: ERROR_CODES.BAD_REQUEST,
        message: "Malformed JSON body",
        requestId,
        status: 400,
      });
    }
  }

  if (!isValidDeleteConfirm(parsed)) {
    logger.info("delete bad confirm", {
      code: ERROR_CODES.BAD_REQUEST,
      userId: auth.userId,
    });
    return jsonError({
      code: ERROR_CODES.BAD_REQUEST,
      message: 'Body must be {"confirm":"DELETE"}',
      requestId,
      status: 400,
    });
  }

  const appleCode = readAppleAuthorizationCode(parsed);
  if (!appleCode.ok) {
    logger.info("delete bad apple code", {
      code: ERROR_CODES.BAD_REQUEST,
      userId: auth.userId,
    });
    return jsonError({
      code: ERROR_CODES.BAD_REQUEST,
      message: "appleAuthorizationCode must be a string",
      requestId,
      status: 400,
    });
  }

  // 3–5. Apple revoke (when code present) then soft-delete (idempotent)
  let result;
  try {
    const service = createServiceClient();
    result = await softDeleteAccount(service, auth.userId, {
      appleAuthorizationCode: appleCode.code,
    });
  } catch {
    logger.error("delete threw", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId: auth.userId,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected delete failure",
      requestId,
      status: 500,
    });
  }

  if (!result.ok) {
    if (result.code === "NO_USER") {
      logger.info("delete bootstrap required", {
        code: ERROR_CODES.UNAUTHENTICATED,
        userId: auth.userId,
      });
      return jsonError({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: "Bootstrap required",
        requestId,
        status: 401,
      });
    }
    if (result.code === "ACCOUNT_DELETED") {
      logger.info("delete account deleted", {
        code: ERROR_CODES.ACCOUNT_DELETED,
        userId: auth.userId,
      });
      return jsonError({
        code: ERROR_CODES.ACCOUNT_DELETED,
        message: result.message,
        requestId,
        status: 410,
      });
    }
    if (
      result.code === "APPLE_REVOKE_FAILED" ||
      result.code === "APPLE_REVOKE_MISCONFIGURED"
    ) {
      const status = result.code === "APPLE_REVOKE_MISCONFIGURED" ? 503 : 502;
      logger.warn("apple revoke failed", {
        code: result.code,
        userId: auth.userId,
      });
      return jsonError({
        code: result.code,
        message:
          result.code === "APPLE_REVOKE_MISCONFIGURED"
            ? "Apple token revoke is not configured"
            : "Apple token revoke failed",
        requestId,
        status,
      });
    }
    logger.error("delete failed", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId: auth.userId,
      deleteCode: result.code,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Failed to delete account",
      requestId,
      status: 500,
    });
  }

  logger.info("delete ok", {
    userId: result.value.userId,
    deletionStatus: result.value.deletionStatus,
    alreadyPending: result.alreadyPending,
    appleRevoked: result.value.appleRevoked,
    appleRevokeSkipped: !result.value.appleRevoked,
  });
  return withRequestId(result.value, 200, requestId);
}
