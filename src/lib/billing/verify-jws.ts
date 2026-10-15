/**
 * F3.1 → F10 App Store signed transaction JWS verification (StoreKit 2).
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
  /** F10: Apple set revocationDate (refund / revoke) → entitlement inactive. */
  revoked: boolean;
  /** Apple revocationDate (ISO) when revoked. */
  revokedAtIso: string | null;
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

function msToIso(ms: unknown): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** SHA-256 fingerprint of Apple Root CA - G3 (Apple PKI published value). */
export const APPLE_ROOT_CA_G3_SHA256 =
  "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79";

/** Apple marker OIDs (as used by Apple's app-store-server-library). */
export const APPLE_LEAF_OID = "1.2.840.113635.100.6.11.1";
export const APPLE_INTERMEDIATE_OID = "1.2.840.113635.100.6.2.1";

/** DER encoding of an OBJECT IDENTIFIER (tag 06 + length + content). */
export function derEncodeOid(oid: string): Buffer {
  const parts = oid.split(".").map((p) => Number(p));
  const bytes: number[] = [parts[0]! * 40 + parts[1]!];
  for (const n of parts.slice(2)) {
    const chunk: number[] = [n & 0x7f];
    let v = Math.floor(n / 128);
    while (v > 0) {
      chunk.unshift((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    bytes.push(...chunk);
  }
  return Buffer.from([0x06, bytes.length, ...bytes]);
}

function hasExtensionOid(cert: X509Certificate, oid: string): boolean {
  return cert.raw.includes(derEncodeOid(oid));
}

function validAt(cert: X509Certificate, now: Date): boolean {
  const from = Date.parse(cert.validFrom);
  const to = Date.parse(cert.validTo);
  return Number.isFinite(from) && Number.isFinite(to) && from <= now.getTime() && now.getTime() <= to;
}

export type VerifyJwsOptions = {
  /** Trust anchor PEM. Default Apple Root CA - G3. Tests inject a generated root. */
  rootPem?: string;
  /** Validation time. Default now. */
  now?: Date;
};

export type ChainCheck = { ok: true; leafPem: string } | { ok: false; message: string };

/**
 * F10 chain policy (mirrors Apple SignedDataVerifier):
 * - x5c = [leaf, intermediate, root]; root byte-identical (SHA-256 fingerprint) to the trust anchor
 *   AND self-verifies with the anchor key. No subject-name shortcut.
 * - leaf ← intermediate ← root signatures.
 * - leaf has Apple OID 1.2.840.113635.100.6.11.1; intermediate 1.2.840.113635.100.6.2.1.
 * - leaf is not a CA; intermediate + root are CAs; all certs valid at `now`.
 */
export function verifyX5cChain(x5c: unknown, opts: VerifyJwsOptions = {}): ChainCheck {
  if (!Array.isArray(x5c) || x5c.length !== 3 || !x5c.every((c) => typeof c === "string")) {
    return { ok: false, message: "JWS x5c must be [leaf, intermediate, root]" };
  }
  try {
    const [leaf, inter, root] = (x5c as string[]).map(
      (c) => new X509Certificate(Buffer.from(c, "base64")),
    ) as [X509Certificate, X509Certificate, X509Certificate];
    const anchor = new X509Certificate(opts.rootPem ?? APPLE_ROOT_CA_G3_PEM);
    const now = opts.now ?? new Date();
    if (!opts.rootPem && anchor.fingerprint256 !== APPLE_ROOT_CA_G3_SHA256) {
      return { ok: false, message: "Embedded Apple root does not match the pinned fingerprint" };
    }

    if (root.fingerprint256 !== anchor.fingerprint256 || !root.verify(anchor.publicKey)) {
      return { ok: false, message: "Certificate chain does not terminate at the Apple root" };
    }
    if (!inter.verify(root.publicKey) || !leaf.verify(inter.publicKey)) {
      return { ok: false, message: "Certificate chain signature invalid" };
    }
    if (leaf.ca || !inter.ca || !root.ca) {
      return { ok: false, message: "Certificate CA flags invalid" };
    }
    if (!hasExtensionOid(leaf, APPLE_LEAF_OID) || !hasExtensionOid(inter, APPLE_INTERMEDIATE_OID)) {
      return { ok: false, message: "Certificate missing Apple marker OID" };
    }
    if (![leaf, inter, root].every((c) => validAt(c, now))) {
      return { ok: false, message: "Certificate outside its validity period" };
    }
    return { ok: true, leafPem: leaf.toString() };
  } catch {
    return { ok: false, message: "Certificate chain validation failed" };
  }
}

/**
 * Verify StoreKit 2 transaction JWS (compact serialization): alg ES256,
 * Apple x5c chain (see verifyX5cChain), then the leaf-key signature.
 */
export async function verifySignedTransactionJws(
  compactJws: string,
  opts: VerifyJwsOptions = {},
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

  if (header.alg !== "ES256") {
    return { ok: false, code: "UNVERIFIED", message: "JWS alg must be ES256" };
  }

  const chain = verifyX5cChain(header.x5c, opts);
  if (!chain.ok) {
    return { ok: false, code: "UNVERIFIED", message: chain.message };
  }
  const leafPem = chain.leafPem;

  let payloadBytes: Uint8Array;
  try {
    const key = await importX509(leafPem, "ES256");
    const verified = await compactVerify(trimmed, key, { algorithms: ["ES256"] });
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
  const purchaseDateIso = msToIso(payload.purchaseDate);
  if (!transactionId || !productId || !bundleId || !purchaseDateIso) {
    return {
      ok: false,
      code: "INVALID_JWS",
      message: "JWS payload missing transactionId, productId, bundleId, or purchaseDate",
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
      purchaseDateIso,
      environment:
        typeof payload.environment === "string" ? payload.environment : null,
      revoked: payload.revocationDate != null,
      revokedAtIso: payload.revocationDate != null ? (msToIso(payload.revocationDate) ?? new Date().toISOString()) : null,
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
    revoked: false,
    revokedAtIso: null,
    rawRef: "abc123rawref",
    ...overrides,
  };
}
