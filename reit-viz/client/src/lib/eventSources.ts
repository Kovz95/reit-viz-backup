// Event-source registry for the Event Lab: everything that can produce
// trigger bars for lib/eventStudy's kernel, under ONE condition vocabulary.
//
//  - Technical sources (sigma / high52 / low52 / gap) are ported VERBATIM from
//    pages/PriceAction.tsx's computeConditionMask, so studies built from them
//    reproduce the old page's numbers exactly.
//  - Calendar sources map event DATES (earnings, ex-div, macro prints from
//    data/events.json via getTickerEvents/getMacroEventDates, plus
//    month-of-year and MM-DD window anchors) onto trading bars: each event
//    date fires on the first bar at-or-after it.
//  - Conditions combine with AND/OR. Each condition carries `withinBars`
//    (default 0): its mask is smeared forward N bars, which is what makes
//    cross-vocabulary studies like "2σ down within 5 bars before earnings"
//    expressible — AND of {earnings, withinBars 0} with {sigma, withinBars 5}.
//    With withinBars 0 everywhere, AND/OR semantics match PriceAction exactly
//    (trigger value = first condition's value under AND, first firing's under OR).

import { mean, stdDev, type EventBundle } from "./eventStudy";
import { getTickerEvents, getMacroEventDates } from "./dataService";

export type TechnicalConditionType = "sigma" | "high52" | "low52" | "gap";
export type CalendarEventType = "earnings" | "ex_dividend" | "CPI" | "NFP" | "FOMC" | "GDP";
export type CalendarConditionType = CalendarEventType | "month" | "window";
export type StudyConditionType = TechnicalConditionType | CalendarConditionType;

export type SigmaDirection = "either" | "up" | "down";
export type SigmaBasis = "rolling" | "full";
export type GapDirection = "either" | "up" | "down";

export interface StudyCondition {
  id: string;
  type: StudyConditionType;
  // technical params (PriceAction-compatible)
  sigma: number;
  sigmaWindow: number;
  sigmaDirection: SigmaDirection;
  sigmaBasis: SigmaBasis;
  gapPct: number;
  gapDirection: GapDirection;
  // calendar params
  /** 1-12 for type "month": fires on the first trading bar of that month each year. */
  month: number;
  /** "MM-DD" anchors for type "window": fires on the first bar at/after startMMDD each year. */
  startMMDD: string;
  /** Backward smear: condition counts as firing at bar i if its raw mask
   *  fired in [i-withinBars, i] (i.e. up to N bars EARLIER — one-sided). */
  withinBars: number;
}

export const CALENDAR_EVENT_TYPES: CalendarEventType[] = ["earnings", "ex_dividend", "CPI", "NFP", "FOMC", "GDP"];
export const MACRO_EVENT_TYPES: CalendarEventType[] = ["CPI", "NFP", "FOMC", "GDP"];

export function isCalendarType(t: StudyConditionType): t is CalendarConditionType {
  return t === "month" || t === "window" || (CALENDAR_EVENT_TYPES as string[]).includes(t);
}

export function newStudyCondition(type: StudyConditionType = "sigma"): StudyCondition {
  return {
    id: Math.random().toString(36).slice(2, 10), type,
    sigma: 2, sigmaWindow: 60, sigmaDirection: "either", sigmaBasis: "rolling",
    gapPct: 2, gapDirection: "either",
    month: new Date().getMonth() + 1, startMMDD: "01-01",
    withinBars: 0,
  };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CAL_LABELS: Record<CalendarEventType, string> = {
  earnings: "Earnings", ex_dividend: "Ex-dividend", CPI: "CPI print", NFP: "NFP print", FOMC: "FOMC", GDP: "GDP print",
};

export function studyConditionLabel(c: StudyCondition): string {
  const within = c.withinBars > 0 ? ` (≤${c.withinBars}b prior)` : "";
  if (c.type === "sigma") {
    const dir = c.sigmaDirection === "either" ? "±" : c.sigmaDirection === "up" ? "+" : "−";
    const basis = c.sigmaBasis === "full" ? "full hist" : `${c.sigmaWindow}d`;
    return `${dir}${c.sigma}σ 1d (${basis})${within}`;
  }
  if (c.type === "high52") return `New 52w high${within}`;
  if (c.type === "low52") return `New 52w low${within}`;
  if (c.type === "gap") {
    const dir = c.gapDirection === "either" ? "±" : c.gapDirection === "up" ? "+" : "−";
    return `${dir}${c.gapPct}% gap${within}`;
  }
  if (c.type === "month") return `Start of ${MONTH_NAMES[(c.month - 1 + 12) % 12]}${within}`;
  if (c.type === "window") return `Yearly window ${c.startMMDD}${within}`;
  return `${CAL_LABELS[c.type as CalendarEventType] ?? c.type}${within}`;
}

// ── Calendar date plumbing ───────────────────────────────────────────────────

export interface CalendarDates {
  earnings: string[];
  ex_dividend: string[];
  CPI: string[];
  NFP: string[];
  FOMC: string[];
  GDP: string[];
}

const normDate = (d: string): string => {
  if (!d) return "";
  if (d.includes("-")) return d.slice(0, 10);
  const parts = d.split("/");
  if (parts.length === 3) {
    const [m, day, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return d;
};

/** Per-symbol calendar dates: earnings/ex-div from the ticker's event feed,
 *  macro prints from the shared __macro__ block (empty arrays when absent —
 *  render a "no dates available" state, don't treat as an error). */
export async function fetchCalendarDates(symbol: string): Promise<CalendarDates> {
  const [tickerEvents, macro] = await Promise.all([
    getTickerEvents(symbol).catch(() => ({} as any)),
    getMacroEventDates().catch(() => ({} as any)),
  ]);
  const clean = (arr: unknown): string[] =>
    (Array.isArray(arr) ? arr : []).map((d) => normDate(String(d))).filter((d) => d.length === 10).sort();
  return {
    earnings: clean((tickerEvents as any)?.earnings),
    ex_dividend: clean((tickerEvents as any)?.ex_dividend),
    CPI: clean((macro as any)?.CPI),
    NFP: clean((macro as any)?.NFP),
    FOMC: clean((macro as any)?.FOMC),
    GDP: clean((macro as any)?.GDP),
  };
}

/** Map sorted event dates onto bar indices: each date fires on the first bar
 *  at-or-after it (skipped entirely if beyond the last bar or before the
 *  first). Dedupes bars when several dates land on the same one. */
export function datesToBarIndices(eventDates: string[], barDates: string[]): number[] {
  const out: number[] = [];
  let j = 0;
  let last = -1;
  const sorted = [...eventDates].sort();
  const first = barDates[0];
  for (const d of sorted) {
    // Dates before the series start are dropped, not collapsed onto bar 0 —
    // otherwise a smeared condition manufactures phantom events at the start
    // of a short-history ticker.
    if (first !== undefined && d < first) continue;
    while (j < barDates.length && barDates[j] < d) j++;
    if (j >= barDates.length) break;
    if (j !== last) { out.push(j); last = j; }
  }
  return out;
}

// ── Mask computation ─────────────────────────────────────────────────────────

export interface ConditionMask { mask: boolean[]; value: (number | null)[] }

/** Trailing daily % returns aligned to the bundle (index 0 = null). */
function dailyReturns(closes: (number | null)[]): (number | null)[] {
  const n = closes.length;
  const rets: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const p = closes[i - 1], c = closes[i];
    if (p != null && c != null && p > 0) rets[i] = (c / p - 1) * 100;
  }
  return rets;
}

/** Compute one condition's raw mask over the bundle. Technical branches are a
 *  verbatim port of PriceAction's computeConditionMask; calendar branches mark
 *  the mapped bars with that day's % move as the trigger value (0 when the
 *  move is unavailable). */
export function computeStudyMask(
  cond: StudyCondition,
  bundle: EventBundle,
  calendar?: CalendarDates | null,
  opts?: { extremeWindow?: number },
): ConditionMask {
  // "52-week" extreme lookback in BARS — 252 on daily bars; coarse-bar
  // studies pass 52 (weekly) / 12 (monthly) so the condition keeps meaning
  // "one-year extreme" instead of demanding 21 years of monthly bars.
  const extremeWindow = Math.max(2, Math.floor(opts?.extremeWindow ?? 252));
  const closes = bundle.closes;
  const opens = bundle.opens ?? [];
  const n = closes.length;
  const mask = new Array<boolean>(n).fill(false);
  const value = new Array<number | null>(n).fill(null);

  if (cond.type === "sigma") {
    const dailyRets = dailyReturns(closes);
    if (cond.sigmaBasis === "full") {
      const finite = dailyRets.filter((v): v is number => v != null && Number.isFinite(v));
      if (finite.length < 30) return { mask, value };
      const mu = mean(finite), sigma = stdDev(finite, mu);
      if (!Number.isFinite(sigma) || sigma <= 0) return { mask, value };
      for (let i = 1; i < n; i++) {
        const v = dailyRets[i];
        if (v == null) continue;
        const z = (v - mu) / sigma;
        const absZ = Math.abs(z);
        let fire = false;
        if (cond.sigmaDirection === "either") fire = absZ >= cond.sigma;
        else if (cond.sigmaDirection === "up") fire = z >= cond.sigma;
        else fire = z <= -cond.sigma;
        if (fire) { mask[i] = true; value[i] = v; }
      }
    } else {
      const w = Math.max(10, Math.floor(cond.sigmaWindow));
      for (let i = w + 1; i < n; i++) {
        const slice: number[] = [];
        for (let j = i - w; j < i; j++) {
          const v = dailyRets[j];
          if (v != null && Number.isFinite(v)) slice.push(v);
        }
        if (slice.length < Math.floor(w * 0.6)) continue;
        const mu = mean(slice), sigma = stdDev(slice, mu);
        if (!Number.isFinite(sigma) || sigma <= 0) continue;
        const v = dailyRets[i];
        if (v == null) continue;
        const z = (v - mu) / sigma;
        const absZ = Math.abs(z);
        let fire = false;
        if (cond.sigmaDirection === "either") fire = absZ >= cond.sigma;
        else if (cond.sigmaDirection === "up") fire = z >= cond.sigma;
        else fire = z <= -cond.sigma;
        if (fire) { mask[i] = true; value[i] = v; }
      }
    }
  } else if (cond.type === "high52" || cond.type === "low52") {
    for (let i = extremeWindow; i < n; i++) {
      const v = closes[i];
      if (v == null) continue;
      let extreme = cond.type === "high52" ? -Infinity : Infinity;
      let cnt = 0;
      for (let j = i - extremeWindow; j < i; j++) {
        const x = closes[j];
        if (x != null) {
          cnt++;
          if (cond.type === "high52" ? x > extreme : x < extreme) extreme = x;
        }
      }
      if (cnt < Math.floor(extremeWindow * 0.6)) continue;
      if (cond.type === "high52" ? v > extreme : v < extreme) { mask[i] = true; value[i] = v; }
    }
  } else if (cond.type === "gap") {
    for (let i = 1; i < n; i++) {
      const prev = closes[i - 1], openVal = opens[i];
      if (prev == null || openVal == null || prev <= 0) continue;
      const gap = (openVal / prev - 1) * 100;
      const absGap = Math.abs(gap);
      let fire = false;
      if (cond.gapDirection === "either") fire = absGap >= cond.gapPct;
      else if (cond.gapDirection === "up") fire = gap >= cond.gapPct;
      else fire = gap <= -cond.gapPct;
      if (fire) { mask[i] = true; value[i] = gap; }
    }
  } else {
    // Calendar branches — resolve trigger bar indices, mark with day's % move.
    const rets = dailyReturns(closes);
    let idxs: number[] = [];
    if (cond.type === "month") {
      const m = String(Math.min(12, Math.max(1, Math.round(cond.month)))).padStart(2, "0");
      let prevKey = "";
      for (let i = 0; i < n; i++) {
        const d = bundle.dates[i] ?? "";
        const key = d.slice(0, 7);
        if (key !== prevKey) {
          if (d.slice(5, 7) === m) idxs.push(i);
          prevKey = key;
        }
      }
    } else if (cond.type === "window") {
      const mmdd = /^\d{2}-\d{2}$/.test(cond.startMMDD) ? cond.startMMDD : "01-01";
      const years = new Set<string>();
      for (const d of bundle.dates) if (d) years.add(d.slice(0, 4));
      const targets = [...years].sort().map((y) => `${y}-${mmdd}`);
      idxs = datesToBarIndices(targets, bundle.dates);
    } else {
      const dates = calendar?.[cond.type as CalendarEventType] ?? [];
      idxs = datesToBarIndices(dates, bundle.dates);
    }
    for (const i of idxs) {
      mask[i] = true;
      value[i] = rets[i] ?? 0;
    }
  }
  return { mask, value };
}

/** Warmup bars a condition needs before its mask is meaningful (verbatim for
 *  technical types; calendar types need only 1 prior bar for the day-move). */
export function warmupFor(cond: StudyCondition, extremeWindow = 252): number {
  if (cond.type === "sigma") return cond.sigmaBasis === "full" ? 30 : cond.sigmaWindow + 2;
  if (cond.type === "high52" || cond.type === "low52") return extremeWindow + 1;
  if (cond.type === "gap") return 2;
  return 1;
}

/** Smear a mask forward: out[i] fires if mask fired anywhere in [i-within, i]. */
function smearMask(m: ConditionMask, within: number, n: number): ConditionMask {
  if (within <= 0) return m;
  const mask = new Array<boolean>(n).fill(false);
  const value = new Array<number | null>(n).fill(null);
  let lastFire = -1;
  let lastVal: number | null = null;
  for (let i = 0; i < n; i++) {
    if (m.mask[i]) { lastFire = i; lastVal = m.value[i]; }
    if (lastFire >= 0 && i - lastFire <= within) { mask[i] = true; value[i] = lastVal; }
  }
  return { mask, value };
}

/** Combine condition masks into trigger hits. With every withinBars at 0 this
 *  reproduces PriceAction's combination exactly (AND: fires where all fire,
 *  value from the FIRST condition; OR: value from the first FIRING condition). */
export function combineConditions(
  conditions: StudyCondition[],
  bundle: EventBundle,
  combinator: "AND" | "OR",
  calendar?: CalendarDates | null,
  opts?: { extremeWindow?: number },
): Array<{ idx: number; val: number }> {
  const n = bundle.closes.length;
  const valid = conditions.filter(Boolean);
  if (!valid.length) return [];
  const masks = valid.map((c) => smearMask(computeStudyMask(c, bundle, calendar, opts), c.withinBars, n));
  const warmup = Math.max(...valid.map((c) => warmupFor(c, opts?.extremeWindow ?? 252)));
  const hits: Array<{ idx: number; val: number }> = [];
  for (let i = warmup; i < n; i++) {
    let fire = combinator === "AND";
    let val: number | null = null;
    for (let k = 0; k < masks.length; k++) {
      const m = masks[k].mask[i];
      if (combinator === "AND") {
        if (!m) { fire = false; break; }
        if (val == null) val = masks[k].value[i];
      } else if (m) {
        fire = true; val = masks[k].value[i]; break;
      }
    }
    if (fire && val != null) hits.push({ idx: i, val });
  }
  return hits;
}
