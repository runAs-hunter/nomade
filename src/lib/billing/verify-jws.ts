/**
 * F3.1 App Store signed transaction JWS verification (StoreKit 2).
 *
 * Verifies compact JWS via x5c leaf key; chain must terminate at Apple Root CA - G3
 * (public cert — also mirrored in certs/AppleRootCA-G3.pem). Never log JWS bodies.
 *
 * Unit tests inject VerifySignedTransactionFn — no Apple network / live JWS required.
 */

import { createHash, X509Certificate } from "crypto";
import { decodeProtectedHeader, compactVerify, importX509 } from "jose";

/** Public Apple Root CA - G3 (Apple PKI). Not a secret. */
export const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----
`;

export type VerifiedAppStoreTransaction = {
  transactionId: string;
  originalTransactionId: string | null;
  productId: string;
  bundleId: string;
  purchaseDateIso: string;
  environment: string | null;
  /** SHA-256 hex of the compact JWS — store as raw_ref, never the JWS. */
  rawRef: string;
};

export type VerifyJwsResult =
  | { ok: true; transaction: VerifiedAppStoreTransaction }
  | { ok: false; code: "INVALID_JWS" | "UNVERIFIED"; message: string };

export type VerifySignedTransactionFn = (
  compactJws: string,
) => Promise<VerifyJwsResult>;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function pemFromX5c(b64: string): string {
  const der = Buffer.from(b64, "base64");
  const b64body = der.toString("base64");
  const lines = b64body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

function msToIso(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Verify StoreKit 2 transaction JWS (compact serialization).
 * x5c chain: leaf → intermediate → (root). Must chain to Apple Root CA - G3.
 */
export async function verifySignedTransactionJws(
  compactJws: string,
): Promise<VerifyJwsResult> {
  const trimmed = compactJws.trim();
  if (!trimmed || trimmed.split(".").length !== 3) {
    return {
      ok: false,
      code: "INVALID_JWS",
      message: "signedTransaction must be a compact JWS",
    };
  }

  let header: { alg?: string; x5c?: string[] };
  try {
    header = decodeProtectedHeader(trimmed) as { alg?: string; x5c?: string[] };
  } catch {
    return { ok: false, code: "INVALID_JWS", message: "Malformed JWS header" };
  }

  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) {
    return {
      ok: false,
      code: "UNVERIFIED",
      message: "JWS missing x5c certificate chain",
    };
  }

  let leafPem: string;
  try {
    leafPem = pemFromX5c(x5c[0]!);
  } catch {
    return {
      ok: false,
      code: "UNVERIFIED",
      message: "Invalid x5c leaf certificate",
    };
  }

  try {
    const chain = x5c.map((c) => new X509Certificate(Buffer.from(c, "base64")));
    const appleRoot = new X509Certificate(APPLE_ROOT_CA_G3_PEM);

    for (let i = 0; i < chain.length - 1; i++) {
      if (!chain[i]!.verify(chain[i + 1]!.publicKey)) {
        return {
          ok: false,
          code: "UNVERIFIED",
          message: "Certificate chain signature invalid",
        };
      }
    }

    const last = chain[chain.length - 1]!;
    const lastIsAppleRoot =
      last.fingerprint512 === appleRoot.fingerprint512 ||
      /Apple Root CA - G3/i.test(last.subject);
    if (!lastIsAppleRoot && !last.verify(appleRoot.publicKey)) {
      return {
        ok: false,
        code: "UNVERIFIED",
        message: "Certificate chain does not terminate at Apple Root CA - G3",
      };
    }
  } catch {
    return {
      ok: false,
      code: "UNVERIFIED",
      message: "Certificate chain validation failed",
    };
  }

  let payloadBytes: Uint8Array;
  try {
    const key = await importX509(leafPem, "ES256");
    const verified = await compactVerify(trimmed, key);
    payloadBytes = verified.payload;
  } catch {
    return {
      ok: false,
      code: "UNVERIFIED",
      message: "JWS signature verification failed",
    };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(payloadBytes).toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return { ok: false, code: "INVALID_JWS", message: "JWS payload is not JSON" };
  }

  const transactionId =
    typeof payload.transactionId === "string" ? payload.transactionId : null;
  const productId =
    typeof payload.productId === "string" ? payload.productId : null;
  const bundleId =
    typeof payload.bundleId === "string" ? payload.bundleId : null;
  if (!transactionId || !productId || !bundleId) {
    return {
      ok: false,
      code: "INVALID_JWS",
      message: "JWS payload missing transactionId, productId, or bundleId",
    };
  }

  if (payload.revocationDate != null) {
    return {
      ok: false,
      code: "UNVERIFIED",
      message: "Transaction has been revoked",
    };
  }

  return {
    ok: true,
    transaction: {
      transactionId,
      originalTransactionId:
        typeof payload.originalTransactionId === "string"
          ? payload.originalTransactionId
          : null,
      productId,
      bundleId,
      purchaseDateIso: msToIso(payload.purchaseDate) ?? new Date().toISOString(),
      environment:
        typeof payload.environment === "string" ? payload.environment : null,
      rawRef: sha256Hex(trimmed),
    },
  };
}

/** Test helper — build a verified transaction without crypto. */
export function verifiedTransactionFixture(
  overrides?: Partial<VerifiedAppStoreTransaction>,
): VerifiedAppStoreTransaction {
  return {
    transactionId: "txn-test-001",
    originalTransactionId: "txn-orig-001",
    productId: "env-configured-product",
    bundleId: "com.izaya.Nomade",
    purchaseDateIso: "2026-10-02T12:00:00.000Z",
    environment: "Sandbox",
    rawRef: "abc123rawref",
    ...overrides,
  };
}
