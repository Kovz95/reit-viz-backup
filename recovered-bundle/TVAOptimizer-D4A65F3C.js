import {
  r as o,
  ag as Pe,
  aj as ns,
  cH as as,
  cG as is,
  a as ls,
  af as cs,
  g as ds,
  ae as Ae,
  cJ as ce,
  cK as Ne,
  cL as us,
  d0 as ps,
  d1 as ms,
  c_ as xs,
  c$ as gs,
  cM as fs,
  cW as re,
  j as t,
  cN as $e,
  de as vt,
  cO as jt,
  cP as yt,
  B as bs,
  z as hs,
  cV as ks,
  cT as Nt,
  cS as Ct,
  R as vs,
  cX as js,
  cY as ys,
  df as Ns
} from "./index-CsG73Aq_.js";
import {
  g as wt
} from "./yahooPairsRatio-DERC-reP.js";
import {
  e as Cs,
  E as ws,
  H as St
} from "./EvaluatorPanel-BcObXxAZ.js";
import {
  u as Ss
} from "./useOptimizerClassFilter-COCFGQs0.js";
import {
  u as Ts
} from "./usePairComboPicker-h_S34tFb.js";
import {
  u as Bs
} from "./useFrequency-DK9YJz0p.js";
import {
  d as Rs
} from "./weeklyDownsample-BzVm8wGH.js";
import {
  U as de
} from "./UnifiedTickerPicker-D927mSvl.js";
import {
  B as Tt
} from "./BasketTickerPill-DA9Wjwwc.js";
import {
  B as Ls
} from "./BasketPicker-DkcKAXfe.js";
import {
  r as tt,
  g as Bt
} from "./basketOhlc-CIjRG6QD.js";
import {
  c as Fs
} from "./tva-DaeKqI67.js";
import "./harsi-NMVnsDcX.js";
import "./globalUniverse-DuqPcp2u.js";
import "./ClassificationFiltersWithSource-D7v4WOtR.js";
const Ie = [{
    key: "regime",
    label: "Regime Flip",
    description: "os crosses 0 (WMA-SMA trend oscillator)"
  }, {
    key: "threshold_cross",
    label: "Threshold Cross",
    description: "bull/bear pressure crosses k × |envelope|"
  }, {
    key: "divergence",
    label: "Bull / Bear Divergence",
    description: "bullPressure crosses bearPressure"
  }],
  Rt = [10, 15, 20, 30, 50],
  Lt = [3, 5, 10],
  Ft = [3, 5, 7, 10],
  Dt = [.3, .5, .7, .9],
  oe = 252,
  Pt = 52,
  At = 5,
  Ds = 6;

function st(z, Ee, d) {
  const j = Fs(z, Ee, d.length, d.smo, d.mult),
    k = [],
    G = [];
  for (let x = Math.max(d.length, d.smo) + 1; x < z.length; x++)
    if (d.signalType === "regime") {
      const r = j.os[x - 1],
        I = j.os[x];
      if (!Number.isFinite(r) || !Number.isFinite(I)) continue;
      r <= 0 && I > 0 ? k.push(x) : r >= 0 && I < 0 && G.push(x)
    } else if (d.signalType === "threshold_cross") {
    const r = j.bullPressure[x - 1],
      I = j.bullPressure[x],
      B = j.bearPressure[x - 1],
      Q = j.bearPressure[x],
      M = j.a[x - 1],
      Y = j.a[x],
      ee = j.b[x - 1],
      C = j.b[x];
    if (!Number.isFinite(r) || !Number.isFinite(I) || !Number.isFinite(M) || !Number.isFinite(Y))
      continue;
    const K = Math.abs(M) * d.threshold,
      ne = Math.abs(Y) * d.threshold,
      E = Math.abs(ee) * d.threshold,
      ae = Math.abs(C) * d.threshold;
    r <= K && I > ne && k.push(x), B <= E && Q > ae && G.push(x)
  } else if (d.signalType === "divergence") {
    const r = j.bullPressure[x - 1],
      I = j.bullPressure[x],
      B = j.bearPressure[x - 1],
      Q = j.bearPressure[x];
    if (!Number.isFinite(r) || !Number.isFinite(I) || !Number.isFinite(B) || !Number.isFinite(Q))
      continue;
    const M = r - B,
      Y = I - Q;
    M <= 0 && Y > 0 ? k.push(x) : M >= 0 && Y < 0 && G.push(x)
  }
  const y = x => {
    for (let r = x.length - 1; r >= 0; r--)
      if (Number.isFinite(x[r])) return x[r];
    return NaN
  };
  return {
    longIdx: k,
    shortIdx: G,
    currentOs: y(j.os),
    currentBullP: y(j.bullPressure),
    currentBearP: y(j.bearPressure)
  }
}

function Me(z) {
  return z == null || !Number.isFinite(z) ? "—" : z > 0 ? "BULL" : z < 0 ? "BEAR" : "FLAT"
}

function Ys() {
  const [z, Ee] = o.useState([]), [d, j] = o.useState(""), [k, G] = o.useState(""), [y, x] = o
    .useState(""), [r, I] = o.useState("single"), [B, Q] = o.useState([]), [M, Y] = Pe(
      "tva-basket-mode", "stocks"), {
      baskets: ee
    } = ns(), [C, K] = o.useState(!1), [ne, E] = o.useState({
      current: 0,
      total: 0
    }), [ae, ue] = Pe("tva-input-selection", Ns), [pe, rt] = Pe("tva:results", []), [me, _e] = o
    .useState([]), [$t, ot] = o.useState(null), [Ce, It] = o.useState("score"), [Oe, Mt] = o
    .useState("composite"), nt = o.useMemo(() => as(Oe), [Oe]), [ze, Et] = o.useState(""), [_t,
    Ot] = o.useState(new Set), zt = o.useCallback(e => {
      Ot(l => {
        const u = new Set(l);
        return u.has(e) ? u.delete(e) : u.add(e), u
      })
    }, []), [at, ie] = o.useState("10y"), [R, le] = o.useState(() => is()), [W, Ue] = o.useState(
      .05), [xe, it] = o.useState(!0), [ge, lt] = o.useState(!0), [fe, ct] = o.useState(!0), [we,
      dt] = o.useState("optimize"), [te, ut] = o.useState("long"), [Se, pt] = Pe("tva:evalResult",
      null), [Te, mt] = o.useState(null), [Ve, F] = o.useState(!1), [Z, Ut] = o.useState("regime"),
    [be, Vt] = o.useState(20), [he, Ht] = o.useState(5), [ke, Gt] = o.useState(5), [ve, Kt] = o
    .useState(.5), [He, qt] = o.useState(0), Be = o.useRef(!1), xt = o.useRef(!1), {
      universeTickers: Ge
    } = ls(), w = o.useMemo(() => Ge ? z.filter(e => Ge.has(e.ticker)) : z, [z, Ge]), Re = Ss(w,
      r === "universe", "tva-clf"), se = Ts(w.map(e => e.ticker), r === "pairCombo", "tva-pc"), Ke =
    Re.filteredTickers, {
      frequency: J,
      frequencyUI: Yt,
      setFrequency: qe
    } = Bs("tva", "daily", C), Wt = J === "weekly" ? "weekly" : "daily";
  o.useEffect(() => {
    cs().then(e => {
      Ee(e), e.length > 0 && !xt.current && j(e[0].ticker), e.length > 0 && (G(l => l || e[
        0].ticker), x(l => l || (e[1]?.ticker ?? e[0].ticker)))
    })
  }, []);
  const Zt = o.useCallback(() => ({
      selectedTicker: d,
      pairTickerA: k,
      pairTickerB: y,
      basketTickers: B,
      basketMode: M,
      mode: r,
      frequency: J,
      targetReturn: W,
      includeRegime: xe,
      includeThreshold: ge,
      includeDivergence: fe,
      pairCombo: se.serialize(),
      inputSelection: ae
    }), [d, k, y, B, M, r, J, W, xe, ge, fe, se, ae]),
    Jt = o.useCallback(e => {
      if (!(!e || typeof e != "object") && (typeof e.selectedTicker == "string" && (j(e
            .selectedTicker), xt.current = !0), typeof e.pairTickerA == "string" && G(e
            .pairTickerA), typeof e.pairTickerB == "string" && x(e.pairTickerB), (e.mode ===
            "single" || e.mode === "universe" || e.mode === "pair" || e.mode === "pairCombo" || e
            .mode === "basket") && I(e.mode), e.pairCombo && se.hydrate(e.pairCombo), Array
          .isArray(e.basketTickers) && Q(e.basketTickers.filter(l => typeof l == "string")), (e
            .basketMode === "stocks" || e.basketMode === "combined") && Y(e.basketMode), e
          .frequency === "daily" || e.frequency === "weekly" || e.frequency ===
          "weekly_on_daily" ? qe(e.frequency) : e.timeframe === "weekly" && qe("weekly"), typeof e
          .targetReturn == "number" && Ue(e.targetReturn), typeof e.includeRegime == "boolean" &&
          it(e.includeRegime), typeof e.includeThreshold == "boolean" && lt(e.includeThreshold),
          typeof e.includeDivergence == "boolean" && ct(e.includeDivergence), e.inputSelection &&
          typeof e.inputSelection == "object")) {
        const l = e.inputSelection;
        l.kind === "close" ? ue({
          kind: "close"
        }) : l.kind === "workbook" && typeof l.metric == "string" && ue({
          kind: "workbook",
          metric: l.metric
        })
      }
    }, [qe, ue]);
  ds("tva-optimizer", Zt, Jt);
  const Ye = o.useMemo(() => {
      const e = [];
      return xe && e.push("regime"), ge && e.push("threshold_cross"), fe && e.push("divergence"),
        e
    }, [xe, ge, fe]),
    Xt = o.useCallback(() => {
      Be.current = !0
    }, []),
    Qt = o.useCallback(async () => {
      F(!0), pt(null), mt(null);
      try {
        if (r === "pair" && (!k || !y || k === y)) {
          F(!1);
          return
        }
        if (r === "single" && !d) {
          F(!1);
          return
        }
        const e = await Ae();
        let l, u, p, c, s, i, f = null;
        if (r === "pair") {
          const S = await wt(k, y, e);
          if (!S || S.indices.length < oe) {
            F(!1);
            return
          }
          const g = await ce(k);
          if (!g) {
            F(!1);
            return
          }
          const n = Ne(g, R),
            T = new Map;
          for (let a = 0; a < n.dates.length; a++) {
            const v = n.volumes[a];
            Number.isFinite(v) && v > 0 && T.set(n.dates[a], v)
          }
          p = S.indices.map(a => e[a] || "");
          const A = p.map(a => T.get(a) ?? 0);
          l = S.prices.slice(), u = A, s = l.slice(), i = l.slice(), c = S.indices.slice()
        } else if (r === "basket") {
          if (B.length === 0) {
            F(!1);
            return
          }
          if (M === "combined") {
            const S = tt(B, ee),
              g = await Bt(S, R);
            if (!g || g.closes.length < oe) {
              F(!1);
              return
            }
            l = g.closes, u = g.volumes, f = g.volumes, s = g.highs, i = g.lows, p = g
              .priceDates;
            const n = new Map;
            for (let T = 0; T < e.length; T++) n.set(e[T], T);
            c = p.map(T => n.get(T) ?? -1)
          } else {
            const S = B[0],
              g = await ce(S);
            if (!g) {
              F(!1);
              return
            }
            const n = Ne(g, R);
            if (n.adjCloses.length < oe) {
              F(!1);
              return
            }
            if (n.volumes.reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0) <= 0) {
              F(!1);
              return
            }
            l = n.adjCloses, u = n.volumes, f = n.volumes, s = n.highs.map((a, v) => {
              const b = n.closes[v],
                $ = n.adjCloses[v];
              return b && b > 0 && Number.isFinite(b) && Number.isFinite($) ? a * ($ / b) :
                a
            }), i = n.lows.map((a, v) => {
              const b = n.closes[v],
                $ = n.adjCloses[v];
              return b && b > 0 && Number.isFinite(b) && Number.isFinite($) ? a * ($ / b) :
                a
            }), p = n.dates.slice(0, n.adjCloses.length);
            const A = new Map;
            for (let a = 0; a < e.length; a++) A.set(e[a], a);
            c = p.map(a => A.get(a) ?? -1)
          }
        } else {
          const S = r === "single" ? d : w[0]?.ticker ?? "";
          if (!S) {
            F(!1);
            return
          }
          const g = await ce(S);
          if (!g) {
            F(!1);
            return
          }
          const n = Ne(g, R);
          if (n.adjCloses.length < oe) {
            F(!1);
            return
          }
          if (n.volumes.reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0) <= 0) {
            F(!1);
            return
          }
          l = n.adjCloses, u = n.volumes, f = n.volumes, s = n.highs.map((a, v) => {
            const b = n.closes[v],
              $ = n.adjCloses[v];
            return b && b > 0 && Number.isFinite(b) && Number.isFinite($) ? a * ($ / b) : a
          }), i = n.lows.map((a, v) => {
            const b = n.closes[v],
              $ = n.adjCloses[v];
            return b && b > 0 && Number.isFinite(b) && Number.isFinite($) ? a * ($ / b) : a
          }), p = n.dates.slice(0, n.adjCloses.length);
          const A = new Map;
          for (let a = 0; a < e.length; a++) A.set(e[a], a);
          c = p.map(a => A.get(a) ?? -1)
        }
        const L = st(l, u, {
            length: be,
            smo: he,
            mult: ke,
            threshold: ve,
            signalType: Z
          }),
          U = te === "long" ? "buy" : "sell",
          O = te === "long" ? L.longIdx.slice() : L.shortIdx.slice();
        O.sort((S, g) => S - g);
        const P = Cs(l, p, O, te, W, He, null, "3M");
        pt(P), mt({
          prices: l,
          highs: s,
          lows: i,
          volumes: r === "pair" ? u : f,
          dates: p,
          globalIndices: c,
          benchmarkPrices: null,
          mode: r === "pair" ? "pair" : "single",
          pairLegA: r === "pair" ? k : void 0,
          pairLegB: r === "pair" ? y : void 0
        })
      } finally {
        F(!1)
      }
    }, [r, d, k, y, w, Z, be, he, ke, ve, te, W, He, R, B, M, ee]),
    gt = o.useMemo(() => {
      const l = `${Ie.find(u=>u.key===Z)?.label??Z} L=${be} smo=${he} m=${ke}`;
      return Z === "threshold_cross" ? `${l} k=${ve}` : l
    }, [Z, be, he, ke, ve]),
    ft = o.useMemo(() => r === "pair" ? `${k||"A"}/${y||"B"}` : r === "single" ? d || "—" : w[0]
      ?.ticker || "—", [r, k, y, d, w]),
    es = o.useCallback(async () => {
      if (C) return;
      Be.current = !1, K(!0), rt([]), _e([]), ot(null);
      let e;
      if (r === "pair") {
        if (!k || !y || k === y) {
          K(!1);
          return
        }
        const s = `${k}/${y}`;
        e = [{
          ticker: s,
          name: s
        }]
      } else if (r === "single") {
        const s = w.find(i => i.ticker === d);
        e = s ? [s] : d ? [{
          ticker: d,
          name: d
        }] : []
      } else if (r === "basket")
        if (M === "combined") {
          if (B.length === 0) {
            K(!1);
            return
          }
          const s = tt(B, ee);
          e = [{
            ticker: `BASKET:${s.name}`,
            name: `BASKET:${s.name}`
          }]
        } else e = B.map(s => w.find(f => f.ticker.toUpperCase() === s.toUpperCase()) ?? {
          ticker: s,
          name: s
        });
      else if (r === "pairCombo") {
        if (se.pairs.length === 0) {
          K(!1);
          return
        }
        e = se.pairs.map(s => ({
          ticker: s.label,
          name: s.label,
          pairA: s.a,
          pairB: s.b
        }))
      } else e = Ke;
      if (e.length === 0) {
        K(!1);
        return
      }
      const l = r === "basket" && M === "combined" ? tt(B, ee) : null;
      if (Ye.length === 0) {
        _e([{
          ticker: "ALL",
          reason: "No signal type selected"
        }]), K(!1);
        return
      }
      E({
        current: 0,
        total: e.length
      });
      const u = [],
        p = [],
        c = r === "pair" || r === "pairCombo" ? await Ae() : [];
      for (let s = 0; s < e.length && !Be.current; s++) {
        const i = e[s];
        try {
          const f = r === "pair" || r === "pairCombo" ? "daily" : Wt,
            D = r === "pairCombo" ? i.pairA : k,
            L = r === "pairCombo" ? i.pairB : y;
          let U, O, P, S = null,
            g, n, T = null,
            A = null;
          if (r === "pair" || r === "pairCombo") {
            const m = await wt(D, L, c);
            if (!m || m.indices.length < oe) {
              u.push({
                ticker: i.ticker,
                reason: "insufficient pair history"
              }), E({
                current: s + 1,
                total: e.length
              });
              continue
            }
            const h = await ce(D);
            if (!h) {
              u.push({
                ticker: i.ticker,
                reason: `no leg A data (${D})`
              }), E({
                current: s + 1,
                total: e.length
              });
              continue
            }
            const N = Ne(h, R),
              V = new Map;
            for (let _ = 0; _ < N.dates.length; _++) {
              const X = N.volumes[_];
              Number.isFinite(X) && X > 0 && V.set(N.dates[_], X)
            }
            g = m.indices.map(_ => c[_] || "");
            const q = g.map(_ => V.get(_) ?? 0);
            if (q.reduce((_, X) => _ + X, 0) <= 0) {
              u.push({
                ticker: i.ticker,
                reason: `no leg A volume (${D})`
              }), E({
                current: s + 1,
                total: e.length
              });
              continue
            }
            U = m.prices.slice(), O = q, P = U, n = m.indices.slice()
          } else if (l) {
            const m = await Bt(l, R);
            if (!m || m.closes.length < oe) {
              u.push({
                ticker: i.ticker,
                reason: "insufficient basket history"
              }), E({
                current: s + 1,
                total: e.length
              });
              continue
            }
            U = m.closes, O = m.volumes, P = m.closes, S = m.volumes, g = m.priceDates, n = []
          } else {
            const m = await ce(i.ticker);
            if (!m) {
              u.push({
                ticker: i.ticker,
                reason: "insufficient history"
              }), E({
                current: s + 1,
                total: e.length
              });
              continue
            }
            const h = Ne(m, R);
            if (h.adjCloses.length < oe) {
              u.push({
                ticker: i.ticker,
                reason: "insufficient history"
              }), E({
                current: s + 1,
                total: e.length
              });
              continue
            }
            if (h.volumes.reduce((V, q) => V + (Number.isFinite(q) ? q : 0), 0) <= 0) {
              u.push({
                ticker: i.ticker,
                reason: "no volume"
              }), E({
                current: s + 1,
                total: e.length
              });
              continue
            }
            if (S = h.volumes, J === "weekly_on_daily") {
              if (T = Rs(h.adjCloses, h.dates), T.prices.length < Pt) {
                u.push({
                  ticker: i.ticker,
                  reason: "insufficient weekly history"
                }), E({
                  current: s + 1,
                  total: e.length
                });
                continue
              }
              const V = T.weekIndex.map(q => h.volumes[q] ?? 0);
              U = T.prices, O = V, P = h.adjCloses, g = h.dates, n = []
            } else {
              if (A = us(h, f), f === "weekly" && A.adjCloses.length < Pt) {
                u.push({
                  ticker: i.ticker,
                  reason: "insufficient weekly history"
                }), E({
                  current: s + 1,
                  total: e.length
                });
                continue
              }
              U = A.adjCloses, O = A.volumes, P = h.adjCloses, g = f === "weekly" ? A.dates : h
                .dates, n = []
            }
          }
          if (r !== "pair" && n.length === 0) try {
            const m = c.length > 0 ? c : await Ae();
            c.length === 0 && c.push(...m);
            const h = new Map;
            for (let N = 0; N < m.length; N++) h.set(m[N], N);
            n = g.map(N => h.get(N) ?? -1)
          } catch {
            n = g.map(() => -1)
          }
          const a = [];
          for (const m of Ye) {
            for (const h of Rt)
              for (const N of Lt)
                for (const V of Ft) {
                  const q = m === "threshold_cross" ? Dt : [0];
                  for (const Xe of q) {
                    const _ = {
                        length: h,
                        smo: N,
                        mult: V,
                        threshold: Xe,
                        signalType: m
                      },
                      X = st(U, O, _),
                      Fe = [];
                    for (const H of ["long", "short"]) {
                      const je = H === "long" ? X.longIdx : X.shortIdx;
                      if (je.length < At) continue;
                      const Qe = H === "long" ? "buy" : "sell",
                        et = je.map(ye => {
                          let De;
                          return J === "weekly_on_daily" && T ? De = T.weekIndex[ye] ?? -1 :
                            De = f === "weekly" && A ? ps(ye, A) : ye, De >= 0 ? ms(P, De, W,
                              Qe) : null
                        }).filter(ye => ye !== null);
                      if (et.length < At) continue;
                      const kt = xs(et, Qe),
                        os = gs(kt, Qe);
                      Fe.push({
                        direction: H,
                        summary: kt,
                        composite: os,
                        profiles: et
                      })
                    }
                    if (Fe.length === 0) continue;
                    const ht = Fe.reduce((H, je) => H.composite.score >= je.composite.score ?
                        H : je),
                      rs = m === "threshold_cross" ?
                      `${Ie.find(H=>H.key===m).label} · L=${h} smo=${N} m=${V} k=${Xe}` :
                      `${Ie.find(H=>H.key===m).label} · L=${h} smo=${N} m=${V}`;
                    a.push({
                      ..._,
                      configLabel: rs,
                      directions: Fe,
                      bestDirection: ht.direction,
                      bestScore: ht.composite.score
                    })
                  }
                }
            if (await new Promise(h => setTimeout(h, 0)), Be.current) break
          }
          a.sort((m, h) => h.bestScore - m.bestScore);
          const v = a.slice(0, Ds);
          if (v.length === 0) {
            u.push({
              ticker: i.ticker,
              reason: "no signals met thresholds"
            }), E({
              current: s + 1,
              total: e.length
            });
            continue
          }
          const b = v[0],
            $ = st(U, O, {
              length: b.length,
              smo: b.smo,
              mult: b.mult,
              threshold: b.threshold,
              signalType: b.signalType
            }),
            We = r === "pair" || r === "pairCombo" ? U : P,
            Ze = r === "pair" || r === "pairCombo" ? g : await (async () => {
              if (f === "weekly" && J !== "weekly_on_daily") {
                const m = await ce(i.ticker);
                return m ? m.dates : g
              }
              return g
            })();
          let Je = n;
          if (r !== "pair" && r !== "pairCombo" && f === "weekly" && J !== "weekly_on_daily")
            try {
              const m = c.length > 0 ? c : await Ae(),
                h = new Map;
              for (let N = 0; N < m.length; N++) h.set(m[N], N);
              Je = Ze.map(N => h.get(N) ?? -1)
            } catch {
              Je = Ze.map(() => -1)
            }
          const ss = {
            prices: We,
            highs: We.slice(),
            lows: We.slice(),
            volumes: r === "pair" || r === "pairCombo" ? O : S,
            dates: Ze,
            globalIndices: Je,
            benchmarkPrices: null,
            mode: r === "pair" || r === "pairCombo" ? "pair" : "single",
            pairLegA: r === "pair" || r === "pairCombo" ? D : void 0,
            pairLegB: r === "pair" || r === "pairCombo" ? L : void 0
          };
          p.push({
            ticker: i.ticker,
            name: i.name || i.ticker,
            configs: v,
            bestConfigLabel: b.configLabel,
            bestDirection: b.bestDirection,
            bestScore: b.bestScore,
            currentOs: $.currentOs,
            currentBullP: $.currentBullP,
            currentBearP: $.currentBearP,
            priceContext: ss
          })
        } catch (f) {
          u.push({
            ticker: i.ticker,
            reason: f?.message || "error"
          })
        }
        E({
          current: s + 1,
          total: e.length
        }), s % 3 === 2 && await new Promise(f => setTimeout(f, 0))
      }
      _e(u), rt(p), K(!1)
    }, [C, r, w, d, k, y, B, Ke, Ye, W, J, R, se.pairs, M, ee]),
    bt = o.useMemo(() => pe.map(e => {
      const u = [...e.configs.map(c => {
          let s = -1 / 0,
            i = c.directions[0];
          for (const f of c.directions) {
            const D = f.direction === "long" ? "buy" : "sell",
              L = fs(f.summary, f.composite.score, D, nt);
            L > s && (s = L, i = f)
          }
          return {
            ...c,
            bestScore: s,
            bestDirection: i.direction
          }
        })].sort((c, s) => s.bestScore - c.bestScore),
        p = u[0];
      return {
        ...e,
        configs: u,
        bestScore: p ? p.bestScore : e.bestScore,
        bestDirection: p ? p.bestDirection : e.bestDirection,
        bestConfigLabel: p ? p.configLabel : e.bestConfigLabel
      }
    }), [pe, nt]),
    Le = o.useMemo(() => {
      const e = ze.trim().toUpperCase();
      let l = bt;
      e && (l = l.filter(p => p.ticker.toUpperCase().includes(e) || p.name.toUpperCase().includes(
        e)));
      const u = [...l];
      return u.sort((p, c) => Ce === "ticker" ? p.ticker.localeCompare(c.ticker) : Ce ===
          "signal" ? Me(p.currentOs).localeCompare(Me(c.currentOs)) : c.bestScore - p.bestScore),
        u
    }, [bt, Ce, ze]),
    ts = o.useCallback(() => {
      const e = [
        ["Ticker", "Name", "Current OS", "Current Bull P", "Current Bear P", "Current Signal",
          "Best Config", "Best Direction", "Best Score", ...re.flatMap(({
            label: s
          }) => [`HitRate_${s}`, `AvgRet_${s}`, `PF_${s}`])
        ]
      ];
      for (const s of Le) {
        const i = s.configs[0];
        if (!i) continue;
        const f = i.directions.find(L => L.direction === s.bestDirection) ?? i.directions[0];
        if (!f) continue;
        const D = f.summary;
        e.push([s.ticker, s.name, s.currentOs?.toFixed(4) ?? "", s.currentBullP?.toFixed(0) ?? "",
          s.currentBearP?.toFixed(0) ?? "", Me(s.currentOs), s.bestConfigLabel, s
          .bestDirection, s.bestScore.toFixed(1), ...re.flatMap(({
            label: L
          }) => [(D.hitRate[L] * 100).toFixed(1) + "%", (D.avgReturn[L] * 100).toFixed(2) +
            "%", (D.profitFactor[L] || 0).toFixed(2)
          ])
        ])
      }
      const l = e.map(s => s.map(i => /[",\n]/.test(i) ? `"${i.replace(/"/g,'""')}"` : i).join(
          ",")).join(`
`),
        u = new Blob([l], {
          type: "text/csv"
        }),
        p = URL.createObjectURL(u),
        c = document.createElement("a");
      c.href = p, c.download = `tva-optimizer-${new Date().toISOString().slice(0,10)}.csv`, c
        .click(), URL.revokeObjectURL(p)
    }, [Le]);
  return t.jsxs("div", {
    className: "flex flex-col h-full text-foreground bg-background",
    children: [t.jsxs("div", {
      className: "flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3",
      children: [t.jsx("h2", {
        className: "text-sm font-bold text-foreground tracking-tight",
        children: "TVA Optimizer"
      }), t.jsxs("div", {
        className: "flex gap-px",
        children: [t.jsx("button", {
          "data-testid": "tva-view-optimize",
          className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${we==="optimize"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
          onClick: () => dt("optimize"),
          children: "Optimize"
        }), t.jsx("button", {
          "data-testid": "tva-view-evaluate",
          className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${we==="evaluate"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
          onClick: () => dt("evaluate"),
          children: "Evaluate"
        })]
      }), t.jsx("span", {
        className: "text-[10px] text-muted-foreground",
        children: we === "optimize" ? "Search parameter space by hit rate" :
          "Score one specific setup"
      })]
    }), we === "evaluate" ? t.jsxs(t.Fragment, {
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
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${r==="single"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => I("single"),
                children: "Single"
              }), t.jsx("button", {
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${r==="pair"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => I("pair"),
                children: "Pair"
              })]
            })]
          }), r === "single" && t.jsxs("div", {
            className: "flex items-end gap-2",
            children: [t.jsx("div", {
              className: $e(d) ? "opacity-40 pointer-events-none" :
                "",
              children: t.jsx(de, {
                tickers: w,
                value: $e(d) ? "" : d,
                onChange: j,
                label: "Ticker"
              })
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Basket"
              }), t.jsx(Tt, {
                activeTicker: d,
                onSelectTicker: j,
                fallbackTicker: w[0]?.ticker ?? null
              })]
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Input Series"
              }), t.jsx(vt, {
                value: ae,
                onChange: ue,
                family: "tva",
                label: ""
              })]
            })]
          }), r === "pair" && t.jsxs(t.Fragment, {
            children: [t.jsx(de, {
              tickers: w,
              value: k,
              onChange: G,
              label: "Ticker A"
            }), t.jsx(de, {
              tickers: w,
              value: y,
              onChange: x,
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
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${te==="long"?"bg-emerald-600 text-white":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => ut("long"),
                children: "Long"
              }), t.jsx("button", {
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${te==="short"?"bg-red-600 text-white":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => ut("short"),
                children: "Short"
              })]
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Signal Type"
            }), t.jsx("div", {
              className: "flex gap-px",
              children: Ie.map(e => t.jsx("button", {
                title: e.description,
                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${Z===e.key?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                onClick: () => Ut(e.key),
                children: e.label
              }, e.key))
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Length"
            }), t.jsx("select", {
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground",
              value: be,
              onChange: e => Vt(parseInt(e.target.value)),
              children: Rt.map(e => t.jsx("option", {
                value: e,
                children: e
              }, e))
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Smo"
            }), t.jsx("select", {
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground",
              value: he,
              onChange: e => Ht(parseInt(e.target.value)),
              children: Lt.map(e => t.jsx("option", {
                value: e,
                children: e
              }, e))
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Mult"
            }), t.jsx("select", {
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground",
              value: ke,
              onChange: e => Gt(parseInt(e.target.value)),
              children: Ft.map(e => t.jsx("option", {
                value: e,
                children: e
              }, e))
            })]
          }), Z === "threshold_cross" && t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Threshold k"
            }), t.jsx("select", {
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground",
              value: ve,
              onChange: e => Kt(parseFloat(e.target.value)),
              children: Dt.map(e => t.jsx("option", {
                value: e,
                children: e
              }, e))
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Target %"
            }), t.jsx("select", {
              className: "text-xs font-mono bg-background border border-border rounded px-2 py-1",
              value: W,
              onChange: e => Ue(parseFloat(e.target.value)),
              children: [.02, .03, .05, .07, .1, .15].map(e => t
                .jsxs("option", {
                  value: e,
                  children: [(e * 100).toFixed(0), "%"]
                }, e))
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Hold"
            }), t.jsx("input", {
              type: "number",
              min: 0,
              value: He,
              onChange: e => qt(parseInt(e.target.value) || 0),
              className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
            })]
          }), t.jsxs("div", {
            className: "flex items-center gap-1",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "DATE RANGE"
            }), t.jsx("div", {
              className: "flex items-center gap-0.5",
              children: jt.map(e => t.jsx("button", {
                "data-testid": `tva-eval-date-preset-${e.value}`,
                className: `text-[9px] font-mono px-1.5 py-0.5 rounded ${at===e.value?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border hover:text-foreground"}`,
                onClick: () => {
                  ie(e.value), le(yt(e.value))
                },
                children: e.label
              }, e.value))
            }), t.jsx("input", {
              type: "date",
              "data-testid": "tva-eval-date-start",
              value: R.start,
              onChange: e => {
                ie("custom"), le({
                  ...R,
                  start: e.target.value
                })
              },
              className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
            }), t.jsx("span", {
              className: "text-[10px] font-mono text-muted-foreground",
              children: "→"
            }), t.jsx("input", {
              type: "date",
              "data-testid": "tva-eval-date-end",
              value: R.end,
              onChange: e => {
                ie("custom"), le({
                  ...R,
                  end: e.target.value
                })
              },
              className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: " "
            }), t.jsx("button", {
              "data-testid": "tva-eval-run",
              className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
              onClick: Qt,
              disabled: Ve,
              children: Ve ? "Evaluating…" : "Evaluate"
            })]
          })]
        })
      }), t.jsxs("div", {
        className: "flex-1 overflow-auto p-4 space-y-3",
        children: [t.jsx(ws, {
          result: Se,
          loading: Ve,
          setupLabel: gt,
          tickerLabel: ft
        }), Se && Te && Se.profiles.length >= 10 ? t.jsx(St, {
          ticker: Te.mode === "pair" ? Te.pairLegA || "" : d || w[0]
            ?.ticker || "",
          priceContext: Te,
          signals: Se.profiles,
          direction: te === "long" ? "buy" : "sell",
          title: `Hit Conditions — ${gt} on ${ft}`,
          useBand: !1
        }) : null]
      })]
    }) : t.jsxs(t.Fragment, {
      children: [t.jsx("div", {
        className: "px-4 py-2 border-b border-border flex items-center justify-between bg-card/30 flex-shrink-0",
        children: t.jsxs("div", {
          children: [t.jsx("h2", {
            className: "text-sm font-bold font-mono",
            children: "TVA Optimizer"
          }), t.jsx("p", {
            className: "text-[10px] font-mono text-muted-foreground",
            children: "Trend Volume Accumulations (LuxAlgo) — grid search across length × smo × mult × threshold × signal type"
          })]
        })
      }), t.jsxs("div", {
        className: "flex flex-wrap items-end gap-3 px-4 py-2 border-b border-border bg-card/30 flex-shrink-0",
        children: [t.jsxs("div", {
          className: "flex flex-col gap-0.5",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Mode"
          }), t.jsx("div", {
            className: "flex gap-px",
            children: ["single", "universe", "pair", "pairCombo",
              "basket"
            ].map(e => t.jsx("button", {
              className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${r===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
              onClick: () => I(e),
              disabled: C,
              "data-testid": `optimizer-mode-${e}`,
              children: e === "single" ? "Single Ticker" : e ===
                "universe" ? "Universe" : e === "pair" ?
                "Pair (A/B)" : e === "pairCombo" ? "Pair Combo" :
                "Basket"
            }, e))
          })]
        }), r === "universe" && Re.classFilterUI && t.jsxs("div", {
          className: "flex flex-col gap-1 w-full",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Classification Filter"
          }), Re.universeSourceUI, Re.classFilterUI]
        }), r === "single" && t.jsx("div", {
          className: "flex items-end gap-2",
          children: t.jsxs("div", {
            className: "flex items-end gap-2",
            children: [t.jsx("div", {
              className: $e(d) ? "opacity-40 pointer-events-none" :
                "",
              children: t.jsx(de, {
                tickers: w,
                value: $e(d) ? "" : d,
                onChange: j,
                disabled: C,
                label: "Ticker"
              })
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Basket"
              }), t.jsx(Tt, {
                activeTicker: d,
                onSelectTicker: j,
                fallbackTicker: w[0]?.ticker ?? null
              })]
            }), t.jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Input Series"
              }), t.jsx(vt, {
                value: ae,
                onChange: ue,
                family: "tva",
                label: ""
              })]
            })]
          })
        }), r === "pair" && t.jsxs("div", {
          className: "flex items-end gap-2",
          children: [t.jsx(de, {
            tickers: w,
            value: k,
            onChange: G,
            disabled: C,
            label: "A"
          }), t.jsx(de, {
            tickers: w,
            value: y,
            onChange: x,
            disabled: C,
            label: "B"
          }), t.jsxs("span", {
            className: "text-[10px] font-mono text-muted-foreground pb-1",
            children: ["Ratio: ", t.jsxs("span", {
              className: "text-foreground font-bold",
              children: [k || "A", "/", y || "B"]
            })]
          })]
        }), r === "basket" && t.jsxs("div", {
          className: "flex flex-col gap-2",
          children: [t.jsx(Ls, {
            tickers: w,
            value: B,
            onChange: Q,
            disabled: C,
            testIdPrefix: "tva-basket"
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsx("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Basket Run Mode"
            }), t.jsx("div", {
              className: "flex gap-px",
              "data-testid": "tva-basket-mode",
              children: ["stocks", "combined"].map(e => t.jsx(
                "button", {
                  "data-testid": `tva-basket-mode-${e}`,
                  className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${M===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                  onClick: () => Y(e),
                  disabled: C,
                  title: e === "stocks" ?
                    "Run optimizer on each basket constituent separately" :
                    "Run optimizer on a single synthetic series using the basket's weighting scheme",
                  children: e === "stocks" ?
                    "Stock by Stock" : "Combined"
                }, e))
            })]
          })]
        }), r === "pairCombo" && t.jsxs("div", {
          className: "flex flex-col gap-1 w-full",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Pair Combo — Leg Set"
          }), se.ui]
        }), r !== "pair" && r !== "pairCombo" && Yt, t.jsxs("div", {
          className: "flex items-center gap-1",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "DATE RANGE"
          }), t.jsx("div", {
            className: "flex items-center gap-0.5",
            children: jt.map(e => t.jsx("button", {
              "data-testid": `tva-date-preset-${e.value}`,
              className: `text-[9px] font-mono px-1.5 py-0.5 rounded ${at===e.value?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border hover:text-foreground"}`,
              onClick: () => {
                ie(e.value), le(yt(e.value))
              },
              children: e.label
            }, e.value))
          }), t.jsx("input", {
            type: "date",
            "data-testid": "tva-date-start",
            value: R.start,
            onChange: e => {
              ie("custom"), le({
                ...R,
                start: e.target.value
              })
            },
            className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
          }), t.jsx("span", {
            className: "text-[10px] font-mono text-muted-foreground",
            children: "→"
          }), t.jsx("input", {
            type: "date",
            "data-testid": "tva-date-end",
            value: R.end,
            onChange: e => {
              ie("custom"), le({
                ...R,
                end: e.target.value
              })
            },
            className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
          })]
        }), t.jsxs("div", {
          className: "flex flex-col gap-0.5",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Target Return"
          }), t.jsx("select", {
            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1",
            value: W,
            onChange: e => Ue(parseFloat(e.target.value)),
            disabled: C,
            children: [.02, .03, .05, .07, .1, .15].map(e => t.jsxs(
              "option", {
                value: e,
                children: [(e * 100).toFixed(0), "%"]
              }, e))
          })]
        }), t.jsxs("div", {
          className: "flex flex-col gap-0.5",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Signal Types"
          }), t.jsxs("div", {
            className: "flex gap-2 text-[10px] font-mono",
            children: [t.jsxs("label", {
              className: "flex items-center gap-1 cursor-pointer",
              children: [t.jsx("input", {
                type: "checkbox",
                checked: xe,
                onChange: e => it(e.target.checked),
                disabled: C
              }), "Regime"]
            }), t.jsxs("label", {
              className: "flex items-center gap-1 cursor-pointer",
              children: [t.jsx("input", {
                type: "checkbox",
                checked: ge,
                onChange: e => lt(e.target.checked),
                disabled: C
              }), "Threshold"]
            }), t.jsxs("label", {
              className: "flex items-center gap-1 cursor-pointer",
              children: [t.jsx("input", {
                type: "checkbox",
                checked: fe,
                onChange: e => ct(e.target.checked),
                disabled: C
              }), "Divergence"]
            })]
          })]
        }), t.jsxs("div", {
          className: "flex items-end gap-2 ml-auto",
          children: [C ? t.jsx("button", {
            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90",
            onClick: Xt,
            children: "Cancel"
          }) : t.jsx("button", {
            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
            onClick: es,
            disabled: r === "single" ? !d : r === "pair" ? !k || !y ||
              k === y : Ke.length === 0,
            "data-testid": "tva-run",
            children: "Run Optimization"
          }), t.jsxs(bs, {
            variant: "outline",
            size: "sm",
            onClick: ts,
            disabled: pe.length === 0,
            children: [t.jsx(hs, {
              className: "w-3 h-3 mr-1"
            }), " CSV"]
          })]
        })]
      }), C && t.jsxs("div", {
        className: "px-4 py-1 text-[10px] font-mono text-muted-foreground border-b border-border bg-card/20",
        children: ["Running… ", ne.current, " / ", ne.total, t.jsx("div", {
          className: "h-1 bg-background rounded overflow-hidden mt-1",
          children: t.jsx("div", {
            className: "h-full bg-primary transition-all",
            style: {
              width: `${ne.current/Math.max(1,ne.total)*100}%`
            }
          })
        })]
      }), t.jsxs("div", {
        className: "flex-1 overflow-auto",
        children: [pe.length > 0 && t.jsxs("div", {
          className: "px-4 py-2 flex items-center gap-3 border-b border-border bg-card/10 sticky top-0 z-10 text-[10px] font-mono",
          children: [t.jsxs("span", {
            className: "text-muted-foreground",
            children: [Le.length, " tickers"]
          }), t.jsx("input", {
            type: "text",
            placeholder: "Filter ticker…",
            value: ze,
            onChange: e => Et(e.target.value),
            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-40"
          }), t.jsx("span", {
            className: "text-muted-foreground",
            children: "Sort:"
          }), t.jsxs("select", {
            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1",
            value: Ce,
            onChange: e => It(e.target.value),
            children: [t.jsx("option", {
              value: "score",
              children: "Best Score"
            }), t.jsx("option", {
              value: "ticker",
              children: "Ticker A-Z"
            }), t.jsx("option", {
              value: "signal",
              children: "Current Signal"
            })]
          }), t.jsxs("div", {
            className: "flex items-center gap-1",
            children: [t.jsx("label", {
              className: "text-[10px] font-mono text-muted-foreground",
              children: "RANK BY"
            }), t.jsx("select", {
              "data-testid": "tva-rank-by",
              value: Oe,
              onChange: e => Mt(e.target.value),
              className: "text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5",
              children: ks.map(e => t.jsx("option", {
                value: e.value,
                children: e.label
              }, e.value))
            })]
          }), me.length > 0 && t.jsxs("span", {
            className: "text-muted-foreground ml-auto",
            children: [me.length, " skipped"]
          })]
        }), pe.length === 0 && !C && t.jsx("div", {
          className: "p-6 text-xs font-mono text-muted-foreground text-center",
          children: "Configure the grid and click Run Optimization. TVA needs Yahoo price data with non-zero volume — tickers without volume will be skipped."
        }), Le.map(e => {
          const l = $t === e.ticker;
          if (!e.configs[0]) return null;
          const p = Me(e.currentOs);
          return t.jsxs("div", {
            className: "border-b border-border",
            children: [t.jsxs("button", {
              className: "w-full px-4 py-2 flex items-center gap-3 hover:bg-accent/30 text-left",
              onClick: () => ot(l ? null : e.ticker),
              children: [t.jsx("span", {
                className: "font-mono text-xs font-bold w-16",
                children: e.ticker
              }), t.jsx("span", {
                className: "text-[10px] font-mono text-muted-foreground flex-1 truncate",
                children: e.name
              }), t.jsx("span", {
                className: `font-mono text-[10px] font-bold w-12 text-center ${p==="BULL"?"text-green-500":p==="BEAR"?"text-red-500":"text-muted-foreground"}`,
                children: p
              }), t.jsx("span", {
                className: `font-mono text-[10px] w-16 text-center ${e.bestDirection==="long"?"text-green-500":"text-red-500"}`,
                children: e.bestDirection.toUpperCase()
              }), t.jsx("span", {
                className: "font-mono text-xs font-bold w-12 text-center rounded px-1 py-0.5",
                style: {
                  backgroundColor: Ct(e.bestScore),
                  color: Nt(e.bestScore)
                },
                children: e.bestScore.toFixed(0)
              }), t.jsx("span", {
                className: "font-mono text-[9px] text-muted-foreground hidden md:inline truncate max-w-[280px]",
                children: e.bestConfigLabel
              })]
            }), l && t.jsxs("div", {
              className: "px-4 py-2 bg-card/20",
              children: [t.jsxs("div", {
                className: "text-[10px] font-mono text-muted-foreground mb-1",
                children: ["Top ", e.configs.length,
                  " configs (best per signal type/length/smo/mult/threshold):"
                ]
              }), t.jsxs("table", {
                className: "w-full text-[10px] font-mono",
                children: [t.jsx("thead", {
                  className: "text-muted-foreground",
                  children: t.jsxs("tr", {
                    className: "border-b border-border",
                    children: [t.jsx("th", {
                      className: "text-left p-1",
                      children: "Config"
                    }), t.jsx("th", {
                      className: "p-1",
                      children: "Dir"
                    }), t.jsx("th", {
                      className: "p-1",
                      children: "# Sig"
                    }), t.jsx("th", {
                      className: "p-1",
                      children: "Score"
                    }), t.jsx("th", {
                      className: "p-1",
                      children: "HC"
                    }), re.map(c => t.jsxs(
                    "th", {
                      className: "p-1",
                      children: [c.label,
                        " Hit"
                      ]
                    }, c.label)), re.map(c => t
                      .jsxs("th", {
                        className: "p-1",
                        children: [c.label,
                          " Ret"
                        ]
                      }, c.label + "ret"))]
                  })
                }), t.jsx("tbody", {
                  children: e.configs.flatMap(c => c
                    .directions.map(s => {
                      const i =
                        `${e.ticker}::${c.configLabel}::${s.direction}`,
                        f = _t.has(i),
                        D = !!(s.profiles && s
                          .profiles.length >= 10 &&
                          e.priceContext),
                        L = s.direction === "long" ?
                        "buy" : "sell",
                        U = 5 + re.length * 2,
                        O = c.configLabel + s
                        .direction;
                      return t.jsxs(vs.Fragment, {
                        children: [t.jsxs(
                          "tr", {
                            className: "border-b border-border/30",
                            children: [t
                              .jsx("td", {
                                className: "p-1 truncate max-w-[260px]",
                                children: c
                                  .configLabel
                              }), t.jsx(
                                "td", {
                                  className: `p-1 text-center ${s.direction==="long"?"text-green-500":"text-red-500"}`,
                                  children: s
                                    .direction ===
                                    "long" ?
                                    "L" :
                                    "S"
                                }), t.jsx(
                                "td", {
                                  className: "p-1 text-center",
                                  children: s
                                    .summary
                                    .count
                                }), t.jsx(
                                "td", {
                                  className: "p-1 text-center",
                                  style: {
                                    color: Nt(
                                      s
                                      .composite
                                      .score
                                      ),
                                    backgroundColor: Ct(
                                      s
                                      .composite
                                      .score
                                      )
                                  },
                                  children: s
                                    .composite
                                    .score
                                    .toFixed(
                                      0)
                                }), t.jsx(
                                "td", {
                                  className: "p-1 text-center",
                                  children: D ?
                                    t.jsx(
                                      "button", {
                                        type: "button",
                                        onClick: () =>
                                          zt(
                                            i
                                            ),
                                        className: `px-1.5 py-0.5 rounded text-[9px] font-bold border ${f?"bg-violet-500/25 text-violet-200 border-violet-400/40":"bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"}`,
                                        title: "Profile what other indicators looked like at hit-bars vs miss-bars",
                                        children: f ?
                                          "▾" :
                                          "▸"
                                      }) :
                                    t.jsx(
                                      "span", {
                                        className: "text-muted-foreground/40",
                                        children: "—"
                                      })
                                }), re
                              .map(P => t
                                .jsxs(
                                  "td", {
                                    className: "p-1 text-center",
                                    style: {
                                      color: js(
                                        s
                                        .summary
                                        .hitRate[
                                          P
                                          .label
                                          ]
                                        )
                                    },
                                    children: [
                                      (s.summary
                                        .hitRate[
                                          P
                                          .label
                                          ] *
                                        100
                                        )
                                      .toFixed(
                                        0
                                        ),
                                      "%"
                                    ]
                                  }, P
                                  .label)
                                ), re.map(
                                P => t
                                .jsx(
                                  "td", {
                                    className: "p-1 text-center",
                                    children: ys(
                                      s
                                      .summary
                                      .avgReturn[
                                        P
                                        .label
                                        ]
                                      )
                                  }, P
                                  .label +
                                  "ret"))
                            ]
                          }), f && D && e
                          .priceContext && s
                          .profiles ? t.jsx(
                            "tr", {
                              children: t.jsx(
                                "td", {
                                  colSpan: U,
                                  className: "p-2 bg-card/10",
                                  children: t
                                    .jsx(
                                    St, {
                                      ticker: e
                                        .priceContext
                                        .mode ===
                                        "pair" &&
                                        e
                                        .priceContext
                                        .pairLegA ||
                                        e
                                        .ticker,
                                      priceContext: e
                                        .priceContext,
                                      signals: s
                                        .profiles,
                                      direction: L,
                                      title: `${c.configLabel} — ${s.direction.toUpperCase()}`
                                    })
                                })
                            }) : null
                        ]
                      }, O)
                    }))
                })]
              })]
            })]
          }, e.ticker)
        }), me.length > 0 && !C && t.jsx("div", {
          className: "p-4 text-[10px] font-mono text-muted-foreground border-t border-border",
          children: t.jsxs("details", {
            children: [t.jsxs("summary", {
              className: "cursor-pointer",
              children: ["Skipped (", me.length, ")"]
            }), t.jsx("ul", {
              className: "mt-2 space-y-0.5",
              children: me.map((e, l) => t.jsxs("li", {
                children: [e.ticker, ": ", e.reason]
              }, l))
            })]
          })
        })]
      })]
    })]
  })
}
export {
  Ys as
  default
};