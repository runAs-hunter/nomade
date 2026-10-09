import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { collectClientAttribution } from "@/lib/waitlist/attribution-client";
import {
  ownHostsFromRequest,
  sanitizeAttributionValue,
  sanitizeWaitlistAttribution,
} from "@/lib/waitlist/attribution";

describe("collectClientAttribution", () => {
  it("reads utm_* params and the referrer hostname only", () => {
    expect(
      collectClientAttribution({
        search: "?utm_source=Reddit&utm_medium=social&utm_campaign=c1&utm_content=x&utm_term=ignored&foo=bar",
        referrer: "https://www.reddit.com/r/digitalnomad/comments/abc?x=1#y",
        ownHost: "nomade-eight.vercel.app",
      }),
    ).toEqual({
      utm_source: "Reddit",
      utm_medium: "social",
      utm_campaign: "c1",
      utm_content: "x",
      referrer_host: "www.reddit.com",
    });
  });

  it("omits same-site and unparseable referrers and empty params", () => {
    expect(
      collectClientAttribution({
        search: "?utm_source=",
        referrer: "https://nomade-eight.vercel.app/quiz",
        ownHost: "nomade-eight.vercel.app",
      }),
    ).toEqual({});
    expect(
      collectClientAttribution({ search: "", referrer: "not a url", ownHost: "x" }),
    ).toEqual({});
  });
});

describe("sanitizeAttributionValue", () => {
  it("trims, lowercases, and accepts [a-z0-9._-] up to 100", () => {
    expect(sanitizeAttributionValue("  Google.Ads_v2-x ")).toBe("google.ads_v2-x");
    expect(sanitizeAttributionValue("a".repeat(100))).toBe("a".repeat(100));
  });

  it("drops invalid values to null", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "   ",
      "a".repeat(101),
      "has space",
      "emoji🙂",
      "https://example.com/path",
      "a/b",
      42,
      true,
      ["x"],
      { x: 1 },
    ]) {
      expect(sanitizeAttributionValue(bad)).toBeNull();
    }
  });
});

describe("sanitizeWaitlistAttribution", () => {
  it("never throws on non-object payloads", () => {
    for (const payload of [null, undefined, "str", 1, []]) {
      expect(sanitizeWaitlistAttribution(payload)).toEqual({
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_content: null,
        referrer_host: null,
      });
    }
  });

  it("ignores unknown keys (no IP / user agent passthrough)", () => {
    const out = sanitizeWaitlistAttribution({ ip: "1.2.3.4", user_agent: "x", utm_source: "a" });
    expect(Object.keys(out).sort()).toEqual(
      ["referrer_host", "utm_campaign", "utm_content", "utm_medium", "utm_source"],
    );
    expect(out.utm_source).toBe("a");
  });

  it("drops a same-site referrer (www-insensitive, port-insensitive)", () => {
    const req = new Request("http://localhost:3000/api/waitlist", {
      headers: { host: "Nomade-Eight.vercel.app:443", "x-forwarded-host": "nomade.example" },
    });
    const own = ownHostsFromRequest(req);
    expect(own).toEqual(expect.arrayContaining(["localhost", "nomade-eight.vercel.app", "nomade.example"]));
    expect(sanitizeWaitlistAttribution({ referrer_host: "nomade-eight.vercel.app" }, own).referrer_host).toBeNull();
    expect(sanitizeWaitlistAttribution({ referrer_host: "www.nomade.example" }, own).referrer_host).toBeNull();
    expect(sanitizeWaitlistAttribution({ referrer_host: "t.co" }, own).referrer_host).toBe("t.co");
  });
});

describe("no new tracking", () => {
  it("client capture uses no cookies, storage, or third-party scripts", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/lib/waitlist/attribution-client.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/document\.cookie|localStorage|sessionStorage|<script|gtag|analytics/i);
  });
});
