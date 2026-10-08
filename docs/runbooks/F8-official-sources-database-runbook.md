# F8 — Official Sources database (Italy DNV first)

**Status:** APPROVED as written (Cap defaults), 2026-10-08  
**Owner:** Cap (main) + Visa Ops (source curation) → Theo (schema / API / ingest) → Chat / agent later  
**Out of scope this slice:** full RAG / LLM grounding, multi-country, iOS UI polish (F7 / Chat UI continue on parallel track), inventing visa rules, nomade-prod  
**Depends on:** F5 Visa Ops content (checklist catalog live / in flight); F3–F4 journey APIs; Chat UI redesign (#33) + checklist collapse (#32) on main @ `a9a2be5` (UI parallel — do not block)  
**Related:** F5 closed the “unofficial blogs as sole SoT” gate for checklist copy; F8 makes **official URLs** a first-class, refreshable store the future in-app agent can cite

---

## Goal

Stand up a **backend/content-first** source-of-truth database of **official** documents and pages for the Italy digital nomad / remote worker long-stay path (Americans → Italy), with enough metadata that a later in-app agent can **cite** them. Seed ~10–20 curated rows, expose a thin read API on the Nomade Next.js backend, and define a **monthly** freshness check — without shipping RAG, rewriting law into advice, or colliding with ongoing iOS UI work.

Later (post-F8): same schema / cadence becomes **universal across visa types**; Chat cites sources in a follow-on arc (F9 or Cap-scoped F8.x — Open #3).

---

## Locked (do not change)

- **Official sources only** as SoT — MAECI / esteri.it family, ministry / Gazzetta, INPS / Agenzia / Questura guidance when official, consulate pages. Blogs, Reddit, TikTok, and unofficial “visa guides” are **not** SoT (may appear in `notes` as “not for cite” only if Cap later allows; default = omit).
- Every row cites **`official_url` + `retrieved_at`** (ISO date). Agent / UI must never invent a URL.
- Disclaimer byte-for-byte: `Preliminary guidance — not legal advice`
- **No invented visa rules** — F8 stores pointers and metadata; it does not author eligibility, income floors, or timelines. Checklist copy stays Visa Ops / F5 catalog.
- **`nomade-prod` forbidden** until Isaias explicitly asks. Smoke / migrate only against **nomade-dev** / `nomade-eight.vercel.app` (and local).
- **Monthly refresh cadence** — human runbook step and/or cron stub; default not “scrape forever unattended.”
- Parallel UI track continues separately — **no iOS browsing UI required** in this slice (optional tiny Settings “Sources” link only if Cap marks it; default = skip).
- Workflow: Cap drafts → **Isaias approve** → Theo implements → Cap review → **Isaias merge**. Do not brief Theo / Visa Ops until approve. ~5–8 hrs/week capacity — keep MVP to ~1 week Theo + Visa Ops.

---

## Proposed slice (Cap default — approve or cut)

Keep MVP tight for **~1 week** of Theo + Visa Ops. Cap recommends shipping all five; cut #4 automation or #5 hook first if capacity slips.

### 1. Schema — `sources` table (or equivalent)

| Column | Notes |
|---|---|
| `id` | UUID / text PK |
| `path_id` | e.g. `italy_digital_nomad` (align F3 path ids); nullable later for shared docs |
| `country` | `IT` (seed); leave room for universal |
| `title` | Human label |
| `publisher` | e.g. MAECI, Ministero dell’Interno, Gazzetta Ufficiale, INPS, Agenzia delle Entrate, named consulate |
| `official_url` | Canonical HTTPS URL — Visa Ops fills from curated list (no invented links in seed PRs) |
| `doc_type` | enum-ish: `law` \| `decree` \| `consular_guidance` \| `procedure` \| `form` \| `portal` \| `other` |
| `jurisdiction` / `scope` | e.g. `national`, `US-consulate:new_york`, `questura` |
| `retrieved_at` | When Visa Ops last verified content meaning |
| `last_checked_at` | Last HTTP / freshness probe |
| `status` | `active` \| `stale` \| `retired` |
| `notes` | Internal curation notes (not user-facing advice) |
| `content_hash` or `snapshot_ref` | Optional; hash of fetched body or pointer to stored snapshot — enough for change detection, **not** full RAG corpus |
| `step_ids` | Optional `text[]` of F5 catalog step ids this source backs (agent/checklist cite hook) |
| `last_http_status` | Last probe result (200 / 301 / 404 …) |

Cap default storage: **Supabase on nomade-dev** (Open #1). If Isaias prefers zero migration this week, fall back to **versioned JSON/YAML in repo** compiled like F5 catalog — same columns, Theo still owns read API.

### 2. Seed set — Italy DNV / remote worker (~10–20 rows)

**Visa Ops owns the curation list** (titles, publishers, exact `official_url`, `retrieved_at`, `doc_type`, scope). Engineering does not invent URLs.

**Domain allowlist (examples — Visa Ops picks concrete pages):**

| Publisher family | Domains / anchors already in product |
|---|---|
| MAECI / visti | `vistoperitalia.esteri.it`, `www.esteri.it`, `prenotami.esteri.it` |
| US posts | `ambwashingtondc.esteri.it`, `cons*.esteri.it` (Boston, Chicago, Detroit, Houston, LA, Miami, NYC, Philadelphia, SF — see `consulates.ts`) |
| Interior / migration | `www.interno.gov.it`, official integrazionemigranti.gov.it pages when applicable |
| Law text | `www.gazzettaufficiale.it` (e.g. DNV/remote-worker decreto — Visa Ops cites the exact atto URL) |
| Contributions / tax (if relevant to post-arrival) | `www.inps.it`, `www.agenziaentrate.gov.it` — only official pages Visa Ops marks in-scope |

Prototype strings already in-repo (`src/data/countries/italy.yaml` sources block) are a **starting hint**, not the F8 seed. Seed PR includes Cap/Visa Ops sign-off that every URL is official and live.

### 3. Admin / read API (Next.js on `runAs-hunter/nomade`)

| Method | Path (proposed) | Auth |
|---|---|---|
| `GET` | `/api/sources?pathId=italy_digital_nomad` | Cap default: **public or JWT-optional read** for active rows only (Open #2) |
| `GET` | `/api/sources/{id}` | Same |
| `GET` | `/api/sources?q=` (optional) | Title / publisher search; skip if week slips |
| `POST` / `PATCH` / `DELETE` | admin write | **Authenticated** — service role or Cap-approved admin (no public write); Class C; F1.8 error envelope |

Smoke against **nomade-dev** / `nomade-eight.vercel.app` only. No prod env vars, no prod migration.

### 4. Monthly refresh — job stub **or** runbook step

- Re-fetch each `active` `official_url` (HEAD/GET), record status code, optional `content_hash` delta.
- On 404 / host change / hash change → set `status=stale` (or flag in notes); bump `last_checked_at`.
- Cap default: **human monthly checklist** in this runbook + optional `GET|POST /api/cron/check-sources` stub gated by `CRON_SECRET` (same pattern as `purge-accounts`). Wire Vercel cron later if Open #4 chooses automation.
- ⚠️ Vercel crons only fire on the **Production** deployment of a project — so adding a `vercel.json` cron entry is a prod-adjacent change. F8 default: **no new `vercel.json` cron entry**; trigger the stub manually with `curl` against nomade-dev. Cron wiring waits for an explicit Isaias ask.
- Refresh writes **operational columns only** (`last_checked_at`, `last_http_status`, `content_hash`, `status`) — never title / URL / curation fields; Visa Ops reviews flagged rows monthly.
- Do **not** scrape behind login, Prenot@Mi queues, or paywalls.

### 5. Thin hook for future in-app agent (no full RAG this slice)

Store metadata so Chat can later emit citations: `id`, `title`, `publisher`, `official_url`, `retrieved_at`, `path_id`, `status`.  
**Do not** ship embeddings, chunking, retrieval pipeline, or LLM prompt changes in F8 unless Cap marks **optional** and Isaias expands scope. Existing `/api/chat` stays untouched by default.

---

## Process gates

1. **Isaias** approves this runbook (or edits / cuts the slice) — **Approve as written / Edit slice / Pause**
2. Cap briefs **Visa Ops** → curated seed list (CSV/YAML/table: title, publisher, official_url, doc_type, path_id, retrieved_at)
3. Cap briefs **Theo** → schema (+ migration on nomade-dev if chosen) + read/admin API + refresh stub/docs; branch `task/F8-official-sources` (one task ID; never `git add .`; prefer squash)
4. Cap PR review → **Isaias merge** to backend main
5. Smoke on **nomade-dev** / `nomade-eight.vercel.app`: list-by-path returns seed; get-one works; write rejected without auth; refresh step dry-run flags a retired test URL
6. UI track remains parallel — no iOS PR required for F8 Done

---

## Done when

- [ ] Approved schema landed (Supabase **or** in-repo JSON — per Open #1) on **nomade-dev** only
- [ ] Visa Ops seed (~10–20 Italy DNV / remote-worker official rows) merged; every row has `official_url` + `retrieved_at`; no blog SoT
- [ ] `GET` list-by-path + get-one live on nomade-dev; writes authenticated
- [ ] Monthly refresh documented (human step and/or cron stub); at least one dry-run recorded
- [ ] Citation metadata fields present for future Chat; **no** full RAG shipped unless explicitly expanded
- [ ] Disclaimer unchanged; no invented rules; **no** nomade-prod touch
- [ ] This runbook + brief status updated

---

## Non-goals

- Full RAG / embeddings / “answer from PDF corpus”
- Multi-country or non-Italy paths (schema may allow `country`; seed stays IT)
- Scraping behind login, CAPTCHA, or Prenot@Mi session cookies
- Rewriting official docs into legal advice or replacing F5 checklist copy
- iOS UI for browsing sources (unless tiny Settings link Cap adds later)
- Briefing Theo / Visa Ops or opening PRs before Isaias approve
- Any change to `nomade-prod` / prod Supabase `whjzynfsifrtrxlylrww`

---

## Open questions for Isaias (max 5)

1. **Storage:** Supabase table on nomade-dev (`bgdrzdlenmwbpalnjiqg`) vs versioned JSON/YAML in repo (F5-style)? Cap default = **Supabase** for refresh/`last_checked_at`; JSON OK if we want zero migration this week.
2. **Read auth:** Public read of `active` sources vs require user JWT? Cap default = **public or JWT-optional** for cite-friendly agent later; writes always auth’d.
3. **Chat citations:** Ship cite plumbing in **F8** (metadata only) or defer display/prompt wiring to **F9**? Cap default = **metadata in F8, Chat cite UX in F9**.
4. **Monthly check owner:** Visa Ops human ritual vs Theo cron on Vercel? Cap default = **human checklist first**, cron stub optional same PR.
5. **Remote worker path:** Seed shared rows for `italy_digital_nomad` + `italy_remote_worker`, or DNV-only until Cap expands? Cap default = **tag both** where the official doc covers both categories.

---

## Brief status

- Cap draft written: **2026-10-08** (Europe/Rome)
- **APPROVED as written with Cap defaults: 2026-10-08** — Supabase on nomade-dev; public read of active rows; metadata in F8, Chat cite UX in F9; human monthly check + manual-trigger stub (no vercel.json cron); tag both paths where the doc covers both
- Visa Ops seed CSV: `/workspace/F8-official-sources-seed.csv` (20 rows, Cap accepted 2026-10-08)
- Cap seed locks: KEEP Normattiva + Polizia 225 + Gazzetta Art.1 deep-link; defer interno/AdE (bot 403); Prenot@Mi stay + refresh stub must not stale on bot 403
- Theo briefed for schema/API/seed/refresh stub: 2026-10-08
- Smoke target: nomade-dev / `nomade-eight.vercel.app`
- Theo implementation: 2026-10-08 — branch `task/F8-official-sources`; `internal.sources` + 20-row seed applied on **nomade-dev** (`bgdrzdlenmwbpalnjiqg`) only; API + manual refresh stub; **Ready for review** (Cap) → Isaias squash-merge. Details: [`../sources.md`](../sources.md) and Appendix B below.

---

## Appendix A — Suggested Visa Ops seed skeleton (placeholders)

Visa Ops fills exact `official_url` + dates. Do not paste unverified deep links into production seeds.

| # | title (placeholder) | publisher | path_id | doc_type |
|---|---|---|---|---|
| 1 | National visa / entry overview | MAECI | italy_digital_nomad | portal |
| 2 | Visti per l’Italia portal | MAECI | italy_digital_nomad | portal |
| 3 | Prenot@Mi booking portal | MAECI | italy_digital_nomad | portal |
| 4 | DNV / remote-worker decreto (Gazzetta) | Gazzetta Ufficiale | italy_digital_nomad (+ remote_worker) | decree |
| 5 | Interior ministry migration guidance | Ministero dell’Interno | italy_digital_nomad | procedure |
| 6–N | Competent US consulate DNV pages | Named consulate (esteri.it) | italy_digital_nomad | consular_guidance |
| … | INPS / Agenzia post-arrival pages (if in scope) | INPS / AdE | both | procedure |

Cap: ~10–20 rows total; quality > quantity; retire dead URLs promptly (`status=retired`).

---

## Appendix B — Implementation notes (Theo, 2026-10-08)

**Storage:** `internal.sources` on nomade-dev (`bgdrzdlenmwbpalnjiqg`). Migrations `20261008133111_f8_official_sources` (table, RLS deny-by-default, no anon/authenticated grants) + `20261008133126_f8_official_sources_seed` (20 CSV rows, `active`). Applied to nomade-dev via Supabase MCP with the same versions as the repo files. **nomade-prod untouched.**

**Multi-path tags:** `path_ids text[]` (GIN). CSV `italy_digital_nomad|italy_remote_worker` → both tags; Miami DN PDF = `italy_digital_nomad` only, Miami RW PDF = `italy_remote_worker` only.

**IDs:** stable slugs per URL (e.g. `it-maeci-prenotami`, `us-miami-rw-subordinate-pdf`) so future citations are portable across environments.

**Read auth:** public, `active` only, `notes` hidden. **Write auth:** service-role Bearer or `SOURCES_ADMIN_USER_IDS` JWT; `DELETE` = retire. Official-host allowlist on writes.

**Refresh:** `GET|POST /api/cron/check-sources` (`CRON_SECRET`, manual; **no** `vercel.json` entry). Stale only on 404/410 or DNS host death; `prenotami.esteri.it` 403 = `bot_blocked` (never stale); other non-2xx = `needs_review`. Browser-like UA. Operational columns only.

### Monthly human checklist (Visa Ops, first week of each month)

1. `curl -sS -H "Authorization: Bearer $CRON_SECRET" "https://<nomade-dev host>/api/cron/check-sources?dryRun=1"` — secret from Keeper, never pasted in chat/git.
2. Review every result whose `outcome` ≠ `ok`:
   - `dead` / `unreachable` → find the official replacement URL. Replace via `PATCH` (`officialUrl`, `retrievedAt`, `notes`) or retire (`DELETE`) and add the new row (`POST`). Never invent a URL; Cap signs off on new URLs.
   - `bot_blocked` → open the URL in a normal browser; if it loads, nothing to do.
   - `needs_review` / `error` → retry once in a browser; if the page is really gone, treat as `dead`.
   - `hostChanged` → confirm the new host is official (allowlist) and update `officialUrl`.
3. Run live: `curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/check-sources"` (add `?hash=1` to record `content_hash`; a hash change is a prompt to re-read the page, not proof the rules changed).
4. For any page whose meaning Visa Ops re-verified, `PATCH` `retrievedAt` (and `notes`).
5. Record the date + counts (`checked / healthy / botBlocked / staleFlagged / needsReview / errors`) in the team tracker.

### Dry-run record (2026-10-08 15:35 CEST)

Refresh pipeline (`runSourceCheck`, `dryRun: true`, Node fetch from the build box) over the 20 active nomade-dev rows plus two synthetic test rows (not inserted in the DB):

| Row | Method | HTTP | Outcome | Action |
|---|---|---|---|---|
| 20 seed rows (incl. `it-maeci-prenotami`) | HEAD | 200 | ok | none |
| test: `consmiami.esteri.it/…/F8-SMOKE-RETIRED-TEST.pdf` | GET | 404 | dead | **mark_stale** |
| test: `f8-smoke-no-such-host.esteri.it` | HEAD | 0 (`dns`) | unreachable | **mark_stale** |

Counts: `checked 22, healthy 20, botBlocked 0, staleFlagged 2, needsReview 0, errors 0`; **0 DB writes** (dry run). Prenot@Mi answered 200 to the browser-like UA (curl default UA gets 403; unit tests cover the 403 → `bot_blocked` path).
