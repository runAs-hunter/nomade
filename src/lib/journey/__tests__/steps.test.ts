import { describe, it, expect } from "vitest";
import { patchStepStatus } from "@/lib/journey/steps";
import { buildChecklistView } from "@/lib/journey/checklist";
import { listStepDefsForPath } from "@/lib/journey/catalog";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CASE_ID = "cccccccc-dddd-eeee-ffff-000000000001";
const NOW = "2026-10-01T16:00:00.000Z";

type FakeRow = Record<string, unknown>;

function makeService(state: { cases: FakeRow[]; steps: FakeRow[] }) {
  return {
    schema: (name: string) => {
      expect(name).toBe("internal");
      return {
        from: (table: string) => {
          const filters: { col: string; val: unknown }[] = [];
          let pendingUpdate: FakeRow | null = null;
          let pendingInsert: FakeRow | null = null;
          const api: Record<string, unknown> = {};
          const self = api;
          const rows = () =>
            table === "journey_cases" ? state.cases : state.steps;
          const matches = (r: FakeRow) =>
            filters.every((f) => r[f.col] === f.val);

          api.select = () => self;
          api.eq = (col: string, val: unknown) => {
            filters.push({ col, val });
            return self;
          };
          api.update = (patch: FakeRow) => {
            pendingUpdate = patch;
            return self;
          };
          api.insert = (row: FakeRow) => {
            pendingInsert = row;
            return self;
          };
          api.maybeSingle = async () => {
            if (pendingUpdate) {
              const match = rows().find((r) => matches(r));
              if (match) Object.assign(match, pendingUpdate);
              const data = match ? { ...match } : null;
              pendingUpdate = null;
              return { data, error: null };
            }
            if (pendingInsert) {
              const row = { id: `new-${rows().length}`, ...pendingInsert };
              rows().push(row);
              pendingInsert = null;
              return { data: row, error: null };
            }
            return {
              data: rows().find((r) => matches(r)) ?? null,
              error: null,
            };
          };
          api.then = (
            resolve: (v: { data: FakeRow[]; error: null }) => unknown,
          ) => {
            if (pendingUpdate) {
              for (const r of rows()) {
                if (matches(r)) Object.assign(r, pendingUpdate);
              }
              pendingUpdate = null;
              return Promise.resolve(resolve({ data: [], error: null }));
            }
            return Promise.resolve(
              resolve({ data: rows().filter((r) => matches(r)), error: null }),
            );
          };
          return self;
        },
      };
    },
  };
}

function seededState() {
  const steps = listStepDefsForPath("italy_digital_nomad").map((s, i) => ({
    id: `s-${i}`,
    case_id: CASE_ID,
    step_id: s.id,
    status: "not_started",
    updated_at: NOW,
  }));
  return {
    cases: [
      {
        id: CASE_ID,
        user_id: USER_ID,
        path_id: "italy_digital_nomad",
        country_code: "IT",
        created_at: NOW,
        updated_at: NOW,
      },
    ] as FakeRow[],
    steps: steps as FakeRow[],
  };
}

describe("patchStepStatus", () => {
  it("updates status and returns progress", async () => {
    const state = seededState();
    const res = await patchStepStatus(makeService(state), {
      userId: USER_ID,
      stepId: "passport",
      status: "done",
      nowIso: NOW,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.stepId).toBe("passport");
    expect(res.status).toBe("done");
    expect(res.progress.done).toBe(1);
    expect(res.progress.total).toBe(13);
    expect(state.steps.find((s) => s.step_id === "passport")?.status).toBe(
      "done",
    );
  });

  it("rejects bad status and unknown step", async () => {
    const state = seededState();
    const bad = await patchStepStatus(makeService(state), {
      userId: USER_ID,
      stepId: "passport",
      status: "completed",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("BAD_STATUS");

    const unknown = await patchStepStatus(makeService(state), {
      userId: USER_ID,
      stepId: "dependent-permesso",
      status: "done",
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe("UNKNOWN_STEP");
  });

  it("returns NO_JOURNEY_CASE when missing", async () => {
    const res = await patchStepStatus(
      makeService({ cases: [], steps: [] }),
      { userId: USER_ID, stepId: "passport", status: "done" },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NO_JOURNEY_CASE");
  });
});

describe("buildChecklistView", () => {
  it("joins catalog with statuses and disclaimer", () => {
    const view = buildChecklistView({
      journeyCase: {
        caseId: CASE_ID,
        pathId: "italy_digital_nomad",
        countryCode: "IT",
        createdAt: NOW,
        updatedAt: NOW,
      },
      pathId: "italy_digital_nomad",
      states: [
        { step_id: "passport", status: "done", updated_at: NOW },
        { step_id: "visa-fee", status: "in_progress", updated_at: NOW },
      ],
    });
    expect(view.disclaimer).toMatch(/not legal advice/i);
    expect(view.progress.done).toBe(1);
    expect(view.progress.total).toBe(13);
    const passport = view.phases[0].steps.find((s) => s.id === "passport");
    expect(passport?.status).toBe("done");
    expect(view.phases.flatMap((p) => p.steps).some((s) => s.id === "dependent-permesso")).toBe(
      false,
    );
  });
});
