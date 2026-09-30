import { describe, it, expect } from "vitest";
import {
  decodeJwt,
  decodeProtectedHeader,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
} from "jose";
import {
  APPLE_CLIENT_SECRET_TTL_SEC,
  APPLE_JWT_AUDIENCE,
  buildAppleClientSecret,
} from "@/lib/apple/client-secret";

describe("buildAppleClientSecret", () => {
  it("signs an ES256 client_secret with Apple claims (ephemeral key)", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const pem = await exportPKCS8(privateKey);
    const iat = 1_700_000_000;
    const jwt = await buildAppleClientSecret(
      {
        teamId: "TEAMIDTEST",
        keyId: "KEYIDTEST1",
        privateKey: pem,
        clientId: "com.izaya.Nomade",
      },
      iat,
    );

    const header = decodeProtectedHeader(jwt);
    expect(header.alg).toBe("ES256");
    expect(header.kid).toBe("KEYIDTEST1");

    const claims = decodeJwt(jwt);
    expect(claims.iss).toBe("TEAMIDTEST");
    expect(claims.sub).toBe("com.izaya.Nomade");
    expect(claims.aud).toBe(APPLE_JWT_AUDIENCE);
    expect(claims.iat).toBe(iat);
    expect(claims.exp).toBe(iat + APPLE_CLIENT_SECRET_TTL_SEC);

    await jwtVerify(jwt, publicKey, {
      issuer: "TEAMIDTEST",
      audience: APPLE_JWT_AUDIENCE,
      subject: "com.izaya.Nomade",
      currentDate: new Date(iat * 1000),
    });
    expect(pem).toContain("BEGIN PRIVATE KEY");
    expect(jwt.split(".").length).toBe(3);
  });
});
