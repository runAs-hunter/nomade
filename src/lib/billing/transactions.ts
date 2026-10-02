/**
 * F3.1 POST /api/billing/app-store/transactions orchestration.
 */

import type { AccountDbClient } from "@/lib/account/export";
import {
  entitlementForProductId,
  isBillingEventType,
  type BillingEventType,
} from "@/lib/billing/catalog";
import {
  recordVerifiedTransaction,
  type EntitlementView,
} from "@/lib/billing/entitlements";
import {
  verifySignedTransactionJws,
  type VerifySignedTransactionFn,
} from "@/lib/billing/verify-jws";

export type ProcessTransactionBody = {
  signedTransaction?: unknown;
  /** Alias accepted for StoreKit naming. */
  signedTransactionInfo?: unknown;
  eventType?: unknown;
};

export type ProcessTransactionResult =
  | {
      ok: true;
      entitlement: EntitlementView;
      eventInserted: boolean;
    }
  | {
      ok: false;
      code:
        | "BAD_REQUEST"
        | "UNVERIFIED"
        | "PRODUCT_MISMATCH"
        | "BUNDLE_MISMATCH"
        | "MISCONFIGURED"
        | "CONFLICT"
        | "DB_ERROR";
      message: string;
    };

export type AppStoreBillingConfig = {
  /** ASC product id from Keeper/env — never invent. */
  journeyProductId: string;
  /** Bundle id, defaults to com.izaya.Nomade. */
  bundleId: string;
};

export async function processAppStoreTransaction(
  service: AccountDbClient,
  args: {
    userId: string;
    body: ProcessTransactionBody;
    config: AppStoreBillingConfig;
    verify?: VerifySignedTransactionFn;
    nowIso?: string;
  },
): Promise<ProcessTransactionResult> {
  const productConfigured = args.config.journeyProductId.trim();
  if (!productConfigured) {
    return {
      ok: false,
      code: "MISCONFIGURED",
      message:
        "APP_STORE_JOURNEY_PRODUCT_ID is not configured (set from Keeper / ASC sandbox)",
    };
  }

  const rawJws =
    typeof args.body.signedTransaction === "string"
      ? args.body.signedTransaction
      : typeof args.body.signedTransactionInfo === "string"
        ? args.body.signedTransactionInfo
        : null;

  if (!rawJws || rawJws.trim().length === 0) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "signedTransaction (JWS) is required",
    };
  }

  let eventType: BillingEventType = "purchase";
  if (args.body.eventType !== undefined) {
    if (!isBillingEventType(args.body.eventType)) {
      return {
        ok: false,
        code: "BAD_REQUEST",
        message: "eventType must be purchase | restore | refund",
      };
    }
    eventType = args.body.eventType;
  }

  const verify = args.verify ?? verifySignedTransactionJws;
  const verified = await verify(rawJws);
  if (!verified.ok) {
    return {
      ok: false,
      code: verified.code === "INVALID_JWS" ? "BAD_REQUEST" : "UNVERIFIED",
      message: verified.message,
    };
  }

  const txn = verified.transaction;
  if (txn.bundleId !== args.config.bundleId) {
    return {
      ok: false,
      code: "BUNDLE_MISMATCH",
      message: "Transaction bundleId does not match this app",
    };
  }

  const entitlementId = entitlementForProductId(
    txn.productId,
    productConfigured,
  );
  if (!entitlementId) {
    return {
      ok: false,
      code: "PRODUCT_MISMATCH",
      message: "Transaction productId is not the configured journey product",
    };
  }

  const recorded = await recordVerifiedTransaction(service, {
    userId: args.userId,
    productId: txn.productId,
    transactionId: txn.transactionId,
    originalTransactionId: txn.originalTransactionId,
    eventType,
    occurredAt: txn.purchaseDateIso,
    rawRef: txn.rawRef,
    entitlementId,
    nowIso: args.nowIso,
  });

  if (!recorded.ok) {
    return { ok: false, code: recorded.code, message: recorded.message };
  }

  return {
    ok: true,
    entitlement: recorded.entitlement,
    eventInserted: recorded.eventInserted,
  };
}
