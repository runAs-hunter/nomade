import { describe, it, expect } from "vitest";
import { processAppStoreTransaction } from "@/lib/billing/transactions";
import { verifiedTransactionFixture } from "@/lib/billing/verify-jws";
import { JOURNEY_FULL_ENTITLEMENT_ID } from "@/lib/billing/catalog";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
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
      config: { journeyProductId: "", bundleId: "com.izaya.Nomade" },
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
      config: { journeyProductId: PRODUCT, bundleId: "com.izaya.Nomade" },
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
      config: { journeyProductId: PRODUCT, bundleId: "com.izaya.Nomade" },
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
      config: { journeyProductId: PRODUCT, bundleId: "com.izaya.Nomade" },
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
      config: { journeyProductId: PRODUCT, bundleId: "com.izaya.Nomade" },
      verify: async () => ({
        ok: true,
        transaction: verifiedTransactionFixture({ productId: "wrong.product" }),
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PRODUCT_MISMATCH");
  });
});
