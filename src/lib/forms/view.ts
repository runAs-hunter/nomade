/**
 * F12a forms API views (GET /api/forms, GET /api/forms/:formId).
 * Content is code (national-visa.ts); the official document card comes from the
 * active internal.sources row (gate V1). Form values never reach the server.
 */

import type { AccountDbClient } from "@/lib/account/export";
import { hasActiveJourneyFull } from "@/lib/billing/entitlements";
import { getFormsPublicBaseUrl, isBillingGateEnabled } from "@/lib/env";
import {
  FORMS_ARRIVAL_MONTH_PLACEHOLDER,
  FORMS_ARRIVAL_REMINDER,
  FORMS_LOCK_SENTENCE,
  FORMS_NAME_CHECK_NOTE,
  FORMS_NY_VARIANT_LABEL,
  FORMS_STALE_NOTICE,
  FORMS_TRANSLATION_LABEL,
  NATIONAL_VISA_FIELDS,
  NATIONAL_VISA_INTRO,
  NATIONAL_VISA_REFERENCES,
  NATIONAL_VISA_SECTIONS,
  NATIONAL_VISA_STAMPS,
  NATIONAL_VISA_TEMPLATE,
  NATIONAL_VISA_VARIANT_POST_ID,
  NATIONAL_VISA_VERSION,
  type FormField,
  type FormReference,
  type FormRef,
} from "@/lib/forms/national-visa";
import {
  US_CONSULATE_POST_IDS,
  US_CONSULATE_POSTS,
  type UsConsulatePostId,
} from "@/lib/journey/consulates";
import { FORMS, type FormDef } from "@/lib/forms/registry";
import { JOURNEY_DISCLAIMER } from "@/lib/journey/catalog";
import { sourceHost } from "@/lib/journey/checklist-sources";
import type { Logger } from "@/lib/log";

/** Byte-for-byte (Cap lock). */
export const FORMS_DISCLAIMER = JOURNEY_DISCLAIMER;

export type FormSourceRow = {
  id: string;
  title: string;
  publisher: string;
  official_url: string;
  doc_type: string;
  scope: string;
  retrieved_at: string;
  status: string;
  needs_review: boolean | null;
};

const FORM_SOURCE_COLUMNS =
  "id, title, publisher, official_url, doc_type, scope, retrieved_at, status, needs_review";

export async function loadFormSources(
  service: AccountDbClient,
  ids: readonly string[],
): Promise<{ ok: true; rows: Map<string, FormSourceRow> } | { ok: false }> {
  const res = await service
    .schema("internal")
    .from("sources")
    .select(FORM_SOURCE_COLUMNS)
    .in("id", [...ids])
    .eq("status", "active");
  if (res.error) return { ok: false };
  const rows = new Map<string, FormSourceRow>();
  for (const r of (res.data ?? []) as FormSourceRow[]) rows.set(r.id, r);
  return { ok: true, rows };
}

/**
 * The consulate comes from `?consulate=<post id>` (the same F5 post ids the app
 * already sends to /api/ask as `consulatePostId`). The server stores none (F9
 * lock: consulate stays on the device). Absent → unknown, treated like any
 * non-New York post: walkthrough only, no PDF.
 */
export function parseConsulateParam(
  url: URL,
): { ok: true; postId: UsConsulatePostId | null } | { ok: false } {
  const raw = url.searchParams.get("consulate");
  if (raw === null || raw.trim() === "") return { ok: true, postId: null };
  const v = raw.trim();
  return (US_CONSULATE_POST_IDS as readonly string[]).includes(v)
    ? { ok: true, postId: v as UsConsulatePostId }
    : { ok: false };
}

/** The user's own post, from the F5 consulate data (`instructionUrl`). Never invented. */
export function consulateView(postId: UsConsulatePostId | null) {
  if (!postId) return null;
  const post = US_CONSULATE_POSTS.find((p) => p.id === postId)!;
  return { postId: post.id, officialUrl: post.instructionUrl, host: sourceHost(post.instructionUrl) };
}

/** True only for the post whose form the template is (the NY-headed PDF). */
export function servesTemplate(postId: UsConsulatePostId | null): boolean {
  return postId === NATIONAL_VISA_VARIANT_POST_ID;
}

/** Posts whose users may get the template PDF and prefill (Cap review of #40). */
export const NATIONAL_VISA_PREFILL_POSTS: readonly UsConsulatePostId[] = [NATIONAL_VISA_VARIANT_POST_ID];

export function variantView(postId: UsConsulatePostId | null) {
  const matches = servesTemplate(postId);
  return {
    postId: NATIONAL_VISA_VARIANT_POST_ID,
    /** `US-consulate:<post>` scope of the template PDF (matches the source row). */
    templateScope: `US-consulate:${NATIONAL_VISA_VARIANT_POST_ID}`,
    /** Only these posts get the PDF + prefill; the phone hides both for every other post. */
    prefillPosts: [...NATIONAL_VISA_PREFILL_POSTS],
    matchesConsulate: matches,
    label: matches ? null : FORMS_NY_VARIANT_LABEL,
  };
}

export type FormListItem = {
  formId: string;
  title: string | null;
  stepId: string;
  sourceId: string;
  scope: string | null;
  contentVersion: string;
  available: boolean;
  needsReview: boolean;
  variant: ReturnType<typeof variantView>;
  /** NY consulate only: the pre-filled PDF can be offered. */
  pdfAvailable: boolean;
};

export function buildFormList(
  rows: Map<string, FormSourceRow>,
  postId: UsConsulatePostId | null,
): FormListItem[] {
  return FORMS.map((f) => {
    const row = rows.get(f.sourceId);
    return {
      formId: f.formId,
      title: row?.title ?? null,
      stepId: f.stepId,
      sourceId: f.sourceId,
      scope: row?.scope ?? null,
      contentVersion: f.contentVersion,
      available: !!row,
      needsReview: row?.needs_review === true,
      variant: variantView(postId),
      pdfAvailable: !!row && servesTemplate(postId),
    };
  });
}

export type FormEntitlement = { journeyFull: boolean; gateEnabled: boolean; unavailable?: true };

/** Pre-filled PDF access: "paid" exactly when the F10 gate is on and journey_full is not active. */
export function pdfAccess(ent: FormEntitlement): "free" | "paid" {
  return ent.gateEnabled && !ent.journeyFull ? "paid" : "free";
}

export async function loadFormEntitlement(
  service: AccountDbClient,
  userId: string,
  logger: Logger,
): Promise<FormEntitlement> {
  const gateEnabled = isBillingGateEnabled();
  const ent = await hasActiveJourneyFull(service, userId);
  if (!ent.ok) {
    logger.warn("forms entitlement unavailable", { userId });
    return { journeyFull: false, gateEnabled, unavailable: true };
  }
  return { journeyFull: ent.active, gateEnabled };
}

/** Non-NY views drop every NY-PDF coordinate and prefill hook (never serve the NY template). */
function fieldsFor(pdf: boolean): FormField[] {
  if (pdf) return NATIONAL_VISA_FIELDS;
  return NATIONAL_VISA_FIELDS.map((f) => ({ ...f, prefill: null, prefillPart: null, anchor: null }));
}

type ServedReference = Omit<FormReference, "url"> & { url: string | null };

function referencesFor(pdf: boolean): Record<FormRef, ServedReference> {
  if (pdf) return NATIONAL_VISA_REFERENCES;
  const ny = NATIONAL_VISA_REFERENCES["F-NY"];
  return { ...NATIONAL_VISA_REFERENCES, "F-NY": { sourceId: ny.sourceId, label: ny.label, url: null } };
}

export function buildFormView(args: {
  def: FormDef;
  row: FormSourceRow;
  entitlement: FormEntitlement;
  consulatePostId: UsConsulatePostId | null;
  /** Config origin (getFormsPublicBaseUrl); never the request host. */
  publicBaseUrl?: string | null;
}) {
  const { def, row, entitlement, consulatePostId } = args;
  const publicBaseUrl = args.publicBaseUrl === undefined ? getFormsPublicBaseUrl() : args.publicBaseUrl;
  const needsReview = row.needs_review === true;
  const pdf = servesTemplate(consulatePostId);
  const prefillAvailable = pdf && !needsReview;
  return {
    formId: def.formId,
    contentVersion: def.contentVersion,
    stepId: def.stepId,
    disclaimer: FORMS_DISCLAIMER,
    translationLabel: FORMS_TRANSLATION_LABEL,
    lockSentence: FORMS_LOCK_SENTENCE,
    variant: variantView(consulatePostId),
    consulate: consulateView(consulatePostId),
    /** Official NY form card. null unless the user's consulate is New York. */
    source: pdf
      ? {
          id: row.id,
          title: row.title,
          publisher: row.publisher,
          url: row.official_url,
          host: sourceHost(row.official_url),
          retrievedAt: row.retrieved_at,
          scope: row.scope,
          docType: row.doc_type,
          versionDate: NATIONAL_VISA_VERSION.versionDate,
          versionNote: NATIONAL_VISA_VERSION.versionNote,
          needsReview,
        }
      : null,
    template: pdf
      ? {
          /** Absolute URL from config; null → resolve `path` against the API base. */
          url: publicBaseUrl ? new URL(NATIONAL_VISA_TEMPLATE.path, publicBaseUrl).toString() : null,
          path: NATIONAL_VISA_TEMPLATE.path,
          sha256: NATIONAL_VISA_TEMPLATE.sha256,
          bytes: NATIONAL_VISA_TEMPLATE.bytes,
          pages: NATIONAL_VISA_TEMPLATE.pages,
          pageSize: NATIONAL_VISA_TEMPLATE.pageSize,
          hasAcroForm: NATIONAL_VISA_TEMPLATE.hasAcroForm,
        }
      : null,
    copy: {
      nameCheck: FORMS_NAME_CHECK_NOTE,
      arrivalReminder: FORMS_ARRIVAL_REMINDER,
      arrivalMonthPlaceholder: FORMS_ARRIVAL_MONTH_PLACEHOLDER,
    },
    intro: NATIONAL_VISA_INTRO,
    sections: NATIONAL_VISA_SECTIONS,
    fields: fieldsFor(pdf),
    stamps: NATIONAL_VISA_STAMPS,
    references: referencesFor(pdf),
    prefill: {
      available: prefillAvailable,
      reason: !pdf ? ("consulate" as const) : needsReview ? ("needs_review" as const) : null,
      staleNotice: pdf && needsReview ? FORMS_STALE_NOTICE : null,
    },
    access: pdfAccess(entitlement),
    entitlement,
  };
}

export type FormView = ReturnType<typeof buildFormView>;
