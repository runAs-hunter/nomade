/**
 * F2.6 soft-delete helpers — pending_deletion + close auth_identities.
 * See docs/runbooks/F2.6-account-deletion-export-runbook.md.
 *
 * F2.6r: when a fresh Apple authorization code is present, revoke at Apple
 * BEFORE pending_deletion / identity close. Already-pending replays skip revoke.
 * No Auth admin deleteUser here (F2.6p). Purge does not revoke.
 */

import {
  AppleRevokeError,
  revokeAppleAuthorizationCode,
} from "@/lib/apple/revoke";
import type { DeletionStatus } from "@/lib/account/bootstrap";
import type { AccountDbClient } from "@/lib/account/export";

export type SoftDeleteSuccess = {
  userId: string;
  deletionStatus: "pending_deletion";
  deletedAt: string;
  /** True only when this call revoked at Apple. Idempotent / no-code → false. */
  appleRevoked: boolean;
};

export type SoftDeleteFailureCode =
  | "NO_USER"
  | "ACCOUNT_DELETED"
  | "DB_ERROR"
  | "APPLE_REVOKE_FAILED"
  | "APPLE_REVOKE_MISCONFIGURED";

export type SoftDeleteResult =
  | { ok: true; value: SoftDeleteSuccess; alreadyPending: boolean }
  | {
      ok: false;
      code: SoftDeleteFailureCode;
      message: string;
    };

type SoftDeleteUserRow = {
  id: string;
  deletion_status: DeletionStatus;
  deleted_at: string | null;
};

export type SoftDeleteOptions = {
  nowIso?: string;
  /** Fresh native SIWA authorization code. Empty/absent → skip revoke. */
  appleAuthorizationCode?: string | null;
  /** Test injection. Default calls Apple /auth/token + /auth/revoke. */
  revokeAuthorizationCode?: (code: string) => Promise<void>;
};

export const DELETE_CONFIRM_TOKEN = "DELETE";

/** Native authorization codes are short; reject absurd bodies before Apple. */
export const APPLE_AUTHORIZATION_CODE_MAX = 4096;

/** True when body.confirm is exactly the locked confirm string. */
export function isValidDeleteConfirm(body: unknown): boolean {
  if (body === null || typeof body !== "object") return false;
  const confirm = (body as { confirm?: unknown }).confirm;
  return confirm === DELETE_CONFIRM_TOKEN;
}

/**
 * Read optional appleAuthorizationCode.
 * Missing / null / blank → no code (skip revoke).
 * Non-string or over max length → invalid (caller returns 400).
 */
export function readAppleAuthorizationCode(
  body: unknown,
): { ok: true; code?: string } | { ok: false } {
  if (body === null || typeof body !== "object") return { ok: true };
  if (!Object.prototype.hasOwnProperty.call(body, "appleAuthorizationCode")) {
    return { ok: true };
  }
  const raw = (body as { appleAuthorizationCode?: unknown }).appleAuthorizationCode;
  if (raw === undefined || raw === null) return { ok: true };
  if (typeof raw !== "string") return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true };
  if (trimmed.length > APPLE_AUTHORIZATION_CODE_MAX) return { ok: false };
  return { ok: true, code: trimmed };
}

function normalizeOptions(arg?: string | SoftDeleteOptions): SoftDeleteOptions {
  if (typeof arg === "string") return { nowIso: arg };
  return arg ?? {};
}

/**
 * Idempotent soft delete for one userId.
 * active → (optional Apple revoke) → pending_deletion + set deleted_at + close open identities.
 * already pending_deletion → same success shape (idempotent); Apple revoke skipped.
 * deleted → ACCOUNT_DELETED.
 * Code present and revoke fails → no status change.
 */
export async function softDeleteAccount(
  service: AccountDbClient,
  userId: string,
  nowIsoOrOptions?: string | SoftDeleteOptions,
): Promise<SoftDeleteResult> {
  const options = normalizeOptions(nowIsoOrOptions);
  const db = service.schema("internal");
  const deletedAt = options.nowIso ?? new Date().toISOString();

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
        appleRevoked: false,
      },
    };
  }

  const code = options.appleAuthorizationCode?.trim() ?? "";
  let appleRevoked = false;
  if (code.length > 0) {
    const revoke =
      options.revokeAuthorizationCode ??
      ((authorizationCode: string) =>
        revokeAppleAuthorizationCode({ authorizationCode }));
    try {
      await revoke(code);
      appleRevoked = true;
    } catch (err) {
      if (err instanceof AppleRevokeError) {
        return {
          ok: false,
          code: err.code,
          message: "Apple token revoke failed",
        };
      }
      return {
        ok: false,
        code: "APPLE_REVOKE_FAILED",
        message: "Apple token revoke failed",
      };
    }
  }

  // active → pending_deletion (only after revoke succeeds, when a code was sent)
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
      appleRevoked,
    },
  };
}
