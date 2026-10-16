/**
 * F11a intake → deterministic rules (no AI). Pure, versioned, unit-tested.
 * Rules key on step ids + phase ids only. Copy for notes lives in
 * `intake-copy.ts` (Visa Ops); a note without approved copy is not emitted.
 * See docs/journey.md § F11a and the F11 runbook.
 */

import type { JourneyPathId } from "@/lib/journey/catalog";

export const INTAKE_RULES_VERSION = "f11-rules-2026-10-16";

export const INTAKE_QUESTIONS = [
  {
    key: "incomeSource",
    options: ["foreign_employee", "freelancer", "business_owner", "mixed", "unsure"],
  },
  { key: "incomeThreshold", options: ["yes", "no", "unsure"] },
  { key: "housing", options: ["lease", "own", "not_yet"] },
  /** Art. 29 c.1 (a)(b): spouse 18+ and unmarried minor children only (no unmarried partner). */
  { key: "family", options: ["solo", "spouse", "spouse_children", "children"] },
  /** `YYYY-MM`, current month … +24 months, or null. Options are not enumerated. */
  { key: "arrivalMonth", options: [] as string[] },
] as const;

export type IntakeKey = (typeof INTAKE_QUESTIONS)[number]["key"];
export const INTAKE_KEYS: readonly IntakeKey[] = INTAKE_QUESTIONS.map((q) => q.key);

export type IncomeSource = "foreign_employee" | "freelancer" | "business_owner" | "mixed" | "unsure";
export type IntakeAnswers = {
  incomeSource?: IncomeSource;
  incomeThreshold?: "yes" | "no" | "unsure";
  housing?: "lease" | "own" | "not_yet";
  family?: "solo" | "spouse" | "spouse_children" | "children";
  arrivalMonth?: string | null;
};

export const ARRIVAL_MONTH_MAX_AHEAD = 24;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function monthIndex(year: number, month1: number): number {
  return year * 12 + (month1 - 1);
}

/** Months from `now` (UTC) to `YYYY-MM`; null when malformed. */
export function monthsAhead(arrivalMonth: string, now: Date): number | null {
  const m = MONTH_RE.exec(arrivalMonth);
  if (!m) return null;
  return monthIndex(Number(m[1]), Number(m[2])) - monthIndex(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

export type ParseIntakeResult =
  | { ok: true; answers: IntakeAnswers }
  | { ok: false; message: string };

/**
 * Validate a client answers object. Unknown keys or values → error (400 BAD_INTAKE).
 * Absent key = skipped ("Not sure"). `arrivalMonth` must be in [now, now+24].
 */
export function parseIntakeAnswers(raw: unknown, now: Date): ParseIntakeResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, message: "answers must be an object" };
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const q = INTAKE_QUESTIONS.find((x) => x.key === key);
    if (!q) return { ok: false, message: `Unknown intake key: ${key}` };
    if (key === "arrivalMonth") {
      if (value === null) {
        out[key] = null;
        continue;
      }
      if (typeof value !== "string") return { ok: false, message: "arrivalMonth must be YYYY-MM or null" };
      const ahead = monthsAhead(value, now);
      if (ahead === null || ahead < 0 || ahead > ARRIVAL_MONTH_MAX_AHEAD) {
        return { ok: false, message: "arrivalMonth out of range" };
      }
      out[key] = value;
      continue;
    }
    if (typeof value !== "string" || !(q.options as readonly string[]).includes(value)) {
      return { ok: false, message: `Invalid value for ${key}` };
    }
    out[key] = value;
  }
  return { ok: true, answers: out as IntakeAnswers };
}

/** All 5 keys answered (arrivalMonth may be an explicit null). */
export function isIntakeComplete(answers: IntakeAnswers): boolean {
  return INTAKE_KEYS.every((k) => Object.prototype.hasOwnProperty.call(answers, k));
}

export type IntakeFlagCode =
  | "SUGGEST_REMOTE_WORKER_PATH"
  | "SUGGEST_NOMAD_PATH"
  | "INCOME_BELOW_THRESHOLD"
  | "TIMELINE";

export type IntakeNoteKey =
  | "employee_payslips"
  | "self_employed_evidence"
  | "likely_needed"
  | "employee_contract_evidence"
  | "registered_lease"
  | "deed"
  | "housing_needed_before_appointment"
  | "children_birth_certs";

/** Conditional catalog steps a rule can add (hidden unless added). */
export type IntakeAddedStepId = "family-documents" | "family-permesso";

export type StepPatch =
  | { kind: "hide"; stepId: string }
  | { kind: "add"; stepId: IntakeAddedStepId }
  | { kind: "note"; stepId: string; noteKey: IntakeNoteKey }
  | { kind: "flag"; code: IntakeFlagCode };

/**
 * Rules v1 (with Cap's 2026-10-16 overrides: no fbiCheck question and no
 * FBI_TIMELINE_TIGHT; housing_needed_before_appointment; family = spouse /
 * unmarried minor children). `now` is kept for month-relative rules.
 */
export function applyIntakeRules(
  pathId: JourneyPathId,
  answers: IntakeAnswers,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  now: Date,
): StepPatch[] {
  const patches: StepPatch[] = [];
  const nomad = pathId === "italy_digital_nomad";
  const remote = pathId === "italy_remote_worker";
  const income = answers.incomeSource;

  if (income === "foreign_employee") {
    if (nomad) {
      patches.push({ kind: "flag", code: "SUGGEST_REMOTE_WORKER_PATH" });
      patches.push({ kind: "note", stepId: "proof-of-income", noteKey: "employee_payslips" });
      patches.push({ kind: "hide", stepId: "partita-iva" });
    }
    if (remote) {
      patches.push({ kind: "note", stepId: "employment-contract", noteKey: "employee_contract_evidence" });
    }
  }
  if ((income === "freelancer" || income === "business_owner") && remote) {
    patches.push({ kind: "flag", code: "SUGGEST_NOMAD_PATH" });
  }
  if (income === "freelancer" || income === "business_owner" || income === "mixed") {
    patches.push({ kind: "note", stepId: "proof-of-income", noteKey: "self_employed_evidence" });
    if (nomad) {
      patches.push({ kind: "note", stepId: "partita-iva", noteKey: "likely_needed" });
    }
  }

  if (answers.incomeThreshold === "no") {
    patches.push({ kind: "flag", code: "INCOME_BELOW_THRESHOLD" });
  }

  if (answers.housing === "lease") {
    patches.push({ kind: "note", stepId: "accommodation", noteKey: "registered_lease" });
  } else if (answers.housing === "own") {
    patches.push({ kind: "note", stepId: "accommodation", noteKey: "deed" });
  } else if (answers.housing === "not_yet") {
    patches.push({ kind: "note", stepId: "accommodation", noteKey: "housing_needed_before_appointment" });
  }

  const family = answers.family;
  if (family !== undefined && family !== "solo") {
    patches.push({ kind: "add", stepId: "family-documents" });
    patches.push({ kind: "add", stepId: "family-permesso" });
    if (family === "spouse_children" || family === "children") {
      patches.push({ kind: "note", stepId: "family-documents", noteKey: "children_birth_certs" });
    }
  }

  if (typeof answers.arrivalMonth === "string") {
    patches.push({ kind: "flag", code: "TIMELINE" });
  }

  return patches;
}

