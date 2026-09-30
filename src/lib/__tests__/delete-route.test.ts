import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import { resetServerEnvCache } from "@/lib/env";
import { ERROR_CODES } from "@/lib/api-error";

const verifyAccessToken = vi.fn();
const softDeleteAccount = vi.fn();

vi.mock("@/lib/auth/verify-access-token", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/auth/verify-access-token")
  >("@/lib/auth/verify-access-token");
  return {
    ...actual,
    verifyAccessToken: (...args: unknown[]) => verifyAccessToken(...args),
  };
});

vi.mock("@/lib/account/delete", async () => {
  const actual = await vi.importActual<typeof import("@/lib/account/delete")>(
    "@/lib/account/delete",
  );
  return {
    ...actual,
    softDeleteAccount: (...args: unknown[]) => softDeleteAccount(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ schema: vi.fn() }),
  createAnonClient: () => ({}),
}));

import { POST } from "@/app/api/account/delete/route";

const VALID_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bgdrzdlenmwbpalnjiqg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function deleteRequest(opts: {
  auth?: string | null;
  body?: unknown;
} = {}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.auth !== null && opts.auth !== undefined) {
    headers.authorization = opts.auth;
  } else if (opts.auth === undefined) {
    headers.authorization = "Bearer test-jwt";
  }
  const init: RequestInit = { method: "POST", headers };
  if (opts.body !== undefined) {
    init.body =
      typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  } else {
    init.body = JSON.stringify({ confirm: "DELETE" });
  }
  return new Request("http://localhost/api/account/delete", init);
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

describe("POST /api/account/delete", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    verifyAccessToken.mockReset();
    softDeleteAccount.mockReset();
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
    const res = await POST(deleteRequest({ auth: null }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(softDeleteAccount).not.toHaveBeenCalled();
  });

  it("returns 400 BAD_REQUEST when confirm wrong", async () => {
    okAuth();
    const res = await POST(deleteRequest({ body: { confirm: "delete" } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.BAD_REQUEST);
    expect(softDeleteAccount).not.toHaveBeenCalled();
  });

  it("returns 400 when confirm missing", async () => {
    okAuth();
    const res = await POST(deleteRequest({ body: {} }));
    expect(res.status).toBe(400);
    expect(softDeleteAccount).not.toHaveBeenCalled();
  });

  it("returns 401 Bootstrap required when no user row", async () => {
    okAuth();
    softDeleteAccount.mockResolvedValue({
      ok: false,
      code: "NO_USER",
      message: "Bootstrap required",
    });
    const res = await POST(deleteRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.message).toBe("Bootstrap required");
  });

  it("returns 200 soft-delete for active user", async () => {
    okAuth();
    softDeleteAccount.mockResolvedValue({
      ok: true,
      alreadyPending: false,
      value: {
        userId: USER_ID,
        deletionStatus: "pending_deletion",
        deletedAt: "2026-09-29T17:30:00.000Z",
        appleRevoked: false,
      },
    });
    const res = await POST(deleteRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      userId: USER_ID,
      deletionStatus: "pending_deletion",
      deletedAt: "2026-09-29T17:30:00.000Z",
      appleRevoked: false,
    });
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(softDeleteAccount).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      { appleAuthorizationCode: undefined },
    );
  });

  it("returns 200 idempotent when already pending", async () => {
    okAuth();
    softDeleteAccount.mockResolvedValue({
      ok: true,
      alreadyPending: true,
      value: {
        userId: USER_ID,
        deletionStatus: "pending_deletion",
        deletedAt: "2026-09-28T12:00:00.000Z",
        appleRevoked: false,
      },
    });
    const res = await POST(deleteRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletionStatus).toBe("pending_deletion");
    expect(body.deletedAt).toBe("2026-09-28T12:00:00.000Z");
  });

  it("returns 410 ACCOUNT_DELETED when already deleted", async () => {
    okAuth();
    softDeleteAccount.mockResolvedValue({
      ok: false,
      code: "ACCOUNT_DELETED",
      message: "Account deleted",
    });
    const res = await POST(deleteRequest());
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.ACCOUNT_DELETED);
  });

  it("forwards appleAuthorizationCode and returns appleRevoked", async () => {
    okAuth();
    softDeleteAccount.mockResolvedValue({
      ok: true,
      alreadyPending: false,
      value: {
        userId: USER_ID,
        deletionStatus: "pending_deletion",
        deletedAt: "2026-09-29T17:30:00.000Z",
        appleRevoked: true,
      },
    });
    const res = await POST(
      deleteRequest({
        body: { confirm: "DELETE", appleAuthorizationCode: " code-test " },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.appleRevoked).toBe(true);
    expect(softDeleteAccount).toHaveBeenCalledWith(expect.anything(), USER_ID, {
      appleAuthorizationCode: "code-test",
    });
  });

  it("returns 400 when appleAuthorizationCode is not a string", async () => {
    okAuth();
    const res = await POST(
      deleteRequest({ body: { confirm: "DELETE", appleAuthorizationCode: 12 } }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.BAD_REQUEST);
    expect(softDeleteAccount).not.toHaveBeenCalled();
  });

  it("returns 502 APPLE_REVOKE_FAILED and does not claim success", async () => {
    okAuth();
    softDeleteAccount.mockResolvedValue({
      ok: false,
      code: "APPLE_REVOKE_FAILED",
      message: "Apple token revoke failed",
    });
    const res = await POST(
      deleteRequest({
        body: { confirm: "DELETE", appleAuthorizationCode: "code-test" },
      }),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.APPLE_REVOKE_FAILED);
    expect(JSON.stringify(body)).not.toContain("code-test");
  });

  it("returns 503 APPLE_REVOKE_MISCONFIGURED", async () => {
    okAuth();
    softDeleteAccount.mockResolvedValue({
      ok: false,
      code: "APPLE_REVOKE_MISCONFIGURED",
      message: "Apple token revoke failed",
    });
    const res = await POST(
      deleteRequest({
        body: { confirm: "DELETE", appleAuthorizationCode: "code-test" },
      }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.APPLE_REVOKE_MISCONFIGURED);
  });

  it("idempotent pending response includes appleRevoked false", async () => {
    okAuth();
    softDeleteAccount.mockResolvedValue({
      ok: true,
      alreadyPending: true,
      value: {
        userId: USER_ID,
        deletionStatus: "pending_deletion",
        deletedAt: "2026-09-28T12:00:00.000Z",
        appleRevoked: false,
      },
    });
    const res = await POST(
      deleteRequest({
        body: { confirm: "DELETE", appleAuthorizationCode: "code-test" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.appleRevoked).toBe(false);
  });
});
