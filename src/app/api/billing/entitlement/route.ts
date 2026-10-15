import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { requireAccess } from "@/lib/auth/require-access";
import { listEntitlements } from "@/lib/billing/entitlements";
import { requireActiveJourneyAccount } from "@/lib/journey/access";
import {
  activeAccountErrorResponse,
  withRequestId,
} from "@/lib/journey/http";
import { log } from "@/lib/log";
import { getRequestId } from "@/lib/request-id";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/billing/entitlement (F3.1)
 * Bearer + active. Server-derived entitlements (no client-only paid flag).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  const auth = await requireAccess(request, {
    requestId,
    logger,
    failMessage: "billing entitlement unauthenticated",
  });
  if (auth instanceof NextResponse) return auth;

  try {
    const service = createServiceClient();
    const account = await requireActiveJourneyAccount(service, auth.userId);
    if (!account.ok) {
      logger.info("billing entitlement account refused", {
        code: account.code,
        userId: auth.userId,
      });
      return activeAccountErrorResponse(account, requestId);
    }

    const result = await listEntitlements(service, auth.userId);
    if (!result.ok) {
      logger.error("billing entitlement read failed", {
        code: ERROR_CODES.INTERNAL_ERROR,
        userId: auth.userId,
      });
      return jsonError({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "Failed to load entitlements",
        requestId,
        status: 500,
      });
    }

    logger.info("billing entitlement ok", {
      userId: auth.userId,
      count: result.entitlements.length,
      active: result.entitlements.filter((e) => e.status === "active").length,
    });
    return withRequestId(
      { entitlements: result.entitlements, requestId },
      200,
      requestId,
    );
  } catch {
    logger.error("billing entitlement threw", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId: auth.userId,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected entitlement failure",
      requestId,
      status: 500,
    });
  }
}
