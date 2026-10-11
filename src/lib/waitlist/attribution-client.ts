/**
 * Browser-side attribution capture for the waitlist signup.
 * Reads utm_* from the page URL and the referrer HOSTNAME only (never the
 * full referrer URL). No cookies, no storage, no third-party scripts.
 * The server re-validates everything and drops anything invalid.
 */

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;

export type ClientAttribution = Partial<
  Record<(typeof UTM_PARAMS)[number] | "referrer_host", string>
>;

export function collectClientAttribution(input: {
  search: string;
  referrer: string;
  ownHost: string;
}): ClientAttribution {
  const out: ClientAttribution = {};
  try {
    const params = new URLSearchParams(input.search);
    for (const key of UTM_PARAMS) {
      const value = params.get(key);
      if (value) out[key] = value;
    }
  } catch {
    // attribution is best-effort
  }
  if (input.referrer) {
    try {
      const host = new URL(input.referrer).hostname.toLowerCase();
      if (host && host !== input.ownHost.toLowerCase()) {
        out.referrer_host = host;
      }
    } catch {
      // ignore unparseable referrer
    }
  }
  return out;
}

export function readBrowserAttribution(): ClientAttribution {
  try {
    if (typeof window === "undefined") return {};
    return collectClientAttribution({
      search: window.location.search,
      referrer: document.referrer,
      ownHost: window.location.hostname,
    });
  } catch {
    return {};
  }
}
