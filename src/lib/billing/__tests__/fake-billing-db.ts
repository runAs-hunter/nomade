import { expect } from "vitest";

/** Shared in-memory fake for internal.billing_events / internal.entitlements. */
export type FakeRow = Record<string, unknown>;

export function makeBillingService(state: {
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
            if (pendingUpdate) {
              for (const r of rows()) {
                if (filters.every((f) => r[f.col] === f.val)) Object.assign(r, pendingUpdate);
              }
              pendingUpdate = null;
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

