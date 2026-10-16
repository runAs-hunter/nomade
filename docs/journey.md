# Journey path + checklist (F3) + sync/merge (F4) + Visa Ops catalog (F5)

Server-backed Italy visa progress after login. Runbooks: [`runbooks/F3-journey-checklist-runbook.md`](./runbooks/F3-journey-checklist-runbook.md), [`runbooks/F4-sync-merge-runbook.md`](./runbooks/F4-sync-merge-runbook.md). Auth routes: [`auth-api.md`](./auth-api.md).

## Scope

- **In (F3):** path select (`italy_digital_nomad`, `italy_remote_worker`), ternary step status, server persistence, export + purge wipe.
- **In (F4):** `expectedUpdatedAt` optimistic concurrency on PATCH; `POST /api/journey/sync` monotonic multi-device merge + opId replay-safety (no new table); bootstrap `hasServerJourney` from real `journey_cases`; checklist steps expose `updatedAt`; Case A auto-attach via sync `pathId`; Case B `MERGE_REQUIRED` on bootstrap/sync when local draft + server case.
- **In (F5):** static Visa Ops step copy in `src/lib/journey/catalog.ts` and the US consulate map in `src/lib/journey/consulates.ts`. `catalogVersion` is `visa-ops-italy-dnv-2026-10-03`. No migration.
- **Out:** billing (F3.1), RAG, CMS, quiz personalization, multi-country, client-direct table grants, `nomade-prod` apply, durable `journey_sync_ops` (deferred), iOS.

## Paths

| pathId | Title | V1 |
|---|---|---|
| `italy_digital_nomad` | Italy Digital Nomad Visa | Live |
| `italy_remote_worker` | Italy Remote Worker Visa | Live. Same phases except the thin delta below |

One active case per user per country (`unique (user_id, country_code)`). Path change: confirm on client → server resets all step statuses.

## Status + merge

`not_started` \| `in_progress` \| `done`. Progress = `done / totalVisibleSteps` (`in_progress` not counted as done).

**F4 multi-device merge (monotonic):** `not_started` < `in_progress` < `done`. Higher rank wins; same rank → newer `updated_at`; never silent downgrade. Explicit PATCH with matching `expectedUpdatedAt` may set any status (including downgrade after user confirms).

## Catalog

- Static TypeScript catalog in `src/lib/journey/catalog.ts` (step source of truth). Not RAG. Not a CMS.
- `catalogVersion`: `visa-ops-italy-dnv-2026-10-03` (checklist GET). This replaces the stub version `stub-italy-dnv-2026-10-01`.
- Disclaimer stays **Preliminary guidance — not legal advice**.
- Phases: Gather documents, Apply, After arrival.
- All 13 F3 step ids stay: `passport`, `proof-of-income`, `health-insurance`, `accommodation`, `criminal-record`, `cover-letter`, `financial-statements`, `consulate-appointment`, `submit-application`, `visa-fee`, `permesso-soggiorno`, `codice-fiscale`, `anagrafe`.
- Both paths also include `highly-qualified` and `prior-experience`.
- Thin remote-worker delta: drop `partita-iva`, add `employment-contract` (Gather documents, after `cover-letter`), and a different `proof-of-income` detail. Nomad keeps `partita-iva` (After arrival, after `anagrafe`) and does not include `employment-contract`.
- `dependent-permesso` stays omitted.
- No SQL migration. New cases seed every step id for the chosen path as `not_started`. When a checklist is read, missing catalog ids are inserted as `not_started` only. Existing rows are not deleted and statuses are not reset. Path change still replaces step rows (F3).

## Consulate map

- `src/lib/journey/consulates.ts`: 10 US career posts. Honorary offices are not listed.
- One booking URL for every post: `https://prenotami.esteri.it`. Do not scrape Prenot@Mi.
- `GET /api/journey/paths` adds `usConsulatePosts` (`id`, `instructionUrl`, `bookingUrl`, `note`, `jurisdiction`) beside `paths`. The client does not send a region.

## Schema (Class C)

- `internal.journey_cases`
- `internal.journey_step_states` (cascade on case delete)

RLS enabled; **no** anon/authenticated policies or grants. Access only via Next.js service client after `requireAccess` (F2.3 pattern). **F4:** no migration / no `journey_sync_ops` (replay-safe without durable op log).

## APIs

All Bearer `requireAccess` + **active** account (`pending_deletion` → 403, `deleted` → 410):

| Method | Path |
|---|---|
| `GET` | `/api/journey/paths` |
| `GET` \| `POST` | `/api/journey/case` |
| `GET` | `/api/journey/checklist` |
| `PATCH` | `/api/journey/steps/{stepId}` |
| `POST` | `/api/journey/sync` |

Fresh case create does **not** import local prototype completions — all steps seed `not_started`.

### PATCH concurrency (F4)

- Body: `{ status, expectedUpdatedAt? }`
- Omit `expectedUpdatedAt` → F3 last-write-wins (compat).
- When provided and mismatch → `409 CONFLICT` with `{ error, current: { stepId, status, updatedAt }, progress, requestId }`.

### Sync (F4)

- Body: `{ mutations: [{ opId, stepId, status, clientUpdatedAt? }], hasLocalDraft?, pathId?, baseCaseUpdatedAt? }`
- Success: checklist snapshot + `appliedOpIds` + `rejected` + `requestId`.
- Case B: `hasLocalDraft: true` + existing case → `409 MERGE_REQUIRED`.
- Case A: no case + `pathId` → create case then apply mutations.
- Idempotency: same step/status replay is applied no-op; no new table (Open #4).

## Export / purge

- Export `journey` array: case + step states (F3 fills former empty stub).
- `wipeJourney(service, userId)` deletes `journey_cases` (steps cascade). Chat/billing wipe stubs remain.

## Logging

Class C: log `stepId`, `opId`, status codes, progress counts — never full checklist / detail payloads.

## F9 — Checklist sources (`GET /api/journey/checklist`, additive)

Runbook: F9 "Checklist cites official sources". Additive fields; older clients ignore them.

- `phases[].steps[].sources: ChecklistSourceView[]` — national/questura rows from `internal.sources` (`status = active`, `path_ids` contains the case path, `step_ids` contains the step). Plus the cross-post Washington consular-network map (`us-washington-consular-network`) on `consulate-appointment`.
- `consulateSources: { [postId]: ChecklistSourceView[] }` — active `US-consulate:<postId>` rows for the path, each with `stepIds`. The server never learns the user's post; the device picks its own entry (residence stays device-local).
- `sourcesVersion: string | null` — max `updated_at` of the returned rows (cache-bust).
- `ChecklistSourceView = { id, title, publisher, url, host, retrievedAt, docType, stepIds? }`. `host` is the URL hostname with `www.` stripped. `retrievedAt` is the Visa Ops curation date ("Last verified"), never `lastCheckedAt`.
- Stale/retired rows are hidden. A step with no row gets `sources: []` (client shows "Official source not yet linked for this step").
- If the sources read fails, the checklist is still returned (200) with empty `sources` and a `warn` log.
- **A source change must never change step copy.** `name`/`detail`, `catalogVersion`, and `disclaimer` are independent of sources.


## F10 — Billing gate

- Phases carry stable ids (`gather` / `apply` / `after`) in `catalog.ts`; display names (`Gather documents` / `Apply` / `After arrival`) may change without touching the gate.
- Free: path select, case create, all of **Gather documents**. Paid: **Apply** + **After arrival** status writes (PATCH → `403 ENTITLEMENT_REQUIRED`; sync ops → rejected `ENTITLEMENT_REQUIRED`).
- Checklist GET: `access` per phase/step + `entitlement.journeyFull`. Locked steps return title + `sources`, `detail: ""`. Disclaimer unchanged.
- Export/purge include billing — see [`billing.md`](./billing.md).

## Task card v2 — step `summary` (optional)

- Checklist steps may carry `summary` (string, one line, ≤ 100 chars): a Visa Ops action phrase cited by the same sources as `detail`. Copy lives in `JOURNEY_STEP_SUMMARIES` in `catalog.ts` (`all` by step id, `byPath` overrides). It ships **empty**; Visa Ops writes it and Cap reviews.
- The key is **omitted** when there is no copy (blank strings count as absent) and on locked steps (same rule as `detail`). Clients show no summary line then, and never derive one from `detail`.
- `detail`, `catalogVersion` and the disclaimer are unchanged.

## F11a — Intake → rules (`INTAKE_ENABLED`, default off)

- Storage: `internal.journey_intake (case_id PK → journey_cases(id) on delete cascade)`. A path change updates `journey_cases.path_id` in place, so answers survive it; account purge deletes the case and the intake cascades.
- Questions (5, server-owned, `GET /api/journey/intake`): `incomeSource` (`freelancer|business_owner|foreign_employee|mixed|unsure`, served in this order; clients render server order and never sort; labels live on the client, e.g. iOS "I'm a freelancer" / "I work for a company outside Italy"), `incomeThreshold` (`yes|no|unsure`), `housing` (`lease|own|not_yet|unsure`), `family` (`solo|spouse|spouse_children|children|unsure`, art. 29 c.1 a/b), `arrivalMonth` (`YYYY-MM`, at most +24 months, past accepted; `null` = not sure). "Not sure" is stored explicitly so `completedAt` is set once all 5 keys are present; an absent key = not reached. The FBI question was dropped (Cap, 2026-10-16).
- `PUT /api/journey/intake {answers, clientUpdatedAt}` → `{intake, applied, checklist}` (auth is checked before the flag); whole-object replace, LWW on `clientUpdatedAt`. `400 BAD_INTAKE`, `404 NO_JOURNEY_CASE`. Free.
- Sync: `{opId, kind: "intake", answers, clientUpdatedAt}`; older clock = applied no-op; bad answers → `BAD_INTAKE` per op.
- Rules (`src/lib/journey/intake.ts`, `INTAKE_RULES_VERSION = "f11-rules-2026-10-16"`): pure, deterministic. Patches: `hide`, `add` (conditional catalog steps `family-documents`, `family-permesso`), `note`, `flag`. Hidden steps keep state rows and leave progress. Copy (Visa Ops) lives in `intake-copy.ts`; every entry cites source ids, filtered to the path's active rows. No euro figures.
- Flag off: conditional family steps are not seeded, not writable (`UNKNOWN_STEP`), and not exported.
- `INCOME_BELOW_THRESHOLD` also carries `consulateSourceIds: {<postId>: [ids]}`; the device cites its own post's rows.
- Checklist additions (only when on): `intake {completed, rulesVersion, sources}` (`sources` = every row cited by a flag, a flag's `consulateSourceIds`, or a note, so clients can always render the citation), `flags [{code, text, sourceIds, consulateSourceIds?}]`, step `notes [{key, text, sourceIds, uncertain?}]`, step `origin "catalog"|"intake"`.
- Dev-only data fixes live in `scripts/dev-only/` (never migrations, never prod).
- Export: `journey[].intake = {answers, rulesVersion, completedAt, updatedAt}` (null when none).
