# Waitlist CTA samples (private)

Studio's SAMPLE-watermarked files for the F12 Phase 0 CTA cards (task 0.5).
Files here are **not** under `public/`, so they have no static URL. They are
served only by `GET /api/waitlist/sample/<source>/<file>` to a browser holding
the signed signup cookie for that source (set by `POST /api/waitlist` with
`signup_source`). The thank-you page `/waitlist/thanks?source=<source>` links
them.

Expected files (names must match `CTA_SAMPLES` in `src/lib/waitlist/cta.ts`):

| Source | File | Studio original |
|---|---|---|
| forms_prefill | `0.3-jane-sample-national-visa-form-SAMPLE.pdf` | `out/0.3-jane-sample-national-visa-form-SAMPLE.pdf` |
| forms_prefill | `0.3-jane-sample-p-1.png` | `out/png/0.3-jane-sample-p-1.png` |
| appointment_packet | `0.4-ny-appointment-packet-SAMPLE.pdf` | `out/0.4-ny-appointment-packet-SAMPLE.pdf` |
| appointment_packet | `0.4-ny-packet-p-1.png` | `out/png/0.4-ny-packet-p-1.png` |

Public landing-card previews live in `public/waitlist/preview/`:

| Source | File | Studio original |
|---|---|---|
| forms_prefill | `forms_prefill-preview.png` | `out/png/0.2-forms-desktop-hero-1200x630.png` |
| appointment_packet | `appointment_packet-preview.png` | `out/png/0.4-ny-packet-p-1.png` |

A missing file is skipped (no image / no link), never an error.
