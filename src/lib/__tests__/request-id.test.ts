import { describe, it, expect } from "vitest";
import {
  getRequestId,
  isSafeRequestId,
  setRequestIdHeader,
} from "@/lib/request-id";

describe("isSafeRequestId", () => {
  it("accepts UUID / ULID-like ids", () => {
    expect(isSafeRequestId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isSafeRequestId("client.trace_1")).toBe(true);
  });

  it("rejects empty, oversized, or garbage", () => {
    expect(isSafeRequestId("")).toBe(false);
    expect(isSafeRequestId("a".repeat(129))).toBe(false);
    expect(isSafeRequestId("bad id with spaces")).toBe(false);
    expect(isSafeRequestId("has/slash")).toBe(false);
    expect(isSafeRequestId("has\nnewline")).toBe(false);
  });
});

describe("getRequestId", () => {
  it("reuses a safe incoming x-request-id", () => {
    const id = "incoming-id-42";
    const req = new Request("http://localhost/", {
      headers: { "x-request-id": id },
    });
    expect(getRequestId(req)).toBe(id);
  });

  it("generates a UUID when header missing", () => {
    const req = new Request("http://localhost/");
    const id = getRequestId(req);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("generates a new id when incoming is oversized or garbage", () => {
    const oversized = new Request("http://localhost/", {
      headers: { "x-request-id": "x".repeat(200) },
    });
    const garbage = new Request("http://localhost/", {
      headers: { "x-request-id": "not safe!!" },
    });
    const a = getRequestId(oversized);
    const b = getRequestId(garbage);
    expect(a).not.toBe("x".repeat(200));
    expect(b).not.toBe("not safe!!");
    expect(a).toMatch(/^[0-9a-f-]{36}$/i);
    expect(b).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe("setRequestIdHeader", () => {
  it("sets x-request-id on Headers", () => {
    const h = new Headers();
    setRequestIdHeader(h, "abc-123");
    expect(h.get("x-request-id")).toBe("abc-123");
  });
});
