import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { requireAccess } from "@/lib/auth/require-access";
import { requireActiveJourneyAccount } from "@/lib/journey/access";
import { getJourneyCase, upsertJourneyCase } from "@/lib/journey/case";
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
 * GET /api/journey/case (F3)
 * Bearer + active. Returns current Italy case or null.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  const auth = await requireAccess(request, {
    requestId,
    logger,
    failMessage: "journey case get unauthenticated",
  });
  if (auth instanceof NextResponse) return auth;

  try {
    const service = createServiceClient();
    const account = await requireActiveJourneyAccount(service, auth.userId);
    if (!account.ok) {
      logger.info("journey case get account refused", {
        code: account.code,
        userId: auth.userId,
      });
      return activeAccountErrorResponse(account, requestId);
    }

    const result = await getJourneyCase(service, auth.userId);
    if (!result.ok) {
      logger.error("journey case get failed", {
        code: ERROR_CODES.INTERNAL_ERROR,
        userId: auth.userId,
      });
      return jsonError({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "Failed to load journey case",
        requestId,
        status: 500,
      });
    }

    logger.info("journey case get ok", {
      userId: auth.userId,
      hasCase: result.case !== null,
      pathId: result.case?.pathId,
    });
    return withRequestId(
      { case: result.case, requestId },
      200,
      requestId,
    );
  } catch {
    logger.error("journey case get threw", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId: auth.userId,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected journey case failure",
      requestId,
      status: 500,
    });
  }
}

/**
 * POST /api/journey/case (F3)
 * Body: { pathId }. Create or return existing; path change resets steps.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  const auth = await requireAccess(request, {
    requestId,
    logger,
    failMessage: "journey case post unauthenticated",
  });
  if (auth instanceof NextResponse) return auth;

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

  const pathId =
    parsed !== null &&
    typeof parsed === "object" &&
    typeof (parsed as { pathId?: unknown }).pathId === "string"
      ? (parsed as { pathId: string }).pathId.trim()
      : "";

  if (!pathId) {
    return jsonError({
      code: ERROR_CODES.BAD_REQUEST,
      message: 'Body must be {"pathId":"<id>"}',
      requestId,
      status: 400,
    });
  }

  try {
    const service = createServiceClient();
    const account = await requireActiveJourneyAccount(service, auth.userId);
    if (!account.ok) {
      logger.info("journey case post account refused", {
        code: account.code,
        userId: auth.userId,
      });
      return activeAccountErrorResponse(account, requestId);
    }

    const result = await upsertJourneyCase(service, {
      userId: auth.userId,
      pathId,
    });

    if (!result.ok) {
      if (
        result.code === "UNKNOWN_PATH" ||
        result.code === "PATH_UNAVAILABLE"
      ) {
        logger.info("journey case post bad path", {
          code: ERROR_CODES.BAD_REQUEST,
          userId: auth.userId,
          pathId,
        });
        return jsonError({
          code: ERROR_CODES.BAD_REQUEST,
          message: result.message,
          requestId,
          status: 400,
        });
      }
      logger.error("journey case post failed", {
        code: ERROR_CODES.INTERNAL_ERROR,
        userId: auth.userId,
      });
      return jsonError({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "Failed to create journey case",
        requestId,
        status: 500,
      });
    }

    logger.info("journey case post ok", {
      userId: auth.userId,
      pathId: result.case.pathId,
      created: result.created,
      pathChanged: result.pathChanged,
    });
    return withRequestId(
      {
        case: result.case,
        created: result.created,
        pathChanged: result.pathChanged,
        requestId,
      },
      200,
      requestId,
    );
  } catch {
    logger.error("journey case post threw", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId: auth.userId,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected journey case failure",
      requestId,
      status: 500,
    });
  }
}
