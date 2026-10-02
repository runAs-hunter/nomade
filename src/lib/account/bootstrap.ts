/**
 * F2.3 bootstrap helpers — pure merge-case logic + service_role upserts.
 * See docs/runbooks/F2.3-bootstrap-identity-runbook.md and F2.1 §7.
 */

export type MergeCase = "A" | "B" | "C" | "D";

export type ComputeMergeCaseInput = {
  hasLocalDraft: boolean;
  hasServerJourney: boolean;
  identityAlreadyLinked: boolean;
};

/**
 * Compute F2.1 §7 merge case.
 *
 * Priority: D (identity already linked) → B (both drafts) → A (local only) → C.
 *
 * F4: callers pass hasServerJourney from userHasJourneyCase (exists journey_cases).
 * MERGE_REQUIRED only when hasLocalDraft && hasServerJourney (Case B).
 */
export function computeMergeCase(input: ComputeMergeCaseInput): MergeCase {
  const { hasLocalDraft, hasServerJourney, identityAlreadyLinked } = input;

  if (identityAlreadyLinked) return "D";
  if (hasLocalDraft && hasServerJourney) return "B";
  if (hasLocalDraft && !hasServerJourney) return "A";
  return "C";
}

export type DeletionStatus = "active" | "pending_deletion" | "deleted";

export type BootstrapUserRow = {
  id: string;
  email: string | null;
  deletion_status: DeletionStatus;
};

export type BootstrapIdentityRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_subject: string;
  closed_at: string | null;
};

export type UpsertBootstrapResult =
  | {
      ok: true;
      userId: string;
      created: boolean;
      identityAlreadyLinked: boolean;
    }
  | {
      ok: false;
      code:
        | "ACCOUNT_PENDING_DELETION"
        | "ACCOUNT_DELETED"
        | "IDENTITY_CONFLICT"
        | "DB_ERROR";
      message: string;
    };

/** Minimal PostgREST surface used by upsert (mockable in unit tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BootstrapDbClient = { schema: (name: string) => any };

/**
 * Idempotent ensure of internal.users + Apple auth_identities via service_role.
 * Email null / email change must not mint a second user (keyed by auth user id).
 */
export async function upsertBootstrapIdentity(
  service: BootstrapDbClient,
  args: {
    userId: string;
    email: string | null | undefined;
    providerSubject: string;
  },
): Promise<UpsertBootstrapResult> {
  const { userId, providerSubject } = args;
  const email = args.email ?? null;
  const db = service.schema("internal");

  // --- users ---
  const existingUserRes = await db
    .from("users")
    .select("id, email, deletion_status")
    .eq("id", userId)
    .maybeSingle();

  if (existingUserRes.error) {
    return {
      ok: false,
      code: "DB_ERROR",
      message: "Failed to read user",
    };
  }

  const existingUser = existingUserRes.data as BootstrapUserRow | null;
  let created = false;

  if (existingUser) {
    if (existingUser.deletion_status === "pending_deletion") {
      return { ok: false, code: "ACCOUNT_PENDING_DELETION", message: "Account pending deletion" };
    }
    if (existingUser.deletion_status === "deleted") {
      return { ok: false, code: "ACCOUNT_DELETED", message: "Account deleted" };
    }
    // Refresh email snapshot if Auth provided one (null does not clear).
    if (email !== null && email !== existingUser.email) {
      const upd = await db
        .from("users")
        .update({ email })
        .eq("id", userId);
      if (upd.error) {
        return { ok: false, code: "DB_ERROR", message: "Failed to update user email" };
      }
    }
  } else {
    const insert = await db.from("users").insert({
      id: userId,
      email,
      deletion_status: "active",
    });
    if (insert.error) {
      // Concurrent insert race: re-read
      const again = await db
        .from("users")
        .select("id, email, deletion_status")
        .eq("id", userId)
        .maybeSingle();
      if (again.error || !again.data) {
        return { ok: false, code: "DB_ERROR", message: "Failed to create user" };
      }
      const row = again.data as BootstrapUserRow;
      if (row.deletion_status === "pending_deletion") {
        return { ok: false, code: "ACCOUNT_PENDING_DELETION", message: "Account pending deletion" };
      }
      if (row.deletion_status === "deleted") {
        return { ok: false, code: "ACCOUNT_DELETED", message: "Account deleted" };
      }
    } else {
      created = true;
    }
  }

  // --- auth_identities (apple) ---
  const existingIdRes = await db
    .from("auth_identities")
    .select("id, user_id, provider, provider_subject, closed_at")
    .eq("provider", "apple")
    .eq("provider_subject", providerSubject)
    .is("closed_at", null)
    .maybeSingle();

  if (existingIdRes.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to read identity" };
  }

  const existingIdentity = existingIdRes.data as BootstrapIdentityRow | null;
  let identityAlreadyLinked = false;

  if (existingIdentity) {
    if (existingIdentity.user_id !== userId) {
      return {
        ok: false,
        code: "IDENTITY_CONFLICT",
        message: "Apple identity linked to a different user",
      };
    }
    identityAlreadyLinked = true;
    // Soft-refresh email snapshot
    if (email !== null) {
      await db
        .from("auth_identities")
        .update({ email })
        .eq("id", existingIdentity.id);
    }
  } else {
    // Closed identity for same subject → treat as deleted / must re-signup new UUID
    // (F2.1 re-signup = new users.id). If only closed rows exist, insert is allowed
    // only when users.id matches a fresh auth user — uniqueness is on active rows.
    const insertId = await db.from("auth_identities").insert({
      user_id: userId,
      provider: "apple",
      provider_subject: providerSubject,
      email,
    });
    if (insertId.error) {
      // Unique race: re-read active row
      const again = await db
        .from("auth_identities")
        .select("id, user_id, provider, provider_subject, closed_at")
        .eq("provider", "apple")
        .eq("provider_subject", providerSubject)
        .is("closed_at", null)
        .maybeSingle();
      if (again.error || !again.data) {
        return { ok: false, code: "DB_ERROR", message: "Failed to link identity" };
      }
      const row = again.data as BootstrapIdentityRow;
      if (row.user_id !== userId) {
        return {
          ok: false,
          code: "IDENTITY_CONFLICT",
          message: "Apple identity linked to a different user",
        };
      }
      identityAlreadyLinked = true;
    }
  }

  return {
    ok: true,
    userId,
    created,
    identityAlreadyLinked,
  };
}
