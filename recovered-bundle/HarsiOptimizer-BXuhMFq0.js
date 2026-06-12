import {
  r,
  aj as fs,
  cG as bs,
  ag as Xe,
  cH as ks,
  a as ys,
  af as js,
  cJ as Kt,
  ae as Bt,
  g as Ss,
  j as t,
  cO as Ns,
  cP as vs,
  cN as $t,
  de as Dt,
  B as De,
  cQ as ws,
  cR as At,
  z as Cs,
  cV as Rs,
  cW as Mt,
  dj as Ls,
  cM as Ts,
  cK as Is,
  cL as Bs,
  cT as zt,
  cS as Ut,
  cX as qt,
  cY as $s,
  R as Ds,
  cZ as As,
  df as Ms
} from "./index-CsG73Aq_.js";
import {
  P as _t
} from "./PresetBar-B4InBSQb.js";
import {
  U as me
} from "./UnifiedTickerPicker-D927mSvl.js";
import {
  B as _s
} from "./BasketTickerPill-DA9Wjwwc.js";
import {
  e as Es,
  E as Fs,
  H as Gt
} from "./EvaluatorPanel-BcObXxAZ.js";
import {
  B as Os
} from "./BasketPicker-DkcKAXfe.js";
import {
  r as et,
  g as Et
} from "./basketOhlc-CIjRG6QD.js";
import {
  g as Ps
} from "./yahooPairsRatio-DERC-reP.js";
import {
  u as Hs
} from "./useOptimizerClassFilter-COCFGQs0.js";
import {
  u as Ks
} from "./usePairComboPicker-h_S34tFb.js";
import {
  u as zs
} from "./useFrequency-DK9YJz0p.js";
import {
  d as tt
} from "./weeklyDownsample-BzVm8wGH.js";
import {
  W as Us
} from "./workerPool-CRUHY70X.js";
import {
  c as qs
} from "./harsi-NMVnsDcX.js";
import "./tva-DaeKqI67.js";
import "./globalUniverse-DuqPcp2u.js";
import "./ClassificationFiltersWithSource-D7v4WOtR.js";

function Ft(u) {
  return new Worker("" + new URL("harsiOptimizer.worker-D5NE8xS_.js", import.meta.url).href, {
    name: u?.name
  })
}
const pe = {
    rsi_threshold: "RSI OB/OS Cross",
    stoch_kd_cross: "Stoch K-D Cross",
    ha_flip: "HA Color Flip",
    composite: "Composite (RSI + Stoch)"
  },
  Ot = {
    rsi_threshold: "Long when smoothed RSI crosses up through OS threshold (negative). Short when it crosses down through OB threshold (positive).",
    stoch_kd_cross: "Long when %K crosses above %D in OS zone (both negative). Short when %K crosses below %D in OB zone.",
    ha_flip: "HA candle color change (haClose crossing zero). Optional N-bar confirmation requires same color for N bars.",
    composite: "Long when smoothed RSI is in OS AND %K below %D within last L bars (agreement). Short symmetric."
  },
  Pt = {
    quick: {
      candleLength: [14],
      candleSmoothing: [1, 2, 3, 4, 5],
      rsiLength: [7, 14],
      stochLength: [14],
      smoothK: [3],
      smoothD: [3],
      obThresholds: [20, 25],
      osThresholds: [-20, -25],
      confirmation: [0, 1],
      compositeLookback: [3, 5]
    },
    standard: {
      candleLength: [10, 14, 21],
      candleSmoothing: [1, 2, 3, 4, 5, 6, 7, 8],
      rsiLength: [7, 9, 14],
      stochLength: [10, 14, 21],
      smoothK: [3, 5],
      smoothD: [3, 5],
      obThresholds: [15, 20, 25, 30],
      osThresholds: [-15, -20, -25, -30],
      confirmation: [0, 1, 2],
      compositeLookback: [3, 5, 8]
    },
    deep: {
      candleLength: [8, 10, 12, 14, 18, 21, 28],
      candleSmoothing: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      rsiLength: [5, 7, 9, 14],
      stochLength: [10, 14, 21],
      smoothK: [2, 3, 5],
      smoothD: [2, 3, 5],
      obThresholds: [15, 20, 25, 30],
      osThresholds: [-15, -20, -25, -30],
      confirmation: [0, 1, 2],
      compositeLookback: [3, 5, 8]
    }
  };

function Gs(u, p) {
  const a = u.candleLength.length,
    S = u.candleSmoothing.length,
    y = u.rsiLength.length,
    c = u.stochLength.length,
    x = u.smoothK.length,
    l = u.smoothD.length,
    s = u.obThresholds.length,
    i = u.osThresholds.length,
    o = u.confirmation.length,
    j = u.compositeLookback.length;
  switch (p) {
    case "rsi_threshold":
      return a * y * s * i;
    case "stoch_kd_cross":
      return a * y * c * x * l * s * i;
    case "ha_flip":
      return a * S * o;
    case "composite":
      return a * y * c * x * l * s * i * j
  }
}

function Ws(u, p, a, S) {
  const y = [];
  for (let c = Math.max(1, S); c < u.length; c++) {
    const x = u[c],
      l = u[c - 1];
    x === null || l === null || (l <= a && x > a ? y.push({
      index: c,
      direction: "buy"
    }) : l >= p && x < p && y.push({
      index: c,
      direction: "sell"
    }))
  }
  return y
}

function Vs(u, p, a, S, y) {
  const c = [];
  for (let x = Math.max(1, y); x < u.length; x++) {
    const l = u[x],
      s = u[x - 1],
      i = p[x],
      o = p[x - 1];
    if (l === null || s === null || i === null || o === null) continue;
    const j = s <= o && l > i,
      m = s >= o && l < i;
    j && l < S && i < S ? c.push({
      index: x,
      direction: "buy"
    }) : m && l > a && i > a && c.push({
      index: x,
      direction: "sell"
    })
  }
  return c
}

function Ys(u, p, a, S) {
  const y = [];
  let c = 0,
    x = 0,
    l = null,
    s = -1;
  for (let i = Math.max(0, S); i < u.length; i++) {
    const o = u[i],
      j = p[i];
    if (o === null || j === null) {
      c = 0, l = null, x = 0;
      continue
    }
    const m = o - j,
      I = m > 0 ? 1 : m < 0 ? -1 : 0;
    if (I === 0) {
      l && (x += 1);
      continue
    }
    if (c === 0) {
      c = I;
      continue
    }
    if (I !== c ? (l = I > 0 ? "buy" : "sell", s = i, x = 0, c = I) : l && (x += 1), l && x >= a) {
      const g = s + a;
      g < u.length && y.push({
        index: g,
        direction: l
      }), l = null, x = 0
    }
  }
  return y
}

function Zs(u, p, a, S, y, c, x) {
  const l = [],
    s = Math.max(1, c);
  let i = "none";
  for (let o = Math.max(1, x); o < u.length; o++) {
    const j = u[o];
    if (j === null) {
      i = "none";
      continue
    }
    let m = !1,
      I = !1;
    for (let f = o; f > Math.max(0, o - s); f--) {
      const B = p[f],
        K = a[f];
      B !== null && K !== null && (B < K && (m = !0), B > K && (I = !0))
    }
    let g = "none";
    j <= y && m ? g = "buy" : j >= S && I && (g = "sell"), g !== "none" && g !== i && l.push({
      index: o,
      direction: g
    }), i = g
  }
  return l
}
const st = ["rsi_threshold", "stoch_kd_cross", "ha_flip", "composite"],
  Ht = ["quick", "standard", "deep"],
  Qs = {
    quick: "Quick",
    standard: "Standard",
    deep: "Deep"
  };
async function Ae(u, p, a, S) {
  try {
    const y = await Kt(u),
      c = Is(y, S ?? null),
      x = c.adjCloses.length,
      l = new Array(x),
      s = new Array(x),
      i = new Array(x);
    for (let f = 0; f < x; f++) {
      const B = c.closes[f],
        K = c.adjCloses[f],
        z = B > 0 && Number.isFinite(B) && Number.isFinite(K) ? K / B : 1;
      l[f] = c.highs[f] * z, s[f] = c.lows[f] * z, i[f] = c.opens[f] * z
    }
    const o = new Map;
    for (let f = 0; f < a.length; f++) o.set(a[f], f);
    const j = c.dates.map(f => o.get(f) ?? -1),
      m = Bs({
        dates: c.dates,
        opens: i,
        highs: l,
        lows: s,
        closes: c.adjCloses,
        adjCloses: c.adjCloses,
        volumes: c.volumes
      }, p),
      I = p === "weekly" ? 52 : 252;
    if (m.closes.length < I) return null;
    const g = m.dailyIndexMap.map(f => f >= 0 ? j[f] ?? -1 : -1);
    return {
      closes: m.closes,
      highs: m.highs,
      lows: m.lows,
      volumes: m.volumes,
      priceDates: m.dates,
      globalIndices: g
    }
  } catch {
    return null
  }
}
async function rt(u, p, a, S) {
  try {
    const y = await Ps(u, p, a);
    if (!y || y.indices.length < 252) return null;
    let c = y.prices.slice(),
      x = y.indices.map(s => a[s] || ""),
      l = y.indices.slice();
    if (S) {
      const s = S.start,
        i = S.end;
      let o = 0;
      for (; o < x.length && x[o] < s;) o++;
      let j = x.length - 1;
      for (; j >= 0 && x[j] > i;) j--;
      if (o > j) return null;
      c = c.slice(o, j + 1), x = x.slice(o, j + 1), l = l.slice(o, j + 1)
    }
    return {
      closes: c,
      highs: c.slice(),
      lows: c.slice(),
      volumes: [],
      priceDates: x,
      globalIndices: l
    }
  } catch {
    return null
  }
}

function fr() {
  const [u, p] = r.useState([]), [a, S] = r.useState(""), [y, c] = r.useState(null), [x, l] = r
    .useState(!1), [s, i] = r.useState("single"), [o, j] = r.useState(""), [m, I] = r.useState(""),
    [g, f] = r.useState([]), [B, K] = r.useState("stocks"), {
      baskets: z
    } = fs(), [H, ot] = r.useState("rsi_threshold"), [U, nt] = r.useState("deep"), [Wt, Me] = r
    .useState("10y"), [_, _e] = r.useState(() => bs()), [te, at] = r.useState(!0), [he, lt] = r
    .useState(1), [se, it] = r.useState(80), [Y, ct] = r.useState("threshold"), [Z, Ee] = r
    .useState(.05), [ge, dt] = r.useState(.03), [fe, ut] = r.useState(.07), [Q, Fe] = r.useState(1),
    [q, J] = r.useState(!1), {
      frequency: re,
      setFrequency: Oe,
      frequencyUI: Vt
    } = zs("harsi", "daily", q), le = re === "weekly" ? "weekly" : "daily", [be, xt] = r.useState({
      current: 0,
      total: 0
    }), [Ne, ve] = r.useState(null), [we, ke] = Xe("harsi-input-selection", Ms), [X, Ce] = Xe(
      "harsi:results", []), [Yt, Pe] = r.useState(new Map), [He, mt] = r.useState(null), [Zt, pt] =
    r.useState(new Set), Qt = r.useCallback(e => {
      pt(h => {
        const k = new Set(h);
        return k.has(e) ? k.delete(e) : k.add(e), k
      })
    }, []), [Ke, Jt] = r.useState(""), [ee, ht] = r.useState({
      col: "score",
      dir: "desc"
    }), [ze, Xt] = r.useState("composite"), gt = r.useMemo(() => ks(ze), [ze]), [Re, ft] = r
    .useState("optimize"), [P, bt] = r.useState("long"), [Le, kt] = Xe("harsi:evalResult", null), [
      Te, yt
    ] = r.useState(null), [Ue, oe] = r.useState(!1), [A, es] = r.useState("rsi_threshold"), [ie,
    ts] = r.useState(14), [ne, ss] = r.useState(14), [ae, rs] = r.useState(14), [ce, os] = r
    .useState(3), [de, ns] = r.useState(3), [G, as] = r.useState(20), [W, ls] = r.useState(-20), [
      ye, is
    ] = r.useState(0), [je, cs] = r.useState(1), [Se, ds] = r.useState(5), Ie = r.useRef(!1), jt = r
    .useRef(!1), ue = r.useRef(null), {
      universeTickers: qe
    } = ys(), R = r.useMemo(() => qe ? u.filter(e => qe.has(e.ticker)) : u, [u, qe]), Be = Hs(R,
      s === "universe", "harsi-clf"), xe = Ks(R.map(e => e.ticker), s === "pairCombo", "harsi-pc"),
    St = Be.filteredTickers;
  r.useEffect(() => {
    js().then(e => {
      p(e), e.length > 0 && !jt.current && S(e[0].ticker), e.length > 0 && (j(h => h || e[0]
        .ticker), I(h => h || (e[1]?.ticker ?? e[0].ticker)))
    })
  }, []), r.useEffect(() => {
    R.length > 0 && a && R.find(e => e.ticker === a)
  }, [R, a]), r.useEffect(() => {
    if (s !== "single" || !a) return;
    let e = !1;
    return (async () => {
      try {
        const h = await Kt(a);
        e || c(h.fetchedAt ?? Date.now())
      } catch {
        e || c(null)
      }
    })(), () => {
      e = !0
    }
  }, [s, a]);
  const us = async () => {
      if (!(s !== "single" || !a)) {
        l(!0);
        try {
          const e = await Ls(a);
          c(e.fetchedAt ?? Date.now())
        } finally {
          l(!1)
        }
      }
    }, Nt = r.useMemo(() => Gs(Pt[U], H), [U, H]), xs = r.useCallback(async () => {
      J(!0), Ce([]), Pe(new Map), pt(new Set), ve(null), Ie.current = !1;
      let e;
      if (s === "pair") {
        if (!o || !m || o === m) {
          J(!1);
          return
        }
        const n = `${o}/${m}`;
        e = [{
          ticker: n,
          name: n
        }]
      } else if (s === "single") {
        const n = a;
        if (!n) {
          J(!1);
          return
        }
        const b = R.find(F => F.ticker === n);
        e = b ? [b] : [{
          ticker: n,
          name: n
        }]
      } else if (s === "basket")
        if (B === "combined") {
          if (g.length === 0) {
            J(!1);
            return
          }
          const n = et(g, z);
          e = [{
            ticker: `BASKET:${n.name}`,
            name: `BASKET:${n.name}`
          }]
        } else e = g.map(n => R.find(F => F.ticker.toUpperCase() === n.toUpperCase()) ?? {
          ticker: n,
          name: n
        });
      else if (s === "pairCombo") {
        if (xe.pairs.length === 0) {
          J(!1);
          return
        }
        e = xe.pairs.map(n => ({
          ticker: n.label,
          name: n.label,
          pairA: n.a,
          pairB: n.b
        }))
      } else e = St;
      if (e.length === 0) {
        J(!1);
        return
      }
      const h = s === "basket" && B === "combined" ? et(g, z) : null;
      xt({
        current: 0,
        total: e.length
      }), ue.current?.terminate();
      let k = null;
      if (s === "universe") {
        const n = Math.min(Math.max(2, navigator.hardwareConcurrency || 4), 8);
        k = new Us(() => new Ft, n), ue.current = k
      } else ue.current = null;
      const M = {
          kind: H,
          grid: Pt[U],
          rsiSmoothed: te,
          candleSmoothing: he,
          stochFit: se,
          targetReturn: Z,
          returnMode: Y,
          bandMin: ge,
          bandMax: fe,
          minHold: Q
        },
        C = [],
        L = new Map;
      let $ = 0;
      const N = await Bt(),
        E = e.map(async n => {
          if (!Ie.current) try {
            let b;
            if (re === "weekly_on_daily" && s !== "pair" && s !== "pairCombo") {
              const d = await Ae(n.ticker, "daily", N, _);
              if (!d) return;
              const v = tt(d.closes, d.priceDates),
                O = tt(d.highs, d.priceDates),
                T = tt(d.lows, d.priceDates);
              if (v.prices.length < 52) return;
              const w = (() => {
                if (!d.volumes) return [];
                const D = d.volumes,
                  V = new Array(v.weekIndex.length);
                let Lt = -1;
                for (let $e = 0; $e < v.weekIndex.length; $e++) {
                  const Tt = v.weekIndex[$e];
                  let It = 0;
                  for (let Je = Lt + 1; Je <= Tt; Je++) It += D[Je] || 0;
                  V[$e] = It, Lt = Tt
                }
                return V
              })();
              b = {
                closes: v.prices,
                highs: O.prices,
                lows: T.prices,
                volumes: w,
                priceDates: v.weekIndex.map(D => d.priceDates[D] ?? ""),
                globalIndices: v.weekIndex.map(D => d.globalIndices[D] ?? -1)
              }
            } else if (h && s === "basket") {
              const d = await Et(h, _);
              if (!d || d.closes.length < 252) return;
              const v = new Map;
              for (let O = 0; O < N.length; O++) v.set(N[O], O);
              b = {
                closes: d.closes,
                highs: d.highs,
                lows: d.lows,
                volumes: d.volumes,
                priceDates: d.priceDates,
                globalIndices: d.priceDates.map(O => v.get(O) ?? -1)
              }
            } else b = s === "pair" ? await rt(o, m, N, _) : s === "pairCombo" ?
              await rt(n.pairA, n.pairB, N, _) : await Ae(n.ticker, le, N, _);
            if (!b || Ie.current) return;
            const F = {
              prices: b.closes,
              highs: b.highs,
              lows: b.lows,
              volumes: b.volumes,
              dates: b.priceDates,
              globalIndices: b.globalIndices,
              benchmarkPrices: null,
              mode: s === "pair" || s === "pairCombo" ? "pair" : "single",
              pairLegA: s === "pairCombo" ? n.pairA : s === "pair" ? o : void 0,
              pairLegB: s === "pairCombo" ? n.pairB : s === "pair" ? m : void 0
            };
            if (s === "single" || s === "pair") {
              const d = new Ft;
              await new Promise((v, O) => {
                const T = w => {
                  const D = w.data;
                  D.type === "progress" ? ve({
                    ticker: n.ticker,
                    done: D.configsDone,
                    total: D.configsTotal
                  }) : D.type === "result" ? (D.result && (C.push(D.result), L
                    .set(D.result.ticker, F)), d.removeEventListener(
                    "message", T), d.terminate(), v()) : D.type === "error" && (
                    d.removeEventListener("message", T), d.terminate(), O(
                      new Error(D.error)))
                };
                d.addEventListener("message", T), d.postMessage({
                  type: "run",
                  id: 1,
                  ticker: n.ticker,
                  name: n.name ?? n.ticker,
                  closes: b.closes,
                  highs: b.highs,
                  lows: b.lows,
                  params: M,
                  frequency: re,
                  timeframe: le
                })
              })
            } else if (k) {
              const d = await k.run({
                type: "run",
                ticker: n.ticker,
                name: n.name ?? n.ticker,
                closes: b.closes,
                highs: b.highs,
                lows: b.lows,
                params: M,
                frequency: re,
                timeframe: le
              });
              d && (C.push(d), L.set(d.ticker, F))
            }
          } catch {} finally {
            $++, xt({
              current: $,
              total: e.length
            }), ($ % 3 === 0 || $ === e.length) && (Ce([...C]), Pe(new Map(L)))
          }
        });
      await Promise.all(E), Ce([...C]), Pe(new Map(L)), k?.terminate(), ue.current = null, ve(
        null), J(!1)
    }, [s, re, a, o, m, R, H, U, te, he, se, Y, Z, ge, fe, Q, _, g, B, z, St, xe.pairs]), ms =
  () => {
      Ie.current = !0, ue.current?.terminate(), ue.current = null, J(!1), ve(null)
    }, ps = r.useCallback(async () => {
      oe(!0), kt(null), yt(null);
      try {
        const e = await Bt();
        if (s === "pair" && (!o || !m || o === m)) {
          oe(!1);
          return
        }
        const h = s === "pair" ? "__PAIR__" : s === "single" ? a : R[0]?.ticker ?? "";
        if (!h && s !== "basket") {
          oe(!1);
          return
        }
        let k;
        if (s === "pair") k = await rt(o, m, e, _);
        else if (s === "basket") {
          if (g.length === 0) {
            oe(!1);
            return
          }
          if (B === "combined") {
            const T = et(g, z),
              w = await Et(T, _);
            if (!w || w.closes.length < 252) {
              oe(!1);
              return
            }
            const D = new Map;
            for (let V = 0; V < e.length; V++) D.set(e[V], V);
            k = {
              closes: w.closes,
              highs: w.highs,
              lows: w.lows,
              volumes: w.volumes,
              priceDates: w.priceDates,
              globalIndices: w.priceDates.map(V => D.get(V) ?? -1)
            }
          } else {
            const T = g[0];
            k = await Ae(T, le, e, _)
          }
        } else k = await Ae(h, le, e, _);
        if (!k) {
          oe(!1);
          return
        }
        const {
          closes: M,
          highs: C,
          lows: L,
          volumes: $,
          priceDates: N,
          globalIndices: E
        } = k, b = qs(M, C, L, {
          candleLength: ie,
          candleSmoothing: je,
          rsiLength: ne,
          rsiSmoothed: te,
          stochLength: ae,
          smoothK: ce,
          smoothD: de,
          stochFit: se
        }), F = Math.max(ie, ne, ae) + 30, d = P === "long" ? "buy" : "sell", v = [];
        if (A === "rsi_threshold") {
          const T = Ws(b.rsi, G, W, F);
          for (const w of T) w.direction === d && v.push(w.index)
        } else if (A === "stoch_kd_cross") {
          const T = Vs(b.stochK, b.stochD, G, W, F);
          for (const w of T) w.direction === d && v.push(w.index)
        } else if (A === "ha_flip") {
          const T = Ys(b.haClose, b.haOpen, ye, F);
          for (const w of T) w.direction === d && v.push(w.index)
        } else if (A === "composite") {
          const T = Zs(b.rsi, b.stochK, b.stochD, G, W, Se, F);
          for (const w of T) w.direction === d && v.push(w.index)
        }
        v.sort((T, w) => T - w);
        const O = Es(M, N, v, P, Z, Q, null, "3M");
        kt(O), yt({
          prices: M,
          highs: C,
          lows: L,
          volumes: $,
          dates: N,
          globalIndices: E,
          benchmarkPrices: null,
          mode: s === "pair" ? "pair" : "single",
          pairLegA: s === "pair" ? o : void 0,
          pairLegB: s === "pair" ? m : void 0
        })
      } finally {
        oe(!1)
      }
    }, [s, le, a, o, m, R, A, ie, je, ne, ae, ce, de, G, W, ye, Se, te, se, Z, Q, P, _, g, B,
      z
    ]), vt = r.useMemo(() => {
      const e = pe[A];
      return A === "rsi_threshold" ? `HARSI ${e} RSI(${ne}) OB${G}/OS${W} [${P}]` : A ===
        "stoch_kd_cross" ? `HARSI ${e} Stoch(${ae},${ce},${de}) OB${G}/OS${W} [${P}]` : A ===
        "ha_flip" ? `HARSI ${e} len=${ie} sm=${je} conf=${ye} [${P}]` :
        `HARSI ${e} RSI(${ne}) Stoch(${ae},${ce},${de}) lb=${Se} OB${G}/OS${W} [${P}]`
    }, [A, ie, je, ne, ae, ce, de, G, W, ye, Se, P]), wt = r.useMemo(() => s === "pair" ?
      `${o||"A"}/${m||"B"}` : s === "single" ? a || "—" : R[0]?.ticker || "—", [s, o, m, a, R]),
    Ge = r.useCallback(() => ({
      selectedTicker: a,
      pairTickerA: o,
      pairTickerB: m,
      basketTickers: g,
      basketMode: B,
      mode: s,
      frequency: re,
      signalKind: H,
      gridSize: U,
      rsiSmoothed: te,
      candleSmoothing: he,
      stochFit: se,
      returnMode: Y,
      targetReturn: Z,
      bandMin: ge,
      bandMax: fe,
      minHold: Q,
      results: X,
      expandedTicker: He,
      runSort: ee,
      pairCombo: xe.serialize(),
      inputSelection: we
    }), [a, o, m, g, B, s, re, H, U, te, he, se, Y, Z, ge, fe, Q, X, He, ee, we]), We = r
    .useCallback(e => {
      if (e && (e.selectedTicker && (S(e.selectedTicker), jt.current = !0), (e.mode ===
            "single" || e.mode === "universe" || e.mode === "pair" || e.mode === "pairCombo" ||
            e.mode === "basket") && i(e.mode), e.pairCombo && xe.hydrate(e.pairCombo), e
          .pairTickerA && j(e.pairTickerA), e.pairTickerB && I(e.pairTickerB), Array.isArray(e
            .basketTickers) && f(e.basketTickers.filter(h => typeof h == "string")), (e
            .basketMode === "stocks" || e.basketMode === "combined") && K(e.basketMode), e
          .frequency === "daily" || e.frequency === "weekly" || e.frequency ===
          "weekly_on_daily" ? Oe(e.frequency) : (e.timeframe === "weekly" && e.frequency ===
            void 0 || e.barInterval === "weekly" && e.frequency === void 0) && Oe("weekly"), st
          .includes(e.signalKind) && ot(e.signalKind), Ht.includes(e.gridSize) && nt(e
          .gridSize), typeof e.rsiSmoothed == "boolean" && at(e.rsiSmoothed), typeof e
          .candleSmoothing == "number" && lt(e.candleSmoothing), typeof e.stochFit ==
          "number" && it(e.stochFit), (e.returnMode === "threshold" || e.returnMode ===
          "band") && ct(e.returnMode), typeof e.targetReturn == "number" && Ee(e.targetReturn),
          typeof e.bandMin == "number" && dt(e.bandMin), typeof e.bandMax == "number" && ut(e
            .bandMax), typeof e.minHold == "number" && Fe(e.minHold), Array.isArray(e
          .results) && Ce(e.results), e.expandedTicker !== void 0 && mt(e.expandedTicker), e
          .runSort && e.runSort.col && e.runSort.dir && ht(e.runSort), e.inputSelection &&
          typeof e.inputSelection == "object")) {
        const h = e.inputSelection;
        h.kind === "close" ? ke({
          kind: "close"
        }) : h.kind === "workbook" && typeof h.metric == "string" && ke({
          kind: "workbook",
          metric: h.metric
        })
      }
    }, [ke]);
  Ss("harsi-optimizer", Ge, We);
  const Ct = r.useCallback(() => {
      const e = Ge(),
        {
          selectedTicker: h,
          results: k,
          expandedTicker: M,
          runSort: C,
          ...L
        } = e;
      return L
    }, [Ge]),
    Rt = r.useCallback(e => We(e), [We]),
    Ve = r.useMemo(() => X.map(e => {
      const h = k => {
        const M = k;
        let C = null,
          L = null,
          $ = null,
          N = -1 / 0;
        for (const E of e.configs) {
          const n = E.categories.find(F => F.category === k);
          if (!n || n.summary.count === 0) continue;
          const b = Ts(n.summary, n.composite.score, M, gt);
          b > N && (N = b, C = E, L = n.summary, $ = n.composite)
        }
        return C && L && $ ? {
          cfg: C,
          summary: L,
          score: N,
          comp: $
        } : null
      };
      return {
        tr: e,
        longBest: h("buy"),
        shortBest: h("sell")
      }
    }), [X, gt]),
    Ye = r.useMemo(() => {
      const e = Ke.trim().toLowerCase(),
        h = e ? Ve.filter(C => C.tr.ticker.toLowerCase().includes(e) || C.tr.name && C.tr.name
          .toLowerCase().includes(e)) : [...Ve],
        {
          col: k,
          dir: M
        } = ee;
      return h.sort((C, L) => {
        const $ = Math.max(C.longBest?.score ?? -1, C.shortBest?.score ?? -1),
          N = Math.max(L.longBest?.score ?? -1, L.shortBest?.score ?? -1);
        let E = 0;
        return k === "ticker" ? E = C.tr.ticker.localeCompare(L.tr.ticker) : k ===
          "currentSignal" ? E = C.tr.currentSignal.localeCompare(L.tr.currentSignal) : E = $ -
          N, M === "asc" ? E : -E
      }), h
    }, [Ve, ee, Ke]),
    Ze = e => ht(h => h.col === e ? {
      col: e,
      dir: h.dir === "desc" ? "asc" : "desc"
    } : {
      col: e,
      dir: e === "ticker" ? "asc" : "desc"
    }),
    hs = () => {
      const e = Mt,
        h = ["ticker", "name", "side", "currentSignal", "currentRsi", "currentStochK",
          "currentStochD", "currentHaClose", "kind", "bestConfig", "score", "signals"
        ];
      for (const N of e) h.push(`hit_${N.label}`, `avg_${N.label}`, `pf_${N.label}`);
      const k = [h.join(",")];
      for (const N of Ye)
        for (const E of ["long", "short"]) {
          const n = E === "long" ? N.longBest : N.shortBest;
          if (!n) continue;
          const b = [N.tr.ticker, N.tr.name ?? "", E, N.tr.currentSignal, N.tr.currentRsi, N.tr
            .currentStochK, N.tr.currentStochD, N.tr.currentHaClose, n.cfg.kind, n.cfg
            .configLabel, n.score, n.summary.count
          ];
          for (const d of e) {
            const v = Y === "band" ? n.summary.bandHitRate?.[d.label] ?? n.summary.hitRate[d
              .label] : n.summary.hitRate[d.label];
            b.push((v * 100).toFixed(1) + "%", (n.summary.avgReturn[d.label] * 100).toFixed(2) +
              "%", n.summary.profitFactor[d.label].toFixed(2))
          }
          const F = b.map(d => {
            if (d == null) return "";
            const v = String(d);
            return v.includes(",") || v.includes('"') || v.includes(`
`) ? `"${v.replace(/"/g,'""')}"` : v
          });
          k.push(F.join(","))
        }
      const M = k.join(`
`),
        C = new Blob([M], {
          type: "text/csv;charset=utf-8"
        }),
        L = URL.createObjectURL(C),
        $ = document.createElement("a");
      $.href = L, $.download = `harsi-opt-${H}-${U}-${Date.now()}.csv`, document.body.appendChild(
        $), $.click(), document.body.removeChild($), URL.revokeObjectURL(L)
    },
    Qe = Mt,
    gs = Y === "band";
  return t.jsxs("div", {
    className: "flex flex-col h-full overflow-hidden bg-background text-foreground",
    children: [t.jsxs("div", {
      className: "flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3",
      children: [t.jsx("h2", {
        className: "text-sm font-bold text-foreground tracking-tight",
        children: "HARSI Optimizer"
      }), t.jsxs("div", {
        className: "flex gap-px",
        children: [t.jsx("button", {
          "data-testid": "harsi-view-optimize",
          className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${Re==="optimize"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
          onClick: () => ft("optimize"),
          children: "Optimize"
        }), t.jsx("button", {
          "data-testid": "harsi-view-evaluate",
          className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${Re==="evaluate"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
          onClick: () => ft("evaluate"),
          children: "Evaluate"
        })]
      }), t.jsx("span", {
        className: "text-[10px] text-muted-foreground",
        children: Re === "optimize" ? "Search parameter space by hit rate" :
          "Score one specific setup"
      }), t.jsxs("div", {
        className: "flex items-center gap-1",
        children: [t.jsx("label", {
          className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "DATE RANGE"
        }), t.jsx("div", {
          className: "flex items-center gap-0.5",
          children: Ns.map(e => t.jsx("button", {
            "data-testid": `harsi-date-preset-${e.value}`,
            className: `text-[9px] font-mono px-1.5 py-0.5 rounded ${Wt===e.value?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border hover:text-foreground"}`,
            onClick: () => {
              Me(e.value), _e(vs(e.value))
            },
            children: e.label
          }, e.value))
        }), t.jsx("input", {
          type: "date",
          "data-testid": "harsi-date-start",
          value: _.start,
          onChange: e => {
            Me("custom"), _e({
              ..._,
              start: e.target.value
            })
          },
          className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
        }), t.jsx("span", {
          className: "text-[10px] font-mono text-muted-foreground",
          children: "→"
        }), t.jsx("input", {
          type: "date",
          "data-testid": "harsi-date-end",
          value: _.end,
          onChange: e => {
            Me("custom"), _e({
              ..._,
              end: e.target.value
            })
          },
          className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
        })]
      }), t.jsx("div", {
        className: "ml-auto flex items-center gap-2",
        children: t.jsx(_t, {
          kind: "harsi",
          captureInputs: Ct,
          applyInputs: Rt
        })
      })]
    }), Re === "evaluate" ? t.jsxs(t.Fragment, {
      children: [t.jsx("div", {
        className: "flex-shrink-0 px-4 py-3 border-b border-border bg-card",
        children: t.jsxs("div", {
          className: "flex items-start gap-4 flex-wrap",
          children: [t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Mode"
            }), t.jsxs("div", {
              className: "flex gap-px",
              children: [t.jsx("button", {
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${s==="single"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => i("single"),
                children: "Single"
              }), t.jsx("button", {
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${s==="pair"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => i("pair"),
                children: "Pair"
              })]
            })]
          }), s === "single" && t.jsxs("div", {
            className: "flex items-end gap-2",
            children: [t.jsx("div", {
              className: $t(a) ? "opacity-40 pointer-events-none" :
                "",
              children: t.jsx(me, {
                tickers: R,
                value: $t(a) ? "" : a,
                onChange: S,
                label: "Ticker"
              })
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Basket"
              }), t.jsx(_s, {
                activeTicker: a,
                onSelectTicker: S,
                fallbackTicker: R[0]?.ticker ?? null
              })]
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Input Series"
              }), t.jsx(Dt, {
                value: we,
                onChange: ke,
                family: "harsi",
                label: ""
              })]
            })]
          }), s === "pair" && t.jsxs(t.Fragment, {
            children: [t.jsx(me, {
              tickers: R,
              value: o,
              onChange: j,
              label: "Ticker A"
            }), t.jsx(me, {
              tickers: R,
              value: m,
              onChange: I,
              label: "Ticker B"
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Side"
            }), t.jsxs("div", {
              className: "flex gap-px",
              children: [t.jsx("button", {
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${P==="long"?"bg-emerald-600 text-white":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => bt("long"),
                children: "Long"
              }), t.jsx("button", {
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${P==="short"?"bg-red-600 text-white":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => bt("short"),
                children: "Short"
              })]
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Signal Kind"
            }), t.jsx("div", {
              className: "flex gap-px",
              children: st.map(e => t.jsx("button", {
                title: Ot[e],
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors whitespace-nowrap ${A===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => es(e),
                children: pe[e]
              }, e))
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Candle Len"
            }), t.jsx("input", {
              type: "number",
              min: 2,
              max: 50,
              value: ie,
              onChange: e => ts(parseInt(e.target.value) || 14),
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
            })]
          }), A !== "ha_flip" && t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "RSI Len"
            }), t.jsx("input", {
              type: "number",
              min: 2,
              max: 50,
              value: ne,
              onChange: e => ss(parseInt(e.target.value) || 14),
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
            })]
          }), A !== "ha_flip" && t.jsxs(t.Fragment, {
            children: [t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "OB Thr"
              }), t.jsx("input", {
                type: "number",
                min: 1,
                max: 50,
                value: G,
                onChange: e => as(parseInt(e.target.value) ||
                  20),
                className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
              })]
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "OS Thr"
              }), t.jsx("input", {
                type: "number",
                min: -50,
                max: -1,
                value: W,
                onChange: e => ls(parseInt(e.target.value) ||
                  -20),
                className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
              })]
            })]
          }), (A === "stoch_kd_cross" || A === "composite") && t.jsxs(t
            .Fragment, {
              children: [t.jsxs("div", {
                className: "flex flex-col gap-0.5",
                children: [t.jsx("label", {
                  className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                  children: "Stoch Len"
                }), t.jsx("input", {
                  type: "number",
                  min: 2,
                  max: 50,
                  value: ae,
                  onChange: e => rs(parseInt(e.target.value) ||
                    14),
                  className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                })]
              }), t.jsxs("div", {
                className: "flex flex-col gap-0.5",
                children: [t.jsx("label", {
                  className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                  children: "Smooth K"
                }), t.jsx("input", {
                  type: "number",
                  min: 1,
                  max: 20,
                  value: ce,
                  onChange: e => os(parseInt(e.target.value) ||
                    3),
                  className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                })]
              }), t.jsxs("div", {
                className: "flex flex-col gap-0.5",
                children: [t.jsx("label", {
                  className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                  children: "Smooth D"
                }), t.jsx("input", {
                  type: "number",
                  min: 1,
                  max: 20,
                  value: de,
                  onChange: e => ns(parseInt(e.target.value) ||
                    3),
                  className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                })]
              })]
            }), A === "ha_flip" && t.jsxs(t.Fragment, {
            children: [t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Open Smooth"
              }), t.jsx("input", {
                type: "number",
                min: 1,
                max: 20,
                value: je,
                onChange: e => cs(parseInt(e.target.value) ||
                  1),
                className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
              })]
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Confirm"
              }), t.jsx("input", {
                type: "number",
                min: 0,
                max: 10,
                value: ye,
                onChange: e => is(parseInt(e.target.value) ||
                  0),
                className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
              })]
            })]
          }), A === "composite" && t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Lookback"
            }), t.jsx("input", {
              type: "number",
              min: 1,
              max: 20,
              value: Se,
              onChange: e => ds(parseInt(e.target.value) || 5),
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Target %"
            }), t.jsx("input", {
              type: "number",
              step: .5,
              min: .5,
              value: +(Z * 100).toFixed(4),
              onChange: e => Ee((parseFloat(e.target.value) || 5) /
                100),
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]"
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Hold"
            }), t.jsx("input", {
              type: "number",
              min: 0,
              value: Q,
              onChange: e => Fe(parseInt(e.target.value) || 0),
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: " "
            }), t.jsx("button", {
              "data-testid": "harsi-eval-run",
              className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
              onClick: ps,
              disabled: Ue,
              children: Ue ? "Evaluating…" : "Evaluate"
            })]
          })]
        })
      }), t.jsxs("div", {
        className: "flex-1 overflow-auto p-4 space-y-3",
        children: [t.jsx(Fs, {
          result: Le,
          loading: Ue,
          setupLabel: vt,
          tickerLabel: wt
        }), Le && Te && Le.profiles.length >= 10 ? t.jsx(Gt, {
          ticker: Te.mode === "pair" ? Te.pairLegA || "" : a || R[0]
            ?.ticker || "",
          priceContext: Te,
          signals: Le.profiles,
          direction: P === "long" ? "buy" : "sell",
          title: `Hit Conditions — ${vt} on ${wt}`,
          useBand: !1
        }) : null]
      })]
    }) : t.jsx(t.Fragment, {
      children: t.jsxs("div", {
        className: "flex flex-col h-full bg-background text-foreground",
        children: [t.jsxs("div", {
          className: "flex items-center justify-between gap-3 px-4 py-1 border-b border-border flex-shrink-0",
          children: [t.jsxs("span", {
            className: "text-[11px] text-muted-foreground",
            children: ["Heikin Ashi RSI · ", pe[H]]
          }), t.jsx(_t, {
            kind: "harsi",
            captureInputs: Ct,
            applyInputs: Rt
          })]
        }), t.jsxs("div", {
          className: "flex flex-wrap items-center gap-3 px-4 py-2 border-b border-border bg-card/50 flex-shrink-0 text-xs",
          children: [t.jsxs("div", {
            className: "flex items-center gap-1",
            children: [t.jsx("span", {
              className: "text-muted-foreground",
              children: "Mode:"
            }), t.jsx("div", {
              className: "flex rounded-md overflow-hidden border border-border",
              children: ["single", "universe", "pair", "pairCombo",
                "basket"
              ].map(e => t.jsx("button", {
                onClick: () => i(e),
                disabled: q,
                "data-testid": `optimizer-mode-${e}`,
                className: `px-2.5 py-1 text-xs ${s===e?"bg-primary text-primary-foreground":"bg-card hover:bg-accent"}`,
                children: e === "single" ? "Single" : e ===
                  "universe" ? "Universe" : e === "pair" ?
                  "Pair (A/B)" : e === "pairCombo" ?
                  "Pair Combo" : "Basket"
              }, e))
            })]
          }), s === "pair" && t.jsxs("div", {
            className: "flex items-center gap-2",
            children: [t.jsx(me, {
              tickers: R,
              value: o,
              onChange: j,
              disabled: q,
              label: "A"
            }), t.jsx(me, {
              tickers: R,
              value: m,
              onChange: I,
              disabled: q,
              label: "B"
            }), t.jsxs("span", {
              className: "text-[10px] font-mono text-muted-foreground",
              children: ["Ratio: ", t.jsxs("span", {
                className: "text-foreground font-bold",
                children: [o || "A", "/", m || "B"]
              })]
            })]
          }), s === "basket" && t.jsxs("div", {
            className: "flex flex-col gap-2",
            children: [t.jsx(Os, {
              tickers: R,
              value: g,
              onChange: f,
              disabled: q,
              testIdPrefix: "harsi-basket"
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Basket Run Mode"
              }), t.jsx("div", {
                className: "flex gap-px",
                "data-testid": "harsi-basket-mode",
                children: ["stocks", "combined"].map(e => t
                  .jsx("button", {
                    "data-testid": `harsi-basket-mode-${e}`,
                    className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${B===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                    onClick: () => K(e),
                    disabled: q,
                    title: e === "stocks" ?
                      "Run optimizer on each basket constituent separately" :
                      "Run optimizer on a single synthetic series using the basket's weighting scheme",
                    children: e === "stocks" ?
                      "Stock by Stock" : "Combined"
                  }, e))
              })]
            })]
          }), s === "pairCombo" && t.jsxs("div", {
            className: "flex flex-col gap-1 w-full",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Pair Combo — Leg Set"
            }), xe.ui]
          }), s === "universe" && Be.classFilterUI && t.jsxs("div", {
            className: "flex flex-col gap-1 w-full",
            children: [Be.universeSourceUI, t.jsxs("div", {
              className: "flex items-center gap-1.5 w-full",
              children: [t.jsx("span", {
                className: "text-muted-foreground whitespace-nowrap",
                children: "Class Filter:"
              }), t.jsx("div", {
                className: "flex-1",
                children: Be.classFilterUI
              })]
            })]
          }), s === "single" && t.jsxs("div", {
            className: "flex items-center gap-1.5",
            children: [t.jsx(me, {
              value: a,
              onChange: e => S(e),
              tickers: R,
              label: "Ticker"
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Input Series"
              }), t.jsx(Dt, {
                value: we,
                onChange: ke,
                family: "harsi",
                label: ""
              })]
            }), t.jsx(De, {
              size: "sm",
              variant: "outline",
              onClick: us,
              disabled: x || !a,
              className: "h-7 px-2 text-xs",
              children: x ? "…" : "↻"
            }), y && t.jsx("span", {
              className: "text-[10px] text-muted-foreground",
              children: new Date(y).toLocaleTimeString()
            })]
          }), Vt, t.jsxs("div", {
            className: "flex items-center gap-1",
            children: [t.jsx("span", {
              className: "text-muted-foreground",
              children: "Signal:"
            }), t.jsx("div", {
              className: "flex rounded-md overflow-hidden border border-border",
              children: st.map(e => t.jsx("button", {
                onClick: () => ot(e),
                title: Ot[e],
                className: `px-2.5 py-1 text-xs whitespace-nowrap ${H===e?"bg-primary text-primary-foreground":"bg-card hover:bg-accent"}`,
                children: pe[e]
              }, e))
            })]
          }), t.jsxs("div", {
            className: "flex items-center gap-1",
            children: [t.jsx("span", {
              className: "text-muted-foreground",
              children: "Grid:"
            }), t.jsx("div", {
              className: "flex rounded-md overflow-hidden border border-border",
              children: Ht.map(e => t.jsx("button", {
                onClick: () => nt(e),
                className: `px-2.5 py-1 text-xs ${U===e?"bg-primary text-primary-foreground":"bg-card hover:bg-accent"}`,
                children: Qs[e]
              }, e))
            }), t.jsxs("span", {
              className: "text-[10px] text-muted-foreground ml-1",
              children: ["~", Nt.toLocaleString(), " combos"]
            })]
          }), t.jsxs("div", {
            className: "flex items-center gap-1",
            children: [t.jsx("span", {
              className: "text-muted-foreground",
              children: "Target:"
            }), t.jsxs("select", {
              value: Y,
              onChange: e => ct(e.target.value),
              className: "h-7 rounded-md bg-card border border-border px-1.5 text-xs",
              children: [t.jsx("option", {
                value: "threshold",
                children: "Threshold"
              }), t.jsx("option", {
                value: "band",
                children: "Band"
              })]
            }), Y === "threshold" ? t.jsx("select", {
              value: Z,
              onChange: e => Ee(parseFloat(e.target.value)),
              className: "h-7 rounded-md bg-card border border-border px-1.5 text-xs",
              children: ws.map(e => t.jsx("option", {
                value: e.value,
                children: e.label
              }, e.value))
            }) : t.jsx("select", {
              value: `${ge}-${fe}`,
              onChange: e => {
                const h = e.target.value,
                  k = At.find(M =>
                    `${M.band.minReturn}-${M.band.maxReturn}` ===
                    h);
                k && (dt(k.band.minReturn), ut(k.band.maxReturn))
              },
              className: "h-7 rounded-md bg-card border border-border px-1.5 text-xs",
              children: At.map(e => t.jsx("option", {
                value: `${e.band.minReturn}-${e.band.maxReturn}`,
                children: e.label
              }, e.label))
            })]
          }), t.jsxs("div", {
            className: "flex items-center gap-1",
            children: [t.jsx("span", {
              className: "text-muted-foreground",
              children: "Min hold:"
            }), t.jsx("input", {
              type: "number",
              min: 0,
              max: 60,
              value: Q,
              onChange: e => Fe(Math.max(0, Math.min(60, parseInt(e
                .target.value) || 0))),
              className: "h-7 w-12 rounded-md bg-card border border-border px-1.5 text-xs"
            }), t.jsx("span", {
              className: "text-[10px] text-muted-foreground",
              children: "d"
            })]
          }), t.jsxs("label", {
            className: "flex items-center gap-1 cursor-pointer",
            children: [t.jsx("input", {
              type: "checkbox",
              checked: te,
              onChange: e => at(e.target.checked),
              className: "h-3.5 w-3.5"
            }), t.jsx("span", {
              className: "text-muted-foreground",
              children: "RSI smoothed"
            })]
          }), t.jsxs("div", {
            className: "flex items-center gap-1",
            title: "Stochastic-RSI fit length (bars). Higher = smoother, slower to turn.",
            children: [t.jsx("span", {
              className: "text-muted-foreground",
              children: "Stoch fit:"
            }), t.jsx("input", {
              type: "number",
              min: 5,
              max: 200,
              step: 1,
              value: se,
              onChange: e => it(Math.max(5, Math.min(200, parseInt(e
                .target.value) || 80))),
              className: "h-7 w-14 rounded-md bg-card border border-border px-1.5 text-xs"
            })]
          }), t.jsxs("div", {
            className: "flex items-center gap-1",
            title: "Heikin-Ashi candle smoothing (1 = none).",
            children: [t.jsx("span", {
              className: "text-muted-foreground",
              children: "Candle smooth:"
            }), t.jsx("input", {
              type: "number",
              min: 1,
              max: 20,
              step: 1,
              value: he,
              onChange: e => lt(Math.max(1, Math.min(20, parseInt(e
                .target.value) || 1))),
              className: "h-7 w-12 rounded-md bg-card border border-border px-1.5 text-xs"
            })]
          }), t.jsxs("div", {
            className: "ml-auto flex items-center gap-2",
            children: [q ? t.jsx(De, {
              onClick: ms,
              size: "sm",
              variant: "destructive",
              className: "h-7 px-3 text-xs",
              children: "Cancel"
            }) : t.jsx(De, {
              onClick: xs,
              size: "sm",
              disabled: s === "single" ? !a : s === "pair" ? !o || !
                m || o === m : R.length === 0,
              className: "h-7 px-3 text-xs",
              children: "Run Optimizer"
            }), X.length > 0 && t.jsxs(De, {
              onClick: hs,
              size: "sm",
              variant: "outline",
              className: "h-7 px-2 text-xs",
              title: "Export results to CSV",
              children: [t.jsx(Cs, {
                className: "w-3.5 h-3.5 mr-1"
              }), "CSV"]
            })]
          })]
        }), q && t.jsxs("div", {
          className: "px-4 py-1.5 border-b border-border bg-muted/30 flex-shrink-0 text-xs flex items-center gap-3",
          children: [t.jsxs("span", {
            children: ["Tickers: ", be.current, "/", be.total]
          }), Ne && t.jsxs("span", {
            className: "text-muted-foreground",
            children: [Ne.ticker, ": ", Ne.done.toLocaleString(), "/", Ne
              .total.toLocaleString(), " configs"
            ]
          }), t.jsx("div", {
            className: "flex-1 h-1.5 bg-muted rounded overflow-hidden max-w-md",
            children: t.jsx("div", {
              className: "h-full bg-primary transition-all",
              style: {
                width: `${be.total?Math.round(be.current/be.total*100):0}%`
              }
            })
          })]
        }), X.length > 0 && t.jsxs("div", {
          className: "px-4 py-1.5 border-b border-border flex-shrink-0 text-xs flex items-center gap-2",
          children: [t.jsx("input", {
            type: "text",
            placeholder: "Filter ticker or name…",
            value: Ke,
            onChange: e => Jt(e.target.value),
            className: "h-7 w-56 rounded-md bg-card border border-border px-2 text-xs"
          }), t.jsxs("span", {
            className: "text-muted-foreground",
            children: [Ye.length, " of ", X.length, " rows"]
          }), t.jsxs("div", {
            className: "flex items-center gap-1 ml-auto",
            children: [t.jsx("label", {
              className: "text-[10px] font-mono text-muted-foreground",
              children: "RANK BY"
            }), t.jsx("select", {
              "data-testid": "harsi-rank-by",
              value: ze,
              onChange: e => Xt(e.target.value),
              className: "text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5",
              children: Rs.map(e => t.jsx("option", {
                value: e.value,
                children: e.label
              }, e.value))
            })]
          })]
        }), t.jsx("div", {
          className: "flex-1 overflow-auto",
          children: X.length === 0 ? t.jsx("div", {
            className: "flex items-center justify-center h-full text-sm text-muted-foreground",
            children: q ? "Running optimizer…" :
              `Configure parameters and click Run Optimizer. Estimated ${Nt.toLocaleString()} combos for ${pe[H]} (${U}).`
          }) : t.jsxs("table", {
            className: "w-full text-xs",
            children: [t.jsx("thead", {
              className: "sticky top-0 bg-card border-b border-border",
              children: t.jsxs("tr", {
                children: [t.jsxs("th", {
                  className: "text-left px-3 py-1.5 cursor-pointer hover:bg-accent",
                  onClick: () => Ze("ticker"),
                  children: ["Ticker ", ee.col ===
                    "ticker" && (ee.dir === "asc" ? "▲" :
                      "▼")
                  ]
                }), t.jsx("th", {
                  className: "text-left px-2 py-1.5 cursor-pointer hover:bg-accent",
                  onClick: () => Ze("currentSignal"),
                  children: "Live Signal"
                }), t.jsx("th", {
                  className: "text-right px-2 py-1.5",
                  children: "RSI"
                }), t.jsx("th", {
                  className: "text-right px-2 py-1.5",
                  children: "K"
                }), t.jsx("th", {
                  className: "text-right px-2 py-1.5",
                  children: "D"
                }), t.jsx("th", {
                  className: "text-right px-2 py-1.5",
                  children: "HA"
                }), t.jsxs("th", {
                  className: "text-right px-2 py-1.5 cursor-pointer hover:bg-accent",
                  onClick: () => Ze("score"),
                  children: ["Score ", ee.col === "score" &&
                    (ee.dir === "asc" ? "▲" : "▼")
                  ]
                }), t.jsx("th", {
                  className: "text-left px-2 py-1.5",
                  children: "Best Config"
                }), t.jsx("th", {
                  className: "text-left px-2 py-1.5",
                  children: "Side"
                }), t.jsx("th", {
                  className: "text-right px-2 py-1.5",
                  children: "Sigs"
                }), Qe.map(e => t.jsxs("th", {
                  className: "text-right px-1.5 py-1.5",
                  children: [e.label, " hit"]
                }, e.label)), Qe.map(e => t.jsxs("th", {
                  className: "text-right px-1.5 py-1.5",
                  children: [e.label, " avg"]
                }, "avg" + e.label))]
              })
            }), t.jsx("tbody", {
              children: Ye.map(e => {
                const h = e.longBest && e.shortBest ? e.longBest
                  .score >= e.shortBest.score ? {
                    side: "Long",
                    ...e.longBest
                  } : {
                    side: "Short",
                    ...e.shortBest
                  } : e.longBest ? {
                    side: "Long",
                    ...e.longBest
                  } : e.shortBest ? {
                    side: "Short",
                    ...e.shortBest
                  } : null;
                if (!h) return t.jsxs("tr", {
                  className: "border-b border-border/50",
                  children: [t.jsx("td", {
                    className: "px-3 py-1.5 font-mono",
                    children: e.tr.ticker
                  }), t.jsx("td", {
                    colSpan: 14,
                    className: "px-2 py-1.5 text-muted-foreground italic",
                    children: "No qualifying signals"
                  })]
                }, e.tr.ticker);
                const k = He === e.tr.ticker;
                return t.jsx(Js, {
                  er: e,
                  best: h,
                  expanded: k,
                  onToggle: () => mt(k ? null : e.tr.ticker),
                  horizons: Qe,
                  useBand: gs,
                  priceContext: Yt.get(e.tr.ticker),
                  hitConditionsOpen: Zt,
                  toggleHitConditions: Qt
                }, e.tr.ticker)
              })
            })]
          })
        })]
      })
    })]
  })
}

function Js({
  er: u,
  best: p,
  expanded: a,
  onToggle: S,
  horizons: y,
  useBand: c,
  priceContext: x,
  hitConditionsOpen: l,
  toggleHitConditions: s
}) {
  const i = u.tr;
  return t.jsxs(t.Fragment, {
    children: [t.jsxs("tr", {
      className: "border-b border-border/50 hover:bg-accent/40 cursor-pointer",
      onClick: S,
      children: [t.jsx("td", {
        className: "px-3 py-1.5 font-mono font-semibold",
        children: i.ticker
      }), t.jsx("td", {
        className: "px-2 py-1.5",
        children: t.jsx("span", {
          className: i.currentSignal.startsWith("→ Buy") ?
            "text-emerald-400 font-semibold" : i.currentSignal.startsWith(
              "→ Sell") ? "text-rose-400 font-semibold" :
            "text-muted-foreground",
          children: i.currentSignal
        })
      }), t.jsx("td", {
        className: "px-2 py-1.5 text-right tabular-nums",
        children: i.currentRsi !== null ? i.currentRsi.toFixed(1) : "—"
      }), t.jsx("td", {
        className: "px-2 py-1.5 text-right tabular-nums",
        children: i.currentStochK !== null ? i.currentStochK.toFixed(1) : "—"
      }), t.jsx("td", {
        className: "px-2 py-1.5 text-right tabular-nums",
        children: i.currentStochD !== null ? i.currentStochD.toFixed(1) : "—"
      }), t.jsx("td", {
        className: "px-2 py-1.5 text-right tabular-nums",
        children: i.currentHaClose !== null ? i.currentHaClose.toFixed(1) : "—"
      }), t.jsx("td", {
        className: "px-2 py-1.5 text-right tabular-nums",
        children: t.jsx("span", {
          style: {
            backgroundColor: Ut(p.score),
            color: zt(p.score),
            padding: "1px 6px",
            borderRadius: 4,
            fontWeight: 600
          },
          children: p.score
        })
      }), t.jsx("td", {
        className: "px-2 py-1.5 max-w-[260px] truncate",
        title: p.cfg.configLabel,
        children: p.cfg.configLabel
      }), t.jsx("td", {
        className: "px-2 py-1.5",
        children: t.jsx("span", {
          className: p.side === "Long" ? "text-emerald-400" : "text-rose-400",
          children: p.side
        })
      }), t.jsx("td", {
        className: "px-2 py-1.5 text-right tabular-nums",
        children: p.summary.count
      }), y.map(o => {
        const j = c ? p.summary.bandHitRate?.[o.label] ?? p.summary.hitRate[o
          .label] : p.summary.hitRate[o.label];
        return t.jsxs("td", {
          className: `px-1.5 py-1.5 text-right tabular-nums ${qt(j)}`,
          children: [(j * 100).toFixed(0), "%"]
        }, "hit" + o.label)
      }), y.map(o => t.jsx("td", {
        className: "px-1.5 py-1.5 text-right tabular-nums",
        children: $s(p.summary.avgReturn[o.label] ?? 0)
      }, "avg" + o.label))]
    }), a && t.jsx("tr", {
      className: "border-b border-border/50 bg-muted/20",
      children: t.jsx("td", {
        colSpan: 10 + y.length * 2,
        className: "px-3 py-2",
        children: t.jsx(Xs, {
          tr: i,
          horizons: y,
          useBand: c,
          priceContext: x,
          hitConditionsOpen: l,
          toggleHitConditions: s
        })
      })
    })]
  })
}

function Xs({
  tr: u,
  horizons: p,
  useBand: a,
  priceContext: S,
  hitConditionsOpen: y,
  toggleHitConditions: c
}) {
  const x = r.useMemo(() => [...u.configs].sort((l, s) => s.bestScore - l.bestScore).slice(0, 8), [u
    .configs
  ]);
  return t.jsxs("div", {
    className: "space-y-2",
    children: [t.jsxs("div", {
      className: "text-xs text-muted-foreground",
      children: ["Top configs for ", u.ticker, " · ", pe[u.kind]]
    }), t.jsxs("table", {
      className: "w-full text-[11px]",
      children: [t.jsx("thead", {
        children: t.jsxs("tr", {
          className: "border-b border-border",
          children: [t.jsx("th", {
            className: "text-left px-2 py-1",
            children: "Config"
          }), t.jsx("th", {
            className: "text-left px-2 py-1",
            children: "Side"
          }), t.jsx("th", {
            className: "text-right px-2 py-1",
            children: "Score"
          }), t.jsx("th", {
            className: "text-right px-2 py-1",
            children: "Sigs"
          }), p.map(l => t.jsx("th", {
            className: "text-right px-1.5 py-1",
            children: l.label
          }, "hh" + l.label)), t.jsx("th", {
            className: "text-right px-2 py-1",
            children: "PF best"
          })]
        })
      }), t.jsx("tbody", {
        children: x.map(l => {
          for (const g of l.categories) g.summary.count !== 0 && p.reduce((f,
            B) => f + (g.summary.avgReturn[B.label] ?? 0), 0) / p.length;
          const s = l.categories.reduce((g, f) => g.composite.score > f
              .composite.score ? g : f),
            i = s.summary,
            o = Math.max(...p.map(g => i.profitFactor[g.label] ?? 0)),
            j = `${u.ticker}::${l.configLabel}::${s.category}`,
            m = y.has(j),
            I = !!(s.profiles && s.profiles.length >= 10 && S);
          return t.jsxs(Ds.Fragment, {
            children: [t.jsxs("tr", {
              className: "border-b border-border/40",
              children: [t.jsx("td", {
                className: "px-2 py-1 truncate max-w-[280px]",
                title: l.configLabel,
                children: l.configLabel
              }), t.jsx("td", {
                className: "px-2 py-1",
                children: t.jsx("span", {
                  className: s.category === "buy" ?
                    "text-emerald-400" : "text-rose-400",
                  children: s.category === "buy" ? "Long" :
                    "Short"
                })
              }), t.jsx("td", {
                className: "px-2 py-1 text-right tabular-nums",
                children: t.jsx("span", {
                  style: {
                    backgroundColor: Ut(s.composite.score),
                    color: zt(s.composite.score),
                    padding: "1px 5px",
                    borderRadius: 3,
                    fontWeight: 600
                  },
                  children: s.composite.score
                })
              }), t.jsx("td", {
                className: "px-2 py-1 text-right tabular-nums",
                children: i.count
              }), p.map(g => {
                const f = a ? i.bandHitRate?.[g.label] ?? i
                  .hitRate[g.label] : i.hitRate[g.label];
                return t.jsxs("td", {
                  className: `px-1.5 py-1 text-right tabular-nums ${qt(f)}`,
                  children: [(f * 100).toFixed(0), "%"]
                }, "hh" + g.label + l.configKey)
              }), t.jsxs("td", {
                className: `px-2 py-1 text-right tabular-nums ${As(o)}`,
                children: [I ? t.jsxs("button", {
                  type: "button",
                  onClick: () => c(j),
                  className: `mr-2 px-1.5 py-0.5 rounded text-[9px] font-bold border align-middle ${m?"bg-violet-500/25 text-violet-200 border-violet-400/40":"bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"}`,
                  title: "Profile what other indicators looked like at hit-bars vs miss-bars",
                  children: [m ? "▾" : "▸", " HC"]
                }) : null, o.toFixed(2)]
              })]
            }), m && I && S && s.profiles ? t.jsx("tr", {
              className: "border-b border-border/40 bg-muted/10",
              children: t.jsx("td", {
                colSpan: 5 + p.length,
                className: "px-2 py-2",
                children: t.jsx(Gt, {
                  ticker: S.mode === "pair" && S.pairLegA || u
                    .ticker,
                  priceContext: S,
                  signals: s.profiles,
                  direction: s.category,
                  title: `${l.configLabel} — ${s.category==="buy"?"Long":"Short"}`,
                  useBand: a
                })
              })
            }) : null]
          }, l.configKey)
        })
      })]
    })]
  })
}
export {
  fr as
  default
};