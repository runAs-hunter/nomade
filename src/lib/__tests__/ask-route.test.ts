import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { listStepDefsForPath } from "@/lib/journey/catalog";
import type { AskModel, AskModelRequest } from "@/lib/ask/model";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CASE_ID = "cccccccc-dddd-eeee-ffff-000000000001";
const NOW = "2026-10-16T12:00:00.000Z";
const DISCLAIMER = "Preliminary guidance — not legal advice";
const REFUSAL =
  "I can't answer that from Nomade's official sources. Check your consulate's page or ask a qualified immigration lawyer.";
/** A sentinel that must never appear in any log line. */
const SECRET_QUESTION = "Zebracorn-7781 health insurance question from jane@example.com";

const verifyAccessToken = vi.fn();
const promptHooks = vi.hoisted(() => ({ throwOnBuild: false }));
vi.mock("@/lib/ask/prompt", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ask/prompt")>("@/lib/ask/prompt");
  return {
    ...actual,
    buildSystemPrompt: (...a: Parameters<typeof actual.buildSystemPrompt>) => {
      if (promptHooks.throwOnBuild) throw new Error("prompt build failed");
      return actual.buildSystemPrompt(...a);
    },
  };
});
const gatewayStreamText = vi.fn();
let db: ReturnType<typeof makeDb>;

vi.mock("@/lib/auth/verify-access-token", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/verify-access-token")>("@/lib/auth/verify-access-token");
  return { ...actual, verifyAccessToken: (...a: unknown[]) => verifyAccessToken(...a) };
});
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));
// The real gateway must never be reached from tests.
vi.mock("ai", () => ({
  streamText: (...a: unknown[]) => gatewayStreamText(...a),
  gateway: (id: string) => ({ id }),
}));

import { handleAsk, handleAskUsage, parseAskBody } from "@/lib/ask/handler";
import { POST as routePOST } from "@/app/api/ask/route";
import { GET as usageGET } from "@/app/api/ask/usage/route";

type Row = Record<string, unknown>;
type RpcCall = { fn: string; args: Record<string, unknown> };

function makeDb(tables: Record<string, Row[]>, rpc: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const rpcCalls: RpcCall[] = [];
  const client = {
    rpcCalls,
    schema: () => ({
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return rpc(fn, args);
      },
      from: (table: string) => {
        const rows = (tables[table] ??= []);
        const filters: ((r: Row) => boolean)[] = [];
        let op: { kind: "update" | "insert" | "upsert" | "delete"; payload?: Row | Row[] } | null = null;
        const run = () => {
          const match = (r: Row) => filters.every((f) => f(r));
          if (op?.kind === "insert" || op?.kind === "upsert") {
            const items = Array.isArray(op.payload) ? op.payload : [op.payload!];
            items.forEach((i) => rows.push({ ...i }));
            return items;
          }
          if (op?.kind === "update") {
            const hit = rows.filter(match);
            hit.forEach((r) => Object.assign(r, op!.payload));
            return hit;
          }
          return rows.filter(match);
        };
        const api: Record<string, unknown> = {};
        const chain = () => api;
        Object.assign(api, {
          select: chain,
          order: chain,
          limit: chain,
          contains: chain,
          eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
          in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), api),
          update: (p: Row) => ((op = { kind: "update", payload: p }), api),
          insert: (p: Row | Row[]) => ((op = { kind: "insert", payload: p }), api),
          upsert: (p: Row) => ((op = { kind: "upsert", payload: p }), api),
          delete: () => ((op = { kind: "delete" }), api),
          maybeSingle: async () => ({ data: run()[0] ? { ...run()[0] } : null, error: null }),
          single: async () => ({ data: run()[0] ?? null, error: null }),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: run(), error: null })),
        });
        return api;
      },
    }),
  };
  return client;
}

function source(id: string, over: Row = {}): Row {
  return {
    id,
    path_ids: ["italy_digital_nomad", "italy_remote_worker"],
    country: "IT",
    title: `Title ${id}`,
    publisher: "Ministero",
    official_url: `https://www.esteri.it/${id}`,
    doc_type: "law",
    scope: "national",
    retrieved_at: "2026-10-08",
    last_checked_at: null,
    last_http_status: 200,
    status: "active",
    notes: null,
    summary: null,
    summary_uncertain: false,
    step_ids: [],
    updated_at: NOW,
    ...over,
  };
}

function seeded(): Record<string, Row[]> {
  return {
    users: [{ id: USER_ID, deletion_status: "active" }],
    journey_cases: [
      { id: CASE_ID, user_id: USER_ID, path_id: "italy_digital_nomad", country_code: "IT", created_at: NOW, updated_at: NOW },
    ],
    journey_step_states: listStepDefsForPath("italy_digital_nomad").map((s) => ({
      case_id: CASE_ID,
      step_id: s.id,
      status: "not_started",
      updated_at: NOW,
    })),
    journey_intake: [],
    entitlements: [],
    sources: [
      source("it-gu-dm-2024-02-29-art3", {
        summary: "Health insurance covering all risks in Italy for the whole stay is required.",
        step_ids: ["health-insurance"],
      }),
      source("us-new-york-dnv", {
        scope: "US-consulate:new-york",
        doc_type: "consular_guidance",
        official_url: "https://consnewyork.esteri.it/visti",
        summary: "New York asks for a registered lease and an insurance letter of at least 30,000 euros.",
        step_ids: ["accommodation", "health-insurance"],
      }),
      source("it-retired", { status: "retired", summary: "health insurance retired row" }),
      ...Array.from({ length: 12 }, (_, i) => source(`filler-${i}`, { summary: "Unrelated portal page." })),
    ],
    ask_events: [],
  };
}

let tables: Record<string, Row[]>;
let consumeResult: number;
let modelCalls: AskModelRequest[];

function fakeModel(deltas: string[], opts: { throwAfter?: number; onCall?: () => void } = {}): AskModel {
  return (req) => {
    modelCalls.push(req);
    opts.onCall?.();
    async function* gen() {
      let i = 0;
      for (const d of deltas) {
        if (opts.throwAfter !== undefined && i === opts.throwAfter) throw new Error("upstream boom " + SECRET_QUESTION);
        i += 1;
        yield d;
      }
      if (opts.throwAfter !== undefined && opts.throwAfter >= deltas.length) throw new Error("upstream boom");
    }
    return { textStream: gen(), usage: async () => ({ inputTokens: 1200, outputTokens: 80 }) };
  };
}

const deps = (model: AskModel) => ({ service: () => db, model, now: () => new Date(NOW) });

const req = (body: unknown, auth = "Bearer good", path = "/api/ask", signal?: AbortSignal) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

const ask = (content = SECRET_QUESTION, extra: Row = {}) => ({ messages: [{ role: "user", content }], ...extra });

type SseEvent = { delta?: { text: string }; final?: Record<string, unknown>; done?: true };
async function readSse(res: Response): Promise<SseEvent[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((c) => c.startsWith("data: "))
    .map((c) => c.slice(6))
    .map((d) => (d === "[DONE]" ? { done: true as const } : (JSON.parse(d) as SseEvent)));
}
const streamedText = (evs: SseEvent[]) => evs.map((e) => e.delta?.text ?? "").join("");
const finalOf = (evs: SseEvent[]) => evs.find((e) => e.final)!.final as Record<string, unknown>;

let logSpies: ReturnType<typeof vi.spyOn>[];
function allLogged(): string {
  return logSpies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(" "))).join("\n");
}

beforeEach(() => {
  vi.stubEnv("ASK_ENABLED", "true");
  vi.stubEnv("BILLING_GATE_ENABLED", "false");
  tables = seeded();
  consumeResult = 9;
  modelCalls = [];
  db = makeDb(tables, (fn) => {
    if (fn === "ask_consume") return { data: consumeResult, error: null };
    if (fn === "ask_refund") return { data: null, error: null };
    return { data: null, error: { message: "unknown fn" } };
  });
  verifyAccessToken.mockReset();
  verifyAccessToken.mockResolvedValue({
    ok: true,
    value: { user: { id: USER_ID } as unknown as User, userId: USER_ID, accessToken: "t" },
  });
  gatewayStreamText.mockReset();
  promptHooks.throwOnBuild = false;
  logSpies = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error"), vi.spyOn(console, "info")];
  logSpies.forEach((s) => s.mockImplementation(() => {}));
});
afterEach(() => {
  vi.unstubAllEnvs();
  logSpies.forEach((s) => s.mockRestore());
});

describe("POST /api/ask (F11b)", () => {
  it("no token → 401; flag checked after auth; model never called", async () => {
    verifyAccessToken.mockResolvedValue({ ok: false, reason: "missing" });
    const res = await handleAsk(req(ask(), ""), deps(fakeModel(["x"])));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    expect(modelCalls).toHaveLength(0);
  });

  it("ASK_ENABLED unset → 503 ASK_DISABLED, nothing consumed (real route, gateway never called)", async () => {
    vi.stubEnv("ASK_ENABLED", "");
    const res = await routePOST(req(ask()));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("ASK_DISABLED");
    expect(db.rpcCalls).toHaveLength(0);
    expect(gatewayStreamText).not.toHaveBeenCalled();
  });

  it("validates the body: empty, too long, last turn not user, unknown post/step", async () => {
    const m = fakeModel(["x"]);
    for (const body of [
      {},
      { messages: [] },
      ask("x".repeat(1001)),
      { messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }] },
      ask("health insurance?", { consulatePostId: "rome" }),
      ask("health insurance?", { focusStepId: "not-a-step" }),
    ]) {
      const res = await handleAsk(req(body), deps(m));
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("BAD_REQUEST");
    }
    expect(modelCalls).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("parseAskBody keeps the last 6 turns, starts on a user turn, strips stale [S#] from assistant turns", () => {
    const msgs = [
      { role: "assistant", content: "welcome" },
      ...Array.from({ length: 4 }, (_, i) => [
        { role: "user", content: `q${i}` },
        { role: "assistant", content: `a${i} [S1]` },
      ]).flat(),
      { role: "user", content: "last" },
    ];
    const r = parseAskBody({ messages: msgs });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.messages[0]!.role).toBe("user");
    expect(r.body.messages.length).toBeLessThanOrEqual(6);
    expect(r.body.messages.at(-1)).toEqual({ role: "user", content: "last" });
    expect(r.body.messages.some((m) => m.content.includes("[S1]"))).toBe(false);
  });

  it("no matching source → canned refusal streamed, model NOT called, event refused_no_source", async () => {
    const res = await handleAsk(req(ask("Which neighborhood in Milan is best?")), deps(fakeModel(["x"])));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const evs = await readSse(res);
    expect(streamedText(evs)).toBe(REFUSAL);
    const final = finalOf(evs);
    expect(final).toMatchObject({ outcome: "refused_no_source", citations: [], disclaimer: DISCLAIMER, refusal: REFUSAL, remaining: 10, limit: 10 });
    // No-source refusal does not use up a question.
    expect(db.rpcCalls.map((c) => c.fn)).not.toContain("ask_consume");
    expect(evs.at(-1)).toEqual({ done: true });
    expect(modelCalls).toHaveLength(0);
    expect(tables.ask_events).toHaveLength(1);
    expect(tables.ask_events[0]).toMatchObject({ outcome: "refused_no_source", source_ids: [] });
  });

  it("cited answer → streamed text, valid citations only, [S9] stripped, byte-exact disclaimer", async () => {
    const res = await handleAsk(
      req(ask(SECRET_QUESTION, { consulatePostId: "new-york", focusStepId: "health-insurance" })),
      deps(fakeModel(["You need coverage for the whole stay [S", "1]. New York asks for a letter [S2][S9]."])),
    );
    const evs = await readSse(res);
    const text = streamedText(evs);
    expect(text).toBe("You need coverage for the whole stay [S1]. New York asks for a letter [S2].");
    const final = finalOf(evs);
    expect(final.outcome).toBe("answered");
    expect(final.disclaimer).toBe(DISCLAIMER);
    expect(Buffer.from(final.disclaimer as string).equals(Buffer.from(DISCLAIMER))).toBe(true);
    expect(final.refusal).toBeUndefined();
    const citations = final.citations as Record<string, unknown>[];
    expect(citations.map((c) => c.n)).toEqual([1, 2]);
    expect(citations.map((c) => c.sourceId).sort()).toEqual(["it-gu-dm-2024-02-29-art3", "us-new-york-dnv"]);
    const ny = citations.find((c) => c.sourceId === "us-new-york-dnv")!;
    expect(ny).toMatchObject({ url: "https://consnewyork.esteri.it/visti", host: "consnewyork.esteri.it", retrievedAt: "2026-10-08", publisher: "Ministero" });
    expect(final).toMatchObject({ remaining: 9, limit: 10, resetAt: "2026-10-17T00:00:00.000Z" });

    // Model got numbered sources (active only), user context, gateway options.
    const call = modelCalls[0]!;
    expect(call.model).toBe("anthropic/claude-sonnet-4.5");
    expect(call.fallbackModels).toEqual(["anthropic/claude-haiku-4.5"]);
    expect(call.system).toContain('<source n="S1"');
    expect(call.system).not.toContain("it-retired");
    expect(call.system).toContain(REFUSAL);
    expect(call.system).toContain("consulate_post: new-york");
    expect(call.system).toContain("health-insurance (gather, not_started)");
    expect(call.userTag).not.toContain(USER_ID);
    expect(call.messages).toEqual([{ role: "user", content: `<question>\n${SECRET_QUESTION}\n</question>` }]);
    // Approved step text is context labelled as Nomade guidance, never a numbered source.
    expect(call.system).toContain("<nomade_guidance>");
    expect(call.system).toMatch(/<guidance step="health-insurance">You need medical and hospital coverage/);
    expect(call.system).toContain("It is NOT a source: never cite it");
    expect(call.system.match(/<source n="S\d+"/g)).toHaveLength(2);

    // Metadata-only event.
    expect(tables.ask_events[0]).toMatchObject({
      user_id: USER_ID,
      outcome: "answered",
      focus_step_id: "health-insurance",
      model: "anthropic/claude-sonnet-4.5",
      input_tokens: 1200,
      output_tokens: 80,
    });
    expect(JSON.stringify(tables.ask_events)).not.toContain("Zebracorn");
  });

  it("uncited model output → refused_uncited (client shows the refusal)", async () => {
    const evs = await readSse(await handleAsk(req(ask("health insurance?")), deps(fakeModel(["You need insurance. [S7]"]))));
    const final = finalOf(evs);
    expect(final).toMatchObject({ outcome: "refused_uncited", citations: [], refusal: REFUSAL, disclaimer: DISCLAIMER });
    expect(streamedText(evs)).toBe("You need insurance. ");
    expect(tables.ask_events[0]).toMatchObject({ outcome: "refused_uncited" });
  });

  it("upstream error before any text → outcome error, question refunded, error text never logged", async () => {
    const evs = await readSse(await handleAsk(req(ask()), deps(fakeModel(["partial [S1]"], { throwAfter: 0 }))));
    const final = finalOf(evs);
    expect(final).toMatchObject({ outcome: "error", citations: [], refusal: REFUSAL, remaining: 10 });
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(["ask_consume", "ask_refund"]);
    expect(tables.ask_events[0]).toMatchObject({ outcome: "error" });
    expect(allLogged()).not.toContain("upstream boom");
  });

  it("upstream error after text was sent → error, NOT refunded", async () => {
    const evs = await readSse(await handleAsk(req(ask()), deps(fakeModel(["partial [S1]", "more"], { throwAfter: 1 }))));
    expect(streamedText(evs)).toBe("partial [S1]");
    expect(finalOf(evs)).toMatchObject({ outcome: "error", remaining: 9 });
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(["ask_consume"]);
  });

  it("client abort → NOT refunded", async () => {
    const ac = new AbortController();
    const res = await handleAsk(
      req(ask(), "Bearer good", "/api/ask", ac.signal),
      deps(fakeModel(["x [S1]"], { throwAfter: 0, onCall: () => ac.abort() })),
    );
    await res.text().catch(() => "");
    await new Promise((r) => setTimeout(r, 0));
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(["ask_consume"]);
  });

  it("throw after consume but before the stream starts → 500 and the question is refunded", async () => {
    promptHooks.throwOnBuild = true;
    const res = await handleAsk(req(ask("health insurance?")), deps(fakeModel(["x [S1]"])));
    expect(res.status).toBe(500);
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(["ask_consume", "ask_refund"]);
    expect(db.rpcCalls[1]!.args).toMatchObject({ p_user: USER_ID, p_day: "2026-10-16" });
    expect(modelCalls).toHaveLength(0);
  });

  it("accepts at most 12 messages", async () => {
    const turns = (n: number) => ({
      messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `health insurance ${i}` })),
    });
    expect((await handleAsk(req(turns(13)), deps(fakeModel(["ok [S1]"])))).status).toBe(400);
    const ok = await handleAsk(req(turns(11)), deps(fakeModel(["ok [S1]"])));
    expect(ok.status).toBe(200);
    await ok.text();
  });

  it("relevance floor: a weak best match → refusal without a model call or consume", async () => {
    // "portal" appears in every filler row → low IDF, below the floor.
    const res = await handleAsk(req(ask("Tell me about the portal page")), deps(fakeModel(["x [S1]"])));
    const evs = await readSse(res);
    expect(finalOf(evs)).toMatchObject({ outcome: "refused_no_source", refusal: REFUSAL });
    expect(streamedText(evs)).toBe(REFUSAL);
    expect(modelCalls).toHaveLength(0);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("invented number → refused_unsupported (number not in a cited source's summary/title)", async () => {
    const evs = await readSse(
      await handleAsk(req(ask("health insurance?", { consulatePostId: "new-york" })), deps(fakeModel(["Coverage of at least €50,000 [S1]."]))),
    );
    expect(finalOf(evs)).toMatchObject({ outcome: "refused_unsupported", citations: [], refusal: REFUSAL, disclaimer: DISCLAIMER });
    expect(tables.ask_events[0]).toMatchObject({ outcome: "refused_unsupported" });
  });

  it("number present in a cited source passes; a number only in an UNcited source does not", async () => {
    const run = async (text: string) =>
      finalOf(await readSse(await handleAsk(req(ask("health insurance letter?", { consulatePostId: "new-york" })), deps(fakeModel([text])))));
    // us-new-york-dnv summary says "30,000 euros".
    const sys = () => modelCalls.at(-1)!.system;
    const okFinal = await run("New York asks for a letter of at least €30.000 [S1][S2].");
    const nyN = sys().indexOf('id="us-new-york-dnv"') > sys().indexOf('n="S2"') ? 2 : 1;
    expect(okFinal.outcome).toBe("answered");
    const otherN = nyN === 1 ? 2 : 1;
    const bad = await run(`New York asks for 30,000 euros [S${otherN}].`);
    expect(bad.outcome).toBe("refused_unsupported");
  });

  it("over the limit → 429 ASK_RATE_LIMITED { limit, resetAt }, model not called", async () => {
    consumeResult = -1;
    const res = await handleAsk(req(ask()), deps(fakeModel(["x [S1]"])));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("ASK_RATE_LIMITED");
    expect(body).toMatchObject({ limit: 10, remaining: 0, resetAt: "2026-10-17T00:00:00.000Z", tier: "ungated" });
    expect(Number(res.headers.get("retry-after"))).toBe(12 * 3600);
    expect(modelCalls).toHaveLength(0);
    expect(tables.ask_events[0]).toMatchObject({ outcome: "rate_limited" });
  });

  it("limits: gate off → 10 for all; gate on → ASK_FREE_DAILY / ASK_PAID_DAILY (defaults 3 / 30)", async () => {
    const limits: unknown[] = [];
    const run = async () => {
      db.rpcCalls.length = 0;
      await (await handleAsk(req(ask("health insurance?")), deps(fakeModel(["ok [S1]"])))).text();
      limits.push(db.rpcCalls.find((c) => c.fn === "ask_consume")!.args.p_limit);
    };
    await run();
    vi.stubEnv("BILLING_GATE_ENABLED", "true");
    await run();
    tables.entitlements.push({ user_id: USER_ID, entitlement_id: "journey_full", status: "active" });
    await run();
    vi.stubEnv("ASK_PAID_DAILY", "50");
    await run();
    expect(limits).toEqual([10, 3, 30, 50]);
    expect(db.rpcCalls[0]!.args).toMatchObject({ p_user: USER_ID, p_day: "2026-10-16" });
  });

  it("ASK_MODEL overrides the primary; ASK_FALLBACK_MODEL=none disables fallback", async () => {
    vi.stubEnv("ASK_MODEL", "anthropic/claude-haiku-4.5");
    await (await handleAsk(req(ask("health insurance?")), deps(fakeModel(["ok [S1]"])))).text();
    expect(modelCalls[0]!.model).toBe("anthropic/claude-haiku-4.5");
    expect(modelCalls[0]!.fallbackModels).toEqual([]);
    vi.stubEnv("ASK_MODEL", "");
    vi.stubEnv("ASK_FALLBACK_MODEL", "none");
    await (await handleAsk(req(ask("health insurance?")), deps(fakeModel(["ok [S1]"])))).text();
    expect(modelCalls[1]!.fallbackModels).toEqual([]);
  });

  it("no journey case → 404 NO_JOURNEY_CASE, nothing consumed", async () => {
    tables.journey_cases.length = 0;
    const res = await handleAsk(req(ask()), deps(fakeModel(["x"])));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NO_JOURNEY_CASE");
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("pending_deletion account → 403", async () => {
    tables.users[0]!.deletion_status = "pending_deletion";
    const res = await handleAsk(req(ask()), deps(fakeModel(["x"])));
    expect(res.status).toBe(403);
  });

  it("logger spy: question/answer text never appears in any log call", async () => {
    await (await handleAsk(req(ask()), deps(fakeModel(["Answer Quokka-5521 [S1]"])))).text();
    await (await handleAsk(req(ask("Zebracorn-7781 Milan neighborhood")), deps(fakeModel([])))).text();
    consumeResult = -1;
    await (await handleAsk(req(ask()), deps(fakeModel([])))).text();
    const logged = allLogged();
    expect(logged.length).toBeGreaterThan(0);
    expect(logged).not.toContain("Zebracorn");
    expect(logged).not.toContain("Quokka");
    expect(logged).not.toContain("jane@example.com");
    expect(logged).not.toContain(USER_ID);
    expect(logged).toContain("userHash");
  });

  it("the real route wires the gateway with ZDR + fallback (gateway mocked)", async () => {
    gatewayStreamText.mockImplementation(() => ({
      fullStream: (async function* () {
        yield { type: "text-delta", id: "1", text: "Covered [S1]." };
      })(),
      totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 3 }),
    }));
    const evs = await readSse(await routePOST(req(ask("health insurance?"))));
    expect(finalOf(evs).outcome).toBe("answered");
    const opts = gatewayStreamText.mock.calls[0]![0] as Record<string, unknown>;
    expect(opts).toMatchObject({
      model: { id: "anthropic/claude-sonnet-4.5" },
      temperature: 0.2,
      maxOutputTokens: 600,
      providerOptions: { gateway: { models: ["anthropic/claude-haiku-4.5"], zeroDataRetention: true, disallowPromptTraining: true } },
    });
    expect(typeof opts.onError).toBe("function");
  });

  it("gateway error part → outcome error (not an empty 'answer')", async () => {
    gatewayStreamText.mockImplementation(() => ({
      fullStream: (async function* () {
        yield { type: "error", error: new Error("401 bad key") };
      })(),
      totalUsage: Promise.resolve({ inputTokens: undefined, outputTokens: undefined }),
    }));
    const evs = await readSse(await routePOST(req(ask("health insurance?"))));
    expect(finalOf(evs).outcome).toBe("error");
  });
});

describe("GET /api/ask/usage (F11b)", () => {
  const get = (auth = "Bearer good") =>
    new Request("http://localhost/api/ask/usage", { headers: auth ? { authorization: auth } : {} });

  it("no token → 401", async () => {
    verifyAccessToken.mockResolvedValue({ ok: false, reason: "missing" });
    expect((await usageGET(get(""))).status).toBe(401);
  });

  it("returns enabled, limit, used, remaining, resetAt (works with the flag off)", async () => {
    vi.stubEnv("ASK_ENABLED", "false");
    tables.ask_usage = [{ user_id: USER_ID, day: "2026-10-16", count: 4 }];
    const res = await handleAskUsage(get(), { service: () => db, now: () => new Date(NOW) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      enabled: false,
      limit: 10,
      used: 4,
      remaining: 6,
      resetAt: "2026-10-17T00:00:00.000Z",
      tier: "ungated",
      disclaimer: DISCLAIMER,
    });
  });
});
