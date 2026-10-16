/**
 * F3/F4 checklist join — catalog + step statuses + progress.
 * F4: each step exposes updatedAt for client echo / expectedUpdatedAt.
 */

import type { AccountDbClient } from "@/lib/account/export";
import { phaseAccess, type PhaseAccess } from "@/lib/billing/catalog";
import { hasActiveJourneyFull } from "@/lib/billing/entitlements";
import { isBillingGateEnabled, isIntakeEnabled } from "@/lib/env";
import {
  JOURNEY_CATALOG_VERSION,
  JOURNEY_DISCLAIMER,
  computeProgress,
  getPhasesForPath,
  isKnownPathId,
  stepSummaryFor,
  type JourneyStepSummaries,
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
import {
  INTAKE_RULES_VERSION,
  applyIntakeRules,
  type IntakeFlagCode,
  type IntakeNoteKey,
  type StepPatch,
} from "@/lib/journey/intake";
import { INTAKE_FLAG_COPY, INTAKE_NOTE_COPY } from "@/lib/journey/intake-copy";
import { loadIntake, type IntakeView } from "@/lib/journey/intake-store";
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
  /** F11a (INTAKE_ENABLED only): Visa Ops notes appended under `detail`. */
  notes?: ChecklistStepNote[];
  /** F11a (INTAKE_ENABLED only): "intake" for rule-added conditional steps. */
  origin?: "catalog" | "intake";
  /**
   * Task card v2: Visa Ops one-line summary. Omitted (no key) when there is no
   * copy for this step, and on locked steps (same rule as `detail`).
   */
  summary?: string;
};

export type ChecklistStepNote = {
  key: IntakeNoteKey;
  text: string;
  sourceIds: string[];
  /** Visa Ops marked this note uncertain. */
  uncertain?: true;
};

export type ChecklistIntakeFlag = {
  code: IntakeFlagCode;
  /** Visa Ops copy (TIMELINE: sub-text; the client renders "Target: <Mon YYYY>"). */
  text: string;
  sourceIds: string[];
  /**
   * INCOME_BELOW_THRESHOLD: the user's consulate rows for the step, per US post
   * id. The client cites `consulateSourceIds[<its post>]` alongside `sourceIds`.
   */
  consulateSourceIds?: Record<string, string[]>;
};

export type ChecklistIntakeSummary = {
  completed: boolean;
  rulesVersion: string;
  /**
   * Every source row cited by a flag or note (incl. consulateSourceIds), so the
   * client never has to drop a citation it cannot find in step/consulate rows.
   */
  sources: ChecklistSourceView[];
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
  /** F11a (INTAKE_ENABLED only). */
  intake?: ChecklistIntakeSummary;
  /** F11a (INTAKE_ENABLED only): UI cards; codes, never copy. */
  flags?: ChecklistIntakeFlag[];
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

/**
 * F11a visibility: a conditional step shows only when a rule adds it; a
 * `hide` patch removes a catalog step. State rows are never deleted.
 */
export function isStepVisible(
  step: { id: string; conditional?: true },
  patches: readonly StepPatch[],
): boolean {
  if (patches.some((p) => p.kind === "hide" && p.stepId === step.id)) return false;
  if (step.conditional) {
    return patches.some((p) => p.kind === "add" && p.stepId === step.id);
  }
  return true;
}

/** F11a: rule patches for a case (empty when the flag is off or no intake). */
export function intakePatchesFor(
  pathId: JourneyPathId,
  intakeEnabled: boolean,
  intake: IntakeView | null | undefined,
  now: Date = new Date(),
): StepPatch[] {
  if (!intakeEnabled || !intake) return [];
  return applyIntakeRules(pathId, intake.answers, now);
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
  /**
   * F11a: INTAKE_ENABLED. When false/omitted the view is byte-identical to F10
   * (no intake/flags/notes/origin keys) and stored answers are ignored.
   */
  intakeEnabled?: boolean;
  /** F11a: stored answers (null = none yet). Only read when intakeEnabled. */
  intake?: IntakeView | null;
  /** F11a: clock for month-relative rules (FBI timeline). */
  now?: Date;
  /** Task card v2: summary copy (tests inject; default = catalog). */
  stepSummaries?: JourneyStepSummaries;
}): ChecklistView {
  const sources = args.sources ?? EMPTY_SOURCE_INDEX;
  const intakeOn = args.intakeEnabled === true;
  const patches = intakePatchesFor(args.pathId, intakeOn, args.intake, args.now);
  // Cite only ids present in the active source set (inactive rows never cited).
  // When sources failed to load (empty index) the copy's ids pass through.
  const activeIds = sources.activeIds ?? new Set<string>();
  const cite = (ids: readonly string[]): string[] =>
    activeIds.size === 0 ? [...ids] : ids.filter((id) => activeIds.has(id));
  const notesByStep = new Map<string, ChecklistStepNote[]>();
  for (const p of patches) {
    if (p.kind !== "note") continue;
    const copy = INTAKE_NOTE_COPY[p.noteKey];
    const list = notesByStep.get(p.stepId) ?? [];
    const note: ChecklistStepNote = { key: p.noteKey, text: copy.text, sourceIds: cite(copy.sourceIds) };
    if (copy.uncertain) note.uncertain = true;
    list.push(note);
    notesByStep.set(p.stepId, list);
  }
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
    // F11a decision 4: hidden steps keep their state rows; they are only
    // excluded from the view and from progress.
    steps: phase.steps.filter((step) => isStepVisible(step, patches)).map((step) => {
      const row = stateById.get(step.id);
      const base: ChecklistStepView = {
        id: step.id,
        name: step.name,
        // F10 default: locked steps show title + sources only, no detail.
        detail: locked ? "" : step.detail,
        status: row?.status ?? ("not_started" as JourneyStepStatus),
        updatedAt: row?.updated_at ?? fallbackUpdatedAt,
        sources: [...(sources.byStep.get(step.id) ?? [])],
        access,
      };
      const summary = locked ? undefined : stepSummaryFor(args.pathId, step.id, args.stepSummaries);
      if (summary) base.summary = summary;
      if (intakeOn) {
        base.notes = locked ? [] : (notesByStep.get(step.id) ?? []);
        base.origin = step.conditional ? "intake" : "catalog";
      }
      return base;
    }),
    };
  });

  const statuses = phases.flatMap((p) => p.steps.map((s) => s.status));
  const view: ChecklistView = {
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
  if (intakeOn) {
    view.intake = {
      completed: Boolean(args.intake?.completedAt),
      rulesVersion: INTAKE_RULES_VERSION,
      sources: [],
    };
    const seen = new Set<IntakeFlagCode>();
    view.flags = [];
    for (const p of patches) {
      if (p.kind !== "flag" || seen.has(p.code)) continue;
      seen.add(p.code);
      const copy = INTAKE_FLAG_COPY[p.code];
      const flag: ChecklistIntakeFlag = { code: p.code, text: copy.text, sourceIds: cite(copy.sourceIds) };
      if (copy.consulateStepId) {
        // The device picks its own post (residence stays on device, F9 lock).
        const step = copy.consulateStepId;
        const byPost: Record<string, string[]> = {};
        for (const [post, rows] of Object.entries(sources.consulateSources)) {
          const ids = rows.filter((r) => (r.stepIds ?? []).includes(step)).map((r) => r.id);
          if (ids.length > 0) byPost[post] = ids;
        }
        flag.consulateSourceIds = byPost;
      }
      view.flags.push(flag);
    }
    const cited = new Set<string>();
    for (const f of view.flags) {
      f.sourceIds.forEach((id) => cited.add(id));
      Object.values(f.consulateSourceIds ?? {}).forEach((ids) => ids.forEach((id) => cited.add(id)));
    }
    for (const list of notesByStep.values()) list.forEach((n) => n.sourceIds.forEach((id) => cited.add(id)));
    const byId = sources.byId ?? new Map<string, ChecklistSourceView>();
    view.intake.sources = [...cited]
      .sort()
      .map((id) => byId.get(id))
      .filter((s): s is ChecklistSourceView => Boolean(s));
  }
  return view;
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

  // F11a: intake never fails the checklist — log and serve catalog defaults.
  const intakeEnabled = isIntakeEnabled();
  let intake: IntakeView | null = null;
  if (intakeEnabled) {
    const intakeRes = await loadIntake(service, caseRes.case.caseId);
    if (intakeRes.ok) intake = intakeRes.intake;
    else log.warn("journey checklist intake unavailable", { userId });
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
      intakeEnabled,
      intake,
    }),
  };
}
