import { describe, it, expect } from "vitest";
import { patchStepStatus } from "@/lib/journey/steps";
import { buildChecklistView } from "@/lib/journey/checklist";
import { listStepDefsForPath } from "@/lib/journey/catalog";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CASE_ID = "cccccccc-dddd-eeee-ffff-000000000001";
const NOW = "2026-10-02T16:00:00.000Z";

type FakeRow = Record<string, unknown>;

function makeService(state: {
  cases: FakeRow[];
  steps: FakeRow[];
  entitlements: FakeRow[];
}) {
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
          const rows = () => {
            if (table === "journey_cases") return state.cases;
            if (table === "journey_step_states") return state.steps;
            if (table === "entitlements") return state.entitlements;
            return [];
          };
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

function seeded(entitled: boolean) {
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
    entitlements: entitled
      ? ([
          {
            user_id: USER_ID,
            entitlement_id: "journey_full",
            status: "active",
            source_transaction_id: "txn-1",
            granted_at: NOW,
            updated_at: NOW,
          },
        ] as FakeRow[])
      : ([] as FakeRow[]),
  };
}

describe("F3.1 entitlement gate on PATCH", () => {
  it("allows free Gather Documents PATCH without entitlement", async () => {
    const state = seeded(false);
    const service = makeService(state);
    const result = await patchStepStatus(service, {
      userId: USER_ID,
      stepId: "passport",
      status: "done",
      nowIso: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("blocks paid Apply PATCH with ENTITLEMENT_REQUIRED", async () => {
    const state = seeded(false);
    const service = makeService(state);
    const result = await patchStepStatus(service, {
      userId: USER_ID,
      stepId: "consulate-appointment",
      status: "in_progress",
      nowIso: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ENTITLEMENT_REQUIRED");
  });

  it("allows paid After Arrival PATCH when journey_full active", async () => {
    const state = seeded(true);
    const service = makeService(state);
    const result = await patchStepStatus(service, {
      userId: USER_ID,
      stepId: "codice-fiscale",
      status: "done",
      nowIso: NOW,
    });
    expect(result.ok).toBe(true);
  });

  it("checklist marks free vs paid access + entitlement flag", () => {
    const view = buildChecklistView({
      journeyCase: {
        caseId: CASE_ID,
        pathId: "italy_digital_nomad",
        countryCode: "IT",
        createdAt: NOW,
        updatedAt: NOW,
      },
      pathId: "italy_digital_nomad",
      states: [],
      journeyFull: false,
    });
    expect(view.entitlement.journeyFull).toBe(false);
    const gather = view.phases.find((p) => p.name === "Gather Documents");
    const apply = view.phases.find((p) => p.name === "Apply");
    expect(gather?.access).toBe("free");
    expect(apply?.access).toBe("paid");
    expect(gather?.steps.every((s) => s.access === "free")).toBe(true);
    expect(apply?.steps.every((s) => s.access === "paid")).toBe(true);
  });
});
