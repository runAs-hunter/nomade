import { z } from "zod";
// Relative (not `@/`) imports: this module is also loaded by the plain-node
// generator (`scripts/gen-quiz-json.mjs`), which doesn't resolve the `@/` alias.
import { getNationalityGroup, NATIONALITY_GROUPS } from "./nationality-groups.ts";
import type { UserProfile } from "./schema.ts";

/**
 * Single source of truth for the onboarding quiz.
 *
 * The web `QuizClient` renders `QUIZ_STEPS` directly. The native iOS app can't
 * import TypeScript, so `scripts/gen-quiz-json.mjs` validates this against
 * `QuizSchema` and emits `quiz.json` (steps + the nationality→group map) into
 * the iOS bundle — the two clients never drift (eng-review decision 4A). Edit
 * the quiz here, then run `npm run gen:quiz-json` (or `npm run gen:ios`).
 */

// ─── Schema ──────────────────────────────────────────────────────────────────

export const QuizOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  description: z.string().optional(),
});

export const QuizStepSchema = z.object({
  /** A `UserProfile` field the answer populates (or drives, for nationality). */
  id: z.enum([
    "income_type",
    "income_range",
    "nationality",
    "residence",
    "traveling_with",
  ]),
  question: z.string(),
  hint: z.string().optional(),
  options: z.array(QuizOptionSchema).min(2),
});

/** The generated bundle: the ordered steps plus the nationality→group lookup. */
export const QuizSchema = z.object({
  steps: z.array(QuizStepSchema).min(1),
  nationalityGroups: z.record(z.string(), z.enum(["EU", "non-EU"])),
});

export type QuizOption = z.infer<typeof QuizOptionSchema>;
export type QuizStep = z.infer<typeof QuizStepSchema>;
export type Quiz = z.infer<typeof QuizSchema>;

// ─── Steps ───────────────────────────────────────────────────────────────────

export const QUIZ_STEPS: QuizStep[] = [
  {
    id: "income_type",
    question: "How do you earn your income?",
    hint: "This determines which documents you'll need to prove income.",
    options: [
      {
        value: "freelancer",
        label: "Freelancer / self-employed",
        description: "You invoice clients directly",
      },
      {
        value: "employee",
        label: "Remote employee",
        description: "You're on payroll for a company",
      },
      {
        value: "business_owner",
        label: "Business owner",
        description: "You own a registered company",
      },
      {
        value: "mixed",
        label: "Mixed income",
        description: "Both freelance and employment income",
      },
    ],
  },
  {
    id: "income_range",
    question: "What's your annual income?",
    hint: "Italy requires at least €28,000/yr. Your checklist will include a warning if you're under this threshold.",
    options: [
      { value: "under_28k", label: "Under €28,000" },
      { value: "28k_to_50k", label: "€28,000 – €50,000" },
      { value: "50k_to_100k", label: "€50,000 – €100,000" },
      { value: "over_100k", label: "Over €100,000" },
    ],
  },
  {
    id: "nationality",
    question: "What's your nationality?",
    hint: "Non-EU citizens require apostilles and certified translations on most documents.",
    options: [
      { value: "US", label: "🇺🇸 United States" },
      { value: "GB", label: "🇬🇧 United Kingdom" },
      { value: "CA", label: "🇨🇦 Canada" },
      { value: "AU", label: "🇦🇺 Australia" },
      { value: "DE", label: "🇩🇪 Germany (EU)" },
      { value: "FR", label: "🇫🇷 France (EU)" },
      { value: "NL", label: "🇳🇱 Netherlands (EU)" },
      { value: "BR", label: "🇧🇷 Brazil" },
      { value: "MX", label: "🇲🇽 Mexico" },
      { value: "other_eu", label: "Other EU country" },
      { value: "other_non_eu", label: "Other (non-EU)" },
    ],
  },
  {
    id: "residence",
    question: "Where do you currently reside?",
    hint: "You must apply at the Italian consulate covering your country of residence.",
    options: [
      { value: "United States", label: "🇺🇸 United States" },
      { value: "United Kingdom", label: "🇬🇧 United Kingdom" },
      { value: "Canada", label: "🇨🇦 Canada" },
      { value: "Australia", label: "🇦🇺 Australia" },
      { value: "Germany", label: "🇩🇪 Germany" },
      { value: "France", label: "🇫🇷 France" },
      { value: "Netherlands", label: "🇳🇱 Netherlands" },
      { value: "Brazil", label: "🇧🇷 Brazil" },
      { value: "Mexico", label: "🇲🇽 Mexico" },
      { value: "Other EU", label: "Other EU country" },
      { value: "Other", label: "Other country" },
    ],
  },
  {
    id: "traveling_with",
    question: "Who are you traveling with?",
    hint: "Family members need their own Permesso di Soggiorno. This adds to the minimum income requirement.",
    options: [
      {
        value: "solo",
        label: "Just me",
        description: "No dependents",
      },
      {
        value: "with_partner",
        label: "Me + partner",
        description: "Additional €8,400/yr income required",
      },
      {
        value: "with_family",
        label: "Me + family",
        description: "Partner + children — additional €8,400/yr per adult + €2,800/yr per child",
      },
    ],
  },
];

// ─── Profile building ──────────────────────────────────────────────────────

/**
 * Build a `UserProfile` from raw quiz answers. This is the single definition of
 * the nationality special-case resolution — ported verbatim to Swift in E3, and
 * pinned by the shared `quiz-profile-vectors.json` so the two agree:
 *
 * - `other_eu`     → nationality `"EU"`,    group EU  (resolved as if Germany)
 * - `other_non_eu` → nationality `"OTHER"`, group non-EU
 * - a specific code (e.g. `"US"`, `"DE"`) → group from the lookup table
 *
 * Missing answers fall back to the conservative non-EU / "Other" defaults, so a
 * partial answer set still yields a valid (if generic) profile.
 */
export function buildProfile(answers: Record<string, string>): UserProfile {
  const rawNationality = answers.nationality ?? "other_non_eu";
  const nationality =
    rawNationality === "other_eu"
      ? "EU"
      : rawNationality === "other_non_eu"
      ? "OTHER"
      : rawNationality;

  const nationalityGroup = getNationalityGroup(
    rawNationality === "other_eu" ? "DE" : nationality
  );

  return {
    nationality,
    nationality_group: nationalityGroup,
    residence: answers.residence ?? "Other",
    income_type: answers.income_type as UserProfile["income_type"],
    income_range: answers.income_range as UserProfile["income_range"],
    traveling_with: answers.traveling_with as UserProfile["traveling_with"],
  };
}

/** The full quiz bundle emitted to `quiz.json` — steps + nationality lookup. */
export const QUIZ: Quiz = {
  steps: QUIZ_STEPS,
  nationalityGroups: NATIONALITY_GROUPS,
};
