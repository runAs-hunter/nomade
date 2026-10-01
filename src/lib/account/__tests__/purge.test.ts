import { describe, it, expect, vi } from "vitest";
import {
  isAuthUserMissingError,
  isUnderLegalHold,
  listEligibleForPurge,
  purgeAccount,
  purgeEligibilityCutoff,
  PURGE_BATCH_SIZE,
  PURGE_GRACE_MS,
  runPurgeBatch,
  wipeBilling,
  wipeChat,
  wipeJourney,
} from "@/lib/account/purge";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER_ID = "ffffffff-1111-2222-3333-444444444444";
const NOW = "2026-09-29T20:00:00.000Z";
const NOW_DATE = new Date(NOW);
const OLD_DELETED = "2026-09-28T10:00:00.000Z"; // >24h before NOW
const RECENT_DELETED = "2026-09-29T12:00:00.000Z"; // <24h before NOW

type FakeRow = Record<string, unknown>;

function makePurgeService(state: {
  users: FakeRow[];
  identities: FakeRow[];
  journeyCases?: FakeRow[];
  deleteUser?: ReturnType<typeof vi.fn>;
}) {
  if (!state.journeyCases) state.journeyCases = [];
  const deleteUser =
    state.deleteUser ??
    vi.fn(async () => ({ data: { user: null }, error: null }));

  return {
    schema: (name: string) => {
      expect(name).toBe("internal");
      return {
        from: (table: string) => {
          const filters: { col: string; val: unknown; op: string }[] = [];
          let pendingUpdate: FakeRow | null = null;
          let pendingDelete = false;
          let orderAsc: string | null = null;
          let limitN: number | null = null;
          const api: Record<string, unknown> = {};
          const self = api;

          const matches = (r: FakeRow) =>
            filters.every((f) => {
              if (f.op === "is") return r[f.col] == null && f.val === null;
              if (f.op === "not_is") {
                // .not(col, 'is', null) → value must not be null
                return r[f.col] != null;
              }
              if (f.op === "lte") {
                const left = r[f.col];
                if (typeof left !== "string" || typeof f.val !== "string") {
                  return false;
                }
                return left <= f.val;
              }
              if (f.op === "eq") return r[f.col] === f.val;
              return false;
            });

          api.select = () => self;
          api.eq = (col: string, val: unknown) => {
            filters.push({ col, val, op: "eq" });
            return self;
          };
          api.is = (col: string, val: unknown) => {
            filters.push({ col, val, op: "is" });
            return self;
          };
          api.not = (col: string, op: string, val: unknown) => {
            if (op === "is") {
              filters.push({ col, val, op: "not_is" });
            }
            return self;
          };
          api.lte = (col: string, val: unknown) => {
            filters.push({ col, val, op: "lte" });
            return self;
          };
          api.order = (col: string, opts?: { ascending?: boolean }) => {
            orderAsc = opts?.ascending === false ? `desc:${col}` : col;
            return self;
          };
          api.limit = (n: number) => {
            limitN = n;
            return self;
          };
          api.maybeSingle = async () => {
            const rows = table === "users" ? state.users : table === "auth_identities" ? state.identities : (state.journeyCases ?? []);
            const match = rows.find((r) => matches(r));
            return { data: match ?? null, error: null };
          };
          api.update = (patch: FakeRow) => {
            pendingUpdate = patch;
            return self;
          };
          api.delete = () => {
            pendingDelete = true;
            return self;
          };
          // Terminal thenable for select chains and update/delete chains
          api.then = (
            resolve: (v: { data: unknown; error: null }) => unknown,
          ) => {
            const rows = table === "users" ? state.users : table === "auth_identities" ? state.identities : (state.journeyCases ?? []);
            if (pendingUpdate) {
              for (const r of rows) {
                if (matches(r)) Object.assign(r, pendingUpdate);
              }
              pendingUpdate = null;
              return Promise.resolve(resolve({ data: null, error: null }));
            }
            if (pendingDelete) {
              const keep: FakeRow[] = [];
              const removed: FakeRow[] = [];
              for (const r of rows) {
                if (matches(r)) removed.push(r);
                else keep.push(r);
              }
              if (table === "users") {
                state.users.length = 0;
                state.users.push(...keep);
              } else if (table === "auth_identities") {
                state.identities.length = 0;
                state.identities.push(...keep);
              } else if (table === "journey_cases") {
                const jc = state.journeyCases ?? [];
                jc.length = 0;
                jc.push(...keep);
                state.journeyCases = jc;
              }
              pendingDelete = false;
              return Promise.resolve(resolve({ data: removed, error: null }));
            }
            // select list
            let matched = rows.filter((r) => matches(r));
            if (orderAsc && !orderAsc.startsWith("desc:")) {
              const col = orderAsc;
              matched = [...matched].sort((a, b) =>
                String(a[col] ?? "").localeCompare(String(b[col] ?? "")),
              );
            }
            if (limitN != null) matched = matched.slice(0, limitN);
            return Promise.resolve(resolve({ data: matched, error: null }));
          };
          return self;
        },
      };
    },
    auth: {
      admin: {
        deleteUser,
      },
    },
  };
}

describe("purge constants / stubs", () => {
  it("locks batch size 50 and 24h grace", () => {
    expect(PURGE_BATCH_SIZE).toBe(50);
    expect(PURGE_GRACE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("legal-hold stub always false", () => {
    expect(isUnderLegalHold(USER_ID)).toBe(false);
  });

  it("chat/billing wipe stubs return wiped:0; journey wipe deletes cases", async () => {
    const state = {
      users: [],
      identities: [],
      journeyCases: [
        { id: "case-1", user_id: USER_ID, path_id: "italy_digital_nomad" },
        { id: "case-2", user_id: OTHER_ID, path_id: "italy_digital_nomad" },
      ],
    };
    const service = makePurgeService(state);
    expect(await wipeJourney(service, USER_ID)).toEqual({ wiped: 1 });
    expect(state.journeyCases.map((c) => c.id)).toEqual(["case-2"]);
    expect(await wipeChat(USER_ID)).toEqual({ wiped: 0 });
    expect(await wipeBilling(USER_ID)).toEqual({ wiped: 0 });
  });

  it("eligibility cutoff is now - 24h", () => {
    expect(purgeEligibilityCutoff(NOW_DATE)).toBe(
      new Date(NOW_DATE.getTime() - PURGE_GRACE_MS).toISOString(),
    );
  });
});

describe("isAuthUserMissingError", () => {
  it("detects 404 / user not found", () => {
    expect(isAuthUserMissingError({ status: 404, message: "x" })).toBe(true);
    expect(
      isAuthUserMissingError({ message: "User not found" }),
    ).toBe(true);
    expect(
      isAuthUserMissingError({ code: "user_not_found", message: "gone" }),
    ).toBe(true);
    expect(isAuthUserMissingError({ message: "network" })).toBe(false);
    expect(isAuthUserMissingError(null)).toBe(false);
  });
});

describe("listEligibleForPurge", () => {
  it("includes pending older than 24h; excludes active, recent pending, deleted", async () => {
    const state = {
      users: [
        {
          id: USER_ID,
          deletion_status: "pending_deletion",
          deleted_at: OLD_DELETED,
          email: "a@example.com",
        },
        {
          id: OTHER_ID,
          deletion_status: "pending_deletion",
          deleted_at: RECENT_DELETED,
          email: "b@example.com",
        },
        {
          id: "11111111-1111-1111-1111-111111111111",
          deletion_status: "active",
          deleted_at: null,
          email: "c@example.com",
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          deletion_status: "deleted",
          deleted_at: OLD_DELETED,
          email: null,
        },
      ],
      identities: [],
    };
    const service = makePurgeService(state);
    const res = await listEligibleForPurge(service, { now: NOW_DATE });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.users.map((u) => u.id)).toEqual([USER_ID]);
  });

  it("respects batch limit", async () => {
    const users: FakeRow[] = [];
    for (let i = 0; i < 3; i++) {
      users.push({
        id: `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee0${i}`,
        deletion_status: "pending_deletion",
        deleted_at: OLD_DELETED,
        email: null,
      });
    }
    const service = makePurgeService({ users, identities: [] });
    const res = await listEligibleForPurge(service, {
      now: NOW_DATE,
      limit: 2,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.users).toHaveLength(2);
  });
});

describe("purgeAccount", () => {
  it("scrubs email, deletes identities, calls Auth, marks deleted", async () => {
    const deleteUser = vi.fn(async () => ({ data: { user: null }, error: null }));
    const state = {
      users: [
        {
          id: USER_ID,
          deletion_status: "pending_deletion",
          deleted_at: OLD_DELETED,
          email: "relay@privaterelay.appleid.com",
          updated_at: OLD_DELETED,
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
        {
          id: "id-other",
          user_id: OTHER_ID,
          provider: "apple",
          provider_subject: "apple.sub.other",
          closed_at: null,
        },
      ],
      deleteUser,
    };
    const service = makePurgeService(state);
    const res = await purgeAccount(service, USER_ID, { nowIso: NOW });
    expect(res).toEqual({ userId: USER_ID, outcome: "purged" });
    expect(state.users[0].email).toBeNull();
    expect(state.users[0].deletion_status).toBe("deleted");
    expect(state.users[0].deleted_at).toBe(OLD_DELETED); // preserved
    expect(state.users[0].updated_at).toBe(NOW);
    expect(state.identities.filter((i) => i.user_id === USER_ID)).toHaveLength(
      0,
    );
    expect(state.identities.filter((i) => i.user_id === OTHER_ID)).toHaveLength(
      1,
    );
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("treats Auth user-not-found as authAlreadyGone success", async () => {
    const deleteUser = vi.fn(async () => ({
      data: null,
      error: { message: "User not found", status: 404 },
    }));
    const state = {
      users: [
        {
          id: USER_ID,
          deletion_status: "pending_deletion",
          deleted_at: OLD_DELETED,
          email: "x@y.z",
        },
      ],
      identities: [],
      deleteUser,
    };
    const res = await purgeAccount(makePurgeService(state), USER_ID, {
      nowIso: NOW,
    });
    expect(res.outcome).toBe("authAlreadyGone");
    expect(state.users[0].deletion_status).toBe("deleted");
    expect(state.users[0].email).toBeNull();
  });

  it("skips already deleted without Auth call", async () => {
    const deleteUser = vi.fn();
    const state = {
      users: [
        {
          id: USER_ID,
          deletion_status: "deleted",
          deleted_at: OLD_DELETED,
          email: null,
        },
      ],
      identities: [],
      deleteUser,
    };
    const res = await purgeAccount(makePurgeService(state), USER_ID, {
      nowIso: NOW,
    });
    expect(res.outcome).toBe("skippedAlreadyDeleted");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("skips legal hold without Auth call", async () => {
    const deleteUser = vi.fn();
    const state = {
      users: [
        {
          id: USER_ID,
          deletion_status: "pending_deletion",
          deleted_at: OLD_DELETED,
          email: "hold@example.com",
        },
      ],
      identities: [],
      deleteUser,
    };
    const res = await purgeAccount(makePurgeService(state), USER_ID, {
      nowIso: NOW,
      legalHold: () => true,
    });
    expect(res.outcome).toBe("skippedLegalHold");
    expect(deleteUser).not.toHaveBeenCalled();
    expect(state.users[0].email).toBe("hold@example.com");
    expect(state.users[0].deletion_status).toBe("pending_deletion");
  });
});

describe("runPurgeBatch", () => {
  it("aggregates counts across eligible users", async () => {
    const deleteUser = vi.fn(async () => ({ data: null, error: null }));
    const state = {
      users: [
        {
          id: USER_ID,
          deletion_status: "pending_deletion",
          deleted_at: OLD_DELETED,
          email: "a@example.com",
        },
        {
          id: OTHER_ID,
          deletion_status: "pending_deletion",
          deleted_at: OLD_DELETED,
          email: "b@example.com",
        },
      ],
      identities: [],
      deleteUser,
    };
    const res = await runPurgeBatch(makePurgeService(state), {
      now: NOW_DATE,
      nowIso: NOW,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.scanned).toBe(2);
    expect(res.value.purged).toBe(2);
    expect(res.value.failed).toBe(0);
    expect(deleteUser).toHaveBeenCalledTimes(2);
  });
});
