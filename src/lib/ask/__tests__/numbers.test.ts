import { describe, expect, it } from "vitest";
import { extractNumbers, normalizeNumber, unsupportedNumbers } from "@/lib/ask/numbers";

describe("F11b invented-number check", () => {
  it("normalizes separators and currency formats", () => {
    expect(normalizeNumber("30,000")).toBe("30000");
    expect(normalizeNumber("30.000")).toBe("30000");
    expect(normalizeNumber("24,789.00")).toBe("24789");
    expect(normalizeNumber("1.5")).toBe("1.5");
    expect(normalizeNumber("015")).toBe("15");
  });

  it("extracts amounts, day counts, years, percentages; ignores [S#] markers", () => {
    expect(extractNumbers("At least €30,000 [S1] within 30 days, since 2024, 3% [S12]")).toEqual(["30000", "30", "2024", "3"]);
    expect(extractNumbers("No figures here [S1].")).toEqual([]);
  });

  it("flags numbers missing from cited sources' summary/title only", () => {
    const cited = [{ title: "Form AA9/12", summary: "File within 30 days. Insurance of 30.000 euros." }];
    expect(unsupportedNumbers("File AA9/12 within 30 days; €30,000 cover [S1].", cited)).toEqual([]);
    expect(unsupportedNumbers("File within 60 days [S1].", cited)).toEqual(["60"]);
    expect(unsupportedNumbers("Costs $50,000 [S1].", cited)).toEqual(["50000"]);
    expect(unsupportedNumbers("Costs 5 [S1].", [{ title: "t", summary: null }])).toEqual(["5"]);
  });
});
