# Auth API (F2.5 / F2.6 / F2.6p)

Shared Bearer verification for protected App Router routes. Contract: [`adrs/F2.1-identity-session-contract-adr.md`](./adrs/F2.1-identity-session-contract-adr.md). Runbooks: [`runbooks/F2.5-jwt-middleware-polish-runbook.md`](./runbooks/F2.5-jwt-middleware-polish-runbook.md), [`runbooks/F2.6-account-deletion-export-runbook.md`](./runbooks/F2.6-account-deletion-export-runbook.md), [`runbooks/F2.6p-account-hard-purge-runbook.md`](./runbooks/F2.6p-account-hard-purge-runbook.md). Bootstrap details: [`identity-bootstrap.md`](./identity-bootstrap.md).

## Verify primitive

- **Helper:** `requireAccess(request, { requestId, logger? })` in `src/lib/auth/require-access.ts`
- **Underlying:** `verifyAccessToken` → Supabase `auth.getUser(jwt)` via **env-scoped** `createAnonClient` (current `NEXT_PUBLIC_SUPABASE_URL` + anon key only)
- **Not used:** jose / JWT-secret path; Next.js Edge `middleware.ts` as primary gate
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
| `POST /api/account/delete` | Protected | Bearer via `requireAccess` + `{ "confirm": "DELETE" }` |
| `GET\|POST /api/cron/purge-accounts` | Internal / cron (F2.6p) | `Authorization: Bearer ${CRON_SECRET}` only — **not** `requireAccess` |
| Future journey sync | Protected | Bearer + user-scoped authz (`assertSameUser`) |

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
  - `journey` / `chat` / `billing` are empty arrays until those domains ship.
- **`pending_deletion`:** still **200** (final copy allowed).
- **`deleted`:** `410 ACCOUNT_DELETED`.
- **No user row:** `401 UNAUTHENTICATED` “Bootstrap required”.

## `POST /api/account/delete` (F2.6)

- **Auth:** Bearer via `requireAccess`.
- **Body:** `{ "confirm": "DELETE" }` exactly (case-sensitive). Wrong/missing → `400 BAD_REQUEST`.
- **Success 200:** `{ userId, deletionStatus: "pending_deletion", deletedAt }` — soft delete only (sets `deleted_at`, closes open `auth_identities`).
- **Idempotent:** second call while already `pending_deletion` → same **200**.
- **`deleted`:** `410 ACCOUNT_DELETED`.
- **No user row:** `401 UNAUTHENTICATED` “Bootstrap required”.
- **Not in this route:** Auth `deleteUser`, purge cron, Apple `/auth/revoke` (see F2.6p / App Review follow-ups).
- **Subscriptions:** deleting the app account does **not** cancel App Store subscriptions (disclose in iOS UI when built). Hard wipe SLA: within **30 days** (F0.2); operational purge after **24h** grace via F2.6p cron.

## `GET|POST /api/cron/purge-accounts` (F2.6p)

- **Auth:** `Authorization: Bearer ${CRON_SECRET}` only (Vercel Cron / manual curl). **Not** `requireAccess` / user Bearer.
- **Body:** ignored (GET and POST both OK).
- **Success 200:** `{ ok, requestId, scanned, purged, skippedAlreadyDeleted, skippedLegalHold, authAlreadyGone, failed }` — **counts only** (no PII / email / `sub` / tokens).
- **Unauthorized:** `401 UNAUTHENTICATED`. Missing `CRON_SECRET` env → `500 ENV_INVALID`.
- **Partial failures:** still **200** with `failed > 0`; batch continues.
- **Eligibility:** `deletion_status = pending_deletion` AND `deleted_at <= now() - 24h`; batch ≤ 50 per run.
- **Per user:** legal-hold stub (always false) → scrub `email → null` → DELETE `auth_identities` → journey/chat/billing wipe stubs → `auth.admin.deleteUser` (Auth-missing = success) → `deletion_status = deleted` (keep row; leave `deleted_at`).
- Soft delete does **not** Auth-delete; only this cron does. Apple `/auth/revoke` still deferred. Chat / route / health stay public.
- Schedule: `vercel.json` cron `0 4 * * *` UTC → `/api/cron/purge-accounts`. Preview may not fire like Production — local/manual curl with Keeper secret is the smoke path.
- Full runbook: [`runbooks/F2.6p-account-hard-purge-runbook.md`](./runbooks/F2.6p-account-hard-purge-runbook.md).
