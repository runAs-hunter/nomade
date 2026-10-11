#!/usr/bin/env node
/**
 * F8: generate the official-sources seed migration SQL from the Visa Ops CSV.
 *
 *   node scripts/gen-sources-seed-sql.mjs > supabase/migrations/<version>_f8_official_sources_seed.sql
 *
 * Input: docs/sources/F8-official-sources-seed.csv (Visa Ops, Cap-accepted 2026-10-08).
 * The CSV is the only URL source. Engineering adds a stable slug id per row
 * (SEED_IDS below, keyed by official_url) and nothing else. path_ids split on "|".
 * Idempotent: ON CONFLICT (id) DO NOTHING.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SEED_CSV_PATH = path.join(ROOT, "docs/sources/F8-official-sources-seed.csv");

/** Stable citation slugs, keyed by the exact CSV official_url. */
export const SEED_IDS = {
  "https://vistoperitalia.esteri.it/?lang=it_IT": "it-maeci-visti-portal",
  "https://vistoperitalia.esteri.it/infovisto?code=13_0_D": "it-maeci-long-stay-visa-d",
  "https://prenotami.esteri.it/": "it-maeci-prenotami",
  "https://www.gazzettaufficiale.it/atto/serie_generale/caricaArticolo?art.codiceRedazionale=24A01716&art.dataPubblicazioneGazzetta=2024-04-04&art.idArticolo=1&art.idGruppo=0&art.idSottoArticolo=1&art.idSottoArticolo1=10&art.progressivo=0&art.versione=1":
    "it-gu-dm-2024-02-29-art1",
  "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1998-07-25;286":
    "it-normattiva-dlgs-286-1998",
  "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1998-07-25;286~art27quater":
    "it-normattiva-dlgs-286-1998-art27quater",
  "https://www.poliziadistato.it/articolo/225": "it-polizia-permesso-issue",
  "https://ambwashingtondc.esteri.it/en/chi-siamo/la-rete-consolare/": "us-washington-consular-network",
  "https://ambwashingtondc.esteri.it/wp-content/uploads/2026/02/Digital-nomad-Remote-Worker-Visa-2026.pdf":
    "us-washington-dnv-checklist-pdf",
  "https://ambwashingtondc.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/prenotazione-appuntamenti/":
    "us-washington-visa-booking",
  "https://consnewyork.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/visas-to-enter-italy/digital-nomad-remote-worker-visa/":
    "us-new-york-dnv",
  "https://conslosangeles.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/visa-type/digital-nomad-remote-worker-visa/":
    "us-los-angeles-dnv",
  "https://conssanfrancisco.esteri.it/wp-content/uploads/2024/05/DIGITAL-NOMAD-VISA.pdf":
    "us-san-francisco-dnv-checklist-pdf",
  "https://consboston.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/digital-nomad-remote-worker/":
    "us-boston-dnv",
  "https://conschicago.esteri.it/wp-content/uploads/2024/08/SF_DIGITAL-NOMAD-VISA_Rev.-17-05-2024.pdf":
    "us-chicago-dnv-checklist-pdf",
  "https://consdetroit.esteri.it/wp-content/uploads/2024/05/Nomade-Digitale-Visa.pdf":
    "us-detroit-dnv-checklist-pdf",
  "https://conshouston.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/digital-nomad/":
    "us-houston-dnv",
  "https://consmiami.esteri.it/wp-content/uploads/2024/05/LAVORO-AUTONOMO-NOMAD-VISA.pdf":
    "us-miami-dn-self-employed-pdf",
  "https://consmiami.esteri.it/wp-content/uploads/2024/05/LAVORO-SUBORDINATO-LAVORATORE-DA-REMOTO.pdf":
    "us-miami-rw-subordinate-pdf",
  "https://consfiladelfia.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/visa-categories/":
    "us-philadelphia-visa-categories",
};

/** Minimal RFC-4180 CSV parser (quoted fields, "" escapes, CRLF). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.length > 0)) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.length > 0)) rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? "").trim()])));
}

export function loadSeedRows(csvPath = SEED_CSV_PATH) {
  return parseCsv(readFileSync(csvPath, "utf8")).map((r) => {
    const id = SEED_IDS[r.official_url];
    if (!id) throw new Error(`No seed id for official_url: ${r.official_url}`);
    return {
      id,
      path_ids: r.path_ids.split("|").map((p) => p.trim()).filter(Boolean),
      country: "IT",
      title: r.title,
      publisher: r.publisher,
      official_url: r.official_url,
      doc_type: r.doc_type,
      scope: r.scope,
      retrieved_at: r.retrieved_at,
      notes: r.notes || null,
    };
  });
}

const lit = (s) => (s === null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const arr = (xs) => `array[${xs.map(lit).join(", ")}]::text[]`;

export function renderSeedSql(rows) {
  const values = rows
    .map(
      (r) =>
        `  (${lit(r.id)}, ${arr(r.path_ids)}, ${lit(r.country)}, ${lit(r.title)}, ${lit(r.publisher)},\n` +
        `   ${lit(r.official_url)},\n` +
        `   ${lit(r.doc_type)}, ${lit(r.scope)}, ${lit(r.retrieved_at)}::date, 'active',\n` +
        `   ${lit(r.notes)})`,
    )
    .join(",\n");
  return `-- F8: seed official sources (Visa Ops CSV, Cap-accepted 2026-10-08).
-- GENERATED by scripts/gen-sources-seed-sql.mjs from docs/sources/F8-official-sources-seed.csv.
-- ${rows.length} rows. URLs are verbatim from the CSV; no invented links.
-- Apply scope: local + nomade-dev ONLY. NEVER nomade-prod.

insert into internal.sources
  (id, path_ids, country, title, publisher, official_url, doc_type, scope, retrieved_at, status, notes)
values
${values}
on conflict (id) do nothing;
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.stdout.write(renderSeedSql(loadSeedRows()));
}
