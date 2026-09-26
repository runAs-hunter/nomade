# Migration forward-fix / rollback (F1.9)

How we undo a bad migration **without** rewriting history. Pair with [`backup-restore.md`](./backup-restore.md) for dump/restore.

**CLI pin:** Supabase CLI **2.117.0** (same as CI / local docs).

## Immutable migrations

Once a migration file is **merged to `main`** and applied to a shared environment (`nomade-dev` or later staging/prod):

- **Never edit** that file to “fix” it.
- **Never** rewrite migration history on hosted `nomade-dev` with Dashboard SQL.
- **Never** force-push rewritten migration filenames/timestamps that already shipped.

Local-only experiments (not yet on `main`) may be amended before merge; after merge, treat files as append-only.

Schema source of truth remains `supabase/migrations/*` applied forward. See [`supabase-local.md`](./supabase-local.md).

## Preferred rollback = compensating migration

Rollback means **move forward** to a safe state:

1. `supabase migration new describe_the_fix` (CLI generates the timestamped file).
2. Write SQL that undoes or repairs the bad change (drop column added by mistake, restore constraint, backfill, etc.).
3. Prove locally: `supabase db reset` (and app smoke as needed).
4. PR → review → merge → `supabase db push` to **`nomade-dev` only** when that task’s human gate allows remote apply.

Do **not** edit the original migration to remove the mistake.

### Directionality (CLI 2.117.0)

| Command | Use |
|---|---|
| `supabase migration up` | Apply pending migrations to **local** DB |
| `supabase db push` | Push pending migrations to the **linked** remote (human-gated; `nomade-dev` only unless a later gate says otherwise) |
| `supabase db reset` | Rebuild **local** from all migration files (+ seed) |
| `supabase migration down` | Exists in 2.117.0 (`--last n`, `--local` / `--linked`) but is **not** our primary rollback. It rewinds applied version bookkeeping / local state; it does not replace a reviewed compensating migration on shared environments. Do **not** use `--linked` down against hosted projects as routine “undo.” |

We do **not** rely on per-file `down` scripts. Compensating migrations are the team contract.

## Emergency options (ordered)

Use the earliest option that is safe. F1.9 forbids prod restore.

1. **Compensating migration + push to `nomade-dev`**  
   Preferred. New migration on `main`, apply to dev after review.

2. **Restore logical dump to local to inspect**  
   Follow Path B in [`backup-restore.md`](./backup-restore.md). Inspect data/schema locally; craft the compensating migration from evidence. Do not paste dump contents into chat.

3. **Supabase Dashboard backup restore (hosted)**  
   **Human gate only.** Allowed target for F1.9 emergencies: **`nomade-dev`** if Cap approves. **Never** against **`nomade-prod`** in F1.9 (prod restore = **R1.6**).

4. **Recreate `nomade-dev` from migrations**  
   Last resort. Human gate. If the project ref changes, update Keeper / F0.3 notes — avoid if possible.

## PR checklist note

Every migration PR that is non-trivial should state in the PR body:

```text
Rollback = compensating migration (new file after merge); do not edit this migration once on main.
```

When the compensating approach is already known, name it: `rollback = compensating migration that …`.

Also still apply AGENTS.md hard rules: one task ID, stage only task files, no prod mutations without a named human gate.

## Never

- Edit an applied migration on `main` to “roll back”
- Dashboard DDL on hosted projects as a substitute for migrations
- `migration down --linked` / Dashboard restore against **prod** during F1.9
- Assume Free-plan PITR will save a bad migration (logical dump + compensating migration are the practices)

## Related

- Backup / restore drill: [`backup-restore.md`](./backup-restore.md)
- Roles / RLS: [`supabase-roles-rls.md`](./supabase-roles-rls.md)
- CI migration-reset job: [`ci.md`](./ci.md)
