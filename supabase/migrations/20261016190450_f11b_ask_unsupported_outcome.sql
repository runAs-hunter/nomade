-- F11b review (Cap, #34): new Ask outcome 'refused_unsupported' (answer stated a
-- number not found in any cited source's summary/title). Metadata only.
-- Apply scope: local + nomade-dev ONLY. not nomade-prod until F11b launch.
alter table internal.ask_events drop constraint if exists ask_events_outcome_check;
alter table internal.ask_events add constraint ask_events_outcome_check
  check (outcome in ('answered','refused_no_source','refused_uncited','refused_unsupported','rate_limited','error'));
