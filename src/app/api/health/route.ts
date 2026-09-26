import { NextResponse } from "next/server";
import {
  getServerEnv,
  projectRefFromUrl,
  resetServerEnvCache,
} from "@/lib/env";
import { log } from "@/lib/log";
import { getRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthBody = {
  ok: boolean;
  supabase: "up" | "down";
  projectRef?: string;
  code?: string;
};

function sanitizeProjectRef(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  // Non-secret slug only; reject anything that looks like a JWT/key.
  if (ref.length > 64 || /eyJ|service_role|Bearer|\s/.test(ref)) {
    return undefined;
  }
  return ref;
}

function withRequestId(
  body: HealthBody,
  status: number,
  requestId: string,
): NextResponse<HealthBody> {
  const res = NextResponse.json(body, { status });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}

/**
 * Cheap DB ping via service role against api.f1_3_smoke (F1.3 smoke; Data API).
 * Never returns keys, JWTs, passwords, or provider error details.
 * Sets x-request-id (F1.8); keeps existing health body shape.
 */
export async function GET(request: Request): Promise<NextResponse<HealthBody>> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });
  let projectRef: string | undefined;

  try {
    // Fresh read each request (Vercel/env changes; tests).
    resetServerEnvCache();
    const env = getServerEnv();
    projectRef = sanitizeProjectRef(
      env.SUPABASE_PROJECT_REF ?? projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL),
    );

    const client = createServiceClient();
    // Ping api.f1_3_smoke: `internal` is intentionally NOT in [api].schemas
    // (Data API), so PostgREST cannot reach it even with service_role.
    const { error } = await client
      .schema("api")
      .from("f1_3_smoke")
      .select("id")
      .limit(1);

    if (error) {
      // Structured log without provider error details / secrets (F0.2 / F1.8).
      logger.warn("supabase ping failed", {
        code: "SUPABASE_PING_FAILED",
        projectRef,
      });
      const body: HealthBody = {
        ok: false,
        supabase: "down",
        code: "SUPABASE_PING_FAILED",
      };
      if (projectRef) body.projectRef = projectRef;
      return withRequestId(body, 503, requestId);
    }

    const body: HealthBody = { ok: true, supabase: "up" };
    if (projectRef) body.projectRef = projectRef;
    return withRequestId(body, 200, requestId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const code = message.startsWith("Invalid server environment")
      ? "ENV_INVALID"
      : "HEALTH_ERROR";
    logger.error("health check failed", { code, projectRef });
    const body: HealthBody = {
      ok: false,
      supabase: "down",
      code,
    };
    if (projectRef) body.projectRef = projectRef;
    return withRequestId(body, 503, requestId);
  }
}
