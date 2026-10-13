/**
 * F3.1 billing catalog — phase gate + product→entitlement map.
 * Product id comes from env (Keeper / ASC) — never invent an ASC id here.
 * See docs/billing.md (F10). F10: the gate keys on stable phase ids from
 * journey/catalog.ts, never on display names (F5 renamed them; #20's name
 * gate made every phase paid).
 */

import type { JourneyPhaseId } from "@/lib/journey/catalog";

/** Internal entitlement key (not an App Store product id). */
export const JOURNEY_FULL_ENTITLEMENT_ID = "journey_full" as const;

export type EntitlementId = typeof JOURNEY_FULL_ENTITLEMENT_ID;

export type PhaseAccess = "free" | "paid";

/** Free: gather. Paid: apply + after (Cap lock). Keyed by phase id. */
export const PHASE_ACCESS: Readonly<Record<JourneyPhaseId, PhaseAccess>> = {
  gather: "free",
  apply: "paid",
  after: "paid",
};

export function phaseAccess(phaseId: JourneyPhaseId): PhaseAccess {
  return PHASE_ACCESS[phaseId];
}

export function stepRequiresEntitlement(phaseId: JourneyPhaseId): boolean {
  return phaseAccess(phaseId) === "paid";
}

/**
 * Map a verified App Store product id → internal entitlement.
 * Only the configured journey product unlocks journey_full.
 */
export function entitlementForProductId(
  productId: string,
  configuredJourneyProductId: string,
): EntitlementId | null {
  const configured = configuredJourneyProductId.trim();
  if (!configured) return null;
  if (productId.trim() === configured) return JOURNEY_FULL_ENTITLEMENT_ID;
  return null;
}

export const BILLING_SOURCE_APP_STORE = "app_store" as const;

export type BillingEventType = "purchase" | "restore" | "refund";

export function isBillingEventType(value: unknown): value is BillingEventType {
  return (
    value === "purchase" || value === "restore" || value === "refund"
  );
}
