# Supabase local layout (F1.2)

Local Postgres via Supabase CLI + Docker. Migrations and seeds live in `supabase/` and are the only schema source of truth — no Dashboard DDL.

## Schemas

| Schema | Role |
|---|---|
| `internal` | App/KB tables. **Not** in `[api].schemas` — not auto-exposed on the Data API. |
| `api` | Explicit client/server surface (views/RPCs later). Only schema listed for PostgREST exposure. |

Logical domains from `docs/architecture.md` (`identity`, `billing`, `journey`, `knowledge`, `operations`) land under `internal` (or dedicated schemas) in later migrations. **Roles and RLS:** see [`supabase-roles-rls.md`](./supabase-roles-rls.md) (F1.3).

## Prerequisites

- Supabase CLI `2.117.0` (or current team pin)
- Docker Desktop or OrbStack running

## Start and reset

```bash
cd /path/to/nomade
supabase start
supabase db reset
```

`db reset` must exit 0 with no manual SQL. Seed file: `supabase/seed.sql` (minimal / empty DML by design).

## Link to development only

Link target is **`nomade-dev`** only. Do **not** link `nomade-prod`. `nomade-staging` is deferred.

```bash
supabase link --project-ref bgdrzdlenmwbpalnjiqg
```

Confirm the live project ref in Keeper / dashboard if it differs from this runbook value. Region: `us-west-2`.

**Do not** `supabase db push` to remote in F1.2/F1.3. First remote migration apply is a later human-gated step.

## Git ignore

`supabase/.gitignore` ignores `.temp`, `.branches`, and local dotenv keys. Root `.gitignore` already ignores `.env*`. Never commit service-role keys.

## Next.js env (F1.4)

Fill `.env.local` from `supabase status` (URL, anon, service_role). See [`backend-env.md`](./backend-env.md) and `.env.example`. Health: `GET /api/health`.
