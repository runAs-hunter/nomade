/**
 * Maps country codes (ISO 3166-1 alpha-2) to nationality group.
 * Used by the personalization engine to evaluate `nationality_group` conditions.
 *
 * EU/EEA countries get the simplified visa process for Italy's digital nomad visa.
 * All other nationalities follow the general non-EU path.
 */
export const NATIONALITY_GROUPS: Record<string, "EU" | "non-EU"> = {
  // ─── EU member states ───────────────────────────────────────────────────
  AT: "EU", // Austria
  BE: "EU", // Belgium
  BG: "EU", // Bulgaria
  HR: "EU", // Croatia
  CY: "EU", // Cyprus
  CZ: "EU", // Czech Republic
  DK: "EU", // Denmark
  EE: "EU", // Estonia
  FI: "EU", // Finland
  FR: "EU", // France
  DE: "EU", // Germany
  GR: "EU", // Greece
  HU: "EU", // Hungary
  IE: "EU", // Ireland
  IT: "EU", // Italy
  LV: "EU", // Latvia
  LT: "EU", // Lithuania
  LU: "EU", // Luxembourg
  MT: "EU", // Malta
  NL: "EU", // Netherlands
  PL: "EU", // Poland
  PT: "EU", // Portugal
  RO: "EU", // Romania
  SK: "EU", // Slovakia
  SI: "EU", // Slovenia
  ES: "EU", // Spain
  SE: "EU", // Sweden
  // ─── EEA non-EU ─────────────────────────────────────────────────────────
  IS: "EU", // Iceland
  LI: "EU", // Liechtenstein
  NO: "EU", // Norway
  // ─── Switzerland (bilateral agreements with EU) ──────────────────────────
  CH: "EU",
  // ─── All others: non-EU ──────────────────────────────────────────────────
  US: "non-EU", // United States
  GB: "non-EU", // United Kingdom
  CA: "non-EU", // Canada
  AU: "non-EU", // Australia
  NZ: "non-EU", // New Zealand
  BR: "non-EU", // Brazil
  MX: "non-EU", // Mexico
  AR: "non-EU", // Argentina
  CO: "non-EU", // Colombia
  CL: "non-EU", // Chile
  JP: "non-EU", // Japan
  KR: "non-EU", // South Korea
  SG: "non-EU", // Singapore
  TH: "non-EU", // Thailand
  IN: "non-EU", // India
  CN: "non-EU", // China
  PH: "non-EU", // Philippines
  ID: "non-EU", // Indonesia
  MY: "non-EU", // Malaysia
  VN: "non-EU", // Vietnam
  ZA: "non-EU", // South Africa
  NG: "non-EU", // Nigeria
  KE: "non-EU", // Kenya
  EG: "non-EU", // Egypt
  MA: "non-EU", // Morocco
  AE: "non-EU", // UAE
  IL: "non-EU", // Israel
  TR: "non-EU", // Turkey
  RU: "non-EU", // Russia
  UA: "non-EU", // Ukraine
  // Add more as needed. Unknown codes default to non-EU (conservative path).
};

/**
 * Returns the nationality group for a given country code.
 * Defaults to "non-EU" for unknown codes (the conservative/safe path —
 * non-EU users are shown stricter requirements, not fewer).
 */
export function getNationalityGroup(countryCode: string): "EU" | "non-EU" {
  return NATIONALITY_GROUPS[countryCode.toUpperCase()] ?? "non-EU";
}

/**
 * Common country names to ISO code mapping — used by the nationality autocomplete.
 * Partial list; extend as needed.
 */
export const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "United States": "US",
  "United Kingdom": "GB",
  Canada: "CA",
  Australia: "AU",
  "New Zealand": "NZ",
  Brazil: "BR",
  Mexico: "MX",
  Argentina: "AR",
  Colombia: "CO",
  Chile: "CL",
  Japan: "JP",
  "South Korea": "KR",
  Singapore: "SG",
  Thailand: "TH",
  India: "IN",
  China: "CN",
  Philippines: "PH",
  Indonesia: "ID",
  Malaysia: "MY",
  Vietnam: "VN",
  Germany: "DE",
  France: "FR",
  Spain: "ES",
  Italy: "IT",
  Portugal: "PT",
  Netherlands: "NL",
  Belgium: "BE",
  Sweden: "SE",
  Norway: "NO",
  Denmark: "DK",
  Switzerland: "CH",
  Austria: "AT",
  Poland: "PL",
  "Czech Republic": "CZ",
  Hungary: "HU",
  Romania: "RO",
  Greece: "GR",
  "South Africa": "ZA",
  Nigeria: "NG",
  Kenya: "KE",
  Egypt: "EG",
  Morocco: "MA",
  UAE: "AE",
  Israel: "IL",
  Turkey: "TR",
  Russia: "RU",
  Ukraine: "UA",
};
