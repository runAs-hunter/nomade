import { NextResponse } from "next/server";
import { getServerEnv, resetServerEnvCache } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import { WAITLIST_COPY } from "@/lib/waitlist/copy";
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
 * Public homepage waitlist. Stores the address only.
 * Does not send email. Refuses nomade-prod. nomade-dev (and local) only.
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
    const { error } = await client
      .schema("internal")
      .from("waitlist_signups")
      .insert({ email });

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
