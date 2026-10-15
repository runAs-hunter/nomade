import { describe, it, expect } from "vitest";
import {
  JOURNEY_PATHS,
  JOURNEY_PHASE_IDS,
  getPhasesForPath,
  listStepDefsForPath,
} from "@/lib/journey/catalog";
import {
  JOURNEY_FULL_ENTITLEMENT_ID,
  entitlementForProductId,
  phaseAccess,
  stepRequiresEntitlement,
} from "@/lib/billing/catalog";

describe("billing catalog", () => {
  it("marks gather free and apply/after paid (by id)", () => {
    expect(phaseAccess("gather")).toBe("free");
    expect(phaseAccess("apply")).toBe("paid");
    expect(phaseAccess("after")).toBe("paid");
    expect(stepRequiresEntitlement("gather")).toBe(false);
    expect(stepRequiresEntitlement("apply")).toBe(true);
    for (const id of JOURNEY_PHASE_IDS) expect(["free", "paid"]).toContain(phaseAccess(id));
  });

  it("every path: 'Gather documents' is free, everything else paid; no path is all-paid", () => {
    for (const path of JOURNEY_PATHS) {
      const phases = getPhasesForPath(path.pathId);
      expect(phases.length).toBeGreaterThan(0);
      for (const phase of phases) {
        const expected = phase.name === "Gather documents" ? "free" : "paid";
        expect(phaseAccess(phase.id), `${path.pathId}/${phase.name}`).toBe(expected);
        for (const step of phase.steps) {
          expect(step.phaseId).toBe(phase.id);
          expect(step.phaseName).toBe(phase.name);
        }
      }
      const steps = listStepDefsForPath(path.pathId);
      const free = steps.filter((s) => !stepRequiresEntitlement(s.phaseId));
      expect(free.length, `${path.pathId} free steps`).toBeGreaterThan(0);
      expect(free.length).toBeLessThan(steps.length);
      expect(free.map((s) => s.id)).toContain("passport");
      expect(steps.filter((s) => s.id === "consulate-appointment" || s.id === "permesso-soggiorno").every((s) => stepRequiresEntitlement(s.phaseId))).toBe(true);
    }
  });

  it("maps only the configured product id to journey_full", () => {
    expect(entitlementForProductId("asc.real.from.keeper", "asc.real.from.keeper")).toBe(
      JOURNEY_FULL_ENTITLEMENT_ID,
    );
    expect(entitlementForProductId("other", "asc.real.from.keeper")).toBeNull();
    expect(entitlementForProductId("anything", "")).toBeNull();
  });
});
