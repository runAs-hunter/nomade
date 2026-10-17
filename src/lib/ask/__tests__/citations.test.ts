import { describe, expect, it } from "vitest";
import {
  CitationStreamFilter,
  extractCitations,
  stripAllMarkers,
  stripInvalidMarkers,
} from "@/lib/ask/citations";

describe("F11b citations", () => {
  it("extracts valid numbers in first-appearance order, deduped", () => {
    expect(extractCitations("a [S2] b [S1] c [S2] d [S9] e [S0]", 3)).toEqual([2, 1]);
  });

  it("no markers → no citations", () => {
    expect(extractCitations("I think you need a lease.", 8)).toEqual([]);
  });

  it("strips out-of-range markers only", () => {
    expect(stripInvalidMarkers("x [S1] y [S9] z [S0]", 8)).toBe("x [S1] y  z ");
    expect(stripAllMarkers("x [S1] y [S2]")).toBe("x  y ");
  });

  it("stream filter holds back split markers and drops invalid ones", () => {
    const f = new CitationStreamFilter(2);
    const out = [
      f.push("Bring a lease ["),
      f.push("S"),
      f.push("1] and ["),
      f.push("S9] a deed [S"),
      f.push("2]."),
      f.flush(),
    ].join("");
    expect(out).toBe("Bring a lease [S1] and  a deed [S2].");
    expect(f.text).toBe(out);
    expect(extractCitations(f.text, 2)).toEqual([1, 2]);
  });

  it("stream filter flushes a dangling '[' as text", () => {
    const f = new CitationStreamFilter(2);
    expect(f.push("see [")).toBe("see ");
    expect(f.flush()).toBe("[");
  });
});
