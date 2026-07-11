"use client";

import { useState, useRef, useEffect } from "react";
import { clsx } from "clsx";
import type { PersonalizedTask } from "@/data/schema";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIExpandableDrawerProps {
  task: PersonalizedTask;
  countryName: string;
  onClose: () => void;
}

export function AIExpandableDrawer({
  task,
  countryName,
  onClose,
}: AIExpandableDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    setError(null);

    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          taskContext: {
            taskName: task.name,
            taskDetail: task.detail,
            country: countryName,
          },
        }),
      });

      if (!res.ok) throw new Error("Failed to get AI response");
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      setMessages([...newMessages, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE lines
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.delta?.text ?? "";
              assistantText += delta;
              setMessages([
                ...newMessages,
                { role: "assistant", content: assistantText },
              ]);
            } catch {
              // non-JSON line, skip
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={clsx(
        "mt-[var(--space-2)] rounded-[var(--radius-md)]",
        "border border-dashed border-[var(--border)]",
        "bg-[var(--surface)] p-[var(--space-3)]",
        "transition-all duration-200 ease-out"
      )}
      role="region"
      aria-label="AI assistant"
    >
      {/* Task detail */}
      <p className="text-small text-[var(--text-secondary)] mb-[var(--space-3)]">
        {task.detail}
      </p>

      {/* Messages */}
      {messages.length > 0 && (
        <div className="flex flex-col gap-[var(--space-2)] mb-[var(--space-3)]" aria-live="polite">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={clsx(
                "text-small rounded-[var(--radius-md)] px-[var(--space-3)] py-[var(--space-2)]",
                msg.role === "user"
                  ? "bg-[var(--bg)] text-[var(--text-secondary)] self-end"
                  : "bg-[var(--accent-light)] text-[var(--text-primary)] self-start"
              )}
            >
              {msg.content || (
                <span className="text-[var(--text-tertiary)] italic">Thinking…</span>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {error && (
        <p className="text-small text-[var(--error)] mb-[var(--space-2)]">{error}</p>
      )}

      {/* Input */}
      <div className="flex gap-[var(--space-2)]">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
          placeholder={
            messages.length === 0 ? "Ask a question about this step…" : "Follow-up…"
          }
          disabled={loading}
          className={clsx(
            "flex-1 text-small bg-[var(--bg)] rounded-[var(--radius-md)]",
            "px-[var(--space-3)] py-[var(--space-2)]",
            "border border-[var(--border)]",
            "placeholder:text-[var(--text-tertiary)]",
            "focus:outline-none focus:border-[var(--accent)]",
            "disabled:opacity-50"
          )}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className={clsx(
            "shrink-0 h-[36px] px-[var(--space-3)]",
            "text-small font-[500]",
            "bg-[var(--text-primary)] text-white rounded-[var(--radius-md)]",
            "disabled:opacity-30 transition-opacity"
          )}
        >
          {loading ? "…" : "Ask"}
        </button>
        <button
          onClick={onClose}
          aria-label="Close AI assistant"
          className="shrink-0 h-[36px] w-[36px] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
