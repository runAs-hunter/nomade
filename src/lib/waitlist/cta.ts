/**
 * F12 Phase 0 (task 0.5): two-card CTA section, signup step and thank-you copy.
 *
 * Copy is locked to /workspace/F12-phase0/launch/0.5-cta-copy.md with Cap's
 * overrides (card 1 uses the "Get my visa form walkthrough" button). Do not
 * paraphrase. Tests assert these exact values. No price, no checkout link, no
 * App Store link on these cards.
 *
 * Client-safe: no server imports.
 */

export const CTA_SOURCES = ["forms_prefill", "appointment_packet"] as const;
export type CtaSource = (typeof CTA_SOURCES)[number];

export function parseCtaSource(raw: unknown): CtaSource | null {
  return typeof raw === "string" && (CTA_SOURCES as readonly string[]).includes(raw)
    ? (raw as CtaSource)
    : null;
}

/** Byte-exact disclaimer (U+2014 em dash). */
export const CTA_DISCLAIMER = "Preliminary guidance — not legal advice";

export type CtaCardCopy = {
  title: string;
  body: string;
  button: string;
  smallPrint: string;
};

export type SignupStepCopy = {
  heading: string;
};

export const CTA_COPY = {
  sectionHeading: "Two things we're building next",
  cards: {
    forms_prefill: {
      title: "Your visa form, field by field",
      body: "The Italian national visa application, with a walkthrough of what each field asks for and an English translation for understanding only. You fill it in yourself; Nomade explains each field and links the official form.",
      button: "Get my visa form walkthrough, field by field (Pro)",
      smallPrint: "Coming to Nomade Pro. Join the waitlist to see a sample.",
    },
    appointment_packet: {
      title: "Appointment-day packet",
      body: "Your documents in the order your consulate lists them, with a cover sheet for the fee, payment method and copies to bring. Starting with the Consulate General of Italy in New York.",
      button: "Get my appointment packet",
      smallPrint: "Coming to Nomade Pro. Join the waitlist to see a sample.",
    },
  } satisfies Record<CtaSource, CtaCardCopy>,
  underCards:
    "Nomade explains what each form asks for. It never tells you what to answer.",
  disclaimer: CTA_DISCLAIMER,
  signup: {
    headings: {
      forms_prefill: "Get early access to the field-by-field form guide",
      appointment_packet: "Get early access to the appointment packet",
    } satisfies Record<CtaSource, string>,
    emailLabel: "Email",
    button: "Join the waitlist",
    microcopy: "We'll email you when it's ready. No spam, no payment now.",
  },
  thanks: {
    heading: "You're on the list.",
    sample: {
      forms_prefill:
        "Here's a sample for a fictional applicant, Jane Sample: the official New York national visa application with only the name fields filled (1, Cognome, and 3, Nome/i), a reminder next to field 29, and a page explaining the sample. Every other field is filled in by hand. The field-by-field walkthrough and English translation are on the forms page.",
      appointment_packet: "Here's a sample New York appointment packet.",
    } satisfies Record<CtaSource, string>,
    underSample:
      "This is a sample, not your form. Only the Italian original can be submitted.",
    disclaimer: CTA_DISCLAIMER,
    secondary:
      "Want to help shape it? Reply to your confirmation email and tell us your consulate and appointment date.",
  },
} as const;

/** DOM id of each card, used by ?cta= deep links. */
export function ctaCardId(source: CtaSource): string {
  return `cta-${source}`;
}

/**
 * Studio sample assets (task 0.3 / 0.4), watermarked SAMPLE.
 * - `preview` is public (public/waitlist/preview/...), shown on the landing card.
 * - `pdf` and `pages` are private (private/waitlist-samples/...) and are only
 *   served by /api/waitlist/sample/... to a browser holding a signed
 *   signup cookie for that source.
 */
export const CTA_SAMPLES = {
  forms_prefill: {
    preview: "forms_prefill-preview.png",
    previewSourceFile: "out/png/0.2-forms-desktop-hero-1200x630.png",
    pdf: "0.3-jane-sample-national-visa-form-SAMPLE.pdf",
    pages: ["0.3-jane-sample-p-1.png"],
  },
  appointment_packet: {
    preview: "appointment_packet-preview.png",
    previewSourceFile: "out/png/0.4-ny-packet-p-1.png",
    pdf: "0.4-ny-appointment-packet-SAMPLE.pdf",
    pages: ["0.4-ny-packet-p-1.png"],
  },
} as const satisfies Record<
  CtaSource,
  { preview: string; previewSourceFile: string; pdf: string; pages: readonly string[] }
>;

export const CTA_PREVIEW_PUBLIC_DIR = "waitlist/preview";

export function ctaPreviewPublicPath(source: CtaSource): string {
  return `/${CTA_PREVIEW_PUBLIC_DIR}/${CTA_SAMPLES[source].preview}`;
}

export function ctaSampleAssetUrl(source: CtaSource, asset: string): string {
  return `/api/waitlist/sample/${source}/${encodeURIComponent(asset)}`;
}
