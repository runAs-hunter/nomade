-- F3: Journey cases + step states (Class C)
-- Citations: docs/runbooks/F3-journey-checklist-runbook.md; F0.1 server SoT; F0.2 Class C
-- Access: Next.js + service_role after requireAccess (no client-direct grants).
-- Apply scope: local + nomade-dev ONLY. NEVER nomade-prod.

-- ---------------------------------------------------------------------------
-- internal.journey_cases
-- ---------------------------------------------------------------------------
create table if not exists internal.journey_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references internal.users (id),
  path_id text not null,
  country_code text not null default 'IT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, country_code)
);

comment on table internal.journey_cases is
  'F3 Class C: one active journey case per user per country (V1 Italy). path_id e.g. italy_digital_nomad.';

comment on column internal.journey_cases.path_id is
  'Catalog path id. Changing path resets step states (F3 Cap default).';

comment on column internal.journey_cases.country_code is
  'ISO-ish country code. V1 unique (user_id, country_code) — one Italy case per user.';

-- ---------------------------------------------------------------------------
-- internal.journey_step_states
-- ---------------------------------------------------------------------------
create table if not exists internal.journey_step_states (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references internal.journey_cases (id) on delete cascade,
  step_id text not null,
  status text not null
    check (status in ('not_started', 'in_progress', 'done')),
  updated_at timestamptz not null default now(),
  unique (case_id, step_id)
);

comment on table internal.journey_step_states is
  'F3 Class C: per-step ternary status for a journey case. Catalog ids stable (italy.yaml-aligned).';

comment on column internal.journey_step_states.step_id is
  'Static catalog step id (e.g. passport). Not Visa Ops / RAG claim ids.';

comment on column internal.journey_step_states.status is
  'not_started | in_progress | done. Default seed: not_started.';

create index if not exists journey_cases_user_id_idx
  on internal.journey_cases (user_id);

create index if not exists journey_step_states_case_id_idx
  on internal.journey_step_states (case_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuse internal.set_updated_at from F2.3)
-- ---------------------------------------------------------------------------
drop trigger if exists journey_cases_set_updated_at on internal.journey_cases;
create trigger journey_cases_set_updated_at
  before update on internal.journey_cases
  for each row execute function internal.set_updated_at();

drop trigger if exists journey_step_states_set_updated_at on internal.journey_step_states;
create trigger journey_step_states_set_updated_at
  before update on internal.journey_step_states
  for each row execute function internal.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants + RLS (deny-by-default; service_role + postgres only)
-- Same pattern as F2.3 bootstrap_identity — no anon/authenticated policies.
-- ---------------------------------------------------------------------------
revoke all on table internal.journey_cases from public;
revoke all on table internal.journey_cases from anon, authenticated;
grant all on table internal.journey_cases to postgres, service_role;

revoke all on table internal.journey_step_states from public;
revoke all on table internal.journey_step_states from anon, authenticated;
grant all on table internal.journey_step_states to postgres, service_role;

alter table internal.journey_cases enable row level security;
alter table internal.journey_step_states enable row level security;
-- Intentionally no CREATE POLICY for anon/authenticated (deny-by-default).
-- service_role bypasses RLS in Supabase.
