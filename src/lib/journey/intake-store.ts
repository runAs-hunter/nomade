/**
 * F11a intake storage — internal.journey_intake (case_id PK → journey_cases, cascade).
 * Service role only. Last-write-wins on client_updated_at.
 */

import type { AccountDbClient } from "@/lib/account/export";
import {
  INTAKE_RULES_VERSION,
  isIntakeComplete,
  type IntakeAnswers,
} from "@/lib/journey/intake";

export type IntakeRow = {
  case_id: string;
  answers: IntakeAnswers;
  rules_version: string;
  completed_at: string | null;
  client_updated_at: string | null;
  updated_at: string;
};

export type IntakeView = {
  answers: IntakeAnswers;
  rulesVersion: string;
  completedAt: string | null;
  clientUpdatedAt: string | null;
  updatedAt: string;
};

const COLS = "case_id, answers, rules_version, completed_at, client_updated_at, updated_at";

export function toIntakeView(row: IntakeRow): IntakeView {
  return {
    answers: (row.answers ?? {}) as IntakeAnswers,
    rulesVersion: row.rules_version,
    completedAt: row.completed_at,
    clientUpdatedAt: row.client_updated_at,
    updatedAt: row.updated_at,
  };
}

export async function loadIntake(
  service: AccountDbClient,
  caseId: string,
): Promise<{ ok: true; intake: IntakeView | null } | { ok: false; message: string }> {
  const res = await service
    .schema("internal")
    .from("journey_intake")
    .select(COLS)
    .eq("case_id", caseId)
    .maybeSingle();
  if (res.error) return { ok: false, message: "Failed to read intake" };
  return { ok: true, intake: res.data ? toIntakeView(res.data as IntakeRow) : null };
}

/** True when `incoming` should win over the stored client timestamp. */
export function intakeShouldWrite(stored: string | null | undefined, incoming: string): boolean {
  if (!stored) return true;
  const a = Date.parse(stored);
  const b = Date.parse(incoming);
  if (Number.isNaN(b)) return false;
  if (Number.isNaN(a)) return true;
  return b > a;
}

/**
 * Replace the answers when `clientUpdatedAt` is newer than the stored one.
 * Older/equal → no-op (`applied: false`), which callers treat as success.
 * `completed_at` is set once, the first time all 6 keys are present.
 */
export async function saveIntakeLww(
  service: AccountDbClient,
  args: {
    caseId: string;
    answers: IntakeAnswers;
    clientUpdatedAt: string;
    nowIso: string;
  },
): Promise<
  { ok: true; applied: boolean; intake: IntakeView } | { ok: false; message: string }
> {
  const current = await loadIntake(service, args.caseId);
  if (!current.ok) return current;
  const stored = current.intake;
  if (stored && !intakeShouldWrite(stored.clientUpdatedAt, args.clientUpdatedAt)) {
    return { ok: true, applied: false, intake: stored };
  }

  const completedAt =
    stored?.completedAt ?? (isIntakeComplete(args.answers) ? args.nowIso : null);
  const row = {
    case_id: args.caseId,
    answers: args.answers,
    rules_version: INTAKE_RULES_VERSION,
    completed_at: completedAt,
    client_updated_at: args.clientUpdatedAt,
    updated_at: args.nowIso,
  };
  const db = service.schema("internal");
  const res = await db
    .from("journey_intake")
    .upsert(row, { onConflict: "case_id" })
    .select(COLS)
    .maybeSingle();
  if (res.error || !res.data) return { ok: false, message: "Failed to save intake" };
  return { ok: true, applied: true, intake: toIntakeView(res.data as IntakeRow) };
}
