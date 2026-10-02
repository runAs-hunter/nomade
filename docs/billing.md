# Billing / entitlement (F3.1)

Server-derived StoreKit 2 entitlement gate on journey depth. Runbook: [`runbooks/F3.1-billing-entitlement-runbook.md`](./runbooks/F3.1-billing-entitlement-runbook.md). Auth routes: [`auth-api.md`](./auth-api.md). Journey: [`journey.md`](./journey.md).

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
