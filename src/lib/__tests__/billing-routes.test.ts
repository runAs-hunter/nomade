import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { resetServerEnvCache } from "@/lib/env";
import { makeBillingService, type FakeRow } from "@/lib/billing/__tests__/fake-billing-db";
import type { VerifyJwsResult } from "@/lib/billing/verify-jws";

const verifyAccessToken = vi.fn();
const verifyJws = vi.fn<(jws: string) => Promise<VerifyJwsResult>>();
const patchStepStatus = vi.fn();
let db: { events: FakeRow[]; entitlements: FakeRow[] } = { events: [], entitlements: [] };

vi.mock("@/lib/auth/verify-access-token", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/verify-access-token")>(
    "@/lib/auth/verify-access-token",
  );
  return { ...actual, verifyAccessToken: (...a: unknown[]) => verifyAccessToken(...a) };
});
vi.mock("@/lib/billing/verify-jws", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/verify-jws")>("@/lib/billing/verify-jws");
  return { ...actual, verifySignedTransactionJws: (jws: string) => verifyJws(jws) };
});
vi.mock("@/lib/journey/access", () => ({
  requireActiveJourneyAccount: async () => ({ ok: true }),
}));
vi.mock("@/lib/journey/steps", () => ({
  patchStepStatus: (...a: unknown[]) => patchStepStatus(...a),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => makeBillingService(db),
  createAnonClient: () => ({}),
}));

import { POST } from "@/app/api/billing/app-store/transactions/route";
import { PATCH } from "@/app/api/journey/steps/[stepId]/route";
import { verifiedTransactionFixture } from "@/lib/billing/verify-jws";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PRODUCT = "env.product.placeholder";
const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://bgdrzdlenmwbpalnjiqg.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  APP_STORE_JOURNEY_PRODUCT_ID: PRODUCT,
};

const post = (body: object) =>
  POST(
    new Request("http://localhost/api/billing/app-store/transactions", {
      method: "POST",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  resetServerEnvCache();
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  db = { events: [], entitlements: [] };
  verifyAccessToken.mockResolvedValue({
    ok: true,
    value: { user: { id: USER_ID } as unknown as User, userId: USER_ID, accessToken: "t" },
  });
  verifyJws.mockReset();
  patchStepStatus.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/billing/app-store/transactions", () => {
  it("Production is accepted with APP_STORE_ALLOW_SANDBOX off; duplicate POST → eventInserted:false", async () => {
    vi.stubEnv("APP_STORE_ALLOW_SANDBOX", "false");
    verifyJws.mockResolvedValue({
      ok: true,
      transaction: verifiedTransactionFixture({ productId: PRODUCT, environment: "Production" }),
    });
    const first = await post({ signedTransaction: "h.p.s", eventType: "purchase" });
    expect(first.status).toBe(200);
    const j1 = await first.json();
    expect(j1.eventInserted).toBe(true);
    expect(j1.entitlement.status).toBe("active");
    expect(db.events[0]!.environment).toBe("Production");

    const dup = await post({ signedTransaction: "h.p.s", eventType: "restore" });
    expect(dup.status).toBe(200);
    expect((await dup.json()).eventInserted).toBe(false);
    expect(db.events).toHaveLength(1);
  });

  it("Sandbox with the flag off → 400", async () => {
    verifyJws.mockResolvedValue({
      ok: true,
      transaction: verifiedTransactionFixture({ productId: PRODUCT, environment: "Sandbox" }),
    });
    const r = await post({ signedTransaction: "h.p.s" });
    expect(r.status).toBe(400);
    expect(db.events).toHaveLength(0);
  });

  it("product / bundle mismatch → 400 BAD_REQUEST", async () => {
    vi.stubEnv("APP_STORE_ALLOW_SANDBOX", "true");
    for (const over of [{ productId: "other.product" }, { productId: PRODUCT, bundleId: "com.other" }]) {
      verifyJws.mockResolvedValue({ ok: true, transaction: verifiedTransactionFixture(over) });
      const r = await post({ signedTransaction: "h.p.s" });
      expect(r.status).toBe(400);
      expect((await r.json()).error.code).toBe("BAD_REQUEST");
    }
    expect(db.entitlements).toHaveLength(0);
  });

  it("client-sent refund eventType → 400", async () => {
    const r = await post({ signedTransaction: "h.p.s", eventType: "refund" });
    expect(r.status).toBe(400);
    expect(verifyJws).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/journey/steps/{stepId}", () => {
  it("maps ENTITLEMENT_REQUIRED → 403", async () => {
    patchStepStatus.mockResolvedValue({ ok: false, code: "ENTITLEMENT_REQUIRED", message: "Journey unlock required to update this step" });
    const r = await PATCH(
      new Request("http://localhost/api/journey/steps/visa-fee", {
        method: "PATCH",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      }),
      { params: Promise.resolve({ stepId: "visa-fee" }) },
    );
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe("ENTITLEMENT_REQUIRED");
  });
});
