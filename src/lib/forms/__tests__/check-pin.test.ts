import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { runSourceCheck, type FetchLike } from "@/lib/sources/check";
import type { CheckUpdate } from "@/lib/sources/repo";

const URL_PDF = "https://consnewyork.esteri.it/wp-content/uploads/2023/06/formulario_nazionale_visti2.pdf";
const URL_PAGE = "https://consnewyork.esteri.it/en/page/";
const OFFICIAL = new TextEncoder().encode("%PDF official bytes");
const PIN = createHash("sha256").update(OFFICIAL).digest("hex");

function fetchServing(bytes: Uint8Array | null, status = 200) {
  const calls: string[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push(`${init.method} ${url}`);
    return {
      status: bytes ? status : 404,
      url,
      body: null,
      arrayBuffer: async () => (bytes ?? new Uint8Array()).slice().buffer as ArrayBuffer,
    };
  };
  return { impl, calls };
}

async function run(bytes: Uint8Array | null, opts: { hash?: boolean; dryRun?: boolean; status?: number } = {}) {
  const writes: Array<{ id: string; update: CheckUpdate }> = [];
  const f = fetchServing(bytes, opts.status);
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
    { dryRun: opts.dryRun ?? false, hash: opts.hash ?? false },
  );
  return { summary, writes, calls: f.calls };
}

describe("F12a link check: pinned form PDF hash (decision 6)", () => {
  it("always GETs + hashes a pinned row, even without ?hash=1; match → no needs_review", async () => {
    const { summary, writes, calls } = await run(OFFICIAL);
    expect(calls).toContain(`GET ${URL_PDF}`);
    expect(calls).toContain(`HEAD ${URL_PAGE}`);
    expect(summary.formHashMismatch).toBe(0);
    const w = writes.find((x) => x.id === "us-new-york-national-visa-form")!;
    expect(w.update.needs_review).toBeUndefined();
    expect(w.update.content_hash).toBe(`sha256:${PIN}`);
    expect(summary.results.find((r) => r.id === "us-new-york-national-visa-form")!.formHashMismatch).toBe(false);
  });

  it("mismatch → needs_review = true, status untouched", async () => {
    const { summary, writes } = await run(new TextEncoder().encode("%PDF changed by consulate"));
    expect(summary.formHashMismatch).toBe(1);
    const w = writes.find((x) => x.id === "us-new-york-national-visa-form")!;
    expect(w.update.needs_review).toBe(true);
    expect(w.update.status).toBeUndefined();
    expect(writes.find((x) => x.id === "us-new-york-dnv")!.update.needs_review).toBeUndefined();
  });

  it("dry run reports the mismatch but writes nothing", async () => {
    const { summary, writes } = await run(new TextEncoder().encode("changed"), { dryRun: true });
    expect(summary.formHashMismatch).toBe(1);
    expect(writes).toHaveLength(0);
  });

  it("no body hash (404 / error) never sets needs_review; 404 still stales per F8", async () => {
    const { summary, writes } = await run(null);
    expect(summary.formHashMismatch).toBe(0);
    const w = writes.find((x) => x.id === "us-new-york-national-visa-form")!;
    expect(w.update.needs_review).toBeUndefined();
    expect(w.update.status).toBe("stale");
  });

  it("unpinned rows keep F8 behaviour (no forced hash)", async () => {
    const { summary } = await run(OFFICIAL);
    expect(summary.results.find((r) => r.id === "us-new-york-dnv")!.formHashMismatch).toBeUndefined();
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
