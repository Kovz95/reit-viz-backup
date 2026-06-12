import {
    r as d,
    ag as ct,
    aj as lr,
    cH as ar,
    cG as ir,
    g as cr,
    a as dr,
    af as ur,
    ae as Mt,
    dk as Ae,
    cL as dt,
    d0 as mr,
    d1 as Lt,
    c_ as $t,
    dl as At,
    cM as pr,
    j as t,
    cO as xr,
    cP as fr,
    dj as br,
    cN as ze,
    de as Ft,
    cV as gr,
    B as hr,
    z as yr,
    cU as It,
    cX as kr,
    cY as Et,
    cZ as jr,
    df as Vt,
    dd as vr,
    cJ as wr
} from "./index-CsG73Aq_.js";
import {
    g as Dt
} from "./yahooPairsRatio-DERC-reP.js";
import {
    P as Nr
} from "./PresetBar-B4InBSQb.js";
import {
    U as Se
} from "./UnifiedTickerPicker-D927mSvl.js";
import {
    B as Ht
} from "./BasketTickerPill-DA9Wjwwc.js";
import {
    c as xt
} from "./rocSignalDetect-B1VJ2Cnc.js";
import {
    e as Cr,
    H as zt,
    E as Pr
} from "./EvaluatorPanel-BcObXxAZ.js";
import {
    B as _r
} from "./BasketPicker-DkcKAXfe.js";
import {
    r as ut,
    g as Ot
} from "./basketOhlc-CIjRG6QD.js";
import {
    u as Sr
} from "./useOptimizerClassFilter-COCFGQs0.js";
import {
    u as Tr
} from "./usePairComboPicker-h_S34tFb.js";
import {
    u as Rr
} from "./useFrequency-DK9YJz0p.js";
import {
    d as Br,
    e as Kt
} from "./weeklyDownsample-BzVm8wGH.js";
import "./harsi-NMVnsDcX.js";
import "./tva-DaeKqI67.js";
import "./globalUniverse-DuqPcp2u.js";
import "./ClassificationFiltersWithSource-D7v4WOtR.js";

function Ke(o, s) {
    const l = new Array(o.length).fill(null);
    let i = 0;
    for (let r = 0; r < o.length; r++) i += o[r], r >= s && (i -= o[r - s]), r >= s - 1 && (l[r] = i / s);
    return l
}

function Mr(o, s) {
    const l = new Array(o.length).fill(null);
    if (o.length < s + 1) return l;
    let i = 0,
        r = 0;
    for (let n = 1; n <= s; n++) {
        const p = o[n] - o[n - 1];
        p > 0 ? i += p : r += -p
    }
    i /= s, r /= s, l[s] = r === 0 ? i === 0 ? 50 : 100 : 100 - 100 / (1 + i / r);
    for (let n = s + 1; n < o.length; n++) {
        const p = o[n] - o[n - 1],
            z = p > 0 ? p : 0,
            se = p < 0 ? -p : 0;
        i = (i * (s - 1) + z) / s, r = (r * (s - 1) + se) / s, l[n] = r === 0 ? i === 0 ? 50 : 100 : 100 - 100 / (1 + i / r)
    }
    return l
}

function Lr(o, s) {
    const l = new Array(o.length).fill(null);
    for (let i = s; i < o.length; i++) {
        const r = o[i],
            n = o[i - s];
        r !== null && n !== null && n !== 0 && (l[i] = r / n - 1)
    }
    return l
}

function $r() {
    const o = [];
    for (const [s, l] of [
            [10, 50],
            [20, 50],
            [50, 200]
        ]) o.push({
        kind: "golden_cross",
        label: `Golden ${s}/${l}`,
        direction: "buy",
        fastPeriod: s,
        slowPeriod: l
    }), o.push({
        kind: "death_cross",
        label: `Death ${s}/${l}`,
        direction: "sell",
        fastPeriod: s,
        slowPeriod: l
    });
    for (const s of [20, 50, 200]) o.push({
        kind: "price_above",
        label: `Px↑MA${s}`,
        direction: "buy",
        maPeriod: s
    }), o.push({
        kind: "price_below",
        label: `Px↓MA${s}`,
        direction: "sell",
        maPeriod: s
    });
    for (const s of [20, 50, 200]) o.push({
        kind: "roc_above_thresh",
        label: `ROC(${s})↑+5%`,
        direction: "buy",
        rocPeriod: s,
        threshold: .05
    }), o.push({
        kind: "roc_below_thresh",
        label: `ROC(${s})↓-5%`,
        direction: "sell",
        rocPeriod: s,
        threshold: .05
    }), o.push({
        kind: "roc_zero_up",
        label: `ROC(${s})↑0`,
        direction: "buy",
        rocPeriod: s
    }), o.push({
        kind: "roc_zero_down",
        label: `ROC(${s})↓0`,
        direction: "sell",
        rocPeriod: s
    });
    return o.push({
        kind: "rsi_cross_up_lo",
        label: "RSI(14)↑30",
        direction: "buy"
    }), o.push({
        kind: "rsi_cross_down_hi",
        label: "RSI(14)↓70",
        direction: "sell"
    }), o
}

function Ar() {
    const o = [];
    for (const s of [20, 50]) o.push({
        kind: "roc_above",
        label: `ROC(${s})>+5%`,
        period: s,
        threshold: .05
    }), o.push({
        kind: "roc_above",
        label: `ROC(${s})>+10%`,
        period: s,
        threshold: .1
    }), o.push({
        kind: "roc_below",
        label: `ROC(${s})<-5%`,
        period: s,
        threshold: .05
    }), o.push({
        kind: "roc_below",
        label: `ROC(${s})<-10%`,
        period: s,
        threshold: .1
    });
    o.push({
        kind: "rsi_below",
        label: "RSI<30",
        threshold: 30
    }), o.push({
        kind: "rsi_below",
        label: "RSI<40",
        threshold: 40
    }), o.push({
        kind: "rsi_above",
        label: "RSI>60",
        threshold: 60
    }), o.push({
        kind: "rsi_above",
        label: "RSI>70",
        threshold: 70
    }), o.push({
        kind: "rsi_band",
        label: "RSI∈[40,60]",
        bandLow: 40,
        bandHigh: 60
    });
    for (const s of [50, 200]) o.push({
        kind: "price_above_ma",
        label: `Px>MA${s}`,
        period: s
    }), o.push({
        kind: "price_below_ma",
        label: `Px<MA${s}`,
        period: s
    });
    for (const s of [50, 200]) o.push({
        kind: "ma_slope_up",
        label: `MA${s}↗`,
        period: s,
        slopeLookback: 5
    }), o.push({
        kind: "ma_slope_down",
        label: `MA${s}↘`,
        period: s,
        slopeLookback: 5
    });
    return o
}

function mt(o) {
    const s = Mr(o, 14),
        l = new Map;
    for (const n of [20, 50, 200]) l.set(n, xt(o, n));
    const i = new Map;
    for (const n of [10, 20, 50, 200]) i.set(n, Ke(o, n));
    const r = new Map;
    for (const n of [50, 200]) r.set(n, Lr(i.get(n), 5));
    return {
        rsi14: s,
        rocByPeriod: l,
        smaByPeriod: i,
        slopeByPeriod: r
    }
}

function Ut(o, s, l) {
    const i = [];
    switch (o.kind) {
        case "golden_cross":
        case "death_cross": {
            const r = l.smaByPeriod.get(o.fastPeriod) ?? Ke(s, o.fastPeriod),
                n = l.smaByPeriod.get(o.slowPeriod) ?? Ke(s, o.slowPeriod);
            l.smaByPeriod.has(o.fastPeriod) || l.smaByPeriod.set(o.fastPeriod, r), l.smaByPeriod.has(o.slowPeriod) || l.smaByPeriod.set(o.slowPeriod, n);
            for (let p = 1; p < s.length; p++) {
                if (r[p] === null || n[p] === null || r[p - 1] === null || n[p - 1] === null) continue;
                const z = r[p] > n[p],
                    se = r[p - 1] > n[p - 1];
                o.kind === "golden_cross" && z && !se && i.push(p), o.kind === "death_cross" && !z && se && i.push(p)
            }
            break
        }
        case "price_above":
        case "price_below": {
            const r = l.smaByPeriod.get(o.maPeriod) ?? Ke(s, o.maPeriod);
            l.smaByPeriod.has(o.maPeriod) || l.smaByPeriod.set(o.maPeriod, r);
            for (let n = 1; n < s.length; n++) {
                if (r[n] === null || r[n - 1] === null) continue;
                const p = s[n] > r[n],
                    z = s[n - 1] > r[n - 1];
                o.kind === "price_above" && p && !z && i.push(n), o.kind === "price_below" && !p && z && i.push(n)
            }
            break
        }
        case "roc_above_thresh":
        case "roc_below_thresh": {
            const r = l.rocByPeriod.get(o.rocPeriod) ?? xt(s, o.rocPeriod);
            l.rocByPeriod.has(o.rocPeriod) || l.rocByPeriod.set(o.rocPeriod, r);
            const n = o.threshold;
            for (let p = 1; p < s.length; p++) !Number.isFinite(r[p]) || !Number.isFinite(r[p - 1]) || (o.kind === "roc_above_thresh" && r[p - 1] <= n && r[p] > n && i.push(p), o.kind === "roc_below_thresh" && r[p - 1] >= -n && r[p] < -n && i.push(p));
            break
        }
        case "roc_zero_up":
        case "roc_zero_down": {
            const r = l.rocByPeriod.get(o.rocPeriod) ?? xt(s, o.rocPeriod);
            l.rocByPeriod.has(o.rocPeriod) || l.rocByPeriod.set(o.rocPeriod, r);
            for (let n = 1; n < s.length; n++) !Number.isFinite(r[n]) || !Number.isFinite(r[n - 1]) || (o.kind === "roc_zero_up" && r[n - 1] <= 0 && r[n] > 0 && i.push(n), o.kind === "roc_zero_down" && r[n - 1] >= 0 && r[n] < 0 && i.push(n));
            break
        }
        case "rsi_cross_up_lo":
        case "rsi_cross_down_hi": {
            const r = l.rsi14;
            for (let n = 1; n < r.length; n++) {
                const p = r[n],
                    z = r[n - 1];
                p === null || z === null || (o.kind === "rsi_cross_up_lo" && z <= 30 && p > 30 && i.push(n), o.kind === "rsi_cross_down_hi" && z >= 70 && p < 70 && i.push(n))
            }
            break
        }
    }
    return i
}

function Oe(o, s, l, i) {
    switch (o.kind) {
        case "roc_above": {
            const r = i.rocByPeriod.get(o.period);
            if (!r) return null;
            const n = r[s];
            return Number.isFinite(n) ? n > o.threshold : null
        }
        case "roc_below": {
            const r = i.rocByPeriod.get(o.period);
            if (!r) return null;
            const n = r[s];
            return Number.isFinite(n) ? n < -o.threshold : null
        }
        case "rsi_below": {
            const r = i.rsi14[s];
            return r === null ? null : r < o.threshold
        }
        case "rsi_above": {
            const r = i.rsi14[s];
            return r === null ? null : r > o.threshold
        }
        case "rsi_band": {
            const r = i.rsi14[s];
            return r === null ? null : r >= o.bandLow && r <= o.bandHigh
        }
        case "price_above_ma": {
            const r = i.smaByPeriod.get(o.period);
            return !r || r[s] === null ? null : l[s] > r[s]
        }
        case "price_below_ma": {
            const r = i.smaByPeriod.get(o.period);
            return !r || r[s] === null ? null : l[s] < r[s]
        }
        case "ma_slope_up": {
            const r = i.slopeByPeriod.get(o.period);
            return !r || r[s] === null ? null : r[s] > 0
        }
        case "ma_slope_down": {
            const r = i.slopeByPeriod.get(o.period);
            return !r || r[s] === null ? null : r[s] < 0
        }
    }
}
async function pt(o, s, l) {
    const i = l ?? Vt;
    if (i.kind !== "close") {
        const r = await vr(o, i);
        return r ? {
            closes: r.closes,
            highs: r.highs,
            lows: r.lows,
            volumes: r.volumes,
            priceDates: r.priceDates
        } : null
    }
    try {
        const r = await wr(o);
        if (r.adjCloses.length > 0) {
            const n = r.adjCloses.length,
                p = r.highs ?? r.adjCloses,
                z = r.lows ?? r.adjCloses,
                se = new Array(n),
                Te = new Array(n);
            for (let v = 0; v < n; v++) {
                const de = r.closes ? r.closes[v] : NaN,
                    $ = r.adjCloses[v],
                    ge = Number.isFinite(de) && de > 0 && Number.isFinite($) ? $ / de : 1;
                se[v] = p[v] * ge, Te[v] = z[v] * ge
            }
            return {
                closes: r.adjCloses,
                highs: se,
                lows: Te,
                volumes: r.volumes ?? [],
                priceDates: r.dates ?? []
            }
        }
        return null
    } catch {
        return null
    }
}

function eo() {
    const [o, s] = d.useState([]), [l, i] = d.useState(""), [r, n] = ct("combo-input-selection", Vt), [p, z] = d.useState(null), [se, Te] = d.useState(!1), [v, de] = d.useState(""), [$, ge] = d.useState(""), [u, ue] = d.useState("single"), [Q, ft] = d.useState([]), [me, bt] = d.useState("stocks"), {
        baskets: Re
    } = lr(), [B, Ue] = d.useState("3M"), [Ve, Gt] = d.useState("composite"), Be = d.useMemo(() => ar(Ve), [Ve]), [pe, gt] = d.useState("both"), [xe, ht] = d.useState(2), [ne, Ge] = d.useState(.05), [he, yt] = d.useState(15), [Me, kt] = d.useState(0), [le, qe] = d.useState(1), [we, jt] = d.useState(10), [qt, Ye] = d.useState("10y"), [G, We] = d.useState(() => ir()), [M, Ne] = d.useState(!1), [vt, wt] = d.useState({
        current: 0,
        total: 0
    }), [ye, Fe] = ct("combo:results", []), [Ie, Nt] = d.useState(""), [Je, Ct] = d.useState(null), [Yt, Wt] = d.useState(new Set), Jt = d.useCallback(e => {
        Wt(c => {
            const k = new Set(c);
            return k.has(e) ? k.delete(e) : k.add(e), k
        })
    }, []), [Ce, Xe] = d.useState("optimize"), [te, Ze] = d.useState(""), [fe, Pt] = d.useState([]), [ee, Qe] = d.useState("long"), [Pe, et] = ct("combo:evalResult", null), [Ee, _t] = d.useState(null), [tt, q] = d.useState(!1), rt = d.useRef(!1), Xt = d.useRef(!1), {
        frequency: ae,
        setFrequency: ot,
        frequencyUI: Zt
    } = Rr("combo", "daily", M), ke = ae === "weekly" ? "weekly" : "daily", st = d.useCallback(() => ({
        selectedTicker: l,
        pairTickerA: v,
        pairTickerB: $,
        basketTickers: Q,
        basketMode: me,
        mode: u,
        horizon: B,
        direction: pe,
        maxFilters: xe,
        targetReturn: ne,
        minSignals: he,
        minLift: Me,
        minHold: le,
        topN: we,
        view: Ce,
        evalDirection: ee,
        evalTriggerKey: te,
        evalFilterKeys: fe,
        results: ye,
        expandedTicker: Je,
        evalResult: Pe,
        frequency: ae,
        inputSelection: r
    }), [l, v, $, Q, me, u, B, pe, xe, ne, he, Me, le, we, Ce, ee, te, fe, ye, Je, Pe, ae, r]), nt = d.useCallback(e => {
        if (e && (e.selectedTicker && (i(e.selectedTicker), Xt.current = !0), e.pairTickerA && de(e.pairTickerA), e.pairTickerB && ge(e.pairTickerB), (e.mode === "single" || e.mode === "universe" || e.mode === "pair" || e.mode === "pairCombo" || e.mode === "basket") && ue(e.mode), e.pairCombo && Le.hydrate(e.pairCombo), Array.isArray(e.basketTickers) && ft(e.basketTickers.filter(c => typeof c == "string")), (e.basketMode === "stocks" || e.basketMode === "combined") && bt(e.basketMode), (e.horizon === "1M" || e.horizon === "2M" || e.horizon === "3M" || e.horizon === "6M") && Ue(e.horizon), (e.direction === "both" || e.direction === "buy" || e.direction === "sell") && gt(e.direction), typeof e.maxFilters == "number" && ht(e.maxFilters), typeof e.targetReturn == "number" && Ge(e.targetReturn), typeof e.minSignals == "number" && yt(e.minSignals), typeof e.minLift == "number" && kt(e.minLift), typeof e.minHold == "number" && qe(e.minHold), typeof e.topN == "number" && jt(e.topN), (e.view === "optimize" || e.view === "evaluate") && Xe(e.view), (e.evalDirection === "long" || e.evalDirection === "short") && Qe(e.evalDirection), typeof e.evalTriggerKey == "string" && Ze(e.evalTriggerKey), Array.isArray(e.evalFilterKeys) && Pt(e.evalFilterKeys), Array.isArray(e.results) && Fe(e.results), e.expandedTicker !== void 0 && Ct(e.expandedTicker), e.evalResult !== void 0 && et(e.evalResult), e.frequency === "daily" || e.frequency === "weekly" || e.frequency === "weekly_on_daily" ? ot(e.frequency) : e.timeframe === "weekly" && e.frequency === void 0 && ot("weekly"), e.inputSelection && typeof e.inputSelection == "object")) {
            const c = e.inputSelection;
            c.kind === "close" ? n({
                kind: "close"
            }) : c.kind === "workbook" && typeof c.metric == "string" && n({
                kind: "workbook",
                metric: c.metric
            })
        }
    }, [ot, n]);
    cr("combo-optimizer", st, nt);
    const Qt = d.useCallback(() => {
            const e = st(),
                {
                    selectedTicker: c,
                    pairTickerA: k,
                    pairTickerB: x,
                    results: m,
                    gridResults: f,
                    expandedTicker: g,
                    expandedGridTicker: I,
                    sortBy: A,
                    runSort: E,
                    gridLongSort: F,
                    gridShortSort: U,
                    evalResult: w,
                    evalTriggerKey: re,
                    evalFilterKeys: ie,
                    ...be
                } = e;
            return be
        }, [st]),
        er = d.useCallback(e => {
            nt(e)
        }, [nt]),
        {
            universeTickers: lt,
            isFiltered: Fr
        } = dr(),
        R = d.useMemo(() => lt ? o.filter(e => lt.has(e.ticker)) : o, [o, lt]),
        De = Sr(R, u === "universe", "combo-clf"),
        Le = Tr(R.map(e => e.ticker), u === "pairCombo", "combo-pc"),
        tr = De.filteredTickers;
    d.useEffect(() => {
        ur().then(e => {
            s(e), e.length > 0 && (i(e[0].ticker), de(e[0].ticker), ge(e[1]?.ticker ?? e[0].ticker))
        })
    }, []), d.useEffect(() => {
        R.length > 0 && l && o.some(e => e.ticker === l) && !R.find(e => e.ticker === l) && i(R[0].ticker)
    }, [R, l, o]);
    const Y = d.useMemo(() => $r(), []),
        O = d.useMemo(() => Ar(), []),
        rr = d.useCallback(async () => {
            Ne(!0), Fe([]), rt.current = !1;
            const e = await Mt();
            let c;
            if (u === "pair") {
                if (!v || !$ || v === $) {
                    Ne(!1);
                    return
                }
                c = [{
                    ticker: `${v}/${$}`
                }]
            } else if (u === "single") {
                const m = l,
                    f = R.find(g => g.ticker === m);
                c = f ? [f] : m ? [{
                    ticker: m,
                    name: m
                }] : []
            } else if (u === "basket")
                if (me === "combined") {
                    if (Q.length === 0) {
                        Ne(!1);
                        return
                    }
                    const m = ut(Q, Re);
                    c = [{
                        ticker: `BASKET:${m.name}`,
                        name: `BASKET:${m.name}`
                    }]
                } else c = Q.map(m => R.find(g => g.ticker.toUpperCase() === m.toUpperCase()) ?? {
                    ticker: m,
                    name: m
                });
            else if (u === "pairCombo") {
                if (Le.pairs.length === 0) {
                    Ne(!1);
                    return
                }
                c = Le.pairs.map(m => ({
                    ticker: m.label,
                    name: m.label,
                    pairA: m.a,
                    pairB: m.b
                }))
            } else c = tr;
            if (c.length === 0) {
                Ne(!1);
                return
            }
            const k = u === "basket" && me === "combined" ? ut(Q, Re) : null;
            wt({
                current: 0,
                total: c.length
            });
            const x = [];
            for (let m = 0; m < c.length && !rt.current; m++) {
                const f = c[m];
                wt({
                    current: m + 1,
                    total: c.length
                });
                try {
                    let g, I, A, E = null,
                        F, U, w = null,
                        re = null;
                    const ie = u === "pairCombo" ? f.pairA : v,
                        be = u === "pairCombo" ? f.pairB : $;
                    if (u === "pair" || u === "pairCombo") {
                        const a = await Dt(ie, be, e);
                        if (!a || a.indices.length < 252) continue;
                        const N = a.prices,
                            D = a.indices.map(j => e[j] || ""),
                            H = a.indices.slice(),
                            J = Ae(D, G, N, H),
                            T = J.dates,
                            X = J.arrays[0],
                            K = J.arrays[1];
                        if (X.length < 252) continue;
                        g = X, I = g.slice(), A = g.slice(), F = T, U = K
                    } else if (k && u === "basket") {
                        const a = await Ot(k, G);
                        if (!a || a.closes.length < 252) continue;
                        w = a.closes, E = a.volumes;
                        const N = a.highs,
                            D = a.lows,
                            H = a.priceDates,
                            J = new Map;
                        for (let T = 0; T < e.length; T++) J.set(e[T], T);
                        if (ae === "weekly_on_daily") {
                            if (g = w, I = N, A = D, F = H, U = F.map(T => J.get(T) ?? -1), w.length < 252) continue
                        } else {
                            const T = dt({
                                dates: H,
                                closes: w,
                                adjCloses: w,
                                highs: N,
                                lows: D
                            }, ke);
                            if (re = T, ke === "weekly" && E) {
                                const K = new Array(T.dailyIndexMap.length);
                                let j = -1;
                                for (let C = 0; C < T.dailyIndexMap.length; C++) {
                                    const y = T.dailyIndexMap[C];
                                    let P = 0;
                                    for (let L = j + 1; L <= y; L++) P += E[L] || 0;
                                    K[C] = P, j = y
                                }
                                E = K
                            }
                            g = T.adjCloses, I = T.highs, A = T.lows, F = T.dates, U = F.map(K => J.get(K) ?? -1);
                            const X = ke === "weekly" ? 52 : 252;
                            if (T.adjCloses.length < X) continue
                        }
                    } else {
                        const a = await pt(f.ticker, e, r);
                        if (!a || a.closes.length < 252) continue;
                        const N = Ae(a.priceDates, G, a.closes, a.highs, a.lows, a.volumes),
                            D = N.arrays[0],
                            H = N.arrays[1],
                            J = N.arrays[2],
                            T = N.arrays[3],
                            X = N.dates;
                        if (D.length < 252) continue;
                        w = D, E = T;
                        const K = H,
                            j = J,
                            C = X;
                        if (ae === "weekly_on_daily") {
                            g = w, I = K, A = j, F = C;
                            const y = new Map;
                            for (let P = 0; P < e.length; P++) y.set(e[P], P);
                            if (U = F.map(P => y.get(P) ?? -1), w.length < 252) continue
                        } else {
                            const y = dt({
                                dates: C,
                                closes: w,
                                adjCloses: w,
                                highs: K,
                                lows: j
                            }, ke);
                            if (re = y, ke === "weekly" && E) {
                                const Z = new Array(y.dailyIndexMap.length);
                                let $e = -1;
                                for (let ve = 0; ve < y.dailyIndexMap.length; ve++) {
                                    const Rt = y.dailyIndexMap[ve];
                                    let Bt = 0;
                                    for (let it = $e + 1; it <= Rt; it++) Bt += E[it] || 0;
                                    Z[ve] = Bt, $e = Rt
                                }
                                E = Z
                            }
                            g = y.adjCloses, I = y.highs, A = y.lows, F = y.dates;
                            const P = new Map;
                            for (let Z = 0; Z < e.length; Z++) P.set(e[Z], Z);
                            U = F.map(Z => P.get(Z) ?? -1);
                            const L = ke === "weekly" ? 52 : 252;
                            if (y.adjCloses.length < L) continue
                        }
                    }
                    let ce;
                    if (ae === "weekly_on_daily" && w !== null) {
                        const a = Br(w, F),
                            N = w.length,
                            D = mt(a.prices),
                            H = C => {
                                const y = C.map(L => L === null ? NaN : L);
                                return Kt(y, a.weekIndex, N).map(L => Number.isFinite(L) ? L : null)
                            },
                            J = C => Kt(C, a.weekIndex, N),
                            T = H(D.rsi14),
                            X = new Map;
                        Array.from(D.rocByPeriod.entries()).forEach(([C, y]) => X.set(C, J(y)));
                        const K = new Map;
                        Array.from(D.smaByPeriod.entries()).forEach(([C, y]) => K.set(C, H(y)));
                        const j = new Map;
                        Array.from(D.slopeByPeriod.entries()).forEach(([C, y]) => j.set(C, H(y))), ce = {
                            rsi14: T,
                            rocByPeriod: X,
                            smaByPeriod: K,
                            slopeByPeriod: j
                        }
                    } else ce = mt(g);
                    const at = Y.filter(a => pe === "both" ? !0 : a.direction === pe),
                        h = [];
                    let b = 0;
                    const _ = (a, N) => {
                        if (ke === "weekly" && re !== null && w !== null) {
                            const H = mr(a, re);
                            return H < 0 ? null : Lt(w, H, ne, N, null, le)
                        }
                        return Lt(w !== null ? w : g, a, ne, N, null, le)
                    };
                    for (const a of at) {
                        const N = Ut(a, g, ce);
                        if (N.length === 0) continue;
                        b += N.length;
                        const D = N.map(j => _(j, a.direction === "buy" ? "buy" : "sell")).filter(j => j !== null && j.returns[B] !== null);
                        if (D.length === 0) continue;
                        const H = $t(D, a.direction === "buy" ? "buy" : "sell"),
                            J = H.hitRate[B] ?? 0,
                            T = H.count,
                            X = (j, C) => {
                                if (j.length < he) return null;
                                const y = j.map(L => _(L, a.direction === "buy" ? "buy" : "sell")).filter(L => L !== null && L.returns[B] !== null);
                                if (y.length < he) return null;
                                const P = $t(y, a.direction === "buy" ? "buy" : "sell");
                                return {
                                    triggerLabel: a.label,
                                    triggerKind: a.kind,
                                    direction: a.direction,
                                    filterLabels: C,
                                    summary: P,
                                    baselineHitRate: J,
                                    baselineCount: T,
                                    signalIndices: j,
                                    profiles: y
                                }
                            },
                            K = X(N, []);
                        if (K && h.push(K), xe >= 1)
                            for (let j = 0; j < O.length; j++) {
                                const C = O[j],
                                    y = [];
                                for (const L of N) Oe(C, L, g, ce) === !0 && y.push(L);
                                const P = X(y, [C.label]);
                                P && h.push(P)
                            }
                        if (xe >= 2)
                            for (let j = 0; j < O.length; j++) {
                                const C = O[j],
                                    y = [];
                                for (const P of N) Oe(C, P, g, ce) === !0 && y.push(P);
                                if (!(y.length < he))
                                    for (let P = j + 1; P < O.length; P++) {
                                        const L = O[P],
                                            Z = [];
                                        for (const ve of y) Oe(L, ve, g, ce) === !0 && Z.push(ve);
                                        const $e = X(Z, [C.label, L.label]);
                                        $e && h.push($e)
                                    }
                            }
                    }
                    if (h.length === 0) continue;
                    const S = Me / 100,
                        V = h.filter(a => a.filterLabels.length === 0 ? !0 : (a.summary.hitRate[B] ?? 0) - a.baselineHitRate >= S);
                    V.sort((a, N) => At(a.summary, 0, N.summary, 0, a.direction, Be));
                    const W = V.slice(0, we),
                        oe = W.length > 0 ? pr(W[0].summary, 0, W[0].direction, Be) : 0,
                        je = {
                            prices: g,
                            highs: I,
                            lows: A,
                            volumes: E,
                            dates: F,
                            globalIndices: U,
                            benchmarkPrices: null,
                            mode: u === "pair" || u === "pairCombo" ? "pair" : "single",
                            pairLegA: u === "pair" || u === "pairCombo" ? ie : void 0,
                            pairLegB: u === "pair" || u === "pairCombo" ? be : void 0
                        };
                    x.push({
                        ticker: f.ticker,
                        name: f.name,
                        topCombos: W,
                        bestHitRate: oe,
                        triggerCount: b,
                        priceContext: je
                    }), (m % 3 === 0 || m === c.length - 1) && Fe([...x])
                } catch {}
            }
            Fe(x), Ne(!1)
        }, [R, l, v, $, u, pe, B, ne, Le.pairs, he, Me, le, xe, we, Y, O, ae, Be, G, Q, me, Re]),
        or = d.useCallback(async () => {
            q(!0), et(null), _t(null);
            try {
                const e = Y.find(h => h.label === te);
                if (!e) {
                    q(!1);
                    return
                }
                const c = await Mt();
                let k, x, m, f = null,
                    g, I;
                if (u === "pair") {
                    if (!v || !$ || v === $) {
                        q(!1);
                        return
                    }
                    const h = await Dt(v, $, c);
                    if (!h || h.indices.length < 252) {
                        q(!1);
                        return
                    }
                    const b = h.indices.map(oe => c[oe] ?? ""),
                        _ = h.indices.slice(),
                        S = Ae(b, G, h.prices, _),
                        V = S.arrays[0],
                        W = S.arrays[1];
                    if (V.length < 252) {
                        q(!1);
                        return
                    }
                    k = V, x = V.slice(), m = V.slice(), g = S.dates, I = W
                } else if (u === "basket") {
                    if (Q.length === 0) {
                        q(!1);
                        return
                    }
                    if (me === "combined") {
                        const h = ut(Q, Re),
                            b = await Ot(h, G);
                        if (!b || b.closes.length < 252) {
                            q(!1);
                            return
                        }
                        k = b.closes, x = b.highs, m = b.lows, f = b.volumes, g = b.priceDates;
                        const _ = new Map;
                        for (let S = 0; S < c.length; S++) _.set(c[S], S);
                        I = g.map(S => _.get(S) ?? -1)
                    } else {
                        const h = Q[0],
                            b = await pt(h, c, r);
                        if (!b || b.closes.length < 252) {
                            q(!1);
                            return
                        }
                        const _ = Ae(b.priceDates, G, b.closes, b.highs, b.lows, b.volumes),
                            S = _.arrays[0],
                            V = _.arrays[1],
                            W = _.arrays[2],
                            oe = _.arrays[3];
                        if (S.length < 252) {
                            q(!1);
                            return
                        }
                        k = S, x = V, m = W, f = oe, g = _.dates;
                        const je = new Map;
                        for (let a = 0; a < c.length; a++) je.set(c[a], a);
                        I = g.map(a => je.get(a) ?? -1)
                    }
                } else {
                    const h = u === "single" ? l : R[0]?.ticker ?? "";
                    if (!h) {
                        q(!1);
                        return
                    }
                    const b = await pt(h, c, r);
                    if (!b || b.closes.length < 252) {
                        q(!1);
                        return
                    }
                    const _ = Ae(b.priceDates, G, b.closes, b.highs, b.lows, b.volumes),
                        S = _.arrays[0],
                        V = _.arrays[1],
                        W = _.arrays[2],
                        oe = _.arrays[3];
                    if (S.length < 252) {
                        q(!1);
                        return
                    }
                    k = S, x = V, m = W, f = oe, g = _.dates;
                    const je = new Map;
                    for (let a = 0; a < c.length; a++) je.set(c[a], a);
                    I = g.map(a => je.get(a) ?? -1)
                }
                let A, E, F, U = null,
                    w;
                if (ae === "weekly") {
                    const h = dt({
                        dates: g,
                        closes: k,
                        adjCloses: k,
                        highs: x,
                        lows: m
                    }, "weekly");
                    if (A = h.adjCloses, E = h.highs, F = h.lows, w = h.dailyIndexMap.map(b => I[b] ?? -1), g = h.dates, f) {
                        const b = new Array(h.dailyIndexMap.length);
                        let _ = -1;
                        for (let S = 0; S < h.dailyIndexMap.length; S++) {
                            const V = h.dailyIndexMap[S];
                            let W = 0;
                            for (let oe = _ + 1; oe <= V; oe++) W += f[oe] || 0;
                            b[S] = W, _ = V
                        }
                        U = b
                    }
                } else A = k, E = x, F = m, U = f, w = I;
                const re = mt(A),
                    ie = Ut(e, A, re),
                    be = O.filter(h => fe.includes(h.label)),
                    ce = [];
                for (const h of ie) {
                    let b = !0;
                    for (const _ of be)
                        if (Oe(_, h, A, re) !== !0) {
                            b = !1;
                            break
                        } b && ce.push(h)
                }
                const at = Cr(A, g, ce, ee, ne, le, null, B);
                et(at), _t({
                    prices: A,
                    highs: E,
                    lows: F,
                    volumes: U,
                    dates: g,
                    globalIndices: w,
                    benchmarkPrices: null,
                    mode: u === "pair" ? "pair" : "single",
                    pairLegA: u === "pair" ? v : void 0,
                    pairLegB: u === "pair" ? $ : void 0
                })
            } finally {
                q(!1)
            }
        }, [Y, O, te, fe, ee, u, l, v, $, R, ne, le, B, ae, G, Q, me, Re]);
    d.useEffect(() => {
        !te && Y.length > 0 && Ze(Y[0].label)
    }, [Y, te]);
    const St = d.useMemo(() => {
            const e = Y.find(k => k.label === te);
            if (!e) return "";
            const c = fe.length > 0 ? " ∧ " + fe.join(" ∧ ") : "";
            return `${e.label}${c} [${ee}]`
        }, [te, fe, ee, Y]),
        _e = d.useMemo(() => {
            const e = Y.find(x => x.label === te);
            if (!e) return null;
            const c = e.direction,
                k = c === "buy" ? "long" : "short";
            return k !== ee ? {
                triggerLabel: e.label,
                triggerDir: c,
                expected: k,
                chosen: ee
            } : null
        }, [te, ee, Y]),
        Tt = d.useMemo(() => u === "pair" ? `${v||"A"}/${$||"B"}` : u === "single" ? l || "—" : R[0]?.ticker || "—", [u, v, $, l, R]),
        He = d.useMemo(() => {
            const e = Ie.trim().toLowerCase(),
                c = e ? ye.filter(k => k.ticker.toLowerCase().includes(e) || k.name && k.name.toLowerCase().includes(e)) : [...ye];
            return c.sort((k, x) => {
                const m = k.topCombos[0],
                    f = x.topCombos[0];
                return !m && !f ? 0 : m ? f ? At(m.summary, 0, f.summary, 0, m.direction, Be) : -1 : 1
            }), c
        }, [ye, Ie, Be]),
        sr = () => {
            const e = [];
            for (const m of He)
                for (const f of m.topCombos) e.push({
                    ticker: m.ticker,
                    name: m.name,
                    trigger: f.triggerLabel,
                    direction: f.direction,
                    filters: f.filterLabels.join(" & ") || "(none)",
                    n: f.summary.count,
                    hitRate: f.summary.hitRate[B] ?? null,
                    baselineHitRate: f.baselineHitRate,
                    lift: (f.summary.hitRate[B] ?? 0) - f.baselineHitRate,
                    baselineN: f.baselineCount,
                    avgReturn: f.summary.avgReturn[B] ?? null,
                    profitFactor: f.summary.profitFactor[B] ?? null
                });
            const c = Object.keys(e[0] || {}),
                k = [c.join(","), ...e.map(m => c.map(f => `"${String(m[f]??"").replace(/"/g,'""')}"`).join(","))].join(`
`),
                x = document.createElement("a");
            x.href = URL.createObjectURL(new Blob([k], {
                type: "text/csv"
            })), x.download = "combo_optimizer.csv", x.click()
        },
        nr = e => e >= .1 ? "text-emerald-400 font-bold" : e >= .05 ? "text-emerald-400" : e >= .02 ? "text-emerald-500/80" : e > 0 ? "text-foreground" : e > -.02 ? "text-muted-foreground" : "text-red-400";
    return t.jsxs("div", {
        className: "flex flex-col h-full overflow-hidden",
        children: [t.jsxs("div", {
            className: "flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3 flex-wrap",
            children: [t.jsx("h2", {
                className: "text-sm font-bold text-foreground tracking-tight",
                children: "Combo"
            }), t.jsxs("div", {
                className: "flex gap-px",
                children: [t.jsx("button", {
                    "data-testid": "combo-view-optimize",
                    className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${Ce==="optimize"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                    onClick: () => Xe("optimize"),
                    children: "Optimize"
                }), t.jsx("button", {
                    "data-testid": "combo-view-evaluate",
                    className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${Ce==="evaluate"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                    onClick: () => Xe("evaluate"),
                    children: "Evaluate"
                })]
            }), t.jsx("span", {
                className: "text-[10px] text-muted-foreground",
                children: Ce === "optimize" ? "Search trigger+filter patterns by hit rate" : "Score one specific trigger+filter setup"
            }), t.jsxs("div", {
                className: "flex items-center gap-1",
                children: [t.jsx("label", {
                    className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                    children: "DATE RANGE"
                }), t.jsx("div", {
                    className: "flex items-center gap-0.5",
                    children: xr.map(e => t.jsx("button", {
                        "data-testid": `combo-date-preset-${e.value}`,
                        className: `text-[9px] font-mono px-1.5 py-0.5 rounded ${qt===e.value?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border hover:text-foreground"}`,
                        onClick: () => {
                            Ye(e.value), We(fr(e.value))
                        },
                        children: e.label
                    }, e.value))
                }), t.jsx("input", {
                    type: "date",
                    "data-testid": "combo-date-start",
                    value: G.start,
                    onChange: e => {
                        Ye("custom"), We({
                            ...G,
                            start: e.target.value
                        })
                    },
                    className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                }), t.jsx("span", {
                    className: "text-[10px] font-mono text-muted-foreground",
                    children: "→"
                }), t.jsx("input", {
                    type: "date",
                    "data-testid": "combo-date-end",
                    value: G.end,
                    onChange: e => {
                        Ye("custom"), We({
                            ...G,
                            end: e.target.value
                        })
                    },
                    className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                })]
            })]
        }), Ce === "optimize" ? t.jsxs(t.Fragment, {
            children: [t.jsx(Nr, {
                kind: "combo",
                captureInputs: Qt,
                applyInputs: er
            }), t.jsxs("div", {
                className: "flex-shrink-0 px-4 py-3 border-b border-border bg-card",
                children: [t.jsxs("div", {
                    className: "flex items-center gap-4 flex-wrap",
                    children: [t.jsxs("div", {
                        className: "flex items-center gap-2",
                        children: [t.jsx("p", {
                            className: "text-[10px] text-muted-foreground",
                            children: "Find Trigger + Filter patterns that maximize hit rate"
                        }), t.jsxs("span", {
                            className: "inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20",
                            children: [t.jsx("svg", {
                                xmlns: "http://www.w3.org/2000/svg",
                                width: "8",
                                height: "8",
                                viewBox: "0 0 24 24",
                                fill: "currentColor",
                                children: t.jsx("circle", {
                                    cx: "12",
                                    cy: "12",
                                    r: "10"
                                })
                            }), "Yahoo Finance"]
                        }), p && t.jsxs("span", {
                            className: "text-[9px] font-mono text-muted-foreground",
                            children: [Math.round((Date.now() - p) / 6e4), "m ago"]
                        }), t.jsx("button", {
                            onClick: async () => {
                                const e = l;
                                if (e) {
                                    Te(!0);
                                    try {
                                        await br(e), z(Date.now())
                                    } catch {} finally {
                                        Te(!1)
                                    }
                                }
                            },
                            disabled: se,
                            title: "Force refresh Yahoo price cache",
                            className: "text-[9px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50",
                            children: se ? "…" : "↻"
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Mode"
                        }), t.jsxs("div", {
                            className: "flex gap-px",
                            children: [t.jsx("button", {
                                "data-testid": "combo-mode-single",
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${u==="single"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => ue("single"),
                                disabled: M,
                                children: "Single"
                            }), t.jsx("button", {
                                "data-testid": "combo-mode-universe",
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${u==="universe"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => ue("universe"),
                                disabled: M,
                                children: "Universe"
                            }), t.jsx("button", {
                                "data-testid": "combo-mode-pair",
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${u==="pair"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => ue("pair"),
                                disabled: M,
                                children: "Pair"
                            }), t.jsx("button", {
                                "data-testid": "combo-mode-pairCombo",
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${u==="pairCombo"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => ue("pairCombo"),
                                disabled: M,
                                children: "Pair Combo"
                            }), t.jsx("button", {
                                "data-testid": "combo-mode-basket",
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${u==="basket"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => ue("basket"),
                                disabled: M,
                                children: "Basket"
                            })]
                        })]
                    }), u !== "pair" && u !== "pairCombo" && Zt, u === "pairCombo" && t.jsxs("div", {
                        className: "flex flex-col gap-1 w-full",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Pair Combo — Leg Set"
                        }), Le.ui]
                    }), u === "universe" && De.classFilterUI && t.jsxs("div", {
                        className: "flex flex-col gap-1 w-full",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Classification Filter"
                        }), De.universeSourceUI, De.classFilterUI]
                    }), u === "single" && t.jsx("div", {
                        className: "flex items-end gap-2",
                        children: t.jsxs("div", {
                            className: "flex items-end gap-2",
                            children: [t.jsx("div", {
                                className: ze(l) ? "opacity-40 pointer-events-none" : "",
                                children: t.jsx(Se, {
                                    tickers: R,
                                    value: ze(l) ? "" : l,
                                    onChange: i,
                                    disabled: M,
                                    label: "Ticker"
                                })
                            }), t.jsxs("div", {
                                className: "flex flex-col gap-0.5",
                                children: [t.jsx("label", {
                                    className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                    children: "Basket"
                                }), t.jsx(Ht, {
                                    activeTicker: l,
                                    onSelectTicker: i,
                                    fallbackTicker: R[0]?.ticker ?? null
                                })]
                            })]
                        })
                    }), u === "pair" && t.jsxs(t.Fragment, {
                        children: [t.jsx(Se, {
                            tickers: R,
                            value: v,
                            onChange: de,
                            disabled: M,
                            label: "Ticker A"
                        }), t.jsx(Se, {
                            tickers: R,
                            value: $,
                            onChange: ge,
                            disabled: M,
                            label: "Ticker B"
                        }), t.jsx("div", {
                            className: "flex flex-col gap-0.5 justify-end pb-1",
                            children: t.jsxs("span", {
                                className: "text-[10px] font-mono text-muted-foreground",
                                children: ["Ratio: ", t.jsxs("span", {
                                    className: "text-foreground font-bold",
                                    children: [v || "A", "/", $ || "B"]
                                })]
                            })
                        })]
                    }), u === "basket" && t.jsxs("div", {
                        className: "flex flex-col gap-2",
                        children: [t.jsx(_r, {
                            tickers: R,
                            value: Q,
                            onChange: ft,
                            disabled: M,
                            testIdPrefix: "combo-basket"
                        }), t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Basket Run Mode"
                            }), t.jsx("div", {
                                className: "flex gap-px",
                                "data-testid": "combo-basket-mode",
                                children: ["stocks", "combined"].map(e => t.jsx("button", {
                                    "data-testid": `combo-basket-mode-${e}`,
                                    className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${me===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                    onClick: () => bt(e),
                                    disabled: M,
                                    title: e === "stocks" ? "Run optimizer on each basket constituent separately" : "Run optimizer on a single synthetic series using the basket's weighting scheme",
                                    children: e === "stocks" ? "Stock by Stock" : "Combined"
                                }, e))
                            })]
                        })]
                    }), u === "single" && t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Input Series"
                        }), t.jsx(Ft, {
                            value: r,
                            onChange: n,
                            family: "combo",
                            label: "",
                            disabled: M
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Direction"
                        }), t.jsx("div", {
                            className: "flex gap-px",
                            children: ["both", "buy", "sell"].map(e => t.jsx("button", {
                                "data-testid": `combo-dir-${e}`,
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${pe===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => gt(e),
                                disabled: M,
                                children: e === "both" ? "Both" : e === "buy" ? "Buy" : "Sell"
                            }, e))
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Horizon"
                        }), t.jsx("div", {
                            className: "flex gap-px",
                            children: ["1M", "2M", "3M", "6M"].map(e => t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${B===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => Ue(e),
                                disabled: M,
                                children: e
                            }, e))
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Target %"
                        }), t.jsx("input", {
                            type: "number",
                            step: "0.5",
                            min: .5,
                            max: 50,
                            "data-testid": "combo-target",
                            className: "text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-16",
                            value: (ne * 100).toFixed(1),
                            onChange: e => Ge(Math.max(.005, Math.min(.5, Number(e.target.value) / 100 || .05))),
                            disabled: M,
                            title: "Hit threshold: peak (or trough for sell signals) must reach this %"
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Max Filters"
                        }), t.jsx("div", {
                            className: "flex gap-px",
                            children: [0, 1, 2].map(e => t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${xe===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => ht(e),
                                disabled: M,
                                title: e === 0 ? "Trigger alone (baseline only)" : `Up to ${e} AND-combined filters`,
                                children: e
                            }, e))
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Min N"
                        }), t.jsx("input", {
                            type: "number",
                            step: "1",
                            min: 1,
                            max: 500,
                            "data-testid": "combo-min-n",
                            className: "text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-14",
                            value: he,
                            onChange: e => yt(Math.max(1, Math.min(500, Math.floor(Number(e.target.value) || 1)))),
                            disabled: M,
                            title: "Minimum sample size — combos with fewer signals are discarded"
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Min Lift %"
                        }), t.jsx("input", {
                            type: "number",
                            step: "1",
                            min: -100,
                            max: 100,
                            "data-testid": "combo-min-lift",
                            className: "text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-14",
                            value: Me,
                            onChange: e => kt(Number(e.target.value) || 0),
                            disabled: M,
                            title: "Minimum improvement (in percentage points) over the trigger's baseline hit rate. 0 = keep all combos. 5 = only show combos that lift hit rate by ≥ 5pp."
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Min Hold"
                        }), t.jsx("input", {
                            type: "number",
                            step: "1",
                            min: 0,
                            max: 60,
                            className: "text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-14",
                            value: le,
                            onChange: e => qe(Math.max(0, Math.min(60, Math.floor(Number(e.target.value) || 0)))),
                            disabled: M,
                            title: "Minimum holding days before hit detection starts"
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Top N"
                        }), t.jsx("input", {
                            type: "number",
                            step: "1",
                            min: 1,
                            max: 50,
                            className: "text-xs font-mono bg-background border border-border rounded px-1.5 py-1 w-14",
                            value: we,
                            onChange: e => jt(Math.max(1, Math.min(50, Math.floor(Number(e.target.value) || 10)))),
                            disabled: M,
                            title: "Show only the top N combos per ticker"
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: " "
                        }), M ? t.jsxs("button", {
                            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500",
                            onClick: () => {
                                rt.current = !0
                            },
                            children: ["Cancel (", vt.current, "/", vt.total, ")"]
                        }) : t.jsx("button", {
                            "data-testid": "combo-run",
                            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90",
                            onClick: rr,
                            children: "Run Optimizer"
                        })]
                    })]
                }), t.jsxs("div", {
                    className: "flex items-center gap-3 text-[10px] font-mono text-muted-foreground mt-2",
                    children: [t.jsxs("span", {
                        children: ["Triggers: ", t.jsx("span", {
                            className: "text-foreground",
                            children: Y.filter(e => pe === "both" || e.direction === pe).length
                        })]
                    }), t.jsxs("span", {
                        children: ["Filters: ", t.jsx("span", {
                            className: "text-foreground",
                            children: O.length
                        })]
                    }), t.jsxs("span", {
                        children: ["Combos/trigger: ", t.jsx("span", {
                            className: "text-foreground",
                            children: xe === 0 ? 1 : xe === 1 ? 1 + O.length : 1 + O.length + O.length * (O.length - 1) / 2
                        })]
                    })]
                })]
            }), t.jsxs("div", {
                className: "flex-1 overflow-auto p-4",
                children: [ye.length === 0 && !M && t.jsxs("div", {
                    className: "flex items-center justify-center h-full text-muted-foreground text-sm font-mono",
                    children: ["Press ", t.jsx("span", {
                        className: "px-2 mx-1 bg-primary text-primary-foreground rounded font-bold",
                        children: "Run Optimizer"
                    }), " to search for high-hit-rate trigger + filter patterns."]
                }), ye.length > 0 && t.jsxs(t.Fragment, {
                    children: [t.jsxs("div", {
                        className: "flex items-center gap-2 mb-2",
                        children: [t.jsx("input", {
                            type: "text",
                            placeholder: "Filter ticker...",
                            value: Ie,
                            onChange: e => Nt(e.target.value),
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[180px] focus:outline-none focus:ring-1 focus:ring-primary"
                        }), Ie && t.jsx("button", {
                            onClick: () => Nt(""),
                            className: "text-[10px] font-mono px-2 py-1 rounded border border-border bg-background text-muted-foreground hover:text-foreground",
                            children: "Clear"
                        }), t.jsxs("span", {
                            className: "text-[10px] font-mono text-muted-foreground",
                            children: [He.length, " ticker", He.length !== 1 ? "s" : ""]
                        }), t.jsxs("div", {
                            className: "flex items-center gap-1",
                            children: [t.jsx("label", {
                                className: "text-[10px] font-mono text-muted-foreground",
                                children: "RANK BY"
                            }), t.jsx("select", {
                                "data-testid": "combo-rank-by",
                                value: Ve,
                                onChange: e => Gt(e.target.value),
                                className: "text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5",
                                children: gr.map(e => t.jsx("option", {
                                    value: e.value,
                                    children: e.label
                                }, e.value))
                            })]
                        }), t.jsxs(hr, {
                            variant: "outline",
                            size: "sm",
                            className: "h-6 gap-1 text-[11px] ml-auto",
                            onClick: sr,
                            children: [t.jsx(yr, {
                                className: "w-3 h-3"
                            }), " CSV"]
                        })]
                    }), t.jsx("div", {
                        className: "border border-border rounded mb-4",
                        children: t.jsxs("table", {
                            className: "w-full text-[10px] font-mono",
                            children: [t.jsx("thead", {
                                className: "sticky top-0 z-20",
                                children: t.jsxs("tr", {
                                    className: "bg-card text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]",
                                    children: [t.jsx("th", {
                                        className: "text-left px-2 py-1 font-bold sticky left-0 bg-card z-30 border-r border-border",
                                        children: "Ticker"
                                    }), t.jsx("th", {
                                        className: "text-left px-2 py-1 font-bold bg-card",
                                        children: "Trigger"
                                    }), t.jsx("th", {
                                        className: "text-left px-2 py-1 font-bold bg-card",
                                        children: "Filters"
                                    }), t.jsx("th", {
                                        className: "text-center px-2 py-1 font-bold bg-card",
                                        children: "Dir"
                                    }), t.jsx("th", {
                                        className: "text-center px-2 py-1 font-bold bg-card",
                                        children: "N"
                                    }), t.jsxs("th", {
                                        className: "text-center px-2 py-1 font-bold bg-card",
                                        children: ["Hit ", B]
                                    }), t.jsxs("th", {
                                        className: "text-center px-2 py-1 font-bold bg-card",
                                        title: "Trigger-alone hit rate",
                                        children: ["Base ", B]
                                    }), t.jsx("th", {
                                        className: "text-center px-2 py-1 font-bold bg-card",
                                        title: "Hit rate improvement over baseline",
                                        children: "Lift"
                                    }), t.jsxs("th", {
                                        className: "text-center px-2 py-1 font-bold bg-card",
                                        children: ["Avg ", B]
                                    }), t.jsxs("th", {
                                        className: "text-center px-2 py-1 font-bold bg-card",
                                        children: ["PF ", B]
                                    }), t.jsx("th", {
                                        className: "text-center px-2 py-1 font-bold bg-card",
                                        title: "Hit Conditions — profile what other indicators looked like at hit-bars vs miss-bars",
                                        children: "HC"
                                    })]
                                })
                            }), t.jsx("tbody", {
                                children: He.map(e => {
                                    const c = Je === e.ticker;
                                    return (c ? e.topCombos : e.topCombos.slice(0, 1)).flatMap((x, m) => {
                                        const f = x.summary.hitRate[B] ?? 0,
                                            g = f - x.baselineHitRate,
                                            I = x.summary.avgReturn[B] ?? 0,
                                            A = x.summary.profitFactor[B] ?? 0,
                                            E = m === 0,
                                            F = x.direction === "buy" ? "bg-emerald-600/5 hover:bg-emerald-600/10" : "bg-red-600/5 hover:bg-red-600/10",
                                            U = `${e.ticker}::${m}::${x.triggerLabel}::${x.filterLabels.join("|")}`,
                                            w = Yt.has(U),
                                            re = !!(c && x.profiles && x.profiles.length >= 10 && e.priceContext),
                                            ie = [];
                                        return ie.push(t.jsxs("tr", {
                                            className: `${F} cursor-pointer ${E?"border-t border-border":"border-t border-border/30"}`,
                                            onClick: () => Ct(c ? null : e.ticker),
                                            children: [t.jsx("td", {
                                                className: "px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border",
                                                children: E ? t.jsxs("span", {
                                                    className: "flex items-center gap-1",
                                                    children: [t.jsx("span", {
                                                        className: "text-muted-foreground/60",
                                                        children: c ? "▼" : "▶"
                                                    }), e.ticker]
                                                }) : ""
                                            }), t.jsx("td", {
                                                className: "text-left px-2 py-1 text-foreground",
                                                children: x.triggerLabel
                                            }), t.jsx("td", {
                                                className: "text-left px-2 py-1 text-muted-foreground",
                                                children: x.filterLabels.length === 0 ? t.jsx("span", {
                                                    className: "italic text-muted-foreground/60",
                                                    children: "(trigger alone)"
                                                }) : x.filterLabels.join(" & ")
                                            }), t.jsx("td", {
                                                className: "text-center px-2 py-1",
                                                children: t.jsx("span", {
                                                    className: `inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${x.direction==="buy"?"bg-emerald-600/20 text-emerald-400 border-emerald-600/30":"bg-red-600/20 text-red-400 border-red-600/30"}`,
                                                    children: x.direction === "buy" ? "Buy" : "Sell"
                                                })
                                            }), t.jsx("td", {
                                                className: "text-center px-2 py-1 text-muted-foreground tabular-nums",
                                                children: x.summary.count
                                            }), t.jsx("td", {
                                                className: `text-center px-2 py-1 ${kr(f)}`,
                                                children: It(f)
                                            }), t.jsx("td", {
                                                className: "text-center px-2 py-1 text-muted-foreground tabular-nums",
                                                children: It(x.baselineHitRate)
                                            }), t.jsx("td", {
                                                className: `text-center px-2 py-1 tabular-nums ${nr(g)}`,
                                                children: Et(g)
                                            }), t.jsx("td", {
                                                className: `text-center px-2 py-1 tabular-nums ${I>=0?"text-green-400":"text-red-400"}`,
                                                children: Et(I)
                                            }), t.jsx("td", {
                                                className: `text-center px-2 py-1 tabular-nums ${jr(A)}`,
                                                children: A >= 99 ? "∞" : A.toFixed(2)
                                            }), t.jsx("td", {
                                                className: "text-center px-2 py-1",
                                                onClick: be => be.stopPropagation(),
                                                children: re ? t.jsx("button", {
                                                    type: "button",
                                                    onClick: () => Jt(U),
                                                    className: `px-1.5 py-0.5 rounded text-[9px] font-bold border ${w?"bg-violet-500/25 text-violet-200 border-violet-400/40":"bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"}`,
                                                    title: "Profile what other indicators looked like at hit-bars vs miss-bars",
                                                    children: w ? "▾" : "▸"
                                                }) : null
                                            })]
                                        }, `${e.ticker}-${m}`)), w && re && x.profiles && e.priceContext && ie.push(t.jsx("tr", {
                                            className: "border-t border-border/30",
                                            children: t.jsx("td", {
                                                colSpan: 11,
                                                className: "px-3 py-2 bg-card/30",
                                                children: t.jsx(zt, {
                                                    ticker: e.priceContext.mode === "pair" && e.priceContext.pairLegA || e.ticker,
                                                    priceContext: e.priceContext,
                                                    signals: x.profiles,
                                                    direction: x.direction,
                                                    title: `${x.triggerLabel}${x.filterLabels.length>0?" + "+x.filterLabels.join(" & "):" (trigger alone)"}`,
                                                    useBand: !1
                                                })
                                            })
                                        }, `${e.ticker}-${m}-hc`)), ie
                                    })
                                })
                            })]
                        })
                    }), t.jsxs("div", {
                        className: "text-[10px] font-mono text-muted-foreground/70 italic",
                        children: ["Click a row to expand all top ", we, " combos for that ticker. Lift = combo hit rate − trigger-alone hit rate."]
                    })]
                })]
            })]
        }) : t.jsxs(t.Fragment, {
            children: [t.jsxs("div", {
                className: "flex-shrink-0 px-4 py-3 border-b border-border bg-card",
                children: [t.jsxs("div", {
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
                                onClick: () => ue("single"),
                                children: "Single"
                            }), t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${u==="pair"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => ue("pair"),
                                children: "Pair"
                            })]
                        })]
                    }), u === "single" && t.jsxs("div", {
                        className: "flex items-end gap-2",
                        children: [t.jsx("div", {
                            className: ze(l) ? "opacity-40 pointer-events-none" : "",
                            children: t.jsx(Se, {
                                tickers: R,
                                value: ze(l) ? "" : l,
                                onChange: i,
                                label: "Ticker"
                            })
                        }), t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Basket"
                            }), t.jsx(Ht, {
                                activeTicker: l,
                                onSelectTicker: i,
                                fallbackTicker: R[0]?.ticker ?? null
                            })]
                        })]
                    }), u === "pair" && t.jsxs(t.Fragment, {
                        children: [t.jsx(Se, {
                            tickers: R,
                            value: v,
                            onChange: de,
                            label: "Ticker A"
                        }), t.jsx(Se, {
                            tickers: R,
                            value: $,
                            onChange: ge,
                            label: "Ticker B"
                        })]
                    }), u === "single" && t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Input Series"
                        }), t.jsx(Ft, {
                            value: r,
                            onChange: n,
                            family: "combo",
                            label: ""
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Side"
                        }), t.jsxs("div", {
                            className: "flex gap-px",
                            children: [t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${ee==="long"?"bg-emerald-600 text-white":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => Qe("long"),
                                children: "Long"
                            }), t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${ee==="short"?"bg-red-600 text-white":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => Qe("short"),
                                children: "Short"
                            })]
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5 min-w-[180px]",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Trigger"
                        }), t.jsx("select", {
                            className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground",
                            value: te,
                            onChange: e => Ze(e.target.value),
                            children: Y.map(e => t.jsxs("option", {
                                value: e.label,
                                children: [e.label, " (", e.direction, ")"]
                            }, e.label))
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
                            value: +(ne * 100).toFixed(4),
                            onChange: e => Ge((parseFloat(e.target.value) || 5) / 100),
                            title: "Hit-rate threshold in percent. 5 = 5%.",
                            className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[70px]"
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Hold"
                        }), t.jsx("input", {
                            type: "number",
                            step: 1,
                            min: 0,
                            value: le,
                            onChange: e => qe(parseInt(e.target.value) || 0),
                            className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Horizon"
                        }), t.jsx("div", {
                            className: "flex gap-px",
                            children: ["1M", "2M", "3M", "6M"].map(e => t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${B===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => Ue(e),
                                children: e
                            }, e))
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: " "
                        }), t.jsx("button", {
                            "data-testid": "combo-eval-run",
                            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
                            onClick: or,
                            disabled: tt,
                            children: tt ? "Evaluating…" : "Evaluate"
                        })]
                    })]
                }), t.jsxs("div", {
                    className: "mt-2",
                    children: [t.jsx("div", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-1",
                        children: "Filters (AND-conjoined; click to toggle)"
                    }), t.jsx("div", {
                        className: "flex flex-wrap gap-1",
                        children: O.map(e => {
                            const c = fe.includes(e.label);
                            return t.jsx("button", {
                                onClick: () => Pt(k => c ? k.filter(x => x !== e.label) : [...k, e.label]),
                                className: `text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${c?"bg-amber-500/20 border-amber-500/50 text-amber-200":"bg-background border-border text-muted-foreground hover:text-foreground"}`,
                                children: e.label
                            }, e.label)
                        })
                    })]
                })]
            }), t.jsxs("div", {
                className: "flex-1 overflow-auto p-4",
                children: [_e && t.jsxs("div", {
                    className: "mb-3 px-3 py-2 rounded border border-amber-500/50 bg-amber-500/10 text-amber-200 text-[11px] font-mono",
                    children: [t.jsx("span", {
                        className: "font-bold",
                        children: "Direction mismatch:"
                    }), " trigger “", _e.triggerLabel, "” is a ", t.jsx("span", {
                        className: "uppercase",
                        children: _e.triggerDir
                    }), "-side event (typically traded ", _e.expected, ") but you are scoring it as ", t.jsx("span", {
                        className: "uppercase",
                        children: _e.chosen
                    }), ". Results will reflect that fade. Switch Side to ", t.jsx("span", {
                        className: "font-bold uppercase",
                        children: _e.expected
                    }), " to score in the trigger’s natural direction."]
                }), t.jsx(Pr, {
                    result: Pe,
                    loading: tt,
                    setupLabel: St,
                    tickerLabel: Tt
                }), Pe && Ee && Pe.profiles.length >= 10 ? t.jsx(zt, {
                    ticker: Ee.mode === "pair" ? Ee.pairLegA || "" : l || R[0]?.ticker || "",
                    priceContext: Ee,
                    signals: Pe.profiles,
                    direction: ee === "long" ? "buy" : "sell",
                    title: `Hit Conditions — ${St} on ${Tt}`,
                    useBand: !1
                }) : null]
            })]
        })]
    })
}
export {
    eo as
    default
};