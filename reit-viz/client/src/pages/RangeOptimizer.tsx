// Reconstructed from recovered-bundle/RangeOptimizer-zhHihrAX.js on 2026-06-12
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useUniverse } from "@/lib/universeContext";
import { getTickers } from "@/lib/dataService";
import { getDates } from "@/lib/dataService";
import { getTickerRaw } from "@/lib/dataService";
import { usePersistedState } from "@/lib/persistedState";
import { useBaskets } from "@/lib/basketContext";
import { useWorkspaceTab } from "@/lib/workspaceContext";
import { InputSeriesSelector } from "@/lib/inputSeriesSelector";
import { DEFAULT_INPUT_SELECTION } from "@/lib/inputSeriesSelector";
import { MA_TYPES } from "@/lib/movingAverages";
import { weeklyDownsample } from "@/lib/weeklyDownsample";
import { buildBasketOhlc, getBasketOhlc } from "@/lib/basketOhlc";
import { getYahooPairsRatio } from "@/lib/yahooPairsRatio";
import { useOptimizerClassFilter } from "@/lib/useOptimizerClassFilter";
import { usePairComboPicker } from "@/lib/usePairComboPicker";
import { useFrequency } from "@/lib/useFrequency";
import { PresetBar } from "@/components/PresetBar";
import { UnifiedTickerPicker } from "@/components/UnifiedTickerPicker";
import { BasketTickerPill } from "@/components/BasketTickerPill";
import { BasketPicker } from "@/components/BasketPicker";
import { Button } from "@/components/ui/button";
import {
  X,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Plus,
  Download,
  Play,
} from "lucide-react";
import "@/lib/harsi";

// ─── cast harsi functions as any (lib may not export named functions) ──────────
const computeHarsi = (closes: number[], highs: number[], lows: number[], opts: any): any =>
  (window as any).__harsiCompute?.(closes, highs, lows, opts) ?? {};
const harsiIndicatorLabel = (field: string, opts: any): string =>
  (window as any).__harsiLabel?.(field, opts) ?? `HARSI(${field})`;

// ─── cast computeAllMAs as any (from maUtils, path best-guess) ────────────────
const computeAllMAs = (closes: number[], period: number, maType: string, opts: any): (number | null)[] => {
  try {
    return (window as any).__computeAllMAs?.(closes, period, maType, opts) ?? [];
  } catch {
    return new Array(closes.length).fill(null);
  }
};

// ─── cast getMaLabel as any ───────────────────────────────────────────────────
const getMaLabel = (maType: string, period: number, opts?: any): string =>
  (window as any).__getMaLabel?.(maType, period, opts) ?? `${maType}(${period})`;

// ─── weeklyDownsample cast ────────────────────────────────────────────────────
const weeklyDownsampleObj = weeklyDownsample as any;

// ─── isBasketTicker local helper ──────────────────────────────────────────────
function isBasketTicker(ticker: string): boolean {
  return ticker?.startsWith?.("BASKET:") ?? false;
}

// ─── Local inline math functions ─────────────────────────────────────────────
function computeRSI(closes: number[], period = 14): (number | null)[] {
  const n = closes.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (period < 1 || n < 2) return result;
  let avgGain = 0, avgLoss = 0, count = 0;
  for (let i = 1; i < n; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    if (count < period) {
      avgGain += gain; avgLoss += loss; count++;
      if (count === period) {
        avgGain /= period; avgLoss /= period;
        const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
        result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
      result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    }
  }
  return result;
}

function computeROC(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    const prev = closes[i - period];
    if (prev > 0) result[i] = closes[i] / prev - 1;
  }
  return result;
}

function computeStoch(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
  dSmooth = 3
): { k: (number | null)[]; d: (number | null)[]; kMinusD: (number | null)[] } {
  const n = closes.length;
  const k: (number | null)[] = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = 0; j < period; j++) {
      const idx = i - j;
      if (highs[idx] > hi) hi = highs[idx];
      if (lows[idx] < lo) lo = lows[idx];
    }
    const range = hi - lo;
    k[i] = range > 0 ? (closes[i] - lo) / range * 100 : 50;
  }
  const d: (number | null)[] = new Array(n).fill(null);
  for (let i = period + dSmooth - 2; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = 0; j < dSmooth; j++) {
      const v = k[i - j];
      if (v !== null) { sum += v; cnt++; }
    }
    d[i] = cnt > 0 ? sum / cnt : null;
  }
  const kMinusD = k.map((v, i) =>
    v !== null && d[i] !== null ? v - d[i]! : null
  );
  return { k, d, kMinusD };
}

function computeMaSlope(maValues: (number | null)[], lookback: number): (number | null)[] {
  const result: (number | null)[] = new Array(maValues.length).fill(null);
  for (let i = lookback; i < maValues.length; i++) {
    const prev = maValues[i - lookback];
    const cur = maValues[i];
    if (prev !== null && cur !== null && prev !== 0) result[i] = cur / prev - 1;
  }
  return result;
}

function computePriceVsMa(closes: number[], maValues: (number | null)[]): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    const ma = maValues[i];
    if (ma !== null && ma !== 0) result[i] = closes[i] / ma - 1;
  }
  return result;
}

function computeMaSpread(fastMa: (number | null)[], slowMa: (number | null)[]): (number | null)[] {
  const result: (number | null)[] = new Array(fastMa.length).fill(null);
  for (let i = 0; i < fastMa.length; i++) {
    const f = fastMa[i], s = slowMa[i];
    if (f !== null && s !== null && s !== 0) result[i] = f / s - 1;
  }
  return result;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type IndicatorKind =
  | "rsi"
  | "roc"
  | "stoch_k"
  | "stoch_d"
  | "stoch_kd"
  | "ma_slope"
  | "price_vs_ma"
  | "ma_spread"
  | "harsi_rsi"
  | "harsi_ha_close"
  | "harsi_stoch_k"
  | "harsi_stoch_d"
  | "harsi_stoch_kd";

interface HarsiOpts {
  candleLength?: number;
  candleSmoothing?: number;
  rsiLength?: number;
  rsiSmoothed?: boolean;
  stochLength?: number;
  smoothK?: number;
  smoothD?: number;
  stochFit?: number;
}

interface Indicator {
  id: string;
  kind: IndicatorKind;
  fmt: string;
  label: string;
  period?: number;
  dPeriod?: number;
  maType?: string;
  maOpts?: Record<string, any>;
  fastMaType?: string;
  fastPeriod?: number;
  fastMaOpts?: Record<string, any>;
  slowMaType?: string;
  slowPeriod?: number;
  slowMaOpts?: Record<string, any>;
  slopeLookback?: number;
  harsi?: HarsiOpts;
}

type RunMode = "single" | "pool" | "pair" | "pairCombo" | "basket";

interface BandPart {
  display: string;
}

interface Band {
  parts: BandPart[];
  hits: number;
  winRate: number;
  meanReturn: number;
  medianReturn: number;
  stdReturn: number;
  lift: number;
  tStat: number;
  lastDate?: string;
  currentlyIn?: boolean;
  oosHits?: number;
  oosMean?: number;
  oosLift?: number;
  oosWinRate?: number;
}

interface RangeResult {
  longs: Band[];
  shorts: Band[];
  baselineMean: number;
  baselineStd: number;
  baselineN: number;
  totalBuckets: number;
  walkForward?: boolean;
  oosBaselineMean?: number;
  oosBaselineN?: number;
  longsByTicker?: [number, string[]][];
  shortsByTicker?: [number, string[]][];
}

interface PoolExtras {
  longsByTicker: Map<number, string[]>;
  shortsByTicker: Map<number, string[]>;
}

interface ProgressState {
  current: number;
  total: number;
  stage: string;
  fetched: number;
  fetchTotal: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const HORIZON_OPTIONS = [
  { days: 5, label: "1W" },
  { days: 10, label: "2W" },
  { days: 21, label: "1M" },
  { days: 42, label: "2M" },
  { days: 63, label: "3M" },
  { days: 126, label: "6M" },
];

const INDICATOR_KINDS: { kind: IndicatorKind; group: string; label: string }[] = [
  { kind: "rsi", group: "Oscillators", label: "RSI" },
  { kind: "roc", group: "Oscillators", label: "Rate of Change" },
  { kind: "stoch_k", group: "Oscillators", label: "Stochastic %K" },
  { kind: "stoch_d", group: "Oscillators", label: "Stochastic %D" },
  { kind: "stoch_kd", group: "Oscillators", label: "Stochastic %K − %D" },
  { kind: "ma_slope", group: "Moving Averages", label: "MA Slope" },
  { kind: "price_vs_ma", group: "Moving Averages", label: "Price vs MA" },
  { kind: "ma_spread", group: "Moving Averages", label: "MA Spread (fast/slow)" },
  { kind: "harsi_rsi", group: "HARSI (Heikin-Ashi RSI)", label: "HARSI RSI line" },
  { kind: "harsi_ha_close", group: "HARSI (Heikin-Ashi RSI)", label: "HARSI HA-Candle Close" },
  { kind: "harsi_stoch_k", group: "HARSI (Heikin-Ashi RSI)", label: "HARSI Stoch %K" },
  { kind: "harsi_stoch_d", group: "HARSI (Heikin-Ashi RSI)", label: "HARSI Stoch %D" },
  { kind: "harsi_stoch_kd", group: "HARSI (Heikin-Ashi RSI)", label: "HARSI Stoch %K − %D" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getFmtType(kind: IndicatorKind): string {
  switch (kind) {
    case "rsi":
    case "stoch_k":
    case "stoch_d":
    case "harsi_rsi":
    case "harsi_ha_close":
    case "harsi_stoch_k":
    case "harsi_stoch_d":
      return "num0";
    case "stoch_kd":
    case "harsi_stoch_kd":
      return "num2";
    case "roc":
    case "ma_slope":
    case "price_vs_ma":
    case "ma_spread":
      return "pct";
    default:
      return "num2";
  }
}

function getIndicatorLabel(ind: Indicator): string {
  switch (ind.kind) {
    case "rsi":
      return `RSI(${ind.period ?? 14})`;
    case "roc":
      return `ROC(${ind.period ?? 10})`;
    case "stoch_k":
      return `Stoch %K(${ind.period ?? 14},${ind.dPeriod ?? 3})`;
    case "stoch_d":
      return `Stoch %D(${ind.period ?? 14},${ind.dPeriod ?? 3})`;
    case "stoch_kd":
      return `Stoch %K−%D(${ind.period ?? 14},${ind.dPeriod ?? 3})`;
    case "ma_slope":
      return `${getMaLabel(ind.maType ?? "EMA", ind.period ?? 50, ind.maOpts)} slope(${ind.slopeLookback ?? 5})`;
    case "price_vs_ma":
      return `Px vs ${getMaLabel(ind.maType ?? "SMA", ind.period ?? 50, ind.maOpts)}`;
    case "ma_spread": {
      const fast = getMaLabel(ind.fastMaType ?? "EMA", ind.fastPeriod ?? 20, ind.fastMaOpts);
      const slow = getMaLabel(ind.slowMaType ?? "EMA", ind.slowPeriod ?? 50, ind.slowMaOpts);
      return `${fast} / ${slow} spread`;
    }
    case "harsi_rsi":
      return harsiIndicatorLabel("rsi", ind.harsi);
    case "harsi_ha_close":
      return harsiIndicatorLabel("ha_close", ind.harsi);
    case "harsi_stoch_k":
      return harsiIndicatorLabel("stoch_k", ind.harsi);
    case "harsi_stoch_d":
      return harsiIndicatorLabel("stoch_d", ind.harsi);
    case "harsi_stoch_kd":
      return harsiIndicatorLabel("stoch_kd", ind.harsi);
    default:
      return ind.kind;
  }
}

let _idCounter = 0;
function genId(): string {
  _idCounter += 1;
  return `c${Date.now().toString(36)}-${_idCounter.toString(36)}`;
}

const DEFAULT_HARSI_OPTS: HarsiOpts = {
  candleLength: 14,
  candleSmoothing: 1,
  rsiLength: 7,
  rsiSmoothed: true,
  stochLength: 14,
  smoothK: 3,
  smoothD: 3,
  stochFit: 80,
};

function createIndicator(kind: IndicatorKind, overrides: Partial<Indicator> = {}): Indicator {
  const base: Indicator = {
    id: genId(),
    kind,
    fmt: getFmtType(kind),
    label: "",
    period: undefined,
    ...overrides,
  };
  switch (kind) {
    case "rsi":
      base.period = base.period ?? 14;
      break;
    case "roc":
      base.period = base.period ?? 10;
      break;
    case "stoch_k":
    case "stoch_d":
    case "stoch_kd":
      base.period = base.period ?? 14;
      base.dPeriod = base.dPeriod ?? 3;
      break;
    case "ma_slope":
      base.maType = base.maType ?? "EMA";
      base.period = base.period ?? 50;
      base.slopeLookback = base.slopeLookback ?? 5;
      break;
    case "price_vs_ma":
      base.maType = base.maType ?? "SMA";
      base.period = base.period ?? 50;
      break;
    case "ma_spread":
      base.fastMaType = base.fastMaType ?? "EMA";
      base.fastPeriod = base.fastPeriod ?? 20;
      base.slowMaType = base.slowMaType ?? "EMA";
      base.slowPeriod = base.slowPeriod ?? 50;
      break;
    case "harsi_rsi":
    case "harsi_ha_close":
    case "harsi_stoch_k":
    case "harsi_stoch_d":
    case "harsi_stoch_kd":
      base.harsi = { ...DEFAULT_HARSI_OPTS, ...base.harsi };
      break;
  }
  base.label = getIndicatorLabel(base);
  return base;
}

function defaultIndicators(): Indicator[] {
  return [
    createIndicator("rsi", { period: 14 }),
    createIndicator("roc", { period: 20 }),
    createIndicator("stoch_k", { period: 14, dPeriod: 3 }),
    createIndicator("ma_slope", { maType: "EMA", period: 50, slopeLookback: 5 }),
    createIndicator("price_vs_ma", { maType: "SMA", period: 200 }),
    createIndicator("ma_spread", {
      fastMaType: "SMA",
      fastPeriod: 50,
      slowMaType: "SMA",
      slowPeriod: 200,
    }),
  ];
}

interface MaCache {
  ma: Map<string, (number | null)[]>;
  harsi: Map<string, any>;
}

function makeCache(): MaCache {
  return { ma: new Map(), harsi: new Map() };
}

function computeIndicatorSeries(
  ind: Indicator,
  closes: number[],
  highs: number[],
  lows: number[],
  cache: MaCache
): (number | null)[] {
  const getMa = (maType: string, period: number, opts?: any): (number | null)[] => {
    const key = `${maType}:${period}:${JSON.stringify(opts ?? {})}`;
    let cached = cache.ma.get(key);
    if (!cached) {
      cached = computeAllMAs(closes, period, maType, { ...opts, highs, lows });
      cache.ma.set(key, cached);
    }
    return cached;
  };
  const getHarsi = (opts?: any): any => {
    const key = JSON.stringify(opts ?? {});
    let cached = cache.harsi.get(key);
    if (!cached) {
      cached = computeHarsi(closes, highs, lows, opts ?? {});
      cache.harsi.set(key, cached);
    }
    return cached;
  };

  switch (ind.kind) {
    case "rsi":
      return computeRSI(closes, ind.period ?? 14);
    case "roc":
      return computeROC(closes, ind.period ?? 10);
    case "stoch_k":
    case "stoch_d":
    case "stoch_kd": {
      const stoch = computeStoch(highs, lows, closes, ind.period ?? 14, ind.dPeriod ?? 3);
      return ind.kind === "stoch_k" ? stoch.k : ind.kind === "stoch_d" ? stoch.d : stoch.kMinusD;
    }
    case "ma_slope": {
      const ma = getMa(ind.maType ?? "EMA", ind.period ?? 50, ind.maOpts);
      return computeMaSlope(ma, ind.slopeLookback ?? 5);
    }
    case "price_vs_ma": {
      const ma = getMa(ind.maType ?? "SMA", ind.period ?? 50, ind.maOpts);
      return computePriceVsMa(closes, ma);
    }
    case "ma_spread": {
      const fastMa = getMa(ind.fastMaType ?? "EMA", ind.fastPeriod ?? 20, ind.fastMaOpts);
      const slowMa = getMa(ind.slowMaType ?? "EMA", ind.slowPeriod ?? 50, ind.slowMaOpts);
      return computeMaSpread(fastMa, slowMa);
    }
    case "harsi_rsi":
      return getHarsi(ind.harsi).rsi ?? [];
    case "harsi_ha_close":
      return getHarsi(ind.harsi).haClose ?? [];
    case "harsi_stoch_k":
      return getHarsi(ind.harsi).stochK ?? [];
    case "harsi_stoch_d":
      return getHarsi(ind.harsi).stochD ?? [];
    case "harsi_stoch_kd":
      return getHarsi(ind.harsi).stochKD ?? [];
    default:
      return new Array(closes.length).fill(null);
  }
}

function flattenFeatureMatrix(
  series: (number | null)[][],
  len: number
): Float64Array {
  const flat = new Float64Array(series.length * len);
  for (let i = 0; i < series.length; i++) {
    const offset = i * len;
    const s = series[i];
    for (let j = 0; j < len; j++) {
      const v = s[j];
      flat[offset + j] = v === null ? Number.NaN : v;
    }
  }
  return flat;
}

function fmtPct(v: number): string {
  return (v * 100).toFixed(2) + "%";
}
function fmtSigned(v: number): string {
  return (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
}

// ─── Worker creator ───────────────────────────────────────────────────────────
function createWorker(): Worker {
  return new Worker("" + new URL("rangeSearch.worker-DWovBQhj.js", import.meta.url).href, {
    name: "rangeSearch",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// NumberField
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-mono text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => {
          const raw = e.target.value;
          const parsed = step && step < 1 ? parseFloat(raw) : parseInt(raw, 10);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
        className="text-xs font-mono bg-background border border-border rounded px-2 py-0.5 w-28 text-right"
      />
    </label>
  );
}

// SelectField
function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-mono text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs font-mono bg-background border border-border rounded px-2 py-0.5 w-44"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// CheckboxField
function CheckboxField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-mono text-muted-foreground">{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary"
      />
    </label>
  );
}

// MaOptsFields
function MaOptsFields({
  maType,
  opts,
  setOpt,
}: {
  maType: string;
  opts: Record<string, any>;
  setOpt: (key: string, val: any) => void;
}) {
  if (maType === "T3") {
    return (
      <>
        <NumberField
          label="T3 Volume Factor (0..1)"
          value={opts.t3VolumeFactor ?? 0.7}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => setOpt("t3VolumeFactor", v)}
        />
        <SelectField
          label="T3 Source"
          value={opts.t3Source ?? "close"}
          options={[
            { value: "close", label: "close" },
            { value: "hlc2_close", label: "(H+L+2C)/4 (Pine)" },
          ]}
          onChange={(v) => setOpt("t3Source", v)}
        />
      </>
    );
  }
  if (maType === "ALMA") {
    return (
      <>
        <NumberField
          label="ALMA Offset (0..1)"
          value={opts.almaOffset ?? 0.85}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => setOpt("almaOffset", v)}
        />
        <NumberField
          label="ALMA Sigma"
          value={opts.almaSigma ?? 6}
          min={0.5}
          max={50}
          step={0.5}
          onChange={(v) => setOpt("almaSigma", v)}
        />
      </>
    );
  }
  if (maType === "FRAMA") {
    return (
      <>
        <NumberField
          label="FRAMA FC"
          value={opts.framaFC ?? 1}
          min={1}
          max={500}
          onChange={(v) => setOpt("framaFC", v)}
        />
        <NumberField
          label="FRAMA SC"
          value={opts.framaSC ?? 198}
          min={1}
          max={1000}
          onChange={(v) => setOpt("framaSC", v)}
        />
      </>
    );
  }
  if (maType === "LSMA" || maType === "SLSMA") {
    return (
      <NumberField
        label={`${maType} Offset`}
        value={opts.lsmaOffset ?? 0}
        min={0}
        max={50}
        step={1}
        onChange={(v) => setOpt("lsmaOffset", v)}
      />
    );
  }
  return null;
}

// HarsiFields
function HarsiFields({
  h,
  setH,
}: {
  h: HarsiOpts;
  setH: (key: string, val: any) => void;
}) {
  return (
    <>
      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-1">
        HARSI Candle
      </div>
      <NumberField
        label="Candle Length"
        value={h.candleLength ?? 14}
        min={2}
        max={200}
        onChange={(v) => setH("candleLength", v)}
      />
      <NumberField
        label="Open Smoothing"
        value={h.candleSmoothing ?? 1}
        min={1}
        max={100}
        onChange={(v) => setH("candleSmoothing", v)}
      />
      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-1">
        RSI Plot
      </div>
      <NumberField
        label="RSI Length"
        value={h.rsiLength ?? 7}
        min={2}
        max={200}
        onChange={(v) => setH("rsiLength", v)}
      />
      <CheckboxField
        label="Smoothed Mode RSI"
        value={h.rsiSmoothed ?? true}
        onChange={(v) => setH("rsiSmoothed", v)}
      />
      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-1">
        Stoch RSI
      </div>
      <NumberField
        label="Stoch Length"
        value={h.stochLength ?? 14}
        min={2}
        max={200}
        onChange={(v) => setH("stochLength", v)}
      />
      <NumberField
        label="Smoothing K"
        value={h.smoothK ?? 3}
        min={1}
        max={50}
        onChange={(v) => setH("smoothK", v)}
      />
      <NumberField
        label="Smoothing D"
        value={h.smoothD ?? 3}
        min={1}
        max={50}
        onChange={(v) => setH("smoothD", v)}
      />
      <NumberField
        label="Stoch Scaling %"
        value={h.stochFit ?? 80}
        min={1}
        max={100}
        onChange={(v) => setH("stochFit", v)}
      />
    </>
  );
}

// IndicatorEditModal
function IndicatorEditModal({
  indicator,
  onClose,
  onSave,
}: {
  indicator: Indicator;
  onClose: () => void;
  onSave: (ind: Indicator) => void;
}) {
  const [draft, setDraft] = useState<Indicator>({ ...indicator });

  const previewLabel = getIndicatorLabel(draft);

  const setField = (key: string, val: any) =>
    setDraft((prev) => ({ ...prev, [key]: val }));
  const setMaOpt = (key: string, val: any) =>
    setDraft((prev) => ({ ...prev, maOpts: { ...prev.maOpts, [key]: val } }));
  const setFastMaOpt = (key: string, val: any) =>
    setDraft((prev) => ({ ...prev, fastMaOpts: { ...prev.fastMaOpts, [key]: val } }));
  const setSlowMaOpt = (key: string, val: any) =>
    setDraft((prev) => ({ ...prev, slowMaOpts: { ...prev.slowMaOpts, [key]: val } }));
  const setHarsiField = (key: string, val: any) =>
    setDraft((prev) => ({ ...prev, harsi: { ...prev.harsi, [key]: val } }));

  const kind = draft.kind;
  const isSingleMa = kind === "ma_slope" || kind === "price_vs_ma";
  const isSpread = kind === "ma_spread";
  const isStoch = kind === "stoch_k" || kind === "stoch_d" || kind === "stoch_kd";
  const isHarsi = kind.startsWith("harsi_");

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded shadow-lg w-full max-w-md max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div>
            <div className="text-xs font-bold">Edit Indicator</div>
            <div className="text-[10px] font-mono text-muted-foreground">{previewLabel}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 flex flex-col gap-2">
          {(kind === "rsi" || kind === "roc") && (
            <NumberField
              label="Period"
              value={draft.period ?? (kind === "rsi" ? 14 : 10)}
              min={2}
              max={1000}
              onChange={(v) => setField("period", v)}
            />
          )}
          {isStoch && (
            <>
              <NumberField
                label="K Period (length)"
                value={draft.period ?? 14}
                min={2}
                max={1000}
                onChange={(v) => setField("period", v)}
              />
              <NumberField
                label="D Smoothing"
                value={draft.dPeriod ?? 3}
                min={1}
                max={50}
                onChange={(v) => setField("dPeriod", v)}
              />
            </>
          )}
          {isSingleMa && (
            <>
              <SelectField
                label="MA Family"
                value={draft.maType ?? "EMA"}
                options={MA_TYPES.map((t) => ({ value: t, label: t }))}
                onChange={(v) => setField("maType", v)}
              />
              <NumberField
                label="MA Period"
                value={draft.period ?? 50}
                min={2}
                max={1000}
                onChange={(v) => setField("period", v)}
              />
              {kind === "ma_slope" && (
                <NumberField
                  label="Slope Lookback (bars)"
                  value={draft.slopeLookback ?? 5}
                  min={1}
                  max={500}
                  onChange={(v) => setField("slopeLookback", v)}
                />
              )}
              <MaOptsFields
                maType={draft.maType ?? "EMA"}
                opts={draft.maOpts ?? {}}
                setOpt={setMaOpt}
              />
            </>
          )}
          {isSpread && (
            <>
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-1">
                Fast MA
              </div>
              <SelectField
                label="Fast Family"
                value={draft.fastMaType ?? "EMA"}
                options={MA_TYPES.map((t) => ({ value: t, label: t }))}
                onChange={(v) => setField("fastMaType", v)}
              />
              <NumberField
                label="Fast Period"
                value={draft.fastPeriod ?? 20}
                min={2}
                max={1000}
                onChange={(v) => setField("fastPeriod", v)}
              />
              <MaOptsFields
                maType={draft.fastMaType ?? "EMA"}
                opts={draft.fastMaOpts ?? {}}
                setOpt={setFastMaOpt}
              />
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-2">
                Slow MA
              </div>
              <SelectField
                label="Slow Family"
                value={draft.slowMaType ?? "EMA"}
                options={MA_TYPES.map((t) => ({ value: t, label: t }))}
                onChange={(v) => setField("slowMaType", v)}
              />
              <NumberField
                label="Slow Period"
                value={draft.slowPeriod ?? 50}
                min={2}
                max={1000}
                onChange={(v) => setField("slowPeriod", v)}
              />
              <MaOptsFields
                maType={draft.slowMaType ?? "EMA"}
                opts={draft.slowMaOpts ?? {}}
                setOpt={setSlowMaOpt}
              />
            </>
          )}
          {isHarsi && (
            <HarsiFields h={draft.harsi ?? {}} setH={setHarsiField} />
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border">
          <Button size="sm" variant="ghost" onClick={onClose} className="h-7 text-[11px]">
            Cancel
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => onSave(draft)}
            className="h-7 text-[11px]"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// IndicatorPanel
function IndicatorPanel({
  indicators,
  selectedIds,
  groupedKinds,
  toggle,
  onAdd,
  onRemove,
  onEdit,
  disabled,
}: {
  indicators: Indicator[];
  selectedIds: Set<string>;
  groupedKinds: Record<string, { kind: IndicatorKind; group: string; label: string }[]>;
  toggle: (id: string) => void;
  onAdd: (kind: IndicatorKind) => void;
  onRemove: (id: string) => void;
  onEdit: (ind: Indicator) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const selectedCount = selectedIds.size;

  return (
    <div className="bg-card border border-border rounded">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-accent/50 rounded-t"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-1.5">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          <span className="text-xs font-bold">Custom Indicators</span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {selectedCount}/{indicators.length} selected
          </span>
        </div>
      </button>
      {expanded && (
        <div className="p-2 flex flex-col gap-2 border-t border-border">
          <div className="flex flex-wrap gap-1.5">
            {indicators.length === 0 ? (
              <div className="text-[11px] font-mono text-muted-foreground px-1 py-2">
                No indicators. Click "Add Indicator" to build one.
              </div>
            ) : (
              indicators.map((ind) => {
                const isSelected = selectedIds.has(ind.id);
                return (
                  <div
                    key={ind.id}
                    className={`flex items-center gap-1 px-2 py-1 rounded border ${
                      isSelected
                        ? "bg-primary/10 border-primary/40 text-foreground"
                        : "bg-background border-border text-muted-foreground"
                    } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(ind.id)}
                      className="accent-primary"
                    />
                    <span className="text-[11px] font-mono">{ind.label}</span>
                    <button
                      type="button"
                      onClick={() => onEdit(ind)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                      title="Edit parameters"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(ind.id)}
                      className="text-muted-foreground hover:text-red-500"
                      title="Remove"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <div className="relative">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddOpen((p) => !p)}
              disabled={disabled}
              className="h-7 text-[11px]"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Indicator
            </Button>
            {addOpen && (
              <div className="absolute z-10 mt-1 left-0 bg-popover border border-border rounded shadow-lg min-w-[260px] py-1">
                {Object.entries(groupedKinds).map(([group, items]) => (
                  <div key={group} className="py-1">
                    <div className="px-2 py-0.5 text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                      {group}
                    </div>
                    {items.map((item) => (
                      <button
                        key={item.kind}
                        type="button"
                        onClick={() => {
                          onAdd(item.kind);
                          setAddOpen(false);
                        }}
                        className="w-full text-left px-2 py-1 text-[11px] font-mono hover:bg-accent"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// BandTable
function BandTable({
  title,
  accent,
  bands,
  limit,
  setLimit,
  currentTickersByIdx,
  showOos,
}: {
  title: string;
  accent: "green" | "red";
  bands: Band[];
  limit: number;
  setLimit: (v: number) => void;
  currentTickersByIdx?: Map<number, string[]>;
  showOos: boolean;
}) {
  const titleColor = accent === "green" ? "text-emerald-500" : "text-red-500";
  const visible = bands.slice(0, limit);

  return (
    <div className="bg-card border border-border rounded overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
        <span className={`text-xs font-bold ${titleColor}`}>{title}</span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {bands.length} qualifying band{bands.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px] font-mono text-muted-foreground">show top</span>
          <select
            className="text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
          </select>
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="px-2 py-3 text-[11px] font-mono text-muted-foreground text-center">
          No bands met the filters. Try lowering Min Lift or Min Hits.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-2 py-1 font-bold">Band</th>
                <th className="text-right px-2 py-1 font-bold">Hits</th>
                <th className="text-right px-2 py-1 font-bold">Win %</th>
                <th className="text-right px-2 py-1 font-bold">μ Ret</th>
                <th className="text-right px-2 py-1 font-bold">Med</th>
                <th className="text-right px-2 py-1 font-bold">σ</th>
                <th className="text-right px-2 py-1 font-bold">Lift</th>
                <th className="text-right px-2 py-1 font-bold">t-stat</th>
                {showOos && (
                  <>
                    <th className="text-right px-2 py-1 font-bold text-cyan-400 border-l border-border">
                      OOS Hits
                    </th>
                    <th className="text-right px-2 py-1 font-bold text-cyan-400">OOS μ</th>
                    <th className="text-right px-2 py-1 font-bold text-cyan-400">OOS Lift</th>
                    <th className="text-right px-2 py-1 font-bold text-cyan-400">OOS Win%</th>
                  </>
                )}
                <th className="text-right px-2 py-1 font-bold">Last Hit</th>
                <th className="text-left px-2 py-1 font-bold">Now</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((band, idx) => {
                const tickers = currentTickersByIdx?.get(idx) ?? [];
                const hasPool = !!currentTickersByIdx;
                return (
                  <tr
                    key={idx}
                    className={`border-t border-border ${band.currentlyIn ? "bg-amber-500/10" : ""}`}
                  >
                    <td className="px-2 py-1 max-w-[460px]">
                      <div className="flex flex-col gap-0.5">
                        {band.parts.map((part, pIdx) => (
                          <span key={pIdx} className="text-foreground">
                            {part.display}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-1 text-right">{band.hits.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right">{(band.winRate * 100).toFixed(0)}%</td>
                    <td
                      className={`px-2 py-1 text-right font-bold ${
                        band.meanReturn > 0 ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      {fmtSigned(band.meanReturn)}
                    </td>
                    <td className="px-2 py-1 text-right">{fmtSigned(band.medianReturn)}</td>
                    <td className="px-2 py-1 text-right text-muted-foreground">
                      {fmtPct(band.stdReturn)}
                    </td>
                    <td
                      className={`px-2 py-1 text-right font-bold ${
                        band.lift > 0 ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      {fmtSigned(band.lift)}
                    </td>
                    <td className="px-2 py-1 text-right">{band.tStat.toFixed(2)}</td>
                    {showOos && (
                      <>
                        <td className="px-2 py-1 text-right border-l border-border">
                          {band.oosHits ?? 0}
                        </td>
                        <td
                          className={`px-2 py-1 text-right ${
                            (band.oosMean ?? 0) > 0
                              ? "text-emerald-400"
                              : (band.oosMean ?? 0) < 0
                              ? "text-red-400"
                              : "text-muted-foreground"
                          }`}
                        >
                          {band.oosMean !== undefined ? fmtSigned(band.oosMean) : "—"}
                        </td>
                        <td
                          className={`px-2 py-1 text-right font-bold ${
                            (band.oosLift ?? 0) > 0 && band.lift > 0
                              ? "text-emerald-400"
                              : (band.oosLift ?? 0) < 0 && band.lift < 0
                              ? "text-red-400"
                              : "text-amber-400"
                          }`}
                          title={
                            ((band.oosLift ?? 0) > 0 && band.lift > 0) ||
                            ((band.oosLift ?? 0) < 0 && band.lift < 0)
                              ? "Confirmed in OOS"
                              : "Sign flipped in OOS — weak edge"
                          }
                        >
                          {band.oosLift !== undefined ? fmtSigned(band.oosLift) : "—"}
                        </td>
                        <td className="px-2 py-1 text-right text-muted-foreground">
                          {band.oosWinRate !== undefined
                            ? `${(band.oosWinRate * 100).toFixed(0)}%`
                            : "—"}
                        </td>
                      </>
                    )}
                    <td className="px-2 py-1 text-right text-muted-foreground">
                      {band.lastDate ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-left">
                      {hasPool ? (
                        tickers.length > 0 ? (
                          <span
                            className="text-amber-500 font-bold"
                            title={tickers.join(", ")}
                          >
                            {tickers.slice(0, 3).join(", ")}
                            {tickers.length > 3 ? ` +${tickers.length - 3}` : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">·</span>
                        )
                      ) : band.currentlyIn ? (
                        <span className="text-amber-500 font-bold">●</span>
                      ) : (
                        <span className="text-muted-foreground/40">·</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// LiveSignalsPanel
function LiveSignalsPanel({
  result,
  poolExtras,
}: {
  result: RangeResult;
  poolExtras: PoolExtras;
}) {
  const tickerScores = useMemo(() => {
    const map = new Map<string, { longs: number; shorts: number }>();
    for (const [, tickers] of poolExtras.longsByTicker) {
      for (const t of tickers) {
        const e = map.get(t) ?? { longs: 0, shorts: 0 };
        e.longs++;
        map.set(t, e);
      }
    }
    for (const [, tickers] of poolExtras.shortsByTicker) {
      for (const t of tickers) {
        const e = map.get(t) ?? { longs: 0, shorts: 0 };
        e.shorts++;
        map.set(t, e);
      }
    }
    return Array.from(map.entries()).sort((a, b) => {
      const da = a[1].longs - a[1].shorts;
      const db = b[1].longs - b[1].shorts;
      if (da !== db) return db - da;
      return b[1].longs + b[1].shorts - (a[1].longs + a[1].shorts);
    });
  }, [poolExtras]);

  const longLeaning = tickerScores.filter(([, v]) => v.longs > 0 && v.longs >= v.shorts);
  const shortLeaning = tickerScores.filter(([, v]) => v.shorts > 0 && v.shorts > v.longs);

  if (tickerScores.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded text-[11px] font-mono text-muted-foreground">
        <span className="font-bold">Live Signals:</span>
        <span>No tickers currently sit in any qualifying band.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 bg-card border border-border rounded">
      <div className="flex items-center gap-2 text-[11px] font-mono">
        <span className="font-bold text-amber-400">Live Signals</span>
        <span className="text-muted-foreground">
          — tickers currently in qualifying bands ({longLeaning.length} long-leaning,{" "}
          {shortLeaning.length} short-leaning)
        </span>
      </div>
      {longLeaning.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider min-w-[44px]">
            Long
          </span>
          {longLeaning.map(([ticker, counts]) => (
            <span
              key={`L-${ticker}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-[10px] font-mono"
              title={`${counts.longs} long bands· ${counts.shorts} short bands`}
            >
              <span className="text-foreground font-bold">{ticker}</span>
              <span className="text-emerald-400">·{counts.longs}L</span>
              {counts.shorts > 0 && (
                <span className="text-red-400/80">{counts.shorts}S</span>
              )}
            </span>
          ))}
        </div>
      )}
      {shortLeaning.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-mono text-red-400 font-bold uppercase tracking-wider min-w-[44px]">
            Short
          </span>
          {shortLeaning.map(([ticker, counts]) => (
            <span
              key={`S-${ticker}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-[10px] font-mono"
              title={`${counts.shorts} short bands · ${counts.longs} long bands`}
            >
              <span className="text-foreground font-bold">{ticker}</span>
              <span className="text-red-400">·{counts.shorts}S</span>
              {counts.longs > 0 && (
                <span className="text-emerald-400/80">{counts.longs}L</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ResultPanel
function ResultPanel({
  result,
  mode,
  poolExtras,
  horizonDays,
  longLimit,
  shortLimit,
  setLongLimit,
  setShortLimit,
  tickerLabel,
}: {
  result: RangeResult;
  mode: RunMode;
  poolExtras: PoolExtras | null;
  horizonDays: number;
  longLimit: number;
  shortLimit: number;
  setLongLimit: (v: number) => void;
  setShortLimit: (v: number) => void;
  tickerLabel: string;
}) {
  const horizonLabel = HORIZON_OPTIONS.find((h) => h.days === horizonDays)?.label ?? `${horizonDays}d`;
  const hasWalkForward = !!result.walkForward;

  const handleExportCsv = useCallback(() => {
    const headers = [
      "Side",
      "Band",
      "Hits",
      "Win%",
      "MeanRet",
      "Med",
      "Std",
      "Lift",
      "tStat",
      "LastHit",
      "CurrentlyIn",
    ];
    if (hasWalkForward) headers.push("OOS_Hits", "OOS_Mean", "OOS_Lift", "OOS_Win%");
    if (mode === "pool") headers.push("Tickers_Now");

    const rows: (string | number)[][] = [headers];
    const appendBand = (band: Band, side: string, idx: number) => {
      const bandStr = band.parts.map((p) => p.display).join(" & ");
      const row: (string | number)[] = [
        side,
        bandStr,
        band.hits,
        (band.winRate * 100).toFixed(2),
        (band.meanReturn * 100).toFixed(3),
        (band.medianReturn * 100).toFixed(3),
        (band.stdReturn * 100).toFixed(3),
        (band.lift * 100).toFixed(3),
        band.tStat.toFixed(3),
        band.lastDate ?? "",
        band.currentlyIn ? "Y" : "",
      ];
      if (hasWalkForward) {
        row.push(
          band.oosHits ?? 0,
          band.oosMean !== undefined ? (band.oosMean * 100).toFixed(3) : "",
          band.oosLift !== undefined ? (band.oosLift * 100).toFixed(3) : "",
          band.oosWinRate !== undefined ? (band.oosWinRate * 100).toFixed(2) : ""
        );
      }
      if (mode === "pool" && poolExtras) {
        const tickers =
          side === "Long"
            ? poolExtras.longsByTicker.get(idx) ?? []
            : poolExtras.shortsByTicker.get(idx) ?? [];
        row.push(tickers.join(";"));
      }
      rows.push(row);
    };

    result.longs.forEach((b, i) => appendBand(b, "Long", i));
    result.shorts.forEach((b, i) => appendBand(b, "Short", i));

    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `range-opt-${tickerLabel || "results"}-${horizonLabel}-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }, [result, hasWalkForward, mode, poolExtras, tickerLabel, horizonLabel]);

  return (
    <div className="flex flex-col gap-3">
      {/* Summary bar */}
      <div className="flex items-center gap-3 px-2 py-1.5 bg-card border border-border rounded flex-wrap">
        <span className="text-[11px] font-mono text-muted-foreground">
          Baseline ({horizonLabel}):
        </span>
        <span className="text-[11px] font-mono font-bold">
          μ {fmtPct(result.baselineMean)} · σ {fmtPct(result.baselineStd)} · n{" "}
          {result.baselineN.toLocaleString()}
        </span>
        {hasWalkForward && result.oosBaselineMean !== undefined && result.oosBaselineN !== undefined && (
          <span className="text-[11px] font-mono text-cyan-400">
            OOS: μ {fmtPct(result.oosBaselineMean)} · n {result.oosBaselineN.toLocaleString()}
          </span>
        )}
        <span className="text-[10px] font-mono text-muted-foreground">
          {result.totalBuckets.toLocaleString()} buckets ·{" "}
          {mode === "pool" ? "pool / cross-sectional" : "single ticker"}
          {hasWalkForward && " · walk-forward"}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExportCsv}
          disabled={result.longs.length === 0 && result.shorts.length === 0}
          className="h-7 text-[11px] ml-auto"
        >
          <Download className="w-3.5 h-3.5 mr-1" />
          Export CSV
        </Button>
      </div>
      {/* Live signals for pool mode */}
      {mode === "pool" && poolExtras && (
        <LiveSignalsPanel result={result} poolExtras={poolExtras} />
      )}
      {/* Long bands */}
      <BandTable
        title="Long Bands"
        accent="green"
        bands={result.longs}
        limit={longLimit}
        setLimit={setLongLimit}
        currentTickersByIdx={poolExtras?.longsByTicker}
        showOos={hasWalkForward}
      />
      {/* Short bands */}
      <BandTable
        title="Short Bands"
        accent="red"
        bands={result.shorts}
        limit={shortLimit}
        setLimit={setShortLimit}
        currentTickersByIdx={poolExtras?.shortsByTicker}
        showOos={hasWalkForward}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RangeOptimizer() {
  const { universeTickers } = useUniverse();
  const [allTickers, setAllTickers] = useState<any[]>([]);

  useEffect(() => {
    getTickers().then((tickers) => {
      setAllTickers(tickers);
      if (tickers.length > 0) {
        setSelectedTicker((prev) => prev || tickers[0].ticker);
        setPairTickerB((prev) => prev || (tickers[1]?.ticker ?? tickers[0].ticker));
      }
    });
  }, []);

  const filteredByUniverse = useMemo(
    () => (universeTickers ? allTickers.filter((t) => universeTickers.has(t.ticker)) : allTickers),
    [allTickers, universeTickers]
  );

  // Mode
  const [mode, setMode] = useState<RunMode>("single");

  // Class filter (pool mode)
  const classFilter = useOptimizerClassFilter(filteredByUniverse, mode === "pool", "range-clf");
  const poolTickers = classFilter.filteredTickers;

  // Pair combo
  const pairCombo = usePairComboPicker(
    filteredByUniverse.map((t) => t.ticker),
    mode === "pairCombo",
    "range-pc"
  );

  // Ticker selectors
  const [selectedTicker, setSelectedTicker] = useState("");
  const [pairTickerA, setPairTickerA] = useState("");
  const [pairTickerB, setPairTickerB] = useState("");
  const [basketTickers, setBasketTickers] = useState<string[]>([]);
  const [basketMode, setBasketMode] = usePersistedState<"stocks" | "combined">(
    "range-basket-mode",
    "stocks"
  );

  const { baskets } = useBaskets() as any;

  // Indicators
  const [indicators, setIndicators] = useState<Indicator[]>(() => defaultIndicators());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(defaultIndicators().map((i) => i.id)));

  useEffect(() => {
    setSelectedIds(new Set(indicators.map((i) => i.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search params
  const [comboSize, setComboSize] = useState(2);
  const [bins, setBins] = useState(5);
  const [horizonDays, setHorizonDays] = useState(21);
  const [minHits, setMinHits] = useState(30);
  const [minLiftPct, setMinLiftPct] = useState(1.5);
  const [maxPoolTickers, setMaxPoolTickers] = useState(40);
  const [walkForwardEnabled, setWalkForwardEnabled] = useState(false);
  const [trainPct, setTrainPct] = useState(70);

  // Frequency
  const [isRunning, setIsRunning] = useState(false);
  const { frequency, setFrequency, frequencyUI } = useFrequency("range", "daily", isRunning);
  const freqMode = frequency === "weekly" ? "weekly" : "daily";

  // Progress
  const [progress, setProgress] = useState<ProgressState>({
    current: 0,
    total: 0,
    stage: "",
    fetched: 0,
    fetchTotal: 0,
  });

  // Persisted input selection
  const [inputSelection, setInputSelection] = usePersistedState<any>(
    "range-input-selection",
    DEFAULT_INPUT_SELECTION
  );

  // Persisted result
  const [result, setResult] = usePersistedState<RangeResult | null>("range:result", null);

  // Transient state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [poolExtras, setPoolExtras] = useState<PoolExtras | null>(null);
  const [longLimit, setLongLimit] = useState(25);
  const [shortLimit, setShortLimit] = useState(25);
  const [editingIndicator, setEditingIndicator] = useState<Indicator | null>(null);

  // Worker
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const getWorker = () => {
    if (!workerRef.current) workerRef.current = createWorker();
    return workerRef.current;
  };

  // Workspace tab
  const captureInputs = useCallback(
    () => ({
      mode,
      selectedTicker,
      pairTickerA,
      pairTickerB,
      basketTickers,
      basketMode,
      indicators,
      selectedIds: Array.from(selectedIds),
      comboSize,
      bins,
      horizonDays,
      minHits,
      minLiftPct,
      maxPoolTickers,
      walkForwardEnabled,
      trainPct,
      frequency,
      pairCombo: pairCombo.serialize(),
      inputSelection,
    }),
    [
      mode,
      selectedTicker,
      pairTickerA,
      pairTickerB,
      basketTickers,
      basketMode,
      indicators,
      selectedIds,
      comboSize,
      bins,
      horizonDays,
      minHits,
      minLiftPct,
      maxPoolTickers,
      walkForwardEnabled,
      trainPct,
      frequency,
      pairCombo,
      inputSelection,
    ]
  );

  const applyInputs = useCallback(
    (saved: any) => {
      if (!saved) return;
      if (
        saved.mode === "single" ||
        saved.mode === "pool" ||
        saved.mode === "pair" ||
        saved.mode === "pairCombo" ||
        saved.mode === "basket"
      ) {
        setMode(saved.mode);
      }
      if (saved.pairCombo) pairCombo.hydrate(saved.pairCombo);
      if (typeof saved.pairTickerA === "string") setPairTickerA(saved.pairTickerA);
      if (typeof saved.pairTickerB === "string") setPairTickerB(saved.pairTickerB);
      if (Array.isArray(saved.basketTickers)) {
        setBasketTickers(saved.basketTickers.filter((t: any) => typeof t === "string"));
      }
      if (saved.basketMode === "stocks" || saved.basketMode === "combined") {
        setBasketMode(saved.basketMode);
      }
      if (saved.selectedTicker) setSelectedTicker(saved.selectedTicker);
      if (Array.isArray(saved.indicators) && saved.indicators.length > 0) {
        const restored = saved.indicators.map((p: any) => {
          const base = createIndicator(p.kind, p);
          return { ...base, ...p, label: getIndicatorLabel({ ...base, ...p }), id: p.id ?? genId() };
        });
        setIndicators(restored);
      }
      if (Array.isArray(saved.selectedIds)) setSelectedIds(new Set(saved.selectedIds));
      if (saved.comboSize === 2 || saved.comboSize === 3) setComboSize(saved.comboSize);
      if (typeof saved.bins === "number") setBins(saved.bins);
      if (typeof saved.horizonDays === "number") setHorizonDays(saved.horizonDays);
      if (typeof saved.minHits === "number") setMinHits(saved.minHits);
      if (typeof saved.minLiftPct === "number") setMinLiftPct(saved.minLiftPct);
      if (typeof saved.maxPoolTickers === "number") setMaxPoolTickers(saved.maxPoolTickers);
      if (typeof saved.walkForwardEnabled === "boolean") setWalkForwardEnabled(saved.walkForwardEnabled);
      if (typeof saved.trainPct === "number") setTrainPct(saved.trainPct);
      if (
        saved.frequency === "daily" ||
        saved.frequency === "weekly" ||
        saved.frequency === "weekly_on_daily"
      ) {
        setFrequency(saved.frequency);
      } else if (saved.timeframe === "weekly") {
        setFrequency("weekly");
      }
      if (saved.inputSelection && typeof saved.inputSelection === "object") {
        const sel = saved.inputSelection;
        if (sel.kind === "close") {
          setInputSelection({ kind: "close" });
        } else if (sel.kind === "workbook" && typeof sel.metric === "string") {
          setInputSelection({ kind: "workbook", metric: sel.metric });
        }
      }
    },
    [setFrequency, setInputSelection, setBasketMode, pairCombo]
  );

  useWorkspaceTab("range-optimizer", captureInputs, applyInputs);

  // Active indicators (selected only)
  const activeIndicators = useMemo(
    () => indicators.filter((i) => selectedIds.has(i.id)),
    [indicators, selectedIds]
  );

  // Grouped kinds for dropdown
  const groupedKinds = useMemo(() => {
    const map: Record<string, typeof INDICATOR_KINDS> = {};
    for (const item of INDICATOR_KINDS) {
      if (!map[item.group]) map[item.group] = [];
      map[item.group].push(item);
    }
    return map;
  }, []);

  // Combo count preview
  const comboCount = useMemo(() => {
    const n = activeIndicators.length;
    const k = comboSize;
    if (n < k) return 0;
    let num = 1, den = 1;
    for (let i = 0; i < k; i++) { num *= n - i; den *= i + 1; }
    return Math.round(num / den);
  }, [activeIndicators.length, comboSize]);

  // Indicator CRUD
  const toggleIndicator = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addIndicator = (kind: IndicatorKind) => {
    const ind = createIndicator(kind);
    setIndicators((prev) => [...prev, ind]);
    setSelectedIds((prev) => new Set([...prev, ind.id]));
    setEditingIndicator(ind);
  };

  const removeIndicator = (id: string) => {
    setIndicators((prev) => prev.filter((i) => i.id !== id));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const saveIndicator = (updated: Indicator) => {
    const withLabel = {
      ...updated,
      label: getIndicatorLabel(updated),
      fmt: updated.fmt ?? getFmtType(updated.kind),
    };
    setIndicators((prev) => prev.map((i) => (i.id === withLabel.id ? withLabel : i)));
  };

  // Worker dispatch
  const dispatchWorker = (payload: any, transfers: ArrayBuffer[]): Promise<void> => {
    return new Promise((resolve, reject) => {
      const worker = getWorker();
      const id = ++runIdRef.current;
      const onMsg = (e: MessageEvent) => {
        const data = e.data;
        if (!data || data.id !== id) return;
        if (data.type === "progress") {
          setProgress((p) => ({ ...p, current: data.done, total: data.total, stage: "search" }));
        } else if (data.type === "result") {
          worker.removeEventListener("message", onMsg);
          setResult(data.result);
          if (data.result.longsByTicker || data.result.shortsByTicker) {
            setPoolExtras({
              longsByTicker: new Map(data.result.longsByTicker ?? []),
              shortsByTicker: new Map(data.result.shortsByTicker ?? []),
            });
          } else {
            setPoolExtras(null);
          }
          resolve();
        } else if (data.type === "error") {
          worker.removeEventListener("message", onMsg);
          reject(new Error(data.error));
        }
      };
      worker.addEventListener("message", onMsg);
      const msg = { type: "run", id, payload };
      try {
        worker.postMessage(msg, transfers);
      } catch {
        worker.postMessage(msg);
      }
    });
  };

  // Run handlers
  const runSingle = async () => {
    if (!selectedTicker) {
      setErrorMsg("Select a ticker.");
      return;
    }
    const raw = await getTickerRaw(selectedTicker);
    if (!raw) throw new Error(`No Yahoo data for ${selectedTicker}.`);

    const n = raw.adjCloses.length;
    const adjHighs = new Array(n);
    const adjLows = new Array(n);
    for (let i = 0; i < n; i++) {
      const c = raw.closes[i];
      const ac = raw.adjCloses[i];
      const ratio = Number.isFinite(c) && c > 0 && Number.isFinite(ac) ? ac / c : 1;
      adjHighs[i] = raw.highs[i] * ratio;
      adjLows[i] = raw.lows[i] * ratio;
    }

    const ds = weeklyDownsampleObj(
      {
        dates: raw.dates,
        opens: raw.opens,
        highs: adjHighs,
        lows: adjLows,
        closes: raw.adjCloses,
        adjCloses: raw.adjCloses,
        volumes: raw.volumes,
      },
      freqMode
    );

    const warmup = freqMode === "weekly" ? 52 : 252;
    if (ds.adjCloses.length < warmup) {
      throw new Error(`Insufficient history for ${selectedTicker} (need ≥${warmup} ${freqMode} bars).`);
    }

    setProgress({ current: 0, total: 0, stage: "compute", fetched: 1, fetchTotal: 1 });

    const cache = makeCache();
    const seriesList = activeIndicators.map((ind) =>
      computeIndicatorSeries(ind, ds.adjCloses, ds.highs, ds.lows, cache)
    );
    const flat = flattenFeatureMatrix(seriesList, ds.adjCloses.length);

    const payload = {
      mode: "single",
      features: activeIndicators,
      horizonDays,
      bins,
      comboSize,
      minHits,
      minLift: minLiftPct / 100,
      warmupBars: warmup,
      walkForward: walkForwardEnabled ? { enabled: true, trainPct: trainPct / 100 } : undefined,
      single: {
        closes: ds.adjCloses,
        dates: ds.dates,
        featureSeriesFlat: flat,
        featureSeriesLen: ds.adjCloses.length,
      },
    };
    await dispatchWorker(payload, [flat.buffer]);
  };

  const runPair = async () => {
    if (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB) {
      setErrorMsg("Select two distinct tickers for pair mode.");
      return;
    }
    const dates = await getDates();
    const ratio = await (getYahooPairsRatio as any)(pairTickerA, pairTickerB, dates);
    if (!ratio || ratio.indices.length < 252) {
      throw new Error(`Insufficient pair-ratio history for ${pairTickerA}/${pairTickerB} (need ≥252 daily bars).`);
    }

    const prices = ratio.prices.slice();
    const highs = prices.slice();
    const lows = prices.slice();
    const ratDates = ratio.indices.map((i: number) => dates[i] || "");

    setProgress({ current: 0, total: 0, stage: "compute", fetched: 1, fetchTotal: 1 });

    const cache = makeCache();
    const seriesList = activeIndicators.map((ind) =>
      computeIndicatorSeries(ind, prices, highs, lows, cache)
    );
    const flat = flattenFeatureMatrix(seriesList, prices.length);

    const payload = {
      mode: "single",
      features: activeIndicators,
      horizonDays,
      bins,
      comboSize,
      minHits,
      minLift: minLiftPct / 100,
      warmupBars: 252,
      walkForward: walkForwardEnabled ? { enabled: true, trainPct: trainPct / 100 } : undefined,
      single: {
        closes: prices,
        dates: ratDates,
        featureSeriesFlat: flat,
        featureSeriesLen: prices.length,
      },
    };
    await dispatchWorker(payload, [flat.buffer]);
  };

  const runPairCombo = async () => {
    if (pairCombo.pairs.length === 0) {
      throw new Error("Select at least one pair in the leg set.");
    }
    const dates = await getDates();
    setProgress({ current: 0, total: 0, stage: "fetch", fetched: 0, fetchTotal: pairCombo.pairs.length });

    const CONCURRENCY = 5;
    const poolItems: any[] = [];
    let fetched = 0;
    const WARMUP = 252;

    const processPair = async (pair: any) => {
      try {
        const ratio = await (getYahooPairsRatio as any)(pair.a, pair.b, dates);
        if (!ratio || ratio.indices.length < WARMUP) return;
        const prices = ratio.prices.slice();
        const highs = prices.slice();
        const lows = prices.slice();
        const ratDates = ratio.indices.map((i: number) => dates[i] || "");
        const cache = makeCache();
        const seriesList = activeIndicators.map((ind) =>
          computeIndicatorSeries(ind, prices, highs, lows, cache)
        );
        const flat = flattenFeatureMatrix(seriesList, prices.length);
        poolItems.push({
          ticker: pair.label,
          closes: prices,
          dates: ratDates,
          featureSeriesFlat: flat,
          featureSeriesLen: prices.length,
        });
      } catch { /* skip */ } finally {
        fetched++;
        setProgress((p) => ({ ...p, fetched }));
      }
    };

    const queue = [...pairCombo.pairs];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const pair = queue.shift();
        if (!pair) break;
        await processPair(pair);
      }
    });
    await Promise.all(workers);

    if (poolItems.length === 0) {
      throw new Error("No pair combos had sufficient ratio history (need ≥252 daily bars).");
    }

    setProgress({ current: 0, total: 0, stage: "search", fetched: poolItems.length, fetchTotal: poolItems.length });

    const transfers = poolItems.map((p) => p.featureSeriesFlat.buffer);
    const payload = {
      mode: "pool",
      features: activeIndicators,
      horizonDays,
      bins,
      comboSize,
      minHits,
      minLift: minLiftPct / 100,
      warmupBars: WARMUP,
      pool: poolItems,
    };
    await dispatchWorker(payload, transfers);
  };

  const runPool = async () => {
    if (poolTickers.length === 0) {
      throw new Error("No tickers available — adjust your universe/classification filter.");
    }
    const tickersToRun = poolTickers.slice(0, maxPoolTickers);
    setProgress({ current: 0, total: 0, stage: "fetch", fetched: 0, fetchTotal: tickersToRun.length });

    const CONCURRENCY = 5;
    const WARMUP = freqMode === "weekly" ? 52 : 252;
    const poolItems: any[] = [];
    let fetched = 0;

    const processTicker = async (ticker: string) => {
      try {
        const raw = await getTickerRaw(ticker);
        if (!raw) return;
        const n = raw.adjCloses.length;
        const adjHighs = new Array(n);
        const adjLows = new Array(n);
        for (let i = 0; i < n; i++) {
          const c = raw.closes[i];
          const ac = raw.adjCloses[i];
          const ratio = Number.isFinite(c) && c > 0 && Number.isFinite(ac) ? ac / c : 1;
          adjHighs[i] = raw.highs[i] * ratio;
          adjLows[i] = raw.lows[i] * ratio;
        }
        const ds = weeklyDownsampleObj(
          {
            dates: raw.dates,
            opens: raw.opens,
            highs: adjHighs,
            lows: adjLows,
            closes: raw.adjCloses,
            adjCloses: raw.adjCloses,
            volumes: raw.volumes,
          },
          freqMode
        );
        if (ds.adjCloses.length < WARMUP) return;
        const cache = makeCache();
        const seriesList = activeIndicators.map((ind) =>
          computeIndicatorSeries(ind, ds.adjCloses, ds.highs, ds.lows, cache)
        );
        const flat = flattenFeatureMatrix(seriesList, ds.adjCloses.length);
        poolItems.push({
          ticker,
          closes: ds.adjCloses,
          dates: ds.dates,
          featureSeriesFlat: flat,
          featureSeriesLen: ds.adjCloses.length,
        });
      } catch { /* skip */ } finally {
        fetched++;
        setProgress((p) => ({ ...p, fetched }));
      }
    };

    const tickerQueue = tickersToRun.map((t: any) => t.ticker);
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (tickerQueue.length > 0) {
        const ticker = tickerQueue.shift();
        if (!ticker) break;
        await processTicker(ticker);
      }
    });
    await Promise.all(workers);

    if (poolItems.length === 0) throw new Error("No tickers had sufficient Yahoo history.");

    setProgress({ current: 0, total: 0, stage: "search", fetched: poolItems.length, fetchTotal: poolItems.length });

    const transfers = poolItems.map((p) => p.featureSeriesFlat.buffer);
    const payload = {
      mode: "pool",
      features: activeIndicators,
      horizonDays,
      bins,
      comboSize,
      minHits,
      minLift: minLiftPct / 100,
      warmupBars: WARMUP,
      pool: poolItems,
    };
    await dispatchWorker(payload, transfers);
  };

  const runBasket = async () => {
    if (basketTickers.length === 0) throw new Error("No basket tickers selected.");

    if (basketMode === "combined") {
      const basketDef = buildBasketOhlc as any;
      setProgress({ current: 0, total: 0, stage: "fetch", fetched: 0, fetchTotal: 1 });
      const combined = await (getBasketOhlc as any)(basketTickers, baskets);
      if (!combined || combined.closes.length < 252) {
        throw new Error("Insufficient history for basket combined series (need ≥252 bars).");
      }
      setProgress({ current: 0, total: 0, stage: "fetch", fetched: 1, fetchTotal: 1 });

      const WARMUP = 252;
      const cache = makeCache();
      const seriesList = activeIndicators.map((ind) =>
        computeIndicatorSeries(ind, combined.closes, combined.highs, combined.lows, cache)
      );
      const flat = flattenFeatureMatrix(seriesList, combined.closes.length);

      setProgress({ current: 0, total: 0, stage: "search", fetched: 1, fetchTotal: 1 });

      const payload = {
        mode: "single",
        features: activeIndicators,
        horizonDays,
        bins,
        comboSize,
        minHits,
        minLift: minLiftPct / 100,
        warmupBars: WARMUP,
        walkForward: walkForwardEnabled ? { enabled: true, trainPct: trainPct / 100 } : undefined,
        single: {
          closes: combined.closes,
          dates: combined.priceDates,
          featureSeriesFlat: flat,
          featureSeriesLen: combined.closes.length,
        },
      };
      await dispatchWorker(payload, [flat.buffer]);
      return;
    }

    // Stock-by-stock basket
    setProgress({ current: 0, total: 0, stage: "fetch", fetched: 0, fetchTotal: basketTickers.length });

    const CONCURRENCY = 5;
    const WARMUP = freqMode === "weekly" ? 52 : 252;
    const poolItems: any[] = [];
    let fetched = 0;

    const processTicker = async (ticker: string) => {
      try {
        const raw = await getTickerRaw(ticker);
        if (!raw) return;
        const n = raw.adjCloses.length;
        const adjHighs = new Array(n);
        const adjLows = new Array(n);
        for (let i = 0; i < n; i++) {
          const c = raw.closes[i];
          const ac = raw.adjCloses[i];
          const ratio = Number.isFinite(c) && c > 0 && Number.isFinite(ac) ? ac / c : 1;
          adjHighs[i] = raw.highs[i] * ratio;
          adjLows[i] = raw.lows[i] * ratio;
        }
        const ds = weeklyDownsampleObj(
          {
            dates: raw.dates,
            opens: raw.opens,
            highs: adjHighs,
            lows: adjLows,
            closes: raw.adjCloses,
            adjCloses: raw.adjCloses,
            volumes: raw.volumes,
          },
          freqMode
        );
        if (ds.adjCloses.length < WARMUP) return;
        const cache = makeCache();
        const seriesList = activeIndicators.map((ind) =>
          computeIndicatorSeries(ind, ds.adjCloses, ds.highs, ds.lows, cache)
        );
        const flat = flattenFeatureMatrix(seriesList, ds.adjCloses.length);
        poolItems.push({
          ticker,
          closes: ds.adjCloses,
          dates: ds.dates,
          featureSeriesFlat: flat,
          featureSeriesLen: ds.adjCloses.length,
        });
      } catch { /* skip */ } finally {
        fetched++;
        setProgress((p) => ({ ...p, fetched }));
      }
    };

    const tickerQueue = [...basketTickers];
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (tickerQueue.length > 0) {
        const ticker = tickerQueue.shift();
        if (!ticker) break;
        await processTicker(ticker);
      }
    });
    await Promise.all(workers);

    if (poolItems.length === 0) throw new Error("No basket tickers had sufficient Yahoo history.");

    setProgress({ current: 0, total: 0, stage: "search", fetched: poolItems.length, fetchTotal: poolItems.length });

    const transfers = poolItems.map((p) => p.featureSeriesFlat.buffer);
    const payload = {
      mode: "pool",
      features: activeIndicators,
      horizonDays,
      bins,
      comboSize,
      minHits,
      minLift: minLiftPct / 100,
      warmupBars: WARMUP,
      pool: poolItems,
    };
    await dispatchWorker(payload, transfers);
  };

  const handleRun = async () => {
    if (activeIndicators.length < comboSize) {
      setErrorMsg(`Select at least ${comboSize} indicators.`);
      return;
    }
    setErrorMsg(null);
    setResult(null);
    setPoolExtras(null);
    setIsRunning(true);
    setProgress({ current: 0, total: 0, stage: "", fetched: 0, fetchTotal: 0 });
    try {
      if (mode === "single") await runSingle();
      else if (mode === "pair") await runPair();
      else if (mode === "pairCombo") await runPairCombo();
      else if (mode === "basket") await runBasket();
      else await runPool();
    } catch (err: any) {
      setErrorMsg(err?.message ?? String(err));
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancel = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setIsRunning(false);
  };

  // Run disabled logic
  const runDisabled =
    activeIndicators.length < comboSize ||
    (mode === "single" && !selectedTicker) ||
    (mode === "pair" && (!pairTickerA || !pairTickerB || pairTickerA === pairTickerB)) ||
    (mode === "basket" && basketTickers.length === 0) ||
    (mode === "pairCombo" && pairCombo.pairs.length === 0);

  return (
    <div className="flex flex-col gap-3 p-3 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold tracking-tight">Range Optimizer</h1>
        <p className="text-[11px] font-mono text-muted-foreground">
          Discover combinations of indicator value ranges where forward returns are systematically
          better (long bands) or worse (short bands) than baseline. Build any combination of RSI,
          ROC, Stochastic, MA-based features, and HARSI bands — quantile-bucketed across selected
          indicators; uses Yahoo adjusted closes only.
        </p>
      </div>

      {/* PresetBar */}
      <PresetBar
        kind="range"
        captureInputs={() => captureInputs()}
        applyInputs={(s: any) => applyInputs(s)}
      />

      {/* Mode selector */}
      <div className="flex items-center gap-0 bg-card border border-border rounded p-0.5 self-start">
        {(["single", "pool", "pair", "pairCombo", "basket"] as RunMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            disabled={isRunning}
            data-testid={`optimizer-mode-${m}`}
            className={`text-[11px] font-mono px-3 py-1 rounded ${
              mode === m
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {m === "single"
              ? "Single Ticker"
              : m === "pool"
              ? "Pool Universe"
              : m === "pair"
              ? "Pair (A/B)"
              : m === "pairCombo"
              ? "Pair Combo"
              : "Basket"}
          </button>
        ))}
        <span className="text-[10px] font-mono text-muted-foreground ml-2 pr-2">
          {mode === "single"
            ? "Bands learned from one stock's history"
            : mode === "pair"
            ? `Bands learned from ratio ${pairTickerA || "A"}/${pairTickerB || "B"} (daily only)`
            : mode === "pairCombo"
            ? `Bands learned across ${pairCombo.pairs.length} pair${pairCombo.pairs.length !== 1 ? "s" : ""} (daily only)`
            : mode === "basket"
            ? `Basket of ${basketTickers.length} ticker${basketTickers.length !== 1 ? "s" : ""}`
            : `Bands learned across ${Math.min(maxPoolTickers, poolTickers.length)} tickers${
                classFilter.hasActiveFilters ? " (filtered)" : ""
              }`}
        </span>
      </div>

      {/* Pool classification filter */}
      {mode === "pool" && classFilter.classFilterUI && (
        <div className="flex flex-col gap-1 p-2 bg-card border border-border rounded">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            Classification Filter
          </label>
          {classFilter.universeSourceUI}
          {classFilter.classFilterUI}
        </div>
      )}

      {/* Controls bar */}
      <div className="flex flex-wrap items-end gap-3 p-2 bg-card border border-border rounded">
        {mode !== "pair" && mode !== "pairCombo" && frequencyUI}

        {/* Ticker picker by mode */}
        {mode === "single" ? (
          <div className="flex items-end gap-2">
            <div className={isBasketTicker(selectedTicker) ? "opacity-40 pointer-events-none" : ""}>
              <UnifiedTickerPicker
                tickers={filteredByUniverse}
                value={isBasketTicker(selectedTicker) ? "" : selectedTicker}
                onChange={setSelectedTicker}
                disabled={isRunning}
                label="Ticker"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                Basket
              </label>
              <BasketTickerPill
                activeTicker={selectedTicker}
                onSelectTicker={setSelectedTicker}
                fallbackTicker={filteredByUniverse[0]?.ticker ?? null}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                Input Series
              </label>
              <InputSeriesSelector
                value={inputSelection}
                onChange={setInputSelection}
                family="range"
                label=""
              />
            </div>
          </div>
        ) : mode === "pair" ? (
          <div className="flex items-end gap-2">
            <UnifiedTickerPicker
              tickers={filteredByUniverse}
              value={pairTickerA}
              onChange={setPairTickerA}
              disabled={isRunning}
              label="A"
            />
            <UnifiedTickerPicker
              tickers={filteredByUniverse}
              value={pairTickerB}
              onChange={setPairTickerB}
              disabled={isRunning}
              label="B"
            />
          </div>
        ) : mode === "pairCombo" ? (
          <div className="flex flex-col gap-1 w-full">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              Pair Combo — Leg Set
            </label>
            {pairCombo.ui}
          </div>
        ) : mode === "basket" ? (
          <div className="flex flex-col gap-2">
            <BasketPicker
              tickers={filteredByUniverse}
              value={basketTickers}
              onChange={setBasketTickers}
              disabled={isRunning}
              testIdPrefix="range-basket"
            />
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
                Basket Run Mode
              </label>
              <div className="flex gap-px" data-testid="range-basket-mode">
                {(["stocks", "combined"] as const).map((bm) => (
                  <button
                    key={bm}
                    data-testid={`range-basket-mode-${bm}`}
                    className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                      basketMode === bm
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground border border-border"
                    }`}
                    onClick={() => setBasketMode(bm)}
                    disabled={isRunning}
                    title={
                      bm === "stocks"
                        ? "Run optimizer on each basket constituent separately"
                        : "Run optimizer on a single synthetic series using the basket's weighting scheme"
                    }
                  >
                    {bm === "stocks" ? "Stock by Stock" : "Combined"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Pool size */
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
              Pool Size
            </label>
            <input
              type="number"
              min={5}
              max={Math.max(5, poolTickers.length)}
              value={maxPoolTickers}
              onChange={(e) => setMaxPoolTickers(Math.max(5, parseInt(e.target.value, 10) || 40))}
              disabled={isRunning}
              className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-20"
            />
            <span className="text-[9px] font-mono text-muted-foreground">
              of {poolTickers.length}
              {classFilter.hasActiveFilters ? ` filtered (${filteredByUniverse.length} total)` : " in universe"}
            </span>
          </div>
        )}

        {/* Combo Size */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            Combo Size
          </label>
          <select
            className="text-xs font-mono bg-background border border-border rounded px-2 py-1"
            value={comboSize}
            onChange={(e) => setComboSize(parseInt(e.target.value, 10))}
            disabled={isRunning}
          >
            <option value={2}>2 indicators</option>
            <option value={3}>3 indicators</option>
          </select>
        </div>

        {/* Bins */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            Bins
          </label>
          <select
            className="text-xs font-mono bg-background border border-border rounded px-2 py-1"
            value={bins}
            onChange={(e) => setBins(parseInt(e.target.value, 10))}
            disabled={isRunning}
          >
            <option value={3}>3 (terciles)</option>
            <option value={4}>4 (quartiles)</option>
            <option value={5}>5 (quintiles)</option>
            <option value={10}>10 (deciles)</option>
          </select>
        </div>

        {/* Horizon */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            Horizon
          </label>
          <select
            className="text-xs font-mono bg-background border border-border rounded px-2 py-1"
            value={horizonDays}
            onChange={(e) => setHorizonDays(parseInt(e.target.value, 10))}
            disabled={isRunning}
          >
            {HORIZON_OPTIONS.map((h) => (
              <option key={h.days} value={h.days}>
                {h.label} ({h.days}d)
              </option>
            ))}
          </select>
        </div>

        {/* Min Hits */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            Min Hits
          </label>
          <input
            type="number"
            min={5}
            max={5000}
            value={minHits}
            onChange={(e) => setMinHits(Math.max(5, parseInt(e.target.value, 10) || 30))}
            disabled={isRunning}
            className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-20"
          />
        </div>

        {/* Min Lift */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            Min Lift (%)
          </label>
          <input
            type="number"
            step="0.1"
            min={0}
            max={50}
            value={minLiftPct}
            onChange={(e) => setMinLiftPct(Math.max(0, parseFloat(e.target.value) || 0))}
            disabled={isRunning}
            className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-20"
          />
        </div>

        {/* Walk-Forward */}
        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            Walk-Forward
          </label>
          <div className="flex items-center gap-1.5 h-7">
            {mode === "single" ? (
              <>
                <label className="flex items-center gap-1 text-[11px] font-mono">
                  <input
                    type="checkbox"
                    checked={walkForwardEnabled}
                    onChange={(e) => setWalkForwardEnabled(e.target.checked)}
                    disabled={isRunning}
                    className="accent-primary"
                  />
                  IS/OOS
                </label>
                {walkForwardEnabled && (
                  <>
                    <input
                      type="number"
                      min={30}
                      max={95}
                      value={trainPct}
                      onChange={(e) =>
                        setTrainPct(Math.min(95, Math.max(30, parseInt(e.target.value, 10) || 70)))
                      }
                      disabled={isRunning}
                      className="text-xs font-mono bg-background border border-border rounded px-1 py-0.5 w-12"
                      title="Train %"
                    />
                    <span className="text-[10px] font-mono text-muted-foreground">% train</span>
                  </>
                )}
              </>
            ) : (
              <span
                className="text-[10px] font-mono text-muted-foreground italic"
                title="Walk-forward requires per-ticker split which is not implemented for pooled cross-sectional search."
              >
                Single mode only
              </span>
            )}
          </div>
        </div>

        {/* Run / Cancel */}
        {isRunning ? (
          <Button size="sm" variant="destructive" onClick={handleCancel} className="h-8">
            <X className="w-3.5 h-3.5 mr-1" />
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            variant="default"
            onClick={handleRun}
            disabled={runDisabled}
            className="h-8"
          >
            <Play className="w-3.5 h-3.5 mr-1" />
            Run Search
          </Button>
        )}

        {/* Combo preview */}
        {comboCount > 0 && !isRunning && (
          <div className="text-[10px] font-mono text-muted-foreground self-end pb-2">
            {comboCount} combo{comboCount === 1 ? "" : "s"} × {Math.pow(bins, comboSize)} buckets each
          </div>
        )}

        {/* Progress */}
        {isRunning && (
          <div className="text-[10px] font-mono text-muted-foreground self-end pb-2 flex flex-col gap-0.5">
            {progress.stage === "fetch" && (
              <span>
                Fetching prices: {progress.fetched}/{progress.fetchTotal}
              </span>
            )}
            {progress.stage === "compute" && <span>Computing features…</span>}
            {progress.stage === "search" && progress.total > 0 && (
              <span>
                Searching: {progress.current}/{progress.total} combos
              </span>
            )}
            {progress.stage === "search" && progress.total === 0 && <span>Searching…</span>}
          </div>
        )}
      </div>

      {/* Indicator panel */}
      <IndicatorPanel
        indicators={indicators}
        selectedIds={selectedIds}
        groupedKinds={groupedKinds}
        toggle={toggleIndicator}
        onAdd={addIndicator}
        onRemove={removeIndicator}
        onEdit={(ind) => setEditingIndicator(ind)}
        disabled={isRunning}
      />

      {/* Edit modal */}
      {editingIndicator && (
        <IndicatorEditModal
          indicator={editingIndicator}
          onClose={() => setEditingIndicator(null)}
          onSave={(updated) => {
            saveIndicator(updated);
            setEditingIndicator(null);
          }}
        />
      )}

      {/* Error */}
      {errorMsg && (
        <div className="text-[11px] font-mono text-red-500 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
          {errorMsg}
        </div>
      )}

      {/* Results */}
      {result && (
        <ResultPanel
          result={result}
          mode={mode}
          poolExtras={poolExtras}
          horizonDays={horizonDays}
          longLimit={longLimit}
          shortLimit={shortLimit}
          setLongLimit={setLongLimit}
          setShortLimit={setShortLimit}
          tickerLabel={
            mode === "single"
              ? selectedTicker
              : mode === "pair"
              ? `${pairTickerA}/${pairTickerB}`
              : mode === "pairCombo"
              ? `pair-combo-${pairCombo.pairs.length}`
              : mode === "basket"
              ? `basket-${basketTickers.length}`
              : `pool-${poolTickers.length}`
          }
        />
      )}
    </div>
  );
}
