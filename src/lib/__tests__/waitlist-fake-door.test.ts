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
    company: "",
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

  it("honeypot: fake success, no insert", async () => {
    const res = await POST(post({ ...LANDING, company: "Acme" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(insertMock).not.toHaveBeenCalled();
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
    expect(html).toContain('name="company"');
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
