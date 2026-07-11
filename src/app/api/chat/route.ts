import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a knowledgeable assistant helping digital nomads with the Italy Digital Nomad Visa (Visto per Nomadi Digitali) application process.

You have deep expertise in:
- Italy's digital nomad visa requirements and documentation
- Consulate processes and common pitfalls
- Income documentation requirements for freelancers, employees, and business owners
- Apostille requirements for non-EU applicants
- The Permesso di Soggiorno process after arrival
- Practical tips from real applicants

Be concise and specific. When answering, focus on the exact task the user is asking about. Cite approximate figures (€28,000 minimum income, processing times, etc.) and flag that requirements may change — always recommend verifying with the consulate. Do not give legal advice.`;

/** Maximum conversation turns to send to the API (sliding window). */
const MAX_TURNS = 10;

type MessageParam = {
  role: "user" | "assistant";
  content: string;
};

/** The user's quiz profile (E6 2A). Optional — general chat may omit it. */
type Profile = {
  nationality?: string;
  nationality_group?: string;
  residence?: string;
  income_type?: string;
  income_range?: string;
  traveling_with?: string;
};

const INCOME_RANGE_LABELS: Record<string, string> = {
  under_28k: "under €28,000/yr",
  "28k_to_50k": "€28,000–50,000/yr",
  "50k_to_100k": "€50,000–100,000/yr",
  over_100k: "over €100,000/yr",
};

/** A compact profile description injected into the system prompt so the
 *  assistant tailors answers to this applicant even after older turns fall out
 *  of the MAX_TURNS window. */
function describeProfile(p: Profile): string {
  const parts: string[] = [];
  if (p.nationality) {
    const group = p.nationality_group ? ` (${p.nationality_group})` : "";
    parts.push(`nationality ${p.nationality}${group}`);
  }
  if (p.residence) parts.push(`residing in ${p.residence}`);
  if (p.income_type) parts.push(`income type ${p.income_type.replace(/_/g, " ")}`);
  if (p.income_range) {
    parts.push(`income ${INCOME_RANGE_LABELS[p.income_range] ?? p.income_range}`);
  }
  if (p.traveling_with) {
    parts.push(`traveling ${p.traveling_with.replace(/_/g, " ")}`);
  }
  return parts.join(", ");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: MessageParam[] = body.messages ?? [];
    const taskContext: {
      taskName?: string;
      taskDetail?: string;
      country?: string;
    } = body.taskContext ?? {};
    const profile: Profile = body.profile ?? {};

    if (!messages.length) {
      return new Response("No messages provided", { status: 400 });
    }

    // Build context-enriched system prompt
    let systemPrompt = SYSTEM_PROMPT;
    const profileDesc = describeProfile(profile);
    if (profileDesc) {
      systemPrompt += `\n\nThe user's profile: ${profileDesc}. Tailor answers to this applicant (e.g. apostille/translation needs for non-EU, income thresholds, family requirements).`;
    }
    if (taskContext.taskName) {
      systemPrompt += `\n\nThe user is currently focused on this specific task: "${taskContext.taskName}".`;
      if (taskContext.taskDetail) {
        systemPrompt += ` Task details: ${taskContext.taskDetail}`;
      }
    }

    // Sliding window — keep last MAX_TURNS turns (user+assistant pairs)
    const window = messages.slice(-MAX_TURNS);

    // Ensure the window starts with a user message (Anthropic requirement)
    const sanitized: MessageParam[] = [];
    for (const msg of window) {
      if (
        sanitized.length === 0 && msg.role !== "user"
      ) continue;
      sanitized.push(msg);
    }

    if (!sanitized.length) {
      return new Response("No valid user message", { status: 400 });
    }

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: sanitized,
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const data = JSON.stringify({ delta: { text: event.delta.text } });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return new Response("Internal server error", { status: 500 });
  }
}
