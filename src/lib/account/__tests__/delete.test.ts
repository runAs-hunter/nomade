import { describe, it, expect } from "vitest";
import {
  isValidDeleteConfirm,
  softDeleteAccount,
} from "@/lib/account/delete";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const NOW = "2026-09-29T17:30:00.000Z";

describe("isValidDeleteConfirm", () => {
  it("accepts exact DELETE confirm", () => {
    expect(isValidDeleteConfirm({ confirm: "DELETE" })).toBe(true);
  });

  it("rejects wrong/missing confirm", () => {
    expect(isValidDeleteConfirm({})).toBe(false);
    expect(isValidDeleteConfirm({ confirm: "delete" })).toBe(false);
    expect(isValidDeleteConfirm({ confirm: "YES" })).toBe(false);
    expect(isValidDeleteConfirm(null)).toBe(false);
    expect(isValidDeleteConfirm("DELETE")).toBe(false);
  });
});

type FakeRow = Record<string, unknown>;

function makeDeleteService(state: {
  users: FakeRow[];
  identities: FakeRow[];
}) {
  return {
    schema: (name: string) => {
      expect(name).toBe("internal");
      return {
        from: (table: string) => {
          const filters: { col: string; val: unknown; op: string }[] = [];
          let pendingUpdate: FakeRow | null = null;
          const api: Record<string, unknown> = {};
          const self = api;

          api.select = () => self;
          api.eq = (col: string, val: unknown) => {
            filters.push({ col, val, op: "eq" });
            return self;
          };
          api.is = (col: string, val: unknown) => {
            filters.push({ col, val, op: "is" });
            return self;
          };
          api.maybeSingle = async () => {
            const rows = table === "users" ? state.users : state.identities;
            const match = rows.find((r) =>
              filters.every((f) => {
                if (f.op === "is") return r[f.col] == null && f.val === null;
                return r[f.col] === f.val;
              }),
            );
            return { data: match ?? null, error: null };
          };
          api.update = (patch: FakeRow) => {
            pendingUpdate = patch;
            return self;
          };
          // Terminal thenable after update().eq()... chain
          api.then = (
            resolve: (v: { data: null; error: null }) => unknown,
          ) => {
            if (pendingUpdate) {
              const rows = table === "users" ? state.users : state.identities;
              for (const r of rows) {
                const match = filters.every((f) => {
                  if (f.op === "is") return r[f.col] == null && f.val === null;
                  return r[f.col] === f.val;
                });
                if (match) Object.assign(r, pendingUpdate);
              }
              pendingUpdate = null;
            }
            return Promise.resolve(resolve({ data: null, error: null }));
          };
          return self;
        },
      };
    },
  };
}

describe("softDeleteAccount", () => {
  it("returns NO_USER when no row", async () => {
    const service = makeDeleteService({ users: [], identities: [] });
    const res = await softDeleteAccount(service, USER_ID, NOW);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NO_USER");
  });

  it("returns ACCOUNT_DELETED when already deleted", async () => {
    const service = makeDeleteService({
      users: [
        {
          id: USER_ID,
          deletion_status: "deleted",
          deleted_at: "2026-09-20T00:00:00.000Z",
        },
      ],
      identities: [],
    });
    const res = await softDeleteAccount(service, USER_ID, NOW);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ACCOUNT_DELETED");
  });

  it("transitions active → pending_deletion and closes identities", async () => {
    const state = {
      users: [
        {
          id: USER_ID,
          deletion_status: "active",
          deleted_at: null,
        },
      ],
      identities: [
        {
          id: "id-1",
          user_id: USER_ID,
          provider: "apple",
          provider_subject: "apple.sub.001",
          closed_at: null,
        },
        {
          id: "id-2",
          user_id: USER_ID,
          provider: "apple",
          provider_subject: "apple.sub.old",
          closed_at: "2026-08-01T00:00:00.000Z",
        },
      ],
    };
    const service = makeDeleteService(state);
    const res = await softDeleteAccount(service, USER_ID, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alreadyPending).toBe(false);
    expect(res.value).toEqual({
      userId: USER_ID,
      deletionStatus: "pending_deletion",
      deletedAt: NOW,
    });
    expect(state.users[0].deletion_status).toBe("pending_deletion");
    expect(state.users[0].deleted_at).toBe(NOW);
    expect(state.identities[0].closed_at).toBe(NOW);
    // Already-closed identity untouched
    expect(state.identities[1].closed_at).toBe("2026-08-01T00:00:00.000Z");
  });

  it("is idempotent when already pending_deletion", async () => {
    const prior = "2026-09-28T12:00:00.000Z";
    const state = {
      users: [
        {
          id: USER_ID,
          deletion_status: "pending_deletion",
          deleted_at: prior,
        },
      ],
      identities: [
        {
          id: "id-1",
          user_id: USER_ID,
          closed_at: prior,
        },
      ],
    };
    const service = makeDeleteService(state);
    const res = await softDeleteAccount(service, USER_ID, NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alreadyPending).toBe(true);
    expect(res.value.deletedAt).toBe(prior);
    expect(state.users[0].deleted_at).toBe(prior);
  });
});
