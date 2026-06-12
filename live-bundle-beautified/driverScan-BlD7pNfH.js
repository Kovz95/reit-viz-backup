import {
    a3 as W,
    bg as X,
    bv as Y,
    af as E,
    bw as T
} from "./index-CsG73Aq_.js";

function $(e, o) {
    const s = Math.min(e.length, o.length);
    let t = 0,
        n = 0,
        a = 0,
        r = 0,
        f = 0,
        c = 0;
    for (let h = 0; h < s; h++) {
        const d = e[h],
            g = o[h];
        !Number.isFinite(d) || !Number.isFinite(g) || (n += d, a += g, r += d * g, f += d * d, c += g * g, t++)
    }
    if (t < 3) return 0;
    const l = n / t,
        i = a / t,
        u = f - t * l * l,
        p = c - t * i * i,
        m = r - t * l * i,
        b = Math.sqrt(u * p);
    return b === 0 ? 0 : m / b
}

function B(e) {
    const o = e.map((n, a) => ({
        v: n,
        i: a
    }));
    o.sort((n, a) => n.v - a.v);
    const s = new Array(e.length);
    let t = 0;
    for (; t < o.length;) {
        let n = t;
        for (; n < o.length && o[n].v === o[t].v;) n++;
        const a = (t + n - 1) / 2 + 1;
        for (let r = t; r < n; r++) s[o[r].i] = a;
        t = n
    }
    return s
}

function x(e, o) {
    const s = Math.min(e.length, o.length);
    if (s < 3) return 0;
    const t = [],
        n = [];
    for (let a = 0; a < s; a++) Number.isFinite(e[a]) && Number.isFinite(o[a]) && (t.push(e[a]), n.push(o[a]));
    return t.length < 3 ? 0 : $(B(t), B(n))
}

function P(e) {
    const o = .254829592,
        s = -.284496736,
        t = 1.421413741,
        n = -1.453152027,
        a = 1.061405429,
        r = .3275911,
        f = e < 0 ? -1 : 1;
    e = Math.abs(e) / Math.sqrt(2);
    const c = 1 / (1 + r * e),
        l = 1 - ((((a * c + n) * c + t) * c + s) * c + o) * c * Math.exp(-e * e);
    return .5 * (1 + f * l)
}

function R(e, o) {
    if (o < 3) return 1;
    const s = e * e;
    if (s >= 1) return 0;
    const t = e * Math.sqrt((o - 2) / (1 - s));
    return 2 * (1 - P(Math.abs(t)))
}
const y = [30, 60, 120, 252, 504, 756],
    U = [-60, -30, -10, -5, -1, 0, 1, 5, 10, 30, 60];

function j(e, o) {
    if (o === "price") return e;
    const s = o === "1d" ? 1 : o === "5d" ? 5 : o === "21d" ? 21 : 63,
        t = [];
    for (let n = s; n < e.length; n++) {
        const a = e[n - s].value,
            r = e[n].value;
        a > 0 && Number.isFinite(a) && Number.isFinite(r) && t.push({
            time: e[n].time,
            value: (r - a) / a
        })
    }
    return t
}

function q(e, o) {
    const s = new Map(o.map(r => [r.time, r.value])),
        t = [],
        n = [],
        a = [];
    for (const r of e) {
        const f = s.get(r.time);
        f !== void 0 && Number.isFinite(r.value) && Number.isFinite(f) && (t.push(r.time), n.push(r.value), a.push(f))
    }
    return {
        datesA: t,
        valuesA: n,
        valuesB: a
    }
}

function D(e, o, s) {
    const t = e.length;
    if (s === 0) return {
        f: e,
        t: o
    };
    if (s > 0) return s >= t ? {
        f: [],
        t: []
    } : {
        f: e.slice(0, t - s),
        t: o.slice(s)
    };
    const n = -s;
    return n >= t ? {
        f: [],
        t: []
    } : {
        f: e.slice(n),
        t: o.slice(0, t - n)
    }
}

function G(e, o, s) {
    const {
        valuesA: t,
        valuesB: n
    } = q(e.data, o);
    if (t.length < s) return null;
    let r = -1,
        f = 0,
        c = y[0],
        l = 0,
        i = 0;
    const u = new Array(y.length).fill(0);
    for (const w of U) {
        const {
            f: F,
            t: L
        } = D(t, n, w);
        if (!(F.length < s))
            for (let M = 0; M < y.length; M++) {
                const N = y[M],
                    S = Math.max(0, F.length - N),
                    v = F.slice(S),
                    O = L.slice(S);
                if (v.length < s) continue;
                const k = $(v, O),
                    A = Math.abs(k);
                A > u[M] && (u[M] = A), A > r && (r = A, f = k, c = N, l = w, i = v.length)
            }
    }
    if (r < 0) return null;
    const {
        f: p,
        t: m
    } = D(t, n, l), b = Math.max(0, p.length - c), h = x(p.slice(b), m.slice(b)), d = u.filter(w => w > 0), g = d.length > 0 ? d.reduce((w, F) => w + F, 0) / d.length : 0, C = R(f, i);
    return {
        rank: 0,
        spec: e.spec,
        label: e.label,
        category: e.category,
        bestAbsCorr: r,
        bestCorr: f,
        spearman: h,
        bestWindow: c,
        bestLag: l,
        stability: g,
        nObs: i,
        pVal: C,
        windowCorrs: u
    }
}
async function H(e, o, s, t) {
    const n = [];
    if (o) {
        const c = await X();
        for (const l of c) l.cached && n.push({
            spec: `MACRO:${l.id}`,
            label: l.label || l.id,
            category: `Macro / ${l.category||"General"}`,
            data: []
        })
    }
    if (s) {
        const c = Y();
        if (c) {
            const l = c.find(i => i.ticker === e);
            if (l)
                for (const i of l.metrics) i.startsWith("Fund: ") && n.push({
                    spec: `FUND:${i}`,
                    label: i.replace(/^Fund:\s*/, ""),
                    category: "Fundamentals",
                    data: []
                })
        } else try {
            const i = (await E()).find(u => u.ticker === e);
            if (i)
                for (const u of i.metrics) u.startsWith("Fund: ") && n.push({
                    spec: `FUND:${u}`,
                    label: u.replace(/^Fund:\s*/, ""),
                    category: "Fundamentals",
                    data: []
                })
        } catch {}
    }
    const a = n.length;
    let r = 0;
    const f = 8;
    for (let c = 0; c < n.length; c += f) {
        const l = n.slice(c, c + f);
        await Promise.all(l.map(async i => {
            try {
                if (i.spec.startsWith("MACRO:")) {
                    const u = i.spec.replace("MACRO:", "");
                    i.data = await T(u)
                } else if (i.spec.startsWith("FUND:")) {
                    const u = i.spec.replace("FUND:", "");
                    i.data = await W(e, u)
                }
            } catch {
                i.data = []
            }
        })), r += l.length, t?.(r, a), await new Promise(i => setTimeout(i, 0))
    }
    return n.filter(c => c.data.length > 0)
}
async function _(e) {
    const o = performance.now(),
        {
            ticker: s,
            targetMode: t,
            includeMacro: n,
            includeFund: a,
            minObs: r,
            onProgress: f,
            signal: c
        } = e,
        l = await W(s, "close");
    if (l.length === 0) throw new Error(`No price data found for ${s}`);
    const i = j(l, t);
    if (i.length < r) throw new Error(`Insufficient data for ${s} with minObs=${r}`);
    const u = await H(s, n, a, (h, d) => f?.(h, d, "load"));
    if (c?.aborted) throw new DOMException("Aborted", "AbortError");
    const p = [],
        m = u.length,
        b = 50;
    for (let h = 0; h < u.length; h += b) {
        if (c?.aborted) throw new DOMException("Aborted", "AbortError");
        const d = u.slice(h, h + b);
        for (const g of d) {
            const C = G(g, i, r);
            C && p.push(C)
        }
        f?.(Math.min(h + b, m), m, "scan"), await new Promise(g => setTimeout(g, 0))
    }
    return p.sort((h, d) => d.bestAbsCorr - h.bestAbsCorr), p.forEach((h, d) => {
        h.rank = d + 1
    }), {
        rows: p,
        ticker: s,
        targetMode: t,
        totalFactors: m,
        durationMs: Math.round(performance.now() - o)
    }
}

function K(e) {
    const o = ["Rank", "Spec", "Label", "Category", "BestAbsCorr", "BestCorr", "Spearman", "BestWindow", "BestLag", "Stability", "NObs", "PValue"].join(","),
        s = e.rows.map(t => [t.rank, `"${t.spec}"`, `"${t.label.replace(/"/g,'""')}"`, `"${t.category}"`, t.bestAbsCorr.toFixed(4), t.bestCorr.toFixed(4), t.spearman.toFixed(4), t.bestWindow, t.bestLag, t.stability.toFixed(4), t.nObs, t.pVal.toFixed(4)].join(","));
    return [o, ...s].join(`
`)
}
export {
    y as S, K as d, _ as r, x as s
};