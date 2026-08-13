/**
 * Shared "active indicators" chip row — the Current Layout chips on the
 * Charts sidebar and the Pairs panel's equivalent. One chip per indicator
 * (per pane GROUP for sub-pane indicators), each with show/hide (sub-panes),
 * a hover ✕ delete, and a ⋮ menu (Hide, Solo, per-group Labels/Px-line,
 * Delete), plus a clear-all trash for the whole pane/chart.
 *
 * Key spaces differ per surface: Charts sub-panes use bare/instance keys
 * ("rsi", "rsi#i2", registry ids); Pairs prefixes registry panes with "reg:"
 * and renders Heikin-Ashi as a main-chart overlay instead of a sub-pane —
 * `opts` covers both.
 */
import { indicatorPeriods, PANE_OVERLAY_TYPES, overlayPaneLabel, type ActiveIndicators } from "@/components/ChartPane";
import { ALL_REGISTRY_INDICATORS } from "@/lib/indicatorRegistry";
import {
  getInstances,
  paneGroups,
  subChartKeyFor,
  instanceLabel,
  badgeChromeState,
  type BadgeDel,
} from "@/lib/indicatorInstances";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Eye, EyeOff, X, MoreVertical, Trash2 } from "lucide-react";

export interface IndicatorBadge {
  label: string;
  /** Set for indicators rendering as their own subplot — the chip becomes a
   *  show/hide toggle (hiddenSubCharts key). */
  subChart?: string;
  hidden?: boolean;
  /** How to REMOVE the indicator (hover ✕ / menu Delete — deleteIndicatorBadge). */
  del?: BadgeDel;
}

export type BadgeOpts = {
  /** Registry sub-pane keys carry a "reg:" prefix (Pairs key space). */
  regPrefix?: boolean;
  /** Heikin-Ashi renders as a main-chart overlay, not a sub-pane (Pairs). */
  haAsOverlay?: boolean;
};

/** Compact badges for a pane's enabled indicators. */
export function indicatorBadges(ind?: ActiveIndicators, opts: BadgeOpts = {}): IndicatorBadge[] {
  if (!ind) return [];
  const hiddenSet = new Set(ind.hiddenSubCharts ?? []);
  const out: IndicatorBadge[] = [];
  const sub = (label: string, subChart: string) =>
    out.push({ label, subChart, hidden: hiddenSet.has(subChart), del: { kind: "sub", key: subChart } });
  for (const k of ["sma", "ema", "hma", "wma", "dema", "tema", "kama", "frama", "t3", "alma", "lsma", "slsma"]) {
    const ps = indicatorPeriods((ind as any)[k]);
    if (ps.length) out.push({ label: `${k.toUpperCase()} ${ps.join("/")}`, del: { kind: "ma", key: k } });
  }
  // Instance-aware sub-pane indicators: one chip per pane GROUP, labeled by
  // its instance(s) ("RSI 14W", "ROC 12 · ROC 20"), keyed by the group's
  // sub-chart key so hide/show targets exactly that pane.
  const subGroups = (baseId: string, prefix = "") => {
    for (const g of paneGroups(ind, baseId)) {
      const label = g.instances.map((i) => instanceLabel(baseId, i)).join(" · ");
      sub(label, `${prefix}${subChartKeyFor(baseId, g.group)}`);
    }
  };
  subGroups("rsi");
  subGroups("macd");
  // Bollinger draws on the price chart — plain badge per instance.
  for (const inst of getInstances(ind, "bollinger")) {
    out.push({ label: instanceLabel("bollinger", inst), del: { kind: "inst", id: "bollinger", iid: inst.iid } });
  }
  subGroups("atr");
  subGroups("roc");
  subGroups("stochastic");
  if ((ind as any).heikinAshi) {
    if (opts.haAsOverlay) out.push({ label: "HA", del: { kind: "sub", key: "ha" } });
    else sub("HA", "ha");
  }
  subGroups("obv");
  if (ind.mean) out.push({ label: ind.mean.rolling ? `Mean ${ind.mean.period}` : "Mean", del: { kind: "flag", field: "mean" } });
  if ((ind as any).vwap) out.push({ label: "VWAP", del: { kind: "flag", field: "vwap" } });
  if (ind.fractalLines) out.push({ label: "Fractals", del: { kind: "flag", field: "fractalLines" } });
  const regPrefix = opts.regPrefix ? "reg:" : "";
  for (const def of ALL_REGISTRY_INDICATORS) {
    if (def.renderTarget === "pane") subGroups(def.id, regPrefix);
    else for (const inst of getInstances(ind, def.id)) {
      out.push({ label: instanceLabel(def.id, inst), del: { kind: "inst", id: def.id, iid: inst.iid } });
    }
  }
  // Indicator-on-indicator overlays: MACD/RSI/ROC/Autocorr render as their
  // own sub-chart pane (hide/show like any subplot); same-domain overlays
  // (MAs, Bollinger, …) stay plain badges.
  for (const o of ind.indicatorOverlays ?? []) {
    if (PANE_OVERLAY_TYPES.has(o.type)) sub(overlayPaneLabel(o), `ovl:${o.id}`);
    else out.push({ label: overlayPaneLabel(o), del: { kind: "ovl", id: o.id } });
  }
  return out;
}

/** Every sub-pane key currently active on a pane (instance groups, HA when a
 *  sub-pane, ovl panes) — drives the chip menu's Solo action. */
export function allSubPaneKeys(ind: ActiveIndicators, opts: BadgeOpts = {}): string[] {
  const keys: string[] = [];
  const push = (baseId: string, prefix = "") => {
    for (const g of paneGroups(ind, baseId)) keys.push(`${prefix}${subChartKeyFor(baseId, g.group)}`);
  };
  for (const b of ["rsi", "macd", "atr", "roc", "stochastic", "obv"]) push(b);
  if ((ind as any).heikinAshi && !opts.haAsOverlay) keys.push("ha");
  const regPrefix = opts.regPrefix ? "reg:" : "";
  for (const def of ALL_REGISTRY_INDICATORS) if (def.renderTarget === "pane") push(def.id, regPrefix);
  for (const o of ind.indicatorOverlays ?? []) if (PANE_OVERLAY_TYPES.has(o.type)) keys.push(`ovl:${o.id}`);
  return keys;
}

/** The chip row itself. Renders null when the pane has no indicators. */
export function IndicatorChipsRow({
  ind,
  idKey,
  opts,
  onToggleSubChart,
  onDelete,
  onBadgeChrome,
  onSetHiddenSubCharts,
  onClearIndicators,
  className = "flex flex-wrap gap-0.5 pl-4 pb-0.5",
}: {
  ind?: ActiveIndicators;
  /** Testid suffix — the pane id (Charts) or chart id (Pairs). */
  idKey: string | number;
  opts?: BadgeOpts;
  onToggleSubChart?: (type: string) => void;
  onDelete?: (del: BadgeDel) => void;
  onBadgeChrome?: (del: BadgeDel, patch: { labelsOff?: boolean; priceLineOff?: boolean }) => void;
  onSetHiddenSubCharts?: (hidden: string[] | undefined) => void;
  onClearIndicators?: () => void;
  className?: string;
}) {
  const badges = indicatorBadges(ind, opts);
  if (badges.length === 0) return null;
  const entry = "block w-full text-left text-[11px] px-1.5 py-1 rounded hover:bg-accent whitespace-nowrap";
  return (
    <div className={className} data-testid={`layout-indicators-${idKey}`}>
      {badges.map((b, bi) => (
        // subChart keys are unique per pane group; labels can repeat
        // (two "RSI 14" instances in separate panes).
        <span
          key={b.subChart ?? `${b.label}-${bi}`}
          className={`group/chip inline-flex items-center rounded text-[9px] leading-tight whitespace-nowrap transition-colors ${
            b.hidden ? "bg-muted text-muted-foreground/60" : "bg-primary/10 text-primary/80"
          }`}
        >
          {b.subChart && onToggleSubChart ? (
            <button
              type="button"
              onClick={() => onToggleSubChart(b.subChart!)}
              title={b.hidden ? `Show the ${b.label} subplot` : `Hide the ${b.label} subplot (keeps its settings)`}
              data-testid={`layout-subchart-${idKey}-${b.subChart}`}
              className={`flex items-center gap-0.5 px-1 py-px rounded-l ${
                b.hidden ? "line-through hover:text-foreground" : "hover:bg-primary/20"
              }`}
            >
              {b.hidden ? <EyeOff className="w-2.5 h-2.5 shrink-0" /> : <Eye className="w-2.5 h-2.5 shrink-0 opacity-50" />}
              {b.label}
            </button>
          ) : (
            <span className="px-1 py-px">{b.label}</span>
          )}
          {b.del && (onBadgeChrome || onDelete || onSetHiddenSubCharts) && (() => {
            const chrome = ind && b.del ? badgeChromeState(ind, b.del) : null;
            return (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title={`${b.label} actions`}
                    data-testid={`layout-menu-${idKey}-${b.subChart ?? bi}`}
                    className="px-0 py-px opacity-0 group-hover/chip:opacity-100 hover:text-foreground transition-opacity"
                  >
                    <MoreVertical className="w-2.5 h-2.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto min-w-[8rem] p-1" align="start">
                  <div className="text-[9px] text-muted-foreground/70 px-1.5 py-0.5 uppercase tracking-wider truncate">{b.label}</div>
                  {b.subChart && onToggleSubChart && (
                    <button type="button" className={entry} data-testid="chip-hide"
                      onClick={() => onToggleSubChart(b.subChart!)}>
                      {b.hidden ? "Show subplot" : "Hide subplot"}
                    </button>
                  )}
                  {b.subChart && onSetHiddenSubCharts && ind && (
                    <button type="button" className={entry} data-testid="chip-solo"
                      onClick={() => {
                        // Solo = hide every OTHER sub-pane; soloing again unhides all.
                        const others = allSubPaneKeys(ind, opts).filter((k) => k !== b.subChart);
                        const hidden = new Set(ind.hiddenSubCharts ?? []);
                        const soloed = others.length > 0 && others.every((k) => hidden.has(k)) && !hidden.has(b.subChart!);
                        onSetHiddenSubCharts(soloed ? undefined : others);
                      }}>
                      Solo (again to unhide all)
                    </button>
                  )}
                  {chrome && onBadgeChrome && (
                    <button type="button" className={entry} data-testid="chip-labels"
                      onClick={() => onBadgeChrome(b.del!, { labelsOff: !chrome.labelsOff })}>
                      {chrome.labelsOff ? "Show axis labels" : "Hide axis labels"}
                    </button>
                  )}
                  {chrome && onBadgeChrome && (
                    <button type="button" className={entry} data-testid="chip-pxline"
                      onClick={() => onBadgeChrome(b.del!, { priceLineOff: !chrome.priceLineOff })}>
                      {chrome.priceLineOff ? "Show price line" : "Hide price line"}
                    </button>
                  )}
                  {onDelete && (
                    <button type="button" className={`${entry} text-destructive hover:text-destructive`} data-testid="chip-delete"
                      onClick={() => onDelete(b.del!)}>
                      Delete
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            );
          })()}
          {b.del && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(b.del!)}
              title={`Remove ${b.label} from this pane`}
              data-testid={`layout-del-${idKey}-${bi}`}
              className="px-0.5 py-px rounded-r opacity-0 group-hover/chip:opacity-100 hover:text-destructive transition-opacity"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </span>
      ))}
      {onClearIndicators && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Remove ALL indicators from this pane"
              data-testid={`layout-clear-indicators-${idKey}`}
              className="px-1 py-px rounded text-muted-foreground/50 hover:text-destructive"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="text-[10px] text-muted-foreground mb-1.5">
              Clear {badges.length} indicator{badges.length === 1 ? "" : "s"} from this pane?
            </div>
            <button
              type="button"
              className="w-full h-6 px-2 text-[10px] rounded border border-destructive/50 text-destructive hover:bg-destructive/10"
              data-testid="layout-clear-indicators-confirm"
              onClick={onClearIndicators}
            >
              Clear all
            </button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
