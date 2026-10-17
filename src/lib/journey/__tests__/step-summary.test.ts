import { describe, expect, it } from "vitest";
import { buildChecklistView } from "@/lib/journey/checklist";
import {
  JOURNEY_PATHS,
  JOURNEY_STEP_SUMMARIES,
  JOURNEY_STEP_SUMMARY_MAX,
  listStepDefsForPath,
  stepSummaryFor,
  type JourneyPathId,
  type JourneyStepSummaries,
} from "@/lib/journey/catalog";

const CASE_ID = "cccccccc-dddd-eeee-ffff-000000000001";
const NOW = "2026-10-02T16:00:00.000Z";

function view(pathId: JourneyPathId, opts: { stepSummaries?: JourneyStepSummaries; gateEnabled?: boolean; journeyFull?: boolean; intakeEnabled?: boolean } = {}) {
  return buildChecklistView({
    journeyCase: { caseId: CASE_ID, pathId, countryCode: "IT", createdAt: NOW, updatedAt: NOW },
    pathId,
    states: [],
    ...opts,
  });
}

// Test-only placeholder strings: no visa facts (summary copy is Visa Ops'.)
const FIXTURE: JourneyStepSummaries = {
  all: { passport: "TEST summary A", "visa-fee": "TEST summary B", accommodation: "   " },
  byPath: { italy_remote_worker: { passport: "TEST summary A (remote)" } },
};

describe("task card v2: step summary", () => {
  it("ships empty until Visa Ops writes it, so no step carries a summary key", () => {
    expect(JOURNEY_STEP_SUMMARIES.all).toEqual({});
    for (const p of JOURNEY_PATHS) {
      for (const phase of view(p.pathId as JourneyPathId).phases) {
        for (const s of phase.steps) expect("summary" in s, `${p.pathId}/${s.id}`).toBe(false);
      }
    }
  });

  it("passes summaries through per step, with path overrides and blanks treated as absent", () => {
    const nomad = view("italy_digital_nomad", { stepSummaries: FIXTURE }).phases.flatMap((p) => p.steps);
    expect(nomad.find((s) => s.id === "passport")?.summary).toBe("TEST summary A");
    expect("summary" in nomad.find((s) => s.id === "accommodation")!).toBe(false);
    expect("summary" in nomad.find((s) => s.id === "proof-of-income")!).toBe(false);
    const remote = view("italy_remote_worker", { stepSummaries: FIXTURE }).phases.flatMap((p) => p.steps);
    expect(remote.find((s) => s.id === "passport")?.summary).toBe("TEST summary A (remote)");
    expect(stepSummaryFor("italy_digital_nomad", "unknown-step", FIXTURE)).toBeUndefined();
  });

  it("does not change detail", () => {
    const plain = view("italy_digital_nomad").phases.flatMap((p) => p.steps);
    const withSum = view("italy_digital_nomad", { stepSummaries: FIXTURE }).phases.flatMap((p) => p.steps);
    expect(withSum.map((s) => s.detail)).toEqual(plain.map((s) => s.detail));
  });

  it("is withheld on locked steps, like detail", () => {
    const locked = view("italy_digital_nomad", { stepSummaries: FIXTURE, gateEnabled: true, journeyFull: false }).phases.flatMap((p) => p.steps);
    expect("summary" in locked.find((s) => s.id === "visa-fee")!).toBe(false);
    expect(locked.find((s) => s.id === "passport")?.summary).toBe("TEST summary A");
    const paid = view("italy_digital_nomad", { stepSummaries: FIXTURE, gateEnabled: true, journeyFull: true }).phases.flatMap((p) => p.steps);
    expect(paid.find((s) => s.id === "visa-fee")?.summary).toBe("TEST summary B");
  });

  it("guards the shipped copy: known step ids, one line, bounded length", () => {
    const all = JOURNEY_PATHS.flatMap((p) => listStepDefsForPath(p.pathId as JourneyPathId).map((s) => s.id));
    const check = (m: Readonly<Record<string, string>>) => {
      for (const [id, text] of Object.entries(m)) {
        expect(all, id).toContain(id);
        expect(text.includes("\n"), id).toBe(false);
        expect(text.trim().length, id).toBeGreaterThan(0);
        expect(text.length, id).toBeLessThanOrEqual(JOURNEY_STEP_SUMMARY_MAX);
      }
    };
    check(JOURNEY_STEP_SUMMARIES.all);
    for (const m of Object.values(JOURNEY_STEP_SUMMARIES.byPath ?? {})) if (m) check(m);
  });
});
