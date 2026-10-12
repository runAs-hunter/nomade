-- Fake-door landing (nomadevisa.com) fields. Additive, nullable.
-- Apply scope: local + nomade-dev ONLY. NEVER nomade-prod. NOT applied by this PR.
-- utm_* and referrer_host already exist (20261009234707). The route works
-- without this migration: it retries the insert without these columns.
-- Grants and RLS on internal.waitlist_signups are intentionally unchanged.

alter table internal.waitlist_signups
  add column if not exists tier text,
  add column if not exists path text,
  add column if not exists move_date text,
  add column if not exists source text;

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
comment on column internal.waitlist_signups.source is 'Signup surface, e.g. nomadevisa_landing.';
