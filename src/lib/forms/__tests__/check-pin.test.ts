import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { isVercelCron, runSourceCheck, type FetchLike } from "@/lib/sources/check";
import type { CheckUpdate } from "@/lib/sources/repo";

const URL_PDF = "https://consnewyork.esteri.it/wp-content/uploads/2023/06/formulario_nazionale_visti2.pdf";
const URL_PAGE = "https://consnewyork.esteri.it/en/page/";
const OFFICIAL = new TextEncoder().encode("%PDF-1.4 official bytes");
const PIN = createHash("sha256").update(OFFICIAL).digest("hex");

type Serve = { bytes: Uint8Array | null; status?: number; contentType?: string | null };

function fetchServing(serve: Serve) {
  const calls: string[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push(`${init.method} ${url}`);
    const ct = serve.contentType === undefined ? "application/pdf" : serve.contentType;
    return {
      status: serve.bytes ? (serve.status ?? 200) : (serve.status ?? 404),
      url,
      body: null,
      headers: new Headers(ct ? { "content-type": ct } : {}),
      arrayBuffer: async () => (serve.bytes ?? new Uint8Array()).slice().buffer as ArrayBuffer,
    };
  };
  return { impl, calls };
}

async function run(
  bytes: Uint8Array | null,
  opts: { hash?: boolean; dryRun?: boolean; status?: number; contentType?: string | null; formsOnly?: boolean } = {},
) {
  const writes: Array<{ id: string; update: CheckUpdate }> = [];
  const f = fetchServing({ bytes, status: opts.status, contentType: opts.contentType });
  const summary = await runSourceCheck(
    {
      rows: [
        { id: "us-new-york-national-visa-form", official_url: URL_PDF, status: "active", content_hash: `sha256:${PIN}` },
        { id: "us-new-york-dnv", official_url: URL_PAGE, status: "active", content_hash: null },
      ],
      applyUpdate: async (id, update) => (writes.push({ id, update }), { ok: true }),
      fetchImpl: f.impl,
      pinnedHashes: { "us-new-york-national-visa-form": PIN },
      now: () => new Date("2026-11-01T04:00:00.000Z"),
    },
    { dryRun: opts.dryRun ?? false, hash: opts.hash ?? false, formsOnly: opts.formsOnly },
  );
  return { summary, writes, calls: f.calls };
}

const formWrite = (writes: Array<{ id: string; update: CheckUpdate }>) =>
  writes.find((x) => x.id === "us-new-york-national-visa-form")!;

describe("F12a link check: pinned form PDF hash (decision 6; Cap review of #40)", () => {
  it("always GETs + hashes a pinned row, even without ?hash=1; match → no needs_review", async () => {
    const { summary, writes, calls } = await run(OFFICIAL);
    expect(calls).toContain(`GET ${URL_PDF}`);
    expect(calls).toContain(`HEAD ${URL_PAGE}`);
    expect(summary.formHashMismatch).toBe(0);
    const w = formWrite(writes);
    expect(w.update.needs_review).toBeUndefined();
    expect(w.update.content_hash).toBe(`sha256:${PIN}`);
    expect(summary.results.find((r) => r.id === "us-new-york-national-visa-form")!.formHashMismatch).toBe(false);
  });

  it("verified PDF (content-type + %PDF- magic) with a different hash → needs_review = true, status untouched", async () => {
    const { summary, writes } = await run(new TextEncoder().encode("%PDF-1.7 changed by consulate"));
    expect(summary.formHashMismatch).toBe(1);
    const w = formWrite(writes);
    expect(w.update.needs_review).toBe(true);
    expect(w.update.status).toBeUndefined();
    expect(writes.find((x) => x.id === "us-new-york-dnv")!.update.needs_review).toBeUndefined();
  });

  it("content-type with parameters still counts as PDF", async () => {
    const { summary } = await run(new TextEncoder().encode("%PDF-1.4 other"), { contentType: "application/pdf; qs=0.001" });
    expect(summary.formHashMismatch).toBe(1);
  });

  it.each([
    ["HTML block page with a 200", new TextEncoder().encode("<html>Request Rejected</html>"), "text/html"],
    ["PDF content-type but no %PDF- magic", new TextEncoder().encode("<html>soft 404</html>"), "application/pdf"],
    ["%PDF- body without a content-type", new TextEncoder().encode("%PDF-1.7 x"), null],
  ])("2xx that is not a verified PDF (%s) → formFetchNotPdf, no needs_review, not stale", async (_n, bytes, ct) => {
    const { summary, writes } = await run(bytes, { contentType: ct });
    expect(summary.formHashMismatch).toBe(0);
    expect(summary.formFetchNotPdf).toBe(1);
    const w = formWrite(writes);
    expect(w.update.needs_review).toBeUndefined();
    expect(w.update.status).toBeUndefined();
  });

  it("dry run reports the mismatch but writes nothing", async () => {
    const { summary, writes } = await run(new TextEncoder().encode("%PDF-changed"), { dryRun: true });
    expect(summary.formHashMismatch).toBe(1);
    expect(writes).toHaveLength(0);
  });

  it.each([404, 410])("pinned form PDF %i → needs_review = true, NOT stale (free parts stay up)", async (status) => {
    const { summary, writes } = await run(null, { status });
    expect(summary.formMissing).toBe(1);
    expect(summary.formHashMismatch).toBe(0);
    const w = formWrite(writes);
    expect(w.update.needs_review).toBe(true);
    expect(w.update.status).toBeUndefined();
    const item = summary.results.find((r) => r.id === "us-new-york-national-visa-form")!;
    expect(item.action).toBe("mark_needs_review");
    // Unpinned rows keep F8: a dead page is still staled.
    expect(writes.find((x) => x.id === "us-new-york-dnv")!.update.status).toBe("stale");
  });

  it("401/403 on the pinned PDF → bot_blocked, no flag, not stale", async () => {
    const { summary, writes } = await run(null, { status: 403 });
    const w = formWrite(writes);
    expect(w.update.needs_review).toBeUndefined();
    expect(w.update.status).toBeUndefined();
    expect(summary.formMissing).toBe(0);
  });

  it("formsOnly checks pinned rows only (monthly cron) and never touches other sources", async () => {
    const { summary, writes, calls } = await run(null, { formsOnly: true });
    expect(summary.formsOnly).toBe(true);
    expect(summary.checked).toBe(1);
    expect(calls).toEqual([`GET ${URL_PDF}`]);
    expect(writes.map((w) => w.id)).toEqual(["us-new-york-national-visa-form"]);
    expect(summary.staleFlagged).toBe(0);
  });

  it("forced hash compares to the PIN, not to the row's content_hash (N12)", async () => {
    const writes: Array<{ id: string; update: CheckUpdate }> = [];
    const f = fetchServing({ bytes: OFFICIAL });
    const summary = await runSourceCheck(
      {
        rows: [{ id: "us-new-york-national-visa-form", official_url: URL_PDF, status: "active", content_hash: "sha256:" + "0".repeat(64) }],
        applyUpdate: async (id, update) => (writes.push({ id, update }), { ok: true }),
        fetchImpl: f.impl,
        pinnedHashes: { "us-new-york-national-visa-form": PIN },
      },
      { dryRun: false, hash: false },
    );
    const item = summary.results[0]!;
    expect(item.hashChanged).toBe(true);
    expect(item.formHashMismatch).toBe(false);
    expect(writes[0]!.update.needs_review).toBeUndefined();
    expect(writes[0]!.update.content_hash).toBe(`sha256:${PIN}`);
  });

  it("unpinned rows keep F8 behaviour (no forced hash)", async () => {
    const { summary } = await run(OFFICIAL);
    expect(summary.results.find((r) => r.id === "us-new-york-dnv")!.formHashMismatch).toBeUndefined();
  });
});

describe("isVercelCron", () => {
  it("matches the Vercel Cron user-agent only", () => {
    const req = (ua?: string) => new Request("https://x.test/api/cron/check-sources", { headers: ua ? { "user-agent": ua } : {} });
    expect(isVercelCron(req("vercel-cron/1.0"))).toBe(true);
    expect(isVercelCron(req("curl/8.0"))).toBe(false);
    expect(isVercelCron(req())).toBe(false);
  });
});

describe("F12a needs_review is cleared only by Visa Ops (admin PATCH)", () => {
  it("PATCH accepts needsReview and maps it to needs_review", async () => {
    const { patchSourceSchema, toDbColumns } = await import("@/lib/sources/validate");
    const parsed = patchSourceSchema.parse({ needsReview: false });
    expect(toDbColumns(parsed)).toEqual({ needs_review: false });
    expect(() => patchSourceSchema.parse({ needsReview: "no" })).toThrow();
  });

  it("isFormsEnabled defaults off", async () => {
    const { isFormsEnabled } = await import("@/lib/env");
    expect(isFormsEnabled({})).toBe(false);
    expect(isFormsEnabled({ FORMS_ENABLED: "false" })).toBe(false);
    expect(isFormsEnabled({ FORMS_ENABLED: " true " })).toBe(true);
  });
});
