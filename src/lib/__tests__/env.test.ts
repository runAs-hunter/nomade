import { describe, it, expect, afterEach } from "vitest";
import {
  formatEnvError,
  looksLikeServiceRoleJwt,
  parseServerEnv,
  projectRefFromUrl,
  resetServerEnvCache,
  serverEnvSchema,
} from "@/lib/env";

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bgdrzdlenmwbpalnjiqg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

afterEach(() => {
  resetServerEnvCache();
});

describe("serverEnvSchema / parseServerEnv", () => {
  it("parses a valid fixture", () => {
    const env = parseServerEnv(VALID);
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(VALID.NEXT_PUBLIC_SUPABASE_URL);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("allows optional ANTHROPIC_API_KEY", () => {
    const env = parseServerEnv({ ...VALID, ANTHROPIC_API_KEY: "sk-test" });
    expect(env.ANTHROPIC_API_KEY).toBe("sk-test");
  });

  it("allows optional SUPABASE_PROJECT_REF", () => {
    const env = parseServerEnv({
      ...VALID,
      SUPABASE_PROJECT_REF: "bgdrzdlenmwbpalnjiqg",
    });
    expect(env.SUPABASE_PROJECT_REF).toBe("bgdrzdlenmwbpalnjiqg");
  });

  it("fails when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    expect(() =>
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: VALID.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: VALID.SUPABASE_SERVICE_ROLE_KEY,
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("fails when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing", () => {
    expect(() =>
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: VALID.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: VALID.SUPABASE_SERVICE_ROLE_KEY,
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("fails when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    expect(() =>
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: VALID.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: VALID.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("error messages name vars but not secret values", () => {
    try {
      parseServerEnv({});
      expect.unreachable();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toMatch(/Invalid server environment/);
      expect(msg).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
      expect(msg).not.toMatch(/eyJ/);
      expect(msg).not.toContain(VALID.SUPABASE_SERVICE_ROLE_KEY);
    }
  });

  it("rejects service_role JWT under NEXT_PUBLIC_SUPABASE_ANON_KEY", () => {
    expect(() =>
      parseServerEnv({
        ...VALID,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: VALID.SUPABASE_SERVICE_ROLE_KEY,
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("rejects NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY if set", () => {
    expect(() =>
      parseServerEnv({
        ...VALID,
        NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: VALID.SUPABASE_SERVICE_ROLE_KEY,
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("rejects malformed URL", () => {
    expect(() =>
      parseServerEnv({
        ...VALID,
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("safeParse on schema matches parseServerEnv success", () => {
    const r = serverEnvSchema.safeParse(VALID);
    expect(r.success).toBe(true);
  });
});

describe("looksLikeServiceRoleJwt", () => {
  it("detects service_role role claim", () => {
    expect(looksLikeServiceRoleJwt(VALID.SUPABASE_SERVICE_ROLE_KEY)).toBe(true);
  });

  it("does not flag anon JWT", () => {
    expect(looksLikeServiceRoleJwt(VALID.NEXT_PUBLIC_SUPABASE_ANON_KEY)).toBe(
      false,
    );
  });
});

describe("projectRefFromUrl", () => {
  it("extracts hosted project ref", () => {
    expect(
      projectRefFromUrl("https://bgdrzdlenmwbpalnjiqg.supabase.co"),
    ).toBe("bgdrzdlenmwbpalnjiqg");
  });

  it("returns undefined for local API URL", () => {
    expect(projectRefFromUrl("http://127.0.0.1:54321")).toBeUndefined();
  });
});

describe("formatEnvError", () => {
  it("lists issue paths without values", () => {
    const bad = serverEnvSchema.safeParse({});
    expect(bad.success).toBe(false);
    if (bad.success) return;
    const msg = formatEnvError(bad.error);
    expect(msg).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(msg).not.toMatch(/eyJ/);
  });
});
