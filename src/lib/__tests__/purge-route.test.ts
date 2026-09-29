import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetServerEnvCache } from "@/lib/env";
import { ERROR_CODES } from "@/lib/api-error";

const runPurgeBatch = vi.fn();

vi.mock("@/lib/account/purge", async () => {
  const actual = await vi.importActual<typeof import("@/lib/account/purge")>(
    "@/lib/account/purge",
  );
  return {
    ...actual,
    runPurgeBatch: (...args: unknown[]) => runPurgeBatch(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    schema: vi.fn(),
    auth: { admin: { deleteUser: vi.fn() } },
  }),
  createAnonClient: () => ({}),
}));

import { GET, POST } from "@/app/api/cron/purge-accounts/route";

const VALID_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bgdrzdlenmwbpalnjiqg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

const CRON_SECRET = "test-cron-secret-value-not-real";

function cronRequest(
  method: "GET" | "POST",
  opts: { auth?: string | null } = {},
): Request {
  const headers: Record<string, string> = {};
  if (opts.auth !== null && opts.auth !== undefined) {
    headers.authorization = opts.auth;
  } else if (opts.auth === undefined) {
    headers.authorization = `Bearer ${CRON_SECRET}`;
  }
  return new Request("http://localhost/api/cron/purge-accounts", {
    method,
    headers,
  });
}

describe("/api/cron/purge-accounts", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    runPurgeBatch.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = VALID_ENV.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      VALID_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      VALID_ENV.SUPABASE_SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    resetServerEnvCache();
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    Object.assign(process.env, prev);
  });

  it("GET returns 401 without Authorization", async () => {
    const res = await GET(cronRequest("GET", { auth: null }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(runPurgeBatch).not.toHaveBeenCalled();
  });

  it("POST returns 401 with wrong Bearer", async () => {
    const res = await POST(
      cronRequest("POST", { auth: "Bearer wrong-secret" }),
    );
    expect(res.status).toBe(401);
    expect(runPurgeBatch).not.toHaveBeenCalled();
  });

  it("GET returns 200 counts shape with valid secret", async () => {
    runPurgeBatch.mockResolvedValue({
      ok: true,
      value: {
        scanned: 2,
        purged: 1,
        skippedAlreadyDeleted: 0,
        skippedLegalHold: 0,
        authAlreadyGone: 1,
        failed: 0,
        results: [
          { userId: "u1", outcome: "purged" },
          { userId: "u2", outcome: "authAlreadyGone" },
        ],
      },
    });
    const res = await GET(cronRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      requestId: expect.any(String),
      scanned: 2,
      purged: 1,
      skippedAlreadyDeleted: 0,
      skippedLegalHold: 0,
      authAlreadyGone: 1,
      failed: 0,
    });
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(runPurgeBatch).toHaveBeenCalledTimes(1);
  });

  it("POST returns 200 even when failed > 0", async () => {
    runPurgeBatch.mockResolvedValue({
      ok: true,
      value: {
        scanned: 1,
        purged: 0,
        skippedAlreadyDeleted: 0,
        skippedLegalHold: 0,
        authAlreadyGone: 0,
        failed: 1,
        results: [{ userId: "u1", outcome: "failed", failCode: "AUTH_DELETE" }],
      },
    });
    const res = await POST(cronRequest("POST"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failed).toBe(1);
    expect(body.ok).toBe(true);
  });

  it("returns 500 ENV_INVALID when CRON_SECRET unset", async () => {
    delete process.env.CRON_SECRET;
    resetServerEnvCache();
    const res = await GET(cronRequest("GET"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.ENV_INVALID);
    expect(runPurgeBatch).not.toHaveBeenCalled();
  });
});
