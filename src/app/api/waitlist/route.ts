import { NextResponse } from "next/server";
import { getServerEnv, resetServerEnvCache } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import { WAITLIST_COPY } from "@/lib/waitlist/copy";
import {
  ownHostsFromRequest,
  sanitizeWaitlistAttribution,
} from "@/lib/waitlist/attribution";
import {
  isHoneypotFilled,
  sanitizeFakeDoorFields,
} from "@/lib/waitlist/fake-door";
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
 * (utm_* + referrer host) and optional fake-door fields (tier, path, move_date,
 * source). Invalid optional values are dropped, never rejected. A filled
 * honeypot ("hp_x7", or the legacy "company" for one release) gets a fake
 * success and nothing is stored.
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

  // Honeypot: bots fill the hidden "hp_x7" field (legacy: "company").
  // Pretend success, store nothing.
  if (isHoneypotFilled(payload)) {
    return success();
  }

  // Never throws; invalid values become null so attribution can't fail a signup.
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
    type Row = { email: string } & Partial<typeof attribution> &
      Partial<typeof fakeDoor>;
    const insert = (row: Row) =>
      client.schema("internal").from("waitlist_signups").insert(row);
    const hasAny = (o: Record<string, string | null>) =>
      Object.values(o).some((v) => v !== null);

    // Optional fields must never fail a signup. Try the richest row first,
    // then fall back on any non-duplicate error: without the fake-door columns
    // (migration 20261022120000 not applied yet), then email only.
    const attempts: Row[] = [];
    if (hasAny(fakeDoor)) attempts.push({ email, ...attribution, ...fakeDoor });
    attempts.push({ email, ...attribution });
    if (hasAny(attribution)) attempts.push({ email });

    let error: Awaited<ReturnType<typeof insert>>["error"] = null;
    for (const row of attempts) {
      ({ error } = await insert(row));
      if (!error || isUniqueViolation(error)) break;
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
