/**
 * F3/F4 PATCH step status validation + persistence.
 * F4: optional expectedUpdatedAt → 409 CONFLICT on mismatch; omit = LWW.
 */

import type { AccountDbClient } from "@/lib/account/export";
import {
  computeProgress,
  getStepDef,
  isJourneyStepStatus,
  isKnownPathId,
  listStepDefsForPath,
  type JourneyPathId,
  type JourneyStepStatus,
} from "@/lib/journey/catalog";
import { getJourneyCase } from "@/lib/journey/case";
import { loadStepStates, type ChecklistProgress } from "@/lib/journey/checklist";
import { timestampsMatch } from "@/lib/journey/merge";

export type PatchStepCurrent = {
  stepId: string;
  status: JourneyStepStatus;
  updatedAt: string;
};

export type PatchStepResult =
  | {
      ok: true;
      stepId: string;
      status: JourneyStepStatus;
      updatedAt: string;
      progress: ChecklistProgress;
    }
  | {
      ok: false;
      code: "CONFLICT";
      message: string;
      current: PatchStepCurrent;
      progress: ChecklistProgress;
    }
  | {
      ok: false;
      code:
        | "NO_JOURNEY_CASE"
        | "UNKNOWN_STEP"
        | "BAD_STATUS"
        | "UNKNOWN_PATH"
        | "DB_ERROR";
      message: string;
    };

async function progressForCase(
  service: AccountDbClient,
  caseId: string,
  pathId: JourneyPathId,
): Promise<
  | { ok: true; progress: ChecklistProgress }
  | { ok: false; code: "DB_ERROR"; message: string }
> {
  const states = await loadStepStates(service, caseId);
  if (!states.ok) {
    return { ok: false, code: "DB_ERROR", message: states.message };
  }
  const statusById = new Map(states.rows.map((s) => [s.step_id, s.status]));
  const ordered = listStepDefsForPath(pathId).map(
    (s) => statusById.get(s.id) ?? ("not_started" as JourneyStepStatus),
  );
  return { ok: true, progress: computeProgress(ordered) };
}

export async function patchStepStatus(
  service: AccountDbClient,
  args: {
    userId: string;
    stepId: string;
    status: unknown;
    /** When provided, must match current row updated_at or → CONFLICT. Omit = LWW. */
    expectedUpdatedAt?: string | null;
    nowIso?: string;
  },
): Promise<PatchStepResult> {
  if (!isJourneyStepStatus(args.status)) {
    return {
      ok: false,
      code: "BAD_STATUS",
      message: "status must be not_started | in_progress | done",
    };
  }

  const caseRes = await getJourneyCase(service, args.userId);
  if (!caseRes.ok) {
    return { ok: false, code: "DB_ERROR", message: caseRes.message };
  }
  if (!caseRes.case) {
    return {
      ok: false,
      code: "NO_JOURNEY_CASE",
      message: "No journey case — select a path first",
    };
  }
  if (!isKnownPathId(caseRes.case.pathId)) {
    return {
      ok: false,
      code: "UNKNOWN_PATH",
      message: "Journey case has unknown path",
    };
  }

  const pathId = caseRes.case.pathId as JourneyPathId;
  if (!getStepDef(pathId, args.stepId)) {
    return {
      ok: false,
      code: "UNKNOWN_STEP",
      message: "Unknown journey step",
    };
  }

  const db = service.schema("internal");
  const existing = await db
    .from("journey_step_states")
    .select("step_id, status, updated_at")
    .eq("case_id", caseRes.case.caseId)
    .eq("step_id", args.stepId)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to read step status" };
  }

  const currentRow = existing.data as
    | { step_id: string; status: JourneyStepStatus; updated_at: string }
    | null;

  const expected =
    typeof args.expectedUpdatedAt === "string" &&
    args.expectedUpdatedAt.trim().length > 0
      ? args.expectedUpdatedAt.trim()
      : null;

  if (expected !== null) {
    const currentUpdatedAt =
      currentRow?.updated_at ?? caseRes.case.updatedAt;
    const currentStatus =
      currentRow?.status ?? ("not_started" as JourneyStepStatus);

    if (!timestampsMatch(expected, currentUpdatedAt)) {
      const prog = await progressForCase(service, caseRes.case.caseId, pathId);
      if (!prog.ok) {
        return { ok: false, code: "DB_ERROR", message: prog.message };
      }
      return {
        ok: false,
        code: "CONFLICT",
        message: "Step was updated elsewhere; refresh and retry",
        current: {
          stepId: args.stepId,
          status: currentStatus,
          updatedAt: currentUpdatedAt,
        },
        progress: prog.progress,
      };
    }
  }

  const nowIso = args.nowIso ?? new Date().toISOString();

  const upd = await db
    .from("journey_step_states")
    .update({ status: args.status, updated_at: nowIso })
    .eq("case_id", caseRes.case.caseId)
    .eq("step_id", args.stepId)
    .select("step_id, status, updated_at")
    .maybeSingle();

  if (upd.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to update step status" };
  }

  // If row missing (legacy / partial seed), upsert.
  if (!upd.data) {
    const ins = await db
      .from("journey_step_states")
      .insert({
        case_id: caseRes.case.caseId,
        step_id: args.stepId,
        status: args.status,
        updated_at: nowIso,
      })
      .select("step_id, status, updated_at")
      .maybeSingle();
    if (ins.error || !ins.data) {
      return { ok: false, code: "DB_ERROR", message: "Failed to upsert step status" };
    }
  }

  // Touch case updated_at
  await db
    .from("journey_cases")
    .update({ updated_at: nowIso })
    .eq("id", caseRes.case.caseId);

  const prog = await progressForCase(service, caseRes.case.caseId, pathId);
  if (!prog.ok) {
    return { ok: false, code: "DB_ERROR", message: prog.message };
  }

  const updatedAt =
    (upd.data as { updated_at?: string } | null)?.updated_at ?? nowIso;

  return {
    ok: true,
    stepId: args.stepId,
    status: args.status,
    updatedAt,
    progress: prog.progress,
  };
}
