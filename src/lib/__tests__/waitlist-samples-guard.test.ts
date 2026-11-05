// Guard: the private waitlist sample PDFs must never leak internal
// source-ledger wording ("draft row", "active row") or internal row ids
// such as `us-new-york-dnv`. Text is extracted with unpdf (pure JS, no
// native deps), so this runs in CI without poppler.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { CTA_SAMPLES } from "@/lib/waitlist/cta";

const SAMPLES_DIR = path.join(process.cwd(), "private", "waitlist-samples");

const LEDGER_LABELS = [/draft row/i, /active row/i];

// URL-ish tokens (with or without scheme): host.tld[/path...]. These are
// removed before the id check so legitimate links such as
// `consnewyork.esteri.it/.../us-new-york-visa` cannot trip the guard.
const URL_LIKE = /\b(?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?/gi;

// Internal row ids: lowercase `us-` followed by at least two more
// hyphenated segments (e.g. `us-new-york-dnv`). Case-sensitive, so prose
// like "US-based" never matches; the lookbehind rejects ids glued to a
// path, word, or domain fragment.
const ROW_ID = /(?<![\w./-])us-[a-z0-9]+(?:-[a-z0-9]+)+/g;

function findLeaks(rawText: string): string[] {
  const text = rawText.replace(/\s+/g, " ");
  const hits: string[] = [];
  for (const re of LEDGER_LABELS) {
    const m = text.match(re);
    if (m) hits.push(m[0]);
  }
  const withoutUrls = text.replace(URL_LIKE, " ");
  for (const m of withoutUrls.matchAll(ROW_ID)) hits.push(m[0]);
  return hits;
}

async function pdfText(file: string): Promise<string> {
  const data = new Uint8Array(readFileSync(path.join(SAMPLES_DIR, file)));
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

describe("findLeaks (pattern self-test)", () => {
  it.each([
    "[us-new-york-dnv, read 18 Oct 2026]",
    "[draft row us-new-york-consular-tariff-q4-2026, table dated",
    "see the Active Row for details",
  ])("flags %s", (s) => {
    expect(findLeaks(s).length).toBeGreaterThan(0);
  });

  it.each([
    "consnewyork.esteri.it/wp-content/uploads/2026/09/TAB-us-new-york-q4.pdf",
    "https://example.gov/us-new-york-visa",
    "US-based remote workers",
    "Prepared for: Jane Sample (fictional applicant)",
    "Consolato Generale d'Italia a New York — Consular fees, read 18 Oct 2026",
  ])("does not flag %s", (s) => {
    expect(findLeaks(s)).toEqual([]);
  });
});

describe("private waitlist sample PDFs", () => {
  const pdfs = readdirSync(SAMPLES_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));

  it("includes every PDF the CTA cards link to", () => {
    for (const s of Object.values(CTA_SAMPLES)) expect(pdfs).toContain(s.pdf);
  });

  it.each(pdfs)("%s has no ledger labels or internal row ids", async (file) => {
    const text = await pdfText(file);
    expect(text.length).toBeGreaterThan(200);
    expect(findLeaks(text)).toEqual([]);
  });
});
