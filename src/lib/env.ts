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
