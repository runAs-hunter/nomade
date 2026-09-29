import { NextResponse } from "next/server";
import { loadAccountExport } from "@/lib/account/export";
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
 * POST /api/account/export (F2.6)
 * Bearer via requireAccess. Sync user-scoped JSON export.
 * Allowed while pending_deletion; ACCOUNT_DELETED when deleted.
 * Never log providerSubject / email / export body.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  const auth = await requireAccess(request, {
    requestId,
    logger,
    failMessage: "export unauthenticated",
  });
  if (auth instanceof NextResponse) return auth;

  let result;
  try {
    const service = createServiceClient();
    result = await loadAccountExport(service, auth.userId);
  } catch {
    logger.error("export threw", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId: auth.userId,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected export failure",
      requestId,
      status: 500,
    });
  }

  if (!result.ok) {
    if (result.code === "NO_USER") {
      logger.info("export bootstrap required", {
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
      logger.info("export account deleted", {
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
    logger.error("export failed", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId: auth.userId,
      exportCode: result.code,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Failed to export account",
      requestId,
      status: 500,
    });
  }

  // Log counts/status only — never email, providerSubject, or export body.
  logger.info("export ok", {
    userId: auth.userId,
    deletionStatus: result.envelope.deletionStatus,
    identityCount: result.envelope.identities.length,
    emailPresent: result.envelope.account.emailPresent,
  });
  return withRequestId(result.envelope, 200, requestId);
}
