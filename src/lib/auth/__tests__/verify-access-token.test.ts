import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import { resetServerEnvCache } from "@/lib/env";

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAnonClient: () => ({
    auth: { getUser },
  }),
  createServiceClient: () => ({}),
}));

import {
  extractBearerToken,
  resolveAppleProviderSubject,
  verifyAccessToken,
} from "@/lib/auth/verify-access-token";

describe("extractBearerToken", () => {
  it("parses Bearer token", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });
  it("returns null when missing or malformed", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("Basic x")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
  });
});

describe("resolveAppleProviderSubject", () => {
  it("uses identity.id when present", () => {
    const user = {
      identities: [
        {
          id: "id-from-row",
          provider: "apple",
          identity_data: { sub: "sub-x" },
        },
      ],
    } as unknown as User;
    expect(resolveAppleProviderSubject(user)).toBe("id-from-row");
  });

  it("falls back to identity_data.sub", () => {
    const user = {
      identities: [
        {
          id: "",
          provider: "apple",
          identity_data: { sub: "apple-sub-fallback" },
        },
      ],
    } as unknown as User;
    expect(resolveAppleProviderSubject(user)).toBe("apple-sub-fallback");
  });

  it("returns null when no apple identity", () => {
    const user = {
      identities: [{ id: "g", provider: "email", identity_data: {} }],
    } as unknown as User;
    expect(resolveAppleProviderSubject(user)).toBeNull();
  });
});

describe("verifyAccessToken", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    getUser.mockReset();
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

  it("returns missing when no Authorization", async () => {
    const r = await verifyAccessToken(null);
    expect(r).toEqual({ ok: false, reason: "missing" });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns invalid when getUser fails", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "bad" },
    });
    const r = await verifyAccessToken("Bearer bad-token");
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("returns user on success", async () => {
    const user = { id: "u1", email: null } as unknown as User;
    getUser.mockResolvedValue({ data: { user }, error: null });
    const r = await verifyAccessToken("Bearer good");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.userId).toBe("u1");
    expect(getUser).toHaveBeenCalledWith("good");
  });
});
