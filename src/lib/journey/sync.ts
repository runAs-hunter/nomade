/**
 * F4 journey sync — batch monotonic merge + opId replay-safety (no new table).
 * Case A: optional pathId creates case when none exists, then applies mutations.
 * Case B: hasLocalDraft && server case → MERGE_REQUIRED (mirror bootstrap).
 */

import type { AccountDbClient } from "@/lib/account/export";
import {
  getStepDef,
  isJourneyStepStatus,
  isKnownPathId,
  type JourneyPathId,
  type JourneyStepStatus,
} from "@/lib/journey/catalog";
import {
  getJourneyCase,
  upsertJourneyCase,
  userHasJourneyCase,
} from "@/lib/journey/case";
import {
  buildChecklistView,
  getChecklist,
  loadStepStates,
  type ChecklistView,
} from "@/lib/journey/checklist";
import {
  shouldWriteMonotonic,
  type MergeSide,
} from "@/lib/journey/merge";

export type SyncMutation = {
  opId: string;
  stepId: string;
  status: JourneyStepStatus;
  clientUpdatedAt?: string;
};

export type SyncRejected = {
  opId: string;
  code: string;
};

export type SyncResult =
  | {
      ok: true;
      checklist: ChecklistView;
      appliedOpIds: string[];
      rejected: SyncRejected[];
    }
  | {
      ok: false;
      code: "MERGE_REQUIRED";
      message: string;
      hasServerJourney: true;
      hasLocalDraft: true;
    }
  | {
      ok: false;
      code:
        | "NO_JOURNEY_CASE"
        | "UNKNOWN_PATH"
        | "PATH_UNAVAILABLE"
        | "BAD_REQUEST"
        | "DB_ERROR";
      message: string;
    };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidOpId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Parse + validate sync mutations; invalid entries rejected with codes. */
export function parseSyncMutations(raw: unknown): {
  mutations: SyncMutation[];
  rejected: SyncRejected[];
  fatal?: string;
} {
  if (raw === undefined || raw === null) {
    return { mutations: [], rejected: [] };
  }
  if (!Array.isArray(raw)) {
    return {
      mutations: [],
      rejected: [],
      fatal: "mutations must be an array",
    };
  }

  const mutations: SyncMutation[] = [];
  const rejected: SyncRejected[] = [];
  const seenOpIds = new Set<string>();

  for (const item of raw) {
    if (item === null || typeof item !== "object") {
      rejected.push({ opId: "unknown", code: "BAD_MUTATION" });
      continue;
    }
    const row = item as Record<string, unknown>;
    const opIdRaw = row.opId;
    if (!isValidOpId(opIdRaw)) {
      rejected.push({
        opId: typeof opIdRaw === "string" ? opIdRaw : "unknown",
        code: "BAD_OP_ID",
      });
      continue;
    }
    const opId = opIdRaw.trim();
    if (seenOpIds.has(opId)) {
      // Duplicate in same batch: treat later as applied no-op via skip — reject duplicate
      rejected.push({ opId, code: "DUPLICATE_OP_ID" });
      continue;
    }
    seenOpIds.add(opId);

    if (typeof row.stepId !== "string" || row.stepId.trim().length === 0) {
      rejected.push({ opId, code: "BAD_STEP_ID" });
      continue;
    }
    if (!isJourneyStepStatus(row.status)) {
      rejected.push({ opId, code: "BAD_STATUS" });
      continue;
    }
    const clientUpdatedAt =
      typeof row.clientUpdatedAt === "string" &&
      row.clientUpdatedAt.trim().length > 0
        ? row.clientUpdatedAt.trim()
        : undefined;

    mutations.push({
      opId,
      stepId: row.stepId.trim(),
      status: row.status,
      clientUpdatedAt,
    });
  }

  return { mutations, rejected };
}

async function applyOneMutation(
  service: AccountDbClient,
  args: {
    caseId: string;
    pathId: JourneyPathId;
    mutation: SyncMutation;
    nowIso: string;
    /** In-memory map of step_id → current side (mutated as we go). */
    live: Map<string, MergeSide>;
  },
): Promise<"applied" | SyncRejected> {
  const { mutation, pathId, caseId, nowIso, live } = args;
  if (!getStepDef(pathId, mutation.stepId)) {
    return { opId: mutation.opId, code: "UNKNOWN_STEP" };
  }

  const serverSide: MergeSide = live.get(mutation.stepId) ?? {
    status: "not_started",
    updatedAt: nowIso,
  };

  const clientSide: MergeSide = {
    status: mutation.status,
    updatedAt: mutation.clientUpdatedAt ?? nowIso,
  };

  // Replay-safe without durable op log: if monotonic would not write (already
  // equal/higher), treat as applied (idempotent success).
  if (!shouldWriteMonotonic(serverSide, clientSide)) {
    return "applied";
  }

  const db = service.schema("internal");
  const upd = await db
    .from("journey_step_states")
    .update({ status: mutation.status, updated_at: nowIso })
    .eq("case_id", caseId)
    .eq("step_id", mutation.stepId)
    .select("step_id, status, updated_at")
    .maybeSingle();

  if (upd.error) {
    return { opId: mutation.opId, code: "DB_ERROR" };
  }

  if (!upd.data) {
    const ins = await db
      .from("journey_step_states")
      .insert({
        case_id: caseId,
        step_id: mutation.stepId,
        status: mutation.status,
        updated_at: nowIso,
      })
      .select("step_id, status, updated_at")
      .maybeSingle();
    if (ins.error || !ins.data) {
      return { opId: mutation.opId, code: "DB_ERROR" };
    }
    live.set(mutation.stepId, {
      status: mutation.status,
      updatedAt:
        (ins.data as { updated_at?: string }).updated_at ?? nowIso,
    });
  } else {
    live.set(mutation.stepId, {
      status: mutation.status,
      updatedAt:
        (upd.data as { updated_at?: string }).updated_at ?? nowIso,
    });
  }

  return "applied";
}

/**
 * Apply sync mutations with monotonic merge.
 * Idempotency (Open #4): no journey_sync_ops table — replay of same step/status
 * is a no-op success; duplicate opId in one batch is rejected.
 */
export async function syncJourney(
  service: AccountDbClient,
  args: {
    userId: string;
    mutations: SyncMutation[];
    rejectedSeed?: SyncRejected[];
    hasLocalDraft?: boolean;
    /** Case A: create case when none exists. */
    pathId?: string;
    nowIso?: string;
  },
): Promise<SyncResult> {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const rejected: SyncRejected[] = [...(args.rejectedSeed ?? [])];
  const hasLocalDraft = args.hasLocalDraft === true;

  const exists = await userHasJourneyCase(service, args.userId);
  if (!exists.ok) {
    return { ok: false, code: "DB_ERROR", message: exists.message };
  }

  // Case B gate — mirror bootstrap when local draft asserted and server case exists.
  if (hasLocalDraft && exists.hasServerJourney) {
    return {
      ok: false,
      code: "MERGE_REQUIRED",
      message:
        "Local draft and server journey both present; choose Keep server or Replace with local",
      hasServerJourney: true,
      hasLocalDraft: true,
    };
  }

  let caseRes = await getJourneyCase(service, args.userId);
  if (!caseRes.ok) {
    return { ok: false, code: "DB_ERROR", message: caseRes.message };
  }

  // Case A auto-attach: create case from pathId when none exists.
  if (!caseRes.case) {
    if (args.mutations.length === 0 && !args.pathId) {
      return {
        ok: false,
        code: "NO_JOURNEY_CASE",
        message: "No journey case — select a path first",
      };
    }
    if (!args.pathId) {
      return {
        ok: false,
        code: "NO_JOURNEY_CASE",
        message: "No journey case — provide pathId to auto-attach (Case A)",
      };
    }
    const created = await upsertJourneyCase(service, {
      userId: args.userId,
      pathId: args.pathId,
      nowIso,
    });
    if (!created.ok) {
      return {
        ok: false,
        code: created.code,
        message: created.message,
      };
    }
    caseRes = { ok: true, case: created.case };
  }

  const journeyCase = caseRes.case!;
  if (!isKnownPathId(journeyCase.pathId)) {
    return {
      ok: false,
      code: "UNKNOWN_PATH",
      message: "Journey case has unknown path",
    };
  }
  const pathId = journeyCase.pathId as JourneyPathId;

  const states = await loadStepStates(service, journeyCase.caseId);
  if (!states.ok) {
    return { ok: false, code: "DB_ERROR", message: states.message };
  }

  const live = new Map<string, MergeSide>();
  for (const row of states.rows) {
    live.set(row.step_id, { status: row.status, updatedAt: row.updated_at });
  }

  const appliedOpIds: string[] = [];
  let wrote = false;

  for (const mutation of args.mutations) {
    const result = await applyOneMutation(service, {
      caseId: journeyCase.caseId,
      pathId,
      mutation,
      nowIso,
      live,
    });
    if (result === "applied") {
      appliedOpIds.push(mutation.opId);
      // Only count as write when live status matches mutation (may have been no-op)
      const side = live.get(mutation.stepId);
      if (side && side.status === mutation.status && side.updatedAt === nowIso) {
        wrote = true;
      }
    } else {
      rejected.push(result);
    }
  }

  if (wrote) {
    const db = service.schema("internal");
    await db
      .from("journey_cases")
      .update({ updated_at: nowIso })
      .eq("id", journeyCase.caseId);
  }

  const checklistRes = await getChecklist(service, args.userId);
  if (!checklistRes.ok) {
    // Should not happen after create; fall back to build from live
    if (checklistRes.code === "NO_JOURNEY_CASE") {
      return { ok: false, code: "NO_JOURNEY_CASE", message: checklistRes.message };
    }
    return { ok: false, code: "DB_ERROR", message: checklistRes.message };
  }

  return {
    ok: true,
    checklist: checklistRes.checklist,
    appliedOpIds,
    rejected,
  };
}

/** Re-export buildChecklistView for tests that sync against in-memory state. */
export { buildChecklistView };
