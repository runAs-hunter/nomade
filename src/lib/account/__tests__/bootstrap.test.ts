import { describe, it, expect } from "vitest";
import {
  computeMergeCase,
  upsertBootstrapIdentity,
} from "@/lib/account/bootstrap";

describe("computeMergeCase", () => {
  it("returns D when identity already linked", () => {
    expect(
      computeMergeCase({
        hasLocalDraft: true,
        hasServerJourney: false,
        identityAlreadyLinked: true,
      }),
    ).toBe("D");
    expect(
      computeMergeCase({
        hasLocalDraft: false,
        hasServerJourney: false,
        identityAlreadyLinked: true,
      }),
    ).toBe("D");
  });

  it("returns B when local draft and server journey both present", () => {
    expect(
      computeMergeCase({
        hasLocalDraft: true,
        hasServerJourney: true,
        identityAlreadyLinked: false,
      }),
    ).toBe("B");
  });

  it("returns A when local draft and no server journey (new-ish)", () => {
    expect(
      computeMergeCase({
        hasLocalDraft: true,
        hasServerJourney: false,
        identityAlreadyLinked: false,
      }),
    ).toBe("A");
  });

  it("returns C otherwise (no local draft)", () => {
    expect(
      computeMergeCase({
        hasLocalDraft: false,
        hasServerJourney: false,
        identityAlreadyLinked: false,
      }),
    ).toBe("C");
    expect(
      computeMergeCase({
        hasLocalDraft: false,
        hasServerJourney: true,
        identityAlreadyLinked: false,
      }),
    ).toBe("C");
  });
});

type FakeRow = Record<string, unknown>;

function makeServiceMock(state: {
  users: FakeRow[];
  identities: FakeRow[];
}) {
  const chainFor = (table: "users" | "auth_identities") => {
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
    const insertThen = (row: FakeRow) => {
      return Promise.resolve().then(() => {
        if (table === "users") {
          if (state.users.some((u) => u.id === row.id)) {
            return { data: null, error: { code: "23505", message: "duplicate" } };
          }
          state.users.push({
            ...row,
            deletion_status: row.deletion_status ?? "active",
          });
          return { data: row, error: null };
        }
        const id = crypto.randomUUID();
        state.identities.push({ id, closed_at: null, ...row });
        return { data: { id, ...row }, error: null };
      });
    };
    api.insert = (row: FakeRow) => insertThen(row);

    api.update = (row: FakeRow) => {
      pendingUpdate = row;
      const updApi: Record<string, unknown> = {};
      updApi.eq = (col: string, val: unknown) => {
        const rows = table === "users" ? state.users : state.identities;
        for (const r of rows) {
          if (r[col] === val) Object.assign(r, pendingUpdate);
        }
        return Promise.resolve({ data: null, error: null });
      };
      return updApi;
    };

    return api;
  };

  return {
    schema: (name: string) => {
      expect(name).toBe("internal");
      return {
        from: (table: "users" | "auth_identities") => chainFor(table),
      };
    },
  };
}

describe("upsertBootstrapIdentity", () => {
  it("creates user on first call; second call created:false + identityAlreadyLinked", async () => {
    const state = { users: [] as FakeRow[], identities: [] as FakeRow[] };
    const service = makeServiceMock(state);
    const userId = "11111111-1111-1111-1111-111111111111";
    const subject = "apple-sub-abc";

    const first = await upsertBootstrapIdentity(service, {
      userId,
      email: "a@privaterelay.appleid.com",
      providerSubject: subject,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.created).toBe(true);
    expect(first.identityAlreadyLinked).toBe(false);
    expect(first.userId).toBe(userId);
    expect(state.users).toHaveLength(1);

    const second = await upsertBootstrapIdentity(service, {
      userId,
      email: "changed@example.com",
      providerSubject: subject,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.created).toBe(false);
    expect(second.identityAlreadyLinked).toBe(true);
    expect(second.userId).toBe(userId);
    // Still one user — email change does not mint a second user
    expect(state.users).toHaveLength(1);
    expect(state.users[0].id).toBe(userId);
  });

  it("null email does not mint a second user", async () => {
    const state = { users: [] as FakeRow[], identities: [] as FakeRow[] };
    const service = makeServiceMock(state);
    const userId = "22222222-2222-2222-2222-222222222222";

    const first = await upsertBootstrapIdentity(service, {
      userId,
      email: null,
      providerSubject: "sub-null-email",
    });
    expect(first.ok).toBe(true);

    const second = await upsertBootstrapIdentity(service, {
      userId,
      email: null,
      providerSubject: "sub-null-email",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.created).toBe(false);
    expect(state.users).toHaveLength(1);
  });

  it("returns ACCOUNT_PENDING_DELETION when status is pending_deletion", async () => {
    const userId = "33333333-3333-3333-3333-333333333333";
    const state = {
      users: [
        {
          id: userId,
          email: null,
          deletion_status: "pending_deletion",
        },
      ] as FakeRow[],
      identities: [] as FakeRow[],
    };
    const result = await upsertBootstrapIdentity(makeServiceMock(state), {
      userId,
      email: null,
      providerSubject: "sub-pending",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ACCOUNT_PENDING_DELETION");
  });

  it("returns IDENTITY_CONFLICT when active apple subject belongs to another user", async () => {
    const userId = "44444444-4444-4444-4444-444444444444";
    const other = "55555555-5555-5555-5555-555555555555";
    const state = {
      users: [
        { id: userId, email: null, deletion_status: "active" },
      ] as FakeRow[],
      identities: [
        {
          id: "id-1",
          user_id: other,
          provider: "apple",
          provider_subject: "stolen-sub",
          closed_at: null,
        },
      ] as FakeRow[],
    };
    const result = await upsertBootstrapIdentity(makeServiceMock(state), {
      userId,
      email: null,
      providerSubject: "stolen-sub",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("IDENTITY_CONFLICT");
  });
});
