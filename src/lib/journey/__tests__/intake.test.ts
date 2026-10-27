import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JOURNEY_DISCLAIMER,
  listStepDefsForPath,
  type JourneyPathId,
} from "@/lib/journey/catalog";
import { buildChecklistView } from "@/lib/journey/checklist";
import { indexChecklistSources, type ChecklistSourceRow } from "@/lib/journey/checklist-sources";
import {
  CHILDREN_COUNT_MAX,
  INTAKE_KEYS,
  intakeQuestionsPayload,
  INTAKE_QUESTIONS,
  INTAKE_RULES_VERSION,
  applyIntakeRules,
  isIntakeComplete,
  parseIntakeAnswers,
  type IntakeAnswers,
} from "@/lib/journey/intake";
import { INTAKE_FLAG_COPY, INTAKE_NOTE_COPY } from "@/lib/journey/intake-copy";
import { intakeShouldWrite, type IntakeView } from "@/lib/journey/intake-store";

const NOW = new Date("2026-10-16T12:00:00.000Z");
const PATHS: JourneyPathId[] = ["italy_digital_nomad", "italy_remote_worker"];
const journeyCase = {
  caseId: "cccccccc-dddd-eeee-ffff-000000000001",
  userId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  pathId: "italy_digital_nomad",
  countryCode: "IT",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const intake = (answers: IntakeAnswers, completed = true): IntakeView => ({
  answers,
  rulesVersion: INTAKE_RULES_VERSION,
  completedAt: completed ? NOW.toISOString() : null,
  clientUpdatedAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
});

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const migrationSql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");
const SEEDED_IDS = new Set([...migrationSql.matchAll(/\('([a-z0-9][a-z0-9_-]+)', array\[/g)].map((m) => m[1]));

function view(pathId: JourneyPathId, answers: IntakeAnswers | null, extra: Partial<Parameters<typeof buildChecklistView>[0]> = {}) {
  return buildChecklistView({
    journeyCase: { ...journeyCase, pathId },
    pathId,
    states: [],
    intakeEnabled: true,
    intake: answers ? intake(answers) : null,
    now: NOW,
    ...extra,
  });
}
const stepIds = (v: ReturnType<typeof view>) => v.phases.flatMap((p) => p.steps.map((s) => s.id));

describe("F11a intake questions + parsing", () => {
  it("has the 5 questions (fbiCheck dropped) and spouse/children family values", () => {
    expect(INTAKE_KEYS).toEqual(["incomeSource", "incomeThreshold", "housing", "family", "arrivalMonth"]);
    const family = INTAKE_QUESTIONS.find((q) => q.key === "family")!;
    expect(family.options).toEqual(["solo", "spouse", "spouse_children", "children", "unsure"]);
    expect(INTAKE_QUESTIONS.find((q) => q.key === "housing")!.options).toContain("unsure");
    // Nomad is the primary path: self-employed options lead (Studio S1, Isaias approved).
    expect(INTAKE_QUESTIONS.find((q) => q.key === "incomeSource")!.options).toEqual([
      "freelancer", "business_owner", "foreign_employee", "mixed", "unsure",
    ]);
    expect(INTAKE_RULES_VERSION).toBe("f11-rules-2026-10-16");
  });

  it("rejects unknown keys, bad values, partner, fbiCheck", () => {
    expect(parseIntakeAnswers({ nope: "x" }, NOW).ok).toBe(false);
    expect(parseIntakeAnswers({ housing: "hotel" }, NOW).ok).toBe(false);
    expect(parseIntakeAnswers({ family: "partner" }, NOW).ok).toBe(false);
    expect(parseIntakeAnswers({ fbiCheck: "requested" }, NOW).ok).toBe(false);
    expect(parseIntakeAnswers([], NOW).ok).toBe(false);
    expect(parseIntakeAnswers(null, NOW).ok).toBe(false);
  });

  it("arrivalMonth: current month … +24, or null", () => {
    expect(parseIntakeAnswers({ arrivalMonth: "2026-10" }, NOW).ok).toBe(true);
    expect(parseIntakeAnswers({ arrivalMonth: "2028-10" }, NOW).ok).toBe(true);
    expect(parseIntakeAnswers({ arrivalMonth: "2028-11" }, NOW).ok).toBe(false);
    // Past months stay valid (Cap review): only the format and the +24 limit.
    expect(parseIntakeAnswers({ arrivalMonth: "2026-09" }, NOW).ok).toBe(true);
    expect(parseIntakeAnswers({ arrivalMonth: "2020-01" }, NOW).ok).toBe(true);
    expect(parseIntakeAnswers({ arrivalMonth: "2026-13" }, NOW).ok).toBe(false);
    expect(parseIntakeAnswers({ arrivalMonth: null }, NOW).ok).toBe(true);
  });

  it("complete = all 5 keys present; explicit 'Not sure' counts", () => {
    expect(
      isIntakeComplete({ incomeSource: "unsure", incomeThreshold: "unsure", housing: "unsure", family: "unsure", arrivalMonth: null }),
    ).toBe(true);
    expect(isIntakeComplete({ incomeSource: "unsure" })).toBe(false);
    expect(
      isIntakeComplete({ incomeSource: "unsure", incomeThreshold: "yes", housing: "own", family: "solo", arrivalMonth: null }),
    ).toBe(true);
  });
});

describe("F11a rules matrix", () => {
  const opt = <T,>(xs: readonly T[]) => [undefined, ...xs];
  const incomes = opt(INTAKE_QUESTIONS[0].options);
  const thresholds = opt(INTAKE_QUESTIONS[1].options);
  const housings = opt(INTAKE_QUESTIONS[2].options);
  const families = opt(INTAKE_QUESTIONS[3].options);
  const arrivals = [undefined, null, "2026-11", "2028-06"];

  it("every path × answer combination: known ids, copy present, gating unchanged", () => {
    let combos = 0;
    for (const pathId of PATHS) {
      const known = new Set(listStepDefsForPath(pathId).map((s) => s.id));
      for (const incomeSource of incomes)
        for (const incomeThreshold of thresholds)
          for (const housing of housings)
            for (const family of families)
              for (const arrivalMonth of arrivals) {
                combos++;
                const answers = Object.fromEntries(
                  Object.entries({ incomeSource, incomeThreshold, housing, family, arrivalMonth }).filter(([, v]) => v !== undefined),
                ) as IntakeAnswers;
                const patches = applyIntakeRules(pathId, answers, NOW);
                for (const p of patches) {
                  if (p.kind === "flag") expect(INTAKE_FLAG_COPY[p.code]).toBeDefined();
                  else expect(known.has(p.stepId)).toBe(true);
                  if (p.kind === "note") expect(INTAKE_NOTE_COPY[p.noteKey]).toBeDefined();
                }
                const v = view(pathId, answers, { gateEnabled: true, journeyFull: false });
                for (const phase of v.phases) {
                  expect(phase.access).toBe(phase.id === "gather" ? "free" : "paid");
                  for (const s of phase.steps) {
                    expect(s.access).toBe(phase.access); // rule-added steps inherit phase access
                    if (phase.access === "paid") expect(s.notes).toEqual([]);
                  }
                }
                expect(v.progress.total).toBe(stepIds(v).length);
                expect(v.disclaimer).toBe("Preliminary guidance — not legal advice");
              }
    }
    expect(combos).toBe(2 * incomes.length * thresholds.length * housings.length * families.length * arrivals.length);
  });

  it("freelancer + lease + spouse_children differs from employee + not_yet + solo", () => {
    const a = view("italy_digital_nomad", { incomeSource: "freelancer", housing: "lease", family: "spouse_children" });
    const b = view("italy_digital_nomad", { incomeSource: "foreign_employee", housing: "not_yet", family: "solo" });
    expect(stepIds(a)).toContain("family-documents");
    expect(stepIds(a)).toContain("family-permesso");
    expect(stepIds(a)).toContain("partita-iva");
    expect(stepIds(b)).not.toContain("family-documents");
    expect(stepIds(b)).not.toContain("partita-iva");
    const notes = (v: ReturnType<typeof view>, id: string) =>
      v.phases.flatMap((p) => p.steps).find((s) => s.id === id)?.notes?.map((n) => n.key);
    expect(notes(a, "accommodation")).toEqual(["registered_lease"]);
    expect(notes(b, "accommodation")).toEqual(["housing_needed_before_appointment"]);
    expect(notes(a, "family-documents")).toEqual(["children_birth_certs"]);
    expect(a.phases.flatMap((p) => p.steps).find((s) => s.id === "family-documents")?.origin).toBe("intake");
    expect(b.flags?.map((f) => f.code)).toEqual(["SUGGEST_REMOTE_WORKER_PATH"]);
  });

  it("no FBI rules; income flag carries no figure", () => {
    const v = view("italy_digital_nomad", { incomeThreshold: "no", arrivalMonth: "2026-11" });
    expect(v.flags?.map((f) => f.code)).toEqual(["INCOME_BELOW_THRESHOLD", "TIMELINE"]);
    expect(stepIds(v).length).toBe(listStepDefsForPath("italy_digital_nomad").filter((s) => !s.conditional).length);
  });

  it("hidden step keeps its state but leaves progress (decision 4)", () => {
    const states = [{ step_id: "partita-iva", status: "done" as const, updated_at: NOW.toISOString() }];
    const hidden = view("italy_digital_nomad", { incomeSource: "foreign_employee" }, { states });
    const shown = view("italy_digital_nomad", { incomeSource: "freelancer" }, { states });
    expect(hidden.progress.done).toBe(0);
    expect(shown.progress.done).toBe(1);
    expect(shown.progress.total).toBe(hidden.progress.total + 1);
  });
});

describe("F11a INTAKE_ENABLED off", () => {
  it("view has no intake keys and hides conditional steps even with answers", () => {
    const v = buildChecklistView({
      journeyCase,
      pathId: "italy_digital_nomad",
      states: [],
      intake: intake({ family: "spouse", incomeSource: "foreign_employee" }),
    });
    expect(v.intake).toBeUndefined();
    expect(v.flags).toBeUndefined();
    expect(stepIds(v)).not.toContain("family-documents");
    expect(stepIds(v)).toContain("partita-iva");
    for (const s of v.phases.flatMap((p) => p.steps)) {
      expect("notes" in s).toBe(false);
      expect("origin" in s).toBe(false);
    }
  });
});

describe("F11a copy (Visa Ops + Cap overrides)", () => {
  const all = [...Object.values(INTAKE_NOTE_COPY), ...Object.values(INTAKE_FLAG_COPY)];

  it("every note/flag cites ≥1 seeded source", () => {
    for (const c of all) {
      expect(c.sourceIds.length).toBeGreaterThan(0);
      for (const id of c.sourceIds) {
        expect(SEEDED_IDS.has(id), id).toBe(true);
      }
    }
  });

  it("prints no euro figure", () => {
    for (const c of all) expect(c.text).not.toMatch(/€\s?\d|\d[\d,.]*\s?euros?\b/i);
  });

  it("overrides: housing key + text, likely_needed wording, no FBI copy", () => {
    expect(INTAKE_NOTE_COPY.housing_needed_before_appointment.text).toBe(
      "You'll need housing settled before your appointment. US posts generally ask for a lease, rental contract, or deed in your name covering the whole visa period. Several posts, including New York, say a hotel stay or a hospitality offer is not accepted. Secure a registered lease or deed before you book or attend.",
    );
    expect(INTAKE_NOTE_COPY.likely_needed.text).toContain("The Agenzia delle Entrate says form AA9/12 is generally filed within 30 days of starting a professional activity.");
    expect(INTAKE_NOTE_COPY.likely_needed.uncertain).toBe(true);
    expect(Object.keys(INTAKE_NOTE_COPY)).not.toContain("fbi_apostille_lead_time");
    expect(Object.keys(INTAKE_NOTE_COPY)).not.toContain("temporary_booking_ok_check_consulate");
    expect(Object.keys(INTAKE_FLAG_COPY)).not.toContain("FBI_TIMELINE_TIGHT");
    expect(JOURNEY_DISCLAIMER).toBe("Preliminary guidance — not legal advice");
  });

  it("family steps are mapped to ≥1 source (incl. art. 29 row)", () => {
    for (const step of ["family-documents", "family-permesso"]) {
      expect(migrationSql).toContain(`array_append(step_ids, '${step}')`);
    }
    expect(migrationSql).toContain("'it-normattiva-dlgs-286-1998-art29'");
    // Follow-up: Visa Ops confirmed the Houston docx URL → active.
    expect(migrationSql).toMatch(/set status = 'active'[\s\S]*?where id = 'us-houston-dnv-checklist-2026-docx'/);
    expect(migrationSql).toMatch(/it-normattiva-dlgs-286-1998-art29[\s\S]*?family-documents', 'family-permesso/);
  });

  it("cites only ids active for the path when sources are loaded", () => {
    const row = (id: string, step: string): ChecklistSourceRow =>
      ({
        id,
        path_ids: ["italy_digital_nomad"],
        country: "IT",
        title: id,
        publisher: "p",
        official_url: "https://example.gov.it/" + id,
        doc_type: "decree",
        scope: "national",
        retrieved_at: "2026-10-16",
        status: "active",
        step_ids: [step],
        updated_at: "2026-10-16T00:00:00Z",
      }) as unknown as ChecklistSourceRow;
    const sources = indexChecklistSources([row("it-gu-dm-2024-02-29-art3", "proof-of-income")], "italy_digital_nomad");
    const v = view("italy_digital_nomad", { incomeThreshold: "no", incomeSource: "mixed" }, { sources });
    expect(v.flags?.[0]).toMatchObject({ code: "INCOME_BELOW_THRESHOLD", sourceIds: ["it-gu-dm-2024-02-29-art3"] });
    const note = v.phases.flatMap((p) => p.steps).find((s) => s.id === "proof-of-income")?.notes?.[0];
    expect(note?.sourceIds).toEqual(["it-gu-dm-2024-02-29-art3"]);
  });
});

describe("F11a storage + purge", () => {
  it("LWW: newer wins, older/equal no-op", () => {
    expect(intakeShouldWrite(null, "2026-10-16T00:00:00Z")).toBe(true);
    expect(intakeShouldWrite("2026-10-16T00:00:00Z", "2026-10-16T00:00:01Z")).toBe(true);
    expect(intakeShouldWrite("2026-10-16T00:00:01Z", "2026-10-16T00:00:01Z")).toBe(false);
    expect(intakeShouldWrite("2026-10-16T00:00:02Z", "2026-10-16T00:00:01Z")).toBe(false);
  });

  it("journey_intake cascades from journey_cases (purge wipes it); RLS on, no client grants", () => {
    const sql = readFileSync(join(MIGRATIONS, "20261016163621_f11a_journey_intake.sql"), "utf8");
    expect(sql).toContain("case_id uuid primary key references internal.journey_cases (id) on delete cascade");
    expect(sql).toContain("alter table internal.journey_intake enable row level security");
    expect(sql).toContain("revoke all on table internal.journey_intake from anon, authenticated");
    const purge = readFileSync(join(process.cwd(), "src/lib/account/purge.ts"), "utf8");
    expect(purge).toMatch(/from\("journey_cases"\)[\s\S]*?\.delete\(\)/);
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.includes("_f11a_"))) {
      expect(readFileSync(join(MIGRATIONS, f), "utf8")).not.toContain("whjzynfsifrtrxlylrww");
    }
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("F11a v2 childrenCount follow-up", () => {
  it("accepts integers 1–10 with a children family answer", () => {
    for (const n of [1, 2, 10]) {
      const r = parseIntakeAnswers({ family: "children", childrenCount: n }, NOW);
      expect(r).toEqual({ ok: true, answers: { family: "children", childrenCount: n } });
    }
    expect(parseIntakeAnswers({ family: "spouse_children", childrenCount: 3 }, NOW)).toEqual({
      ok: true,
      answers: { family: "spouse_children", childrenCount: 3 },
    });
  });

  it("rejects 0, 11, 2.5, \"2\", null, NaN", () => {
    for (const v of [0, 11, 2.5, "2", null, Number.NaN, -1]) {
      const r = parseIntakeAnswers({ family: "children", childrenCount: v }, NOW);
      expect(r.ok).toBe(false);
    }
  });

  it("drops the count silently when family has no children (or is absent)", () => {
    for (const family of ["solo", "spouse", "unsure"]) {
      expect(parseIntakeAnswers({ family, childrenCount: 2 }, NOW)).toEqual({ ok: true, answers: { family } });
    }
    expect(parseIntakeAnswers({ childrenCount: 2 }, NOW)).toEqual({ ok: true, answers: {} });
    // Still validated before dropping.
    expect(parseIntakeAnswers({ family: "spouse", childrenCount: 11 }, NOW).ok).toBe(false);
  });

  it("does not count toward completion", () => {
    const five: IntakeAnswers = {
      incomeSource: "freelancer",
      incomeThreshold: "yes",
      housing: "lease",
      family: "children",
      arrivalMonth: null,
    };
    expect(isIntakeComplete(five)).toBe(true);
    expect(isIntakeComplete({ ...five, childrenCount: 3 })).toBe(true);
    const { arrivalMonth: _drop, ...four } = five;
    void _drop;
    expect(isIntakeComplete({ ...four, childrenCount: 3 })).toBe(false);
    expect(INTAKE_KEYS).not.toContain("childrenCount");
  });

  it("advertises followUps only on family", () => {
    const qs = intakeQuestionsPayload();
    expect(qs.map((q) => q.key)).toEqual(INTAKE_QUESTIONS.map((q) => q.key));
    const family = qs.find((q) => q.key === "family") as { followUps?: unknown };
    expect(family.followUps).toEqual([
      { key: "childrenCount", min: 1, max: CHILDREN_COUNT_MAX, showWhen: ["spouse_children", "children"] },
    ]);
    for (const q of qs.filter((x) => x.key !== "family")) expect("followUps" in q).toBe(false);
  });

  it("rules output is unchanged by the count (no rule uses it yet)", () => {
    for (const pathId of PATHS) {
      expect(applyIntakeRules(pathId, { family: "children", childrenCount: 4 }, NOW)).toEqual(
        applyIntakeRules(pathId, { family: "children" }, NOW),
      );
    }
    expect(INTAKE_RULES_VERSION).toBe("f11-rules-2026-10-16");
  });

  it("purge: the count lives in journey_intake.answers, which cascades with the case", () => {
    expect(migrationSql).toMatch(
      /case_id uuid primary key references internal\.journey_cases \(id\) on delete cascade/,
    );
  });
});
