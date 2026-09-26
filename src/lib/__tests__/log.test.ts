import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log, redact } from "@/lib/log";

describe("redact", () => {
  it("redacts denylisted field names (case-insensitive)", () => {
    const out = redact({
      Password: "hunter2",
      API_KEY: "sk-abc",
      authorization: "Bearer xyz",
      nested: { refresh_token: "rt", ok: true },
    }) as Record<string, unknown>;
    expect(out.Password).toBe("[REDACTED]");
    expect(out.API_KEY).toBe("[REDACTED]");
    expect(out.authorization).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).refresh_token).toBe(
      "[REDACTED]",
    );
    expect((out.nested as Record<string, unknown>).ok).toBe(true);
  });

  it("redacts JWT-looking strings in values", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIn0.sig";
    const out = redact({ note: `prefix ${jwt} suffix`, safe: "hello" }) as Record<
      string,
      unknown
    >;
    expect(out.note).toBe("prefix [REDACTED] suffix");
    expect(out.safe).toBe("hello");
    expect(JSON.stringify(out)).not.toMatch(/eyJ/);
  });

  it("redacts messages and content log fields", () => {
    const out = redact({
      messages: [{ role: "user", content: "secret chat" }],
      content: "profile blob",
      route: "health",
    }) as Record<string, unknown>;
    expect(out.messages).toBe("[REDACTED]");
    expect(out.content).toBe("[REDACTED]");
    expect(out.route).toBe("health");
  });

  it("redacts Error stack lines that look secret-bearing", () => {
    const err = new Error("boom");
    err.stack =
      "Error: boom\n    at normal (/app/x.ts:1:1)\n    at leak (token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb)\n";
    const out = redact(err) as Record<string, unknown>;
    expect(out.message).toBe("boom");
    expect(String(out.stack)).toContain("at normal");
    expect(String(out.stack)).toContain("[REDACTED]");
    expect(String(out.stack)).not.toMatch(/eyJ/);
  });
});

describe("log", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("emits one JSON object per line with level/msg/time/requestId", () => {
    const child = log.child({ requestId: "req-1" });
    child.info("hello", { token: "secret", path: "/api/health" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(spy.mock.calls[0]![0]));
    expect(line.level).toBe("info");
    expect(line.msg).toBe("hello");
    expect(line.requestId).toBe("req-1");
    expect(typeof line.time).toBe("string");
    expect(line.token).toBe("[REDACTED]");
    expect(line.path).toBe("/api/health");
  });
});
