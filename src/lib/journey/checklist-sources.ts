/**
 * F9 — checklist cites official sources.
 * Joins active `internal.sources` rows onto checklist steps via `step_ids`.
 * Only active rows are read (stale/retired are hidden). No URL is hardcoded:
 * every link comes from `official_url`. The user's consulate post is resolved
 * on the device; the server returns rows for every post (`consulateSources`).
 */

import type { AccountDbClient } from "@/lib/account/export";
import {
  PUBLIC_SOURCE_COLUMNS,
  type PublicSourceRow,
  type SourceDocType,
} from "@/lib/sources/types";

export type ChecklistSourceRow = PublicSourceRow & { updated_at: string };

export type ChecklistSourceView = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  /** Hostname of `url`, `www.` stripped. */
  host: string;
  /** Visa Ops curation date (YYYY-MM-DD) — the "Last verified" date. */
  retrievedAt: string;
  docType: SourceDocType;
  /** Present on consulate rows so the client can filter per step. */
  stepIds?: string[];
};

export const US_CONSULATE_SCOPE_PREFIX = "US-consulate:";

/**
 * Consulate-scoped rows that apply to every post (the Washington consular
 * network jurisdiction map). Ids only — the URL still comes from the row.
 */
export const CROSS_POST_SOURCE_IDS: readonly string[] = ["us-washington-consular-network"];

export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function toChecklistSource(row: ChecklistSourceRow, withStepIds: boolean): ChecklistSourceView {
  const view: ChecklistSourceView = {
    id: row.id,
    title: row.title,
    publisher: row.publisher,
    url: row.official_url,
    host: sourceHost(row.official_url),
    retrievedAt: row.retrieved_at,
    docType: row.doc_type,
  };
  if (withStepIds) view.stepIds = [...(row.step_ids ?? [])];
  return view;
}

export type ChecklistSourceIndex = {
  byStep: Map<string, ChecklistSourceView[]>;
  consulateSources: Record<string, ChecklistSourceView[]>;
  sourcesVersion: string | null;
  /** F11a: every active id for this path (citable by intake notes/flags). */
  activeIds?: ReadonlySet<string>;
  /** F11a: every active row for this path by id, so intake citations resolve. */
  byId?: ReadonlyMap<string, ChecklistSourceView>;
};

export const EMPTY_SOURCE_INDEX: ChecklistSourceIndex = {
  byStep: new Map(),
  consulateSources: {},
  sourcesVersion: null,
};

/** Pure: split active rows for one path into per-step and per-post buckets. */
export function indexChecklistSources(
  rows: ChecklistSourceRow[],
  pathId: string,
): ChecklistSourceIndex {
  const byStep = new Map<string, ChecklistSourceView[]>();
  const consulateSources: Record<string, ChecklistSourceView[]> = {};
  let sourcesVersion: string | null = null;
  const activeIds = new Set<string>();
  const byId = new Map<string, ChecklistSourceView>();
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  for (const row of sorted) {
    if (row.status !== "active") continue;
    if (!(row.path_ids ?? []).includes(pathId)) continue;
    activeIds.add(row.id);
    if (!/^https:\/\//.test(row.official_url) || !sourceHost(row.official_url)) continue;
    byId.set(row.id, toChecklistSource(row, false));
    const stepIds = row.step_ids ?? [];
    if (stepIds.length === 0) continue;
    if (!sourcesVersion || row.updated_at > sourcesVersion) sourcesVersion = row.updated_at;

    const isConsulate = row.scope.startsWith(US_CONSULATE_SCOPE_PREFIX);
    if (isConsulate && !CROSS_POST_SOURCE_IDS.includes(row.id)) {
      const postId = row.scope.slice(US_CONSULATE_SCOPE_PREFIX.length);
      (consulateSources[postId] ??= []).push(toChecklistSource(row, true));
      continue;
    }
    const view = toChecklistSource(row, false);
    for (const stepId of stepIds) {
      const list = byStep.get(stepId) ?? [];
      list.push(view);
      byStep.set(stepId, list);
    }
  }
  return { byStep, consulateSources, sourcesVersion, activeIds, byId };
}

/** Active rows tagged with pathId, plus updated_at for sourcesVersion. */
export async function loadChecklistSourceRows(
  service: AccountDbClient,
  pathId: string,
): Promise<{ ok: true; rows: ChecklistSourceRow[] } | { ok: false }> {
  try {
    const res = await service
      .schema("internal")
      .from("sources")
      .select(`${PUBLIC_SOURCE_COLUMNS}, updated_at`)
      .eq("status", "active")
      .contains("path_ids", [pathId])
      .order("id", { ascending: true });
    if (res.error) return { ok: false };
    return { ok: true, rows: (res.data ?? []) as ChecklistSourceRow[] };
  } catch {
    return { ok: false };
  }
}
