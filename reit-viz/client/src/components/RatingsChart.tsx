/**
 * RatingsChart — stacked bar chart showing Buy / Hold / Sell ratings over time
 * with optional Bull% / Bear% overlay lines.
 * Uses Recharts (already installed) for proper stacked bars.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMetricSeries } from "@/lib/dataService";
import { Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Legend,
  ReferenceLine,
} from "recharts";

interface RatingsChartProps {
  ticker: string;
}

interface ChartRow {
  date: string;        // display label (e.g. "Q1 2024" or "2024-03")
  sortKey: string;     // for sorting
  buy: number;
  hold: number;
  sell: number;
  buyPct: number;
  holdPct: number;
  sellPct: number;
  bull: number | null;
  bear: number | null;
  total: number;
}

export default function RatingsChart({ ticker }: RatingsChartProps) {
  const [viewMode, setViewMode] = useState<"pct" | "counts">("pct");

  const { data, isLoading } = useQuery({
    queryKey: ["ratings-chart", ticker],
    queryFn: async () => {
      const [buy, hold, sell, bull, bear] = await Promise.all([
        getMetricSeries(ticker, "Buy Ratings"),
        getMetricSeries(ticker, "Hold Ratings"),
        getMetricSeries(ticker, "Sell Ratings"),
        getMetricSeries(ticker, "Bull%"),
        getMetricSeries(ticker, "Bear%"),
      ]);
      return { buy, hold, sell, bull, bear };
    },
    staleTime: 5 * 60_000,
  });

  const chartData: ChartRow[] = useMemo(() => {
    if (!data) return [];

    // Build maps keyed by date string
    const buyMap = new Map(data.buy.map((d) => [d.time, d.value]));
    const holdMap = new Map(data.hold.map((d) => [d.time, d.value]));
    const sellMap = new Map(data.sell.map((d) => [d.time, d.value]));
    const bullMap = new Map(data.bull.map((d) => [d.time, d.value]));
    const bearMap = new Map(data.bear.map((d) => [d.time, d.value]));

    // Collect all unique dates from buy/hold/sell
    const allTimes = new Set([
      ...data.buy.map((d) => d.time),
      ...data.hold.map((d) => d.time),
      ...data.sell.map((d) => d.time),
    ]);
    const sortedTimes = [...allTimes].sort();

    // Group by quarter
    const quarterMap = new Map<string, { buys: number[]; holds: number[]; sells: number[]; bulls: number[]; bears: number[]; }>();

    for (const t of sortedTimes) {
      const b = buyMap.get(t) ?? 0;
      const h = holdMap.get(t) ?? 0;
      const s = sellMap.get(t) ?? 0;
      const total = b + h + s;
      if (total <= 0) continue;

      // Parse date to get quarter
      const [year, month] = t.split("-").map(Number);
      const q = Math.ceil(month / 3);
      const qKey = `${year}-Q${q}`;

      if (!quarterMap.has(qKey)) {
        quarterMap.set(qKey, { buys: [], holds: [], sells: [], bulls: [], bears: [] });
      }
      const bucket = quarterMap.get(qKey)!;
      bucket.buys.push(b);
      bucket.holds.push(h);
      bucket.sells.push(s);

      const bullVal = bullMap.get(t);
      const bearVal = bearMap.get(t);
      if (bullVal != null) bucket.bulls.push(bullVal);
      if (bearVal != null) bucket.bears.push(bearVal);
    }

    // If we have fewer than 12 quarters, use monthly granularity instead
    const useMonthly = quarterMap.size <= 12;

    if (useMonthly) {
      // Regroup by month
      const monthMap = new Map<string, { buys: number[]; holds: number[]; sells: number[]; bulls: number[]; bears: number[]; }>();

      for (const t of sortedTimes) {
        const b = buyMap.get(t) ?? 0;
        const h = holdMap.get(t) ?? 0;
        const s = sellMap.get(t) ?? 0;
        const total = b + h + s;
        if (total <= 0) continue;

        const mKey = t.substring(0, 7); // "YYYY-MM"
        if (!monthMap.has(mKey)) {
          monthMap.set(mKey, { buys: [], holds: [], sells: [], bulls: [], bears: [] });
        }
        const bucket = monthMap.get(mKey)!;
        bucket.buys.push(b);
        bucket.holds.push(h);
        bucket.sells.push(s);

        const bullVal = bullMap.get(t);
        const bearVal = bearMap.get(t);
        if (bullVal != null) bucket.bulls.push(bullVal);
        if (bearVal != null) bucket.bears.push(bearVal);
      }

      const rows: ChartRow[] = [];
      for (const [mKey, bucket] of monthMap) {
        const avgBuy = bucket.buys.reduce((a, b) => a + b, 0) / bucket.buys.length;
        const avgHold = bucket.holds.reduce((a, b) => a + b, 0) / bucket.holds.length;
        const avgSell = bucket.sells.reduce((a, b) => a + b, 0) / bucket.sells.length;
        const total = avgBuy + avgHold + avgSell;
        if (total <= 0) continue;

        const [y, m] = mKey.split("-");
        const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const label = `${monthNames[parseInt(m) - 1]} ${y.slice(2)}`;

        rows.push({
          date: label,
          sortKey: mKey,
          buy: Math.round(avgBuy),
          hold: Math.round(avgHold),
          sell: Math.round(avgSell),
          buyPct: (avgBuy / total) * 100,
          holdPct: (avgHold / total) * 100,
          sellPct: (avgSell / total) * 100,
          bull: bucket.bulls.length > 0
            ? (bucket.bulls.reduce((a, b) => a + b, 0) / bucket.bulls.length) * 100
            : null,
          bear: bucket.bears.length > 0
            ? (bucket.bears.reduce((a, b) => a + b, 0) / bucket.bears.length) * 100
            : null,
          total: Math.round(total),
        });
      }
      return rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    }

    // Quarterly rows
    const rows: ChartRow[] = [];
    for (const [qKey, bucket] of quarterMap) {
      const avgBuy = bucket.buys.reduce((a, b) => a + b, 0) / bucket.buys.length;
      const avgHold = bucket.holds.reduce((a, b) => a + b, 0) / bucket.holds.length;
      const avgSell = bucket.sells.reduce((a, b) => a + b, 0) / bucket.sells.length;
      const total = avgBuy + avgHold + avgSell;
      if (total <= 0) continue;

      const [year, qPart] = qKey.split("-");
      const label = `${qPart} '${year.slice(2)}`;

      rows.push({
        date: label,
        sortKey: qKey,
        buy: Math.round(avgBuy),
        hold: Math.round(avgHold),
        sell: Math.round(avgSell),
        buyPct: (avgBuy / total) * 100,
        holdPct: (avgHold / total) * 100,
        sellPct: (avgSell / total) * 100,
        bull: bucket.bulls.length > 0
          ? (bucket.bulls.reduce((a, b) => a + b, 0) / bucket.bulls.length) * 100
          : null,
        bear: bucket.bears.length > 0
          ? (bucket.bears.reduce((a, b) => a + b, 0) / bucket.bears.length) * 100
          : null,
        total: Math.round(total),
      });
    }
    return rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [data]);

  const hasBullBear = useMemo(
    () => chartData.some((r) => r.bull != null || r.bear != null),
    [chartData]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading historical ratings for {ticker}...
      </div>
    );
  }

  if (!data || chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60px] text-muted-foreground text-xs">
        No historical ratings data for {ticker}
      </div>
    );
  }

  const isPct = viewMode === "pct";

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload as ChartRow | undefined;
    if (!row) return null;

    return (
      <div className="bg-card border border-border rounded px-3 py-2 shadow-lg text-xs">
        <div className="font-semibold text-foreground mb-1.5">{label}</div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />
            <span className="text-muted-foreground">Buy:</span>
            <span className="font-mono text-emerald-400">
              {isPct ? `${row.buyPct.toFixed(1)}%` : row.buy}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-zinc-500 inline-block" />
            <span className="text-muted-foreground">Hold:</span>
            <span className="font-mono text-zinc-300">
              {isPct ? `${row.holdPct.toFixed(1)}%` : row.hold}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />
            <span className="text-muted-foreground">Sell:</span>
            <span className="font-mono text-red-400">
              {isPct ? `${row.sellPct.toFixed(1)}%` : row.sell}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="w-2 h-2 inline-block" />
            <span>Total:</span>
            <span className="font-mono">{row.total}</span>
          </div>
          {row.bull != null && (
            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-border/50">
              <span className="w-2 h-0.5 bg-green-400 inline-block" />
              <span className="text-muted-foreground">Bull%:</span>
              <span className="font-mono text-green-400">{row.bull.toFixed(1)}%</span>
            </div>
          )}
          {row.bear != null && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-0.5 bg-red-400 inline-block" />
              <span className="text-muted-foreground">Bear%:</span>
              <span className="font-mono text-red-400">{row.bear.toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Determine tick interval based on data density
  const tickInterval = chartData.length > 40 ? 3 : chartData.length > 20 ? 1 : 0;

  return (
    <div className="px-4 py-2 bg-muted/20">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-semibold text-foreground">
          {ticker} — Ratings Over Time
        </span>
        <div className="flex gap-px ml-2">
          {(["pct", "counts"] as const).map((m) => (
            <button
              key={m}
              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${
                viewMode === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/80 text-muted-foreground/60 hover:text-muted-foreground"
              }`}
              onClick={(e) => { e.stopPropagation(); setViewMode(m); }}
              data-testid={`ratings-chart-toggle-${m}`}
            >
              {m === "pct" ? "%" : "#"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 ml-auto text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
            Buy
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-zinc-500 inline-block" />
            Hold
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />
            Sell
          </span>
          {hasBullBear && (
            <>
              <span className="h-3 w-px bg-border" />
              <span className="flex items-center gap-1">
                <span className="w-3 h-px bg-green-400 inline-block" style={{ borderTop: "2px dashed" }} />
                Bull%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-px bg-red-400 inline-block" style={{ borderTop: "2px dashed" }} />
                Bear%
              </span>
            </>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart
          data={chartData}
          margin={{ top: 4, right: hasBullBear ? 40 : 8, bottom: 0, left: 0 }}
          barCategoryGap="8%"
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            interval={tickInterval}
            angle={chartData.length > 30 ? -45 : 0}
            textAnchor={chartData.length > 30 ? "end" : "middle"}
            height={chartData.length > 30 ? 40 : 24}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
            tickLine={false}
            axisLine={false}
            domain={isPct ? [0, 100] : ["auto", "auto"]}
            tickFormatter={(v: number) => isPct ? `${v}%` : `${v}`}
            width={36}
          />
          {hasBullBear && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.3)" }}
              tickLine={false}
              axisLine={false}
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              width={36}
            />
          )}
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
          />
          {/* Stacked bars */}
          <Bar
            yAxisId="left"
            dataKey={isPct ? "buyPct" : "buy"}
            stackId="ratings"
            fill="#10b981"
            radius={[0, 0, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            yAxisId="left"
            dataKey={isPct ? "holdPct" : "hold"}
            stackId="ratings"
            fill="#71717a"
            radius={[0, 0, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            yAxisId="left"
            dataKey={isPct ? "sellPct" : "sell"}
            stackId="ratings"
            fill="#ef4444"
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
          {/* Bull% / Bear% overlay lines */}
          {hasBullBear && (
            <>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="bull"
                stroke="#4ade80"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="bear"
                stroke="#f87171"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
