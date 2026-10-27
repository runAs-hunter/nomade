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

/** Hidden "company" input. Humans leave it empty. */
export function isHoneypotFilled(payload: unknown): boolean {
  if (payload === null || typeof payload !== "object") return false;
  const v = (payload as Record<string, unknown>).company;
  return typeof v === "string" && v.trim() !== "";
}
