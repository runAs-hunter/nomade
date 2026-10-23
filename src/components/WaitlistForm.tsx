"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { WAITLIST_COPY } from "@/lib/waitlist/copy";
import { readBrowserAttribution } from "@/lib/waitlist/attribution-client";
import { CTA_COPY, type CtaSource } from "@/lib/waitlist/cta";

type Status = "idle" | "saving" | "success" | "error";

type WaitlistFormProps = {
  /**
   * F12 CTA cards: sets signup_source and uses the CTA signup-step copy, then
   * goes to the thank-you page. Omitted for the main homepage form, which
   * keeps today's behaviour (no signup_source, inline success).
   */
  signupSource?: CtaSource;
  autoFocus?: boolean;
};

export function WaitlistForm({ signupSource, autoFocus }: WaitlistFormProps = {}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const router = useRouter();
  const inputId = `waitlist-email${useId().replace(/:/g, "")}`;
  const copy = signupSource
    ? {
        emailLabel: CTA_COPY.signup.emailLabel,
        button: CTA_COPY.signup.button,
        microcopy: CTA_COPY.signup.microcopy,
      }
    : {
        emailLabel: WAITLIST_COPY.emailLabel,
        button: WAITLIST_COPY.button,
        microcopy: WAITLIST_COPY.microcopy,
      };

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...readBrowserAttribution(),
          ...(signupSource ? { signup_source: signupSource } : {}),
          email,
        }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const body = (await res.json().catch(() => null)) as { ok?: unknown } | null;
      if (body?.ok === true) {
        setStatus("success");
        if (signupSource) {
          router.push(`/waitlist/thanks?source=${signupSource}`);
        }
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
        htmlFor={signupSource ? inputId : "waitlist-email"}
        className="text-body text-[var(--text-primary)]"
      >
        {copy.emailLabel}
      </label>
      <input
        id={signupSource ? inputId : "waitlist-email"}
        autoFocus={autoFocus}
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
        {copy.button}
      </Button>
      <p className="text-caption text-[var(--text-tertiary)]">{copy.microcopy}</p>
      {status === "success" && !signupSource ? (
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
