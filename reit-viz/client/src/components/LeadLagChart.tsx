/**
 * LeadLagChart — interactive cross-correlation (r vs lag) sub-chart.
 *
 * Extracted from the former Quick Analyze rolling-correlation view so it can be
 * reused by the Pairs & Formula correlation lead-lag tools. Click to pin a lag.
 */
import { useState, useMemo, useCallback, useRef } from "react";
import type { LagRow } from "@/lib/leadLag";

interface LeadLagChartProps {
  data: LagRow[];
  lagBars: number;
  lagMax: number;
  onLagChange?: (lag: number) => void;
  height?: number;
  width?: number;
  title?: string;
}

export default function LeadLagChart({
  data,
  lagBars,
  lagMax,
  onLagChange,
  height = 200,
  width = 640,
  title = "Cross-correlation r vs lag",
}: LeadLagChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredLag, setHoveredLag] = useState<number | null>(null);

  const marginLeft = 36;
  const marginRight = 12;
  const marginTop = 14;
  const marginBottom = 22;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;

  const { rMin, rMax, bestRow, ciHigh, ciLow } = useMemo(() => {
    const finiteR = data.map((row) => row.r).filter(Number.isFinite);
    const rLow = finiteR.length ? Math.min(-1, Math.min(...finiteR)) : -1;
    const rHigh = finiteR.length ? Math.max(1, Math.max(...finiteR)) : 1;
    let best: LagRow = { k: 0, r: 0, n: 0 };
    for (const row of data) {
      if (Number.isFinite(row.r) && Math.abs(row.r) > Math.abs(best.r)) {
        best = row;
      }
    }
    const ns = data
      .map((row) => row.n)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    const medianN = ns.length ? ns[Math.floor(ns.length / 2)] : 0;
    const ci = medianN > 0 ? 1.96 / Math.sqrt(medianN) : 0;
    return { rMin: rLow, rMax: rHigh, bestRow: best, ciHigh: ci, ciLow: -ci };
  }, [data]);

  const xScale = useCallback(
    (k: number) => marginLeft + ((k + lagMax) / (2 * lagMax || 1)) * plotW,
    [marginLeft, lagMax, plotW],
  );
  const yScale = useCallback(
    (r: number) => marginTop + (1 - (r - rMin) / (rMax - rMin || 1)) * plotH,
    [marginTop, rMin, rMax, plotH],
  );

  const linePath = useMemo(
    () =>
      data
        .map(
          (row, i) =>
            `${i === 0 ? "M" : "L"}${xScale(row.k).toFixed(1)},${yScale(
              Number.isFinite(row.r) ? row.r : 0,
            ).toFixed(1)}`,
        )
        .join(" "),
    [data, xScale, yScale],
  );

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let r = Math.ceil(rMin * 10) / 10; r <= rMax + 1e-9; r += 0.2) {
      ticks.push(Math.round(r * 100) / 100);
    }
    return ticks;
  }, [rMin, rMax]);

  const xTicks = useMemo(() => {
    const step = Math.max(1, Math.round((lagMax * 2) / 6));
    const ticks: number[] = [];
    for (let k = -lagMax; k <= lagMax; k += step) ticks.push(k);
    if (ticks[ticks.length - 1] !== lagMax) ticks.push(lagMax);
    return ticks;
  }, [lagMax]);

  const lagFromClientX = useCallback(
    (clientX: number): number | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scaleX = width / rect.width;
      const rel = ((clientX - rect.left) * scaleX - marginLeft) / plotW;
      if (!Number.isFinite(rel)) return null;
      const clamped = Math.max(0, Math.min(1, rel));
      const k = Math.round(clamped * 2 * lagMax - lagMax);
      return Math.max(-lagMax, Math.min(lagMax, k));
    },
    [width, marginLeft, plotW, lagMax],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      setHoveredLag(lagFromClientX(event.clientX));
    },
    [lagFromClientX],
  );
  const handleMouseLeave = useCallback(() => setHoveredLag(null), []);
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!onLagChange) return;
      const k = lagFromClientX(event.clientX);
      if (k != null) onLagChange(k);
    },
    [lagFromClientX, onLagChange],
  );

  const hoveredRow =
    hoveredLag != null ? data.find((row) => row.k === hoveredLag) : null;

  if (data.length === 0) return null;

  return (
    <div className="mt-2 border border-border rounded p-2 bg-background">
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-muted-foreground">{title}</span>
        <span className="font-mono text-foreground">
          best: lag {bestRow.k >= 0 ? "+" : ""}
          {bestRow.k}, r={bestRow.r.toFixed(3)}
          {onLagChange && (
            <span className="text-muted-foreground ml-1.5">(click to pin lag)</span>
          )}
        </span>
      </div>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{ cursor: onLagChange ? "crosshair" : "default" }}
      >
        {ciHigh > 0 && (
          <rect
            x={marginLeft}
            y={yScale(ciHigh)}
            width={plotW}
            height={Math.max(0, yScale(ciLow) - yScale(ciHigh))}
            fill="#64748b"
            fillOpacity={0.12}
          />
        )}
        {yTicks.map((r) => (
          <g key={`y${r}`}>
            <line
              x1={marginLeft}
              y1={yScale(r)}
              x2={marginLeft + plotW}
              y2={yScale(r)}
              stroke="#334155"
              strokeWidth="0.4"
              strokeDasharray={r === 0 ? "" : "2 3"}
              opacity={r === 0 ? 0.8 : 0.4}
            />
            <text
              x={marginLeft - 4}
              y={yScale(r) + 3}
              fontSize="9"
              fill="#94a3b8"
              textAnchor="end"
              fontFamily="ui-monospace, monospace"
            >
              {r.toFixed(1)}
            </text>
          </g>
        ))}
        {xTicks.map((k) => (
          <g key={`x${k}`}>
            <line
              x1={xScale(k)}
              y1={marginTop + plotH}
              x2={xScale(k)}
              y2={marginTop + plotH + 3}
              stroke="#64748b"
              strokeWidth="0.5"
            />
            <text
              x={xScale(k)}
              y={marginTop + plotH + 14}
              fontSize="9"
              fill="#94a3b8"
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
            >
              {k >= 0 ? `+${k}` : k}
            </text>
          </g>
        ))}
        <line
          x1={xScale(0)}
          y1={marginTop}
          x2={xScale(0)}
          y2={marginTop + plotH}
          stroke="#94a3b8"
          strokeWidth="0.5"
          strokeDasharray="3 3"
        />
        <line
          x1={xScale(lagBars)}
          y1={marginTop}
          x2={xScale(lagBars)}
          y2={marginTop + plotH}
          stroke="#fbbf24"
          strokeWidth="1.25"
        />
        <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth="1.5" />
        {Number.isFinite(bestRow.r) && (
          <circle
            cx={xScale(bestRow.k)}
            cy={yScale(bestRow.r)}
            r="3"
            fill="#f59e0b"
            stroke="#fff"
            strokeWidth="0.5"
          />
        )}
        {hoveredRow && Number.isFinite(hoveredRow.r) && (
          <>
            <line
              x1={marginLeft}
              y1={yScale(hoveredRow.r)}
              x2={marginLeft + plotW}
              y2={yScale(hoveredRow.r)}
              stroke="#22d3ee"
              strokeWidth="1"
              opacity={0.85}
            />
            <g>
              <rect
                x={2}
                y={yScale(hoveredRow.r) - 7}
                width={marginLeft - 6}
                height={13}
                rx={2}
                fill="#0f172a"
                stroke="#22d3ee"
                strokeWidth="0.6"
              />
              <text
                x={marginLeft - 4}
                y={yScale(hoveredRow.r) + 3}
                fontSize="9.5"
                fill="#22d3ee"
                textAnchor="end"
                fontFamily="ui-monospace, monospace"
              >
                {hoveredRow.r.toFixed(3)}
              </text>
            </g>
            <line
              x1={xScale(hoveredRow.k)}
              y1={marginTop}
              x2={xScale(hoveredRow.k)}
              y2={marginTop + plotH}
              stroke="#22d3ee"
              strokeWidth="1"
              opacity={0.85}
            />
            <g>
              <rect
                x={xScale(hoveredRow.k) - 16}
                y={marginTop + plotH + 2}
                width={32}
                height={13}
                rx={2}
                fill="#0f172a"
                stroke="#22d3ee"
                strokeWidth="0.6"
              />
              <text
                x={xScale(hoveredRow.k)}
                y={marginTop + plotH + 12}
                fontSize="9.5"
                fill="#22d3ee"
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
              >
                {hoveredRow.k >= 0 ? `+${hoveredRow.k}` : hoveredRow.k}
              </text>
            </g>
            <circle
              cx={xScale(hoveredRow.k)}
              cy={yScale(hoveredRow.r)}
              r="3.5"
              fill="#22d3ee"
              stroke="#0f172a"
              strokeWidth="1"
            />
            {(() => {
              const px = xScale(hoveredRow.k);
              const py = yScale(hoveredRow.r);
              const boxW = 92;
              const boxH = 32;
              const boxX =
                px + boxW + 6 > marginLeft + plotW ? px - boxW - 6 : px + 6;
              const boxY = Math.max(
                marginTop,
                Math.min(marginTop + plotH - boxH, py - boxH / 2),
              );
              return (
                <g>
                  <rect
                    x={boxX}
                    y={boxY}
                    width={boxW}
                    height={boxH}
                    rx={3}
                    fill="#0f172a"
                    stroke="#334155"
                    strokeWidth="0.5"
                  />
                  <text
                    x={boxX + 5}
                    y={boxY + 12}
                    fontSize="9.5"
                    fill="#e2e8f0"
                    fontFamily="ui-monospace, monospace"
                  >
                    lag: {hoveredRow.k >= 0 ? "+" : ""}
                    {hoveredRow.k}
                  </text>
                  <text
                    x={boxX + 5}
                    y={boxY + 24}
                    fontSize="9.5"
                    fontFamily="ui-monospace, monospace"
                    fill={hoveredRow.r >= 0 ? "#34d399" : "#fb7185"}
                  >
                    r={hoveredRow.r.toFixed(3)} · n={hoveredRow.n}
                  </text>
                </g>
              );
            })()}
          </>
        )}
        <text
          x={marginLeft + plotW / 2}
          y={height - 3}
          fontSize="9"
          fill="#64748b"
          textAnchor="middle"
        >
          Lag (bars) — A shifted; r&gt;0 at +k ⇒ A leads B
        </text>
      </svg>
      <div className="text-[9px] text-muted-foreground mt-1 leading-tight">
        Shaded band: 95% CI under H₀ (±1.96/√n). Yellow line = current lag; orange
        dot = best |r|.
      </div>
    </div>
  );
}
