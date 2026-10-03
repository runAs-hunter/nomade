import { describe, it, expect } from "vitest";
import {
  JOURNEY_CATALOG_VERSION,
  JOURNEY_DISCLAIMER,
  computeProgress,
  getPathDef,
  getStepDef,
  isJourneyStepStatus,
  listJourneyPaths,
  listStepDefsForPath,
} from "@/lib/journey/catalog";
import {
  US_VISA_BOOKING_URL,
  listUsConsulatePosts,
  resolveUsConsulatePost,
} from "@/lib/journey/consulates";

const F3_IDS = [
  "passport",
  "proof-of-income",
  "health-insurance",
  "accommodation",
  "criminal-record",
  "cover-letter",
  "financial-statements",
  "consulate-appointment",
  "submit-application",
  "visa-fee",
  "permesso-soggiorno",
  "codice-fiscale",
  "anagrafe",
] as const;

const STUB_PHRASES = [
  "6–8 weeks",
  "Sportello Amico",
  "Usually same-day",
  "€28,000+/yr",
  "minimum 1–3 months",
];

const EMPLOYMENT_CONTRACT_DETAIL =
  "Remote workers must present the employment or collaboration contract, or a binding offer, for highly qualified work. The employer or client can sit outside Italy. If that employer or client lives in Italy, the decree also wants a signed declaration of no listed convictions in the last five years, plus a copy of the signer\u2019s ID.";

describe("journey catalog", () => {
  it("lists both Italy paths with exact titles", () => {
    const paths = listJourneyPaths();
    expect(paths.map((p) => p.pathId)).toEqual([
      "italy_digital_nomad",
      "italy_remote_worker",
    ]);
    expect(paths.every((p) => p.available)).toBe(true);
    expect(getPathDef("italy_digital_nomad")?.title).toBe(
      "Italy Digital Nomad Visa",
    );
    expect(getPathDef("italy_remote_worker")?.title).toBe(
      "Italy Remote Worker Visa",
    );
    expect(getPathDef("italy_digital_nomad")?.description).toBe(
      "National visa for non-EU citizens doing highly qualified self-employed remote work. For US applicants.",
    );
  });

  it("keeps F3 ids and splits nomad vs remote-worker extras", () => {
    const nomad = listStepDefsForPath("italy_digital_nomad").map((s) => s.id);
    const remote = listStepDefsForPath("italy_remote_worker").map((s) => s.id);

    for (const id of F3_IDS) {
      expect(nomad).toContain(id);
      expect(remote).toContain(id);
    }
    expect(nomad).toContain("highly-qualified");
    expect(nomad).toContain("prior-experience");
    expect(nomad).toContain("partita-iva");
    expect(nomad).not.toContain("employment-contract");
    expect(nomad).not.toContain("dependent-permesso");

    expect(remote).toContain("highly-qualified");
    expect(remote).toContain("prior-experience");
    expect(remote).toContain("employment-contract");
    expect(remote).not.toContain("partita-iva");

    expect(nomad).toEqual([
      "passport",
      "highly-qualified",
      "prior-experience",
      "proof-of-income",
      "financial-statements",
      "health-insurance",
      "accommodation",
      "criminal-record",
      "cover-letter",
      "consulate-appointment",
      "submit-application",
      "visa-fee",
      "permesso-soggiorno",
      "codice-fiscale",
      "anagrafe",
      "partita-iva",
    ]);
    expect(remote).toEqual([
      "passport",
      "highly-qualified",
      "prior-experience",
      "proof-of-income",
      "financial-statements",
      "health-insurance",
      "accommodation",
      "criminal-record",
      "cover-letter",
      "employment-contract",
      "consulate-appointment",
      "submit-application",
      "visa-fee",
      "permesso-soggiorno",
      "codice-fiscale",
      "anagrafe",
    ]);
  });

  it("uses the visa ops version and the exact disclaimer", () => {
    expect(JOURNEY_CATALOG_VERSION).toBe("visa-ops-italy-dnv-2026-10-03");
    expect(JOURNEY_CATALOG_VERSION).not.toBe("stub-italy-dnv-2026-10-01");
    expect(JOURNEY_DISCLAIMER).toBe(
      "Preliminary guidance \u2014 not legal advice",
    );
  });

  it("keeps proof-of-income copy path-specific", () => {
    const nomad = getStepDef("italy_digital_nomad", "proof-of-income");
    const remote = getStepDef("italy_remote_worker", "proof-of-income");
    expect(nomad?.name).toBe("Lawful income from the remote work");
    expect(remote?.name).toBe("Lawful income from the remote work");
    expect(nomad?.detail).toContain("healthcare ticket");
    expect(nomad?.detail).toContain(
      "Do not treat €24,789 or €28,000 as the law",
    );
    expect(remote?.detail).toContain("ISTAT median");
    expect(remote?.detail).toContain("does not set €33,000");
    expect(remote?.detail).not.toContain("healthcare ticket");
    expect(nomad?.detail).not.toBe(remote?.detail);
  });

  it("uses the approved employment-contract sentence", () => {
    const step = getStepDef("italy_remote_worker", "employment-contract");
    expect(step?.detail).toBe(EMPLOYMENT_CONTRACT_DETAIL);
    expect(step?.detail).toContain("convictions in the last five years");
    expect(step?.detail).toContain("signer\u2019s ID");
  });

  it("drops stub requirement phrasing but keeps the approved warnings", () => {
    const details = [
      ...listStepDefsForPath("italy_digital_nomad"),
      ...listStepDefsForPath("italy_remote_worker"),
    ].map((s) => s.detail);
    for (const detail of details) {
      for (const phrase of STUB_PHRASES) {
        expect(detail).not.toContain(phrase);
      }
    }
    const passport = getStepDef("italy_digital_nomad", "passport")?.detail ?? "";
    expect(passport).toContain("six-month rule");
    const fee = getStepDef("italy_digital_nomad", "visa-fee")?.detail ?? "";
    expect(fee).toContain("€116");
    const income = getStepDef("italy_digital_nomad", "proof-of-income")?.detail ?? "";
    expect(income).toContain("€28,000");
  });

  it("validates status enum and computes progress", () => {
    expect(isJourneyStepStatus("not_started")).toBe(true);
    expect(isJourneyStepStatus("in_progress")).toBe(true);
    expect(isJourneyStepStatus("done")).toBe(true);
    expect(isJourneyStepStatus("completed")).toBe(false);
    expect(computeProgress(["done", "in_progress", "not_started", "done"])).toEqual({
      done: 2,
      total: 4,
      fraction: 0.5,
    });
    expect(getStepDef("italy_digital_nomad", "passport")?.name).toMatch(/passport/i);
    expect(getStepDef("italy_digital_nomad", "nope")).toBeNull();
  });
});

describe("US consulate map", () => {
  it("lists exactly ten career posts on one booking URL", () => {
    const posts = listUsConsulatePosts();
    expect(posts).toHaveLength(10);
    expect(new Set(posts.map((p) => p.id)).size).toBe(10);
    expect(posts.every((p) => p.bookingUrl === "https://prenotami.esteri.it")).toBe(
      true,
    );
    expect(US_VISA_BOOKING_URL).toBe("https://prenotami.esteri.it");
    const washington = posts.find((p) => p.id === "washington");
    expect(washington?.note).toContain("visti.washington@esteri.it");
    expect(
      posts.some(
        (p) =>
          /honorary/i.test(p.id) ||
          /honorary/i.test(p.jurisdiction) ||
          /honorary/i.test(p.note ?? ""),
      ),
    ).toBe(false);
  });

  it("resolves states and split counties without guessing", () => {
    const postId = (state: string, county?: string) => {
      const hit = resolveUsConsulatePost({ state, county });
      return hit && "postId" in hit ? hit.postId : hit;
    };
    expect(postId("Massachusetts")).toBe("boston");
    expect(postId("Washington")).toBe("san-francisco");
    expect(postId("District of Columbia")).toBe("washington");
    expect(postId("Washington, D.C.")).toBe("washington");
    expect(postId("DC")).toBe("washington");
    expect(postId("Maryland", "Montgomery")).toBe("washington");
    expect(postId("Maryland", "Anne Arundel")).toBe("philadelphia");
    expect(resolveUsConsulatePost({ state: "New Jersey" })).toEqual({
      needsCounty: true,
    });
    expect(postId("New Jersey", "Bergen")).toBe("new-york");
    expect(postId("California", "Los Angeles")).toBe("los-angeles");
    expect(postId("California", "San Francisco")).toBe("san-francisco");
    expect(resolveUsConsulatePost({ state: "Narnia" })).toBeNull();

    const boston = resolveUsConsulatePost({ state: "Massachusetts" });
    expect(boston && "bookingUrl" in boston ? boston.bookingUrl : null).toBe(
      "https://prenotami.esteri.it",
    );
  });
});
