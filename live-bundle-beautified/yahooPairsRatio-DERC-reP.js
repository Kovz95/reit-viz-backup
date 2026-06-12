import {
    cJ as m
} from "./index-CsG73Aq_.js";
async function w(l, d, u) {
    if (!l || !d || l === d) return null;
    let o, n;
    try {
        [o, n] = await Promise.all([m(l), m(d)])
    } catch {
        return null
    }
    if (!o?.adjCloses?.length || !n?.adjCloses?.length) return null;
    const a = new Map;
    for (let s = 0; s < o.dates.length; s++) {
        const t = o.adjCloses[s];
        t > 0 && a.set(o.dates[s], t)
    }
    const r = new Map;
    for (let s = 0; s < n.dates.length; s++) {
        const t = n.adjCloses[s];
        t > 0 && r.set(n.dates[s], t)
    }
    const g = new Map;
    for (let s = 0; s < u.length; s++) u[s] && g.set(u[s], s);
    const i = [],
        f = [],
        p = a.size <= r.size ? a : r,
        j = p === a ? r : a,
        C = Array.from(p.keys()).sort();
    for (const s of C) {
        const t = a.get(s),
            c = r.get(s);
        if (t === void 0 || c === void 0 || !j.has(s)) continue;
        const e = g.get(s);
        e !== void 0 && (i.push(e), f.push(t / c))
    }
    if (i.length > 1) {
        const s = i.map((e, h) => [e, h]).sort((e, h) => e[0] - h[0]),
            t = s.map(([e]) => e),
            c = s.map(([, e]) => f[e]);
        return {
            indices: t,
            prices: c,
            countA: o.adjCloses.length,
            countB: n.adjCloses.length
        }
    }
    return {
        indices: i,
        prices: f,
        countA: o.adjCloses.length,
        countB: n.adjCloses.length
    }
}
export {
    w as g
};