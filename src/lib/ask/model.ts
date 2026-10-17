/**
 * F11b model adapter. Production = Vercel AI Gateway via the AI SDK (`ai`).
 * Tests inject a fake AskModel — the gateway is never called in CI.
 *
 * Auth: the AI SDK reads AI_GATEWAY_API_KEY from env, or Vercel OIDC on
 * deployments. The key is never read, logged, or returned here.
 * Privacy: gateway `zeroDataRetention` + `disallowPromptTraining` restrict
 * routing to providers with those agreements (runbook G2/G5).
 */

import { gateway, streamText } from "ai";
import { ASK_MAX_OUTPUT_TOKENS, ASK_TEMPERATURE } from "@/lib/ask/copy";

export type AskModelMessage = { role: "user" | "assistant"; content: string };

export type AskModelUsage = { inputTokens: number | null; outputTokens: number | null };

export type AskModelStream = {
  textStream: AsyncIterable<string>;
  /** Resolves after the stream ends; never rejects (nulls on failure). */
  usage: () => Promise<AskModelUsage>;
};

export type AskModelRequest = {
  model: string;
  fallbackModels: string[];
  system: string;
  messages: AskModelMessage[];
  /** Hashed user tag (spend attribution) — never the raw user id. */
  userTag: string;
  abortSignal?: AbortSignal;
};

/** Upstream failure. Carries no message/body (never log provider errors verbatim). */
export class AskUpstreamError extends Error {
  constructor() {
    super("ask upstream error");
    this.name = "AskUpstreamError";
  }
}

export type AskModel = (req: AskModelRequest) => AskModelStream;

export const gatewayAskModel: AskModel = (req) => {
  const result = streamText({
    model: gateway(req.model),
    system: req.system,
    messages: req.messages,
    temperature: ASK_TEMPERATURE,
    maxOutputTokens: ASK_MAX_OUTPUT_TOKENS,
    maxRetries: 1,
    abortSignal: req.abortSignal,
    // The SDK's default onError console.errors the error, which can carry the
    // request body (prompt text). Errors surface through fullStream instead.
    onError: () => {},
    providerOptions: {
      gateway: {
        ...(req.fallbackModels.length > 0 ? { models: req.fallbackModels } : {}),
        zeroDataRetention: true,
        disallowPromptTraining: true,
        user: req.userTag,
        tags: ["nomade-ask"],
      },
    },
  });
  async function* text(): AsyncIterable<string> {
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") yield part.text;
      else if (part.type === "error") throw new AskUpstreamError();
    }
  }
  return {
    textStream: text(),
    usage: async () => {
      try {
        const u = await result.totalUsage;
        return { inputTokens: u.inputTokens ?? null, outputTokens: u.outputTokens ?? null };
      } catch {
        return { inputTokens: null, outputTokens: null };
      }
    },
  };
};
