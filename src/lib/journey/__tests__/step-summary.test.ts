import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  it("ships the approved Visa Ops summaries byte-exact from step-summaries.md", () => {
    // Table rows: | `step-id` | path | summary | chars | grounded in |
    const md = readFileSync(join(__dirname, "fixtures", "step-summaries.md"), "utf8");
    const rows = [...md.matchAll(/^\| `([a-z-]+)` \| ([^|]+) \| ([^|]+) \| (\d+) \|/gm)].map((m) => ({
      id: m[1], path: m[2].trim(), text: m[3].trim(), chars: Number(m[4]),
    }));
    expect(rows.length).toBe(20);
    const pathOf: Record<string, JourneyPathId> = { nomad: "italy_digital_nomad", remote: "italy_remote_worker" };
    for (const r of rows) {
      expect([...r.text].length, r.id).toBe(r.chars);
      const paths = r.path.startsWith("both") ? (["italy_digital_nomad", "italy_remote_worker"] as const) : [pathOf[r.path]];
      expect(paths[0], `${r.id} path ${r.path}`).toBeDefined();
      for (const p of paths) expect(stepSummaryFor(p, r.id), `${p}/${r.id}`).toBe(r.text);
    }
    // Nothing shipped that is not in the file.
    const shipped = [
      ...Object.entries(JOURNEY_STEP_SUMMARIES.all),
      ...Object.values(JOURNEY_STEP_SUMMARIES.byPath ?? {}).flatMap((m) => Object.entries(m ?? {})),
    ];
    for (const [id, text] of shipped) expect(rows.some((r) => r.id === id && r.text === text), id).toBe(true);
    // Every catalog step on both paths has a summary, and the view carries it.
    for (const p of JOURNEY_PATHS) {
      const pathId = p.pathId as JourneyPathId;
      for (const def of listStepDefsForPath(pathId)) expect(stepSummaryFor(pathId, def.id), `${pathId}/${def.id}`).toBeTruthy();
      for (const phase of view(pathId).phases) {
        for (const st of phase.steps) expect(st.summary, `${pathId}/${st.id}`).toBe(stepSummaryFor(pathId, st.id));
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
