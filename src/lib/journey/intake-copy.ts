/**
 * F11a note + flag copy — Visa Ops, 2026-10-16 (F11-visa-ops-copy.md), with
 * Cap's 2026-10-16 overrides. Cap lock: no new legal claims in code; every
 * entry cites ≥1 internal.sources id (validated in intake tests).
 * No euro figure appears here by design.
 */

import type { IntakeFlagCode, IntakeNoteKey } from "@/lib/journey/intake";

export type IntakeCopy = {
  text: string;
  sourceIds: readonly string[];
  /** Visa Ops marked the claim uncertain; clients may soften the styling. */
  uncertain?: true;
  /** Also cite the user's own consulate rows for this catalog step (per post). */
  consulateStepId?: string;
};

export const INTAKE_NOTE_COPY: Readonly<Record<IntakeNoteKey, IntakeCopy>> = {
  employee_payslips: {
    text: "You said you're paid as an employee. US posts accept pay stubs, a W-2, a tax return, or your three most recent bank statements as proof of income. Those pages say the income must come from the work you'll do while in Italy, and passive income doesn't count.",
    sourceIds: ["us-new-york-dnv", "us-los-angeles-dnv", "us-washington-dnv-checklist-pdf", "it-gu-dm-2024-02-29-art3"],
  },
  self_employed_evidence: {
    text: "If you're self-employed, gather tax returns and bank statements that show lawful income from this work. Miami's self-employed checklist gives IRS transcripts of your last two tax returns and two years of bank statements as examples. For the six months of experience, US posts accept tax returns, client invoices, or membership in a professional association. Ask your consulate which set it wants.",
    sourceIds: ["it-gu-dm-2024-02-29-art3", "us-miami-dn-self-employed-pdf", "us-new-york-dnv", "us-boston-dnv"],
  },
  likely_needed: {
    text: "The decree says digital nomads must request a partita IVA and sets no deadline for it. The Agenzia delle Entrate says form AA9/12 is generally filed within 30 days of starting a professional activity. Ask the Agenzia or a commercialista how that applies to you after your codice fiscale is issued.",
    sourceIds: ["it-gu-dm-2024-02-29-art6", "it-ade-partita-iva-howto", "it-ade-partita-iva-aa9"],
    uncertain: true,
  },
  employee_contract_evidence: {
    text: "Bring your employment or collaboration contract, or a binding job offer, for highly qualified work. Under the decree, the employer's signed declaration of no listed convictions in the last five years, with a copy of the signer's ID, is tied to employers resident in Italy. US posts ask every remote worker for it, so include it if your consulate asks.",
    sourceIds: ["it-gu-dm-2024-02-29-art3", "us-new-york-dnv", "us-los-angeles-dnv", "us-washington-dnv-checklist-pdf", "us-miami-rw-subordinate-pdf"],
  },
  registered_lease: {
    text: "US posts want the lease in your name, covering the entire visa period. It should be an original \"Contratto di Locazione ad Uso Abitativo\" with proof that the landlord registered it with the Agenzia delle Entrate.",
    sourceIds: ["us-new-york-dnv", "us-los-angeles-dnv", "us-washington-dnv-checklist-pdf", "us-san-francisco-dnv-checklist-pdf", "it-gu-dm-2024-02-29-art3"],
  },
  deed: {
    text: "US posts accept a deed for property in Italy. It must be in your name and cover the entire visa period. Bring the original and a copy.",
    sourceIds: ["us-new-york-dnv", "us-boston-dnv", "us-washington-dnv-checklist-pdf", "it-gu-dm-2024-02-29-art3"],
  },
  housing_needed_before_appointment: {
    text: "You'll need housing settled before your appointment. US posts generally ask for a lease, rental contract, or deed in your name covering the whole visa period. Several posts, including New York, say a hotel stay or a hospitality offer is not accepted. Secure a registered lease or deed before you book or attend.",
    sourceIds: ["it-gu-dm-2024-02-29-art3", "us-new-york-dnv", "us-boston-dnv", "us-los-angeles-dnv", "us-washington-dnv-checklist-pdf"],
  },
  children_birth_certs: {
    text: "Expect to need your children's birth certificates. No official page we checked lists the documents for family reunification. Ask your consulate and the Questura what they need, including any apostille or translation. Separately, the Rome Prefettura's anagrafe page asks for civil-status documents such as birth certificates, translated into Italian and legalized, when you register residence.",
    sourceIds: ["it-interno-prefettura-roma-anagrafe", "us-new-york-dnv", "us-los-angeles-dnv", "us-new-york-visa-general"],
    uncertain: true,
  },
};

export const INTAKE_FLAG_COPY: Readonly<Record<IntakeFlagCode, IntakeCopy>> = {
  SUGGEST_REMOTE_WORKER_PATH: {
    text: "You said you're paid as an employee. The decree defines a digital nomad as self-employed and a remote worker as someone in employee or collaboration work (Art. 2). The remote worker path may fit your answer better. You can switch paths, or keep this one if your situation is different.",
    sourceIds: ["it-gu-dm-2024-02-29-art2"],
  },
  SUGGEST_NOMAD_PATH: {
    text: "You said you're self-employed or run a business. The decree defines a digital nomad as someone doing self-employed work remotely, and a remote worker as an employee or collaborator (Art. 2). The digital nomad path may fit your answer better. You can switch paths, or keep this one.",
    sourceIds: ["it-gu-dm-2024-02-29-art2"],
  },
  INCOME_BELOW_THRESHOLD: {
    text: "The decree requires lawful yearly income of at least three times the healthcare-ticket exemption minimum. It does not print a euro figure, and the figures on consulate pages are dated. Confirm the current amount with your consulate before you apply. Your other steps stay the same.",
    sourceIds: ["it-gu-dm-2024-02-29-art3"],
    consulateStepId: "proof-of-income",
  },
  TIMELINE: {
    text: "This is your goal, not an official deadline. Washington lets you book up to six months ahead and no later than 15 days before departure. New York lets you book up to 180 days ahead.",
    sourceIds: ["us-washington-visa-booking", "us-new-york-visa-general"],
  },
};
