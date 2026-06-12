import {
    a as Fe,
    ag as Y,
    r as K,
    g as ye,
    af as Se,
    ae as Me,
    a3 as le,
    j as e,
    B as te,
    I as z,
    a5 as Re,
    o as ce,
    p as oe,
    q as de,
    t as he,
    v as W,
    Z as Be,
    a4 as Ce,
    z as Pe
} from "./index-CsG73Aq_.js";
import {
    s as Te
} from "./driverScan-BlD7pNfH.js";
import {
    P as Ee
} from "./play-D7mVvggU.js";
const je = [{
        key: "P/AFFO FY2",
        label: "P/AFFO FY2",
        family: "valuation",
        direction: -1
    }, {
        key: "P/FFO FY2",
        label: "P/FFO FY2",
        family: "valuation",
        direction: -1
    }, {
        key: "EV/EBITDA FY2",
        label: "EV/EBITDA FY2",
        family: "valuation",
        direction: -1
    }, {
        key: "Implied Cap Rate",
        label: "Implied Cap Rate",
        family: "valuation",
        direction: 1
    }, {
        key: "AFFO Yield FY2",
        label: "AFFO Yield FY2",
        family: "valuation",
        direction: 1
    }, {
        key: "Dividend Yield",
        label: "Dividend Yield",
        family: "valuation",
        direction: 1
    }, {
        key: "FY2 AFFO Growth",
        label: "FY2 AFFO Growth",
        family: "growth",
        direction: 1
    }, {
        key: "FY1 AFFO Growth",
        label: "FY1 AFFO Growth",
        family: "growth",
        direction: 1
    }, {
        key: "FY2 FFO Growth",
        label: "FY2 FFO Growth",
        family: "growth",
        direction: 1
    }, {
        key: "FY2 EPS Growth",
        label: "FY2 EPS Growth",
        family: "growth",
        direction: 1
    }, {
        key: "1M Price Chg%",
        label: "1M Momentum",
        family: "technical",
        direction: 1
    }, {
        key: "3M Price Chg%",
        label: "3M Momentum",
        family: "technical",
        direction: 1
    }, {
        key: "6M Price Chg%",
        label: "6M Momentum",
        family: "technical",
        direction: 1
    }, {
        key: "% off 52wk High",
        label: "% off 52wk High",
        family: "technical",
        direction: 1
    }, {
        key: "Beta 10Y",
        label: "Beta to 10Y",
        family: "macro",
        direction: -1
    }, {
        key: "Beta BBB",
        label: "Beta to BBB Spread",
        family: "macro",
        direction: -1
    }],
    ve = Object.fromEntries(je.map(t => [t.key, t]));

function X(t, r) {
    const n = t.map(() => {
        const s = new Float64Array(r.length);
        return s.fill(NaN), s
    });
    return {
        tickers: t,
        dates: r,
        matrix: n
    }
}

function xe(t, r, n) {
    const s = new Map;
    for (let i = 0; i < t.dates.length; i++) s.set(t.dates[i], i);
    const a = t.matrix[r];
    for (const {
            time: i,
            value: l
        }
        of n) {
        const o = s.get(i);
        o !== void 0 && Number.isFinite(l) && (a[o] = l)
    }
}

function ie(t, r) {
    if (!Number.isFinite(t)) return NaN;
    let n = 0,
        s = 0,
        a = 0;
    for (let i = 0; i < r.length; i++) {
        const l = r[i];
        Number.isFinite(l) && (a++, l < t ? n++ : l === t && s++)
    }
    return a === 0 ? NaN : (n + .5 * s) / a * 100
}

function Ae(t) {
    let r = 0,
        n = 0;
    for (let i = 0; i < t.length; i++) {
        const l = t[i];
        Number.isFinite(l) && (r += l, n++)
    }
    if (n === 0) return {
        mean: NaN,
        std: NaN,
        n: 0
    };
    const s = r / n;
    if (n < 2) return {
        mean: s,
        std: NaN,
        n
    };
    let a = 0;
    for (let i = 0; i < t.length; i++) {
        const l = t[i];
        if (Number.isFinite(l)) {
            const o = l - s;
            a += o * o
        }
    }
    return {
        mean: s,
        std: Math.sqrt(a / (n - 1)),
        n
    }
}

function me(t, r = 4) {
    return Number.isFinite(t) ? Math.max(-r, Math.min(r, t)) : NaN
}

function De(t, r) {
    const n = new Map;
    for (let s = 0; s < t.length; s++) {
        const i = t[s][r];
        n.set(s, typeof i == "string" && i.length > 0 ? i : "__UNCLASSIFIED__")
    }
    return n
}

function ue(t, r, n) {
    const s = t.tickers.length,
        a = t.dates.length,
        i = X(t.tickers, t.dates);
    if (r === "universe") {
        for (let o = 0; o < a; o++) {
            const x = new Float64Array(s);
            for (let f = 0; f < s; f++) x[f] = t.matrix[f][o];
            for (let f = 0; f < s; f++) i.matrix[f][o] = ie(x[f], x)
        }
        return i
    }
    if (!n) throw new Error("peerIndex required for peer scope");
    const l = new Map;
    for (let o = 0; o < s; o++) {
        const x = n.get(o) || "__UNCLASSIFIED__";
        l.has(x) || l.set(x, []), l.get(x).push(o)
    }
    for (let o = 0; o < a; o++)
        for (const [, x] of l) {
            const f = new Float64Array(x.length);
            for (let p = 0; p < x.length; p++) f[p] = t.matrix[x[p]][o];
            for (let p = 0; p < x.length; p++) i.matrix[x[p]][o] = ie(f[p], f)
        }
    return i
}

function Oe(t, r) {
    const n = t.tickers.length,
        s = t.dates.length,
        a = X(t.tickers, t.dates),
        i = Math.max(2, r.minBars);
    for (let l = 0; l < n; l++) {
        const o = t.matrix[l],
            x = a.matrix[l];
        if (r.window === "expanding") {
            let f = 0,
                p = 0,
                m = 0;
            for (let b = 0; b < s; b++) {
                const u = o[b];
                if (Number.isFinite(u)) {
                    if (m >= i) {
                        const k = f / m,
                            P = p / m - k * k,
                            R = P > 0 ? Math.sqrt(P * m / (m - 1)) : NaN;
                        x[b] = Number.isFinite(R) && R > 0 ? me((u - k) / R) : NaN
                    }
                    f += u, p += u * u, m++
                }
            }
        } else {
            const f = Math.max(i, r.rollingBars),
                p = [];
            for (let m = 0; m < s; m++) {
                const b = o[m];
                if (p.length >= i) {
                    const {
                        mean: u,
                        std: k
                    } = Ae(p);
                    Number.isFinite(b) && Number.isFinite(k) && k > 0 && (x[m] = me((b - u) / k))
                }
                Number.isFinite(b) && (p.push(b), p.length > f && p.shift())
            }
        }
    }
    return a
}

function Ie(t, r) {
    const n = r.metrics.filter(m => t[m]);
    if (n.length === 0) {
        const m = Object.values(t)[0];
        if (!m) throw new Error("No panels provided");
        return X(m.xsUniverse.tickers, m.xsUniverse.dates)
    }
    const s = t[n[0]].xsUniverse,
        a = s.tickers.length,
        i = s.dates.length,
        l = X(s.tickers, s.dates);
    let o = 0;
    const x = {};
    for (const m of n) {
        const b = r.weights[m] ?? 1;
        x[m] = b, o += b
    }
    o === 0 && (o = 1);
    const f = r.xs.scope === "peer" ? 1 : r.xs.scope === "universe" ? 0 : r.xs.peerWeight,
        p = 1 - f;
    for (let m = 0; m < a; m++)
        for (let b = 0; b < i; b++) {
            let u = 0,
                k = 0;
            for (const P of n) {
                const R = t[P],
                    E = x[P] / o,
                    D = R.direction,
                    A = R.xsPeer.matrix[m][b],
                    T = R.xsUniverse.matrix[m][b];
                let S = NaN;
                r.xs.scope === "peer" ? S = A : r.xs.scope === "universe" ? S = T : Number.isFinite(A) && Number.isFinite(T) ? S = f * A + p * T : Number.isFinite(A) ? S = A : Number.isFinite(T) && (S = T);
                const h = Number.isFinite(S) ? D === 1 ? S : 100 - S : NaN,
                    N = R.tsZ.matrix[m][b],
                    v = Number.isFinite(N) ? N * D : NaN,
                    g = Number.isFinite(v) ? Math.max(0, Math.min(100, 50 + 12.5 * v)) : NaN;
                let F;
                if (Number.isFinite(h) && Number.isFinite(g)) F = r.alpha * h + (1 - r.alpha) * g;
                else if (Number.isFinite(h)) F = h;
                else if (Number.isFinite(g)) F = g;
                else continue;
                u += E * F, k += E
            }
            k > 0 && (l.matrix[m][b] = u / k)
        }
    return l
}

function Ue(t, r, n, s, a) {
    const i = n.tickers.length,
        l = s.metrics.filter(u => t[u]);
    let o = 0;
    const x = {};
    for (const u of l) {
        const k = s.weights[u] ?? 1;
        x[u] = k, o += k
    }
    o === 0 && (o = 1);
    const f = s.xs.scope === "peer" ? 1 : s.xs.scope === "universe" ? 0 : s.xs.peerWeight,
        p = 1 - f,
        m = new Float64Array(i);
    for (let u = 0; u < i; u++) m[u] = n.matrix[u][a];
    const b = [];
    for (let u = 0; u < i; u++) {
        const k = m[u];
        if (!Number.isFinite(k)) continue;
        const P = [];
        for (const R of l) {
            const E = ve[R];
            if (!E) continue;
            const D = t[R],
                A = r[R],
                T = A ? A.matrix[u][a] : NaN,
                S = D.xsPeer.matrix[u][a],
                h = D.xsUniverse.matrix[u][a],
                N = D.tsZ.matrix[u][a],
                v = D.direction;
            let g = NaN;
            s.xs.scope === "peer" ? g = S : s.xs.scope === "universe" ? g = h : Number.isFinite(S) && Number.isFinite(h) ? g = f * S + p * h : Number.isFinite(S) ? g = S : Number.isFinite(h) && (g = h);
            const F = Number.isFinite(g) ? v === 1 ? g : 100 - g : NaN,
                B = Number.isFinite(N) ? N * v : NaN,
                c = Number.isFinite(B) ? Math.max(0, Math.min(100, 50 + 12.5 * B)) : NaN;
            let d = NaN;
            Number.isFinite(F) && Number.isFinite(c) ? d = s.alpha * F + (1 - s.alpha) * c : Number.isFinite(F) ? d = F : Number.isFinite(c) && (d = c);
            const w = x[R] / o;
            P.push({
                metric: R,
                label: E.label,
                family: E.family,
                raw: T,
                xsPeer: S,
                xsUniverse: h,
                tsZ: N,
                contribution: Number.isFinite(d) ? w * d : NaN
            })
        }
        b.push({
            ticker: n.tickers[u],
            score: k,
            scorePercentile: ie(k, m),
            breakdown: P
        })
    }
    return b.sort((u, k) => k.score - u.score), b
}
const _ = [{
    days: 5,
    label: "1W"
}, {
    days: 21,
    label: "1M"
}, {
    days: 63,
    label: "3M"
}, {
    days: 126,
    label: "6M"
}, {
    days: 252,
    label: "12M"
}];

function L(t) {
    if (t.length === 0) return NaN;
    let r = 0;
    for (const n of t) r += n;
    return r / t.length
}

function Ye(t) {
    if (t.length === 0) return NaN;
    const r = [...t].sort((s, a) => s - a),
        n = Math.floor(r.length / 2);
    return r.length % 2 ? r[n] : (r[n - 1] + r[n]) / 2
}

function fe(t) {
    if (t.length < 2) return NaN;
    const r = L(t);
    let n = 0;
    for (const s of t) n += (s - r) ** 2;
    return Math.sqrt(n / (t.length - 1))
}

function ge(t, r) {
    const n = t.length,
        s = new Int16Array(n);
    for (let l = 0; l < n; l++) s[l] = -1;
    const a = [];
    for (let l = 0; l < n; l++) Number.isFinite(t[l]) && a.push({
        i: l,
        s: t[l]
    });
    if (a.length < r) return s;
    a.sort((l, o) => o.s - l.s);
    const i = a.length / r;
    for (let l = 0; l < a.length; l++) {
        const o = Math.min(r - 1, Math.floor(l / i));
        s[a[l].i] = o
    }
    return s
}

function ze(t, r, n) {
    const s = t.tickers.length,
        a = t.dates.length,
        i = n.nBuckets,
        l = n.tickerSubset ?? Array.from({
            length: s
        }, (h, N) => N),
        o = {};
    for (const h of _) o[h.label] = {
        returns: Array.from({
            length: i
        }, () => []),
        hits: Array.from({
            length: i
        }, () => [])
    };
    const x = [],
        f = {};
    for (const h of _) f[h.label] = [];
    let p = 0;
    const m = new Set;
    for (let h = 0; h < a; h += n.rebalanceBars) {
        const N = new Float64Array(s);
        for (let g = 0; g < s; g++) N[g] = NaN;
        for (const g of l) N[g] = t.matrix[g][h];
        const v = ge(N, i);
        for (const g of _) {
            const F = h + g.days;
            if (F >= a) continue;
            const B = [];
            for (const j of l) {
                const M = r.matrix[j][h],
                    I = r.matrix[j][F],
                    V = N[j],
                    q = v[j];
                Number.isFinite(M) && Number.isFinite(I) && M > 0 && Number.isFinite(V) && q >= 0 && B.push({
                    i: j,
                    r: I / M - 1,
                    b: q,
                    s: V
                })
            }
            if (B.length < i * 2) continue;
            m.add(t.dates[h]);
            for (const {
                    r: j,
                    b: M
                }
                of B) o[g.label].returns[M].push(j), o[g.label].hits[M].push(j >= n.hitThreshold ? 1 : 0);
            const c = B.map(j => j.s),
                d = B.map(j => j.r),
                w = Te(c, d);
            x.push({
                date: t.dates[h],
                horizon: g.label,
                ic: w
            });
            const O = B.filter(j => j.b === 0).map(j => j.r),
                C = B.filter(j => j.b === i - 1).map(j => j.r);
            O.length > 0 && C.length > 0 && f[g.label].push({
                date: t.dates[h],
                ret: L(O) - L(C)
            }), g.label === "1M" && (p += B.length)
        }
    }
    const b = [];
    for (const h of _)
        for (let N = 0; N < i; N++) {
            const v = o[h.label].returns[N],
                g = o[h.label].hits[N];
            b.push({
                bucket: `D${N+1}`,
                horizon: h.label,
                n: v.length,
                meanReturn: v.length ? L(v) : NaN,
                medianReturn: v.length ? Ye(v) : NaN,
                hitRate: g.length ? L(g) : NaN
            })
        }
    const u = [];
    for (const h of _) {
        const N = f[h.label].map(w => w.ret);
        if (N.length === 0) {
            u.push({
                horizon: h.label,
                n: 0,
                meanReturn: NaN,
                hitRate: NaN,
                sharpe: NaN
            });
            continue
        }
        const v = L(N),
            g = fe(N),
            F = L(N.map(w => w > 0 ? 1 : 0)),
            B = _.find(w => w.label === h.label).days,
            c = 252 / Math.max(1, B),
            d = Number.isFinite(g) && g > 0 ? v * c / (g * Math.sqrt(c)) : NaN;
        u.push({
            horizon: h.label,
            n: N.length,
            meanReturn: v,
            hitRate: F,
            sharpe: d
        })
    }
    const k = {},
        P = {};
    for (const h of _) {
        const N = x.filter(v => v.horizon === h.label && v.ic !== null).map(v => v.ic);
        k[h.label] = N.length ? L(N) : null, P[h.label] = N.length > 1 ? fe(N) : null
    }
    const R = [];
    let E = 1,
        D = 1,
        A = 1;
    const T = [],
        S = [];
    for (let h = 0; h < a; h += n.rebalanceBars) {
        const N = h + 21;
        if (N >= a) continue;
        const v = new Float64Array(s);
        for (let c = 0; c < s; c++) v[c] = NaN;
        for (const c of l) v[c] = t.matrix[c][h];
        const g = ge(v, i),
            F = [],
            B = [];
        for (const c of l) {
            const d = r.matrix[c][h],
                w = r.matrix[c][N],
                O = g[c];
            if (Number.isFinite(d) && Number.isFinite(w) && d > 0 && O >= 0) {
                const C = w / d - 1;
                O === 0 ? F.push(C) : O === i - 1 && B.push(C)
            }
        }
        F.length && B.length && (T.push({
            date: t.dates[h],
            ret: L(F)
        }), S.push({
            date: t.dates[h],
            ret: L(B)
        }))
    }
    for (let h = 0; h < T.length; h++) E *= 1 + T[h].ret, D *= 1 + S[h].ret, A *= 1 + (T[h].ret - S[h].ret), R.push({
        date: T[h].date,
        long: E,
        short: D,
        ls: A
    });
    return {
        nObservations: p,
        nDates: m.size,
        bucketStats: b,
        longShort: u,
        icPerDate: x,
        icMeans: k,
        icStds: P,
        equityCurve: R
    }
}
const Le = ["valuation", "growth", "technical", "macro"],
    _e = {
        valuation: "Valuation",
        growth: "Growth & Quality",
        technical: "Technicals",
        macro: "Macro Sensitivity"
    },
    Ne = ["P/AFFO FY2", "AFFO Yield FY2", "FY2 AFFO Growth", "Dividend Yield", "3M Price Chg%", "% off 52wk High"],
    Ve = {
        metrics: Ne,
        weights: Object.fromEntries(Ne.map(t => [t, 1])),
        alpha: .6,
        xs: {
            scope: "blend",
            peerWeight: .7,
            peerDimension: "subindustry"
        },
        ts: {
            window: "rolling",
            rollingBars: 504,
            minBars: 60
        }
    };

function $(...t) {
    return t.filter(Boolean).join(" ")
}

function G(t, r = 1) {
    return Number.isFinite(t) ? t.toFixed(r) + "%" : "—"
}

function U(t, r = 2) {
    return Number.isFinite(t) ? t.toFixed(r) : "—"
}

function Je() {
    const t = Fe(),
        [r, n] = Y("rse:mode", "universe"),
        [s, a] = Y("rse:cfg", Ve),
        [i, l] = Y("rse:pairA", "O"),
        [o, x] = Y("rse:pairB", "NNN"),
        [f, p] = Y("rse:single", "O"),
        [m, b] = Y("rse:doBT", !0),
        [u, k] = Y("rse:hitTh", "5"),
        [P, R] = Y("rse:reb", 21),
        [E, D] = Y("rse:buckets", 10),
        [A, T] = Y("rse:result", null),
        [S, h] = K.useState(!1),
        [N, v] = K.useState(null),
        [g, F] = K.useState("");
    ye("relative-strength", () => ({
        mode: r,
        cfg: s,
        pairA: i,
        pairB: o,
        singleTicker: f,
        doBacktest: m,
        hitThreshold: u,
        rebalanceBars: P,
        nBuckets: E
    }), c => {
        const d = c;
        d.mode && n(d.mode), d.cfg && a(d.cfg), typeof d.pairA == "string" && l(d.pairA), typeof d.pairB == "string" && x(d.pairB), typeof d.singleTicker == "string" && p(d.singleTicker), typeof d.doBacktest == "boolean" && b(d.doBacktest), typeof d.hitThreshold == "string" && k(d.hitThreshold), typeof d.rebalanceBars == "number" && R(d.rebalanceBars), typeof d.nBuckets == "number" && D(d.nBuckets)
    });
    const B = K.useCallback(async () => {
        h(!0), v(null), F("");
        try {
            const [c, d] = await Promise.all([Se(), Me()]), w = new Set(t.visibleTickers ?? c.map(y => y.ticker)), O = c.filter(y => w.has(y.ticker));
            if (O.length < 5) throw new Error("Need at least 5 tickers in universe");
            const C = O.map(y => y.ticker);
            F(`Loading metrics for ${C.length} tickers…`);
            const j = s.metrics,
                M = {};
            for (const y of j) M[y] = X(C, d);
            const I = X(C, d),
                V = 20;
            for (let y = 0; y < C.length; y += V) {
                const H = C.slice(y, y + V);
                await Promise.all(H.map(async (Q, ne) => {
                    const J = y + ne;
                    try {
                        const ee = await le(Q, "close");
                        xe(I, J, ee)
                    } catch {}
                    for (const ee of j) try {
                        const ke = await le(Q, ee);
                        xe(M[ee], J, ke)
                    } catch {}
                })), F(`Loading metrics… ${Math.min(y+V,C.length)}/${C.length}`)
            }
            F("Computing percentiles + z-scores…");
            const q = De(O, s.xs.peerDimension),
                se = {};
            for (const y of j) {
                const H = ve[y];
                if (!H) continue;
                const Q = ue(M[y], "peer", q),
                    ne = ue(M[y], "universe"),
                    J = Oe(M[y], s.ts);
                se[y] = {
                    xsPeer: Q,
                    xsUniverse: ne,
                    tsZ: J,
                    direction: H.direction
                }
            }
            F("Computing composite scores…");
            const re = Ie(se, s);
            let Z = d.length - 1;
            for (; Z >= 0;) {
                let y = 0;
                for (let H = 0; H < C.length; H++) Number.isFinite(re.matrix[H][Z]) && y++;
                if (y >= Math.floor(C.length * .5)) break;
                Z--
            }
            if (Z < 0) throw new Error("No date has sufficient coverage to score");
            const we = Ue(se, M, re, s, Z);
            let ae = null;
            m && (F("Running backtest…"), ae = ze(re, I, {
                nBuckets: E,
                rebalanceBars: P,
                hitThreshold: parseFloat(u || "5") / 100
            })), T({
                asOfDate: d[Z],
                snapshot: we,
                config: s,
                backtest: ae
            }), F("")
        } catch (c) {
            const d = c instanceof Error ? c.message : String(c);
            v(d)
        } finally {
            h(!1)
        }
    }, [t, s, m, u, P, E, T]);
    return K.useMemo(() => (t.visibleTickers ?? []).slice(), [t.visibleTickers]), e.jsxs("div", {
        className: "p-6 space-y-4 max-w-[1400px] mx-auto",
        children: [e.jsxs("header", {
            children: [e.jsx("h1", {
                className: "text-2xl font-bold",
                children: "Relative Strength Engine"
            }), e.jsx("p", {
                className: "text-sm text-muted-foreground mt-1",
                children: "Multi-variable composite score: cross-sectional percentile rank (peer + universe) blended with time-series z-score. Three output modes — universe ranking, pair conviction, single-name vs peer."
            })]
        }), e.jsxs("div", {
            className: "flex flex-wrap gap-2 items-center bg-muted/40 p-3 rounded-md",
            children: [e.jsx("span", {
                className: "text-sm font-medium mr-2",
                children: "Mode:"
            }), ["universe", "pair", "single"].map(c => e.jsx(te, {
                size: "sm",
                variant: r === c ? "default" : "outline",
                onClick: () => n(c),
                children: c === "universe" ? "Universe Ranking" : c === "pair" ? "Pair Trade" : "Single-Name"
            }, c)), r === "pair" && e.jsxs(e.Fragment, {
                children: [e.jsx("span", {
                    className: "text-sm ml-4",
                    children: "Long:"
                }), e.jsx(z, {
                    className: "w-24 h-8",
                    value: i,
                    onChange: c => l(c.target.value.toUpperCase()),
                    placeholder: "A"
                }), e.jsx("span", {
                    className: "text-sm",
                    children: "Short:"
                }), e.jsx(z, {
                    className: "w-24 h-8",
                    value: o,
                    onChange: c => x(c.target.value.toUpperCase()),
                    placeholder: "B"
                })]
            }), r === "single" && e.jsxs(e.Fragment, {
                children: [e.jsx("span", {
                    className: "text-sm ml-4",
                    children: "Ticker:"
                }), e.jsx(z, {
                    className: "w-24 h-8",
                    value: f,
                    onChange: c => p(c.target.value.toUpperCase())
                })]
            })]
        }), e.jsxs("div", {
            className: "bg-card border rounded-md p-4 space-y-4",
            children: [e.jsxs("h2", {
                className: "font-semibold flex items-center gap-2",
                children: [e.jsx(Re, {
                    className: "w-4 h-4 text-muted-foreground"
                }), " Framework Configuration"]
            }), e.jsx("div", {
                className: "grid grid-cols-1 md:grid-cols-4 gap-4",
                children: Le.map(c => {
                    const d = je.filter(w => w.family === c);
                    return e.jsxs("div", {
                        className: "space-y-1",
                        children: [e.jsx("h3", {
                            className: "text-xs font-bold uppercase text-muted-foreground",
                            children: _e[c]
                        }), d.map(w => {
                            const O = s.metrics.includes(w.key);
                            return e.jsxs("div", {
                                className: "flex items-center gap-2 text-xs",
                                children: [e.jsx("input", {
                                    type: "checkbox",
                                    checked: O,
                                    onChange: C => {
                                        const j = C.target.checked;
                                        a(M => {
                                            const I = {
                                                ...M
                                            };
                                            if (j) I.metrics = [...M.metrics, w.key], I.weights = {
                                                ...M.weights,
                                                [w.key]: 1
                                            };
                                            else {
                                                I.metrics = M.metrics.filter(q => q !== w.key);
                                                const V = {
                                                    ...M.weights
                                                };
                                                delete V[w.key], I.weights = V
                                            }
                                            return I
                                        })
                                    }
                                }), e.jsx("span", {
                                    className: "flex-1",
                                    children: w.label
                                }), e.jsx("span", {
                                    className: "text-muted-foreground",
                                    title: "Direction: +1 higher=bull, -1 higher=bear",
                                    children: w.direction > 0 ? "↑" : "↓"
                                }), O && e.jsx(z, {
                                    type: "number",
                                    step: "0.1",
                                    min: "0",
                                    max: "5",
                                    value: s.weights[w.key] ?? 1,
                                    onChange: C => {
                                        const j = parseFloat(C.target.value);
                                        a(M => ({
                                            ...M,
                                            weights: {
                                                ...M.weights,
                                                [w.key]: Number.isFinite(j) ? j : 1
                                            }
                                        }))
                                    },
                                    className: "w-14 h-6 text-xs"
                                })]
                            }, w.key)
                        })]
                    }, c)
                })
            }), e.jsxs("div", {
                className: "grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t",
                children: [e.jsxs("div", {
                    children: [e.jsx("label", {
                        className: "text-xs text-muted-foreground",
                        children: "XS ⇄ TS Blend (α)"
                    }), e.jsxs("div", {
                        className: "flex items-center gap-2",
                        children: [e.jsx("input", {
                            type: "range",
                            min: "0",
                            max: "100",
                            value: Math.round(s.alpha * 100),
                            onChange: c => a(d => ({
                                ...d,
                                alpha: parseInt(c.target.value, 10) / 100
                            })),
                            className: "flex-1"
                        }), e.jsxs("span", {
                            className: "text-xs w-16 text-right",
                            children: [Math.round(s.alpha * 100), "% XS / ", 100 - Math.round(s.alpha * 100), "% TS"]
                        })]
                    })]
                }), e.jsxs("div", {
                    className: "space-y-1",
                    children: [e.jsx("label", {
                        className: "text-xs text-muted-foreground",
                        children: "XS Scope"
                    }), e.jsx("div", {
                        className: "flex gap-1",
                        children: ["peer", "universe", "blend"].map(c => e.jsx(te, {
                            size: "sm",
                            variant: s.xs.scope === c ? "default" : "outline",
                            onClick: () => a(d => ({
                                ...d,
                                xs: {
                                    ...d.xs,
                                    scope: c
                                }
                            })),
                            className: "text-xs",
                            children: c
                        }, c))
                    }), s.xs.scope === "blend" && e.jsxs("div", {
                        className: "flex items-center gap-2 text-xs",
                        children: [e.jsx("span", {
                            children: "Peer wt:"
                        }), e.jsx(z, {
                            type: "number",
                            step: "0.1",
                            min: "0",
                            max: "1",
                            value: s.xs.peerWeight,
                            onChange: c => a(d => ({
                                ...d,
                                xs: {
                                    ...d.xs,
                                    peerWeight: parseFloat(c.target.value) || 0
                                }
                            })),
                            className: "w-16 h-6 text-xs"
                        })]
                    }), e.jsxs(ce, {
                        value: s.xs.peerDimension,
                        onValueChange: c => a(d => ({
                            ...d,
                            xs: {
                                ...d.xs,
                                peerDimension: c
                            }
                        })),
                        children: [e.jsx(oe, {
                            className: "h-7 text-xs",
                            children: e.jsx(de, {})
                        }), e.jsxs(he, {
                            children: [e.jsx(W, {
                                value: "subindustry",
                                children: "Sub-Industry"
                            }), e.jsx(W, {
                                value: "industry",
                                children: "Industry"
                            }), e.jsx(W, {
                                value: "sector",
                                children: "Sector"
                            }), e.jsx(W, {
                                value: "supersector",
                                children: "Super-Sector"
                            }), e.jsx(W, {
                                value: "subsector",
                                children: "Sub-Sector"
                            })]
                        })]
                    })]
                }), e.jsxs("div", {
                    className: "space-y-1",
                    children: [e.jsx("label", {
                        className: "text-xs text-muted-foreground",
                        children: "TS Window"
                    }), e.jsxs(ce, {
                        value: s.ts.window,
                        onValueChange: c => a(d => ({
                            ...d,
                            ts: {
                                ...d.ts,
                                window: c
                            }
                        })),
                        children: [e.jsx(oe, {
                            className: "h-7 text-xs",
                            children: e.jsx(de, {})
                        }), e.jsxs(he, {
                            children: [e.jsx(W, {
                                value: "rolling",
                                children: "Rolling"
                            }), e.jsx(W, {
                                value: "expanding",
                                children: "Expanding"
                            })]
                        })]
                    }), s.ts.window === "rolling" && e.jsxs("div", {
                        className: "flex items-center gap-2 text-xs",
                        children: [e.jsx("span", {
                            children: "Bars:"
                        }), e.jsx(z, {
                            type: "number",
                            step: "20",
                            min: "20",
                            value: s.ts.rollingBars,
                            onChange: c => a(d => ({
                                ...d,
                                ts: {
                                    ...d.ts,
                                    rollingBars: parseInt(c.target.value, 10) || 252
                                }
                            })),
                            className: "w-20 h-6 text-xs"
                        })]
                    }), e.jsxs("div", {
                        className: "flex items-center gap-2 text-xs",
                        children: [e.jsx("span", {
                            children: "Min bars:"
                        }), e.jsx(z, {
                            type: "number",
                            step: "10",
                            min: "2",
                            value: s.ts.minBars,
                            onChange: c => a(d => ({
                                ...d,
                                ts: {
                                    ...d.ts,
                                    minBars: parseInt(c.target.value, 10) || 2
                                }
                            })),
                            className: "w-16 h-6 text-xs"
                        })]
                    })]
                })]
            }), e.jsxs("div", {
                className: "flex flex-wrap gap-4 items-center pt-2 border-t text-xs",
                children: [e.jsxs("div", {
                    className: "flex items-center gap-2",
                    children: [e.jsx(Be, {
                        checked: m,
                        onCheckedChange: b,
                        id: "bt"
                    }), e.jsx("label", {
                        htmlFor: "bt",
                        children: "Run backtest"
                    })]
                }), m && e.jsxs(e.Fragment, {
                    children: [e.jsxs("div", {
                        className: "flex items-center gap-1",
                        children: [e.jsx("span", {
                            children: "Buckets:"
                        }), e.jsx(z, {
                            type: "number",
                            min: "3",
                            max: "10",
                            value: E,
                            onChange: c => D(parseInt(c.target.value, 10) || 10),
                            className: "w-14 h-6 text-xs"
                        })]
                    }), e.jsxs("div", {
                        className: "flex items-center gap-1",
                        children: [e.jsx("span", {
                            children: "Rebalance (bars):"
                        }), e.jsx(z, {
                            type: "number",
                            min: "5",
                            value: P,
                            onChange: c => R(parseInt(c.target.value, 10) || 21),
                            className: "w-16 h-6 text-xs"
                        })]
                    }), e.jsxs("div", {
                        className: "flex items-center gap-1",
                        children: [e.jsx("span", {
                            children: "Hit threshold %:"
                        }), e.jsx(z, {
                            type: "number",
                            step: "0.5",
                            value: u,
                            onChange: c => k(c.target.value),
                            className: "w-16 h-6 text-xs"
                        })]
                    })]
                }), e.jsx("div", {
                    className: "flex-1"
                }), e.jsx(te, {
                    onClick: B,
                    disabled: S || s.metrics.length === 0,
                    size: "sm",
                    className: "ml-auto",
                    children: S ? e.jsxs(e.Fragment, {
                        children: [e.jsx(Ce, {
                            className: "w-4 h-4 mr-1 animate-spin"
                        }), " Running…"]
                    }) : e.jsxs(e.Fragment, {
                        children: [e.jsx(Ee, {
                            className: "w-4 h-4 mr-1"
                        }), " Run"]
                    })
                })]
            }), g && e.jsx("div", {
                className: "text-xs text-muted-foreground",
                children: g
            }), N && e.jsx("div", {
                className: "text-xs text-red-600 bg-red-50 border border-red-200 p-2 rounded",
                children: N
            })]
        }), A && e.jsx(Ge, {
            mode: r,
            result: A,
            pairA: i,
            pairB: o,
            single: f
        })]
    })
}

function Ge({
    mode: t,
    result: r,
    pairA: n,
    pairB: s,
    single: a
}) {
    const {
        snapshot: i,
        asOfDate: l,
        backtest: o
    } = r, x = K.useMemo(() => {
        const f = new Map;
        for (const p of i) f.set(p.ticker, p);
        return f
    }, [i]);
    return e.jsxs("div", {
        className: "space-y-4",
        children: [e.jsxs("div", {
            className: "text-xs text-muted-foreground",
            children: ["As of ", e.jsx("strong", {
                children: l
            }), " · ", i.length, " tickers scored"]
        }), t === "universe" && e.jsx(He, {
            snapshot: i,
            backtest: o,
            asOfDate: l
        }), t === "pair" && e.jsx(We, {
            a: x.get(n),
            b: x.get(s),
            aSym: n,
            bSym: s,
            snapshot: i
        }), t === "single" && e.jsx(qe, {
            row: x.get(a),
            sym: a,
            snapshot: i
        }), o && t === "universe" && e.jsx(Ze, {
            bt: o
        })]
    })
}

function He({
    snapshot: t,
    backtest: r,
    asOfDate: n
}) {
    const s = () => {
        const a = `rank,ticker,score,percentile
`,
            i = t.map((f, p) => `${p+1},${f.ticker},${f.score.toFixed(2)},${f.scorePercentile.toFixed(1)}`).join(`
`),
            l = new Blob([a + i], {
                type: "text/csv"
            }),
            o = URL.createObjectURL(l),
            x = document.createElement("a");
        x.href = o, x.download = `rse-ranking-${n}.csv`, x.click(), URL.revokeObjectURL(o)
    };
    return e.jsxs("div", {
        className: "bg-card border rounded-md p-4",
        children: [e.jsxs("div", {
            className: "flex items-center justify-between mb-3",
            children: [e.jsx("h3", {
                className: "font-semibold",
                children: "Universe Ranking (top = strongest)"
            }), e.jsxs(te, {
                size: "sm",
                variant: "outline",
                onClick: s,
                children: [e.jsx(Pe, {
                    className: "w-3 h-3 mr-1"
                }), " CSV"]
            })]
        }), e.jsxs("div", {
            className: "grid grid-cols-1 md:grid-cols-2 gap-4",
            children: [e.jsx(pe, {
                title: "Top Decile (LONG)",
                rows: t.slice(0, Math.ceil(t.length / 10)),
                positive: !0
            }), e.jsx(pe, {
                title: "Bottom Decile (SHORT)",
                rows: t.slice(-Math.ceil(t.length / 10)).reverse(),
                positive: !1
            })]
        }), e.jsxs("details", {
            className: "mt-4 text-sm",
            children: [e.jsxs("summary", {
                className: "cursor-pointer text-muted-foreground hover:text-foreground",
                children: ["Show full ranking (", t.length, " tickers)"]
            }), e.jsx("div", {
                className: "mt-2 max-h-[400px] overflow-y-auto",
                children: e.jsxs("table", {
                    className: "w-full text-xs",
                    children: [e.jsx("thead", {
                        className: "sticky top-0 bg-card",
                        children: e.jsxs("tr", {
                            className: "text-left border-b",
                            children: [e.jsx("th", {
                                className: "p-1",
                                children: "#"
                            }), e.jsx("th", {
                                className: "p-1",
                                children: "Ticker"
                            }), e.jsx("th", {
                                className: "p-1 text-right",
                                children: "Score"
                            }), e.jsx("th", {
                                className: "p-1 text-right",
                                children: "Percentile"
                            })]
                        })
                    }), e.jsx("tbody", {
                        children: t.map((a, i) => e.jsxs("tr", {
                            className: "border-b hover:bg-muted/50",
                            children: [e.jsx("td", {
                                className: "p-1",
                                children: i + 1
                            }), e.jsx("td", {
                                className: "p-1 font-mono",
                                children: a.ticker
                            }), e.jsx("td", {
                                className: "p-1 text-right",
                                children: U(a.score)
                            }), e.jsx("td", {
                                className: "p-1 text-right",
                                children: G(a.scorePercentile)
                            })]
                        }, a.ticker))
                    })]
                })
            })]
        })]
    })
}

function pe({
    title: t,
    rows: r,
    positive: n
}) {
    return e.jsxs("div", {
        children: [e.jsx("div", {
            className: $("text-sm font-semibold mb-1", n ? "text-green-600" : "text-red-600"),
            children: t
        }), e.jsxs("table", {
            className: "w-full text-xs",
            children: [e.jsx("thead", {
                children: e.jsxs("tr", {
                    className: "text-left border-b",
                    children: [e.jsx("th", {
                        className: "p-1",
                        children: "Ticker"
                    }), e.jsx("th", {
                        className: "p-1 text-right",
                        children: "Score"
                    }), e.jsx("th", {
                        className: "p-1 text-right",
                        children: "Pctile"
                    })]
                })
            }), e.jsx("tbody", {
                children: r.map(s => e.jsxs("tr", {
                    className: "border-b hover:bg-muted/50",
                    children: [e.jsx("td", {
                        className: "p-1 font-mono",
                        children: s.ticker
                    }), e.jsx("td", {
                        className: "p-1 text-right",
                        children: U(s.score)
                    }), e.jsx("td", {
                        className: "p-1 text-right",
                        children: G(s.scorePercentile)
                    })]
                }, s.ticker))
            })]
        })]
    })
}

function We({
    a: t,
    b: r,
    aSym: n,
    bSym: s
}) {
    if (!t || !r) return e.jsxs("div", {
        className: "bg-card border rounded-md p-4 text-sm text-muted-foreground",
        children: ["One or both tickers not found in scored universe: ", t ? "" : n, " ", r ? "" : s]
    });
    const a = t.score - r.score,
        i = a > 0 ? `LONG ${n} / SHORT ${s}` : `LONG ${s} / SHORT ${n}`,
        l = Math.abs(a),
        o = l > 25 ? "Strong" : l > 10 ? "Moderate" : "Weak";
    return e.jsxs("div", {
        className: "bg-card border rounded-md p-4 space-y-3",
        children: [e.jsx("h3", {
            className: "font-semibold",
            children: "Pair Conviction"
        }), e.jsxs("div", {
            className: "text-center py-3 bg-muted/30 rounded",
            children: [e.jsx("div", {
                className: "text-2xl font-bold",
                children: i
            }), e.jsxs("div", {
                className: "text-sm text-muted-foreground mt-1",
                children: ["Spread: ", e.jsx("strong", {
                    children: a.toFixed(1)
                }), " · Conviction: ", e.jsx("strong", {
                    children: o
                })]
            })]
        }), e.jsxs("div", {
            className: "grid grid-cols-2 gap-4",
            children: [e.jsx(be, {
                title: n,
                row: t
            }), e.jsx(be, {
                title: s,
                row: r
            })]
        }), e.jsx($e, {
            a: t,
            b: r,
            aSym: n,
            bSym: s
        })]
    })
}

function be({
    title: t,
    row: r
}) {
    return e.jsxs("div", {
        className: "border rounded p-3",
        children: [e.jsx("div", {
            className: "font-bold text-lg",
            children: t
        }), e.jsx("div", {
            className: "text-3xl font-mono",
            children: U(r.score)
        }), e.jsxs("div", {
            className: "text-xs text-muted-foreground",
            children: ["Universe percentile: ", G(r.scorePercentile)]
        })]
    })
}

function $e({
    a: t,
    b: r,
    aSym: n,
    bSym: s
}) {
    const a = new Map;
    for (const i of t.breakdown) {
        const l = r.breakdown.find(o => o.metric === i.metric);
        l && a.set(i.metric, {
            aRow: i,
            bRow: l
        })
    }
    return e.jsxs("div", {
        children: [e.jsx("h4", {
            className: "text-sm font-semibold mb-2",
            children: "Per-Metric Edge"
        }), e.jsxs("table", {
            className: "w-full text-xs",
            children: [e.jsx("thead", {
                children: e.jsxs("tr", {
                    className: "text-left border-b",
                    children: [e.jsx("th", {
                        className: "p-1",
                        children: "Metric"
                    }), e.jsxs("th", {
                        className: "p-1 text-right",
                        children: [n, " contrib"]
                    }), e.jsxs("th", {
                        className: "p-1 text-right",
                        children: [s, " contrib"]
                    }), e.jsx("th", {
                        className: "p-1 text-right",
                        children: "Δ (A−B)"
                    })]
                })
            }), e.jsx("tbody", {
                children: [...a.entries()].map(([i, {
                    aRow: l,
                    bRow: o
                }]) => {
                    const x = (l.contribution || 0) - (o.contribution || 0);
                    return e.jsxs("tr", {
                        className: "border-b",
                        children: [e.jsx("td", {
                            className: "p-1",
                            children: l.label
                        }), e.jsx("td", {
                            className: "p-1 text-right",
                            children: U(l.contribution)
                        }), e.jsx("td", {
                            className: "p-1 text-right",
                            children: U(o.contribution)
                        }), e.jsxs("td", {
                            className: $("p-1 text-right font-semibold", x > 0 ? "text-green-600" : x < 0 ? "text-red-600" : ""),
                            children: [x > 0 ? "+" : "", U(x)]
                        })]
                    }, i)
                })
            })]
        })]
    })
}

function qe({
    row: t,
    sym: r
}) {
    if (!t) return e.jsxs("div", {
        className: "bg-card border rounded-md p-4 text-sm text-muted-foreground",
        children: ["Ticker ", r, " not found in scored universe."]
    });
    const n = t.scorePercentile,
        s = n >= 70 ? "OVERWEIGHT" : n <= 30 ? "UNDERWEIGHT" : "NEUTRAL",
        a = n >= 70 ? "text-green-600" : n <= 30 ? "text-red-600" : "text-amber-600";
    return e.jsxs("div", {
        className: "bg-card border rounded-md p-4 space-y-4",
        children: [e.jsxs("h3", {
            className: "font-semibold",
            children: [r, " — Relative Strength Profile"]
        }), e.jsxs("div", {
            className: "grid grid-cols-3 gap-4 text-center",
            children: [e.jsxs("div", {
                children: [e.jsx("div", {
                    className: "text-xs text-muted-foreground",
                    children: "Composite Score"
                }), e.jsx("div", {
                    className: "text-3xl font-mono",
                    children: U(t.score)
                })]
            }), e.jsxs("div", {
                children: [e.jsx("div", {
                    className: "text-xs text-muted-foreground",
                    children: "Universe Percentile"
                }), e.jsx("div", {
                    className: "text-3xl font-mono",
                    children: G(t.scorePercentile, 0)
                })]
            }), e.jsxs("div", {
                children: [e.jsx("div", {
                    className: "text-xs text-muted-foreground",
                    children: "Stance"
                }), e.jsx("div", {
                    className: $("text-2xl font-bold", a),
                    children: s
                })]
            })]
        }), e.jsxs("div", {
            children: [e.jsx("h4", {
                className: "text-sm font-semibold mb-2",
                children: "Per-Metric Breakdown"
            }), e.jsxs("table", {
                className: "w-full text-xs",
                children: [e.jsx("thead", {
                    children: e.jsxs("tr", {
                        className: "text-left border-b",
                        children: [e.jsx("th", {
                            className: "p-1",
                            children: "Metric"
                        }), e.jsx("th", {
                            className: "p-1 text-right",
                            children: "Raw"
                        }), e.jsx("th", {
                            className: "p-1 text-right",
                            children: "Peer %ile"
                        }), e.jsx("th", {
                            className: "p-1 text-right",
                            children: "Univ %ile"
                        }), e.jsx("th", {
                            className: "p-1 text-right",
                            children: "TS z"
                        }), e.jsx("th", {
                            className: "p-1 text-right",
                            children: "Contrib"
                        })]
                    })
                }), e.jsx("tbody", {
                    children: t.breakdown.map(i => e.jsxs("tr", {
                        className: "border-b",
                        children: [e.jsx("td", {
                            className: "p-1",
                            children: i.label
                        }), e.jsx("td", {
                            className: "p-1 text-right",
                            children: U(i.raw)
                        }), e.jsx("td", {
                            className: "p-1 text-right",
                            children: G(i.xsPeer, 0)
                        }), e.jsx("td", {
                            className: "p-1 text-right",
                            children: G(i.xsUniverse, 0)
                        }), e.jsx("td", {
                            className: "p-1 text-right",
                            children: U(i.tsZ)
                        }), e.jsx("td", {
                            className: $("p-1 text-right font-semibold", i.contribution > 5 ? "text-green-600" : i.contribution < -5 ? "text-red-600" : ""),
                            children: U(i.contribution)
                        })]
                    }, i.metric))
                })]
            })]
        })]
    })
}

function Ze({
    bt: t
}) {
    return e.jsxs("div", {
        className: "bg-card border rounded-md p-4 space-y-4",
        children: [e.jsx("h3", {
            className: "font-semibold",
            children: "Backtest Results"
        }), e.jsxs("div", {
            className: "text-xs text-muted-foreground",
            children: [t.nObservations, " ticker-date observations across ", t.nDates, " rebalance dates"]
        }), e.jsxs("div", {
            children: [e.jsx("h4", {
                className: "text-sm font-semibold mb-2",
                children: "Long-Short (Top vs Bottom Decile)"
            }), e.jsxs("table", {
                className: "w-full text-xs",
                children: [e.jsx("thead", {
                    children: e.jsxs("tr", {
                        className: "text-left border-b",
                        children: [e.jsx("th", {
                            className: "p-1",
                            children: "Horizon"
                        }), e.jsx("th", {
                            className: "p-1 text-right",
                            children: "N"
                        }), e.jsx("th", {
                            className: "p-1 text-right",
                            children: "Mean Spread"
                        }), e.jsx("th", {
                            className: "p-1 text-right",
                            children: "Hit %"
                        }), e.jsx("th", {
                            className: "p-1 text-right",
                            children: "Sharpe"
                        })]
                    })
                }), e.jsx("tbody", {
                    children: t.longShort.map(r => e.jsxs("tr", {
                        className: "border-b",
                        children: [e.jsx("td", {
                            className: "p-1",
                            children: r.horizon
                        }), e.jsx("td", {
                            className: "p-1 text-right",
                            children: r.n
                        }), e.jsx("td", {
                            className: $("p-1 text-right font-semibold", r.meanReturn > 0 ? "text-green-600" : "text-red-600"),
                            children: G(r.meanReturn * 100, 2)
                        }), e.jsx("td", {
                            className: "p-1 text-right",
                            children: G(r.hitRate * 100, 0)
                        }), e.jsx("td", {
                            className: "p-1 text-right",
                            children: U(r.sharpe)
                        })]
                    }, r.horizon))
                })]
            })]
        }), e.jsxs("div", {
            children: [e.jsx("h4", {
                className: "text-sm font-semibold mb-2",
                children: "Information Coefficient (Spearman rank corr, score vs fwd return)"
            }), e.jsxs("table", {
                className: "w-full text-xs",
                children: [e.jsx("thead", {
                    children: e.jsxs("tr", {
                        className: "text-left border-b",
                        children: [e.jsx("th", {
                            className: "p-1",
                            children: "Horizon"
                        }), e.jsx("th", {
                            className: "p-1 text-right",
                            children: "IC mean"
                        }), e.jsx("th", {
                            className: "p-1 text-right",
                            children: "IC stdev"
                        }), e.jsx("th", {
                            className: "p-1 text-right",
                            children: "IC IR (mean/std)"
                        })]
                    })
                }), e.jsx("tbody", {
                    children: _.map(r => {
                        const n = t.icMeans[r.label],
                            s = t.icStds[r.label],
                            a = n !== null && s !== null && s > 0 ? n / s : null;
                        return e.jsxs("tr", {
                            className: "border-b",
                            children: [e.jsx("td", {
                                className: "p-1",
                                children: r.label
                            }), e.jsx("td", {
                                className: $("p-1 text-right font-semibold", n !== null && n > 0 ? "text-green-600" : n !== null && n < 0 ? "text-red-600" : ""),
                                children: n !== null ? n.toFixed(3) : "—"
                            }), e.jsx("td", {
                                className: "p-1 text-right",
                                children: s !== null ? s.toFixed(3) : "—"
                            }), e.jsx("td", {
                                className: "p-1 text-right",
                                children: a !== null ? a.toFixed(2) : "—"
                            })]
                        }, r.label)
                    })
                })]
            })]
        }), e.jsxs("div", {
            children: [e.jsx("h4", {
                className: "text-sm font-semibold mb-2",
                children: "Bucket Returns by Horizon"
            }), e.jsxs("table", {
                className: "w-full text-xs",
                children: [e.jsx("thead", {
                    children: e.jsxs("tr", {
                        className: "text-left border-b",
                        children: [e.jsx("th", {
                            className: "p-1",
                            children: "Bucket"
                        }), _.map(r => e.jsxs("th", {
                            className: "p-1 text-right",
                            children: [r.label, " Mean"]
                        }, r.label))]
                    })
                }), e.jsx("tbody", {
                    children: Array.from(new Set(t.bucketStats.map(r => r.bucket))).map(r => e.jsxs("tr", {
                        className: "border-b",
                        children: [e.jsx("td", {
                            className: "p-1 font-semibold",
                            children: r
                        }), _.map(n => {
                            const s = t.bucketStats.find(a => a.bucket === r && a.horizon === n.label);
                            return e.jsx("td", {
                                className: $("p-1 text-right", s && s.meanReturn > 0 ? "text-green-600" : s && s.meanReturn < 0 ? "text-red-600" : ""),
                                children: s && Number.isFinite(s.meanReturn) ? G(s.meanReturn * 100, 2) : "—"
                            }, n.label)
                        })]
                    }, r))
                })]
            })]
        })]
    })
}
export {
    Je as
    default
};