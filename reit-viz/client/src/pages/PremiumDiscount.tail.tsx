                  <span className="text-sky-300">
                    {compareMode === "peer" ? "A / peer median" : compareMode === "ticker" ? `A / ${peerTicker || "—"}` : `${groupALabel} / ${groupBLabel}`}
                  </span>
                )}
              </div>
            </div>
            <div ref={rawRatioContainerRef} className="flex-1 min-h-0" data-testid="chart-raw-ratio" />
          </div>

          {/* RV Verdict history chart */}
          <div className="flex flex-col bg-card flex-1 min-h-0" style={{ display: visibleCharts.has("rvVerdictTs") ? undefined : "none" }}>
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                RV Verdict (history){" "}
                <span className="text-muted-foreground/60 normal-case tracking-normal">
                  green = attractive · red = expensive · gray = neutral
                </span>
              </span>
              <div className="flex items-center gap-3 text-[10px] font-mono">
                {(() => {
                  const lastEntry = rvVerdictData.length ? rvVerdictData[rvVerdictData.length - 1] : null;
                  if (!lastEntry) return <span className="text-muted-foreground/60">—</span>;
                  const labelClass =
                    lastEntry.label === "Attractive" ? "text-emerald-400" :
                    lastEntry.label === "Expensive" ? "text-rose-400" :
                    "text-muted-foreground";
                  return (
                    <span className={labelClass} data-testid="hover-rvverdict">
                      {lastEntry.label} ({lastEntry.score >= 0 ? "+" : ""}{lastEntry.score})
                    </span>
                  );
                })()}
              </div>
            </div>
            <div ref={rvVerdictContainerRef} className="flex-1 min-h-0" data-testid="chart-rv-verdict" />
          </div>
        </div>

        {/* Right col: scatter plot */}
        <div className="flex flex-col bg-card min-h-0 lg:col-span-2">
          <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Growth × Premium (history)
            </span>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <div className="flex border border-border rounded overflow-hidden">
                <button
                  onClick={() => setScatterView("heatmap")}
                  className={`px-2 py-0.5 transition-colors ${scatterView === "heatmap" ? "bg-amber-500/15 text-amber-300" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                  data-testid="btn-scatter-heatmap"
                  title="Density heatmap — best for dense, multi-year history"
                >
                  Heatmap
                </button>
                <button
                  onClick={() => setScatterView("points")}
                  className={`px-2 py-0.5 transition-colors border-l border-border ${scatterView === "points" ? "bg-amber-500/15 text-amber-300" : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                  data-testid="btn-scatter-points"
                  title="Point cloud — each dot is one trading day, with age fade"
                >
                  Points
                </button>
              </div>
              {pinDate && <span className="text-green-400">pin</span>}
              {periodFilter && <span className="text-sky-400">filter</span>}
              <span className="text-amber-400">today</span>
            </div>
          </div>

          {/* Scatter controls: pin date + highlight range */}
          <div className="px-3 py-2 border-b border-border flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5" /> Pin date
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={pinDate}
                  onChange={(e) => setPinDate(e.target.value)}
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[150px] text-foreground"
                  data-testid="input-pin-date"
                />
                {pinDate && (
                  <button
                    onClick={() => setPinDate("")}
                    className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent"
                    title="Clear pin"
                    data-testid="btn-clear-pin"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" /> Highlight range
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={(() => {
                    const m = periodFilter.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
                    return m ? m[1] : "";
                  })()}
                  onChange={(e) => {
                    const start = e.target.value;
                    const m = periodFilter.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
                    const end = m ? m[2] : "";
                    setPeriodFilter(start && end ? `${start}..${end}` : start ? `${start}..${start}` : "");
                  }}
                  title="Start date"
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[140px] text-foreground placeholder:text-muted-foreground/50 [color-scheme:dark]"
                  data-testid="input-period-start"
                />
                <span className="text-[10px] font-mono text-muted-foreground">to</span>
                <input
                  type="date"
                  value={(() => {
                    const m = periodFilter.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
                    return m ? m[2] : "";
                  })()}
                  onChange={(e) => {
                    const end = e.target.value;
                    const m = periodFilter.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
                    const start = m ? m[1] : "";
                    setPeriodFilter(start && end ? `${start}..${end}` : end ? `${end}..${end}` : "");
                  }}
                  title="End date"
                  className="text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[140px] text-foreground placeholder:text-muted-foreground/50 [color-scheme:dark]"
                  data-testid="input-period-end"
                />
                {periodFilter && (
                  <button
                    onClick={() => setPeriodFilter("")}
                    className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent"
                    title="Clear filter"
                    data-testid="btn-clear-period"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            {periodFilter && (
              <span className="text-[10px] font-mono text-sky-400 ml-auto">
                {(() => {
                  const filterFn = parsePeriodFilter(periodFilter);
                  if (!filterFn) return "invalid format";
                  const growthMap = new Map<string, number>();
                  for (const pt of growthSeries ?? []) growthMap.set(pt.time as string, pt.value);
                  let count = 0;
                  for (const pt of premiumSeries ?? []) {
                    if (growthMap.has(pt.time as string) && filterFn(pt.time as string)) count++;
                  }
                  return `${count} dots highlighted`;
                })()}
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 relative">
            <canvas ref={scatterCanvasRef} className="w-full h-full block" data-testid="canvas-scatter" />
          </div>

          <div className="px-3 py-1.5 border-t border-border text-[9px] font-mono text-muted-foreground/70 leading-snug">
            {scatterView === "heatmap" ? (
              <>
                Each cell shows how many trading days landed in that (Δgrowth, premium) bucket — brighter = more frequent. Top-right = expensive AND faster-growing than{" "}
                {compareMode === "peer" ? "peers" : compareMode === "ticker" ? peerTicker || "comparison" : compareMode === "basket" ? basketLabel : groupBLabel}
                ; bottom-left = cheap AND slower-growing. Switch to Points to see individual days.
              </>
            ) : (
              <>
                Each dot is one trading day. Older points fade purple→amber. Top-right = expensive AND faster-growing than{" "}
                {compareMode === "peer" ? "peers" : compareMode === "ticker" ? peerTicker || "comparison" : compareMode === "basket" ? basketLabel : groupBLabel}
                ; bottom-left = cheap AND slower-growing. Pin a date or pick a start/end date range to inspect specific windows.
              </>
            )}
          </div>
        </div>
      </div>

      {/* Basket editor modal */}
      {showBasketEditor && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-24"
          onClick={(e) => { if (e.target === e.currentTarget) setShowBasketEditor(false); }}
          style={{ background: "rgba(0,0,0,0.55)" }}
        >
          <BasketEditorPanel
            tickers={tickers}
            onClose={() => setShowBasketEditor(false)}
            initialBasketId={basketId || undefined}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface HoverValueProps {
  hoverTime: string | null;
  value: number | undefined;
  format: (v: number) => string;
  color: string;
  testId: string;
}

function HoverValue({ hoverTime, value, format, color, testId }: HoverValueProps) {
  if (!hoverTime) return null;
  const display = value != null && Number.isFinite(value) ? format(value) : "—";
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-mono" data-testid={testId}>
      <span className="text-muted-foreground">{hoverTime}</span>
      <span className={`${color} tabular-nums font-semibold`}>{display}</span>
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "rich" | "cheap" | "neutral";
}

function StatCard({ label, value, sub, tone }: StatCardProps) {
  const valueClass = tone === "rich" ? "text-red-400" : tone === "cheap" ? "text-green-400" : "text-foreground";
  const ToneIcon = tone === "rich" ? TrendingUp : tone === "cheap" ? TrendingDown : null;
  return (
    <div className="bg-card px-3 py-2 flex flex-col gap-0.5">
      <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-base font-mono font-semibold flex items-center gap-1 ${valueClass}`}>
        {ToneIcon && <ToneIcon className="w-3.5 h-3.5" />}
        {value}
      </span>
      <span className="text-[9px] font-mono text-muted-foreground/70 truncate">{sub}</span>
    </div>
  );
}

interface SimilarStats {
  n: number;
  median: number;
  mean: number;
  hitRate: number;
  p25: number;
  p75: number;
}

interface SimilarStatsCardProps {
  label: string;
  stats: SimilarStats | null | undefined;
}

function SimilarStatsCard({ label, stats }: SimilarStatsCardProps) {
  if (!stats) {
    return (
      <div className="bg-card px-3 py-2.5 flex flex-col gap-1">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-base font-mono text-muted-foreground/50">—</span>
        <span className="text-[9px] font-mono text-muted-foreground/60">no data</span>
      </div>
    );
  }
  const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}pp`;
  const valueClass = stats.median > 0 ? "text-green-400" : stats.median < 0 ? "text-red-400" : "text-foreground";
  return (
    <div className="bg-card px-3 py-2.5 flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-[9px] font-mono text-muted-foreground/70">n={stats.n}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-base font-mono font-semibold ${valueClass}`}>{fmt(stats.median)}</span>
        <span className="text-[10px] font-mono text-muted-foreground">median</span>
      </div>
      <div className="text-[9px] font-mono text-muted-foreground/80 flex flex-wrap gap-x-3">
        <span>mean {fmt(stats.mean)}</span>
        <span>hit {stats.hitRate.toFixed(0)}%</span>
      </div>
      <div className="text-[9px] font-mono text-muted-foreground/60 flex flex-wrap gap-x-3">
        <span>p25 {fmt(stats.p25)}</span>
        <span>p75 {fmt(stats.p75)}</span>
      </div>
    </div>
  );
}
