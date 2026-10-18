#!/usr/bin/env python3
"""F12a: regenerate src/lib/forms/national-visa.ts from docs/forms/visa-form-walkthrough.md (verbatim copy)."""
import re, json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
md = open(os.path.join(ROOT, 'docs/forms/visa-form-walkthrough.md'), encoding='utf-8').read().split('\n')
L = lambda n: md[n-1]
def strip_bold_lead(s): return s
LOCK = "This depends on your situation. Check your consulate's instructions or ask a qualified immigration professional."
assert L(11) == "> " + LOCK
TL = "English translation — for understanding only. Submit the Italian original."
assert L(24) == "> " + TL
fields = []
page = None
for i, line in enumerate(md, 1):
    m = re.match(r'^## Page (\d)', line)
    if m: page = int(m.group(1))
    if line.startswith('## Prefill markers'): break
    m = re.match(r'^\| (\d+) \| (.*) \| (.*) \| (.*) \|$', line)
    if m:
        n = int(m.group(1)); fields.append(dict(n=n, page=page, it=m.group(2), en=m.group(3), asks=m.group(4), line=i))
assert [f['n'] for f in fields] == list(range(1, 38)), [f['n'] for f in fields]
markers = {}
for line in md:
    m = re.match(r'^\| Field (\d+) \| .* \| `([a-z0-9-]+)` \| (.*) \|$', line)
    if m: markers[int(m.group(1))] = (m.group(2), m.group(3))
assert sorted(markers) == list(range(1, 38))
REFS = re.compile(r'\[(F-NY|F-C|NY-DNV)\]')
def refs(s): 
    out = []
    for r in REFS.findall(s):
        if r not in out: out.append(r)
    return out
SRC = {"F-NY": "us-new-york-national-visa-form", "F-C": None, "NY-DNV": "us-new-york-dnv"}
ANCHORS = {1: {"page": 1, "x": 60, "baselineTop": 157, "fontSize": 9}, 3: {"page": 1, "x": 60, "baselineTop": 208, "fontSize": 9}}
REMINDER_ANCHOR = {"page": 2, "x": 3, "top": 266, "width": 44}
out = []
for f in fields:
    n = f['n']; mk, why = markers[n]
    amb = LOCK in f['asks']
    r = refs(f['asks'])
    prefill = "accountName" if mk == "phase1-prefill" else None
    out.append({
        "fieldId": str(n), "number": n, "page": f['page'],
        "labelIt": f['it'], "labelEn": f['en'], "asks": f['asks'],
        "marker": mk, "markerReason": why, "ambiguous": amb,
        "prefill": prefill,
        "prefillPart": {1: "familyName", 3: "givenName"}.get(n),
        "reminder": "arrivalMonth" if n == 29 else None,
        "anchor": ANCHORS.get(n) if prefill else (REMINDER_ANCHOR if n == 29 else None),
        "sourceIds": [SRC[x] for x in r if SRC[x]],
        "refs": r,
    })
def para(n, prefix=""):
    s = L(n)
    return s
sections = [
  {"id": "header", "page": 1, "text": L(34)},
  {"id": "photo", "page": 1, "text": L(36)},
  {"id": "admin-space", "page": 1, "text": L(38)},
  {"id": "note-x", "page": 1, "text": L(40)},
  {"id": "signature", "page": 3, "text": L(96)},
  {"id": "declarations", "page": 3, "text": L(98), "items": [l[2:] for l in md[98:103]]},
  {"id": "page4-annotazioni", "page": 4, "text": L(109)},
]
assert all(l.startswith('- ') for l in md[98:103])
for s in sections:
    s["refs"] = refs(s["text"] + " ".join(s.get("items", [])))
    s["sourceIds"] = [SRC[x] for x in s["refs"] if SRC[x]]
stamps = {"title": L(111)[3:], "items": [L(112)[2:], L(113)[2:]]}
assert L(111) == "## Fees and stamps printed on the form"
intro = {"title": L(7)[3:], "text": L(8), "labelsNote": L(22), "translationNote": L(26)}
def ts(v): return json.dumps(v, ensure_ascii=False, indent=2)
body = f'''/**
 * F12a — national visa (type D) application form: content for GET /api/forms/national-visa.
 *
 * GENERATED from docs/forms/visa-form-walkthrough.md (Visa Ops, Cap-approved
 * prefill markers 2026-10-18) by scripts/gen-forms-content.py. Do not hand-edit
 * copy: every string is verbatim from the walkthrough (see national-visa.test.ts,
 * which re-reads the markdown). Explains what each field ASKS FOR, never what to
 * put. Not legal advice. Form values never reach the server (decision 2).
 */

export const FORMS_CONTENT_VERSION = "visa-ops-national-visa-2026-10-18";

export const NATIONAL_VISA_FORM_ID = "national-visa";

/** Gate V1 source row (internal.sources) for the template PDF. */
export const NATIONAL_VISA_SOURCE_ID = "us-new-york-national-visa-form";

/** Template PDF served from /public (official file, byte-for-byte). */
export const NATIONAL_VISA_TEMPLATE = {{
  path: "/forms/formulario_nazionale_visti2.pdf",
  officialUrl: "https://consnewyork.esteri.it/wp-content/uploads/2023/06/formulario_nazionale_visti2.pdf",
  sha256: "d0631552d1e474c522911cc74d18c15fe474984ad79bd65ce3f5a880ee13ed20",
  bytes: 73317,
  pages: 4,
  /** PDF points (US Letter). Anchors use a top-left origin (pdfplumber "top"). */
  pageSize: {{ width: 612, height: 792 }},
  /** No AcroForm widgets: iOS draws text at `anchor` coordinates (decision 2). */
  hasAcroForm: false,
}} as const;

/** CSV `version_date` (docs/sources/F12-visa-form-source.csv): the form prints none. */
export const NATIONAL_VISA_VERSION = {{
  versionDate: null,
  versionNote: "none printed (PDF created 2010-09-14; served Last-Modified 2023-11-12)",
}} as const;

/** Byte-for-byte (Cap lock). */
export const FORMS_TRANSLATION_LABEL = {json.dumps(TL, ensure_ascii=False)};

/** Byte-for-byte (Cap lock): used on every ambiguous field. */
export const FORMS_LOCK_SENTENCE = {json.dumps(LOCK, ensure_ascii=False)};

/** Runbook decision 6: shown when the source row needs review; prefill hidden. */
export const FORMS_STALE_NOTICE = "This form may have changed — check the official link";

export type FormRef = "F-NY" | "F-C" | "NY-DNV";
export type PrefillKind = "accountName" | "arrivalMonth" | "consulate";
export type FieldMarker = "phase1-prefill" | "copy-only" | "never-prefill";

export type FormField = {{
  fieldId: string;
  number: number;
  page: number;
  labelIt: string;
  labelEn: string;
  /** What the field asks for (verbatim, may contain [F-NY]/[F-C]/[NY-DNV] markers). */
  asks: string;
  marker: FieldMarker;
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
    | {{ page: number; x: number; baselineTop: number; fontSize: number }}
    | {{ page: number; x: number; top: number; width: number }}
    | null;
  sourceIds: string[];
  refs: FormRef[];
}};

export type FormSection = {{
  id: string;
  page: number;
  text: string;
  items?: string[];
  refs: FormRef[];
  sourceIds: string[];
}};

export type FormReference = {{
  sourceId: string | null;
  label: string;
  url: string;
  sha256?: string;
}};

/** Walkthrough "Sources" table. F-C is a reference copy, not an active source row. */
export const NATIONAL_VISA_REFERENCES: Record<FormRef, FormReference> = {{
  "F-NY": {{
    sourceId: NATIONAL_VISA_SOURCE_ID,
    label: {json.dumps(md[15].split(' | ')[1], ensure_ascii=False)},
    url: "https://consnewyork.esteri.it/wp-content/uploads/2023/06/formulario_nazionale_visti2.pdf",
    sha256: "d0631552d1e474c522911cc74d18c15fe474984ad79bd65ce3f5a880ee13ed20",
  }},
  "F-C": {{
    sourceId: null,
    label: {json.dumps(md[16].split(' | ')[1], ensure_ascii=False)},
    url: "https://vistoperitalia.esteri.it/files/public/moduli/it/Formulario_Visto_Nazionale.pdf",
    sha256: "d1d61879b3df549fad0ea0c756a2357c28b3e88d91149a0e82dfb6535f27a880",
  }},
  "NY-DNV": {{
    sourceId: "us-new-york-dnv",
    label: {json.dumps(md[17].split(' | ')[1], ensure_ascii=False)},
    url: "https://consnewyork.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/visas-to-enter-italy/digital-nomad-remote-worker-visa/",
  }},
}};

export const NATIONAL_VISA_INTRO = {ts(intro)} as const;

export const NATIONAL_VISA_SECTIONS: FormSection[] = {ts(sections)};

export const NATIONAL_VISA_STAMPS = {ts(stamps)} as const;

export const NATIONAL_VISA_FIELDS: FormField[] = {ts(out)};
'''
open(os.path.join(ROOT, 'src/lib/forms/national-visa.ts'), 'w', encoding='utf-8').write(body)
print(len(out), sum(f['ambiguous'] for f in out), [f['number'] for f in out if f['ambiguous']])
print([ (f['number'], f['refs']) for f in out if not f['sourceIds']])
