-- F10: tag every App Store billing event with its StoreKit environment,
-- and record sticky revocation (revoked_at is set once and never cleared).
-- Forward reconcile on top of 20261002130408_billing_entitlements (already on nomade-dev).
-- Additive only. Apply scope: local + nomade-dev ONLY. NEVER nomade-prod.

alter table internal.billing_events
  add column if not exists environment text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'billing_events_environment_check'
      and conrelid = 'internal.billing_events'::regclass
  ) then
    alter table internal.billing_events
      add constraint billing_events_environment_check
      check (environment is null or environment in ('Production', 'Sandbox', 'Xcode'));
  end if;
end $$;

comment on column internal.billing_events.environment is
  'F10: StoreKit environment from the verified JWS (Production | Sandbox | Xcode). Revenue reporting filters Production.';

create index if not exists billing_events_environment_idx
  on internal.billing_events (environment);

alter table internal.billing_events
  add column if not exists revoked_at timestamptz;

comment on column internal.billing_events.revoked_at is
  'F10: Apple revocationDate (refund/revoke). Sticky: once set, the transaction never grants journey_full again.';
