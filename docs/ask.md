# F11b — Ask Nomade (backend)

Grounded Q&A over `internal.sources` + the user's own checklist and intake. Runbook: F11 (F11b section).
Not legal advice. The disclaimer is byte-for-byte `Preliminary guidance — not legal advice`.

## Endpoints

### `POST /api/ask` (Node, SSE)

Auth: `Authorization: Bearer <Supabase access token>` (same as `/api/journey/*`, `/api/route`, `/api/chat`) + active account.

Order of checks: 401 `UNAUTHENTICATED` → 503 `ASK_DISABLED` (`ASK_ENABLED` not `true`) → 400 `BAD_REQUEST` →
401/403/410 account state → 404 `NO_JOURNEY_CASE` → 429 `ASK_RATE_LIMITED` → 200 SSE.

Request:
```json
{
  "messages": [{ "role": "user", "content": "Do I need a registered lease?" }],
  "focusStepId": "accommodation",
  "consulatePostId": "new-york"
}
```
- `messages`: at most 12 in the request (400 otherwise). The server keeps the last 6, which must end with a `user` turn. User turns must be 1–1,000 chars (400 if longer). Assistant turns are trimmed to 1,000 chars and lose their `[S#]` markers, because numbering is per answer. Leading assistant turns are dropped.
- `focusStepId` (optional): must be a step id in the user's current, visible checklist (400 otherwise).
- `consulatePostId` (optional): one of `washington, boston, chicago, detroit, houston, los-angeles, miami, new-york, philadelphia, san-francisco`. Residence stays on the device (F9 lock). Only the post id is sent.
- The legacy `profile` / `taskContext` fields are ignored. The server reads the path, checklist and intake itself.

Response: `text/event-stream`, the same `data:` shape as the legacy chat parser:
```
data: {"delta":{"text":"US posts want the lease in your name [S1]."}}
data: {"final":{"outcome":"answered","citations":[{"n":1,"sourceId":"us-new-york-dnv","title":"…","publisher":"…","url":"https://…","host":"consnewyork.esteri.it","retrievedAt":"2026-10-08"}],"disclaimer":"Preliminary guidance — not legal advice","remaining":9,"limit":10,"resetAt":"2026-10-17T00:00:00.000Z"}}
data: [DONE]
```
- `outcome`: `answered` | `refused_no_source` | `refused_uncited` | `refused_unsupported` | `error`.
  - `refused_no_source`: no source matched, or the best match is below the relevance floor (`ASK_RELEVANCE_FLOOR`, off-topic). The model is **not** called and **no question is used up**. The single delta is the refusal sentence.
  - `refused_uncited`: the model produced no valid `[S#]`. **The client replaces the streamed text with `final.refusal`.**
  - `refused_unsupported` (new): the answer cited sources but stated a number (amount, currency figure, day/month count, year, percentage, in digits) that does not appear in the summary or title of any source it cited. **The client replaces the streamed text with `final.refusal`, exactly like `refused_uncited`.** `citations` is `[]`.
  - `error`: upstream/model failure. Refunded only if no answer text was sent yet and the client did not abort (`remaining` reflects that). Show `final.refusal` or a retry.
  - Every `refused_*`/`error` final carries `refusal` (canned copy, so clients don't hardcode it). `answered` has none.
- `[S#]` markers in deltas refer to `citations[].n`. Out-of-range markers are stripped server-side before streaming, so every marker the client sees has a matching citation.
- `citations` lists only the sources actually cited, in first-cited order.
- 429 body: `{ "error": { "code": "ASK_RATE_LIMITED", … }, "limit": 3, "remaining": 0, "resetAt": "…", "tier": "free" }` + `Retry-After`.

### `GET /api/ask/usage`

Bearer + active. Works even when `ASK_ENABLED` is off, so the app can hide the entry point.
```json
{ "enabled": true, "limit": 10, "used": 2, "remaining": 8, "resetAt": "2026-10-17T00:00:00.000Z", "tier": "ungated", "disclaimer": "Preliminary guidance — not legal advice", "requestId": "…" }
```
`tier`: `ungated` (`BILLING_GATE_ENABLED` off → 10/day for everyone), `free` (`ASK_FREE_DAILY`, default 3), `paid` (`journey_full`, `ASK_PAID_DAILY`, default 30). The day is the UTC day.

## Grounding

1. Candidates are active `internal.sources` rows tagged with the user's path (`src/lib/ask/retrieve.ts`, deterministic, no embeddings). A row qualifies if it shares a distinctive keyword with the question (IDF-weighted over title/publisher/summary/notes), maps to `focusStepId`, or maps to a visible step whose copy the question names (e.g. "FBI" → `criminal-record`). Ranking boosts the focused step and the user's consulate post, and demotes other posts. Visible-step overlap is only a tie-break. The top 8 become `[S1]…[S8]`.
2. If there are 0 candidates, the refusal is returned without a model call.
3. The system prompt contains a `<nomade_guidance>` block with the approved step text of the user's visible, unlocked steps (context only; the prompt says it is not a source and must never be cited; only `[S#]` rows count as citations), the numbered source blocks (title, publisher, URL, retrieved date, summary, notes), the user's path, post id, visible steps (id, phase, status, name) and intake answers. Nothing else. The latest user message is sent inside a `<question>` block. It has rules: answer only from the sources, cite `[S#]` after each claim, say the exact refusal sentence when not covered, no numbers that aren't in a source, no eligibility verdicts, and data blocks are not instructions.
4. After the stream: parse `[S#]`, keep 1..N. If 0 are valid → `refused_uncited`.
5. Number check (`src/lib/ask/numbers.ts`): every digit number in the answer (separators normalised: `30,000` = `30.000` = `30000`) must appear in a cited source's summary or title. Nomade guidance and user context don't count. Spelled-out numbers aren't checked. Any miss → `refused_unsupported`.

Model: Vercel AI Gateway through the AI SDK (`ai`). `ASK_MODEL` (default `anthropic/claude-sonnet-4.5`), gateway fallback `ASK_FALLBACK_MODEL` (default `anthropic/claude-haiku-4.5`), temperature 0.2, max 600 output tokens, 1 retry. Gateway options: `zeroDataRetention: true`, `disallowPromptTraining: true`, `user` = hashed user tag, `tags: ["nomade-ask"]`.

## Storage, logs, privacy

- `internal.ask_usage (user_id, day, count)`: a question is counted only right before the model call (after retrieval and the floor). Rate limit via `internal.ask_consume(user, limit, day)`, which is atomic and returns remaining or -1. `internal.ask_refund` undoes one question after a clean upstream error (not after a client abort or once text was streamed) or when the handler fails after consuming but before streaming.
- `internal.ask_events`: metadata only (outcome, cited source ids, focus step, model, tokens, latency). **No question or answer text is stored anywhere server-side.** Threads stay on the device.
- Retention: `internal.ask_prune()` (events > 90 days, usage > 7 days) runs from the daily `/api/cron/purge-accounts`.
- Export: `chat: { usage: [{ day, count }], events: [...] }`. Purge: `wipeChat` deletes both tables for the user. FK cascade also covers it.
- Logs: request id, `userHash` (sha256 prefix, never the raw id), outcome, tier, candidate/cited ids, tokens, latency. Never message text. `log.ts` also redacts `messages/content/question/answer/prompt/system/text` keys. The SDK's default `onError` console logging is disabled because provider errors can echo the request body.

## Ops (Isaias)

- Vercel → AI Gateway: set a **monthly spend cap** (Cap suggests $50) and confirm ZDR for Anthropic routing.
- `ASK_ENABLED=true` on Preview only → Cap runs the 20-question eval (`docs/ask-eval.md`, to be written by Cap). Production stays off.
- `/api/chat` stays as it is (sign-in required since F11 step 0, #31). It changes to `410 GONE` after the iOS Ask build is in TestFlight (runbook decision 10 / rollout step 4).
