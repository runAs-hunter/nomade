/**
 * F8 shared HTTP helpers for /api/sources routes.
 */

import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import type { RepoResult } from "@/lib/sources/repo";

export function repoErrorResponse(
  result: Extract<RepoResult<unknown>, { ok: false }>,
  requestId: string,
): NextResponse {
  if (result.code === "NOT_FOUND") {
    return jsonError({ code: ERROR_CODES.NOT_FOUND, message: result.message, requestId, status: 404 });
  }
  if (result.code === "CONFLICT") {
    return jsonError({ code: ERROR_CODES.CONFLICT, message: result.message, requestId, status: 409 });
  }
  return jsonError({
    code: ERROR_CODES.INTERNAL_ERROR,
    message: result.message,
    requestId,
    status: 500,
  });
}

/** Read + JSON.parse a request body. Empty body → null. */
export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const raw = await request.text();
  if (raw.trim().length === 0) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}
