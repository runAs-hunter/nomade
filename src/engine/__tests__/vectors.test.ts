/**
 * Data-driven parity tests: runs the TS `personalize` engine against the shared
 * vectors in `personalize-vectors.json`. The iOS `Personalize` engine runs the
 * SAME file (synced via `npm run gen:test-vectors`), so any divergence between
 * the two implementations surfaces as a failure on one side.
 *
 * The hand-written `personalize.test.ts` stays as the readable spec; this file
 * is the drift guard shared with Swift.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { personalize } from "../personalize";
import type { CountryData, UserProfile, PersonalizedTask } from "@/data/schema";

type TaskExpectation = {
  id: string;
  present: boolean;
  isPersonalized?: boolean;
  detailContains?: string[];
  detailNotContains?: string[];
};

type Case = {
  name: string;
  profile: UserProfile;
  expect: {
    incomeWarning?: boolean;
    totalTasksMin?: number;
    tasks?: TaskExpectation[];
  };
};

type Vectors = {
  country: CountryData;
  cases: Case[];
};

const vectors: Vectors = JSON.parse(
  readFileSync(join(__dirname, "personalize-vectors.json"), "utf-8")
);

describe("personalize() — shared TS<->Swift vectors", () => {
  for (const testCase of vectors.cases) {
    it(testCase.name, () => {
      const result = personalize(vectors.country, testCase.profile);
      const allTasks: PersonalizedTask[] = result.phases.flatMap((p) => p.tasks);
      const byId = (id: string) => allTasks.find((t) => t.id === id);

      if (testCase.expect.incomeWarning !== undefined) {
        expect(result.incomeWarning).toBe(testCase.expect.incomeWarning);
      }
      if (testCase.expect.totalTasksMin !== undefined) {
        expect(result.totalTasks).toBeGreaterThanOrEqual(testCase.expect.totalTasksMin);
      }
      for (const t of testCase.expect.tasks ?? []) {
        const task = byId(t.id);
        if (!t.present) {
          expect(task, `${t.id} should be absent`).toBeUndefined();
          continue;
        }
        expect(task, `${t.id} should be present`).toBeDefined();
        if (t.isPersonalized !== undefined) {
          expect(task!.isPersonalized).toBe(t.isPersonalized);
        }
        for (const needle of t.detailContains ?? []) {
          expect(task!.detail).toContain(needle);
        }
        for (const needle of t.detailNotContains ?? []) {
          expect(task!.detail).not.toContain(needle);
        }
      }

      // totalTasks is always consistent with rendered tasks.
      expect(result.totalTasks).toBe(allTasks.length);
    });
  }
});
