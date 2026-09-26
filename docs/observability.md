# Observability (F1.8)

Structured logging, request IDs, and stable API error envelopes for Nomade backend.

**Data rules:** F0.2 — never log Class H secrets, JWTs, service-role keys, chat/message content, or profile PII. See [`adrs/F0.2-data-classification-retention-adr.md`](./adrs/F0.2-data-classification-retention-adr.md).

## Logger

- Module: `src/lib/log.ts`
- Implementation: thin `console` JSON wrapper (one object per line). Chosen over pino to avoid an extra dependency for stdout JSON on Vercel; swap later if sinks grow.
- Levels: `debug`, `info`, `warn`, `error`
- Line shape: `{ level, msg, time, requestId?, …context }`
- Request scope: `log.child({ requestId })`
- Redaction applied to all structured context before emit

### Redaction denylist (case-insensitive field names)

`password`, `secret`, `token`, `authorization`, `cookie`, `set-cookie`, `api_key`, `apikey`, `access_token`, `refresh_token`, `service_role`, `anon_key`, `private_key`, `credit_card`, `ssn`, `authorization_header`, plus `messages` / `content` when used as log fields.

Also:

- JWT-looking string values matching `eyJ…` are replaced with `[REDACTED]`
- Never dump raw `process.env`
- Callers must not pass chat/profile payloads into logs; denylist is a backstop

## Request ID

- Module: `src/lib/request-id.ts`
- Header: `x-request-id`
- Honor incoming value if well-formed (≤ 128 chars, `[A-Za-z0-9._-]`); otherwise generate a UUID
- Echo the same value on the response

## API error envelope

- Module: `src/lib/api-error.ts` — `jsonError({ code, message, requestId, status })`
- Body for 4xx/5xx App Router API routes:

```json
{
  "error": {
    "code": "STABLE_CODE",
    "message": "Safe human-readable summary",
    "requestId": "uuid-or-ulid"
  }
}
```

Starter codes: `ENV_INVALID`, `SUPABASE_PING_FAILED`, `HEALTH_ERROR`, `BAD_REQUEST`, `NOT_FOUND`, `INTERNAL_ERROR`.

`message` must never include keys, JWTs, connection strings, stack traces, or raw provider bodies. Log details server-side only.

## Health

`GET /api/health` keeps its existing body (`ok` / `supabase` / `projectRef` / `code`) and sets `x-request-id`. Ping failures are logged without provider error details.

## Reading Vercel logs

Preview/Production function logs show one JSON object per line. Filter by `requestId` to correlate a client-reported ID with server lines. Do not paste secret-bearing log lines into chat or tickets.

## Related

- Backend env: [`backend-env.md`](./backend-env.md)
- Vercel Preview: [`vercel-preview.md`](./vercel-preview.md)
- CI: [`ci.md`](./ci.md)
