/**
 * F3/F4 checklist join — catalog + step statuses + progress.
 * F4: each step exposes updatedAt for client echo / expectedUpdatedAt.
 */

import type { AccountDbClient } from "@/lib/account/export";
import { phaseAccess, type PhaseAccess } from "@/lib/billing/catalog";
import { hasActiveJourneyFull } from "@/lib/billing/entitlements";
import { isBillingGateEnabled } from "@/lib/env";
import {
  JOURNEY_CATALOG_VERSION,
  JOURNEY_DISCLAIMER,
  computeProgress,
  getPhasesForPath,
  isKnownPathId,
  type JourneyPathId,
  type JourneyPhaseId,
  type JourneyStepStatus,
} from "@/lib/journey/catalog";
import {
  getJourneyCase,
  insertMissingCatalogSteps,
  type JourneyCaseView,
} from "@/lib/journey/case";
import {
  EMPTY_SOURCE_INDEX,
  indexChecklistSources,
  loadChecklistSourceRows,
  type ChecklistSourceIndex,
  type ChecklistSourceView,
} from "@/lib/journey/checklist-sources";
import { log } from "@/lib/log";

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
  /** F9: national/questura official sources for this step (active only). */
  sources: ChecklistSourceView[];
  /** F10: phase-depth gate. Paid + no entitlement → locked (detail ""). */
  access: PhaseAccess;
};

export type ChecklistPhaseView = {
  /** F10: stable phase id (gather | apply | after). */
  id: JourneyPhaseId;
  name: string;
  access: PhaseAccess;
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
  /** F9: active consulate rows per US post id; the device picks its own post. */
  consulateSources: Record<string, ChecklistSourceView[]>;
  /** F9: max(updated_at) of returned source rows, for client cache-busting. */
  sourcesVersion: string | null;
  /** F10: server entitlement state (the client never decides "paid"). */
  entitlement: ChecklistEntitlement;
};

export type ChecklistEntitlement = {
  journeyFull: boolean;
  /** F10: present (true) when the entitlement read failed; journeyFull is false. */
  unavailable?: true;
  /** F10: mirrors BILLING_GATE_ENABLED. Clients lock only when true. */
  gateEnabled: boolean;
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
  sources?: ChecklistSourceIndex;
  /** F10: active journey_full. Default false (locked preview). */
  journeyFull?: boolean;
  /** F10: entitlement read failed (fallback journeyFull=false). */
  entitlementUnavailable?: boolean;
  /** F10: BILLING_GATE_ENABLED. Default false (matches the env default); getChecklist passes env. */
  gateEnabled?: boolean;
}): ChecklistView {
  const sources = args.sources ?? EMPTY_SOURCE_INDEX;
  const journeyFull = args.journeyFull ?? false;
  const gateEnabled = args.gateEnabled ?? false;
  const stateById = new Map(args.states.map((s) => [s.step_id, s]));
  const fallbackUpdatedAt = args.journeyCase.updatedAt;
  const phases = getPhasesForPath(args.pathId).map((phase) => {
    const access = phaseAccess(phase.id);
    const locked = gateEnabled && access === "paid" && !journeyFull;
    return {
    id: phase.id,
    name: phase.name,
    access,
    steps: phase.steps.map((step) => {
      const row = stateById.get(step.id);
      return {
        id: step.id,
        name: step.name,
        // F10 default: locked steps show title + sources only, no detail.
        detail: locked ? "" : step.detail,
        status: row?.status ?? ("not_started" as JourneyStepStatus),
        updatedAt: row?.updated_at ?? fallbackUpdatedAt,
        sources: [...(sources.byStep.get(step.id) ?? [])],
        access,
      };
    }),
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
    consulateSources: sources.consulateSources,
    sourcesVersion: sources.sourcesVersion,
    entitlement: args.entitlementUnavailable
      ? { journeyFull, unavailable: true, gateEnabled }
      : { journeyFull, gateEnabled },
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

  // Existing cases keep their rows. New catalog ids are inserted not_started.
  const nowIso = new Date().toISOString();
  const backfill = await insertMissingCatalogSteps(
    service,
    caseRes.case.caseId,
    caseRes.case.pathId,
    states.rows.map((r) => r.step_id),
    nowIso,
  );
  if (!backfill.ok) {
    return { ok: false, code: "DB_ERROR", message: backfill.message };
  }

  const rows = states.rows.slice();
  for (const inserted of backfill.inserted) {
    rows.push({
      step_id: inserted.step_id,
      status: "not_started",
      updated_at: inserted.updated_at,
    });
  }

  // F10: an entitlement read failure never fails the checklist (Gather must load).
  const ent = await hasActiveJourneyFull(service, userId);
  if (!ent.ok) {
    log.warn("journey checklist entitlement unavailable", { userId });
  }

  // F9: sources never fail the checklist — log and return empty sources.
  let sources = EMPTY_SOURCE_INDEX;
  const sourceRows = await loadChecklistSourceRows(service, caseRes.case.pathId);
  if (sourceRows.ok) {
    sources = indexChecklistSources(sourceRows.rows, caseRes.case.pathId);
  } else {
    log.warn("journey checklist sources unavailable", { pathId: caseRes.case.pathId });
  }

  return {
    ok: true,
    checklist: buildChecklistView({
      journeyCase: caseRes.case,
      pathId: caseRes.case.pathId,
      states: rows,
      sources,
      journeyFull: ent.ok ? ent.active : false,
      entitlementUnavailable: !ent.ok,
      gateEnabled: isBillingGateEnabled(),
    }),
  };
}
