import {
    r as a,
    ag as et,
    aj as qt,
    cG as Kt,
    cH as Gt,
    a as Jt,
    af as Qt,
    ae as kt,
    bB as tt,
    bA as rt,
    cI as st,
    cJ as ot,
    cK as nt,
    cL as Xt,
    g as er,
    cM as yt,
    j as t,
    cN as jt,
    cO as vt,
    cP as Nt,
    cQ as tr,
    cR as rr,
    cS as We,
    cT as Ie,
    cU as $e,
    cV as sr,
    B as or,
    z as nr,
    cW as G,
    cX as wt,
    cY as St,
    cZ as lr,
    c_ as _e,
    c$ as Le,
    d0 as ar,
    d1 as Ct
} from "./index-CsG73Aq_.js";
import {
    u as ir
} from "./useOptimizerClassFilter-COCFGQs0.js";
import {
    u as cr
} from "./usePairComboPicker-h_S34tFb.js";
import {
    u as dr
} from "./useFrequency-DK9YJz0p.js";
import {
    d as ur,
    e as pr
} from "./weeklyDownsample-BzVm8wGH.js";
import {
    e as xr,
    E as mr,
    H as Rt
} from "./EvaluatorPanel-BcObXxAZ.js";
import {
    U as Te
} from "./UnifiedTickerPicker-D927mSvl.js";
import {
    B as br
} from "./BasketTickerPill-DA9Wjwwc.js";
import {
    g as $t
} from "./yahooPairsRatio-DERC-reP.js";
import {
    B as fr
} from "./BasketPicker-DkcKAXfe.js";
import {
    r as lt,
    g as Tt
} from "./basketOhlc-CIjRG6QD.js";
import "./globalUniverse-DuqPcp2u.js";
import "./ClassificationFiltersWithSource-D7v4WOtR.js";
import "./harsi-NMVnsDcX.js";
import "./tva-DaeKqI67.js";
const Bt = [21, 42, 63, 126, 189, 252, 378, 504, 756, 1260],
    ne = {
        21: "21d (1M)",
        42: "42d (2M)",
        63: "63d (3M)",
        126: "126d (6M)",
        189: "189d (9M)",
        252: "252d (1Y)",
        378: "378d (1.5Y)",
        504: "504d (2Y)",
        756: "756d (3Y)",
        1260: "1260d (5Y)"
    },
    gr = ["close", "P/E LTM", "P/E FY2", "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2", "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2", "Dividend Yield", "Implied Cap Rate", "Short Interest%"];

function Mt(z, ve) {
    const k = new Array(z.length).fill(null);
    for (let A = 1; A < z.length; A++) {
        const h = Math.max(0, A - ve),
            F = z.slice(h, A),
            o = F.length;
        if (o < 2) continue;
        let E = 0,
            R = 0;
        for (let B = 0; B < o; B++) E += F[B], R += F[B] * F[B];
        const ee = E / o,
            W = R / o - ee * ee,
            J = Math.sqrt(Math.max(0, W));
        J > 0 && (k[A] = (z[A] - ee) / J)
    }
    return k
}

function hr(z, ve, k, A, h, F, o, E = "breakout", R, ee) {
    const W = Mt(z, k),
        J = o !== null,
        B = E === "breakout" || E === "both",
        v = E === "reversion" || E === "both",
        te = (_, P) => {
            if (R && ee) {
                const m = ar(_, ee);
                return m < 0 ? null : Ct(R, m, F, P, o)
            }
            return Ct(ve, _, F, P, o)
        },
        y = [],
        le = [],
        Q = [],
        ue = [];
    let I = null;
    for (let _ = 0; _ < W.length; _++) {
        const P = W[_];
        if (P === null) {
            I = null;
            continue
        }
        if (I !== null) {
            if (B && I >= A && P < A) {
                const m = te(_, "buy");
                m !== null && y.push(m)
            }
            if (B && I <= h && P > h) {
                const m = te(_, "sell");
                m !== null && le.push(m)
            }
            if (v && I < A && P >= A) {
                const m = te(_, "buy");
                m !== null && Q.push(m)
            }
            if (v && I > h && P <= h) {
                const m = te(_, "sell");
                m !== null && ue.push(m)
            }
        }
        I = P
    }
    const ge = _e(B ? y : Q, "buy"),
        V = _e(B ? le : ue, "sell"),
        Ne = Le(ge, "buy", J),
        M = Le(V, "sell", J);
    let pe, D, xe, U;
    E === "both" && (pe = _e(Q, "buy"), D = _e(ue, "sell"), xe = Le(pe, "buy", J), U = Le(D, "sell", J));
    let ae = ((ge?.count ?? 0) > 0 ? 1 : 0) + ((V?.count ?? 0) > 0 ? 1 : 0),
        q = Ne.score + M.score;
    E === "both" && ((pe?.count ?? 0) > 0 && (ae++, q += xe.score), (D?.count ?? 0) > 0 && (ae++, q += U.score));
    const we = ae > 0 ? q / ae : 0;
    return {
        window: k,
        buySummary: ge,
        sellSummary: V,
        buyComposite: Ne,
        sellComposite: M,
        compositeScore: Math.round(we),
        buyRevSummary: pe,
        sellRevSummary: D,
        buyRevComposite: xe,
        sellRevComposite: U,
        buyProfiles: y,
        sellProfiles: le,
        buyRevProfiles: Q,
        sellRevProfiles: ue
    }
}

function Ar() {
    const [z, ve] = a.useState([]), [k, A] = a.useState("P/FFO LTM"), [h, F] = a.useState(""), [o, E] = a.useState("single"), [R, ee] = a.useState([]), [W, J] = et("zscore-basket-mode", "stocks"), {
        baskets: B
    } = qt(), [v, te] = a.useState(""), [y, le] = a.useState(""), [Q, ue] = a.useState(-2), [I, ge] = a.useState(2), [V, Ne] = a.useState("threshold"), [M, pe] = a.useState("breakout"), [D, xe] = a.useState(.05), [U, ae] = a.useState(.05), [q, we] = a.useState(.1), [_, P] = a.useState("10y"), [m, he] = a.useState(() => Kt()), [S, ke] = a.useState(!1), [me, at] = a.useState({
        current: 0,
        total: 0
    }), [K, Be] = et("zscore:results", []), [Me, Oe] = a.useState(null), [ye, Ve] = a.useState("bestScore"), [Ye, Pt] = a.useState("composite"), He = a.useMemo(() => Gt(Ye), [Ye]), [it, zt] = a.useState(new Set), At = a.useCallback(e => {
        zt(l => {
            const r = new Set(l);
            return r.has(e) ? r.delete(e) : r.add(e), r
        })
    }, []), Ze = a.useRef(!1), ct = a.useRef(!1), [Pe, dt] = a.useState("optimize"), [ie, ut] = a.useState("long"), [ze, pt] = et("zscore:evalResult", null), [Ae, xt] = a.useState(null), [Ue, $] = a.useState(!1), [ce, Ft] = a.useState("breakout"), [Se, Et] = a.useState(63), [je, Dt] = a.useState(2), [qe, Wt] = a.useState(0), {
        universeTickers: Ke,
        isFiltered: It
    } = Jt(), j = a.useMemo(() => Ke ? z.filter(e => Ke.has(e.ticker)) : z, [z, Ke]), Fe = ir(j, o === "universe", "zs-clf"), _t = Fe.filteredTickers, be = cr(z, o === "pairCombo", "zs-pc"), {
        frequency: Ce,
        setFrequency: Ge,
        frequencyUI: Lt
    } = dr("zs", "daily", S), mt = Ce === "weekly" ? "weekly" : "daily";
    a.useEffect(() => {
        Qt().then(e => {
            ve(e), e.length > 0 && !ct.current && F(e[0].ticker), e.length > 0 && (te(l => l || e[0].ticker), le(l => l || (e[1]?.ticker ?? e[0].ticker)))
        })
    }, []), a.useEffect(() => {
        j.length > 0 && h && z.some(e => e.ticker === h) && !j.find(e => e.ticker === h) && F(j[0].ticker)
    }, [j, h, z]);
    const Ot = a.useCallback(async () => {
            ke(!0), Be([]), Ze.current = !1;
            const e = await kt();
            let l;
            if (o === "pair") {
                if (!v || !y || v === y) {
                    ke(!1);
                    return
                }
                l = [{
                    ticker: `${v}/${y}`,
                    name: `${v}/${y}`
                }]
            } else if (o === "pairCombo") {
                if (be.pairs.length === 0) {
                    ke(!1);
                    return
                }
                l = be.pairs.map(s => ({
                    ticker: s.label,
                    name: s.label,
                    pairA: s.a,
                    pairB: s.b
                }))
            } else if (o === "single") l = j.filter(s => s.ticker === h);
            else if (o === "basket")
                if (W === "combined") {
                    if (R.length === 0) {
                        ke(!1);
                        return
                    }
                    const s = lt(R, B);
                    l = [{
                        ticker: `BASKET:${s.name}`,
                        name: `BASKET:${s.name}`
                    }]
                } else l = R.map(s => j.find(i => i.ticker.toUpperCase() === s.toUpperCase()) ?? {
                    ticker: s,
                    name: s
                });
            else l = _t;
            if (l.length === 0) {
                ke(!1);
                return
            }
            at({
                current: 0,
                total: l.length
            });
            const r = o === "basket" && W === "combined" ? lt(R, B) : null,
                d = V === "band" ? {
                    minReturn: U,
                    maxReturn: q
                } : null,
                n = [];
            for (let s = 0; s < l.length && !Ze.current; s++) {
                const x = l[s];
                at({
                    current: s + 1,
                    total: l.length
                });
                try {
                    let i, u, C, re;
                    if (o === "pair" || o === "pairCombo") {
                        const c = o === "pairCombo" ? x.pairA : v,
                            w = o === "pairCombo" ? x.pairB : y,
                            p = await $t(c, w, e);
                        if (!p || p.indices.length < 50) continue;
                        i = p.indices.slice(), C = p.prices.slice(), u = p.prices.slice(), re = i.map(Z => e[Z] || "")
                    } else if (r) {
                        const c = await Tt(r, m);
                        if (console.log("[ZScore Combined] ohlc:", c ? {
                                closes_len: c.closes.length,
                                first_date: c.priceDates[0],
                                last_date: c.priceDates[c.priceDates.length - 1]
                            } : null, "basket:", r?.name, r?.tickers), !c || c.closes.length < 252) {
                            console.warn("[ZScore Combined] skipped: insufficient bars");
                            continue
                        }
                        const w = new Map;
                        for (let p = 0; p < e.length; p++) w.set(e[p], p);
                        i = [], C = [];
                        for (let p = 0; p < c.priceDates.length; p++) {
                            const Z = w.get(c.priceDates[p]) ?? -1;
                            Z >= 0 && (i.push(Z), C.push(c.closes[p]))
                        }
                        if (u = C.slice(), re = i.map(p => e[p] || ""), console.log("[ZScore Combined] aligned: allIndices.length=", i.length, "workbookDates.length=", e.length, "first wb date=", e[0], "last wb date=", e[e.length - 1]), i.length < 50) {
                            console.warn("[ZScore Combined] skipped: <50 aligned indices");
                            continue
                        }
                    } else {
                        const c = await tt(x.ticker),
                            w = rt(k),
                            p = st(k),
                            Z = c[k];
                        if (!Z || Z.length === 0) continue;
                        const oe = new Map;
                        for (const [O, fe] of Z) oe.set(O, fe * w * p);
                        const b = await ot(x.ticker),
                            N = nt(b, m);
                        if (!N || N.adjCloses.length < 252) continue;
                        const Ut = N.dates.slice(0, N.adjCloses.length),
                            ht = new Map;
                        for (let O = 0; O < e.length; O++) ht.set(e[O], O);
                        i = [], u = [], C = [];
                        for (let O = 0; O < N.adjCloses.length; O++) {
                            const fe = ht.get(Ut[O]);
                            fe != null && fe >= 0 && oe.has(fe) && (i.push(fe), u.push(oe.get(fe)), C.push(N.adjCloses[O]))
                        }
                        if (i.length < 50) continue;
                        re = i.map(O => e[O] || "")
                    }
                    const se = o === "pair" || o === "pairCombo" ? "daily" : mt,
                        de = Xt({
                            dates: re,
                            closes: C,
                            adjCloses: C
                        }, se);
                    let L, Y;
                    const Qe = o === "pair" || o === "pairCombo" ? "daily" : Ce;
                    if (se === "weekly") L = de.dailyIndexMap.map(c => u[c]), Y = de.adjCloses;
                    else if (Qe === "weekly_on_daily") {
                        const c = ur(u, re);
                        L = pr(c.prices, c.weekIndex, u.length).map(w => Number.isNaN(w) ? u[0] : w), Y = C
                    } else L = u, Y = C;
                    const De = se === "weekly" ? 52 : 252;
                    if (L.length < De) continue;
                    const Xe = se === "weekly" ? C : void 0,
                        f = se === "weekly" ? de : void 0,
                        g = [];
                    for (const c of Bt) {
                        if (c > L.length * .8) continue;
                        const w = hr(L, Y, c, Q, I, D, d, M, Xe, f);
                        g.push(w)
                    }
                    if (g.length === 0) {
                        r && console.warn("[ZScore Combined] skipped: windowResults.length==0; metricValues.length=", L.length);
                        continue
                    }
                    r && console.log("[ZScore Combined] windowResults built:", g.length, "metricValues.length=", L.length);
                    const X = g.reduce((c, w) => c.compositeScore > w.compositeScore ? c : w);
                    for (const c of g) c.window !== X.window && (c.buyProfiles = void 0, c.sellProfiles = void 0, c.buyRevProfiles = void 0, c.sellRevProfiles = void 0);
                    const T = i.map(c => e[c] || ""),
                        H = {
                            prices: C,
                            highs: C.slice(),
                            lows: C.slice(),
                            volumes: null,
                            dates: T,
                            globalIndices: i.slice(),
                            benchmarkPrices: null,
                            mode: o === "pair" || o === "pairCombo" ? "pair" : "single",
                            pairLegA: o === "pairCombo" ? x.pairA : o === "pair" ? v : void 0,
                            pairLegB: o === "pairCombo" ? x.pairB : o === "pair" ? y : void 0
                        };
                    n.push({
                        ticker: x.ticker,
                        name: x.name,
                        results: g,
                        bestWindow: X.window,
                        bestScore: X.compositeScore,
                        priceContext: H
                    }), (s % 5 === 0 || s === l.length - 1) && Be([...n])
                } catch {}
            }
            Be(n), ke(!1)
        }, [j, h, v, y, R, k, o, Q, I, D, V, U, q, M, Ce, mt, m, be.pairs, W, B]),
        Vt = a.useCallback(async () => {
            $(!0), pt(null), xt(null);
            try {
                const e = await kt(),
                    l = o === "pair" ? "__PAIR__" : o === "single" ? h : j[0]?.ticker ?? "";
                if (o === "pair" && (!v || !y || v === y)) {
                    $(!1);
                    return
                }
                if (!l && o !== "pair" && o !== "basket") {
                    $(!1);
                    return
                }
                let r, d, n, s;
                if (o === "pair") {
                    const f = await $t(v, y, e);
                    if (!f || f.indices.length < 50) {
                        $(!1);
                        return
                    }
                    r = f.indices.slice(), n = f.prices.slice(), d = f.prices.slice(), s = r.map(g => e[g] || "")
                } else if (o === "basket") {
                    if (R.length === 0) {
                        $(!1);
                        return
                    }
                    if (W === "combined") {
                        const f = lt(R, B),
                            g = await Tt(f, m);
                        if (!g || g.closes.length < 252) {
                            $(!1);
                            return
                        }
                        const X = new Map;
                        for (let T = 0; T < e.length; T++) X.set(e[T], T);
                        r = [], n = [];
                        for (let T = 0; T < g.priceDates.length; T++) {
                            const H = X.get(g.priceDates[T]) ?? -1;
                            H >= 0 && (r.push(H), n.push(g.closes[T]))
                        }
                        if (d = n.slice(), s = r.map(T => e[T] || ""), r.length < 50) {
                            $(!1);
                            return
                        }
                    } else {
                        const f = R[0];
                        if (!f) {
                            $(!1);
                            return
                        }
                        const g = await tt(f),
                            X = rt(k),
                            T = st(k),
                            H = g[k];
                        if (!H || H.length === 0) {
                            $(!1);
                            return
                        }
                        const c = new Map;
                        for (const [b, N] of H) c.set(b, N * X * T);
                        let w;
                        try {
                            w = await ot(f)
                        } catch {
                            $(!1);
                            return
                        }
                        const p = nt(w, m);
                        if (!p || p.adjCloses.length < 252) {
                            $(!1);
                            return
                        }
                        const Z = p.dates.slice(0, p.adjCloses.length),
                            oe = new Map;
                        for (let b = 0; b < e.length; b++) oe.set(e[b], b);
                        r = [], d = [], n = [];
                        for (let b = 0; b < p.adjCloses.length; b++) {
                            const N = oe.get(Z[b]);
                            N != null && N >= 0 && c.has(N) && (r.push(N), d.push(c.get(N)), n.push(p.adjCloses[b]))
                        }
                        if (r.length < 50) {
                            $(!1);
                            return
                        }
                        s = r.map(b => e[b] || "")
                    }
                } else {
                    const f = o === "single" ? h : j[0]?.ticker ?? "";
                    if (!f) {
                        $(!1);
                        return
                    }
                    const g = await tt(f),
                        X = rt(k),
                        T = st(k),
                        H = g[k];
                    if (!H || H.length === 0) {
                        $(!1);
                        return
                    }
                    const c = new Map;
                    for (const [b, N] of H) c.set(b, N * X * T);
                    let w;
                    try {
                        w = await ot(f)
                    } catch {
                        $(!1);
                        return
                    }
                    const p = nt(w, m);
                    if (!p || p.adjCloses.length < 252) {
                        $(!1);
                        return
                    }
                    const Z = p.dates.slice(0, p.adjCloses.length),
                        oe = new Map;
                    for (let b = 0; b < e.length; b++) oe.set(e[b], b);
                    r = [], d = [], n = [];
                    for (let b = 0; b < p.adjCloses.length; b++) {
                        const N = oe.get(Z[b]);
                        N != null && N >= 0 && c.has(N) && (r.push(N), d.push(c.get(N)), n.push(p.adjCloses[b]))
                    }
                    if (r.length < 50) {
                        $(!1);
                        return
                    }
                    s = r.map(b => e[b] || "")
                }
                const x = Mt(d, Se),
                    i = ce === "breakout" || ce === "both",
                    u = ce === "reversion" || ce === "both",
                    C = ie === "long" ? "buy" : "sell",
                    re = [],
                    se = [],
                    de = -Math.abs(je),
                    L = Math.abs(je);
                let Y = null;
                for (let f = 0; f < x.length; f++) {
                    const g = x[f];
                    if (g === null) {
                        Y = null;
                        continue
                    }
                    Y !== null && (i && Y >= de && g < de && re.push(f), i && Y <= L && g > L && se.push(f), u && Y < de && g >= de && re.push(f), u && Y > L && g <= L && se.push(f)), Y = g
                }
                const Qe = (C === "buy" ? re : se).sort((f, g) => f - g),
                    De = s,
                    Xe = xr(n, De, Qe, ie, D, qe, null, "3M");
                pt(Xe), xt({
                    prices: n,
                    highs: n.slice(),
                    lows: n.slice(),
                    volumes: null,
                    dates: De,
                    globalIndices: r.slice(),
                    benchmarkPrices: null,
                    mode: o === "pair" ? "pair" : "single",
                    pairLegA: o === "pair" ? v : void 0,
                    pairLegB: o === "pair" ? y : void 0
                })
            } finally {
                $(!1)
            }
        }, [o, h, v, y, j, k, ce, Se, je, ie, D, qe, m, R, W, B]),
        bt = a.useMemo(() => {
            const e = `±${Math.abs(je).toFixed(1)}σ`;
            return `ZScore ${Se}d ${ce} ${e} [${ie}]`
        }, [Se, ce, je, ie]),
        ft = a.useMemo(() => o === "pair" ? `${v||"A"}/${y||"B"}` : o === "single" ? h || "—" : j[0]?.ticker || "—", [o, v, y, h, j]),
        Yt = a.useCallback(() => ({
            selectedMetric: k,
            selectedTicker: h,
            pairTickerA: v,
            pairTickerB: y,
            basketTickers: R,
            basketMode: W,
            mode: o,
            buyThreshold: Q,
            sellThreshold: I,
            returnMode: V,
            targetReturn: D,
            bandMin: U,
            bandMax: q,
            results: K,
            expandedTicker: Me,
            sortBy: ye,
            signalType: M,
            frequency: Ce,
            pairCombo: be.serialize()
        }), [k, h, v, y, R, W, o, Q, I, V, D, U, q, K, Me, ye, M, Ce, be]),
        Ht = a.useCallback(e => {
            e && (e.selectedMetric && A(e.selectedMetric), e.selectedTicker && (F(e.selectedTicker), ct.current = !0), e.pairTickerA && te(e.pairTickerA), e.pairTickerB && le(e.pairTickerB), (e.mode === "single" || e.mode === "universe" || e.mode === "pair" || e.mode === "pairCombo" || e.mode === "basket") && E(e.mode), e.pairCombo && be.hydrate(e.pairCombo), Array.isArray(e.basketTickers) && ee(e.basketTickers.filter(l => typeof l == "string")), (e.basketMode === "stocks" || e.basketMode === "combined") && J(e.basketMode), typeof e.buyThreshold == "number" && ue(e.buyThreshold), typeof e.sellThreshold == "number" && ge(e.sellThreshold), e.returnMode && Ne(e.returnMode), typeof e.targetReturn == "number" && xe(e.targetReturn), typeof e.bandMin == "number" && ae(e.bandMin), typeof e.bandMax == "number" && we(e.bandMax), Array.isArray(e.results) && Be(e.results), e.expandedTicker !== void 0 && Oe(e.expandedTicker), e.sortBy && Ve(e.sortBy), e.signalType && pe(e.signalType), e.frequency === "daily" || e.frequency === "weekly" || e.frequency === "weekly_on_daily" ? Ge(e.frequency) : e.timeframe === "weekly" && Ge("weekly"))
        }, [Ge]);
    er("z-optimizer", Yt, Ht);
    const gt = a.useMemo(() => K.map(e => {
            let l = -1 / 0,
                r = e.bestWindow;
            for (const d of e.results) {
                const n = yt(d.buySummary, d.buyComposite.score, "buy", He),
                    s = yt(d.sellSummary, d.sellComposite.score, "sell", He),
                    x = Math.max(n, s);
                x > l && (l = x, r = d.window)
            }
            return {
                ...e,
                bestScore: l === -1 / 0 ? e.bestScore : l,
                bestWindow: r
            }
        }), [K, He]),
        Je = a.useMemo(() => {
            const e = [...gt];
            return ye === "bestScore" ? e.sort((l, r) => r.bestScore - l.bestScore) : e.sort((l, r) => l.ticker.localeCompare(r.ticker)), e
        }, [gt, ye]),
        Zt = () => {
            const e = G.filter((s, x) => x >= 2),
                l = Je.map(s => {
                    const x = s.results.find(u => u.window === s.bestWindow),
                        i = {
                            ticker: s.ticker,
                            name: s.name,
                            bestWindow: s.bestWindow,
                            bestScore: s.bestScore
                        };
                    return e.forEach(u => {
                        i[`buy_hitRate_${u.label}`] = x?.buySummary?.hitRate[u.label] ?? null, i[`sell_hitRate_${u.label}`] = x?.sellSummary?.hitRate[u.label] ?? null
                    }), i
                }),
                r = Object.keys(l[0] || {}),
                d = [r.join(","), ...l.map(s => r.map(x => `"${String(s[x]??"").replace(/"/g,'""')}"`).join(","))].join(`
`),
                n = document.createElement("a");
            n.href = URL.createObjectURL(new Blob([d], {
                type: "text/csv"
            })), n.download = `zscore_optimizer_${k.replace(/[^a-zA-Z0-9]/g,"_")}.csv`, n.click()
        },
        Ee = a.useMemo(() => {
            if (K.length === 0) return null;
            const e = new Set;
            for (const n of K)
                for (const s of n.results) e.add(s.window);
            const l = Array.from(e).sort((n, s) => n - s),
                r = [...K].sort((n, s) => s.bestScore - n.bestScore),
                d = [];
            for (const n of r) {
                const s = new Map(n.results.map(x => [x.window, x.compositeScore]));
                d.push({
                    ticker: n.ticker,
                    scores: l.map(x => s.get(x) ?? null)
                })
            }
            return {
                windows: l,
                matrix: d
            }
        }, [K]),
        Re = V === "band";
    return t.jsxs("div", {
        className: "flex flex-col h-full overflow-hidden",
        children: [t.jsxs("div", {
            className: "flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3",
            children: [t.jsx("h2", {
                className: "text-sm font-bold text-foreground tracking-tight",
                children: "Z-Score Optimizer"
            }), t.jsxs("div", {
                className: "flex gap-px",
                children: [t.jsx("button", {
                    "data-testid": "z-view-optimize",
                    className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${Pe==="optimize"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                    onClick: () => dt("optimize"),
                    children: "Optimize"
                }), t.jsx("button", {
                    "data-testid": "z-view-evaluate",
                    className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${Pe==="evaluate"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                    onClick: () => dt("evaluate"),
                    children: "Evaluate"
                })]
            }), t.jsx("span", {
                className: "text-[10px] text-muted-foreground",
                children: Pe === "optimize" ? "Search parameter space by hit rate" : "Score one specific setup"
            })]
        }), Pe === "evaluate" ? t.jsxs(t.Fragment, {
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
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${o==="single"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => E("single"),
                                children: "Single"
                            }), t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${o==="pair"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => E("pair"),
                                children: "Pair"
                            })]
                        })]
                    }), o === "single" && t.jsxs("div", {
                        className: "flex items-end gap-2",
                        children: [t.jsx("div", {
                            className: jt(h) ? "opacity-40 pointer-events-none" : "",
                            children: t.jsx(Te, {
                                tickers: j,
                                value: jt(h) ? "" : h,
                                onChange: F,
                                label: "Ticker"
                            })
                        }), t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Basket"
                            }), t.jsx(br, {
                                activeTicker: h,
                                onSelectTicker: F,
                                fallbackTicker: j[0]?.ticker ?? null
                            })]
                        })]
                    }), o === "pair" && t.jsxs(t.Fragment, {
                        children: [t.jsx(Te, {
                            tickers: j,
                            value: v,
                            onChange: te,
                            label: "Ticker A"
                        }), t.jsx(Te, {
                            tickers: j,
                            value: y,
                            onChange: le,
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
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${ie==="long"?"bg-emerald-600 text-white":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => ut("long"),
                                children: "Long"
                            }), t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${ie==="short"?"bg-red-600 text-white":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
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
                            children: ["breakout", "reversion", "both"].map(e => t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${ce===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => Ft(e),
                                children: e === "breakout" ? "Breakout" : e === "reversion" ? "Reversion" : "Both"
                            }, e))
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Window"
                        }), t.jsx("select", {
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary",
                            value: Se,
                            onChange: e => Et(Number(e.target.value)),
                            children: Bt.map(e => t.jsx("option", {
                                value: e,
                                children: ne[e] || `${e}d`
                            }, e))
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Threshold ±σ"
                        }), t.jsx("input", {
                            type: "number",
                            step: "0.5",
                            min: "0.5",
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14 focus:outline-none focus:ring-1 focus:ring-primary",
                            value: je,
                            onChange: e => Dt(Number(e.target.value))
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Target %"
                        }), t.jsx("input", {
                            type: "number",
                            step: "0.5",
                            min: "0.5",
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px] focus:outline-none focus:ring-1 focus:ring-primary",
                            value: +(D * 100).toFixed(4),
                            onChange: e => xe((parseFloat(e.target.value) || 5) / 100),
                            title: "Hit-rate threshold in percent. 5 = 5%."
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Hold"
                        }), t.jsx("input", {
                            type: "number",
                            min: "0",
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[60px] focus:outline-none focus:ring-1 focus:ring-primary",
                            value: qe,
                            onChange: e => Wt(parseInt(e.target.value) || 0)
                        })]
                    }), t.jsxs("div", {
                        className: "flex items-center gap-1",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "DATE RANGE"
                        }), t.jsx("div", {
                            className: "flex items-center gap-0.5",
                            children: vt.map(e => t.jsx("button", {
                                "data-testid": `z-eval-date-preset-${e.value}`,
                                className: `text-[9px] font-mono px-1.5 py-0.5 rounded ${_===e.value?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border hover:text-foreground"}`,
                                onClick: () => {
                                    P(e.value), he(Nt(e.value))
                                },
                                children: e.label
                            }, e.value))
                        }), t.jsx("input", {
                            type: "date",
                            "data-testid": "z-eval-date-start",
                            value: m.start,
                            onChange: e => {
                                P("custom"), he({
                                    ...m,
                                    start: e.target.value
                                })
                            },
                            className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                        }), t.jsx("span", {
                            className: "text-[10px] font-mono text-muted-foreground",
                            children: "→"
                        }), t.jsx("input", {
                            type: "date",
                            "data-testid": "z-eval-date-end",
                            value: m.end,
                            onChange: e => {
                                P("custom"), he({
                                    ...m,
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
                            "data-testid": "z-eval-run",
                            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
                            onClick: Vt,
                            disabled: Ue,
                            children: Ue ? "Evaluating…" : "Evaluate"
                        })]
                    })]
                })
            }), t.jsxs("div", {
                className: "flex-1 overflow-auto p-4 space-y-3",
                children: [t.jsx(mr, {
                    result: ze,
                    loading: Ue,
                    setupLabel: bt,
                    tickerLabel: ft
                }), ze && Ae && ze.profiles.length >= 10 ? t.jsx(Rt, {
                    ticker: Ae.mode === "pair" ? Ae.pairLegA || "" : h || j[0]?.ticker || "",
                    priceContext: Ae,
                    signals: ze.profiles,
                    direction: ie === "long" ? "buy" : "sell",
                    title: `Hit Conditions — ${bt} on ${ft}`,
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
                                children: "Z-Score Optimizer"
                            }), It && t.jsxs("span", {
                                className: "text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30",
                                children: [j.length, " / ", z.length, " tickers"]
                            })]
                        }), t.jsx("p", {
                            className: "text-[10px] text-muted-foreground mt-0.5",
                            children: "Find the rolling z-score window where extreme signals produce the most reliable forward returns"
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Metric"
                        }), t.jsx("select", {
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary min-w-[140px]",
                            value: k,
                            onChange: e => A(e.target.value),
                            disabled: S,
                            "data-testid": "optimizer-metric",
                            children: gr.map(e => t.jsx("option", {
                                value: e,
                                children: e
                            }, e))
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Mode"
                        }), t.jsx("div", {
                            className: "flex gap-px",
                            children: ["single", "universe", "pair", "pairCombo", "basket"].map(e => t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${o===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => E(e),
                                disabled: S,
                                "data-testid": `optimizer-mode-${e}`,
                                children: e === "single" ? "Single Ticker" : e === "universe" ? "Universe" : e === "pair" ? "Pair (A/B)" : e === "pairCombo" ? "Pair Combo" : "Basket"
                            }, e))
                        })]
                    }), o === "pair" && t.jsxs("div", {
                        className: "flex items-end gap-2",
                        children: [t.jsx(Te, {
                            tickers: j,
                            value: v,
                            onChange: te,
                            disabled: S,
                            label: "A"
                        }), t.jsx(Te, {
                            tickers: j,
                            value: y,
                            onChange: le,
                            disabled: S,
                            label: "B"
                        }), t.jsxs("span", {
                            className: "text-[10px] font-mono text-muted-foreground pb-1",
                            children: ["Ratio: ", t.jsxs("span", {
                                className: "text-foreground font-bold",
                                children: [v || "A", "/", y || "B"]
                            })]
                        })]
                    }), o === "basket" && t.jsxs("div", {
                        className: "flex flex-col gap-2",
                        children: [t.jsx(fr, {
                            tickers: j,
                            value: R,
                            onChange: ee,
                            disabled: S,
                            testIdPrefix: "zscore-basket"
                        }), t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Basket Run Mode"
                            }), t.jsx("div", {
                                className: "flex gap-px",
                                "data-testid": "zscore-basket-mode",
                                children: ["stocks", "combined"].map(e => t.jsx("button", {
                                    "data-testid": `zscore-basket-mode-${e}`,
                                    className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${W===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                    onClick: () => J(e),
                                    disabled: S,
                                    title: e === "stocks" ? "Run optimizer on each basket constituent separately" : "Run optimizer on a single synthetic series using the basket's weighting scheme",
                                    children: e === "stocks" ? "Stock by Stock" : "Combined"
                                }, e))
                            })]
                        })]
                    }), o === "pairCombo" && t.jsxs("div", {
                        className: "flex flex-col gap-1 w-full",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Pair Combo — Leg Set"
                        }), be.ui]
                    }), o === "universe" && Fe.classFilterUI && t.jsxs("div", {
                        className: "flex flex-col gap-1 w-full",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Classification Filter"
                        }), Fe.universeSourceUI, Fe.classFilterUI]
                    }), o === "single" && t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Ticker"
                        }), t.jsx("select", {
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary min-w-[80px]",
                            value: h,
                            onChange: e => F(e.target.value),
                            disabled: S,
                            "data-testid": "optimizer-ticker",
                            children: j.map(e => t.jsx("option", {
                                value: e.ticker,
                                children: e.ticker
                            }, e.ticker))
                        })]
                    }), Lt, t.jsxs("div", {
                        className: "flex items-center gap-1",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "DATE RANGE"
                        }), t.jsx("div", {
                            className: "flex items-center gap-0.5",
                            children: vt.map(e => t.jsx("button", {
                                "data-testid": `z-date-preset-${e.value}`,
                                className: `text-[9px] font-mono px-1.5 py-0.5 rounded ${_===e.value?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border hover:text-foreground"}`,
                                onClick: () => {
                                    P(e.value), he(Nt(e.value))
                                },
                                children: e.label
                            }, e.value))
                        }), t.jsx("input", {
                            type: "date",
                            "data-testid": "z-date-start",
                            value: m.start,
                            onChange: e => {
                                P("custom"), he({
                                    ...m,
                                    start: e.target.value
                                })
                            },
                            className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                        }), t.jsx("span", {
                            className: "text-[10px] font-mono text-muted-foreground",
                            children: "→"
                        }), t.jsx("input", {
                            type: "date",
                            "data-testid": "z-date-end",
                            value: m.end,
                            onChange: e => {
                                P("custom"), he({
                                    ...m,
                                    end: e.target.value
                                })
                            },
                            className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Buy σ"
                        }), t.jsx("input", {
                            type: "number",
                            step: "0.5",
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14 focus:outline-none focus:ring-1 focus:ring-primary",
                            value: Q,
                            onChange: e => ue(Number(e.target.value)),
                            disabled: S,
                            "data-testid": "optimizer-buy-threshold"
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Sell σ"
                        }), t.jsx("input", {
                            type: "number",
                            step: "0.5",
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14 focus:outline-none focus:ring-1 focus:ring-primary",
                            value: I,
                            onChange: e => ge(Number(e.target.value)),
                            disabled: S,
                            "data-testid": "optimizer-sell-threshold"
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Signal"
                        }), t.jsx("div", {
                            className: "flex gap-px",
                            children: ["breakout", "reversion", "both"].map(e => t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${M===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => pe(e),
                                disabled: S,
                                title: e === "breakout" ? "Signal when Z crosses through threshold (entering extreme)" : e === "reversion" ? "Signal when Z crosses back inside threshold (leaving extreme)" : "Show both breakout and reversion signals",
                                children: e === "breakout" ? "Breakout" : e === "reversion" ? "Reversion" : "Both"
                            }, e))
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Return"
                        }), t.jsx("div", {
                            className: "flex gap-px",
                            children: ["threshold", "band"].map(e => t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${V===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => Ne(e),
                                disabled: S,
                                children: e === "threshold" ? "Threshold" : "Band"
                            }, e))
                        })]
                    }), V === "threshold" ? t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Target"
                        }), t.jsx("select", {
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px]",
                            value: D,
                            onChange: e => xe(Number(e.target.value)),
                            disabled: S,
                            children: tr.map(e => t.jsx("option", {
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
                                value: `${U}-${q}`,
                                onChange: e => {
                                    const [l, r] = e.target.value.split("-").map(Number);
                                    ae(l), we(r)
                                },
                                disabled: S,
                                children: rr.map(e => t.jsx("option", {
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
                                value: Math.round(U * 100),
                                onChange: e => ae(Number(e.target.value) / 100),
                                disabled: S
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
                                value: Math.round(q * 100),
                                onChange: e => we(Number(e.target.value) / 100),
                                disabled: S
                            })]
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: " "
                        }), S ? t.jsxs("button", {
                            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500 transition-colors",
                            onClick: () => {
                                Ze.current = !0
                            },
                            "data-testid": "optimizer-cancel",
                            children: ["Cancel (", me.current, "/", me.total, ")"]
                        }) : t.jsx("button", {
                            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
                            onClick: Ot,
                            "data-testid": "optimizer-run",
                            children: "Run Optimizer"
                        })]
                    })]
                })
            }), t.jsxs("div", {
                className: "flex-1 overflow-auto px-4 py-3",
                children: [K.length === 0 && !S && t.jsx("div", {
                    className: "flex items-center justify-center h-full text-muted-foreground text-sm",
                    children: 'Select a metric and click "Run Optimizer" to find the best z-score lookback window'
                }), S && K.length === 0 && t.jsx("div", {
                    className: "flex items-center justify-center h-full",
                    children: t.jsxs("div", {
                        className: "text-center",
                        children: [t.jsx("div", {
                            className: "text-sm text-muted-foreground mb-2",
                            children: "Analyzing..."
                        }), t.jsxs("div", {
                            className: "text-xs font-mono text-muted-foreground",
                            children: [me.current, " / ", me.total, " tickers"]
                        }), t.jsx("div", {
                            className: "w-48 h-1 bg-border rounded-full mt-2 mx-auto overflow-hidden",
                            children: t.jsx("div", {
                                className: "h-full bg-primary rounded-full transition-all duration-300",
                                style: {
                                    width: `${me.total>0?me.current/me.total*100:0}%`
                                }
                            })
                        })]
                    })
                }), o === "universe" && Ee && Ee.matrix.length > 0 && t.jsxs("div", {
                    className: "mb-6",
                    children: [t.jsxs("div", {
                        className: "flex items-center justify-between mb-2",
                        children: [t.jsxs("h3", {
                            className: "text-xs font-bold text-foreground uppercase tracking-wider",
                            children: ["Composite Score Heatmap — ", k]
                        }), t.jsx("div", {
                            className: "flex items-center gap-3 text-[9px] font-mono text-muted-foreground",
                            children: [0, 25, 50, 75, 100].map(e => t.jsxs("span", {
                                className: "flex items-center gap-1",
                                children: [t.jsx("span", {
                                    className: "w-4 h-3 rounded-sm border border-white/10",
                                    style: {
                                        background: We(e)
                                    }
                                }), t.jsx("span", {
                                    style: {
                                        color: Ie(e)
                                    },
                                    children: e
                                })]
                            }, e))
                        })]
                    }), t.jsx("div", {
                        className: "overflow-x-auto border border-border rounded",
                        children: t.jsxs("table", {
                            className: "w-full text-[10px] font-mono",
                            children: [t.jsx("thead", {
                                children: t.jsxs("tr", {
                                    className: "bg-card",
                                    children: [t.jsx("th", {
                                        className: "text-left px-2 py-1 text-muted-foreground font-bold sticky left-0 bg-card z-10 border-r border-border",
                                        children: "Ticker"
                                    }), Ee.windows.map(e => t.jsx("th", {
                                        className: "text-center px-2 py-1 text-muted-foreground font-bold whitespace-nowrap",
                                        children: ne[e] || `${e}d`
                                    }, e)), t.jsx("th", {
                                        className: "text-center px-2 py-1 text-muted-foreground font-bold",
                                        children: "Best"
                                    })]
                                })
                            }), t.jsx("tbody", {
                                children: Ee.matrix.map(e => {
                                    const l = K.find(r => r.ticker === e.ticker);
                                    return t.jsxs("tr", {
                                        className: "hover:bg-white/5 cursor-pointer",
                                        onClick: () => Oe(Me === e.ticker ? null : e.ticker),
                                        children: [t.jsx("td", {
                                            className: "px-2 py-1 text-foreground font-bold sticky left-0 bg-card z-10 border-r border-border",
                                            children: e.ticker
                                        }), e.scores.map((r, d) => t.jsx("td", {
                                            className: "text-center px-2 py-1 font-bold",
                                            style: {
                                                backgroundColor: r !== null ? We(r) : "rgba(255,255,255,0.04)",
                                                color: r !== null ? Ie(r) : "#555"
                                            },
                                            title: r !== null ? `${r}` : "N/A",
                                            children: r !== null ? r : "–"
                                        }, d)), t.jsx("td", {
                                            className: "text-center px-2 py-1 text-foreground font-bold",
                                            children: l ? ne[l.bestWindow] || `${l.bestWindow}d` : "–"
                                        })]
                                    }, e.ticker)
                                })
                            })]
                        })
                    })]
                }), Je.length > 0 && t.jsxs("div", {
                    children: [t.jsxs("div", {
                        className: "flex items-center justify-between mb-2",
                        children: [t.jsxs("h3", {
                            className: "text-xs font-bold text-foreground uppercase tracking-wider",
                            children: [o === "single" ? "Window Analysis" : "Results by Ticker", " — ", k, M !== "breakout" && ` — ${M==="reversion"?"Reversion":"Breakout + Reversion"}`, V === "band" ? ` — band ${$e(U)}–${$e(q)}` : ` — target ${$e(D)}`]
                        }), t.jsxs("div", {
                            className: "flex items-center gap-1",
                            children: [t.jsxs("div", {
                                className: "flex items-center gap-1",
                                children: [t.jsx("label", {
                                    className: "text-[10px] font-mono text-muted-foreground",
                                    children: "RANK BY"
                                }), t.jsx("select", {
                                    "data-testid": "z-rank-by",
                                    value: Ye,
                                    onChange: e => Pt(e.target.value),
                                    className: "text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5",
                                    children: sr.map(e => t.jsx("option", {
                                        value: e.value,
                                        children: e.label
                                    }, e.value))
                                })]
                            }), o === "universe" && t.jsxs(t.Fragment, {
                                children: [t.jsx("button", {
                                    className: `text-[9px] font-mono px-2 py-0.5 rounded ${ye==="bestScore"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border"}`,
                                    onClick: () => Ve("bestScore"),
                                    children: "Sort: Score"
                                }), t.jsx("button", {
                                    className: `text-[9px] font-mono px-2 py-0.5 rounded ${ye==="ticker"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border"}`,
                                    onClick: () => Ve("ticker"),
                                    children: "Sort: Ticker"
                                })]
                            }), t.jsx(or, {
                                variant: "outline",
                                size: "sm",
                                className: "h-6 gap-1 text-[11px]",
                                onClick: Zt,
                                "data-testid": "export-csv",
                                children: t.jsx(nr, {
                                    className: "w-3 h-3"
                                })
                            })]
                        })]
                    }), Je.map(e => {
                        const l = o === "single" || Me === e.ticker;
                        return t.jsxs("div", {
                            className: "mb-3",
                            children: [o === "universe" && t.jsxs("button", {
                                className: "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded hover:bg-white/5 transition-colors",
                                onClick: () => Oe(l ? null : e.ticker),
                                children: [t.jsx("span", {
                                    className: `text-[10px] transition-transform ${l?"rotate-90":""}`,
                                    children: "▶"
                                }), t.jsx("span", {
                                    className: "text-xs font-mono font-bold text-foreground",
                                    children: e.ticker
                                }), t.jsx("span", {
                                    className: "text-[10px] font-mono text-muted-foreground",
                                    children: e.name
                                }), t.jsxs("span", {
                                    className: "ml-auto text-[10px] font-mono",
                                    children: ["Best: ", t.jsx("span", {
                                        className: "text-primary font-bold",
                                        children: ne[e.bestWindow] || `${e.bestWindow}d`
                                    }), " ", "Score: ", t.jsx("span", {
                                        className: "inline-block px-1 py-0 rounded font-bold",
                                        style: {
                                            backgroundColor: We(e.bestScore),
                                            color: Ie(e.bestScore)
                                        },
                                        children: e.bestScore
                                    })]
                                })]
                            }), l && t.jsx("div", {
                                className: "overflow-x-auto border border-border rounded mt-1",
                                children: t.jsxs("table", {
                                    className: "w-full text-[10px] font-mono",
                                    children: [t.jsx("thead", {
                                        children: t.jsxs("tr", {
                                            className: "bg-card text-muted-foreground",
                                            children: [t.jsx("th", {
                                                className: "text-left px-2 py-1 font-bold",
                                                children: "Window"
                                            }), M === "both" && t.jsx("th", {
                                                className: "text-center px-2 py-1 font-bold",
                                                children: "Type"
                                            }), t.jsx("th", {
                                                className: "text-center px-2 py-1 font-bold",
                                                children: "Buy Sig"
                                            }), t.jsx("th", {
                                                className: "text-center px-2 py-1 font-bold",
                                                children: "Sell Sig"
                                            }), G.map(r => t.jsxs("th", {
                                                className: "text-center px-2 py-1 font-bold",
                                                children: ["Buy ", Re ? "Band" : "Hit", " ", r.label]
                                            }, `bh-${r.label}`)), G.filter((r, d) => d >= 2).map(r => t.jsxs("th", {
                                                className: "text-center px-2 py-1 font-bold",
                                                children: ["Buy Avg ", r.label]
                                            }, `ba-${r.label}`)), G.map(r => t.jsxs("th", {
                                                className: "text-center px-2 py-1 font-bold",
                                                children: ["Sell ", Re ? "Band" : "Hit", " ", r.label]
                                            }, `sh-${r.label}`)), G.filter((r, d) => d >= 2).map(r => t.jsxs("th", {
                                                className: "text-center px-2 py-1 font-bold",
                                                children: ["Sell Avg ", r.label]
                                            }, `sa-${r.label}`)), G.filter((r, d) => d >= 2).map(r => t.jsxs("th", {
                                                className: "text-center px-2 py-1 font-bold",
                                                children: ["PF ", r.label]
                                            }, `pf-${r.label}`)), t.jsx("th", {
                                                className: "text-center px-2 py-1 font-bold",
                                                children: "Score"
                                            })]
                                        })
                                    }), t.jsx("tbody", {
                                        children: e.results.filter(r => r.buySummary && r.sellSummary).flatMap(r => {
                                            const d = r.window === e.bestWindow,
                                                n = [];
                                            return M === "both" ? (n.push({
                                                key: `${r.window}-brk`,
                                                label: "BRK",
                                                bs: r.buySummary,
                                                ss: r.sellSummary,
                                                score: null,
                                                highlight: !1
                                            }), r.buyRevSummary && r.sellRevSummary && n.push({
                                                key: `${r.window}-rev`,
                                                label: "REV",
                                                bs: r.buyRevSummary,
                                                ss: r.sellRevSummary,
                                                score: null,
                                                highlight: !1
                                            })) : n.push({
                                                key: `${r.window}`,
                                                label: "",
                                                bs: r.buySummary,
                                                ss: r.sellSummary,
                                                score: r.compositeScore,
                                                highlight: d
                                            }), n.map((s, x) => t.jsxs("tr", {
                                                className: `${s.highlight?"bg-primary/15 ring-1 ring-inset ring-primary/30":M==="both"&&x===1?"bg-white/[0.02] border-b border-border/30":"hover:bg-white/5"}`,
                                                children: [x === 0 ? t.jsxs("td", {
                                                    className: `px-2 py-1 font-bold ${d?"text-primary":"text-foreground"}`,
                                                    rowSpan: M === "both" ? n.length : 1,
                                                    children: [ne[r.window] || `${r.window}d`, d && " ★"]
                                                }) : null, M === "both" && t.jsx("td", {
                                                    className: `text-center px-2 py-1 font-bold ${s.label==="REV"?"text-amber-400":"text-blue-400"}`,
                                                    children: s.label
                                                }), t.jsx("td", {
                                                    className: "text-center px-2 py-1 text-foreground",
                                                    children: s.bs.count
                                                }), t.jsx("td", {
                                                    className: "text-center px-2 py-1 text-foreground",
                                                    children: s.ss.count
                                                }), G.map(i => {
                                                    const u = Re ? s.bs.bandHitRate?.[i.label] ?? 0 : s.bs.hitRate[i.label];
                                                    return t.jsx("td", {
                                                        className: `text-center px-2 py-1 ${s.bs.count>0?wt(u):""}`,
                                                        children: s.bs.count > 0 ? $e(u) : "–"
                                                    }, `bh-${i.label}`)
                                                }), G.filter((i, u) => u >= 2).map(i => t.jsx("td", {
                                                    className: `text-center px-2 py-1 ${s.bs.count>0?s.bs.avgReturn[i.label]>=0?"text-green-400":"text-red-400":""}`,
                                                    children: s.bs.count > 0 ? St(s.bs.avgReturn[i.label]) : "–"
                                                }, `ba-${i.label}`)), G.map(i => {
                                                    const u = Re ? s.ss.bandHitRate?.[i.label] ?? 0 : s.ss.hitRate[i.label];
                                                    return t.jsx("td", {
                                                        className: `text-center px-2 py-1 ${s.ss.count>0?wt(u):""}`,
                                                        children: s.ss.count > 0 ? $e(u) : "–"
                                                    }, `sh-${i.label}`)
                                                }), G.filter((i, u) => u >= 2).map(i => t.jsx("td", {
                                                    className: `text-center px-2 py-1 ${s.ss.count>0?s.ss.avgReturn[i.label]<=0?"text-green-400":"text-red-400":""}`,
                                                    children: s.ss.count > 0 ? St(s.ss.avgReturn[i.label]) : "–"
                                                }, `sa-${i.label}`)), G.filter((i, u) => u >= 2).map(i => {
                                                    const u = s.bs.count > 0 ? s.bs.profitFactor[i.label] : s.ss.profitFactor[i.label],
                                                        C = s.bs.count > 0 || s.ss.count > 0;
                                                    return t.jsx("td", {
                                                        className: `text-center px-2 py-1 ${C?lr(u):""}`,
                                                        children: C ? u >= 99 ? "∞" : u.toFixed(2) : "–"
                                                    }, `pf-${i.label}`)
                                                }), x === 0 ? t.jsx("td", {
                                                    className: "text-center px-2 py-1",
                                                    rowSpan: M === "both" ? n.length : 1,
                                                    children: t.jsx("span", {
                                                        className: "inline-block px-1.5 py-0.5 rounded font-bold",
                                                        style: {
                                                            backgroundColor: We(r.compositeScore),
                                                            color: Ie(r.compositeScore)
                                                        },
                                                        children: r.compositeScore
                                                    })
                                                }) : null]
                                            }, s.key))
                                        })
                                    })]
                                })
                            }), l && e.priceContext && (() => {
                                const r = e.results.find(n => n.window === e.bestWindow);
                                if (!r) return null;
                                const d = [];
                                return r.buyProfiles && r.buyProfiles.length >= 10 && d.push({
                                    key: `${e.ticker}::brk-buy`,
                                    label: `Buy BRK (${r.buyProfiles.length})`,
                                    profiles: r.buyProfiles,
                                    direction: "buy",
                                    title: `${ne[e.bestWindow]||e.bestWindow+"d"} — Buy Breakout`
                                }), r.sellProfiles && r.sellProfiles.length >= 10 && d.push({
                                    key: `${e.ticker}::brk-sell`,
                                    label: `Sell BRK (${r.sellProfiles.length})`,
                                    profiles: r.sellProfiles,
                                    direction: "sell",
                                    title: `${ne[e.bestWindow]||e.bestWindow+"d"} — Sell Breakout`
                                }), r.buyRevProfiles && r.buyRevProfiles.length >= 10 && d.push({
                                    key: `${e.ticker}::rev-buy`,
                                    label: `Buy REV (${r.buyRevProfiles.length})`,
                                    profiles: r.buyRevProfiles,
                                    direction: "buy",
                                    title: `${ne[e.bestWindow]||e.bestWindow+"d"} — Buy Reversion`
                                }), r.sellRevProfiles && r.sellRevProfiles.length >= 10 && d.push({
                                    key: `${e.ticker}::rev-sell`,
                                    label: `Sell REV (${r.sellRevProfiles.length})`,
                                    profiles: r.sellRevProfiles,
                                    direction: "sell",
                                    title: `${ne[e.bestWindow]||e.bestWindow+"d"} — Sell Reversion`
                                }), d.length === 0 ? null : t.jsxs("div", {
                                    className: "mt-2 px-2",
                                    children: [t.jsxs("div", {
                                        className: "flex flex-wrap items-center gap-1.5 mb-1",
                                        children: [t.jsx("span", {
                                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                            children: "Hit Conditions (best window):"
                                        }), d.map(n => {
                                            const s = it.has(n.key);
                                            return t.jsxs("button", {
                                                type: "button",
                                                onClick: () => At(n.key),
                                                className: `px-1.5 py-0.5 rounded text-[9px] font-bold border ${s?"bg-violet-500/25 text-violet-200 border-violet-400/40":"bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"}`,
                                                title: "Profile what other indicators looked like at hit-bars vs miss-bars",
                                                children: [s ? "▾" : "▸", " ", n.label]
                                            }, n.key)
                                        })]
                                    }), d.filter(n => it.has(n.key)).map(n => t.jsx("div", {
                                        className: "mt-1",
                                        children: t.jsx(Rt, {
                                            ticker: e.ticker,
                                            priceContext: e.priceContext,
                                            signals: n.profiles,
                                            direction: n.direction,
                                            title: n.title,
                                            useBand: Re
                                        })
                                    }, `${n.key}-panel`))]
                                })
                            })()]
                        }, e.ticker)
                    })]
                })]
            })]
        })]
    })
}
export {
    Ar as
    default
};