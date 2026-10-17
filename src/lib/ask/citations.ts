/**
 * F11b server-side citation check. Markers are `[S#]`, 1-based into the
 * numbered sources given to the model. Out-of-range markers are stripped from
 * the stream before the client sees them; only valid numbers become citations.
 */

const MARKER_RE = /\[S(\d{1,3})\]/g;
/** A trailing fragment that could still become a marker: "[", "[S", "[S1", "[S12". */
const PARTIAL_TAIL_RE = /\[(?:S\d{0,3})?$/;

/** Valid cited numbers in first-appearance order (deduped). */
export function extractCitations(text: string, sourceCount: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const m of text.matchAll(MARKER_RE)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= sourceCount && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** Remove markers outside 1..sourceCount. */
export function stripInvalidMarkers(text: string, sourceCount: number): string {
  return text.replace(MARKER_RE, (whole, d: string) => {
    const n = Number(d);
    return n >= 1 && n <= sourceCount ? whole : "";
  });
}

/** Remove every marker (used on prior assistant turns: their numbering is stale). */
export function stripAllMarkers(text: string): string {
  return text.replace(MARKER_RE, "");
}

/**
 * Streaming filter: push model deltas, get back text safe to emit now.
 * Holds back a trailing partial marker until it resolves.
 */
export class CitationStreamFilter {
  private pending = "";
  private emitted = "";

  constructor(private readonly sourceCount: number) {}

  push(delta: string): string {
    const buf = this.pending + delta;
    const tail = PARTIAL_TAIL_RE.exec(buf);
    const ready = tail ? buf.slice(0, tail.index) : buf;
    this.pending = tail ? buf.slice(tail.index) : "";
    const clean = stripInvalidMarkers(ready, this.sourceCount);
    this.emitted += clean;
    return clean;
  }

  flush(): string {
    const clean = stripInvalidMarkers(this.pending, this.sourceCount);
    this.pending = "";
    this.emitted += clean;
    return clean;
  }

  /** Everything emitted so far (already filtered). */
  get text(): string {
    return this.emitted;
  }
}
