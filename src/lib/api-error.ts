import { NextResponse } from "next/server";
import { REQUEST_ID_HEADER } from "@/lib/request-id";

/**
 * Stable API error envelope (F1.8).
 * Shape: { error: { code, message, requestId } } + x-request-id header.
 */

export const ERROR_CODES = {
  ENV_INVALID: "ENV_INVALID",
  SUPABASE_PING_FAILED: "SUPABASE_PING_FAILED",
  HEALTH_ERROR: "HEALTH_ERROR",
  BAD_REQUEST: "BAD_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  // F2.3 bootstrap / F2.1 §10
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  ACCOUNT_PENDING_DELETION: "ACCOUNT_PENDING_DELETION",
  ACCOUNT_DELETED: "ACCOUNT_DELETED",
  MERGE_REQUIRED: "MERGE_REQUIRED",
  // F3/F4 journey
  NO_JOURNEY_CASE: "NO_JOURNEY_CASE",
  CONFLICT: "CONFLICT",
  // F2.6r Apple token revoke
  APPLE_REVOKE_FAILED: "APPLE_REVOKE_FAILED",
  APPLE_REVOKE_MISCONFIGURED: "APPLE_REVOKE_MISCONFIGURED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

export type JsonErrorArgs = {
  code: string;
  message: string;
  requestId: string;
  status: number;
};

/** Build a NextResponse with the locked error envelope + x-request-id. */
export function jsonError({
  code,
  message,
  requestId,
  status,
}: JsonErrorArgs): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: { code, message, requestId },
  };
  const res = NextResponse.json(body, { status });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}
