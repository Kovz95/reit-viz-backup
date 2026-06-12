import {
    r as o,
    a as Ie,
    g as Ze,
    bO as $e,
    bP as De,
    b as Se,
    j as e,
    B as D,
    bQ as _e,
    o as ae,
    p as le,
    q as ne,
    t as ie,
    v as H,
    bR as We,
    bS as Ge,
    I as ue,
    z as Ke,
    a4 as qe,
    bT as Ue,
    X as He,
    aF as Fe,
    aG as Qe,
    aH as Xe,
    aJ as me,
    ae as Je,
    bB as et
} from "./index-CsG73Aq_.js";
import {
    u as tt
} from "./universeSignature-DAAu9BGh.js";
import {
    E as st
} from "./external-link-Cy9_YAtA.js";
const fe = [{
        value: "close",
        label: "Stock Price"
    }, {
        value: "P/FFO FY2",
        label: "P/FFO FY2"
    }, {
        value: "P/AFFO FY2",
        label: "P/AFFO FY2"
    }, {
        value: "P/FFO LTM",
        label: "P/FFO LTM"
    }, {
        value: "P/E FY2",
        label: "P/E FY2"
    }, {
        value: "EV/EBITDA FY2",
        label: "EV/EBITDA FY2"
    }, {
        value: "Dividend Yield",
        label: "Div Yield"
    }, {
        value: "FFO Yield FY2",
        label: "FFO Yield FY2"
    }, {
        value: "AFFO Yield FY2",
        label: "AFFO Yield FY2"
    }, {
        value: "FFO FY2",
        label: "FFO FY2"
    }, {
        value: "AFFO FY2",
        label: "AFFO FY2"
    }, {
        value: "Enterprise Value",
        label: "Enterprise Value"
    }],
    pe = [{
        value: "60",
        label: "60d"
    }, {
        value: "120",
        label: "120d"
    }, {
        value: "252",
        label: "1Y"
    }, {
        value: "504",
        label: "2Y"
    }, {
        value: "all",
        label: "All"
    }],
    rt = [1, 1.5, 2, 2.5, 3];

function ge(h) {
    const d = Math.abs(h);
    return d >= 2.5 ? h > 0 ? "#ef4444" : "#22c55e" : d >= 2 ? h > 0 ? "#f97316" : "#4ade80" : d >= 1.5 ? h > 0 ? "#fbbf24" : "#6ee7b7" : "#94a3b8"
}

function at(h) {
    const d = Math.abs(h);
    return d >= 2.5 ? h > 0 ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)" : d >= 2 ? h > 0 ? "rgba(249,115,22,0.08)" : "rgba(74,222,128,0.08)" : "transparent"
}

function lt(h, d, T, s, w, x) {
    const E = [],
        p = new Map;
    for (const n of h) {
        const S = d.get(n);
        if (!S) continue;
        const l = S[s] || [];
        if (l.length === 0) continue;
        const v = new Map;
        for (const [j, k] of l) k != null && isFinite(k) && k !== 0 && v.set(j, k);
        v.size > 0 && p.set(n, v)
    }
    const F = h.filter(n => p.has(n));
    for (let n = 0; n < F.length; n++)
        for (let S = n + 1; S < F.length; S++) {
            const l = F[n],
                v = F[S],
                j = p.get(l),
                k = p.get(v),
                g = [];
            for (const [c] of j) k.has(c) && g.push(c);
            if (g.sort((c, R) => c - R), g.length < 30) continue;
            let N = g;
            if (w !== "all") {
                const c = parseInt(w);
                N.length > c && (N = N.slice(-c))
            }
            const m = [];
            for (const c of N) {
                if (c >= T.length) continue;
                const R = j.get(c),
                    te = k.get(c);
                if (!(R > 0) || !(te > 0)) continue;
                const se = R / te;
                isFinite(se) && !isNaN(se) && m.push({
                    time: T[c],
                    value: se
                })
            }
            if (m.length < 20) continue;
            const i = m.map(c => c.value),
                A = i.map(c => Math.log(c)),
                f = A.reduce((c, R) => c + R, 0) / A.length,
                M = A.reduce((c, R) => c + (R - f) ** 2, 0) / A.length,
                Y = Math.sqrt(M),
                O = i.reduce((c, R) => c + R, 0) / i.length,
                X = Math.sqrt(i.reduce((c, R) => c + (R - O) ** 2, 0) / i.length),
                z = i[i.length - 1],
                J = Y === 0 ? 0 : (Math.log(z) - f) / Y,
                V = m.map(c => ({
                    time: c.time,
                    value: Y === 0 ? 0 : (Math.log(c.value) - f) / Y
                })),
                B = i.length,
                I = B > 30 ? (i[B - 1] / i[B - 31] - 1) * 100 : 0,
                ee = B > 90 ? (i[B - 1] / i[B - 91] - 1) * 100 : 0;
            E.push({
                tickerA: l,
                tickerB: v,
                currentRatio: z,
                zScore: J,
                mean: O,
                std: X,
                ratioSeries: m,
                zScoreSeries: V,
                pctChange30d: I,
                pctChange90d: ee
            })
        }
    return E
}
const ke = {
    layout: {
        background: {
            type: Xe.Solid,
            color: "transparent"
        },
        textColor: "#7a8a9e",
        fontSize: 9,
        fontFamily: "'JetBrains Mono', monospace"
    },
    grid: {
        vertLines: {
            color: "rgba(255,255,255,0.03)"
        },
        horzLines: {
            color: "rgba(255,255,255,0.03)"
        }
    },
    crosshair: {
        mode: Qe.Normal
    },
    rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)"
    },
    timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: !1
    },
    handleScroll: !0,
    handleScale: !0
};

function nt({
    ratioSeries: h,
    zScoreSeries: d,
    ratioTitle: T,
    zScoreTitle: s
}) {
    const w = o.useRef(null),
        x = o.useRef(null),
        E = o.useRef([]),
        p = o.useRef([]),
        F = o.useRef(!1);
    return o.useEffect(() => {
        const n = w.current,
            S = x.current;
        if (!n || !S || h.length === 0) return;
        E.current.forEach(i => {
            try {
                i.remove()
            } catch {}
        }), E.current = [], p.current = [];
        const l = [],
            v = [],
            j = Fe(n, {
                ...ke,
                width: n.clientWidth,
                height: n.clientHeight || 300
            }),
            k = j.addSeries(me, {
                color: "#0ea5e9",
                lineWidth: 1.5,
                priceLineVisible: !1,
                lastValueVisible: !0,
                crosshairMarkerRadius: 3
            });
        k.setData(h.map(i => ({
            time: i.time,
            value: i.value
        }))), l.push(j), v.push(k);
        const g = Fe(S, {
                ...ke,
                width: S.clientWidth,
                height: S.clientHeight || 300
            }),
            N = g.addSeries(me, {
                color: "#0ea5e9",
                lineWidth: 1.5,
                priceLineVisible: !1,
                lastValueVisible: !0,
                crosshairMarkerRadius: 3
            });
        N.setData(d.map(i => ({
            time: i.time,
            value: i.value
        })));
        for (const [i, A] of [
                [0, "rgba(148,163,184,0.4)"],
                [2, "rgba(239,68,68,0.3)"],
                [-2, "rgba(34,197,94,0.3)"]
            ]) g.addSeries(me, {
            color: A,
            lineWidth: 1,
            priceLineVisible: !1,
            lastValueVisible: !1,
            lineStyle: 2
        }).setData(d.map(M => ({
            time: M.time,
            value: i
        })));
        l.push(g), v.push(N), E.current = l, p.current = v, l.forEach((i, A) => {
            i.timeScale().subscribeVisibleLogicalRangeChange(f => {
                F.current || !f || (F.current = !0, l.forEach((M, Y) => {
                    if (Y !== A) try {
                        M.timeScale().setVisibleLogicalRange(f)
                    } catch {}
                }), F.current = !1)
            }), i.subscribeCrosshairMove(f => {
                F.current || (F.current = !0, l.forEach((M, Y) => {
                    if (Y !== A) try {
                        f.time ? M.setCrosshairPosition(NaN, f.time, v[Y]) : M.clearCrosshairPosition()
                    } catch {}
                }), F.current = !1)
            })
        }), l.forEach(i => i.timeScale().fitContent());
        const m = new ResizeObserver(() => {
            n.clientWidth > 0 && j.applyOptions({
                width: n.clientWidth
            }), S.clientWidth > 0 && g.applyOptions({
                width: S.clientWidth
            })
        });
        return m.observe(n), m.observe(S), () => {
            m.disconnect(), l.forEach(i => {
                try {
                    i.remove()
                } catch {}
            }), E.current = [], p.current = []
        }
    }, [h, d]), e.jsxs("div", {
        className: "flex-1 overflow-y-auto p-3 space-y-3",
        children: [e.jsxs("div", {
            className: "border border-border/30 rounded overflow-hidden",
            children: [e.jsx("div", {
                className: "px-3 py-1.5 bg-card/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
                children: T
            }), e.jsx("div", {
                ref: w,
                style: {
                    width: "100%",
                    height: 300
                }
            })]
        }), e.jsxs("div", {
            className: "border border-border/30 rounded overflow-hidden",
            children: [e.jsx("div", {
                className: "px-3 py-1.5 bg-card/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
                children: s
            }), e.jsx("div", {
                ref: x,
                style: {
                    width: "100%",
                    height: 300
                }
            })]
        })]
    })
}

function mt() {
    const [d, T] = o.useState("close"), [s, w] = o.useState("252"), [x, E] = o.useState(2), [p, F] = o.useState("zscore"), [n, S] = o.useState(!0), [l, v] = o.useState(null), [j, k] = o.useState("all"), [g, N] = o.useState(0), [m, i] = o.useState(""), A = o.useRef(null), f = () => ({
        min: "",
        max: ""
    }), [M, Y] = o.useState(f()), [O, X] = o.useState(f()), [z, J] = o.useState(f()), [V, B] = o.useState(f()), [I, ee] = o.useState(f()), [c, R] = o.useState(f()), te = [M, O, z, V, I, c].some(t => t.min.trim() !== "" || t.max.trim() !== ""), se = () => {
        Y(f()), X(f()), J(f()), B(f()), ee(f()), R(f())
    }, {
        universeTickers: dt,
        isFiltered: oe,
        filteredTickersList: be,
        allTickers: ve,
        filteredCount: Ce,
        totalCount: Me
    } = Ie(), Re = o.useCallback(() => ({
        metric: d,
        lookback: s,
        zThreshold: x,
        sortBy: p,
        showZScore: n,
        filterMode: j,
        searchQuery: m,
        vfZScore: M,
        vfRatio: O,
        vfChg30: z,
        vfChg90: V,
        vfMean: I,
        vfStd: c
    }), [d, s, x, p, n, j, m, M, O, z, V, I, c]), Ee = o.useCallback(t => {
        t?.metric && T(t.metric), t?.lookback && w(t.lookback), t?.zThreshold && E(t.zThreshold), t?.sortBy && F(t.sortBy), t?.showZScore !== void 0 && S(t.showZScore), t?.filterMode && k(t.filterMode), t?.searchQuery !== void 0 && i(t.searchQuery), t?.vfZScore && Y(t.vfZScore), t?.vfRatio && X(t.vfRatio), t?.vfChg30 && J(t.vfChg30), t?.vfChg90 && B(t.vfChg90), t?.vfMean && ee(t.vfMean), t?.vfStd && R(t.vfStd)
    }, []), Ae = tt();
    Ze("pair-ratios", Re, Ee, {
        universeSig: Ae,
        resultFields: ["searchQuery"]
    });
    const Pe = new Set(["close", "P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2", "Implied Cap Rate", "FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2", "Dividend Yield", "FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2", "EPS FY1", "EPS FY2", "EBITDA FY1", "EBITDA FY2", "FY1 FFO Growth", "FY2 FFO Growth", "FY1 AFFO Growth", "FY2 AFFO Growth", "FY1 EPS Growth", "FY2 EPS Growth"]),
        ce = $e(),
        [, je] = De(),
        Te = o.useCallback((t, a, r) => {
            const u = Pe.has(r) ? r : "close",
                L = ce.getCachedState("pairs") || {};
            ce.pushState("pairs", {
                ...L,
                tickerA: t,
                tickerB: a,
                metricA: u,
                metricB: u
            }), je("/pairs")
        }, [ce, je]),
        K = o.useMemo(() => (oe ? be : ve).filter(a => a.ticker !== "TEST" && a.ticker !== "TST2").map(a => a.ticker).sort(), [oe, be, ve]),
        {
            data: _
        } = Se({
            queryKey: ["global-dates"],
            queryFn: Je
        }),
        {
            data: W,
            isLoading: Ye
        } = Se({
            queryKey: ["pair-ratio-data", K.join(",")],
            queryFn: async () => {
                const t = new Map,
                    a = 20;
                for (let r = 0; r < K.length; r += a) {
                    const u = K.slice(r, r + a);
                    await Promise.all(u.map(async L => {
                        try {
                            const P = await et(L);
                            P && t.set(L, P)
                        } catch {}
                    }))
                }
                return t
            },
            enabled: K.length >= 2
        }),
        G = o.useMemo(() => !W || W.size < 2 || !_ || _.length === 0 ? [] : lt(K, W, _, d, s), [K, W, _, d, s, x]),
        Z = o.useMemo(() => {
            let t = [...G];
            j === "extreme" && (t = t.filter(r => Math.abs(r.zScore) >= x));
            const a = (r, u, L) => {
                const P = u.min.trim() !== "" ? parseFloat(u.min) : null,
                    C = u.max.trim() !== "" ? parseFloat(u.max) : null;
                return P === null && C === null ? r : r.filter(q => {
                    const U = L(q);
                    return !(P !== null && !isNaN(P) && U < P || C !== null && !isNaN(C) && U > C)
                })
            };
            switch (t = a(t, M, r => r.zScore), t = a(t, O, r => r.currentRatio), t = a(t, z, r => r.pctChange30d), t = a(t, V, r => r.pctChange90d), t = a(t, I, r => r.mean), t = a(t, c, r => r.std), p) {
                case "zscore":
                    t.sort((r, u) => Math.abs(u.zScore) - Math.abs(r.zScore));
                    break;
                case "name":
                    t.sort((r, u) => `${r.tickerA}/${r.tickerB}`.localeCompare(`${u.tickerA}/${u.tickerB}`));
                    break;
                case "change30":
                    t.sort((r, u) => Math.abs(u.pctChange30d) - Math.abs(r.pctChange30d));
                    break;
                case "change90":
                    t.sort((r, u) => Math.abs(u.pctChange90d) - Math.abs(r.pctChange90d));
                    break
            }
            return t
        }, [G, j, p, x, M, O, z, V, I, c]),
        $ = o.useMemo(() => {
            if (!m.trim()) return Z;
            const a = m.trim().toUpperCase().split(/[\/\s,]+/).filter(Boolean);
            return a.length === 0 ? Z : a.length === 1 ? Z.filter(r => r.tickerA.includes(a[0]) || r.tickerB.includes(a[0])) : Z.filter(r => r.tickerA.includes(a[0]) && r.tickerB.includes(a[1]) || r.tickerA.includes(a[1]) && r.tickerB.includes(a[0]))
        }, [Z, m]);
    o.useEffect(() => {
        N(0)
    }, [j, p, d, s, x, m, M, O, z, V, I, c]);
    const re = Math.max(1, Math.ceil($.length / 100)),
        Le = o.useMemo(() => $.slice(g * 100, (g + 1) * 100), [$, g]),
        Oe = o.useMemo(() => G.filter(t => Math.abs(t.zScore) >= x).length, [G, x]);
    o.useEffect(() => {
        const t = a => {
            a.key === "/" && !a.ctrlKey && !a.metaKey && document.activeElement?.tagName !== "INPUT" && (a.preventDefault(), A.current?.focus()), a.key === "Escape" && document.activeElement === A.current && (i(""), A.current?.blur())
        };
        return document.addEventListener("keydown", t), () => document.removeEventListener("keydown", t)
    }, []);
    const ze = o.useCallback(() => {
            const t = "Pair,Current Ratio,Z-Score,Mean,Std Dev,30d Chg%,90d Chg%",
                a = Z.map(C => `${C.tickerA}/${C.tickerB},${C.currentRatio.toFixed(4)},${C.zScore.toFixed(3)},${C.mean.toFixed(4)},${C.std.toFixed(4)},${C.pctChange30d.toFixed(2)},${C.pctChange90d.toFixed(2)}`),
                r = [t, ...a].join(`
`),
                u = new Blob([r], {
                    type: "text/csv"
                }),
                L = URL.createObjectURL(u),
                P = document.createElement("a");
            P.href = L, P.download = `pair_ratios_${d}.csv`, P.click(), URL.revokeObjectURL(L)
        }, [Z, d]),
        Q = o.useMemo(() => {
            if (!l || !W || !_) return null;
            const t = W.get(l.tickerA),
                a = W.get(l.tickerB);
            if (!t || !a) return null;
            const r = t[d] || [],
                u = a[d] || [],
                L = new Map;
            for (const [b, y] of r) y != null && isFinite(y) && y !== 0 && L.set(b, y);
            const P = new Map;
            for (const [b, y] of u) y != null && isFinite(y) && y !== 0 && P.set(b, y);
            const C = [];
            for (const [b] of L) P.has(b) && C.push(b);
            C.sort((b, y) => b - y);
            const q = [];
            for (const b of C) {
                if (b >= _.length) continue;
                const y = L.get(b),
                    Ne = P.get(b);
                if (!(y > 0) || !(Ne > 0)) continue;
                const xe = y / Ne;
                isFinite(xe) && !isNaN(xe) && q.push({
                    time: _[b],
                    value: xe
                })
            }
            if (q.length === 0) return null;
            const U = q.map(b => b.value),
                de = U.reduce((b, y) => b + y, 0) / U.length,
                Be = Math.max(1, U.length - 1),
                he = Math.sqrt(U.reduce((b, y) => b + (y - de) ** 2, 0) / Be),
                Ve = q.map(b => ({
                    time: b.time,
                    value: he === 0 ? 0 : (b.value - de) / he
                }));
            return {
                fullRatio: q,
                fullZ: Ve,
                fullMean: de,
                fullStd: he
            }
        }, [l, W, _, d]);
    return l ? e.jsx("div", {
        className: "flex h-full bg-background",
        "data-testid": "pair-ratios-page",
        children: e.jsxs("div", {
            className: "flex-1 flex flex-col overflow-hidden",
            children: [e.jsxs("div", {
                className: "flex items-center gap-3 px-4 py-2 border-b border-border bg-card/50",
                children: [e.jsxs(D, {
                    variant: "ghost",
                    size: "sm",
                    className: "h-7 text-xs gap-1",
                    onClick: () => v(null),
                    children: [e.jsx(_e, {
                        className: "w-3 h-3"
                    }), " Back"]
                }), e.jsxs("div", {
                    className: "text-sm font-bold font-mono",
                    children: [l.tickerA, " / ", l.tickerB]
                }), e.jsxs("div", {
                    className: "text-[11px] text-muted-foreground",
                    children: ["Metric: ", fe.find(t => t.value === d)?.label]
                }), e.jsxs(D, {
                    variant: "outline",
                    size: "sm",
                    className: "h-7 text-[11px] gap-1",
                    title: `Open ${l.tickerA} / ${l.tickerB} in the Pairs deep-dive (13 charts: prices, log ratio, OLS residual Z, rolling β, beta-adj spread, etc.)`,
                    onClick: () => Te(l.tickerA, l.tickerB, d),
                    "data-testid": "open-in-pairs",
                    children: [e.jsx(st, {
                        className: "w-3 h-3"
                    }), " Open in Pairs"]
                }), e.jsxs("div", {
                    className: "flex items-center gap-2 ml-auto",
                    children: [e.jsxs("div", {
                        className: "border border-border/30 rounded px-2 py-1 text-[10px]",
                        children: [e.jsx("span", {
                            className: "text-muted-foreground",
                            children: "Ratio: "
                        }), e.jsx("span", {
                            className: "font-mono font-bold",
                            children: l.currentRatio.toFixed(4)
                        })]
                    }), e.jsxs("div", {
                        className: "border border-border/30 rounded px-2 py-1 text-[10px]",
                        children: [e.jsxs("span", {
                            className: "text-muted-foreground",
                            children: ["Z (", pe.find(t => t.value === s)?.label, "): "]
                        }), e.jsx("span", {
                            className: "font-mono font-bold",
                            style: {
                                color: ge(l.zScore)
                            },
                            children: l.zScore.toFixed(3)
                        })]
                    }), e.jsxs("div", {
                        className: "border border-border/30 rounded px-2 py-1 text-[10px]",
                        children: [e.jsx("span", {
                            className: "text-muted-foreground",
                            children: "μ: "
                        }), e.jsx("span", {
                            className: "font-mono",
                            children: l.mean.toFixed(4)
                        })]
                    }), e.jsxs("div", {
                        className: "border border-border/30 rounded px-2 py-1 text-[10px]",
                        children: [e.jsx("span", {
                            className: "text-muted-foreground",
                            children: "σ: "
                        }), e.jsx("span", {
                            className: "font-mono",
                            children: l.std.toFixed(4)
                        })]
                    }), Q && e.jsxs("div", {
                        className: "border border-border/30 rounded px-2 py-1 text-[10px]",
                        children: [e.jsx("span", {
                            className: "text-muted-foreground",
                            children: "Pts: "
                        }), e.jsx("span", {
                            className: "font-mono",
                            children: Q.fullRatio.length
                        })]
                    })]
                })]
            }), Q ? e.jsx(nt, {
                ratioSeries: Q.fullRatio,
                zScoreSeries: Q.fullZ,
                ratioTitle: `Ratio: ${l.tickerA} / ${l.tickerB} — ${fe.find(t=>t.value===d)?.label} (${Q.fullRatio.length} pts)`,
                zScoreTitle: `Z-Score (±2σ bands — mean/σ from ${pe.find(t=>t.value===s)?.label} window)`
            }) : e.jsx("div", {
                className: "flex items-center justify-center h-full text-muted-foreground text-sm",
                children: "Loading chart data..."
            })]
        })
    }) : e.jsxs("div", {
        className: "flex h-full bg-background",
        "data-testid": "pair-ratios-page",
        children: [e.jsxs("div", {
            className: "w-[240px] border-r border-border bg-card flex flex-col flex-shrink-0 overflow-y-auto",
            children: [e.jsxs("div", {
                className: "px-3 py-2 border-b border-border",
                children: [e.jsx("div", {
                    className: "text-xs font-bold tracking-tight",
                    children: "Pair Ratios"
                }), e.jsx("div", {
                    className: "text-[10px] text-muted-foreground mt-0.5",
                    children: oe ? `${Ce} tickers (filtered)` : `${Me} tickers (all)`
                })]
            }), e.jsxs("div", {
                className: "p-3 space-y-3 flex-1",
                children: [e.jsxs("div", {
                    className: "space-y-1",
                    children: [e.jsx("div", {
                        className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
                        children: "Ratio Metric"
                    }), e.jsxs(ae, {
                        value: d,
                        onValueChange: T,
                        children: [e.jsx(le, {
                            className: "h-7 text-[11px]",
                            "data-testid": "ratio-metric",
                            children: e.jsx(ne, {})
                        }), e.jsx(ie, {
                            children: fe.map(t => e.jsx(H, {
                                value: t.value,
                                children: t.label
                            }, t.value))
                        })]
                    })]
                }), e.jsxs("div", {
                    className: "space-y-1",
                    children: [e.jsx("div", {
                        className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
                        children: "Lookback"
                    }), e.jsxs(ae, {
                        value: s,
                        onValueChange: w,
                        children: [e.jsx(le, {
                            className: "h-7 text-[11px]",
                            "data-testid": "ratio-lookback",
                            children: e.jsx(ne, {})
                        }), e.jsx(ie, {
                            children: pe.map(t => e.jsx(H, {
                                value: t.value,
                                children: t.label
                            }, t.value))
                        })]
                    })]
                }), e.jsxs("div", {
                    className: "space-y-1",
                    children: [e.jsx("div", {
                        className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
                        children: "Z-Score Threshold"
                    }), e.jsxs(ae, {
                        value: String(x),
                        onValueChange: t => E(parseFloat(t)),
                        children: [e.jsx(le, {
                            className: "h-7 text-[11px]",
                            "data-testid": "ratio-z-thresh",
                            children: e.jsx(ne, {})
                        }), e.jsx(ie, {
                            children: rt.map(t => e.jsxs(H, {
                                value: String(t),
                                children: ["±", t, "σ"]
                            }, t))
                        })]
                    })]
                }), e.jsxs("div", {
                    className: "space-y-1",
                    children: [e.jsx("div", {
                        className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
                        children: "Sort By"
                    }), e.jsxs(ae, {
                        value: p,
                        onValueChange: t => F(t),
                        children: [e.jsx(le, {
                            className: "h-7 text-[11px]",
                            "data-testid": "ratio-sort",
                            children: e.jsx(ne, {})
                        }), e.jsxs(ie, {
                            children: [e.jsx(H, {
                                value: "zscore",
                                children: "|Z-Score| (extreme first)"
                            }), e.jsx(H, {
                                value: "name",
                                children: "Name (A-Z)"
                            }), e.jsx(H, {
                                value: "change30",
                                children: "|30d Change|"
                            }), e.jsx(H, {
                                value: "change90",
                                children: "|90d Change|"
                            })]
                        })]
                    })]
                }), e.jsxs("div", {
                    className: "space-y-1",
                    children: [e.jsx("div", {
                        className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
                        children: "Show"
                    }), e.jsxs("div", {
                        className: "flex gap-1",
                        children: [e.jsxs(D, {
                            variant: j === "all" ? "default" : "secondary",
                            size: "sm",
                            className: "flex-1 h-6 text-[10px]",
                            onClick: () => k("all"),
                            children: ["All (", G.length, ")"]
                        }), e.jsxs(D, {
                            variant: j === "extreme" ? "default" : "secondary",
                            size: "sm",
                            className: "flex-1 h-6 text-[10px]",
                            onClick: () => k("extreme"),
                            children: ["Extreme (", Oe, ")"]
                        })]
                    })]
                }), e.jsxs("div", {
                    className: "space-y-1.5",
                    children: [e.jsxs("div", {
                        className: "flex items-center justify-between",
                        children: [e.jsxs("div", {
                            className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider flex items-center gap-1",
                            children: [e.jsx(We, {
                                className: "w-3 h-3"
                            }), " Value Filters"]
                        }), te && e.jsxs("button", {
                            onClick: se,
                            className: "text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors",
                            title: "Clear all value filters",
                            children: [e.jsx(Ge, {
                                className: "w-2.5 h-2.5"
                            }), " Reset"]
                        })]
                    }), [{
                        label: "Z-Score",
                        vf: M,
                        set: Y
                    }, {
                        label: "Ratio",
                        vf: O,
                        set: X
                    }, {
                        label: "30d Chg%",
                        vf: z,
                        set: J
                    }, {
                        label: "90d Chg%",
                        vf: V,
                        set: B
                    }, {
                        label: "Mean",
                        vf: I,
                        set: ee
                    }, {
                        label: "Std",
                        vf: c,
                        set: R
                    }].map(({
                        label: t,
                        vf: a,
                        set: r
                    }) => e.jsxs("div", {
                        className: "flex items-center gap-1",
                        children: [e.jsx("span", {
                            className: "text-[9px] text-muted-foreground w-[52px] flex-shrink-0 truncate",
                            title: t,
                            children: t
                        }), e.jsx(ue, {
                            type: "text",
                            inputMode: "decimal",
                            placeholder: "Min",
                            value: a.min,
                            onChange: u => r({
                                ...a,
                                min: u.target.value
                            }),
                            className: "h-5 text-[10px] font-mono px-1.5 flex-1 min-w-0"
                        }), e.jsx(ue, {
                            type: "text",
                            inputMode: "decimal",
                            placeholder: "Max",
                            value: a.max,
                            onChange: u => r({
                                ...a,
                                max: u.target.value
                            }),
                            className: "h-5 text-[10px] font-mono px-1.5 flex-1 min-w-0"
                        })]
                    }, t)), te && e.jsxs("div", {
                        className: "text-[9px] text-muted-foreground",
                        children: [Z.length.toLocaleString(), " pairs match filters"]
                    })]
                }), e.jsxs("div", {
                    className: "border border-border/30 rounded p-2 bg-card/30 space-y-1",
                    children: [e.jsx("div", {
                        className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
                        children: "Summary"
                    }), e.jsxs("div", {
                        className: "text-[11px] font-mono space-y-0.5",
                        children: [e.jsxs("div", {
                            children: ["Total pairs:", " ", e.jsx("span", {
                                className: "font-bold",
                                children: G.length
                            })]
                        }), e.jsxs("div", {
                            children: ["Above +", x, "σ:", " ", e.jsx("span", {
                                className: "font-bold text-red-400",
                                children: G.filter(t => t.zScore >= x).length
                            })]
                        }), e.jsxs("div", {
                            children: ["Below -", x, "σ:", " ", e.jsx("span", {
                                className: "font-bold text-green-400",
                                children: G.filter(t => t.zScore <= -x).length
                            })]
                        })]
                    })]
                }), e.jsxs(D, {
                    variant: "outline",
                    size: "sm",
                    className: "w-full h-7 text-xs gap-1.5",
                    onClick: ze,
                    disabled: Z.length === 0,
                    children: [e.jsx(Ke, {
                        className: "w-3 h-3"
                    }), " Export CSV"]
                })]
            })]
        }), e.jsx("div", {
            className: "flex-1 flex flex-col overflow-hidden min-h-0",
            children: Ye ? e.jsxs("div", {
                className: "flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-sm",
                children: [e.jsx(qe, {
                    className: "w-5 h-5 animate-spin"
                }), "Loading ticker data..."]
            }) : K.length < 2 ? e.jsx("div", {
                className: "flex items-center justify-center h-full text-muted-foreground text-sm",
                children: "Apply a Universe filter with at least 2 tickers to see pair ratios"
            }) : e.jsxs("div", {
                className: "flex-1 flex flex-col overflow-hidden min-h-0",
                children: [e.jsxs("div", {
                    className: "flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/50 flex-shrink-0",
                    children: [e.jsx(Ue, {
                        className: "w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
                    }), e.jsx(ue, {
                        ref: A,
                        type: "text",
                        placeholder: 'Search pairs — e.g. "AMT", "AMT/SBAC", "PLD REXR"',
                        value: m,
                        onChange: t => i(t.target.value),
                        className: "h-6 text-[11px] font-mono bg-transparent border-none shadow-none focus-visible:ring-0 px-0 placeholder:text-muted-foreground/50",
                        "data-testid": "pair-search"
                    }), m && e.jsx("button", {
                        onClick: () => {
                            i(""), A.current?.focus()
                        },
                        className: "text-muted-foreground hover:text-foreground transition-colors flex-shrink-0",
                        children: e.jsx(He, {
                            className: "w-3.5 h-3.5"
                        })
                    }), m.trim() && e.jsxs("span", {
                        className: "text-[10px] text-muted-foreground whitespace-nowrap",
                        children: [$.length.toLocaleString(), " match", $.length !== 1 ? "es" : ""]
                    })]
                }), e.jsxs("div", {
                    className: "flex-1 overflow-auto",
                    children: [e.jsxs("table", {
                        className: "w-full table-fixed text-[11px] font-mono",
                        children: [e.jsx("thead", {
                            className: "sticky top-0 z-10 bg-card border-b border-border",
                            children: e.jsxs("tr", {
                                children: [e.jsx("th", {
                                    className: "text-left px-3 py-2 font-semibold text-muted-foreground w-[140px]",
                                    children: "Pair (A/B)"
                                }), e.jsx("th", {
                                    className: "text-right px-2 py-2 font-semibold text-muted-foreground w-[90px]",
                                    children: "Ratio"
                                }), e.jsx("th", {
                                    className: "text-right px-2 py-2 font-semibold text-muted-foreground w-[70px]",
                                    children: "Z-Score"
                                }), e.jsx("th", {
                                    className: "text-right px-2 py-2 font-semibold text-muted-foreground w-[60px]",
                                    children: "Mean"
                                }), e.jsx("th", {
                                    className: "text-right px-2 py-2 font-semibold text-muted-foreground w-[60px]",
                                    children: "Std"
                                }), e.jsx("th", {
                                    className: "text-right px-2 py-2 font-semibold text-muted-foreground w-[65px]",
                                    children: "30d Chg"
                                }), e.jsx("th", {
                                    className: "text-right px-2 py-2 font-semibold text-muted-foreground w-[65px]",
                                    children: "90d Chg"
                                }), e.jsx("th", {
                                    className: "px-2 py-2 font-semibold text-muted-foreground w-[180px] min-w-[180px] max-w-[180px]",
                                    children: "Ratio Z-Score Chart"
                                })]
                            })
                        }), e.jsx("tbody", {
                            children: Le.map((t, a) => e.jsxs("tr", {
                                className: "border-b border-border/20 hover:bg-accent/30 cursor-pointer group",
                                style: {
                                    backgroundColor: at(t.zScore)
                                },
                                onClick: () => v(t),
                                "data-testid": `pair-row-${a}`,
                                children: [e.jsxs("td", {
                                    className: "px-3 py-1.5 font-bold",
                                    children: [e.jsx("span", {
                                        className: "text-foreground",
                                        children: t.tickerA
                                    }), e.jsx("span", {
                                        className: "text-muted-foreground/60",
                                        children: "/"
                                    }), e.jsx("span", {
                                        className: "text-foreground",
                                        children: t.tickerB
                                    })]
                                }), e.jsx("td", {
                                    className: "text-right px-2 py-1.5",
                                    children: t.currentRatio.toFixed(3)
                                }), e.jsx("td", {
                                    className: "text-right px-2 py-1.5",
                                    children: e.jsxs("span", {
                                        className: "font-bold",
                                        style: {
                                            color: ge(t.zScore)
                                        },
                                        children: [t.zScore >= 0 ? "+" : "", t.zScore.toFixed(2)]
                                    })
                                }), e.jsx("td", {
                                    className: "text-right px-2 py-1.5 text-muted-foreground",
                                    children: t.mean.toFixed(3)
                                }), e.jsx("td", {
                                    className: "text-right px-2 py-1.5 text-muted-foreground",
                                    children: t.std.toFixed(3)
                                }), e.jsx("td", {
                                    className: "text-right px-2 py-1.5",
                                    children: e.jsxs("span", {
                                        style: {
                                            color: t.pctChange30d > 0 ? "#22c55e" : t.pctChange30d < 0 ? "#ef4444" : "#94a3b8"
                                        },
                                        children: [t.pctChange30d >= 0 ? "+" : "", t.pctChange30d.toFixed(1), "%"]
                                    })
                                }), e.jsx("td", {
                                    className: "text-right px-2 py-1.5",
                                    children: e.jsxs("span", {
                                        style: {
                                            color: t.pctChange90d > 0 ? "#22c55e" : t.pctChange90d < 0 ? "#ef4444" : "#94a3b8"
                                        },
                                        children: [t.pctChange90d >= 0 ? "+" : "", t.pctChange90d.toFixed(1), "%"]
                                    })
                                }), e.jsx("td", {
                                    className: "px-2 py-0.5 w-[180px] min-w-[180px] max-w-[180px]",
                                    children: e.jsx(ct, {
                                        pair: t
                                    })
                                })]
                            }, `${t.tickerA}-${t.tickerB}`))
                        })]
                    }), $.length > 100 && e.jsxs("div", {
                        className: "flex items-center justify-between px-3 py-2 border-t border-border bg-card/50 text-xs",
                        children: [e.jsxs("span", {
                            className: "text-muted-foreground",
                            children: ["Showing ", g * 100 + 1, "–", Math.min((g + 1) * 100, $.length), " of ", $.length.toLocaleString(), " pairs"]
                        }), e.jsxs("div", {
                            className: "flex items-center gap-1",
                            children: [e.jsx(D, {
                                variant: "ghost",
                                size: "sm",
                                className: "h-6 px-2 text-[10px]",
                                disabled: g === 0,
                                onClick: () => N(0),
                                children: "First"
                            }), e.jsx(D, {
                                variant: "ghost",
                                size: "sm",
                                className: "h-6 px-2 text-[10px]",
                                disabled: g === 0,
                                onClick: () => N(t => t - 1),
                                children: "Prev"
                            }), e.jsxs("span", {
                                className: "px-2 font-mono text-muted-foreground",
                                children: [g + 1, " / ", re]
                            }), e.jsx(D, {
                                variant: "ghost",
                                size: "sm",
                                className: "h-6 px-2 text-[10px]",
                                disabled: g >= re - 1,
                                onClick: () => N(t => t + 1),
                                children: "Next"
                            }), e.jsx(D, {
                                variant: "ghost",
                                size: "sm",
                                className: "h-6 px-2 text-[10px]",
                                disabled: g >= re - 1,
                                onClick: () => N(re - 1),
                                children: "Last"
                            })]
                        })]
                    }), $.length === 0 && e.jsx("div", {
                        className: "flex items-center justify-center h-[200px] text-muted-foreground text-sm",
                        children: m.trim() ? `No pairs matching "${m.trim()}"` : j === "extreme" ? `No pairs beyond ±${x}σ` : "No valid pairs found"
                    })]
                })]
            })
        })]
    })
}
const ye = 160,
    we = 28,
    it = 100;

function ot(h, d) {
    if (h.length <= d) return h;
    const T = (h.length - 1) / (d - 1),
        s = [];
    for (let w = 0; w < d; w++) s.push(h[Math.round(w * T)]);
    return s
}

function ct({
    pair: h
}) {
    const d = o.useRef(null);
    return o.useEffect(() => {
        const T = d.current;
        if (!T || h.zScoreSeries.length === 0) return;
        const s = T.getContext("2d");
        if (!s) return;
        const w = window.devicePixelRatio || 1,
            x = ye,
            E = we;
        T.width = x * w, T.height = E * w, s.scale(w, w), s.clearRect(0, 0, x, E);
        const p = ot(h.zScoreSeries, it),
            F = Math.max(3, ...p.map(N => Math.abs(N.value))),
            n = 2,
            S = x - n * 2,
            l = E - n * 2,
            v = n + l / 2,
            j = v - 2 / F * (l / 2),
            k = v + 2 / F * (l / 2);
        s.fillStyle = "rgba(239,68,68,0.06)", s.fillRect(n, n, S, j - n), s.fillStyle = "rgba(34,197,94,0.06)", s.fillRect(n, k, S, E - n - k), s.strokeStyle = "rgba(255,255,255,0.1)", s.lineWidth = .5, s.beginPath(), s.moveTo(n, v), s.lineTo(x - n, v), s.stroke(), s.strokeStyle = "rgba(255,255,255,0.08)", s.setLineDash([2, 2]), s.beginPath(), s.moveTo(n, j), s.lineTo(x - n, j), s.stroke(), s.beginPath(), s.moveTo(n, k), s.lineTo(x - n, k), s.stroke(), s.setLineDash([]), s.strokeStyle = "#0ea5e9", s.lineWidth = 1, s.beginPath();
        for (let N = 0; N < p.length; N++) {
            const m = n + N / (p.length - 1) * S,
                i = v - p[N].value / F * (l / 2);
            N === 0 ? s.moveTo(m, i) : s.lineTo(m, i)
        }
        s.stroke();
        const g = v - p[p.length - 1].value / F * (l / 2);
        s.beginPath(), s.arc(x - n, g, 2, 0, Math.PI * 2), s.fillStyle = ge(h.zScore), s.fill()
    }, [h]), e.jsx("canvas", {
        ref: d,
        style: {
            width: ye,
            height: we
        },
        className: "block"
    })
}
export {
    mt as
    default
};