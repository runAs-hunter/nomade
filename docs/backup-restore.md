# Backup / restore (F1.9)

Logical dump of **`nomade-dev`** → clean **local** restore. Proves restoreability without depending on Dashboard alone.

**This is not the production restore drill.** Production PITR / Dashboard restore is **R1.6** (before public launch). Do **not** dump, restore, or pause **`nomade-prod`**.

**CLI pin for documented flags:** Supabase CLI **2.117.0** (`supabase --version`). Re-verify flags if the pin changes.

## Scope

| Item | Value |
|---|---|
| Dump source | `nomade-dev` only (`bgdrzdlenmwbpalnjiqg`, `us-west-2`) |
| Restore destination | Local Supabase (`supabase start` / Docker) |
| Forbidden | `nomade-prod` (`whjzynfsifrtrxlylrww`); committing dump files; pasting dump contents / DB passwords / service-role keys into chat or git |
| Why logical dump | Free/Hobby may lack PITR / long retention; CLI dump proves restore without buying Pro for this gate |
| Dump file location | **Outside** the repo (e.g. `~/nomade-drills/`). Never under the git working tree |

Data classification: F0.2 §5 — backups inherit the classification of contained data. F1.9 is the **dev** restore proof.

## Hosted backups vs this drill

Supabase’s plan default for `nomade-dev` may include daily backups and (on paid plans) PITR. Treat Dashboard / platform backups as **platform default**, not as the F1.9 proof.

F1.9 still requires a **logical dump → clean local restore** so the team can restore without Dashboard-only procedures and without purchasing PITR solely for this gate. Optional Pro/PITR purchase is out of scope here.

## How to dump `nomade-dev` (CLI 2.117.0)

Human-only (Part B). Agents must **not** run `db dump` against cloud.

```bash
cd /path/to/nomade   # e.g. /Users/isaiashunter/code/nomadeapp
supabase --version   # expect 2.117.0 for these flags
docker info >/dev/null && echo docker-ok

mkdir -p ~/nomade-drills
supabase login
supabase link --project-ref bgdrzdlenmwbpalnjiqg
# Hard stop if linked ref is not bgdrzdlenmwbpalnjiqg
```

Default `supabase db dump` (without `--data-only`) dumps **schema** (DDL). For a restoreable snapshot, dump **schema + data** (and optionally roles) into separate files outside the repo:

```bash
STAMP=$(date +%Y%m%d)
DIR=~/nomade-drills
BASE="$DIR/f1.9-nomade-dev-$STAMP"

# Schema (DDL) from linked project
supabase db dump --linked -f "$BASE.schema.sql"

# Data only (COPY statements; smaller / faster to reload)
supabase db dump --linked --data-only --use-copy -f "$BASE.data.sql"

# Optional: cluster roles (usually skip for local Path B unless restore needs custom roles)
# supabase db dump --linked --role-only -f "$BASE.roles.sql"

ls -lh "$BASE".*.sql
```

Notes for **2.117.0**:

- `--linked` dumps the linked project (prefer over `--project-ref` when already linked).
- `-f` / `--file` is required to write to disk (do not print dump bodies into the terminal for chat paste).
- `--schema api` (or `-s api`) can narrow to the `api` schema if a full dump is too heavy; for F1.9 prefer a full linked dump so Path B matches “snapshot restores.”
- `--dry-run` prints the underlying `pg_dump` script without executing — useful to confirm flags; still do not paste secrets.
- Password: CLI prompts or use Keeper `nomade-dev` DB password via `-p` only on a local shell — never commit or chat it.
- There is **no** `supabase db load` in 2.117.0; restore uses `psql` (Path B below).

## Path A — preferred normal recovery (migrations = source of truth)

When the goal is “rebuild from repo,” not “replay a snapshot”:

```bash
supabase start    # if not already
supabase db reset
```

`db reset` applies `supabase/migrations/*` (and seed unless `--no-seed`). Prove `api.f1_3_smoke` exists (Studio or SQL). This is the everyday recovery path after bad local experiments.

## Path B — snapshot restore into wiped local (F1.9 proof)

Required once for F1.9: prove a **logical dump** restores into a **clean local** Postgres.

CLI 2.117.0 has no `db load`. Use `psql` against the local DB URL from `supabase status`.

```bash
supabase start

# Wipe local DB contents by recreating from migrations first (known clean baseline),
# then replace application schema from the dump. For a fuller wipe of Docker volumes:
#   supabase stop --no-backup && supabase start
# then continue with DROP + psql below (migrations will have re-applied on start;
# DROP SCHEMA removes them before the dump reload).

eval "$(supabase status -o env)"
# Uses DB_URL from status (local). Do not point at hosted connection strings.

psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS api CASCADE;
DROP SCHEMA IF EXISTS internal CASCADE;
SQL

psql "$DB_URL" \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$BASE.schema.sql"

psql "$DB_URL" \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$BASE.data.sql"
```

If the schema dump conflicts with local Supabase internals (`auth`, `storage`, extensions), stop and report the exact error to Cap — do **not** invent a Dashboard restore into a hosted project. Narrowing the dump with `--schema api,internal` on a re-dump is an acceptable documented substitute Cap may sign off.

Optional roles file (only if you dumped `--role-only`):

```bash
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$BASE.roles.sql"
```

## Verification

After Path A and/or Path B:

1. Local SQL or Studio: table `api.f1_3_smoke` exists and has the smoke row from F1.3.
2. Optional: point `.env.local` at local Supabase and `GET /api/health` (see [`backend-env.md`](./backend-env.md)).

Record for Cap (non-secret): dump path outside repo, file size in KB only, Path A/B ok/fail, `api.f1_3_smoke` yes/no, prod touched: no.

## Never

- Commit dump files (or paste dump SQL into PRs/chat)
- Dump or restore **`nomade-prod`**
- Restore a dump into any hosted project during F1.9
- Run agent-driven `db dump` / restore with cloud secrets
- Buy PITR solely to check this box (optional later; not required for F1.9)

## Related

- Forward-fix / rollback: [`migration-rollback.md`](./migration-rollback.md)
- Local layout: [`supabase-local.md`](./supabase-local.md)
- Env matrix: [`adrs/F0.3-environment-matrix.md`](./adrs/F0.3-environment-matrix.md)
- Data classes: [`adrs/F0.2-data-classification-retention-adr.md`](./adrs/F0.2-data-classification-retention-adr.md)
