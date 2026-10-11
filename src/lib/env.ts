import { timingSafeEqual } from "crypto";
import { z } from "zod";

/**
 * Server-side env contract (F1.4).
 * Validate at adapter/health runtime — do not import this module from static pages.
 */

const nonEmpty = z.string().trim().min(1, { message: "required" });

export const serverEnvSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z
      .string()
      .trim()
      .min(1, { message: "required" })
      .url({ message: "must be a valid URL" }),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
    SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
    /** Optional non-secret diagnostic (e.g. bgdrzdlenmwbpalnjiqg). */
    SUPABASE_PROJECT_REF: z.string().trim().min(1).optional(),
    /** Optional at boot so /api/health works without Anthropic. */
    ANTHROPIC_API_KEY: z.string().trim().min(1).optional(),
    /**
     * Optional at boot so /api/health works without cron config.
     * Required inside cron routes via getCronSecret() (F2.6p).
     */
    CRON_SECRET: z.string().trim().min(1).optional(),
    /**
     * F8 Official Sources admin writes. Optional comma-separated Supabase Auth
     * user UUIDs (Cap-approved admins). Unset → only the service-role Bearer
     * may write. Read inside getSourcesAdminUserIds().
     */
    SOURCES_ADMIN_USER_IDS: z.string().trim().min(1).optional(),
    /**
     * F2.6r Apple SIWA revoke. Optional at boot (health still works).
     * Required together inside getAppleSiwaConfig() when revoking.
     * APPLE_CLIENT_ID is the App ID (com.izaya.Nomade) — not a Services ID.
     * APPLE_PRIVATE_KEY is the .p8 PEM (Keeper → Preview/local only).
     */
    APPLE_TEAM_ID: z.string().trim().min(1).optional(),
    APPLE_KEY_ID: z.string().trim().min(1).optional(),
    APPLE_PRIVATE_KEY: z.string().trim().min(1).optional(),
    APPLE_CLIENT_ID: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (looksLikeServiceRoleJwt(data.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
        message:
          "must not be a service_role key (never place service role under NEXT_PUBLIC_*)",
      });
    }
    if (data.NEXT_PUBLIC_SUPABASE_ANON_KEY === data.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
        message: "must not equal SUPABASE_SERVICE_ROLE_KEY",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Decode JWT payload (no verify) and detect role=service_role. */
export function looksLikeServiceRoleJwt(token: string): boolean {
  const parts = token.split(".");
  if (parts.length < 2) return false;
  try {
    const json = Buffer.from(parts[1]!, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return /service_role/i.test(token);
  }
}

/** Human-readable error listing variable NAMES only (never values). */
export function formatEnvError(error: z.ZodError): string {
  const names = new Set<string>();
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "env";
    names.add(`${key}: ${issue.message}`);
  }
  return `Invalid server environment: ${[...names].join("; ")}`;
}

type EnvSource = Record<string, string | undefined>;

/**
 * Parse a plain object (tests) or process.env.
 * Rejects accidental NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY.
 */
export function parseServerEnv(source: EnvSource = process.env): ServerEnv {
  if (source.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Invalid server environment: NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY must not be set (service role is server-only; use SUPABASE_SERVICE_ROLE_KEY)",
    );
  }

  const result = serverEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_PROJECT_REF: source.SUPABASE_PROJECT_REF || undefined,
    ANTHROPIC_API_KEY: source.ANTHROPIC_API_KEY || undefined,
    CRON_SECRET: source.CRON_SECRET || undefined,
    SOURCES_ADMIN_USER_IDS: source.SOURCES_ADMIN_USER_IDS || undefined,
    APPLE_TEAM_ID: source.APPLE_TEAM_ID || undefined,
    APPLE_KEY_ID: source.APPLE_KEY_ID || undefined,
    APPLE_PRIVATE_KEY: source.APPLE_PRIVATE_KEY || undefined,
    APPLE_CLIENT_ID: source.APPLE_CLIENT_ID || undefined,
  });

  if (!result.success) {
    throw new Error(formatEnvError(result.error));
  }
  return result.data;
}

let cached: ServerEnv | undefined;

/** Lazy singleton — safe for Next static pages that never call it. */
export function getServerEnv(): ServerEnv {
  if (!cached) {
    cached = parseServerEnv();
  }
  return cached;
}

/** Test helper. */
export function resetServerEnvCache(): void {
  cached = undefined;
}

/** Extract project ref from https://<ref>.supabase.co (undefined for local). */
export function projectRefFromUrl(url: string): string | undefined {
  try {
    const host = new URL(url).hostname;
    const m = /^([a-z0-9]+)\.supabase\.co$/i.exec(host);
    return m?.[1];
  } catch {
    return undefined;
  }
}

export type AppleSiwaConfig = {
  teamId: string;
  keyId: string;
  /** PKCS#8 PEM. Never log. */
  privateKey: string;
  /** App ID / bundle ID. Not a Services ID. */
  clientId: string;
};

function optionalTrimmed(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Vercel often stores multiline PEMs as a single line with literal \\n.
 * Strips one pair of surrounding quotes. Never log the result.
 */
export function normalizeApplePrivateKey(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

/**
 * Apple SIWA Key config for token revoke (F2.6r).
 * Optional in parseServerEnv; required here so /api/health still boots without it.
 * Never log the returned private key.
 */
export function getAppleSiwaConfig(source: EnvSource = process.env): AppleSiwaConfig {
  const teamId = optionalTrimmed(source.APPLE_TEAM_ID);
  const keyId = optionalTrimmed(source.APPLE_KEY_ID);
  const privateKeyRaw = optionalTrimmed(source.APPLE_PRIVATE_KEY);
  const clientId = optionalTrimmed(source.APPLE_CLIENT_ID);
  if (!teamId || !keyId || !privateKeyRaw || !clientId) {
    throw new Error(
      "Invalid server environment: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_CLIENT_ID: required for Apple token revoke",
    );
  }
  return {
    teamId,
    keyId,
    privateKey: normalizeApplePrivateKey(privateKeyRaw),
    clientId,
  };
}

/**
 * CRON_SECRET for cron routes (F2.6p).
 * Optional in parseServerEnv; required here so /api/health still boots without it.
 * Never log the returned value.
 */
export function getCronSecret(source: EnvSource = process.env): string {
  const raw = source.CRON_SECRET;
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error(
      "Invalid server environment: CRON_SECRET: required for cron routes",
    );
  }
  return value;
}

/**
 * Constant-time Bearer match for cron Authorization header.
 * Never logs the header or secret. Returns false on missing/wrong shape.
 */
export function cronAuthorizationMatches(
  authorization: string | null,
  secret: string,
): boolean {
  if (!authorization || !authorization.startsWith("Bearer ")) return false;
  const token = authorization.slice("Bearer ".length);
  if (!token || !secret) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}


const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * F8: Cap-approved admin user ids for /api/sources writes.
 * Comma/whitespace separated UUIDs; invalid entries ignored. Empty when unset.
 */
export function getSourcesAdminUserIds(
  source: EnvSource = process.env,
): string[] {
  const raw = source.SOURCES_ADMIN_USER_IDS;
  if (typeof raw !== "string") return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => UUID_RE.test(s));
}

/**
 * Constant-time compare of a Bearer token against a server secret.
 * Never logs either value. False on empty/mismatched length.
 */
export function secretTokenMatches(token: string | null, secret: string): boolean {
  if (!token || !secret) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
