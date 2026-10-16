-- F11b: Visa Ops summary for us-houston-dnv-checklist-2026-docx (2026-10-16).
-- GENERATED from docs/sources/F11-source-summaries.csv (34 rows; only this row changed).
-- Summary text only: status, step_ids, URLs untouched (no pinning).
-- Apply scope: local + nomade-dev ONLY. not nomade-prod until F11b launch.
update internal.sources
  set summary = 'Houston consulate checklist document (DIGITAL-NOMAD-Checklist-2026.docx, uploaded 2026/07). It lists: national visa form signed before a visa officer; fee by USPS money order only; passport valid 15 months past travel with two blank pages; driver''s license or state ID for jurisdiction; photo; health insurance certificate or affidavit; proof of qualifying profession; a lease, rental contract, or deed in the applicant''s name for the whole visa, registered if leased, hotel or hospitality not accepted; income of at least three times the healthcare-exemption minimum, stated as no less than 30,000 euros ''at the time of this writing in 2026''; six months'' experience; a confirmed flight itinerary. Remote workers add a contract and employer declaration. No police certificate is listed.',
      summary_reviewed_at = '2026-10-16'::date,
      summary_uncertain = false
  where id = 'us-houston-dnv-checklist-2026-docx';
