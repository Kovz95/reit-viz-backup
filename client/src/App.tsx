import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Dashboard from "./pages/Dashboard";
import Ranking from "./pages/Ranking";
import Scatter from "./pages/Scatter";
import Pairs from "./pages/Pairs";
import Macro from "./pages/Macro";
import Correlation from "./pages/Correlation";
import Valuation from "./pages/Valuation";
import DividendSpread from "./pages/DividendSpread";
import Heatmap from "./pages/Heatmap";
import Performance from "./pages/Performance";
import ShortInterest from "./pages/ShortInterest";
import PairRatios from "./pages/PairRatios";
import Universe from "./pages/Universe";
import Screener from "./pages/Screener";
import DataExplorer from "./pages/DataExplorer";
import Ratings from "./pages/Ratings";
import ZScoreOptimizer from "./pages/ZScoreOptimizer";
import PairOptimizer from "./pages/PairOptimizer";
import ValuationRegime from "./pages/ValuationRegime";
import MomentumOptimizer from "./pages/MomentumOptimizer";
import MACrossoverOptimizer from "./pages/MACrossoverOptimizer";
import RSIRegimeOptimizer from "./pages/RSIRegimeOptimizer";
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
    { path: "/ranking", label: "Ranking", icon: ListOrdered, universeControlled: true },
    { path: "/scatter", label: "XY Scatter", icon: ScatterChart, universeControlled: true },
    { path: "/pairs", label: "Pairs", icon: ArrowRightLeft },
    { path: "/macro", label: "Macro", icon: TrendingUp },
    { path: "/correlation", label: "Correlation", icon: Link2, universeControlled: true },
    { path: "/valuation", label: "Valuation", icon: Gauge, universeControlled: true },
    { path: "/spread", label: "Div Spread", icon: Percent, universeControlled: true },
    { path: "/heatmap", label: "Rel Value", icon: Grid3X3, universeControlled: true },
    { path: "/performance", label: "Performance", icon: Activity, universeControlled: true },
    { path: "/short-interest", label: "Short Interest", icon: Target, universeControlled: true },
    { path: "/pair-ratios", label: "Pair Ratios", icon: GitCompareArrows, universeControlled: true },
    { path: "/screener", label: "Screener", icon: Filter, universeControlled: true },
    { path: "/ratings", label: "Ratings", icon: Star, universeControlled: true },
    { path: "/z-optimizer", label: "Z Optimizer", icon: Crosshair, universeControlled: true },
    { path: "/pair-optimizer", label: "Pair Opt", icon: Shuffle, universeControlled: true },
    { path: "/val-regime", label: "Val Regime", icon: Layers, universeControlled: true },
    { path: "/momentum", label: "Momentum", icon: Zap, universeControlled: true },
    { path: "/ma-crossover", label: "MA Cross", icon: GitMerge, universeControlled: true },
    { path: "/rsi-regime", label: "RSI Regime", icon: BarChart2, universeControlled: true },
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
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/universe" component={Universe} />
              <Route path="/ranking" component={Ranking} />
              <Route path="/scatter" component={Scatter} />
              <Route path="/pairs" component={Pairs} />
              <Route path="/macro" component={Macro} />
              <Route path="/correlation" component={Correlation} />
              <Route path="/valuation" component={Valuation} />
              <Route path="/spread" component={DividendSpread} />
              <Route path="/heatmap" component={Heatmap} />
              <Route path="/performance" component={Performance} />
              <Route path="/short-interest" component={ShortInterest} />
              <Route path="/pair-ratios" component={PairRatios} />
              <Route path="/screener" component={Screener} />
              <Route path="/ratings" component={Ratings} />
              <Route path="/z-optimizer" component={ZScoreOptimizer} />
              <Route path="/pair-optimizer" component={PairOptimizer} />
              <Route path="/val-regime" component={ValuationRegime} />
              <Route path="/momentum" component={MomentumOptimizer} />
              <Route path="/ma-crossover" component={MACrossoverOptimizer} />
              <Route path="/rsi-regime" component={RSIRegimeOptimizer} />
              <Route path="/data" component={DataExplorer} />
              <Route>
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Not found
                </div>
              </Route>
            </Switch>
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
