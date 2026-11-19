import { cookies } from "next/headers";
import { getServerEnv, resetServerEnvCache } from "@/lib/env";
import { parseCtaSource } from "@/lib/waitlist/cta";
import {
  allowedSampleAssets,
  readPrivateSample,
  sampleAccessCookieName,
  sampleAssetContentType,
  verifySampleAccess,
} from "@/lib/waitlist/sample-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves a Studio SAMPLE file (PDF or page render) only to a browser holding
 * the signed signup cookie for that source (0.5 item 6: full sample only
 * after signup). Unknown source/asset → 404; no or invalid cookie → 403.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ source: string; asset: string }> },
): Promise<Response> {
  const { source: rawSource, asset: rawAsset } = await context.params;
  const source = parseCtaSource(rawSource);
  const asset = decodeURIComponent(rawAsset);
  if (!source || !allowedSampleAssets(source).includes(asset)) {
    return new Response(null, { status: 404 });
  }
  const contentType = sampleAssetContentType(asset);
  if (!contentType) return new Response(null, { status: 404 });

  let secret: string;
  try {
    resetServerEnvCache();
    secret = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  } catch {
    return new Response(null, { status: 503 });
  }

  const jar = await cookies();
  if (!verifySampleAccess(secret, source, jar.get(sampleAccessCookieName(source))?.value)) {
    return new Response(null, { status: 403 });
  }

  const body = await readPrivateSample(asset);
  if (!body) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${asset}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
