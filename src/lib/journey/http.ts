/**
 * Shared HTTP helpers for F3 journey routes.
 */

import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { REQUEST_ID_HEADER } from "@/lib/request-id";
import type { RequireActiveJourneyAccountResult } from "@/lib/journey/access";

export function withRequestId<T>(
  body: T,
  status: number,
  requestId: string,
): NextResponse<T> {
  const res = NextResponse.json(body, { status });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}

/** Map requireActiveJourneyAccount failures to F1.8 responses. */
export function activeAccountErrorResponse(
  result: Extract<RequireActiveJourneyAccountResult, { ok: false }>,
  requestId: string,
): NextResponse {
  if (result.code === "NO_USER") {
    return jsonError({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: "Bootstrap required",
      requestId,
      status: 401,
    });
  }
  if (result.code === "ACCOUNT_PENDING_DELETION") {
    return jsonError({
      code: ERROR_CODES.ACCOUNT_PENDING_DELETION,
      message: result.message,
      requestId,
      status: 403,
    });
  }
  if (result.code === "ACCOUNT_DELETED") {
    return jsonError({
      code: ERROR_CODES.ACCOUNT_DELETED,
      message: result.message,
      requestId,
      status: 410,
    });
  }
  return jsonError({
    code: ERROR_CODES.INTERNAL_ERROR,
    message: "Failed to load account",
    requestId,
    status: 500,
  });
}
