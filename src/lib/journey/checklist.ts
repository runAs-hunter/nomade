/**
 * F3/F4 checklist join — catalog + step statuses + progress.
 * F4: each step exposes updatedAt for client echo / expectedUpdatedAt.
 */

import type { AccountDbClient } from "@/lib/account/export";
import {
  JOURNEY_CATALOG_VERSION,
  JOURNEY_DISCLAIMER,
  computeProgress,
  getPhasesForPath,
  isKnownPathId,
  type JourneyPathId,
  type JourneyStepStatus,
} from "@/lib/journey/catalog";
import { getJourneyCase, type JourneyCaseView } from "@/lib/journey/case";

export type StepStateRow = {
  step_id: string;
  status: JourneyStepStatus;
  updated_at: string;
};

export type ChecklistStepView = {
  id: string;
  name: string;
  detail: string;
  status: JourneyStepStatus;
  /** ISO timestamptz — echo as expectedUpdatedAt on PATCH. Missing rows use case.updatedAt or epoch. */
  updatedAt: string;
};

export type ChecklistPhaseView = {
  name: string;
  steps: ChecklistStepView[];
};

export type ChecklistProgress = {
  done: number;
  total: number;
  fraction: number;
};

export type ChecklistView = {
  caseId: string;
  pathId: string;
  catalogVersion: string;
  phases: ChecklistPhaseView[];
  progress: ChecklistProgress;
  disclaimer: string;
};

export type GetChecklistResult =
  | { ok: true; checklist: ChecklistView }
  | {
      ok: false;
      code: "NO_JOURNEY_CASE" | "UNKNOWN_PATH" | "DB_ERROR";
      message: string;
    };

export async function loadStepStates(
  service: AccountDbClient,
  caseId: string,
): Promise<
  | { ok: true; rows: StepStateRow[] }
  | { ok: false; code: "DB_ERROR"; message: string }
> {
  const db = service.schema("internal");
  const res = await db
    .from("journey_step_states")
    .select("step_id, status, updated_at")
    .eq("case_id", caseId);

  if (res.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to read step states" };
  }

  const rows = (res.data as StepStateRow[] | null) ?? [];
  return { ok: true, rows };
}

/** Pure join for unit tests — catalog order wins; missing rows → not_started. */
export function buildChecklistView(args: {
  journeyCase: JourneyCaseView;
  pathId: JourneyPathId;
  states: StepStateRow[];
}): ChecklistView {
  const stateById = new Map(args.states.map((s) => [s.step_id, s]));
  const fallbackUpdatedAt = args.journeyCase.updatedAt;
  const phases = getPhasesForPath(args.pathId).map((phase) => ({
    name: phase.name,
    steps: phase.steps.map((step) => {
      const row = stateById.get(step.id);
      return {
        id: step.id,
        name: step.name,
        detail: step.detail,
        status: row?.status ?? ("not_started" as JourneyStepStatus),
        updatedAt: row?.updated_at ?? fallbackUpdatedAt,
      };
    }),
  }));

  const statuses = phases.flatMap((p) => p.steps.map((s) => s.status));
  return {
    caseId: args.journeyCase.caseId,
    pathId: args.pathId,
    catalogVersion: JOURNEY_CATALOG_VERSION,
    phases,
    progress: computeProgress(statuses),
    disclaimer: JOURNEY_DISCLAIMER,
  };
}

export async function getChecklist(
  service: AccountDbClient,
  userId: string,
): Promise<GetChecklistResult> {
  const caseRes = await getJourneyCase(service, userId);
  if (!caseRes.ok) return caseRes;
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

  const states = await loadStepStates(service, caseRes.case.caseId);
  if (!states.ok) return states;

  return {
    ok: true,
    checklist: buildChecklistView({
      journeyCase: caseRes.case,
      pathId: caseRes.case.pathId,
      states: states.rows,
    }),
  };
}
