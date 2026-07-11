/**
 * Personalization engine.
 *
 * Pure function: (countryData, userProfile) → PersonalizedChecklist
 *
 * Condition matching rules:
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  1. All keys in `if` must match the profile (AND logic)              │
 * │  2. Most specific match wins (most keys in `if` object)              │
 * │  3. Tiebreaker: first listed condition in the YAML wins              │
 * │  4. No match + hidden_unless_matched → task is excluded              │
 * │  5. No match + no hidden_unless_matched → show default_detail        │
 * │  6. universal: true tasks bypass condition evaluation entirely       │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import type {
  CountryData,
  UserProfile,
  PersonalizedChecklist,
  PersonalizedTask,
  Task,
  Condition,
} from "@/data/schema";

// ─── Condition evaluation ──────────────────────────────────────────────────

/**
 * Returns how many keys in the condition's `if` block match the profile.
 * Returns -1 if ANY key doesn't match (condition fails).
 */
function matchScore(conditionIf: Record<string, string>, profile: UserProfile): number {
  let score = 0;
  for (const [key, value] of Object.entries(conditionIf)) {
    const profileValue = (profile as Record<string, string>)[key];
    if (profileValue !== value) return -1; // mismatch — condition fails
    score++;
  }
  return score;
}

/**
 * Finds the best-matching condition for a task given a user profile.
 * Returns the matched Condition or null if none match.
 */
function findBestCondition(
  conditions: Condition[],
  profile: UserProfile
): Condition | null {
  let best: Condition | null = null;
  let bestScore = -1;

  for (const condition of conditions) {
    if (!condition.if) continue;
    const score = matchScore(condition.if, profile);
    if (score > bestScore) {
      best = condition;
      bestScore = score;
    }
  }

  return bestScore >= 0 ? best : null;
}

// ─── Task personalization ──────────────────────────────────────────────────

function personalizeTask(
  task: Task,
  profile: UserProfile
): PersonalizedTask | null {
  // Universal tasks: always shown, no condition evaluation
  if (task.universal) {
    return {
      id: task.id,
      name: task.name,
      detail: task.detail ?? task.default_detail ?? "",
      isPersonalized: false,
      ...(task.cost ? { cost: task.cost } : {}),
      ...(task.time ? { time: task.time } : {}),
      ...(task.tags ? { tags: task.tags } : {}),
    };
  }

  // No conditions: show the task's own `detail`
  if (!task.conditions || task.conditions.length === 0) {
    if (!task.detail && !task.default_detail) return null;
    return {
      id: task.id,
      name: task.name,
      detail: task.detail ?? task.default_detail ?? "",
      isPersonalized: false,
      ...(task.cost ? { cost: task.cost } : {}),
      ...(task.time ? { time: task.time } : {}),
      ...(task.tags ? { tags: task.tags } : {}),
    };
  }

  const match = findBestCondition(task.conditions, profile);

  if (!match) {
    // No condition matched
    if (task.hidden_unless_matched) return null; // hide task entirely
    if (!task.default_detail) return null; // nothing to show
    return {
      id: task.id,
      name: task.name,
      detail: task.default_detail,
      isPersonalized: false,
      ...(task.cost ? { cost: task.cost } : {}),
      ...(task.time ? { time: task.time } : {}),
      ...(task.tags ? { tags: task.tags } : {}),
    };
  }

  return {
    id: task.id,
    name: task.name,
    detail: match.detail,
    isPersonalized: true, // a condition matched — show "Personalized for you" badge
    ...(task.cost ? { cost: task.cost } : {}),
    ...(task.time ? { time: task.time } : {}),
    ...(task.tags ? { tags: task.tags } : {}),
  };
}

// ─── Main export ───────────────────────────────────────────────────────────

export function personalize(
  countryData: CountryData,
  profile: UserProfile
): PersonalizedChecklist {
  const phases = countryData.phases
    .map((phase) => {
      const tasks = phase.tasks
        .map((task) => personalizeTask(task, profile))
        .filter((t): t is PersonalizedTask => t !== null);
      return { name: phase.name, tasks };
    })
    .filter((phase) => phase.tasks.length > 0);

  const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0);
  const incomeWarning = profile.income_range === "under_28k";

  return { phases, totalTasks, incomeWarning };
}
