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
    /**
     * F10 StoreKit 2 non-consumable product id (ASC → Keeper → Vercel env).
     * Optional at boot (health works); required at transaction verify.
     * NEVER invent / hardcode an ASC product id in source.
     */
    APP_STORE_JOURNEY_PRODUCT_ID: z.string().trim().min(1).optional(),
    /** Bundle id expected on verified transactions (default com.izaya.Nomade). */
    APP_STORE_BUNDLE_ID: z.string().trim().min(1).optional(),
    /** "true" accepts Sandbox (+ Xcode) transactions. Production Vercel sets true for App Review. */
    APP_STORE_ALLOW_SANDBOX: z.enum(["true", "false"]).optional(),
    /** F10 paywall flag. "true" enforces the Apply/After-arrival gate. Default OFF. */
    BILLING_GATE_ENABLED: z.enum(["true", "false"]).optional(),
    /** F11a intake flag. "true" serves /api/journey/intake + applies rules. Default OFF. */
    INTAKE_ENABLED: z.enum(["true", "false"]).optional(),
    /** F11b Ask kill switch. "true" serves POST /api/ask. Default OFF. */
    ASK_ENABLED: z.enum(["true", "false"]).optional(),
    /** F12a forms library. "true" serves GET /api/forms*. Default OFF (ships in 1.1). */
    FORMS_ENABLED: z.enum(["true", "false"]).optional(),
    /** F12a public https origin for the template PDF URL (default: Vercel production URL). */
    FORMS_PUBLIC_BASE_URL: z.string().trim().url().optional(),
    /** F11b AI Gateway model id (default anthropic/claude-sonnet-4.5). */
    ASK_MODEL: z.string().trim().min(1).optional(),
    /** F11b gateway fallback model id (default anthropic/claude-haiku-4.5; "none" disables). */
    ASK_FALLBACK_MODEL: z.string().trim().min(1).optional(),
    /** F11b Vercel AI Gateway key (Keeper → Vercel). Optional when Vercel OIDC is used. */
    AI_GATEWAY_API_KEY: z.string().trim().min(1).optional(),
    /** F11b daily question limits (positive ints). Defaults 3 / 30. */
    ASK_FREE_DAILY: z.string().trim().regex(/^[0-9]+$/).optional(),
    ASK_PAID_DAILY: z.string().trim().regex(/^[0-9]+$/).optional(),
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
    APP_STORE_JOURNEY_PRODUCT_ID: source.APP_STORE_JOURNEY_PRODUCT_ID || undefined,
    APP_STORE_BUNDLE_ID: source.APP_STORE_BUNDLE_ID || undefined,
    APP_STORE_ALLOW_SANDBOX: source.APP_STORE_ALLOW_SANDBOX || undefined,
    BILLING_GATE_ENABLED: source.BILLING_GATE_ENABLED || undefined,
    INTAKE_ENABLED: source.INTAKE_ENABLED || undefined,
    ASK_ENABLED: source.ASK_ENABLED || undefined,
    FORMS_ENABLED: source.FORMS_ENABLED || undefined,
    FORMS_PUBLIC_BASE_URL: source.FORMS_PUBLIC_BASE_URL || undefined,
    ASK_MODEL: source.ASK_MODEL || undefined,
    ASK_FALLBACK_MODEL: source.ASK_FALLBACK_MODEL || undefined,
    AI_GATEWAY_API_KEY: source.AI_GATEWAY_API_KEY || undefined,
    ASK_FREE_DAILY: source.ASK_FREE_DAILY || undefined,
    ASK_PAID_DAILY: source.ASK_PAID_DAILY || undefined,
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

export type AppStoreBillingEnv = {
  /** ASC product id from Keeper/env. Empty → MISCONFIGURED at verify time. */
  journeyProductId: string;
  bundleId: string;
  /** Accept Sandbox / Xcode environments (App Review buys in Sandbox). */
  allowSandbox: boolean;
};

const DEFAULT_APP_STORE_BUNDLE_ID = "com.izaya.Nomade";

/** F10 App Store billing config (read at request time). */
export function getAppStoreBillingConfig(
  source: EnvSource = process.env,
): AppStoreBillingEnv {
  return {
    journeyProductId: optionalTrimmed(source.APP_STORE_JOURNEY_PRODUCT_ID) ?? "",
    bundleId: optionalTrimmed(source.APP_STORE_BUNDLE_ID) ?? DEFAULT_APP_STORE_BUNDLE_ID,
    allowSandbox: optionalTrimmed(source.APP_STORE_ALLOW_SANDBOX) === "true",
  };
}

/**
 * F10 paywall flag (default OFF). When off, Apply/After-arrival writes are not
 * gated and locked details are returned, but `access` + `entitlement` stay in
 * the checklist payload. Read per request.
 */
export function isBillingGateEnabled(source: EnvSource = process.env): boolean {
  return optionalTrimmed(source.BILLING_GATE_ENABLED) === "true";
}

/**
 * F11a intake flag (default OFF). Off: /api/journey/intake → 404 INTAKE_DISABLED,
 * sync intake ops rejected, checklist ignores stored answers (export still
 * includes them). Read per request.
 */
export function isIntakeEnabled(source: EnvSource = process.env): boolean {
  return optionalTrimmed(source.INTAKE_ENABLED) === "true";
}

/** F12a forms library flag (read per request). Default OFF. */
export function isFormsEnabled(source: EnvSource = process.env): boolean {
  return optionalTrimmed(source.FORMS_ENABLED) === "true";
}

/**
 * F12a: public https origin that serves /public (template PDF). Config only,
 * never the request Host (Cap review N6). FORMS_PUBLIC_BASE_URL, else the
 * Vercel system var VERCEL_PROJECT_PRODUCTION_URL; null when neither is set
 * (clients then resolve `template.path` against their API base).
 */
export function getFormsPublicBaseUrl(source: EnvSource = process.env): string | null {
  const explicit = optionalTrimmed(source.FORMS_PUBLIC_BASE_URL);
  const candidate = explicit ?? (optionalTrimmed(source.VERCEL_PROJECT_PRODUCTION_URL) ? `https://${optionalTrimmed(source.VERCEL_PROJECT_PRODUCTION_URL)}` : undefined);
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    return u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

export const ASK_DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
export const ASK_DEFAULT_FALLBACK_MODEL = "anthropic/claude-haiku-4.5";
export const ASK_DEFAULT_FREE_DAILY = 3;
export const ASK_DEFAULT_PAID_DAILY = 30;
/** Everyone's daily limit while BILLING_GATE_ENABLED is off (Cap decision 5). */
export const ASK_UNGATED_DAILY = 10;

export type AskConfig = {
  enabled: boolean;
  model: string;
  /** Empty when ASK_FALLBACK_MODEL=none. */
  fallbackModels: string[];
  freeDaily: number;
  paidDaily: number;
};

function positiveIntOr(raw: string | undefined, fallback: number): number {
  const v = optionalTrimmed(raw);
  if (!v || !/^[0-9]+$/.test(v)) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

/**
 * F11b Ask config (read per request). ASK_ENABLED default OFF (kill switch).
 * Never returns or logs AI_GATEWAY_API_KEY (the AI SDK reads it from env).
 */
export function getAskConfig(source: EnvSource = process.env): AskConfig {
  const fallback = optionalTrimmed(source.ASK_FALLBACK_MODEL) ?? ASK_DEFAULT_FALLBACK_MODEL;
  const model = optionalTrimmed(source.ASK_MODEL) ?? ASK_DEFAULT_MODEL;
  return {
    enabled: optionalTrimmed(source.ASK_ENABLED) === "true",
    model,
    fallbackModels: fallback.toLowerCase() === "none" || fallback === model ? [] : [fallback],
    freeDaily: positiveIntOr(source.ASK_FREE_DAILY, ASK_DEFAULT_FREE_DAILY),
    paidDaily: positiveIntOr(source.ASK_PAID_DAILY, ASK_DEFAULT_PAID_DAILY),
  };
}
