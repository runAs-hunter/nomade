/**
 * Copies the canonical parity vectors into the iOS test bundle so the Swift
 * tests assert against byte-identical expectations shared with the web tests.
 *
 *   node scripts/sync-test-vectors.mjs
 *
 * Canonical sources → iOS destination (<iOS repo>/Nomade/NomadeTests/Fixtures/):
 *   - src/engine/__tests__/personalize-vectors.json  (Personalize engine parity)
 *   - src/data/__tests__/quiz-profile-vectors.json   (quiz buildProfile parity)
 *
 * Edit the canonical file, then run this (or `npm run gen:test-vectors`).
 */

import { copyFileSync, mkdirSync, existsSync } from "fs";
import { basename, join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const SOURCES = [
  join(REPO_ROOT, "src/engine/__tests__/personalize-vectors.json"),
  join(REPO_ROOT, "src/data/__tests__/quiz-profile-vectors.json"),
];
const IOS_DIR = process.env.NOMADE_IOS_DIR ?? join(REPO_ROOT, "..", "nomade-ios");
const DEST_DIR = join(IOS_DIR, "Nomade", "NomadeTests", "Fixtures");

if (!existsSync(IOS_DIR)) {
  console.error(`iOS repo not found: ${IOS_DIR}`);
  console.error("Set NOMADE_IOS_DIR to the native repo root if it lives elsewhere.");
  process.exit(1);
}

mkdirSync(DEST_DIR, { recursive: true });
for (const src of SOURCES) {
  const dest = join(DEST_DIR, basename(src));
  copyFileSync(src, dest);
  console.log(`✓ synced ${basename(src)} → ${dest}`);
}
