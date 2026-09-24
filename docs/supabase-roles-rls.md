# Supabase roles + RLS (F1.3)

Deny-by-default foundation for Nomade. Schema layout is in [`supabase-local.md`](./supabase-local.md). ADRs: F0.1 (schemas + no client service-role), F0.2 (no anon on `internal`), F0.6 AC-03.

## Role model (V1)

| Role | Who | Allowed |
|---|---|---|
| `anon` | Unauthenticated Data API | **USAGE** on `api` only; **no** table/select by default; only explicitly granted RPCs/views later |
| `authenticated` | Signed-in user JWT | Same as anon until F2 tables exist; then RLS `auth.uid()` ownership on journey/identity surfaces only |
| `service_role` | Server / Edge / trusted jobs | Full access to `internal` + `api`; **never** shipped to iOS or browser |
| `postgres` | Migrations / owner | Schema changes via repo migrations only |

Do **not** invent extra DB roles unless a later task needs them. Logical domains (`identity`, `billing`, `journey`, `knowledge`, `operations`) stay as tables under `internal` until those feature tasks.

## Client reminder

**iOS and browser clients never receive the `service_role` key.** Use the anon/publishable key only; server and Edge use `service_role`.

## Local smoke (after `supabase db reset`)

From the repo root with Docker + CLI running (`supabase start`):

```bash
supabase db reset
```

Optional SQL (local DB only — paste ok/fail, never passwords / JWTs / service-role keys):

```sql
-- Expect: works as postgres / owner
select count(*) from internal.f1_3_smoke;

-- Expect: permission denied or 0 rows with RLS + no policy
set role authenticated;
select * from api.f1_3_smoke;
reset role;
```

`internal.f1_3_smoke` is not listed in `[api].schemas`, so it is not Data-API exposed. `api.f1_3_smoke` has RLS enabled and **zero** policies for `anon`/`authenticated`.

## Out of scope here

Next.js adapter (F1.4), CI reset (F1.5), remote `db push`, prod link, Dashboard DDL, full domain tables.
