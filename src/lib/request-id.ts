/**
 * Request ID helper (F1.8).
 * Honor a safe incoming x-request-id, else generate a UUID.
 */

const REQUEST_ID_HEADER = "x-request-id";
const MAX_LEN = 128;
/** Alphanumeric, hyphen, underscore, period — common for UUID/ULID/trace ids. */
const SAFE_RE = /^[A-Za-z0-9._-]{1,128}$/;

export function isSafeRequestId(value: string): boolean {
  if (!value || value.length > MAX_LEN) return false;
  return SAFE_RE.test(value);
}

/** Read/generate a request ID from an incoming Request. */
export function getRequestId(request: Request): string {
  const incoming = request.headers.get(REQUEST_ID_HEADER)?.trim() ?? "";
  if (isSafeRequestId(incoming)) return incoming;
  return crypto.randomUUID();
}

/** Attach x-request-id on a NextResponse (or Headers-compatible). */
export function setRequestIdHeader(
  headers: Headers,
  requestId: string,
): void {
  headers.set(REQUEST_ID_HEADER, requestId);
}

export { REQUEST_ID_HEADER };
