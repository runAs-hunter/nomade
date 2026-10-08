import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { withRequestId } from "@/lib/journey/http";
import { log } from "@/lib/log";
import { getRequestId } from "@/lib/request-id";
import { requireSourcesAdmin } from "@/lib/sources/admin-auth";
import { readJsonBody, repoErrorResponse } from "@/lib/sources/http";
import { insertSource, listActiveSources } from "@/lib/sources/repo";
import {
  SOURCES_DISCLAIMER,
  toAdminSource,
  toPublicSource,
} from "@/lib/sources/types";
import {
  createSourceSchema,
  formatIssues,
  parseListQuery,
  toDbColumns,
} from "@/lib/sources/validate";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sources?pathId=&q= (F8)
 * Public (no auth). Active official sources only. `pathId` filters rows whose
 * path_ids contain it (rows tagged for both paths match either). `q` is an
 * optional case-insensitive title/publisher/scope substring filter.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  const parsed = parseListQuery(new URL(request.url));
  if (!parsed.ok) {
    return jsonError({ code: ERROR_CODES.BAD_REQUEST, message: parsed.message, requestId, status: 400 });
  }

  try {
    const service = createServiceClient();
    const result = await listActiveSources(service, parsed.value);
    if (!result.ok) {
      logger.error("sources list failed", { code: ERROR_CODES.INTERNAL_ERROR, repoCode: result.code });
      return repoErrorResponse(result, requestId);
    }
    const sources = result.value.map(toPublicSource);
    logger.info("sources list ok", {
      pathId: parsed.value.pathId,
      hasQuery: parsed.value.q !== null,
      count: sources.length,
    });
    return withRequestId(
      {
        sources,
        count: sources.length,
        pathId: parsed.value.pathId,
        disclaimer: SOURCES_DISCLAIMER,
        requestId,
      },
      200,
      requestId,
    );
  } catch {
    logger.error("sources list threw", { code: ERROR_CODES.INTERNAL_ERROR });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected sources failure",
      requestId,
      status: 500,
    });
  }
}

/**
 * POST /api/sources (F8 admin)
 * Service-role Bearer or Cap-approved admin JWT. Body: camelCase curation
 * fields; officialUrl must be https on the official-host allowlist.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  const admin = await requireSourcesAdmin(request, { requestId, logger });
  if (admin instanceof NextResponse) return admin;

  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonError({ code: ERROR_CODES.BAD_REQUEST, message: "Malformed JSON body", requestId, status: 400 });
  }
  const parsed = createSourceSchema.safeParse(body.value ?? {});
  if (!parsed.success) {
    return jsonError({
      code: ERROR_CODES.BAD_REQUEST,
      message: formatIssues(parsed.error),
      requestId,
      status: 400,
    });
  }

  try {
    const service = createServiceClient();
    const result = await insertSource(service, toDbColumns(parsed.data));
    if (!result.ok) {
      logger.info("sources create refused", { repoCode: result.code, adminKind: admin.kind });
      return repoErrorResponse(result, requestId);
    }
    logger.info("sources create ok", {
      sourceId: result.value.id,
      adminKind: admin.kind,
      ...(admin.kind === "user" ? { userId: admin.userId } : {}),
    });
    return withRequestId({ source: toAdminSource(result.value), requestId }, 201, requestId);
  } catch {
    logger.error("sources create threw", { code: ERROR_CODES.INTERNAL_ERROR });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected sources failure",
      requestId,
      status: 500,
    });
  }
}
