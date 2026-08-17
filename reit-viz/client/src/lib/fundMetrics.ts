/**
 * Pattern resolution for uploaded-fundamentals metrics.
 *
 * Uploaded metric names are user-defined ("Fund: FFO/sh (Q)", "Fund: Same-
 * Store NOI YoY% (Q)", …), so signals and study conditions can't reference
 * them statically. They instead reference a PATTERN — "Fund:* Accel",
 * "Fund:* Surprise%" — which resolves per ticker to the best concrete metric:
 * report-date-stamped only (never the " PE)" twins), preferring quarterly
 * over half-year over annual cadence, and FFO-family names over the rest
 * (the canonical REIT flow metric) so multi-metric uploads pick the series
 * a REIT analyst would expect.
 */
import { getTickers, getTickersCacheSync } from "./dataService";

export const FUND_PATTERN_PREFIX = "Fund:* ";

/** Derived-series kinds a pattern can target ("" = the raw actuals series). */
export type FundKind = "" | "YoY%" | "Accel" | "TTM" | "P/TTM" | "Surprise%";

export function isFundPattern(metric: string): boolean {
  return metric.startsWith(FUND_PATTERN_PREFIX);
}

export function fundPattern(kind: FundKind): string {
  return `${FUND_PATTERN_PREFIX}${kind}`.trimEnd();
}

const CADENCE_RANK: Record<string, number> = { Q: 0, H: 1, FY: 2 };

function familyRank(name: string): number {
  const s = name.toLowerCase();
  if (/ffo/.test(s) && !/affo/.test(s)) return 0;
  if (/affo/.test(s)) return 1;
  if (/\beps\b|earnings per/.test(s)) return 2;
  return 3;
}

/**
 * Resolve a derived-series kind against a ticker's metric-name list.
 * Returns the concrete metric key (e.g. "Fund: FFO/sh Accel (Q)") or null.
 */
export function resolveFundMetric(tickerMetrics: string[], kind: FundKind): string | null {
  // "Fund: <base name>[ <kind>] (<cadence>)" — base name must not itself end
  // with another derived suffix, which the kinds' own words guarantee.
  const suffix = kind === "" ? "" : ` ${kind}`;
  const re = new RegExp(
    `^Fund: (.+)${suffix.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")} \\((Q|H|FY)\\)$`,
  );
  let best: { name: string; rank: number } | null = null;
  for (const m of tickerMetrics) {
    const match = re.exec(m);
    if (!match) continue;
    // The raw-series pattern ("" kind) must not swallow derived keys.
    if (kind === "" && / (YoY%|Accel|TTM|P\/TTM|Surprise%) \((Q|H|FY)\)$/.test(m)) continue;
    const rank = CADENCE_RANK[match[2]] * 10 + familyRank(match[1]);
    if (!best || rank < best.rank) best = { name: m, rank };
  }
  return best?.name ?? null;
}

/** Resolve a "Fund:* <kind>" pattern for a ticker (loads ticker meta once). */
export async function resolveFundPattern(ticker: string, pattern: string): Promise<string | null> {
  if (!isFundPattern(pattern)) return pattern;
  const kind = pattern.slice(FUND_PATTERN_PREFIX.length) as FundKind;
  let metas = getTickersCacheSync();
  if (!metas || metas.length === 0) {
    try { metas = await getTickers(); } catch { return null; }
  }
  const meta = (metas || []).find((t: any) => t.ticker === ticker.toUpperCase());
  if (!meta || !Array.isArray(meta.metrics)) return null;
  return resolveFundMetric(meta.metrics, kind);
}

/** Forward-fill a sparse {time,value}[] series onto a bar-date axis. */
export function forwardFillOnDates(
  pts: { time: string; value: number }[],
  dates: string[],
): (number | null)[] {
  const out: (number | null)[] = new Array(dates.length).fill(null);
  if (pts.length === 0) return out;
  const sorted = [...pts].sort((a, b) => (a.time < b.time ? -1 : 1));
  let p = 0;
  let last: number | null = null;
  for (let i = 0; i < dates.length; i++) {
    while (p < sorted.length && sorted[p].time <= dates[i]) {
      if (Number.isFinite(sorted[p].value)) last = sorted[p].value;
      p++;
    }
    out[i] = last;
  }
  return out;
}

/**
 * Indices where a forward-filled series prints a NEW value (first non-null,
 * or a value change) — the report-date bars of a report-stamped series.
 */
export function printIndices(series: (number | null)[]): number[] {
  const out: number[] = [];
  let prev: number | null = null;
  for (let i = 0; i < series.length; i++) {
    const v = series[i];
    if (v == null) continue;
    if (prev === null || v !== prev) out.push(i);
    prev = v;
  }
  return out;
}
