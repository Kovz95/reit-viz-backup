// Reconstructed from recovered-bundle/PriceAction-B0Lxdv32.js on 2026-06-12
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { createLucideIcon } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid
} from "recharts";
import { getTickers } from "@/lib/dataService";
import { getDates } from "@/lib/dataService";
import { useUniverse } from "@/lib/universeContext";
import { useBaskets } from "@/lib/basketContext";
import { isBasketTicker } from "@/lib/basketUtils";
import { getTickerRaw } from "@/lib/dataService";
import { emitChartSignals } from "@/lib/chartBridge";
import { navigateToTicker } from "@/lib/navigateToTicker";
import { BasketTickerPill } from "@/components/BasketTickerPill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Card, CardContent, CardHeader, CardTitle
} from "@/components/ui/card";
import { ChevronRight, ChevronDown, Play, Download, Plus, X, Minus, Activity } from "lucide-react";

// Inline icon creation (from bundle)
const UserIcon = createLucideIcon("User", [
  ["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", key: "975kel" }],
  ["circle", { cx: "12", cy: "7", r: "4", key: "17ys0d" }],
]);
const UsersIcon = createLucideIcon("Users", [
  ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", key: "1yyitq" }],
  ["circle", { cx: "9", cy: "7", r: "4", key: "nufk8" }],
  ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87", key: "kshegd" }],
  ["path", { d: "M16 3.13a4 4 0 0 1 0 7.75", key: "1da9ce" }],
]);

// ── Constants ──────────────────────────────────────────────────────────────────
const HORIZONS = [1, 5, 20, 60];
const CHAT_EVENT_PREFIX = "reit-viz:chat:";

// ── Types ──────────────────────────────────────────────────────────────────────
type ConditionType = "sigma" | "high52" | "low52" | "gap";
type SigmaDirection = "either" | "up" | "down";
type SigmaBasis = "rolling" | "full";
type GapDirection = "either" | "up" | "down";

interface Condition {
  id: string;
  type: ConditionType;
  sigma: number;
  sigmaWindow: number;
  sigmaDirection: SigmaDirection;
  sigmaBasis: SigmaBasis;
  gapPct: number;
  gapDirection: GapDirection;
}

interface HorizonStats {
  horizon: number;
  count: number;
  mean: number;
  median: number;
  std: number;
  pUp: number;
  winLoss: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
}

interface EventEntry {
  dateIdx: number;
  date: string;
  triggerValue: number;
  fwd: Record<number, number | null>;
}

interface StudyResult {
  events: EventEntry[];
  stats: HorizonStats[];
  distribution: Record<number, number[]>;
  avgPath: Array<{ day: number; cumret: number; n: number }>;
  baseline: HorizonStats[];
}

interface CrossTickerResult {
  ticker: string;
  name: string;
  events: number;
  stats: HorizonStats[];
  baseline: HorizonStats[];
  eventRows: EventEntry[];
}

interface RunConfig {
  mode: "single" | "cross" | "pairs";
  symbol: string;
  symbolB?: string;
  tickers: Array<{ ticker: string; name: string }>;
  conditions: Condition[];
  combinator: "AND" | "OR";
  nonce: number;
}

// ── Math helpers ───────────────────────────────────────────────────────────────
function mean(arr: number[]): number {
  if (!arr.length) return NaN;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function stdDev(arr: number[], mu?: number): number {
  if (arr.length < 2) return NaN;
  const m = mu ?? mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) * (v - m);
  return Math.sqrt(s / (arr.length - 1));
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const c = (sorted.length - 1) * p;
  const lo = Math.floor(c), hi = Math.ceil(c);
  return lo === hi ? sorted[lo] : sorted[lo] + (c - lo) * (sorted[hi] - sorted[lo]);
}

function computeConditionMask(
  cond: Condition,
  closes: (number | null)[],
  opens: (number | null)[]
): { mask: boolean[]; value: (number | null)[] } {
  const n = closes.length;
  const mask = new Array(n).fill(false);
  const value = new Array(n).fill(null);

  if (cond.type === "sigma") {
    const dailyRets: (number | null)[] = new Array(n).fill(null);
    for (let i = 1; i < n; i++) {
      const p = closes[i - 1], c = closes[i];
      if (p != null && c != null && p > 0) dailyRets[i] = (c / p - 1) * 100;
    }
    if (cond.sigmaBasis === "full") {
      const finite = dailyRets.filter((v): v is number => v != null && Number.isFinite(v));
      if (finite.length < 30) return { mask, value };
      const mu = mean(finite), sigma = stdDev(finite, mu);
      if (!Number.isFinite(sigma) || sigma <= 0) return { mask, value };
      for (let i = 1; i < n; i++) {
        const v = dailyRets[i];
        if (v == null) continue;
        const z = (v - mu) / sigma;
        const absZ = Math.abs(z);
        let fire = false;
        if (cond.sigmaDirection === "either") fire = absZ >= cond.sigma;
        else if (cond.sigmaDirection === "up") fire = z >= cond.sigma;
        else fire = z <= -cond.sigma;
        if (fire) { mask[i] = true; value[i] = v; }
      }
    } else {
      const w = Math.max(10, Math.floor(cond.sigmaWindow));
      for (let i = w + 1; i < n; i++) {
        const slice: number[] = [];
        for (let j = i - w; j < i; j++) {
          const v = dailyRets[j];
          if (v != null && Number.isFinite(v)) slice.push(v);
        }
        if (slice.length < Math.floor(w * 0.6)) continue;
        const mu = mean(slice), sigma = stdDev(slice, mu);
        if (!Number.isFinite(sigma) || sigma <= 0) continue;
        const v = dailyRets[i];
        if (v == null) continue;
        const z = (v - mu) / sigma;
        const absZ = Math.abs(z);
        let fire = false;
        if (cond.sigmaDirection === "either") fire = absZ >= cond.sigma;
        else if (cond.sigmaDirection === "up") fire = z >= cond.sigma;
        else fire = z <= -cond.sigma;
        if (fire) { mask[i] = true; value[i] = v; }
      }
    }
  } else if (cond.type === "high52" || cond.type === "low52") {
    for (let i = 252; i < n; i++) {
      const v = closes[i];
      if (v == null) continue;
      let extreme = cond.type === "high52" ? -Infinity : Infinity;
      let cnt = 0;
      for (let j = i - 252; j < i; j++) {
        const x = closes[j];
        if (x != null) {
          cnt++;
          if (cond.type === "high52" ? x > extreme : x < extreme) extreme = x;
        }
      }
      if (cnt < Math.floor(252 * 0.6)) continue;
      if (cond.type === "high52" ? v > extreme : v < extreme) { mask[i] = true; value[i] = v; }
    }
  } else if (cond.type === "gap") {
    for (let i = 1; i < n; i++) {
      const prev = closes[i - 1], openVal = opens[i];
      if (prev == null || openVal == null || prev <= 0) continue;
      const gap = (openVal / prev - 1) * 100;
      const absGap = Math.abs(gap);
      let fire = false;
      if (cond.gapDirection === "either") fire = absGap >= cond.gapPct;
      else if (cond.gapDirection === "up") fire = gap >= cond.gapPct;
      else fire = gap <= -cond.gapPct;
      if (fire) { mask[i] = true; value[i] = gap; }
    }
  }
  return { mask, value };
}

function computeEventStudy(params: {
  close: (number | null)[];
  open: (number | null)[];
  dates: string[];
  conditions: Condition[];
  combinator: "AND" | "OR";
}): StudyResult {
  const { close, open, dates, conditions, combinator } = params;
  const n = close.length;
  const validConds = conditions.filter(Boolean);
  if (validConds.length === 0) return emptyResult();

  const masks = validConds.map(c => computeConditionMask(c, close, open));
  const warmup = Math.max(...validConds.map(c =>
    c.type === "sigma" ? (c.sigmaBasis === "full" ? 30 : c.sigmaWindow + 2)
    : (c.type === "high52" || c.type === "low52") ? 253
    : c.type === "gap" ? 2 : 0
  ));
  const hits: Array<{ idx: number; val: number }> = [];
  for (let i = warmup; i < n; i++) {
    let fire = combinator === "AND";
    let val: number | null = null;
    for (let k = 0; k < masks.length; k++) {
      const m = masks[k].mask[i];
      if (combinator === "AND") {
        if (!m) { fire = false; break; }
        if (val == null) val = masks[k].value[i];
      } else if (m) {
        fire = true; val = masks[k].value[i]; break;
      }
    }
    if (fire && val != null) hits.push({ idx: i, val });
  }

  const events: EventEntry[] = [];
  const dist: Record<number, number[]> = { 1: [], 5: [], 20: [], 60: [] };
  for (const { idx, val } of hits) {
    const price = close[idx];
    if (price == null || price <= 0) continue;
    const fwd: Record<number, number | null> = {};
    for (const h of HORIZONS) {
      const fi = idx + h;
      if (fi < n) {
        const fv = close[fi];
        if (fv != null) { const r = (fv / price - 1) * 100; fwd[h] = r; dist[h].push(r); continue; }
      }
      fwd[h] = null;
    }
    events.push({ dateIdx: idx, date: dates[idx] ?? "", triggerValue: val, fwd });
  }

  const stats = HORIZONS.map(h => computeHorizonStats(dist[h], h));
  const baselineDist: Record<number, number[]> = { 1: [], 5: [], 20: [], 60: [] };
  for (let i = 0; i + Math.max(...HORIZONS) < n; i++) {
    const p = close[i]; if (!p || p <= 0) continue;
    for (const h of HORIZONS) {
      const fi = i + h;
      if (fi < n) { const fv = close[fi]; if (fv != null) baselineDist[h].push((fv / p - 1) * 100); }
    }
  }
  const baseline = HORIZONS.map(h => computeHorizonStats(baselineDist[h], h));
  const maxH = HORIZONS[HORIZONS.length - 1];
  const avgPath: Array<{ day: number; cumret: number; n: number }> = [];
  for (let d = 0; d <= maxH; d++) {
    let sum = 0, cnt = 0;
    for (const ev of events) {
      const p = close[ev.dateIdx]; if (!p || p <= 0) continue;
      const fi = ev.dateIdx + d; if (fi >= n) continue;
      const fv = close[fi]; if (fv != null) { sum += (fv / p - 1) * 100; cnt++; }
    }
    avgPath.push({ day: d, cumret: cnt > 0 ? sum / cnt : 0, n: cnt });
  }
  return { events, stats, distribution: dist, avgPath, baseline };
}

function computeHorizonStats(arr: number[], horizon: number): HorizonStats {
  if (!arr.length) return { horizon, count: 0, mean: NaN, median: NaN, std: NaN, pUp: NaN, winLoss: NaN, min: NaN, max: NaN, p25: NaN, p75: NaN };
  const sorted = arr.slice().sort((a, b) => a - b);
  const wins = arr.filter(v => v > 0), losses = arr.filter(v => v < 0);
  const avgWin = wins.length ? mean(wins) : 0;
  const avgLoss = losses.length ? mean(losses) : 0;
  return {
    horizon, count: arr.length, mean: mean(arr), median: percentile(sorted, 0.5),
    std: stdDev(arr), pUp: wins.length / arr.length,
    winLoss: avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : NaN,
    min: sorted[0], max: sorted[sorted.length - 1],
    p25: percentile(sorted, 0.25), p75: percentile(sorted, 0.75),
  };
}

function emptyResult(): StudyResult {
  const empty: HorizonStats = { horizon: 1, count: 0, mean: NaN, median: NaN, std: NaN, pUp: NaN, winLoss: NaN, min: NaN, max: NaN, p25: NaN, p75: NaN };
  return { events: [], stats: HORIZONS.map(h => ({ ...empty, horizon: h })), distribution: { 1: [], 5: [], 20: [], 60: [] }, avgPath: [], baseline: HORIZONS.map(h => ({ ...empty, horizon: h })) };
}

function buildHistogram(arr: number[], nbins = 24): Array<{ bucket: string; lo: number; hi: number; count: number }> {
  if (!arr.length) return [];
  const sorted = arr.slice().sort((a, b) => a - b);
  const lo = percentile(sorted, 0.01), hi = percentile(sorted, 0.99);
  const range = hi - lo;
  if (range <= 0) return [];
  const w = range / nbins;
  const bins = [];
  for (let i = 0; i < nbins; i++) {
    const binLo = lo + i * w;
    bins.push({ bucket: binLo.toFixed(1), lo: binLo, hi: binLo + w, count: 0 });
  }
  for (const v of arr) {
    if (v < lo || v > hi) continue;
    let idx = Math.floor((v - lo) / w);
    if (idx >= nbins) idx = nbins - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }
  return bins;
}

function extractColumn(raw: any, col: string, n: number): (number | null)[] {
  const colData = raw?.[col];
  if (!colData) return [];
  if (Array.isArray(colData) && colData.length && Array.isArray(colData[0])) {
    const result: (number | null)[] = new Array(n).fill(null);
    for (const [idx, val] of colData) {
      if (typeof idx === "number" && idx >= 0 && idx < n)
        result[idx] = typeof val === "number" ? val : null;
    }
    return result;
  }
  return Array.isArray(colData) ? colData.slice(0, n) : [];
}

function newCondition(type: ConditionType = "sigma"): Condition {
  return {
    id: Math.random().toString(36).slice(2, 10), type,
    sigma: 2, sigmaWindow: 60, sigmaDirection: "either", sigmaBasis: "rolling",
    gapPct: 2, gapDirection: "either",
  };
}

function conditionLabel(c: Condition): string {
  if (c.type === "sigma") {
    const dir = c.sigmaDirection === "either" ? "±" : c.sigmaDirection === "up" ? "+" : "−";
    const basis = c.sigmaBasis === "full" ? "full hist" : `${c.sigmaWindow}d`;
    return `${dir}${c.sigma}σ 1d (${basis})`;
  }
  if (c.type === "high52") return "New 52w high";
  if (c.type === "low52") return "New 52w low";
  if (c.type === "gap") {
    const dir = c.gapDirection === "either" ? "±" : c.gapDirection === "up" ? "+" : "−";
    return `${dir}${c.gapPct}% gap`;
  }
  return "";
}

function pctFmt(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

function numFmt(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(decimals);
}

function sigmaZClass(t: number): string {
  return Number.isFinite(t)
    ? t >= 3 ? "bg-destructive/20 text-destructive border-destructive/40"
    : t >= 2 ? "bg-chart-3/20 text-chart-3 border-chart-3/40"
    : t >= 1 ? "bg-chart-1/20 text-chart-1 border-chart-1/40"
    : "bg-muted text-muted-foreground border-border"
    : "bg-muted text-muted-foreground";
}

interface SigmaInspect {
  pct: number;
  window: number;
  mu: number;
  sigma: number;
  z: number;
  absZ: number;
  percentileAbs: number;
  percentileSigned: number;
  countAtLeastAbs: number;
  totalDays: number;
  oneInNDays: number;
}

function windowStats(rets: (number | null)[], n: number, window: number): { mu: number; sigma: number; n: number } {
  const arr: number[] = [];
  for (let i = n - window; i < n; i++) {
    if (i < 0) continue;
    const v = rets[i];
    if (v != null && Number.isFinite(v)) arr.push(v);
  }
  if (arr.length < Math.max(10, Math.floor(window * 0.6))) return { mu: NaN, sigma: NaN, n: arr.length };
  const mu = mean(arr), sigma = stdDev(arr, mu);
  return { mu, sigma, n: arr.length };
}

function computeSigmaInspect(
  closes: (number | null)[],
  idx: number,
  pct: number,
  window: number,
  basis: SigmaBasis = "rolling"
): SigmaInspect | null {
  const n = closes.length;
  if (idx < 1 || idx >= n) return null;
  const dailyRets: (number | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const p = closes[i - 1], c = closes[i];
    if (p != null && c != null && p > 0) dailyRets[i] = (c / p - 1) * 100;
  }
  let mu: number, sigma: number;
  if (basis === "full") {
    const finite = dailyRets.filter((v): v is number => v != null && Number.isFinite(v));
    if (finite.length < 30) return null;
    mu = mean(finite); sigma = stdDev(finite, mu);
  } else {
    const ws = windowStats(dailyRets, idx, window);
    mu = ws.mu; sigma = ws.sigma;
  }
  if (!Number.isFinite(sigma) || sigma <= 0) return null;
  const z = (pct - mu) / sigma;
  const absPct = Math.abs(pct);
  const finite = dailyRets.filter((v): v is number => v != null && Number.isFinite(v));
  if (finite.length < 30) return null;
  const total = finite.length;
  let atLeast = 0, atMost = 0;
  for (const v of finite) {
    if (Math.abs(v) >= absPct) atLeast++;
    if (v <= pct) atMost++;
  }
  const percentileAbs = 1 - atLeast / total;
  const percentileSigned = atMost / total;
  const oneInN = atLeast > 0 ? total / atLeast : total;
  return {
    pct, window, mu, sigma, z, absZ: Math.abs(z),
    percentileAbs, percentileSigned, countAtLeastAbs: atLeast,
    totalDays: total, oneInNDays: oneInN,
  };
}

function resolveBasketName(ticker: string, baskets: any[], fallback = ""): string {
  if (!ticker) return fallback;
  if (!isBasketTicker(ticker)) return ticker;
  const id = ticker.replace("BASKET:", "");
  if (!id) return ticker;
  const b = baskets.find((x: any) => x.id === id);
  return b && b.name ? b.name : "Basket";
}

function useBasketName(): (ticker: string, fallback?: string) => string {
  const { baskets } = useBaskets();
  return (ticker: string, fallback = "") => resolveBasketName(ticker, baskets, fallback);
}

function chatListen(event: string, cb: (detail: any) => void): () => void {
  const handler = (e: any) => cb(e.detail);
  window.addEventListener(CHAT_EVENT_PREFIX + event, handler);
  return () => window.removeEventListener(CHAT_EVENT_PREFIX + event, handler);
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function ConditionEditor({ cond, onChange, onRemove, canRemove }: {
  cond: Condition; onChange: (c: Condition) => void; onRemove: () => void; canRemove: boolean;
}) {
  const set = (k: string, v: any) => onChange({ ...cond, [k]: v });
  return (
    <div className="flex flex-wrap items-end gap-2 p-2 bg-muted/40 rounded border border-border">
      <div className="flex flex-col gap-1 min-w-[150px]">
        <Label className="text-xs text-muted-foreground">Type</Label>
        <Select value={cond.type} onValueChange={v => set("type", v)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sigma">N-σ daily move</SelectItem>
            <SelectItem value="high52">New 52-week high</SelectItem>
            <SelectItem value="low52">New 52-week low</SelectItem>
            <SelectItem value="gap">Opening gap</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {cond.type === "sigma" && (
        <>
          <div className="flex flex-col gap-1 w-[90px]">
            <Label className="text-xs text-muted-foreground">σ threshold</Label>
            <Input type="number" step="0.1" min="0.5" value={cond.sigma}
              onChange={e => set("sigma", parseFloat(e.target.value) || 2)} className="h-8" />
          </div>
          <div className="flex flex-col gap-1 w-[150px]">
            <Label className="text-xs text-muted-foreground">μ/σ basis</Label>
            <Select value={cond.sigmaBasis} onValueChange={v => set("sigmaBasis", v)}>
              <SelectTrigger className="h-8" data-testid="select-sigma-basis"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rolling">Rolling window</SelectItem>
                <SelectItem value="full">Full history</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {cond.sigmaBasis === "rolling" && (
            <div className="flex flex-col gap-1 w-[110px]">
              <Label className="text-xs text-muted-foreground">Window (d)</Label>
              <Input type="number" step="10" min="20" value={cond.sigmaWindow}
                onChange={e => set("sigmaWindow", parseInt(e.target.value) || 60)} className="h-8" />
            </div>
          )}
          <div className="flex flex-col gap-1 w-[130px]">
            <Label className="text-xs text-muted-foreground">Direction</Label>
            <Select value={cond.sigmaDirection} onValueChange={v => set("sigmaDirection", v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="either">Either ±σ</SelectItem>
                <SelectItem value="up">Up (+σ)</SelectItem>
                <SelectItem value="down">Down (−σ)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      {cond.type === "gap" && (
        <>
          <div className="flex flex-col gap-1 w-[90px]">
            <Label className="text-xs text-muted-foreground">|Gap| ≥ %</Label>
            <Input type="number" step="0.5" min="0.1" value={cond.gapPct}
              onChange={e => set("gapPct", parseFloat(e.target.value) || 2)} className="h-8" />
          </div>
          <div className="flex flex-col gap-1 w-[130px]">
            <Label className="text-xs text-muted-foreground">Direction</Label>
            <Select value={cond.gapDirection} onValueChange={v => set("gapDirection", v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="either">Either</SelectItem>
                <SelectItem value="up">Gap up</SelectItem>
                <SelectItem value="down">Gap down</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      <Button variant="ghost" size="sm" onClick={onRemove} disabled={!canRemove}
        className="h-8 px-2 text-muted-foreground hover:text-destructive" data-testid="button-remove-condition">
        <Minus className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function ResultStats({ run, result, triggerSummary, showAllSingleEvents, setShowAllSingleEvents, pairsTickerA, pairsTickerB }: {
  run: any; result: StudyResult; triggerSummary: string;
  showAllSingleEvents: boolean; setShowAllSingleEvents: (v: boolean) => void;
  pairsTickerA?: string; pairsTickerB?: string;
}) {
  const isPairs = !!pairsTickerA && !!pairsTickerB;
  const displayName = useBasketName();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary" data-testid="badge-symbol">{displayName(run.symbol)}</Badge>
        <Badge variant="outline">{triggerSummary}</Badge>
        <Badge variant="outline" data-testid="badge-event-count">{result.events.length} events</Badge>
        {result.events.length === 0 && (
          <span className="text-xs text-muted-foreground">
            No events match the trigger. Try loosening thresholds, switching AND→OR, or picking a different ticker.
          </span>
        )}
      </div>
      {result.events.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              Forward return statistics (event vs. unconditional baseline)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">Horizon</th>
                    <th className="py-1.5 pr-3 font-medium">N</th>
                    <th className="py-1.5 pr-3 font-medium">Mean</th>
                    <th className="py-1.5 pr-3 font-medium">Median</th>
                    <th className="py-1.5 pr-3 font-medium">Std</th>
                    <th className="py-1.5 pr-3 font-medium">P(up)</th>
                    <th className="py-1.5 pr-3 font-medium">Win/Loss</th>
                    <th className="py-1.5 pr-3 font-medium">p25 / p75</th>
                    <th className="py-1.5 pr-3 font-medium">Min / Max</th>
                    <th className="py-1.5 pr-3 font-medium text-muted-foreground">Baseline Mean</th>
                    <th className="py-1.5 pr-3 font-medium text-muted-foreground">Baseline P(up)</th>
                    <th className="py-1.5 pr-3 font-medium">Edge vs. base</th>
                  </tr>
                </thead>
                <tbody>
                  {result.stats.map(stat => {
                    const base = result.baseline.find(b => b.horizon === stat.horizon)!;
                    const edge = Number.isFinite(stat.mean) && Number.isFinite(base.mean) ? stat.mean - base.mean : NaN;
                    const edgeClass = Number.isFinite(edge) ? edge > 0 ? "text-chart-2" : "text-destructive" : "";
                    const pUpClass = Number.isFinite(stat.pUp) ? stat.pUp >= 0.5 ? "text-chart-2" : "text-destructive" : "";
                    return (
                      <tr key={stat.horizon} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-1.5 pr-3 font-medium">{stat.horizon === 1 ? "1 day" : `${stat.horizon} days`}</td>
                        <td className="py-1.5 pr-3">{stat.count}</td>
                        <td className={`py-1.5 pr-3 font-semibold ${edgeClass}`}>{pctFmt(stat.mean)}</td>
                        <td className="py-1.5 pr-3">{pctFmt(stat.median)}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{numFmt(stat.std)}%</td>
                        <td className={`py-1.5 pr-3 font-semibold ${pUpClass}`}>{Number.isFinite(stat.pUp) ? `${(stat.pUp * 100).toFixed(1)}%` : "—"}</td>
                        <td className="py-1.5 pr-3">{numFmt(stat.winLoss)}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{pctFmt(stat.p25)} / {pctFmt(stat.p75)}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{pctFmt(stat.min)} / {pctFmt(stat.max)}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{pctFmt(base.mean)}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{Number.isFinite(base.pUp) ? `${(base.pUp * 100).toFixed(1)}%` : "—"}</td>
                        <td className={`py-1.5 pr-3 font-semibold ${edgeClass}`}>{Number.isFinite(edge) ? `${edge > 0 ? "+" : ""}${edge.toFixed(2)} pp` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
              Returns are close-to-close from the event bar. <b>Edge vs. base</b> subtracts the unconditional mean at each horizon. <b>Win/Loss</b> = |mean(winners)| / |mean(losers)|.
            </div>
          </CardContent>
        </Card>
      )}
      {result.events.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              Average cumulative return path after event (day 0 = event)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.avgPath} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  label={{ value: "Trading days after event", position: "insideBottom", offset: -4, style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" } }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v) => `${v.toFixed(1)}%`} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                  formatter={(v: any, k: any) => k === "cumret" ? [`${Number(v).toFixed(3)}%`, "Avg cum ret"] : [v, k]}
                  labelFormatter={(v) => `Day ${v}`} />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="cumret" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      {result.events.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {HORIZONS.map(h => {
            const bins = buildHistogram(result.distribution[h], 24);
            return (
              <Card key={h}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-semibold text-muted-foreground">{h}-day forward return distribution</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bins} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                      <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                        interval={Math.max(1, Math.floor(bins.length / 6))} />
                      <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={24} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                        formatter={(v: any) => [v, "Count"]}
                        labelFormatter={(label: any, payload: any) => {
                          const item = payload?.[0]?.payload;
                          return item ? `${item.lo.toFixed(2)}% to ${item.hi.toFixed(2)}%` : label;
                        }} />
                      <ReferenceLine x={bins.find(b => b.lo <= 0 && b.hi >= 0)?.bucket ?? "0"}
                        stroke="hsl(var(--muted-foreground))" />
                      <Bar dataKey="count" fill="hsl(var(--chart-2))" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {result.events.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              Event log ({result.events.length} signals)
            </CardTitle>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                onClick={() => {
                  const signals = result.events.map(ev => ({
                    date: ev.date, value: ev.triggerValue,
                    direction: ev.triggerValue >= 0 ? "up" : "down",
                    label: triggerSummary,
                  }));
                  (emitChartSignals as any)?.({
                    ticker: isPairs ? pairsTickerA : run.symbol,
                    label: isPairs ? `Pair ${pairsTickerA}/${pairsTickerB} · ${result.events.length} signals · ${triggerSummary}` : `Price Action · ${result.events.length} signals · ${triggerSummary}`,
                    signals,
                  });
                }}
                data-testid="button-show-on-chart"
                title="Jump to Charts and pin these signals on the price chart">
                <ChevronRight className="h-3 w-3" /> Show on chart
              </Button>
              {result.events.length > 200 && (
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="show-all-single" className="text-[10px] text-muted-foreground">Show all</Label>
                  <Switch id="show-all-single" checked={showAllSingleEvents}
                    onCheckedChange={setShowAllSingleEvents} data-testid="switch-show-all-single" />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">Date</th>
                    <th className="py-1.5 pr-3 font-medium">Trigger value</th>
                    {HORIZONS.map(h => <th key={h} className="py-1.5 pr-3 font-medium">+{h}d</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(showAllSingleEvents ? result.events : result.events.slice(-200)).slice().reverse().map((ev, i) => {
                    const firstCond = run.conditions[0];
                    const isSigmaOrGap = firstCond && (firstCond.type === "sigma" || firstCond.type === "gap");
                    return (
                      <tr key={`${ev.date}-${i}`} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-1 pr-3">{ev.date}</td>
                        <td className="py-1 pr-3">{isSigmaOrGap ? pctFmt(ev.triggerValue) : numFmt(ev.triggerValue)}</td>
                        {HORIZONS.map(h => {
                          const v = ev.fwd[h];
                          const cls = v == null ? "" : v > 0 ? "text-chart-2" : v < 0 ? "text-destructive" : "";
                          return <td key={h} className={`py-1 pr-3 ${cls}`}>{pctFmt(v ?? null)}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {result.events.length > 200 && !showAllSingleEvents && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  Showing most recent 200 of {result.events.length} signals. Toggle "Show all" above or use CSV export for the full list.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PriceAction() {
  const { data: allTickers = [] } = useQuery({ queryKey: ["/api/tickers"], queryFn: () => getTickers() });
  const { data: dates = [] } = useQuery({ queryKey: ["/api/dates"], queryFn: () => getDates() });
  const { universeTickers, isFiltered, filteredCount, totalCount } = useUniverse();
  const { baskets } = useBaskets();

  const filteredTickers = useMemo(() => universeTickers ? allTickers.filter((t: any) => universeTickers.has(t.ticker)) : allTickers, [allTickers, universeTickers]);

  const getBasketName = useCallback((ticker: string) => {
    if (!isBasketTicker(ticker)) return ticker;
    const id = ticker.replace("BASKET:", "");
    const b = baskets.find((b: any) => b.id === id);
    return b?.name ? b.name : "Basket";
  }, [baskets]);

  const [mode, setMode] = useState<"single" | "cross" | "pairs">("single");
  const [ticker, setTicker] = useState("");
  const [tickerB, setTickerB] = useState("");
  const [conditions, setConditions] = useState<Condition[]>([newCondition("sigma")]);
  const [combinator, setCombinator] = useState<"AND" | "OR">("AND");
  const [rankHorizon, setRankHorizon] = useState(20);
  const [sortKey, setSortKey] = useState("edge");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [runConfig, setRunConfig] = useState<RunConfig | null>(null);
  const [crossProgress, setCrossProgress] = useState<{ done: number; total: number } | null>(null);
  const [crossResults, setCrossResults] = useState<CrossTickerResult[] | null>(null);
  const [isCrossRunning, setIsCrossRunning] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [showAllSingleEvents, setShowAllSingleEvents] = useState(false);

  useEffect(() => {
    if (!ticker && filteredTickers.length) setTicker(filteredTickers[0].ticker);
    if (ticker && filteredTickers.length && !filteredTickers.find((t: any) => t.ticker === ticker))
      setTicker(filteredTickers[0].ticker);
  }, [filteredTickers, ticker]);

  useEffect(() => {
    if (!tickerB && filteredTickers.length >= 2) setTickerB(filteredTickers[1].ticker);
    if (tickerB && filteredTickers.length && !filteredTickers.find((t: any) => t.ticker === tickerB))
      setTickerB(filteredTickers.find((t: any) => t.ticker !== ticker)?.ticker ?? "");
  }, [filteredTickers, tickerB, ticker]);

  // Single ticker query
  const { data: rawSingle, isFetching: loadingSingle } = useQuery({
    queryKey: ["ticker-raw-pa", runConfig?.symbol, runConfig?.nonce],
    queryFn: async () => !runConfig || runConfig.mode !== "single" ? null : getTickerRaw(runConfig.symbol),
    enabled: !!runConfig && runConfig.mode === "single",
  });

  const singleResult = useMemo(() => {
    if (!runConfig || runConfig.mode !== "single" || !rawSingle || !dates.length) return null;
    const close = extractColumn(rawSingle, "close", dates.length);
    const open = extractColumn(rawSingle, "open", dates.length);
    if (!close.length) return null;
    return computeEventStudy({ close, open, dates, conditions: runConfig.conditions, combinator: runConfig.combinator });
  }, [runConfig, rawSingle, dates]);

  // Pairs query
  const { data: rawPairs, isFetching: loadingPairs } = useQuery({
    queryKey: ["ticker-raw-pairs", runConfig?.symbol, runConfig?.symbolB, runConfig?.nonce],
    queryFn: async () => {
      if (!runConfig || runConfig.mode !== "pairs" || !runConfig.symbolB) return null;
      const [a, b] = await Promise.all([getTickerRaw(runConfig.symbol), getTickerRaw(runConfig.symbolB)]);
      return { a, b };
    },
    enabled: !!runConfig && runConfig.mode === "pairs" && !!runConfig.symbolB,
  });

  const pairsResult = useMemo(() => {
    if (!runConfig || runConfig.mode !== "pairs" || !rawPairs || !dates.length) return null;
    const closeA = extractColumn(rawPairs.a, "close", dates.length);
    const closeB = extractColumn(rawPairs.b, "close", dates.length);
    const openA = extractColumn(rawPairs.a, "open", dates.length);
    const openB = extractColumn(rawPairs.b, "open", dates.length);
    if (!closeA.length || !closeB.length) return null;
    const n = Math.min(closeA.length, closeB.length);
    const ratioClose = new Array(n), ratioOpen = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = closeA[i], b = closeB[i];
      ratioClose[i] = (a != null && b != null && b > 0) ? a / b : null;
      const oa = openA[i], ob = openB[i];
      ratioOpen[i] = (oa != null && ob != null && ob > 0) ? oa / ob : null;
    }
    return computeEventStudy({ close: ratioClose, open: ratioOpen, dates, conditions: runConfig.conditions, combinator: runConfig.combinator });
  }, [runConfig, rawPairs, dates]);

  const runCrossStudy = useCallback(async (cfg: { tickers: Array<{ ticker: string; name: string }>; conditions: Condition[]; combinator: "AND" | "OR" }) => {
    setIsCrossRunning(true);
    setCrossResults(null);
    setCrossProgress({ done: 0, total: cfg.tickers.length });
    const results: CrossTickerResult[] = [];
    const batchSize = 8;
    let i = 0;
    async function worker() {
      while (i < cfg.tickers.length) {
        const idx = i++;
        const t = cfg.tickers[idx];
        try {
          const raw = await getTickerRaw(t.ticker);
          const close = extractColumn(raw, "close", dates.length);
          const open = extractColumn(raw, "open", dates.length);
          if (!close.length) { setCrossProgress(p => p ? { ...p, done: p.done + 1 } : null); continue; }
          const res = computeEventStudy({ close, open, dates, conditions: cfg.conditions, combinator: cfg.combinator });
          results.push({ ticker: t.ticker, name: t.name, events: res.events.length, stats: res.stats, baseline: res.baseline, eventRows: res.events });
        } catch {} finally {
          setCrossProgress(p => p ? { ...p, done: p.done + 1 } : null);
        }
      }
    }
    await Promise.all(Array.from({ length: batchSize }, () => worker()));
    setCrossResults(results);
    setIsCrossRunning(false);
  }, [dates]);

  const runRef = useRef(runCrossStudy);
  useEffect(() => { runRef.current = runCrossStudy; }, [runCrossStudy]);

  const latestRunRef = useRef<(() => void) | null>(null);

  const handleRun = useCallback(() => {
    if (mode === "single" && !ticker) return;
    if (mode === "pairs" && (!ticker || !tickerB || ticker === tickerB)) return;
    const cfg: RunConfig = {
      mode, symbol: ticker,
      symbolB: mode === "pairs" ? tickerB : undefined,
      tickers: filteredTickers.map((t: any) => ({ ticker: t.ticker, name: t.name })),
      conditions: conditions.map(c => ({ ...c })),
      combinator, nonce: Date.now(),
    };
    setRunConfig(cfg);
    if (mode === "cross") {
      runCrossStudy({ tickers: cfg.tickers, conditions: cfg.conditions, combinator: cfg.combinator });
    } else {
      setCrossResults(null);
    }
  }, [mode, ticker, tickerB, filteredTickers, conditions, combinator, runCrossStudy]);

  // Chat event bus listeners
  useEffect(() => {
    const unsubs = [
      chatListen("price-action:set-mode", ({ mode: m }) => setMode(m)),
      chatListen("price-action:set-ticker", ({ ticker: t }) => { if (t) setTicker(t.toUpperCase()); }),
      chatListen("price-action:set-ticker-b", ({ ticker: t }) => { if (t) setTickerB(t.toUpperCase()); }),
      chatListen("price-action:clear-conditions", () => setConditions([])),
      chatListen("price-action:add-condition", (payload) => {
        setConditions(prev => {
          const base = newCondition("sigma");
          if (payload.type === "sigma") return [...prev, { ...base, type: "sigma", sigma: Number(payload.k ?? 2), sigmaDirection: payload.direction ?? "either", sigmaWindow: Number(payload.window ?? 60), sigmaBasis: payload.basis ?? "rolling" }];
          if (payload.type === "gap") return [...prev, { ...base, type: "gap", gapPct: Number(payload.pct ?? 2), gapDirection: payload.direction ?? "either" }];
          if (payload.type === "high52" || payload.type === "low52") return [...prev, { ...base, type: payload.type }];
          return prev;
        });
      }),
      chatListen("price-action:set-combinator", ({ combinator: c }) => setCombinator(c)),
      chatListen("price-action:run", () => setTimeout(() => handleRun(), 50)),
      chatListen("price-action:show-on-chart", () => {
        document.querySelector('[data-testid="button-show-on-chart"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [handleRun]);

  const triggerSummary = useMemo(() => runConfig
    ? runConfig.conditions.map(conditionLabel).join(runConfig.combinator === "AND" ? " AND " : " OR ")
    : "", [runConfig]);

  const exportSingleCsv = useCallback(() => {
    if (!singleResult || !runConfig) return;
    const lines = ["Date,TriggerValue," + HORIZONS.map(h => `Fwd_${h}d_%`).join(","),
      ...singleResult.events.map(ev => [ev.date, ev.triggerValue.toFixed(4), ...HORIZONS.map(h => ev.fwd[h] != null ? ev.fwd[h]!.toFixed(4) : "")].join(","))];
    downloadCsv(`${ticker}_event_study.csv`, lines.join("\n"));
  }, [singleResult, runConfig, ticker]);

  const exportPairsCsv = useCallback(() => {
    if (!pairsResult || !runConfig) return;
    const lines = ["Date,RatioTriggerValue," + HORIZONS.map(h => `Fwd_${h}d_%`).join(","),
      ...pairsResult.events.map(ev => [ev.date, ev.triggerValue.toFixed(4), ...HORIZONS.map(h => ev.fwd[h] != null ? ev.fwd[h]!.toFixed(4) : "")].join(","))];
    downloadCsv(`${ticker}_over_${tickerB}_event_study.csv`, lines.join("\n"));
  }, [pairsResult, runConfig, ticker, tickerB]);

  const exportCrossCsv = useCallback(() => {
    if (!crossResults || !runConfig) return;
    const lines = [["Ticker", "Name", "Events", ...HORIZONS.flatMap(h => [`Mean_${h}d`, `Pup_${h}d`, `Edge_${h}d_pp`])].join(",")];
    for (const row of crossResults) {
      const cols = [row.ticker, `"${row.name.replace(/"/g, '""')}"`, String(row.events), ...HORIZONS.flatMap(h => {
        const s = row.stats.find(x => x.horizon === h)!;
        const b = row.baseline.find(x => x.horizon === h)!;
        const edge = Number.isFinite(s.mean) && Number.isFinite(b.mean) ? s.mean - b.mean : NaN;
        return [Number.isFinite(s.mean) ? s.mean.toFixed(4) : "", Number.isFinite(s.pUp) ? s.pUp.toFixed(4) : "", Number.isFinite(edge) ? edge.toFixed(4) : ""];
      })];
      lines.push(cols.join(","));
    }
    downloadCsv("cross_sectional_event_study.csv", lines.join("\n"));
  }, [crossResults, runConfig]);

  const exportCrossEventsCsv = useCallback(() => {
    if (!crossResults || !runConfig) return;
    const lines = [["Ticker", "Name", "Date", "TriggerValue", ...HORIZONS.map(h => `Fwd_${h}d_%`)].join(",")];
    for (const row of crossResults)
      for (const ev of row.eventRows)
        lines.push([row.ticker, `"${row.name.replace(/"/g, '""')}"`, ev.date, Number.isFinite(ev.triggerValue) ? ev.triggerValue.toFixed(4) : "", ...HORIZONS.map(h => ev.fwd[h] != null ? ev.fwd[h]!.toFixed(4) : "")].join(","));
    downloadCsv("cross_sectional_all_events.csv", lines.join("\n"));
  }, [crossResults, runConfig]);

  const sortedCrossResults = useMemo(() => {
    if (!crossResults) return null;
    const sorted = crossResults.slice();
    sorted.sort((a, b) => {
      const sk = a.stats.find(x => x.horizon === rankHorizon)!;
      const mk = b.stats.find(x => x.horizon === rankHorizon)!;
      const bk = a.baseline.find(x => x.horizon === rankHorizon)!;
      const bm = b.baseline.find(x => x.horizon === rankHorizon)!;
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "ticker") return dir * a.ticker.localeCompare(b.ticker);
      if (sortKey === "events") return (a.events - b.events) * dir;
      if (sortKey === "mean") return ((Number.isFinite(sk.mean) ? sk.mean : -Infinity) - (Number.isFinite(mk.mean) ? mk.mean : -Infinity)) * dir;
      if (sortKey === "pUp") return ((Number.isFinite(sk.pUp) ? sk.pUp : -Infinity) - (Number.isFinite(mk.pUp) ? mk.pUp : -Infinity)) * dir;
      if (sortKey === "edge") {
        const ea = Number.isFinite(sk.mean) && Number.isFinite(bk.mean) ? sk.mean - bk.mean : -Infinity;
        const eb = Number.isFinite(mk.mean) && Number.isFinite(bm.mean) ? mk.mean - bm.mean : -Infinity;
        return (ea - eb) * dir;
      }
      return 0;
    });
    return sorted;
  }, [crossResults, sortKey, sortDir, rankHorizon]);

  const crossAggregate = useMemo(() => {
    if (!sortedCrossResults) return null;
    const withEvents = sortedCrossResults.filter(t => t.events > 0);
    if (!withEvents.length) return null;
    return HORIZONS.map(h => {
      const means = withEvents.map(t => t.stats.find(x => x.horizon === h)?.mean).filter((v): v is number => Number.isFinite(v as number));
      const pUps = withEvents.map(t => t.stats.find(x => x.horizon === h)?.pUp).filter((v): v is number => Number.isFinite(v as number));
      const edges = withEvents.map(t => {
        const s = t.stats.find(x => x.horizon === h);
        const b = t.baseline.find(x => x.horizon === h);
        return s && b && Number.isFinite(s.mean) && Number.isFinite(b.mean) ? s.mean - b.mean : NaN;
      }).filter(v => Number.isFinite(v));
      const posEdge = edges.filter(e => e > 0).length;
      return {
        horizon: h, nTickers: withEvents.length,
        avgMean: means.length ? mean(means) : NaN,
        medMean: means.length ? percentile(means.slice().sort((a, b) => a - b), 0.5) : NaN,
        avgPup: pUps.length ? mean(pUps) : NaN,
        avgEdge: edges.length ? mean(edges) : NaN,
        posEdgeFraction: edges.length ? posEdge / edges.length : NaN,
      };
    });
  }, [sortedCrossResults]);

  const totalCrossEvents = useMemo(() => sortedCrossResults?.reduce((s, t) => s + t.events, 0) ?? 0, [sortedCrossResults]);

  const SortIcon = ({ col }: { col: string }) =>
    col !== sortKey ? <ChevronRight className="w-3 h-3 inline ml-0.5 opacity-40" />
      : sortDir === "asc" ? <ChevronDown className="w-3 h-3 inline ml-0.5" />
      : <ChevronDown className="w-3 h-3 inline ml-0.5 rotate-180" />;

  const handleColSort = (col: string) => {
    if (col === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(col); setSortDir(col === "ticker" ? "asc" : "desc"); }
  };

  const isLoadingSingle = !!runConfig && runConfig.mode === "single" && (loadingSingle || !singleResult);
  const isLoadingPairs = !!runConfig && runConfig.mode === "pairs" && (loadingPairs || !pairsResult);
  const canRun = !(mode === "single" && !ticker) && !(mode === "pairs" && (!ticker || !tickerB || ticker === tickerB))
    && !(mode === "cross" && filteredTickers.length === 0);

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-auto">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Play className="w-4 h-4 text-primary" /> Price Action — Event Study
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {/* Mode selector */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Mode</Label>
              <div className="inline-flex rounded border border-border overflow-hidden h-8">
                <button onClick={() => setMode("single")} data-testid="button-mode-single"
                  className={`px-3 text-xs flex items-center gap-1.5 ${mode === "single" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
                  <UserIcon className="w-3.5 h-3.5" /> Single
                </button>
                <button onClick={() => setMode("cross")} data-testid="button-mode-cross"
                  className={`px-3 text-xs flex items-center gap-1.5 border-l border-border ${mode === "cross" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
                  <UsersIcon className="w-3.5 h-3.5" /> Cross-section
                </button>
                <button onClick={() => setMode("pairs")} data-testid="button-mode-pairs"
                  className={`px-3 text-xs flex items-center gap-1.5 border-l border-border ${mode === "pairs" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
                  <ChevronRight className="w-3.5 h-3.5" /> Pairs
                </button>
              </div>
            </div>

            {mode === "single" && (
              <>
                <div className={`flex flex-col gap-1 min-w-[280px] ${isBasketTicker(ticker) ? "opacity-40 pointer-events-none" : ""}`}>
                  <Label className="text-xs text-muted-foreground">Ticker</Label>
                  <Select value={isBasketTicker(ticker) ? "" : ticker} onValueChange={setTicker}>
                    <SelectTrigger data-testid="select-ticker" className="h-8"><SelectValue placeholder="Pick ticker" /></SelectTrigger>
                    <SelectContent className="max-h-80">
                      {filteredTickers.map((t: any) => <SelectItem key={t.ticker} value={t.ticker}>{t.ticker} — {t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Basket</Label>
                  <BasketTickerPill activeTicker={ticker} onSelectTicker={setTicker} fallbackTicker={filteredTickers[0]?.ticker ?? null} />
                </div>
              </>
            )}

            {mode === "pairs" && (
              <>
                <div className="flex flex-col gap-1 min-w-[240px]">
                  <Label className="text-xs text-muted-foreground">Ticker A (long)</Label>
                  <Select value={ticker} onValueChange={setTicker}>
                    <SelectTrigger data-testid="select-ticker-a" className="h-8"><SelectValue placeholder="Pick A" /></SelectTrigger>
                    <SelectContent className="max-h-80">
                      {filteredTickers.map((t: any) => <SelectItem key={t.ticker} value={t.ticker}>{t.ticker} — {t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1 min-w-[240px]">
                  <Label className="text-xs text-muted-foreground">Ticker B (short)</Label>
                  <Select value={tickerB} onValueChange={setTickerB}>
                    <SelectTrigger data-testid="select-ticker-b" className="h-8"><SelectValue placeholder="Pick B" /></SelectTrigger>
                    <SelectContent className="max-h-80">
                      {filteredTickers.filter((t: any) => t.ticker !== ticker).map((t: any) => <SelectItem key={t.ticker} value={t.ticker}>{t.ticker} — {t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Universe</Label>
              <div className="h-8 px-2 flex items-center gap-1.5 rounded border border-border bg-card text-xs">
                {isFiltered ? (
                  <>
                    <Badge variant="secondary" className="text-[10px]">filtered</Badge>
                    <span>{filteredCount} / {totalCount}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">All {totalCount} tickers</span>
                )}
              </div>
            </div>

            <div className="flex gap-2 ml-auto">
              <Button onClick={handleRun} disabled={!canRun || isCrossRunning}
                data-testid="button-run-study" className="h-8">
                <Play className="w-3.5 h-3.5 mr-1.5" />
                {mode === "cross" ? `Run on ${filteredTickers.length}` : mode === "pairs" ? "Run pair study" : "Run study"}
              </Button>
              {runConfig?.mode === "single" && singleResult && singleResult.events.length > 0 && (
                <Button variant="outline" onClick={exportSingleCsv} data-testid="button-download-csv" className="h-8">
                  <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                </Button>
              )}
              {runConfig?.mode === "pairs" && pairsResult && pairsResult.events.length > 0 && (
                <Button variant="outline" onClick={exportPairsCsv} data-testid="button-download-pairs-csv" className="h-8">
                  <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                </Button>
              )}
              {runConfig?.mode === "cross" && sortedCrossResults && !isCrossRunning && (
                <>
                  <Button variant="outline" onClick={exportCrossCsv} data-testid="button-download-cross-csv" className="h-8">
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Summary
                  </Button>
                  <Button variant="outline" onClick={exportCrossEventsCsv} data-testid="button-download-cross-events-csv" className="h-8">
                    <Download className="w-3.5 h-3.5 mr-1.5" /> All events
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Conditions builder */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Conditions</Label>
              {conditions.length > 1 && (
                <Select value={combinator} onValueChange={(v) => setCombinator(v as "AND" | "OR")}>
                  <SelectTrigger className="h-7 w-[110px]" data-testid="select-combinator"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">AND (all fire)</SelectItem>
                    <SelectItem value="OR">OR (any fires)</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Button variant="ghost" size="sm" onClick={() => setConditions(prev => [...prev, newCondition("sigma")])}
                className="h-7 ml-auto" data-testid="button-add-condition">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add condition
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {conditions.map((c, i) => (
                <div key={c.id} className="flex items-center gap-2">
                  {conditions.length > 1 && i > 0 && (
                    <span className="text-[10px] font-semibold text-muted-foreground px-1">{combinator}</span>
                  )}
                  <div className="flex-1">
                    <ConditionEditor cond={c}
                      onChange={updated => setConditions(prev => prev.map(x => x.id === c.id ? updated : x))}
                      onRemove={() => setConditions(prev => prev.filter(x => x.id !== c.id))}
                      canRemove={conditions.length > 1} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {mode === "single" && ticker && (
        <MoveInspector
          symbol={ticker}
          displaySymbol={getBasketName(ticker)}
          tickerName={isBasketTicker(ticker)
            ? `${baskets.find((b: any) => `BASKET:${b.id}` === ticker)?.tickers.length ?? 0} tickers`
            : filteredTickers.find((t: any) => t.ticker === ticker)?.name ?? allTickers.find((t: any) => t.ticker === ticker)?.name ?? ""}
          sigmaWindow={conditions.find(c => c.type === "sigma")?.sigmaWindow ?? 60}
          sigmaBasis={conditions.find(c => c.type === "sigma")?.sigmaBasis ?? "rolling"}
          dates={dates} />
      )}

      {mode === "cross" && (
        <BiggestMoves
          tickers={filteredTickers}
          sigmaWindow={conditions.find(c => c.type === "sigma")?.sigmaWindow ?? 60}
          sigmaBasis={conditions.find(c => c.type === "sigma")?.sigmaBasis ?? "rolling"}
          dates={dates} />
      )}

      {/* Results area */}
      {!runConfig && (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Configure conditions, then click <span className="mx-1 font-semibold">Run</span>.
        </div>
      )}

      {runConfig?.mode === "single" && isLoadingSingle && (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Computing event study…
        </div>
      )}

      {runConfig?.mode === "single" && singleResult && (
        <ResultStats run={runConfig} result={singleResult} triggerSummary={triggerSummary}
          showAllSingleEvents={showAllSingleEvents} setShowAllSingleEvents={setShowAllSingleEvents} />
      )}

      {runConfig?.mode === "pairs" && isLoadingPairs && (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Computing pair event study…
        </div>
      )}

      {runConfig?.mode === "pairs" && pairsResult && runConfig.symbolB && (
        <ResultStats
          run={{ symbol: `${getBasketName(runConfig.symbol)}/${getBasketName(runConfig.symbolB)}`, conditions: runConfig.conditions, combinator: runConfig.combinator }}
          result={pairsResult} triggerSummary={triggerSummary}
          showAllSingleEvents={showAllSingleEvents} setShowAllSingleEvents={setShowAllSingleEvents}
          pairsTickerA={runConfig.symbol} pairsTickerB={runConfig.symbolB} />
      )}

      {runConfig?.mode === "cross" && (isCrossRunning || crossProgress) && (
        <Card>
          <CardContent className="py-3 text-sm flex items-center gap-3">
            <div className="flex-1">
              {isCrossRunning ? "Running event study across universe…" : "Complete"}
              {crossProgress && <span className="ml-2 text-muted-foreground">{crossProgress.done} / {crossProgress.total}</span>}
            </div>
            <div className="w-48 h-1.5 rounded bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all"
                style={{ width: crossProgress ? `${crossProgress.done / Math.max(1, crossProgress.total) * 100}%` : "0%" }} />
            </div>
          </CardContent>
        </Card>
      )}

      {runConfig?.mode === "cross" && sortedCrossResults && !isCrossRunning && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{triggerSummary}</Badge>
            <Badge variant="secondary">{sortedCrossResults.length} tickers · {totalCrossEvents} events</Badge>
            <span className="text-xs text-muted-foreground">{sortedCrossResults.filter(t => t.events > 0).length} tickers had at least one match</span>
          </div>

          {crossAggregate && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground">Cross-sectional aggregate (average across tickers)</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="py-1.5 pr-3 font-medium">Horizon</th>
                        <th className="py-1.5 pr-3 font-medium">Tickers w/ events</th>
                        <th className="py-1.5 pr-3 font-medium">Avg Mean</th>
                        <th className="py-1.5 pr-3 font-medium">Median of Means</th>
                        <th className="py-1.5 pr-3 font-medium">Avg P(up)</th>
                        <th className="py-1.5 pr-3 font-medium">Avg Edge vs. base</th>
                        <th className="py-1.5 pr-3 font-medium">% tickers w/ +edge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crossAggregate.map(row => (
                        <tr key={row.horizon} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-1.5 pr-3 font-medium">{row.horizon === 1 ? "1 day" : `${row.horizon} days`}</td>
                          <td className="py-1.5 pr-3">{row.nTickers}</td>
                          <td className={`py-1.5 pr-3 font-semibold ${Number.isFinite(row.avgMean) && row.avgMean > 0 ? "text-chart-2" : Number.isFinite(row.avgMean) && row.avgMean < 0 ? "text-destructive" : ""}`}>{pctFmt(row.avgMean)}</td>
                          <td className="py-1.5 pr-3">{pctFmt(row.medMean)}</td>
                          <td className={`py-1.5 pr-3 ${Number.isFinite(row.avgPup) && row.avgPup >= 0.5 ? "text-chart-2" : "text-destructive"}`}>{Number.isFinite(row.avgPup) ? `${(row.avgPup * 100).toFixed(1)}%` : "—"}</td>
                          <td className={`py-1.5 pr-3 font-semibold ${Number.isFinite(row.avgEdge) && row.avgEdge > 0 ? "text-chart-2" : Number.isFinite(row.avgEdge) && row.avgEdge < 0 ? "text-destructive" : ""}`}>{Number.isFinite(row.avgEdge) ? `${row.avgEdge > 0 ? "+" : ""}${row.avgEdge.toFixed(2)} pp` : "—"}</td>
                          <td className="py-1.5 pr-3">{Number.isFinite(row.posEdgeFraction) ? `${(row.posEdgeFraction * 100).toFixed(0)}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-xs font-semibold text-muted-foreground">Per-ticker ranked results</CardTitle>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Rank horizon</Label>
                <Select value={String(rankHorizon)} onValueChange={v => setRankHorizon(parseInt(v))}>
                  <SelectTrigger className="h-7 w-[90px]" data-testid="select-rank-horizon"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HORIZONS.map(h => <SelectItem key={h} value={String(h)}>{h}d</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-[600px] overflow-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-1.5 pr-1 font-medium w-6"></th>
                      <th className="py-1.5 pr-3 font-medium cursor-pointer select-none" onClick={() => handleColSort("ticker")}>Ticker <SortIcon col="ticker" /></th>
                      <th className="py-1.5 pr-3 font-medium">Name</th>
                      <th className="py-1.5 pr-3 font-medium cursor-pointer select-none" onClick={() => handleColSort("events")}>N <SortIcon col="events" /></th>
                      <th className="py-1.5 pr-3 font-medium cursor-pointer select-none" onClick={() => handleColSort("mean")}>Mean@{rankHorizon}d <SortIcon col="mean" /></th>
                      <th className="py-1.5 pr-3 font-medium">Median</th>
                      <th className="py-1.5 pr-3 font-medium cursor-pointer select-none" onClick={() => handleColSort("pUp")}>P(up) <SortIcon col="pUp" /></th>
                      <th className="py-1.5 pr-3 font-medium">Baseline Mean</th>
                      <th className="py-1.5 pr-3 font-medium cursor-pointer select-none" onClick={() => handleColSort("edge")}>Edge vs. base <SortIcon col="edge" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCrossResults.map(row => {
                      const stat = row.stats.find(x => x.horizon === rankHorizon)!;
                      const base = row.baseline.find(x => x.horizon === rankHorizon)!;
                      const edge = Number.isFinite(stat.mean) && Number.isFinite(base.mean) ? stat.mean - base.mean : NaN;
                      const edgeCls = Number.isFinite(edge) ? edge > 0 ? "text-chart-2" : "text-destructive" : "";
                      const meanCls = Number.isFinite(stat.mean) ? stat.mean > 0 ? "text-chart-2" : "text-destructive" : "";
                      const pUpCls = Number.isFinite(stat.pUp) ? stat.pUp >= 0.5 ? "text-chart-2" : "text-destructive" : "";
                      const isExpanded = expandedTicker === row.ticker;
                      const hasEvents = row.events > 0;
                      const firstCond = runConfig.conditions[0];
                      const isSigmaOrGap = firstCond && (firstCond.type === "sigma" || firstCond.type === "gap");
                      return (
                        <React.Fragment key={row.ticker}>
                          <tr className="border-b border-border/50 hover:bg-muted/30" data-testid={`row-ticker-${row.ticker}`}>
                            <td className="py-1 pr-1 w-6 align-middle">
                              {hasEvents ? (
                                <button type="button" className="p-0.5 rounded hover:bg-muted"
                                  onClick={e => { e.stopPropagation(); setExpandedTicker(isExpanded ? null : row.ticker); }}
                                  data-testid={`button-expand-${row.ticker}`}
                                  aria-label={isExpanded ? "Collapse events" : "Expand events"}>
                                  {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                </button>
                              ) : null}
                            </td>
                            <td className="py-1 pr-3 font-semibold cursor-pointer hover:underline"
                              onClick={() => navigateToTicker(row.ticker)}
                              title="Open in Charts tab">{row.ticker}</td>
                            <td className="py-1 pr-3 text-muted-foreground truncate max-w-[220px]">{row.name}</td>
                            <td className="py-1 pr-3">{row.events}</td>
                            <td className={`py-1 pr-3 font-semibold ${meanCls}`}>{pctFmt(stat.mean)}</td>
                            <td className="py-1 pr-3">{pctFmt(stat.median)}</td>
                            <td className={`py-1 pr-3 ${pUpCls}`}>{Number.isFinite(stat.pUp) ? `${(stat.pUp * 100).toFixed(1)}%` : "—"}</td>
                            <td className="py-1 pr-3 text-muted-foreground">{pctFmt(base.mean)}</td>
                            <td className={`py-1 pr-3 font-semibold ${edgeCls}`}>{Number.isFinite(edge) ? `${edge > 0 ? "+" : ""}${edge.toFixed(2)} pp` : "—"}</td>
                          </tr>
                          {isExpanded && hasEvents && (
                            <tr className="border-b border-border/50 bg-muted/20">
                              <td colSpan={9} className="p-0">
                                <div className="px-4 py-2">
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                                      {row.ticker} — {row.eventRows.length} signals (most recent first)
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 px-2"
                                        onClick={() => {
                                          const signals = row.eventRows.map(ev => ({ date: ev.date, value: ev.triggerValue, direction: ev.triggerValue >= 0 ? "up" : "down", label: triggerSummary }));
                                          (emitChartSignals as any)?.({ ticker: row.ticker, label: `Price Action · ${row.eventRows.length} signals · ${triggerSummary}`, signals });
                                        }}
                                        data-testid={`button-show-on-chart-${row.ticker}`}
                                        title="Jump to Charts and pin these signals on the price chart">
                                        <ChevronRight className="h-3 w-3" /> Show on chart
                                      </Button>
                                      <div className="text-[10px] text-muted-foreground">Click ticker to open in Charts</div>
                                    </div>
                                  </div>
                                  <div className="max-h-60 overflow-auto border border-border/50 rounded">
                                    <table className="w-full text-[11px] border-collapse">
                                      <thead className="sticky top-0 bg-card z-10">
                                        <tr className="text-left text-muted-foreground border-b border-border">
                                          <th className="py-1 px-2 font-medium">Date</th>
                                          <th className="py-1 px-2 font-medium">Trigger</th>
                                          {HORIZONS.map(h => <th key={h} className="py-1 px-2 font-medium">+{h}d</th>)}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row.eventRows.slice().reverse().map((ev, idx) => (
                                          <tr key={`${ev.date}-${idx}`} className="border-b border-border/30 hover:bg-muted/30">
                                            <td className="py-0.5 px-2 font-mono">{ev.date}</td>
                                            <td className="py-0.5 px-2">{isSigmaOrGap ? pctFmt(ev.triggerValue) : numFmt(ev.triggerValue)}</td>
                                            {HORIZONS.map(h => {
                                              const v = ev.fwd[h];
                                              const cls = v == null ? "" : v > 0 ? "text-chart-2" : v < 0 ? "text-destructive" : "";
                                              return <td key={h} className={`py-0.5 px-2 ${cls}`}>{pctFmt(v ?? null)}</td>;
                                            })}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {sortedCrossResults.length === 0 && (
                      <tr><td colSpan={9} className="py-6 text-center text-muted-foreground text-xs">No tickers returned data. Check universe filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">
                Click the chevron to see every signal date for a ticker. Click the ticker symbol to open it on the Charts tab.
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Move Inspector (single mode) ─────────────────────────────────────────────────
function MoveInspector({ symbol, displaySymbol, tickerName, sigmaWindow, sigmaBasis, dates }: {
  symbol: string; displaySymbol: string; tickerName: string;
  sigmaWindow: number; sigmaBasis: SigmaBasis; dates: string[];
}) {
  const disp = displaySymbol || symbol;
  const { data: raw } = useQuery({
    queryKey: ["ticker-raw-inspect", symbol],
    queryFn: async () => symbol ? getTickerRaw(symbol) : null,
    enabled: !!symbol,
  });
  const [customMove, setCustomMove] = useState("");
  const [customSigma, setCustomSigma] = useState("");

  const info = useMemo(() => {
    if (!raw || !dates.length) return null;
    const close = extractColumn(raw, "close", dates.length);
    const open = extractColumn(raw, "open", dates.length);
    if (!close.length) return null;
    let lastIdx = -1;
    for (let i = close.length - 1; i >= 1; i--) {
      if (close[i] != null && close[i - 1] != null && (close[i - 1] as number) > 0) { lastIdx = i; break; }
    }
    if (lastIdx < 1) return null;
    const lastDate = dates[lastIdx] ?? "";
    const prevClose = close[lastIdx - 1] as number;
    const lastClose = close[lastIdx] as number;
    const lastOpen = open[lastIdx];
    const lastMovePct = prevClose > 0 ? (lastClose / prevClose - 1) * 100 : NaN;
    const gapPct = prevClose > 0 && lastOpen != null && Number.isFinite(lastOpen) ? ((lastOpen as number) / prevClose - 1) * 100 : NaN;
    const window = Math.max(20, Math.floor(sigmaWindow || 60));
    const lastInspect = Number.isFinite(lastMovePct) ? computeSigmaInspect(close, lastIdx, lastMovePct, window, sigmaBasis) : null;
    const gapInspect = Number.isFinite(gapPct) ? computeSigmaInspect(close, lastIdx, gapPct, window, sigmaBasis) : null;
    const custom = parseFloat(customMove);
    const customInspect = Number.isFinite(custom) && custom !== 0 ? computeSigmaInspect(close, lastIdx, custom, window, sigmaBasis) : null;
    return {
      lastDate, lastClose, prevClose, lastOpen, lastMovePct, gapPct,
      lastInspect, gapInspect, customInspect,
      refCtx: lastInspect ?? gapInspect ?? customInspect ?? null,
      window,
    };
  }, [raw, dates, sigmaWindow, sigmaBasis, customMove]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> Move Inspector
          <span className="text-[11px] font-normal text-muted-foreground">
            What sigma is this move? (μ/σ basis: {sigmaBasis === "full" ? "full history" : `rolling ${info?.window ?? sigmaWindow}d`})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {info ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MoveCard label={`Latest close (${info.lastDate})`} sub={`${disp} — ${tickerName}`} pct={info.lastMovePct} ctx={info.lastInspect} basis={sigmaBasis} />
            <MoveCard label="Latest overnight gap" sub="Prev close → today's open" pct={info.gapPct} ctx={info.gapInspect} basis={sigmaBasis} />
            <div className="rounded-md border border-border p-2 space-y-1.5">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Custom move — enter %</div>
              <Input value={customMove} onChange={e => setCustomMove(e.target.value)} placeholder="e.g. 2 or -3.5" className="h-7 text-xs" data-testid="input-custom-move" />
              {info.customInspect ? (
                <SigmaContext ctx={info.customInspect} compact basis={sigmaBasis} />
              ) : (
                <div className="text-[10px] text-muted-foreground">Type a % move (positive or negative) to see what sigma it represents for {disp} today.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground py-2">Loading {disp}…</div>
        )}
        {info?.refCtx && (
          <SigmaTable mu={info.refCtx.mu} sigma={info.refCtx.sigma} basis={sigmaBasis} window={info.window}
            totalDays={info.refCtx.totalDays} customSigma={customSigma} setCustomSigma={setCustomSigma} />
        )}
      </CardContent>
    </Card>
  );
}

function SigmaTable({ mu, sigma, basis, window, totalDays, customSigma, setCustomSigma }: {
  mu: number; sigma: number; basis: SigmaBasis; window: number; totalDays: number;
  customSigma: string; setCustomSigma: (v: string) => void;
}) {
  const ks = [1, 1.5, 2, 2.5, 3];
  const cs = parseFloat(customSigma);
  const hasCustom = Number.isFinite(cs) && cs !== 0;
  const up = hasCustom ? mu + cs * sigma : NaN;
  const down = hasCustom ? mu - cs * sigma : NaN;
  const fmt = (v: number) => Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(2)}%` : "—";
  return (
    <div className="mt-3 rounded-md border border-border p-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">σ → % move</div>
        <span className="text-[10px] text-muted-foreground">
          {basis === "full"
            ? `full-history μ=${mu.toFixed(2)}%, σ=${sigma.toFixed(2)}% over ${totalDays} days`
            : `rolling μ=${mu.toFixed(2)}%, σ=${sigma.toFixed(2)}% over last ${window}d`}
        </span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-1 pr-3 font-medium">Threshold</th>
              {ks.map(k => <th key={k} className="py-1 pr-3 font-medium tabular-nums">{k}σ</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="py-1 pr-3 text-chart-2 font-medium">Up (μ + k·σ)</td>
              {ks.map(k => <td key={k} className="py-1 pr-3 tabular-nums text-chart-2 font-semibold" data-testid={`sigma-up-${k}`}>{fmt(mu + k * sigma)}</td>)}
            </tr>
            <tr>
              <td className="py-1 pr-3 text-destructive font-medium">Down (μ − k·σ)</td>
              {ks.map(k => <td key={k} className="py-1 pr-3 tabular-nums text-destructive font-semibold" data-testid={`sigma-down-${k}`}>{fmt(mu - k * sigma)}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Custom σ → %</div>
        <Input value={customSigma} onChange={e => setCustomSigma(e.target.value)} placeholder="e.g. 2.5 or -1.8" className="h-7 text-xs w-32" data-testid="input-custom-sigma" />
        {hasCustom ? (
          <div className="flex items-center gap-3 text-[11px] tabular-nums">
            <span>
              <span className="text-muted-foreground">Up ({cs >= 0 ? "+" : ""}{cs}σ): </span>
              <span className="text-chart-2 font-semibold" data-testid="sigma-custom-up">{fmt(up)}</span>
            </span>
            <span>
              <span className="text-muted-foreground">Down ({cs >= 0 ? "-" : "+"}{Math.abs(cs)}σ): </span>
              <span className="text-destructive font-semibold" data-testid="sigma-custom-down">{fmt(down)}</span>
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">Enter a sigma multiple to see the corresponding ±% threshold.</span>
        )}
      </div>
    </div>
  );
}

function MoveCard({ label, sub, pct, ctx, basis }: {
  label: string; sub?: string; pct: number; ctx: SigmaInspect | null; basis: SigmaBasis;
}) {
  const cls = !Number.isFinite(pct) || pct === 0 ? "" : pct > 0 ? "text-chart-2" : "text-destructive";
  return (
    <div className="rounded-md border border-border p-2 space-y-1.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
      <div className={`text-xl font-semibold tabular-nums ${cls}`}>{Number.isFinite(pct) ? `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}</div>
      {ctx ? (
        <SigmaContext ctx={ctx} basis={basis} />
      ) : (
        <div className="text-[10px] text-muted-foreground">Not enough history for sigma calc.</div>
      )}
    </div>
  );
}

function SigmaContext({ ctx, compact = false, basis }: {
  ctx: SigmaInspect; compact?: boolean; basis: SigmaBasis;
}) {
  const zLabel = `${ctx.z >= 0 ? "+" : ""}${ctx.z.toFixed(2)}σ`;
  const pctile = (ctx.percentileAbs * 100).toFixed(1);
  const freq = ctx.oneInNDays >= 252
    ? `1 in ~${(ctx.oneInNDays / 252).toFixed(1)} years`
    : ctx.oneInNDays >= 21
    ? `1 in ~${(ctx.oneInNDays / 21).toFixed(1)} months`
    : `1 in ~${Math.round(ctx.oneInNDays)} days`;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-semibold tabular-nums ${sigmaZClass(ctx.absZ)}`} data-testid="badge-sigma">{zLabel}</span>
        <span className="text-[10px] text-muted-foreground">|z|={ctx.absZ.toFixed(2)}</span>
      </div>
      {!compact && (
        <div className="text-[10px] text-muted-foreground">
          {basis === "full" ? "Full-history" : "Rolling"} μ={ctx.mu.toFixed(2)}%, σ={ctx.sigma.toFixed(2)}%
          {basis === "full" ? ` over ${ctx.totalDays} days` : ` over last ${ctx.window}d`}
        </div>
      )}
      <div className="text-[10px] text-muted-foreground">
        |move| percentile: <span className="font-semibold">{pctile}%</span> · {ctx.countAtLeastAbs} of {ctx.totalDays} days
      </div>
      <div className="text-[10px] text-muted-foreground">
        Historical frequency: <span className="font-semibold">{freq}</span>
      </div>
    </div>
  );
}

// ── Biggest moves today (cross mode) ─────────────────────────────────────────────
function BiggestMoves({ tickers, sigmaWindow, sigmaBasis, dates }: {
  tickers: Array<{ ticker: string; name: string }>; sigmaWindow: number; sigmaBasis: SigmaBasis; dates: string[];
}) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortMode, setSortMode] = useState("absSigma");

  const load = useCallback(async () => {
    if (!tickers.length || !dates.length) return;
    setLoading(true); setRows(null);
    const window = Math.max(20, Math.floor(sigmaWindow || 60));
    const out: any[] = [];
    const batchSize = 8;
    let i = 0;
    async function worker() {
      while (i < tickers.length) {
        const idx = i++;
        const t = tickers[idx];
        try {
          const raw = await getTickerRaw(t.ticker);
          const close = extractColumn(raw, "close", dates.length);
          const open = extractColumn(raw, "open", dates.length);
          if (!close.length) continue;
          let lastIdx = -1;
          for (let k = close.length - 1; k >= 1; k--) {
            if (close[k] != null && close[k - 1] != null && (close[k - 1] as number) > 0) { lastIdx = k; break; }
          }
          if (lastIdx < 1) continue;
          const prevClose = close[lastIdx - 1] as number;
          const pct = ((close[lastIdx] as number) / prevClose - 1) * 100;
          const openVal = open[lastIdx];
          const gap = openVal != null && Number.isFinite(openVal) && prevClose > 0 ? ((openVal as number) / prevClose - 1) * 100 : NaN;
          const sigma = Number.isFinite(pct) ? computeSigmaInspect(close, lastIdx, pct, window, sigmaBasis) : null;
          const gapSigma = Number.isFinite(gap) ? computeSigmaInspect(close, lastIdx, gap, window, sigmaBasis) : null;
          out.push({ ticker: t.ticker, name: t.name, date: dates[lastIdx] ?? "", pct, gap, sigma, gapSigma });
        } catch {}
      }
    }
    await Promise.all(Array.from({ length: batchSize }, () => worker()));
    setRows(out); setLoading(false);
  }, [tickers, dates, sigmaWindow, sigmaBasis]);

  const sorted = useMemo(() => {
    if (!rows) return null;
    const arr = rows.slice();
    const key = (r: any) => sortMode === "absSigma" ? (r.sigma?.absZ ?? -Infinity)
      : sortMode === "sigma" ? (r.sigma?.z ?? -Infinity)
      : sortMode === "absPct" ? Math.abs(r.pct) : r.pct;
    arr.sort((a, b) => key(b) - key(a));
    return arr;
  }, [rows, sortMode]);

  const latestDate = sorted && sorted.length > 0 ? sorted[0].date : "";

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> Biggest moves today
          <span className="text-[11px] font-normal text-muted-foreground">
            Ranks {tickers.length} tickers by the sigma of their latest move (μ/σ basis: {sigmaBasis === "full" ? "full history" : `rolling ${sigmaWindow}d`})
          </span>
        </CardTitle>
        <div className="flex items-center gap-2">
          {sorted && latestDate && <span className="text-[10px] text-muted-foreground">Latest close date: {latestDate}</span>}
          <Select value={sortMode} onValueChange={v => setSortMode(v)}>
            <SelectTrigger className="h-7 w-[130px]" data-testid="select-sort-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="absSigma">|sigma| desc</SelectItem>
              <SelectItem value="sigma">sigma desc</SelectItem>
              <SelectItem value="absPct">|% move| desc</SelectItem>
              <SelectItem value="pct">% move desc</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={load} disabled={loading} size="sm" className="h-7" data-testid="button-run-inspector">
            {loading ? "Loading…" : "Load moves"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {sorted ? (
          sorted.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">No tickers returned data.</div>
          ) : (
            <div className="max-h-[400px] overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">Ticker</th>
                    <th className="py-1.5 pr-3 font-medium">Name</th>
                    <th className="py-1.5 pr-3 font-medium">Date</th>
                    <th className="py-1.5 pr-3 font-medium">Move %</th>
                    <th className="py-1.5 pr-3 font-medium">Sigma</th>
                    <th className="py-1.5 pr-3 font-medium">|Move| pctile</th>
                    <th className="py-1.5 pr-3 font-medium">Freq</th>
                    <th className="py-1.5 pr-3 font-medium">Gap %</th>
                    <th className="py-1.5 pr-3 font-medium">Gap σ</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(r => {
                    const pctCls = !Number.isFinite(r.pct) || r.pct === 0 ? "" : r.pct > 0 ? "text-chart-2" : "text-destructive";
                    const gapCls = !Number.isFinite(r.gap) || r.gap === 0 ? "" : r.gap > 0 ? "text-chart-2" : "text-destructive";
                    const pctile = r.sigma ? `${(r.sigma.percentileAbs * 100).toFixed(1)}%` : "—";
                    const freq = r.sigma
                      ? r.sigma.oneInNDays >= 252 ? `1/${(r.sigma.oneInNDays / 252).toFixed(1)}y`
                      : r.sigma.oneInNDays >= 21 ? `1/${(r.sigma.oneInNDays / 21).toFixed(1)}mo`
                      : `1/${Math.round(r.sigma.oneInNDays)}d`
                      : "—";
                    return (
                      <tr key={r.ticker} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                        onClick={() => navigateToTicker(r.ticker)} data-testid={`row-move-${r.ticker}`}>
                        <td className="py-1 pr-3 font-semibold">{r.ticker}</td>
                        <td className="py-1 pr-3 text-muted-foreground truncate max-w-[200px]">{r.name}</td>
                        <td className="py-1 pr-3 text-muted-foreground font-mono text-[10px]">{r.date}</td>
                        <td className={`py-1 pr-3 font-semibold ${pctCls}`}>{Number.isFinite(r.pct) ? `${r.pct > 0 ? "+" : ""}${r.pct.toFixed(2)}%` : "—"}</td>
                        <td className="py-1 pr-3">
                          {r.sigma ? (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-semibold tabular-nums ${sigmaZClass(r.sigma.absZ)}`}>
                              {r.sigma.z >= 0 ? "+" : ""}{r.sigma.z.toFixed(2)}σ
                            </span>
                          ) : "—"}
                        </td>
                        <td className="py-1 pr-3 text-muted-foreground">{pctile}</td>
                        <td className="py-1 pr-3 text-muted-foreground">{freq}</td>
                        <td className={`py-1 pr-3 ${gapCls}`}>{Number.isFinite(r.gap) ? `${r.gap > 0 ? "+" : ""}${r.gap.toFixed(2)}%` : "—"}</td>
                        <td className="py-1 pr-3">
                          {r.gapSigma ? (
                            <span className={`inline-flex items-center px-1 py-0.5 rounded border text-[10px] font-semibold tabular-nums ${sigmaZClass(r.gapSigma.absZ)}`}>
                              {r.gapSigma.z >= 0 ? "+" : ""}{r.gapSigma.z.toFixed(2)}σ
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="text-xs text-muted-foreground py-2">
            Click <span className="font-semibold">Load moves</span> to compute the latest daily move and sigma across {tickers.length} tickers.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
