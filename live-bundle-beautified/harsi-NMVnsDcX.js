function B(r, n) {
    const u = r.length,
        t = new Array(u).fill(null);
    if (u < 2 || n < 1) return t;
    let c = 0,
        l = 0,
        s = 0;
    for (let e = 1; e < u; e++) {
        const i = r[e] - r[e - 1],
            h = i > 0 ? i : 0,
            a = i < 0 ? -i : 0;
        if (s < n) {
            if (c += h, l += a, s++, s === n) {
                c /= n, l /= n;
                const S = l === 0 ? 1 / 0 : c / l;
                t[e] = l === 0 ? 100 : 100 - 100 / (1 + S)
            }
        } else {
            c = (c * (n - 1) + h) / n, l = (l * (n - 1) + a) / n;
            const S = l === 0 ? 1 / 0 : c / l;
            t[e] = l === 0 ? 100 : 100 - 100 / (1 + S)
        }
    }
    return t
}

function A(r, n) {
    return B(r, n).map(t => t === null ? null : t - 50)
}

function E(r, n, u) {
    const t = A(r, n);
    if (!u) return t;
    const c = new Array(t.length).fill(null);
    let l = null;
    for (let s = 0; s < t.length; s++) {
        const e = t[s];
        if (e === null) {
            l = null;
            continue
        }
        l === null ? (l = e, c[s] = e) : (l = (l + e) / 2, c[s] = l)
    }
    return c
}

function b(r, n) {
    const u = new Array(r.length).fill(null);
    if (n < 1) return u;
    let t = 0,
        c = 0;
    const l = new Array(n).fill(null);
    for (let s = 0; s < r.length; s++) {
        const e = l[s % n];
        e !== null && (t -= e, c--);
        const i = r[s];
        l[s % n] = i, i !== null && (t += i, c++), c === n && (u[s] = t / n)
    }
    return u
}

function J(r, n) {
    const u = new Array(r.length).fill(null);
    for (let t = n - 1; t < r.length; t++) {
        let c = -1 / 0,
            l = 1 / 0,
            s = !0;
        for (let h = 0; h < n; h++) {
            const a = r[t - h];
            if (a === null) {
                s = !1;
                break
            }
            a > c && (c = a), a < l && (l = a)
        }
        if (!s) continue;
        const e = r[t],
            i = c - l;
        u[t] = i > 0 ? (e - l) / i * 100 : 50
    }
    return u
}

function Q(r, n, u, t) {
    const l = J(r, n).map(e => e === null ? null : e - 50);
    return b(l, u).map(e => e === null ? null : e / 100 * t)
}

function T(r, n, u, t = {}, c) {
    const l = t.candleLength ?? 14,
        s = Math.max(1, t.candleSmoothing ?? 1),
        e = t.rsiLength ?? 7,
        i = t.rsiSmoothed ?? !0,
        h = t.stochLength ?? 14,
        a = t.smoothK ?? 3,
        S = t.smoothD ?? 3,
        O = t.stochFit ?? 80,
        m = r.length,
        D = new Array(m);
    for (let o = 0; o < m; o++) {
        const f = c ? c[o] : (n[o] + u[o] + r[o]) / 3;
        D[o] = (f + n[o] + u[o] + r[o]) / 4
    }
    const H = E(D, e, i),
        K = A(r, l),
        P = A(n, l),
        F = A(u, l),
        C = new Array(m).fill(null),
        G = new Array(m).fill(null),
        N = new Array(m).fill(null),
        I = new Array(m).fill(null),
        y = new Array(m).fill(null);
    for (let o = 0; o < m; o++) {
        const f = K[o];
        if (f === null) continue;
        const x = o > 0 ? K[o - 1] : null;
        C[o] = x !== null ? x : f;
        const $ = P[o],
            w = F[o];
        if ($ === null || w === null) continue;
        const _ = Math.max($, w),
            g = Math.min($, w),
            v = C[o],
            L = (v + _ + g + f) / 4,
            k = o > 0 ? y[o - 1] : null,
            z = o > 0 ? I[o - 1] : null,
            M = k === null || z === null ? (v + f) / 2 : (k * s + z) / (s + 1),
            j = Math.max(_, Math.max(M, L)),
            q = Math.min(g, Math.min(M, L));
        y[o] = M, I[o] = L, G[o] = j, N[o] = q
    }
    const R = Q(H, h, a, O),
        d = b(R, S),
        W = R.map((o, f) => o !== null && d[f] !== null ? o - d[f] : null);
    return {
        rsi: H,
        haClose: I,
        haOpen: y,
        stochK: R,
        stochD: d,
        stochKD: W
    }
}

function U(r, n = {}) {
    const u = n.rsiLength ?? 7,
        t = n.rsiSmoothed ?? !0,
        c = n.stochLength ?? 14,
        l = n.smoothK ?? 3,
        s = n.smoothD ?? 3,
        e = n.candleLength ?? 14,
        i = n.candleSmoothing ?? 1;
    switch (r) {
        case "rsi":
            return `HARSI RSI(${u}${t?",sm":""})`;
        case "ha_close":
            return `HARSI HA-Close(${e}/${i})`;
        case "stoch_k":
            return `HARSI Stoch %K(${c},${l})`;
        case "stoch_d":
            return `HARSI Stoch %D(${c},${l},${s})`;
        case "stoch_kd":
            return `HARSI Stoch %K−%D(${c},${l},${s})`
    }
}
export {
    T as c, U as h
};