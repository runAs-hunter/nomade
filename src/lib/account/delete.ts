/**
 * F2.6 soft-delete helpers — pending_deletion + close auth_identities.
 * See docs/runbooks/F2.6-account-deletion-export-runbook.md.
 *
 * No Auth admin deleteUser / purge / Apple revoke here (F2.6p / follow-ups).
 */

import type { DeletionStatus } from "@/lib/account/bootstrap";
import type { AccountDbClient } from "@/lib/account/export";

export type SoftDeleteSuccess = {
  userId: string;
  deletionStatus: "pending_deletion";
  deletedAt: string;
};

export type SoftDeleteResult =
  | { ok: true; value: SoftDeleteSuccess; alreadyPending: boolean }
  | {
      ok: false;
      code: "NO_USER" | "ACCOUNT_DELETED" | "DB_ERROR";
      message: string;
    };

type SoftDeleteUserRow = {
  id: string;
  deletion_status: DeletionStatus;
  deleted_at: string | null;
};

export const DELETE_CONFIRM_TOKEN = "DELETE";

/** True when body.confirm is exactly the locked confirm string. */
export function isValidDeleteConfirm(body: unknown): boolean {
  if (body === null || typeof body !== "object") return false;
  const confirm = (body as { confirm?: unknown }).confirm;
  return confirm === DELETE_CONFIRM_TOKEN;
}

/**
 * Idempotent soft delete for one userId.
 * active → pending_deletion + set deleted_at + close open identities.
 * already pending_deletion → same success shape (idempotent).
 * deleted → ACCOUNT_DELETED.
 */
export async function softDeleteAccount(
  service: AccountDbClient,
  userId: string,
  nowIso?: string,
): Promise<SoftDeleteResult> {
  const db = service.schema("internal");
  const deletedAt = nowIso ?? new Date().toISOString();

  const userRes = await db
    .from("users")
    .select("id, deletion_status, deleted_at")
    .eq("id", userId)
    .maybeSingle();

  if (userRes.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to read user" };
  }

  const user = (userRes.data as SoftDeleteUserRow | null) ?? null;
  if (!user) {
    return { ok: false, code: "NO_USER", message: "Bootstrap required" };
  }

  if (user.deletion_status === "deleted") {
    return {
      ok: false,
      code: "ACCOUNT_DELETED",
      message: "Account deleted",
    };
  }

  if (user.deletion_status === "pending_deletion") {
    return {
      ok: true,
      alreadyPending: true,
      value: {
        userId: user.id,
        deletionStatus: "pending_deletion",
        deletedAt: user.deleted_at ?? deletedAt,
      },
    };
  }

  // active → pending_deletion
  const upd = await db
    .from("users")
    .update({
      deletion_status: "pending_deletion",
      deleted_at: deletedAt,
      updated_at: deletedAt,
    })
    .eq("id", userId);

  if (upd.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to soft-delete user" };
  }

  const close = await db
    .from("auth_identities")
    .update({ closed_at: deletedAt })
    .eq("user_id", userId)
    .is("closed_at", null);

  if (close.error) {
    return {
      ok: false,
      code: "DB_ERROR",
      message: "Failed to close auth identities",
    };
  }

  return {
    ok: true,
    alreadyPending: false,
    value: {
      userId,
      deletionStatus: "pending_deletion",
      deletedAt,
    },
  };
}
