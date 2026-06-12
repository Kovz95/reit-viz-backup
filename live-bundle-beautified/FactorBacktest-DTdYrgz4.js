import {
    a as dt,
    r as m,
    g as ut,
    b as He,
    w as ht,
    a3 as Te,
    j as e,
    o as pe,
    p as be,
    q as je,
    t as Ne,
    v as me,
    I as Le,
    Z as mt,
    B as ye,
    a4 as Ue,
    a5 as xt,
    z as Pe,
    a6 as Xe,
    a7 as We,
    a8 as Ke,
    a9 as Ze,
    aa as Je,
    ab as et,
    ac as tt,
    ad as Re,
    O as ft,
    ae as gt,
    af as pt
} from "./index-CsG73Aq_.js";
import {
    P as bt
} from "./play-D7mVvggU.js";
import {
    C as nt
} from "./CartesianGrid-BQtjaw_K.js";
const L = [{
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

function T(r) {
    if (r.length === 0) return NaN;
    let s = 0;
    for (const a of r) s += a;
    return s / r.length
}

function ie(r) {
    if (r.length === 0) return NaN;
    const s = [...r].sort((l, c) => l - c),
        a = Math.floor(s.length / 2);
    return s.length % 2 ? s[a] : (s[a - 1] + s[a]) / 2
}

function xe(r) {
    if (r.length < 2) return 0;
    const s = T(r);
    let a = 0;
    for (const l of r) a += (l - s) * (l - s);
    return Math.sqrt(a / (r.length - 1))
}

function jt(r, s) {
    const a = r.length;
    if (a !== s.length || a < 3) return null;
    const l = E => {
            const x = E.map((C, B) => ({
                v: C,
                i: B
            }));
            x.sort((C, B) => C.v - B.v);
            const _ = new Array(a);
            let P = 0;
            for (; P < a;) {
                let C = P;
                for (; C + 1 < a && x[C + 1].v === x[P].v;) C++;
                const B = (P + C) / 2 + 1;
                for (let U = P; U <= C; U++) _[x[U].i] = B;
                P = C + 1
            }
            return _
        },
        c = l(r),
        d = l(s),
        g = T(c),
        f = T(d);
    let k = 0,
        y = 0,
        A = 0;
    for (let E = 0; E < a; E++) {
        const x = c[E] - g,
            _ = d[E] - f;
        k += x * _, y += x * x, A += _ * _
    }
    const v = Math.sqrt(y * A);
    return v === 0 ? null : k / v
}

function Nt(r) {
    const s = {};
    for (const a of L) {
        const l = r.closeAtT,
            c = r.closeAtH[a.label] ?? null;
        l == null || c == null || !Number.isFinite(l) || !Number.isFinite(c) || l <= 0 ? s[a.label] = null : s[a.label] = c / l - 1
    }
    return s
}

function yt(r, s) {
    const a = {};
    for (const d of r) {
        const g = s.get(d),
            f = d.sector || "Unknown";
        a[f] || (a[f] = {
            "1M": [],
            "3M": [],
            "6M": [],
            "12M": []
        });
        for (const k of L) {
            const y = g[k.label];
            y != null && Number.isFinite(y) && a[f][k.label].push(y)
        }
    }
    const l = {};
    for (const d of Object.keys(a)) {
        l[d] = {
            "1M": null,
            "3M": null,
            "6M": null,
            "12M": null
        };
        for (const g of L) {
            const f = a[d][g.label];
            l[d][g.label] = f.length ? T(f) : null
        }
    }
    const c = new Map;
    for (const d of r) {
        const g = s.get(d),
            f = {},
            k = l[d.sector || "Unknown"];
        for (const y of L) {
            const A = g[y.label],
                v = k ? k[y.label] : null;
            f[y.label] = A != null && v != null ? A - v : null
        }
        c.set(d, f)
    }
    return c
}

function Rt(r) {
    const s = r.length;
    if (s === 0) return [];
    const a = r.map((c, d) => ({
        v: c,
        i: d
    }));
    a.sort((c, d) => c.v - d.v);
    const l = new Array(s);
    for (let c = 0; c < s; c++) {
        const d = Math.min(5, Math.floor(c / s * 5) + 1);
        l[a[c].i] = d
    }
    return l
}

function st(r, s, a, l, c) {
    const d = {
        bucket: r,
        horizon: s,
        n: a.length,
        meanReturn: a.length ? T(a) : NaN,
        medianReturn: a.length ? ie(a) : NaN,
        stdReturn: a.length ? xe(a) : NaN,
        hitRate: a.length ? a.filter(g => g >= c).length / a.length : NaN
    };
    return l && (d.meanReturnSR = l.length ? T(l) : NaN, d.hitRateSR = l.length ? l.filter(g => g >= c).length / l.length : NaN), d
}

function Mt(r, s) {
    const a = new Map;
    for (const o of r) a.has(o.date) || a.set(o.date, []), a.get(o.date).push(o);
    const l = [...a.keys()].sort(),
        c = {},
        d = {};
    for (const o of ["Q1", "Q2", "Q3", "Q4", "Q5"]) c[o] = {
        "1M": [],
        "3M": [],
        "6M": [],
        "12M": []
    }, d[o] = {
        "1M": [],
        "3M": [],
        "6M": [],
        "12M": []
    };
    const g = {},
        f = {};
    for (const o of ["BR", "BL", "TR", "TL"]) g[o] = {
        "1M": [],
        "3M": [],
        "6M": [],
        "12M": []
    }, f[o] = {
        "1M": [],
        "3M": [],
        "6M": [],
        "12M": []
    };
    const k = {};
    for (const o of l) k[o] = {
        "1M": {
            q1: [],
            q5: []
        },
        "3M": {
            q1: [],
            q5: []
        },
        "6M": {
            q1: [],
            q5: []
        },
        "12M": {
            q1: [],
            q5: []
        }
    };
    const y = [];
    let A = 0;
    for (const o of l) {
        const h = a.get(o),
            R = s.rankingMode ?? "peg",
            p = h.filter(i => !(i.mult == null || i.grw == null || !Number.isFinite(i.mult) || !Number.isFinite(i.grw) || !(i.mult > 0) || i.closeAtT == null || !(i.closeAtT > 0) || R === "peg" && !(i.grw > 0)));
        if (p.length < 5) continue;
        A += p.length;
        const I = new Map;
        for (const i of p) I.set(i, Nt(i));
        const te = s.sectorRelative ? yt(p, I) : null;
        let K;
        if (R === "zscore") {
            const i = p.map($ => $.mult),
                S = p.map($ => $.grw),
                O = T(i),
                z = xe(i),
                w = T(S),
                Q = xe(S),
                V = z > 1e-12 ? z : 1,
                J = Q > 1e-12 ? Q : 1;
            K = p.map($ => ($.mult - O) / V - ($.grw - w) / J)
        } else K = p.map(i => i.mult / i.grw);
        const M = Rt(K);
        for (let i = 0; i < p.length; i++) {
            const S = `Q${M[i]}`,
                O = I.get(p[i]),
                z = te ? te.get(p[i]) : null;
            for (const w of L) {
                const Q = O[w.label];
                if (Q != null && Number.isFinite(Q) && (c[S][w.label].push(Q), S === "Q1" && k[o][w.label].q1.push(Q), S === "Q5" && k[o][w.label].q5.push(Q)), z) {
                    const V = z[w.label];
                    V != null && Number.isFinite(V) && d[S][w.label].push(V)
                }
            }
        }
        const re = p.map(i => i.mult),
            ce = p.map(i => i.grw),
            fe = ie(re),
            Z = ie(ce);
        for (let i = 0; i < p.length; i++) {
            const S = p[i],
                O = S.mult <= fe,
                z = S.grw >= Z,
                w = O && z ? "BR" : O && !z ? "BL" : !O && z ? "TR" : "TL",
                Q = I.get(S),
                V = te ? te.get(S) : null;
            for (const J of L) {
                const $ = Q[J.label];
                if ($ != null && Number.isFinite($) && g[w][J.label].push($), V) {
                    const de = V[J.label];
                    de != null && Number.isFinite(de) && f[w][J.label].push(de)
                }
            }
        }
        const ge = K.map(i => -i);
        for (const i of L) {
            const S = [],
                O = [];
            for (let z = 0; z < p.length; z++) {
                const w = I.get(p[z])[i.label];
                w != null && Number.isFinite(w) && (S.push(w), O.push(ge[z]))
            }
            y.push({
                date: o,
                horizon: i.label,
                ic: jt(O, S)
            })
        }
    }
    const v = [];
    for (const o of ["Q1", "Q2", "Q3", "Q4", "Q5"])
        for (const h of L) v.push(st(o, h.label, c[o][h.label], s.sectorRelative ? d[o][h.label] : null, s.threshold));
    const E = [];
    for (const o of ["BR", "BL", "TR", "TL"])
        for (const h of L) E.push(st(o, h.label, g[o][h.label], s.sectorRelative ? f[o][h.label] : null, s.threshold));
    const x = {
        "1M": [],
        "3M": [],
        "6M": [],
        "12M": []
    };
    for (const o of l)
        for (const h of L) {
            const {
                q1: R,
                q5: p
            } = k[o][h.label];
            R.length === 0 || p.length === 0 || x[h.label].push(T(R) - T(p))
        }
    const _ = L.map(o => ({
            bucket: "Q1-Q5",
            horizon: o.label,
            n: x[o.label].length,
            meanReturn: x[o.label].length ? T(x[o.label]) : NaN,
            medianReturn: x[o.label].length ? ie(x[o.label]) : NaN,
            stdReturn: x[o.label].length ? xe(x[o.label]) : NaN,
            hitRate: x[o.label].length ? x[o.label].filter(h => h >= s.threshold).length / x[o.label].length : NaN
        })),
        P = L.map(o => {
            const h = g.BR[o.label],
                R = [...g.BL[o.label], ...g.TR[o.label], ...g.TL[o.label]];
            return h.length === 0 || R.length === 0 ? {
                bucket: "BR - Rest",
                horizon: o.label,
                n: 0,
                meanReturn: NaN,
                medianReturn: NaN,
                stdReturn: NaN,
                hitRate: NaN
            } : {
                bucket: "BR - Rest",
                horizon: o.label,
                n: h.length,
                meanReturn: T(h) - T(R),
                medianReturn: ie(h) - ie(R),
                stdReturn: NaN,
                hitRate: h.filter(p => p >= s.threshold).length / h.length
            }
        }),
        C = {},
        B = {};
    for (const o of L) {
        const h = y.filter(R => R.horizon === o.label && R.ic != null).map(R => R.ic);
        C[o.label] = h.length ? T(h) : null, B[o.label] = h.length ? xe(h) : null
    }
    const U = [];
    let G = 1,
        X = 1,
        u = 1;
    for (const o of l) {
        const {
            q1: h,
            q5: R
        } = k[o]["1M"];
        if (h.length === 0 || R.length === 0) continue;
        const p = T(h),
            I = T(R);
        G *= 1 + p, X *= 1 + I, u *= 1 + (p - I), U.push({
            date: o,
            q1: G,
            q5: X,
            ls: u
        })
    }
    return {
        nDates: l.length,
        nObservations: A,
        threshold: s.threshold,
        sectorRelative: s.sectorRelative,
        rankingMode: s.rankingMode ?? "peg",
        quintile: {
            bucketStats: v,
            longShort: _,
            icPerDate: y,
            icMeans: C,
            icStds: B,
            equityCurve: U
        },
        quadrant: {
            bucketStats: E,
            brMinusRest: P
        }
    }
}
const rt = {
        Valuation: ["P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2"],
        Yields: ["FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2", "Dividend Yield"],
        Growth: ["FY1 FFO Growth", "FY2 FFO Growth", "FY1 AFFO Growth", "FY2 AFFO Growth", "FY1 EPS Growth", "FY2 EPS Growth"],
        Performance: ["1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%", "% off 52wk High", "% off 52wk Low"],
        Estimates: ["EPS FY2", "FFO FY2", "AFFO FY2", "EBITDA FY2"],
        Other: ["close", "Enterprise Value", "Dividend Yield"]
    },
    kt = [{
        label: "Monthly (21d)",
        days: 21
    }, {
        label: "Quarterly (63d)",
        days: 63
    }, {
        label: "Semi-annual (126d)",
        days: 126
    }, {
        label: "Annual (252d)",
        days: 252
    }],
    Me = L.map(r => r.label),
    D = (r, s = 2) => r == null || !Number.isFinite(r) ? "—" : `${(r*100).toFixed(s)}%`,
    Be = (r, s = 3) => r == null || !Number.isFinite(r) ? "—" : r.toFixed(s),
    Ye = r => r == null || !Number.isFinite(r) ? "—" : String(Math.round(r));

function le(r, s = .1) {
    if (r == null || !Number.isFinite(r)) return "transparent";
    const a = Math.max(-1, Math.min(1, r / s));
    return a >= 0 ? `rgba(34, 197, 94, ${Math.min(.55,a*.55)})` : `rgba(239, 68, 68, ${Math.min(.55,-a*.55)})`
}

function ke(r, s) {
    const a = s.join(","),
        l = r.map(c => s.map(d => {
            const g = c[d];
            if (g == null) return "";
            const f = String(g);
            return f.includes(",") || f.includes('"') ? `"${f.replace(/"/g,'""')}"` : f
        }).join(","));
    return [a, ...l].join(`
`)
}

function ve(r, s) {
    const a = new Blob([s], {
            type: "text/csv;charset=utf-8"
        }),
        l = URL.createObjectURL(a),
        c = document.createElement("a");
    c.href = l, c.download = r, c.click(), URL.revokeObjectURL(l)
}

function vt(r, s) {
    return s == null || !Number.isFinite(s) ? null : ft(r) ? s / 100 : s
}

function St(r, s) {
    return s == null || !Number.isFinite(s) ? null : s
}

function Ct() {
    const r = dt(),
        [s, a] = m.useState("P/FFO FY2"),
        [l, c] = m.useState("FY2 FFO Growth"),
        [d, g] = m.useState(""),
        [f, k] = m.useState(""),
        [y, A] = m.useState(21),
        [v, E] = m.useState("5"),
        [x, _] = m.useState(!1),
        [P, C] = m.useState("peg"),
        [B, U] = m.useState(!1),
        [G, X] = m.useState({
            stage: "idle",
            done: 0,
            total: 0,
            message: ""
        }),
        [u, o] = m.useState(null),
        [h, R] = m.useState(null),
        p = m.useCallback(() => ({
            metricY: s,
            metricX: l,
            startDate: d,
            endDate: f,
            rebalanceDays: y,
            thresholdPct: v,
            sectorRelative: x,
            rankingMode: P
        }), [s, l, d, f, y, v, x, P]),
        I = m.useCallback(t => {
            !t || typeof t != "object" || (typeof t.metricY == "string" && a(t.metricY), typeof t.metricX == "string" && c(t.metricX), typeof t.startDate == "string" && g(t.startDate), typeof t.endDate == "string" && k(t.endDate), typeof t.rebalanceDays == "number" && Number.isFinite(t.rebalanceDays) && A(t.rebalanceDays), typeof t.thresholdPct == "string" && E(t.thresholdPct), typeof t.sectorRelative == "boolean" && _(t.sectorRelative), (t.rankingMode === "peg" || t.rankingMode === "zscore") && C(t.rankingMode))
        }, []);
    ut("factor-backtest", p, I);
    const te = He({
            queryKey: ["fb-dates"],
            queryFn: gt
        }),
        K = He({
            queryKey: ["fb-tickers"],
            queryFn: pt
        }),
        M = te.data ?? [],
        re = K.data ?? [];
    m.useMemo(() => {
        if (M.length) {
            if (!d) {
                const n = M.length - 1,
                    b = Math.max(0, n - 2520);
                g(M[b])
            }
            f || k(M[M.length - 1])
        }
    }, [M.length, d, f]);
    const ce = m.useMemo(() => {
            try {
                return ht()
            } catch {
                return []
            }
        }, [K.dataUpdatedAt]),
        fe = m.useMemo(() => {
            const t = Object.entries(rt).map(([n, b]) => ({
                group: n,
                metrics: b
            }));
            if (ce.length) {
                const n = new Set(Object.values(rt).flat()),
                    b = ce.filter(H => !n.has(H));
                b.length && t.push({
                    group: "Workbook",
                    metrics: b
                })
            }
            return t
        }, [ce]),
        Z = m.useMemo(() => {
            let t = re;
            return r.universeTickers && (t = t.filter(n => r.universeTickers.has(n.ticker))), t.map(n => n.ticker)
        }, [re, r.universeTickers]),
        ge = m.useMemo(() => {
            const t = new Map;
            for (const n of re) t.set(n.ticker, n.sector || "Unknown");
            return t
        }, [re]),
        i = m.useCallback(async () => {
            R(null), o(null), U(!0), X({
                stage: "fetching-dates",
                done: 0,
                total: 0,
                message: "Building rebalance schedule…"
            });
            try {
                let t = function(j, N) {
                    if (!j) return null;
                    if (j.has(N)) return j.get(N);
                    const F = M.indexOf(N);
                    if (F < 0) return null;
                    for (let W = F; W >= Math.max(0, F - 60); W--) {
                        const ee = j.get(M[W]);
                        if (ee != null) return ee
                    }
                    return null
                };
                if (M.length === 0) throw new Error("Dates not loaded");
                if (Z.length === 0) throw new Error("No tickers in universe");
                const n = Math.max(0, M.findIndex(j => j >= d));
                let b = M.length - 1;
                for (let j = M.length - 1; j >= 0; j--)
                    if (M[j] <= f) {
                        b = j;
                        break
                    } if (n > b) throw new Error("Start date after end date");
                const H = [];
                for (let j = n; j <= b; j += y) H.push(j);
                if (H.length === 0) throw new Error("No rebalance dates in range");
                const ne = (parseFloat(v) || 5) / 100;
                X({
                    stage: "fetching-closes",
                    done: 0,
                    total: Z.length,
                    message: `Loading price + factor series for ${Z.length} tickers…`
                });
                const ae = new Map,
                    Y = new Map,
                    Ee = new Map,
                    oe = [...Z];
                let at = 0;
                const ot = 8;
                async function lt() {
                    for (;;) {
                        const j = at++;
                        if (j >= oe.length) return;
                        const N = oe[j];
                        try {
                            const [F, W, ee] = await Promise.all([Te(N, "close"), Te(N, l), Te(N, s)]), ue = new Map;
                            for (const q of F) q.value != null && Number.isFinite(q.value) && ue.set(q.time, q.value);
                            ae.set(N, ue);
                            const he = new Map;
                            for (const q of W) q.value != null && Number.isFinite(q.value) && he.set(q.time, q.value);
                            Y.set(N, he);
                            const se = new Map;
                            for (const q of ee) q.value != null && Number.isFinite(q.value) && se.set(q.time, q.value);
                            Ee.set(N, se)
                        } catch {}
                        X(F => ({
                            ...F,
                            done: F.done + 1
                        }))
                    }
                }
                await Promise.all(Array.from({
                    length: ot
                }, lt)), X({
                    stage: "computing",
                    done: 0,
                    total: 1,
                    message: "Computing buckets, IC and equity curve…"
                });
                const Se = [],
                    it = {
                        "1M": 21,
                        "3M": 63,
                        "6M": 126,
                        "12M": 252
                    };
                let Oe = 0,
                    $e = 0,
                    Ae = 0,
                    _e = 0,
                    Ge = 0;
                const we = new Set,
                    Fe = new Set,
                    Ie = new Set;
                for (const j of H) {
                    const N = M[j];
                    for (const F of oe) {
                        const W = t(Y.get(F), N),
                            ee = t(Ee.get(F), N);
                        if (W != null && we.add(F), ee != null && Fe.add(F), W == null) {
                            Oe++;
                            continue
                        }
                        if (ee == null) {
                            $e++;
                            continue
                        }
                        const ue = vt(l, W),
                            he = St(s, ee);
                        if (ue == null || he == null) {
                            Ae++;
                            continue
                        }
                        const se = ae.get(F);
                        if (!se) {
                            _e++;
                            continue
                        }
                        se.size > 0 && Ie.add(F);
                        const q = se.get(N) ?? null;
                        if (q == null) {
                            Ge++;
                            continue
                        }
                        const Ce = {};
                        for (const ze of L) {
                            const Ve = j + it[ze.label];
                            if (Ve < M.length) {
                                const ct = M[Ve];
                                Ce[ze.label] = se.get(ct) ?? null
                            } else Ce[ze.label] = null
                        }
                        Se.push({
                            date: N,
                            ticker: F,
                            mult: he,
                            grw: ue,
                            sector: ge.get(F) || "Unknown",
                            closeAtT: q,
                            closeAtH: Ce
                        })
                    }
                }
                if (Se.length === 0) {
                    const j = H.length * oe.length,
                        N = [];
                    throw Fe.size === 0 && N.push(`Y metric "${s}" returned no data for any of ${oe.length} tickers — check that this metric exists for your universe.`), we.size === 0 && N.push(`X metric "${l}" returned no data for any of ${oe.length} tickers — check that this metric exists for your universe.`), N.length === 0 && N.push(`Joined 0 of ${j.toLocaleString()} candidate (date×ticker) pairs. Missing X: ${Oe.toLocaleString()}, missing Y: ${$e.toLocaleString()}, failed normalize: ${Ae.toLocaleString()}, no close series: ${_e.toLocaleString()}, no close on rebal date: ${Ge.toLocaleString()}. Tickers with any X: ${we.size}, with any Y: ${Fe.size}, with any close: ${Ie.size}.`), new Error(N.join(" "))
                }
                const qe = Mt(Se, {
                    threshold: ne,
                    sectorRelative: x,
                    rankingMode: P
                });
                o(qe), X({
                    stage: "done",
                    done: 1,
                    total: 1,
                    message: `Done — ${qe.nObservations.toLocaleString()} observations across ${qe.nDates} rebalance dates`
                })
            } catch (t) {
                const n = t?.message || String(t);
                R(n), X({
                    stage: "error",
                    done: 0,
                    total: 0,
                    message: n
                })
            } finally {
                U(!1)
            }
        }, [M, Z, d, f, y, l, s, v, x, P, ge]),
        S = m.useCallback(() => {
            if (!u) return;
            const t = u.quintile.bucketStats.map(n => ({
                bucket: n.bucket,
                horizon: n.horizon,
                n: n.n,
                meanReturn: n.meanReturn,
                medianReturn: n.medianReturn,
                stdReturn: n.stdReturn,
                hitRate: n.hitRate,
                meanReturnSR: n.meanReturnSR ?? "",
                hitRateSR: n.hitRateSR ?? ""
            }));
            ve(`factor_bt_quintile_${s}_${l}.csv`, ke(t, ["bucket", "horizon", "n", "meanReturn", "medianReturn", "stdReturn", "hitRate", "meanReturnSR", "hitRateSR"]))
        }, [u, l, s]),
        O = m.useCallback(() => {
            if (!u) return;
            const t = u.quadrant.bucketStats.map(n => ({
                bucket: n.bucket,
                horizon: n.horizon,
                n: n.n,
                meanReturn: n.meanReturn,
                medianReturn: n.medianReturn,
                stdReturn: n.stdReturn,
                hitRate: n.hitRate,
                meanReturnSR: n.meanReturnSR ?? "",
                hitRateSR: n.hitRateSR ?? ""
            }));
            ve(`factor_bt_quadrant_${s}_${l}.csv`, ke(t, ["bucket", "horizon", "n", "meanReturn", "medianReturn", "stdReturn", "hitRate", "meanReturnSR", "hitRateSR"]))
        }, [u, l, s]),
        z = m.useCallback(() => {
            u && ve(`factor_bt_ic_${s}_${l}.csv`, ke(u.quintile.icPerDate.map(t => ({
                date: t.date,
                horizon: t.horizon,
                ic: t.ic ?? ""
            })), ["date", "horizon", "ic"]))
        }, [u, l, s]),
        w = m.useCallback(() => {
            u && ve(`factor_bt_equity_${s}_${l}.csv`, ke(u.quintile.equityCurve.map(t => ({
                date: t.date,
                q1: t.q1,
                q5: t.q5,
                ls: t.ls
            })), ["date", "q1", "q5", "ls"]))
        }, [u, l, s]),
        Q = (t, n, b, H) => e.jsxs("div", {
            className: "border border-border rounded bg-card/40",
            children: [e.jsxs("div", {
                className: "px-3 py-2 border-b border-border flex items-center justify-between",
                children: [e.jsx("div", {
                    className: "font-semibold text-sm",
                    children: t
                }), e.jsxs(ye, {
                    size: "sm",
                    variant: "ghost",
                    onClick: H,
                    className: "h-7 text-xs",
                    children: [e.jsx(Pe, {
                        className: "w-3 h-3 mr-1"
                    }), " CSV"]
                })]
            }), e.jsx("div", {
                className: "overflow-x-auto",
                children: e.jsxs("table", {
                    className: "text-xs w-full",
                    children: [e.jsx("thead", {
                        children: e.jsxs("tr", {
                            className: "border-b border-border bg-muted/30",
                            children: [e.jsx("th", {
                                className: "text-left px-2 py-1.5 font-medium",
                                children: "Bucket"
                            }), e.jsx("th", {
                                className: "text-right px-2 py-1.5 font-medium",
                                children: "Horizon"
                            }), e.jsx("th", {
                                className: "text-right px-2 py-1.5 font-medium",
                                children: "N"
                            }), e.jsx("th", {
                                className: "text-right px-2 py-1.5 font-medium",
                                children: "Mean"
                            }), e.jsx("th", {
                                className: "text-right px-2 py-1.5 font-medium",
                                children: "Median"
                            }), e.jsx("th", {
                                className: "text-right px-2 py-1.5 font-medium",
                                children: "Stdev"
                            }), e.jsxs("th", {
                                className: "text-right px-2 py-1.5 font-medium",
                                children: ["Hit ≥", v, "%"]
                            }), x && e.jsxs(e.Fragment, {
                                children: [e.jsx("th", {
                                    className: "text-right px-2 py-1.5 font-medium text-amber-400",
                                    children: "Mean (SR)"
                                }), e.jsx("th", {
                                    className: "text-right px-2 py-1.5 font-medium text-amber-400",
                                    children: "Hit (SR)"
                                })]
                            })]
                        })
                    }), e.jsx("tbody", {
                        children: n.map(({
                            bucket: ne,
                            horizon: ae
                        }) => {
                            const Y = b.get(`${ne}|${ae}`);
                            return Y ? e.jsxs("tr", {
                                className: "border-b border-border/50 hover:bg-muted/20",
                                children: [e.jsx("td", {
                                    className: "px-2 py-1.5 font-mono",
                                    children: ne
                                }), e.jsx("td", {
                                    className: "text-right px-2 py-1.5",
                                    children: ae
                                }), e.jsx("td", {
                                    className: "text-right px-2 py-1.5 font-mono text-muted-foreground",
                                    children: Ye(Y.n)
                                }), e.jsx("td", {
                                    className: "text-right px-2 py-1.5 font-mono",
                                    style: {
                                        background: le(Y.meanReturn, .05)
                                    },
                                    children: D(Y.meanReturn)
                                }), e.jsx("td", {
                                    className: "text-right px-2 py-1.5 font-mono",
                                    style: {
                                        background: le(Y.medianReturn, .05)
                                    },
                                    children: D(Y.medianReturn)
                                }), e.jsx("td", {
                                    className: "text-right px-2 py-1.5 font-mono text-muted-foreground",
                                    children: D(Y.stdReturn)
                                }), e.jsx("td", {
                                    className: "text-right px-2 py-1.5 font-mono",
                                    children: D(Y.hitRate, 1)
                                }), x && e.jsxs(e.Fragment, {
                                    children: [e.jsx("td", {
                                        className: "text-right px-2 py-1.5 font-mono text-amber-300",
                                        style: {
                                            background: le(Y.meanReturnSR, .03)
                                        },
                                        children: D(Y.meanReturnSR)
                                    }), e.jsx("td", {
                                        className: "text-right px-2 py-1.5 font-mono text-amber-300",
                                        children: D(Y.hitRateSR, 1)
                                    })]
                                })]
                            }, `${ne}-${ae}`) : null
                        })
                    })]
                })
            })]
        }),
        V = m.useMemo(() => {
            const t = new Map;
            if (u)
                for (const n of u.quintile.bucketStats) t.set(`${n.bucket}|${n.horizon}`, n);
            return t
        }, [u]),
        J = m.useMemo(() => {
            const t = new Map;
            if (u)
                for (const n of u.quadrant.bucketStats) t.set(`${n.bucket}|${n.horizon}`, n);
            return t
        }, [u]),
        $ = m.useMemo(() => {
            const t = [];
            for (const n of ["Q1", "Q2", "Q3", "Q4", "Q5"])
                for (const b of Me) t.push({
                    bucket: n,
                    horizon: b
                });
            return t
        }, []),
        de = m.useMemo(() => {
            const t = [];
            for (const n of ["BR", "BL", "TR", "TL"])
                for (const b of Me) t.push({
                    bucket: n,
                    horizon: b
                });
            return t
        }, []),
        Qe = m.useMemo(() => {
            if (!u) return [];
            const t = new Map;
            for (const n of u.quintile.icPerDate) t.has(n.date) || t.set(n.date, {
                date: n.date
            }), t.get(n.date)[n.horizon] = n.ic;
            return [...t.values()].sort((n, b) => n.date.localeCompare(b.date))
        }, [u]),
        De = m.useMemo(() => u?.quintile.equityCurve ?? [], [u]);
    return e.jsxs("div", {
        className: "flex flex-col h-full overflow-hidden",
        children: [e.jsxs("div", {
            className: "border-b border-border bg-card/40 px-3 py-2 flex flex-wrap items-center gap-2 text-xs",
            children: [e.jsxs("div", {
                className: "flex items-center gap-1",
                children: [e.jsx("span", {
                    className: "text-muted-foreground",
                    children: "Y (Multiple):"
                }), e.jsxs(pe, {
                    value: s,
                    onValueChange: a,
                    children: [e.jsx(be, {
                        className: "h-7 w-44 text-xs",
                        children: e.jsx(je, {})
                    }), e.jsx(Ne, {
                        children: fe.map(t => e.jsxs("div", {
                            children: [e.jsx("div", {
                                className: "px-2 py-1 text-[10px] uppercase text-muted-foreground",
                                children: t.group
                            }), t.metrics.map(n => e.jsx(me, {
                                value: n,
                                className: "text-xs",
                                children: n
                            }, n))]
                        }, t.group))
                    })]
                })]
            }), e.jsxs("div", {
                className: "flex items-center gap-1",
                children: [e.jsx("span", {
                    className: "text-muted-foreground",
                    children: "X (Growth):"
                }), e.jsxs(pe, {
                    value: l,
                    onValueChange: c,
                    children: [e.jsx(be, {
                        className: "h-7 w-44 text-xs",
                        children: e.jsx(je, {})
                    }), e.jsx(Ne, {
                        children: fe.map(t => e.jsxs("div", {
                            children: [e.jsx("div", {
                                className: "px-2 py-1 text-[10px] uppercase text-muted-foreground",
                                children: t.group
                            }), t.metrics.map(n => e.jsx(me, {
                                value: n,
                                className: "text-xs",
                                children: n
                            }, n))]
                        }, t.group))
                    })]
                })]
            }), e.jsxs("div", {
                className: "flex items-center gap-1",
                children: [e.jsx("span", {
                    className: "text-muted-foreground",
                    children: "Range:"
                }), e.jsx(Le, {
                    type: "date",
                    value: d,
                    onChange: t => g(t.target.value),
                    className: "h-7 w-32 text-xs"
                }), e.jsx("span", {
                    children: "→"
                }), e.jsx(Le, {
                    type: "date",
                    value: f,
                    onChange: t => k(t.target.value),
                    className: "h-7 w-32 text-xs"
                })]
            }), e.jsxs("div", {
                className: "flex items-center gap-1",
                children: [e.jsx("span", {
                    className: "text-muted-foreground",
                    children: "Rebalance:"
                }), e.jsxs(pe, {
                    value: String(y),
                    onValueChange: t => A(parseInt(t)),
                    children: [e.jsx(be, {
                        className: "h-7 w-36 text-xs",
                        children: e.jsx(je, {})
                    }), e.jsx(Ne, {
                        children: kt.map(t => e.jsx(me, {
                            value: String(t.days),
                            className: "text-xs",
                            children: t.label
                        }, t.days))
                    })]
                })]
            }), e.jsxs("div", {
                className: "flex items-center gap-1",
                children: [e.jsx("span", {
                    className: "text-muted-foreground",
                    children: "Threshold:"
                }), e.jsx(Le, {
                    type: "number",
                    step: "0.5",
                    value: v,
                    onChange: t => E(t.target.value),
                    className: "h-7 w-16 text-xs"
                }), e.jsx("span", {
                    children: "%"
                })]
            }), e.jsxs("div", {
                className: "flex items-center gap-1",
                children: [e.jsx(mt, {
                    checked: x,
                    onCheckedChange: _
                }), e.jsx("span", {
                    className: "text-muted-foreground",
                    children: "Sector-relative"
                })]
            }), e.jsxs("div", {
                className: "flex items-center gap-1",
                children: [e.jsx("span", {
                    className: "text-muted-foreground",
                    children: "Rank:"
                }), e.jsxs(pe, {
                    value: P,
                    onValueChange: t => C(t),
                    children: [e.jsx(be, {
                        className: "h-7 w-36 text-xs",
                        children: e.jsx(je, {})
                    }), e.jsxs(Ne, {
                        children: [e.jsx(me, {
                            value: "peg",
                            className: "text-xs",
                            children: "PEG (mult/grw)"
                        }), e.jsx(me, {
                            value: "zscore",
                            className: "text-xs",
                            children: "Z-score composite"
                        })]
                    })]
                })]
            }), e.jsxs("div", {
                className: "text-muted-foreground",
                children: ["Universe: ", e.jsx("span", {
                    className: "text-foreground font-mono",
                    children: Z.length
                }), " tickers", r.isFiltered && e.jsx("span", {
                    className: "text-amber-400 ml-1",
                    children: "(filtered)"
                })]
            }), e.jsx("div", {
                className: "flex-1"
            }), e.jsx(ye, {
                onClick: i,
                disabled: B || te.isLoading || K.isLoading,
                size: "sm",
                className: "h-7 text-xs",
                children: B ? e.jsxs(e.Fragment, {
                    children: [e.jsx(Ue, {
                        className: "w-3 h-3 mr-1 animate-spin"
                    }), " Running…"]
                }) : e.jsxs(e.Fragment, {
                    children: [e.jsx(bt, {
                        className: "w-3 h-3 mr-1"
                    }), " Run Backtest"]
                })
            })]
        }), (B || G.stage !== "idle") && e.jsxs("div", {
            className: "px-3 py-1.5 text-xs border-b border-border bg-card/20 flex items-center gap-2",
            children: [B && e.jsx(Ue, {
                className: "w-3 h-3 animate-spin text-muted-foreground"
            }), e.jsxs("span", {
                className: G.stage === "error" ? "text-red-400" : "text-muted-foreground",
                children: [G.message, G.total > 0 && G.stage !== "done" && G.stage !== "error" && e.jsxs(e.Fragment, {
                    children: [" · ", G.done, "/", G.total]
                })]
            })]
        }), e.jsxs("div", {
            className: "flex-1 overflow-auto p-3 space-y-4",
            children: [!u && !B && e.jsxs("div", {
                className: "text-xs text-muted-foreground border border-dashed border-border rounded p-4 flex items-start gap-2",
                children: [e.jsx(xt, {
                    className: "w-4 h-4 flex-shrink-0 mt-0.5"
                }), e.jsxs("div", {
                    children: [e.jsx("div", {
                        className: "font-semibold mb-1",
                        children: "Cheap-Growth / PEG Factor Backtest"
                    }), e.jsxs("div", {
                        children: ["Tests whether stocks in the ", e.jsx("span", {
                            className: "font-mono",
                            children: "bottom-right quadrant"
                        }), " (low Y multiple + high X growth) generate higher forward returns. ", e.jsx("span", {
                            className: "font-mono",
                            children: "Q1"
                        }), " = cheapest PEG (mult ÷ growth) ⇒ expected outperformer. ", e.jsx("span", {
                            className: "font-mono",
                            children: "BR"
                        }), " quadrant uses cross-sectional medians on each date. IC = Spearman rank correlation between -PEG and forward return per date. Sector-relative mode subtracts each ticker's sector mean return at the same date+horizon."]
                    }), e.jsx("div", {
                        className: "mt-2 text-muted-foreground/70",
                        children: "Defaults: P/FFO FY2 vs FY2 FFO Growth, monthly rebalance, +5% hit-rate. Set the active universe via the Universe tab to scope the run."
                    })]
                })]
            }), u && e.jsxs(e.Fragment, {
                children: [e.jsxs("div", {
                    className: "text-xs flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground",
                    children: [e.jsxs("div", {
                        children: [e.jsx("span", {
                            className: "text-foreground font-semibold",
                            children: u.nDates
                        }), " rebalance dates"]
                    }), e.jsxs("div", {
                        children: [e.jsx("span", {
                            className: "text-foreground font-semibold",
                            children: u.nObservations.toLocaleString()
                        }), " observations"]
                    }), e.jsxs("div", {
                        children: ["Threshold: ", e.jsxs("span", {
                            className: "text-foreground",
                            children: [v, "%"]
                        })]
                    }), e.jsxs("div", {
                        children: ["Mode: ", e.jsx("span", {
                            className: "text-foreground",
                            children: x ? "Sector-relative" : "Absolute"
                        })]
                    }), e.jsxs("div", {
                        children: ["Rank: ", e.jsx("span", {
                            className: "text-foreground",
                            children: (u.rankingMode ?? "peg") === "zscore" ? "Z-score" : "PEG"
                        })]
                    }), e.jsxs("div", {
                        children: ["Y: ", e.jsx("span", {
                            className: "text-foreground font-mono",
                            children: s
                        })]
                    }), e.jsxs("div", {
                        children: ["X: ", e.jsx("span", {
                            className: "text-foreground font-mono",
                            children: l
                        })]
                    })]
                }), e.jsxs("div", {
                    className: "border border-border rounded bg-card/40",
                    children: [e.jsxs("div", {
                        className: "px-3 py-2 border-b border-border flex items-center justify-between",
                        children: [e.jsx("div", {
                            className: "font-semibold text-sm",
                            children: "Information Coefficient (Spearman rank corr of -PEG vs forward return)"
                        }), e.jsxs(ye, {
                            size: "sm",
                            variant: "ghost",
                            onClick: z,
                            className: "h-7 text-xs",
                            children: [e.jsx(Pe, {
                                className: "w-3 h-3 mr-1"
                            }), " CSV (per date)"]
                        })]
                    }), e.jsx("div", {
                        className: "overflow-x-auto",
                        children: e.jsxs("table", {
                            className: "text-xs w-full",
                            children: [e.jsx("thead", {
                                children: e.jsxs("tr", {
                                    className: "border-b border-border bg-muted/30",
                                    children: [e.jsx("th", {
                                        className: "text-left px-2 py-1.5 font-medium",
                                        children: "Horizon"
                                    }), e.jsx("th", {
                                        className: "text-right px-2 py-1.5 font-medium",
                                        children: "Mean IC"
                                    }), e.jsx("th", {
                                        className: "text-right px-2 py-1.5 font-medium",
                                        children: "Stdev IC"
                                    }), e.jsx("th", {
                                        className: "text-right px-2 py-1.5 font-medium",
                                        children: "IR (mean/std)"
                                    }), e.jsx("th", {
                                        className: "text-right px-2 py-1.5 font-medium",
                                        children: "Interpretation"
                                    })]
                                })
                            }), e.jsx("tbody", {
                                children: Me.map(t => {
                                    const n = u.quintile.icMeans[t],
                                        b = u.quintile.icStds[t],
                                        H = n != null && b != null && b > 0 ? n / b : null,
                                        ne = n == null ? "—" : n >= .05 ? "Strong predictive (cheap PEG → higher ret)" : n >= .02 ? "Mild predictive" : n >= -.02 ? "Noise" : n >= -.05 ? "Mild contrarian" : "Strong contrarian (cheap PEG → lower ret)";
                                    return e.jsxs("tr", {
                                        className: "border-b border-border/50",
                                        children: [e.jsx("td", {
                                            className: "px-2 py-1.5 font-mono",
                                            children: t
                                        }), e.jsx("td", {
                                            className: "text-right px-2 py-1.5 font-mono",
                                            style: {
                                                background: le(n, .05)
                                            },
                                            children: Be(n)
                                        }), e.jsx("td", {
                                            className: "text-right px-2 py-1.5 font-mono text-muted-foreground",
                                            children: Be(b)
                                        }), e.jsx("td", {
                                            className: "text-right px-2 py-1.5 font-mono",
                                            children: Be(H)
                                        }), e.jsx("td", {
                                            className: "text-right px-2 py-1.5 text-muted-foreground",
                                            children: ne
                                        })]
                                    }, t)
                                })
                            })]
                        })
                    })]
                }), Qe.length > 1 && e.jsxs("div", {
                    className: "border border-border rounded bg-card/40",
                    children: [e.jsx("div", {
                        className: "px-3 py-2 border-b border-border font-semibold text-sm",
                        children: "IC over time (per rebalance date)"
                    }), e.jsx("div", {
                        className: "h-56 px-2 py-2",
                        children: e.jsx(Xe, {
                            width: "100%",
                            height: "100%",
                            children: e.jsxs(We, {
                                data: Qe,
                                margin: {
                                    top: 8,
                                    right: 16,
                                    bottom: 8,
                                    left: 8
                                },
                                children: [e.jsx(nt, {
                                    strokeDasharray: "3 3",
                                    stroke: "rgba(255,255,255,0.06)"
                                }), e.jsx(Ke, {
                                    dataKey: "date",
                                    tick: {
                                        fontSize: 10
                                    },
                                    minTickGap: 40
                                }), e.jsx(Ze, {
                                    tick: {
                                        fontSize: 10
                                    },
                                    domain: [-1, 1]
                                }), e.jsx(Je, {
                                    contentStyle: {
                                        background: "rgba(15,15,15,0.95)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        fontSize: 11
                                    },
                                    formatter: t => t == null ? "—" : Number(t).toFixed(3)
                                }), e.jsx(et, {
                                    y: 0,
                                    stroke: "rgba(255,255,255,0.2)"
                                }), e.jsx(tt, {
                                    wrapperStyle: {
                                        fontSize: 11
                                    }
                                }), Me.map((t, n) => {
                                    const b = ["#22c55e", "#0ea5e9", "#a855f7", "#f59e0b"];
                                    return e.jsx(Re, {
                                        type: "monotone",
                                        dataKey: t,
                                        stroke: b[n],
                                        dot: !1,
                                        strokeWidth: 1.4,
                                        connectNulls: !0
                                    }, t)
                                })]
                            })
                        })
                    })]
                }), Q("Quintile Buckets (Q1 = cheapest PEG = lowest mult/grw)", $, V, S), e.jsxs("div", {
                    className: "border border-border rounded bg-card/40",
                    children: [e.jsx("div", {
                        className: "px-3 py-2 border-b border-border font-semibold text-sm",
                        children: "Long-Short Spread (Q1 − Q5 per date, then averaged)"
                    }), e.jsx("div", {
                        className: "overflow-x-auto",
                        children: e.jsxs("table", {
                            className: "text-xs w-full",
                            children: [e.jsx("thead", {
                                children: e.jsxs("tr", {
                                    className: "border-b border-border bg-muted/30",
                                    children: [e.jsx("th", {
                                        className: "text-left px-2 py-1.5 font-medium",
                                        children: "Horizon"
                                    }), e.jsx("th", {
                                        className: "text-right px-2 py-1.5 font-medium",
                                        children: "N dates"
                                    }), e.jsx("th", {
                                        className: "text-right px-2 py-1.5 font-medium",
                                        children: "Mean"
                                    }), e.jsx("th", {
                                        className: "text-right px-2 py-1.5 font-medium",
                                        children: "Median"
                                    }), e.jsx("th", {
                                        className: "text-right px-2 py-1.5 font-medium",
                                        children: "Stdev"
                                    }), e.jsxs("th", {
                                        className: "text-right px-2 py-1.5 font-medium",
                                        children: ["Dates ≥", v, "%"]
                                    })]
                                })
                            }), e.jsx("tbody", {
                                children: u.quintile.longShort.map(t => e.jsxs("tr", {
                                    className: "border-b border-border/50",
                                    children: [e.jsx("td", {
                                        className: "px-2 py-1.5 font-mono",
                                        children: t.horizon
                                    }), e.jsx("td", {
                                        className: "text-right px-2 py-1.5 text-muted-foreground",
                                        children: Ye(t.n)
                                    }), e.jsx("td", {
                                        className: "text-right px-2 py-1.5 font-mono",
                                        style: {
                                            background: le(t.meanReturn, .02)
                                        },
                                        children: D(t.meanReturn)
                                    }), e.jsx("td", {
                                        className: "text-right px-2 py-1.5 font-mono",
                                        children: D(t.medianReturn)
                                    }), e.jsx("td", {
                                        className: "text-right px-2 py-1.5 font-mono text-muted-foreground",
                                        children: D(t.stdReturn)
                                    }), e.jsx("td", {
                                        className: "text-right px-2 py-1.5 font-mono",
                                        children: D(t.hitRate, 1)
                                    })]
                                }, t.horizon))
                            })]
                        })
                    })]
                }), De.length > 1 && e.jsxs("div", {
                    className: "border border-border rounded bg-card/40",
                    children: [e.jsxs("div", {
                        className: "px-3 py-2 border-b border-border flex items-center justify-between",
                        children: [e.jsx("div", {
                            className: "font-semibold text-sm",
                            children: "Compounded 1M Returns — Q1 (cheap PEG long), Q5 (expensive short), L−S"
                        }), e.jsxs(ye, {
                            size: "sm",
                            variant: "ghost",
                            onClick: w,
                            className: "h-7 text-xs",
                            children: [e.jsx(Pe, {
                                className: "w-3 h-3 mr-1"
                            }), " CSV"]
                        })]
                    }), e.jsx("div", {
                        className: "h-64 px-2 py-2",
                        children: e.jsx(Xe, {
                            width: "100%",
                            height: "100%",
                            children: e.jsxs(We, {
                                data: De,
                                margin: {
                                    top: 8,
                                    right: 16,
                                    bottom: 8,
                                    left: 8
                                },
                                children: [e.jsx(nt, {
                                    strokeDasharray: "3 3",
                                    stroke: "rgba(255,255,255,0.06)"
                                }), e.jsx(Ke, {
                                    dataKey: "date",
                                    tick: {
                                        fontSize: 10
                                    },
                                    minTickGap: 40
                                }), e.jsx(Ze, {
                                    tick: {
                                        fontSize: 10
                                    }
                                }), e.jsx(Je, {
                                    contentStyle: {
                                        background: "rgba(15,15,15,0.95)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        fontSize: 11
                                    },
                                    formatter: t => t == null ? "—" : Number(t).toFixed(3)
                                }), e.jsx(et, {
                                    y: 1,
                                    stroke: "rgba(255,255,255,0.2)"
                                }), e.jsx(tt, {
                                    wrapperStyle: {
                                        fontSize: 11
                                    }
                                }), e.jsx(Re, {
                                    type: "monotone",
                                    dataKey: "q1",
                                    stroke: "#22c55e",
                                    dot: !1,
                                    strokeWidth: 1.5,
                                    name: "Q1 (cheap PEG)"
                                }), e.jsx(Re, {
                                    type: "monotone",
                                    dataKey: "q5",
                                    stroke: "#ef4444",
                                    dot: !1,
                                    strokeWidth: 1.5,
                                    name: "Q5 (expensive)"
                                }), e.jsx(Re, {
                                    type: "monotone",
                                    dataKey: "ls",
                                    stroke: "#0ea5e9",
                                    dot: !1,
                                    strokeWidth: 1.8,
                                    name: "L−S spread"
                                })]
                            })
                        })
                    })]
                }), Q("Quadrant Buckets (BR = LowMult + HighGrowth — your target)", de, J, O), e.jsxs("div", {
                    className: "border border-border rounded bg-card/40",
                    children: [e.jsx("div", {
                        className: "px-3 py-2 border-b border-border font-semibold text-sm",
                        children: "BR Quadrant vs Rest (BR mean − mean of BL/TR/TL)"
                    }), e.jsx("div", {
                        className: "overflow-x-auto",
                        children: e.jsxs("table", {
                            className: "text-xs w-full",
                            children: [e.jsx("thead", {
                                children: e.jsxs("tr", {
                                    className: "border-b border-border bg-muted/30",
                                    children: [e.jsx("th", {
                                        className: "text-left px-2 py-1.5 font-medium",
                                        children: "Horizon"
                                    }), e.jsx("th", {
                                        className: "text-right px-2 py-1.5 font-medium",
                                        children: "N (BR)"
                                    }), e.jsx("th", {
                                        className: "text-right px-2 py-1.5 font-medium",
                                        children: "Mean diff"
                                    }), e.jsx("th", {
                                        className: "text-right px-2 py-1.5 font-medium",
                                        children: "Median diff"
                                    }), e.jsxs("th", {
                                        className: "text-right px-2 py-1.5 font-medium",
                                        children: ["BR hit ≥", v, "%"]
                                    })]
                                })
                            }), e.jsx("tbody", {
                                children: u.quadrant.brMinusRest.map(t => e.jsxs("tr", {
                                    className: "border-b border-border/50",
                                    children: [e.jsx("td", {
                                        className: "px-2 py-1.5 font-mono",
                                        children: t.horizon
                                    }), e.jsx("td", {
                                        className: "text-right px-2 py-1.5 text-muted-foreground",
                                        children: Ye(t.n)
                                    }), e.jsx("td", {
                                        className: "text-right px-2 py-1.5 font-mono",
                                        style: {
                                            background: le(t.meanReturn, .02)
                                        },
                                        children: D(t.meanReturn)
                                    }), e.jsx("td", {
                                        className: "text-right px-2 py-1.5 font-mono",
                                        children: D(t.medianReturn)
                                    }), e.jsx("td", {
                                        className: "text-right px-2 py-1.5 font-mono",
                                        children: D(t.hitRate, 1)
                                    })]
                                }, t.horizon))
                            })]
                        })
                    })]
                })]
            })]
        })]
    })
}
export {
    Ct as
    default
};