import {
  dm as ye,
  dn as _t,
  a as Tt,
  r as g,
  af as Lt,
  ag as Pe,
  aj as Ft,
  g as Pt,
  j as e,
  cN as Ge,
  de as It,
  B as he,
  X as at,
  E as Ot,
  A as Rt,
  bX as Bt,
  T as $t,
  P as Et,
  dp as Ie,
  z as Ht,
  cJ as Oe,
  cL as Re,
  ae as Qe,
  df as zt
} from "./index-CsG73Aq_.js";
import {
  P as Dt
} from "./PresetBar-B4InBSQb.js";
import {
  U as Be
} from "./UnifiedTickerPicker-D927mSvl.js";
import {
  B as Wt
} from "./BasketTickerPill-DA9Wjwwc.js";
import {
  B as qt
} from "./BasketPicker-DkcKAXfe.js";
import {
  r as Ut,
  g as Kt
} from "./basketOhlc-CIjRG6QD.js";
import {
  g as Ze
} from "./yahooPairsRatio-DERC-reP.js";
import {
  h as fe,
  c as Yt
} from "./harsi-NMVnsDcX.js";
import {
  u as Vt
} from "./useOptimizerClassFilter-COCFGQs0.js";
import {
  u as Jt
} from "./usePairComboPicker-h_S34tFb.js";
import {
  u as Xt
} from "./useFrequency-DK9YJz0p.js";
import {
  P as Gt
} from "./play-D7mVvggU.js";
import "./globalUniverse-DuqPcp2u.js";
import "./ClassificationFiltersWithSource-D7v4WOtR.js";

function Qt(s, n = 14) {
  const a = s.length,
    r = new Array(a).fill(null);
  if (n < 1 || a < 2) return r;
  let o = 0,
    i = 0,
    c = 0;
  for (let d = 1; d < a; d++) {
    const h = s[d] - s[d - 1],
      l = h > 0 ? h : 0,
      y = h < 0 ? -h : 0;
    if (c < n) {
      if (o += l, i += y, c++, c === n) {
        o /= n, i /= n;
        const x = i === 0 ? 1 / 0 : o / i;
        r[d] = i === 0 ? 100 : 100 - 100 / (1 + x)
      }
    } else {
      o = (o * (n - 1) + l) / n, i = (i * (n - 1) + y) / n;
      const x = i === 0 ? 1 / 0 : o / i;
      r[d] = i === 0 ? 100 : 100 - 100 / (1 + x)
    }
  }
  return r
}

function Zt(s, n) {
  const a = new Array(s.length).fill(null);
  for (let r = n; r < s.length; r++) {
    const o = s[r - n];
    o > 0 && (a[r] = s[r] / o - 1)
  }
  return a
}

function es(s, n, a, r = 14, o = 3) {
  const i = new Array(a.length).fill(null);
  for (let h = r - 1; h < a.length; h++) {
    let l = -1 / 0,
      y = 1 / 0;
    for (let S = 0; S < r; S++) {
      const b = h - S;
      s[b] > l && (l = s[b]), n[b] < y && (y = n[b])
    }
    const x = l - y;
    i[h] = x > 0 ? (a[h] - y) / x * 100 : 50
  }
  const c = new Array(a.length).fill(null);
  for (let h = r + o - 2; h < a.length; h++) {
    let l = 0,
      y = 0;
    for (let x = 0; x < o; x++) {
      const S = i[h - x];
      S !== null && (l += S, y++)
    }
    c[h] = y > 0 ? l / y : null
  }
  const d = i.map((h, l) => h !== null && c[l] !== null ? h - c[l] : null);
  return {
    k: i,
    d: c,
    kMinusD: d
  }
}

function ts(s, n) {
  const a = new Array(s.length).fill(null);
  for (let r = n; r < s.length; r++) {
    const o = s[r - n],
      i = s[r];
    o !== null && i !== null && o !== 0 && (a[r] = i / o - 1)
  }
  return a
}

function ss(s, n) {
  const a = new Array(s.length).fill(null);
  for (let r = 0; r < s.length; r++) {
    const o = n[r];
    o !== null && o !== 0 && (a[r] = s[r] / o - 1)
  }
  return a
}

function as(s, n) {
  const a = new Array(s.length).fill(null);
  for (let r = 0; r < s.length; r++) {
    const o = s[r],
      i = n[r];
    o !== null && i !== null && i !== 0 && (a[r] = o / i - 1)
  }
  return a
}

function rt(s) {
  switch (s) {
    case "rsi":
    case "stoch_k":
    case "stoch_d":
    case "harsi_rsi":
    case "harsi_ha_close":
    case "harsi_stoch_k":
    case "harsi_stoch_d":
      return "num0";
    case "stoch_kd":
    case "harsi_stoch_kd":
      return "num2";
    case "roc":
    case "ma_slope":
    case "price_vs_ma":
    case "ma_spread":
      return "pct"
  }
}

function ve(s) {
  switch (s.kind) {
    case "rsi":
      return `RSI(${s.period??14})`;
    case "roc":
      return `ROC(${s.period??10})`;
    case "stoch_k":
      return `Stoch %K(${s.period??14},${s.dPeriod??3})`;
    case "stoch_d":
      return `Stoch %D(${s.period??14},${s.dPeriod??3})`;
    case "stoch_kd":
      return `Stoch %K−%D(${s.period??14},${s.dPeriod??3})`;
    case "ma_slope":
      return `${ye(s.maType??"EMA",s.period??50,s.maOpts)} slope(${s.slopeLookback??5})`;
    case "price_vs_ma":
      return `Px vs ${ye(s.maType??"SMA",s.period??50,s.maOpts)}`;
    case "ma_spread": {
      const n = ye(s.fastMaType ?? "EMA", s.fastPeriod ?? 20, s.fastMaOpts),
        a = ye(s.slowMaType ?? "EMA", s.slowPeriod ?? 50, s.slowMaOpts);
      return `${n} / ${a} spread`
    }
    case "harsi_rsi":
      return fe("rsi", s.harsi);
    case "harsi_ha_close":
      return fe("ha_close", s.harsi);
    case "harsi_stoch_k":
      return fe("stoch_k", s.harsi);
    case "harsi_stoch_d":
      return fe("stoch_d", s.harsi);
    case "harsi_stoch_kd":
      return fe("stoch_kd", s.harsi)
  }
}
const rs = [{
  kind: "rsi",
  group: "Oscillators",
  label: "RSI"
}, {
  kind: "roc",
  group: "Oscillators",
  label: "Rate of Change"
}, {
  kind: "stoch_k",
  group: "Oscillators",
  label: "Stochastic %K"
}, {
  kind: "stoch_d",
  group: "Oscillators",
  label: "Stochastic %D"
}, {
  kind: "stoch_kd",
  group: "Oscillators",
  label: "Stochastic %K − %D"
}, {
  kind: "ma_slope",
  group: "Moving Averages",
  label: "MA Slope"
}, {
  kind: "price_vs_ma",
  group: "Moving Averages",
  label: "Price vs MA"
}, {
  kind: "ma_spread",
  group: "Moving Averages",
  label: "MA Spread (fast/slow)"
}, {
  kind: "harsi_rsi",
  group: "HARSI (Heikin-Ashi RSI)",
  label: "HARSI RSI line"
}, {
  kind: "harsi_ha_close",
  group: "HARSI (Heikin-Ashi RSI)",
  label: "HARSI HA-Candle Close"
}, {
  kind: "harsi_stoch_k",
  group: "HARSI (Heikin-Ashi RSI)",
  label: "HARSI Stoch %K"
}, {
  kind: "harsi_stoch_d",
  group: "HARSI (Heikin-Ashi RSI)",
  label: "HARSI Stoch %D"
}, {
  kind: "harsi_stoch_kd",
  group: "HARSI (Heikin-Ashi RSI)",
  label: "HARSI Stoch %K − %D"
}];
let et = 0;

function ot() {
  return et += 1, `c${Date.now().toString(36)}-${et.toString(36)}`
}

function te(s, n) {
  const a = {
    id: ot(),
    kind: s,
    fmt: rt(s),
    label: "",
    period: void 0,
    ...n
  };
  switch (s) {
    case "rsi":
      a.period = a.period ?? 14;
      break;
    case "roc":
      a.period = a.period ?? 10;
      break;
    case "stoch_k":
    case "stoch_d":
    case "stoch_kd":
      a.period = a.period ?? 14, a.dPeriod = a.dPeriod ?? 3;
      break;
    case "ma_slope":
      a.maType = a.maType ?? "EMA", a.period = a.period ?? 50, a.slopeLookback = a.slopeLookback ??
        5;
      break;
    case "price_vs_ma":
      a.maType = a.maType ?? "SMA", a.period = a.period ?? 50;
      break;
    case "ma_spread":
      a.fastMaType = a.fastMaType ?? "EMA", a.fastPeriod = a.fastPeriod ?? 20, a.slowMaType = a
        .slowMaType ?? "EMA", a.slowPeriod = a.slowPeriod ?? 50;
      break;
    case "harsi_rsi":
    case "harsi_ha_close":
    case "harsi_stoch_k":
    case "harsi_stoch_d":
    case "harsi_stoch_kd":
      a.harsi = {
        candleLength: 14,
        candleSmoothing: 1,
        rsiLength: 7,
        rsiSmoothed: !0,
        stochLength: 14,
        smoothK: 3,
        smoothD: 3,
        stochFit: 80,
        ...a.harsi ?? {}
      };
      break
  }
  return a.label = ve(a), a
}

function me(s, n, a, r, o) {
  const i = (d, h, l) => {
      const y = JSON.stringify(l ?? {}),
        x = `${d}:${h}:${y}`;
      let S = o.ma.get(x);
      if (!S) {
        const b = {
          ...l ?? {},
          highs: a,
          lows: r
        };
        S = _t(n, h, d, b), o.ma.set(x, S)
      }
      return S
    },
    c = d => {
      const h = JSON.stringify(d ?? {});
      let l = o.harsi.get(h);
      return l || (l = Yt(n, a, r, d ?? {}), o.harsi.set(h, l)), l
    };
  switch (s.kind) {
    case "rsi":
      return Qt(n, s.period ?? 14);
    case "roc":
      return Zt(n, s.period ?? 10);
    case "stoch_k":
    case "stoch_d":
    case "stoch_kd": {
      const d = es(a, r, n, s.period ?? 14, s.dPeriod ?? 3);
      return s.kind === "stoch_k" ? d.k : s.kind === "stoch_d" ? d.d : d.kMinusD
    }
    case "ma_slope": {
      const d = i(s.maType ?? "EMA", s.period ?? 50, s.maOpts);
      return ts(d, s.slopeLookback ?? 5)
    }
    case "price_vs_ma": {
      const d = i(s.maType ?? "SMA", s.period ?? 50, s.maOpts);
      return ss(n, d)
    }
    case "ma_spread": {
      const d = i(s.fastMaType ?? "EMA", s.fastPeriod ?? 20, s.fastMaOpts),
        h = i(s.slowMaType ?? "EMA", s.slowPeriod ?? 50, s.slowMaOpts);
      return as(d, h)
    }
    case "harsi_rsi":
      return c(s.harsi).rsi;
    case "harsi_ha_close":
      return c(s.harsi).haClose;
    case "harsi_stoch_k":
      return c(s.harsi).stochK;
    case "harsi_stoch_d":
      return c(s.harsi).stochD;
    case "harsi_stoch_kd":
      return c(s.harsi).stochKD
  }
}

function tt() {
  return [te("rsi", {
    period: 14
  }), te("roc", {
    period: 20
  }), te("stoch_k", {
    period: 14,
    dPeriod: 3
  }), te("ma_slope", {
    maType: "EMA",
    period: 50,
    slopeLookback: 5
  }), te("price_vs_ma", {
    maType: "SMA",
    period: 200
  }), te("ma_spread", {
    fastMaType: "SMA",
    fastPeriod: 50,
    slowMaType: "SMA",
    slowPeriod: 200
  })]
}

function os(s) {
  return new Worker("" + new URL("rangeSearch.worker-DWovBQhj.js", import.meta.url).href, {
    name: s?.name
  })
}
const nt = [{
  days: 5,
  label: "1W"
}, {
  days: 10,
  label: "2W"
}, {
  days: 21,
  label: "1M"
}, {
  days: 42,
  label: "2M"
}, {
  days: 63,
  label: "3M"
}, {
  days: 126,
  label: "6M"
}];

function Cs() {
  const {
    universeTickers: s
  } = Tt(), [n, a] = g.useState([]);
  g.useEffect(() => {
    Lt().then(t => {
      a(t), t.length > 0 && (S(m => m || t[0].ticker), z(m => m || (t[1]?.ticker ?? t[0]
        .ticker)))
    })
  }, []);
  const r = g.useMemo(() => s ? n.filter(t => s.has(t.ticker)) : n, [n, s]),
    [o, i] = g.useState("single"),
    c = Vt(r, o === "pool", "range-clf"),
    d = Jt(r.map(t => t.ticker), o === "pairCombo", "range-pc"),
    h = c.filteredTickers,
    [l, y] = g.useState(""),
    [x, S] = g.useState(""),
    [b, z] = g.useState(""),
    [F, f] = g.useState([]),
    [R, _] = Pe("range-basket-mode", "stocks"),
    {
      baskets: Ne
    } = Ft(),
    [v, W] = g.useState(() => tt()),
    [U, se] = g.useState(() => new Set(tt().map(t => t.id)));
  g.useEffect(() => {
    se(new Set(v.map(t => t.id)))
  }, []);
  const [P, ne] = g.useState(2), [Y, Ee] = g.useState(5), [V, He] = g.useState(21), [Q, ze] = g
    .useState(30), [Z, De] = g.useState(1.5), [pe, We] = g.useState(40), [ae, qe] = g.useState(!1),
    [le, Ue] = g.useState(70), [M, Se] = g.useState(!1), {
      frequency: Ce,
      setFrequency: Me,
      frequencyUI: lt
    } = Xt("range", "daily", M), re = Ce === "weekly" ? "weekly" : "daily", [J, E] = g.useState({
      current: 0,
      total: 0,
      stage: "",
      fetched: 0,
      fetchTotal: 0
    }), [Ae, be] = Pe("range-input-selection", zt), [Ke, Ye] = Pe("range:result", null), [it, _e] =
    g.useState(null), [Ve, ue] = g.useState(null), [ct, dt] = g.useState(25), [mt, ht] = g.useState(
      25), [Je, ke] = g.useState(null), Te = g.useCallback(() => ({
      mode: o,
      selectedTicker: l,
      pairTickerA: x,
      pairTickerB: b,
      basketTickers: F,
      basketMode: R,
      indicators: v,
      selectedIds: Array.from(U),
      comboSize: P,
      bins: Y,
      horizonDays: V,
      minHits: Q,
      minLiftPct: Z,
      maxPoolTickers: pe,
      walkForwardEnabled: ae,
      trainPct: le,
      frequency: Ce,
      pairCombo: d.serialize(),
      inputSelection: Ae
    }), [o, l, x, b, F, R, v, U, P, Y, V, Q, Z, pe, ae, le, Ce, d, Ae]), Le = g.useCallback(t => {
      if (t) {
        if ((t.mode === "single" || t.mode === "pool" || t.mode === "pair" || t.mode ===
            "pairCombo" || t.mode === "basket") && i(t.mode), t.pairCombo && d.hydrate(t
            .pairCombo), typeof t.pairTickerA == "string" && S(t.pairTickerA), typeof t
          .pairTickerB == "string" && z(t.pairTickerB), Array.isArray(t.basketTickers) && f(t
            .basketTickers.filter(m => typeof m == "string")), (t.basketMode === "stocks" || t
            .basketMode === "combined") && _(t.basketMode), t.selectedTicker && y(t
            .selectedTicker), Array.isArray(t.indicators) && t.indicators.length > 0) {
          const m = t.indicators.map(p => {
            const j = te(p.kind, p);
            return {
              ...j,
              ...p,
              label: ve({
                ...j,
                ...p
              }),
              id: p.id ?? ot()
            }
          });
          W(m)
        }
        if (Array.isArray(t.selectedIds) && se(new Set(t.selectedIds)), (t.comboSize === 2 || t
            .comboSize === 3) && ne(t.comboSize), typeof t.bins == "number" && Ee(t.bins),
          typeof t.horizonDays == "number" && He(t.horizonDays), typeof t.minHits == "number" &&
          ze(t.minHits), typeof t.minLiftPct == "number" && De(t.minLiftPct), typeof t
          .maxPoolTickers == "number" && We(t.maxPoolTickers), typeof t.walkForwardEnabled ==
          "boolean" && qe(t.walkForwardEnabled), typeof t.trainPct == "number" && Ue(t.trainPct),
          t.frequency === "daily" || t.frequency === "weekly" || t.frequency ===
          "weekly_on_daily" ? Me(t.frequency) : t.timeframe === "weekly" && Me("weekly"), t
          .inputSelection && typeof t.inputSelection == "object") {
          const m = t.inputSelection;
          m.kind === "close" ? be({
            kind: "close"
          }) : m.kind === "workbook" && typeof m.metric == "string" && be({
            kind: "workbook",
            metric: m.metric
          })
        }
      }
    }, [Me, be]);
  Pt("range-optimizer", Te, Le);
  const pt = g.useCallback(() => Te(), [Te]),
    ut = g.useCallback(t => {
      Le(t)
    }, [Le]),
    xt = g.useMemo(() => {
      const t = {};
      for (const m of rs) t[m.group] || (t[m.group] = []), t[m.group].push(m);
      return t
    }, []),
    H = g.useMemo(() => v.filter(t => U.has(t.id)), [v, U]),
    ft = t => {
      se(m => {
        const p = new Set(m);
        return p.has(t) ? p.delete(t) : p.add(t), p
      })
    },
    gt = t => {
      const m = te(t);
      W(p => [...p, m]), se(p => {
        const j = new Set(p);
        return j.add(m.id), j
      }), ke(m)
    },
    bt = t => {
      W(m => m.filter(p => p.id !== t)), se(m => {
        const p = new Set(m);
        return p.delete(t), p
      })
    },
    kt = t => {
      const m = {
        ...t,
        label: ve(t),
        fmt: t.fmt ?? rt(t.kind)
      };
      W(p => p.map(j => j.id === m.id ? m : j))
    },
    Fe = g.useMemo(() => {
      const t = H.length,
        m = P;
      if (t < m) return 0;
      let p = 1,
        j = 1;
      for (let N = 0; N < m; N++) p *= t - N, j *= N + 1;
      return Math.round(p / j)
    }, [H.length, P]),
    oe = g.useRef(null),
    yt = g.useRef(0);
  g.useEffect(() => () => {
    oe.current?.terminate(), oe.current = null
  }, []);
  const jt = () => (oe.current || (oe.current = new os), oe.current),
    ie = (t, m) => {
      const p = new Float64Array(t.length * m);
      for (let j = 0; j < t.length; j++) {
        const N = j * m,
          B = t[j];
        for (let A = 0; A < m; A++) {
          const D = B[A];
          p[N + A] = D === null ? Number.NaN : D
        }
      }
      return p
    },
    ce = () => ({
      ma: new Map,
      harsi: new Map
    }),
    wt = async () => {
      if (!l) {
        ue("Select a ticker.");
        return
      }
      const t = await Oe(l);
      if (!t) throw new Error(`No Yahoo data for ${l}.`);
      const m = t.adjCloses.length,
        p = new Array(m),
        j = new Array(m);
      for (let C = 0; C < m; C++) {
        const O = t.closes[C],
          X = t.adjCloses[C],
          G = Number.isFinite(O) && O > 0 && Number.isFinite(X) ? X / O : 1;
        p[C] = t.highs[C] * G, j[C] = t.lows[C] * G
      }
      const N = Re({
          dates: t.dates,
          opens: t.opens,
          highs: p,
          lows: j,
          closes: t.adjCloses,
          adjCloses: t.adjCloses,
          volumes: t.volumes
        }, re),
        B = re === "weekly" ? 52 : 252;
      if (N.adjCloses.length < B) throw new Error(
        `Insufficient history for ${l} (need ≥${B} ${re} bars).`);
      E({
        current: 0,
        total: 0,
        stage: "compute",
        fetched: 1,
        fetchTotal: 1
      });
      const A = N.adjCloses,
        D = N.highs,
        q = N.lows,
        w = N.dates,
        u = ce(),
        k = H.map(C => me(C, A, D, q, u)),
        I = ie(k, A.length),
        K = {
          mode: "single",
          features: H,
          horizonDays: V,
          bins: Y,
          comboSize: P,
          minHits: Q,
          minLift: Z / 100,
          warmupBars: B,
          walkForward: ae ? {
            enabled: !0,
            trainPct: le / 100
          } : void 0,
          single: {
            closes: A,
            dates: w,
            featureSeriesFlat: I,
            featureSeriesLen: A.length
          }
        };
      await de(K, [I.buffer])
    }, vt = async () => {
      if (!x || !b || x === b) {
        ue("Select two distinct tickers for pair mode.");
        return
      }
      const t = await Qe(),
        m = await Ze(x, b, t);
      if (!m || m.indices.length < 252) throw new Error(
        `Insufficient pair-ratio history for ${x}/${b} (need ≥252 daily bars).`);
      const p = m.prices.slice(),
        j = p.slice(),
        N = p.slice(),
        B = m.indices.map(u => t[u] || "");
      E({
        current: 0,
        total: 0,
        stage: "compute",
        fetched: 1,
        fetchTotal: 1
      });
      const A = ce(),
        D = H.map(u => me(u, p, j, N, A)),
        q = ie(D, p.length),
        w = {
          mode: "single",
          features: H,
          horizonDays: V,
          bins: Y,
          comboSize: P,
          minHits: Q,
          minLift: Z / 100,
          warmupBars: 252,
          walkForward: ae ? {
            enabled: !0,
            trainPct: le / 100
          } : void 0,
          single: {
            closes: p,
            dates: B,
            featureSeriesFlat: q,
            featureSeriesLen: p.length
          }
        };
      await de(w, [q.buffer])
    }, Nt = async () => {
      if (d.pairs.length === 0) throw new Error("Select at least one pair in the leg set.");
      const t = await Qe();
      E({
        current: 0,
        total: 0,
        stage: "fetch",
        fetched: 0,
        fetchTotal: d.pairs.length
      });
      const m = 5,
        p = [];
      let j = 0;
      const N = 252,
        B = async u => {
          try {
            const k = await Ze(u.a, u.b, t);
            if (!k || k.indices.length < N) return;
            const I = k.prices.slice(),
              K = I.slice(),
              C = I.slice(),
              O = k.indices.map(T => t[T] || ""),
              X = ce(),
              G = H.map(T => me(T, I, K, C, X)),
              $ = ie(G, I.length);
            p.push({
              ticker: u.label,
              closes: I,
              dates: O,
              featureSeriesFlat: $,
              featureSeriesLen: I.length
            })
          } catch {} finally {
            j += 1, E(k => ({
              ...k,
              fetched: j
            }))
          }
        }, A = [...d.pairs], D = Array.from({
          length: m
        }, async () => {
          for (; A.length > 0;) {
            const u = A.shift();
            if (!u) break;
            await B(u)
          }
        });
      if (await Promise.all(D), p.length === 0) throw new Error(
        "No pair combos had sufficient ratio history (need ≥252 daily bars).");
      E({
        current: 0,
        total: 0,
        stage: "search",
        fetched: p.length,
        fetchTotal: p.length
      });
      const q = p.map(u => u.featureSeriesFlat.buffer),
        w = {
          mode: "pool",
          features: H,
          horizonDays: V,
          bins: Y,
          comboSize: P,
          minHits: Q,
          minLift: Z / 100,
          warmupBars: N,
          pool: p
        };
      await de(w, q)
    }, St = async () => {
      if (h.length === 0) throw new Error(
        "No tickers available — adjust your universe/classification filter.");
      const t = h.slice(0, pe);
      E({
        current: 0,
        total: 0,
        stage: "fetch",
        fetched: 0,
        fetchTotal: t.length
      });
      const m = 5,
        p = [];
      let j = 0;
      const N = re === "weekly" ? 52 : 252,
        B = async u => {
          try {
            const k = await Oe(u);
            if (!k) return;
            const I = k.adjCloses.length,
              K = new Array(I),
              C = new Array(I);
            for (let T = 0; T < I; T++) {
              const ee = k.closes[T],
                xe = k.adjCloses[T],
                Xe = Number.isFinite(ee) && ee > 0 && Number.isFinite(xe) ? xe / ee : 1;
              K[T] = k.highs[T] * Xe, C[T] = k.lows[T] * Xe
            }
            const O = Re({
              dates: k.dates,
              opens: k.opens,
              highs: K,
              lows: C,
              closes: k.adjCloses,
              adjCloses: k.adjCloses,
              volumes: k.volumes
            }, re);
            if (O.adjCloses.length < N) return;
            const X = ce(),
              G = H.map(T => me(T, O.adjCloses, O.highs, O.lows, X)),
              $ = ie(G, O.adjCloses.length);
            p.push({
              ticker: u,
              closes: O.adjCloses,
              dates: O.dates,
              featureSeriesFlat: $,
              featureSeriesLen: O.adjCloses.length
            })
          } catch {} finally {
            j += 1, E(k => ({
              ...k,
              fetched: j
            }))
          }
        }, A = t.map(u => u.ticker), D = Array.from({
          length: m
        }, async () => {
          for (; A.length > 0;) {
            const u = A.shift();
            if (!u) break;
            await B(u)
          }
        });
      if (await Promise.all(D), p.length === 0) throw new Error(
        "No tickers had sufficient Yahoo history.");
      E({
        current: 0,
        total: 0,
        stage: "search",
        fetched: p.length,
        fetchTotal: p.length
      });
      const q = p.map(u => u.featureSeriesFlat.buffer),
        w = {
          mode: "pool",
          features: H,
          horizonDays: V,
          bins: Y,
          comboSize: P,
          minHits: Q,
          minLift: Z / 100,
          warmupBars: N,
          pool: p
        };
      await de(w, q)
    }, Ct = async () => {
      if (F.length === 0) throw new Error("No basket tickers selected.");
      if (R === "combined") {
        const w = Ut(F, Ne);
        E({
          current: 0,
          total: 0,
          stage: "fetch",
          fetched: 0,
          fetchTotal: 1
        });
        const u = await Kt(w, null);
        if (!u || u.closes.length < 252) throw new Error(
          "Insufficient history for basket combined series (need ≥252 bars).");
        E({
          current: 0,
          total: 0,
          stage: "fetch",
          fetched: 1,
          fetchTotal: 1
        });
        const k = u.closes,
          I = u.highs,
          K = u.lows,
          C = u.priceDates,
          O = 252,
          X = ce(),
          G = H.map(ee => me(ee, k, I, K, X)),
          $ = ie(G, k.length);
        E({
          current: 0,
          total: 0,
          stage: "search",
          fetched: 1,
          fetchTotal: 1
        });
        const T = {
          mode: "single",
          features: H,
          horizonDays: V,
          bins: Y,
          comboSize: P,
          minHits: Q,
          minLift: Z / 100,
          warmupBars: O,
          walkForward: ae ? {
            enabled: !0,
            trainPct: le / 100
          } : void 0,
          single: {
            closes: k,
            dates: C,
            featureSeriesFlat: $,
            featureSeriesLen: k.length
          }
        };
        await de(T, [$.buffer]);
        return
      }
      E({
        current: 0,
        total: 0,
        stage: "fetch",
        fetched: 0,
        fetchTotal: F.length
      });
      const t = 5,
        m = [];
      let p = 0;
      const j = re === "weekly" ? 52 : 252,
        N = async w => {
          try {
            const u = await Oe(w);
            if (!u) return;
            const k = u.adjCloses.length,
              I = new Array(k),
              K = new Array(k);
            for (let $ = 0; $ < k; $++) {
              const T = u.closes[$],
                ee = u.adjCloses[$],
                xe = Number.isFinite(T) && T > 0 && Number.isFinite(ee) ? ee / T : 1;
              I[$] = u.highs[$] * xe, K[$] = u.lows[$] * xe
            }
            const C = Re({
              dates: u.dates,
              opens: u.opens,
              highs: I,
              lows: K,
              closes: u.adjCloses,
              adjCloses: u.adjCloses,
              volumes: u.volumes
            }, re);
            if (C.adjCloses.length < j) return;
            const O = ce(),
              X = H.map($ => me($, C.adjCloses, C.highs, C.lows, O)),
              G = ie(X, C.adjCloses.length);
            m.push({
              ticker: w,
              closes: C.adjCloses,
              dates: C.dates,
              featureSeriesFlat: G,
              featureSeriesLen: C.adjCloses.length
            })
          } catch {} finally {
            p += 1, E(u => ({
              ...u,
              fetched: p
            }))
          }
        }, B = [...F], A = Array.from({
          length: t
        }, async () => {
          for (; B.length > 0;) {
            const w = B.shift();
            if (!w) break;
            await N(w)
          }
        });
      if (await Promise.all(A), m.length === 0) throw new Error(
        "No basket tickers had sufficient Yahoo history.");
      E({
        current: 0,
        total: 0,
        stage: "search",
        fetched: m.length,
        fetchTotal: m.length
      });
      const D = m.map(w => w.featureSeriesFlat.buffer),
        q = {
          mode: "pool",
          features: H,
          horizonDays: V,
          bins: Y,
          comboSize: P,
          minHits: Q,
          minLift: Z / 100,
          warmupBars: j,
          pool: m
        };
      await de(q, D)
    }, de = (t, m) => new Promise((p, j) => {
      const N = jt(),
        B = ++yt.current,
        A = q => {
          const w = q.data;
          if (!(!w || w.id !== B))
            if (w.type === "progress") E(u => ({
              ...u,
              current: w.done,
              total: w.total,
              stage: "search"
            }));
            else if (w.type === "result") {
            if (N.removeEventListener("message", A), Ye(w.result), w.result
              .longsByTicker || w.result.shortsByTicker) {
              const u = w.result.longsByTicker,
                k = w.result.shortsByTicker;
              _e({
                longsByTicker: new Map(u ?? []),
                shortsByTicker: new Map(k ?? [])
              })
            } else _e(null);
            p()
          } else w.type === "error" && (N.removeEventListener("message", A), j(
            new Error(w.error)))
        };
      N.addEventListener("message", A);
      const D = {
        type: "run",
        id: B,
        payload: t
      };
      try {
        N.postMessage(D, m)
      } catch {
        N.postMessage(D)
      }
    }), Mt = async () => {
      if (H.length < P) {
        ue(`Select at least ${P} indicators.`);
        return
      }
      ue(null), Ye(null), _e(null), Se(!0), E({
        current: 0,
        total: 0,
        stage: "",
        fetched: 0,
        fetchTotal: 0
      });
      try {
        o === "single" ? await wt() : o === "pair" ? await vt() : o === "pairCombo" ?
          await Nt() : o === "basket" ? await Ct() : await St()
      } catch (t) {
        ue(t?.message ?? String(t))
      } finally {
        Se(!1)
      }
    }, At = () => {
      oe.current?.terminate(), oe.current = null, Se(!1)
    };
  return e.jsxs("div", {
    className: "flex flex-col gap-3 p-3 text-foreground",
    children: [e.jsxs("div", {
      className: "flex flex-col gap-1",
      children: [e.jsx("h1", {
        className: "text-lg font-bold tracking-tight",
        children: "Range Optimizer"
      }), e.jsx("p", {
        className: "text-[11px] font-mono text-muted-foreground",
        children: "Discover combinations of indicator value ranges where forward returns are systematically better (long bands) or worse (short bands) than baseline. Build any combination of RSI, ROC, Stochastic, MA-based features, and HARSI bands — quantile-bucketed across selected indicators; uses Yahoo adjusted closes only."
      })]
    }), e.jsx(Dt, {
      kind: "range",
      captureInputs: pt,
      applyInputs: ut
    }), e.jsxs("div", {
      className: "flex items-center gap-0 bg-card border border-border rounded p-0.5 self-start",
      children: [e.jsx("button", {
        type: "button",
        onClick: () => i("single"),
        disabled: M,
        "data-testid": "optimizer-mode-single",
        className: `text-[11px] font-mono px-3 py-1 rounded ${o==="single"?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-accent/50"}`,
        children: "Single Ticker"
      }), e.jsx("button", {
        type: "button",
        onClick: () => i("pool"),
        disabled: M,
        "data-testid": "optimizer-mode-pool",
        className: `text-[11px] font-mono px-3 py-1 rounded ${o==="pool"?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-accent/50"}`,
        children: "Pool Universe"
      }), e.jsx("button", {
        type: "button",
        onClick: () => i("pair"),
        disabled: M,
        "data-testid": "optimizer-mode-pair",
        className: `text-[11px] font-mono px-3 py-1 rounded ${o==="pair"?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-accent/50"}`,
        children: "Pair (A/B)"
      }), e.jsx("button", {
        type: "button",
        onClick: () => i("pairCombo"),
        disabled: M,
        "data-testid": "optimizer-mode-pairCombo",
        className: `text-[11px] font-mono px-3 py-1 rounded ${o==="pairCombo"?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-accent/50"}`,
        children: "Pair Combo"
      }), e.jsx("button", {
        type: "button",
        onClick: () => i("basket"),
        disabled: M,
        "data-testid": "optimizer-mode-basket",
        className: `text-[11px] font-mono px-3 py-1 rounded ${o==="basket"?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-accent/50"}`,
        children: "Basket"
      }), e.jsx("span", {
        className: "text-[10px] font-mono text-muted-foreground ml-2 pr-2",
        children: o === "single" ? "Bands learned from one stock's history" : o ===
          "pair" ? `Bands learned from ratio ${x||"A"}/${b||"B"} (daily only)` :
          o === "pairCombo" ?
          `Bands learned across ${d.pairs.length} pair${d.pairs.length!==1?"s":""} (daily only)` :
          o === "basket" ? `Basket of ${F.length} ticker${F.length!==1?"s":""}` :
          `Bands learned across ${Math.min(pe,h.length)} tickers${c.hasActiveFilters?" (filtered)":""}`
      })]
    }), o === "pool" && c.classFilterUI && e.jsxs("div", {
      className: "flex flex-col gap-1 p-2 bg-card border border-border rounded",
      children: [e.jsx("label", {
        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
        children: "Classification Filter"
      }), c.universeSourceUI, c.classFilterUI]
    }), e.jsxs("div", {
      className: "flex flex-wrap items-end gap-3 p-2 bg-card border border-border rounded",
      children: [o !== "pair" && o !== "pairCombo" && lt, o === "single" ? e.jsxs("div", {
        className: "flex items-end gap-2",
        children: [e.jsx("div", {
          className: Ge(l) ? "opacity-40 pointer-events-none" : "",
          children: e.jsx(Be, {
            tickers: r,
            value: Ge(l) ? "" : l,
            onChange: y,
            disabled: M,
            label: "Ticker"
          })
        }), e.jsxs("div", {
          className: "flex flex-col gap-0.5",
          children: [e.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Basket"
          }), e.jsx(Wt, {
            activeTicker: l,
            onSelectTicker: y,
            fallbackTicker: r[0]?.ticker ?? null
          })]
        }), e.jsxs("div", {
          className: "flex flex-col gap-0.5",
          children: [e.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Input Series"
          }), e.jsx(It, {
            value: Ae,
            onChange: be,
            family: "range",
            label: ""
          })]
        })]
      }) : o === "pair" ? e.jsxs("div", {
        className: "flex items-end gap-2",
        children: [e.jsx(Be, {
          tickers: r,
          value: x,
          onChange: S,
          disabled: M,
          label: "A"
        }), e.jsx(Be, {
          tickers: r,
          value: b,
          onChange: z,
          disabled: M,
          label: "B"
        })]
      }) : o === "pairCombo" ? e.jsxs("div", {
        className: "flex flex-col gap-1 w-full",
        children: [e.jsx("label", {
          className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "Pair Combo — Leg Set"
        }), d.ui]
      }) : o === "basket" ? e.jsxs("div", {
        className: "flex flex-col gap-2",
        children: [e.jsx(qt, {
          tickers: r,
          value: F,
          onChange: f,
          disabled: M,
          testIdPrefix: "range-basket"
        }), e.jsxs("div", {
          className: "flex flex-col gap-0.5",
          children: [e.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Basket Run Mode"
          }), e.jsx("div", {
            className: "flex gap-px",
            "data-testid": "range-basket-mode",
            children: ["stocks", "combined"].map(t => e.jsx("button", {
              "data-testid": `range-basket-mode-${t}`,
              className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${R===t?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
              onClick: () => _(t),
              disabled: M,
              title: t === "stocks" ?
                "Run optimizer on each basket constituent separately" :
                "Run optimizer on a single synthetic series using the basket's weighting scheme",
              children: t === "stocks" ? "Stock by Stock" :
                "Combined"
            }, t))
          })]
        })]
      }) : e.jsxs("div", {
        className: "flex flex-col gap-0.5",
        children: [e.jsx("label", {
          className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "Pool Size"
        }), e.jsx("input", {
          type: "number",
          min: 5,
          max: Math.max(5, h.length),
          value: pe,
          onChange: t => We(Math.max(5, parseInt(t.target.value, 10) || 40)),
          disabled: M,
          className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-20"
        }), e.jsxs("span", {
          className: "text-[9px] font-mono text-muted-foreground",
          children: ["of ", h.length, c.hasActiveFilters ?
            ` filtered (${r.length} total)` : " in universe"
          ]
        })]
      }), e.jsxs("div", {
        className: "flex flex-col gap-0.5",
        children: [e.jsx("label", {
          className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "Combo Size"
        }), e.jsxs("select", {
          className: "text-xs font-mono bg-background border border-border rounded px-2 py-1",
          value: P,
          onChange: t => ne(parseInt(t.target.value, 10)),
          disabled: M,
          children: [e.jsx("option", {
            value: 2,
            children: "2 indicators"
          }), e.jsx("option", {
            value: 3,
            children: "3 indicators"
          })]
        })]
      }), e.jsxs("div", {
        className: "flex flex-col gap-0.5",
        children: [e.jsx("label", {
          className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "Bins"
        }), e.jsxs("select", {
          className: "text-xs font-mono bg-background border border-border rounded px-2 py-1",
          value: Y,
          onChange: t => Ee(parseInt(t.target.value, 10)),
          disabled: M,
          children: [e.jsx("option", {
            value: 3,
            children: "3 (terciles)"
          }), e.jsx("option", {
            value: 4,
            children: "4 (quartiles)"
          }), e.jsx("option", {
            value: 5,
            children: "5 (quintiles)"
          }), e.jsx("option", {
            value: 10,
            children: "10 (deciles)"
          })]
        })]
      }), e.jsxs("div", {
        className: "flex flex-col gap-0.5",
        children: [e.jsx("label", {
          className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "Horizon"
        }), e.jsx("select", {
          className: "text-xs font-mono bg-background border border-border rounded px-2 py-1",
          value: V,
          onChange: t => He(parseInt(t.target.value, 10)),
          disabled: M,
          children: nt.map(t => e.jsxs("option", {
            value: t.days,
            children: [t.label, " (", t.days, "d)"]
          }, t.days))
        })]
      }), e.jsxs("div", {
        className: "flex flex-col gap-0.5",
        children: [e.jsx("label", {
          className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "Min Hits"
        }), e.jsx("input", {
          type: "number",
          min: 5,
          max: 5e3,
          value: Q,
          onChange: t => ze(Math.max(5, parseInt(t.target.value, 10) || 30)),
          disabled: M,
          className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-20"
        })]
      }), e.jsxs("div", {
        className: "flex flex-col gap-0.5",
        children: [e.jsx("label", {
          className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "Min Lift (%)"
        }), e.jsx("input", {
          type: "number",
          step: "0.1",
          min: 0,
          max: 50,
          value: Z,
          onChange: t => De(Math.max(0, parseFloat(t.target.value) || 0)),
          disabled: M,
          className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-20"
        })]
      }), e.jsxs("div", {
        className: "flex flex-col gap-0.5",
        children: [e.jsx("label", {
          className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "Walk-Forward"
        }), e.jsx("div", {
          className: "flex items-center gap-1.5 h-7",
          children: o === "single" ? e.jsxs(e.Fragment, {
            children: [e.jsxs("label", {
              className: "flex items-center gap-1 text-[11px] font-mono",
              children: [e.jsx("input", {
                type: "checkbox",
                checked: ae,
                onChange: t => qe(t.target.checked),
                disabled: M,
                className: "accent-primary"
              }), "IS/OOS"]
            }), ae && e.jsxs(e.Fragment, {
              children: [e.jsx("input", {
                type: "number",
                min: 30,
                max: 95,
                value: le,
                onChange: t => Ue(Math.min(95, Math.max(30,
                  parseInt(t.target.value, 10) || 70))),
                disabled: M,
                className: "text-xs font-mono bg-background border border-border rounded px-1 py-0.5 w-12",
                title: "Train %"
              }), e.jsx("span", {
                className: "text-[10px] font-mono text-muted-foreground",
                children: "% train"
              })]
            })]
          }) : e.jsx("span", {
            className: "text-[10px] font-mono text-muted-foreground italic",
            title: "Walk-forward requires per-ticker split which is not implemented for pooled cross-sectional search.",
            children: "Single mode only"
          })
        })]
      }), M ? e.jsxs(he, {
        size: "sm",
        variant: "destructive",
        onClick: At,
        className: "h-8",
        children: [e.jsx(at, {
          className: "w-3.5 h-3.5 mr-1"
        }), "Cancel"]
      }) : e.jsxs(he, {
        size: "sm",
        variant: "default",
        onClick: Mt,
        disabled: H.length < P || o === "single" && !l || o === "pair" && (!x || !
            b || x === b) || o === "basket" && F.length === 0 || o ===
          "pairCombo" && d.pairs.length === 0,
        className: "h-8",
        children: [e.jsx(Gt, {
          className: "w-3.5 h-3.5 mr-1"
        }), "Run Search"]
      }), Fe > 0 && !M && e.jsxs("div", {
        className: "text-[10px] font-mono text-muted-foreground self-end pb-2",
        children: [Fe, " combo", Fe === 1 ? "" : "s", " × ", Math.pow(Y, P),
          " buckets each"
        ]
      }), M && e.jsxs("div", {
        className: "text-[10px] font-mono text-muted-foreground self-end pb-2 flex flex-col gap-0.5",
        children: [J.stage === "fetch" && e.jsxs("span", {
          children: ["Fetching prices: ", J.fetched, "/", J.fetchTotal]
        }), J.stage === "compute" && e.jsx("span", {
          children: "Computing features…"
        }), J.stage === "search" && J.total > 0 && e.jsxs("span", {
          children: ["Searching: ", J.current, "/", J.total, " combos"]
        }), J.stage === "search" && J.total === 0 && e.jsx("span", {
          children: "Searching…"
        })]
      })]
    }), e.jsx(ns, {
      indicators: v,
      selectedIds: U,
      groupedKinds: xt,
      toggle: ft,
      onAdd: gt,
      onRemove: bt,
      onEdit: t => ke(t),
      disabled: M
    }), Je && e.jsx(ls, {
      indicator: Je,
      onClose: () => ke(null),
      onSave: t => {
        kt(t), ke(null)
      }
    }), Ve && e.jsx("div", {
      className: "text-[11px] font-mono text-red-500 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5",
      children: Ve
    }), Ke && e.jsx(ds, {
      result: Ke,
      mode: o,
      poolExtras: it,
      horizonDays: V,
      longLimit: ct,
      shortLimit: mt,
      setLongLimit: dt,
      setShortLimit: ht,
      tickerLabel: o === "single" ? l : o === "pair" ? `${x}/${b}` : o === "pairCombo" ?
        `pair-combo-${d.pairs.length}` : o === "basket" ? `basket-${F.length}` :
        `pool-${h.length}`
    })]
  })
}

function ns({
  indicators: s,
  selectedIds: n,
  groupedKinds: a,
  toggle: r,
  onAdd: o,
  onRemove: i,
  onEdit: c,
  disabled: d
}) {
  const [h, l] = g.useState(!0), [y, x] = g.useState(!1), S = n.size;
  return e.jsxs("div", {
    className: "bg-card border border-border rounded",
    children: [e.jsx("button", {
      type: "button",
      className: "w-full flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-accent/50 rounded-t",
      onClick: () => l(b => !b),
      children: e.jsxs("div", {
        className: "flex items-center gap-1.5",
        children: [h ? e.jsx(Ot, {
          className: "w-3.5 h-3.5"
        }) : e.jsx(Rt, {
          className: "w-3.5 h-3.5"
        }), e.jsx("span", {
          className: "text-xs font-bold",
          children: "Custom Indicators"
        }), e.jsxs("span", {
          className: "text-[10px] font-mono text-muted-foreground",
          children: [S, "/", s.length, " selected"]
        })]
      })
    }), h && e.jsxs("div", {
      className: "p-2 flex flex-col gap-2 border-t border-border",
      children: [e.jsx("div", {
        className: "flex flex-wrap gap-1.5",
        children: s.length === 0 ? e.jsx("div", {
          className: "text-[11px] font-mono text-muted-foreground px-1 py-2",
          children: 'No indicators. Click "Add Indicator" to build one.'
        }) : s.map(b => {
          const z = n.has(b.id);
          return e.jsxs("div", {
            className: `flex items-center gap-1 px-2 py-1 rounded border ${z?"bg-primary/10 border-primary/40 text-foreground":"bg-background border-border text-muted-foreground"} ${d?"opacity-60 pointer-events-none":""}`,
            children: [e.jsx("input", {
              type: "checkbox",
              checked: z,
              onChange: () => r(b.id),
              className: "accent-primary"
            }), e.jsx("span", {
              className: "text-[11px] font-mono",
              children: b.label
            }), e.jsx("button", {
              type: "button",
              onClick: () => c(b),
              className: "ml-1 text-muted-foreground hover:text-foreground",
              title: "Edit parameters",
              children: e.jsx(Bt, {
                className: "w-3 h-3"
              })
            }), e.jsx("button", {
              type: "button",
              onClick: () => i(b.id),
              className: "text-muted-foreground hover:text-red-500",
              title: "Remove",
              children: e.jsx($t, {
                className: "w-3 h-3"
              })
            })]
          }, b.id)
        })
      }), e.jsxs("div", {
        className: "relative",
        children: [e.jsxs(he, {
          size: "sm",
          variant: "outline",
          onClick: () => x(b => !b),
          disabled: d,
          className: "h-7 text-[11px]",
          children: [e.jsx(Et, {
            className: "w-3.5 h-3.5 mr-1"
          }), "Add Indicator"]
        }), y && e.jsx("div", {
          className: "absolute z-10 mt-1 left-0 bg-popover border border-border rounded shadow-lg min-w-[260px] py-1",
          children: Object.entries(a).map(([b, z]) => e.jsxs("div", {
            className: "py-1",
            children: [e.jsx("div", {
              className: "px-2 py-0.5 text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: b
            }), z.map(F => e.jsx("button", {
              type: "button",
              onClick: () => {
                o(F.kind), x(!1)
              },
              className: "w-full text-left px-2 py-1 text-[11px] font-mono hover:bg-accent",
              children: F.label
            }, F.kind))]
          }, b))
        })]
      })]
    })]
  })
}

function ls({
  indicator: s,
  onClose: n,
  onSave: a
}) {
  const [r, o] = g.useState({
      ...s
    }), i = ve(r), c = (f, R) => o(_ => ({
      ..._,
      [f]: R
    })), d = (f, R) => o(_ => ({
      ..._,
      maOpts: {
        ..._.maOpts ?? {},
        [f]: R
      }
    })), h = (f, R) => o(_ => ({
      ..._,
      fastMaOpts: {
        ..._.fastMaOpts ?? {},
        [f]: R
      }
    })), l = (f, R) => o(_ => ({
      ..._,
      slowMaOpts: {
        ..._.slowMaOpts ?? {},
        [f]: R
      }
    })), y = (f, R) => o(_ => ({
      ..._,
      harsi: {
        ..._.harsi ?? {},
        [f]: R
      }
    })), x = r.kind, S = x === "ma_slope" || x === "price_vs_ma", b = x === "ma_spread", z = x ===
    "stoch_k" || x === "stoch_d" || x === "stoch_kd", F = x.startsWith("harsi_");
  return e.jsx("div", {
    className: "fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4",
    children: e.jsxs("div", {
      className: "bg-card border border-border rounded shadow-lg w-full max-w-md max-h-[90vh] overflow-auto",
      children: [e.jsxs("div", {
        className: "flex items-center justify-between px-3 py-2 border-b border-border",
        children: [e.jsxs("div", {
          children: [e.jsx("div", {
            className: "text-xs font-bold",
            children: "Edit Indicator"
          }), e.jsx("div", {
            className: "text-[10px] font-mono text-muted-foreground",
            children: i
          })]
        }), e.jsx("button", {
          type: "button",
          onClick: n,
          className: "text-muted-foreground hover:text-foreground",
          children: e.jsx(at, {
            className: "w-4 h-4"
          })
        })]
      }), e.jsxs("div", {
        className: "p-3 flex flex-col gap-2",
        children: [(x === "rsi" || x === "roc") && e.jsx(L, {
          label: "Period",
          value: r.period ?? (x === "rsi" ? 14 : 10),
          min: 2,
          max: 1e3,
          onChange: f => c("period", f)
        }), z && e.jsxs(e.Fragment, {
          children: [e.jsx(L, {
            label: "K Period (length)",
            value: r.period ?? 14,
            min: 2,
            max: 1e3,
            onChange: f => c("period", f)
          }), e.jsx(L, {
            label: "D Smoothing",
            value: r.dPeriod ?? 3,
            min: 1,
            max: 50,
            onChange: f => c("dPeriod", f)
          })]
        }), S && e.jsxs(e.Fragment, {
          children: [e.jsx(je, {
            label: "MA Family",
            value: r.maType ?? "EMA",
            options: Ie.map(f => ({
              value: f,
              label: f
            })),
            onChange: f => c("maType", f)
          }), e.jsx(L, {
            label: "MA Period",
            value: r.period ?? 50,
            min: 2,
            max: 1e3,
            onChange: f => c("period", f)
          }), x === "ma_slope" && e.jsx(L, {
            label: "Slope Lookback (bars)",
            value: r.slopeLookback ?? 5,
            min: 1,
            max: 500,
            onChange: f => c("slopeLookback", f)
          }), e.jsx($e, {
            maType: r.maType ?? "EMA",
            opts: r.maOpts ?? {},
            setOpt: d
          })]
        }), b && e.jsxs(e.Fragment, {
          children: [e.jsx("div", {
            className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-1",
            children: "Fast MA"
          }), e.jsx(je, {
            label: "Fast Family",
            value: r.fastMaType ?? "EMA",
            options: Ie.map(f => ({
              value: f,
              label: f
            })),
            onChange: f => c("fastMaType", f)
          }), e.jsx(L, {
            label: "Fast Period",
            value: r.fastPeriod ?? 20,
            min: 2,
            max: 1e3,
            onChange: f => c("fastPeriod", f)
          }), e.jsx($e, {
            maType: r.fastMaType ?? "EMA",
            opts: r.fastMaOpts ?? {},
            setOpt: h
          }), e.jsx("div", {
            className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-2",
            children: "Slow MA"
          }), e.jsx(je, {
            label: "Slow Family",
            value: r.slowMaType ?? "EMA",
            options: Ie.map(f => ({
              value: f,
              label: f
            })),
            onChange: f => c("slowMaType", f)
          }), e.jsx(L, {
            label: "Slow Period",
            value: r.slowPeriod ?? 50,
            min: 2,
            max: 1e3,
            onChange: f => c("slowPeriod", f)
          }), e.jsx($e, {
            maType: r.slowMaType ?? "EMA",
            opts: r.slowMaOpts ?? {},
            setOpt: l
          })]
        }), F && e.jsx(is, {
          h: r.harsi ?? {},
          setH: y
        })]
      }), e.jsxs("div", {
        className: "flex items-center justify-end gap-2 px-3 py-2 border-t border-border",
        children: [e.jsx(he, {
          size: "sm",
          variant: "ghost",
          onClick: n,
          className: "h-7 text-[11px]",
          children: "Cancel"
        }), e.jsx(he, {
          size: "sm",
          variant: "default",
          onClick: () => a(r),
          className: "h-7 text-[11px]",
          children: "Save"
        })]
      })]
    })
  })
}

function $e({
  maType: s,
  opts: n,
  setOpt: a
}) {
  return s === "T3" ? e.jsxs(e.Fragment, {
    children: [e.jsx(L, {
      label: "T3 Volume Factor (0..1)",
      value: n.t3VolumeFactor ?? .7,
      min: 0,
      max: 1,
      step: .05,
      onChange: r => a("t3VolumeFactor", r)
    }), e.jsx(je, {
      label: "T3 Source",
      value: n.t3Source ?? "close",
      options: [{
        value: "close",
        label: "close"
      }, {
        value: "hlc2_close",
        label: "(H+L+2C)/4 (Pine)"
      }],
      onChange: r => a("t3Source", r)
    })]
  }) : s === "ALMA" ? e.jsxs(e.Fragment, {
    children: [e.jsx(L, {
      label: "ALMA Offset (0..1)",
      value: n.almaOffset ?? .85,
      min: 0,
      max: 1,
      step: .05,
      onChange: r => a("almaOffset", r)
    }), e.jsx(L, {
      label: "ALMA Sigma",
      value: n.almaSigma ?? 6,
      min: .5,
      max: 50,
      step: .5,
      onChange: r => a("almaSigma", r)
    })]
  }) : s === "FRAMA" ? e.jsxs(e.Fragment, {
    children: [e.jsx(L, {
      label: "FRAMA FC",
      value: n.framaFC ?? 1,
      min: 1,
      max: 500,
      onChange: r => a("framaFC", r)
    }), e.jsx(L, {
      label: "FRAMA SC",
      value: n.framaSC ?? 198,
      min: 1,
      max: 1e3,
      onChange: r => a("framaSC", r)
    })]
  }) : s === "LSMA" || s === "SLSMA" ? e.jsx(L, {
    label: `${s} Offset`,
    value: n.lsmaOffset ?? 0,
    min: 0,
    max: 50,
    step: 1,
    onChange: r => a("lsmaOffset", r)
  }) : null
}

function is({
  h: s,
  setH: n
}) {
  return e.jsxs(e.Fragment, {
    children: [e.jsx("div", {
      className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-1",
      children: "HARSI Candle"
    }), e.jsx(L, {
      label: "Candle Length",
      value: s.candleLength ?? 14,
      min: 2,
      max: 200,
      onChange: a => n("candleLength", a)
    }), e.jsx(L, {
      label: "Open Smoothing",
      value: s.candleSmoothing ?? 1,
      min: 1,
      max: 100,
      onChange: a => n("candleSmoothing", a)
    }), e.jsx("div", {
      className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-1",
      children: "RSI Plot"
    }), e.jsx(L, {
      label: "RSI Length",
      value: s.rsiLength ?? 7,
      min: 2,
      max: 200,
      onChange: a => n("rsiLength", a)
    }), e.jsx(cs, {
      label: "Smoothed Mode RSI",
      value: s.rsiSmoothed ?? !0,
      onChange: a => n("rsiSmoothed", a)
    }), e.jsx("div", {
      className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-1",
      children: "Stoch RSI"
    }), e.jsx(L, {
      label: "Stoch Length",
      value: s.stochLength ?? 14,
      min: 2,
      max: 200,
      onChange: a => n("stochLength", a)
    }), e.jsx(L, {
      label: "Smoothing K",
      value: s.smoothK ?? 3,
      min: 1,
      max: 50,
      onChange: a => n("smoothK", a)
    }), e.jsx(L, {
      label: "Smoothing D",
      value: s.smoothD ?? 3,
      min: 1,
      max: 50,
      onChange: a => n("smoothD", a)
    }), e.jsx(L, {
      label: "Stoch Scaling %",
      value: s.stochFit ?? 80,
      min: 1,
      max: 100,
      onChange: a => n("stochFit", a)
    })]
  })
}

function L({
  label: s,
  value: n,
  onChange: a,
  min: r,
  max: o,
  step: i
}) {
  return e.jsxs("label", {
    className: "flex items-center justify-between gap-2",
    children: [e.jsx("span", {
      className: "text-[11px] font-mono text-muted-foreground",
      children: s
    }), e.jsx("input", {
      type: "number",
      value: n,
      min: r,
      max: o,
      step: i ?? 1,
      onChange: c => {
        const d = c.target.value,
          h = i && i < 1 ? parseFloat(d) : parseInt(d, 10);
        Number.isNaN(h) || a(h)
      },
      className: "text-xs font-mono bg-background border border-border rounded px-2 py-0.5 w-28 text-right"
    })]
  })
}

function je({
  label: s,
  value: n,
  options: a,
  onChange: r
}) {
  return e.jsxs("label", {
    className: "flex items-center justify-between gap-2",
    children: [e.jsx("span", {
      className: "text-[11px] font-mono text-muted-foreground",
      children: s
    }), e.jsx("select", {
      value: n,
      onChange: o => r(o.target.value),
      className: "text-xs font-mono bg-background border border-border rounded px-2 py-0.5 w-44",
      children: a.map(o => e.jsx("option", {
        value: o.value,
        children: o.label
      }, o.value))
    })]
  })
}

function cs({
  label: s,
  value: n,
  onChange: a
}) {
  return e.jsxs("label", {
    className: "flex items-center justify-between gap-2",
    children: [e.jsx("span", {
      className: "text-[11px] font-mono text-muted-foreground",
      children: s
    }), e.jsx("input", {
      type: "checkbox",
      checked: n,
      onChange: r => a(r.target.checked),
      className: "accent-primary"
    })]
  })
}

function ds({
  result: s,
  mode: n,
  poolExtras: a,
  horizonDays: r,
  longLimit: o,
  shortLimit: i,
  setLongLimit: c,
  setShortLimit: d,
  tickerLabel: h
}) {
  const l = nt.find(S => S.days === r)?.label ?? `${r}d`,
    y = !!s.walkForward,
    x = g.useCallback(() => {
      const S = ["Side", "Band", "Hits", "Win%", "MeanRet", "Med", "Std", "Lift", "tStat",
        "LastHit", "CurrentlyIn"
      ];
      y && S.push("OOS_Hits", "OOS_Mean", "OOS_Lift", "OOS_Win%"), n === "pool" && S.push(
        "Tickers_Now");
      const b = [S],
        z = (v, W, U) => {
          const se = v.parts.map(ne => ne.display).join(" & "),
            P = [W, se, v.hits, (v.winRate * 100).toFixed(2), (v.meanReturn * 100).toFixed(3), (v
                .medianReturn * 100).toFixed(3), (v.stdReturn * 100).toFixed(3), (v.lift * 100)
              .toFixed(3), v.tStat.toFixed(3), v.lastDate ?? "", v.currentlyIn ? "Y" : ""
            ];
          if (y && P.push(v.oosHits ?? 0, v.oosMean !== void 0 ? (v.oosMean * 100).toFixed(3) :
              "", v.oosLift !== void 0 ? (v.oosLift * 100).toFixed(3) : "", v.oosWinRate !==
              void 0 ? (v.oosWinRate * 100).toFixed(2) : ""), n === "pool") {
            const ne = W === "Long" ? a?.longsByTicker.get(U) : a?.shortsByTicker.get(U);
            P.push((ne ?? []).join(";"))
          }
          b.push(P)
        };
      s.longs.forEach((v, W) => z(v, "Long", W)), s.shorts.forEach((v, W) => z(v, "Short", W));
      const F = b.map(v => v.map(W => {
          const U = String(W);
          return /[",\n]/.test(U) ? `"${U.replace(/"/g,'""')}"` : U
        }).join(",")).join(`
`),
        f = new Blob([F], {
          type: "text/csv;charset=utf-8"
        }),
        R = URL.createObjectURL(f),
        _ = document.createElement("a"),
        Ne = new Date().toISOString().slice(0, 10);
      _.href = R, _.download = `range-opt-${h||"results"}-${l}-${Ne}.csv`, document.body
        .appendChild(_), _.click(), setTimeout(() => {
          document.body.removeChild(_), URL.revokeObjectURL(R)
        }, 0)
    }, [s, y, n, a, h, l]);
  return e.jsxs("div", {
    className: "flex flex-col gap-3",
    children: [e.jsxs("div", {
      className: "flex items-center gap-3 px-2 py-1.5 bg-card border border-border rounded flex-wrap",
      children: [e.jsxs("span", {
        className: "text-[11px] font-mono text-muted-foreground",
        children: ["Baseline (", l, "):"]
      }), e.jsxs("span", {
        className: "text-[11px] font-mono font-bold",
        children: ["μ ", we(s.baselineMean), " · σ ", we(s.baselineStd), " · n ", s
          .baselineN.toLocaleString()
        ]
      }), y && s.oosBaselineMean !== void 0 && s.oosBaselineN !== void 0 && e.jsxs(
        "span", {
          className: "text-[11px] font-mono text-cyan-400",
          children: ["OOS: μ ", we(s.oosBaselineMean), " · n ", s.oosBaselineN
            .toLocaleString()
          ]
        }), e.jsxs("span", {
        className: "text-[10px] font-mono text-muted-foreground",
        children: [s.totalBuckets.toLocaleString(), " buckets · ", n === "pool" ?
          "pool / cross-sectional" : "single ticker", y && " · walk-forward"
        ]
      }), e.jsxs(he, {
        size: "sm",
        variant: "outline",
        onClick: x,
        disabled: s.longs.length === 0 && s.shorts.length === 0,
        className: "h-7 text-[11px] ml-auto",
        children: [e.jsx(Ht, {
          className: "w-3.5 h-3.5 mr-1"
        }), "Export CSV"]
      })]
    }), n === "pool" && a && e.jsx(ms, {
      result: s,
      poolExtras: a
    }), e.jsx(st, {
      title: "Long Bands",
      accent: "green",
      bands: s.longs,
      limit: o,
      setLimit: c,
      currentTickersByIdx: a?.longsByTicker,
      showOos: y
    }), e.jsx(st, {
      title: "Short Bands",
      accent: "red",
      bands: s.shorts,
      limit: i,
      setLimit: d,
      currentTickersByIdx: a?.shortsByTicker,
      showOos: y
    })]
  })
}

function ms({
  result: s,
  poolExtras: n
}) {
  const a = g.useMemo(() => {
      const i = new Map;
      for (const [, c] of n.longsByTicker)
        for (const d of c) {
          const h = i.get(d) ?? {
            longs: 0,
            shorts: 0
          };
          h.longs++, i.set(d, h)
        }
      for (const [, c] of n.shortsByTicker)
        for (const d of c) {
          const h = i.get(d) ?? {
            longs: 0,
            shorts: 0
          };
          h.shorts++, i.set(d, h)
        }
      return Array.from(i.entries()).sort((c, d) => {
        const h = c[1].longs - c[1].shorts,
          l = d[1].longs - d[1].shorts;
        return h !== l ? l - h : d[1].longs + d[1].shorts - (c[1].longs + c[1].shorts)
      })
    }, [n]),
    r = a.filter(([, i]) => i.longs > 0 && i.longs >= i.shorts),
    o = a.filter(([, i]) => i.shorts > 0 && i.shorts > i.longs);
  return a.length === 0 ? e.jsxs("div", {
    className: "flex items-center gap-2 px-3 py-2 bg-card border border-border rounded text-[11px] font-mono text-muted-foreground",
    children: [e.jsx("span", {
      className: "font-bold",
      children: "Live Signals:"
    }), e.jsx("span", {
      children: "No tickers currently sit in any qualifying band."
    })]
  }) : e.jsxs("div", {
    className: "flex flex-col gap-1.5 px-3 py-2 bg-card border border-border rounded",
    children: [e.jsxs("div", {
      className: "flex items-center gap-2 text-[11px] font-mono",
      children: [e.jsx("span", {
        className: "font-bold text-amber-400",
        children: "Live Signals"
      }), e.jsxs("span", {
        className: "text-muted-foreground",
        children: ["— tickers currently in qualifying bands (", r.length,
          " long-leaning, ", o.length, " short-leaning)"
        ]
      })]
    }), r.length > 0 && e.jsxs("div", {
      className: "flex flex-wrap items-center gap-1.5",
      children: [e.jsx("span", {
        className: "text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider min-w-[44px]",
        children: "Long"
      }), r.map(([i, c]) => e.jsxs("span", {
        className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-[10px] font-mono",
        title: `${c.longs} long bands· ${c.shorts} short bands`,
        children: [e.jsx("span", {
          className: "text-foreground font-bold",
          children: i
        }), e.jsxs("span", {
          className: "text-emerald-400",
          children: ["·", c.longs, "L"]
        }), c.shorts > 0 && e.jsxs("span", {
          className: "text-red-400/80",
          children: [c.shorts, "S"]
        })]
      }, `L-${i}`))]
    }), o.length > 0 && e.jsxs("div", {
      className: "flex flex-wrap items-center gap-1.5",
      children: [e.jsx("span", {
        className: "text-[10px] font-mono text-red-400 font-bold uppercase tracking-wider min-w-[44px]",
        children: "Short"
      }), o.map(([i, c]) => e.jsxs("span", {
        className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-[10px] font-mono",
        title: `${c.shorts} short bands · ${c.longs} long bands`,
        children: [e.jsx("span", {
          className: "text-foreground font-bold",
          children: i
        }), e.jsxs("span", {
          className: "text-red-400",
          children: ["·", c.shorts, "S"]
        }), c.longs > 0 && e.jsxs("span", {
          className: "text-emerald-400/80",
          children: [c.longs, "L"]
        })]
      }, `S-${i}`))]
    })]
  })
}

function st({
  title: s,
  accent: n,
  bands: a,
  limit: r,
  setLimit: o,
  currentTickersByIdx: i,
  showOos: c
}) {
  const d = n === "green" ? "text-emerald-500" : "text-red-500",
    h = a.slice(0, r);
  return e.jsxs("div", {
    className: "bg-card border border-border rounded overflow-hidden",
    children: [e.jsxs("div", {
      className: "flex items-center gap-2 px-2 py-1.5 border-b border-border",
      children: [e.jsx("span", {
        className: `text-xs font-bold ${d}`,
        children: s
      }), e.jsxs("span", {
        className: "text-[10px] font-mono text-muted-foreground",
        children: [a.length, " qualifying band", a.length === 1 ? "" : "s"]
      }), e.jsxs("div", {
        className: "ml-auto flex items-center gap-1",
        children: [e.jsx("span", {
          className: "text-[10px] font-mono text-muted-foreground",
          children: "show top"
        }), e.jsxs("select", {
          className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5",
          value: r,
          onChange: l => o(parseInt(l.target.value, 10)),
          children: [e.jsx("option", {
            value: 10,
            children: "10"
          }), e.jsx("option", {
            value: 25,
            children: "25"
          }), e.jsx("option", {
            value: 50,
            children: "50"
          }), e.jsx("option", {
            value: 100,
            children: "100"
          }), e.jsx("option", {
            value: 500,
            children: "500"
          })]
        })]
      })]
    }), h.length === 0 ? e.jsx("div", {
      className: "px-2 py-3 text-[11px] font-mono text-muted-foreground text-center",
      children: "No bands met the filters. Try lowering Min Lift or Min Hits."
    }) : e.jsx("div", {
      className: "overflow-x-auto",
      children: e.jsxs("table", {
        className: "w-full text-[11px] font-mono",
        children: [e.jsx("thead", {
          className: "bg-muted/40",
          children: e.jsxs("tr", {
            children: [e.jsx("th", {
              className: "text-left px-2 py-1 font-bold",
              children: "Band"
            }), e.jsx("th", {
              className: "text-right px-2 py-1 font-bold",
              children: "Hits"
            }), e.jsx("th", {
              className: "text-right px-2 py-1 font-bold",
              children: "Win %"
            }), e.jsx("th", {
              className: "text-right px-2 py-1 font-bold",
              children: "μ Ret"
            }), e.jsx("th", {
              className: "text-right px-2 py-1 font-bold",
              children: "Med"
            }), e.jsx("th", {
              className: "text-right px-2 py-1 font-bold",
              children: "σ"
            }), e.jsx("th", {
              className: "text-right px-2 py-1 font-bold",
              children: "Lift"
            }), e.jsx("th", {
              className: "text-right px-2 py-1 font-bold",
              children: "t-stat"
            }), c && e.jsxs(e.Fragment, {
              children: [e.jsx("th", {
                className: "text-right px-2 py-1 font-bold text-cyan-400 border-l border-border",
                children: "OOS Hits"
              }), e.jsx("th", {
                className: "text-right px-2 py-1 font-bold text-cyan-400",
                children: "OOS μ"
              }), e.jsx("th", {
                className: "text-right px-2 py-1 font-bold text-cyan-400",
                children: "OOS Lift"
              }), e.jsx("th", {
                className: "text-right px-2 py-1 font-bold text-cyan-400",
                children: "OOS Win%"
              })]
            }), e.jsx("th", {
              className: "text-right px-2 py-1 font-bold",
              children: "Last Hit"
            }), e.jsx("th", {
              className: "text-left px-2 py-1 font-bold",
              children: "Now"
            })]
          })
        }), e.jsx("tbody", {
          children: h.map((l, y) => {
            const x = i?.get(y) ?? [],
              S = !!i;
            return e.jsxs("tr", {
              className: `border-t border-border ${l.currentlyIn?"bg-amber-500/10":""}`,
              children: [e.jsx("td", {
                className: "px-2 py-1 max-w-[460px]",
                children: e.jsx("div", {
                  className: "flex flex-col gap-0.5",
                  children: l.parts.map((b, z) => e.jsx(
                    "span", {
                      className: "text-foreground",
                      children: b.display
                    }, z))
                })
              }), e.jsx("td", {
                className: "px-2 py-1 text-right",
                children: l.hits.toLocaleString()
              }), e.jsxs("td", {
                className: "px-2 py-1 text-right",
                children: [(l.winRate * 100).toFixed(0), "%"]
              }), e.jsx("td", {
                className: `px-2 py-1 text-right font-bold ${l.meanReturn>0?"text-emerald-500":"text-red-500"}`,
                children: ge(l.meanReturn)
              }), e.jsx("td", {
                className: "px-2 py-1 text-right",
                children: ge(l.medianReturn)
              }), e.jsx("td", {
                className: "px-2 py-1 text-right text-muted-foreground",
                children: we(l.stdReturn)
              }), e.jsx("td", {
                className: `px-2 py-1 text-right font-bold ${l.lift>0?"text-emerald-500":"text-red-500"}`,
                children: ge(l.lift)
              }), e.jsx("td", {
                className: "px-2 py-1 text-right",
                children: l.tStat.toFixed(2)
              }), c && e.jsxs(e.Fragment, {
                children: [e.jsx("td", {
                  className: "px-2 py-1 text-right border-l border-border",
                  children: l.oosHits ?? 0
                }), e.jsx("td", {
                  className: `px-2 py-1 text-right ${(l.oosMean??0)>0?"text-emerald-400":(l.oosMean??0)<0?"text-red-400":"text-muted-foreground"}`,
                  children: l.oosMean !== void 0 ? ge(l
                    .oosMean) : "—"
                }), e.jsx("td", {
                  className: `px-2 py-1 text-right font-bold ${(l.oosLift??0)>0&&l.lift>0?"text-emerald-400":(l.oosLift??0)<0&&l.lift<0?"text-red-400":"text-amber-400"}`,
                  title: (l.oosLift ?? 0) > 0 && l.lift >
                    0 || (l.oosLift ?? 0) < 0 && l.lift <
                    0 ? "Confirmed in OOS" :
                    "Sign flipped in OOS — weak edge",
                  children: l.oosLift !== void 0 ? ge(l
                    .oosLift) : "—"
                }), e.jsx("td", {
                  className: "px-2 py-1 text-right text-muted-foreground",
                  children: l.oosWinRate !== void 0 ?
                    `${(l.oosWinRate*100).toFixed(0)}%` :
                    "—"
                })]
              }), e.jsx("td", {
                className: "px-2 py-1 text-right text-muted-foreground",
                children: l.lastDate ?? "—"
              }), e.jsx("td", {
                className: "px-2 py-1 text-left",
                children: S ? x.length > 0 ? e.jsxs("span", {
                  className: "text-amber-500 font-bold",
                  title: x.join(", "),
                  children: [x.slice(0, 3).join(", "), x
                    .length > 3 ? ` +${x.length-3}` : ""
                  ]
                }) : e.jsx("span", {
                  className: "text-muted-foreground/40",
                  children: "·"
                }) : l.currentlyIn ? e.jsx("span", {
                  className: "text-amber-500 font-bold",
                  children: "●"
                }) : e.jsx("span", {
                  className: "text-muted-foreground/40",
                  children: "·"
                })
              })]
            }, y)
          })
        })]
      })
    })]
  })
}
const we = s => (s * 100).toFixed(2) + "%",
  ge = s => (s >= 0 ? "+" : "") + (s * 100).toFixed(2) + "%";
export {
  Cs as
  default
};