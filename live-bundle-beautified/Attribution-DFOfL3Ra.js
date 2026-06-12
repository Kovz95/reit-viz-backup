import {
    a as ye,
    r as x,
    a3 as k,
    j as e,
    B as ie,
    z as we,
    a4 as X,
    b7 as Se,
    a5 as ke,
    bm as Me,
    bn as Fe,
    aF as ue,
    ak as oe,
    aG as Pe,
    aH as Ce,
    aJ as U,
    bt as ce
} from "./index-CsG73Aq_.js";
import {
    A as De
} from "./arrow-up-down-CNMI3GZb.js";
const F = {
        FFO: {
            multiple: "P/FFO FY2",
            estimate: "FFO FY2",
            label: "P/FFO × FFO FY2"
        },
        EPS: {
            multiple: "P/E FY2",
            estimate: "EPS FY2",
            label: "P/E × EPS FY2"
        }
    },
    me = [{
        label: "1M",
        days: 21
    }, {
        label: "3M",
        days: 63
    }, {
        label: "6M",
        days: 126
    }, {
        label: "YTD",
        days: 0
    }, {
        label: "1Y",
        days: 252
    }, {
        label: "2Y",
        days: 504
    }, {
        label: "3Y",
        days: 756
    }, {
        label: "5Y",
        days: 1260
    }],
    Re = [{
        label: "5d",
        days: 5
    }, {
        label: "21d",
        days: 21
    }, {
        label: "63d",
        days: 63
    }, {
        label: "126d",
        days: 126
    }];

function de(s, o, r) {
    const u = new Map;
    for (const l of o) Number.isFinite(l.value) && l.value > 0 && u.set(l.time, l.value);
    const n = new Map;
    for (const l of r) Number.isFinite(l.value) && l.value > 0 && n.set(l.time, l.value);
    const m = [],
        i = [],
        g = [],
        d = [];
    for (const l of s) {
        if (!Number.isFinite(l.value) || l.value <= 0) continue;
        const t = u.get(l.time),
            p = n.get(l.time);
        t === void 0 || p === void 0 || (m.push(l.time), i.push(l.value), g.push(t), d.push(p))
    }
    return {
        dates: m,
        close: i,
        multiple: g,
        estimate: d
    }
}

function z(s, o) {
    if (s.length === 0) return 0;
    if (o === 0) {
        const r = s[s.length - 1].slice(0, 4);
        for (let u = s.length - 1; u >= 0; u--)
            if (s[u].slice(0, 4) !== r) return u;
        return 0
    }
    return Math.max(0, s.length - 1 - o)
}

function Te(s, o) {
    const r = [],
        u = s.close[o],
        n = s.multiple[o],
        m = s.estimate[o];
    if (!Number.isFinite(u) || !Number.isFinite(n) || !Number.isFinite(m)) return r;
    for (let i = o; i < s.dates.length; i++) r.push({
        date: s.dates[i],
        total: Math.log(s.close[i] / u) * 100,
        mult: Math.log(s.multiple[i] / n) * 100,
        est: Math.log(s.estimate[i] / m) * 100
    });
    return r
}

function $e(s, o, r) {
    const u = [];
    for (let n = Math.max(o, r); n < s.dates.length; n++) {
        const m = n - r;
        m < 0 || s.close[m] <= 0 || s.multiple[m] <= 0 || s.estimate[m] <= 0 || u.push({
            date: s.dates[n],
            total: Math.log(s.close[n] / s.close[m]) * 100,
            mult: Math.log(s.multiple[n] / s.multiple[m]) * 100,
            est: Math.log(s.estimate[n] / s.estimate[m]) * 100
        })
    }
    return u
}

function Ee(s, o, r, u) {
    if (r.dates.length < 2) return null;
    const n = z(r.dates, u),
        m = r.dates.length - 1;
    if (n >= m) return null;
    const i = r.close[n],
        g = r.close[m],
        d = r.multiple[n],
        l = r.multiple[m],
        t = r.estimate[n],
        p = r.estimate[m];
    if (!Number.isFinite(i) || !Number.isFinite(g) || !Number.isFinite(d) || !Number.isFinite(l) || !Number.isFinite(t) || !Number.isFinite(p)) return null;
    const j = Math.log(l / d),
        S = Math.log(p / t),
        a = Math.abs(j) + Math.abs(S),
        N = a > 0 ? Math.abs(j) / a : 0,
        y = a > 0 ? Math.abs(S) / a : 0;
    return {
        ticker: s,
        basis: o,
        totalPct: (g / i - 1) * 100,
        multiplePct: j * 100,
        estimatePct: S * 100,
        multipleShare: N,
        estimateShare: y,
        sameDirection: Math.sign(j) === Math.sign(S) && j !== 0
    }
}
const M = (s, o = 2) => Number.isFinite(s) ? `${s>=0?"+":""}${s.toFixed(o)}%` : "—",
    Q = s => Number.isFinite(s) ? `${(s*100).toFixed(0)}%` : "—",
    $ = s => !Number.isFinite(s) || s === 0 ? "text-muted-foreground" : s > 0 ? "text-emerald-500" : "text-rose-500";

function Ie() {
    const {
        filteredTickersList: s
    } = ye(), o = x.useMemo(() => s.map(c => c.ticker), [s]), [r, u] = x.useState("single"), [n, m] = x.useState("auto"), [i, g] = x.useState(""), [d, l] = x.useState(252), [t, p] = x.useState(21), [j, S] = x.useState(""), [a, N] = x.useState(null), [y, D] = x.useState("FFO"), [w, R] = x.useState(!1), [Z, ee] = x.useState([]), [K, te] = x.useState(!1), [he, V] = x.useState(null), [W, pe] = x.useState("multipleShare"), [L, se] = x.useState("desc");
    x.useEffect(() => {
        if (!i && o.length > 0) {
            const b = ["O", "SPG", "PLD", "AMT", "EQIX", "VICI", "WELL"].find(v => o.includes(v)) ?? o[0];
            g(b)
        }
    }, [o, i]);
    const le = x.useCallback(async () => {
        if (i) {
            R(!0);
            try {
                const c = await k(i, "close");
                let b = n === "auto" ? "FFO" : n,
                    v = await k(i, F[b].multiple),
                    f = await k(i, F[b].estimate);
                n === "auto" && (v.length === 0 || f.length === 0) && (b = "EPS", v = await k(i, F.EPS.multiple), f = await k(i, F.EPS.estimate));
                const h = de(c, v, f);
                N(h), D(b)
            } catch (c) {
                console.error("Attribution single loader failed", c), N(null)
            } finally {
                R(!1)
            }
        }
    }, [i, n]);
    x.useEffect(() => {
        le()
    }, [le]);
    const re = x.useRef({
            cancelled: !1
        }),
        fe = x.useCallback(async () => {
            re.current.cancelled = !0;
            const c = {
                cancelled: !1
            };
            re.current = c, te(!0), ee([]), V({
                done: 0,
                total: o.length
            });
            const b = [],
                v = 8;
            let f = 0,
                h = 0;
            async function T() {
                for (;;) {
                    if (c.cancelled) return;
                    const A = f++;
                    if (A >= o.length) return;
                    const C = o[A];
                    try {
                        const J = await k(C, "close");
                        let B = n === "auto" ? "FFO" : n,
                            I = await k(C, F[B].multiple),
                            Y = await k(C, F[B].estimate);
                        if (n === "auto" && (I.length === 0 || Y.length === 0) && (B = "EPS", I = await k(C, F.EPS.multiple), Y = await k(C, F.EPS.estimate)), J.length === 0 || I.length === 0 || Y.length === 0) {
                            h++, V({
                                done: h,
                                total: o.length
                            });
                            continue
                        }
                        const Ne = de(J, I, Y),
                            ae = Ee(C, B, Ne, d);
                        ae && b.push(ae)
                    } catch {}
                    h++, c.cancelled || V({
                        done: h,
                        total: o.length
                    })
                }
            }
            await Promise.all(Array.from({
                length: v
            }, () => T())), c.cancelled || (ee(b), te(!1), V(null))
        }, [o, d, n]),
        P = x.useMemo(() => a ? Te(a, z(a.dates, d)) : [], [a, d]),
        be = x.useMemo(() => a ? $e(a, z(a.dates, d), t) : [], [a, d, t]),
        G = x.useMemo(() => {
            if (P.length === 0) return null;
            const c = P[P.length - 1],
                b = c.total,
                v = c.mult,
                f = c.est,
                h = Math.abs(v) + Math.abs(f),
                T = h > 0 ? Math.abs(v) / h : 0,
                A = h > 0 ? Math.abs(f) / h : 0,
                C = a ? (a.close[a.close.length - 1] / a.close[z(a.dates, d)] - 1) * 100 : 0;
            return {
                total: b,
                mult: v,
                est: f,
                multShare: T,
                estShare: A,
                totalSimple: C,
                startDate: P[0].date,
                endDate: c.date
            }
        }, [P, a, d]),
        H = x.useMemo(() => {
            const c = [...Z];
            return c.sort((b, v) => {
                let f, h;
                switch (W) {
                    case "ticker":
                        f = b.ticker, h = v.ticker;
                        break;
                    case "totalPct":
                        f = b.totalPct, h = v.totalPct;
                        break;
                    case "multiplePct":
                        f = b.multiplePct, h = v.multiplePct;
                        break;
                    case "estimatePct":
                        f = b.estimatePct, h = v.estimatePct;
                        break;
                    case "multipleShare":
                        f = b.multipleShare, h = v.multipleShare;
                        break
                }
                if (typeof f == "string" && typeof h == "string") return L === "asc" ? f.localeCompare(h) : h.localeCompare(f);
                const T = f - h;
                return L === "asc" ? T : -T
            }), c
        }, [Z, W, L]),
        ge = c => {
            c === W ? se(L === "asc" ? "desc" : "asc") : (pe(c), se(c === "ticker" ? "asc" : "desc"))
        },
        je = () => {
            if (r === "single") {
                if (P.length === 0) return;
                const c = "date,total_ln_pct,multiple_ln_pct,estimate_ln_pct",
                    b = P.map(h => `${h.date},${h.total.toFixed(4)},${h.mult.toFixed(4)},${h.est.toFixed(4)}`),
                    f = [`# ${i} | basis=${y} | window=${d===0?"YTD":`${d}d`} | start=${G?.startDate??""} | end=${G?.endDate??""}`, c, ...b].join(`
`);
                ne(f, `attribution_${i}_${d===0?"ytd":`${d}d`}.csv`)
            } else {
                if (H.length === 0) return;
                const c = "ticker,basis,total_pct,multiple_pct,estimate_pct,multiple_share,estimate_share,same_direction",
                    b = H.map(h => [h.ticker, h.basis, h.totalPct.toFixed(4), h.multiplePct.toFixed(4), h.estimatePct.toFixed(4), h.multipleShare.toFixed(4), h.estimateShare.toFixed(4), h.sameDirection ? "1" : "0"].join(",")),
                    f = [`# universe attribution | window=${d===0?"YTD":`${d}d`} | basis=${n==="auto"?"auto(FFO->EPS)":n}`, c, ...b].join(`
`);
                ne(f, `attribution_universe_${d===0?"ytd":`${d}d`}.csv`)
            }
        };

    function ne(c, b) {
        const v = new Blob([c], {
                type: "text/csv"
            }),
            f = URL.createObjectURL(v),
            h = document.createElement("a");
        h.href = f, h.download = b, h.click(), URL.revokeObjectURL(f)
    }
    const ve = x.useMemo(() => {
        const c = j.trim().toUpperCase();
        return c ? o.filter(b => b.toUpperCase().includes(c)).slice(0, 200) : o.slice(0, 200)
    }, [o, j]);
    return e.jsxs("div", {
        className: "flex flex-col h-full bg-background text-foreground font-mono text-xs",
        children: [e.jsxs("div", {
            className: "px-3 py-2 border-b border-border flex items-center justify-between flex-wrap gap-2",
            children: [e.jsxs("div", {
                className: "flex items-center gap-3",
                children: [e.jsx("h1", {
                    className: "text-sm font-bold tracking-tight",
                    children: "Price Attribution"
                }), e.jsx("span", {
                    className: "text-[10px] text-muted-foreground",
                    children: "Δln(P) = Δln(M) + Δln(E) — decompose returns into multiple expansion vs estimate revisions"
                })]
            }), e.jsxs("div", {
                className: "flex items-center gap-2",
                children: [e.jsxs("div", {
                    className: "flex items-center gap-0.5 border border-border rounded",
                    children: [e.jsx("button", {
                        onClick: () => u("single"),
                        className: `px-2 py-1 text-[10px] ${r==="single"?"bg-primary text-primary-foreground":"hover:bg-muted"}`,
                        children: "Single Ticker"
                    }), e.jsx("button", {
                        onClick: () => u("table"),
                        className: `px-2 py-1 text-[10px] ${r==="table"?"bg-primary text-primary-foreground":"hover:bg-muted"}`,
                        children: "Universe Table"
                    })]
                }), e.jsxs("div", {
                    className: "flex items-center gap-1",
                    children: [e.jsx("span", {
                        className: "text-[10px] text-muted-foreground",
                        children: "Basis:"
                    }), e.jsx("div", {
                        className: "flex items-center gap-0.5 border border-border rounded",
                        children: ["auto", "FFO", "EPS"].map(c => e.jsx("button", {
                            onClick: () => m(c),
                            className: `px-1.5 py-0.5 text-[10px] ${n===c?"bg-primary text-primary-foreground":"hover:bg-muted"}`,
                            children: c === "auto" ? "Auto" : c
                        }, c))
                    })]
                }), e.jsxs("div", {
                    className: "flex items-center gap-1",
                    children: [e.jsx("span", {
                        className: "text-[10px] text-muted-foreground",
                        children: "Window:"
                    }), e.jsx("div", {
                        className: "flex items-center gap-0.5 border border-border rounded",
                        children: me.map(c => e.jsx("button", {
                            onClick: () => l(c.days),
                            className: `px-1.5 py-0.5 text-[10px] ${d===c.days?"bg-primary text-primary-foreground":"hover:bg-muted"}`,
                            children: c.label
                        }, c.label))
                    })]
                }), r === "single" && e.jsxs("div", {
                    className: "flex items-center gap-1",
                    children: [e.jsx("span", {
                        className: "text-[10px] text-muted-foreground",
                        children: "Rolling:"
                    }), e.jsx("div", {
                        className: "flex items-center gap-0.5 border border-border rounded",
                        children: Re.map(c => e.jsx("button", {
                            onClick: () => p(c.days),
                            className: `px-1.5 py-0.5 text-[10px] ${t===c.days?"bg-primary text-primary-foreground":"hover:bg-muted"}`,
                            children: c.label
                        }, c.label))
                    })]
                }), e.jsxs(ie, {
                    variant: "outline",
                    size: "sm",
                    onClick: je,
                    className: "h-7 px-2 text-[10px]",
                    children: [e.jsx(we, {
                        className: "w-3 h-3 mr-1"
                    }), " CSV"]
                }), r === "table" && e.jsxs(ie, {
                    variant: "default",
                    size: "sm",
                    onClick: fe,
                    disabled: K || o.length === 0,
                    className: "h-7 px-2 text-[10px]",
                    children: [K ? e.jsx(X, {
                        className: "w-3 h-3 mr-1 animate-spin"
                    }) : e.jsx(Se, {
                        className: "w-3 h-3 mr-1"
                    }), "Run on ", o.length]
                })]
            })]
        }), e.jsx("div", {
            className: "flex-1 overflow-auto",
            children: r === "single" ? e.jsx(Le, {
                tickers: o,
                visibleTickers: ve,
                activeTicker: i,
                setActiveTicker: g,
                tickerSearch: j,
                setTickerSearch: S,
                aligned: a,
                cumPath: P,
                rollingPath: be,
                summary: G,
                resolvedBasis: y,
                windowDays: d,
                rollingDays: t,
                loadingSingle: w
            }) : e.jsx(Oe, {
                rows: H,
                sortKey: W,
                sortDir: L,
                handleSort: ge,
                loadingTable: K,
                tableProgress: he,
                windowDays: d
            })
        })]
    })
}

function Le(s) {
    const {
        visibleTickers: o,
        activeTicker: r,
        setActiveTicker: u,
        tickerSearch: n,
        setTickerSearch: m,
        aligned: i,
        cumPath: g,
        rollingPath: d,
        summary: l,
        resolvedBasis: t,
        windowDays: p,
        rollingDays: j,
        loadingSingle: S
    } = s;
    return e.jsxs("div", {
        className: "flex h-full",
        children: [e.jsxs("div", {
            className: "w-32 border-r border-border flex flex-col flex-shrink-0",
            children: [e.jsx("div", {
                className: "p-1.5 border-b border-border",
                children: e.jsx("input", {
                    value: n,
                    onChange: a => m(a.target.value),
                    placeholder: "Search…",
                    className: "w-full px-1.5 py-1 text-[10px] bg-input border border-border rounded outline-none focus:border-primary"
                })
            }), e.jsx("div", {
                className: "flex-1 overflow-y-auto",
                children: o.map(a => e.jsx("button", {
                    onClick: () => u(a),
                    className: `w-full text-left px-2 py-1 text-[10px] border-b border-border/50 ${a===r?"bg-primary text-primary-foreground":"hover:bg-muted"}`,
                    children: a
                }, a))
            })]
        }), e.jsxs("div", {
            className: "flex-1 flex flex-col overflow-auto",
            children: [e.jsx("div", {
                className: "px-3 py-2 border-b border-border bg-muted/20",
                children: S ? e.jsxs("div", {
                    className: "flex items-center gap-2 text-muted-foreground",
                    children: [e.jsx(X, {
                        className: "w-3 h-3 animate-spin"
                    }), " Loading ", r, "…"]
                }) : !l || !i ? e.jsxs("div", {
                    className: "text-muted-foreground",
                    children: ["No data for ", r, ". ", t === "EPS" ? "" : "(FFO not available — try forcing EPS basis)"]
                }) : e.jsxs("div", {
                    className: "flex items-center gap-6 flex-wrap",
                    children: [e.jsxs("div", {
                        children: [e.jsx("div", {
                            className: "text-[9px] uppercase tracking-wide text-muted-foreground",
                            children: "Ticker / Basis"
                        }), e.jsxs("div", {
                            className: "text-sm font-bold",
                            children: [r, " ", e.jsxs("span", {
                                className: "text-[10px] text-muted-foreground font-normal",
                                children: ["(", F[t].label, ")"]
                            })]
                        }), e.jsxs("div", {
                            className: "text-[9px] text-muted-foreground",
                            children: [l.startDate, " → ", l.endDate]
                        })]
                    }), e.jsxs("div", {
                        children: [e.jsx("div", {
                            className: "text-[9px] uppercase tracking-wide text-muted-foreground",
                            children: "Total Return (price)"
                        }), e.jsx("div", {
                            className: `text-sm font-bold ${$(l.totalSimple)}`,
                            children: M(l.totalSimple)
                        }), e.jsxs("div", {
                            className: "text-[9px] text-muted-foreground",
                            children: ["ln: ", M(l.total)]
                        })]
                    }), e.jsxs("div", {
                        children: [e.jsx("div", {
                            className: "text-[9px] uppercase tracking-wide text-muted-foreground",
                            children: "Multiple Contribution"
                        }), e.jsx("div", {
                            className: `text-sm font-bold ${$(l.mult)}`,
                            children: M(l.mult)
                        }), e.jsxs("div", {
                            className: "text-[9px] text-muted-foreground",
                            children: ["share of |move|: ", Q(l.multShare)]
                        })]
                    }), e.jsxs("div", {
                        children: [e.jsx("div", {
                            className: "text-[9px] uppercase tracking-wide text-muted-foreground",
                            children: "Estimate Contribution"
                        }), e.jsx("div", {
                            className: `text-sm font-bold ${$(l.est)}`,
                            children: M(l.est)
                        }), e.jsxs("div", {
                            className: "text-[9px] text-muted-foreground",
                            children: ["share of |move|: ", Q(l.estShare)]
                        })]
                    }), e.jsxs("div", {
                        children: [e.jsx("div", {
                            className: "text-[9px] uppercase tracking-wide text-muted-foreground",
                            children: "Identity Check"
                        }), e.jsxs("div", {
                            className: "text-[10px] font-mono",
                            children: ["M + E = ", M(l.mult + l.est), " ", e.jsxs("span", {
                                className: "text-muted-foreground",
                                children: ["vs Total ln ", M(l.total)]
                            })]
                        }), e.jsxs("div", {
                            className: "text-[9px] text-muted-foreground flex items-center gap-1",
                            title: "P = M×E should hold exactly, but estimate vs price feeds can drift (estimate updates, currency, etc). Large residuals indicate data inconsistency, not a bug in the decomposition.",
                            children: [e.jsx(ke, {
                                className: "w-2.5 h-2.5"
                            }), " Residual ", M(l.total - l.mult - l.est, 2)]
                        })]
                    })]
                })
            }), e.jsxs("div", {
                className: "p-3 border-b border-border",
                children: [e.jsxs("div", {
                    className: "flex items-center justify-between mb-1",
                    children: [e.jsx("div", {
                        className: "text-[11px] font-semibold",
                        children: "Cumulative Decomposition (anchored at window start)"
                    }), e.jsxs("div", {
                        className: "flex items-center gap-3 text-[10px]",
                        children: [e.jsxs("span", {
                            className: "flex items-center gap-1",
                            children: [e.jsx("span", {
                                className: "inline-block w-3 h-0.5 bg-foreground"
                            }), " Total Price"]
                        }), e.jsxs("span", {
                            className: "flex items-center gap-1",
                            children: [e.jsx("span", {
                                className: "inline-block w-3 h-0.5 bg-sky-400"
                            }), " Multiple"]
                        }), e.jsxs("span", {
                            className: "flex items-center gap-1",
                            children: [e.jsx("span", {
                                className: "inline-block w-3 h-0.5 bg-amber-400"
                            }), " Estimates"]
                        })]
                    })]
                }), e.jsx(_e, {
                    data: g
                })]
            }), e.jsxs("div", {
                className: "p-3",
                children: [e.jsxs("div", {
                    className: "flex items-center justify-between mb-1",
                    children: [e.jsxs("div", {
                        className: "text-[11px] font-semibold",
                        children: ["Rolling ", j, "-day Contribution (stacked)"]
                    }), e.jsxs("div", {
                        className: "flex items-center gap-3 text-[10px]",
                        children: [e.jsxs("span", {
                            className: "flex items-center gap-1",
                            children: [e.jsx("span", {
                                className: "inline-block w-3 h-2 bg-sky-400/70"
                            }), " Δln(Multiple)"]
                        }), e.jsxs("span", {
                            className: "flex items-center gap-1",
                            children: [e.jsx("span", {
                                className: "inline-block w-3 h-2 bg-amber-400/70"
                            }), " Δln(Estimate)"]
                        }), e.jsxs("span", {
                            className: "flex items-center gap-1",
                            children: [e.jsx("span", {
                                className: "inline-block w-3 h-0.5 bg-foreground"
                            }), " Total Δln(Price)"]
                        })]
                    })]
                }), e.jsx(Ve, {
                    data: d
                })]
            })]
        })]
    })
}

function Oe(s) {
    const {
        rows: o,
        sortKey: r,
        sortDir: u,
        handleSort: n,
        loadingTable: m,
        tableProgress: i,
        windowDays: g
    } = s, d = g === 0 ? "YTD" : me.find(t => t.days === g)?.label ?? `${g}d`, l = ({
        k: t,
        label: p,
        align: j = "right"
    }) => e.jsx("th", {
        onClick: () => n(t),
        className: `px-2 py-1.5 cursor-pointer hover:bg-muted/40 select-none ${j==="right"?"text-right":"text-left"}`,
        children: e.jsxs("div", {
            className: `flex items-center gap-1 ${j==="right"?"justify-end":""}`,
            children: [e.jsx("span", {
                children: p
            }), r === t ? u === "asc" ? e.jsx(Me, {
                className: "w-2.5 h-2.5"
            }) : e.jsx(Fe, {
                className: "w-2.5 h-2.5"
            }) : e.jsx(De, {
                className: "w-2.5 h-2.5 opacity-30"
            })]
        })
    });
    return e.jsx("div", {
        className: "p-3",
        children: m && i ? e.jsxs("div", {
            className: "flex items-center gap-2 mb-2 text-[10px] text-muted-foreground",
            children: [e.jsx(X, {
                className: "w-3 h-3 animate-spin"
            }), "Computing ", i.done, " / ", i.total, "…"]
        }) : o.length === 0 ? e.jsxs("div", {
            className: "text-[11px] text-muted-foreground",
            children: ['Click "Run on N" above to compute the attribution table for the active universe over the ', d, " window. Each row decomposes the ticker's total log-return into multiple-expansion vs estimate-revision contributions."]
        }) : e.jsxs("table", {
            className: "w-full border-collapse text-[10px]",
            children: [e.jsx("thead", {
                className: "bg-muted/30 border-b border-border sticky top-0",
                children: e.jsxs("tr", {
                    children: [e.jsx(l, {
                        k: "ticker",
                        label: "Ticker",
                        align: "left"
                    }), e.jsx("th", {
                        className: "px-2 py-1.5 text-left",
                        children: "Basis"
                    }), e.jsx(l, {
                        k: "totalPct",
                        label: `Total % (${d})`
                    }), e.jsx(l, {
                        k: "multiplePct",
                        label: "Multiple %"
                    }), e.jsx(l, {
                        k: "estimatePct",
                        label: "Estimate %"
                    }), e.jsx(l, {
                        k: "multipleShare",
                        label: "Multiple Share"
                    }), e.jsx("th", {
                        className: "px-2 py-1.5 text-center",
                        children: "Direction"
                    }), e.jsx("th", {
                        className: "px-2 py-1.5 text-left w-[200px]",
                        children: "Composition"
                    })]
                })
            }), e.jsx("tbody", {
                children: o.map(t => e.jsxs("tr", {
                    className: "border-b border-border/40 hover:bg-muted/20",
                    children: [e.jsx("td", {
                        className: "px-2 py-1 font-semibold",
                        children: t.ticker
                    }), e.jsx("td", {
                        className: "px-2 py-1 text-muted-foreground",
                        children: t.basis
                    }), e.jsx("td", {
                        className: `px-2 py-1 text-right font-mono ${$(t.totalPct)}`,
                        children: M(t.totalPct)
                    }), e.jsx("td", {
                        className: `px-2 py-1 text-right font-mono ${$(t.multiplePct)}`,
                        children: M(t.multiplePct)
                    }), e.jsx("td", {
                        className: `px-2 py-1 text-right font-mono ${$(t.estimatePct)}`,
                        children: M(t.estimatePct)
                    }), e.jsx("td", {
                        className: "px-2 py-1 text-right font-mono",
                        children: Q(t.multipleShare)
                    }), e.jsx("td", {
                        className: "px-2 py-1 text-center",
                        children: e.jsx("span", {
                            className: `px-1.5 py-0.5 rounded text-[9px] ${t.sameDirection?"bg-emerald-500/15 text-emerald-500":"bg-rose-500/15 text-rose-500"}`,
                            children: t.sameDirection ? "aligned" : "offsetting"
                        })
                    }), e.jsx("td", {
                        className: "px-2 py-1",
                        children: e.jsx(We, {
                            multShare: t.multipleShare,
                            estShare: t.estimateShare,
                            multSign: Math.sign(t.multiplePct),
                            estSign: Math.sign(t.estimatePct)
                        })
                    })]
                }, t.ticker))
            })]
        })
    })
}
const xe = {
    layout: {
        background: {
            type: Ce.Solid,
            color: "transparent"
        },
        textColor: "#7a8a9e",
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace"
    },
    grid: {
        vertLines: {
            color: "rgba(255,255,255,0.04)"
        },
        horzLines: {
            color: "rgba(255,255,255,0.04)"
        }
    },
    crosshair: {
        mode: Pe.Normal,
        vertLine: {
            color: "rgba(14, 165, 233, 0.3)",
            width: 1,
            style: oe.Dashed,
            labelBackgroundColor: "#0ea5e9"
        },
        horzLine: {
            color: "rgba(14, 165, 233, 0.3)",
            width: 1,
            style: oe.Dashed,
            labelBackgroundColor: "#0ea5e9"
        }
    },
    rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        scaleMargins: {
            top: .1,
            bottom: .1
        },
        minimumWidth: 70
    },
    timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: !1,
        rightOffset: 5,
        barSpacing: 3,
        minBarSpacing: 1
    },
    handleScroll: {
        mouseWheel: !1,
        pressedMouseMove: !0,
        horzTouchDrag: !0,
        vertTouchDrag: !1
    },
    handleScale: !1,
    kineticScroll: {
        mouse: !1,
        touch: !1
    }
};

function E(s) {
    const [o, r, u] = s.slice(0, 10).split("-").map(Number);
    return {
        year: o,
        month: r,
        day: u
    }
}
const q = "#e5e7eb",
    O = "#38bdf8",
    _ = "#fbbf24";

function _e({
    data: s
}) {
    const o = x.useRef(null),
        r = x.useRef(null),
        u = x.useRef(null),
        n = x.useRef(null),
        m = x.useRef(null),
        [i, g] = x.useState(null);
    return x.useEffect(() => {
        const d = o.current;
        if (!d) return;
        const l = () => {
            const t = d.getBoundingClientRect();
            if (t.width === 0 || t.height === 0) {
                requestAnimationFrame(l);
                return
            }
            const p = ue(d, {
                ...xe,
                width: t.width,
                height: t.height
            });
            p.applyOptions({
                handleScale: {
                    mouseWheel: !0,
                    pinch: !1,
                    axisPressedMouseMove: !1,
                    axisDoubleClickReset: !1
                }
            }), r.current = p;
            const j = {
                type: "price",
                precision: 2,
                minMove: .01
            };
            m.current = p.addSeries(U, {
                color: _,
                lineWidth: 2,
                title: "Estimates",
                priceFormat: j,
                lastValueVisible: !0,
                priceLineVisible: !1
            }), n.current = p.addSeries(U, {
                color: O,
                lineWidth: 2,
                title: "Multiple",
                priceFormat: j,
                lastValueVisible: !0,
                priceLineVisible: !1
            }), u.current = p.addSeries(U, {
                color: q,
                lineWidth: 2,
                title: "Total",
                priceFormat: j,
                lastValueVisible: !0,
                priceLineVisible: !1
            }), p.subscribeCrosshairMove(a => {
                if (!a.time || !a.seriesData || !a.point) {
                    g(null);
                    return
                }
                const N = u.current ? a.seriesData.get(u.current) : null,
                    y = n.current ? a.seriesData.get(n.current) : null,
                    D = m.current ? a.seriesData.get(m.current) : null;
                if (!N && !y && !D) {
                    g(null);
                    return
                }
                const w = a.time,
                    R = typeof w == "object" && w.year ? `${w.year}-${String(w.month).padStart(2,"0")}-${String(w.day).padStart(2,"0")}` : String(w);
                g({
                    x: a.point.x,
                    y: a.point.y,
                    date: R,
                    total: N?.value ?? 0,
                    mult: y?.value ?? 0,
                    est: D?.value ?? 0
                })
            });
            const S = new ResizeObserver(a => {
                if (!r.current) return;
                const {
                    width: N,
                    height: y
                } = a[0].contentRect;
                N > 0 && y > 0 && r.current.applyOptions({
                    width: N,
                    height: y
                })
            });
            S.observe(d), p.__ro = S
        };
        return l(), () => {
            const t = r.current;
            t?.__ro && t.__ro.disconnect(), r.current?.remove(), r.current = null, u.current = null, n.current = null, m.current = null
        }
    }, []), x.useEffect(() => {
        if (!r.current || !u.current || !n.current || !m.current) return;
        if (s.length < 2) {
            u.current.setData([]), n.current.setData([]), m.current.setData([]);
            return
        }
        const d = new Set,
            l = s.filter(t => {
                const p = t.date.slice(0, 10);
                return d.has(p) ? !1 : (d.add(p), !0)
            });
        u.current.setData(l.map(t => ({
            time: E(t.date),
            value: t.total
        }))), n.current.setData(l.map(t => ({
            time: E(t.date),
            value: t.mult
        }))), m.current.setData(l.map(t => ({
            time: E(t.date),
            value: t.est
        }))), r.current.timeScale().fitContent()
    }, [s]), s.length < 2 ? e.jsx("div", {
        className: "text-[10px] text-muted-foreground p-4",
        children: "Insufficient data for cumulative decomposition."
    }) : e.jsxs("div", {
        className: "relative w-full",
        style: {
            height: 280
        },
        children: [e.jsx("div", {
            ref: o,
            className: "absolute inset-0"
        }), i && e.jsxs("div", {
            className: "pointer-events-none absolute z-10 rounded border border-border bg-popover/95 px-2 py-1 text-[10px] shadow-md backdrop-blur",
            style: {
                left: Math.min(i.x + 12, (o.current?.clientWidth ?? 0) - 160),
                top: Math.max(8, i.y - 60)
            },
            children: [e.jsx("div", {
                className: "text-muted-foreground mb-0.5",
                children: i.date
            }), e.jsxs("div", {
                className: "flex items-center justify-between gap-3",
                children: [e.jsx("span", {
                    style: {
                        color: q
                    },
                    children: "Total"
                }), e.jsxs("span", {
                    className: "font-mono",
                    children: [i.total.toFixed(2), "%"]
                })]
            }), e.jsxs("div", {
                className: "flex items-center justify-between gap-3",
                children: [e.jsx("span", {
                    style: {
                        color: O
                    },
                    children: "Multiple"
                }), e.jsxs("span", {
                    className: "font-mono",
                    children: [i.mult.toFixed(2), "%"]
                })]
            }), e.jsxs("div", {
                className: "flex items-center justify-between gap-3",
                children: [e.jsx("span", {
                    style: {
                        color: _
                    },
                    children: "Estimates"
                }), e.jsxs("span", {
                    className: "font-mono",
                    children: [i.est.toFixed(2), "%"]
                })]
            })]
        })]
    })
}

function Ve({
    data: s
}) {
    const o = x.useRef(null),
        r = x.useRef(null),
        u = x.useRef(null),
        n = x.useRef(null),
        m = x.useRef(null),
        [i, g] = x.useState(null);
    return x.useEffect(() => {
        const d = o.current;
        if (!d) return;
        const l = () => {
            const t = d.getBoundingClientRect();
            if (t.width === 0 || t.height === 0) {
                requestAnimationFrame(l);
                return
            }
            const p = ue(d, {
                ...xe,
                width: t.width,
                height: t.height
            });
            p.applyOptions({
                handleScale: {
                    mouseWheel: !0,
                    pinch: !1,
                    axisPressedMouseMove: !1,
                    axisDoubleClickReset: !1
                }
            }), r.current = p;
            const j = {
                type: "price",
                precision: 2,
                minMove: .01
            };
            u.current = p.addSeries(ce, {
                color: O + "b3",
                title: "Δln(Multiple)",
                priceFormat: j,
                base: 0,
                priceLineVisible: !1,
                lastValueVisible: !1
            }), n.current = p.addSeries(ce, {
                color: _ + "b3",
                title: "Δln(Estimate)",
                priceFormat: j,
                base: 0,
                priceLineVisible: !1,
                lastValueVisible: !1
            }), m.current = p.addSeries(U, {
                color: q,
                lineWidth: 2,
                title: "Total Δln(Price)",
                priceFormat: j,
                lastValueVisible: !0,
                priceLineVisible: !1
            }), p.subscribeCrosshairMove(a => {
                if (!a.time || !a.seriesData || !a.point) {
                    g(null);
                    return
                }
                const N = m.current ? a.seriesData.get(m.current) : null,
                    y = u.current ? a.seriesData.get(u.current) : null,
                    D = n.current ? a.seriesData.get(n.current) : null;
                if (!N && !y && !D) {
                    g(null);
                    return
                }
                const w = a.time,
                    R = typeof w == "object" && w.year ? `${w.year}-${String(w.month).padStart(2,"0")}-${String(w.day).padStart(2,"0")}` : String(w);
                g({
                    x: a.point.x,
                    y: a.point.y,
                    date: R,
                    total: N?.value ?? 0,
                    mult: y?.value ?? 0,
                    est: D?.value ?? 0
                })
            });
            const S = new ResizeObserver(a => {
                if (!r.current) return;
                const {
                    width: N,
                    height: y
                } = a[0].contentRect;
                N > 0 && y > 0 && r.current.applyOptions({
                    width: N,
                    height: y
                })
            });
            S.observe(d), p.__ro = S
        };
        return l(), () => {
            const t = r.current;
            t?.__ro && t.__ro.disconnect(), r.current?.remove(), r.current = null, u.current = null, n.current = null, m.current = null
        }
    }, []), x.useEffect(() => {
        if (!r.current || !u.current || !n.current || !m.current) return;
        if (s.length < 2) {
            u.current.setData([]), n.current.setData([]), m.current.setData([]);
            return
        }
        const d = new Set,
            l = s.filter(t => {
                const p = t.date.slice(0, 10);
                return d.has(p) ? !1 : (d.add(p), !0)
            });
        u.current.setData(l.map(t => ({
            time: E(t.date),
            value: t.mult,
            color: t.mult >= 0 ? O + "b3" : "#0ea5e9b3"
        }))), n.current.setData(l.map(t => ({
            time: E(t.date),
            value: t.est,
            color: t.est >= 0 ? _ + "b3" : "#d97706b3"
        }))), m.current.setData(l.map(t => ({
            time: E(t.date),
            value: t.total
        }))), r.current.timeScale().fitContent()
    }, [s]), s.length < 2 ? e.jsx("div", {
        className: "text-[10px] text-muted-foreground p-4",
        children: "Insufficient data for rolling decomposition (need at least one full rolling window after start)."
    }) : e.jsxs("div", {
        className: "relative w-full",
        style: {
            height: 260
        },
        children: [e.jsx("div", {
            ref: o,
            className: "absolute inset-0"
        }), i && e.jsxs("div", {
            className: "pointer-events-none absolute z-10 rounded border border-border bg-popover/95 px-2 py-1 text-[10px] shadow-md backdrop-blur",
            style: {
                left: Math.min(i.x + 12, (o.current?.clientWidth ?? 0) - 180),
                top: Math.max(8, i.y - 70)
            },
            children: [e.jsx("div", {
                className: "text-muted-foreground mb-0.5",
                children: i.date
            }), e.jsxs("div", {
                className: "flex items-center justify-between gap-3",
                children: [e.jsx("span", {
                    style: {
                        color: q
                    },
                    children: "Total Δln(P)"
                }), e.jsxs("span", {
                    className: "font-mono",
                    children: [i.total.toFixed(2), "%"]
                })]
            }), e.jsxs("div", {
                className: "flex items-center justify-between gap-3",
                children: [e.jsx("span", {
                    style: {
                        color: O
                    },
                    children: "Δln(Multiple)"
                }), e.jsxs("span", {
                    className: "font-mono",
                    children: [i.mult.toFixed(2), "%"]
                })]
            }), e.jsxs("div", {
                className: "flex items-center justify-between gap-3",
                children: [e.jsx("span", {
                    style: {
                        color: _
                    },
                    children: "Δln(Estimate)"
                }), e.jsxs("span", {
                    className: "font-mono",
                    children: [i.est.toFixed(2), "%"]
                })]
            })]
        })]
    })
}

function We({
    multShare: s,
    estShare: o,
    multSign: r,
    estSign: u
}) {
    const i = Math.round(s * 200),
        g = Math.round(o * 200);
    return e.jsxs("svg", {
        width: 200,
        height: 12,
        className: "block",
        children: [e.jsx("rect", {
            x: 0,
            y: 0,
            width: 200,
            height: 12,
            fill: "hsl(var(--muted) / 0.3)"
        }), e.jsx("rect", {
            x: 0,
            y: 0,
            width: i,
            height: 12,
            fill: r >= 0 ? "#38bdf8" : "#0ea5e9",
            opacity: r >= 0 ? .85 : .55
        }), e.jsx("rect", {
            x: i,
            y: 0,
            width: g,
            height: 12,
            fill: u >= 0 ? "#fbbf24" : "#d97706",
            opacity: u >= 0 ? .85 : .55
        })]
    })
}
export {
    Ie as
    default
};