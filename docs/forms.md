# F12a Forms library (backend)

Runbook: F12 Forms Library + Appointment-Day Packet, Phase 1 backend (`F12a-forms`). Gate G2 was waived on 18 Oct 2026. Gate V1 applies: the source row ships as a data migration in this PR.

## What ships
- **Source row (gate V1).** `us-new-york-national-visa-form` in `internal.sources` (migration `20261018102516_f12a_national_visa_form_source.sql`). It comes from `docs/sources/F12-visa-form-source.csv` and is mapped to `submit-application`. Its `content_hash` is the sha256 of the official PDF. The migration also adds `internal.sources.needs_review`.
- **Content.** `src/lib/forms/national-visa.ts` holds the content, with `FORMS_CONTENT_VERSION`. It is generated verbatim from `docs/forms/visa-form-walkthrough.md` by `scripts/gen-forms-content.py`.
- **Template.** `public/forms/formulario_nazionale_visti2.pdf` is the official file, byte-for-byte. It has no AcroForm, so iOS draws at anchors.
- **Link check.** `GET|POST /api/cron/check-sources` is extended with the pinned-hash compare (decision 6; see docs/sources.md). Since Cap's 18 Oct decision it is scheduled monthly in `vercel.json` (`0 5 1 * *` UTC), and it can still be triggered by hand.
- **API.** `GET /api/forms` and `GET /api/forms/:formId`, behind `requireAccess` and the active-account check. Both are flagged by `FORMS_ENABLED`, which defaults to off.

## SHA-256 (gate V1)
`d0631552d1e474c522911cc74d18c15fe474984ad79bd65ce3f5a880ee13ed20`, 73,317 bytes.
- **How it was computed:** `curl -sSL` with a browser UA from the `official_url` on 2026-10-18 at 12:17 (Europe/Rome). The response was HTTP 200, `application/pdf`, with `Last-Modified: Sun, 12 Nov 2023 12:20:11 GMT`. The hash came from `sha256sum`.
- **What it matches:** the Visa Ops CSV and both Phase 0 copies.
- **Where tests enforce it:** the repo file, the pin, the migration `content_hash` and the CSV line all have to agree (`src/lib/forms/__tests__/national-visa.test.ts`).

## Locks
- **No new data collection.** The API takes no form input, and form values never reach the server.
- **Consulate variants (Cap, 18 Oct).** Only `?consulate=new-york` gets the NY-headed PDF, template, source card and prefill. Every other post gets the walkthrough labelled "Based on the New York version of the form" plus a link to its own F5 `instructionUrl`, and no PDF. The consulate comes from the query param only; nothing is stored.
- **Cap-approved copy (18 Oct).** The field 29 reminder, the name check (from the 0.3 Jane Sample) and the variant label sit in a marked block in `national-visa.ts`, outside the verbatim walkthrough content.
- **Prefill is device-side and copy-only.** Only fields 1 and 3 are prefilled, from the account name. Field 29 gets a margin reminder of the F11a arrival month, never a value. No field takes the consulate.
- **No prefill on ambiguous fields.** These are the fields that carry the lock sentence.
- **Byte-exact strings:** the disclaimer `Preliminary guidance — not legal advice` and the translation label.
- **Logs** carry ids, counts, `access` and `needsReview` only.
- **Database:** nomade-dev only. Never nomade-prod.

## Rev 2 changes (since rev 1)
- **New query param `?consulate=<postId>`** on both endpoints. It takes the F5 US post ids, the same values the app already sends to `/api/ask` as `consulatePostId`: `washington`, `boston`, `chicago`, `detroit`, `houston`, `los-angeles`, `miami`, `new-york`, `philadelphia`, `san-francisco`.
  - The server stores no consulate; it stays on the device (F9 lock).
  - Omitted or empty means unknown, which is treated like a non-NY post.
  - An unknown id → `400 BAD_REQUEST`.
- **NY only gets the PDF.** Only `consulate=new-york` gets `source`, `template`, field `prefill`/`prefillPart`/`anchor`, and `references["F-NY"].url`. Every other post (and unknown) gets:
  - `template: null`, `source: null`;
  - every field with `prefill: null`, `prefillPart: null`, `anchor: null`;
  - `references["F-NY"].url: null`;
  - `prefill.available: false` with `reason: "consulate"`.
- **New detail keys:**
  - `variant { postId: "new-york", matchesConsulate, label }`. `label` is exactly `"Based on the New York version of the form"` when `matchesConsulate` is false, else null.
  - `consulate { postId, officialUrl, host } | null`. `officialUrl` is the F5 post's `instructionUrl` from `src/lib/journey/consulates.ts`.
  - `copy { nameCheck, arrivalReminder, arrivalMonthPlaceholder }` (Cap-approved, 18 Oct).
- **`prefill`** is now `{ available, reason: null | "consulate" | "needs_review", staleNotice }`. `staleNotice` is set only for New York with `needs_review`.
- **List items** gain `variant` and `pdfAvailable`. `pdfAvailable` is true only for New York with an active row.
- **Unchanged:** `reminder: "arrivalMonth"` stays on field 29 for every consulate.
`FORMS_CONTENT_VERSION = "visa-ops-national-visa-2026-10-18"`.

## Common
- Auth: `Authorization: Bearer <Supabase access token>`, the same as `/api/journey/*`. Active accounts only.
- Flag: `FORMS_ENABLED` (server env, default **off**). Off → `404 FORMS_DISABLED` (auth is checked first, so no token → 401).
- Errors use the F1.8 envelope: `{ "error": { "code", "message", "requestId" } }`, plus an `x-request-id` header.
  - `401 UNAUTHENTICATED`: missing token, bad token, or bootstrap required.
  - `403 ACCOUNT_PENDING_DELETION`
  - `410 ACCOUNT_DELETED`
  - `404 FORMS_DISABLED`
  - `404 NOT_FOUND`: unknown `formId`.
  - `400 BAD_REQUEST`: `consulate` is not a known US post id.
  - `503 FORM_SOURCE_UNAVAILABLE`: the gate V1 source row is missing or not `active`. Show no form.
  - `500 INTERNAL_ERROR`
- The server never receives or stores form values. All filling happens on the device (decision 2).
- Strings may contain light Markdown (`**bold**`) and citation markers `[F-NY]`, `[F-C]`, `[NY-DNV]`. Resolve markers through `references`.

## GET /api/forms?consulate=<postId> → 200
```json
{
  "forms": [{
    "formId": "national-visa",
    "title": "Domanda di visto Nazionale (D) — Consolato Generale d'Italia New York (bilingual IT/EN)",
    "stepId": "submit-application",
    "sourceId": "us-new-york-national-visa-form",
    "scope": "US-consulate:new-york",
    "contentVersion": "visa-ops-national-visa-2026-10-18",
    "available": true,
    "needsReview": false,
    "variant": { "postId": "new-york", "matchesConsulate": true, "label": null },
    "pdfAvailable": true                     // false unless consulate=new-york and the row is active
  }],
  "disclaimer": "Preliminary guidance — not legal advice",
  "requestId": "…"
}
```
- `available: false` means the source row is missing or not active. Hide the entry.
- `title` comes from the source row. It is `null` when unavailable.

## GET /api/forms/national-visa?consulate=<postId> → 200

The example below is for `consulate=new-york`. Non-NY differences are listed after it.
```jsonc
{
  "formId": "national-visa",
  "contentVersion": "visa-ops-national-visa-2026-10-18",
  "stepId": "submit-application",            // decision 4: "Form" row on this step
  "disclaimer": "Preliminary guidance — not legal advice",                      // byte-exact
  "translationLabel": "English translation — for understanding only. Submit the Italian original.", // byte-exact; top of translation + every page
  "lockSentence": "This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
  "variant": { "postId": "new-york", "matchesConsulate": true, "label": null },
  "consulate": { "postId": "new-york",
                 "officialUrl": "https://consnewyork.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/",
                 "host": "consnewyork.esteri.it" },              // null when no consulate param
  "copy": {                                  // Cap-approved 18 Oct (not from the walkthrough)
    "nameCheck": "Check the names in fields 1 and 3 against your passport: the form asks for them as listed in your travel document (note x).",
    "arrivalReminder": "Your target arrival: <month>. Enter the exact date.",
    "arrivalMonthPlaceholder": "<month>"     // replace with the F11a target month, e.g. "March 2027"
  },
  "source": {                                // official NY form card (internal.sources row); null for non-NY
    "id": "us-new-york-national-visa-form",
    "title": "…", "publisher": "Consolato Generale d'Italia a New York (MAECI)",
    "url": "https://consnewyork.esteri.it/wp-content/uploads/2023/06/formulario_nazionale_visti2.pdf",
    "host": "consnewyork.esteri.it",
    "retrievedAt": "2026-10-18",              // "Last verified"
    "scope": "US-consulate:new-york",
    "docType": "form",
    "versionDate": null,                      // the form prints no version date
    "versionNote": "none printed (PDF created 2010-09-14; served Last-Modified 2023-11-12)",
    "needsReview": false                      // decision 6 (monthly hash check)
  },
  "template": {                               // the official PDF, byte-for-byte, served by us; null for non-NY
    "url": "https://<api-host>/forms/formulario_nazionale_visti2.pdf",   // public static file, no auth
    "sha256": "d0631552d1e474c522911cc74d18c15fe474984ad79bd65ce3f5a880ee13ed20", // verify after download
    "bytes": 73317, "pages": 4,
    "pageSize": { "width": 612, "height": 792 },  // PDF points, US Letter
    "hasAcroForm": false                       // no widgets → draw text at anchors
  },
  "intro": { "title": "…", "text": "…", "labelsNote": "…", "translationNote": "…" },
  "sections": [ { "id": "header|photo|admin-space|note-x|signature|declarations|page4-annotazioni",
                  "page": 1, "text": "…", "items": ["…"], "refs": ["F-NY"], "sourceIds": ["…"] } ],
  "fields": [ {
    "fieldId": "1", "number": 1, "page": 1,
    "labelIt": "Cognome (x)", "labelEn": "Surname",
    "asks": "Your surname, as shown in the travel document (note x). [F-NY]",
    "marker": "phase1-prefill",              // phase1-prefill | copy-only | never-prefill
    "markerReason": "…",
    "ambiguous": false,                      // true → asks contains lockSentence; never prefilled
    "prefill": "accountName",                // accountName | null  (only fields 1 and 3)
    "prefillPart": "familyName",             // field 1 familyName, field 3 givenName, else null
    "reminder": null,                        // "arrivalMonth" on field 29 only: margin reminder, NOT a value
    "anchor": { "page": 1, "x": 60, "baselineTop": 157, "fontSize": 9 },  // top-left origin, points
    "sourceIds": ["us-new-york-national-visa-form"],
    "refs": ["F-NY"]
  } ],                                        // 37 fields, 1..37
  "stamps": { "title": "Fees and stamps printed on the form", "items": ["…", "…"] },
  "references": {
    "F-NY":   { "sourceId": "us-new-york-national-visa-form", "label": "…", "url": "…", "sha256": "…" },
    "F-C":    { "sourceId": null, "label": "…", "url": "…", "sha256": "…" },    // reference copy, no active row
    "NY-DNV": { "sourceId": "us-new-york-dnv", "label": "…", "url": "…" }
  },
  "prefill": { "available": true, "reason": null, "staleNotice": null },  // reason: null | "consulate" | "needs_review"
  "access": "free",                            // for the PRE-FILLED PDF only: "paid" → open PaywallView (F10)
  "entitlement": { "journeyFull": false, "gateEnabled": false },   // same shape as checklist; may add "unavailable": true
  "requestId": "…"
}
```

### Non-NY consulate (or no `consulate` param)
```jsonc
{
  "variant": { "postId": "new-york", "matchesConsulate": false, "label": "Based on the New York version of the form" },
  "consulate": { "postId": "chicago", "officialUrl": "https://conschicago.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/how-to-schedule-an-appointment/", "host": "conschicago.esteri.it" },  // null if no param
  "source": null,
  "template": null,
  "fields": [ { "…": "same copy", "prefill": null, "prefillPart": null, "anchor": null, "reminder": "arrivalMonth on 29 only" } ],
  "references": { "F-NY": { "sourceId": "us-new-york-national-visa-form", "label": "…", "url": null }, "F-C": { "…": "…" }, "NY-DNV": { "…": "…" } },
  "prefill": { "available": false, "reason": "consulate", "staleNotice": null },
  "copy": { "…": "same as NY" }
  // the walkthrough, translation, sections, stamps, disclaimer, access and entitlement are unchanged
}
```

### Rules for iOS
- **Send the consulate:** always send `?consulate=<the device's post id>`. Omit it when the post is unresolved.
- **Non-NY users:** when `variant.matchesConsulate == false`, show `variant.label` above the walkthrough. Show a link to `consulate.officialUrl` (when present) as the user's own consulate page, and show no PDF and no pre-fill button. Never cache the NY template for a non-NY user.
- **Name check:** show `copy.nameCheck` beside fields 1 and 3 when they are pre-filled.
- **Field 29:** draw `copy.arrivalReminder` with `<month>` replaced by the target month.
- **Free content:** the official document card, walkthrough, translation and stamps explainer are always free, whatever `access` says.
- **`access` covers only the pre-filled PDF.** It is `"paid"` exactly when `entitlement.gateEnabled && !entitlement.journeyFull`. Paid → the PDF button opens the paywall.
- **Stale form:** when `prefill.reason == "needs_review"`, hide the pre-fill button and show `prefill.staleNotice`, which is "This form may have changed — check the official link". `staleNotice` is null otherwise.
- **Which fields to fill:** only fields where `prefill == "accountName"`, that is, fields 1 and 3. Copy the name exactly as the user entered it on the device: `familyName` → field 1, `givenName` → field 3. If the user gave no name, leave the field empty.
- **Field 29:** `reminder: "arrivalMonth"` with `anchor { page: 2, x: 3, top: 266, width: 44 }`. Draw a margin note with the F11a target month (`checklist.intake` `arrivalMonth`), outside the form frame, which starts at x = 51. **Never write into field 29.**
- **Everything else stays blank**, including the consulate: no field takes it, and the NY header already prints it.
- **Coordinates** are PDF points with a top-left origin. PDFKit uses bottom-left, so `y = 792 - baselineTop`. The anchors come from the Cap-reviewed 0.3 Jane Sample, at size 9.
- **Template check:** verify the downloaded template against `template.sha256`. On a mismatch, don't fill it.
- **Show the disclaimer** on the page and in the PDF footer. Show `translationLabel` at the top of the English view and on every translated page.
- **No logging:** never log names or form values.
