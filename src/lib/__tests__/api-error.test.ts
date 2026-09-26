import { describe, it, expect } from "vitest";
import { ERROR_CODES, jsonError } from "@/lib/api-error";

describe("jsonError", () => {
  it("returns envelope body, status, and x-request-id", async () => {
    const res = jsonError({
      code: ERROR_CODES.BAD_REQUEST,
      message: "Malformed input",
      requestId: "req-envelope-1",
      status: 400,
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("x-request-id")).toBe("req-envelope-1");
    const body = await res.json();
    expect(body).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Malformed input",
        requestId: "req-envelope-1",
      },
    });
  });

  it("supports INTERNAL_ERROR 500", async () => {
    const res = jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected error",
      requestId: "req-500",
      status: 500,
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.requestId).toBe("req-500");
  });

  it("exposes F2.3 error codes", () => {
    expect(ERROR_CODES.UNAUTHENTICATED).toBe("UNAUTHENTICATED");
    expect(ERROR_CODES.FORBIDDEN).toBe("FORBIDDEN");
    expect(ERROR_CODES.ACCOUNT_PENDING_DELETION).toBe("ACCOUNT_PENDING_DELETION");
    expect(ERROR_CODES.ACCOUNT_DELETED).toBe("ACCOUNT_DELETED");
    expect(ERROR_CODES.MERGE_REQUIRED).toBe("MERGE_REQUIRED");
  });

  it("supports UNAUTHENTICATED 401", async () => {
    const res = jsonError({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: "Missing or invalid access token",
      requestId: "req-401",
      status: 401,
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

});
