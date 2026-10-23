-- F12 Phase 0 (0.5): waitlist CTA cards.
-- Apply scope: local + nomade-dev ONLY. NEVER nomade-prod.
-- NOT applied by the PR author: production reads nomade-dev, so applying this
-- makes it live. Apply only with Isaias's go-ahead.
--
-- 1. internal.waitlist_signups.signup_source: which CTA card the signup came
--    from. NULL = the main homepage form (unchanged default). Only the two
--    CTA values are allowed.
-- 2. internal.waitlist_cta_taps: one row per CTA button tap (the site has no
--    analytics). cta + sanitized utm_* only; no email, IP, user agent or
--    referrer.
--
-- The app tolerates this migration being absent: signups retry without
-- signup_source, and taps are still counted in the structured log line
-- `waitlist_cta_tap`.

alter table internal.waitlist_signups
  add column if not exists signup_source text;

alter table internal.waitlist_signups
  add constraint waitlist_signups_signup_source_check
    check (signup_source is null or signup_source in ('forms_prefill', 'appointment_packet'));

comment on column internal.waitlist_signups.signup_source is
  'CTA card the signup came from (forms_prefill | appointment_packet); null = main homepage form.';

create table if not exists internal.waitlist_cta_taps (
  id uuid primary key default gen_random_uuid(),
  cta text not null
    constraint waitlist_cta_taps_cta_check
      check (cta in ('forms_prefill', 'appointment_packet')),
  utm_source text constraint waitlist_cta_taps_utm_source_len
    check (utm_source is null or char_length(utm_source) <= 100),
  utm_medium text constraint waitlist_cta_taps_utm_medium_len
    check (utm_medium is null or char_length(utm_medium) <= 100),
  utm_campaign text constraint waitlist_cta_taps_utm_campaign_len
    check (utm_campaign is null or char_length(utm_campaign) <= 100),
  utm_content text constraint waitlist_cta_taps_utm_content_len
    check (utm_content is null or char_length(utm_content) <= 100),
  created_at timestamptz not null default now()
);

create index if not exists waitlist_cta_taps_cta_created_at_idx
  on internal.waitlist_cta_taps (cta, created_at);

comment on table internal.waitlist_cta_taps is
  'F12 CTA card button taps (count only). nomade-dev only. No PII.';

-- Grants + RLS: same deny-by-default pattern as internal.waitlist_signups
-- (service_role + postgres only; no anon/authenticated policies).
revoke all on table internal.waitlist_cta_taps from public;
revoke all on table internal.waitlist_cta_taps from anon, authenticated;
grant all on table internal.waitlist_cta_taps to postgres, service_role;

alter table internal.waitlist_cta_taps enable row level security;
