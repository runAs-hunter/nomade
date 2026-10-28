import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const insertMock = vi.fn();
const fromMock = vi.fn(() => ({ insert: insertMock }));
const schemaMock = vi.fn(() => ({ from: fromMock }));
const createServiceClientMock = vi.fn(() => ({
  schema: schemaMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => createServiceClientMock(),
}));

import { POST } from "@/app/api/waitlist/route";
import { resetServerEnvCache } from "@/lib/env";
import {
  HONEYPOT_FIELD,
  isHoneypotFilled,
  LEGACY_HONEYPOT_FIELD,
} from "@/lib/waitlist/fake-door";

const DEV_URL = "https://bgdrzdlenmwbpalnjiqg.supabase.co";
const PROD_URL = "https://whjzynfsifrtrxlylrww.supabase.co";

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: DEV_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

const NO_ATTRIBUTION = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  referrer_host: null,
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/waitlist (fake-door fields)", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    insertMock.mockReset();
    fromMock.mockClear();
    schemaMock.mockClear();
    createServiceClientMock.mockClear();
    insertMock.mockResolvedValue({ error: null });
    process.env.NEXT_PUBLIC_SUPABASE_URL = VALID.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = VALID.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = VALID.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    resetServerEnvCache();
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    Object.assign(process.env, prev);
  });

  const LANDING = {
    email: "Ada@Example.com",
    tier: "pathpack_79",
    path: "digital_nomad",
    move_date: "6–12 months",
    source: "nomadevisa_landing",
    hp_x7: "",
    ts: "2026-10-12T09:00:00.000Z",
    utm_source: "x",
  };
  const MISSING_COL = { error: { code: "PGRST204", message: "Could not find the 'tier' column" } };

  it("stores the fake-door fields when the columns exist", async () => {
    const res = await POST(post(LANDING));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      ...NO_ATTRIBUTION,
      utm_source: "x",
      tier: "pathpack_79",
      path: "digital_nomad",
      move_date: "6–12 months",
      source: "nomadevisa_landing",
    });
  });

  it("without the migration: falls back to attribution only, still success", async () => {
    insertMock.mockResolvedValueOnce(MISSING_COL).mockResolvedValue({ error: null });
    const res = await POST(post(LANDING));
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(insertMock).toHaveBeenLastCalledWith({ email: "ada@example.com", ...NO_ATTRIBUTION, utm_source: "x" });
  });

  it("falls back to email only when both optional inserts fail", async () => {
    insertMock.mockResolvedValueOnce(MISSING_COL).mockResolvedValueOnce(MISSING_COL).mockResolvedValue({ error: null });
    const res = await POST(post(LANDING));
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(3);
    expect(insertMock).toHaveBeenLastCalledWith({ email: "ada@example.com" });
  });

  it("never reports success when every insert fails", async () => {
    insertMock.mockResolvedValue({ error: { code: "XX000", message: "down" } });
    const res = await POST(post(LANDING));
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });

  it("drops unknown tier/path/move_date/source values", async () => {
    await POST(post({ email: "a@b.co", tier: "gold", path: "x", move_date: "<script>", source: "evil" }));
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({ email: "a@b.co", ...NO_ATTRIBUTION });
  });

  it("honeypot (hp_x7 filled): fake success, no insert", async () => {
    const res = await POST(post({ ...LANDING, hp_x7: "Acme" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("legacy honeypot (company filled, cached old page): fake success, no insert", async () => {
    const { hp_x7: _omit, ...oldPage } = LANDING;
    void _omit;
    const res = await POST(post({ ...oldPage, company: "Acme" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("empty or whitespace honeypots (new and legacy) store the signup", async () => {
    const res = await POST(post({ ...LANDING, hp_x7: "  ", company: "" }));
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("old page with an empty legacy company field still stores the signup", async () => {
    const { hp_x7: _omit, ...oldPage } = LANDING;
    void _omit;
    const res = await POST(post({ ...oldPage, company: "" }));
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("still refuses nomade-prod with fake-door fields", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROD_URL;
    const res = await POST(post(LANDING));
    expect(res.status).toBe(503);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("nomadevisa.com landing (public/landing)", () => {
  const html = readFileSync(path.join(process.cwd(), "public/landing/index.html"), "utf8");
  const js = readFileSync(path.join(process.cwd(), "public/landing/js/main.js"), "utf8");

  it("has the locked disclaimer prefix with U+2014", () => {
    expect(html).toContain("Preliminary guidance \u2014 not legal advice");
  });
  it("drops outcome promises and implied stats", () => {
    for (const bad of ["APPROVED", "Visa approved", "Most chosen", "booked", "Track to approval"]) {
      expect(html).not.toContain(bad);
    }
    expect(html).toContain("Ready for your consulate appointment");
    expect(html).toContain("Most complete");
    expect(html).toContain("ENTRATA");
  });
  it("posts to same-origin /api/waitlist, checks ok, has a honeypot", () => {
    expect(js).toContain("FORM_ENDPOINT: '/api/waitlist'");
    expect(js).toContain("j.ok !== true");
    expect(html).toContain('name="hp_x7"');
  });
  it("honeypot is autofill-proof: non-semantic name, off-screen, not type=hidden, no label", () => {
    expect(html).not.toContain('name="company"');
    const tag = html.match(/<input[^>]*name="hp_x7"[^>]*>/)?.[0] ?? "";
    expect(tag).toContain('type="text"');
    expect(tag).toContain('id="hp_x7"');
    expect(tag).toContain('autocomplete="off"');
    expect(tag).toContain('tabindex="-1"');
    expect(tag).toContain('aria-hidden="true"');
    expect(tag).not.toMatch(/aria-label|placeholder/);
    // Off-screen, inert wrapper: never focusable (dialog initial focus would
    // otherwise land on it as the first control), still submitted by FormData.
    const wrap = html.match(/<div inert[^>]*class="hp"[^>]*>\s*<input[^>]*name="hp_x7"/)?.[0] ?? "";
    expect(wrap).toContain("left:-9999px");
    expect(wrap).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<label[^>]*for="hp_x7"/);
    // Chrome infers a label from neighbouring text; placed after the email
    // field it picked up "We only use your email" and predicted EMAIL_ADDRESS.
    // As the first control in the form it has no semantic neighbours.
    expect(html.indexOf('name="hp_x7"')).toBeGreaterThan(html.indexOf('<form id="reserve"'));
    expect(html.indexOf('name="hp_x7"')).toBeLessThan(html.indexOf('name="email"'));
  });
  it("self-hosts fonts and GSAP and sets canonical", () => {
    expect(html).not.toMatch(/fonts\.googleapis|jsdelivr/);
    expect(html).toContain('<link rel="canonical" href="https://nomadevisa.com/">');
  });
  it("tracks the fake-door events", () => {
    for (const e of ["hero_step", "tier_click", "reserve_submit", "reserve_error", "faq_open"]) {
      expect(js).toContain(`'${e}'`);
    }
  });
});

describe("isHoneypotFilled", () => {
  it("flags the new and the legacy field names", () => {
    expect(isHoneypotFilled({ [HONEYPOT_FIELD]: "x" })).toBe(true);
    expect(isHoneypotFilled({ [LEGACY_HONEYPOT_FIELD]: "x" })).toBe(true);
    expect(isHoneypotFilled({ [HONEYPOT_FIELD]: "", [LEGACY_HONEYPOT_FIELD]: "x" })).toBe(true);
  });
  it("treats empty, whitespace, missing and non-string values as human", () => {
    expect(isHoneypotFilled({})).toBe(false);
    expect(isHoneypotFilled({ [HONEYPOT_FIELD]: "", [LEGACY_HONEYPOT_FIELD]: "" })).toBe(false);
    expect(isHoneypotFilled({ [HONEYPOT_FIELD]: "   " })).toBe(false);
    expect(isHoneypotFilled({ [HONEYPOT_FIELD]: 1, [LEGACY_HONEYPOT_FIELD]: null })).toBe(false);
    expect(isHoneypotFilled(null)).toBe(false);
    expect(isHoneypotFilled("hp_x7")).toBe(false);
  });
});
