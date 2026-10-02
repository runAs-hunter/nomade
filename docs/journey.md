# Journey path + checklist (F3)

Server-backed Italy visa progress after login. Runbook: [`runbooks/F3-journey-checklist-runbook.md`](./runbooks/F3-journey-checklist-runbook.md). Auth routes: [`auth-api.md`](./auth-api.md).

## Scope

- **In:** path select (`italy_digital_nomad` primary; `italy_remote_worker` same stub catalog), ternary step status, server persistence, export + purge wipe.
- **Out:** sync/merge polish (F4.x), Visa Ops / RAG, quiz personalization, multi-country, client-direct table grants, `nomade-prod` apply.
- **Billing gate (F3.1):** see [`billing.md`](./billing.md) — free Gather Documents; paid Apply + After Arrival via server entitlement.

## Paths

| pathId | Title | V1 |
|---|---|---|
| `italy_digital_nomad` | Italy Digital Nomad Visa | Live (primary) |
| `italy_remote_worker` | Italy Remote Worker Visa | Same stub catalog |

One active case per user per country (`unique (user_id, country_code)`). Path change: confirm on client → server resets all step statuses.

## Status

`not_started` \| `in_progress` \| `done`. Progress = `done / totalVisibleSteps` (`in_progress` not counted as done).

## Catalog

- Static TypeScript catalog in `src/lib/journey/catalog.ts` from `italy.yaml` ids.
- Version: `stub-italy-dnv-2026-10-01` (`catalogVersion` on checklist GET).
- Omits `hidden_unless_matched` steps (e.g. `dependent-permesso`).
- Disclaimer: **Preliminary guidance — not legal advice**.

## Schema (Class C)

- `internal.journey_cases`
- `internal.journey_step_states` (cascade on case delete)

RLS enabled; **no** anon/authenticated policies or grants. Access only via Next.js service client after `requireAccess` (F2.3 pattern).

## APIs

All Bearer `requireAccess` + **active** account (`pending_deletion` → 403, `deleted` → 410):

| Method | Path |
|---|---|
| `GET` | `/api/journey/paths` |
| `GET` \| `POST` | `/api/journey/case` |
| `GET` | `/api/journey/checklist` |
| `PATCH` | `/api/journey/steps/{stepId}` |

Fresh case create does **not** import local prototype completions — all steps seed `not_started`.

## Export / purge

- Export `journey` array: case + step states (F3 fills former empty stub).
- `wipeJourney(service, userId)` deletes `journey_cases` (steps cascade).
- Billing export + `wipeBilling` — see [`billing.md`](./billing.md) (F3.1).

## Logging

Class C: log `stepId`, status codes, progress counts — never full checklist / detail payloads.


## Billing gate (F3.1)

- Free phase: **Gather Documents** (writable without entitlement).
- Paid phases: **Apply**, **After Arrival** → PATCH without `journey_full` returns `403 ENTITLEMENT_REQUIRED`.
- Path select + case create remain free. Details: [`billing.md`](./billing.md).
