import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { requireAccess } from "@/lib/auth/require-access";
import { requireActiveJourneyAccount } from "@/lib/journey/access";
import {
  activeAccountErrorResponse,
  withRequestId,
} from "@/lib/journey/http";
import { parseSyncMutations, syncJourney } from "@/lib/journey/sync";
import { log } from "@/lib/log";
import { getRequestId } from "@/lib/request-id";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/journey/sync (F4)
 * Body: { mutations, hasLocalDraft?, pathId?, baseCaseUpdatedAt? }
 * Monotonic merge per step; opId replay-safe without new table.
 * Case B: hasLocalDraft && server case → 409 MERGE_REQUIRED.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  const auth = await requireAccess(request, {
    requestId,
    logger,
    failMessage: "journey sync unauthenticated",
  });
  if (auth instanceof NextResponse) return auth;

  let parsed: unknown = {};
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

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return jsonError({
      code: ERROR_CODES.BAD_REQUEST,
      message: "Body must be a JSON object",
      requestId,
      status: 400,
    });
  }

  const body = parsed as Record<string, unknown>;

  if (
    "hasLocalDraft" in body &&
    body.hasLocalDraft !== undefined &&
    typeof body.hasLocalDraft !== "boolean"
  ) {
    return jsonError({
      code: ERROR_CODES.BAD_REQUEST,
      message: "hasLocalDraft must be a boolean",
      requestId,
      status: 400,
    });
  }

  if (
    "pathId" in body &&
    body.pathId !== undefined &&
    body.pathId !== null &&
    typeof body.pathId !== "string"
  ) {
    return jsonError({
      code: ERROR_CODES.BAD_REQUEST,
      message: "pathId must be a string when provided",
      requestId,
      status: 400,
    });
  }

  const parsedMuts = parseSyncMutations(body.mutations);
  if (parsedMuts.fatal) {
    return jsonError({
      code: ERROR_CODES.BAD_REQUEST,
      message: parsedMuts.fatal,
      requestId,
      status: 400,
    });
  }

  try {
    const service = createServiceClient();
    const account = await requireActiveJourneyAccount(service, auth.userId);
    if (!account.ok) {
      logger.info("journey sync account refused", {
        code: account.code,
        userId: auth.userId,
      });
      return activeAccountErrorResponse(account, requestId);
    }

    const result = await syncJourney(service, {
      userId: auth.userId,
      mutations: parsedMuts.mutations,
      rejectedSeed: parsedMuts.rejected,
      hasLocalDraft: body.hasLocalDraft === true,
      pathId: typeof body.pathId === "string" ? body.pathId : undefined,
    });

    if (!result.ok) {
      if (result.code === "MERGE_REQUIRED") {
        logger.info("journey sync merge required", {
          code: ERROR_CODES.MERGE_REQUIRED,
          userId: auth.userId,
        });
        return withRequestId(
          {
            error: {
              code: ERROR_CODES.MERGE_REQUIRED,
              message: result.message,
              requestId,
            },
            merge: {
              case: "B" as const,
              hasLocalDraft: true,
              hasServerJourney: true,
            },
            requestId,
          },
          409,
          requestId,
        );
      }
      if (result.code === "NO_JOURNEY_CASE") {
        return jsonError({
          code: ERROR_CODES.NO_JOURNEY_CASE,
          message: result.message,
          requestId,
          status: 404,
        });
      }
      if (
        result.code === "UNKNOWN_PATH" ||
        result.code === "PATH_UNAVAILABLE" ||
        result.code === "BAD_REQUEST"
      ) {
        return jsonError({
          code: ERROR_CODES.BAD_REQUEST,
          message: result.message,
          requestId,
          status: 400,
        });
      }
      logger.error("journey sync failed", {
        code: ERROR_CODES.INTERNAL_ERROR,
        userId: auth.userId,
        syncCode: result.code,
      });
      return jsonError({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "Failed to sync journey",
        requestId,
        status: 500,
      });
    }

    // Class C: log counts + opId counts only — never full checklist.
    logger.info("journey sync ok", {
      userId: auth.userId,
      applied: result.appliedOpIds.length,
      rejected: result.rejected.length,
      done: result.checklist.progress.done,
      total: result.checklist.progress.total,
    });

    return withRequestId(
      {
        ...result.checklist,
        appliedOpIds: result.appliedOpIds,
        rejected: result.rejected,
        requestId,
      },
      200,
      requestId,
    );
  } catch {
    logger.error("journey sync threw", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId: auth.userId,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected sync failure",
      requestId,
      status: 500,
    });
  }
}
