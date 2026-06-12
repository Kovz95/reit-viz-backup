import {
  r as g,
  cJ as ne,
  j as e,
  ah as Z,
  B as ae,
  X as de,
  a4 as xe,
  aj as Ie,
  b as ze,
  bR as Re,
  o as W,
  p as Y,
  q as J,
  t as X,
  v as O,
  I as ge,
  bs as Te,
  E as be,
  bC as je,
  af as qe
} from "./index-CsG73Aq_.js";
import {
  T as He,
  a as De,
  b as me
} from "./tabs-BmZfssP0.js";
import {
  a as Ne,
  s as ve,
  f as ye
} from "./pairSignalAnalyzer-DF9nOwTp.js";
import {
  P as Ve
} from "./play-D7mVvggU.js";
const ee = 60;

function Ee(s, l) {
  const o = new Array(s.length).fill(null);
  for (let a = l - 1; a < s.length; a++) {
    let r = 0,
      t = 0,
      d = 0;
    for (let N = a - l + 1; N <= a; N++) {
      const m = s[N];
      if (m == null || !isFinite(m)) {
        d = 0;
        break
      }
      r += m, t += m * m, d++
    }
    if (d !== l) continue;
    const n = r / l,
      h = Math.max(0, t / l - n * n),
      p = Math.sqrt(h),
      c = s[a];
    o[a] = p === 0 ? 0 : (c - n) / p
  }
  return o
}

function Oe(s, l) {
  const o = new Array(s.length).fill(null);
  let a = 0;
  for (let r = 0; r < s.length; r++) a += s[r], r >= l && (a -= s[r - l]), r >= l - 1 && (o[r] = a /
    l);
  return o
}

function Ue(s, l = 14) {
  const o = new Array(s.length).fill(null);
  if (s.length < l + 1) return o;
  let a = 0,
    r = 0;
  for (let t = 1; t <= l; t++) {
    const d = s[t] - s[t - 1];
    d >= 0 ? a += d : r -= d
  }
  a /= l, r /= l, o[l] = r === 0 ? 100 : 100 - 100 / (1 + a / r);
  for (let t = l + 1; t < s.length; t++) {
    const d = s[t] - s[t - 1],
      n = d > 0 ? d : 0,
      h = d < 0 ? -d : 0;
    a = (a * (l - 1) + n) / l, r = (r * (l - 1) + h) / l, o[t] = r === 0 ? 100 : 100 - 100 / (1 +
      a / r)
  }
  return o
}

function Ge(s) {
  const l = new Array(s.length).fill(null),
    o = [];
  for (let a = 0; a < s.length; a++) {
    let r = 0,
      t = o.length;
    for (; r < t;) {
      const d = r + t >>> 1;
      o[d] <= s[a] ? r = d + 1 : t = d
    }
    o.splice(r, 0, s[a]), l[a] = (r + 1) / o.length * 100
  }
  return l
}

function Qe(s) {
  const l = [];
  for (const c of s) c != null && isFinite(c) && l.push(c);
  if (l.length < 60) return null;
  const o = l.slice(0, -1),
    a = l.slice(1),
    r = o.length,
    t = o.reduce((c, N) => c + N, 0) / r,
    d = a.reduce((c, N) => c + N, 0) / r;
  let n = 0,
    h = 0;
  for (let c = 0; c < r; c++) n += (o[c] - t) * (a[c] - d), h += (o[c] - t) * (o[c] - t);
  const p = h === 0 ? 0 : n / h;
  return p <= 0 || p >= 1 ? null : -Math.log(2) / Math.log(p)
}
const Ze = [
    [-1 / 0, -2.5, "z ≤ −2.5"],
    [-2.5, -2, "−2.5 < z ≤ −2.0"],
    [-2, -1.5, "−2.0 < z ≤ −1.5"],
    [-1.5, -1, "−1.5 < z ≤ −1.0"],
    [-1, -.5, "−1.0 < z ≤ −0.5"],
    [-.5, .5, "−0.5 < z ≤ +0.5"],
    [.5, 1, "+0.5 < z ≤ +1.0"],
    [1, 1.5, "+1.0 < z ≤ +1.5"],
    [1.5, 2, "+1.5 < z ≤ +2.0"],
    [2, 2.5, "+2.0 < z ≤ +2.5"],
    [2.5, 1 / 0, "z > +2.5"]
  ],
  Ke = [
    [-1 / 0, -30, "≤ −30%"],
    [-30, -20, "−30% to −20%"],
    [-20, -10, "−20% to −10%"],
    [-10, -5, "−10% to −5%"],
    [-5, 0, "−5% to 0%"],
    [0, 5, "0% to +5%"],
    [5, 10, "+5% to +10%"],
    [10, 20, "+10% to +20%"],
    [20, 30, "+20% to +30%"],
    [30, 1 / 0, "≥ +30%"]
  ],
  We = [
    [0, 20, "0–20 (extreme oversold)"],
    [20, 30, "20–30 (oversold)"],
    [30, 40, "30–40 (weak)"],
    [40, 50, "40–50 (mild weak)"],
    [50, 60, "50–60 (mild strong)"],
    [60, 70, "60–70 (strong)"],
    [70, 80, "70–80 (overbought)"],
    [80, 100.0001, "80–100 (extreme overbought)"]
  ],
  Ye = [
    [0, 5, "0–5 pct"],
    [5, 10, "5–10 pct"],
    [10, 25, "10–25 pct"],
    [25, 40, "25–40 pct"],
    [40, 60, "40–60 pct"],
    [60, 75, "60–75 pct"],
    [75, 90, "75–90 pct"],
    [90, 95, "90–95 pct"],
    [95, 100.0001, "95–100 pct"]
  ],
  Je = [5, 10, 20, 60];

function te(s, l, o, a) {
  const r = [],
    t = o.length;
  for (const [d, n, h] of a) {
    const p = [];
    for (let F = 0; F < t; F++) {
      const f = l[F];
      f != null && f >= d && f < n && p.push(F)
    }
    let c;
    d === -1 / 0 ? c = n - 5 : n === 1 / 0 ? c = d + 5 : c = (d + n) / 2;
    let N;
    s === "rsi14" || s === "pct" ? N = c > 50 : N = c > 0;
    const m = {
      signal: s,
      label: h,
      low: d,
      high: n,
      n: p.length,
      avg_5d: null,
      hit_5d: null,
      avg_10d: null,
      hit_10d: null,
      avg_20d: null,
      hit_20d: null,
      avg_60d: null,
      hit_60d: null,
      quality: 0,
      priceLevelLow: null,
      priceLevelHigh: null
    };
    for (const F of Je) {
      const f = [];
      for (const B of p) B + F >= t || o[B] <= 0 || f.push((o[B + F] - o[B]) / o[B] * 100);
      if (f.length === 0) continue;
      const L = f.reduce((B, u) => B + u, 0) / f.length,
        z = f.filter(B => B < 0 === N).length / f.length * 100;
      m[`avg_${F}d`] = L, m[`hit_${F}d`] = z
    }
    m.avg_20d != null && m.hit_20d != null && m.n >= 20 && (m.quality = Math.abs(m.avg_20d) * (m
      .hit_20d - 50) * Math.log10(m.n + 1) / 100), r.push(m)
  }
  return r
}

function ke(s, l) {
  const o = s.filter(u => u && u.value > 0 && isFinite(u.value));
  if (o.length < 250) return null;
  const a = o.map(u => u.value),
    r = a.map(u => Math.log(u)),
    t = o.map(u => u.time),
    d = a.length,
    n = d - 1,
    h = a[n],
    p = Ee(r, ee),
    c = Oe(a, 200),
    N = a.map((u, $) => c[$] != null && c[$] > 0 ? (u - c[$]) / c[$] * 100 : null),
    m = Ue(a, 14),
    F = Ge(a),
    f = {
      price_z: te("price_z", p, a, Ze),
      dist_200ma: te("dist_200ma", N, a, Ke),
      rsi14: te("rsi14", m, a, We),
      pct: te("pct", F, a, Ye)
    };
  if (p[n] != null) {
    const u = r.slice(n - ee + 1, n + 1),
      $ = u.reduce((P, C) => P + C, 0) / ee,
      b = u.reduce((P, C) => P + (C - $) ** 2, 0) / ee,
      j = Math.sqrt(b);
    for (const P of f.price_z) {
      const C = P.low === -1 / 0 ? -3.5 : P.low,
        R = P.high === 1 / 0 ? 3.5 : P.high;
      P.priceLevelLow = Math.exp($ + C * j), P.priceLevelHigh = Math.exp($ + R * j)
    }
  }
  if (N[n] != null && c[n] != null) {
    const u = c[n];
    for (const $ of f.dist_200ma) {
      const b = $.low === -1 / 0 ? -50 : $.low,
        j = $.high === 1 / 0 ? 60 : $.high;
      $.priceLevelLow = u * (1 + b / 100), $.priceLevelHigh = u * (1 + j / 100)
    }
  } {
    const u = [...a].sort((b, j) => b - j),
      $ = b => {
        if (b <= 0) return u[0];
        if (b >= 100) return u[u.length - 1];
        const j = b / 100 * (u.length - 1),
          P = Math.floor(j),
          C = Math.ceil(j);
        if (P === C) return u[P];
        const R = j - P;
        return u[P] * (1 - R) + u[C] * R
      };
    for (const b of f.pct) b.priceLevelLow = $(b.low), b.priceLevelHigh = $(Math.min(b.high, 100))
  }
  const L = [{
    signal: "price_z",
    value: p[n]
  }, {
    signal: "dist_200ma",
    value: N[n]
  }, {
    signal: "rsi14",
    value: m[n]
  }, {
    signal: "pct",
    value: F[n]
  }];
  let q = null,
    z = -1 / 0;
  for (const u of L) {
    if (u.value == null) continue;
    const b = f[u.signal].find(j => u.value >= j.low && u.value < j.high);
    if (b && !(b.n < 20 || b.avg_20d == null) && Math.abs(b.quality) > z) {
      z = Math.abs(b.quality);
      const j = b.avg_20d,
        P = h * (1 + j / 100),
        C = j > .3 ? "long" : j < -.3 ? "short" : "neutral",
        R = b.hit_20d ?? 50,
        K = R >= 55 ? "actionable edge" : R >= 50 ? "marginal edge" :
        "NO edge (coin-flip or worse — do not trade)";
      q = {
        signal: u.signal,
        bucket: b,
        currentSignalValue: u.value,
        direction: C,
        expectedMove20dPct: j,
        expectedPrice20d: P,
        rationale: `${re(u.signal)} = ${ie(u.signal,u.value)} sits in the "${b.label}" bucket. Historically, ${l} moved ${j>=0?"+":""}${j.toFixed(2)}% on average over the next 20 trading days (n=${b.n}, hit ${R.toFixed(0)}% reverting${we(u.signal)}). ${K}.`
      }
    }
  }
  const B = Qe(p);
  return {
    ticker: l,
    firstDate: t[0],
    lastDate: t[t.length - 1],
    n: d,
    currentPrice: h,
    currentSignals: L,
    buckets: f,
    bestNow: q,
    halfLifeDays: B,
    series: {
      price_z: {
        values: p
      },
      dist_200ma: {
        values: N
      },
      rsi14: {
        values: m
      },
      pct: {
        values: F
      }
    }
  }
}

function re(s) {
  switch (s) {
    case "price_z":
      return "Price z";
    case "dist_200ma":
      return "% from 200MA";
    case "rsi14":
      return "RSI(14)";
    case "pct":
      return "Percentile"
  }
}

function we(s) {
  return s === "rsi14" ? " toward 50" : s === "pct" ? " toward median" : " toward zero"
}

function ie(s, l) {
  return s === "rsi14" ? l.toFixed(1) : s === "pct" ? l.toFixed(0) : s === "dist_200ma" ?
    `${l>=0?"+":""}${l.toFixed(1)}%` : `${l>=0?"+":""}${l.toFixed(2)}`
}
const Xe = ["price_z", "dist_200ma", "rsi14", "pct"],
  pe = [{
    key: "5d",
    label: "5d"
  }, {
    key: "10d",
    label: "10d"
  }, {
    key: "20d",
    label: "20d"
  }, {
    key: "60d",
    label: "60d"
  }];

function et(s) {
  return s == null || !isFinite(s) ? "—" : `${s>=0?"+":""}${s.toFixed(2)}%`
}

function tt(s) {
  return s == null || !isFinite(s) ? "—" : `${s.toFixed(0)}%`
}

function fe(s) {
  return s == null || !isFinite(s) ? "—" : `$${s>=100,s.toFixed(2)}`
}

function st(s) {
  return s == null ? "text-muted-foreground" : s > .5 ? "text-emerald-400" : s < -.5 ?
    "text-rose-400" : "text-muted-foreground"
}

function lt(s) {
  return s == null ? "text-muted-foreground" : s >= 65 ? "text-emerald-400 font-semibold" : s >=
    55 ? "text-emerald-400/70" : s <= 35 ? "text-rose-400 font-semibold" : s <= 45 ?
    "text-rose-400/70" : "text-muted-foreground"
}

function nt({
  ticker: s,
  initialPrices: l,
  asFloating: o = !1,
  onClose: a
}) {
  const [r, t] = g.useState("price_z"), [d, n] = g.useState(null), [h, p] = g.useState(!1), [c, N] =
    g.useState(null);
  g.useEffect(() => {
    let f = !1;
    if (l && l.length >= 250) {
      n(l);
      return
    }
    return p(!0), N(null), ne(s).then(L => {
      if (f) return;
      const q = L.dates.map((z, B) => ({
        time: z,
        value: L.closes[B]
      })).filter(z => z.value > 0 && isFinite(z.value));
      n(q), p(!1)
    }).catch(L => {
      f || (N(String(L?.message || L)), p(!1))
    }), () => {
      f = !0
    }
  }, [s, l]);
  const m = g.useMemo(() => {
      if (!d || d.length < 250) return null;
      try {
        return ke(d, s)
      } catch (f) {
        return console.warn("[SingleSignalAnalyzer]", f), null
      }
    }, [d, s]),
    F = o ?
    "fixed top-16 right-4 z-40 w-[640px] max-w-[95vw] max-h-[80vh] flex flex-col bg-card border border-border rounded-lg shadow-2xl overflow-hidden" :
    "w-full h-full flex flex-col border border-border/30 min-h-0 overflow-hidden";
  return e.jsxs("div", {
    className: F,
    children: [e.jsxs("div", {
      className: "flex items-center gap-2 px-3 py-1.5 bg-card/80 border-b border-border/40 flex-shrink-0",
      children: [e.jsx(Z, {
        className: "w-3.5 h-3.5 text-amber-400"
      }), e.jsxs("span", {
        className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
        children: ["Predictive Signals — ", s]
      }), e.jsx("div", {
        className: "flex-1"
      }), o && a && e.jsx(ae, {
        variant: "ghost",
        size: "sm",
        className: "h-6 w-6 p-0",
        onClick: a,
        title: "Close",
        children: e.jsx(de, {
          className: "w-3.5 h-3.5"
        })
      })]
    }), e.jsxs("div", {
      className: "flex-1 min-h-0 overflow-auto p-3 space-y-3 text-xs",
      children: [h && e.jsxs("div", {
        className: "flex items-center justify-center py-8 text-muted-foreground text-xs",
        children: [e.jsx(xe, {
          className: "w-4 h-4 mr-2 animate-spin"
        }), "Loading ", s, " price history…"]
      }), c && e.jsx("div", {
        className: "text-rose-400 text-xs px-2 py-3 border border-rose-500/30 bg-rose-500/5 rounded",
        children: c
      }), !h && !c && !m && e.jsxs("div", {
        className: "text-muted-foreground text-xs px-2 py-3",
        children: ["Need at least 250 trading days of price history for ", s, "."]
      }), m && e.jsx(at, {
        result: m,
        activeSignal: r,
        setActiveSignal: t
      })]
    })]
  })
}

function at({
  result: s,
  activeSignal: l,
  setActiveSignal: o
}) {
  const a = s.bestNow,
    r = s.buckets[l],
    t = s.currentSignals.find(n => n.signal === l)?.value,
    d = r.findIndex(n => t != null && t >= n.low && t < n.high);
  return e.jsxs(e.Fragment, {
    children: [e.jsxs("div", {
      className: "grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]",
      children: [e.jsx(V, {
        label: "Ticker",
        value: s.ticker
      }), e.jsx(V, {
        label: "Price",
        value: `$${s.currentPrice.toFixed(2)}`
      }), e.jsx(V, {
        label: "Half-life",
        value: s.halfLifeDays ? `${s.halfLifeDays.toFixed(1)}d` : "—"
      }), e.jsx(V, {
        label: "Sample",
        value: `${s.n.toLocaleString()}d`
      })]
    }), a ? e.jsxs("div", {
      className: "rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2",
      children: [e.jsxs("div", {
        className: "flex items-center gap-2 text-amber-300",
        children: [e.jsx(Z, {
          className: "w-3.5 h-3.5"
        }), e.jsx("span", {
          className: "text-[11px] font-semibold uppercase tracking-wider",
          children: "Best signal right now"
        }), e.jsxs("span", {
          className: "text-[10px] text-muted-foreground ml-auto",
          children: ["quality ", a.bucket.quality.toFixed(2), " · n=", a
            .bucket.n
          ]
        })]
      }), e.jsxs("div", {
        className: "text-[12px] text-foreground/90 leading-snug",
        children: [a.bucket.label, " on ", e.jsx("span", {
          className: "font-semibold",
          children: re(a.signal)
        }), " ", "(", ie(a.signal, a.currentSignalValue), ")"]
      }), e.jsx("div", {
        className: "text-[11px] text-muted-foreground leading-snug",
        children: a.rationale
      }), e.jsxs("div", {
        className: "grid grid-cols-2 md:grid-cols-3 gap-2 mt-1 pt-2 border-t border-amber-500/20",
        children: [e.jsx(V, {
          label: "20d expected",
          value: `${a.expectedMove20dPct>=0?"+":""}${a.expectedMove20dPct.toFixed(2)}%`,
          valueClass: a.expectedMove20dPct < 0 ? "text-rose-400" :
            "text-emerald-400"
        }), e.jsx(V, {
          label: `${s.ticker} target`,
          value: `$${a.expectedPrice20d.toFixed(2)}`,
          valueClass: a.expectedMove20dPct < 0 ? "text-rose-400" :
            "text-emerald-400"
        }), e.jsx(V, {
          label: "Current price",
          value: `$${s.currentPrice.toFixed(2)}`
        })]
      }), e.jsx("div", {
        className: "text-[10px] text-muted-foreground/80 pt-1 border-t border-amber-500/10",
        children: a.direction === "short" ?
          `Setup: SHORT ${s.ticker} — price expected to fall toward $${a.expectedPrice20d.toFixed(2)}` :
          a.direction === "long" ?
          `Setup: LONG ${s.ticker} — price expected to rise toward $${a.expectedPrice20d.toFixed(2)}` :
          "No actionable bias — bucket is statistically flat."
      })]
    }) : e.jsx("div", {
      className: "rounded-md border border-border/40 bg-card/30 p-3 text-[11px] text-muted-foreground",
      children: "All four current signals sit in low-edge / neutral buckets. Wait for a stronger setup."
    }), e.jsx("div", {
      className: "flex items-center gap-1 flex-wrap pt-1",
      children: Xe.map(n => {
        const h = s.currentSignals.find(p => p.signal === n)?.value;
        return e.jsxs("button", {
          onClick: () => o(n),
          "data-testid": `btn-single-signal-${n}`,
          className: `px-2 py-1 rounded text-[10px] font-medium border transition-colors ${l===n?"bg-primary text-primary-foreground border-primary":"bg-card/30 text-muted-foreground border-border/40 hover:border-border"}`,
          children: [re(n), h != null && e.jsxs("span", {
            className: "ml-1.5 opacity-80",
            children: ["(", ie(n, h), ")"]
          })]
        }, n)
      })
    }), e.jsx("div", {
      className: "overflow-x-auto border border-border/30 rounded",
      children: e.jsxs("table", {
        className: "w-full text-[10px] font-mono",
        children: [e.jsx("thead", {
          className: "bg-card/40 text-muted-foreground",
          children: e.jsxs("tr", {
            children: [e.jsx("th", {
              className: "text-left px-2 py-1.5",
              children: "Bucket"
            }), e.jsx("th", {
              className: "text-right px-2 py-1.5",
              children: "n"
            }), pe.map(n => e.jsxs("th", {
              className: "text-right px-2 py-1.5",
              colSpan: 2,
              children: [n.label, " avg / hit"]
            }, n.key)), e.jsx("th", {
              className: "text-right px-2 py-1.5",
              children: "Price range"
            }), e.jsx("th", {
              className: "text-right px-2 py-1.5",
              title: "Quality = |20d avg| × (20d hit% − 50) × log10(n+1)/100",
              children: "Q"
            })]
          })
        }), e.jsx("tbody", {
          children: r.map((n, h) => {
            const p = h === d;
            return e.jsxs("tr", {
              className: `border-t border-border/20 ${p?"bg-amber-500/10":""}`,
              "data-testid": `single-signal-bucket-${l}-${h}`,
              children: [e.jsxs("td", {
                className: "px-2 py-1 text-foreground/90",
                children: [p && e.jsx("span", {
                  className: "text-amber-400 mr-1",
                  children: "▶"
                }), n.label]
              }), e.jsx("td", {
                className: `px-2 py-1 text-right ${n.n<20?"text-muted-foreground/50":"text-foreground/80"}`,
                children: n.n
              }), pe.map(c => e.jsx(rt, {
                avg: n[`avg_${c.key}`],
                hit: n[`hit_${c.key}`]
              }, c.key)), e.jsxs("td", {
                className: "px-2 py-1 text-right text-foreground/70",
                children: [fe(n.priceLevelLow), " – ", fe(n
                  .priceLevelHigh)]
              }), e.jsx("td", {
                className: `px-2 py-1 text-right ${n.quality>=1.5?"text-emerald-400 font-semibold":n.quality>=.5?"text-emerald-400/70":n.quality<=-.5?"text-rose-400/70":"text-muted-foreground"}`,
                children: n.quality.toFixed(2)
              })]
            }, n.label)
          })
        })]
      })
    }), e.jsxs("div", {
      className: "text-[9.5px] text-muted-foreground/70 leading-snug px-1",
      children: [e.jsx("span", {
          className: "font-semibold",
          children: "avg"
        }), " = mean forward % change in ", s.ticker, ".", " ", e.jsx("span", {
          className: "font-semibold",
          children: "hit"
        }), " = % of observations that reverted in the expected direction (", we(l)
        .trim(), ").", " ", e.jsx("span", {
          className: "font-semibold",
          children: "Q"
        }), " = quality score on the 20-day horizon.", " ", e.jsx("span", {
          className: "font-semibold",
          children: "Price range"
        }),
        ` = $ levels for this bucket given today's μ/σ (RSI buckets show "—" since RSI doesn't translate to a single price).`,
        " ", "Sample: ", s.firstDate, " → ", s.lastDate, "."
      ]
    })]
  })
}

function V({
  label: s,
  value: l,
  valueClass: o
}) {
  return e.jsxs("div", {
    className: "bg-card/30 border border-border/30 rounded px-2 py-1.5",
    children: [e.jsx("div", {
      className: "text-[9px] uppercase tracking-wider text-muted-foreground",
      children: s
    }), e.jsx("div", {
      className: `text-[12px] font-mono font-semibold ${o||"text-foreground"}`,
      children: l
    })]
  })
}

function rt({
  avg: s,
  hit: l
}) {
  return e.jsxs(e.Fragment, {
    children: [e.jsx("td", {
      className: `px-2 py-1 text-right ${st(s)}`,
      children: et(s)
    }), e.jsx("td", {
      className: `px-2 py-1 text-right ${lt(l)}`,
      children: tt(l)
    })]
  })
}
const se = {
  economy: "Economy",
  sector: "Sector",
  subsector: "Subsector",
  industryGroup: "Industry Group",
  industry: "Industry",
  subindustry: "Subindustry"
};

function gt() {
  const {
    baskets: s
  } = Ie(), {
      data: l
    } = ze({
      queryKey: ["tickers"],
      queryFn: qe,
      staleTime: 1 / 0
    }), [o, a] = g.useState("workbook"), [r, t] = g.useState(""), [d, n] = g.useState("industry"), [
      h, p
    ] = g.useState(""), [c, N] = g.useState("singles"), [m, F] = g.useState(!1), [f, L] = g
    .useState({
      done: 0,
      total: 0,
      currentTask: ""
    }), [q, z] = g.useState([]), [B, u] = g.useState([]), [$, b] = g.useState(null), j = g.useRef(!
      1), [P, C] = g.useState(null), [R, K] = g.useState(null), [U, Se] = g.useState({
      key: "quality",
      dir: -1
    }), [G, $e] = g.useState({
      key: "quality",
      dir: -1
    }), [H, Pe] = g.useState(20), [D, Fe] = g.useState(""), [Q, Le] = g.useState(!1), Be = g
    .useMemo(() => {
      if (!l) return [];
      const i = new Set;
      return l.forEach(S => {
        const x = S[d];
        x && i.add(x)
      }), Array.from(i).sort()
    }, [l, d]), A = g.useMemo(() => {
      if (!l) return [];
      if (o === "basket") {
        const i = s.find(S => S.id === r);
        return i ? i.tickers : []
      }
      return o === "classification" ? h ? l.filter(i => i[d] === h).map(i => i.ticker) : [] : l
        .map(i => i.ticker)
    }, [l, o, r, s, d, h]), Me = c === "singles" ? A.length : Math.max(0, A.length * (A.length -
      1) / 2), E = g.useMemo(() => {
      const i = new Map;
      if (l)
        for (const S of l) i.set(S.ticker, S[d] || "—");
      return i
    }, [l, d]);
  async function Ce() {
    if (A.length < 2 && c === "pairs") {
      b("Need at least 2 tickers in the universe to scan pairs.");
      return
    }
    if (A.length === 0) {
      b("Universe is empty — pick a basket / classification with tickers.");
      return
    }
    j.current = !1, F(!0), b(null), z([]), u([]), L({
      done: 0,
      total: 0,
      currentTask: "Loading prices…"
    });
    const i = 8,
      S = new Map;
    {
      let x = 0;
      const v = A.length;
      L({
        done: 0,
        total: v,
        currentTask: "Loading prices…"
      });
      const y = async () => {
        for (; x < v;) {
          if (j.current) return;
          const k = x++,
            _ = A[k];
          try {
            const M = await ne(_),
              w = M.dates.map((T, ce) => ({
                time: T,
                value: M.closes[ce]
              })).filter(T => T.value > 0 && isFinite(T.value));
            w.length >= 250 && S.set(_, w)
          } catch (M) {
            console.warn(`[Scanner] fetch failed for ${_}:`, M)
          }
          L(M => ({
            ...M,
            done: M.done + 1,
            currentTask: `Loading prices (${k+1}/${v}): ${_}`
          }))
        }
      };
      await Promise.all(Array.from({
        length: i
      }, () => y()))
    }
    if (j.current) {
      F(!1);
      return
    }
    if (c === "singles") {
      const x = [],
        v = Array.from(S.keys());
      L({
        done: 0,
        total: v.length,
        currentTask: "Analyzing tickers…"
      });
      for (let y = 0; y < v.length && !j.current; y++) {
        const k = v[y],
          _ = S.get(k),
          M = ke(_, k);
        if (M) {
          const w = M.bestNow;
          x.push({
            ticker: k,
            classification: E.get(k) || "—",
            currentPrice: M.currentPrice,
            bestSignal: w?.signal ?? null,
            bestSignalValue: w?.currentSignalValue ?? null,
            bestBucketLabel: w?.bucket.label ?? "—",
            direction: w?.direction ?? null,
            quality: w?.bucket.quality ?? 0,
            expectedMove20dPct: w?.expectedMove20dPct ?? null,
            expectedPrice20d: w?.expectedPrice20d ?? null,
            hit20d: w?.bucket.hit_20d ?? null,
            n: w?.bucket.n ?? 0,
            halfLifeDays: M.halfLifeDays
          })
        } else x.push({
          ticker: k,
          classification: E.get(k) || "—",
          currentPrice: _[_.length - 1].value,
          bestSignal: null,
          bestSignalValue: null,
          bestBucketLabel: "insufficient history (<250 bars)",
          direction: null,
          quality: 0,
          expectedMove20dPct: null,
          expectedPrice20d: null,
          hit20d: null,
          n: 0,
          halfLifeDays: null
        });
        if (M && !M.bestNow) {
          const w = x[x.length - 1];
          w.bestBucketLabel = "current buckets too small (n<20)"
        }
        y % 5 === 0 && (L({
          done: y + 1,
          total: v.length,
          currentTask: `Analyzing ${k}`
        }), await new Promise(w => setTimeout(w, 0)))
      }
      z(x)
    } else {
      const x = Array.from(S.keys()),
        v = x.length * (x.length - 1) / 2,
        y = [];
      L({
        done: 0,
        total: v,
        currentTask: "Analyzing pairs…"
      });
      let k = 0;
      for (let _ = 0; _ < x.length && !j.current; _++)
        for (let M = _ + 1; M < x.length && !j.current; M++) {
          const w = x[_],
            T = x[M],
            ce = S.get(w),
            _e = S.get(T),
            oe = Ne(ce, _e, w, T);
          if (oe) {
            const I = oe.bestNow;
            y.push({
              tickerA: w,
              tickerB: T,
              classA: E.get(w) || "—",
              classB: E.get(T) || "—",
              ratio: oe.currentRatio,
              bestSignal: I?.signal ?? null,
              bestSignalValue: I?.currentSignalValue ?? null,
              bestBucketLabel: I?.bucket.label ?? "current buckets too small (n<20)",
              direction: I?.direction ?? null,
              quality: I?.bucket.quality ?? 0,
              expectedMove20dPct: I?.expectedMove20dPct ?? null,
              expectedRatio20d: I?.expectedRatio20d ?? null,
              expectedAIfBFlat: I?.expectedAPrice20dIfBHolds ?? null,
              expectedBIfAFlat: I?.expectedBPrice20dIfAHolds ?? null,
              hit20d: I?.bucket.hit_20d ?? null,
              n: I?.bucket.n ?? 0
            })
          } else y.push({
            tickerA: w,
            tickerB: T,
            classA: E.get(w) || "—",
            classB: E.get(T) || "—",
            ratio: NaN,
            bestSignal: null,
            bestSignalValue: null,
            bestBucketLabel: "insufficient overlap (<250 bars)",
            direction: null,
            quality: 0,
            expectedMove20dPct: null,
            expectedRatio20d: null,
            expectedAIfBFlat: null,
            expectedBIfAFlat: null,
            hit20d: null,
            n: 0
          });
          k++, k % 50 === 0 && (L({
            done: k,
            total: v,
            currentTask: `${w}/${T} (${k}/${v})`
          }), await new Promise(I => setTimeout(I, 0)))
        }
      u(y)
    }
    F(!1), L(x => ({
      ...x,
      currentTask: "Done."
    }))
  }

  function Ae() {
    j.current = !0
  }
  const ue = g.useMemo(() => {
      let i = q.filter(x => Q ? x.bestSignal != null && x.n >= H : x.bestSignal == null || x.n >=
        H);
      if (D) {
        const x = D.toUpperCase();
        i = i.filter(v => v.ticker.includes(x) || v.classification.toUpperCase().includes(x))
      }
      const S = U.dir;
      return i.sort((x, v) => {
        const y = x[U.key],
          k = v[U.key];
        return y == null && k == null ? 0 : y == null ? 1 : k == null ? -1 : typeof y ==
          "string" ? S * y.localeCompare(k) : S * (y - k)
      }), i
    }, [q, U, H, D, Q]),
    he = g.useMemo(() => {
      let i = B.filter(x => Q ? x.bestSignal != null && x.n >= H : x.bestSignal == null || x.n >=
        H);
      if (D) {
        const x = D.toUpperCase();
        i = i.filter(v => v.tickerA.includes(x) || v.tickerB.includes(x) || v.classA.toUpperCase()
          .includes(x) || v.classB.toUpperCase().includes(x))
      }
      const S = G.dir;
      return i.sort((x, v) => {
        const y = x[G.key],
          k = v[G.key];
        return y == null && k == null ? 0 : y == null ? 1 : k == null ? -1 : typeof y ==
          "string" ? S * y.localeCompare(k) : S * (y - k)
      }), i
    }, [B, G, H, D, Q]);
  return e.jsxs("div", {
    className: "flex flex-col h-full overflow-hidden",
    children: [e.jsxs("div", {
      className: "flex flex-col gap-2 p-3 border-b border-border bg-card/30 flex-shrink-0",
      children: [e.jsxs("div", {
        className: "flex items-center gap-2 flex-wrap",
        children: [e.jsx(Z, {
          className: "w-4 h-4 text-amber-400"
        }), e.jsx("span", {
          className: "text-sm font-semibold",
          children: "Signal Scanner"
        }), e.jsx("span", {
          className: "text-[10px] text-muted-foreground",
          children: "Ranks the workbook by predictive-signal quality. Pairs and singles, mean-reversion edge."
        })]
      }), e.jsxs("div", {
        className: "flex items-center gap-2 flex-wrap",
        children: [e.jsx(He, {
          value: c,
          onValueChange: i => {
            m || N(i)
          },
          className: "inline-flex",
          children: e.jsxs(De, {
            className: "h-7",
            children: [e.jsx(me, {
              value: "singles",
              disabled: m,
              className: "text-[11px] px-3",
              children: "Singles"
            }), e.jsx(me, {
              value: "pairs",
              disabled: m,
              className: "text-[11px] px-3",
              children: "Pairs"
            })]
          })
        }), e.jsx("div", {
          className: "h-5 w-px bg-border mx-1"
        }), e.jsx(Re, {
          className: "w-3.5 h-3.5 text-muted-foreground"
        }), e.jsxs(W, {
          value: o,
          onValueChange: i => a(i),
          children: [e.jsx(Y, {
            className: "h-7 w-36 text-[11px]",
            children: e.jsx(J, {})
          }), e.jsxs(X, {
            children: [e.jsx(O, {
              value: "workbook",
              className: "text-[11px]",
              children: "Entire workbook"
            }), e.jsx(O, {
              value: "basket",
              className: "text-[11px]",
              children: "Basket…"
            }), e.jsx(O, {
              value: "classification",
              className: "text-[11px]",
              children: "Classification…"
            })]
          })]
        }), o === "basket" && e.jsxs(W, {
          value: r,
          onValueChange: t,
          children: [e.jsx(Y, {
            className: "h-7 w-40 text-[11px]",
            children: e.jsx(J, {
              placeholder: "Pick basket"
            })
          }), e.jsxs(X, {
            children: [s.map(i => e.jsxs(O, {
              value: i.id,
              className: "text-[11px]",
              children: [i.name, " (", i.tickers.length, ")"]
            }, i.id)), s.length === 0 && e.jsx("div", {
              className: "text-[11px] text-muted-foreground px-2 py-2",
              children: "No baskets saved yet"
            })]
          })]
        }), o === "classification" && e.jsxs(e.Fragment, {
          children: [e.jsxs(W, {
            value: d,
            onValueChange: i => {
              n(i), p("")
            },
            children: [e.jsx(Y, {
              className: "h-7 w-32 text-[11px]",
              children: e.jsx(J, {})
            }), e.jsx(X, {
              children: Object.keys(se).map(i => e.jsx(O, {
                value: i,
                className: "text-[11px]",
                children: se[i]
              }, i))
            })]
          }), e.jsxs(W, {
            value: h,
            onValueChange: p,
            children: [e.jsx(Y, {
              className: "h-7 w-44 text-[11px]",
              children: e.jsx(J, {
                placeholder: `Pick ${se[d]}`
              })
            }), e.jsx(X, {
              children: Be.map(i => e.jsx(O, {
                value: i,
                className: "text-[11px]",
                children: i
              }, i))
            })]
          })]
        }), e.jsxs("span", {
          className: "text-[10px] text-muted-foreground",
          children: ["Universe: ", e.jsx("span", {
            className: `font-mono ${A.length===0?"text-rose-400":"text-foreground"}`,
            children: A.length
          }), " tickers", c === "pairs" && e.jsxs(e.Fragment, {
            children: [" · ", e.jsx("span", {
              className: "font-mono text-foreground",
              children: Me.toLocaleString()
            }), " pairs"]
          }), A.length === 0 && e.jsx("span", {
            className: "ml-2 text-rose-400",
            children: o === "basket" ? "— pick a basket above" : o ===
              "classification" ? `— pick a ${se[d]}` :
              "— workbook is empty"
          }), c === "pairs" && A.length === 1 && e.jsx("span", {
            className: "ml-2 text-amber-400",
            children: "— need 2+ tickers for pairs"
          })]
        }), e.jsx("div", {
          className: "flex-1"
        }), m ? e.jsxs(ae, {
          size: "sm",
          variant: "destructive",
          className: "h-7 text-[11px]",
          onClick: Ae,
          "data-testid": "btn-cancel",
          children: [e.jsx(de, {
            className: "w-3 h-3 mr-1"
          }), "Cancel"]
        }) : e.jsxs(ae, {
          size: "sm",
          className: "h-7 text-[11px]",
          onClick: Ce,
          disabled: A.length === 0 || c === "pairs" && A.length < 2,
          "data-testid": "btn-scan",
          children: [e.jsx(Ve, {
            className: "w-3 h-3 mr-1"
          }), "Run scan"]
        })]
      }), (m || f.done > 0) && e.jsxs("div", {
        className: "flex items-center gap-2 text-[10px] text-muted-foreground",
        children: [m && e.jsx(xe, {
          className: "w-3 h-3 animate-spin"
        }), e.jsxs("span", {
          className: "font-mono",
          children: [f.done, "/", f.total]
        }), e.jsx("div", {
          className: "flex-1 max-w-md h-1.5 bg-border/30 rounded overflow-hidden",
          children: e.jsx("div", {
            className: "h-full bg-primary",
            style: {
              width: `${f.total?f.done/f.total*100:0}%`
            }
          })
        }), e.jsx("span", {
          className: "truncate max-w-md",
          children: f.currentTask
        })]
      }), $ && e.jsx("div", {
        className: "text-rose-400 text-xs",
        children: $
      }), (q.length > 0 || B.length > 0) && e.jsxs("div", {
        className: "flex items-center gap-2 text-[10px]",
        children: [e.jsx("span", {
          className: "text-muted-foreground",
          children: "Filter:"
        }), e.jsx(ge, {
          value: D,
          onChange: i => Fe(i.target.value),
          placeholder: "ticker or classification",
          className: "h-6 w-48 text-[11px]"
        }), e.jsx("span", {
          className: "text-muted-foreground",
          children: "Min sample n ≥"
        }), e.jsx(ge, {
          type: "number",
          value: H,
          onChange: i => Pe(Math.max(0, parseInt(i.target.value) || 0)),
          className: "h-6 w-16 text-[11px]"
        }), e.jsxs("label", {
          className: "inline-flex items-center gap-1.5 cursor-pointer select-none ml-1",
          children: [e.jsx("input", {
            type: "checkbox",
            checked: Q,
            onChange: i => Le(i.target.checked),
            className: "h-3 w-3 cursor-pointer accent-amber-400"
          }), e.jsx("span", {
            className: "text-foreground/80",
            children: "Hide blank rows (no edge / insufficient data)"
          })]
        }), e.jsx("span", {
          className: "text-muted-foreground ml-auto",
          children: (() => {
            const i = c === "singles" ? q : B,
              S = c === "singles" ? ue.length : he.length,
              x = i.filter(y => y.bestSignal != null).length,
              v = i.length - x;
            return e.jsxs(e.Fragment, {
              children: ["Showing ", e.jsx("span", {
                className: "text-foreground",
                children: S
              }), " /", " ", e.jsx("span", {
                className: "text-foreground",
                children: i.length
              }), " · ", e.jsx("span", {
                className: "text-emerald-400",
                children: x
              }), " with edge,", " ", e.jsx("span", {
                className: "text-muted-foreground",
                children: v
              }), " blank"]
            })
          })()
        })]
      })]
    }), e.jsxs("div", {
      className: "flex-1 overflow-auto",
      children: [c === "singles" ? e.jsx(it, {
        rows: ue,
        sort: U,
        setSort: Se,
        onDrill: i => C(i)
      }) : e.jsx(ct, {
        rows: he,
        sort: G,
        setSort: $e,
        onDrill: (i, S) => K({
          a: i,
          b: S
        })
      }), !m && q.length === 0 && B.length === 0 && e.jsxs("div", {
        className: "flex flex-col items-center justify-center h-full text-muted-foreground gap-2",
        children: [e.jsx(Te, {
          className: "w-12 h-12 opacity-30"
        }), e.jsx("p", {
          className: "text-sm",
          children: 'No scan run yet. Pick a universe and click "Run scan".'
        }), e.jsx("p", {
          className: "text-[10px] opacity-80",
          children: c === "singles" ?
            "Singles scan analyzes each ticker for mean-reversion setups across price-z, % from 200MA, RSI(14), and percentile." :
            "Pairs scan analyzes every (N choose 2) combination for ratio mean-reversion across raw z, OLS-residual z, β-adj spread z, and percentile."
        })]
      })]
    }), P && e.jsx(nt, {
      ticker: P,
      asFloating: !0,
      onClose: () => C(null)
    }), R && e.jsx(ot, {
      tickerA: R.a,
      tickerB: R.b,
      onClose: () => K(null)
    })]
  })
}

function it({
  rows: s,
  sort: l,
  setSort: o,
  onDrill: a
}) {
  function r({
    k: t,
    label: d,
    align: n = "left"
  }) {
    const h = l.key === t;
    return e.jsx("th", {
      className: `px-2 py-1.5 cursor-pointer hover:bg-card/60 select-none text-${n}`,
      onClick: () => o({
        key: t,
        dir: h && l.dir === -1 ? 1 : -1
      }),
      children: e.jsxs("span", {
        className: "inline-flex items-center gap-1",
        children: [d, h && (l.dir === -1 ? e.jsx(be, {
          className: "w-3 h-3"
        }) : e.jsx(je, {
          className: "w-3 h-3"
        }))]
      })
    })
  }
  return e.jsxs("table", {
    className: "w-full text-[10px] font-mono",
    children: [e.jsx("thead", {
      className: "bg-card/40 text-muted-foreground sticky top-0",
      children: e.jsxs("tr", {
        children: [e.jsx(r, {
          k: "ticker",
          label: "Ticker"
        }), e.jsx(r, {
          k: "classification",
          label: "Class"
        }), e.jsx(r, {
          k: "currentPrice",
          label: "Price",
          align: "right"
        }), e.jsx(r, {
          k: "bestSignal",
          label: "Best signal"
        }), e.jsx(r, {
          k: "bestBucketLabel",
          label: "Bucket"
        }), e.jsx(r, {
          k: "direction",
          label: "Dir"
        }), e.jsx(r, {
          k: "quality",
          label: "Q",
          align: "right"
        }), e.jsx(r, {
          k: "expectedMove20dPct",
          label: "Exp 20d",
          align: "right"
        }), e.jsx(r, {
          k: "expectedPrice20d",
          label: "Target $",
          align: "right"
        }), e.jsx(r, {
          k: "hit20d",
          label: "Hit",
          align: "right"
        }), e.jsx(r, {
          k: "n",
          label: "n",
          align: "right"
        }), e.jsx(r, {
          k: "halfLifeDays",
          label: "HL",
          align: "right"
        })]
      })
    }), e.jsx("tbody", {
      children: s.map(t => e.jsxs("tr", {
        className: "border-t border-border/20 hover:bg-card/40 cursor-pointer",
        onClick: () => a(t.ticker),
        "data-testid": `singles-row-${t.ticker}`,
        children: [e.jsx("td", {
          className: "px-2 py-1 font-semibold text-foreground",
          children: t.ticker
        }), e.jsx("td", {
          className: "px-2 py-1 text-foreground/70 truncate max-w-[120px]",
          title: t.classification,
          children: t.classification
        }), e.jsxs("td", {
          className: "px-2 py-1 text-right",
          children: ["$", t.currentPrice.toFixed(2)]
        }), e.jsxs("td", {
          className: "px-2 py-1 text-foreground/80",
          children: [t.bestSignal ? re(t.bestSignal) : "—", t
            .bestSignalValue != null && t.bestSignal && e.jsxs("span", {
              className: "ml-1 text-muted-foreground",
              children: ["(", ie(t.bestSignal, t.bestSignalValue), ")"]
            })
          ]
        }), e.jsx("td", {
          className: "px-2 py-1 text-foreground/70 truncate max-w-[140px]",
          title: t.bestBucketLabel,
          children: t.bestBucketLabel
        }), e.jsx("td", {
          className: "px-2 py-1",
          children: t.direction === "long" ? e.jsx("span", {
            className: "text-emerald-400",
            children: "LONG"
          }) : t.direction === "short" ? e.jsx("span", {
            className: "text-rose-400",
            children: "SHORT"
          }) : e.jsx("span", {
            className: "text-muted-foreground",
            children: "—"
          })
        }), e.jsx("td", {
          className: `px-2 py-1 text-right ${t.quality>=1.5?"text-emerald-400 font-semibold":t.quality>=.5?"text-emerald-400/70":t.quality<=-.5?"text-rose-400/70":"text-muted-foreground"}`,
          children: t.quality ? t.quality.toFixed(2) : "—"
        }), e.jsx("td", {
          className: `px-2 py-1 text-right ${(t.expectedMove20dPct??0)>0?"text-emerald-400":(t.expectedMove20dPct??0)<0?"text-rose-400":""}`,
          children: t.expectedMove20dPct != null ?
            `${t.expectedMove20dPct>=0?"+":""}${t.expectedMove20dPct.toFixed(2)}%` :
            "—"
        }), e.jsx("td", {
          className: "px-2 py-1 text-right font-semibold",
          children: t.expectedPrice20d != null ?
            `$${t.expectedPrice20d.toFixed(2)}` : "—"
        }), e.jsx("td", {
          className: `px-2 py-1 text-right ${(t.hit20d??0)>=65?"text-emerald-400 font-semibold":(t.hit20d??0)<=35?"text-rose-400 font-semibold":""}`,
          children: t.hit20d != null ? `${t.hit20d.toFixed(0)}%` : "—"
        }), e.jsx("td", {
          className: "px-2 py-1 text-right text-muted-foreground",
          children: t.n || "—"
        }), e.jsx("td", {
          className: "px-2 py-1 text-right text-muted-foreground",
          children: t.halfLifeDays ? `${t.halfLifeDays.toFixed(0)}d` : "—"
        })]
      }, t.ticker))
    })]
  })
}

function ct({
  rows: s,
  sort: l,
  setSort: o,
  onDrill: a
}) {
  function r({
    k: t,
    label: d,
    align: n = "left"
  }) {
    const h = l.key === t;
    return e.jsx("th", {
      className: `px-2 py-1.5 cursor-pointer hover:bg-card/60 select-none text-${n}`,
      onClick: () => o({
        key: t,
        dir: h && l.dir === -1 ? 1 : -1
      }),
      children: e.jsxs("span", {
        className: "inline-flex items-center gap-1",
        children: [d, h && (l.dir === -1 ? e.jsx(be, {
          className: "w-3 h-3"
        }) : e.jsx(je, {
          className: "w-3 h-3"
        }))]
      })
    })
  }
  return e.jsxs("table", {
    className: "w-full text-[10px] font-mono",
    children: [e.jsx("thead", {
      className: "bg-card/40 text-muted-foreground sticky top-0",
      children: e.jsxs("tr", {
        children: [e.jsx(r, {
          k: "tickerA",
          label: "A"
        }), e.jsx(r, {
          k: "tickerB",
          label: "B"
        }), e.jsx(r, {
          k: "ratio",
          label: "A/B",
          align: "right"
        }), e.jsx(r, {
          k: "bestSignal",
          label: "Best signal"
        }), e.jsx(r, {
          k: "bestBucketLabel",
          label: "Bucket"
        }), e.jsx(r, {
          k: "direction",
          label: "Setup"
        }), e.jsx(r, {
          k: "quality",
          label: "Q",
          align: "right"
        }), e.jsx(r, {
          k: "expectedMove20dPct",
          label: "Ratio 20d",
          align: "right"
        }), e.jsx(r, {
          k: "expectedRatio20d",
          label: "Tgt ratio",
          align: "right"
        }), e.jsx(r, {
          k: "expectedAIfBFlat",
          label: "A tgt (B flat)",
          align: "right"
        }), e.jsx(r, {
          k: "expectedBIfAFlat",
          label: "B tgt (A flat)",
          align: "right"
        }), e.jsx(r, {
          k: "hit20d",
          label: "Hit",
          align: "right"
        }), e.jsx(r, {
          k: "n",
          label: "n",
          align: "right"
        })]
      })
    }), e.jsx("tbody", {
      children: s.map(t => e.jsxs("tr", {
        className: "border-t border-border/20 hover:bg-card/40 cursor-pointer",
        onClick: () => a(t.tickerA, t.tickerB),
        "data-testid": `pairs-row-${t.tickerA}-${t.tickerB}`,
        children: [e.jsx("td", {
          className: "px-2 py-1 font-semibold text-foreground",
          children: t.tickerA
        }), e.jsx("td", {
          className: "px-2 py-1 font-semibold text-foreground",
          children: t.tickerB
        }), e.jsx("td", {
          className: "px-2 py-1 text-right text-foreground/70",
          children: isFinite(t.ratio) ? t.ratio.toFixed(4) : "—"
        }), e.jsxs("td", {
          className: "px-2 py-1 text-foreground/80",
          children: [t.bestSignal ? ve(t.bestSignal) : "—", t
            .bestSignalValue != null && t.bestSignal && e.jsxs("span", {
              className: "ml-1 text-muted-foreground",
              children: ["(", ye(t.bestSignal, t.bestSignalValue), ")"]
            })
          ]
        }), e.jsx("td", {
          className: "px-2 py-1 text-foreground/70 truncate max-w-[120px]",
          title: t.bestBucketLabel,
          children: t.bestBucketLabel
        }), e.jsx("td", {
          className: "px-2 py-1 text-[10px]",
          children: t.direction === "long_ratio" ? e.jsxs("span", {
            children: [e.jsx("span", {
              className: "text-emerald-400",
              children: "LONG"
            }), " ", t.tickerA, " / ", e.jsx("span", {
              className: "text-rose-400",
              children: "SHORT"
            }), " ", t.tickerB]
          }) : t.direction === "short_ratio" ? e.jsxs("span", {
            children: [e.jsx("span", {
              className: "text-rose-400",
              children: "SHORT"
            }), " ", t.tickerA, " / ", e.jsx("span", {
              className: "text-emerald-400",
              children: "LONG"
            }), " ", t.tickerB]
          }) : e.jsx("span", {
            className: "text-muted-foreground",
            children: "—"
          })
        }), e.jsx("td", {
          className: `px-2 py-1 text-right ${t.quality>=1.5?"text-emerald-400 font-semibold":t.quality>=.5?"text-emerald-400/70":t.quality<=-.5?"text-rose-400/70":"text-muted-foreground"}`,
          children: t.quality ? t.quality.toFixed(2) : "—"
        }), e.jsx("td", {
          className: `px-2 py-1 text-right ${(t.expectedMove20dPct??0)>0?"text-emerald-400":(t.expectedMove20dPct??0)<0?"text-rose-400":""}`,
          children: t.expectedMove20dPct != null ?
            `${t.expectedMove20dPct>=0?"+":""}${t.expectedMove20dPct.toFixed(2)}%` :
            "—"
        }), e.jsx("td", {
          className: "px-2 py-1 text-right",
          children: t.expectedRatio20d != null ? t.expectedRatio20d.toFixed(
            4) : "—"
        }), e.jsx("td", {
          className: "px-2 py-1 text-right font-semibold",
          children: t.expectedAIfBFlat != null ?
            `$${t.expectedAIfBFlat.toFixed(2)}` : "—"
        }), e.jsx("td", {
          className: "px-2 py-1 text-right font-semibold",
          children: t.expectedBIfAFlat != null ?
            `$${t.expectedBIfAFlat.toFixed(2)}` : "—"
        }), e.jsx("td", {
          className: `px-2 py-1 text-right ${(t.hit20d??0)>=65?"text-emerald-400 font-semibold":(t.hit20d??0)<=35?"text-rose-400 font-semibold":""}`,
          children: t.hit20d != null ? `${t.hit20d.toFixed(0)}%` : "—"
        }), e.jsx("td", {
          className: "px-2 py-1 text-right text-muted-foreground",
          children: t.n
        })]
      }, `${t.tickerA}_${t.tickerB}`))
    })]
  })
}

function ot({
  tickerA: s,
  tickerB: l,
  onClose: o
}) {
  const [a, r] = g.useState(null), [t, d] = g.useState(null);
  g.useEffect(() => {
    Promise.all([ne(s), ne(l)]).then(([h, p]) => {
      r(h.dates.map((c, N) => ({
        time: c,
        value: h.closes[N]
      })).filter(c => c.value > 0)), d(p.dates.map((c, N) => ({
        time: c,
        value: p.closes[N]
      })).filter(c => c.value > 0))
    })
  }, [s, l]);
  const n = g.useMemo(() => !a || !t || a.length < 200 || t.length < 200 ? null : Ne(a, t, s, l), [
    a, t, s, l
  ]);
  return e.jsxs("div", {
    className: "fixed top-16 right-4 z-40 w-[640px] max-w-[95vw] max-h-[80vh] flex flex-col bg-card border border-border rounded-lg shadow-2xl overflow-hidden",
    children: [e.jsxs("div", {
      className: "flex items-center gap-2 px-3 py-1.5 bg-card/80 border-b border-border/40",
      children: [e.jsx(Z, {
        className: "w-3.5 h-3.5 text-amber-400"
      }), e.jsxs("span", {
        className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
        children: ["Pair signal — ", s, "/", l]
      }), e.jsx("div", {
        className: "flex-1"
      }), e.jsx(ae, {
        variant: "ghost",
        size: "sm",
        className: "h-6 w-6 p-0",
        onClick: o,
        children: e.jsx(de, {
          className: "w-3.5 h-3.5"
        })
      })]
    }), e.jsxs("div", {
      className: "flex-1 min-h-0 overflow-auto p-3 space-y-3 text-xs",
      children: [!n && e.jsxs("div", {
        className: "flex items-center text-muted-foreground",
        children: [e.jsx(xe, {
          className: "w-4 h-4 mr-2 animate-spin"
        }), " Loading…"]
      }), n && n.bestNow && e.jsxs("div", {
        className: "rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2",
        children: [e.jsxs("div", {
          className: "text-amber-300 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-2",
          children: [e.jsx(Z, {
            className: "w-3.5 h-3.5"
          }), "Best signal — quality ", n.bestNow.bucket.quality.toFixed(
            2), " · n=", n.bestNow.bucket.n]
        }), e.jsxs("div", {
          className: "text-[12px] text-foreground/90",
          children: [n.bestNow.bucket.label, " on ", e.jsx("span", {
              className: "font-semibold",
              children: ve(n.bestNow.signal)
            }), " ", "(", ye(n.bestNow.signal, n.bestNow
            .currentSignalValue), ")"
          ]
        }), e.jsx("div", {
          className: "text-[11px] text-muted-foreground leading-snug",
          children: n.bestNow.rationale
        }), e.jsxs("div", {
          className: "grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-amber-500/20",
          children: [e.jsx(le, {
            label: "20d expected",
            value: `${n.bestNow.expectedMove20dPct>=0?"+":""}${n.bestNow.expectedMove20dPct.toFixed(2)}%`
          }), e.jsx(le, {
            label: "Ratio target",
            value: n.bestNow.expectedRatio20d.toFixed(4)
          }), e.jsx(le, {
            label: `${s} target (${l} flat)`,
            value: `$${n.bestNow.expectedAPrice20dIfBHolds.toFixed(2)}`
          }), e.jsx(le, {
            label: `${l} target (${s} flat)`,
            value: `$${n.bestNow.expectedBPrice20dIfAHolds.toFixed(2)}`
          })]
        }), e.jsx("div", {
          className: "text-[10px] text-muted-foreground/80 pt-1",
          children: n.bestNow.direction === "short_ratio" ?
            `Setup: short ${s} / long ${l} (sell the ratio)` : n.bestNow
            .direction === "long_ratio" ?
            `Setup: long ${s} / short ${l} (buy the ratio)` :
            "No actionable bias."
        })]
      }), n && !n.bestNow && e.jsx("div", {
        className: "text-[11px] text-muted-foreground",
        children: "No high-quality bucket right now."
      })]
    })]
  })
}

function le({
  label: s,
  value: l
}) {
  return e.jsxs("div", {
    className: "bg-card/30 border border-border/30 rounded px-2 py-1.5",
    children: [e.jsx("div", {
      className: "text-[9px] uppercase tracking-wider text-muted-foreground",
      children: s
    }), e.jsx("div", {
      className: "text-[12px] font-mono font-semibold text-foreground",
      children: l
    })]
  })
}
export {
  gt as
  default
};