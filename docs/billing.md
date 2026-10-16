# Billing / entitlement (F3.1)

Server-derived StoreKit 2 entitlement gate on journey depth. Runbook: F10 billing (see "F10 changes" below); F3.1 runbook superseded. Auth routes: [`auth-api.md`](./auth-api.md). Journey: [`journey.md`](./journey.md).

## Scope

- **In:** freemium phase gate (free Gather Documents; paid Apply + After Arrival); `journey_full` entitlement; StoreKit 2 one-time non-consumable verify via `POST /api/billing/app-store/transactions`; `GET /api/billing/entitlement`; checklist `access` + entitlement flag; export `billing`; real `wipeBilling`; migration on **local + nomade-dev only**.
- **Out:** iOS paywall (separate PR); Stripe primary; RevenueCat required; AI quotas; full ASSN reconcile; **ASSN V2 webhook** → **F3.1b**; `nomade-prod` apply; inventing ASC product ids; client-only paid flag; gating auth / export / delete / purge / path select / case create.

## Product / env

| Item | Value |
|---|---|
| Entitlement id | `journey_full` (internal — not an ASC id) |
| Commerce | StoreKit 2 one-time non-consumable |
| Product id | **`APP_STORE_JOURNEY_PRODUCT_ID`** from Keeper / ASC sandbox — **never invent or hardcode** |
| Bundle id | `APP_STORE_BUNDLE_ID` (default `com.izaya.Nomade`) |
| SoT | Server after verified App Store JWS — iOS may cache read-only |

## Schema (Class E)

- `internal.billing_events` — append-only; unique `(source, transaction_id)`; `raw_ref` = opaque hash (not full JWS)
- `internal.entitlements` — derived PK `(user_id, entitlement_id)`

RLS enabled; **no** anon/authenticated policies. Service client after `requireAccess` only.

**Apply:** local + `nomade-dev` (`bgdrzdlenmwbpalnjiqg`) only. **Never** `nomade-prod` (`whjzynfsifrtrxlylrww`).

## APIs

All Bearer `requireAccess` + **active** account (same gates as journey):

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/billing/entitlement` | `{ entitlements: [{ id, status, grantedAt, updatedAt, sourceTransactionId }], requestId }` |
| `POST` | `/api/billing/app-store/transactions` | Body `{ signedTransaction, eventType? }`; verifies JWS; upserts event + entitlement |

### Journey enforcement

- Checklist GET: each phase/step `access: "free" \| "paid"`; top-level `entitlement: { journeyFull: boolean }`.
- PATCH locked (Apply / After Arrival) step without active `journey_full` → `403 ENTITLEMENT_REQUIRED`.
- Gather Documents PATCH stays free. Path select + case create stay free.

## Export / purge

- Export `billing`: `{ entitlements, events }` with ids only — **no JWS**.
- `wipeBilling(service, userId)`: delete entitlements; retain append-only events with `raw_ref` stripped (Class E).

## ASSN

Thin ASSN V2 webhook / full reconcile are **out of this PR** → track as **F3.1b**. Client `POST` transaction verify is the F3.1 SoT path.

## Logging

Class E: log entitlement id, transaction id, allow/deny codes — never full JWS / signed payloads.

## F10 changes (supersedes the F3.1 slice above where they differ)

Runbook: F10 "Unpark billing" (2026-10-13). Restarted on `task/F10-billing`; #20's billing core ported.

- **Gate by phase id**, not display name: `billing/catalog.ts` `PHASE_ACCESS` keys on `journey/catalog.ts` `JourneyPhaseId` (`gather` free; `apply`, `after` paid). Test iterates every path. (#20 keyed on `"Gather Documents"`, which made every phase paid after the F5 rename.)
- **Sync gated too:** `POST /api/journey/sync` ops on paid steps without `journey_full` are rejected (`ENTITLEMENT_REQUIRED`).
- **Locked preview:** paid steps without entitlement return title + `sources`, `detail: ""`.
- **Environment policy:** `Production` always accepted; `Sandbox` / `Xcode` only when `APP_STORE_ALLOW_SANDBOX=true` (set on Preview + Production for App Review). Anything else → 400. `billing_events.environment` records it (migration `20261013192059_f10_billing_environment`). Revenue reporting filters `Production`.
- **Refunds (cheap):** a verified JWS with `revocationDate` sets the entitlement `inactive`. ASSN V2 is **F10b**.
- **Same Apple ID across Nomade accounts:** allowed; the second account is granted and a `billing transaction shared across accounts` warn is logged (ids only). The event row stays with the first account (unique `(source, transaction_id)`).
- `raw_ref` = SHA-256 of the JWS; the JWS is never stored or logged. Price ($79) lives in ASC, not code. US-only storefront is an ASC setting.
- Migrations: `20261002130408_billing_entitlements` is #20's SQL under the version already recorded on nomade-dev (not re-applied).


## F10 review fixes (Cap, 2026-10-15)

- **JWS verification** (`verify-jws.ts`), mirroring Apple's SignedDataVerifier: header `alg` must be `ES256`; `x5c` must be `[leaf, intermediate, root]`; the root must be byte-identical (SHA-256 fingerprint) to the embedded Apple Root CA - G3 (itself pinned to `63:34:3A:…:91:79`) and verify with its key — **no subject-name shortcut**; leaf ← intermediate ← root signatures; Apple OIDs `1.2.840.113635.100.6.11.1` (leaf) and `1.2.840.113635.100.6.2.1` (intermediate); leaf not a CA, intermediate + root CAs; every cert inside its validity window; `purchaseDate` required. Real-crypto tests (`verify-jws.crypto.test.ts`) generate throwaway certs with openssl at test time (no keys in git): fake root with the Apple subject, broken chain, expired, wrong alg, missing OID, CA leaf, tampered payload.
- **Sticky revocation:** `billing_events.revoked_at` (migration `20261013192059`). A revoked JWS sets it once; it is never cleared. Any later post of that transaction (including a saved pre-refund JWS) stays `inactive`. On revoke, **every** entitlement with that `source_transaction_id` is deactivated (shared Apple ID). A first-seen revoked JWS is stored as `event_type = refund` and never grants.
- **eventType:** clients send `purchase | restore` only; `refund` is derived server-side.
- `granted_at` is set on first grant only; replays/restores bump `updated_at`.
- `POST /api/journey/sync`: when the gate is on and a paid step is touched, a failed entitlement read fails the whole sync (500), not per op.
- Checklist: phases expose `id` (`gather | apply | after`). An entitlement read failure logs a warn and returns `entitlement: { journeyFull: false, unavailable: true }` (never 500), so Gather still loads.
- Purge logs a failed `raw_ref` strip / entitlement delete.

### Paywall flag `BILLING_GATE_ENABLED` (default OFF)

`entitlement.gateEnabled` in the checklist payload mirrors the flag; iOS locks only when it is `true` (missing → false).

| Flag | PATCH / sync on Apply + After arrival | Locked `detail` | `access` + `entitlement` in payload |
|---|---|---|---|
| unset / `false` | allowed | full detail | yes |
| `true` | `403 ENTITLEMENT_REQUIRED` / op rejected unless `journey_full` | `""` unless `journey_full` | yes |

### Monitoring: shared transactions (same Apple ID on several Nomade accounts)

Read-only, nomade-dev:

```sql
select e.source_transaction_id,
       count(*)                                   as accounts,
       array_agg(e.user_id order by e.granted_at) as user_ids,
       bool_or(e.status = 'active')               as any_active,
       max(b.environment)                         as environment,
       max(b.revoked_at)                          as revoked_at
from internal.entitlements e
left join internal.billing_events b
  on b.source = 'app_store' and b.transaction_id = e.source_transaction_id
where e.entitlement_id = 'journey_full'
group by e.source_transaction_id
having count(*) > 1
order by accounts desc;
```

Also grep logs for `billing transaction shared across accounts`.
