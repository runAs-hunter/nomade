/**
 * F12a — national visa (type D) application form: content for GET /api/forms/national-visa.
 *
 * GENERATED from docs/forms/visa-form-walkthrough.md (Visa Ops, Cap-approved
 * prefill markers 2026-10-18) by scripts/gen-forms-content.py. Do not hand-edit
 * copy: every walkthrough string is verbatim (national-visa.test.ts re-reads the
 * markdown). The only other copy is the marked "Cap-approved 18 Oct" block. Explains what each field ASKS FOR, never what to
 * put. Not legal advice. Form values never reach the server (decision 2).
 */

/** Bumped whenever the served copy changes. "-2": Visa Ops sign-off wording; "-3": Visa Ops [NY-DNV] citation reworded (18 Oct 2026). */
export const FORMS_CONTENT_VERSION = "visa-ops-national-visa-2026-10-18-3";

export const NATIONAL_VISA_FORM_ID = "national-visa";

/** Gate V1 source row (internal.sources) for the template PDF. */
export const NATIONAL_VISA_SOURCE_ID = "us-new-york-national-visa-form";

/** Template PDF served from /public (official file, byte-for-byte). */
export const NATIONAL_VISA_TEMPLATE = {
  path: "/forms/formulario_nazionale_visti2.pdf",
  officialUrl: "https://consnewyork.esteri.it/wp-content/uploads/2023/06/formulario_nazionale_visti2.pdf",
  sha256: "d0631552d1e474c522911cc74d18c15fe474984ad79bd65ce3f5a880ee13ed20",
  bytes: 73317,
  pages: 4,
  /** PDF points (US Letter). Anchors use a top-left origin (pdfplumber "top"). */
  pageSize: { width: 612, height: 792 },
  /** No AcroForm widgets: iOS draws text at `anchor` coordinates (decision 2). */
  hasAcroForm: false,
} as const;

/** CSV `version_date` (docs/sources/F12-visa-form-source.csv): the form prints none. */
export const NATIONAL_VISA_VERSION = {
  versionDate: null,
  versionNote: "none printed (PDF created 2010-09-14; served Last-Modified 2023-11-12)",
} as const;

/** Byte-for-byte (Cap lock). */
export const FORMS_TRANSLATION_LABEL = "English translation — for understanding only. Submit the Italian original.";

/** Byte-for-byte (Cap lock): used on every ambiguous field. */
export const FORMS_LOCK_SENTENCE = "This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.";

/** Runbook decision 6: shown when the source row needs review; prefill hidden. */
export const FORMS_STALE_NOTICE = "This form may have changed — check the official link";

// ---------------------------------------------------------------------------
// Cap-approved copy, 18 Oct 2026. NOT from the Visa Ops walkthrough; kept out
// of the verbatim walkthrough content below.
// ---------------------------------------------------------------------------

/** The form variant this content and template describe (consulate post id). */
export const NATIONAL_VISA_VARIANT_POST_ID = "new-york";

/** Cap-approved 18 Oct: label on the walkthrough for every non-New York consulate. */
export const FORMS_NY_VARIANT_LABEL = "Based on the New York version of the form";

/** Cap-approved 18 Oct: field 29 margin reminder. iOS replaces `<month>` with the F11a target month. */
export const FORMS_ARRIVAL_REMINDER = "Your target arrival: <month>. Enter the exact date.";
export const FORMS_ARRIVAL_MONTH_PLACEHOLDER = "<month>";

/**
 * Cap-approved 18 Oct: name check for fields 1 and 3. Verbatim from the F12
 * Phase 0.3 Jane Sample (its `NAMES_NOTE`, printed in the sample PDF footer).
 */
export const FORMS_NAME_CHECK_NOTE =
  "Check the names in fields 1 and 3 against your passport: the form asks for them as listed in your travel document (note x).";

// ---------------------------------------------------------------------------
// Verbatim Visa Ops walkthrough content (generated) below.
// ---------------------------------------------------------------------------

export type FormRef = "F-NY" | "F-C" | "NY-DNV";
/** Decision 7: only the account name is ever copied into a field (arrival month and consulate never are). */
export type PrefillKind = "accountName";
export type FieldMarker = "phase1-prefill" | "copy-only" | "never-prefill";

export type FormField = {
  fieldId: string;
  number: number;
  page: number;
  labelIt: string;
  labelEn: string;
  /** What the field asks for (verbatim, may contain [F-NY]/[F-C]/[NY-DNV] markers). */
  asks: string;
  marker: FieldMarker;
  /** Walkthrough marker reason, internal notes ("Flagged for Cap.", "(Cap 2026-10-18)") stripped. */
  markerReason: string;
  /** Carries the lock sentence. Never prefilled. */
  ambiguous: boolean;
  /** Device-side copy-only prefill source; null = the user fills it by hand. */
  prefill: PrefillKind | null;
  /** Which part of the account name (fields 1 and 3 only). */
  prefillPart: "familyName" | "givenName" | null;
  /** Margin reminder only, never a value (field 29: target arrival month). */
  reminder: "arrivalMonth" | null;
  anchor:
    | { page: number; x: number; baselineTop: number; fontSize: number }
    | { page: number; x: number; top: number; width: number }
    | null;
  sourceIds: string[];
  refs: FormRef[];
};

export type FormSection = {
  id: string;
  page: number;
  text: string;
  items?: string[];
  refs: FormRef[];
  sourceIds: string[];
};

export type FormReference = {
  sourceId: string | null;
  label: string;
  url: string;
  sha256?: string;
};

/** Walkthrough "Sources" table. F-C is a reference copy, not an active source row. */
export const NATIONAL_VISA_REFERENCES: Record<FormRef, FormReference> = {
  "F-NY": {
    sourceId: NATIONAL_VISA_SOURCE_ID,
    label: "\"Domanda di visto Nazionale (D)\" with the \"Consolato Generale d'Italia New York\" header. Bilingual IT/EN, 4 pages. Linked on 2026-10-18 from the NY \"Visas forms\" page as \"Long term Visa Application Form\"",
    url: "https://consnewyork.esteri.it/wp-content/uploads/2023/06/formulario_nazionale_visti2.pdf",
    sha256: "d0631552d1e474c522911cc74d18c15fe474984ad79bd65ce3f5a880ee13ed20",
  },
  "F-C": {
    sourceId: null,
    label: "\"Domanda di visto Nazionale (D) — Modulo gratuito\", central MAECI copy. Italian only, 4 pages",
    url: "https://vistoperitalia.esteri.it/files/public/moduli/it/Formulario_Visto_Nazionale.pdf",
    sha256: "d1d61879b3df549fad0ea0c756a2357c28b3e88d91149a0e82dfb6535f27a880",
  },
  "NY-DNV": {
    sourceId: "us-new-york-dnv",
    label: "Consulate General of Italy in New York: Digital Nomad / Remote Worker visa page",
    url: "https://consnewyork.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/visas-to-enter-italy/digital-nomad-remote-worker-visa/",
  },
};

export const NATIONAL_VISA_INTRO = {
  "title": "What this is (and isn't)",
  "text": "This walkthrough says what each field on the form **asks for**. It does not say what to put in any field. Nomade does not choose a visa type box, a purpose of stay, or anything about eligibility for you.",
  "labelsNote": "**How the labels are shown.** Each field gives the Italian label as printed on the form, then an English translation. Where [F-NY] prints its own English, the translation quotes that English.",
  "translationNote": "The Italian text on the form is the original, and it is the version that gets submitted. The English is only there to help you understand it."
} as const;

export const NATIONAL_VISA_SECTIONS: FormSection[] = [
  {
    "id": "header",
    "page": 1,
    "text": "**Header.** \"Domanda di visto Nazionale (D)\" means National visa (D) application. [F-C] also prints \"Modulo gratuito\" (free form). [F-C]",
    "refs": [
      "F-C"
    ],
    "sourceIds": []
  },
  {
    "id": "photo",
    "page": 1,
    "text": "**FOTOGRAFIA** (Photograph). The form has a photo box at the top. [F-C][F-NY] The form does not print any photo specifications. The NY post states: \"One recent, ICAO standard photograph: 40mm (1.57 inch) tall and 35mm (1.37 inch) wide, full face, front view, color photograph of yourself. The photograph must be glued to the top of the form where indicated.\" [NY-DNV] This applies to NY applicants only. Other posts may state their own rules.",
    "refs": [
      "F-C",
      "F-NY",
      "NY-DNV"
    ],
    "sourceIds": [
      "us-new-york-national-visa-form",
      "us-new-york-dnv"
    ]
  },
  {
    "id": "admin-space",
    "page": 1,
    "text": "**Spazio riservato all'amministrazione** (Space reserved for the administration). This right-hand column covers the application date and number, where the application was lodged, who handled it, supporting documents, the visa decision, and the visa type, validity and number of entries. It is for office use. [F-C][F-NY]",
    "refs": [
      "F-C",
      "F-NY"
    ],
    "sourceIds": [
      "us-new-york-national-visa-form"
    ]
  },
  {
    "id": "note-x",
    "page": 1,
    "text": "**Note (x).** \"Alle caselle da 1 a 3 le informazioni vanno inserite come indicate nel documento di viaggio.\" In English: \"Questions 1 through 3 must be completed according to the information listed in the travel document.\" [F-NY]",
    "refs": [
      "F-NY"
    ],
    "sourceIds": [
      "us-new-york-national-visa-form"
    ]
  },
  {
    "id": "signature",
    "page": 3,
    "text": "**Signature, as stated by the sources.** The form has a signature line at field 37. Page 4 has a second \"Luogo e data / Firma\" line, under the office-use ANNOTAZIONI area. [F-NY][F-C] The NY post asks for the form \"completely and clearly filled out, and signed by the applicant.\" [NY-DNV] Neither the form nor the NY page says whether both lines must be signed. This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    "refs": [
      "F-NY",
      "F-C",
      "NY-DNV"
    ],
    "sourceIds": [
      "us-new-york-national-visa-form",
      "us-new-york-dnv"
    ]
  },
  {
    "id": "declarations",
    "page": 3,
    "text": "**Declarations printed above the signature.** The English here is the English printed on [F-NY]. It is shown only so you understand what you are signing.",
    "items": [
      "\"Sono a conoscenza del fatto che il rifiuto del visto non dà luogo al rimborso dei diritti pagati…\" In English: \"I am aware that the visa fee is not refunded if the visa is refused.\" [F-NY]",
      "Data consent. You accept that the data on the form, your photo and (if applicable) your fingerprints are mandatory for examining the application. You also accept that they will be passed to and processed by the competent Italian authorities, and may be accessible to the other authorities named on the form, including Schengen authorities and Europol. [F-NY]",
      "Your right to obtain notification of the data recorded about you, and to have it corrected or deleted. The competent data authority named is the \"Garante per la Protezione dei Dati Personali\". [F-NY]",
      "\"Dichiaro che tutti i dati da me forniti sono completi ed esatti…\" In English: \"I declare that to the best of my knowledge all the information supplied by me is correct and complete.\" False statements lead to rejection or annulment and may lead to prosecution \"(articolo 331 c.p.p.)\". [F-NY]",
      "Being granted a visa does not entitle you to compensation if you are refused entry for failing to meet art. 5(1) of Reg. (EC) 562/2006 (Schengen Borders Code) and art. 4 of D.Lgs. 286/98. [F-NY]"
    ],
    "refs": [
      "F-NY"
    ],
    "sourceIds": [
      "us-new-york-national-visa-form"
    ]
  },
  {
    "id": "page4-annotazioni",
    "page": 4,
    "text": "**ANNOTAZIONI (riservato all'Ufficio)** (Notes, for office use only). These ruled lines are for the office. [F-NY] Below them are \"Luogo e data / Firma (per i minori, firma del titolare della potestà genitoriale/tutore legale)\" (Place and date / Signature, for minors the parent or legal guardian). [F-NY][F-C]",
    "refs": [
      "F-NY",
      "F-C"
    ],
    "sourceIds": [
      "us-new-york-national-visa-form"
    ]
  }
];

export const NATIONAL_VISA_STAMPS = {
  "title": "Fees and stamps printed on the form",
  "items": [
    "[F-C] prints \"Modulo gratuito\" (the form itself is free). [F-C]",
    "**Marca da bollo / revenue stamp:** no cited source requires one for US applicants. Neither form mentions one, nor do the NY pages read on 2026-10-18 or any active Nomade source row (all were searched for \"bollo\", \"marca\" and \"revenue stamp\" on 2026-10-18)."
  ]
} as const;

export const NATIONAL_VISA_FIELDS: FormField[] = [
  {
    "fieldId": "1",
    "number": 1,
    "page": 1,
    "labelIt": "Cognome (x)",
    "labelEn": "Surname",
    "asks": "Your surname, as shown in the travel document (note x). [F-NY]",
    "marker": "phase1-prefill",
    "markerReason": "Asks for the surname (Phase 1 \"name\"). Note (x) says to use the travel document version, so the user checks it.",
    "ambiguous": false,
    "prefill": "accountName",
    "prefillPart": "familyName",
    "reminder": null,
    "anchor": {
      "page": 1,
      "x": 60,
      "baselineTop": 157,
      "fontSize": 9
    },
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "2",
    "number": 2,
    "page": 1,
    "labelIt": "Cognome alla nascita (cognome/i precedente/i) (x)",
    "labelEn": "Surname at birth (former family name(s))",
    "asks": "Your surname at birth or any former surname(s), as shown in the travel document (note x). [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the surname at birth or former surnames, from the travel document (note x). This is not Phase 1 \"name\".",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "3",
    "number": 3,
    "page": 1,
    "labelIt": "Nome/i (x)",
    "labelEn": "First names (given name(s))",
    "asks": "Your given name(s), as shown in the travel document (note x). [F-NY]",
    "marker": "phase1-prefill",
    "markerReason": "Asks for the given name(s) (Phase 1 \"name\"). Note (x) says to use the travel document version, so the user checks it.",
    "ambiguous": false,
    "prefill": "accountName",
    "prefillPart": "givenName",
    "reminder": null,
    "anchor": {
      "page": 1,
      "x": 60,
      "baselineTop": 208,
      "fontSize": 9
    },
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "4",
    "number": 4,
    "page": 1,
    "labelIt": "Data di nascita (giorno-mese-anno)",
    "labelEn": "Date of birth (day/month/year)",
    "asks": "Your date of birth, in the day-month-year order printed on the form. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the date of birth, a personal detail.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "5",
    "number": 5,
    "page": 1,
    "labelIt": "Luogo di nascita",
    "labelEn": "Place of birth",
    "asks": "Your place of birth. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the place of birth, a personal detail.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "6",
    "number": 6,
    "page": 1,
    "labelIt": "Stato di nascita",
    "labelEn": "Country of birth",
    "asks": "Your country of birth. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the country of birth, a personal detail.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "7",
    "number": 7,
    "page": 1,
    "labelIt": "Cittadinanza attuale / Cittadinanza alla nascita, se diversa",
    "labelEn": "Current nationality / Nationality at birth, if different",
    "asks": "Your current nationality, and your nationality at birth if it was different. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the current nationality and the nationality at birth, personal details.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "8",
    "number": 8,
    "page": 1,
    "labelIt": "Sesso: Maschile / Femminile",
    "labelEn": "Sex: Male / Female",
    "asks": "A tick box for sex, with the two options printed. [F-NY]",
    "marker": "copy-only",
    "markerReason": "A tick box for sex, a personal detail. It is not name, arrival month or consulate.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "9",
    "number": 9,
    "page": 1,
    "labelIt": "Stato civile: Non coniugato/a, Coniugato/a, Separato/a, Divorziato/a, Vedovo/a, Altro (precisare)",
    "labelEn": "Marital status: single, married, separated, divorced, widow(er), other (please specify)",
    "asks": "A tick box for marital status, with the options printed. \"Altro\" asks you to specify. [F-NY]",
    "marker": "copy-only",
    "markerReason": "A tick box for marital status, a personal detail. It is not name, arrival month or consulate, so no Phase 1 prefill.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "10",
    "number": 10,
    "page": 1,
    "labelIt": "Per i minori: cognome, nome, indirizzo (se diverso da quello del richiedente) e cittadinanza del titolare della potestà genitoriale/tutore legale",
    "labelEn": "In case of minors: surname, first name, address (if different from the applicant's) and nationality of parental authority/legal guardian",
    "asks": "For a minor applicant only: the parent's or legal guardian's surname, first name, address (if different) and nationality. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the parent or guardian details of a minor applicant.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "11",
    "number": 11,
    "page": 1,
    "labelIt": "Numero d'identità nazionale, ove applicabile",
    "labelEn": "National identity number, where applicable",
    "asks": "A national identity number, \"where applicable\". [F-NY] The form does not say when it applies. This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    "marker": "never-prefill",
    "markerReason": "The label says \"where applicable\", and the field carries the lock sentence.",
    "ambiguous": true,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "12",
    "number": 12,
    "page": 1,
    "labelIt": "Tipo di documento: Passaporto ordinario / diplomatico / di servizio / ufficiale / speciale; Documento di viaggio di altro tipo (precisare)",
    "labelEn": "Type of passport: ordinary / diplomatic / service / official / special passport; other travel document (please specify)",
    "asks": "A tick box for the type of travel document. For \"other\", the form asks you to specify. [F-NY]",
    "marker": "copy-only",
    "markerReason": "A tick box for the type of travel document (ordinary, diplomatic, etc.), as shown on the user's own document.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "13",
    "number": 13,
    "page": 1,
    "labelIt": "Numero del documento di viaggio",
    "labelEn": "Number of travel document",
    "asks": "The travel document's number. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the travel document number.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "14",
    "number": 14,
    "page": 1,
    "labelIt": "Data di rilascio",
    "labelEn": "Date of issue",
    "asks": "The date the travel document was issued. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the travel document's issue date.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "15",
    "number": 15,
    "page": 1,
    "labelIt": "Valido fino al",
    "labelEn": "Valid until",
    "asks": "The travel document's expiry date. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the travel document's expiry date.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "16",
    "number": 16,
    "page": 1,
    "labelIt": "Rilasciato da",
    "labelEn": "Issued by",
    "asks": "The authority that issued the travel document. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the travel document's issuing authority.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "17",
    "number": 17,
    "page": 1,
    "labelIt": "Indirizzo del domicilio e indirizzo di posta elettronica del richiedente; Numero/i di telefono",
    "labelEn": "Applicant's home address and e-mail address; Telephone number(s)",
    "asks": "Your home address, e-mail address and telephone number(s). [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the applicant's own address, e-mail and phone.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "18",
    "number": 18,
    "page": 1,
    "labelIt": "Residenza in un paese diverso dal paese di cittadinanza attuale: No / Sì. Titolo di soggiorno o equivalente n. … Valido fino al",
    "labelEn": "Residence in a country other than the country of current nationality: No / Yes, residence permit or equivalent no. … valid until",
    "asks": "Whether you reside in a country other than your country of nationality. If yes, it asks for the residence permit (or equivalent) number and its expiry date. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks yes/no about residence outside the country of nationality, plus permit details. It is not name, arrival month or consulate, so no Phase 1 prefill.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "19",
    "number": 19,
    "page": 1,
    "labelIt": "Occupazione attuale",
    "labelEn": "Current occupation",
    "asks": "Your current occupation. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the current occupation. It is not name, arrival month or consulate, so no Phase 1 prefill.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "20",
    "number": 20,
    "page": 1,
    "labelIt": "Datore di lavoro, indirizzo e numero di telefono. Per gli studenti nome e indirizzo dell'istituto di insegnamento",
    "labelEn": "Employer and employer's address and telephone number. For students, name and address of school",
    "asks": "The employer's name, address and phone number, or the school's for students. [F-NY] The form gives no instruction for applicants without an employer (for example, self-employed people). This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    "marker": "never-prefill",
    "markerReason": "Carries the lock sentence.",
    "ambiguous": true,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "21",
    "number": 21,
    "page": 1,
    "labelIt": "Scopo del viaggio: Ricongiungimento Familiare/Familiare al Seguito; Motivi Religiosi; Sport; Missione; Diplomatico; Cure Mediche; Studio; Adozione; Lavoro subordinato; Lavoro autonomo; Di altro tipo (precisare)",
    "labelEn": "Main purpose(s) of the journey: family reunion visa; religious reasons; sport; mission; diplomatic; medical reasons; study; adoption; subordinate work; self-employment; other (please specify)",
    "asks": "A tick box for the main purpose of the journey. These are the only options printed. Neither form has a \"digital nomad\" or \"remote worker\" option. [F-NY][F-C] Nomade does not pick this box. This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    "marker": "never-prefill",
    "markerReason": "The purpose-of-journey box is a legal choice. Never prefilled.",
    "ambiguous": true,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY",
      "F-C"
    ]
  },
  {
    "fieldId": "22",
    "number": 22,
    "page": 2,
    "labelIt": "Città di destinazione",
    "labelEn": "City of destination",
    "asks": "Your destination city. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the destination city. It is not name, arrival month or consulate, so no Phase 1 prefill.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "23",
    "number": 23,
    "page": 2,
    "labelIt": "Eventuale Stato membro di primo ingresso",
    "labelEn": "Member State of first entry (if applicable)",
    "asks": "The Schengen member state where you will first enter, if applicable. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for the Schengen state of first entry, if applicable.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "24",
    "number": 24,
    "page": 2,
    "labelIt": "Numero di ingressi richiesti: Uno / Due / Multipli",
    "labelEn": "Number of entries: one / two / multiple",
    "asks": "The number of entries requested. [F-NY] This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    "marker": "never-prefill",
    "markerReason": "Carries the lock sentence.",
    "ambiguous": true,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "25",
    "number": 25,
    "page": 2,
    "labelIt": "Durata del soggiorno. Indicare il numero dei giorni (max. 365gg.)",
    "labelEn": "Duration of the intended stay (maximum 365 days)",
    "asks": "The intended length of stay, in days. The form prints a 365-day maximum. [F-NY] This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    "marker": "never-prefill",
    "markerReason": "Carries the lock sentence.",
    "ambiguous": true,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "26",
    "number": 26,
    "page": 2,
    "labelIt": "Visti Schengen rilasciati negli ultimi tre anni: No / Sì. Data/e di validità dal … al",
    "labelEn": "Schengen visas issued during the past three years: No / Yes, date of validity from … to",
    "asks": "Whether you were issued Schengen visas in the past three years. If yes, it asks for their validity dates. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks about Schengen visas from the past three years and their dates. It is not name, arrival month or consulate, so no Phase 1 prefill.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "27",
    "number": 27,
    "page": 2,
    "labelIt": "Impronte digitali rilevate in precedenza ai fini della presentazione di una domanda di visto Schengen: No / Sì, Data, se nota",
    "labelEn": "Fingerprints collected previously for the purpose of applying for a Schengen visa: No / Yes, date if known",
    "asks": "Whether your fingerprints were taken for an earlier Schengen visa application. If yes, it asks for the date, if known. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks whether fingerprints were taken before, and the date if known. It is not name, arrival month or consulate, so no Phase 1 prefill.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "28",
    "number": 28,
    "page": 2,
    "labelIt": "Numero del Nullaosta rilasciato ai fini del Ricongiungimento Familiare/Familiare al Seguito/Lavoro Subordinato (solo ove richiesto dalla normativa disciplinante il tipo di visto richiesto); Rilasciato dal SUI di …; Valida dal … al",
    "labelEn": "\"Nulla Osta\" ref. no. for family reunion visa / subordinate work (only if requested by the law regarding the specific type of visa requested); issued by the \"Sportello Unico per l'Immigrazione\" of (city); valid from … to",
    "asks": "The number, issuing office and validity of a nulla osta. The form says this is \"only if requested by the law\" for the visa type. [F-NY] [F-C] does not print the \"Valida dal … al\" line. This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    "marker": "never-prefill",
    "markerReason": "Carries the lock sentence (\"solo ove richiesto dalla normativa\").",
    "ambiguous": true,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY",
      "F-C"
    ]
  },
  {
    "fieldId": "29",
    "number": 29,
    "page": 2,
    "labelIt": "Data di arrivo prevista nell'area Schengen",
    "labelEn": "Intended date of arrival in the Schengen area",
    "asks": "Your intended arrival date in the Schengen area. [F-NY]",
    "marker": "copy-only",
    "markerReason": "Asks for a full arrival date. Phase 1 holds only a month, so it cannot prefill this field without adding a day. The app shows the target month beside it as a reminder.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": "arrivalMonth",
    "anchor": {
      "page": 2,
      "x": 3,
      "top": 266,
      "width": 44
    },
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "30",
    "number": 30,
    "page": 2,
    "labelIt": "Data di partenza prevista dall'area Schengen (solo per i visti aventi durata compresa tra i 91 ed i 364gg.)",
    "labelEn": "Intended date of departure from the Schengen area (only for visa of 91 days and up to 364 days)",
    "asks": "Your intended departure date. The form says this is only for visas lasting 91 to 364 days. [F-NY] This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    "marker": "never-prefill",
    "markerReason": "Carries the lock sentence (conditional on visa length).",
    "ambiguous": true,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "31",
    "number": 31,
    "page": 2,
    "labelIt": "Cognome e nome della persona che ha richiesto il ricongiungimento o del datore di lavoro. Altrimenti, nel caso di visto per Adozione, Motivi religiosi, Cure Mediche, Sport, Studio, Missione: indirizzo di recapito in Italia. Indirizzo e indirizzo di posta elettronica …; Telefono e fax …",
    "labelEn": "Surname and name of the person in Italy who applied for \"family reunion\" or of the employer in Italy. For adoption, religious reasons, medical reasons, sport, study, mission: the address in Italy. Address and e-mail; telephone or fax",
    "asks": "The family-reunion sponsor or the employer in Italy, with their address, e-mail and phone/fax. For the purposes the form lists, it asks for an address in Italy. [F-NY] The form does not mention digital nomad or remote worker applicants. This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    "marker": "never-prefill",
    "markerReason": "Carries the lock sentence.",
    "ambiguous": true,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "32",
    "number": 32,
    "page": 2,
    "labelIt": "Nome e indirizzo dell'impresa/organizzazione che invita; Telefono e fax …; Cognome, nome, indirizzo, telefono, fax e indirizzo di posta elettronica della persona di contatto presso l'impresa/organizzazione",
    "labelEn": "Name and address of host company/organization; telephone and fax; contact person's surname, first name, address, telephone, fax and e-mail",
    "asks": "Details of an inviting (host) company or organisation and its contact person. [F-NY] This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    "marker": "never-prefill",
    "markerReason": "Carries the lock sentence.",
    "ambiguous": true,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "33",
    "number": 33,
    "page": 2,
    "labelIt": "Le spese di viaggio e di soggiorno del richiedente sono a carico: del richiedente / del promotore (ospite, impresa, organizzazione), precisare; Mezzi di sussistenza: Contanti, Traveller's cheque, Carte di credito, Alloggio prepagato, Trasporto prepagato, Altro; [promotore] di cui alle caselle 31 o 32; Alloggio fornito; Tutte le spese coperte durante il soggiorno",
    "labelEn": "Cost of travelling and living during the applicant's stay is covered by: myself / a sponsor (host, company, organisation), please specify; means of support: cash, traveller's cheques, credit card, prepaid accommodation, prepaid transport, other; [sponsor] referred to in 31 or 32; accommodation provided; all expenses covered during the stay",
    "asks": "Who covers the costs of travel and stay, and the means of support, as tick boxes. The form prints: \"INDICAZIONE NON NECESSARIA NEL CASO DI VISTO PER: Ricongiungimento Familiare, Familiare al Seguito, Lavoro Subordinato/Autonomo, Missione, Diplomatico, Adozione\" (\"Information not necessary if applying for: family reunion / subordinate work / self-employment / mission / diplomatic / adoption\"). [F-NY][F-C] Whether that note covers your visa is not stated on the form. This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    "marker": "never-prefill",
    "markerReason": "Carries the lock sentence.",
    "ambiguous": true,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY",
      "F-C"
    ]
  },
  {
    "fieldId": "34",
    "number": 34,
    "page": 3,
    "labelIt": "Dati anagrafici del familiare che è cittadino UE, SEE o CH: Cognome, Nome/i, Data di nascita, Cittadinanza, Numero del documento di viaggio o della carta d'identità",
    "labelEn": "Personal data of the family member who is an EU, EEA or CH citizen: surname, first name(s), date of birth, nationality, travel document or ID card number",
    "asks": "Details of a family member who is an EU, EEA or Swiss citizen. [F-NY] This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    "marker": "never-prefill",
    "markerReason": "Carries the lock sentence.",
    "ambiguous": true,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "35",
    "number": 35,
    "page": 3,
    "labelIt": "Vincolo familiare con un cittadino UE, SEE o CH: coniuge / figlio/a / altri discendenti diretti / ascendente a carico",
    "labelEn": "Family relationship with an EU, EEA or CH citizen: spouse / son/daughter / other descendants / dependent ascendant",
    "asks": "A tick box for the family relationship to that EU, EEA or Swiss citizen. [F-NY] This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional.",
    "marker": "never-prefill",
    "markerReason": "Carries the lock sentence (tick box for a family relationship).",
    "ambiguous": true,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "36",
    "number": 36,
    "page": 3,
    "labelIt": "Luogo e data",
    "labelEn": "Place and date",
    "asks": "The place and date. [F-NY]",
    "marker": "never-prefill",
    "markerReason": "The place and date that go with the applicant's signature (field 37).",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  },
  {
    "fieldId": "37",
    "number": 37,
    "page": 3,
    "labelIt": "Firma (per i minori, firma del titolare della potestà genitoriale/tutore legale)",
    "labelEn": "Signature (for minors, signature of parental authority/legal guardian)",
    "asks": "A signature. For minors, the form asks for the parent's or legal guardian's signature. [F-NY]",
    "marker": "never-prefill",
    "markerReason": "Asks for a signature. Nomade never signs.",
    "ambiguous": false,
    "prefill": null,
    "prefillPart": null,
    "reminder": null,
    "anchor": null,
    "sourceIds": [
      "us-new-york-national-visa-form"
    ],
    "refs": [
      "F-NY"
    ]
  }
];
