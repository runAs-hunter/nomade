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
import {
  FORMS_ARRIVAL_REMINDER,
  FORMS_LOCK_SENTENCE,
  FORMS_NAME_CHECK_NOTE,
  FORMS_STALE_NOTICE,
  FORMS_TRANSLATION_LABEL,
  NATIONAL_VISA_FIELDS,
  NATIONAL_VISA_INTRO,
  NATIONAL_VISA_SECTIONS,
  NATIONAL_VISA_STAMPS,
  NATIONAL_VISA_TEMPLATE,
} from "@/lib/forms/national-visa";
import { US_CONSULATE_POSTS } from "@/lib/journey/consulates";

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
const getForm = (formId = "national-visa", auth?: string, consulate: string | null = "new-york") =>
  GET_FORM(req(`/api/forms/${formId}${consulate === null ? "" : `?consulate=${consulate}`}`, auth), ctx(formId));
const NY_PDF = "https://consnewyork.esteri.it/wp-content/uploads/2023/06/formulario_nazionale_visti2.pdf";

beforeEach(() => {
  vi.stubEnv("FORMS_ENABLED", "true");
  vi.stubEnv("FORMS_PUBLIC_BASE_URL", "https://nomade.example.test");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
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
  it("no token with the flag ON → 401 (list and detail), nothing served (N12)", async () => {
    verifyAccessToken.mockResolvedValueOnce({ ok: false, reason: "missing" });
    verifyAccessToken.mockResolvedValueOnce({ ok: false, reason: "missing" });
    const d = await getForm("national-visa", "");
    expect(d.status).toBe(401);
    const text = await d.text();
    expect(text).not.toContain("formulario_nazionale_visti2.pdf");
    expect((await LIST(req("/api/forms", ""))).status).toBe(401);
  });

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
    const res = await LIST(req("/api/forms?consulate=new-york"));
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
        contentVersion: "visa-ops-national-visa-2026-10-18-3",
        available: true,
        needsReview: false,
        variant: { postId: "new-york", templateScope: "US-consulate:new-york", prefillPosts: ["new-york"], matchesConsulate: true, label: null },
        pdfAvailable: true,
        access: "free",
      },
    ]);
  });

  it("template URL comes from config, never the request host (Cap review N6)", async () => {
    const hostile = await (
      await GET_FORM(
        new Request("https://evil.example.test/api/forms/national-visa?consulate=new-york", {
          headers: { authorization: "Bearer good", host: "evil.example.test" },
        }),
        ctx("national-visa"),
      )
    ).json();
    expect(hostile.template.url).toBe("https://nomade.example.test/forms/formulario_nazionale_visti2.pdf");

    vi.stubEnv("FORMS_PUBLIC_BASE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "nomade-prod-alias.example.test");
    const viaVercel = await (await getForm()).json();
    expect(viaVercel.template.url).toBe("https://nomade-prod-alias.example.test/forms/formulario_nazionale_visti2.pdf");

    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    const unset = await (await getForm()).json();
    expect(unset.template.url).toBeNull();
    expect(unset.template.path).toBe("/forms/formulario_nazionale_visti2.pdf");
  });

  it.each(["new-york", "chicago", null])(
    "no internal workflow text is served (consulate %s): no Cap/Decided/Flagged, no uncertainty list, no ny-packet bullet",
    async (postId) => {
      const detail = await (await getForm("national-visa", undefined, postId)).text();
      const list = await (await LIST(req(postId ? `/api/forms?consulate=${postId}` : "/api/forms"))).text();
      for (const text of [detail, list]) {
        expect(text).not.toMatch(/\bCap\b|Decided|Flagged|Note for Studio|for Visa Ops|ny-packet/);
        expect(text).not.toContain("Signing both page-3 and page-4 lines");
        expect(text).not.toContain("Which form is \\\"current\\\"");
      }
    },
  );

  it("logs never record the consulate or post id (Cap R3-3)", async () => {
    const lines: string[] = [];
    const grab = (...args: unknown[]) => void lines.push(args.map(String).join(" "));
    const spies = [
      vi.spyOn(console, "log").mockImplementation(grab),
      vi.spyOn(console, "warn").mockImplementation(grab),
      vi.spyOn(console, "error").mockImplementation(grab),
    ];
    try {
      vi.stubEnv("BILLING_GATE_ENABLED", "true");
      for (const p of US_CONSULATE_POSTS) {
        await getForm("national-visa", undefined, p.id);
        await LIST(req(`/api/forms?consulate=${p.id}`));
      }
      await getForm("national-visa", undefined, "rome");
      db = makeDb(seed({ source: sourceRow({ needs_review: true }) }));
      await getForm("national-visa", undefined, "boston");
    } finally {
      for (const sp of spies) sp.mockRestore();
    }
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toMatch(/consulate|postId/i);
      for (const p of US_CONSULATE_POSTS) expect(line).not.toContain(`"${p.id}"`);
      expect(line).not.toContain('"rome"');
    }
  });

  it("variant scope: only prefillPosts get the PDF (Cap review item 1)", async () => {
    const list = await (await LIST(req("/api/forms?consulate=new-york"))).json();
    expect(list.forms[0].variant.prefillPosts).toEqual(["new-york"]);
    expect(list.forms[0].variant.templateScope).toBe(list.forms[0].scope);
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
      url: "https://nomade.example.test/forms/formulario_nazionale_visti2.pdf",
      path: "/forms/formulario_nazionale_visti2.pdf",
      sha256: NATIONAL_VISA_TEMPLATE.sha256,
      hasAcroForm: false,
      pages: 4,
    });
    expect(b.fields).toHaveLength(37);
    expect(b.fields).toEqual(JSON.parse(JSON.stringify(NATIONAL_VISA_FIELDS)));
    expect(b.prefill).toEqual({ available: true, reason: null, staleNotice: null });
    expect(b.variant).toEqual({ postId: "new-york", templateScope: "US-consulate:new-york", prefillPosts: ["new-york"], matchesConsulate: true, label: null });
    expect(b.consulate).toEqual({
      postId: "new-york",
      officialUrl: "https://consnewyork.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/",
      host: "consnewyork.esteri.it",
    });
    expect(b.copy).toEqual({
      nameCheck: FORMS_NAME_CHECK_NOTE,
      arrivalReminder: "Your target arrival: <month>. Enter the exact date.",
      arrivalMonthPlaceholder: "<month>",
    });
    expect(b.references["F-NY"].url).toBe(NY_PDF);
    expect(b.access).toBe("free");
    expect(b.entitlement).toEqual({ journeyFull: false, gateEnabled: false });
  });

  it("gate on + no journey_full → access paid: only the free card, disclaimer and sources (B1)", async () => {
    vi.stubEnv("BILLING_GATE_ENABLED", "true");
    const b = await (await getForm()).json();
    expect(b.access).toBe("paid");
    expect(b.entitlement).toEqual({ journeyFull: false, gateEnabled: true });
    // Free: official document card, citations, disclaimer, the "What this is (and isn't)" intro.
    expect(b.source).toMatchObject({
      publisher: "Consolato Generale d'Italia a New York (MAECI)",
      url: NY_PDF,
      versionDate: null,
      retrievedAt: "2026-10-18",
    });
    expect(b.references["F-NY"].url).toBe(NY_PDF);
    expect(b.disclaimer).toBe("Preliminary guidance — not legal advice");
    expect(b.intro).toEqual({ title: NATIONAL_VISA_INTRO.title, text: NATIONAL_VISA_INTRO.text });
    // Pro: walkthrough, translation, markers, stamps, prefill, template, cover-page copy.
    expect(b.fields).toEqual([]);
    expect(b.sections).toEqual([]);
    expect(b.stamps).toBeNull();
    expect(b.translationLabel).toBeNull();
    expect(b.lockSentence).toBeNull();
    expect(b.template).toBeNull();
    expect(b.copy).toBeNull();
    expect(b.prefill).toEqual({ available: false, reason: "paid", staleNotice: null });
    const list = await (await LIST(req("/api/forms?consulate=new-york"))).json();
    expect(list.forms[0].access).toBe("paid");
  });

  /** Every walkthrough string in national-visa.ts, as it appears inside JSON. */
  const walkthroughStrings = (): string[] => {
    const raw: string[] = [
      ...NATIONAL_VISA_FIELDS.flatMap((f) => [f.labelIt, f.labelEn, f.asks, f.markerReason]),
      ...NATIONAL_VISA_SECTIONS.map((s) => s.text),
      NATIONAL_VISA_STAMPS.title,
      ...NATIONAL_VISA_STAMPS.items,
      NATIONAL_VISA_INTRO.labelsNote,
      NATIONAL_VISA_INTRO.translationNote,
      FORMS_TRANSLATION_LABEL,
      FORMS_LOCK_SENTENCE,
      FORMS_NAME_CHECK_NOTE,
      FORMS_ARRIVAL_REMINDER,
    ];
    return [...new Set(raw.filter((s) => s && s.trim() !== ""))].map((s) => JSON.stringify(s).slice(1, -1));
  };

  it.each(["new-york", "chicago", null])(
    "paid access (consulate %s): detail and list contain no walkthrough string (B1)",
    async (postId) => {
      vi.stubEnv("BILLING_GATE_ENABLED", "true");
      const strings = walkthroughStrings();
      expect(strings.length).toBeGreaterThan(37 * 2);
      const res = await getForm("national-visa", undefined, postId);
      expect(res.status).toBe(200);
      const detail = await res.text();
      const list = await (await LIST(req(postId ? `/api/forms?consulate=${postId}` : "/api/forms"))).text();
      for (const text of [detail, list]) {
        for (const s of strings) expect(text, s).not.toContain(s);
        expect(text).not.toContain('"fieldId"');
        expect(text).not.toContain('"marker"');
        expect(text).not.toContain(NATIONAL_VISA_TEMPLATE.path);
      }
      const b = JSON.parse(detail);
      expect(b.template).toBeNull();
      expect(b.access).toBe("paid");
      expect(b.disclaimer).toBe("Preliminary guidance — not legal advice");
      if (postId === "new-york") {
        expect(b.source.url).toBe(NY_PDF);
        expect(b.variant.label).toBeNull();
      } else {
        // Non-NY users are gated the same way and still never get the NY card or PDF.
        expect(b.source).toBeNull();
        expect(b.variant.label).toBe("Based on the New York version of the form");
        expect(b.consulate?.postId ?? null).toBe(postId);
        expect(b.prefill.reason).toBe("consulate");
        expect(detail).not.toContain("formulario_nazionale_visti2.pdf");
      }
      // The same request with journey_full serves the walkthrough (the check above is meaningful).
      db = makeDb(seed({ entitlement: "active" }));
      const full = await (await getForm("national-visa", undefined, postId)).text();
      expect(full).toContain(strings[0]);
    },
  );

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
    // Fails closed: no walkthrough while the entitlement can't be read.
    expect(b.fields).toEqual([]);
    expect(b.template).toBeNull();
  });

  it("needs_review → prefill hidden with the stale notice", async () => {
    db = makeDb(seed({ source: sourceRow({ needs_review: true }) }));
    const b = await (await getForm()).json();
    expect(b.source.needsReview).toBe(true);
    expect(b.prefill).toEqual({ available: false, reason: "needs_review", staleNotice: FORMS_STALE_NOTICE });
    expect(b.prefill.staleNotice).toBe("This form may have changed — check the official link");
    const list = await (await LIST(req("/api/forms?consulate=new-york"))).json();
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

  it.each(["new-york", "chicago", null])(
    "served display text has no internal ids or notes (consulate %s); stepId stays a structured field",
    async (postId) => {
      for (const gate of ["false", "true"]) {
        vi.stubEnv("BILLING_GATE_ENABLED", gate);
        const detail = await (await getForm("national-visa", undefined, postId)).json();
        const list = await (await LIST(req(postId ? `/api/forms?consulate=${postId}` : "/api/forms"))).json();
        expect(detail.stepId).toBe("submit-application");
        expect(list.forms[0].stepId).toBe("submit-application");
        // Drop the structured `stepId` key; everything else is display text or data.
        const withoutStepId = (v: unknown) => JSON.stringify(v, (k, x) => (k === "stepId" ? undefined : x));
        for (const text of [withoutStepId(detail), withoutStepId(list)]) {
          expect(text).not.toMatch(/active row|visa-form-source\.csv|submit-application|`[^`]*`/);
        }
      }
    },
  );

  it("accepts no input and returns no personal data fields", async () => {
    const text = await (await getForm()).text();
    expect(text).not.toMatch(/"(passport|birthDate|address|name|givenName|familyName)"\s*:/);
  });

  describe("consulate variants (Cap, 18 Oct)", () => {
    const others = US_CONSULATE_POSTS.filter((p) => p.id !== "new-york");

    it.each(others.map((p) => [p.id, p.instructionUrl]))(
      "%s: walkthrough labelled NY version, own consulate link, no NY PDF anywhere",
      async (postId, url) => {
        vi.stubEnv("BILLING_GATE_ENABLED", "true");
        db = makeDb(seed({ entitlement: "active" }));
        const res = await getForm("national-visa", undefined, postId);
        expect(res.status).toBe(200);
        const text = await res.clone().text();
        const b = await res.json();
        expect(b.variant).toEqual({
          postId: "new-york",
          templateScope: "US-consulate:new-york",
          prefillPosts: ["new-york"],
          matchesConsulate: false,
          label: "Based on the New York version of the form",
        });
        expect(b.consulate).toEqual({ postId, officialUrl: url, host: new URL(url).hostname.replace(/^www\./, "") });
        expect(b.template).toBeNull();
        expect(b.source).toBeNull();
        expect(b.prefill).toEqual({ available: false, reason: "consulate", staleNotice: null });
        expect(b.fields).toHaveLength(37);
        for (const f of b.fields) {
          expect(f.prefill).toBeNull();
          expect(f.prefillPart).toBeNull();
          expect(f.anchor).toBeNull();
        }
        expect(b.fields[28].reminder).toBe("arrivalMonth");
        expect(b.references["F-NY"].url).toBeNull();
        // Never serve the NY-headed PDF or the template to another post.
        expect(text).not.toContain("formulario_nazionale_visti2.pdf");
        expect(text).not.toContain(NATIONAL_VISA_TEMPLATE.sha256);
        expect(text).toContain(b.fields[0].asks.replace(/"/g, '\\"'));
      },
    );

    it("no consulate param → unknown: label shown, consulate null, no PDF", async () => {
      const b = await (await getForm("national-visa", undefined, null)).json();
      expect(b.variant.label).toBe("Based on the New York version of the form");
      expect(b.consulate).toBeNull();
      expect(b.template).toBeNull();
      expect(b.source).toBeNull();
      expect(b.prefill.reason).toBe("consulate");
      const list = await (await LIST(req("/api/forms"))).json();
      expect(list.forms[0]).toMatchObject({ available: true, pdfAvailable: false, variant: { matchesConsulate: false } });
    });

    it("needs_review on a non-NY post: no stale notice (no PDF offered anyway)", async () => {
      db = makeDb(seed({ source: sourceRow({ needs_review: true }) }));
      const b = await (await getForm("national-visa", undefined, "boston")).json();
      expect(b.prefill).toEqual({ available: false, reason: "consulate", staleNotice: null });
    });

    it("unknown consulate id → 400 BAD_REQUEST (list and detail)", async () => {
      const res = await getForm("national-visa", undefined, "rome");
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("BAD_REQUEST");
      expect((await LIST(req("/api/forms?consulate=NEW-YORK"))).status).toBe(400);
    });

    it("list for a non-NY post: available, pdfAvailable false, labelled", async () => {
      const list = await (await LIST(req("/api/forms?consulate=chicago"))).json();
      expect(list.forms[0]).toMatchObject({
        available: true,
        pdfAvailable: false,
        variant: { postId: "new-york", matchesConsulate: false, label: "Based on the New York version of the form" },
      });
    });
  });
});
