/**
 * F12a forms API views (GET /api/forms, GET /api/forms/:formId).
 * Content is code (national-visa.ts); the official document card comes from the
 * active internal.sources row (gate V1). Form values never reach the server.
 */

import type { AccountDbClient } from "@/lib/account/export";
import { hasActiveJourneyFull } from "@/lib/billing/entitlements";
import { isBillingGateEnabled } from "@/lib/env";
import {
  FORMS_LOCK_SENTENCE,
  FORMS_STALE_NOTICE,
  FORMS_TRANSLATION_LABEL,
  NATIONAL_VISA_FIELDS,
  NATIONAL_VISA_INTRO,
  NATIONAL_VISA_REFERENCES,
  NATIONAL_VISA_SECTIONS,
  NATIONAL_VISA_STAMPS,
  NATIONAL_VISA_TEMPLATE,
  NATIONAL_VISA_VERSION,
} from "@/lib/forms/national-visa";
import { FORMS, type FormDef } from "@/lib/forms/registry";
import { JOURNEY_DISCLAIMER } from "@/lib/journey/catalog";
import { sourceHost } from "@/lib/journey/checklist-sources";
import { log } from "@/lib/log";

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

export type FormListItem = {
  formId: string;
  title: string | null;
  stepId: string;
  sourceId: string;
  scope: string | null;
  contentVersion: string;
  available: boolean;
  needsReview: boolean;
};

export function buildFormList(rows: Map<string, FormSourceRow>): FormListItem[] {
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
): Promise<FormEntitlement> {
  const gateEnabled = isBillingGateEnabled();
  const ent = await hasActiveJourneyFull(service, userId);
  if (!ent.ok) {
    log.warn("forms entitlement unavailable", { userId });
    return { journeyFull: false, gateEnabled, unavailable: true };
  }
  return { journeyFull: ent.active, gateEnabled };
}

export function buildFormView(args: {
  def: FormDef;
  row: FormSourceRow;
  entitlement: FormEntitlement;
  origin: string;
}) {
  const { def, row, entitlement, origin } = args;
  const needsReview = row.needs_review === true;
  return {
    formId: def.formId,
    contentVersion: def.contentVersion,
    stepId: def.stepId,
    disclaimer: FORMS_DISCLAIMER,
    translationLabel: FORMS_TRANSLATION_LABEL,
    lockSentence: FORMS_LOCK_SENTENCE,
    source: {
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
    },
    template: {
      url: new URL(NATIONAL_VISA_TEMPLATE.path, origin).toString(),
      sha256: NATIONAL_VISA_TEMPLATE.sha256,
      bytes: NATIONAL_VISA_TEMPLATE.bytes,
      pages: NATIONAL_VISA_TEMPLATE.pages,
      pageSize: NATIONAL_VISA_TEMPLATE.pageSize,
      hasAcroForm: NATIONAL_VISA_TEMPLATE.hasAcroForm,
    },
    intro: NATIONAL_VISA_INTRO,
    sections: NATIONAL_VISA_SECTIONS,
    fields: NATIONAL_VISA_FIELDS,
    stamps: NATIONAL_VISA_STAMPS,
    references: NATIONAL_VISA_REFERENCES,
    prefill: { available: !needsReview, staleNotice: needsReview ? FORMS_STALE_NOTICE : null },
    access: pdfAccess(entitlement),
    entitlement,
  };
}

export type FormView = ReturnType<typeof buildFormView>;
