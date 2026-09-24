import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const selectLimit = vi.fn();
const fromMock = vi.fn(() => ({ select: () => ({ limit: selectLimit }) }));
const schemaMock = vi.fn(() => ({ from: fromMock }));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    schema: schemaMock,
  }),
}));

import { GET } from "@/app/api/health/route";
import { resetServerEnvCache } from "@/lib/env";

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bgdrzdlenmwbpalnjiqg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

describe("GET /api/health", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    selectLimit.mockReset();
    fromMock.mockClear();
    schemaMock.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = VALID.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = VALID.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = VALID.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_PROJECT_REF;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    resetServerEnvCache();
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    Object.assign(process.env, prev);
  });

  it("returns ok + up when ping succeeds (no Anthropic required)", async () => {
    selectLimit.mockResolvedValue({ data: [{ id: 1 }], error: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      supabase: "up",
      projectRef: "bgdrzdlenmwbpalnjiqg",
    });
    expect(JSON.stringify(body)).not.toMatch(/eyJ/);
    expect(JSON.stringify(body)).not.toMatch(/service_role/);
    expect(schemaMock).toHaveBeenCalledWith("api");
    expect(fromMock).toHaveBeenCalledWith("f1_3_smoke");
  });

  it("returns down + code when ping fails", async () => {
    selectLimit.mockResolvedValue({
      data: null,
      error: { message: "secret-should-not-leak eyJhbGciOi" },
    });
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.supabase).toBe("down");
    expect(body.code).toBe("SUPABASE_PING_FAILED");
    expect(JSON.stringify(body)).not.toMatch(/eyJ/);
    expect(JSON.stringify(body)).not.toContain("secret-should-not-leak");
  });

  it("returns ENV_INVALID when required env missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: false,
      supabase: "down",
      code: "ENV_INVALID",
    });
    expect(JSON.stringify(body)).not.toMatch(/eyJ/);
  });
});
