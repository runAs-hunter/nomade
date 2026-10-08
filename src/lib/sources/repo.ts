/**
 * F8 Official Sources — persistence (`internal.sources`, service client only).
 * Public reads always filter status = 'active'. Refresh writes operational
 * columns only (last_checked_at, last_http_status, content_hash, status).
 */

import type { AccountDbClient } from "@/lib/account/export";
import {
  ALL_SOURCE_COLUMNS,
  PUBLIC_SOURCE_COLUMNS,
  type PublicSourceRow,
  type SourceRow,
} from "@/lib/sources/types";

export type SourcesDbClient = AccountDbClient;

type DbError = { code?: string; message?: string } | null;

export type RepoResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "NOT_FOUND" | "CONFLICT" | "DB_ERROR"; message: string };

function dbFailure<T>(error: DbError, fallback: string): RepoResult<T> {
  if (error?.code === "23505") {
    return { ok: false, code: "CONFLICT", message: "A source with this id or officialUrl already exists" };
  }
  return { ok: false, code: "DB_ERROR", message: fallback };
}

/** Case-insensitive substring match on title / publisher / scope (in-memory; small table). */
export function matchesQuery(row: Pick<PublicSourceRow, "title" | "publisher" | "scope">, q: string): boolean {
  const needle = q.toLocaleLowerCase();
  return [row.title, row.publisher, row.scope].some((v) =>
    (v ?? "").toLocaleLowerCase().includes(needle),
  );
}

/** Active rows, optionally tagged with pathId (array contains) and filtered by q. */
export async function listActiveSources(
  service: SourcesDbClient,
  opts: { pathId: string | null; q: string | null },
): Promise<RepoResult<PublicSourceRow[]>> {
  let query = service
    .schema("internal")
    .from("sources")
    .select(PUBLIC_SOURCE_COLUMNS)
    .eq("status", "active");
  if (opts.pathId) {
    query = query.contains("path_ids", [opts.pathId]);
  }
  const res = await query.order("id", { ascending: true });
  if (res.error) return dbFailure(res.error, "Failed to list sources");
  let rows = (res.data ?? []) as PublicSourceRow[];
  if (opts.q) {
    const q = opts.q;
    rows = rows.filter((r) => matchesQuery(r, q));
  }
  return { ok: true, value: rows };
}

/** One active row by id; non-active or missing → NOT_FOUND. */
export async function getActiveSource(
  service: SourcesDbClient,
  id: string,
): Promise<RepoResult<PublicSourceRow>> {
  const res = await service
    .schema("internal")
    .from("sources")
    .select(PUBLIC_SOURCE_COLUMNS)
    .eq("id", id)
    .eq("status", "active")
    .maybeSingle();
  if (res.error) return dbFailure(res.error, "Failed to read source");
  if (!res.data) return { ok: false, code: "NOT_FOUND", message: "Source not found" };
  return { ok: true, value: res.data as PublicSourceRow };
}

export async function insertSource(
  service: SourcesDbClient,
  columns: Record<string, unknown>,
): Promise<RepoResult<SourceRow>> {
  const res = await service
    .schema("internal")
    .from("sources")
    .insert(columns)
    .select(ALL_SOURCE_COLUMNS)
    .single();
  if (res.error) return dbFailure(res.error, "Failed to create source");
  return { ok: true, value: res.data as SourceRow };
}

export async function updateSource(
  service: SourcesDbClient,
  id: string,
  columns: Record<string, unknown>,
): Promise<RepoResult<SourceRow>> {
  const res = await service
    .schema("internal")
    .from("sources")
    .update(columns)
    .eq("id", id)
    .select(ALL_SOURCE_COLUMNS)
    .maybeSingle();
  if (res.error) return dbFailure(res.error, "Failed to update source");
  if (!res.data) return { ok: false, code: "NOT_FOUND", message: "Source not found" };
  return { ok: true, value: res.data as SourceRow };
}

/** Rows the refresh job probes (status = active). */
export type CheckableSourceRow = Pick<
  SourceRow,
  "id" | "official_url" | "status" | "content_hash"
>;

export async function listActiveForCheck(
  service: SourcesDbClient,
): Promise<RepoResult<CheckableSourceRow[]>> {
  const res = await service
    .schema("internal")
    .from("sources")
    .select("id, official_url, status, content_hash")
    .eq("status", "active")
    .order("id", { ascending: true });
  if (res.error) return dbFailure(res.error, "Failed to list sources for check");
  return { ok: true, value: (res.data ?? []) as CheckableSourceRow[] };
}

export type CheckUpdate = {
  last_checked_at: string;
  last_http_status: number;
  content_hash?: string;
  status?: "stale";
};

/**
 * Operational-only update. Guarded by status = active so a concurrent admin
 * retire is never overwritten.
 */
export async function applyCheckUpdate(
  service: SourcesDbClient,
  id: string,
  update: CheckUpdate,
): Promise<RepoResult<null>> {
  const res = await service
    .schema("internal")
    .from("sources")
    .update(update)
    .eq("id", id)
    .eq("status", "active");
  if (res.error) return dbFailure(res.error, "Failed to record check");
  return { ok: true, value: null };
}
