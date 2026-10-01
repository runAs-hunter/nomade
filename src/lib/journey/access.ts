/**
 * F3 journey account gate — active accounts only.
 * pending_deletion → ACCOUNT_PENDING_DELETION; deleted → ACCOUNT_DELETED.
 */

import type { DeletionStatus } from "@/lib/account/bootstrap";
import type { AccountDbClient } from "@/lib/account/export";

export type JourneyUserRow = {
  id: string;
  deletion_status: DeletionStatus;
};

export type RequireActiveJourneyAccountResult =
  | { ok: true; user: JourneyUserRow }
  | {
      ok: false;
      code:
        | "NO_USER"
        | "ACCOUNT_PENDING_DELETION"
        | "ACCOUNT_DELETED"
        | "DB_ERROR";
      message: string;
    };

/**
 * Load internal.users and require deletion_status = active.
 * Journey routes refuse pending_deletion / deleted (unlike export).
 */
export async function requireActiveJourneyAccount(
  service: AccountDbClient,
  userId: string,
): Promise<RequireActiveJourneyAccountResult> {
  const db = service.schema("internal");
  const res = await db
    .from("users")
    .select("id, deletion_status")
    .eq("id", userId)
    .maybeSingle();

  if (res.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to read user" };
  }

  const user = (res.data as JourneyUserRow | null) ?? null;
  if (!user) {
    return { ok: false, code: "NO_USER", message: "Bootstrap required" };
  }
  if (user.deletion_status === "pending_deletion") {
    return {
      ok: false,
      code: "ACCOUNT_PENDING_DELETION",
      message: "Account pending deletion",
    };
  }
  if (user.deletion_status === "deleted") {
    return {
      ok: false,
      code: "ACCOUNT_DELETED",
      message: "Account deleted",
    };
  }
  return { ok: true, user };
}
