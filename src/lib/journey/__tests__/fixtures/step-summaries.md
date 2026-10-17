# Step summaries (optional `summary` per step)

- **For:** Studio and Isaias.
- **Prepared:** 17 Oct 2026 (Europe/Rome).
- **Catalog read:** `runAs-hunter/nomade` `main`, `src/lib/journey/catalog.ts` (`JOURNEY_CATALOG_VERSION = "visa-ops-italy-dnv-2026-10-16"`), read-only. The two family steps are already in `main` as conditional steps.
- **Rules followed:**
  - Facts come only from each step's `detail` or its sources.
  - Plain US English, sentence case, phrased as an action.
  - Target 60–90 characters. Actual range is **66–92** (count in the table).
  - No euro figure in either income summary.
- **Paths:** `both` = `italy_digital_nomad` and `italy_remote_worker`. `proof-of-income` has one summary per path, because its detail differs by path.

**Example check.** "Valid passport; US posts ask for 15+ months past travel and 2 blank pages" is **not accurate for every US post**. Boston, Chicago, Detroit, Houston, Los Angeles, New York, Philadelphia, San Francisco and Washington say 15 months and two blank pages. Miami's two PDFs say 3 months beyond the stay (at least one year past arrival) and one blank page. I fixed it to say "most US posts".

| step id | path | summary | chars | grounded in |
|---|---|---|---|---|
| `passport` | both | Valid passport; most US posts ask 15+ months past travel and 2 blank pages | 74 | PASSPORT_DETAIL; us-new-york-dnv, us-washington-dnv-checklist-pdf, us-boston-dnv. Example fixed: Miami's PDFs ask 3 months beyond the stay (min. 1 year past arrival) and 1 blank page, so 'US posts' -> 'most US posts'. |
| `highly-qualified` | both | Prove art. 27-quater status: 3-year degree, regulated license, or 5 years' experience | 85 | HIGHLY_QUALIFIED_DETAIL; it-normattiva-dlgs-286-1998-art27quater |
| `prior-experience` | both | Show at least 6 months in this work, such as tax returns or client invoices | 75 | PRIOR_EXPERIENCE_DETAIL; it-gu-dm-2024-02-29-art3, us-new-york-dnv |
| `proof-of-income` | nomad | Show lawful income of 3x the healthcare-ticket exemption; confirm figure with your post | 87 | NOMAD_PROOF_OF_INCOME_DETAIL; it-gu-dm-2024-02-29-art3. No euro figure by design. |
| `proof-of-income` | remote | Show salary at the Italian collective-agreement level, not below the ISTAT median | 81 | REMOTE_PROOF_OF_INCOME_DETAIL; us-new-york-dnv, us-washington-dnv-checklist-pdf. No euro figure by design (WA's €33,000 is post-specific). |
| `financial-statements` | both | Back up income with pay stubs, a tax return, a W-2, or 3 recent bank statements | 79 | FINANCIAL_STATEMENTS_DETAIL; us-new-york-dnv |
| `health-insurance` | both | Get medical and hospital cover valid in Italy for the whole stay; posts want €30,000+ | 85 | HEALTH_INSURANCE_DETAIL; it-gu-dm-2024-02-29-art3, US post rows (all print €30,000 or $50,000). |
| `accommodation` | both | Secure a lease or deed in your name for the whole visa; New York refuses hotel stays | 84 | ACCOMMODATION_DETAIL; us-new-york-dnv, us-boston-dnv. 'Hotels not accepted' is New York's (and Boston/Chicago/Detroit/Philadelphia) wording. |
| `criminal-record` | both | Get a police certificate only if your post asks; it is not on the decree or checklists | 86 | CRIMINAL_RECORD_DETAIL; it-gu-dm-2024-02-29-art3, US post rows |
| `family-documents` | both (conditional) | Ask your consulate and Questura what family documents to bring for spouse or children | 85 | FAMILY_DOCUMENTS_DETAIL; it-gu-dm-2024-02-29-art4, it-normattiva-dlgs-286-1998-art29 |
| `cover-letter` | both | Write a factual cover letter only if your post asks; the decree does not require one | 84 | COVER_LETTER_DETAIL |
| `consulate-appointment` | both | Book at your residence's consulate through its booking page; Washington wants an email first | 92 | CONSULATE_APPOINTMENT_DETAIL; us-new-york-visa-general, us-washington-visa-booking |
| `submit-application` | both | Attend in person with originals; don't book travel on an assumed decision date | 78 | SUBMIT_APPLICATION_DETAIL; us-new-york-visa-general |
| `visa-fee` | both | Pay the non-refundable type D national visa fee; amounts change each quarter | 76 | VISA_FEE_DETAIL; us-washington-visa-fees, us-los-angeles-consular-tariff-q4-2026 |
| `permesso-soggiorno` | both | Request your permesso at the Questura within 8 working days of entry | 68 | PERMESSO_DETAIL; it-gu-dm-2024-02-29-art4 |
| `family-permesso` | both (conditional) | Ask the Questura about a family permesso, which lasts as long as yours | 70 | FAMILY_PERMESSO_DETAIL; it-gu-dm-2024-02-29-art4 |
| `codice-fiscale` | both | Get your codice fiscale from the Questura when your permesso is issued | 70 | CODICE_FISCALE_DETAIL; it-gu-dm-2024-02-29-art6 |
| `anagrafe` | both | Register residence at your Comune once you hold a regular permesso | 66 | ANAGRAFE_DETAIL; it-maeci-long-stay-visa-d, it-interno-prefettura-roma-anagrafe |
| `partita-iva` | nomad | Request a partita IVA after your codice fiscale; the decree sets no deadline | 76 | PARTITA_IVA_DETAIL; it-gu-dm-2024-02-29-art6 |
| `employment-contract` | remote | Bring your employment contract or binding offer for highly qualified work | 73 | EMPLOYMENT_CONTRACT_DETAIL; it-gu-dm-2024-02-29-art3 |

Note: the health-insurance summary keeps "€30,000+" because every US post row prints €30,000 (or $50,000). The decree sets no amount. Drop it if Studio wants no figures at all in summaries.

## Art. 29 and dependents

Sources read today (17 Oct 2026, Europe/Rome):
- Normattiva art. 29 D.Lgs. 286/1998 (`it-normattiva-dlgs-286-1998-art29`), full text via curl, HTTP 200.
- Decree DM 29 Feb 2024 Art. 4 (`it-gu-dm-2024-02-29-art4`), re-read 16 Oct.
- Art. 27-quater (`it-normattiva-dlgs-286-1998-art27quater`), comma 16.
- The INPS assegno sociale page (HTTP 200 today).

### C1. Does art. 29 comma 3 apply to DNV and remote-worker families?

- **Most likely yes, but marked uncertain.**
  - Decree Art. 4.6 allows reunification for the art. 29(1)(a)–(b) relatives "ai sensi e alle condizioni previste dal medesimo art. 29". That phrase takes in art. 29's conditions, and comma 3 is one of them: housing that meets Comune checks, and income.
  - Art. 27-quater comma 16 uses the same formula for Blue Card holders ("ai sensi e alle condizioni previste dall'articolo 29"). The legislator uses this phrase to import the art. 29 conditions.
  - Comma 3 itself opens "Salvo quanto previsto dall'articolo 29-bis". Art. 29-bis is a refugee carve-out and isn't relevant here.
  - Uncertainty: no consular or Questura page we read applies comma 3 to DNV families explicitly. US posts only say that sponsorship starts at the Questura.
- **Comma 3(b) text (verbatim):** "di un reddito minimo annuo derivante da fonti lecite non inferiore all'importo annuo dell'assegno sociale aumentato della metà dell'importo dell'assegno sociale per ogni familiare da ricongiungere. Per il ricongiungimento di due o più figli di età inferiore agli anni quattordici è richiesto, in ogni caso, un reddito non inferiore al doppio dell'importo annuo dell'assegno sociale. Ai fini della determinazione del reddito si tiene conto anche del reddito annuo complessivo dei familiari conviventi con il richiedente".
- **Separate test or on top of the visa minimum?**
  - It is a **separate test in a separate procedure**. Art. 29 comma 7 has the request sent to the Sportello unico with the comma 3 documents, and the nulla osta is issued after that check.
  - Neither the decree nor art. 29 adds the two amounts together. Each test is measured against its own base: 3× the healthcare-ticket exemption for the visa, and the assegno sociale formula for reunification. Income of cohabiting family members also counts toward the reunification test.
  - Whether a Questura or prefettura expects the sponsor to meet both at once, or treats the higher one as binding, is **uncertain**. No source says.
- **Official assegno sociale figure: yes, and it is official.**
  - INPS "Assegno sociale" page, last updated 5 May 2026: https://www.inps.it/it/it/dettaglio-scheda.it.schede-servizio-strumento.schede-servizi.assegno-sociale-50184.assegno-sociale.html
  - It says "L'importo dell'Assegno per il 2026 è pari a 546,24 euro per 13 mensilità", with an annual threshold of **€7,101.12** (2026).
  - Basis: INPS circolare n. 153 of 19 Dec 2025. Those are *provisional* 2026 values (+1.4%, "salvo conguaglio").
  - **Not yet a Nomade source row.** Proposed new row: `it-inps-assegno-sociale-2026`.
- **Computed amounts.** One family member → 1.5 × 7,101.12 = €10,651.68. Two or more children under 14 → at least 2× = €14,202.24.
  - These are **my arithmetic, not printed by any official page**.
  - Do not show them in user copy unless Visa Ops approves showing a computed figure, with the formula and the INPS date.

### C2. Audit of the legacy figures (read-only, `runAs-hunter/nomade` `main`)

- **`src/data/countries/italy.yaml`**, step `dependent-permesso`. The returned file has a 2-line wrapper, so the lines below are 126 and 129 in the repo:
  - L126: `detail: "Your partner needs their own Permesso di Soggiorno as a family member (familiare al seguito). Additional income requirement: €8,400/yr per dependent. Your partner must have traveled to Italy on a family reunion visa — apply at the consulate before traveling."`
  - L129: `detail: "Each family member (partner + children) needs their own Permesso di Soggiorno. Additional income requirements: €8,400/yr per dependent adult + €2,800/yr per minor child. Apply for family reunion visas at the consulate for all family members before traveling."`
- **`src/data/quiz.ts`:**
  - L139: `description: "Additional €8,400/yr income required",`
  - L144: `description: "Partner + children — additional €8,400/yr per adult + €2,800/yr per child",`
- **Verdict: no official source supports €8,400 or €2,800.**
  - They match neither art. 29 comma 3, which uses half the assegno sociale per family member (€3,550.56 in 2026 by my arithmetic), nor double the assegno for two or more children under 14. They also match no INPS figure.
  - The yaml and quiz also contradict the sources in three places:
    - "partner" is not an art. 29 category. Art. 29 covers a spouse not legally separated, aged 18 or over.
    - "apply … before traveling" conflicts with US posts, which say sponsorship starts in Italy at the Questura.
    - "familiare al seguito" is a different art. 29 comma 4 route.
- **Recommendation for Theo (no edits made):**
  1. Remove both figures from `italy.yaml` L126/L129 and `quiz.ts` L139/L144, and from the iOS fixture `personalize-vectors.json`.
  2. Replace the quiz descriptions with eligibility-only text that is already sourced. For example: "Spouse 18 or over" / "Spouse 18 or over and unmarried children under 18" (art. 29(1)(a)–(b)).
  3. Replace the yaml details with the catalog's `FAMILY_PERMESSO_DETAIL` / `FAMILY_DOCUMENTS_DETAIL`, or retire `dependent-permesso` if the F11a catalog steps supersede it.
  4. If any income line is wanted later, ship only Visa Ops-approved copy that states the formula and cites `it-normattiva-dlgs-286-1998-art29` and a dated INPS row.
  5. Confirm with a grep that no live web or iOS surface still renders `8,400` or `2,800`.

### C3. Other parent's consent when only the children come

- **Yes. The text conditions every minor child on the other parent's consent, whether or not a spouse also comes.** Art. 29 comma 1(b) (verbatim): "figli minori, anche del coniuge o nati fuori del matrimonio, non coniugati, a condizione che l'altro genitore, qualora esistente, abbia dato il suo consenso".
- US posts say the same: a child under 18 "provided that the other parent consents to the issuance of the visa". Sources: us-new-york-dnv, us-los-angeles-dnv, us-washington-dnv-checklist-pdf.
- **Uncertain:** the form the consent must take (notarized, apostilled, etc.). No source sets it for reunification. New York's general page (`us-new-york-visa-general`) requires notarized consent from both parents for *minor visa applicants travelling*. That is a different context and must not be transferred.
- **Draft user note** (key suggestion: `children_other_parent_consent`; attaches to `family-documents`; rule: `family ∈ {spouse_children, children}`):
  > Italian law lets you bring a minor child only if the child's other parent, if there is one, has given consent. Ask your consulate and the Questura what form that consent should take.
  - Sources: `it-normattiva-dlgs-286-1998-art29`, `us-new-york-dnv`.
  - Status: the wording is sourced, and the format is deferred. Needs Visa Ops sign-off.
