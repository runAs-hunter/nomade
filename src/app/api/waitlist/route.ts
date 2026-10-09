import { NextResponse } from "next/server";
import { getServerEnv, resetServerEnvCache } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import { WAITLIST_COPY } from "@/lib/waitlist/copy";
import {
  ownHostsFromRequest,
  sanitizeWaitlistAttribution,
} from "@/lib/waitlist/attribution";
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

function success(): NextResponse<WaitlistBody> {
  return json({ ok: true, message: WAITLIST_COPY.success }, 200);
}

/**
 * Public homepage waitlist. Stores the address plus best-effort attribution
 * (utm_* + referrer host). Invalid attribution is dropped, never rejected.
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

  let supabaseUrl: string;
  try {
    resetServerEnvCache();
    supabaseUrl = getServerEnv().NEXT_PUBLIC_SUPABASE_URL;
  } catch {
    return failure(503);
  }

  if (isNomadeProdSupabaseUrl(supabaseUrl)) {
    return failure(503);
  }

  try {
    const client = createServiceClient();
    const insert = (row: { email: string } & Partial<typeof attribution>) =>
      client.schema("internal").from("waitlist_signups").insert(row);

    let { error } = await insert({ email, ...attribution });

    // Attribution must never fail a signup: if the row with attribution was
    // refused for any reason other than a duplicate, retry with the email only.
    if (
      error &&
      !isUniqueViolation(error) &&
      Object.values(attribution).some((v) => v !== null)
    ) {
      ({ error } = await insert({ email }));
    }

    if (error) {
      if (isUniqueViolation(error)) {
        return success();
      }
      return failure(500);
    }
    return success();
  } catch {
    return failure(503);
  }
}
