import {
    r as c,
    aj as tr,
    cH as or,
    cG as rr,
    a as sr,
    af as nr,
    ae as xo,
    d1 as Lt,
    c_ as Ve,
    c$ as He,
    cL as mo,
    d0 as fo,
    g as lr,
    cM as ar,
    j as t,
    cN as kt,
    cO as go,
    cP as bo,
    dj as ir,
    cQ as cr,
    cR as dr,
    cU as ze,
    cV as ur,
    B as pr,
    z as xr,
    cW as je,
    cX as Dt,
    cY as lt,
    cZ as ho,
    cT as yo,
    cS as ko,
    cJ as mr,
    cK as fr
} from "./index-CsG73Aq_.js";
import {
    g as gr
} from "./yahooPairsRatio-DERC-reP.js";
import {
    P as br
} from "./PresetBar-B4InBSQb.js";
import {
    c as at,
    d as Ft,
    a as Kt,
    b as wo
} from "./oscillatorMath-DdsdJyTp.js";
import {
    e as hr,
    E as yr,
    H as vo
} from "./EvaluatorPanel-BcObXxAZ.js";
import {
    W as kr
} from "./workerPool-CRUHY70X.js";
import {
    U as Ue
} from "./UnifiedTickerPicker-D927mSvl.js";
import {
    B as jo
} from "./BasketTickerPill-DA9Wjwwc.js";
import {
    B as wr
} from "./BasketPicker-DkcKAXfe.js";
import {
    r as No,
    g as wt
} from "./basketOhlc-CIjRG6QD.js";
import {
    u as vr
} from "./useOptimizerClassFilter-COCFGQs0.js";
import {
    u as jr
} from "./usePairComboPicker-h_S34tFb.js";
import {
    u as Nr
} from "./useFrequency-DK9YJz0p.js";
import {
    d as qe,
    e as Vt
} from "./weeklyDownsample-BzVm8wGH.js";
import "./harsi-NMVnsDcX.js";
import "./tva-DaeKqI67.js";
import "./globalUniverse-DuqPcp2u.js";
import "./ClassificationFiltersWithSource-D7v4WOtR.js";

function Sr(V) {
    return new Worker("" + new URL("oscillatorOptimizer.worker-C5wv6LuK.js", import.meta.url).href, {
        name: V?.name
    })
}
const L = {
        buy: {
            label: "Buy Signal",
            description: "Long-side signal — entry into long position"
        },
        sell: {
            label: "Sell Signal",
            description: "Short-side signal — entry into short position"
        }
    },
    So = [5, 14, 21],
    Co = [1, 3, 5],
    _o = [3, 5],
    Ro = [15, 20, 25],
    Ht = [75, 80, 85],
    vt = (() => {
        const V = [];
        for (let ie = 2; ie <= 100; ie += 2) V.push(ie);
        return V
    })(),
    jt = (() => {
        const V = [];
        for (let ie = 4; ie <= 200; ie += 2) V.push(ie);
        return V
    })(),
    Nt = [0, .25, .5, 1, 1.5, 2];

function Hr() {
    const [V, ie] = c.useState([]), [_, Ne] = c.useState(""), [zt, $o] = c.useState(null), [Ut, qt] = c.useState(!1), [w, it] = c.useState("stoch"), [Z, St] = c.useState("cross_out_of_band"), [O, Yt] = c.useState("threshold"), [G, Ct] = c.useState(.05), [oe, _t] = c.useState(.05), [re, Rt] = c.useState(.1), [R, $t] = c.useState(0), [Se, Zt] = c.useState("raw"), [a, ct] = c.useState("single"), [v, dt] = c.useState(""), [j, ut] = c.useState(""), [me, Gt] = c.useState([]), [pt, To] = c.useState("stocks"), {
        baskets: Tt
    } = tr(), [E, se] = c.useState(!1), [Ce, Ye] = c.useState({
        current: 0,
        total: 0
    }), [fe, ne] = c.useState([]), [Ze, Jt] = c.useState(null), [Wo, Bo] = c.useState(new Set), Po = c.useCallback(e => {
        Bo(s => {
            const l = new Set(s);
            return l.has(e) ? l.delete(e) : l.add(e), l
        })
    }, []), [_e, Qt] = c.useState("score"), [Wt, Ao] = c.useState("composite"), Xt = c.useMemo(() => or(Wt), [Wt]), [Ge, eo] = c.useState(""), [to, Te] = c.useState("10y"), [D, We] = c.useState(() => rr()), [xt, oo] = c.useState("optimize"), [ce, ro] = c.useState("long"), [mt, so] = c.useState(null), [ft, no] = c.useState(null), [Bt, Je] = c.useState(!1), [Be, Eo] = c.useState(14), [Pe, Mo] = c.useState(3), [Ae, Oo] = c.useState(3), [Qe, Io] = c.useState(20), [Xe, Lo] = c.useState(80), [Ee, Do] = c.useState(5), [Me, Fo] = c.useState(34), [Oe, Ko] = c.useState(0), Re = c.useRef(!1), lo = c.useRef(!1), et = c.useRef(null), {
        universeTickers: Pt,
        isFiltered: Vo
    } = sr(), N = c.useMemo(() => Pt ? V.filter(e => Pt.has(e.ticker)) : V, [V, Pt]), gt = vr(N, a === "universe", "osc-clf"), bt = jr(N.map(e => e.ticker), a === "pairCombo", "osc-pc"), Ho = gt.filteredTickers, {
        frequency: de,
        setFrequency: ao,
        frequencyUI: zo
    } = Nr("osc", "daily", E || a === "pair" || a === "pairCombo"), ht = de === "weekly" ? "weekly" : "daily";
    c.useEffect(() => {
        nr().then(e => {
            ie(e), e.length > 0 && !lo.current && Ne(e[0].ticker), e.length > 0 && (dt(s => s || e[0].ticker), ut(s => s || (e[1]?.ticker ?? e[0].ticker)))
        })
    }, []), c.useEffect(() => {
        N.length > 0 && _ && V.some(e => e.ticker === _) && !N.find(e => e.ticker === _) && Ne(N[0].ticker)
    }, [N, _, V]);
    const tt = async (e, s) => {
        if (e === "__PAIR__" || e.startsWith("__PAIR__:")) {
            const [l, p] = e.startsWith("__PAIR__:") ? e.slice(9).split(":") : [v, j], n = await gr(l, p, s);
            if (!n || n.indices.length < 252) return null;
            const o = n.indices.map(g => s[g] ?? ""),
                r = n.indices.slice();
            return {
                closes: n.prices,
                highs: n.prices.slice(),
                lows: n.prices.slice(),
                volumes: [],
                priceDates: o,
                globalIndices: r
            }
        }
        try {
            const l = await mr(e),
                p = fr(l, D);
            if (p.adjCloses.length >= 252) {
                const n = new Array(p.adjCloses.length),
                    o = new Array(p.adjCloses.length);
                for (let i = 0; i < p.adjCloses.length; i++) {
                    const b = p.closes[i],
                        h = p.adjCloses[i];
                    if (b && b > 0 && Number.isFinite(b) && Number.isFinite(h)) {
                        const m = h / b;
                        n[i] = p.highs[i] * m, o[i] = p.lows[i] * m
                    } else n[i] = p.highs[i], o[i] = p.lows[i]
                }
                const r = p.dates.slice(0, p.adjCloses.length),
                    g = new Map;
                for (let i = 0; i < s.length; i++) g.set(s[i], i);
                const u = r.map(i => g.get(i) ?? -1);
                return {
                    closes: p.adjCloses,
                    highs: n,
                    lows: o,
                    volumes: p.volumes ?? [],
                    priceDates: r,
                    globalIndices: u
                }
            }
            return null
        } catch {
            return null
        }
    }, Uo = c.useCallback(async () => {
        se(!0), ne([]), Re.current = !1;
        const e = await xo();
        let s;
        if (a === "pair") {
            if (!v || !j || v === j) {
                se(!1);
                return
            }
            s = [{
                ticker: "__PAIR__",
                name: `${v}/${j}`
            }]
        } else if (a === "single") {
            const n = _,
                o = N.find(r => r.ticker === n);
            s = o ? [o] : n ? [{
                ticker: n,
                name: n
            }] : []
        } else if (a === "basket")
            if (pt === "combined") {
                if (me.length === 0) {
                    se(!1);
                    return
                }
                const n = No(me, Tt);
                s = [{
                    ticker: `BASKET:${n.name}`,
                    name: `BASKET:${n.name}`
                }]
            } else s = me.map(n => N.find(r => r.ticker.toUpperCase() === n.toUpperCase()) ?? {
                ticker: n,
                name: n
            });
        else if (a === "pairCombo") {
            if (bt.pairs.length === 0) {
                se(!1);
                return
            }
            s = bt.pairs.map(n => ({
                ticker: `__PAIR__:${n.a}:${n.b}`,
                name: n.label,
                pairA: n.a,
                pairB: n.b
            }))
        } else s = Ho;
        if (s.length === 0) {
            se(!1);
            return
        }
        const l = a === "basket" && pt === "combined" ? No(me, Tt) : null;
        if (Ye({
                current: 0,
                total: s.length
            }), w === "ewo") {
            if (de === "daily") {
                et.current?.terminate();
                const o = Math.min(Math.max(2, navigator.hardwareConcurrency || 4), 8),
                    r = new kr(() => new Sr, o);
                et.current = r;
                const g = {
                        ewoFast: vt,
                        ewoSlow: jt,
                        ewoThresholdPct: Nt,
                        targetReturn: G,
                        returnMode: O,
                        bandMin: oe,
                        bandMax: re,
                        minHold: R
                    },
                    u = [];
                let i = 0;
                const b = s.map(async h => {
                    if (!Re.current) try {
                        const m = l ? await wt(l, D).then(S => S ? {
                            closes: S.closes,
                            highs: S.highs,
                            lows: S.lows,
                            volumes: S.volumes,
                            priceDates: S.priceDates,
                            globalIndices: []
                        } : null) : await tt(h.ticker, e);
                        if (!m || m.closes.length < 252 || Re.current) return;
                        const F = h.ticker === "__PAIR__" ? `${v}/${j}` : h.ticker.startsWith("__PAIR__:") && h.name || h.ticker,
                            y = await r.run({
                                type: "run",
                                ticker: F,
                                name: h.name,
                                closes: m.closes,
                                highs: m.highs,
                                lows: m.lows,
                                params: g
                            });
                        if (!y) return;
                        const W = {
                            prices: m.closes,
                            highs: m.highs,
                            lows: m.lows,
                            volumes: m.volumes,
                            dates: m.priceDates,
                            globalIndices: m.globalIndices,
                            benchmarkPrices: null,
                            mode: a === "pair" || a === "pairCombo" ? "pair" : "single",
                            pairLegA: a === "pairCombo" ? h.pairA : a === "pair" ? v : void 0,
                            pairLegB: a === "pairCombo" ? h.pairB : a === "pair" ? j : void 0
                        };
                        u.push({
                            ticker: y.ticker,
                            name: y.name,
                            configs: y.configs,
                            bestConfigLabel: y.bestConfigLabel,
                            bestCategory: L[y.bestCategory]?.label ?? y.bestCategory,
                            bestScore: y.bestScore,
                            currentSignal: y.currentSignal,
                            currentValue: y.currentValue,
                            currentValuePct: y.currentValuePct,
                            priceContext: W
                        })
                    } catch {} finally {
                        i++, Ye({
                            current: i,
                            total: s.length
                        }), (i % 3 === 0 || i === s.length) && ne([...u])
                    }
                });
                await Promise.all(b), ne([...u]), r.terminate(), et.current = null, se(!1);
                return
            }
            if (de === "weekly_on_daily") {
                const o = [];
                for (let r = 0; r < s.length && !Re.current; r++) {
                    const g = s[r];
                    Ye({
                        current: r + 1,
                        total: s.length
                    });
                    try {
                        const u = l ? await wt(l, D).then(d => d ? {
                            closes: d.closes,
                            highs: d.highs,
                            lows: d.lows,
                            volumes: d.volumes,
                            priceDates: d.priceDates,
                            globalIndices: []
                        } : null) : await tt(g.ticker, e);
                        if (!u) continue;
                        const i = u.closes.length;
                        if (i < 252) continue;
                        const b = qe(u.closes, u.priceDates),
                            h = qe(u.highs, u.priceDates),
                            m = qe(u.lows, u.priceDates);
                        if (b.prices.length < 52) continue;
                        const F = u.closes,
                            y = 52,
                            W = new Array(b.prices.length).fill(null);
                        let S = 0,
                            z = 0;
                        for (let d = 0; d < b.prices.length; d++) S += b.prices[d], z++, d >= y && (S -= b.prices[d - y], z--), z > 0 && (W[d] = S / z);
                        const U = b.prices.slice(-y),
                            ge = U.reduce((d, C) => d + C, 0) / Math.max(U.length, 1),
                            K = [],
                            ot = O === "band" ? {
                                minReturn: oe,
                                maxReturn: re
                            } : null,
                            Ie = O === "band";
                        for (const d of vt)
                            for (const C of jt) {
                                if (d >= C) continue;
                                const te = at(h.prices, m.prices, d, C).map(T => T === null ? NaN : T),
                                    st = Vt(te, b.weekIndex, i).map(T => Number.isFinite(T) ? T : null),
                                    $e = W.map(T => T === null ? NaN : T),
                                    ye = Vt($e, b.weekIndex, i).map(T => Number.isFinite(T) ? T : null),
                                    De = Math.max(C * 5, 21) + 126;
                                for (const T of Nt) {
                                    const Fe = ye.map(A => A === null ? null : T / 100 * A),
                                        Ke = Ft(st, Fe, De),
                                        ae = [],
                                        ke = [];
                                    let I = -1;
                                    for (const A of Ke) {
                                        if (R > 0 && A.index < I || A.index < 0 || A.index >= i) continue;
                                        const nt = Lt(F, A.index, G, A.direction, ot, R);
                                        A.direction === "buy" ? ae.push(nt) : ke.push(nt), R > 0 && (I = A.index + R)
                                    }
                                    const Q = Ve(ae, "buy"),
                                        we = Ve(ke, "sell"),
                                        H = He(Q, "buy", Ie),
                                        xe = He(we, "sell", Ie),
                                        ve = [{
                                            category: "buy",
                                            label: L.buy.label,
                                            description: L.buy.description,
                                            summary: Q,
                                            composite: H,
                                            profiles: ae
                                        }, {
                                            category: "sell",
                                            label: L.sell.label,
                                            description: L.sell.description,
                                            summary: we,
                                            composite: xe,
                                            profiles: ke
                                        }],
                                        It = ve.reduce((A, nt) => A.composite.score > nt.composite.score ? A : nt, ve[0]);
                                    K.push({
                                        configLabel: `EWO(${d},${C}) thr ${T}%`,
                                        configKey: `${d}_${C}_${T}`,
                                        categories: ve,
                                        bestCategory: It.category,
                                        bestScore: It.composite.score
                                    })
                                }
                            }
                        if (K.length === 0) continue;
                        const rt = 6,
                            ue = [...K].sort((d, C) => C.bestScore - d.bestScore),
                            X = new Set(ue.slice(0, rt).map(d => d.configKey));
                        for (const d of K)
                            if (!X.has(d.configKey))
                                for (const C of d.categories) C.profiles = void 0;
                        const q = K.reduce((d, C) => d.bestScore > C.bestScore ? d : C),
                            ee = q.configKey.split("_"),
                            [be, B, P] = [Number(ee[0]), Number(ee[1]), Number(ee[2])],
                            J = at(h.prices, m.prices, be, B),
                            $ = J[J.length - 1],
                            le = J[J.length - 2] ?? null,
                            Y = $ !== null ? Math.round($ * 1e3) / 1e3 : null;
                        let x = null;
                        if ($ !== null) {
                            const d = b.prices.slice(-B),
                                C = d.reduce((pe, te) => pe + te, 0) / Math.max(d.length, 1);
                            C > 0 && (x = Math.round($ / C * 1e3) / 10)
                        }
                        const k = P / 100 * ge;
                        let M = "None";
                        $ !== null && ($ > k ? M = k > 0 ? "Above +Thr" : "Above 0" : $ < -k ? M = k > 0 ? "Below -Thr" : "Below 0" : M = "In Zone", le !== null && (k === 0 ? le <= 0 && $ > 0 ? M = "→ Cross Up" : le >= 0 && $ < 0 && (M = "→ Cross Down") : le <= k && $ > k ? M = "→ Cross +Thr" : le >= -k && $ < -k && (M = "→ Cross -Thr")));
                        const f = g.ticker === "__PAIR__" ? `${v}/${j}` : g.ticker.startsWith("__PAIR__:") && g.name || g.ticker;
                        o.push({
                            ticker: f,
                            name: g.name,
                            configs: K,
                            bestConfigLabel: q.configLabel,
                            bestCategory: L[q.bestCategory]?.label ?? q.bestCategory,
                            bestScore: q.bestScore,
                            priceContext: {
                                prices: u.closes,
                                highs: u.highs,
                                lows: u.lows,
                                volumes: u.volumes,
                                dates: u.priceDates,
                                globalIndices: u.globalIndices,
                                benchmarkPrices: null,
                                mode: a === "pair" || a === "pairCombo" ? "pair" : "single",
                                pairLegA: a === "pairCombo" ? g.pairA : a === "pair" ? v : void 0,
                                pairLegB: a === "pairCombo" ? g.pairB : a === "pair" ? j : void 0
                            },
                            currentSignal: M,
                            currentValue: Y,
                            currentValuePct: x
                        }), (r % 3 === 0 || r === s.length - 1) && ne([...o])
                    } catch {}
                }
                ne(o), se(!1);
                return
            }
            const n = [];
            for (let o = 0; o < s.length && !Re.current; o++) {
                const r = s[o];
                Ye({
                    current: o + 1,
                    total: s.length
                });
                try {
                    const g = l ? await wt(l, D).then(f => f ? {
                        closes: f.closes,
                        highs: f.highs,
                        lows: f.lows,
                        volumes: f.volumes,
                        priceDates: f.priceDates,
                        globalIndices: []
                    } : null) : await tt(r.ticker, e);
                    if (!g) continue;
                    const u = mo({
                        dates: g.priceDates,
                        closes: g.closes,
                        adjCloses: g.closes,
                        highs: g.highs,
                        lows: g.lows
                    }, "weekly");
                    if (u.adjCloses.length < 52) continue;
                    const b = g.closes,
                        h = u.dailyIndexMap,
                        m = 52,
                        F = new Array(u.closes.length).fill(null);
                    let y = 0,
                        W = 0;
                    for (let f = 0; f < u.closes.length; f++) y += u.closes[f], W++, f >= m && (y -= u.closes[f - m], W--), W > 0 && (F[f] = y / W);
                    const S = u.closes.slice(-m),
                        z = S.reduce((f, d) => f + d, 0) / Math.max(S.length, 1),
                        U = [],
                        ge = O === "band" ? {
                            minReturn: oe,
                            maxReturn: re
                        } : null,
                        K = O === "band";
                    for (const f of vt)
                        for (const d of jt) {
                            if (f >= d) continue;
                            const C = at(u.highs, u.lows, f, d),
                                pe = d + 26;
                            for (const te of Nt) {
                                const Le = F.map(I => I === null ? null : te / 100 * I),
                                    st = Ft(C, Le, pe),
                                    $e = [],
                                    he = [];
                                let ye = -1;
                                for (const I of st) {
                                    if (R > 0 && I.index < ye) continue;
                                    const Q = fo(I.index, u);
                                    if (Q < 0) continue;
                                    const we = Lt(b, Q, G, I.direction, ge, R);
                                    I.direction === "buy" ? $e.push(we) : he.push(we), R > 0 && (ye = I.index + R)
                                }
                                const De = Ve($e, "buy"),
                                    T = Ve(he, "sell"),
                                    Fe = He(De, "buy", K),
                                    Ke = He(T, "sell", K),
                                    ae = [{
                                        category: "buy",
                                        label: L.buy.label,
                                        description: L.buy.description,
                                        summary: De,
                                        composite: Fe,
                                        profiles: $e
                                    }, {
                                        category: "sell",
                                        label: L.sell.label,
                                        description: L.sell.description,
                                        summary: T,
                                        composite: Ke,
                                        profiles: he
                                    }],
                                    ke = ae.reduce((I, Q) => I.composite.score > Q.composite.score ? I : Q, ae[0]);
                                U.push({
                                    configLabel: `EWO(${f},${d}) thr ${te}%`,
                                    configKey: `${f}_${d}_${te}`,
                                    categories: ae,
                                    bestCategory: ke.category,
                                    bestScore: ke.composite.score
                                })
                            }
                        }
                    if (U.length === 0) continue;
                    const ot = 6,
                        Ie = [...U].sort((f, d) => d.bestScore - f.bestScore),
                        rt = new Set(Ie.slice(0, ot).map(f => f.configKey));
                    for (const f of U)
                        if (!rt.has(f.configKey))
                            for (const d of f.categories) d.profiles = void 0;
                    const ue = U.reduce((f, d) => f.bestScore > d.bestScore ? f : d),
                        X = ue.configKey.split("_"),
                        [q, ee, be] = [Number(X[0]), Number(X[1]), Number(X[2])],
                        B = at(u.highs, u.lows, q, ee),
                        P = B[B.length - 1],
                        J = B[B.length - 2] ?? null,
                        $ = P !== null ? Math.round(P * 1e3) / 1e3 : null;
                    let le = null;
                    if (P !== null) {
                        const f = u.closes.slice(-ee),
                            d = f.reduce((C, pe) => C + pe, 0) / Math.max(f.length, 1);
                        d > 0 && (le = Math.round(P / d * 1e3) / 10)
                    }
                    const Y = be / 100 * z;
                    let x = "None";
                    P !== null && (P > Y ? x = Y > 0 ? "Above +Thr" : "Above 0" : P < -Y ? x = Y > 0 ? "Below -Thr" : "Below 0" : x = "In Zone", J !== null && (Y === 0 ? J <= 0 && P > 0 ? x = "→ Cross Up" : J >= 0 && P < 0 && (x = "→ Cross Down") : J <= Y && P > Y ? x = "→ Cross +Thr" : J >= -Y && P < -Y && (x = "→ Cross -Thr")));
                    const k = r.ticker === "__PAIR__" ? `${v}/${j}` : r.ticker.startsWith("__PAIR__:") && r.name || r.ticker,
                        M = {
                            prices: u.closes,
                            highs: u.highs,
                            lows: u.lows,
                            volumes: u.volumes,
                            dates: u.dates,
                            globalIndices: h.map(f => g.globalIndices[f] ?? -1),
                            benchmarkPrices: null,
                            mode: a === "pair" || a === "pairCombo" ? "pair" : "single",
                            pairLegA: a === "pairCombo" ? r.pairA : a === "pair" ? v : void 0,
                            pairLegB: a === "pairCombo" ? r.pairB : a === "pair" ? j : void 0
                        };
                    n.push({
                        ticker: k,
                        name: r.name,
                        configs: U,
                        bestConfigLabel: ue.configLabel,
                        bestCategory: L[ue.bestCategory]?.label ?? ue.bestCategory,
                        bestScore: ue.bestScore,
                        priceContext: M,
                        currentSignal: x,
                        currentValue: $,
                        currentValuePct: le
                    }), (o % 3 === 0 || o === s.length - 1) && ne([...n])
                } catch {}
            }
            ne(n), se(!1);
            return
        }
        const p = [];
        for (let n = 0; n < s.length && !Re.current; n++) {
            const o = s[n];
            Ye({
                current: n + 1,
                total: s.length
            });
            try {
                const r = l ? await wt(l, D).then(x => x ? {
                    closes: x.closes,
                    highs: x.highs,
                    lows: x.lows,
                    volumes: x.volumes,
                    priceDates: x.priceDates,
                    globalIndices: []
                } : null) : await tt(o.ticker, e);
                if (!r) continue;
                const g = r.closes,
                    u = r.closes.length;
                let i, b, h, m = null,
                    F = null,
                    y = null,
                    W = null;
                if (de === "weekly_on_daily") {
                    if (u < 252 || (F = qe(r.closes, r.priceDates), y = qe(r.highs, r.priceDates), W = qe(r.lows, r.priceDates), F.prices.length < 52)) continue;
                    i = F.prices, b = y.prices, h = W.prices
                } else {
                    m = mo({
                        dates: r.priceDates,
                        closes: r.closes,
                        adjCloses: r.closes,
                        highs: r.highs,
                        lows: r.lows
                    }, ht);
                    const x = ht === "weekly" ? 52 : 252;
                    if (m.closes.length < x) continue;
                    i = m.closes, b = m.highs, h = m.lows
                }
                const S = [];
                for (const x of So)
                    for (const k of Co)
                        for (const M of _o)
                            for (const f of Ro)
                                for (const d of Ht) {
                                    if (f >= d) continue;
                                    const {
                                        k: C,
                                        d: pe
                                    } = Kt(b, h, i, x, k, M);
                                    let te, Le;
                                    if (de === "weekly_on_daily" && F) {
                                        const H = xe => {
                                            const ve = xe.map(A => A === null ? NaN : A);
                                            return Vt(ve, F.weekIndex, u).map(A => Number.isFinite(A) ? A : null)
                                        };
                                        te = H(C), Le = H(pe)
                                    } else te = C, Le = pe;
                                    const st = de === "weekly_on_daily" ? Math.max((x + k + M) * 5, 21) + 126 : ht === "weekly" ? x + k + M + 26 : x + k + M + 126,
                                        $e = wo(te, Le, f, d, Z, st),
                                        he = [],
                                        ye = [],
                                        De = O === "band" ? {
                                            minReturn: oe,
                                            maxReturn: re
                                        } : null;
                                    let T = -1;
                                    for (const H of $e) {
                                        if (R > 0 && H.index < T) continue;
                                        const xe = ht === "weekly" && m ? fo(H.index, m) : H.index;
                                        if (xe < 0) continue;
                                        const ve = Lt(g, xe, G, H.direction, De, R);
                                        H.direction === "buy" ? he.push(ve) : ye.push(ve), R > 0 && (T = H.index + R)
                                    }
                                    const Fe = O === "band",
                                        Ke = Ve(he, "buy"),
                                        ae = Ve(ye, "sell"),
                                        ke = He(Ke, "buy", Fe),
                                        I = He(ae, "sell", Fe),
                                        Q = [{
                                            category: "buy",
                                            label: L.buy.label,
                                            description: L.buy.description,
                                            summary: Ke,
                                            composite: ke,
                                            profiles: he
                                        }, {
                                            category: "sell",
                                            label: L.sell.label,
                                            description: L.sell.description,
                                            summary: ae,
                                            composite: I,
                                            profiles: ye
                                        }],
                                        we = Q.reduce((H, xe) => H.composite.score > xe.composite.score ? H : xe, Q[0]);
                                    S.push({
                                        configLabel: `Stoch(${x},${k},${M}) ${f}/${d}`,
                                        configKey: `${x}_${k}_${M}_${f}_${d}`,
                                        categories: Q,
                                        bestCategory: we.category,
                                        bestScore: we.composite.score
                                    })
                                }
                if (S.length === 0) continue;
                const z = 6,
                    U = [...S].sort((x, k) => k.bestScore - x.bestScore),
                    ge = new Set(U.slice(0, z).map(x => x.configKey));
                for (const x of S)
                    if (!ge.has(x.configKey))
                        for (const k of x.categories) k.profiles = void 0;
                const K = S.reduce((x, k) => x.bestScore > k.bestScore ? x : k),
                    ot = K.configKey.split("_").map(Number),
                    [Ie, rt, ue, X, q] = ot,
                    {
                        k: ee,
                        d: be
                    } = Kt(b, h, i, Ie, rt, ue),
                    B = ee[ee.length - 1],
                    P = ee[ee.length - 2] ?? null,
                    J = B !== null ? Math.round(B * 10) / 10 : null;
                let $ = "None";
                if (B !== null && (B <= X ? $ = "Oversold" : B >= q ? $ = "Overbought" : $ = "Neutral", P !== null))
                    if (Z === "cross_out_of_band") P <= X && B > X ? $ = "→ Exit OS" : P >= q && B < q && ($ = "→ Exit OB");
                    else {
                        const x = be[be.length - 1],
                            k = be[be.length - 2] ?? null;
                        x !== null && k !== null && (P <= k && B > x && B <= X && x <= X ? $ = "→ K×D Buy" : P >= k && B < x && B >= q && x >= q && ($ = "→ K×D Sell"))
                    } const le = o.ticker === "__PAIR__" ? `${v}/${j}` : o.ticker.startsWith("__PAIR__:") && o.name || o.ticker,
                    Y = m ? {
                        prices: m.closes,
                        highs: m.highs,
                        lows: m.lows,
                        volumes: m.volumes,
                        dates: m.dates,
                        globalIndices: m.dailyIndexMap.map(x => r.globalIndices[x] ?? -1),
                        benchmarkPrices: null,
                        mode: a === "pair" || a === "pairCombo" ? "pair" : "single",
                        pairLegA: a === "pairCombo" ? o.pairA : a === "pair" ? v : void 0,
                        pairLegB: a === "pairCombo" ? o.pairB : a === "pair" ? j : void 0
                    } : {
                        prices: r.closes,
                        highs: r.highs,
                        lows: r.lows,
                        volumes: r.volumes,
                        dates: r.priceDates,
                        globalIndices: r.globalIndices,
                        benchmarkPrices: null,
                        mode: a === "pair" || a === "pairCombo" ? "pair" : "single",
                        pairLegA: a === "pairCombo" ? o.pairA : a === "pair" ? v : void 0,
                        pairLegB: a === "pairCombo" ? o.pairB : a === "pair" ? j : void 0
                    };
                p.push({
                    ticker: le,
                    name: o.name,
                    configs: S,
                    bestConfigLabel: K.configLabel,
                    bestCategory: L[K.bestCategory]?.label ?? K.bestCategory,
                    bestScore: K.bestScore,
                    priceContext: Y,
                    currentSignal: $,
                    currentValue: J,
                    currentValuePct: null
                }), (n % 5 === 0 || n === s.length - 1) && ne([...p])
            } catch {}
        }
        ne(p), se(!1)
    }, [N, _, v, j, a, w, Z, G, O, oe, re, R, de, D, me, pt, Tt]), qo = c.useCallback(async () => {
        Je(!0), so(null), no(null);
        try {
            const e = await xo(),
                s = a === "pair" ? "__PAIR__" : a === "single" ? _ : N[0]?.ticker ?? "";
            if (a === "pair" && (!v || !j || v === j)) {
                Je(!1);
                return
            }
            if (!s) {
                Je(!1);
                return
            }
            const l = await tt(s, e);
            if (!l) {
                Je(!1);
                return
            }
            const {
                closes: p,
                highs: n,
                lows: o,
                volumes: r,
                priceDates: g,
                globalIndices: u
            } = l, i = g.length === p.length ? g : new Array(p.length).fill(""), h = ce === "long" ? "buy" : "sell", m = [];
            if (w === "stoch") {
                const y = Kt(n, o, p, Be, Pe, Ae),
                    W = Be + Pe + Ae + 5,
                    S = wo(y.k, y.d, Qe, Xe, Z, W);
                for (const z of S) z.direction === h && m.push(z.index)
            } else {
                const y = at(n, o, Ee, Me),
                    W = p[p.length - 1] ?? 0,
                    S = Oe / 100 * W,
                    z = Math.max(Ee, Me) + 5,
                    U = Ft(y, S, z);
                for (const ge of U) ge.direction === h && m.push(ge.index)
            }
            m.sort((y, W) => y - W);
            const F = hr(p, i, m, ce, G, R, null, "3M");
            so(F), no({
                prices: p,
                highs: n,
                lows: o,
                volumes: r,
                dates: i,
                globalIndices: u,
                benchmarkPrices: null,
                mode: a === "pair" ? "pair" : "single",
                pairLegA: a === "pair" ? v : void 0,
                pairLegB: a === "pair" ? j : void 0
            })
        } finally {
            Je(!1)
        }
    }, [a, v, j, _, N, w, Z, Be, Pe, Ae, Qe, Xe, Ee, Me, Oe, G, R, ce, D]), io = c.useMemo(() => {
        if (w === "stoch") return `Stoch ${Be}/${Pe}/${Ae} OS=${Qe} OB=${Xe} (${Z}) [${ce}]`;
        const e = Oe === 0 ? "zero" : `±${Oe.toFixed(2)}%`;
        return `EWO ${Ee}/${Me} ${e} [${ce}]`
    }, [w, Z, Be, Pe, Ae, Qe, Xe, Ee, Me, Oe, ce]), co = c.useMemo(() => a === "pair" ? `${v||"A"}/${j||"B"}` : a === "single" ? _ || "—" : N[0]?.ticker || "—", [a, v, j, _, N]), At = c.useCallback(() => ({
        selectedTicker: _,
        subMode: w,
        stochSignalMode: Z,
        targetReturn: G,
        mode: a,
        results: fe,
        expandedTicker: Ze,
        sortBy: _e,
        returnMode: O,
        bandMin: oe,
        bandMax: re,
        minHold: R,
        ewoDisplay: Se,
        frequency: de,
        pairTickerA: v,
        pairTickerB: j,
        basketTickers: me
    }), [_, w, Z, G, a, fe, Ze, _e, O, oe, re, R, Se, de, v, j, me]), Et = c.useCallback(e => {
        e && (e.selectedTicker && (Ne(e.selectedTicker), lo.current = !0), e.subMode && it(e.subMode), e.stochSignalMode && St(e.stochSignalMode), typeof e.targetReturn == "number" && Ct(e.targetReturn), e.returnMode && Yt(e.returnMode), typeof e.bandMin == "number" && _t(e.bandMin), typeof e.bandMax == "number" && Rt(e.bandMax), typeof e.minHold == "number" && $t(e.minHold), (e.ewoDisplay === "raw" || e.ewoDisplay === "pct") && Zt(e.ewoDisplay), e.frequency === "daily" || e.frequency === "weekly" || e.frequency === "weekly_on_daily" ? ao(e.frequency) : e.timeframe === "weekly" && e.frequency === void 0 && ao("weekly"), (e.mode === "single" || e.mode === "universe" || e.mode === "pair" || e.mode === "pairCombo" || e.mode === "basket") && ct(e.mode), e.pairCombo && bt.hydrate(e.pairCombo), Array.isArray(e.results) && ne(e.results), e.expandedTicker !== void 0 && Jt(e.expandedTicker), e.sortBy && Qt(e.sortBy), e.pairTickerA && dt(e.pairTickerA), e.pairTickerB && ut(e.pairTickerB), Array.isArray(e.basketTickers) && Gt(e.basketTickers.filter(s => typeof s == "string")))
    }, []);
    lr("oscillators", At, Et);
    const Yo = c.useCallback(() => {
            const e = At(),
                {
                    selectedTicker: s,
                    pairTickerA: l,
                    pairTickerB: p,
                    results: n,
                    gridResults: o,
                    expandedTicker: r,
                    expandedGridTicker: g,
                    sortBy: u,
                    runSort: i,
                    gridLongSort: b,
                    gridShortSort: h,
                    evalResult: m,
                    evalTriggerKey: F,
                    evalFilterKeys: y,
                    ...W
                } = e;
            return W
        }, [At]),
        Zo = c.useCallback(e => {
            Et(e)
        }, [Et]),
        yt = c.useMemo(() => fe.map(e => ({
            ...e,
            configs: e.configs.map(s => {
                let l = -1 / 0,
                    p = s.categories[0];
                for (const n of s.categories) {
                    const o = n.category.startsWith("buy") ? "buy" : "sell",
                        r = ar(n.summary, n.composite.score, o, Xt);
                    r > l && (l = r, p = n)
                }
                return {
                    ...s,
                    bestScore: l,
                    bestCategory: p
                }
            })
        })), [fe, Xt]),
        Mt = c.useMemo(() => {
            const e = Ge.trim().toLowerCase(),
                s = e ? yt.filter(l => l.ticker.toLowerCase().includes(e) || l.name && l.name.toLowerCase().includes(e)) : [...yt];
            if (_e === "score") s.sort((l, p) => p.bestScore - l.bestScore);
            else if (_e === "ticker") s.sort((l, p) => l.ticker.localeCompare(p.ticker));
            else if (_e === "value") {
                const l = w === "ewo" && Se === "pct";
                s.sort((p, n) => {
                    const o = l ? p.currentValuePct ?? -1 / 0 : p.currentValue ?? -1 / 0;
                    return (l ? n.currentValuePct ?? -1 / 0 : n.currentValue ?? -1 / 0) - o
                })
            } else s.sort((l, p) => l.currentSignal.localeCompare(p.currentSignal));
            return s
        }, [yt, _e, w, Se, Ge]),
        Go = () => {
            const e = je.filter((o, r) => r >= 2),
                s = Mt.map(o => {
                    const r = o.configs.reduce((b, h) => b.bestScore > h.bestScore ? b : h, o.configs[0]),
                        u = r?.categories.reduce((b, h) => b.composite.score > h.composite.score ? b : h, r.categories[0])?.summary,
                        i = {
                            ticker: o.ticker,
                            name: o.name,
                            currentValue: o.currentValue ?? null,
                            currentValuePct: o.currentValuePct ?? null,
                            currentSignal: o.currentSignal,
                            bestConfig: o.bestConfigLabel,
                            bestCategory: o.bestCategory,
                            bestScore: o.bestScore
                        };
                    return e.forEach(b => {
                        i[`hitRate_${b.label}`] = u?.hitRate[b.label] ?? null, i[`avgReturn_${b.label}`] = u?.avgReturn[b.label] ?? null
                    }), i
                }),
                l = Object.keys(s[0] || {}),
                p = [l.join(","), ...s.map(o => l.map(r => `"${String(o[r]??"").replace(/"/g,'""')}"`).join(","))].join(`
`),
                n = document.createElement("a");
            n.href = URL.createObjectURL(new Blob([p], {
                type: "text/csv"
            })), n.download = `oscillator_optimizer_${w}.csv`, n.click()
        },
        Jo = e => e === null ? "text-muted-foreground" : w === "stoch" ? e <= 20 ? "text-emerald-400" : e <= 40 ? "text-green-400" : e >= 80 ? "text-red-400" : e >= 60 ? "text-orange-400" : "text-yellow-400" : e > 0 ? "text-green-400" : e < 0 ? "text-red-400" : "text-yellow-400",
        uo = e => e.includes("Oversold") || e.includes("Buy") || e.includes("Cross Up") || e.includes("Above +Thr") || e.includes("Above 0") || e.includes("Exit OS") ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/30" : e.includes("Overbought") || e.includes("Sell") || e.includes("Cross Down") || e.includes("Below -Thr") || e.includes("Below 0") || e.includes("Exit OB") ? "bg-red-600/20 text-red-400 border-red-600/30" : e.includes("→") ? "bg-blue-600/20 text-blue-400 border-blue-600/30" : e.includes("Neutral") || e.includes("In Zone") ? "bg-yellow-600/20 text-yellow-400 border-yellow-600/30" : "bg-muted text-muted-foreground border-border",
        Qo = So.length * Co.length * _o.length * Ro.filter(e => Ht.some(s => e < s)).length * Ht.length,
        Xo = (() => {
            let e = 0;
            for (const s of vt)
                for (const l of jt) s < l && e++;
            return e * Nt.length
        })(),
        er = w === "stoch" ? Qo : Xo,
        Ot = w === "stoch" ? "%K" : Se === "pct" ? "EWO %" : "EWO",
        po = e => {
            if (w === "stoch") return e.currentValue != null ? e.currentValue.toFixed(1) : "–";
            const s = e.currentValue != null ? e.currentValue.toFixed(3) : "–",
                l = e.currentValuePct != null ? `${e.currentValuePct>=0?"+":""}${e.currentValuePct.toFixed(2)}%` : "–";
            return Se === "raw" ? l === "–" ? s : `${s}  (${l})` : s === "–" ? l : `${l}  (${s})`
        };
    return t.jsxs("div", {
        className: "flex flex-col h-full overflow-hidden",
        children: [t.jsxs("div", {
            className: "flex-shrink-0 px-4 pt-2 pb-1 border-b border-border bg-card flex items-center gap-3",
            children: [t.jsx("h2", {
                className: "text-sm font-bold text-foreground tracking-tight",
                children: "Oscillators"
            }), t.jsxs("div", {
                className: "flex gap-px",
                children: [t.jsx("button", {
                    "data-testid": "osc-view-optimize",
                    className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${xt==="optimize"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                    onClick: () => oo("optimize"),
                    children: "Optimize"
                }), t.jsx("button", {
                    "data-testid": "osc-view-evaluate",
                    className: `text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${xt==="evaluate"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                    onClick: () => oo("evaluate"),
                    children: "Evaluate"
                })]
            }), t.jsx("span", {
                className: "text-[10px] text-muted-foreground",
                children: xt === "optimize" ? "Search Stoch/EWO parameter space by hit rate" : "Score one specific oscillator setup"
            })]
        }), xt === "evaluate" ? t.jsxs(t.Fragment, {
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
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${a==="single"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => ct("single"),
                                children: "Single"
                            }), t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${a==="pair"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => ct("pair"),
                                children: "Pair"
                            })]
                        })]
                    }), a === "single" && t.jsxs("div", {
                        className: "flex items-end gap-2",
                        children: [t.jsx("div", {
                            className: kt(_) ? "opacity-40 pointer-events-none" : "",
                            children: t.jsx(Ue, {
                                tickers: N,
                                value: kt(_) ? "" : _,
                                onChange: Ne,
                                label: "Ticker"
                            })
                        }), t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Basket"
                            }), t.jsx(jo, {
                                activeTicker: _,
                                onSelectTicker: Ne,
                                fallbackTicker: N[0]?.ticker ?? null
                            })]
                        })]
                    }), a === "pair" && t.jsxs(t.Fragment, {
                        children: [t.jsx(Ue, {
                            tickers: N,
                            value: v,
                            onChange: dt,
                            label: "Ticker A"
                        }), t.jsx(Ue, {
                            tickers: N,
                            value: j,
                            onChange: ut,
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
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${ce==="long"?"bg-emerald-600 text-white":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => ro("long"),
                                children: "Long"
                            }), t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${ce==="short"?"bg-red-600 text-white":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => ro("short"),
                                children: "Short"
                            })]
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Family"
                        }), t.jsxs("div", {
                            className: "flex gap-px",
                            children: [t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${w==="stoch"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => it("stoch"),
                                children: "Stoch"
                            }), t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${w==="ewo"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => it("ewo"),
                                children: "EWO"
                            })]
                        })]
                    }), w === "stoch" && t.jsxs(t.Fragment, {
                        children: [t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Mode"
                            }), t.jsxs("select", {
                                className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground",
                                value: Z,
                                onChange: e => St(e.target.value),
                                children: [t.jsx("option", {
                                    value: "cross_out_of_band",
                                    children: "Cross Out of Band"
                                }), t.jsx("option", {
                                    value: "k_crosses_d_in_zone",
                                    children: "%K Crosses %D in Zone"
                                })]
                            })]
                        }), t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "%K"
                            }), t.jsx("input", {
                                type: "number",
                                min: 2,
                                max: 100,
                                value: Be,
                                onChange: e => Eo(parseInt(e.target.value) || 14),
                                className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                            })]
                        }), t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Smooth %K"
                            }), t.jsx("input", {
                                type: "number",
                                min: 1,
                                max: 20,
                                value: Pe,
                                onChange: e => Mo(parseInt(e.target.value) || 3),
                                className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                            })]
                        }), t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Smooth %D"
                            }), t.jsx("input", {
                                type: "number",
                                min: 1,
                                max: 20,
                                value: Ae,
                                onChange: e => Oo(parseInt(e.target.value) || 3),
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
                                max: 50,
                                value: Qe,
                                onChange: e => Io(parseInt(e.target.value) || 20),
                                className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[55px]"
                            })]
                        }), t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "OB"
                            }), t.jsx("input", {
                                type: "number",
                                min: 50,
                                max: 99,
                                value: Xe,
                                onChange: e => Lo(parseInt(e.target.value) || 80),
                                className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[55px]"
                            })]
                        })]
                    }), w === "ewo" && t.jsxs(t.Fragment, {
                        children: [t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Fast"
                            }), t.jsx("input", {
                                type: "number",
                                min: 2,
                                max: 200,
                                value: Ee,
                                onChange: e => Do(parseInt(e.target.value) || 5),
                                className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                            })]
                        }), t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Slow"
                            }), t.jsx("input", {
                                type: "number",
                                min: 4,
                                max: 400,
                                value: Me,
                                onChange: e => Fo(parseInt(e.target.value) || 34),
                                className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                            })]
                        }), t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Thresh % (0=zero)"
                            }), t.jsx("input", {
                                type: "number",
                                step: .05,
                                min: 0,
                                value: Oe,
                                onChange: e => Ko(parseFloat(e.target.value) || 0),
                                className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[80px]"
                            })]
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
                            value: +(G * 100).toFixed(4),
                            onChange: e => Ct((parseFloat(e.target.value) || 5) / 100),
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
                            min: 0,
                            value: R,
                            onChange: e => $t(parseInt(e.target.value) || 0),
                            className: "text-[11px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground w-[60px]"
                        })]
                    }), t.jsxs("div", {
                        className: "flex items-center gap-1",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "DATE RANGE"
                        }), t.jsx("div", {
                            className: "flex items-center gap-0.5",
                            children: go.map(e => t.jsx("button", {
                                "data-testid": `osc-eval-date-preset-${e.value}`,
                                className: `text-[9px] font-mono px-1.5 py-0.5 rounded ${to===e.value?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border hover:text-foreground"}`,
                                onClick: () => {
                                    Te(e.value), We(bo(e.value))
                                },
                                children: e.label
                            }, e.value))
                        }), t.jsx("input", {
                            type: "date",
                            "data-testid": "osc-eval-date-start",
                            value: D.start,
                            onChange: e => {
                                Te("custom"), We({
                                    ...D,
                                    start: e.target.value
                                })
                            },
                            className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                        }), t.jsx("span", {
                            className: "text-[10px] font-mono text-muted-foreground",
                            children: "→"
                        }), t.jsx("input", {
                            type: "date",
                            "data-testid": "osc-eval-date-end",
                            value: D.end,
                            onChange: e => {
                                Te("custom"), We({
                                    ...D,
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
                            "data-testid": "osc-eval-run",
                            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
                            onClick: qo,
                            disabled: Bt,
                            children: Bt ? "Evaluating…" : "Evaluate"
                        })]
                    })]
                })
            }), t.jsxs("div", {
                className: "flex-1 overflow-auto p-4 space-y-3",
                children: [t.jsx(yr, {
                    result: mt,
                    loading: Bt,
                    setupLabel: io,
                    tickerLabel: co
                }), mt && ft && mt.profiles.length >= 10 ? t.jsx(vo, {
                    ticker: ft.mode === "pair" ? ft.pairLegA || "" : _ || N[0]?.ticker || "",
                    priceContext: ft,
                    signals: mt.profiles,
                    direction: ce === "long" ? "buy" : "sell",
                    title: `Hit Conditions — ${io} on ${co}`,
                    useBand: !1
                }) : null]
            })]
        }) : t.jsxs(t.Fragment, {
            children: [t.jsx(br, {
                kind: "osc",
                captureInputs: Yo,
                applyInputs: Zo
            }), t.jsx("div", {
                className: "flex-shrink-0 px-4 py-3 border-b border-border bg-card",
                children: t.jsxs("div", {
                    className: "flex items-center gap-4 flex-wrap",
                    children: [t.jsxs("div", {
                        children: [t.jsxs("div", {
                            className: "flex items-center gap-2",
                            children: [t.jsx("h2", {
                                className: "text-sm font-bold text-foreground tracking-tight",
                                children: "Oscillators"
                            }), Vo && t.jsxs("span", {
                                className: "text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30",
                                children: [N.length, "/", V.length]
                            })]
                        }), t.jsxs("div", {
                            className: "flex items-center gap-2 mt-0.5",
                            children: [t.jsx("p", {
                                className: "text-[10px] text-muted-foreground",
                                children: "Slow Stochastic & Elliott Wave Oscillator parameter optimizer"
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
                            }), zt && t.jsxs("span", {
                                className: "text-[9px] font-mono text-muted-foreground",
                                children: ["Last fetched: ", Math.round((Date.now() - zt) / 6e4), "m ago"]
                            }), t.jsx("button", {
                                onClick: async () => {
                                    const e = _;
                                    if (e) {
                                        qt(!0);
                                        try {
                                            await ir(e), $o(Date.now())
                                        } catch {} finally {
                                            qt(!1)
                                        }
                                    }
                                },
                                disabled: Ut,
                                title: "Force refresh Yahoo price cache",
                                className: "text-[9px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50",
                                children: Ut ? "…" : "↻"
                            })]
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Indicator"
                        }), t.jsx("div", {
                            className: "flex gap-px",
                            children: ["stoch", "ewo"].map(e => t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${w===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => it(e),
                                disabled: E,
                                children: e === "stoch" ? "Slow Stoch" : "EWO"
                            }, e))
                        })]
                    }), w === "stoch" && t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Stoch Signal"
                        }), t.jsx("div", {
                            className: "flex gap-px",
                            children: ["cross_out_of_band", "k_crosses_d_in_zone"].map(e => t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${Z===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => St(e),
                                disabled: E,
                                children: e === "cross_out_of_band" ? "Exit Band" : "K×D in Zone"
                            }, e))
                        })]
                    }), w === "ewo" && t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            title: "EWO display unit. Raw shows price-units (SMA(fast) − SMA(slow)). % shows EWO normalized as a percent of the slow MA — comparable across tickers.",
                            children: "EWO Display"
                        }), t.jsx("div", {
                            className: "flex gap-px",
                            children: ["raw", "pct"].map(e => t.jsx("button", {
                                "data-testid": `ewo-display-${e}`,
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${Se===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => Zt(e),
                                children: e === "raw" ? "Raw" : "% of Slow MA"
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
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${a===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => ct(e),
                                disabled: E,
                                "data-testid": `optimizer-mode-${e}`,
                                children: e === "single" ? "Single Ticker" : e === "universe" ? "Universe" : e === "pair" ? "Pair (A/B)" : e === "pairCombo" ? "Pair Combo" : "Basket"
                            }, e))
                        })]
                    }), a !== "pair" && zo, t.jsxs("div", {
                        className: "flex items-center gap-1",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "DATE RANGE"
                        }), t.jsx("div", {
                            className: "flex items-center gap-0.5",
                            children: go.map(e => t.jsx("button", {
                                "data-testid": `osc-date-preset-${e.value}`,
                                className: `text-[9px] font-mono px-1.5 py-0.5 rounded ${to===e.value?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border hover:text-foreground"}`,
                                onClick: () => {
                                    Te(e.value), We(bo(e.value))
                                },
                                children: e.label
                            }, e.value))
                        }), t.jsx("input", {
                            type: "date",
                            "data-testid": "osc-date-start",
                            value: D.start,
                            onChange: e => {
                                Te("custom"), We({
                                    ...D,
                                    start: e.target.value
                                })
                            },
                            className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                        }), t.jsx("span", {
                            className: "text-[10px] font-mono text-muted-foreground",
                            children: "→"
                        }), t.jsx("input", {
                            type: "date",
                            "data-testid": "osc-date-end",
                            value: D.end,
                            onChange: e => {
                                Te("custom"), We({
                                    ...D,
                                    end: e.target.value
                                })
                            },
                            className: "text-[10px] font-mono bg-background border border-border rounded px-1 py-0.5"
                        })]
                    }), a === "universe" && gt.classFilterUI && t.jsxs("div", {
                        className: "flex flex-col gap-1 w-full",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Classification Filter"
                        }), gt.universeSourceUI, gt.classFilterUI]
                    }), a === "single" && t.jsxs("div", {
                        className: "flex items-end gap-2",
                        children: [t.jsx("div", {
                            className: kt(_) ? "opacity-40 pointer-events-none" : "",
                            children: t.jsx(Ue, {
                                tickers: N,
                                value: kt(_) ? "" : _,
                                onChange: Ne,
                                disabled: E,
                                label: "Ticker"
                            })
                        }), t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Basket"
                            }), t.jsx(jo, {
                                activeTicker: _,
                                onSelectTicker: Ne,
                                fallbackTicker: N[0]?.ticker ?? null
                            })]
                        })]
                    }), a === "pair" && t.jsxs("div", {
                        className: "flex items-end gap-2",
                        children: [t.jsx(Ue, {
                            tickers: N,
                            value: v,
                            onChange: dt,
                            disabled: E,
                            label: "A"
                        }), t.jsx(Ue, {
                            tickers: N,
                            value: j,
                            onChange: ut,
                            disabled: E,
                            label: "B"
                        }), t.jsxs("span", {
                            className: "text-[10px] font-mono text-muted-foreground pb-1",
                            title: "Stochastic uses high=low=close on the ratio (close-only stochastic).",
                            children: ["Ratio: ", t.jsxs("span", {
                                className: "text-foreground font-bold",
                                children: [v || "A", "/", j || "B"]
                            })]
                        })]
                    }), a === "pairCombo" && t.jsxs("div", {
                        className: "flex flex-col gap-1 w-full",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Pair Combo — Leg Set"
                        }), bt.ui]
                    }), a === "basket" && t.jsxs("div", {
                        className: "flex flex-col gap-2",
                        children: [t.jsx(wr, {
                            tickers: N,
                            value: me,
                            onChange: Gt,
                            disabled: E,
                            testIdPrefix: "osc-basket"
                        }), t.jsxs("div", {
                            className: "flex flex-col gap-0.5",
                            children: [t.jsx("label", {
                                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                                children: "Basket Run Mode"
                            }), t.jsx("div", {
                                className: "flex gap-px",
                                "data-testid": "osc-basket-mode",
                                children: ["stocks", "combined"].map(e => t.jsx("button", {
                                    "data-testid": `osc-basket-mode-${e}`,
                                    className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${pt===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                    onClick: () => To(e),
                                    disabled: E,
                                    title: e === "stocks" ? "Run optimizer on each basket constituent separately" : "Run optimizer on a single synthetic series using the basket's weighting scheme",
                                    children: e === "stocks" ? "Stock by Stock" : "Combined"
                                }, e))
                            })]
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Return Measure"
                        }), t.jsx("div", {
                            className: "flex gap-px",
                            children: ["threshold", "band"].map(e => t.jsx("button", {
                                className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${O===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                                onClick: () => Yt(e),
                                disabled: E,
                                children: e === "threshold" ? "Threshold" : "Band"
                            }, e))
                        })]
                    }), O === "threshold" ? t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Target"
                        }), t.jsx("select", {
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px]",
                            value: G,
                            onChange: e => Ct(Number(e.target.value)),
                            disabled: E,
                            children: cr.map(e => t.jsx("option", {
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
                                value: `${oe}-${re}`,
                                onChange: e => {
                                    const [s, l] = e.target.value.split("-").map(Number);
                                    _t(s), Rt(l)
                                },
                                disabled: E,
                                children: dr.map(e => t.jsx("option", {
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
                                value: Math.round(oe * 100),
                                onChange: e => _t(Number(e.target.value) / 100),
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
                                value: Math.round(re * 100),
                                onChange: e => Rt(Number(e.target.value) / 100),
                                disabled: E
                            })]
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            title: "Minimum holding period in trading days. After a signal fires, suppress new signals for N bars and require the position be held N days before counting hits/peaks/troughs. 0 = off.",
                            children: "Min Hold"
                        }), t.jsx("input", {
                            type: "number",
                            step: "1",
                            min: "0",
                            max: "126",
                            "data-testid": "min-hold",
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14",
                            value: R,
                            onChange: e => $t(Math.max(0, Math.min(126, Math.floor(Number(e.target.value) || 0)))),
                            disabled: E,
                            title: "Trading days. Forces hold for at least N days before counting hits and before allowing a new signal."
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: " "
                        }), E ? t.jsxs("button", {
                            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500",
                            onClick: () => {
                                Re.current = !0, et.current?.terminate(), et.current = null, se(!1)
                            },
                            children: ["Cancel (", Ce.current, "/", Ce.total, ")"]
                        }) : t.jsx("button", {
                            className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90",
                            onClick: Uo,
                            children: "Run Optimizer"
                        })]
                    })]
                })
            }), t.jsxs("div", {
                className: "flex-1 overflow-auto px-4 py-3",
                children: [fe.length === 0 && !E && t.jsx("div", {
                    className: "flex items-center justify-center h-full text-muted-foreground text-sm",
                    children: w === "stoch" ? "Slow Stochastic optimizer — sweeps K period × smoothK × smoothD × OS × OB; measures forward returns from each signal entry" : "Elliott Wave Oscillator optimizer — sweeps fast/slow lengths × threshold; measures forward returns from each zero-cross or threshold-cross"
                }), E && fe.length === 0 && t.jsx("div", {
                    className: "flex items-center justify-center h-full",
                    children: t.jsxs("div", {
                        className: "text-center",
                        children: [t.jsxs("div", {
                            className: "text-sm text-muted-foreground mb-2",
                            children: ["Computing ", w === "stoch" ? "Slow Stochastic" : "EWO", " signals..."]
                        }), t.jsxs("div", {
                            className: "text-xs font-mono text-muted-foreground",
                            children: [Ce.current, "/", Ce.total, " tickers × ", er, " configs"]
                        }), t.jsx("div", {
                            className: "w-48 h-1 bg-border rounded-full mt-2 mx-auto overflow-hidden",
                            children: t.jsx("div", {
                                className: "h-full bg-primary rounded-full transition-all duration-300",
                                style: {
                                    width: `${Ce.total>0?Ce.current/Ce.total*100:0}%`
                                }
                            })
                        })]
                    })
                }), fe.length > 0 && t.jsxs("div", {
                    children: [t.jsxs("div", {
                        className: "flex items-center justify-between mb-2 gap-2 flex-wrap",
                        children: [t.jsxs("h3", {
                            className: "text-xs font-bold text-foreground uppercase tracking-wider",
                            children: [Mt.length, Ge ? ` of ${fe.length}` : "", " tickers — ", w === "stoch" ? `Stoch (${Z==="cross_out_of_band"?"Exit Band":"K×D"})` : "EWO", " — ", O === "band" ? `band ${ze(oe)}–${ze(re)}` : `target ${ze(G)}`, R > 0 ? ` — min hold ${R}d` : ""]
                        }), t.jsxs("div", {
                            className: "flex items-center gap-1",
                            children: [t.jsx("input", {
                                type: "text",
                                placeholder: "Filter ticker / name…",
                                value: Ge,
                                onChange: e => eo(e.target.value),
                                "data-testid": "input-results-filter",
                                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[160px] focus:outline-none focus:ring-1 focus:ring-primary"
                            }), Ge && t.jsx("button", {
                                onClick: () => eo(""),
                                "data-testid": "button-clear-results-filter",
                                className: "text-[10px] font-mono px-2 py-1 rounded border border-border bg-background text-muted-foreground hover:text-foreground",
                                children: "Clear"
                            }), ["score", "value", "signal", "ticker"].map(e => t.jsx("button", {
                                className: `text-[9px] font-mono px-2 py-0.5 rounded ${_e===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border"}`,
                                onClick: () => Qt(e),
                                children: e === "score" ? "Score" : e === "value" ? Ot : e === "signal" ? "Signal" : "Ticker"
                            }, e)), t.jsxs("div", {
                                className: "flex items-center gap-1",
                                children: [t.jsx("label", {
                                    className: "text-[10px] font-mono text-muted-foreground",
                                    children: "RANK BY"
                                }), t.jsx("select", {
                                    "data-testid": "osc-rank-by",
                                    value: Wt,
                                    onChange: e => Ao(e.target.value),
                                    className: "text-[10px] font-mono bg-background border border-border rounded px-1.5 py-0.5",
                                    children: ur.map(e => t.jsx("option", {
                                        value: e.value,
                                        children: e.label
                                    }, e.value))
                                })]
                            }), t.jsx(pr, {
                                variant: "outline",
                                size: "sm",
                                className: "h-6 gap-1 text-[11px]",
                                onClick: Go,
                                "data-testid": "export-csv",
                                children: t.jsx(xr, {
                                    className: "w-3 h-3"
                                })
                            })]
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
                                        children: Ot
                                    }), t.jsx("th", {
                                        className: "text-center px-2 py-1 font-bold",
                                        children: "Current Signal"
                                    }), t.jsx("th", {
                                        className: "text-center px-2 py-1 font-bold",
                                        children: "Best Config"
                                    }), t.jsx("th", {
                                        className: "text-center px-2 py-1 font-bold",
                                        children: "Best Side"
                                    }), je.filter((e, s) => s >= 2).map(e => t.jsxs("th", {
                                        className: "text-center px-2 py-1 font-bold",
                                        children: [O === "band" ? "Band" : "Hit", " ", e.label]
                                    }, e.label)), je.filter((e, s) => s >= 2).map(e => t.jsxs("th", {
                                        className: "text-center px-2 py-1 font-bold",
                                        children: ["Avg ", e.label]
                                    }, `avg-${e.label}`)), je.filter((e, s) => s >= 2).map(e => t.jsxs("th", {
                                        className: "text-center px-2 py-1 font-bold",
                                        children: ["PF ", e.label]
                                    }, `pf-${e.label}`)), t.jsx("th", {
                                        className: "text-center px-2 py-1 font-bold",
                                        children: "Score"
                                    })]
                                })
                            }), t.jsx("tbody", {
                                children: Mt.map(e => {
                                    const s = Ze === e.ticker,
                                        l = e.configs.reduce((o, r) => o.bestScore > r.bestScore ? o : r, e.configs[0]),
                                        n = l?.categories.reduce((o, r) => o.composite.score > r.composite.score ? o : r, l.categories[0])?.summary;
                                    return t.jsxs("tr", {
                                        className: `${s?"bg-primary/10":"hover:bg-white/5"} cursor-pointer`,
                                        onClick: () => Jt(s ? null : e.ticker),
                                        children: [t.jsx("td", {
                                            className: "px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border",
                                            children: e.ticker
                                        }), t.jsx("td", {
                                            className: `text-center px-2 py-1 font-bold ${Jo(e.currentValue)} whitespace-nowrap`,
                                            children: po(e)
                                        }), t.jsx("td", {
                                            className: "text-center px-2 py-1",
                                            children: t.jsx("span", {
                                                className: `inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${uo(e.currentSignal)}`,
                                                children: e.currentSignal
                                            })
                                        }), t.jsx("td", {
                                            className: "text-center px-2 py-1 text-muted-foreground",
                                            children: l?.configLabel
                                        }), t.jsx("td", {
                                            className: "text-center px-2 py-1 text-primary font-bold",
                                            children: e.bestCategory
                                        }), je.filter((o, r) => r >= 2).map(o => {
                                            const r = n ? O === "band" ? n.bandHitRate?.[o.label] ?? n.hitRate[o.label] : n.hitRate[o.label] : 0;
                                            return t.jsx("td", {
                                                className: `text-center px-2 py-1 ${n?Dt(r):""}`,
                                                children: n ? ze(r) : "–"
                                            }, o.label)
                                        }), je.filter((o, r) => r >= 2).map(o => t.jsx("td", {
                                            className: `text-center px-2 py-1 ${n?n.avgReturn[o.label]>=0?"text-green-400":"text-red-400":""}`,
                                            children: n ? lt(n.avgReturn[o.label]) : "–"
                                        }, `avg-${o.label}`)), je.filter((o, r) => r >= 2).map(o => t.jsx("td", {
                                            className: `text-center px-2 py-1 ${n?ho(n.profitFactor[o.label]):""}`,
                                            children: n ? n.profitFactor[o.label] >= 99 ? "∞" : n.profitFactor[o.label].toFixed(2) : "–"
                                        }, `pf-${o.label}`)), t.jsx("td", {
                                            className: "text-center px-2 py-1",
                                            children: t.jsx("span", {
                                                className: "inline-block px-1.5 py-0.5 rounded font-bold",
                                                style: {
                                                    backgroundColor: ko(e.bestScore),
                                                    color: yo(e.bestScore)
                                                },
                                                children: e.bestScore
                                            })
                                        })]
                                    }, e.ticker)
                                })
                            })]
                        })
                    }), Ze && (() => {
                        const e = yt.find(l => l.ticker === Ze);
                        if (!e) return null;
                        const s = [...e.configs].sort((l, p) => p.bestScore - l.bestScore);
                        return t.jsxs("div", {
                            className: "border border-border rounded p-3 bg-card/50 mb-4",
                            children: [t.jsxs("h4", {
                                className: "text-xs font-bold text-foreground mb-1",
                                children: [e.ticker, " — ", e.name, " — ", Ot, " ", po(e)]
                            }), t.jsxs("p", {
                                className: "text-[9px] text-muted-foreground mb-3",
                                children: [s.length, " configurations tested — showing top results"]
                            }), t.jsx("div", {
                                className: "grid grid-cols-1 lg:grid-cols-2 gap-3",
                                children: s.slice(0, 6).map((l, p) => {
                                    const n = l.categories.reduce((o, r) => o.composite.score > r.composite.score ? o : r, l.categories[0]);
                                    return t.jsxs("div", {
                                        className: "border border-border/50 rounded p-2",
                                        children: [t.jsxs("div", {
                                            className: "flex items-center gap-2 mb-1",
                                            children: [t.jsx("span", {
                                                className: "text-[10px] font-mono font-bold text-foreground",
                                                children: l.configLabel
                                            }), t.jsxs("span", {
                                                className: "text-[9px] text-muted-foreground",
                                                children: ["→ ", n.label]
                                            }), t.jsx("span", {
                                                className: "ml-auto inline-block px-1.5 py-0.5 rounded text-[9px] font-bold",
                                                style: {
                                                    backgroundColor: ko(l.bestScore),
                                                    color: yo(l.bestScore)
                                                },
                                                children: l.bestScore
                                            })]
                                        }), l.categories.filter(o => o.summary.count > 0).sort((o, r) => r.composite.score - o.composite.score).map(o => {
                                            const r = `${e.ticker}::${l.configLabel}::${o.category}`,
                                                g = Wo.has(r),
                                                u = !!(o.profiles && o.profiles.length >= 10 && e.priceContext);
                                            return t.jsxs("div", {
                                                className: "mt-1",
                                                children: [t.jsxs("div", {
                                                    className: "flex items-center gap-1 mb-0.5",
                                                    children: [t.jsx("span", {
                                                        className: `text-[9px] font-bold ${uo(o.label).split(" ").filter(i=>i.startsWith("text-")).join(" ")}`,
                                                        children: o.label
                                                    }), t.jsxs("span", {
                                                        className: "text-[8px] text-muted-foreground",
                                                        children: [o.summary.count, " signals"]
                                                    }), u ? t.jsxs("button", {
                                                        type: "button",
                                                        onClick: () => Po(r),
                                                        className: `ml-auto px-1.5 py-0.5 rounded text-[8px] font-bold border ${g?"bg-violet-500/25 text-violet-200 border-violet-400/40":"bg-card/40 text-muted-foreground border-border/50 hover:bg-violet-500/15 hover:text-violet-300"}`,
                                                        title: "Profile what other indicators looked like at hit-bars vs miss-bars",
                                                        children: [g ? "▾" : "▸", " Hit Conditions"]
                                                    }) : null]
                                                }), t.jsxs("table", {
                                                    className: "w-full text-[9px] font-mono",
                                                    children: [t.jsx("thead", {
                                                        children: t.jsxs("tr", {
                                                            className: "text-muted-foreground",
                                                            children: [t.jsx("th", {
                                                                className: "text-left px-1 py-0.5",
                                                                children: "Hz"
                                                            }), t.jsx("th", {
                                                                className: "text-center px-1 py-0.5",
                                                                children: "Hit"
                                                            }), t.jsx("th", {
                                                                className: "text-center px-1 py-0.5",
                                                                children: "Win"
                                                            }), t.jsx("th", {
                                                                className: "text-center px-1 py-0.5",
                                                                children: "Avg"
                                                            }), t.jsx("th", {
                                                                className: "text-center px-1 py-0.5",
                                                                children: "Med"
                                                            }), t.jsx("th", {
                                                                className: "text-center px-1 py-0.5",
                                                                children: "Peak"
                                                            }), t.jsx("th", {
                                                                className: "text-center px-1 py-0.5",
                                                                children: "Trough"
                                                            }), t.jsx("th", {
                                                                className: "text-center px-1 py-0.5",
                                                                children: "PF"
                                                            })]
                                                        })
                                                    }), t.jsx("tbody", {
                                                        children: je.map(i => t.jsxs("tr", {
                                                            children: [t.jsx("td", {
                                                                className: "px-1 py-0.5 text-foreground font-bold",
                                                                children: i.label
                                                            }), t.jsx("td", {
                                                                className: `text-center px-1 py-0.5 ${Dt(o.summary.hitRate[i.label])}`,
                                                                children: ze(o.summary.hitRate[i.label])
                                                            }), t.jsx("td", {
                                                                className: `text-center px-1 py-0.5 ${Dt(o.summary.winRate[i.label])}`,
                                                                children: ze(o.summary.winRate[i.label])
                                                            }), t.jsx("td", {
                                                                className: `text-center px-1 py-0.5 ${o.summary.avgReturn[i.label]>=0?"text-green-400":"text-red-400"}`,
                                                                children: lt(o.summary.avgReturn[i.label])
                                                            }), t.jsx("td", {
                                                                className: `text-center px-1 py-0.5 ${o.summary.medianReturn[i.label]>=0?"text-green-400":"text-red-400"}`,
                                                                children: lt(o.summary.medianReturn[i.label])
                                                            }), t.jsx("td", {
                                                                className: "text-center px-1 py-0.5 text-green-400",
                                                                children: lt(o.summary.avgPeak[i.label])
                                                            }), t.jsx("td", {
                                                                className: "text-center px-1 py-0.5 text-red-400",
                                                                children: lt(o.summary.avgTrough[i.label])
                                                            }), t.jsx("td", {
                                                                className: `text-center px-1 py-0.5 ${ho(o.summary.profitFactor[i.label])}`,
                                                                children: o.summary.profitFactor[i.label] >= 99 ? "∞" : o.summary.profitFactor[i.label].toFixed(2)
                                                            })]
                                                        }, i.label))
                                                    })]
                                                }), g && e.priceContext && o.profiles ? t.jsx("div", {
                                                    className: "mt-2",
                                                    children: t.jsx(vo, {
                                                        ticker: e.priceContext.mode === "pair" && e.priceContext.pairLegA || e.ticker,
                                                        priceContext: e.priceContext,
                                                        signals: o.profiles,
                                                        direction: o.category,
                                                        title: `${l.configLabel} — ${o.label}`,
                                                        useBand: O === "band"
                                                    })
                                                }) : null]
                                            }, o.category)
                                        })]
                                    }, p)
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
    Hr as
    default
};