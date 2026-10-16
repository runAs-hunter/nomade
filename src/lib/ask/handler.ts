/**
 * F11b `POST /api/ask` + `GET /api/ask/usage` handlers (dependency-injected
 * model so tests never touch the gateway).
 *
 * Logs: request id, hashed user, counts, source ids, latency, tokens, outcome.
 * NEVER question/answer text, names, emails, Apple ids (Cap lock).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import type { AccountDbClient } from "@/lib/account/export";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { requireAccess } from "@/lib/auth/require-access";
import { hasActiveJourneyFull } from "@/lib/billing/entitlements";
import { getAskConfig, isBillingGateEnabled, isIntakeEnabled } from "@/lib/env";
import { requireActiveJourneyAccount } from "@/lib/journey/access";
import { getPathDef } from "@/lib/journey/catalog";
import { getChecklist } from "@/lib/journey/checklist";
import { sourceHost } from "@/lib/journey/checklist-sources";
import { US_CONSULATE_POST_IDS } from "@/lib/journey/consulates";
import { activeAccountErrorResponse, withRequestId } from "@/lib/journey/http";
import { loadIntake } from "@/lib/journey/intake-store";
import { log, type Logger } from "@/lib/log";
import { getRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";
import {
  ASK_DISCLAIMER,
  ASK_MAX_MESSAGE_CHARS,
  ASK_MAX_MESSAGES,
  ASK_REFUSAL,
  ASK_RELEVANCE_FLOOR,
  type AskOutcome,
} from "@/lib/ask/copy";
import { CitationStreamFilter, extractCitations, stripAllMarkers } from "@/lib/ask/citations";
import type { AskModel, AskModelMessage } from "@/lib/ask/model";
import { unsupportedNumbers } from "@/lib/ask/numbers";
import { buildSystemPrompt, type AskUserContext } from "@/lib/ask/prompt";
import { loadAskSources, rankSources, type AskSourceRow } from "@/lib/ask/retrieve";
import {
  consumeAsk,
  dailyLimitFor,
  readAskUsed,
  recordAskEvent,
  refundAsk,
  resetAtFor,
  userHash,
  utcDay,
} from "@/lib/ask/usage";

export type AskDeps = {
  service: () => AccountDbClient;
  model: AskModel;
  now?: () => Date;
};

export type AskCitation = {
  n: number;
  sourceId: string;
  title: string;
  publisher: string;
  url: string;
  host: string;
  retrievedAt: string;
};

export type AskFinal = {
  outcome: Exclude<AskOutcome, "rate_limited">;
  citations: AskCitation[];
  disclaimer: string;
  /** Present on refused_* / error so clients never hardcode the copy. */
  refusal?: string;
  remaining: number;
  limit: number;
  resetAt: string;
};

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(12),
  focusStepId: z.string().trim().min(1).max(64).nullish(),
  consulatePostId: z.enum(US_CONSULATE_POST_IDS).nullish(),
});

export type ParsedAskBody = {
  messages: AskModelMessage[];
  focusStepId: string | null;
  consulatePostId: string | null;
};

/**
 * Validate + window the request. Last ASK_MAX_MESSAGES messages; the last must
 * be a non-empty user message ≤ 1,000 chars (user turns over the cap → 400).
 * Prior assistant turns are trimmed to 1,000 chars and lose their [S#]
 * markers (numbering is per answer). The window starts on a user turn.
 */
export function parseAskBody(raw: unknown): { ok: true; body: ParsedAskBody } | { ok: false; message: string } {
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Body must be { messages: [{ role, content }], focusStepId?, consulatePostId? }" };
  const window = parsed.data.messages.slice(-ASK_MAX_MESSAGES);
  const out: AskModelMessage[] = [];
  for (const m of window) {
    const content = m.content.trim();
    if (m.role === "user") {
      if (content.length === 0) return { ok: false, message: "Empty user message" };
      if (content.length > ASK_MAX_MESSAGE_CHARS) return { ok: false, message: `Each message must be ≤ ${ASK_MAX_MESSAGE_CHARS} characters` };
      out.push({ role: "user", content });
    } else {
      if (out.length === 0) continue;
      const trimmed = stripAllMarkers(content).slice(0, ASK_MAX_MESSAGE_CHARS).trim();
      if (trimmed.length > 0) out.push({ role: "assistant", content: trimmed });
    }
  }
  if (out.length === 0 || out[out.length - 1]!.role !== "user") {
    return { ok: false, message: "The last message must be from the user" };
  }
  return {
    ok: true,
    body: {
      messages: out,
      focusStepId: parsed.data.focusStepId ?? null,
      consulatePostId: parsed.data.consulatePostId ?? null,
    },
  };
}

/** The latest user turn goes to the model inside a <question> block (data, not instructions). */
export function wrapLastQuestion(messages: AskModelMessage[]): AskModelMessage[] {
  return messages.map((m, i) =>
    i === messages.length - 1 && m.role === "user"
      ? { role: "user", content: `<question>\n${m.content.replace(/<\/?question\b[^>]*>/gi, "")}\n</question>` }
      : m,
  );
}

function internalError(requestId: string, message: string): NextResponse {
  return jsonError({ code: ERROR_CODES.INTERNAL_ERROR, message, requestId, status: 500 });
}

function disabled(requestId: string): NextResponse {
  return jsonError({ code: ERROR_CODES.ASK_DISABLED, message: "Ask Nomade is not enabled", requestId, status: 503 });
}

function toCitation(n: number, row: AskSourceRow): AskCitation {
  return {
    n,
    sourceId: row.id,
    title: row.title,
    publisher: row.publisher,
    url: row.official_url,
    host: sourceHost(row.official_url),
    retrievedAt: row.retrieved_at,
  };
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

type LimitInfo = { limit: number; tier: "ungated" | "free" | "paid" };

async function limitFor(service: AccountDbClient, userId: string, logger: Logger, uh: string): Promise<LimitInfo> {
  const config = getAskConfig();
  const gateEnabled = isBillingGateEnabled();
  if (!gateEnabled) return dailyLimitFor({ gateEnabled, journeyFull: false, config });
  const ent = await hasActiveJourneyFull(service, userId);
  if (!ent.ok) logger.warn("ask entitlement unavailable", { userHash: uh });
  return dailyLimitFor({ gateEnabled, journeyFull: ent.ok && ent.active, config });
}

/** POST /api/ask */
export async function handleAsk(request: Request, deps: AskDeps): Promise<Response> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });
  const now = deps.now ?? (() => new Date());
  const started = Date.now();

  const auth = await requireAccess(request, { requestId, logger, failMessage: "ask unauthenticated" });
  if (auth instanceof NextResponse) return auth;
  const userId = auth.userId;
  const uh = userHash(userId);

  const config = getAskConfig();
  if (!config.enabled) return disabled(requestId);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError({ code: ERROR_CODES.BAD_REQUEST, message: "Body must be JSON", requestId, status: 400 });
  }
  const parsed = parseAskBody(raw);
  if (!parsed.ok) {
    logger.info("ask rejected", { userHash: uh, code: ERROR_CODES.BAD_REQUEST });
    return jsonError({ code: ERROR_CODES.BAD_REQUEST, message: parsed.message, requestId, status: 400 });
  }
  const body = parsed.body;

  const service = deps.service();
  // Set once a question is consumed; cleared when the stream takes ownership
  // of refunds. The outer catch refunds whenever it is still set (Cap, #34).
  let consumed: { ok: true; remaining: number } | { ok: false } | null = null;
  let consumedDay: string | null = null;
  try {
    const account = await requireActiveJourneyAccount(service, userId);
    if (!account.ok) return activeAccountErrorResponse(account, requestId);

    const checklistRes = await getChecklist(service, userId);
    if (!checklistRes.ok) {
      if (checklistRes.code === "NO_JOURNEY_CASE") {
        return jsonError({ code: ERROR_CODES.NO_JOURNEY_CASE, message: checklistRes.message, requestId, status: 404 });
      }
      return internalError(requestId, "Failed to load checklist");
    }
    const checklist = checklistRes.checklist;
    const steps = checklist.phases.flatMap((p) =>
      p.steps.map((s) => ({ id: s.id, name: s.name, phase: p.id, status: s.status })),
    );
    const stepTexts = checklist.phases.flatMap((p) =>
      p.steps.map((s) => ({ id: s.id, text: `${s.name} ${s.detail}` })),
    );
    if (body.focusStepId && !steps.some((s) => s.id === body.focusStepId)) {
      return jsonError({ code: ERROR_CODES.BAD_REQUEST, message: "focusStepId is not a step in your checklist", requestId, status: 400 });
    }

    let intake: Record<string, unknown> = {};
    if (isIntakeEnabled()) {
      const intakeRes = await loadIntake(service, checklist.caseId);
      if (intakeRes.ok && intakeRes.intake) intake = { ...intakeRes.intake.answers };
    }

    const sourcesRes = await loadAskSources(service, checklist.pathId);
    if (!sourcesRes.ok) return internalError(requestId, "Failed to load sources");

    const nowDate = now();
    const day = utcDay(nowDate);
    const resetAt = resetAtFor(nowDate);
    const { limit, tier } = await limitFor(service, userId, logger, uh);

    const userMessages = body.messages.filter((m) => m.role === "user").map((m) => m.content);
    const question = userMessages[userMessages.length - 1]!;
    const focusName = body.focusStepId ? steps.find((s) => s.id === body.focusStepId)?.name ?? null : null;
    const ranked = rankSources(sourcesRes.rows, {
      question,
      priorQuestions: userMessages.slice(0, -1),
      focusStepId: body.focusStepId,
      focusStepName: focusName,
      visibleStepIds: steps.map((s) => s.id),
      stepTexts,
      consulatePostId: body.consulatePostId,
    });
    // Relevance floor: a weak best match is off-topic → refusal, no model call.
    const topScore = ranked[0]?.score ?? 0;
    const sources = topScore >= ASK_RELEVANCE_FLOOR ? ranked.map((r) => r.row) : [];
    const encoder = new TextEncoder();
    const headers = { ...SSE_HEADERS, [REQUEST_ID_HEADER]: requestId };

    if (sources.length === 0) {
      const used = await readAskUsed(service, userId, day);
      const base = { disclaimer: ASK_DISCLAIMER, remaining: Math.max(0, limit - (used.ok ? used.used : 0)), limit, resetAt };
      await recordAskEvent(service, userId, {
        outcome: "refused_no_source",
        focusStepId: body.focusStepId,
        latencyMs: Date.now() - started,
      });
      logger.info("ask done", { userHash: uh, outcome: "refused_no_source", candidates: 0, belowFloor: ranked.length > 0, topScore: Number(topScore.toFixed(2)), tier, latencyMs: Date.now() - started });
      const final: AskFinal = { outcome: "refused_no_source", citations: [], refusal: ASK_REFUSAL, ...base };
      const text = sse({ delta: { text: ASK_REFUSAL } }) + sse({ final }) + "data: [DONE]\n\n";
      return new Response(encoder.encode(text), { status: 200, headers });
    }

    // Rate limit (atomic). Counted only when the model will be called (Cap, #34):
    // a no-source / below-floor refusal never uses up a question.
    consumed = await consumeAsk(service, userId, limit, day);
    if (!consumed.ok) { consumed = null; return internalError(requestId, "Failed to check usage"); }
    if (consumed.remaining < 0) {
      consumed = null;
      await recordAskEvent(service, userId, { outcome: "rate_limited", focusStepId: body.focusStepId });
      logger.info("ask rate limited", { userHash: uh, limit, tier, outcome: "rate_limited" });
      const res = NextResponse.json(
        {
          error: { code: ERROR_CODES.ASK_RATE_LIMITED, message: "Daily question limit reached", requestId },
          limit,
          remaining: 0,
          resetAt,
          tier,
        },
        { status: 429 },
      );
      res.headers.set(REQUEST_ID_HEADER, requestId);
      res.headers.set("Retry-After", String(Math.max(1, Math.ceil((Date.parse(resetAt) - nowDate.getTime()) / 1000))));
      return res;
    }
    const remaining = consumed.remaining;
    consumedDay = day;
    const base = { disclaimer: ASK_DISCLAIMER, remaining, limit, resetAt };

    const ctx: AskUserContext = {
      pathId: checklist.pathId,
      pathName: getPathDef(checklist.pathId)?.title ?? checklist.pathId,
      consulatePostId: body.consulatePostId,
      focusStepId: body.focusStepId,
      steps,
      guidance: checklist.phases.flatMap((p) =>
        p.steps.filter((s) => s.detail.length > 0).map((s) => ({ stepId: s.id, text: s.detail })),
      ),
      intake,
    };
    const system = buildSystemPrompt(sources, ctx);
    const modelId = config.model;

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        const filter = new CitationStreamFilter(sources.length);
        let sentText = false;
        let outcome: AskFinal["outcome"] = "answered";
        let usage: { inputTokens: number | null; outputTokens: number | null } = { inputTokens: null, outputTokens: null };
        try {
          const stream = deps.model({
            model: modelId,
            fallbackModels: config.fallbackModels,
            system,
            messages: wrapLastQuestion(body.messages),
            userTag: uh,
            abortSignal: request.signal,
          });
          for await (const delta of stream.textStream) {
            const clean = filter.push(delta);
            if (clean) {
              controller.enqueue(encoder.encode(sse({ delta: { text: clean } })));
              sentText = true;
            }
          }
          const tail = filter.flush();
          if (tail) {
            controller.enqueue(encoder.encode(sse({ delta: { text: tail } })));
            sentText = true;
          }
          usage = await stream.usage();
        } catch {
          outcome = "error";
        }

        let cited: number[] = [];
        let unsupported = 0;
        let finalRemaining = remaining;
        // Refund only a clean upstream failure: never a client abort, and never
        // once any answer text reached the client (Cap, #34).
        const refunded = outcome === "error" && !request.signal.aborted && !sentText;
        if (refunded) {
          await refundAsk(service, userId, day);
          finalRemaining = Math.min(limit, remaining + 1);
        } else {
          cited = extractCitations(filter.text, sources.length);
          if (cited.length === 0) outcome = "refused_uncited";
          else {
            unsupported = unsupportedNumbers(filter.text, cited.map((n) => sources[n - 1]!)).length;
            if (unsupported > 0) {
              outcome = "refused_unsupported";
              cited = [];
            }
          }
        }
        const citations = cited.map((n) => toCitation(n, sources[n - 1]!));
        const final: AskFinal = {
          outcome,
          citations,
          ...base,
          remaining: finalRemaining,
          ...(outcome === "answered" ? {} : { refusal: ASK_REFUSAL }),
        };
        const latencyMs = Date.now() - started;
        await recordAskEvent(service, userId, {
          outcome,
          sourceIds: citations.map((c) => c.sourceId),
          focusStepId: body.focusStepId,
          model: modelId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          latencyMs,
        });
        const meta = {
          userHash: uh,
          outcome,
          tier,
          candidates: sources.length,
          candidateIds: sources.map((s) => s.id),
          citedIds: citations.map((c) => c.sourceId),
          model: modelId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          latencyMs,
          refused: outcome !== "answered",
          unsupportedNumbers: unsupported,
        };
        if (outcome === "error") logger.error("ask upstream failed", meta);
        else logger.info("ask done", meta);
        try {
          controller.enqueue(encoder.encode(sse({ final })));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          // client went away
        }
      },
    });
    // The stream now owns the refund decision.
    consumed = null;
    return new Response(readable, { status: 200, headers });
  } catch {
    if (consumed && consumed.ok && consumed.remaining >= 0 && consumedDay) {
      await refundAsk(service, userId, consumedDay);
    }
    logger.error("ask threw", { userHash: uh, code: ERROR_CODES.INTERNAL_ERROR });
    return internalError(requestId, "Unexpected ask failure");
  }
}

/** GET /api/ask/usage → { enabled, limit, used, remaining, resetAt, tier }. */
export async function handleAskUsage(request: Request, deps: Pick<AskDeps, "service" | "now">): Promise<Response> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });
  const auth = await requireAccess(request, { requestId, logger, failMessage: "ask usage unauthenticated" });
  if (auth instanceof NextResponse) return auth;
  const uh = userHash(auth.userId);
  try {
    const service = deps.service();
    const account = await requireActiveJourneyAccount(service, auth.userId);
    if (!account.ok) return activeAccountErrorResponse(account, requestId);
    const nowDate = (deps.now ?? (() => new Date()))();
    const day = utcDay(nowDate);
    const { limit, tier } = await limitFor(service, auth.userId, logger, uh);
    const used = await readAskUsed(service, auth.userId, day);
    if (!used.ok) return internalError(requestId, "Failed to read usage");
    return withRequestId(
      {
        enabled: getAskConfig().enabled,
        limit,
        used: used.used,
        remaining: Math.max(0, limit - used.used),
        resetAt: resetAtFor(nowDate),
        tier,
        disclaimer: ASK_DISCLAIMER,
        requestId,
      },
      200,
      requestId,
    );
  } catch {
    logger.error("ask usage threw", { userHash: uh });
    return internalError(requestId, "Unexpected usage failure");
  }
}
