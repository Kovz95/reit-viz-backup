/**
 * harsiOptimizer.worker — reconstructed compute kernel for the HARSI Optimizer.
 *
 * The original hashed worker chunk (harsiOptimizer.worker-D5NE8xS_.js) was
 * lost with the recovered bundle; the page's Run hung forever. This rebuilds
 * the grid sweep from the page's visible contract (HarsiOptimizer.tsx:
 * optimizerParams payload, HarsiTickerResult/HarsiConfig consumed by the
 * results table + detail panel, countCombos' axis spec, and the page's own
 * signal detectors — now shared via lib/harsiSignals.ts).
 *
 * Protocol:
 *   in:  { type: "run", id?, ticker, name, closes, highs, lows, params, frequency, timeframe }
 *   out: { type: "progress", configsDone, configsTotal }
 *        { type: "result", result: HarsiTickerResult | null }
 *        { type: "error", error }
 */
import { harsiCompute } from "@/lib/harsi";
import {
  detectRsiThresholdSignals,
  detectStochKDCross,
  detectHaFlip,
  detectComposite,
  type HarsiSignal,
} from "@/lib/harsiSignals";
import {
  computeForwardProfile,
  summarizeSignals,
  computeCompositeScore,
} from "@/lib/forwardReturns";

interface Grid {
  candleLength: number[];
  candleSmoothing: number[];
  rsiLength: number[];
  stochLength: number[];
  smoothK: number[];
  smoothD: number[];
  obThresholds: number[];
  osThresholds: number[];
  confirmation: number[];
  compositeLookback: number[];
}

interface Params {
  kind: string;
  grid: Grid;
  rsiSmoothed: boolean;
  candleSmoothing: number;
  stochFit: number;
  targetReturn: number;
  returnMode: string;
  bandMin: number;
  bandMax: number;
  minHold: number;
}

const SIGNAL_LABELS: Record<string, { label: string; description: string }> = {
  buy: { label: "Buy Signal", description: "Long-side signal — entry into long position" },
  sell: { label: "Sell Signal", description: "Short-side signal — entry into short position" },
};

const TOP_N_WITH_PROFILES = 8;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (!msg || msg.type !== "run") return;
  try {
    const result = run(msg);
    (self as any).postMessage({ type: "result", id: msg.id, result });
  } catch (err: any) {
    (self as any).postMessage({ type: "error", id: msg.id, error: String(err?.message ?? err) });
  }
};

function run(msg: any) {
  const { ticker, name } = msg;
  const closes: number[] = msg.closes;
  const highs: number[] = msg.highs ?? closes;
  const lows: number[] = msg.lows ?? closes;
  const p: Params = msg.params;
  const g = p.grid;
  const kind = p.kind;
  if (!Array.isArray(closes) || closes.length < 60) return null;

  const isBand = p.returnMode === "band";
  const bandObj = isBand ? { minReturn: p.bandMin, maxReturn: p.bandMax } : null;

  // One HARSI compute per distinct parameter set — cache across configs.
  const harsiCache = new Map<string, any>();
  const getHarsi = (opts: Record<string, any>) => {
    const key = JSON.stringify(opts);
    let h = harsiCache.get(key);
    if (!h) {
      h = harsiCompute(closes, highs, lows, opts);
      harsiCache.set(key, h);
    }
    return h;
  };

  // Enumerate configs exactly per the page's countCombos() axis spec.
  type Cfg = {
    label: string; key: string;
    harsiOpts: Record<string, any>;
    detect: (h: any, minIdx: number) => HarsiSignal[];
  };
  const cfgs: Cfg[] = [];
  const base = { rsiSmoothed: p.rsiSmoothed, stochFit: p.stochFit };
  if (kind === "rsi_threshold") {
    for (const cl of g.candleLength)
      for (const rl of g.rsiLength)
        for (const ob of g.obThresholds)
          for (const os of g.osThresholds)
            cfgs.push({
              label: `CL${cl} RSI${rl} OB${ob}/OS${os}`,
              key: `${cl}_${rl}_${ob}_${os}`,
              harsiOpts: { ...base, candleLength: cl, candleSmoothing: p.candleSmoothing, rsiLength: rl },
              detect: (h, m) => detectRsiThresholdSignals(h.rsi, ob, os, m),
            });
  } else if (kind === "stoch_kd_cross") {
    for (const cl of g.candleLength)
      for (const rl of g.rsiLength)
        for (const sl of g.stochLength)
          for (const sk of g.smoothK)
            for (const sd of g.smoothD)
              for (const ob of g.obThresholds)
                for (const os of g.osThresholds)
                  cfgs.push({
                    label: `CL${cl} RSI${rl} Stoch${sl} K${sk}/D${sd} OB${ob}/OS${os}`,
                    key: `${cl}_${rl}_${sl}_${sk}_${sd}_${ob}_${os}`,
                    harsiOpts: { ...base, candleLength: cl, candleSmoothing: p.candleSmoothing, rsiLength: rl, stochLength: sl, smoothK: sk, smoothD: sd },
                    detect: (h, m) => detectStochKDCross(h.stochK, h.stochD, ob, os, m),
                  });
  } else if (kind === "ha_flip") {
    for (const cl of g.candleLength)
      for (const cs of g.candleSmoothing)
        for (const conf of g.confirmation)
          cfgs.push({
            label: `CL${cl} Smooth${cs} Confirm${conf}`,
            key: `${cl}_${cs}_${conf}`,
            harsiOpts: { ...base, candleLength: cl, candleSmoothing: cs },
            detect: (h, m) => detectHaFlip(h.haClose, h.haOpen, conf, m),
          });
  } else if (kind === "composite") {
    for (const cl of g.candleLength)
      for (const rl of g.rsiLength)
        for (const sl of g.stochLength)
          for (const sk of g.smoothK)
            for (const sd of g.smoothD)
              for (const ob of g.obThresholds)
                for (const os of g.osThresholds)
                  for (const lb of g.compositeLookback)
                    cfgs.push({
                      label: `CL${cl} RSI${rl} Stoch${sl} K${sk}/D${sd} OB${ob}/OS${os} L${lb}`,
                      key: `${cl}_${rl}_${sl}_${sk}_${sd}_${ob}_${os}_${lb}`,
                      harsiOpts: { ...base, candleLength: cl, candleSmoothing: p.candleSmoothing, rsiLength: rl, stochLength: sl, smoothK: sk, smoothD: sd },
                      detect: (h, m) => detectComposite(h.rsi, h.stochK, h.stochD, ob, os, lb, m),
                    });
  } else {
    throw new Error(`Unknown signal kind: ${kind}`);
  }

  const configs: any[] = [];
  cfgs.forEach((cfg, ci) => {
    const h = getHarsi(cfg.harsiOpts);
    const maxPeriod = Math.max(
      cfg.harsiOpts.candleLength ?? 14,
      cfg.harsiOpts.rsiLength ?? 7,
      cfg.harsiOpts.stochLength ?? 14,
      14,
    );
    const minIdx = Math.max(60, maxPeriod * 3);
    const signals = cfg.detect(h, minIdx);

    const buyProfiles: any[] = [];
    const sellProfiles: any[] = [];
    let lastIdx = -1;
    for (const sig of signals) {
      if (p.minHold > 0 && sig.index < lastIdx) continue;
      if (sig.index < 0 || sig.index >= closes.length) continue;
      const profile = computeForwardProfile(closes, sig.index, p.targetReturn, sig.direction as any, bandObj as any, p.minHold);
      sig.direction === "buy" ? buyProfiles.push(profile) : sellProfiles.push(profile);
      if (p.minHold > 0) lastIdx = sig.index + p.minHold;
    }
    const buySummary = summarizeSignals(buyProfiles as any, "buy" as any);
    const sellSummary = summarizeSignals(sellProfiles as any, "sell" as any);
    const buyComposite = computeCompositeScore(buySummary as any, "buy" as any, isBand as any);
    const sellComposite = computeCompositeScore(sellSummary as any, "sell" as any, isBand as any);
    const cats = [
      { category: "buy", label: SIGNAL_LABELS.buy.label, description: SIGNAL_LABELS.buy.description, summary: buySummary, composite: buyComposite, profiles: buyProfiles },
      { category: "sell", label: SIGNAL_LABELS.sell.label, description: SIGNAL_LABELS.sell.description, summary: sellSummary, composite: sellComposite, profiles: sellProfiles },
    ];
    for (const c of cats) {
      const comp: any = c.composite;
      if (typeof comp?.score === "number") comp.score = Math.round(comp.score * 100) / 100;
    }
    const best = cats.reduce((a, b) => ((a.composite as any).score > (b.composite as any).score ? a : b), cats[0]);
    configs.push({
      kind,
      configLabel: cfg.label,
      configKey: cfg.key,
      categories: cats,
      bestCategory: best.category,
      bestScore: (best.composite as any).score,
      __harsiOpts: cfg.harsiOpts,
    });
    if ((ci + 1) % 25 === 0 || ci + 1 === cfgs.length) {
      (self as any).postMessage({ type: "progress", id: msg.id, configsDone: ci + 1, configsTotal: cfgs.length });
    }
  });

  if (!configs.length) return null;

  // Trim heavy profile arrays outside the top-N configs (detail panel shows 8).
  const sorted = [...configs].sort((a, b) => b.bestScore - a.bestScore);
  const topKeys = new Set(sorted.slice(0, TOP_N_WITH_PROFILES).map((c) => c.configKey));
  for (const c of configs) {
    if (!topKeys.has(c.configKey)) {
      for (const cat of c.categories) cat.profiles = undefined;
    }
  }

  // Current readings from the best config's HARSI state at the last bar.
  const bestCfg = sorted[0];
  const bh = getHarsi(bestCfg.__harsiOpts);
  for (const c of configs) delete c.__harsiOpts;
  const lastI = closes.length - 1;
  const currentRsi = bh.rsi?.[lastI] ?? null;
  const currentStochK = bh.stochK?.[lastI] ?? null;
  const currentStochD = bh.stochD?.[lastI] ?? null;
  const currentHaClose = bh.haClose?.[lastI] ?? null;
  let currentSignal = "None";
  const hc = bh.haClose?.[lastI], ho = bh.haOpen?.[lastI];
  if (kind === "ha_flip" && hc != null && ho != null) {
    currentSignal = hc > ho ? "Green" : hc < ho ? "Red" : "Flat";
  } else if (currentRsi != null) {
    if (currentStochK != null && currentStochD != null) {
      currentSignal = currentRsi <= -15 && currentStochK < currentStochD ? "OS zone"
        : currentRsi >= 15 && currentStochK > currentStochD ? "OB zone"
        : "Neutral";
    } else {
      currentSignal = currentRsi <= -15 ? "OS" : currentRsi >= 15 ? "OB" : "Neutral";
    }
  }

  return {
    ticker,
    name,
    kind,
    configs,
    currentSignal,
    currentRsi: currentRsi != null ? Math.round(currentRsi * 100) / 100 : null,
    currentStochK: currentStochK != null ? Math.round(currentStochK * 100) / 100 : null,
    currentStochD: currentStochD != null ? Math.round(currentStochD * 100) / 100 : null,
    currentHaClose: currentHaClose != null ? Math.round(currentHaClose * 10000) / 10000 : null,
  };
}

export {};
