import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import { resetServerEnvCache } from "@/lib/env";
import { ERROR_CODES } from "@/lib/api-error";

const verifyAccessToken = vi.fn();
const loadAccountExport = vi.fn();

vi.mock("@/lib/auth/verify-access-token", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/auth/verify-access-token")
  >("@/lib/auth/verify-access-token");
  return {
    ...actual,
    verifyAccessToken: (...args: unknown[]) => verifyAccessToken(...args),
  };
});

vi.mock("@/lib/account/export", async () => {
  const actual = await vi.importActual<typeof import("@/lib/account/export")>(
    "@/lib/account/export",
  );
  return {
    ...actual,
    loadAccountExport: (...args: unknown[]) => loadAccountExport(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ schema: vi.fn() }),
  createAnonClient: () => ({}),
}));

import { POST } from "@/app/api/account/export/route";

const VALID_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bgdrzdlenmwbpalnjiqg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function exportRequest(auth?: string | null): Request {
  const headers: Record<string, string> = {};
  if (auth !== null && auth !== undefined) {
    headers.authorization = auth;
  } else if (auth === undefined) {
    headers.authorization = "Bearer test-jwt";
  }
  return new Request("http://localhost/api/account/export", {
    method: "POST",
    headers,
  });
}

function okAuth() {
  verifyAccessToken.mockResolvedValue({
    ok: true,
    value: {
      user: { id: USER_ID } as unknown as User,
      userId: USER_ID,
      accessToken: "t",
    },
  });
}

describe("POST /api/account/export", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    verifyAccessToken.mockReset();
    loadAccountExport.mockReset();
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
    const res = await POST(exportRequest(null));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(loadAccountExport).not.toHaveBeenCalled();
  });

  it("returns 401 Bootstrap required when no user row", async () => {
    okAuth();
    loadAccountExport.mockResolvedValue({
      ok: false,
      code: "NO_USER",
      message: "Bootstrap required",
    });
    const res = await POST(exportRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(body.error.message).toBe("Bootstrap required");
  });

  it("returns 200 export envelope for active user", async () => {
    okAuth();
    loadAccountExport.mockResolvedValue({
      ok: true,
      envelope: {
        exportedAt: "2026-09-29T17:00:00.000Z",
        userId: USER_ID,
        deletionStatus: "active",
        account: {
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-15T00:00:00.000Z",
          emailPresent: true,
          email: "relay@privaterelay.appleid.com",
        },
        identities: [
          {
            provider: "apple",
            providerSubject: "apple.sub.001",
            createdAt: "2026-09-01T00:00:00.000Z",
            closedAt: null,
          },
        ],
        journey: [],
        chat: [],
        billing: [],
        notes: [
          "journey/chat/billing arrays empty until those domains ship; format stable for clients",
        ],
      },
    });

    const res = await POST(exportRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe(USER_ID);
    expect(body.identities[0].providerSubject).toBe("apple.sub.001");
    expect(body.journey).toEqual([]);
    expect(body.chat).toEqual([]);
    expect(body.billing).toEqual([]);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(loadAccountExport).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
    );
  });

  it("returns 200 when pending_deletion", async () => {
    okAuth();
    loadAccountExport.mockResolvedValue({
      ok: true,
      envelope: {
        exportedAt: "2026-09-29T17:00:00.000Z",
        userId: USER_ID,
        deletionStatus: "pending_deletion",
        account: {
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-28T00:00:00.000Z",
          emailPresent: false,
        },
        identities: [],
        journey: [],
        chat: [],
        billing: [],
        notes: ["journey/chat/billing arrays empty until those domains ship; format stable for clients"],
      },
    });
    const res = await POST(exportRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletionStatus).toBe("pending_deletion");
  });

  it("returns 410 ACCOUNT_DELETED when deleted", async () => {
    okAuth();
    loadAccountExport.mockResolvedValue({
      ok: false,
      code: "ACCOUNT_DELETED",
      message: "Account deleted",
    });
    const res = await POST(exportRequest());
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.ACCOUNT_DELETED);
  });
});
