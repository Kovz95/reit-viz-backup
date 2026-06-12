import {
    c as je,
    r as h,
    d3 as ke,
    j as e,
    d4 as ve,
    d5 as vt,
    R as Z,
    d6 as yt,
    d7 as He,
    d8 as jt,
    d9 as kt,
    da as St,
    db as Rt,
    dc as Se,
    a as wt,
    bO as Ct,
    bP as Mt,
    e as At,
    g as Lt,
    h as Ft,
    b4 as Pt,
    bR as Xe,
    bi as le,
    bj as ce,
    bk as de,
    bl as ue,
    B as pe,
    z as Tt,
    a5 as Vt,
    Z as It,
    a4 as Bt,
    bm as Zt,
    bn as Ot,
    I as Gt
} from "./index-CsG73Aq_.js";
import {
    C as Dt
} from "./ClassificationFiltersWithSource-D7v4WOtR.js";
import {
    u as Wt
} from "./globalUniverse-DuqPcp2u.js";
import {
    u as _t
} from "./universeSignature-DAAu9BGh.js";
import {
    B as Ue
} from "./badge-CQ2SEXX0.js";
import {
    P as Xt
} from "./play-D7mVvggU.js";
import {
    S as Ut
} from "./square-DrnmFnpA.js";
import {
    E as Et
} from "./external-link-Cy9_YAtA.js";
import {
    A as zt
} from "./arrow-up-down-CNMI3GZb.js";
const $t = je("ShieldAlert", [
    ["path", {
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
        key: "oel41y"
    }],
    ["path", {
        d: "M12 8v4",
        key: "1got3b"
    }],
    ["path", {
        d: "M12 16h.01",
        key: "1drbdi"
    }]
]);
const Ht = je("ShieldCheck", [
    ["path", {
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
        key: "oel41y"
    }],
    ["path", {
        d: "m9 12 2 2 4-4",
        key: "dzmm74"
    }]
]);
const Yt = je("Shield", [
    ["path", {
        d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
        key: "oel41y"
    }]
]);
var Ye = "Toggle",
    Re = h.forwardRef((s, r) => {
        const {
            pressed: o,
            defaultPressed: a,
            onPressedChange: i,
            ...l
        } = s, [n, f] = ke({
            prop: o,
            onChange: i,
            defaultProp: a ?? !1,
            caller: Ye
        });
        return e.jsx(ve.button, {
            type: "button",
            "aria-pressed": n,
            "data-state": n ? "on" : "off",
            "data-disabled": s.disabled ? "" : void 0,
            ...l,
            ref: r,
            onClick: vt(s.onClick, () => {
                s.disabled || f(!n)
            })
        })
    });
Re.displayName = Ye;
var qe = Re,
    X = "ToggleGroup",
    [Ke] = St(X, [He]),
    Je = He(),
    we = Z.forwardRef((s, r) => {
        const {
            type: o,
            ...a
        } = s;
        if (o === "single") {
            const i = a;
            return e.jsx(qt, {
                ...i,
                ref: r
            })
        }
        if (o === "multiple") {
            const i = a;
            return e.jsx(Kt, {
                ...i,
                ref: r
            })
        }
        throw new Error(`Missing prop \`type\` expected on \`${X}\``)
    });
we.displayName = X;
var [Qe, et] = Ke(X), qt = Z.forwardRef((s, r) => {
    const {
        value: o,
        defaultValue: a,
        onValueChange: i = () => {},
        ...l
    } = s, [n, f] = ke({
        prop: o,
        defaultProp: a ?? "",
        onChange: i,
        caller: X
    });
    return e.jsx(Qe, {
        scope: s.__scopeToggleGroup,
        type: "single",
        value: Z.useMemo(() => n ? [n] : [], [n]),
        onItemActivate: f,
        onItemDeactivate: Z.useCallback(() => f(""), [f]),
        children: e.jsx(tt, {
            ...l,
            ref: r
        })
    })
}), Kt = Z.forwardRef((s, r) => {
    const {
        value: o,
        defaultValue: a,
        onValueChange: i = () => {},
        ...l
    } = s, [n, f] = ke({
        prop: o,
        defaultProp: a ?? [],
        onChange: i,
        caller: X
    }), d = Z.useCallback(p => f((c = []) => [...c, p]), [f]), b = Z.useCallback(p => f((c = []) => c.filter(y => y !== p)), [f]);
    return e.jsx(Qe, {
        scope: s.__scopeToggleGroup,
        type: "multiple",
        value: n,
        onItemActivate: d,
        onItemDeactivate: b,
        children: e.jsx(tt, {
            ...l,
            ref: r
        })
    })
});
we.displayName = X;
var [Jt, Qt] = Ke(X), tt = Z.forwardRef((s, r) => {
    const {
        __scopeToggleGroup: o,
        disabled: a = !1,
        rovingFocus: i = !0,
        orientation: l,
        dir: n,
        loop: f = !0,
        ...d
    } = s, b = Je(o), p = jt(n), c = {
        role: "group",
        dir: p,
        ...d
    };
    return e.jsx(Jt, {
        scope: o,
        rovingFocus: i,
        disabled: a,
        children: i ? e.jsx(kt, {
            asChild: !0,
            ...b,
            orientation: l,
            dir: p,
            loop: f,
            children: e.jsx(ve.div, {
                ...c,
                ref: r
            })
        }) : e.jsx(ve.div, {
            ...c,
            ref: r
        })
    })
}), ge = "ToggleGroupItem", st = Z.forwardRef((s, r) => {
    const o = et(ge, s.__scopeToggleGroup),
        a = Qt(ge, s.__scopeToggleGroup),
        i = Je(s.__scopeToggleGroup),
        l = o.value.includes(s.value),
        n = a.disabled || s.disabled,
        f = {
            ...s,
            pressed: l,
            disabled: n
        },
        d = Z.useRef(null);
    return a.rovingFocus ? e.jsx(yt, {
        asChild: !0,
        ...i,
        focusable: !n,
        active: l,
        ref: d,
        children: e.jsx(Ee, {
            ...f,
            ref: r
        })
    }) : e.jsx(Ee, {
        ...f,
        ref: r
    })
});
st.displayName = ge;
var Ee = Z.forwardRef((s, r) => {
        const {
            __scopeToggleGroup: o,
            value: a,
            ...i
        } = s, l = et(ge, o), n = {
            role: "radio",
            "aria-checked": s.pressed,
            "aria-pressed": void 0
        }, f = l.type === "single" ? n : void 0;
        return e.jsx(Re, {
            ...f,
            ...i,
            ref: r,
            onPressedChange: d => {
                d ? l.onItemActivate(a) : l.onItemDeactivate(a)
            }
        })
    }),
    at = we,
    rt = st;
const nt = Rt("inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 gap-2", {
        variants: {
            variant: {
                default: "bg-transparent",
                outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground"
            },
            size: {
                default: "h-10 px-3 min-w-10",
                sm: "h-9 px-2.5 min-w-9",
                lg: "h-11 px-5 min-w-11"
            }
        },
        defaultVariants: {
            variant: "default",
            size: "default"
        }
    }),
    es = h.forwardRef(({
        className: s,
        variant: r,
        size: o,
        ...a
    }, i) => e.jsx(qe, {
        ref: i,
        className: Se(nt({
            variant: r,
            size: o,
            className: s
        })),
        ...a
    }));
es.displayName = qe.displayName;
const ot = h.createContext({
        size: "default",
        variant: "default"
    }),
    it = h.forwardRef(({
        className: s,
        variant: r,
        size: o,
        children: a,
        ...i
    }, l) => e.jsx(at, {
        ref: l,
        className: Se("flex items-center justify-center gap-1", s),
        ...i,
        children: e.jsx(ot.Provider, {
            value: {
                variant: r,
                size: o
            },
            children: a
        })
    }));
it.displayName = at.displayName;
const ye = h.forwardRef(({
    className: s,
    children: r,
    variant: o,
    size: a,
    ...i
}, l) => {
    const n = h.useContext(ot);
    return e.jsx(rt, {
        ref: l,
        className: Se(nt({
            variant: n.variant || o,
            size: n.size || a
        }), s),
        ...i,
        children: r
    })
});
ye.displayName = rt.displayName;

function Ce(s) {
    if (s.length < 60) return null;
    let r = 0,
        o = 0,
        a = 0,
        i = 0;
    for (let x = 1; x < s.length; x++) {
        const v = s[x - 1],
            j = s[x] - s[x - 1];
        r += v, o += j, a += v * j, i += v * v
    }
    const l = s.length - 1;
    if (l < 30) return null;
    const n = r / l,
        f = o / l,
        d = i - l * n * n,
        b = a - l * n * f;
    if (d === 0) return null;
    const p = b / d;
    let c = 0;
    for (let x = 1; x < s.length; x++) {
        const v = p * s[x - 1],
            j = s[x] - s[x - 1];
        c += (j - v) ** 2
    }
    const k = Math.sqrt(c / Math.max(1, l - 1)) / Math.sqrt(d),
        N = k === 0 ? 0 : p / k;
    let C;
    N < -3.96 ? C = .01 : N < -3.37 ? C = .05 : N < -3.07 ? C = .1 : N < -2.57 ? C = .25 : C = .5;
    const A = 1 + p,
        M = A >= 1 || A <= 0 ? 1 / 0 : -Math.log(2) / Math.log(A);
    return {
        adfStat: Math.round(N * 100) / 100,
        pValue: C,
        halfLife: Math.round(M * 10) / 10
    }
}

function lt(s, r, o) {
    const a = Math.min(s.length, r.length);
    if (a < 60) return null;
    const i = Math.max(0, a - o),
        l = a - i;
    if (l < 60) return null;
    let n = 0,
        f = 0,
        d = 0,
        b = 0;
    for (let M = i; M < a; M++) {
        const x = Math.log(r[M].value),
            v = Math.log(s[M].value);
        n += x, f += v, d += x * v, b += x * x
    }
    const p = n / l,
        c = f / l,
        y = b - l * p * p,
        k = d - l * p * c;
    if (y === 0) return null;
    const N = k / y,
        C = c - N * p,
        A = [];
    for (let M = i; M < a; M++) A.push(Math.log(s[M].value) - (C + N * Math.log(r[M].value)));
    return A
}

function Me(s, r, o) {
    const a = Math.min(s.length, r.length);
    if (a < 60) return null;
    const i = Math.max(0, a - o);
    if (a - i < 60) return null;
    const n = [];
    for (let f = i; f < a; f++) {
        const d = s[f].value,
            b = r[f].value;
        if (!(d > 0) || !(b > 0)) return null;
        n.push(Math.log(d) - Math.log(b))
    }
    return n
}

function ts(s, r) {
    if (s.length < 5) return NaN;
    const o = Math.min(r, s.length),
        a = s.length - o;
    let i = 0,
        l = 0;
    for (let b = a; b < s.length; b++) i += s[b], l += s[b] * s[b];
    const n = i / o,
        f = l / o - n * n;
    if (f <= 0) return NaN;
    const d = Math.sqrt(f);
    return d === 0 ? NaN : (s[s.length - 1] - n) / d
}

function ss(s, r, o) {
    const a = lt(s, r, o);
    return a ? Ce(a) : null
}

function as(s, r, o) {
    const a = Math.min(s.length, r.length),
        i = Me(s, r, a);
    if (!i) return null;
    const l = Ce(i);
    if (!l) return null;
    const n = ts(i, o);
    return {
        ...l,
        currentZ: n
    }
}

function rs(s, r, o) {
    const a = Me(s, r, o);
    return a ? Ce(a) : null
}

function ns(s, r) {
    const o = Math.min(s.length, r.length);
    return o < 60 ? null : lt(s, r, o)
}

function os(s, r, o) {
    const a = Math.min(s.length, r.length);
    if (a < o + 30 || o < 30) return null;
    const i = new Array(a),
        l = new Array(a);
    for (let c = 0; c < a; c++) {
        const y = s[c].value,
            k = r[c].value;
        if (!(y > 0) || !(k > 0)) return null;
        i[c] = Math.log(y), l[c] = Math.log(k)
    }
    const n = new Array(a + 1).fill(0),
        f = new Array(a + 1).fill(0),
        d = new Array(a + 1).fill(0),
        b = new Array(a + 1).fill(0);
    for (let c = 0; c < a; c++) n[c + 1] = n[c] + l[c], f[c + 1] = f[c] + i[c], d[c + 1] = d[c] + l[c] * l[c], b[c + 1] = b[c] + l[c] * i[c];
    const p = new Array(a).fill(NaN);
    for (let c = o; c < a; c++) {
        const y = c - o,
            k = c,
            N = k - y,
            C = n[k] - n[y],
            A = f[k] - f[y],
            M = d[k] - d[y],
            x = b[k] - b[y],
            v = C / N,
            j = A / N,
            S = M - N * v * v,
            L = x - N * v * j;
        if (S <= 0) continue;
        const P = L / S,
            me = j - P * v;
        p[c] = i[c] - (me + P * l[c])
    }
    return p
}

function ze(s, r, o, a, i, l) {
    if (!s || s.length < r + 30 || !(o > 0)) return null;
    const n = s.length,
        f = new Array(n).fill(NaN);
    let d = 0,
        b = 0,
        p = -1;
    for (let x = 0; x < n; x++) {
        const v = s[x];
        if (Number.isFinite(v) ? (d += v, b += v * v) : p = x, x >= r) {
            const j = s[x - r];
            Number.isFinite(j) && (d -= j, b -= j * j)
        }
        if (x >= r - 1 && Number.isFinite(v) && p < x - r + 1) {
            const j = r,
                S = d / j,
                L = b / j - S * S;
            L > 1e-12 && (f[x] = (v - S) / Math.sqrt(L))
        }
    }
    const c = [];
    let y = !1,
        k = -1,
        N = 0;
    for (let x = r; x < n; x++) {
        const v = f[x - 1];
        if (y) {
            const j = f[x],
                S = x - k;
            let L = !1;
            if (Number.isFinite(j) && (N === -1 && j <= 0 || N === 1 && j >= 0 || Math.abs(j) >= a) && (L = !0), !L && S >= i && (L = !0), !L && x === n - 1 && (L = !0), L) {
                const P = N * (s[x] - s[k]) - l / 1e4;
                c.push(P), y = !1, k = -1, N = 0
            }
        } else {
            if (!Number.isFinite(v)) continue;
            v >= o ? (y = !0, N = -1, k = x) : v <= -o && (y = !0, N = 1, k = x)
        }
    }
    const C = c.length;
    if (C === 0) return {
        n: 0,
        winRate: NaN,
        avgPnL: NaN
    };
    let A = 0,
        M = 0;
    for (const x of c) x > 0 && A++, M += x;
    return {
        n: C,
        winRate: A / C,
        avgPnL: M / C
    }
}
const is = 60,
    ls = 52,
    cs = 8,
    ds = 52,
    $e = 8;

function vs() {
    const {
        filteredTickersList: s,
        isFiltered: r,
        totalCount: o,
        allTickers: a
    } = wt(), i = Ct(), [, l] = Mt(), [n, f] = h.useState("ols"), [d, b] = h.useState("universe"), [p, c] = h.useState(() => At()), [y, k] = h.useState(""), [N, C] = h.useState(() => new Set), [A, M] = h.useState("workbook"), {
        metas: x
    } = Wt(), v = 50, j = 2e3, [S, L] = h.useState(ds), [P, me] = h.useState(ls), [U, Ae] = h.useState(1500), [I, Le] = h.useState(.1), [te, Fe] = h.useState(5), [se, Pe] = h.useState(60), [W, Te] = h.useState(1.5), [ae, Ve] = h.useState(!1), [E, Ie] = h.useState(.55), [q, Be] = h.useState("rolling"), [K, Ze] = h.useState(252), [J, Oe] = h.useState(!1), [O, Ge] = h.useState({
        current: 0,
        total: 0
    }), [Q, fe] = h.useState([]), xe = h.useRef(!1), [z, De] = h.useState("pValue"), [re, be] = h.useState("asc"), ct = h.useCallback(() => {
        const t = {
            economy: Array.from(p.economy),
            sector: Array.from(p.sector),
            subsector: Array.from(p.subsector),
            industryGroup: Array.from(p.industryGroup),
            industry: Array.from(p.industry),
            subindustry: Array.from(p.subindustry)
        };
        return {
            model: n,
            scope: d,
            pcFiltersSer: t,
            pcClassSearch: y,
            pcManualTickersSer: Array.from(N),
            olsResidWindow: S,
            betaLookback: P,
            verifyDays: U,
            pMax: I,
            hlMin: te,
            hlMax: se,
            absZMin: W,
            stableOnly: ae,
            minWinRate: E,
            btResidMode: q,
            btRollingWindow: K,
            sortKey: z,
            sortDir: re,
            allResults: Q
        }
    }, [n, d, p, y, N, S, P, U, I, te, se, W, ae, E, q, K, z, re, Q]), dt = h.useCallback(t => {
        if (t) {
            if ((t.model === "ols" || t.model === "ratio") && f(t.model), (t.scope === "universe" || t.scope === "pairCombo") && b(t.scope), t.pcFiltersSer && typeof t.pcFiltersSer == "object") {
                const u = t.pcFiltersSer;
                c({
                    economy: new Set(Array.isArray(u.economy) ? u.economy : []),
                    sector: new Set(Array.isArray(u.sector) ? u.sector : []),
                    subsector: new Set(Array.isArray(u.subsector) ? u.subsector : []),
                    industryGroup: new Set(Array.isArray(u.industryGroup) ? u.industryGroup : []),
                    industry: new Set(Array.isArray(u.industry) ? u.industry : []),
                    subindustry: new Set(Array.isArray(u.subindustry) ? u.subindustry : [])
                })
            }
            typeof t.pcClassSearch == "string" && k(t.pcClassSearch), Array.isArray(t.pcManualTickersSer) && C(new Set(t.pcManualTickersSer)), typeof t.olsResidWindow == "number" && L(t.olsResidWindow), typeof t.betaLookback == "number" && me(t.betaLookback), typeof t.verifyDays == "number" && Ae(t.verifyDays), typeof t.pMax == "number" && Le(t.pMax), typeof t.hlMin == "number" && Fe(t.hlMin), typeof t.hlMax == "number" && Pe(t.hlMax), typeof t.absZMin == "number" && Te(t.absZMin), typeof t.stableOnly == "boolean" && Ve(t.stableOnly), typeof t.minWinRate == "number" && Ie(t.minWinRate), (t.btResidMode === "rolling" || t.btResidMode === "insample") && Be(t.btResidMode), typeof t.btRollingWindow == "number" && Ze(t.btRollingWindow), t.sortKey && De(t.sortKey), t.sortDir && be(t.sortDir), Array.isArray(t.allResults) && fe(t.allResults)
        }
    }, []), ut = _t();
    Lt("pair-screener", ct, dt, {
        universeSig: ut,
        resultFields: ["allResults"]
    });
    const ne = h.useMemo(() => p.economy.size + p.sector.size + p.subsector.size + p.industryGroup.size + p.industry.size + p.subindustry.size + N.size + (y.trim().length > 0 ? 1 : 0) === 0 ? [] : Ft(A === "global" ? x : a, p, y, N).map(g => g.ticker.toUpperCase()).filter((g, w, F) => F.indexOf(g) === w), [a, x, A, p, y, N]),
        B = h.useMemo(() => d === "pairCombo" ? ne : s.map(t => t.ticker), [d, ne, s]),
        oe = h.useMemo(() => {
            const t = B.length;
            return t * (t - 1) / 2
        }, [B]);
    h.useEffect(() => () => {
        xe.current = !0
    }, []);
    const mt = h.useCallback(async () => {
            if (B.length < 2) return;
            Oe(!0), fe([]), xe.current = !1;
            const t = [];
            e: for (let R = 0; R < B.length; R++)
                for (let g = R + 1; g < B.length; g++)
                    if (t.push([B[R], B[g]]), d === "pairCombo" && t.length >= j) break e;
            Ge({
                current: 0,
                total: t.length
            });
            const u = [];
            for (let R = 0; R < t.length && !xe.current; R += $e) {
                const g = t.slice(R, R + $e),
                    w = await Promise.all(g.map(async ([F, D]) => {
                        try {
                            const m = await Pt(F, D, "close", "close", is, P, cs, S),
                                he = W > 0 ? W : 1.5,
                                We = 3,
                                _e = 0;
                            if (n === "ols") {
                                if (!m.cointStats) return null;
                                const G = m.olsResidZ.length ? m.olsResidZ[m.olsResidZ.length - 1].value : NaN,
                                    T = ss(m.priceA, m.priceB, U),
                                    ie = q === "rolling" ? os(m.priceA, m.priceB, K) : ns(m.priceA, m.priceB),
                                    Y = m.cointStats.halfLife,
                                    Ne = Math.max(10, Math.min(60, Number.isFinite(Y) && Y > 0 ? Math.round(Y * 4) : 60)),
                                    V = ie ? ze(ie, S, he, We, Ne, _e) : null;
                                return {
                                    tickerA: F,
                                    tickerB: D,
                                    pValue: m.cointStats.pValue,
                                    adfStat: m.cointStats.adfStat,
                                    halfLife: m.cointStats.halfLife,
                                    hedgeRatio: m.cointStats.hedgeRatio,
                                    currentZ: Number.isFinite(G) ? G : NaN,
                                    pValueRecent: T ? T.pValue : .5,
                                    adfStatRecent: T ? T.adfStat : NaN,
                                    halfLifeRecent: T ? T.halfLife : 1 / 0,
                                    backtestN: V ? V.n : 0,
                                    backtestWinRate: V ? V.winRate : NaN,
                                    backtestAvgPnL: V ? V.avgPnL : NaN
                                }
                            } else {
                                const G = as(m.priceA, m.priceB, S);
                                if (!G) return null;
                                const T = rs(m.priceA, m.priceB, U),
                                    ie = Me(m.priceA, m.priceB, Math.min(m.priceA.length, m.priceB.length)),
                                    Y = G.halfLife,
                                    Ne = Math.max(10, Math.min(60, Number.isFinite(Y) && Y > 0 ? Math.round(Y * 4) : 60)),
                                    V = ie ? ze(ie, S, he, We, Ne, _e) : null;
                                return {
                                    tickerA: F,
                                    tickerB: D,
                                    pValue: G.pValue,
                                    adfStat: G.adfStat,
                                    halfLife: G.halfLife,
                                    hedgeRatio: 1,
                                    currentZ: Number.isFinite(G.currentZ) ? G.currentZ : NaN,
                                    pValueRecent: T ? T.pValue : .5,
                                    adfStatRecent: T ? T.adfStat : NaN,
                                    halfLifeRecent: T ? T.halfLife : 1 / 0,
                                    backtestN: V ? V.n : 0,
                                    backtestWinRate: V ? V.winRate : NaN,
                                    backtestAvgPnL: V ? V.avgPnL : NaN
                                }
                            }
                        } catch {
                            return null
                        }
                    }));
                for (const F of w) F && u.push(F);
                Ge({
                    current: Math.min(R + g.length, t.length),
                    total: t.length
                }), fe([...u]), await new Promise(F => setTimeout(F, 0))
            }
            Oe(!1)
        }, [B, P, S, U, n, W, q, K, d]),
        ft = h.useCallback(() => {
            xe.current = !0
        }, []),
        ee = h.useMemo(() => {
            const t = Q.filter(g => !(!Number.isFinite(g.pValue) || g.pValue > I || !Number.isFinite(g.halfLife) || g.halfLife < te || g.halfLife > se || !Number.isFinite(g.currentZ) || Math.abs(g.currentZ) < W || ae && (!Number.isFinite(g.pValueRecent) || g.pValueRecent > I) || Number.isFinite(E) && E > 0 && (!Number.isFinite(g.backtestWinRate) || g.backtestN < 5 || g.backtestWinRate < E))),
                u = re === "asc" ? 1 : -1;
            return [...t].sort((g, w) => {
                switch (z) {
                    case "pValue":
                        return (g.pValue - w.pValue) * u;
                    case "pValueRecent":
                        return (g.pValueRecent - w.pValueRecent) * u;
                    case "halfLife":
                        return (g.halfLife - w.halfLife) * u;
                    case "absZ":
                        return (Math.abs(g.currentZ) - Math.abs(w.currentZ)) * u;
                    case "hedgeRatio":
                        return (g.hedgeRatio - w.hedgeRatio) * u;
                    case "backtestWinRate": {
                        const F = Number.isFinite(g.backtestWinRate) ? g.backtestWinRate : -1 / 0,
                            D = Number.isFinite(w.backtestWinRate) ? w.backtestWinRate : -1 / 0;
                        return (F - D) * u
                    }
                    case "ticker":
                        return (g.tickerA + "/" + g.tickerB).localeCompare(w.tickerA + "/" + w.tickerB) * u;
                    default:
                        return 0
                }
            })
        }, [Q, I, te, se, W, ae, E, z, re]),
        $ = h.useCallback(t => {
            t === z ? be(u => u === "asc" ? "desc" : "asc") : (De(t), be(t === "absZ" || t === "hedgeRatio" || t === "backtestWinRate" ? "desc" : "asc"))
        }, [z]),
        H = t => z !== t ? e.jsx(zt, {
            className: "w-3 h-3 opacity-40"
        }) : re === "asc" ? e.jsx(Zt, {
            className: "w-3 h-3"
        }) : e.jsx(Ot, {
            className: "w-3 h-3"
        }),
        xt = h.useCallback((t, u) => {
            const R = i.getCachedState("pairs") || {};
            i.pushState("pairs", {
                ...R,
                tickerA: t,
                tickerB: u,
                metricA: "close",
                metricB: "close",
                olsResidWindow: S,
                betaLookback: P
            }), l("/pairs")
        }, [i, l, S, P]),
        ht = h.useCallback(() => {
            const u = `Ticker A,Ticker B,Model,Coint p (full),ADF (full),Coint p (recent),ADF (recent),Half-Life (d),Half-Life Recent (d),Hedge Ratio,${n==="ols"?"Current OLS Z":"Current Ratio Z"},Stable,BT Trades,BT Win%,BT Avg P&L (bps)`,
                R = ee.map(m => {
                    const he = m.pValue <= I && m.pValueRecent <= I ? "YES" : "NO";
                    return [m.tickerA, m.tickerB, n === "ols" ? "OLS" : "Ratio", m.pValue, m.adfStat, m.pValueRecent, Number.isFinite(m.adfStatRecent) ? m.adfStatRecent : "", m.halfLife, Number.isFinite(m.halfLifeRecent) ? m.halfLifeRecent : "Inf", m.hedgeRatio, Number.isFinite(m.currentZ) ? m.currentZ.toFixed(2) : "", he, m.backtestN, Number.isFinite(m.backtestWinRate) ? (m.backtestWinRate * 100).toFixed(1) : "", Number.isFinite(m.backtestAvgPnL) ? (m.backtestAvgPnL * 1e4).toFixed(1) : ""].join(",")
                }),
                g = [u, ...R].join(`
`),
                w = new Blob([g], {
                    type: "text/csv"
                }),
                F = URL.createObjectURL(w),
                D = document.createElement("a");
            D.href = F, D.download = `pair_screener_${new Date().toISOString().slice(0,10)}.csv`, D.click(), URL.revokeObjectURL(F)
        }, [ee, I, n]),
        pt = (t, u) => !Number.isFinite(t) || u < 5 ? "text-muted-foreground" : t >= .65 ? "text-emerald-400" : t >= .55 ? "text-green-400" : t >= .45 ? "text-yellow-400" : "text-red-400",
        gt = t => t <= .01 ? "text-emerald-400" : t <= .05 ? "text-green-400" : t <= .1 ? "text-yellow-400" : "text-muted-foreground",
        bt = t => {
            const u = Math.abs(t);
            return Number.isFinite(t) ? u >= 2.5 ? "text-red-400" : u >= 2 ? "text-orange-400" : u >= 1.5 ? "text-yellow-400" : "text-muted-foreground" : "text-muted-foreground"
        };
    return e.jsxs("div", {
        className: "flex flex-col h-full overflow-hidden",
        children: [e.jsxs("div", {
            className: "flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border bg-card/50 flex-shrink-0",
            children: [e.jsxs("div", {
                className: "flex items-center gap-1.5 text-sm font-semibold",
                children: [e.jsx(Xe, {
                    className: "w-4 h-4 text-primary"
                }), "Pairs Cointegration Screener"]
            }), e.jsx(le, {
                delayDuration: 200,
                children: e.jsxs(ce, {
                    children: [e.jsx(de, {
                        asChild: !0,
                        children: e.jsx("div", {
                            children: e.jsxs(it, {
                                type: "single",
                                value: n,
                                onValueChange: t => {
                                    (t === "ols" || t === "ratio") && (f(t), fe([]))
                                },
                                className: "h-7",
                                "data-testid": "screener-model",
                                children: [e.jsx(ye, {
                                    value: "ols",
                                    "aria-label": "OLS Residual Z",
                                    className: "h-7 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
                                    "data-testid": "screener-model-ols",
                                    children: "OLS Z"
                                }), e.jsx(ye, {
                                    value: "ratio",
                                    "aria-label": "Raw Log-Ratio",
                                    className: "h-7 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
                                    "data-testid": "screener-model-ratio",
                                    children: "Raw Ratio"
                                })]
                            })
                        })
                    }), e.jsxs(ue, {
                        side: "bottom",
                        className: "max-w-xs text-xs leading-relaxed",
                        children: [e.jsx("div", {
                            className: "font-semibold mb-1",
                            children: "Cointegration model"
                        }), e.jsxs("div", {
                            className: "mb-1",
                            children: [e.jsx("span", {
                                className: "font-mono",
                                children: "OLS Z"
                            }), ": log(A) = α + β·log(B) + ε; tests ε stationarity. β estimated. β-weighted hedge."]
                        }), e.jsxs("div", {
                            children: [e.jsx("span", {
                                className: "font-mono",
                                children: "Raw Ratio"
                            }), ": tests stationarity of log(A) − log(B) directly. β = 1 (equal-dollar long/short). Stricter test — only finds 1:1 cointegration."]
                        })]
                    })]
                })
            }), e.jsxs("div", {
                className: "flex items-center gap-1",
                "data-testid": "screener-scope-toggle",
                children: [e.jsx("span", {
                    className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                    children: "Scope"
                }), e.jsx("button", {
                    "data-testid": "screener-scope-universe",
                    onClick: () => b("universe"),
                    disabled: J,
                    className: `text-[10px] font-mono font-bold px-2 py-1 rounded ${d==="universe"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                    title: "Use the global Universe filter",
                    children: "Universe"
                }), e.jsx("button", {
                    "data-testid": "screener-scope-paircombo",
                    onClick: () => b("pairCombo"),
                    disabled: J,
                    className: `text-[10px] font-mono font-bold px-2 py-1 rounded ${d==="pairCombo"?"bg-primary text-primary-foreground":"bg-background text-muted-foreground hover:text-foreground border border-border"}`,
                    title: "Build a custom leg-set without changing the global Universe",
                    children: "Pair combo"
                })]
            }), e.jsxs("div", {
                className: "flex items-center gap-1.5 text-xs",
                children: [d === "universe" ? e.jsx(Ue, {
                    variant: r ? "default" : "secondary",
                    className: "font-mono",
                    children: r ? "Universe filter ON" : "All tickers"
                }) : e.jsx(Ue, {
                    variant: "default",
                    className: "font-mono",
                    "data-testid": "screener-paircombo-badge",
                    children: "Pair combo"
                }), e.jsxs("span", {
                    className: "text-muted-foreground font-mono",
                    children: [B.length, " tickers · ", oe.toLocaleString(), " pairs", d === "pairCombo" && oe > j && e.jsxs("span", {
                        className: "text-amber-400 ml-1",
                        children: ["(capped at ", j.toLocaleString(), ")"]
                    })]
                }), d === "universe" && !r && o > 50 && e.jsx("span", {
                    className: "text-amber-400 text-[11px]",
                    children: "(tip: filter the Universe to keep this fast)"
                }), d === "pairCombo" && oe >= v && e.jsx("span", {
                    className: "text-amber-400 text-[11px]",
                    title: "Each pair is a full cointegration + ADF test. Large scans take a while.",
                    children: "⚠ large scan"
                })]
            }), e.jsx("div", {
                className: "flex-1"
            }), J ? e.jsxs(pe, {
                size: "sm",
                variant: "destructive",
                onClick: ft,
                "data-testid": "screener-cancel",
                children: [e.jsx(Ut, {
                    className: "w-3 h-3 mr-1"
                }), " Cancel (", O.current, "/", O.total, ")"]
            }) : e.jsxs(pe, {
                size: "sm",
                onClick: mt,
                disabled: B.length < 2,
                "data-testid": "screener-run",
                children: [e.jsx(Xt, {
                    className: "w-3 h-3 mr-1"
                }), " Run Screen"]
            }), e.jsxs(pe, {
                size: "sm",
                variant: "outline",
                onClick: ht,
                disabled: ee.length === 0,
                "data-testid": "screener-csv",
                children: [e.jsx(Tt, {
                    className: "w-3 h-3 mr-1"
                }), " CSV"]
            })]
        }), d === "pairCombo" && e.jsxs("div", {
            className: "flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-card/10 flex-shrink-0",
            children: [e.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider mr-1",
                children: "Pair legs"
            }), e.jsx(Dt, {
                workbookTickers: a,
                filters: p,
                onFiltersChange: c,
                search: y,
                onSearchChange: k,
                manualTickers: N,
                onManualTickersChange: C,
                filteredCount: ne.length,
                totalCount: a.length,
                testIdPrefix: "screener-paircombo-filter",
                source: A,
                onSourceChange: M
            }), e.jsx("span", {
                className: "text-[10px] font-mono text-muted-foreground ml-auto",
                children: ne.length < 2 ? e.jsx(e.Fragment, {
                    children: "Pick at least two legs to generate pairs."
                }) : e.jsxs(e.Fragment, {
                    children: [ne.length, " legs → ", e.jsx("span", {
                        className: "text-cyan-400 font-bold",
                        children: Math.min(oe, j).toLocaleString()
                    }), " unordered pairs (A/B == B/A)"]
                })
            })]
        }), e.jsxs("div", {
            className: "flex flex-wrap items-end gap-x-4 gap-y-2 px-3 py-2 border-b border-border bg-card/30 flex-shrink-0 text-xs",
            children: [e.jsx(_, {
                label: "OLS Resid Window",
                value: S,
                onChange: L,
                min: 20,
                max: 520,
                testId: "screener-ols-window"
            }), e.jsx(_, {
                label: "Beta Lookback",
                value: P,
                onChange: me,
                min: 20,
                max: 520,
                testId: "screener-beta-lookback"
            }), e.jsx(_, {
                label: "Verify Window (d)",
                value: U,
                onChange: Ae,
                min: 252,
                max: 4e3,
                testId: "screener-verifydays"
            }), e.jsx("div", {
                className: "h-7 w-px bg-border mx-1"
            }), e.jsxs("div", {
                className: "flex items-center gap-1 text-muted-foreground",
                children: [e.jsx(Vt, {
                    className: "w-3 h-3"
                }), "Tradeable composite filters:"]
            }), e.jsx(_, {
                label: "Coint p ≤",
                value: I,
                onChange: Le,
                step: .01,
                min: .01,
                max: .5,
                testId: "screener-pmax"
            }), e.jsx(_, {
                label: "Half-Life min (d)",
                value: te,
                onChange: Fe,
                min: 1,
                max: 500,
                testId: "screener-hlmin"
            }), e.jsx(_, {
                label: "Half-Life max (d)",
                value: se,
                onChange: Pe,
                min: 1,
                max: 500,
                testId: "screener-hlmax"
            }), e.jsx(_, {
                label: "|Z| ≥",
                value: W,
                onChange: Te,
                step: .1,
                min: 0,
                max: 5,
                testId: "screener-absz"
            }), e.jsx("div", {
                className: "h-7 w-px bg-border mx-1"
            }), e.jsx(le, {
                delayDuration: 200,
                children: e.jsxs(ce, {
                    children: [e.jsx(de, {
                        asChild: !0,
                        children: e.jsx("div", {
                            children: e.jsx(_, {
                                label: "Min Win %",
                                value: Math.round(E * 100),
                                onChange: t => Ie(Math.max(0, Math.min(100, t)) / 100),
                                step: 1,
                                min: 0,
                                max: 100,
                                testId: "screener-min-winrate"
                            })
                        })
                    }), e.jsxs(ue, {
                        side: "bottom",
                        className: "max-w-xs text-xs leading-relaxed",
                        children: [e.jsx("div", {
                            className: "font-semibold mb-1",
                            children: "Real-P&L backtest filter"
                        }), e.jsx("div", {
                            children: "Simulates entries on every historical |Z| crossing of the threshold above, exits at Z=0 (TP), |Z|≥3 (stop), or 4×half-life bars (max 60). Only pairs whose historical trades produced a (gross) win rate ≥ this threshold will pass. Set to 0 to disable (stats still computed for display). Requires ≥5 completed trades. No transaction costs applied."
                        })]
                    })]
                })
            }), e.jsx("div", {
                className: "h-7 w-px bg-border mx-1"
            }), e.jsx(le, {
                delayDuration: 200,
                children: e.jsxs(ce, {
                    children: [e.jsx(de, {
                        asChild: !0,
                        children: e.jsxs("div", {
                            className: "flex items-center gap-2",
                            children: [e.jsx(It, {
                                checked: ae,
                                onCheckedChange: Ve,
                                "data-testid": "screener-stable-only"
                            }), e.jsx("span", {
                                className: "text-muted-foreground select-none",
                                children: "Stable only"
                            })]
                        })
                    }), e.jsxs(ue, {
                        side: "bottom",
                        className: "max-w-xs text-xs leading-relaxed",
                        children: ["Show only pairs cointegrated at p ≤ pMax on BOTH the full sample AND the recent ", U, "-day window. Filters out pairs whose long-run cointegration is dragged down by stale historical regimes."]
                    })]
                })
            }), e.jsx("div", {
                className: "h-7 w-px bg-border mx-1"
            }), e.jsx(le, {
                delayDuration: 200,
                children: e.jsxs(ce, {
                    children: [e.jsx(de, {
                        asChild: !0,
                        children: e.jsxs("div", {
                            className: "flex items-center gap-2",
                            children: [e.jsx("span", {
                                className: "text-muted-foreground select-none",
                                children: "BT β:"
                            }), e.jsxs("select", {
                                value: q,
                                onChange: t => Be(t.target.value),
                                className: "h-7 px-2 text-xs bg-background border border-border rounded",
                                "data-testid": "screener-bt-resid-mode",
                                children: [e.jsx("option", {
                                    value: "rolling",
                                    children: "Rolling (OOS)"
                                }), e.jsx("option", {
                                    value: "insample",
                                    children: "Full-sample (in-sample)"
                                })]
                            }), q === "rolling" && e.jsx("input", {
                                type: "number",
                                min: 60,
                                max: 1500,
                                step: 20,
                                value: K,
                                onChange: t => {
                                    const u = parseInt(t.target.value, 10);
                                    Number.isFinite(u) && u >= 60 && u <= 1500 && Ze(u)
                                },
                                className: "h-7 w-16 px-2 text-xs bg-background border border-border rounded",
                                "data-testid": "screener-bt-rolling-window",
                                title: "Rolling β window (bars)"
                            })]
                        })
                    }), e.jsxs(ue, {
                        side: "bottom",
                        className: "max-w-sm text-xs leading-relaxed",
                        children: [e.jsx("strong", {
                            children: "Backtest hedge ratio (β) estimation:"
                        }), e.jsx("br", {}), e.jsx("strong", {
                            children: "Rolling (default)"
                        }), ": β estimated at each bar using only the prior ", K, "-bar window — strict backward-looking, no look-ahead bias. Win rates and avg P&L are out-of-sample-honest.", e.jsx("br", {}), e.jsx("strong", {
                            children: "Full-sample"
                        }), ': β estimated once on the entire price history. Matches the ADF cointegration test exactly, but the backtest "knows" the optimal hedge ratio at each historical entry. Useful for comparison against the legacy behavior.']
                    })]
                })
            })]
        }), J && e.jsxs("div", {
            className: "px-3 py-1.5 border-b border-border bg-card/40 flex-shrink-0",
            children: [e.jsxs("div", {
                className: "flex items-center gap-2 text-xs text-muted-foreground",
                children: [e.jsx(Bt, {
                    className: "w-3 h-3 animate-spin"
                }), e.jsxs("span", {
                    className: "font-mono",
                    children: ["Scanning ", O.current.toLocaleString(), " / ", O.total.toLocaleString(), " pairs"]
                }), e.jsxs("span", {
                    className: "font-mono text-foreground",
                    children: [O.total > 0 ? (O.current / O.total * 100).toFixed(1) : "0.0", "%"]
                })]
            }), e.jsx("div", {
                className: "h-1 bg-muted rounded mt-1 overflow-hidden",
                children: e.jsx("div", {
                    className: "h-full bg-primary transition-all duration-200",
                    style: {
                        width: `${O.total>0?O.current/O.total*100:0}%`
                    }
                })
            })]
        }), e.jsx("div", {
            className: "flex-1 overflow-auto",
            children: Q.length === 0 && !J ? e.jsx("div", {
                className: "flex items-center justify-center h-full text-muted-foreground text-sm",
                children: e.jsxs("div", {
                    className: "text-center max-w-md p-6",
                    children: [e.jsx(Xe, {
                        className: "w-8 h-8 mx-auto mb-3 opacity-50"
                    }), e.jsx("div", {
                        className: "font-semibold text-foreground mb-1",
                        children: "No screen run yet"
                    }), e.jsxs("div", {
                        className: "text-xs leading-relaxed",
                        children: ["The screener iterates every unordered pair from the active Universe (currently", " ", e.jsx("span", {
                            className: "font-mono text-foreground",
                            children: B.length
                        }), " ", "tickers · ", e.jsx("span", {
                            className: "font-mono text-foreground",
                            children: oe.toLocaleString()
                        }), " ", "pairs), runs an Engle-Granger ADF test on the", n === "ols" ? " OLS residuals (log A vs log B), with an estimated hedge ratio," : " raw log-ratio (log A − log B), forcing a 1:1 hedge,", " ", "and ranks pairs that are cointegrated, mean-revert quickly, and are currently dislocated.", e.jsx("br", {}), e.jsx("br", {}), "Tip: shape the universe on the Universe tab first."]
                    })]
                })
            }) : e.jsxs("table", {
                className: "w-full text-xs font-mono",
                children: [e.jsx("thead", {
                    className: "sticky top-0 bg-card border-b border-border z-10",
                    children: e.jsxs("tr", {
                        className: "text-left text-muted-foreground",
                        children: [e.jsx("th", {
                            className: "px-3 py-2 cursor-pointer hover:text-foreground",
                            onClick: () => $("ticker"),
                            children: e.jsxs("div", {
                                className: "flex items-center gap-1",
                                children: ["Pair ", H("ticker")]
                            })
                        }), e.jsx("th", {
                            className: "px-3 py-2 cursor-pointer hover:text-foreground",
                            onClick: () => $("pValue"),
                            children: e.jsxs("div", {
                                className: "flex items-center gap-1",
                                children: ["Coint p ", H("pValue")]
                            })
                        }), e.jsx("th", {
                            className: "px-3 py-2",
                            children: "ADF"
                        }), e.jsx("th", {
                            className: "px-3 py-2 cursor-pointer hover:text-foreground",
                            onClick: () => $("halfLife"),
                            children: e.jsxs("div", {
                                className: "flex items-center gap-1",
                                children: ["Half-Life (d) ", H("halfLife")]
                            })
                        }), e.jsx("th", {
                            className: "px-3 py-2 cursor-pointer hover:text-foreground",
                            onClick: () => $("hedgeRatio"),
                            children: e.jsxs("div", {
                                className: "flex items-center gap-1",
                                children: ["Hedge β", n === "ratio" && e.jsx("span", {
                                    className: "text-muted-foreground/60",
                                    children: "(=1)"
                                }), " ", H("hedgeRatio")]
                            })
                        }), e.jsx("th", {
                            className: "px-3 py-2 cursor-pointer hover:text-foreground",
                            onClick: () => $("absZ"),
                            children: e.jsxs("div", {
                                className: "flex items-center gap-1",
                                children: [n === "ols" ? "Current OLS Z" : "Current Ratio Z", " ", H("absZ")]
                            })
                        }), e.jsx("th", {
                            className: "px-3 py-2 cursor-pointer hover:text-foreground",
                            onClick: () => $("backtestWinRate"),
                            children: e.jsx(le, {
                                delayDuration: 200,
                                children: e.jsxs(ce, {
                                    children: [e.jsx(de, {
                                        asChild: !0,
                                        children: e.jsxs("div", {
                                            className: "flex items-center gap-1",
                                            children: ["BT Win% ", H("backtestWinRate")]
                                        })
                                    }), e.jsxs(ue, {
                                        side: "bottom",
                                        className: "max-w-xs text-xs leading-relaxed",
                                        children: ["Real-P&L backtest: historical |Z| entries on the cointegrating series, with the same entry threshold, exits, and costs you set above. Format: ", e.jsx("span", {
                                            className: "font-mono",
                                            children: "N · win%"
                                        }), "."]
                                    })]
                                })
                            })
                        }), e.jsx("th", {
                            className: "px-3 py-2 cursor-pointer hover:text-foreground",
                            onClick: () => $("pValueRecent"),
                            children: e.jsxs("div", {
                                className: "flex items-center gap-1",
                                children: ["Stability ", H("pValueRecent")]
                            })
                        }), e.jsx("th", {
                            className: "px-3 py-2"
                        })]
                    })
                }), e.jsx("tbody", {
                    children: ee.length === 0 ? e.jsx("tr", {
                        children: e.jsx("td", {
                            colSpan: 9,
                            className: "px-3 py-8 text-center text-muted-foreground",
                            children: J ? e.jsx("span", {
                                children: "Scanning… filters will populate once results arrive."
                            }) : e.jsx("span", {
                                children: "No pairs pass the current composite filters. Try loosening p, half-life, or |Z| thresholds."
                            })
                        })
                    }) : ee.map(t => {
                        const u = `${t.tickerA}-${t.tickerB}`;
                        return e.jsxs("tr", {
                            className: "border-b border-border/40 hover:bg-accent/40",
                            "data-testid": `screener-row-${u}`,
                            children: [e.jsxs("td", {
                                className: "px-3 py-1.5",
                                children: [e.jsx("span", {
                                    className: "text-foreground font-semibold",
                                    children: t.tickerA
                                }), e.jsx("span", {
                                    className: "text-muted-foreground mx-1",
                                    children: "/"
                                }), e.jsx("span", {
                                    className: "text-foreground font-semibold",
                                    children: t.tickerB
                                })]
                            }), e.jsx("td", {
                                className: `px-3 py-1.5 ${gt(t.pValue)}`,
                                children: t.pValue.toFixed(2)
                            }), e.jsx("td", {
                                className: "px-3 py-1.5 text-muted-foreground",
                                children: t.adfStat.toFixed(2)
                            }), e.jsx("td", {
                                className: "px-3 py-1.5 text-foreground",
                                children: Number.isFinite(t.halfLife) ? t.halfLife.toFixed(1) : "∞"
                            }), e.jsx("td", {
                                className: `px-3 py-1.5 ${n==="ratio"?"text-muted-foreground/50":"text-muted-foreground"}`,
                                children: t.hedgeRatio.toFixed(3)
                            }), e.jsx("td", {
                                className: `px-3 py-1.5 font-semibold ${bt(t.currentZ)}`,
                                children: Number.isFinite(t.currentZ) ? t.currentZ.toFixed(2) : "—"
                            }), e.jsx("td", {
                                className: "px-3 py-1.5",
                                children: t.backtestN > 0 && Number.isFinite(t.backtestWinRate) ? e.jsxs("div", {
                                    className: "flex items-center gap-1.5",
                                    children: [e.jsx("span", {
                                        className: "text-muted-foreground/80",
                                        children: t.backtestN
                                    }), e.jsx("span", {
                                        className: "text-muted-foreground/60",
                                        children: "·"
                                    }), e.jsxs("span", {
                                        className: `font-semibold ${pt(t.backtestWinRate,t.backtestN)}`,
                                        children: [(t.backtestWinRate * 100).toFixed(0), "%"]
                                    }), Number.isFinite(t.backtestAvgPnL) && e.jsxs("span", {
                                        className: "text-muted-foreground/60 text-[10px]",
                                        children: ["(", (t.backtestAvgPnL * 1e4).toFixed(0), "bps)"]
                                    })]
                                }) : e.jsx("span", {
                                    className: "text-muted-foreground",
                                    children: "—"
                                })
                            }), e.jsx("td", {
                                className: "px-3 py-1.5",
                                children: (() => {
                                    const R = t.pValue <= I,
                                        g = t.pValueRecent <= I,
                                        w = Number.isFinite(t.pValueRecent) ? t.pValueRecent.toFixed(2) : "—";
                                    return R && g ? e.jsxs("div", {
                                        className: "flex items-center gap-1.5",
                                        children: [e.jsx(Ht, {
                                            className: "w-3.5 h-3.5 text-emerald-500"
                                        }), e.jsx("span", {
                                            className: "text-emerald-500",
                                            children: w
                                        })]
                                    }) : R && !g ? e.jsxs("div", {
                                        className: "flex items-center gap-1.5",
                                        children: [e.jsx($t, {
                                            className: "w-3.5 h-3.5 text-amber-500"
                                        }), e.jsx("span", {
                                            className: "text-amber-500",
                                            children: w
                                        })]
                                    }) : e.jsxs("div", {
                                        className: "flex items-center gap-1.5",
                                        children: [e.jsx(Yt, {
                                            className: "w-3.5 h-3.5 text-muted-foreground"
                                        }), e.jsx("span", {
                                            className: "text-muted-foreground",
                                            children: w
                                        })]
                                    })
                                })()
                            }), e.jsx("td", {
                                className: "px-3 py-1.5 text-right",
                                children: e.jsxs(pe, {
                                    size: "sm",
                                    variant: "ghost",
                                    className: "h-6 px-2 text-xs",
                                    onClick: () => xt(t.tickerA, t.tickerB),
                                    "data-testid": `screener-view-${u}`,
                                    children: ["View ", e.jsx(Et, {
                                        className: "w-3 h-3 ml-1"
                                    })]
                                })
                            })]
                        }, u)
                    })
                })]
            })
        }), e.jsxs("div", {
            className: "border-t border-border px-3 py-1.5 text-[11px] font-mono text-muted-foreground bg-card/40 flex items-center gap-4 flex-shrink-0",
            children: [e.jsxs("span", {
                children: ["Total scanned: ", e.jsx("span", {
                    className: "text-foreground",
                    children: Q.length.toLocaleString()
                })]
            }), e.jsxs("span", {
                children: ["Passing filters:", " ", e.jsx("span", {
                    className: "text-foreground",
                    children: ee.length.toLocaleString()
                })]
            }), e.jsxs("span", {
                className: "text-muted-foreground/60",
                children: ["Model: ", n === "ols" ? "OLS Residual Z" : "Raw Log-Ratio (β=1)", " · OLS resid ", S, "d · β-lookback ", P, "d · MacKinnon CV (1%/5%/10% = -3.96/-3.37/-3.07)"]
            })]
        })]
    })
}

function _({
    label: s,
    value: r,
    onChange: o,
    min: a,
    max: i,
    step: l = 1,
    testId: n
}) {
    return e.jsxs("label", {
        className: "flex flex-col gap-0.5",
        children: [e.jsx("span", {
            className: "text-[10px] uppercase tracking-wide text-muted-foreground",
            children: s
        }), e.jsx(Gt, {
            type: "number",
            value: r,
            min: a,
            max: i,
            step: l,
            onChange: f => {
                const d = parseFloat(f.target.value);
                Number.isNaN(d) || o(d)
            },
            className: "h-7 w-24 text-xs font-mono",
            "data-testid": n
        })]
    })
}
export {
    vs as
    default
};