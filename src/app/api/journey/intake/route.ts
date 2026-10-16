import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { requireAccess } from "@/lib/auth/require-access";
import { isIntakeEnabled } from "@/lib/env";
import { requireActiveJourneyAccount } from "@/lib/journey/access";
import { getJourneyCase } from "@/lib/journey/case";
import { getChecklist } from "@/lib/journey/checklist";
import { activeAccountErrorResponse, withRequestId } from "@/lib/journey/http";
import {
  INTAKE_QUESTIONS,
  INTAKE_RULES_VERSION,
  parseIntakeAnswers,
} from "@/lib/journey/intake";
import { loadIntake, saveIntakeLww } from "@/lib/journey/intake-store";
import { log } from "@/lib/log";
import { getRequestId } from "@/lib/request-id";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { requestId: string; logger: ReturnType<typeof log.child> };

function disabled(requestId: string): NextResponse {
  return jsonError({
    code: ERROR_CODES.INTAKE_DISABLED,
    message: "Intake is not enabled",
    requestId,
    status: 404,
  });
}

function noCase(requestId: string): NextResponse {
  return jsonError({
    code: ERROR_CODES.NO_JOURNEY_CASE,
    message: "No journey case — select a path first",
    requestId,
    status: 404,
  });
}

function internal(requestId: string, message: string): NextResponse {
  return jsonError({ code: ERROR_CODES.INTERNAL_ERROR, message, requestId, status: 500 });
}

type Authed =
  | { res: NextResponse }
  | {
      res?: undefined;
      ctx: Ctx;
      service: ReturnType<typeof createServiceClient>;
      userId: string;
      journeyCase: { caseId: string; pathId: string };
    };

async function authed(request: Request, failMessage: string): Promise<Authed> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });
  if (!isIntakeEnabled()) return { res: disabled(requestId) }
  const auth = await requireAccess(request, { requestId, logger, failMessage });
  if (auth instanceof NextResponse) return { res: auth }
  const service = createServiceClient();
  const account = await requireActiveJourneyAccount(service, auth.userId);
  if (!account.ok) return { res: activeAccountErrorResponse(account, requestId) }
  const caseRes = await getJourneyCase(service, auth.userId);
  if (!caseRes.ok) return { res: internal(requestId, "Failed to load journey case") }
  if (!caseRes.case) return { res: noCase(requestId) }
  const ctx: Ctx = { requestId, logger };
  return { ctx, service, userId: auth.userId, journeyCase: caseRes.case }
}

/**
 * GET /api/journey/intake (F11a) — Bearer + active. INTAKE_ENABLED only.
 * Questions/options come from the server so clients cannot drift. Free.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const a = await authed(request, "journey intake unauthenticated");
  if (a.res) return a.res;
  const { ctx, service, userId, journeyCase } = a;
  try {
    const intake = await loadIntake(service, journeyCase.caseId);
    if (!intake.ok) return internal(ctx.requestId, "Failed to load intake");
    // Never log answers (Class C) — presence only.
    ctx.logger.info("journey intake read", { userId, hasIntake: intake.intake !== null });
    return withRequestId(
      {
        answers: intake.intake?.answers ?? {},
        rulesVersion: intake.intake?.rulesVersion ?? INTAKE_RULES_VERSION,
        completedAt: intake.intake?.completedAt ?? null,
        clientUpdatedAt: intake.intake?.clientUpdatedAt ?? null,
        questions: INTAKE_QUESTIONS.map((q) => ({ key: q.key, options: [...q.options] })),
        requestId: ctx.requestId,
      },
      200,
      ctx.requestId,
    );
  } catch {
    ctx.logger.error("journey intake read threw", { userId });
    return internal(ctx.requestId, "Unexpected intake failure");
  }
}

/**
 * PUT /api/journey/intake (F11a) `{ answers, clientUpdatedAt }` →
 * `{ intake, checklist, applied }`. Whole-object replace, LWW on clientUpdatedAt
 * (older = no-op, `applied: false`). 400 BAD_INTAKE on unknown key/value.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  const a = await authed(request, "journey intake unauthenticated");
  if (a.res) return a.res;
  const { ctx, service, userId, journeyCase } = a;

  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("bad");
    body = raw as Record<string, unknown>;
  } catch {
    return jsonError({
      code: ERROR_CODES.BAD_REQUEST,
      message: "Body must be a JSON object",
      requestId: ctx.requestId,
      status: 400,
    });
  }

  const now = new Date();
  const parsed = parseIntakeAnswers(body.answers, now);
  if (!parsed.ok) {
    ctx.logger.info("journey intake rejected", { userId, code: ERROR_CODES.BAD_INTAKE });
    return jsonError({
      code: ERROR_CODES.BAD_INTAKE,
      message: parsed.message,
      requestId: ctx.requestId,
      status: 400,
    });
  }
  const cua = typeof body.clientUpdatedAt === "string" ? body.clientUpdatedAt.trim() : "";
  if (cua.length === 0 || Number.isNaN(Date.parse(cua))) {
    return jsonError({
      code: ERROR_CODES.BAD_INTAKE,
      message: "clientUpdatedAt must be an ISO timestamp",
      requestId: ctx.requestId,
      status: 400,
    });
  }

  try {
    const saved = await saveIntakeLww(service, {
      caseId: journeyCase.caseId,
      answers: parsed.answers,
      clientUpdatedAt: cua,
      nowIso: now.toISOString(),
    });
    if (!saved.ok) return internal(ctx.requestId, "Failed to save intake");
    const checklist = await getChecklist(service, userId);
    if (!checklist.ok) return internal(ctx.requestId, "Failed to load checklist");
    ctx.logger.info("journey intake saved", {
      userId,
      applied: saved.applied,
      answered: Object.keys(saved.intake.answers).length,
      rulesVersion: saved.intake.rulesVersion,
    });
    return withRequestId(
      {
        intake: {
          answers: saved.intake.answers,
          rulesVersion: saved.intake.rulesVersion,
          completedAt: saved.intake.completedAt,
          clientUpdatedAt: saved.intake.clientUpdatedAt,
        },
        applied: saved.applied,
        checklist: checklist.checklist,
        requestId: ctx.requestId,
      },
      200,
      ctx.requestId,
    );
  } catch {
    ctx.logger.error("journey intake save threw", { userId });
    return internal(ctx.requestId, "Unexpected intake failure");
  }
}
