import { describe, it, expect } from "vitest";
import {
  upsertJourneyCase,
  getJourneyCase,
  insertMissingCatalogSteps,
} from "@/lib/journey/case";
import { getChecklist } from "@/lib/journey/checklist";
import { listStepDefsForPath } from "@/lib/journey/catalog";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const NOW = "2026-10-01T15:00:00.000Z";

type FakeRow = Record<string, unknown>;

function makeJourneyService(state: {
  cases: FakeRow[];
  steps: FakeRow[];
}) {
  return {
    schema: (name: string) => {
      expect(name).toBe("internal");
      return {
        from: (table: string) => {
          const filters: { col: string; val: unknown }[] = [];
          let pendingInsert: FakeRow | FakeRow[] | null = null;
          let pendingUpdate: FakeRow | null = null;
          let pendingDelete = false;
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
          api.insert = (row: FakeRow | FakeRow[]) => {
            pendingInsert = row;
            return self;
          };
          api.update = (patch: FakeRow) => {
            pendingUpdate = patch;
            return self;
          };
          api.delete = () => {
            pendingDelete = true;
            return self;
          };
          api.maybeSingle = async () => {
            if (pendingInsert && !Array.isArray(pendingInsert)) {
              const row = {
                id: `case-${state.cases.length + 1}`,
                ...pendingInsert,
              };
              state.cases.push(row);
              pendingInsert = null;
              return { data: row, error: null };
            }
            if (pendingUpdate) {
              const match = rows().find((r) => matches(r));
              if (match) Object.assign(match, pendingUpdate);
              pendingUpdate = null;
              return { data: match ?? null, error: null };
            }
            const match = rows().find((r) => matches(r));
            return { data: match ?? null, error: null };
          };
          api.then = (
            resolve: (v: { data: unknown; error: null }) => unknown,
          ) => {
            if (pendingInsert && Array.isArray(pendingInsert)) {
              for (const row of pendingInsert) {
                state.steps.push({
                  id: `step-${state.steps.length + 1}`,
                  ...row,
                });
              }
              const inserted = pendingInsert;
              pendingInsert = null;
              return Promise.resolve(resolve({ data: inserted, error: null }));
            }
            if (pendingDelete) {
              const keep = state.steps.filter((r) => !matches(r));
              const removed = state.steps.filter((r) => matches(r));
              state.steps.length = 0;
              state.steps.push(...keep);
              pendingDelete = false;
              return Promise.resolve(resolve({ data: removed, error: null }));
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

describe("upsertJourneyCase", () => {
  it("creates case and seeds all steps not_started", async () => {
    const state = { cases: [] as FakeRow[], steps: [] as FakeRow[] };
    const service = makeJourneyService(state);
    const res = await upsertJourneyCase(service, {
      userId: USER_ID,
      pathId: "italy_digital_nomad",
      nowIso: NOW,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.created).toBe(true);
    expect(res.pathChanged).toBe(false);
    expect(res.case.pathId).toBe("italy_digital_nomad");
    expect(res.case.countryCode).toBe("IT");

    const expected = listStepDefsForPath("italy_digital_nomad");
    expect(state.steps).toHaveLength(expected.length);
    expect(state.steps.every((s) => s.status === "not_started")).toBe(true);
    expect(state.steps.map((s) => s.step_id).sort()).toEqual(
      expected.map((s) => s.id).sort(),
    );
  });

  it("returns existing case for same path without reseeding", async () => {
    const state = {
      cases: [
        {
          id: "case-1",
          user_id: USER_ID,
          path_id: "italy_digital_nomad",
          country_code: "IT",
          created_at: NOW,
          updated_at: NOW,
        },
      ] as FakeRow[],
      steps: [
        {
          id: "s1",
          case_id: "case-1",
          step_id: "passport",
          status: "done",
          updated_at: NOW,
        },
      ] as FakeRow[],
    };
    const res = await upsertJourneyCase(makeJourneyService(state), {
      userId: USER_ID,
      pathId: "italy_digital_nomad",
      nowIso: NOW,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.created).toBe(false);
    expect(res.pathChanged).toBe(false);
    expect(state.steps).toHaveLength(1);
    expect(state.steps[0].status).toBe("done");
  });

  it("path change resets all step statuses", async () => {
    const state = {
      cases: [
        {
          id: "case-1",
          user_id: USER_ID,
          path_id: "italy_digital_nomad",
          country_code: "IT",
          created_at: NOW,
          updated_at: NOW,
        },
      ] as FakeRow[],
      steps: [
        {
          id: "s1",
          case_id: "case-1",
          step_id: "passport",
          status: "done",
          updated_at: NOW,
        },
      ] as FakeRow[],
    };
    const res = await upsertJourneyCase(makeJourneyService(state), {
      userId: USER_ID,
      pathId: "italy_remote_worker",
      nowIso: NOW,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pathChanged).toBe(true);
    expect(res.case.pathId).toBe("italy_remote_worker");
    expect(state.steps.every((s) => s.status === "not_started")).toBe(true);
    expect(state.steps).toHaveLength(
      listStepDefsForPath("italy_remote_worker").length,
    );
  });

  it("rejects unknown path", async () => {
    const res = await upsertJourneyCase(
      makeJourneyService({ cases: [], steps: [] }),
      { userId: USER_ID, pathId: "france_whatever", nowIso: NOW },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("UNKNOWN_PATH");
  });

  it("enforces one case per user/country on get", async () => {
    const state = {
      cases: [
        {
          id: "case-1",
          user_id: USER_ID,
          path_id: "italy_digital_nomad",
          country_code: "IT",
          created_at: NOW,
          updated_at: NOW,
        },
      ] as FakeRow[],
      steps: [] as FakeRow[],
    };
    const got = await getJourneyCase(makeJourneyService(state), USER_ID);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.case?.caseId).toBe("case-1");
  });
});

describe("insertMissingCatalogSteps", () => {
  it("inserts missing catalog ids as not_started and keeps existing rows", async () => {
    const state = {
      cases: [
        {
          id: "case-1",
          user_id: USER_ID,
          path_id: "italy_digital_nomad",
          country_code: "IT",
          created_at: NOW,
          updated_at: NOW,
        },
      ] as FakeRow[],
      steps: [
        {
          id: "s1",
          case_id: "case-1",
          step_id: "passport",
          status: "done",
          updated_at: NOW,
        },
        {
          id: "orphan",
          case_id: "case-1",
          step_id: "legacy-orphan",
          status: "in_progress",
          updated_at: NOW,
        },
      ] as FakeRow[],
    };
    const res = await insertMissingCatalogSteps(
      makeJourneyService(state),
      "case-1",
      "italy_digital_nomad",
      state.steps.map((s) => String(s.step_id)),
      NOW,
    );
    expect(res.ok).toBe(true);
    const passport = state.steps.find((s) => s.step_id === "passport");
    expect(passport?.status).toBe("done");
    const orphan = state.steps.find((s) => s.step_id === "legacy-orphan");
    expect(orphan?.status).toBe("in_progress");
    const ids = state.steps.map((s) => s.step_id);
    expect(ids).toContain("partita-iva");
    expect(ids).toContain("highly-qualified");
    expect(ids).not.toContain("employment-contract");
    expect(
      state.steps
        .filter((s) => s.step_id !== "passport" && s.step_id !== "legacy-orphan")
        .every((s) => s.status === "not_started"),
    ).toBe(true);

    const checklist = await getChecklist(makeJourneyService(state), USER_ID);
    expect(checklist.ok).toBe(true);
    if (!checklist.ok) return;
    expect(checklist.checklist.phases.flatMap((ph) => ph.steps).some((s) => s.id === "partita-iva")).toBe(true);
    expect(state.steps.find((s) => s.step_id === "passport")?.status).toBe("done");
    expect(state.steps.find((s) => s.step_id === "legacy-orphan")).toBeTruthy();
  });
});
