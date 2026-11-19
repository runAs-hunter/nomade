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
  isHoneypotFilled,
  sanitizeFakeDoorFields,
} from "@/lib/waitlist/fake-door";
import {
  checkWaitlistRateLimit,
} from "@/lib/waitlist/rate-limit";
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

function json(body: WaitlistBody, status: number, headers?: HeadersInit): NextResponse<WaitlistBody> {
  return NextResponse.json(body, { status, headers });
}

function failure(status: number, headers?: HeadersInit): NextResponse<WaitlistBody> {
  return json({ ok: false, message: WAITLIST_COPY.failure }, status, headers);
}

function success(
  sampleAccess?: { source: CtaSource; secret: string },
): NextResponse<WaitlistBody> {
  const res = json({ ok: true, message: WAITLIST_COPY.success }, 200);
  if (sampleAccess) {
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
 * (utm_* + referrer host), optional fake-door fields, and for the F12 CTA
 * cards signup_source (forms_prefill | appointment_packet; main form sends
 * none, stored null). Invalid optional values are dropped, never rejected.
 * A filled honeypot ("hp_x7", or legacy "company") gets a fake success.
 * Per-IP rate limit (~5/min) via internal.waitlist_rate_limits; fails open if
 * the store is unavailable. CTA signup sets a signed httpOnly sample cookie.
 * Refuses nomade-prod. nomade-dev (and local) only.
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

  // Honeypot: bots fill the hidden "hp_x7" field (legacy: "company").
  // Pretend success, store nothing. Checked before rate limit so bots don't
  // burn the window and real users aren't blocked by honeypot traffic.
  if (isHoneypotFilled(payload)) {
    return success();
  }

  let attribution: ReturnType<typeof sanitizeWaitlistAttribution>;
  try {
    attribution = sanitizeWaitlistAttribution(payload, ownHostsFromRequest(request));
  } catch {
    attribution = sanitizeWaitlistAttribution(null);
  }

  let fakeDoor: ReturnType<typeof sanitizeFakeDoorFields>;
  try {
    fakeDoor = sanitizeFakeDoorFields(payload);
  } catch {
    fakeDoor = sanitizeFakeDoorFields(null);
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

    // Rate limit AFTER env/prod checks so we never write counters to prod.
    // Fail-open: if the RPC/table is missing, still accept the signup.
    const decision = await checkWaitlistRateLimit(request, client);
    if (decision.limited) {
      return failure(429, {
        "Retry-After": String(decision.retryAfterSeconds),
      });
    }

    type Row = { email: string } & Partial<typeof attribution> &
      Partial<typeof fakeDoor> & { signup_source?: CtaSource };
    const insert = (row: Row) =>
      client.schema("internal").from("waitlist_signups").insert(row);
    const hasAny = (o: Record<string, string | null>) =>
      Object.values(o).some((v) => v !== null);

    // Optional fields must never fail a signup. Richest row first, then peel
    // off signup_source / fake-door / attribution on non-duplicate errors.
    const attempts: Row[] = [];
    if (signupSource && hasAny(fakeDoor)) {
      attempts.push({ email, ...attribution, ...fakeDoor, signup_source: signupSource });
    }
    if (signupSource) {
      attempts.push({ email, ...attribution, signup_source: signupSource });
    }
    if (hasAny(fakeDoor)) attempts.push({ email, ...attribution, ...fakeDoor });
    attempts.push({ email, ...attribution });
    if (hasAny(attribution)) attempts.push({ email });

    let error: Awaited<ReturnType<typeof insert>>["error"] = null;
    for (const row of attempts) {
      ({ error } = await insert(row));
      if (!error || isUniqueViolation(error)) break;
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
