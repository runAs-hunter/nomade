# Auth API (F2.5 / F2.6 / F2.6p / F2.6r / F3 / F3.1)

Shared Bearer verification for protected App Router routes. Contract: [`adrs/F2.1-identity-session-contract-adr.md`](./adrs/F2.1-identity-session-contract-adr.md). Runbooks: [`runbooks/F2.5-jwt-middleware-polish-runbook.md`](./runbooks/F2.5-jwt-middleware-polish-runbook.md), [`runbooks/F2.6-account-deletion-export-runbook.md`](./runbooks/F2.6-account-deletion-export-runbook.md), [`runbooks/F2.6p-account-hard-purge-runbook.md`](./runbooks/F2.6p-account-hard-purge-runbook.md), [`runbooks/F2.6r-apple-token-revoke-runbook.md`](./runbooks/F2.6r-apple-token-revoke-runbook.md), [`runbooks/F3-journey-checklist-runbook.md`](./runbooks/F3-journey-checklist-runbook.md), [`runbooks/F3.1-billing-entitlement-runbook.md`](./runbooks/F3.1-billing-entitlement-runbook.md). Journey overview: [`journey.md`](./journey.md). Billing: [`billing.md`](./billing.md). Bootstrap details: [`identity-bootstrap.md`](./identity-bootstrap.md).

## Verify primitive

- **Helper:** `requireAccess(request, { requestId, logger? })` in `src/lib/auth/require-access.ts`
- **Underlying:** `verifyAccessToken` → Supabase `auth.getUser(jwt)` via **env-scoped** `createAnonClient` (current `NEXT_PUBLIC_SUPABASE_URL` + anon key only)
- **Not used:** jose / JWT-secret path for access-token verification; Next.js Edge `middleware.ts` as primary gate. (F2.6r uses `jose` only to sign the Apple `client_secret` — not as the session gate.)
- Failures → F1.8 `{ error: { code: "UNAUTHENTICATED", message, requestId } }` + `x-request-id`. **Never log JWTs / Authorization headers.**

## Route classification

| Route | Class | Auth |
|---|---|---|
| `GET /api/health` | Public | None |
| `POST /api/chat` | Public (anonymous OK) | None |
| `POST /api/route` | Public (anonymous OK) | None |
| `POST /api/account/bootstrap` | Protected | Bearer via `requireAccess` |
| `GET /api/account/me` | Protected | Bearer via `requireAccess` |
| `POST /api/account/export` | Protected | Bearer via `requireAccess` |
| `POST /api/account/delete` | Protected | Bearer via `requireAccess` + `{ "confirm": "DELETE" }` (+ optional `appleAuthorizationCode`) |
| `GET\|POST /api/cron/purge-accounts` | Internal / cron (F2.6p) | `Authorization: Bearer ${CRON_SECRET}` only — **not** `requireAccess` |
| `GET /api/journey/paths` | Protected (F3) | Bearer via `requireAccess` + active account |
| `GET\|POST /api/journey/case` | Protected (F3) | Bearer via `requireAccess` + active account |
| `GET /api/journey/checklist` | Protected (F3) | Bearer via `requireAccess` + active account |
| `PATCH /api/journey/steps/{stepId}` | Protected (F3) | Bearer via `requireAccess` + active account |
| `GET /api/billing/entitlement` | Protected (F3.1) | Bearer via `requireAccess` + active account |
| `POST /api/billing/app-store/transactions` | Protected (F3.1) | Bearer via `requireAccess` + active account |

## Protect a new route

```ts
import { requireAccess } from "@/lib/auth/require-access";
import { getRequestId } from "@/lib/request-id";
import { log } from "@/lib/log";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });
  const auth = await requireAccess(request, { requestId, logger });
  if (auth instanceof NextResponse) return auth;
  // auth.userId is the Auth / internal.users id
}
```

Optional IDOR check: `assertSameUser(auth.userId, resourceUserId, requestId)` → `403 FORBIDDEN` or `null`.

## `GET /api/account/me`

- **Auth:** Bearer required (same env as bootstrap).
- **Success 200:** `{ userId, deletionStatus, emailPresent }` — **no full email**.
- **No `internal.users` row:** `401 UNAUTHENTICATED` with message `Bootstrap required` (call bootstrap first).

## `POST /api/account/export` (F2.6)

- **Auth:** Bearer via `requireAccess`.
- **Body:** empty / ignored.
- **Success 200:** sync JSON envelope — `{ exportedAt, userId, deletionStatus, account, identities, journey, chat, billing, notes }`.
  - `account.email` included only when present on `internal.users`; `identities[].providerSubject` included in the file (**never log** it).
  - `journey` filled when a case exists (F3); `billing` filled with entitlements + transaction ids only (F3.1, no JWS); `chat` empty until that domain ships.
- **`pending_deletion`:** still **200** (final copy allowed).
- **`deleted`:** `410 ACCOUNT_DELETED`.
- **No user row:** `401 UNAUTHENTICATED` “Bootstrap required”.

## `POST /api/account/delete` (F2.6)

- **Auth:** Bearer via `requireAccess`.
- **Body:** `{ "confirm": "DELETE", "appleAuthorizationCode"?: string }` — `confirm` exactly `DELETE` (case-sensitive). Wrong/missing confirm → `400 BAD_REQUEST`. `appleAuthorizationCode` is optional; non-string → `400 BAD_REQUEST`.
- **Success 200:** `{ userId, deletionStatus: "pending_deletion", deletedAt, appleRevoked }` — soft delete only (sets `deleted_at`, closes open `auth_identities`). `appleRevoked` is `true` only when this call revoked at Apple.
- **Apple revoke (F2.6r):** when `appleAuthorizationCode` is a non-empty string, the server builds an ES256 `client_secret` (`sub` / `client_id` = App ID `com.izaya.Nomade`, **not** a Services ID), exchanges the code at `POST https://appleid.apple.com/auth/token` (no `redirect_uri`), then revokes the refresh token at `/auth/revoke` — **before** `pending_deletion`. Failure → `502 APPLE_REVOKE_FAILED` (account stays `active`). Missing Apple env → `503 APPLE_REVOKE_MISCONFIGURED`. No code → soft-delete still succeeds with `appleRevoked: false`.
- **Idempotent:** second call while already `pending_deletion` → same **200**, `appleRevoked: false` (revoke skipped).
- **`deleted`:** `410 ACCOUNT_DELETED`.
- **No user row:** `401 UNAUTHENTICATED` “Bootstrap required”.
- **Not in this route:** Auth `deleteUser`, purge cron. Apple revoke is **not** in F2.6p (codes expire; purge stays Auth `deleteUser` + scrub).
- **Subscriptions:** deleting the app account does **not** cancel App Store subscriptions (disclose in iOS UI when built). Hard wipe SLA: within **30 days** (F0.2); operational purge after **24h** grace via F2.6p cron.

## `GET|POST /api/cron/purge-accounts` (F2.6p)

- **Auth:** `Authorization: Bearer ${CRON_SECRET}` only (Vercel Cron / manual curl). **Not** `requireAccess` / user Bearer.
- **Body:** ignored (GET and POST both OK).
- **Success 200:** `{ ok, requestId, scanned, purged, skippedAlreadyDeleted, skippedLegalHold, authAlreadyGone, failed }` — **counts only** (no PII / email / `sub` / tokens).
- **Unauthorized:** `401 UNAUTHENTICATED`. Missing `CRON_SECRET` env → `500 ENV_INVALID`.
- **Partial failures:** still **200** with `failed > 0`; batch continues.
- **Eligibility:** `deletion_status = pending_deletion` AND `deleted_at <= now() - 24h`; batch ≤ 50 per run.
- **Per user:** legal-hold stub (always false) → scrub `email → null` → DELETE `auth_identities` → **F3** `wipeJourney` + **F3.1** `wipeBilling` (delete entitlements; strip event `raw_ref`) + chat wipe stub → `auth.admin.deleteUser` (Auth-missing = success) → `deletion_status = deleted` (keep row; leave `deleted_at`).
- Soft delete does **not** Auth-delete; only this cron does. Apple `/auth/revoke` is **not** called here (F2.6r revokes on soft-delete only). Chat / route / health stay public.
- Schedule: `vercel.json` cron `0 4 * * *` UTC → `/api/cron/purge-accounts`. Preview may not fire like Production — local/manual curl with Keeper secret is the smoke path.
- Full runbook: [`runbooks/F2.6p-account-hard-purge-runbook.md`](./runbooks/F2.6p-account-hard-purge-runbook.md).


## Journey routes (F3)

All require Bearer `requireAccess` and **active** `internal.users` (`pending_deletion` → `403 ACCOUNT_PENDING_DELETION`; `deleted` → `410 ACCOUNT_DELETED`; no row → `401` Bootstrap required). Service client only — no client-direct grants.

### `GET /api/journey/paths`

- **200:** `{ paths: [{ pathId, title, description, available }], requestId }`

### `GET /api/journey/case`

- **200:** `{ case: { caseId, pathId, countryCode, createdAt, updatedAt } | null, requestId }`

### `POST /api/journey/case`

- **Body:** `{ "pathId": "italy_digital_nomad" }`
- **200:** `{ case, created, pathChanged, requestId }` — same path returns existing; path change resets steps
- **400:** unknown / unavailable path

### `GET /api/journey/checklist`

- **200:** `{ caseId, pathId, catalogVersion, phases, progress, disclaimer, entitlement: { journeyFull }, requestId }`
  - Each phase/step includes `access: "free" | "paid"` (F3.1). Free = Gather Documents; paid = Apply + After Arrival.
- **404 `NO_JOURNEY_CASE`:** no case yet (client shows path select)

### `PATCH /api/journey/steps/{stepId}`

- **Body:** `{ "status": "not_started" | "in_progress" | "done" }`
- **200:** `{ stepId, status, updatedAt, progress, requestId }`
- **400:** bad status; **404:** unknown step / no case
- **403 `ENTITLEMENT_REQUIRED`:** paid-phase step without active `journey_full` (F3.1). Gather Documents stays writable without entitlement.

## Billing routes (F3.1)

Same Bearer + **active** account gates as journey. Service client only. Auth / export / delete / purge are **not** gated on entitlement.

### `GET /api/billing/entitlement`

- **200:** `{ entitlements: [{ id, status, grantedAt, updatedAt, sourceTransactionId }], requestId }`

### `POST /api/billing/app-store/transactions`

- **Body:** `{ "signedTransaction": "<StoreKit 2 JWS>", "eventType"?: "purchase" | "restore" }`
- **200:** `{ entitlement, eventInserted, requestId }` — server verifies JWS; upserts `billing_events` + `entitlements`
- **400:** bad/unverified JWS, product/bundle mismatch
- **503 `ENV_INVALID`:** `APP_STORE_JOURNEY_PRODUCT_ID` not set (Keeper / ASC)
- **Never** trust a client-only paid flag. Product id from env only — never invent ASC ids in code.
- ASSN V2 webhook deferred to **F3.1b**.
