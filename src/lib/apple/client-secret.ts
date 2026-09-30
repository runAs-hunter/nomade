/**
 * F2.6r — short-lived Sign in with Apple client_secret (ES256).
 * Fresh per call (exp = iat + 3600). Never log the JWT or the PEM.
 * JWT `sub` is the App ID (APPLE_CLIENT_ID), not a Services ID.
 */

import "server-only";
import { importPKCS8, SignJWT } from "jose";
import type { AppleSiwaConfig } from "@/lib/env";

export const APPLE_JWT_AUDIENCE = "https://appleid.apple.com";
/** Cap default: 1 hour. Apple allows longer; we do not cache the secret. */
export const APPLE_CLIENT_SECRET_TTL_SEC = 3600;

export async function buildAppleClientSecret(
  config: AppleSiwaConfig,
  nowSec?: number,
): Promise<string> {
  const key = await importPKCS8(config.privateKey, "ES256");
  const iat = nowSec ?? Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId })
    .setIssuer(config.teamId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + APPLE_CLIENT_SECRET_TTL_SEC)
    .setAudience(APPLE_JWT_AUDIENCE)
    .setSubject(config.clientId)
    .sign(key);
}
