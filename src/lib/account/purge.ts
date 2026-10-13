/**
 * F2.6p hard purge — pending_deletion → deleted after 24h grace.
 * See docs/runbooks/F2.6p-account-hard-purge-runbook.md.
 *
 * Auth admin deleteUser lives here only (never soft-delete). No Apple revoke.
 * F3: wipeJourney deletes journey_cases (step_states cascade).
 * Chat wipe stub remains; F3.1 wipeBilling deletes entitlements and strips event raw_ref.
 */

import type { AccountDbClient } from "@/lib/account/export";

/** Max users processed per cron invocation (Open decision #8). */
export const PURGE_BATCH_SIZE = 50;

/** Grace window after soft-delete before hard purge (Open decision #1). */
export const PURGE_GRACE_MS = 24 * 60 * 60 * 1000;

export type PurgeUserRow = {
  id: string;
  deletion_status: string;
  deleted_at: string | null;
  email: string | null;
};

export type WipeResult = { wiped: number };

export type PurgeOutcomeCode =
  | "purged"
  | "skippedAlreadyDeleted"
  | "skippedLegalHold"
  | "authAlreadyGone"
  | "failed";

export type PurgeUserResult = {
  userId: string;
  outcome: PurgeOutcomeCode;
  /** Present when outcome is failed. Never includes PII. */
  failCode?: string;
};

export type PurgeBatchCounts = {
  scanned: number;
  purged: number;
  skippedAlreadyDeleted: number;
  skippedLegalHold: number;
  authAlreadyGone: number;
  failed: number;
};

export type PurgeBatchResult = PurgeBatchCounts & {
  results: PurgeUserResult[];
};

/** Minimal Auth admin surface used by purge (mockable in unit tests). */
export type AuthAdminClient = {
  auth: {
    admin: {
      deleteUser: (
        userId: string,
      ) => Promise<{ data: unknown; error: { message: string; status?: number } | null }>;
    };
  };
};

export type PurgeServiceClient = AccountDbClient & AuthAdminClient;

/**
 * Legal-hold stub (Open decision #7). Always false until a column exists.
 * Wire a real flag later without redesigning the purge runner.
 */
export function isUnderLegalHold(userId: string): boolean {
  void userId;
  return false;
}

/**
 * F3 journey wipe — DELETE internal.journey_cases for user (step_states cascade).
 * Returns wiped case row count. Chat/billing remain stubs.
 */
export async function wipeJourney(
  service: AccountDbClient,
  userId: string,
): Promise<WipeResult> {
  const db = service.schema("internal");
  const res = await db
    .from("journey_cases")
    .delete()
    .eq("user_id", userId)
    .select("id");

  if (res.error) {
    // Best-effort: do not abort purge on wipe failure.
    return { wiped: 0 };
  }
  const rows = (res.data as { id: string }[] | null) ?? [];
  return { wiped: rows.length };
}

/** Chat wipe stub — no-op until user-bound chat tables exist. */
export async function wipeChat(userId: string): Promise<WipeResult> {
  void userId;
  return { wiped: 0 };
}

/**
 * F3.1 billing wipe (Class E):
 * - DELETE derived entitlements for the user
 * - Retain append-only billing_events; strip raw_ref (no JWS residue)
 * Returns wiped entitlement row count.
 */
export async function wipeBilling(
  service: AccountDbClient,
  userId: string,
): Promise<WipeResult> {
  const db = service.schema("internal");

  const del = await db
    .from("entitlements")
    .delete()
    .eq("user_id", userId)
    .select("entitlement_id");

  // Best-effort strip of opaque refs on retained events
  await db
    .from("billing_events")
    .update({ raw_ref: null })
    .eq("user_id", userId);

  if (del.error) {
    return { wiped: 0 };
  }
  const rows = (del.data as { entitlement_id: string }[] | null) ?? [];
  return { wiped: rows.length };
}

/** True when Auth admin reports the user is already gone (idempotent success). */
export function isAuthUserMissingError(error: {
  message?: string;
  status?: number;
  code?: string;
} | null | undefined): boolean {
  if (!error) return false;
  if (error.status === 404) return true;
  const msg = (error.message ?? "").toLowerCase();
  if (msg.includes("user not found") || msg.includes("user_not_found")) {
    return true;
  }
  if (error.code === "user_not_found") return true;
  return false;
}

/** Cutoff ISO for eligibility: deleted_at <= now - 24h. */
export function purgeEligibilityCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - PURGE_GRACE_MS).toISOString();
}

/**
 * Load up to PURGE_BATCH_SIZE pending_deletion rows past the grace window.
 * Service-role / PostgREST only — never user Bearer.
 */
export async function listEligibleForPurge(
  service: AccountDbClient,
  opts?: { now?: Date; limit?: number },
): Promise<
  | { ok: true; users: PurgeUserRow[] }
  | { ok: false; code: "DB_ERROR"; message: string }
> {
  const cutoff = purgeEligibilityCutoff(opts?.now ?? new Date());
  const limit = opts?.limit ?? PURGE_BATCH_SIZE;
  const db = service.schema("internal");

  const res = await db
    .from("users")
    .select("id, deletion_status, deleted_at, email")
    .eq("deletion_status", "pending_deletion")
    .not("deleted_at", "is", null)
    .lte("deleted_at", cutoff)
    .order("deleted_at", { ascending: true })
    .limit(limit);

  if (res.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to list purge candidates" };
  }

  const users = (res.data as PurgeUserRow[] | null) ?? [];
  return { ok: true, users };
}

/**
 * Hard-purge one user: legal-hold → scrub → identities → domain stubs →
 * Auth deleteUser → mark deleted. Idempotent for already-deleted / Auth-missing.
 */
export async function purgeAccount(
  service: PurgeServiceClient,
  userId: string,
  opts?: {
    nowIso?: string;
    legalHold?: (id: string) => boolean;
  },
): Promise<PurgeUserResult> {
  const nowIso = opts?.nowIso ?? new Date().toISOString();
  const holdCheck = opts?.legalHold ?? isUnderLegalHold;
  const db = service.schema("internal");

  const userRes = await db
    .from("users")
    .select("id, deletion_status, deleted_at, email")
    .eq("id", userId)
    .maybeSingle();

  if (userRes.error) {
    return { userId, outcome: "failed", failCode: "DB_READ" };
  }

  const user = (userRes.data as PurgeUserRow | null) ?? null;
  if (!user) {
    return { userId, outcome: "failed", failCode: "NO_USER" };
  }

  if (user.deletion_status === "deleted") {
    return { userId, outcome: "skippedAlreadyDeleted" };
  }

  if (user.deletion_status !== "pending_deletion") {
    return { userId, outcome: "failed", failCode: "NOT_PENDING" };
  }

  if (holdCheck(userId)) {
    return { userId, outcome: "skippedLegalHold" };
  }

  // 1. Scrub Class B PII on users row (keep row; leave deleted_at)
  const scrub = await db
    .from("users")
    .update({
      email: null,
      updated_at: nowIso,
    })
    .eq("id", userId)
    .eq("deletion_status", "pending_deletion");

  if (scrub.error) {
    return { userId, outcome: "failed", failCode: "SCRUB" };
  }

  // 2. Close any still-open identities, then DELETE all for the user
  const close = await db
    .from("auth_identities")
    .update({ closed_at: nowIso })
    .eq("user_id", userId)
    .is("closed_at", null);

  if (close.error) {
    return { userId, outcome: "failed", failCode: "CLOSE_IDENTITIES" };
  }

  const delIdent = await db
    .from("auth_identities")
    .delete()
    .eq("user_id", userId);

  if (delIdent.error) {
    return { userId, outcome: "failed", failCode: "DELETE_IDENTITIES" };
  }

  // 3. Domain wipes — journey (F3); billing (F3.1); chat stub
  await wipeJourney(service, userId);
  await wipeChat(userId);
  await wipeBilling(service, userId);

  // 4. Auth admin deleteUser — missing user = success
  let authAlreadyGone = false;
  try {
    const authRes = await service.auth.admin.deleteUser(userId);
    if (authRes.error) {
      if (isAuthUserMissingError(authRes.error)) {
        authAlreadyGone = true;
      } else {
        return { userId, outcome: "failed", failCode: "AUTH_DELETE" };
      }
    }
  } catch {
    return { userId, outcome: "failed", failCode: "AUTH_DELETE_THROW" };
  }

  // 5. Mark deletion_status = deleted (leave deleted_at)
  const mark = await db
    .from("users")
    .update({
      deletion_status: "deleted",
      updated_at: nowIso,
    })
    .eq("id", userId);

  if (mark.error) {
    return { userId, outcome: "failed", failCode: "MARK_DELETED" };
  }

  return {
    userId,
    outcome: authAlreadyGone ? "authAlreadyGone" : "purged",
  };
}

function emptyCounts(): PurgeBatchCounts {
  return {
    scanned: 0,
    purged: 0,
    skippedAlreadyDeleted: 0,
    skippedLegalHold: 0,
    authAlreadyGone: 0,
    failed: 0,
  };
}

function bump(counts: PurgeBatchCounts, outcome: PurgeOutcomeCode): void {
  switch (outcome) {
    case "purged":
      counts.purged += 1;
      break;
    case "skippedAlreadyDeleted":
      counts.skippedAlreadyDeleted += 1;
      break;
    case "skippedLegalHold":
      counts.skippedLegalHold += 1;
      break;
    case "authAlreadyGone":
      counts.authAlreadyGone += 1;
      break;
    case "failed":
      counts.failed += 1;
      break;
  }
}

/**
 * Scan eligible pending_deletion users and purge up to batch size.
 * Continues on per-user failure (does not abort the batch).
 */
export async function runPurgeBatch(
  service: PurgeServiceClient,
  opts?: {
    now?: Date;
    nowIso?: string;
    limit?: number;
    legalHold?: (id: string) => boolean;
  },
): Promise<
  | { ok: true; value: PurgeBatchResult }
  | { ok: false; code: "DB_ERROR"; message: string }
> {
  const listed = await listEligibleForPurge(service, {
    now: opts?.now,
    limit: opts?.limit,
  });
  if (!listed.ok) return listed;

  const counts = emptyCounts();
  counts.scanned = listed.users.length;
  const results: PurgeUserResult[] = [];
  const nowIso = opts?.nowIso ?? (opts?.now ?? new Date()).toISOString();

  for (const row of listed.users) {
    const result = await purgeAccount(service, row.id, {
      nowIso,
      legalHold: opts?.legalHold,
    });
    results.push(result);
    bump(counts, result.outcome);
  }

  return { ok: true, value: { ...counts, results } };
}
