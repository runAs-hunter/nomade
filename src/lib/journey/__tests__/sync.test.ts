import { describe, it, expect } from "vitest";
import { parseSyncMutations, syncJourney } from "@/lib/journey/sync";
import { listStepDefsForPath } from "@/lib/journey/catalog";
import { patchStepStatus } from "@/lib/journey/steps";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CASE_ID = "cccccccc-dddd-eeee-ffff-000000000001";
const NOW = "2026-10-01T16:00:00.000Z";
const LATER = "2026-10-01T17:00:00.000Z";

type FakeRow = Record<string, unknown>;

function makeService(state: { cases: FakeRow[]; steps: FakeRow[] }) {
  return {
    schema: (name: string) => {
      expect(name).toBe("internal");
      return {
        from: (table: string) => {
          const filters: { col: string; val: unknown }[] = [];
          let pendingUpdate: FakeRow | null = null;
          let pendingInsert: FakeRow | FakeRow[] | null = null;
          let limitN: number | null = null;
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
          api.limit = (n: number) => {
            limitN = n;
            return self;
          };
          api.update = (patch: FakeRow) => {
            pendingUpdate = patch;
            return self;
          };
          api.insert = (row: FakeRow | FakeRow[]) => {
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
              const toInsert = Array.isArray(pendingInsert)
                ? pendingInsert
                : [pendingInsert];
              const created: FakeRow[] = [];
              for (const item of toInsert) {
                const row = {
                  id: item.id ?? `new-${rows().length}`,
                  ...item,
                };
                rows().push(row);
                created.push(row);
              }
              pendingInsert = null;
              return { data: created[0] ?? null, error: null };
            }
            let found = rows().filter((r) => matches(r));
            if (limitN != null) found = found.slice(0, limitN);
            return { data: found[0] ?? null, error: null };
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
            if (pendingInsert) {
              const toInsert = Array.isArray(pendingInsert)
                ? pendingInsert
                : [pendingInsert];
              for (const item of toInsert) {
                rows().push({ id: `new-${rows().length}`, ...item });
              }
              pendingInsert = null;
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

function seededState(overrides?: { status?: string; updated_at?: string }) {
  const steps = listStepDefsForPath("italy_digital_nomad").map((s, i) => ({
    id: `s-${i}`,
    case_id: CASE_ID,
    step_id: s.id,
    status: overrides?.status ?? "not_started",
    updated_at: overrides?.updated_at ?? NOW,
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

describe("parseSyncMutations", () => {
  it("accepts valid ops and rejects bad status / opId", () => {
    const { mutations, rejected } = parseSyncMutations([
      {
        opId: "11111111-1111-4111-8111-111111111111",
        stepId: "passport",
        status: "done",
      },
      {
        opId: "not-a-uuid",
        stepId: "passport",
        status: "done",
      },
      {
        opId: "22222222-2222-4222-8222-222222222222",
        stepId: "passport",
        status: "completed",
      },
    ]);
    expect(mutations).toHaveLength(1);
    expect(rejected.map((r) => r.code)).toEqual(["BAD_OP_ID", "BAD_STATUS"]);
  });
});

describe("syncJourney", () => {
  it("applies monotonic upgrade and rejects silent downgrade", async () => {
    const state = seededState();
    // Server already done on passport
    const passport = state.steps.find((s) => s.step_id === "passport")!;
    passport.status = "done";
    passport.updated_at = NOW;

    const res = await syncJourney(makeService(state), {
      userId: USER_ID,
      nowIso: LATER,
      mutations: [
        {
          opId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          stepId: "passport",
          status: "in_progress",
          clientUpdatedAt: LATER,
        },
        {
          opId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          stepId: "visa-fee",
          status: "done",
          clientUpdatedAt: LATER,
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appliedOpIds).toHaveLength(2);
    expect(state.steps.find((s) => s.step_id === "passport")?.status).toBe(
      "done",
    );
    expect(state.steps.find((s) => s.step_id === "visa-fee")?.status).toBe(
      "done",
    );
  });

  it("Case B MERGE_REQUIRED when hasLocalDraft and server case", async () => {
    const state = seededState();
    const res = await syncJourney(makeService(state), {
      userId: USER_ID,
      hasLocalDraft: true,
      mutations: [
        {
          opId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          stepId: "passport",
          status: "done",
        },
      ],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("MERGE_REQUIRED");
  });

  it("Case A auto-attach creates case from pathId", async () => {
    const state = { cases: [] as FakeRow[], steps: [] as FakeRow[] };
    const res = await syncJourney(makeService(state), {
      userId: USER_ID,
      pathId: "italy_digital_nomad",
      nowIso: NOW,
      mutations: [
        {
          opId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          stepId: "passport",
          status: "done",
          clientUpdatedAt: NOW,
        },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(state.cases).toHaveLength(1);
    expect(res.appliedOpIds).toContain(
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
    expect(state.steps.find((s) => s.step_id === "passport")?.status).toBe(
      "done",
    );
  });

  it("idempotent replay of same status is applied no-op", async () => {
    const state = seededState({ status: "done", updated_at: NOW });
    const op = {
      opId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      stepId: "passport" as const,
      status: "done" as const,
      clientUpdatedAt: NOW,
    };
    const first = await syncJourney(makeService(state), {
      userId: USER_ID,
      mutations: [op],
      nowIso: LATER,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.appliedOpIds).toEqual([op.opId]);

    const second = await syncJourney(makeService(state), {
      userId: USER_ID,
      mutations: [op],
      nowIso: LATER,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.appliedOpIds).toEqual([op.opId]);
  });
});

describe("patchStepStatus expectedUpdatedAt", () => {
  it("LWW when expected omitted", async () => {
    const state = seededState();
    const res = await patchStepStatus(makeService(state), {
      userId: USER_ID,
      stepId: "passport",
      status: "done",
      nowIso: LATER,
    });
    expect(res.ok).toBe(true);
  });

  it("CONFLICT when expected mismatches", async () => {
    const state = seededState();
    const res = await patchStepStatus(makeService(state), {
      userId: USER_ID,
      stepId: "passport",
      status: "done",
      expectedUpdatedAt: "2026-09-01T00:00:00.000Z",
      nowIso: LATER,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("CONFLICT");
      if (res.code === "CONFLICT") {
        expect(res.current.stepId).toBe("passport");
        expect(res.current.updatedAt).toBe(NOW);
      }
    }
  });

  it("updates when expected matches", async () => {
    const state = seededState();
    const res = await patchStepStatus(makeService(state), {
      userId: USER_ID,
      stepId: "passport",
      status: "done",
      expectedUpdatedAt: NOW,
      nowIso: LATER,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.updatedAt).toBe(LATER);
    expect(state.steps.find((s) => s.step_id === "passport")?.status).toBe(
      "done",
    );
  });
});
