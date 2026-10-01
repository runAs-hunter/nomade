/**
 * F3 static journey catalog — stub/static from italy.yaml ids.
 * Not Visa Ops / RAG. Quiet preliminary guidance (not legal advice).
 * See docs/runbooks/F3-journey-checklist-runbook.md.
 */

export const JOURNEY_CATALOG_VERSION = "stub-italy-dnv-2026-10-01";

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
  /** Both V1 paths available with the same stub catalog (Cap default). */
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

/** Paths shown in picker. Remote worker shares DNV stub catalog. */
export const JOURNEY_PATHS: readonly JourneyPathDef[] = [
  {
    pathId: "italy_digital_nomad",
    title: "Italy Digital Nomad Visa",
    description:
      "Italy Digital Nomad Visa (Visto per Nomadi Digitali) — primary path for remote workers.",
    available: true,
  },
  {
    pathId: "italy_remote_worker",
    title: "Italy Remote Worker Visa",
    description:
      "Italy Remote Worker Visa — same preliminary checklist as digital nomad in V1.",
    available: true,
  },
] as const;

/**
 * Universal / always-visible Italy DNV steps from italy.yaml.
 * Omits `dependent-permesso` (hidden_unless_matched) per Cap default.
 */
const ITALY_STUB_PHASES: JourneyPhaseDef[] = [
  {
    name: "Gather Documents",
    steps: [
      {
        id: "passport",
        name: "Valid passport (6+ months remaining)",
        detail:
          "Must not expire before your visa end date. Check the expiry date carefully.",
        phaseName: "Gather Documents",
      },
      {
        id: "proof-of-income",
        name: "Proof of income",
        detail: "Documents proving €28,000+/yr stable income",
        phaseName: "Gather Documents",
      },
      {
        id: "health-insurance",
        name: "Health insurance (Italy-valid)",
        detail:
          "Must cover the full duration of your stay and be accepted by Italian consulates. Look for plans specifically marketed as valid for Italian visa applications.",
        phaseName: "Gather Documents",
      },
      {
        id: "accommodation",
        name: "Proof of accommodation",
        detail:
          "Rental contract or confirmed hotel/Airbnb booking covering your initial stay (minimum 1–3 months recommended).",
        phaseName: "Gather Documents",
      },
      {
        id: "criminal-record",
        name: "Criminal background check",
        detail:
          "Issued by your country of residence. Must be recent (typically within 3–6 months of application) and apostilled + translated to Italian.",
        phaseName: "Gather Documents",
      },
      {
        id: "cover-letter",
        name: "Cover letter / motivation statement",
        detail:
          "A letter addressed to the Italian consulate explaining your work, your clients/employer, how you work remotely, and your intention to reside in Italy. 1–2 pages.",
        phaseName: "Gather Documents",
      },
      {
        id: "financial-statements",
        name: "Bank statements (last 3 months)",
        detail:
          "Showing consistent income deposits matching your income type documentation. Must reflect the €28,000+/yr threshold.",
        phaseName: "Gather Documents",
      },
    ],
  },
  {
    name: "Apply",
    steps: [
      {
        id: "consulate-appointment",
        name: "Book consulate appointment",
        detail:
          "Book at the Italian consulate in your country of residence. Appointments fill quickly — book 6–8 weeks in advance.",
        phaseName: "Apply",
      },
      {
        id: "submit-application",
        name: "Submit application + biometrics",
        detail:
          "Attend in-person at your consulate with a complete document package. Biometric fingerprinting is required. Bring originals + 2 copies of everything.",
        phaseName: "Apply",
      },
      {
        id: "visa-fee",
        name: "Pay visa application fee",
        detail:
          "Currently €116 for the long-stay (D-type) national visa. Fee may vary slightly by consulate. Confirm current amount when booking.",
        phaseName: "Apply",
      },
    ],
  },
  {
    name: "After Arrival",
    steps: [
      {
        id: "permesso-soggiorno",
        name: "Apply for Permesso di Soggiorno",
        detail:
          "Within 8 business days of arrival, go to your local Questura (police headquarters) or authorized post office (Sportello Amico). Bring passport, visa, lease/accommodation proof, photos, and the kit postal form (available at post offices).",
        phaseName: "After Arrival",
      },
      {
        id: "codice-fiscale",
        name: "Get your Codice Fiscale (Italian tax ID)",
        detail:
          "Required for signing rental contracts, opening a bank account, and accessing healthcare. Get it at the local Agenzia delle Entrate. Bring passport + visa. Usually same-day.",
        phaseName: "After Arrival",
      },
      {
        id: "anagrafe",
        name: "Register at Anagrafe (civil registry)",
        detail:
          "Register your residential address at your local Comune. Required for residency rights. Bring passport, visa, Permesso di Soggiorno receipt, and lease agreement.",
        phaseName: "After Arrival",
      },
    ],
  },
];

/** Both V1 paths share the same stub catalog. */
const CATALOG_BY_PATH: Record<JourneyPathId, JourneyPhaseDef[]> = {
  italy_digital_nomad: ITALY_STUB_PHASES,
  italy_remote_worker: ITALY_STUB_PHASES,
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
