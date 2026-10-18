import { createHash } from "crypto";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  FORMS_CONTENT_VERSION,
  FORMS_LOCK_SENTENCE,
  FORMS_STALE_NOTICE,
  FORMS_TRANSLATION_LABEL,
  NATIONAL_VISA_FIELDS,
  NATIONAL_VISA_INTRO,
  NATIONAL_VISA_REFERENCES,
  NATIONAL_VISA_SECTIONS,
  NATIONAL_VISA_SOURCE_ID,
  NATIONAL_VISA_STAMPS,
  NATIONAL_VISA_TEMPLATE,
} from "@/lib/forms/national-visa";
import { FORM_TEMPLATE_PINS, FORMS } from "@/lib/forms/registry";
import { FORMS_DISCLAIMER } from "@/lib/forms/view";

const ROOT = path.resolve(__dirname, "../../../..");
const MD = readFileSync(path.join(ROOT, "docs/forms/visa-form-walkthrough.md"), "utf8");
const MIGRATIONS = readdirSync(path.join(ROOT, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"))
  .join("\n");
const F12_MIGRATION = readFileSync(
  path.join(ROOT, "supabase/migrations/20261018102516_f12a_national_visa_form_source.sql"),
  "utf8",
);

/** Ids inserted as 'active' by a migration and never retired/staled by a later one. */
function activeSourceIds(): Set<string> {
  const ids = new Set<string>();
  for (const m of MIGRATIONS.matchAll(/\('([a-z0-9][a-z0-9_-]+)',\s*array\[[^\]]*\]::text\[\],\s*'IT'[\s\S]*?'(active|inactive|stale|retired)'/g)) {
    if (m[2] === "active") ids.add(m[1]!);
  }
  for (const m of MIGRATIONS.matchAll(/set status = '(inactive|stale|retired)'[^;]*where id = '([^']+)'/g)) ids.delete(m[2]!);
  return ids;
}

const ALL_TEXT = [
  ...NATIONAL_VISA_FIELDS.flatMap((f) => [f.labelIt, f.labelEn, f.asks, f.markerReason]),
  ...NATIONAL_VISA_SECTIONS.flatMap((s) => [s.text, ...(s.items ?? [])]),
  NATIONAL_VISA_INTRO.text,
  NATIONAL_VISA_INTRO.labelsNote,
  NATIONAL_VISA_INTRO.translationNote,
  ...NATIONAL_VISA_STAMPS.items,
];

describe("F12a national visa form content", () => {
  it("covers fields 1–37 once each, every field with copy", () => {
    expect(NATIONAL_VISA_FIELDS.map((f) => f.number)).toEqual(Array.from({ length: 37 }, (_, i) => i + 1));
    for (const f of NATIONAL_VISA_FIELDS) {
      expect(f.fieldId).toBe(String(f.number));
      expect(f.labelIt.trim().length).toBeGreaterThan(0);
      expect(f.labelEn.trim().length).toBeGreaterThan(0);
      expect(f.asks.trim().length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(f.page);
    }
  });

  it("every field cites ≥1 active source row", () => {
    const active = activeSourceIds();
    expect(active.has(NATIONAL_VISA_SOURCE_ID)).toBe(true);
    expect(active.has("us-new-york-dnv")).toBe(true);
    for (const f of NATIONAL_VISA_FIELDS) {
      expect(f.sourceIds.length, `field ${f.number}`).toBeGreaterThan(0);
      for (const id of f.sourceIds) expect(active.has(id), `${f.number}: ${id}`).toBe(true);
      for (const r of f.refs) expect(f.asks).toContain(`[${r}]`);
    }
    for (const ref of Object.values(NATIONAL_VISA_REFERENCES)) {
      if (ref.sourceId) expect(active.has(ref.sourceId)).toBe(true);
    }
  });

  it("copy is verbatim from the Visa Ops walkthrough", () => {
    for (const s of ALL_TEXT) expect(MD, s.slice(0, 60)).toContain(s);
    for (const f of NATIONAL_VISA_FIELDS) {
      expect(MD).toContain(`| ${f.number} | ${f.labelIt} | ${f.labelEn} | ${f.asks} |`);
    }
  });

  it("no prefill on an ambiguous field; ambiguous ⇔ lock sentence; only fields 1 and 3 prefill", () => {
    for (const f of NATIONAL_VISA_FIELDS) {
      expect(f.ambiguous).toBe(f.asks.includes(FORMS_LOCK_SENTENCE));
      if (f.ambiguous) {
        expect(f.prefill).toBeNull();
        expect(f.reminder).toBeNull();
        expect(f.marker).toBe("never-prefill");
      }
    }
    const pre = NATIONAL_VISA_FIELDS.filter((f) => f.prefill !== null);
    expect(pre.map((f) => [f.number, f.prefill, f.prefillPart, f.marker])).toEqual([
      [1, "accountName", "familyName", "phase1-prefill"],
      [3, "accountName", "givenName", "phase1-prefill"],
    ]);
    for (const f of pre) expect(f.anchor).toMatchObject({ page: 1, fontSize: 9 });
    // Field 29: a margin reminder of the arrival month, never a value (decision 7).
    const reminders = NATIONAL_VISA_FIELDS.filter((f) => f.reminder !== null);
    expect(reminders.map((f) => [f.number, f.reminder, f.prefill, f.marker])).toEqual([[29, "arrivalMonth", null, "copy-only"]]);
    expect(reminders[0]!.anchor).toEqual({ page: 2, x: 3, top: 266, width: 44 });
    // No field takes the consulate; legal-choice boxes stay blank.
    expect(NATIONAL_VISA_FIELDS.some((f) => (f.prefill as string | null) === "consulate")).toBe(false);
    for (const n of [21, 36, 37]) expect(NATIONAL_VISA_FIELDS[n - 1]!.prefill).toBeNull();
    expect(NATIONAL_VISA_FIELDS.filter((f) => f.ambiguous).map((f) => f.number)).toEqual([
      11, 20, 21, 24, 25, 28, 30, 31, 32, 33, 34, 35,
    ]);
  });

  it("locked strings are byte-equal", () => {
    expect(FORMS_TRANSLATION_LABEL).toBe("English translation — for understanding only. Submit the Italian original.");
    expect(Buffer.from(FORMS_TRANSLATION_LABEL, "utf8").toString("hex")).toBe(
      Buffer.from("English translation \u2014 for understanding only. Submit the Italian original.", "utf8").toString("hex"),
    );
    expect(FORMS_DISCLAIMER).toBe("Preliminary guidance \u2014 not legal advice");
    expect(FORMS_LOCK_SENTENCE).toBe(
      "This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    );
    expect(MD).toContain(`> ${FORMS_TRANSLATION_LABEL}`);
    expect(FORMS_STALE_NOTICE).toBe("This form may have changed \u2014 check the official link");
  });

  it("never tells the user what to answer", () => {
    for (const s of ALL_TEXT) expect(s).not.toMatch(/\byou should\b|\bwe recommend\b|\bthe right (box|answer)\b|\b(tick|select|choose) (the|this) box\b/i);
  });

  it("template PDF in the repo matches the pinned sha256 (gate V1), the migration and the CSV", () => {
    const pdf = readFileSync(path.join(ROOT, "public", NATIONAL_VISA_TEMPLATE.path));
    expect(pdf.byteLength).toBe(NATIONAL_VISA_TEMPLATE.bytes);
    const hex = createHash("sha256").update(pdf).digest("hex");
    expect(hex).toBe(NATIONAL_VISA_TEMPLATE.sha256);
    expect(FORM_TEMPLATE_PINS[NATIONAL_VISA_SOURCE_ID]).toBe(hex);
    expect(F12_MIGRATION).toContain(`'sha256:${hex}'`);
    expect(F12_MIGRATION).toContain(`'${NATIONAL_VISA_TEMPLATE.officialUrl}'`);
    const csv = readFileSync(path.join(ROOT, "docs/sources/F12-visa-form-source.csv"), "utf8");
    const line = csv.split("\n").find((l) => l.includes(NATIONAL_VISA_TEMPLATE.officialUrl))!;
    expect(line).toContain(hex);
    expect(line).toContain("submit-application");
    expect(NATIONAL_VISA_REFERENCES["F-NY"].sha256).toBe(hex);
  });

  it("migration: dev-only header, no prod ref, step mapped, needs_review column", () => {
    expect(F12_MIGRATION).toMatch(/NEVER nomade-prod/);
    expect(F12_MIGRATION).not.toMatch(/whjzynfsifrtrxlylrww/);
    expect(F12_MIGRATION).toMatch(/add column if not exists needs_review boolean not null default false/);
    expect(F12_MIGRATION).toMatch(/array\['submit-application'\]::text\[\]/);
    expect(FORMS.map((f) => [f.formId, f.sourceId, f.contentVersion])).toEqual([
      ["national-visa", NATIONAL_VISA_SOURCE_ID, FORMS_CONTENT_VERSION],
    ]);
  });
});
