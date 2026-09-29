# Identity bootstrap (F2.3)

App-owned user bootstrap after Apple sign-in via Supabase Auth. Full runbook: [`runbooks/F2.3-bootstrap-identity-runbook.md`](./runbooks/F2.3-bootstrap-identity-runbook.md). Contract: [`adrs/F2.1-identity-session-contract-adr.md`](./adrs/F2.1-identity-session-contract-adr.md).

## Tables (`internal`)

| Table | Purpose |
|---|---|
| `internal.users` | `id` = `auth.users.id` (FK). Email nullable; **never** UNIQUE/PK. `deletion_status`: `active` \| `pending_deletion` \| `deleted`. |
| `internal.auth_identities` | Apple `(provider, provider_subject)` unique while `closed_at IS NULL`. |

**Clients never talk PostgREST to these tables.** iOS / browser use `POST /api/account/bootstrap` with a Bearer access JWT. **No `service_role` on device.**

`[api].schemas` lists `internal` so the Next.js **server** `createServiceClient().schema('internal')` can reach them. `anon` / `authenticated` still have **REVOKE ALL** + RLS with **zero** client policies (deny-by-default). Hosted `nomade-dev` must include `internal` in Dashboard → API → Exposed schemas after apply (Part B).

## API

`POST /api/account/bootstrap`

- Auth: `Authorization: Bearer <supabase access JWT>` for the **current env** only.
- Body (optional): `{ "hasLocalDraft": false }`
- Success 200: `{ userId, created, merge: { case, hasLocalDraft, hasServerJourney } }`
- Errors: F1.8 envelope — `UNAUTHENTICATED`, `ACCOUNT_PENDING_DELETION`, `ACCOUNT_DELETED`, `MERGE_REQUIRED` (Case B; stubbed until F4 journey), `BAD_REQUEST`, `INTERNAL_ERROR`

Until journey tables exist, `hasServerJourney` is always `false` (TODO F4). Case B / `MERGE_REQUIRED` cannot fire yet.

## Shared auth (F2.5)

Protected account routes use `requireAccess` (`src/lib/auth/require-access.ts`) wrapping env-scoped `verifyAccessToken`. See [`auth-api.md`](./auth-api.md) for the route classification table and how to protect a new route.

`GET /api/account/me` — Bearer required; returns `{ userId, deletionStatus, emailPresent }` (no full email). Missing `internal.users` row → `401 UNAUTHENTICATED` “Bootstrap required”.

## Deletion status (F2.6)

Status machine (soft delete now; hard purge later):

```text
active
  └─ POST /api/account/delete (confirm) ──► pending_deletion  (set deleted_at; close auth_identities)
        └─ (later purge job F2.6p) ──► deleted
```

- **Bootstrap** rejects `pending_deletion` (`403 ACCOUNT_PENDING_DELETION`) and `deleted` (`410 ACCOUNT_DELETED`).
- **Export** (`POST /api/account/export`) remains allowed while `pending_deletion`; rejected when `deleted`.
- **Delete** is idempotent while `pending_deletion`. No cancel/restore in V1.
- Soft delete does **not** call Auth `deleteUser` or Apple revoke — those belong to F2.6p / App Review prep.
- Full contracts: [`auth-api.md`](./auth-api.md) + [`runbooks/F2.6-account-deletion-export-runbook.md`](./runbooks/F2.6-account-deletion-export-runbook.md).

## Related

- Auth API / route classification: [`auth-api.md`](./auth-api.md)
- F2.5 runbook: [`runbooks/F2.5-jwt-middleware-polish-runbook.md`](./runbooks/F2.5-jwt-middleware-polish-runbook.md)
- F2.6 runbook: [`runbooks/F2.6-account-deletion-export-runbook.md`](./runbooks/F2.6-account-deletion-export-runbook.md)
- Roles/RLS foundation: [`supabase-roles-rls.md`](./supabase-roles-rls.md)
- Local layout: [`supabase-local.md`](./supabase-local.md)
