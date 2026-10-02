# Journey path + checklist (F3) + sync/merge (F4)

Server-backed Italy visa progress after login. Runbooks: [`runbooks/F3-journey-checklist-runbook.md`](./runbooks/F3-journey-checklist-runbook.md), [`runbooks/F4-sync-merge-runbook.md`](./runbooks/F4-sync-merge-runbook.md). Auth routes: [`auth-api.md`](./auth-api.md).

## Scope

- **In (F3):** path select (`italy_digital_nomad` primary; `italy_remote_worker` same stub catalog), ternary step status, server persistence, export + purge wipe.
- **In (F4):** `expectedUpdatedAt` optimistic concurrency on PATCH; `POST /api/journey/sync` monotonic multi-device merge + opId replay-safety (no new table); bootstrap `hasServerJourney` from real `journey_cases`; checklist steps expose `updatedAt`; Case A auto-attach via sync `pathId`; Case B `MERGE_REQUIRED` on bootstrap/sync when local draft + server case.
- **Out:** billing (F3.1), Visa Ops / RAG, quiz personalization, multi-country, client-direct table grants, `nomade-prod` apply, durable `journey_sync_ops` (deferred).

## Paths

| pathId | Title | V1 |
|---|---|---|
| `italy_digital_nomad` | Italy Digital Nomad Visa | Live (primary) |
| `italy_remote_worker` | Italy Remote Worker Visa | Same stub catalog |

One active case per user per country (`unique (user_id, country_code)`). Path change: confirm on client → server resets all step statuses.

## Status + merge

`not_started` \| `in_progress` \| `done`. Progress = `done / totalVisibleSteps` (`in_progress` not counted as done).

**F4 multi-device merge (monotonic):** `not_started` < `in_progress` < `done`. Higher rank wins; same rank → newer `updated_at`; never silent downgrade. Explicit PATCH with matching `expectedUpdatedAt` may set any status (including downgrade after user confirms).

## Catalog

- Static TypeScript catalog in `src/lib/journey/catalog.ts` from `italy.yaml` ids.
- Version: `stub-italy-dnv-2026-10-01` (`catalogVersion` on checklist GET).
- Omits `hidden_unless_matched` steps (e.g. `dependent-permesso`).
- Disclaimer: **Preliminary guidance — not legal advice**.

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
