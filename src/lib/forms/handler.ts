/**
 * F12a route handlers. Auth (requireAccess) → FORMS_ENABLED → active account.
 * Logs ids and counts only — never names, form values, or file names (Cap lock).
 */

import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { requireAccess } from "@/lib/auth/require-access";
import { isFormsEnabled } from "@/lib/env";
import { getFormDef, FORMS } from "@/lib/forms/registry";
import {
  buildFormList,
  buildFormView,
  FORMS_DISCLAIMER,
  loadFormEntitlement,
  loadFormSources,
  parseConsulateParam,
} from "@/lib/forms/view";
import { requireActiveJourneyAccount } from "@/lib/journey/access";
import { activeAccountErrorResponse, withRequestId } from "@/lib/journey/http";
import { log, type Logger } from "@/lib/log";
import { getRequestId } from "@/lib/request-id";
import { createServiceClient } from "@/lib/supabase/server";

type Gate =
  | { ok: true; userId: string; service: ReturnType<typeof createServiceClient>; logger: Logger; requestId: string }
  | { ok: false; response: NextResponse };

async function gate(request: Request, failMessage: string): Promise<Gate> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });
  const auth = await requireAccess(request, { requestId, logger, failMessage });
  if (auth instanceof NextResponse) return { ok: false, response: auth };
  if (!isFormsEnabled()) {
    return {
      ok: false,
      response: jsonError({ code: ERROR_CODES.FORMS_DISABLED, message: "Forms are not enabled", requestId, status: 404 }),
    };
  }
  const service = createServiceClient();
  const account = await requireActiveJourneyAccount(service, auth.userId);
  if (!account.ok) {
    logger.info("forms account refused", { code: account.code, userId: auth.userId });
    return { ok: false, response: activeAccountErrorResponse(account, requestId) };
  }
  return { ok: true, userId: auth.userId, service, logger, requestId };
}

function badConsulate(requestId: string): NextResponse {
  return jsonError({
    code: ERROR_CODES.BAD_REQUEST,
    message: "consulate must be a known US consular post id",
    requestId,
    status: 400,
  });
}

function internal(requestId: string, message: string): NextResponse {
  return jsonError({ code: ERROR_CODES.INTERNAL_ERROR, message, requestId, status: 500 });
}

/** GET /api/forms */
/** Error class name only — messages can carry upstream detail, so they are not logged. */
function errorName(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

async function safeGate(request: Request, failMessage: string, route: string): Promise<Gate | NextResponse> {
  try {
    return await gate(request, failMessage);
  } catch (err) {
    return gateFailed(request, route, err);
  }
}

function gateFailed(request: Request, route: string, err: unknown): NextResponse {
  const requestId = getRequestId(request);
  log.child({ requestId }).error("forms gate threw", {
    code: ERROR_CODES.INTERNAL_ERROR,
    route,
    errorName: errorName(err),
  });
  return internal(requestId, "Unexpected forms failure");
}

export async function handleFormsList(request: Request): Promise<NextResponse> {
  const g = await safeGate(request, "forms list unauthenticated", "list");
  if (g instanceof NextResponse) return g;
  if (!g.ok) return g.response;
  try {
    const consulate = parseConsulateParam(new URL(request.url));
    if (!consulate.ok) return badConsulate(g.requestId);
    const rows = await loadFormSources(g.service, FORMS.map((f) => f.sourceId));
    if (!rows.ok) {
      g.logger.error("forms list sources failed", { code: ERROR_CODES.INTERNAL_ERROR });
      return internal(g.requestId, "Failed to load forms");
    }
    const forms = buildFormList(rows.rows, consulate.postId);
    g.logger.info("forms list ok", { userId: g.userId, count: forms.length, available: forms.filter((f) => f.available).length });
    return withRequestId({ forms, disclaimer: FORMS_DISCLAIMER, requestId: g.requestId }, 200, g.requestId);
  } catch (err) {
    g.logger.error("forms list threw", { code: ERROR_CODES.INTERNAL_ERROR, errorName: errorName(err) });
    return internal(g.requestId, "Unexpected forms failure");
  }
}

/** GET /api/forms/:formId */
export async function handleFormGet(request: Request, formId: string): Promise<NextResponse> {
  const g = await safeGate(request, "form get unauthenticated", "detail");
  if (g instanceof NextResponse) return g;
  if (!g.ok) return g.response;
  try {
    const def = getFormDef(formId);
    if (!def) {
      return jsonError({ code: ERROR_CODES.NOT_FOUND, message: "Unknown form", requestId: g.requestId, status: 404 });
    }
    const consulate = parseConsulateParam(new URL(request.url));
    if (!consulate.ok) return badConsulate(g.requestId);
    const rows = await loadFormSources(g.service, [def.sourceId]);
    if (!rows.ok) {
      g.logger.error("form source read failed", { code: ERROR_CODES.INTERNAL_ERROR, formId: def.formId });
      return internal(g.requestId, "Failed to load form");
    }
    const row = rows.rows.get(def.sourceId);
    if (!row) {
      g.logger.warn("form source unavailable", { code: ERROR_CODES.FORM_SOURCE_UNAVAILABLE, formId: def.formId, sourceId: def.sourceId });
      return jsonError({
        code: ERROR_CODES.FORM_SOURCE_UNAVAILABLE,
        message: "Form source is not available",
        requestId: g.requestId,
        status: 503,
      });
    }
    const entitlement = await loadFormEntitlement(g.service, g.userId, g.logger);
    const view = buildFormView({ def, row, entitlement, consulatePostId: consulate.postId });
    g.logger.info("form get ok", {
      userId: g.userId,
      formId: def.formId,
      contentVersion: def.contentVersion,
      template: view.template !== null,
      needsReview: row.needs_review === true,
      access: view.access,
    });
    return withRequestId({ ...view, requestId: g.requestId }, 200, g.requestId);
  } catch (err) {
    g.logger.error("form get threw", { code: ERROR_CODES.INTERNAL_ERROR, errorName: errorName(err) });
    return internal(g.requestId, "Unexpected forms failure");
  }
}
