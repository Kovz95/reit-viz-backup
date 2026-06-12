function H(n, s) {
    const e = new Array(n.length).fill(null);
    for (let d = s - 1; d < n.length; d++) {
        let z = 0,
            r = 0,
            c = 0;
        for (let I = d - s + 1; I <= d; I++) {
            const h = n[I];
            if (h == null || !isFinite(h)) {
                c = 0;
                break
            }
            z += h, r += h * h, c++
        }
        if (c !== s) continue;
        const u = z / s,
            y = Math.max(0, r / s - u * u),
            p = Math.sqrt(y),
            o = n[d];
        e[d] = p === 0 ? 0 : (o - u) / p
    }
    return e
}

function T(n, s, e) {
    const d = new Array(n.length).fill(null),
        z = new Array(n.length).fill(null);
    for (let r = e - 1; r < n.length; r++) {
        let c = 0,
            u = 0,
            y = 0,
            p = 0;
        for (let L = r - e + 1; L <= r; L++) c += s[L], u += n[L], y += n[L] * s[L], p += s[L] * s[L];
        const o = c / e,
            I = u / e,
            h = p - e * o * o,
            m = y - e * o * I,
            w = h === 0 ? 0 : m / h;
        d[r] = w, z[r] = I - w * o
    }
    return {
        beta: d,
        alpha: z
    }
}

function C(n) {
    const s = new Array(n.length).fill(null),
        e = [];
    for (let d = 0; d < n.length; d++) {
        let z = 0,
            r = e.length;
        for (; z < r;) {
            const c = z + r >>> 1;
            e[c] <= n[d] ? z = c + 1 : r = c
        }
        e.splice(z, 0, n[d]), s[d] = (z + 1) / e.length * 100
    }
    return s
}

function E(n) {
    const s = [];
    for (const o of n) o != null && isFinite(o) && s.push(o);
    if (s.length < 60) return null;
    const e = s.slice(0, -1),
        d = s.slice(1),
        z = e.length,
        r = e.reduce((o, I) => o + I, 0) / z,
        c = d.reduce((o, I) => o + I, 0) / z;
    let u = 0,
        y = 0;
    for (let o = 0; o < z; o++) u += (e[o] - r) * (d[o] - c), y += (e[o] - r) * (e[o] - r);
    const p = y === 0 ? 0 : u / y;
    return p <= 0 || p >= 1 ? null : -Math.log(2) / Math.log(p)
}
const S = [
        [-1 / 0, -2.5, "z ≤ −2.5"],
        [-2.5, -2, "−2.5 < z ≤ −2.0"],
        [-2, -1.5, "−2.0 < z ≤ −1.5"],
        [-1.5, -1, "−1.5 < z ≤ −1.0"],
        [-1, -.5, "−1.0 < z ≤ −0.5"],
        [-.5, .5, "−0.5 < z ≤ +0.5"],
        [.5, 1, "+0.5 < z ≤ +1.0"],
        [1, 1.5, "+1.0 < z ≤ +1.5"],
        [1.5, 2, "+1.5 < z ≤ +2.0"],
        [2, 2.5, "+2.0 < z ≤ +2.5"],
        [2.5, 1 / 0, "z > +2.5"]
    ],
    K = [
        [0, 5, "0–5 pct"],
        [5, 10, "5–10 pct"],
        [10, 25, "10–25 pct"],
        [25, 40, "25–40 pct"],
        [40, 60, "40–60 pct"],
        [60, 75, "60–75 pct"],
        [75, 90, "75–90 pct"],
        [90, 95, "90–95 pct"],
        [95, 100.0001, "95–100 pct"]
    ],
    U = [5, 10, 20, 60];

function N(n, s, e, d) {
    const z = [],
        r = e.length;
    for (const [c, u, y] of d) {
        const p = [];
        for (let m = 0; m < r; m++) {
            const w = s[m];
            w != null && w >= c && w < u && p.push(m)
        }
        const o = c === -1 / 0 ? u - .25 : u === 1 / 0 ? c + .25 : (c + u) / 2,
            I = n === "pct" ? o > 50 : o > 0,
            h = {
                signal: n,
                label: y,
                low: c,
                high: u,
                n: p.length,
                avg_5d: null,
                hit_5d: null,
                avg_10d: null,
                hit_10d: null,
                avg_20d: null,
                hit_20d: null,
                avg_60d: null,
                hit_60d: null,
                quality: 0,
                ratioLevelLow: null,
                ratioLevelHigh: null
            };
        for (const m of U) {
            const w = [];
            for (const x of p) x + m >= r || e[x] <= 0 || w.push((e[x + m] - e[x]) / e[x] * 100);
            if (w.length === 0) continue;
            const L = w.reduce((x, b) => x + b, 0) / w.length,
                D = w.filter(x => x < 0 === I).length / w.length * 100;
            h[`avg_${m}d`] = L, h[`hit_${m}d`] = D
        }
        h.avg_20d != null && h.hit_20d != null && h.n >= 20 && (h.quality = Math.abs(h.avg_20d) * (h.hit_20d - 50) * Math.log10(h.n + 1) / 100), z.push(h)
    }
    return z
}

function J(n, s, e, d) {
    new Map(n.map(t => [t.time, t.value]));
    const z = new Map(s.map(t => [t.time, t.value])),
        r = [],
        c = [],
        u = [];
    for (const t of n) {
        const v = z.get(t.time);
        v != null && (!(t.value > 0) || !(v > 0) || (r.push(t.time), c.push(t.value), u.push(v)))
    }
    if (c.length < 200) return null;
    const y = c.length,
        p = c.map((t, v) => t / u[v]),
        o = p.map(t => Math.log(t)),
        I = c.map(t => Math.log(t)),
        h = u.map(t => Math.log(t)),
        m = H(o, 60),
        {
            beta: w,
            alpha: L
        } = T(I, h, 60),
        Z = new Array(y).fill(null),
        D = new Array(y).fill(null);
    for (let t = 0; t < y; t++) w[t] != null && (Z[t] = I[t] - L[t] - w[t] * h[t], D[t] = I[t] - w[t] * h[t]);
    const x = H(Z, 60),
        b = H(D, 60),
        $ = C(p),
        O = {
            raw_z: N("raw_z", m, p, S),
            ols_z: N("ols_z", x, p, S),
            spread_z: N("spread_z", b, p, S),
            pct: N("pct", $, p, K)
        },
        l = y - 1,
        q = p[l];
    if (m[l] != null) {
        const t = o.slice(l - 60 + 1, l + 1),
            v = t.reduce((f, W) => f + W, 0) / 60,
            i = t.reduce((f, W) => f + (W - v) ** 2, 0) / 60,
            g = Math.sqrt(i);
        for (const f of O.raw_z) {
            const W = f.low === -1 / 0 ? -3.5 : f.low,
                a = f.high === 1 / 0 ? 3.5 : f.high;
            f.ratioLevelLow = Math.exp(v + W * g), f.ratioLevelHigh = Math.exp(v + a * g)
        }
    }
    if (x[l] != null) {
        const t = [];
        for (let _ = l - 60 + 1; _ <= l; _++) t.push(Z[_]);
        const v = t.reduce((_, M) => _ + M, 0) / 60,
            i = t.reduce((_, M) => _ + (M - v) ** 2, 0) / 60,
            g = Math.sqrt(i),
            f = L[l],
            W = w[l],
            a = h[l];
        for (const _ of O.ols_z) {
            const M = _.low === -1 / 0 ? -3.5 : _.low,
                A = _.high === 1 / 0 ? 3.5 : _.high,
                R = f + W * a + (v + M * g),
                j = f + W * a + (v + A * g);
            _.ratioLevelLow = Math.exp(R) / u[l], _.ratioLevelHigh = Math.exp(j) / u[l]
        }
    }
    if (b[l] != null) {
        const t = [];
        for (let a = l - 60 + 1; a <= l; a++) t.push(D[a]);
        const v = t.reduce((a, _) => a + _, 0) / 60,
            i = t.reduce((a, _) => a + (_ - v) ** 2, 0) / 60,
            g = Math.sqrt(i),
            f = w[l],
            W = h[l];
        for (const a of O.spread_z) {
            const _ = a.low === -1 / 0 ? -3.5 : a.low,
                M = a.high === 1 / 0 ? 3.5 : a.high,
                A = f * W + (v + _ * g),
                R = f * W + (v + M * g);
            a.ratioLevelLow = Math.exp(A) / u[l], a.ratioLevelHigh = Math.exp(R) / u[l]
        }
    } {
        const t = [...p].sort((i, g) => i - g),
            v = i => {
                if (i <= 0) return t[0];
                if (i >= 100) return t[t.length - 1];
                const g = i / 100 * (t.length - 1),
                    f = Math.floor(g),
                    W = Math.ceil(g);
                if (f === W) return t[f];
                const a = g - f;
                return t[f] * (1 - a) + t[W] * a
            };
        for (const i of O.pct) i.ratioLevelLow = v(i.low), i.ratioLevelHigh = v(Math.min(i.high, 100))
    }
    const P = [{
        signal: "raw_z",
        value: m[l]
    }, {
        signal: "ols_z",
        value: x[l]
    }, {
        signal: "spread_z",
        value: b[l]
    }, {
        signal: "pct",
        value: $[l]
    }];
    let B = null,
        k = -1 / 0;
    for (const t of P) {
        if (t.value == null) continue;
        const i = O[t.signal].find(g => t.value >= g.low && t.value < g.high);
        if (i && !(i.n < 20 || i.avg_20d == null) && Math.abs(i.quality) > k) {
            k = Math.abs(i.quality);
            const g = i.avg_20d,
                f = q * (1 + g / 100),
                W = g < -.2 ? "short_ratio" : g > .2 ? "long_ratio" : "neutral",
                a = i.hit_20d ?? 50,
                _ = a >= 55 ? "actionable edge" : a >= 50 ? "marginal edge" : "NO edge (coin-flip or worse — do not trade)";
            B = {
                signal: t.signal,
                bucket: i,
                currentSignalValue: t.value,
                direction: W,
                expectedMove20dPct: g,
                expectedRatio20d: f,
                expectedAPrice20dIfBHolds: f * u[l],
                expectedBPrice20dIfAHolds: c[l] / f,
                rationale: `${Q(t.signal)} = ${G(t.signal,t.value)} sits in the "${i.label}" bucket. Historically, ratio moved ${g>=0?"+":""}${g.toFixed(2)}% on average over the next 20 trading days (n=${i.n}, hit ${a.toFixed(0)}% reverting${V(t.signal)}). ${_}.`
            }
        }
    }
    const F = E(m);
    return {
        tickerA: e,
        tickerB: d,
        firstDate: r[0],
        lastDate: r[r.length - 1],
        n: y,
        currentRatio: q,
        currentA: c[l],
        currentB: u[l],
        currentSignals: P,
        buckets: O,
        bestNow: B,
        halfLifeDays: F,
        series: {
            raw_z: {
                values: m
            },
            ols_z: {
                values: x
            },
            spread_z: {
                values: b
            },
            pct: {
                values: $
            }
        }
    }
}

function Q(n) {
    switch (n) {
        case "raw_z":
            return "Raw z";
        case "ols_z":
            return "OLS-residual z";
        case "spread_z":
            return "β-adj spread z";
        case "pct":
            return "Percentile"
    }
}

function V(n) {
    return n === "pct" ? " toward median" : " toward zero"
}

function G(n, s) {
    return n === "pct" ? `${s.toFixed(0)}` : `${s>=0?"+":""}${s.toFixed(2)}`
}
export {
    J as a, V as b, G as f, Q as s
};