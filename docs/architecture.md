# Architecture — Nomade backend

## Repositories

```text
runAs-hunter/nomade       Next.js API/web, Supabase migrations, KB pipeline, citation-bound AI
runAs-hunter/nomade-ios   SwiftUI client, StoreKit 2 client, SwiftData offline cache
```

**API ownership:** this repository defines and versions server contracts. iOS adapts to frozen contracts; do not invent parallel backend semantics in the iOS repo.

## High-level flow

```text
Official source → fetch observation → immutable raw snapshot
              → extracted document version → candidate claim
              → human review → approved claim version
              → deterministic applicability / jurisdiction retrieval
              → citation validator → checklist or AI-rendered answer
```

Customer journey data (profile, tasks, entitlements) is separate from the public-source knowledge domain (schemas/roles per F0.1 / F0.2).

## Platform baseline (F0.1)

| Layer | Choice |
|---|---|
| Postgres / Auth / private snapshots | Supabase |
| Deploy | Vercel |
| Assistant provider | Anthropic via backend only |
| iOS billing | StoreKit 2 + App Store Server API (server reconciliation in this repo) |
| iOS cache | SwiftData in `nomade-ios` — not canonical post-login state |

## Logical schemas

```text
identity     users, auth identities, deletion state
billing      entitlements, App Store transaction events
journey      cases, profiles, tasks, milestones, devices
knowledge    sources, snapshots, claims, evidence, review issues
operations   consents, usage ledger, audit/security events
api          minimal retrieval views/functions (explicit grants only)
```

## Non-goals in this repo’s early phases

- Shipping free-form unsourced visa advice
- Client-direct access to internal knowledge tables
- Multi-country production KB before Italy DNV V1 is citation-safe
- Private customer document vault (deferred phase)

## Related ADRs

See `docs/adrs/` for F0.1 (platform), F0.2 (data classification), F0.3 (environments).
