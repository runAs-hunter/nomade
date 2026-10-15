/**
 * F10: real-crypto tests for the App Store x5c chain policy.
 * Certs/keys are generated at test time with openssl into a temp dir —
 * no key material is committed. The generated root stands in for
 * Apple Root CA - G3 via the `rootPem` option.
 */
import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CompactSign, importPKCS8 } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APPLE_INTERMEDIATE_OID,
  APPLE_LEAF_OID,
  APPLE_ROOT_CA_G3_PEM,
  APPLE_ROOT_CA_G3_SHA256,
  derEncodeOid,
  verifySignedTransactionJws,
} from "@/lib/billing/verify-jws";

let dir = "";
const ssl = (...args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
const read = (f: string) => readFileSync(path.join(dir, f), "utf8");
const b64 = (pemFile: string) =>
  read(pemFile).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");

function key(name: string, curve = "P-256") {
  ssl("genpkey", "-algorithm", "EC", "-pkeyopt", `ec_paramgen_curve:${curve}`, "-out", `${name}.key`);
}
function selfSigned(name: string, cn: string) {
  key(name);
  ssl("req", "-x509", "-new", "-key", `${name}.key`, "-subj", `/CN=${cn}`, "-days", "3650",
    "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign",
    "-out", `${name}.pem`);
}
function issued(name: string, issuer: string, ext: string, curve = "P-256") {
  key(name, curve);
  writeFileSync(path.join(dir, `${name}.ext`), ext);
  ssl("req", "-new", "-key", `${name}.key`, "-subj", `/CN=${name}`, "-out", `${name}.csr`);
  ssl("x509", "-req", "-in", `${name}.csr`, "-CA", `${issuer}.pem`, "-CAkey", `${issuer}.key`,
    "-CAcreateserial", "-days", "3650", "-extfile", `${name}.ext`, "-out", `${name}.pem`);
}
const INTER_EXT = `basicConstraints=critical,CA:TRUE\n${APPLE_INTERMEDIATE_OID}=ASN1:NULL\n`;
const LEAF_EXT = `basicConstraints=critical,CA:FALSE\n${APPLE_LEAF_OID}=ASN1:NULL\n`;

const PAYLOAD = {
  transactionId: "2000000123456789",
  originalTransactionId: "2000000123456789",
  productId: "test.product",
  bundleId: "com.izaya.Nomade",
  purchaseDate: Date.UTC(2026, 9, 14),
  environment: "Sandbox",
};

async function sign(leaf: string, chain: string[], opts: { alg?: string; payload?: object } = {}) {
  const pk = await importPKCS8(read(`${leaf}.key`), "ES256");
  return new CompactSign(new TextEncoder().encode(JSON.stringify(opts.payload ?? PAYLOAD)))
    .setProtectedHeader({ alg: opts.alg ?? "ES256", x5c: chain.map(b64) })
    .sign(pk);
}

let rootPem = "";

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "f10-x5c-"));
  selfSigned("root", "Apple Root CA - G3");
  issued("inter", "root", INTER_EXT);
  issued("leaf", "inter", LEAF_EXT);
  // Attacker chain: self-signed root with the same subject name.
  selfSigned("fakeroot", "Apple Root CA - G3");
  issued("fakeinter", "fakeroot", INTER_EXT);
  issued("fakeleaf", "fakeinter", LEAF_EXT);
  // Second genuine intermediate (for a broken chain) and one without the Apple OID.
  issued("inter2", "root", INTER_EXT);
  issued("internooid", "root", "basicConstraints=critical,CA:TRUE\n");
  issued("leafnooid", "internooid", LEAF_EXT);
  issued("leafca", "inter", `basicConstraints=critical,CA:TRUE\n${APPLE_LEAF_OID}=ASN1:NULL\n`);
  rootPem = read("root.pem");
}, 60_000);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("F10 x5c chain (real crypto)", () => {
  it("accepts a valid ES256 chain to the trust anchor", async () => {
    const jws = await sign("leaf", ["leaf.pem", "inter.pem", "root.pem"]);
    const r = await verifySignedTransactionJws(jws, { rootPem });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.transaction.transactionId).toBe(PAYLOAD.transactionId);
      expect(r.transaction.environment).toBe("Sandbox");
      expect(r.transaction.rawRef).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("rejects a self-signed fake root named 'Apple Root CA - G3' (real Apple anchor)", async () => {
    const jws = await sign("fakeleaf", ["fakeleaf.pem", "fakeinter.pem", "fakeroot.pem"]);
    const r = await verifySignedTransactionJws(jws);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UNVERIFIED");
  });

  it("rejects a fake root even when its subject matches the configured anchor", async () => {
    const jws = await sign("fakeleaf", ["fakeleaf.pem", "fakeinter.pem", "fakeroot.pem"]);
    expect((await verifySignedTransactionJws(jws, { rootPem })).ok).toBe(false);
  });

  it("rejects a broken chain (leaf not signed by the presented intermediate)", async () => {
    const jws = await sign("leaf", ["leaf.pem", "inter2.pem", "root.pem"]);
    const r = await verifySignedTransactionJws(jws, { rootPem });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/signature invalid/);
  });

  it("rejects a 2-cert chain (root omitted)", async () => {
    const jws = await sign("leaf", ["leaf.pem", "inter.pem"]);
    expect((await verifySignedTransactionJws(jws, { rootPem })).ok).toBe(false);
  });

  it("rejects expired certificates", async () => {
    const jws = await sign("leaf", ["leaf.pem", "inter.pem", "root.pem"]);
    const r = await verifySignedTransactionJws(jws, { rootPem, now: new Date(Date.UTC(2099, 0, 1)) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/validity/);
  });

  it("rejects a wrong alg header", async () => {
    const good = await sign("leaf", ["leaf.pem", "inter.pem", "root.pem"]);
    const [, payload, sig] = good.split(".");
    const header = Buffer.from(JSON.stringify({ alg: "ES384", x5c: ["leaf.pem", "inter.pem", "root.pem"].map(b64) })).toString("base64url");
    const r = await verifySignedTransactionJws(`${header}.${payload}.${sig}`, { rootPem });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/ES256/);
  });

  it("rejects a missing Apple intermediate OID and a CA leaf", async () => {
    const noOid = await sign("leafnooid", ["leafnooid.pem", "internooid.pem", "root.pem"]);
    expect((await verifySignedTransactionJws(noOid, { rootPem })).ok).toBe(false);
    const caLeaf = await sign("leafca", ["leafca.pem", "inter.pem", "root.pem"]);
    expect((await verifySignedTransactionJws(caLeaf, { rootPem })).ok).toBe(false);
  });

  it("rejects a tampered payload and a missing purchaseDate", async () => {
    const good = await sign("leaf", ["leaf.pem", "inter.pem", "root.pem"]);
    const [h, , s] = good.split(".");
    const forged = Buffer.from(JSON.stringify({ ...PAYLOAD, productId: "other" })).toString("base64url");
    expect((await verifySignedTransactionJws(`${h}.${forged}.${s}`, { rootPem })).ok).toBe(false);
    const { purchaseDate: _omit, ...noDate } = PAYLOAD;
    void _omit;
    const r = await verifySignedTransactionJws(
      await sign("leaf", ["leaf.pem", "inter.pem", "root.pem"], { payload: noDate }),
      { rootPem },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_JWS");
  });

  it("encodes Apple OIDs as DER and ships the real Apple root", () => {
    expect(derEncodeOid(APPLE_LEAF_OID).toString("hex")).toBe("060a2a864886f76364060b01");
    expect(derEncodeOid(APPLE_INTERMEDIATE_OID).toString("hex")).toBe("060a2a864886f763640602 01".replace(" ", ""));
    const apple = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
    expect(apple.fingerprint256).toBe(APPLE_ROOT_CA_G3_SHA256);
    expect(apple.subject).toContain("CN=Apple Root CA - G3");
  });
});
