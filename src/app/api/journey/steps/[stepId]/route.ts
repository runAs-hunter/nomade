import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { requireAccess } from "@/lib/auth/require-access";
import { requireActiveJourneyAccount } from "@/lib/journey/access";
import {
  activeAccountErrorResponse,
  withRequestId,
} from "@/lib/journey/http";
import { patchStepStatus } from "@/lib/journey/steps";
import { log } from "@/lib/log";
import { getRequestId } from "@/lib/request-id";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ stepId: string }>;
};

/**
 * PATCH /api/journey/steps/{stepId} (F3 / F4)
 * Body: { status, expectedUpdatedAt? }. Bearer + active.
 * Omit expectedUpdatedAt → F3 LWW. Mismatch → 409 CONFLICT + current step.
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });
  const { stepId: rawStepId } = await context.params;
  const stepId = decodeURIComponent(rawStepId ?? "").trim();

  const auth = await requireAccess(request, {
    requestId,
    logger,
    failMessage: "journey step patch unauthenticated",
  });
  if (auth instanceof NextResponse) return auth;

  if (!stepId) {
    return jsonError({
      code: ERROR_CODES.BAD_REQUEST,
      message: "Missing stepId",
      requestId,
      status: 400,
    });
  }

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

  const bodyObj =
    parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;

  const status = bodyObj && "status" in bodyObj ? bodyObj.status : undefined;
  const expectedUpdatedAt =
    bodyObj &&
    typeof bodyObj.expectedUpdatedAt === "string"
      ? bodyObj.expectedUpdatedAt
      : bodyObj && bodyObj.expectedUpdatedAt === null
        ? null
        : undefined;

  if (
    bodyObj &&
    "expectedUpdatedAt" in bodyObj &&
    bodyObj.expectedUpdatedAt !== undefined &&
    bodyObj.expectedUpdatedAt !== null &&
    typeof bodyObj.expectedUpdatedAt !== "string"
  ) {
    return jsonError({
      code: ERROR_CODES.BAD_REQUEST,
      message: "expectedUpdatedAt must be an ISO string when provided",
      requestId,
      status: 400,
    });
  }

  try {
    const service = createServiceClient();
    const account = await requireActiveJourneyAccount(service, auth.userId);
    if (!account.ok) {
      logger.info("journey step patch account refused", {
        code: account.code,
        userId: auth.userId,
      });
      return activeAccountErrorResponse(account, requestId);
    }

    const result = await patchStepStatus(service, {
      userId: auth.userId,
      stepId,
      status,
      expectedUpdatedAt,
    });

    if (!result.ok) {
      if (result.code === "CONFLICT") {
        logger.info("journey step patch conflict", {
          code: ERROR_CODES.CONFLICT,
          userId: auth.userId,
          stepId,
        });
        return withRequestId(
          {
            error: {
              code: ERROR_CODES.CONFLICT,
              message: result.message,
              requestId,
            },
            current: result.current,
            progress: result.progress,
            requestId,
          },
          409,
          requestId,
        );
      }
      if (result.code === "BAD_STATUS") {
        return jsonError({
          code: ERROR_CODES.BAD_REQUEST,
          message: result.message,
          requestId,
          status: 400,
        });
      }
      if (result.code === "NO_JOURNEY_CASE") {
        return jsonError({
          code: ERROR_CODES.NO_JOURNEY_CASE,
          message: result.message,
          requestId,
          status: 404,
        });
      }
      if (result.code === "UNKNOWN_STEP") {
        return jsonError({
          code: ERROR_CODES.NOT_FOUND,
          message: result.message,
          requestId,
          status: 404,
        });
      }
      logger.error("journey step patch failed", {
        code: ERROR_CODES.INTERNAL_ERROR,
        userId: auth.userId,
        stepId,
        patchCode: result.code,
      });
      return jsonError({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "Failed to update step",
        requestId,
        status: 500,
      });
    }

    logger.info("journey step patch ok", {
      userId: auth.userId,
      stepId: result.stepId,
      status: result.status,
      done: result.progress.done,
      total: result.progress.total,
    });
    return withRequestId(
      {
        stepId: result.stepId,
        status: result.status,
        updatedAt: result.updatedAt,
        progress: result.progress,
        requestId,
      },
      200,
      requestId,
    );
  } catch {
    logger.error("journey step patch threw", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId: auth.userId,
      stepId,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected step update failure",
      requestId,
      status: 500,
    });
  }
}
