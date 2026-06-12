import {
    dn as Je,
    r as c,
    aj as bt,
    ag as be,
    cG as gt,
    a as kt,
    af as yt,
    dp as ge,
    g as Nt,
    ae as Ae,
    dd as Ze,
    cJ as Re,
    cK as Le,
    cL as Qe,
    j as e,
    cN as et,
    de as tt,
    B as jt,
    z as Mt,
    R as vt,
    Z as Tt,
    a6 as St,
    a7 as wt,
    a8 as At,
    a9 as Rt,
    aa as Lt,
    ad as Ct,
    df as Ft
} from "./index-CsG73Aq_.js";
import {
    g as Dt
} from "./yahooPairsRatio-DERC-reP.js";
import {
    u as Bt
} from "./useOptimizerClassFilter-COCFGQs0.js";
import {
    u as Pt
} from "./usePairComboPicker-h_S34tFb.js";
import {
    u as Et
} from "./useFrequency-DK9YJz0p.js";
import {
    d as st
} from "./weeklyDownsample-BzVm8wGH.js";
import {
    U as Ce
} from "./UnifiedTickerPicker-D927mSvl.js";
import {
    B as $t
} from "./BasketTickerPill-DA9Wjwwc.js";
import {
    B as It
} from "./BasketPicker-DkcKAXfe.js";
import {
    r as Fe,
    g as rt
} from "./basketOhlc-CIjRG6QD.js";
import {
    C as zt
} from "./CartesianGrid-BQtjaw_K.js";
import "./globalUniverse-DuqPcp2u.js";
import "./ClassificationFiltersWithSource-D7v4WOtR.js";
const Pe = {
    diff: "Lookback Diff",
    ols: "OLS Slope",
    diff_pct: "Diff + Magnitude"
};

function _t(s, n, i, g, v, j) {
    const N = s[n];
    if (N == null) return 0;
    if (g === "ols") {
        if (n - i < 0) return 0;
        let u = 0,
            k = 0,
            m = 0,
            A = 0,
            B = 0;
        for (let y = 0; y <= i; y++) {
            const P = s[n - i + y];
            if (P == null) return 0;
            const d = y;
            u += d, k += P, m += d * P, A += d * d, B++
        }
        const l = B * A - u * u;
        if (l === 0) return 0;
        const h = (B * m - u * k) / l;
        return h > 0 ? 1 : h < 0 ? -1 : 0
    }
    if (n - i < 0) return 0;
    const w = s[n - i];
    if (w == null) return 0;
    const f = (N - w) / i;
    if (g === "diff_pct") {
        const u = v[n];
        if (!Number.isFinite(u) || u <= 0 || Math.abs(f) / u < j) return 0
    }
    return f > 0 ? 1 : f < 0 ? -1 : 0
}

function ot(s, n) {
    const i = s.length,
        g = Je(s, n.biasLen, n.biasMAType, n.maOpts),
        v = Je(s, n.triggerLen, n.triggerMAType, n.maOpts),
        j = new Int8Array(i),
        N = new Int8Array(i),
        w = [],
        f = new Float64Array(i);
    let u = null,
        k = -1,
        m = NaN,
        A = 1;
    for (let l = 0; l < i; l++) {
        f[l] = A;
        const h = s[l],
            y = l > 0 ? s[l - 1] : NaN,
            P = v[l],
            d = l > 0 ? v[l - 1] : null,
            U = g[l];
        let T = 0;
        if (Number.isFinite(h) && U != null) {
            const R = _t(g, l, n.slopeLookback, n.slopeMethod, s, n.slopeMinPct);
            h > U && R === 1 ? T = 1 : h < U && R === -1 && n.allowShort && (T = -1)
        }
        j[l] = T;
        const J = l > 0 && Number.isFinite(h) && Number.isFinite(y) && P != null && d != null,
            $ = J && y <= d && h > P,
            O = J && y >= d && h < P;
        if (u === "long") {
            if (O || T !== 1) {
                const R = (h - m) / m;
                w.push({
                    side: "long",
                    entryIdx: k,
                    exitIdx: l,
                    entryPrice: m,
                    exitPrice: h,
                    bars: l - k,
                    ret: R
                }), A *= 1 + R, u = null, k = -1, m = NaN
            }
        } else if (u === "short" && ($ || T !== -1)) {
            const R = (m - h) / m;
            w.push({
                side: "short",
                entryIdx: k,
                exitIdx: l,
                entryPrice: m,
                exitPrice: h,
                bars: l - k,
                ret: R
            }), A *= 1 + R, u = null, k = -1, m = NaN
        }
        u === null && (T === 1 && $ ? (u = "long", k = l, m = h) : T === -1 && O && n.allowShort && (u = "short", k = l, m = h)), N[l] = u === "long" ? 1 : u === "short" ? -1 : 0, f[l] = A
    }
    if (u !== null) {
        const l = i - 1,
            h = s[l],
            y = u === "long" ? (h - m) / m : (m - h) / m;
        w.push({
            side: u,
            entryIdx: k,
            exitIdx: l,
            entryPrice: m,
            exitPrice: h,
            bars: l - k,
            ret: y
        }), A *= 1 + y, f[l] = A
    }
    const B = Ot(w, f, N, s);
    return {
        params: n,
        trades: w,
        equity: Array.from(f),
        bias: j,
        position: N,
        stats: B
    }
}

function Ot(s, n, i, g) {
    const v = s.length;
    if (v === 0) return {
        nTrades: 0,
        nWins: 0,
        hitRate: NaN,
        meanRet: NaN,
        medianRet: NaN,
        winRet: NaN,
        lossRet: NaN,
        profitFactor: NaN,
        totalReturn: 0,
        annualReturn: 0,
        annualVol: NaN,
        sharpe: NaN,
        maxDD: 0,
        timeInMarket: 0,
        buyHoldReturn: at(g)
    };
    const j = s.map(b => b.ret),
        N = j.filter(b => b > 0),
        w = j.filter(b => b <= 0),
        f = N.reduce((b, L) => b + L, 0),
        u = w.reduce((b, L) => b + L, 0),
        k = j.reduce((b, L) => b + L, 0) / j.length,
        m = [...j].sort((b, L) => b - L),
        A = Math.floor(m.length / 2),
        B = m.length % 2 ? m[A] : (m[A - 1] + m[A]) / 2,
        l = n[n.length - 1] - 1,
        h = Math.max(.001, g.length / 252),
        y = (1 + l) ** (1 / h) - 1;
    let P = 0;
    for (const b of j) P += (b - k) ** 2;
    const d = j.length > 1 ? Math.sqrt(P / (j.length - 1)) : NaN,
        U = j.length / h,
        T = Number.isFinite(d) ? d * Math.sqrt(U) : NaN,
        J = Number.isFinite(T) && T > 0 ? y / T : NaN;
    let $ = n[0],
        O = 0;
    for (let b = 0; b < n.length; b++) {
        n[b] > $ && ($ = n[b]);
        const L = (n[b] - $) / $;
        L < O && (O = L)
    }
    let R = 0;
    for (let b = 0; b < i.length; b++) i[b] !== 0 && R++;
    return {
        nTrades: v,
        nWins: N.length,
        hitRate: N.length / v,
        meanRet: k,
        medianRet: B,
        winRet: N.length ? f / N.length : NaN,
        lossRet: w.length ? u / w.length : NaN,
        profitFactor: w.length > 0 && u < 0 ? f / Math.abs(u) : f > 0 ? 1 / 0 : NaN,
        totalReturn: l,
        annualReturn: y,
        annualVol: T,
        sharpe: J,
        maxDD: O,
        timeInMarket: R / i.length,
        buyHoldReturn: at(g)
    }
}

function at(s) {
    let n = -1,
        i = -1;
    for (let g = 0; g < s.length; g++) Number.isFinite(s[g]) && s[g] > 0 && (n < 0 && (n = g), i = g);
    return n < 0 || i <= n ? 0 : s[i] / s[n] - 1
}
const nt = {
    quick: {
        biasMATypes: ["EMA"],
        biasLens: [20, 50, 100, 200],
        triggerMATypes: ["WMA"],
        triggerLens: [10, 20, 50],
        slopeMethods: ["diff"],
        slopeLookbacks: [5, 10],
        slopeMinPcts: [0],
        allowShortOptions: [!0]
    },
    standard: {
        biasMATypes: ["EMA", "SMA", "HMA"],
        biasLens: [20, 34, 50, 89, 100, 150, 200],
        triggerMATypes: ["WMA", "EMA", "HMA"],
        triggerLens: [8, 13, 20, 34, 50],
        slopeMethods: ["diff", "ols"],
        slopeLookbacks: [3, 5, 10, 20],
        slopeMinPcts: [0],
        allowShortOptions: [!0]
    },
    deep: {
        biasMATypes: ["EMA", "SMA", "HMA", "WMA", "KAMA", "T3", "ALMA"],
        biasLens: [10, 20, 34, 50, 89, 100, 150, 200, 250],
        triggerMATypes: ["WMA", "EMA", "HMA", "SMA", "ALMA"],
        triggerLens: [5, 8, 13, 20, 34, 50, 100],
        slopeMethods: ["diff", "ols", "diff_pct"],
        slopeLookbacks: [3, 5, 10, 20, 40],
        slopeMinPcts: [0, 5e-4, .001, .002],
        allowShortOptions: [!0]
    }
};

function Kt(s) {
    let n = 0;
    for (const i of s.slopeMethods) {
        const g = i === "diff_pct" ? s.slopeMinPcts : [0];
        n += s.biasMATypes.length * s.biasLens.length * s.triggerMATypes.length * s.triggerLens.length * s.slopeLookbacks.length * g.length * s.allowShortOptions.length
    }
    return n
}

function qt(s, n, i = 50) {
    const g = [];
    for (const v of n.biasMATypes)
        for (const j of n.biasLens)
            for (const N of n.triggerMATypes)
                for (const w of n.triggerLens)
                    if (!(w >= j))
                        for (const f of n.slopeMethods) {
                            const u = f === "diff_pct" ? n.slopeMinPcts : [0];
                            for (const k of n.slopeLookbacks)
                                for (const m of u)
                                    for (const A of n.allowShortOptions) {
                                        const B = {
                                                biasMAType: v,
                                                biasLen: j,
                                                triggerMAType: N,
                                                triggerLen: w,
                                                slopeMethod: f,
                                                slopeLookback: k,
                                                slopeMinPct: m,
                                                allowShort: A,
                                                maOpts: n.maOpts
                                            },
                                            l = ot(s, B);
                                        g.push({
                                            params: B,
                                            stats: l.stats
                                        })
                                    }
                        }
    return g.sort((v, j) => {
        const N = Number.isFinite(v.stats.sharpe) ? v.stats.sharpe : -1 / 0;
        return (Number.isFinite(j.stats.sharpe) ? j.stats.sharpe : -1 / 0) - N
    }), g.slice(0, i)
}

function ke(s) {
    const n = s.slopeMethod === "diff_pct" ? `${Pe[s.slopeMethod]}(${s.slopeLookback}, ${(s.slopeMinPct*100).toFixed(2)}%)` : `${Pe[s.slopeMethod]}(${s.slopeLookback})`;
    return `${s.biasMAType}${s.biasLen}/${s.triggerMAType}${s.triggerLen} · ${n}${s.allowShort?"":" · long-only"}`
}
const Ht = {
    biasMAType: "EMA",
    biasLen: 50,
    triggerMAType: "WMA",
    triggerLen: 20,
    slopeMethod: "diff",
    slopeLookback: 5,
    slopeMinPct: .001,
    allowShort: !0,
    gridSize: "quick",
    topK: 10,
    mode: "single"
};

function de(s) {
    return s == null || !Number.isFinite(s) ? "–" : s.toFixed(2)
}

function V(s, n = 1) {
    return s == null || !Number.isFinite(s) ? "–" : (s * 100).toFixed(n) + "%"
}

function z(s, n = 1) {
    if (s == null || !Number.isFinite(s)) return "–";
    const i = (s * 100).toFixed(n) + "%";
    return s >= 0 ? "+" + i : i
}

function De(s) {
    return s == null || !Number.isFinite(s) ? "text-muted-foreground" : s >= 1 ? "text-emerald-400" : s >= .5 ? "text-green-400" : s >= 0 ? "text-yellow-400" : "text-red-400"
}

function X(s) {
    return s == null || !Number.isFinite(s) ? "text-muted-foreground" : s >= 0 ? "text-green-400" : "text-red-400"
}

function Be(s) {
    return s == null || !Number.isFinite(s) ? "text-muted-foreground" : s >= -.05 ? "text-green-400" : s >= -.15 ? "text-yellow-400" : "text-red-400"
}

function as() {
    const [s, n] = c.useState([]), [i, g] = c.useState(""), [v, j] = c.useState(""), [N, w] = c.useState(""), [f, u] = c.useState([]), [k, m] = c.useState("stocks"), {
        baskets: A
    } = bt(), B = c.useRef(!1), [l, h] = be("dual-ma-input-selection", Ft), [y, P] = be("dualma:cfg", Ht), [d, U] = c.useState(y.mode ?? "single"), [T, J] = c.useState(y.gridSize ?? "quick"), [$] = c.useState(y.topK ?? 10), O = y, [R, b] = c.useState(y.biasMAType ?? "EMA"), [L, ye] = c.useState(y.biasLen ?? O.emaLen ?? 50), [Z, Ee] = c.useState(y.triggerMAType ?? "WMA"), [Q, Ne] = c.useState(y.triggerLen ?? O.wmaLen ?? 20), [W, $e] = c.useState(y.slopeMethod ?? "diff"), [ee, Ie] = c.useState(y.slopeLookback ?? 5), [te, ze] = c.useState(y.slopeMinPct ?? .001), [G, _e] = c.useState(y.allowShort ?? !0), [xe, je] = c.useState(""), [ne, pe] = be("dualma:results", []), [x, Oe] = be("dualma:evalResult", null), [ue, Ke] = c.useState("optimize"), [_, oe] = c.useState(!1), [F, K] = c.useState(!1), [se, qe] = c.useState({
        current: 0,
        total: 0
    }), [Me, He] = c.useState(null), [le, Ue] = c.useState("sharpe"), [ie, ve] = c.useState(!1), [q] = c.useState(() => gt()), Te = c.useRef(!1), {
        universeTickers: Se,
        isFiltered: lt
    } = kt(), D = c.useMemo(() => Se ? s.filter(t => Se.has(t.ticker)) : s, [s, Se]), fe = Bt(D, d === "universe", "dualma-clf"), Y = Pt(D.map(t => t.ticker), d === "pairCombo", "dualma-pc"), {
        frequency: H,
        setFrequency: We,
        frequencyUI: Ge
    } = Et("dualma", "daily", _), it = H === "weekly" ? "weekly" : "daily";
    c.useEffect(() => {
        yt().then(t => {
            n(t), t.length > 0 && !B.current && (g(t[0].ticker), je(t[0].ticker)), t.length > 0 && (j(a => a || t[0].ticker), w(a => a || (t[1]?.ticker ?? t[0].ticker)))
        })
    }, []);
    const Ye = c.useMemo(() => Kt(nt[T]), [T]);
    c.useEffect(() => {
        P(t => ({
            ...t,
            mode: d,
            gridSize: T,
            biasMAType: R,
            biasLen: L,
            triggerMAType: Z,
            triggerLen: Q,
            slopeMethod: W,
            slopeLookback: ee,
            slopeMinPct: te,
            allowShort: G
        }))
    }, [d, T, R, L, Z, Q, W, ee, te, G, P]);
    const ct = c.useCallback(() => ({
            selectedTicker: i,
            pairTickerA: v,
            pairTickerB: N,
            basketTickers: f,
            basketMode: k,
            mode: d,
            gridSize: T,
            results: ne,
            expandedTicker: Me,
            sortKey: le,
            sortAsc: ie,
            evalTicker: xe,
            evalBiasMAType: R,
            evalBiasLen: L,
            evalTriggerMAType: Z,
            evalTriggerLen: Q,
            evalSlopeMethod: W,
            evalSlopeLookback: ee,
            evalSlopeMinPct: te,
            evalAllowShort: G,
            frequency: H,
            pairCombo: Y.serialize(),
            inputSelection: l
        }), [i, v, N, f, k, d, T, ne, Me, le, ie, xe, R, L, Z, Q, W, ee, te, G, H, Y, l]),
        dt = c.useCallback(t => {
            if (t && (t.selectedTicker && typeof t.selectedTicker == "string" && (g(t.selectedTicker), B.current = !0), t.evalTicker && typeof t.evalTicker == "string" && je(t.evalTicker), t.pairTickerA && typeof t.pairTickerA == "string" && j(t.pairTickerA), t.pairTickerB && typeof t.pairTickerB == "string" && w(t.pairTickerB), (t.mode === "single" || t.mode === "universe" || t.mode === "pair" || t.mode === "pairCombo" || t.mode === "basket") && U(t.mode), (t.gridSize === "quick" || t.gridSize === "standard" || t.gridSize === "deep") && J(t.gridSize), t.pairCombo && Y.hydrate(t.pairCombo), Array.isArray(t.basketTickers) && u(t.basketTickers.filter(a => typeof a == "string")), (t.basketMode === "stocks" || t.basketMode === "combined") && m(t.basketMode), Array.isArray(t.results) && pe(t.results), t.expandedTicker !== void 0 && He(t.expandedTicker), t.sortKey && typeof t.sortKey == "string" && Ue(t.sortKey), typeof t.sortAsc == "boolean" && ve(t.sortAsc), typeof t.evalBiasLen == "number" && ye(t.evalBiasLen), typeof t.evalTriggerLen == "number" && Ne(t.evalTriggerLen), typeof t.evalBiasMAType == "string" && ge.includes(t.evalBiasMAType) && b(t.evalBiasMAType), typeof t.evalTriggerMAType == "string" && ge.includes(t.evalTriggerMAType) && Ee(t.evalTriggerMAType), typeof t.evalEmaLen == "number" && t.evalBiasLen == null && ye(t.evalEmaLen), typeof t.evalWmaLen == "number" && t.evalTriggerLen == null && Ne(t.evalWmaLen), (t.evalSlopeMethod === "diff" || t.evalSlopeMethod === "ols" || t.evalSlopeMethod === "diff_pct") && $e(t.evalSlopeMethod), typeof t.evalSlopeLookback == "number" && Ie(t.evalSlopeLookback), typeof t.evalSlopeMinPct == "number" && ze(t.evalSlopeMinPct), typeof t.evalAllowShort == "boolean" && _e(t.evalAllowShort), (t.frequency === "daily" || t.frequency === "weekly" || t.frequency === "weekly_on_daily") && We(t.frequency), t.inputSelection && typeof t.inputSelection == "object")) {
                const a = t.inputSelection;
                a.kind === "close" ? h({
                    kind: "close"
                }) : a.kind === "workbook" && typeof a.metric == "string" && h({
                    kind: "workbook",
                    metric: a.metric
                })
            }
        }, [Y, pe, We, h]);
    Nt("dual-ma-optimizer", ct, dt);
    const xt = c.useCallback(async () => {
            oe(!0), pe([]), Te.current = !1;
            const t = d === "pair" || d === "pairCombo" ? await Ae() : [],
                a = nt[T];
            let p;
            if (d === "pair") {
                if (!v || !N || v === N) {
                    oe(!1);
                    return
                }
                p = [{
                    ticker: `${v}/${N}`,
                    name: `${v}/${N}`
                }]
            } else if (d === "pairCombo") {
                if (Y.pairs.length === 0) {
                    oe(!1);
                    return
                }
                p = Y.pairs.map(r => ({
                    ticker: r.label,
                    name: r.label,
                    pairA: r.a,
                    pairB: r.b
                }))
            } else if (d === "single") p = D.filter(r => r.ticker === i);
            else if (d === "basket")
                if (k === "combined") {
                    if (f.length === 0) {
                        oe(!1);
                        return
                    }
                    const r = Fe(f, A);
                    p = [{
                        ticker: `BASKET:${r.name}`,
                        name: `BASKET:${r.name}`
                    }]
                } else p = f.map(r => D.find(E => E.ticker.toUpperCase() === r.toUpperCase()) ?? {
                    ticker: r,
                    name: r
                });
            else p = fe.filteredTickers;
            if (p.length === 0) {
                oe(!1);
                return
            }
            const S = d === "basket" && k === "combined" ? Fe(f, A) : null;
            qe({
                current: 0,
                total: p.length
            });
            const o = [];
            for (let r = 0; r < p.length && !Te.current; r++) {
                const M = p[r];
                qe({
                    current: r + 1,
                    total: p.length
                }), r > 0 && r % 5 === 0 && await new Promise(E => setTimeout(E, 0));
                try {
                    const E = d === "pair" || d === "pairCombo",
                        ft = E ? M.pairA ?? v : "",
                        mt = E ? M.pairB ?? N : "";
                    let I;
                    if (E) {
                        const C = t.length ? t : await Ae(),
                            ce = await Dt(ft, mt, C);
                        I = ce && ce.prices.length >= 50 ? ce.prices : null
                    } else if (S && d === "basket") {
                        const C = await rt(S, q);
                        if (!C || C.closes.length < 50) continue;
                        I = C.closes
                    } else if (l.kind === "workbook") {
                        const C = await Ze(M.ticker, l, {
                            dateRange: q
                        });
                        if (!C || C.closes.length < 50) continue;
                        I = C.closes
                    } else {
                        const C = await Re(M.ticker);
                        if (!C || C.adjCloses.length < 50) continue;
                        I = Le(C, q).adjCloses
                    }
                    if (!I) continue;
                    let he;
                    if (!E && H === "weekly") {
                        const C = I.map((ht, we) => `d${we}`);
                        he = Qe({
                            dates: C,
                            closes: I,
                            adjCloses: I
                        }, "weekly").closes
                    } else if (!E && H === "weekly_on_daily") {
                        const C = I.map((ht, we) => `d${we}`);
                        he = st(I, C).prices
                    } else he = I;
                    if (he.length < 50) continue;
                    const Xe = qt(he, a, $);
                    if (Xe.length === 0) continue;
                    o.push({
                        ticker: M.ticker,
                        name: M.name ?? M.ticker,
                        topK: Xe
                    }), (r % 5 === 0 || r === p.length - 1) && pe([...o])
                } catch {}
            }
            pe(o), oe(!1)
        }, [D, i, v, N, f, k, A, d, T, $, H, it, q, Y.pairs, fe.filteredTickers, l]),
        pt = c.useCallback(async () => {
            K(!0), Oe(null);
            try {
                const t = await Ae();
                let a;
                if (d === "basket") {
                    if (f.length === 0) {
                        K(!1);
                        return
                    }
                    if (k === "combined") {
                        const o = Fe(f, A),
                            r = await rt(o, q);
                        if (!r || r.closes.length < 50) {
                            K(!1);
                            return
                        }
                        a = r.closes
                    } else {
                        const o = f[0],
                            r = await Re(o);
                        if (!r || r.adjCloses.length < 50) {
                            K(!1);
                            return
                        }
                        a = Le(r, q).adjCloses
                    }
                } else {
                    const o = xe || i || D[0]?.ticker;
                    if (!o) {
                        K(!1);
                        return
                    }
                    if (l.kind === "workbook") {
                        const r = await Ze(o, l, {
                            dateRange: q
                        });
                        if (!r || r.closes.length < 50) {
                            K(!1);
                            return
                        }
                        a = r.closes
                    } else {
                        const r = await Re(o);
                        if (!r || r.adjCloses.length < 50) {
                            K(!1);
                            return
                        }
                        a = Le(r, q).adjCloses
                    }
                }
                if (H === "weekly") {
                    const o = a.map((M, E) => `d${E}`);
                    a = Qe({
                        dates: o,
                        closes: a,
                        adjCloses: a
                    }, "weekly").closes
                } else if (H === "weekly_on_daily") {
                    const o = a.map((M, E) => `d${E}`);
                    a = st(a, o).prices
                }
                if (a.length < 50) {
                    K(!1);
                    return
                }
                const S = ot(a, {
                    biasMAType: R,
                    biasLen: L,
                    triggerMAType: Z,
                    triggerLen: Q,
                    slopeMethod: W,
                    slopeLookback: ee,
                    slopeMinPct: te,
                    allowShort: G
                });
                Oe(S)
            } catch {} finally {
                K(!1)
            }
        }, [xe, i, D, R, L, Z, Q, W, ee, te, G, H, q, l, d, f, k, A]),
        me = c.useMemo(() => {
            const t = [...ne];
            return t.sort((a, p) => {
                const S = a.topK[0],
                    o = p.topK[0];
                if (!S || !o) return 0;
                let r, M;
                switch (le) {
                    case "sharpe":
                        r = S.stats.sharpe, M = o.stats.sharpe;
                        break;
                    case "totalReturn":
                        r = S.stats.totalReturn, M = o.stats.totalReturn;
                        break;
                    case "hitRate":
                        r = S.stats.hitRate, M = o.stats.hitRate;
                        break;
                    case "profitFactor":
                        r = S.stats.profitFactor, M = o.stats.profitFactor;
                        break;
                    case "maxDD":
                        r = S.stats.maxDD, M = o.stats.maxDD;
                        break;
                    case "nTrades":
                        r = S.stats.nTrades, M = o.stats.nTrades;
                        break;
                    case "ticker":
                        return ie ? a.ticker.localeCompare(p.ticker) : p.ticker.localeCompare(a.ticker);
                    default:
                        r = S.stats.sharpe, M = o.stats.sharpe
                }
                return Number.isFinite(r) || (r = -1 / 0), Number.isFinite(M) || (M = -1 / 0), ie ? r - M : M - r
            }), t
        }, [ne, le, ie]);

    function re(t) {
        le === t ? ve(a => !a) : (Ue(t), ve(!1))
    }

    function ae(t) {
        return le !== t ? null : e.jsx("span", {
            className: "ml-0.5",
            children: ie ? "↑" : "↓"
        })
    }
    const ut = () => {
            if (me.length === 0) return;
            const t = me.map(o => {
                    const r = o.topK[0];
                    return r ? {
                        ticker: o.ticker,
                        name: o.name,
                        params: ke(r.params),
                        nTrades: r.stats.nTrades,
                        hitRate: r.stats.hitRate,
                        meanRet: r.stats.meanRet,
                        sharpe: r.stats.sharpe,
                        profitFactor: r.stats.profitFactor,
                        maxDD: r.stats.maxDD,
                        totalReturn: r.stats.totalReturn,
                        buyHoldReturn: r.stats.buyHoldReturn
                    } : null
                }).filter(Boolean),
                a = Object.keys(t[0] ?? {}),
                p = [a.join(","), ...t.map(o => a.map(r => `"${String(o[r]??"")}"`).join(","))].join(`
`),
                S = document.createElement("a");
            S.href = URL.createObjectURL(new Blob([p], {
                type: "text/csv"
            })), S.download = "dualma_optimizer.csv", S.click()
        },
        Ve = c.useMemo(() => {
            if (!x) return [];
            const t = Math.max(1, Math.floor(x.equity.length / 500));
            return x.equity.filter((a, p) => p % t === 0).map((a, p) => ({
                bar: p * t,
                equity: +a.toFixed(4)
            }))
        }, [x]);
    return e.jsxs("div", {
        className: "flex flex-col h-full overflow-hidden",
        children: [e.jsxs("div", {
            className: "flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3",
            children: [e.jsx("h2", {
                className: "text-sm font-bold text-foreground tracking-tight",
                children: "DualMA Optimizer"
            }), e.jsxs("div", {
                className: "flex gap-px",
                children: [e.jsx("button", {
                    className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${ue==="optimize"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                    onClick: () => Ke("optimize"),
                    children: "Optimize"
                }), e.jsx("button", {
                    className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${ue==="evaluate"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                    onClick: () => Ke("evaluate"),
                    children: "Evaluate"
                })]
            }), e.jsx("span", {
                className: "text-[10px] text-muted-foreground",
                children: ue === "optimize" ? "Grid-search EMA/WMA parameter space" : "Run one specific DualMA config"
            })]
        }), ue === "optimize" && e.jsxs(e.Fragment, {
            children: [e.jsx("div", {
                className: "flex-shrink-0 px-4 py-3 border-b border-border bg-card",
                children: e.jsxs("div", {
                    className: "flex items-start gap-4 flex-wrap",
                    children: [e.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Grid Size"
                        }), e.jsx("div", {
                            className: "flex gap-px",
                            children: ["quick", "standard", "deep"].map(t => e.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${T===t?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => J(t),
                                disabled: _,
                                children: t.charAt(0).toUpperCase() + t.slice(1)
                            }, t))
                        }), e.jsxs("span", {
                            className: "text-[9px] font-mono text-muted-foreground",
                            children: [Ye, " combos"]
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Mode"
                        }), e.jsx("div", {
                            className: "flex gap-px flex-wrap",
                            children: ["single", "universe", "pair", "pairCombo", "basket"].map(t => e.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${d===t?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => U(t),
                                disabled: _,
                                children: t === "single" ? "Single" : t === "universe" ? "Universe" : t === "pair" ? "Pair" : t === "pairCombo" ? "Pair Combo" : "Basket"
                            }, t))
                        })]
                    }), Ge, d === "single" && e.jsxs("div", {
                        className: "flex items-end gap-2",
                        children: [e.jsx("div", {
                            className: et(i) ? "opacity-40 pointer-events-none" : "",
                            children: e.jsx(Ce, {
                                tickers: D,
                                value: et(i) ? "" : i,
                                onChange: g,
                                label: "Ticker"
                            })
                        }), e.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [e.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Basket"
                            }), e.jsx($t, {
                                activeTicker: i,
                                onSelectTicker: g,
                                fallbackTicker: D[0]?.ticker ?? null
                            })]
                        }), e.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [e.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Input Series"
                            }), e.jsx(tt, {
                                value: l,
                                onChange: h,
                                family: "dual_ma",
                                label: ""
                            })]
                        })]
                    }), d === "pair" && e.jsxs("div", {
                        className: "flex items-end gap-2",
                        children: [e.jsx(Ce, {
                            tickers: D,
                            value: v,
                            onChange: j,
                            disabled: _,
                            label: "A"
                        }), e.jsx(Ce, {
                            tickers: D,
                            value: N,
                            onChange: w,
                            disabled: _,
                            label: "B"
                        })]
                    }), d === "pairCombo" && e.jsxs("div", {
                        className: "flex flex-col gap-1 w-full",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Pair Combo — Leg Set"
                        }), Y.ui]
                    }), d === "basket" && e.jsxs("div", {
                        className: "flex flex-col gap-2",
                        children: [e.jsx(It, {
                            tickers: D,
                            value: f,
                            onChange: u,
                            disabled: _,
                            testIdPrefix: "dualma-basket"
                        }), e.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [e.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Basket Run Mode"
                            }), e.jsx("div", {
                                className: "flex gap-px",
                                "data-testid": "dualma-basket-mode",
                                children: ["stocks", "combined"].map(t => e.jsx("button", {
                                    "data-testid": `dualma-basket-mode-${t}`,
                                    className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${k===t?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                    onClick: () => m(t),
                                    disabled: _,
                                    title: t === "stocks" ? "Run optimizer on each basket constituent separately" : "Run optimizer on a single synthetic series using the basket's weighting scheme",
                                    children: t === "stocks" ? "Stock by Stock" : "Combined"
                                }, t))
                            })]
                        })]
                    }), d === "universe" && fe.classFilterUI && e.jsxs("div", {
                        className: "flex flex-col gap-1 w-full",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Classification Filter"
                        }), fe.universeSourceUI, fe.classFilterUI]
                    }), lt && e.jsxs("span", {
                        className: "text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30 self-end mb-1",
                        children: [D.length, "/", s.length]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-0.5 ml-auto",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: " "
                        }), _ ? e.jsxs("button", {
                            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500",
                            onClick: () => {
                                Te.current = !0
                            },
                            children: ["Cancel (", se.current, "/", se.total, ")"]
                        }) : e.jsx("button", {
                            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90",
                            onClick: xt,
                            children: "Run"
                        })]
                    })]
                })
            }), e.jsxs("div", {
                className: "flex-1 overflow-auto px-4 py-3",
                children: [ne.length === 0 && !_ && e.jsx("div", {
                    className: "flex items-center justify-center h-full text-muted-foreground text-sm",
                    children: "EMA-bias + WMA-trigger dual moving average strategy grid search"
                }), _ && ne.length === 0 && e.jsx("div", {
                    className: "flex items-center justify-center h-full",
                    children: e.jsxs("div", {
                        className: "text-center",
                        children: [e.jsx("div", {
                            className: "text-sm text-muted-foreground mb-2",
                            children: "Running grid search…"
                        }), e.jsxs("div", {
                            className: "text-xs font-mono text-muted-foreground",
                            children: [se.current, "/", se.total, " tickers × ", Ye, " combos"]
                        }), e.jsx("div", {
                            className: "w-48 h-1 bg-border rounded-full mt-2 mx-auto overflow-hidden",
                            children: e.jsx("div", {
                                className: "h-full bg-primary rounded-full transition-all duration-300",
                                style: {
                                    width: `${se.total>0?se.current/se.total*100:0}%`
                                }
                            })
                        })]
                    })
                }), me.length > 0 && e.jsxs("div", {
                    children: [e.jsxs("div", {
                        className: "flex items-center justify-between mb-2",
                        children: [e.jsxs("h3", {
                            className: "text-xs font-bold text-foreground uppercase tracking-wider",
                            children: [me.length, " tickers — ", T, " grid — top-", $, " per ticker"]
                        }), e.jsx("div", {
                            className: "flex items-center gap-1",
                            children: e.jsx(jt, {
                                variant: "outline",
                                size: "sm",
                                className: "h-6 gap-1 text-[11px]",
                                onClick: ut,
                                children: e.jsx(Mt, {
                                    className: "w-3 h-3"
                                })
                            })
                        })]
                    }), e.jsx("div", {
                        className: "overflow-x-auto border border-border rounded mb-4",
                        children: e.jsxs("table", {
                            className: "w-full text-[10px] font-mono",
                            children: [e.jsx("thead", {
                                children: e.jsxs("tr", {
                                    className: "bg-card text-muted-foreground",
                                    children: [e.jsxs("th", {
                                        className: "text-left px-2 py-1 font-bold sticky left-0 bg-card z-10 border-r border-border cursor-pointer",
                                        onClick: () => re("ticker"),
                                        children: ["Ticker ", ae("ticker")]
                                    }), e.jsx("th", {
                                        className: "text-left px-2 py-1 font-bold",
                                        children: "Best Params"
                                    }), e.jsxs("th", {
                                        className: "text-center px-2 py-1 font-bold cursor-pointer",
                                        onClick: () => re("nTrades"),
                                        children: ["Trades ", ae("nTrades")]
                                    }), e.jsxs("th", {
                                        className: "text-center px-2 py-1 font-bold cursor-pointer",
                                        onClick: () => re("hitRate"),
                                        children: ["Hit% ", ae("hitRate")]
                                    }), e.jsx("th", {
                                        className: "text-center px-2 py-1 font-bold",
                                        children: "Mean Ret"
                                    }), e.jsxs("th", {
                                        className: "text-center px-2 py-1 font-bold cursor-pointer",
                                        onClick: () => re("sharpe"),
                                        children: ["Sharpe ", ae("sharpe")]
                                    }), e.jsxs("th", {
                                        className: "text-center px-2 py-1 font-bold cursor-pointer",
                                        onClick: () => re("profitFactor"),
                                        children: ["PF ", ae("profitFactor")]
                                    }), e.jsxs("th", {
                                        className: "text-center px-2 py-1 font-bold cursor-pointer",
                                        onClick: () => re("maxDD"),
                                        children: ["MaxDD ", ae("maxDD")]
                                    }), e.jsxs("th", {
                                        className: "text-center px-2 py-1 font-bold cursor-pointer",
                                        onClick: () => re("totalReturn"),
                                        children: ["Total Ret ", ae("totalReturn")]
                                    }), e.jsx("th", {
                                        className: "text-center px-2 py-1 font-bold",
                                        children: "vs B&H"
                                    })]
                                })
                            }), e.jsx("tbody", {
                                children: me.map(t => {
                                    const a = t.topK[0];
                                    if (!a) return null;
                                    const p = Me === t.ticker,
                                        S = Number.isFinite(a.stats.totalReturn) && Number.isFinite(a.stats.buyHoldReturn) ? a.stats.totalReturn - a.stats.buyHoldReturn : NaN;
                                    return e.jsxs(vt.Fragment, {
                                        children: [e.jsxs("tr", {
                                            className: `${p?"bg-primary/10":"hover:bg-white/5"} cursor-pointer border-b border-border/30`,
                                            onClick: () => He(p ? null : t.ticker),
                                            children: [e.jsxs("td", {
                                                className: "px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border",
                                                children: [t.ticker, e.jsx("span", {
                                                    className: "ml-1 text-[8px] text-muted-foreground",
                                                    children: p ? "▲" : "▼"
                                                })]
                                            }), e.jsx("td", {
                                                className: "px-2 py-1 text-muted-foreground max-w-[200px] truncate",
                                                children: ke(a.params)
                                            }), e.jsx("td", {
                                                className: "text-center px-2 py-1",
                                                children: a.stats.nTrades
                                            }), e.jsx("td", {
                                                className: `text-center px-2 py-1 ${a.stats.hitRate>=.5?"text-green-400":"text-red-400"}`,
                                                children: V(a.stats.hitRate)
                                            }), e.jsx("td", {
                                                className: `text-center px-2 py-1 ${X(a.stats.meanRet)}`,
                                                children: z(a.stats.meanRet)
                                            }), e.jsx("td", {
                                                className: `text-center px-2 py-1 ${De(a.stats.sharpe)}`,
                                                children: de(a.stats.sharpe)
                                            }), e.jsx("td", {
                                                className: `text-center px-2 py-1 ${a.stats.profitFactor>=1?"text-green-400":"text-red-400"}`,
                                                children: Number.isFinite(a.stats.profitFactor) ? a.stats.profitFactor > 99 ? "∞" : de(a.stats.profitFactor) : "–"
                                            }), e.jsx("td", {
                                                className: `text-center px-2 py-1 ${Be(a.stats.maxDD)}`,
                                                children: V(a.stats.maxDD)
                                            }), e.jsx("td", {
                                                className: `text-center px-2 py-1 ${X(a.stats.totalReturn)}`,
                                                children: z(a.stats.totalReturn)
                                            }), e.jsx("td", {
                                                className: `text-center px-2 py-1 ${Number.isFinite(S)?S>=0?"text-green-400":"text-red-400":"text-muted-foreground"}`,
                                                children: Number.isFinite(S) ? z(S) : "–"
                                            })]
                                        }), p && e.jsx("tr", {
                                            className: "bg-card/50",
                                            children: e.jsxs("td", {
                                                colSpan: 10,
                                                className: "px-3 py-2",
                                                children: [e.jsxs("div", {
                                                    className: "text-[9px] font-mono text-muted-foreground mb-1 uppercase tracking-wider",
                                                    children: ["Top-", t.topK.length, " configs (sorted by Sharpe)"]
                                                }), e.jsx("div", {
                                                    className: "overflow-x-auto",
                                                    children: e.jsxs("table", {
                                                        className: "w-full text-[9px] font-mono",
                                                        children: [e.jsx("thead", {
                                                            children: e.jsxs("tr", {
                                                                className: "text-muted-foreground border-b border-border/30",
                                                                children: [e.jsx("th", {
                                                                    className: "text-left px-1 py-0.5",
                                                                    children: "#"
                                                                }), e.jsx("th", {
                                                                    className: "text-left px-1 py-0.5",
                                                                    children: "Params"
                                                                }), e.jsx("th", {
                                                                    className: "text-center px-1 py-0.5",
                                                                    children: "Trades"
                                                                }), e.jsx("th", {
                                                                    className: "text-center px-1 py-0.5",
                                                                    children: "Hit%"
                                                                }), e.jsx("th", {
                                                                    className: "text-center px-1 py-0.5",
                                                                    children: "Mean Ret"
                                                                }), e.jsx("th", {
                                                                    className: "text-center px-1 py-0.5",
                                                                    children: "Sharpe"
                                                                }), e.jsx("th", {
                                                                    className: "text-center px-1 py-0.5",
                                                                    children: "PF"
                                                                }), e.jsx("th", {
                                                                    className: "text-center px-1 py-0.5",
                                                                    children: "MaxDD"
                                                                }), e.jsx("th", {
                                                                    className: "text-center px-1 py-0.5",
                                                                    children: "Total Ret"
                                                                })]
                                                            })
                                                        }), e.jsx("tbody", {
                                                            children: t.topK.map((o, r) => e.jsxs("tr", {
                                                                className: "hover:bg-white/5 border-b border-border/10",
                                                                children: [e.jsx("td", {
                                                                    className: "px-1 py-0.5 text-muted-foreground",
                                                                    children: r + 1
                                                                }), e.jsx("td", {
                                                                    className: "px-1 py-0.5 text-foreground max-w-[220px] truncate",
                                                                    children: ke(o.params)
                                                                }), e.jsx("td", {
                                                                    className: "text-center px-1 py-0.5",
                                                                    children: o.stats.nTrades
                                                                }), e.jsx("td", {
                                                                    className: `text-center px-1 py-0.5 ${o.stats.hitRate>=.5?"text-green-400":"text-red-400"}`,
                                                                    children: V(o.stats.hitRate)
                                                                }), e.jsx("td", {
                                                                    className: `text-center px-1 py-0.5 ${X(o.stats.meanRet)}`,
                                                                    children: z(o.stats.meanRet)
                                                                }), e.jsx("td", {
                                                                    className: `text-center px-1 py-0.5 ${De(o.stats.sharpe)}`,
                                                                    children: de(o.stats.sharpe)
                                                                }), e.jsx("td", {
                                                                    className: `text-center px-1 py-0.5 ${o.stats.profitFactor>=1?"text-green-400":"text-red-400"}`,
                                                                    children: Number.isFinite(o.stats.profitFactor) ? o.stats.profitFactor > 99 ? "∞" : de(o.stats.profitFactor) : "–"
                                                                }), e.jsx("td", {
                                                                    className: `text-center px-1 py-0.5 ${Be(o.stats.maxDD)}`,
                                                                    children: V(o.stats.maxDD)
                                                                }), e.jsx("td", {
                                                                    className: `text-center px-1 py-0.5 ${X(o.stats.totalReturn)}`,
                                                                    children: z(o.stats.totalReturn)
                                                                })]
                                                            }, r))
                                                        })]
                                                    })
                                                })]
                                            })
                                        })]
                                    }, t.ticker)
                                })
                            })]
                        })
                    })]
                })]
            })]
        }), ue === "evaluate" && e.jsxs(e.Fragment, {
            children: [e.jsx("div", {
                className: "flex-shrink-0 px-4 py-3 border-b border-border bg-card",
                children: e.jsxs("div", {
                    className: "flex items-start gap-4 flex-wrap",
                    children: [e.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Ticker"
                        }), e.jsx("select", {
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px]",
                            value: xe || i,
                            onChange: t => je(t.target.value),
                            disabled: F,
                            children: D.map(t => e.jsx("option", {
                                value: t.ticker,
                                children: t.ticker
                            }, t.ticker))
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Input Series"
                        }), e.jsx(tt, {
                            value: l,
                            onChange: h,
                            family: "dual_ma",
                            label: "",
                            disabled: F
                        })]
                    }), Ge, e.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Bias MA"
                        }), e.jsx("select", {
                            className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1",
                            value: R,
                            onChange: t => b(t.target.value),
                            disabled: F,
                            children: ge.map(t => e.jsx("option", {
                                value: t,
                                children: t
                            }, t))
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Bias Len"
                        }), e.jsx("input", {
                            type: "number",
                            min: 2,
                            max: 500,
                            step: 1,
                            value: L,
                            onChange: t => ye(Math.max(2, parseInt(t.target.value, 10) || 50)),
                            className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 w-[70px]",
                            disabled: F
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Trigger MA"
                        }), e.jsx("select", {
                            className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1",
                            value: Z,
                            onChange: t => Ee(t.target.value),
                            disabled: F,
                            children: ge.map(t => e.jsx("option", {
                                value: t,
                                children: t
                            }, t))
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Trigger Len"
                        }), e.jsx("input", {
                            type: "number",
                            min: 2,
                            max: 500,
                            step: 1,
                            value: Q,
                            onChange: t => Ne(Math.max(2, parseInt(t.target.value, 10) || 20)),
                            className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 w-[70px]",
                            disabled: F
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Slope Method"
                        }), e.jsx("select", {
                            className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1",
                            value: W,
                            onChange: t => $e(t.target.value),
                            disabled: F,
                            children: Object.entries(Pe).map(([t, a]) => e.jsx("option", {
                                value: t,
                                children: a
                            }, t))
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Slope LB"
                        }), e.jsx("input", {
                            type: "number",
                            min: 1,
                            max: 100,
                            step: 1,
                            value: ee,
                            onChange: t => Ie(Math.max(1, parseInt(t.target.value, 10) || 5)),
                            className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 w-[65px]",
                            disabled: F
                        })]
                    }), W === "diff_pct" && e.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Min Slope%"
                        }), e.jsx("input", {
                            type: "number",
                            min: 0,
                            max: 1,
                            step: 1e-4,
                            value: te,
                            onChange: t => ze(parseFloat(t.target.value) || .001),
                            className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 w-[80px]",
                            disabled: F
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Allow Short"
                        }), e.jsxs("div", {
                            className: "flex items-center gap-1 py-1",
                            children: [e.jsx(Tt, {
                                checked: G,
                                onCheckedChange: _e,
                                disabled: F
                            }), e.jsx("span", {
                                className: "text-[10px] font-mono text-muted-foreground",
                                children: G ? "Yes" : "No"
                            })]
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [e.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: " "
                        }), e.jsx("button", {
                            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
                            onClick: pt,
                            disabled: F,
                            children: F ? "Evaluating…" : "Evaluate"
                        })]
                    })]
                })
            }), e.jsxs("div", {
                className: "flex-1 overflow-auto p-4 space-y-4",
                children: [!x && !F && e.jsx("div", {
                    className: "flex items-center justify-center h-32 text-muted-foreground text-sm",
                    children: "Configure params above and click Evaluate"
                }), F && e.jsx("div", {
                    className: "flex items-center justify-center h-32 text-muted-foreground text-sm",
                    children: "Running backtest…"
                }), x && e.jsxs(e.Fragment, {
                    children: [e.jsxs("div", {
                        className: "border border-border rounded p-3 bg-card/50",
                        children: [e.jsx("div", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-2",
                            children: ke(x.params)
                        }), e.jsx("div", {
                            className: "grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3",
                            children: [{
                                label: "Trades",
                                value: String(x.stats.nTrades)
                            }, {
                                label: "Hit Rate",
                                value: V(x.stats.hitRate),
                                color: x.stats.hitRate >= .5 ? "text-green-400" : "text-red-400"
                            }, {
                                label: "Mean Ret",
                                value: z(x.stats.meanRet),
                                color: X(x.stats.meanRet)
                            }, {
                                label: "Sharpe",
                                value: de(x.stats.sharpe),
                                color: De(x.stats.sharpe)
                            }, {
                                label: "Profit Factor",
                                value: Number.isFinite(x.stats.profitFactor) ? x.stats.profitFactor > 99 ? "∞" : de(x.stats.profitFactor) : "–",
                                color: x.stats.profitFactor >= 1 ? "text-green-400" : "text-red-400"
                            }, {
                                label: "Max DD",
                                value: V(x.stats.maxDD),
                                color: Be(x.stats.maxDD)
                            }, {
                                label: "Total Ret",
                                value: z(x.stats.totalReturn),
                                color: X(x.stats.totalReturn)
                            }, {
                                label: "Buy & Hold",
                                value: z(x.stats.buyHoldReturn),
                                color: X(x.stats.buyHoldReturn)
                            }, {
                                label: "Ann. Return",
                                value: z(x.stats.annualReturn),
                                color: X(x.stats.annualReturn)
                            }, {
                                label: "Ann. Vol",
                                value: V(x.stats.annualVol)
                            }, {
                                label: "Time in Mkt",
                                value: V(x.stats.timeInMarket)
                            }, {
                                label: "Win Ret",
                                value: z(x.stats.winRet),
                                color: "text-green-400"
                            }].map(({
                                label: t,
                                value: a,
                                color: p
                            }) => e.jsxs("div", {
                                className: "flex flex-col gap-0.5",
                                children: [e.jsx("span", {
                                    className: "text-[8px] font-mono text-muted-foreground uppercase tracking-wider",
                                    children: t
                                }), e.jsx("span", {
                                    className: `text-[12px] font-mono font-bold ${p??"text-foreground"}`,
                                    children: a
                                })]
                            }, t))
                        })]
                    }), Ve.length > 1 && e.jsxs("div", {
                        className: "border border-border rounded p-3 bg-card/50",
                        children: [e.jsx("div", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-2",
                            children: "Equity Curve"
                        }), e.jsx(St, {
                            width: "100%",
                            height: 200,
                            children: e.jsxs(wt, {
                                data: Ve,
                                margin: {
                                    top: 4,
                                    right: 12,
                                    left: 0,
                                    bottom: 4
                                },
                                children: [e.jsx(zt, {
                                    strokeDasharray: "3 3",
                                    stroke: "rgba(255,255,255,0.06)"
                                }), e.jsx(At, {
                                    dataKey: "bar",
                                    tick: {
                                        fontSize: 9,
                                        fill: "#888"
                                    },
                                    tickLine: !1,
                                    axisLine: !1
                                }), e.jsx(Rt, {
                                    tick: {
                                        fontSize: 9,
                                        fill: "#888"
                                    },
                                    tickLine: !1,
                                    axisLine: !1,
                                    tickFormatter: t => t.toFixed(2),
                                    width: 44
                                }), e.jsx(Lt, {
                                    contentStyle: {
                                        background: "#1a1a2e",
                                        border: "1px solid #333",
                                        borderRadius: 4,
                                        fontSize: 10
                                    },
                                    formatter: t => [t.toFixed(4), "Equity"],
                                    labelFormatter: t => `Bar ${t}`
                                }), e.jsx(Ct, {
                                    type: "monotone",
                                    dataKey: "equity",
                                    stroke: "#3b82f6",
                                    strokeWidth: 1.5,
                                    dot: !1,
                                    isAnimationActive: !1
                                })]
                            })
                        })]
                    }), x.trades.length > 0 && e.jsxs("div", {
                        className: "border border-border rounded p-3 bg-card/50",
                        children: [e.jsxs("div", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-2",
                            children: ["Last ", Math.min(50, x.trades.length), " of ", x.trades.length, " Trades"]
                        }), e.jsx("div", {
                            className: "overflow-x-auto",
                            children: e.jsxs("table", {
                                className: "w-full text-[9px] font-mono",
                                children: [e.jsx("thead", {
                                    children: e.jsxs("tr", {
                                        className: "text-muted-foreground border-b border-border/30",
                                        children: [e.jsx("th", {
                                            className: "text-left px-1 py-0.5",
                                            children: "#"
                                        }), e.jsx("th", {
                                            className: "text-center px-1 py-0.5",
                                            children: "Side"
                                        }), e.jsx("th", {
                                            className: "text-center px-1 py-0.5",
                                            children: "Entry Bar"
                                        }), e.jsx("th", {
                                            className: "text-center px-1 py-0.5",
                                            children: "Exit Bar"
                                        }), e.jsx("th", {
                                            className: "text-center px-1 py-0.5",
                                            children: "Bars"
                                        }), e.jsx("th", {
                                            className: "text-right px-1 py-0.5",
                                            children: "Entry Px"
                                        }), e.jsx("th", {
                                            className: "text-right px-1 py-0.5",
                                            children: "Exit Px"
                                        }), e.jsx("th", {
                                            className: "text-right px-1 py-0.5",
                                            children: "Return"
                                        })]
                                    })
                                }), e.jsx("tbody", {
                                    children: x.trades.slice(-50).map((t, a) => {
                                        const p = x.trades.length - Math.min(50, x.trades.length) + a;
                                        return e.jsxs("tr", {
                                            className: `border-b border-border/10 ${t.ret>=0?"hover:bg-green-900/10":"hover:bg-red-900/10"}`,
                                            children: [e.jsx("td", {
                                                className: "px-1 py-0.5 text-muted-foreground",
                                                children: p + 1
                                            }), e.jsx("td", {
                                                className: "text-center px-1 py-0.5",
                                                children: e.jsx("span", {
                                                    className: `px-1 rounded text-[8px] font-bold ${t.side==="long"?"bg-blue-600/20 text-blue-400":"bg-orange-600/20 text-orange-400"}`,
                                                    children: t.side
                                                })
                                            }), e.jsx("td", {
                                                className: "text-center px-1 py-0.5",
                                                children: t.entryIdx
                                            }), e.jsx("td", {
                                                className: "text-center px-1 py-0.5",
                                                children: t.exitIdx
                                            }), e.jsx("td", {
                                                className: "text-center px-1 py-0.5",
                                                children: t.bars
                                            }), e.jsx("td", {
                                                className: "text-right px-1 py-0.5",
                                                children: t.entryPrice.toFixed(2)
                                            }), e.jsx("td", {
                                                className: "text-right px-1 py-0.5",
                                                children: t.exitPrice.toFixed(2)
                                            }), e.jsx("td", {
                                                className: `text-right px-1 py-0.5 font-bold ${t.ret>=0?"text-green-400":"text-red-400"}`,
                                                children: z(t.ret)
                                            })]
                                        }, p)
                                    })
                                })]
                            })
                        })]
                    })]
                })]
            })]
        })]
    })
}
export {
    as as
    default
};