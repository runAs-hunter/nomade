"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { WAITLIST_COPY } from "@/lib/waitlist/copy";
import { readBrowserAttribution } from "@/lib/waitlist/attribution-client";

type Status = "idle" | "saving" | "success" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...readBrowserAttribution(), email }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const body = (await res.json().catch(() => null)) as { ok?: unknown } | null;
      if (body?.ok === true) {
        setStatus("success");
        return;
      }
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  const busy = status === "saving" || status === "success";

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-[var(--space-3)] md:max-w-[320px]"
      noValidate
    >
      <label
        htmlFor="waitlist-email"
        className="text-body text-[var(--text-primary)]"
      >
        {WAITLIST_COPY.emailLabel}
      </label>
      <input
        id="waitlist-email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          if (status === "error") setStatus("idle");
        }}
        disabled={busy}
        className="h-[44px] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-[var(--space-4)] text-body text-[var(--text-primary)]"
      />
      <Button type="submit" variant="primary" fullWidth disabled={busy}>
        {WAITLIST_COPY.button}
      </Button>
      <p className="text-caption text-[var(--text-tertiary)]">{WAITLIST_COPY.microcopy}</p>
      {status === "success" ? (
        <p className="text-body text-[var(--success)]" role="status">
          {WAITLIST_COPY.success}
        </p>
      ) : null}
      {status === "error" ? (
        <p className="text-body text-[var(--error)]" role="alert">
          {WAITLIST_COPY.failure}
        </p>
      ) : null}
    </form>
  );
}
