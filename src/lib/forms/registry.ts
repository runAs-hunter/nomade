/**
 * F12a forms registry. Phase 1 ships one form (runbook decision 5).
 * Each form is keyed to a gate V1 source row; its template PDF hash is pinned
 * here and checked monthly by the F8 link check (decision 6).
 */

import {
  FORMS_CONTENT_VERSION,
  NATIONAL_VISA_FORM_ID,
  NATIONAL_VISA_SOURCE_ID,
  NATIONAL_VISA_TEMPLATE,
} from "@/lib/forms/national-visa";

export type FormDef = {
  formId: string;
  sourceId: string;
  stepId: string;
  contentVersion: string;
  templateSha256: string;
};

export const FORMS: readonly FormDef[] = [
  {
    formId: NATIONAL_VISA_FORM_ID,
    sourceId: NATIONAL_VISA_SOURCE_ID,
    stepId: "submit-application",
    contentVersion: FORMS_CONTENT_VERSION,
    templateSha256: NATIONAL_VISA_TEMPLATE.sha256,
  },
];

export function getFormDef(formId: string): FormDef | null {
  return FORMS.find((f) => f.formId === formId) ?? null;
}

/** source id → pinned sha256 hex, for the link check (decision 6). */
export const FORM_TEMPLATE_PINS: Readonly<Record<string, string>> = Object.fromEntries(
  FORMS.map((f) => [f.sourceId, f.templateSha256]),
);
