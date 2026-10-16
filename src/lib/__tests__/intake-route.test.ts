import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { listStepDefsForPath } from "@/lib/journey/catalog";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CASE_ID = "cccccccc-dddd-eeee-ffff-000000000001";
const NOW = "2026-10-16T12:00:00.000Z";

const verifyAccessToken = vi.fn();
let db: ReturnType<typeof makeDb>;

vi.mock("@/lib/auth/verify-access-token", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/verify-access-token")>("@/lib/auth/verify-access-token");
  return { ...actual, verifyAccessToken: (...a: unknown[]) => verifyAccessToken(...a) };
});
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));

import { GET, PUT } from "@/app/api/journey/intake/route";

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


const req = (method: string, body?: unknown, auth = "Bearer good") =>
  new Request("http://localhost/api/journey/intake", {
    method,
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

let tables: ReturnType<typeof seeded>;
beforeEach(() => {
  vi.stubEnv("INTAKE_ENABLED", "true");
  tables = seeded();
  db = makeDb(tables);
  verifyAccessToken.mockReset();
  verifyAccessToken.mockResolvedValue({
    ok: true,
    value: { user: { id: USER_ID } as unknown as User, userId: USER_ID, accessToken: "t" },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/journey/intake (F11a)", () => {
  it("flag off: auth checked first (no token → 401), then 404 INTAKE_DISABLED", async () => {
    vi.stubEnv("INTAKE_ENABLED", "false");
    verifyAccessToken.mockResolvedValueOnce({ ok: false, reason: "missing" });
    const anon = await GET(req("GET", undefined, ""));
    expect(anon.status).toBe(401);
    const res = await GET(req("GET"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("INTAKE_DISABLED");
    expect(tables.journey_intake).toHaveLength(0);
  });

  it("no token → 401 UNAUTHENTICATED envelope", async () => {
    verifyAccessToken.mockResolvedValue({ ok: false, reason: "missing" });
    const res = await PUT(req("PUT", { answers: {}, clientUpdatedAt: NOW }, ""));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("GET returns server questions (5) and empty answers", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions.map((q: { key: string }) => q.key)).toEqual(["incomeSource", "incomeThreshold", "housing", "family", "arrivalMonth"]);
    expect(body.answers).toEqual({});
    expect(body.completedAt).toBeNull();
  });

  it("PUT bad value → 400 BAD_INTAKE", async () => {
    const res = await PUT(req("PUT", { answers: { family: "partner" }, clientUpdatedAt: NOW }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("BAD_INTAKE");
  });

  it("PUT saves and returns the recomputed checklist; completedAt once all 5 answered", async () => {
    const answers = { incomeSource: "freelancer", incomeThreshold: "yes", housing: "lease", family: "spouse_children", arrivalMonth: null };
    const res = await PUT(req("PUT", { answers, clientUpdatedAt: new Date().toISOString() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe(true);
    expect(body.intake.answers).toEqual(answers);
    expect(body.intake.completedAt).not.toBeNull();
    expect(body.checklist.intake.completed).toBe(true);
    const ids = body.checklist.phases.flatMap((p: { steps: { id: string }[] }) => p.steps.map((s) => s.id));
    expect(ids).toContain("family-documents");
    expect(body.checklist.disclaimer).toBe("Preliminary guidance — not legal advice");
    expect(tables.journey_intake).toHaveLength(1);
  });

  it("PUT with no case → 404 NO_JOURNEY_CASE", async () => {
    tables.journey_cases.splice(0);
    const res = await PUT(req("PUT", { answers: {}, clientUpdatedAt: NOW }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NO_JOURNEY_CASE");
  });
});
