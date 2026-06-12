// Reconstructed from recovered-bundle/index-CsG73Aq_.js on 2025-01-31
import { lazy, Suspense } from "react";
import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useEffect, useRef } from "react";
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
} from "lucide-react";
import DataManager from "@/components/DataManager";
import AutoSaveManager from "@/components/AutoSaveManager";
import { useUpload } from "@/lib/uploadContext";
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

function NavBar() {
  const [location] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the active tab into view
  useEffect(() => {
    if (!scrollRef.current) return;
    const active = scrollRef.current.querySelector('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [location]);

  const links: { path: string; label: string; icon: any; universeControlled?: boolean }[] = [
    { path: "/", label: "Charts", icon: BarChart3, universeControlled: true },
    { path: "/universe", label: "Universe", icon: Globe },
    { path: "/global-universe", label: "Global Universe", icon: Globe },
    { path: "/baskets", label: "Baskets", icon: Grid3X3 },
    { path: "/ranking", label: "Ranking", icon: ListOrdered, universeControlled: true },
    { path: "/scatter", label: "XY Scatter", icon: ScatterChart, universeControlled: true },
    { path: "/factor-backtest", label: "Factor Backtest", icon: TrendingUp, universeControlled: true },
    { path: "/relative-strength", label: "Rel Strength", icon: TrendingUp, universeControlled: true },
    { path: "/pairs", label: "Pairs", icon: ArrowRightLeft },
    { path: "/pair-ratios", label: "Pair Ratios", icon: GitCompareArrows, universeControlled: true },
    { path: "/pair-screener", label: "Pair Screener", icon: Filter, universeControlled: true },
    { path: "/scanner", label: "Scanner", icon: Target, universeControlled: true },
    { path: "/macro", label: "Macro", icon: TrendingUp },
    { path: "/regime", label: "Regime", icon: Layers },
    { path: "/rates-forward", label: "Rates Forward", icon: TrendingUp },
    { path: "/yield-correlation", label: "Yield Corr", icon: Link2 },
    { path: "/correlation", label: "Correlation", icon: Link2, universeControlled: true },
    { path: "/valuation", label: "Valuation", icon: Gauge, universeControlled: true },
    { path: "/val-regime", label: "Val Regime", icon: Layers, universeControlled: true },
    { path: "/premium-discount", label: "Premium/Discount", icon: Percent, universeControlled: true },
    { path: "/pd-screener", label: "P/D Screener", icon: Filter, universeControlled: true },
    { path: "/distributions", label: "Distributions", icon: BarChart2, universeControlled: true },
    { path: "/spread", label: "Div Spread", icon: Percent, universeControlled: true },
    { path: "/heatmap", label: "Rel Value", icon: Grid3X3, universeControlled: true },
    { path: "/performance", label: "Performance", icon: Activity, universeControlled: true },
    { path: "/short-interest", label: "Short Interest", icon: Target, universeControlled: true },
    { path: "/screener", label: "Screener", icon: Filter, universeControlled: true },
    { path: "/setups-screener", label: "Setups Screener", icon: Filter, universeControlled: true },
    { path: "/pattern-screener", label: "Pattern Screener", icon: Activity, universeControlled: true },
    { path: "/ratings", label: "Ratings", icon: Star, universeControlled: true },
    { path: "/z-optimizer", label: "Z Optimizer", icon: Crosshair, universeControlled: true },
    { path: "/pair-optimizer", label: "Pair Opt", icon: Shuffle, universeControlled: true },
    { path: "/momentum", label: "Momentum", icon: Zap, universeControlled: true },
    { path: "/ma-crossover", label: "MA Cross", icon: GitMerge, universeControlled: true },
    { path: "/rsi-regime", label: "RSI Regime", icon: BarChart2, universeControlled: true },
    { path: "/combo-optimizer", label: "Combo Opt", icon: Shuffle, universeControlled: true },
    { path: "/roc-optimizer", label: "ROC Opt", icon: Activity, universeControlled: true },
    { path: "/oscillators", label: "Oscillators", icon: Activity, universeControlled: true },
    { path: "/range-optimizer", label: "Range Opt", icon: Layers, universeControlled: true },
    { path: "/harsi-optimizer", label: "HARSI Opt", icon: Crosshair, universeControlled: true },
    { path: "/slow-stoch-optimizer", label: "SlowStoch Opt", icon: Activity, universeControlled: true },
    { path: "/dual-ma-optimizer", label: "DualMA Opt", icon: Activity, universeControlled: true },
    { path: "/tva-optimizer", label: "TVA Opt", icon: Crosshair, universeControlled: true },
    { path: "/levels", label: "Levels & Trendlines", icon: TrendingUp },
    { path: "/trendlines", label: "Trendlines", icon: TrendingUp },
    { path: "/auto-trendline-backtest", label: "Auto Trendline BT", icon: TrendingUp },
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
          {links.map(({ path, label, icon: Icon, universeControlled }) => {
            const isActive = location === path || (path !== "/" && location.startsWith(path));
            const isHome = path === "/" && location === "/";
            const active = path === "/" ? isHome : isActive;
            const isUniverse = path === "/universe";
            return (
              <Link key={path} href={path}>
                <button
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? isUniverse
                        ? "bg-red-600 text-white"
                        : "bg-primary text-primary-foreground"
                      : isUniverse
                        ? "text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        : universeControlled
                          ? "text-red-400/60 hover:text-foreground hover:bg-accent"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                  data-testid={`nav-${label.toLowerCase().replace(/ /g, "-")}`}
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
        </div>
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
