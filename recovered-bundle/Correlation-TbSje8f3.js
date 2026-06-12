const __vite__mapDeps = (i, m = __vite__mapDeps, d = (m.f || (m.f = ["./index-CsG73Aq_.js",
  "./index-B6yc4oNj.css"
]))) => i.map(i => d[i]);
import {
  c as lt,
  bp as Fe,
  r as y,
  w as Ae,
  j as e,
  am as Re,
  an as Le,
  B as W,
  aq as Pe,
  ap as Te,
  ay as _e,
  az as qe,
  aA as He,
  aB as Ke,
  aC as Je,
  aD as Oe,
  x as Qe,
  I as Ee,
  X as ct,
  z as me,
  a as dt,
  g as ut,
  b as ce,
  C as xt,
  bq as ht,
  br as mt,
  o as Q,
  p as Z,
  q as ee,
  t as te,
  v as P,
  at as pt,
  Y as ft,
  bs as gt,
  bd as bt,
  a4 as vt,
  E as jt,
  A as Nt,
  aF as yt,
  aG as Ct,
  aH as wt,
  bt as St,
  aJ as oe,
  aX as Ye,
  ai as Ze,
  a1 as et,
  $ as kt,
  bu as Mt,
  bg as Ft
} from "./index-CsG73Aq_.js";
import {
  u as At
} from "./universeSignature-DAAu9BGh.js";
import {
  r as Rt,
  d as Lt,
  S as We
} from "./driverScan-BlD7pNfH.js";
import {
  P as Pt
} from "./play-D7mVvggU.js";
import {
  P as Tt
} from "./pin-CcGsz7Zd.js";
const Ot = lt("Grid3x3", [
  ["rect", {
    width: "18",
    height: "18",
    x: "3",
    y: "3",
    rx: "2",
    key: "afitv7"
  }],
  ["path", {
    d: "M3 9h18",
    key: "1pudct"
  }],
  ["path", {
    d: "M3 15h18",
    key: "5xshup"
  }],
  ["path", {
    d: "M9 3v18",
    key: "fh3hqa"
  }],
  ["path", {
    d: "M15 3v18",
    key: "14nvp0"
  }]
]);

function Ve(t) {
  const o = [];
  for (let r = 1; r < t.length; r++) {
    const i = t[r - 1],
      c = t[r];
    Number.isFinite(i) && Number.isFinite(c) && i > 0 && c > 0 ? o.push(Math.log(c / i)) : o.push(
      NaN)
  }
  return o
}

function $e(t) {
  const o = [];
  for (let r = 1; r < t.length; r++) {
    const i = t[r - 1],
      c = t[r];
    Number.isFinite(i) && Number.isFinite(c) ? o.push(c - i) : o.push(NaN)
  }
  return o
}

function ie(t, o) {
  const r = Math.min(t.length, o.length);
  let i = 0,
    c = 0,
    u = 0,
    s = 0,
    a = 0,
    n = 0;
  for (let j = 0; j < r; j++) {
    const g = t[j],
      k = o[j];
    !Number.isFinite(g) || !Number.isFinite(k) || (c += g, u += k, s += g * k, a += g * g, n += k *
      k, i++)
  }
  if (i < 3) return 0;
  const l = c / i,
    h = u / i,
    f = a - i * l * l,
    d = n - i * h * h,
    x = s - i * l * h,
    m = Math.sqrt(f * d);
  return m === 0 ? 0 : x / m
}

function ge(t, o) {
  const r = t.length;
  if (r <= o) return 0;
  let i = 0,
    c = 0;
  for (let n = 0; n < r; n++) Number.isFinite(t[n]) && (i += t[n], c++);
  if (c === 0) return 0;
  const u = i / c;
  let s = 0,
    a = 0;
  for (let n = 0; n < r; n++) {
    const l = t[n];
    if (Number.isFinite(l) && (a += (l - u) ** 2), n >= o) {
      const h = t[n - o];
      Number.isFinite(l) && Number.isFinite(h) && (s += (l - u) * (h - u))
    }
  }
  return a === 0 ? 0 : s / a
}

function pe(t) {
  const r = [.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531, -
    176.6150291621406, 12.507343278686905, -.13857109526572012, 9984369578019572e-21,
    15056327351493116e-23
  ];
  if (t < .5) return Math.log(Math.PI / Math.sin(Math.PI * t)) - pe(1 - t);
  t -= 1;
  let i = r[0];
  const c = t + 7 + .5;
  for (let u = 1; u < 9; u++) i += r[u] / (t + u);
  return .5 * Math.log(2 * Math.PI) + (t + .5) * Math.log(c) - c + Math.log(i)
}

function Vt(t, o, r) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const i = pe(o + r) - pe(o) - pe(r),
    c = Math.exp(Math.log(t) * o + Math.log(1 - t) * r + i) / o,
    u = 1e-15;
  let s = 1,
    a = 1,
    n = 0;
  for (let l = 0; l < 200; l++) {
    let h;
    if (l === 0) h = 1;
    else if (l % 2 === 0) {
      const d = l / 2;
      h = d * (r - d) * t / ((o + 2 * d - 1) * (o + 2 * d))
    } else {
      const d = (l - 1) / 2;
      h = -((o + d) * (o + r + d) * t) / ((o + 2 * d) * (o + 2 * d + 1))
    }
    n = 1 + h * n, Math.abs(n) < 1e-30 && (n = 1e-30), a = 1 + h / a, Math.abs(a) < 1e-30 && (a =
      1e-30), n = 1 / n;
    const f = n * a;
    if (s *= f, Math.abs(f - 1) < u) break
  }
  return c * (s - 1)
}

function $t(t, o) {
  if (o <= 0 || !Number.isFinite(t)) return 1;
  const r = o / (o + t * t);
  return Vt(r, o / 2, .5)
}

function tt(t, o, r) {
  const i = Math.min(t.length, o.length),
    c = ge(t, 1),
    u = ge(o, 1),
    s = 1 - c * u,
    a = 1 + c * u,
    n = a === 0 ? i : Math.max(3, Math.round(i * s / a)),
    l = r * r,
    h = l >= 1 ? 0 : r * Math.sqrt((n - 2) / (1 - l)),
    f = Math.abs(h),
    d = Math.max(1, n - 2),
    x = $t(f, d);
  return {
    effectiveN: n,
    tStat: Math.round(h * 1e3) / 1e3,
    pValue: Math.round(x * 1e4) / 1e4
  }
}

function Bt(t, o) {
  const r = new Map(o.map(s => [s.time, s.value])),
    i = [],
    c = [],
    u = [];
  for (const s of t) {
    const a = r.get(s.time);
    a !== void 0 && (i.push(s.time), c.push(s.value), u.push(a))
  }
  return {
    dates: i,
    valuesA: c,
    valuesB: u
  }
}

function De(t) {
  const o = t.map((c, u) => ({
    v: c,
    i: u
  }));
  o.sort((c, u) => c.v - u.v);
  const r = new Array(t.length);
  let i = 0;
  for (; i < o.length;) {
    let c = i;
    for (; c < o.length && o[c].v === o[i].v;) c++;
    const u = (i + c - 1) / 2 + 1;
    for (let s = i; s < c; s++) r[o[s].i] = u;
    i = c
  }
  return r
}

function It(t, o) {
  const r = Math.min(t.length, o.length);
  return r < 3 ? 0 : ie(De(t.slice(0, r)), De(o.slice(0, r)))
}

function Ge(t, o, r = .05) {
  if (o < 4) return {
    lower: -1,
    upper: 1
  };
  const i = .5 * Math.log((1 + t) / (1 - t)),
    c = 1 / Math.sqrt(o - 3),
    u = r <= .01 ? 2.576 : r <= .05 ? 1.96 : 1.645,
    s = i - u * c,
    a = i + u * c;
  return {
    lower: Math.round((Math.exp(2 * s) - 1) / (Math.exp(2 * s) + 1) * 1e4) / 1e4,
    upper: Math.round((Math.exp(2 * a) - 1) / (Math.exp(2 * a) + 1) * 1e4) / 1e4
  }
}

function Be(t, o) {
  const r = t.length;
  if (r < 20) return {
    stat: 0,
    pValue: 1,
    lags: 0,
    isStationary: !1
  };
  const i = o ?? Math.min(Math.floor(Math.pow(r - 1, 1 / 3)), 12),
    c = new Array(r - 1);
  for (let p = 1; p < r; p++) c[p - 1] = t[p] - t[p - 1];
  const u = i + 1;
  if (r - 1 - i < 10) return {
    stat: 0,
    pValue: 1,
    lags: i,
    isStationary: !1
  };
  const a = 2 + i,
    n = [],
    l = [];
  for (let p = u; p < r - 1; p++) {
    const N = [1, t[p]];
    for (let M = 1; M <= i; M++) N.push(c[p - M]);
    n.push(N), l.push(c[p])
  }
  const h = Array.from({
      length: a
    }, () => new Array(a).fill(0)),
    f = new Array(a).fill(0);
  for (let p = 0; p < n.length; p++)
    for (let N = 0; N < a; N++) {
      f[N] += n[p][N] * l[p];
      for (let M = 0; M < a; M++) h[N][M] += n[p][N] * n[p][M]
    }
  const d = h.map((p, N) => [...p, f[N]]);
  for (let p = 0; p < a; p++) {
    let N = p;
    for (let M = p + 1; M < a; M++) Math.abs(d[M][p]) > Math.abs(d[N][p]) && (N = M);
    if ([d[p], d[N]] = [d[N], d[p]], Math.abs(d[p][p]) < 1e-12) return {
      stat: 0,
      pValue: 1,
      lags: i,
      isStationary: !1
    };
    for (let M = p + 1; M < a; M++) {
      const A = d[M][p] / d[p][p];
      for (let O = p; O <= a; O++) d[M][O] -= A * d[p][O]
    }
  }
  const x = new Array(a).fill(0);
  for (let p = a - 1; p >= 0; p--) {
    x[p] = d[p][a];
    for (let N = p + 1; N < a; N++) x[p] -= d[p][N] * x[N];
    x[p] /= d[p][p]
  }
  const m = x[1];
  let j = 0;
  for (let p = 0; p < n.length; p++) {
    let N = 0;
    for (let M = 0; M < a; M++) N += n[p][M] * x[M];
    j += (l[p] - N) ** 2
  }
  const g = j / (n.length - a),
    k = h.map((p, N) => [...p, ...Array.from({
      length: a
    }, (M, A) => N === A ? 1 : 0)]);
  for (let p = 0; p < a; p++) {
    let N = p;
    for (let A = p + 1; A < a; A++) Math.abs(k[A][p]) > Math.abs(k[N][p]) && (N = A);
    [k[p], k[N]] = [k[N], k[p]];
    const M = k[p][p];
    if (Math.abs(M) < 1e-12) return {
      stat: 0,
      pValue: 1,
      lags: i,
      isStationary: !1
    };
    for (let A = 0; A < 2 * a; A++) k[p][A] /= M;
    for (let A = 0; A < a; A++) {
      if (A === p) continue;
      const O = k[A][p];
      for (let T = 0; T < 2 * a; T++) k[A][T] -= O * k[p][T]
    }
  }
  const b = Math.sqrt(g * k[1][a + 1]),
    C = b > 0 ? m / b : 0;
  let F;
  return C <= -3.43 ? F = .005 : C <= -2.86 ? F = .01 + (C - -3.43) / (-2.86 - -3.43) * (.05 -
    .01) : C <= -2.57 ? F = .05 + (C - -2.86) / (-2.57 - -2.86) * (.1 - .05) : C <= -1.94 ? F = .1 +
    (C - -2.57) / (-1.94 - -2.57) * (.3 - .1) : C <= -1.62 ? F = .3 + (C - -1.94) / (-1.62 - -
    1.94) * (.5 - .3) : F = .5 + Math.min(.49, (C - -1.62) * .15), F = Math.max(.001, Math.min(.99,
      F)), {
      stat: Math.round(C * 1e3) / 1e3,
      pValue: Math.round(F * 1e4) / 1e4,
      lags: i,
      isStationary: F < .05
    }
}

function Et(t, o) {
  const r = Math.min(t.length, o.length);
  if (r < 30) return {
    stat: 0,
    pValue: 1,
    lags: 0,
    isCointegrated: !1,
    residuals: []
  };
  let i = 0,
    c = 0,
    u = 0,
    s = 0;
  for (let g = 0; g < r; g++) i += o[g], c += t[g], u += o[g] * t[g], s += o[g] * o[g];
  const a = i / r,
    n = c / r,
    l = s - r * a * a,
    h = u - r * a * n,
    f = l === 0 ? 0 : h / l,
    d = n - f * a,
    x = new Array(r);
  for (let g = 0; g < r; g++) x[g] = t[g] - d - f * o[g];
  const m = Be(x);
  let j;
  return m.stat <= -3.9 ? j = .005 : m.stat <= -3.34 ? j = .01 + (m.stat - -3.9) / (-3.34 - -3.9) *
    (.05 - .01) : m.stat <= -3.04 ? j = .05 + (m.stat - -3.34) / (-3.04 - -3.34) * (.1 - .05) : m
    .stat <= -2.03 ? j = .1 + (m.stat - -3.04) / (-2.03 - -3.04) * (.5 - .1) : j = .5 + Math.min(
      .49, (m.stat - -2.03) * .1), j = Math.max(.001, Math.min(.99, j)), {
      stat: m.stat,
      pValue: Math.round(j * 1e4) / 1e4,
      lags: m.lags,
      isCointegrated: j < .05,
      residuals: x
    }
}

function Yt(t, o, r, i) {
  const c = [];
  for (let u = i - 1; u < t.length; u++) {
    const s = t.slice(u - i + 1, u + 1),
      a = o.slice(u - i + 1, u + 1),
      n = s.length;
    let l = 0,
      h = 0,
      f = 0,
      d = 0;
    for (let g = 0; g < n; g++) l += s[g], h += a[g], f += s[g] * a[g], d += s[g] * s[g];
    const x = l / n,
      m = d - n * x * x,
      j = m === 0 ? 0 : (f - n * x * (h / n)) / m;
    c.push({
      time: r[u],
      value: Math.round(j * 1e4) / 1e4
    })
  }
  return c
}
async function Wt(t, o, r, i) {
  const [c, u] = await Promise.all([Fe(t), Fe(o)]), s = Bt(c, u);
  if (s.dates.length < 10) return {
    summary: {
      correlation: 0,
      spearmanCorrelation: 0,
      rSquared: 0,
      beta: 0,
      alpha: 0,
      observations: s.dates.length,
      mode: i,
      autoCorrelationA: 0,
      autoCorrelationB: 0,
      effectiveN: 0,
      tStat: 0,
      pValue: 1
    },
    rolling: [],
    rollingCI: [],
    rollingBeta: [],
    multiWindowRolling: {},
    crossCorrelation: [],
    acfA: [],
    acfB: [],
    scatter: [],
    levelsA: [],
    levelsB: [],
    diagnostics: {
      adfA: {
        stat: 0,
        pValue: 1,
        lags: 0,
        isStationary: !1
      },
      adfB: {
        stat: 0,
        pValue: 1,
        lags: 0,
        isStationary: !1
      },
      cointegration: null,
      fisherCI: {
        lower: -1,
        upper: 1
      }
    },
    error: "Insufficient overlapping data"
  };
  let a, n, l;
  i === "returns" ? (a = Ve(s.valuesA), n = Ve(s.valuesB), l = s.dates.slice(1)) : i ===
    "changes" ? (a = $e(s.valuesA), n = $e(s.valuesB), l = s.dates.slice(1)) : (a = s.valuesA, n =
      s.valuesB, l = s.dates);
  const h = ie(a, n),
    f = It(a, n),
    d = tt(a, n, h),
    x = Ge(h, Math.min(a.length, n.length)),
    m = 20,
    j = [],
    g = [];
  for (let w = 1; w <= m; w++) j.push({
    lag: w,
    value: Math.round(ge(a, w) * 1e4) / 1e4
  }), g.push({
    lag: w,
    value: Math.round(ge(n, w) * 1e4) / 1e4
  });
  const k = [];
  for (let w = r - 1; w < a.length; w++) {
    const V = a.slice(w - r + 1, w + 1),
      D = n.slice(w - r + 1, w + 1),
      U = ie(V, D);
    k.push({
      time: l[w],
      value: Math.round(U * 1e4) / 1e4
    })
  }
  const b = [30, 60, 120, 252],
    C = {};
  for (const w of b) {
    const V = [];
    for (let D = w - 1; D < a.length; D++) {
      const U = a.slice(D - w + 1, D + 1),
        Ne = n.slice(D - w + 1, D + 1),
        ye = ie(U, Ne);
      V.push({
        time: l[D],
        value: Math.round(ye * 1e4) / 1e4
      })
    }
    C[w] = V
  }
  const F = [];
  for (const w of k) {
    const V = Ge(w.value, r);
    F.push({
      time: w.time,
      upper: V.upper,
      lower: V.lower
    })
  }
  const p = Yt(n, a, l, r),
    N = [];
  for (let w = -20; w <= 20; w++) {
    let V, D;
    w >= 0 ? (V = a.slice(w), D = n.slice(0, n.length - w)) : (V = a.slice(0, a.length + w), D = n
      .slice(-w));
    const U = Math.min(V.length, D.length);
    if (U < 10) {
      N.push({
        lag: w,
        value: 0
      });
      continue
    }
    N.push({
      lag: w,
      value: Math.round(ie(V.slice(0, U), D.slice(0, U)) * 1e4) / 1e4
    })
  }
  const M = Math.min(a.length, n.length);
  let A = 0,
    O = 0,
    T = 0,
    L = 0;
  for (let w = 0; w < M; w++) A += n[w], O += a[w], T += n[w] * a[w], L += n[w] * n[w];
  const E = A / M,
    X = O / M,
    S = L - M * E * E,
    $ = T - M * E * X,
    I = S === 0 ? 0 : $ / S,
    R = X - I * E,
    z = h * h,
    re = Math.max(1, Math.floor(M / 500)),
    ue = [];
  for (let w = 0; w < M; w += re) ue.push({
    x: n[w],
    y: a[w],
    date: l[w]
  });
  const je = s.dates.map((w, V) => ({
      time: w,
      value: s.valuesA[V]
    })),
    K = s.dates.map((w, V) => ({
      time: w,
      value: s.valuesB[V]
    })),
    ae = Be(a),
    q = Be(n);
  let J = null;
  if (i === "levels" || !ae.isStationary && !q.isStationary) {
    const w = Et(s.valuesA, s.valuesB);
    J = {
      stat: w.stat,
      pValue: w.pValue,
      lags: w.lags,
      isCointegrated: w.isCointegrated
    }
  }
  return {
    summary: {
      correlation: Math.round(h * 1e4) / 1e4,
      spearmanCorrelation: Math.round(f * 1e4) / 1e4,
      rSquared: Math.round(z * 1e4) / 1e4,
      beta: Math.round(I * 1e4) / 1e4,
      alpha: Math.round(R * 1e5) / 1e5,
      observations: M,
      mode: i,
      autoCorrelationA: j[0]?.value || 0,
      autoCorrelationB: g[0]?.value || 0,
      effectiveN: d.effectiveN,
      tStat: d.tStat,
      pValue: d.pValue
    },
    rolling: k,
    rollingCI: F,
    rollingBeta: p,
    multiWindowRolling: C,
    crossCorrelation: N,
    acfA: j,
    acfB: g,
    scatter: ue,
    levelsA: je,
    levelsB: K,
    diagnostics: {
      adfA: ae,
      adfB: q,
      cointegration: J,
      fisherCI: x
    }
  }
}
async function Dt(t, o, r) {
  const i = parseInt(r) || 252,
    c = await Promise.all(t.map(f => Fe(f))),
    u = c.map(f => new Set(f.map(d => d.time)));
  let s = Array.from(u[0]);
  for (let f = 1; f < u.length; f++) s = s.filter(d => u[f].has(d));
  s.sort(), s.length > i && (s = s.slice(-i));
  const a = [];
  for (const f of c) {
    const d = new Map(f.map(x => [x.time, x.value]));
    a.push(s.map(x => {
      const m = d.get(x);
      return m == null || !Number.isFinite(m) ? NaN : m
    }))
  }
  const n = [];
  for (const f of a) o === "returns" ? n.push(Ve(f)) : o === "changes" ? n.push($e(f)) : n.push(
  f);
  const l = [],
    h = [];
  for (let f = 0; f < t.length; f++) {
    const d = [],
      x = [];
    for (let m = 0; m < t.length; m++)
      if (f === m) d.push(1), x.push(0);
      else {
        const j = ie(n[f], n[m]),
          g = tt(n[f], n[m], j);
        d.push(Math.round(j * 1e4) / 1e4), x.push(g.pValue)
      } l.push(d), h.push(x)
  }
  return {
    labels: t,
    matrix: l,
    pValues: h,
    observations: n[0]?.length || 0,
    dateRange: {
      from: s[0],
      to: s[s.length - 1]
    },
    mode: o
  }
}
async function Gt(t, o, r, i) {
  return Wt(t, o, r, i)
}
async function Ue(t, o, r) {
  return Dt(t, o, String(r))
}

function fe(t) {
  return t >= .7 ? "#22c55e" : t >= .5 ? "#86efac" : t >= .3 ? "#f59e0b" : t >= .15 ? "#94a3b8" :
    "#475569"
}

function Ut(t) {
  return t < .01 ? "#22c55e" : t < .05 ? "#86efac" : t < .1 ? "#f59e0b" : "#ef4444"
}

function Xe(t) {
  return (t >= 0 ? "+" : "") + t.toFixed(3)
}

function Xt(t) {
  return t < .001 ? "<0.001" : t.toFixed(3)
}

function zt({
  values: t
}) {
  if (!t || t.length === 0) return e.jsx("span", {
    className: "text-muted-foreground/30",
    children: "—"
  });
  const i = Math.max(...t, .01),
    c = t.map((u, s) => {
      const a = s / (t.length - 1 || 1) * 56 + 2,
        n = 18 - u / i * 16;
      return `${a.toFixed(1)},${n.toFixed(1)}`
    });
  return e.jsxs("svg", {
    width: 60,
    height: 20,
    className: "inline-block align-middle",
    children: [e.jsx("polyline", {
      points: c.join(" "),
      fill: "none",
      stroke: "#0ea5e9",
      strokeWidth: "1.2"
    }), t.map((u, s) => {
      const a = s / (t.length - 1 || 1) * 56 + 2,
        n = 18 - u / i * 16;
      return e.jsx("circle", {
        cx: a,
        cy: n,
        r: "1.5",
        fill: fe(u)
      }, s)
    })]
  })
}

function _t({
  done: t,
  total: o,
  phase: r
}) {
  const i = o > 0 ? Math.round(t / o * 100) : 0;
  return e.jsxs("div", {
    className: "space-y-1",
    children: [e.jsxs("div", {
      className: "flex items-center justify-between text-[10px] font-mono text-muted-foreground",
      children: [e.jsxs("span", {
        children: [r === "load" ? "Loading factor data" : "Scanning factors", ": ",
          t, " / ", o
        ]
      }), e.jsxs("span", {
        children: [i, "%"]
      })]
    }), e.jsx("div", {
      className: "h-1.5 bg-border/40 rounded-full overflow-hidden",
      children: e.jsx("div", {
        className: "h-full bg-primary transition-all duration-200 rounded-full",
        style: {
          width: `${i}%`
        }
      })
    })]
  })
}

function qt({
  rows: t,
  ticker: o,
  showAll: r,
  onShowAll: i,
  onPin: c
}) {
  const u = r ? t : t.slice(0, 30);
  return e.jsxs("div", {
    "data-testid": "driver-scan-results",
    className: "overflow-auto",
    children: [e.jsxs("table", {
      className: "text-[11px] font-mono w-full border-collapse",
      children: [e.jsx("thead", {
        children: e.jsx("tr", {
          className: "border-b border-border/40",
          children: ["#", "Factor", "Category", "Best |ρ|", "Spearman",
            "Window", "Lag", "Stability", "p-val", "Sparkline", "Action"
          ].map(s => e.jsx("th", {
            className: "px-2 py-1.5 text-left text-[9px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap bg-card/50",
            children: s
          }, s))
        })
      }), e.jsx("tbody", {
        children: u.map((s, a) => e.jsxs("tr", {
          className: "border-b border-border/20 hover:bg-accent/20 transition-colors",
          "data-testid": `driver-row-${a}`,
          children: [e.jsx("td", {
            className: "px-2 py-1 text-muted-foreground/60",
            children: s.rank
          }), e.jsxs("td", {
            className: "px-2 py-1 max-w-[200px]",
            children: [e.jsx("span", {
              className: "truncate block",
              title: s.label,
              children: s.label
            }), e.jsx("span", {
              className: "text-[9px] text-muted-foreground/50 block truncate",
              title: s.spec,
              children: s.spec
            })]
          }), e.jsx("td", {
            className: "px-2 py-1 text-muted-foreground whitespace-nowrap",
            children: e.jsx("span", {
              className: "text-[9px]",
              children: s.category
            })
          }), e.jsxs("td", {
            className: "px-2 py-1 font-bold whitespace-nowrap",
            style: {
              color: fe(s.bestAbsCorr)
            },
            children: [s.bestAbsCorr.toFixed(3), e.jsxs("span", {
              className: "text-[9px] text-muted-foreground/60 ml-0.5",
              children: ["(", Xe(s.bestCorr), ")"]
            })]
          }), e.jsx("td", {
            className: "px-2 py-1 whitespace-nowrap",
            style: {
              color: fe(Math.abs(s.spearman))
            },
            children: Xe(s.spearman)
          }), e.jsxs("td", {
            className: "px-2 py-1 whitespace-nowrap text-muted-foreground",
            children: [s.bestWindow, "d"]
          }), e.jsx("td", {
            className: "px-2 py-1 whitespace-nowrap text-muted-foreground",
            children: s.bestLag === 0 ? "0" : s.bestLag > 0 ?
              `+${s.bestLag}d` : `${s.bestLag}d`
          }), e.jsx("td", {
            className: "px-2 py-1 whitespace-nowrap",
            style: {
              color: fe(s.stability)
            },
            children: s.stability.toFixed(3)
          }), e.jsx("td", {
            className: "px-2 py-1 whitespace-nowrap",
            style: {
              color: Ut(s.pVal)
            },
            children: Xt(s.pVal)
          }), e.jsx("td", {
            className: "px-2 py-1",
            children: e.jsx(zt, {
              values: s.windowCorrs
            })
          }), e.jsx("td", {
            className: "px-2 py-1",
            children: e.jsxs("button", {
              "data-testid": `driver-pin-${a}`,
              className: "flex items-center gap-1 px-1.5 py-0.5 text-[9px] border border-border/40 rounded hover:bg-primary/20 hover:border-primary/50 transition-colors text-muted-foreground hover:text-primary",
              title: "Pin to Pairwise tab",
              onClick: () => c?.(s),
              children: [e.jsx(Tt, {
                className: "w-2.5 h-2.5"
              }), "Pin"]
            })
          })]
        }, s.spec))
      })]
    }), !r && t.length > 30 && e.jsx("div", {
      className: "py-2 text-center",
      children: e.jsxs("button", {
        className: "text-[10px] text-muted-foreground hover:text-foreground underline",
        onClick: i,
        children: ["Show all ", t.length, " factors"]
      })
    }), r && t.length > 30 && e.jsx("div", {
      className: "py-2 text-center",
      children: e.jsx("button", {
        className: "text-[10px] text-muted-foreground hover:text-foreground underline",
        onClick: i,
        children: "Show top 30 only"
      })
    })]
  })
}

function Ht({
  tickers: t,
  onPin: o
}) {
  const [r, i] = y.useState("SPG"), [c, u] = y.useState(!1), [s, a] = y.useState("1d"), [n, l] = y
    .useState(!0), [h, f] = y.useState(!0), [d, x] = y.useState(60), [m, j] = y.useState(!1), [g,
    k] = y.useState(null), [b, C] = y.useState(null), [F, p] = y.useState(null), [N, M] = y
    .useState(!1), A = y.useRef(null), O = Ae().length > 0, T = y.useCallback(async () => {
      if (m) {
        A.current?.abort(), j(!1);
        return
      }
      if (!r) return;
      j(!0), p(null), C(null), k(null), M(!1);
      const S = new AbortController;
      A.current = S;
      try {
        const $ = await Rt({
          ticker: r,
          targetMode: s,
          includeMacro: n,
          includeFund: h && O,
          minObs: d,
          signal: S.signal,
          onProgress: (I, R, z) => {
            k({
              done: I,
              total: R,
              phase: z
            })
          }
        });
        C($)
      } catch ($) {
        $?.name !== "AbortError" && p($?.message || "Scan failed")
      } finally {
        j(!1), k(null), A.current = null
      }
    }, [r, s, n, h, O, d, m]), L = y.useCallback(() => {
      if (!b) return;
      const S = Lt(b),
        $ = new Blob([S], {
          type: "text/csv"
        }),
        I = URL.createObjectURL($),
        R = document.createElement("a");
      R.href = I, R.download = `driver_scan_${b.ticker}_${b.targetMode}.csv`, R.click(), URL
        .revokeObjectURL(I)
    }, [b]), E = y.useCallback(S => {
      let $;
      if (S.spec.startsWith("MACRO:")) $ = S.spec;
      else if (S.spec.startsWith("FUND:")) {
        const I = S.spec.replace("FUND:", "");
        $ = `${r}:${I}`
      } else $ = S.spec;
      o?.(`${r}:close`, $, S.bestWindow)
    }, [r, o]), X = [{
      value: "price",
      label: "Price",
      testId: "driver-target-mode-price"
    }, {
      value: "1d",
      label: "1d Ret",
      testId: "driver-target-mode-1d"
    }, {
      value: "5d",
      label: "5d Ret",
      testId: "driver-target-mode-5d"
    }, {
      value: "21d",
      label: "21d Ret",
      testId: "driver-target-mode-21d"
    }, {
      value: "63d",
      label: "63d Ret",
      testId: "driver-target-mode-63d"
    }];
  return y.useMemo(() => t.find(S => S.ticker === r), [t, r]), e.jsxs("div", {
    className: "flex flex-col h-full",
    children: [e.jsxs("div", {
      className: "flex-shrink-0 border-b border-border/40 px-3 py-2 bg-card/30 flex flex-wrap items-end gap-3",
      children: [e.jsxs("div", {
        className: "space-y-0.5",
        children: [e.jsx("div", {
          className: "text-[9px] uppercase font-semibold text-muted-foreground tracking-wider",
          children: "Ticker"
        }), e.jsxs(Re, {
          open: c,
          onOpenChange: u,
          children: [e.jsx(Le, {
            asChild: !0,
            children: e.jsxs(W, {
              variant: "outline",
              size: "sm",
              className: "h-7 w-[100px] justify-between px-2 text-[11px] font-mono",
              "data-testid": "driver-ticker-selector",
              children: [e.jsx("span", {
                children: r || "Pick…"
              }), e.jsx(Pe, {
                className: "w-3 h-3 opacity-50 flex-shrink-0 ml-1"
              })]
            })
          }), e.jsxs(Te, {
            className: "w-[420px] p-0",
            align: "start",
            children: [e.jsxs(_e, {
              children: [e.jsx(qe, {
                placeholder: "Search ticker…",
                className: "h-7 text-[11px]"
              }), e.jsxs(He, {
                className: "max-h-[200px]",
                children: [e.jsx(Ke, {
                  children: "No ticker found."
                }), e.jsxs(Je, {
                  children: [t.map(S => e.jsxs(Oe, {
                    value: `${S.ticker} ${S.name}`,
                    onSelect: () => {
                      i(S.ticker), u(!1)
                    },
                    className: "text-[11px]",
                    children: [e.jsx(Qe, {
                      className: `w-3 h-3 mr-1 flex-shrink-0 ${r===S.ticker?"opacity-100":"opacity-0"}`
                    }), e.jsx("span", {
                      className: "font-mono font-bold mr-1 whitespace-nowrap",
                      children: S.ticker
                    }), e.jsx("span", {
                      className: "text-muted-foreground flex-1 min-w-0 truncate text-[10px]",
                      title: S.name,
                      children: S.name
                    })]
                  }, S.ticker)), r && !t.find(S =>
                    S.ticker === r) && e.jsxs(
                  Oe, {
                    value: r,
                    onSelect: () => u(!1),
                    className: "text-[11px]",
                    children: [e.jsx("span", {
                      className: "font-mono font-bold text-amber-400",
                      children: r
                    }), e.jsx("span", {
                      className: "text-muted-foreground ml-1 text-[10px]",
                      children: "(custom)"
                    })]
                  })]
                })]
              })]
            }), e.jsx("div", {
              className: "border-t border-border/30 p-1.5",
              children: e.jsx(Ee, {
                className: "h-6 text-[11px] font-mono",
                placeholder: "Type ticker (e.g. LMT)…",
                value: r,
                onChange: S => i(S.target.value.toUpperCase()
                  .trim()),
                onKeyDown: S => {
                  S.key === "Enter" && u(!1)
                }
              })
            })]
          })]
        })]
      }), e.jsxs("div", {
        className: "space-y-0.5",
        children: [e.jsx("div", {
          className: "text-[9px] uppercase font-semibold text-muted-foreground tracking-wider",
          children: "Target"
        }), e.jsx("div", {
          className: "flex gap-0.5",
          children: X.map(S => e.jsx("button", {
            "data-testid": S.testId,
            onClick: () => a(S.value),
            className: `px-2 py-1 text-[10px] font-mono rounded border transition-colors ${s===S.value?"bg-primary text-primary-foreground border-primary":"border-border/40 text-muted-foreground hover:bg-accent hover:text-foreground"}`,
            children: S.label
          }, S.value))
        })]
      }), e.jsxs("div", {
        className: "space-y-0.5",
        children: [e.jsx("div", {
          className: "text-[9px] uppercase font-semibold text-muted-foreground tracking-wider",
          children: "Include"
        }), e.jsxs("div", {
          className: "flex gap-1",
          children: [e.jsx("button", {
            onClick: () => l(S => !S),
            className: `px-2 py-1 text-[10px] font-mono rounded border transition-colors ${n?"bg-sky-500/20 border-sky-500/50 text-sky-300":"border-border/40 text-muted-foreground/50 hover:bg-accent"}`,
            children: "Macro"
          }), e.jsx("button", {
            onClick: () => f(S => !S),
            className: `px-2 py-1 text-[10px] font-mono rounded border transition-colors ${h?"bg-emerald-500/20 border-emerald-500/50 text-emerald-300":"border-border/40 text-muted-foreground/50 hover:bg-accent"}`,
            children: "Fundamentals"
          })]
        })]
      }), e.jsxs("div", {
        className: "space-y-0.5",
        children: [e.jsx("div", {
          className: "text-[9px] uppercase font-semibold text-muted-foreground tracking-wider",
          children: "Min Obs"
        }), e.jsx(Ee, {
          type: "number",
          min: 10,
          max: 500,
          value: d,
          onChange: S => x(Math.max(10, parseInt(S.target.value) || 60)),
          className: "h-7 w-[70px] text-[11px] font-mono px-2"
        })]
      }), e.jsxs("div", {
        className: "flex gap-2 items-end",
        children: [e.jsx(W, {
          size: "sm",
          className: "h-7 text-[11px] gap-1.5",
          onClick: T,
          "data-testid": "run-driver-scan",
          disabled: !r,
          children: m ? e.jsxs(e.Fragment, {
            children: [e.jsx(ct, {
              className: "w-3 h-3"
            }), " Cancel"]
          }) : e.jsxs(e.Fragment, {
            children: [e.jsx(Pt, {
              className: "w-3 h-3"
            }), " Run Driver Scan"]
          })
        }), b && e.jsxs(W, {
          variant: "outline",
          size: "sm",
          className: "h-7 text-[11px] gap-1.5",
          onClick: L,
          children: [e.jsx(me, {
            className: "w-3 h-3"
          }), " Export CSV"]
        })]
      }), b && !m && e.jsxs("div", {
        className: "text-[10px] text-muted-foreground font-mono ml-auto",
        children: [b.rows.length, " factors found · ", b.totalFactors,
          " scanned · ", b.durationMs, "ms"
        ]
      })]
    }), e.jsxs("div", {
      className: "flex-1 overflow-auto p-3 space-y-3 min-h-0",
      children: [!O && e.jsx("div", {
        className: "border border-sky-500/30 bg-sky-500/5 rounded px-3 py-2 text-[11px] text-sky-400",
        children: "Upload a fundamental workbook in the Sidebar to include fundamental/consensus factors in the scan."
      }), m && g && e.jsx(_t, {
        done: g.done,
        total: g.total,
        phase: g.phase
      }), m && !g && e.jsxs("div", {
        className: "text-[11px] text-muted-foreground font-mono animate-pulse",
        children: ["Initializing scan for ", r, "…"]
      }), F && e.jsx("div", {
        className: "border border-red-500/40 bg-red-500/10 rounded px-3 py-2 text-[11px] text-red-400",
        children: F
      }), !m && !b && !F && e.jsxs("div", {
        className: "flex flex-col items-center justify-center h-48 gap-2 text-center text-muted-foreground",
        children: [e.jsx("div", {
          className: "text-[13px] font-semibold",
          children: "Auto Driver Scan"
        }), e.jsx("div", {
          className: "text-[11px] max-w-xs",
          children: 'Pick a ticker, select a target (price level or N-day return), and click "Run Driver Scan" to discover which macro series and fundamental factors are most correlated with the stock — optimized over lookback window and lead/lag.'
        })]
      }), b && !m && e.jsxs("div", {
        className: "space-y-2",
        children: [e.jsxs("div", {
          className: "flex items-center gap-3 text-[9px] text-muted-foreground font-mono",
          children: [e.jsx("span", {
            className: "font-semibold",
            children: "Sparkline windows:"
          }), We.map((S, $) => e.jsxs("span", {
            children: [e.jsx("span", {
              className: "inline-block w-2 h-2 rounded-full mr-0.5 bg-sky-400/60"
            }), S, "d ", $ < We.length - 1 ? "·" : ""]
          }, S)), e.jsx("span", {
            className: "ml-auto",
            children: "Lag: positive = factor leads stock; negative = stock leads factor"
          })]
        }), e.jsx(qt, {
          rows: b.rows,
          ticker: b.ticker,
          showAll: N,
          onShowAll: () => M(S => !S),
          onPin: E
        })]
      })]
    })]
  })
}
const Kt = {
    layout: {
      background: {
        type: wt.Solid,
        color: "transparent"
      },
      textColor: "#7a8a9e",
      fontSize: 10,
      fontFamily: "'JetBrains Mono', monospace"
    },
    grid: {
      vertLines: {
        color: "rgba(255,255,255,0.04)"
      },
      horzLines: {
        color: "rgba(255,255,255,0.04)"
      }
    },
    crosshair: {
      mode: Ct.Normal
    },
    rightPriceScale: {
      borderColor: "rgba(255,255,255,0.1)"
    },
    timeScale: {
      borderColor: "rgba(255,255,255,0.1)",
      timeVisible: !1
    },
    handleScroll: !0,
    handleScale: !0
  },
  st = {
    Price: ["close", "open", "high", "low"],
    Valuation: ["P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2",
      "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2", "Implied Cap Rate"
    ],
    Yields: ["FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
      "Dividend Yield"],
    Estimates: ["EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2", "EBITDA FY1",
      "EBITDA FY2", "Sales FY1", "Sales FY2"
    ],
    LTM: ["EPS LTM", "FFO LTM", "AFFO LTM", "EBITDA LTM", "Sales LTM"],
    Growth: ["FY1 EPS Growth", "FY2 EPS Growth", "FY1 FFO Growth", "FY2 FFO Growth",
      "FY1 AFFO Growth", "FY2 AFFO Growth"
    ],
    Performance: ["1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%",
      "% off 52wk High", "% off 52wk Low"
    ],
    "Short Interest": ["Short Interest%", "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M"],
    Other: ["Dividend", "Enterprise Value", "Bull%", "Bear%"]
  },
  Jt = Object.values(st).flat();

function G(t) {
  return t.startsWith("MACRO:") ? t.replace("MACRO:", "") : t
}
const se = {
    primary: "#0ea5e9",
    secondary: "#f59e0b",
    positive: "#22c55e",
    negative: "#ef4444",
    purple: "#a855f7"
  },
  de = {
    30: "#ec4899",
    60: "#0ea5e9",
    120: "#22c55e",
    252: "#f59e0b"
  },
  Ie = ["levels", "rolling", "rollingBeta", "scatter", "crossCorr", "acf"],
  ze = {
    levels: "Levels",
    rolling: "Rolling Corr",
    rollingBeta: "Rolling Beta",
    scatter: "Scatter",
    crossCorr: "Cross-Corr",
    acf: "ACF"
  };

function be(t) {
  return t >= .7 ? "#22c55e" : t >= .3 ? "#86efac" : t >= -.3 ? "#94a3b8" : t >= -.7 ? "#fca5a5" :
    "#ef4444"
}

function Qt(t) {
  const o = Math.abs(t);
  return t > 0 ? `rgba(34, 197, 94, ${o*.4})` : t < 0 ? `rgba(239, 68, 68, ${o*.4})` : "transparent"
}

function ke({
  data: t,
  color: o,
  height: r,
  title: i,
  showZeroLine: c,
  histogram: u,
  secondData: s,
  secondColor: a,
  thirdData: n,
  thirdColor: l,
  fourthData: h,
  fourthColor: f,
  bandUpper: d,
  bandLower: x,
  bandColor: m,
  isMaximized: j,
  onMaximize: g,
  chartId: k
}) {
  const b = y.useRef(null),
    C = y.useRef(null),
    [F, p] = y.useState(!1);
  return y.useEffect(() => {
    const N = b.current;
    if (!N || t.length === 0) return;
    C.current && (C.current.remove(), C.current = null);
    const M = N.clientHeight || r,
      A = yt(N, {
        ...Kt,
        width: N.clientWidth,
        height: M
      });
    C.current = A, u ? A.addSeries(St, {
      color: o,
      priceLineVisible: !1,
      lastValueVisible: !1
    }).setData(t.map(L => ({
      time: L.time,
      value: L.value,
      color: L.value >= 0 ? se.positive : se.negative
    }))) : A.addSeries(oe, {
      color: o,
      lineWidth: 1.5,
      priceLineVisible: !1,
      lastValueVisible: !0,
      crosshairMarkerRadius: 3,
      title: i.split(" ").slice(0, 2).join(" ")
    }).setData(t.map(L => ({
      time: L.time,
      value: L.value
    }))), s && s.length > 0 && A.addSeries(oe, {
      color: a || se.secondary,
      lineWidth: 1.5,
      priceLineVisible: !1,
      lastValueVisible: !0,
      crosshairMarkerRadius: 3
    }).setData(s.map(L => ({
      time: L.time,
      value: L.value
    }))), n && n.length > 0 && A.addSeries(oe, {
      color: l || se.positive,
      lineWidth: 1.5,
      priceLineVisible: !1,
      lastValueVisible: !1,
      crosshairMarkerRadius: 3
    }).setData(n.map(L => ({
      time: L.time,
      value: L.value
    }))), h && h.length > 0 && A.addSeries(oe, {
      color: f || se.purple,
      lineWidth: 1.5,
      priceLineVisible: !1,
      lastValueVisible: !1,
      crosshairMarkerRadius: 3
    }).setData(h.map(L => ({
      time: L.time,
      value: L.value
    }))), d && d.length > 0 && A.addSeries(oe, {
      color: m || "rgba(255,255,255,0.2)",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: !1,
      lastValueVisible: !1,
      crosshairMarkerVisible: !1
    }).setData(d.map(L => ({
      time: L.time,
      value: L.value
    }))), x && x.length > 0 && A.addSeries(oe, {
      color: m || "rgba(255,255,255,0.2)",
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: !1,
      lastValueVisible: !1,
      crosshairMarkerVisible: !1
    }).setData(x.map(L => ({
      time: L.time,
      value: L.value
    }))), A.timeScale().fitContent();
    const O = new ResizeObserver(() => {
      C.current && N && C.current.applyOptions({
        width: N.clientWidth,
        height: N.clientHeight || M
      })
    });
    return O.observe(N), () => {
      O.disconnect(), A.remove(), C.current = null
    }
  }, [t, s, n, h, d, x, o, r, u, j]), y.useEffect(() => {
    const N = C.current;
    if (N) try {
      N.priceScale("right").applyOptions({
        mode: F ? Ye.Logarithmic : Ye.Normal
      })
    } catch {}
  }, [F]), e.jsxs("div", {
    className: `border border-border/30 flex flex-col ${j?"fixed inset-0 z-50 bg-background":"min-h-0"}`,
    onDoubleClick: N => {
      N.stopPropagation(), g && k && g(j ? null : k)
    },
    children: [e.jsxs("div", {
      className: "flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0",
      children: [e.jsx("span", {
        className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
        children: i
      }), e.jsx("div", {
        className: "flex-1"
      }), e.jsx("button", {
        className: `text-[9px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${F?"bg-primary text-primary-foreground":"text-muted-foreground/60 hover:text-muted-foreground bg-transparent"}`,
        onClick: N => {
          N.stopPropagation(), p(!F)
        },
        title: "Toggle logarithmic scale",
        children: "LOG"
      }), g && k && e.jsx("button", {
        className: "text-muted-foreground/60 hover:text-muted-foreground p-0.5",
        onClick: N => {
          N.stopPropagation(), g(j ? null : k)
        },
        title: j ? "Restore" : "Maximize",
        children: j ? e.jsx(Ze, {
          className: "w-3 h-3"
        }) : e.jsx(et, {
          className: "w-3 h-3"
        })
      }), e.jsx(kt, {
        getChart: () => C.current,
        label: `Correlation_${i}`
      })]
    }), e.jsx("div", {
      ref: b,
      className: j ? "flex-1 min-h-0" : "",
      style: j ? void 0 : {
        height: r
      }
    })]
  })
}

function rt({
  matrix: t,
  labels: o,
  pValues: r
}) {
  return e.jsx("div", {
    className: "overflow-auto",
    children: e.jsxs("table", {
      className: "text-[10px] font-mono border-collapse",
      children: [e.jsx("thead", {
        children: e.jsxs("tr", {
          children: [e.jsx("th", {
            className: "p-1 border border-border/30 bg-card/50 sticky left-0 z-10"
          }), o.map((i, c) => e.jsx("th", {
            className: "p-1 border border-border/30 bg-card/50 text-muted-foreground whitespace-nowrap max-w-[80px] truncate",
            title: i,
            children: G(i)
          }, c))]
        })
      }), e.jsx("tbody", {
        children: t.map((i, c) => e.jsxs("tr", {
          children: [e.jsx("td", {
            className: "p-1 border border-border/30 bg-card/50 font-semibold text-muted-foreground whitespace-nowrap sticky left-0 z-10",
            title: o[c],
            children: G(o[c])
          }), i.map((u, s) => e.jsxs("td", {
            className: "p-1 border border-border/30 text-center",
            style: {
              backgroundColor: c === s ? "rgba(255,255,255,0.05)" : Qt(
                u)
            },
            title: `${G(o[c])} × ${G(o[s])}: ${u.toFixed(4)} (p=${r[c][s].toFixed(4)})`,
            children: [e.jsx("span", {
              style: {
                color: c === s ? "rgba(255,255,255,0.3)" : be(u)
              },
              children: c === s ? "1.00" : u.toFixed(2)
            }), c !== s && r[c][s] > .05 && e.jsx("span", {
              className: "text-[8px] text-muted-foreground/40 block",
              children: "ns"
            })]
          }, s))]
        }, c))
      })]
    })
  })
}

function xe({
  data: t,
  nObs: o,
  title: r,
  height: i = 120
}) {
  const c = y.useRef(null);
  return y.useEffect(() => {
    const u = c.current;
    if (!u || t.length === 0) return;
    const s = u.getContext("2d");
    if (!s) return;
    const a = window.devicePixelRatio || 1,
      n = u.getBoundingClientRect();
    u.width = n.width * a, u.height = i * a, s.scale(a, a);
    const l = n.width,
      h = i,
      f = {
        top: 10,
        bottom: 20,
        left: 35,
        right: 10
      },
      d = l - f.left - f.right,
      x = h - f.top - f.bottom;
    s.clearRect(0, 0, l, h);
    const m = f.top + x / 2;
    s.strokeStyle = "rgba(255,255,255,0.15)", s.lineWidth = 1, s.beginPath(), s.moveTo(f.left,
      m), s.lineTo(l - f.right, m), s.stroke();
    const j = 1 / Math.sqrt(o),
      g = m - 1.96 * j * (x / 2),
      k = m + 1.96 * j * (x / 2);
    s.strokeStyle = "rgba(239, 68, 68, 0.3)", s.setLineDash([4, 4]), s.beginPath(), s.moveTo(f
        .left, g), s.lineTo(l - f.right, g), s.stroke(), s.beginPath(), s.moveTo(f.left, k), s
      .lineTo(l - f.right, k), s.stroke(), s.setLineDash([]);
    const b = Math.max(3, d / t.length - 2);
    t.forEach((C, F) => {
        const p = f.left + F / t.length * d + (d / t.length - b) / 2,
          N = C.value * (x / 2),
          M = C.value >= 0 ? m - N : m;
        s.fillStyle = Math.abs(C.value) > 1.96 * j ? "#0ea5e9" : "rgba(14, 165, 233, 0.4)", s
          .fillRect(p, M, b, Math.abs(N))
      }), s.fillStyle = "#7a8a9e", s.font = "9px 'JetBrains Mono', monospace", s.textAlign =
      "right", s.fillText("1.0", f.left - 4, f.top + 6), s.fillText("0", f.left - 4, m + 3), s
      .fillText("-1.0", f.left - 4, h - f.bottom), s.textAlign = "center";
    for (let C = 0; C < t.length; C += 5) {
      const F = f.left + (C + .5) / t.length * d;
      s.fillText(String(t[C].lag), F, h - 4)
    }
  }, [t, o, i]), e.jsxs("div", {
    className: "border border-border/30",
    children: [e.jsx("div", {
      className: "px-3 py-1 bg-card/50",
      children: e.jsx("span", {
        className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
        children: r
      })
    }), e.jsx("canvas", {
      ref: c,
      style: {
        width: "100%",
        height: i
      },
      className: "block"
    })]
  })
}

function Zt({
  data: t,
  labelA: o,
  labelB: r,
  height: i = 140,
  hideTitle: c
}) {
  const u = y.useRef(null);
  return y.useEffect(() => {
    const s = u.current;
    if (!s || t.length === 0) return;
    const a = s.getContext("2d");
    if (!a) return;
    const n = window.devicePixelRatio || 1,
      l = s.getBoundingClientRect();
    s.width = l.width * n, s.height = i * n, a.scale(n, n);
    const h = l.width,
      f = i,
      d = {
        top: 10,
        bottom: 22,
        left: 35,
        right: 10
      },
      x = h - d.left - d.right,
      m = f - d.top - d.bottom;
    a.clearRect(0, 0, h, f);
    const j = d.top + m / 2;
    a.strokeStyle = "rgba(255,255,255,0.15)", a.lineWidth = 1, a.beginPath(), a.moveTo(d.left,
      j), a.lineTo(h - d.right, j), a.stroke();
    const g = t.findIndex(b => b.lag === 0);
    if (g >= 0) {
      const b = d.left + (g + .5) / t.length * x;
      a.strokeStyle = "rgba(255,255,255,0.2)", a.beginPath(), a.moveTo(b, d.top), a.lineTo(b,
        f - d.bottom), a.stroke()
    }
    const k = Math.max(3, x / t.length - 1);
    t.forEach((b, C) => {
        const F = d.left + C / t.length * x + (x / t.length - k) / 2,
          p = b.value * (m / 2),
          N = b.value >= 0 ? j - p : j;
        a.fillStyle = b.lag === 0 ? "#f59e0b" : b.value >= 0 ? "rgba(34, 197, 94, 0.6)" :
          "rgba(239, 68, 68, 0.6)", a.fillRect(F, N, k, Math.abs(p))
      }), a.fillStyle = "#7a8a9e", a.font = "9px 'JetBrains Mono', monospace", a.textAlign =
      "right", a.fillText("1.0", d.left - 4, d.top + 6), a.fillText("0", d.left - 4, j + 3), a
      .fillText("-1.0", d.left - 4, f - d.bottom), a.textAlign = "center";
    for (let b = 0; b < t.length; b += 5) {
      const C = d.left + (b + .5) / t.length * x;
      a.fillText(String(t[b].lag), C, f - 4)
    }
    a.font = "8px 'JetBrains Mono', monospace", a.fillStyle = "#94a3b8", a.textAlign = "left", a
      .fillText(`← ${o} leads`, d.left + 2, f - d.bottom + 14), a.textAlign = "right", a
      .fillText(`${r} leads →`, h - d.right - 2, f - d.bottom + 14)
  }, [t, o, r, i]), c ? e.jsx("canvas", {
    ref: u,
    style: {
      width: "100%",
      height: i
    },
    className: "block"
  }) : e.jsxs("div", {
    className: "border border-border/30",
    children: [e.jsx("div", {
      className: "px-3 py-1 bg-card/50",
      children: e.jsxs("span", {
        className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
        children: ["Cross-Correlation (Lag ", t[0]?.lag, " to ", t[t.length - 1]?.lag,
          ")"
        ]
      })
    }), e.jsx("canvas", {
      ref: u,
      style: {
        width: "100%",
        height: i
      },
      className: "block"
    })]
  })
}

function es({
  data: t,
  labelX: o,
  labelY: r,
  beta: i,
  alpha: c,
  height: u = 250,
  hideTitle: s
}) {
  const a = y.useRef(null);
  return y.useEffect(() => {
    const n = a.current;
    if (!n || t.length === 0) return;
    const l = n.getContext("2d");
    if (!l) return;
    const h = window.devicePixelRatio || 1,
      f = n.getBoundingClientRect();
    n.width = f.width * h, n.height = u * h, l.scale(h, h);
    const d = f.width,
      x = u,
      m = {
        top: 10,
        bottom: 30,
        left: 50,
        right: 10
      },
      j = d - m.left - m.right,
      g = x - m.top - m.bottom;
    l.clearRect(0, 0, d, x);
    const k = t.map(R => R.x),
      b = t.map(R => R.y),
      C = Math.min(...k),
      F = Math.max(...k),
      p = Math.min(...b),
      N = Math.max(...b),
      M = F - C || 1,
      A = N - p || 1,
      O = M * .05,
      T = A * .05,
      L = R => m.left + (R - C + O) / (M + 2 * O) * j,
      E = R => m.top + g - (R - p + T) / (A + 2 * T) * g;
    l.strokeStyle = "rgba(255,255,255,0.06)", l.lineWidth = .5;
    for (let R = 0; R <= 4; R++) {
      const z = m.top + R / 4 * g;
      l.beginPath(), l.moveTo(m.left, z), l.lineTo(d - m.right, z), l.stroke();
      const re = m.left + R / 4 * j;
      l.beginPath(), l.moveTo(re, m.top), l.lineTo(re, x - m.bottom), l.stroke()
    }
    if (C < 0 && F > 0) {
      const R = L(0);
      l.strokeStyle = "rgba(255,255,255,0.15)", l.lineWidth = 1, l.beginPath(), l.moveTo(R, m
        .top), l.lineTo(R, x - m.bottom), l.stroke()
    }
    if (p < 0 && N > 0) {
      const R = E(0);
      l.strokeStyle = "rgba(255,255,255,0.15)", l.lineWidth = 1, l.beginPath(), l.moveTo(m.left,
        R), l.lineTo(d - m.right, R), l.stroke()
    }
    const X = C - O,
      S = F + O,
      $ = c + i * X,
      I = c + i * S;
    l.strokeStyle = "rgba(245, 158, 11, 0.6)", l.lineWidth = 1.5, l.setLineDash([6, 3]), l
      .beginPath(), l.moveTo(L(X), E($)), l.lineTo(L(S), E(I)), l.stroke(), l.setLineDash([]), t
      .forEach(R => {
        l.beginPath(), l.arc(L(R.x), E(R.y), 2.5, 0, Math.PI * 2), l.fillStyle =
          "rgba(14, 165, 233, 0.5)", l.fill()
      }), l.fillStyle = "#7a8a9e", l.font = "9px 'JetBrains Mono', monospace", l.textAlign =
      "center", l.fillText(o, m.left + j / 2, x - 4), l.textAlign = "right";
    for (let R = 0; R <= 4; R++) {
      const z = p - T + (A + 2 * T) * (1 - R / 4);
      l.fillText(z.toFixed(4), m.left - 4, m.top + R / 4 * g + 3)
    }
  }, [t, i, c, u, o, r]), s ? e.jsx("canvas", {
    ref: a,
    style: {
      width: "100%",
      height: u
    },
    className: "block"
  }) : e.jsxs("div", {
    className: "border border-border/30",
    children: [e.jsx("div", {
      className: "px-3 py-1 bg-card/50",
      children: e.jsxs("span", {
        className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
        children: ["Scatter: ", r, " vs ", o]
      })
    }), e.jsx("canvas", {
      ref: a,
      style: {
        width: "100%",
        height: u
      },
      className: "block"
    })]
  })
}

function he({
  title: t,
  children: o,
  chartId: r,
  isMaximized: i,
  onMaximize: c,
  height: u
}) {
  const s = y.useRef(null),
    [a, n] = y.useState(u);
  return y.useEffect(() => {
    if (!i || !s.current) {
      n(u);
      return
    }
    const l = new ResizeObserver(f => {
      for (const d of f) {
        const x = d.contentRect.height;
        x > 0 && n(x)
      }
    });
    l.observe(s.current);
    const h = s.current.clientHeight;
    return h > 0 && n(h), () => l.disconnect()
  }, [i, u]), e.jsxs("div", {
    className: `border border-border/30 flex flex-col ${i?"fixed inset-0 z-50 bg-background":""}`,
    onDoubleClick: l => {
      l.stopPropagation(), c(i ? null : r)
    },
    children: [e.jsxs("div", {
      className: "flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0",
      children: [e.jsx("span", {
        className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
        children: t
      }), e.jsx("div", {
        className: "flex-1"
      }), e.jsx("button", {
        className: "text-muted-foreground/60 hover:text-muted-foreground p-0.5",
        onClick: l => {
          l.stopPropagation(), c(i ? null : r)
        },
        title: i ? "Restore" : "Maximize",
        children: i ? e.jsx(Ze, {
          className: "w-3 h-3"
        }) : e.jsx(et, {
          className: "w-3 h-3"
        })
      })]
    }), e.jsx("div", {
      ref: s,
      className: i ? "flex-1 min-h-0" : "",
      children: o(i ? a : u)
    })]
  })
}

function Me({
  label: t,
  value: o,
  onChange: r,
  tickers: i,
  macroCatalog: c,
  testId: u
}) {
  const [s, a] = y.useState(!1), [n, l] = y.useState(o.startsWith("MACRO:") ? "macro" : "stock"), [
    h, f
  ] = y.useState(() => o.startsWith("MACRO:") ? "" : o.split(":")[0] || ""), [d, x] = y.useState(
    () => o.startsWith("MACRO:") ? o.replace("MACRO:", "") : o.split(":").slice(1).join(":") ||
    "close"), [m, j] = y.useState(!1), g = y.useMemo(() => {
    const b = {};
    for (const C of c) b[C.category] || (b[C.category] = []), b[C.category].push(C);
    return b
  }, [c]), k = y.useCallback(() => {
    if (n === "macro") d && r(`MACRO:${d}`);
    else {
      const b = Jt.includes(d) || Ae().includes(d) ? d : "close";
      h && r(`${h}:${b}`)
    }
    a(!1)
  }, [n, h, d, r]);
  return e.jsxs("div", {
    className: "space-y-1",
    children: [e.jsx("div", {
      className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
      children: t
    }), e.jsxs(Re, {
      open: s,
      onOpenChange: a,
      children: [e.jsx(Le, {
        asChild: !0,
        children: e.jsxs(W, {
          variant: "outline",
          size: "sm",
          className: "w-full h-7 justify-between px-2 text-[11px] font-mono",
          "data-testid": u,
          children: [e.jsx("span", {
            className: "truncate",
            children: o ? G(o) : "Select series..."
          }), e.jsx(Pe, {
            className: "w-3 h-3 ml-1 opacity-50 flex-shrink-0"
          })]
        })
      }), e.jsxs(Te, {
        className: "w-[280px] p-2 space-y-2",
        align: "start",
        children: [e.jsxs("div", {
          className: "flex gap-1",
          children: [e.jsxs(W, {
            variant: n === "stock" ? "default" : "secondary",
            size: "sm",
            className: "flex-1 h-6 text-[10px]",
            onClick: () => {
              l("stock"), x("close")
            },
            children: [e.jsx(ft, {
              className: "w-3 h-3 mr-1"
            }), " Stock"]
          }), e.jsxs(W, {
            variant: n === "macro" ? "default" : "secondary",
            size: "sm",
            className: "flex-1 h-6 text-[10px]",
            onClick: () => {
              l("macro"), x("")
            },
            children: [e.jsx(gt, {
              className: "w-3 h-3 mr-1"
            }), " Macro"]
          })]
        }), n === "stock" ? e.jsxs(e.Fragment, {
          children: [e.jsxs(Re, {
            open: m,
            onOpenChange: j,
            children: [e.jsx(Le, {
              asChild: !0,
              children: e.jsxs(W, {
                variant: "outline",
                size: "sm",
                className: "w-full h-6 justify-between px-2 text-[11px] font-mono",
                children: [h || "Select ticker", e.jsx(Pe, {
                  className: "w-3 h-3 ml-1 opacity-50"
                })]
              })
            }), e.jsx(Te, {
              className: "w-[420px] p-0",
              align: "start",
              children: e.jsxs(_e, {
                children: [e.jsx(qe, {
                  placeholder: "Search ticker...",
                  className: "h-7 text-[11px]"
                }), e.jsxs(He, {
                  className: "max-h-[200px]",
                  children: [e.jsx(Ke, {
                    children: "No ticker found."
                  }), e.jsx(Je, {
                    children: i.map(b => e.jsxs(
                      Oe, {
                        value: `${b.ticker} ${b.name}`,
                        onSelect: () => {
                          f(b.ticker), j(!1)
                        },
                        className: "text-[11px]",
                        children: [e.jsx(Qe, {
                          className: `w-3 h-3 mr-1 flex-shrink-0 ${h===b.ticker?"opacity-100":"opacity-0"}`
                        }), e.jsx(
                        "span", {
                          className: "font-mono font-bold mr-1 whitespace-nowrap",
                          children: b
                            .ticker
                        }), e.jsx(
                        "span", {
                          className: "text-muted-foreground flex-1 min-w-0 truncate text-[10px]",
                          title: b.name,
                          children: b
                            .name
                        })]
                      }, b.ticker))
                  })]
                })]
              })
            })]
          }), e.jsxs(Q, {
            value: d,
            onValueChange: x,
            children: [e.jsx(Z, {
              className: "h-6 text-[11px]",
              children: e.jsx(ee, {
                placeholder: "Metric"
              })
            }), e.jsxs(te, {
              className: "max-h-[420px]",
              children: [Object.entries(st).map(([b, C]) => e
                .jsxs("div", {
                  children: [e.jsx("div", {
                    className: "px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
                    children: b
                  }), C.map(F => e.jsx(P, {
                    value: F,
                    children: F
                  }, F))]
                }, b)), (() => {
                const b = Ae();
                return b.length > 0 ? e.jsxs(e.Fragment, {
                  children: [e.jsx("div", {
                    className: "px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider",
                    children: "Uploaded Fundamental"
                  }), b.map(C => e.jsx(P, {
                    value: C,
                    children: C
                  }, C))]
                }) : null
              })()]
            })]
          })]
        }) : e.jsx("div", {
          className: "max-h-[200px] overflow-y-auto space-y-0.5",
          children: Object.entries(g).map(([b, C]) => e.jsxs("div", {
            children: [e.jsx("div", {
              className: "text-[9px] font-semibold text-muted-foreground uppercase tracking-wider px-1 py-0.5",
              children: b
            }), C.map(F => e.jsxs("button", {
              className: `flex items-center w-full text-left px-2 py-0.5 text-[11px] rounded ${d===F.id?"bg-primary/20 text-primary":"hover:bg-accent"}`,
              onClick: () => x(F.id),
              children: [F.label, e.jsx("span", {
                className: "text-[9px] text-muted-foreground/50 ml-auto",
                children: F.freq
              })]
            }, F.id))]
          }, b))
        }), e.jsx(W, {
          size: "sm",
          className: "w-full h-6 text-[10px]",
          onClick: k,
          children: "Apply"
        })]
      })]
    })]
  })
}
const ts = [30, 60, 120, 252],
  ss = {
    30: "30d",
    60: "60d",
    120: "120d",
    252: "252d (1Y)"
  };

function xs() {
  const [t, o] = y.useState("pairwise"), [r, i] = y.useState("SPG:close"), [c, u] = y.useState(
      "MACRO:DGS10"), [s, a] = y.useState("returns"), [n, l] = y.useState("60"), [h, f] = y
    .useState(new Set([60, 252])), [d, x] = y.useState(() => new Set(Ie)), [m, j] = y.useState([
      "SPG:close", "O:close", "PLD:close", "PSA:close", "MACRO:DGS10", "MACRO:VIXCLS"
    ]), [g, k] = y.useState("returns"), [b, C] = y.useState("252"), [F, p] = y.useState(""), N = y
    .useCallback(v => {
      f(Y => {
        const B = new Set(Y);
        return B.has(v) ? B.delete(v) : B.add(v), B
      })
    }, []), {
      universeTickers: M,
      isFiltered: A,
      filteredCount: O,
      totalCount: T,
      filteredTickersList: L
    } = dt(), [E, X] = y.useState("returns"), [S, $] = y.useState("252"), [I, R] = y.useState(
      "close"), z = y.useCallback(() => ({
      activeTab: t,
      specA: r,
      specB: c,
      corrMode: s,
      corrWindow: n,
      matrixSpecs: m,
      matrixMode: g,
      matrixWindow: b,
      visibleWindows: Array.from(h),
      visibleCorrCharts: Array.from(d),
      uniMode: E,
      uniWindow: S,
      uniMetric: I
    }), [t, r, c, s, n, m, g, b, h, d, E, S, I]), re = y.useCallback((v, Y, B) => {
      i(v), u(Y), l(String(B)), o("pairwise")
    }, []), ue = y.useCallback(v => {
      if (v.activeTab !== void 0 && o(v.activeTab), v.specA !== void 0 && i(v.specA), v.specB !==
        void 0 && u(v.specB), v.corrMode !== void 0 && a(v.corrMode), v.corrWindow !== void 0 &&
        l(v.corrWindow), v.matrixSpecs !== void 0 && j(v.matrixSpecs), v.matrixMode !== void 0 &&
        k(v.matrixMode), v.matrixWindow !== void 0 && C(v.matrixWindow), v.visibleWindows !==
        void 0 && f(new Set(v.visibleWindows)), Array.isArray(v.visibleCorrCharts)) {
        const Y = v.visibleCorrCharts.filter(B => typeof B == "string" && Ie.includes(B));
        x(new Set(Y))
      }
      v.uniMode !== void 0 && X(v.uniMode), v.uniWindow !== void 0 && $(v.uniWindow), v
        .uniMetric !== void 0 && R(v.uniMetric)
    }, []), je = At();
  ut("correlation", z, ue, {
    universeSig: je,
    resultFields: ["specA", "specB", "matrixSpecs"]
  });
  const {
    data: K = []
  } = ce({
    queryKey: ["tickers-list"],
    queryFn: async () => {
      const {
        getTickers: v
      } = await Mt(async () => {
        const {
          getTickers: Y
        } = await import("./index-CsG73Aq_.js").then(B => B.eq);
        return {
          getTickers: Y
        }
      }, __vite__mapDeps([0, 1]), import.meta.url);
      return v()
    }
  }), {
    data: ae = []
  } = ce({
    queryKey: ["macro-catalog"],
    queryFn: Ft
  }), q = y.useMemo(() => A && M ? L.map(v => `${v.ticker}:${I}`) : K.map(v =>
    `${v.ticker}:${I}`), [M, A, L, K, I]), {
    data: J,
    isLoading: w
  } = ce({
    queryKey: ["correlation-pairwise", r, c, n, s],
    queryFn: () => Gt(r, c, parseInt(n) || 60, s),
    enabled: t === "pairwise" && !!r && !!c
  }), {
    data: V,
    isLoading: D
  } = ce({
    queryKey: ["correlation-matrix", m.join(","), g, b],
    queryFn: () => Ue(m, g, b),
    enabled: t === "matrix" && m.length >= 2
  }), {
    data: U,
    isLoading: Ne
  } = ce({
    queryKey: ["correlation-universe-matrix", q.join(","), E, S],
    queryFn: () => Ue(q, E, S),
    enabled: t === "universe" && q.length >= 2
  }), ye = y.useCallback(() => {
    if (!J) return;
    const v = "Date,Rolling_Correlation",
      Y = J.rolling.map(_ => `${_.time},${_.value}`),
      B = [v, ...Y].join(`
`),
      le = new Blob([B], {
        type: "text/csv"
      }),
      ne = URL.createObjectURL(le),
      H = document.createElement("a");
    H.href = ne, H.download = `correlation_${G(r)}_${G(c)}.csv`, H.click(), URL.revokeObjectURL(
      ne)
  }, [J, r, c]), at = y.useCallback(() => {
    if (!V) return;
    const v = V.labels.map(G),
      Y = `,${v.join(",")}`,
      B = V.matrix.map((Ce, we) => `${v[we]},${Ce.map(Se=>Se.toFixed(4)).join(",")}`),
      le = [Y, ...B].join(`
`),
      ne = new Blob([le], {
        type: "text/csv"
      }),
      H = URL.createObjectURL(ne),
      _ = document.createElement("a");
    _.href = H, _.download = "correlation_matrix.csv", _.click(), URL.revokeObjectURL(H)
  }, [V]), nt = y.useCallback(() => {
    if (!U) return;
    const v = U.labels.map(G),
      Y = `,${v.join(",")}`,
      B = U.matrix.map((Ce, we) => `${v[we]},${Ce.map(Se=>Se.toFixed(4)).join(",")}`),
      le = [Y, ...B].join(`
`),
      ne = new Blob([le], {
        type: "text/csv"
      }),
      H = URL.createObjectURL(ne),
      _ = document.createElement("a");
    _.href = H, _.download = "universe_correlation_matrix.csv", _.click(), URL.revokeObjectURL(
      H)
  }, [U]), ot = y.useCallback(v => {
    v && !m.includes(v) && j(Y => [...Y, v])
  }, [m]), it = y.useCallback(v => {
    j(Y => Y.filter(B => B !== v))
  }, []);
  return e.jsxs("div", {
    className: "flex h-full bg-background",
    "data-testid": "correlation-page",
    children: [e.jsxs("div", {
      className: "w-[250px] border-r border-border bg-card flex flex-col flex-shrink-0 overflow-y-auto",
      children: [e.jsx("div", {
        className: "px-2 py-2 border-b border-border",
        children: e.jsxs("div", {
          className: "grid grid-cols-2 gap-0.5",
          children: [e.jsxs(W, {
            variant: t === "pairwise" ? "default" : "secondary",
            size: "sm",
            className: "h-7 text-[10px] px-1.5 w-full",
            onClick: () => o("pairwise"),
            "data-testid": "tab-pairwise",
            children: [e.jsx(xt, {
              className: "w-3 h-3 mr-0.5"
            }), " Pair"]
          }), e.jsxs(W, {
            variant: t === "matrix" ? "default" : "secondary",
            size: "sm",
            className: "h-7 text-[10px] px-1.5 w-full",
            onClick: () => o("matrix"),
            "data-testid": "tab-matrix",
            children: [e.jsx(Ot, {
              className: "w-3 h-3 mr-0.5"
            }), " Matrix"]
          }), e.jsxs(W, {
            variant: t === "universe" ? "default" : "secondary",
            size: "sm",
            className: "h-7 text-[10px] px-1.5 w-full",
            onClick: () => o("universe"),
            "data-testid": "tab-universe-corr",
            children: [e.jsx(ht, {
              className: "w-3 h-3 mr-0.5"
            }), " Univ"]
          }), e.jsxs(W, {
            variant: t === "drivers" ? "default" : "secondary",
            size: "sm",
            className: "h-7 text-[10px] px-1.5 w-full",
            onClick: () => o("drivers"),
            "data-testid": "tab-drivers",
            children: [e.jsx(mt, {
              className: "w-3 h-3 mr-0.5"
            }), " Drivers"]
          })]
        })
      }), t === "drivers" ? e.jsxs("div", {
        className: "p-3 flex-1 overflow-y-auto space-y-3",
        children: [e.jsx("div", {
          className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
          children: "Auto Driver Scan"
        }), e.jsx("div", {
          className: "text-[11px] text-muted-foreground leading-relaxed",
          children: "Pick a ticker, select a target, and click Run Driver Scan in the main panel."
        }), e.jsxs("div", {
          className: "border border-border/20 rounded p-2 bg-card/20 text-[10px] text-muted-foreground space-y-1",
          children: [e.jsx("div", {
            className: "font-semibold text-foreground/70",
            children: "Scan details"
          }), e.jsx("div", {
            children: "Windows: 30 / 60 / 120 / 252 / 504 / 756d"
          }), e.jsx("div", {
            children: "Lags: ±1, ±5, ±10, ±30, ±60d"
          }), e.jsx("div", {
            children: "~200 factors × 6 windows × 11 lags"
          })]
        })]
      }) : t === "pairwise" ? e.jsxs("div", {
        className: "p-3 space-y-3 flex-1 overflow-y-auto",
        children: [e.jsx(Me, {
          label: "Series A",
          value: r,
          onChange: i,
          tickers: K,
          macroCatalog: ae,
          testId: "corr-series-a"
        }), e.jsx(Me, {
          label: "Series B",
          value: c,
          onChange: u,
          tickers: K,
          macroCatalog: ae,
          testId: "corr-series-b"
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
            children: "Correlation Mode"
          }), e.jsxs(Q, {
            value: s,
            onValueChange: a,
            children: [e.jsx(Z, {
              className: "h-6 text-[11px]",
              "data-testid": "corr-mode",
              children: e.jsx(ee, {})
            }), e.jsxs(te, {
              children: [e.jsx(P, {
                value: "returns",
                children: "Log Returns"
              }), e.jsx(P, {
                value: "changes",
                children: "Simple Changes"
              }), e.jsx(P, {
                value: "levels",
                children: "Levels"
              })]
            })]
          })]
        }), e.jsxs("div", {
          className: "space-y-1.5",
          children: [e.jsx("div", {
            className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
            children: "Rolling Windows"
          }), ts.map(v => e.jsxs("label", {
            className: "flex items-center gap-2 cursor-pointer group",
            children: [e.jsx(pt, {
              checked: h.has(v),
              onCheckedChange: () => N(v),
              className: "h-3.5 w-3.5",
              "data-testid": `corr-window-${v}`
            }), e.jsxs("span", {
              className: "flex items-center gap-1.5 text-[11px]",
              children: [e.jsx("span", {
                className: "w-2.5 h-2.5 rounded-full flex-shrink-0",
                style: {
                  backgroundColor: de[v]
                }
              }), ss[v]]
            })]
          }, v))]
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
            children: "Quick Pairs"
          }), e.jsx("div", {
            className: "flex flex-wrap gap-1",
            children: [{
              label: "SPG vs 10Y",
              a: "SPG:close",
              b: "MACRO:DGS10"
            }, {
              label: "O vs Mtg30",
              a: "O:close",
              b: "MACRO:MORTGAGE30US"
            }, {
              label: "PLD vs VIX",
              a: "PLD:close",
              b: "MACRO:VIXCLS"
            }, {
              label: "SPG vs O",
              a: "SPG:close",
              b: "O:close"
            }, {
              label: "EQR vs Starts",
              a: "EQR:close",
              b: "MACRO:HOUST5F"
            }, {
              label: "PSA vs CPI",
              a: "PSA:close",
              b: "MACRO:CPIAUCSL"
            }].map(v => e.jsx(W, {
              variant: "ghost",
              size: "sm",
              className: "h-5 px-2 text-[10px]",
              onClick: () => {
                i(v.a), u(v.b)
              },
              children: v.label
            }, v.label))
          })]
        }), e.jsxs(W, {
          variant: "outline",
          size: "sm",
          className: "w-full h-7 text-xs gap-1.5",
          onClick: ye,
          disabled: !J,
          children: [e.jsx(me, {
            className: "w-3 h-3"
          }), " Export CSV"]
        })]
      }) : t === "matrix" ? e.jsxs("div", {
        className: "p-3 space-y-3 flex-1 overflow-y-auto",
        children: [e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsxs("div", {
            className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
            children: ["Matrix Series (", m.length, ")"]
          }), e.jsx("div", {
            className: "space-y-0.5 max-h-[200px] overflow-y-auto",
            children: m.map(v => e.jsxs("div", {
              className: "flex items-center gap-1 px-1 py-0.5 rounded text-[11px] hover:bg-accent group",
              children: [e.jsx("span", {
                className: "truncate flex-1 font-mono",
                children: G(v)
              }), e.jsx("button", {
                className: "opacity-0 group-hover:opacity-100 p-0.5 text-destructive",
                onClick: () => it(v),
                children: "×"
              })]
            }, v))
          })]
        }), e.jsx(Me, {
          label: "Add Series",
          value: F,
          onChange: v => {
            ot(v), p("")
          },
          tickers: K,
          macroCatalog: ae,
          testId: "matrix-add-series"
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
            children: "Presets"
          }), e.jsx("div", {
            className: "flex flex-wrap gap-1",
            children: [{
              label: "REITs + Rates",
              specs: ["SPG:close", "O:close", "PLD:close",
                "PSA:close", "MACRO:DGS10", "MACRO:DGS2",
                "MACRO:MORTGAGE30US"
              ]
            }, {
              label: "REITs + Housing",
              specs: ["EQR:close", "AVB:close", "MAA:close",
                "CPT:close", "MACRO:HOUST5F", "MACRO:PERMIT5",
                "MACRO:COMPU"
              ]
            }, {
              label: "REITs + Macro",
              specs: ["SPG:close", "O:close", "PLD:close",
                "MACRO:DGS10", "MACRO:VIXCLS", "MACRO:CPIAUCSL",
                "MACRO:UNRATE"
              ]
            }, {
              label: "Net Lease",
              specs: ["O:close", "NNN:close", "EPRT:close",
                "ADC:close", "MACRO:DGS10"
              ]
            }].map(v => e.jsx(W, {
              variant: "ghost",
              size: "sm",
              className: "h-5 px-2 text-[10px]",
              onClick: () => j(v.specs),
              children: v.label
            }, v.label))
          })]
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
            children: "Mode"
          }), e.jsxs(Q, {
            value: g,
            onValueChange: k,
            children: [e.jsx(Z, {
              className: "h-6 text-[11px]",
              children: e.jsx(ee, {})
            }), e.jsxs(te, {
              children: [e.jsx(P, {
                value: "returns",
                children: "Log Returns"
              }), e.jsx(P, {
                value: "changes",
                children: "Simple Changes"
              }), e.jsx(P, {
                value: "levels",
                children: "Levels"
              })]
            })]
          })]
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
            children: "Lookback"
          }), e.jsxs(Q, {
            value: b,
            onValueChange: C,
            children: [e.jsx(Z, {
              className: "h-6 text-[11px]",
              children: e.jsx(ee, {})
            }), e.jsxs(te, {
              children: [e.jsx(P, {
                value: "60",
                children: "60 days"
              }), e.jsx(P, {
                value: "120",
                children: "120 days"
              }), e.jsx(P, {
                value: "252",
                children: "252 days (1Y)"
              }), e.jsx(P, {
                value: "504",
                children: "504 days (2Y)"
              }), e.jsx(P, {
                value: "1260",
                children: "1260 days (5Y)"
              })]
            })]
          })]
        }), e.jsxs(W, {
          variant: "outline",
          size: "sm",
          className: "w-full h-7 text-xs gap-1.5",
          onClick: at,
          disabled: !V,
          children: [e.jsx(me, {
            className: "w-3 h-3"
          }), " Export CSV"]
        })]
      }) : e.jsxs("div", {
        className: "p-3 space-y-3 flex-1 overflow-y-auto",
        children: [e.jsxs("div", {
          className: "border border-border/30 rounded p-2 bg-card/30",
          children: [e.jsx("div", {
            className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-1",
            children: "Universe"
          }), e.jsxs("div", {
            className: "text-sm font-mono font-bold text-primary",
            children: [A ? O : T, " tickers"]
          }), e.jsx("div", {
            className: "text-[10px] text-muted-foreground",
            children: A ? `Filtered from ${T} total` :
              "All tickers (no filter)"
          })]
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
            children: "Metric"
          }), e.jsxs(Q, {
            value: I,
            onValueChange: R,
            children: [e.jsx(Z, {
              className: "h-6 text-[11px]",
              "data-testid": "uni-corr-metric",
              children: e.jsx(ee, {})
            }), e.jsxs(te, {
              children: [e.jsx(P, {
                value: "close",
                children: "Close Price"
              }), e.jsx(P, {
                value: "Dividend Yield",
                children: "Div Yield"
              }), e.jsx(P, {
                value: "P/FFO FY2",
                children: "P/FFO FY2"
              }), e.jsx(P, {
                value: "P/AFFO FY2",
                children: "P/AFFO FY2"
              }), e.jsx(P, {
                value: "FFO Yield FY2",
                children: "FFO Yield FY2"
              })]
            })]
          })]
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
            children: "Mode"
          }), e.jsxs(Q, {
            value: E,
            onValueChange: X,
            children: [e.jsx(Z, {
              className: "h-6 text-[11px]",
              "data-testid": "uni-corr-mode",
              children: e.jsx(ee, {})
            }), e.jsxs(te, {
              children: [e.jsx(P, {
                value: "returns",
                children: "Log Returns"
              }), e.jsx(P, {
                value: "changes",
                children: "Simple Changes"
              }), e.jsx(P, {
                value: "levels",
                children: "Levels"
              })]
            })]
          })]
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
            children: "Lookback"
          }), e.jsxs(Q, {
            value: S,
            onValueChange: $,
            children: [e.jsx(Z, {
              className: "h-6 text-[11px]",
              "data-testid": "uni-corr-window",
              children: e.jsx(ee, {})
            }), e.jsxs(te, {
              children: [e.jsx(P, {
                value: "30",
                children: "30 days"
              }), e.jsx(P, {
                value: "60",
                children: "60 days"
              }), e.jsx(P, {
                value: "120",
                children: "120 days"
              }), e.jsx(P, {
                value: "252",
                children: "252 days (1Y)"
              }), e.jsx(P, {
                value: "504",
                children: "504 days (2Y)"
              }), e.jsx(P, {
                value: "1260",
                children: "1260 days (5Y)"
              })]
            })]
          })]
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsxs("div", {
            className: "text-[10px] uppercase font-semibold text-muted-foreground tracking-wider",
            children: ["Tickers (", q.length, ")"]
          }), e.jsx("div", {
            className: "space-y-0 max-h-[300px] overflow-y-auto border border-border/20 rounded",
            children: q.map(v => e.jsx("div", {
              className: "px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-accent/30 border-b border-border/10 last:border-b-0",
              children: G(v)
            }, v))
          })]
        }), e.jsxs(W, {
          variant: "outline",
          size: "sm",
          className: "w-full h-7 text-xs gap-1.5",
          onClick: nt,
          disabled: !U,
          children: [e.jsx(me, {
            className: "w-3 h-3"
          }), " Export CSV"]
        })]
      })]
    }), e.jsx("div", {
      className: "flex-1 flex flex-col overflow-hidden min-h-0",
      children: t === "drivers" ? e.jsx(Ht, {
        tickers: K,
        onPin: re
      }) : t === "pairwise" ? e.jsx(as, {
        data: J,
        loading: w,
        specA: r,
        specB: c,
        mode: s,
        visibleWindows: h,
        visibleCharts: d,
        setVisibleCharts: x
      }) : t === "matrix" ? e.jsx(ns, {
        data: V,
        loading: D
      }) : e.jsx(os, {
        data: U,
        loading: Ne,
        tickerCount: q.length
      })
    })]
  })
}

function rs({
  mode: t
}) {
  const [o, r] = y.useState(!1);
  return e.jsxs("div", {
    className: "border border-border/30 rounded bg-card/20",
    children: [e.jsxs("button", {
      className: "w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/30 transition-colors",
      onClick: () => r(!o),
      "data-testid": "methodology-toggle",
      children: [o ? e.jsx(jt, {
        className: "w-3 h-3 text-muted-foreground"
      }) : e.jsx(Nt, {
        className: "w-3 h-3 text-muted-foreground"
      }), e.jsx("span", {
        className: "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
        children: "Methodology & Interpretation Guide"
      })]
    }), o && e.jsx("div", {
      className: "px-3 pb-3 space-y-3 text-[11px] text-muted-foreground leading-relaxed",
      children: e.jsxs("div", {
        className: "grid grid-cols-1 md:grid-cols-2 gap-3",
        children: [e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] font-semibold text-foreground/80",
            children: "Pearson vs Spearman"
          }), e.jsx("div", {
            children: "Pearson measures linear association between two series. Spearman uses rank ordering, making it robust to outliers and nonlinearity. If they diverge by more than ~0.15, the relationship may be driven by a few extreme observations or be nonlinear."
          })]
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] font-semibold text-foreground/80",
            children: "Fisher-Transform Confidence Intervals"
          }), e.jsx("div", {
            children: "The dashed lines on the rolling correlation chart show the 95% confidence interval using the Fisher z-transformation. Narrow bands indicate a precise estimate; wide bands suggest the window may be too short or the relationship too noisy to trust."
          })]
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] font-semibold text-foreground/80",
            children: "ADF Stationarity Test"
          }), e.jsx("div", {
            children: "The Augmented Dickey-Fuller test checks whether each series has a unit root (non-stationary). Correlating two non-stationary series in levels often produces spurious results. If both series are non-stationary, use Log Returns mode or check for cointegration."
          })]
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] font-semibold text-foreground/80",
            children: "Engle-Granger Cointegration"
          }), e.jsx("div", {
            children: "Even if two series are individually non-stationary, they may share a long-run equilibrium (cointegrated). The EG test runs an ADF test on OLS residuals. If cointegrated (p<0.05), the level relationship is meaningful and the spread is mean-reverting — useful for pairs trading."
          })]
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] font-semibold text-foreground/80",
            children: "Rolling Beta"
          }), e.jsx("div", {
            children: "Rolling OLS slope of series A on series B, using the same window as the rolling correlation. A stable beta suggests a consistent linear relationship; a drifting beta indicates the sensitivity of A to B is changing over time, which matters for hedge ratios."
          })]
        }), e.jsxs("div", {
          className: "space-y-1",
          children: [e.jsx("div", {
            className: "text-[10px] font-semibold text-foreground/80",
            children: "When to Use Which Mode"
          }), e.jsxs("div", {
            children: [t === "levels" ? e.jsxs(e.Fragment, {
                children: [e.jsx("strong", {
                    children: "Levels mode (current):"
                  }),
                  " Best for identifying cointegrated pairs or long-run equilibrium relationships. Watch out for spurious correlation if series are non-stationary and not cointegrated. "
                ]
              }) : e.jsxs(e.Fragment, {
                children: [e.jsx("strong", {
                    children: "Log Returns mode (current):"
                  }),
                  " Removes trend and makes series stationary. The standard choice for measuring co-movement and beta estimation. Pearson and Spearman should be compared here. "
                ]
              }),
              "Cross-correlation lags show lead/lag relationships. ACF plots reveal serial dependence — high AC(1) inflates correlation significance, which is why Effective N adjusts downward."
            ]
          })]
        })]
      })
    })]
  })
}

function as({
  data: t,
  loading: o,
  specA: r,
  specB: i,
  mode: c,
  visibleWindows: u,
  visibleCharts: s,
  setVisibleCharts: a
}) {
  const [n, l] = y.useState(null);
  if (o) return e.jsx("div", {
    className: "flex items-center justify-center h-full text-muted-foreground text-sm",
    children: "Computing correlation..."
  });
  if (!t || t.error) return e.jsx("div", {
    className: "flex items-center justify-center h-full text-muted-foreground text-sm",
    children: t?.error || "Select two series to analyze"
  });
  const h = t.summary,
    f = G(r),
    d = G(i);
  return e.jsxs("div", {
    className: "flex-1 overflow-y-auto p-3 space-y-3",
    children: [e.jsx("div", {
      className: "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-2",
      children: [{
        label: "Pearson ρ",
        value: h.correlation.toFixed(4),
        color: be(h.correlation),
        sub: t.diagnostics?.fisherCI ?
          `95% CI [${t.diagnostics.fisherCI.lower.toFixed(3)}, ${t.diagnostics.fisherCI.upper.toFixed(3)}]` :
          void 0
      }, {
        label: "Spearman ρₛ",
        value: (h.spearmanCorrelation ?? 0).toFixed(4),
        color: be(h.spearmanCorrelation ?? 0)
      }, {
        label: "R²",
        value: h.rSquared.toFixed(4),
        color: "#94a3b8"
      }, {
        label: "Beta (β)",
        value: h.beta.toFixed(4),
        color: "#94a3b8"
      }, {
        label: "Observations",
        value: String(h.observations),
        color: "#94a3b8"
      }, {
        label: "Eff. N*",
        value: String(h.effectiveN),
        color: h.effectiveN < h.observations * .5 ? "#ef4444" : "#94a3b8"
      }, {
        label: "t-Stat",
        value: h.tStat.toFixed(3),
        color: "#94a3b8"
      }, {
        label: "p-Value",
        value: h.pValue < .001 ? "<0.001" : h.pValue.toFixed(4),
        color: h.pValue < .05 ? "#22c55e" : "#ef4444"
      }, ...t.diagnostics?.cointegration ? [{
        label: "Coint. (EG)",
        value: t.diagnostics.cointegration.isCointegrated ? "Yes" : "No",
        color: t.diagnostics.cointegration.isCointegrated ? "#22c55e" : "#94a3b8",
        sub: `ADF=${t.diagnostics.cointegration.stat.toFixed(2)}, p=${t.diagnostics.cointegration.pValue<.001?"<.001":t.diagnostics.cointegration.pValue.toFixed(3)}`
      }] : []].map(x => e.jsxs("div", {
        className: "border border-border/30 rounded p-2 bg-card/30",
        children: [e.jsx("div", {
          className: "text-[9px] uppercase font-semibold text-muted-foreground tracking-wider",
          children: x.label
        }), e.jsx("div", {
          className: "text-sm font-mono font-bold",
          style: {
            color: x.color
          },
          children: x.value
        }), x.sub && e.jsx("div", {
          className: "text-[8px] font-mono text-muted-foreground/60 mt-0.5",
          children: x.sub
        })]
      }, x.label))
    }), t.diagnostics && (() => {
      const x = t.diagnostics,
        m = [];
      return (Math.abs(h.autoCorrelationA) > .3 || Math.abs(h.autoCorrelationB) > .3) && m
        .push(
          `High autocorrelation: ${f} AC(1)=${h.autoCorrelationA.toFixed(3)}, ${d} AC(1)=${h.autoCorrelationB.toFixed(3)}. Effective N reduced to ${h.effectiveN}.`
          ), c === "levels" && x.adfA && !x.adfA.isStationary && m.push(
          `${f} is non-stationary (ADF=${x.adfA.stat.toFixed(2)}, p=${x.adfA.pValue.toFixed(3)}). Level correlation may be spurious.`
          ), c === "levels" && x.adfB && !x.adfB.isStationary && m.push(
          `${d} is non-stationary (ADF=${x.adfB.stat.toFixed(2)}, p=${x.adfB.pValue.toFixed(3)}). Level correlation may be spurious.`
          ), c === "levels" && x.cointegration && !x.cointegration.isCointegrated && x
        .adfA && !x.adfA.isStationary && m.push(
          `No cointegration detected (EG stat=${x.cointegration.stat.toFixed(2)}, p=${x.cointegration.pValue.toFixed(3)}). The level relationship may not represent a stable equilibrium. Consider using Log Returns mode.`
          ), c === "levels" && x.cointegration?.isCointegrated && m.push(
          `Cointegrated pair (EG p=${x.cointegration.pValue.toFixed(3)}). The spread is mean-reverting — pair/equilibrium analysis is valid.`
          ), c === "returns" && Math.abs(h.correlation - (h.spearmanCorrelation ?? 0)) >
        .15 && m.push(
          `Pearson (${h.correlation.toFixed(3)}) and Spearman (${(h.spearmanCorrelation??0).toFixed(3)}) diverge, suggesting nonlinear or outlier-driven relationship.`
          ), m.length === 0 ? null : e.jsx("div", {
          className: "border border-amber-500/30 bg-amber-500/5 rounded p-2 space-y-1",
          children: m.map((j, g) => e.jsx("div", {
            className: "text-[11px] text-amber-400",
            children: j
          }, g))
        })
    })(), e.jsx(rs, {
      mode: c
    }), !n && e.jsxs("div", {
      className: "flex items-center gap-1.5 flex-wrap",
      "data-testid": "corr-chart-toggles",
      children: [e.jsxs("span", {
        className: "flex items-center gap-1 text-[9px] font-mono text-muted-foreground uppercase tracking-wider mr-1",
        children: [e.jsx(bt, {
          className: "w-3 h-3"
        }), " Charts"]
      }), Ie.map(x => {
        const m = s.has(x);
        return e.jsx("button", {
          onClick: () => {
            a(j => {
              const g = new Set(j);
              return g.has(x) ? g.delete(x) : g.add(x), g
            })
          },
          className: `text-[10px] font-mono px-2 py-1 border rounded transition-colors ${m?"border-amber-500 bg-amber-500/15 text-amber-300":"border-border hover:bg-accent text-muted-foreground hover:text-foreground"}`,
          "data-testid": `toggle-corr-chart-${x}`,
          title: `Show/hide ${ze[x]} chart`,
          children: ze[x]
        }, x)
      })]
    }), e.jsxs("div", {
      className: `grid gap-3 ${n?"":"grid-cols-1 lg:grid-cols-2"}`,
      children: [s.has("levels") && (!n || n === "levels") && e.jsx(ke, {
        data: t.levelsA,
        color: se.primary,
        height: 350,
        title: `${f} vs ${d} (Levels)`,
        secondData: t.levelsB,
        secondColor: se.secondary,
        chartId: "levels",
        isMaximized: n === "levels",
        onMaximize: l
      }), s.has("rolling") && t.multiWindowRolling && u.size > 0 && (!n || n ===
        "rolling") && (() => {
        const x = Array.from(u).sort((p, N) => p - N),
          [m, j, g, k] = x,
          b = x.map(p => `${p}d`).join(" / "),
          C = t.rollingCI?.map(p => ({
            time: p.time,
            value: p.upper
          })),
          F = t.rollingCI?.map(p => ({
            time: p.time,
            value: p.lower
          }));
        return e.jsx(ke, {
          data: t.multiWindowRolling[m] || [],
          color: de[m],
          height: 350,
          title: `Rolling Correlation (${b})`,
          showZeroLine: !0,
          secondData: j !== void 0 ? t.multiWindowRolling[j] || [] : void 0,
          secondColor: j !== void 0 ? de[j] : void 0,
          thirdData: g !== void 0 ? t.multiWindowRolling[g] || [] : void 0,
          thirdColor: g !== void 0 ? de[g] : void 0,
          fourthData: k !== void 0 ? t.multiWindowRolling[k] || [] : void 0,
          fourthColor: k !== void 0 ? de[k] : void 0,
          bandUpper: C,
          bandLower: F,
          bandColor: "rgba(100,180,255,0.3)",
          chartId: "rolling",
          isMaximized: n === "rolling",
          onMaximize: l
        })
      })(), s.has("rollingBeta") && t.rollingBeta && t.rollingBeta.length > 0 && (!
        n || n === "rollingBeta") && e.jsx(ke, {
        data: t.rollingBeta,
        color: "#ec4899",
        height: 280,
        title: `Rolling Beta: ${f} vs ${d}`,
        showZeroLine: !0,
        chartId: "rollingBeta",
        isMaximized: n === "rollingBeta",
        onMaximize: l
      }), s.has("scatter") && (!n || n === "scatter") && e.jsx(he, {
        title: `Scatter: ${f} vs ${d}`,
        chartId: "scatter",
        isMaximized: n === "scatter",
        onMaximize: l,
        height: 350,
        children: x => e.jsx(es, {
          data: t.scatter,
          labelX: d,
          labelY: f,
          beta: h.beta,
          alpha: h.alpha,
          height: x,
          hideTitle: !0
        })
      }), s.has("crossCorr") && (!n || n === "crossCorr") && e.jsx(he, {
        title: `Cross-Correlation (Lag ${t.crossCorrelation[0]?.lag} to ${t.crossCorrelation[t.crossCorrelation.length-1]?.lag})`,
        chartId: "crossCorr",
        isMaximized: n === "crossCorr",
        onMaximize: l,
        height: 280,
        children: x => e.jsx(Zt, {
          data: t.crossCorrelation,
          labelA: f,
          labelB: d,
          height: x,
          hideTitle: !0
        })
      }), s.has("acf") && !n && e.jsxs("div", {
        className: "grid grid-cols-2 gap-3",
        children: [e.jsx(xe, {
          data: t.acfA,
          nObs: h.observations,
          title: `ACF: ${f}`,
          height: 200
        }), e.jsx(xe, {
          data: t.acfB,
          nObs: h.observations,
          title: `ACF: ${d}`,
          height: 200
        })]
      }), n === "acfA" && e.jsx(he, {
        title: `ACF: ${f}`,
        chartId: "acfA",
        isMaximized: !0,
        onMaximize: l,
        height: 200,
        children: x => e.jsx(xe, {
          data: t.acfA,
          nObs: h.observations,
          title: `ACF: ${f}`,
          height: x
        })
      }), n === "acfB" && e.jsx(he, {
        title: `ACF: ${d}`,
        chartId: "acfB",
        isMaximized: !0,
        onMaximize: l,
        height: 200,
        children: x => e.jsx(xe, {
          data: t.acfB,
          nObs: h.observations,
          title: `ACF: ${d}`,
          height: x
        })
      })]
    })]
  })
}

function ns({
  data: t,
  loading: o
}) {
  return o ? e.jsx("div", {
    className: "flex items-center justify-center h-full text-muted-foreground text-sm",
    children: "Computing correlation matrix..."
  }) : t ? e.jsxs("div", {
    className: "flex-1 overflow-auto p-3 space-y-3",
    children: [e.jsxs("div", {
      className: "flex items-center gap-3 text-[11px] text-muted-foreground",
      children: [e.jsxs("span", {
        children: [t.observations, " obs"]
      }), e.jsx("span", {
        children: "·"
      }), e.jsxs("span", {
        children: [t.dateRange.from, " to ", t.dateRange.to]
      }), e.jsx("span", {
        children: "·"
      }), e.jsxs("span", {
        children: [t.mode, " mode"]
      }), e.jsx("span", {
        children: "·"
      }), e.jsxs("span", {
        className: "text-[9px]",
        children: [e.jsx("span", {
          className: "inline-block w-2 h-2 rounded-full bg-green-500 mr-1"
        }), "+corr", e.jsx("span", {
          className: "inline-block w-2 h-2 rounded-full bg-red-500 mx-1 ml-2"
        }), "−corr", e.jsx("span", {
          className: "text-muted-foreground/40 ml-2",
          children: "ns = not significant (p>0.05)"
        })]
      })]
    }), e.jsx(rt, {
      matrix: t.matrix,
      labels: t.labels,
      pValues: t.pValues
    }), e.jsxs("div", {
      className: "grid grid-cols-2 gap-3",
      children: [e.jsx(ve, {
        matrix: t.matrix,
        labels: t.labels,
        type: "positive"
      }), e.jsx(ve, {
        matrix: t.matrix,
        labels: t.labels,
        type: "negative"
      })]
    })]
  }) : e.jsx("div", {
    className: "flex items-center justify-center h-full text-muted-foreground text-sm",
    children: "Add at least 2 series to generate a matrix"
  })
}

function os({
  data: t,
  loading: o,
  tickerCount: r
}) {
  return o ? e.jsxs("div", {
    className: "flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-sm",
    children: [e.jsx(vt, {
      className: "w-5 h-5 animate-spin"
    }), "Computing ", r, "×", r, " correlation matrix..."]
  }) : t ? e.jsxs("div", {
    className: "flex-1 overflow-auto p-3 space-y-3",
    children: [e.jsxs("div", {
      className: "flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap",
      children: [e.jsxs("span", {
        className: "font-semibold text-foreground",
        children: [t.labels.length, "×", t.labels.length, " matrix"]
      }), e.jsx("span", {
        children: "·"
      }), e.jsxs("span", {
        children: [t.observations, " obs"]
      }), e.jsx("span", {
        children: "·"
      }), e.jsxs("span", {
        children: [t.dateRange.from, " to ", t.dateRange.to]
      }), e.jsx("span", {
        children: "·"
      }), e.jsx("span", {
        children: t.mode === "returns" ? "Log Returns" : t.mode === "changes" ?
          "Simple Changes" : "Levels"
      }), e.jsx("span", {
        children: "·"
      }), e.jsxs("span", {
        className: "text-[9px]",
        children: [e.jsx("span", {
          className: "inline-block w-2 h-2 rounded-full bg-green-500 mr-1"
        }), "+corr", e.jsx("span", {
          className: "inline-block w-2 h-2 rounded-full bg-red-500 mx-1 ml-2"
        }), "−corr", e.jsx("span", {
          className: "text-muted-foreground/40 ml-2",
          children: "ns = not significant (p>0.05)"
        })]
      })]
    }), e.jsx(rt, {
      matrix: t.matrix,
      labels: t.labels,
      pValues: t.pValues
    }), e.jsxs("div", {
      className: "grid grid-cols-2 gap-3",
      children: [e.jsx(ve, {
        matrix: t.matrix,
        labels: t.labels,
        type: "positive"
      }), e.jsx(ve, {
        matrix: t.matrix,
        labels: t.labels,
        type: "negative"
      })]
    })]
  }) : e.jsx("div", {
    className: "flex items-center justify-center h-full text-muted-foreground text-sm",
    children: r < 2 ? "Need at least 2 tickers — apply a Universe filter or load data" :
      "Loading..."
  })
}

function ve({
  matrix: t,
  labels: o,
  type: r
}) {
  const i = y.useMemo(() => {
    const c = [];
    for (let u = 0; u < o.length; u++)
      for (let s = u + 1; s < o.length; s++) c.push({
        a: o[u],
        b: o[s],
        corr: t[u][s]
      });
    return r === "positive" ? c.sort((u, s) => s.corr - u.corr).slice(0, 10) : c.sort((u, s) =>
      u.corr - s.corr).slice(0, 10)
  }, [t, o, r]);
  return e.jsxs("div", {
    className: "border border-border/30 rounded p-2",
    children: [e.jsxs("div", {
      className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1",
      children: [r === "positive" ? "Highest Positive" : "Most Negative", " Correlations"]
    }), e.jsx("div", {
      className: "space-y-0.5",
      children: i.map((c, u) => e.jsxs("div", {
        className: "flex items-center gap-2 text-[11px] font-mono",
        children: [e.jsx("span", {
          style: {
            color: be(c.corr)
          },
          className: "font-bold w-12 text-right",
          children: c.corr.toFixed(3)
        }), e.jsxs("span", {
          className: "text-muted-foreground truncate",
          children: [G(c.a), " × ", G(c.b)]
        })]
      }, u))
    })]
  })
}
export {
  xs as
  default
};