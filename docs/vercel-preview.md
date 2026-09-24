# Vercel Preview (F1.7)

Every backend PR on `runAs-hunter/nomade` should get a **Vercel Preview** deploy for project **`nomade-app`**. Preview env points at **`nomade-dev` only** — never `nomade-prod`.

## Hobby environments

Vercel Hobby for `nomade-app` exposes **Production** + **Preview** only. There is **no** custom Staging environment (Pro-only; deferred with F1.1b).

| Scope | Supabase target | Who sets secrets |
|---|---|---|
| **Preview** | `nomade-dev` ref `bgdrzdlenmwbpalnjiqg` (`us-west-2`) | Human from Keeper |
| **Production** | `nomade-prod` ref `whjzynfsifrtrxlylrww` | Human gate — **out of F1.7** |

Do **not** put `nomade-prod` URL or service role on Preview.

## Preview env vars (names match F1.4 / `.env.example`)

Set these on Vercel → `nomade-app` → Settings → Environment Variables, scope **Preview** only. Values come from Keeper (`/ nomadeapp / Nomade secrects inventory`) for **`nomade-dev`** — never commit or paste keys into git/chat/PR.

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Preview | `https://bgdrzdlenmwbpalnjiqg.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Preview | `nomade-dev` anon/publishable only |
| `SUPABASE_SERVICE_ROLE_KEY` | Preview (**server only**) | `nomade-dev` service role — never `NEXT_PUBLIC_*`, never iOS |
| `SUPABASE_PROJECT_REF` | Preview (optional) | `bgdrzdlenmwbpalnjiqg` |
| `ANTHROPIC_API_KEY` | Preview (optional) | Health must not require it |

Typed validation: `src/lib/env.ts`. Full local contract: [`backend-env.md`](./backend-env.md).

## Finding the Preview URL on a PR

1. Open the PR on GitHub.
2. Wait for the Vercel Git integration to comment (or check the **Checks** / **Deployments** tab).
3. Use the **Visit Preview** / Preview URL for this commit (host like `nomade-app-….vercel.app`).

If no Preview deployment appears, GitHub↔Vercel for `runAs-hunter/nomade` → `nomade-app` may be disconnected — reconnect in the Vercel project Git settings (human).

## Smoke: `GET /api/health`

```bash
curl -sS "https://<preview-host>/api/health"
```

Expect structured JSON **with no secrets** (no JWTs, no `eyJ…`, no `service_role`):

```json
{ "ok": true, "supabase": "up", "projectRef": "bgdrzdlenmwbpalnjiqg" }
```

`projectRef` is optional. On failure the body still stays non-secret, e.g. `{ "ok": false, "supabase": "down", "code": "…" }` with HTTP 503.

Record a successful Preview URL in F0.3 / Keeper notes after the first green smoke (Captain), without pasting keys.

## If `supabase: "down"`

Likely causes (report which; do **not** remote `db push` from this task):

1. **Missing or wrong Preview env vars** — Isaias sets the three required Supabase vars for Preview from Keeper (`nomade-dev` only), then redeploy / empty-commit to retrigger.
2. **Migrations not applied on `nomade-dev`** — health pings `api.f1_3_smoke`; an empty remote DB yields `down` even with correct vars. Remote migration apply is **human-gated separately**, not part of F1.7 code.

F1.7 is still Done when Preview deploys and returns structured health JSON (even if `supabase: "down"` pending remote apply).

## Service role reminder

`SUPABASE_SERVICE_ROLE_KEY` stays on the Next.js server / Vercel **server** env only. Never prefix with `NEXT_PUBLIC_`. Never ship to iOS or browser clients — clients get anon/publishable only.

## Out of scope (F1.7)

- Production Vercel secrets / promote gate
- Custom Staging env or Vercel Pro upgrade
- Remote `db push` / migration apply to `nomade-dev`
- GitHub Actions deploy tokens (Vercel Git integration owns Preview)
- Anthropic chat routes, iOS, branch-protection changes

## Related

- Env contract: [`backend-env.md`](./backend-env.md)
- CI gates: [`ci.md`](./ci.md)
- Environment matrix: [`adrs/F0.3-environment-matrix.md`](./adrs/F0.3-environment-matrix.md)
