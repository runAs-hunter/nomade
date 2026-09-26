/**
 * Structured JSON logger (F1.8).
 *
 * Thin console wrapper that emits one JSON object per line (Vercel log-drain
 * friendly). Chosen over pino to avoid an extra dependency for a small stdout
 * JSON need; swap later if sinks/levels grow.
 *
 * Never log Class H secrets, JWTs, chat/message content, or profile payloads
 * (see docs/adrs/F0.2-data-classification-retention-adr.md and
 * docs/observability.md).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const REDACTED = "[REDACTED]";

/** Field names (case-insensitive) that always become [REDACTED]. */
export const REDACT_FIELD_DENYLIST = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "set-cookie",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "service_role",
  "anon_key",
  "private_key",
  "credit_card",
  "ssn",
  "authorization_header",
  // Chat / profile payload keys — callers must not pass them; strip if they do.
  "messages",
  "content",
] as const;

const DENYLIST_SET = new Set(
  REDACT_FIELD_DENYLIST.map((k) => k.toLowerCase()),
);

/** JWT-looking strings (eyJ…). */
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

/** Lines / values that mention Bearer tokens or service_role leakage. */
const STACK_SECRET_RE = /(=eyJ|service_role|Bearer\s+[A-Za-z0-9._-]+)/i;

function isDenylistedKey(key: string): boolean {
  return DENYLIST_SET.has(key.toLowerCase());
}

function redactString(value: string): string {
  if (JWT_RE.test(value)) {
    // Reset lastIndex after global test/replace
    JWT_RE.lastIndex = 0;
    return value.replace(JWT_RE, REDACTED);
  }
  JWT_RE.lastIndex = 0;
  return value;
}

function redactStack(stack: string): string {
  return stack
    .split("\n")
    .map((line) => (STACK_SECRET_RE.test(line) ? REDACTED : redactString(line)))
    .join("\n");
}

/**
 * Deep-redact structured context before emit.
 * Exported for unit tests.
 */
export function redact(value: unknown, key?: string): unknown {
  if (key !== undefined && isDenylistedKey(key)) {
    return REDACTED;
  }

  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return redactString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      name: value.name,
      message: redactString(value.message),
    };
    if (value.stack) {
      out.stack = redactStack(value.stack);
    }
    return out;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v, k);
    }
    return out;
  }

  return String(value);
}

type Bindings = {
  requestId?: string;
};

export type Logger = {
  debug: (msg: string, context?: LogContext) => void;
  info: (msg: string, context?: LogContext) => void;
  warn: (msg: string, context?: LogContext) => void;
  error: (msg: string, context?: LogContext) => void;
  child: (bindings: Bindings) => Logger;
};

function emit(
  level: LogLevel,
  msg: string,
  bindings: Bindings,
  context?: LogContext,
): void {
  const line: Record<string, unknown> = {
    level,
    msg,
    time: new Date().toISOString(),
  };
  if (bindings.requestId) {
    line.requestId = bindings.requestId;
  }
  if (context && Object.keys(context).length > 0) {
    const scrubbed = redact(context) as Record<string, unknown>;
    for (const [k, v] of Object.entries(scrubbed)) {
      // Do not overwrite core fields
      if (k === "level" || k === "msg" || k === "time" || k === "requestId") {
        continue;
      }
      line[k] = v;
    }
  }

  const json = JSON.stringify(line);
  if (level === "error") {
    console.error(json);
  } else if (level === "warn") {
    console.warn(json);
  } else {
    // debug + info → stdout
    console.log(json);
  }
}

function createLogger(bindings: Bindings = {}): Logger {
  return {
    debug: (msg, context) => emit("debug", msg, bindings, context),
    info: (msg, context) => emit("info", msg, bindings, context),
    warn: (msg, context) => emit("warn", msg, bindings, context),
    error: (msg, context) => emit("error", msg, bindings, context),
    child: (childBindings) =>
      createLogger({ ...bindings, ...childBindings }),
  };
}

/** Root logger — prefer `log.child({ requestId })` inside request handlers. */
export const log: Logger = createLogger();
