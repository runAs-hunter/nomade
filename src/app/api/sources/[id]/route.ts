import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { withRequestId } from "@/lib/journey/http";
import { log, type Logger } from "@/lib/log";
import { getRequestId } from "@/lib/request-id";
import { requireSourcesAdmin } from "@/lib/sources/admin-auth";
import { readJsonBody, repoErrorResponse } from "@/lib/sources/http";
import { getActiveSource, updateSource } from "@/lib/sources/repo";
import {
  SOURCES_DISCLAIMER,
  toAdminSource,
  toPublicSource,
} from "@/lib/sources/types";
import {
  formatIssues,
  isValidSourceId,
  patchSourceSchema,
  toDbColumns,
} from "@/lib/sources/validate";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function readId(context: RouteContext): Promise<string> {
  const { id: raw } = await context.params;
  try {
    return decodeURIComponent(raw ?? "").trim();
  } catch {
    return "";
  }
}

function unexpected(logger: Logger, requestId: string, what: string): NextResponse {
  logger.error(`sources ${what} threw`, { code: ERROR_CODES.INTERNAL_ERROR });
  return jsonError({
    code: ERROR_CODES.INTERNAL_ERROR,
    message: "Unexpected sources failure",
    requestId,
    status: 500,
  });
}

/**
 * GET /api/sources/{id} (F8)
 * Public (no auth). Active rows only; stale/retired/missing → 404.
 */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });
  const id = await readId(context);

  if (!isValidSourceId(id)) {
    return jsonError({ code: ERROR_CODES.NOT_FOUND, message: "Source not found", requestId, status: 404 });
  }

  try {
    const service = createServiceClient();
    const result = await getActiveSource(service, id);
    if (!result.ok) {
      if (result.code !== "NOT_FOUND") {
        logger.error("sources get failed", { code: ERROR_CODES.INTERNAL_ERROR, repoCode: result.code });
      }
      return repoErrorResponse(result, requestId);
    }
    logger.info("sources get ok", { sourceId: id });
    return withRequestId(
      { source: toPublicSource(result.value), disclaimer: SOURCES_DISCLAIMER, requestId },
      200,
      requestId,
    );
  } catch {
    return unexpected(logger, requestId, "get");
  }
}

/**
 * PATCH /api/sources/{id} (F8 admin)
 * Curation fields only (strict). Operational columns are refresh-job-only.
 */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  const admin = await requireSourcesAdmin(request, { requestId, logger });
  if (admin instanceof NextResponse) return admin;

  const id = await readId(context);
  if (!isValidSourceId(id)) {
    return jsonError({ code: ERROR_CODES.NOT_FOUND, message: "Source not found", requestId, status: 404 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonError({ code: ERROR_CODES.BAD_REQUEST, message: "Malformed JSON body", requestId, status: 400 });
  }
  const parsed = patchSourceSchema.safeParse(body.value ?? {});
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
    const result = await updateSource(service, id, toDbColumns(parsed.data));
    if (!result.ok) {
      logger.info("sources patch refused", { sourceId: id, repoCode: result.code, adminKind: admin.kind });
      return repoErrorResponse(result, requestId);
    }
    logger.info("sources patch ok", {
      sourceId: id,
      fields: Object.keys(parsed.data),
      adminKind: admin.kind,
      ...(admin.kind === "user" ? { userId: admin.userId } : {}),
    });
    return withRequestId({ source: toAdminSource(result.value), requestId }, 200, requestId);
  } catch {
    return unexpected(logger, requestId, "patch");
  }
}

/**
 * DELETE /api/sources/{id} (F8 admin)
 * Soft delete: sets status = 'retired' so past citations stay resolvable in the
 * DB. Retired rows drop out of public GETs.
 */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  const admin = await requireSourcesAdmin(request, { requestId, logger });
  if (admin instanceof NextResponse) return admin;

  const id = await readId(context);
  if (!isValidSourceId(id)) {
    return jsonError({ code: ERROR_CODES.NOT_FOUND, message: "Source not found", requestId, status: 404 });
  }

  try {
    const service = createServiceClient();
    const result = await updateSource(service, id, { status: "retired" });
    if (!result.ok) {
      logger.info("sources retire refused", { sourceId: id, repoCode: result.code, adminKind: admin.kind });
      return repoErrorResponse(result, requestId);
    }
    logger.info("sources retire ok", {
      sourceId: id,
      adminKind: admin.kind,
      ...(admin.kind === "user" ? { userId: admin.userId } : {}),
    });
    return withRequestId({ source: toAdminSource(result.value), requestId }, 200, requestId);
  } catch {
    return unexpected(logger, requestId, "retire");
  }
}
