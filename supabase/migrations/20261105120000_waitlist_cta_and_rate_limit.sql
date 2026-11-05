-- F12 Phase 0 landing CTA cards + waitlist rate limit.
-- Apply scope: local + nomade-dev ONLY. NEVER nomade-prod.
-- NOT applied by the PR author. Isaias merges and applies only after a later yes.
--
-- Supersedes #41's 20261023100000_waitlist_cta_source_taps.sql (never applied).
-- Re-runnable: IF NOT EXISTS / drop-then-add constraints where needed.
--
-- 1. internal.waitlist_signups.signup_source (NULL | forms_prefill | appointment_packet)
-- 2. internal.waitlist_cta_taps (CTA button taps; RLS on; no anon/authenticated grants)
-- 3. internal.waitlist_rate_limits + waitlist_rate_limit_hit RPC (5/min/IP for POST /api/waitlist)

-- ----- signup_source -----
alter table internal.waitlist_signups
  add column if not exists signup_source text;

alter table internal.waitlist_signups
  drop constraint if exists waitlist_signups_signup_source_check;

alter table internal.waitlist_signups
  add constraint waitlist_signups_signup_source_check
    check (signup_source is null or signup_source in ('forms_prefill', 'appointment_packet'));

comment on column internal.waitlist_signups.signup_source is
  'CTA card the signup came from (forms_prefill | appointment_packet); null = main homepage form.';

-- ----- cta taps -----
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

revoke all on table internal.waitlist_cta_taps from public;
revoke all on table internal.waitlist_cta_taps from anon, authenticated;
grant all on table internal.waitlist_cta_taps to postgres, service_role;

alter table internal.waitlist_cta_taps enable row level security;

-- ----- rate limit (global per-IP window) -----
create table if not exists internal.waitlist_rate_limits (
  ip text not null,
  window_start timestamptz not null,
  hit_count integer not null default 0
    constraint waitlist_rate_limits_hit_count_nonneg check (hit_count >= 0),
  primary key (ip, window_start)
);

comment on table internal.waitlist_rate_limits is
  'POST /api/waitlist per-IP fixed-window counters. nomade-dev only. No PII beyond IP.';

revoke all on table internal.waitlist_rate_limits from public;
revoke all on table internal.waitlist_rate_limits from anon, authenticated;
grant all on table internal.waitlist_rate_limits to postgres, service_role;

alter table internal.waitlist_rate_limits enable row level security;

create or replace function internal.waitlist_rate_limit_hit(
  p_ip text,
  p_window_start timestamptz,
  p_limit integer
) returns json
language plpgsql
security definer
set search_path = internal, public
as $$
declare
  v_count integer;
begin
  if p_ip is null or length(p_ip) = 0 or p_limit is null or p_limit < 1 then
    return json_build_object('allowed', true, 'count', 0);
  end if;

  insert into internal.waitlist_rate_limits (ip, window_start, hit_count)
  values (left(p_ip, 100), p_window_start, 1)
  on conflict (ip, window_start)
  do update set hit_count = internal.waitlist_rate_limits.hit_count + 1
  returning hit_count into v_count;

  return json_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count
  );
end;
$$;

revoke all on function internal.waitlist_rate_limit_hit(text, timestamptz, integer) from public;
revoke all on function internal.waitlist_rate_limit_hit(text, timestamptz, integer) from anon, authenticated;
grant execute on function internal.waitlist_rate_limit_hit(text, timestamptz, integer) to service_role, postgres;
