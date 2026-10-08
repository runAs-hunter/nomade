/**
 * F8 Official Sources — shared types + row mapping.
 * Pointers + metadata to official pages only. Not legal advice; no visa rules.
 * See docs/sources.md.
 */

import { JOURNEY_DISCLAIMER } from "@/lib/journey/catalog";

/** Byte-for-byte disclaimer (F3/F5 lock) — re-exported for source responses. */
export const SOURCES_DISCLAIMER = JOURNEY_DISCLAIMER;

export const SOURCE_DOC_TYPES = [
  "law",
  "decree",
  "consular_guidance",
  "procedure",
  "form",
  "portal",
  "other",
] as const;
export type SourceDocType = (typeof SOURCE_DOC_TYPES)[number];

export const SOURCE_STATUSES = ["active", "stale", "retired"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

/** DB row shape (`internal.sources`, snake_case). */
export type SourceRow = {
  id: string;
  path_ids: string[];
  country: string;
  title: string;
  publisher: string;
  official_url: string;
  doc_type: SourceDocType;
  scope: string;
  retrieved_at: string;
  last_checked_at: string | null;
  last_http_status: number | null;
  status: SourceStatus;
  notes: string | null;
  content_hash: string | null;
  snapshot_ref: string | null;
  step_ids: string[];
  created_at: string;
  updated_at: string;
};

/** Columns read for public responses (no notes / content_hash / snapshot_ref). */
export const PUBLIC_SOURCE_COLUMNS =
  "id, path_ids, country, title, publisher, official_url, doc_type, scope, retrieved_at, last_checked_at, last_http_status, status, step_ids";

export const ALL_SOURCE_COLUMNS = `${PUBLIC_SOURCE_COLUMNS}, notes, content_hash, snapshot_ref, created_at, updated_at`;

export type PublicSourceRow = Pick<
  SourceRow,
  | "id"
  | "path_ids"
  | "country"
  | "title"
  | "publisher"
  | "official_url"
  | "doc_type"
  | "scope"
  | "retrieved_at"
  | "last_checked_at"
  | "last_http_status"
  | "status"
  | "step_ids"
>;

/**
 * Public citation shape (camelCase). Enough for a future Chat cite (F9):
 * id, title, publisher, officialUrl, retrievedAt, pathIds, status.
 */
export type PublicSource = {
  id: string;
  pathIds: string[];
  country: string;
  title: string;
  publisher: string;
  officialUrl: string;
  docType: SourceDocType;
  scope: string;
  retrievedAt: string;
  lastCheckedAt: string | null;
  lastHttpStatus: number | null;
  status: SourceStatus;
  stepIds: string[];
};

/** Admin shape — public fields + internal curation/operational fields. */
export type AdminSource = PublicSource & {
  notes: string | null;
  contentHash: string | null;
  snapshotRef: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toPublicSource(row: PublicSourceRow): PublicSource {
  return {
    id: row.id,
    pathIds: row.path_ids ?? [],
    country: row.country,
    title: row.title,
    publisher: row.publisher,
    officialUrl: row.official_url,
    docType: row.doc_type,
    scope: row.scope,
    retrievedAt: row.retrieved_at,
    lastCheckedAt: row.last_checked_at,
    lastHttpStatus: row.last_http_status,
    status: row.status,
    stepIds: row.step_ids ?? [],
  };
}

export function toAdminSource(row: SourceRow): AdminSource {
  return {
    ...toPublicSource(row),
    notes: row.notes,
    contentHash: row.content_hash,
    snapshotRef: row.snapshot_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
