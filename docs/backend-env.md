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
