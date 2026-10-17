/**
 * F11b invented-number check (Cap, #34). Every number in an answer (amounts,
 * currency figures, day/month counts, years, percentages) must appear in the
 * summary or title of a source the answer CITES. Nomade guidance (step text)
 * and the user's context do not count. Digits only; spelled-out numbers
 * ("six months") are not checked.
 */

import { stripAllMarkers } from "@/lib/ask/citations";

/** Digit runs with optional thousands/decimal separators: 30,000 · 30.000 · 24,789.00 · 1.5 */
const NUMBER_RE = /\d+(?:[.,\u00a0\u202f ]\d{3})*(?:[.,]\d+)?/g;

/** Canonical form: drop thousands separators, normalise the decimal mark, trim ",00". */
export function normalizeNumber(raw: string): string {
  let s = raw.replace(/[\u00a0\u202f ]/g, "");
  // 30,000 / 30.000 / 1,234,567 → grouping separators
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return s.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
  // 24,789.00 / 24.789,00 → strip grouping, keep decimal
  const m = /^(\d{1,3}(?:[.,]\d{3})+)[.,](\d+)$/.exec(s);
  if (m) s = `${m[1]!.replace(/[.,]/g, "")}.${m[2]}`;
  else s = s.replace(",", ".");
  s = s.replace(/\.0+$/, "");
  return s.replace(/^0+(?=\d)/, "");
}

export function extractNumbers(text: string): string[] {
  const out = new Set<string>();
  for (const m of stripAllMarkers(text).matchAll(NUMBER_RE)) out.add(normalizeNumber(m[0]));
  return [...out];
}

/** Numbers in `answer` that no cited source's summary/title contains. */
export function unsupportedNumbers(
  answer: string,
  citedSources: readonly { title: string; summary: string | null }[],
): string[] {
  const allowed = new Set<string>();
  for (const s of citedSources) for (const n of extractNumbers(`${s.title} ${s.summary ?? ""}`)) allowed.add(n);
  return extractNumbers(answer).filter((n) => !allowed.has(n));
}
