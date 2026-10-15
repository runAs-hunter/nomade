/**
 * F3.1 → F10 entitlement read / upsert (server SoT).
 * F10: records `environment`; revoked transactions set the entitlement
 * inactive; the same Apple transaction on a second Nomade account is allowed
 * and logged (Cap default), not rejected.
 */

import type { AccountDbClient } from "@/lib/account/export";
import {
  BILLING_SOURCE_APP_STORE,
  JOURNEY_FULL_ENTITLEMENT_ID,
  type BillingEventType,
  type EntitlementId,
} from "@/lib/billing/catalog";
import { log } from "@/lib/log";

export type EntitlementRow = {
  user_id: string;
  entitlement_id: string;
  status: "active" | "inactive";
  source_transaction_id: string | null;
  granted_at: string;
  updated_at: string;
};

export type EntitlementView = {
  id: string;
  status: "active" | "inactive";
  grantedAt: string;
  updatedAt: string;
  sourceTransactionId: string | null;
};

export type BillingEventRow = {
  id: string;
  user_id: string;
  source: string;
  product_id: string;
  transaction_id: string;
  original_transaction_id: string | null;
  event_type: string;
  occurred_at: string;
  raw_ref: string | null;
  environment?: string | null;
  created_at: string;
};

export function toEntitlementView(row: EntitlementRow): EntitlementView {
  return {
    id: row.entitlement_id,
    status: row.status,
    grantedAt: row.granted_at,
    updatedAt: row.updated_at,
    sourceTransactionId: row.source_transaction_id,
  };
}

export async function listEntitlements(
  service: AccountDbClient,
  userId: string,
): Promise<
  | { ok: true; entitlements: EntitlementView[] }
  | { ok: false; code: "DB_ERROR"; message: string }
> {
  const db = service.schema("internal");
  const res = await db
    .from("entitlements")
    .select(
      "user_id, entitlement_id, status, source_transaction_id, granted_at, updated_at",
    )
    .eq("user_id", userId);

  if (res.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to read entitlements" };
  }

  const rows = (res.data as EntitlementRow[] | null) ?? [];
  return { ok: true, entitlements: rows.map(toEntitlementView) };
}

export async function hasActiveJourneyFull(
  service: AccountDbClient,
  userId: string,
): Promise<
  | { ok: true; active: boolean }
  | { ok: false; code: "DB_ERROR"; message: string }
> {
  const db = service.schema("internal");
  const res = await db
    .from("entitlements")
    .select("status")
    .eq("user_id", userId)
    .eq("entitlement_id", JOURNEY_FULL_ENTITLEMENT_ID)
    .maybeSingle();

  if (res.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to read entitlement" };
  }

  const row = res.data as { status?: string } | null;
  return { ok: true, active: row?.status === "active" };
}

export type RecordVerifiedTransactionArgs = {
  userId: string;
  productId: string;
  transactionId: string;
  originalTransactionId: string | null;
  eventType: BillingEventType;
  occurredAt: string;
  /** SHA-256 of the signed payload — never the raw JWS. */
  rawRef: string | null;
  /** Production | Sandbox | Xcode (already policy-checked). */
  environment?: string | null;
  /** Apple revocationDate (ISO) when the verified JWS is revoked. */
  revokedAt?: string | null;
  entitlementId: EntitlementId;
  nowIso?: string;
};

export type RecordVerifiedTransactionResult =
  | {
      ok: true;
      entitlement: EntitlementView;
      eventInserted: boolean;
    }
  | {
      ok: false;
      code: "DB_ERROR";
      message: string;
    };

const EVENT_COLUMNS =
  "id, user_id, source, product_id, transaction_id, original_transaction_id, event_type, occurred_at, raw_ref, environment, revoked_at, created_at";
const ENTITLEMENT_COLUMNS =
  "user_id, entitlement_id, status, source_transaction_id, granted_at, updated_at";

type EventRow = BillingEventRow & { revoked_at?: string | null };

/**
 * F10 record path:
 * - billing_events unique (source, transaction_id); a concurrent insert race re-reads.
 * - Sticky revocation: once `revoked_at` is set for a transaction (by a revoked
 *   JWS), it is never cleared and the transaction never grants `active` again —
 *   replaying a saved pre-refund JWS stays inactive.
 * - On revoke, every entitlement sourced from that transaction is deactivated
 *   (shared Apple ID across Nomade accounts).
 * - Same transaction on a second account (not revoked) → granted + logged.
 * - granted_at is set on first grant only; replays update status/updated_at.
 */
export async function recordVerifiedTransaction(
  service: AccountDbClient,
  args: RecordVerifiedTransactionArgs,
): Promise<RecordVerifiedTransactionResult> {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const db = service.schema("internal");
  const fail = (message: string): RecordVerifiedTransactionResult => ({
    ok: false,
    code: "DB_ERROR",
    message,
  });

  const readEvent = () =>
    db
      .from("billing_events")
      .select(EVENT_COLUMNS)
      .eq("source", BILLING_SOURCE_APP_STORE)
      .eq("transaction_id", args.transactionId)
      .maybeSingle();

  const existing = await readEvent();
  if (existing.error) return fail("Failed to read billing event");

  let eventInserted = false;
  let eventRow = (existing.data as EventRow | null) ?? null;

  if (!eventRow) {
    const ins = await db.from("billing_events").insert({
      user_id: args.userId,
      source: BILLING_SOURCE_APP_STORE,
      product_id: args.productId,
      transaction_id: args.transactionId,
      original_transaction_id: args.originalTransactionId,
      event_type: args.eventType,
      occurred_at: args.occurredAt,
      raw_ref: args.rawRef,
      environment: args.environment ?? null,
      revoked_at: args.revokedAt ?? null,
    });
    if (ins.error) {
      const e = ins.error as { message?: string; code?: string };
      if (!/duplicate|unique|23505/i.test(`${e.message ?? ""} ${e.code ?? ""}`)) {
        return fail("Failed to insert billing event");
      }
      const again = await readEvent();
      if (again.error || !again.data) return fail("Failed to read billing event after conflict");
      eventRow = again.data as EventRow;
    } else {
      eventInserted = true;
    }
  }

  // Sticky: mark the stored event revoked (never cleared).
  if (args.revokedAt && eventRow && !eventRow.revoked_at) {
    const upd = await db
      .from("billing_events")
      .update({ revoked_at: args.revokedAt })
      .eq("source", BILLING_SOURCE_APP_STORE)
      .eq("transaction_id", args.transactionId);
    if (upd.error) return fail("Failed to record revocation");
  }

  const revoked = Boolean(args.revokedAt || eventRow?.revoked_at);

  if (revoked) {
    // Deactivate every account sourced from this transaction.
    const off = await db
      .from("entitlements")
      .update({ status: "inactive", updated_at: nowIso })
      .eq("source_transaction_id", args.transactionId);
    if (off.error) return fail("Failed to deactivate entitlements");
  } else if (eventRow && eventRow.user_id !== args.userId) {
    log.warn("billing transaction shared across accounts", {
      userId: args.userId,
      firstUserId: eventRow.user_id,
      transactionId: args.transactionId,
      environment: args.environment ?? null,
    });
  }

  const current = await db
    .from("entitlements")
    .select(ENTITLEMENT_COLUMNS)
    .eq("user_id", args.userId)
    .eq("entitlement_id", args.entitlementId)
    .maybeSingle();
  if (current.error) return fail("Failed to read entitlement");
  const cur = current.data as EntitlementRow | null;

  if (revoked) {
    // Never (re)activate. A different, still-valid source keeps its state.
    if (cur) return { ok: true, entitlement: toEntitlementView(cur), eventInserted };
    const ins = await db
      .from("entitlements")
      .insert({
        user_id: args.userId,
        entitlement_id: args.entitlementId,
        status: "inactive",
        source_transaction_id: args.transactionId,
        granted_at: nowIso,
        updated_at: nowIso,
      })
      .select(ENTITLEMENT_COLUMNS)
      .maybeSingle();
    if (ins.error || !ins.data) return fail("Failed to insert entitlement");
    return { ok: true, entitlement: toEntitlementView(ins.data as EntitlementRow), eventInserted };
  }

  if (cur) {
    // Replay / restore: keep granted_at.
    const upd = await db
      .from("entitlements")
      .update({ status: "active", source_transaction_id: args.transactionId, updated_at: nowIso })
      .eq("user_id", args.userId)
      .eq("entitlement_id", args.entitlementId)
      .select(ENTITLEMENT_COLUMNS)
      .maybeSingle();
    if (upd.error || !upd.data) return fail("Failed to update entitlement");
    return { ok: true, entitlement: toEntitlementView(upd.data as EntitlementRow), eventInserted };
  }

  const ins = await db
    .from("entitlements")
    .insert({
      user_id: args.userId,
      entitlement_id: args.entitlementId,
      status: "active",
      source_transaction_id: args.transactionId,
      granted_at: nowIso,
      updated_at: nowIso,
    })
    .select(ENTITLEMENT_COLUMNS)
    .maybeSingle();
  if (ins.error || !ins.data) return fail("Failed to insert entitlement");
  return { ok: true, entitlement: toEntitlementView(ins.data as EntitlementRow), eventInserted };
}

export async function loadBillingForExport(
  service: AccountDbClient,
  userId: string,
): Promise<
  | {
      ok: true;
      entitlements: EntitlementView[];
      events: Array<{
        transactionId: string;
        originalTransactionId: string | null;
        productId: string;
        eventType: string;
        occurredAt: string;
        environment: string | null;
      }>;
    }
  | { ok: false; code: "DB_ERROR"; message: string }
> {
  const ents = await listEntitlements(service, userId);
  if (!ents.ok) return ents;

  const db = service.schema("internal");
  const evRes = await db
    .from("billing_events")
    .select(
      "transaction_id, original_transaction_id, product_id, event_type, occurred_at, environment",
    )
    .eq("user_id", userId)
    .order("occurred_at", { ascending: true });

  if (evRes.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to read billing events" };
  }

  type Ev = {
    transaction_id: string;
    original_transaction_id: string | null;
    product_id: string;
    event_type: string;
    occurred_at: string;
    environment?: string | null;
  };
  const rows = (evRes.data as Ev[] | null) ?? [];

  return {
    ok: true,
    entitlements: ents.entitlements,
    events: rows.map((r) => ({
      transactionId: r.transaction_id,
      originalTransactionId: r.original_transaction_id,
      productId: r.product_id,
      eventType: r.event_type,
      occurredAt: r.occurred_at,
      environment: r.environment ?? null,
    })),
  };
}
