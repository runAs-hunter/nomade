import { NextResponse } from "next/server";
import type { DeletionStatus } from "@/lib/account/bootstrap";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { requireAccess } from "@/lib/auth/require-access";
import { log } from "@/lib/log";
import { getRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MeSuccess = {
  userId: string;
  deletionStatus: DeletionStatus;
  /** True when internal.users.email is a non-empty string. Never returns full email. */
  emailPresent: boolean;
};

type MeUserRow = {
  id: string;
  email: string | null;
  deletion_status: DeletionStatus;
};

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
 * GET /api/account/me (F2.5)
 * Bearer required. Returns thin account snapshot — no full email.
 * Missing internal.users row → 401 UNAUTHENTICATED "Bootstrap required".
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  const auth = await requireAccess(request, {
    requestId,
    logger,
    failMessage: "me unauthenticated",
  });
  if (auth instanceof NextResponse) return auth;

  let row: MeUserRow | null = null;
  try {
    const service = createServiceClient();
    const res = await service
      .schema("internal")
      .from("users")
      .select("id, email, deletion_status")
      .eq("id", auth.userId)
      .maybeSingle();

    if (res.error) {
      logger.error("me user read failed", {
        code: ERROR_CODES.INTERNAL_ERROR,
        userId: auth.userId,
      });
      return jsonError({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "Failed to load account",
        requestId,
        status: 500,
      });
    }
    row = (res.data as MeUserRow | null) ?? null;
  } catch {
    logger.error("me user read threw", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId: auth.userId,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected account lookup failure",
      requestId,
      status: 500,
    });
  }

  if (!row) {
    logger.info("me bootstrap required", {
      code: ERROR_CODES.UNAUTHENTICATED,
      userId: auth.userId,
    });
    return jsonError({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: "Bootstrap required",
      requestId,
      status: 401,
    });
  }

  const email = typeof row.email === "string" ? row.email.trim() : "";
  const body: MeSuccess = {
    userId: row.id,
    deletionStatus: row.deletion_status,
    emailPresent: email.length > 0,
  };

  logger.info("me ok", {
    userId: row.id,
    deletionStatus: row.deletion_status,
    emailPresent: body.emailPresent,
  });
  return withRequestId(body, 200, requestId);
}
