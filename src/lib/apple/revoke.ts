/**
 * F2.6r — exchange a native SIWA authorization code, then revoke the token.
 * client_id is the App ID. No Services ID. No token persistence.
 * Never log codes, client_secret JWTs, refresh tokens, or Apple response bodies.
 */

import "server-only";
import { buildAppleClientSecret } from "@/lib/apple/client-secret";
import { getAppleSiwaConfig, type AppleSiwaConfig } from "@/lib/env";

export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
export const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";

export type AppleRevokeFailureCode =
  | "APPLE_REVOKE_FAILED"
  | "APPLE_REVOKE_MISCONFIGURED";

export class AppleRevokeError extends Error {
  readonly code: AppleRevokeFailureCode;

  constructor(code: AppleRevokeFailureCode, message: string) {
    super(message);
    this.name = "AppleRevokeError";
    this.code = code;
  }
}

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

type TokenJson = {
  refresh_token?: unknown;
  access_token?: unknown;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function postForm(
  fetchImpl: FetchLike,
  url: string,
  params: URLSearchParams,
): Promise<Response> {
  return fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}

/**
 * Exchange `authorizationCode` at Apple /auth/token (no redirect_uri — native),
 * then POST /auth/revoke. Prefer refresh_token. HTTP 200 (empty body) is success,
 * including when Apple already considers the token revoked.
 */
export async function revokeAppleAuthorizationCode(opts: {
  authorizationCode: string;
  config?: AppleSiwaConfig;
  fetchImpl?: FetchLike;
  nowSec?: number;
}): Promise<void> {
  let config: AppleSiwaConfig;
  if (opts.config) {
    config = opts.config;
  } else {
    try {
      config = getAppleSiwaConfig();
    } catch {
      throw new AppleRevokeError(
        "APPLE_REVOKE_MISCONFIGURED",
        "Apple SIWA revoke config is missing",
      );
    }
  }

  const code = opts.authorizationCode.trim();
  if (!code) {
    throw new AppleRevokeError(
      "APPLE_REVOKE_FAILED",
      "Apple token revoke failed",
    );
  }

  let clientSecret: string;
  try {
    clientSecret = await buildAppleClientSecret(config, opts.nowSec);
  } catch {
    throw new AppleRevokeError(
      "APPLE_REVOKE_FAILED",
      "Apple token revoke failed",
    );
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const tokenParams = new URLSearchParams({
    client_id: config.clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
  });

  let tokenRes: Response;
  try {
    tokenRes = await postForm(fetchImpl, APPLE_TOKEN_URL, tokenParams);
  } catch {
    throw new AppleRevokeError(
      "APPLE_REVOKE_FAILED",
      "Apple token revoke failed",
    );
  }
  if (!tokenRes.ok) {
    throw new AppleRevokeError(
      "APPLE_REVOKE_FAILED",
      "Apple token revoke failed",
    );
  }

  let tokenJson: TokenJson;
  try {
    tokenJson = (await tokenRes.json()) as TokenJson;
  } catch {
    throw new AppleRevokeError(
      "APPLE_REVOKE_FAILED",
      "Apple token revoke failed",
    );
  }

  const refresh = nonEmptyString(tokenJson.refresh_token);
  const access = nonEmptyString(tokenJson.access_token);
  const token = refresh ?? access;
  if (!token) {
    throw new AppleRevokeError(
      "APPLE_REVOKE_FAILED",
      "Apple token revoke failed",
    );
  }

  const revokeParams = new URLSearchParams({
    client_id: config.clientId,
    client_secret: clientSecret,
    token,
    token_type_hint: refresh ? "refresh_token" : "access_token",
  });

  let revokeRes: Response;
  try {
    revokeRes = await postForm(fetchImpl, APPLE_REVOKE_URL, revokeParams);
  } catch {
    throw new AppleRevokeError(
      "APPLE_REVOKE_FAILED",
      "Apple token revoke failed",
    );
  }
  if (!revokeRes.ok) {
    throw new AppleRevokeError(
      "APPLE_REVOKE_FAILED",
      "Apple token revoke failed",
    );
  }
}
