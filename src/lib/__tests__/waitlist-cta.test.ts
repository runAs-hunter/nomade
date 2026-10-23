import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const insertMock = vi.fn();
const fromMock = vi.fn((_table: string) => ({ insert: insertMock }));
const schemaMock = vi.fn((_schema: string) => ({ from: fromMock }));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ schema: schemaMock }),
}));

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { POST as signup } from "@/app/api/waitlist/route";
import { POST as tap } from "@/app/api/waitlist/cta-tap/route";
import { GET as sample } from "@/app/api/waitlist/sample/[source]/[asset]/route";
import { resetServerEnvCache } from "@/lib/env";
import {
  CTA_COPY,
  CTA_DISCLAIMER,
  CTA_SAMPLES,
  ctaCardId,
  ctaSampleAssetUrl,
  parseCtaSource,
} from "@/lib/waitlist/cta";
import {
  SAMPLE_ACCESS_MAX_AGE_SECONDS,
  sampleAccessCookieName,
  signSampleAccess,
  verifySampleAccess,
} from "@/lib/waitlist/sample-access";

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bgdrzdlenmwbpalnjiqg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};
const SECRET = ENV.SUPABASE_SERVICE_ROLE_KEY;

const NO_ATTRIBUTION = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  referrer_host: null,
};

function postJson(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("CTA copy (0.5, locked)", () => {
  it("matches the approved copy with Cap's overrides", () => {
    expect(CTA_COPY.sectionHeading).toBe("Two things we're building next");
    expect(CTA_COPY.cards.forms_prefill).toEqual({
      title: "Your visa form, field by field",
      body: "The Italian national visa application, with a walkthrough of what each field asks for and an English translation for understanding only. You fill it in yourself; Nomade explains each field and links the official form.",
      button: "Get my visa form walkthrough, field by field (Pro)",
      smallPrint: "Coming to Nomade Pro. Join the waitlist to see a sample.",
    });
    expect(CTA_COPY.cards.appointment_packet).toEqual({
      title: "Appointment-day packet",
      body: "Your documents in the order your consulate lists them, with a cover sheet for the fee, payment method and copies to bring. Starting with the Consulate General of Italy in New York.",
      button: "Get my appointment packet",
      smallPrint: "Coming to Nomade Pro. Join the waitlist to see a sample.",
    });
    expect(CTA_COPY.underCards).toBe(
      "Nomade explains what each form asks for. It never tells you what to answer.",
    );
    expect(CTA_COPY.signup.headings).toEqual({
      forms_prefill: "Get early access to the field-by-field form guide",
      appointment_packet: "Get early access to the appointment packet",
    });
    expect(CTA_COPY.signup.emailLabel).toBe("Email");
    expect(CTA_COPY.signup.button).toBe("Join the waitlist");
    expect(CTA_COPY.signup.microcopy).toBe(
      "We'll email you when it's ready. No spam, no payment now.",
    );
    expect(CTA_COPY.thanks.heading).toBe("You're on the list.");
    expect(CTA_COPY.thanks.sample.appointment_packet).toBe(
      "Here's a sample New York appointment packet.",
    );
    expect(CTA_COPY.thanks.sample.forms_prefill).toBe(
      "Here's a sample for a fictional applicant, Jane Sample: the official New York national visa application with only the name fields filled (1, Cognome, and 3, Nome/i), a reminder next to field 29, and a page explaining the sample. Every other field is filled in by hand. The field-by-field walkthrough and English translation are on the forms page.",
    );
    expect(CTA_COPY.thanks.underSample).toBe(
      "This is a sample, not your form. Only the Italian original can be submitted.",
    );
    expect(CTA_COPY.thanks.secondary).toBe(
      "Want to help shape it? Reply to your confirmation email and tell us your consulate and appointment date.",
    );
  });

  it("keeps the disclaimer byte-exact (U+2014)", () => {
    expect(CTA_DISCLAIMER).toBe("Preliminary guidance \u2014 not legal advice");
    expect(Buffer.from(CTA_COPY.disclaimer).toString("hex")).toBe(
      Buffer.from("Preliminary guidance — not legal advice").toString("hex"),
    );
    expect(CTA_COPY.thanks.disclaimer).toBe(CTA_DISCLAIMER);
  });

  it("drops the 'Fill out...' button and has no price, checkout or App Store link", () => {
    const files = [
      "src/lib/waitlist/cta.ts",
      "src/components/WaitlistCtaCards.tsx",
      "src/app/waitlist/thanks/page.tsx",
    ].map((f) => readFileSync(path.join(process.cwd(), f), "utf8"));
    for (const src of files) {
      expect(src).not.toMatch(/Fill out my visa form/);
      expect(src).not.toMatch(/apps\.apple\.com|itms-apps:|\/checkout|stripe/i);
    }
    const shown = JSON.stringify(CTA_COPY);
    expect(shown).not.toMatch(/[$€£]/);
    expect(shown).not.toMatch(/checkout|App Store|price|\bbuy\b/i);
  });

  it("parses only the two CTA sources", () => {
    expect(parseCtaSource("forms_prefill")).toBe("forms_prefill");
    expect(parseCtaSource("appointment_packet")).toBe("appointment_packet");
    expect(parseCtaSource("FORMS_PREFILL")).toBeNull();
    expect(parseCtaSource("waitlist")).toBeNull();
    expect(parseCtaSource(undefined)).toBeNull();
    expect(parseCtaSource(["forms_prefill"])).toBeNull();
    expect(ctaCardId("appointment_packet")).toBe("cta-appointment_packet");
  });

  it("homepage renders the CTA section and keeps the main form", () => {
    const page = readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(page).toMatch(/<WaitlistForm \/>/);
    expect(page).toMatch(/<WaitlistCtaCards/);
  });
});

describe("sample access cookie", () => {
  it("verifies its own signature per source and expires", () => {
    const now = 1_800_000_000;
    const v = signSampleAccess(SECRET, "forms_prefill", now);
    expect(verifySampleAccess(SECRET, "forms_prefill", v, now)).toBe(true);
    expect(verifySampleAccess(SECRET, "appointment_packet", v, now)).toBe(false);
    expect(verifySampleAccess("other-secret", "forms_prefill", v, now)).toBe(false);
    expect(
      verifySampleAccess(SECRET, "forms_prefill", v, now + SAMPLE_ACCESS_MAX_AGE_SECONDS),
    ).toBe(false);
    expect(verifySampleAccess(SECRET, "forms_prefill", "", now)).toBe(false);
    expect(verifySampleAccess(SECRET, "forms_prefill", "9999999999.abc", now)).toBe(false);
    const [exp, mac] = v.split(".");
    expect(verifySampleAccess(SECRET, "forms_prefill", `${Number(exp) + 1}.${mac}`, now)).toBe(
      false,
    );
  });

  it("does not contain the secret", () => {
    const v = signSampleAccess(SECRET, "forms_prefill");
    expect(v).not.toContain(SECRET.slice(0, 20));
  });
});

describe("routes", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    insertMock.mockReset();
    fromMock.mockClear();
    schemaMock.mockClear();
    insertMock.mockResolvedValue({ error: null });
    cookieJar.clear();
    Object.assign(process.env, ENV);
  });

  afterEach(() => {
    resetServerEnvCache();
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    Object.assign(process.env, prev);
  });

  describe("POST /api/waitlist signup_source", () => {
    it("main form: no signup_source column value and no sample cookie (unchanged default)", async () => {
      const res = await signup(postJson("http://localhost/api/waitlist", { email: "a@example.com" }));
      expect(res.status).toBe(200);
      expect(insertMock).toHaveBeenCalledWith({ email: "a@example.com", ...NO_ATTRIBUTION });
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("stores signup_source + all four UTMs and sets the signed sample cookie", async () => {
      const res = await signup(
        postJson("http://localhost/api/waitlist", {
          email: "a@example.com",
          signup_source: "appointment_packet",
          utm_source: "reddit-italyexpats",
          utm_medium: "post",
          utm_campaign: "f12-phase0",
          utm_content: "appointment_packet",
        }),
      );
      expect(res.status).toBe(200);
      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(insertMock).toHaveBeenCalledWith({
        email: "a@example.com",
        ...NO_ATTRIBUTION,
        utm_source: "reddit-italyexpats",
        utm_medium: "post",
        utm_campaign: "f12-phase0",
        utm_content: "appointment_packet",
        signup_source: "appointment_packet",
      });
      const setCookie = res.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain(`${sampleAccessCookieName("appointment_packet")}=`);
      expect(setCookie.toLowerCase()).toContain("httponly");
      const value = /nomade_wl_sample_appointment_packet=([^;]+)/.exec(setCookie)?.[1];
      expect(verifySampleAccess(SECRET, "appointment_packet", value)).toBe(true);
    });

    it("ignores an unknown signup_source (stored as the main-form default)", async () => {
      const res = await signup(
        postJson("http://localhost/api/waitlist", { email: "a@example.com", signup_source: "pro" }),
      );
      expect(res.status).toBe(200);
      expect(insertMock).toHaveBeenCalledWith({ email: "a@example.com", ...NO_ATTRIBUTION });
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("retries without signup_source when the column is missing (migration not applied)", async () => {
      insertMock
        .mockResolvedValueOnce({ error: { code: "PGRST204", message: "column not found" } })
        .mockResolvedValueOnce({ error: null });
      const res = await signup(
        postJson("http://localhost/api/waitlist", {
          email: "a@example.com",
          signup_source: "forms_prefill",
          utm_medium: "post",
        }),
      );
      expect(res.status).toBe(200);
      expect(insertMock).toHaveBeenCalledTimes(2);
      expect(insertMock).toHaveBeenLastCalledWith({
        email: "a@example.com",
        ...NO_ATTRIBUTION,
        utm_medium: "post",
      });
      expect(res.headers.get("set-cookie") ?? "").toContain(
        sampleAccessCookieName("forms_prefill"),
      );
    });

    it("a duplicate CTA signup still unlocks the sample", async () => {
      insertMock.mockResolvedValueOnce({ error: { code: "23505" } });
      const res = await signup(
        postJson("http://localhost/api/waitlist", {
          email: "a@example.com",
          signup_source: "forms_prefill",
        }),
      );
      expect(res.status).toBe(200);
      expect(insertMock).toHaveBeenCalledTimes(1);
      expect(res.headers.get("set-cookie") ?? "").toContain(
        sampleAccessCookieName("forms_prefill"),
      );
    });

    it("no cookie when the signup fails", async () => {
      insertMock.mockResolvedValue({ error: { code: "XX000" } });
      const res = await signup(
        postJson("http://localhost/api/waitlist", {
          email: "a@example.com",
          signup_source: "forms_prefill",
        }),
      );
      expect(res.status).toBe(500);
      expect(res.headers.get("set-cookie")).toBeNull();
    });
  });

  describe("POST /api/waitlist/cta-tap", () => {
    it("counts a tap with sanitized UTMs (no referrer, no email)", async () => {
      const res = await tap(
        postJson("http://localhost/api/waitlist/cta-tap", {
          cta: "forms_prefill",
          utm_source: "Reddit-ItalyExpats",
          utm_medium: "post",
          utm_campaign: "f12-phase0",
          utm_content: "bad value!",
          referrer_host: "example.com",
          email: "a@example.com",
        }),
      );
      expect(res.status).toBe(204);
      expect(fromMock).toHaveBeenCalledWith("waitlist_cta_taps");
      expect(insertMock).toHaveBeenCalledWith({
        cta: "forms_prefill",
        utm_source: "reddit-italyexpats",
        utm_medium: "post",
        utm_campaign: "f12-phase0",
        utm_content: null,
      });
    });

    it("still 204 when the table is missing", async () => {
      insertMock.mockResolvedValue({ error: { code: "42P01" } });
      const res = await tap(
        postJson("http://localhost/api/waitlist/cta-tap", { cta: "appointment_packet" }),
      );
      expect(res.status).toBe(204);
    });

    it("rejects an unknown cta without writing", async () => {
      const res = await tap(postJson("http://localhost/api/waitlist/cta-tap", { cta: "x" }));
      expect(res.status).toBe(400);
      expect(insertMock).not.toHaveBeenCalled();
    });

    it("never writes to nomade-prod", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://whjzynfsifrtrxlylrww.supabase.co";
      const res = await tap(
        postJson("http://localhost/api/waitlist/cta-tap", { cta: "forms_prefill" }),
      );
      expect(res.status).toBe(204);
      expect(insertMock).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/waitlist/sample", () => {
    const call = (source: string, asset: string) =>
      sample(new Request(`http://localhost${ctaSampleAssetUrl("forms_prefill", asset)}`), {
        params: Promise.resolve({ source, asset }),
      });

    it("403 without the signup cookie", async () => {
      const res = await call("forms_prefill", CTA_SAMPLES.forms_prefill.pdf);
      expect(res.status).toBe(403);
    });

    it("403 with the other source's cookie", async () => {
      cookieJar.set(
        sampleAccessCookieName("forms_prefill"),
        signSampleAccess(SECRET, "appointment_packet"),
      );
      const res = await call("forms_prefill", CTA_SAMPLES.forms_prefill.pdf);
      expect(res.status).toBe(403);
    });

    it("404 for an unknown source or an asset outside the allow-list", async () => {
      cookieJar.set(sampleAccessCookieName("forms_prefill"), signSampleAccess(SECRET, "forms_prefill"));
      expect((await call("nope", CTA_SAMPLES.forms_prefill.pdf)).status).toBe(404);
      expect((await call("forms_prefill", "../../package.json")).status).toBe(404);
      expect((await call("forms_prefill", CTA_SAMPLES.appointment_packet.pdf)).status).toBe(404);
    });

    it("with a valid cookie serves the file privately (or 404 if not shipped)", async () => {
      cookieJar.set(sampleAccessCookieName("forms_prefill"), signSampleAccess(SECRET, "forms_prefill"));
      const res = await call("forms_prefill", CTA_SAMPLES.forms_prefill.pdf);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.headers.get("content-type")).toBe("application/pdf");
        expect(res.headers.get("cache-control")).toBe("private, no-store");
      }
    });
  });
});
