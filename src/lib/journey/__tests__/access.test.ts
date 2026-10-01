import { describe, it, expect } from "vitest";
import { requireActiveJourneyAccount } from "@/lib/journey/access";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makeService(row: Record<string, unknown> | null) {
  return {
    schema: () => ({
      from: () => {
        const api: Record<string, unknown> = {};
        const self = api;
        api.select = () => self;
        api.eq = () => self;
        api.maybeSingle = async () => ({ data: row, error: null });
        return self;
      },
    }),
  };
}

describe("requireActiveJourneyAccount", () => {
  it("accepts active", async () => {
    const res = await requireActiveJourneyAccount(
      makeService({ id: USER_ID, deletion_status: "active" }),
      USER_ID,
    );
    expect(res.ok).toBe(true);
  });

  it("refuses pending_deletion / deleted / missing", async () => {
    const pending = await requireActiveJourneyAccount(
      makeService({ id: USER_ID, deletion_status: "pending_deletion" }),
      USER_ID,
    );
    expect(pending.ok).toBe(false);
    if (!pending.ok) expect(pending.code).toBe("ACCOUNT_PENDING_DELETION");

    const deleted = await requireActiveJourneyAccount(
      makeService({ id: USER_ID, deletion_status: "deleted" }),
      USER_ID,
    );
    expect(deleted.ok).toBe(false);
    if (!deleted.ok) expect(deleted.code).toBe("ACCOUNT_DELETED");

    const missing = await requireActiveJourneyAccount(makeService(null), USER_ID);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe("NO_USER");
  });
});
