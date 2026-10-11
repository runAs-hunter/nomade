import { describe, it, expect } from "vitest";
import {
  createSourceSchema,
  isOfficialHost,
  officialUrlProblem,
  parseListQuery,
  patchSourceSchema,
  toDbColumns,
} from "@/lib/sources/validate";

const VALID_CREATE = {
  pathIds: ["italy_digital_nomad"],
  title: "Test page",
  publisher: "MAECI",
  officialUrl: "https://www.esteri.it/it/servizi-consolari-e-visti/",
  docType: "portal",
  scope: "national",
  retrievedAt: "2026-10-08",
};

describe("official host allowlist", () => {
  it("accepts official families incl. subdomains", () => {
    for (const h of [
      "prenotami.esteri.it",
      "consnewyork.esteri.it",
      "www.gazzettaufficiale.it",
      "www.normattiva.it",
      "www.poliziadistato.it",
      "www.interno.gov.it",
      "www.inps.it",
    ]) {
      expect(isOfficialHost(h)).toBe(true);
    }
  });

  it("rejects blogs and look-alikes", () => {
    for (const h of ["italyvisa.blog", "notesteri.it", "esteri.it.evil.com", "reddit.com"]) {
      expect(isOfficialHost(h)).toBe(false);
    }
  });

  it("requires https and no credentials", () => {
    expect(officialUrlProblem("http://www.esteri.it/")).toMatch(/https/);
    expect(officialUrlProblem("https://u:p@www.esteri.it/")).toMatch(/credentials/);
    expect(officialUrlProblem("not a url")).toMatch(/valid URL/);
    expect(officialUrlProblem("https://www.esteri.it/")).toBeNull();
  });
});

describe("createSourceSchema", () => {
  it("accepts a valid body and defaults country/status", () => {
    const r = createSourceSchema.safeParse(VALID_CREATE);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.country).toBe("IT");
      expect(r.data.status).toBe("active");
    }
  });

  it("rejects unofficial URLs", () => {
    const r = createSourceSchema.safeParse({ ...VALID_CREATE, officialUrl: "https://someblog.com/italy-dnv" });
    expect(r.success).toBe(false);
  });

  it("rejects operational columns (strict)", () => {
    for (const extra of [{ lastHttpStatus: 200 }, { contentHash: "x" }, { lastCheckedAt: "2026-10-08" }]) {
      expect(createSourceSchema.safeParse({ ...VALID_CREATE, ...extra }).success).toBe(false);
    }
  });

  it("rejects bad dates / doc types / path ids", () => {
    expect(createSourceSchema.safeParse({ ...VALID_CREATE, retrievedAt: "2026-02-30" }).success).toBe(false);
    expect(createSourceSchema.safeParse({ ...VALID_CREATE, docType: "blog" }).success).toBe(false);
    expect(createSourceSchema.safeParse({ ...VALID_CREATE, pathIds: ["Italy DN"] }).success).toBe(false);
  });
});

describe("patchSourceSchema", () => {
  it("requires at least one field and rejects operational ones", () => {
    expect(patchSourceSchema.safeParse({}).success).toBe(false);
    expect(patchSourceSchema.safeParse({ status: "retired" }).success).toBe(true);
    expect(patchSourceSchema.safeParse({ lastHttpStatus: 404 }).success).toBe(false);
  });
});

describe("toDbColumns", () => {
  it("maps camelCase → snake_case and drops undefined", () => {
    expect(toDbColumns({ pathIds: ["a"], officialUrl: "https://x.esteri.it/", notes: null })).toEqual({
      path_ids: ["a"],
      official_url: "https://x.esteri.it/",
      notes: null,
    });
  });
});

describe("parseListQuery", () => {
  const q = (s: string) => parseListQuery(new URL(`http://localhost/api/sources${s}`));
  it("parses pathId + q", () => {
    expect(q("?pathId=italy_digital_nomad&q=%20boston%20")).toEqual({
      ok: true,
      value: { pathId: "italy_digital_nomad", q: "boston" },
    });
  });
  it("no params → nulls", () => {
    expect(q("")).toEqual({ ok: true, value: { pathId: null, q: null } });
  });
  it("rejects malformed pathId and long q", () => {
    expect(q("?pathId=Italy%20DN").ok).toBe(false);
    expect(q(`?q=${"a".repeat(101)}`).ok).toBe(false);
  });
});
