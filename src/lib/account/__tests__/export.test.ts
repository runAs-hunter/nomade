import { describe, it, expect } from "vitest";
import {
  buildExportEnvelope,
  loadAccountExport,
  type ExportIdentityRow,
  type ExportUserRow,
} from "@/lib/account/export";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER_ID = "ffffffff-1111-2222-3333-444444444444";
const EXPORTED_AT = "2026-09-29T17:00:00.000Z";

function activeUser(overrides?: Partial<ExportUserRow>): ExportUserRow {
  return {
    id: USER_ID,
    email: "relay@privaterelay.appleid.com",
    deletion_status: "active",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-15T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("buildExportEnvelope", () => {
  it("includes email when present and maps identities", () => {
    const identities: ExportIdentityRow[] = [
      {
        provider: "apple",
        provider_subject: "apple.sub.001",
        created_at: "2026-09-01T00:00:00.000Z",
        closed_at: null,
      },
    ];
    const envelope = buildExportEnvelope({
      user: activeUser(),
      identities,
      exportedAt: EXPORTED_AT,
    });
    expect(envelope).toEqual({
      exportedAt: EXPORTED_AT,
      userId: USER_ID,
      deletionStatus: "active",
      account: {
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-15T00:00:00.000Z",
        emailPresent: true,
        email: "relay@privaterelay.appleid.com",
      },
      identities: [
        {
          provider: "apple",
          providerSubject: "apple.sub.001",
          createdAt: "2026-09-01T00:00:00.000Z",
          closedAt: null,
        },
      ],
      journey: [],
      chat: [],
      billing: [],
      notes: [
        "journey/chat/billing arrays empty until those domains ship; format stable for clients",
      ],
    });
  });

  it("omits email key when null and sets emailPresent false", () => {
    const envelope = buildExportEnvelope({
      user: activeUser({ email: null }),
      identities: [],
      exportedAt: EXPORTED_AT,
    });
    expect(envelope.account.emailPresent).toBe(false);
    expect(envelope.account).not.toHaveProperty("email");
  });

  it("allows pending_deletion status in envelope", () => {
    const envelope = buildExportEnvelope({
      user: activeUser({ deletion_status: "pending_deletion" }),
      identities: [],
      exportedAt: EXPORTED_AT,
    });
    expect(envelope.deletionStatus).toBe("pending_deletion");
  });
});

type FakeRow = Record<string, unknown>;

function makeExportService(state: {
  users: FakeRow[];
  identities: FakeRow[];
}) {
  return {
    schema: (name: string) => {
      expect(name).toBe("internal");
      return {
        from: (table: string) => {
          const filters: { col: string; val: unknown; op: string }[] = [];
          const api: Record<string, unknown> = {};
          const self = api;
          api.select = () => self;
          api.eq = (col: string, val: unknown) => {
            filters.push({ col, val, op: "eq" });
            return self;
          };
          api.order = () => self;
          api.maybeSingle = async () => {
            const rows = table === "users" ? state.users : state.identities;
            const match = rows.find((r) =>
              filters.every((f) => r[f.col] === f.val),
            );
            return { data: match ?? null, error: null };
          };
          // For identities select without maybeSingle — return thenable array
          api.then = (
            resolve: (v: { data: FakeRow[] | null; error: null }) => unknown,
          ) => {
            const rows = state.identities.filter((r) =>
              filters.every((f) => r[f.col] === f.val),
            );
            return Promise.resolve(
              resolve({ data: rows, error: null }),
            );
          };
          return self;
        },
      };
    },
  };
}

describe("loadAccountExport", () => {
  it("returns NO_USER when no internal.users row", async () => {
    const service = makeExportService({ users: [], identities: [] });
    const res = await loadAccountExport(service, USER_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NO_USER");
  });

  it("returns ACCOUNT_DELETED when deletion_status is deleted", async () => {
    const service = makeExportService({
      users: [
        {
          id: USER_ID,
          email: null,
          deletion_status: "deleted",
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-20T00:00:00.000Z",
          deleted_at: "2026-09-20T00:00:00.000Z",
        },
      ],
      identities: [],
    });
    const res = await loadAccountExport(service, USER_ID);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ACCOUNT_DELETED");
  });

  it("returns 200-shaped envelope for active user with identities", async () => {
    const service = makeExportService({
      users: [activeUser()],
      identities: [
        {
          user_id: USER_ID,
          provider: "apple",
          provider_subject: "apple.sub.001",
          created_at: "2026-09-01T00:00:00.000Z",
          closed_at: null,
        },
        {
          user_id: OTHER_ID,
          provider: "apple",
          provider_subject: "other.sub",
          created_at: "2026-09-01T00:00:00.000Z",
          closed_at: null,
        },
      ],
    });
    const res = await loadAccountExport(service, USER_ID, EXPORTED_AT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.envelope.userId).toBe(USER_ID);
    expect(res.envelope.identities).toHaveLength(1);
    expect(res.envelope.identities[0].providerSubject).toBe("apple.sub.001");
    expect(res.envelope.journey).toEqual([]);
    expect(res.envelope.chat).toEqual([]);
    expect(res.envelope.billing).toEqual([]);
    // IDOR: other user's identity must not appear
    expect(
      res.envelope.identities.some((i) => i.providerSubject === "other.sub"),
    ).toBe(false);
  });

  it("allows export when pending_deletion", async () => {
    const service = makeExportService({
      users: [
        activeUser({
          deletion_status: "pending_deletion",
          deleted_at: "2026-09-28T00:00:00.000Z",
        }),
      ],
      identities: [],
    });
    const res = await loadAccountExport(service, USER_ID, EXPORTED_AT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.envelope.deletionStatus).toBe("pending_deletion");
  });
});
