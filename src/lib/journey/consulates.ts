/**
 * US career consular posts for the Italy national visa (F5).
 * One booking URL. Do not scrape Prenot@Mi.
 * Other Pacific territories stay unresolved until the network page list is supplied.
 * Guam is the only extra territory encoded on the San Francisco post.
 */

export const US_VISA_BOOKING_URL = "https://prenotami.esteri.it";

export const US_CONSULATE_POST_IDS = [
  "washington",
  "boston",
  "chicago",
  "detroit",
  "houston",
  "los-angeles",
  "miami",
  "new-york",
  "philadelphia",
  "san-francisco",
] as const;

export type UsConsulatePostId = (typeof US_CONSULATE_POST_IDS)[number];

export type UsConsulatePost = {
  id: UsConsulatePostId;
  instructionUrl: string;
  /** Jurisdiction label, stored exactly as approved. */
  jurisdiction: string;
  note: string | null;
};

export const US_CONSULATE_POSTS: readonly UsConsulatePost[] = [
  {
    id: "washington",
    instructionUrl:
      "https://ambwashingtondc.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/prenotazione-appuntamenti/",
    jurisdiction:
      "District of Columbia; Maryland counties Montgomery and Prince George’s; Virginia localities Arlington, Fairfax, Alexandria, Falls Church, and Fairfax City.",
    note: "Email visti.washington@esteri.it before booking a nomad or remote-worker visa.",
  },
  {
    id: "boston",
    instructionUrl:
      "https://consboston.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/",
    jurisdiction: "Maine, Massachusetts, New Hampshire, Rhode Island, Vermont.",
    note: null,
  },
  {
    id: "chicago",
    instructionUrl:
      "https://conschicago.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/how-to-schedule-an-appointment/",
    jurisdiction:
      "Colorado, Illinois, Iowa, Kansas, Minnesota, Missouri, Nebraska, North Dakota, South Dakota, Wisconsin, Wyoming.",
    note: null,
  },
  {
    id: "detroit",
    instructionUrl:
      "https://consdetroit.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/",
    jurisdiction: "Indiana, Kentucky, Michigan, Ohio, Tennessee.",
    note: "Email appointment requests are not accepted.",
  },
  {
    id: "houston",
    instructionUrl:
      "https://conshouston.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/frequently-asked-questions-visa-appointments-prenotami/",
    jurisdiction: "Arkansas, Louisiana, Oklahoma, Texas.",
    note: "Book a national visa and say it is for digital nomad or remote work.",
  },
  {
    id: "los-angeles",
    instructionUrl:
      "https://conslosangeles.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/book-an-appointment/",
    jurisdiction:
      "Arizona, Nevada, New Mexico, and these California counties only: Imperial, Kern, Los Angeles, Orange, Riverside, Santa Barbara, San Bernardino, San Diego, San Luis Obispo, Ventura.",
    note: null,
  },
  {
    id: "miami",
    instructionUrl:
      "https://consmiami.esteri.it/en/servizi-consolari-e-visti/foreign-citizen-services/visti/",
    jurisdiction:
      "Alabama, Florida, Georgia, Mississippi, South Carolina, Puerto Rico, US Virgin Islands.",
    note: "Book national if the stay is over 90 days.",
  },
  {
    id: "new-york",
    instructionUrl:
      "https://consnewyork.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/",
    jurisdiction:
      "New York, Connecticut, Bermuda, and these New Jersey counties only: Bergen, Essex, Hudson, Hunterdon, Mercer, Middlesex, Monmouth, Morris, Passaic, Somerset, Sussex, Union, Warren.",
    note: "Confirm the slot on Prenot@Mi 3 to 10 days before.",
  },
  {
    id: "philadelphia",
    instructionUrl:
      "https://consfiladelfia.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/",
    jurisdiction:
      "Pennsylvania, Delaware, North Carolina, West Virginia; New Jersey counties that are not in the New York list; Maryland counties other than Montgomery and Prince George’s; Virginia localities other than Arlington, Fairfax, Alexandria, Falls Church, and Fairfax City.",
    note: null,
  },
  {
    id: "san-francisco",
    instructionUrl:
      "https://conssanfrancisco.esteri.it/en/servizi-consolari-e-visti/servizi-per-il-cittadino-straniero/visti/instructions-for-visas/",
    jurisdiction:
      "Alaska, Hawaii, Idaho, Montana, Oregon, Utah, Washington, California counties that are not in the Los Angeles list, and Guam.",
    note: null,
  },
];

export type UsConsulatePostView = {
  id: UsConsulatePostId;
  instructionUrl: string;
  bookingUrl: string;
  note: string | null;
  jurisdiction: string;
};

export type ResolvedUsConsulatePost = {
  postId: UsConsulatePostId;
  instructionUrl: string;
  bookingUrl: string;
  note: string | null;
};

const POST_BY_ID: Record<UsConsulatePostId, UsConsulatePost> = Object.fromEntries(
  US_CONSULATE_POSTS.map((p) => [p.id, p]),
) as Record<UsConsulatePostId, UsConsulatePost>;

/** States that are wholly one post. Keys are normalized full names. */
const WHOLE_STATE_POST: Record<string, UsConsulatePostId> = {
  maine: "boston",
  massachusetts: "boston",
  "new hampshire": "boston",
  "rhode island": "boston",
  vermont: "boston",
  colorado: "chicago",
  illinois: "chicago",
  iowa: "chicago",
  kansas: "chicago",
  minnesota: "chicago",
  missouri: "chicago",
  nebraska: "chicago",
  "north dakota": "chicago",
  "south dakota": "chicago",
  wisconsin: "chicago",
  wyoming: "chicago",
  indiana: "detroit",
  kentucky: "detroit",
  michigan: "detroit",
  ohio: "detroit",
  tennessee: "detroit",
  arkansas: "houston",
  louisiana: "houston",
  oklahoma: "houston",
  texas: "houston",
  arizona: "los-angeles",
  nevada: "los-angeles",
  "new mexico": "los-angeles",
  alabama: "miami",
  florida: "miami",
  georgia: "miami",
  mississippi: "miami",
  "south carolina": "miami",
  "puerto rico": "miami",
  "us virgin islands": "miami",
  "new york": "new-york",
  connecticut: "new-york",
  bermuda: "new-york",
  pennsylvania: "philadelphia",
  delaware: "philadelphia",
  "north carolina": "philadelphia",
  "west virginia": "philadelphia",
  alaska: "san-francisco",
  hawaii: "san-francisco",
  idaho: "san-francisco",
  montana: "san-francisco",
  oregon: "san-francisco",
  utah: "san-francisco",
  // Washington state, never the District.
  washington: "san-francisco",
  guam: "san-francisco",
};

const DC_ALIASES = new Set([
  "district of columbia",
  "washington, d.c.",
  "dc",
]);

const SPLIT_STATES = new Set([
  "new jersey",
  "maryland",
  "virginia",
  "california",
]);

const NJ_NEW_YORK_COUNTIES = new Set([
  "bergen",
  "essex",
  "hudson",
  "hunterdon",
  "mercer",
  "middlesex",
  "monmouth",
  "morris",
  "passaic",
  "somerset",
  "sussex",
  "union",
  "warren",
]);

const MD_WASHINGTON_COUNTIES = new Set(["montgomery", "prince george's"]);

const VA_WASHINGTON_LOCALITIES = new Set([
  "arlington",
  "fairfax",
  "alexandria",
  "falls church",
  "fairfax city",
]);

const CA_LOS_ANGELES_COUNTIES = new Set([
  "imperial",
  "kern",
  "los angeles",
  "orange",
  "riverside",
  "santa barbara",
  "san bernardino",
  "san diego",
  "san luis obispo",
  "ventura",
]);

function normPlace(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ");
}

function resolved(postId: UsConsulatePostId): ResolvedUsConsulatePost {
  const post = POST_BY_ID[postId];
  return {
    postId,
    instructionUrl: post.instructionUrl,
    bookingUrl: US_VISA_BOOKING_URL,
    note: post.note,
  };
}

export function listUsConsulatePosts(): UsConsulatePostView[] {
  return US_CONSULATE_POSTS.map((p) => ({
    id: p.id,
    instructionUrl: p.instructionUrl,
    bookingUrl: US_VISA_BOOKING_URL,
    note: p.note,
    jurisdiction: p.jurisdiction,
  }));
}

/**
 * Resolve a US residence to a career post.
 * Split states (NJ, MD, VA, CA) return { needsCounty: true } when county is missing.
 * Unknown state returns null. Does not guess.
 */
export function resolveUsConsulatePost(args: {
  state: string;
  county?: string;
}): ResolvedUsConsulatePost | { needsCounty: true } | null {
  const state = normPlace(args.state ?? "");
  if (!state) return null;

  if (DC_ALIASES.has(state)) {
    return resolved("washington");
  }

  if (SPLIT_STATES.has(state)) {
    const countyRaw = args.county;
    if (typeof countyRaw !== "string" || normPlace(countyRaw).length === 0) {
      return { needsCounty: true };
    }
    const county = normPlace(countyRaw);
    if (state === "new jersey") {
      return resolved(
        NJ_NEW_YORK_COUNTIES.has(county) ? "new-york" : "philadelphia",
      );
    }
    if (state === "maryland") {
      return resolved(
        MD_WASHINGTON_COUNTIES.has(county) ? "washington" : "philadelphia",
      );
    }
    if (state === "virginia") {
      return resolved(
        VA_WASHINGTON_LOCALITIES.has(county) ? "washington" : "philadelphia",
      );
    }
    return resolved(
      CA_LOS_ANGELES_COUNTIES.has(county) ? "los-angeles" : "san-francisco",
    );
  }

  const postId = WHOLE_STATE_POST[state];
  if (!postId) return null;
  return resolved(postId);
}
