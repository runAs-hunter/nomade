import { describe, expect, it } from "vitest";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { activeAccountErrorResponse, withRequestId } from "@/lib/journey/http";

/** Cap B1-R1: per-user (and paid) JSON is never stored by any cache, errors included. */
describe("journey / forms HTTP helpers: no-store", () => {
  const check = (res: Response) => {
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("vary")).toBe("Authorization");
    expect(res.headers.get("x-request-id")).toBe("rid");
  };

  it("withRequestId (200 and error statuses)", () => {
    check(withRequestId({ ok: true }, 200, "rid"));
    check(withRequestId({ ok: false }, 409, "rid"));
  });

  it("jsonError and the active-account error mapping", () => {
    check(jsonError({ code: ERROR_CODES.INTERNAL_ERROR, message: "x", requestId: "rid", status: 500 }));
    for (const code of ["NO_USER", "ACCOUNT_PENDING_DELETION", "ACCOUNT_DELETED"] as const) {
      check(activeAccountErrorResponse({ ok: false, code, message: "m" } as never, "rid"));
    }
  });
});
