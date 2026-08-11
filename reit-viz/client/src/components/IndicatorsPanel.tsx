import { useState, useEffect, useRef, type ReactNode } from "react";

import { ResizableSidebar } from "@/components/ResizableSidebar";
import { X, TrendingUp, Copy, ChevronsDownUp, ChevronsUpDown, ChevronDown, Palette, RotateCcw, Plus, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DateInput from "@/components/DateInput";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { indicatorPeriods } from "./ChartPane";
import type { ActiveIndicators, IndicatorOverlay } from "./ChartPane";
import { FindBestMAPanel } from "./FindBestMAPanel";
import type { PaneInfo } from "@/pages/Dashboard";
import type { HASmoothType, HASmoothConfig } from "@/lib/indicators";
import { computeAcfSweep, type AcfSweepEntry, type OhlcBar } from "@/lib/indicators";
import { loadMaInput, type FindBestMaInput } from "@/lib/findBestMA";
import { getTickers } from "@/lib/dataService";
import {
  ALL_REGISTRY_INDICATORS,
  PANE_INDICATORS,
  getIndicatorDef,
  resolveParams,
  resampleIndicatorBars,
  autocorrSourceFromParam,
  type IndicatorDef,
  type RegistryIndicatorState,
} from "@/lib/indicatorRegistry";
import { INDICATOR_COLORS, MA_LINE_STYLES, MA_LINE_STYLE_LABELS, MA_OPACITY_STEPS, type MaLineStyle } from "@/lib/chartColors";
import { useIndicatorColors, type IndicatorColorKey } from "@/lib/indicatorColorsContext";
import { loadServerPref, saveServerPref } from "@/lib/serverPrefs";
import PatternsPanel from "./PatternsPanel";

// ── Indicator sets: named ActiveIndicators snapshots, server-synced ──────
// Saved from whichever pane is selected; applying writes the whole set onto
// the selected pane (or all panes when "Apply to all panes" is on). Stored in
// the server prefs KV so the same sets are available on every computer.
export interface IndicatorSet {
  id: string;
  name: string;
  indicators: ActiveIndicators;
}
const INDICATOR_SETS_KEY = "reit-viz:indicator-sets";
function loadIndicatorSets(): IndicatorSet[] {
  try {
    const raw = JSON.parse(localStorage.getItem(INDICATOR_SETS_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * Reusable "Indicator Sets" block — save the active indicators as a named,
 * server-synced set and apply/delete saved sets. Rendered by EVERY indicators
 * panel in the app (the shared IndicatorsPanel used on Charts/Correlation/
 * Macro, and the Pairs page's own panel) so the same sets are available
 * everywhere. The host decides what "apply" targets via onApply.
 */
export function IndicatorSetsSection({
  activeIndicators,
  onApply,
  applyHint = "",
}: {
  activeIndicators: ActiveIndicators;
  onApply: (indicators: ActiveIndicators) => void;
  /** Appended to the apply tooltip, e.g. " to ALL panes". */
  applyHint?: string;
}) {
  const [indicatorSets, setIndicatorSets] = useState<IndicatorSet[]>(() => loadIndicatorSets());
  const [setName, setSetName] = useState("");
  useEffect(() => {
    let cancelled = false;
    void loadServerPref<IndicatorSet[]>(INDICATOR_SETS_KEY).then((srv) => {
      if (!cancelled && Array.isArray(srv)) setIndicatorSets(srv);
    });
    return () => { cancelled = true; };
  }, []);
  const saveIndicatorSet = () => {
    const name = setName.trim() || `Set ${indicatorSets.length + 1}`;
    const s: IndicatorSet = { id: `is-${Date.now()}`, name, indicators: activeIndicators };
    const next = [...indicatorSets.filter((x) => x.name !== name), s];
    setIndicatorSets(next);
    saveServerPref(INDICATOR_SETS_KEY, next);
    setSetName("");
  };
  const deleteIndicatorSet = (id: string) => {
    const next = indicatorSets.filter((x) => x.id !== id);
    setIndicatorSets(next);
    saveServerPref(INDICATOR_SETS_KEY, next);
  };
  /** Human summary of what a set contains, e.g. "SMA, RSI, BOLLINGER +2". */
  const summarizeSet = (s: IndicatorSet): string => {
    const keys = Object.keys(s.indicators || {}).filter(
      (k) => (s.indicators as any)[k] !== undefined && (s.indicators as any)[k] !== false
    );
    if (keys.length === 0) return "empty (clears indicators)";
    const shown = keys.slice(0, 3).map((k) => k.toUpperCase());
    return shown.join(", ") + (keys.length > 3 ? ` +${keys.length - 3}` : "");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <Input
          placeholder="Save current as…"
          className="h-7 text-[11px] flex-1"
          value={setName}
          onChange={(e) => setSetName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") saveIndicatorSet(); }}
          data-testid="indicator-set-name"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[10px] gap-1 flex-shrink-0"
          onClick={saveIndicatorSet}
          title="Save the current indicators as a named set (synced to the server)"
          data-testid="indicator-set-save"
        >
          <Plus className="w-3 h-3" />
          Save
        </Button>
      </div>
      {indicatorSets.length === 0 ? (
        <div className="text-[10px] text-muted-foreground">
          No saved sets yet — configure indicators, then save them as a named set you can apply anywhere in the app, on any computer.
        </div>
      ) : (
        <div className="space-y-1">
          {indicatorSets.map((s) => (
            <div key={s.id} className="flex items-center gap-1 group">
              <button
                type="button"
                onClick={() => { if (s.indicators && typeof s.indicators === "object") onApply(s.indicators); }}
                className="flex-1 min-w-0 flex items-center gap-1.5 rounded border border-border bg-secondary/40 hover:bg-secondary px-2 py-1 text-left transition-colors"
                title={`Apply "${s.name}" (${summarizeSet(s)})${applyHint}`}
                data-testid={`indicator-set-apply-${s.name}`}
              >
                <Layers className="w-3 h-3 shrink-0 text-primary" />
                <span className="text-[11px] font-medium truncate">{s.name}</span>
                <span className="text-[9px] text-muted-foreground truncate ml-auto">{summarizeSet(s)}</span>
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => deleteIndicatorSet(s.id)}
                title={`Delete set "${s.name}"`}
                data-testid={`indicator-set-delete-${s.name}`}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface IndicatorsPanelProps {
  panes: PaneInfo[];
  indicatorsMap: Record<number, ActiveIndicators>;
  activePaneId: number | null;
  onSelectPane: (paneId: number) => void;
  onChangeIndicators: (paneId: number, indicators: ActiveIndicators) => void;
  /** Write the same indicator config to every pane in ONE atomic update.
   * Must be a single state write — looping onChangeIndicators clobbers, since
   * the host composes each call off the same (stale) map. */
  onApplyToAllPanes: (indicators: ActiveIndicators) => void;
  onClose: () => void;
  /** Chart bar frequency — threaded to registry controls so param inputs show
   *  frequency-specific defaults. */
  frequency?: string;
}

/** Ordered list of collapsible section titles in the indicators sidebar. */
const INDICATOR_SECTIONS = [
  "Indicator Sets",
  "Moving Averages",
  "Oscillators",
  "Volatility",
  "Overlays",
  "Volume",
  "Trend",
  "More Indicators",
  "Statistical",
  "Indicator Overlays",
] as const;

/** Clickable section header — toggles its section open/closed with a rotating chevron.
 *  Exported for the Pairs (Compare) panel, which mirrors this panel's layout. */
export function SectionHeader({
  title,
  collapsed,
  onToggle,
  className = "",
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className={`flex w-full items-center justify-between gap-2 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider hover:text-foreground transition-colors ${className}`}
    >
      <span>{title}</span>
      <ChevronDown
        className={`w-3 h-3 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
      />
    </button>
  );
}

/** Compact row for a moving-average indicator with preset buttons + custom input */
/** Multi-select period picker: preset buttons toggle membership (several can
 *  be active at once → one indicator line per period), non-preset periods
 *  show as removable chips, and the number input ADDS a period on Enter.
 *  Clicking a period while the indicator is off turns it on with just that
 *  period. */
export function PeriodMultiSelect({
  presets,
  active,
  onChange,
  testid,
  min = 2,
}: {
  presets: number[];
  active: number | number[] | undefined;
  onChange: (list: number[] | undefined) => void;
  testid: string;
  min?: number;
}) {
  const list = indicatorPeriods(active);
  const [custom, setCustom] = useState("");
  const toggle = (p: number) => {
    const next = list.includes(p)
      ? list.filter((x) => x !== p)
      : [...list, p].sort((a, b) => a - b);
    onChange(next.length ? next : undefined);
  };
  return (
    <>
      {presets.map((p) => (
        <Button
          key={p}
          variant={list.includes(p) ? "default" : "secondary"}
          size="sm"
          className="h-6 px-2 text-[10px] flex-1"
          onClick={() => toggle(p)}
          title={list.includes(p) ? `Remove the ${p}-period line` : `Add a ${p}-period line`}
        >
          {p}
        </Button>
      ))}
      {list.filter((p) => !presets.includes(p)).map((p) => (
        <Button
          key={p}
          variant="default"
          size="sm"
          className="h-6 px-1.5 text-[10px]"
          onClick={() => toggle(p)}
          title={`Remove the ${p}-period line`}
        >
          {p} ×
        </Button>
      ))}
      <Input
        type="number"
        placeholder="+#"
        className="h-6 w-14 text-[10px] px-1.5"
        value={custom}
        min={min}
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const n = parseInt(custom, 10);
            if (Number.isFinite(n) && n >= min) {
              toggle(n);
              setCustom("");
            }
          }
        }}
        title="Type a period and press Enter to add another line"
        data-testid={testid}
      />
    </>
  );
}

function MaRow({
  label,
  presets,
  defaultLen,
  active,
  onToggle,
  freq,
  onFreqChange,
}: {
  label: string;
  presets: number[];
  defaultLen: number;
  active: number | number[] | undefined;
  onToggle: (val: number[] | undefined) => void;
  /** Compute frequency for this MA (weekly/monthly resample the closes first
   *  — e.g. a monthly SMA overlaid on a daily chart). */
  freq?: "chart" | "weekly" | "monthly";
  onFreqChange?: (f: "chart" | "weekly" | "monthly") => void;
}) {
  const activeList = indicatorPeriods(active);
  // Remember the last non-empty selection so the on/off switch restores it.
  const lastRef = useRef<number[]>(activeList.length ? activeList : [defaultLen]);
  if (activeList.length) lastRef.current = activeList;

  // Each MA's colour key is its lowercased label (sma, ema, dema, …). Show an
  // inline colour dot so the line colour is editable right where it's toggled;
  // it drives the same store as the "Colors" section, so both stay in sync.
  const colorKey = label.toLowerCase();
  const hasColor = colorKey in INDICATOR_COLORS;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {hasColor && <ColorSwatch colorKey={colorKey as IndicatorColorKey} label={label} compact />}
          {hasColor && <WidthCycle colorKey={colorKey as IndicatorColorKey} label={label} />}
          {hasColor && <StyleCycle colorKey={colorKey as IndicatorColorKey} label={label} />}
          {hasColor && <OpacityCycle colorKey={colorKey as IndicatorColorKey} label={label} />}
          {hasColor && <GradientToggle colorKey={colorKey as IndicatorColorKey} label={label} />}
          <Label className="text-xs font-medium ml-0.5">{label}</Label>
        </div>
        <Switch
          checked={activeList.length > 0}
          onCheckedChange={(on) => onToggle(on ? lastRef.current : undefined)}
          data-testid={`toggle-${label.toLowerCase()}`}
        />
      </div>
      <div className="flex gap-1 items-center flex-wrap">
        <PeriodMultiSelect
          presets={presets}
          active={active}
          onChange={onToggle}
          testid={`custom-${label.toLowerCase()}`}
          min={1}
        />
        {onFreqChange && activeList.length > 0 && (
          <select
            className="h-6 text-[10px] px-1 rounded-md border border-input bg-background"
            value={freq ?? "chart"}
            onChange={(e) => onFreqChange(e.target.value as "chart" | "weekly" | "monthly")}
            title={`Compute ${label} on the chart's bars, or on weekly/monthly resampled bars (e.g. monthly ${label} on a daily chart)`}
            data-testid={`freq-${label.toLowerCase()}`}
          >
            <option value="chart">Chart</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        )}
      </div>
    </div>
  );
}

/** Heikin-Ashi with smoothing parameter controls (like TradingView) */
function HeikinAshiControls({
  activeIndicators,
  onChangeIndicators,
}: {
  activeIndicators: ActiveIndicators;
  onChangeIndicators: (i: ActiveIndicators) => void;
}) {
  const haVal = activeIndicators.heikinAshi;
  const isOn = !!haVal;
  const smoothCfg: HASmoothConfig =
    typeof haVal === "object" ? haVal : { type: "none", period: 10 };

  const [smoothType, setSmoothType] = useState<HASmoothType>(smoothCfg.type);
  const [smoothPeriod, setSmoothPeriod] = useState(smoothCfg.period);

  const update = (type: HASmoothType, period: number) => {
    setSmoothType(type);
    setSmoothPeriod(period);
    if (isOn) {
      const val: boolean | HASmoothConfig =
        type === "none" ? true : { type, period };
      onChangeIndicators({ ...activeIndicators, heikinAshi: val });
    }
  };

  const toggle = (on: boolean) => {
    if (!on) {
      onChangeIndicators({ ...activeIndicators, heikinAshi: undefined });
    } else {
      const val: boolean | HASmoothConfig =
        smoothType === "none" ? true : { type: smoothType, period: smoothPeriod };
      onChangeIndicators({ ...activeIndicators, heikinAshi: val });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-medium">Heikin-Ashi</Label>
          <p className="text-[10px] text-muted-foreground mt-0.5">Candle overlay in sub-pane</p>
        </div>
        <Switch
          checked={isOn}
          onCheckedChange={toggle}
          data-testid="toggle-heikin-ashi"
        />
      </div>
      {/* Smoothing MA type */}
      <div className="flex gap-1 items-center">
        <span className="text-[10px] text-muted-foreground w-12">Smooth:</span>
        {(["none", "SMA", "EMA", "WMA"] as HASmoothType[]).map((t) => (
          <Button
            key={t}
            variant={smoothType === t ? "default" : "secondary"}
            size="sm"
            className="h-5 px-1.5 text-[9px] flex-1"
            onClick={() => update(t, smoothPeriod)}
          >
            {t === "none" ? "Off" : t}
          </Button>
        ))}
      </div>
      {/* Smoothing period */}
      {smoothType !== "none" && (
        <div className="flex gap-1 items-center">
          <span className="text-[10px] text-muted-foreground w-12">Period:</span>
          {[5, 10, 14, 20].map((p) => (
            <Button
              key={p}
              variant={smoothPeriod === p ? "default" : "secondary"}
              size="sm"
              className="h-5 px-1.5 text-[9px] flex-1"
              onClick={() => update(smoothType, p)}
            >
              {p}
            </Button>
          ))}
          <Input
            type="number"
            placeholder="#"
            className="h-5 w-12 text-[9px] px-1"
            min={2}
            onChange={(e) => {
              const n = parseInt(e.target.value);
              if (n > 1) update(smoothType, n);
            }}
            data-testid="custom-ha-smooth-period"
          />
        </div>
      )}
    </div>
  );
}

/** "Best lag" helper under the Autocorrelation controls (Charts panel only):
 *  full-sample ACF sweep over lags 1..30 of the chosen source series
 *  (Returns / RSI level / RSI change, honoring rsiPeriod and the effective
 *  weekly/monthly frequency), ranked by |AC| with significance marked.
 *  Clicking a row applies that lag to the indicator. */
export function AutocorrBestLagPanel({
  ticker,
  frequency,
  params,
  indicatorFreq,
  onApplyLag,
}: {
  ticker: string | null;
  frequency?: string;
  /** Resolved autocorr params (source / rsiPeriod / lag) from the registry row. */
  params: Record<string, number>;
  /** Per-indicator compute frequency override ("chart" | "weekly" | "monthly"). */
  indicatorFreq?: string;
  onApplyLag: (lag: number) => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ entries: AcfSweepEntry[]; label: string; nBars: number; freq: string } | null>(null);
  const [metric, setMetric] = useState<string>("close");
  const [metrics, setMetrics] = useState<string[]>([]);

  // Metric choices = Price plus the ticker's workbook metrics (so the sweep
  // can run on e.g. "P/FFO (FY2)" to match a valuation-ratio pane).
  useEffect(() => {
    let alive = true;
    setMetric("close");
    if (!ticker) { setMetrics([]); return; }
    getTickers()
      .then((list) => {
        if (!alive) return;
        const m = (list.find((t) => t.ticker === ticker)?.metrics ?? []) as string[];
        setMetrics(m.filter((x) => !["close", "open", "high", "low"].includes(x)));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [ticker]);

  // Effective compute frequency: the per-indicator override wins; otherwise
  // follow the chart (hourly charts sweep on daily bars — no intraday here).
  const effFreq =
    indicatorFreq === "weekly" || indicatorFreq === "monthly"
      ? indicatorFreq
      : frequency === "weekly" || frequency === "monthly"
        ? frequency
        : "daily";

  const run = async () => {
    if (!ticker) { setError("No ticker on this pane."); return; }
    setRunning(true);
    setError(null);
    try {
      const input: FindBestMaInput = metric === "close" ? { kind: "close" } : { kind: "workbook", metric };
      const data = await loadMaInput(ticker, input);
      if (!data || data.closes.length < 60) {
        setError(`Not enough data (${data?.closes.length ?? 0} bars; need ≥ 60).`);
        setResult(null);
        return;
      }
      let bars: OhlcBar[] = data.closes.map((c, i) => ({
        time: data.priceDates[i] ?? String(i),
        open: c, high: c, low: c, close: c,
      }));
      if (effFreq === "weekly" || effFreq === "monthly") {
        bars = resampleIndicatorBars(bars, effFreq);
      }
      const src = autocorrSourceFromParam(params.source);
      const entries = computeAcfSweep(bars, src, 30, params.rsiPeriod ?? 14);
      if (!entries.length) {
        setError("Not enough bars after resampling for an ACF sweep.");
        setResult(null);
        return;
      }
      setResult({ entries, label: data.label, nBars: bars.length, freq: effFreq });
    } catch (e: any) {
      setError(`Sweep failed: ${e?.message ?? e}`);
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const srcLabel = params.source === 1 ? `RSI${params.rsiPeriod ?? 14} level` : params.source === 2 ? `RSI${params.rsiPeriod ?? 14} change` : "returns";
  const ranked = result ? [...result.entries].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8) : [];

  return (
    <div className="ml-0.5 mt-1 rounded border border-border/60 bg-card/40 p-1.5 space-y-1.5" data-testid="autocorr-best-lag">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[10px]"
          disabled={running}
          onClick={run}
          data-testid="autocorr-best-lag-run"
        >
          {running ? "Scanning…" : "Find best lag"}
        </Button>
        {metrics.length > 0 && (
          <select
            className="h-6 text-[10px] px-1 rounded-md border border-input bg-background max-w-[9rem]"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            title="Series to sweep — match it to what this pane plots"
            data-testid="autocorr-best-lag-metric"
          >
            <option value="close">Price (close)</option>
            {metrics.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <span className="text-[9px] text-muted-foreground">
          {srcLabel} · {effFreq}
        </span>
      </div>
      {error && <div className="text-[10px] text-destructive">{error}</div>}
      {result && !error && (
        <div className="space-y-0.5">
          <div className="text-[9px] text-muted-foreground">
            {result.label} · {result.nBars} {result.freq} bars · lags 1–30 by |AC|, ● = significant (95%) · click to apply
          </div>
          {ranked.map((e) => (
            <button
              key={e.lag}
              type="button"
              className={`w-full flex items-center justify-between px-1.5 py-0.5 rounded text-[10px] font-mono hover:bg-accent ${
                e.lag === params.lag ? "bg-primary/15" : ""
              }`}
              onClick={() => onApplyLag(e.lag)}
              title={`Apply lag ${e.lag} (AC ${e.value >= 0 ? "+" : ""}${e.value.toFixed(3)}, band ±${e.threshold.toFixed(3)})`}
              data-testid={`autocorr-best-lag-row-${e.lag}`}
            >
              <span>lag {e.lag}{e.lag === params.lag ? " ✓" : ""}</span>
              <span className={e.significant ? (e.value >= 0 ? "text-emerald-400" : "text-rose-400") : "text-muted-foreground"}>
                {e.value >= 0 ? "+" : ""}{e.value.toFixed(3)}{e.significant ? " ●" : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Auto-generated controls for registry-driven indicators (see
 *  indicatorRegistry.ts). One row per indicator with a toggle + numeric param
 *  inputs, grouped by category. Adding an indicator to the registry makes it
 *  appear here with no edits to this file. */
export function RegistryIndicatorControls({
  activeIndicators,
  onChange,
  frequency,
  renderExtra,
}: {
  activeIndicators: ActiveIndicators;
  onChange: (i: ActiveIndicators) => void;
  /** Pane bar frequency — shows frequency-specific param defaults so the
   *  inputs match what the pane actually renders. */
  frequency?: string;
  /** Optional bespoke UI injected under an indicator's controls while it is
   *  enabled (e.g. the Charts panel's Best-Lag helper under Autocorrelation).
   *  Callers without extra context (Pairs/Macro) simply omit it. */
  renderExtra?: (def: IndicatorDef, params: Record<string, number>) => ReactNode;
}) {
  const reg = activeIndicators.registry ?? {};
  const update = (id: string, patch: Partial<RegistryIndicatorState>) => {
    const cur = reg[id] ?? {};
    onChange({ ...activeIndicators, registry: { ...reg, [id]: { ...cur, ...patch } } });
  };
  const setParam = (def: IndicatorDef, key: string, value: number) => {
    const cur = reg[def.id] ?? {};
    update(def.id, { params: { ...(cur.params ?? {}), [key]: value } });
  };

  // Free-text filter across the (now large) registry — matches label / id /
  // category so the user can jump straight to "kurtosis", "vortex", "winsor", …
  const [indSearch, setIndSearch] = useState("");
  const q = indSearch.trim().toLowerCase();
  const matchDef = (d: IndicatorDef) =>
    !q || d.label.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) || d.category.toLowerCase().includes(q);

  const categories: string[] = [];
  for (const d of ALL_REGISTRY_INDICATORS) if (matchDef(d) && !categories.includes(d.category)) categories.push(d.category);

  return (
    <div className="space-y-4">
      <Input
        type="text"
        placeholder="Search indicators…"
        value={indSearch}
        onChange={(e) => setIndSearch(e.target.value)}
        className="h-7 text-xs"
        data-testid="indicator-search"
      />
      {categories.length === 0 && (
        <div className="text-[10px] text-muted-foreground/50 px-0.5">No indicators match “{indSearch}”.</div>
      )}
      {categories.map((cat) => (
        <div key={cat} className="space-y-3">
          <div className="text-[9px] text-muted-foreground/70 font-semibold uppercase tracking-wider">{cat}</div>
          {ALL_REGISTRY_INDICATORS.filter((d) => d.category === cat && matchDef(d)).map((def) => {
            const st = reg[def.id];
            const enabled = !!st?.enabled;
            const p = resolveParams(def, st, frequency);
            return (
              <div key={def.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <Label className="text-xs font-medium">{def.label}</Label>
                    <span className="text-[9px] text-muted-foreground/50">
                      {def.renderTarget === "pane" ? "sub-pane" : "overlay"}
                    </span>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(on) => update(def.id, { enabled: on })}
                    data-testid={`toggle-${def.id}`}
                  />
                </div>
                {enabled && def.params.length > 0 && (
                  <div className="flex flex-wrap gap-x-2 gap-y-1 items-center pl-0.5">
                    {/* Per-indicator compute frequency (weekly/monthly resample) */}
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-muted-foreground/70">Freq</span>
                      <select
                        className="h-6 text-[10px] px-1 rounded-md border border-input bg-background"
                        value={st?.freq ?? "chart"}
                        onChange={(e) => update(def.id, { freq: e.target.value as RegistryIndicatorState["freq"] })}
                        title="Compute this indicator on the chart's bars, or on weekly/monthly resampled bars (e.g. weekly RSI on a daily chart)"
                        data-testid={`freq-${def.id}`}
                      >
                        <option value="chart">Chart</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    {def.params.map((pr) => (
                      <div key={pr.key} className="flex items-center gap-1">
                        <span className="text-[9px] text-muted-foreground/70">{pr.label}</span>
                        {pr.key === def.multiInstanceParam ? (
                          // Multi-instance param (e.g. autocorr lag): several
                          // values → one indicator line per value.
                          <div className="flex items-center gap-1 flex-wrap">
                            <PeriodMultiSelect
                              presets={[]}
                              active={(st?.params?.[pr.key] as number | number[] | undefined) ?? p[pr.key]}
                              onChange={(list) => {
                                const cur = reg[def.id] ?? {};
                                const nextParams = { ...(cur.params ?? {}) };
                                if (list?.length) nextParams[pr.key] = list.length === 1 ? list[0] : list;
                                else delete nextParams[pr.key];
                                update(def.id, { params: nextParams });
                              }}
                              testid={`param-${def.id}-${pr.key}`}
                              min={pr.min}
                            />
                          </div>
                        ) : pr.options ? (
                          <select
                            className="h-6 text-[10px] px-1 rounded-md border border-input bg-background"
                            value={p[pr.key]}
                            onChange={(e) => setParam(def, pr.key, Number(e.target.value))}
                            data-testid={`param-${def.id}-${pr.key}`}
                          >
                            {pr.options.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            type="number"
                            className="h-6 w-14 text-[10px] px-1.5"
                            value={p[pr.key]}
                            min={pr.min}
                            max={pr.max}
                            step={pr.step ?? 1}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (Number.isFinite(v)) setParam(def, pr.key, v);
                            }}
                            data-testid={`param-${def.id}-${pr.key}`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {enabled && renderExtra?.(def, p)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function IndicatorsPanel({
  panes,
  indicatorsMap,
  activePaneId,
  onSelectPane,
  onChangeIndicators,
  onApplyToAllPanes,
  onClose,
  frequency,
}: IndicatorsPanelProps) {
  // Per-section collapse state — empty set means every section is expanded (default).
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const isCollapsed = (name: string) => collapsedSections.has(name);
  const toggleSection = (name: string) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const allCollapsed = INDICATOR_SECTIONS.every((s) => collapsedSections.has(s));
  const toggleAll = () =>
    setCollapsedSections(allCollapsed ? new Set() : new Set(INDICATOR_SECTIONS));

  // When on, every indicator toggle mirrors to ALL panes (a live "select all"),
  // not just the one shown in the pane selector. Auto-disabled with a single pane.
  const [applyToAll, setApplyToAll] = useState(false);

  const selectedPaneId = activePaneId ?? (panes.length > 0 ? panes[0].id : null);
  const activeIndicators = selectedPaneId !== null ? (indicatorsMap[selectedPaneId] || {}) : {};

  const setActiveIndicators = (indicators: ActiveIndicators) => {
    if (selectedPaneId === null) return;
    if (applyToAll && panes.length > 1) {
      onApplyToAllPanes(indicators);
    } else {
      onChangeIndicators(selectedPaneId, indicators);
    }
  };

  const activeTicker = panes.find((p) => p.id === selectedPaneId)?.ticker ?? null;

  // Per-MA compute-frequency props for MaRow (monthly SMA on a daily chart, …).
  // "chart" clears the override so the stored map stays sparse.
  const maFreqProps = (key: keyof NonNullable<ActiveIndicators["maFreq"]>) => ({
    freq: activeIndicators.maFreq?.[key],
    onFreqChange: (f: "chart" | "weekly" | "monthly") => {
      const next = { ...(activeIndicators.maFreq ?? {}) };
      if (f === "chart") delete next[key];
      else next[key] = f;
      setActiveIndicators({ ...activeIndicators, maFreq: Object.keys(next).length ? next : undefined });
    },
  });

  // Copy the current pane's indicators to every pane (one-time, atomic).
  const copyToAll = () => {
    onApplyToAllPanes(activeIndicators);
  };

  const applyHint = applyToAll && panes.length > 1 ? " to ALL panes" : "";

  // Mean/std band local state
  const meanCfg = activeIndicators.mean;
  const [meanRolling, setMeanRolling] = useState(meanCfg?.rolling ?? false);
  const [meanPeriod, setMeanPeriod] = useState(meanCfg?.period ?? 200);
  const [rsiPeriod, setRsiPeriod] = useState(
    typeof activeIndicators.rsi === "number" ? activeIndicators.rsi : 14
  );
  // New indicator local state
  const [bbPeriod, setBbPeriod] = useState(activeIndicators.bollinger?.period ?? 20);
  const [bbMult, setBbMult] = useState(activeIndicators.bollinger?.mult ?? 2);
  const [atrPeriod, setAtrPeriod] = useState(typeof activeIndicators.atr === "number" ? activeIndicators.atr : 14);
  const [rocPeriod, setRocPeriod] = useState(typeof activeIndicators.roc === "number" ? activeIndicators.roc : 12);
  const [stochK, setStochK] = useState(activeIndicators.stochastic?.kPeriod ?? 14);
  const [stochD, setStochD] = useState(activeIndicators.stochastic?.dPeriod ?? 3);
  const [fractalN, setFractalN] = useState(activeIndicators.fractalLines?.n ?? 10);

  // Update fractal-lines config. anchorDate: undefined = keep current, null = clear (live), string = set.
  const updateFractal = (
    on: boolean,
    n?: number,
    anchorDate?: string | null,
    timeframe?: "daily" | "weekly" | "monthly",
  ) => {
    if (!on) {
      setActiveIndicators({ ...activeIndicators, fractalLines: undefined });
      return;
    }
    const cur = activeIndicators.fractalLines;
    const nextAnchor =
      anchorDate === undefined ? cur?.anchorDate : anchorDate === null ? undefined : anchorDate;
    setActiveIndicators({
      ...activeIndicators,
      fractalLines: { n: n ?? fractalN, anchorDate: nextAnchor, timeframe: timeframe ?? cur?.timeframe },
    });
  };

  const updateMean = (
    on: boolean,
    rolling?: boolean,
    period?: number,
    bandOpacity?: number,
    shade?: boolean,
  ) => {
    const r = rolling ?? meanRolling;
    const p = period ?? meanPeriod;
    setActiveIndicators({
      ...activeIndicators,
      mean: on
        ? {
            rolling: r,
            period: p,
            bandOpacity: bandOpacity ?? meanCfg?.bandOpacity,
            shade: shade ?? meanCfg?.shade,
          }
        : undefined,
    });
  };

  return (
    <ResizableSidebar storageKey="charts-indicators-width" defaultWidth={260}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Indicators</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] gap-1"
            onClick={toggleAll}
            title={allCollapsed ? "Expand all sections" : "Collapse all sections"}
            data-testid="collapse-all-indicators"
          >
            {allCollapsed ? <ChevronsUpDown className="w-3.5 h-3.5" /> : <ChevronsDownUp className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ───── Pane selector ───── */}
      {panes.length > 0 && (
        <div className="px-3 pt-3 space-y-1.5">
          <Label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Apply to pane</Label>
          <div className="flex gap-1">
            <Select
              value={selectedPaneId !== null ? String(selectedPaneId) : ""}
              onValueChange={(v) => onSelectPane(parseInt(v))}
            >
              <SelectTrigger className="h-7 text-[11px] flex-1" data-testid="indicator-pane-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {panes.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.label || `Pane ${p.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {panes.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[10px] gap-1 flex-shrink-0"
                onClick={copyToAll}
                title="Copy this pane's indicators to all other panes (one-time)"
                data-testid="copy-indicators-to-all"
              >
                <Copy className="w-3 h-3" />
                All
              </Button>
            )}
          </div>
          {panes.length > 1 && (
            <label
              className="flex items-center gap-2 pt-0.5 cursor-pointer select-none"
              title="While on, every indicator change applies to all panes at once"
            >
              <Switch
                checked={applyToAll}
                onCheckedChange={setApplyToAll}
                className="scale-90"
                data-testid="apply-indicators-to-all-toggle"
              />
              <span className={`text-[10px] ${applyToAll ? "text-primary font-medium" : "text-muted-foreground"}`}>
                {applyToAll ? `Applying to all ${panes.length} panes` : "Apply to all panes"}
              </span>
            </label>
          )}
        </div>
      )}

      <div className="p-3 space-y-4">
        {/* Hover lookback-window lines */}
        <label
          className="flex items-center gap-2 cursor-pointer select-none"
          title="While hovering, draw a dashed line N bars behind the crosshair for every period indicator (RSI 14 shows the 14-bar window feeding the value under the cursor)"
        >
          <Switch
            checked={activeIndicators.showLookbackWindow !== false}
            onCheckedChange={(on) => setActiveIndicators({ ...activeIndicators, showLookbackWindow: on ? undefined : false })}
            className="scale-90"
            data-testid="toggle-lookback-window"
          />
          <span className="text-[10px] text-muted-foreground">Lookback window lines on hover</span>
        </label>

        {/* ───── Indicator Sets ───── */}
        <SectionHeader
          title="Indicator Sets"
          collapsed={isCollapsed("Indicator Sets")}
          onToggle={() => toggleSection("Indicator Sets")}
        />
        {!isCollapsed("Indicator Sets") && (
          <IndicatorSetsSection
            activeIndicators={activeIndicators}
            onApply={setActiveIndicators}
            applyHint={applyHint}
          />
        )}

        {/* ───── Pattern Recognition ───── */}
        {selectedPaneId !== null && <PatternsPanel paneId={selectedPaneId} />}

        {/* ───── Moving Averages ───── */}
        <SectionHeader
          title="Moving Averages"
          collapsed={isCollapsed("Moving Averages")}
          onToggle={() => toggleSection("Moving Averages")}
        />

        {!isCollapsed("Moving Averages") && (
          <>
            <MaRow
              label="SMA"
              presets={[20, 50, 100, 200]}
              defaultLen={50}
              active={activeIndicators.sma}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, sma: v })}
              {...maFreqProps("sma")}
            />

            <MaRow
              label="EMA"
              presets={[9, 21, 50, 100]}
              defaultLen={21}
              active={activeIndicators.ema}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, ema: v })}
              {...maFreqProps("ema")}
            />

            <MaRow
              label="HMA"
              presets={[9, 20, 50, 100]}
              defaultLen={20}
              active={activeIndicators.hma}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, hma: v })}
              {...maFreqProps("hma")}
            />

            <MaRow
              label="WMA"
              presets={[9, 20, 50, 100]}
              defaultLen={20}
              active={activeIndicators.wma}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, wma: v })}
              {...maFreqProps("wma")}
            />

            <MaRow
              label="DEMA"
              presets={[9, 21, 50, 100]}
              defaultLen={21}
              active={activeIndicators.dema}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, dema: v })}
              {...maFreqProps("dema")}
            />

            <MaRow
              label="TEMA"
              presets={[9, 21, 50, 100]}
              defaultLen={21}
              active={activeIndicators.tema}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, tema: v })}
              {...maFreqProps("tema")}
            />

            <MaRow
              label="KAMA"
              presets={[10, 20, 50, 100]}
              defaultLen={20}
              active={activeIndicators.kama}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, kama: v })}
              {...maFreqProps("kama")}
            />

            <MaRow
              label="FRAMA"
              presets={[16, 26, 50, 100]}
              defaultLen={26}
              active={activeIndicators.frama}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, frama: v })}
              {...maFreqProps("frama")}
            />

            <MaRow
              label="T3"
              presets={[5, 10, 21, 50]}
              defaultLen={10}
              active={activeIndicators.t3}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, t3: v })}
              {...maFreqProps("t3")}
            />

            <MaRow
              label="ALMA"
              presets={[9, 21, 50, 100]}
              defaultLen={21}
              active={activeIndicators.alma}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, alma: v })}
              {...maFreqProps("alma")}
            />

            <MaRow
              label="LSMA"
              presets={[14, 25, 50, 100]}
              defaultLen={25}
              active={activeIndicators.lsma}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, lsma: v })}
              {...maFreqProps("lsma")}
            />

            <MaRow
              label="SLSMA"
              presets={[14, 25, 50, 100]}
              defaultLen={25}
              active={activeIndicators.slsma}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, slsma: v })}
              {...maFreqProps("slsma")}
            />

            <FindBestMAPanel
              ticker={activeTicker}
              activeIndicators={activeIndicators}
              onChangeIndicators={setActiveIndicators}
            />
          </>
        )}

        {/* ───── Oscillators ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="Oscillators"
            collapsed={isCollapsed("Oscillators")}
            onToggle={() => toggleSection("Oscillators")}
            className="mb-3"
          />

          {!isCollapsed("Oscillators") && (<>
          {/* RSI — multi-period: several lines can share the RSI subplot */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">RSI</Label>
              <Switch
                checked={indicatorPeriods(activeIndicators.rsi).length > 0}
                onCheckedChange={(on) =>
                  setActiveIndicators({
                    ...activeIndicators,
                    rsi: on ? [rsiPeriod] : undefined,
                  })
                }
                data-testid="toggle-rsi"
              />
            </div>
            <div className="flex gap-1 items-center flex-wrap">
              <PeriodMultiSelect
                presets={[7, 14, 21]}
                active={activeIndicators.rsi}
                onChange={(list) => {
                  if (list?.length) setRsiPeriod(list[0]);
                  setActiveIndicators({ ...activeIndicators, rsi: list });
                }}
                testid="custom-rsi"
              />
              <select
                className="h-6 text-[10px] px-1 rounded-md border border-input bg-background"
                value={activeIndicators.rsiFreq ?? "chart"}
                onChange={(e) => setActiveIndicators({ ...activeIndicators, rsiFreq: e.target.value as any })}
                title="Compute RSI on the chart's bars, or on weekly/monthly resampled closes (weekly RSI on a daily chart)"
                data-testid="freq-rsi"
              >
                <option value="chart">Chart</option>
                <option value="weekly">W</option>
                <option value="monthly">M</option>
              </select>
            </div>
          </div>

          {/* MACD */}
          <div className="flex items-center justify-between mt-3">
            <Label className="text-xs font-medium">MACD (12, 26, 9)</Label>
            <Switch
              checked={!!activeIndicators.macd}
              onCheckedChange={(on) =>
                setActiveIndicators({ ...activeIndicators, macd: on || undefined })
              }
              data-testid="toggle-macd"
            />
          </div>

          {/* Stochastic */}
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Stochastic</Label>
              <Switch
                checked={activeIndicators.stochastic !== undefined}
                onCheckedChange={(on) =>
                  setActiveIndicators({
                    ...activeIndicators,
                    stochastic: on ? { kPeriod: stochK, dPeriod: stochD } : undefined,
                  })
                }
                data-testid="toggle-stochastic"
              />
            </div>
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-muted-foreground w-8">%K:</span>
              {[9, 14, 21].map((p) => (
                <Button
                  key={p}
                  variant={stochK === p ? "default" : "secondary"}
                  size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => {
                    setStochK(p);
                    if (activeIndicators.stochastic)
                      setActiveIndicators({ ...activeIndicators, stochastic: { kPeriod: p, dPeriod: stochD } });
                  }}
                >
                  {p}
                </Button>
              ))}
            </div>
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-muted-foreground w-8">%D:</span>
              {[3, 5, 7].map((p) => (
                <Button
                  key={p}
                  variant={stochD === p ? "default" : "secondary"}
                  size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => {
                    setStochD(p);
                    if (activeIndicators.stochastic)
                      setActiveIndicators({ ...activeIndicators, stochastic: { kPeriod: stochK, dPeriod: p } });
                  }}
                >
                  {p}
                </Button>
              ))}
            </div>
          </div>

          {/* ROC — multi-period: several lines share the ROC subplot */}
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">ROC (Rate of Change)</Label>
              <Switch
                checked={indicatorPeriods(activeIndicators.roc).length > 0}
                onCheckedChange={(on) =>
                  setActiveIndicators({
                    ...activeIndicators,
                    roc: on ? [rocPeriod] : undefined,
                  })
                }
                data-testid="toggle-roc"
              />
            </div>
            <div className="flex gap-1 items-center flex-wrap">
              <PeriodMultiSelect
                presets={[9, 12, 20, 50]}
                active={activeIndicators.roc}
                onChange={(list) => {
                  if (list?.length) setRocPeriod(list[0]);
                  setActiveIndicators({ ...activeIndicators, roc: list });
                }}
                testid="custom-roc"
                min={1}
              />
            </div>
          </div>
          </>)}
        </div>

        {/* ───── Volatility ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="Volatility"
            collapsed={isCollapsed("Volatility")}
            onToggle={() => toggleSection("Volatility")}
            className="mb-3"
          />

          {!isCollapsed("Volatility") && (<>
          {/* Bollinger Bands */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Bollinger Bands</Label>
              <Switch
                checked={activeIndicators.bollinger !== undefined}
                onCheckedChange={(on) =>
                  setActiveIndicators({
                    ...activeIndicators,
                    bollinger: on ? { period: bbPeriod, mult: bbMult } : undefined,
                  })
                }
                data-testid="toggle-bollinger"
              />
            </div>
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-muted-foreground w-12">Period:</span>
              {[10, 20, 50].map((p) => (
                <Button
                  key={p}
                  variant={bbPeriod === p ? "default" : "secondary"}
                  size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => {
                    setBbPeriod(p);
                    if (activeIndicators.bollinger)
                      setActiveIndicators({ ...activeIndicators, bollinger: { period: p, mult: bbMult } });
                  }}
                >
                  {p}
                </Button>
              ))}
            </div>
            <div className="flex gap-1 items-center">
              <span className="text-[10px] text-muted-foreground w-12">Width:</span>
              {[1, 1.5, 2, 2.5, 3].map((m) => (
                <Button
                  key={m}
                  variant={bbMult === m ? "default" : "secondary"}
                  size="sm"
                  className="h-6 px-1.5 text-[10px] flex-1"
                  onClick={() => {
                    setBbMult(m);
                    if (activeIndicators.bollinger)
                      setActiveIndicators({ ...activeIndicators, bollinger: { period: bbPeriod, mult: m } });
                  }}
                >
                  {m}σ
                </Button>
              ))}
            </div>
          </div>

          {/* ATR — multi-period: several lines share the ATR subplot */}
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">ATR</Label>
              <Switch
                checked={indicatorPeriods(activeIndicators.atr).length > 0}
                onCheckedChange={(on) =>
                  setActiveIndicators({
                    ...activeIndicators,
                    atr: on ? [atrPeriod] : undefined,
                  })
                }
                data-testid="toggle-atr"
              />
            </div>
            <div className="flex gap-1 items-center flex-wrap">
              <PeriodMultiSelect
                presets={[7, 14, 21]}
                active={activeIndicators.atr}
                onChange={(list) => {
                  if (list?.length) setAtrPeriod(list[0]);
                  setActiveIndicators({ ...activeIndicators, atr: list });
                }}
                testid="custom-atr"
              />
            </div>
          </div>
          </>)}
        </div>

        {/* ───── Overlays ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="Overlays"
            collapsed={isCollapsed("Overlays")}
            onToggle={() => toggleSection("Overlays")}
            className="mb-3"
          />

          {!isCollapsed("Overlays") && (<>
          {/* VWAP */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium">VWAP</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">Cumulative avg overlay</p>
            </div>
            <Switch
              checked={!!activeIndicators.vwap}
              onCheckedChange={(on) =>
                setActiveIndicators({ ...activeIndicators, vwap: on || undefined })
              }
              data-testid="toggle-vwap"
            />
          </div>
          </>)}
        </div>

        {/* ───── Volume ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="Volume"
            collapsed={isCollapsed("Volume")}
            onToggle={() => toggleSection("Volume")}
            className="mb-3"
          />

          {!isCollapsed("Volume") && (<>
          {/* OBV */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs font-medium">OBV</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">On Balance Volume sub-pane</p>
            </div>
            <Switch
              checked={!!activeIndicators.obv}
              onCheckedChange={(on) =>
                setActiveIndicators({ ...activeIndicators, obv: on || undefined })
              }
              data-testid="toggle-obv"
            />
          </div>
          </>)}
        </div>

        {/* ───── Trend ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="Trend"
            collapsed={isCollapsed("Trend")}
            onToggle={() => toggleSection("Trend")}
            className="mb-3"
          />

          {!isCollapsed("Trend") && (<>
          {/* Heikin-Ashi with smoothing */}
          <HeikinAshiControls
            activeIndicators={activeIndicators}
            onChangeIndicators={setActiveIndicators}
          />

          {/* HA Color-Change Signals */}
          <div className="flex items-center justify-between mt-3">
            <div>
              <Label className="text-xs font-medium">HA Signals</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                <span className="text-green-400">▲</span> / <span className="text-red-400">▼</span> arrows on color flips
              </p>
            </div>
            <Switch
              checked={!!activeIndicators.haSignals}
              onCheckedChange={(on) =>
                setActiveIndicators({ ...activeIndicators, haSignals: on || undefined })
              }
              data-testid="toggle-ha-signals"
            />
          </div>

          {/* Fractal Lines (DojiEmoji auto-trendline) */}
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium">Fractal Lines</Label>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  <span className="text-red-400">R</span> /{" "}
                  <span className="text-green-400">S</span> trendlines from last 2 fractal pivots
                </p>
              </div>
              <Switch
                checked={activeIndicators.fractalLines !== undefined}
                onCheckedChange={(on) => updateFractal(on)}
                data-testid="toggle-fractal-lines"
              />
            </div>

            {activeIndicators.fractalLines !== undefined && (<>
              {/* Fractal period n */}
              <div className="flex gap-1 items-center">
                <span className="text-[10px] text-muted-foreground w-12">Period</span>
                {[5, 10, 20].map((p) => (
                  <Button
                    key={p}
                    variant={fractalN === p ? "default" : "secondary"}
                    size="sm"
                    className="h-6 px-2 text-[10px] flex-1"
                    onClick={() => {
                      setFractalN(p);
                      updateFractal(true, p);
                    }}
                  >
                    {p}
                  </Button>
                ))}
                <Input
                  type="number"
                  placeholder="#"
                  className="h-6 w-14 text-[10px] px-1.5"
                  min={2}
                  max={100}
                  value={fractalN}
                  onChange={(e) => {
                    const n = parseInt(e.target.value);
                    if (Number.isFinite(n) && n >= 2 && n <= 100) {
                      setFractalN(n);
                      updateFractal(true, n);
                    }
                  }}
                  data-testid="custom-fractal-period"
                />
              </div>

              {/* Timeframe: detect pivots on daily, weekly, or monthly bars */}
              <div className="flex gap-1 items-center">
                <span className="text-[10px] text-muted-foreground w-12">Timeframe</span>
                {(["daily", "weekly", "monthly"] as const).map((tf) => (
                  <Button
                    key={tf}
                    variant={(activeIndicators.fractalLines?.timeframe ?? "daily") === tf ? "default" : "secondary"}
                    size="sm"
                    className="h-6 px-2 text-[10px] flex-1"
                    onClick={() => updateFractal(true, undefined, undefined, tf)}
                    data-testid={`panel-fractal-tf-${tf}`}
                  >
                    {tf === "daily" ? "Daily" : tf === "weekly" ? "Weekly" : "Monthly"}
                  </Button>
                ))}
              </div>

              {/* As-of anchor date */}
              <div className="flex gap-1 items-center">
                <span className="text-[10px] text-muted-foreground w-12">As of</span>
                <DateInput
                  wrapperClassName="flex-1"
                  className="h-6 text-[10px] px-1.5 flex-1"
                  value={activeIndicators.fractalLines.anchorDate ?? ""}
                  onChange={(v) => updateFractal(true, undefined, v || null)}
                  data-testid="fractal-anchor-date"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => updateFractal(true, undefined, null)}
                  title="Use the latest bar (live)"
                  disabled={!activeIndicators.fractalLines.anchorDate}
                >
                  Latest
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground">
                Tip: pick the <span className="font-medium">Fractal Anchor</span> draw tool,
                then click a candle to set the as-of date.
              </p>
            </>)}
          </div>

          {/* Auto Trendlines (pivot-pair RANSAC detection) */}
          <div className="flex items-center justify-between mt-3">
            <div>
              <Label className="text-xs font-medium">Auto Trendlines</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Diagonal <span className="text-red-400">R</span> / <span className="text-green-400">S</span> lines from pivot pairs
              </p>
            </div>
            <Switch
              checked={!!activeIndicators.autoTrendlines}
              onCheckedChange={(on) => setActiveIndicators({ ...activeIndicators, autoTrendlines: on || undefined })}
              data-testid="toggle-auto-trendlines"
            />
          </div>

          {/* Horizontal Support / Resistance levels */}
          <div className="flex items-center justify-between mt-3">
            <div>
              <Label className="text-xs font-medium">S/R Levels</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Horizontal support / resistance zones
              </p>
            </div>
            <Switch
              checked={!!activeIndicators.srLevels}
              onCheckedChange={(on) => setActiveIndicators({ ...activeIndicators, srLevels: on || undefined })}
              data-testid="toggle-sr-levels"
            />
          </div>

          {/* Fibonacci retracement levels */}
          <div className="flex items-center justify-between mt-3">
            <div>
              <Label className="text-xs font-medium">Fibonacci Levels</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Retracement of the recent swing (23.6–78.6%)
              </p>
            </div>
            <Switch
              checked={!!activeIndicators.fibLevels}
              onCheckedChange={(on) => setActiveIndicators({ ...activeIndicators, fibLevels: on || undefined })}
              data-testid="toggle-fib-levels"
            />
          </div>
          </>)}
        </div>

        {/* ───── More Indicators (registry-driven) ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="More Indicators"
            collapsed={isCollapsed("More Indicators")}
            onToggle={() => toggleSection("More Indicators")}
            className="mb-3"
          />
          {!isCollapsed("More Indicators") && (
            <RegistryIndicatorControls
              activeIndicators={activeIndicators}
              onChange={setActiveIndicators}
              frequency={frequency}
              renderExtra={(def, p) =>
                def.id === "autocorr" ? (
                  <AutocorrBestLagPanel
                    ticker={activeTicker}
                    frequency={frequency}
                    params={p}
                    indicatorFreq={activeIndicators.registry?.autocorr?.freq}
                    onApplyLag={(lag) => {
                      const cur = activeIndicators.registry?.autocorr ?? {};
                      const raw = cur.params?.lag;
                      // Multi-lag active → clicking a row ADDS that lag as a
                      // new line; single-lag → replace as before.
                      const next = Array.isArray(raw)
                        ? (raw.includes(lag) ? raw : [...raw, lag].sort((a, b) => a - b))
                        : lag;
                      setActiveIndicators({
                        ...activeIndicators,
                        registry: {
                          ...(activeIndicators.registry ?? {}),
                          autocorr: { ...cur, params: { ...(cur.params ?? {}), lag: next } },
                        },
                      });
                    }}
                  />
                ) : null
              }
            />
          )}
        </div>

        {/* ───── Statistical ───── */}
        <div className="border-t border-border pt-3">
          <SectionHeader
            title="Statistical"
            collapsed={isCollapsed("Statistical")}
            onToggle={() => toggleSection("Statistical")}
            className="mb-3"
          />

          {!isCollapsed("Statistical") && (<>
          {/* Mean + Std Bands */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Mean ± Std Bands</Label>
              <Switch
                checked={meanCfg !== undefined}
                onCheckedChange={(on) => updateMean(on)}
                data-testid="toggle-mean"
              />
            </div>

            {/* Rolling vs Static toggle */}
            <div className="flex gap-1">
              <Button
                variant={!meanRolling ? "default" : "secondary"}
                size="sm"
                className="h-6 px-3 text-[10px] flex-1"
                onClick={() => {
                  setMeanRolling(false);
                  if (meanCfg) updateMean(true, false);
                }}
              >
                Static
              </Button>
              <Button
                variant={meanRolling ? "default" : "secondary"}
                size="sm"
                className="h-6 px-3 text-[10px] flex-1"
                onClick={() => {
                  setMeanRolling(true);
                  if (meanCfg) updateMean(true, true);
                }}
              >
                Rolling
              </Button>
            </div>

            {/* Period selector */}
            <div className="flex gap-1 items-center">
              {[50, 100, 200, 500].map((p) => (
                <Button
                  key={p}
                  variant={meanPeriod === p ? "default" : "secondary"}
                  size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => {
                    setMeanPeriod(p);
                    if (meanCfg) updateMean(true, undefined, p);
                  }}
                >
                  {p}
                </Button>
              ))}
              <Input
                type="number"
                placeholder="#"
                className="h-6 w-14 text-[10px] px-1.5"
                min={10}
                onChange={(e) => {
                  const n = parseInt(e.target.value);
                  if (n >= 10) {
                    setMeanPeriod(n);
                    if (meanCfg) updateMean(true, undefined, n);
                  }
                }}
                data-testid="custom-mean-period"
              />
            </div>

            {/* Band opacity + rolling shade */}
            <div className="flex gap-1 items-center">
              <span className="text-[9px] text-muted-foreground w-14">Band opacity</span>
              {[0.4, 0.6, 0.8, 1].map((op) => (
                <Button
                  key={op}
                  variant={(meanCfg?.bandOpacity ?? 0.8) === op ? "default" : "secondary"}
                  size="sm"
                  className="h-6 px-1.5 text-[10px] flex-1"
                  onClick={() => { if (meanCfg) updateMean(true, undefined, undefined, op); }}
                  data-testid={`mean-band-opacity-${op * 100}`}
                >
                  {op * 100}%
                </Button>
              ))}
            </div>
            {meanRolling && (
              <label className="flex items-center gap-2 cursor-pointer select-none" title="Fill the ±1σ/±2σ areas so the envelope reads at a glance">
                <Switch
                  checked={meanCfg?.shade !== false}
                  onCheckedChange={(on) => { if (meanCfg) updateMean(true, undefined, undefined, undefined, on); }}
                  className="scale-90"
                  data-testid="mean-band-shade"
                />
                <span className="text-[10px] text-muted-foreground">Shade band area</span>
              </label>
            )}
          </div>
          </>)}
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground">
            MAs, Bollinger, and VWAP overlay the chart. RSI, MACD, ATR, ROC, Stochastic, and OBV render in sub-panes below. Select which pane to apply to above.
          </p>
        </div>

        {/* ───── Indicator Overlays ───── */}
        <IndicatorOverlays
          activeIndicators={activeIndicators}
          onChangeIndicators={setActiveIndicators}
          collapsed={isCollapsed("Indicator Overlays")}
          onToggle={() => toggleSection("Indicator Overlays")}
        />

        {/* ───── Colors ───── */}
        <IndicatorColorEditor />
      </div>
    </ResizableSidebar>
  );
}

// ── Indicator Overlays (bundle oWe): overlay an MA-style indicator onto an active sub-chart indicator ──
const INDICATOR_OVERLAY_LABELS: Record<string, string> = {
  rsi: "RSI",
  macd: "MACD",
  ha: "Heikin-Ashi",
  atr: "ATR",
  roc: "ROC",
  stochastic: "Stochastic",
  obv: "OBV",
  ad: "A/D Line",
  cmf: "CMF",
};

const OVERLAY_TYPES: { value: string; label: string }[] = [
  // All 12 maEngine moving averages…
  { value: "sma", label: "SMA" },
  { value: "ema", label: "EMA" },
  { value: "wma", label: "WMA" },
  { value: "hma", label: "HMA" },
  { value: "dema", label: "DEMA" },
  { value: "tema", label: "TEMA" },
  { value: "kama", label: "KAMA" },
  { value: "frama", label: "FRAMA" },
  { value: "t3", label: "T3" },
  { value: "alma", label: "ALMA" },
  { value: "lsma", label: "LSMA" },
  { value: "slsma", label: "SLSMA" },
  // …plus indicator-on-indicator combos.
  { value: "bollinger", label: "Bollinger Bands" },
  { value: "meanband", label: "Rolling Mean ± σ" },
  { value: "stochastic", label: "Stochastic (StochRSI-style)" },
  { value: "rsi", label: "RSI (own pane)" },
  { value: "roc", label: "ROC (own pane)" },
  { value: "macd", label: "MACD (own pane)" },
  { value: "autocorr", label: "Autocorrelation (own pane)" },
];

export function IndicatorOverlays({
  activeIndicators,
  onChangeIndicators,
  collapsed,
  onToggle,
}: {
  activeIndicators: ActiveIndicators;
  onChangeIndicators: (i: ActiveIndicators) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const overlays = activeIndicators.indicatorOverlays || [];

  const availableSources: string[] = [];
  if (activeIndicators.rsi !== undefined) availableSources.push("rsi");
  if (activeIndicators.macd) availableSources.push("macd");
  if (activeIndicators.atr !== undefined) availableSources.push("atr");
  if (activeIndicators.roc !== undefined) availableSources.push("roc");
  if (activeIndicators.stochastic) availableSources.push("stochastic");
  if (activeIndicators.obv) availableSources.push("obv");
  // Registry sub-pane indicators (ADX, CCI, Autocorrelation, …) are sources too.
  for (const def of PANE_INDICATORS) {
    if (activeIndicators.registry?.[def.id]?.enabled) availableSources.push(def.id);
  }

  const sourceLabel = (s: string) =>
    INDICATOR_OVERLAY_LABELS[s] ?? getIndicatorDef(s)?.label ?? s;

  const [source, setSource] = useState(availableSources[0] || "");
  const [type, setType] = useState("sma");
  const [period, setPeriod] = useState(14);
  const [bbMult, setBbMult] = useState(2);
  const [dSmooth, setDSmooth] = useState(3);
  const [macdSlow, setMacdSlow] = useState(26);
  const [macdSignal, setMacdSignal] = useState(9);
  const [acLag, setAcLag] = useState(1);

  const addOverlay = () => {
    if (!source) return;
    const overlay: IndicatorOverlay = {
      id: `${source}-${type}-${period}-${Date.now()}`,
      source,
      type,
      // Autocorr interprets `period` as the trailing window — nudge tiny
      // MA-style defaults up so window − lag has enough pairs to correlate.
      period: type === "autocorr" ? Math.max(period, acLag + 10) : period,
      ...(type === "bollinger" || type === "meanband" ? { mult: bbMult } : {}),
      ...(type === "stochastic" ? { d: dSmooth } : {}),
      ...(type === "macd" ? { slow: macdSlow, signal: macdSignal } : {}),
      ...(type === "autocorr" ? { lag: acLag } : {}),
    };
    onChangeIndicators({ ...activeIndicators, indicatorOverlays: [...overlays, overlay] });
  };

  const removeOverlay = (id: string) => {
    onChangeIndicators({
      ...activeIndicators,
      indicatorOverlays: overlays.filter((x) => x.id !== id),
    });
  };

  return (
    <div className="border-t border-border pt-3">
      <SectionHeader
        title="Indicator Overlays"
        collapsed={collapsed}
        onToggle={onToggle}
        className="mb-3"
      />
      {!collapsed && (
        <>
          {overlays.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {overlays.map((o) => (
                <span
                  key={o.id}
                  className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                >
                  {o.type.toUpperCase()}({o.period}
                  {o.type === "macd" ? `,${o.slow ?? 26},${o.signal ?? 9}` : ""}
                  {o.type === "stochastic" ? `,${o.d ?? 3}` : ""}
                  {o.type === "autocorr" ? `,lag ${o.lag ?? 1}` : ""})
                  {(o.type === "bollinger" || o.type === "meanband") && o.mult !== undefined ? ` ${o.mult}σ` : ""} on{" "}
                  {sourceLabel(o.source)}
                  <button
                    onClick={() => removeOverlay(o.id)}
                    title="Remove overlay"
                    className="hover:text-foreground"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {availableSources.length > 0 ? (
            <div className="space-y-1.5">
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="h-6 text-[10px]" data-testid="overlay-source-select">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  {availableSources.map((s) => (
                    <SelectItem key={s} value={s} className="text-[10px]">
                      {sourceLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-6 text-[10px]" data-testid="overlay-type-select">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {OVERLAY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-[10px]">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                {[7, 14, 20, 50].map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={period === p ? "default" : "secondary"}
                    className="h-5 px-1.5 text-[9px] flex-1"
                    onClick={() => setPeriod(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Input
                  type="number"
                  min={2}
                  value={period}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (v > 1) setPeriod(v);
                  }}
                  className="h-5 w-12 text-[9px] px-1"
                  data-testid="overlay-custom-period"
                />
              </div>
              {(type === "bollinger" || type === "meanband") && (
                <div className="flex items-center gap-1">
                  {[1, 1.5, 2, 2.5].map((g) => (
                    <Button
                      key={g}
                      size="sm"
                      variant={bbMult === g ? "default" : "secondary"}
                      className="h-5 px-1.5 text-[9px] flex-1"
                      onClick={() => setBbMult(g)}
                    >
                      {g}σ
                    </Button>
                  ))}
                </div>
              )}
              {type === "autocorr" && (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground">Lag</span>
                  {[1, 2, 5, 10].map((l) => (
                    <Button
                      key={l}
                      size="sm"
                      variant={acLag === l ? "default" : "secondary"}
                      className="h-5 px-1.5 text-[9px] flex-1"
                      onClick={() => setAcLag(l)}
                    >
                      {l}
                    </Button>
                  ))}
                  <Input
                    type="number"
                    min={1}
                    value={acLag}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 1) setAcLag(v); }}
                    className="h-5 w-12 text-[9px] px-1"
                    data-testid="overlay-ac-lag"
                  />
                </div>
              )}
              {type === "autocorr" && (
                <div className="text-[9px] text-muted-foreground">
                  Period above = trailing window (63 ≈ 3mo of daily bars).
                </div>
              )}
              {type === "stochastic" && (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground">%D smooth</span>
                  <Input
                    type="number"
                    min={1}
                    value={dSmooth}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 1) setDSmooth(v); }}
                    className="h-5 w-12 text-[9px] px-1"
                    data-testid="overlay-stoch-d"
                  />
                </div>
              )}
              {type === "macd" && (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground">Slow</span>
                  <Input
                    type="number"
                    min={2}
                    value={macdSlow}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (v > 1) setMacdSlow(v); }}
                    className="h-5 w-12 text-[9px] px-1"
                    data-testid="overlay-macd-slow"
                  />
                  <span className="text-[9px] text-muted-foreground">Signal</span>
                  <Input
                    type="number"
                    min={1}
                    value={macdSignal}
                    onChange={(e) => { const v = parseInt(e.target.value, 10); if (v >= 1) setMacdSignal(v); }}
                    className="h-5 w-12 text-[9px] px-1"
                    data-testid="overlay-macd-signal"
                  />
                </div>
              )}
              <Button
                variant="outline"
                className="h-6 w-full text-[10px] gap-1"
                onClick={addOverlay}
                data-testid="add-overlay-btn"
              >
                <Plus className="w-3 h-3" />
                Add {type.toUpperCase()}({period}) on {source ? sourceLabel(source) : "..."}
              </Button>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/60 italic">
              Enable a sub-chart indicator (RSI, MACD, ATR, etc.) first, then add overlays here.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Compact colour swatch + picker ──
/** Compact click-to-cycle line-thickness control (1→2→3→4→1). The preview bar
 *  renders at the current thickness in the indicator's own colour, so it shows
 *  both the width and the colour at a glance. Drives the same store as the
 *  colour swatch, so changes persist with the workspace. */
function WidthCycle({ colorKey, label }: { colorKey: IndicatorColorKey; label: string }) {
  const { widths, setWidth, colors } = useIndicatorColors();
  const w = widths[colorKey] ?? 1;
  return (
    <button
      type="button"
      onClick={() => setWidth(colorKey, w >= 4 ? 1 : w + 1)}
      title={`${label} line thickness: ${w}px — click to cycle 1–4`}
      data-testid={`width-cycle-${colorKey}`}
      className="relative flex items-center justify-center w-5 h-4 rounded border border-border/50 hover:border-foreground/60 transition-colors shrink-0"
    >
      <span className="block w-3 rounded-full" style={{ height: `${w}px`, backgroundColor: colors[colorKey] }} />
    </button>
  );
}

// SVG dash pattern per style, mirroring lightweight-charts' rendering (dotted
// styles use round caps so a zero-length dash draws a dot).
const STYLE_PREVIEW: Record<MaLineStyle, { dash?: string; cap: "butt" | "round" }> = {
  solid: { cap: "butt" },
  dashed: { dash: "4 3", cap: "butt" },
  dotted: { dash: "0.1 3", cap: "round" },
  largeDashed: { dash: "8 4", cap: "butt" },
  sparseDotted: { dash: "0.1 6", cap: "round" },
};

/** Compact click-to-cycle line-style control (solid → dashed → dotted → large
 *  dashed → sparse dotted). The preview renders a short rule in the current
 *  style + the indicator's colour. Drives the same store as the colour/width
 *  controls, so changes persist with the workspace. */
function StyleCycle({ colorKey, label }: { colorKey: IndicatorColorKey; label: string }) {
  const { styles, setStyle, colors } = useIndicatorColors();
  const cur: MaLineStyle = styles[colorKey] ?? "solid";
  const next = () => {
    const i = MA_LINE_STYLES.indexOf(cur);
    setStyle(colorKey, MA_LINE_STYLES[(i + 1) % MA_LINE_STYLES.length]);
  };
  const pv = STYLE_PREVIEW[cur];
  return (
    <button
      type="button"
      onClick={next}
      title={`${label} line style: ${MA_LINE_STYLE_LABELS[cur]} — click to cycle`}
      data-testid={`style-cycle-${colorKey}`}
      className="relative flex items-center justify-center w-5 h-4 rounded border border-border/50 hover:border-foreground/60 transition-colors shrink-0"
    >
      <svg width="14" height="4" viewBox="0 0 14 4" aria-hidden="true">
        <line
          x1="0.5"
          y1="2"
          x2="13.5"
          y2="2"
          stroke={colors[colorKey]}
          strokeWidth="2"
          strokeLinecap={pv.cap}
          strokeDasharray={pv.dash}
        />
      </svg>
    </button>
  );
}

/** Convert a hex colour + alpha (0–1) to an rgba() string (for the preview). */
function rgbaFromHex(color: string, a: number): string {
  if (!color.startsWith("#")) return color;
  let h = color.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Compact click-to-cycle line-opacity control (100 → 75 → 50 → 25%). The preview
 *  shows the indicator's colour at the current alpha over a checkerboard, so the
 *  transparency is literally visible. Drives the same store as the other line
 *  controls, so changes persist with the workspace. */
function OpacityCycle({ colorKey, label }: { colorKey: IndicatorColorKey; label: string }) {
  const { opacities, setOpacity, colors } = useIndicatorColors();
  const o = opacities[colorKey] ?? 1;
  const next = () => {
    const i = MA_OPACITY_STEPS.findIndex((s) => Math.abs(s - o) < 0.01);
    setOpacity(colorKey, MA_OPACITY_STEPS[i < 0 ? 0 : (i + 1) % MA_OPACITY_STEPS.length]);
  };
  return (
    <button
      type="button"
      onClick={next}
      title={`${label} line opacity: ${Math.round(o * 100)}% — click to cycle`}
      data-testid={`opacity-cycle-${colorKey}`}
      className="relative flex items-center justify-center w-5 h-4 rounded border border-border/50 hover:border-foreground/60 transition-colors shrink-0"
    >
      <span
        className="relative block w-3 h-3 rounded-sm overflow-hidden"
        style={{ background: "repeating-conic-gradient(#94a3b8 0% 25%, #475569 0% 50%) 50% / 6px 6px" }}
      >
        <span className="absolute inset-0" style={{ backgroundColor: rgbaFromHex(colors[colorKey], o) }} />
      </span>
    </button>
  );
}

/** Compact toggle for value-gradient mode. The preview is a bar fading vertically
 *  from a faint (low) to a full (high) version of the indicator's colour, matching
 *  the drawn by-value gradient. Highlighted when on. Drives the same store as the
 *  other line controls. */
function GradientToggle({ colorKey, label }: { colorKey: IndicatorColorKey; label: string }) {
  const { gradients, setGradient, colors } = useIndicatorColors();
  const on = !!gradients[colorKey];
  const c = colors[colorKey];
  return (
    <button
      type="button"
      onClick={() => setGradient(colorKey, !on)}
      title={`${label} value gradient: ${on ? "on" : "off"} — click to toggle`}
      data-testid={`gradient-toggle-${colorKey}`}
      aria-pressed={on}
      className={`relative flex items-center justify-center w-5 h-4 rounded border transition-colors shrink-0 ${on ? "border-foreground/70 ring-1 ring-foreground/30" : "border-border/50 hover:border-foreground/60"}`}
    >
      <span
        className="block w-3 h-3 rounded-sm"
        style={{ backgroundImage: `linear-gradient(to top, ${rgbaFromHex(c, 0.12)}, ${c})` }}
      />
    </button>
  );
}

function ColorSwatch({ colorKey, label, compact = false }: { colorKey: IndicatorColorKey; label: string; compact?: boolean }) {
  const { colors, setColor, resetColor, overrides } = useIndicatorColors();
  const current = colors[colorKey];
  const isOverridden = colorKey in overrides;

  const swatch = (
    <label className="relative cursor-pointer shrink-0" title={`Change ${label} colour`}>
      <span
        className={`block ${compact ? "w-3 h-3" : "w-4 h-4"} rounded border border-border/50`}
        style={{ backgroundColor: current }}
      />
      <input
        type="color"
        value={current.startsWith("rgba") || current.startsWith("#") ? (current.startsWith("#") ? current.slice(0, 7) : "#888888") : current}
        onChange={(e) => setColor(colorKey, e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        data-testid={`color-input-${colorKey}`}
      />
    </label>
  );

  // Compact: just the dot (+ a reset affordance on hover if overridden), for use
  // inline next to a control that already renders the label.
  if (compact) {
    return (
      <span className="flex items-center gap-1 group">
        {swatch}
        {isOverridden && (
          <button
            onClick={() => resetColor(colorKey)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            title="Reset colour to default"
            data-testid={`color-reset-${colorKey}`}
          >
            <RotateCcw className="w-2.5 h-2.5" />
          </button>
        )}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5 group">
      {swatch}
      <span className="text-[9px] text-muted-foreground flex-1 leading-tight break-words" title={label}>{label}</span>
      {isOverridden && (
        <button
          onClick={() => resetColor(colorKey)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          title="Reset to default"
          data-testid={`color-reset-${colorKey}`}
        >
          <RotateCcw className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

export function IndicatorColorEditor() {
  const [open, setOpen] = useState(false);
  const { resetAll, overrides, widthOverrides, styleOverrides, opacityOverrides, gradientOverrides } = useIndicatorColors();
  const hasOverrides =
    Object.keys(overrides).length > 0 ||
    Object.keys(widthOverrides).length > 0 ||
    Object.keys(styleOverrides).length > 0 ||
    Object.keys(opacityOverrides).length > 0 ||
    Object.keys(gradientOverrides).length > 0;

  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center justify-between mb-2">
        <button
          className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider hover:text-foreground transition-colors"
          onClick={() => setOpen((o) => !o)}
        >
          <Palette className="w-3 h-3" /> Colors
        </button>
        <div className="flex items-center gap-1">
          {hasOverrides && (
            <button
              onClick={resetAll}
              className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
              title="Reset all colors to defaults"
            >
              <RotateCcw className="w-2.5 h-2.5" /> Reset
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="space-y-3">
          {/* Moving Averages */}
          <div className="space-y-1">
            <p className="text-[9px] text-muted-foreground/70 font-medium">Moving Averages</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <ColorSwatch colorKey="sma" label="SMA" />
              <ColorSwatch colorKey="ema" label="EMA" />
              <ColorSwatch colorKey="hma" label="HMA" />
              <ColorSwatch colorKey="wma" label="WMA" />
              <ColorSwatch colorKey="dema" label="DEMA" />
              <ColorSwatch colorKey="tema" label="TEMA" />
              <ColorSwatch colorKey="kama" label="KAMA" />
              <ColorSwatch colorKey="frama" label="FRAMA" />
              <ColorSwatch colorKey="t3" label="T3" />
              <ColorSwatch colorKey="alma" label="ALMA" />
              <ColorSwatch colorKey="lsma" label="LSMA" />
              <ColorSwatch colorKey="slsma" label="SLSMA" />
              <ColorSwatch colorKey="vwap" label="VWAP" />
            </div>
          </div>

          {/* Bollinger */}
          <div className="space-y-1">
            <p className="text-[9px] text-muted-foreground/70 font-medium">Bollinger Bands</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <ColorSwatch colorKey="bollinger_basis" label="Basis" />
              <ColorSwatch colorKey="bollinger_band" label="Bands" />
            </div>
          </div>

          {/* RSI */}
          <div className="space-y-1">
            <p className="text-[9px] text-muted-foreground/70 font-medium">RSI</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <ColorSwatch colorKey="rsi_line" label="Line" />
            </div>
          </div>

          {/* MACD */}
          <div className="space-y-1">
            <p className="text-[9px] text-muted-foreground/70 font-medium">MACD</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <ColorSwatch colorKey="macd_line" label="MACD" />
              <ColorSwatch colorKey="macd_signal" label="Signal" />
              <ColorSwatch colorKey="macd_histogram_pos" label="Hist +" />
              <ColorSwatch colorKey="macd_histogram_neg" label="Hist −" />
            </div>
          </div>

          {/* Stochastic */}
          <div className="space-y-1">
            <p className="text-[9px] text-muted-foreground/70 font-medium">Stochastic</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <ColorSwatch colorKey="stoch_k" label="%K" />
              <ColorSwatch colorKey="stoch_d" label="%D" />
            </div>
          </div>

          {/* Other */}
          <div className="space-y-1">
            <p className="text-[9px] text-muted-foreground/70 font-medium">Other</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <ColorSwatch colorKey="atr" label="ATR" />
              <ColorSwatch colorKey="roc" label="ROC" />
              <ColorSwatch colorKey="obv" label="OBV" />
              <ColorSwatch colorKey="mean" label="Mean" />
            </div>
          </div>

          {/* Heikin-Ashi */}
          <div className="space-y-1">
            <p className="text-[9px] text-muted-foreground/70 font-medium">Heikin-Ashi</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <ColorSwatch colorKey="ha_up" label="Up" />
              <ColorSwatch colorKey="ha_down" label="Down" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
