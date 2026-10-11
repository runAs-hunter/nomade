/**
 * F8 Official Sources — input validation (query params + admin writes).
 * Official-domain allowlist is the code-level guard for "official SoT only":
 * blogs / unofficial guides are rejected at write time. Extending the list is a
 * Cap-reviewed code change.
 */

import { z } from "zod";
import { SOURCE_DOC_TYPES, SOURCE_STATUSES } from "@/lib/sources/types";

/** Source id: seed slug or uuid text. Mirrors the DB CHECK. */
export const SOURCE_ID_RE = /^[a-z0-9][a-z0-9_-]{2,63}$/;

/** Journey path id format (e.g. italy_digital_nomad). Format-only, not catalog membership. */
export const PATH_ID_RE = /^[a-z0-9_]{1,64}$/;

/** Step id format (F5 catalog ids, e.g. proof-of-income). */
export const STEP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const MAX_QUERY_LENGTH = 100;

/**
 * Official host suffixes (runbook § Domain allowlist). A host matches when it
 * equals a suffix or ends with "." + suffix.
 */
export const OFFICIAL_HOST_SUFFIXES = [
  "esteri.it", // MAECI, vistoperitalia, prenotami, US embassy + consulates
  "gazzettaufficiale.it",
  "normattiva.it",
  "poliziadistato.it",
  "gov.it", // interno.gov.it, integrazionemigranti.gov.it, agenziaentrate.gov.it
  "inps.it",
] as const;

export function isOfficialHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return OFFICIAL_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/** HTTPS + official host. Returns null when OK, else a reason string. */
export function officialUrlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "officialUrl must be a valid URL";
  }
  if (url.protocol !== "https:") return "officialUrl must use https";
  if (url.username || url.password) return "officialUrl must not contain credentials";
  if (!isOfficialHost(url.hostname)) {
    return "officialUrl host is not on the official-source allowlist";
  }
  return null;
}

function isRealIsoDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "must be YYYY-MM-DD" })
  .refine(isRealIsoDate, { message: "must be a real calendar date" });

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);

const officialUrl = z
  .string()
  .trim()
  .max(2048)
  .superRefine((value, ctx) => {
    const problem = officialUrlProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

const pathIds = z.array(z.string().regex(PATH_ID_RE)).max(16);
const stepIds = z.array(z.string().regex(STEP_ID_RE)).max(64);

const curationFields = {
  pathIds,
  country: z.string().regex(/^[A-Z]{2}$/),
  title: nonEmptyText(300),
  publisher: nonEmptyText(200),
  officialUrl,
  docType: z.enum(SOURCE_DOC_TYPES),
  scope: nonEmptyText(100),
  retrievedAt: isoDate,
  status: z.enum(SOURCE_STATUSES),
  notes: z.string().trim().max(2000).nullable(),
  stepIds,
  snapshotRef: z.string().trim().max(500).nullable(),
};

/**
 * POST body. Operational columns (lastCheckedAt, lastHttpStatus, contentHash)
 * are refresh-job-only and rejected here (strict object).
 */
export const createSourceSchema = z
  .object({
    id: z.string().regex(SOURCE_ID_RE).optional(),
    pathIds: curationFields.pathIds,
    country: curationFields.country.default("IT"),
    title: curationFields.title,
    publisher: curationFields.publisher,
    officialUrl: curationFields.officialUrl,
    docType: curationFields.docType,
    scope: curationFields.scope,
    retrievedAt: curationFields.retrievedAt,
    status: curationFields.status.default("active"),
    notes: curationFields.notes.optional(),
    stepIds: curationFields.stepIds.optional(),
    snapshotRef: curationFields.snapshotRef.optional(),
  })
  .strict();

/** PATCH body — any subset of curation fields (at least one). */
export const patchSourceSchema = z
  .object({
    pathIds: curationFields.pathIds.optional(),
    country: curationFields.country.optional(),
    title: curationFields.title.optional(),
    publisher: curationFields.publisher.optional(),
    officialUrl: curationFields.officialUrl.optional(),
    docType: curationFields.docType.optional(),
    scope: curationFields.scope.optional(),
    retrievedAt: curationFields.retrievedAt.optional(),
    status: curationFields.status.optional(),
    notes: curationFields.notes.optional(),
    stepIds: curationFields.stepIds.optional(),
    snapshotRef: curationFields.snapshotRef.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "at least one field is required",
  });

export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type PatchSourceInput = z.infer<typeof patchSourceSchema>;

/** Map validated camelCase input → DB column names (only provided keys). */
export function toDbColumns(
  input: Partial<CreateSourceInput>,
): Record<string, unknown> {
  const map: Record<string, string> = {
    id: "id",
    pathIds: "path_ids",
    country: "country",
    title: "title",
    publisher: "publisher",
    officialUrl: "official_url",
    docType: "doc_type",
    scope: "scope",
    retrievedAt: "retrieved_at",
    status: "status",
    notes: "notes",
    stepIds: "step_ids",
    snapshotRef: "snapshot_ref",
  };
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(map)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) out[column] = value;
  }
  return out;
}

/** Human-readable zod issue summary (field paths + messages, no values). */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.map(String).join(".") || "body"}: ${i.message}`)
    .join("; ");
}

export type ListQuery = { pathId: string | null; q: string | null };

export function parseListQuery(
  url: URL,
): { ok: true; value: ListQuery } | { ok: false; message: string } {
  const rawPath = url.searchParams.get("pathId");
  const rawQ = url.searchParams.get("q");
  let pathId: string | null = null;
  let q: string | null = null;

  if (rawPath !== null) {
    const trimmed = rawPath.trim();
    if (!PATH_ID_RE.test(trimmed)) {
      return { ok: false, message: "pathId must match ^[a-z0-9_]{1,64}$" };
    }
    pathId = trimmed;
  }
  if (rawQ !== null) {
    const trimmed = rawQ.trim();
    if (trimmed.length > MAX_QUERY_LENGTH) {
      return { ok: false, message: `q must be at most ${MAX_QUERY_LENGTH} characters` };
    }
    q = trimmed.length > 0 ? trimmed : null;
  }
  return { ok: true, value: { pathId, q } };
}

export function isValidSourceId(id: string): boolean {
  return SOURCE_ID_RE.test(id);
}
