import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CTA_SAMPLES, CTA_PREVIEW_PUBLIC_DIR, type CtaSource } from "@/lib/waitlist/cta";

/**
 * Sample gating (0.5 item 6): the full Studio sample is reachable only after
 * signup. A successful CTA signup sets an httpOnly cookie per source holding
 * `<expiresAtSeconds>.<hmac>`; the HMAC covers the source and expiry and is
 * keyed by a value derived from the server-only service-role key (domain
 * separated, never sent to the client). No email or other PII in the cookie.
 */

export const SAMPLE_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const KEY_LABEL = "nomade-waitlist-sample-access-v1";

export function sampleAccessCookieName(source: CtaSource): string {
  return `nomade_wl_sample_${source}`;
}

function deriveKey(secret: string): Buffer {
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

function mac(secret: string, source: CtaSource, expiresAt: number): string {
  return createHmac("sha256", deriveKey(secret))
    .update(`${source}.${expiresAt}`)
    .digest("base64url");
}

export function signSampleAccess(
  secret: string,
  source: CtaSource,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const expiresAt = nowSeconds + SAMPLE_ACCESS_MAX_AGE_SECONDS;
  return `${expiresAt}.${mac(secret, source, expiresAt)}`;
}

export function verifySampleAccess(
  secret: string,
  source: CtaSource,
  value: string | undefined | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!value || !secret) return false;
  const match = /^([0-9]{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds) return false;
  const expected = Buffer.from(mac(secret, source, expiresAt));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Private sample files live outside public/ so they have no static URL. */
export const PRIVATE_SAMPLES_DIR = path.join(process.cwd(), "private", "waitlist-samples");

/** Asset names a source may serve (PDF + page renders). Anything else is 404. */
export function allowedSampleAssets(source: CtaSource): readonly string[] {
  const s = CTA_SAMPLES[source];
  return [s.pdf, ...s.pages];
}

export function sampleAssetContentType(asset: string): string | null {
  if (asset.endsWith(".pdf")) return "application/pdf";
  if (asset.endsWith(".png")) return "image/png";
  return null;
}

export function privateSampleExists(asset: string): boolean {
  return existsSync(path.join(PRIVATE_SAMPLES_DIR, asset));
}

export async function readPrivateSample(asset: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(PRIVATE_SAMPLES_DIR, asset));
  } catch {
    return null;
  }
}

export function publicPreviewExists(source: CtaSource): boolean {
  return existsSync(
    path.join(process.cwd(), "public", CTA_PREVIEW_PUBLIC_DIR, CTA_SAMPLES[source].preview),
  );
}
