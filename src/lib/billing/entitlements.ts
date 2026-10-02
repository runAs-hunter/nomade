/**
 * F3.1 entitlement read / upsert (server SoT).
 */

import type { AccountDbClient } from "@/lib/account/export";
import {
  BILLING_SOURCE_APP_STORE,
  JOURNEY_FULL_ENTITLEMENT_ID,
  type BillingEventType,
  type EntitlementId,
} from "@/lib/billing/catalog";

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
  /** Opaque hash of signed payload — never the raw JWS. */
  rawRef: string | null;
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
      code: "DB_ERROR" | "CONFLICT";
      message: string;
    };

/**
 * Idempotent upsert: billing_events unique (source, transaction_id);
 * entitlement granted/updated for the mapped entitlement id.
 * Same-user replay is idempotent; cross-user reuse → CONFLICT.
 */
export async function recordVerifiedTransaction(
  service: AccountDbClient,
  args: RecordVerifiedTransactionArgs,
): Promise<RecordVerifiedTransactionResult> {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const db = service.schema("internal");

  const existing = await db
    .from("billing_events")
    .select(
      "id, user_id, source, product_id, transaction_id, original_transaction_id, event_type, occurred_at, raw_ref, created_at",
    )
    .eq("source", BILLING_SOURCE_APP_STORE)
    .eq("transaction_id", args.transactionId)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to read billing event" };
  }

  let eventInserted = false;
  let existingRow = (existing.data as BillingEventRow | null) ?? null;

  if (!existingRow) {
    const ins = await db.from("billing_events").insert({
      user_id: args.userId,
      source: BILLING_SOURCE_APP_STORE,
      product_id: args.productId,
      transaction_id: args.transactionId,
      original_transaction_id: args.originalTransactionId,
      event_type: args.eventType,
      occurred_at: args.occurredAt,
      raw_ref: args.rawRef,
    });
    if (ins.error) {
      // Race: unique violation → re-read and bind to existing owner
      const msg = String(
        (ins.error as { message?: string; code?: string }).message ?? "",
      );
      const code = String(
        (ins.error as { code?: string }).code ?? "",
      );
      if (!/duplicate|unique|23505/i.test(`${msg} ${code}`)) {
        return {
          ok: false,
          code: "DB_ERROR",
          message: "Failed to insert billing event",
        };
      }
      const again = await db
        .from("billing_events")
        .select(
          "id, user_id, source, product_id, transaction_id, original_transaction_id, event_type, occurred_at, raw_ref, created_at",
        )
        .eq("source", BILLING_SOURCE_APP_STORE)
        .eq("transaction_id", args.transactionId)
        .maybeSingle();
      if (again.error || !again.data) {
        return {
          ok: false,
          code: "DB_ERROR",
          message: "Failed to read billing event after conflict",
        };
      }
      existingRow = again.data as BillingEventRow;
    } else {
      eventInserted = true;
    }
  }

  // Cap F3: bind transaction_id to claiming user — never grant to a different caller
  if (existingRow && existingRow.user_id !== args.userId) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "Transaction already recorded for another user",
    };
  }

  const upsert = await db
    .from("entitlements")
    .upsert(
      {
        user_id: args.userId,
        entitlement_id: args.entitlementId,
        status: "active",
        source_transaction_id: args.transactionId,
        granted_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "user_id,entitlement_id" },
    )
    .select(
      "user_id, entitlement_id, status, source_transaction_id, granted_at, updated_at",
    )
    .maybeSingle();

  if (upsert.error || !upsert.data) {
    // Some PostgREST clients need separate update-or-insert
    const current = await db
      .from("entitlements")
      .select(
        "user_id, entitlement_id, status, source_transaction_id, granted_at, updated_at",
      )
      .eq("user_id", args.userId)
      .eq("entitlement_id", args.entitlementId)
      .maybeSingle();

    if (current.error) {
      return {
        ok: false,
        code: "DB_ERROR",
        message: "Failed to upsert entitlement",
      };
    }

    if (current.data) {
      const upd = await db
        .from("entitlements")
        .update({
          status: "active",
          source_transaction_id: args.transactionId,
          updated_at: nowIso,
        })
        .eq("user_id", args.userId)
        .eq("entitlement_id", args.entitlementId)
        .select(
          "user_id, entitlement_id, status, source_transaction_id, granted_at, updated_at",
        )
        .maybeSingle();
      if (upd.error || !upd.data) {
        return {
          ok: false,
          code: "DB_ERROR",
          message: "Failed to update entitlement",
        };
      }
      return {
        ok: true,
        entitlement: toEntitlementView(upd.data as EntitlementRow),
        eventInserted,
      };
    }

    const insEnt = await db
      .from("entitlements")
      .insert({
        user_id: args.userId,
        entitlement_id: args.entitlementId,
        status: "active",
        source_transaction_id: args.transactionId,
        granted_at: nowIso,
        updated_at: nowIso,
      })
      .select(
        "user_id, entitlement_id, status, source_transaction_id, granted_at, updated_at",
      )
      .maybeSingle();
    if (insEnt.error || !insEnt.data) {
      return {
        ok: false,
        code: "DB_ERROR",
        message: "Failed to insert entitlement",
      };
    }
    return {
      ok: true,
      entitlement: toEntitlementView(insEnt.data as EntitlementRow),
      eventInserted,
    };
  }

  return {
    ok: true,
    entitlement: toEntitlementView(upsert.data as EntitlementRow),
    eventInserted,
  };
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
      "transaction_id, original_transaction_id, product_id, event_type, occurred_at",
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
    })),
  };
}
