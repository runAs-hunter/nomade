/**
 * F4 pure merge helpers — monotonic step status + updated_at tie-break.
 * not_started < in_progress < done. Never auto-downgrade.
 * See docs/runbooks/F4-sync-merge-runbook.md.
 */

import type { JourneyStepStatus } from "@/lib/journey/catalog";

export const STATUS_RANK: Record<JourneyStepStatus, number> = {
  not_started: 0,
  in_progress: 1,
  done: 2,
};

export function statusRank(status: JourneyStepStatus): number {
  return STATUS_RANK[status];
}

/** Parse ISO / timestamptz to epoch ms; invalid → NaN. */
export function timestampMs(value: string | null | undefined): number {
  if (value == null || value === "") return Number.NaN;
  return Date.parse(value);
}

/**
 * Compare two server/client timestamps for concurrency / tie-break.
 * Returns -1 if a < b, 0 if equal (or both invalid), 1 if a > b.
 */
export function compareTimestamps(
  a: string | null | undefined,
  b: string | null | undefined,
): -1 | 0 | 1 {
  const am = timestampMs(a);
  const bm = timestampMs(b);
  if (Number.isNaN(am) && Number.isNaN(bm)) return 0;
  if (Number.isNaN(am)) return -1;
  if (Number.isNaN(bm)) return 1;
  if (am < bm) return -1;
  if (am > bm) return 1;
  return 0;
}

/** True when client expectedUpdatedAt matches server updated_at (ms equality). */
export function timestampsMatch(
  expected: string | null | undefined,
  actual: string | null | undefined,
): boolean {
  if (expected == null || expected === "") return false;
  return compareTimestamps(expected, actual) === 0;
}

export type MergeSide = {
  status: JourneyStepStatus;
  updatedAt: string;
};

export type MonotonicPick =
  | { winner: "server"; reason: "higher_rank" | "tie_newer" | "tie_equal" }
  | { winner: "client"; reason: "higher_rank" | "tie_newer" };

/**
 * Pick monotonic winner between server row and trusted client mutation.
 * Higher status rank wins. Same rank → newer updatedAt wins (server on equal).
 */
export function pickMonotonicWinner(
  server: MergeSide,
  client: MergeSide,
): MonotonicPick {
  const sr = statusRank(server.status);
  const cr = statusRank(client.status);
  if (cr > sr) return { winner: "client", reason: "higher_rank" };
  if (sr > cr) return { winner: "server", reason: "higher_rank" };
  const cmp = compareTimestamps(client.updatedAt, server.updatedAt);
  if (cmp > 0) return { winner: "client", reason: "tie_newer" };
  if (cmp < 0) return { winner: "server", reason: "tie_newer" };
  return { winner: "server", reason: "tie_equal" };
}

/**
 * Whether applying client status would change the server row under monotonic rules.
 * Downgrades and equal-status older/equal timestamps → no write.
 */
export function shouldWriteMonotonic(
  server: MergeSide,
  client: MergeSide,
): boolean {
  return pickMonotonicWinner(server, client).winner === "client";
}
