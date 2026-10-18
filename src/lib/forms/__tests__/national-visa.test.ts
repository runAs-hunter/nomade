import { createHash } from "crypto";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  FORMS_ARRIVAL_MONTH_PLACEHOLDER,
  FORMS_ARRIVAL_REMINDER,
  FORMS_NAME_CHECK_NOTE,
  FORMS_NY_VARIANT_LABEL,
  NATIONAL_VISA_VARIANT_POST_ID,
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
    // markerReason is served with the walkthrough's internal notes stripped (Cap review N1).
    const MD_PUBLIC = MD.replaceAll(" Flagged for Cap.", "").replaceAll(" (Cap 2026-10-18)", "");
    for (const s of ALL_TEXT) expect(MD_PUBLIC, s.slice(0, 60)).toContain(s);
    for (const f of NATIONAL_VISA_FIELDS) expect(f.markerReason).not.toMatch(/\bCap\b|Flagged/);
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

  it("the walkthrough's internal sections are never in the served content (uncertainty list, Studio note, ny-packet bullet)", () => {
    const start = MD.indexOf("## Uncertain / for Visa Ops");
    expect(start).toBeGreaterThan(0);
    const uncertain = MD.slice(start).split("\n").filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, ""));
    expect(uncertain.length).toBeGreaterThanOrEqual(7);
    const studio = MD.split("\n").find((l) => l.startsWith("Note for Studio"))!;
    const packet = MD.split("\n").find((l) => l.includes("ny-packet.md"))!;
    const served = JSON.stringify([ALL_TEXT, NATIONAL_VISA_STAMPS, NATIONAL_VISA_REFERENCES, NATIONAL_VISA_SECTIONS, NATIONAL_VISA_INTRO]);
    for (const l of [...uncertain, studio, packet.slice(2)]) expect(served).not.toContain(JSON.stringify(l).slice(1, -1));
    expect(served).not.toMatch(/\bCap\b|Decided|Flagged|ny-packet/);
    expect(NATIONAL_VISA_STAMPS.items).toHaveLength(2);
  });

  it("only the account name is ever prefilled (PrefillKind narrowed; arrival month / consulate never)", () => {
    const kinds = new Set(NATIONAL_VISA_FIELDS.map((f) => f.prefill).filter((k) => k !== null));
    expect([...kinds]).toEqual(["accountName"]);
    expect(NATIONAL_VISA_FIELDS.filter((f) => f.prefill).map((f) => f.number)).toEqual([1, 3]);
    const src = readFileSync(path.join(ROOT, "src/lib/forms/national-visa.ts"), "utf8");
    expect(src).toContain('export type PrefillKind = "accountName";');
  });

  it("field 29 / name-check notes come from the generator template (survive regeneration)", () => {
    const gen = readFileSync(path.join(ROOT, "scripts/gen-forms-content.py"), "utf8");
    expect(gen).toContain(FORMS_ARRIVAL_REMINDER);
    expect(gen).toContain(FORMS_NAME_CHECK_NOTE);
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

  it("Cap-approved copy (18 Oct) is byte-exact and kept out of the walkthrough content", () => {
    expect(FORMS_NY_VARIANT_LABEL).toBe("Based on the New York version of the form");
    expect(FORMS_ARRIVAL_REMINDER).toBe("Your target arrival: <month>. Enter the exact date.");
    expect(FORMS_ARRIVAL_REMINDER).toContain(FORMS_ARRIVAL_MONTH_PLACEHOLDER);
    expect(FORMS_NAME_CHECK_NOTE).toBe(
      "Check the names in fields 1 and 3 against your passport: the form asks for them as listed in your travel document (note x).",
    );
    expect(NATIONAL_VISA_VARIANT_POST_ID).toBe("new-york");
    for (const c of [FORMS_NY_VARIANT_LABEL, FORMS_ARRIVAL_REMINDER, FORMS_NAME_CHECK_NOTE]) {
      expect(ALL_TEXT).not.toContain(c);
    }
    const src = readFileSync(path.join(ROOT, "src/lib/forms/national-visa.ts"), "utf8");
    const cap = src.indexOf("// Cap-approved copy, 18 Oct 2026.");
    const verbatim = src.indexOf("// Verbatim Visa Ops walkthrough content (generated) below.");
    expect(cap).toBeGreaterThan(0);
    expect(src.indexOf("FORMS_NAME_CHECK_NOTE =")).toBeGreaterThan(cap);
    expect(src.indexOf("FORMS_NAME_CHECK_NOTE =")).toBeLessThan(verbatim);
    expect(src.indexOf("NATIONAL_VISA_FIELDS: FormField[] =")).toBeGreaterThan(verbatim);
  });

  it("vercel.json schedules check-sources monthly (CRON_SECRET route)", () => {
    const vercel = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    expect(vercel.crons).toContainEqual({ path: "/api/cron/check-sources", schedule: "0 4 1 * *" });
    expect(vercel.crons).toContainEqual({ path: "/api/cron/purge-accounts", schedule: "0 4 * * *" });
  });
});
