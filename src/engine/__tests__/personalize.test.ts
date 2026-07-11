/**
 * Personalization engine snapshot tests.
 *
 * Tests the 10 profiles spec'd in the eng review:
 *   1. US freelancer solo          (original)
 *   2. US employee solo            (original)
 *   3. EU freelancer solo          (original)
 *   4. non-EU business owner solo  (original)
 *   5. US freelancer with partner  (original)
 *   6. US freelancer with family   (original)
 *   7. US mixed income solo        (tests explicit mixed condition)
 *   8. US freelancer under_28k     (tests disqualification warning trigger)
 *   9. BR employee solo            (non-EU, tests default_detail fallback for unspecific nationality)
 *  10. US freelancer solo          (tests hidden_unless_matched exclusion for solo traveler)
 */

import { describe, it, expect } from "vitest";
import { personalize } from "../personalize";
import type { CountryData, UserProfile } from "@/data/schema";

// ─── Minimal country fixture ───────────────────────────────────────────────
// Uses a subset of the full italy.yaml to keep tests readable.
// Focus: conditions that vary across profiles.

const COUNTRY: CountryData = {
  country: "Italy",
  visa_name: "Digital Nomad Visa (Visto per Nomadi Digitali)",
  emoji: "🇮🇹",
  min_income: 28000,
  duration: "Up to 1 year (renewable)",
  processing_time: "3-6 months",
  last_verified: "2026-03-22",
  sources: ["https://vistoperitalia.esteri.it"],
  phases: [
    {
      name: "Gather Documents",
      tasks: [
        {
          id: "passport",
          name: "Valid passport (6+ months remaining)",
          detail: "Must not expire before your visa end date.",
          universal: true,
        },
        {
          id: "proof-of-income",
          name: "Proof of income",
          default_detail: "Documents proving €28,000+/yr stable income",
          tags: ["personalized"],
          conditions: [
            {
              if: { income_type: "freelancer" },
              detail: "Tax returns + invoices + bank statements (€28K+/yr)",
            },
            {
              if: { income_type: "employee" },
              detail: "Employment contract + last 3 months of pay stubs",
            },
            {
              if: { income_type: "business_owner" },
              detail: "Business registration + financial statements",
            },
            {
              if: { income_type: "mixed" },
              detail: "Tax returns + invoices AND/OR employment contract (provide whichever applies)",
            },
            {
              if: { income_type: "freelancer", nationality_group: "non-EU" },
              detail: "Tax returns + invoices + bank statements (€28K+/yr) + apostille + Italian translation",
            },
          ],
        },
        {
          id: "dependent-permesso",
          name: "Apply for dependent family Permesso di Soggiorno",
          hidden_unless_matched: true,
          tags: ["personalized"],
          conditions: [
            {
              if: { traveling_with: "with_partner" },
              detail: "Your partner needs their own Permesso. Additional income: €8,400/yr per dependent.",
            },
            {
              if: { traveling_with: "with_family" },
              detail: "Each family member needs their own Permesso. Additional income: €8,400/yr per adult + €2,800/yr per child.",
            },
          ],
        },
      ],
    },
  ],
};

// ─── Profile factory ───────────────────────────────────────────────────────

function profile(overrides: Partial<UserProfile>): UserProfile {
  return {
    nationality: "US",
    nationality_group: "non-EU",
    residence: "United States",
    income_type: "freelancer",
    income_range: "50k_to_100k",
    traveling_with: "solo",
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("personalize()", () => {
  // Profile 1: US freelancer solo
  it("profile 1 — US freelancer solo: uses non-EU freelancer condition (most specific)", () => {
    const result = personalize(COUNTRY, profile({ nationality: "US", nationality_group: "non-EU", income_type: "freelancer", traveling_with: "solo" }));
    const incomeTask = result.phases[0].tasks.find((t) => t.id === "proof-of-income");
    expect(incomeTask?.detail).toContain("apostille");
    expect(incomeTask?.isPersonalized).toBe(true);
    // Dependent permesso should be excluded (solo, hidden_unless_matched)
    const dependentTask = result.phases[0].tasks.find((t) => t.id === "dependent-permesso");
    expect(dependentTask).toBeUndefined();
    expect(result.incomeWarning).toBe(false);
  });

  // Profile 2: US employee solo
  it("profile 2 — US employee solo: shows employee-specific income requirement", () => {
    const result = personalize(COUNTRY, profile({ income_type: "employee", traveling_with: "solo" }));
    const incomeTask = result.phases[0].tasks.find((t) => t.id === "proof-of-income");
    expect(incomeTask?.detail).toContain("pay stubs");
    expect(incomeTask?.isPersonalized).toBe(true);
    const dependentTask = result.phases[0].tasks.find((t) => t.id === "dependent-permesso");
    expect(dependentTask).toBeUndefined();
  });

  // Profile 3: EU freelancer solo
  it("profile 3 — EU freelancer solo: uses generic freelancer condition (no apostille)", () => {
    const result = personalize(COUNTRY, profile({ nationality: "DE", nationality_group: "EU", income_type: "freelancer", traveling_with: "solo" }));
    const incomeTask = result.phases[0].tasks.find((t) => t.id === "proof-of-income");
    // Should match { income_type: "freelancer" } but NOT { income_type: "freelancer", nationality_group: "non-EU" }
    expect(incomeTask?.detail).not.toContain("apostille");
    expect(incomeTask?.detail).toContain("€28K");
    expect(incomeTask?.isPersonalized).toBe(true);
  });

  // Profile 4: non-EU business owner solo
  it("profile 4 — non-EU business owner solo: shows business owner income requirement", () => {
    const result = personalize(COUNTRY, profile({ nationality_group: "non-EU", income_type: "business_owner", traveling_with: "solo" }));
    const incomeTask = result.phases[0].tasks.find((t) => t.id === "proof-of-income");
    expect(incomeTask?.detail).toContain("Business registration");
    expect(incomeTask?.isPersonalized).toBe(true);
  });

  // Profile 5: US freelancer with partner
  it("profile 5 — US freelancer with partner: shows dependent partner task", () => {
    const result = personalize(COUNTRY, profile({ income_type: "freelancer", traveling_with: "with_partner" }));
    const dependentTask = result.phases[0].tasks.find((t) => t.id === "dependent-permesso");
    expect(dependentTask).toBeDefined();
    expect(dependentTask?.detail).toContain("€8,400");
    expect(dependentTask?.isPersonalized).toBe(true);
  });

  // Profile 6: US freelancer with family
  it("profile 6 — US freelancer with family: shows dependent family task with child amounts", () => {
    const result = personalize(COUNTRY, profile({ income_type: "freelancer", traveling_with: "with_family" }));
    const dependentTask = result.phases[0].tasks.find((t) => t.id === "dependent-permesso");
    expect(dependentTask).toBeDefined();
    expect(dependentTask?.detail).toContain("€2,800");
    expect(dependentTask?.isPersonalized).toBe(true);
  });

  // Profile 7: US mixed income solo
  it("profile 7 — US mixed income solo: uses explicit mixed condition (no engine auto-merge)", () => {
    const result = personalize(COUNTRY, profile({ income_type: "mixed", traveling_with: "solo" }));
    const incomeTask = result.phases[0].tasks.find((t) => t.id === "proof-of-income");
    expect(incomeTask?.detail).toContain("provide whichever applies");
    expect(incomeTask?.isPersonalized).toBe(true);
  });

  // Profile 8: US freelancer under_28k (disqualification trigger)
  it("profile 8 — US freelancer under_28k: sets incomeWarning flag", () => {
    const result = personalize(COUNTRY, profile({ income_type: "freelancer", income_range: "under_28k" }));
    expect(result.incomeWarning).toBe(true);
    // Checklist is still generated (user keeps agency)
    expect(result.totalTasks).toBeGreaterThan(0);
  });

  // Profile 9: BR employee solo (non-EU, no nationality-specific condition)
  it("profile 9 — BR employee solo: falls back to employee income condition (no BR-specific match)", () => {
    const result = personalize(COUNTRY, profile({ nationality: "BR", nationality_group: "non-EU", income_type: "employee", traveling_with: "solo" }));
    const incomeTask = result.phases[0].tasks.find((t) => t.id === "proof-of-income");
    // { income_type: "employee" } matches — there's no { income_type: "employee", nationality_group: "non-EU" } condition
    expect(incomeTask?.detail).toContain("pay stubs");
    expect(incomeTask?.isPersonalized).toBe(true);
  });

  // Profile 10: US freelancer solo — hidden_unless_matched tasks excluded
  it("profile 10 — solo traveler: hidden_unless_matched dependent task is excluded", () => {
    const result = personalize(COUNTRY, profile({ traveling_with: "solo" }));
    const allTaskIds = result.phases.flatMap((p) => p.tasks.map((t) => t.id));
    expect(allTaskIds).not.toContain("dependent-permesso");
  });

  // ─── Count and structure checks ───────────────────────────────────────────

  it("totalTasks matches the actual tasks rendered", () => {
    const result = personalize(COUNTRY, profile({}));
    const counted = result.phases.reduce((sum, p) => sum + p.tasks.length, 0);
    expect(result.totalTasks).toBe(counted);
  });

  it("universal tasks are always present regardless of profile", () => {
    const profiles: UserProfile[] = [
      profile({ income_type: "freelancer" }),
      profile({ income_type: "employee" }),
      profile({ nationality_group: "EU" }),
    ];
    for (const p of profiles) {
      const result = personalize(COUNTRY, p);
      const passportTask = result.phases[0].tasks.find((t) => t.id === "passport");
      expect(passportTask).toBeDefined();
      expect(passportTask?.isPersonalized).toBe(false);
    }
  });

  it("most specific condition wins over less specific", () => {
    // { income_type: freelancer, nationality_group: non-EU } is more specific than { income_type: freelancer }
    const euResult = personalize(COUNTRY, profile({ nationality_group: "EU", income_type: "freelancer" }));
    const nonEuResult = personalize(COUNTRY, profile({ nationality_group: "non-EU", income_type: "freelancer" }));
    const euTask = euResult.phases[0].tasks.find((t) => t.id === "proof-of-income");
    const nonEuTask = nonEuResult.phases[0].tasks.find((t) => t.id === "proof-of-income");
    expect(nonEuTask?.detail).toContain("apostille");
    expect(euTask?.detail).not.toContain("apostille");
  });
});
