-- Fake-door landing (nomadevisa.com) fields on internal.waitlist_signups.
-- Additive and nullable; safe to re-run (columns use IF NOT EXISTS, checks are
-- dropped and re-added). Grants and RLS are intentionally unchanged.
--
-- Apply scope: local + nomade-dev ONLY. NEVER nomade-prod.
-- NOT applied by the PR that adds it: production reads nomade-dev, so applying
-- it makes it live. Apply only with Isaias's go-ahead.
--
-- Re-timestamped from 20261012120000: dev already has migrations up to
-- 20261018102516, and `supabase db push` refuses to insert an older version
-- before the last applied one. 20261022120000 sorts after everything applied
-- on dev and before the unapplied F12 CTA migration (20261023100000).
--
-- Column names: utm_source / referrer_host come from 20261009234707. `source`
-- here is the landing surface only ('nomadevisa_landing'); it is NOT utm_source.
-- The F12 CTA branch adds a separate `signup_source` (CTA card), no collision.
--
-- The route works without this migration: it retries the insert without these
-- columns (src/app/api/waitlist/route.ts), so a missing column never fails a
-- signup.

alter table internal.waitlist_signups
  add column if not exists tier text,
  add column if not exists path text,
  add column if not exists move_date text,
  add column if not exists source text;

alter table internal.waitlist_signups
  drop constraint if exists waitlist_signups_tier_chk,
  drop constraint if exists waitlist_signups_path_chk,
  drop constraint if exists waitlist_signups_move_date_len,
  drop constraint if exists waitlist_signups_source_len;

alter table internal.waitlist_signups
  add constraint waitlist_signups_tier_chk
    check (tier is null or tier in ('free','pathpack_79','review_199','hero','nav','topbar','footer')),
  add constraint waitlist_signups_path_chk
    check (path is null or path in ('digital_nomad','elective_residence','other','unsure')),
  add constraint waitlist_signups_move_date_len
    check (move_date is null or char_length(move_date) <= 40),
  add constraint waitlist_signups_source_len
    check (source is null or char_length(source) <= 40);

comment on column internal.waitlist_signups.tier is 'Fake-door tier/CTA clicked before signup (whitelisted, null if absent/invalid).';
comment on column internal.waitlist_signups.path is 'Self-reported visa path (whitelisted).';
comment on column internal.waitlist_signups.move_date is 'Self-reported target move window (whitelisted option text).';
comment on column internal.waitlist_signups.source is 'Landing surface at signup, e.g. nomadevisa_landing (not utm_source; see also signup_source for CTA cards).';
