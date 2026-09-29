import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { resetServerEnvCache } from "@/lib/env";
import { ERROR_CODES } from "@/lib/api-error";

const verifyAccessToken = vi.fn();

vi.mock("@/lib/auth/verify-access-token", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/auth/verify-access-token")
  >("@/lib/auth/verify-access-token");
  return {
    ...actual,
    verifyAccessToken: (...args: unknown[]) => verifyAccessToken(...args),
  };
});

import {
  assertSameUser,
  requireAccess,
} from "@/lib/auth/require-access";

describe("requireAccess", () => {
  const prev = { ...process.env };
  const requestId = "req-test-001";

  beforeEach(() => {
    resetServerEnvCache();
    verifyAccessToken.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
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
    const req = new Request("http://localhost/api/account/me");
    const result = await requireAccess(req, { requestId });
    expect(result).toBeInstanceOf(NextResponse);
    if (!(result instanceof NextResponse)) return;
    expect(result.status).toBe(401);
    const body = await result.json();
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(body.error.requestId).toBe(requestId);
    expect(result.headers.get("x-request-id")).toBe(requestId);
    expect(JSON.stringify(body)).not.toMatch(/eyJ/);
  });

  it("returns 401 UNAUTHENTICATED when token invalid", async () => {
    verifyAccessToken.mockResolvedValue({ ok: false, reason: "invalid" });
    const req = new Request("http://localhost/api/account/me", {
      headers: { authorization: "Bearer bad" },
    });
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    };
    const result = await requireAccess(req, {
      requestId,
      logger,
      failMessage: "test unauthenticated",
    });
    expect(result).toBeInstanceOf(NextResponse);
    if (!(result instanceof NextResponse)) return;
    expect(result.status).toBe(401);
    expect(logger.info).toHaveBeenCalledWith(
      "test unauthenticated",
      expect.objectContaining({
        code: ERROR_CODES.UNAUTHENTICATED,
        reason: "invalid",
      }),
    );
    // Never log Authorization / token bodies
    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).not.toMatch(/Bearer/);
    expect(logged).not.toMatch(/eyJ/);
  });

  it("returns VerifiedAccess on success", async () => {
    const user = { id: "u1", email: null } as unknown as User;
    verifyAccessToken.mockResolvedValue({
      ok: true,
      value: { user, userId: "u1", accessToken: "good" },
    });
    const req = new Request("http://localhost/api/account/me", {
      headers: { authorization: "Bearer good" },
    });
    const result = await requireAccess(req, { requestId });
    expect(result).not.toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) return;
    expect(result.userId).toBe("u1");
    expect(result.accessToken).toBe("good");
    expect(verifyAccessToken).toHaveBeenCalledWith("Bearer good");
  });
});

describe("assertSameUser", () => {
  it("returns null when ids match", () => {
    expect(assertSameUser("a", "a", "rid")).toBeNull();
  });

  it("returns 403 FORBIDDEN when ids differ", async () => {
    const res = assertSameUser("auth-user", "other-user", "rid-403");
    expect(res).toBeInstanceOf(NextResponse);
    if (!res) return;
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(body.error.requestId).toBe("rid-403");
  });
});
