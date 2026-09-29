import { NextResponse } from "next/server";
import { runPurgeBatch } from "@/lib/account/purge";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import {
  cronAuthorizationMatches,
  getCronSecret,
} from "@/lib/env";
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
 * GET|POST /api/cron/purge-accounts (F2.6p)
 * Vercel Cron / manual curl only — Authorization: Bearer ${CRON_SECRET}.
 * No requireAccess / user Bearer. Counts only in response + logs (no PII).
 */
async function handle(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  let secret: string;
  try {
    secret = getCronSecret();
  } catch {
    logger.error("purge-accounts cron secret missing", {
      code: ERROR_CODES.ENV_INVALID,
    });
    return jsonError({
      code: ERROR_CODES.ENV_INVALID,
      message: "Cron not configured",
      requestId,
      status: 500,
    });
  }

  const authorization = request.headers.get("authorization");
  if (!cronAuthorizationMatches(authorization, secret)) {
    logger.info("purge-accounts unauthenticated", {
      code: ERROR_CODES.UNAUTHENTICATED,
    });
    return jsonError({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: "Unauthorized",
      requestId,
      status: 401,
    });
  }

  let batch;
  try {
    const service = createServiceClient();
    batch = await runPurgeBatch(service);
  } catch {
    logger.error("purge-accounts threw", {
      code: ERROR_CODES.INTERNAL_ERROR,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected purge failure",
      requestId,
      status: 500,
    });
  }

  if (!batch.ok) {
    logger.error("purge-accounts list failed", {
      code: ERROR_CODES.INTERNAL_ERROR,
      purgeCode: batch.code,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Failed to list purge candidates",
      requestId,
      status: 500,
    });
  }

  const { scanned, purged, skippedAlreadyDeleted, skippedLegalHold, authAlreadyGone, failed, results } =
    batch.value;

  // Per-user outcomes: userId + outcome/failCode only — never email/sub/tokens
  for (const r of results) {
    if (r.outcome === "failed") {
      logger.warn("purge-accounts user failed", {
        userId: r.userId,
        outcome: r.outcome,
        failCode: r.failCode,
      });
    } else {
      logger.info("purge-accounts user", {
        userId: r.userId,
        outcome: r.outcome,
      });
    }
  }

  logger.info("purge-accounts ok", {
    scanned,
    purged,
    skippedAlreadyDeleted,
    skippedLegalHold,
    authAlreadyGone,
    failed,
  });

  return withRequestId(
    {
      ok: true,
      requestId,
      scanned,
      purged,
      skippedAlreadyDeleted,
      skippedLegalHold,
      authAlreadyGone,
      failed,
    },
    200,
    requestId,
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
