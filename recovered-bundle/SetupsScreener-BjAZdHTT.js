import {
  aj as Ve,
  bP as Ue,
  r as x,
  af as qe,
  j as t,
  ah as He,
  a4 as Be,
  di as Le,
  X as Ke,
  c7 as Ge,
  cJ as Ce,
  bm as Je,
  bn as Xe,
  e6 as Ze
} from "./index-CsG73Aq_.js";
import {
  u as Qe
} from "./globalUniverse-DuqPcp2u.js";
import {
  D as et,
  F as X,
  A as ge,
  a as tt,
  c as st,
  T as we,
  b as rt,
  d as nt,
  e as ot,
  r as at
} from "./similarSetupsAlgorithms-CYRAhj-A.js";
import {
  P as it
} from "./play-D7mVvggU.js";
import "./oscillatorMath-DdsdJyTp.js";
import "./harsi-NMVnsDcX.js";
import "./tva-DaeKqI67.js";

function Fe(n) {
  const s = n.filter(Number.isFinite);
  if (s.length < 30) return n.map(() => NaN);
  const l = s.reduce((o, i) => o + i, 0) / s.length,
    u = Math.sqrt(s.reduce((o, i) => o + (i - l) ** 2, 0) / s.length);
  return u > 0 ? n.map(o => Number.isFinite(o) ? (o - l) / u : NaN) : n.map(() => NaN)
}

function de(n, s, l) {
  const u = [];
  for (let h = 0; h < n.length; h++)
    if (Number.isFinite(n[h])) {
      const N = l ? l[h] ?? 0 : 1;
      N > 0 && u.push({
        v: n[h],
        w: N
      })
    } if (u.length === 0) return null;
  u.sort((h, N) => h.v - N.v);
  const o = u.reduce((h, N) => h + N.w, 0),
    i = h => {
      const N = h * o;
      let C = 0;
      for (let F = 0; F < u.length; F++)
        if (C += u[F].w, C >= N) return u[F].v;
      return u[u.length - 1].v
    },
    a = u.reduce((h, N) => h + N.v * N.w, 0) / o,
    g = u.filter(h => h.v > 0).reduce((h, N) => h + N.w, 0),
    c = u.filter(h => h.v < 0).reduce((h, N) => h + N.w, 0),
    b = s.filter(Number.isFinite),
    w = b.length > 0 ? b.filter(h => h > 0).length / b.length * 100 : NaN,
    z = b.length > 0 ? b.filter(h => h < 0).length / b.length * 100 : NaN;
  return {
    median: i(.5),
    mean: a,
    p25: i(.25),
    p75: i(.75),
    hitLong: g / o * 100,
    hitShort: c / o * 100,
    baseLong: w,
    baseShort: z,
    n: u.length,
    baseN: b.length
  }
}

function ct(n, s, l) {
  const u = new Map;
  for (let a = 0; a < s.length; a++) {
    const g = l[a];
    Number.isFinite(g) && g > 0 && u.set(s[a], g)
  }
  const o = new Array(n.length).fill(NaN);
  let i = NaN;
  for (let a = 0; a < n.length; a++) {
    const g = u.get(n[a]);
    typeof g == "number" ? (i = g, o[a] = g) : Number.isFinite(i) && (o[a] = i)
  }
  return o
}
async function $e(n) {
  let s = [],
    l = [],
    u = [],
    o = [],
    i = [],
    a = [],
    g = !1;
  try {
    const c = await Ce(n);
    c.dates.length && (s = c.dates, l = c.closes, u = c.highs, o = c.lows, i = c.opens, a = c
      .volumes, g = a.some(b => Number.isFinite(b) && b > 0))
  } catch {
    const c = await Ze(n);
    s = c.map(b => b.time), l = c.map(b => b.close), u = l.slice(), o = l.slice(), i = l.slice(),
      a = new Array(l.length).fill(0)
  }
  return {
    times: s,
    closes: l,
    highs: u,
    lows: o,
    opens: i,
    volumes: a,
    hasVolume: g
  }
}
async function Ye(n) {
  const s = {
    ticker: n.ticker,
    status: "pending"
  };
  try {
    const l = n.preFetched ?? await $e(n.ticker),
      {
        times: u,
        closes: o,
        highs: i,
        lows: a,
        opens: g,
        volumes: c,
        hasVolume: b
      } = l;
    if (o.length < 252) return s.status = "skipped", s.errorMsg = `only ${o.length} bars`, s;
    const w = ct(u, n.benchDates, n.benchClosesArr),
      z = w.some(d => Number.isFinite(d)),
      h = d => {
        const B = st[d] ?? we[d];
        return !!(!B || B.requiresVolume && !b || B.requiresBench && !z)
      },
      N = rt.filter(d => n.enabled.has(d) && !h(d)),
      C = Object.keys(we).filter(d => n.enabled.has(d));
    if (N.length + C.length === 0) return s.status = "skipped", s.errorMsg = "no valid features",
      s;
    const G = nt(N, {
        closes: o,
        highs: i,
        lows: a,
        opens: g,
        volumes: c,
        benchCloses: z ? w : void 0
      }),
      P = ot(u),
      $ = {};
    for (const d of N) $[d] = Fe(G[d] ?? new Array(o.length).fill(NaN));
    for (const d of C) $[d] = Fe(P[d] ?? new Array(o.length).fill(NaN));
    const r = [...N, ...C],
      y = o.length - 1,
      Y = r.map(d => $[d][y]);
    if (Y.some(d => !Number.isFinite(d))) return s.status = "skipped", s.errorMsg =
      "today z has NaN", s;
    const H = Math.max(0, y - n.exclusion),
      k = [];
    for (let d = 0; d <= H; d++) {
      const B = r.map(f => $[f][d]);
      if (B.some(f => !Number.isFinite(f))) continue;
      const p = o[d];
      if (!(p > 0)) continue;
      const Q = f => {
        const se = d + f;
        return se >= o.length || !(o[se] > 0) ? NaN : (o[se] / p - 1) * 100
      };
      k.push({
        date: u[d],
        closeIdx: d,
        zVec: B,
        fwd1M: Q(21),
        fwd3M: Q(63),
        fwd6M: Q(126),
        fwd1Y: Q(252)
      })
    }
    if (k.length === 0) return s.status = "skipped", s.errorMsg = "no candidates", s;
    const O = {
        bars: k,
        todayZ: Y,
        n: n.algoParams.n,
        closes: o,
        lastIdx: y,
        dtwWindow: n.algoParams.dtwWindow,
        kernelH: n.algoParams.kernelH > 0 ? n.algoParams.kernelH : NaN,
        regimeK: n.algoParams.regimeK
      },
      I = at(n.algo, O);
    if (I.matches.length === 0) return s.status = "skipped", s.errorMsg = "no matches", s;
    const Z = I.matches.map(d => d.weight),
      A = de(I.matches.map(d => d.fwd1M), k.map(d => d.fwd1M), Z),
      E = de(I.matches.map(d => d.fwd3M), k.map(d => d.fwd3M), Z),
      T = de(I.matches.map(d => d.fwd6M), k.map(d => d.fwd6M), Z),
      D = de(I.matches.map(d => d.fwd1Y), k.map(d => d.fwd1Y), Z);
    return s.status = "ok", s.matchN = I.matches.length, s.baseN = k.length, A && (s.median1M = A
      .median, s.mean1M = A.mean, s.p25_1M = A.p25, s.p75_1M = A.p75, s.hitLong1M = A.hitLong, s
      .hitShort1M = A.hitShort, s.baseLong1M = A.baseLong, s.baseShort1M = A.baseShort), E && (s
      .median3M = E.median, s.mean3M = E.mean, s.p25_3M = E.p25, s.p75_3M = E.p75, s.hitLong3M =
      E.hitLong, s.hitShort3M = E.hitShort, s.baseLong3M = E.baseLong, s.baseShort3M = E
      .baseShort), T && (s.median6M = T.median, s.mean6M = T.mean, s.hitLong6M = T.hitLong, s
      .hitShort6M = T.hitShort, s.baseLong6M = T.baseLong, s.baseShort6M = T.baseShort), D && (s
      .median1Y = D.median, s.mean1Y = D.mean, s.hitLong1Y = D.hitLong, s.hitShort1Y = D
      .hitShort, s.baseLong1Y = D.baseLong, s.baseShort1Y = D.baseShort), s
  } catch (l) {
    return s.status = "error", s.errorMsg = l?.message ? String(l.message) : "error", s
  }
}

function ae(n, s) {
  return {
    "1M": {
      med: n.median1M,
      mean: n.mean1M,
      p25: n.p25_1M,
      p75: n.p75_1M,
      hL: n.hitLong1M,
      hS: n.hitShort1M,
      bL: n.baseLong1M,
      bS: n.baseShort1M
    },
    "3M": {
      med: n.median3M,
      mean: n.mean3M,
      p25: n.p25_3M,
      p75: n.p75_3M,
      hL: n.hitLong3M,
      hS: n.hitShort3M,
      bL: n.baseLong3M,
      bS: n.baseShort3M
    },
    "6M": {
      med: n.median6M,
      mean: n.mean6M,
      p25: void 0,
      p75: void 0,
      hL: n.hitLong6M,
      hS: n.hitShort6M,
      bL: n.baseLong6M,
      bS: n.baseShort6M
    },
    "1Y": {
      med: n.median1Y,
      mean: n.mean1Y,
      p25: void 0,
      p75: void 0,
      hL: n.hitLong1Y,
      hS: n.hitShort1Y,
      bL: n.baseLong1Y,
      bS: n.baseShort1Y
    }
  } [s]
}

function lt(n, s) {
  const l = ae(n, s);
  if (!Number.isFinite(l.med ?? NaN) || !Number.isFinite(l.hL ?? NaN) || !n.matchN) return NaN;
  const u = l.hL - (l.bL ?? 50);
  return l.med * Math.sqrt(n.matchN) * (u / 50)
}

function dt(n, s) {
  const l = ae(n, s);
  if (!Number.isFinite(l.med ?? NaN)) return NaN;
  const u = n.matchN ?? 0;
  if (u <= 0) return NaN;
  const o = n.consensus_agreement ?? 0,
    i = n.consensus_snr,
    a = Number.isFinite(i) ? Math.min(2, Math.max(0, i)) : 1;
  return l.med * Math.sqrt(u) * o * a
}
async function mt(n) {
  const s = {
    ticker: n.ticker,
    status: "pending"
  };
  try {
    const l = await $e(n.ticker);
    if (l.closes.length < 252) return s.status = "skipped", s.errorMsg =
      `only ${l.closes.length} bars`, s;
    const u = Object.keys(n.presets);
    if (u.length === 0) return s.status = "skipped", s.errorMsg = "no presets selected", s;
    const o = [];
    for (const r of u) {
      const y = n.presets[r],
        Y = await Ye({
          ticker: n.ticker,
          benchDates: n.benchDates,
          benchClosesArr: n.benchClosesArr,
          enabled: new Set(y),
          algo: n.algo,
          algoParams: n.algoParams,
          exclusion: n.exclusion,
          preFetched: l
        });
      o.push({
        preset: r,
        r: Y
      })
    }
    const i = o.filter(r => r.r.status === "ok" && Number.isFinite(r.r.median3M ?? NaN));
    if (s.consensus_totalPresets = o.length, s.consensus_validPresets = i.length, s
      .consensus_perPreset = o.map(r => ({
        preset: r.preset,
        n: r.r.matchN ?? 0,
        med1M: r.r.median1M ?? NaN,
        med3M: r.r.median3M ?? NaN,
        med6M: r.r.median6M ?? NaN,
        med1Y: r.r.median1Y ?? NaN
      })), i.length === 0) return s.status = "skipped", s.errorMsg = "no valid presets", s;
    const a = (r, y) => {
        let Y = 0,
          H = 0;
        for (let k = 0; k < r.length; k++) {
          if (!Number.isFinite(r[k])) continue;
          const O = Math.sqrt(y[k] || 0);
          Y += O, H += r[k] * O
        }
        return Y > 0 ? H / Y : NaN
      },
      g = r => {
        const y = r.filter(Number.isFinite);
        if (y.length < 2) return NaN;
        const Y = y.reduce((k, O) => k + O, 0) / y.length,
          H = y.reduce((k, O) => k + (O - Y) ** 2, 0) / (y.length - 1);
        return Math.sqrt(H)
      },
      c = i.map(r => r.r.matchN ?? 0),
      b = i.map(r => r.r.median1M ?? NaN),
      w = i.map(r => r.r.median3M ?? NaN),
      z = i.map(r => r.r.median6M ?? NaN),
      h = i.map(r => r.r.median1Y ?? NaN);
    s.median1M = a(b, c), s.median3M = a(w, c), s.median6M = a(z, c), s.median1Y = a(h, c), s
      .consensus_sd1M = g(b), s.consensus_sd3M = g(w), s.consensus_sd6M = g(z), s.consensus_sd1Y =
      g(h), s.mean1M = a(i.map(r => r.r.mean1M ?? NaN), c), s.mean3M = a(i.map(r => r.r.mean3M ??
        NaN), c), s.mean6M = a(i.map(r => r.r.mean6M ?? NaN), c), s.mean1Y = a(i.map(r => r.r
        .mean1Y ?? NaN), c), s.hitLong3M = a(i.map(r => r.r.hitLong3M ?? NaN), c), s.hitShort3M =
      a(i.map(r => r.r.hitShort3M ?? NaN), c), s.baseLong3M = a(i.map(r => r.r.baseLong3M ?? NaN),
        c), s.baseShort3M = a(i.map(r => r.r.baseShort3M ?? NaN), c), s.hitLong1M = a(i.map(r => r
        .r.hitLong1M ?? NaN), c), s.hitShort1M = a(i.map(r => r.r.hitShort1M ?? NaN), c), s
      .baseLong1M = a(i.map(r => r.r.baseLong1M ?? NaN), c), s.baseShort1M = a(i.map(r => r.r
        .baseShort1M ?? NaN), c), s.hitLong6M = a(i.map(r => r.r.hitLong6M ?? NaN), c), s
      .hitShort6M = a(i.map(r => r.r.hitShort6M ?? NaN), c), s.baseLong6M = a(i.map(r => r.r
        .baseLong6M ?? NaN), c), s.baseShort6M = a(i.map(r => r.r.baseShort6M ?? NaN), c), s
      .hitLong1Y = a(i.map(r => r.r.hitLong1Y ?? NaN), c), s.hitShort1Y = a(i.map(r => r.r
        .hitShort1Y ?? NaN), c), s.baseLong1Y = a(i.map(r => r.r.baseLong1Y ?? NaN), c), s
      .baseShort1Y = a(i.map(r => r.r.baseShort1Y ?? NaN), c), s.matchN = i.reduce((r, y) => r + (
        y.r.matchN ?? 0), 0), s.baseN = i.reduce((r, y) => r + (y.r.baseN ?? 0), 0);
    const N = w.filter(r => Number.isFinite(r) && r > 0).length,
      C = w.filter(r => Number.isFinite(r) && r < 0).length,
      F = Math.max(N, C) / w.length,
      G = N > C ? "long" : C > N ? "short" : "mixed";
    s.consensus_long3M = N, s.consensus_short3M = C, s.consensus_agreement = F, s
      .consensus_direction = G;
    const P = Number.isFinite(s.consensus_sd3M) && s.consensus_sd3M > 0 ? Math.abs(s.median3M) / s
      .consensus_sd3M : NaN;
    s.consensus_snr = P;
    let $ = "Mixed — no clear direction";
    if (G !== "mixed") {
      const r = G === "long" ? "long" : "short";
      F >= .8 && (P >= 1 || !Number.isFinite(P)) ? $ = `Strong ${r}` : F >= .66 ? $ =
        `Moderate ${r}` : F >= .55 ? $ = `Weak ${r}` : $ = `Mixed — ${r} leaning`
    }
    return s.consensus_verdict = $, s.status = "ok", s
  } catch (l) {
    return s.status = "error", s.errorMsg = l?.message ? String(l.message) : "error", s
  }
}

function ft() {
  const {
    baskets: n
  } = Ve(), [, s] = Ue(), [l, u] = x.useState([]);
  x.useEffect(() => {
    let e = !0;
    return qe().then(m => {
      e && u(m)
    }).catch(() => {}), () => {
      e = !1
    }
  }, []);
  const [o, i] = x.useState("all"), [a, g] = x.useState("sector"), [c, b] = x.useState(""), [w, z] =
    x.useState(""), {
      metas: h,
      loading: N,
      error: C
    } = Qe(), [F, G] = x.useState("sector"), [P, $] = x.useState(""), [r, y] = x.useState("knn"), [
      Y, H
    ] = x.useState(60), [k, O] = x.useState(0), [I, Z] = x.useState(5), [A, E] = x.useState(20), [T,
      D
    ] = x.useState(252), [d, B] = x.useState(() => new Set(et)), [p, Q] = x.useState("3M"), [f,
    se] = x.useState(!1), [ee, me] = x.useState(() => new Set(Object.keys(X).filter(e => e !==
      "Classic (6)"))), [re, ue] = x.useState(!1), [ne, be] = x.useState({
      done: 0,
      total: 0
    }), [V, he] = x.useState([]), [Ne, pe] = x.useState(null), ie = x.useRef(!1), [ce, Ae] = x
    .useState("composite"), [oe, fe] = x.useState("desc"), te = x.useMemo(() => {
      const e = new Set;
      for (const m of l) {
        const v = m[a];
        v && e.add(String(v))
      }
      return Array.from(e).sort()
    }, [l, a]), Pe = x.useMemo(() => {
      const e = new Set;
      for (const m of h) {
        const v = m[F];
        v && e.add(String(v))
      }
      return Array.from(e).sort()
    }, [h, F]);
  x.useEffect(() => {
    o === "classification" && te.length && !te.includes(c) && b(te[0])
  }, [o, te, c]);
  const U = x.useMemo(() => {
      if (o === "global") return h.length === 0 ? [] : P ? h.filter(e => String(e[F] ?? "") === P)
        .map(e => e.ticker) : h.map(e => e.ticker);
      if (l.length === 0) return [];
      if (o === "all") return l.map(e => e.ticker);
      if (o === "classification" && c) return l.filter(e => String(e[a] ?? "") === c).map(e => e
        .ticker);
      if (o === "basket" && w) {
        const e = n.find(m => m.id === w);
        return e ? e.tickers : []
      }
      return []
    }, [l, o, a, c, w, n, h, F, P]),
    Ee = async () => {
        if (U.length === 0) {
          pe("Universe is empty");
          return
        }
        pe(null), ue(!0), ie.current = !1, be({
          done: 0,
          total: U.length
        }), he(U.map(S => ({
          ticker: S,
          status: "pending"
        })));
        let e = [],
          m = [];
        try {
          const S = await Ce("SPY");
          e = S.dates, m = S.closes
        } catch {}
        const v = {
            n: A,
            dtwWindow: Y,
            kernelH: k,
            regimeK: I
          },
          M = {};
        if (f) {
          for (const S of Object.keys(X)) ee.has(S) && (M[S] = X[S]);
          if (Object.keys(M).length === 0) {
            pe("Consensus mode requires at least one selected preset"), ue(!1);
            return
          }
        }
        const L = f ? 4 : 6,
          R = [...U];
        let j = 0;
        for (; R.length > 0 && !ie.current;) {
          const S = R.splice(0, L);
          he(q => q.map(W => S.includes(W.ticker) ? {
            ...W,
            status: "running"
          } : W));
          const K = await Promise.all(S.map(q => f ? mt({
            ticker: q,
            benchDates: e,
            benchClosesArr: m,
            algo: r,
            algoParams: v,
            exclusion: T,
            presets: M
          }) : Ye({
            ticker: q,
            benchDates: e,
            benchClosesArr: m,
            enabled: d,
            algo: r,
            algoParams: v,
            exclusion: T
          })));
          j += K.length, be({
            done: j,
            total: U.length
          }), he(q => {
            const W = q.slice();
            for (const ve of K) {
              const ye = W.findIndex(De => De.ticker === ve.ticker);
              ye >= 0 && (W[ye] = ve)
            }
            return W
          })
        }
        ue(!1), ie.current = !1
      }, Te = () => {
        ie.current = !0
      }, J = x.useMemo(() => V.map(e => e.status === "ok" ? {
        ...e,
        composite: f ? dt(e, p) : lt(e, p)
      } : e), [V, p, f]), Re = x.useMemo(() => {
        const e = J.filter(M => M.status === "ok"),
          m = J.filter(M => M.status !== "ok"),
          v = M => {
            const L = ae(M, p);
            switch (ce) {
              case "ticker":
                return M.ticker;
              case "median":
                return L.med ?? NaN;
              case "mean":
                return L.mean ?? NaN;
              case "p25":
                return L.p25 ?? NaN;
              case "p75":
                return L.p75 ?? NaN;
              case "hitLong":
                return L.hL ?? NaN;
              case "hitLongEdge":
                return (L.hL ?? NaN) - (L.bL ?? NaN);
              case "hitShort":
                return L.hS ?? NaN;
              case "hitShortEdge":
                return (L.hS ?? NaN) - (L.bS ?? NaN);
              case "n":
                return M.matchN ?? NaN;
              case "composite":
                return M.composite ?? NaN;
              case "agreement":
                return M.consensus_agreement ?? NaN;
              case "dispersion":
                return (p === "1M" ? M.consensus_sd1M : p === "3M" ? M.consensus_sd3M : p ===
                  "6M" ? M.consensus_sd6M : M.consensus_sd1Y) ?? NaN;
              case "snr":
                return M.consensus_snr ?? NaN;
              case "validPresets":
                return M.consensus_validPresets ?? NaN
            }
          };
        return e.sort((M, L) => {
          const R = v(M),
            j = v(L);
          if (typeof R == "string" && typeof j == "string") return oe === "asc" ? R
            .localeCompare(j) : j.localeCompare(R);
          const S = typeof R == "number" ? R : NaN,
            K = typeof j == "number" ? j : NaN,
            q = !Number.isFinite(S),
            W = !Number.isFinite(K);
          return q && W ? 0 : q ? 1 : W ? -1 : oe === "asc" ? S - K : K - S
        }), [...e, ...m]
      }, [J, ce, oe, p]), Me = x.useMemo(() => [...J].filter(e => e.status === "ok" && Number
        .isFinite(e.composite ?? NaN)).sort((e, m) => (m.composite ?? -1 / 0) - (e.composite ?? -
        1 / 0)).slice(0, 10), [J]), je = x.useMemo(() => [...J].filter(e => e.status === "ok" &&
        Number.isFinite(e.composite ?? NaN)).sort((e, m) => (e.composite ?? 1 / 0) - (m
        .composite ?? 1 / 0)).slice(0, 10), [J]), Oe = e => {
        ce === e ? fe(oe === "asc" ? "desc" : "asc") : (Ae(e), fe(e === "ticker" ? "asc" : "desc"))
      }, le = e => Number.isFinite(e ?? NaN) ? `${e>=0?"+":""}${e.toFixed(1)}%` : "—", Se = e =>
      Number.isFinite(e ?? NaN) ? `${e>=0?"+":""}${e.toFixed(0)}pp` : "—", ke = e => Number
      .isFinite(e ?? NaN) ? e.toFixed(2) : "—", Ie = e => {
        if (e === "__none__") return;
        const m = X[e];
        m && B(new Set(m))
      }, We = e => ce === e ? oe === "asc" ? t.jsx(Je, {
        className: "inline w-3 h-3 ml-0.5"
      }) : t.jsx(Xe, {
        className: "inline w-3 h-3 ml-0.5"
      }) : null, xe = e => {
        s(`/similar-setups?ticker=${encodeURIComponent(e)}`)
      }, ze = o === "all" ? `All (${l.length})` : o === "global" ? N ? "Global (loading…)" :
      `Global · ${P||"all"} (${U.length})` : o === "classification" ? `${a}=${c} (${U.length})` :
      o === "basket" ? (() => {
        const e = n.find(m => m.id === w);
        return e ? `${e.name} (${e.tickers.length})` : "(pick basket)"
      })() : "—", _ = (e, m, v = "right") => t.jsxs("th", {
        onClick: () => Oe(e),
        className: `font-normal py-1 px-2 cursor-pointer hover:text-foreground select-none text-${v}`,
        children: [m, We(e)]
      });
  return t.jsxs("div", {
    className: "flex flex-col h-full bg-background overflow-auto",
    "data-testid": "setups-screener-page",
    children: [t.jsxs("div", {
      className: "px-3 py-2 border-b border-border flex items-center gap-3 flex-wrap bg-card",
      children: [t.jsx(He, {
        className: "w-4 h-4 text-amber-400"
      }), t.jsxs("h1", {
        className: "text-sm font-mono font-semibold text-foreground",
        children: ["Setups Screener · ", t.jsx("span", {
          className: "text-amber-300",
          children: ze
        })]
      }), re && t.jsxs("span", {
        className: "text-[10px] font-mono text-muted-foreground flex items-center gap-1",
        children: [t.jsx(Be, {
          className: "w-3 h-3 animate-spin"
        }), ne.done, "/", ne.total]
      }), !re && V.length > 0 && t.jsxs("span", {
        className: "text-[10px] font-mono text-muted-foreground",
        children: [V.filter(e => e.status === "ok").length, " ok ·", " ", V.filter(
          e => e.status === "skipped").length, " skipped ·", " ", V.filter(e =>
          e.status === "error").length, " error"]
      }), t.jsxs("span", {
        className: "text-[10px] font-mono text-muted-foreground/60",
        children: ["horizon: ", t.jsx("span", {
          className: "text-foreground",
          children: p
        }), " ·", " ", ge[r].label, " ·", " ", f ? t.jsxs("span", {
          className: "text-amber-300",
          children: ["consensus (", ee.size, " presets)"]
        }) : t.jsxs(t.Fragment, {
          children: ["features ", d.size]
        })]
      })]
    }), t.jsxs("div", {
      className: "px-3 py-2 border-b border-border bg-card/60 flex items-center gap-3 flex-wrap",
      children: [t.jsx("span", {
        className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
        children: "Universe"
      }), t.jsx("div", {
        className: "flex rounded border border-border overflow-hidden",
        children: ["all", "classification", "basket", "global"].map(e => t.jsx(
          "button", {
            onClick: () => i(e),
            className: `text-[11px] font-mono px-2.5 py-1 transition-colors ${o===e?"bg-amber-500/15 text-amber-300 border-r border-border last:border-r-0":"bg-card text-muted-foreground hover:text-foreground hover:bg-accent border-r border-border last:border-r-0"}`,
            "data-testid": `ss-univ-${e}`,
            title: e === "global" ?
              "FactSet/RBICS GLOBAL universe (~9,000 tickers, Yahoo-priced)" :
              void 0,
            children: e
          }, e))
      }), o === "classification" && t.jsxs(t.Fragment, {
        children: [t.jsx("select", {
          value: a,
          onChange: e => g(e.target.value),
          className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
          children: Le.map(e => t.jsx("option", {
            value: e,
            children: e
          }, e))
        }), t.jsxs("select", {
          value: c,
          onChange: e => b(e.target.value),
          className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground max-w-[200px]",
          children: [te.length === 0 && t.jsx("option", {
            value: "",
            children: "(load…)"
          }), te.map(e => t.jsx("option", {
            value: e,
            children: e
          }, e))]
        })]
      }), o === "basket" && t.jsxs("select", {
        value: w,
        onChange: e => z(e.target.value),
        className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground max-w-[260px]",
        children: [t.jsx("option", {
          value: "",
          children: "(pick basket)"
        }), n.map(e => t.jsxs("option", {
          value: e.id,
          children: [e.name, " · ", e.tickers.length]
        }, e.id))]
      }), o === "global" && t.jsxs(t.Fragment, {
        children: [t.jsx("select", {
          value: F,
          onChange: e => {
            G(e.target.value), $("")
          },
          className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
          disabled: N,
          children: Le.map(e => t.jsx("option", {
            value: e,
            children: e
          }, e))
        }), t.jsxs("select", {
          value: P,
          onChange: e => $(e.target.value),
          className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground max-w-[220px]",
          disabled: N,
          children: [t.jsxs("option", {
            value: "",
            children: ["(all ", N ? "" : h.length.toLocaleString(), ")"]
          }), Pe.map(e => t.jsx("option", {
            value: e,
            children: e
          }, e))]
        }), C && t.jsx("span", {
          className: "text-[10px] text-rose-400",
          title: C,
          children: "load error"
        })]
      }), t.jsx("span", {
        className: "w-px h-5 bg-border"
      }), t.jsx("label", {
        className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
        children: "Algo"
      }), t.jsx("select", {
        value: r,
        onChange: e => y(e.target.value),
        className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
        title: ge[r].tooltip,
        children: tt.map(e => t.jsx("option", {
          value: e,
          children: ge[e].label
        }, e))
      }), t.jsxs("button", {
        onClick: () => se(e => !e),
        className: `text-[10px] font-mono px-2 py-0.5 border rounded transition-colors ${f?"border-amber-500 bg-amber-500/15 text-amber-300":"border-border text-muted-foreground hover:text-foreground hover:bg-accent"}`,
        title: "Run all selected presets per ticker and aggregate. Surfaces robust signals (agreement across feature subspaces).",
        children: ["Consensus ", f ? "ON" : "OFF"]
      }), r === "dtw" && t.jsxs(t.Fragment, {
        children: [t.jsx("label", {
          className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "W"
        }), t.jsx("select", {
          value: Y,
          onChange: e => H(Number(e.target.value)),
          className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
          children: [20, 30, 40, 60, 90, 120, 180, 252].map(e => t.jsxs(
            "option", {
              value: e,
              children: [e, "b"]
            }, e))
        })]
      }), r === "kernel" && t.jsxs(t.Fragment, {
        children: [t.jsx("label", {
          className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "h"
        }), t.jsxs("select", {
          value: k,
          onChange: e => O(Number(e.target.value)),
          className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
          children: [t.jsx("option", {
            value: 0,
            children: "auto"
          }), [.5, 1, 1.5, 2, 3].map(e => t.jsx("option", {
            value: e,
            children: e
          }, e))]
        })]
      }), r === "regime" && t.jsxs(t.Fragment, {
        children: [t.jsx("label", {
          className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
          children: "K"
        }), t.jsx("select", {
          value: I,
          onChange: e => Z(Number(e.target.value)),
          className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
          children: [2, 3, 4, 5, 6, 8, 10, 12].map(e => t.jsx("option", {
            value: e,
            children: e
          }, e))
        })]
      }), t.jsx("label", {
        className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
        children: "N"
      }), t.jsx("select", {
        value: A,
        onChange: e => E(Number(e.target.value)),
        className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
        children: [10, 20, 30, 50, 100].map(e => t.jsx("option", {
          value: e,
          children: e
        }, e))
      }), t.jsx("label", {
        className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
        children: "Excl"
      }), t.jsxs("select", {
        value: T,
        onChange: e => D(Number(e.target.value)),
        className: "text-[11px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
        children: [t.jsx("option", {
          value: 63,
          children: "3M"
        }), t.jsx("option", {
          value: 126,
          children: "6M"
        }), t.jsx("option", {
          value: 252,
          children: "1Y"
        }), t.jsx("option", {
          value: 504,
          children: "2Y"
        })]
      }), t.jsx("label", {
        className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
        children: "Horizon"
      }), t.jsx("div", {
        className: "flex rounded border border-border overflow-hidden",
        children: ["1M", "3M", "6M", "1Y"].map(e => t.jsx("button", {
          onClick: () => Q(e),
          className: `text-[11px] font-mono px-2 py-0.5 transition-colors ${p===e?"bg-amber-500/15 text-amber-300 border-r border-border last:border-r-0":"bg-card text-muted-foreground hover:text-foreground hover:bg-accent border-r border-border last:border-r-0"}`,
          children: e
        }, e))
      }), t.jsx("label", {
        className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
        children: "Preset"
      }), t.jsxs("select", {
        onChange: e => {
          Ie(e.target.value), e.target.value = "__none__"
        },
        defaultValue: "__none__",
        className: "text-[10px] font-mono px-2 py-0.5 bg-background border border-border rounded text-foreground",
        children: [t.jsx("option", {
          value: "__none__",
          children: "(apply preset…)"
        }), Object.keys(X).map(e => t.jsx("option", {
          value: e,
          children: e
        }, e))]
      }), t.jsx("div", {
        className: "flex-1"
      }), re ? t.jsxs("button", {
        onClick: Te,
        className: "text-[11px] font-mono px-3 py-1 rounded bg-red-500/15 text-red-300 border border-red-500/60 hover:bg-red-500/25 flex items-center gap-1",
        children: [t.jsx(Ke, {
          className: "w-3 h-3"
        }), "Cancel"]
      }) : t.jsxs("button", {
        onClick: Ee,
        disabled: U.length === 0,
        className: "text-[11px] font-mono px-3 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/60 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1",
        children: [t.jsx(it, {
          className: "w-3 h-3"
        }), "Run · ", U.length, " tickers"]
      })]
    }), f && t.jsxs("div", {
      className: "px-3 py-2 border-b border-border bg-amber-500/5 flex items-center gap-1.5 flex-wrap",
      children: [t.jsx("span", {
        className: "text-[10px] font-mono text-amber-300 uppercase tracking-wider mr-1",
        children: "Consensus presets"
      }), Object.keys(X).map(e => {
        const m = ee.has(e);
        return t.jsx("button", {
          onClick: () => me(v => {
            const M = new Set(v);
            return M.has(e) ? M.delete(e) : M.add(e), M
          }),
          className: `text-[10px] font-mono px-2 py-0.5 border rounded transition-colors ${m?"border-amber-500 bg-amber-500/15 text-amber-300":"border-border text-muted-foreground hover:text-foreground hover:bg-accent"}`,
          children: e
        }, e)
      }), t.jsx("button", {
        onClick: () => me(new Set(Object.keys(X))),
        className: "text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent ml-2",
        children: "All"
      }), t.jsx("button", {
        onClick: () => me(new Set),
        className: "text-[10px] font-mono px-2 py-0.5 border border-border rounded text-muted-foreground hover:text-foreground hover:bg-accent",
        children: "None"
      }), t.jsxs("span", {
        className: "text-[10px] font-mono text-muted-foreground/70 ml-2",
        children: [ee.size, " preset", ee.size === 1 ? "" : "s",
          " selected · per-ticker runs ", ee.size, "× algorithm"
        ]
      })]
    }), re && ne.total > 0 && t.jsx("div", {
      className: "px-3 py-1 border-b border-border bg-card/40",
      children: t.jsx("div", {
        className: "h-1.5 bg-border rounded overflow-hidden",
        children: t.jsx("div", {
          className: "h-full bg-amber-500 transition-all",
          style: {
            width: `${ne.done/ne.total*100}%`
          }
        })
      })
    }), Ne && t.jsxs("div", {
      className: "px-3 py-2 border-b border-border bg-red-500/5 text-red-400 text-[11px] font-mono flex items-center gap-2",
      children: [t.jsx(Ge, {
        className: "w-3.5 h-3.5"
      }), Ne]
    }), V.length > 0 && Me.length + je.length > 0 && t.jsxs("div", {
      className: "grid grid-cols-1 md:grid-cols-2 gap-px bg-border border-b border-border",
      children: [t.jsx(_e, {
        title: "Top long setups",
        tone: "long",
        rows: Me,
        horizon: p,
        onOpen: xe
      }), t.jsx(_e, {
        title: "Top short setups",
        tone: "short",
        rows: je,
        horizon: p,
        onOpen: xe
      })]
    }), t.jsxs("div", {
      className: "flex-1 min-h-0 overflow-auto",
      children: [V.length === 0 && !re && t.jsxs("div", {
        className: "px-3 py-8 text-center text-[11px] font-mono text-muted-foreground",
        children: ["Set up the universe and parameters above, then click ", t.jsx(
            "span", {
              className: "text-amber-300",
              children: "Run"
            }), " to screen.", t.jsx("br", {}),
          "First run fetches OHLCV per ticker (cached on later runs)."
        ]
      }), V.length > 0 && t.jsxs("table", {
        className: "w-full text-[10px] font-mono",
        children: [t.jsx("thead", {
          className: "sticky top-0 bg-card border-b border-border z-10",
          children: t.jsxs("tr", {
            className: "text-muted-foreground/80 uppercase tracking-wider",
            children: [_("ticker", "Ticker", "left"), _("composite",
                `Composite ${p}`), _("median", `Median ${p}`), !f && _(
                "mean", `Mean ${p}`), !f && (p === "1M" || p ===
              "3M") && _("p25", `p25 ${p}`), !f && (p === "1M" || p ===
                "3M") && _("p75", `p75 ${p}`), _("hitLong",
                `L hit ${p}`), _("hitLongEdge", "L edge"), _("hitShort",
                `S hit ${p}`), _("hitShortEdge", "S edge"), f && _(
                "agreement", "Agreement"), f && _("dispersion",
                `±sd ${p}`), f && _("snr", "SNR"), f && _(
                "validPresets", "Presets"), !f && _("n", "matches"),
              f && t.jsx("th", {
                className: "text-left font-normal py-1 px-2",
                children: "Verdict"
              }), t.jsx("th", {
                className: "text-left font-normal py-1 px-2",
                children: "status"
              })
            ]
          })
        }), t.jsx("tbody", {
          children: Re.map(e => {
            const m = ae(e, p),
              v = j => Number.isFinite(j ?? NaN) ? j >= 0 ?
              "text-green-400" : "text-red-400" :
              "text-muted-foreground/50",
              M = (j, S) => Number.isFinite(j) ? S ? j >= 0 ?
              "text-green-400/80" : "text-red-400/80" : j >= 0 ?
              "text-red-400/80" : "text-green-400/80" :
              "text-muted-foreground/50",
              L = (m.hL ?? NaN) - (m.bL ?? NaN),
              R = (m.hS ?? NaN) - (m.bS ?? NaN);
            return t.jsxs("tr", {
              onClick: () => e.status === "ok" && xe(e.ticker),
              className: `border-t border-border/40 ${e.status==="ok"?"hover:bg-accent/30 cursor-pointer":"opacity-60"}`,
              children: [t.jsx("td", {
                className: "text-foreground py-0.5 px-2 font-semibold",
                children: e.ticker
              }), t.jsx("td", {
                className: `text-right py-0.5 px-2 ${v(e.composite)}`,
                children: ke(e.composite)
              }), t.jsx("td", {
                className: `text-right py-0.5 px-2 ${v(m.med)}`,
                children: le(m.med)
              }), !f && t.jsx("td", {
                className: `text-right py-0.5 px-2 ${v(m.mean)}`,
                children: le(m.mean)
              }), !f && (p === "1M" || p === "3M") && t.jsx(
              "td", {
                className: `text-right py-0.5 px-2 ${v(m.p25)}`,
                children: le(m.p25)
              }), !f && (p === "1M" || p === "3M") && t.jsx(
              "td", {
                className: `text-right py-0.5 px-2 ${v(m.p75)}`,
                children: le(m.p75)
              }), t.jsx("td", {
                className: "text-right py-0.5 px-2 text-green-400",
                children: Number.isFinite(m.hL ?? NaN) ?
                  `${m.hL.toFixed(0)}%` : "—"
              }), t.jsx("td", {
                className: `text-right py-0.5 px-2 ${M(L,!0)}`,
                children: Se(L)
              }), t.jsx("td", {
                className: "text-right py-0.5 px-2 text-red-400",
                children: Number.isFinite(m.hS ?? NaN) ?
                  `${m.hS.toFixed(0)}%` : "—"
              }), t.jsx("td", {
                className: `text-right py-0.5 px-2 ${M(R,!1)}`,
                children: Se(R)
              }), f && t.jsxs(t.Fragment, {
                children: [t.jsx("td", {
                  className: "text-right py-0.5 px-2 text-muted-foreground",
                  children: Number.isFinite(e
                      .consensus_agreement ?? NaN) ?
                    `${Math.round(e.consensus_agreement*100)}%` :
                    "—"
                }), t.jsx("td", {
                  className: "text-right py-0.5 px-2 text-muted-foreground",
                  children: (() => {
                    const j = p === "1M" ? e
                      .consensus_sd1M : p === "3M" ? e
                      .consensus_sd3M : p === "6M" ? e
                      .consensus_sd6M : e
                      .consensus_sd1Y;
                    return Number.isFinite(j ?? NaN) ?
                      `±${j.toFixed(1)}pp` : "—"
                  })()
                }), t.jsx("td", {
                  className: "text-right py-0.5 px-2 text-muted-foreground",
                  children: ke(e.consensus_snr)
                }), t.jsxs("td", {
                  className: "text-right py-0.5 px-2 text-muted-foreground",
                  children: [e.consensus_validPresets ??
                    "—", e.consensus_totalPresets ?
                    `/${e.consensus_totalPresets}` : ""
                  ]
                })]
              }), !f && t.jsx("td", {
                className: "text-right py-0.5 px-2 text-muted-foreground",
                children: e.matchN ?? "—"
              }), f && t.jsx("td", {
                className: "py-0.5 px-2",
                title: e.consensus_verdict,
                children: (() => {
                  const j = e.consensus_verdict ?? "",
                    S = e.consensus_direction;
                  if (!j) return t.jsx("span", {
                    className: "text-muted-foreground/50",
                    children: "—"
                  });
                  const K = j.startsWith("Strong") && S ===
                    "long" ?
                    "text-green-300 font-semibold" : j
                    .startsWith("Strong") && S === "short" ?
                    "text-red-300 font-semibold" : j
                    .startsWith("Moderate") && S ===
                    "long" ? "text-green-400/90" : j
                    .startsWith("Moderate") && S ===
                    "short" ? "text-red-400/90" : j
                    .startsWith("Weak") && S === "long" ?
                    "text-green-400/70" : j.startsWith(
                      "Weak") && S === "short" ?
                    "text-red-400/70" :
                    "text-muted-foreground";
                  return t.jsx("span", {
                    className: K,
                    children: j
                  })
                })()
              }), t.jsxs("td", {
                className: "py-0.5 px-2 text-muted-foreground",
                children: [e.status === "running" && t.jsx(
                  "span", {
                    className: "text-amber-300",
                    children: "running…"
                  }), e.status === "pending" && t.jsx(
                  "span", {
                    className: "text-muted-foreground/60",
                    children: "queued"
                  }), e.status === "ok" && t.jsx("span", {
                  className: "text-green-400/80",
                  children: "ok"
                }), e.status === "skipped" && t.jsx(
                "span", {
                  className: "text-muted-foreground",
                  title: e.errorMsg,
                  children: "skipped"
                }), e.status === "error" && t.jsx("span", {
                  className: "text-red-400",
                  title: e.errorMsg,
                  children: "error"
                })]
              })]
            }, e.ticker)
          })
        })]
      })]
    })]
  })
}

function _e({
  title: n,
  tone: s,
  rows: l,
  horizon: u,
  onOpen: o
}) {
  const i = s === "long" ? "text-green-400" : "text-red-400",
    a = g => Number.isFinite(g ?? NaN) ? g >= 0 ? "text-green-400" : "text-red-400" :
    "text-muted-foreground/50";
  return t.jsxs("div", {
    className: "bg-card px-3 py-2",
    children: [t.jsxs("div", {
      className: `text-[10px] font-mono uppercase tracking-wider mb-1 ${i}`,
      children: [n, " · ", u]
    }), l.length === 0 ? t.jsx("div", {
      className: "text-[10px] font-mono text-muted-foreground py-1",
      children: "(none)"
    }) : t.jsxs("table", {
      className: "w-full text-[10px] font-mono",
      children: [t.jsx("thead", {
        children: t.jsxs("tr", {
          className: "text-muted-foreground/70 uppercase tracking-wider",
          children: [t.jsx("th", {
            className: "text-left font-normal py-0.5 pr-2",
            children: "#"
          }), t.jsx("th", {
            className: "text-left font-normal py-0.5 pr-2",
            children: "Ticker"
          }), t.jsx("th", {
            className: "text-right font-normal py-0.5 pr-2",
            children: "Composite"
          }), t.jsx("th", {
            className: "text-right font-normal py-0.5 pr-2",
            children: "Median"
          }), t.jsx("th", {
            className: "text-right font-normal py-0.5 pr-2",
            children: "L%"
          }), t.jsx("th", {
            className: "text-right font-normal py-0.5",
            children: "S%"
          })]
        })
      }), t.jsx("tbody", {
        children: l.map((g, c) => {
          const b = ae(g, u);
          return t.jsxs("tr", {
            onClick: () => o(g.ticker),
            className: "hover:bg-accent/30 cursor-pointer border-t border-border/30",
            children: [t.jsx("td", {
              className: "py-0.5 pr-2 text-muted-foreground/60",
              children: c + 1
            }), t.jsx("td", {
              className: "py-0.5 pr-2 text-foreground font-semibold",
              children: g.ticker
            }), t.jsx("td", {
              className: `text-right py-0.5 pr-2 ${a(g.composite)}`,
              children: Number.isFinite(g.composite ?? NaN) ? g
                .composite.toFixed(2) : "—"
            }), t.jsx("td", {
              className: `text-right py-0.5 pr-2 ${a(b.med)}`,
              children: Number.isFinite(b.med ?? NaN) ?
                `${b.med>=0?"+":""}${b.med.toFixed(1)}%` : "—"
            }), t.jsx("td", {
              className: "text-right py-0.5 pr-2 text-green-400",
              children: Number.isFinite(b.hL ?? NaN) ?
                `${b.hL.toFixed(0)}` : "—"
            }), t.jsx("td", {
              className: "text-right py-0.5 text-red-400",
              children: Number.isFinite(b.hS ?? NaN) ?
                `${b.hS.toFixed(0)}` : "—"
            })]
          }, g.ticker)
        })
      })]
    })]
  })
}
export {
  ft as
  default
};