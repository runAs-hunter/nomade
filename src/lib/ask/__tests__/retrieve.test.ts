import { describe, expect, it } from "vitest";
import { ASK_MAX_SOURCES } from "@/lib/ask/copy";
import { implicitStepIds, rankSources, tokenize, type AskSourceRow } from "@/lib/ask/retrieve";

function row(id: string, over: Partial<AskSourceRow> = {}): AskSourceRow {
  return {
    id,
    path_ids: ["italy_digital_nomad"],
    title: `Title ${id}`,
    publisher: "Publisher",
    official_url: `https://www.esteri.it/${id}`,
    scope: "national",
    doc_type: "law",
    retrieved_at: "2026-10-16",
    notes: null,
    summary: null,
    summary_uncertain: false,
    step_ids: [],
    ...over,
  };
}

const ROWS: AskSourceRow[] = [
  row("it-health", { summary: "Health insurance must cover hospital care in Italy for the whole stay.", step_ids: ["health-insurance"] }),
  row("it-codice", { title: "Codice fiscale", summary: "The Questura assigns a codice fiscale with the permesso.", step_ids: ["codice-fiscale"] }),
  row("us-new-york-dnv", { scope: "US-consulate:new-york", summary: "New York asks for a registered lease for the whole visa.", step_ids: ["accommodation"] }),
  row("us-los-angeles-dnv", { scope: "US-consulate:los-angeles", summary: "Los Angeles asks for a lease or deed for the whole visa.", step_ids: ["accommodation"] }),
  row("it-partita", { title: "Partita IVA", summary: "File form AA9/12 to open a partita IVA.", step_ids: ["partita-iva"] }),
  row("it-decree", { summary: "The decree defines highly qualified work and the income requirement.", step_ids: ["proof-of-income", "criminal-record"] }),
  // Realistic table size (~33 rows) so IDF behaves like production.
  ...Array.from({ length: 14 }, (_, i) => row(`filler-${i}`, { summary: "Unrelated portal page about appointments." })),
];

describe("F11b retrieval", () => {
  it("tokenize drops domain stopwords and stems plurals", () => {
    expect(tokenize("What Italian visa documents do I need?")).toEqual(["document"]);
  });

  it("off-topic question → 0 candidates (refusal without a model call)", () => {
    expect(rankSources(ROWS, { question: "Which neighborhood in Milan is best?", visibleStepIds: ["accommodation"] })).toEqual([]);
    expect(rankSources(ROWS, { question: "Is Italy safe?", visibleStepIds: [] })).toEqual([]);
  });

  it("keyword match ranks the right row first", () => {
    const r = rankSources(ROWS, { question: "What health insurance do I need?", visibleStepIds: [] });
    expect(r[0]!.row.id).toBe("it-health");
  });

  it("visible-step overlap alone never qualifies a row", () => {
    const r = rankSources(ROWS, { question: "hello", visibleStepIds: ["health-insurance", "accommodation"] });
    expect(r).toEqual([]);
  });

  it("focused step qualifies its rows even without keyword overlap", () => {
    const r = rankSources(ROWS, { question: "What should I do here?", focusStepId: "partita-iva", visibleStepIds: ["partita-iva"] });
    expect(r.map((x) => x.row.id)).toEqual(["it-partita"]);
  });

  it("the user's consulate post outranks another post's row", () => {
    const r = rankSources(ROWS, { question: "Do I need a lease?", visibleStepIds: [], consulatePostId: "los-angeles" });
    expect(r[0]!.row.id).toBe("us-los-angeles-dnv");
    const ids = r.map((x) => x.row.id);
    expect(ids.indexOf("us-new-york-dnv")).toBeGreaterThan(ids.indexOf("us-los-angeles-dnv"));
  });

  it("a question naming a step's copy routes to that step's rows", () => {
    const steps = [
      { id: "criminal-record", text: "Criminal record. Do not treat an FBI report or an apostille as a national rule." },
      { id: "health-insurance", text: "Health insurance. Medical and hospital coverage." },
    ];
    expect(implicitStepIds(new Set(tokenize("FBI apostille?")), steps)).toEqual(["criminal-record"]);
    const r = rankSources(ROWS, { question: "Do I need an apostille on my FBI check?", visibleStepIds: [], stepTexts: steps });
    expect(r.map((x) => x.row.id)).toEqual(["it-decree"]);
  });

  it(`returns at most ${ASK_MAX_SOURCES}, deterministic order`, () => {
    const many = [
      ...Array.from({ length: 10 }, (_, i) => row(`r-${String(i).padStart(2, "0")}`, { summary: "lease" })),
      ...Array.from({ length: 30 }, (_, i) => row(`f-${i}`, { summary: "other" })),
    ];
    const a = rankSources(many, { question: "lease", visibleStepIds: [] });
    expect(a).toHaveLength(ASK_MAX_SOURCES);
    expect(a.map((x) => x.row.id)).toEqual(rankSources(many, { question: "lease", visibleStepIds: [] }).map((x) => x.row.id));
  });
});
