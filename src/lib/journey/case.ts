/**
 * F3 journey case get/create + path-change reset.
 * Fresh server case seeds all steps not_started (no local prototype import).
 */

import type { AccountDbClient } from "@/lib/account/export";
import {
  JOURNEY_COUNTRY_CODE,
  getPathDef,
  isKnownPathId,
  listStepDefsForPath,
  type JourneyPathId,
} from "@/lib/journey/catalog";

export type JourneyCaseRow = {
  id: string;
  user_id: string;
  path_id: string;
  country_code: string;
  created_at: string;
  updated_at: string;
};

export type JourneyCaseView = {
  caseId: string;
  pathId: string;
  countryCode: string;
  createdAt: string;
  updatedAt: string;
};

export function toCaseView(row: JourneyCaseRow): JourneyCaseView {
  return {
    caseId: row.id,
    pathId: row.path_id,
    countryCode: row.country_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type GetCaseResult =
  | { ok: true; case: JourneyCaseView | null }
  | { ok: false; code: "DB_ERROR"; message: string };

export type UpsertCaseResult =
  | {
      ok: true;
      case: JourneyCaseView;
      created: boolean;
      pathChanged: boolean;
    }
  | {
      ok: false;
      code: "UNKNOWN_PATH" | "PATH_UNAVAILABLE" | "DB_ERROR";
      message: string;
    };


/** True when the user has any journey_cases row (Italy V1: one per country). */
export async function userHasJourneyCase(
  service: AccountDbClient,
  userId: string,
): Promise<
  | { ok: true; hasServerJourney: boolean }
  | { ok: false; code: "DB_ERROR"; message: string }
> {
  const db = service.schema("internal");
  const res = await db
    .from("journey_cases")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (res.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to check journey case" };
  }
  return { ok: true, hasServerJourney: res.data != null };
}

/** Load the user's Italy case (V1 one per country), or null. */
export async function getJourneyCase(
  service: AccountDbClient,
  userId: string,
  countryCode: string = JOURNEY_COUNTRY_CODE,
): Promise<GetCaseResult> {
  const db = service.schema("internal");
  const res = await db
    .from("journey_cases")
    .select("id, user_id, path_id, country_code, created_at, updated_at")
    .eq("user_id", userId)
    .eq("country_code", countryCode)
    .maybeSingle();

  if (res.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to read journey case" };
  }

  const row = (res.data as JourneyCaseRow | null) ?? null;
  return { ok: true, case: row ? toCaseView(row) : null };
}

/**
 * F5 additive seed: insert catalog step ids that an existing case does not
 * have yet. Status is not_started. Does not delete orphan rows and does not
 * update existing statuses (no progress reset, no migration).
 */
export async function insertMissingCatalogSteps(
  service: AccountDbClient,
  caseId: string,
  pathId: JourneyPathId,
  existingStepIds: readonly string[],
  nowIso: string,
): Promise<
  | { ok: true; inserted: { step_id: string; updated_at: string }[] }
  | { ok: false; message: string }
> {
  const have = new Set(existingStepIds);
  const missing = listStepDefsForPath(pathId).filter((s) => !have.has(s.id));
  if (missing.length === 0) {
    return { ok: true, inserted: [] };
  }

  const db = service.schema("internal");
  const rows = missing.map((s) => ({
    case_id: caseId,
    step_id: s.id,
    status: "not_started" as const,
    updated_at: nowIso,
  }));
  const ins = await db.from("journey_step_states").insert(rows);
  if (ins.error) {
    return { ok: false, message: "Failed to add missing journey steps" };
  }
  return {
    ok: true,
    inserted: rows.map((r) => ({ step_id: r.step_id, updated_at: r.updated_at })),
  };
}

async function seedStepStates(
  service: AccountDbClient,
  caseId: string,
  pathId: JourneyPathId,
  nowIso: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = service.schema("internal");
  const steps = listStepDefsForPath(pathId);
  const rows = steps.map((s) => ({
    case_id: caseId,
    step_id: s.id,
    status: "not_started" as const,
    updated_at: nowIso,
  }));

  if (rows.length === 0) {
    return { ok: true };
  }

  const ins = await db.from("journey_step_states").insert(rows);
  if (ins.error) {
    return { ok: false, message: "Failed to seed journey steps" };
  }
  return { ok: true };
}

async function resetStepStates(
  service: AccountDbClient,
  caseId: string,
  pathId: JourneyPathId,
  nowIso: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = service.schema("internal");
  const del = await db
    .from("journey_step_states")
    .delete()
    .eq("case_id", caseId);
  if (del.error) {
    return { ok: false, message: "Failed to clear journey steps" };
  }
  return seedStepStates(service, caseId, pathId, nowIso);
}

/**
 * Create Italy case for pathId, or return existing same path.
 * Path change: update path_id + reset all step statuses (Cap default).
 * Does NOT import local prototype completions.
 */
export async function upsertJourneyCase(
  service: AccountDbClient,
  args: {
    userId: string;
    pathId: string;
    nowIso?: string;
    countryCode?: string;
  },
): Promise<UpsertCaseResult> {
  const pathDef = getPathDef(args.pathId);
  if (!pathDef || !isKnownPathId(args.pathId)) {
    return {
      ok: false,
      code: "UNKNOWN_PATH",
      message: "Unknown journey path",
    };
  }
  if (!pathDef.available) {
    return {
      ok: false,
      code: "PATH_UNAVAILABLE",
      message: "Journey path not available",
    };
  }

  const pathId = args.pathId as JourneyPathId;
  const countryCode = args.countryCode ?? JOURNEY_COUNTRY_CODE;
  const nowIso = args.nowIso ?? new Date().toISOString();
  const db = service.schema("internal");

  const existingRes = await db
    .from("journey_cases")
    .select("id, user_id, path_id, country_code, created_at, updated_at")
    .eq("user_id", args.userId)
    .eq("country_code", countryCode)
    .maybeSingle();

  if (existingRes.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to read journey case" };
  }

  const existing = (existingRes.data as JourneyCaseRow | null) ?? null;

  if (existing) {
    if (existing.path_id === pathId) {
      return {
        ok: true,
        case: toCaseView(existing),
        created: false,
        pathChanged: false,
      };
    }

    const upd = await db
      .from("journey_cases")
      .update({ path_id: pathId, updated_at: nowIso })
      .eq("id", existing.id)
      .select("id, user_id, path_id, country_code, created_at, updated_at")
      .maybeSingle();

    if (upd.error || !upd.data) {
      return { ok: false, code: "DB_ERROR", message: "Failed to update journey path" };
    }

    const reset = await resetStepStates(service, existing.id, pathId, nowIso);
    if (!reset.ok) {
      return { ok: false, code: "DB_ERROR", message: reset.message };
    }

    return {
      ok: true,
      case: toCaseView(upd.data as JourneyCaseRow),
      created: false,
      pathChanged: true,
    };
  }

  const ins = await db
    .from("journey_cases")
    .insert({
      user_id: args.userId,
      path_id: pathId,
      country_code: countryCode,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id, user_id, path_id, country_code, created_at, updated_at")
    .maybeSingle();

  if (ins.error || !ins.data) {
    return { ok: false, code: "DB_ERROR", message: "Failed to create journey case" };
  }

  const created = ins.data as JourneyCaseRow;
  const seeded = await seedStepStates(service, created.id, pathId, nowIso);
  if (!seeded.ok) {
    return { ok: false, code: "DB_ERROR", message: seeded.message };
  }

  return {
    ok: true,
    case: toCaseView(created),
    created: true,
    pathChanged: false,
  };
}
