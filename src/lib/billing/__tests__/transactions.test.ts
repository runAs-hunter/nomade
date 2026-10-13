import { describe, it, expect } from "vitest";
import { processAppStoreTransaction } from "@/lib/billing/transactions";
import { verifiedTransactionFixture } from "@/lib/billing/verify-jws";
import {
  BILLING_SOURCE_APP_STORE,
  JOURNEY_FULL_ENTITLEMENT_ID,
} from "@/lib/billing/catalog";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER_USER_ID = "11111111-2222-3333-4444-555555555555";
const PRODUCT = "asc.sandbox.from.keeper";
const NOW = "2026-10-02T14:00:00.000Z";

type FakeRow = Record<string, unknown>;

function makeBillingService(state: {
  events: FakeRow[];
  entitlements: FakeRow[];
}) {
  return {
    schema: (name: string) => {
      expect(name).toBe("internal");
      return {
        from: (table: string) => {
          const filters: { col: string; val: unknown }[] = [];
          let pendingInsert: FakeRow | null = null;
          let pendingUpdate: FakeRow | null = null;
          let pendingUpsert: FakeRow | null = null;
          const api: Record<string, unknown> = {};
          const self = api;
          const rows = () =>
            table === "billing_events" ? state.events : state.entitlements;

          api.select = () => self;
          api.eq = (col: string, val: unknown) => {
            filters.push({ col, val });
            return self;
          };
          api.insert = (row: FakeRow) => {
            pendingInsert = row;
            return self;
          };
          api.update = (patch: FakeRow) => {
            pendingUpdate = patch;
            return self;
          };
          api.upsert = (row: FakeRow) => {
            pendingUpsert = row;
            return self;
          };
          api.order = () => self;
          api.maybeSingle = async () => {
            if (pendingInsert) {
              const row = { id: `ev-${rows().length}`, ...pendingInsert };
              rows().push(row);
              pendingInsert = null;
              return { data: row, error: null };
            }
            if (pendingUpsert) {
              const match = rows().find((r) =>
                filters.every((f) => r[f.col] === f.val),
              );
              if (match) Object.assign(match, pendingUpsert);
              else rows().push({ ...pendingUpsert });
              const data = match
                ? { ...match }
                : { ...rows()[rows().length - 1] };
              pendingUpsert = null;
              return { data, error: null };
            }
            if (pendingUpdate) {
              const match = rows().find((r) =>
                filters.every((f) => r[f.col] === f.val),
              );
              if (match) Object.assign(match, pendingUpdate);
              const data = match ? { ...match } : null;
              pendingUpdate = null;
              return { data, error: null };
            }
            return {
              data: rows().find((r) => filters.every((f) => r[f.col] === f.val)) ?? null,
              error: null,
            };
          };
          api.then = (
            resolve: (v: { data: unknown; error: null }) => unknown,
          ) => {
            if (pendingInsert) {
              rows().push({ id: `ev-${rows().length}`, ...pendingInsert });
              pendingInsert = null;
              return Promise.resolve(resolve({ data: null, error: null }));
            }
            return Promise.resolve(
              resolve({
                data: rows().filter((r) =>
                  filters.every((f) => r[f.col] === f.val),
                ),
                error: null,
              }),
            );
          };
          return self;
        },
      };
    },
  };
}

describe("processAppStoreTransaction", () => {
  it("rejects when product id env is empty (never invent)", async () => {
    const service = makeBillingService({ events: [], entitlements: [] });
    const result = await processAppStoreTransaction(service, {
      userId: USER_ID,
      body: { signedTransaction: "a.b.c" },
      config: { journeyProductId: "", bundleId: "com.izaya.Nomade", allowSandbox: true },
      verify: async () => ({
        ok: true,
        transaction: verifiedTransactionFixture({ productId: PRODUCT }),
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MISCONFIGURED");
  });

  it("rejects missing signedTransaction", async () => {
    const service = makeBillingService({ events: [], entitlements: [] });
    const result = await processAppStoreTransaction(service, {
      userId: USER_ID,
      body: {},
      config: { journeyProductId: PRODUCT, bundleId: "com.izaya.Nomade", allowSandbox: true },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("BAD_REQUEST");
  });

  it("upserts entitlement after verified purchase (idempotent on txn id)", async () => {
    const state = { events: [] as FakeRow[], entitlements: [] as FakeRow[] };
    const service = makeBillingService(state);
    const verify = async () =>
      ({
        ok: true as const,
        transaction: verifiedTransactionFixture({
          productId: PRODUCT,
          transactionId: "txn-1",
        }),
      });

    const first = await processAppStoreTransaction(service, {
      userId: USER_ID,
      body: { signedTransaction: "header.payload.sig", eventType: "purchase" },
      config: { journeyProductId: PRODUCT, bundleId: "com.izaya.Nomade", allowSandbox: true },
      verify,
      nowIso: NOW,
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.entitlement.id).toBe(JOURNEY_FULL_ENTITLEMENT_ID);
      expect(first.entitlement.status).toBe("active");
      expect(first.eventInserted).toBe(true);
    }
    expect(state.events).toHaveLength(1);
    expect(state.entitlements).toHaveLength(1);

    const second = await processAppStoreTransaction(service, {
      userId: USER_ID,
      body: { signedTransaction: "header.payload.sig", eventType: "restore" },
      config: { journeyProductId: PRODUCT, bundleId: "com.izaya.Nomade", allowSandbox: true },
      verify,
      nowIso: NOW,
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.eventInserted).toBe(false);
    expect(state.events).toHaveLength(1);
  });

  it("rejects product mismatch against configured ASC id", async () => {
    const service = makeBillingService({ events: [], entitlements: [] });
    const result = await processAppStoreTransaction(service, {
      userId: USER_ID,
      body: { signedTransaction: "a.b.c" },
      config: { journeyProductId: PRODUCT, bundleId: "com.izaya.Nomade", allowSandbox: true },
      verify: async () => ({
        ok: true,
        transaction: verifiedTransactionFixture({ productId: "wrong.product" }),
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PRODUCT_MISMATCH");
  });

  it("F10: same Apple transaction on a second account is allowed and logged", async () => {
    const state = {
      events: [
        {
          id: "ev-owned",
          user_id: OTHER_USER_ID,
          source: BILLING_SOURCE_APP_STORE,
          product_id: PRODUCT,
          transaction_id: "txn-owned",
          original_transaction_id: "txn-owned",
          event_type: "purchase",
          occurred_at: NOW,
          raw_ref: "hash",
          created_at: NOW,
        },
      ] as FakeRow[],
      entitlements: [
        {
          user_id: OTHER_USER_ID,
          entitlement_id: JOURNEY_FULL_ENTITLEMENT_ID,
          status: "active",
          source_transaction_id: "txn-owned",
          granted_at: NOW,
          updated_at: NOW,
        },
      ] as FakeRow[],
    };
    const service = makeBillingService(state);
    const result = await processAppStoreTransaction(service, {
      userId: USER_ID,
      body: { signedTransaction: "header.payload.sig", eventType: "restore" },
      config: { journeyProductId: PRODUCT, bundleId: "com.izaya.Nomade", allowSandbox: true },
      verify: async () => ({
        ok: true as const,
        transaction: verifiedTransactionFixture({
          productId: PRODUCT,
          transactionId: "txn-owned",
        }),
      }),
      nowIso: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.eventInserted).toBe(false);
    expect(state.events).toHaveLength(1);
    expect(state.events[0].user_id).toBe(OTHER_USER_ID);
    expect(
      state.entitlements.filter((e) => e.user_id === USER_ID && e.status === "active"),
    ).toHaveLength(1);
  });

  const cfg = (allowSandbox: boolean) => ({
    journeyProductId: PRODUCT,
    bundleId: "com.izaya.Nomade",
    allowSandbox,
  });
  const run = (
    state: { events: FakeRow[]; entitlements: FakeRow[] },
    over: Parameters<typeof verifiedTransactionFixture>[0],
    allowSandbox = true,
  ) =>
    processAppStoreTransaction(makeBillingService(state), {
      userId: USER_ID,
      body: { signedTransaction: "h.p.s" },
      config: cfg(allowSandbox),
      verify: async () => ({
        ok: true as const,
        transaction: verifiedTransactionFixture({ productId: PRODUCT, ...over }),
      }),
      nowIso: NOW,
    });

  it("F10: Sandbox/Xcode rejected when APP_STORE_ALLOW_SANDBOX is off; Production accepted", async () => {
    for (const environment of ["Sandbox", "Xcode", null, "Weird"]) {
      const state = { events: [] as FakeRow[], entitlements: [] as FakeRow[] };
      const r = await run(state, { environment }, false);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("ENVIRONMENT_REJECTED");
      expect(state.events).toHaveLength(0);
    }
    const state = { events: [] as FakeRow[], entitlements: [] as FakeRow[] };
    const ok = await run(state, { environment: "Production" }, false);
    expect(ok.ok).toBe(true);
    expect(state.events[0].environment).toBe("Production");
  });

  it("F10: Sandbox accepted with the flag on and tagged", async () => {
    const state = { events: [] as FakeRow[], entitlements: [] as FakeRow[] };
    const r = await run(state, { environment: "Sandbox" }, true);
    expect(r.ok).toBe(true);
    expect(state.events[0].environment).toBe("Sandbox");
    expect(state.events[0].raw_ref).toBe("abc123rawref");
  });

  it("F10: bundle mismatch rejected", async () => {
    const r = await run({ events: [], entitlements: [] }, { bundleId: "com.other.app" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("BUNDLE_MISMATCH");
  });

  it("F10: revoked transaction → entitlement inactive", async () => {
    const state = { events: [] as FakeRow[], entitlements: [] as FakeRow[] };
    expect((await run(state, { transactionId: "t1" })).ok).toBe(true);
    expect(state.entitlements[0].status).toBe("active");
    const r = await run(state, { transactionId: "t1", revoked: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entitlement.status).toBe("inactive");
    expect(state.entitlements[0].status).toBe("inactive");
  });
});
