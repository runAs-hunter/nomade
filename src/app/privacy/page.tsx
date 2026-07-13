import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Nomade",
  description:
    "How Nomade handles your data: stored on your device, message text sent to our AI provider only to generate replies, no tracking.",
};

const LAST_UPDATED = "July 11, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="app-container py-[var(--space-12)] md:py-16">
        <header className="mb-[var(--space-8)]">
          <Link href="/" className="text-label text-[var(--accent)] no-underline">
            ← nomade
          </Link>
          <h1 className="text-heading text-[var(--text-primary)] mt-[var(--space-4)]">
            Privacy Policy
          </h1>
          <p className="text-caption text-[var(--text-tertiary)] mt-[var(--space-2)]">
            Last updated {LAST_UPDATED}
          </p>
        </header>

        <div className="flex flex-col gap-[var(--space-8)] md:max-w-[640px]">
          <section>
            <p className="text-body text-[var(--text-secondary)]">
              Nomade helps you understand and prepare for the Italy Digital Nomad
              Visa (Visto per Nomadi Digitali). This policy explains what data the
              app handles and where it goes. In short: your information stays on
              your device, and the only data that leaves it is the text of the
              messages you choose to send to our assistant — used solely to
              generate a reply.
            </p>
          </section>

          <section>
            <h2 className="text-label text-[var(--text-primary)] mb-[var(--space-3)]">
              What we store, and where
            </h2>
            <p className="text-body text-[var(--text-secondary)]">
              Your quiz answers, your generated checklist, and your chat history
              are stored <strong>only on your device</strong>. Nomade does not
              keep user accounts, and we do not maintain a server-side database of
              your answers, plans, or conversations.
            </p>
          </section>

          <section>
            <h2 className="text-label text-[var(--text-primary)] mb-[var(--space-3)]">
              Data sent to generate assistant replies
            </h2>
            <p className="text-body text-[var(--text-secondary)]">
              When you send a message to the in-app assistant, the text of that
              message (and the relevant earlier turns of the same conversation) is
              sent over an encrypted HTTPS connection to our backend, which
              forwards it to our AI provider, <strong>Anthropic</strong> (the
              Claude API), only to produce a response. The reply is streamed back
              to your device.
            </p>
            <p className="text-body text-[var(--text-secondary)] mt-[var(--space-3)]">
              Because you may describe your situation to get tailored guidance,
              these messages can contain personal information you choose to share —
              for example your income, nationality, family situation, or location.
              This information is used only to generate your reply. Please avoid
              sharing anything more sensitive than you are comfortable sending to
              an AI service. Anthropic&apos;s handling of API data is governed by{" "}
              <a
                href="https://www.anthropic.com/legal/privacy"
                className="text-[var(--accent)]"
                target="_blank"
                rel="noopener noreferrer"
              >
                Anthropic&apos;s Privacy Policy
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-label text-[var(--text-primary)] mb-[var(--space-3)]">
              What we do not do
            </h2>
            <ul className="text-body text-[var(--text-secondary)] flex flex-col gap-[var(--space-2)] list-disc pl-[var(--space-5)]">
              <li>We do not track you across apps or websites.</li>
              <li>We do not sell or rent your data.</li>
              <li>
                We do not use third-party advertising or analytics SDKs that
                identify you.
              </li>
              <li>
                We do not log the contents of your messages for our own use.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-label text-[var(--text-primary)] mb-[var(--space-3)]">
              Notifications
            </h2>
            <p className="text-body text-[var(--text-secondary)]">
              If you grant notification permission, Nomade may send you reminders
              related to your visa checklist. You can turn notifications off at any
              time in your device Settings.
            </p>
          </section>

          <section>
            <h2 className="text-label text-[var(--text-primary)] mb-[var(--space-3)]">
              Not legal advice
            </h2>
            <p className="text-body text-[var(--text-secondary)]">
              Nomade provides general informational guidance and is not a
              substitute for professional legal or immigration advice. Always
              verify requirements with the relevant Italian consulate or a
              qualified professional before applying.
            </p>
          </section>

          <section>
            <h2 className="text-label text-[var(--text-primary)] mb-[var(--space-3)]">
              Children
            </h2>
            <p className="text-body text-[var(--text-secondary)]">
              Nomade is not directed to children under 13 and we do not knowingly
              collect information from them.
            </p>
          </section>

          <section>
            <h2 className="text-label text-[var(--text-primary)] mb-[var(--space-3)]">
              Changes and contact
            </h2>
            <p className="text-body text-[var(--text-secondary)]">
              We may update this policy as the app evolves; material changes will
              be reflected by the &ldquo;last updated&rdquo; date above. Questions
              about your privacy? Contact us at{" "}
              <a href="mailto:aletheodoxa@gmail.com" className="text-[var(--accent)]">
                aletheodoxa@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
