/**
 * F11b retrieval (Cap decision 7) — deterministic, no embeddings.
 *
 * Candidates = active `internal.sources` rows tagged with the user's path.
 * A row qualifies when it shares a keyword with the question (IDF-weighted
 * over title / publisher / summary / notes) or maps to the focused step.
 * Ranking then adds: focused step, the user's own consulate post, and
 * a step the question names (implicitStepIds), and overlap with the user's visible steps (tie-break only — it never qualifies
 * a row on its own, so off-topic questions get 0 candidates → refusal without
 * a model call). Top ASK_MAX_SOURCES are numbered [S1]…
 */

import type { AccountDbClient } from "@/lib/account/export";
import { US_CONSULATE_SCOPE_PREFIX, CROSS_POST_SOURCE_IDS } from "@/lib/journey/checklist-sources";
import { ASK_MAX_SOURCES } from "@/lib/ask/copy";

export type AskSourceRow = {
  id: string;
  path_ids: string[];
  title: string;
  publisher: string;
  official_url: string;
  scope: string;
  doc_type: string;
  retrieved_at: string;
  notes: string | null;
  summary: string | null;
  summary_uncertain: boolean | null;
  step_ids: string[];
};

export const ASK_SOURCE_COLUMNS =
  "id, path_ids, title, publisher, official_url, scope, doc_type, retrieved_at, notes, summary, summary_uncertain, step_ids";

export async function loadAskSources(
  service: AccountDbClient,
  pathId: string,
): Promise<{ ok: true; rows: AskSourceRow[] } | { ok: false }> {
  try {
    const res = await service
      .schema("internal")
      .from("sources")
      .select(ASK_SOURCE_COLUMNS)
      .eq("status", "active")
      .contains("path_ids", [pathId])
      .order("id", { ascending: true });
    if (res.error) return { ok: false };
    return { ok: true, rows: (res.data ?? []) as AskSourceRow[] };
  } catch {
    return { ok: false };
  }
}

/**
 * Words that carry no retrieval signal in this domain (every row is about an
 * Italian visa) plus common English function words.
 */
const STOPWORDS = new Set(
  (
    "a an the and or but if then than so of to in on at by for from with without about into over under " +
    "is are was were be been being am do does did done doing have has had having can could should would will shall may might must " +
    "i me my mine we us our you your yours he she it its they them their this that these those there here " +
    "what which who whom whose when where why how whats wheres hows " +
    "not no yes any some all each every more most other such only own same too very just also " +
    "need needs needed get got make please tell know want like thing things really " +
    "bring check come go going take use way much many long best good ok okay hi hello thanks thank " +
    "italy italian italia visa visas nomad nomads nomade digital remote worker workers applicant applicants"
  ).split(/\s+/),
);

/** Lowercase, strip accents, split on non-alphanumerics, light stemming. */
export function tokenize(text: string): string[] {
  const norm = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const out: string[] = [];
  for (const raw of norm.split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOPWORDS.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

function stem(w: string): string {
  if (/^\d+$/.test(w)) return w;
  if (w.length > 5 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es") && /(ss|sh|ch|x)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export type RankInput = {
  /** Latest user message. */
  question: string;
  /** Earlier user turns (half weight) so short follow-ups keep context. */
  priorQuestions?: string[];
  focusStepId?: string | null;
  /** Display name of the focused step (adds its words to the query). */
  focusStepName?: string | null;
  visibleStepIds: readonly string[];
  /**
   * Visible steps' name + detail (Visa Ops copy). Used ONLY to route a question
   * to a step ("FBI apostille" → criminal-record); never sent to the model.
   */
  stepTexts?: readonly { id: string; text: string }[];
  consulatePostId?: string | null;
};

/** Steps whose copy shares a distinctive word (in ≤ 2 steps) with the query. */
export function implicitStepIds(queryTokens: ReadonlySet<string>, steps: readonly { id: string; text: string }[]): string[] {
  const stepTokens = steps.map((s) => ({ id: s.id, tokens: new Set(tokenize(s.text)) }));
  const df = new Map<string, number>();
  for (const s of stepTokens) for (const t of s.tokens) df.set(t, (df.get(t) ?? 0) + 1);
  return stepTokens
    .filter((s) => [...queryTokens].some((t) => s.tokens.has(t) && (df.get(t) ?? 99) <= 2))
    .map((s) => s.id);
}

/** ≈ one word that appears in under ~1/3 of rows. */
export const MIN_KEYWORD_SCORE = 1.5;

export type RankedSource = { row: AskSourceRow; score: number };

function docTokens(row: AskSourceRow): Set<string> {
  return new Set(
    tokenize([row.title, row.publisher, row.summary ?? "", row.notes ?? ""].join(" ")),
  );
}

function postOf(row: AskSourceRow): string | null {
  return row.scope?.startsWith(US_CONSULATE_SCOPE_PREFIX)
    ? row.scope.slice(US_CONSULATE_SCOPE_PREFIX.length)
    : null;
}

export function rankSources(rows: readonly AskSourceRow[], input: RankInput): RankedSource[] {
  if (rows.length === 0) return [];
  const docs = rows.map((row) => ({ row, tokens: docTokens(row) }));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tokens) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  const idf = (t: string) => Math.log(1 + n / (df.get(t) ?? n));

  const weights = new Map<string, number>();
  const addQuery = (text: string, w: number) => {
    for (const t of tokenize(text)) weights.set(t, Math.max(weights.get(t) ?? 0, w));
  };
  addQuery(input.question, 1);
  for (const q of input.priorQuestions ?? []) addQuery(q, 0.5);
  if (input.focusStepName) addQuery(input.focusStepName, 0.5);

  const visible = new Set(input.visibleStepIds);
  const implicit = new Set(implicitStepIds(new Set(tokenize(input.question)), input.stepTexts ?? []));
  const post = input.consulatePostId ?? null;
  const ranked: RankedSource[] = [];
  for (const { row, tokens } of docs) {
    let kw = 0;
    for (const [t, w] of weights) if (tokens.has(t)) kw += w * idf(t);
    const steps = row.step_ids ?? [];
    const focusHit = Boolean(input.focusStepId && steps.includes(input.focusStepId));
    const implicitHit = steps.some((s) => implicit.has(s));
    // A single very common word (low IDF) does not qualify a row on its own.
    if (kw < MIN_KEYWORD_SCORE && !focusHit && !implicitHit) continue;

    let score = kw + (focusHit ? 3 : 0) + (implicitHit ? 1.5 : 0);
    const rowPost = postOf(row);
    if (post && rowPost && !CROSS_POST_SOURCE_IDS.includes(row.id)) {
      score += rowPost === post ? 1.5 : -1.5;
    }
    if (steps.some((s) => visible.has(s))) score += 0.25;
    if (score <= 0) continue;
    ranked.push({ row, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
  return ranked.slice(0, ASK_MAX_SOURCES);
}
