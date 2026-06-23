import { useState } from "react";

import { ResizableSidebar } from "@/components/ResizableSidebar";
import { X, TrendingUp, Copy, ChevronsDownUp, ChevronsUpDown, ChevronDown, Palette, RotateCcw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActiveIndicators, IndicatorOverlay } from "./ChartPane";
import { FindBestMAPanel } from "./FindBestMAPanel";
import type { PaneInfo } from "@/pages/Dashboard";
import type { HASmoothType, HASmoothConfig } from "@/lib/indicators";
import { INDICATOR_COLORS } from "@/lib/chartColors";
import { useIndicatorColors, type IndicatorColorKey } from "@/lib/indicatorColorsContext";
import PatternsPanel from "./PatternsPanel";

interface IndicatorsPanelProps {
  panes: PaneInfo[];
  indicatorsMap: Record<number, ActiveIndicators>;
  activePaneId: number | null;
  onSelectPane: (paneId: number) => void;
  onChangeIndicators: (paneId: number, indicators: ActiveIndicators) => void;
  onClose: () => void;
}

/** Ordered list of collapsible section titles in the indicators sidebar. */
const INDICATOR_SECTIONS = [
  "Moving Averages",
  "Oscillators",
  "Volatility",
  "Overlays",
  "Volume",
  "Trend",
  "Statistical",
  "Indicator Overlays",
] as const;

/** Clickable section header — toggles its section open/closed with a rotating chevron. */
function SectionHeader({
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
function MaRow({
  label,
  presets,
  defaultLen,
  active,
  onToggle,
}: {
  label: string;
  presets: number[];
  defaultLen: number;
  active: number | undefined;
  onToggle: (val: number | undefined) => void;
}) {
  const [len, setLen] = useState(active ?? defaultLen);
  const [custom, setCustom] = useState("");

  const applyLen = (n: number) => {
    setLen(n);
    if (active !== undefined) onToggle(n);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <Switch
          checked={active !== undefined}
          onCheckedChange={(on) => onToggle(on ? len : undefined)}
          data-testid={`toggle-${label.toLowerCase()}`}
        />
      </div>
      <div className="flex gap-1 items-center">
        {presets.map((p) => (
          <Button
            key={p}
            variant={len === p ? "default" : "secondary"}
            size="sm"
            className="h-6 px-2 text-[10px] flex-1"
            onClick={() => applyLen(p)}
          >
            {p}
          </Button>
        ))}
        <Input
          type="number"
          placeholder="Custom"
          className="h-6 w-20 text-[10px] px-1.5"
          value={custom}
          min={1}
          onChange={(e) => {
            setCustom(e.target.value);
            const n = parseInt(e.target.value);
            if (n > 0) applyLen(n);
          }}
          data-testid={`custom-${label.toLowerCase()}`}
        />
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

export default function IndicatorsPanel({
  panes,
  indicatorsMap,
  activePaneId,
  onSelectPane,
  onChangeIndicators,
  onClose,
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

  const selectedPaneId = activePaneId ?? (panes.length > 0 ? panes[0].id : null);
  const activeIndicators = selectedPaneId !== null ? (indicatorsMap[selectedPaneId] || {}) : {};

  const setActiveIndicators = (indicators: ActiveIndicators) => {
    if (selectedPaneId !== null) {
      onChangeIndicators(selectedPaneId, indicators);
    }
  };

  const activeTicker = panes.find((p) => p.id === selectedPaneId)?.ticker ?? null;

  // Copy indicators from current pane to all other panes
  const copyToAll = () => {
    for (const pane of panes) {
      if (pane.id !== selectedPaneId) {
        onChangeIndicators(pane.id, { ...activeIndicators });
      }
    }
  };

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

  const updateMean = (on: boolean, rolling?: boolean, period?: number) => {
    const r = rolling ?? meanRolling;
    const p = period ?? meanPeriod;
    setActiveIndicators({
      ...activeIndicators,
      mean: on ? { rolling: r, period: p } : undefined,
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
                title="Copy this pane's indicators to all other panes"
                data-testid="copy-indicators-to-all"
              >
                <Copy className="w-3 h-3" />
                All
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="p-3 space-y-4">
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
            />

            <MaRow
              label="EMA"
              presets={[9, 21, 50, 100]}
              defaultLen={21}
              active={activeIndicators.ema}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, ema: v })}
            />

            <MaRow
              label="HMA"
              presets={[9, 20, 50, 100]}
              defaultLen={20}
              active={activeIndicators.hma}
              onToggle={(v) => setActiveIndicators({ ...activeIndicators, hma: v })}
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
          {/* RSI */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">RSI</Label>
              <Switch
                checked={activeIndicators.rsi !== undefined}
                onCheckedChange={(on) =>
                  setActiveIndicators({
                    ...activeIndicators,
                    rsi: on ? rsiPeriod : undefined,
                  })
                }
                data-testid="toggle-rsi"
              />
            </div>
            <div className="flex gap-1 items-center">
              {[7, 14, 21].map((p) => (
                <Button
                  key={p}
                  variant={rsiPeriod === p ? "default" : "secondary"}
                  size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => {
                    setRsiPeriod(p);
                    if (activeIndicators.rsi !== undefined)
                      setActiveIndicators({ ...activeIndicators, rsi: p });
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
                onChange={(e) => {
                  const n = parseInt(e.target.value);
                  if (n > 1) {
                    setRsiPeriod(n);
                    if (activeIndicators.rsi !== undefined)
                      setActiveIndicators({ ...activeIndicators, rsi: n });
                  }
                }}
                data-testid="custom-rsi"
              />
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

          {/* ROC */}
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">ROC (Rate of Change)</Label>
              <Switch
                checked={activeIndicators.roc !== undefined}
                onCheckedChange={(on) =>
                  setActiveIndicators({
                    ...activeIndicators,
                    roc: on ? rocPeriod : undefined,
                  })
                }
                data-testid="toggle-roc"
              />
            </div>
            <div className="flex gap-1 items-center">
              {[9, 12, 20, 50].map((p) => (
                <Button
                  key={p}
                  variant={rocPeriod === p ? "default" : "secondary"}
                  size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => {
                    setRocPeriod(p);
                    if (activeIndicators.roc !== undefined)
                      setActiveIndicators({ ...activeIndicators, roc: p });
                  }}
                >
                  {p}
                </Button>
              ))}
              <Input
                type="number"
                placeholder="#"
                className="h-6 w-14 text-[10px] px-1.5"
                min={1}
                onChange={(e) => {
                  const n = parseInt(e.target.value);
                  if (n > 0) {
                    setRocPeriod(n);
                    if (activeIndicators.roc !== undefined)
                      setActiveIndicators({ ...activeIndicators, roc: n });
                  }
                }}
                data-testid="custom-roc"
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

          {/* ATR */}
          <div className="space-y-2 mt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">ATR</Label>
              <Switch
                checked={activeIndicators.atr !== undefined}
                onCheckedChange={(on) =>
                  setActiveIndicators({
                    ...activeIndicators,
                    atr: on ? atrPeriod : undefined,
                  })
                }
                data-testid="toggle-atr"
              />
            </div>
            <div className="flex gap-1 items-center">
              {[7, 14, 21].map((p) => (
                <Button
                  key={p}
                  variant={atrPeriod === p ? "default" : "secondary"}
                  size="sm"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => {
                    setAtrPeriod(p);
                    if (activeIndicators.atr !== undefined)
                      setActiveIndicators({ ...activeIndicators, atr: p });
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
                onChange={(e) => {
                  const n = parseInt(e.target.value);
                  if (n > 1) {
                    setAtrPeriod(n);
                    if (activeIndicators.atr !== undefined)
                      setActiveIndicators({ ...activeIndicators, atr: n });
                  }
                }}
                data-testid="custom-atr"
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
          </>)}
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
  { value: "sma", label: "SMA" },
  { value: "ema", label: "EMA" },
  { value: "hma", label: "HMA" },
  { value: "bollinger", label: "Bollinger" },
];

function IndicatorOverlays({
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
  if (activeIndicators.ad) availableSources.push("ad");
  if (activeIndicators.cmf !== undefined) availableSources.push("cmf");

  const [source, setSource] = useState(availableSources[0] || "");
  const [type, setType] = useState("sma");
  const [period, setPeriod] = useState(14);
  const [bbMult, setBbMult] = useState(2);

  const addOverlay = () => {
    if (!source) return;
    const overlay: IndicatorOverlay = {
      id: `${source}-${type}-${period}-${Date.now()}`,
      source,
      type,
      period,
      ...(type === "bollinger" ? { mult: bbMult } : {}),
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
                  {o.type.toUpperCase()}({o.period})
                  {o.type === "bollinger" && o.mult !== undefined ? ` ${o.mult}σ` : ""} on{" "}
                  {INDICATOR_OVERLAY_LABELS[o.source] || o.source}
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
                      {INDICATOR_OVERLAY_LABELS[s] || s}
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
              {type === "bollinger" && (
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
              <Button
                variant="outline"
                className="h-6 w-full text-[10px] gap-1"
                onClick={addOverlay}
                data-testid="add-overlay-btn"
              >
                <Plus className="w-3 h-3" />
                Add {type.toUpperCase()}({period}) on{" "}
                {source ? INDICATOR_OVERLAY_LABELS[source] || source : "..."}
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
function ColorSwatch({ colorKey, label }: { colorKey: IndicatorColorKey; label: string }) {
  const { colors, setColor, resetColor, overrides } = useIndicatorColors();
  const current = colors[colorKey];
  const isOverridden = colorKey in overrides;

  return (
    <div className="flex items-center gap-1.5 group">
      <label className="relative cursor-pointer" title={`Change ${label} colour`}>
        <span
          className="block w-4 h-4 rounded border border-border/50"
          style={{ backgroundColor: current }}
        />
        <input
          type="color"
          value={current.startsWith("rgba") || current.startsWith("#") ? (current.startsWith("#") ? current.slice(0, 7) : "#888888") : current}
          onChange={(e) => setColor(colorKey, e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </label>
      <span className="text-[9px] text-muted-foreground flex-1 leading-tight break-words" title={label}>{label}</span>
      {isOverridden && (
        <button
          onClick={() => resetColor(colorKey)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          title="Reset to default"
        >
          <RotateCcw className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

export function IndicatorColorEditor() {
  const [open, setOpen] = useState(false);
  const { resetAll, overrides } = useIndicatorColors();
  const hasOverrides = Object.keys(overrides).length > 0;

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
