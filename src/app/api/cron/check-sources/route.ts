import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { cronAuthorizationMatches, getCronSecret } from "@/lib/env";
import { withRequestId } from "@/lib/journey/http";
import { log } from "@/lib/log";
import { getRequestId } from "@/lib/request-id";
import { runSourceCheck } from "@/lib/sources/check";
import { applyCheckUpdate, listActiveForCheck } from "@/lib/sources/repo";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** ~20 URLs × ≤15s, 4 at a time. */
export const maxDuration = 60;

function flag(url: URL, name: string): boolean {
  const v = url.searchParams.get(name);
  return v !== null && /^(1|true|yes)$/i.test(v.trim());
}

/**
 * GET|POST /api/cron/check-sources (F8 monthly freshness stub)
 * Manual trigger only — Authorization: Bearer ${CRON_SECRET} (purge-accounts
 * pattern). Intentionally NOT scheduled in vercel.json (F8 lock).
 * Query: ?dryRun=1 (probe only, no writes), ?hash=1 (GET + sha256 body).
 */
async function handle(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  let secret: string;
  try {
    secret = getCronSecret();
  } catch {
    logger.error("check-sources cron secret missing", { code: ERROR_CODES.ENV_INVALID });
    return jsonError({
      code: ERROR_CODES.ENV_INVALID,
      message: "Cron not configured",
      requestId,
      status: 500,
    });
  }

  if (!cronAuthorizationMatches(request.headers.get("authorization"), secret)) {
    logger.info("check-sources unauthenticated", { code: ERROR_CODES.UNAUTHENTICATED });
    return jsonError({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: "Unauthorized",
      requestId,
      status: 401,
    });
  }

  const url = new URL(request.url);
  const dryRun = flag(url, "dryRun");
  const hash = flag(url, "hash");

  try {
    const service = createServiceClient();
    const rows = await listActiveForCheck(service);
    if (!rows.ok) {
      logger.error("check-sources list failed", { code: ERROR_CODES.INTERNAL_ERROR });
      return jsonError({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "Failed to list sources",
        requestId,
        status: 500,
      });
    }

    const summary = await runSourceCheck(
      {
        rows: rows.value,
        applyUpdate: (id, update) => applyCheckUpdate(service, id, update),
      },
      { dryRun, hash },
    );

    for (const r of summary.results) {
      if (r.outcome !== "ok") {
        logger.warn("check-sources flagged", {
          sourceId: r.id,
          outcome: r.outcome,
          httpStatus: r.httpStatus,
          action: r.action,
          dryRun,
        });
      }
    }
    const { results, ...counts } = summary;
    logger.info("check-sources ok", counts);

    return withRequestId({ ok: true, requestId, ...counts, results }, 200, requestId);
  } catch {
    logger.error("check-sources threw", { code: ERROR_CODES.INTERNAL_ERROR });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected check failure",
      requestId,
      status: 500,
    });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}
