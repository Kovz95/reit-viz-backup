import {
  r as p,
  ag as Ae,
  aj as nr,
  cG as lr,
  cH as ar,
  a as ir,
  af as cr,
  ae as kt,
  dd as Ye,
  cJ as Je,
  cK as Qe,
  cL as dr,
  d0 as vt,
  d1 as jt,
  c_ as Nt,
  c$ as St,
  g as ur,
  cM as xr,
  j as t,
  cO as pr,
  cP as mr,
  cN as Ct,
  de as wt,
  cQ as gr,
  cR as br,
  cU as he,
  cV as fr,
  B as hr,
  z as yr,
  cW as se,
  cX as Xe,
  cY as Se,
  cZ as Rt,
  cT as It,
  cS as Tt,
  df as kr
} from "./index-CsG73Aq_.js";
import {
  e as vr,
  E as jr,
  H as _t
} from "./EvaluatorPanel-BcObXxAZ.js";
import {
  U as Ce
} from "./UnifiedTickerPicker-D927mSvl.js";
import {
  B as Nr
} from "./BasketTickerPill-DA9Wjwwc.js";
import {
  g as $t
} from "./yahooPairsRatio-DERC-reP.js";
import {
  B as Sr
} from "./BasketPicker-DkcKAXfe.js";
import {
  r as et,
  g as Bt
} from "./basketOhlc-CIjRG6QD.js";
import {
  u as Cr
} from "./useOptimizerClassFilter-COCFGQs0.js";
import {
  u as wr
} from "./usePairComboPicker-h_S34tFb.js";
import {
  u as Rr
} from "./useFrequency-DK9YJz0p.js";
import {
  d as Ir,
  e as Ot
} from "./weeklyDownsample-BzVm8wGH.js";
import "./harsi-NMVnsDcX.js";
import "./tva-DaeKqI67.js";
import "./globalUniverse-DuqPcp2u.js";
import "./ClassificationFiltersWithSource-D7v4WOtR.js";
const D = {
    oversold: {
      label: "Oversold Zone",
      description: "RSI in oversold territory — historically cheap momentum, potential bounce",
      direction: "buy"
    },
    neutral_low: {
      label: "Neutral Low",
      description: "RSI between oversold and midpoint — recovering from weakness",
      direction: "buy"
    },
    neutral: {
      label: "Neutral",
      description: "RSI in the middle zone — no strong directional signal",
      direction: "buy"
    },
    neutral_high: {
      label: "Neutral High",
      description: "RSI between midpoint and overbought — strong but not extreme",
      direction: "buy"
    },
    overbought: {
      label: "Overbought Zone",
      description: "RSI in overbought territory — potentially overextended, risk of pullback",
      direction: "sell"
    },
    enter_oversold: {
      label: "Enter Oversold",
      description: "RSI crosses below oversold threshold — transition into weakness",
      direction: "buy"
    },
    exit_oversold: {
      label: "Exit Oversold",
      description: "RSI crosses above oversold threshold — recovery signal",
      direction: "buy"
    },
    enter_overbought: {
      label: "Enter Overbought",
      description: "RSI crosses above overbought threshold — momentum peak",
      direction: "sell"
    },
    exit_overbought: {
      label: "Exit Overbought",
      description: "RSI crosses below overbought threshold — momentum fading",
      direction: "sell"
    }
  },
  Et = [7, 14, 21],
  tt = [20, 25, 30, 35],
  De = [65, 70, 75, 80];

function we(_, B) {
  const f = new Array(_.length).fill(null);
  if (_.length < B + 1) return f;
  const O = [];
  for (let b = 1; b < _.length; b++) O.push(_[b] - _[b - 1]);
  let C = 0,
    H = 0;
  for (let b = 0; b < B; b++) O[b] > 0 ? C += O[b] : H += Math.abs(O[b]);
  if (C /= B, H /= B, H === 0) f[B] = 100;
  else {
    const b = C / H;
    f[B] = 100 - 100 / (1 + b)
  }
  for (let b = B; b < O.length; b++) {
    const X = O[b],
      V = X > 0 ? X : 0,
      ye = X < 0 ? Math.abs(X) : 0;
    if (C = (C * (B - 1) + V) / B, H = (H * (B - 1) + ye) / B, H === 0) f[b + 1] = 100;
    else {
      const Z = C / H;
      f[b + 1] = 100 - 100 / (1 + Z)
    }
  }
  return f
}

function rt(_, B, f) {
  const O = (B + f) / 2;
  return _ <= B ? "oversold" : _ >= f ? "overbought" : _ < O - 5 ? "neutral_low" : _ > O + 5 ?
    "neutral_high" : "neutral"
}

function Zr() {
  const [_, B] = p.useState([]), [f, O] = p.useState(""), [C, H] = p.useState("threshold"), [b, X] =
    p.useState(.05), [V, ye] = p.useState(.05), [Z, ze] = p.useState(.1), [xe, ot] = p.useState(
      "zone"), [u, Re] = p.useState("single"), [z, st] = p.useState([]), [ee, nt] = Ae(
      "rsi-basket-mode", "stocks"), {
      baskets: ke
    } = nr(), [R, Ie] = p.useState(""), [I, Te] = p.useState(""), [E, pe] = p.useState(!1), [ne,
    lt] = p.useState({
      current: 0,
      total: 0
    }), [F, ve] = Ae("rsi-regime-input-selection", kr), [me, _e] = Ae("rsi:results", []), [je, at] =
    p.useState(null), [Pt, Lt] = p.useState(new Set), Mt = p.useCallback(e => {
      Lt(o => {
        const n = new Set(o);
        return n.has(e) ? n.delete(e) : n.add(e), n
      })
    }, []), [le, it] = p.useState("score"), [Fe, At] = p.useState("composite"), [Dt, He] = p
    .useState("10y"), [$, Ue] = p.useState(() => lr()), ct = p.useMemo(() => ar(Fe), [Fe]), Ve = p
    .useRef(!1), dt = p.useRef(!1), [$e, ut] = p.useState("optimize"), [ae, xt] = p.useState(
    "long"), [Be, pt] = Ae("rsi:evalResult", null), [Oe, mt] = p.useState(null), [Ze, q] = p
    .useState(!1), [U, zt] = p.useState("exit_oversold"), [ge, Ft] = p.useState(14), [W, Ht] = p
    .useState(30), [G, Ut] = p.useState(70), [qe, Vt] = p.useState(0), {
      universeTickers: Ke,
      isFiltered: Zt
    } = ir(), v = p.useMemo(() => Ke ? _.filter(e => Ke.has(e.ticker)) : _, [_, Ke]), Ee = Cr(v,
      u === "universe", "rsiregime-clf"), ie = wr(_, u === "pairCombo", "rsi-pc"), gt = Ee
    .filteredTickers, {
      frequency: Ne,
      setFrequency: We,
      frequencyUI: qt
    } = Rr("rsiregime", "daily", E), bt = Ne === "weekly" ? "weekly" : "daily";
  p.useEffect(() => {
    cr().then(e => {
      B(e), e.length > 0 && !dt.current && O(e[0].ticker), e.length > 0 && (Ie(o => o || e[
        0].ticker), Te(o => o || (e[1]?.ticker ?? e[0].ticker)))
    })
  }, []), p.useEffect(() => {
    v.length > 0 && f && _.some(e => e.ticker === f) && !v.find(e => e.ticker === f) && O(v[0]
      .ticker)
  }, [v, f, _]);
  const Kt = p.useCallback(async () => {
      pe(!0), _e([]), Ve.current = !1;
      const e = await kt();
      let o;
      if (u === "pair") {
        if (!R || !I || R === I) {
          pe(!1);
          return
        }
        o = [{
          ticker: `${R}/${I}`,
          name: `${R}/${I}`
        }]
      } else if (u === "pairCombo") {
        if (ie.pairs.length === 0) {
          pe(!1);
          return
        }
        o = ie.pairs.map(a => ({
          ticker: a.label,
          name: a.label,
          pairA: a.a,
          pairB: a.b
        }))
      } else if (u === "single") o = v.filter(a => a.ticker === f);
      else if (u === "basket")
        if (ee === "combined") {
          if (z.length === 0) {
            pe(!1);
            return
          }
          const a = et(z, ke);
          o = [{
            ticker: `BASKET:${a.name}`,
            name: `BASKET:${a.name}`
          }]
        } else o = z.map(a => v.find(i => i.ticker.toUpperCase() === a.toUpperCase()) ?? {
          ticker: a,
          name: a
        });
      else o = gt;
      if (o.length === 0) {
        pe(!1);
        return
      }
      lt({
        current: 0,
        total: o.length
      });
      const n = u === "basket" && ee === "combined" ? et(z, ke) : null,
        T = [];
      for (let a = 0; a < o.length && !Ve.current; a++) {
        const r = o[a];
        lt({
          current: a + 1,
          total: o.length
        });
        try {
          let i, h;
          if (u === "pair" || u === "pairCombo") {
            const g = u === "pairCombo" ? r.pairA : R,
              m = u === "pairCombo" ? r.pairB : I,
              x = await $t(g, m, e);
            if (!x || x.indices.length < 252) continue;
            const w = [],
              j = [];
            for (let k = 0; k < x.indices.length; k++) {
              const A = e[x.indices[k]] || "";
              A >= $.start && A <= $.end && (w.push(x.indices[k]), j.push(x.prices[k]))
            }
            if (w.length < 252) continue;
            i = w, h = j
          } else if (n) {
            const g = await Bt(n, $);
            if (!g || g.closes.length < 252) continue;
            const m = new Map;
            for (let x = 0; x < e.length; x++) m.set(e[x], x);
            i = [], h = [];
            for (let x = 0; x < g.priceDates.length; x++) {
              const w = m.get(g.priceDates[x]) ?? -1;
              w >= 0 && (i.push(w), h.push(g.closes[x]))
            }
            if (i.length < 252) continue
          } else {
            i = [], h = [];
            const g = new Map;
            for (let m = 0; m < e.length; m++) g.set(e[m], m);
            if (F.kind === "workbook") {
              const m = await Ye(r.ticker, F, {
                dateRange: $
              });
              if (!m || m.closes.length < 252) continue;
              for (let x = 0; x < m.closes.length; x++) {
                const w = g.get(m.priceDates[x] ?? "");
                w != null && w >= 0 && (i.push(w), h.push(m.closes[x]))
              }
            } else {
              const m = await Je(r.ticker);
              if (!m || m.adjCloses.length < 252) continue;
              const x = Qe(m, $);
              if (!x || x.adjCloses.length < 252) continue;
              const w = x.dates.slice(0, x.adjCloses.length);
              for (let j = 0; j < x.adjCloses.length; j++) {
                const k = g.get(w[j]);
                k != null && k >= 0 && (i.push(k), h.push(x.adjCloses[j]))
              }
            }
            if (i.length < 252) continue
          }
          const Y = i.map(g => e[g] || ""),
            d = u === "pair" || u === "pairCombo" ? "daily" : Ne,
            s = u === "pair" || u === "pairCombo" ? "daily" : bt,
            l = dr({
              dates: Y,
              closes: h,
              adjCloses: h
            }, s),
            c = h;
          let y = null,
            P;
          d === "weekly_on_daily" ? (y = Ir(h, Y), P = h) : P = l.closes;
          const J = s === "weekly" ? 52 : 252;
          if ((d === "weekly_on_daily" ? h.length : P.length) < J) continue;
          const ce = [];
          for (const g of Et) {
            let m;
            if (d === "weekly_on_daily" && y) {
              const j = we(y.prices, g);
              m = Ot(j.map(A => A === null ? NaN : A), y.weekIndex, h.length).map(A => Number
                .isNaN(A) ? null : A)
            } else m = we(P, g);
            const x = d === "weekly_on_daily",
              w = x ? h.length : P.length;
            if (xe === "zone")
              for (const j of tt)
                for (const k of De) {
                  if (j >= k) continue;
                  const A = {
                    oversold: [],
                    neutral_low: [],
                    neutral: [],
                    neutral_high: [],
                    overbought: []
                  };
                  let de = null;
                  const fe = g + 126;
                  for (let N = fe; N < w; N++) {
                    if (m[N] === null) continue;
                    const S = rt(m[N], j, k);
                    if (de === null) {
                      de = S;
                      continue
                    }
                    if (S !== de) {
                      const M = D[S].direction,
                        re = C === "band" ? {
                          minReturn: V,
                          maxReturn: Z
                        } : null,
                        K = s === "weekly" && !x ? vt(N, l) : N;
                      if (K < 0) {
                        de = S;
                        continue
                      }
                      const oe = jt(c, K, b, M, re);
                      A[S].push(oe)
                    }
                    de = S
                  }
                  const ue = [];
                  for (const [N, S] of Object.entries(A)) {
                    const M = N,
                      re = D[M].direction,
                      K = C === "band",
                      oe = Nt(S, re),
                      Me = St(oe, re, K);
                    ue.push({
                      category: M,
                      label: D[M].label,
                      description: D[M].description,
                      summary: oe,
                      composite: Me,
                      profiles: S
                    })
                  }
                  const L = ue.reduce((N, S) => N.composite.score > S.composite.score ? N : S,
                    ue[0]);
                  ce.push({
                    config: {
                      rsiPeriod: g,
                      oversoldLevel: j,
                      overboughtLevel: k
                    },
                    configLabel: `RSI(${g}) ${j}/${k}`,
                    categories: ue,
                    bestCategory: L.category,
                    bestScore: L.composite.score
                  })
                } else
                  for (const j of tt)
                    for (const k of De) {
                      if (j >= k) continue;
                      const A = {
                          enter_oversold: [],
                          exit_oversold: [],
                          enter_overbought: [],
                          exit_overbought: []
                        },
                        de = g + 126;
                      for (let L = de + 1; L < w; L++) {
                        if (m[L] === null || m[L - 1] === null) continue;
                        const N = m[L],
                          S = m[L - 1],
                          M = [];
                        N <= j && S > j && M.push("enter_oversold"), N > j && S <= j && M.push(
                            "exit_oversold"), N >= k && S < k && M.push("enter_overbought"), N <
                          k && S >= k && M.push("exit_overbought");
                        const re = C === "band" ? {
                          minReturn: V,
                          maxReturn: Z
                        } : null;
                        for (const K of M) {
                          const oe = D[K].direction,
                            Me = s === "weekly" && !x ? vt(L, l) : L;
                          Me < 0 || A[K].push(jt(c, Me, b, oe, re))
                        }
                      }
                      const fe = [];
                      for (const [L, N] of Object.entries(A)) {
                        const S = L,
                          M = D[S].direction,
                          re = C === "band",
                          K = Nt(N, M),
                          oe = St(K, M, re);
                        fe.push({
                          category: S,
                          label: D[S].label,
                          description: D[S].description,
                          summary: K,
                          composite: oe,
                          profiles: N
                        })
                      }
                      const ue = fe.reduce((L, N) => L.composite.score > N.composite.score ? L :
                        N, fe[0]);
                      ce.push({
                        config: {
                          rsiPeriod: g,
                          oversoldLevel: j,
                          overboughtLevel: k
                        },
                        configLabel: `RSI(${g}) ${j}/${k}`,
                        categories: fe,
                        bestCategory: ue.category,
                        bestScore: ue.composite.score
                      })
                    }
          }
          if (ce.length === 0) continue;
          const Q = ce.reduce((g, m) => g.bestScore > m.bestScore ? g : m),
            Le = d === "weekly_on_daily" && y ? (() => {
              const g = we(y.prices, Q.config.rsiPeriod);
              return Ot(g.map(x => x === null ? NaN : x), y.weekIndex, h.length).map(x =>
                Number.isNaN(x) ? null : x)
            })() : we(P, Q.config.rsiPeriod),
            te = Le[Le.length - 1];
          let be = "None";
          if (te !== null) {
            const g = rt(te, Q.config.oversoldLevel, Q.config.overboughtLevel);
            be = D[g].label;
            const m = Le[Le.length - 2];
            if (m !== null) {
              const x = Q.config.oversoldLevel,
                w = Q.config.overboughtLevel;
              te <= x && m > x ? be = "→ Oversold" : te > x && m <= x ? be = "← Oversold" :
                te >= w && m < w ? be = "→ Overbought" : te < w && m >= w && (be =
                  "← Overbought")
            }
          }
          const er = 6,
            tr = [...ce].sort((g, m) => m.bestScore - g.bestScore),
            rr = new Set(tr.slice(0, er));
          for (const g of ce)
            if (!rr.has(g))
              for (const m of g.categories) m.profiles = void 0;
          const or = i.map(g => e[g] || ""),
            sr = {
              prices: h,
              highs: h.slice(),
              lows: h.slice(),
              volumes: null,
              dates: or,
              globalIndices: i.slice(),
              benchmarkPrices: null,
              mode: u === "pair" || u === "pairCombo" ? "pair" : "single",
              pairLegA: u === "pairCombo" ? r.pairA : u === "pair" ? R : void 0,
              pairLegB: u === "pairCombo" ? r.pairB : u === "pair" ? I : void 0
            };
          T.push({
            ticker: r.ticker,
            name: r.name,
            configs: ce,
            bestCategory: D[Q.bestCategory]?.label ?? Q.bestCategory,
            bestScore: Q.bestScore,
            currentSignal: be,
            currentRSI: te !== null ? Math.round(te * 10) / 10 : null,
            priceContext: sr
          }), (a % 5 === 0 || a === o.length - 1) && _e([...T])
        } catch {}
      }
      _e(T), pe(!1)
    }, [v, f, R, I, z, u, xe, b, C, V, Z, Ne, bt, gt, $, ie.pairs, F, ee, ke]),
    Wt = p.useCallback(async () => {
      q(!0), pt(null), mt(null);
      try {
        const e = await kt();
        let o, n;
        if (u === "pair") {
          if (!R || !I || R === I) return;
          const d = await $t(R, I, e);
          if (!d || d.indices.length < 252) return;
          const s = [],
            l = [];
          for (let c = 0; c < d.indices.length; c++) {
            const y = e[d.indices[c]] || "";
            y >= $.start && y <= $.end && (s.push(d.indices[c]), l.push(d.prices[c]))
          }
          if (s.length < 252) return;
          n = s, o = l
        } else if (u === "basket") {
          if (z.length === 0) {
            q(!1);
            return
          }
          if (ee === "combined") {
            const d = et(z, ke),
              s = await Bt(d, $);
            if (!s || s.closes.length < 252) {
              q(!1);
              return
            }
            const l = new Map;
            for (let c = 0; c < e.length; c++) l.set(e[c], c);
            n = [], o = [];
            for (let c = 0; c < s.priceDates.length; c++) {
              const y = l.get(s.priceDates[c]) ?? -1;
              y >= 0 && (n.push(y), o.push(s.closes[c]))
            }
            if (n.length < 252) {
              q(!1);
              return
            }
          } else {
            const d = z[0];
            if (!d) {
              q(!1);
              return
            }
            const s = new Map;
            for (let l = 0; l < e.length; l++) s.set(e[l], l);
            if (n = [], o = [], F.kind === "workbook") {
              const l = await Ye(d, F, {
                dateRange: $
              });
              if (!l || l.closes.length < 252) {
                q(!1);
                return
              }
              for (let c = 0; c < l.closes.length; c++) {
                const y = s.get(l.priceDates[c] ?? "");
                y != null && y >= 0 && (n.push(y), o.push(l.closes[c]))
              }
            } else {
              const l = await Je(d);
              if (!l || l.adjCloses.length < 252) {
                q(!1);
                return
              }
              const c = Qe(l, $);
              if (!c || c.adjCloses.length < 252) {
                q(!1);
                return
              }
              const y = c.dates.slice(0, c.adjCloses.length);
              for (let P = 0; P < c.adjCloses.length; P++) {
                const J = s.get(y[P]);
                J != null && J >= 0 && (n.push(J), o.push(c.adjCloses[P]))
              }
            }
            if (n.length < 252) {
              q(!1);
              return
            }
          }
        } else {
          const d = u === "single" ? f : v[0]?.ticker ?? "";
          if (!d) return;
          const s = new Map;
          for (let l = 0; l < e.length; l++) s.set(e[l], l);
          if (n = [], o = [], F.kind === "workbook") {
            const l = await Ye(d, F, {
              dateRange: $
            });
            if (!l || l.closes.length < 252) return;
            for (let c = 0; c < l.closes.length; c++) {
              const y = s.get(l.priceDates[c] ?? "");
              y != null && y >= 0 && (n.push(y), o.push(l.closes[c]))
            }
          } else {
            const l = await Je(d);
            if (!l || l.adjCloses.length < 252) return;
            const c = Qe(l, $);
            if (!c || c.adjCloses.length < 252) return;
            const y = c.dates.slice(0, c.adjCloses.length);
            for (let P = 0; P < c.adjCloses.length; P++) {
              const J = s.get(y[P]);
              J != null && J >= 0 && (n.push(J), o.push(c.adjCloses[P]))
            }
          }
          if (n.length < 252) return
        }
        const T = n.map(d => e[d] || ""),
          a = we(o, ge),
          r = [],
          i = U === "enter_oversold" || U === "exit_oversold" || U === "enter_overbought" ||
          U === "exit_overbought",
          h = ge + 126;
        if (i)
          for (let d = h + 1; d < o.length; d++) {
            if (a[d] === null || a[d - 1] === null) continue;
            const s = a[d],
              l = a[d - 1],
              c = [];
            s <= W && l > W && c.push("enter_oversold"), s > W && l <= W && c.push(
                "exit_oversold"), s >= G && l < G && c.push("enter_overbought"), s < G && l >=
              G && c.push("exit_overbought"), c.includes(U) && r.push(d)
          } else {
            let d = null;
            for (let s = h; s < o.length; s++) {
              if (a[s] === null) continue;
              const l = rt(a[s], W, G);
              if (d === null) {
                d = l;
                continue
              }
              l !== d && l === U && r.push(s), d = l
            }
          }
        r.sort((d, s) => d - s);
        const Y = vr(o, T, r, ae, b, qe, null, "3M");
        pt(Y), mt({
          prices: o,
          highs: o.slice(),
          lows: o.slice(),
          volumes: null,
          dates: T,
          globalIndices: n.slice(),
          benchmarkPrices: null,
          mode: u === "pair" ? "pair" : "single",
          pairLegA: u === "pair" ? R : void 0,
          pairLegB: u === "pair" ? I : void 0
        })
      } finally {
        q(!1)
      }
    }, [u, R, I, f, v, U, ge, W, G, ae, b, qe, $, F, z, ee, ke]),
    ft = p.useMemo(() => {
      const e = D[U]?.label ?? U;
      return `RSI(${ge}) OS=${W} OB=${G} [${e}] [${ae}]`
    }, [U, ge, W, G, ae]),
    ht = p.useMemo(() => u === "pair" ? `${R||"A"}/${I||"B"}` : u === "single" ? f || "—" : v[0]
      ?.ticker || "—", [u, R, I, f, v]),
    Gt = p.useCallback(() => ({
      selectedTicker: f,
      pairTickerA: R,
      pairTickerB: I,
      basketTickers: z,
      basketMode: ee,
      targetReturn: b,
      signalMode: xe,
      mode: u,
      results: me,
      expandedTicker: je,
      sortBy: le,
      returnMode: C,
      bandMin: V,
      bandMax: Z,
      frequency: Ne,
      pairCombo: ie.serialize(),
      inputSelection: F
    }), [f, R, I, z, ee, b, xe, u, me, je, le, C, V, Z, Ne, ie, F]),
    Yt = p.useCallback(e => {
      if (e && (e.selectedTicker && (O(e.selectedTicker), dt.current = !0), e.pairTickerA && Ie(e
            .pairTickerA), e.pairTickerB && Te(e.pairTickerB), (e.mode === "single" || e.mode ===
            "universe" || e.mode === "pair" || e.mode === "pairCombo" || e.mode === "basket") &&
          Re(e.mode), e.pairCombo && ie.hydrate(e.pairCombo), Array.isArray(e.basketTickers) &&
          st(e.basketTickers.filter(o => typeof o == "string")), (e.basketMode === "stocks" || e
            .basketMode === "combined") && nt(e.basketMode), typeof e.targetReturn == "number" &&
          X(e.targetReturn), e.returnMode && H(e.returnMode), typeof e.bandMin == "number" && ye(e
            .bandMin), typeof e.bandMax == "number" && ze(e.bandMax), e.signalMode && ot(e
            .signalMode), Array.isArray(e.results) && _e(e.results), e.expandedTicker !==
          void 0 && at(e.expandedTicker), e.sortBy && it(e.sortBy), e.frequency === "daily" || e
          .frequency === "weekly" || e.frequency === "weekly_on_daily" ? We(e.frequency) : e
          .timeframe === "weekly" && We("weekly"), e.inputSelection && typeof e.inputSelection ==
          "object")) {
        const o = e.inputSelection;
        o.kind === "close" ? ve({
          kind: "close"
        }) : o.kind === "workbook" && typeof o.metric == "string" && ve({
          kind: "workbook",
          metric: o.metric
        })
      }
    }, [We, ve]);
  ur("rsi-regime-optimizer", Gt, Yt);
  const Ge = p.useMemo(() => me.map(e => ({
      ...e,
      configs: e.configs.map(o => {
        let n = -1 / 0,
          T = o.categories[0];
        for (const a of o.categories) {
          const r = D[a.category]?.direction ?? "buy",
            i = xr(a.summary, a.composite.score, r, ct);
          i > n && (n = i, T = a)
        }
        return {
          ...o,
          bestScore: n,
          bestCategory: T.category
        }
      })
    })).map(e => {
      const o = e.configs.reduce((n, T) => n.bestScore > T.bestScore ? n : T, e.configs[0]);
      return {
        ...e,
        bestScore: o?.bestScore ?? e.bestScore,
        bestCategory: D[o?.bestCategory]?.label ?? o?.bestCategory ?? e.bestCategory
      }
    }), [me, ct]),
    Pe = p.useMemo(() => {
      const e = [...Ge];
      return le === "score" ? e.sort((o, n) => n.bestScore - o.bestScore) : le === "ticker" ? e
        .sort((o, n) => o.ticker.localeCompare(n.ticker)) : le === "rsi" ? e.sort((o, n) => (n
          .currentRSI ?? 0) - (o.currentRSI ?? 0)) : e.sort((o, n) => o.currentSignal
          .localeCompare(n.currentSignal)), e
    }, [Ge, le]),
    Jt = () => {
      const e = se.filter((r, i) => i >= 2),
        o = Pe.map(r => {
          const i = r.configs.reduce((s, l) => s.bestScore > l.bestScore ? s : l, r.configs[0]),
            Y = (i?.categories.find(s => s.category === i.bestCategory) ?? i?.categories.reduce((
              s, l) => s.composite.score > l.composite.score ? s : l, i.categories[0]))?.summary,
            d = {
              ticker: r.ticker,
              name: r.name,
              currentRSI: r.currentRSI ?? null,
              currentSignal: r.currentSignal,
              bestCategory: r.bestCategory,
              bestScore: r.bestScore
            };
          return e.forEach(s => {
            d[`hitRate_${s.label}`] = Y?.hitRate[s.label] ?? null, d[`avgReturn_${s.label}`] =
              Y?.avgReturn[s.label] ?? null
          }), d
        }),
        n = Object.keys(o[0] || {}),
        T = [n.join(","), ...o.map(r => n.map(i => `"${String(r[i]??"").replace(/"/g,'""')}"`).join(
          ","))].join(`
`),
        a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([T], {
        type: "text/csv"
      })), a.download = "rsi_regime_optimizer.csv", a.click()
    },
    Qt = e => e === null ? "text-muted-foreground" : e <= 30 ? "text-emerald-400" : e <= 40 ?
    "text-green-400" : e >= 70 ? "text-red-400" : e >= 60 ? "text-orange-400" : "text-yellow-400",
    yt = e => e.includes("Oversold") ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30" :
    e.includes("Neutral Low") ? "bg-green-600/20 text-green-400 border-green-600/30" : e.includes(
      "Neutral High") ? "bg-orange-600/20 text-orange-400 border-orange-600/30" : e.includes(
      "Overbought") ? "bg-red-600/20 text-red-400 border-red-600/30" : e.includes("Neutral") ?
    "bg-yellow-600/20 text-yellow-400 border-yellow-600/30" : e.includes("→") ?
    "bg-blue-600/20 text-blue-400 border-blue-600/30" : e.includes("←") ?
    "bg-purple-600/20 text-purple-400 border-purple-600/30" :
    "bg-muted text-muted-foreground border-border",
    Xt = Et.length * tt.filter(e => De.some(o => e < o)).length * De.length;
  return t.jsxs("div", {
    className: "flex flex-col h-full overflow-hidden",
    children: [t.jsxs("div", {
      className: "flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3",
      children: [t.jsx("h2", {
        className: "text-sm font-bold text-foreground tracking-tight",
        children: "RSI Regime"
      }), t.jsxs("div", {
        className: "flex gap-px",
        children: [t.jsx("button", {
          "data-testid": "rsi-view-optimize",
          className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${$e==="optimize"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
          onClick: () => ut("optimize"),
          children: "Optimize"
        }), t.jsx("button", {
          "data-testid": "rsi-view-evaluate",
          className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${$e==="evaluate"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
          onClick: () => ut("evaluate"),
          children: "Evaluate"
        })]
      }), t.jsx("span", {
        className: "text-[10px] text-muted-foreground",
        children: $e === "optimize" ? "Search RSI parameter space by hit rate" :
          "Score one specific RSI setup"
      }), t.jsxs("div", {
        className: "flex items-center gap-1",
        children: [t.jsx("label", {
          className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "DATE RANGE"
        }), t.jsx("div", {
          className: "flex items-center gap-0.5",
          children: pr.map(e => t.jsx("button", {
            "data-testid": `rsi-date-preset-${e.value}`,
            className: `text-[9px] font-mono px-1.5 py-0.5 rounded ${Dt===e.value?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border hover:text-foreground"}`,
            onClick: () => {
              He(e.value), Ue(mr(e.value))
            },
            children: e.label
          }, e.value))
        }), t.jsx("input", {
          type: "date",
          "data-testid": "rsi-date-start",
          value: $.start,
          onChange: e => {
            He("custom"), Ue({
              ...$,
              start: e.target.value
            })
          },
          className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
        }), t.jsx("span", {
          className: "text-[10px] font-mono text-muted-foreground",
          children: "→"
        }), t.jsx("input", {
          type: "date",
          "data-testid": "rsi-date-end",
          value: $.end,
          onChange: e => {
            He("custom"), Ue({
              ...$,
              end: e.target.value
            })
          },
          className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
        })]
      })]
    }), $e === "evaluate" ? t.jsxs(t.Fragment, {
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
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${u==="single"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => Re("single"),
                children: "Single"
              }), t.jsx("button", {
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${u==="pair"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => Re("pair"),
                children: "Pair"
              })]
            })]
          }), u === "single" && t.jsxs("div", {
            className: "flex items-end gap-2",
            children: [t.jsx("div", {
              className: Ct(f) ? "opacity-40 pointer-events-none" :
                "",
              children: t.jsx(Ce, {
                tickers: v,
                value: Ct(f) ? "" : f,
                onChange: O,
                label: "Ticker"
              })
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Basket"
              }), t.jsx(Nr, {
                activeTicker: f,
                onSelectTicker: O,
                fallbackTicker: v[0]?.ticker ?? null
              })]
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Input Series"
              }), t.jsx(wt, {
                value: F,
                onChange: ve,
                family: "rsi_regime",
                label: ""
              })]
            })]
          }), u === "pair" && t.jsxs(t.Fragment, {
            children: [t.jsx(Ce, {
              tickers: v,
              value: R,
              onChange: Ie,
              label: "Ticker A"
            }), t.jsx(Ce, {
              tickers: v,
              value: I,
              onChange: Te,
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
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${ae==="long"?"bg-emerald-600 text-white":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => xt("long"),
                children: "Long"
              }), t.jsx("button", {
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${ae==="short"?"bg-red-600 text-white":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => xt("short"),
                children: "Short"
              })]
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Signal Mode"
            }), t.jsxs("select", {
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground",
              value: U,
              onChange: e => zt(e.target.value),
              children: [t.jsxs("optgroup", {
                label: "Zone Entry",
                children: [t.jsx("option", {
                  value: "oversold",
                  children: "Oversold Zone"
                }), t.jsx("option", {
                  value: "neutral_low",
                  children: "Neutral Low Zone"
                }), t.jsx("option", {
                  value: "neutral",
                  children: "Neutral Zone"
                }), t.jsx("option", {
                  value: "neutral_high",
                  children: "Neutral High Zone"
                }), t.jsx("option", {
                  value: "overbought",
                  children: "Overbought Zone"
                })]
              }), t.jsxs("optgroup", {
                label: "Transitions",
                children: [t.jsx("option", {
                  value: "enter_oversold",
                  children: "Enter Oversold"
                }), t.jsx("option", {
                  value: "exit_oversold",
                  children: "Exit Oversold"
                }), t.jsx("option", {
                  value: "enter_overbought",
                  children: "Enter Overbought"
                }), t.jsx("option", {
                  value: "exit_overbought",
                  children: "Exit Overbought"
                })]
              })]
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "RSI Length"
            }), t.jsx("input", {
              type: "number",
              min: 2,
              max: 100,
              value: ge,
              onChange: e => Ft(parseInt(e.target.value) || 14),
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "OS"
            }), t.jsx("input", {
              type: "number",
              min: 1,
              max: 49,
              value: W,
              onChange: e => Ht(parseInt(e.target.value) || 30),
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[55px]"
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "OB"
            }), t.jsx("input", {
              type: "number",
              min: 51,
              max: 99,
              value: G,
              onChange: e => Ut(parseInt(e.target.value) || 70),
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[55px]"
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
              value: +(b * 100).toFixed(4),
              onChange: e => X((parseFloat(e.target.value) || 5) /
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
              value: qe,
              onChange: e => Vt(parseInt(e.target.value) || 0),
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: " "
            }), t.jsx("button", {
              "data-testid": "rsi-eval-run",
              className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
              onClick: Wt,
              disabled: Ze,
              children: Ze ? "Evaluating…" : "Evaluate"
            })]
          })]
        })
      }), t.jsxs("div", {
        className: "flex-1 overflow-auto p-4 space-y-3",
        children: [t.jsx(jr, {
          result: Be,
          loading: Ze,
          setupLabel: ft,
          tickerLabel: ht
        }), Be && Oe && Be.profiles.length >= 10 ? t.jsx(_t, {
          ticker: Oe.mode === "pair" ? Oe.pairLegA || "" : f || v[0]
            ?.ticker || "",
          priceContext: Oe,
          signals: Be.profiles,
          direction: ae === "long" ? "buy" : "sell",
          title: `Hit Conditions — ${ft} on ${ht}`,
          useBand: !1
        }) : null]
      })]
    }) : t.jsxs(t.Fragment, {
      children: [t.jsx("div", {
        className: "flex-shrink-0 px-4 py-3 border-b border-border bg-card",
        children: t.jsxs("div", {
          className: "flex items-center gap-4 flex-wrap",
          children: [t.jsxs("div", {
            children: [t.jsxs("div", {
              className: "flex items-center gap-2",
              children: [t.jsx("h2", {
                className: "text-sm font-bold text-foreground tracking-tight",
                children: "RSI Regime"
              }), Zt && t.jsxs("span", {
                className: "text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30",
                children: [v.length, "/", _.length]
              })]
            }), t.jsx("p", {
              className: "text-[10px] text-muted-foreground mt-0.5",
              children: "Classify RSI regimes and transitions, measure forward returns from each zone"
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Signal Mode"
            }), t.jsx("div", {
              className: "flex gap-px",
              children: ["zone", "transition"].map(e => t.jsx(
                "button", {
                  className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${xe===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                  onClick: () => ot(e),
                  disabled: E,
                  children: e === "zone" ? "Zone Entry" :
                    "Transition"
                }, e))
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Mode"
            }), t.jsx("div", {
              className: "flex gap-px",
              children: ["single", "universe", "pair", "pairCombo",
                "basket"
              ].map(e => t.jsx("button", {
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${u===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => Re(e),
                disabled: E,
                "data-testid": `optimizer-mode-${e}`,
                children: e === "single" ? "Single Ticker" :
                  e === "universe" ? "Universe" : e ===
                  "pair" ? "Pair (A/B)" : e === "pairCombo" ?
                  "Pair Combo" : "Basket"
              }, e))
            })]
          }), u === "pair" && t.jsxs("div", {
            className: "flex items-end gap-2",
            children: [t.jsx(Ce, {
              tickers: v,
              value: R,
              onChange: Ie,
              disabled: E,
              label: "A"
            }), t.jsx(Ce, {
              tickers: v,
              value: I,
              onChange: Te,
              disabled: E,
              label: "B"
            }), t.jsxs("span", {
              className: "text-[10px] font-mono text-muted-foreground pb-1",
              children: ["Ratio: ", t.jsxs("span", {
                className: "text-foreground font-bold",
                children: [R || "A", "/", I || "B"]
              })]
            })]
          }), u === "pairCombo" && t.jsxs("div", {
            className: "flex flex-col gap-1 w-full",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Pair Combo — Leg Set"
            }), ie.ui]
          }), u === "basket" && t.jsxs("div", {
            className: "flex flex-col gap-2",
            children: [t.jsx(Sr, {
              tickers: v,
              value: z,
              onChange: st,
              disabled: E,
              testIdPrefix: "rsi-basket"
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Basket Run Mode"
              }), t.jsx("div", {
                className: "flex gap-px",
                "data-testid": "rsi-basket-mode",
                children: ["stocks", "combined"].map(e => t
                  .jsx("button", {
                    "data-testid": `rsi-basket-mode-${e}`,
                    className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${ee===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                    onClick: () => nt(e),
                    disabled: E,
                    title: e === "stocks" ?
                      "Run optimizer on each basket constituent separately" :
                      "Run optimizer on a single synthetic series using the basket's weighting scheme",
                    children: e === "stocks" ?
                      "Stock by Stock" : "Combined"
                  }, e))
              })]
            })]
          }), qt, u === "universe" && Ee.classFilterUI && t.jsxs("div", {
            className: "flex flex-col gap-1 w-full",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Classification Filter"
            }), Ee.universeSourceUI, Ee.classFilterUI]
          }), u === "single" && t.jsxs("div", {
            className: "flex items-end gap-2",
            children: [t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Ticker"
              }), t.jsx("select", {
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px]",
                value: f,
                onChange: e => O(e.target.value),
                disabled: E,
                children: v.map(e => t.jsx("option", {
                  value: e.ticker,
                  children: e.ticker
                }, e.ticker))
              })]
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Input Series"
              }), t.jsx(wt, {
                value: F,
                onChange: ve,
                family: "rsi_regime",
                label: ""
              })]
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Return Measure"
            }), t.jsx("div", {
              className: "flex gap-px",
              children: ["threshold", "band"].map(e => t.jsx(
                "button", {
                  className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${C===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                  onClick: () => H(e),
                  disabled: E,
                  children: e === "threshold" ? "Threshold" :
                    "Band"
                }, e))
            })]
          }), C === "threshold" ? t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Target"
            }), t.jsx("select", {
              className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px]",
              value: b,
              onChange: e => X(Number(e.target.value)),
              disabled: E,
              children: gr.map(e => t.jsx("option", {
                value: e.value,
                children: e.label
              }, e.value))
            })]
          }) : t.jsxs(t.Fragment, {
            children: [t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Band"
              }), t.jsx("select", {
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[80px]",
                value: `${V}-${Z}`,
                onChange: e => {
                  const [o, n] = e.target.value.split("-")
                    .map(Number);
                  ye(o), ze(n)
                },
                disabled: E,
                children: br.map(e => t.jsx("option", {
                  value: `${e.band.minReturn}-${e.band.maxReturn}`,
                  children: e.label
                }, e.label))
              })]
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Min %"
              }), t.jsx("input", {
                type: "number",
                step: "1",
                min: "0",
                max: "100",
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14",
                value: Math.round(V * 100),
                onChange: e => ye(Number(e.target.value) /
                  100),
                disabled: E
              })]
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Max %"
              }), t.jsx("input", {
                type: "number",
                step: "1",
                min: "0",
                max: "100",
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14",
                value: Math.round(Z * 100),
                onChange: e => ze(Number(e.target.value) /
                  100),
                disabled: E
              })]
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: " "
            }), E ? t.jsxs("button", {
              className: "text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500",
              onClick: () => {
                Ve.current = !0
              },
              children: ["Cancel (", ne.current, "/", ne.total, ")"]
            }) : t.jsx("button", {
              className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90",
              onClick: Kt,
              children: "Run Optimizer"
            })]
          })]
        })
      }), t.jsxs("div", {
        className: "flex-1 overflow-auto px-4 py-3",
        children: [me.length === 0 && !E && t.jsx("div", {
          className: "flex items-center justify-center h-full text-muted-foreground text-sm",
          children: "Classifies RSI regimes (oversold / neutral / overbought) and measures forward returns from each zone entry or transition"
        }), E && me.length === 0 && t.jsx("div", {
          className: "flex items-center justify-center h-full",
          children: t.jsxs("div", {
            className: "text-center",
            children: [t.jsx("div", {
              className: "text-sm text-muted-foreground mb-2",
              children: "Computing RSI regimes..."
            }), t.jsxs("div", {
              className: "text-xs font-mono text-muted-foreground",
              children: [ne.current, "/", ne.total, " tickers × ",
                Xt, " configs"
              ]
            }), t.jsx("div", {
              className: "w-48 h-1 bg-border rounded-full mt-2 mx-auto overflow-hidden",
              children: t.jsx("div", {
                className: "h-full bg-primary rounded-full transition-all duration-300",
                style: {
                  width: `${ne.total>0?ne.current/ne.total*100:0}%`
                }
              })
            })]
          })
        }), Pe.length > 0 && t.jsxs("div", {
          children: [t.jsxs("div", {
            className: "flex items-center justify-between mb-2",
            children: [t.jsxs("h3", {
              className: "text-xs font-bold text-foreground uppercase tracking-wider",
              children: [Pe.length, " tickers — RSI ", xe, " — ",
                C === "band" ? `band ${he(V)}–${he(Z)}` :
                `target ${he(b)}`
              ]
            }), t.jsxs("div", {
              className: "flex items-center gap-1",
              children: [
                ["score", "rsi", "signal", "ticker"].map(e => t
                  .jsx("button", {
                    className: `text-[9px] font-mono px-2 py-0.5 rounded ${le===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border"}`,
                    onClick: () => it(e),
                    children: e === "score" ? "Score" : e ===
                      "rsi" ? "RSI" : e === "signal" ?
                      "Signal" : "Ticker"
                  }, e)), t.jsxs("div", {
                  className: "flex items-center gap-1",
                  children: [t.jsx("label", {
                    className: "text-[10px] font-mono text-muted-foreground",
                    children: "RANK BY"
                  }), t.jsx("select", {
                    "data-testid": "rsi-rank-by",
                    value: Fe,
                    onChange: e => At(e.target.value),
                    className: "text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5",
                    children: fr.map(e => t.jsx(
                      "option", {
                        value: e.value,
                        children: e.label
                      }, e.value))
                  })]
                }), t.jsx(hr, {
                  variant: "outline",
                  size: "sm",
                  className: "h-6 gap-1 text-[11px]",
                  onClick: Jt,
                  "data-testid": "export-csv",
                  children: t.jsx(yr, {
                    className: "w-3 h-3"
                  })
                })
              ]
            })]
          }), t.jsx("div", {
            className: "overflow-x-auto border border-border rounded mb-4",
            children: t.jsxs("table", {
              className: "w-full text-[10px] font-mono",
              children: [t.jsx("thead", {
                children: t.jsxs("tr", {
                  className: "bg-card text-muted-foreground",
                  children: [t.jsx("th", {
                    className: "text-left px-2 py-1 font-bold sticky left-0 bg-card z-10 border-r border-border",
                    children: "Ticker"
                  }), t.jsx("th", {
                    className: "text-center px-2 py-1 font-bold",
                    children: "RSI"
                  }), t.jsx("th", {
                    className: "text-center px-2 py-1 font-bold",
                    children: "Current Signal"
                  }), t.jsx("th", {
                    className: "text-center px-2 py-1 font-bold",
                    children: "Best Config"
                  }), t.jsx("th", {
                    className: "text-center px-2 py-1 font-bold",
                    children: "Best Signal"
                  }), se.filter((e, o) => o >= 2).map(
                    e => t.jsxs("th", {
                      className: "text-center px-2 py-1 font-bold",
                      children: [C === "band" ?
                        "Band" : "Hit", " ", e
                        .label
                      ]
                    }, e.label)), se.filter((e, o) =>
                    o >= 2).map(e => t.jsxs("th", {
                    className: "text-center px-2 py-1 font-bold",
                    children: ["Avg ", e.label]
                  }, `avg-${e.label}`)), se.filter((e,
                    o) => o >= 2).map(e => t.jsxs(
                    "th", {
                      className: "text-center px-2 py-1 font-bold",
                      children: ["PF ", e.label]
                    }, `pf-${e.label}`)), t.jsx(
                  "th", {
                    className: "text-center px-2 py-1 font-bold",
                    children: "Score"
                  })]
                })
              }), t.jsx("tbody", {
                children: Pe.map(e => {
                  const o = je === e.ticker,
                    n = e.configs.reduce((r, i) => r
                      .bestScore > i.bestScore ? r : i, e
                      .configs[0]),
                    a = (n?.categories.find(r => r
                        .category === n.bestCategory) ?? n
                      ?.categories.reduce((r, i) => r
                        .composite.score > i.composite
                        .score ? r : i, n.categories[0]))
                    ?.summary;
                  return t.jsxs("tr", {
                    className: `${o?"bg-primary/10":"hover:bg-white/5"} cursor-pointer`,
                    onClick: () => at(o ? null : e
                      .ticker),
                    children: [t.jsx("td", {
                        className: "px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border",
                        children: e.ticker
                      }), t.jsx("td", {
                        className: `text-center px-2 py-1 font-bold ${Qt(e.currentRSI)}`,
                        children: e.currentRSI !==
                          null ? e.currentRSI
                          .toFixed(1) : "–"
                      }), t.jsx("td", {
                        className: "text-center px-2 py-1",
                        children: t.jsx("span", {
                          className: `inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${yt(e.currentSignal)}`,
                          children: e
                            .currentSignal
                        })
                      }), t.jsx("td", {
                        className: "text-center px-2 py-1 text-muted-foreground",
                        children: n?.configLabel
                      }), t.jsx("td", {
                        className: "text-center px-2 py-1 text-primary font-bold",
                        children: e.bestCategory
                      }), se.filter((r, i) => i >=
                        2).map(r => {
                        const i = a ? C ===
                          "band" ? a.bandHitRate
                          ?.[r.label] ?? a
                          .hitRate[r.label] : a
                          .hitRate[r.label] : 0;
                        return t.jsx("td", {
                          className: `text-center px-2 py-1 ${a?Xe(i):""}`,
                          children: a ? he(
                            i) : "–"
                        }, r.label)
                      }), se.filter((r, i) => i >=
                        2).map(r => t.jsx("td", {
                        className: `text-center px-2 py-1 ${a?a.avgReturn[r.label]>=0?"text-green-400":"text-red-400":""}`,
                        children: a ? Se(a
                            .avgReturn[r.label]
                            ) : "–"
                      }, `avg-${r.label}`)), se
                      .filter((r, i) => i >= 2).map(
                        r => t.jsx("td", {
                          className: `text-center px-2 py-1 ${a?Rt(a.profitFactor[r.label]):""}`,
                          children: a ? a
                            .profitFactor[r
                            .label] >= 99 ? "∞" :
                            a.profitFactor[r
                              .label].toFixed(2) :
                            "–"
                        }, `pf-${r.label}`)), t.jsx(
                        "td", {
                          className: "text-center px-2 py-1",
                          children: t.jsx("span", {
                            className: "inline-block px-1.5 py-0.5 rounded font-bold",
                            style: {
                              backgroundColor: Tt(
                                e.bestScore),
                              color: It(e
                                .bestScore)
                            },
                            children: e
                              .bestScore
                          })
                        })
                    ]
                  }, e.ticker)
                })
              })]
            })
          }), je && (() => {
            const e = Ge.find(n => n.ticker === je);
            if (!e) return null;
            const o = [...e.configs].sort((n, T) => T.bestScore - n
              .bestScore);
            return t.jsxs("div", {
              className: "border border-border rounded p-3 bg-card/50 mb-4",
              children: [t.jsxs("h4", {
                className: "text-xs font-bold text-foreground mb-1",
                children: [e.ticker, " — ", e.name, " — RSI ",
                  e.currentRSI !== null ? e.currentRSI
                  .toFixed(1) : "N/A"
                ]
              }), t.jsxs("p", {
                className: "text-[9px] text-muted-foreground mb-3",
                children: [o.length,
                  " configurations tested — showing top results"
                ]
              }), t.jsx("div", {
                className: "grid grid-cols-1 lg:grid-cols-2 gap-3",
                children: o.slice(0, 6).map((n, T) => {
                  const a = n.categories.find(r => r
                      .category === n.bestCategory) ?? n
                    .categories.reduce((r, i) => r
                      .composite.score > i.composite
                      .score ? r : i, n.categories[0]);
                  return t.jsxs("div", {
                    className: "border border-border/50 rounded p-2",
                    children: [t.jsxs("div", {
                      className: "flex items-center gap-2 mb-1",
                      children: [t.jsx("span", {
                        className: "text-[10px] font-mono font-bold text-foreground",
                        children: n
                          .configLabel
                      }), t.jsxs("span", {
                        className: "text-[9px] text-muted-foreground",
                        children: ["→ ", a
                          .label
                        ]
                      }), t.jsx("span", {
                        className: "ml-auto inline-block px-1.5 py-0.5 rounded text-[9px] font-bold",
                        style: {
                          backgroundColor: Tt(
                              n.bestScore
                              ),
                          color: It(n
                            .bestScore)
                        },
                        children: n
                          .bestScore
                      })]
                    }), n.categories.filter(r => r
                      .summary.count > 0).sort((r,
                        i) => i.composite.score -
                      r.composite.score).map(
                    r => {
                      const i =
                        `${e.ticker}::${n.configLabel}::${r.category}`,
                        h = Pt.has(i),
                        Y = !!(r.profiles && r
                          .profiles.length >=
                          10 && e.priceContext),
                        d = D[r.category]
                        ?.direction === "sell" ?
                        "sell" : "buy";
                      return t.jsxs("div", {
                        className: "mt-1",
                        children: [t.jsxs(
                            "div", {
                              className: "flex items-center gap-1 mb-0.5",
                              children: [t
                                .jsx(
                                  "span", {
                                    className: `text-[9px] font-bold ${yt(r.label).split(" ").filter(s=>s.startsWith("text-")).join(" ")}`,
                                    children: r
                                      .label
                                  }), t
                                .jsxs(
                                  "span", {
                                    className: "text-[8px] text-muted-foreground",
                                    children: [
                                      r
                                      .summary
                                      .count,
                                      " signals"
                                    ]
                                  }),
                                Y ? t
                                .jsxs(
                                  "button", {
                                    type: "button",
                                    onClick: () =>
                                      Mt(
                                        i
                                        ),
                                    className: `ml-auto px-1.5 py-0.5 rounded text-[8px] font-bold border ${h?"bg-violet-500/25 text-violet-200 border-violet-400/40":"bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"}`,
                                    title: "Profile what other indicators looked like at hit-bars vs miss-bars",
                                    children: [
                                      h ?
                                      "▾" :
                                      "▸",
                                      " Hit Conditions"
                                    ]
                                  }) :
                                null
                              ]
                            }), t.jsxs(
                            "table", {
                              className: "w-full text-[9px] font-mono",
                              children: [t
                                .jsx(
                                  "thead", {
                                    children: t
                                      .jsxs(
                                        "tr", {
                                          className: "text-muted-foreground",
                                          children: [
                                            t
                                            .jsx(
                                              "th", {
                                                className: "text-left px-1 py-0.5",
                                                children: "Hz"
                                              }
                                              ),
                                            t
                                            .jsx(
                                              "th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Hit"
                                              }
                                              ),
                                            t
                                            .jsx(
                                              "th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Win"
                                              }
                                              ),
                                            t
                                            .jsx(
                                              "th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Avg"
                                              }
                                              ),
                                            t
                                            .jsx(
                                              "th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Med"
                                              }
                                              ),
                                            t
                                            .jsx(
                                              "th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Peak"
                                              }
                                              ),
                                            t
                                            .jsx(
                                              "th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Trough"
                                              }
                                              ),
                                            t
                                            .jsx(
                                              "th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "PF"
                                              }
                                              )
                                          ]
                                        }
                                        )
                                  }), t
                                .jsx(
                                  "tbody", {
                                    children: se
                                      .map(
                                        s =>
                                        t
                                        .jsxs(
                                          "tr", {
                                            children: [
                                              t
                                              .jsx(
                                                "td", {
                                                  className: "px-1 py-0.5 text-foreground font-bold",
                                                  children: s
                                                    .label
                                                }
                                                ),
                                              t
                                              .jsx(
                                                "td", {
                                                  className: `text-center px-1 py-0.5 ${Xe(r.summary.hitRate[s.label])}`,
                                                  children: he(
                                                    r
                                                    .summary
                                                    .hitRate[
                                                      s
                                                      .label
                                                      ]
                                                    )
                                                }
                                                ),
                                              t
                                              .jsx(
                                                "td", {
                                                  className: `text-center px-1 py-0.5 ${Xe(r.summary.winRate[s.label])}`,
                                                  children: he(
                                                    r
                                                    .summary
                                                    .winRate[
                                                      s
                                                      .label
                                                      ]
                                                    )
                                                }
                                                ),
                                              t
                                              .jsx(
                                                "td", {
                                                  className: `text-center px-1 py-0.5 ${r.summary.avgReturn[s.label]>=0?"text-green-400":"text-red-400"}`,
                                                  children: Se(
                                                    r
                                                    .summary
                                                    .avgReturn[
                                                      s
                                                      .label
                                                      ]
                                                    )
                                                }
                                                ),
                                              t
                                              .jsx(
                                                "td", {
                                                  className: `text-center px-1 py-0.5 ${r.summary.medianReturn[s.label]>=0?"text-green-400":"text-red-400"}`,
                                                  children: Se(
                                                    r
                                                    .summary
                                                    .medianReturn[
                                                      s
                                                      .label
                                                      ]
                                                    )
                                                }
                                                ),
                                              t
                                              .jsx(
                                                "td", {
                                                  className: "text-center px-1 py-0.5 text-green-400",
                                                  children: Se(
                                                    r
                                                    .summary
                                                    .avgPeak[
                                                      s
                                                      .label
                                                      ]
                                                    )
                                                }
                                                ),
                                              t
                                              .jsx(
                                                "td", {
                                                  className: "text-center px-1 py-0.5 text-red-400",
                                                  children: Se(
                                                    r
                                                    .summary
                                                    .avgTrough[
                                                      s
                                                      .label
                                                      ]
                                                    )
                                                }
                                                ),
                                              t
                                              .jsx(
                                                "td", {
                                                  className: `text-center px-1 py-0.5 ${Rt(r.summary.profitFactor[s.label])}`,
                                                  children: r
                                                    .summary
                                                    .profitFactor[
                                                      s
                                                      .label
                                                      ] >=
                                                    99 ?
                                                    "∞" :
                                                    r
                                                    .summary
                                                    .profitFactor[
                                                      s
                                                      .label
                                                      ]
                                                    .toFixed(
                                                      2
                                                      )
                                                }
                                                )
                                            ]
                                          },
                                          s
                                          .label
                                          )
                                        )
                                  })
                              ]
                            }), h && e
                          .priceContext &&
                          r.profiles ? t
                          .jsx("div", {
                            className: "mt-2",
                            children: t
                              .jsx(_t, {
                                ticker: e
                                  .ticker,
                                priceContext: e
                                  .priceContext,
                                signals: r
                                  .profiles,
                                direction: d,
                                title: `${n.configLabel} — ${r.label}`,
                                useBand: C ===
                                  "band"
                              })
                          }) : null
                        ]
                      }, r.category)
                    })]
                  }, T)
                })
              })]
            })
          })()]
        })]
      })]
    })]
  })
}
export {
  Zr as
  default
};