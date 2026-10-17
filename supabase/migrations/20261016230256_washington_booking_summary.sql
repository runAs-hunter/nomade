-- Visa Ops: updated summary for us-washington-visa-booking (adds the verbatim
-- appointment-confirmation sentence), 2026-10-17.
-- GENERATED from docs/sources/F11-source-summaries.csv (only this row's summary changed).
-- Summary text only: status, step_ids, URLs untouched (no pinning).
-- Apply scope: local + nomade-dev ONLY. not nomade-prod.
update internal.sources
  set summary = 'Washington Embassy page on booking visa appointments (last updated 9 June 2026). Elective-residence and digital nomad / remote worker applicants must email visti.washington@esteri.it before booking. In general, appointments are booked on Prenot@Mi, up to 6 months in advance and no later than 15 days before the intended departure. The office may cancel appointments booked by residents of other consular jurisdictions. On confirmation it says verbatim: ''You must remember to CONFIRM your appointment at least 10 days before, but NO LATER than 3 days from your scheduled departure date, through the Prenot@Mi website.'' The page leaves the window ambiguous. If cancelled, a new appointment must be booked, which may delay departure.',
      summary_reviewed_at = '2026-10-16'::date,
      summary_uncertain = false
  where id = 'us-washington-visa-booking';
