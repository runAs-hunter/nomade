/**
 * Single-source country data generator.
 *
 * The YAML in `src/data/countries/*.yaml` is the source of truth. The native
 * iOS app can't parse YAML, so it bundles a generated JSON copy. Running this
 * script re-emits that JSON so the two never drift.
 *
 *   node scripts/gen-country-json.mjs            # regenerate all countries
 *   node scripts/gen-country-json.mjs italy      # just one
 *
 * Output: <iOS repo>/Nomade/Nomade/Resources/<slug>.json
 * The JSON is validated against CountrySchema before writing — a schema drift
 * (YAML gains a field the Swift `Codable` types don't model) fails loudly here
 * rather than silently shipping a checklist the app can't decode.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { CountrySchema } from "../src/data/schema.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const COUNTRIES_DIR = join(REPO_ROOT, "src/data/countries");

// The sibling native repo. Override with NOMADE_IOS_DIR if it lives elsewhere.
const IOS_DIR = process.env.NOMADE_IOS_DIR ?? join(REPO_ROOT, "..", "nomade-ios");
const IOS_RESOURCES = join(IOS_DIR, "Nomade", "Nomade", "Resources");

function slugsFromArgs() {
  const args = process.argv.slice(2);
  if (args.length > 0) return args;
  return readdirSync(COUNTRIES_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""));
}

if (!existsSync(IOS_RESOURCES)) {
  console.error(`iOS Resources dir not found: ${IOS_RESOURCES}`);
  console.error("Set NOMADE_IOS_DIR to the native repo root if it lives elsewhere.");
  process.exit(1);
}

for (const slug of slugsFromArgs()) {
  const yamlPath = join(COUNTRIES_DIR, `${slug}.yaml`);
  const raw = readFileSync(yamlPath, "utf-8");
  // Validate — throws on schema drift so we never emit undecodeable JSON.
  const data = CountrySchema.parse(yaml.load(raw));
  const outPath = join(IOS_RESOURCES, `${slug}.json`);
  writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n");
  const taskCount = data.phases.reduce((n, p) => n + p.tasks.length, 0);
  console.log(`✓ ${slug}: ${data.phases.length} phases, ${taskCount} tasks → ${outPath}`);
}
