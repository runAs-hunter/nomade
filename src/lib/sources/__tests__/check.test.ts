import { describe, it, expect, vi } from "vitest";
import {
  BOT_BLOCKED_HOSTS,
  CHECK_USER_AGENT,
  classifyProbe,
  probeUrl,
  runSourceCheck,
  type FetchLike,
} from "@/lib/sources/check";
import type { CheckUpdate, CheckableSourceRow } from "@/lib/sources/repo";

type Reply = { status: number; url?: string; body?: string } | { throw: unknown };

function fakeFetch(routes: Record<string, { HEAD?: Reply; GET?: Reply }>) {
  const calls: Array<{ url: string; method: string; ua: string | null }> = [];
  const impl: FetchLike = async (url, init) => {
    const method = String(init.method ?? "GET");
    const ua = new Headers(init.headers).get("user-agent");
    calls.push({ url, method, ua });
    const reply = routes[url]?.[method as "HEAD" | "GET"] ?? { status: 599 };
    if ("throw" in reply) throw reply.throw;
    const bytes = new TextEncoder().encode(reply.body ?? "");
    return {
      status: reply.status,
      url: reply.url ?? url,
      body: null,
      arrayBuffer: async () => bytes.buffer as ArrayBuffer,
    };
  };
  return { impl, calls };
}

const dnsError = Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
const timeoutError = Object.assign(new Error("timeout"), { name: "TimeoutError" });

const row = (id: string, url: string, content_hash: string | null = null): CheckableSourceRow => ({
  id,
  official_url: url,
  status: "active",
  content_hash,
});

describe("classifyProbe", () => {
  const u = "https://consboston.esteri.it/page/";
  it("2xx/3xx → ok", () => {
    expect(classifyProbe(u, { httpStatus: 200, finalUrl: u, method: "HEAD" })).toMatchObject({ outcome: "ok", markStale: false });
  });
  it("404/410 → dead + stale", () => {
    expect(classifyProbe(u, { httpStatus: 404, finalUrl: u, method: "GET" })).toMatchObject({ outcome: "dead", markStale: true });
    expect(classifyProbe(u, { httpStatus: 410, finalUrl: u, method: "GET" }).markStale).toBe(true);
  });
  it("DNS failure (host death) → unreachable + stale", () => {
    expect(
      classifyProbe(u, { httpStatus: 0, finalUrl: null, method: "HEAD", networkError: "dns" }),
    ).toMatchObject({ outcome: "unreachable", markStale: true });
  });
  it("timeouts / other network errors → error, no stale", () => {
    expect(
      classifyProbe(u, { httpStatus: 0, finalUrl: null, method: "GET", networkError: "timeout" }),
    ).toMatchObject({ outcome: "error", markStale: false });
  });
  it("403 on prenotami.esteri.it → bot_blocked, never stale", () => {
    expect(BOT_BLOCKED_HOSTS).toContain("prenotami.esteri.it");
    expect(
      classifyProbe("https://prenotami.esteri.it/", { httpStatus: 403, finalUrl: "https://prenotami.esteri.it/", method: "GET" }),
    ).toMatchObject({ outcome: "bot_blocked", markStale: false });
  });
  it("403 elsewhere / 5xx → needs_review, no stale", () => {
    expect(classifyProbe(u, { httpStatus: 403, finalUrl: u, method: "GET" })).toMatchObject({ outcome: "needs_review", markStale: false });
    expect(classifyProbe(u, { httpStatus: 503, finalUrl: u, method: "GET" })).toMatchObject({ outcome: "needs_review", markStale: false });
  });
  it("flags host change (ignoring www.) without staling", () => {
    expect(
      classifyProbe(u, { httpStatus: 200, finalUrl: "https://www.esteri.it/moved/", method: "HEAD" }),
    ).toMatchObject({ outcome: "ok", markStale: false, hostChanged: true });
    expect(
      classifyProbe("https://normattiva.it/x", { httpStatus: 200, finalUrl: "https://www.normattiva.it/x", method: "HEAD" }).hostChanged,
    ).toBe(false);
  });
});

describe("probeUrl", () => {
  it("HEAD 200 short-circuits with browser-like UA", async () => {
    const url = "https://consboston.esteri.it/a/";
    const f = fakeFetch({ [url]: { HEAD: { status: 200 } } });
    const p = await probeUrl(url, { fetchImpl: f.impl });
    expect(p).toMatchObject({ httpStatus: 200, method: "HEAD" });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.ua).toBe(CHECK_USER_AGENT);
    expect(CHECK_USER_AGENT).toMatch(/^Mozilla\/5\.0 /);
  });

  it("HEAD 405 → falls back to GET", async () => {
    const url = "https://www.poliziadistato.it/articolo/225";
    const f = fakeFetch({ [url]: { HEAD: { status: 405 }, GET: { status: 200 } } });
    const p = await probeUrl(url, { fetchImpl: f.impl });
    expect(p).toMatchObject({ httpStatus: 200, method: "GET" });
    expect(f.calls.map((c) => c.method)).toEqual(["HEAD", "GET"]);
  });

  it("DNS failure on HEAD → no GET, networkError dns", async () => {
    const url = "https://gone.esteri.it/";
    const f = fakeFetch({ [url]: { HEAD: { throw: dnsError } } });
    const p = await probeUrl(url, { fetchImpl: f.impl });
    expect(p).toMatchObject({ httpStatus: 0, networkError: "dns" });
    expect(f.calls).toHaveLength(1);
  });

  it("GET failure after a HEAD answer keeps the HEAD status", async () => {
    const url = "https://www.normattiva.it/x";
    const f = fakeFetch({ [url]: { HEAD: { status: 503 }, GET: { throw: timeoutError } } });
    const p = await probeUrl(url, { fetchImpl: f.impl });
    expect(p).toMatchObject({ httpStatus: 503, method: "HEAD" });
  });

  it("hash mode GETs and returns sha256", async () => {
    const url = "https://consdetroit.esteri.it/x.pdf";
    const f = fakeFetch({ [url]: { GET: { status: 200, body: "abc" } } });
    const p = await probeUrl(url, { fetchImpl: f.impl, hash: true });
    expect(p.contentHash).toBe("sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(f.calls.map((c) => c.method)).toEqual(["GET"]);
  });
});

describe("runSourceCheck", () => {
  const OK = "https://consboston.esteri.it/ok/";
  const DEAD = "https://consmiami.esteri.it/wp-content/uploads/2024/05/RETIRED-TEST.pdf";
  const PRENOTAMI = "https://prenotami.esteri.it/";
  const GONE = "https://gone.esteri.it/";
  const rows = [row("ok-row", OK), row("dead-row", DEAD), row("it-maeci-prenotami", PRENOTAMI), row("gone-row", GONE)];
  const routes = {
    [OK]: { HEAD: { status: 200 } },
    [DEAD]: { HEAD: { status: 404 }, GET: { status: 404 } },
    [PRENOTAMI]: { HEAD: { status: 403 }, GET: { status: 403 } },
    [GONE]: { HEAD: { throw: dnsError } },
  } as const;
  const now = () => new Date("2026-10-08T13:00:00.000Z");

  it("dry run flags the retired test URL + dead host, never writes", async () => {
    const f = fakeFetch(routes as never);
    const applyUpdate = vi.fn();
    const s = await runSourceCheck({ rows, applyUpdate, fetchImpl: f.impl, now }, { dryRun: true, hash: false });
    expect(applyUpdate).not.toHaveBeenCalled();
    expect(s).toMatchObject({ dryRun: true, checked: 4, healthy: 1, botBlocked: 1, staleFlagged: 2, errors: 0 });
    const byId = Object.fromEntries(s.results.map((r) => [r.id, r]));
    expect(byId["dead-row"]).toMatchObject({ outcome: "dead", action: "mark_stale", httpStatus: 404 });
    expect(byId["gone-row"]).toMatchObject({ outcome: "unreachable", action: "mark_stale", networkError: "dns" });
    expect(byId["it-maeci-prenotami"]).toMatchObject({ outcome: "bot_blocked", action: "none" });
  });

  it("live run writes operational columns only; stale only for hard failures", async () => {
    const f = fakeFetch(routes as never);
    const applyUpdate = vi.fn<(id: string, update: CheckUpdate) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
    await runSourceCheck({ rows, applyUpdate, fetchImpl: f.impl, now }, { dryRun: false, hash: false });
    const updates = Object.fromEntries(applyUpdate.mock.calls.map((c) => [c[0], c[1]]));
    expect(updates["ok-row"]).toEqual({ last_checked_at: "2026-10-08T13:00:00.000Z", last_http_status: 200 });
    expect(updates["dead-row"]).toEqual({ last_checked_at: "2026-10-08T13:00:00.000Z", last_http_status: 404, status: "stale" });
    expect(updates["gone-row"]).toEqual({ last_checked_at: "2026-10-08T13:00:00.000Z", last_http_status: 0, status: "stale" });
    expect(updates["it-maeci-prenotami"]).toEqual({ last_checked_at: "2026-10-08T13:00:00.000Z", last_http_status: 403 });
  });

  it("hash mode stores content_hash and flags (does not stale) hash changes", async () => {
    const f = fakeFetch({ [OK]: { GET: { status: 200, body: "new" } } });
    const applyUpdate = vi.fn<(id: string, update: CheckUpdate) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
    const s = await runSourceCheck(
      { rows: [row("ok-row", OK, "sha256:old")], applyUpdate, fetchImpl: f.impl, now },
      { dryRun: false, hash: true },
    );
    expect(s.hashChanged).toBe(1);
    expect(s.staleFlagged).toBe(0);
    const update = applyUpdate.mock.calls[0]![1] as unknown as Record<string, unknown>;
    expect(update.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(update.status).toBeUndefined();
  });

  it("never probes non-official hosts", async () => {
    const f = fakeFetch({});
    const applyUpdate = vi.fn();
    const s = await runSourceCheck(
      { rows: [row("blog", "https://someblog.com/x")], applyUpdate, fetchImpl: f.impl, now },
      { dryRun: false, hash: false },
    );
    expect(f.calls).toHaveLength(0);
    expect(applyUpdate).not.toHaveBeenCalled();
    expect(s.results[0]).toMatchObject({ outcome: "skipped_non_official", action: "none" });
  });

  it("records write failures without throwing", async () => {
    const f = fakeFetch({ [OK]: { HEAD: { status: 200 } } });
    const s = await runSourceCheck(
      { rows: [row("ok-row", OK)], applyUpdate: async () => ({ ok: false }), fetchImpl: f.impl, now },
      { dryRun: false, hash: false },
    );
    expect(s.writeFailures).toBe(1);
  });
});
