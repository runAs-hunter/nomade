import { describe, it, expect } from "vitest";
import { loadSeedRows } from "../../../../scripts/gen-sources-seed-sql.mjs";
import {
  JOURNEY_CATALOG_VERSION,
  JOURNEY_DISCLAIMER,
  getPhasesForPath,
  listStepDefsForPath,
  type JourneyPathId,
} from "@/lib/journey/catalog";
import { buildChecklistView } from "@/lib/journey/checklist";
import {
  indexChecklistSources,
  loadChecklistSourceRows,
  sourceHost,
  type ChecklistSourceRow,
} from "@/lib/journey/checklist-sources";

type SeedRow = {
  id: string;
  path_ids: string[];
  title: string;
  publisher: string;
  official_url: string;
  doc_type: string;
  scope: string;
  retrieved_at: string;
  step_ids: string[];
};

const seed = loadSeedRows() as SeedRow[];
const rows: ChecklistSourceRow[] = seed.map((r) => ({
  id: r.id,
  path_ids: r.path_ids,
  country: "IT",
  title: r.title,
  publisher: r.publisher,
  official_url: r.official_url,
  doc_type: r.doc_type as ChecklistSourceRow["doc_type"],
  scope: r.scope,
  retrieved_at: r.retrieved_at,
  last_checked_at: null,
  last_http_status: null,
  status: "active",
  step_ids: r.step_ids,
  updated_at: "2026-10-13T10:00:00Z",
}));

const journeyCase = {
  caseId: "c1",
  pathId: "italy_digital_nomad",
  updatedAt: "2026-10-01T00:00:00Z",
} as Parameters<typeof buildChecklistView>[0]["journeyCase"];

function view(pathId: JourneyPathId, input = rows) {
  return buildChecklistView({
    journeyCase,
    pathId,
    states: [],
    sources: indexChecklistSources(input, pathId),
  });
}
const step = (v: ReturnType<typeof view>, id: string) =>
  v.phases.flatMap((p) => p.steps).find((s) => s.id === id)!;

describe("F9 step_ids mapping (CSV)", () => {
  it("every step id exists in the catalog for at least one of the row's paths", () => {
    for (const r of seed) {
      for (const s of r.step_ids) {
        const known = r.path_ids.some((p) =>
          listStepDefsForPath(p as JourneyPathId).some((d) => d.id === s),
        );
        expect(known, `${r.id} → ${s}`).toBe(true);
      }
    }
  });

  it("does not map the generic Visti per l'Italia portal", () => {
    expect(seed.find((r) => r.id === "it-maeci-visti-portal")!.step_ids).toEqual([]);
  });

  it("every US consulate post has at least one mapped row", () => {
    const posts = ["washington", "boston", "chicago", "detroit", "houston", "los-angeles", "miami", "new-york", "philadelphia", "san-francisco"];
    for (const p of posts) {
      expect(seed.some((r) => r.scope === `US-consulate:${p}` && r.step_ids.length > 0), p).toBe(true);
    }
  });
});

describe("F9 buildChecklistView sources join", () => {
  it("permesso-soggiorno cites Polizia with retrievedAt + host", () => {
    const s = step(view("italy_digital_nomad"), "permesso-soggiorno");
    const polizia = s.sources.find((x) => x.id === "it-polizia-permesso-issue")!;
    expect(polizia.retrievedAt).toBe("2026-10-03");
    expect(polizia.host).toBe("poliziadistato.it");
    expect(polizia.url).toBe("https://www.poliziadistato.it/articolo/225");
  });

  it("unmapped steps get [] (codice-fiscale, cover-letter)", () => {
    const v = view("italy_digital_nomad");
    expect(step(v, "codice-fiscale").sources).toEqual([]);
    expect(step(v, "cover-letter").sources).toEqual([]);
  });

  it("consulate-appointment national sources: Prenot@Mi + jurisdiction map (all posts)", () => {
    const ids = step(view("italy_remote_worker"), "consulate-appointment").sources.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["it-maeci-prenotami", "us-washington-consular-network"]));
    expect(ids).not.toContain("us-washington-visa-booking");
  });

  it("consulateSources covers all 10 posts with stepIds", () => {
    const v = view("italy_digital_nomad");
    expect(Object.keys(v.consulateSources).sort()).toHaveLength(10);
    expect(v.consulateSources.houston[0].host).toBe("conshouston.esteri.it");
    expect(v.consulateSources.houston[0].stepIds).toContain("consulate-appointment");
    expect(v.consulateSources.washington.map((s) => s.id).sort()).toEqual([
      "us-washington-dnv-checklist-pdf",
      "us-washington-visa-booking",
    ]);
  });

  it("Miami splits by path", () => {
    expect(view("italy_digital_nomad").consulateSources.miami.map((s) => s.id)).toEqual(["us-miami-dn-self-employed-pdf"]);
    expect(view("italy_remote_worker").consulateSources.miami.map((s) => s.id)).toEqual(["us-miami-rw-subordinate-pdf"]);
  });

  it("stale and retired rows are excluded", () => {
    const input = rows.map((r) =>
      r.id === "it-polizia-permesso-issue" ? { ...r, status: "stale" as const }
      : r.id === "us-houston-dnv" ? { ...r, status: "retired" as const } : r,
    );
    const v = view("italy_digital_nomad", input);
    expect(step(v, "permesso-soggiorno").sources.map((s) => s.id)).not.toContain("it-polizia-permesso-issue");
    expect(v.consulateSources.houston).toBeUndefined();
  });

  it("copy, catalogVersion, disclaimer unchanged; no sources → empty", () => {
    const v = view("italy_digital_nomad");
    const bare = buildChecklistView({ journeyCase, pathId: "italy_digital_nomad", states: [] });
    const strip = (x: typeof v) => x.phases.map((p) => ({ name: p.name, steps: p.steps.map(({ id, name, detail }) => ({ id, name, detail })) }));
    expect(strip(v)).toEqual(strip(bare));
    expect(strip(bare)).toEqual(getPhasesForPath("italy_digital_nomad").map((p) => ({ name: p.name, steps: p.steps.map(({ id, name, detail }) => ({ id, name, detail })) })));
    expect(v.catalogVersion).toBe(JOURNEY_CATALOG_VERSION);
    expect(v.disclaimer).toBe("Preliminary guidance \u2014 not legal advice");
    expect(v.disclaimer).toBe(JOURNEY_DISCLAIMER);
    expect(bare.consulateSources).toEqual({});
    expect(bare.sourcesVersion).toBeNull();
    expect(bare.phases.every((p) => p.steps.every((s) => s.sources.length === 0))).toBe(true);
    expect(v.sourcesVersion).toBe("2026-10-13T10:00:00Z");
  });

  it("sourceHost strips www", () => {
    expect(sourceHost("https://www.normattiva.it/x")).toBe("normattiva.it");
    expect(sourceHost("not a url")).toBe("");
  });
});

describe("F9 loadChecklistSourceRows failure", () => {
  it("returns ok:false on DB error or throw (checklist stays 200)", async () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "select", "eq", "contains"]) chain[m] = () => chain;
    chain.order = async () => ({ data: null, error: { message: "boom" } });
    const errSvc = { schema: () => chain } as never;
    expect(await loadChecklistSourceRows(errSvc, "italy_digital_nomad")).toEqual({ ok: false });
    const throwSvc = { schema: () => { throw new Error("x"); } } as never;
    expect(await loadChecklistSourceRows(throwSvc, "italy_digital_nomad")).toEqual({ ok: false });
  });
});
