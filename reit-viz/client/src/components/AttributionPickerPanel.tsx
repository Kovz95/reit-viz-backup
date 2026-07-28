/**
 * Attribution picker panel — plot the rolling price-attribution decomposition
 * (Δln P = Δln M + Δln E) for any ticker as chart-pane series: each point is
 * the trailing-N-day move split into estimate-change vs multiple-change
 * contributions, in log-% so the two components sum exactly to the total.
 */
import { useState, useCallback } from "react";

import { ResizableSidebar } from "@/components/ResizableSidebar";
import { X, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import type { PlottedSeries, PaneInfo } from "@/pages/Dashboard";
import type { TickerMeta } from "@shared/schema";
import {
  BASIS_FAMILIES, BASIS_PERIODS, getBasisDef, loadBasisAligned, buildRollingPath,
  type BasisMode, type BasisPeriod,
} from "@/lib/attribution";

// Same palette as the /attribution page charts.
const COLOR_TOTAL = "#e5e7eb";
const COLOR_MULT = "#38bdf8";
const COLOR_EST = "#fbbf24";

const WINDOW_PRESETS = [
  { label: "21d", days: 21 }, { label: "30d", days: 30 },
  { label: "63d", days: 63 }, { label: "126d", days: 126 }, { label: "252d", days: 252 },
];

interface AttributionPickerPanelProps {
  tickerList: TickerMeta[];
  panes: PaneInfo[];
  activeTicker: string | null;
  onPlot: (series: PlottedSeries, targetPaneId?: number) => number;
  onClose: () => void;
}

export default function AttributionPickerPanel({
  tickerList, panes, activeTicker, onPlot, onClose,
}: AttributionPickerPanelProps) {
  const [ticker, setTicker] = useState(() =>
    activeTicker && tickerList.some((t) => t.ticker === activeTicker) ? activeTicker : ""
  );
  const [basisMode, setBasisMode] = useState<BasisMode>("auto");
  const [period, setPeriod] = useState<BasisPeriod>("FY1");
  const [win, setWin] = useState(63);
  const [display, setDisplay] = useState<"components" | "stacked" | "share">("components");
  const [plotMode, setPlotMode] = useState<"new" | string>("new");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pop, setPop] = useState(false);

  const handlePlot = useCallback(async () => {
    if (!ticker || win < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await loadBasisAligned(ticker, basisMode, period);
      if (!res) {
        setError(`No ${basisMode === "auto" ? "FFO/EPRA/EPS" : basisMode} ${period} estimate data for ${ticker}.`);
        return;
      }
      const path = buildRollingPath(res.aligned, 0, win);
      if (path.length < 2) {
        setError(`Not enough aligned history for a ${win}d window.`);
        return;
      }
      const basisLabel = getBasisDef(res.basis, period).label;
      const tag = `${ticker} ${win}d`;
      const stamp = Date.now();
      const targetPaneId = plotMode === "new" ? undefined : parseInt(plotMode);
      const mk = (
        part: string, color: string, data: Array<{ time: string; value: number }>, label: string,
        opts?: Partial<PlottedSeries>,
      ): PlottedSeries => ({
        id: `attr:${ticker}:${res.basis}:${period}:${win}:${part}:${stamp}`,
        ticker: "ATTR",
        metric: "attribution",
        color,
        paneIndex: 0,
        data,
        visible: true,
        label,
        // Components must stay magnitude-comparable — never split them across
        // the dual-axis left/right scales.
        sharedScale: true,
        ...opts,
      });
      const est = path.map((p) => ({ time: p.date, value: p.est }));
      // First series decides new-pane creation; onPlot returns the pane id so
      // the remaining components overlay onto that same pane.
      if (display === "components") {
        const mult = path.map((p) => ({ time: p.date, value: p.mult }));
        const total = path.map((p) => ({ time: p.date, value: p.total }));
        const paneId = onPlot(mk("est", COLOR_EST, est, `${tag} Est Δ (${basisLabel})`), targetPaneId);
        onPlot(mk("mult", COLOR_MULT, mult, `${tag} Multiple Δ`), paneId);
        onPlot(mk("total", COLOR_TOTAL, total, `${tag} Total Δ`), paneId);
      } else if (display === "stacked") {
        // Stacked shaded areas from zero: est+mult (= total log return) drawn
        // first, estimate layered on top — the visible band between the two
        // fills is the multiple contribution.
        const sum = path.map((p) => ({ time: p.date, value: p.est + p.mult }));
        const paneId = onPlot(
          mk("stack", COLOR_MULT, sum, `${tag} Est+Mult Δ (total)`, { seriesType: "area" }),
          targetPaneId,
        );
        onPlot(mk("est", COLOR_EST, est, `${tag} Est Δ (${basisLabel})`, { seriesType: "area" }), paneId);
      } else {
        // Share of move: over the trailing window, what PERCENT of the gross
        // move came from multiple change vs estimate revisions. Shares use
        // |mult| / (|mult| + |est|) so opposing-sign windows still split
        // sensibly; the two lines sum to 100 by construction.
        const shares = path.map((p) => {
          const denom = Math.abs(p.mult) + Math.abs(p.est);
          const multShare = denom > 1e-12 ? (Math.abs(p.mult) / denom) * 100 : 50;
          return { time: p.date, mult: multShare, est: 100 - multShare };
        });
        const paneId = onPlot(
          mk("mshare", COLOR_MULT, shares.map((s) => ({ time: s.time, value: s.mult })), `${tag} Multiple share %`),
          targetPaneId,
        );
        onPlot(
          mk("eshare", COLOR_EST, shares.map((s) => ({ time: s.time, value: s.est })), `${tag} Est share % (${basisLabel})`),
          paneId,
        );
      }
    } catch (e) {
      console.error("Failed to compute attribution series", e);
      setError("Failed to compute attribution series.");
    } finally {
      setLoading(false);
    }
  }, [ticker, basisMode, period, win, display, plotMode, panes, onPlot]);

  return (
    <ResizableSidebar storageKey="charts-attribution-picker-width" defaultWidth={280}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">Attribution</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose} data-testid="attribution-panel-close">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="p-3 space-y-3">
        {/* Ticker */}
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold">Ticker</Label>
          <Popover open={pop} onOpenChange={setPop}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs w-full justify-between font-mono" data-testid="attribution-ticker-trigger">
                {ticker || "Select ticker"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search..." className="h-8 text-xs" />
                <CommandList className="max-h-[420px]">
                  <CommandEmpty>No ticker found.</CommandEmpty>
                  <CommandGroup>
                    {tickerList.map((t) => (
                      <CommandItem
                        key={t.ticker}
                        value={`${t.ticker} ${t.name}`}
                        onSelect={() => { setTicker(t.ticker); setPop(false); }}
                        className="text-xs"
                      >
                        <span className="font-mono font-bold mr-1">{t.ticker}</span>
                        <span className="truncate text-muted-foreground" title={t.name}>{t.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Basis + period */}
        <div className="space-y-1">
          <Label className="text-[11px]">Basis</Label>
          <div className="flex gap-1">
            <Select value={basisMode} onValueChange={(v) => setBasisMode(v as BasisMode)}>
              <SelectTrigger className="h-7 text-xs flex-1" data-testid="attribution-basis-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto" className="text-xs">Auto (FFO → EPRA → EPS)</SelectItem>
                {BASIS_FAMILIES.map((f) => (
                  <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={(v) => setPeriod(v as BasisPeriod)}>
              <SelectTrigger className="h-7 text-xs w-[72px]" data-testid="attribution-period-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BASIS_PERIODS.map((p) => (
                  <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Rolling window */}
        <div className="space-y-1">
          <Label className="text-[11px]">Rolling Window (trading days)</Label>
          <div className="flex gap-1 flex-wrap">
            <Input
              type="number"
              value={win}
              onChange={(e) => setWin(parseInt(e.target.value) || 63)}
              className="h-7 text-xs bg-background w-16"
              data-testid="attribution-window-input"
            />
            {WINDOW_PRESETS.map((w) => (
              <Button
                key={w.days}
                variant={win === w.days ? "default" : "secondary"}
                size="sm"
                className="h-7 px-1.5 text-[10px]"
                onClick={() => setWin(w.days)}
              >
                {w.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Display mode */}
        <div className="space-y-1">
          <Label className="text-[11px]">Display</Label>
          <Select value={display} onValueChange={(v) => setDisplay(v as "components" | "stacked")}>
            <SelectTrigger className="h-7 text-xs" data-testid="attribution-display-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="components" className="text-xs">Lines: Est / Multiple / Total</SelectItem>
              <SelectItem value="stacked" className="text-xs">Stacked area: Est + Multiple band</SelectItem>
              <SelectItem value="share" className="text-xs">Share of move %: Multiple vs Est</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Plot destination */}
        <div className="space-y-1">
          <Label className="text-[11px]">Plot to</Label>
          <Select value={plotMode} onValueChange={setPlotMode}>
            <SelectTrigger className="h-7 text-xs" data-testid="attribution-plotmode-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new" className="text-xs">New pane</SelectItem>
              {panes.map((p) => (
                <SelectItem key={p.id} value={String(p.id)} className="text-xs">
                  Overlay on {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          className="w-full h-8 text-xs"
          disabled={!ticker || loading}
          onClick={handlePlot}
          data-testid="attribution-plot-button"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Layers className="w-3.5 h-3.5 mr-1" />}
          Plot Attribution
        </Button>

        {error && <p className="text-[10px] text-rose-400">{error}</p>}

        <p className="text-[10px] text-muted-foreground">
          Each point decomposes the trailing N-day price move into the change in the
          earnings estimate vs the change in the valuation multiple (log-%, so the two
          components sum exactly to the total). Same math as the Attribution tab, rolled
          over time.
        </p>
        <p className="text-[10px] text-muted-foreground">
          <span className="text-foreground/80 font-medium">Auto</span> basis picks the
          first family with estimate data: FFO, then EPRA, then EPS.{" "}
          <span className="text-foreground/80 font-medium">Stacked area</span> fills the
          absolute contributions (amber = estimate, blue band above it = multiple).{" "}
          <span className="text-foreground/80 font-medium">Share of move %</span> answers
          "over the window, X% of the move was multiple, Y% estimate revisions" — the
          two lines always sum to 100 (shares of |mult| + |est|).
        </p>
      </div>
    </ResizableSidebar>
  );
}
