/**
 * Multi-instance indicator model — lets the SAME indicator exist several times
 * on one chart pane, each instance with its own params AND its own compute
 * frequency (RSI 14 daily + RSI 14 weekly; ROC 14 + ROC 20 in separate panes).
 *
 * Generalizes the maLines pattern (see getMaLines/setMaLines in ChartPane):
 *  - `ActiveIndicators.instances[key]` is the per-instance source of truth.
 *  - When absent, instances are DERIVED from the legacy single-slot fields
 *    (`rsi`+`rsiFreq`, `macd`, `registry[id]`, …) so saved workspaces render
 *    unchanged with zero migration writes (see getInstances).
 *  - Writes go through setInstances, which keeps the legacy fields in sync so
 *    old readers (Macro renderer, sidebar badges, FindBestMA) keep working.
 *
 * Pane grouping: each instance either owns its own sub-pane (pane undefined →
 * group = iid) or points at a shared group id. The reserved LEGACY_GROUP "0"
 * maps to the BARE sub-chart key ("rsi", not "rsi#0"), so hiddenSubCharts,
 * subHeights, IndicatorOverlay.source and saved indicator sets keep matching
 * byte-identically for untouched state.
 */
import type { ActiveIndicators } from "@/components/ChartPane";
import type { OhlcBar } from "./indicators";
import { getIndicatorDef, resampleIndicatorBars, type RegistryIndicatorState } from "./indicatorRegistry";

export type InstFreq = "chart" | "weekly" | "monthly";

/** Group id legacy-derived instances share — renders under the bare sub-chart
 *  key so pre-instance saved state keeps its exact pane identity. */
export const LEGACY_GROUP = "0";

export interface IndicatorInstance {
  /** Stable id: "i1","i2",… (user-created, via nextIid) or "L…" (derived from
   *  a legacy field on read — deterministic, never written back). */
  iid: string;
  /** Param values; arrays only for a registry def's multiInstanceParam. */
  params: Record<string, number | number[]>;
  /** Compute frequency — absent = the chart's own bars. */
  freq?: InstFreq;
  /** Pane-group id. Absent = own pane (group = iid); set = merged into that
   *  group's pane. LEGACY_GROUP renders under the bare indicator key. */
  pane?: string;
  /** Per-instance hidden component keys (see IndicatorDef.components). */
  hiddenParts?: string[];
}

export type InstanceParamSpec = { key: string; label: string; default: number; min?: number; step?: number };

/** Built-in (non-registry) indicators that support instances, with the param
 *  schema that drives the InstanceRows editor + legacy field sync. */
export const BUILTIN_INSTANCE_DEFS: Record<string, { target: "pane" | "overlay"; label: string; params: InstanceParamSpec[] }> = {
  rsi:        { target: "pane",    label: "RSI",   params: [{ key: "period", label: "Period", default: 14, min: 2 }] },
  macd:       { target: "pane",    label: "MACD",  params: [
    { key: "fast", label: "Fast", default: 12, min: 2 },
    { key: "slow", label: "Slow", default: 26, min: 3 },
    { key: "signal", label: "Signal", default: 9, min: 1 },
  ] },
  atr:        { target: "pane",    label: "ATR",   params: [{ key: "period", label: "Period", default: 14, min: 2 }] },
  roc:        { target: "pane",    label: "ROC",   params: [{ key: "period", label: "Period", default: 12, min: 1 }] },
  stochastic: { target: "pane",    label: "Stoch", params: [
    { key: "kPeriod", label: "%K", default: 14, min: 2 },
    { key: "dPeriod", label: "%D", default: 3, min: 1 },
  ] },
  obv:        { target: "pane",    label: "OBV",   params: [] },
  bollinger:  { target: "overlay", label: "BB",    params: [
    { key: "period", label: "Period", default: 20, min: 2 },
    { key: "mult", label: "σ", default: 2, min: 0.5, step: 0.1 },
  ] },
};

/** Local copy of ChartPane's indicatorPeriods (kept here to avoid a runtime
 *  import cycle — ChartPane imports this module's helpers). */
function periodList(v: number | number[] | undefined): number[] {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return [v];
  if (Array.isArray(v)) return v.filter((n) => typeof n === "number" && Number.isFinite(n) && n > 0);
  return [];
}

function normFreq(f: unknown): "weekly" | "monthly" | undefined {
  return f === "weekly" || f === "monthly" ? f : undefined;
}

/** Chart bars spanned by one indicator bar at `indFreq` — 1 when resampling is
 *  a no-op (chart already at/coarser than the target, or hourly epoch axis).
 *  Shared by ChartPane/Pairs so "weekly on a weekly chart" never shows a
 *  misleading W suffix. */
export function barsPerIndicatorBar(chartFreq: string | undefined, indFreq: string | undefined): number {
  if (indFreq !== "weekly" && indFreq !== "monthly") return 1;
  const cf = chartFreq ?? "daily";
  if (cf === "daily") return indFreq === "weekly" ? 5 : 21;
  if (cf === "weekly") return indFreq === "monthly" ? 4 : 1;
  return 1;
}

/** The instance's frequency when it actually changes the compute; undefined
 *  when it would be a no-op on this chart (drives input choice + suffix). */
export function effectiveFreq(chartFreq: string | undefined, inst: IndicatorInstance): InstFreq | undefined {
  const f = normFreq(inst.freq);
  return f && barsPerIndicatorBar(chartFreq, f) > 1 ? f : undefined;
}

export function freqSuffix(f: InstFreq | undefined): string {
  return f === "weekly" ? "W" : f === "monthly" ? "M" : "";
}

/** Label for the "Chart" frequency option, spelling out what the chart's own
 *  bar frequency actually is ("Chart (D)" on a daily chart). Falls back to
 *  plain "Chart" when the surface doesn't know its frequency. */
export function chartFreqLabel(chartFreq?: string): string {
  const tag =
    chartFreq === "hourly" ? "1H"
    : chartFreq === "daily" ? "D"
    : chartFreq === "weekly" ? "W"
    : chartFreq === "monthly" ? "M"
    : "";
  return tag ? `Chart (${tag})` : "Chart";
}

function sanitize(list: IndicatorInstance[]): IndicatorInstance[] {
  const out: IndicatorInstance[] = [];
  for (const i of list) {
    if (!i || typeof i.iid !== "string" || !i.iid) continue;
    const params: Record<string, number | number[]> = {};
    for (const [k, v] of Object.entries(i.params ?? {})) {
      if (typeof v === "number" && Number.isFinite(v)) params[k] = v;
      else if (Array.isArray(v)) {
        const a = v.filter((n) => typeof n === "number" && Number.isFinite(n));
        if (a.length) params[k] = a;
      }
    }
    out.push({
      iid: i.iid,
      params,
      ...(normFreq(i.freq) ? { freq: normFreq(i.freq) } : {}),
      ...(typeof i.pane === "string" && i.pane ? { pane: i.pane } : {}),
      ...(Array.isArray(i.hiddenParts) && i.hiddenParts.length ? { hiddenParts: i.hiddenParts.filter((p) => typeof p === "string") } : {}),
    });
  }
  return out;
}

/** Resolve the instance list for one indicator key. Prefers the per-instance
 *  `instances[key]`; otherwise DERIVES instances from the legacy single-slot
 *  fields (all in LEGACY_GROUP so the current single-pane visual and sub-chart
 *  key are preserved). Never writes state. */
export function getInstances(ind: ActiveIndicators, key: string): IndicatorInstance[] {
  const explicit = (ind.instances as Record<string, IndicatorInstance[]> | undefined)?.[key];
  if (explicit && explicit.length) return sanitize(explicit);

  // Legacy derivations — one "L…" instance per legacy slot, group LEGACY_GROUP.
  const L = (iid: string, params: Record<string, number | number[]>, freq?: InstFreq, hiddenParts?: string[]): IndicatorInstance => ({
    iid,
    params,
    ...(freq ? { freq } : {}),
    pane: LEGACY_GROUP,
    ...(hiddenParts && hiddenParts.length ? { hiddenParts } : {}),
  });
  switch (key) {
    case "rsi":
      return periodList(ind.rsi).map((p) => L(`L${p}`, { period: p }, normFreq(ind.rsiFreq)));
    case "atr":
      return periodList(ind.atr).map((p) => L(`L${p}`, { period: p }));
    case "roc":
      return periodList(ind.roc).map((p) => L(`L${p}`, { period: p }));
    case "macd":
      return ind.macd ? [L("L", { fast: 12, slow: 26, signal: 9 })] : [];
    case "stochastic":
      return ind.stochastic ? [L("L", { kPeriod: ind.stochastic.kPeriod, dPeriod: ind.stochastic.dPeriod })] : [];
    case "obv":
      return ind.obv ? [L("L", {})] : [];
    case "bollinger":
      return ind.bollinger ? [L("L", { period: ind.bollinger.period, mult: ind.bollinger.mult })] : [];
    default: {
      const st = ind.registry?.[key];
      if (!st?.enabled) return [];
      return [L("L", { ...(st.params ?? {}) }, normFreq(st.freq), st.hiddenParts)];
    }
  }
}

/** Write the instance list for one indicator key. Stores it under
 *  `instances[key]` (the source of truth; deleted when empty) and keeps the
 *  legacy single-slot fields in sync — periods list for rsi/atr/roc (dropping
 *  the superseded rsiFreq), booleans/param objects for the other built-ins,
 *  and instance #1 for registry entries — so every legacy reader keeps
 *  working. Returns a new ActiveIndicators. */
export function setInstances(ind: ActiveIndicators, key: string, list: IndicatorInstance[]): ActiveIndicators {
  const clean = sanitize(list);
  const next: ActiveIndicators = { ...ind };
  const all = { ...((ind.instances as Record<string, IndicatorInstance[]>) ?? {}) };
  if (clean.length) all[key] = clean; else delete all[key];
  next.instances = Object.keys(all).length ? all : undefined;

  const firstNum = (i: IndicatorInstance, k: string, dflt: number): number => {
    const v = i.params[k];
    const n = Array.isArray(v) ? v[0] : v;
    return typeof n === "number" && Number.isFinite(n) ? n : dflt;
  };
  const periods = (): number[] => {
    const seen = new Set<number>();
    for (const i of clean) {
      const p = i.params.period;
      for (const n of Array.isArray(p) ? p : [p]) {
        if (typeof n === "number" && Number.isFinite(n) && n > 0) seen.add(n);
      }
    }
    return [...seen];
  };
  const asPeriodField = (): number | number[] | undefined => {
    const ps = periods();
    return ps.length === 0 ? undefined : ps.length === 1 ? ps[0] : ps;
  };

  switch (key) {
    case "rsi":
      next.rsi = asPeriodField();
      delete next.rsiFreq; // superseded by per-instance freq
      break;
    case "atr":
      next.atr = asPeriodField();
      break;
    case "roc":
      next.roc = asPeriodField();
      break;
    case "macd":
      next.macd = clean.length > 0 ? true : undefined;
      break;
    case "stochastic":
      next.stochastic = clean.length
        ? { kPeriod: firstNum(clean[0], "kPeriod", 14), dPeriod: firstNum(clean[0], "dPeriod", 3) }
        : undefined;
      break;
    case "obv":
      next.obv = clean.length > 0 ? true : undefined;
      break;
    case "bollinger":
      next.bollinger = clean.length
        ? { period: firstNum(clean[0], "period", 20), mult: firstNum(clean[0], "mult", 2) }
        : undefined;
      break;
    default: {
      // Registry indicator: mirror instance #1 so single-instance readers
      // (Macro pre-parity, FindBestMA, set summaries) see something sensible.
      // On empty, keep the entry with enabled:false so the last params survive
      // a toggle-off (matches today's Switch behavior).
      const reg = { ...(ind.registry ?? {}) };
      const prev: RegistryIndicatorState = reg[key] ?? {};
      if (clean.length) {
        const f = clean[0];
        reg[key] = {
          enabled: true,
          params: { ...f.params },
          ...(f.freq ? { freq: f.freq } : {}),
          ...(f.hiddenParts?.length ? { hiddenParts: f.hiddenParts } : {}),
        };
      } else if (reg[key]) {
        reg[key] = { ...prev, enabled: false };
      }
      next.registry = Object.keys(reg).length ? reg : undefined;
      break;
    }
  }
  return next;
}

/** Effective pane group of an instance: shared group when set, else its own. */
export function effGroup(i: IndicatorInstance): string {
  return i.pane ?? i.iid;
}

/** Instances of one indicator bucketed into pane groups, in first-appearance
 *  order (legacy group first when legacy instances exist). */
export function paneGroups(ind: ActiveIndicators, key: string): { group: string; instances: IndicatorInstance[] }[] {
  const out: { group: string; instances: IndicatorInstance[] }[] = [];
  const byGroup = new Map<string, IndicatorInstance[]>();
  for (const i of getInstances(ind, key)) {
    const g = effGroup(i);
    let bucket = byGroup.get(g);
    if (!bucket) {
      bucket = [];
      byGroup.set(g, bucket);
      out.push({ group: g, instances: bucket });
    }
    bucket.push(i);
  }
  return out;
}

/** Sub-chart key for one pane group. LEGACY_GROUP → the bare indicator key,
 *  so untouched saved state keeps byte-identical sub-chart identity. */
export function subChartKeyFor(baseId: string, group: string): string {
  return group === LEGACY_GROUP ? baseId : `${baseId}#${group}`;
}

/** Inverse of subChartKeyFor. A bare key parses as the legacy group. */
export function parseSubChartKey(subKey: string): { baseId: string; group: string } {
  const i = subKey.indexOf("#");
  if (i < 0) return { baseId: subKey, group: LEGACY_GROUP };
  return { baseId: subKey.slice(0, i), group: subKey.slice(i + 1) };
}

/** Next user-instance id: max "iN" suffix + 1 (stable, no Date.now()). */
export function nextIid(existing: IndicatorInstance[]): string {
  let max = 0;
  for (const i of existing) {
    const m = /^i(\d+)$/.exec(i.iid);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `i${max + 1}`;
}

/** Short display label for one instance: "RSI 14W", "ADX 20M", "MACD 12,26,9". */
export function instanceLabel(key: string, inst: IndicatorInstance): string {
  const builtin = BUILTIN_INSTANCE_DEFS[key];
  const base = builtin?.label ?? getIndicatorDef(key)?.label ?? key.toUpperCase();
  const specs = builtin?.params ?? getIndicatorDef(key)?.params ?? [];
  const vals: string[] = [];
  for (const s of specs) {
    const v = inst.params[s.key];
    if (typeof v === "number" && Number.isFinite(v)) vals.push(String(v));
    else if (Array.isArray(v) && v.length) vals.push(v.join("/"));
  }
  const shown = key === "macd" || key === "stochastic" ? vals : vals.slice(0, 1);
  const sfx = freqSuffix(normFreq(inst.freq));
  return `${base}${shown.length ? " " + shown.join(",") : ""}${sfx ? (shown.length ? sfx : " " + sfx) : ""}`;
}

// ── Shared per-frequency resample cache ──
// One weekly/monthly resample per pane, shared by every instance that needs it
// (5 weekly indicators ⇒ 1 weekly resample, not 5).

export type LineDatum = { time: string; value: number };
export type FreqSourceCache = {
  /** Close-only line series at the given frequency (chart/undefined = as-is). */
  close: (freq: InstFreq | undefined) => LineDatum[];
  /** Real OHLC bars at the given frequency (chart/undefined = as-is). */
  ohlc: (freq: InstFreq | undefined) => OhlcBar[];
};

export function makeFreqSourceCache(closeData: LineDatum[], ohlcBars: OhlcBar[]): FreqSourceCache {
  const closeMemo = new Map<string, LineDatum[]>();
  const ohlcMemo = new Map<string, OhlcBar[]>();
  return {
    close(freq) {
      const f = normFreq(freq);
      if (!f) return closeData;
      let out = closeMemo.get(f);
      if (!out) {
        out = resampleIndicatorBars(
          closeData.map((d) => ({ time: String(d.time), open: d.value, high: d.value, low: d.value, close: d.value })),
          f,
        ).map((b) => ({ time: b.time, value: b.close }));
        closeMemo.set(f, out);
      }
      return out;
    },
    ohlc(freq) {
      const f = normFreq(freq);
      if (!f) return ohlcBars;
      let out = ohlcMemo.get(f);
      if (!out) {
        out = resampleIndicatorBars(ohlcBars, f);
        ohlcMemo.set(f, out);
      }
      return out;
    },
  };
}
