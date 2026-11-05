import { getServerEnv, resetServerEnvCache } from "@/lib/env";
import { log } from "@/lib/log";
import { createServiceClient } from "@/lib/supabase/server";
import { sanitizeWaitlistAttribution } from "@/lib/waitlist/attribution";
import { parseCtaSource } from "@/lib/waitlist/cta";
import { isNomadeProdSupabaseUrl } from "@/lib/waitlist/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F12 CTA tap counter (0.5 item 5). The site has no analytics, so each card
 * button tap is counted server-side: one structured log line
 * (`waitlist_cta_tap`, always) plus a best-effort row in
 * internal.waitlist_cta_taps (cta + sanitized utm_*; no email, IP, user agent
 * or referrer). If the table is missing (migration not applied) the log line
 * is still written. Always 204 for a valid cta so the UI never waits on it.
 * Refuses to write to nomade-prod.
 */
export async function POST(request: Request): Promise<Response> {
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const cta = parseCtaSource(
    payload !== null && typeof payload === "object"
      ? (payload as { cta?: unknown }).cta
      : undefined,
  );
  if (!cta) return new Response(null, { status: 400 });

  let utm: Omit<ReturnType<typeof sanitizeWaitlistAttribution>, "referrer_host">;
  try {
    const { utm_source, utm_medium, utm_campaign, utm_content } =
      sanitizeWaitlistAttribution(payload);
    utm = { utm_source, utm_medium, utm_campaign, utm_content };
  } catch {
    utm = { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null };
  }

  let stored = false;
  try {
    resetServerEnvCache();
    const url = getServerEnv().NEXT_PUBLIC_SUPABASE_URL;
    if (!isNomadeProdSupabaseUrl(url)) {
      const { error } = await createServiceClient()
        .schema("internal")
        .from("waitlist_cta_taps")
        .insert({ cta, ...utm });
      stored = !error;
    }
  } catch {
    stored = false;
  }

  log.info("waitlist_cta_tap", { cta, ...utm, stored });
  return new Response(null, { status: 204 });
}
