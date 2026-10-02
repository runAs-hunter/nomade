import { describe, it, expect } from "vitest";
import {
  compareTimestamps,
  pickMonotonicWinner,
  shouldWriteMonotonic,
  statusRank,
  timestampsMatch,
} from "@/lib/journey/merge";

describe("statusRank", () => {
  it("orders not_started < in_progress < done", () => {
    expect(statusRank("not_started")).toBe(0);
    expect(statusRank("in_progress")).toBe(1);
    expect(statusRank("done")).toBe(2);
    expect(statusRank("done")).toBeGreaterThan(statusRank("in_progress"));
    expect(statusRank("in_progress")).toBeGreaterThan(
      statusRank("not_started"),
    );
  });
});

describe("timestampsMatch / compareTimestamps", () => {
  it("matches equal epoch across ISO variants", () => {
    const a = "2026-10-01T16:00:00.000Z";
    const b = "2026-10-01T16:00:00.000Z";
    expect(timestampsMatch(a, b)).toBe(true);
    expect(compareTimestamps(a, "2026-10-01T17:00:00.000Z")).toBe(-1);
  });

  it("rejects mismatch", () => {
    expect(
      timestampsMatch(
        "2026-10-01T16:00:00.000Z",
        "2026-10-01T16:00:01.000Z",
      ),
    ).toBe(false);
  });
});

describe("pickMonotonicWinner", () => {
  const t0 = "2026-10-01T16:00:00.000Z";
  const t1 = "2026-10-01T17:00:00.000Z";

  it("prefers higher status rank (no silent downgrade)", () => {
    const pick = pickMonotonicWinner(
      { status: "done", updatedAt: t0 },
      { status: "in_progress", updatedAt: t1 },
    );
    expect(pick.winner).toBe("server");
    expect(shouldWriteMonotonic(
      { status: "done", updatedAt: t0 },
      { status: "in_progress", updatedAt: t1 },
    )).toBe(false);
  });

  it("applies client upgrade", () => {
    expect(
      pickMonotonicWinner(
        { status: "not_started", updatedAt: t0 },
        { status: "done", updatedAt: t0 },
      ).winner,
    ).toBe("client");
    expect(
      shouldWriteMonotonic(
        { status: "in_progress", updatedAt: t0 },
        { status: "done", updatedAt: t0 },
      ),
    ).toBe(true);
  });

  it("on same status uses newer updatedAt", () => {
    expect(
      pickMonotonicWinner(
        { status: "in_progress", updatedAt: t0 },
        { status: "in_progress", updatedAt: t1 },
      ),
    ).toEqual({ winner: "client", reason: "tie_newer" });
    expect(
      pickMonotonicWinner(
        { status: "in_progress", updatedAt: t1 },
        { status: "in_progress", updatedAt: t0 },
      ).winner,
    ).toBe("server");
  });

  it("equal status + equal time keeps server", () => {
    expect(
      pickMonotonicWinner(
        { status: "done", updatedAt: t0 },
        { status: "done", updatedAt: t0 },
      ),
    ).toEqual({ winner: "server", reason: "tie_equal" });
    expect(
      shouldWriteMonotonic(
        { status: "done", updatedAt: t0 },
        { status: "done", updatedAt: t0 },
      ),
    ).toBe(false);
  });
});
