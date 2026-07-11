/**
 * Server-side YAML loader with Zod validation.
 * Import dynamically per country to keep bundles small.
 */

import { readFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import { CountrySchema, type CountryData } from "@/data/schema";

const COUNTRIES_DIR = join(process.cwd(), "src/data/countries");

export function loadCountry(slug: string): CountryData {
  const filePath = join(COUNTRIES_DIR, `${slug}.yaml`);
  const raw = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw);
  return CountrySchema.parse(parsed);
}
