// Reconstructed from recovered-bundle/index-CsG73Aq_.js on 2025-01-31
import { lazy, Suspense } from "react";
import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { UniverseProvider } from "@/lib/universeContext";
import { WorkspaceTabProvider } from "@/lib/workspaceContext";
import { UploadProvider } from "@/lib/uploadContext";
import { IndicatorColorsProvider } from "@/lib/indicatorColorsContext";
import {
  BarChart3,
  ListOrdered,
  ScatterChart,
  ArrowRightLeft,
  TrendingUp,
  Link2,
  Gauge,
  Percent,
  Grid3X3,
  Activity,
  Globe,
  Target,
  GitCompareArrows,
  Filter,
  Table2,
  Star,
  Crosshair,
  Shuffle,
  Layers,
  Zap,
  GitMerge,
  BarChart2,
  ChevronDown,
} from "lucide-react";
import DataManager from "@/components/DataManager";
import AutoSaveManager from "@/components/AutoSaveManager";
import CommandPalette from "@/components/CommandPalette";
import ShortcutsHelp from "@/components/ShortcutsHelp";
import { useUpload } from "@/lib/uploadContext";
import { useUniverse } from "@/lib/universeContext";
import { API_BASE } from "@/lib/queryClient";
import { Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";

// ─── Lazy page imports ───────────────────────────────────────────────────────

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Universe = lazy(() => import("@/pages/Universe"));
const GlobalUniverseExplorer = lazy(() => import("@/pages/GlobalUniverseExplorer"));
const Baskets = lazy(() => import("@/pages/Baskets"));
const Ranking = lazy(() => import("@/pages/Ranking"));
const Scatter = lazy(() => import("@/pages/Scatter"));
const FactorBacktest = lazy(() => import("@/pages/FactorBacktest"));
const RelativeStrength = lazy(() => import("@/pages/RelativeStrength"));
const Pairs = lazy(() => import("@/pages/Pairs"));
const PairsScreener = lazy(() => import("@/pages/PairsScreener"));
const Scanner = lazy(() => import("@/pages/Scanner"));
const Macro = lazy(() => import("@/pages/Macro"));
const MacroRegime = lazy(() => import("@/pages/MacroRegime"));
const RatesForward = lazy(() => import("@/pages/RatesForward"));
const YieldCorrelation = lazy(() => import("@/pages/YieldCorrelation"));
const Correlation = lazy(() => import("@/pages/Correlation"));
const Valuation = lazy(() => import("@/pages/Valuation"));
const ValuationRegime = lazy(() => import("@/pages/ValuationRegime"));
const PremiumDiscount = lazy(() => import("@/pages/PremiumDiscount"));
const PremiumDiscountScreener = lazy(() => import("@/pages/PremiumDiscountScreener"));
const Distributions = lazy(() => import("@/pages/Distributions"));
const ValuationReRating = lazy(() => import("@/pages/ValuationReRating"));
const ValuationResidence = lazy(() => import("@/pages/ValuationResidence"));
const DividendSpread = lazy(() => import("@/pages/DividendSpread"));
const Heatmap = lazy(() => import("@/pages/Heatmap"));
const Performance = lazy(() => import("@/pages/Performance"));
const ShortInterest = lazy(() => import("@/pages/ShortInterest"));
const PairRatios = lazy(() => import("@/pages/PairRatios"));
const Screener = lazy(() => import("@/pages/Screener"));
const Ratings = lazy(() => import("@/pages/Ratings"));
const ZScoreOptimizer = lazy(() => import("@/pages/ZScoreOptimizer"));
const PairOptimizer = lazy(() => import("@/pages/PairOptimizer"));
const MomentumOptimizer = lazy(() => import("@/pages/MomentumOptimizer"));
const RSIRegimeOptimizer = lazy(() => import("@/pages/RSIRegimeOptimizer"));
const ComboOptimizer = lazy(() => import("@/pages/ComboOptimizer"));
const ROCOptimizer = lazy(() => import("@/pages/ROCOptimizer"));
const MACrossoverOptimizer = lazy(() => import("@/pages/MACrossoverOptimizer"));
const Oscillators = lazy(() => import("@/pages/Oscillators"));
const RangeOptimizer = lazy(() => import("@/pages/RangeOptimizer"));
const HarsiOptimizer = lazy(() => import("@/pages/HarsiOptimizer"));
const SlowStochOptimizer = lazy(() => import("@/pages/SlowStochOptimizer"));
const DualMAOptimizer = lazy(() => import("@/pages/DualMAOptimizer"));
const TVAOptimizer = lazy(() => import("@/pages/TVAOptimizer"));
const LevelsAndTrendlines = lazy(() => import("@/pages/LevelsAndTrendlines"));
// Standalone Support / Resistance Detector page. The same component is also
// embedded as a panel inside LevelsAndTrendlines; this wires the dedicated route.
const SupportResistance = lazy(() => import("@/components/SupportResistance"));
const Trendlines = lazy(() => import("@/pages/Trendlines"));
const AutoTrendlineBacktest = lazy(() => import("@/pages/AutoTrendlineBacktest"));
const PriceAction = lazy(() => import("@/pages/PriceAction"));
const ROCAnalysis = lazy(() => import("@/pages/ROCAnalysis"));
const SigmaMove = lazy(() => import("@/pages/SigmaMove"));
const Attribution = lazy(() => import("@/pages/Attribution"));
const SimilarSetups = lazy(() => import("@/pages/SimilarSetups"));
const SetupsScreener = lazy(() => import("@/pages/SetupsScreener"));
const PatternScreener = lazy(() => import("@/pages/PatternScreener"));
const Alerts = lazy(() => import("@/pages/Alerts"));
const DataExplorer = lazy(() => import("@/pages/DataExplorer"));
const NotFound = lazy(() => import("@/pages/not-found"));

// ─── Upload status banner ─────────────────────────────────────────────────────

function UploadStatus() {
  const { activeJob, dismissJob, mergePreviewResult } = useUpload();

  // Show merge-preview-ready banner (even after activeJob is dismissed)
  if (mergePreviewResult && (!activeJob || activeJob.status === "complete")) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 rounded bg-amber-500/15 text-amber-400 text-xs font-medium mr-2 animate-in fade-in">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Merge preview ready — open Data Management</span>
        {activeJob && (
          <button onClick={dismissJob} className="ml-1 hover:text-amber-200" data-testid="dismiss-upload">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  if (!activeJob) return null;

  const { status, progress, result, error, workbookName } = activeJob;

  if (status === "complete") {
    return (
      <div className="flex items-center gap-2 px-3 py-1 rounded bg-green-500/15 text-green-400 text-xs font-medium mr-2 animate-in fade-in">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>{result?.tickers} tickers loaded</span>
        <button onClick={dismissJob} className="ml-1 hover:text-green-200" data-testid="dismiss-upload">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-2 px-3 py-1 rounded bg-red-500/15 text-red-400 text-xs font-medium mr-2 animate-in fade-in">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Upload failed</span>
        <button onClick={dismissJob} className="ml-1 hover:text-red-200" data-testid="dismiss-upload-error">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Active: uploading / parsing / writing
  const pct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;
  const label = status === "uploading"
    ? `Uploading ${workbookName}...`
    : status === "writing"
    ? "Finalizing..."
    : progress && progress.total > 0
    ? `Parsing ${progress.current}/${progress.total}: ${progress.ticker}`
    : `Parsing ${workbookName}...`;

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded bg-primary/10 text-primary text-xs font-medium mr-2 min-w-[180px]">
      <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="truncate">{label}</span>
        {pct > 0 && (
          <div className="w-full h-1 bg-primary/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── NavBar ───────────────────────────────────────────────────────────────────

type NavLink = {
  path: string;
  label: string;
  icon: any;
  universeControlled?: boolean;
  group?: { path: string; label: string; icon: any }[];
};

function NavBar() {
  const [location] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Which dropdown group (by its synthetic path key) is currently open
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  // Fixed-position coordinates for the open dropdown portal
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Auto-scroll the active tab into view
  useEffect(() => {
    if (!scrollRef.current) return;
    const active = scrollRef.current.querySelector('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [location]);

  // Close the open dropdown on outside click
  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-nav-dropdown]") || t.closest("[data-nav-dropdown-portal]")) return;
      setOpenGroup(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openGroup]);

  // Position the open dropdown portal under its trigger; keep it tracking scroll/resize
  useEffect(() => {
    if (!openGroup) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const el = triggerRefs.current[openGroup];
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuPos({ left: r.left, top: r.bottom });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [openGroup]);

  const links: NavLink[] = [
    { path: "/", label: "Charts", icon: BarChart3 },
    { path: "/universe", label: "Universe", icon: Globe },
    { path: "/global-universe", label: "Global Universe", icon: Globe },
    { path: "/baskets", label: "Baskets", icon: Grid3X3 },
    {
      path: "__cross_section_group",
      label: "Cross-Section",
      icon: ListOrdered,
      universeControlled: true,
      group: [
        { path: "/ranking", label: "Ranking", icon: ListOrdered },
        { path: "/scatter", label: "XY Scatter", icon: ScatterChart },
        { path: "/factor-backtest", label: "Factor Backtest", icon: TrendingUp },
        { path: "/relative-strength", label: "Relative Strength", icon: TrendingUp },
        { path: "/correlation", label: "Correlation", icon: Link2 },
      ],
    },
    {
      path: "__pairs_group",
      label: "Pairs",
      icon: ArrowRightLeft,
      universeControlled: true,
      group: [
        { path: "/pairs", label: "Compare", icon: ArrowRightLeft },
        { path: "/pair-ratios", label: "Ratios", icon: GitCompareArrows },
      ],
    },
    { path: "/scanner", label: "Scanner", icon: Target, universeControlled: true },
    {
      path: "__macro_group",
      label: "Macro",
      icon: TrendingUp,
      group: [
        { path: "/macro", label: "Dashboard", icon: TrendingUp },
        { path: "/rates-forward", label: "Rates Forward", icon: TrendingUp },
        { path: "/yield-correlation", label: "Yield Corr", icon: Link2 },
        { path: "/regime", label: "Regime", icon: Layers },
      ],
    },
    {
      path: "__valuation_group",
      label: "Valuation",
      icon: Gauge,
      universeControlled: true,
      group: [
        { path: "/valuation", label: "Valuation", icon: Gauge },
        { path: "/val-regime", label: "Val Regime", icon: Layers },
        { path: "/premium-discount", label: "Premium / Discount", icon: Percent },
        { path: "/distributions", label: "Distributions", icon: BarChart3 },
        { path: "/val-rerate", label: "Re-Rating", icon: Percent },
        { path: "/val-residence", label: "Residence", icon: Percent },
      ],
    },
    { path: "/spread", label: "Div Spread", icon: Percent, universeControlled: true },
    { path: "/performance", label: "Performance", icon: Activity, universeControlled: true },
    { path: "/short-interest", label: "Short Interest", icon: Target, universeControlled: true },
    {
      path: "__screeners_group",
      label: "Screeners",
      icon: Filter,
      universeControlled: true,
      group: [
        { path: "/screener", label: "Stock Screener", icon: Filter },
        { path: "/pair-screener", label: "Pair Screener", icon: Filter },
        { path: "/pd-screener", label: "P/D Screener", icon: Filter },
        { path: "/setups-screener", label: "Setups Screener", icon: Target },
        { path: "/pattern-screener", label: "Pattern Screener", icon: Activity },
      ],
    },
    { path: "/ratings", label: "Ratings", icon: Star, universeControlled: true },
    {
      path: "__optimizers_group",
      label: "Optimizers",
      icon: Crosshair,
      universeControlled: true,
      group: [
        { path: "/z-optimizer", label: "Z Optimizer", icon: Crosshair },
        { path: "/pair-optimizer", label: "Pair Opt", icon: Shuffle },
        { path: "/momentum", label: "Momentum", icon: Zap },
        { path: "/rsi-regime", label: "RSI Regime", icon: BarChart2 },
        { path: "/combo-optimizer", label: "Combo Opt", icon: Shuffle },
        { path: "/roc-optimizer", label: "ROC Opt", icon: Activity },
        { path: "/ma-crossover", label: "MA Cross", icon: GitMerge },
        { path: "/oscillators", label: "Oscillators", icon: Activity },
        { path: "/range-optimizer", label: "Range Opt", icon: Crosshair },
        { path: "/harsi-optimizer", label: "HARSI Opt", icon: Crosshair },
        { path: "/slow-stoch-optimizer", label: "SlowStoch Opt", icon: Activity },
        { path: "/dual-ma-optimizer", label: "DualMA Opt", icon: Activity },
        { path: "/tva-optimizer", label: "TVA Opt", icon: Crosshair },
        { path: "/levels", label: "Levels & Trendlines", icon: TrendingUp },
        { path: "/auto-trendline-backtest", label: "Auto Trendline BT", icon: TrendingUp },
      ],
    },
    { path: "/price-action", label: "Price Action", icon: Activity, universeControlled: true },
    { path: "/roc-analysis", label: "ROC Deciles", icon: Crosshair, universeControlled: true },
    { path: "/sigma-move", label: "Sigma Snapshot", icon: Activity, universeControlled: true },
    { path: "/attribution", label: "Attribution", icon: Activity, universeControlled: true },
    { path: "/similar-setups", label: "Similar Setups", icon: Filter },
    { path: "/alerts", label: "Alerts", icon: Target },
    { path: "/data", label: "Data", icon: Table2 },
  ];

  return (
    <nav className="flex items-center bg-card border-b border-border flex-shrink-0 min-h-[2.25rem]">
      <div className="flex items-center gap-1.5 px-2 flex-shrink-0">
        <BarChart3 className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold tracking-tight text-foreground">REIT<br/>Viz</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin py-1">
        <div className="flex items-center gap-1 px-1 w-max">
          {links.map(({ path, label, icon: Icon, universeControlled, group }) => {
            const isUniverse = path === "/universe";
            if (group) {
              const groupActive = group.some(
                (g) => location === g.path || location.startsWith(g.path)
              );
              const isOpen = openGroup === path;
              return (
                <div key={path} className="relative" data-nav-dropdown>
                  <button
                    ref={(el) => {
                      triggerRefs.current[path] = el;
                    }}
                    onClick={() => setOpenGroup(isOpen ? null : path)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-medium transition-colors whitespace-nowrap border-b-2 ${
                      groupActive
                        ? "border-amber-500 text-amber-200 bg-amber-500/5"
                        : universeControlled
                          ? "border-transparent text-red-400/50 hover:text-foreground hover:bg-accent"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                    data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
                    data-active={groupActive ? "true" : undefined}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                    {universeControlled && (
                      <span className="w-1 h-1 rounded-full bg-red-500 -mt-1.5 -ml-0.5" />
                    )}
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isOpen &&
                    menuPos &&
                    createPortal(
                      <div
                        data-nav-dropdown-portal
                        style={{ position: "fixed", left: menuPos.left, top: menuPos.top + 2 }}
                        className="z-[1000] bg-card border border-border rounded shadow-lg min-w-[160px] py-1"
                      >
                        {group.map((g) => {
                          const itemActive =
                            location === g.path || location.startsWith(g.path);
                          const GIcon = g.icon;
                          return (
                            <Link key={g.path} href={g.path}>
                              <button
                                onClick={() => setOpenGroup(null)}
                                className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs font-medium text-left transition-colors ${
                                  itemActive
                                    ? "bg-amber-500/10 text-amber-200"
                                    : "text-foreground hover:bg-accent"
                                }`}
                                data-testid={`nav-dropdown-${g.label.toLowerCase().replace(" ", "-")}`}
                              >
                                <GIcon className="w-3 h-3" />
                                {g.label}
                              </button>
                            </Link>
                          );
                        })}
                      </div>,
                      document.body
                    )}
                </div>
              );
            }
            const isActive = location === path || (path !== "/" && location.startsWith(path));
            const active = path === "/" ? location === "/" : isActive;
            return (
              <Link key={path} href={path}>
                <button
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-medium transition-colors whitespace-nowrap border-b-2 ${
                    active
                      ? isUniverse
                        ? "border-red-500 text-red-300 bg-red-500/10"
                        : "border-amber-500 text-amber-200 bg-amber-500/5"
                      : isUniverse
                        ? "border-transparent text-red-400/80 hover:text-red-300 hover:bg-red-500/5"
                        : universeControlled
                          ? "border-transparent text-red-400/50 hover:text-foreground hover:bg-accent"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  data-testid={`nav-${label.toLowerCase().replace(" ", "-")}`}
                  data-active={active ? "true" : undefined}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                  {universeControlled && (
                    <span className="w-1 h-1 rounded-full bg-red-500 -mt-1.5 -ml-0.5" />
                  )}
                </button>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center flex-shrink-0 pr-2">
        <UploadStatus />
        <DataManager />
      </div>
    </nav>
  );
}

// ─── Status bar ───────────────────────────────────────────────────────────────
// Faithful reconstruction of the production status bar (RHe in the bundle).
// Renders market status, autosave, quotes, universe count, env, and a cmd-k entry.

const MARKET_LABEL: Record<string, string> = {
  REGULAR: "OPEN",
  PRE: "PRE",
  POST: "POST",
  CLOSED: "CLOSED",
  UNKNOWN: "—",
};
const MARKET_DOT: Record<string, string> = {
  REGULAR: "bg-green-500",
  PRE: "bg-amber-500",
  POST: "bg-amber-500",
  CLOSED: "bg-red-500/80",
  UNKNOWN: "bg-muted-foreground/40",
};
const MARKET_TEXT: Record<string, string> = {
  REGULAR: "text-green-400",
  PRE: "text-amber-400",
  POST: "text-amber-400",
  CLOSED: "text-red-400/90",
  UNKNOWN: "text-muted-foreground",
};

function formatAgo(ts: number | null): string {
  if (!ts) return "—";
  const e = Math.max(0, Date.now() - ts);
  return e < 5e3
    ? "just now"
    : e < 6e4
    ? `${Math.floor(e / 1e3)}s ago`
    : e < 36e5
    ? `${Math.floor(e / 6e4)}m ago`
    : `${Math.floor(e / 36e5)}h ago`;
}

function StatusDivider() {
  return <span className="h-3 w-px bg-border" />;
}

function StatusBar({ onOpenPalette }: { onOpenPalette?: () => void }) {
  // Re-render every 10s so relative "ago" timestamps stay fresh (LHe in bundle)
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1e4);
    return () => clearInterval(id);
  }, []);

  // Universe filter counts come from the live UniverseContext.
  const { filteredCount, totalCount, isFiltered } = useUniverse();

  // Market state / autosave / quote-poll data sources are not present in this
  // reconstruction; render sensible static/empty states (never crash).
  const marketState = "UNKNOWN";
  const autosaveState = "idle" as "saving" | "error" | "saved" | "idle";
  const lastSavedAt: number | null = null;
  const lastQuoteFetchedAt: number | null = null;
  const isDeployed = API_BASE !== "";

  const saveLabel =
    autosaveState === "saving"
      ? "saving…"
      : autosaveState === "error"
      ? "save error"
      : autosaveState === "saved" && lastSavedAt
      ? `saved ${formatAgo(lastSavedAt)}`
      : "idle";
  const saveClass =
    autosaveState === "saving"
      ? "text-amber-400"
      : autosaveState === "error"
      ? "text-red-400"
      : autosaveState === "saved"
      ? "text-muted-foreground"
      : "text-muted-foreground/70";

  return (
    <div
      className="flex items-center gap-4 px-3 h-6 bg-card border-t border-border text-[10px] font-mono text-muted-foreground select-none flex-shrink-0"
      data-testid="status-bar"
    >
      <div className="flex items-center gap-1.5" data-testid="status-market">
        <span className={`w-1.5 h-1.5 rounded-full ${MARKET_DOT[marketState]}`} />
        <span className={`uppercase tracking-wider ${MARKET_TEXT[marketState]}`}>
          MKT {MARKET_LABEL[marketState]}
        </span>
      </div>
      <StatusDivider />
      <div className="flex items-center gap-1.5" data-testid="status-autosave">
        <span className="text-muted-foreground/60 uppercase tracking-wider">SAVE</span>
        <span className={saveClass}>{saveLabel}</span>
      </div>
      <StatusDivider />
      <div className="flex items-center gap-1.5" data-testid="status-quotes">
        <span className="text-muted-foreground/60 uppercase tracking-wider">QTE</span>
        <span className="text-muted-foreground">
          {lastQuoteFetchedAt ? formatAgo(lastQuoteFetchedAt) : "—"}
        </span>
      </div>
      <StatusDivider />
      <div className="flex items-center gap-1.5" data-testid="status-universe">
        <span className="text-muted-foreground/60 uppercase tracking-wider">UNI</span>
        <span className={isFiltered ? "text-amber-400" : "text-muted-foreground"}>
          {filteredCount}
          <span className="text-muted-foreground/60">/{totalCount}</span>
        </span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5" data-testid="status-env">
        <span className="text-muted-foreground/60 uppercase tracking-wider">ENV</span>
        <span className={isDeployed ? "text-amber-400" : "text-muted-foreground"}>
          {isDeployed ? "DEPLOYED" : "LOCAL"}
        </span>
      </div>
      <StatusDivider />
      <button
        onClick={onOpenPalette}
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        data-testid="status-cmdk"
      >
        <span className="text-muted-foreground/60 uppercase tracking-wider">CMD</span>
        <span className="border border-border rounded px-1 text-[9px]">⌘K</span>
      </button>
    </div>
  );
}

// ─── Command-palette / shortcuts orchestration ─────────────────────────────────
// Digit (1-9) navigation targets (bundle JYe).
const NUM_NAV = [
  "/",
  "/universe",
  "/ranking",
  "/scatter",
  "/pairs",
  "/macro",
  "/correlation",
  "/performance",
  "/sigma-move",
];

// Command-palette page list (bundle ZYe).
const PAGES = [
  { path: "/", label: "Charts" },
  { path: "/universe", label: "Universe" },
  { path: "/ranking", label: "Ranking" },
  { path: "/scatter", label: "XY Scatter" },
  { path: "/factor-backtest", label: "Factor Backtest" },
  { path: "/relative-strength", label: "Relative Strength Engine" },
  { path: "/pairs", label: "Pairs" },
  { path: "/pair-screener", label: "Pair Screener" },
  { path: "/macro", label: "Macro" },
  { path: "/regime", label: "Regime" },
  { path: "/correlation", label: "Correlation" },
  { path: "/valuation", label: "Valuation" },
  { path: "/spread", label: "Div Spread" },
  { path: "/performance", label: "Performance" },
  { path: "/short-interest", label: "Short Interest" },
  { path: "/pair-ratios", label: "Pair Ratios" },
  { path: "/screener", label: "Screener" },
  { path: "/ratings", label: "Ratings" },
  { path: "/z-optimizer", label: "Z Optimizer" },
  { path: "/pair-optimizer", label: "Pair Opt" },
  { path: "/val-regime", label: "Val Regime" },
  { path: "/momentum", label: "Momentum" },
  { path: "/ma-crossover", label: "MA Crossover" },
  { path: "/roc-optimizer", label: "ROC Optimizer" },
  { path: "/combo-optimizer", label: "Combo Optimizer" },
  { path: "/rsi-regime", label: "RSI Regime" },
  { path: "/oscillators", label: "Oscillators" },
  { path: "/range-optimizer", label: "Range Optimizer" },
  { path: "/harsi-optimizer", label: "HARSI Optimizer" },
  { path: "/slow-stoch-optimizer", label: "Slow Stoch Optimizer" },
  { path: "/dual-ma-optimizer", label: "DualMA Optimizer" },
  { path: "/tva-optimizer", label: "TVA Optimizer" },
  { path: "/levels", label: "Levels & Trendlines" },
  { path: "/support-resistance", label: "Support / Resistance" },
  { path: "/trendlines", label: "Trendlines" },
  { path: "/auto-trendline-backtest", label: "Auto Trendline Backtest" },
  { path: "/price-action", label: "Price Action" },
  { path: "/roc-analysis", label: "ROC Deciles" },
  { path: "/sigma-move", label: "Sigma Snapshot" },
  { path: "/attribution", label: "Attribution" },
  { path: "/premium-discount", label: "Premium / Discount" },
  { path: "/pd-screener", label: "P/D Screener" },
  { path: "/pattern-screener", label: "Pattern Screener" },
  { path: "/distributions", label: "Distributions" },
  { path: "/val-rerate", label: "Valuation Re-Rating" },
  { path: "/val-residence", label: "Valuation Residence" },
  { path: "/similar-setups", label: "Similar Setups" },
  { path: "/setups-screener", label: "Setups Screener" },
  { path: "/rates-forward", label: "Rates Forward" },
  { path: "/yield-correlation", label: "Yield Corr" },
  { path: "/alerts", label: "Alerts" },
  { path: "/baskets", label: "Baskets" },
  { path: "/data", label: "Data" },
];

// ─── App shell ──────────────────────────────────────────────────────────────────
// Inner shell (bundle QYe): holds palette/help state + the global keydown
// orchestration. Lives inside <Router> so wouter's location hook is available.

function AppShell() {
  const [, setLocation] = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const isEditable = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return !!(
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (event.key === "Escape") {
        if (paletteOpen) setPaletteOpen(false);
        if (helpOpen) setHelpOpen(false);
        return;
      }
      if (!isEditable(event.target)) {
        if (event.key === "?") {
          event.preventDefault();
          setHelpOpen((o) => !o);
          return;
        }
        if (/^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const idx = parseInt(event.key, 10) - 1;
          const path = NUM_NAV[idx];
          if (path) {
            event.preventDefault();
            setLocation(path);
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setLocation, paletteOpen, helpOpen]);

  return (
    <>
      <div className="flex flex-col h-screen">
        <NavBar />
        <div className="flex-1 overflow-hidden">
          <ErrorBoundary>
          <Suspense fallback={<div className="flex items-center justify-center h-full gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading page…</div>}>
          <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/universe" component={Universe} />
              <Route path="/global-universe" component={GlobalUniverseExplorer} />
              <Route path="/baskets" component={Baskets} />
              <Route path="/ranking" component={Ranking} />
              <Route path="/scatter" component={Scatter} />
              <Route path="/factor-backtest" component={FactorBacktest} />
              <Route path="/relative-strength" component={RelativeStrength} />
              <Route path="/pairs" component={Pairs} />
              <Route path="/pair-ratios" component={PairRatios} />
              <Route path="/pair-screener" component={PairsScreener} />
              <Route path="/scanner" component={Scanner} />
              <Route path="/macro" component={Macro} />
              <Route path="/regime" component={MacroRegime} />
              <Route path="/rates-forward" component={RatesForward} />
              <Route path="/yield-correlation" component={YieldCorrelation} />
              <Route path="/correlation" component={Correlation} />
              <Route path="/valuation" component={Valuation} />
              <Route path="/val-regime" component={ValuationRegime} />
              <Route path="/premium-discount" component={PremiumDiscount} />
              <Route path="/pd-screener" component={PremiumDiscountScreener} />
              <Route path="/distributions" component={Distributions} />
              <Route path="/val-rerate" component={ValuationReRating} />
              <Route path="/val-residence" component={ValuationResidence} />
              <Route path="/spread" component={DividendSpread} />
              <Route path="/heatmap" component={Heatmap} />
              <Route path="/performance" component={Performance} />
              <Route path="/short-interest" component={ShortInterest} />
              <Route path="/screener" component={Screener} />
              <Route path="/ratings" component={Ratings} />
              <Route path="/setups-screener" component={SetupsScreener} />
              <Route path="/pattern-screener" component={PatternScreener} />
              <Route path="/z-optimizer" component={ZScoreOptimizer} />
              <Route path="/pair-optimizer" component={PairOptimizer} />
              <Route path="/momentum" component={MomentumOptimizer} />
              <Route path="/ma-crossover" component={MACrossoverOptimizer} />
              <Route path="/rsi-regime" component={RSIRegimeOptimizer} />
              <Route path="/combo-optimizer" component={ComboOptimizer} />
              <Route path="/roc-optimizer" component={ROCOptimizer} />
              <Route path="/oscillators" component={Oscillators} />
              <Route path="/range-optimizer" component={RangeOptimizer} />
              <Route path="/harsi-optimizer" component={HarsiOptimizer} />
              <Route path="/slow-stoch-optimizer" component={SlowStochOptimizer} />
              <Route path="/dual-ma-optimizer" component={DualMAOptimizer} />
              <Route path="/tva-optimizer" component={TVAOptimizer} />
              <Route path="/levels" component={LevelsAndTrendlines} />
              <Route path="/support-resistance" component={SupportResistance} />
              <Route path="/trendlines" component={Trendlines} />
              <Route path="/auto-trendline-backtest" component={AutoTrendlineBacktest} />
              <Route path="/price-action" component={PriceAction} />
              <Route path="/roc-analysis" component={ROCAnalysis} />
              <Route path="/sigma-move" component={SigmaMove} />
              <Route path="/attribution" component={Attribution} />
              <Route path="/similar-setups" component={SimilarSetups} />
              <Route path="/alerts" component={Alerts} />
              <Route path="/data" component={DataExplorer} />
              <Route component={NotFound} />
            </Switch>
            </Suspense>
            </ErrorBoundary>
          </div>
          <StatusBar onOpenPalette={() => setPaletteOpen(true)} />
        </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} pages={PAGES} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UploadProvider>
      <UniverseProvider>
      <WorkspaceTabProvider>
      <IndicatorColorsProvider>
      <AutoSaveManager />
      <Router hook={useHashLocation}>
        <AppShell />
      </Router>
      </IndicatorColorsProvider>
      </WorkspaceTabProvider>
      </UniverseProvider>
      </UploadProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
