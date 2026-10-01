import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { requireAccess } from "@/lib/auth/require-access";
import { requireActiveJourneyAccount } from "@/lib/journey/access";
import { getChecklist } from "@/lib/journey/checklist";
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
 * GET /api/journey/checklist (F3)
 * Bearer + active. Catalog + statuses + progress for current case.
 * No case → 404 NO_JOURNEY_CASE.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  const auth = await requireAccess(request, {
    requestId,
    logger,
    failMessage: "journey checklist unauthenticated",
  });
  if (auth instanceof NextResponse) return auth;

  try {
    const service = createServiceClient();
    const account = await requireActiveJourneyAccount(service, auth.userId);
    if (!account.ok) {
      logger.info("journey checklist account refused", {
        code: account.code,
        userId: auth.userId,
      });
      return activeAccountErrorResponse(account, requestId);
    }

    const result = await getChecklist(service, auth.userId);
    if (!result.ok) {
      if (result.code === "NO_JOURNEY_CASE") {
        logger.info("journey checklist no case", {
          code: ERROR_CODES.NO_JOURNEY_CASE,
          userId: auth.userId,
        });
        return jsonError({
          code: ERROR_CODES.NO_JOURNEY_CASE,
          message: result.message,
          requestId,
          status: 404,
        });
      }
      logger.error("journey checklist failed", {
        code: ERROR_CODES.INTERNAL_ERROR,
        userId: auth.userId,
        checklistCode: result.code,
      });
      return jsonError({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "Failed to load checklist",
        requestId,
        status: 500,
      });
    }

    // Log counts only — never full checklist payloads (Class C).
    logger.info("journey checklist ok", {
      userId: auth.userId,
      pathId: result.checklist.pathId,
      done: result.checklist.progress.done,
      total: result.checklist.progress.total,
      catalogVersion: result.checklist.catalogVersion,
    });
    return withRequestId(
      { ...result.checklist, requestId },
      200,
      requestId,
    );
  } catch {
    logger.error("journey checklist threw", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId: auth.userId,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected checklist failure",
      requestId,
      status: 500,
    });
  }
}
