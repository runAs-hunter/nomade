/**
 * F11b Ask Nomade — fixed strings. Do not edit without Cap/Isaias (runbook F11b).
 */
import { JOURNEY_DISCLAIMER } from "@/lib/journey/catalog";

/** Byte-for-byte disclaimer (F3/F5 lock), returned in every final event. */
export const ASK_DISCLAIMER = JOURNEY_DISCLAIMER;

/** Canned refusal (runbook F11b, verbatim). Streamed on 0 sources; clients show it on refused_*. */
export const ASK_REFUSAL =
  "I can't answer that from Nomade's official sources. Check your consulate's page or ask a qualified immigration lawyer.";

/** Max sources numbered [S1]…[S8] in one prompt (Cap decision 7). */
export const ASK_MAX_SOURCES = 8;
/** Request window (runbook): last 6 messages, each ≤ 1,000 chars. */
export const ASK_MAX_MESSAGES = 6;
export const ASK_MAX_MESSAGE_CHARS = 1000;
/** Cap decision 9. */
/**
 * Relevance floor (Cap, #34): when the best candidate scores below this, the
 * question is treated as off-topic → refusal without a model call. One
 * distinctive word (in ≤ ~1/6 of rows) plus any boost clears it.
 */
export const ASK_RELEVANCE_FLOOR = 2.0;
export const ASK_TEMPERATURE = 0.2;
export const ASK_MAX_OUTPUT_TOKENS = 600;

export const ASK_OUTCOMES = [
  "answered",
  "refused_no_source",
  "refused_uncited",
  "refused_unsupported",
  "rate_limited",
  "error",
] as const;
export type AskOutcome = (typeof ASK_OUTCOMES)[number];
