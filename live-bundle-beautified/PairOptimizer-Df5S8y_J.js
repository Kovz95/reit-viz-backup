import {
    r as u,
    ag as Nt,
    a as kt,
    d2 as ot,
    af as St,
    bB as at,
    bA as vt,
    cI as wt,
    cL as Rt,
    d0 as Mt,
    d1 as je,
    c_ as Ne,
    c$ as ke,
    ae as Bt,
    g as At,
    j as t,
    cQ as $t,
    cR as Ct,
    cU as D,
    B as Pt,
    z as Ft,
    cW as Y,
    cX as ue,
    cZ as Ie,
    cT as Tt,
    cS as zt,
    cY as X
} from "./index-CsG73Aq_.js";
import {
    u as Lt
} from "./useOptimizerClassFilter-COCFGQs0.js";
import {
    u as Et,
    i as Ht
} from "./useFrequency-DK9YJz0p.js";
import "./globalUniverse-DuqPcp2u.js";

function It(i, R) {
    const m = new Array(i.length).fill(null);
    for (let c = 1; c < i.length; c++) {
        const x = Math.max(0, c - R),
            k = c - x;
        if (k < 2) continue;
        let g = 0,
            N = 0;
        for (let l = x; l < c; l++) g += i[l], N += i[l] * i[l];
        const b = g / k,
            $ = N / k - b * b,
            S = Math.sqrt(Math.max(0, $));
        S > 0 && (m[c] = (i[c] - b) / S)
    }
    return m
}

function _t(i) {
    if (i.length < 20) return 1 / 0;
    const R = i.length - 1;
    let m = 0,
        c = 0,
        x = 0,
        k = 0;
    for (let N = 1; N <= R; N++) {
        const b = i[N - 1],
            $ = i[N] - i[N - 1];
        m += b, c += $, x += b * $, k += b * b
    }
    const g = (R * x - m * c) / (R * k - m * m);
    return g >= 0 ? 1 / 0 : -Math.log(2) / Math.log(1 + g)
}

function Ot(i) {
    if (i.length < 20) return .5;
    const R = [];
    for (let l = 1; l < i.length; l++) R.push(i[l] - i[l - 1]);
    const m = [8, 16, 32, 64, 128].filter(l => l <= R.length / 2);
    if (m.length < 2) return .5;
    const c = [],
        x = [];
    for (const l of m) {
        const h = Math.floor(R.length / l);
        if (h === 0) continue;
        let C = 0;
        for (let M = 0; M < h; M++) {
            const w = R.slice(M * l, (M + 1) * l),
                te = w.reduce((A, G) => A + G, 0) / w.length,
                v = [];
            let re = 0;
            for (const A of w) re += A - te, v.push(re);
            const F = Math.max(...v) - Math.min(...v),
                se = Math.sqrt(w.reduce((A, G) => A + (G - te) ** 2, 0) / w.length);
            C += se > 0 ? F / se : 0
        }
        const f = C / h;
        f > 0 && (c.push(Math.log(l)), x.push(Math.log(f)))
    }
    if (c.length < 2) return .5;
    const k = c.length,
        g = c.reduce((l, h) => l + h, 0),
        N = x.reduce((l, h) => l + h, 0),
        b = c.reduce((l, h, C) => l + h * x[C], 0),
        $ = c.reduce((l, h) => l + h * h, 0),
        S = (k * b - g * N) / (k * $ - g * g);
    return Math.max(0, Math.min(1, S))
}

function Dt(i) {
    if (i.length < 30) return 1;
    const R = i.length,
        m = [];
    for (let f = 1; f < R; f++) m.push(i[f] - i[f - 1]);
    const c = m.length;
    let x = 0,
        k = 0,
        g = 0,
        N = 0;
    for (let f = 0; f < c; f++) {
        const M = i[f],
            w = m[f];
        x += M, k += w, g += M * w, N += M * M
    }
    const b = (c * g - x * k) / (c * N - x * x),
        $ = k / c,
        S = x / c;
    let l = 0;
    for (let f = 0; f < c; f++) {
        const M = $ + b * (i[f] - S);
        l += (m[f] - M) ** 2
    }
    const h = Math.sqrt(l / (c - 2)) / Math.sqrt(N / c - S ** 2),
        C = h > 0 ? b / (h / Math.sqrt(c)) : 0;
    return C < -3.43 ? .01 : C < -2.86 ? .05 : C < -2.57 ? .1 : C < -1.94 ? .2 : .5
}
const Xt = [21, 42, 63, 126, 189, 252, 504],
    _e = [{
        key: "economy",
        label: "Economy"
    }, {
        key: "sector",
        label: "Sector"
    }, {
        key: "subsector",
        label: "Sub-Sector"
    }, {
        key: "industryGroup",
        label: "Industry Group"
    }, {
        key: "industry",
        label: "Industry"
    }, {
        key: "subindustry",
        label: "Sub-Industry"
    }];

function Zt() {
    const [i, R] = u.useState([]), [m, c] = u.useState("P/FFO LTM"), [x, k] = u.useState("threshold"), [g, N] = u.useState(.05), [b, $] = u.useState(.05), [S, l] = u.useState(.1), [h, C] = u.useState(-2), [f, M] = u.useState(2), [w, te] = u.useState("breakout"), [v, re] = u.useState("scan"), [F, se] = u.useState("subsector"), [A, G] = u.useState("ratio"), [Z, Se] = u.useState(""), [V, ve] = u.useState(""), [y, Oe] = u.useState(!1), {
        frequency: ne,
        setFrequency: De,
        frequencyUI: ct
    } = Et("pair", "daily", y), [H, xe] = u.useState({
        current: 0,
        total: 0,
        label: ""
    }), [q, le] = Nt("pair:results", []), [oe, Xe] = u.useState(null), [K, qe] = u.useState("score"), we = u.useRef(!1), Re = u.useRef(!1), {
        universeTickers: Me,
        isFiltered: it
    } = kt(), Ue = u.useMemo(() => Me ? i.filter(e => Me.has(e.ticker)) : i, [i, Me]), ae = Lt(Ue, v === "scan", "pair-opt-clf"), ce = v === "scan" ? ae.filteredTickers : Ue, [dt, ut] = u.useState(ot);
    u.useEffect(() => {
        St().then(e => {
            if (R(e), e.length > 0 && !Re.current && (Se(e[0].ticker), ve(e.length > 1 ? e[1].ticker : e[0].ticker)), e.length > 0 && e[0].metrics) {
                const r = e[0].metrics.map(p => typeof p == "string" ? p : p.name || p),
                    o = ot.filter(p => r.includes(p));
                o.length > 0 && ut(o)
            }
        })
    }, []);
    const Be = u.useCallback(async (e, r, o, p, a, n, d, B, T = "ratio", pe = "breakout", We = "daily") => {
            const U = pe;
            try {
                const [Ye, Ge] = await Promise.all([at(e), at(r)]), Ze = vt(o), Ve = wt(o), Ke = Ye[o], Qe = Ge[o], Je = Ye.close, et = Ge.close;
                if (!Ke?.length || !Qe?.length || !Je?.length || !et?.length) return null;
                const fe = new Map;
                for (const [s, j] of Ke) fe.set(s, j * Ze * Ve);
                const ie = new Map;
                for (const [s, j] of Qe) ie.set(s, j * Ze * Ve);
                const Q = new Map;
                for (const [s, j] of Je) Q.set(s, j);
                const J = new Map;
                for (const [s, j] of et) J.set(s, j);
                const P = [];
                for (let s = 0; s < p.length; s++)
                    if (fe.has(s) && ie.has(s) && Q.has(s) && J.has(s)) {
                        if (T === "ratio") {
                            const j = ie.get(s);
                            if (!Number.isFinite(j) || j <= 0) continue
                        }
                        P.push(s)
                    } if (P.length < 100) return null;
                const de = T === "ratio" ? P.map(s => fe.get(s) / ie.get(s)) : P.map(s => fe.get(s) - ie.get(s)),
                    qt = P.map(s => (Q.get(s) / Q.get(P[0]) + J.get(s) / J.get(P[0])) / 2),
                    be = P.map(s => Q.get(s) / Q.get(P[0]) - J.get(s) / J.get(P[0]) + 1),
                    bt = We === "weekly" ? "weekly" : "daily",
                    ht = P.map(s => p[s]);
                let I, he;
                if (bt === "weekly") {
                    const s = Rt({
                        dates: ht,
                        closes: de,
                        adjCloses: de
                    }, "weekly");
                    if (s.closes.length < 30) return null;
                    if (We === "weekly_on_daily") {
                        const j = new Array(de.length);
                        let L = 0;
                        for (let E = 0; E < de.length; E++) {
                            for (; L + 1 < s.dailyIndexMap.length && s.dailyIndexMap[L + 1] <= E;) L++;
                            j[E] = s.closes[L]
                        }
                        I = j, he = E => E
                    } else I = s.closes, he = j => Mt(j, s)
                } else I = de, he = s => s;
                const gt = _t(I),
                    tt = Ot(I),
                    rt = Dt(I);
                let z = null,
                    st = -1;
                for (const s of Xt) {
                    if (s > I.length * .8) continue;
                    const j = It(I, s),
                        L = U === "breakout" || U === "both",
                        E = U === "reversion" || U === "both",
                        nt = [],
                        lt = [],
                        Ae = [],
                        $e = [];
                    let W = null;
                    for (let ee = 0; ee < j.length; ee++) {
                        const _ = j[ee];
                        if (_ === null) {
                            W = null;
                            continue
                        }
                        if (W !== null) {
                            const O = he(ee);
                            L && W >= n && _ < n && O >= 0 && nt.push(je(be, O, a, "buy", B)), L && W <= d && _ > d && O >= 0 && lt.push(je(be, O, a, "sell", B)), E && W < n && _ >= n && O >= 0 && Ae.push(je(be, O, a, "buy", B)), E && W > d && _ <= d && O >= 0 && $e.push(je(be, O, a, "sell", B))
                        }
                        W = _
                    }
                    const Ce = Ne(L ? nt : Ae, "buy"),
                        Pe = Ne(L ? lt : $e, "sell"),
                        Fe = U === "both" ? Ne(Ae, "buy") : void 0,
                        Te = U === "both" ? Ne($e, "sell") : void 0,
                        ge = B !== null,
                        ze = ke(Ce, "buy", ge),
                        Le = ke(Pe, "sell", ge);
                    let ye = ((Ce?.count ?? 0) > 0 ? 1 : 0) + ((Pe?.count ?? 0) > 0 ? 1 : 0),
                        Ee = ze.score + Le.score;
                    if (U === "both") {
                        const ee = ke(Fe, "buy", ge),
                            _ = ke(Te, "sell", ge);
                        (Fe?.count ?? 0) > 0 && (ye++, Ee += ee.score), (Te?.count ?? 0) > 0 && (ye++, Ee += _.score)
                    }
                    const yt = ye > 0 ? Ee / ye : 0,
                        jt = (tt < .45 ? 1.15 : 1) * (rt <= .05 ? 1.1 : 1),
                        He = Math.min(100, yt * jt);
                    He > st && (st = He, z = {
                        window: s,
                        buySummary: Ce,
                        sellSummary: Pe,
                        compositeScore: Math.round(He),
                        bestHorizon: ze.score >= Le.score ? ze.bestHorizon : Le.bestHorizon,
                        buyRevSummary: Fe,
                        sellRevSummary: Te
                    })
                }
                return z ? {
                    tickerA: e,
                    tickerB: r,
                    metric: o,
                    halfLife: Math.round(gt * 10) / 10,
                    adfPValue: rt,
                    hurstExponent: Math.round(tt * 1e3) / 1e3,
                    bestWindow: z.window,
                    buySummary: z.buySummary,
                    sellSummary: z.sellSummary,
                    compositeScore: z.compositeScore,
                    bestHorizon: z.bestHorizon,
                    buyRevSummary: z.buyRevSummary,
                    sellRevSummary: z.sellRevSummary
                } : null
            } catch {
                return null
            }
        }, []),
        xt = u.useCallback(async () => {
            Oe(!0), le([]), we.current = !1;
            const e = await Bt();
            if (v === "manual") {
                xe({
                    current: 0,
                    total: 1,
                    label: `${Z}/${V}`
                });
                const o = await Be(Z, V, m, e, g, h, f, x === "band" ? {
                    minReturn: b,
                    maxReturn: S
                } : null, A, w, ne);
                o && le([o]), xe({
                    current: 1,
                    total: 1,
                    label: ""
                })
            } else {
                const r = new Map;
                for (const a of ce) {
                    const n = a[F] || "Other";
                    r.has(n) || r.set(n, []), r.get(n).push(a)
                }
                const o = [];
                for (const [, a] of r)
                    if (!(a.length < 2))
                        for (let n = 0; n < a.length; n++)
                            for (let d = n + 1; d < a.length; d++) o.push([a[n].ticker, a[d].ticker]);
                xe({
                    current: 0,
                    total: o.length,
                    label: "Scanning pairs..."
                });
                const p = [];
                for (let a = 0; a < o.length && !we.current; a++) {
                    const [n, d] = o[a];
                    xe({
                        current: a + 1,
                        total: o.length,
                        label: `${n}/${d}`
                    });
                    const T = await Be(n, d, m, e, g, h, f, x === "band" ? {
                        minReturn: b,
                        maxReturn: S
                    } : null, A, w, ne);
                    T && T.compositeScore > 0 && p.push(T), (a % 10 === 0 || a === o.length - 1) && le([...p])
                }
                le(p)
            }
            Oe(!1)
        }, [ce, Z, V, m, v, F, A, g, h, f, w, x, b, S, ne, Be]),
        mt = u.useCallback(() => ({
            selectedMetric: m,
            targetReturn: g,
            buyThreshold: h,
            sellThreshold: f,
            signalType: w,
            mode: v,
            groupBy: F,
            spreadMethod: A,
            tickerA: Z,
            tickerB: V,
            results: q,
            expandedPair: oe,
            sortBy: K,
            returnMode: x,
            bandMin: b,
            bandMax: S,
            frequency: ne
        }), [m, g, h, f, w, v, F, A, Z, V, q, oe, K, x, b, S, ne]),
        pt = u.useCallback(e => {
            e && (e.selectedMetric && c(e.selectedMetric), typeof e.targetReturn == "number" && N(e.targetReturn), typeof e.buyThreshold == "number" && C(e.buyThreshold), typeof e.sellThreshold == "number" && M(e.sellThreshold), e.signalType && te(e.signalType), e.mode && re(e.mode), e.groupBy && se(e.groupBy), e.spreadMethod && G(e.spreadMethod), e.returnMode && k(e.returnMode), typeof e.bandMin == "number" && $(e.bandMin), typeof e.bandMax == "number" && l(e.bandMax), e.tickerA && (Se(e.tickerA), Re.current = !0), e.tickerB && (ve(e.tickerB), Re.current = !0), Array.isArray(e.results) && le(e.results), e.expandedPair !== void 0 && Xe(e.expandedPair), e.sortBy && qe(e.sortBy), Ht(e.frequency) && De(e.frequency))
        }, [De]);
    At("pair-optimizer", mt, pt);
    const me = u.useMemo(() => {
            const e = [...q];
            return K === "score" ? e.sort((r, o) => o.compositeScore - r.compositeScore) : K === "halfLife" ? e.sort((r, o) => r.halfLife - o.halfLife) : e.sort((r, o) => r.hurstExponent - o.hurstExponent), e
        }, [q, K]),
        ft = () => {
            const e = Y.filter((n, d) => d >= 2),
                r = me.map(n => {
                    const d = {
                        tickerA: n.tickerA,
                        tickerB: n.tickerB,
                        metric: n.metric,
                        halfLife: n.halfLife,
                        adfPValue: n.adfPValue,
                        hurstExponent: n.hurstExponent,
                        bestWindow: n.bestWindow,
                        compositeScore: n.compositeScore
                    };
                    return e.forEach(B => {
                        d[`buy_hitRate_${B.label}`] = n.buySummary?.hitRate[B.label] ?? null, d[`sell_hitRate_${B.label}`] = n.sellSummary?.hitRate[B.label] ?? null
                    }), d
                }),
                o = Object.keys(r[0] || {}),
                p = [o.join(","), ...r.map(n => o.map(d => `"${String(n[d]??"").replace(/"/g,'""')}"`).join(","))].join(`
`),
                a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([p], {
                type: "text/csv"
            })), a.download = `pair_optimizer_${m.replace(/[^a-zA-Z0-9]/g,"_")}.csv`, a.click()
        };
    return t.jsxs("div", {
        className: "flex flex-col h-full overflow-hidden",
        children: [t.jsx("div", {
            className: "flex-shrink-0 px-4 py-3 border-b border-border bg-card",
            children: t.jsxs("div", {
                className: "flex items-center gap-4 flex-wrap",
                children: [t.jsxs("div", {
                    children: [t.jsxs("div", {
                        className: "flex items-center gap-2",
                        children: [t.jsx("h2", {
                            className: "text-sm font-bold text-foreground tracking-tight",
                            children: "Pair Optimizer"
                        }), it && t.jsxs("span", {
                            className: "text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30",
                            children: [ce.length, "/", i.length]
                        })]
                    }), t.jsx("p", {
                        className: "text-[10px] text-muted-foreground mt-0.5",
                        children: "Find mean-reverting pairs with optimal z-score entry/exit — half-life, Hurst, ADF stationarity"
                    })]
                }), t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: "Metric"
                    }), t.jsx("select", {
                        className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[140px]",
                        value: m,
                        onChange: e => c(e.target.value),
                        disabled: y,
                        children: dt.map(e => t.jsx("option", {
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
                        children: ["scan", "manual"].map(e => t.jsx("button", {
                            className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${v===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                            onClick: () => re(e),
                            disabled: y,
                            children: e === "scan" ? "Subsector Scan" : "Manual Pair"
                        }, e))
                    })]
                }), v === "scan" && ae.universeSourceUI && t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: "Universe Source"
                    }), ae.universeSourceUI]
                }), v === "scan" && ae.classFilterUI && t.jsxs("div", {
                    className: "flex flex-col gap-0.5 w-full mt-1",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: "Classification Filter"
                    }), ae.classFilterUI]
                }), v === "manual" ? t.jsxs(t.Fragment, {
                    children: [t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Ticker A"
                        }), t.jsx("select", {
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px]",
                            value: Z,
                            onChange: e => Se(e.target.value),
                            disabled: y,
                            children: ce.map(e => t.jsx("option", {
                                value: e.ticker,
                                children: e.ticker
                            }, e.ticker))
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Ticker B"
                        }), t.jsx("select", {
                            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px]",
                            value: V,
                            onChange: e => ve(e.target.value),
                            disabled: y,
                            children: ce.map(e => t.jsx("option", {
                                value: e.ticker,
                                children: e.ticker
                            }, e.ticker))
                        })]
                    })]
                }) : t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: "Group By"
                    }), t.jsx("select", {
                        className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[120px]",
                        value: F,
                        onChange: e => se(e.target.value),
                        disabled: y,
                        children: _e.map(e => t.jsx("option", {
                            value: e.key,
                            children: e.label
                        }, e.key))
                    })]
                }), t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: "Spread"
                    }), t.jsx("div", {
                        className: "flex gap-px",
                        children: ["ratio", "difference"].map(e => t.jsx("button", {
                            className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${A===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                            onClick: () => G(e),
                            disabled: y,
                            children: e === "ratio" ? "A / B" : "A − B"
                        }, e))
                    })]
                }), t.jsx("div", {
                    title: "Frequency at which the spread z-scores and signals are computed.",
                    children: ct
                }), t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: "Return Measure"
                    }), t.jsx("div", {
                        className: "flex gap-px",
                        children: ["threshold", "band"].map(e => t.jsx("button", {
                            className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${x===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                            onClick: () => k(e),
                            disabled: y,
                            children: e === "threshold" ? "Threshold" : "Band"
                        }, e))
                    })]
                }), x === "threshold" ? t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: "Target"
                    }), t.jsx("select", {
                        className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px]",
                        value: g,
                        onChange: e => N(Number(e.target.value)),
                        disabled: y,
                        children: $t.map(e => t.jsx("option", {
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
                            value: `${b}-${S}`,
                            onChange: e => {
                                const [r, o] = e.target.value.split("-").map(Number);
                                $(r), l(o)
                            },
                            disabled: y,
                            children: Ct.map(e => t.jsx("option", {
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
                            value: Math.round(b * 100),
                            onChange: e => $(Number(e.target.value) / 100),
                            disabled: y
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
                            value: Math.round(S * 100),
                            onChange: e => l(Number(e.target.value) / 100),
                            disabled: y
                        })]
                    })]
                }), t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: "Buy σ"
                    }), t.jsx("input", {
                        type: "number",
                        step: "0.5",
                        className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14",
                        value: h,
                        onChange: e => C(Number(e.target.value)),
                        disabled: y
                    })]
                }), t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: "Sell σ"
                    }), t.jsx("input", {
                        type: "number",
                        step: "0.5",
                        className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-14",
                        value: f,
                        onChange: e => M(Number(e.target.value)),
                        disabled: y
                    })]
                }), t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: "Signal"
                    }), t.jsx("div", {
                        className: "flex gap-px",
                        children: ["breakout", "reversion", "both"].map(e => t.jsx("button", {
                            className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${w===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                            onClick: () => te(e),
                            disabled: y,
                            title: e === "breakout" ? "Signal when Z crosses through threshold (entering extreme)" : e === "reversion" ? "Signal when Z crosses back inside threshold (leaving extreme)" : "Show both breakout and reversion signals",
                            children: e === "breakout" ? "Breakout" : e === "reversion" ? "Reversion" : "Both"
                        }, e))
                    })]
                }), t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: " "
                    }), y ? t.jsxs("button", {
                        className: "text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500",
                        onClick: () => {
                            we.current = !0
                        },
                        children: ["Cancel (", H.current, "/", H.total, ")"]
                    }) : t.jsx("button", {
                        className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90",
                        onClick: xt,
                        children: "Run Optimizer"
                    })]
                })]
            })
        }), t.jsxs("div", {
            className: "flex-1 overflow-auto px-4 py-3",
            children: [q.length === 0 && !y && t.jsx("div", {
                className: "flex items-center justify-center h-full text-muted-foreground text-sm",
                children: v === "scan" ? `Scans all pairs within the same ${_e.find(e=>e.key===F)?.label?.toLowerCase()||"group"} for mean-reversion signals` : 'Select two tickers and click "Run Optimizer" to test pair mean reversion'
            }), y && q.length === 0 && t.jsx("div", {
                className: "flex items-center justify-center h-full",
                children: t.jsxs("div", {
                    className: "text-center",
                    children: [t.jsx("div", {
                        className: "text-sm text-muted-foreground mb-2",
                        children: "Analyzing pairs..."
                    }), t.jsx("div", {
                        className: "text-xs font-mono text-muted-foreground",
                        children: H.label
                    }), t.jsxs("div", {
                        className: "text-xs font-mono text-muted-foreground mt-1",
                        children: [H.current, "/", H.total]
                    }), t.jsx("div", {
                        className: "w-48 h-1 bg-border rounded-full mt-2 mx-auto overflow-hidden",
                        children: t.jsx("div", {
                            className: "h-full bg-primary rounded-full transition-all duration-300",
                            style: {
                                width: `${H.total>0?H.current/H.total*100:0}%`
                            }
                        })
                    })]
                })
            }), me.length > 0 && t.jsxs("div", {
                children: [t.jsxs("div", {
                    className: "flex items-center justify-between mb-2",
                    children: [t.jsxs("h3", {
                        className: "text-xs font-bold text-foreground uppercase tracking-wider",
                        children: [me.length, " pairs — ", m, " (", A === "ratio" ? "A/B" : "A−B", ") — ", v === "scan" ? `by ${_e.find(e=>e.key===F)?.label||F}` : "manual", " — ", x === "band" ? `band ${D(b)}–${D(S)}` : `target ${D(g)}`]
                    }), t.jsxs("div", {
                        className: "flex items-center gap-1",
                        children: [
                            ["score", "halfLife", "hurst"].map(e => t.jsx("button", {
                                className: `text-[9px] font-mono px-2 py-0.5 rounded ${K===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border"}`,
                                onClick: () => qe(e),
                                children: e === "score" ? "Score" : e === "halfLife" ? "Half-Life" : "Hurst"
                            }, e)), t.jsx(Pt, {
                                variant: "outline",
                                size: "sm",
                                className: "h-6 gap-1 text-[11px]",
                                onClick: ft,
                                "data-testid": "export-csv",
                                children: t.jsx(Ft, {
                                    className: "w-3 h-3"
                                })
                            })
                        ]
                    })]
                }), t.jsx("div", {
                    className: "overflow-x-auto border border-border rounded",
                    children: t.jsxs("table", {
                        className: "w-full text-[10px] font-mono",
                        children: [t.jsx("thead", {
                            children: t.jsxs("tr", {
                                className: "bg-card text-muted-foreground",
                                children: [t.jsx("th", {
                                    className: "text-left px-2 py-1 font-bold sticky left-0 bg-card z-10 border-r border-border",
                                    children: "Pair"
                                }), t.jsx("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: "Half-Life"
                                }), t.jsx("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: "Hurst"
                                }), t.jsx("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: "ADF p"
                                }), t.jsx("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: "Window"
                                }), t.jsx("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: "Buy Sigs"
                                }), t.jsx("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: "Sell Sigs"
                                }), Y.map(e => t.jsxs("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: [x === "band" ? "Band" : "Hit", " ", e.label]
                                }, e.label)), Y.filter((e, r) => r >= 2).map(e => t.jsxs("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: ["PF ", e.label]
                                }, `pf-${e.label}`)), t.jsx("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: "Score"
                                })]
                            })
                        }), t.jsx("tbody", {
                            children: me.map(e => {
                                const r = `${e.tickerA}/${e.tickerB}`,
                                    o = oe === r,
                                    p = e.buySummary,
                                    a = e.sellSummary;
                                return t.jsxs("tr", {
                                    className: `${o?"bg-primary/10":"hover:bg-white/5"} cursor-pointer`,
                                    onClick: () => Xe(o ? null : r),
                                    children: [t.jsxs("td", {
                                        className: "px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border whitespace-nowrap",
                                        children: [e.tickerA, " / ", e.tickerB]
                                    }), t.jsx("td", {
                                        className: `text-center px-2 py-1 ${e.halfLife<30?"text-emerald-400 font-bold":e.halfLife<63?"text-green-400":e.halfLife<126?"text-yellow-300":"text-muted-foreground"}`,
                                        children: e.halfLife === 1 / 0 ? "∞" : `${e.halfLife}d`
                                    }), t.jsx("td", {
                                        className: `text-center px-2 py-1 ${e.hurstExponent<.4?"text-emerald-400 font-bold":e.hurstExponent<.5?"text-green-400":"text-orange-400"}`,
                                        children: e.hurstExponent.toFixed(3)
                                    }), t.jsx("td", {
                                        className: `text-center px-2 py-1 ${e.adfPValue<=.05?"text-emerald-400 font-bold":e.adfPValue<=.1?"text-green-400":"text-muted-foreground"}`,
                                        children: e.adfPValue <= .01 ? "<.01" : e.adfPValue.toFixed(2)
                                    }), t.jsxs("td", {
                                        className: "text-center px-2 py-1 text-foreground",
                                        children: [e.bestWindow, "d"]
                                    }), t.jsx("td", {
                                        className: "text-center px-2 py-1 text-foreground",
                                        children: p.count
                                    }), t.jsx("td", {
                                        className: "text-center px-2 py-1 text-foreground",
                                        children: a.count
                                    }), Y.map(n => {
                                        const d = x === "band" ? "bandHitRate" : "hitRate",
                                            B = p[d]?.[n.label] ?? p.hitRate[n.label],
                                            T = a[d]?.[n.label] ?? a.hitRate[n.label],
                                            pe = p.count > 0 && a.count > 0 ? (B * p.count + T * a.count) / (p.count + a.count) : p.count > 0 ? B : T;
                                        return t.jsx("td", {
                                            className: `text-center px-2 py-1 ${ue(pe)}`,
                                            children: D(pe)
                                        }, n.label)
                                    }), Y.filter((n, d) => d >= 2).map(n => {
                                        const d = p.count > 0 ? p.profitFactor[n.label] : a.profitFactor[n.label];
                                        return t.jsx("td", {
                                            className: `text-center px-2 py-1 ${Ie(d)}`,
                                            children: d >= 99 ? "∞" : d.toFixed(2)
                                        }, `pf-${n.label}`)
                                    }), t.jsx("td", {
                                        className: "text-center px-2 py-1",
                                        children: t.jsx("span", {
                                            className: "inline-block px-1.5 py-0.5 rounded font-bold",
                                            style: {
                                                backgroundColor: zt(e.compositeScore),
                                                color: Tt(e.compositeScore)
                                            },
                                            children: e.compositeScore
                                        })
                                    })]
                                }, r)
                            })
                        })]
                    })
                }), oe && (() => {
                    const e = q.find(r => `${r.tickerA}/${r.tickerB}` === oe);
                    return e ? t.jsxs("div", {
                        className: "mt-4 border border-border rounded p-3 bg-card/50",
                        children: [t.jsxs("h4", {
                            className: "text-xs font-bold text-foreground mb-2",
                            children: [e.tickerA, " / ", e.tickerB, " — Detailed Forward Returns (", m, ")"]
                        }), t.jsxs("div", {
                            className: "grid grid-cols-2 gap-4",
                            children: [t.jsxs("div", {
                                children: [t.jsxs("div", {
                                    className: "text-[10px] font-mono text-emerald-400 font-bold mb-1",
                                    children: ["BUY SPREAD (Long ", e.tickerA, " / Short ", e.tickerB, ") — ", e.buySummary?.count ?? 0, " signals"]
                                }), t.jsxs("table", {
                                    className: "w-full text-[10px] font-mono",
                                    children: [t.jsx("thead", {
                                        children: t.jsxs("tr", {
                                            className: "text-muted-foreground",
                                            children: [t.jsx("th", {
                                                className: "text-left px-1 py-0.5",
                                                children: "Horizon"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Hit Rate"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Win Rate"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Avg Ret"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Median"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Avg Peak"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Avg Trough"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "PF"
                                            })]
                                        })
                                    }), t.jsx("tbody", {
                                        children: Y.map(r => t.jsxs("tr", {
                                            children: [t.jsx("td", {
                                                className: "px-1 py-0.5 text-foreground font-bold",
                                                children: r.label
                                            }), t.jsx("td", {
                                                className: `text-center px-1 py-0.5 ${ue(e.buySummary.hitRate[r.label])}`,
                                                children: D(e.buySummary.hitRate[r.label])
                                            }), t.jsx("td", {
                                                className: `text-center px-1 py-0.5 ${ue(e.buySummary.winRate[r.label])}`,
                                                children: D(e.buySummary.winRate[r.label])
                                            }), t.jsx("td", {
                                                className: `text-center px-1 py-0.5 ${e.buySummary.avgReturn[r.label]>=0?"text-green-400":"text-red-400"}`,
                                                children: X(e.buySummary.avgReturn[r.label])
                                            }), t.jsx("td", {
                                                className: `text-center px-1 py-0.5 ${e.buySummary.medianReturn[r.label]>=0?"text-green-400":"text-red-400"}`,
                                                children: X(e.buySummary.medianReturn[r.label])
                                            }), t.jsx("td", {
                                                className: "text-center px-1 py-0.5 text-green-400",
                                                children: X(e.buySummary.avgPeak[r.label])
                                            }), t.jsx("td", {
                                                className: "text-center px-1 py-0.5 text-red-400",
                                                children: X(e.buySummary.avgTrough[r.label])
                                            }), t.jsx("td", {
                                                className: `text-center px-1 py-0.5 ${Ie(e.buySummary.profitFactor[r.label])}`,
                                                children: e.buySummary.profitFactor[r.label] >= 99 ? "∞" : e.buySummary.profitFactor[r.label].toFixed(2)
                                            })]
                                        }, r.label))
                                    })]
                                })]
                            }), t.jsxs("div", {
                                children: [t.jsxs("div", {
                                    className: "text-[10px] font-mono text-red-400 font-bold mb-1",
                                    children: ["SELL SPREAD (Short ", e.tickerA, " / Long ", e.tickerB, ") — ", e.sellSummary?.count ?? 0, " signals"]
                                }), t.jsxs("table", {
                                    className: "w-full text-[10px] font-mono",
                                    children: [t.jsx("thead", {
                                        children: t.jsxs("tr", {
                                            className: "text-muted-foreground",
                                            children: [t.jsx("th", {
                                                className: "text-left px-1 py-0.5",
                                                children: "Horizon"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Hit Rate"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Win Rate"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Avg Ret"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Median"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Avg Peak"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "Avg Trough"
                                            }), t.jsx("th", {
                                                className: "text-center px-1 py-0.5",
                                                children: "PF"
                                            })]
                                        })
                                    }), t.jsx("tbody", {
                                        children: Y.map(r => t.jsxs("tr", {
                                            children: [t.jsx("td", {
                                                className: "px-1 py-0.5 text-foreground font-bold",
                                                children: r.label
                                            }), t.jsx("td", {
                                                className: `text-center px-1 py-0.5 ${ue(e.sellSummary.hitRate[r.label])}`,
                                                children: D(e.sellSummary.hitRate[r.label])
                                            }), t.jsx("td", {
                                                className: `text-center px-1 py-0.5 ${ue(e.sellSummary.winRate[r.label])}`,
                                                children: D(e.sellSummary.winRate[r.label])
                                            }), t.jsx("td", {
                                                className: `text-center px-1 py-0.5 ${e.sellSummary.avgReturn[r.label]<=0?"text-green-400":"text-red-400"}`,
                                                children: X(e.sellSummary.avgReturn[r.label])
                                            }), t.jsx("td", {
                                                className: `text-center px-1 py-0.5 ${e.sellSummary.medianReturn[r.label]<=0?"text-green-400":"text-red-400"}`,
                                                children: X(e.sellSummary.medianReturn[r.label])
                                            }), t.jsx("td", {
                                                className: "text-center px-1 py-0.5 text-green-400",
                                                children: X(e.sellSummary.avgPeak[r.label])
                                            }), t.jsx("td", {
                                                className: "text-center px-1 py-0.5 text-red-400",
                                                children: X(e.sellSummary.avgTrough[r.label])
                                            }), t.jsx("td", {
                                                className: `text-center px-1 py-0.5 ${Ie(e.sellSummary.profitFactor[r.label])}`,
                                                children: e.sellSummary.profitFactor[r.label] >= 99 ? "∞" : e.sellSummary.profitFactor[r.label].toFixed(2)
                                            })]
                                        }, r.label))
                                    })]
                                })]
                            })]
                        })]
                    }) : null
                })()]
            })]
        })]
    })
}
export {
    Zt as
    default
};