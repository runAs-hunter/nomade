# Official Sources (F8)

Backend-only store of **official** source pointers (URL + `retrieved_at`) for the Italy digital nomad / remote worker paths, so a later in-app agent (F9) can cite them. Runbook: [`runbooks/F8-official-sources-database-runbook.md`](./runbooks/F8-official-sources-database-runbook.md).

- Pointers + metadata only. **Not** legal advice, **no** visa rules, **no** RAG / embeddings / chunking. `/api/chat` is unchanged.
- Disclaimer (byte-for-byte, from `JOURNEY_DISCLAIMER`): `Preliminary guidance — not legal advice`.
- Apply scope: local + **nomade-dev** only. **Never nomade-prod.**

## Schema — `internal.sources`

Migrations: `supabase/migrations/20261008133111_f8_official_sources.sql` (table) + `20261008133126_f8_official_sources_seed.sql` (20 seed rows).

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | Stable slug for seed rows (e.g. `it-maeci-prenotami`); admin POST may omit → uuid text. Citation key. |
| `path_ids` | `text[]` | Multi-tag. Seed `italy_digital_nomad\|italy_remote_worker` → `{italy_digital_nomad,italy_remote_worker}`. GIN index. |
| `country` | `text` | `IT` (ISO-2). |
| `title`, `publisher` | `text` | Human labels (Visa Ops). |
| `official_url` | `text` unique | `https://` only; API enforces the official-host allowlist. |
| `doc_type` | `text` | `law \| decree \| consular_guidance \| procedure \| form \| portal \| other` |
| `scope` | `text` | Jurisdiction / scope: `national`, `questura`, `US-consulate:<post-id>` (ids from `consulates.ts`). |
| `retrieved_at` | `date` | When Visa Ops last verified the content meaning. |
| `last_checked_at` | `timestamptz` | Refresh job only. |
| `last_http_status` | `int` | Refresh job only. `0` = network/DNS failure. |
| `status` | `text` | `active \| stale \| retired`. Public API returns `active` only. |
| `notes` | `text` | Internal curation notes — **not** returned by public GETs. |
| `content_hash` | `text` | Optional `sha256:<hex>` (refresh `?hash=1`). Change detection only. |
| `needs_review` | `boolean` | F12a. Set `true` by the check when a pinned form PDF hash differs (see docs/forms.md). Sticky; Visa Ops clears it with admin `PATCH { "needsReview": false }` after re-verifying. |
| `snapshot_ref` | `text` | Optional pointer to a stored snapshot (unused in F8). |
| `step_ids` | `text[]` | Optional F5 catalog step ids (empty in seed — Visa Ops maps later). |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` via `internal.set_updated_at()`. |

RLS on, **no** anon/authenticated grants or policies (same as `journey_cases` / `waitlist_signups`). Access only through the Next.js service client.

## Seed

- Source of truth: [`sources/F8-official-sources-seed.csv`](./sources/F8-official-sources-seed.csv) (Visa Ops, Cap-accepted 2026-10-08, 20 rows, byte-identical copy).
- `node scripts/gen-sources-seed-sql.mjs` renders the seed migration from the CSV (adds a stable slug id per URL; splits `path_ids` on `|`; keeps notes verbatim). `src/lib/sources/__tests__/seed.test.ts` fails if the committed migration drifts from the CSV, if a URL is not on the allowlist, or if a Cap KEEP row (Normattiva ×2, Polizia `articolo/225`, Gazzetta Art. 1 deep-link) or the Miami DN/RW split goes missing.
- Not seeded (not in CSV): `interno.gov.it`, Agenzia delle Entrate.

## API (F1.8 envelope)

Errors: `{ error: { code, message, requestId } }` + `x-request-id`.

### `GET /api/sources?pathId=&q=` — public

- Active rows only, ordered by `id`.
- `pathId` (optional, `^[a-z0-9_]{1,64}$`): rows whose `path_ids` contain it — rows tagged for both paths match either path. Malformed → `400 BAD_REQUEST`.
- `q` (optional, ≤100 chars): case-insensitive substring over title / publisher / scope.
- `200 { sources: PublicSource[], count, pathId, disclaimer, requestId }`

```json
{
  "id": "it-maeci-prenotami",
  "pathIds": ["italy_digital_nomad", "italy_remote_worker"],
  "country": "IT",
  "title": "Prenot@Mi visa appointment portal",
  "publisher": "MAECI",
  "officialUrl": "https://prenotami.esteri.it/",
  "docType": "portal",
  "scope": "national",
  "retrievedAt": "2026-10-08",
  "lastCheckedAt": null,
  "lastHttpStatus": null,
  "status": "active",
  "stepIds": []
}
```

### `GET /api/sources/{id}` — public

`200 { source, disclaimer, requestId }`. Missing / stale / retired / malformed id → `404 NOT_FOUND`.

### Admin writes — `POST /api/sources`, `PATCH /api/sources/{id}`, `DELETE /api/sources/{id}`

- **Auth:** `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (server-to-server / Visa Ops tooling, constant-time compare) **or** a Supabase user JWT whose user id is in `SOURCES_ADMIN_USER_IDS` (Cap-approved admins). No token / invalid token → `401 UNAUTHENTICATED`; valid non-admin user → `403 FORBIDDEN`. Public writes are always rejected.
- **Body (camelCase, strict):** `id?`, `pathIds`, `country?` (`IT`), `title`, `publisher`, `officialUrl`, `docType`, `scope`, `retrievedAt` (`YYYY-MM-DD`), `status?` (`active`), `notes?`, `stepIds?`, `snapshotRef?`. PATCH = any non-empty subset. Operational fields (`lastCheckedAt`, `lastHttpStatus`, `contentHash`) are refresh-only → `400`.
- **Official-host allowlist** (`OFFICIAL_HOST_SUFFIXES` in `src/lib/sources/validate.ts`): `esteri.it`, `gazzettaufficiale.it`, `normattiva.it`, `poliziadistato.it`, `gov.it`, `inps.it` (host equal or subdomain). Anything else → `400`. Extending it is a Cap-reviewed code change.
- `POST` → `201 { source: AdminSource }` (includes `notes`, `contentHash`, `snapshotRef`, timestamps). Duplicate id / URL → `409 CONFLICT`.
- `DELETE` is a **soft retire** (`status = retired`), so past citations stay resolvable in the DB; retired rows drop out of public GETs. Hard delete = SQL by a human on nomade-dev.

## Monthly refresh — `GET|POST /api/cron/check-sources`

`Authorization: Bearer ${CRON_SECRET}` (purge-accounts pattern). **F12a (Cap, 18 Oct 2026):** `vercel.json` schedules it monthly, `0 4 1 * *` UTC (04:00 UTC on the 1st), in **forms-only mode** (Cap review of #40): the scheduled run checks only pinned form PDFs and never auto-stales any other source — the full F8 check stays manual, as F8 intended. Forms-only is selected for Vercel Cron calls (user-agent `vercel-cron/…`; the bearer is still required) and by `?formsOnly=1`. Vercel crons fire on Production only and send the bearer automatically; Isaias approves the schedule by merging. Manual calls without `?formsOnly` run the full check as before.

| Query | Effect |
|---|---|
| `?dryRun=1` | Probe only; **no DB writes**. Use first every month. |
| `?hash=1` | GET + `sha256` the body; store `content_hash`; report `hashChanged`. |
| `?formsOnly=1` | F12a. Pinned form rows only (implied for Vercel Cron). |

Per active row (4 concurrent, 15 s timeout, `maxDuration = 60`):

1. `HEAD` with a browser-like UA (`… Chrome/129.0 Safari/537.36 NomadeSourceCheck/1.0`); `GET` fallback when HEAD is not 2xx/3xx (or always, with `?hash=1`). No cookies, no login, no Prenot@Mi queue — landing URL only.
2. Classify:

| Probe | `outcome` | Status change |
|---|---|---|
| 2xx / 3xx | `ok` | none |
| 404 / 410 | `dead` | **→ `stale`** |
| DNS `ENOTFOUND` (host death) | `unreachable` | **→ `stale`** |
| 403 on a `BOT_BLOCKED_HOSTS` host (`prenotami.esteri.it`) | `bot_blocked` | none — never stale |
| other 4xx / 5xx / 429 | `needs_review` | none (Visa Ops checks) |
| timeout / refused / TLS / other network | `error` | none |
| host not on allowlist | `skipped_non_official` | none, not probed |

   Final-URL host change (ignoring `www.`) → `hostChanged: true` flag only. Hash change → `hashChanged: true` flag only (consulate HTML churns).
3. Non-dry-run writes **operational columns only**: `last_checked_at`, `last_http_status`, `content_hash` (hash mode), `status = 'stale'` (hard failures). Update guarded by `status = 'active'`. Never touches title / URL / notes / curation fields.

**F12a pinned forms:** rows in `FORM_TEMPLATE_PINS` (src/lib/forms/registry.ts) are always fetched with `GET` and hashed, even without `?hash=1`. Pinned rows are **never staled** (so the free walkthrough stays up):

| Pinned PDF result | Effect |
|---|---|
| 2xx, verified PDF (`content-type: application/pdf` **and** body starts `%PDF-`), sha256 = pin | nothing |
| 2xx, verified PDF, sha256 ≠ pin | `needs_review = true`, `formHashMismatch: true` |
| 2xx but not a verified PDF (WAF page, soft 404) | `formFetchNotPdf: true`; no flag |
| 404 / 410 / DNS failure | `needs_review = true`, `formMissing: true`, `action: "mark_needs_review"`; **not** stale |
| 401/403/429/5xx/timeout | F8 outcome only; no flag |

The compare is always against the pin (registry), not the row's stored `content_hash`.

**Naming (Cap review N5):** the summary's `needsReview` **count** is the number of rows whose F8 *outcome* was `needs_review` (e.g. a 5xx) — it is **not** the `needs_review` **column**. Count column flags with `formHashMismatch + formMissing`.

Response: `200 { ok, requestId, checkedAt, dryRun, hashed, checked, healthy, botBlocked, staleFlagged, needsReview, errors, hostChanged, hashChanged, formHashMismatch, formFetchNotPdf, formMissing, formsOnly, writeFailures, results: [{ id, httpStatus, method, outcome, action, hostChanged, hashChanged, formHashMismatch?, formFetchNotPdf?, formMissing?, networkError? }] }`. In dry-run, `staleFlagged` / `action: "mark_stale"` mean *would* stale.

Why a browser-like UA **and** an allowlist: `prenotami.esteri.it` answers 403 to non-browser agents (e.g. curl's default UA) and 200 to browsers (verified 2026-10-08). The UA avoids most bot 403s; the allowlist guarantees a bot 403 never stales Prenot@Mi even if the WAF tightens.

```bash
# Dry run against nomade-dev (Preview / nomade-eight). CRON_SECRET from Keeper; never paste in chat/git.
curl -sS -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/check-sources?dryRun=1" | jq '{checked, healthy, botBlocked, staleFlagged, needsReview, errors}'
# Live (writes operational columns)
curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/check-sources"
```

## Code map

| File | Role |
|---|---|
| `src/lib/sources/types.ts` | Row / public / admin shapes, `SOURCES_DISCLAIMER` |
| `src/lib/sources/validate.ts` | Query parsing, zod write schemas, official-host allowlist |
| `src/lib/sources/repo.ts` | `internal.sources` reads / writes (service client) |
| `src/lib/sources/admin-auth.ts` | `requireSourcesAdmin` (service-role Bearer or admin JWT) |
| `src/lib/sources/check.ts` | Probe + classify + `runSourceCheck` |
| `src/app/api/sources/route.ts` | `GET` list, `POST` create |
| `src/app/api/sources/[id]/route.ts` | `GET` one, `PATCH`, `DELETE` (retire) |
| `src/app/api/cron/check-sources/route.ts` | Manual refresh stub |
| `scripts/gen-sources-seed-sql.mjs` | CSV → seed migration |

## Out of scope (F8)

Chat cite UX / prompt changes (F9), RAG / embeddings, iOS UI, multi-country seed, nomade-prod.

## F9 — `step_ids` mapping

- `docs/sources/F8-official-sources-seed.csv` has a `step_ids` column (`|`-separated, like `path_ids`). The CSV stays the source of truth.
- `node scripts/gen-sources-seed-sql.mjs --step-ids` renders an update-only migration that re-sets `step_ids` for every F8 + F9 gap row. The F8 seed output is unchanged.
- Migration history: `20261013184348_f9_sources_step_ids` (first mapping) was superseded by `20261013184804_f9_sources_gap_rows`, which is superseded by `20261013190421_f9_unmap_washington_visa_booking`. Only the latest one matches the generator; earlier files are kept as applied.
- `us-washington-visa-booking` has no `step_ids`: it is the same URL as the Washington `instructionUrl` in `consulates.ts`, so it stays in the picker only. `us-washington-consular-network` is cited on every post's `consulate-appointment`.
- Tests check every `step_ids` entry exists in the catalog for at least one of the row's `path_ids`, and that the committed migration matches the generator.
- `it-maeci-visti-portal` is deliberately unmapped (generic wizard). Consulate `instructionUrl` pages in `consulates.ts` are not sources.
- The checklist (`GET /api/journey/checklist`) attaches these rows per step — see `journey.md` F9. **Changing a source must not change step copy.**

### F9 gap rows (Cap add-on, 2026-10-13)

- `docs/sources/F9-sources-gap-rows.csv` (Visa Ops gap CSV with an `id` column) → `--f9-gap` → `supabase/migrations/20261013184804_f9_sources_gap_rows.sql`: inserts 12 rows, applies `URL_FIXES` (Gazzetta Art. 1 + `&art.flagTipoArticolo=0`), and re-sets every `step_ids` from the CSVs.
- Cap sent 14 rows; two pairs share an `official_url` (decree Art. 3 and Art. 6), and `official_url` is unique, so each pair is one row with merged `step_ids`. The MEF ticket-exemption row is dropped (Visa Ops to confirm).
- `cover-letter` is intentionally unsourced (empty state).
