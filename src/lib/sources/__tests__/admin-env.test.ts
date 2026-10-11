import { describe, it, expect } from "vitest";
import { getSourcesAdminUserIds, secretTokenMatches } from "@/lib/env";

describe("getSourcesAdminUserIds", () => {
  it("parses comma/space separated UUIDs, lowercases, drops junk", () => {
    expect(
      getSourcesAdminUserIds({
        SOURCES_ADMIN_USER_IDS: " AAAAAAAA-bbbb-cccc-dddd-eeeeeeeeeeee, not-a-uuid 11111111-2222-3333-4444-555555555555 ",
      }),
    ).toEqual(["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "11111111-2222-3333-4444-555555555555"]);
  });
  it("unset → empty", () => {
    expect(getSourcesAdminUserIds({})).toEqual([]);
  });
});

describe("secretTokenMatches", () => {
  it("matches only exact equal non-empty values", () => {
    expect(secretTokenMatches("abc", "abc")).toBe(true);
    expect(secretTokenMatches("abd", "abc")).toBe(false);
    expect(secretTokenMatches("ab", "abc")).toBe(false);
    expect(secretTokenMatches(null, "abc")).toBe(false);
    expect(secretTokenMatches("", "")).toBe(false);
  });
});
