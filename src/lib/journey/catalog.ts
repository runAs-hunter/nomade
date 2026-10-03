/**
 * F5 static journey catalog — Visa Ops Italy DNV / remote-worker pack.
 * Step copy is the approved pack. Not legal advice. Not RAG / CMS.
 * See docs/journey.md.
 */

export const JOURNEY_CATALOG_VERSION = "visa-ops-italy-dnv-2026-10-03";

export const JOURNEY_DISCLAIMER =
  "Preliminary guidance — not legal advice";

export const JOURNEY_COUNTRY_CODE = "IT";

export type JourneyStepStatus = "not_started" | "in_progress" | "done";

export const JOURNEY_STEP_STATUSES: readonly JourneyStepStatus[] = [
  "not_started",
  "in_progress",
  "done",
] as const;

export function isJourneyStepStatus(value: unknown): value is JourneyStepStatus {
  return (
    typeof value === "string" &&
    (JOURNEY_STEP_STATUSES as readonly string[]).includes(value)
  );
}

export type JourneyPathId = "italy_digital_nomad" | "italy_remote_worker";

export type JourneyPathDef = {
  pathId: JourneyPathId;
  title: string;
  description: string;
  available: boolean;
};

export type JourneyStepDef = {
  id: string;
  name: string;
  detail: string;
  phaseName: string;
};

export type JourneyPhaseDef = {
  name: string;
  steps: JourneyStepDef[];
};

export const JOURNEY_PATHS: readonly JourneyPathDef[] = [
  {
    pathId: "italy_digital_nomad",
    title: "Italy Digital Nomad Visa",
    description:
      "National visa for non-EU citizens doing highly qualified self-employed remote work. For US applicants.",
    available: true,
  },
  {
    pathId: "italy_remote_worker",
    title: "Italy Remote Worker Visa",
    description:
      "Same steps as the nomad path except where marked. Drop partita-iva. Add employment-contract. Replace proof-of-income detail only.",
    available: true,
  },
] as const;

const GATHER = "Gather documents";
const APPLY = "Apply";
const AFTER = "After arrival";

function step(
  phaseName: string,
  id: string,
  name: string,
  detail: string,
): JourneyStepDef {
  return { id, name, detail, phaseName };
}

const PASSPORT_DETAIL =
  "Italian entry law only requires a valid passport. It does not set a six-month rule. The four US posts ask for at least 15 months past your intended travel date, two blank pages, and copies of the bio and expiry pages. Confirm that with your post before you book.";

const HIGHLY_QUALIFIED_DETAIL =
  "The work has to meet art. 27-quater. That is a higher-education or post-secondary professional qualification of at least three years, the licensing rules for a regulated profession, or at least five years of comparable experience. Managers and ICT specialists in ISCO-08 groups 133 and 25 can use three years of relevant experience in the seven years before the application. US posts add their own evidence, such as a CIMEA statement or a Declaration of Value. That evidence is consular, not in the decree. Start this early. It often takes longer than the appointment window.";

const PRIOR_EXPERIENCE_DETAIL =
  "The decree requires six months in the activity you will do. US posts accept tax returns, client invoices, or a professional-association membership. That list is not closed by the statute.";

/** Nomad-only income sentence. Not shared with the remote-worker step. */
const NOMAD_PROOF_OF_INCOME_DETAIL =
  "The decree sets annual lawful income at not less than three times the minimum used for exemption from the healthcare ticket. It does not print a euro amount. €28,000 was not on any official page checked. The four US posts still show €24,789 and date that sentence to 2024. They also say the income must come from the work, and that passive income does not count. Confirm the current figure with your consulate. Do not treat €24,789 or €28,000 as the law.";

/** Remote-worker income sentence. Separate constant so it cannot inherit the nomad text. */
const REMOTE_PROOF_OF_INCOME_DETAIL =
  "US posts add a salary at least equal to the relevant Italian collective agreement and not below the ISTAT median. Washington’s February 2026 PDF prints a gross floor of €33,000. New York, Los Angeles, and San Francisco do not print a euro figure. The decree does not set €33,000.";

const FINANCIAL_STATEMENTS_DETAIL =
  "Bank statements are not their own legal requirement. US posts say proof can be pay stubs, a tax return, a W-2, or the three most recent bank statements. Use the set your post asks for.";

const HEALTH_INSURANCE_DETAIL =
  "You need medical and hospital coverage valid in Italy for the whole stay. The law says all risks on Italian territory. It sets no euro minimum. US posts ask for a letter covering medical costs, hospitalization, and repatriation outside the United States, of at least €30,000 or $50,000. A card alone is not enough on those pages. New York and San Francisco allow an Italian policy, or an affidavit that you will buy one before Questura registration. Los Angeles and the Washington PDF do not state that option.";

const ACCOMMODATION_DETAIL =
  "The decree asks for suitable housing documents. It does not say one to three months, and it does not bless a short hotel stay. US posts want a lease, rental contract, or deed in your name for the entire visa. A lease should be a registered residential contract. New York says a hospitality offer or a hotel stay is refused.";

const CRIMINAL_RECORD_DETAIL =
  "A police certificate is not on the decree or on those four checklists. Do not treat an FBI report, a three-to-six-month issue date, an apostille, or an Italian translation as a national rule. Entry can still be refused for listed convictions or for a public-order risk. Washington’s apostille line is for certain qualification documents, not a police certificate.";

const COVER_LETTER_DETAIL =
  "A motivation letter is not on the decree or those four pages. If a post asks, keep it factual.";

const CONSULATE_APPOINTMENT_DETAIL =
  "Apply at the mission for your place of residence, on Prenot@Mi. There is no six-to-eight-week rule. Washington, updated 9 Jun 2026, says email visti.washington@esteri.it before booking this visa. You may book up to six months before departure, and not later than 15 days before. New York’s general page caps the window at 180 days before departure.";

const SUBMIT_APPLICATION_DETAIL =
  "From 11 Jan 2025, Los Angeles and San Francisco fingerprint every national-visa applicant. The statute requires the short-stay biometrics, with exemptions only if a foreign-ministry decree sets them. Washington’s nomad pages, as checked, do not mention fingerprints. Bring originals. “Two copies of everything” was not on the pages checked. There is no statutory processing time. New York’s general page says processing often runs from seven days to several weeks. That is not a nomad deadline. Do not book travel that assumes a decision date.";

const VISA_FEE_DETAIL =
  "For a stay over 90 days the fee is the type D national visa, and the US posts say it is non-refundable. The consular tariff for 1 Oct 2026 through 31 Dec 2026 lists that visa at €116. Washington’s fee page, updated 2 Oct 2026, prints $133.60 for that quarter, not euros. New York, Los Angeles, and San Francisco reset the dollar amount on 1 January, 1 April, 1 July, and 1 October. This pack states no dollar figure for those three.";

const PERMESSO_DETAIL =
  "Within eight working days of entry, request it at the Questura of the province where you are. The decree says directly at the Questura. Whether a post office can take this permit is not confirmed. US posts say to check that Questura. Bring the documents the consulate stamped. The card reads “nomade digitale - lavoratore da remoto.” It lasts at most one year and can be renewed if the conditions still hold. Polizia di Stato’s general page, modified 5 Jan 2024, prints a €40 contribution for a permit of more than three months and up to one year, and an average issue time of about 60 days. Confirm both locally. Missing the eight days can mean administrative expulsion, unless the delay is force majeure. Spouse and minor-child reunification is a separate Questura process. It is not a step here.";

const CODICE_FISCALE_DETAIL =
  "The Questura generates it when the permit is issued and notifies Agenzia delle Entrate. That is the normal path. A separate office form exists, and a first code for a non-EU citizen needs an in-person appointment. Same-day issue at the tax office is not stated.";

const ANAGRAFE_DETAIL =
  "Once you hold a regular permesso, register where you intend to live. The official long-stay page does not say the permit receipt is enough. Do not treat “register with the receipt” as confirmed.";

const PARTITA_IVA_DETAIL =
  "Digital nomads must request one. The decree does not put that duty on remote workers. It sets no day count. Do this after the codice fiscale exists.";

const EMPLOYMENT_CONTRACT_DETAIL =
  "Remote workers must present the employment or collaboration contract, or a binding offer, for highly qualified work. The employer or client can sit outside Italy. If that employer or client lives in Italy, the decree also wants a signed declaration of no listed convictions in the last five years, plus a copy of the signer’s ID.";

function gatherShared(proofDetail: string): JourneyStepDef[] {
  return [
    step(GATHER, "passport", "Passport valid for the trip", PASSPORT_DETAIL),
    step(GATHER, "highly-qualified", "Highly qualified status", HIGHLY_QUALIFIED_DETAIL),
    step(GATHER, "prior-experience", "At least six months in this work", PRIOR_EXPERIENCE_DETAIL),
    step(GATHER, "proof-of-income", "Lawful income from the remote work", proofDetail),
    step(GATHER, "financial-statements", "Evidence of that income", FINANCIAL_STATEMENTS_DETAIL),
    step(GATHER, "health-insurance", "Health insurance valid in Italy", HEALTH_INSURANCE_DETAIL),
    step(GATHER, "accommodation", "Suitable accommodation in your name", ACCOMMODATION_DETAIL),
    step(GATHER, "criminal-record", "Criminal-record check, only if your post asks", CRIMINAL_RECORD_DETAIL),
    step(GATHER, "cover-letter", "Cover letter, only if your post asks", COVER_LETTER_DETAIL),
  ];
}

function applySteps(): JourneyStepDef[] {
  return [
    step(APPLY, "consulate-appointment", "Book the consulate appointment", CONSULATE_APPOINTMENT_DETAIL),
    step(APPLY, "submit-application", "Attend and submit in person", SUBMIT_APPLICATION_DETAIL),
    step(APPLY, "visa-fee", "Pay the national visa fee", VISA_FEE_DETAIL),
  ];
}

function afterShared(): JourneyStepDef[] {
  return [
    step(AFTER, "permesso-soggiorno", "Request the permesso di soggiorno", PERMESSO_DETAIL),
    step(AFTER, "codice-fiscale", "Codice fiscale from the Questura", CODICE_FISCALE_DETAIL),
    step(AFTER, "anagrafe", "Register residence at the Comune", ANAGRAFE_DETAIL),
  ];
}

/** Nomad phases. Separate array from the remote-worker catalog. */
const NOMAD_PHASES: JourneyPhaseDef[] = [
  { name: GATHER, steps: gatherShared(NOMAD_PROOF_OF_INCOME_DETAIL) },
  { name: APPLY, steps: applySteps() },
  {
    name: AFTER,
    steps: [
      ...afterShared(),
      step(AFTER, "partita-iva", "Request a partita IVA", PARTITA_IVA_DETAIL),
    ],
  },
];

/** Remote-worker phases. proof-of-income uses only the remote sentence. */
const REMOTE_PHASES: JourneyPhaseDef[] = [
  {
    name: GATHER,
    steps: [
      ...gatherShared(REMOTE_PROOF_OF_INCOME_DETAIL),
      step(
        GATHER,
        "employment-contract",
        "Employment or collaboration contract",
        EMPLOYMENT_CONTRACT_DETAIL,
      ),
    ],
  },
  { name: APPLY, steps: applySteps() },
  { name: AFTER, steps: afterShared() },
];

const CATALOG_BY_PATH: Record<JourneyPathId, JourneyPhaseDef[]> = {
  italy_digital_nomad: NOMAD_PHASES,
  italy_remote_worker: REMOTE_PHASES,
};

export function listJourneyPaths(): JourneyPathDef[] {
  return JOURNEY_PATHS.map((p) => ({ ...p }));
}

export function getPathDef(pathId: string): JourneyPathDef | null {
  return JOURNEY_PATHS.find((p) => p.pathId === pathId) ?? null;
}

export function isKnownPathId(pathId: string): pathId is JourneyPathId {
  return getPathDef(pathId) !== null;
}

export function getPhasesForPath(pathId: JourneyPathId): JourneyPhaseDef[] {
  return CATALOG_BY_PATH[pathId].map((phase) => ({
    name: phase.name,
    steps: phase.steps.map((s) => ({ ...s })),
  }));
}

export function listStepDefsForPath(pathId: JourneyPathId): JourneyStepDef[] {
  return getPhasesForPath(pathId).flatMap((p) => p.steps);
}

export function getStepDef(
  pathId: JourneyPathId,
  stepId: string,
): JourneyStepDef | null {
  return listStepDefsForPath(pathId).find((s) => s.id === stepId) ?? null;
}

export function computeProgress(statuses: JourneyStepStatus[]): {
  done: number;
  total: number;
  fraction: number;
} {
  const total = statuses.length;
  const done = statuses.filter((s) => s === "done").length;
  const fraction = total === 0 ? 0 : done / total;
  return { done, total, fraction };
}
