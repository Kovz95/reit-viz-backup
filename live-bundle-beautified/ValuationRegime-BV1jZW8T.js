import {
    r as c,
    a as Ie,
    af as We,
    ae as Ve,
    bB as ze,
    bA as Ue,
    d1 as He,
    c_ as Ke,
    c$ as Ze,
    g as Ge,
    j as t,
    cN as fe,
    cQ as Qe,
    cR as Xe,
    cU as Y,
    B as qe,
    z as Je,
    cW as p,
    cX as he,
    cY as ge,
    cZ as et,
    cT as ye,
    cS as je
} from "./index-CsG73Aq_.js";
import {
    B as tt
} from "./BasketTickerPill-DA9Wjwwc.js";
const ke = [{
        key: "bottom10",
        label: "Bottom 10%",
        threshold: [0, .1],
        direction: "buy"
    }, {
        key: "bottom20",
        label: "Bottom 20%",
        threshold: [0, .2],
        direction: "buy"
    }, {
        key: "bottom30",
        label: "Bottom 30%",
        threshold: [0, .3],
        direction: "buy"
    }, {
        key: "top30",
        label: "Top 30%",
        threshold: [.7, 1],
        direction: "sell"
    }, {
        key: "top20",
        label: "Top 20%",
        threshold: [.8, 1],
        direction: "sell"
    }, {
        key: "top10",
        label: "Top 10%",
        threshold: [.9, 1],
        direction: "sell"
    }],
    Ne = [{
        days: 126,
        label: "6M"
    }, {
        days: 252,
        label: "1Y"
    }, {
        days: 504,
        label: "2Y"
    }, {
        days: 756,
        label: "3Y"
    }, {
        days: 1260,
        label: "5Y"
    }, {
        days: 2520,
        label: "10Y"
    }, {
        days: 0,
        label: "All"
    }],
    ve = ["P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2", "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2", "Dividend Yield", "Implied Cap Rate"],
    rt = new Set(["FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2", "Dividend Yield", "Implied Cap Rate"]);

function at() {
    const [M, we] = c.useState([]), [j, q] = c.useState(["P/FFO LTM", "P/E LTM", "EV/EBITDA LTM", "Dividend Yield"]), [u, F] = c.useState(""), [f, J] = c.useState("threshold"), [S, ee] = c.useState(.05), [k, W] = c.useState(.05), [N, V] = c.useState(.1), [R, te] = c.useState("single"), [b, z] = c.useState(!1), [v, re] = c.useState({
        current: 0,
        total: 0
    }), [w, O] = c.useState([]), [C, se] = c.useState(null), [$, oe] = c.useState("score"), [ne, Me] = c.useState("best"), U = c.useRef(!1), le = c.useRef(!1), {
        universeTickers: H,
        isFiltered: Se
    } = Ie(), h = c.useMemo(() => H ? M.filter(e => H.has(e.ticker)) : M, [M, H]), [Re, Te] = c.useState(ve);
    c.useEffect(() => {
        We().then(e => {
            we(e), e.length > 0 && !le.current && F(e[0].ticker);
            const s = new Set;
            for (const o of e)
                if (o.metrics)
                    for (const a of o.metrics) s.add(typeof a == "string" ? a : a.name || a);
            const l = ve.filter(o => s.has(o));
            l.length > 0 && Te(l)
        })
    }, []), c.useEffect(() => {
        h.length > 0 && u && M.some(e => e.ticker === u) && !h.find(e => e.ticker === u) && F(h[0].ticker)
    }, [h, u, M]);
    const Be = c.useCallback(async () => {
            z(!0), O([]), U.current = !1;
            const e = await Ve(),
                s = R === "single" ? h.filter(o => o.ticker === u) : h;
            if (s.length === 0) {
                z(!1);
                return
            }
            re({
                current: 0,
                total: s.length
            });
            const l = [];
            for (let o = 0; o < s.length && !U.current; o++) {
                const a = s[o];
                re({
                    current: o + 1,
                    total: s.length
                });
                try {
                    const r = await ze(a.ticker),
                        n = r.close;
                    if (!n?.length) continue;
                    const T = new Map;
                    for (const [i, m] of n) T.set(i, m);
                    const B = [];
                    for (const i of j) {
                        const m = r[i];
                        if (!m?.length) continue;
                        const Ae = Ue(i),
                            ae = rt.has(i),
                            K = new Map;
                        for (const [d, Z] of m) K.set(d, Z * Ae);
                        const P = [];
                        for (let d = 0; d < e.length; d++) K.has(d) && T.has(d) && P.push(d);
                        if (P.length < 100) continue;
                        const E = P.map(d => K.get(d)),
                            Le = P.map(d => T.get(d));
                        for (const {
                                days: d,
                                label: Z
                            }
                            of Ne) {
                            const D = [];
                            for (const x of ke) {
                                const A = [];
                                for (let g = 0; g < E.length; g++) {
                                    const _e = d === 0 ? 0 : Math.max(0, g - d + 1),
                                        de = E.slice(_e, g + 1);
                                    if (de.length < 20) continue;
                                    const xe = [...de].sort((L, I) => L - I),
                                        me = xe.filter(L => L <= E[g]).length / xe.length,
                                        G = ae ? 1 - me : me,
                                        ue = x.threshold[1] >= 1;
                                    if (!(G >= x.threshold[0] && (ue ? G <= x.threshold[1] : G < x.threshold[1]))) continue;
                                    if (g > 0) {
                                        const L = d === 0 ? 0 : Math.max(0, g - 1 - d + 1),
                                            I = E.slice(L, g);
                                        if (I.length >= 20) {
                                            const be = [...I].sort((X, De) => X - De),
                                                pe = be.filter(X => X <= E[g - 1]).length / be.length,
                                                Q = ae ? 1 - pe : pe;
                                            if (Q >= x.threshold[0] && (ue ? Q <= x.threshold[1] : Q < x.threshold[1])) continue
                                        }
                                    }
                                    const Pe = f === "band" ? {
                                        minReturn: k,
                                        maxReturn: N
                                    } : null;
                                    A.push(He(Le, g, S, x.direction, Pe))
                                }
                                const ie = Ke(A, x.direction),
                                    Ye = f === "band",
                                    Oe = Ze(ie, x.direction, Ye);
                                D.push({
                                    band: x.key,
                                    bandLabel: x.label,
                                    direction: x.direction,
                                    summary: ie,
                                    composite: Oe
                                })
                            }
                            if (D.length === 0) continue;
                            const ce = D.reduce((x, A) => x.composite.score > A.composite.score ? x : A);
                            B.push({
                                window: d,
                                windowLabel: Z,
                                metric: i,
                                bands: D,
                                bestBand: ce.band,
                                bestScore: ce.composite.score
                            })
                        }
                    }
                    if (B.length === 0) continue;
                    const y = B.reduce((i, m) => i.bestScore > m.bestScore ? i : m);
                    l.push({
                        ticker: a.ticker,
                        name: a.name,
                        results: B,
                        bestMetric: y.metric,
                        bestWindow: y.windowLabel,
                        bestBand: ke.find(i => i.key === y.bestBand)?.label || y.bestBand,
                        bestScore: y.bestScore
                    }), (o % 5 === 0 || o === s.length - 1) && O([...l])
                } catch {}
            }
            O(l), z(!1)
        }, [h, u, j, R, S, f, k, N]),
        Fe = c.useCallback(() => ({
            selectedMetrics: j,
            selectedTicker: u,
            targetReturn: S,
            mode: R,
            results: w,
            expandedTicker: C,
            sortBy: $,
            viewMetric: ne,
            returnMode: f,
            bandMin: k,
            bandMax: N
        }), [j, u, S, R, w, C, $, ne, f, k, N]),
        Ce = c.useCallback(e => {
            e && (Array.isArray(e.selectedMetrics) && q(e.selectedMetrics), e.selectedTicker && (F(e.selectedTicker), le.current = !0), typeof e.targetReturn == "number" && ee(e.targetReturn), e.returnMode && J(e.returnMode), typeof e.bandMin == "number" && W(e.bandMin), typeof e.bandMax == "number" && V(e.bandMax), e.mode && te(e.mode), Array.isArray(e.results) && O(e.results), e.expandedTicker !== void 0 && se(e.expandedTicker), e.sortBy && oe(e.sortBy), e.viewMetric && Me(e.viewMetric))
        }, []);
    Ge("val-regime", Fe, Ce);
    const _ = c.useMemo(() => {
            const e = [...w];
            return $ === "score" ? e.sort((s, l) => l.bestScore - s.bestScore) : e.sort((s, l) => s.ticker.localeCompare(l.ticker)), e
        }, [w, $]),
        $e = () => {
            const e = p.filter((r, n) => n >= 2),
                s = _.map(r => {
                    const n = r.results.reduce((i, m) => i.bestScore > m.bestScore ? i : m, r.results[0]),
                        B = n?.bands.reduce((i, m) => i.composite.score > m.composite.score ? i : m, n.bands[0])?.summary,
                        y = {
                            ticker: r.ticker,
                            name: r.name,
                            bestMetric: r.bestMetric,
                            bestWindow: r.bestWindow,
                            bestBand: r.bestBand,
                            bestScore: r.bestScore
                        };
                    return e.forEach(i => {
                        y[`hitRate_${i.label}`] = B?.hitRate[i.label] ?? null
                    }), y
                }),
                l = Object.keys(s[0] || {}),
                o = [l.join(","), ...s.map(r => l.map(n => `"${String(r[n]??"").replace(/"/g,'""')}"`).join(","))].join(`
`),
                a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([o], {
                type: "text/csv"
            })), a.download = "valuation_regime.csv", a.click()
        },
        Ee = e => {
            q(s => s.includes(e) ? s.filter(l => l !== e) : [...s, e])
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
                            children: "Valuation Regime"
                        }), Se && t.jsxs("span", {
                            className: "text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-600/30",
                            children: [h.length, "/", M.length]
                        })]
                    }), t.jsx("p", {
                        className: "text-[10px] text-muted-foreground mt-0.5",
                        children: "Which valuation metric best predicts forward returns at historical extremes?"
                    })]
                }), t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: "Metrics to Test"
                    }), t.jsx("div", {
                        className: "flex gap-1 flex-wrap max-w-[400px]",
                        children: Re.map(e => t.jsx("button", {
                            className: `text-[9px] font-mono px-1.5 py-0.5 rounded transition-colors ${j.includes(e)?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border hover:text-foreground"}`,
                            onClick: () => Ee(e),
                            disabled: b,
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
                        children: ["single", "universe"].map(e => t.jsx("button", {
                            className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${R===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                            onClick: () => te(e),
                            disabled: b,
                            children: e === "single" ? "Single Ticker" : "Universe"
                        }, e))
                    })]
                }), R === "single" && t.jsxs(t.Fragment, {
                    children: [t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Ticker"
                        }), t.jsx("select", {
                            className: `text-xs font-mono bg-background border border-border rounded px-2 py-1 min-w-[80px] ${fe(u)?"opacity-40 pointer-events-none":""}`,
                            value: fe(u) ? "" : u,
                            onChange: e => F(e.target.value),
                            disabled: b,
                            children: h.map(e => t.jsx("option", {
                                value: e.ticker,
                                children: e.ticker
                            }, e.ticker))
                        })]
                    }), t.jsxs("div", {
                        className: "flex flex-col gap-0.5",
                        children: [t.jsx("label", {
                            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                            children: "Basket"
                        }), t.jsx(tt, {
                            activeTicker: u,
                            onSelectTicker: F,
                            fallbackTicker: h[0]?.ticker ?? null
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
                            className: `text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${f===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                            onClick: () => J(e),
                            disabled: b,
                            children: e === "threshold" ? "Threshold" : "Band"
                        }, e))
                    })]
                }), f === "threshold" ? t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: "Target"
                    }), t.jsx("select", {
                        className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[70px]",
                        value: S,
                        onChange: e => ee(Number(e.target.value)),
                        disabled: b,
                        children: Qe.map(e => t.jsx("option", {
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
                            value: `${k}-${N}`,
                            onChange: e => {
                                const [s, l] = e.target.value.split("-").map(Number);
                                W(s), V(l)
                            },
                            disabled: b,
                            children: Xe.map(e => t.jsx("option", {
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
                            value: Math.round(k * 100),
                            onChange: e => W(Number(e.target.value) / 100),
                            disabled: b
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
                            value: Math.round(N * 100),
                            onChange: e => V(Number(e.target.value) / 100),
                            disabled: b
                        })]
                    })]
                }), t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                        children: " "
                    }), b ? t.jsxs("button", {
                        className: "text-xs font-mono font-bold px-4 py-1 rounded bg-red-600 text-white hover:bg-red-500",
                        onClick: () => {
                            U.current = !0
                        },
                        children: ["Cancel (", v.current, "/", v.total, ")"]
                    }) : t.jsx("button", {
                        className: "text-xs font-mono font-bold px-4 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90",
                        onClick: Be,
                        disabled: j.length === 0,
                        children: "Run Optimizer"
                    })]
                })]
            })
        }), t.jsxs("div", {
            className: "flex-1 overflow-auto px-4 py-3",
            children: [w.length === 0 && !b && t.jsx("div", {
                className: "flex items-center justify-center h-full text-muted-foreground text-sm",
                children: "Tests each metric × lookback window × percentile band to find the best valuation signal"
            }), b && w.length === 0 && t.jsx("div", {
                className: "flex items-center justify-center h-full",
                children: t.jsxs("div", {
                    className: "text-center",
                    children: [t.jsx("div", {
                        className: "text-sm text-muted-foreground mb-2",
                        children: "Testing valuation regimes..."
                    }), t.jsxs("div", {
                        className: "text-xs font-mono text-muted-foreground",
                        children: [v.current, "/", v.total, " tickers × ", j.length, " metrics × ", Ne.length, " windows"]
                    }), t.jsx("div", {
                        className: "w-48 h-1 bg-border rounded-full mt-2 mx-auto overflow-hidden",
                        children: t.jsx("div", {
                            className: "h-full bg-primary rounded-full transition-all duration-300",
                            style: {
                                width: `${v.total>0?v.current/v.total*100:0}%`
                            }
                        })
                    })]
                })
            }), _.length > 0 && t.jsxs("div", {
                children: [t.jsxs("div", {
                    className: "flex items-center justify-between mb-2",
                    children: [t.jsxs("h3", {
                        className: "text-xs font-bold text-foreground uppercase tracking-wider",
                        children: [_.length, " tickers — ", f === "band" ? `band ${Y(k)}–${Y(N)}` : `target ${Y(S)}`]
                    }), t.jsxs("div", {
                        className: "flex items-center gap-1",
                        children: [
                            ["score", "ticker"].map(e => t.jsx("button", {
                                className: `text-[9px] font-mono px-2 py-0.5 rounded ${$===e?"bg-primary text-primary-foreground":"bg-background text-muted-foreground border border-border"}`,
                                onClick: () => oe(e),
                                children: e === "score" ? "Score" : "Ticker"
                            }, e)), t.jsx(qe, {
                                variant: "outline",
                                size: "sm",
                                className: "h-6 gap-1 text-[11px]",
                                onClick: $e,
                                "data-testid": "export-csv",
                                children: t.jsx(Je, {
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
                                    children: "Best Metric"
                                }), t.jsx("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: "Lookback"
                                }), t.jsx("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: "Best Band"
                                }), p.filter((e, s) => s >= 2).map(e => t.jsxs("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: [f === "band" ? "Band" : "Hit", " ", e.label]
                                }, e.label)), p.filter((e, s) => s >= 2).map(e => t.jsxs("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: ["Avg ", e.label]
                                }, `avg-${e.label}`)), p.filter((e, s) => s >= 2).map(e => t.jsxs("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: ["PF ", e.label]
                                }, `pf-${e.label}`)), t.jsx("th", {
                                    className: "text-center px-2 py-1 font-bold",
                                    children: "Score"
                                })]
                            })
                        }), t.jsx("tbody", {
                            children: _.map(e => {
                                const s = e.results.reduce((r, n) => r.bestScore > n.bestScore ? r : n, e.results[0]),
                                    o = s?.bands.reduce((r, n) => r.composite.score > n.composite.score ? r : n, s.bands[0])?.summary,
                                    a = C === e.ticker;
                                return t.jsxs("tr", {
                                    className: `${a?"bg-primary/10":"hover:bg-white/5"} cursor-pointer`,
                                    onClick: () => se(a ? null : e.ticker),
                                    children: [t.jsx("td", {
                                        className: "px-2 py-1 font-bold text-foreground sticky left-0 bg-card z-10 border-r border-border",
                                        children: e.ticker
                                    }), t.jsx("td", {
                                        className: "text-center px-2 py-1 text-primary font-bold",
                                        children: e.bestMetric
                                    }), t.jsx("td", {
                                        className: "text-center px-2 py-1 text-foreground",
                                        children: e.bestWindow
                                    }), t.jsx("td", {
                                        className: `text-center px-2 py-1 font-bold ${e.bestBand.includes("Bottom")?"text-emerald-400":"text-red-400"}`,
                                        children: e.bestBand
                                    }), p.filter((r, n) => n >= 2).map(r => {
                                        const n = o ? f === "band" ? o.bandHitRate?.[r.label] ?? o.hitRate[r.label] : o.hitRate[r.label] : 0;
                                        return t.jsx("td", {
                                            className: `text-center px-2 py-1 ${o?he(n):""}`,
                                            children: o ? Y(n) : "–"
                                        }, r.label)
                                    }), p.filter((r, n) => n >= 2).map(r => t.jsx("td", {
                                        className: `text-center px-2 py-1 ${o?o.avgReturn[r.label]>=0?"text-green-400":"text-red-400":""}`,
                                        children: o ? ge(o.avgReturn[r.label]) : "–"
                                    }, `avg-${r.label}`)), p.filter((r, n) => n >= 2).map(r => t.jsx("td", {
                                        className: `text-center px-2 py-1 ${o?et(o.profitFactor[r.label]):""}`,
                                        children: o ? o.profitFactor[r.label] >= 99 ? "∞" : o.profitFactor[r.label].toFixed(2) : "–"
                                    }, `pf-${r.label}`)), t.jsx("td", {
                                        className: "text-center px-2 py-1",
                                        children: t.jsx("span", {
                                            className: "inline-block px-1.5 py-0.5 rounded font-bold",
                                            style: {
                                                backgroundColor: je(e.bestScore),
                                                color: ye(e.bestScore)
                                            },
                                            children: e.bestScore
                                        })
                                    })]
                                }, e.ticker)
                            })
                        })]
                    })
                }), C && (() => {
                    const e = w.find(l => l.ticker === C);
                    if (!e) return null;
                    const s = new Map;
                    for (const l of e.results) s.has(l.metric) || s.set(l.metric, []), s.get(l.metric).push(l);
                    return t.jsxs("div", {
                        className: "border border-border rounded p-3 bg-card/50 mb-4",
                        children: [t.jsxs("h4", {
                            className: "text-xs font-bold text-foreground mb-3",
                            children: [e.ticker, " — ", e.name, " — All Metric × Window × Band Results"]
                        }), [...s.entries()].map(([l, o]) => t.jsxs("div", {
                            className: "mb-4",
                            children: [t.jsx("div", {
                                className: "text-[10px] font-mono text-primary font-bold mb-1 uppercase",
                                children: l
                            }), t.jsx("div", {
                                className: "overflow-x-auto border border-border/50 rounded",
                                children: t.jsxs("table", {
                                    className: "w-full text-[9px] font-mono",
                                    children: [t.jsx("thead", {
                                        children: t.jsxs("tr", {
                                            className: "text-muted-foreground bg-card",
                                            children: [t.jsx("th", {
                                                className: "text-left px-1.5 py-0.5 font-bold",
                                                children: "Window"
                                            }), t.jsx("th", {
                                                className: "text-left px-1.5 py-0.5 font-bold",
                                                children: "Band"
                                            }), t.jsx("th", {
                                                className: "text-center px-1.5 py-0.5 font-bold",
                                                children: "Signals"
                                            }), p.map(a => t.jsxs("th", {
                                                className: "text-center px-1.5 py-0.5 font-bold",
                                                children: ["Hit ", a.label]
                                            }, a.label)), p.filter((a, r) => r >= 2).map(a => t.jsxs("th", {
                                                className: "text-center px-1.5 py-0.5 font-bold",
                                                children: ["Avg ", a.label]
                                            }, `avg-${a.label}`)), t.jsx("th", {
                                                className: "text-center px-1.5 py-0.5 font-bold",
                                                children: "Score"
                                            })]
                                        })
                                    }), t.jsx("tbody", {
                                        children: o.map(a => a.bands.filter(r => r.summary.count > 0).map(r => t.jsxs("tr", {
                                            className: r.band === a.bestBand ? "bg-primary/10" : "hover:bg-white/5",
                                            children: [t.jsx("td", {
                                                className: "px-1.5 py-0.5 text-foreground",
                                                children: a.windowLabel
                                            }), t.jsx("td", {
                                                className: `px-1.5 py-0.5 font-bold ${r.direction==="buy"?"text-emerald-400":"text-red-400"}`,
                                                children: r.bandLabel
                                            }), t.jsx("td", {
                                                className: "text-center px-1.5 py-0.5 text-foreground",
                                                children: r.summary.count
                                            }), p.map(n => t.jsx("td", {
                                                className: `text-center px-1.5 py-0.5 ${he(r.summary.hitRate[n.label])}`,
                                                children: Y(r.summary.hitRate[n.label])
                                            }, n.label)), p.filter((n, T) => T >= 2).map(n => t.jsx("td", {
                                                className: `text-center px-1.5 py-0.5 ${r.summary.avgReturn[n.label]>=0?"text-green-400":"text-red-400"}`,
                                                children: ge(r.summary.avgReturn[n.label])
                                            }, `avg-${n.label}`)), t.jsx("td", {
                                                className: "text-center px-1.5 py-0.5",
                                                children: t.jsx("span", {
                                                    className: "inline-block px-1 py-0 rounded font-bold",
                                                    style: {
                                                        backgroundColor: je(r.composite.score),
                                                        color: ye(r.composite.score)
                                                    },
                                                    children: r.composite.score
                                                })
                                            })]
                                        }, `${a.windowLabel}-${r.band}`)))
                                    })]
                                })
                            })]
                        }, l))]
                    })
                })()]
            })]
        })]
    })
}
export {
    at as
    default
};