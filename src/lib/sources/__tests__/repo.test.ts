import { describe, it, expect } from "vitest";
import {
  applyCheckUpdate,
  getActiveSource,
  insertSource,
  listActiveSources,
  matchesQuery,
  updateSource,
} from "@/lib/sources/repo";
import { createFakeDb } from "./fake-db";

const ROW = {
  id: "us-boston-dnv",
  path_ids: ["italy_digital_nomad", "italy_remote_worker"],
  country: "IT",
  title: "Digital nomad / remote worker visa (Boston)",
  publisher: "Consulate General of Italy Boston",
  official_url: "https://consboston.esteri.it/x/",
  doc_type: "consular_guidance",
  scope: "US-consulate:boston",
  retrieved_at: "2026-10-03",
  last_checked_at: null,
  last_http_status: null,
  status: "active",
  step_ids: [],
};

describe("sources repo", () => {
  it("listActiveSources filters status=active + path_ids contains pathId on internal schema", async () => {
    const db = createFakeDb({ data: [ROW], error: null });
    const res = await listActiveSources(db.client, { pathId: "italy_remote_worker", q: null });
    expect(res).toEqual({ ok: true, value: [ROW] });
    expect(db.calls).toContainEqual({ method: "schema", args: ["internal"] });
    expect(db.calls).toContainEqual({ method: "from", args: ["sources"] });
    expect(db.calls).toContainEqual({ method: "eq", args: ["status", "active"] });
    expect(db.calls).toContainEqual({ method: "contains", args: ["path_ids", ["italy_remote_worker"]] });
    const select = db.calls.find((c) => c.method === "select");
    expect(String(select?.args[0])).not.toMatch(/notes|content_hash|snapshot_ref/);
  });

  it("listActiveSources without pathId does not add contains()", async () => {
    const db = createFakeDb({ data: [], error: null });
    await listActiveSources(db.client, { pathId: null, q: null });
    expect(db.calls.some((c) => c.method === "contains")).toBe(false);
  });

  it("listActiveSources applies q in memory (title/publisher/scope, case-insensitive)", async () => {
    const other = { ...ROW, id: "it-maeci-prenotami", title: "Prenot@Mi", publisher: "MAECI", scope: "national" };
    const db = createFakeDb({ data: [ROW, other], error: null });
    const res = await listActiveSources(db.client, { pathId: null, q: "boston" });
    expect(res.ok && res.value.map((r) => r.id)).toEqual(["us-boston-dnv"]);
    expect(matchesQuery(other, "maeci")).toBe(true);
    expect(matchesQuery(other, "%")).toBe(false);
  });

  it("maps DB errors to DB_ERROR", async () => {
    const db = createFakeDb({ data: null, error: { code: "XX000", message: "boom" } });
    const res = await listActiveSources(db.client, { pathId: null, q: null });
    expect(res).toMatchObject({ ok: false, code: "DB_ERROR" });
  });

  it("getActiveSource → NOT_FOUND when no active row", async () => {
    const db = createFakeDb({ data: null, error: null });
    const res = await getActiveSource(db.client, "it-maeci-prenotami");
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(db.calls).toContainEqual({ method: "eq", args: ["status", "active"] });
  });

  it("insertSource maps unique violation to CONFLICT", async () => {
    const db = createFakeDb({ data: null, error: { code: "23505" } });
    const res = await insertSource(db.client, { id: "x-dup" });
    expect(res).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("updateSource → NOT_FOUND when id missing", async () => {
    const db = createFakeDb({ data: null, error: null });
    const res = await updateSource(db.client, "missing-id", { status: "retired" });
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("applyCheckUpdate is guarded by status=active", async () => {
    const db = createFakeDb({ data: null, error: null });
    const res = await applyCheckUpdate(db.client, "it-maeci-prenotami", {
      last_checked_at: "2026-10-08T00:00:00.000Z",
      last_http_status: 200,
    });
    expect(res.ok).toBe(true);
    expect(db.calls).toContainEqual({ method: "eq", args: ["id", "it-maeci-prenotami"] });
    expect(db.calls).toContainEqual({ method: "eq", args: ["status", "active"] });
    const update = db.calls.find((c) => c.method === "update");
    expect(Object.keys(update?.args[0] as object).sort()).toEqual(["last_checked_at", "last_http_status"]);
  });
});
