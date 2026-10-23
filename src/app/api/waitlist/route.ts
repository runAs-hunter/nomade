import { NextResponse } from "next/server";
import { getServerEnv, resetServerEnvCache } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import { WAITLIST_COPY } from "@/lib/waitlist/copy";
import {
  ownHostsFromRequest,
  sanitizeWaitlistAttribution,
} from "@/lib/waitlist/attribution";
import { parseCtaSource, type CtaSource } from "@/lib/waitlist/cta";
import {
  SAMPLE_ACCESS_MAX_AGE_SECONDS,
  sampleAccessCookieName,
  signSampleAccess,
} from "@/lib/waitlist/sample-access";
import {
  isNomadeProdSupabaseUrl,
  isUniqueViolation,
  normalizeWaitlistEmail,
} from "@/lib/waitlist/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WaitlistBody = {
  ok: boolean;
  message: string;
};

function json(body: WaitlistBody, status: number): NextResponse<WaitlistBody> {
  return NextResponse.json(body, { status });
}

function failure(status: number): NextResponse<WaitlistBody> {
  return json({ ok: false, message: WAITLIST_COPY.failure }, status);
}

function success(
  sampleAccess?: { source: CtaSource; secret: string },
): NextResponse<WaitlistBody> {
  const res = json({ ok: true, message: WAITLIST_COPY.success }, 200);
  if (sampleAccess) {
    // Unlocks the full Studio sample for this source on the thank-you page.
    res.cookies.set(
      sampleAccessCookieName(sampleAccess.source),
      signSampleAccess(sampleAccess.secret, sampleAccess.source),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SAMPLE_ACCESS_MAX_AGE_SECONDS,
      },
    );
  }
  return res;
}

/**
 * Public homepage waitlist. Stores the address plus best-effort attribution
 * (utm_* + referrer host) and, for the F12 CTA cards, signup_source
 * (forms_prefill | appointment_packet; the main form sends none, stored null).
 * Invalid attribution or source is dropped, never rejected. A CTA signup sets
 * a signed httpOnly cookie that unlocks that source's sample.
 * No IP, no user agent. Does not send email. Refuses nomade-prod. nomade-dev (and local) only.
 */
export async function POST(request: Request): Promise<NextResponse<WaitlistBody>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return failure(400);
  }

  const email = normalizeWaitlistEmail(
    payload !== null && typeof payload === "object" && "email" in payload
      ? (payload as { email?: unknown }).email
      : undefined,
  );
  if (!email) {
    return failure(400);
  }

  // Never throws; invalid values become null so attribution can't fail a signup.
  let attribution: ReturnType<typeof sanitizeWaitlistAttribution>;
  try {
    attribution = sanitizeWaitlistAttribution(payload, ownHostsFromRequest(request));
  } catch {
    attribution = sanitizeWaitlistAttribution(null);
  }

  const signupSource = parseCtaSource(
    payload !== null && typeof payload === "object" && "signup_source" in payload
      ? (payload as { signup_source?: unknown }).signup_source
      : undefined,
  );

  let supabaseUrl: string;
  let serviceRoleKey: string;
  try {
    resetServerEnvCache();
    const env = getServerEnv();
    supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  } catch {
    return failure(503);
  }

  if (isNomadeProdSupabaseUrl(supabaseUrl)) {
    return failure(503);
  }

  try {
    const client = createServiceClient();
    const insert = (
      row: { email: string } & Partial<typeof attribution> & {
        signup_source?: CtaSource;
      },
    ) => client.schema("internal").from("waitlist_signups").insert(row);

    let { error } = signupSource
      ? await insert({ email, ...attribution, signup_source: signupSource })
      : await insert({ email, ...attribution });

    // signup_source must never fail a signup (e.g. before its migration is
    // applied): on any non-duplicate refusal, retry without it.
    if (error && !isUniqueViolation(error) && signupSource) {
      ({ error } = await insert({ email, ...attribution }));
    }

    // Attribution must never fail a signup: if the row with attribution was
    // refused for any reason other than a duplicate, retry with the email only.
    if (
      error &&
      !isUniqueViolation(error) &&
      Object.values(attribution).some((v) => v !== null)
    ) {
      ({ error } = await insert({ email }));
    }

    const sampleAccess = signupSource
      ? { source: signupSource, secret: serviceRoleKey }
      : undefined;
    if (error) {
      if (isUniqueViolation(error)) {
        return success(sampleAccess);
      }
      return failure(500);
    }
    return success(sampleAccess);
  } catch {
    return failure(503);
  }
}
