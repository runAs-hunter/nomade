-- F1.2: schema layout for Nomade
-- internal: KB/app data — NOT exposed via PostgREST Data API (see supabase/config.toml [api].schemas)
-- api: explicit client-facing surface for later views/RPCs (F1.3+ adds RLS)
-- Logical domains from docs/architecture.md (identity, billing, journey, knowledge, operations)
-- will live under internal (or dedicated schemas) in later migrations; F1.3 owns roles/RLS.

create schema if not exists internal;
create schema if not exists api;

comment on schema internal is
  'Non-Data-API schema for Nomade app/KB tables. Not listed in [api].schemas.';
comment on schema api is
  'Explicit client/server API surface. Only schema exposed via PostgREST besides defaults we remove.';

-- Lock down internal: no privileges for Data API roles
revoke all on schema internal from public;
revoke all on schema internal from anon, authenticated;
grant usage on schema internal to postgres, service_role;
grant all on all tables in schema internal to postgres, service_role;
grant all on all sequences in schema internal to postgres, service_role;
grant all on all routines in schema internal to postgres, service_role;
alter default privileges in schema internal
  grant all on tables to postgres, service_role;
alter default privileges in schema internal
  grant all on sequences to postgres, service_role;
alter default privileges in schema internal
  grant all on routines to postgres, service_role;

-- api: usage for roles; table grants stay explicit (no auto-expose of new objects without GRANT)
revoke all on schema api from public;
grant usage on schema api to anon, authenticated, service_role;
alter default privileges in schema api revoke all on tables from anon, authenticated;
alter default privileges in schema api grant all on tables to service_role;

-- Placeholder: F1.3 adds roles/RLS policies in earnest.
