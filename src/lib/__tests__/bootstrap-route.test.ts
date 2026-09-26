import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import { resetServerEnvCache } from "@/lib/env";
import { ERROR_CODES } from "@/lib/api-error";

const verifyAccessToken = vi.fn();
const resolveAppleProviderSubject = vi.fn();
const upsertBootstrapIdentity = vi.fn();
const computeMergeCase = vi.fn();

vi.mock("@/lib/auth/verify-access-token", () => ({
  verifyAccessToken: (...args: unknown[]) => verifyAccessToken(...args),
  resolveAppleProviderSubject: (...args: unknown[]) =>
    resolveAppleProviderSubject(...args),
  subjectPrefix: (s: string) => s.slice(0, 4) + "…",
}));

vi.mock("@/lib/account/bootstrap", async () => {
  const actual = await vi.importActual<typeof import("@/lib/account/bootstrap")>(
    "@/lib/account/bootstrap",
  );
  return {
    ...actual,
    upsertBootstrapIdentity: (...args: unknown[]) =>
      upsertBootstrapIdentity(...args),
    computeMergeCase: (...args: unknown[]) => computeMergeCase(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ schema: vi.fn() }),
  createAnonClient: () => ({}),
}));

import { POST } from "@/app/api/account/bootstrap/route";

const VALID_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bgdrzdlenmwbpalnjiqg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function appleUser(overrides?: Partial<User>): User {
  return {
    id: USER_ID,
    email: "relay@privaterelay.appleid.com",
    identities: [
      {
        id: "apple-subject-001",
        provider: "apple",
        identity_data: { sub: "apple-subject-001" },
      },
    ],
    ...overrides,
  } as User;
}

function bootstrapRequest(
  opts: {
    auth?: string | null;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.auth !== null && opts.auth !== undefined) {
    headers.authorization = opts.auth;
  } else if (opts.auth === undefined) {
    headers.authorization = "Bearer test-jwt";
  }
  const init: RequestInit = { method: "POST", headers };
  if (opts.body !== undefined) {
    init.body =
      typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  return new Request("http://localhost/api/account/bootstrap", init);
}

describe("POST /api/account/bootstrap", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    verifyAccessToken.mockReset();
    resolveAppleProviderSubject.mockReset();
    upsertBootstrapIdentity.mockReset();
    computeMergeCase.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = VALID_ENV.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      VALID_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      VALID_ENV.SUPABASE_SERVICE_ROLE_KEY;
    computeMergeCase.mockImplementation(
      (input: {
        hasLocalDraft: boolean;
        hasServerJourney: boolean;
        identityAlreadyLinked: boolean;
      }) => {
        if (input.identityAlreadyLinked) return "D";
        if (input.hasLocalDraft && input.hasServerJourney) return "B";
        if (input.hasLocalDraft && !input.hasServerJourney) return "A";
        return "C";
      },
    );
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
    const res = await POST(bootstrapRequest({ auth: null }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(upsertBootstrapIdentity).not.toHaveBeenCalled();
  });

  it("returns 401 UNAUTHENTICATED when JWT invalid", async () => {
    verifyAccessToken.mockResolvedValue({ ok: false, reason: "invalid" });
    const res = await POST(bootstrapRequest({ auth: "Bearer bad" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
  });

  it("returns 400 BAD_REQUEST on malformed JSON", async () => {
    verifyAccessToken.mockResolvedValue({
      ok: true,
      value: { user: appleUser(), userId: USER_ID, accessToken: "t" },
    });
    const res = await POST(bootstrapRequest({ body: "{not-json" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.BAD_REQUEST);
  });

  it("idempotent: first created true case C; second created false case D", async () => {
    const user = appleUser();
    verifyAccessToken.mockResolvedValue({
      ok: true,
      value: { user, userId: USER_ID, accessToken: "t" },
    });
    resolveAppleProviderSubject.mockReturnValue("apple-subject-001");

    upsertBootstrapIdentity
      .mockResolvedValueOnce({
        ok: true,
        userId: USER_ID,
        created: true,
        identityAlreadyLinked: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        userId: USER_ID,
        created: false,
        identityAlreadyLinked: true,
      });

    const first = await POST(bootstrapRequest({ body: {} }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody).toEqual({
      userId: USER_ID,
      created: true,
      merge: { case: "C", hasLocalDraft: false, hasServerJourney: false },
    });
    expect(JSON.stringify(firstBody)).not.toMatch(/eyJ/);
    expect(first.headers.get("x-request-id")).toBeTruthy();

    const second = await POST(bootstrapRequest({ body: {} }));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody).toEqual({
      userId: USER_ID,
      created: false,
      merge: { case: "D", hasLocalDraft: false, hasServerJourney: false },
    });
  });

  it("returns case A when hasLocalDraft true on new user", async () => {
    verifyAccessToken.mockResolvedValue({
      ok: true,
      value: { user: appleUser(), userId: USER_ID, accessToken: "t" },
    });
    resolveAppleProviderSubject.mockReturnValue("apple-subject-001");
    upsertBootstrapIdentity.mockResolvedValue({
      ok: true,
      userId: USER_ID,
      created: true,
      identityAlreadyLinked: false,
    });

    const res = await POST(
      bootstrapRequest({ body: { hasLocalDraft: true } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.merge.case).toBe("A");
    expect(body.merge.hasLocalDraft).toBe(true);
    expect(body.merge.hasServerJourney).toBe(false);
  });

  it("returns 401 when session has no Apple identity", async () => {
    verifyAccessToken.mockResolvedValue({
      ok: true,
      value: {
        user: appleUser({ identities: [] }),
        userId: USER_ID,
        accessToken: "t",
      },
    });
    resolveAppleProviderSubject.mockReturnValue(null);

    const res = await POST(bootstrapRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
  });

  it("returns 403 ACCOUNT_PENDING_DELETION", async () => {
    verifyAccessToken.mockResolvedValue({
      ok: true,
      value: { user: appleUser(), userId: USER_ID, accessToken: "t" },
    });
    resolveAppleProviderSubject.mockReturnValue("apple-subject-001");
    upsertBootstrapIdentity.mockResolvedValue({
      ok: false,
      code: "ACCOUNT_PENDING_DELETION",
      message: "Account pending deletion",
    });

    const res = await POST(bootstrapRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe(ERROR_CODES.ACCOUNT_PENDING_DELETION);
  });
});
