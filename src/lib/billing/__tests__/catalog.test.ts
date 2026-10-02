import { describe, it, expect } from "vitest";
import {
  JOURNEY_FULL_ENTITLEMENT_ID,
  entitlementForProductId,
  phaseAccess,
  stepRequiresEntitlement,
} from "@/lib/billing/catalog";

describe("billing catalog", () => {
  it("marks Gather Documents free and Apply/After Arrival paid", () => {
    expect(phaseAccess("Gather Documents")).toBe("free");
    expect(phaseAccess("Apply")).toBe("paid");
    expect(phaseAccess("After Arrival")).toBe("paid");
    expect(stepRequiresEntitlement("Gather Documents")).toBe(false);
    expect(stepRequiresEntitlement("Apply")).toBe(true);
  });

  it("maps only the configured product id to journey_full", () => {
    expect(entitlementForProductId("asc.real.from.keeper", "asc.real.from.keeper")).toBe(
      JOURNEY_FULL_ENTITLEMENT_ID,
    );
    expect(entitlementForProductId("other", "asc.real.from.keeper")).toBeNull();
    expect(entitlementForProductId("anything", "")).toBeNull();
  });
});
