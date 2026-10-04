-- Public homepage waitlist signups.
-- Apply scope: local + nomade-dev ONLY. NEVER nomade-prod.

create table if not exists internal.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

comment on table internal.waitlist_signups is
  'Public homepage waitlist. nomade-dev only.';

-- Grants + RLS (deny-by-default; service_role + postgres only).
-- Same pattern as 20261001152157_journey_cases_steps.sql — no anon/authenticated policies.
revoke all on table internal.waitlist_signups from public;
revoke all on table internal.waitlist_signups from anon, authenticated;
grant all on table internal.waitlist_signups to postgres, service_role;

alter table internal.waitlist_signups enable row level security;
-- Intentionally no CREATE POLICY for anon/authenticated (deny-by-default).
-- service_role bypasses RLS in Supabase.
