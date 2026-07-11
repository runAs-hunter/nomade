/**
 * Single-source onboarding-quiz generator.
 *
 * `src/data/quiz.ts` is the source of truth for the 5-step quiz. The native iOS
 * app can't import TypeScript, so it bundles a generated JSON copy. Running this
 * re-emits that JSON so web and iOS never drift (eng-review decision 4A).
 *
 *   node scripts/gen-quiz-json.mjs
 *
 * Output: <iOS repo>/Nomade/Nomade/Resources/quiz.json
 * The bundle is validated against `QuizSchema` before writing — a schema drift
 * (quiz.ts gains a field the Swift `Codable` types don't model) fails loudly
 * here rather than silently shipping a quiz the app can't decode.
 */

import { writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { QUIZ, QuizSchema } from "../src/data/quiz.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// The sibling native repo. Override with NOMADE_IOS_DIR if it lives elsewhere.
const IOS_DIR = process.env.NOMADE_IOS_DIR ?? join(REPO_ROOT, "..", "nomade-ios");
const IOS_RESOURCES = join(IOS_DIR, "Nomade", "Nomade", "Resources");

if (!existsSync(IOS_RESOURCES)) {
  console.error(`iOS Resources dir not found: ${IOS_RESOURCES}`);
  console.error("Set NOMADE_IOS_DIR to the native repo root if it lives elsewhere.");
  process.exit(1);
}

// Validate — throws on schema drift so we never emit undecodeable JSON.
const quiz = QuizSchema.parse(QUIZ);
const outPath = join(IOS_RESOURCES, "quiz.json");
writeFileSync(outPath, JSON.stringify(quiz, null, 2) + "\n");
console.log(
  `✓ quiz: ${quiz.steps.length} steps, ${Object.keys(quiz.nationalityGroups).length} nationality codes → ${outPath}`
);
