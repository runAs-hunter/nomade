import { describe, it, expect } from "vitest";
import {
  JOURNEY_CATALOG_VERSION,
  JOURNEY_DISCLAIMER,
  computeProgress,
  getPathDef,
  getStepDef,
  isJourneyStepStatus,
  listJourneyPaths,
  listStepDefsForPath,
} from "@/lib/journey/catalog";

describe("journey catalog", () => {
  it("lists DNV primary and remote-worker with same availability", () => {
    const paths = listJourneyPaths();
    expect(paths.map((p) => p.pathId)).toEqual([
      "italy_digital_nomad",
      "italy_remote_worker",
    ]);
    expect(paths.every((p) => p.available)).toBe(true);
    expect(getPathDef("italy_digital_nomad")?.title).toMatch(/Digital Nomad/i);
  });

  it("exposes stable italy.yaml-aligned step ids and omits dependent-permesso", () => {
    const ids = listStepDefsForPath("italy_digital_nomad").map((s) => s.id);
    expect(ids).toContain("passport");
    expect(ids).toContain("proof-of-income");
    expect(ids).toContain("consulate-appointment");
    expect(ids).toContain("permesso-soggiorno");
    expect(ids).toContain("anagrafe");
    expect(ids).not.toContain("dependent-permesso");
    expect(ids).toHaveLength(13);

    const rw = listStepDefsForPath("italy_remote_worker").map((s) => s.id);
    expect(rw).toEqual(ids);
  });

  it("has catalog version + disclaimer", () => {
    expect(JOURNEY_CATALOG_VERSION).toBe("stub-italy-dnv-2026-10-01");
    expect(JOURNEY_DISCLAIMER).toMatch(/not legal advice/i);
  });

  it("validates status enum and computes progress", () => {
    expect(isJourneyStepStatus("not_started")).toBe(true);
    expect(isJourneyStepStatus("in_progress")).toBe(true);
    expect(isJourneyStepStatus("done")).toBe(true);
    expect(isJourneyStepStatus("completed")).toBe(false);
    expect(computeProgress(["done", "in_progress", "not_started", "done"])).toEqual({
      done: 2,
      total: 4,
      fraction: 0.5,
    });
    expect(getStepDef("italy_digital_nomad", "passport")?.name).toMatch(/passport/i);
    expect(getStepDef("italy_digital_nomad", "nope")).toBeNull();
  });
});
