/**
 * F8 monthly freshness check (manual-trigger stub; no vercel.json cron).
 *
 * HEAD each active official_url (GET fallback), record status, optionally hash
 * the body, and mark `stale` ONLY on hard failures:
 *   - 404 / 410 (page gone), or
 *   - DNS failure (ENOTFOUND — host death).
 * Everything else that is not 2xx/3xx is flagged `needs_review` for the Visa
 * Ops monthly checklist without changing status. 403 from known bot-blocked
 * hosts (BOT_BLOCKED_HOSTS, e.g. prenotami.esteri.it) is `bot_blocked` and
 * never stales. Host changes and hash changes are flagged, not staled
 * (consulate HTML embeds per-request tokens; hashes churn).
 *
 * Writes operational columns only. Never scrapes behind login / Prenot@Mi
 * queues: one unauthenticated HEAD/GET of the landing URL, no cookies.
 */

import { createHash } from "crypto";
import { isOfficialHost } from "@/lib/sources/validate";
import type { CheckUpdate, CheckableSourceRow } from "@/lib/sources/repo";

/**
 * Browser-like UA (some MAECI hosts 403 non-browser agents) with an honest
 * identifying suffix.
 */
export const CHECK_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 NomadeSourceCheck/1.0";

/**
 * Hosts known to answer 403 to automated clients while serving browsers 200
 * (verified 2026-10-08: prenotami.esteri.it 403 to curl UA, 200 to browser UA).
 * A 403 here is `bot_blocked` → no status change.
 */
export const BOT_BLOCKED_HOSTS = ["prenotami.esteri.it"] as const;

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_CONCURRENCY = 4;
/** Cap hashed bodies (PDFs are ~100 KB–2 MB). */
export const MAX_HASH_BYTES = 15 * 1024 * 1024;

export type ProbeNetworkError = "dns" | "refused" | "timeout" | "tls" | "network";

export type ProbeResult = {
  /** Final HTTP status after redirects; 0 when no HTTP response. */
  httpStatus: number;
  finalUrl: string | null;
  method: "HEAD" | "GET";
  networkError?: ProbeNetworkError;
  contentHash?: string;
};

export type CheckOutcome =
  | "ok"
  | "dead"
  | "unreachable"
  | "bot_blocked"
  | "needs_review"
  | "error"
  | "skipped_non_official";

export type Classification = {
  outcome: CheckOutcome;
  markStale: boolean;
  hostChanged: boolean;
};

export type FetchLike = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, "status" | "url" | "body" | "arrayBuffer">>;

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function stripWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

export function isBotBlockedHost(url: string): boolean {
  const host = hostOf(url);
  return !!host && (BOT_BLOCKED_HOSTS as readonly string[]).includes(host);
}

function networkErrorKind(err: unknown): ProbeNetworkError {
  const e = err as { name?: string; code?: string; cause?: { code?: string; name?: string } };
  if (e?.name === "TimeoutError" || e?.name === "AbortError" || e?.cause?.name === "TimeoutError") {
    return "timeout";
  }
  const code = e?.cause?.code ?? e?.code ?? "";
  if (code === "ENOTFOUND") return "dns";
  if (code === "ECONNREFUSED") return "refused";
  if (code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT") return "timeout";
  if (/CERT|SSL|TLS/i.test(code)) return "tls";
  return "network";
}

async function discardBody(res: Pick<Response, "body">): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // ignore
  }
}

/**
 * Probe one URL. HEAD first; GET when HEAD is not 2xx/3xx, HEAD throws a
 * non-DNS error, or a body hash is requested.
 */
export async function probeUrl(
  url: string,
  opts: { fetchImpl?: FetchLike; timeoutMs?: number; hash?: boolean } = {},
): Promise<ProbeResult> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((i, init) => fetch(i, init));
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = {
    "user-agent": CHECK_USER_AGENT,
    accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9,it;q=0.8",
  };

  let head: ProbeResult | null = null;
  if (!opts.hash) {
    try {
      const res = await fetchImpl(url, {
        method: "HEAD",
        redirect: "follow",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      await discardBody(res);
      head = { httpStatus: res.status, finalUrl: res.url || url, method: "HEAD" };
      if (res.status >= 200 && res.status < 400) return head;
    } catch (err) {
      const kind = networkErrorKind(err);
      if (kind === "dns") {
        return { httpStatus: 0, finalUrl: null, method: "HEAD", networkError: kind };
      }
    }
  }

  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const result: ProbeResult = { httpStatus: res.status, finalUrl: res.url || url, method: "GET" };
    if (opts.hash && res.status >= 200 && res.status < 300) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength <= MAX_HASH_BYTES) {
        result.contentHash = `sha256:${createHash("sha256").update(buf).digest("hex")}`;
      }
    } else {
      await discardBody(res);
    }
    return result;
  } catch (err) {
    // HEAD answered but GET failed: keep the HEAD status.
    if (head) return head;
    return { httpStatus: 0, finalUrl: null, method: "GET", networkError: networkErrorKind(err) };
  }
}

export function classifyProbe(url: string, probe: ProbeResult): Classification {
  const origHost = hostOf(url);
  const finalHost = hostOf(probe.finalUrl);
  const hostChanged =
    !!origHost && !!finalHost && stripWww(origHost) !== stripWww(finalHost);

  if (probe.networkError) {
    if (probe.networkError === "dns") {
      return { outcome: "unreachable", markStale: true, hostChanged };
    }
    return { outcome: "error", markStale: false, hostChanged };
  }
  const s = probe.httpStatus;
  if (s >= 200 && s < 400) return { outcome: "ok", markStale: false, hostChanged };
  if (s === 404 || s === 410) return { outcome: "dead", markStale: true, hostChanged };
  if (s === 403 && isBotBlockedHost(url)) {
    return { outcome: "bot_blocked", markStale: false, hostChanged };
  }
  return { outcome: "needs_review", markStale: false, hostChanged };
}

export type CheckResultItem = {
  id: string;
  httpStatus: number;
  method: "HEAD" | "GET" | null;
  outcome: CheckOutcome;
  action: "none" | "mark_stale";
  hostChanged: boolean;
  hashChanged: boolean;
  networkError?: ProbeNetworkError;
  writeFailed?: boolean;
};

export type CheckSummary = {
  checkedAt: string;
  dryRun: boolean;
  hashed: boolean;
  checked: number;
  healthy: number;
  botBlocked: number;
  staleFlagged: number;
  needsReview: number;
  errors: number;
  hostChanged: number;
  hashChanged: number;
  writeFailures: number;
  results: CheckResultItem[];
};

export type RunCheckDeps = {
  rows: CheckableSourceRow[];
  applyUpdate: (id: string, update: CheckUpdate) => Promise<{ ok: boolean }>;
  fetchImpl?: FetchLike;
  now?: () => Date;
  timeoutMs?: number;
  concurrency?: number;
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Probe all rows; in non-dry-run mode persist operational columns. */
export async function runSourceCheck(
  deps: RunCheckDeps,
  opts: { dryRun: boolean; hash: boolean },
): Promise<CheckSummary> {
  const now = deps.now ?? (() => new Date());
  const checkedAt = now().toISOString();

  const results = await mapLimit(deps.rows, deps.concurrency ?? DEFAULT_CONCURRENCY, async (row) => {
    const host = hostOf(row.official_url);
    if (!host || !isOfficialHost(host) || !row.official_url.startsWith("https://")) {
      const item: CheckResultItem = {
        id: row.id,
        httpStatus: 0,
        method: null,
        outcome: "skipped_non_official",
        action: "none",
        hostChanged: false,
        hashChanged: false,
      };
      return item;
    }

    const probe = await probeUrl(row.official_url, {
      fetchImpl: deps.fetchImpl,
      timeoutMs: deps.timeoutMs,
      hash: opts.hash,
    });
    const cls = classifyProbe(row.official_url, probe);
    const hashChanged =
      !!probe.contentHash && !!row.content_hash && probe.contentHash !== row.content_hash;

    const item: CheckResultItem = {
      id: row.id,
      httpStatus: probe.httpStatus,
      method: probe.method,
      outcome: cls.outcome,
      action: cls.markStale ? "mark_stale" : "none",
      hostChanged: cls.hostChanged,
      hashChanged,
      ...(probe.networkError ? { networkError: probe.networkError } : {}),
    };

    if (!opts.dryRun) {
      const update: CheckUpdate = {
        last_checked_at: checkedAt,
        last_http_status: probe.httpStatus,
      };
      if (probe.contentHash) update.content_hash = probe.contentHash;
      if (cls.markStale) update.status = "stale";
      try {
        const res = await deps.applyUpdate(row.id, update);
        if (!res.ok) item.writeFailed = true;
      } catch {
        item.writeFailed = true;
      }
    }
    return item;
  });

  const count = (pred: (r: CheckResultItem) => boolean) => results.filter(pred).length;
  return {
    checkedAt,
    dryRun: opts.dryRun,
    hashed: opts.hash,
    checked: results.length,
    healthy: count((r) => r.outcome === "ok"),
    botBlocked: count((r) => r.outcome === "bot_blocked"),
    staleFlagged: count((r) => r.action === "mark_stale"),
    needsReview: count((r) => r.outcome === "needs_review" || r.outcome === "skipped_non_official"),
    errors: count((r) => r.outcome === "error"),
    hostChanged: count((r) => r.hostChanged),
    hashChanged: count((r) => r.hashChanged),
    writeFailures: count((r) => !!r.writeFailed),
    results,
  };
}
