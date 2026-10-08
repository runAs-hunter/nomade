import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { loadSeedRows, renderSeedSql, SEED_IDS } from "../../../../scripts/gen-sources-seed-sql.mjs";
import { isValidSourceId, officialUrlProblem, PATH_ID_RE } from "@/lib/sources/validate";
import { SOURCE_DOC_TYPES } from "@/lib/sources/types";

type SeedRow = {
  id: string;
  path_ids: string[];
  title: string;
  publisher: string;
  official_url: string;
  doc_type: string;
  scope: string;
  retrieved_at: string;
  notes: string | null;
};

const ROOT = path.resolve(__dirname, "../../../..");
const SEED_MIGRATION = path.join(
  ROOT,
  "supabase/migrations/20261008133126_f8_official_sources_seed.sql",
);

const rows = loadSeedRows() as SeedRow[];

describe("F8 seed (Visa Ops CSV → migration)", () => {
  it("has exactly the 20 Cap-accepted rows", () => {
    expect(rows).toHaveLength(20);
    expect(Object.keys(SEED_IDS)).toHaveLength(20);
  });

  it("committed seed migration is byte-identical to the generator output", () => {
    expect(readFileSync(SEED_MIGRATION, "utf8")).toBe(renderSeedSql(rows));
  });

  it("every row has an official https URL, retrieved_at, valid id/doc_type/path_ids", () => {
    const ids = new Set<string>();
    const urls = new Set<string>();
    for (const r of rows) {
      expect(officialUrlProblem(r.official_url)).toBeNull();
      expect(r.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isValidSourceId(r.id)).toBe(true);
      expect(SOURCE_DOC_TYPES).toContain(r.doc_type);
      expect(r.path_ids.length).toBeGreaterThan(0);
      for (const p of r.path_ids) expect(p).toMatch(PATH_ID_RE);
      ids.add(r.id);
      urls.add(r.official_url);
    }
    expect(ids.size).toBe(20);
    expect(urls.size).toBe(20);
  });

  it("keeps Cap KEEP rows (Normattiva, Polizia articolo/225, Gazzetta Art. 1 deep-link)", () => {
    const urls = rows.map((r) => r.official_url);
    expect(urls.filter((u) => u.startsWith("https://www.normattiva.it/"))).toHaveLength(2);
    expect(urls).toContain("https://www.poliziadistato.it/articolo/225");
    expect(
      urls.some(
        (u) =>
          u.startsWith("https://www.gazzettaufficiale.it/atto/serie_generale/caricaArticolo?") &&
          u.includes("art.codiceRedazionale=24A01716") &&
          u.includes("art.idArticolo=1&"),
      ),
    ).toBe(true);
  });

  it("splits path_ids on | and tags shared docs for both paths", () => {
    const prenotami = rows.find((r) => r.id === "it-maeci-prenotami")!;
    expect(prenotami.path_ids).toEqual(["italy_digital_nomad", "italy_remote_worker"]);
  });

  it("keeps Miami DN vs RW PDFs separate and single-path", () => {
    const dn = rows.find((r) => r.id === "us-miami-dn-self-employed-pdf")!;
    const rw = rows.find((r) => r.id === "us-miami-rw-subordinate-pdf")!;
    expect(dn.path_ids).toEqual(["italy_digital_nomad"]);
    expect(rw.path_ids).toEqual(["italy_remote_worker"]);
    expect(dn.official_url).not.toBe(rw.official_url);
  });

  it("leaves interno.gov.it and Agenzia delle Entrate out (not in CSV)", () => {
    for (const r of rows) {
      expect(r.official_url).not.toMatch(/interno\.gov\.it|agenziaentrate\.gov\.it/);
    }
  });

  it("keeps notes verbatim from the CSV", () => {
    const polizia = rows.find((r) => r.id === "it-polizia-permesso-issue")!;
    expect(polizia.notes).toBe(
      "Eight working days; contribution tiers; average issue time. Pair with decree Art. 4.2 (Questura channel).",
    );
  });
});
