import {
  aj as gt,
  r as x,
  af as bt,
  e as Nt,
  h as Mt,
  dA as Ge,
  j as e,
  ah as jt,
  cN as wt,
  a4 as He,
  c7 as Xe,
  cJ as Te,
  e6 as $e,
  ae as et
} from "./index-CsG73Aq_.js";
import {
  C as kt
} from "./ClassificationFiltersWithSource-D7v4WOtR.js";
import {
  u as yt
} from "./globalUniverse-DuqPcp2u.js";
import {
  g as tt
} from "./yahooPairsRatio-DERC-reP.js";
import {
  u as vt
} from "./usePairComboPicker-h_S34tFb.js";
import {
  U as We
} from "./UnifiedTickerPicker-D927mSvl.js";
import {
  B as St
} from "./BasketTickerPill-DA9Wjwwc.js";
import {
  D as Ze,
  F as oe,
  A as Se,
  a as Ft,
  b as Le,
  T as ae,
  c as Ne,
  d as Ct,
  e as $t,
  r as Lt
} from "./similarSetupsAlgorithms-CYRAhj-A.js";
import "./oscillatorMath-DdsdJyTp.js";
import "./harsi-NMVnsDcX.js";
import "./tva-DaeKqI67.js";
const Tt = ["Trend", "MA Distance", "MA Spread", "Momentum", "Oscillator", "Volatility",
  "Range / Channel", "Distribution", "Volume", "Cross-Sectional", "App-Specific", "Time"
];

function Je(i) {
  const o = i.filter(Number.isFinite);
  if (o.length < 30) return {
    z: i.map(() => NaN),
    mean: NaN,
    sd: NaN
  };
  const m = o.reduce((h, v) => h + v, 0) / o.length,
    n = Math.sqrt(o.reduce((h, v) => h + (v - m) ** 2, 0) / o.length);
  return n > 0 ? {
    z: i.map(h => Number.isFinite(h) ? (h - m) / n : NaN),
    mean: m,
    sd: n
  } : {
    z: i.map(() => NaN),
    mean: m,
    sd: n
  }
}

function Fe(i, o, m) {
  const n = [];
  for (let d = 0; d < i.length; d++)
    if (Number.isFinite(i[d])) {
      const s = m ? m[d] ?? 0 : 1;
      s > 0 && n.push({
        v: i[d],
        w: s
      })
    } if (n.length === 0) return null;
  n.sort((d, s) => d.v - s.v);
  const h = n.reduce((d, s) => d + s.w, 0),
    v = d => {
      const s = d * h;
      let N = 0;
      for (let j = 0; j < n.length; j++)
        if (N += n[j].w, N >= s) return n[j].v;
      return n[n.length - 1].v
    },
    p = n.reduce((d, s) => d + s.v * s.w, 0) / h,
    F = n.filter(d => d.v > 0).reduce((d, s) => d + s.w, 0),
    l = n.filter(d => d.v < 0).reduce((d, s) => d + s.w, 0),
    g = o.filter(Number.isFinite),
    f = g.length > 0 ? g.filter(d => d > 0).length / g.length * 100 : NaN,
    b = g.length > 0 ? g.filter(d => d < 0).length / g.length * 100 : NaN;
  return {
    median: v(.5),
    mean: p,
    p25: v(.25),
    p75: v(.75),
    hitRateLong: F / h * 100,
    hitRateShort: l / h * 100,
    baseLong: f,
    baseShort: b,
    n: n.length,
    baseN: g.length
  }
}

function st(i, o, m) {
  const n = new Map;
  for (let p = 0; p < o.length; p++) {
    const F = m[p];
    Number.isFinite(F) && F > 0 && n.set(o[p], F)
  }
  const h = new Array(i.length).fill(NaN);
  let v = NaN;
  for (let p = 0; p < i.length; p++) {
    const F = n.get(i[p]);
    typeof F == "number" ? (v = F, h[p] = F) : Number.isFinite(v) && (h[p] = v)
  }
  return h
}
async function Yt(i) {
  const {
    mode: o,
    singleTicker: m,
    basketSymbol: n,
    industryTickers: h,
    industryLabel: v,
    pairA: p,
    pairB: F
  } = i;
  if (o === "single") {
    if (!m) return null;
    try {
      const l = await Te(m);
      if (!l.dates.length) return null;
      const g = l.volumes.some(f => Number.isFinite(f) && f > 0);
      return {
        times: l.dates,
        closes: l.closes,
        highs: l.highs,
        lows: l.lows,
        opens: l.opens,
        volumes: l.volumes,
        label: m,
        hasVolume: g,
        hasOHLC: !0
      }
    } catch {
      const l = await $e(m);
      if (!l.length) return null;
      const g = l.map(f => f.close);
      return {
        times: l.map(f => f.time),
        closes: g,
        highs: g.slice(),
        lows: g.slice(),
        opens: g.slice(),
        volumes: new Array(g.length).fill(0),
        label: m,
        hasVolume: !1,
        hasOHLC: !1
      }
    }
  }
  if (o === "basket") {
    if (!n) return null;
    const l = await $e(n);
    if (!l.length) return null;
    const g = l.map(s => s.close),
      f = l.map(s => typeof s.high == "number" ? s.high : s.close),
      b = l.map(s => typeof s.low == "number" ? s.low : s.close),
      d = l.map(s => typeof s.open == "number" ? s.open : s.close);
    return {
      times: l.map(s => s.time),
      closes: g,
      highs: f,
      lows: b,
      opens: d,
      volumes: new Array(g.length).fill(0),
      label: n,
      hasVolume: !1,
      hasOHLC: !0
    }
  }
  if (o === "industry") {
    if (h.length === 0) return null;
    const g = (await Promise.all(h.map(async j => {
      try {
        const Y = await $e(j);
        return Y.length ? Y : null
      } catch {
        return null
      }
    }))).filter(j => !!j && j.length > 0);
    if (g.length === 0) return null;
    const b = g.map(j => {
      const Y = j.find(y => y.close > 0);
      if (!Y) return [];
      const R = Y.close;
      return j.filter(y => y.close > 0).map(y => ({
        time: y.time,
        v: y.close / R
      }))
    }).map(j => {
      const Y = new Map;
      for (const R of j) Y.set(R.time, R.v);
      return Y
    });
    if (b.length === 0 || b[0].size === 0) return null;
    const d = new Set(Array.from(b[0].keys()));
    for (let j = 1; j < b.length; j++) {
      const Y = new Set;
      for (const R of d) b[j].has(R) && Y.add(R);
      d.clear(), Y.forEach(R => d.add(R))
    }
    const s = Array.from(d).sort(),
      N = [];
    for (const j of s) {
      let Y = 0;
      for (const R of b) Y += R.get(j);
      N.push(Y / b.length)
    }
    return {
      times: s,
      closes: N,
      highs: N.slice(),
      lows: N.slice(),
      opens: N.slice(),
      volumes: new Array(N.length).fill(0),
      label: v,
      hasVolume: !1,
      hasOHLC: !1
    }
  }
  if (o === "pair" || o === "pairCombo") {
    if (!p || !F || p === F) return null;
    const l = await et(),
      g = await tt(p, F, l);
    if (!g || g.prices.length === 0) return null;
    const f = g.indices.map(d => l[d]),
      b = g.prices;
    return {
      times: f,
      closes: b,
      highs: b.slice(),
      lows: b.slice(),
      opens: b.slice(),
      volumes: new Array(b.length).fill(0),
      label: `${p} / ${F}`,
      hasVolume: !1,
      hasOHLC: !1
    }
  }
  return null
}
async function At(i) {
  try {
    const o = await Te("SPY");
    return o.dates.length ? st(i, o.dates, o.closes) : null
  } catch {
    return null
  }
}

function Qe(i, o, m) {
  if (!i || i.closes.length < 252) return null;
  const n = !!i.hasVolume,
    h = !!i.benchCloses,
    v = c => {
      const U = Ne[c] ?? ae[c];
      return !!(!U || U.requiresVolume && !n || U.requiresBench && !h)
    },
    p = Le.filter(c => o.has(c) && !v(c)),
    F = Object.keys(ae).filter(c => o.has(c));
  if (p.length + F.length === 0) return null;
  const l = {
      closes: i.closes,
      highs: i.highs,
      lows: i.lows,
      opens: i.opens,
      volumes: i.volumes,
      benchCloses: i.benchCloses
    },
    g = Ct(p, l),
    f = $t(i.times),
    b = {};
  for (const c of p) {
    const U = g[c] ?? new Array(i.closes.length).fill(NaN);
    b[c] = Je(U).z
  }
  for (const c of F) {
    const U = f[c] ?? new Array(i.closes.length).fill(NaN);
    b[c] = Je(U).z
  }
  const d = [...p, ...F],
    s = i.closes,
    N = s.length - 1,
    j = d.map(c => b[c][N]);
  if (j.some(c => !Number.isFinite(c))) return null;
  const Y = Math.max(0, N - m.exclusion),
    R = m.lookbackBars > 0 ? Math.max(0, N - m.lookbackBars) : 0,
    y = [];
  for (let c = R; c <= Y; c++) {
    const U = d.map(q => b[q][c]);
    if (U.some(q => !Number.isFinite(q))) continue;
    const X = s[c];
    if (!(X > 0)) continue;
    const le = q => {
      const Z = c + q;
      return Z >= s.length || !(s[Z] > 0) ? NaN : (s[Z] / X - 1) * 100
    };
    y.push({
      date: i.times[c],
      closeIdx: c,
      zVec: U,
      fwd1M: le(21),
      fwd3M: le(63),
      fwd6M: le(126),
      fwd1Y: le(252)
    })
  }
  if (y.length === 0) return null;
  const L = {
      bars: y,
      todayZ: j,
      n: m.n,
      closes: s,
      lastIdx: N,
      dtwWindow: m.dtwWindow,
      kernelH: m.kernelH > 0 ? m.kernelH : NaN,
      regimeK: m.regimeK
    },
    a = Lt(m.algo, L),
    w = a.matches.map(c => ({
      date: c.date,
      distance: c.distance,
      weight: c.weight,
      zVec: c.zVec,
      fwd1M: c.fwd1M,
      fwd3M: c.fwd3M,
      fwd6M: c.fwd6M,
      fwd1Y: c.fwd1Y
    }));
  if (w.length === 0) return {
    enabledList: d,
    todayZ: j,
    matches: [],
    total: y.length,
    algoInfo: a.info,
    h1M: null,
    h3M: null,
    h6M: null,
    h1Y: null
  };
  const D = y.map(c => c.fwd1M),
    re = y.map(c => c.fwd3M),
    H = y.map(c => c.fwd6M),
    ne = y.map(c => c.fwd1Y),
    ie = w.map(c => c.weight);
  return {
    enabledList: d,
    todayZ: j,
    matches: w,
    total: y.length,
    algoInfo: a.info,
    h1M: Fe(w.map(c => c.fwd1M), D, ie),
    h3M: Fe(w.map(c => c.fwd3M), re, ie),
    h6M: Fe(w.map(c => c.fwd6M), H, ie),
    h1Y: Fe(w.map(c => c.fwd1Y), ne, ie)
  }
}
async function Pt(i) {
  let o = null;
  try {
    const m = await Te(i);
    if (m.dates.length) {
      const n = m.volumes.some(h => Number.isFinite(h) && h > 0);
      o = {
        times: m.dates,
        closes: m.closes,
        highs: m.highs,
        lows: m.lows,
        opens: m.opens,
        volumes: m.volumes,
        label: i,
        hasVolume: n,
        hasOHLC: !0
      }
    }
  } catch {}
  if (!o) try {
    const m = await $e(i);
    if (!m.length) return null;
    const n = m.map(h => h.close);
    o = {
      times: m.map(h => h.time),
      closes: n,
      highs: n.slice(),
      lows: n.slice(),
      opens: n.slice(),
      volumes: new Array(n.length).fill(0),
      label: i,
      hasVolume: !1,
      hasOHLC: !1
    }
  } catch {
    return null
  }
  if (!o) return null;
  try {
    const m = await Te("SPY");
    m.dates.length && (o.benchCloses = st(o.times, m.dates, m.closes))
  } catch {}
  return o
}

function Kt() {
  const {
    baskets: i
  } = gt(), [o, m] = x.useState([]);
  x.useEffect(() => {
    let t = !0;
    return bt().then(r => {
      t && m(r)
    }).catch(() => {}), () => {
      t = !1
    }
  }, []);
  const [n, h] = x.useState("single"), v = (() => {
      try {
        const r = new URLSearchParams(window.location.search).get("ticker");
        return r ? r.toUpperCase() : ""
      } catch {
        return ""
      }
    })(), [p, F] = x.useState(v), [l, g] = x.useState(""), [f, b] = x.useState(() => Nt()), [d, s] =
    x.useState(""), [N, j] = x.useState(() => new Set), [Y, R] = x.useState("workbook"), {
      metas: y
    } = yt(), [L, a] = x.useState(""), [w, D] = x.useState(""), re = x.useMemo(() => o.map(t => t
      .ticker), [o]), H = vt(re, n === "pairCombo", "ss-pc");
  x.useEffect(() => {
    if (n !== "pairCombo" || H.pairs.length === 0) return;
    if (!H.pairs.some(r => r.a === L && r.b === w || r.a === w && r.b === L)) {
      const r = H.pairs[0];
      a(r.a), D(r.b)
    }
  }, [n, H.pairs, L, w]);
  const [ne, ie] = x.useState(20), [c, U] = x.useState(252), [X, le] = x.useState(0), [q, Z] = x
    .useState(() => new Set(Ze)), [I, rt] = x.useState("knn"), [me, nt] = x.useState(60), [ue, ot] =
    x.useState(0), [he, at] = x.useState(5), [J, it] = x.useState(!1), [xe, Ye] = x.useState(() =>
      new Set(Object.keys(oe).filter(t => t !== "Classic (6)"))), [G, Ae] = x.useState(!1), [Pe,
    pe] = x.useState(null), [Re, Oe] = x.useState(!1), [Ee, Ie] = x.useState({
      done: 0,
      total: 0
    }), [lt, ze] = x.useState(null), [Me, dt] = x.useState({
      key: "med3M",
      dir: "desc"
    }), [je, ct] = x.useState({
      key: "distance",
      dir: "asc"
    }), ee = (t, r = "desc") => {
      ct(u => u.key === t ? {
        key: t,
        dir: u.dir === "asc" ? "desc" : "asc"
      } : {
        key: t,
        dir: r
      })
    }, te = x.useState(() => ({
      cancelled: !1,
      runToken: 0
    }))[0], W = x.useMemo(() => n !== "industry" ? [] : f.economy.size + f.sector.size + f.subsector
      .size + f.industryGroup.size + f.industry.size + f.subindustry.size + N.size + (d.trim()
        .length > 0 ? 1 : 0) === 0 ? [] : Mt(Y === "global" ? y : o, f, d, N).map(S => S.ticker), [
        n, o, y, Y, f, d, N
      ]), De = x.useMemo(() => {
      if (n !== "industry") return "";
      const t = [],
        r = [
          ["economy", "Econ"],
          ["sector", "Sec"],
          ["subsector", "SubSec"],
          ["industryGroup", "IndGrp"],
          ["industry", "Ind"],
          ["subindustry", "SubInd"]
        ];
      for (const [u, S] of r) {
        const T = f[u];
        T.size !== 0 && (T.size === 1 ? t.push(`${S}=${[...T][0]}`) : t.push(`${S}(${T.size})`))
      }
      return d.trim() && t.push(`q="${d.trim()}"`), N.size > 0 && t.push(`+${N.size} manual`), t
        .length > 0 ? t.join(" · ") : "All filtered"
    }, [n, f, d, N]), Q = x.useMemo(() => {
      if (n === "industry") return W.filter(t => t && !t.startsWith("BASKET:")).map(t => ({
        kind: "single",
        ticker: t
      }));
      if (n === "basket") {
        const t = l ? Ge(l) : null;
        return t ? (i.find(u => u.id === t)?.tickers ?? []).filter(u => u && !u.startsWith(
          "BASKET:")).map(u => ({
          kind: "single",
          ticker: u
        })) : []
      }
      return n === "pairCombo" ? H.pairs.map(t => ({
        kind: "pair",
        a: t.a,
        b: t.b
      })) : []
    }, [n, W, l, i, H.pairs]);
  x.useMemo(() => Q.filter(t => t.kind === "single").map(t => t.ticker), [Q]);
  const fe = n === "industry" || n === "basket" || n === "pairCombo";
  x.useEffect(() => {
    !fe && G && (Ae(!1), pe(null))
  }, [fe]);
  const [B, de] = x.useState(null), [ge, Ue] = x.useState(!1), [Be, Ve] = x.useState(null), we = x
    .useMemo(() => {
      if (n === "single") return `single|${p}`;
      if (n === "basket") return `basket|${l}`;
      if (n === "industry") {
        const t = [...W].sort().join(",");
        return `industry|${W.length}|${t}`
      }
      return n === "pair" ? `pair|${L}|${w}` : n === "pairCombo" ? `pairCombo|${L}|${w}` : ""
    }, [n, p, l, W, L, w]);
  x.useEffect(() => {
    let t = !1;
    if (Ve(null), !we || we.endsWith("|") || we.endsWith("||")) {
      de(null);
      return
    }
    if (n === "industry" && W.length === 0) {
      de(null);
      return
    }
    if ((n === "pair" || n === "pairCombo") && (!L || !w || L === w)) {
      de(null);
      return
    }
    return Ue(!0), (async () => {
      try {
        const r = await Yt({
          mode: n,
          singleTicker: p,
          basketSymbol: l,
          industryTickers: W,
          industryLabel: De,
          pairA: L,
          pairB: w
        });
        if (t) return;
        if (!r) {
          de(null), Ve("No data returned for this selection.");
          return
        }
        const u = await At(r.times);
        if (t) return;
        de({
          ...r,
          benchCloses: u ?? void 0
        })
      } catch (r) {
        if (t) return;
        de(null), Ve(r?.message ? String(r.message) : "Failed to load price series.")
      } finally {
        t || Ue(!1)
      }
    })(), () => {
      t = !0
    }
  }, [we]);
  const ke = !!B?.hasVolume,
    ye = !!B?.benchCloses,
    qe = t => {
      const r = Ne[t] ?? ae[t];
      return !!(!r || r.requiresVolume && !ke || r.requiresBench && !ye)
    },
    Ke = t => B ? Qe(B, t, {
      n: ne,
      exclusion: c,
      lookbackBars: X,
      algo: I,
      dtwWindow: me,
      kernelH: ue,
      regimeK: he
    }) : null,
    P = x.useMemo(() => Ke(q), [B, ne, c, X, q, ke, ye, I, me, ue, he]),
    mt = async () => {
      if (!fe) return;
      const t = Q;
      if (t.length === 0) {
        ze(n === "pairCombo" ? "No pairs in the leg set. Add tickers to the leg set first." :
          "No constituent tickers to run."), pe(null);
        return
      }
      te.cancelled = !1;
      const r = ++te.runToken;
      ze(null), Oe(!0), Ie({
        done: 0,
        total: t.length
      }), pe([]);
      const u = {
          n: ne,
          exclusion: c,
          lookbackBars: X,
          algo: I,
          dtwWindow: me,
          kernelH: ue,
          regimeK: he
        },
        S = new Set(q),
        T = async $ => {
            if ($.kind === "single") return Pt($.ticker);
            const K = await et(),
              M = await tt($.a, $.b, K);
            if (!M || M.prices.length === 0) return null;
            const z = M.indices.map(_ => K[_]),
              k = M.prices;
            return {
              times: z,
              closes: k,
              highs: k.slice(),
              lows: k.slice(),
              opens: k.slice(),
              volumes: new Array(k.length).fill(0),
              label: `${$.a} / ${$.b}`,
              hasVolume: !1,
              hasOHLC: !1
            }
          }, C = $ => $.kind === "single" ? $.ticker : `${$.a}/${$.b}`, O = [], V = 8, E = () =>
          te.runToken !== r;
      for (let $ = 0; $ < t.length && !E(); $ += V) {
        const K = t.slice($, $ + V),
          M = await Promise.all(K.map(async z => {
            const k = C(z);
            try {
              const _ = await T(z);
              if (!_) return {
                ticker: k,
                nMatches: 0,
                total: 0,
                med1M: NaN,
                med3M: NaN,
                med6M: NaN,
                med1Y: NaN,
                hLong3M: NaN,
                baseLong3M: NaN,
                hShort3M: NaN,
                baseShort3M: NaN,
                note: "load failed"
              };
              if (_.closes.length < 252) return {
                ticker: k,
                nMatches: 0,
                total: _.closes.length,
                med1M: NaN,
                med3M: NaN,
                med6M: NaN,
                med1Y: NaN,
                hLong3M: NaN,
                baseLong3M: NaN,
                hShort3M: NaN,
                baseShort3M: NaN,
                note: `<252 bars (${_.closes.length})`
              };
              const A = Qe(_, S, u);
              return A ? A.matches.length === 0 ? {
                ticker: k,
                nMatches: 0,
                total: A.total,
                med1M: NaN,
                med3M: NaN,
                med6M: NaN,
                med1Y: NaN,
                hLong3M: NaN,
                baseLong3M: NaN,
                hShort3M: NaN,
                baseShort3M: NaN,
                note: "no matches"
              } : {
                ticker: k,
                nMatches: A.matches.length,
                total: A.total,
                med1M: A.h1M?.median ?? NaN,
                med3M: A.h3M?.median ?? NaN,
                med6M: A.h6M?.median ?? NaN,
                med1Y: A.h1Y?.median ?? NaN,
                hLong3M: A.h3M?.hitRateLong ?? NaN,
                baseLong3M: A.h3M?.baseLong ?? NaN,
                hShort3M: A.h3M?.hitRateShort ?? NaN,
                baseShort3M: A.h3M?.baseShort ?? NaN
              } : {
                ticker: k,
                nMatches: 0,
                total: _.closes.length,
                med1M: NaN,
                med3M: NaN,
                med6M: NaN,
                med1Y: NaN,
                hLong3M: NaN,
                baseLong3M: NaN,
                hShort3M: NaN,
                baseShort3M: NaN,
                note: "no valid today vector"
              }
            } catch (_) {
              return {
                ticker: k,
                nMatches: 0,
                total: 0,
                med1M: NaN,
                med3M: NaN,
                med6M: NaN,
                med1Y: NaN,
                hLong3M: NaN,
                baseLong3M: NaN,
                hShort3M: NaN,
                baseShort3M: NaN,
                note: _?.message ? String(_.message).slice(0, 60) : "error"
              }
            }
          }));
        if (E()) break;
        O.push(...M), pe([...O]), Ie({
          done: O.length,
          total: t.length
        })
      }
      E() || Oe(!1)
    };
  x.useEffect(() => {
    te.runToken++, te.cancelled = !0
  }, [n, l, W, H.pairs]);
  const ut = x.useMemo(() => {
      if (!Pe) return null;
      const t = [...Pe],
        r = Me.key,
        u = Me.dir === "asc" ? 1 : -1;
      return t.sort((S, T) => {
        if (r === "ticker") return S.ticker.localeCompare(T.ticker) * u;
        const C = S[r],
          O = T[r],
          V = Number.isFinite(C),
          E = Number.isFinite(O);
        return !V && !E ? 0 : V ? E ? (C - O) * u : -1 : 1
      }), t
    }, [Pe, Me]),
    ht = t => {
      dt(r => r.key === t ? {
        key: t,
        dir: r.dir === "desc" ? "asc" : "desc"
      } : {
        key: t,
        dir: t === "ticker" ? "asc" : "desc"
      })
    },
    be = x.useMemo(() => {
      if (!J || !B || B.closes.length < 252) return null;
      const t = [];
      for (const M of Object.keys(oe)) {
        if (!xe.has(M)) continue;
        const z = oe[M],
          k = Ke(new Set(z));
        if (!k || !k.matches.length) {
          t.push({
            preset: M,
            n: 0,
            med1M: NaN,
            med3M: NaN,
            med6M: NaN,
            med1Y: NaN,
            hLong3M: NaN,
            baseLong3M: NaN,
            hShort3M: NaN,
            baseShort3M: NaN,
            valid: !1
          });
          continue
        }
        t.push({
          preset: M,
          n: k.matches.length,
          med1M: k.h1M?.median ?? NaN,
          med3M: k.h3M?.median ?? NaN,
          med6M: k.h6M?.median ?? NaN,
          med1Y: k.h1Y?.median ?? NaN,
          hLong3M: k.h3M?.hitRateLong ?? NaN,
          baseLong3M: k.h3M?.baseLong ?? NaN,
          hShort3M: k.h3M?.hitRateShort ?? NaN,
          baseShort3M: k.h3M?.baseShort ?? NaN,
          valid: !0
        })
      }
      const r = t.filter(M => M.valid && Number.isFinite(M.med3M));
      if (r.length === 0) return {
        rows: t,
        valid: r,
        verdict: "No valid presets produced matches."
      };
      const u = M => {
          let z = 0,
            k = 0;
          for (const _ of r) {
            const A = _[M];
            if (!Number.isFinite(A)) continue;
            const ce = Math.sqrt(_.n);
            z += ce, k += A * ce
          }
          return z > 0 ? k / z : NaN
        },
        S = M => {
          const z = r.map(A => A[M]).filter(Number.isFinite);
          if (z.length < 2) return NaN;
          const k = z.reduce((A, ce) => A + ce, 0) / z.length,
            _ = z.reduce((A, ce) => A + (ce - k) ** 2, 0) / (z.length - 1);
          return Math.sqrt(_)
        },
        T = {
          med1M: u("med1M"),
          med3M: u("med3M"),
          med6M: u("med6M"),
          med1Y: u("med1Y"),
          sd1M: S("med1M"),
          sd3M: S("med3M"),
          sd6M: S("med6M"),
          sd1Y: S("med1Y")
        },
        C = r.filter(M => M.med3M > 0).length,
        O = r.filter(M => M.med3M < 0).length,
        V = Math.max(C, O) / r.length,
        E = C > O ? "long" : O > C ? "short" : "mixed";
      let $ = "Mixed — no clear direction";
      const K = Number.isFinite(T.sd3M) && T.sd3M > 0 ? Math.abs(T.med3M) / T.sd3M : NaN;
      if (E !== "mixed") {
        const M = E === "long" ? "long" : "short";
        V >= .8 && (K >= 1 || !Number.isFinite(K)) ? $ = `Strong ${M}` : V >= .66 ? $ =
          `Moderate ${M}` : V >= .55 ? $ = `Weak ${M}` : $ = `Mixed — ${M} leaning`
      }
      return {
        rows: t,
        valid: r,
        cons: T,
        agreement: V,
        direction: E,
        long3M: C,
        short3M: O,
        snr: K,
        verdict: $
      }
    }, [J, xe, B, ne, c, X, ke, ye, I, me, ue, he]),
    ve = t => Number.isFinite(t) ? `${t>=0?"+":""}${t.toFixed(1)}%` : "—",
    xt = B?.label ?? "—",
    pt = t => {
      if (t === "__none__") return;
      const r = oe[t];
      r && Z(new Set(r))
    },
    _e = t => (Ne[t] ?? ae[t])?.label ?? t,
    ft = x.useMemo(() => {
      if (!P?.matches?.length) return P?.matches ?? [];
      const t = [...P.matches],
        {
          key: r,
          dir: u
        } = je,
        S = u === "asc" ? 1 : -1,
        T = C => {
          if (r === "date") return C.date;
          if (r === "distance") return C.distance;
          if (r === "weight") return C.weight;
          if (r === "fwd1M") return C.fwd1M;
          if (r === "fwd3M") return C.fwd3M;
          if (r === "fwd6M") return C.fwd6M;
          if (r === "fwd1Y") return C.fwd1Y;
          if (r.startsWith("z:")) {
            const O = parseInt(r.slice(2), 10);
            return Number.isFinite(O) ? C.zVec[O] ?? NaN : NaN
          }
          return NaN
        };
      return t.sort((C, O) => {
        const V = T(C),
          E = T(O);
        if (typeof V == "string" && typeof E == "string") return V.localeCompare(E) * S;
        const $ = typeof V == "number" ? V : NaN,
          K = typeof E == "number" ? E : NaN,
          M = Number.isFinite($),
          z = Number.isFinite(K);
        return !M && !z ? 0 : M ? z ? ($ - K) * S : -1 : 1
      }), t
    }, [P, je]),
    se = t => je.key === t ? je.dir === "desc" ? " ↓" : " ↑" : "";
  return e.jsxs("div", {
    className: "flex flex-col h-full bg-background overflow-auto",
    "data-testid": "similar-setups-page",
    children: [e.jsxs("div", {
      className: "px-3 py-2 border-b border-border flex items-center gap-3 flex-wrap bg-card",
      children: [e.jsx(jt, {
        className: "w-4 h-4 text-amber-400"
      }), e.jsxs("h1", {
        className: "text-sm font-mono font-semibold text-foreground",
        children: ["Similar Setups · ", e.jsx("span", {
          className: "text-amber-300",
          children: xt
        })]
      }), !J && P && e.jsxs("span", {
        className: "text-[10px] font-mono text-muted-foreground",
        children: [P.matches.length, "/", P.total, " bars matched · feature dim ", P
          .enabledList.length, " · ", P.algoInfo
        ]
      }), J && be && e.jsxs("span", {
        className: "text-[10px] font-mono text-amber-300/80",
        children: ["consensus · ", be.valid.length, "/", be.rows.length,
          " valid presets · ", Se[I].label
        ]
      }), B && e.jsxs("span", {
        className: "text-[10px] font-mono text-muted-foreground/60",
        children: [ke ? "OHLCV" : B.hasOHLC ? "OHLC" : "close-only", ye ?
          " · SPY benchmark loaded" : " · no benchmark"
        ]
      })]
    }), e.jsxs("div", {
      className: "px-3 py-2 border-b border-border bg-card/60 flex items-center gap-3 flex-wrap",
      children: [e.jsx("span", {
        className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
        children: "Mode"
      }), e.jsx("div", {
        className: "flex rounded border border-border overflow-hidden",
        "data-testid": "ss-mode-tabs",
        children: ["single", "basket", "industry", "pair", "pairCombo"].map(t => e
          .jsx("button", {
            onClick: () => h(t),
            className: `text-[11px] font-mono px-2.5 py-1 transition-colors ${n===t?"bg-amber-500/15 text-amber-300 border-r border-border last:border-r-0":"bg-card text-muted-foreground hover:text-foreground hover:bg-accent border-r border-border last:border-r-0"}`,
            "data-testid": `ss-mode-${t}`,
            children: t
          }, t))
      }), e.jsx("span", {
        className: "w-px h-5 bg-border"
      }), n === "single" && e.jsx("div", {
        className: "flex items-center gap-2 min-w-[280px]",
        children: e.jsx(We, {
          tickers: o,
          value: p,
          onChange: F
        })
      }), n === "basket" && e.jsxs("div", {
        className: "flex items-center gap-2",
        children: [e.jsx(St, {
          activeTicker: l,
          onSelectTicker: t => g(wt(t) ? t : "")
        }), l && (() => {
          const t = Ge(l),
            r = t ? i.find(u => u.id === t) : null;
          return r ? e.jsxs("span", {
            className: "text-[10px] font-mono text-muted-foreground",
            children: [r.tickers.length, " constituents"]
          }) : null
        })()]
      }), n === "industry" && e.jsxs("div", {
        className: "flex flex-col gap-1.5 w-full",
        children: [e.jsx(kt, {
          workbookTickers: o,
          filters: f,
          onFiltersChange: b,
          search: d,
          onSearchChange: s,
          manualTickers: N,
          onManualTickersChange: j,
          filteredCount: W.length,
          totalCount: o.length,
          testIdPrefix: "ss-class",
          source: Y,
          onSourceChange: R
        }), e.jsxs("div", {
          className: "flex items-center gap-2 flex-wrap",
          children: [e.jsx("span", {
            className: "text-[10px] font-mono text-muted-foreground",
            children: W.length === 0 ?
              "Pick at least one filter value" :
              `${W.length} tickers · equal-weight composite · ${De}`
          }), W.length > 0 && W.length <= 24 && e.jsxs("span", {
            className: "text-[9px] font-mono text-muted-foreground/70 truncate max-w-[600px]",
            children: ["[", W.slice(0, 24).join(", "), W.length > 24 ?
              "…" : "", "]"
            ]
          })]
        })]
      }), n === "pair" && e.jsxs("div", {
        className: "flex items-center gap-2 flex-wrap",
        children: [e.jsx("span", {
          className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "A"
        }), e.jsx("div", {
          className: "min-w-[200px]",
          children: e.jsx(We, {
            tickers: o,
            value: L,
            onChange: a,
            label: ""
          })
        }), e.jsx("span", {
          className: "text-[10px] font-mono text-muted-foreground",
          children: "/"
        }), e.jsx("span", {
          className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "B"
        }), e.jsx("div", {
          className: "min-w-[200px]",
          children: e.jsx(We, {
            tickers: o,
            value: w,
            onChange: D,
            label: ""
          })
        })]
      }), n === "pairCombo" && e.jsxs("div", {
        className: "flex flex-col gap-1.5 w-full",
        children: [e.jsx("label", {
          className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "Pair Combo — Leg Set"
        }), H.ui, H.pairs.length > 0 && e.jsxs("div", {
          className: "flex items-center gap-1.5 flex-wrap pt-1",
          children: [e.jsx("span", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider mr-1",
            children: "Anchor"
          }), H.pairs.map(t => {
            const r = t.a === L && t.b === w || t.a === w && t.b === L;
            return e.jsx("button", {
              onClick: () => {
                a(t.a), D(t.b)
              },
              className: `text-[10px] font-mono px-2 py-0.5 rounded border ${r?"bg-amber-500/15 text-amber-300 border-amber-500/40":"bg-card text-muted-foreground border-border hover:text-foreground"}`,
              "data-testid": `ss-pc-anchor-${t.label}`,
              children: t.label
            }, t.label)
          })]
        })]
      }), e.jsx("div", {
        className: "flex-1"
      }), e.jsxs("div", {
        className: "flex items-center gap-2 flex-wrap",
        children: [e.jsx("label", {
          className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "Algo"
        }), e.jsx("select", {
          value: I,
          onChange: t => rt(t.target.value),
          className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
          "data-testid": "ss-algo-select",
          title: Se[I].tooltip,
          children: Ft.map(t => e.jsx("option", {
            value: t,
            title: Se[t].tooltip,
            children: Se[t].label
          }, t))
        }), e.jsxs("button", {
          onClick: () => it(t => !t),
          className: `text-[10px] font-mono px-2 py-0.5 border rounded transition-colors ${J?"border-amber-500 bg-amber-500/15 text-amber-300":"border-border text-muted-foreground hover:text-foreground hover:bg-accent"}`,
          "data-testid": "ss-consensus-toggle",
          title: "Run all selected presets in parallel and show consensus across feature subspaces",
          children: ["Consensus ", J ? "ON" : "OFF"]
        }), fe && e.jsxs("button", {
          onClick: () => {
            Ae(t => {
              const r = !t;
              return r || (te.cancelled = !0, Oe(!1), pe(null), ze(
                null)), r
            })
          },
          className: `text-[10px] font-mono px-2 py-0.5 border rounded transition-colors ${G?"border-amber-500 bg-amber-500/15 text-amber-300":"border-border text-muted-foreground hover:text-foreground hover:bg-accent"}`,
          "data-testid": "ss-per-ticker-toggle",
          title: "Instead of building one composite, run the algorithm on each constituent ticker individually",
          children: ["Per-ticker ", G ? "ON" : "OFF"]
        }), fe && G && e.jsx("button", {
          onClick: () => {
            mt()
          },
          disabled: Q.length === 0 || Re,
          className: "text-[10px] font-mono px-2 py-0.5 border border-amber-500/60 bg-amber-500/10 text-amber-300 rounded hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed",
          "data-testid": "ss-per-ticker-run",
          title: n === "pairCombo" ?
            "Run algorithm on each pair in the leg set" :
            "Run algorithm on each constituent ticker",
          children: Re ? `Running… ${Ee.done}/${Ee.total}` : n ===
            "pairCombo" ? `Run on ${Q.length} pair${Q.length===1?"":"s"}` :
            `Run on ${Q.length} ticker${Q.length===1?"":"s"}`
        }), I === "dtw" && e.jsxs(e.Fragment, {
          children: [e.jsx("label", {
            className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Window"
          }), e.jsx("select", {
            value: me,
            onChange: t => nt(Number(t.target.value)),
            className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
            "data-testid": "ss-dtw-window",
            title: "Length of the recent log-return trajectory to match",
            children: [20, 30, 40, 60, 90, 120, 180, 252].map(t => e
              .jsxs("option", {
                value: t,
                children: [t, "b"]
              }, t))
          })]
        }), I === "kernel" && e.jsxs(e.Fragment, {
          children: [e.jsx("label", {
            className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "h"
          }), e.jsxs("select", {
            value: ue,
            onChange: t => ot(Number(t.target.value)),
            className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
            "data-testid": "ss-kernel-h",
            title: "Gaussian-kernel bandwidth (in z-distance units). Auto picks the median nearest-3N distance.",
            children: [e.jsx("option", {
              value: 0,
              children: "auto"
            }), e.jsx("option", {
              value: .5,
              children: "0.5"
            }), e.jsx("option", {
              value: 1,
              children: "1.0"
            }), e.jsx("option", {
              value: 1.5,
              children: "1.5"
            }), e.jsx("option", {
              value: 2,
              children: "2.0"
            }), e.jsx("option", {
              value: 3,
              children: "3.0"
            })]
          })]
        }), I === "regime" && e.jsxs(e.Fragment, {
          children: [e.jsx("label", {
            className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "K"
          }), e.jsx("select", {
            value: he,
            onChange: t => at(Number(t.target.value)),
            className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
            "data-testid": "ss-regime-k",
            title: "Number of K-Means clusters",
            children: [2, 3, 4, 5, 6, 8, 10, 12].map(t => e.jsx(
              "option", {
                value: t,
                children: t
              }, t))
          })]
        }), e.jsx("label", {
          className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "N"
        }), e.jsx("select", {
          value: ne,
          onChange: t => ie(Number(t.target.value)),
          className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
          "data-testid": "ss-n-select",
          title: I === "kernel" ?
            "N controls how many neighbors appear in the matched-dates table; weighted summary uses up to 3N" :
            "Number of nearest neighbors",
          children: [10, 20, 30, 50, 100].map(t => e.jsx("option", {
            value: t,
            children: t
          }, t))
        }), e.jsx("label", {
          className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "Exclude last"
        }), e.jsxs("select", {
          value: c,
          onChange: t => U(Number(t.target.value)),
          className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
          "data-testid": "ss-exclusion-select",
          children: [e.jsx("option", {
            value: 63,
            children: "3M"
          }), e.jsx("option", {
            value: 126,
            children: "6M"
          }), e.jsx("option", {
            value: 252,
            children: "1Y"
          }), e.jsx("option", {
            value: 504,
            children: "2Y"
          })]
        }), e.jsx("label", {
          className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
          title: "How far back to search for similar setups. Default (All) uses every bar Yahoo returns — for older REITs that can reach back to the 1990s.",
          children: "Search history"
        }), e.jsxs("select", {
          value: X,
          onChange: t => le(Number(t.target.value)),
          className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
          "data-testid": "ss-lookback-select",
          title: "Limit the candidate pool to bars within this lookback (counted from today, then trimmed by Exclude last). 'All' = full available history.",
          children: [e.jsx("option", {
            value: 0,
            children: "All"
          }), e.jsx("option", {
            value: 756,
            children: "3Y"
          }), e.jsx("option", {
            value: 1260,
            children: "5Y"
          }), e.jsx("option", {
            value: 2520,
            children: "10Y"
          }), e.jsx("option", {
            value: 3780,
            children: "15Y"
          }), e.jsx("option", {
            value: 5040,
            children: "20Y"
          })]
        })]
      })]
    }), J && e.jsxs("div", {
      className: "px-3 py-2 border-b border-border bg-amber-500/5 flex items-center gap-1.5 flex-wrap",
      children: [e.jsx("span", {
        className: "text-[10px] font-mono text-amber-300 uppercase tracking-wider mr-1",
        children: "Consensus presets"
      }), Object.keys(oe).map(t => {
        const r = xe.has(t);
        return e.jsx("button", {
          onClick: () => Ye(u => {
            const S = new Set(u);
            return S.has(t) ? S.delete(t) : S.add(t), S
          }),
          className: `text-[10px] font-mono px-2 py-0.5 border rounded transition-colors ${r?"border-amber-500 bg-amber-500/15 text-amber-300":"border-border text-muted-foreground hover:text-foreground hover:bg-accent"}`,
          "data-testid": `ss-consensus-preset-${t}`,
          children: t
        }, t)
      }), e.jsx("button", {
        onClick: () => Ye(new Set(Object.keys(oe))),
        className: "text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent ml-2",
        children: "All"
      }), e.jsx("button", {
        onClick: () => Ye(new Set),
        className: "text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent",
        children: "None"
      }), e.jsxs("span", {
        className: "text-[10px] font-mono text-muted-foreground/70 ml-2",
        children: [xe.size, " preset", xe.size === 1 ? "" : "s", " selected"]
      })]
    }), e.jsxs("div", {
      className: "px-3 py-2 border-b border-border bg-card/40 flex flex-col gap-1.5",
      children: [e.jsxs("div", {
        className: "flex items-center gap-2 flex-wrap",
        children: [e.jsx("span", {
          className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider mr-1",
          children: "Features"
        }), e.jsx("label", {
          className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "Preset"
        }), e.jsxs("select", {
          onChange: t => {
            pt(t.target.value), t.target.value = "__none__"
          },
          defaultValue: "__none__",
          className: "text-[10px] font-mono px-2 py-0.5 bg-background border border-border rounded text-foreground",
          "data-testid": "ss-preset-select",
          children: [e.jsx("option", {
            value: "__none__",
            children: "(apply preset…)"
          }), Object.keys(oe).map(t => e.jsx("option", {
            value: t,
            children: t
          }, t))]
        }), e.jsx("button", {
          onClick: () => {
            const t = new Set;
            for (const r of Le) qe(r) || t.add(r);
            Z(t)
          },
          className: "text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent",
          children: "All"
        }), e.jsx("button", {
          onClick: () => Z(new Set(Ze)),
          className: "text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent",
          children: "Default"
        }), e.jsx("button", {
          onClick: () => Z(new Set),
          className: "text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent",
          children: "None"
        }), e.jsxs("span", {
          className: "text-[10px] font-mono text-muted-foreground/70 ml-2",
          children: [q.size, "/", Le.length + Object.keys(ae).length,
            " enabled"
          ]
        })]
      }), Tt.map(t => {
        const r = t === "Time" ? Object.keys(ae) : Le.filter(u => Ne[u].category ===
          t);
        return r.length === 0 ? null : e.jsxs("div", {
          className: "flex items-start gap-1.5 flex-wrap",
          children: [e.jsx("span", {
            className: "text-[9px] font-mono text-muted-foreground/70 uppercase tracking-wider w-24 pt-0.5 shrink-0",
            children: t
          }), e.jsx("div", {
            className: "flex items-center gap-1.5 flex-wrap flex-1",
            children: r.map(u => {
              const S = q.has(u),
                T = qe(u),
                C = Ne[u] ?? ae[u];
              let O = C?.label ?? u;
              return T && C?.requiresVolume && (O +=
                  " — needs volume (single-ticker mode only)"), T && C
                ?.requiresBench && (O +=
                  " — SPY benchmark not loaded"), e.jsx("button", {
                  disabled: T,
                  title: O,
                  onClick: () => {
                    Z(V => {
                      const E = new Set(V);
                      return E.has(u) ? E.delete(u) : E.add(
                        u), E
                    })
                  },
                  className: `text-[10px] font-mono px-2 py-0.5 border rounded transition-colors ${T?"border-border/40 text-muted-foreground/40 cursor-not-allowed":S?"border-amber-500 bg-amber-500/15 text-amber-300":"border-border hover:bg-accent text-muted-foreground hover:text-foreground"}`,
                  "data-testid": `ss-feature-${u}`,
                  children: C?.label ?? u
                }, u)
            })
          })]
        }, t)
      })]
    }), P && e.jsxs("div", {
      className: "px-3 py-1.5 border-b border-border bg-card/30 text-[10px] font-mono text-muted-foreground/80 overflow-x-auto whitespace-nowrap",
      children: ["today z:", " ", P.enabledList.map((t, r) => e.jsxs("span", {
        className: "mr-2",
        children: [_e(t), "=", e.jsx("span", {
          className: "text-foreground",
          children: P.todayZ[r].toFixed(2)
        })]
      }, t))]
    }), e.jsxs("div", {
      className: "flex-1 min-h-0 overflow-auto",
      children: [ge && e.jsxs("div", {
        className: "px-3 py-6 flex items-center gap-2 text-muted-foreground text-[11px] font-mono",
        children: [e.jsx(He, {
          className: "w-3.5 h-3.5 animate-spin"
        }), "Loading price series…"]
      }), !ge && Be && e.jsxs("div", {
        className: "px-3 py-6 flex items-center gap-2 text-red-400 text-[11px] font-mono",
        children: [e.jsx(Xe, {
          className: "w-3.5 h-3.5"
        }), Be]
      }), !ge && !Be && !B && !G && e.jsxs("div", {
        className: "px-3 py-6 text-[11px] font-mono text-muted-foreground",
        children: [n === "single" && "Select a ticker to begin.", n === "basket" &&
          "Pick a basket to begin.", n === "industry" &&
          "Pick a classification dim + value to build a composite.", n ===
          "pair" && "Pick both legs (A and B) to compute a pair-ratio series.",
          n === "pairCombo" &&
          "Pick a leg set and choose an anchor pair to compute a pair-ratio series."
        ]
      }), !ge && B && B.closes.length < 252 && !G && e.jsxs("div", {
        className: "px-3 py-6 text-[11px] font-mono text-muted-foreground",
        children: ["Need ≥252 bars to run; got ", B.closes.length, "."]
      }), !ge && B && B.closes.length >= 252 && !P && !G && e.jsx("div", {
        className: "px-3 py-6 text-[11px] font-mono text-muted-foreground",
        children: "Need at least one feature enabled with finite z-scores at the latest bar."
      }), G && e.jsx(Rt, {
        rows: ut,
        running: Re,
        progress: Ee,
        error: lt,
        sort: Me,
        onSort: ht,
        onTickerClick: t => {
          if (Ae(!1), te.cancelled = !0, te.runToken++, t.includes("/")) {
            const [r, u] = t.split("/").map(S => S.trim().toUpperCase());
            if (r && u) {
              a(r), D(u);
              return
            }
          }
          h("single"), F(t)
        },
        sourceCount: Q.length,
        unitLabel: n === "pairCombo" ? "pair" : "ticker"
      }), !G && J && be && e.jsx(Ot, {
        consensus: be
      }), !G && !J && P && e.jsxs(e.Fragment, {
        children: [e.jsxs("div", {
          className: "grid grid-cols-2 md:grid-cols-4 gap-px bg-border",
          children: [e.jsx(Ce, {
            label: "Forward 1M",
            stats: P.h1M
          }), e.jsx(Ce, {
            label: "Forward 3M",
            stats: P.h3M
          }), e.jsx(Ce, {
            label: "Forward 6M",
            stats: P.h6M
          }), e.jsx(Ce, {
            label: "Forward 1Y",
            stats: P.h1Y
          })]
        }), P.matches.length > 0 && e.jsxs("details", {
          className: "border-t border-border",
          open: !0,
          children: [e.jsxs("summary", {
            className: "px-3 py-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground cursor-pointer select-none bg-card/40",
            children: ["Show top-", P.matches.length, " matched dates"]
          }), e.jsx("div", {
            className: "px-3 pb-2 overflow-x-auto max-h-[60vh]",
            children: e.jsxs("table", {
              className: "w-full text-[10px] font-mono",
              children: [e.jsx("thead", {
                className: "sticky top-0 bg-card",
                children: e.jsxs("tr", {
                  className: "text-muted-foreground/70 uppercase tracking-wider",
                  children: [e.jsxs("th", {
                    className: "text-left font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground",
                    onClick: () => ee("date",
                      "asc"),
                    title: "Sort by date",
                    children: ["Date", se("date")]
                  }), P.enabledList.map((t, r) => e
                    .jsxs("th", {
                      className: "text-right font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground",
                      onClick: () => ee(`z:${r}`,
                        "desc"),
                      title: `Sort by ${_e(t)} z-score`,
                      children: [_e(t), " z", se(
                        `z:${r}`)]
                    }, t)), e.jsxs("th", {
                    className: "text-right font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground",
                    onClick: () => ee("distance",
                      "asc"),
                    title: "Sort by distance (closer = more similar)",
                    children: ["dist", se(
                      "distance")]
                  }), I === "kernel" && e.jsxs("th", {
                    className: "text-right font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground",
                    onClick: () => ee("weight",
                      "desc"),
                    title: "Sort by kernel weight",
                    children: ["wt", se("weight")]
                  }), e.jsxs("th", {
                    className: "text-right font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground",
                    onClick: () => ee("fwd1M",
                      "desc"),
                    title: "Sort by forward 1M return",
                    children: ["fwd 1M", se(
                      "fwd1M")]
                  }), e.jsxs("th", {
                    className: "text-right font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground",
                    onClick: () => ee("fwd3M",
                      "desc"),
                    title: "Sort by forward 3M return",
                    children: ["fwd 3M", se(
                      "fwd3M")]
                  }), e.jsxs("th", {
                    className: "text-right font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground",
                    onClick: () => ee("fwd6M",
                      "desc"),
                    title: "Sort by forward 6M return",
                    children: ["fwd 6M", se(
                      "fwd6M")]
                  }), e.jsxs("th", {
                    className: "text-right font-normal py-1 cursor-pointer select-none hover:text-foreground",
                    onClick: () => ee("fwd1Y",
                      "desc"),
                    title: "Sort by forward 1Y return",
                    children: ["fwd 1Y", se(
                      "fwd1Y")]
                  })]
                })
              }), e.jsx("tbody", {
                children: ft.map(t => e.jsxs("tr", {
                  className: "border-t border-border/40",
                  children: [e.jsx("td", {
                    className: "text-foreground pr-3 py-0.5",
                    children: t.date
                  }), t.zVec.map((r, u) => e.jsx(
                    "td", {
                      className: "text-right text-muted-foreground pr-3 py-0.5",
                      children: r.toFixed(2)
                    }, u)), e.jsx("td", {
                    className: "text-right text-muted-foreground pr-3 py-0.5",
                    children: t.distance.toFixed(
                      2)
                  }), I === "kernel" && e.jsxs(
                  "td", {
                    className: "text-right text-muted-foreground pr-3 py-0.5",
                    children: [(t.weight * 100)
                      .toFixed(1), "%"
                    ]
                  }), e.jsx("td", {
                    className: `text-right pr-3 py-0.5 ${Number.isFinite(t.fwd1M)?t.fwd1M>=0?"text-green-400":"text-red-400":"text-muted-foreground/50"}`,
                    children: ve(t.fwd1M)
                  }), e.jsx("td", {
                    className: `text-right pr-3 py-0.5 ${Number.isFinite(t.fwd3M)?t.fwd3M>=0?"text-green-400":"text-red-400":"text-muted-foreground/50"}`,
                    children: ve(t.fwd3M)
                  }), e.jsx("td", {
                    className: `text-right pr-3 py-0.5 ${Number.isFinite(t.fwd6M)?t.fwd6M>=0?"text-green-400":"text-red-400":"text-muted-foreground/50"}`,
                    children: ve(t.fwd6M)
                  }), e.jsx("td", {
                    className: `text-right py-0.5 ${Number.isFinite(t.fwd1Y)?t.fwd1Y>=0?"text-green-400":"text-red-400":"text-muted-foreground/50"}`,
                    children: ve(t.fwd1Y)
                  })]
                }, t.date))
              })]
            })
          })]
        })]
      })]
    })]
  })
}

function Ce({
  label: i,
  stats: o
}) {
  if (!o) return e.jsxs("div", {
    className: "bg-card px-3 py-2 flex flex-col gap-0.5",
    children: [e.jsx("span", {
      className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
      children: i
    }), e.jsx("span", {
      className: "text-base font-mono text-muted-foreground/50",
      children: "—"
    })]
  });
  const m = h => `${h>=0?"+":""}${h.toFixed(1)}%`,
    n = o.median > 0 ? "text-green-400" : o.median < 0 ? "text-red-400" : "text-foreground";
  return e.jsxs("div", {
    className: "bg-card px-3 py-2 flex flex-col gap-0.5",
    children: [e.jsx("div", {
      className: "flex items-center justify-between",
      children: e.jsx("span", {
        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
        children: i
      })
    }), e.jsxs("div", {
      className: "flex items-baseline gap-2",
      children: [e.jsx("span", {
        className: `text-base font-mono font-semibold ${n}`,
        children: m(o.median)
      }), e.jsx("span", {
        className: "text-[10px] font-mono text-muted-foreground",
        children: "median"
      })]
    }), e.jsxs("div", {
      className: "text-[9px] font-mono text-muted-foreground/80 flex flex-wrap gap-x-3",
      children: [e.jsxs("span", {
        children: ["mean ", m(o.mean)]
      }), e.jsxs("span", {
        children: ["n=", o.n]
      })]
    }), e.jsxs("div", {
      className: "text-[9px] font-mono flex flex-wrap gap-x-3",
      children: [e.jsxs("span", {
        children: [e.jsxs("span", {
          className: "text-green-400",
          children: ["L ", o.hitRateLong.toFixed(0), "%"]
        }), Number.isFinite(o.baseLong) && e.jsxs("span", {
          className: o.hitRateLong - o.baseLong >= 0 ? "text-green-400/70" :
            "text-red-400/70",
          title: `base rate ${o.baseLong.toFixed(0)}% over ${o.baseN} windows`,
          children: [" ", "(", o.hitRateLong - o.baseLong >= 0 ? "+" : "", (o
            .hitRateLong - o.baseLong).toFixed(0), "pp)"]
        })]
      }), e.jsxs("span", {
        children: [e.jsxs("span", {
          className: "text-red-400",
          children: ["S ", o.hitRateShort.toFixed(0), "%"]
        }), Number.isFinite(o.baseShort) && e.jsxs("span", {
          className: o.hitRateShort - o.baseShort >= 0 ? "text-red-400/70" :
            "text-green-400/70",
          title: `base rate ${o.baseShort.toFixed(0)}% over ${o.baseN} windows`,
          children: [" ", "(", o.hitRateShort - o.baseShort >= 0 ? "+" : "", (
            o.hitRateShort - o.baseShort).toFixed(0), "pp)"]
        })]
      })]
    }), e.jsxs("div", {
      className: "text-[9px] font-mono text-muted-foreground/60 flex flex-wrap gap-x-3",
      children: [e.jsxs("span", {
        children: ["p25 ", m(o.p25)]
      }), e.jsxs("span", {
        children: ["p75 ", m(o.p75)]
      })]
    })]
  })
}

function Rt({
  rows: i,
  running: o,
  progress: m,
  error: n,
  sort: h,
  onSort: v,
  onTickerClick: p,
  sourceCount: F,
  unitLabel: l = "ticker"
}) {
  const g = l === "pair" ? "pairs" : "tickers",
    f = a => Number.isFinite(a) ? `${a>=0?"+":""}${a.toFixed(1)}%` : "—",
    b = a => Number.isFinite(a) ? `${a>=0?"+":""}${a.toFixed(0)}pp` : "—",
    d = a => Number.isFinite(a) ? a > 0 ? "text-green-400" : a < 0 ? "text-red-400" :
    "text-foreground" : "text-muted-foreground/50",
    s = a => h.key === a ? h.dir === "desc" ? " ↓" : " ↑" : "";
  if (n) return e.jsxs("div", {
    className: "px-3 py-6 flex items-center gap-2 text-red-400 text-[11px] font-mono",
    children: [e.jsx(Xe, {
      className: "w-3.5 h-3.5"
    }), n]
  });
  if (!i) return e.jsxs("div", {
    className: "px-3 py-6 text-[11px] font-mono text-muted-foreground",
    children: ["Per-", l, " mode — click ", e.jsxs("span", {
      className: "text-amber-300",
      children: ["Run on ", F, " ", g]
    }), " to score each ", l, " individually."]
  });
  if (i.length === 0 && o) return e.jsxs("div", {
    className: "px-3 py-6 flex items-center gap-2 text-muted-foreground text-[11px] font-mono",
    children: [e.jsx(He, {
      className: "w-3.5 h-3.5 animate-spin"
    }), "Loading ", l, " series…"]
  });
  if (i.length === 0) return e.jsxs("div", {
    className: "px-3 py-6 text-[11px] font-mono text-muted-foreground",
    children: ["No ", g, " produced a result."]
  });
  const N = i.filter(a => a.nMatches > 0 && Number.isFinite(a.med3M)),
    j = N.filter(a => a.med3M > 0).length,
    Y = N.filter(a => a.med3M < 0).length,
    R = a => {
      const w = N.map(re => re[a]).filter(Number.isFinite).sort((re, H) => re - H);
      if (w.length === 0) return NaN;
      const D = Math.floor(w.length / 2);
      return w.length % 2 ? w[D] : (w[D - 1] + w[D]) / 2
    },
    y = {
      n: N.length,
      medOfMed1M: R("med1M"),
      medOfMed3M: R("med3M"),
      medOfMed6M: R("med6M"),
      medOfMed1Y: R("med1Y")
    },
    L = ({
      k: a,
      label: w,
      align: D = "right"
    }) => e.jsxs("th", {
      className: `${D==="left"?"text-left":"text-right"} font-normal pr-3 py-1 cursor-pointer select-none hover:text-foreground`,
      onClick: () => v(a),
      title: "Sort by this column",
      children: [w, s(a)]
    });
  return e.jsxs("div", {
    className: "flex flex-col",
    children: [e.jsxs("div", {
      className: "px-3 py-2 border-b border-border bg-card/40 flex flex-wrap items-baseline gap-x-4 gap-y-1",
      children: [e.jsxs("span", {
        className: "text-[10px] font-mono text-amber-300/90 uppercase tracking-wider",
        children: ["per-ticker · ", N.length, "/", i.length, " valid", o && e.jsxs(e
          .Fragment, {
            children: [" ", "· ", e.jsx(He, {
              className: "inline w-3 h-3 animate-spin align-[-2px]"
            }), " ", m.done, "/", m.total]
          })]
      }), e.jsxs("span", {
        className: "text-[10px] font-mono text-muted-foreground",
        children: ["long ", j, " · short ", Y, " (3M med direction)"]
      }), e.jsxs("span", {
        className: "text-[10px] font-mono text-muted-foreground",
        children: ["med-of-med:", e.jsxs("span", {
          className: `ml-1 ${d(y.medOfMed1M)}`,
          children: ["1M ", f(y.medOfMed1M)]
        }), e.jsxs("span", {
          className: `ml-2 ${d(y.medOfMed3M)}`,
          children: ["3M ", f(y.medOfMed3M)]
        }), e.jsxs("span", {
          className: `ml-2 ${d(y.medOfMed6M)}`,
          children: ["6M ", f(y.medOfMed6M)]
        }), e.jsxs("span", {
          className: `ml-2 ${d(y.medOfMed1Y)}`,
          children: ["1Y ", f(y.medOfMed1Y)]
        })]
      })]
    }), e.jsx("div", {
      className: "px-3 pb-2 overflow-x-auto max-h-[72vh]",
      children: e.jsxs("table", {
        className: "w-full text-[11px] font-mono",
        children: [e.jsx("thead", {
          className: "sticky top-0 bg-card text-muted-foreground/70 uppercase tracking-wider",
          children: e.jsxs("tr", {
            children: [e.jsx(L, {
              k: "ticker",
              label: "Ticker",
              align: "left"
            }), e.jsx(L, {
              k: "nMatches",
              label: "# matches"
            }), e.jsx(L, {
              k: "med1M",
              label: "Med 1M"
            }), e.jsx(L, {
              k: "med3M",
              label: "Med 3M"
            }), e.jsx(L, {
              k: "med6M",
              label: "Med 6M"
            }), e.jsx(L, {
              k: "med1Y",
              label: "Med 1Y"
            }), e.jsx(L, {
              k: "hLong3M",
              label: "Hit L 3M"
            }), e.jsx(L, {
              k: "hShort3M",
              label: "Hit S 3M"
            }), e.jsx("th", {
              className: "text-left font-normal pr-3 py-1",
              children: "Note"
            })]
          })
        }), e.jsx("tbody", {
          children: i.map(a => e.jsxs("tr", {
            className: "border-t border-border/40 hover:bg-accent/30",
            children: [e.jsx("td", {
              className: "pr-3 py-0.5",
              children: e.jsx("button", {
                className: "text-amber-300 hover:text-amber-200 hover:underline",
                onClick: () => p(a.ticker),
                title: `Drill in: load ${a.ticker} in single mode`,
                "data-testid": `ss-pt-row-${a.ticker}`,
                children: a.ticker
              })
            }), e.jsx("td", {
              className: "text-right text-muted-foreground pr-3 py-0.5",
              children: a.nMatches || "—"
            }), e.jsx("td", {
              className: `text-right pr-3 py-0.5 ${d(a.med1M)}`,
              children: f(a.med1M)
            }), e.jsx("td", {
              className: `text-right pr-3 py-0.5 ${d(a.med3M)}`,
              children: f(a.med3M)
            }), e.jsx("td", {
              className: `text-right pr-3 py-0.5 ${d(a.med6M)}`,
              children: f(a.med6M)
            }), e.jsx("td", {
              className: `text-right pr-3 py-0.5 ${d(a.med1Y)}`,
              children: f(a.med1Y)
            }), e.jsxs("td", {
              className: "text-right pr-3 py-0.5",
              children: [e.jsx("span", {
                  className: "text-green-400",
                  children: Number.isFinite(a.hLong3M) ?
                    `${a.hLong3M.toFixed(0)}%` : "—"
                }), Number.isFinite(a.baseLong3M) && Number
                .isFinite(a.hLong3M) && e.jsxs("span", {
                  className: a.hLong3M - a.baseLong3M >= 0 ?
                    "text-green-400/70" : "text-red-400/70",
                  title: `base rate ${a.baseLong3M.toFixed(0)}%`,
                  children: [" ", "(", b(a.hLong3M - a
                    .baseLong3M), ")"]
                })
              ]
            }), e.jsxs("td", {
              className: "text-right pr-3 py-0.5",
              children: [e.jsx("span", {
                  className: "text-red-400",
                  children: Number.isFinite(a.hShort3M) ?
                    `${a.hShort3M.toFixed(0)}%` : "—"
                }), Number.isFinite(a.baseShort3M) && Number
                .isFinite(a.hShort3M) && e.jsxs("span", {
                  className: a.hShort3M - a.baseShort3M >= 0 ?
                    "text-red-400/70" : "text-green-400/70",
                  title: `base rate ${a.baseShort3M.toFixed(0)}%`,
                  children: [" ", "(", b(a.hShort3M - a
                    .baseShort3M), ")"]
                })
              ]
            }), e.jsx("td", {
              className: "text-left text-muted-foreground/70 pr-3 py-0.5",
              children: a.note ?? ""
            })]
          }, a.ticker))
        })]
      })
    })]
  })
}

function Ot({
  consensus: i
}) {
  const o = s => Number.isFinite(s) ? `${s>=0?"+":""}${s.toFixed(1)}%` : "—",
    m = s => Number.isFinite(s) ? `${s>=0?"+":""}${s.toFixed(0)}pp` : "—",
    n = s => Number.isFinite(s) ? s > .25 ? "↑" : s < -.25 ? "↓" : "·" : "—",
    h = s => Number.isFinite(s) ? s > 0 ? "text-green-400" : s < 0 ? "text-red-400" :
    "text-foreground" : "text-muted-foreground/50",
    v = i.verdict,
    p = i.direction ?? "mixed",
    F = v.startsWith("Strong") && p === "long" ?
    "text-green-300 bg-green-500/10 border-green-500/40" : v.startsWith("Strong") && p === "short" ?
    "text-red-300 bg-red-500/10 border-red-500/40" : v.startsWith("Moderate") && p === "long" ?
    "text-green-300/90 bg-green-500/5 border-green-500/30" : v.startsWith("Moderate") && p ===
    "short" ? "text-red-300/90 bg-red-500/5 border-red-500/30" : v.startsWith("Weak") && p ===
    "long" ? "text-green-300/70 border-green-500/20" : v.startsWith("Weak") && p === "short" ?
    "text-red-300/70 border-red-500/20" : "text-muted-foreground border-border",
    l = i.cons,
    g = i.valid.length,
    f = i.rows.length,
    b = Number.isFinite(i.agreement) ? Math.round(i.agreement * 100) : NaN,
    d = p === "long" ? i.long3M ?? 0 : p === "short" ? i.short3M ?? 0 : Math.max(i.long3M ?? 0, i
      .short3M ?? 0);
  return e.jsxs("div", {
    className: "px-3 py-3 flex flex-col gap-3",
    children: [e.jsxs("div", {
      className: `px-3 py-2 border rounded ${F}`,
      children: [e.jsx("div", {
        className: "text-[10px] font-mono uppercase tracking-wider opacity-70",
        children: "Consensus verdict"
      }), e.jsx("div", {
        className: "text-lg font-mono font-semibold",
        children: v
      })]
    }), l && Number.isFinite(b) && e.jsxs("div", {
      className: "text-[11px] font-mono text-muted-foreground flex flex-wrap gap-x-4 gap-y-1",
      children: [e.jsxs("span", {
        children: [e.jsx("span", {
          className: "text-foreground",
          children: d
        }), " of", " ", e.jsx("span", {
          className: "text-foreground",
          children: g
        }), " presets agree ", p, " at 3M", g < f && e.jsxs("span", {
          className: "text-muted-foreground/60",
          children: [" (", f - g, " dropped)"]
        })]
      }), e.jsxs("span", {
        children: ["consensus 3M median", " ", e.jsx("span", {
          className: h(l.med3M),
          children: o(l.med3M)
        })]
      }), e.jsxs("span", {
        children: ["dispersion ±", Number.isFinite(l.sd3M) ? l.sd3M.toFixed(1) :
          "—", "pp"
        ]
      }), e.jsxs("span", {
        children: ["SNR", " ", e.jsx("span", {
          className: "text-foreground",
          children: Number.isFinite(i.snr) ? i.snr.toFixed(2) : "—"
        })]
      }), e.jsxs("span", {
        children: ["agreement ", Number.isFinite(b) ? `${b}%` : "—"]
      })]
    }), e.jsx("div", {
      className: "overflow-x-auto",
      children: e.jsxs("table", {
        className: "w-full text-[10px] font-mono",
        children: [e.jsx("thead", {
          className: "bg-card",
          children: e.jsxs("tr", {
            className: "text-muted-foreground/70 uppercase tracking-wider",
            children: [e.jsx("th", {
              className: "text-left font-normal pr-3 py-1",
              children: "Preset"
            }), e.jsx("th", {
              className: "text-right font-normal pr-3 py-1",
              children: "N"
            }), e.jsx("th", {
              className: "text-right font-normal pr-3 py-1",
              children: "med 1M"
            }), e.jsx("th", {
              className: "text-right font-normal pr-3 py-1",
              children: "med 3M"
            }), e.jsx("th", {
              className: "text-right font-normal pr-3 py-1",
              children: "med 6M"
            }), e.jsx("th", {
              className: "text-right font-normal pr-3 py-1",
              children: "med 1Y"
            }), e.jsx("th", {
              className: "text-right font-normal pr-3 py-1",
              children: "L hit% (Δ)"
            }), e.jsx("th", {
              className: "text-right font-normal pr-3 py-1",
              children: "S hit% (Δ)"
            }), e.jsx("th", {
              className: "text-center font-normal py-1",
              children: "dir 3M"
            })]
          })
        }), e.jsxs("tbody", {
          children: [i.rows.map(s => e.jsxs("tr", {
            className: "border-t border-border/40",
            children: [e.jsx("td", {
              className: "text-foreground pr-3 py-0.5",
              children: s.preset
            }), e.jsx("td", {
              className: "text-right text-muted-foreground pr-3 py-0.5",
              children: s.valid ? s.n : "—"
            }), e.jsx("td", {
              className: `text-right pr-3 py-0.5 ${h(s.med1M)}`,
              children: o(s.med1M)
            }), e.jsx("td", {
              className: `text-right pr-3 py-0.5 ${h(s.med3M)}`,
              children: o(s.med3M)
            }), e.jsx("td", {
              className: `text-right pr-3 py-0.5 ${h(s.med6M)}`,
              children: o(s.med6M)
            }), e.jsx("td", {
              className: `text-right pr-3 py-0.5 ${h(s.med1Y)}`,
              children: o(s.med1Y)
            }), e.jsx("td", {
              className: "text-right pr-3 py-0.5",
              children: s.valid && Number.isFinite(s.hLong3M) ? e
                .jsxs(e.Fragment, {
                  children: [e.jsxs("span", {
                      className: "text-green-400",
                      children: [s.hLong3M.toFixed(0), "%"]
                    }), Number.isFinite(s.baseLong3M) && e
                    .jsxs("span", {
                      className: s.hLong3M - s.baseLong3M >=
                        0 ? "text-green-400/70" :
                        "text-red-400/70",
                      children: [" ", "(", m(s.hLong3M - s
                        .baseLong3M), ")"]
                    })
                  ]
                }) : e.jsx("span", {
                  className: "text-muted-foreground/50",
                  children: "—"
                })
            }), e.jsx("td", {
              className: "text-right pr-3 py-0.5",
              children: s.valid && Number.isFinite(s.hShort3M) ? e
                .jsxs(e.Fragment, {
                  children: [e.jsxs("span", {
                      className: "text-red-400",
                      children: [s.hShort3M.toFixed(0), "%"]
                    }), Number.isFinite(s.baseShort3M) && e
                    .jsxs("span", {
                      className: s.hShort3M - s
                        .baseShort3M >= 0 ?
                        "text-red-400/70" :
                        "text-green-400/70",
                      children: [" ", "(", m(s.hShort3M - s
                        .baseShort3M), ")"]
                    })
                  ]
                }) : e.jsx("span", {
                  className: "text-muted-foreground/50",
                  children: "—"
                })
            }), e.jsx("td", {
              className: `text-center py-0.5 ${h(s.med3M)}`,
              children: n(s.med3M)
            })]
          }, s.preset)), l && e.jsxs("tr", {
            className: "border-t-2 border-amber-500/40 bg-amber-500/5",
            children: [e.jsx("td", {
              className: "text-amber-300 pr-3 py-1 font-semibold",
              children: "Consensus (√N-weighted)"
            }), e.jsx("td", {
              className: "text-right text-muted-foreground pr-3 py-1",
              children: i.valid.reduce((s, N) => s + (N.n || 0), 0)
            }), e.jsx("td", {
              className: `text-right pr-3 py-1 font-semibold ${h(l.med1M)}`,
              children: o(l.med1M)
            }), e.jsx("td", {
              className: `text-right pr-3 py-1 font-semibold ${h(l.med3M)}`,
              children: o(l.med3M)
            }), e.jsx("td", {
              className: `text-right pr-3 py-1 font-semibold ${h(l.med6M)}`,
              children: o(l.med6M)
            }), e.jsx("td", {
              className: `text-right pr-3 py-1 font-semibold ${h(l.med1Y)}`,
              children: o(l.med1Y)
            }), e.jsxs("td", {
              className: "text-right pr-3 py-1 text-muted-foreground/70",
              colSpan: 2,
              children: ["±sd 3M: ", Number.isFinite(l.sd3M) ? l
                .sd3M.toFixed(1) : "—", "pp"
              ]
            }), e.jsx("td", {
              className: `text-center py-1 ${h(l.med3M)}`,
              children: n(l.med3M)
            })]
          })]
        })]
      })
    }), e.jsx("div", {
      className: "text-[10px] font-mono text-muted-foreground/60 leading-relaxed",
      children: 'Each row shows a different feature subspace (preset). Robust setups agree across presets; fragile setups only "work" under one specific lens. Consensus median is weighted by √N so thinly-matched presets contribute less. SNR = |consensus 3M| ÷ dispersion. Strong calls require ≥80% directional agreement AND SNR ≥ 1.'
    })]
  })
}
export {
  Kt as
  default
};