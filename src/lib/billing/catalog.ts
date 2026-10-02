/**
 * F3.1 billing catalog — phase gate + product→entitlement map.
 * Product id comes from env (Keeper / ASC) — never invent an ASC id here.
 * See docs/runbooks/F3.1-billing-entitlement-runbook.md.
 */

/** Internal entitlement key (not an App Store product id). */
export const JOURNEY_FULL_ENTITLEMENT_ID = "journey_full" as const;

export type EntitlementId = typeof JOURNEY_FULL_ENTITLEMENT_ID;

export type PhaseAccess = "free" | "paid";

/** Free: Gather Documents. Paid: Apply + After Arrival (Cap lock). */
export const FREE_PHASE_NAMES = ["Gather Documents"] as const;
export const PAID_PHASE_NAMES = ["Apply", "After Arrival"] as const;

export function phaseAccess(phaseName: string): PhaseAccess {
  if ((FREE_PHASE_NAMES as readonly string[]).includes(phaseName)) {
    return "free";
  }
  return "paid";
}

export function stepRequiresEntitlement(phaseName: string): boolean {
  return phaseAccess(phaseName) === "paid";
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
