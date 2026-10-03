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
