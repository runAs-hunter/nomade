-- F1.3: Roles + RLS foundation
-- Runbook: F1.3-roles-rls-runbook.md (team ADRs F0.1, F0.2, F0.6 AC-03)
--
-- Role model (locked for V1):
--   anon           — Unauthenticated Data API. USAGE on api only; no table/select by default.
--   authenticated  — Signed-in JWT. Same deny-by-default until F2 tables + ownership RLS.
--   service_role   — Server / Edge / trusted jobs. Full access to internal + api.
--                    NEVER ship to iOS or browser clients.
--   postgres       — Migrations / owner. Schema changes via repo migrations only.
--
-- Deny-by-default: RLS on + zero policies for client roles = no access.
-- Do not invent extra DB roles here. Full identity/journey/KB tables are later tasks.

-- ---------------------------------------------------------------------------
-- Reinforce internal lock (no client GRANTs; Data API does not list this schema)
-- ---------------------------------------------------------------------------
revoke all on schema internal from public;
revoke all on schema internal from anon, authenticated;
grant usage on schema internal to postgres, service_role;
grant all on all tables in schema internal to postgres, service_role;
grant all on all sequences in schema internal to postgres, service_role;
grant all on all routines in schema internal to postgres, service_role;

-- Future objects created by the migration role stay off anon/authenticated
alter default privileges in schema internal
  revoke all on tables from anon, authenticated;
alter default privileges in schema internal
  revoke all on sequences from anon, authenticated;
alter default privileges in schema internal
  revoke all on routines from anon, authenticated;
alter default privileges in schema internal
  grant all on tables to postgres, service_role;
alter default privileges in schema internal
  grant all on sequences to postgres, service_role;
alter default privileges in schema internal
  grant all on routines to postgres, service_role;

-- ---------------------------------------------------------------------------
-- api: deny-by-default table privileges for client roles
-- Schema USAGE remains (PostgREST needs it); tables are not auto-granted.
-- ---------------------------------------------------------------------------
revoke all on schema api from public;
grant usage on schema api to anon, authenticated, service_role;

alter default privileges in schema api
  revoke all on tables from anon, authenticated;
alter default privileges in schema api
  revoke all on sequences from anon, authenticated;
alter default privileges in schema api
  grant all on tables to service_role;
alter default privileges in schema api
  grant all on sequences to service_role;

-- ---------------------------------------------------------------------------
-- Tiny smoke surfaces (prove grants + RLS; not domain tables)
-- ---------------------------------------------------------------------------

create table if not exists internal.f1_3_smoke (
  id int primary key,
  note text not null
);

comment on table internal.f1_3_smoke is
  'F1.3 smoke: not in [api].schemas; no GRANTs to anon/authenticated.';

insert into internal.f1_3_smoke (id, note)
values (1, 'internal smoke row')
on conflict (id) do nothing;

revoke all on table internal.f1_3_smoke from public;
revoke all on table internal.f1_3_smoke from anon, authenticated;
grant all on table internal.f1_3_smoke to postgres, service_role;

create table if not exists api.f1_3_smoke (
  id int primary key,
  note text not null
);

comment on table api.f1_3_smoke is
  'F1.3 smoke: RLS on, zero policies for anon/authenticated (deny-by-default).';

insert into api.f1_3_smoke (id, note)
values (1, 'api smoke row')
on conflict (id) do nothing;

-- Explicit: clients get no table privileges; service_role retains full access
revoke all on table api.f1_3_smoke from public;
revoke all on table api.f1_3_smoke from anon, authenticated;
grant all on table api.f1_3_smoke to postgres, service_role;

-- RLS on + no permissive policies => anon/authenticated see nothing even if granted later
alter table api.f1_3_smoke enable row level security;
-- Intentionally no CREATE POLICY for anon/authenticated.
