/**
 * Optional fake-door landing fields (nomadevisa.com). Best-effort like
 * attribution: unknown or invalid values become null, never a rejection.
 */

export const FAKE_DOOR_TIERS = [
  "free",
  "pathpack_79",
  "review_199",
  "hero",
  "nav",
  "topbar",
  "footer",
] as const;

export const FAKE_DOOR_PATHS = [
  "digital_nomad",
  "elective_residence",
  "other",
  "unsure",
] as const;

export const FAKE_DOOR_MOVE_DATES = [
  "Within 6 months",
  "6–12 months",
  "1–2 years",
  "Just exploring",
] as const;

export const FAKE_DOOR_SOURCES = ["nomadevisa_landing"] as const;

export type FakeDoorFields = {
  tier: string | null;
  path: string | null;
  move_date: string | null;
  source: string | null;
};

function pick(raw: unknown, allowed: readonly string[]): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return allowed.includes(v) ? v : null;
}

export function sanitizeFakeDoorFields(payload: unknown): FakeDoorFields {
  const b =
    payload !== null && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  return {
    tier: pick(b.tier, FAKE_DOOR_TIERS),
    path: pick(b.path, FAKE_DOOR_PATHS),
    move_date: pick(b.move_date, FAKE_DOOR_MOVE_DATES),
    source: pick(b.source, FAKE_DOOR_SOURCES),
  };
}

/**
 * Hidden anti-bot input. Humans leave it empty. The name is deliberately
 * non-semantic so browser autofill (which keys on name/id/label words like
 * "company", "name", "email") never classifies or fills it.
 */
export const HONEYPOT_FIELD = "hp_x7";
/**
 * Pre-rename field name. Still treated as a bot signal for one release so
 * cached copies of the old landing page behave the same. Remove after that.
 */
export const LEGACY_HONEYPOT_FIELD = "company";

function isFilled(v: unknown): boolean {
  return typeof v === "string" && v.trim() !== "";
}

export function isHoneypotFilled(payload: unknown): boolean {
  if (payload === null || typeof payload !== "object") return false;
  const b = payload as Record<string, unknown>;
  return isFilled(b[HONEYPOT_FIELD]) || isFilled(b[LEGACY_HONEYPOT_FIELD]);
}
