# F3 — Journey path + checklist (user-visible progress)

**Product:** Nomade  
**Repos:** `runAs-hunter/nomade` (Next.js App Router + Supabase); local checkout often `nomadeapp`  
**iOS:** `runAs-hunter/nomade-ios` (native SwiftUI; bundle `com.izaya.Nomade` / Team `LXT8T4YQR6`)  
**Mode:** Dedicated (`D`) for Theo PRs after Isaias approves this runbook; Cap reviews PRs; Isaias merge gate  
**Date:** 2026-10-01  
**Depends on:** F2 auth CLOSED (SIWA, bootstrap, JWT/`requireAccess`, export/delete, F2.6p hard purge, F2.6r Apple revoke); F0.1 journey schema sketch; F0.2 Class C; F2.1 §7 merge rules (Case A/B deferred to later sync polish)  
**Related:** Prototype `italy.yaml` + personalize engine + iOS `JourneyView` (local-only); F2.6 export `journey: []` + F2.6p `wipeJourney` stub; planned later **official docs / knowledge DB** for in-app agent (out of F3); historical ADR numbering called journey **F4** and billing **F3.1** — this runbook **reclaims F3** for the first user-visible journey slice (see Open decision #1)

---

## Goal

Ship the **first user-visible progress slice** after auth: an authenticated user can **select an Italy visa path** (digital nomad primary), see a **phased checklist of steps** with status **`not_started` / `in_progress` / `done`**, and have that progress **persist server-side per user** — with thin iOS screens wired to the new APIs.

**Complete when:**

1. User with valid Bearer + bootstrapped account can **select a path** (at least `italy_digital_nomad`) and get/create a **journey case**.  
2. User can **GET** a checklist for that case: phases + steps (stub/static copy for V1) + per-step status + aggregate progress.  
3. User can **PATCH** a step status; progress survives relaunch / device change (server SoT after login per F0.1).  
4. Migration lands journey tables under `internal` (applied **local + `nomade-dev` only** — **never `nomade-prod`** in this task).  
5. F2.6 export `journey` array populated with case + step states; F2.6p `wipeJourney` deletes the user’s journey rows (no longer a no-op).  
6. Thin iOS: path select + checklist screens (adapt existing `JourneyView` / `JourneyViewModel` where practical) calling authenticated APIs; local cache OK, server wins after login.  
7. Docs + unit tests + CI green; one task ID per PR; secrets in Keeper only; no secrets in chat.  
8. **No** docs RAG agent, billing, multi-country beyond Italy, Apple revoke changes, or Production schema apply.

---

## Locked pointers

| Item | Value |
|---|---|
| Hero path | Italy **digital nomad / remote worker** visa for Americans; **digital nomad primary** |
| Bundle / Team | `com.izaya.Nomade` / `LXT8T4YQR6` |
| Supabase | Apply scope: **local + `nomade-dev` `bgdrzdlenmwbpalnjiqg` only**. **NEVER** touch `nomade-prod` `whjzynfsifrtrxlylrww` unless Cap explicitly opens a separate gate |
| Auth | All journey routes: `requireAccess` (Bearer). Refuse `pending_deletion` / `deleted` like other account ops (export exception stays F2.6-only) |
| Class | Journey case + step state = **F0.2 Class C** |
| Error envelope | F1.8 `{ error: { code, message, requestId? } }` |
| Branch / PR | Backend `task/F3-journey-checklist`; iOS `task/F3-ios-journey-checklist` (or Cap-approved split) — **one task ID**; never `git add .` |
| Content V1 | **Stub/static** step catalog (ids + titles + short detail) derived from existing `italy.yaml` task ids — **not** knowledge DB / Visa Ops publish pipeline |
| Forbidden | `nomade-prod`; secrets in git/chat; full RAG agent; billing/StoreKit; multi-country; inventing Apple revoke changes; silent overwrite of server journey with local (Case B → later F4.6) |

---

## Current state (as of 2026-10-01)

| Piece | Status |
|---|---|
| F2 auth (SIWA, bootstrap, JWT, export/delete, purge, Apple revoke) | **CLOSED** |
| `internal.users` / `auth_identities` / deletion machine | **Shipped** |
| Journey tables (`cases`, step states, …) | **Missing** — this task |
| Journey API routes | **Missing** — `docs/auth-api.md` already reserves “Future journey sync → Protected” |
| Export `journey: []` | **Shipped empty** (`src/lib/account/export.ts`) — fill in F3 |
| `wipeJourney` in purge | **Stub no-op** (`src/lib/account/purge.ts` comment: “until F4 tables exist”) — implement real wipe in F3 |
| Prototype checklist content | **Exists:** `src/data/countries/italy.yaml` (phases Gather Documents / Apply / After Arrival; task ids `passport`, `proof-of-income`, …) + `src/engine/personalize.ts` |
| iOS local journey UI | **Exists in tree:** `Journey/JourneyView.swift`, `JourneyViewModel`, `Domain/PersonalizedChecklist`, `Store/AppStore` (binary completed-id set, **local only**, no server) |
| Quiz / personalize profile | Prototype exists (web + iOS); **not required** to block F3 path+status slice (Open decision #6) |
| Official docs / claims DB | **Not ready** — deferred; Cap default = static stub catalog |
| Billing / StoreKit | **Out** (historical F3.1) |
| F3 / F4 ADR runbook for journey | **None on GitHub** under `docs/runbooks` (only F2.x); no F3 journey ADR found |

**Code anchors (do not invent secrets):**

- Auth: `src/lib/auth/require-access.ts`, `docs/auth-api.md`  
- Export / purge stubs: `src/lib/account/export.ts`, `src/lib/account/purge.ts` (`wipeJourney`)  
- Prototype content: `src/data/countries/italy.yaml`, `src/data/schema.ts`, `src/engine/personalize.ts`  
- iOS: `Nomade/Journey/*`, `Nomade/Domain/PersonalizedChecklist.swift`, `Nomade/Store/AppStore.swift`  
- Schema foundation: `supabase/migrations/*_create_internal_and_api_schemas.sql`, bootstrap identity migration  

---

## Approach decisions (Cap proposes → Isaias approve)

### A. Epic numbering: F3 = journey slice

**Pick: This epic is `F3` (journey path + checklist). Billing stays `F3.1`. Fuller sync/merge/conflict UI remains later `F4.x`.**

| Option | Verdict |
|---|---|
| **A. Reclaim F3 for user-visible journey now** | **Chosen.** Matches product priority (progress UX before more auth/billing). |
| **B. Keep historical F4 = journey; call this F4.0** | Rejected for this draft — user locked “F3 journey/checklist”; would confuse the approve thread. |
| **C. Invent F2.7** | Rejected — F2 auth is closed; this is a new product surface. |

Docs that still say “F4 journey wipe” / “F3 billing” get a one-liner cross-ref in this runbook’s Docs section; no mass ADR rewrite unless Cap opens it.

### B. Path model (multi-path MVP, DNV primary)

**Pick: Explicit `pathId` on a journey case. V1 ships `italy_digital_nomad` as selectable primary. Optionally list `italy_remote_worker` as a second path that shares the same stub step catalog (or “coming soon” — Open decision #2).**

| Option | Verdict |
|---|---|
| **A. Path picker + DNV live; remote-worker shares stub catalog** | **Chosen default.** Smallest multi-path shape; shared steps with room for tweaks later. |
| **B. Auto-create DNV case; no picker UI** | Faster, but hides the product’s path concept. |
| **C. Full divergent catalogs per path now** | Rejected for V1 — content debt without docs DB. |

One **active case per user per country** for V1 (Italy only). Changing path: Cap default = confirm → reset step states for the new path (Open decision #3).

### C. Step content: stub/static (not Visa Ops / docs DB)

**Pick: Server-side static catalog in code (TypeScript const / JSON checked into repo), keyed by `pathId`, shaped from existing `italy.yaml` task ids + phase names + short detail strings. Mark UI with a quiet “Guidance is preliminary” note. Do not call knowledge/RAG APIs.**

| Option | Verdict |
|---|---|
| **A. Stub/static catalog from italy.yaml ids** | **Chosen.** Unblocks UX now; planned docs DB later replaces catalog without rewriting progress rows if step ids stay stable. |
| **B. Block F3 until Visa Ops curated claims** | Rejected — user wants visible progress now. |
| **C. Client-only bundled YAML, no server catalog** | Rejected as SoT — F0.1 says canonical journey state is server after login; catalog should be server-served (or at least server-versioned) so both clients agree. |

Personalize-engine conditionals (`hidden_unless_matched`, income warnings) are **out of F3 default** — show the **universal / always-visible** Italy DNV step list (omit `dependent-permesso` unless Open decision #6 pulls quiz in). Cap default: **omit** `hidden_unless_matched` steps in V1 stub.

### D. Status model (ternary)

**Pick: Per-step status ∈ `not_started` | `in_progress` | `done`. Default on case create: all `not_started`.**

| Option | Verdict |
|---|---|
| **A. Ternary statuses** | **Chosen** — matches user ask; upgrades prototype’s binary completed-set. |
| **B. Keep binary done/not** | Rejected — loses “in progress” UX. |

Progress fraction = `done / totalVisibleSteps` (in_progress counts as not done for %).

### E. Persistence + SoT

**Pick: Server is source of truth after login. iOS may cache for offline read; writes go to API then update cache. Anonymous local-only draft merge (F2.1 Case A/B) is deferred — F3 requires signed-in user.**

| Option | Verdict |
|---|---|
| **A. Server SoT; thin cache; signed-in only** | **Chosen.** |
| **B. Local-first with eventual sync** | Deferred with F4.2 / F4.6. |
| **C. No server tables; iOS UserDefaults only** | Rejected — contradicts F0.1 and export/purge contracts. |

### F. API surface (thin)

**Pick:**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/journey/paths` | List available paths (static) |
| `GET` | `/api/journey/case` | Current user’s Italy case (or 404 / empty) |
| `POST` | `/api/journey/case` | Select/create path → case (+ seed step rows) |
| `GET` | `/api/journey/checklist` | Catalog + statuses + progress for current case |
| `PATCH` | `/api/journey/steps/{stepId}` | Update status |

All `requireAccess`. Active account only (`deletion_status = active`); `pending_deletion` / `deleted` → same codes as other account routes (`ACCOUNT_PENDING_DELETION` / `ACCOUNT_DELETED`).

### G. Schema (minimal Class C)

**Pick: Two tables in `internal` (physical names):**

1. `internal.journey_cases`  
2. `internal.journey_step_states`  

No separate `journey` Postgres schema for V1 (stay consistent with identity tables living in `internal`). No milestones/devices tables in F3 (prototype reminders stay local-only).

### H. iOS scope

**Pick: Thin screens — PathSelectView + wire Journey tab to server checklist; adapt `JourneyView`/`JourneyViewModel` to ternary status + API client; keep chat/reminder hooks non-blocking (may stay local stubs).** Two PRs OK (backend then iOS) under Cap brief after approve.

---

## Schema sketch (migration — `nomade-dev` + local only)

```sql
-- conceptual; Theo lands a numbered supabase migration

create table internal.journey_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references internal.users (id),
  path_id text not null,              -- e.g. italy_digital_nomad
  country_code text not null default 'IT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, country_code)      -- one active Italy case per user V1
);

create table internal.journey_step_states (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references internal.journey_cases (id) on delete cascade,
  step_id text not null,              -- catalog id, e.g. passport
  status text not null check (status in ('not_started', 'in_progress', 'done')),
  updated_at timestamptz not null default now(),
  unique (case_id, step_id)
);

create index journey_cases_user_id_idx on internal.journey_cases (user_id);
create index journey_step_states_case_id_idx on internal.journey_step_states (case_id);
```

**RLS / access:** Prefer **service client in Next.js route handlers** after `requireAccess` (same pattern as account export/delete) — do **not** expose broad client-direct Supabase Data API on these tables in F3 (F0.1 rejected client-direct for all tables). Grants: service_role only for writes; no anon/authenticated table grants required if all access is server-mediated.

**Apply:** local + `nomade-dev` only. **`nomade-prod` forbidden.**

---

## Static catalog sketch (Cap default)

Path ids:

| pathId | Title | V1 |
|---|---|---|
| `italy_digital_nomad` | Italy Digital Nomad Visa | **Live** |
| `italy_remote_worker` | Italy Remote Worker Visa | Same stub steps **or** listed coming-soon (Open #2) |

Phases / steps (from `italy.yaml`, **omit** `dependent-permesso` in V1 stub):

1. **Gather Documents** — `passport`, `proof-of-income`, `health-insurance`, `accommodation`, `criminal-record`, `cover-letter`, `financial-statements`  
2. **Apply** — `consulate-appointment`, `submit-application`, `visa-fee`  
3. **After Arrival** — `permesso-soggiorno`, `codice-fiscale`, `anagrafe`  

Each step: `{ id, name, detail, phaseName }` with short static `detail` (may copy yaml `detail` / `default_detail` text — treat as **preliminary product copy**, not cited legal advice). Catalog version string e.g. `stub-italy-dnv-2026-10-01` returned on checklist GET for future migrations.

---

## Implementation sketch (Theo)

### Backend (`runAs-hunter/nomade`)

| Path | Purpose |
|---|---|
| `supabase/migrations/<ts>_journey_cases_steps.sql` | Tables + indexes (+ comments) |
| `src/lib/journey/catalog.ts` | Static paths + steps; version constant |
| `src/lib/journey/case.ts` | get/create case; seed step_states; path change reset |
| `src/lib/journey/checklist.ts` | Join catalog + statuses + progress |
| `src/lib/journey/steps.ts` | PATCH status validation |
| `src/app/api/journey/paths/route.ts` | GET |
| `src/app/api/journey/case/route.ts` | GET + POST |
| `src/app/api/journey/checklist/route.ts` | GET |
| `src/app/api/journey/steps/[stepId]/route.ts` | PATCH |
| `src/lib/journey/__tests__/*` | Unit tests |
| `src/lib/account/export.ts` | Fill `journey` array |
| `src/lib/account/purge.ts` | Real `wipeJourney` (delete cases → cascade steps) |
| Docs | This runbook; `docs/auth-api.md` rows; short `docs/journey.md` |

Reuse: `requireAccess`, `jsonError` / `ERROR_CODES`, `getRequestId`, `log`, service client. Never log full profile/step payloads (Class C — counts + ids + codes only).

### iOS (`runAs-hunter/nomade-ios`)

| Path | Purpose |
|---|---|
| `Journey/JourneyAPIClient.swift` (name flexible) | Authenticated GET/POST/PATCH |
| `Journey/PathSelectView.swift` | Thin path picker |
| `Journey/JourneyViewModel.swift` | Load case/checklist from API; ternary toggle/cycle |
| `Journey/JourneyView.swift` / `TaskRow.swift` | Render phases + status chips |
| Domain models | `JourneyPath`, `JourneyStepStatus`, wire Codable |
| Tests | Decode fixtures; ViewModel status transitions |
| Docs | `docs/runbooks/F3-ios-journey-checklist-runbook.md` pointer or shared section |

Signed-out users: existing SIWA gate (F2.4); do not invent anonymous server journey.

Suggested status UX: tap cycles `not_started → in_progress → done → not_started`, or segmented control — Cap default **tap cycle** for speed.

### Export envelope update

`journey` becomes an array of objects, e.g.:

```json
"journey": [
  {
    "caseId": "<uuid>",
    "pathId": "italy_digital_nomad",
    "countryCode": "IT",
    "createdAt": "<iso>",
    "updatedAt": "<iso>",
    "steps": [
      { "stepId": "passport", "status": "done", "updatedAt": "<iso>" }
    ]
  }
]
```

Update `EXPORT_NOTES` accordingly. Chat/billing stay `[]`.

### Purge wipe

```ts
// wipeJourney: DELETE FROM internal.journey_cases WHERE user_id = $userId
// (step_states cascade)
```

Return `{ wiped: <rowCount> }`. Keep wipeChat/wipeBilling stubs.

---

## API contracts

### `GET /api/journey/paths`

| | |
|---|---|
| **Auth** | `requireAccess` |
| **Success 200** | `{ paths: [{ pathId, title, description, available: boolean }], requestId }` |

### `GET /api/journey/case`

| | |
|---|---|
| **Auth** | `requireAccess` + active account |
| **Success 200** | `{ case: { caseId, pathId, countryCode, createdAt, updatedAt } \| null, requestId }` |

### `POST /api/journey/case`

| | |
|---|---|
| **Auth** | `requireAccess` + active |
| **Body** | `{ "pathId": "italy_digital_nomad" }` |
| **Success 200** | Case object (create or return existing same path); if path change allowed → new/updated case + reset steps |
| **Errors** | `400` unknown/unavailable path; `403` pending; `410` deleted; `401` unauthenticated |

### `GET /api/journey/checklist`

| | |
|---|---|
| **Auth** | `requireAccess` + active |
| **Success 200** | `{ caseId, pathId, catalogVersion, phases: [{ name, steps: [{ id, name, detail, status }] }], progress: { done, total, fraction }, disclaimer, requestId }` |
| **No case** | `404` `NO_JOURNEY_CASE` (or Cap-equivalent existing code style) — client shows path select |

### `PATCH /api/journey/steps/{stepId}`

| | |
|---|---|
| **Auth** | `requireAccess` + active |
| **Body** | `{ "status": "not_started" \| "in_progress" \| "done" }` |
| **Success 200** | `{ stepId, status, updatedAt, progress, requestId }` |
| **Errors** | `404` unknown step / no case; `400` bad status |

**Route classification (`docs/auth-api.md`):** all five → Protected / Bearer `requireAccess`. Chat / route / health stay public.

---

## Docs updates (same backend PR where practical)

1. Land this file as `docs/runbooks/F3-journey-checklist-runbook.md`.  
2. Extend `docs/auth-api.md` with journey route rows (replace “Future journey sync” placeholder).  
3. Add short `docs/journey.md` (path ids, status enum, catalogVersion, Class C note, disclaimer).  
4. Note in F2.6 / F2.6p docs or After sections: export `journey` filled; `wipeJourney` real — **F3** (not F4).  
5. Do **not** rewrite F0.1 / F0.2 ADR bodies unless Cap opens a contract change; cross-ref only.  
6. iOS: thin runbook or architecture one-liner that Journey tab is server-backed after F3.

---

## Tests (minimum)

**Backend**

- Catalog: expected path + stable step ids present; `dependent-permesso` absent in V1 stub.  
- Create case seeds all step rows `not_started`.  
- PATCH status transitions; rejects unknown stepId / bad status.  
- One case per user/country uniqueness.  
- `requireAccess` 401 without Bearer; pending/deleted refused.  
- Export includes journey steps; purge `wipeJourney` removes rows (integration or mocked DB).  
- No PII/secrets in fixtures.

**iOS**

- Codable decode of checklist fixture.  
- ViewModel: progress fraction; status cycle.  
- API client builds correct paths / Authorization header (no token logged).

CI: `lint` / `test` / `typecheck` / `build` (backend); iOS `build`/`test` as in F1.6.

---

## Explicit non-goals

| Out | Belongs to |
|---|---|
| Full docs RAG / citation-bound agent / knowledge publish pipeline | Later (planned official docs DB) |
| Visa Ops claim review workflow | Knowledge / Visa Ops |
| Billing, StoreKit, entitlements, paywall | **F3.1** |
| Multi-country beyond Italy | Post-Italy expansion |
| Apple revoke / Services ID / `.p8` changes | F2.6r already; do not reopen |
| Production schema apply / `nomade-prod` | **Forbidden** unless Cap+Isaias separate gate |
| Quiz personalize engine + conditional steps as server SoT | Open #6 / later |
| Milestone reminders server sync | Later (local OK) |
| Chat binding to steps / thread SoT | Later |
| F2.1 Case B Keep/Replace conflict UI | F4.6 |
| Document vault (Class F) | Deferred V1.x |
| Client-direct Supabase CRUD on journey tables | Rejected F0.1 |
| Changing soft-delete / cron / SIWA behavior | F2 closed |

---

## Roles

| Who | Does |
|---|---|
| **Cap** | Draft this runbook; lock Open decisions after Isaias approve; brief Theo; review PRs (authz, no prod, stub content disclaimer, export/wipe wired, ternary status) |
| **Theo** | Backend branch `task/F3-journey-checklist` then iOS `task/F3-ios-journey-checklist` (or Cap-approved order); migration on local/`nomade-dev` only; tests; open PRs |
| **Isaias** | **Approve gate** on Open decisions; merge gate; confirm `nomade-dev` migration apply; no prod |

Cap/Theo: no secrets in chat; Keeper only; one task ID; never `git add .`. **Do not brief Theo until Isaias approves.**

---

## Acceptance checklist

- [ ] Migration: `journey_cases` + `journey_step_states` on **local + nomade-dev only**; **nomade-prod untouched**  
- [ ] Static catalog for `italy_digital_nomad` with stub copy + `catalogVersion`  
- [ ] `GET /api/journey/paths`, `GET|POST /api/journey/case`, `GET /api/journey/checklist`, `PATCH /api/journey/steps/{stepId}` all `requireAccess`  
- [ ] Status enum `not_started` \| `in_progress` \| `done`; progress counts correct  
- [ ] Export `journey` array non-empty when case exists; purge deletes journey rows  
- [ ] iOS: path select + checklist UI showing server progress; signed-in only  
- [ ] Disclaimer that guidance is preliminary / not legal advice  
- [ ] Unit tests + CI green; one task ID; no `git add .`; no secrets in chat  
- [ ] Docs: this runbook + auth-api + journey.md  
- [ ] Non-goals respected (no RAG, billing, multi-country, Apple revoke, prod)

---

## Reply checklist (Isaias after approve / merge)

```text
F3 runbook approved: yes / yes-with-edits / no
Epic id: F3 journey (default) / keep calling it F4: ___
Remote-worker path: share stub catalog (default) / coming-soon only / omit from picker
Path change: confirm + reset steps (default) / block change / merge statuses
Step content: stub/static from italy.yaml (default) / wait Visa Ops
Omit hidden_unless_matched (default) / include dependent-permesso always / pull quiz first
Status UX iOS: tap cycle (default) / segmented control
Apply migration nomade-dev: yes / no
nomade-prod touched: no (required)
Backend PR: URL
iOS PR: URL
Path select → checklist → PATCH persist smoke: ok / fail
Export journey filled: ok / fail
Purge wipeJourney rows: ok / fail
```

---

## Risks / watchouts

| Risk | Mitigation |
|---|---|
| Users treat stub copy as official legal advice | In-app disclaimer; no “cited” chrome until docs DB; short detail only |
| Numbering confusion (F3 billing vs F3 journey) | Open #1 locked in this runbook; cross-ref F3.1 billing; avoid renaming old commits |
| Step id drift vs later knowledge claims | Keep italy.yaml-aligned ids; catalogVersion; don’t renumber casually |
| Prototype binary completions vs ternary | Map local `completed` → `done` only if Cap opens optional one-time import; default **ignore local** on first server case create (signed-in fresh) |
| Case B local vs server conflict | Out of scope; do not auto-merge |
| Accidental prod migration | Explicit forbid; Cap review checks migration apply notes |
| Export/purge forgetting new tables | Acceptance requires both wired in same backend PR |
| Scope creep into quiz/RAG/billing | Cap rejects unless Isaias expands Open decisions |
| Class C in logs | Log stepId + status codes only; never dump full checklist payloads |

---

## After F3

1. Optional quiz/profile personalization → conditional steps (former engine) as server fields.  
2. Official docs / claims DB → replace stub catalog; pin `catalogVersion` / claim ids on steps.  
3. F4.2 sync protocol + F4.6 Case B Keep/Replace UI.  
4. Wire `wipeJourney` already done — extend if milestones/devices tables land.  
5. F3.1 billing / entitlement gate on journey depth if product requires paywall.  
6. Multi-path divergent catalogs (remote worker tweaks) once content exists.  
7. Production migration — **separate human gate**.

---

## Open decisions (Isaias approve gate)

Cap’s **proposed defaults** are in **bold**. Approve means Theo may implement against those defaults; edit here before the engineering branch opens.

| # | Topic | Cap proposes | Alt |
|---|---|---|---|
| 1 | Epic numbering | **F3 = this journey/checklist slice; billing remains F3.1; richer sync/merge stays F4.x** | Call this F4.0; leave F3 unused |
| 2 | Remote-worker path | **Show in picker; same stub catalog as DNV (`available: true`)** | Coming-soon only; or omit until content differs |
| 3 | Path change | **Allow with confirm; reset all step statuses for new path** | Disallow change; or attempt status merge by stepId |
| 4 | Step content source | **Stub/static catalog in repo from italy.yaml ids** | Block on Visa Ops / docs DB |
| 5 | Hidden/conditional steps | **Omit `hidden_unless_matched` (e.g. dependent-permesso) in V1** | Always show; or require quiz first |
| 6 | Quiz / UserProfile | **Defer server profile; path+checklist only** | Pull E3 quiz into F3 |
| 7 | Local prototype completions | **Do not import; fresh server case all `not_started`** | One-time map completed ids → `done` |
| 8 | Tables location | **`internal.journey_cases` + `internal.journey_step_states`** | Dedicated `journey` schema |
| 9 | Access pattern | **Next.js + service client after `requireAccess` (no client-direct table grants)** | RLS + authenticated client writes |
| 10 | iOS status control | **Tap-to-cycle ternary** | Segmented control / menu |
| 11 | PR split | **Backend PR first (schema+API+export+wipe), then iOS PR** | Monolith single PR across repos (not possible); or iOS mock-first |
| 12 | Disclaimer copy | **Show quiet “Preliminary guidance — not legal advice” on checklist** | Stronger banner; or none |

---

## Cap approval

Approve means: Theo may open `task/F3-journey-checklist` (then iOS follow-up) against this runbook after Isaias checks the Open decisions table; **path select + ternary checklist + server persistence** on **local/`nomade-dev` only**; **stub/static** Italy DNV step content (not docs RAG); export + purge wipe wired; thin iOS screens; **no billing, no multi-country, no Apple revoke changes, no `nomade-prod`**.
