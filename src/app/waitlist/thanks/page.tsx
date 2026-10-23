import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerEnv, resetServerEnvCache } from "@/lib/env";
import { WAITLIST_COPY } from "@/lib/waitlist/copy";
import {
  CTA_COPY,
  CTA_SAMPLES,
  ctaSampleAssetUrl,
  parseCtaSource,
} from "@/lib/waitlist/cta";
import {
  privateSampleExists,
  sampleAccessCookieName,
  verifySampleAccess,
} from "@/lib/waitlist/sample-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * F12 CTA thank-you page. Shows the Studio SAMPLE matching signup_source, only
 * to a browser holding that source's signed signup cookie; anyone else is sent
 * back to the matching card on the homepage.
 */
export default async function WaitlistThanksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const source = parseCtaSource(params.source);
  if (!source) redirect("/");

  let allowed = false;
  try {
    resetServerEnvCache();
    const secret = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
    const jar = await cookies();
    allowed = verifySampleAccess(secret, source, jar.get(sampleAccessCookieName(source))?.value);
  } catch {
    allowed = false;
  }
  if (!allowed) redirect(`/?cta=${source}`);

  const sample = CTA_SAMPLES[source];
  const pdfAvailable = privateSampleExists(sample.pdf);
  const pages = sample.pages.filter((p) => privateSampleExists(p));
  const pdfUrl = ctaSampleAssetUrl(source, sample.pdf);

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="app-container py-[var(--space-12)] md:py-16">
        <header className="mb-[var(--space-12)]">
          <Link href="/" className="text-display text-[var(--text-primary)]">
            {WAITLIST_COPY.wordmark}
          </Link>
        </header>

        <h1 className="text-heading text-[var(--text-primary)] mb-[var(--space-6)]">
          {CTA_COPY.thanks.heading}
        </h1>

        <section data-sample={source} className="md:max-w-[640px]">
          <p className="text-body text-[var(--text-secondary)] mb-[var(--space-4)]">
            {CTA_COPY.thanks.sample[source]}
          </p>

          {pdfAvailable ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener"
              aria-label={sample.pdf}
              data-sample-pdf={sample.pdf}
              className="block mb-[var(--space-4)]"
            >
              {pages.map((page) => (
                <Image
                  key={page}
                  src={ctaSampleAssetUrl(source, page)}
                  alt=""
                  width={935}
                  height={1210}
                  unoptimized
                  className="w-full h-auto rounded-[var(--radius-lg)] border border-[var(--border)] mb-[var(--space-3)]"
                />
              ))}
              {pages.length === 0 ? (
                <span className="text-body text-[var(--accent)] underline">{sample.pdf}</span>
              ) : null}
            </a>
          ) : null}

          <p className="text-caption text-[var(--text-secondary)] mb-[var(--space-6)]">
            {CTA_COPY.thanks.underSample} <span>{CTA_COPY.thanks.disclaimer}</span>
          </p>

          <p className="text-body text-[var(--text-secondary)]">{CTA_COPY.thanks.secondary}</p>
        </section>
      </div>
    </main>
  );
}
