-- DEV ONLY (nomade-dev, bgdrzdlenmwbpalnjiqg). Never run on nomade-prod. Not a migration.
-- Removes conditional family step rows that were seeded before seeding was gated
-- behind INTAKE_ENABLED. Only rows still not_started on cases with no intake
-- answers. Deletes only; no other row (and no updated_at) is modified.
-- Already run on dev 2026-10-16 (0 rows remain); kept for re-runs.
delete from internal.journey_step_states s
  where s.step_id in ('family-documents', 'family-permesso')
    and s.status = 'not_started'
    and not exists (select 1 from internal.journey_intake i where i.case_id = s.case_id);
