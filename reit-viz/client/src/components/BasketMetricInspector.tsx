// Reconstructed from recovered-bundle/index-CsG73Aq_.js (fn ike, ~L50236) on 2026-06-17
//
// Basket "metric inspector" Dialog. For a chosen metric and optional as-of date it
// fetches each constituent's metric value + the basket weights, computes per-ticker
// value / weight / contribution, and renders the explanatory table + aggregate formula
// (plain sum / cap-weighted harmonic mean / cap-weighted arithmetic mean).

import { useState, useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchMetricSeries } from "@/lib/fetchMetricSeries";
import { getTickers, getTickersCacheSync } from "@/lib/dataService";
import { groupMetricsByCategory, DERIVED_METRICS } from "@/lib/metricCategories";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetricSeriesPoint {
  time: string;
  value: number;
}

interface FmpHistCapsSnapshot {
  series?: Record<string, { date: string; marketCap: number }[]>;
}

interface YahooCapSnapshot {
  caps?: Record<string, number>;
}

export interface InspectableBasket {
  id: string;
  name: string;
  tickers: string[];
  updatedAt?: number;
  weighting?: string;
  rebalance?: string;
  customWeights?: Record<string, number>;
  volLookback?: number;
  fmpHistCapsSnapshot?: FmpHistCapsSnapshot;
  yahooCapSnapshot?: YahooCapSnapshot;
  [key: string]: unknown;
}

interface BasketConfig {
  weighting: string;
  rebalance: string;
  customWeights: Record<string, number>;
  volLookback: number;
}

interface ConstituentRow {
  ticker: string;
  value: number;
  asOf: string | null;
  weight: number;
  contribution: number;
}

export interface BasketMetricInspectorProps {
  basket: InspectableBasket | null;
  open: boolean;
  onClose: () => void;
}

type MetricFetcher = (ticker: string, metric: string) => Promise<MetricSeriesPoint[]>;

// ---------------------------------------------------------------------------
// Metric classification (bundle GH/KH sets + f5/XH/JH)
// ---------------------------------------------------------------------------

const HARMONIC_METRICS = new Set([
  "P/E LTM",
  "P/E FY2",
  "P/FFO LTM",
  "P/FFO FY2",
  "P/AFFO LTM",
  "P/AFFO FY2",
  "P/S LTM",
  "P/S FY2",
  "EV/EBITDA LTM",
  "EV/EBITDA FY2",
  "P/B",
  "P/Book",
  "Price to Book",
  "P/NAV",
  "Price to NAV",
]);

const SUM_METRICS = new Set(["Buy Ratings", "Hold Ratings", "Sell Ratings"]);

type AggregationKind = "harmonic" | "sum" | "arithmetic";

function getAggregationKind(metric: string): AggregationKind {
  return HARMONIC_METRICS.has(metric)
    ? "harmonic"
    : SUM_METRICS.has(metric)
      ? "sum"
      : "arithmetic";
}

function isHarmonicMetric(metric: string): boolean {
  return HARMONIC_METRICS.has(metric);
}

function isSumMetric(metric: string): boolean {
  return SUM_METRICS.has(metric);
}

// Metric list shown in the picker (bundle nke).
// Curated metrics that should always be offered even if absent from the data;
// unioned at runtime with the loaded universe's metrics + derived ones.
const METRIC_OPTIONS_BASE = [
  "close",
  "Volume",
  "P/E LTM",
  "P/E FY2",
  "P/S LTM",
  "P/S FY2",
  "EV/EBITDA LTM",
  "EV/EBITDA FY2",
  "P/FFO LTM",
  "P/FFO FY2",
  "P/AFFO LTM",
  "P/AFFO FY2",
  "FFO Yield LTM",
  "FFO Yield FY2",
  "AFFO Yield LTM",
  "AFFO Yield FY2",
  "Implied Cap Rate",
  "Dividend Yield",
  "Short Interest%",
  "FY1 EPS Growth",
  "FY2 EPS Growth",
  "FY1 FFO Growth",
  "FY2 FFO Growth",
  "FY1 AFFO Growth",
  "FY2 AFFO Growth",
  "FY2 EBITDA Growth",
  "FY2 Sales Growth",
  "1M Price Chg%",
  "3M Price Chg%",
  "6M Price Chg%",
  "1Y Price Chg%",
  "% off 52wk High",
  "% off 52wk Low",
];

// ---------------------------------------------------------------------------
// Formatters (bundle Kf/sD)
// ---------------------------------------------------------------------------

function formatNumber(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "—";
  return Math.abs(value) >= 1e3
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : value.toFixed(digits);
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "—";
}

// ---------------------------------------------------------------------------
// Basket weighting helpers (bundle Od/dd/bY/wY/ug)
// ---------------------------------------------------------------------------

function getBasketConfig(basket: InspectableBasket): BasketConfig {
  return {
    weighting: basket.weighting ?? "market_cap",
    rebalance: basket.rebalance ?? "monthly",
    customWeights: basket.customWeights ?? {},
    volLookback: basket.volLookback ?? 60,
  };
}

// Normalize a raw weight map to sum to 1 (equal-weight fallback when total ≤ 0).
function normalizeWeights(raw: Record<string, number>): Record<string, number> {
  const keys = Object.keys(raw);
  if (keys.length === 0) return {};
  const total = keys.reduce((acc, key) => acc + (raw[key] || 0), 0);
  if (total <= 0) {
    const equal = 1 / keys.length;
    return Object.fromEntries(keys.map((key) => [key, equal]));
  }
  return Object.fromEntries(keys.map((key) => [key, (raw[key] || 0) / total]));
}

// Population standard deviation.
function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Resolve a single ticker's market cap (bundle wY) via the metric fetcher.
async function fetchMarketCap(
  ticker: string,
  fetcher: MetricFetcher,
): Promise<number | null> {
  const sources = [
    "Fund: Market Cap",
    "Market Cap",
    "Fund: Enterprise Value",
    "Enterprise Value",
  ];
  for (const source of sources) {
    try {
      const series = await fetcher(ticker, source);
      if (series.length > 0) {
        const latest = series[series.length - 1].value;
        if (latest > 0 && isFinite(latest)) return latest;
      }
    } catch {
      // try next source
    }
  }
  return null;
}

interface BasketWeightsResult {
  weights: Record<string, number>;
  usingEqualWeight: boolean;
}

// Compute basket weights (bundle ug). `closeSeriesByTicker` provides per-ticker close
// series for price/inverse-vol schemes; `fetcher` is used for market-cap lookups.
async function computeBasketWeights(
  basket: InspectableBasket,
  closeSeriesByTicker: Record<string, MetricSeriesPoint[]>,
  fetcher: MetricFetcher,
): Promise<BasketWeightsResult> {
  const { weighting, volLookback, customWeights } = getBasketConfig(basket);
  const tickers = basket.tickers;

  if (tickers.length === 0) return { weights: {}, usingEqualWeight: false };

  if (weighting === "equal") {
    const equal = 1 / tickers.length;
    return {
      weights: Object.fromEntries(tickers.map((t) => [t, equal])),
      usingEqualWeight: false,
    };
  }

  if (weighting === "price") {
    const raw: Record<string, number> = {};
    for (const ticker of tickers) {
      const series = closeSeriesByTicker[ticker];
      raw[ticker] = series && series.length > 0 ? series[series.length - 1].value : 1;
    }
    return { weights: normalizeWeights(raw), usingEqualWeight: false };
  }

  if (weighting === "custom") {
    const raw: Record<string, number> = {};
    for (const ticker of tickers) {
      raw[ticker] = customWeights[ticker] ?? 1 / tickers.length;
    }
    return { weights: normalizeWeights(raw), usingEqualWeight: false };
  }

  if (weighting === "fmp_cap_daily") {
    const snapshot = basket.fmpHistCapsSnapshot;
    if (!snapshot || !snapshot.series) {
      const equal = 1 / tickers.length;
      return {
        weights: Object.fromEntries(tickers.map((t) => [t, equal])),
        usingEqualWeight: true,
      };
    }
    const raw: Record<string, number> = {};
    for (const ticker of tickers) {
      const series = snapshot.series[ticker.toUpperCase()] || [];
      const cap = series.length ? series[series.length - 1].marketCap : 0;
      raw[ticker] = cap > 0 ? cap : 0;
    }
    if (Object.values(raw).reduce((acc, v) => acc + v, 0) <= 0) {
      const equal = 1 / tickers.length;
      return {
        weights: Object.fromEntries(tickers.map((t) => [t, equal])),
        usingEqualWeight: true,
      };
    }
    return { weights: normalizeWeights(raw), usingEqualWeight: false };
  }

  if (weighting === "yahoo_cap") {
    const snapshot = basket.yahooCapSnapshot;
    if (!snapshot || !snapshot.caps || Object.keys(snapshot.caps).length === 0) {
      const equal = 1 / tickers.length;
      return {
        weights: Object.fromEntries(tickers.map((t) => [t, equal])),
        usingEqualWeight: true,
      };
    }
    const raw: Record<string, number> = {};
    const missing: string[] = [];
    for (const ticker of tickers) {
      const cap = snapshot.caps[ticker];
      if (cap && cap > 0) {
        raw[ticker] = cap;
      } else {
        missing.push(ticker);
        raw[ticker] = 0;
      }
    }
    if (missing.length > 0) {
      console.warn(
        `[basketSeries] yahoo_cap: missing caps for ${missing.join(", ")} — excluded from weights`,
      );
    }
    if (Object.values(raw).reduce((acc, v) => acc + v, 0) <= 0) {
      const equal = 1 / tickers.length;
      return {
        weights: Object.fromEntries(tickers.map((t) => [t, equal])),
        usingEqualWeight: true,
      };
    }
    return { weights: normalizeWeights(raw), usingEqualWeight: false };
  }

  if (weighting === "inverse_vol") {
    const lookback = volLookback;
    const raw: Record<string, number> = {};
    for (const ticker of tickers) {
      const series = closeSeriesByTicker[ticker];
      if (!series || series.length < 2) {
        raw[ticker] = 1;
        continue;
      }
      const window = series.slice(Math.max(0, series.length - lookback));
      const returns: number[] = [];
      for (let i = 1; i < window.length; i++) {
        if (window[i - 1].value > 0) {
          returns.push(Math.log(window[i].value / window[i - 1].value));
        }
      }
      const vol = stdev(returns);
      raw[ticker] = vol > 0 ? 1 / vol : 1;
    }
    return { weights: normalizeWeights(raw), usingEqualWeight: false };
  }

  // Default: market_cap (resolved live via the metric fetcher).
  const raw: Record<string, number> = {};
  let missing = false;
  await Promise.all(
    tickers.map(async (ticker) => {
      const cap = await fetchMarketCap(ticker, fetcher);
      if (cap !== null) {
        raw[ticker] = cap;
      } else {
        missing = true;
        raw[ticker] = 0;
      }
    }),
  );
  if (Object.values(raw).reduce((acc, v) => acc + v, 0) <= 0 || missing) {
    const equal = 1 / tickers.length;
    return {
      weights: Object.fromEntries(tickers.map((t) => [t, equal])),
      usingEqualWeight: true,
    };
  }
  return { weights: normalizeWeights(raw), usingEqualWeight: false };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BasketMetricInspector({
  basket,
  open,
  onClose,
}: BasketMetricInspectorProps) {
  const [metric, setMetric] = useState("P/FFO FY2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ConstituentRow[]>([]);
  const [asOfInput, setAsOfInput] = useState("");
  const [snapshotDate, setSnapshotDate] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [dataMetrics, setDataMetrics] = useState<string[]>(() => {
    const c = getTickersCacheSync();
    return c ? [...new Set(c.flatMap((t) => t.metrics || []))] : [];
  });

  // Load the loaded universe's metric set so newly added metrics are selectable.
  useEffect(() => {
    let cancelled = false;
    getTickers()
      .then((ts) => { if (!cancelled) setDataMetrics([...new Set(ts.flatMap((t) => t.metrics || []))]); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Union curated + data + derived metrics, grouped by category for the picker.
  const metricGroups = useMemo(
    () => groupMetricsByCategory([...new Set([...METRIC_OPTIONS_BASE, ...DERIVED_METRICS, ...dataMetrics])]),
    [dataMetrics],
  );

  const aggregationKind = getAggregationKind(metric);

  useEffect(() => {
    if (!open || !basket) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setRows([]);
    setSnapshotDate(null);

    (async () => {
      try {
        const tickers = basket.tickers;
        if (tickers.length === 0) {
          if (!cancelled) {
            setRows([]);
            setLoading(false);
          }
          return;
        }

        const fetcher: MetricFetcher = (ticker, m) => fetchMetricSeries(ticker, m);

        const [metricSeriesEntries, closeSeriesEntries] = await Promise.all([
          Promise.all(
            tickers.map(async (ticker): Promise<[string, MetricSeriesPoint[]]> => {
              try {
                return [ticker, await fetcher(ticker, metric)];
              } catch {
                return [ticker, []];
              }
            }),
          ),
          Promise.all(
            tickers.map(async (ticker): Promise<[string, MetricSeriesPoint[]]> => {
              try {
                return [ticker, await fetcher(ticker, "close")];
              } catch {
                return [ticker, []];
              }
            }),
          ),
        ]);

        const closeSeriesByTicker: Record<string, MetricSeriesPoint[]> = {};
        const dateSet = new Set<string>();
        for (const [ticker, series] of closeSeriesEntries) {
          closeSeriesByTicker[ticker] = series;
          for (const point of series) dateSet.add(point.time);
        }

        const sortedDates = Array.from(dateSet).sort();
        const latestDate =
          sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;
        const requestedAsOf =
          asOfInput && asOfInput.trim().length === 10 ? asOfInput.trim() : null;

        // Resolve the effective snapshot date: latest entry ≤ the requested as-of date.
        let effectiveDate = latestDate;
        if (requestedAsOf) {
          let lo = 0;
          let hi = sortedDates.length - 1;
          let found = -1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (sortedDates[mid] <= requestedAsOf) {
              found = mid;
              lo = mid + 1;
            } else {
              hi = mid - 1;
            }
          }
          effectiveDate = found >= 0 ? sortedDates[found] : (sortedDates[0] ?? null);
        }

        // Trim close series to the snapshot date so weight schemes see the as-of state.
        const trimmedCloseByTicker: Record<string, MetricSeriesPoint[]> = {};
        for (const ticker of tickers) {
          const series = closeSeriesByTicker[ticker] || [];
          if (effectiveDate) {
            const trimmed: MetricSeriesPoint[] = [];
            for (const point of series) {
              if (point.time <= effectiveDate) trimmed.push(point);
              else break;
            }
            trimmedCloseByTicker[ticker] = trimmed;
          } else {
            trimmedCloseByTicker[ticker] = series;
          }
        }

        // Resolve each constituent's metric value as of the snapshot date.
        const valueByTicker: Record<string, { value: number; asOf: string | null }> =
          {};
        for (const [ticker, series] of metricSeriesEntries) {
          let resolved: { value: number; asOf: string | null } = {
            value: NaN,
            asOf: null,
          };
          for (let i = series.length - 1; i >= 0; i--) {
            if (
              !(effectiveDate && series[i].time > effectiveDate) &&
              Number.isFinite(series[i].value)
            ) {
              resolved = { value: series[i].value, asOf: series[i].time };
              break;
            }
          }
          valueByTicker[ticker] = resolved;
        }

        // Compute weights (and override with fmp historical caps at the snapshot date).
        let weights: Record<string, number>;
        const { weights: baseWeights } = await computeBasketWeights(
          basket,
          trimmedCloseByTicker,
          fetcher,
        );
        weights = baseWeights;

        const { weighting } = getBasketConfig(basket);
        if (
          weighting === "fmp_cap_daily" &&
          basket.fmpHistCapsSnapshot?.series &&
          effectiveDate
        ) {
          const capByTicker: Record<string, number> = {};
          let total = 0;
          for (const ticker of tickers) {
            const series =
              basket.fmpHistCapsSnapshot.series[ticker.toUpperCase()] || [];
            let cap = 0;
            for (let i = series.length - 1; i >= 0; i--) {
              if (series[i].date <= effectiveDate) {
                cap = series[i].marketCap;
                break;
              }
            }
            capByTicker[ticker] = cap > 0 ? cap : 0;
            total += capByTicker[ticker];
          }
          if (total > 0) {
            for (const ticker of tickers) capByTicker[ticker] /= total;
            weights = capByTicker;
          }
        }

        // Per-constituent value / weight / contribution.
        const present = tickers.filter((ticker) => {
          const value = valueByTicker[ticker]?.value;
          return !(
            !Number.isFinite(value) ||
            (aggregationKind === "harmonic" && value <= 0)
          );
        });
        const presentWeightSum = present.reduce(
          (acc, ticker) => acc + (weights[ticker] ?? 0),
          0,
        );

        const computedRows: ConstituentRow[] = tickers.map((ticker) => {
          const resolved = valueByTicker[ticker] ?? { value: NaN, asOf: null };
          const isPresent = present.includes(ticker);
          const rawWeight = weights[ticker] ?? 0;
          const normalizedWeight =
            isPresent && presentWeightSum > 0 ? rawWeight / presentWeightSum : 0;
          let contribution = 0;
          if (isPresent) {
            if (aggregationKind === "sum") {
              contribution = resolved.value;
            } else if (aggregationKind === "harmonic") {
              contribution = normalizedWeight * (1 / resolved.value);
            } else {
              contribution = normalizedWeight * resolved.value;
            }
          }
          return {
            ticker,
            value: resolved.value,
            asOf: resolved.asOf,
            weight: normalizedWeight,
            contribution,
          };
        });

        if (!cancelled) {
          setRows(computedRows);
          setSnapshotDate(effectiveDate);
          setAvailableDates(sortedDates);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, basket, metric, aggregationKind, asOfInput]);

  const aggregate = useMemo(() => {
    const present = rows.filter(
      (row) =>
        (Number.isFinite(row.value) && row.weight > 0) ||
        (aggregationKind === "sum" && Number.isFinite(row.value)),
    );
    const weightSum = present.reduce((acc, row) => acc + row.weight, 0);
    let value: number;
    if (aggregationKind === "sum") {
      value = present.reduce((acc, row) => acc + row.value, 0);
    } else if (aggregationKind === "harmonic") {
      const denom = present.reduce((acc, row) => acc + row.contribution, 0);
      value = denom > 0 ? 1 / denom : NaN;
    } else {
      value = present.reduce((acc, row) => acc + row.contribution, 0);
    }
    return { present, weightSum, aggregate: value };
  }, [rows, aggregationKind]);

  if (!basket) return null;

  const { weighting, rebalance } = getBasketConfig(basket);
  const missingDataCount = rows.filter((row) => !Number.isFinite(row.value)).length;
  const zeroWeightCount = rows.filter(
    (row) => Number.isFinite(row.value) && row.weight === 0,
  ).length;

  let formula: string;
  if (aggregationKind === "sum") {
    formula = "Σ value_i  (plain sum across constituents — no weighting)";
  } else if (aggregationKind === "harmonic") {
    formula =
      "1 / Σ (w_i × 1/value_i)  (cap-weighted harmonic mean — correct for ratio multiples)";
  } else {
    formula = "Σ (w_i × value_i)  (cap-weighted arithmetic mean)";
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[820px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <span className="font-mono text-amber-400">{basket.name}</span>
            <span className="text-muted-foreground text-xs font-normal">
              — metric inspector
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Metric
          </span>
          <Select value={metric} onValueChange={setMetric}>
            <SelectTrigger
              className="h-7 w-[200px] text-xs"
              data-testid="basket-math-metric"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {metricGroups.map(({ category, metrics }) => (
                <SelectGroup key={category}>
                  <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">{category}</SelectLabel>
                  {metrics.map((option) => (
                    <SelectItem key={option} value={option} className="text-xs">
                      {option}
                      {isHarmonicMetric(option) && (
                        <span className="ml-2 text-[9px] text-amber-400">harmonic</span>
                      )}
                      {isSumMetric(option) && (
                        <span className="ml-2 text-[9px] text-sky-400">sum</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground ml-2">
            As of
          </span>
          <Input
            type="date"
            value={asOfInput}
            min={availableDates[0]}
            max={availableDates[availableDates.length - 1]}
            onChange={(event) => setAsOfInput(event.target.value)}
            className="h-7 w-[145px] text-xs"
            placeholder="latest"
            data-testid="basket-math-asof"
          />
          {asOfInput && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={() => setAsOfInput("")}
              title="Reset to latest available date"
            >
              latest
            </Button>
          )}
          <div className="text-[10px] font-mono text-muted-foreground ml-auto">
            {weighting} weights · {rebalance} rebalance
            {snapshotDate && (
              <span>
                {" "}
                · snapshot {snapshotDate}
                {asOfInput && asOfInput !== snapshotDate && (
                  <span className="text-amber-400"> (≤ {asOfInput})</span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="text-[11px] bg-muted/40 border border-border rounded p-2 mb-3 leading-relaxed">
          <span className="font-mono uppercase tracking-wider text-[9px] text-muted-foreground">
            Aggregation
          </span>
          <span className="ml-2 font-mono text-amber-400 text-[11px]">
            {aggregationKind}
          </span>
          <div className="font-mono text-[10px] text-foreground mt-1">{formula}</div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
            <Loader2 className="w-3 h-3 animate-spin" />
            Computing…
          </div>
        )}

        {error && (
          <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded p-2">
            {error}
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <div className="overflow-x-auto border border-border rounded">
              <table className="w-full text-[11px] font-mono">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-1">Ticker</th>
                    <th className="text-right px-2 py-1">Value</th>
                    <th className="text-right px-2 py-1">As of</th>
                    <th className="text-right px-2 py-1">Weight</th>
                    <th className="text-right px-2 py-1">
                      {aggregationKind === "sum"
                        ? "Adds"
                        : aggregationKind === "harmonic"
                          ? "w·(1/value)"
                          : "w·value"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const noData = !Number.isFinite(row.value);
                    const zeroWeight =
                      !noData && row.weight === 0 && aggregationKind !== "sum";
                    const excluded = noData || zeroWeight;
                    return (
                      <tr
                        key={row.ticker}
                        className={`border-t border-border/50 ${excluded ? "opacity-40" : ""}`}
                        title={
                          noData
                            ? "No metric data"
                            : zeroWeight
                              ? "Zero/missing weight on this date — excluded"
                              : undefined
                        }
                      >
                        <td className="px-2 py-1 text-amber-300">{row.ticker}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {noData ? "—" : formatNumber(row.value)}
                        </td>
                        <td className="px-2 py-1 text-right text-muted-foreground text-[10px]">
                          {row.asOf ?? "—"}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {aggregationKind === "sum" || excluded
                            ? "—"
                            : formatPercent(row.weight)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-foreground">
                          {excluded ? "—" : formatNumber(row.contribution, 6)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/60 border-t-2 border-border">
                  <tr>
                    <td
                      className="px-2 py-1 font-medium text-muted-foreground"
                      colSpan={3}
                    >
                      {aggregationKind === "sum"
                        ? `Sum across ${aggregate.present.length} constituent(s)`
                        : `Σ over ${aggregate.present.length} present constituent(s)`}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {aggregationKind === "sum"
                        ? "—"
                        : formatPercent(aggregate.weightSum)}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {aggregationKind === "sum"
                        ? formatNumber(aggregate.aggregate)
                        : formatNumber(
                            aggregationKind === "harmonic"
                              ? aggregate.present.reduce(
                                  (acc, row) => acc + row.contribution,
                                  0,
                                )
                              : aggregate.aggregate,
                            6,
                          )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-3 p-2 rounded bg-muted/40 border border-border">
              <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Aggregate
              </div>
              {aggregationKind === "sum" && (
                <div className="font-mono text-xs">
                  <span className="text-muted-foreground">sum =</span>{" "}
                  <span className="text-foreground">
                    {formatNumber(aggregate.aggregate)}
                  </span>
                </div>
              )}
              {aggregationKind === "harmonic" && (
                <div className="font-mono text-xs">
                  <span className="text-muted-foreground">denom Σ w·(1/value) =</span>{" "}
                  {formatNumber(
                    aggregate.present.reduce((acc, row) => acc + row.contribution, 0),
                    6,
                  )}
                  <span className="text-muted-foreground mx-1">→</span>
                  <span className="text-muted-foreground">
                    aggregate = 1 / denom =
                  </span>{" "}
                  <span className="text-amber-400 font-medium">
                    {formatNumber(aggregate.aggregate)}
                  </span>
                </div>
              )}
              {aggregationKind === "arithmetic" && (
                <div className="font-mono text-xs">
                  <span className="text-muted-foreground">Σ w·value =</span>{" "}
                  <span className="text-amber-400 font-medium">
                    {formatNumber(aggregate.aggregate)}
                  </span>
                </div>
              )}
            </div>

            {(missingDataCount > 0 || zeroWeightCount > 0) && (
              <div className="mt-2 text-[10px] font-mono text-muted-foreground space-y-0.5">
                {missingDataCount > 0 && (
                  <div>
                    <span className="text-amber-400">{missingDataCount}</span>
                    {" constituent(s) missing data for this metric — excluded."}
                  </div>
                )}
                {zeroWeightCount > 0 && (
                  <div>
                    <span className="text-amber-400">{zeroWeightCount}</span>
                    {" constituent(s) had zero weight on the snapshot date — excluded."}
                  </div>
                )}
              </div>
            )}

            <div className="mt-2 text-[10px] font-mono text-muted-foreground leading-relaxed">
              Snapshot logic: weights and per-constituent values are resolved to the
              latest entry ≤ the chosen as-of date. For{" "}
              <span className="font-mono">fmp_cap_daily</span>{" "}
              this reads the historical MC snapshot at that date; for static schemes
              (cap, yahoo_cap, price, custom, equal) the weighting is identical to what
              the basket would use if rebalanced on that date. The aggregation formula
              matches the rest of the app exactly.
            </div>
          </>
        )}

        {!loading && !error && rows.length === 0 && basket.tickers.length > 0 && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            No data returned for this metric.
          </div>
        )}

        {!loading && !error && basket.tickers.length === 0 && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Basket has no constituents.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default BasketMetricInspector;
