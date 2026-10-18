import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const verifyAccessToken = vi.fn();
let db: ReturnType<typeof makeDb>;

vi.mock("@/lib/auth/verify-access-token", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/verify-access-token")>("@/lib/auth/verify-access-token");
  return { ...actual, verifyAccessToken: (...a: unknown[]) => verifyAccessToken(...a) };
});
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => db }));

import { GET as LIST } from "@/app/api/forms/route";
import { GET as GET_FORM } from "@/app/api/forms/[formId]/route";
import { FORMS_STALE_NOTICE, NATIONAL_VISA_FIELDS, NATIONAL_VISA_TEMPLATE } from "@/lib/forms/national-visa";

type Row = Record<string, unknown>;

function makeDb(tables: Record<string, Row[]>, failTables: string[] = []) {
  return {
    schema: () => ({
      from: (table: string) => {
        const rows = tables[table] ?? [];
        const filters: ((r: Row) => boolean)[] = [];
        const run = () => rows.filter((r) => filters.every((f) => f(r)));
        const fail = failTables.includes(table);
        const api: Record<string, unknown> = {};
        Object.assign(api, {
          select: () => api,
          eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
          in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), api),
          maybeSingle: async () => (fail ? { data: null, error: { message: "x" } } : { data: run()[0] ?? null, error: null }),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(resolve(fail ? { data: null, error: { message: "x" } } : { data: run(), error: null })),
        });
        return api;
      },
    }),
  };
}

const sourceRow = (over: Row = {}): Row => ({
  id: "us-new-york-national-visa-form",
  title: "Domanda di visto Nazionale (D) — Consolato Generale d'Italia New York (bilingual IT/EN)",
  publisher: "Consolato Generale d'Italia a New York (MAECI)",
  official_url: "https://consnewyork.esteri.it/wp-content/uploads/2023/06/formulario_nazionale_visti2.pdf",
  doc_type: "form",
  scope: "US-consulate:new-york",
  retrieved_at: "2026-10-18",
  status: "active",
  needs_review: false,
  ...over,
});

function seed(over: { source?: Row | null; entitlement?: string | null; deletion?: string } = {}) {
  return {
    users: [{ id: USER_ID, deletion_status: over.deletion ?? "active" }],
    sources: over.source === null ? [] : [over.source ?? sourceRow()],
    entitlements: over.entitlement
      ? [{ user_id: USER_ID, entitlement_id: "journey_full", status: over.entitlement }]
      : [],
  };
}

const req = (p: string, auth = "Bearer good") =>
  new Request(`https://api.example.test${p}`, { headers: auth ? { authorization: auth } : {} });
const ctx = (formId: string) => ({ params: Promise.resolve({ formId }) });
const getForm = (formId = "national-visa", auth?: string) => GET_FORM(req(`/api/forms/${formId}`, auth), ctx(formId));

beforeEach(() => {
  vi.stubEnv("FORMS_ENABLED", "true");
  vi.stubEnv("BILLING_GATE_ENABLED", "false");
  db = makeDb(seed());
  verifyAccessToken.mockReset();
  verifyAccessToken.mockResolvedValue({
    ok: true,
    value: { user: { id: USER_ID } as unknown as User, userId: USER_ID, accessToken: "t" },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/forms* (F12a)", () => {
  it("no token → 401 even when the flag is off; flag off → 404 FORMS_DISABLED", async () => {
    vi.stubEnv("FORMS_ENABLED", "");
    verifyAccessToken.mockResolvedValueOnce({ ok: false, reason: "missing" });
    expect((await getForm("national-visa", "")).status).toBe(401);
    const off = await getForm();
    expect(off.status).toBe(404);
    expect((await off.json()).error.code).toBe("FORMS_DISABLED");
    const list = await LIST(req("/api/forms"));
    expect((await list.json()).error.code).toBe("FORMS_DISABLED");
  });

  it("deleted / pending accounts are refused", async () => {
    db = makeDb(seed({ deletion: "pending_deletion" }));
    expect((await getForm()).status).toBe(403);
    db = makeDb(seed({ deletion: "deleted" }));
    expect((await getForm()).status).toBe(410);
  });

  it("list: one form, available, keyed to the source row", async () => {
    const res = await LIST(req("/api/forms"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.disclaimer).toBe("Preliminary guidance — not legal advice");
    expect(body.forms).toEqual([
      {
        formId: "national-visa",
        title: "Domanda di visto Nazionale (D) — Consolato Generale d'Italia New York (bilingual IT/EN)",
        stepId: "submit-application",
        sourceId: "us-new-york-national-visa-form",
        scope: "US-consulate:new-york",
        contentVersion: "visa-ops-national-visa-2026-10-18",
        available: true,
        needsReview: false,
      },
    ]);
  });

  it("list: missing / non-active source → available false", async () => {
    db = makeDb(seed({ source: sourceRow({ status: "stale" }) }));
    const body = await (await LIST(req("/api/forms"))).json();
    expect(body.forms[0]).toMatchObject({ available: false, title: null });
  });

  it("detail: content + template + source + access, gate off → free", async () => {
    const res = await getForm();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const b = await res.json();
    expect(b.disclaimer).toBe("Preliminary guidance — not legal advice");
    expect(b.translationLabel).toBe("English translation — for understanding only. Submit the Italian original.");
    expect(b.source).toMatchObject({
      id: "us-new-york-national-visa-form",
      url: "https://consnewyork.esteri.it/wp-content/uploads/2023/06/formulario_nazionale_visti2.pdf",
      host: "consnewyork.esteri.it",
      retrievedAt: "2026-10-18",
      versionDate: null,
      needsReview: false,
    });
    expect(b.template).toMatchObject({
      url: "https://api.example.test/forms/formulario_nazionale_visti2.pdf",
      sha256: NATIONAL_VISA_TEMPLATE.sha256,
      hasAcroForm: false,
      pages: 4,
    });
    expect(b.fields).toHaveLength(37);
    expect(b.fields).toEqual(JSON.parse(JSON.stringify(NATIONAL_VISA_FIELDS)));
    expect(b.prefill).toEqual({ available: true, staleNotice: null });
    expect(b.access).toBe("free");
    expect(b.entitlement).toEqual({ journeyFull: false, gateEnabled: false });
  });

  it("gate on + no journey_full → access paid (content still served)", async () => {
    vi.stubEnv("BILLING_GATE_ENABLED", "true");
    const b = await (await getForm()).json();
    expect(b.access).toBe("paid");
    expect(b.fields).toHaveLength(37);
    expect(b.entitlement).toEqual({ journeyFull: false, gateEnabled: true });
  });

  it("gate on + active journey_full → free; revoked → paid", async () => {
    vi.stubEnv("BILLING_GATE_ENABLED", "true");
    db = makeDb(seed({ entitlement: "active" }));
    expect((await (await getForm()).json()).access).toBe("free");
    db = makeDb(seed({ entitlement: "revoked" }));
    expect((await (await getForm()).json()).access).toBe("paid");
  });

  it("gate on + entitlement read fails → paid, unavailable flagged (never 500)", async () => {
    vi.stubEnv("BILLING_GATE_ENABLED", "true");
    db = makeDb(seed(), ["entitlements"]);
    const res = await getForm();
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.access).toBe("paid");
    expect(b.entitlement).toEqual({ journeyFull: false, gateEnabled: true, unavailable: true });
  });

  it("needs_review → prefill hidden with the stale notice", async () => {
    db = makeDb(seed({ source: sourceRow({ needs_review: true }) }));
    const b = await (await getForm()).json();
    expect(b.source.needsReview).toBe(true);
    expect(b.prefill).toEqual({ available: false, staleNotice: FORMS_STALE_NOTICE });
    expect(b.prefill.staleNotice).toBe("This form may have changed — check the official link");
    const list = await (await LIST(req("/api/forms"))).json();
    expect(list.forms[0].needsReview).toBe(true);
  });

  it("gate V1: no active source row → 503 FORM_SOURCE_UNAVAILABLE", async () => {
    db = makeDb(seed({ source: null }));
    const res = await getForm();
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("FORM_SOURCE_UNAVAILABLE");
    db = makeDb(seed({ source: sourceRow({ status: "retired" }) }));
    expect((await getForm()).status).toBe(503);
  });

  it("unknown form → 404 NOT_FOUND; sources read failure → 500", async () => {
    const res = await getForm("permesso-kit");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
    db = makeDb(seed(), ["sources"]);
    expect((await getForm()).status).toBe(500);
  });

  it("accepts no input and returns no personal data fields", async () => {
    const text = await (await getForm()).text();
    expect(text).not.toMatch(/"(passport|birthDate|address|name|givenName|familyName)"\s*:/);
  });
});
