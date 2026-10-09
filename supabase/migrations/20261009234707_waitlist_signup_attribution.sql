-- Waitlist signup attribution (UTMs + referrer host).
-- Apply scope: local + nomade-dev ONLY. NEVER nomade-prod.
-- Nullable, length-capped text columns. Values are sanitized server-side
-- (src/lib/waitlist/attribution.ts); invalid values are stored as null.
-- Grants and RLS on internal.waitlist_signups are intentionally unchanged
-- (deny-by-default; service_role + postgres only).

alter table internal.waitlist_signups
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists referrer_host text;

alter table internal.waitlist_signups
  add constraint waitlist_signups_utm_source_len
    check (utm_source is null or char_length(utm_source) <= 100),
  add constraint waitlist_signups_utm_medium_len
    check (utm_medium is null or char_length(utm_medium) <= 100),
  add constraint waitlist_signups_utm_campaign_len
    check (utm_campaign is null or char_length(utm_campaign) <= 100),
  add constraint waitlist_signups_utm_content_len
    check (utm_content is null or char_length(utm_content) <= 100),
  add constraint waitlist_signups_referrer_host_len
    check (referrer_host is null or char_length(referrer_host) <= 100);

comment on column internal.waitlist_signups.utm_source is 'utm_source at signup (sanitized, <=100 chars, null if absent/invalid).';
comment on column internal.waitlist_signups.utm_medium is 'utm_medium at signup (sanitized, <=100 chars, null if absent/invalid).';
comment on column internal.waitlist_signups.utm_campaign is 'utm_campaign at signup (sanitized, <=100 chars, null if absent/invalid).';
comment on column internal.waitlist_signups.utm_content is 'utm_content at signup (sanitized, <=100 chars, null if absent/invalid).';
comment on column internal.waitlist_signups.referrer_host is 'Referrer hostname only (never the full URL); null if absent, invalid, or same-site.';
