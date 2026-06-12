import {
    bP as Fe,
    r as l,
    aj as _e,
    af as Ie,
    e6 as oe,
    b4 as de,
    b5 as He,
    j as e,
    bs as Ve,
    B as z,
    cN as xe,
    ar as M,
    o as he,
    p as ue,
    q as pe,
    t as me,
    v as L,
    at as K,
    e7 as S,
    I as De,
    a4 as $e,
    c7 as Oe,
    e8 as Ue,
    A as ze,
    a3 as Ke,
    e9 as Ye,
    ea as We,
    bm as qe,
    bn as Ge,
    eb as Je,
    ec as Qe
} from "./index-CsG73Aq_.js";
import {
    u as Xe
} from "./useOptimizerClassFilter-COCFGQs0.js";
import {
    u as Ze
} from "./usePairComboPicker-h_S34tFb.js";
import {
    U as G
} from "./UnifiedTickerPicker-D927mSvl.js";
import {
    C as be,
    a as ge,
    b as fe,
    c as je
} from "./card-B6gjKVHw.js";
import {
    T as ke,
    a as ve,
    b as E
} from "./tabs-BmZfssP0.js";
import {
    B as ye
} from "./badge-CQ2SEXX0.js";
import {
    S as es
} from "./square-DrnmFnpA.js";
import {
    P as ss
} from "./play-D7mVvggU.js";
import "./globalUniverse-DuqPcp2u.js";
import "./ClassificationFiltersWithSource-D7v4WOtR.js";
const X = [{
        id: "asc_triangle",
        label: "Asc Triangle",
        dir: 1
    }, {
        id: "desc_triangle",
        label: "Desc Triangle",
        dir: -1
    }, {
        id: "sym_triangle",
        label: "Sym Triangle",
        dir: 0
    }, {
        id: "rising_wedge",
        label: "Rising Wedge",
        dir: -1
    }, {
        id: "falling_wedge",
        label: "Falling Wedge",
        dir: 1
    }, {
        id: "bull_flag",
        label: "Bull Flag",
        dir: 1
    }, {
        id: "bear_flag",
        label: "Bear Flag",
        dir: -1
    }, {
        id: "rectangle",
        label: "Rectangle",
        dir: 0
    }, {
        id: "head_shoulders",
        label: "H&S",
        dir: -1
    }, {
        id: "inv_head_shoulders",
        label: "Inverse H&S",
        dir: 1
    }, {
        id: "double_top",
        label: "Double Top",
        dir: -1
    }, {
        id: "double_bottom",
        label: "Double Bottom",
        dir: 1
    }, {
        id: "triple_top",
        label: "Triple Top",
        dir: -1
    }, {
        id: "triple_bottom",
        label: "Triple Bottom",
        dir: 1
    }, {
        id: "cup_handle",
        label: "Cup & Handle",
        dir: 1
    }, {
        id: "inv_cup_handle",
        label: "Inv Cup & Handle",
        dir: -1
    }, {
        id: "rounding_top",
        label: "Rounding Top",
        dir: -1
    }, {
        id: "rounding_bottom",
        label: "Rounding Bottom",
        dir: 1
    }],
    ts = [{
        id: "regression",
        label: "Regression"
    }, {
        id: "parallel",
        label: "Parallel"
    }, {
        id: "log-regression",
        label: "Log Regression"
    }],
    Se = "reit-viz.patternScreener.config.v1",
    R = {
        patternsEnabled: !0,
        patternPivotLookback: 5,
        patternMinR2: .6,
        patternMinTouches: 4,
        patternMinBars: 15,
        patternMaxBars: 120,
        patternLookbackBars: 500,
        patternEnabled: Object.fromEntries(X.map(a => [a.id, !0])),
        channelsEnabled: !0,
        channelMinR2: .4,
        channelMinContainment: .9,
        channelMinTouches: 4,
        channelStdevMult: 2,
        channelMaxChannels: 4,
        channelLookbacks: [60, 120, 250, 500],
        channelTypes: {
            regression: !0,
            parallel: !0,
            "log-regression": !1
        },
        minConfidence: .5,
        maxAgeBars: 20,
        directionFilter: "any"
    };

function as() {
    try {
        const a = localStorage.getItem(Se);
        if (!a) return {
            ...R
        };
        const n = JSON.parse(a);
        return {
            ...R,
            ...n,
            patternEnabled: {
                ...R.patternEnabled,
                ...n?.patternEnabled || {}
            },
            channelTypes: {
                ...R.channelTypes,
                ...n?.channelTypes || {}
            },
            channelLookbacks: Array.isArray(n?.channelLookbacks) && n.channelLookbacks.length > 0 ? n.channelLookbacks : R.channelLookbacks
        }
    } catch {
        return {
            ...R
        }
    }
}

function ns(a) {
    try {
        localStorage.setItem(Se, JSON.stringify(a))
    } catch {}
}

function rs(a) {
    return {
        ...Je(),
        pivotLookback: a.patternPivotLookback,
        minR2: a.patternMinR2,
        minTouches: a.patternMinTouches,
        minBars: a.patternMinBars,
        maxBars: a.patternMaxBars,
        lookbackBars: a.patternLookbackBars,
        enabled: {
            ...a.patternEnabled
        },
        maxPatterns: 12
    }
}

function is(a) {
    const n = Qe(),
        D = Object.keys(a.channelTypes).filter(u => a.channelTypes[u]);
    return {
        ...n,
        types: D.length > 0 ? D : ["regression"],
        stdevMult: a.channelStdevMult,
        minR2: a.channelMinR2,
        minContainment: a.channelMinContainment,
        minTouches: a.channelMinTouches,
        maxChannels: a.channelMaxChannels,
        lookbackBars: a.channelLookbacks
    }
}

function Ne(a) {
    return a.map(n => ({
        time: n.time,
        value: n.close
    }))
}

function Ce(a) {
    return a.map(n => ({
        time: n.time,
        value: n.close,
        high: n.high,
        low: n.low
    }))
}

function J(a) {
    return a.filter(n => Number.isFinite(n.value)).map(n => ({
        time: n.time,
        value: n.value
    }))
}

function Q(a) {
    return a.filter(n => Number.isFinite(n.value)).map(n => ({
        time: n.time,
        value: n.value
    }))
}

function ls(a) {
    return X.find(n => n.id === a)?.label ?? a
}

function cs(a) {
    return a === 1 ? "Bull" : a === -1 ? "Bear" : "Neutral"
}

function Te(a) {
    return a === 1 ? "text-emerald-400" : a === -1 ? "text-rose-400" : "text-amber-300"
}

function os(a, n) {
    return n === "any" ? !0 : n === "bull" ? a === 1 : n === "bear" ? a === -1 : a === 0
}

function vs() {
    const [, a] = Fe(), [n, D] = l.useState([]), [u, Be] = l.useState("universe"), [Y, Me] = l.useState("latest"), [r, p] = l.useState(() => as()), [y, Z] = l.useState(""), [A, ee] = l.useState(""), [F, se] = l.useState(""), {
        baskets: w
    } = _e(), [_, te] = l.useState(""), P = Xe(n, u === "universe", "ps-clf"), I = Ze(n.map(s => s.ticker), u === "pairCombo", "ps-pc"), [v, H] = l.useState([]), [B, ae] = l.useState(!1), [ne, re] = l.useState({
        done: 0,
        total: 0
    }), [ie, le] = l.useState(null), W = l.useRef(!1);
    l.useEffect(() => {
        ns(r)
    }, [r]), l.useEffect(() => {
        Ie().then(s => {
            D(s), s.length > 0 && (y || Z(s[0].ticker), ee(t => t || s[0].ticker), se(t => t || (s[1]?.ticker ?? s[0].ticker)))
        })
    }, []), l.useEffect(() => {
        !_ && w.length > 0 && te(w[0].id)
    }, [w, _]);
    const N = l.useMemo(() => {
            if (u === "single") return y ? [{
                key: y,
                label: y,
                loader: async () => {
                    const s = await oe(y);
                    return {
                        ohlcLike: s,
                        series: Ne(s),
                        bars: Ce(s)
                    }
                }
            }] : [];
            if (u === "universe") return (P.filteredTickers.length > 0 ? P.filteredTickers : n).map(t => ({
                key: t.ticker,
                label: t.ticker,
                loader: async () => {
                    const i = await oe(t.ticker);
                    return {
                        ohlcLike: i,
                        series: Ne(i),
                        bars: Ce(i)
                    }
                }
            }));
            if (u === "pair") {
                if (!A || !F) return [];
                const s = `${A}/${F}`;
                return [{
                    key: s,
                    label: s,
                    loader: async () => {
                        const t = await de(A, F, "close", "close");
                        return {
                            ohlcLike: null,
                            series: J(t.ratio),
                            bars: Q(t.ratio)
                        }
                    }
                }]
            }
            if (u === "pairCombo") return I.pairs.map(s => ({
                key: s.label,
                label: s.label,
                loader: async () => {
                    const t = await de(s.a, s.b, "close", "close");
                    return {
                        ohlcLike: null,
                        series: J(t.ratio),
                        bars: Q(t.ratio)
                    }
                }
            }));
            if (u === "basket") {
                const s = w.find(t => t.id === _);
                return s ? [{
                    key: `BASKET:${s.name}`,
                    label: `Basket: ${s.name}`,
                    loader: async () => {
                        const t = await He(s, Ke);
                        return {
                            ohlcLike: null,
                            series: J(t),
                            bars: Q(t)
                        }
                    }
                }] : []
            }
            return []
        }, [u, y, P.filteredTickers, n, A, F, I.pairs, w, _]),
        we = l.useCallback(async () => {
            if (N.length === 0) {
                le("No items in the selected scope.");
                return
            }
            ae(!0), le(null), W.current = !1, H(N.map(d => ({
                ticker: d.key,
                scope: d.label,
                status: "pending",
                hits: []
            }))), re({
                done: 0,
                total: N.length
            });
            const s = rs(r),
                t = is(r),
                i = 6;
            let x = 0;
            async function h() {
                for (; !W.current;) {
                    const d = x++;
                    if (d >= N.length) return;
                    const V = N[d];
                    H(g => {
                        const f = g.slice();
                        return f[d] && (f[d] = {
                            ...f[d],
                            status: "running"
                        }), f
                    });
                    try {
                        const {
                            series: g,
                            bars: f
                        } = await V.loader();
                        if (g.length < Math.max(s.minBars, t.minBars)) {
                            H(k => {
                                const m = k.slice();
                                return m[d] && (m[d] = {
                                    ...m[d],
                                    status: "skipped",
                                    errorMsg: "Too few bars"
                                }), m
                            });
                            return
                        }
                        const j = [];
                        if (r.patternsEnabled) try {
                            const k = Ye(g, s),
                                m = g.length - 1;
                            for (const o of k) j.push({
                                kind: "pattern",
                                ticker: V.key,
                                scope: V.label,
                                type: o.type,
                                label: o.label || ls(o.type),
                                direction: o.direction,
                                confidence: o.confidence,
                                r2: o.r2,
                                touches: o.touches,
                                startTime: o.startTime,
                                endTime: o.endTime,
                                ageBars: Math.max(0, m - o.endIndex)
                            })
                        } catch {}
                        if (r.channelsEnabled) try {
                            const k = We(f, t),
                                m = f.length - 1;
                            for (const o of k) {
                                const Ae = o.slope > 1e-4 ? 1 : o.slope < -1e-4 ? -1 : 0;
                                j.push({
                                    kind: "channel",
                                    ticker: V.key,
                                    scope: V.label,
                                    type: o.type,
                                    label: o.label,
                                    direction: Ae,
                                    confidence: o.score,
                                    r2: o.r2,
                                    touches: 0,
                                    startTime: String(f[o.startIdx]?.time ?? ""),
                                    endTime: String(f[o.endIdx]?.time ?? ""),
                                    ageBars: Math.max(0, m - o.endIdx)
                                })
                            }
                        } catch {}
                        j.sort((k, m) => m.confidence - k.confidence);
                        const Le = j.length > 0 ? j[0] : void 0;
                        H(k => {
                            const m = k.slice();
                            return m[d] && (m[d] = {
                                ...m[d],
                                status: "ok",
                                hits: j,
                                best: Le
                            }), m
                        })
                    } catch (g) {
                        H(f => {
                            const j = f.slice();
                            return j[d] && (j[d] = {
                                ...j[d],
                                status: "error",
                                errorMsg: String(g?.message ?? g)
                            }), j
                        })
                    } finally {
                        re(g => ({
                            done: g.done + 1,
                            total: g.total
                        }))
                    }
                }
            }
            const c = Array.from({
                length: Math.min(i, N.length)
            }, () => h());
            await Promise.all(c), ae(!1)
        }, [N, r]),
        Ee = l.useCallback(() => {
            W.current = !0
        }, []),
        $ = l.useMemo(() => {
            const s = [];
            for (const t of v) {
                if (t.status !== "ok") continue;
                const i = Y === "latest" ? t.best ? [t.best] : [] : t.hits;
                for (const x of i) x.confidence < r.minConfidence || r.maxAgeBars > 0 && x.ageBars > r.maxAgeBars || os(x.direction, r.directionFilter) && s.push(x)
            }
            return s
        }, [v, Y, r.minConfidence, r.maxAgeBars, r.directionFilter]),
        [O, Re] = l.useState("confidence"),
        [q, ce] = l.useState("desc"),
        U = l.useMemo(() => {
            const s = $.slice(),
                t = q === "asc" ? 1 : -1;
            return s.sort((i, x) => {
                let h, c;
                switch (O) {
                    case "ticker":
                        h = i.ticker, c = x.ticker;
                        break;
                    case "kind":
                        h = i.kind, c = x.kind;
                        break;
                    case "type":
                        h = i.type, c = x.type;
                        break;
                    case "direction":
                        h = i.direction, c = x.direction;
                        break;
                    case "confidence":
                        h = i.confidence, c = x.confidence;
                        break;
                    case "r2":
                        h = i.r2, c = x.r2;
                        break;
                    case "touches":
                        h = i.touches, c = x.touches;
                        break;
                    case "ageBars":
                        h = i.ageBars, c = x.ageBars;
                        break;
                    case "endTime":
                        h = i.endTime, c = x.endTime;
                        break;
                    default:
                        h = 0, c = 0
                }
                return typeof h == "string" && typeof c == "string" ? t * h.localeCompare(c) : t * (h - c)
            }), s
        }, [$, O, q]),
        C = s => {
            O === s ? ce(t => t === "asc" ? "desc" : "asc") : (Re(s), ce("desc"))
        },
        T = s => O !== s ? null : q === "asc" ? e.jsx(qe, {
            className: "inline w-3 h-3 ml-0.5"
        }) : e.jsx(Ge, {
            className: "inline w-3 h-3 ml-0.5"
        }),
        b = l.useMemo(() => {
            const s = v.filter(c => c.status === "ok").length,
                t = v.filter(c => c.status === "error").length,
                i = v.filter(c => c.status === "skipped").length,
                x = v.reduce((c, d) => c + d.hits.length, 0),
                h = $.length;
            return {
                ok: s,
                err: t,
                sk: i,
                totalHits: x,
                filteredHits: h
            }
        }, [v, $]),
        Pe = s => {
            let t = s;
            if (t.includes("/") && (t = t.split("/")[0]), t.startsWith("BASKET:")) {
                a("/");
                return
            }
            try {
                window.dispatchEvent(new CustomEvent("reit-viz:goto-symbol", {
                    detail: {
                        symbol: t
                    }
                }))
            } catch {}
            try {
                localStorage.setItem("reit-viz.dashboard.pending-symbol", t)
            } catch {}
            a("/")
        };
    return e.jsxs("div", {
        className: "p-4 space-y-4",
        "data-testid": "page-pattern-screener",
        children: [e.jsxs("div", {
            className: "flex items-center justify-between",
            children: [e.jsxs("div", {
                className: "flex items-center gap-2",
                children: [e.jsx(Ve, {
                    className: "w-5 h-5 text-amber-400"
                }), e.jsx("h1", {
                    className: "text-lg font-semibold",
                    children: "Pattern Screener"
                }), e.jsx(ye, {
                    variant: "outline",
                    className: "text-[10px]",
                    children: "Patterns + Channels"
                })]
            }), e.jsxs("div", {
                className: "flex items-center gap-2",
                children: [e.jsx(ke, {
                    value: Y,
                    onValueChange: s => Me(s),
                    children: e.jsxs(ve, {
                        className: "h-7",
                        children: [e.jsx(E, {
                            value: "latest",
                            className: "text-xs px-3",
                            children: "Latest per ticker"
                        }), e.jsx(E, {
                            value: "all",
                            className: "text-xs px-3",
                            children: "All hits"
                        })]
                    })
                }), B ? e.jsxs(z, {
                    size: "sm",
                    variant: "destructive",
                    onClick: Ee,
                    "data-testid": "btn-stop",
                    children: [e.jsx(es, {
                        className: "w-3 h-3 mr-1"
                    }), " Stop"]
                }) : e.jsxs(z, {
                    size: "sm",
                    onClick: we,
                    disabled: N.length === 0,
                    "data-testid": "btn-run",
                    children: [e.jsx(ss, {
                        className: "w-3 h-3 mr-1"
                    }), " Run (", N.length, ")"]
                })]
            })]
        }), e.jsx(ke, {
            value: u,
            onValueChange: s => Be(s),
            children: e.jsxs(ve, {
                className: "h-8",
                children: [e.jsx(E, {
                    value: "single",
                    className: "text-xs",
                    children: "Single"
                }), e.jsx(E, {
                    value: "universe",
                    className: "text-xs",
                    children: "Universe"
                }), e.jsx(E, {
                    value: "pair",
                    className: "text-xs",
                    children: "Pair"
                }), e.jsx(E, {
                    value: "pairCombo",
                    className: "text-xs",
                    children: "Pair-Combo"
                }), e.jsx(E, {
                    value: "basket",
                    className: "text-xs",
                    children: "Basket"
                })]
            })
        }), e.jsxs("div", {
            className: "grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4",
            children: [e.jsxs(be, {
                children: [e.jsx(ge, {
                    className: "py-2 px-3",
                    children: e.jsx(fe, {
                        className: "text-xs",
                        children: "Scope & Config"
                    })
                }), e.jsxs(je, {
                    className: "px-3 pb-3 space-y-3",
                    children: [u === "single" && e.jsx("div", {
                        className: xe(y) ? "opacity-40 pointer-events-none" : "",
                        children: e.jsx(G, {
                            tickers: n,
                            value: xe(y) ? "" : y,
                            onChange: Z,
                            disabled: B,
                            label: "Ticker"
                        })
                    }), u === "universe" && e.jsxs("div", {
                        className: "space-y-2",
                        children: [e.jsx(M, {
                            className: "text-xs",
                            children: "Universe filter"
                        }), P.universeSourceUI, P.classFilterUI, e.jsxs("div", {
                            className: "text-[11px] text-muted-foreground",
                            children: [P.filteredTickers.length, " tickers selected"]
                        })]
                    }), u === "pair" && e.jsxs("div", {
                        className: "grid grid-cols-2 gap-2",
                        children: [e.jsx(G, {
                            tickers: n,
                            value: A,
                            onChange: ee,
                            disabled: B,
                            label: "A"
                        }), e.jsx(G, {
                            tickers: n,
                            value: F,
                            onChange: se,
                            disabled: B,
                            label: "B"
                        })]
                    }), u === "pairCombo" && e.jsxs("div", {
                        className: "space-y-2",
                        children: [I.ui, e.jsxs("div", {
                            className: "text-[11px] text-muted-foreground",
                            children: [I.cappedPairCount, " pairs ", I.capped && e.jsx("span", {
                                className: "text-amber-400",
                                children: "(capped)"
                            })]
                        })]
                    }), u === "basket" && e.jsxs("div", {
                        className: "space-y-2",
                        children: [e.jsx(M, {
                            className: "text-xs",
                            children: "Basket"
                        }), e.jsxs(he, {
                            value: _,
                            onValueChange: te,
                            disabled: B,
                            children: [e.jsx(ue, {
                                className: "h-7 text-xs",
                                "data-testid": "select-basket",
                                children: e.jsx(pe, {
                                    placeholder: "Pick a basket"
                                })
                            }), e.jsxs(me, {
                                children: [w.length === 0 && e.jsx(L, {
                                    value: "__none",
                                    disabled: !0,
                                    children: "(no baskets)"
                                }), w.map(s => e.jsxs(L, {
                                    value: s.id,
                                    children: [s.name, " · ", s.tickers.length, " tickers"]
                                }, s.id))]
                            })]
                        })]
                    }), e.jsxs("div", {
                        className: "border-t border-border pt-3 space-y-3",
                        children: [e.jsxs("div", {
                            className: "space-y-2",
                            children: [e.jsx("div", {
                                className: "flex items-center justify-between",
                                children: e.jsxs(M, {
                                    className: "text-xs flex items-center gap-2",
                                    children: [e.jsx(K, {
                                        checked: r.patternsEnabled,
                                        onCheckedChange: s => p(t => ({
                                            ...t,
                                            patternsEnabled: !!s
                                        })),
                                        "data-testid": "cb-patterns-enabled"
                                    }), "Detect Patterns"]
                                })
                            }), r.patternsEnabled && e.jsxs(e.Fragment, {
                                children: [e.jsxs("div", {
                                    children: [e.jsxs("div", {
                                        className: "flex justify-between text-[10px] text-muted-foreground",
                                        children: [e.jsx("span", {
                                            children: "Min R²"
                                        }), e.jsx("span", {
                                            children: r.patternMinR2.toFixed(2)
                                        })]
                                    }), e.jsx(S, {
                                        value: [r.patternMinR2],
                                        min: .2,
                                        max: .95,
                                        step: .05,
                                        onValueChange: ([s]) => p(t => ({
                                            ...t,
                                            patternMinR2: s
                                        })),
                                        "data-testid": "sl-pat-r2"
                                    })]
                                }), e.jsxs("div", {
                                    children: [e.jsxs("div", {
                                        className: "flex justify-between text-[10px] text-muted-foreground",
                                        children: [e.jsx("span", {
                                            children: "Min touches"
                                        }), e.jsx("span", {
                                            children: r.patternMinTouches
                                        })]
                                    }), e.jsx(S, {
                                        value: [r.patternMinTouches],
                                        min: 2,
                                        max: 10,
                                        step: 1,
                                        onValueChange: ([s]) => p(t => ({
                                            ...t,
                                            patternMinTouches: s
                                        }))
                                    })]
                                }), e.jsxs("div", {
                                    children: [e.jsxs("div", {
                                        className: "flex justify-between text-[10px] text-muted-foreground",
                                        children: [e.jsx("span", {
                                            children: "Pivot lookback"
                                        }), e.jsx("span", {
                                            children: r.patternPivotLookback
                                        })]
                                    }), e.jsx(S, {
                                        value: [r.patternPivotLookback],
                                        min: 2,
                                        max: 12,
                                        step: 1,
                                        onValueChange: ([s]) => p(t => ({
                                            ...t,
                                            patternPivotLookback: s
                                        }))
                                    })]
                                }), e.jsxs("div", {
                                    children: [e.jsxs("div", {
                                        className: "flex justify-between text-[10px] text-muted-foreground",
                                        children: [e.jsx("span", {
                                            children: "Scan last N bars"
                                        }), e.jsx("span", {
                                            children: r.patternLookbackBars
                                        })]
                                    }), e.jsx(S, {
                                        value: [r.patternLookbackBars],
                                        min: 100,
                                        max: 1500,
                                        step: 50,
                                        onValueChange: ([s]) => p(t => ({
                                            ...t,
                                            patternLookbackBars: s
                                        }))
                                    })]
                                }), e.jsx("div", {
                                    className: "grid grid-cols-2 gap-1",
                                    children: X.map(s => e.jsxs("label", {
                                        className: "flex items-center gap-1.5 text-[11px]",
                                        children: [e.jsx(K, {
                                            checked: r.patternEnabled[s.id],
                                            onCheckedChange: t => p(i => ({
                                                ...i,
                                                patternEnabled: {
                                                    ...i.patternEnabled,
                                                    [s.id]: !!t
                                                }
                                            })),
                                            "data-testid": `cb-pat-${s.id}`
                                        }), e.jsx("span", {
                                            className: Te(s.dir),
                                            children: s.label
                                        })]
                                    }, s.id))
                                })]
                            })]
                        }), e.jsxs("div", {
                            className: "space-y-2 border-t border-border pt-3",
                            children: [e.jsx("div", {
                                className: "flex items-center justify-between",
                                children: e.jsxs(M, {
                                    className: "text-xs flex items-center gap-2",
                                    children: [e.jsx(K, {
                                        checked: r.channelsEnabled,
                                        onCheckedChange: s => p(t => ({
                                            ...t,
                                            channelsEnabled: !!s
                                        })),
                                        "data-testid": "cb-channels-enabled"
                                    }), "Detect Channels"]
                                })
                            }), r.channelsEnabled && e.jsxs(e.Fragment, {
                                children: [e.jsxs("div", {
                                    children: [e.jsxs("div", {
                                        className: "flex justify-between text-[10px] text-muted-foreground",
                                        children: [e.jsx("span", {
                                            children: "Min R²"
                                        }), e.jsx("span", {
                                            children: r.channelMinR2.toFixed(2)
                                        })]
                                    }), e.jsx(S, {
                                        value: [r.channelMinR2],
                                        min: .2,
                                        max: .95,
                                        step: .05,
                                        onValueChange: ([s]) => p(t => ({
                                            ...t,
                                            channelMinR2: s
                                        }))
                                    })]
                                }), e.jsxs("div", {
                                    children: [e.jsxs("div", {
                                        className: "flex justify-between text-[10px] text-muted-foreground",
                                        children: [e.jsx("span", {
                                            children: "Min containment"
                                        }), e.jsxs("span", {
                                            children: [(r.channelMinContainment * 100).toFixed(0), "%"]
                                        })]
                                    }), e.jsx(S, {
                                        value: [r.channelMinContainment],
                                        min: .5,
                                        max: 1,
                                        step: .05,
                                        onValueChange: ([s]) => p(t => ({
                                            ...t,
                                            channelMinContainment: s
                                        }))
                                    })]
                                }), e.jsxs("div", {
                                    children: [e.jsxs("div", {
                                        className: "flex justify-between text-[10px] text-muted-foreground",
                                        children: [e.jsx("span", {
                                            children: "Bandwidth (σ)"
                                        }), e.jsx("span", {
                                            children: r.channelStdevMult.toFixed(1)
                                        })]
                                    }), e.jsx(S, {
                                        value: [r.channelStdevMult],
                                        min: 1,
                                        max: 3.5,
                                        step: .25,
                                        onValueChange: ([s]) => p(t => ({
                                            ...t,
                                            channelStdevMult: s
                                        }))
                                    })]
                                }), e.jsxs("div", {
                                    children: [e.jsxs("div", {
                                        className: "flex justify-between text-[10px] text-muted-foreground",
                                        children: [e.jsx("span", {
                                            children: "Max per ticker"
                                        }), e.jsx("span", {
                                            children: r.channelMaxChannels
                                        })]
                                    }), e.jsx(S, {
                                        value: [r.channelMaxChannels],
                                        min: 1,
                                        max: 8,
                                        step: 1,
                                        onValueChange: ([s]) => p(t => ({
                                            ...t,
                                            channelMaxChannels: s
                                        }))
                                    })]
                                }), e.jsxs("div", {
                                    className: "space-y-1",
                                    children: [e.jsx(M, {
                                        className: "text-[11px]",
                                        children: "Channel types"
                                    }), ts.map(s => e.jsxs("label", {
                                        className: "flex items-center gap-1.5 text-[11px]",
                                        children: [e.jsx(K, {
                                            checked: r.channelTypes[s.id],
                                            onCheckedChange: t => p(i => ({
                                                ...i,
                                                channelTypes: {
                                                    ...i.channelTypes,
                                                    [s.id]: !!t
                                                }
                                            }))
                                        }), e.jsx("span", {
                                            children: s.label
                                        })]
                                    }, s.id))]
                                })]
                            })]
                        }), e.jsxs("div", {
                            className: "space-y-2 border-t border-border pt-3",
                            children: [e.jsx(M, {
                                className: "text-xs",
                                children: "Result Filters"
                            }), e.jsxs("div", {
                                children: [e.jsxs("div", {
                                    className: "flex justify-between text-[10px] text-muted-foreground",
                                    children: [e.jsx("span", {
                                        children: "Min confidence"
                                    }), e.jsx("span", {
                                        children: r.minConfidence.toFixed(2)
                                    })]
                                }), e.jsx(S, {
                                    value: [r.minConfidence],
                                    min: 0,
                                    max: 1,
                                    step: .05,
                                    onValueChange: ([s]) => p(t => ({
                                        ...t,
                                        minConfidence: s
                                    }))
                                })]
                            }), e.jsxs("div", {
                                className: "grid grid-cols-2 gap-2 items-center",
                                children: [e.jsx(M, {
                                    className: "text-[10px]",
                                    children: "Max age (bars)"
                                }), e.jsx(De, {
                                    type: "number",
                                    min: 0,
                                    value: r.maxAgeBars,
                                    onChange: s => p(t => ({
                                        ...t,
                                        maxAgeBars: Math.max(0, Number(s.target.value) || 0)
                                    })),
                                    className: "h-7 text-xs"
                                })]
                            }), e.jsxs("div", {
                                className: "grid grid-cols-2 gap-2 items-center",
                                children: [e.jsx(M, {
                                    className: "text-[10px]",
                                    children: "Direction"
                                }), e.jsxs(he, {
                                    value: r.directionFilter,
                                    onValueChange: s => p(t => ({
                                        ...t,
                                        directionFilter: s
                                    })),
                                    children: [e.jsx(ue, {
                                        className: "h-7 text-xs",
                                        children: e.jsx(pe, {})
                                    }), e.jsxs(me, {
                                        children: [e.jsx(L, {
                                            value: "any",
                                            children: "Any"
                                        }), e.jsx(L, {
                                            value: "bull",
                                            children: "Bullish only"
                                        }), e.jsx(L, {
                                            value: "bear",
                                            children: "Bearish only"
                                        }), e.jsx(L, {
                                            value: "neutral",
                                            children: "Neutral only"
                                        })]
                                    })]
                                })]
                            })]
                        }), e.jsx(z, {
                            variant: "outline",
                            size: "sm",
                            className: "w-full text-xs",
                            onClick: () => p({
                                ...R
                            }),
                            children: "Reset to defaults"
                        })]
                    })]
                })]
            }), e.jsxs(be, {
                children: [e.jsxs(ge, {
                    className: "py-2 px-3 flex flex-row items-center justify-between space-y-0",
                    children: [e.jsxs(fe, {
                        className: "text-xs",
                        children: ["Results · ", U.length, " hit", U.length === 1 ? "" : "s", B && e.jsxs("span", {
                            className: "ml-2 text-muted-foreground",
                            children: [e.jsx($e, {
                                className: "inline w-3 h-3 mr-1 animate-spin"
                            }), ne.done, "/", ne.total]
                        })]
                    }), e.jsxs("div", {
                        className: "text-[11px] text-muted-foreground",
                        children: [b.ok, " ok · ", b.sk, " skipped · ", b.err, " errors · ", b.totalHits, " raw hits", b.totalHits > 0 && b.filteredHits < b.totalHits && e.jsxs("span", {
                            className: "ml-1 text-amber-400",
                            children: ["(", b.totalHits - b.filteredHits, " filtered)"]
                        })]
                    })]
                }), e.jsxs(je, {
                    className: "p-0",
                    children: [ie && e.jsxs("div", {
                        className: "px-3 py-2 text-xs text-rose-400 flex items-center gap-1",
                        children: [e.jsx(Oe, {
                            className: "w-3 h-3"
                        }), ie]
                    }), e.jsxs(Ue, {
                        className: "h-[68vh]",
                        children: [e.jsxs("table", {
                            className: "w-full text-xs",
                            children: [e.jsx("thead", {
                                className: "bg-muted/50 sticky top-0",
                                children: e.jsxs("tr", {
                                    className: "text-left",
                                    children: [e.jsxs("th", {
                                        className: "px-2 py-1.5 cursor-pointer",
                                        onClick: () => C("ticker"),
                                        children: ["Scope", T("ticker")]
                                    }), e.jsxs("th", {
                                        className: "px-2 py-1.5 cursor-pointer",
                                        onClick: () => C("kind"),
                                        children: ["Kind", T("kind")]
                                    }), e.jsxs("th", {
                                        className: "px-2 py-1.5 cursor-pointer",
                                        onClick: () => C("type"),
                                        children: ["Type", T("type")]
                                    }), e.jsxs("th", {
                                        className: "px-2 py-1.5 cursor-pointer",
                                        onClick: () => C("direction"),
                                        children: ["Dir", T("direction")]
                                    }), e.jsxs("th", {
                                        className: "px-2 py-1.5 text-right cursor-pointer",
                                        onClick: () => C("confidence"),
                                        children: ["Conf", T("confidence")]
                                    }), e.jsxs("th", {
                                        className: "px-2 py-1.5 text-right cursor-pointer",
                                        onClick: () => C("r2"),
                                        children: ["R²", T("r2")]
                                    }), e.jsxs("th", {
                                        className: "px-2 py-1.5 text-right cursor-pointer",
                                        onClick: () => C("touches"),
                                        children: ["Touch", T("touches")]
                                    }), e.jsxs("th", {
                                        className: "px-2 py-1.5 text-right cursor-pointer",
                                        onClick: () => C("ageBars"),
                                        children: ["Age", T("ageBars")]
                                    }), e.jsxs("th", {
                                        className: "px-2 py-1.5 cursor-pointer",
                                        onClick: () => C("endTime"),
                                        children: ["End", T("endTime")]
                                    }), e.jsx("th", {
                                        className: "px-2 py-1.5"
                                    })]
                                })
                            }), e.jsxs("tbody", {
                                children: [U.length === 0 && !B && e.jsx("tr", {
                                    children: e.jsx("td", {
                                        colSpan: 10,
                                        className: "px-3 py-6 text-center text-muted-foreground",
                                        children: v.length === 0 ? "Configure scope &amp; press Run to scan." : b.totalHits > 0 ? `No hits match the current filters. ${b.totalHits} raw hits were found — try lowering Min confidence, raising Max age, or switching Direction to Any.` : "No patterns or channels detected. Try lowering Min R² / Min touches or widening the scan window."
                                    })
                                }), U.map((s, t) => e.jsxs("tr", {
                                    className: "border-t border-border/50 hover:bg-muted/30",
                                    children: [e.jsx("td", {
                                        className: "px-2 py-1.5 font-mono text-amber-300",
                                        children: s.scope
                                    }), e.jsx("td", {
                                        className: "px-2 py-1.5",
                                        children: e.jsx(ye, {
                                            variant: "outline",
                                            className: "text-[9px] px-1 py-0",
                                            children: s.kind === "pattern" ? "Pattern" : "Channel"
                                        })
                                    }), e.jsx("td", {
                                        className: "px-2 py-1.5",
                                        children: s.label
                                    }), e.jsx("td", {
                                        className: `px-2 py-1.5 font-semibold ${Te(s.direction)}`,
                                        children: cs(s.direction)
                                    }), e.jsxs("td", {
                                        className: "px-2 py-1.5 text-right tabular-nums",
                                        children: [(s.confidence * 100).toFixed(0), "%"]
                                    }), e.jsx("td", {
                                        className: "px-2 py-1.5 text-right tabular-nums",
                                        children: s.r2.toFixed(2)
                                    }), e.jsx("td", {
                                        className: "px-2 py-1.5 text-right tabular-nums",
                                        children: s.touches || "—"
                                    }), e.jsx("td", {
                                        className: "px-2 py-1.5 text-right tabular-nums",
                                        children: s.ageBars
                                    }), e.jsx("td", {
                                        className: "px-2 py-1.5 tabular-nums text-muted-foreground",
                                        children: s.endTime?.slice(0, 10)
                                    }), e.jsx("td", {
                                        className: "px-2 py-1.5",
                                        children: e.jsxs(z, {
                                            size: "sm",
                                            variant: "ghost",
                                            className: "h-6 px-1.5 text-[10px]",
                                            onClick: () => Pe(s.ticker),
                                            children: ["Chart ", e.jsx(ze, {
                                                className: "w-3 h-3"
                                            })]
                                        })
                                    })]
                                }, `${s.ticker}-${s.kind}-${s.type}-${s.startTime}-${t}`))]
                            })]
                        }), (b.err > 0 || b.sk > 0) && !B && e.jsxs("div", {
                            className: "border-t border-border px-3 py-2 text-[10px] text-muted-foreground space-y-0.5",
                            children: [v.filter(s => s.status === "error").slice(0, 10).map(s => e.jsxs("div", {
                                className: "text-rose-400/80",
                                children: ["err · ", s.ticker, ": ", s.errorMsg]
                            }, s.ticker)), v.filter(s => s.status === "skipped").slice(0, 5).map(s => e.jsxs("div", {
                                children: ["skip · ", s.ticker, ": ", s.errorMsg]
                            }, s.ticker))]
                        })]
                    })]
                })]
            })]
        })]
    })
}
export {
    vs as
    default
};