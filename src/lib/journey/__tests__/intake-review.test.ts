import { afterEach, describe, expect, it, vi } from "vitest";
import { loadJourneyForExport } from "@/lib/account/export";
import { wipeJourney } from "@/lib/account/purge";
import { listStepDefsForPath } from "@/lib/journey/catalog";
import { buildChecklistView } from "@/lib/journey/checklist";
import { indexChecklistSources, type ChecklistSourceRow } from "@/lib/journey/checklist-sources";
import { patchStepStatus } from "@/lib/journey/steps";
import { parseSyncMutations, syncJourney } from "@/lib/journey/sync";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER_ID = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
const CASE_ID = "cccccccc-dddd-eeee-ffff-000000000001";
const OTHER_CASE = "cccccccc-dddd-eeee-ffff-000000000002";
const OP1 = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-10-16T12:00:00.000Z";

type Row = Record<string, unknown>;

/** Generic PostgREST-ish fake keyed by table (unknown tables = empty). */
function makeDb(tables: Record<string, Row[]>) {
  return {
    schema: () => ({
      from: (table: string) => {
        const rows = (tables[table] ??= []);
        const filters: ((r: Row) => boolean)[] = [];
        let op: { kind: "update" | "insert" | "upsert" | "delete"; payload?: Row | Row[]; conflict?: string } | null = null;
        const run = () => {
          const match = (r: Row) => filters.every((f) => f(r));
          if (op?.kind === "update") {
            const hit = rows.filter(match);
            hit.forEach((r) => Object.assign(r, op!.payload));
            return hit;
          }
          if (op?.kind === "insert" || op?.kind === "upsert") {
            const items = Array.isArray(op.payload) ? op.payload : [op.payload!];
            const out: Row[] = [];
            for (const item of items) {
              const key = op.conflict;
              const existing = key ? rows.find((r) => r[key] === item[key]) : undefined;
              if (existing) {
                Object.assign(existing, item);
                out.push(existing);
              } else {
                const r = { id: `row-${rows.length}`, ...item };
                rows.push(r);
                out.push(r);
              }
            }
            return out;
          }
          if (op?.kind === "delete") {
            const keep = rows.filter((r) => !match(r));
            rows.splice(0, rows.length, ...keep);
            return [];
          }
          return rows.filter(match);
        };
        const api: Record<string, unknown> = {};
        const chain = () => api;
        Object.assign(api, {
          select: chain,
          order: chain,
          limit: chain,
          contains: chain,
          eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
          in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), api),
          update: (p: Row) => ((op = { kind: "update", payload: p }), api),
          insert: (p: Row | Row[]) => ((op = { kind: "insert", payload: p }), api),
          upsert: (p: Row, o?: { onConflict?: string }) => ((op = { kind: "upsert", payload: p, conflict: o?.onConflict }), api),
          delete: () => ((op = { kind: "delete" }), api),
          maybeSingle: async () => ({ data: run()[0] ? { ...run()[0] } : null, error: null }),
          single: async () => ({ data: run()[0] ?? null, error: null }),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: run(), error: null })),
        });
        return api;
      },
    }),
  };
}

function seeded() {
  return {
    users: [{ id: USER_ID, deletion_status: "active" }],
    journey_cases: [
      { id: CASE_ID, user_id: USER_ID, path_id: "italy_digital_nomad", country_code: "IT", created_at: NOW, updated_at: NOW },
    ],
    journey_step_states: listStepDefsForPath("italy_digital_nomad").map((s) => ({
      case_id: CASE_ID,
      step_id: s.id,
      status: "not_started",
      updated_at: NOW,
    })),
    journey_intake: [] as Row[],
  };
}


afterEach(() => vi.unstubAllEnvs());

describe("F11a review (nomade#32)", () => {
  it("flag off: conditional family steps are not writable (sync + PATCH)", async () => {
    const tables = seeded();
    const muts = parseSyncMutations([{ opId: OP1, stepId: "family-documents", status: "done" }]);
    const r = await syncJourney(makeDb(tables), { userId: USER_ID, mutations: muts.mutations, nowIso: NOW });
    expect(r.ok && r.rejected).toEqual([{ opId: OP1, code: "UNKNOWN_STEP" }]);
    const p = await patchStepStatus(makeDb(tables), { userId: USER_ID, stepId: "family-permesso", status: "done", nowIso: NOW });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.code).toBe("UNKNOWN_STEP");
  });

  it("flag off: conditional step rows stay out of the export; on: included", async () => {
    const tables = seeded(); // includes family-* rows (seeded while on)
    const off = await loadJourneyForExport(makeDb(tables), USER_ID);
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    const offIds = off.journey[0].steps.map((s) => s.stepId);
    expect(offIds).not.toContain("family-documents");
    expect(offIds).not.toContain("family-permesso");
    expect(offIds).toContain("passport");
    vi.stubEnv("INTAKE_ENABLED", "true");
    const on = await loadJourneyForExport(makeDb(tables), USER_ID);
    expect(on.ok && on.journey[0].steps.map((s) => s.stepId)).toContain("family-documents");
  });

  it("INCOME_BELOW_THRESHOLD also cites the consulate rows per post", () => {
    const row = (id: string, scope: string, steps: string[]): ChecklistSourceRow =>
      ({
        id, path_ids: ["italy_digital_nomad"], country: "IT", title: id, publisher: "p",
        official_url: "https://example.esteri.it/" + id, doc_type: "consular_guidance", scope,
        retrieved_at: "2026-10-16", status: "active", step_ids: steps, updated_at: "2026-10-16T00:00:00Z",
      }) as unknown as ChecklistSourceRow;
    const sources = indexChecklistSources(
      [
        row("it-gu-dm-2024-02-29-art3", "national", ["proof-of-income"]),
        row("us-new-york-dnv", "US-consulate:new-york", ["proof-of-income", "passport"]),
        row("us-boston-dnv", "US-consulate:boston", ["passport"]),
      ],
      "italy_digital_nomad",
    );
    const v = buildChecklistView({
      journeyCase: { caseId: CASE_ID, pathId: "italy_digital_nomad", countryCode: "IT", createdAt: NOW, updatedAt: NOW },
      pathId: "italy_digital_nomad",
      states: [],
      sources,
      intakeEnabled: true,
      intake: { answers: { incomeThreshold: "no" }, rulesVersion: "f11-rules-2026-10-16", completedAt: null, clientUpdatedAt: NOW, updatedAt: NOW },
    });
    const flag = v.flags?.find((f) => f.code === "INCOME_BELOW_THRESHOLD");
    expect(flag?.sourceIds).toEqual(["it-gu-dm-2024-02-29-art3"]);
    expect(flag?.consulateSourceIds).toEqual({ "new-york": ["us-new-york-dnv"] });
  });

  it("intake.sources carries every cited row (flags, consulate rows, notes) so no citation is dropped", () => {
    const row = (id: string, scope: string, steps: string[]): ChecklistSourceRow =>
      ({
        id, path_ids: ["italy_digital_nomad"], country: "IT", title: id, publisher: "p",
        official_url: "https://example.esteri.it/" + id, doc_type: "consular_guidance", scope,
        retrieved_at: "2026-10-16", status: "active", step_ids: steps, updated_at: "2026-10-16T00:00:00Z",
      }) as unknown as ChecklistSourceRow;
    const sources = indexChecklistSources(
      [
        // Cited by the flag but mapped to no step the client sees as a step row.
        row("it-gu-dm-2024-02-29-art3", "national", ["proof-of-income"]),
        row("us-new-york-dnv", "US-consulate:new-york", ["proof-of-income", "accommodation"]),
      ],
      "italy_digital_nomad",
    );
    const v = buildChecklistView({
      journeyCase: { caseId: CASE_ID, pathId: "italy_digital_nomad", countryCode: "IT", createdAt: NOW, updatedAt: NOW },
      pathId: "italy_digital_nomad",
      states: [],
      sources,
      intakeEnabled: true,
      intake: {
        answers: { incomeThreshold: "no", housing: "not_yet", family: "spouse", incomeSource: "freelancer", arrivalMonth: null },
        rulesVersion: "f11-rules-2026-10-16", completedAt: NOW, clientUpdatedAt: NOW, updatedAt: NOW,
      },
    });
    const have = new Set((v.intake?.sources ?? []).map((s) => s.id));
    expect(have.has("it-gu-dm-2024-02-29-art3")).toBe(true);
    expect(have.has("us-new-york-dnv")).toBe(true);
    const cited = [
      ...(v.flags ?? []).flatMap((f) => [...f.sourceIds, ...Object.values(f.consulateSourceIds ?? {}).flat()]),
      ...v.phases.flatMap((p) => p.steps.flatMap((s) => (s.notes ?? []).flatMap((n) => n.sourceIds))),
    ];
    for (const id of cited) expect(have.has(id), id).toBe(true);
  });

  it("flag off: no intake.sources key", () => {
    const v = buildChecklistView({
      journeyCase: { caseId: CASE_ID, pathId: "italy_digital_nomad", countryCode: "IT", createdAt: NOW, updatedAt: NOW },
      pathId: "italy_digital_nomad",
      states: [],
    });
    expect(v.intake).toBeUndefined();
  });

  it("purge: wipeJourney deletes the user's cases and the intake goes with them (cascade); others untouched", async () => {
    const tables = {
      journey_cases: [
        { id: CASE_ID, user_id: USER_ID },
        { id: OTHER_CASE, user_id: OTHER_ID },
      ] as Row[],
      journey_intake: [
        { case_id: CASE_ID, answers: { family: "spouse" } },
        { case_id: OTHER_CASE, answers: { family: "solo" } },
      ] as Row[],
    };
    // Fake honours the FK: deleting a case deletes its intake (on delete cascade).
    const db = {
      schema: () => ({
        from: (table: string) => {
          expect(table).toBe("journey_cases");
          let uid: unknown;
          const api = {
            delete: () => api,
            eq: (_c: string, v: unknown) => ((uid = v), api),
            select: async () => {
              const gone = tables.journey_cases.filter((c) => c.user_id === uid);
              tables.journey_cases = tables.journey_cases.filter((c) => c.user_id !== uid);
              const ids = new Set(gone.map((c) => c.id));
              tables.journey_intake = tables.journey_intake.filter((i) => !ids.has(i.case_id));
              return { data: gone.map((c) => ({ id: c.id })), error: null };
            },
          };
          return api;
        },
      }),
    };
    const res = await wipeJourney(db, USER_ID);
    expect(res.wiped).toBe(1);
    expect(tables.journey_intake).toEqual([{ case_id: OTHER_CASE, answers: { family: "solo" } }]);
  });
});

describe("F11a catalog income sentence (Cap blocker)", () => {
  it("nomad proof-of-income ends with the exact consulate-figure sentence and no euro figure", async () => {
    const { listStepDefsForPath } = await import("@/lib/journey/catalog");
    const step = listStepDefsForPath("italy_digital_nomad").find((s) => s.id === "proof-of-income");
    expect(step?.detail.endsWith(
      "Most US consulate pages print a figure dated 2024; Houston's 2026 checklist prints a newer one. Check your consulate's current figure.",
    )).toBe(true);
    expect(step?.detail).not.toMatch(/€\s?\d|\d[\d,.]*\s?(euros?|EUR)\b|EUR\s?\d/i);
  });
});
