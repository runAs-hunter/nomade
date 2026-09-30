import { describe, it, expect, beforeEach } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import {
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  AppleRevokeError,
  revokeAppleAuthorizationCode,
  type FetchLike,
} from "@/lib/apple/revoke";
import type { AppleSiwaConfig } from "@/lib/env";

const CLIENT_ID = "com.izaya.Nomade";

let config: AppleSiwaConfig;

beforeEach(async () => {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  config = {
    teamId: "TEAMIDTEST",
    keyId: "KEYIDTEST1",
    privateKey: await exportPKCS8(privateKey),
    clientId: CLIENT_ID,
  };
});

function form(body: string): URLSearchParams {
  return new URLSearchParams(body);
}

describe("revokeAppleAuthorizationCode", () => {
  it("exchanges the code then revokes the refresh token", async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, body: String(init?.body ?? "") });
      if (url === APPLE_TOKEN_URL) {
        return new Response(
          JSON.stringify({
            refresh_token: "refresh-token-test",
            access_token: "access-token-test",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url === APPLE_REVOKE_URL) {
        return new Response("", { status: 200 });
      }
      throw new Error("unexpected url");
    };

    await revokeAppleAuthorizationCode({
      authorizationCode: "auth-code-test",
      config,
      fetchImpl,
      nowSec: 1_700_000_000,
    });

    expect(calls.map((c) => c.url)).toEqual([APPLE_TOKEN_URL, APPLE_REVOKE_URL]);
    const token = form(calls[0]!.body);
    expect(token.get("client_id")).toBe(CLIENT_ID);
    expect(token.get("grant_type")).toBe("authorization_code");
    expect(token.get("code")).toBe("auth-code-test");
    expect(token.get("client_secret")).toBeTruthy();
    expect(token.get("redirect_uri")).toBeNull();
    expect(token.get("client_secret")!.split(".").length).toBe(3);

    const revoke = form(calls[1]!.body);
    expect(revoke.get("client_id")).toBe(CLIENT_ID);
    expect(revoke.get("token")).toBe("refresh-token-test");
    expect(revoke.get("token_type_hint")).toBe("refresh_token");
    expect(revoke.get("client_secret")).toBe(token.get("client_secret"));
  });

  it("uses access_token when refresh_token is absent", async () => {
    const bodies: string[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      bodies.push(String(init?.body ?? ""));
      if (url === APPLE_TOKEN_URL) {
        return new Response(
          JSON.stringify({ access_token: "access-token-test" }),
          { status: 200 },
        );
      }
      return new Response("", { status: 200 });
    };
    await revokeAppleAuthorizationCode({
      authorizationCode: "auth-code-test",
      config,
      fetchImpl,
      nowSec: 1_700_000_000,
    });
    expect(form(bodies[1]!).get("token_type_hint")).toBe("access_token");
    expect(form(bodies[1]!).get("token")).toBe("access-token-test");
  });

  it("treats revoke HTTP 200 with empty body as success (already revoked)", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url === APPLE_TOKEN_URL) {
        return new Response(
          JSON.stringify({ refresh_token: "refresh-token-test" }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 200 });
    };
    await expect(
      revokeAppleAuthorizationCode({
        authorizationCode: "auth-code-test",
        config,
        fetchImpl,
        nowSec: 1_700_000_000,
      }),
    ).resolves.toBeUndefined();
  });

  it("fails closed when Apple token exchange errors and does not revoke", async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      urls.push(url);
      return new Response("nope", { status: 400 });
    };
    await expect(
      revokeAppleAuthorizationCode({
        authorizationCode: "auth-code-test",
        config,
        fetchImpl,
        nowSec: 1_700_000_000,
      }),
    ).rejects.toMatchObject({ code: "APPLE_REVOKE_FAILED" });
    expect(urls).toEqual([APPLE_TOKEN_URL]);
  });

  it("fails when the token response has no token", async () => {
    const urls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      urls.push(url);
      if (url === APPLE_TOKEN_URL) {
        return new Response(JSON.stringify({ token_type: "bearer" }), {
          status: 200,
        });
      }
      return new Response("", { status: 200 });
    };
    await expect(
      revokeAppleAuthorizationCode({
        authorizationCode: "auth-code-test",
        config,
        fetchImpl,
        nowSec: 1_700_000_000,
      }),
    ).rejects.toBeInstanceOf(AppleRevokeError);
    expect(urls).toEqual([APPLE_TOKEN_URL]);
  });

  it("fails when revoke returns non-200", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url === APPLE_TOKEN_URL) {
        return new Response(
          JSON.stringify({ refresh_token: "refresh-token-test" }),
          { status: 200 },
        );
      }
      return new Response("", { status: 400 });
    };
    try {
      await revokeAppleAuthorizationCode({
        authorizationCode: "auth-code-test",
        config,
        fetchImpl,
        nowSec: 1_700_000_000,
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppleRevokeError);
      expect((err as AppleRevokeError).code).toBe("APPLE_REVOKE_FAILED");
      expect((err as Error).message).not.toContain("refresh-token-test");
      expect((err as Error).message).not.toContain("auth-code-test");
    }
  });

  it("is misconfigured when Apple env is missing and no config is injected", async () => {
    await expect(
      revokeAppleAuthorizationCode({
        authorizationCode: "auth-code-test",
        fetchImpl: async () => {
          throw new Error("network should not be called");
        },
      }),
    ).rejects.toMatchObject({ code: "APPLE_REVOKE_MISCONFIGURED" });
  });
});
