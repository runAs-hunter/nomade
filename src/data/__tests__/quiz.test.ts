/**
 * Data-driven parity tests for the quiz's profile-building logic. Runs the TS
 * `buildProfile` against the shared vectors in `quiz-profile-vectors.json`. The
 * iOS `QuizData.buildProfile` runs the SAME file (synced via
 * `npm run gen:test-vectors`), so any divergence in the nationality
 * special-case resolution surfaces as a failure on one side.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildProfile, QuizSchema, QUIZ } from "@/data/quiz";
import type { UserProfile } from "@/data/schema";

type Case = {
  name: string;
  answers: Record<string, string>;
  expected: UserProfile;
};

type Vectors = { cases: Case[] };

const vectors: Vectors = JSON.parse(
  readFileSync(join(__dirname, "quiz-profile-vectors.json"), "utf-8")
);

describe("buildProfile() — shared TS<->Swift vectors", () => {
  for (const testCase of vectors.cases) {
    it(testCase.name, () => {
      expect(buildProfile(testCase.answers)).toEqual(testCase.expected);
    });
  }
});

describe("QUIZ bundle", () => {
  it("validates against QuizSchema", () => {
    expect(() => QuizSchema.parse(QUIZ)).not.toThrow();
  });

  it("has the five expected steps in order", () => {
    expect(QUIZ.steps.map((s) => s.id)).toEqual([
      "income_type",
      "income_range",
      "nationality",
      "residence",
      "traveling_with",
    ]);
  });

  it("maps a known EU and non-EU code", () => {
    expect(QUIZ.nationalityGroups.DE).toBe("EU");
    expect(QUIZ.nationalityGroups.US).toBe("non-EU");
  });
});
