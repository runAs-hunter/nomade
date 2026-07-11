import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  RouteResponseSchema,
  coerceRouteResponse,
  fallbackRoute,
  titleFromMessage,
} from "@/data/route-schema";
import { classifyMessage } from "@/lib/route-classify";
import { POST } from "@/app/api/route/route";

// ─── Schema + coercion ───────────────────────────────────────────────────────

describe("RouteResponseSchema", () => {
  it("accepts a well-formed response", () => {
    const ok = RouteResponseSchema.safeParse({
      topic: "income_proof",
      threadId: "t1",
      title: "Proving €28k income",
      rationale: "about income",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a topic outside the taxonomy", () => {
    const bad = RouteResponseSchema.safeParse({
      topic: "taxes",
      threadId: null,
      title: "X",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects an empty title", () => {
    const bad = RouteResponseSchema.safeParse({
      topic: "general",
      threadId: null,
      title: "",
    });
    expect(bad.success).toBe(false);
  });
});

describe("titleFromMessage", () => {
  it("truncates long messages with an ellipsis", () => {
    const t = titleFromMessage("a".repeat(80));
    expect(t.length).toBeLessThanOrEqual(48);
    expect(t.endsWith("…")).toBe(true);
  });
  it("falls back to 'New chat' for blank input", () => {
    expect(titleFromMessage("   ")).toBe("New chat");
  });
});

describe("coerceRouteResponse", () => {
  it("keeps a threadId that was actually sent", () => {
    const r = coerceRouteResponse(
      { topic: "income_proof", threadId: "t1", title: "Income" },
      ["t1", "t2"],
      "hi"
    );
    expect(r.threadId).toBe("t1");
    expect(r.topic).toBe("income_proof");
  });

  it("nulls out a hallucinated threadId (defense in depth for 3A)", () => {
    const r = coerceRouteResponse(
      { topic: "permesso", threadId: "ghost", title: "Permesso" },
      ["t1"],
      "hi"
    );
    expect(r.threadId).toBeNull();
    expect(r.topic).toBe("permesso");
  });

  it("falls back to a general thread on malformed output", () => {
    const r = coerceRouteResponse({ nope: true }, [], "How much income?");
    expect(r).toEqual(fallbackRoute("How much income?"));
    expect(r.topic).toBe("general");
    expect(r.threadId).toBeNull();
  });
});

// ─── classifyMessage (mocked Anthropic client) ───────────────────────────────

function mockClient(input: unknown): Anthropic {
  return {
    messages: {
      create: async () => ({ content: [{ type: "tool_use", input }] }),
    },
  } as unknown as Anthropic;
}

describe("classifyMessage", () => {
  const threads = [
    { id: "t1", topic: "income_proof", title: "Income" },
    { id: "t2", topic: "permesso", title: "Permesso" },
  ];

  it("routes to a matched existing thread", async () => {
    const client = mockClient({
      topic: "income_proof",
      threadId: "t1",
      title: "Income",
      rationale: "about partner income",
    });
    const r = await classifyMessage(client, {
      message: "what about income for my partner?",
      existingThreads: threads,
    });
    expect(r.threadId).toBe("t1");
    expect(r.topic).toBe("income_proof");
  });

  it("opens a new thread when threadId is null", async () => {
    const client = mockClient({
      topic: "health_insurance",
      threadId: null,
      title: "Health insurance",
    });
    const r = await classifyMessage(client, {
      message: "do I need health insurance?",
      existingThreads: threads,
    });
    expect(r.threadId).toBeNull();
    expect(r.topic).toBe("health_insurance");
  });

  it("degrades to general on malformed model output", async () => {
    const client = mockClient({ topic: "not_real", threadId: "t1" });
    const r = await classifyMessage(client, {
      message: "hello",
      existingThreads: threads,
    });
    expect(r.topic).toBe("general");
    expect(r.threadId).toBeNull();
  });

  it("degrades to general when the model call throws", async () => {
    const client = {
      messages: {
        create: async () => {
          throw new Error("network");
        },
      },
    } as unknown as Anthropic;
    const r = await classifyMessage(client, {
      message: "hello there",
      existingThreads: [],
    });
    expect(r).toEqual(fallbackRoute("hello there"));
  });
});

// ─── Route handler ───────────────────────────────────────────────────────────

describe("POST /api/route", () => {
  it("returns 400 for an empty message", async () => {
    const req = { json: async () => ({ message: "   " }) } as never;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns a degraded fallback (200) when the body can't be parsed", async () => {
    const req = {
      json: async () => {
        throw new Error("bad json");
      },
    } as never;
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topic).toBe("general");
    expect(body.threadId).toBeNull();
  });
});
