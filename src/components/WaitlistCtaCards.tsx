"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { clsx } from "clsx";
import { Button } from "@/components/Button";
import { WaitlistForm } from "@/components/WaitlistForm";
import { readBrowserAttribution } from "@/lib/waitlist/attribution-client";
import {
  CTA_COPY,
  CTA_SOURCES,
  ctaCardId,
  ctaPreviewPublicPath,
  parseCtaSource,
  type CtaSource,
} from "@/lib/waitlist/cta";

type Props = {
  /** Which cards have a public preview image (resolved at build time). */
  previews: Record<CtaSource, boolean>;
};

/** Counts a card button tap server-side. Fire-and-forget; never blocks the UI. */
function reportTap(cta: CtaSource) {
  try {
    const { utm_source, utm_medium, utm_campaign, utm_content } = readBrowserAttribution();
    void fetch("/api/waitlist/cta-tap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cta, utm_source, utm_medium, utm_campaign, utm_content }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // counting is best-effort
  }
}

const noopSubscribe = () => () => {};

function readCtaParam(): CtaSource | null {
  try {
    return parseCtaSource(new URLSearchParams(window.location.search).get("cta"));
  } catch {
    return null;
  }
}

export function WaitlistCtaCards({ previews }: Props) {
  const [open, setOpen] = useState<CtaSource | null>(null);
  // ?cta=forms_prefill|appointment_packet scrolls to and highlights that card.
  const highlighted = useSyncExternalStore(noopSubscribe, readCtaParam, () => null);

  useEffect(() => {
    if (!highlighted) return;
    const el = document.getElementById(ctaCardId(highlighted));
    if (el) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    }
  }, [highlighted]);

  return (
    <section
      aria-labelledby="cta-section-heading"
      className="mb-[var(--space-8)] mt-[var(--space-12)]"
    >
      <h2
        id="cta-section-heading"
        className="text-heading text-[var(--text-primary)] mb-[var(--space-6)]"
      >
        {CTA_COPY.sectionHeading}
      </h2>
      <div className="grid gap-[var(--space-6)] md:grid-cols-2">
        {CTA_SOURCES.map((source) => {
          const card = CTA_COPY.cards[source];
          const isOpen = open === source;
          const isHighlighted = highlighted === source;
          return (
            <article
              key={source}
              id={ctaCardId(source)}
              data-cta={source}
              data-highlighted={isHighlighted ? "true" : undefined}
              className={clsx(
                "flex flex-col gap-[var(--space-4)] rounded-[var(--radius-xl)] border bg-[var(--surface)] p-[var(--space-6)] scroll-mt-[var(--space-12)]",
                "transition-[box-shadow,border-color] duration-300",
                isHighlighted
                  ? "border-[var(--accent)] shadow-[0_0_0_4px_var(--accent-light)]"
                  : "border-[var(--border)]",
              )}
            >
              {previews[source] ? (
                <Image
                  src={ctaPreviewPublicPath(source)}
                  alt=""
                  width={720}
                  height={932}
                  unoptimized
                  className="w-full h-auto rounded-[var(--radius-lg)] border border-[var(--border)]"
                />
              ) : null}
              <h3 className="text-body font-[600] text-[var(--text-primary)]">{card.title}</h3>
              <p className="text-body text-[var(--text-secondary)]">{card.body}</p>
              {isOpen ? (
                <div className="flex flex-col gap-[var(--space-3)]">
                  <p className="text-body font-[500] text-[var(--text-primary)]">
                    {CTA_COPY.signup.headings[source]}
                  </p>
                  <WaitlistForm signupSource={source} autoFocus />
                </div>
              ) : (
                <Button
                  type="button"
                  variant={isHighlighted ? "primary" : "secondary"}
                  fullWidth
                  className="h-auto min-h-[44px] py-[var(--space-3)] text-center leading-snug"
                  onClick={() => {
                    reportTap(source);
                    setOpen(source);
                  }}
                >
                  {card.button}
                </Button>
              )}
              <p className="text-caption text-[var(--text-tertiary)]">{card.smallPrint}</p>
            </article>
          );
        })}
      </div>
      <p className="mt-[var(--space-6)] text-caption text-[var(--text-secondary)]">
        {CTA_COPY.underCards} <span>{CTA_COPY.disclaimer}</span>
      </p>
    </section>
  );
}
