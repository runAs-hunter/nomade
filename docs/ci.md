# Backend CI (F1.5)

GitHub Actions workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Check ↔ local command

| CI check name | Local equivalent |
|---|---|
| `lint` | `npm ci && npm run lint` |
| `test` | `npm ci && npm run test` |
| `typecheck` | `npm ci && npm run typecheck` |
| `build` | `npm ci && npm run build` with placeholder Supabase env (see workflow) |
| `migration-reset` | `supabase start` then `supabase db reset` (CLI **2.117.0**, Docker) |

Build in CI uses **placeholder** `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` only. No cloud Supabase credentials, no `db push`, no Anthropic key required for the gate.

## Branch protection

After this workflow is green on `main`, set required status checks to the **exact** job names above (F0.5 §3.2). Captain owns enabling protection; this task does not change branch rules.
