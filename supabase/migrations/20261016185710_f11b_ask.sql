-- F11b "Ask Nomade": per-user daily question counter + metadata-only events.
-- NO question or answer text is stored server-side (chat threads stay on device).
-- Access: Next.js + service_role after requireAccess (no client-direct grants).
-- Apply scope: local + nomade-dev ONLY. not nomade-prod until F11b launch.
--
-- Grounding text (internal.sources.summary) already shipped in F11a
-- (20261016163623 / 20261016164642). Retrieval ranks in TS (src/lib/ask/retrieve.ts),
-- so no tsvector column is added here.

create table if not exists internal.ask_usage (
  user_id uuid not null references internal.users (id) on delete cascade,
  day date not null,
  count int not null default 0 check (count >= 0),
  primary key (user_id, day)
);
comment on table internal.ask_usage is 'F11b Class C: Ask questions per user per UTC day (rate limit). No text. Wiped on purge.';

create table if not exists internal.ask_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references internal.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  outcome text not null check (outcome in ('answered','refused_no_source','refused_uncited','rate_limited','error')),
  source_ids text[] not null default '{}',
  focus_step_id text,
  model text,
  input_tokens int,
  output_tokens int,
  latency_ms int
);
comment on table internal.ask_events is 'F11b Class C: Ask metadata only (outcome, cited source ids, tokens, latency). NEVER question/answer text. Retention 90 days (internal.ask_events_prune).';
create index if not exists ask_events_user_created_idx on internal.ask_events (user_id, created_at desc);
create index if not exists ask_events_created_idx on internal.ask_events (created_at);

-- Atomic consume: +1 for (user, day) only while count < p_limit.
-- Returns remaining after this question (>= 0), or -1 when the limit is reached.
create or replace function internal.ask_consume(p_user uuid, p_limit int, p_day date default ((now() at time zone 'utc')::date))
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  if p_limit is null or p_limit <= 0 then
    return -1;
  end if;
  insert into internal.ask_usage as u (user_id, day, count)
  values (p_user, p_day, 1)
  on conflict (user_id, day) do update
    set count = u.count + 1
    where u.count < p_limit
  returning u.count into v_count;
  if v_count is null then
    return -1;
  end if;
  return p_limit - v_count;
end;
$$;
comment on function internal.ask_consume(uuid, int, date) is 'F11b: atomic rate-limit consume; remaining or -1.';

-- Give a question back (upstream model error). Never below 0.
create or replace function internal.ask_refund(p_user uuid, p_day date default ((now() at time zone 'utc')::date))
returns void
language sql
security invoker
set search_path = ''
as $$
  update internal.ask_usage set count = greatest(count - 1, 0)
  where user_id = p_user and day = p_day;
$$;
comment on function internal.ask_refund(uuid, date) is 'F11b: undo one consume after an upstream error.';

-- Retention (F0.2): ask_events 90 days, ask_usage 7 days. Called by the daily purge cron.
create or replace function internal.ask_prune(p_now timestamptz default now())
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_events int;
begin
  delete from internal.ask_events where created_at < p_now - interval '90 days';
  get diagnostics v_events = row_count;
  delete from internal.ask_usage where day < ((p_now at time zone 'utc')::date - 7);
  return v_events;
end;
$$;
comment on function internal.ask_prune(timestamptz) is 'F11b retention: ask_events > 90 days, ask_usage > 7 days.';

revoke all on table internal.ask_usage from public;
revoke all on table internal.ask_usage from anon, authenticated;
grant all on table internal.ask_usage to postgres, service_role;
revoke all on table internal.ask_events from public;
revoke all on table internal.ask_events from anon, authenticated;
grant all on table internal.ask_events to postgres, service_role;

revoke all on function internal.ask_consume(uuid, int, date) from public, anon, authenticated;
revoke all on function internal.ask_refund(uuid, date) from public, anon, authenticated;
revoke all on function internal.ask_prune(timestamptz) from public, anon, authenticated;
grant execute on function internal.ask_consume(uuid, int, date) to postgres, service_role;
grant execute on function internal.ask_refund(uuid, date) to postgres, service_role;
grant execute on function internal.ask_prune(timestamptz) to postgres, service_role;

alter table internal.ask_usage enable row level security;
alter table internal.ask_events enable row level security;
-- Intentionally no CREATE POLICY (deny-by-default). service_role bypasses RLS.
