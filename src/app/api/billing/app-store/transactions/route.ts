import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { requireAccess } from "@/lib/auth/require-access";
import { processAppStoreTransaction } from "@/lib/billing/transactions";
import { getAppStoreBillingConfig } from "@/lib/env";
import { requireActiveJourneyAccount } from "@/lib/journey/access";
import {
  activeAccountErrorResponse,
  withRequestId,
} from "@/lib/journey/http";
import { log } from "@/lib/log";
import { getRequestId } from "@/lib/request-id";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/app-store/transactions (F3.1)
 * Body: { signedTransaction: "<JWS>", eventType?: "purchase"|"restore" }
 * Verifies StoreKit 2 JWS server-side; upserts billing_events + entitlements.
 * Never trusts a client-only "I paid" flag.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  const auth = await requireAccess(request, {
    requestId,
    logger,
    failMessage: "billing transaction unauthenticated",
  });
  if (auth instanceof NextResponse) return auth;

  let parsed: unknown = null;
  const raw = await request.text();
  if (raw.trim().length > 0) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return jsonError({
        code: ERROR_CODES.BAD_REQUEST,
        message: "Malformed JSON body",
        requestId,
        status: 400,
      });
    }
  }

  const body =
    parsed !== null && typeof parsed === "object"
      ? (parsed as {
          signedTransaction?: unknown;
          signedTransactionInfo?: unknown;
          eventType?: unknown;
        })
      : {};

  try {
    const service = createServiceClient();
    const account = await requireActiveJourneyAccount(service, auth.userId);
    if (!account.ok) {
      logger.info("billing transaction account refused", {
        code: account.code,
        userId: auth.userId,
      });
      return activeAccountErrorResponse(account, requestId);
    }

    const config = getAppStoreBillingConfig();
    const result = await processAppStoreTransaction(service, {
      userId: auth.userId,
      body,
      config,
    });

    if (!result.ok) {
      if (result.code === "BAD_REQUEST") {
        return jsonError({
          code: ERROR_CODES.BAD_REQUEST,
          message: result.message,
          requestId,
          status: 400,
        });
      }
      if (
        result.code === "UNVERIFIED" ||
        result.code === "PRODUCT_MISMATCH" ||
        result.code === "BUNDLE_MISMATCH"
      ) {
        return jsonError({
          code: ERROR_CODES.BAD_REQUEST,
          message: result.message,
          requestId,
          status: 400,
        });
      }
      if (result.code === "MISCONFIGURED") {
        logger.error("billing transaction misconfigured", {
          code: ERROR_CODES.ENV_INVALID,
          userId: auth.userId,
        });
        return jsonError({
          code: ERROR_CODES.ENV_INVALID,
          message: result.message,
          requestId,
          status: 503,
        });
      }
      if (result.code === "CONFLICT") {
        logger.info("billing transaction ownership conflict", {
          code: ERROR_CODES.CONFLICT,
          userId: auth.userId,
        });
        return jsonError({
          code: ERROR_CODES.CONFLICT,
          message: result.message,
          requestId,
          status: 409,
        });
      }
      logger.error("billing transaction failed", {
        code: ERROR_CODES.INTERNAL_ERROR,
        userId: auth.userId,
        txCode: result.code,
      });
      return jsonError({
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "Failed to record transaction",
        requestId,
        status: 500,
      });
    }

    // Log ids only — never JWS (Class E).
    logger.info("billing transaction ok", {
      userId: auth.userId,
      entitlementId: result.entitlement.id,
      status: result.entitlement.status,
      eventInserted: result.eventInserted,
      sourceTransactionId: result.entitlement.sourceTransactionId,
    });
    return withRequestId(
      {
        entitlement: result.entitlement,
        eventInserted: result.eventInserted,
        requestId,
      },
      200,
      requestId,
    );
  } catch {
    logger.error("billing transaction threw", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId: auth.userId,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected transaction failure",
      requestId,
      status: 500,
    });
  }
}
