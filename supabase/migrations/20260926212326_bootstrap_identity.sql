-- F2.3: Bootstrap identity — internal.users + internal.auth_identities
-- Citations: F2.1 identity/session contract; F0.2 Class B; docs/runbooks/F2.3-bootstrap-identity-runbook.md
-- Approach: thin API writer (service_role). No auth.users INSERT trigger.
-- UUID mapping: internal.users.id = auth.users.id (same UUID; FK references auth.users).

-- ---------------------------------------------------------------------------
-- internal.users
-- ---------------------------------------------------------------------------
create table if not exists internal.users (
  id uuid primary key references auth.users (id),
  email text null,
  deletion_status text not null default 'active'
    check (deletion_status in ('active', 'pending_deletion', 'deleted')),
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table internal.users is
  'F2.3 Class B: app user row. id = auth.users.id. Email nullable; never UNIQUE/PK (F2.1).';

comment on column internal.users.email is
  'Optional Apple-relay email. Never account key; never used alone for authz (F2.1).';

comment on column internal.users.deletion_status is
  'active | pending_deletion | deleted. Columns ready for F2.6 wipe; no wipe job in F2.3.';

-- ---------------------------------------------------------------------------
-- internal.auth_identities
-- ---------------------------------------------------------------------------
create table if not exists internal.auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references internal.users (id),
  provider text not null,
  provider_subject text not null,
  email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  constraint auth_identities_provider_check check (provider = 'apple')
);

comment on table internal.auth_identities is
  'F2.3 Class B: binds Apple provider_subject to internal.users.id. closed_at NULL = active (F2.1/F2.6).';

comment on column internal.auth_identities.provider_subject is
  'Opaque Apple sub. Store raw text; never log full value (prefix only).';

-- Unique while active (closed_at IS NULL): one live binding per (provider, subject)
create unique index if not exists auth_identities_provider_subject_active_uidx
  on internal.auth_identities (provider, provider_subject)
  where closed_at is null;

create index if not exists auth_identities_user_id_idx
  on internal.auth_identities (user_id);

-- ---------------------------------------------------------------------------
-- updated_at helpers (API also sets updated_at on write)
-- ---------------------------------------------------------------------------
create or replace function internal.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on internal.users;
create trigger users_set_updated_at
  before update on internal.users
  for each row execute function internal.set_updated_at();

drop trigger if exists auth_identities_set_updated_at on internal.auth_identities;
create trigger auth_identities_set_updated_at
  before update on internal.auth_identities
  for each row execute function internal.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants + RLS (deny-by-default for client roles; service_role + postgres only)
-- Reinforce F1.3. Zero policies for anon/authenticated.
-- ---------------------------------------------------------------------------
revoke all on table internal.users from public;
revoke all on table internal.users from anon, authenticated;
grant all on table internal.users to postgres, service_role;

revoke all on table internal.auth_identities from public;
revoke all on table internal.auth_identities from anon, authenticated;
grant all on table internal.auth_identities to postgres, service_role;

alter table internal.users enable row level security;
alter table internal.auth_identities enable row level security;
-- Intentionally no CREATE POLICY for anon/authenticated (deny-by-default).
-- service_role bypasses RLS in Supabase.
