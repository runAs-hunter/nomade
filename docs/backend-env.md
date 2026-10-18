# Backend environment (F1.4)

Typed validation lives in `src/lib/env.ts`. Supabase server clients: `src/lib/supabase/server.ts` (`createServiceClient`, `createAnonClient`). Health: `GET /api/health`.

## Variables

| Variable | Secret? | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | No | Yes | Local `http://127.0.0.1:54321` or `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable | Yes | Anon/publishable only — **never** service role |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Yes | Server / Vercel **server** env only. Never `NEXT_PUBLIC_*`, never iOS |
| `SUPABASE_PROJECT_REF` | No | Optional | e.g. `bgdrzdlenmwbpalnjiqg` for diagnostics |
| `ANTHROPIC_API_KEY` | Yes | Optional at boot | Required only when chat/model routes run; health must work without it |
| `CRON_SECRET` | **Yes** | Optional at boot; **required** inside cron routes | F2.6p `GET\|POST /api/cron/purge-accounts`. Value from Keeper; never commit. Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` |
| `SOURCES_ADMIN_USER_IDS` | No (user UUIDs) | Optional | F8 `/api/sources` writes. Comma-separated Supabase Auth user UUIDs of Cap-approved admins. Unset → only the service-role Bearer can write. `CRON_SECRET` also gates `GET\|POST /api/cron/check-sources` (F8, manual trigger) |
| `APPLE_TEAM_ID` | No (still Keeper) | Optional at boot; **required** inside Apple revoke | F2.6r. Expect Team ID from Membership (Xcode default `LXT8T4YQR6` — confirm). Preview / local only |
| `APPLE_KEY_ID` | No (still Keeper) | Optional at boot; **required** inside Apple revoke | 10-char Sign in with Apple Key ID. Preview / local only |
| `APPLE_PRIVATE_KEY` | **Yes** | Optional at boot; **required** inside Apple revoke | `.p8` PEM from Keeper. Never git/chat/logs. Preview / `nomade-dev` only — **not** `nomade-prod` |
| `APPLE_CLIENT_ID` | No | Optional at boot; **required** inside Apple revoke | App ID `com.izaya.Nomade`. **Not** a Services ID (`APPLE_SERVICES_ID` does not exist) |

Copy `.env.example` → `.env.local`. Keeper remains source of truth for secret values.

## Local (Supabase CLI)

```bash
supabase start
supabase status   # copy API URL, anon key, service_role key into .env.local
npm run dev
curl -sS http://localhost:3000/api/health
```

Expected health shape (no secrets): `{ "ok": true, "supabase": "up", "projectRef?: "..." }`.

## Vercel (`nomade-app`)

Hobby project: **Production** + **Preview** only (no custom Staging env — deferred).

| Scope | Supabase target |
|---|---|
| Preview | `nomade-dev` (`bgdrzdlenmwbpalnjiqg`) — non-prod service role only |
| Production | `nomade-prod` (`whjzynfsifrtrxlylrww`) — **human gate**; do not set in F1.4 |

Set the three required Supabase vars as server env (service role is **not** available to the browser). Do not put prod service role on Preview. Preview setup + health smoke: [`vercel-preview.md`](./vercel-preview.md).

## F1.7 verification (Preview)

After Preview env vars are set (human, Keeper → `nomade-dev` only):

1. Open the PR Preview URL (Vercel comment / Deployments).
2. `curl -sS "https://<preview-host>/api/health"` — expect JSON with `ok` / `supabase` only (no keys).
3. Details, failure table, and out-of-scope notes: [`vercel-preview.md`](./vercel-preview.md).

Local steps above stay the day-to-day loop; Preview is the PR smoke path.

## Client reminder

iOS and browser clients receive **anon/publishable** only. Service role stays on Next.js server / trusted jobs.

## Related

- Observability (F1.8): [`observability.md`](./observability.md)
- Local DB layout: [`supabase-local.md`](./supabase-local.md)
- Roles / RLS: [`supabase-roles-rls.md`](./supabase-roles-rls.md)
- Vercel Preview (F1.7): [`vercel-preview.md`](./vercel-preview.md)


## App Store billing (F3.1)

| Var | Required | Notes |
|---|---|---|
| `APP_STORE_JOURNEY_PRODUCT_ID` | For transaction verify | ASC non-consumable id via Keeper (F10) — **never invent in chat/code** |
| `APP_STORE_BUNDLE_ID` | Optional | Defaults to `com.izaya.Nomade` |
| `APP_STORE_ALLOW_SANDBOX` | Optional | `true` accepts `Sandbox`/`Xcode` transactions. Set `true` on Preview **and** Production (App Review buys in Sandbox). Every event records `environment`. |
| `BILLING_GATE_ENABLED` | Optional (default **off**) | `true` enforces the paid gate (PATCH 403 + sync rejects). Off: no gate, full details; checklist still carries `access` + `entitlement`; `entitlement.gateEnabled` mirrors this flag so clients lock only when it is on. Turn on only when the iOS paywall ships. |
| `INTAKE_ENABLED` | Optional (default **off**) | F11a. `true` serves `GET/PUT /api/journey/intake`, accepts sync `kind: "intake"` ops, and applies intake rules in the checklist (`intake`, `flags`, per-step `notes`/`origin`, conditional family steps). Off: intake routes → 404 `INTAKE_DISABLED`, sync intake ops rejected `INTAKE_DISABLED`, checklist identical to F10. Export always includes stored answers. **Preview = `true`, Production = off** until Isaias flips it. |
| `ASK_ENABLED` | Optional (default **off**) | F11b kill switch. `true` serves `POST /api/ask`. Off → `503 ASK_DISABLED` (after auth). `GET /api/ask/usage` always answers and reports `enabled`. **Preview = `true`, Production = off** until Isaias flips it after the eval. |
| `FORMS_ENABLED` | Optional (default **off**) | F12a forms library. `true` serves `GET /api/forms` and `GET /api/forms/:formId`. Off → `404 FORMS_DISABLED` (after auth). Ships in 1.1, outside the F10 submission binary: **Preview = `true`** for iOS integration, **Production = off** until Isaias flips it. See docs/forms.md. |
| `ASK_MODEL` | Optional | AI Gateway model id. Default `anthropic/claude-sonnet-4.5`. |
| `ASK_FALLBACK_MODEL` | Optional | Gateway fallback model. Default `anthropic/claude-haiku-4.5`; `none` disables. |
| `AI_GATEWAY_API_KEY` | Optional (secret, Keeper → Vercel) | Vercel AI Gateway key, read by the AI SDK. Not needed on deployments where Vercel OIDC auth to the Gateway works. Never in git/chat/logs. |
| `ASK_FREE_DAILY` / `ASK_PAID_DAILY` | Optional | Questions per user per UTC day when `BILLING_GATE_ENABLED=true` (free / `journey_full`). Defaults 3 / 30. Gate off → 10 for everyone. |

See [`billing.md`](./billing.md). ASSN V2 deferred to F10b.
