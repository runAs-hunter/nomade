# F4 — Journey sync / merge (multi-device + offline SoT polish)

**Product:** Nomade  
**Repos:** `runAs-hunter/nomade` (Next.js App Router + Supabase); local checkout often `nomadeapp`  
**iOS:** `runAs-hunter/nomade-ios` (native SwiftUI; bundle `com.izaya.Nomade` / Team `LXT8T4YQR6`)  
**Mode:** Dedicated (`D`) for Theo PRs after Isaias approves this runbook; **main Cap** reviews PRs; Isaias merge gate  
**Date:** 2026-10-02  
**Owner:** **main Cap** (F4). Cap F3 owns F3.x only — do **not** route F4 work into the F3 chat.  
**Depends on:** F3 journey CLOSED (backend `nomade#19` @ `87ca6523`; iOS `#26` → main `b0b49ba4`); F2 auth CLOSED (SIWA, bootstrap, JWT/`requireAccess`, export/delete, F2.6p hard purge, F2.6r Apple revoke); F2.1 §7 merge contract; F0.1 server SoT + SwiftData cache/outbox; F0.2 Class C  
**Related:** F3 schema `internal.journey_cases` + `internal.journey_step_states`; APIs `GET paths`, `GET|POST case`, `GET checklist`, `PATCH steps/{stepId}`; F3.1 billing **PAUSED** (`nomade#20` Cap LGTM parked) — **out of F4**; historical ADR pointers F4.2 sync protocol / F4.3 idempotent APIs / F4.6 Case B UI

---

## Goal

Polish **multi-device / offline checklist** behavior now that F3 made the **server the source of truth** for signed-in journey progress. An authenticated user can edit steps **offline**, resume on another device, and reconcile without silent data loss — with clear conflict rules that obey F2.1 §7.

**Complete when:**

1. Signed-in iOS caches checklist for offline **read**; offline **writes** queue in a local outbox and flush when online.  
2. After login / session restore, client **pulls** server checklist, **reconciles** outbox, and **pushes** pending step updates (idempotent).  
3. Multi-device concurrent edits resolve under a **documented merge policy** (Cap default below); no silent Case B overwrite.  
4. Optimistic concurrency on step writes (Cap default: `expectedUpdatedAt` / `updated_at`) so stale writers get a conflict the client can recover from.  
5. Case A (local draft, no server journey) can **auto-attach** via sync upload after bootstrap (F2.1 §7.2). Case B surfaces **Keep server / Replace with local** (F4.6 slice inside this epic or tight follow-on — Open #1).  
6. `wipeJourney` / account delete continue to clear journey rows (already shipped in F3); sync cache + outbox wiped on account delete / hard purge path.  
7. Docs + unit tests + CI green; one task ID per PR; secrets in Keeper only; no secrets in chat.  
8. **No** billing, Visa Ops / RAG content rewrite, quiz personalization, multi-country, devices table sprawl, or Production schema apply.

---

## Locked pointers

| Item | Value |
|---|---|
| Bundle / Team | `com.izaya.Nomade` / `LXT8T4YQR6` |
| Supabase | Apply scope: **local + `nomade-dev` `bgdrzdlenmwbpalnjiqg` only**. **NEVER** touch `nomade-prod` `whjzynfsifrtrxlylrww` unless Cap opens a **separate** gate |
| Auth | All journey / sync routes: `requireAccess` (Bearer). Refuse `pending_deletion` / `deleted` like other account ops |
| Class | Journey case + step state + sync metadata = **F0.2 Class C** |
| Error envelope | F1.8 `{ error: { code, message, requestId? } }` — add / reuse `CONFLICT`, `MERGE_REQUIRED` |
| Access pattern | Next.js + **service client** after `requireAccess` — **no** client-direct table grants (F0.1 / F3) |
| Branch / PR | Backend `task/F4-sync-merge`; iOS `task/F4-ios-sync-merge` (or Cap-approved split under `task/F4-…`) — **one task ID**; never `git add .`; prefer squash |
| Owner chat | **main Cap** owns F4; Cap F3 does **not** brief/review F4 |
| Forbidden | `nomade-prod`; secrets in git/chat; billing/StoreKit (F3.1 paused); Visa Ops / RAG rewrite; quiz engine SoT; inventing Apple revoke changes; silent overwrite of server journey with local (Case B) |

---

## Current state (as of 2026-10-02)

| Piece | Status |
|---|---|
| F3 path select + ternary checklist + server SoT | **CLOSED** — backend `#19` @ `87ca6523`; iOS `#26` → `b0b49ba4` |
| Schema | `internal.journey_cases` + `internal.journey_step_states` (`updated_at` triggers exist; status `not_started\|in_progress\|done`) |
| APIs | `GET /api/journey/paths`, `GET\|POST /api/journey/case`, `GET /api/journey/checklist`, `PATCH /api/journey/steps/{stepId}` — last-write wins; **no** `expectedUpdatedAt` / ETag yet |
| Fresh case | All steps `not_started`; **no** local prototype import (F3 Open #7 locked) |
| Export `journey` / `wipeJourney` | **Shipped** (F3) — purge deletes cases → cascade steps |
| F2.1 Case A/B | Contract frozen; Case B UI still stub; bootstrap `hasServerJourney` can become true now that F3 tables exist |
| iOS offline | F3 thin cache OK; **no** durable outbox / multi-device reconcile protocol |
| F3.1 billing | **PAUSED** (`nomade#20` Cap LGTM parked) — **out of F4** |
| Historical F4.x ADR names | F4.2 sync protocol; F4.3 idempotent APIs; F4.6 Case B Keep/Replace UI; F4.7 claim-impact review (**out**) |

**Code anchors (do not invent secrets):**

- Journey: `src/lib/journey/*`, `src/app/api/journey/*`, `docs/journey.md`, `docs/runbooks/F3-journey-checklist-runbook.md`  
- Migration: `supabase/migrations/20261001152157_journey_cases_steps.sql`  
- Export / purge: `src/lib/account/export.ts`, `src/lib/account/purge.ts` (`wipeJourney`)  
- Auth / merge contract: `src/lib/auth/require-access.ts`, `docs/adrs/F2.1-identity-session-contract-adr.md` §7  
- Bootstrap merge hints: `POST /api/account/bootstrap` (`MERGE_REQUIRED`, `hasServerJourney`)  
- iOS: `Nomade/Journey/*`, existing SIWA / Keychain session (F2.4)  
- Platform: F0.1 SwiftData cache + outbox; server SoT after login  

---

## Approach decisions (Cap proposes → Isaias approve)

### A. Epic id + ownership

**Pick: This epic is `F4` (sync/merge polish). Owned by main Cap. Cap F3 stays on F3.x only. F3.1 billing remains paused / out of scope.**

| Option | Verdict |
|---|---|
| **A. F4 = sync/merge after F3 SoT; main Cap owns** | **Chosen.** Matches F3 After §3 and F2.1 pointers. |
| **B. Call this F3.2 under Cap F3** | Rejected — user locked main Cap for F4; F3 chat must not absorb sync. |
| **C. Split only F4.6 Case B and defer offline** | Rejected as sole scope — offline/multi-device is the product gap after F3. |

Sub-slice labels (docs only): **F4.2** protocol + concurrency, **F4.3** idempotent flush, **F4.6** Case B UI — may ship as **one backend + one iOS PR** if scope stays tight (Open #1).

### B. What “SoT polish” means

**Pick: Server remains canonical after login (F0.1 / F3). iOS holds a cache + outbox only. Online reads refresh from `GET /api/journey/checklist`. Offline writes enqueue; flush uses authenticated PATCH (and optional batch). Never treat SwiftData as archival SoT.**

### C. Concurrency primitive

**Pick: Reuse existing `journey_step_states.updated_at` (and case `updated_at`). PATCH accepts optional `expectedUpdatedAt`; mismatch → `409 CONFLICT` with current step payload. No new integer `version` / HTTP ETag column in V1 unless Open #2 chooses otherwise.**

| Option | Verdict |
|---|---|
| **A. `expectedUpdatedAt` on PATCH (ISO timestamptz)** | **Chosen.** Schema already has `updated_at`; smallest migration surface (often **API-only**). |
| **B. Integer `revision` column + check** | Alt — clearer monotonicity; needs migration on `nomade-dev`. |
| **C. HTTP `ETag` / `If-Match` only** | Alt — fine later; heavier for thin iOS client in V1. |
| **D. Blind last-write-wins forever** | Rejected — multi-device + offline will clobber. |

Checklist GET already returns per-step `status`; ensure each step (or PATCH response) exposes `updatedAt` for the client to echo back.

### D. Automatic step merge policy (multi-device, same Apple user)

**Pick: When both sides are “trusted server-bound” edits for the same `userId` (two devices, or outbox vs server), apply **monotonic status merge** by stepId:**

`not_started` < `in_progress` < `done`

- Winner = higher rank.  
- Tie (same status) → keep the row with the **newer `updated_at`** (no-op if equal).  
- **Never** auto-downgrade `done → in_progress` / `in_progress → not_started` without an explicit user action that won concurrency (fresh PATCH with matching `expectedUpdatedAt`).  
- Path change remains F3 policy: confirm → reset all steps (not a field merge).

This is **not** Case B. Case B is anonymous-local vs existing server journey (F2.1 §7) and still requires Keep/Replace.

| Option | Verdict |
|---|---|
| **A. Monotonic status + `updated_at` tie-break** | **Chosen** — matches checklist UX (progress should not silently regress across devices). |
| **B. Pure last-write-wins including downgrades** | Simpler; risks losing `done` when a stale offline device flushes. |
| **C. Always prompt per conflicting step** | Safest but noisy; defer unless Isaias wants Open #3 alt. |

### E. Case A / Case B (F2.1 §7) — in F4

**Pick:**

1. **Case A** — after bootstrap, if local draft/outbox exists and server has **no** journey case: **auto-upload** (create case if needed + apply step statuses). Idempotent. Respect F3 rule: do **not** invent a one-time import of *pre-F3 prototype binary completions* unless user explicitly created those statuses in the F3-era cache/outbox.  
2. **Case B** — local draft/outbox **and** server case exists at first conflict boundary → `409 MERGE_REQUIRED` (bootstrap and/or sync entry). iOS presents **Keep server** (discard local outbox/draft) or **Replace with local** (server steps superseded by local snapshot; irreversible after confirm). No “keep both”.  
3. Wire bootstrap `hasServerJourney` to real `exists(journey_cases where user_id = …)` if still stubbed.

| Option | Verdict |
|---|---|
| **A. Ship Case A auto-attach + Case B Keep/Replace UI in F4** | **Chosen default** (may be same iOS PR or `task/F4-ios-case-b` — Open #1). |
| **B. Protocol only; leave Case B stub** | Rejected as default — F2.1 / threat model AC-04 call this out; F3 made Case B reachable. |
| **C. Field-level “merge statuses” as a third Case B choice** | Out of V1 (F2.1 forbids keep-both; monotonic merge is for multi-device, not anonymous collision). |

### F. Sync API surface

**Pick: Keep F3 routes; extend PATCH; add one thin sync endpoint for flush + pull.**

| Method | Path | Purpose |
|---|---|---|
| `PATCH` | `/api/journey/steps/{stepId}` | **Extend:** body `{ status, expectedUpdatedAt? }`; on mismatch → `409 CONFLICT` + current `{ stepId, status, updatedAt, progress }` |
| `POST` | `/api/journey/sync` | **New:** body `{ baseCaseUpdatedAt?, mutations: [{ stepId, status, clientUpdatedAt?, opId }] }` → server applies monotonic merge (or conflict), returns fresh checklist snapshot + applied/rejected opIds |
| Existing | paths / case / checklist | Unchanged contracts except checklist steps include `updatedAt` if not already |

All `requireAccess` + active account. Mutations identified by client `opId` (UUID) for **idempotent replay** (F4.3 / SY-03) — Cap default: store recent `opId`s in-memory/DB lightly **or** treat `(case_id, step_id, status, clientUpdatedAt)` as replay-safe without a new table if Open #4 prefers zero schema (document choice).

**Cap default schema stance:** prefer **API-only** on existing tables; add a small `internal.journey_sync_ops` (opId, user_id, case_id, step_id, created_at) **only if** idempotency tests demand it (Open #4).

### G. iOS offline cache ↔ server

**Pick:**

1. Cache checklist (+ per-step `updatedAt`) for offline read.  
2. Outbox queue: ordered pending mutations `{ opId, stepId, status, expectedUpdatedAt?, enqueuedAt }`.  
3. On foreground / network regain / post-login: `GET checklist` (or `POST sync` pull) → reconcile → flush outbox.  
4. UI: show subtle “Pending sync” / “Offline” ; on `CONFLICT`, drop/recompute that op using server row + monotonic rule (or re-queue).  
5. On Case B Keep server: clear outbox + replace cache from server. On Replace: push local snapshot then treat server as SoT.  
6. Account delete / logout policy: **Cap default** — logout may keep encrypted cache until next login of **same** userId; **different** userId or delete/purge → wipe cache + outbox (Open #5).

Storage: **SwiftData** (F0.1) preferred; UserDefaults only if SwiftData not yet wired — Open #6.

### H. Backend then iOS order

**Pick: Backend PR first** (concurrency on PATCH, sync endpoint, bootstrap `hasServerJourney`, docs/tests), **then iOS PR** (outbox, flush, Case B UI, smoke). Same pattern as F3.

### I. Explicit non-goals (tight scope)

| Out | Belongs to |
|---|---|
| Billing / StoreKit / entitlements | **F3.1 paused** |
| Visa Ops claim review / RAG / catalog rewrite | Knowledge / later |
| Quiz / personalize conditional steps | Later |
| Multi-country | Post-Italy |
| `internal.devices` registry / push fanout | Later F4.x |
| F4.7 claim-impact rewrite UX | Later |
| Production schema apply | **Forbidden** |
| Client-direct Supabase CRUD | Rejected F0.1 |
| Changing soft-delete / SIWA / Apple revoke | F2 closed |
| Re-opening F3 stub catalog content | Out |

---

## Schema / API changes

### Schema

**Cap default: no migration required** if idempotency is replay-safe without durable op log.

**Optional (Open #4):**

```sql
-- only if Isaias picks durable idempotency log
create table internal.journey_sync_ops (
  op_id uuid primary key,
  user_id uuid not null references internal.users (id),
  case_id uuid not null references internal.journey_cases (id) on delete cascade,
  step_id text not null,
  status text not null check (status in ('not_started', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);
-- indexes + service_role-only grants; RLS deny-by-default (F3 pattern)
-- Apply: local + nomade-dev ONLY. NEVER nomade-prod.
```

**If Open #2 picks integer revision:** add `revision int not null default 1` to `journey_step_states` (+ bump on update). Prefer **not** doing both revision **and** sync_ops in the same PR unless needed.

### API sketches

#### `PATCH /api/journey/steps/{stepId}` (extended)

| | |
|---|---|
| **Auth** | `requireAccess` + active |
| **Body** | `{ "status": "not_started"\|"in_progress"\|"done", "expectedUpdatedAt"?: "<iso>" }` |
| **Success 200** | `{ stepId, status, updatedAt, progress, requestId }` |
| **409 CONFLICT** | `{ error: { code: "CONFLICT", … }, current: { stepId, status, updatedAt }, progress, requestId }` |
| **Notes** | If `expectedUpdatedAt` omitted → preserve F3 last-write behavior **or** treat as “force” only for Replace-with-local path (Open #7). Cap default: omitted = LWW for backward compat during rollout; iOS F4 always sends expected. |

#### `POST /api/journey/sync` (new)

| | |
|---|---|
| **Auth** | `requireAccess` + active |
| **Body** | `{ "mutations": [{ "opId": "<uuid>", "stepId": "<id>", "status": "…", "clientUpdatedAt"?: "<iso>" }], "baseCaseUpdatedAt"?: "<iso>" }` |
| **Success 200** | `{ caseId, pathId, catalogVersion, phases…, progress, appliedOpIds, rejected: [{ opId, code }], requestId }` |
| **409 MERGE_REQUIRED** | Case B entry (if sync used as upload before choice) — mirror bootstrap |
| **Behavior** | For each mutation: load server step; apply monotonic merge **or** conflict; idempotent on `opId`; return full checklist snapshot |

#### Bootstrap

Ensure `hasServerJourney: boolean` reflects real journey_cases row. Case B → `409 MERGE_REQUIRED` with `userId` still returned (F2.1 / F2.3).

#### Checklist GET

Each step includes `updatedAt` (required for client echo).

### Export / purge

- Export unchanged shape (already includes step `updatedAt`).  
- `wipeJourney` already deletes cases (cascade steps). If `journey_sync_ops` exists, delete-by-user or rely on case cascade.  
- iOS: on successful account delete / purge signal, wipe cache + outbox.

---

## Implementation sketch (Theo)

### Backend (`runAs-hunter/nomade`) — first

| Path | Purpose |
|---|---|
| `src/lib/journey/steps.ts` | Honor `expectedUpdatedAt`; return CONFLICT |
| `src/lib/journey/sync.ts` | Batch apply + monotonic merge + idempotency |
| `src/lib/journey/merge.ts` | Pure helpers: status rank, pick winner |
| `src/app/api/journey/steps/[stepId]/route.ts` | Wire extended body |
| `src/app/api/journey/sync/route.ts` | POST sync |
| Bootstrap helper | Real `hasServerJourney` |
| `src/lib/journey/__tests__/*` | Merge ranks, conflict, idempotent replay, Case A/B gates |
| Docs | This runbook → `docs/runbooks/`; update `docs/journey.md`, `docs/auth-api.md` |
| Optional migration | Only if Open #2 / #4 require columns/tables — **local + nomade-dev only** |

Reuse: `requireAccess`, `jsonError` / `ERROR_CODES`, service client, F1.8 logger (Class C — opIds, stepIds, codes; never full checklist dumps).

### iOS (`runAs-hunter/nomade-ios`) — second

| Path | Purpose |
|---|---|
| Journey cache + outbox store | SwiftData (or approved alt) |
| Sync engine | Pull → reconcile → flush; retry/backoff |
| `JourneyAPIClient` | PATCH with `expectedUpdatedAt`; POST sync; handle 409 |
| Case B UI | Keep server / Replace with local (F2.1 copy) |
| JourneyViewModel | Offline banner; pending ops; conflict recovery |
| Tests | Merge helper parity; outbox replay; decode CONFLICT |
| Docs | Thin iOS note under runbooks or Journey README |

Signed-out: no server sync upload. Anonymous local draft only becomes Case A/B **after** SIWA + bootstrap.

---

## Success criteria / device smoke

**Backend**

- [ ] PATCH with matching `expectedUpdatedAt` updates; mismatch → `409 CONFLICT` + current row  
- [ ] `POST /api/journey/sync` applies monotonic merge; replay same `opId` is no-op / identical  
- [ ] Bootstrap `hasServerJourney` true when case exists; Case B returns `MERGE_REQUIRED` when local draft asserted  
- [ ] Unit tests cover rank table + conflict + idempotency; CI green  
- [ ] Migration (if any) on **local + nomade-dev only**; **nomade-prod untouched**  
- [ ] Docs: runbook + journey.md + auth-api rows  

**iOS / device**

- [ ] Airplane mode: toggle steps → queued; back online → server matches (no lost `done`)  
- [ ] Two devices same account: advance same step on both → end state = monotonic winner  
- [ ] Stale device flush cannot downgrade server `done` without explicit winning PATCH  
- [ ] Case A: new Apple user with local draft → server case populated after sync  
- [ ] Case B: existing server journey + local draft → Keep discards local; Replace overwrites server after confirm  
- [ ] Account delete / wipeJourney → server empty; local cache/outbox cleared  
- [ ] No secrets in logs; one task ID; never `git add .`

**Reply smoke line (Isaias):**

```text
F4 offline→online flush: ok / fail
F4 two-device monotonic: ok / fail
F4 Case B Keep/Replace: ok / fail
F4 nomade-prod touched: no (required)
```

---

## Roles

| Who | Does |
|---|---|
| **main Cap** | Draft this runbook; lock Open decisions after Isaias approve; brief Theo; review PRs (concurrency, merge policy, no prod, no billing creep) |
| **Cap F3** | Does **not** own F4; F3.1 remains paused in F3 chat |
| **Theo** | Backend `task/F4-sync-merge` then iOS `task/F4-ios-sync-merge` (or Cap-approved `task/F4-…` split); apply migration only if approved; tests; open PRs |
| **Isaias** | **Approve gate** on Open decisions; merge gate; confirm any `nomade-dev` migration; no prod |

Cap/Theo: no secrets in chat; Keeper only; one task ID; never `git add .`; prefer squash. **Do not brief Theo until Isaias approves.** **Do not open PRs from this draft turn.**

---

## Task ID naming

| Work | Branch / task ID |
|---|---|
| Backend sync/merge | `task/F4-sync-merge` |
| iOS outbox + Case B | `task/F4-ios-sync-merge` |
| Optional split: Case B UI only | `task/F4-ios-case-b` |
| Optional split: idempotency migration | `task/F4-sync-ops` |

Pattern: **`task/F4-<short-kebab>`** — one task ID per PR; never `git add .`.

---

## Risks / watchouts

| Risk | Mitigation |
|---|---|
| Silent Case B overwrite | Hard-require Keep/Replace; Cap review rejects auto-replace |
| Offline flush downgrades `done` | Monotonic merge default; tests for downgrade attempts |
| Replay storms (SY-03) | `opId` idempotency; sync endpoint batch |
| Scope creep into billing / RAG / quiz | Explicit non-goals; main Cap rejects |
| Cap F3 vs main Cap confusion | Owner line; F3.1 paused callout |
| Accidental `nomade-prod` migration | Forbidden; Cap checks apply notes |
| Clock skew on `updated_at` | Server sets `updated_at`; client `expectedUpdatedAt` is echo of last server value, not device clock for concurrency check |
| Class C log leakage | Log codes + stepId + opId only |
| F3 clients without expectedUpdatedAt | Cap default omit = LWW during rollout (Open #7) |

---

## After F4

1. Devices table / multi-device presence (optional).  
2. F4.7 knowledge claim impact review when docs DB lands.  
3. Resume F3.1 billing only when Cap F3 + Isaias unpause.  
4. Stronger ETag/revision if `updated_at` proves insufficient.  
5. Production migration — **separate human gate**.

---

## Open decisions (Isaias approve gate)

Cap’s **proposed defaults** are in **bold**. Approve means Theo may implement against those defaults; edit here before the engineering branch opens.

| # | Topic | Cap proposes | Alt |
|---|---|---|---|
| 1 | Slice / PR shape | **One backend `task/F4-sync-merge` + one iOS `task/F4-ios-sync-merge` covering protocol + Case B UI** | Split Case B to `task/F4-ios-case-b`; or protocol-only first |
| 2 | Concurrency primitive | **`expectedUpdatedAt` on existing `updated_at` (API-first, no migration)** | Integer `revision` column; or HTTP ETag/`If-Match` |
| 3 | Multi-device auto merge | **Monotonic status (`not_started` < `in_progress` < `done`) + newer `updated_at` on ties** | Pure LWW including downgrades; or per-step prompt always |
| 4 | Idempotency durability | **Replay-safe without new table if tests allow; else small `journey_sync_ops`** | Always add `journey_sync_ops` migration on nomade-dev |
| 5 | Logout cache policy | **Wipe cache/outbox on delete/purge and on login as different userId; same userId may reuse cache** | Always wipe cache on every logout |
| 6 | Outbox storage | **SwiftData (F0.1)** | UserDefaults/file queue if SwiftData not ready |
| 7 | PATCH without `expectedUpdatedAt` | **Allow LWW for backward compat; F4 iOS always sends expected** | Require expected always (breaking for old builds) |
| 8 | Case A local draft source | **Only F3-era cache/outbox statuses — still no pre-F3 prototype binary import** | One-time map legacy completed ids → `done` |
| 9 | Sync entrypoint | **Add `POST /api/journey/sync` + extended PATCH** | Extended PATCH only (no batch) |
| 10 | Bootstrap `hasServerJourney` | **Wire to real `journey_cases` existence in same backend PR** | Separate tiny task |
| 11 | Owner / billing | **main Cap owns F4; F3.1 stays paused / out** | Unpause billing in parallel (rejected unless Isaias expands) |
| 12 | Apply migration | **None by default; if #2/#4 need schema → local + nomade-dev only** | Block F4 on prod apply (never) |

---

## Cap approval

Approve means: Theo may open `task/F4-sync-merge` (then `task/F4-ios-sync-merge`) against this runbook after Isaias checks the Open decisions table; **offline outbox + multi-device monotonic merge + Case A/B per F2.1** on **local/`nomade-dev` only**; server remains SoT; **no billing, no Visa Ops/RAG rewrite, no quiz, no `nomade-prod`**. main Cap briefs Theo and reviews PRs — **not** Cap F3.

---

## Reply checklist (Isaias after approve / merge)

```text
F4 runbook approved: yes / yes-with-edits / no
Owner: main Cap (default) / other: ___
PR shape: backend+iOS with Case B (default) / split Case B / protocol-only
Concurrency: expectedUpdatedAt (default) / revision column / ETag
Multi-device merge: monotonic (default) / LWW / per-step prompt
Idempotency table: defer if possible (default) / add journey_sync_ops
PATCH omit expected: LWW compat (default) / require always
Case A prototype import: still no (default) / one-time map
POST /api/journey/sync: yes (default) / PATCH-only
Wire hasServerJourney: yes (default) / separate task
F3.1 billing in F4: no (required default)
Apply migration nomade-dev: n/a / yes / no
nomade-prod touched: no (required)
Backend PR: URL
iOS PR: URL
Smoke offline→online / two-device / Case B: ok / fail
```
