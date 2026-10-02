/**
 * F3 / F3.1 checklist join — catalog + step statuses + progress + access flags.
 */

import type { AccountDbClient } from "@/lib/account/export";
import { hasActiveJourneyFull } from "@/lib/billing/entitlements";
import { phaseAccess, type PhaseAccess } from "@/lib/billing/catalog";
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
  access: PhaseAccess;
};

export type ChecklistPhaseView = {
  name: string;
  access: PhaseAccess;
  steps: ChecklistStepView[];
};

export type ChecklistProgress = {
  done: number;
  total: number;
  fraction: number;
};

export type ChecklistEntitlement = {
  journeyFull: boolean;
};

export type ChecklistView = {
  caseId: string;
  pathId: string;
  catalogVersion: string;
  phases: ChecklistPhaseView[];
  progress: ChecklistProgress;
  disclaimer: string;
  entitlement: ChecklistEntitlement;
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
  journeyFull?: boolean;
}): ChecklistView {
  const statusById = new Map(args.states.map((s) => [s.step_id, s.status]));
  const journeyFull = args.journeyFull ?? false;
  const phases = getPhasesForPath(args.pathId).map((phase) => {
    const access = phaseAccess(phase.name);
    return {
      name: phase.name,
      access,
      steps: phase.steps.map((step) => ({
        id: step.id,
        name: step.name,
        detail: step.detail,
        status: statusById.get(step.id) ?? ("not_started" as JourneyStepStatus),
        access,
      })),
    };
  });

  const statuses = phases.flatMap((p) => p.steps.map((s) => s.status));
  return {
    caseId: args.journeyCase.caseId,
    pathId: args.pathId,
    catalogVersion: JOURNEY_CATALOG_VERSION,
    phases,
    progress: computeProgress(statuses),
    disclaimer: JOURNEY_DISCLAIMER,
    entitlement: { journeyFull },
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

  const ent = await hasActiveJourneyFull(service, userId);
  if (!ent.ok) return ent;

  return {
    ok: true,
    checklist: buildChecklistView({
      journeyCase: caseRes.case,
      pathId: caseRes.case.pathId,
      states: states.rows,
      journeyFull: ent.active,
    }),
  };
}
