-- F3.1: Billing events + entitlements (Class E)
-- Citations: docs/runbooks/F3.1-billing-entitlement-runbook.md; F0.1 StoreKit server SoT; F0.2 Class E
-- Access: Next.js + service_role after requireAccess (no client-direct grants).
-- Apply scope: local + nomade-dev ONLY. NEVER nomade-prod (whjzynfsifrtrxlylrww).

-- ---------------------------------------------------------------------------
-- internal.billing_events (append-only purchase / restore markers)
-- ---------------------------------------------------------------------------
create table if not exists internal.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references internal.users (id),
  source text not null default 'app_store',
  product_id text not null,
  transaction_id text not null,
  original_transaction_id text,
  event_type text not null,
  occurred_at timestamptz not null,
  raw_ref text,
  created_at timestamptz not null default now(),
  unique (source, transaction_id)
);

comment on table internal.billing_events is
  'F3.1 Class E: append-only App Store transaction events. Retain stripped rows on purge; never store full JWS in routine logs.';

comment on column internal.billing_events.product_id is
  'ASC product id from verified transaction (env APP_STORE_JOURNEY_PRODUCT_ID). Never invent in code.';

comment on column internal.billing_events.raw_ref is
  'Opaque hash / ref of signed payload — not the full JWS. Cleared on purge (Class E strip).';

comment on column internal.billing_events.event_type is
  'purchase | restore | refund | … (ASSN refunds deferred to F3.1b).';

-- ---------------------------------------------------------------------------
-- internal.entitlements (derived / recomputable)
-- ---------------------------------------------------------------------------
create table if not exists internal.entitlements (
  user_id uuid not null references internal.users (id),
  entitlement_id text not null,
  status text not null check (status in ('active', 'inactive')),
  source_transaction_id text,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entitlement_id)
);

comment on table internal.entitlements is
  'F3.1 Class E: derived entitlement state (e.g. journey_full). Server SoT after verified App Store transaction. Deleted on purge.';

comment on column internal.entitlements.entitlement_id is
  'Internal entitlement key (journey_full). Not an ASC product id.';

create index if not exists billing_events_user_id_idx
  on internal.billing_events (user_id);

create index if not exists entitlements_status_idx
  on internal.entitlements (status);

-- ---------------------------------------------------------------------------
-- updated_at trigger (reuse internal.set_updated_at from F2.3)
-- ---------------------------------------------------------------------------
drop trigger if exists entitlements_set_updated_at on internal.entitlements;
create trigger entitlements_set_updated_at
  before update on internal.entitlements
  for each row execute function internal.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants + RLS (deny-by-default; service_role + postgres only)
-- ---------------------------------------------------------------------------
revoke all on table internal.billing_events from public;
revoke all on table internal.billing_events from anon, authenticated;
grant all on table internal.billing_events to postgres, service_role;

revoke all on table internal.entitlements from public;
revoke all on table internal.entitlements from anon, authenticated;
grant all on table internal.entitlements to postgres, service_role;

alter table internal.billing_events enable row level security;
alter table internal.entitlements enable row level security;
-- Intentionally no CREATE POLICY for anon/authenticated (deny-by-default).
-- service_role bypasses RLS in Supabase.
