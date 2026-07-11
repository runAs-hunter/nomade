import { z } from "zod";

// ─── Condition matching ────────────────────────────────────────────────────

export const ConditionSchema = z.object({
  if: z.record(z.string(), z.string()).optional(),
  detail: z.string(),
});

// ─── Task ──────────────────────────────────────────────────────────────────

export const TaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Used when no condition matches AND task is not hidden_unless_matched */
  default_detail: z.string().optional(),
  /** Used when the task has no conditions — same for everyone */
  detail: z.string().optional(),
  universal: z.boolean().optional(),
  hidden_unless_matched: z.boolean().optional(),
  conditions: z.array(ConditionSchema).optional(),
  cost: z.string().optional(),
  time: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// ─── Phase ─────────────────────────────────────────────────────────────────

export const PhaseSchema = z.object({
  name: z.string(),
  tasks: z.array(TaskSchema),
});

// ─── Country ───────────────────────────────────────────────────────────────

export const CountrySchema = z.object({
  country: z.string(),
  visa_name: z.string(),
  emoji: z.string(),
  min_income: z.number(),
  duration: z.string(),
  processing_time: z.string(),
  last_verified: z.string(), // ISO date string
  sources: z.array(z.string()),
  phases: z.array(PhaseSchema),
});

// ─── Inferred types ────────────────────────────────────────────────────────

export type Condition = z.infer<typeof ConditionSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Phase = z.infer<typeof PhaseSchema>;
export type CountryData = z.infer<typeof CountrySchema>;

// ─── User profile ──────────────────────────────────────────────────────────

export const IncomeTypeSchema = z.enum([
  "freelancer",
  "employee",
  "business_owner",
  "mixed",
]);
export const IncomeRangeSchema = z.enum([
  "under_28k",
  "28k_to_50k",
  "50k_to_100k",
  "over_100k",
]);
export const TravelingWithSchema = z.enum(["solo", "with_partner", "with_family"]);

export const UserProfileSchema = z.object({
  nationality: z.string(),
  nationality_group: z.enum(["EU", "non-EU"]),
  residence: z.string(),
  income_type: IncomeTypeSchema,
  income_range: IncomeRangeSchema,
  traveling_with: TravelingWithSchema,
});

export type IncomeType = z.infer<typeof IncomeTypeSchema>;
export type IncomeRange = z.infer<typeof IncomeRangeSchema>;
export type TravelingWith = z.infer<typeof TravelingWithSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;

// ─── Personalized task (output of personalize engine) ─────────────────────

export type PersonalizedTask = {
  id: string;
  name: string;
  detail: string;
  isPersonalized: boolean; // true if a condition matched (not universal/default)
  cost?: string;
  time?: string;
  tags?: string[];
};

export type PersonalizedPhase = {
  name: string;
  tasks: PersonalizedTask[];
};

export type PersonalizedChecklist = {
  phases: PersonalizedPhase[];
  totalTasks: number;
  /** true if income_range === 'under_28k' — show eligibility warning */
  incomeWarning: boolean;
};
