function S(o, e) {
    const c = o.length,
        l = new Array(c).fill(NaN);
    if (e <= 0 || c === 0) return l;
    let u = 0,
        r = 0;
    for (let n = 0; n < c; n++) {
        const s = o[n];
        if (Number.isFinite(s) && (u += s, r += 1), n >= e) {
            const t = o[n - e];
            Number.isFinite(t) && (u -= t, r -= 1)
        }
        n >= e - 1 && r === e && (l[n] = u / e)
    }
    return l
}

function z(o, e) {
    const c = o.length,
        l = new Array(c).fill(NaN);
    if (e <= 0 || c === 0) return l;
    const u = e * (e + 1) / 2;
    for (let r = e - 1; r < c; r++) {
        let n = 0,
            s = !0;
        for (let t = 0; t < e; t++) {
            const f = o[r - (e - 1 - t)];
            if (!Number.isFinite(f)) {
                s = !1;
                break
            }
            n += f * (t + 1)
        }
        s && (l[r] = n / u)
    }
    return l
}

function C(o, e, c = 15, l = 3, u = 5) {
    const r = o.length,
        n = new Array(r).fill(NaN),
        s = new Array(r).fill(NaN),
        t = new Array(r).fill(NaN),
        f = new Array(r).fill(NaN),
        b = new Array(r).fill(NaN),
        y = new Array(r).fill(NaN),
        d = new Array(r).fill(NaN),
        p = new Array(r).fill(NaN),
        g = new Array(r).fill(NaN);
    if (r === 0) return {
        os: n,
        rv: [],
        dv: [],
        rising_bull: s,
        rising_bear: t,
        declining_bull: f,
        declining_bear: b,
        a: y,
        b: d,
        bullPressure: p,
        bearPressure: g
    };
    const k = z(o, c),
        I = S(o, c);
    for (let i = 0; i < r; i++) Number.isFinite(k[i]) && Number.isFinite(I[i]) && (n[i] = k[i] - I[i]);
    const h = new Array(r).fill(0),
        D = new Array(r).fill(0);
    for (let i = 1; i < r; i++) {
        const N = e[i] - e[i - 1],
            a = e[i];
        Number.isFinite(a) && (Number.isFinite(N) && N > 0 ? h[i] = a : Number.isFinite(N) && N < 0 && (D[i] = a))
    }
    const B = S(h, l),
        _ = S(D, l);
    let P = 0,
        R = 0,
        m = 0;
    for (let i = 0; i < r; i++) {
        const N = n[i],
            a = Number.isFinite(B[i]) ? B[i] : 0,
            x = Number.isFinite(_[i]) ? _[i] : 0,
            T = i > 0 && Number.isFinite(s[i - 1]) ? s[i - 1] : 0,
            V = i > 0 && Number.isFinite(t[i - 1]) ? t[i - 1] : 0,
            j = i > 0 && Number.isFinite(f[i - 1]) ? f[i - 1] : 0,
            q = i > 0 && Number.isFinite(b[i - 1]) ? b[i - 1] : 0;
        if (!Number.isFinite(N)) continue;
        let w = 0,
            A = 0,
            F = 0,
            v = 0;
        N > 0 ? (w = T + a, F = j - x) : N < 0 && (A = V + a, v = q - x), s[i] = w, t[i] = A, f[i] = F, b[i] = v, m += 1, P += w + A, R += F + v, m > 0 && (y[i] = P / m * u, d[i] = R / m * u), p[i] = w + v, g[i] = A + F
    }
    return {
        os: n,
        rv: B,
        dv: _,
        rising_bull: s,
        rising_bear: t,
        declining_bull: f,
        declining_bear: b,
        a: y,
        b: d,
        bullPressure: p,
        bearPressure: g
    }
}
export {
    C as c
};