import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listStepDefsForPath } from "@/lib/journey/catalog";
import { parseSyncMutations, syncJourney } from "@/lib/journey/sync";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CASE_ID = "cccccccc-dddd-eeee-ffff-000000000001";
const OP1 = "11111111-1111-4111-8111-111111111111";
const OP2 = "22222222-2222-4222-8222-222222222222";
const OP3 = "33333333-3333-4333-8333-333333333333";
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

const intakeOp = (opId: string, answers: unknown, clientUpdatedAt: string) => ({ opId, kind: "intake", answers, clientUpdatedAt });

beforeEach(() => vi.stubEnv("INTAKE_ENABLED", "true"));
afterEach(() => vi.unstubAllEnvs());

describe("F11a sync intake ops", () => {
  it("parses intake ops; bad answers → BAD_INTAKE per op; missing clock → BAD_MUTATION", () => {
    const parsed = parseSyncMutations(
      [
        intakeOp(OP1, { family: "spouse" }, NOW),
        intakeOp(OP2, { family: "partner" }, NOW),
        { opId: OP3, kind: "intake", answers: {} },
      ],
      new Date(NOW),
    );
    expect(parsed.mutations).toHaveLength(1);
    expect(parsed.rejected).toEqual([
      { opId: OP2, code: "BAD_INTAKE" },
      { opId: OP3, code: "BAD_MUTATION" },
    ]);
  });

  it("applies newer, no-ops older (still applied), replay = no-op; checklist reflects answers", async () => {
    const tables = seeded();
    const db = makeDb(tables);
    const first = parseSyncMutations([intakeOp(OP1, { family: "spouse", incomeSource: "foreign_employee" }, "2026-10-16T11:00:00.000Z")], new Date(NOW));
    const r1 = await syncJourney(db, { userId: USER_ID, mutations: first.mutations, nowIso: NOW });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.appliedOpIds).toEqual([OP1]);
    const ids = r1.checklist.phases.flatMap((p) => p.steps.map((s) => s.id));
    expect(ids).toContain("family-documents");
    expect(ids).not.toContain("partita-iva");
    expect(r1.checklist.intake).toEqual({ completed: false, rulesVersion: "f11-rules-2026-10-16" });

    const older = parseSyncMutations([intakeOp(OP2, { family: "solo" }, "2026-10-16T10:00:00.000Z")], new Date(NOW));
    const r2 = await syncJourney(db, { userId: USER_ID, mutations: older.mutations, nowIso: NOW });
    expect(r2.ok && r2.appliedOpIds).toEqual([OP2]);
    expect((tables.journey_intake[0].answers as Record<string, unknown>).family).toBe("spouse");

    const r3 = await syncJourney(db, { userId: USER_ID, mutations: first.mutations, nowIso: NOW });
    expect(r3.ok && r3.appliedOpIds).toEqual([OP1]);
    expect(tables.journey_intake).toHaveLength(1);
  });

  it("step writes to a rule-hidden step are still accepted (state kept)", async () => {
    const tables = seeded();
    tables.journey_intake.push({
      case_id: CASE_ID,
      answers: { incomeSource: "foreign_employee" },
      rules_version: "f11-rules-2026-10-16",
      completed_at: null,
      client_updated_at: NOW,
      updated_at: NOW,
    });
    const muts = parseSyncMutations([{ opId: OP1, stepId: "partita-iva", status: "done", clientUpdatedAt: "2026-10-16T13:00:00.000Z" }]);
    const r = await syncJourney(makeDb(tables), { userId: USER_ID, mutations: muts.mutations, nowIso: "2026-10-16T13:00:00.000Z" });
    expect(r.ok && r.appliedOpIds).toEqual([OP1]);
    expect(tables.journey_step_states.find((s) => s.step_id === "partita-iva")?.status).toBe("done");
  });

  it("INTAKE_ENABLED off → INTAKE_DISABLED per op, nothing stored", async () => {
    vi.stubEnv("INTAKE_ENABLED", "false");
    const tables = seeded();
    const muts = parseSyncMutations([intakeOp(OP1, { family: "spouse" }, NOW)], new Date(NOW));
    const r = await syncJourney(makeDb(tables), { userId: USER_ID, mutations: muts.mutations, nowIso: NOW });
    expect(r.ok && r.rejected).toEqual([{ opId: OP1, code: "INTAKE_DISABLED" }]);
    expect(tables.journey_intake).toHaveLength(0);
    expect(r.ok && r.checklist.intake).toBeUndefined();
  });
});
