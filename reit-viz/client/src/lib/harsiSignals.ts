// HARSI signal detectors — extracted verbatim from HarsiOptimizer.tsx so the
// reconstructed optimizer worker and the page's Evaluate view share one
// implementation (the worker must not import the page: that would drag the
// whole React UI into the worker bundle).

export interface HarsiSignal { index: number; direction: string }

export function detectRsiThresholdSignals(
  rsi: (number | null)[],
  obThreshold: number,
  osThreshold: number,
  minIdx: number
): HarsiSignal[] {
  const result: HarsiSignal[] = [];
  for (let i = Math.max(1, minIdx); i < rsi.length; i++) {
    const cur = rsi[i];
    const prev = rsi[i - 1];
    if (cur === null || prev === null) continue;
    if (prev <= osThreshold && cur > osThreshold) result.push({ index: i, direction: "buy" });
    else if (prev >= obThreshold && cur < obThreshold) result.push({ index: i, direction: "sell" });
  }
  return result;
}

export function detectStochKDCross(
  stochK: (number | null)[],
  stochD: (number | null)[],
  obThreshold: number,
  osThreshold: number,
  minIdx: number
): HarsiSignal[] {
  const result: HarsiSignal[] = [];
  for (let i = Math.max(1, minIdx); i < stochK.length; i++) {
    const kCur = stochK[i];
    const kPrev = stochK[i - 1];
    const dCur = stochD[i];
    const dPrev = stochD[i - 1];
    if (kCur === null || kPrev === null || dCur === null || dPrev === null) continue;
    const crossUp = kPrev <= dPrev && kCur > dCur;
    const crossDown = kPrev >= dPrev && kCur < dCur;
    if (crossUp && kCur < osThreshold && dCur < osThreshold)
      result.push({ index: i, direction: "buy" });
    else if (crossDown && kCur > obThreshold && dCur > obThreshold)
      result.push({ index: i, direction: "sell" });
  }
  return result;
}

export function detectHaFlip(
  haClose: (number | null)[],
  haOpen: (number | null)[],
  confirmation: number,
  minIdx: number
): HarsiSignal[] {
  const result: HarsiSignal[] = [];
  let signTracker = 0;
  let consecutiveCount = 0;
  let lastDir: string | null = null;
  let flipStart = -1;
  for (let i = Math.max(0, minIdx); i < haClose.length; i++) {
    const hc = haClose[i];
    const ho = haOpen[i];
    if (hc === null || ho === null) {
      signTracker = 0;
      lastDir = null;
      consecutiveCount = 0;
      continue;
    }
    const diff = hc - ho;
    const dir = diff > 0 ? 1 : diff < 0 ? -1 : 0;
    if (dir === 0) {
      if (lastDir) consecutiveCount += 1;
      continue;
    }
    if (signTracker === 0) {
      signTracker = dir;
      continue;
    }
    if (dir !== signTracker) {
      lastDir = dir > 0 ? "buy" : "sell";
      flipStart = i;
      consecutiveCount = 0;
      signTracker = dir;
    } else if (lastDir) consecutiveCount += 1;
    if (lastDir && consecutiveCount >= confirmation) {
      const emitIdx = flipStart + confirmation;
      if (emitIdx < haClose.length) result.push({ index: emitIdx, direction: lastDir });
      lastDir = null;
      consecutiveCount = 0;
    }
  }
  return result;
}

export function detectComposite(
  rsi: (number | null)[],
  stochK: (number | null)[],
  stochD: (number | null)[],
  obThreshold: number,
  osThreshold: number,
  lookback: number,
  minIdx: number
): HarsiSignal[] {
  const result: HarsiSignal[] = [];
  const lb = Math.max(1, lookback);
  let lastEmit = "none";
  for (let i = Math.max(1, minIdx); i < rsi.length; i++) {
    const rsiVal = rsi[i];
    if (rsiVal === null) {
      lastEmit = "none";
      continue;
    }
    let hasBuyStoch = false;
    let hasSellStoch = false;
    for (let f = i; f > Math.max(0, i - lb); f--) {
      const k = stochK[f];
      const d = stochD[f];
      if (k !== null && d !== null) {
        if (k < d) hasBuyStoch = true;
        if (k > d) hasSellStoch = true;
      }
    }
    let sig = "none";
    if (rsiVal <= osThreshold && hasBuyStoch) sig = "buy";
    else if (rsiVal >= obThreshold && hasSellStoch) sig = "sell";
    if (sig !== "none" && sig !== lastEmit) result.push({ index: i, direction: sig });
    lastEmit = sig;
  }
  return result;
}
