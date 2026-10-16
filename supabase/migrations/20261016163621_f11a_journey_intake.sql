-- F11a: intake answers per journey case (Class C).
-- A path change keeps the journey_cases row (case.ts updates path_id in place),
-- so the intake hangs off case_id and is wiped with the case (purge cascade).
-- Access: Next.js + service_role after requireAccess (no client-direct grants).
-- Apply scope: local + nomade-dev ONLY. not nomade-prod until F11a launch.

create table if not exists internal.journey_intake (
  case_id uuid primary key references internal.journey_cases (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  rules_version text not null,
  completed_at timestamptz,
  client_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table internal.journey_intake is 'F11a Class C: intake answers; wiped with case (purge).';
comment on column internal.journey_intake.answers is 'Validated server-side (src/lib/journey/intake.ts); intake keys only.';
comment on column internal.journey_intake.completed_at is 'Set once when all intake keys are answered; null = skipped/partial.';
comment on column internal.journey_intake.client_updated_at is 'Last-write-wins clock for sync/PUT.';

drop trigger if exists journey_intake_set_updated_at on internal.journey_intake;
create trigger journey_intake_set_updated_at
  before update on internal.journey_intake
  for each row execute function internal.set_updated_at();

revoke all on table internal.journey_intake from public;
revoke all on table internal.journey_intake from anon, authenticated;
grant all on table internal.journey_intake to postgres, service_role;

alter table internal.journey_intake enable row level security;
-- Intentionally no CREATE POLICY (deny-by-default). service_role bypasses RLS.
