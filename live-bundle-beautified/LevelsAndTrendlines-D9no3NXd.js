import {
    r as o,
    a as Ve,
    aj as Je,
    af as qe,
    e as Xe,
    cP as $e,
    h as Qe,
    g as Ze,
    ae as et,
    cJ as tt,
    cK as rt,
    cL as st,
    dI as nt,
    N as at,
    j as t,
    y as ot,
    cO as it,
    dn as ct
} from "./index-CsG73Aq_.js";
import {
    D as lt,
    d as dt,
    S as pt
} from "./SupportResistance-Cqj5ktkD.js";
import {
    d as ut,
    D as mt,
    T as xt
} from "./Trendlines-BNfKnhdH.js";
import {
    g as ht
} from "./yahooPairsRatio-DERC-reP.js";
import {
    C as ft
} from "./ClassificationFiltersWithSource-D7v4WOtR.js";
import {
    u as gt
} from "./globalUniverse-DuqPcp2u.js";
import "./UnifiedTickerPicker-D927mSvl.js";
import "./BasketTickerPill-DA9Wjwwc.js";
import "./BasketPicker-DkcKAXfe.js";
const K = 100;

function Be(n, N, T, Z) {
    if (![n, N, T, Z].every(Number.isFinite)) return null;
    const G = n - T,
        W = N - Z;
    return G === 0 || W === 0 ? null : G < 0 && W > 0 ? "up" : G > 0 && W < 0 ? "down" : null
}

function bt(n, N) {
    const T = N.closes.length;
    return n.type === "horizontal" || n.type === "fib" ? new Array(T).fill(n.price) : n.type === "ma" && n.maType && n.maPeriod ? ct(N.closes, n.maPeriod, n.maType) : new Array(T).fill(null)
}

function ce(n, N) {
    return n.slope * (N - n.i1) + n.price1
}

function kt(n) {
    return n.type === "ma" ? `MA: ${n.maType??"MA"}(${n.maPeriod??"?"})` : n.type === "fib" ? `Fib ${((n.fibLevel??0)*100).toFixed(1)}%` : "Horizontal"
}

function yt() {
    const [n, N] = o.useState([]), {
        universeTickers: T,
        filters: Z,
        setFilters: G,
        search: W,
        setSearch: Ue,
        manualTickers: ze,
        setManualTickers: De,
        filteredCount: Ee,
        totalCount: Le
    } = Ve(), {
        baskets: Ie,
        getBasket: le
    } = Je();
    o.useEffect(() => {
        qe().then(e => N(e)).catch(() => {})
    }, []);
    const [p, de] = o.useState("universe"), [D, pe] = o.useState(""), [V, ue] = o.useState(""), [J, me] = o.useState(""), [q, xe] = o.useState(""), [k, he] = o.useState(() => Xe()), [E, fe] = o.useState(""), [L, ge] = o.useState(() => new Set), [re, Oe] = o.useState("workbook"), {
        metas: be
    } = gt(), He = 50, ee = 500, [se, ke] = o.useState("3y"), [I, ye] = o.useState(() => $e("3y")), [X, ve] = o.useState("daily"), [R, je] = o.useState(!0), [$, Ne] = o.useState(!0), [B, Se] = o.useState(!0), [w, Ce] = o.useState(!0), Q = R || $ || B, [U, Ae] = o.useState(1), [O, Te] = o.useState(0), [H, we] = o.useState(10), Fe = o.useMemo(() => ({
        ...lt,
        enableHorizontal: R,
        enableMA: $,
        enableFib: B
    }), [R, $, B]), Pe = mt, [ne, Me] = o.useState(!1), [Re, P] = o.useState({
        current: 0,
        total: 0
    }), [_, ae] = o.useState([]), [z, oe] = o.useState([]), ie = o.useRef(!1), S = o.useMemo(() => p !== "pairCombo" ? [] : k.economy.size + k.sector.size + k.subsector.size + k.industryGroup.size + k.industry.size + k.subindustry.size + L.size + (E.trim().length > 0 ? 1 : 0) === 0 ? [] : Qe(re === "global" ? be : n, k, E, L).map(c => c.ticker.toUpperCase()).filter((c, a, s) => s.indexOf(c) === a), [p, n, be, re, k, E, L]), te = o.useMemo(() => {
        const e = S.length;
        return e >= 2 ? e * (e - 1) / 2 : 0
    }, [S]), m = o.useMemo(() => {
        if (p === "single") {
            const e = (V || "").toUpperCase().trim();
            return e ? [n.find(l => l.ticker.toUpperCase() === e) || {
                ticker: e,
                name: e
            }] : []
        }
        if (p === "pair") {
            const e = (J || "").toUpperCase().trim(),
                r = (q || "").toUpperCase().trim();
            if (!e || !r || e === r) return [];
            const l = `${e}/${r}`;
            return [{
                ticker: l,
                name: l,
                pairA: e,
                pairB: r
            }]
        }
        if (p === "pairCombo") {
            const e = [],
                r = S;
            for (let l = 0; l < r.length; l++) {
                for (let c = l + 1; c < r.length; c++) {
                    const a = r[l],
                        s = r[c],
                        i = `${a}/${s}`;
                    if (e.push({
                            ticker: i,
                            name: i,
                            pairA: a,
                            pairB: s
                        }), e.length >= ee) break
                }
                if (e.length >= ee) break
            }
            return e
        }
        if (p === "basket") {
            if (!D) return [];
            const e = le(D);
            if (!e) return [];
            const r = new Set(e.tickers.map(s => s.toUpperCase())),
                l = n.filter(s => r.has(s.ticker.toUpperCase())),
                c = new Set(l.map(s => s.ticker.toUpperCase())),
                a = [];
            for (const s of e.tickers) {
                const i = s.toUpperCase();
                c.has(i) || a.push({
                    ticker: i,
                    name: i
                })
            }
            return [...l, ...a]
        }
        return T ? n.filter(e => T.has(e.ticker)) : n
    }, [p, D, V, J, q, S, le, T, n]), _e = o.useCallback(() => {
        const e = {
                economy: Array.from(k.economy),
                sector: Array.from(k.sector),
                subsector: Array.from(k.subsector),
                industryGroup: Array.from(k.industryGroup),
                industry: Array.from(k.industry),
                subindustry: Array.from(k.subindustry)
            },
            r = Array.from(L);
        return {
            source: p,
            basketId: D,
            singleTicker: V,
            pairTickerA: J,
            pairTickerB: q,
            pcFiltersSer: e,
            pcClassSearch: E,
            pcManualTickersSer: r,
            datePreset: se,
            dateRange: I,
            timeframe: X,
            scanHorizontal: R,
            scanMA: $,
            scanFib: B,
            scanTrendlines: w,
            lookback: U,
            minScore: O,
            topN: H,
            rows: _,
            skipped: z
        }
    }, [p, D, V, J, q, k, E, L, se, I, X, R, $, B, w, U, O, H, _, z]), Ye = o.useCallback(e => {
        if (!(!e || typeof e != "object")) {
            if (typeof e.source == "string" && de(e.source), typeof e.basketId == "string" && pe(e.basketId), typeof e.singleTicker == "string" && ue(e.singleTicker), typeof e.pairTickerA == "string" && me(e.pairTickerA), typeof e.pairTickerB == "string" && xe(e.pairTickerB), e.pcFiltersSer && typeof e.pcFiltersSer == "object") {
                const r = e.pcFiltersSer;
                he({
                    economy: new Set(Array.isArray(r.economy) ? r.economy : []),
                    sector: new Set(Array.isArray(r.sector) ? r.sector : []),
                    subsector: new Set(Array.isArray(r.subsector) ? r.subsector : []),
                    industryGroup: new Set(Array.isArray(r.industryGroup) ? r.industryGroup : []),
                    industry: new Set(Array.isArray(r.industry) ? r.industry : []),
                    subindustry: new Set(Array.isArray(r.subindustry) ? r.subindustry : [])
                })
            }
            typeof e.pcClassSearch == "string" && fe(e.pcClassSearch), Array.isArray(e.pcManualTickersSer) && ge(new Set(e.pcManualTickersSer)), typeof e.datePreset == "string" && ke(e.datePreset), e.dateRange && ye(e.dateRange), e.timeframe && ve(e.timeframe), typeof e.scanHorizontal == "boolean" && je(e.scanHorizontal), typeof e.scanMA == "boolean" && Ne(e.scanMA), typeof e.scanFib == "boolean" && Se(e.scanFib), typeof e.scanTrendlines == "boolean" && Ce(e.scanTrendlines), typeof e.lookback == "number" && Ae(e.lookback), typeof e.minScore == "number" && Te(e.minScore), typeof e.topN == "number" && we(e.topN), Array.isArray(e.rows) && ae(e.rows), Array.isArray(e.skipped) && oe(e.skipped)
        }
    }, []);
    Ze("crossing-screener", _e, Ye);
    const Ke = o.useCallback(async () => {
            if (!Q && !w || m.length === 0 || U < 1 || !Number.isFinite(U)) return;
            ie.current = !1, Me(!0), ae([]), oe([]), P({
                current: 0,
                total: m.length
            });
            const e = [],
                r = [];
            let l = [];
            if (p === "pair" || p === "pairCombo") try {
                l = await et()
            } catch {}
            for (let c = 0; c < m.length && !ie.current; c++) {
                const a = m[c];
                try {
                    let s, i, C, j, f;
                    if (p === "pair" || p === "pairCombo") {
                        const y = (a.pairA || "").toUpperCase().trim(),
                            d = (a.pairB || "").toUpperCase().trim();
                        if (!y || !d) {
                            e.push({
                                ticker: a.ticker,
                                reason: "missing pair legs"
                            }), P({
                                current: c + 1,
                                total: m.length
                            });
                            continue
                        }
                        const x = await ht(y, d, l);
                        if (!x || x.prices.length < K) {
                            e.push({
                                ticker: a.ticker,
                                reason: x ? `only ${x.prices.length} bars (need ${K})` : "no pair data"
                            }), P({
                                current: c + 1,
                                total: m.length
                            });
                            continue
                        }
                        const h = x.indices.map(v => l[v] || ""),
                            u = x.prices,
                            b = I.start,
                            F = I.end,
                            A = [];
                        for (let v = 0; v < h.length; v++) {
                            const Y = h[v];
                            Y && (b && Y < b || F && Y > F || A.push(v))
                        }
                        if (A.length < K) {
                            e.push({
                                ticker: a.ticker,
                                reason: `only ${A.length} bars in range (need ${K})`
                            }), P({
                                current: c + 1,
                                total: m.length
                            });
                            continue
                        }
                        j = A.map(v => h[v]), s = A.map(v => u[v]), i = s.slice(), C = s.slice(), f = s.length
                    } else {
                        const y = await tt(a.ticker);
                        if (!y) {
                            e.push({
                                ticker: a.ticker,
                                reason: "no data"
                            }), P({
                                current: c + 1,
                                total: m.length
                            });
                            continue
                        }
                        const d = rt(y, I);
                        if (f = d.adjCloses.length, f < K) {
                            e.push({
                                ticker: a.ticker,
                                reason: `only ${f} bars (need ${K})`
                            }), P({
                                current: c + 1,
                                total: m.length
                            });
                            continue
                        }
                        s = d.adjCloses, i = d.highs.map((x, h) => {
                            const u = d.closes[h],
                                b = d.adjCloses[h];
                            return u && u > 0 && Number.isFinite(u) && Number.isFinite(b) ? x * (b / u) : x
                        }), C = d.lows.map((x, h) => {
                            const u = d.closes[h],
                                b = d.adjCloses[h];
                            return u && u > 0 && Number.isFinite(u) && Number.isFinite(b) ? x * (b / u) : x
                        }), j = d.dates.slice(0, f)
                    }
                    if (X === "weekly") {
                        const y = st({
                            dates: j,
                            closes: s,
                            adjCloses: s,
                            highs: i,
                            lows: C
                        }, "weekly");
                        if (y.closes.length < 30) {
                            e.push({
                                ticker: a.ticker,
                                reason: `only ${y.closes.length} weekly bars (need 30)`
                            }), P({
                                current: c + 1,
                                total: m.length
                            });
                            continue
                        }
                        j = y.dates, s = y.closes, i = y.highs, C = y.lows, f = s.length
                    }
                    const g = s[f - 1],
                        M = Math.min(Math.max(1, Math.floor(U)), f - 1);
                    if (Q) {
                        const y = dt({
                            dates: j,
                            closes: s,
                            highs: i,
                            lows: C
                        }, Fe).slice(0, H);
                        for (const d of y) {
                            if (d.compositeScore < O) continue;
                            const x = bt(d, {
                                    closes: s,
                                    highs: i,
                                    lows: C
                                }),
                                h = x[f - 1];
                            if (!(h == null || !Number.isFinite(h)))
                                for (let u = 0; u < M; u++) {
                                    const b = f - 1 - u,
                                        F = b - 1;
                                    if (F < 0) break;
                                    const A = x[b],
                                        v = x[F];
                                    if (A == null || v == null) continue;
                                    const Y = Be(s[F], s[b], v, A);
                                    if (Y) {
                                        r.push({
                                            ticker: a.ticker,
                                            name: a.name || a.ticker,
                                            currentPrice: g,
                                            kind: "level",
                                            subtype: kt(d),
                                            direction: Y,
                                            candlesAgo: u + 1,
                                            crossDate: j[b],
                                            closeAtCross: s[b],
                                            levelValueAtCross: A,
                                            distancePct: (g - h) / h,
                                            score: d.compositeScore,
                                            level: d,
                                            pairA: a.pairA,
                                            pairB: a.pairB
                                        });
                                        break
                                    }
                                }
                        }
                    }
                    if (w) {
                        const y = ut({
                            dates: j,
                            closes: s,
                            highs: i,
                            lows: C
                        }, Pe).slice(0, H);
                        for (const d of y) {
                            if (d.compositeScore < O) continue;
                            const x = ce(d, f - 1);
                            if (Number.isFinite(x))
                                for (let h = 0; h < M; h++) {
                                    const u = f - 1 - h,
                                        b = u - 1;
                                    if (b < 0) break;
                                    const F = ce(d, u),
                                        A = ce(d, b),
                                        v = Be(s[b], s[u], A, F);
                                    if (v) {
                                        r.push({
                                            ticker: a.ticker,
                                            name: a.name || a.ticker,
                                            currentPrice: g,
                                            kind: "trendline",
                                            subtype: `Trendline (${d.kind})`,
                                            direction: v,
                                            candlesAgo: h + 1,
                                            crossDate: j[u],
                                            closeAtCross: s[u],
                                            levelValueAtCross: F,
                                            distancePct: (g - x) / x,
                                            score: d.compositeScore,
                                            trendline: d,
                                            pairA: a.pairA,
                                            pairB: a.pairB
                                        });
                                        break
                                    }
                                }
                        }
                    }
                } catch (s) {
                    e.push({
                        ticker: a.ticker,
                        reason: s?.message || "error"
                    })
                }
                P({
                    current: c + 1,
                    total: m.length
                }), c % 5 === 4 && await new Promise(s => setTimeout(s, 0))
            }
            r.sort((c, a) => c.candlesAgo !== a.candlesAgo ? c.candlesAgo - a.candlesAgo : a.score - c.score), ae(r), oe(e), Me(!1)
        }, [Q, w, m, U, I, X, Fe, Pe, H, O, p]),
        Ge = o.useCallback(() => {
            ie.current = !0
        }, []),
        We = o.useCallback(e => {
            try {
                const r = !!(e.pairA && e.pairB),
                    l = r && e.pairA ? e.pairA.toUpperCase() : e.ticker.toUpperCase();
                if (e.kind === "level" && e.level) {
                    const a = "reit-viz-srlevel-seeds-v1",
                        s = "reit-viz-srlevel-persistent-v1",
                        i = e.level,
                        C = [{
                            type: i.type,
                            price: i.price,
                            maType: i.maType ?? null,
                            maPeriod: i.maPeriod ?? null,
                            fibLevel: i.fibLevel ?? null,
                            touchCount: i.touchCount,
                            bounceReverseRate: i.bounceReverseRate,
                            holdRate: i.holdRate,
                            compositeScore: i.compositeScore,
                            futureBars: 30,
                            createdAt: Date.now()
                        }];
                    for (const j of [a, s]) {
                        const f = localStorage.getItem(j);
                        let g = {};
                        try {
                            g = f ? JSON.parse(f) : {}
                        } catch {
                            g = {}
                        }
                        const M = Array.isArray(g[l]) ? g[l] : [];
                        M.push(...C), g[l] = M, localStorage.setItem(j, JSON.stringify(g))
                    }
                } else if (e.kind === "trendline" && e.trendline) {
                    const a = "reit-viz-trendline-seeds-v1",
                        s = "reit-viz-trendline-persistent-v1",
                        i = e.trendline,
                        C = [{
                            kind: i.kind,
                            date1: i.date1,
                            price1: i.price1,
                            date2: i.date2,
                            price2: i.price2,
                            slope: i.slope,
                            slopePctPerYear: i.slopePctPerYear,
                            broken: !!i.broken,
                            compositeScore: i.compositeScore,
                            futureBars: 30,
                            createdAt: Date.now()
                        }];
                    for (const j of [a, s]) {
                        const f = localStorage.getItem(j);
                        let g = {};
                        try {
                            g = f ? JSON.parse(f) : {}
                        } catch {
                            g = {}
                        }
                        const M = Array.isArray(g[l]) ? g[l] : [];
                        M.push(...C), g[l] = M, localStorage.setItem(j, JSON.stringify(g))
                    }
                }
                const c = document.createElement("div");
                c.textContent = `Sent ${e.subtype} for ${l} → Charts tab`, c.className = "fixed top-4 right-4 z-50 px-3 py-2 rounded bg-cyan-500/20 text-cyan-300 text-xs font-mono border border-cyan-500/40 shadow-lg", document.body.appendChild(c), setTimeout(() => {
                    c.remove()
                }, 2500), r && e.pairA && e.pairB ? nt(e.pairA.toUpperCase(), e.pairB.toUpperCase()) : at(l)
            } catch (r) {
                console.error("[CrossingScreener] Send failed", r)
            }
        }, []);
    return t.jsx("div", {
        className: "h-full overflow-y-auto",
        children: t.jsxs("div", {
            className: "p-3 text-xs font-mono space-y-3",
            children: [t.jsxs("div", {
                children: [t.jsx("h1", {
                    className: "text-base font-bold",
                    children: "Crossing Screener"
                }), t.jsx("p", {
                    className: "text-[10px] text-muted-foreground",
                    children: "Scans a ticker set for recent sign-flip crosses of detected S/R levels and/or diagonal trendlines. A cross counts when the close moves from one side of the level/line to the other between consecutive candles."
                })]
            }), t.jsxs("div", {
                className: "flex flex-wrap items-center gap-2",
                children: [t.jsx("span", {
                    className: "text-[10px] uppercase text-muted-foreground tracking-wider",
                    children: "Source"
                }), ["single", "pair", "pairCombo", "basket", "universe"].map(e => t.jsx("button", {
                    "data-testid": `cs-source-${e}`,
                    onClick: () => de(e),
                    className: `text-[11px] font-bold px-2 py-0.5 rounded border ${p===e?"bg-primary text-primary-foreground border-primary":"bg-background text-muted-foreground border-border hover:text-foreground"}`,
                    title: e === "pairCombo" ? "Generate all unordered A/B pair ratios from a classification-filter selection (A/B and B/A treated as same)" : void 0,
                    children: e === "single" ? "Single" : e === "pair" ? "Pair (A/B)" : e === "pairCombo" ? "Pair combo" : e === "basket" ? "Basket" : "Universe"
                }, e)), p === "single" && t.jsx("input", {
                    type: "text",
                    value: V,
                    onChange: e => ue(e.target.value.toUpperCase()),
                    placeholder: "Ticker (e.g. O)",
                    className: "text-[11px] bg-background border border-border rounded px-1.5 py-0.5 font-mono w-32",
                    "data-testid": "cs-single-ticker"
                }), p === "pair" && t.jsxs(t.Fragment, {
                    children: [t.jsx("input", {
                        type: "text",
                        value: J,
                        onChange: e => me(e.target.value.toUpperCase()),
                        placeholder: "A",
                        className: "text-[11px] bg-background border border-border rounded px-1.5 py-0.5 font-mono w-24",
                        "data-testid": "cs-pair-a"
                    }), t.jsx("span", {
                        className: "text-[11px] text-muted-foreground",
                        children: "/"
                    }), t.jsx("input", {
                        type: "text",
                        value: q,
                        onChange: e => xe(e.target.value.toUpperCase()),
                        placeholder: "B",
                        className: "text-[11px] bg-background border border-border rounded px-1.5 py-0.5 font-mono w-24",
                        "data-testid": "cs-pair-b"
                    })]
                }), p === "basket" && t.jsxs("select", {
                    value: D,
                    onChange: e => pe(e.target.value),
                    className: "text-[11px] bg-background border border-border rounded px-1.5 py-0.5",
                    "data-testid": "cs-basket-select",
                    children: [t.jsx("option", {
                        value: "",
                        children: "Pick basket…"
                    }), Ie.map(e => t.jsxs("option", {
                        value: e.id,
                        children: [e.name, " (", e.tickers.length, ")"]
                    }, e.id))]
                }), t.jsx("span", {
                    className: "ml-2 text-[10px] text-muted-foreground",
                    children: p === "pairCombo" ? `${S.length} leg${S.length===1?"":"s"} → ${m.length} pair${m.length===1?"":"s"} queued${te>m.length?` (capped from ${te})`:""}` : `${m.length} ticker${m.length===1?"":"s"} queued`
                }), p === "pairCombo" && m.length >= He && t.jsxs("span", {
                    className: "text-[10px] font-bold text-amber-400",
                    title: "Heads up: many pairs queued. Each pair fetches two Yahoo series and runs full S/R + trendline detection. Larger scans take longer.",
                    children: ["⚠ ", m.length, " pairs — this may take a while"]
                })]
            }), p === "universe" && t.jsx(ot, {
                filters: Z,
                onFiltersChange: G,
                search: W,
                onSearchChange: Ue,
                manualTickers: ze,
                onManualTickersChange: De,
                filteredCount: Ee,
                totalCount: Le,
                testIdPrefix: "cs-universe-filter"
            }), p === "pairCombo" && t.jsxs("div", {
                className: "space-y-1",
                children: [t.jsx(ft, {
                    workbookTickers: n,
                    filters: k,
                    onFiltersChange: he,
                    search: E,
                    onSearchChange: fe,
                    manualTickers: L,
                    onManualTickersChange: ge,
                    filteredCount: S.length,
                    totalCount: n.length,
                    testIdPrefix: "cs-paircombo-filter",
                    source: re,
                    onSourceChange: Oe
                }), t.jsxs("div", {
                    className: "text-[10px] text-muted-foreground",
                    children: [S.length < 2 ? t.jsx(t.Fragment, {
                        children: "Pick at least two legs to generate pairs. Each selection level intersects with the others."
                    }) : t.jsxs(t.Fragment, {
                        children: [S.length, " legs → ", t.jsx("span", {
                            className: "font-bold",
                            children: te
                        }), " unordered pairs (A/B == B/A)", " ", te > ee && t.jsxs("span", {
                            className: "text-amber-400 font-bold",
                            children: ["— capped at ", ee]
                        })]
                    }), S.length > 0 && S.length <= 24 && t.jsxs("span", {
                        className: "ml-2 text-muted-foreground/70",
                        children: ["[", S.join(", "), "]"]
                    })]
                })]
            }), t.jsxs("div", {
                className: "flex flex-wrap items-end gap-3 border border-border rounded p-2 bg-card/40",
                children: [t.jsxs("div", {
                    className: "flex flex-col",
                    children: [t.jsx("label", {
                        className: "text-[9px] uppercase text-muted-foreground tracking-wider",
                        children: "Date range"
                    }), t.jsx("select", {
                        value: se,
                        onChange: e => {
                            ke(e.target.value), ye($e(e.target.value))
                        },
                        className: "text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5",
                        "data-testid": "cs-date-preset",
                        children: it.map(e => t.jsx("option", {
                            value: e.value,
                            children: e.label
                        }, e.value))
                    })]
                }), t.jsxs("div", {
                    className: "flex flex-col",
                    children: [t.jsx("label", {
                        className: "text-[9px] uppercase text-muted-foreground tracking-wider",
                        children: "Timeframe"
                    }), t.jsxs("select", {
                        value: X,
                        onChange: e => ve(e.target.value),
                        className: "text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5",
                        "data-testid": "cs-timeframe",
                        children: [t.jsx("option", {
                            value: "daily",
                            children: "Daily"
                        }), t.jsx("option", {
                            value: "weekly",
                            children: "Weekly"
                        })]
                    })]
                }), t.jsxs("div", {
                    className: "flex flex-col",
                    children: [t.jsx("label", {
                        className: "text-[9px] uppercase text-muted-foreground tracking-wider",
                        title: "How many recent candles back to look for a cross. 1 = only the most recent candle vs the one before it. Larger = wider window, more results.",
                        children: "Lookback (candles)"
                    }), t.jsx("input", {
                        type: "number",
                        min: 1,
                        step: 1,
                        value: U,
                        onChange: e => {
                            const r = parseInt(e.target.value, 10);
                            Number.isFinite(r) && r >= 1 && Ae(r)
                        },
                        className: "text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5 w-20",
                        "data-testid": "cs-lookback"
                    })]
                }), t.jsxs("div", {
                    className: "flex flex-col",
                    children: [t.jsx("label", {
                        className: "text-[9px] uppercase text-muted-foreground tracking-wider",
                        children: "Top-N per ticker"
                    }), t.jsx("input", {
                        type: "number",
                        min: 1,
                        step: 1,
                        value: H,
                        onChange: e => {
                            const r = parseInt(e.target.value, 10);
                            Number.isFinite(r) && r >= 1 && we(r)
                        },
                        className: "text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5 w-20",
                        "data-testid": "cs-topn"
                    })]
                }), t.jsxs("div", {
                    className: "flex flex-col",
                    children: [t.jsx("label", {
                        className: "text-[9px] uppercase text-muted-foreground tracking-wider",
                        children: "Min score"
                    }), t.jsx("input", {
                        type: "number",
                        min: 0,
                        max: 1,
                        step: .05,
                        value: O,
                        onChange: e => {
                            const r = parseFloat(e.target.value);
                            Number.isFinite(r) && r >= 0 && r <= 1 && Te(r)
                        },
                        className: "text-[11px] bg-background border border-border rounded px-1.5 py-0.5 mt-0.5 w-20",
                        "data-testid": "cs-minscore"
                    })]
                }), t.jsxs("div", {
                    className: "flex flex-col gap-0.5",
                    children: [t.jsx("label", {
                        className: "text-[9px] uppercase text-muted-foreground tracking-wider",
                        title: "Which detector families to run. All four are on by default.",
                        children: "Detect"
                    }), t.jsxs("div", {
                        className: "flex items-center gap-2 flex-wrap",
                        children: [t.jsxs("label", {
                            className: "flex items-center gap-1 text-[11px]",
                            title: "Horizontal support / resistance pivots",
                            children: [t.jsx("input", {
                                type: "checkbox",
                                checked: R,
                                onChange: e => je(e.target.checked),
                                "data-testid": "cs-scan-horizontal"
                            }), "Horizontal"]
                        }), t.jsxs("label", {
                            className: "flex items-center gap-1 text-[11px]",
                            title: "Moving-average bounce levels (SMA / EMA / WMA / HMA / KAMA / FRAMA / T3 / ALMA / LSMA / SLSMA × 20/50/100/200)",
                            children: [t.jsx("input", {
                                type: "checkbox",
                                checked: $,
                                onChange: e => Ne(e.target.checked),
                                "data-testid": "cs-scan-ma"
                            }), "Moving averages"]
                        }), t.jsxs("label", {
                            className: "flex items-center gap-1 text-[11px]",
                            title: "Fibonacci retracement levels",
                            children: [t.jsx("input", {
                                type: "checkbox",
                                checked: B,
                                onChange: e => Se(e.target.checked),
                                "data-testid": "cs-scan-fib"
                            }), "Fibonacci"]
                        }), t.jsxs("label", {
                            className: "flex items-center gap-1 text-[11px]",
                            title: "Diagonal trendlines (pivot-pair, fractals, or RANSAC — configured on the Trendlines sub-tab)",
                            children: [t.jsx("input", {
                                type: "checkbox",
                                checked: w,
                                onChange: e => Ce(e.target.checked),
                                "data-testid": "cs-scan-trendlines"
                            }), "Diagonal trendlines"]
                        }), t.jsx("span", {
                            className: "text-[10px] text-muted-foreground ml-1",
                            "data-testid": "cs-detect-summary",
                            children: [R && "Horizontal", $ && "MA", B && "Fib", w && "Trendlines"].filter(Boolean).join(" · ") || t.jsx("span", {
                                className: "text-amber-400",
                                children: "none selected"
                            })
                        })]
                    })]
                }), t.jsx("div", {
                    className: "ml-auto flex items-center gap-2",
                    children: ne ? t.jsx("button", {
                        onClick: Ge,
                        className: "text-[11px] font-bold px-3 py-1 rounded bg-destructive text-destructive-foreground",
                        "data-testid": "cs-stop",
                        children: "Stop"
                    }) : t.jsx("button", {
                        onClick: Ke,
                        disabled: m.length === 0 || !Q && !w,
                        title: !Q && !w ? "Select at least one detector category" : void 0,
                        className: "text-[11px] font-bold px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50",
                        "data-testid": "cs-run",
                        children: "Run scan"
                    })
                })]
            }), ne && t.jsxs("div", {
                className: "text-[10px] text-muted-foreground",
                children: ["Scanning ", Re.current, " / ", Re.total, "…"]
            }), t.jsxs("div", {
                className: "border border-border rounded",
                children: [t.jsxs("div", {
                    className: "flex items-center justify-between px-2 py-1 bg-card/50 border-b border-border",
                    children: [t.jsxs("span", {
                        className: "text-[11px] font-bold",
                        children: ["Results: ", _.length, " cross", _.length === 1 ? "" : "es", z.length > 0 && t.jsxs("span", {
                            className: "ml-2 text-[10px] text-muted-foreground",
                            children: ["(", z.length, " skipped)"]
                        })]
                    }), t.jsx("span", {
                        className: "text-[10px] text-muted-foreground",
                        children: "Sorted by candles ago, then score"
                    })]
                }), _.length === 0 && !ne ? t.jsx("div", {
                    className: "p-3 text-[11px] text-muted-foreground",
                    children: "No results yet. Configure source, lookback, and what to scan, then click Run scan."
                }) : t.jsx("div", {
                    className: "overflow-x-auto",
                    children: t.jsxs("table", {
                        className: "w-full text-[11px]",
                        children: [t.jsx("thead", {
                            className: "bg-card/40 sticky top-0",
                            children: t.jsxs("tr", {
                                children: [t.jsx("th", {
                                    className: "text-left px-2 py-1 font-mono",
                                    children: "Ticker"
                                }), t.jsx("th", {
                                    className: "text-left px-2 py-1 font-mono",
                                    children: "Kind"
                                }), t.jsx("th", {
                                    className: "text-left px-2 py-1 font-mono",
                                    children: "Direction"
                                }), t.jsx("th", {
                                    className: "text-right px-2 py-1 font-mono",
                                    children: "Candles ago"
                                }), t.jsx("th", {
                                    className: "text-left px-2 py-1 font-mono",
                                    children: "Cross date"
                                }), t.jsx("th", {
                                    className: "text-right px-2 py-1 font-mono",
                                    children: "Close @ cross"
                                }), t.jsx("th", {
                                    className: "text-right px-2 py-1 font-mono",
                                    children: "Level @ cross"
                                }), t.jsx("th", {
                                    className: "text-right px-2 py-1 font-mono",
                                    children: "Current"
                                }), t.jsx("th", {
                                    className: "text-right px-2 py-1 font-mono",
                                    children: "Dist from level"
                                }), t.jsx("th", {
                                    className: "text-right px-2 py-1 font-mono",
                                    children: "Score"
                                }), t.jsx("th", {
                                    className: "px-2 py-1"
                                })]
                            })
                        }), t.jsx("tbody", {
                            children: _.map((e, r) => t.jsxs("tr", {
                                className: "border-t border-border hover:bg-card/40",
                                "data-testid": `cs-row-${e.ticker}-${r}`,
                                children: [t.jsx("td", {
                                    className: "px-2 py-1 font-bold",
                                    children: e.ticker
                                }), t.jsx("td", {
                                    className: "px-2 py-1",
                                    children: e.subtype
                                }), t.jsx("td", {
                                    className: "px-2 py-1",
                                    children: t.jsx("span", {
                                        className: e.direction === "up" ? "text-emerald-400 font-bold" : "text-rose-400 font-bold",
                                        title: e.direction === "up" ? "Close moved from below to above the level (broke up through resistance / reclaimed support)" : "Close moved from above to below the level (broke down through support / lost resistance)",
                                        children: e.direction === "up" ? "▲ up" : "▼ down"
                                    })
                                }), t.jsx("td", {
                                    className: "px-2 py-1 text-right",
                                    children: e.candlesAgo
                                }), t.jsx("td", {
                                    className: "px-2 py-1",
                                    children: e.crossDate
                                }), t.jsx("td", {
                                    className: "px-2 py-1 text-right",
                                    children: e.closeAtCross.toFixed(2)
                                }), t.jsx("td", {
                                    className: "px-2 py-1 text-right",
                                    children: e.levelValueAtCross.toFixed(2)
                                }), t.jsx("td", {
                                    className: "px-2 py-1 text-right",
                                    children: e.currentPrice.toFixed(2)
                                }), t.jsxs("td", {
                                    className: "px-2 py-1 text-right",
                                    children: [(e.distancePct * 100).toFixed(2), "%"]
                                }), t.jsx("td", {
                                    className: "px-2 py-1 text-right",
                                    children: e.score.toFixed(2)
                                }), t.jsx("td", {
                                    className: "px-2 py-1",
                                    children: t.jsx("button", {
                                        onClick: () => We(e),
                                        className: "text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30",
                                        "data-testid": `cs-send-${e.ticker}-${r}`,
                                        title: "Send this level/line to the Charts tab as an overlay",
                                        children: "→ Charts"
                                    })
                                })]
                            }, `${e.ticker}-${e.kind}-${r}`))
                        })]
                    })
                })]
            }), z.length > 0 && t.jsxs("details", {
                className: "text-[10px] text-muted-foreground",
                children: [t.jsxs("summary", {
                    className: "cursor-pointer",
                    children: ["Skipped tickers (", z.length, ")"]
                }), t.jsx("ul", {
                    className: "mt-1 pl-4 list-disc",
                    children: z.map((e, r) => t.jsxs("li", {
                        children: [e.ticker, ": ", e.reason]
                    }, r))
                })]
            })]
        })
    })
}

function Pt() {
    const [n, N] = o.useState("levels");
    return t.jsxs("div", {
        className: "flex flex-col h-full text-foreground bg-background",
        children: [t.jsxs("div", {
            className: "flex items-center gap-1 px-3 py-1.5 border-b border-border bg-card/30 flex-shrink-0",
            children: [t.jsx("span", {
                className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider mr-2",
                children: "Method"
            }), t.jsx("button", {
                "data-testid": "lt-subtab-levels",
                onClick: () => N("levels"),
                className: `text-[11px] font-mono font-bold px-3 py-1 rounded transition-colors ${n==="levels"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                title: "Horizontal pivot levels, moving-average bounces, and Fibonacci retracements.",
                children: "Horizontal / MA / Fib"
            }), t.jsx("button", {
                "data-testid": "lt-subtab-trendlines",
                onClick: () => N("trendlines"),
                className: `text-[11px] font-mono font-bold px-3 py-1 rounded transition-colors ${n==="trendlines"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                title: "Diagonal trendlines via pivot pairs, Williams fractals, or RANSAC.",
                children: "Diagonal Trendlines"
            }), t.jsx("button", {
                "data-testid": "lt-subtab-screener",
                onClick: () => N("screener"),
                className: `text-[11px] font-mono font-bold px-3 py-1 rounded transition-colors ${n==="screener"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                title: "Screen a universe or basket for tickers that just crossed S/R levels or trendlines.",
                children: "Crossing Screener"
            }), t.jsx("span", {
                className: "ml-auto text-[10px] font-mono text-muted-foreground",
                children: "Multi-select • Future projection • Send to Charts"
            })]
        }), t.jsxs("div", {
            className: "flex-1 overflow-hidden",
            children: [t.jsx("div", {
                className: n === "levels" ? "h-full" : "h-full hidden",
                "data-testid": "lt-pane-levels",
                children: t.jsx(pt, {})
            }), t.jsx("div", {
                className: n === "trendlines" ? "h-full" : "h-full hidden",
                "data-testid": "lt-pane-trendlines",
                children: t.jsx(xt, {})
            }), t.jsx("div", {
                className: n === "screener" ? "h-full" : "h-full hidden",
                "data-testid": "lt-pane-screener",
                children: t.jsx(yt, {})
            })]
        })]
    })
}
export {
    Pt as
    default
};