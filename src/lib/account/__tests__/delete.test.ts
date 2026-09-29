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
      appleRevoked: false,
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

describe("readAppleAuthorizationCode", () => {
  it("returns the trimmed code when present", async () => {
    const { readAppleAuthorizationCode } = await import("@/lib/account/delete");
    expect(
      readAppleAuthorizationCode({
        confirm: "DELETE",
        appleAuthorizationCode: "  code-test  ",
      }),
    ).toEqual({ ok: true, code: "code-test" });
  });

  it("treats missing, null, and blank as no code", async () => {
    const { readAppleAuthorizationCode } = await import("@/lib/account/delete");
    expect(readAppleAuthorizationCode({ confirm: "DELETE" })).toEqual({ ok: true });
    expect(
      readAppleAuthorizationCode({ confirm: "DELETE", appleAuthorizationCode: null }),
    ).toEqual({ ok: true });
    expect(
      readAppleAuthorizationCode({ confirm: "DELETE", appleAuthorizationCode: "  " }),
    ).toEqual({ ok: true });
  });

  it("rejects non-strings and oversized values", async () => {
    const { readAppleAuthorizationCode, APPLE_AUTHORIZATION_CODE_MAX } = await import(
      "@/lib/account/delete"
    );
    expect(
      readAppleAuthorizationCode({ appleAuthorizationCode: 1 }),
    ).toEqual({ ok: false });
    expect(
      readAppleAuthorizationCode({
        appleAuthorizationCode: "x".repeat(APPLE_AUTHORIZATION_CODE_MAX + 1),
      }),
    ).toEqual({ ok: false });
  });
});

describe("softDeleteAccount Apple revoke", () => {
  it("revokes before flipping status when a code is present", async () => {
    const state = {
      users: [
        { id: USER_ID, deletion_status: "active", deleted_at: null },
      ],
      identities: [
        { id: "id-1", user_id: USER_ID, closed_at: null },
      ],
    };
    const order: string[] = [];
    const service = makeDeleteService(state);
    const res = await softDeleteAccount(service, USER_ID, {
      nowIso: NOW,
      appleAuthorizationCode: "auth-code-test",
      revokeAuthorizationCode: async () => {
        order.push("revoke");
        expect(state.users[0].deletion_status).toBe("active");
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.appleRevoked).toBe(true);
    expect(order).toEqual(["revoke"]);
    expect(state.users[0].deletion_status).toBe("pending_deletion");
    expect(state.identities[0].closed_at).toBe(NOW);
  });

  it("does not change status when revoke fails", async () => {
    const { AppleRevokeError } = await import("@/lib/apple/revoke");
    const state = {
      users: [
        { id: USER_ID, deletion_status: "active", deleted_at: null },
      ],
      identities: [
        { id: "id-1", user_id: USER_ID, closed_at: null },
      ],
    };
    const service = makeDeleteService(state);
    const res = await softDeleteAccount(service, USER_ID, {
      nowIso: NOW,
      appleAuthorizationCode: "auth-code-test",
      revokeAuthorizationCode: async () => {
        throw new AppleRevokeError("APPLE_REVOKE_FAILED", "Apple token revoke failed");
      },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("APPLE_REVOKE_FAILED");
    expect(state.users[0].deletion_status).toBe("active");
    expect(state.identities[0].closed_at).toBeNull();
  });

  it("maps misconfigured revoke to APPLE_REVOKE_MISCONFIGURED without status change", async () => {
    const { AppleRevokeError } = await import("@/lib/apple/revoke");
    const state = {
      users: [{ id: USER_ID, deletion_status: "active", deleted_at: null }],
      identities: [],
    };
    const service = makeDeleteService(state);
    const res = await softDeleteAccount(service, USER_ID, {
      nowIso: NOW,
      appleAuthorizationCode: "auth-code-test",
      revokeAuthorizationCode: async () => {
        throw new AppleRevokeError(
          "APPLE_REVOKE_MISCONFIGURED",
          "Apple SIWA revoke config is missing",
        );
      },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("APPLE_REVOKE_MISCONFIGURED");
    expect(state.users[0].deletion_status).toBe("active");
  });

  it("soft-deletes with appleRevoked false when no code", async () => {
    const state = {
      users: [{ id: USER_ID, deletion_status: "active", deleted_at: null }],
      identities: [],
    };
    let called = false;
    const service = makeDeleteService(state);
    const res = await softDeleteAccount(service, USER_ID, {
      nowIso: NOW,
      revokeAuthorizationCode: async () => {
        called = true;
      },
    });
    expect(called).toBe(false);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.appleRevoked).toBe(false);
    expect(state.users[0].deletion_status).toBe("pending_deletion");
  });

  it("skips revoke when already pending even if a code is sent", async () => {
    const prior = "2026-09-28T12:00:00.000Z";
    const state = {
      users: [
        {
          id: USER_ID,
          deletion_status: "pending_deletion",
          deleted_at: prior,
        },
      ],
      identities: [],
    };
    let called = false;
    const service = makeDeleteService(state);
    const res = await softDeleteAccount(service, USER_ID, {
      nowIso: NOW,
      appleAuthorizationCode: "auth-code-test",
      revokeAuthorizationCode: async () => {
        called = true;
      },
    });
    expect(called).toBe(false);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.alreadyPending).toBe(true);
    expect(res.value.appleRevoked).toBe(false);
    expect(state.users[0].deleted_at).toBe(prior);
  });
});
