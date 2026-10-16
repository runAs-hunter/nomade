import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { resetServerEnvCache } from "@/lib/env";
import { ERROR_CODES } from "@/lib/api-error";

const verifyAccessToken = vi.fn();
const classifyMessage = vi.fn();

vi.mock("@/lib/auth/verify-access-token", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/verify-access-token")>(
    "@/lib/auth/verify-access-token",
  );
  return { ...actual, verifyAccessToken: (...a: unknown[]) => verifyAccessToken(...a) };
});
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
vi.mock("@/lib/route-classify", () => ({
  classifyMessage: (...a: unknown[]) => classifyMessage(...a),
}));

import { POST } from "@/app/api/route/route";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bgdrzdlenmwbpalnjiqg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

const routeRequest = (auth?: string) =>
  new Request("http://localhost/api/route", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify({ message: "Do I need a visa for Italy?", existingThreads: [] }),
  }) as unknown as import("next/server").NextRequest;

beforeEach(() => {
  resetServerEnvCache();
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  verifyAccessToken.mockReset();
  classifyMessage.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/route (F11 step 0: sign-in required)", () => {
  it("no token → 401 UNAUTHENTICATED envelope, classifier never called", async () => {
    verifyAccessToken.mockResolvedValue({ ok: false, reason: "missing" });
    const res = await POST(routeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(typeof body.error.requestId).toBe("string");
    expect(classifyMessage).not.toHaveBeenCalled();
  });

  it("invalid token → 401 UNAUTHENTICATED, classifier never called", async () => {
    verifyAccessToken.mockResolvedValue({ ok: false, reason: "invalid" });
    const res = await POST(routeRequest("Bearer bad"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(classifyMessage).not.toHaveBeenCalled();
  });

  it("valid token → 200 with the classifier result", async () => {
    verifyAccessToken.mockResolvedValue({
      ok: true,
      value: { user: { id: USER_ID } as unknown as User, userId: USER_ID, accessToken: "t" },
    });
    const result = { topic: "visa", threadId: null, title: "Italy visa", rationale: "visa q" };
    classifyMessage.mockResolvedValue(result);
    const res = await POST(routeRequest("Bearer good"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(classifyMessage).toHaveBeenCalledTimes(1);
  });
});
