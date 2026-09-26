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
});
