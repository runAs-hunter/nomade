# AGENTS.md — Nomade backend (`runAs-hunter/nomade`)

Instructions for coding agents and humans working in this repository.

## Product

Nomade is a paid, account-based journey product that helps non-EU applicants lawfully residing in the United States prepare an Italian digital-nomad / remote-worker (national type D) visa application for stays over 90 days.

**Customer promise:** every material requirement shown to a customer is traceable to an applicable, human-approved official source. Changed, stale, conflicting, expired, or missing guidance is disclosed or withheld — never guessed.

This repo owns the **Next.js backend/web**, knowledge-base implementation, and server APIs. The iOS client lives in `runAs-hunter/nomade-ios`.

## Source of truth

| Document | Role |
|---|---|
| Team plan / progress tracker (`Nomade Platform, Payments, and Knowledge Base`) | Task IDs, gates, verified environment status |
| `docs/architecture.md` | Boundaries and ownership in this repo |
| `docs/adrs/F0.1-platform-adr.md` | Approved platform vendors and env rules |
| `docs/adrs/F0.2-data-classification-retention-adr.md` | Data classes, retention, AI-sharing |
| `docs/adrs/F0.3-environment-matrix.md` | Local/dev/staging/prod matrix and promotion |
| Revised Italian DNV KB scope | Normative knowledge-base content contract |

If chat history conflicts with these files, **the files win**.

## API and system ownership (this repo)

| Area | Owner repo | Notes |
|---|---|---|
| HTTP/JSON APIs, auth verification, entitlements enforcement | **This repo** | iOS consumes contracts; freeze before parallel iOS work |
| Supabase migrations, RLS, `api` schema grants | **This repo** | One migration owner at a time |
| Knowledge ingestion, retrieval, citation-bound assistant | **This repo** | No free-form “visa expert” system prompts in production paths |
| Vercel deploy config for backend/web | **This repo** | Production deploy is human-gated |
| SwiftUI UI, StoreKit client, SwiftData cache | `nomade-ios` | Canonical state is server-side after login |

## Hard rules

1. **One task ID per branch/PR.** Branch: `task/<task-id>-short-description`. Do not combine unrelated task IDs.
2. **Confirm dependencies** from the team plan before editing. If blocked, stop and report the exact blocker.
3. **Preserve unrelated local changes.** Stage only task-owned files. Never `git add .`, never destructive git reset/clean unless the owner explicitly orders it for that path.
4. **No production mutations** (prod DB, prod secrets, App Store, pricing) without a named human gate.
5. **Do not copy** static `italy.yaml` / founder-knowledge notes into approved claim records. Prototype content is an inventory to validate, not seed truth.
6. **Secrets** never go in git. Service-role keys never go to clients.
7. **Internal KB tables** stay outside the auto-exposed Data API. Bundle explicit grants/RLS with any exposed object.
8. **Migrations:** only one active task may add/reorder production migrations. Use the installed Supabase CLI to generate migration files. Prove `supabase db reset` locally when the task requires it. After merge, migrations are immutable — rollback = compensating migration (see [`docs/migration-rollback.md`](docs/migration-rollback.md)).
9. Prefer **mocked model providers in CI**. Real Anthropic calls are backend-only and entitlement-aware once built.
10. **Structured logs** (F1.8): one JSON object per line; never log secrets, JWTs, chat/profile payloads. Error responses use `{ error: { code, message, requestId } }` + `x-request-id`. See [`docs/observability.md`](docs/observability.md).
11. **Backup / restore (F1.9):** logical dump of `nomade-dev` → clean **local** only. Never dump/restore prod; never commit dumps; no prod restore without R1.6 + human gate. See [`docs/backup-restore.md`](docs/backup-restore.md).

## Standard task prompt

```text
Implement task <TASK_ID> from the Nomade team plan / task list.

Work on this task only. Read AGENTS.md and docs/architecture.md first.
Confirm dependencies are complete before editing. Preserve unrelated user changes.
Create a focused branch and PR, run every acceptance check listed for the task,
and report the exact commands and results. Do not begin dependent or adjacent
tasks. Do not mutate production systems, production data, billing products,
pricing, or App Store state unless the task explicitly contains an approved
human production gate. If a dependency or required credential is missing, stop
after completing all safe local work and report the exact blocker.
```

## Environment pointers

- Dev Supabase: `nomade-dev` (`bgdrzdlenmwbpalnjiqg`, `us-west-2`) — wake/inspect before remote migration push.
- Prod Supabase: `nomade-prod` (`whjzynfsifrtrxlylrww`) — human-gated; do not wire secrets from agent tasks.
- Staging Supabase: deferred (F1.1b); do not assume a staging project yet.
- Vercel project: `nomade-app` (Hobby: Production + Preview only; custom Staging deferred). Production deploy human-gated.
- Preview health (F1.7): PRs deploy Preview → `nomade-dev` only; smoke `GET /api/health`. See `docs/vercel-preview.md`. Record Preview URL in F0.3 / Keeper notes after first successful smoke (no secrets in git/chat).
- Backend env contract: `.env.example` + `docs/backend-env.md` (F1.4).
- Backend CI: `docs/ci.md` (F1.5) — maps Actions check names to local commands; enable F0.5 §3.2 required checks after first green run.
- Local requires current Supabase CLI + Docker Desktop or OrbStack.
- Backup/restore + migration rollback (F1.9): [`docs/backup-restore.md`](docs/backup-restore.md), [`docs/migration-rollback.md`](docs/migration-rollback.md). Drill target is `nomade-dev` → local; prod restore is R1.6 / human-gated.

## Status vocabulary

Use: `Not started` | `In progress` | `Blocked` | `Ready for review` | `Done` | `Verified` — meanings as in the team plan. A checked task box means `Done`, not “started once.”
