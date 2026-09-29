/**
 * F2.6 account export — build user-scoped JSON envelope.
 * See docs/runbooks/F2.6-account-deletion-export-runbook.md.
 *
 * providerSubject may appear in the export file (user-owned). Never log it.
 */

import type { DeletionStatus } from "@/lib/account/bootstrap";

export type ExportAccount = {
  createdAt: string;
  updatedAt: string;
  emailPresent: boolean;
  /** Included only when a non-empty email exists on internal.users. */
  email?: string;
};

export type ExportIdentity = {
  provider: string;
  providerSubject: string;
  createdAt: string;
  closedAt: string | null;
};

export type AccountExportEnvelope = {
  exportedAt: string;
  userId: string;
  deletionStatus: DeletionStatus;
  account: ExportAccount;
  identities: ExportIdentity[];
  journey: [];
  chat: [];
  billing: [];
  notes: string[];
};

export type ExportUserRow = {
  id: string;
  email: string | null;
  deletion_status: DeletionStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ExportIdentityRow = {
  provider: string;
  provider_subject: string;
  created_at: string;
  closed_at: string | null;
};

/** Minimal PostgREST surface used by export (mockable in unit tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AccountDbClient = { schema: (name: string) => any };

export type BuildExportResult =
  | { ok: true; envelope: AccountExportEnvelope }
  | {
      ok: false;
      code: "NO_USER" | "ACCOUNT_DELETED" | "DB_ERROR";
      message: string;
    };

const EXPORT_NOTES = [
  "journey/chat/billing arrays empty until those domains ship; format stable for clients",
];

/**
 * Pure builder — no I/O. Unit-testable without a DB.
 * Omits `account.email` when null/empty (prefer omit over null).
 */
export function buildExportEnvelope(args: {
  user: ExportUserRow;
  identities: ExportIdentityRow[];
  exportedAt?: string;
}): AccountExportEnvelope {
  const { user, identities } = args;
  const email =
    typeof user.email === "string" && user.email.trim().length > 0
      ? user.email.trim()
      : null;

  const account: ExportAccount = {
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    emailPresent: email !== null,
  };
  if (email !== null) {
    account.email = email;
  }

  return {
    exportedAt: args.exportedAt ?? new Date().toISOString(),
    userId: user.id,
    deletionStatus: user.deletion_status,
    account,
    identities: identities.map((row) => ({
      provider: row.provider,
      providerSubject: row.provider_subject,
      createdAt: row.created_at,
      closedAt: row.closed_at,
    })),
    journey: [],
    chat: [],
    billing: [],
    notes: [...EXPORT_NOTES],
  };
}

/**
 * Load user-scoped rows and build the export envelope.
 * Always scoped to `userId` (IDOR-safe). Allows pending_deletion; rejects deleted.
 */
export async function loadAccountExport(
  service: AccountDbClient,
  userId: string,
  exportedAt?: string,
): Promise<BuildExportResult> {
  const db = service.schema("internal");

  const userRes = await db
    .from("users")
    .select("id, email, deletion_status, created_at, updated_at, deleted_at")
    .eq("id", userId)
    .maybeSingle();

  if (userRes.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to read user" };
  }

  const user = (userRes.data as ExportUserRow | null) ?? null;
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

  const idRes = await db
    .from("auth_identities")
    .select("provider, provider_subject, created_at, closed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (idRes.error) {
    return { ok: false, code: "DB_ERROR", message: "Failed to read identities" };
  }

  const identities = (idRes.data as ExportIdentityRow[] | null) ?? [];

  return {
    ok: true,
    envelope: buildExportEnvelope({ user, identities, exportedAt }),
  };
}
