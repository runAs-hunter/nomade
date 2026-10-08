import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetServerEnvCache } from "@/lib/env";
import { ERROR_CODES } from "@/lib/api-error";

const verifyAccessToken = vi.fn();
const listActiveSources = vi.fn();
const getActiveSource = vi.fn();
const insertSource = vi.fn();
const updateSource = vi.fn();

vi.mock("@/lib/auth/verify-access-token", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/verify-access-token")>(
    "@/lib/auth/verify-access-token",
  );
  return { ...actual, verifyAccessToken: (...a: unknown[]) => verifyAccessToken(...a) };
});

vi.mock("@/lib/sources/repo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sources/repo")>("@/lib/sources/repo");
  return {
    ...actual,
    listActiveSources: (...a: unknown[]) => listActiveSources(...a),
    getActiveSource: (...a: unknown[]) => getActiveSource(...a),
    insertSource: (...a: unknown[]) => insertSource(...a),
    updateSource: (...a: unknown[]) => updateSource(...a),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ schema: vi.fn() }),
  createAnonClient: () => ({}),
}));

import { GET as LIST, POST } from "@/app/api/sources/route";
import { GET as GET_ONE, PATCH, DELETE } from "@/app/api/sources/[id]/route";

const VALID_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bgdrzdlenmwbpalnjiqg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};
const ADMIN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const USER_ID = "11111111-2222-3333-4444-555555555555";

const PUBLIC_ROW = {
  id: "it-maeci-prenotami",
  path_ids: ["italy_digital_nomad", "italy_remote_worker"],
  country: "IT",
  title: "Prenot@Mi visa appointment portal",
  publisher: "MAECI",
  official_url: "https://prenotami.esteri.it/",
  doc_type: "portal",
  scope: "national",
  retrieved_at: "2026-10-08",
  last_checked_at: null,
  last_http_status: null,
  status: "active",
  step_ids: [],
};
const FULL_ROW = {
  ...PUBLIC_ROW,
  notes: "internal",
  content_hash: null,
  snapshot_ref: null,
  created_at: "2026-10-08T13:31:26Z",
  updated_at: "2026-10-08T13:31:26Z",
};

const VALID_BODY = {
  pathIds: ["italy_digital_nomad"],
  title: "Test",
  publisher: "MAECI",
  officialUrl: "https://www.esteri.it/test",
  docType: "portal",
  scope: "national",
  retrievedAt: "2026-10-08",
};

function req(path: string, method = "GET", opts: { auth?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.auth) headers.authorization = opts.auth;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/sources (F8)", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    for (const m of [verifyAccessToken, listActiveSources, getActiveSource, insertSource, updateSource]) m.mockReset();
    Object.assign(process.env, VALID_ENV);
    process.env.SOURCES_ADMIN_USER_IDS = ADMIN_ID;
  });

  afterEach(() => {
    resetServerEnvCache();
    for (const k of Object.keys(process.env)) if (!(k in prev)) delete process.env[k];
    Object.assign(process.env, prev);
  });

  describe("public reads", () => {
    it("GET list by pathId → 200 camelCase, active rows, disclaimer, no notes", async () => {
      listActiveSources.mockResolvedValue({ ok: true, value: [PUBLIC_ROW] });
      const res = await LIST(req("/api/sources?pathId=italy_remote_worker"));
      expect(res.status).toBe(200);
      expect(res.headers.get("x-request-id")).toBeTruthy();
      const body = await res.json();
      expect(listActiveSources).toHaveBeenCalledWith(expect.anything(), { pathId: "italy_remote_worker", q: null });
      expect(body.count).toBe(1);
      expect(body.disclaimer).toBe("Preliminary guidance \u2014 not legal advice");
      expect(body.sources[0]).toMatchObject({
        id: "it-maeci-prenotami",
        officialUrl: "https://prenotami.esteri.it/",
        retrievedAt: "2026-10-08",
        pathIds: ["italy_digital_nomad", "italy_remote_worker"],
        status: "active",
      });
      expect(body.sources[0]).not.toHaveProperty("notes");
      expect(verifyAccessToken).not.toHaveBeenCalled();
    });

    it("GET list passes q", async () => {
      listActiveSources.mockResolvedValue({ ok: true, value: [] });
      await LIST(req("/api/sources?q=miami"));
      expect(listActiveSources).toHaveBeenCalledWith(expect.anything(), { pathId: null, q: "miami" });
    });

    it("GET list malformed pathId → 400 envelope", async () => {
      const res = await LIST(req("/api/sources?pathId=DROP%20TABLE"));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatchObject({ code: ERROR_CODES.BAD_REQUEST, requestId: expect.any(String) });
      expect(listActiveSources).not.toHaveBeenCalled();
    });

    it("GET list DB error → 500 envelope", async () => {
      listActiveSources.mockResolvedValue({ ok: false, code: "DB_ERROR", message: "x" });
      const res = await LIST(req("/api/sources"));
      expect(res.status).toBe(500);
      expect((await res.json()).error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    });

    it("GET one → 200", async () => {
      getActiveSource.mockResolvedValue({ ok: true, value: PUBLIC_ROW });
      const res = await GET_ONE(req("/api/sources/it-maeci-prenotami"), ctx("it-maeci-prenotami"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.source.id).toBe("it-maeci-prenotami");
      expect(body.disclaimer).toBe("Preliminary guidance \u2014 not legal advice");
    });

    it("GET one missing/inactive → 404; malformed id → 404 without DB call", async () => {
      getActiveSource.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "Source not found" });
      const res = await GET_ONE(req("/api/sources/nope-nope"), ctx("nope-nope"));
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe(ERROR_CODES.NOT_FOUND);

      getActiveSource.mockClear();
      const bad = await GET_ONE(req("/api/sources/..%2F"), ctx("..%2F"));
      expect(bad.status).toBe(404);
      expect(getActiveSource).not.toHaveBeenCalled();
    });
  });

  describe("admin writes", () => {
    it("POST without auth → 401, no insert", async () => {
      const res = await POST(req("/api/sources", "POST", { body: VALID_BODY }));
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
      expect(insertSource).not.toHaveBeenCalled();
    });

    it("PATCH / DELETE without auth → 401", async () => {
      const p = await PATCH(req("/api/sources/it-maeci-prenotami", "PATCH", { body: { title: "x" } }), ctx("it-maeci-prenotami"));
      const d = await DELETE(req("/api/sources/it-maeci-prenotami", "DELETE"), ctx("it-maeci-prenotami"));
      expect(p.status).toBe(401);
      expect(d.status).toBe(401);
      expect(updateSource).not.toHaveBeenCalled();
    });

    it("POST with anon key / invalid JWT → 401", async () => {
      verifyAccessToken.mockResolvedValue({ ok: false, reason: "invalid" });
      const res = await POST(
        req("/api/sources", "POST", { auth: `Bearer ${VALID_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY}`, body: VALID_BODY }),
      );
      expect(res.status).toBe(401);
      expect(insertSource).not.toHaveBeenCalled();
    });

    it("POST with a valid non-admin user JWT → 403", async () => {
      verifyAccessToken.mockResolvedValue({ ok: true, value: { userId: USER_ID, user: { id: USER_ID }, accessToken: "t" } });
      const res = await POST(req("/api/sources", "POST", { auth: "Bearer user-jwt", body: VALID_BODY }));
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe(ERROR_CODES.FORBIDDEN);
      expect(insertSource).not.toHaveBeenCalled();
    });

    it("POST with Cap-approved admin JWT → 201", async () => {
      verifyAccessToken.mockResolvedValue({ ok: true, value: { userId: ADMIN_ID, user: { id: ADMIN_ID }, accessToken: "t" } });
      insertSource.mockResolvedValue({ ok: true, value: FULL_ROW });
      const res = await POST(req("/api/sources", "POST", { auth: "Bearer admin-jwt", body: VALID_BODY }));
      expect(res.status).toBe(201);
      expect((await res.json()).source.notes).toBe("internal");
    });

    it("POST with service-role Bearer → 201 and maps columns", async () => {
      insertSource.mockResolvedValue({ ok: true, value: FULL_ROW });
      const res = await POST(
        req("/api/sources", "POST", { auth: `Bearer ${VALID_ENV.SUPABASE_SERVICE_ROLE_KEY}`, body: VALID_BODY }),
      );
      expect(res.status).toBe(201);
      expect(verifyAccessToken).not.toHaveBeenCalled();
      expect(insertSource).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ official_url: "https://www.esteri.it/test", path_ids: ["italy_digital_nomad"], status: "active", country: "IT" }),
      );
    });

    it("POST rejects unofficial URL / operational fields with 400", async () => {
      const auth = `Bearer ${VALID_ENV.SUPABASE_SERVICE_ROLE_KEY}`;
      const blog = await POST(req("/api/sources", "POST", { auth, body: { ...VALID_BODY, officialUrl: "https://visa-blog.com/x" } }));
      expect(blog.status).toBe(400);
      const op = await POST(req("/api/sources", "POST", { auth, body: { ...VALID_BODY, lastHttpStatus: 200 } }));
      expect(op.status).toBe(400);
      expect(insertSource).not.toHaveBeenCalled();
    });

    it("POST duplicate → 409 CONFLICT", async () => {
      insertSource.mockResolvedValue({ ok: false, code: "CONFLICT", message: "dup" });
      const res = await POST(
        req("/api/sources", "POST", { auth: `Bearer ${VALID_ENV.SUPABASE_SERVICE_ROLE_KEY}`, body: VALID_BODY }),
      );
      expect(res.status).toBe(409);
    });

    it("PATCH admin → 200; DELETE retires (status=retired)", async () => {
      const auth = `Bearer ${VALID_ENV.SUPABASE_SERVICE_ROLE_KEY}`;
      updateSource.mockResolvedValue({ ok: true, value: { ...FULL_ROW, status: "retired" } });
      const p = await PATCH(req("/api/sources/it-maeci-prenotami", "PATCH", { auth, body: { notes: "rechecked" } }), ctx("it-maeci-prenotami"));
      expect(p.status).toBe(200);
      expect(updateSource).toHaveBeenLastCalledWith(expect.anything(), "it-maeci-prenotami", { notes: "rechecked" });
      const d = await DELETE(req("/api/sources/it-maeci-prenotami", "DELETE", { auth }), ctx("it-maeci-prenotami"));
      expect(d.status).toBe(200);
      expect(updateSource).toHaveBeenLastCalledWith(expect.anything(), "it-maeci-prenotami", { status: "retired" });
      expect((await d.json()).source.status).toBe("retired");
    });

    it("PATCH malformed JSON → 400", async () => {
      const r = new Request("http://localhost/api/sources/it-maeci-prenotami", {
        method: "PATCH",
        headers: { authorization: `Bearer ${VALID_ENV.SUPABASE_SERVICE_ROLE_KEY}` },
        body: "{nope",
      });
      const res = await PATCH(r, ctx("it-maeci-prenotami"));
      expect(res.status).toBe(400);
    });
  });
});
