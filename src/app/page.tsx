import type { Metadata } from "next";
import { WaitlistForm } from "@/components/WaitlistForm";
import { WAITLIST_COPY } from "@/lib/waitlist/copy";

export const metadata: Metadata = {
  description: WAITLIST_COPY.subhead,
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="app-container py-[var(--space-12)] md:py-16">
        <header className="mb-[var(--space-12)]">
          <span className="text-display text-[var(--text-primary)]">
            {WAITLIST_COPY.wordmark}
          </span>
        </header>

        <section className="mb-[var(--space-8)]">
          <h1 className="text-heading text-[var(--text-primary)] mb-[var(--space-3)]">
            {WAITLIST_COPY.headline}
          </h1>
          <p className="text-body text-[var(--text-secondary)] md:max-w-[480px]">
            {WAITLIST_COPY.subhead}
          </p>
        </section>

        <section className="mb-[var(--space-8)]">
          <p className="text-body text-[var(--text-primary)] mb-[var(--space-3)]">
            {WAITLIST_COPY.whatYouGetLabel}
          </p>
          <ul className="flex flex-col gap-[var(--space-2)] list-disc pl-[var(--space-6)]">
            {WAITLIST_COPY.benefits.map((item) => (
              <li key={item} className="text-body text-[var(--text-secondary)]">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <p className="text-body text-[var(--text-secondary)] mb-[var(--space-8)]">
          {WAITLIST_COPY.remoteWorker}
        </p>

        <WaitlistForm />

        <footer className="mt-[var(--space-12)] text-caption text-[var(--text-tertiary)]">
          <p>{WAITLIST_COPY.disclaimer}</p>
        </footer>
      </div>
    </main>
  );
}
