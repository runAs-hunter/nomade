-- F8: Official Sources database (Italy DNV / remote worker first)
-- Citations: docs/runbooks/F8-official-sources-database-runbook.md; docs/sources.md
-- Stores POINTERS + metadata to official pages (MAECI / consulates / Gazzetta /
-- Normattiva / Polizia di Stato). Not legal advice; no visa rules authored here.
-- Access: Next.js service client only (public GET of status=active rows via
-- /api/sources; writes via authenticated admin routes; refresh via CRON_SECRET).
-- Apply scope: local + nomade-dev ONLY. NEVER nomade-prod.

create table if not exists internal.sources (
  id text primary key default gen_random_uuid()::text
    check (id ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  path_ids text[] not null default '{}'::text[],
  country text not null default 'IT'
    check (country ~ '^[A-Z]{2}$'),
  title text not null check (length(btrim(title)) > 0),
  publisher text not null check (length(btrim(publisher)) > 0),
  official_url text not null unique
    check (official_url ~ '^https://[^/?#\s]+'),
  doc_type text not null
    check (doc_type in ('law', 'decree', 'consular_guidance', 'procedure', 'form', 'portal', 'other')),
  scope text not null check (length(btrim(scope)) > 0),
  retrieved_at date not null,
  last_checked_at timestamptz,
  last_http_status integer
    check (last_http_status is null or (last_http_status between 0 and 599)),
  status text not null default 'active'
    check (status in ('active', 'stale', 'retired')),
  notes text,
  content_hash text,
  snapshot_ref text,
  step_ids text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table internal.sources is
  'F8: official source-of-truth pointers (URL + retrieved_at) for citation. Not legal advice; no visa rules. Public read of active rows via /api/sources only.';

comment on column internal.sources.id is
  'Stable slug (seed) or uuid text (admin POST). Citation key for future Chat (F9).';
comment on column internal.sources.path_ids is
  'Journey path ids this source backs (e.g. {italy_digital_nomad,italy_remote_worker}). Empty = shared/unscoped.';
comment on column internal.sources.scope is
  'Jurisdiction / scope: national | questura | US-consulate:<post-id> (consulates.ts ids).';
comment on column internal.sources.retrieved_at is
  'Date Visa Ops last verified the content meaning (curation field).';
comment on column internal.sources.last_checked_at is
  'Operational: last HTTP freshness probe (refresh job only).';
comment on column internal.sources.last_http_status is
  'Operational: final HTTP status of last probe; 0 = network/DNS failure.';
comment on column internal.sources.status is
  'active | stale | retired. Public API returns active only.';
comment on column internal.sources.notes is
  'Internal Visa Ops curation notes. Not user-facing advice.';
comment on column internal.sources.content_hash is
  'Operational, optional: sha256 of fetched body for change detection. Not a RAG corpus.';
comment on column internal.sources.step_ids is
  'Optional F5 catalog step ids this source backs (future cite hook).';

create index if not exists sources_path_ids_gin_idx
  on internal.sources using gin (path_ids);

create index if not exists sources_status_idx
  on internal.sources (status);

drop trigger if exists sources_set_updated_at on internal.sources;
create trigger sources_set_updated_at
  before update on internal.sources
  for each row execute function internal.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants + RLS (deny-by-default; service_role + postgres only)
-- Same pattern as journey_cases / waitlist_signups — no anon/authenticated policies.
-- ---------------------------------------------------------------------------
revoke all on table internal.sources from public;
revoke all on table internal.sources from anon, authenticated;
grant all on table internal.sources to postgres, service_role;

alter table internal.sources enable row level security;
-- Intentionally no CREATE POLICY for anon/authenticated (deny-by-default).
-- service_role bypasses RLS in Supabase.
