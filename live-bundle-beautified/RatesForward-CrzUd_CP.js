import {
    r as c,
    bw as U,
    aF as ce,
    aJ as he,
    ed as Re,
    bo as Te,
    j as e,
    bs as Fe,
    Y as $e,
    aG as Le,
    aH as Pe
} from "./index-CsG73Aq_.js";
import {
    T as We
} from "./trending-down-26dsT41Y.js";
const fe = [{
        id: "DGS1MO",
        years: 1 / 12,
        label: "1M"
    }, {
        id: "DGS3MO",
        years: .25,
        label: "3M"
    }, {
        id: "DGS6MO",
        years: .5,
        label: "6M"
    }, {
        id: "DGS1",
        years: 1,
        label: "1Y"
    }, {
        id: "DGS2",
        years: 2,
        label: "2Y"
    }, {
        id: "DGS3",
        years: 3,
        label: "3Y"
    }, {
        id: "DGS5",
        years: 5,
        label: "5Y"
    }, {
        id: "DGS7",
        years: 7,
        label: "7Y"
    }, {
        id: "DGS10",
        years: 10,
        label: "10Y"
    }],
    ge = 25,
    Z = (n, w = 2) => n == null || !isFinite(n) ? "—" : `${n.toFixed(w)}%`;

function oe(n, w) {
    if (!n.length) return null;
    let a = 0,
        k = n.length - 1,
        f = -1;
    for (; a <= k;) {
        const L = a + k >> 1;
        n[L].time <= w ? (f = L, a = L + 1) : k = L - 1
    }
    return f >= 0 ? n[f].value : null
}

function ue(n) {
    if (!n.length) return null;
    const w = n[n.length - 1];
    return {
        value: w.value,
        time: w.time
    }
}

function Q(n, w) {
    const a = new Date(n + "T00:00:00Z");
    return a.setUTCDate(a.getUTCDate() - w), a.toISOString().slice(0, 10)
}
const Ee = 1.45;

function se(n, w) {
    if (!n.length) return null;
    const a = n[n.length - 1],
        k = Q(a.time, Math.round(w * Ee)),
        f = oe(n, k);
    return f == null ? null : a.value - f
}

function De(n, w) {
    if (n.length < 2) return [];
    const a = n.slice().sort((i, u) => i.years - u.years),
        k = a[a.length - 1].years,
        f = i => {
            if (i <= a[0].years) return a[0].rate;
            if (i >= k) return a[a.length - 1].rate;
            for (let u = 0; u < a.length - 1; u++) {
                const g = a[u],
                    y = a[u + 1];
                if (i >= g.years && i <= y.years) {
                    const $ = (i - g.years) / (y.years - g.years);
                    return g.rate + $ * (y.rate - g.rate)
                }
            }
            return a[a.length - 1].rate
        },
        L = Math.max(2, Math.round(k / .5)),
        v = [];
    for (let i = 1; i <= L; i++) v.push(i * .5);
    const P = [];
    for (let i = 0; i < v.length; i++) {
        const u = v[i],
            g = f(u) / 100;
        if (u <= 1 + 1e-9) {
            P.push(1 / (1 + g * u));
            continue
        }
        let y = 0;
        for (let p = 0; p < i; p++) y += P[p];
        const $ = 1 + g * .5;
        if ($ === 0) {
            P.push(P[i - 1] ?? 1);
            continue
        }
        const N = (1 - g * .5 * y) / $;
        P.push(N > 1e-9 ? N : 1e-9)
    }
    const R = P.map((i, u) => -Math.log(i) / v[u] * 100),
        O = i => {
            if (i < v[0]) {
                const u = f(Math.max(i, .08333333333333333)) / 100,
                    g = Math.max(i, 1 / 12),
                    y = 1 / (1 + u * g);
                return -Math.log(y) / g * 100
            }
            if (i >= v[v.length - 1]) return R[R.length - 1];
            for (let u = 0; u < v.length - 1; u++) {
                const g = v[u],
                    y = v[u + 1];
                if (i >= g && i <= y) {
                    const $ = (i - g) / (y - g);
                    return R[u] + $ * (R[u + 1] - R[u])
                }
            }
            return R[R.length - 1]
        },
        W = 1 / 12;
    return w.map(i => {
        const u = O(i),
            g = O(i + W),
            y = O(Math.max(.01, i - W)),
            $ = (g - y) / (2 * W),
            N = u + i * $;
        return {
            years: i,
            forward: N,
            spot: u
        }
    })
}

function Ce(n, w) {
    return fe.map(a => ({
        tenor: a,
        rate: oe(n[a.id] || [], w) ?? NaN
    })).filter(a => isFinite(a.rate))
}

function ke(n) {
    const {
        fwdCurve: w,
        spot3m: a,
        twoYearChange30d: k,
        termPremium: f,
        termPremiumChange30d: L,
        twoTenSpread: v,
        twoTenChange30d: P
    } = n;
    let R = 0,
        O = "—";
    if (a != null && w.length) {
        const C = w.find(m => Math.abs(m.years - 1) < .05)?.forward,
            T = w.find(m => Math.abs(m.years - 2) < .05)?.forward ?? C ?? null;
        if (T != null) {
            const m = (a - T) * 100;
            R = Math.max(-100, Math.min(100, m * .75));
            const E = m / ge;
            O = `${E>=0?"+":""}${E.toFixed(1)} cuts priced by 24m`
        }
    }
    let W = 0,
        i = "—";
    k != null && (W = Math.max(-100, Math.min(100, -k * 200)), i = `${k>=0?"+":""}${(k*100).toFixed(0)}bp over 30d`);
    let u = 0,
        g = "—";
    if (f != null && L != null) {
        const C = Math.max(-50, Math.min(60, L * 300)),
            b = Math.max(-30, Math.min(40, (f - .5) * 80));
        u = C + b, u = Math.max(-100, Math.min(100, u)), g = `TP ${Z(f)} (${L>=0?"+":""}${(L*100).toFixed(0)}bp 30d)`
    }
    let y = 0,
        $ = "—";
    if (v != null && P != null) {
        const C = Math.max(-60, Math.min(60, P * 300)),
            b = Math.max(-40, Math.min(40, v * 60));
        y = C + b, y = Math.max(-100, Math.min(100, y)), $ = `2s10s ${Z(v)} (${P>=0?"+":""}${(P*100).toFixed(0)}bp 30d)`
    }
    const N = (R + W + u + y) / 4;
    let p = "Neutral";
    return N >= 50 ? p = "Convexity Activated" : N >= 20 ? p = "Convexity Building" : N >= -20 ? p = "Mixed / Neutral" : N >= -50 ? p = "Rates Risk-On" : p = "Convexity Suppressed", {
        score: N,
        regime: p,
        components: [{
            label: "Forward Path",
            score: R,
            reason: O
        }, {
            label: "2Y Direction",
            score: W,
            reason: i
        }, {
            label: "Term Premium",
            score: u,
            reason: g
        }, {
            label: "2s10s Slope",
            score: y,
            reason: $
        }]
    }
}

function me() {
    return {
        layout: {
            background: {
                type: Pe.Solid,
                color: "transparent"
            },
            textColor: "#a1a1aa",
            fontSize: 11
        },
        grid: {
            vertLines: {
                color: "rgba(82, 82, 91, 0.15)"
            },
            horzLines: {
                color: "rgba(82, 82, 91, 0.15)"
            }
        },
        crosshair: {
            mode: Le.Normal
        },
        rightPriceScale: {
            borderVisible: !1
        },
        timeScale: {
            borderVisible: !1,
            timeVisible: !1,
            secondsVisible: !1
        },
        autoSize: !1
    }
}

function ze() {
    const [n, w] = c.useState({}), [a, k] = c.useState([]), [f, L] = c.useState([]), [v, P] = c.useState([]), [R, O] = c.useState([]), [W, i] = c.useState([]), [u, g] = c.useState(!0), [y, $] = c.useState(null);
    c.useEffect(() => {
        let s = !1;
        return (async () => {
            try {
                g(!0);
                const [r, o, d, t, h, x, S] = await Promise.all([Promise.all(fe.map(M => U(M.id))), U("DGS2"), U("DGS10"), U("THREEFYTP10"), U("THREEFY10"), U("THREEFF10"), U("VNQ").catch(() => [])]);
                if (s) return;
                const z = {};
                fe.forEach((M, _) => {
                    z[M.id] = r[_]
                }), w(z), L(t), P(h), O(x), i(S);
                const j = new Map(o.map(M => [M.time, M.value])),
                    D = d.filter(M => j.has(M.time)).map(M => ({
                        time: M.time,
                        value: +(M.value - j.get(M.time)).toFixed(4)
                    }));
                k(D), $(null)
            } catch (r) {
                s || $(r instanceof Error ? r.message : String(r))
            } finally {
                s || g(!1)
            }
        })(), () => {
            s = !0
        }
    }, []);
    const N = c.useMemo(() => {
            const s = [];
            for (const r of Object.keys(n)) {
                const o = n[r];
                o?.length && s.push(o[o.length - 1].time)
            }
            return s.length ? s.sort()[s.length - 1] : null
        }, [n]),
        p = c.useMemo(() => {
            if (!N) return null;
            const s = [.25, .5, .75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 7, 10],
                r = o => {
                    const t = Ce(n, o).map(h => ({
                        years: h.tenor.years,
                        rate: h.rate
                    }));
                    return De(t, s)
                };
            return {
                today: {
                    date: N,
                    curve: r(N)
                },
                d30: {
                    date: Q(N, 30),
                    curve: r(Q(N, 30))
                },
                d90: {
                    date: Q(N, 90),
                    curve: r(Q(N, 90))
                }
            }
        }, [n, N]),
        C = c.useMemo(() => {
            const s = n.DGS3MO;
            return s?.length ? s[s.length - 1].value : null
        }, [n]),
        b = c.useMemo(() => {
            const s = n.DGS2;
            if (!s?.length) return null;
            const r = s[s.length - 1];
            return {
                latest: r.value,
                time: r.time,
                d30: se(s, 30),
                d90: se(s, 90)
            }
        }, [n]),
        T = c.useMemo(() => {
            const s = ue(f),
                r = ue(v),
                o = ue(R),
                d = n.DGS10,
                t = d?.length ? {
                    value: d[d.length - 1].value,
                    time: d[d.length - 1].time
                } : null,
                h = se(f, 30),
                x = se(v, 30);
            return {
                tp: s,
                exp: r,
                fitted: o,
                ten: t,
                tp30: h,
                exp30: x
            }
        }, [f, v, R, n]),
        m = c.useMemo(() => {
            const s = ue(a);
            return s ? {
                latest: s.value,
                time: s.time,
                d30: se(a, 30),
                d90: se(a, 90)
            } : null
        }, [a]),
        E = c.useMemo(() => ke({
            fwdCurve: p?.today.curve ?? [],
            spot3m: C,
            twoYearChange30d: b?.d30 ?? null,
            termPremium: T.tp?.value ?? null,
            termPremiumChange30d: T.tp30,
            twoTenSpread: m?.latest ?? null,
            twoTenChange30d: m?.d30 ?? null
        }), [p, C, b, T, m]),
        V = c.useMemo(() => {
            const s = n.DGS2 ?? [],
                r = n.DGS3MO ?? [];
            if (!s.length || !r.length || !v.length || !f.length || !a.length) return [];
            const o = new Map(r.map(j => [j.time, j.value])),
                d = new Map(f.map(j => [j.time, j.value])),
                t = new Map(a.map(j => [j.time, j.value])),
                h = Q(s[s.length - 1].time, 365 * 10),
                x = s.filter(j => j.time >= h).filter((j, D) => D % 5 === 0),
                S = [.25, .5, .75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 7, 10],
                z = [];
            for (const j of x) {
                const D = j.time,
                    M = d.get(D),
                    _ = t.get(D),
                    re = o.get(D);
                if (M == null || _ == null || re == null) continue;
                const K = Ce(n, D);
                if (K.length < 4) continue;
                const le = K.map(ae => ({
                        years: ae.tenor.years,
                        rate: ae.rate
                    })),
                    X = De(le, S),
                    ee = Q(D, 30),
                    A = oe(s, ee),
                    te = oe(f, ee),
                    ne = oe(a, ee),
                    xe = ke({
                        fwdCurve: X,
                        spot3m: re,
                        twoYearChange30d: A == null ? null : j.value - A,
                        termPremium: M,
                        termPremiumChange30d: te == null ? null : M - te,
                        twoTenSpread: _,
                        twoTenChange30d: ne == null ? null : _ - ne
                    });
                z.push({
                    time: D,
                    value: +xe.score.toFixed(1)
                })
            }
            return z
        }, [n, v, f, a]),
        B = c.useRef(null),
        be = c.useRef(null),
        H = c.useRef(null),
        ve = c.useRef(null),
        I = c.useRef(null),
        ye = c.useRef(null),
        J = c.useRef(null),
        q = c.useRef(null),
        je = c.useRef(null);
    c.useEffect(() => {
        if (!q.current || !V.length) return;
        const s = ce(q.current, {
            ...me(),
            width: q.current.clientWidth,
            height: 280,
            timeScale: {
                borderVisible: !1,
                timeVisible: !1,
                secondsVisible: !1,
                fixLeftEdge: !1,
                fixRightEdge: !1
            },
            leftPriceScale: {
                visible: !0,
                borderVisible: !1
            },
            rightPriceScale: {
                visible: !0,
                borderVisible: !1
            }
        });
        if (W.length) {
            const d = V[0].time,
                t = W.filter(h => h.time >= d);
            if (t.length) {
                const h = t[0].value,
                    x = t.map(z => ({
                        time: z.time,
                        value: +(z.value / h * 100).toFixed(2)
                    }));
                s.addSeries(he, {
                    color: "rgba(139, 92, 246, 0.9)",
                    lineWidth: 2,
                    priceFormat: {
                        type: "price",
                        precision: 0,
                        minMove: 1
                    },
                    priceScaleId: "left",
                    lastValueVisible: !0,
                    title: "VNQ (rebased)"
                }).setData(x)
            }
        }
        const r = s.addSeries(Re, {
            baseValue: {
                type: "price",
                price: 0
            },
            topLineColor: "#10b981",
            topFillColor1: "rgba(16, 185, 129, 0.35)",
            topFillColor2: "rgba(16, 185, 129, 0.05)",
            bottomLineColor: "#f43f5e",
            bottomFillColor1: "rgba(244, 63, 94, 0.05)",
            bottomFillColor2: "rgba(244, 63, 94, 0.35)",
            lineWidth: 2,
            priceFormat: {
                type: "price",
                precision: 0,
                minMove: 1
            },
            priceScaleId: "right",
            title: "Score"
        });
        r.setData(V.map(d => ({
            time: d.time,
            value: d.value
        }))), r.createPriceLine({
            price: 50,
            color: "rgba(16, 185, 129, 0.6)",
            lineStyle: 2,
            lineWidth: 1,
            axisLabelVisible: !0,
            title: "+50 Activated"
        }), r.createPriceLine({
            price: 20,
            color: "rgba(16, 185, 129, 0.35)",
            lineStyle: 3,
            lineWidth: 1,
            axisLabelVisible: !1,
            title: ""
        }), r.createPriceLine({
            price: 0,
            color: "rgba(161, 161, 170, 0.4)",
            lineStyle: 0,
            lineWidth: 1,
            axisLabelVisible: !1,
            title: ""
        }), r.createPriceLine({
            price: -20,
            color: "rgba(244, 63, 94, 0.35)",
            lineStyle: 3,
            lineWidth: 1,
            axisLabelVisible: !1,
            title: ""
        }), r.createPriceLine({
            price: -50,
            color: "rgba(244, 63, 94, 0.6)",
            lineStyle: 2,
            lineWidth: 1,
            axisLabelVisible: !0,
            title: "−50 Suppressed"
        }), s.timeScale().fitContent(), je.current = s;
        const o = new ResizeObserver(() => {
            q.current && s.applyOptions({
                width: q.current.clientWidth
            })
        });
        return o.observe(q.current), () => {
            o.disconnect(), s.remove(), je.current = null
        }
    }, [V, W]);
    const F = c.useMemo(() => {
        if (!V.length) return null;
        const s = V.map(x => x.value),
            r = s.slice().sort((x, S) => x - S),
            o = x => r[Math.min(r.length - 1, Math.floor(x * r.length))],
            d = s[s.length - 1];
        let t = 0;
        for (const x of s) x < d && t++;
        const h = t / s.length * 100;
        return {
            min: r[0],
            max: r[r.length - 1],
            p25: o(.25),
            p50: o(.5),
            p75: o(.75),
            today: d,
            percentile: h,
            points: s.length,
            startDate: V[0].time
        }
    }, [V]);
    c.useEffect(() => {
        if (!B.current || !n.DGS2?.length) return;
        const s = ce(B.current, {
            ...me(),
            width: B.current.clientWidth,
            height: 280
        });
        s.addSeries(he, {
            color: "#3b82f6",
            lineWidth: 2,
            priceFormat: {
                type: "price",
                precision: 2,
                minMove: .01
            }
        }).setData(n.DGS2.map(d => ({
            time: d.time,
            value: d.value
        }))), s.timeScale().fitContent(), be.current = s;
        const o = new ResizeObserver(() => {
            B.current && s.applyOptions({
                width: B.current.clientWidth
            })
        });
        return o.observe(B.current), () => {
            o.disconnect(), s.remove(), be.current = null
        }
    }, [n]), c.useEffect(() => {
        if (!H.current || !v.length || !f.length) return;
        const s = ce(H.current, {
                ...me(),
                width: H.current.clientWidth,
                height: 320
            }),
            r = new Map(f.map(x => [x.time, x.value])),
            o = [];
        for (const x of v) {
            const S = r.get(x.time);
            S != null && o.push({
                time: x.time,
                exp: x.value,
                total: x.value + S
            })
        }
        s.addSeries(Te, {
            lineColor: "#3b82f6",
            topColor: "rgba(59, 130, 246, 0.45)",
            bottomColor: "rgba(59, 130, 246, 0.05)",
            lineWidth: 2,
            priceFormat: {
                type: "price",
                precision: 2,
                minMove: .01
            }
        }).setData(o.map(x => ({
            time: x.time,
            value: x.exp
        }))), s.addSeries(he, {
            color: "#f59e0b",
            lineWidth: 2,
            priceFormat: {
                type: "price",
                precision: 2,
                minMove: .01
            }
        }).setData(o.map(x => ({
            time: x.time,
            value: x.total
        }))), s.timeScale().fitContent(), ve.current = s;
        const h = new ResizeObserver(() => {
            H.current && s.applyOptions({
                width: H.current.clientWidth
            })
        });
        return h.observe(H.current), () => {
            h.disconnect(), s.remove(), ve.current = null
        }
    }, [v, f]), c.useEffect(() => {
        if (!I.current || !a.length) return;
        const s = ce(I.current, {
            ...me(),
            width: I.current.clientWidth,
            height: 280
        });
        s.addSeries(Te, {
            lineColor: "#10b981",
            topColor: "rgba(16, 185, 129, 0.35)",
            bottomColor: "rgba(239, 68, 68, 0.20)",
            lineWidth: 2,
            priceFormat: {
                type: "price",
                precision: 2,
                minMove: .01
            }
        }).setData(a.map(d => ({
            time: d.time,
            value: d.value
        }))), s.timeScale().fitContent(), ye.current = s;
        const o = new ResizeObserver(() => {
            I.current && s.applyOptions({
                width: I.current.clientWidth
            })
        });
        return o.observe(I.current), () => {
            o.disconnect(), s.remove(), ye.current = null
        }
    }, [a]), c.useEffect(() => {
        if (!J.current || !p) return;
        const s = J.current,
            r = window.devicePixelRatio || 1,
            o = s.clientWidth,
            d = 320;
        s.width = o * r, s.height = d * r, s.style.height = d + "px";
        const t = s.getContext("2d");
        if (!t) return;
        t.scale(r, r), t.clearRect(0, 0, o, d);
        const h = 50,
            x = 20,
            S = 24,
            z = 36,
            j = o - h - x,
            D = d - S - z,
            M = [...p.today.curve, ...p.d30.curve, ...p.d90.curve];
        if (!M.length) return;
        const _ = M.map(l => l.years),
            re = M.map(l => l.forward),
            K = Math.min(..._),
            le = Math.max(..._),
            X = Math.min(...re) - .2,
            ee = Math.max(...re) + .2,
            A = l => h + (l - K) / (le - K || 1) * j,
            te = l => S + (1 - (l - X) / (ee - X || 1)) * D;
        t.font = "11px ui-sans-serif, system-ui", t.fillStyle = "#a1a1aa", t.strokeStyle = "rgba(82, 82, 91, 0.15)", t.lineWidth = 1;
        const ne = 5;
        for (let l = 0; l <= ne; l++) {
            const G = X + l * (ee - X) / ne,
                ie = te(G);
            t.beginPath(), t.moveTo(h, ie), t.lineTo(h + j, ie), t.stroke(), t.textAlign = "right", t.textBaseline = "middle", t.fillText(`${G.toFixed(2)}%`, h - 6, ie)
        }
        const xe = [.25, .5, 1, 2, 3, 5, 7, 10];
        t.textAlign = "center", t.textBaseline = "top";
        for (const l of xe) {
            if (l < K || l > le) continue;
            const G = A(l);
            t.fillText(l < 1 ? `${(l*12).toFixed(0)}M` : `${l}Y`, G, S + D + 6), t.beginPath(), t.moveTo(G, S + D), t.lineTo(G, S + D + 4), t.strokeStyle = "rgba(82, 82, 91, 0.4)", t.stroke(), t.strokeStyle = "rgba(82, 82, 91, 0.15)"
        }
        const ae = A(2);
        if (t.fillStyle = "rgba(245, 158, 11, 0.08)", t.fillRect(A(1), S, A(2) - A(1), D), t.strokeStyle = "rgba(245, 158, 11, 0.5)", t.setLineDash([4, 4]), t.beginPath(), t.moveTo(ae, S), t.lineTo(ae, S + D), t.stroke(), t.setLineDash([]), t.fillStyle = "#f59e0b", t.textAlign = "center", t.font = "10px ui-sans-serif, system-ui", t.fillText("12-24m horizon", (A(1) + A(2)) / 2, S + 2), C != null) {
            const l = te(C);
            t.strokeStyle = "rgba(161, 161, 170, 0.6)", t.setLineDash([2, 4]), t.lineWidth = 1.2, t.beginPath(), t.moveTo(h, l), t.lineTo(h + j, l), t.stroke(), t.setLineDash([]), t.fillStyle = "#a1a1aa", t.font = "10px ui-sans-serif, system-ui", t.textAlign = "left", t.fillText(`Spot 3M ${C.toFixed(2)}%`, h + 6, l - 4)
        }
        const Ne = [{
            name: "90d ago",
            color: "rgba(99, 102, 241, 0.4)",
            lineWidth: 1.5,
            data: p.d90.curve,
            dash: [3, 3]
        }, {
            name: "30d ago",
            color: "rgba(99, 102, 241, 0.7)",
            lineWidth: 1.8,
            data: p.d30.curve,
            dash: [4, 2]
        }, {
            name: "Today",
            color: "#3b82f6",
            lineWidth: 2.5,
            data: p.today.curve,
            dash: null
        }];
        for (const l of Ne) l.data.length && (t.strokeStyle = l.color, t.lineWidth = l.lineWidth, l.dash ? t.setLineDash(l.dash) : t.setLineDash([]), t.beginPath(), l.data.forEach((G, ie) => {
            const Se = A(G.years),
                Me = te(G.forward);
            ie === 0 ? t.moveTo(Se, Me) : t.lineTo(Se, Me)
        }), t.stroke());
        t.setLineDash([]);
        let de = h + 8,
            pe = S + 6;
        t.font = "11px ui-sans-serif, system-ui", t.textAlign = "left", t.textBaseline = "top";
        for (const l of Ne) t.strokeStyle = l.color, t.lineWidth = l.lineWidth, l.dash ? t.setLineDash(l.dash) : t.setLineDash([]), t.beginPath(), t.moveTo(de, pe + 6), t.lineTo(de + 18, pe + 6), t.stroke(), t.setLineDash([]), t.fillStyle = "#d4d4d8", t.fillText(l.name, de + 22, pe), de += 80
    }, [p, C]), c.useEffect(() => {
        const s = () => {
                if (J.current && p) {
                    const o = new Event("resize");
                    window.dispatchEvent(o)
                }
            },
            r = new ResizeObserver(s);
        return J.current?.parentElement && r.observe(J.current.parentElement), () => r.disconnect()
    }, [p]);
    const Y = c.useMemo(() => {
        if (!p || C == null) return null;
        const s = p.today.curve.find(t => Math.abs(t.years - 2) < .05)?.forward,
            r = p.today.curve.find(t => Math.abs(t.years - 1) < .05)?.forward;
        if (s == null) return null;
        const o = (C - s) * 100,
            d = r != null ? (C - r) * 100 : null;
        return {
            cuts24: o / ge,
            cuts12: d != null ? d / ge : null,
            drop24bp: o,
            drop12bp: d
        }
    }, [p, C]);
    if (u) return e.jsx("div", {
        className: "flex items-center justify-center h-full text-muted-foreground",
        "data-testid": "rates-forward-loading",
        children: "Loading rates data..."
    });
    if (y) return e.jsxs("div", {
        className: "flex items-center justify-center h-full text-destructive",
        "data-testid": "rates-forward-error",
        children: ["Error: ", y]
    });
    const we = E.score >= 50 ? "text-emerald-400" : E.score >= 20 ? "text-emerald-300" : E.score >= -20 ? "text-zinc-300" : E.score >= -50 ? "text-amber-400" : "text-rose-400";
    return e.jsx("div", {
        className: "h-full overflow-auto bg-background",
        "data-testid": "rates-forward-page",
        children: e.jsxs("div", {
            className: "max-w-[1600px] mx-auto px-6 py-5 space-y-5",
            children: [e.jsxs("div", {
                className: "flex items-center justify-between",
                children: [e.jsxs("div", {
                    children: [e.jsx("h1", {
                        className: "text-xl font-semibold text-foreground",
                        children: "Rates Forward"
                    }), e.jsxs("p", {
                        className: "text-xs text-muted-foreground mt-0.5",
                        children: ["Forward-expectations dashboard for REIT convexity activation. Latest data: ", N ?? "—"]
                    })]
                }), e.jsxs("div", {
                    className: "flex items-center gap-2 text-xs text-muted-foreground",
                    children: [e.jsx(Fe, {
                        className: "w-3.5 h-3.5"
                    }), "FRED daily series + NY Fed ACM term-premium decomposition"]
                })]
            }), e.jsx("div", {
                className: "rounded-lg border border-border bg-card p-4",
                "data-testid": "composite-signal",
                children: e.jsxs("div", {
                    className: "flex items-start justify-between gap-6 flex-wrap",
                    children: [e.jsxs("div", {
                        className: "flex-1 min-w-[260px]",
                        children: [e.jsx("div", {
                            className: "text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5",
                            children: "Convexity Activation Score"
                        }), e.jsxs("div", {
                            className: "flex items-baseline gap-3",
                            children: [e.jsxs("div", {
                                className: `text-4xl font-bold ${we}`,
                                "data-testid": "composite-score",
                                children: [E.score >= 0 ? "+" : "", E.score.toFixed(0)]
                            }), e.jsx("div", {
                                className: `text-base font-medium ${we}`,
                                "data-testid": "composite-regime",
                                children: E.regime
                            })]
                        }), e.jsx("div", {
                            className: "mt-2 text-xs text-muted-foreground max-w-md leading-relaxed",
                            children: "Composite of forward path, 2Y direction, term-premium reopen, and 2s10s slope. Range −100 (rates risk-on) to +100 (full convexity activation)."
                        })]
                    }), e.jsx("div", {
                        className: "flex-1 min-w-[440px] grid grid-cols-2 gap-2",
                        children: E.components.map(s => {
                            const r = s.score >= 30 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : s.score >= -30 ? "text-zinc-300 bg-zinc-500/10 border-zinc-500/30" : "text-rose-400 bg-rose-500/10 border-rose-500/30";
                            return e.jsxs("div", {
                                className: `rounded border px-3 py-2 ${r}`,
                                "data-testid": `component-${s.label.toLowerCase().replace(/\s+/g,"-")}`,
                                children: [e.jsxs("div", {
                                    className: "flex items-center justify-between",
                                    children: [e.jsx("span", {
                                        className: "text-[11px] uppercase tracking-wider opacity-80",
                                        children: s.label
                                    }), e.jsxs("span", {
                                        className: "text-sm font-semibold",
                                        children: [s.score >= 0 ? "+" : "", s.score.toFixed(0)]
                                    })]
                                }), e.jsx("div", {
                                    className: "text-[11px] mt-0.5 opacity-90",
                                    children: s.reason
                                })]
                            }, s.label)
                        })
                    })]
                })
            }), V.length > 0 && e.jsxs("div", {
                className: "rounded-lg border border-border bg-card p-4",
                "data-testid": "panel-score-history",
                children: [e.jsxs("div", {
                    className: "flex items-start justify-between mb-3 gap-4 flex-wrap",
                    children: [e.jsxs("div", {
                        children: [e.jsx("h2", {
                            className: "text-sm font-semibold text-foreground",
                            children: "Convexity Activation Score — History"
                        }), e.jsxs("p", {
                            className: "text-xs text-muted-foreground mt-0.5",
                            children: ["Same composite formula applied weekly across the last ", F ? Math.round((Date.now() - new Date(F.startDate).getTime()) / (365 * 864e5)) : 10, " years. Score on right axis (green above 0 = convexity bias, red below = rates-selling-off). VNQ rebased to 100 on left axis (violet)."]
                        })]
                    }), F && e.jsxs("div", {
                        className: "flex gap-3 text-xs flex-wrap",
                        children: [e.jsxs("div", {
                            className: "px-3 py-1.5 rounded bg-muted/40 border border-border",
                            children: [e.jsx("div", {
                                className: "text-[10px] uppercase tracking-wider text-muted-foreground",
                                children: "Today"
                            }), e.jsxs("div", {
                                className: "font-semibold text-foreground",
                                "data-testid": "score-today",
                                children: [F.today >= 0 ? "+" : "", F.today.toFixed(0)]
                            }), e.jsxs("div", {
                                className: "text-[10px] text-muted-foreground",
                                children: [F.percentile.toFixed(0), "th pct"]
                            })]
                        }), e.jsxs("div", {
                            className: "px-3 py-1.5 rounded bg-muted/40 border border-border",
                            children: [e.jsx("div", {
                                className: "text-[10px] uppercase tracking-wider text-muted-foreground",
                                children: "10y range"
                            }), e.jsxs("div", {
                                className: "font-semibold text-foreground",
                                children: [F.min >= 0 ? "+" : "", F.min.toFixed(0), " to ", F.max >= 0 ? "+" : "", F.max.toFixed(0)]
                            }), e.jsxs("div", {
                                className: "text-[10px] text-muted-foreground",
                                children: ["median ", F.p50 >= 0 ? "+" : "", F.p50.toFixed(0)]
                            })]
                        }), e.jsxs("div", {
                            className: "px-3 py-1.5 rounded bg-muted/40 border border-border",
                            children: [e.jsx("div", {
                                className: "text-[10px] uppercase tracking-wider text-muted-foreground",
                                children: "25/75 band"
                            }), e.jsxs("div", {
                                className: "font-semibold text-foreground",
                                children: [F.p25 >= 0 ? "+" : "", F.p25.toFixed(0), " to ", F.p75 >= 0 ? "+" : "", F.p75.toFixed(0)]
                            }), e.jsxs("div", {
                                className: "text-[10px] text-muted-foreground",
                                children: [F.points, " weekly obs"]
                            })]
                        })]
                    })]
                }), e.jsx("div", {
                    ref: q,
                    className: "w-full",
                    style: {
                        height: 280
                    },
                    "data-testid": "chart-score-history"
                })]
            }), e.jsxs("div", {
                className: "rounded-lg border border-border bg-card p-4",
                "data-testid": "panel-forward-curve",
                children: [e.jsxs("div", {
                    className: "flex items-start justify-between mb-3 gap-4 flex-wrap",
                    children: [e.jsxs("div", {
                        children: [e.jsx("h2", {
                            className: "text-sm font-semibold text-foreground",
                            children: "Forward Treasury Curve"
                        }), e.jsx("p", {
                            className: "text-xs text-muted-foreground mt-0.5",
                            children: 'Instantaneous forwards bootstrapped from the par curve. The single best forward-expectations measure for "where rates go next 24 months."'
                        })]
                    }), Y && e.jsxs("div", {
                        className: "flex gap-3 text-xs",
                        children: [e.jsxs("div", {
                            className: "px-3 py-1.5 rounded bg-muted/40 border border-border",
                            children: [e.jsx("div", {
                                className: "text-[10px] uppercase tracking-wider text-muted-foreground",
                                children: "12m horizon"
                            }), e.jsx("div", {
                                className: "font-semibold text-foreground",
                                "data-testid": "cuts-12m",
                                children: Y.cuts12 != null ? `${Y.cuts12>=0?"+":""}${Y.cuts12.toFixed(1)} cuts` : "—"
                            }), e.jsx("div", {
                                className: "text-[10px] text-muted-foreground",
                                children: Y.drop12bp != null ? `${Y.drop12bp>=0?"−":"+"}${Math.abs(Y.drop12bp).toFixed(0)}bp` : ""
                            })]
                        }), e.jsxs("div", {
                            className: "px-3 py-1.5 rounded bg-muted/40 border border-border",
                            children: [e.jsx("div", {
                                className: "text-[10px] uppercase tracking-wider text-muted-foreground",
                                children: "24m horizon"
                            }), e.jsxs("div", {
                                className: "font-semibold text-foreground",
                                "data-testid": "cuts-24m",
                                children: [Y.cuts24 >= 0 ? "+" : "", Y.cuts24.toFixed(1), " cuts"]
                            }), e.jsxs("div", {
                                className: "text-[10px] text-muted-foreground",
                                children: [Y.drop24bp >= 0 ? "−" : "+", Math.abs(Y.drop24bp).toFixed(0), "bp"]
                            })]
                        })]
                    })]
                }), e.jsx("div", {
                    className: "w-full",
                    children: e.jsx("canvas", {
                        ref: J,
                        className: "w-full",
                        style: {
                            height: 320
                        },
                        "data-testid": "canvas-forward-curve"
                    })
                }), e.jsx("div", {
                    className: "mt-2 text-[11px] text-muted-foreground",
                    children: "X-axis = forward horizon (years). Curves shown for today, 30d ago, and 90d ago. Implied cuts assume 25bp per cut."
                })]
            }), e.jsxs("div", {
                className: "grid grid-cols-1 lg:grid-cols-2 gap-5",
                children: [e.jsxs("div", {
                    className: "rounded-lg border border-border bg-card p-4",
                    "data-testid": "panel-two-year",
                    children: [e.jsxs("div", {
                        className: "flex items-start justify-between mb-3 gap-4",
                        children: [e.jsxs("div", {
                            children: [e.jsx("h2", {
                                className: "text-sm font-semibold text-foreground",
                                children: "2-Year Treasury"
                            }), e.jsx("p", {
                                className: "text-xs text-muted-foreground mt-0.5",
                                children: 'Fastest proxy for "where rates go next 24 months." Tracks expected policy path.'
                            })]
                        }), b && e.jsxs("div", {
                            className: "text-right",
                            children: [e.jsx("div", {
                                className: "text-2xl font-semibold text-foreground",
                                "data-testid": "two-year-latest",
                                children: Z(b.latest)
                            }), e.jsx("div", {
                                className: "text-[11px] text-muted-foreground",
                                children: b.time
                            })]
                        })]
                    }), e.jsx("div", {
                        ref: B,
                        className: "w-full",
                        style: {
                            height: 280
                        },
                        "data-testid": "chart-two-year"
                    }), e.jsxs("div", {
                        className: "mt-3 grid grid-cols-2 gap-2 text-xs",
                        children: [e.jsxs("div", {
                            className: "rounded bg-muted/40 border border-border px-2.5 py-1.5",
                            children: [e.jsx("div", {
                                className: "text-[10px] uppercase tracking-wider text-muted-foreground",
                                children: "30d change"
                            }), e.jsx("div", {
                                className: `font-semibold ${b?.d30!=null&&b.d30<0?"text-emerald-400":b?.d30!=null&&b.d30>0?"text-rose-400":"text-foreground"}`,
                                children: b?.d30 != null ? `${b.d30>=0?"+":""}${(b.d30*100).toFixed(0)}bp` : "—"
                            })]
                        }), e.jsxs("div", {
                            className: "rounded bg-muted/40 border border-border px-2.5 py-1.5",
                            children: [e.jsx("div", {
                                className: "text-[10px] uppercase tracking-wider text-muted-foreground",
                                children: "90d change"
                            }), e.jsx("div", {
                                className: `font-semibold ${b?.d90!=null&&b.d90<0?"text-emerald-400":b?.d90!=null&&b.d90>0?"text-rose-400":"text-foreground"}`,
                                children: b?.d90 != null ? `${b.d90>=0?"+":""}${(b.d90*100).toFixed(0)}bp` : "—"
                            })]
                        })]
                    })]
                }), e.jsxs("div", {
                    className: "rounded-lg border border-border bg-card p-4",
                    "data-testid": "panel-ten-decomp",
                    children: [e.jsxs("div", {
                        className: "flex items-start justify-between mb-3 gap-4",
                        children: [e.jsxs("div", {
                            children: [e.jsx("h2", {
                                className: "text-sm font-semibold text-foreground",
                                children: "10Y Decomposition (ACM)"
                            }), e.jsx("p", {
                                className: "text-xs text-muted-foreground mt-0.5",
                                children: "Cluster 1's activation depends on the 10Y falling for the right reason — expectations vs term premium."
                            })]
                        }), T.fitted && e.jsxs("div", {
                            className: "text-right",
                            children: [e.jsx("div", {
                                className: "text-2xl font-semibold text-foreground",
                                "data-testid": "ten-year-latest",
                                children: Z(T.fitted.value)
                            }), e.jsxs("div", {
                                className: "text-[11px] text-muted-foreground",
                                children: ["ACM fitted · ", T.fitted.time]
                            }), T.ten && e.jsxs("div", {
                                className: "text-[10px] text-muted-foreground",
                                children: ["DGS10 par · ", Z(T.ten.value)]
                            })]
                        })]
                    }), e.jsx("div", {
                        ref: H,
                        className: "w-full",
                        style: {
                            height: 320
                        },
                        "data-testid": "chart-ten-decomp"
                    }), e.jsxs("div", {
                        className: "mt-2 flex items-center gap-3 text-[11px] flex-wrap",
                        children: [e.jsxs("span", {
                            className: "flex items-center gap-1.5",
                            children: [e.jsx("span", {
                                className: "inline-block w-2.5 h-2.5 rounded-sm bg-blue-500/60"
                            }), e.jsx("span", {
                                className: "text-muted-foreground",
                                children: "Risk-neutral expectations"
                            })]
                        }), e.jsxs("span", {
                            className: "flex items-center gap-1.5",
                            children: [e.jsx("span", {
                                className: "inline-block w-2.5 h-2.5 rounded-sm bg-amber-500"
                            }), e.jsx("span", {
                                className: "text-muted-foreground",
                                children: "Fitted total (= exp + TP)"
                            })]
                        }), e.jsx("span", {
                            className: "text-muted-foreground/70",
                            children: "Vertical band = term premium"
                        })]
                    }), e.jsxs("div", {
                        className: "mt-2 grid grid-cols-2 gap-2 text-xs",
                        children: [e.jsxs("div", {
                            className: "rounded bg-muted/40 border border-border px-2.5 py-1.5",
                            children: [e.jsx("div", {
                                className: "text-[10px] uppercase tracking-wider text-muted-foreground",
                                children: "Term premium"
                            }), e.jsx("div", {
                                className: "font-semibold text-amber-400",
                                "data-testid": "term-premium-latest",
                                children: Z(T.tp?.value)
                            }), e.jsx("div", {
                                className: "text-[10px] text-muted-foreground",
                                children: T.tp30 != null ? `${T.tp30>=0?"+":""}${(T.tp30*100).toFixed(0)}bp 30d` : ""
                            })]
                        }), e.jsxs("div", {
                            className: "rounded bg-muted/40 border border-border px-2.5 py-1.5",
                            children: [e.jsx("div", {
                                className: "text-[10px] uppercase tracking-wider text-muted-foreground",
                                children: "Expectations"
                            }), e.jsx("div", {
                                className: "font-semibold text-blue-400",
                                "data-testid": "expectations-latest",
                                children: Z(T.exp?.value)
                            }), e.jsx("div", {
                                className: "text-[10px] text-muted-foreground",
                                children: T.exp30 != null ? `${T.exp30>=0?"+":""}${(T.exp30*100).toFixed(0)}bp 30d` : ""
                            })]
                        })]
                    })]
                })]
            }), e.jsxs("div", {
                className: "rounded-lg border border-border bg-card p-4",
                "data-testid": "panel-two-ten-slope",
                children: [e.jsxs("div", {
                    className: "flex items-start justify-between mb-3 gap-4",
                    children: [e.jsxs("div", {
                        children: [e.jsx("h2", {
                            className: "text-sm font-semibold text-foreground",
                            children: "2s10s Curve Slope"
                        }), e.jsx("p", {
                            className: "text-xs text-muted-foreground mt-0.5",
                            children: "Bull-steepening (2Y falling faster than 10Y) is the T0 trigger for Cluster 1/5 convexity activation."
                        })]
                    }), m && e.jsxs("div", {
                        className: "text-right",
                        children: [e.jsxs("div", {
                            className: `text-2xl font-semibold ${m.latest>=0?"text-emerald-400":"text-rose-400"}`,
                            "data-testid": "two-ten-latest",
                            children: [m.latest >= 0 ? "+" : "", (m.latest * 100).toFixed(0), "bp"]
                        }), e.jsx("div", {
                            className: "text-[11px] text-muted-foreground",
                            children: m.time
                        })]
                    })]
                }), e.jsx("div", {
                    ref: I,
                    className: "w-full",
                    style: {
                        height: 280
                    },
                    "data-testid": "chart-two-ten"
                }), e.jsxs("div", {
                    className: "mt-3 grid grid-cols-3 gap-2 text-xs",
                    children: [e.jsxs("div", {
                        className: "rounded bg-muted/40 border border-border px-2.5 py-1.5",
                        children: [e.jsx("div", {
                            className: "text-[10px] uppercase tracking-wider text-muted-foreground",
                            children: "Regime"
                        }), e.jsx("div", {
                            className: "font-semibold text-foreground flex items-center gap-1.5",
                            "data-testid": "two-ten-regime",
                            children: m && m.latest < 0 ? e.jsxs(e.Fragment, {
                                children: [e.jsx(We, {
                                    className: "w-3.5 h-3.5 text-rose-400"
                                }), " Inverted"]
                            }) : m && m.latest < .25 ? e.jsxs(e.Fragment, {
                                children: [e.jsx(Fe, {
                                    className: "w-3.5 h-3.5 text-amber-400"
                                }), " Flat"]
                            }) : e.jsxs(e.Fragment, {
                                children: [e.jsx($e, {
                                    className: "w-3.5 h-3.5 text-emerald-400"
                                }), " Steepening"]
                            })
                        })]
                    }), e.jsxs("div", {
                        className: "rounded bg-muted/40 border border-border px-2.5 py-1.5",
                        children: [e.jsx("div", {
                            className: "text-[10px] uppercase tracking-wider text-muted-foreground",
                            children: "30d slope change"
                        }), e.jsx("div", {
                            className: `font-semibold ${m?.d30!=null&&m.d30>0?"text-emerald-400":m?.d30!=null&&m.d30<0?"text-rose-400":"text-foreground"}`,
                            children: m?.d30 != null ? `${m.d30>=0?"+":""}${(m.d30*100).toFixed(0)}bp` : "—"
                        })]
                    }), e.jsxs("div", {
                        className: "rounded bg-muted/40 border border-border px-2.5 py-1.5",
                        children: [e.jsx("div", {
                            className: "text-[10px] uppercase tracking-wider text-muted-foreground",
                            children: "90d slope change"
                        }), e.jsx("div", {
                            className: `font-semibold ${m?.d90!=null&&m.d90>0?"text-emerald-400":m?.d90!=null&&m.d90<0?"text-rose-400":"text-foreground"}`,
                            children: m?.d90 != null ? `${m.d90>=0?"+":""}${(m.d90*100).toFixed(0)}bp` : "—"
                        })]
                    })]
                })]
            }), e.jsxs("div", {
                className: "rounded-lg border border-border bg-card/50 p-4 text-xs text-muted-foreground",
                "data-testid": "framework-note",
                children: [e.jsx("div", {
                    className: "font-semibold text-foreground mb-1",
                    children: "Framework"
                }), e.jsxs("div", {
                    className: "leading-relaxed",
                    children: ["The forward Treasury curve is the single best forward-expectations measure, but for REIT convexity work specifically you need the 10Y decomposed into expectations and term premium — because Cluster 1's activation depends on the 10Y falling ", e.jsx("em", {
                        children: "for the right reason"
                    }), ". Bull-steepening (2s10s widening with 2Y falling) is the T0 trigger."]
                })]
            })]
        })
    })
}
export {
    ze as
    default
};