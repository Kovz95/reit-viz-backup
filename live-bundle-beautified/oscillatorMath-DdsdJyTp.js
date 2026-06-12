function m(o, r) {
    const u = new Array(o.length).fill(null);
    if (o.length < r) return u;
    let e = 0;
    for (let s = 0; s < r; s++) e += o[s];
    u[r - 1] = e / r;
    for (let s = r; s < o.length; s++) e += o[s] - o[s - r], u[s] = e / r;
    return u
}

function A(o, r, u, e, s, d) {
    const t = u.length,
        i = new Array(t).fill(null);
    for (let l = e - 1; l < t; l++) {
        let y = -1 / 0,
            S = 1 / 0;
        for (let x = l - e + 1; x <= l; x++) o[x] > y && (y = o[x]), r[x] < S && (S = r[x]);
        const w = y - S;
        w === 0 || !isFinite(w) ? i[l] = 50 : i[l] = 100 * (u[l] - S) / w
    }
    const c = [],
        n = e - 1;
    for (let l = n; l < t; l++) c.push(i[l]);
    const f = m(c, s),
        a = new Array(t).fill(null);
    for (let l = 0; l < f.length; l++) a[n + l] = f[l];
    const h = n + s - 1,
        p = [];
    for (let l = h; l < t; l++) {
        const y = a[l];
        if (y === null) break;
        p.push(y)
    }
    const b = m(p, d),
        g = new Array(t).fill(null);
    for (let l = 0; l < b.length; l++) g[h + l] = b[l];
    return {
        k: a,
        d: g
    }
}

function M(o, r, u, e, s, d) {
    const t = [];
    for (let i = Math.max(d, 1); i < o.length; i++) {
        const c = o[i],
            n = o[i - 1];
        if (!(c === null || n === null))
            if (s === "cross_out_of_band") n <= u && c > u ? t.push({
                index: i,
                direction: "buy"
            }) : n >= e && c < e && t.push({
                index: i,
                direction: "sell"
            });
            else {
                const f = r[i],
                    a = r[i - 1];
                if (f === null || a === null) continue;
                n <= a && c > f ? c <= u && f <= u && t.push({
                    index: i,
                    direction: "buy"
                }) : n >= a && c < f && c >= e && f >= e && t.push({
                    index: i,
                    direction: "sell"
                })
            }
    }
    return t
}

function k(o, r, u, e) {
    const s = o.length,
        d = new Array(s);
    for (let n = 0; n < s; n++) d[n] = (o[n] + r[n]) / 2;
    const t = m(d, u),
        i = m(d, e),
        c = new Array(s).fill(null);
    for (let n = 0; n < s; n++) t[n] === null || i[n] === null || (c[n] = t[n] - i[n]);
    return c
}

function v(o, r, u) {
    const e = [],
        s = Array.isArray(r),
        d = s ? 0 : Math.abs(r);
    for (let t = Math.max(u, 1); t < o.length; t++) {
        const i = o[t],
            c = o[t - 1];
        if (i === null || c === null) continue;
        let n;
        if (s) {
            const f = r,
                a = f[t],
                h = f[t - 1];
            if (a == null || h === null || h === void 0) continue;
            n = Math.abs(a);
            const p = Math.abs(h);
            n === 0 ? c <= 0 && i > 0 ? e.push({
                index: t,
                direction: "buy"
            }) : c >= 0 && i < 0 && e.push({
                index: t,
                direction: "sell"
            }) : c <= p && i > n ? e.push({
                index: t,
                direction: "buy"
            }) : c >= -p && i < -n && e.push({
                index: t,
                direction: "sell"
            });
            continue
        }
        n = d, n === 0 ? c <= 0 && i > 0 ? e.push({
            index: t,
            direction: "buy"
        }) : c >= 0 && i < 0 && e.push({
            index: t,
            direction: "sell"
        }) : c <= n && i > n ? e.push({
            index: t,
            direction: "buy"
        }) : c >= -n && i < -n && e.push({
            index: t,
            direction: "sell"
        })
    }
    return e
}
export {
    A as a, M as b, k as c, v as d
};