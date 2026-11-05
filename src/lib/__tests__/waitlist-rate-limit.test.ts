import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const rpcMock = vi.fn();
const insertMock = vi.fn();
const fromMock = vi.fn(() => ({ insert: insertMock }));
const schemaMock = vi.fn(() => ({ from: fromMock, rpc: rpcMock }));
const createServiceClientMock = vi.fn(() => ({ schema: schemaMock }));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => createServiceClientMock(),
}));

import { resetServerEnvCache } from "@/lib/env";
import {
  WAITLIST_RATE_LIMIT,
  WAITLIST_RATE_WINDOW_SECONDS,
  checkWaitlistRateLimit,
} from "@/lib/waitlist/rate-limit";
import { POST } from "@/app/api/waitlist/route";
import { WAITLIST_COPY } from "@/lib/waitlist/copy";

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bgdrzdlenmwbpalnjiqg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

function rateReq(ip = "203.0.113.10"): Request {
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "x-forwarded-for": ip, "Content-Type": "application/json" },
    body: "{}",
  });
}

describe("waitlist rate-limit constants", () => {
  it("is ~5 per minute", () => {
    expect(WAITLIST_RATE_LIMIT).toBe(5);
    expect(WAITLIST_RATE_WINDOW_SECONDS).toBe(60);
  });
});

describe("checkWaitlistRateLimit", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    schemaMock.mockClear();
  });

  it("allows when under the limit", async () => {
    rpcMock.mockResolvedValue({ data: { allowed: true, count: 3 }, error: null });
    const d = await checkWaitlistRateLimit(rateReq(), { schema: schemaMock });
    expect(d).toEqual({ limited: false });
    expect(rpcMock).toHaveBeenCalledWith(
      "waitlist_rate_limit_hit",
      expect.objectContaining({ p_ip: "203.0.113.10", p_limit: 5 }),
    );
  });

  it("returns limited with Retry-After window when over limit", async () => {
    rpcMock.mockResolvedValue({ data: { allowed: false, count: 6 }, error: null });
    const d = await checkWaitlistRateLimit(rateReq(), { schema: schemaMock });
    expect(d).toEqual({ limited: true, retryAfterSeconds: WAITLIST_RATE_WINDOW_SECONDS });
  });

  it("fails open when the RPC/table is missing", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    });
    const d = await checkWaitlistRateLimit(rateReq(), { schema: schemaMock });
    expect(d).toEqual({ limited: false });
  });

  it("fails open when the client throws", async () => {
    rpcMock.mockRejectedValue(new Error("network"));
    const d = await checkWaitlistRateLimit(rateReq(), { schema: schemaMock });
    expect(d).toEqual({ limited: false });
  });

  it("fails open when no client IP is present", async () => {
    const bare = new Request("http://localhost/api/waitlist", { method: "POST" });
    const d = await checkWaitlistRateLimit(bare, { schema: schemaMock });
    expect(d).toEqual({ limited: false });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/waitlist rate limit integration", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    insertMock.mockReset();
    rpcMock.mockReset();
    fromMock.mockClear();
    schemaMock.mockClear();
    createServiceClientMock.mockClear();
    insertMock.mockResolvedValue({ error: null });
    Object.assign(process.env, ENV);
  });

  afterEach(() => {
    resetServerEnvCache();
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    Object.assign(process.env, prev);
  });

  it("returns 429 + Retry-After and does not insert when limited", async () => {
    rpcMock.mockResolvedValue({ data: { allowed: false, count: 6 }, error: null });
    const res = await POST(
      new Request("http://localhost/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.7",
        },
        body: JSON.stringify({ email: "a@example.com" }),
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toBe(WAITLIST_COPY.failure);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("still accepts the signup when the limiter store is unavailable (fail-open)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42P01", message: "missing" },
    });
    const res = await POST(
      new Request("http://localhost/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.8",
        },
        body: JSON.stringify({ email: "a@example.com" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalled();
  });
});
