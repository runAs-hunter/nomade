import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetServerEnvCache } from "@/lib/env";
import { ERROR_CODES } from "@/lib/api-error";

const listActiveForCheck = vi.fn();
const applyCheckUpdate = vi.fn();
const runSourceCheck = vi.fn();

vi.mock("@/lib/sources/repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sources/repo")>("@/lib/sources/repo");
  return {
    ...actual,
    listActiveForCheck: (...a: unknown[]) => listActiveForCheck(...a),
    applyCheckUpdate: (...a: unknown[]) => applyCheckUpdate(...a),
  };
});

vi.mock("@/lib/sources/check", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sources/check")>("@/lib/sources/check");
  return { ...actual, runSourceCheck: (...a: unknown[]) => runSourceCheck(...a) };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ schema: vi.fn() }),
  createAnonClient: () => ({}),
}));

import { GET, POST } from "@/app/api/cron/check-sources/route";

const VALID_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bgdrzdlenmwbpalnjiqg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};
const CRON_SECRET = "test-cron-secret-value-not-real";

const SUMMARY = {
  checkedAt: "2026-10-08T13:00:00.000Z",
  dryRun: true,
  hashed: false,
  checked: 1,
  healthy: 0,
  botBlocked: 0,
  staleFlagged: 1,
  needsReview: 0,
  errors: 0,
  hostChanged: 0,
  hashChanged: 0,
  writeFailures: 0,
  results: [{ id: "x-retired-test", httpStatus: 404, method: "GET", outcome: "dead", action: "mark_stale", hostChanged: false, hashChanged: false }],
};

const cronReq = (method: "GET" | "POST", query = "", auth: string | null = `Bearer ${CRON_SECRET}`) =>
  new Request(`http://localhost/api/cron/check-sources${query}`, {
    method,
    headers: auth ? { authorization: auth } : {},
  });

describe("/api/cron/check-sources (F8)", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    resetServerEnvCache();
    for (const m of [listActiveForCheck, applyCheckUpdate, runSourceCheck]) m.mockReset();
    Object.assign(process.env, VALID_ENV);
    process.env.CRON_SECRET = CRON_SECRET;
  });
  afterEach(() => {
    resetServerEnvCache();
    for (const k of Object.keys(process.env)) if (!(k in prev)) delete process.env[k];
    Object.assign(process.env, prev);
  });

  it("401 without Authorization", async () => {
    const res = await GET(cronReq("GET", "", null));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(listActiveForCheck).not.toHaveBeenCalled();
  });

  it("401 with wrong secret / service-role key", async () => {
    expect((await POST(cronReq("POST", "", "Bearer wrong"))).status).toBe(401);
    expect((await POST(cronReq("POST", "", `Bearer ${VALID_ENV.SUPABASE_SERVICE_ROLE_KEY}`))).status).toBe(401);
  });

  it("500 ENV_INVALID when CRON_SECRET unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(cronReq("GET"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe(ERROR_CODES.ENV_INVALID);
  });

  it("dry run → 200 summary; passes dryRun/hash flags", async () => {
    listActiveForCheck.mockResolvedValue({ ok: true, value: [{ id: "x-retired-test", official_url: "https://www.esteri.it/x", status: "active", content_hash: null }] });
    runSourceCheck.mockResolvedValue(SUMMARY);
    const res = await GET(cronReq("GET", "?dryRun=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dryRun: true, staleFlagged: 1, requestId: expect.any(String) });
    expect(body.results[0]).toMatchObject({ id: "x-retired-test", action: "mark_stale" });
    expect(runSourceCheck.mock.calls[0]![1]).toEqual({ dryRun: true, hash: false });
  });

  it("POST ?hash=true → hash flag on, dryRun off", async () => {
    listActiveForCheck.mockResolvedValue({ ok: true, value: [] });
    runSourceCheck.mockResolvedValue({ ...SUMMARY, dryRun: false, hashed: true, checked: 0, results: [] });
    const res = await POST(cronReq("POST", "?hash=true"));
    expect(res.status).toBe(200);
    expect(runSourceCheck.mock.calls[0]![1]).toEqual({ dryRun: false, hash: true });
  });

  it("500 when listing fails", async () => {
    listActiveForCheck.mockResolvedValue({ ok: false, code: "DB_ERROR", message: "x" });
    const res = await GET(cronReq("GET"));
    expect(res.status).toBe(500);
    expect(runSourceCheck).not.toHaveBeenCalled();
  });
});
