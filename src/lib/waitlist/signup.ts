/**
 * Homepage waitlist email normalization and nomade-prod refusal.
 * Storage is internal.waitlist_signups via the service-role client only.
 */

/** RFC 5321 practical maximum for an email address. */
export const WAITLIST_EMAIL_MAX_LENGTH = 254;

/** nomade-prod project ref. Never write waitlist rows there. */
export const NOMADE_PROD_PROJECT_REF = "whjzynfsifrtrxlylrww";

const BASIC_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeWaitlistEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > WAITLIST_EMAIL_MAX_LENGTH) return null;
  if (!BASIC_EMAIL.test(email)) return null;
  return email;
}

/**
 * True when the configured Supabase URL host contains the nomade-prod ref.
 * Invalid URLs are not treated as prod here; env parsing rejects them first.
 */
export function isNomadeProdSupabaseUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes(NOMADE_PROD_PROJECT_REF);
  } catch {
    return false;
  }
}

export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}
