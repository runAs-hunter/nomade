# Auth API (F2.5)

Shared Bearer verification for protected App Router routes. Contract: [`adrs/F2.1-identity-session-contract-adr.md`](./adrs/F2.1-identity-session-contract-adr.md). Runbook: [`runbooks/F2.5-jwt-middleware-polish-runbook.md`](./runbooks/F2.5-jwt-middleware-polish-runbook.md). Bootstrap details: [`identity-bootstrap.md`](./identity-bootstrap.md).

## Verify primitive

- **Helper:** `requireAccess(request, { requestId, logger? })` in `src/lib/auth/require-access.ts`
- **Underlying:** `verifyAccessToken` → Supabase `auth.getUser(jwt)` via **env-scoped** `createAnonClient` (current `NEXT_PUBLIC_SUPABASE_URL` + anon key only)
- **Not used in F2.5:** jose / JWT-secret path; Next.js Edge `middleware.ts` as primary gate
- Failures → F1.8 `{ error: { code: "UNAUTHENTICATED", message, requestId } }` + `x-request-id`. **Never log JWTs / Authorization headers.**

## Route classification

| Route | Class | Auth |
|---|---|---|
| `GET /api/health` | Public | None |
| `POST /api/chat` | Public (anonymous OK) | None in F2.5 |
| `POST /api/route` | Public (anonymous OK) | None in F2.5 |
| `POST /api/account/bootstrap` | Protected | Bearer via `requireAccess` |
| `GET /api/account/me` | Protected | Bearer via `requireAccess` |
| Future `/api/account/*`, journey sync | Protected | Bearer + user-scoped authz (`assertSameUser`) |

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
