import {
  r as k,
  j as r,
  cU as K,
  cX as Z,
  cW as T,
  a3 as ge,
  bh as be,
  d1 as ye,
  c_ as je
} from "./index-CsG73Aq_.js";
import {
  c as ve
} from "./harsi-NMVnsDcX.js";
import {
  c as Ne
} from "./tva-DaeKqI67.js";

function Fe(e, t, n) {
  if (t < n - 1) return null;
  let s = 0;
  for (let a = t - n + 1; a <= t; a++) {
    if (!Number.isFinite(e[a])) return null;
    s += e[a]
  }
  return s / n
}

function we(e, t, n) {
  if (t < n) return null;
  const s = [];
  for (let d = t - n + 1; d <= t; d++) {
    const m = e[d - 1],
      u = e[d];
    if (!(m > 0) || !Number.isFinite(u)) return null;
    s.push((u - m) / m)
  }
  const a = s.reduce((d, m) => d + m, 0) / s.length,
    o = s.reduce((d, m) => d + (m - a) * (m - a), 0) / s.length;
  return Math.sqrt(o)
}

function Se(e, t, n = 14) {
  if (t < n) return null;
  let s = 0,
    a = 0;
  for (let u = t - n + 1; u <= t; u++) {
    const i = e[u] - e[u - 1];
    i > 0 ? s += i : a += -i
  }
  const o = s / n,
    d = a / n;
  return d === 0 ? 100 : 100 - 100 / (1 + o / d)
}

function Me(e, t, n, s, a = 14) {
  if (s < a) return null;
  let o = 0;
  for (let d = s - a + 1; d <= s; d++) {
    const m = t[d],
      u = n[d],
      i = e[d - 1];
    if (![m, u, i].every(Number.isFinite)) return null;
    const l = Math.max(m - u, Math.abs(m - i), Math.abs(u - i));
    o += l
  }
  return o / a
}

function ke(e, t) {
  if (t < 34) return null;
  const n = [],
    s = 2 / 13,
    a = 2 / 27;
  let o = 0,
    d = 0;
  for (let i = 0; i < 12; i++) o += e[i];
  o /= 12;
  for (let i = 0; i < 26; i++) d += e[i];
  d /= 26;
  for (let i = 26; i <= t; i++) {
    if (!Number.isFinite(e[i])) return null;
    o = e[i] * s + o * (1 - s), d = e[i] * a + d * (1 - a), n.push(o - d)
  }
  if (n.length < 9) return null;
  const m = 2 / 10;
  let u = 0;
  for (let i = 0; i < 9; i++) u += n[i];
  u /= 9;
  for (let i = 9; i < n.length; i++) u = n[i] * m + u * (1 - m);
  return n[n.length - 1] - u
}

function Ae(e, t, n, s, a = 14) {
  if (s < a - 1) return null;
  let o = -1 / 0,
    d = 1 / 0;
  for (let m = s - a + 1; m <= s; m++) {
    if (!Number.isFinite(e[m]) || !Number.isFinite(t[m])) return null;
    e[m] > o && (o = e[m]), t[m] < d && (d = t[m])
  }
  return o === d ? 50 : (n[s] - d) / (o - d) * 100
}

function ne(e, t, n) {
  const s = we(e, t, n);
  return s === null ? null : s * Math.sqrt(252)
}

function se(e, t, n) {
  const s = Fe(e, t, n);
  return s === null || !(s > 0) || !Number.isFinite(e[t]) ? null : e[t] / s - 1
}

function z(e, t, n) {
  if (t < n) return null;
  const s = e[t - n],
    a = e[t];
  return !(s > 0) || !Number.isFinite(a) ? null : a / s - 1
}

function Re(e, t, n) {
  if (t < n - 1) return null;
  let s = -1 / 0;
  for (let a = t - n + 1; a <= t; a++) {
    if (!Number.isFinite(e[a])) return null;
    e[a] > s && (s = e[a])
  }
  return s > 0 ? e[t] / s - 1 : null
}

function M(e, t, n = 252) {
  if (!e) return null;
  const s = Math.max(0, t - n);
  for (let a = t; a >= s; a--) {
    const o = e[a];
    if (o != null && Number.isFinite(o)) return o
  }
  return null
}

function ae(e, t, n) {
  const s = M(e, t),
    a = M(e, t - n);
  return s === null || a === null ? null : s - a
}

function oe(e, t, n) {
  if (!e) return null;
  const s = Math.max(0, t - n + 1),
    a = [];
  for (let i = s; i <= t; i++) {
    const l = e[i];
    l != null && Number.isFinite(l) && a.push(l)
  }
  if (a.length < Math.max(20, n / 4)) return null;
  const o = a.reduce((i, l) => i + l, 0) / a.length,
    d = a.reduce((i, l) => i + (l - o) * (l - o), 0) / a.length,
    m = Math.sqrt(d);
  if (!(m > 0)) return null;
  const u = M(e, t);
  return u === null ? null : (u - o) / m
}
const q = new WeakMap,
  B = new WeakMap;

function ie(e) {
  const t = q.get(e.prices);
  if (t !== void 0) return t;
  if (!e.highs || !e.lows || e.highs.length !== e.prices.length) return q.set(e.prices, null), null;
  try {
    const n = ve(e.prices, e.highs, e.lows, {
      candleLength: 14,
      candleSmoothing: 1,
      rsiLength: 7,
      rsiSmoothed: !0,
      stochLength: 14,
      smoothK: 3,
      smoothD: 3,
      stochFit: 80
    });
    return q.set(e.prices, n), n
  } catch {
    return q.set(e.prices, null), null
  }
}

function le(e) {
  const t = B.get(e.prices);
  if (t !== void 0) return t;
  if (!e.volumes || e.volumes.length !== e.prices.length) return B.set(e.prices, null), null;
  let n = 0;
  for (let s = 0; s < e.volumes.length && !(Number.isFinite(e.volumes[s]) && e.volumes[s] > 0 && (
      n++, n >= 30)); s++);
  if (n < 30) return B.set(e.prices, null), null;
  try {
    const s = Ne(e.prices, e.volumes, 15, 3, 5);
    return B.set(e.prices, s), s
  } catch {
    return B.set(e.prices, null), null
  }
}

function ce(e, t, n) {
  if (!e || t < 1 || t >= e.length) return null;
  const s = e[t],
    a = m => {
      if (m == null || !Number.isFinite(m)) return 0;
      const u = m;
      return u > 0 ? 1 : u < 0 ? -1 : 0
    },
    o = a(s);
  if (o === 0) return null;
  const d = Math.max(0, t - n);
  for (let m = t - 1; m >= d; m--) {
    const u = a(e[m]);
    if (u !== 0 && u !== o) return t - m
  }
  return n + 1
}
const L = [{
  id: "ret_1m",
  label: "Trailing 1M return",
  description: "Price change over the last 21 trading days",
  category: "price-action",
  format: "pct",
  decimals: 1,
  compute: (e, t) => z(e.prices, t, 21)
}, {
  id: "ret_3m",
  label: "Trailing 3M return",
  description: "Price change over the last 63 trading days",
  category: "price-action",
  format: "pct",
  decimals: 1,
  compute: (e, t) => z(e.prices, t, 63)
}, {
  id: "ret_6m",
  label: "Trailing 6M return",
  description: "Price change over the last 126 trading days",
  category: "price-action",
  format: "pct",
  decimals: 1,
  compute: (e, t) => z(e.prices, t, 126)
}, {
  id: "ret_1y",
  label: "Trailing 1Y return",
  description: "Price change over the last 252 trading days",
  category: "price-action",
  format: "pct",
  decimals: 1,
  compute: (e, t) => z(e.prices, t, 252)
}, {
  id: "rv_21",
  label: "Realized vol 1M (annualized)",
  description: "Std dev of daily returns over last 21 days, * sqrt(252)",
  category: "price-action",
  format: "pct",
  decimals: 1,
  compute: (e, t) => ne(e.prices, t, 21)
}, {
  id: "rv_63",
  label: "Realized vol 3M (annualized)",
  description: "Std dev of daily returns over last 63 days, * sqrt(252)",
  category: "price-action",
  format: "pct",
  decimals: 1,
  compute: (e, t) => ne(e.prices, t, 63)
}, {
  id: "dist_50d",
  label: "Distance from 50d MA",
  description: "(price / 50d-SMA) - 1",
  category: "price-action",
  format: "pct",
  decimals: 1,
  compute: (e, t) => se(e.prices, t, 50)
}, {
  id: "dist_200d",
  label: "Distance from 200d MA",
  description: "(price / 200d-SMA) - 1",
  category: "price-action",
  format: "pct",
  decimals: 1,
  compute: (e, t) => se(e.prices, t, 200)
}, {
  id: "dd_252",
  label: "Drawdown from 1Y high",
  description: "(price - max(price, 252 bars)) / max",
  category: "price-action",
  format: "pct",
  decimals: 1,
  compute: (e, t) => Re(e.prices, t, 252)
}, {
  id: "rsi_14",
  label: "RSI(14)",
  description: "Relative Strength Index over 14 bars",
  category: "technical",
  format: "num",
  decimals: 1,
  compute: (e, t) => Se(e.prices, t, 14)
}, {
  id: "atr_14_pct",
  label: "ATR(14) / price",
  description: "Average True Range as % of price",
  category: "technical",
  format: "pct",
  decimals: 2,
  compute: (e, t) => {
    if (!e.highs || !e.lows) return null;
    const n = Me(e.prices, e.highs, e.lows, t, 14);
    return n === null || !(e.prices[t] > 0) ? null : n / e.prices[t]
  }
}, {
  id: "macd_hist",
  label: "MACD histogram",
  description: "MACD(12,26) − signal(9), in price units",
  category: "technical",
  format: "num",
  decimals: 3,
  compute: (e, t) => ke(e.prices, t)
}, {
  id: "stoch_k_14",
  label: "Stochastic %K(14)",
  description: "Position of close in 14-bar high-low range, 0-100",
  category: "technical",
  format: "num",
  decimals: 1,
  compute: (e, t) => !e.highs || !e.lows ? null : Ae(e.highs, e.lows, e.prices, t, 14)
}, {
  id: "harsi_color",
  label: "HARSI candle color (+1 green / −1 red)",
  description: "Sign of HARSI haClose − haOpen at signal bar (defaults: candle 14, smoothing 1).",
  category: "technical",
  format: "num",
  decimals: 0,
  compute: (e, t) => {
    const n = ie(e);
    if (!n) return null;
    const s = n.haClose[t],
      a = n.haOpen[t];
    if (s === null || a === null) return null;
    const o = s - a;
    return Number.isFinite(o) ? o > 0 ? 1 : o < 0 ? -1 : 0 : null
  }
}, {
  id: "harsi_color_flip_recency",
  label: "HARSI color flip recency (bars)",
  description: "Bars since the last green↔red color flip (sign change of haClose−haOpen). Lookback 60 bars; 61 = no flip in window. Low value = recent flip.",
  category: "technical",
  format: "num",
  decimals: 0,
  compute: (e, t) => {
    const n = ie(e);
    if (!n) return null;
    const s = new Array(t + 1);
    for (let a = Math.max(0, t - 60); a <= t; a++) {
      const o = n.haClose[a],
        d = n.haOpen[a];
      s[a] = o !== null && d !== null ? o - d : null
    }
    return ce(s, t, 60)
  }
}, {
  id: "tva_os_sign",
  label: "TVA regime (+1 bull / −1 bear)",
  description: "Sign of TVA oscillator os = WMA(close,15) − SMA(close,15). Requires volumes; null without them.",
  category: "technical",
  format: "num",
  decimals: 0,
  compute: (e, t) => {
    const n = le(e);
    if (!n) return null;
    const s = n.os[t];
    return s === void 0 || !Number.isFinite(s) ? null : s > 0 ? 1 : s < 0 ? -1 : 0
  }
}, {
  id: "tva_regime_flip_recency",
  label: "TVA regime flip recency (bars)",
  description: "Bars since the last TVA regime shift (sign change of os). Lookback 60 bars; 61 = no flip in window. Low value = recent regime change. Requires volumes.",
  category: "technical",
  format: "num",
  decimals: 0,
  compute: (e, t) => {
    const n = le(e);
    return n ? ce(n.os, t, 60) : null
  }
}, {
  id: "p_ffo_fy2",
  label: "P/FFO FY2",
  description: "Forward FY2 price-to-FFO multiple",
  category: "valuation",
  format: "ratio",
  decimals: 1,
  compute: (e, t) => M(e.fundamentals["P/FFO FY2"], t)
}, {
  id: "ffo_yield_fy2",
  label: "FFO Yield FY2",
  description: "1 / P/FFO FY2",
  category: "valuation",
  format: "pct",
  decimals: 2,
  compute: (e, t) => M(e.fundamentals["FFO Yield FY2"], t)
}, {
  id: "div_yield",
  label: "Dividend Yield",
  description: "Trailing dividend yield",
  category: "valuation",
  format: "pct",
  decimals: 2,
  compute: (e, t) => M(e.fundamentals["Dividend Yield"], t)
}, {
  id: "ev_ebitda_fy2",
  label: "EV/EBITDA FY2",
  description: "Forward FY2 EV/EBITDA",
  category: "valuation",
  format: "ratio",
  decimals: 1,
  compute: (e, t) => M(e.fundamentals["EV/EBITDA FY2"], t)
}, {
  id: "ev_ebitda_z_252",
  label: "EV/EBITDA z-score (1Y)",
  description: "z-score of EV/EBITDA FY2 vs trailing 252-bar window",
  category: "valuation",
  format: "z",
  decimals: 2,
  compute: (e, t) => oe(e.fundamentals["EV/EBITDA FY2"], t, 252)
}, {
  id: "p_ffo_z_252",
  label: "P/FFO z-score (1Y)",
  description: "z-score of P/FFO FY2 vs trailing 252-bar window",
  category: "valuation",
  format: "z",
  decimals: 2,
  compute: (e, t) => oe(e.fundamentals["P/FFO FY2"], t, 252)
}, {
  id: "off_52w_high",
  label: "% off 52wk High",
  description: "From workbook: percent off the trailing 52-week high",
  category: "valuation",
  format: "pct",
  decimals: 1,
  compute: (e, t) => M(e.fundamentals["% off 52wk High"], t)
}, {
  id: "off_52w_low",
  label: "% off 52wk Low",
  description: "From workbook: percent off the trailing 52-week low",
  category: "valuation",
  format: "pct",
  decimals: 1,
  compute: (e, t) => M(e.fundamentals["% off 52wk Low"], t)
}, {
  id: "fy1_eps_growth",
  label: "FY1 EPS Growth",
  description: "Consensus FY1 EPS growth",
  category: "fundamentals",
  format: "pct",
  decimals: 1,
  compute: (e, t) => M(e.fundamentals["FY1 EPS Growth"], t)
}, {
  id: "fy2_ffo_growth",
  label: "FY2 FFO Growth",
  description: "Consensus FY2 FFO growth",
  category: "fundamentals",
  format: "pct",
  decimals: 1,
  compute: (e, t) => M(e.fundamentals["FY2 FFO Growth"], t)
}, {
  id: "ffo_fy2_3m_chg",
  label: "FFO FY2 3M revision",
  description: "Change in FFO FY2 estimate over last 63 bars",
  category: "fundamentals",
  format: "num",
  decimals: 3,
  compute: (e, t) => ae(e.fundamentals["FFO FY2"], t, 63)
}, {
  id: "short_interest",
  label: "Short Interest %",
  description: "Short interest as % of float",
  category: "sentiment",
  format: "pct",
  decimals: 2,
  compute: (e, t) => M(e.fundamentals["Short Interest%"], t)
}, {
  id: "buy_minus_sell_ratings",
  label: "Buy − Sell ratings",
  description: "(Buy ratings − Sell ratings)",
  category: "sentiment",
  format: "num",
  decimals: 0,
  compute: (e, t) => {
    const n = M(e.fundamentals["Buy Ratings"], t),
      s = M(e.fundamentals["Sell Ratings"], t);
    return n === null || s === null ? null : n - s
  }
}, {
  id: "bull_minus_bear",
  label: "Bull% − Bear%",
  description: "AAII-style sentiment differential",
  category: "sentiment",
  format: "pct",
  decimals: 1,
  compute: (e, t) => {
    const n = M(e.fundamentals["Bull%"], t),
      s = M(e.fundamentals["Bear%"], t);
    return n === null || s === null ? null : n - s
  }
}, {
  id: "ust10",
  label: "10Y Treasury",
  description: "Constant-maturity 10Y yield (FRED DGS10)",
  category: "macro",
  format: "pct",
  decimals: 2,
  compute: (e, t) => M(e.macro.DGS10, t)
}, {
  id: "ust10_1m_chg",
  label: "10Y change over 1M",
  description: "Δ DGS10 over 21 trading days, in pp",
  category: "macro",
  format: "bp",
  decimals: 0,
  compute: (e, t) => {
    const n = ae(e.macro.DGS10, t, 21);
    return n === null ? null : n * 100
  }
}, {
  id: "yc_2s10s",
  label: "2s10s spread",
  description: "DGS10 − DGS2 (FRED computed)",
  category: "macro",
  format: "pct",
  decimals: 2,
  compute: (e, t) => M(e.macro.SPREAD_10Y_2Y, t)
}, {
  id: "ig_oas",
  label: "IG OAS",
  description: "BAML US IG corporate option-adjusted spread",
  category: "macro",
  format: "pct",
  decimals: 2,
  compute: (e, t) => M(e.macro.BAMLC0A0CM, t)
}, {
  id: "hy_oas",
  label: "HY OAS",
  description: "BAML US HY corporate option-adjusted spread",
  category: "macro",
  format: "pct",
  decimals: 2,
  compute: (e, t) => M(e.macro.BAMLH0A0HYM2, t)
}, {
  id: "vix",
  label: "VIX",
  description: "CBOE Volatility Index level",
  category: "macro",
  format: "num",
  decimals: 1,
  compute: (e, t) => M(e.macro.VIXCLS, t)
}, {
  id: "real_10y",
  label: "10Y real yield",
  description: "10Y TIPS yield (DFII10)",
  category: "macro",
  format: "pct",
  decimals: 2,
  compute: (e, t) => M(e.macro.DFII10, t)
}, {
  id: "breakeven_10y",
  label: "10Y breakeven",
  description: "10Y inflation breakeven (T10YIE)",
  category: "macro",
  format: "pct",
  decimals: 2,
  compute: (e, t) => M(e.macro.T10YIE, t)
}];

function de(e) {
  const t = e.filter(Number.isFinite).sort((s, a) => s - a);
  if (t.length === 0) return NaN;
  const n = Math.floor(t.length / 2);
  return t.length % 2 === 0 ? (t[n - 1] + t[n]) / 2 : t[n]
}

function V(e, t) {
  const n = e.filter(Number.isFinite).sort((d, m) => d - m);
  if (n.length === 0) return NaN;
  const s = (n.length - 1) * t,
    a = Math.floor(s),
    o = s - a;
  return n[a + 1] !== void 0 ? n[a] + o * (n[a + 1] - n[a]) : n[a]
}

function _e(e, t) {
  const n = e.filter(Number.isFinite).sort((m, u) => m - u),
    s = t.filter(Number.isFinite).sort((m, u) => m - u);
  if (n.length === 0 || s.length === 0) return 0;
  let a = 0,
    o = 0,
    d = 0;
  for (; a < n.length && o < s.length;) {
    const m = n[a],
      u = s[o];
    m <= u ? a++ : o++;
    const i = a / n.length,
      l = o / s.length,
      x = Math.abs(i - l);
    x > d && (d = x)
  }
  return d
}

function De(e, t, n) {
  if (t < 1 || n < 1) return 1;
  const s = t * n / (t + n),
    a = (Math.sqrt(s) + .12 + .11 / Math.sqrt(s)) * e;
  let o = 0,
    d = 0,
    m = !1;
  for (let u = 1; u <= 100; u++) {
    const i = 2 * Math.pow(-1, u - 1) * Math.exp(-2 * u * u * a * a);
    if (o += i, u > 1 && Math.abs(i) < 1e-10 && Math.abs(d) < 1e-10) {
      m = !0;
      break
    }
    d = i
  }
  return m || (o = o >= 0 ? o : 0), o < 0 && (o = 0), o > 1 && (o = 1), o
}

function Ie(e, t) {
  const n = e.filter(Number.isFinite),
    s = t.filter(Number.isFinite);
  if (n.length === 0 || s.length === 0) return .5;
  const a = n.map(u => ({
    x: u,
    g: 1
  })).concat(s.map(u => ({
    x: u,
    g: 0
  })));
  a.sort((u, i) => u.x - i.x);
  let o = 0,
    d = 0;
  for (; o < a.length;) {
    let u = o;
    for (; u + 1 < a.length && a[u + 1].x === a[o].x;) u++;
    const i = (o + u) / 2 + 1;
    for (let l = o; l <= u; l++) a[l].g === 1 && (d += i);
    o = u + 1
  }
  return (d - n.length * (n.length + 1) / 2) / (n.length * s.length)
}

function Te(e, t) {
  const n = e.filter(Number.isFinite),
    s = t.filter(Number.isFinite);
  if (n.length === 0 || s.length === 0) return 0;
  const a = n.reduce((i, l) => i + l, 0) / n.length,
    o = s.reduce((i, l) => i + l, 0) / s.length,
    d = n.reduce((i, l) => i + (l - a) * (l - a), 0) / n.length,
    m = s.reduce((i, l) => i + (l - o) * (l - o), 0) / s.length,
    u = Math.sqrt((d * n.length + m * s.length) / (n.length + s.length));
  return u > 0 ? (a - o) / u : 0
}

function Ye(e) {
  const t = e.length,
    n = e.map((o, d) => ({
      p: o,
      i: d
    })).sort((o, d) => o.p - d.p),
    s = new Array(t);
  let a = 1;
  for (let o = n.length - 1; o >= 0; o--) {
    const {
      p: d,
      i: m
    } = n[o], u = Math.min(a, d * t / (o + 1));
    s[m] = u, a = u
  }
  return s
}

function Ce(e) {
  const t = e.features ?? L,
    n = e.minSamples ?? 5,
    s = [],
    a = [];
  for (const i of e.signals) {
    if (i.signalIdx === void 0) continue;
    (e.useBand ? i.hitBand[e.horizon] : i.hitTarget[e.horizon]) ? s.push(i): a.push(i)
  }
  const o = [],
    d = [];
  for (const i of t) {
    const l = [],
      x = [];
    for (const b of s) {
      const h = i.compute(e.context, b.signalIdx);
      h !== null && Number.isFinite(h) && l.push(h)
    }
    for (const b of a) {
      const h = i.compute(e.context, b.signalIdx);
      h !== null && Number.isFinite(h) && x.push(h)
    }
    if (l.length < n || x.length < n) continue;
    const F = de(l),
      y = de(x),
      g = _e(l, x),
      j = De(g, l.length, x.length),
      N = {
        feature: {
          id: i.id,
          label: i.label,
          description: i.description,
          category: i.category,
          format: i.format,
          decimals: i.decimals
        },
        hitValues: l,
        missValues: x,
        hitN: l.length,
        missN: x.length,
        hitMedian: F,
        missMedian: y,
        hitP25: V(l, .25),
        hitP75: V(l, .75),
        missP25: V(x, .25),
        missP75: V(x, .75),
        medianSpread: F - y,
        cohensD: Te(l, x),
        ks: g,
        ksPVal: j,
        auc: Ie(l, x),
        separationScore: g * Math.sqrt(Math.min(l.length, x.length))
      };
    o.push(N), d.push(j)
  }
  const m = Ye(d),
    u = {};
  return o.forEach((i, l) => {
    u[i.feature.id] = m[l]
  }), o.sort((i, l) => l.separationScore - i.separationScore), {
    totalSignals: s.length + a.length,
    hitCount: s.length,
    missCount: a.length,
    rows: o,
    qValues: u
  }
}

function Pe(e, t, n, s, a, o = L) {
  const d = new Map(o.map(j => [j.id, j]));
  let m = 0,
    u = 0,
    i = 0,
    l = 0,
    x = 0;
  for (const j of e) {
    if (j.signalIdx === void 0) continue;
    x++;
    const N = n ? j.hitBand[t] : j.hitTarget[t];
    N && l++;
    let b = !0;
    for (const h of s) {
      const w = d.get(h.featureId);
      if (!w) {
        b = !1;
        break
      }
      const A = w.compute(a, j.signalIdx);
      if (A === null || !Number.isFinite(A)) {
        b = !1;
        break
      }
      switch (h.op) {
        case ">":
          A > h.threshold || (b = !1);
          break;
        case "<":
          A < h.threshold || (b = !1);
          break;
        case ">=":
          A >= h.threshold || (b = !1);
          break;
        case "<=":
          A <= h.threshold || (b = !1);
          break
      }
      if (!b) break
    }
    b ? N ? m++ : u++ : i++
  }
  const F = m + u,
    y = F > 0 ? m / F : 0,
    g = x > 0 ? l / x : 0;
  return {
    retained: F,
    dropped: i,
    hitRate: y,
    baseHitRate: g,
    lift: g > 0 ? y / g : 0,
    retainedHits: m,
    retainedMisses: u
  }
}

function $(e, t, n = 1) {
  if (e == null || !Number.isFinite(e)) return "—";
  switch (t) {
    case "pct":
      return (e * 100).toFixed(n) + "%";
    case "bp":
      return e.toFixed(n) + " bp";
    case "z":
      return (e >= 0 ? "+" : "") + e.toFixed(n);
    case "ratio":
      return e.toFixed(n) + "×";
    default:
      return e.toFixed(n)
  }
}
const Le = T.map(e => e.label),
  Ee = {
    "price-action": "bg-sky-500/15 text-sky-300",
    technical: "bg-violet-500/15 text-violet-300",
    valuation: "bg-emerald-500/15 text-emerald-300",
    fundamentals: "bg-amber-500/15 text-amber-300",
    sentiment: "bg-pink-500/15 text-pink-300",
    macro: "bg-orange-500/15 text-orange-300"
  },
  W = {
    ">": "greater than",
    "<": "less than",
    ">=": "≥",
    "<=": "≤"
  };

function ue(e) {
  return Number.isFinite(e) ? e < .001 ? "<0.001" : e < .01 || e < 1 ? e.toFixed(3) : e.toFixed(2) :
    "—"
}

function Be(e, t, n = 1) {
  if (!Number.isFinite(e)) return "—";
  switch (t) {
    case "pct":
      return (e >= 0 ? "+" : "") + (e * 100).toFixed(n) + "pp";
    case "bp":
      return (e >= 0 ? "+" : "") + e.toFixed(n) + " bp";
    case "z":
      return (e >= 0 ? "+" : "") + e.toFixed(n);
    case "ratio":
      return (e >= 0 ? "+" : "") + e.toFixed(n) + "×";
    default:
      return (e >= 0 ? "+" : "") + e.toFixed(n)
  }
}

function He(e) {
  const t = Math.abs(e - .5);
  return t > .25 ? "text-emerald-400 font-bold" : t > .15 ? "text-emerald-300" : t > .08 ?
    "text-yellow-300" : "text-muted-foreground"
}

function Oe(e) {
  const t = Math.abs(e);
  return t > .8 ? "text-emerald-400 font-bold" : t > .5 ? "text-emerald-300" : t > .2 ?
    "text-yellow-300" : "text-muted-foreground"
}

function me({
  p25: e,
  p75: t,
  median: n,
  lo: s,
  hi: a,
  color: o
}) {
  const d = a - s;
  if (!(d > 0)) return r.jsx("div", {
    className: "h-2 w-24 bg-muted/20"
  });
  const m = u => Math.max(0, Math.min(100, (u - s) / d * 100));
  return r.jsxs("div", {
    className: "relative h-2 w-24 bg-muted/15 rounded-sm",
    children: [r.jsx("div", {
      className: `absolute h-2 ${o} rounded-sm`,
      style: {
        left: `${m(e)}%`,
        width: `${m(t)-m(e)}%`
      }
    }), r.jsx("div", {
      className: "absolute h-2 w-[2px] bg-white/80",
      style: {
        left: `${m(n)}%`
      }
    })]
  })
}

function ze({
  signals: e,
  context: t,
  defaultHorizon: n = "1M",
  useBand: s = !1,
  direction: a = "buy",
  title: o
}) {
  const [d, m] = k.useState(n), [u, i] = k.useState(5), [l, x] = k.useState([]), [F, y] = k
    .useState("all"), [g, j] = k.useState("all"), N = k.useMemo(() => Ce({
      signals: e,
      horizon: d,
      useBand: s,
      context: t,
      minSamples: u
    }), [e, d, s, t, u]), b = k.useMemo(() => l.length === 0 ? null : Pe(e, d, s, l, t), [e, d, s,
      l, t
    ]), h = k.useMemo(() => {
      const c = new Map;
      for (const f of N.rows) {
        const p = [...f.hitValues, ...f.missValues];
        if (p.length === 0) continue;
        let S = 1 / 0,
          v = -1 / 0;
        for (const _ of p) _ < S && (S = _), _ > v && (v = _);
        c.set(f.feature.id, [S, v])
      }
      return c
    }, [N.rows]), w = k.useMemo(() => N.rows.filter(c => {
      if (F !== "all" && c.feature.category !== F) return !1;
      if (g === "q05") {
        const f = N.qValues[c.feature.id];
        if (f === void 0 || f > .05) return !1
      }
      return !0
    }), [N, F, g]), A = (c, f) => {
      x(p => {
        const S = [...p];
        return S[c] = {
          ...S[c],
          ...f
        }, S
      })
    }, R = c => x(f => f.filter((p, S) => S !== c)), I = (c, f) => {
      l.length >= 3 || x(p => [...p, {
        featureId: c,
        op: ">",
        threshold: f
      }])
    }, C = N.totalSignals > 0 ? N.hitCount / N.totalSignals : 0;
  return r.jsxs("div", {
    className: "border border-border rounded p-3 bg-card/30 space-y-3",
    children: [r.jsxs("div", {
      className: "flex items-baseline gap-2 flex-wrap",
      children: [r.jsx("span", {
        className: "text-xs font-bold text-foreground",
        children: "Hit Conditions"
      }), o && r.jsxs("span", {
        className: "text-[10px] text-muted-foreground",
        children: ["· ", o]
      }), r.jsxs("span", {
        className: "text-[10px] text-muted-foreground ml-auto",
        children: [N.totalSignals, " signals · ", r.jsxs("span", {
          className: "text-emerald-300",
          children: [N.hitCount, " hits"]
        }), " · ", r.jsxs("span", {
          className: "text-rose-300",
          children: [N.missCount, " misses"]
        }), " · base hit rate ", r.jsx("span", {
          className: Z(C),
          children: K(C)
        })]
      })]
    }), r.jsxs("div", {
      className: "flex items-center gap-3 flex-wrap text-[10px]",
      children: [r.jsxs("label", {
        className: "flex items-center gap-1",
        children: [r.jsx("span", {
          className: "text-muted-foreground",
          children: "Horizon"
        }), r.jsx("select", {
          className: "bg-background border border-border rounded px-1 py-0.5",
          value: d,
          onChange: c => m(c.target.value),
          children: Le.map(c => r.jsx("option", {
            value: c,
            children: c
          }, c))
        })]
      }), r.jsxs("label", {
        className: "flex items-center gap-1",
        children: [r.jsx("span", {
          className: "text-muted-foreground",
          children: "Min n"
        }), r.jsx("input", {
          type: "number",
          className: "bg-background border border-border rounded px-1 py-0.5 w-12",
          value: u,
          min: 3,
          onChange: c => i(Math.max(3, parseInt(c.target.value) || 5))
        })]
      }), r.jsxs("label", {
        className: "flex items-center gap-1",
        children: [r.jsx("span", {
          className: "text-muted-foreground",
          children: "Group"
        }), r.jsxs("select", {
          className: "bg-background border border-border rounded px-1 py-0.5",
          value: F,
          onChange: c => y(c.target.value),
          children: [r.jsx("option", {
            value: "all",
            children: "All categories"
          }), r.jsx("option", {
            value: "price-action",
            children: "Price action"
          }), r.jsx("option", {
            value: "technical",
            children: "Technical"
          }), r.jsx("option", {
            value: "valuation",
            children: "Valuation"
          }), r.jsx("option", {
            value: "fundamentals",
            children: "Fundamentals"
          }), r.jsx("option", {
            value: "sentiment",
            children: "Sentiment"
          }), r.jsx("option", {
            value: "macro",
            children: "Macro"
          })]
        })]
      }), r.jsxs("label", {
        className: "flex items-center gap-1",
        children: [r.jsx("input", {
          type: "checkbox",
          checked: g === "q05",
          onChange: c => j(c.target.checked ? "q05" : "all")
        }), r.jsx("span", {
          className: "text-muted-foreground",
          children: "Only BH q<0.05"
        })]
      }), r.jsx("span", {
        className: "text-muted-foreground ml-auto",
        children: a === "buy" ? "Hit = signal reached upside target" :
          "Hit = signal reached downside target"
      })]
    }), r.jsx("div", {
      className: "overflow-x-auto",
      children: r.jsxs("table", {
        className: "w-full text-[10px] font-mono",
        children: [r.jsx("thead", {
          className: "text-[9px] text-muted-foreground uppercase tracking-wide border-b border-border/40",
          children: r.jsxs("tr", {
            children: [r.jsx("th", {
              className: "text-left px-1 py-1",
              children: "Indicator"
            }), r.jsx("th", {
              className: "text-center px-1 py-1",
              children: "Hit median"
            }), r.jsx("th", {
              className: "text-center px-1 py-1",
              children: "Miss median"
            }), r.jsx("th", {
              className: "text-center px-1 py-1",
              children: "Δ med"
            }), r.jsx("th", {
              className: "text-center px-1 py-1",
              children: "|d|"
            }), r.jsx("th", {
              className: "text-center px-1 py-1",
              children: "KS"
            }), r.jsx("th", {
              className: "text-center px-1 py-1",
              children: "AUC"
            }), r.jsx("th", {
              className: "text-center px-1 py-1",
              children: "p"
            }), r.jsx("th", {
              className: "text-center px-1 py-1",
              children: "q"
            }), r.jsx("th", {
              className: "text-center px-1 py-1",
              children: "n hit"
            }), r.jsx("th", {
              className: "text-center px-1 py-1",
              children: "n miss"
            }), r.jsx("th", {
              className: "text-left px-1 py-1",
              children: "Distribution (IQR + median)"
            }), r.jsx("th", {
              className: "text-center px-1 py-1",
              children: "Filter"
            })]
          })
        }), r.jsxs("tbody", {
          children: [w.length === 0 && r.jsx("tr", {
            children: r.jsxs("td", {
              colSpan: 13,
              className: "text-center py-4 text-muted-foreground",
              children: [
                "No features have enough hit AND miss samples (≥ ",
                u,
                " each). Try lowering Min n, or pick a horizon with more hits."
              ]
            })
          }), w.map(c => {
            const f = c.feature.format,
              p = c.feature.decimals ?? 1,
              S = N.qValues[c.feature.id],
              v = h.get(c.feature.id),
              _ = v ? v[0] : 0,
              P = v ? v[1] : 1;
            return r.jsxs("tr", {
              className: "border-b border-border/20 hover:bg-muted/10",
              children: [r.jsx("td", {
                className: "px-1 py-1",
                children: r.jsxs("div", {
                  className: "flex items-center gap-1",
                  children: [r.jsx("span", {
                    className: `px-1 rounded text-[8px] uppercase ${Ee[c.feature.category]??"bg-muted/20"}`,
                    children: c.feature.category
                      .split("-")[0].slice(0, 4)
                  }), r.jsx("span", {
                    className: "text-foreground",
                    title: c.feature.description,
                    children: c.feature.label
                  })]
                })
              }), r.jsx("td", {
                className: "text-center px-1 py-1 text-emerald-300",
                children: $(c.hitMedian, f, p)
              }), r.jsx("td", {
                className: "text-center px-1 py-1 text-rose-300",
                children: $(c.missMedian, f, p)
              }), r.jsx("td", {
                className: "text-center px-1 py-1 text-foreground",
                children: Be(c.medianSpread, f, p)
              }), r.jsx("td", {
                className: `text-center px-1 py-1 ${Oe(c.cohensD)}`,
                children: Math.abs(c.cohensD).toFixed(2)
              }), r.jsx("td", {
                className: "text-center px-1 py-1 text-foreground",
                children: c.ks.toFixed(2)
              }), r.jsx("td", {
                className: `text-center px-1 py-1 ${He(c.auc)}`,
                children: c.auc.toFixed(2)
              }), r.jsx("td", {
                className: "text-center px-1 py-1 text-muted-foreground",
                children: ue(c.ksPVal)
              }), r.jsx("td", {
                className: `text-center px-1 py-1 ${S!==void 0&&S<.05?"text-emerald-300 font-bold":"text-muted-foreground"}`,
                children: S !== void 0 ? ue(S) : "—"
              }), r.jsx("td", {
                className: "text-center px-1 py-1 text-emerald-300",
                children: c.hitN
              }), r.jsx("td", {
                className: "text-center px-1 py-1 text-rose-300",
                children: c.missN
              }), r.jsx("td", {
                className: "px-1 py-1",
                children: r.jsxs("div", {
                  className: "flex flex-col gap-0.5",
                  children: [r.jsx(me, {
                    p25: c.hitP25,
                    p75: c.hitP75,
                    median: c.hitMedian,
                    lo: _,
                    hi: P,
                    color: "bg-emerald-500/60"
                  }), r.jsx(me, {
                    p25: c.missP25,
                    p75: c.missP75,
                    median: c.missMedian,
                    lo: _,
                    hi: P,
                    color: "bg-rose-500/60"
                  })]
                })
              }), r.jsx("td", {
                className: "text-center px-1 py-1",
                children: r.jsx("button", {
                  className: "text-[9px] px-1.5 py-0.5 rounded bg-primary/20 hover:bg-primary/30 text-primary disabled:opacity-30",
                  disabled: l.length >= 3 || l.some(E => E
                    .featureId === c.feature.id),
                  onClick: () => I(c.feature.id, c
                    .hitMedian),
                  title: l.length >= 3 ? "Max 3 filters" :
                    "Add this indicator as a filter",
                  children: "+ filter"
                })
              })]
            }, c.feature.id)
          })]
        })]
      })
    }), r.jsxs("div", {
      className: "border-t border-border/40 pt-3",
      children: [r.jsxs("div", {
        className: "flex items-center gap-2 mb-2",
        children: [r.jsx("span", {
          className: "text-xs font-bold text-foreground",
          children: "Filter sandbox"
        }), r.jsx("span", {
          className: "text-[10px] text-muted-foreground",
          children: "Stack up to 3 AND-rules. We require ALL rules to pass; signals where any feature is unavailable are dropped."
        })]
      }), l.length === 0 ? r.jsxs("div", {
        className: "text-[10px] text-muted-foreground italic",
        children: ["Click ", r.jsx("span", {
          className: "text-primary",
          children: "+ filter"
        }), " on any indicator above, or pick one to start:", r.jsxs("select", {
          className: "bg-background border border-border rounded ml-2 px-1 py-0.5",
          value: "",
          onChange: c => {
            const f = c.target.value;
            if (!f || !L.find(v => v.id === f)) return;
            const S = N.rows.find(v => v.feature.id === f);
            I(f, S?.hitMedian ?? 0)
          },
          children: [r.jsx("option", {
            value: "",
            children: "Choose indicator…"
          }), L.map(c => r.jsx("option", {
            value: c.id,
            children: c.label
          }, c.id))]
        })]
      }) : r.jsxs("div", {
        className: "space-y-2",
        children: [l.map((c, f) => {
          const p = L.find(v => v.id === c.featureId),
            S = N.rows.find(v => v.feature.id === c.featureId);
          return p ? r.jsxs("div", {
            className: "flex items-center gap-2 text-[10px] flex-wrap",
            children: [f > 0 && r.jsx("span", {
              className: "text-muted-foreground",
              children: "AND"
            }), r.jsx("select", {
              className: "bg-background border border-border rounded px-1 py-0.5",
              value: c.featureId,
              onChange: v => A(f, {
                featureId: v.target.value
              }),
              children: L.map(v => r.jsx("option", {
                value: v.id,
                children: v.label
              }, v.id))
            }), r.jsxs("select", {
              className: "bg-background border border-border rounded px-1 py-0.5",
              value: c.op,
              onChange: v => A(f, {
                op: v.target.value
              }),
              children: [r.jsx("option", {
                value: ">",
                children: W[">"]
              }), r.jsx("option", {
                value: "<",
                children: W["<"]
              }), r.jsx("option", {
                value: ">=",
                children: W[">="]
              }), r.jsx("option", {
                value: "<=",
                children: W["<="]
              })]
            }), r.jsx("input", {
              type: "number",
              step: "any",
              className: "bg-background border border-border rounded px-1 py-0.5 w-24 font-mono",
              value: c.threshold,
              onChange: v => A(f, {
                threshold: parseFloat(v.target.value)
              })
            }), r.jsxs("span", {
              className: "text-muted-foreground",
              children: ["(", p.format === "pct" ?
                "decimal — 0.05 = 5%" : p.format === "bp" ? "bp" :
                p.format === "z" ? "stdevs" : p.format ===
                "ratio" ? "× multiple" : "raw", ")"
              ]
            }), S && r.jsxs("span", {
              className: "text-muted-foreground",
              children: ["hit median ", $(S.hitMedian, p.format, p
                .decimals), " · miss median ", $(S.missMedian, p
                .format, p.decimals)]
            }), r.jsx("button", {
              className: "ml-auto text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300",
              onClick: () => R(f),
              children: "remove"
            })]
          }, f) : null
        }), b && r.jsxs("div", {
          className: "border-t border-border/30 pt-2 mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] font-mono",
          children: [r.jsxs("div", {
            children: [r.jsx("div", {
              className: "text-[9px] text-muted-foreground uppercase",
              children: "Retained"
            }), r.jsxs("div", {
              className: "text-foreground",
              children: [b.retained, " ", r.jsxs("span", {
                className: "text-muted-foreground",
                children: ["/ ", N.totalSignals]
              })]
            })]
          }), r.jsxs("div", {
            children: [r.jsx("div", {
              className: "text-[9px] text-muted-foreground uppercase",
              children: "Dropped"
            }), r.jsx("div", {
              className: "text-rose-300",
              children: b.dropped
            })]
          }), r.jsxs("div", {
            children: [r.jsx("div", {
              className: "text-[9px] text-muted-foreground uppercase",
              children: "Filtered hit rate"
            }), r.jsx("div", {
              className: Z(b.hitRate) + " font-bold",
              children: K(b.hitRate)
            })]
          }), r.jsxs("div", {
            children: [r.jsx("div", {
              className: "text-[9px] text-muted-foreground uppercase",
              children: "Base hit rate"
            }), r.jsx("div", {
              className: Z(b.baseHitRate),
              children: K(b.baseHitRate)
            })]
          }), r.jsxs("div", {
            children: [r.jsx("div", {
              className: "text-[9px] text-muted-foreground uppercase",
              children: "Lift"
            }), r.jsxs("div", {
              className: b.lift >= 1.2 ?
                "text-emerald-400 font-bold" : b.lift >= 1 ?
                "text-yellow-300" : "text-rose-300",
              children: [b.lift.toFixed(2), "×"]
            })]
          })]
        }), b && b.retained < 5 && r.jsxs("div", {
          className: "text-[10px] text-yellow-400 italic",
          children: ["⚠ Only ", b.retained,
            " signals retained — too few for any conclusion. Loosen the rule(s) or pick a coarser threshold."
          ]
        })]
      })]
    }), r.jsxs("details", {
      className: "text-[9px] text-muted-foreground",
      children: [r.jsx("summary", {
        className: "cursor-pointer",
        children: "Methodology"
      }), r.jsxs("ul", {
        className: "list-disc ml-4 mt-1 space-y-0.5",
        children: [r.jsxs("li", {
          children: [r.jsx("b", {
              children: "Look-ahead safe:"
            }),
            " every indicator reads only data up to and including the signal bar."
          ]
        }), r.jsxs("li", {
          children: [r.jsx("b", {
              children: "KS:"
            }),
            " two-sample Kolmogorov-Smirnov test statistic between hit and miss distributions, [0, 1]; bigger = more separation."
          ]
        }), r.jsxs("li", {
          children: [r.jsx("b", {
              children: "p:"
            }), " two-sided asymptotic KS p-value. ", r.jsx("b", {
              children: "q:"
            }),
            " Benjamini-Hochberg adjusted (FDR) — controls for testing many features at once."
          ]
        }), r.jsxs("li", {
          children: [r.jsx("b", {
              children: "AUC:"
            }),
            " probability a random hit's value exceeds a random miss's value. 0.5 = no info, ≥0.7 or ≤0.3 is meaningful."
          ]
        }), r.jsxs("li", {
          children: [r.jsx("b", {
              children: "|d|:"
            }),
            " Cohen's d (pooled) — standardized median spread; rough effect-size guide: 0.2 small, 0.5 medium, 0.8 large."
          ]
        }), r.jsxs("li", {
          children: [r.jsx("b", {
              children: "Distribution bar:"
            }),
            " P25–P75 box with median tick. Green = hits, red = misses."]
        }), r.jsxs("li", {
          children: [r.jsx("b", {
              children: "Sample sizes:"
            }),
            ' n < 10 makes any "100% hit rate" filter unreliable. Default sort penalises tiny samples (KS × √min(n)).'
          ]
        })]
      })]
    })]
  })
}
const qe = ["P/FFO FY2", "FFO Yield FY2", "Dividend Yield", "EV/EBITDA FY2", "FY1 EPS Growth",
    "FY2 FFO Growth", "FFO FY2", "% off 52wk High", "% off 52wk Low", "Short Interest%",
    "Buy Ratings", "Hold Ratings", "Sell Ratings", "Bull%", "Bear%"
  ],
  X = ["DGS10", "DGS2", "SPREAD_10Y_2Y", "BAMLC0A0CM", "BAMLH0A0HYM2", "VIXCLS", "DFII10",
  "T10YIE"];

function he(e, t) {
  const n = new Map;
  for (const o of e) Number.isFinite(o.value) && n.set(o.time, o.value);
  const s = new Array(t.length).fill(null);
  let a = null;
  for (let o = 0; o < t.length; o++) {
    const d = n.get(t[o]);
    d !== void 0 && (a = d), s[o] = a
  }
  return s
}

function Ve(e, t) {
  return he(e, t)
}

function rt({
  ticker: e,
  priceContext: t,
  signals: n,
  defaultHorizon: s = "1M",
  useBand: a = !1,
  direction: o = "buy",
  title: d
}) {
  const [m, u] = k.useState(null), [i, l] = k.useState(null), [x, F] = k.useState("Loading…");
  return k.useEffect(() => {
    let y = !1;
    return (async () => {
      try {
        F("Loading fundamentals…");
        const g = {},
          j = t.mode === "pair" && t.pairLegA ? t.pairLegA : e,
          N = await Promise.all(qe.map(async h => {
            try {
              const w = await ge(j, h);
              return [h, he(w, t.dates)]
            } catch {
              return [h, new Array(t.dates.length).fill(null)]
            }
          }));
        if (y) return;
        for (const [h, w] of N) g[h] = w;
        F("Loading macro series…");
        const b = {};
        try {
          const h = await be(X);
          if (y) return;
          for (const w of X) {
            const A = h[w]?.data ?? [];
            b[w] = Ve(A.map(R => ({
              time: R.time,
              value: R.value
            })), t.dates)
          }
        } catch {
          for (const w of X) b[w] = new Array(t.dates.length).fill(null)
        }
        if (y) return;
        u({
          prices: t.prices,
          highs: t.highs,
          lows: t.lows,
          volumes: t.volumes ?? null,
          dates: t.dates,
          benchmarkPrices: t.benchmarkPrices,
          fundamentals: g,
          macro: b
        })
      } catch (g) {
        y || l(String(g.message ?? g))
      }
    })(), () => {
      y = !0
    }
  }, [e, t]), i ? r.jsx("div", {
    className: "border border-red-500/30 rounded p-2 bg-red-500/5 mt-2",
    children: r.jsxs("div", {
      className: "text-[10px] text-red-300 font-mono",
      children: ["Hit Conditions failed to load: ", i]
    })
  }) : m ? r.jsx(ze, {
    signals: n,
    context: m,
    defaultHorizon: s,
    useBand: a,
    direction: o,
    title: d
  }) : r.jsx("div", {
    className: "border border-border/30 rounded p-2 bg-card/30 mt-2",
    children: r.jsxs("div", {
      className: "text-[10px] text-muted-foreground font-mono",
      children: ["Hit Conditions \\u2014 ", x]
    })
  })
}

function nt(e, t, n, s, a = .05, o = 0, d, m = "1M") {
  const u = s === "long" ? "buy" : "sell",
    i = [],
    l = [],
    x = [];
  let F = -1;
  for (const h of n) {
    if (o > 0 && F >= 0 && h < F + o) continue;
    const w = ye(e, h, a, u, null, o, d);
    i.push(w), l.push(t[h] ?? ""), x.push(e[h]), F = h
  }
  const y = je(i, u),
    g = T.map(({
      label: h
    }) => {
      const A = i.filter(c => c.returns[h] !== null).length,
        R = y.avgReturn[h],
        I = y.stdReturn[h],
        C = A > 1 && I > 0 ? R / (I / Math.sqrt(A)) : 0;
      return {
        horizon: h,
        count: A,
        hitRate: y.hitRate[h],
        winRate: y.winRate[h],
        avgReturn: R,
        medianReturn: y.medianReturn[h],
        stdReturn: I,
        tStat: C,
        avgTrough: y.avgTrough[h]
      }
    }),
    j = [];
  let N = 0;
  for (let h = 0; h < i.length; h++) {
    const w = i[h].returns[m];
    if (w == null) continue;
    const A = s === "long" ? w : -w;
    N += A, j.push({
      date: l[h] ?? "",
      cumReturn: N
    })
  }
  const b = i.map((h, w) => ({
    num: w + 1,
    date: l[w] ?? "",
    entryPrice: x[w],
    returns: {
      ...h.returns
    },
    hitTarget: {
      ...h.hitTarget
    }
  }));
  return {
    count: i.length,
    rows: g,
    equityCurve: j,
    signalCount: i.length,
    firstSignalDate: l[0] ?? null,
    lastSignalDate: l[l.length - 1] ?? null,
    signals: b,
    profiles: i
  }
}

function Y(e, t = 1) {
  return Number.isFinite(e) ? `${(e*100).toFixed(t)}%` : "—"
}

function $e(e) {
  return Number.isFinite(e) ? e.toFixed(2) : "—"
}

function We({
  value: e
}) {
  let t = "bg-red-500/15 text-red-300 border-red-500/30";
  return e >= .55 ? t = "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : e >= .4 && (t =
    "bg-amber-500/15 text-amber-300 border-amber-500/30"), r.jsx("span", {
    className: `inline-block px-1.5 py-0.5 text-[10px] rounded border ${t}`,
    children: Y(e, 0)
  })
}

function Ge({
  value: e
}) {
  const t = Math.abs(e);
  let n = "text-muted-foreground";
  return t >= 2 ? n = "text-emerald-400 font-semibold" : t >= 1.5 && (n = "text-amber-300"), r.jsx(
    "span", {
      className: n,
      children: $e(e)
    })
}

function Ue(e, t = 5) {
  if (!isFinite(e) || e <= 0) return 1;
  const n = e / t,
    s = Math.pow(10, Math.floor(Math.log10(n))),
    a = n / s;
  let o;
  return a < 1.5 ? o = 1 : a < 3 ? o = 2 : a < 7 ? o = 5 : o = 10, o * s
}

function Ke({
  result: e
}) {
  const t = k.useRef(null),
    [n, s] = k.useState(720);
  k.useEffect(() => {
    if (!t.current) return;
    const c = t.current,
      f = new ResizeObserver(() => {
        const p = c.clientWidth;
        p > 0 && s(p)
      });
    return f.observe(c), s(c.clientWidth || 720), () => f.disconnect()
  }, []);
  const a = e.equityCurve,
    o = k.useMemo(() => {
      const c = Math.max(320, Math.floor(n)),
        f = 220,
        p = 52,
        S = 16,
        v = 14,
        _ = 28,
        P = c - p - S,
        E = f - v - _,
        H = a.map(D => D.cumReturn),
        Q = Math.min(0, ...H.length ? H : [0]),
        J = Math.max(0, ...H.length ? H : [0]),
        ee = (J - Q || .01) * .08,
        O = Q - ee,
        G = J + ee,
        te = G - O || 1,
        fe = D => a.length <= 1 ? p + P / 2 : p + D / (a.length - 1) * P,
        pe = D => v + E - (D - O) / te * E,
        U = Ue(te, 5),
        xe = Math.ceil(O / U) * U,
        re = [];
      for (let D = xe; D <= G + 1e-9; D += U) re.push(Number(D.toFixed(10)));
      return {
        W: c,
        H: f,
        padL: p,
        padR: S,
        padT: v,
        padB: _,
        innerW: P,
        innerH: E,
        xToPx: fe,
        yToPx: pe,
        yTicks: re,
        yLo: O,
        yHi: G
      }
    }, [n, a]);
  if (a.length < 1) return r.jsx("div", {
    ref: t,
    className: "h-[220px] flex items-center justify-center text-xs text-muted-foreground",
    children: "Not enough signals to plot equity curve."
  });
  const {
    W: d,
    H: m,
    padL: u,
    padR: i,
    padT: l,
    padB: x,
    innerW: F,
    innerH: y,
    xToPx: g,
    yToPx: j,
    yTicks: N
  } = o, b = a.map((c, f) => `${f===0?"M":"L"}${g(f)},${j(c.cumReturn)}`).join(" "), h = a[a
      .length - 1].cumReturn, w = h >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)", A = h >= 0 ?
    "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)", R = j(0), I =
    `${a.map((f,p)=>`${p===0?"M":"L"}${g(p)},${j(f.cumReturn)}`).join(" ")} L${g(a.length-1)},${R} L${g(0)},${R} Z`,
    C = (() => {
      if (a.length <= 1) return [0];
      const c = Math.min(5, a.length),
        f = new Set;
      for (let p = 0; p < c; p++) f.add(Math.round(p / (c - 1) * (a.length - 1)));
      return Array.from(f).sort((p, S) => p - S)
    })();
  return r.jsx("div", {
    ref: t,
    className: "w-full",
    children: r.jsxs("svg", {
      viewBox: `0 0 ${d} ${m}`,
      width: d,
      height: m,
      className: "block",
      style: {
        maxWidth: "100%"
      },
      children: [N.map((c, f) => {
        const p = j(c),
          S = Math.abs(c) < 1e-9;
        return r.jsxs("g", {
          children: [r.jsx("line", {
            x1: u,
            x2: d - i,
            y1: p,
            y2: p,
            stroke: S ? "rgb(113 113 122)" : "rgb(63 63 70)",
            strokeWidth: S ? 1 : .6,
            strokeDasharray: S ? void 0 : "2,3"
          }), r.jsx("text", {
            x: u - 6,
            y: p + 3,
            textAnchor: "end",
            fontSize: 10,
            fill: "rgb(161 161 170)",
            fontFamily: "ui-monospace,monospace",
            children: Y(c, 0)
          })]
        }, `y-${f}`)
      }), r.jsx("line", {
        x1: u,
        x2: d - i,
        y1: l + y,
        y2: l + y,
        stroke: "rgb(82 82 91)",
        strokeWidth: .8
      }), C.map(c => {
        const f = g(c),
          p = c === a.length - 1,
          v = c === 0 ? "start" : p ? "end" : "middle";
        return r.jsx("text", {
          x: f,
          y: l + y + 16,
          textAnchor: v,
          fontSize: 10,
          fill: "rgb(161 161 170)",
          fontFamily: "ui-monospace,monospace",
          children: a[c].date
        }, `x-${c}`)
      }), r.jsx("path", {
        d: I,
        fill: A,
        stroke: "none"
      }), r.jsx("path", {
        d: b,
        fill: "none",
        stroke: w,
        strokeWidth: 1.6,
        strokeLinejoin: "round",
        strokeLinecap: "round"
      }), a.length <= 80 && a.map((c, f) => r.jsx("circle", {
        cx: g(f),
        cy: j(c.cumReturn),
        r: 1.8,
        fill: w
      }, `d-${f}`)), r.jsxs("text", {
        x: d - i,
        y: l,
        textAnchor: "end",
        fontSize: 11,
        fill: w,
        fontFamily: "ui-monospace,monospace",
        fontWeight: 600,
        children: ["cum ", Y(h, 1), " · n=", a.length]
      })]
    })
  })
}

function Ze({
  rows: e
}) {
  return r.jsx("div", {
    className: "overflow-x-auto",
    children: r.jsxs("table", {
      className: "w-full text-xs",
      children: [r.jsx("thead", {
        children: r.jsxs("tr", {
          className: "text-muted-foreground border-b border-border",
          children: [r.jsx("th", {
            className: "text-left px-2 py-1 font-medium",
            children: "Horizon"
          }), r.jsx("th", {
            className: "text-right px-2 py-1 font-medium",
            children: "N"
          }), r.jsx("th", {
            className: "text-right px-2 py-1 font-medium",
            title: "% of signals reaching the target return threshold within the horizon",
            children: "Hit"
          }), r.jsx("th", {
            className: "text-right px-2 py-1 font-medium",
            title: "% of signals with positive directional endpoint return",
            children: "Win"
          }), r.jsx("th", {
            className: "text-right px-2 py-1 font-medium",
            children: "Avg"
          }), r.jsx("th", {
            className: "text-right px-2 py-1 font-medium",
            children: "Median"
          }), r.jsx("th", {
            className: "text-right px-2 py-1 font-medium",
            title: "Std-dev of endpoint returns",
            children: "Std"
          }), r.jsx("th", {
            className: "text-right px-2 py-1 font-medium",
            title: "t-stat = avg / (std / sqrt(n)). |t|≥2 ≈ 95% significance.",
            children: "t"
          }), r.jsx("th", {
            className: "text-right px-2 py-1 font-medium",
            title: "Average max drawdown (trough) within the horizon",
            children: "Max DD"
          })]
        })
      }), r.jsx("tbody", {
        children: e.map(t => r.jsxs("tr", {
          className: "border-b border-border/50",
          children: [r.jsx("td", {
            className: "px-2 py-1 font-mono text-foreground",
            children: t.horizon
          }), r.jsx("td", {
            className: "text-right px-2 py-1 font-mono text-muted-foreground",
            children: t.count
          }), r.jsx("td", {
            className: "text-right px-2 py-1",
            children: r.jsx(We, {
              value: t.hitRate
            })
          }), r.jsx("td", {
            className: "text-right px-2 py-1 font-mono",
            children: Y(t.winRate, 0)
          }), r.jsx("td", {
            className: `text-right px-2 py-1 font-mono ${t.avgReturn>=0?"text-emerald-300":"text-red-300"}`,
            children: Y(t.avgReturn)
          }), r.jsx("td", {
            className: `text-right px-2 py-1 font-mono ${t.medianReturn>=0?"text-emerald-300/80":"text-red-300/80"}`,
            children: Y(t.medianReturn)
          }), r.jsx("td", {
            className: "text-right px-2 py-1 font-mono text-muted-foreground",
            children: Y(t.stdReturn, 1)
          }), r.jsx("td", {
            className: "text-right px-2 py-1 font-mono",
            children: r.jsx(Ge, {
              value: t.tStat
            })
          }), r.jsx("td", {
            className: "text-right px-2 py-1 font-mono text-red-300/80",
            children: Y(t.avgTrough)
          })]
        }, t.horizon))
      })]
    })
  })
}

function st({
  result: e,
  loading: t,
  setupLabel: n,
  tickerLabel: s
}) {
  return t ? r.jsx("div", {
    className: "bg-card border border-border rounded p-4 text-sm text-muted-foreground",
    children: "Evaluating setup…"
  }) : e ? e.signalCount === 0 ? r.jsxs("div", {
    className: "bg-card border border-border rounded p-4 text-xs",
    children: [r.jsx("div", {
      className: "text-foreground font-medium mb-1",
      children: "No signals fired"
    }), r.jsxs("div", {
      className: "text-muted-foreground",
      children: ["The setup ", r.jsx("span", {
          className: "font-mono text-amber-300",
          children: n
        }), " produced 0 signals on ", r.jsx("span", {
          className: "font-mono",
          children: s
        }),
        " across the available history. Try relaxing parameters or pick a different ticker."
      ]
    })]
  }) : r.jsxs("div", {
    className: "space-y-3",
    children: [r.jsxs("div", {
      className: "bg-card border border-border rounded p-3",
      children: [r.jsxs("div", {
        className: "flex items-baseline justify-between gap-3 mb-2",
        children: [r.jsxs("div", {
          children: [r.jsx("div", {
            className: "text-xs text-muted-foreground",
            children: "Setup"
          }), r.jsx("div", {
            className: "text-sm font-semibold text-foreground font-mono",
            children: n
          })]
        }), r.jsxs("div", {
          className: "text-right",
          children: [r.jsx("div", {
            className: "text-xs text-muted-foreground",
            children: "Instrument"
          }), r.jsx("div", {
            className: "text-sm font-semibold text-foreground font-mono",
            children: s
          })]
        }), r.jsxs("div", {
          className: "text-right",
          children: [r.jsx("div", {
            className: "text-xs text-muted-foreground",
            children: "Signals"
          }), r.jsx("div", {
            className: "text-sm font-semibold text-foreground font-mono",
            children: e.signalCount
          })]
        }), r.jsxs("div", {
          className: "text-right",
          children: [r.jsx("div", {
            className: "text-xs text-muted-foreground",
            children: "Window"
          }), r.jsxs("div", {
            className: "text-xs text-foreground font-mono",
            children: [e.firstSignalDate ?? "—", " → ", e
              .lastSignalDate ?? "—"
            ]
          })]
        })]
      }), r.jsx(Ze, {
        rows: e.rows
      })]
    }), r.jsxs("div", {
      className: "bg-card border border-border rounded p-3",
      children: [r.jsx("div", {
        className: "text-xs text-muted-foreground mb-2",
        children: "Equity curve (cumulative 1M return per signal, direction-adjusted)"
      }), r.jsx(Ke, {
        result: e
      })]
    }), r.jsx(Xe, {
      signals: e.signals
    })]
  }) : r.jsxs("div", {
    className: "bg-card border border-border rounded p-4 text-xs text-muted-foreground",
    children: ["Configure your indicator parameters above and click ", r.jsx("span", {
      className: "font-semibold text-foreground",
      children: "Evaluate"
    }), " to see hit rate, average return, and signal count for this exact setup."]
  })
}

function Xe({
  signals: e
}) {
  const [t, n] = k.useState(!1), [s, a] = k.useState("date"), [o, d] = k.useState("asc"), m = k
    .useMemo(() => {
      const l = [...e];
      return l.sort((x, F) => {
        let y, g;
        return s === "date" ? (y = x.num, g = F.num) : (y = x.returns[s] ?? -1 / 0, g = F
          .returns[s] ?? -1 / 0), o === "asc" ? y - g : g - y
      }), l
    }, [e, s, o]);

  function u(l) {
    s === l ? d(o === "asc" ? "desc" : "asc") : (a(l), d(l === "date" ? "asc" : "desc"))
  }

  function i() {
    const l = ["#", "date", "entry", ...T.map(j => j.label), ...T.map(j => `${j.label}_hit`)].join(
        ","),
      x = e.map(j => {
        const N = [String(j.num), j.date, j.entryPrice.toFixed(4)];
        for (const {
            label: b
          }
          of T) {
          const h = j.returns[b];
          N.push(h == null ? "" : (h * 100).toFixed(4))
        }
        for (const {
            label: b
          }
          of T) N.push(j.hitTarget[b] ? "1" : "0");
        return N.join(",")
      }),
      F = [l, ...x].join(`
`),
      y = new Blob([F], {
        type: "text/csv;charset=utf-8"
      }),
      g = document.createElement("a");
    g.href = URL.createObjectURL(y), g.download =
      `signals_${new Date().toISOString().slice(0,10)}.csv`, g.click(), URL.revokeObjectURL(g.href)
  }
  return e.length === 0 ? null : r.jsxs("div", {
    className: "bg-card border border-border rounded",
    children: [r.jsxs("button", {
      type: "button",
      onClick: () => n(l => !l),
      className: "w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-accent/30 transition-colors",
      "data-testid": "toggle-signal-detail",
      children: [r.jsxs("span", {
        className: "font-medium text-foreground",
        children: [r.jsx("span", {
            className: "font-mono mr-2",
            children: t ? "▼" : "▶"
          }), "Per-signal detail · ", e.length, " signal", e.length === 1 ? "" :
          "s"
        ]
      }), r.jsx("span", {
        className: "text-muted-foreground",
        children: t ? "hide" : "show entry dates and forward returns"
      })]
    }), t && r.jsxs("div", {
      className: "border-t border-border p-3",
      children: [r.jsxs("div", {
        className: "flex justify-between items-center mb-2",
        children: [r.jsx("div", {
          className: "text-[10px] text-muted-foreground",
          children: "Each row is one signal. Cells are endpoint returns at each horizon — green dot indicates the +/− target was touched intra-window."
        }), r.jsx("button", {
          type: "button",
          onClick: i,
          className: "text-[10px] font-mono px-2 py-1 rounded border border-border hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors",
          children: "Download CSV"
        })]
      }), r.jsx("div", {
        className: "overflow-x-auto max-h-[420px]",
        children: r.jsxs("table", {
          className: "w-full text-[11px] font-mono",
          children: [r.jsx("thead", {
            className: "sticky top-0 bg-card",
            children: r.jsxs("tr", {
              className: "text-muted-foreground border-b border-border",
              children: [r.jsxs("th", {
                className: "text-right px-2 py-1 cursor-pointer hover:text-foreground",
                onClick: () => u("date"),
                children: ["#", s === "date" ? o === "asc" ?
                  " ↑" : " ↓" : ""
                ]
              }), r.jsx("th", {
                className: "text-left px-2 py-1",
                children: "Date"
              }), r.jsx("th", {
                className: "text-right px-2 py-1",
                children: "Entry"
              }), T.map(l => r.jsxs("th", {
                className: "text-right px-2 py-1 cursor-pointer hover:text-foreground",
                onClick: () => u(l.label),
                title: `Endpoint return at ${l.days} trading days. Click to sort.`,
                children: [l.label, s === l.label ? o ===
                  "asc" ? " ↑" : " ↓" : ""
                ]
              }, l.label))]
            })
          }), r.jsx("tbody", {
            children: m.map(l => r.jsxs("tr", {
              className: "border-b border-border/40 hover:bg-accent/20",
              children: [r.jsx("td", {
                className: "text-right px-2 py-1 text-muted-foreground",
                children: l.num
              }), r.jsx("td", {
                className: "text-left px-2 py-1 text-foreground",
                children: l.date
              }), r.jsx("td", {
                className: "text-right px-2 py-1 text-muted-foreground",
                children: l.entryPrice.toFixed(2)
              }), T.map(x => {
                const F = l.returns[x.label],
                  y = l.hitTarget[x.label];
                if (F == null) return r.jsx("td", {
                  className: "text-right px-2 py-1 text-muted-foreground/40",
                  children: "—"
                }, x.label);
                const g = F >= 0 ? "text-emerald-300" :
                  "text-red-300";
                return r.jsxs("td", {
                  className: "text-right px-2 py-1",
                  children: [r.jsx("span", {
                    className: g,
                    children: (F >= 0 ? "+" : "") +
                      (F * 100).toFixed(2) + "%"
                  }), y && r.jsx("span", {
                    className: "ml-1 text-emerald-400",
                    title: "Target hit intra-window",
                    children: "●"
                  })]
                }, x.label)
              })]
            }, l.num))
          })]
        })
      })]
    })]
  })
}
export {
  st as E, rt as H, nt as e
};