// Reconstructed from recovered-bundle/SigmaMove-BeLjHH1_.js on 2026-06-11
import React from "react";
import { useAppContext } from "@/lib/appContext";
import { useAppStatus } from "@/lib/appStatus";
import fetchMetricSeriesBatch from "@/lib/fetchMetricSeriesBatch";
import { apiRequest } from "@/lib/apiRequest";
import { fetchMetricSeries } from "@/lib/fetchMetricSeries";
import { fetchEarningsDates } from "@/lib/fetchEarningsDates";
import {
  Calendar as CalendarIcon,
  Search as SearchIcon,
  X as XIcon,
  Loader2,
  RefreshCw,
  Download,
  Grid as GridIcon,
  ChevronUp as ChevronUpIcon,
  ChevronDown as ChevronDownIcon,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EWMA_LAMBDA = 0.94;

const EARNINGS_LOOKBACK_OPTIONS: { label: string; years: number }[] = [
  { label: "1Y", years: 1 },
  { label: "3Y", years: 3 },
  { label: "5Y", years: 5 },
  { label: "10Y", years: 10 },
  { label: "All", years: 999 },
];

const LOOKBACK_OPTIONS: { label: string; days: number }[] = [
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
  { label: "180d", days: 180 },
  { label: "1Y", days: 252 },
  { label: "2Y", days: 504 },
];

const DEFAULT_LOOKBACK_DAYS = 90;

const HORIZON_OPTIONS: { label: string; n: number }[] = [
  { label: "1d", n: 1 },
  { label: "5d", n: 5 },
  { label: "10d", n: 10 },
  { label: "21d", n: 21 },
];

const DEFAULT_HORIZON_N = 1;

export const DEFAULT_INDEX_GROUPS: string[] = ["broad", "reit", "rates_bonds"];

export const INDEX_GROUP_LABELS: Record<string, string> = {
  broad: "Broad Market",
  style: "Style",
  sector: "S&P Sectors",
  reit: "REIT Benchmarks",
  sub_industry: "Sub-Industry",
  intl: "International",
  rates_bonds: "Rates & Bonds",
  commodities: "Commodities",
  vol_crypto: "Vol & Crypto",
};

export const INDEX_GROUP_SHORT: Record<string, string> = {
  broad: "Broad",
  style: "Style",
  sector: "Sectors",
  reit: "REITs",
  sub_industry: "Sub-Ind",
  intl: "Intl",
  rates_bonds: "Rates",
  commodities: "Commod",
  vol_crypto: "Vol/Cx",
};

export const INDEX_GROUP_ORDER: string[] = [
  "broad",
  "style",
  "sector",
  "reit",
  "sub_industry",
  "intl",
  "rates_bonds",
  "commodities",
  "vol_crypto",
];

interface IndexEntry {
  ticker: string;
  label: string;
  name: string;
  group: string;
}

const INDEX_UNIVERSE: IndexEntry[] = [
  { ticker: "SPY", label: "SPY", name: "S&P 500 (SPY)", group: "broad" },
  { ticker: "QQQ", label: "QQQ", name: "Nasdaq 100 (QQQ)", group: "broad" },
  { ticker: "DIA", label: "DIA", name: "Dow Jones Industrial (DIA)", group: "broad" },
  { ticker: "IWM", label: "IWM", name: "Russell 2000 (IWM)", group: "broad" },
  { ticker: "MDY", label: "MDY", name: "S&P MidCap 400 (MDY)", group: "broad" },
  { ticker: "VTI", label: "VTI", name: "Total US Market (VTI)", group: "broad" },
  { ticker: "VTV", label: "VTV", name: "Vanguard Value (VTV)", group: "style" },
  { ticker: "VUG", label: "VUG", name: "Vanguard Growth (VUG)", group: "style" },
  { ticker: "XLK", label: "XLK", name: "Technology (XLK)", group: "sector" },
  { ticker: "XLF", label: "XLF", name: "Financials (XLF)", group: "sector" },
  { ticker: "XLE", label: "XLE", name: "Energy (XLE)", group: "sector" },
  { ticker: "XLV", label: "XLV", name: "Health Care (XLV)", group: "sector" },
  { ticker: "XLI", label: "XLI", name: "Industrials (XLI)", group: "sector" },
  { ticker: "XLY", label: "XLY", name: "Consumer Discretionary (XLY)", group: "sector" },
  { ticker: "XLP", label: "XLP", name: "Consumer Staples (XLP)", group: "sector" },
  { ticker: "XLU", label: "XLU", name: "Utilities (XLU)", group: "sector" },
  { ticker: "XLB", label: "XLB", name: "Materials (XLB)", group: "sector" },
  { ticker: "XLC", label: "XLC", name: "Communication (XLC)", group: "sector" },
  { ticker: "XLRE", label: "XLRE", name: "Real Estate Sector (XLRE)", group: "sector" },
  { ticker: "VNQ", label: "VNQ", name: "Vanguard US REITs (VNQ)", group: "reit" },
  { ticker: "IYR", label: "IYR", name: "iShares US Real Estate (IYR)", group: "reit" },
  { ticker: "SCHH", label: "SCHH", name: "Schwab US REIT (SCHH)", group: "reit" },
  { ticker: "RWR", label: "RWR", name: "SPDR Dow Jones REIT (RWR)", group: "reit" },
  { ticker: "REM", label: "REM", name: "Mortgage REITs (REM)", group: "reit" },
  { ticker: "MORT", label: "MORT", name: "VanEck Mortgage REIT (MORT)", group: "reit" },
  { ticker: "SMH", label: "SMH", name: "Semiconductors (SMH)", group: "sub_industry" },
  { ticker: "SOXX", label: "SOXX", name: "PHLX Semiconductor (SOXX)", group: "sub_industry" },
  { ticker: "KRE", label: "KRE", name: "Regional Banks (KRE)", group: "sub_industry" },
  { ticker: "KBE", label: "KBE", name: "Banks (KBE)", group: "sub_industry" },
  { ticker: "ITB", label: "ITB", name: "Home Construction (ITB)", group: "sub_industry" },
  { ticker: "XHB", label: "XHB", name: "Homebuilders (XHB)", group: "sub_industry" },
  { ticker: "EFA", label: "EFA", name: "Developed Mkts ex-US (EFA)", group: "intl" },
  { ticker: "EEM", label: "EEM", name: "Emerging Markets (EEM)", group: "intl" },
  { ticker: "TLT", label: "TLT", name: "20+ Yr Treasuries (TLT)", group: "rates_bonds" },
  { ticker: "IEF", label: "IEF", name: "7-10 Yr Treasuries (IEF)", group: "rates_bonds" },
  { ticker: "SHY", label: "SHY", name: "1-3 Yr Treasuries (SHY)", group: "rates_bonds" },
  { ticker: "TIP", label: "TIP", name: "TIPS (TIP)", group: "rates_bonds" },
  { ticker: "LQD", label: "LQD", name: "Investment-Grade Corp (LQD)", group: "rates_bonds" },
  { ticker: "HYG", label: "HYG", name: "High Yield Corp (HYG)", group: "rates_bonds" },
  { ticker: "^TNX", label: "10Y", name: "10-Year Treasury Yield (^TNX)", group: "rates_bonds" },
  { ticker: "GLD", label: "GLD", name: "Gold (GLD)", group: "commodities" },
  { ticker: "SLV", label: "SLV", name: "Silver (SLV)", group: "commodities" },
  { ticker: "USO", label: "USO", name: "Crude Oil (USO)", group: "commodities" },
  { ticker: "UNG", label: "UNG", name: "Natural Gas (UNG)", group: "commodities" },
  { ticker: "DBA", label: "DBA", name: "Agriculture (DBA)", group: "commodities" },
  { ticker: "^VIX", label: "VIX", name: "CBOE Volatility Index (^VIX)", group: "vol_crypto" },
  { ticker: "VXX", label: "VXX", name: "S&P 500 VIX Short-Term (VXX)", group: "vol_crypto" },
  { ticker: "BTC-USD", label: "BTC", name: "Bitcoin (BTC-USD)", group: "vol_crypto" },
  { ticker: "ETH-USD", label: "ETH", name: "Ethereum (ETH-USD)", group: "vol_crypto" },
];

// ---------------------------------------------------------------------------
// Local yahoo-prices fetch
// ---------------------------------------------------------------------------

async function fetchYahooPrices(ticker: string): Promise<{ dates: string[]; closes: number[] }> {
  const resp = await fetch(`/api/yahoo-prices/${ticker}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${ticker}`);
  const data = await resp.json();
  return {
    dates: data.dates,
    closes: data.adjCloses ?? data.closes,
  };
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function sampleStd(arr: number[]): number | null {
  if (arr.length < 2) return null;
  const mean = arr.reduce((acc, v) => acc + v, 0) / arr.length;
  const sumSq = arr.reduce((acc, v) => acc + (v - mean) * (v - mean), 0);
  return Math.sqrt(sumSq / (arr.length - 1));
}

function logReturns(closes: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (prev != null && curr != null && Number.isFinite(prev) && Number.isFinite(curr) && prev > 0 && curr > 0) {
      rets.push(Math.log(curr / prev));
    }
  }
  return rets;
}

function rollingSum(arr: number[], windowSize: number): number[] {
  if (windowSize <= 1) return arr.slice();
  if (arr.length < windowSize) return [];
  const result = new Array(arr.length - windowSize + 1);
  let sum = 0;
  for (let i = 0; i < windowSize; i++) sum += arr[i];
  result[0] = sum;
  for (let i = windowSize; i < arr.length; i++) {
    sum += arr[i] - arr[i - windowSize];
    result[i - windowSize + 1] = sum;
  }
  return result;
}

function ewmaVol(returns: number[], lambda: number = EWMA_LAMBDA): number | null {
  if (returns.length < 5) return null;
  const warmupLen = Math.max(5, Math.min(20, Math.floor(returns.length / 4)));
  const warmup = returns.slice(0, warmupLen);
  const warmupMean = warmup.reduce((acc, v) => acc + v, 0) / warmupLen;
  let variance = warmup.reduce((acc, v) => acc + (v - warmupMean) * (v - warmupMean), 0) / warmupLen;
  for (let i = warmupLen; i < returns.length; i++) {
    const r = returns[i - 1];
    variance = lambda * variance + (1 - lambda) * r * r;
  }
  return !Number.isFinite(variance) || variance <= 0 ? null : Math.sqrt(variance);
}

function empiricalPercentile(distribution: number[], value: number): number | null {
  if (!Number.isFinite(value) || distribution.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const v of distribution) {
    if (Number.isFinite(v)) {
      if (v < value) below++;
      else if (v === value) equal++;
    }
  }
  return (below + 0.5 * equal) / distribution.length * 100;
}

interface VolAndDistribution {
  sigmaDaily: number | null;
  sigmaEwmaDaily: number | null;
  hvWindow: number;
  nDayReturnDistribution: number[];
}

function computeVolAndDistribution(
  closes: number[],
  endIdx: number,
  lookbackDays: number,
  horizonN: number,
): VolAndDistribution {
  if (endIdx < 1) {
    return { sigmaDaily: null, sigmaEwmaDaily: null, hvWindow: 0, nDayReturnDistribution: [] };
  }
  const startIdx = Math.max(1, endIdx - lookbackDays + 1);
  const window = closes.slice(Math.max(0, startIdx - 1), endIdx + 1);
  const rets = logReturns(window);
  if (rets.length < 5) {
    return { sigmaDaily: null, sigmaEwmaDaily: null, hvWindow: rets.length, nDayReturnDistribution: [] };
  }
  const sigmaDaily = sampleStd(rets);
  const sigmaEwmaDaily = ewmaVol(rets);
  const nDayDist = rollingSum(rets, Math.max(1, horizonN));
  return {
    sigmaDaily,
    sigmaEwmaDaily,
    hvWindow: rets.length,
    nDayReturnDistribution: nDayDist,
  };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatNum(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(2);
}

function formatNumSigned(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

function formatPct(v: number | null | undefined, decimals = 2): string {
  return v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(decimals)}%`;
}

function formatSigma(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}σ`;
}

function pctChangeColor(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v)
    ? "text-muted-foreground"
    : v > 0
    ? "text-emerald-400"
    : v < 0
    ? "text-red-400"
    : "text-muted-foreground";
}

function sigmaColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-muted-foreground";
  const abs = Math.abs(v);
  if (abs < 1) return v > 0 ? "text-emerald-300/70" : "text-red-300/70";
  if (abs < 2) return v > 0 ? "text-emerald-400" : "text-red-400";
  if (abs < 3) return v > 0 ? "text-emerald-500 font-bold" : "text-orange-400 font-bold";
  return v > 0
    ? "text-emerald-300 font-bold bg-emerald-500/10 px-1 rounded"
    : "text-red-300 font-bold bg-red-500/15 px-1 rounded";
}

function sigmaLabel(v: number | null | undefined): { label: string; color: string } {
  if (v == null || !Number.isFinite(v)) return { label: "—", color: "" };
  const abs = Math.abs(v);
  if (abs < 1) return { label: "normal", color: "text-muted-foreground" };
  if (abs < 2) return { label: "1σ", color: "text-amber-400" };
  if (abs < 3) return { label: "2σ", color: "text-orange-400" };
  return { label: "3σ+", color: "text-red-400 font-bold" };
}

function formatPercentile(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v < 1 || v > 99 ? v.toFixed(2) + "%" : v.toFixed(1) + "%";
}

function percentileColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "text-muted-foreground";
  const dist = Math.min(v, 100 - v);
  const isHigh = v >= 50;
  if (dist < 1)
    return isHigh
      ? "text-emerald-300 font-bold bg-emerald-500/10 px-1 rounded"
      : "text-red-300 font-bold bg-red-500/15 px-1 rounded";
  if (dist < 5) return isHigh ? "text-emerald-500 font-bold" : "text-orange-400 font-bold";
  if (dist < 10) return isHigh ? "text-emerald-400" : "text-red-400";
  return "text-muted-foreground";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiveRow {
  ticker: string;
  name: string;
  sector: string;
  subindustry: string;
  closes: number[];
  last: number | null;
  previousClose: number | null;
  quoteTime: string | null;
  marketState: string | null;
  quoteError?: string | null;
  dollarChange: number | null;
  pctChange: number | null;
  logReturnToday: number | null;
  logReturnN: number | null;
  pctChangeN: number | null;
  sigmaDaily: number | null;
  sigmaAnnualized: number | null;
  sigmaEwmaDaily: number | null;
  sigmaEwmaAnnualized: number | null;
  hvWindow: number;
  sigmaMove: number | null;
  sigmaMoveEwma: number | null;
  percentile: number | null;
  percentileN: number;
}

interface EarningsRow {
  ticker: string;
  name: string;
  earningsDate: string;
  reactionDate: string;
  priorDate: string;
  closeOnDate: number | null;
  priorClose: number | null;
  dollarChange: number | null;
  pctChange: number | null;
  logReturn: number | null;
  sigmaDaily: number | null;
  sigmaAnnualized: number | null;
  sigmaEwmaDaily: number | null;
  sigmaEwmaAnnualized: number | null;
  hvWindow: number;
  sigmaMove: number | null;
  sigmaMoveEwma: number | null;
  percentile: number | null;
  percentileN: number;
}

interface IndexLiveRow {
  ticker: string;
  label: string;
  name: string;
  group: string;
  last: number | null;
  previousClose: number | null;
  dollarChange: number | null;
  pctChange: number | null;
  sigmaDaily: number | null;
  sigmaAnnualized: number | null;
  sigmaMove: number | null;
  sigmaEwmaDaily: number | null;
  sigmaEwmaAnnualized: number | null;
  sigmaMoveEwma: number | null;
  percentile: number | null;
  percentileN: number;
  hvWindow: number;
  error?: string | null;
}

interface IndexEarningsRow {
  ticker: string;
  label: string;
  name: string;
  group: string;
  avgSigma: number | null;
  avgAbsSigma: number | null;
  pctAbsGte1: number | null;
  byDate: Map<string, number>;
  error?: string;
}

interface SortState {
  key: string;
  dir: "asc" | "desc";
}

interface ProgressState {
  done: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatChipProps {
  label: string;
  value: number | null | undefined;
  total: number | null | undefined;
  color: string;
}

function StatChip({ label, value, total, color }: StatChipProps) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-muted-foreground uppercase tracking-wider">{label}:</span>
      <span className={color}>{value}</span>
      <span className="text-muted-foreground">/ {total}</span>
    </span>
  );
}

interface SortableHeaderProps {
  label: string;
  k: string;
  sort: SortState;
  onClick: (key: string) => void;
  align?: "left" | "right";
}

function SortableHeaderLive({ label, k, sort, onClick, align = "left" }: SortableHeaderProps) {
  const isActive = sort.key === k;
  return (
    <th
      className={`px-3 py-2 font-bold cursor-pointer select-none hover:text-foreground transition-colors ${
        align === "right" ? "text-right" : "text-left"
      } ${isActive ? "text-foreground" : ""}`}
      onClick={() => onClick(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          sort.dir === "asc" ? (
            <ChevronUpIcon className="w-3 h-3" />
          ) : (
            <ChevronDownIcon className="w-3 h-3" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

function SortableHeaderEarnings({ label, k, sort, onClick, align = "left" }: SortableHeaderProps) {
  const isActive = sort.key === k;
  return (
    <th
      className={`px-3 py-2 font-bold cursor-pointer select-none hover:text-foreground transition-colors ${
        align === "right" ? "text-right" : "text-left"
      } ${isActive ? "text-foreground" : ""}`}
      onClick={() => onClick(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          sort.dir === "asc" ? (
            <ChevronUpIcon className="w-3 h-3" />
          ) : (
            <ChevronDownIcon className="w-3 h-3" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SigmaMove() {
  const { filteredTickersList: tickerList } = useAppContext();
  const { setLastQuoteFetchedAt } = useAppStatus();

  // Live mode state
  const [liveRows, setLiveRows] = React.useState<LiveRow[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(false);
  const [fetchingQuotes, setFetchingQuotes] = React.useState(false);
  const [globalError, setGlobalError] = React.useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = React.useState<string | null>(null);
  const [marketState, setMarketState] = React.useState<string | null>(null);
  const [liveSort, setLiveSort] = React.useState<SortState>({ key: "absSigmaMove", dir: "desc" });

  // Lookback days — persisted
  const [lookbackDays, setLookbackDays] = React.useState<number>(() => {
    try {
      const stored = localStorage.getItem("sigma-lookback-days-v1");
      const parsed = stored == null ? NaN : parseInt(stored, 10);
      if (LOOKBACK_OPTIONS.some((o) => o.days === parsed)) return parsed;
    } catch {}
    return DEFAULT_LOOKBACK_DAYS;
  });
  React.useEffect(() => {
    try {
      localStorage.setItem("sigma-lookback-days-v1", String(lookbackDays));
    } catch {}
  }, [lookbackDays]);

  // Horizon N — persisted
  const [horizonN, setHorizonN] = React.useState<number>(() => {
    try {
      const stored = localStorage.getItem("sigma-horizon-n-v1");
      const parsed = stored == null ? NaN : parseInt(stored, 10);
      if (HORIZON_OPTIONS.some((o) => o.n === parsed)) return parsed;
    } catch {}
    return DEFAULT_HORIZON_N;
  });
  React.useEffect(() => {
    try {
      localStorage.setItem("sigma-horizon-n-v1", String(horizonN));
    } catch {}
  }, [horizonN]);

  // Mode toggle: false = Live, true = Earnings
  const [isEarningsMode, setIsEarningsMode] = React.useState(false);

  // Earnings mode state
  const [earningsRows, setEarningsRows] = React.useState<EarningsRow[]>([]);
  const [loadingEarnings, setLoadingEarnings] = React.useState(false);
  const [earningsYears, setEarningsYears] = React.useState(5);
  const [earningsSort, setEarningsSort] = React.useState<SortState>({ key: "absSigmaMove", dir: "desc" });
  const [earningsProgress, setEarningsProgress] = React.useState<ProgressState | null>(null);

  // Index state
  const indexHistoryCache = React.useRef<Map<string, { dates: string[]; closes: number[] }>>(new Map());
  const [indexLiveRows, setIndexLiveRows] = React.useState<IndexLiveRow[]>([]);
  const [loadingIndexData, setLoadingIndexData] = React.useState(false);
  const [indexEarningsData, setIndexEarningsData] = React.useState<IndexEarningsRow[]>([]);

  // Show/hide indices — persisted
  const [showIndices, setShowIndices] = React.useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("sigma-show-indices-v1");
      return stored == null ? true : stored === "1";
    } catch {
      return true;
    }
  });
  React.useEffect(() => {
    try {
      localStorage.setItem("sigma-show-indices-v1", showIndices ? "1" : "0");
    } catch {}
  }, [showIndices]);

  // Active index groups — persisted
  const [activeIndexGroups, setActiveIndexGroups] = React.useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("sigma-index-groups-v1");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const filtered = (parsed as string[]).filter((g) => g in INDEX_GROUP_LABELS);
          if (filtered.length > 0) return filtered;
        }
      }
    } catch {}
    return DEFAULT_INDEX_GROUPS;
  });
  React.useEffect(() => {
    try {
      localStorage.setItem("sigma-index-groups-v1", JSON.stringify(activeIndexGroups));
    } catch {}
  }, [activeIndexGroups]);

  // Filtered index entries based on active groups
  const filteredIndexEntries = React.useMemo(
    () => INDEX_UNIVERSE.filter((e) => activeIndexGroups.includes(e.group)),
    [activeIndexGroups],
  );

  const toggleIndexGroup = React.useCallback((group: string) => {
    setActiveIndexGroups((prev) =>
      prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group],
    );
  }, []);

  // Search/filter
  const [tickerSearch, setTickerSearch] = React.useState("");
  const searchTerms = React.useMemo(
    () =>
      tickerSearch
        .toLowerCase()
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    [tickerSearch],
  );
  const matchesSearch = React.useCallback(
    (ticker: string, name?: string | null) => {
      if (searchTerms.length === 0) return true;
      const t = ticker.toLowerCase();
      const n = (name || "").toLowerCase();
      return searchTerms.some((term) => t.includes(term) || n.includes(term));
    },
    [searchTerms],
  );

  // ---------------------------------------------------------------------------
  // loadHistoricalData
  // ---------------------------------------------------------------------------
  const loadHistoricalData = React.useCallback(async () => {
    setLoadingHistory(true);
    setGlobalError(null);
    try {
      const minBars = Math.max(lookbackDays + horizonN + 5, 504);
      const batchData = await fetchMetricSeriesBatch("close", minBars);
      const tickerSet = new Set(tickerList.map((t: any) => t.ticker));
      const rows: LiveRow[] = [];
      for (const item of batchData) {
        if (!tickerSet.has(item.ticker)) continue;
        const closes: number[] = (item.values || []).map((v: number | null) => v ?? NaN);
        const { sigmaDaily, sigmaEwmaDaily, hvWindow } = computeVolAndDistribution(
          closes,
          closes.length - 1,
          lookbackDays,
          horizonN,
        );
        rows.push({
          ticker: item.ticker,
          name: item.name,
          sector: item.sector || "",
          subindustry: item.subindustry || "",
          closes,
          last: null,
          previousClose: null,
          quoteTime: null,
          marketState: null,
          dollarChange: null,
          pctChange: null,
          logReturnToday: null,
          logReturnN: null,
          pctChangeN: null,
          sigmaDaily,
          sigmaAnnualized: sigmaDaily != null ? sigmaDaily * Math.sqrt(252) : null,
          sigmaEwmaDaily,
          sigmaEwmaAnnualized: sigmaEwmaDaily != null ? sigmaEwmaDaily * Math.sqrt(252) : null,
          hvWindow,
          sigmaMove: null,
          sigmaMoveEwma: null,
          percentile: null,
          percentileN: 0,
        });
      }
      rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
      setLiveRows(rows);
    } catch (err: any) {
      setGlobalError(err?.message || "Failed to load historical data");
    } finally {
      setLoadingHistory(false);
    }
  }, [tickerList, lookbackDays, horizonN]);

  React.useEffect(() => {
    loadHistoricalData();
  }, [loadHistoricalData]);

  // ---------------------------------------------------------------------------
  // fetchLiveQuotes
  // ---------------------------------------------------------------------------
  const fetchLiveQuotes = React.useCallback(async () => {
    if (!liveRows.length) return;
    setFetchingQuotes(true);
    setGlobalError(null);
    try {
      const symbols = liveRows.map((r) => r.ticker);
      const resp = await apiRequest("POST", "/api/quotes/live", { symbols });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const quoteMap = new Map<string, any>();
      for (const q of data.quotes) quoteMap.set(q.symbol, q);
      const firstWithState = data.quotes.find((q: any) => q.marketState);
      if (firstWithState?.marketState) setMarketState(firstWithState.marketState);
      const sqrtN = Math.sqrt(Math.max(1, horizonN));
      setLiveRows((prev) =>
        prev.map((row) => {
          const quote = quoteMap.get(row.ticker);
          if (!quote) return row;
          const last = quote.last as number | null;
          const prevClose = quote.previousClose as number | null;
          const dollarChange = last != null && prevClose != null ? last - prevClose : null;
          const pctChange = last != null && prevClose != null && prevClose !== 0 ? (last - prevClose) / prevClose : null;
          const logReturnToday =
            last != null && prevClose != null && last > 0 && prevClose > 0
              ? Math.log(last / prevClose)
              : null;
          let logReturnN: number | null = null;
          if (horizonN <= 1) {
            logReturnN = logReturnToday;
          } else if (last != null && last > 0 && row.closes.length >= horizonN) {
            const prevNClose = row.closes[row.closes.length - horizonN];
            if (prevNClose != null && Number.isFinite(prevNClose) && prevNClose > 0) {
              logReturnN = Math.log(last / prevNClose);
            }
          }
          const pctChangeN = logReturnN != null ? Math.exp(logReturnN) - 1 : null;
          const sigmaMove =
            logReturnN != null && row.sigmaDaily != null && row.sigmaDaily > 0
              ? logReturnN / (row.sigmaDaily * sqrtN)
              : null;
          const sigmaMoveEwma =
            logReturnN != null && row.sigmaEwmaDaily != null && row.sigmaEwmaDaily > 0
              ? logReturnN / (row.sigmaEwmaDaily * sqrtN)
              : null;
          let percentile: number | null = null;
          let percentileN = 0;
          if (logReturnN != null && row.closes.length > 1) {
            const { nDayReturnDistribution } = computeVolAndDistribution(
              row.closes,
              row.closes.length - 1,
              lookbackDays,
              horizonN,
            );
            if (nDayReturnDistribution.length > 0) {
              percentile = empiricalPercentile(nDayReturnDistribution, logReturnN);
              percentileN = nDayReturnDistribution.length;
            }
          }
          return {
            ...row,
            last,
            previousClose: prevClose,
            quoteTime: quote.regularMarketTime,
            marketState: quote.marketState,
            quoteError: quote.error,
            dollarChange,
            pctChange,
            logReturnToday,
            logReturnN,
            pctChangeN,
            sigmaMove,
            sigmaMoveEwma,
            percentile,
            percentileN,
          };
        }),
      );
      setFetchedAt(data.fetchedAt);
      setLastQuoteFetchedAt(Date.now());
    } catch (err: any) {
      setGlobalError(err?.message || "Failed to fetch live quotes");
    } finally {
      setFetchingQuotes(false);
    }
  }, [liveRows, lookbackDays, horizonN]);

  // Auto-fetch quotes once history is loaded
  React.useEffect(() => {
    if (!isEarningsMode && liveRows.length > 0 && !fetchedAt && !fetchingQuotes) {
      fetchLiveQuotes();
    }
  }, [liveRows.length, isEarningsMode]);

  // ---------------------------------------------------------------------------
  // loadIndexData (live mode)
  // ---------------------------------------------------------------------------
  const loadIndexData = React.useCallback(async () => {
    setLoadingIndexData(true);
    try {
      const symbols = filteredIndexEntries.map((e) => e.ticker);
      await Promise.all(
        symbols.map(async (ticker) => {
          if (!indexHistoryCache.current.has(ticker)) {
            try {
              const data = await fetchYahooPrices(ticker);
              indexHistoryCache.current.set(ticker, data);
            } catch (err: any) {
              console.warn("[Sigma] failed to load history for index", ticker, err?.message ?? err);
            }
          }
        }),
      );
      let liveQuoteMap = new Map<string, any>();
      try {
        const resp = await apiRequest("POST", "/api/quotes/live", { symbols });
        if (resp.ok) {
          const data = await resp.json();
          for (const q of data.quotes) liveQuoteMap.set(q.symbol, q);
        }
      } catch {}
      const sqrtN = Math.sqrt(Math.max(1, horizonN));
      const rows: IndexLiveRow[] = filteredIndexEntries.map((entry) => {
        const history = indexHistoryCache.current.get(entry.ticker);
        const quote = liveQuoteMap.get(entry.ticker);
        const closes = history?.closes ?? [];
        const { sigmaDaily, sigmaEwmaDaily, hvWindow, nDayReturnDistribution } = computeVolAndDistribution(
          closes,
          closes.length - 1,
          lookbackDays,
          horizonN,
        );
        const last = quote?.last ?? null;
        const prevClose = quote?.previousClose ?? null;
        const dollarChange = last != null && prevClose != null ? last - prevClose : null;
        const pctChange = last != null && prevClose != null && prevClose !== 0 ? (last - prevClose) / prevClose : null;
        const logReturn =
          last != null && prevClose != null && last > 0 && prevClose > 0 ? Math.log(last / prevClose) : null;
        let logReturnN: number | null = null;
        if (horizonN <= 1) {
          logReturnN = logReturn;
        } else if (last != null && last > 0 && closes.length >= horizonN) {
          const prevNClose = closes[closes.length - horizonN];
          if (prevNClose != null && Number.isFinite(prevNClose) && prevNClose > 0) {
            logReturnN = Math.log(last / prevNClose);
          }
        }
        const sigmaMove =
          logReturnN != null && sigmaDaily != null && sigmaDaily > 0
            ? logReturnN / (sigmaDaily * sqrtN)
            : null;
        const sigmaMoveEwma =
          logReturnN != null && sigmaEwmaDaily != null && sigmaEwmaDaily > 0
            ? logReturnN / (sigmaEwmaDaily * sqrtN)
            : null;
        const percentile = logReturnN != null && nDayReturnDistribution.length > 0
          ? empiricalPercentile(nDayReturnDistribution, logReturnN)
          : null;
        const percentileN = nDayReturnDistribution.length;
        return {
          ticker: entry.ticker,
          label: entry.label,
          name: entry.name,
          group: entry.group,
          last,
          previousClose: prevClose,
          dollarChange,
          pctChange,
          sigmaDaily,
          sigmaAnnualized: sigmaDaily != null ? sigmaDaily * Math.sqrt(252) : null,
          sigmaMove,
          sigmaEwmaDaily,
          sigmaEwmaAnnualized: sigmaEwmaDaily != null ? sigmaEwmaDaily * Math.sqrt(252) : null,
          sigmaMoveEwma,
          percentile,
          percentileN,
          hvWindow,
          error: quote?.error,
        };
      });
      setIndexLiveRows(rows);
    } finally {
      setLoadingIndexData(false);
    }
  }, [filteredIndexEntries, lookbackDays, horizonN]);

  React.useEffect(() => {
    if (!isEarningsMode) loadIndexData();
  }, [isEarningsMode, loadIndexData, fetchedAt]);

  // ---------------------------------------------------------------------------
  // computeEarningsMode
  // ---------------------------------------------------------------------------
  const computeEarningsMode = React.useCallback(async () => {
    setLoadingEarnings(true);
    setGlobalError(null);
    setEarningsProgress({ done: 0, total: tickerList.length });
    try {
      const cutoffDate = `${new Date().getFullYear() - earningsYears}-01-01`;
      const allRows: EarningsRow[] = [];
      const batchSize = 8;
      for (let i = 0; i < tickerList.length; i += batchSize) {
        const batch = tickerList.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (t: any) => {
            try {
              const [closeSeries, earningsDates] = await Promise.all([
                fetchMetricSeries(t.ticker, "close"),
                fetchEarningsDates(t.ticker),
              ]);
              const filteredDates = ((earningsDates as any).earnings || [])
                .filter((d: any) => typeof d === "string" && d.length === 10)
                .filter((d: string) => earningsYears >= 999 || d >= cutoffDate)
                .sort() as string[];
              const minBars = Math.max(lookbackDays + horizonN + 5, 90);
              if (closeSeries.length < minBars || filteredDates.length === 0) return [];
              const dates = closeSeries.map((p: any) => p.time);
              const closes = closeSeries.map((p: any) => p.value);
              const dateIndexMap = new Map<string, number>();
              dates.forEach((d: string, idx: number) => dateIndexMap.set(d, idx));
              const sqrtN = Math.sqrt(Math.max(1, horizonN));
              const rows: EarningsRow[] = [];
              for (const earningsDate of filteredDates) {
                let reactionIdx = dateIndexMap.get(earningsDate);
                if (reactionIdx == null) {
                  for (let j = 0; j < dates.length; j++) {
                    if (dates[j] >= earningsDate) {
                      reactionIdx = j;
                      break;
                    }
                  }
                }
                if (reactionIdx == null || reactionIdx < 1) continue;
                const closeIdx = reactionIdx + horizonN - 1;
                if (closeIdx >= dates.length) continue;
                const priorIdx = reactionIdx - 1;
                const closeOnDate = closes[closeIdx];
                const priorClose = closes[priorIdx];
                if (closeOnDate == null || priorClose == null || priorClose <= 0 || closeOnDate <= 0) continue;
                const dollarChange = closeOnDate - priorClose;
                const pctChange = dollarChange / priorClose;
                const logReturn = Math.log(closeOnDate / priorClose);
                const { sigmaDaily, sigmaEwmaDaily, hvWindow, nDayReturnDistribution } = computeVolAndDistribution(
                  closes,
                  priorIdx,
                  lookbackDays,
                  horizonN,
                );
                const sigmaMove = sigmaDaily != null && sigmaDaily > 0 ? logReturn / (sigmaDaily * sqrtN) : null;
                const sigmaMoveEwma =
                  sigmaEwmaDaily != null && sigmaEwmaDaily > 0 ? logReturn / (sigmaEwmaDaily * sqrtN) : null;
                const percentile =
                  nDayReturnDistribution.length > 0 ? empiricalPercentile(nDayReturnDistribution, logReturn) : null;
                rows.push({
                  ticker: t.ticker,
                  name: t.name,
                  earningsDate,
                  reactionDate: dates[closeIdx],
                  priorDate: dates[priorIdx],
                  closeOnDate,
                  priorClose,
                  dollarChange,
                  pctChange,
                  logReturn,
                  sigmaDaily,
                  sigmaAnnualized: sigmaDaily != null ? sigmaDaily * Math.sqrt(252) : null,
                  sigmaEwmaDaily,
                  sigmaEwmaAnnualized: sigmaEwmaDaily != null ? sigmaEwmaDaily * Math.sqrt(252) : null,
                  hvWindow,
                  sigmaMove,
                  sigmaMoveEwma,
                  percentile,
                  percentileN: nDayReturnDistribution.length,
                });
              }
              return rows;
            } catch {
              return [];
            }
          }),
        );
        for (const result of batchResults) allRows.push(...result);
        setEarningsProgress({ done: Math.min(i + batchSize, tickerList.length), total: tickerList.length });
      }
      setEarningsRows(allRows);

      // Build index earnings data
      const reactionDates = Array.from(new Set(allRows.map((r) => r.reactionDate))).sort();
      const indexEarnings: IndexEarningsRow[] = [];
      const sqrtN = Math.sqrt(Math.max(1, horizonN));
      for (const entry of filteredIndexEntries) {
        let history = indexHistoryCache.current.get(entry.ticker);
        if (!history) {
          try {
            history = await fetchYahooPrices(entry.ticker);
            indexHistoryCache.current.set(entry.ticker, history);
          } catch (err: any) {
            indexEarnings.push({
              ticker: entry.ticker,
              label: entry.label,
              name: entry.name,
              group: entry.group,
              avgSigma: null,
              avgAbsSigma: null,
              pctAbsGte1: null,
              byDate: new Map(),
              error: err?.message ?? String(err),
            });
            continue;
          }
        }
        const closes = history.closes;
        const dates = history.dates;
        const dateIndexMap = new Map<string, number>();
        dates.forEach((d, idx) => dateIndexMap.set(d, idx));
        const byDate = new Map<string, number>();
        const sigmaMoves: number[] = [];
        for (const reactionDate of reactionDates) {
          let idx = dateIndexMap.get(reactionDate);
          if (idx == null) {
            for (let j = 0; j < dates.length; j++) {
              if (dates[j] >= reactionDate) {
                idx = j;
                break;
              }
            }
          }
          if (idx == null || idx < 1) continue;
          const windowEnd = idx;
          const windowStart = Math.max(1, horizonN);
          const startIdx = idx - windowStart;
          if (startIdx < 1) continue;
          const closeEnd = closes[idx];
          const closeStart = closes[startIdx];
          if (!Number.isFinite(closeEnd) || !Number.isFinite(closeStart) || closeEnd <= 0 || closeStart <= 0) continue;
          const logReturn = Math.log(closeEnd / closeStart);
          const { sigmaDaily } = computeVolAndDistribution(closes, startIdx, lookbackDays, horizonN);
          if (sigmaDaily == null || sigmaDaily <= 0) continue;
          const sigmaMove = logReturn / (sigmaDaily * sqrtN);
          byDate.set(reactionDate, sigmaMove);
          sigmaMoves.push(sigmaMove);
        }
        const n = sigmaMoves.length;
        const avgSigma = n > 0 ? sigmaMoves.reduce((a, v) => a + v, 0) / n : null;
        const avgAbsSigma = n > 0 ? sigmaMoves.reduce((a, v) => a + Math.abs(v), 0) / n : null;
        const pctAbsGte1 = n > 0 ? sigmaMoves.filter((v) => Math.abs(v) >= 1).length / n : null;
        indexEarnings.push({
          ticker: entry.ticker,
          label: entry.label,
          name: entry.name,
          group: entry.group,
          avgSigma,
          avgAbsSigma,
          pctAbsGte1,
          byDate,
        });
      }
      setIndexEarningsData(indexEarnings);
    } catch (err: any) {
      setGlobalError(err?.message || "Failed to compute earnings-day sigma moves");
    } finally {
      setLoadingEarnings(false);
      setEarningsProgress(null);
    }
  }, [tickerList, earningsYears, filteredIndexEntries, lookbackDays, horizonN]);

  React.useEffect(() => {
    if (isEarningsMode) computeEarningsMode();
  }, [isEarningsMode, earningsYears, tickerList, activeIndexGroups]);

  // ---------------------------------------------------------------------------
  // Sorted / filtered data
  // ---------------------------------------------------------------------------

  const sortedEarningsRows = React.useMemo(() => {
    const rows = earningsRows.slice();
    const dir = earningsSort.dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      let va: any = null;
      let vb: any = null;
      const k = earningsSort.key;
      if (k === "earningsDate") { va = a.earningsDate; vb = b.earningsDate; }
      else if (k === "ticker") { va = a.ticker; vb = b.ticker; }
      else if (k === "closeOnDate") { va = a.closeOnDate; vb = b.closeOnDate; }
      else if (k === "dollarChange") { va = a.dollarChange; vb = b.dollarChange; }
      else if (k === "pctChange") { va = a.pctChange; vb = b.pctChange; }
      else if (k === "sigmaAnnualized") { va = a.sigmaAnnualized; vb = b.sigmaAnnualized; }
      else if (k === "sigmaEwmaAnnualized") { va = a.sigmaEwmaAnnualized; vb = b.sigmaEwmaAnnualized; }
      else if (k === "sigmaMove") { va = a.sigmaMove; vb = b.sigmaMove; }
      else if (k === "sigmaMoveEwma") { va = a.sigmaMoveEwma; vb = b.sigmaMoveEwma; }
      else if (k === "percentile") { va = a.percentile; vb = b.percentile; }
      else if (k === "absSigmaMove") {
        va = a.sigmaMove == null ? null : Math.abs(a.sigmaMove);
        vb = b.sigmaMove == null ? null : Math.abs(b.sigmaMove);
      }
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
  }, [earningsRows, earningsSort]);

  const earningsSummaryStats = React.useMemo(() => {
    const rows = earningsRows.filter((r) => r.sigmaMove != null);
    const total = rows.length;
    const oneSig = rows.filter((r) => Math.abs(r.sigmaMove!) >= 1).length;
    const twoSig = rows.filter((r) => Math.abs(r.sigmaMove!) >= 2).length;
    const threeSig = rows.filter((r) => Math.abs(r.sigmaMove!) >= 3).length;
    const winners = rows.filter((r) => (r.sigmaMove ?? 0) > 0).length;
    const losers = rows.filter((r) => (r.sigmaMove ?? 0) < 0).length;
    const avgAbs = total > 0 ? rows.reduce((acc, r) => acc + Math.abs(r.sigmaMove!), 0) / total : null;
    return { total, oneSig, twoSig, threeSig, winners, losers, avgAbs };
  }, [earningsRows]);

  const toggleEarningsSort = (key: string) => {
    setEarningsSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );
  };

  const sortedLiveRows = React.useMemo(() => {
    const rows = liveRows.slice();
    const dir = liveSort.dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      let va: any = null;
      let vb: any = null;
      if (liveSort.key === "ticker") { va = a.ticker; vb = b.ticker; }
      else if (liveSort.key === "last") { va = a.last; vb = b.last; }
      else if (liveSort.key === "dollarChange") { va = a.dollarChange; vb = b.dollarChange; }
      else if (liveSort.key === "pctChange") { va = a.pctChange; vb = b.pctChange; }
      else if (liveSort.key === "sigmaAnnualized") { va = a.sigmaAnnualized; vb = b.sigmaAnnualized; }
      else if (liveSort.key === "sigmaEwmaAnnualized") { va = a.sigmaEwmaAnnualized; vb = b.sigmaEwmaAnnualized; }
      else if (liveSort.key === "sigmaMove") { va = a.sigmaMove; vb = b.sigmaMove; }
      else if (liveSort.key === "sigmaMoveEwma") { va = a.sigmaMoveEwma; vb = b.sigmaMoveEwma; }
      else if (liveSort.key === "percentile") { va = a.percentile; vb = b.percentile; }
      else if (liveSort.key === "absSigmaMove") {
        va = a.sigmaMove == null ? null : Math.abs(a.sigmaMove);
        vb = b.sigmaMove == null ? null : Math.abs(b.sigmaMove);
      }
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
  }, [liveRows, liveSort]);

  const liveSummaryStats = React.useMemo(() => {
    const rows = liveRows.filter((r) => r.sigmaMove != null);
    const total = rows.length;
    const oneSig = rows.filter((r) => Math.abs(r.sigmaMove!) >= 1).length;
    const twoSig = rows.filter((r) => Math.abs(r.sigmaMove!) >= 2).length;
    const threeSig = rows.filter((r) => Math.abs(r.sigmaMove!) >= 3).length;
    const winners = rows.filter((r) => (r.sigmaMove ?? 0) > 0).length;
    const losers = rows.filter((r) => (r.sigmaMove ?? 0) < 0).length;
    return { total, oneSig, twoSig, threeSig, winners, losers };
  }, [liveRows]);

  const toggleLiveSort = (key: string) => {
    setLiveSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );
  };

  // ---------------------------------------------------------------------------
  // Export CSV
  // ---------------------------------------------------------------------------
  const exportCsv = React.useCallback(() => {
    if (isEarningsMode) {
      const headers = [
        "ticker", "name", "earnings_date", "reaction_date", "prior_date",
        "close_on_date", "prior_close", "dollar_change", "pct_change", "sigma_daily",
        "sigma_annualized", "sigma_move", "sigma_ewma_daily", "sigma_ewma_annualized",
        "sigma_move_ewma", "percentile", "percentile_n", "hv_window",
      ];
      const dataRows = sortedEarningsRows.map((r) => [
        r.ticker,
        `"${r.name.replace(/"/g, '""')}"`,
        r.earningsDate,
        r.reactionDate,
        r.priorDate,
        r.closeOnDate ?? "",
        r.priorClose ?? "",
        r.dollarChange ?? "",
        r.pctChange ?? "",
        r.sigmaDaily ?? "",
        r.sigmaAnnualized ?? "",
        r.sigmaMove ?? "",
        r.sigmaEwmaDaily ?? "",
        r.sigmaEwmaAnnualized ?? "",
        r.sigmaMoveEwma ?? "",
        r.percentile ?? "",
        r.percentileN ?? 0,
        r.hvWindow,
      ]);
      const comments = [
        "# Sigma Move — Earnings days",
        `# Lookback (years of prints): ${earningsYears >= 999 ? "all" : earningsYears + "Y"}`,
        `# Vol lookback: ${lookbackDays}d  |  Horizon: ${horizonN}d`,
        `# Universe: ${tickerList.length} tickers / ${earningsRows.length} prints`,
      ];
      const csv = [...comments, headers.join(","), ...dataRows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sigma-move-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const headers = [
      "ticker", "name", "last", "previous_close", "dollar_change", "pct_change",
      "log_return_today", "log_return_n", "pct_change_n", "sigma_daily", "sigma_annualized",
      "sigma_move", "sigma_ewma_daily", "sigma_ewma_annualized", "sigma_move_ewma",
      "percentile", "percentile_n", "hv_window",
    ];
    const dataRows = sortedLiveRows.map((r) => [
      r.ticker,
      `"${r.name.replace(/"/g, '""')}"`,
      r.last ?? "",
      r.previousClose ?? "",
      r.dollarChange ?? "",
      r.pctChange ?? "",
      r.logReturnToday ?? "",
      r.logReturnN ?? "",
      r.pctChangeN ?? "",
      r.sigmaDaily ?? "",
      r.sigmaAnnualized ?? "",
      r.sigmaMove ?? "",
      r.sigmaEwmaDaily ?? "",
      r.sigmaEwmaAnnualized ?? "",
      r.sigmaMoveEwma ?? "",
      r.percentile ?? "",
      r.percentileN ?? 0,
      r.hvWindow,
    ]);
    const comments = [
      "# Sigma Move snapshot",
      `# Fetched: ${fetchedAt || "n/a"}`,
      `# Market state: ${marketState || "unknown"}`,
      `# Vol lookback: ${lookbackDays}d  |  Horizon: ${horizonN}d`,
      `# Universe: ${liveRows.length} tickers`,
    ];
    const csv = [...comments, headers.join(","), ...dataRows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sigma-move-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [
    isEarningsMode,
    sortedLiveRows,
    sortedEarningsRows,
    fetchedAt,
    marketState,
    liveRows.length,
    earningsYears,
    earningsRows.length,
    tickerList.length,
    lookbackDays,
    horizonN,
  ]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header / toolbar */}
      <div className="border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Title */}
          <div className="flex flex-col">
            <h1 className="text-sm font-bold uppercase tracking-wider">Sigma Snapshot</h1>
            <span className="text-[10px] text-muted-foreground">
              {isEarningsMode
                ? `Sigma move on each earnings print. ${horizonN}-day log return scaled by σ (RV / EWMA) over a ${lookbackDays}-day window ending the trading day before the print.`
                : `${horizonN === 1 ? "Today's move" : `${horizonN}-day move`} scaled by ${lookbackDays}-day log-return vol (RV / EWMA λ=${EWMA_LAMBDA}) + empirical percentile rank. Live quotes via Yahoo Finance (~15-min delayed).`}
            </span>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center rounded border border-border overflow-hidden text-[11px]">
            <button
              type="button"
              onClick={() => setIsEarningsMode(false)}
              className={`px-2.5 py-1 transition-colors ${
                isEarningsMode
                  ? "text-muted-foreground hover:text-foreground"
                  : "bg-amber-500/15 text-amber-300"
              }`}
              data-testid="btn-mode-live"
            >
              Live (today)
            </button>
            <button
              type="button"
              onClick={() => setIsEarningsMode(true)}
              className={`px-2.5 py-1 inline-flex items-center gap-1 transition-colors ${
                isEarningsMode
                  ? "bg-amber-500/15 text-amber-300"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="btn-mode-earnings"
            >
              <CalendarIcon className="w-3 h-3" />
              Earnings days
            </button>
          </div>

          {/* Earnings lookback years (earnings mode only) */}
          {isEarningsMode && (
            <div className="flex items-center rounded border border-border overflow-hidden text-[10px] font-mono">
              {EARNINGS_LOOKBACK_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setEarningsYears(opt.years)}
                  className={`px-2 py-1 transition-colors ${
                    earningsYears === opt.years
                      ? "bg-amber-500/15 text-amber-300"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`btn-lookback-${opt.label}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Sigma lookback */}
          <div
            className="flex items-center rounded border border-border overflow-hidden text-[10px] font-mono"
            title="Lookback window used to compute realized vol, EWMA vol, and the empirical percentile distribution"
          >
            <span className="px-1.5 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/80 border-r border-border">
              σ LB
            </span>
            {LOOKBACK_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setLookbackDays(opt.days)}
                className={`px-2 py-1 transition-colors ${
                  lookbackDays === opt.days
                    ? "bg-amber-500/15 text-amber-300"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`btn-sigma-lookback-${opt.label}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Horizon */}
          <div
            className="flex items-center rounded border border-border overflow-hidden text-[10px] font-mono"
            title={`Return horizon in trading days. σ-move denominator scales by √N (= ${Math.sqrt(Math.max(1, horizonN)).toFixed(2)})`}
          >
            <span className="px-1.5 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/80 border-r border-border">
              Horizon
            </span>
            {HORIZON_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setHorizonN(opt.n)}
                className={`px-2 py-1 transition-colors ${
                  horizonN === opt.n
                    ? "bg-amber-500/15 text-amber-300"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`btn-horizon-${opt.label}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Status / info */}
          <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
            {!isEarningsMode && marketState && (
              <span className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    marketState === "REGULAR" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                  }`}
                />
                {marketState}
              </span>
            )}
            {!isEarningsMode && fetchedAt && (
              <span title={fetchedAt}>
                Quotes:{" "}
                {new Date(fetchedAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
            {isEarningsMode ? (
              <span>
                {earningsRows.length.toLocaleString()} prints · {tickerList.length} tickers
              </span>
            ) : (
              <span>{liveRows.length} tickers</span>
            )}
          </div>

          {/* Search */}
          <div className="relative flex items-center">
            <SearchIcon className="absolute left-2 w-3 h-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={tickerSearch}
              onChange={(e) => setTickerSearch(e.target.value)}
              placeholder="Search ticker…"
              className="h-7 pl-6 pr-7 text-[11px] font-mono bg-background border border-border rounded w-[160px] focus:outline-none focus:border-amber-500/60"
              data-testid="input-ticker-search"
            />
            {tickerSearch && (
              <button
                type="button"
                onClick={() => setTickerSearch("")}
                className="absolute right-1 p-0.5 text-muted-foreground hover:text-foreground rounded"
                data-testid="btn-clear-ticker-search"
                aria-label="Clear search"
              >
                <XIcon className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Refresh quotes (live mode) */}
          {!isEarningsMode && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={fetchLiveQuotes}
              disabled={fetchingQuotes || loadingHistory || liveRows.length === 0}
              data-testid="refresh-quotes"
            >
              {fetchingQuotes ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Refresh quotes
            </Button>
          )}

          {/* Recompute (earnings mode) */}
          {isEarningsMode && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[11px]"
              onClick={computeEarningsMode}
              disabled={loadingEarnings}
              data-testid="reload-earnings"
            >
              {loadingEarnings ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Recompute
            </Button>
          )}

          {/* Export CSV */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={exportCsv}
            disabled={isEarningsMode ? earningsRows.length === 0 : liveRows.length === 0}
            data-testid="export-csv"
          >
            <Download className="w-3 h-3" />
            CSV
          </Button>
        </div>

        {/* Live summary stats */}
        {!isEarningsMode && liveRows.length > 0 && (
          <div className="flex items-center gap-3 mt-2 text-[10px] font-mono">
            <StatChip label="|σ| ≥ 1" value={liveSummaryStats.oneSig} total={liveSummaryStats.total} color="text-amber-400" />
            <StatChip label="|σ| ≥ 2" value={liveSummaryStats.twoSig} total={liveSummaryStats.total} color="text-orange-400" />
            <StatChip label="|σ| ≥ 3" value={liveSummaryStats.threeSig} total={liveSummaryStats.total} color="text-red-400" />
            <span className="text-muted-foreground">|</span>
            <StatChip label="up" value={liveSummaryStats.winners} total={liveSummaryStats.total} color="text-emerald-400" />
            <StatChip label="down" value={liveSummaryStats.losers} total={liveSummaryStats.total} color="text-red-400" />
          </div>
        )}

        {/* Earnings summary stats */}
        {isEarningsMode && earningsRows.length > 0 && (
          <div className="flex items-center gap-3 mt-2 text-[10px] font-mono">
            <StatChip label="|σ| ≥ 1" value={earningsSummaryStats.oneSig} total={earningsSummaryStats.total} color="text-amber-400" />
            <StatChip label="|σ| ≥ 2" value={earningsSummaryStats.twoSig} total={earningsSummaryStats.total} color="text-orange-400" />
            <StatChip label="|σ| ≥ 3" value={earningsSummaryStats.threeSig} total={earningsSummaryStats.total} color="text-red-400" />
            <span className="text-muted-foreground">|</span>
            <StatChip label="up" value={earningsSummaryStats.winners} total={earningsSummaryStats.total} color="text-emerald-400" />
            <StatChip label="down" value={earningsSummaryStats.losers} total={earningsSummaryStats.total} color="text-red-400" />
            {earningsSummaryStats.avgAbs != null && (
              <>
                <span className="text-muted-foreground">|</span>
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground uppercase tracking-wider">avg |σ|:</span>
                  <span className="text-foreground">{earningsSummaryStats.avgAbs.toFixed(2)}σ</span>
                </span>
              </>
            )}
          </div>
        )}

        {/* Index banner */}
        {showIndices && (
          <div className="mt-2 text-[10px] font-mono">
            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
              <span className="inline-flex items-center gap-1 text-muted-foreground uppercase tracking-wider mr-1">
                <GridIcon className="w-3 h-3" />
                {isEarningsMode ? "Index avg |σ| on these dates" : "Index σ today"}:
              </span>
              {INDEX_GROUP_ORDER.map((group) => {
                const isActive = activeIndexGroups.includes(group);
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => toggleIndexGroup(group)}
                    title={`${INDEX_GROUP_LABELS[group]} — click to ${isActive ? "hide" : "show"}`}
                    data-testid={`btn-index-group-${group}`}
                    className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${
                      isActive
                        ? "border-amber-400/60 bg-amber-500/15 text-amber-200"
                        : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                  >
                    {INDEX_GROUP_SHORT[group]}
                    {isActive && <span className="ml-1 text-amber-300">✓</span>}
                  </button>
                );
              })}
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => setShowIndices(false)}
                className="text-muted-foreground hover:text-foreground px-1"
                title="Hide index banner"
                data-testid="btn-hide-indices"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </div>

            {!isEarningsMode && loadingIndexData && indexLiveRows.length === 0 && (
              <span className="text-muted-foreground">loading…</span>
            )}
            {isEarningsMode && indexEarningsData.length === 0 && earningsRows.length > 0 && (
              <span className="text-muted-foreground">computing…</span>
            )}

            {INDEX_GROUP_ORDER.filter((g) => activeIndexGroups.includes(g)).map((group) => {
              const liveEntries = isEarningsMode ? [] : indexLiveRows.filter((r) => r.group === group);
              const earningsEntries = isEarningsMode ? indexEarningsData.filter((r) => r.group === group) : [];
              if (liveEntries.length === 0 && earningsEntries.length === 0) return null;
              return (
                <div
                  key={group}
                  className="flex items-center gap-1.5 flex-wrap mb-1"
                  data-testid={`index-group-row-${group}`}
                >
                  <span className="inline-block w-[68px] text-[9px] uppercase tracking-wider text-muted-foreground/80">
                    {INDEX_GROUP_SHORT[group]}:
                  </span>
                  {liveEntries.map((entry) => {
                    const lbl = sigmaLabel(entry.sigmaMove);
                    return (
                      <span
                        key={entry.ticker}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background"
                        title={`${entry.name} — last: ${formatNum(entry.last)} · prev: ${formatNum(entry.previousClose)} · ${lookbackDays}d HV ann: ${entry.sigmaAnnualized != null ? (entry.sigmaAnnualized * 100).toFixed(1) + "%" : "—"} · EWMA ann: ${entry.sigmaEwmaAnnualized != null ? (entry.sigmaEwmaAnnualized * 100).toFixed(1) + "%" : "—"}`}
                        data-testid={`index-chip-${entry.ticker}`}
                      >
                        <span className="text-foreground font-bold">{entry.label}</span>
                        <span className={pctChangeColor(entry.pctChange)}>{formatPct(entry.pctChange)}</span>
                        <span className={`${sigmaColor(entry.sigmaMove)} ml-0.5`}>{formatSigma(entry.sigmaMove)}</span>
                        <span className={`text-[9px] uppercase ${lbl.color}`}>{lbl.label}</span>
                      </span>
                    );
                  })}
                  {earningsEntries.map((entry) => (
                    <span
                      key={entry.ticker}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background"
                      title={`${entry.name} — avg signed σ: ${entry.avgSigma != null ? entry.avgSigma.toFixed(2) : "—"} · share |σ| ≥ 1: ${entry.pctAbsGte1 != null ? (entry.pctAbsGte1 * 100).toFixed(0) + "%" : "—"}`}
                      data-testid={`index-chip-${entry.ticker}`}
                    >
                      <span className="text-foreground font-bold">{entry.label}</span>
                      <span className="text-foreground">
                        {entry.avgAbsSigma != null ? `${entry.avgAbsSigma.toFixed(2)}σ` : "—"}
                      </span>
                      <span className="text-muted-foreground">
                        |σ|≥1: {entry.pctAbsGte1 != null ? `${(entry.pctAbsGte1 * 100).toFixed(0)}%` : "—"}
                      </span>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Show indices toggle (when hidden) */}
        {!showIndices && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowIndices(true)}
              className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5"
              data-testid="btn-show-indices"
            >
              <GridIcon className="w-3 h-3" />
              Show index σ
            </button>
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {/* Global error */}
        {globalError && (
          <div className="m-4 text-sm text-red-400 p-3 border border-red-500/30 rounded bg-red-500/5">
            {globalError}
          </div>
        )}

        {/* Live mode loading */}
        {!isEarningsMode && loadingHistory && liveRows.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading {lookbackDays}-day vol (RV + EWMA) + percentile distribution…
            </span>
          </div>
        )}

        {/* Earnings mode loading */}
        {isEarningsMode && loadingEarnings && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Computing sigma move per earnings print
              {earningsProgress ? ` · ${earningsProgress.done}/${earningsProgress.total} tickers` : ""}…
            </span>
          </div>
        )}

        {/* Earnings mode empty */}
        {isEarningsMode && !loadingEarnings && earningsRows.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No earnings prints found in the selected lookback window.
          </div>
        )}

        {/* Earnings table */}
        {isEarningsMode && !loadingEarnings && earningsRows.length > 0 && (() => {
          const filtered = sortedEarningsRows.filter((r) => matchesSearch(r.ticker, r.name));
          if (filtered.length === 0) {
            return (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                No tickers match "{tickerSearch}".
              </div>
            );
          }
          const spyByDate = indexEarningsData.find((r) => r.ticker === "SPY")?.byDate;
          const vnqByDate = indexEarningsData.find((r) => r.ticker === "VNQ")?.byDate;
          return (
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 z-10 bg-card border-b border-border">
                <tr className="text-muted-foreground">
                  <SortableHeaderEarnings label="Earnings Date" k="earningsDate" sort={earningsSort} onClick={toggleEarningsSort} align="left" />
                  <SortableHeaderEarnings label="Ticker" k="ticker" sort={earningsSort} onClick={toggleEarningsSort} align="left" />
                  <th className="text-left px-3 py-2 font-bold">Name</th>
                  <SortableHeaderEarnings label="Close" k="closeOnDate" sort={earningsSort} onClick={toggleEarningsSort} align="right" />
                  <th className="text-right px-3 py-2 font-bold">Prior Close</th>
                  <SortableHeaderEarnings label="$ Change" k="dollarChange" sort={earningsSort} onClick={toggleEarningsSort} align="right" />
                  <SortableHeaderEarnings label="% Change" k="pctChange" sort={earningsSort} onClick={toggleEarningsSort} align="right" />
                  <SortableHeaderEarnings label={`${lookbackDays}d HV (ann.)`} k="sigmaAnnualized" sort={earningsSort} onClick={toggleEarningsSort} align="right" />
                  <SortableHeaderEarnings label="EWMA HV (ann.)" k="sigmaEwmaAnnualized" sort={earningsSort} onClick={toggleEarningsSort} align="right" />
                  <SortableHeaderEarnings label="σ Move" k="sigmaMove" sort={earningsSort} onClick={toggleEarningsSort} align="right" />
                  <SortableHeaderEarnings label="σ Move (EWMA)" k="sigmaMoveEwma" sort={earningsSort} onClick={toggleEarningsSort} align="right" />
                  <SortableHeaderEarnings label="|σ|" k="absSigmaMove" sort={earningsSort} onClick={toggleEarningsSort} align="right" />
                  <SortableHeaderEarnings label="Pctile" k="percentile" sort={earningsSort} onClick={toggleEarningsSort} align="right" />
                  {showIndices && (
                    <>
                      <th className="text-right px-3 py-2 font-bold text-amber-300/80" title="SPY σ move on the same reaction date — market context">SPY σ</th>
                      <th className="text-right px-3 py-2 font-bold text-amber-300/80" title="VNQ σ move on the same reaction date — REIT-sector context">VNQ σ</th>
                      <th className="text-right px-3 py-2 font-bold text-amber-300/80" title="Stock σ minus SPY σ — idiosyncratic component vs the broad market">Δσ vs SPY</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => {
                  const lbl = sigmaLabel(row.sigmaMove);
                  const dateDisplay =
                    row.reactionDate === row.earningsDate
                      ? row.earningsDate
                      : `${row.earningsDate} → ${row.reactionDate}`;
                  const spySigma = spyByDate?.get(row.reactionDate) ?? null;
                  const vnqSigma = vnqByDate?.get(row.reactionDate) ?? null;
                  const deltaSigmaVsSpy =
                    row.sigmaMove != null && spySigma != null ? row.sigmaMove - spySigma : null;
                  return (
                    <tr
                      key={`${row.ticker}-${row.earningsDate}-${idx}`}
                      className="border-b border-border/50 hover:bg-white/5"
                    >
                      <td className="px-3 py-1.5 text-foreground" title={dateDisplay}>
                        {row.earningsDate}
                      </td>
                      <td className="px-3 py-1.5 font-bold text-foreground">{row.ticker}</td>
                      <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[260px]" title={row.name}>
                        {row.name}
                      </td>
                      <td className="px-3 py-1.5 text-right">{formatNum(row.closeOnDate)}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{formatNum(row.priorClose)}</td>
                      <td className={`px-3 py-1.5 text-right ${pctChangeColor(row.dollarChange)}`}>
                        {formatNumSigned(row.dollarChange)}
                      </td>
                      <td className={`px-3 py-1.5 text-right ${pctChangeColor(row.pctChange)}`}>
                        {formatPct(row.pctChange)}
                      </td>
                      <td
                        className="px-3 py-1.5 text-right text-muted-foreground"
                        title={
                          row.sigmaDaily != null
                            ? `daily: ${(row.sigmaDaily * 100).toFixed(2)}% · window: ${row.hvWindow} returns ending ${row.priorDate}`
                            : undefined
                        }
                      >
                        {row.sigmaAnnualized != null ? `${(row.sigmaAnnualized * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td
                        className="px-3 py-1.5 text-right text-muted-foreground"
                        title={
                          row.sigmaEwmaDaily != null
                            ? `EWMA daily (λ=${EWMA_LAMBDA}): ${(row.sigmaEwmaDaily * 100).toFixed(2)}% · ending ${row.priorDate}`
                            : undefined
                        }
                      >
                        {row.sigmaEwmaAnnualized != null ? `${(row.sigmaEwmaAnnualized * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className={`px-3 py-1.5 text-right ${sigmaColor(row.sigmaMove)}`}>
                        {formatSigma(row.sigmaMove)}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right ${sigmaColor(row.sigmaMoveEwma)}`}
                        title={row.sigmaMoveEwma != null ? `Log return / (σ_EWMA · √${horizonN})` : undefined}
                      >
                        {formatSigma(row.sigmaMoveEwma)}
                      </td>
                      <td className={`px-3 py-1.5 text-right text-[10px] uppercase tracking-wider ${lbl.color}`}>
                        {lbl.label}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right ${percentileColor(row.percentile)}`}
                        title={
                          row.percentile != null
                            ? `Rank of ${horizonN}-day log return in trailing ${row.percentileN} obs (${lookbackDays}d window)`
                            : undefined
                        }
                      >
                        {formatPercentile(row.percentile)}
                      </td>
                      {showIndices && (
                        <>
                          <td
                            className={`px-3 py-1.5 text-right ${sigmaColor(spySigma)}`}
                            data-testid={`spy-sigma-${row.ticker}-${row.earningsDate}`}
                          >
                            {formatSigma(spySigma)}
                          </td>
                          <td className={`px-3 py-1.5 text-right ${sigmaColor(vnqSigma)}`}>
                            {formatSigma(vnqSigma)}
                          </td>
                          <td
                            className={`px-3 py-1.5 text-right ${sigmaColor(deltaSigmaVsSpy)}`}
                            title="Stock σ minus SPY σ on the same day. Positive = stock moved more than market."
                          >
                            {formatSigma(deltaSigmaVsSpy)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })()}

        {/* Live table */}
        {!isEarningsMode && liveRows.length > 0 && (() => {
          const filtered = sortedLiveRows.filter((r) => matchesSearch(r.ticker, r.name));
          if (filtered.length === 0) {
            return (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                No tickers match "{tickerSearch}".
              </div>
            );
          }
          return (
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 z-10 bg-card border-b border-border">
                <tr className="text-muted-foreground">
                  <SortableHeaderLive label="Ticker" k="ticker" sort={liveSort} onClick={toggleLiveSort} align="left" />
                  <th className="text-left px-3 py-2 font-bold">Name</th>
                  <SortableHeaderLive label="Last" k="last" sort={liveSort} onClick={toggleLiveSort} align="right" />
                  <th className="text-right px-3 py-2 font-bold">Prev Close</th>
                  <SortableHeaderLive label="$ Change" k="dollarChange" sort={liveSort} onClick={toggleLiveSort} align="right" />
                  <SortableHeaderLive label="% Change" k="pctChange" sort={liveSort} onClick={toggleLiveSort} align="right" />
                  <SortableHeaderLive label={`${lookbackDays}d HV (ann.)`} k="sigmaAnnualized" sort={liveSort} onClick={toggleLiveSort} align="right" />
                  <SortableHeaderLive label="EWMA HV (ann.)" k="sigmaEwmaAnnualized" sort={liveSort} onClick={toggleLiveSort} align="right" />
                  <SortableHeaderLive label="σ Move" k="sigmaMove" sort={liveSort} onClick={toggleLiveSort} align="right" />
                  <SortableHeaderLive label="σ Move (EWMA)" k="sigmaMoveEwma" sort={liveSort} onClick={toggleLiveSort} align="right" />
                  <SortableHeaderLive label="|σ|" k="absSigmaMove" sort={liveSort} onClick={toggleLiveSort} align="right" />
                  <SortableHeaderLive label="Pctile" k="percentile" sort={liveSort} onClick={toggleLiveSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {/* Index rows (inline in live table) */}
                {showIndices &&
                  indexLiveRows.map((entry) => {
                    const lbl = sigmaLabel(entry.sigmaMove);
                    return (
                      <tr
                        key={`idx-${entry.ticker}`}
                        className="border-b border-border bg-amber-500/5 hover:bg-amber-500/10"
                        data-testid={`index-row-${entry.ticker}`}
                      >
                        <td className="px-3 py-1.5 font-bold text-amber-300">{entry.label}</td>
                        <td
                          className="px-3 py-1.5 text-muted-foreground truncate max-w-[280px] italic"
                          title={entry.name}
                        >
                          {entry.name}
                        </td>
                        <td className="px-3 py-1.5 text-right">{formatNum(entry.last)}</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">
                          {formatNum(entry.previousClose)}
                        </td>
                        <td className={`px-3 py-1.5 text-right ${pctChangeColor(entry.dollarChange)}`}>
                          {formatNumSigned(entry.dollarChange)}
                        </td>
                        <td className={`px-3 py-1.5 text-right ${pctChangeColor(entry.pctChange)}`}>
                          {formatPct(entry.pctChange)}
                        </td>
                        <td
                          className="px-3 py-1.5 text-right text-muted-foreground"
                          title={
                            entry.sigmaDaily != null
                              ? `daily: ${(entry.sigmaDaily * 100).toFixed(2)}% · window: ${entry.hvWindow} returns`
                              : undefined
                          }
                        >
                          {entry.sigmaAnnualized != null ? `${(entry.sigmaAnnualized * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td
                          className="px-3 py-1.5 text-right text-muted-foreground"
                          title={
                            entry.sigmaEwmaDaily != null
                              ? `EWMA daily (λ=${EWMA_LAMBDA}): ${(entry.sigmaEwmaDaily * 100).toFixed(2)}%`
                              : undefined
                          }
                        >
                          {entry.sigmaEwmaAnnualized != null
                            ? `${(entry.sigmaEwmaAnnualized * 100).toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className={`px-3 py-1.5 text-right ${sigmaColor(entry.sigmaMove)}`}>
                          {formatSigma(entry.sigmaMove)}
                        </td>
                        <td className={`px-3 py-1.5 text-right ${sigmaColor(entry.sigmaMoveEwma)}`}>
                          {formatSigma(entry.sigmaMoveEwma)}
                        </td>
                        <td className={`px-3 py-1.5 text-right text-[10px] uppercase tracking-wider ${lbl.color}`}>
                          {lbl.label}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right ${percentileColor(entry.percentile)}`}
                          title={
                            entry.percentile != null
                              ? `Rank of ${horizonN}-day log return in trailing ${entry.percentileN} obs (${lookbackDays}d window)`
                              : undefined
                          }
                        >
                          {formatPercentile(entry.percentile)}
                        </td>
                      </tr>
                    );
                  })}
                {/* REIT universe rows */}
                {filtered.map((row) => {
                  const lbl = sigmaLabel(row.sigmaMove);
                  return (
                    <tr key={row.ticker} className="border-b border-border/50 hover:bg-white/5">
                      <td className="px-3 py-1.5 font-bold text-foreground">{row.ticker}</td>
                      <td
                        className="px-3 py-1.5 text-muted-foreground truncate max-w-[280px]"
                        title={row.name}
                      >
                        {row.name}
                      </td>
                      <td className="px-3 py-1.5 text-right">{formatNum(row.last)}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                        {formatNum(row.previousClose)}
                      </td>
                      <td className={`px-3 py-1.5 text-right ${pctChangeColor(row.dollarChange)}`}>
                        {formatNumSigned(row.dollarChange)}
                      </td>
                      <td className={`px-3 py-1.5 text-right ${pctChangeColor(row.pctChange)}`}>
                        {formatPct(row.pctChange)}
                      </td>
                      <td
                        className="px-3 py-1.5 text-right text-muted-foreground"
                        title={
                          row.sigmaDaily != null
                            ? `daily: ${(row.sigmaDaily * 100).toFixed(2)}% · window: ${row.hvWindow} returns`
                            : undefined
                        }
                      >
                        {row.sigmaAnnualized != null ? `${(row.sigmaAnnualized * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td
                        className="px-3 py-1.5 text-right text-muted-foreground"
                        title={
                          row.sigmaEwmaDaily != null
                            ? `EWMA daily (λ=${EWMA_LAMBDA}): ${(row.sigmaEwmaDaily * 100).toFixed(2)}%`
                            : undefined
                        }
                      >
                        {row.sigmaEwmaAnnualized != null ? `${(row.sigmaEwmaAnnualized * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td className={`px-3 py-1.5 text-right ${sigmaColor(row.sigmaMove)}`}>
                        {formatSigma(row.sigmaMove)}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right ${sigmaColor(row.sigmaMoveEwma)}`}
                        title={row.sigmaMoveEwma != null ? `Log return / (σ_EWMA · √${horizonN})` : undefined}
                      >
                        {formatSigma(row.sigmaMoveEwma)}
                      </td>
                      <td className={`px-3 py-1.5 text-right text-[10px] uppercase tracking-wider ${lbl.color}`}>
                        {lbl.label}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right ${percentileColor(row.percentile)}`}
                        title={
                          row.percentile != null
                            ? `Rank of ${horizonN}-day log return in trailing ${row.percentileN} obs (${lookbackDays}d window)`
                            : undefined
                        }
                      >
                        {formatPercentile(row.percentile)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })()}
      </div>
    </div>
  );
}
