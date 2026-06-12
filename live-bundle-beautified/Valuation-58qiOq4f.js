import {
    a as Q,
    r as p,
    e as X,
    s as J,
    f as ee,
    g as te,
    b as ne,
    h as se,
    j as t,
    o as R,
    p as G,
    q as B,
    t as V,
    v as j,
    I as re,
    B as le,
    z as ae,
    y as ie,
    R as oe,
    E as ce,
    A as ue,
    N as U,
    w as de,
    bx as xe
} from "./index-CsG73Aq_.js";
import {
    A as me
} from "./arrow-up-down-CNMI3GZb.js";
import {
    E as he
} from "./external-link-Cy9_YAtA.js";
const _ = {
    Valuation: ["P/FFO FY2", "P/FFO LTM", "P/AFFO FY2", "P/AFFO LTM", "P/E FY2", "P/E LTM", "P/S FY2", "P/S LTM", "EV/EBITDA FY2", "EV/EBITDA LTM", "Implied Cap Rate"],
    Yields: ["FFO Yield FY2", "FFO Yield LTM", "AFFO Yield FY2", "AFFO Yield LTM", "Dividend Yield"],
    Growth: ["FY1 FFO Growth", "FY2 FFO Growth", "FY1 AFFO Growth", "FY2 AFFO Growth", "FY1 EPS Growth", "FY2 EPS Growth"]
};
Object.values(_).flat();
const D = [{
    label: "1 Year",
    value: 252
}, {
    label: "2 Year",
    value: 504
}, {
    label: "3 Year",
    value: 756
}, {
    label: "5 Year",
    value: 1260
}, {
    label: "7 Year",
    value: 1764
}, {
    label: "10 Year",
    value: 2520
}, {
    label: "All",
    value: 99999
}];

function pe(a) {
    if (a.length === 0) return {
        mean: 0,
        std: 0
    };
    const i = a.reduce((u, b) => u + b, 0) / a.length,
        h = a.reduce((u, b) => u + (b - i) ** 2, 0) / a.length;
    return {
        mean: i,
        std: Math.sqrt(h)
    }
}

function fe({
    values: a,
    mean: i,
    std: h,
    current: u,
    width: b = 120,
    height: v = 32
}) {
    const z = p.useRef(null);
    return p.useEffect(() => {
        const d = z.current;
        if (!d || a.length < 2) return;
        const s = d.getContext("2d"),
            N = window.devicePixelRatio || 1;
        d.width = b * N, d.height = v * N, d.style.width = `${b}px`, d.style.height = `${v}px`, s.scale(N, N);
        let L = [...a];
        i !== null && h !== null && L.push(i + 2 * h, i - 2 * h);
        const k = Math.min(...L),
            Y = Math.max(...L) - k || 1,
            f = 2,
            C = b - 2 * f,
            E = v - 2 * f,
            g = x => f + E - (x - k) / Y * E,
            O = x => f + x / (a.length - 1) * C;
        if (s.clearRect(0, 0, b, v), i !== null && h !== null) {
            const x = g(i + h),
                S = g(i - h);
            s.fillStyle = "rgba(14, 165, 233, 0.07)", s.fillRect(f, x, C, S - x), s.beginPath(), s.strokeStyle = "rgba(14, 165, 233, 0.35)", s.lineWidth = .8, s.setLineDash([3, 3]);
            const T = g(i);
            s.moveTo(f, T), s.lineTo(f + C, T), s.stroke(), s.setLineDash([]), s.beginPath(), s.strokeStyle = "rgba(14, 165, 233, 0.15)", s.lineWidth = .5, s.setLineDash([2, 2]);
            const M = g(i + h);
            s.moveTo(f, M), s.lineTo(f + C, M), s.stroke(), s.beginPath();
            const y = g(i - h);
            s.moveTo(f, y), s.lineTo(f + C, y), s.stroke(), s.setLineDash([])
        }
        let I = "rgba(14, 165, 233, 0.7)";
        if (i !== null && h !== null && u !== null && h > 0) {
            const x = (u - i) / h;
            x < -1 ? I = "rgba(34, 197, 94, 0.75)" : x > 1 && (I = "rgba(239, 68, 68, 0.75)")
        }
        s.beginPath(), s.strokeStyle = I, s.lineWidth = 1.2;
        for (let x = 0; x < a.length; x++) {
            const S = O(x),
                T = g(a[x]);
            x === 0 ? s.moveTo(S, T) : s.lineTo(S, T)
        }
        if (s.stroke(), u !== null) {
            const x = f + C,
                S = g(u);
            s.beginPath(), s.arc(x, S, 2.5, 0, Math.PI * 2), s.fillStyle = I, s.fill()
        }
    }, [a, i, h, u, b, v]), a.length < 2 ? t.jsx("span", {
        className: "text-[10px] text-muted-foreground/40",
        children: "—"
    }) : t.jsx("canvas", {
        ref: z,
        style: {
            width: b,
            height: v
        }
    })
}

function q(a) {
    return a === null ? "" : a <= -2 ? "text-green-400 font-semibold" : a <= -1 ? "text-green-400" : a <= -.5 ? "text-green-300/80" : a >= 2 ? "text-red-400 font-semibold" : a >= 1 ? "text-red-400" : a >= .5 ? "text-red-300/80" : "text-muted-foreground"
}

function ge(a) {
    return a === null ? "" : a <= -2 ? "bg-green-500/10" : a <= -1 ? "bg-green-500/5" : a >= 2 ? "bg-red-500/10" : a >= 1 ? "bg-red-500/5" : ""
}

function ye() {
    const {
        universeTickers: a
    } = Q(), [i, h] = p.useState("P/FFO FY2"), [u, b] = p.useState(1260), [v, z] = p.useState("zScore"), [d, s] = p.useState("asc"), [N, L] = p.useState(""), [k, $] = p.useState(X), [Y, f] = p.useState(new Set), [C, E] = p.useState(new Set), [g, O] = p.useState("none"), I = p.useCallback(() => ({
        metric: i,
        lookback: u,
        sortCol: v,
        sortDir: d,
        classFilters: J(k),
        manualTickers: [...Y],
        groupByLevel: g
    }), [i, u, v, d, k, Y, g]), x = p.useCallback(e => {
        e.metric !== void 0 && h(e.metric), e.lookback !== void 0 && b(e.lookback), e.sortCol !== void 0 && z(e.sortCol), e.sortDir !== void 0 && s(e.sortDir), e.classFilters !== void 0 && $(ee(e.classFilters)), e.manualTickers !== void 0 && f(new Set(e.manualTickers)), e.groupByLevel !== void 0 ? O(e.groupByLevel) : e.groupBySubind !== void 0 && O(e.groupBySubind ? "subindustry" : "none")
    }, []);
    te("valuation", I, x);
    const {
        data: S = [],
        isLoading: T
    } = ne({
        queryKey: ["valuation-trailing", i, u],
        queryFn: () => xe(i, u)
    }), M = p.useMemo(() => S.filter(e => e.values.length > 20).map(e => {
        const {
            mean: n,
            std: l
        } = pe(e.values), o = e.current, c = o !== null && l > 0 ? (o - n) / l : null, m = o !== null && e.values.length > 1 ? e.values.filter(F => F < o).length / (e.values.length - 1) * 100 : o !== null && e.values.length === 1 ? 50 : null, r = o !== null && n !== 0 ? (o - n) / n * 100 : null;
        return {
            ticker: e.ticker,
            name: e.name,
            economy: e.economy,
            sector: e.sector,
            subsector: e.subsector,
            industryGroup: e.industryGroup,
            industry: e.industry,
            subindustry: e.subindustry,
            current: o,
            mean5Y: n,
            std5Y: l,
            zScore: c,
            histPctile: m,
            premium: r,
            values: e.values,
            dates: e.dates
        }
    }), [S]), y = p.useMemo(() => {
        let e = M.filter(n => n.current !== null);
        return a && (e = e.filter(n => a.has(n.ticker))), e = se(e, k, N, Y), e.sort((n, l) => {
            const o = r => {
                switch (v) {
                    case "ticker":
                        return 0;
                    case "current":
                        return r.current ?? (d === "asc" ? 1 / 0 : -1 / 0);
                    case "mean5Y":
                        return r.mean5Y ?? (d === "asc" ? 1 / 0 : -1 / 0);
                    case "std5Y":
                        return r.std5Y ?? (d === "asc" ? 1 / 0 : -1 / 0);
                    case "zScore":
                        return r.zScore ?? (d === "asc" ? 1 / 0 : -1 / 0);
                    case "histPctile":
                        return r.histPctile ?? (d === "asc" ? 1 / 0 : -1 / 0);
                    case "premium":
                        return r.premium ?? (d === "asc" ? 1 / 0 : -1 / 0);
                    default:
                        return r.zScore ?? (d === "asc" ? 1 / 0 : -1 / 0)
                }
            };
            if (v === "ticker") return d === "asc" ? n.ticker.localeCompare(l.ticker) : l.ticker.localeCompare(n.ticker);
            const c = o(n),
                m = o(l);
            return d === "asc" ? c - m : m - c
        })
    }, [M, v, d, N, k, Y, a]), Z = p.useMemo(() => {
        if (g === "none") return null;
        const e = new Map;
        for (const n of y) {
            const l = n[g] || "Other";
            e.has(l) || e.set(l, []), e.get(l).push(n)
        }
        return Array.from(e.entries()).sort((n, l) => {
            const o = c => {
                const m = c.filter(r => r.zScore !== null);
                return m.length === 0 ? 0 : m.reduce((r, F) => r + F.zScore, 0) / m.length
            };
            return o(n[1]) - o(l[1])
        })
    }, [y, g]), W = e => {
        E(n => {
            const l = new Set(n);
            return l.has(e) ? l.delete(e) : l.add(e), l
        })
    }, K = e => {
        v === e ? s(d === "asc" ? "desc" : "asc") : (z(e), s("asc"))
    }, H = () => {
        const e = ["Rank", "Ticker", "Name", "Subindustry", `Current ${i}`, "5Y Mean", "5Y Std Dev", "Z-Score", "Pctile", "Premium/Disc %"],
            n = y.map((r, F) => [F + 1, r.ticker, `"${r.name}"`, `"${r.subindustry}"`, r.current?.toFixed(2) ?? "", r.mean5Y?.toFixed(2) ?? "", r.std5Y?.toFixed(2) ?? "", r.zScore?.toFixed(2) ?? "", r.histPctile?.toFixed(1) ?? "", r.premium?.toFixed(1) ?? ""].join(",")),
            l = [e.join(","), ...n].join(`
`),
            o = new Blob([l], {
                type: "text/csv"
            }),
            c = URL.createObjectURL(o),
            m = document.createElement("a");
        m.href = c, m.download = `valuation_${i.replace(/[^a-zA-Z0-9]/g,"_")}.csv`, m.click(), URL.revokeObjectURL(c)
    }, A = p.useMemo(() => {
        const e = y.filter(r => r.zScore !== null);
        if (e.length === 0) return null;
        const n = e.filter(r => r.zScore < -1).length,
            l = e.filter(r => r.zScore >= -1 && r.zScore <= 1).length,
            o = e.filter(r => r.zScore > 1).length,
            c = [...e].sort((r, F) => r.zScore - F.zScore)[Math.floor(e.length / 2)].zScore,
            m = e.reduce((r, F) => r + F.zScore, 0) / e.length;
        return {
            cheapCount: n,
            fairCount: l,
            richCount: o,
            medianZ: c,
            avgZ: m,
            total: e.length
        }
    }, [y]), P = ({
        col: e,
        label: n,
        className: l = ""
    }) => t.jsx("th", {
        className: `px-2 py-1.5 text-muted-foreground font-medium ${l}`,
        children: t.jsxs("button", {
            className: "inline-flex items-center gap-0.5 hover:text-foreground",
            onClick: () => K(e),
            "data-testid": `sort-${e}`,
            children: [n, t.jsx(me, {
                className: "w-2.5 h-2.5"
            })]
        })
    }), w = (e, n) => t.jsxs("tr", {
        className: `group border-b border-border/20 hover:bg-accent/30 transition-colors cursor-pointer ${ge(e.zScore)}`,
        onClick: () => U(e.ticker),
        "data-testid": `val-row-${e.ticker}`,
        children: [t.jsx("td", {
            className: "px-2 py-1 text-muted-foreground font-mono tabular-nums text-center",
            children: n + 1
        }), t.jsx("td", {
            className: "px-2 py-1 font-mono font-bold",
            children: t.jsxs("button", {
                className: "text-primary hover:text-primary/80 hover:underline inline-flex items-center gap-0.5",
                onClick: l => {
                    l.stopPropagation(), U(e.ticker)
                },
                children: [e.ticker, t.jsx(he, {
                    className: "w-2.5 h-2.5 opacity-0 group-hover:opacity-60"
                })]
            })
        }), t.jsx("td", {
            className: "px-2 py-1 text-foreground truncate max-w-[140px]",
            children: e.name
        }), t.jsx("td", {
            className: "px-2 py-1 text-muted-foreground text-[10px] truncate",
            children: e.subindustry.replace(" Equity REITs", "")
        }), t.jsx("td", {
            className: "px-2 py-1 text-right font-mono tabular-nums",
            children: e.current?.toFixed(1) ?? "—"
        }), t.jsx("td", {
            className: "px-2 py-1 text-right font-mono tabular-nums text-muted-foreground",
            children: e.mean5Y?.toFixed(1) ?? "—"
        }), t.jsx("td", {
            className: "px-2 py-1 text-right font-mono tabular-nums text-muted-foreground/60",
            children: e.std5Y?.toFixed(2) ?? "—"
        }), t.jsx("td", {
            className: `px-2 py-1 text-right font-mono tabular-nums ${q(e.zScore)}`,
            children: e.zScore !== null ? e.zScore.toFixed(2) : "—"
        }), t.jsx("td", {
            className: `px-2 py-1 text-right font-mono tabular-nums ${e.histPctile!==null?e.histPctile<20?"text-green-400":e.histPctile>80?"text-red-400":"text-muted-foreground":""}`,
            children: e.histPctile !== null ? `${e.histPctile.toFixed(0)}%` : "—"
        }), t.jsx("td", {
            className: `px-2 py-1 text-right font-mono tabular-nums ${e.premium!==null?e.premium<-10?"text-green-400":e.premium>10?"text-red-400":"text-muted-foreground":""}`,
            children: e.premium !== null ? `${e.premium>0?"+":""}${e.premium.toFixed(1)}%` : "—"
        }), t.jsx("td", {
            className: "px-1 py-1",
            children: t.jsx(fe, {
                values: e.values,
                mean: e.mean5Y,
                std: e.std5Y,
                current: e.current
            })
        })]
    }, e.ticker);
    return t.jsxs("div", {
        className: "flex flex-col h-full bg-background",
        "data-testid": "valuation-page",
        children: [t.jsxs("div", {
            className: "flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card flex-wrap",
            children: [t.jsx("span", {
                className: "text-xs font-semibold text-muted-foreground",
                children: "Metric"
            }), t.jsxs(R, {
                value: i,
                onValueChange: h,
                children: [t.jsx(G, {
                    className: "h-6 text-[11px] w-[180px]",
                    "data-testid": "val-metric-select",
                    children: t.jsx(B, {})
                }), t.jsxs(V, {
                    className: "max-h-[420px]",
                    children: [Object.entries(_).map(([e, n]) => t.jsxs("div", {
                        children: [t.jsx("div", {
                            className: "px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
                            children: e
                        }), n.map(l => t.jsx(j, {
                            value: l,
                            children: l
                        }, l))]
                    }, e)), (() => {
                        const e = de();
                        return e.length > 0 ? t.jsxs(t.Fragment, {
                            children: [t.jsx("div", {
                                className: "px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider",
                                children: "Uploaded Fundamental"
                            }), e.map(n => t.jsx(j, {
                                value: n,
                                children: n
                            }, n))]
                        }) : null
                    })()]
                })]
            }), t.jsx("div", {
                className: "h-5 w-px bg-border mx-1"
            }), t.jsx("span", {
                className: "text-xs font-semibold text-muted-foreground",
                children: "Lookback"
            }), t.jsxs(R, {
                value: D.find(e => e.value === u) ? String(u) : "custom",
                onValueChange: e => {
                    e !== "custom" && b(parseInt(e))
                },
                children: [t.jsx(G, {
                    className: "h-6 text-[11px] w-[90px]",
                    "data-testid": "val-lookback",
                    children: t.jsx(B, {
                        children: D.find(e => e.value === u)?.label ?? `${u}d`
                    })
                }), t.jsxs(V, {
                    children: [D.map(e => t.jsx(j, {
                        value: String(e.value),
                        children: e.label
                    }, e.value)), t.jsx(j, {
                        value: "custom",
                        children: "Custom..."
                    })]
                })]
            }), !D.find(e => e.value === u) && t.jsx(re, {
                type: "number",
                className: "h-6 text-[11px] w-[65px] font-mono px-1.5",
                value: u,
                min: 20,
                max: 1e4,
                onChange: e => {
                    const n = parseInt(e.target.value);
                    n >= 20 && b(n)
                },
                placeholder: "days"
            }), t.jsx("div", {
                className: "h-5 w-px bg-border mx-1"
            }), t.jsxs(R, {
                value: g,
                onValueChange: e => {
                    O(e), E(new Set)
                },
                children: [t.jsx(G, {
                    className: "h-6 text-[11px] w-[120px]",
                    "data-testid": "val-group-select",
                    children: t.jsx(B, {
                        placeholder: "Group by"
                    })
                }), t.jsxs(V, {
                    children: [t.jsx(j, {
                        value: "none",
                        children: "No grouping"
                    }), t.jsx(j, {
                        value: "economy",
                        children: "Economy"
                    }), t.jsx(j, {
                        value: "sector",
                        children: "Sector"
                    }), t.jsx(j, {
                        value: "subsector",
                        children: "Subsector"
                    }), t.jsx(j, {
                        value: "industryGroup",
                        children: "Industry Group"
                    }), t.jsx(j, {
                        value: "industry",
                        children: "Industry"
                    }), t.jsx(j, {
                        value: "subindustry",
                        children: "Subindustry"
                    })]
                })]
            }), A && t.jsxs("div", {
                className: "flex items-center gap-2 ml-auto mr-2",
                children: [t.jsxs("span", {
                    className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 font-mono",
                    children: ["Cheap: ", A.cheapCount]
                }), t.jsxs("span", {
                    className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground font-mono",
                    children: ["Fair: ", A.fairCount]
                }), t.jsxs("span", {
                    className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 font-mono",
                    children: ["Rich: ", A.richCount]
                }), t.jsxs("span", {
                    className: "text-[10px] text-muted-foreground/60 font-mono",
                    children: ["Med Z: ", A.medianZ.toFixed(2)]
                })]
            }), t.jsxs(le, {
                variant: "outline",
                size: "sm",
                className: "h-6 gap-1 text-[11px]",
                onClick: H,
                "data-testid": "val-export",
                children: [t.jsx(ae, {
                    className: "w-3 h-3"
                }), "CSV"]
            })]
        }), t.jsx("div", {
            className: "flex items-center gap-1.5 px-3 py-1 border-b border-border/50 flex-wrap",
            children: t.jsx(ie, {
                filters: k,
                onFiltersChange: $,
                search: N,
                onSearchChange: L,
                manualTickers: Y,
                onManualTickersChange: f,
                filteredCount: y.length,
                totalCount: M.length,
                testIdPrefix: "val"
            })
        }), t.jsx("div", {
            className: "flex-1 overflow-auto",
            children: T ? t.jsx("div", {
                className: "flex items-center justify-center h-64 text-muted-foreground text-sm",
                children: "Loading valuation data for all tickers..."
            }) : t.jsxs("table", {
                className: "w-full text-[11px]",
                "data-testid": "valuation-table",
                children: [t.jsx("thead", {
                    className: "sticky top-0 bg-card z-10",
                    children: t.jsxs("tr", {
                        className: "border-b border-border",
                        children: [t.jsx("th", {
                            className: "text-center px-2 py-1.5 w-8 text-muted-foreground font-medium",
                            children: "#"
                        }), t.jsx(P, {
                            col: "ticker",
                            label: "Ticker",
                            className: "text-left w-14"
                        }), t.jsx("th", {
                            className: "text-left px-2 py-1.5 text-muted-foreground font-medium max-w-[140px]",
                            children: "Name"
                        }), t.jsx("th", {
                            className: "text-left px-2 py-1.5 w-28 text-muted-foreground font-medium",
                            children: "SubInd"
                        }), t.jsx(P, {
                            col: "current",
                            label: "Current",
                            className: "text-right"
                        }), t.jsx(P, {
                            col: "mean5Y",
                            label: "Mean",
                            className: "text-right"
                        }), t.jsx(P, {
                            col: "std5Y",
                            label: "Std",
                            className: "text-right"
                        }), t.jsx(P, {
                            col: "zScore",
                            label: "Z-Score",
                            className: "text-right"
                        }), t.jsx(P, {
                            col: "histPctile",
                            label: "Pctile",
                            className: "text-right"
                        }), t.jsx(P, {
                            col: "premium",
                            label: "Prem/Disc",
                            className: "text-right"
                        }), t.jsx("th", {
                            className: "text-center px-2 py-1.5 text-muted-foreground font-medium w-[130px]",
                            children: "Trail"
                        })]
                    })
                }), t.jsx("tbody", {
                    children: g !== "none" && Z ? Z.map(([e, n]) => {
                        const l = C.has(e),
                            o = n.filter(c => c.zScore !== null).length > 0 ? n.filter(c => c.zScore !== null).reduce((c, m) => c + m.zScore, 0) / n.filter(c => c.zScore !== null).length : null;
                        return t.jsxs(oe.Fragment, {
                            children: [t.jsx("tr", {
                                className: "bg-card/60 border-b border-border/40 cursor-pointer hover:bg-accent/20",
                                onClick: () => W(e),
                                children: t.jsx("td", {
                                    colSpan: 11,
                                    className: "px-2 py-1.5",
                                    children: t.jsxs("div", {
                                        className: "flex items-center gap-2",
                                        children: [l ? t.jsx(ce, {
                                            className: "w-3 h-3 text-muted-foreground"
                                        }) : t.jsx(ue, {
                                            className: "w-3 h-3 text-muted-foreground"
                                        }), t.jsx("span", {
                                            className: "text-[11px] font-semibold text-foreground",
                                            children: e.replace(" Equity REITs", "")
                                        }), t.jsxs("span", {
                                            className: "text-[10px] text-muted-foreground font-mono",
                                            children: ["(", n.length, ")"]
                                        }), o !== null && t.jsxs("span", {
                                            className: `text-[10px] font-mono ${q(o)}`,
                                            children: ["Avg Z: ", o.toFixed(2)]
                                        })]
                                    })
                                })
                            }), l && n.map((c, m) => w(c, m))]
                        }, e)
                    }) : y.map((e, n) => w(e, n))
                })]
            })
        })]
    })
}
export {
    ye as
    default
};