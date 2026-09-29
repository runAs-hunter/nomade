import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import { resetServerEnvCache } from "@/lib/env";
import { ERROR_CODES } from "@/lib/api-error";

const verifyAccessToken = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const schema = vi.fn(() => ({ from }));

vi.mock("@/lib/auth/verify-access-token", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/auth/verify-access-token")
  >("@/lib/auth/verify-access-token");
  return {
    ...actual,
    verifyAccessToken: (...args: unknown[]) => verifyAccessToken(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ schema }),
  createAnonClient: () => ({}),
}));

import { GET } from "@/app/api/account/me/route";

const VALID_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bgdrzdlenmwbpalnjiqg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function meRequest(auth?: string | null): Request {
  const headers: Record<string, string> = {};
  if (auth !== null && auth !== undefined) {
    headers.authorization = auth;
  } else if (auth === undefined) {
    headers.authorization = "Bearer test-jwt";
  }
  return new Request("http://localhost/api/account/me", {
    method: "GET",
    headers,
  });
}

describe("GET /api/account/me", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    verifyAccessToken.mockReset();
    maybeSingle.mockReset();
    eq.mockClear();
    select.mockClear();
    from.mockClear();
    schema.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = VALID_ENV.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      VALID_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      VALID_ENV.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    resetServerEnvCache();
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    Object.assign(process.env, prev);
  });

  it("returns 401 UNAUTHENTICATED when Bearer missing", async () => {
    verifyAccessToken.mockResolvedValue({ ok: false, reason: "missing" });
    const res = await GET(meRequest(null));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(schema).not.toHaveBeenCalled();
  });

  it("returns 401 UNAUTHENTICATED when JWT invalid", async () => {
    verifyAccessToken.mockResolvedValue({ ok: false, reason: "invalid" });
    const res = await GET(meRequest("Bearer bad"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
  });

  it("returns 401 Bootstrap required when Auth ok but no internal.users row", async () => {
    const user = { id: USER_ID, email: null } as unknown as User;
    verifyAccessToken.mockResolvedValue({
      ok: true,
      value: { user, userId: USER_ID, accessToken: "t" },
    });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const res = await GET(meRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(body.error.message).toBe("Bootstrap required");
    expect(schema).toHaveBeenCalledWith("internal");
  });

  it("returns 200 with userId, deletionStatus, emailPresent (no full email)", async () => {
    const user = {
      id: USER_ID,
      email: "relay@privaterelay.appleid.com",
    } as unknown as User;
    verifyAccessToken.mockResolvedValue({
      ok: true,
      value: { user, userId: USER_ID, accessToken: "t" },
    });
    maybeSingle.mockResolvedValue({
      data: {
        id: USER_ID,
        email: "relay@privaterelay.appleid.com",
        deletion_status: "active",
      },
      error: null,
    });

    const res = await GET(meRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      userId: USER_ID,
      deletionStatus: "active",
      emailPresent: true,
    });
    expect(body).not.toHaveProperty("email");
    expect(JSON.stringify(body)).not.toMatch(/relay@/);
    expect(JSON.stringify(body)).not.toMatch(/eyJ/);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("returns emailPresent false when email null", async () => {
    verifyAccessToken.mockResolvedValue({
      ok: true,
      value: {
        user: { id: USER_ID } as unknown as User,
        userId: USER_ID,
        accessToken: "t",
      },
    });
    maybeSingle.mockResolvedValue({
      data: {
        id: USER_ID,
        email: null,
        deletion_status: "pending_deletion",
      },
      error: null,
    });

    const res = await GET(meRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailPresent).toBe(false);
    expect(body.deletionStatus).toBe("pending_deletion");
  });
});
