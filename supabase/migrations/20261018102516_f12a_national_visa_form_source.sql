-- F12a: national visa (type D) form source row (gate V1) + needs_review flag (decision 6).
-- Row from docs/sources/F12-visa-form-source.csv (Visa Ops, retrieved 2026-10-18), the NY row
-- that Visa Ops recommends and the walkthrough cites as [F-NY].
-- content_hash = sha256 of the official PDF (73,317 bytes), computed 2026-10-18 from a fresh GET
-- of official_url (HTTP 200, Last-Modified Sun, 12 Nov 2023 12:20:11 GMT); it matches the CSV.
-- The same bytes ship as public/forms/formulario_nazionale_visti2.pdf (src/lib/forms/national-visa.ts).
-- scope: the CSV says `us_post:new_york`; this row deliberately uses `US-consulate:new-york`, the
-- F9 scope prefix every other consulate row uses. Do not "fix" it back to the CSV spelling.
-- Apply scope: local + nomade-dev ONLY. NEVER nomade-prod.

alter table internal.sources
  add column if not exists needs_review boolean not null default false;

comment on column internal.sources.needs_review is
  'F12a: set by the monthly link check when a pinned form PDF hash no longer matches (decision 6). The app hides form prefill until Visa Ops re-verifies and clears it.';

insert into internal.sources
  (id, path_ids, country, title, publisher, official_url, doc_type, scope, retrieved_at, status, notes, content_hash, step_ids)
values
  ('us-new-york-national-visa-form', array['italy_digital_nomad', 'italy_remote_worker']::text[], 'IT',
   'Domanda di visto Nazionale (D) — Consolato Generale d''Italia New York (bilingual IT/EN)',
   'Consolato Generale d''Italia a New York (MAECI)',
   'https://consnewyork.esteri.it/wp-content/uploads/2023/06/formulario_nazionale_visti2.pdf',
   'form', 'US-consulate:new-york', '2026-10-18'::date, 'active',
   'RECOMMENDED for NY packet. Status: current-as-linked (linked today 2026-10-18 from NY ''Visas forms'' page as ''Long term Visa Application Form'' and from us-new-york-dnv item 4). 4 pages, fields 1-37, same numbering as central form. No version date printed on the form; PDF CreationDate 2010-09-14, HTTP Last-Modified 12 Nov 2023. UNCERTAIN whether this is the latest MAECI revision (no form prints a revision). Version date: none printed (PDF created 2010-09-14; served Last-Modified 2023-11-12).',
   'sha256:d0631552d1e474c522911cc74d18c15fe474984ad79bd65ce3f5a880ee13ed20',
   array['submit-application']::text[])
on conflict (id) do nothing;
