import Link from "next/link";
import { CountryCard } from "@/components/CountryCard";
import { Button } from "@/components/Button";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="app-container py-[var(--space-12)] md:py-16">
        {/* Wordmark */}
        <header className="mb-[var(--space-12)]">
          <span className="text-display text-[var(--text-primary)]">nomade</span>
        </header>

        {/* Hero */}
        <section className="mb-[var(--space-8)] md:mb-10">
          <h1 className="text-heading text-[var(--text-primary)] mb-[var(--space-3)]">
            Your Italy visa checklist,
            <br />
            personalized.
          </h1>
          <p className="text-body text-[var(--text-secondary)] md:text-base md:max-w-[480px]">
            Answer 5 questions. Get a step-by-step plan for the Italy Digital
            Nomad Visa — tailored to your income type, nationality, and travel
            situation.
          </p>
        </section>

        {/* Countries */}
        <section className="mb-[var(--space-8)]">
          <p className="text-label text-[var(--text-tertiary)] mb-[var(--space-3)]">
            Available now
          </p>
          <div className="flex flex-col gap-[var(--space-2)]">
            <Link href="/quiz" className="block no-underline">
              <CountryCard
                emoji="🇮🇹"
                country="Italy"
                visaName="Digital Nomad Visa (Visto per Nomadi Digitali)"
                duration="Up to 1 year (renewable)"
                minIncome={28000}
                featured
              />
            </Link>
          </div>
        </section>

        {/* Coming soon */}
        <section className="mb-[var(--space-12)]">
          <p className="text-label text-[var(--text-tertiary)] mb-[var(--space-3)]">
            Coming soon
          </p>
          <div className="flex flex-col md:flex-row gap-[var(--space-2)]">
            <CountryCard
              emoji="🇵🇹"
              country="Portugal"
              visaName="Digital Nomad Visa (D8)"
              duration="Up to 1 year (renewable)"
              minIncome={3040}
              comingSoon
            />
            <CountryCard
              emoji="🇪🇸"
              country="Spain"
              visaName="Digital Nomad Visa"
              duration="1 year (renewable up to 5)"
              minIncome={27600}
              comingSoon
            />
          </div>
        </section>

        {/* CTA */}
        <Link href="/quiz" className="block md:max-w-[320px]">
          <Button variant="primary" fullWidth>
            Start Italy checklist →
          </Button>
        </Link>

        {/* Footer */}
        <footer className="mt-[var(--space-12)] text-caption text-[var(--text-tertiary)]">
          <p>
            Data last verified 2026-03-22. Always verify requirements with your
            consulate before applying.
          </p>
        </footer>
      </div>
    </main>
  );
}
