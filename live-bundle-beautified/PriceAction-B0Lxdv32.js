import {
    c as Ze,
    cC as bt,
    cD as Xe,
    a8 as Pe,
    a9 as Re,
    cE as jt,
    aj as Ye,
    cN as Se,
    dA as vt,
    b as be,
    a as yt,
    r as C,
    j as e,
    bs as kt,
    ar as L,
    o as Y,
    p as J,
    q as Q,
    t as ee,
    v as I,
    B as X,
    z as Ce,
    P as wt,
    E as Ft,
    A as Ct,
    N as Je,
    cF as Qe,
    dP as et,
    bB as me,
    bm as $t,
    bn as St,
    I as je,
    T as Mt,
    dQ as tt,
    a6 as _e,
    a7 as Dt,
    aa as We,
    ab as qe,
    ad as At,
    Z as zt,
    af as Pt,
    ae as Rt
} from "./index-CsG73Aq_.js";
import {
    B as Et
} from "./BasketTickerPill-DA9Wjwwc.js";
import {
    C as te,
    a as ae,
    b as ie,
    c as se
} from "./card-B6gjKVHw.js";
import {
    B as ue
} from "./badge-CQ2SEXX0.js";
import {
    A as Oe
} from "./arrow-up-down-CNMI3GZb.js";
import {
    P as It
} from "./play-D7mVvggU.js";
import {
    C as Bt
} from "./CartesianGrid-BQtjaw_K.js";
const Tt = Ze("User", [
    ["path", {
        d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",
        key: "975kel"
    }],
    ["circle", {
        cx: "12",
        cy: "7",
        r: "4",
        key: "17ys0d"
    }]
]);
const Ut = Ze("Users", [
    ["path", {
        d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
        key: "1yyitq"
    }],
    ["circle", {
        cx: "9",
        cy: "7",
        r: "4",
        key: "nufk8"
    }],
    ["path", {
        d: "M22 21v-2a4 4 0 0 0-3-3.87",
        key: "kshegd"
    }],
    ["path", {
        d: "M16 3.13a4 4 0 0 1 0 7.75",
        key: "1da9ce"
    }]
]);
var Vt = bt({
    chartName: "BarChart",
    GraphicalChild: Xe,
    defaultTooltipEventType: "axis",
    validateTooltipEventTypes: ["axis", "item"],
    axisComponents: [{
        axisType: "xAxis",
        AxisComp: Pe
    }, {
        axisType: "yAxis",
        AxisComp: Re
    }],
    formatAxisMap: jt
});

function st(t, n, c = "") {
    if (!t) return c;
    if (!Se(t)) return t;
    const o = vt(t);
    if (!o) return t;
    const u = n.find(p => p.id === o);
    return u && u.name ? u.name : "Basket"
}

function nt() {
    const {
        baskets: t
    } = Ye();
    return (n, c = "") => st(n, t, c)
}

function De(t, n) {
    return st(t, n, "ticker").replace(/[^A-Za-z0-9._-]+/g, "_")
}
const Ke = "reit-viz:chat:";

function le(t, n) {
    const c = o => n(o.detail);
    return window.addEventListener(Ke + t, c), () => window.removeEventListener(Ke + t, c)
}
const B = [1, 5, 20, 60];

function G(t) {
    if (!t.length) return NaN;
    let n = 0;
    for (const c of t) n += c;
    return n / t.length
}

function ye(t, n) {
    if (t.length < 2) return NaN;
    const c = n ?? G(t);
    let o = 0;
    for (const u of t) o += (u - c) * (u - c);
    return Math.sqrt(o / (t.length - 1))
}

function xe(t, n) {
    if (!t.length) return NaN;
    const c = (t.length - 1) * n,
        o = Math.floor(c),
        u = Math.ceil(c);
    return o === u ? t[o] : t[o] + (c - o) * (t[u] - t[o])
}

function Lt(t, n, c) {
    const o = n.length,
        u = new Array(o).fill(!1),
        p = new Array(o).fill(null);
    if (t.type === "sigma") {
        const d = new Array(o).fill(null);
        for (let r = 1; r < o; r++) {
            const x = n[r - 1],
                i = n[r];
            x != null && i != null && x > 0 && (d[r] = (i / x - 1) * 100)
        }
        if (t.sigmaBasis === "full") {
            const r = [];
            for (const g of d) g != null && Number.isFinite(g) && r.push(g);
            if (r.length < 30) return {
                mask: u,
                value: p
            };
            const x = G(r),
                i = ye(r, x);
            if (!Number.isFinite(i) || i <= 0) return {
                mask: u,
                value: p
            };
            for (let g = 1; g < o; g++) {
                const m = d[g];
                if (m == null) continue;
                const v = (m - x) / i,
                    a = Math.abs(v);
                let N = !1;
                t.sigmaDirection === "either" ? N = a >= t.sigma : t.sigmaDirection === "up" ? N = v >= t.sigma : N = v <= -t.sigma, N && (u[g] = !0, p[g] = m)
            }
        } else {
            const r = Math.max(10, Math.floor(t.sigmaWindow));
            for (let x = r + 1; x < o; x++) {
                const i = [];
                for (let R = x - r; R < x; R++) {
                    const f = d[R];
                    f != null && Number.isFinite(f) && i.push(f)
                }
                if (i.length < Math.floor(r * .6)) continue;
                const g = G(i),
                    m = ye(i, g);
                if (!Number.isFinite(m) || m <= 0) continue;
                const v = d[x];
                if (v == null) continue;
                const a = (v - g) / m,
                    N = Math.abs(a);
                let b = !1;
                t.sigmaDirection === "either" ? b = N >= t.sigma : t.sigmaDirection === "up" ? b = a >= t.sigma : b = a <= -t.sigma, b && (u[x] = !0, p[x] = v)
            }
        }
    } else if (t.type === "high52" || t.type === "low52")
        for (let r = 252; r < o; r++) {
            const x = n[r];
            if (x == null) continue;
            let i = t.type === "high52" ? -1 / 0 : 1 / 0,
                g = 0;
            for (let v = r - 252; v < r; v++) {
                const a = n[v];
                a != null && (g++, t.type === "high52" ? a > i && (i = a) : a < i && (i = a))
            }
            if (g < Math.floor(252 * .6)) continue;
            (t.type === "high52" ? x > i : x < i) && (u[r] = !0, p[r] = x)
        } else if (t.type === "gap")
            for (let d = 1; d < o; d++) {
                const r = n[d - 1],
                    x = c[d];
                if (r == null || x == null || r <= 0) continue;
                const i = (x / r - 1) * 100,
                    g = Math.abs(i);
                let m = !1;
                t.gapDirection === "either" ? m = g >= t.gapPct : t.gapDirection === "up" ? m = i >= t.gapPct : m = i <= -t.gapPct, m && (u[d] = !0, p[d] = i)
            }
    return {
        mask: u,
        value: p
    }
}

function Ae({
    close: t,
    open: n,
    dates: c,
    conditions: o,
    combinator: u
}) {
    const p = t.length,
        d = o.filter(Boolean);
    if (d.length === 0) return Wt();
    const r = d.map(f => Lt(f, t, n)),
        x = d.map(f => f.type === "sigma" ? f.sigmaBasis === "full" ? 30 : f.sigmaWindow + 2 : f.type === "high52" || f.type === "low52" ? 253 : f.type === "gap" ? 2 : 0),
        i = x.length ? Math.max(...x) : 0,
        g = [];
    for (let f = i; f < p; f++) {
        let F = u === "AND",
            y = null;
        for (let A = 0; A < r.length; A++) {
            const S = r[A].mask[f];
            if (u === "AND") {
                if (F = F && S, !F) break;
                y == null && (y = r[A].value[f])
            } else if (S) {
                F = !0, y = r[A].value[f];
                break
            }
        }
        F && y != null && g.push({
            idx: f,
            val: y
        })
    }
    const m = [],
        v = {
            1: [],
            5: [],
            20: [],
            60: []
        };
    for (const f of g) {
        const F = t[f.idx];
        if (F == null || F <= 0) continue;
        const y = {};
        for (const A of B) {
            const S = f.idx + A;
            if (S < p) {
                const W = t[S];
                if (W != null) {
                    const D = (W / F - 1) * 100;
                    y[A] = D, v[A].push(D);
                    continue
                }
            }
            y[A] = null
        }
        m.push({
            dateIdx: f.idx,
            date: c[f.idx] ?? "",
            triggerValue: f.val,
            fwd: y
        })
    }
    const a = B.map(f => at(v[f], f)),
        N = B[B.length - 1],
        b = [];
    for (let f = 0; f <= N; f++) {
        let F = 0,
            y = 0;
        for (const A of m) {
            const S = t[A.dateIdx],
                W = A.dateIdx + f;
            if (S == null || S <= 0 || W >= p) continue;
            const D = t[W];
            D != null && (F += (D / S - 1) * 100, y++)
        }
        b.push({
            day: f,
            cumret: y > 0 ? F / y : 0,
            n: y
        })
    }
    const R = _t(t);
    return {
        events: m,
        stats: a,
        distribution: v,
        avgPath: b,
        baseline: R
    }
}

function at(t, n) {
    if (!t.length) return {
        horizon: n,
        count: 0,
        mean: NaN,
        median: NaN,
        std: NaN,
        pUp: NaN,
        winLoss: NaN,
        min: NaN,
        max: NaN,
        p25: NaN,
        p75: NaN
    };
    const c = t.slice().sort((r, x) => r - x),
        o = t.filter(r => r > 0),
        u = t.filter(r => r < 0),
        p = o.length ? G(o) : 0,
        d = u.length ? G(u) : 0;
    return {
        horizon: n,
        count: t.length,
        mean: G(t),
        median: xe(c, .5),
        std: ye(t),
        pUp: o.length / t.length,
        winLoss: d !== 0 ? Math.abs(p / d) : NaN,
        min: c[0],
        max: c[c.length - 1],
        p25: xe(c, .25),
        p75: xe(c, .75)
    }
}

function _t(t) {
    const n = t.length;
    return B.map(c => {
        const o = [];
        for (let u = 0; u + c < n; u++) {
            const p = t[u],
                d = t[u + c];
            p != null && d != null && p > 0 && o.push((d / p - 1) * 100)
        }
        return at(o, c)
    })
}

function Wt() {
    const t = {
        horizon: 1,
        count: 0,
        mean: NaN,
        median: NaN,
        std: NaN,
        pUp: NaN,
        winLoss: NaN,
        min: NaN,
        max: NaN,
        p25: NaN,
        p75: NaN
    };
    return {
        events: [],
        stats: B.map(n => ({
            ...t,
            horizon: n
        })),
        distribution: {
            1: [],
            5: [],
            20: [],
            60: []
        },
        avgPath: [],
        baseline: B.map(n => ({
            ...t,
            horizon: n
        }))
    }
}

function qt(t, n, c) {
    const o = [];
    for (let d = n - c; d < n; d++) {
        if (d < 0) continue;
        const r = t[d];
        r != null && Number.isFinite(r) && o.push(r)
    }
    if (o.length < Math.max(10, Math.floor(c * .6))) return {
        mu: NaN,
        sigma: NaN,
        n: o.length
    };
    const u = G(o),
        p = ye(o, u);
    return {
        mu: u,
        sigma: p,
        n: o.length
    }
}

function ve(t, n, c, o, u = "rolling") {
    const p = t.length;
    if (n < 1 || n >= p) return null;
    const d = new Array(p).fill(null);
    for (let F = 1; F < p; F++) {
        const y = t[F - 1],
            A = t[F];
        y != null && A != null && y > 0 && (d[F] = (A / y - 1) * 100)
    }
    let r, x;
    if (u === "full") {
        const F = d.filter(y => y != null && Number.isFinite(y));
        if (F.length < 30) return null;
        r = G(F), x = ye(F, r)
    } else {
        const F = qt(d, n, o);
        r = F.mu, x = F.sigma
    }
    if (!Number.isFinite(x) || x <= 0) return null;
    const i = (c - r) / x,
        g = Math.abs(c),
        m = d.filter(F => F != null && Number.isFinite(F));
    if (m.length < 30) return null;
    const v = m.length;
    let a = 0,
        N = 0;
    for (const F of m) Math.abs(F) >= g && a++, F <= c && N++;
    const b = 1 - a / v,
        R = N / v,
        f = a > 0 ? v / a : v;
    return {
        pct: c,
        window: o,
        mu: r,
        sigma: x,
        z: i,
        absZ: Math.abs(i),
        percentileAbs: b,
        percentileSigned: R,
        countAtLeastAbs: a,
        totalDays: v,
        oneInNDays: f
    }
}

function K(t, n, c) {
    const o = t?.[n];
    if (!o) return [];
    if (Array.isArray(o) && o.length && Array.isArray(o[0])) {
        const u = new Array(c).fill(null);
        for (const p of o) {
            const [d, r] = p;
            typeof d == "number" && d >= 0 && d < c && (u[d] = typeof r == "number" ? r : null)
        }
        return u
    }
    return Array.isArray(o) ? o.slice(0, c) : []
}

function Ot(t, n = 24) {
    if (!t.length) return [];
    const c = t.slice().sort((x, i) => x - i),
        o = xe(c, .01),
        u = xe(c, .99),
        p = u - o;
    if (p <= 0) return [];
    const d = p / n,
        r = [];
    for (let x = 0; x < n; x++) {
        const i = o + x * d;
        r.push({
            bucket: `${i.toFixed(1)}`,
            lo: i,
            hi: i + d,
            count: 0
        })
    }
    for (const x of t) {
        if (x < o || x > u) continue;
        let i = Math.floor((x - o) / d);
        i >= n && (i = n - 1), i < 0 && (i = 0), r[i].count++
    }
    return r
}

function V(t, n = 2) {
    return t == null || !Number.isFinite(t) ? "—" : `${t>0?"+":""}${t.toFixed(n)}%`
}

function Me(t, n = 2) {
    return t == null || !Number.isFinite(t) ? "—" : t.toFixed(n)
}

function ze(t = "sigma") {
    return {
        id: Math.random().toString(36).slice(2, 10),
        type: t,
        sigma: 2,
        sigmaWindow: 60,
        sigmaDirection: "either",
        sigmaBasis: "rolling",
        gapPct: 2,
        gapDirection: "either"
    }
}

function Kt(t) {
    if (t.type === "sigma") {
        const n = t.sigmaDirection === "either" ? "±" : t.sigmaDirection === "up" ? "+" : "−",
            c = t.sigmaBasis === "full" ? "full hist" : `${t.sigmaWindow}d`;
        return `${n}${t.sigma}σ 1d (${c})`
    }
    return t.type === "high52" ? "New 52w high" : t.type === "low52" ? "New 52w low" : t.type === "gap" ? `${t.gapDirection==="either"?"±":t.gapDirection==="up"?"+":"−"}${t.gapPct}% gap` : ""
}

function Ht({
    cond: t,
    onChange: n,
    onRemove: c,
    canRemove: o
}) {
    const u = (p, d) => n({
        ...t,
        [p]: d
    });
    return e.jsxs("div", {
        className: "flex flex-wrap items-end gap-2 p-2 bg-muted/40 rounded border border-border",
        children: [e.jsxs("div", {
            className: "flex flex-col gap-1 min-w-[150px]",
            children: [e.jsx(L, {
                className: "text-xs text-muted-foreground",
                children: "Type"
            }), e.jsxs(Y, {
                value: t.type,
                onValueChange: p => u("type", p),
                children: [e.jsx(J, {
                    className: "h-8",
                    children: e.jsx(Q, {})
                }), e.jsxs(ee, {
                    children: [e.jsx(I, {
                        value: "sigma",
                        children: "N-σ daily move"
                    }), e.jsx(I, {
                        value: "high52",
                        children: "New 52-week high"
                    }), e.jsx(I, {
                        value: "low52",
                        children: "New 52-week low"
                    }), e.jsx(I, {
                        value: "gap",
                        children: "Opening gap"
                    })]
                })]
            })]
        }), t.type === "sigma" && e.jsxs(e.Fragment, {
            children: [e.jsxs("div", {
                className: "flex flex-col gap-1 w-[90px]",
                children: [e.jsx(L, {
                    className: "text-xs text-muted-foreground",
                    children: "σ threshold"
                }), e.jsx(je, {
                    type: "number",
                    step: "0.1",
                    min: "0.5",
                    value: t.sigma,
                    onChange: p => u("sigma", parseFloat(p.target.value) || 2),
                    className: "h-8"
                })]
            }), e.jsxs("div", {
                className: "flex flex-col gap-1 w-[150px]",
                children: [e.jsx(L, {
                    className: "text-xs text-muted-foreground",
                    children: "μ/σ basis"
                }), e.jsxs(Y, {
                    value: t.sigmaBasis,
                    onValueChange: p => u("sigmaBasis", p),
                    children: [e.jsx(J, {
                        className: "h-8",
                        "data-testid": "select-sigma-basis",
                        children: e.jsx(Q, {})
                    }), e.jsxs(ee, {
                        children: [e.jsx(I, {
                            value: "rolling",
                            children: "Rolling window"
                        }), e.jsx(I, {
                            value: "full",
                            children: "Full history"
                        })]
                    })]
                })]
            }), t.sigmaBasis === "rolling" && e.jsxs("div", {
                className: "flex flex-col gap-1 w-[110px]",
                children: [e.jsx(L, {
                    className: "text-xs text-muted-foreground",
                    children: "Window (d)"
                }), e.jsx(je, {
                    type: "number",
                    step: "10",
                    min: "20",
                    value: t.sigmaWindow,
                    onChange: p => u("sigmaWindow", parseInt(p.target.value) || 60),
                    className: "h-8"
                })]
            }), e.jsxs("div", {
                className: "flex flex-col gap-1 w-[130px]",
                children: [e.jsx(L, {
                    className: "text-xs text-muted-foreground",
                    children: "Direction"
                }), e.jsxs(Y, {
                    value: t.sigmaDirection,
                    onValueChange: p => u("sigmaDirection", p),
                    children: [e.jsx(J, {
                        className: "h-8",
                        children: e.jsx(Q, {})
                    }), e.jsxs(ee, {
                        children: [e.jsx(I, {
                            value: "either",
                            children: "Either ±σ"
                        }), e.jsx(I, {
                            value: "up",
                            children: "Up (+σ)"
                        }), e.jsx(I, {
                            value: "down",
                            children: "Down (−σ)"
                        })]
                    })]
                })]
            })]
        }), t.type === "gap" && e.jsxs(e.Fragment, {
            children: [e.jsxs("div", {
                className: "flex flex-col gap-1 w-[90px]",
                children: [e.jsx(L, {
                    className: "text-xs text-muted-foreground",
                    children: "|Gap| ≥ %"
                }), e.jsx(je, {
                    type: "number",
                    step: "0.5",
                    min: "0.1",
                    value: t.gapPct,
                    onChange: p => u("gapPct", parseFloat(p.target.value) || 2),
                    className: "h-8"
                })]
            }), e.jsxs("div", {
                className: "flex flex-col gap-1 w-[130px]",
                children: [e.jsx(L, {
                    className: "text-xs text-muted-foreground",
                    children: "Direction"
                }), e.jsxs(Y, {
                    value: t.gapDirection,
                    onValueChange: p => u("gapDirection", p),
                    children: [e.jsx(J, {
                        className: "h-8",
                        children: e.jsx(Q, {})
                    }), e.jsxs(ee, {
                        children: [e.jsx(I, {
                            value: "either",
                            children: "Either"
                        }), e.jsx(I, {
                            value: "up",
                            children: "Gap up"
                        }), e.jsx(I, {
                            value: "down",
                            children: "Gap down"
                        })]
                    })]
                })]
            })]
        }), e.jsx(X, {
            variant: "ghost",
            size: "sm",
            onClick: c,
            disabled: !o,
            className: "h-8 px-2 text-muted-foreground hover:text-destructive",
            "data-testid": "button-remove-condition",
            children: e.jsx(Mt, {
                className: "w-3.5 h-3.5"
            })
        })]
    })
}

function as() {
    const {
        data: t = []
    } = be({
        queryKey: ["/api/tickers"],
        queryFn: async () => Pt()
    }), {
        data: n = []
    } = be({
        queryKey: ["/api/dates"],
        queryFn: async () => Rt()
    }), {
        universeTickers: c,
        isFiltered: o,
        filteredCount: u,
        totalCount: p
    } = yt(), d = C.useMemo(() => c ? t.filter(s => c.has(s.ticker)) : t, [t, c]), [r, x] = C.useState("single"), {
        baskets: i
    } = Ye(), g = nt(), [m, v] = C.useState("");
    C.useEffect(() => {
        !m && d.length && v(d[0].ticker), m && d.length && !d.find(s => s.ticker === m) && v(d[0].ticker)
    }, [d, m]);
    const [a, N] = C.useState("");
    C.useEffect(() => {
        !a && d.length >= 2 && N(d[1].ticker), a && d.length && !d.find(s => s.ticker === a) && N(d.find(s => s.ticker !== m)?.ticker ?? "")
    }, [d, a, m]);
    const [b, R] = C.useState([ze("sigma")]), [f, F] = C.useState("AND"), [y, A] = C.useState(20), [S, W] = C.useState("edge"), [D, H] = C.useState("desc"), [h, re] = C.useState(null), [_, ne] = C.useState(null), [Z, U] = C.useState(null), [he, Ie] = C.useState(!1), [rt, lt] = C.useState(null), [Be, Te] = C.useState(!1), {
        data: ke,
        isFetching: ot
    } = be({
        queryKey: ["ticker-raw-pa", h?.symbol, h?.nonce],
        queryFn: async () => !h || h.mode !== "single" ? null : me(h.symbol),
        enabled: !!h && h.mode === "single"
    }), oe = C.useMemo(() => {
        if (!h || h.mode !== "single" || !ke || !n.length) return null;
        const s = K(ke, "close", n.length),
            l = K(ke, "open", n.length);
        return s.length ? Ae({
            close: s,
            open: l,
            dates: n,
            conditions: h.conditions,
            combinator: h.combinator
        }) : null
    }, [h, ke, n]), {
        data: de,
        isFetching: ct
    } = be({
        queryKey: ["ticker-raw-pairs", h?.symbol, h?.symbolB, h?.nonce],
        queryFn: async () => {
            if (!h || h.mode !== "pairs" || !h.symbolB) return null;
            const [s, l] = await Promise.all([me(h.symbol), me(h.symbolB)]);
            return {
                a: s,
                b: l
            }
        },
        enabled: !!h && h.mode === "pairs" && !!h.symbolB
    }), ce = C.useMemo(() => {
        if (!h || h.mode !== "pairs" || !de || !n.length) return null;
        const s = K(de.a, "close", n.length),
            l = K(de.b, "close", n.length),
            j = K(de.a, "open", n.length),
            k = K(de.b, "open", n.length);
        if (!s.length || !l.length) return null;
        const M = Math.min(s.length, l.length),
            T = new Array(M),
            $ = new Array(M);
        for (let w = 0; w < M; w++) {
            const E = s[w],
                z = l[w];
            T[w] = E != null && z != null && z > 0 ? E / z : null;
            const O = j[w],
                P = k[w];
            $[w] = O != null && P != null && P > 0 ? O / P : null
        }
        return Ae({
            close: T,
            open: $,
            dates: n,
            conditions: h.conditions,
            combinator: h.combinator
        })
    }, [h, de, n]), dt = C.useCallback(async s => {
        Ie(!0), U(null), ne({
            done: 0,
            total: s.tickers.length
        });
        const l = [],
            j = 8;
        let k = 0;
        async function M() {
            for (; k < s.tickers.length;) {
                const T = k++,
                    $ = s.tickers[T];
                try {
                    const w = await me($.ticker),
                        E = K(w, "close", n.length),
                        z = K(w, "open", n.length);
                    if (!E.length) {
                        ne(P => P ? {
                            ...P,
                            done: P.done + 1
                        } : null);
                        continue
                    }
                    const O = Ae({
                        close: E,
                        open: z,
                        dates: n,
                        conditions: s.conditions,
                        combinator: s.combinator
                    });
                    l.push({
                        ticker: $.ticker,
                        name: $.name,
                        events: O.events.length,
                        stats: O.stats,
                        baseline: O.baseline,
                        eventRows: O.events
                    })
                } catch {} finally {
                    ne(w => w ? {
                        ...w,
                        done: w.done + 1
                    } : null)
                }
            }
        }
        await Promise.all(Array.from({
            length: j
        }, () => M())), U(l), Ie(!1)
    }, [n]), we = () => {
        if (r === "single" && !m || r === "pairs" && (!m || !a || m === a)) return;
        const s = {
            mode: r,
            symbol: m,
            symbolB: r === "pairs" ? a : void 0,
            tickers: d.map(l => ({
                ticker: l.ticker,
                name: l.name
            })),
            conditions: b.map(l => ({
                ...l
            })),
            combinator: f,
            nonce: Date.now()
        };
        re(s), r === "cross" ? dt({
            tickers: s.tickers,
            conditions: s.conditions,
            combinator: s.combinator
        }) : (U(null), ne(null))
    }, Ue = C.useRef(we);
    C.useEffect(() => {
        Ue.current = we
    }, [we]), C.useEffect(() => {
        const s = [];
        return s.push(le("price-action:set-mode", ({
            mode: l
        }) => {
            x(l)
        })), s.push(le("price-action:set-ticker", ({
            ticker: l
        }) => {
            l && v(l.toUpperCase())
        })), s.push(le("price-action:set-ticker-b", ({
            ticker: l
        }) => {
            l && N(l.toUpperCase())
        })), s.push(le("price-action:clear-conditions", () => {
            R([])
        })), s.push(le("price-action:add-condition", l => {
            R(j => {
                const k = ze("sigma");
                return l.type === "sigma" ? [...j, {
                    ...k,
                    type: "sigma",
                    sigma: Number(l.k ?? 2),
                    sigmaDirection: l.direction ?? "either",
                    sigmaWindow: Number(l.window ?? 60),
                    sigmaBasis: l.basis ?? "rolling"
                }] : l.type === "gap" ? [...j, {
                    ...k,
                    type: "gap",
                    gapPct: Number(l.pct ?? 2),
                    gapDirection: l.direction ?? "either"
                }] : l.type === "high52" || l.type === "low52" ? [...j, {
                    ...k,
                    type: l.type
                }] : j
            })
        })), s.push(le("price-action:set-combinator", ({
            combinator: l
        }) => F(l))), s.push(le("price-action:run", () => {
            setTimeout(() => Ue.current(), 50)
        })), s.push(le("price-action:show-on-chart", () => {
            document.querySelector('[data-testid="button-show-on-chart"]')?.click()
        })), () => {
            s.forEach(l => l())
        }
    }, []);
    const pe = C.useMemo(() => h ? h.conditions.map(Kt).join(h.combinator === "AND" ? " AND " : " OR ") : "", [h]),
        mt = () => {
            if (!oe || !h) return;
            const s = ["Date,TriggerValue," + B.map(l => `Fwd_${l}d_%`).join(","), ...oe.events.map(l => [l.date, l.triggerValue.toFixed(4), ...B.map(j => {
                const k = l.fwd[j];
                return k == null ? "" : k.toFixed(4)
            })].join(","))];
            $e(`${De(h.symbol,i)}_event_study.csv`, s.join(`
`))
        },
        ut = () => {
            if (!ce || !h || !h.symbolB) return;
            const s = ["Date,RatioTriggerValue," + B.map(l => `Fwd_${l}d_%`).join(","), ...ce.events.map(l => [l.date, l.triggerValue.toFixed(4), ...B.map(j => {
                const k = l.fwd[j];
                return k == null ? "" : k.toFixed(4)
            })].join(","))];
            $e(`${De(h.symbol,i)}_over_${De(h.symbolB,i)}_event_study.csv`, s.join(`
`))
        },
        xt = () => {
            if (!Z || !h) return;
            const l = [
                ["Ticker", "Name", "Events", ...B.flatMap(j => [`Mean_${j}d`, `Pup_${j}d`, `Edge_${j}d_pp`])].join(",")
            ];
            for (const j of Z) {
                const k = [j.ticker, `"${j.name.replace(/"/g,'""')}"`, String(j.events), ...B.flatMap(M => {
                    const T = j.stats.find(E => E.horizon === M),
                        $ = j.baseline.find(E => E.horizon === M),
                        w = Number.isFinite(T.mean) && Number.isFinite($.mean) ? T.mean - $.mean : NaN;
                    return [Number.isFinite(T.mean) ? T.mean.toFixed(4) : "", Number.isFinite(T.pUp) ? T.pUp.toFixed(4) : "", Number.isFinite(w) ? w.toFixed(4) : ""]
                })];
                l.push(k.join(","))
            }
            $e("cross_sectional_event_study.csv", l.join(`
`))
        },
        ht = () => {
            if (!Z || !h) return;
            const l = [
                ["Ticker", "Name", "Date", "TriggerValue", ...B.map(j => `Fwd_${j}d_%`)].join(",")
            ];
            for (const j of Z)
                for (const k of j.eventRows) l.push([j.ticker, `"${j.name.replace(/"/g,'""')}"`, k.date, Number.isFinite(k.triggerValue) ? k.triggerValue.toFixed(4) : "", ...B.map(M => k.fwd[M] != null ? k.fwd[M].toFixed(4) : "")].join(","));
            $e("cross_sectional_all_events.csv", l.join(`
`))
        },
        pt = !!h && h.mode === "single" && (ot || !oe),
        ft = !!h && h.mode === "pairs" && (ct || !ce),
        q = C.useMemo(() => {
            if (!Z) return null;
            const s = Z.slice();
            return s.sort((l, j) => {
                const k = l.stats.find(z => z.horizon === y),
                    M = j.stats.find(z => z.horizon === y),
                    T = l.baseline.find(z => z.horizon === y),
                    $ = j.baseline.find(z => z.horizon === y);
                let w, E;
                switch (S) {
                    case "ticker":
                        return (D === "asc" ? 1 : -1) * l.ticker.localeCompare(j.ticker);
                    case "events":
                        w = l.events, E = j.events;
                        break;
                    case "mean":
                        w = Number.isFinite(k.mean) ? k.mean : -1 / 0, E = Number.isFinite(M.mean) ? M.mean : -1 / 0;
                        break;
                    case "pUp":
                        w = Number.isFinite(k.pUp) ? k.pUp : -1 / 0, E = Number.isFinite(M.pUp) ? M.pUp : -1 / 0;
                        break;
                    case "edge": {
                        const z = Number.isFinite(k.mean) && Number.isFinite(T.mean) ? k.mean - T.mean : -1 / 0,
                            O = Number.isFinite(M.mean) && Number.isFinite($.mean) ? M.mean - $.mean : -1 / 0;
                        w = z, E = O;
                        break
                    }
                }
                return w < E ? D === "asc" ? -1 : 1 : w > E ? D === "asc" ? 1 : -1 : 0
            }), s
        }, [Z, S, D, y]),
        fe = s => {
            S === s ? H(D === "asc" ? "desc" : "asc") : (W(s), H(s === "ticker" ? "asc" : "desc"))
        },
        ge = s => S !== s ? e.jsx(Oe, {
            className: "w-3 h-3 inline ml-0.5 opacity-40"
        }) : D === "asc" ? e.jsx($t, {
            className: "w-3 h-3 inline ml-0.5"
        }) : e.jsx(St, {
            className: "w-3 h-3 inline ml-0.5"
        }),
        Ve = C.useMemo(() => {
            if (!q) return null;
            const s = q.filter(l => l.events > 0);
            return s.length ? B.map(l => {
                const j = s.map($ => $.stats.find(w => w.horizon === l)?.mean).filter($ => Number.isFinite($)),
                    k = s.map($ => $.stats.find(w => w.horizon === l)?.pUp).filter($ => Number.isFinite($)),
                    M = s.map($ => {
                        const w = $.stats.find(z => z.horizon === l),
                            E = $.baseline.find(z => z.horizon === l);
                        return w && E && Number.isFinite(w.mean) && Number.isFinite(E.mean) ? w.mean - E.mean : NaN
                    }).filter($ => Number.isFinite($)),
                    T = M.filter($ => $ > 0).length;
                return {
                    horizon: l,
                    nTickers: s.length,
                    avgMean: j.length ? G(j) : NaN,
                    medMean: j.length ? xe(j.slice().sort(($, w) => $ - w), .5) : NaN,
                    avgPup: k.length ? G(k) : NaN,
                    avgEdge: M.length ? G(M) : NaN,
                    posEdgeFraction: M.length ? T / M.length : NaN
                }
            }) : null
        }, [q]),
        gt = C.useMemo(() => q ? q.reduce((s, l) => s + l.events, 0) : 0, [q]);
    return e.jsxs("div", {
        className: "flex flex-col gap-3 p-3 h-full overflow-auto",
        children: [e.jsxs(te, {
            children: [e.jsx(ae, {
                className: "pb-2",
                children: e.jsxs(ie, {
                    className: "flex items-center gap-2 text-sm font-semibold",
                    children: [e.jsx(kt, {
                        className: "w-4 h-4 text-primary"
                    }), "Price Action — Event Study"]
                })
            }), e.jsxs(se, {
                className: "pt-0 flex flex-col gap-3",
                children: [e.jsxs("div", {
                    className: "flex flex-wrap items-end gap-3",
                    children: [e.jsxs("div", {
                        className: "flex flex-col gap-1",
                        children: [e.jsx(L, {
                            className: "text-xs text-muted-foreground",
                            children: "Mode"
                        }), e.jsxs("div", {
                            className: "inline-flex rounded border border-border overflow-hidden h-8",
                            children: [e.jsxs("button", {
                                onClick: () => x("single"),
                                "data-testid": "button-mode-single",
                                className: `px-3 text-xs flex items-center gap-1.5 ${r==="single"?"bg-primary text-primary-foreground":"bg-card hover:bg-muted"}`,
                                children: [e.jsx(Tt, {
                                    className: "w-3.5 h-3.5"
                                }), "Single"]
                            }), e.jsxs("button", {
                                onClick: () => x("cross"),
                                "data-testid": "button-mode-cross",
                                className: `px-3 text-xs flex items-center gap-1.5 border-l border-border ${r==="cross"?"bg-primary text-primary-foreground":"bg-card hover:bg-muted"}`,
                                children: [e.jsx(Ut, {
                                    className: "w-3.5 h-3.5"
                                }), "Cross-section"]
                            }), e.jsxs("button", {
                                onClick: () => x("pairs"),
                                "data-testid": "button-mode-pairs",
                                className: `px-3 text-xs flex items-center gap-1.5 border-l border-border ${r==="pairs"?"bg-primary text-primary-foreground":"bg-card hover:bg-muted"}`,
                                children: [e.jsx(Oe, {
                                    className: "w-3.5 h-3.5"
                                }), "Pairs"]
                            })]
                        })]
                    }), r === "single" && e.jsxs(e.Fragment, {
                        children: [e.jsxs("div", {
                            className: `flex flex-col gap-1 min-w-[280px] ${Se(m)?"opacity-40 pointer-events-none":""}`,
                            children: [e.jsx(L, {
                                className: "text-xs text-muted-foreground",
                                children: "Ticker"
                            }), e.jsxs(Y, {
                                value: Se(m) ? "" : m,
                                onValueChange: v,
                                children: [e.jsx(J, {
                                    "data-testid": "select-ticker",
                                    className: "h-8",
                                    children: e.jsx(Q, {
                                        placeholder: "Pick ticker"
                                    })
                                }), e.jsx(ee, {
                                    className: "max-h-80",
                                    children: d.map(s => e.jsxs(I, {
                                        value: s.ticker,
                                        children: [s.ticker, " — ", s.name]
                                    }, s.ticker))
                                })]
                            })]
                        }), e.jsxs("div", {
                            className: "flex flex-col gap-1",
                            children: [e.jsx(L, {
                                className: "text-xs text-muted-foreground",
                                children: "Basket"
                            }), e.jsx(Et, {
                                activeTicker: m,
                                onSelectTicker: v,
                                fallbackTicker: d[0]?.ticker ?? null
                            })]
                        })]
                    }), r === "pairs" && e.jsxs(e.Fragment, {
                        children: [e.jsxs("div", {
                            className: "flex flex-col gap-1 min-w-[240px]",
                            children: [e.jsx(L, {
                                className: "text-xs text-muted-foreground",
                                children: "Ticker A (long)"
                            }), e.jsxs(Y, {
                                value: m,
                                onValueChange: v,
                                children: [e.jsx(J, {
                                    "data-testid": "select-ticker-a",
                                    className: "h-8",
                                    children: e.jsx(Q, {
                                        placeholder: "Pick A"
                                    })
                                }), e.jsx(ee, {
                                    className: "max-h-80",
                                    children: d.map(s => e.jsxs(I, {
                                        value: s.ticker,
                                        children: [s.ticker, " — ", s.name]
                                    }, s.ticker))
                                })]
                            })]
                        }), e.jsxs("div", {
                            className: "flex flex-col gap-1 min-w-[240px]",
                            children: [e.jsx(L, {
                                className: "text-xs text-muted-foreground",
                                children: "Ticker B (short)"
                            }), e.jsxs(Y, {
                                value: a,
                                onValueChange: N,
                                children: [e.jsx(J, {
                                    "data-testid": "select-ticker-b",
                                    className: "h-8",
                                    children: e.jsx(Q, {
                                        placeholder: "Pick B"
                                    })
                                }), e.jsx(ee, {
                                    className: "max-h-80",
                                    children: d.filter(s => s.ticker !== m).map(s => e.jsxs(I, {
                                        value: s.ticker,
                                        children: [s.ticker, " — ", s.name]
                                    }, s.ticker))
                                })]
                            })]
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-1",
                        children: [e.jsx(L, {
                            className: "text-xs text-muted-foreground",
                            children: "Universe"
                        }), e.jsx("div", {
                            className: "h-8 px-2 flex items-center gap-1.5 rounded border border-border bg-card text-xs",
                            children: o ? e.jsxs(e.Fragment, {
                                children: [e.jsx(ue, {
                                    variant: "secondary",
                                    className: "text-[10px]",
                                    children: "filtered"
                                }), e.jsxs("span", {
                                    children: [u, " / ", p]
                                })]
                            }) : e.jsxs("span", {
                                className: "text-muted-foreground",
                                children: ["All ", p, " tickers"]
                            })
                        })]
                    }), e.jsxs("div", {
                        className: "flex gap-2 ml-auto",
                        children: [e.jsxs(X, {
                            onClick: we,
                            disabled: r === "single" && !m || r === "pairs" && (!m || !a || m === a) || he || r === "cross" && d.length === 0,
                            "data-testid": "button-run-study",
                            className: "h-8",
                            children: [e.jsx(It, {
                                className: "w-3.5 h-3.5 mr-1.5"
                            }), r === "cross" ? `Run on ${d.length}` : r === "pairs" ? "Run pair study" : "Run study"]
                        }), h?.mode === "single" && oe && oe.events.length > 0 && e.jsxs(X, {
                            variant: "outline",
                            onClick: mt,
                            "data-testid": "button-download-csv",
                            className: "h-8",
                            children: [e.jsx(Ce, {
                                className: "w-3.5 h-3.5 mr-1.5"
                            }), "CSV"]
                        }), h?.mode === "pairs" && ce && ce.events.length > 0 && e.jsxs(X, {
                            variant: "outline",
                            onClick: ut,
                            "data-testid": "button-download-pairs-csv",
                            className: "h-8",
                            children: [e.jsx(Ce, {
                                className: "w-3.5 h-3.5 mr-1.5"
                            }), "CSV"]
                        }), h?.mode === "cross" && q && !he && e.jsxs(e.Fragment, {
                            children: [e.jsxs(X, {
                                variant: "outline",
                                onClick: xt,
                                "data-testid": "button-download-cross-csv",
                                className: "h-8",
                                children: [e.jsx(Ce, {
                                    className: "w-3.5 h-3.5 mr-1.5"
                                }), "Summary"]
                            }), e.jsxs(X, {
                                variant: "outline",
                                onClick: ht,
                                "data-testid": "button-download-cross-events-csv",
                                className: "h-8",
                                children: [e.jsx(Ce, {
                                    className: "w-3.5 h-3.5 mr-1.5"
                                }), "All events"]
                            })]
                        })]
                    })]
                }), e.jsxs("div", {
                    className: "flex flex-col gap-2",
                    children: [e.jsxs("div", {
                        className: "flex items-center gap-2",
                        children: [e.jsx(L, {
                            className: "text-xs text-muted-foreground",
                            children: "Conditions"
                        }), b.length > 1 && e.jsxs(Y, {
                            value: f,
                            onValueChange: s => F(s),
                            children: [e.jsx(J, {
                                className: "h-7 w-[110px]",
                                "data-testid": "select-combinator",
                                children: e.jsx(Q, {})
                            }), e.jsxs(ee, {
                                children: [e.jsx(I, {
                                    value: "AND",
                                    children: "AND (all fire)"
                                }), e.jsx(I, {
                                    value: "OR",
                                    children: "OR (any fires)"
                                })]
                            })]
                        }), e.jsxs(X, {
                            variant: "ghost",
                            size: "sm",
                            onClick: () => R([...b, ze("sigma")]),
                            className: "h-7 ml-auto",
                            "data-testid": "button-add-condition",
                            children: [e.jsx(wt, {
                                className: "w-3.5 h-3.5 mr-1"
                            }), "Add condition"]
                        })]
                    }), e.jsx("div", {
                        className: "flex flex-col gap-2",
                        children: b.map((s, l) => e.jsxs("div", {
                            className: "flex items-center gap-2",
                            children: [b.length > 1 && l > 0 && e.jsx("span", {
                                className: "text-[10px] font-semibold text-muted-foreground px-1",
                                children: f
                            }), e.jsx("div", {
                                className: "flex-1",
                                children: e.jsx(Ht, {
                                    cond: s,
                                    onChange: j => R(b.map(k => k.id === s.id ? j : k)),
                                    onRemove: () => R(b.filter(j => j.id !== s.id)),
                                    canRemove: b.length > 1
                                })
                            })]
                        }, s.id))
                    })]
                })]
            })]
        }), r === "single" && m && e.jsx(Gt, {
            symbol: m,
            displaySymbol: g(m),
            tickerName: Se(m) ? `${i.find(s=>`BASKET:${s.id}`===m)?.tickers.length??0} tickers` : d.find(s => s.ticker === m)?.name ?? t.find(s => s.ticker === m)?.name ?? "",
            sigmaWindow: b.find(s => s.type === "sigma")?.sigmaWindow ?? 60,
            sigmaBasis: b.find(s => s.type === "sigma")?.sigmaBasis ?? "rolling",
            dates: n
        }), r === "cross" && e.jsx(Xt, {
            tickers: d,
            sigmaWindow: b.find(s => s.type === "sigma")?.sigmaWindow ?? 60,
            sigmaBasis: b.find(s => s.type === "sigma")?.sigmaBasis ?? "rolling",
            dates: n
        }), !h && e.jsxs("div", {
            className: "flex flex-1 items-center justify-center text-muted-foreground text-sm",
            children: ["Configure conditions, then click ", e.jsx("span", {
                className: "mx-1 font-semibold",
                children: "Run"
            }), "."]
        }), h?.mode === "single" && pt && e.jsx("div", {
            className: "flex flex-1 items-center justify-center text-muted-foreground text-sm",
            children: "Computing event study…"
        }), h?.mode === "single" && oe && e.jsx(He, {
            run: h,
            result: oe,
            triggerSummary: pe,
            showAllSingleEvents: Be,
            setShowAllSingleEvents: Te
        }), h?.mode === "pairs" && ft && e.jsx("div", {
            className: "flex flex-1 items-center justify-center text-muted-foreground text-sm",
            children: "Computing pair event study…"
        }), h?.mode === "pairs" && ce && h.symbolB && e.jsx(He, {
            run: {
                symbol: `${g(h.symbol)}/${g(h.symbolB)}`,
                conditions: h.conditions,
                combinator: h.combinator
            },
            result: ce,
            triggerSummary: pe,
            showAllSingleEvents: Be,
            setShowAllSingleEvents: Te,
            pairsTickerA: h.symbol,
            pairsTickerB: h.symbolB
        }), h?.mode === "cross" && (he || _) && e.jsx(te, {
            children: e.jsxs(se, {
                className: "py-3 text-sm flex items-center gap-3",
                children: [e.jsxs("div", {
                    className: "flex-1",
                    children: [he ? "Running event study across universe…" : "Complete", _ && e.jsxs("span", {
                        className: "ml-2 text-muted-foreground",
                        children: [_.done, " / ", _.total]
                    })]
                }), e.jsx("div", {
                    className: "w-48 h-1.5 rounded bg-muted overflow-hidden",
                    children: e.jsx("div", {
                        className: "h-full bg-primary transition-all",
                        style: {
                            width: _ ? `${_.done/Math.max(1,_.total)*100}%` : "0%"
                        }
                    })
                })]
            })
        }), h?.mode === "cross" && q && !he && e.jsxs(e.Fragment, {
            children: [e.jsxs("div", {
                className: "flex flex-wrap items-center gap-2 text-sm",
                children: [e.jsx(ue, {
                    variant: "outline",
                    children: pe
                }), e.jsxs(ue, {
                    variant: "secondary",
                    children: [q.length, " tickers · ", gt, " events"]
                }), e.jsxs("span", {
                    className: "text-xs text-muted-foreground",
                    children: [q.filter(s => s.events > 0).length, " tickers had at least one match"]
                })]
            }), Ve && e.jsxs(te, {
                children: [e.jsx(ae, {
                    className: "pb-2",
                    children: e.jsx(ie, {
                        className: "text-xs font-semibold text-muted-foreground",
                        children: "Cross-sectional aggregate (average across tickers)"
                    })
                }), e.jsx(se, {
                    className: "pt-0",
                    children: e.jsx("div", {
                        className: "overflow-auto",
                        children: e.jsxs("table", {
                            className: "w-full text-xs border-collapse",
                            children: [e.jsx("thead", {
                                children: e.jsxs("tr", {
                                    className: "text-left text-muted-foreground border-b border-border",
                                    children: [e.jsx("th", {
                                        className: "py-1.5 pr-3 font-medium",
                                        children: "Horizon"
                                    }), e.jsx("th", {
                                        className: "py-1.5 pr-3 font-medium",
                                        children: "Tickers w/ events"
                                    }), e.jsx("th", {
                                        className: "py-1.5 pr-3 font-medium",
                                        children: "Avg Mean"
                                    }), e.jsx("th", {
                                        className: "py-1.5 pr-3 font-medium",
                                        children: "Median of Means"
                                    }), e.jsx("th", {
                                        className: "py-1.5 pr-3 font-medium",
                                        children: "Avg P(up)"
                                    }), e.jsx("th", {
                                        className: "py-1.5 pr-3 font-medium",
                                        children: "Avg Edge vs. base"
                                    }), e.jsx("th", {
                                        className: "py-1.5 pr-3 font-medium",
                                        children: "% tickers w/ +edge"
                                    })]
                                })
                            }), e.jsx("tbody", {
                                children: Ve.map(s => e.jsxs("tr", {
                                    className: "border-b border-border/50 hover:bg-muted/30",
                                    children: [e.jsx("td", {
                                        className: "py-1.5 pr-3 font-medium",
                                        children: s.horizon === 1 ? "1 day" : `${s.horizon} days`
                                    }), e.jsx("td", {
                                        className: "py-1.5 pr-3",
                                        children: s.nTickers
                                    }), e.jsx("td", {
                                        className: `py-1.5 pr-3 font-semibold ${Number.isFinite(s.avgMean)&&s.avgMean>0?"text-chart-2":Number.isFinite(s.avgMean)&&s.avgMean<0?"text-destructive":""}`,
                                        children: V(s.avgMean)
                                    }), e.jsx("td", {
                                        className: "py-1.5 pr-3",
                                        children: V(s.medMean)
                                    }), e.jsx("td", {
                                        className: `py-1.5 pr-3 ${Number.isFinite(s.avgPup)&&s.avgPup>=.5?"text-chart-2":"text-destructive"}`,
                                        children: Number.isFinite(s.avgPup) ? `${(s.avgPup*100).toFixed(1)}%` : "—"
                                    }), e.jsx("td", {
                                        className: `py-1.5 pr-3 font-semibold ${Number.isFinite(s.avgEdge)&&s.avgEdge>0?"text-chart-2":Number.isFinite(s.avgEdge)&&s.avgEdge<0?"text-destructive":""}`,
                                        children: Number.isFinite(s.avgEdge) ? `${s.avgEdge>0?"+":""}${s.avgEdge.toFixed(2)} pp` : "—"
                                    }), e.jsx("td", {
                                        className: "py-1.5 pr-3",
                                        children: Number.isFinite(s.posEdgeFraction) ? `${(s.posEdgeFraction*100).toFixed(0)}%` : "—"
                                    })]
                                }, s.horizon))
                            })]
                        })
                    })
                })]
            }), e.jsxs(te, {
                children: [e.jsxs(ae, {
                    className: "pb-2 flex flex-row items-center justify-between gap-2 flex-wrap",
                    children: [e.jsx(ie, {
                        className: "text-xs font-semibold text-muted-foreground",
                        children: "Per-ticker ranked results"
                    }), e.jsxs("div", {
                        className: "flex items-center gap-2",
                        children: [e.jsx(L, {
                            className: "text-xs text-muted-foreground",
                            children: "Rank horizon"
                        }), e.jsxs(Y, {
                            value: String(y),
                            onValueChange: s => A(parseInt(s)),
                            children: [e.jsx(J, {
                                className: "h-7 w-[90px]",
                                "data-testid": "select-rank-horizon",
                                children: e.jsx(Q, {})
                            }), e.jsx(ee, {
                                children: B.map(s => e.jsxs(I, {
                                    value: String(s),
                                    children: [s, "d"]
                                }, s))
                            })]
                        })]
                    })]
                }), e.jsxs(se, {
                    className: "pt-0",
                    children: [e.jsxs("div", {
                        className: "max-h-[600px] overflow-auto",
                        children: [e.jsxs("table", {
                            className: "w-full text-xs border-collapse",
                            children: [e.jsx("thead", {
                                className: "sticky top-0 bg-card",
                                children: e.jsxs("tr", {
                                    className: "text-left text-muted-foreground border-b border-border",
                                    children: [e.jsx("th", {
                                        className: "py-1.5 pr-1 font-medium w-6"
                                    }), e.jsxs("th", {
                                        className: "py-1.5 pr-3 font-medium cursor-pointer select-none",
                                        onClick: () => fe("ticker"),
                                        children: ["Ticker ", ge("ticker")]
                                    }), e.jsx("th", {
                                        className: "py-1.5 pr-3 font-medium",
                                        children: "Name"
                                    }), e.jsxs("th", {
                                        className: "py-1.5 pr-3 font-medium cursor-pointer select-none",
                                        onClick: () => fe("events"),
                                        children: ["N ", ge("events")]
                                    }), e.jsxs("th", {
                                        className: "py-1.5 pr-3 font-medium cursor-pointer select-none",
                                        onClick: () => fe("mean"),
                                        children: ["Mean@", y, "d ", ge("mean")]
                                    }), e.jsx("th", {
                                        className: "py-1.5 pr-3 font-medium",
                                        children: "Median"
                                    }), e.jsxs("th", {
                                        className: "py-1.5 pr-3 font-medium cursor-pointer select-none",
                                        onClick: () => fe("pUp"),
                                        children: ["P(up) ", ge("pUp")]
                                    }), e.jsx("th", {
                                        className: "py-1.5 pr-3 font-medium",
                                        children: "Baseline Mean"
                                    }), e.jsxs("th", {
                                        className: "py-1.5 pr-3 font-medium cursor-pointer select-none",
                                        onClick: () => fe("edge"),
                                        children: ["Edge vs. base ", ge("edge")]
                                    })]
                                })
                            }), e.jsx("tbody", {
                                children: q.map(s => {
                                    const l = s.stats.find(P => P.horizon === y),
                                        j = s.baseline.find(P => P.horizon === y),
                                        k = Number.isFinite(l.mean) && Number.isFinite(j.mean) ? l.mean - j.mean : NaN,
                                        M = Number.isFinite(k) ? k > 0 ? "text-chart-2" : "text-destructive" : "",
                                        T = Number.isFinite(l.mean) ? l.mean > 0 ? "text-chart-2" : "text-destructive" : "",
                                        $ = Number.isFinite(l.pUp) ? l.pUp >= .5 ? "text-chart-2" : "text-destructive" : "",
                                        w = h.conditions[0],
                                        E = w && (w.type === "sigma" || w.type === "gap"),
                                        z = rt === s.ticker,
                                        O = s.events > 0;
                                    return e.jsxs(C.Fragment, {
                                        children: [e.jsxs("tr", {
                                            className: "border-b border-border/50 hover:bg-muted/30",
                                            "data-testid": `row-ticker-${s.ticker}`,
                                            children: [e.jsx("td", {
                                                className: "py-1 pr-1 w-6 align-middle",
                                                children: O ? e.jsx("button", {
                                                    type: "button",
                                                    className: "p-0.5 rounded hover:bg-muted",
                                                    onClick: P => {
                                                        P.stopPropagation(), lt(z ? null : s.ticker)
                                                    },
                                                    "data-testid": `button-expand-${s.ticker}`,
                                                    "aria-label": z ? "Collapse events" : "Expand events",
                                                    children: z ? e.jsx(Ft, {
                                                        className: "w-3 h-3"
                                                    }) : e.jsx(Ct, {
                                                        className: "w-3 h-3"
                                                    })
                                                }) : null
                                            }), e.jsx("td", {
                                                className: "py-1 pr-3 font-semibold cursor-pointer hover:underline",
                                                onClick: () => Je(s.ticker),
                                                title: "Open in Charts tab",
                                                children: s.ticker
                                            }), e.jsx("td", {
                                                className: "py-1 pr-3 text-muted-foreground truncate max-w-[220px]",
                                                children: s.name
                                            }), e.jsx("td", {
                                                className: "py-1 pr-3",
                                                children: s.events
                                            }), e.jsx("td", {
                                                className: `py-1 pr-3 font-semibold ${T}`,
                                                children: V(l.mean)
                                            }), e.jsx("td", {
                                                className: "py-1 pr-3",
                                                children: V(l.median)
                                            }), e.jsx("td", {
                                                className: `py-1 pr-3 ${$}`,
                                                children: Number.isFinite(l.pUp) ? `${(l.pUp*100).toFixed(1)}%` : "—"
                                            }), e.jsx("td", {
                                                className: "py-1 pr-3 text-muted-foreground",
                                                children: V(j.mean)
                                            }), e.jsx("td", {
                                                className: `py-1 pr-3 font-semibold ${M}`,
                                                children: Number.isFinite(k) ? `${k>0?"+":""}${k.toFixed(2)} pp` : "—"
                                            })]
                                        }), z && O && e.jsx("tr", {
                                            className: "border-b border-border/50 bg-muted/20",
                                            children: e.jsx("td", {
                                                colSpan: 9,
                                                className: "p-0",
                                                children: e.jsxs("div", {
                                                    className: "px-4 py-2",
                                                    children: [e.jsxs("div", {
                                                        className: "flex items-center justify-between mb-1",
                                                        children: [e.jsxs("div", {
                                                            className: "text-[10px] text-muted-foreground font-medium uppercase tracking-wide",
                                                            children: [s.ticker, " — ", s.eventRows.length, " signals (most recent first)"]
                                                        }), e.jsxs("div", {
                                                            className: "flex items-center gap-3",
                                                            children: [e.jsxs(X, {
                                                                variant: "outline",
                                                                size: "sm",
                                                                className: "h-6 text-[10px] gap-1 px-2",
                                                                onClick: () => {
                                                                    const P = s.eventRows.map(Ne => ({
                                                                        date: Ne.date,
                                                                        value: Ne.triggerValue,
                                                                        direction: Ne.triggerValue >= 0 ? "up" : "down",
                                                                        label: pe
                                                                    }));
                                                                    et({
                                                                        ticker: s.ticker,
                                                                        label: `Price Action · ${s.eventRows.length} signals · ${pe}`,
                                                                        signals: P
                                                                    })
                                                                },
                                                                "data-testid": `button-show-on-chart-${s.ticker}`,
                                                                title: "Jump to Charts and pin these signals on the price chart",
                                                                children: [e.jsx(Qe, {
                                                                    className: "h-3 w-3"
                                                                }), "Show on chart"]
                                                            }), e.jsx("div", {
                                                                className: "text-[10px] text-muted-foreground",
                                                                children: "Click ticker to open in Charts"
                                                            })]
                                                        })]
                                                    }), e.jsx("div", {
                                                        className: "max-h-60 overflow-auto border border-border/50 rounded",
                                                        children: e.jsxs("table", {
                                                            className: "w-full text-[11px] border-collapse",
                                                            children: [e.jsx("thead", {
                                                                className: "sticky top-0 bg-card z-10",
                                                                children: e.jsxs("tr", {
                                                                    className: "text-left text-muted-foreground border-b border-border",
                                                                    children: [e.jsx("th", {
                                                                        className: "py-1 px-2 font-medium",
                                                                        children: "Date"
                                                                    }), e.jsx("th", {
                                                                        className: "py-1 px-2 font-medium",
                                                                        children: "Trigger"
                                                                    }), B.map(P => e.jsxs("th", {
                                                                        className: "py-1 px-2 font-medium",
                                                                        children: ["+", P, "d"]
                                                                    }, P))]
                                                                })
                                                            }), e.jsx("tbody", {
                                                                children: s.eventRows.slice().reverse().map((P, Ne) => e.jsxs("tr", {
                                                                    className: "border-b border-border/30 hover:bg-muted/30",
                                                                    children: [e.jsx("td", {
                                                                        className: "py-0.5 px-2 font-mono",
                                                                        children: P.date
                                                                    }), e.jsx("td", {
                                                                        className: "py-0.5 px-2",
                                                                        children: E ? V(P.triggerValue) : Me(P.triggerValue)
                                                                    }), B.map(Le => {
                                                                        const Fe = P.fwd[Le],
                                                                            Nt = Fe == null ? "" : Fe > 0 ? "text-chart-2" : Fe < 0 ? "text-destructive" : "";
                                                                        return e.jsx("td", {
                                                                            className: `py-0.5 px-2 ${Nt}`,
                                                                            children: V(Fe ?? null)
                                                                        }, Le)
                                                                    })]
                                                                }, `${P.date}-${Ne}`))
                                                            })]
                                                        })
                                                    })]
                                                })
                                            })
                                        })]
                                    }, s.ticker)
                                })
                            })]
                        }), q.length === 0 && e.jsx("div", {
                            className: "py-6 text-center text-muted-foreground text-xs",
                            children: "No tickers returned data. Check universe filter."
                        })]
                    }), e.jsx("div", {
                        className: "mt-2 text-[10px] text-muted-foreground",
                        children: "Click the chevron to see every signal date for a ticker. Click the ticker symbol to open it on the Charts tab."
                    })]
                })]
            })]
        })]
    })
}

function He({
    run: t,
    result: n,
    triggerSummary: c,
    showAllSingleEvents: o,
    setShowAllSingleEvents: u,
    pairsTickerA: p,
    pairsTickerB: d
}) {
    const r = !!p && !!d,
        x = nt();
    return e.jsxs(e.Fragment, {
        children: [e.jsxs("div", {
            className: "flex flex-wrap items-center gap-2 text-sm",
            children: [e.jsx(ue, {
                variant: "secondary",
                "data-testid": "badge-symbol",
                children: x(t.symbol)
            }), e.jsx(ue, {
                variant: "outline",
                children: c
            }), e.jsxs(ue, {
                variant: "outline",
                "data-testid": "badge-event-count",
                children: [n.events.length, " events"]
            }), n.events.length === 0 && e.jsx("span", {
                className: "text-xs text-muted-foreground",
                children: "No events match the trigger. Try loosening thresholds, switching AND→OR, or picking a different ticker."
            })]
        }), n.events.length > 0 && e.jsxs(te, {
            children: [e.jsx(ae, {
                className: "pb-2",
                children: e.jsx(ie, {
                    className: "text-xs font-semibold text-muted-foreground",
                    children: "Forward return statistics (event vs. unconditional baseline)"
                })
            }), e.jsxs(se, {
                className: "pt-0",
                children: [e.jsx("div", {
                    className: "overflow-auto",
                    children: e.jsxs("table", {
                        className: "w-full text-xs border-collapse",
                        children: [e.jsx("thead", {
                            children: e.jsxs("tr", {
                                className: "text-left text-muted-foreground border-b border-border",
                                children: [e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium",
                                    children: "Horizon"
                                }), e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium",
                                    children: "N"
                                }), e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium",
                                    children: "Mean"
                                }), e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium",
                                    children: "Median"
                                }), e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium",
                                    children: "Std"
                                }), e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium",
                                    children: "P(up)"
                                }), e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium",
                                    children: "Win/Loss"
                                }), e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium",
                                    children: "p25 / p75"
                                }), e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium",
                                    children: "Min / Max"
                                }), e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium text-muted-foreground",
                                    children: "Baseline Mean"
                                }), e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium text-muted-foreground",
                                    children: "Baseline P(up)"
                                }), e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium",
                                    children: "Edge vs. base"
                                })]
                            })
                        }), e.jsx("tbody", {
                            children: n.stats.map(i => {
                                const g = n.baseline.find(N => N.horizon === i.horizon),
                                    m = Number.isFinite(i.mean) && Number.isFinite(g.mean) ? i.mean - g.mean : NaN,
                                    v = Number.isFinite(m) ? m > 0 ? "text-chart-2" : "text-destructive" : "",
                                    a = Number.isFinite(i.pUp) ? i.pUp >= .5 ? "text-chart-2" : "text-destructive" : "";
                                return e.jsxs("tr", {
                                    className: "border-b border-border/50 hover:bg-muted/30",
                                    children: [e.jsx("td", {
                                        className: "py-1.5 pr-3 font-medium",
                                        children: i.horizon === 1 ? "1 day" : `${i.horizon} days`
                                    }), e.jsx("td", {
                                        className: "py-1.5 pr-3",
                                        children: i.count
                                    }), e.jsx("td", {
                                        className: `py-1.5 pr-3 font-semibold ${v}`,
                                        children: V(i.mean)
                                    }), e.jsx("td", {
                                        className: "py-1.5 pr-3",
                                        children: V(i.median)
                                    }), e.jsxs("td", {
                                        className: "py-1.5 pr-3 text-muted-foreground",
                                        children: [Me(i.std), "%"]
                                    }), e.jsx("td", {
                                        className: `py-1.5 pr-3 font-semibold ${a}`,
                                        children: Number.isFinite(i.pUp) ? `${(i.pUp*100).toFixed(1)}%` : "—"
                                    }), e.jsx("td", {
                                        className: "py-1.5 pr-3",
                                        children: Me(i.winLoss)
                                    }), e.jsxs("td", {
                                        className: "py-1.5 pr-3 text-muted-foreground",
                                        children: [V(i.p25), " / ", V(i.p75)]
                                    }), e.jsxs("td", {
                                        className: "py-1.5 pr-3 text-muted-foreground",
                                        children: [V(i.min), " / ", V(i.max)]
                                    }), e.jsx("td", {
                                        className: "py-1.5 pr-3 text-muted-foreground",
                                        children: V(g.mean)
                                    }), e.jsx("td", {
                                        className: "py-1.5 pr-3 text-muted-foreground",
                                        children: Number.isFinite(g.pUp) ? `${(g.pUp*100).toFixed(1)}%` : "—"
                                    }), e.jsx("td", {
                                        className: `py-1.5 pr-3 font-semibold ${v}`,
                                        children: Number.isFinite(m) ? `${m>0?"+":""}${m.toFixed(2)} pp` : "—"
                                    })]
                                }, i.horizon)
                            })
                        })]
                    })
                }), e.jsxs("div", {
                    className: "mt-2 text-[10px] text-muted-foreground leading-relaxed",
                    children: ["Returns are close-to-close from the event bar. ", e.jsx("b", {
                        children: "Edge vs. base"
                    }), " subtracts the unconditional mean at each horizon. ", e.jsx("b", {
                        children: "Win/Loss"
                    }), " = |mean(winners)| / |mean(losers)|."]
                })]
            })]
        }), n.events.length > 0 && e.jsxs(te, {
            children: [e.jsx(ae, {
                className: "pb-2",
                children: e.jsx(ie, {
                    className: "text-xs font-semibold text-muted-foreground",
                    children: "Average cumulative return path after event (day 0 = event)"
                })
            }), e.jsx(se, {
                className: "pt-0 h-64",
                children: e.jsx(_e, {
                    width: "100%",
                    height: "100%",
                    children: e.jsxs(Dt, {
                        data: n.avgPath,
                        margin: {
                            top: 8,
                            right: 16,
                            bottom: 8,
                            left: 8
                        },
                        children: [e.jsx(Bt, {
                            strokeDasharray: "3 3",
                            stroke: "hsl(var(--border))"
                        }), e.jsx(Pe, {
                            dataKey: "day",
                            tick: {
                                fontSize: 10,
                                fill: "hsl(var(--muted-foreground))"
                            },
                            label: {
                                value: "Trading days after event",
                                position: "insideBottom",
                                offset: -4,
                                style: {
                                    fontSize: 10,
                                    fill: "hsl(var(--muted-foreground))"
                                }
                            }
                        }), e.jsx(Re, {
                            tick: {
                                fontSize: 10,
                                fill: "hsl(var(--muted-foreground))"
                            },
                            tickFormatter: i => `${i.toFixed(1)}%`
                        }), e.jsx(We, {
                            contentStyle: {
                                background: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                fontSize: 11
                            },
                            formatter: (i, g) => g === "cumret" ? [`${Number(i).toFixed(3)}%`, "Avg cum ret"] : [i, g],
                            labelFormatter: i => `Day ${i}`
                        }), e.jsx(qe, {
                            y: 0,
                            stroke: "hsl(var(--muted-foreground))",
                            strokeDasharray: "3 3"
                        }), e.jsx(At, {
                            type: "monotone",
                            dataKey: "cumret",
                            stroke: "hsl(var(--chart-1))",
                            strokeWidth: 2,
                            dot: !1
                        })]
                    })
                })
            })]
        }), n.events.length > 0 && e.jsx("div", {
            className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3",
            children: B.map(i => {
                const g = Ot(n.distribution[i], 24);
                return e.jsxs(te, {
                    children: [e.jsx(ae, {
                        className: "pb-1",
                        children: e.jsxs(ie, {
                            className: "text-xs font-semibold text-muted-foreground",
                            children: [i, "-day forward return distribution"]
                        })
                    }), e.jsx(se, {
                        className: "pt-0 h-40",
                        children: e.jsx(_e, {
                            width: "100%",
                            height: "100%",
                            children: e.jsxs(Vt, {
                                data: g,
                                margin: {
                                    top: 4,
                                    right: 4,
                                    bottom: 4,
                                    left: 4
                                },
                                children: [e.jsx(Pe, {
                                    dataKey: "bucket",
                                    tick: {
                                        fontSize: 9,
                                        fill: "hsl(var(--muted-foreground))"
                                    },
                                    interval: Math.max(1, Math.floor(g.length / 6))
                                }), e.jsx(Re, {
                                    tick: {
                                        fontSize: 9,
                                        fill: "hsl(var(--muted-foreground))"
                                    },
                                    width: 24
                                }), e.jsx(We, {
                                    contentStyle: {
                                        background: "hsl(var(--card))",
                                        border: "1px solid hsl(var(--border))",
                                        fontSize: 11
                                    },
                                    formatter: m => [m, "Count"],
                                    labelFormatter: (m, v) => {
                                        const a = v?.[0]?.payload;
                                        return a ? `${a.lo.toFixed(2)}% to ${a.hi.toFixed(2)}%` : m
                                    }
                                }), e.jsx(qe, {
                                    x: g.find(m => m.lo <= 0 && m.hi >= 0)?.bucket ?? "0",
                                    stroke: "hsl(var(--muted-foreground))"
                                }), e.jsx(Xe, {
                                    dataKey: "count",
                                    fill: "hsl(var(--chart-2))"
                                })]
                            })
                        })
                    })]
                }, i)
            })
        }), n.events.length > 0 && e.jsxs(te, {
            children: [e.jsxs(ae, {
                className: "pb-2 flex flex-row items-center justify-between",
                children: [e.jsxs(ie, {
                    className: "text-xs font-semibold text-muted-foreground",
                    children: ["Event log (", n.events.length, " signals)"]
                }), e.jsxs("div", {
                    className: "flex items-center gap-3",
                    children: [e.jsxs(X, {
                        variant: "outline",
                        size: "sm",
                        className: "h-7 text-[11px] gap-1",
                        onClick: () => {
                            const i = n.events.map(g => ({
                                date: g.date,
                                value: g.triggerValue,
                                direction: g.triggerValue >= 0 ? "up" : "down",
                                label: c
                            }));
                            et({
                                ticker: r ? p : t.symbol,
                                label: r ? `Pair ${p}/${d} · ${n.events.length} signals · ${c}` : `Price Action · ${n.events.length} signals · ${c}`,
                                signals: i
                            })
                        },
                        "data-testid": "button-show-on-chart",
                        title: "Jump to Charts and pin these signals on the price chart",
                        children: [e.jsx(Qe, {
                            className: "h-3 w-3"
                        }), "Show on chart"]
                    }), n.events.length > 200 && e.jsxs("div", {
                        className: "flex items-center gap-1.5",
                        children: [e.jsx(L, {
                            htmlFor: "show-all-single",
                            className: "text-[10px] text-muted-foreground",
                            children: "Show all"
                        }), e.jsx(zt, {
                            id: "show-all-single",
                            checked: o,
                            onCheckedChange: u,
                            "data-testid": "switch-show-all-single"
                        })]
                    })]
                })]
            }), e.jsx(se, {
                className: "pt-0",
                children: e.jsxs("div", {
                    className: "max-h-96 overflow-auto",
                    children: [e.jsxs("table", {
                        className: "w-full text-xs border-collapse",
                        children: [e.jsx("thead", {
                            className: "sticky top-0 bg-card z-10",
                            children: e.jsxs("tr", {
                                className: "text-left text-muted-foreground border-b border-border",
                                children: [e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium",
                                    children: "Date"
                                }), e.jsx("th", {
                                    className: "py-1.5 pr-3 font-medium",
                                    children: "Trigger value"
                                }), B.map(i => e.jsxs("th", {
                                    className: "py-1.5 pr-3 font-medium",
                                    children: ["+", i, "d"]
                                }, i))]
                            })
                        }), e.jsx("tbody", {
                            children: (o ? n.events : n.events.slice(-200)).slice().reverse().map((i, g) => {
                                const m = t.conditions[0],
                                    v = m.type === "sigma" || m.type === "gap";
                                return e.jsxs("tr", {
                                    className: "border-b border-border/50 hover:bg-muted/30",
                                    children: [e.jsx("td", {
                                        className: "py-1 pr-3",
                                        children: i.date
                                    }), e.jsx("td", {
                                        className: "py-1 pr-3",
                                        children: v ? V(i.triggerValue) : Me(i.triggerValue)
                                    }), B.map(a => {
                                        const N = i.fwd[a],
                                            b = N == null ? "" : N > 0 ? "text-chart-2" : N < 0 ? "text-destructive" : "";
                                        return e.jsx("td", {
                                            className: `py-1 pr-3 ${b}`,
                                            children: V(N ?? null)
                                        }, a)
                                    })]
                                }, `${i.date}-${g}`)
                            })
                        })]
                    }), n.events.length > 200 && !o && e.jsxs("div", {
                        className: "text-[10px] text-muted-foreground mt-1",
                        children: ["Showing most recent 200 of ", n.events.length, " signals. Toggle “Show all” above or use CSV export for the full list."]
                    })]
                })
            })]
        })]
    })
}

function Ee(t) {
    return Number.isFinite(t) ? t >= 3 ? "bg-destructive/20 text-destructive border-destructive/40" : t >= 2 ? "bg-chart-3/20 text-chart-3 border-chart-3/40" : t >= 1 ? "bg-chart-1/20 text-chart-1 border-chart-1/40" : "bg-muted text-muted-foreground border-border" : "bg-muted text-muted-foreground"
}

function Gt({
    symbol: t,
    displaySymbol: n,
    tickerName: c,
    sigmaWindow: o,
    sigmaBasis: u,
    dates: p
}) {
    const d = n || t,
        {
            data: r
        } = be({
            queryKey: ["ticker-raw-inspect", t],
            queryFn: async () => t ? me(t) : null,
            enabled: !!t
        }),
        [x, i] = C.useState(""),
        [g, m] = C.useState(""),
        [v, a] = C.useState(!1),
        N = C.useMemo(() => {
            if (!r || !p.length) return null;
            const b = K(r, "close", p.length),
                R = K(r, "open", p.length);
            if (!b.length) return null;
            let f = -1;
            for (let U = b.length - 1; U >= 1; U--)
                if (b[U] != null && b[U - 1] != null && b[U - 1] > 0) {
                    f = U;
                    break
                } if (f < 1) return null;
            const F = p[f] ?? "",
                y = b[f - 1],
                A = b[f],
                S = R[f],
                W = y > 0 ? (A / y - 1) * 100 : NaN,
                D = y > 0 && S != null && Number.isFinite(S) ? (S / y - 1) * 100 : NaN,
                H = Math.max(20, Math.floor(o || 60)),
                h = Number.isFinite(W) ? ve(b, f, W, H, u) : null,
                re = Number.isFinite(D) ? ve(b, f, D, H, u) : null,
                _ = parseFloat(x),
                ne = Number.isFinite(_) && _ !== 0 ? ve(b, f, _, H, u) : null;
            return {
                lastDate: F,
                lastClose: A,
                prevClose: y,
                lastOpen: S,
                lastMovePct: W,
                gapPct: D,
                lastInspect: h,
                gapInspect: re,
                customInspect: ne,
                refCtx: h ?? re ?? ne ?? null,
                window: H
            }
        }, [r, p, o, u, x]);
    return e.jsxs(te, {
        children: [e.jsx(ae, {
            className: "pb-2",
            children: e.jsxs(ie, {
                className: "text-sm font-semibold flex items-center gap-2",
                children: [e.jsx(tt, {
                    className: "w-4 h-4 text-primary"
                }), "Move Inspector", e.jsxs("span", {
                    className: "text-[11px] font-normal text-muted-foreground",
                    children: ["What sigma is this move? (μ/σ basis:", " ", u === "full" ? "full history" : `rolling ${N?.window??o}d`, ")"]
                })]
            })
        }), e.jsxs(se, {
            className: "pt-0",
            children: [N ? e.jsxs("div", {
                className: "grid grid-cols-1 md:grid-cols-3 gap-3",
                children: [e.jsx(Ge, {
                    label: `Latest close (${N.lastDate})`,
                    sub: `${d} — ${c}`,
                    pct: N.lastMovePct,
                    ctx: N.lastInspect,
                    basis: u
                }), e.jsx(Ge, {
                    label: "Latest overnight gap",
                    sub: "Prev close → today's open",
                    pct: N.gapPct,
                    ctx: N.gapInspect,
                    basis: u
                }), e.jsxs("div", {
                    className: "rounded-md border border-border p-2 space-y-1.5",
                    children: [e.jsx("div", {
                        className: "text-[10px] text-muted-foreground uppercase tracking-wide font-medium",
                        children: "Custom move — enter %"
                    }), e.jsx(je, {
                        value: x,
                        onChange: b => i(b.target.value),
                        placeholder: "e.g. 2 or -3.5",
                        className: "h-7 text-xs",
                        "data-testid": "input-custom-move"
                    }), N.customInspect ? e.jsx(it, {
                        ctx: N.customInspect,
                        compact: !0,
                        basis: u
                    }) : e.jsxs("div", {
                        className: "text-[10px] text-muted-foreground",
                        children: ["Type a % move (positive or negative) to see what sigma it represents for ", d, " today."]
                    })]
                })]
            }) : e.jsxs("div", {
                className: "text-xs text-muted-foreground py-2",
                children: ["Loading ", d, "…"]
            }), N?.refCtx && e.jsx(Zt, {
                mu: N.refCtx.mu,
                sigma: N.refCtx.sigma,
                basis: u,
                window: N.window,
                totalDays: N.refCtx.totalDays,
                customSigma: g,
                setCustomSigma: m
            })]
        })]
    })
}

function Zt({
    mu: t,
    sigma: n,
    basis: c,
    window: o,
    totalDays: u,
    customSigma: p,
    setCustomSigma: d
}) {
    const r = [1, 1.5, 2, 2.5, 3],
        x = parseFloat(p),
        i = Number.isFinite(x) && x !== 0,
        g = i ? t + x * n : NaN,
        m = i ? t - x * n : NaN,
        v = a => Number.isFinite(a) ? `${a>0?"+":""}${a.toFixed(2)}%` : "—";
    return e.jsxs("div", {
        className: "mt-3 rounded-md border border-border p-2 space-y-2",
        children: [e.jsxs("div", {
            className: "flex flex-wrap items-center gap-2",
            children: [e.jsx("div", {
                className: "text-[10px] text-muted-foreground uppercase tracking-wide font-medium",
                children: "σ → % move"
            }), e.jsx("span", {
                className: "text-[10px] text-muted-foreground",
                children: c === "full" ? `full-history μ=${t.toFixed(2)}%, σ=${n.toFixed(2)}% over ${u} days` : `rolling μ=${t.toFixed(2)}%, σ=${n.toFixed(2)}% over last ${o}d`
            })]
        }), e.jsx("div", {
            className: "overflow-auto",
            children: e.jsxs("table", {
                className: "w-full text-[11px] border-collapse",
                children: [e.jsx("thead", {
                    children: e.jsxs("tr", {
                        className: "text-left text-muted-foreground border-b border-border",
                        children: [e.jsx("th", {
                            className: "py-1 pr-3 font-medium",
                            children: "Threshold"
                        }), r.map(a => e.jsxs("th", {
                            className: "py-1 pr-3 font-medium tabular-nums",
                            children: [a, "σ"]
                        }, a))]
                    })
                }), e.jsxs("tbody", {
                    children: [e.jsxs("tr", {
                        className: "border-b border-border/50",
                        children: [e.jsx("td", {
                            className: "py-1 pr-3 text-chart-2 font-medium",
                            children: "Up (μ + k·σ)"
                        }), r.map(a => e.jsx("td", {
                            className: "py-1 pr-3 tabular-nums text-chart-2 font-semibold",
                            "data-testid": `sigma-up-${a}`,
                            children: v(t + a * n)
                        }, a))]
                    }), e.jsxs("tr", {
                        children: [e.jsx("td", {
                            className: "py-1 pr-3 text-destructive font-medium",
                            children: "Down (μ − k·σ)"
                        }), r.map(a => e.jsx("td", {
                            className: "py-1 pr-3 tabular-nums text-destructive font-semibold",
                            "data-testid": `sigma-down-${a}`,
                            children: v(t - a * n)
                        }, a))]
                    })]
                })]
            })
        }), e.jsxs("div", {
            className: "flex flex-wrap items-center gap-2",
            children: [e.jsx("div", {
                className: "text-[10px] text-muted-foreground uppercase tracking-wide font-medium",
                children: "Custom σ → %"
            }), e.jsx(je, {
                value: p,
                onChange: a => d(a.target.value),
                placeholder: "e.g. 2.5 or -1.8",
                className: "h-7 text-xs w-32",
                "data-testid": "input-custom-sigma"
            }), i ? e.jsxs("div", {
                className: "flex items-center gap-3 text-[11px] tabular-nums",
                children: [e.jsxs("span", {
                    children: [e.jsxs("span", {
                        className: "text-muted-foreground",
                        children: ["Up (", x >= 0 ? "+" : "", x, "σ):"]
                    }), " ", e.jsx("span", {
                        className: "text-chart-2 font-semibold",
                        "data-testid": "sigma-custom-up",
                        children: v(g)
                    })]
                }), e.jsxs("span", {
                    children: [e.jsxs("span", {
                        className: "text-muted-foreground",
                        children: ["Down (", x >= 0 ? "-" : "+", Math.abs(x), "σ):"]
                    }), " ", e.jsx("span", {
                        className: "text-destructive font-semibold",
                        "data-testid": "sigma-custom-down",
                        children: v(m)
                    })]
                })]
            }) : e.jsx("span", {
                className: "text-[10px] text-muted-foreground",
                children: "Enter a sigma multiple to see the corresponding ±% threshold."
            })]
        })]
    })
}

function Ge({
    label: t,
    sub: n,
    pct: c,
    ctx: o,
    basis: u
}) {
    const p = !Number.isFinite(c) || c === 0 ? "" : c > 0 ? "text-chart-2" : "text-destructive";
    return e.jsxs("div", {
        className: "rounded-md border border-border p-2 space-y-1.5",
        children: [e.jsx("div", {
            className: "text-[10px] text-muted-foreground uppercase tracking-wide font-medium",
            children: t
        }), n && e.jsx("div", {
            className: "text-[10px] text-muted-foreground truncate",
            children: n
        }), e.jsx("div", {
            className: `text-xl font-semibold tabular-nums ${p}`,
            children: Number.isFinite(c) ? `${c>0?"+":""}${c.toFixed(2)}%` : "—"
        }), o ? e.jsx(it, {
            ctx: o,
            basis: u
        }) : e.jsx("div", {
            className: "text-[10px] text-muted-foreground",
            children: "Not enough history for sigma calc."
        })]
    })
}

function it({
    ctx: t,
    compact: n = !1,
    basis: c
}) {
    const o = `${t.z>=0?"+":""}${t.z.toFixed(2)}σ`,
        u = (t.percentileAbs * 100).toFixed(1),
        p = t.oneInNDays >= 252 ? `1 in ~${(t.oneInNDays/252).toFixed(1)} years` : t.oneInNDays >= 21 ? `1 in ~${(t.oneInNDays/21).toFixed(1)} months` : `1 in ~${Math.round(t.oneInNDays)} days`;
    return e.jsxs("div", {
        className: "flex flex-col gap-0.5",
        children: [e.jsxs("div", {
            className: "flex items-center gap-1.5",
            children: [e.jsx("span", {
                className: `inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-semibold tabular-nums ${Ee(t.absZ)}`,
                "data-testid": "badge-sigma",
                children: o
            }), e.jsxs("span", {
                className: "text-[10px] text-muted-foreground",
                children: ["|z|=", t.absZ.toFixed(2)]
            })]
        }), !n && e.jsxs("div", {
            className: "text-[10px] text-muted-foreground",
            children: [c === "full" ? "Full-history" : "Rolling", " μ=", t.mu.toFixed(2), "%, σ=", t.sigma.toFixed(2), "%", c === "full" ? ` over ${t.totalDays} days` : ` over last ${t.window}d`]
        }), e.jsxs("div", {
            className: "text-[10px] text-muted-foreground",
            children: ["|move| percentile: ", e.jsxs("span", {
                className: "font-semibold",
                children: [u, "%"]
            }), " · ", t.countAtLeastAbs, " of ", t.totalDays, " days"]
        }), e.jsxs("div", {
            className: "text-[10px] text-muted-foreground",
            children: ["Historical frequency: ", e.jsx("span", {
                className: "font-semibold",
                children: p
            })]
        })]
    })
}

function Xt({
    tickers: t,
    sigmaWindow: n,
    sigmaBasis: c,
    dates: o
}) {
    const [u, p] = C.useState(null), [d, r] = C.useState(!1), [x, i] = C.useState("absSigma"), g = C.useCallback(async () => {
        if (!t.length || !o.length) return;
        r(!0), p(null);
        const a = Math.max(20, Math.floor(n || 60)),
            N = [],
            b = 8;
        let R = 0;
        async function f() {
            for (; R < t.length;) {
                const F = R++,
                    y = t[F];
                try {
                    const A = await me(y.ticker),
                        S = K(A, "close", o.length),
                        W = K(A, "open", o.length);
                    if (!S.length) continue;
                    let D = -1;
                    for (let U = S.length - 1; U >= 1; U--)
                        if (S[U] != null && S[U - 1] != null && S[U - 1] > 0) {
                            D = U;
                            break
                        } if (D < 1) continue;
                    const H = S[D - 1],
                        h = (S[D] / H - 1) * 100,
                        re = W[D],
                        _ = re != null && Number.isFinite(re) && H > 0 ? (re / H - 1) * 100 : NaN,
                        ne = Number.isFinite(h) ? ve(S, D, h, a, c) : null,
                        Z = Number.isFinite(_) ? ve(S, D, _, a, c) : null;
                    N.push({
                        ticker: y.ticker,
                        name: y.name,
                        date: o[D] ?? "",
                        pct: h,
                        gap: _,
                        sigma: ne,
                        gapSigma: Z
                    })
                } catch {}
            }
        }
        await Promise.all(Array.from({
            length: b
        }, () => f())), p(N), r(!1)
    }, [t, o, n, c]), m = C.useMemo(() => {
        if (!u) return null;
        const a = u.slice();
        return a.sort((N, b) => {
            const R = x === "absSigma" ? N.sigma?.absZ ?? -1 / 0 : x === "sigma" ? N.sigma?.z ?? -1 / 0 : x === "absPct" ? Math.abs(N.pct) : N.pct;
            return (x === "absSigma" ? b.sigma?.absZ ?? -1 / 0 : x === "sigma" ? b.sigma?.z ?? -1 / 0 : x === "absPct" ? Math.abs(b.pct) : b.pct) - R
        }), a
    }, [u, x]), v = m && m.length > 0 ? m[0].date : "";
    return e.jsxs(te, {
        children: [e.jsxs(ae, {
            className: "pb-2 flex flex-row items-center justify-between flex-wrap gap-2",
            children: [e.jsxs(ie, {
                className: "text-sm font-semibold flex items-center gap-2",
                children: [e.jsx(tt, {
                    className: "w-4 h-4 text-primary"
                }), "Biggest moves today", e.jsxs("span", {
                    className: "text-[11px] font-normal text-muted-foreground",
                    children: ["Ranks ", t.length, " tickers by the sigma of their latest move (μ/σ basis:", " ", c === "full" ? "full history" : `rolling ${n}d`, ")"]
                })]
            }), e.jsxs("div", {
                className: "flex items-center gap-2",
                children: [m && v && e.jsxs("span", {
                    className: "text-[10px] text-muted-foreground",
                    children: ["Latest close date: ", v]
                }), e.jsxs(Y, {
                    value: x,
                    onValueChange: a => i(a),
                    children: [e.jsx(J, {
                        className: "h-7 w-[130px]",
                        "data-testid": "select-sort-mode",
                        children: e.jsx(Q, {})
                    }), e.jsxs(ee, {
                        children: [e.jsx(I, {
                            value: "absSigma",
                            children: "|sigma| desc"
                        }), e.jsx(I, {
                            value: "sigma",
                            children: "sigma desc"
                        }), e.jsx(I, {
                            value: "absPct",
                            children: "|% move| desc"
                        }), e.jsx(I, {
                            value: "pct",
                            children: "% move desc"
                        })]
                    })]
                }), e.jsx(X, {
                    onClick: g,
                    disabled: d,
                    size: "sm",
                    className: "h-7",
                    "data-testid": "button-run-inspector",
                    children: d ? "Loading…" : "Load moves"
                })]
            })]
        }), e.jsx(se, {
            className: "pt-0",
            children: m ? m.length === 0 ? e.jsx("div", {
                className: "text-xs text-muted-foreground py-2",
                children: "No tickers returned data."
            }) : e.jsx("div", {
                className: "max-h-[400px] overflow-auto",
                children: e.jsxs("table", {
                    className: "w-full text-xs border-collapse",
                    children: [e.jsx("thead", {
                        className: "sticky top-0 bg-card z-10",
                        children: e.jsxs("tr", {
                            className: "text-left text-muted-foreground border-b border-border",
                            children: [e.jsx("th", {
                                className: "py-1.5 pr-3 font-medium",
                                children: "Ticker"
                            }), e.jsx("th", {
                                className: "py-1.5 pr-3 font-medium",
                                children: "Name"
                            }), e.jsx("th", {
                                className: "py-1.5 pr-3 font-medium",
                                children: "Date"
                            }), e.jsx("th", {
                                className: "py-1.5 pr-3 font-medium",
                                children: "Move %"
                            }), e.jsx("th", {
                                className: "py-1.5 pr-3 font-medium",
                                children: "Sigma"
                            }), e.jsx("th", {
                                className: "py-1.5 pr-3 font-medium",
                                children: "|Move| pctile"
                            }), e.jsx("th", {
                                className: "py-1.5 pr-3 font-medium",
                                children: "Freq"
                            }), e.jsx("th", {
                                className: "py-1.5 pr-3 font-medium",
                                children: "Gap %"
                            }), e.jsx("th", {
                                className: "py-1.5 pr-3 font-medium",
                                children: "Gap σ"
                            })]
                        })
                    }), e.jsx("tbody", {
                        children: m.map(a => {
                            const N = !Number.isFinite(a.pct) || a.pct === 0 ? "" : a.pct > 0 ? "text-chart-2" : "text-destructive",
                                b = !Number.isFinite(a.gap) || a.gap === 0 ? "" : a.gap > 0 ? "text-chart-2" : "text-destructive",
                                R = a.sigma ? (a.sigma.percentileAbs * 100).toFixed(1) + "%" : "—",
                                f = a.sigma ? a.sigma.oneInNDays >= 252 ? `1/${(a.sigma.oneInNDays/252).toFixed(1)}y` : a.sigma.oneInNDays >= 21 ? `1/${(a.sigma.oneInNDays/21).toFixed(1)}mo` : `1/${Math.round(a.sigma.oneInNDays)}d` : "—";
                            return e.jsxs("tr", {
                                className: "border-b border-border/50 hover:bg-muted/30 cursor-pointer",
                                onClick: () => Je(a.ticker),
                                "data-testid": `row-move-${a.ticker}`,
                                children: [e.jsx("td", {
                                    className: "py-1 pr-3 font-semibold",
                                    children: a.ticker
                                }), e.jsx("td", {
                                    className: "py-1 pr-3 text-muted-foreground truncate max-w-[200px]",
                                    children: a.name
                                }), e.jsx("td", {
                                    className: "py-1 pr-3 text-muted-foreground font-mono text-[10px]",
                                    children: a.date
                                }), e.jsx("td", {
                                    className: `py-1 pr-3 font-semibold ${N}`,
                                    children: Number.isFinite(a.pct) ? `${a.pct>0?"+":""}${a.pct.toFixed(2)}%` : "—"
                                }), e.jsx("td", {
                                    className: "py-1 pr-3",
                                    children: a.sigma ? e.jsxs("span", {
                                        className: `inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-semibold tabular-nums ${Ee(a.sigma.absZ)}`,
                                        children: [a.sigma.z >= 0 ? "+" : "", a.sigma.z.toFixed(2), "σ"]
                                    }) : "—"
                                }), e.jsx("td", {
                                    className: "py-1 pr-3 text-muted-foreground",
                                    children: R
                                }), e.jsx("td", {
                                    className: "py-1 pr-3 text-muted-foreground",
                                    children: f
                                }), e.jsx("td", {
                                    className: `py-1 pr-3 ${b}`,
                                    children: Number.isFinite(a.gap) ? `${a.gap>0?"+":""}${a.gap.toFixed(2)}%` : "—"
                                }), e.jsx("td", {
                                    className: "py-1 pr-3",
                                    children: a.gapSigma ? e.jsxs("span", {
                                        className: `inline-flex items-center px-1 py-0.5 rounded border text-[10px] font-semibold tabular-nums ${Ee(a.gapSigma.absZ)}`,
                                        children: [a.gapSigma.z >= 0 ? "+" : "", a.gapSigma.z.toFixed(2), "σ"]
                                    }) : "—"
                                })]
                            }, a.ticker)
                        })
                    })]
                })
            }) : e.jsxs("div", {
                className: "text-xs text-muted-foreground py-2",
                children: ["Click ", e.jsx("span", {
                    className: "font-semibold",
                    children: "Load moves"
                }), " to compute the latest daily move and sigma across ", t.length, " tickers."]
            })
        })]
    })
}

function $e(t, n) {
    const c = new Blob([n], {
            type: "text/csv;charset=utf-8"
        }),
        o = URL.createObjectURL(c),
        u = document.createElement("a");
    u.href = o, u.download = t, u.click(), URL.revokeObjectURL(o)
}
export {
    as as
    default
};