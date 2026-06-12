import {
  c as Ns,
  r as n,
  dU as tt,
  aj as Ws,
  g as Ys,
  af as zs,
  dS as _s,
  dV as kr,
  dW as Hs,
  dX as qs,
  dY as ds,
  dZ as ye,
  d_ as rt,
  d$ as rr,
  a3 as We,
  b5 as Us,
  aF as st,
  aG as nt,
  aH as at,
  aI as ot,
  bo as Sr,
  aJ as Ut,
  e0 as us,
  e1 as Ks,
  e2 as Zs,
  bt as Xs,
  e3 as Qs,
  e4 as ms,
  j as t,
  di as Mr,
  bd as Js,
  z as en,
  b7 as tn,
  X as ps,
  c5 as rn,
  e5 as sn,
  Y as nn
} from "./index-CsG73Aq_.js";
import {
  u as an
} from "./universeSignature-DAAu9BGh.js";
import {
  u as on
} from "./universeDefaults-D3Fnb4CP.js";
import {
  C as fs
} from "./calendar-Tn9h7olV.js";
import {
  T as ln
} from "./trending-down-26dsT41Y.js";
const cn = Ns("MapPin", [
  ["path", {
    d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
    key: "1r0f0z"
  }],
  ["circle", {
    cx: "12",
    cy: "10",
    r: "3",
    key: "ilqhr7"
  }]
]);
const sr = Ns("Settings2", [
    ["path", {
      d: "M20 7h-9",
      key: "3s1dr2"
    }],
    ["path", {
      d: "M14 17H5",
      key: "gfn3mx"
    }],
    ["circle", {
      cx: "17",
      cy: "17",
      r: "3",
      key: "18b49y"
    }],
    ["circle", {
      cx: "7",
      cy: "7",
      r: "3",
      key: "dfmy0x"
    }]
  ]),
  dn = [{
    id: "P/FFO FY2",
    label: "P/FFO FY2"
  }, {
    id: "P/FFO LTM",
    label: "P/FFO LTM"
  }, {
    id: "P/AFFO FY2",
    label: "P/AFFO FY2"
  }, {
    id: "EV/EBITDA FY2",
    label: "EV/EBITDA FY2"
  }, {
    id: "EV/EBITDA LTM",
    label: "EV/EBITDA LTM"
  }, {
    id: "P/E FY2",
    label: "P/E FY2"
  }, {
    id: "P/E LTM",
    label: "P/E LTM"
  }, {
    id: "P/S FY2",
    label: "P/S FY2"
  }, {
    id: "P/S LTM",
    label: "P/S LTM"
  }, {
    id: "Dividend Yield",
    label: "Dividend Yield"
  }, {
    id: "FFO Yield FY2",
    label: "FFO Yield FY2"
  }, {
    id: "AFFO Yield FY2",
    label: "AFFO Yield FY2"
  }],
  un = [{
    id: "FY1 EPS Growth",
    label: "FY1 EPS Growth"
  }, {
    id: "FY2 EPS Growth",
    label: "FY2 EPS Growth"
  }, {
    id: "FY1 FFO Growth",
    label: "FY1 FFO Growth"
  }, {
    id: "FY2 FFO Growth",
    label: "FY2 FFO Growth"
  }, {
    id: "FY2 AFFO Growth",
    label: "FY2 AFFO Growth"
  }, {
    id: "EBITDA Fwd Growth%",
    label: "EBITDA Fwd Growth (FY1/LTM)"
  }, {
    id: "EBITDA FY2 Growth%",
    label: "EBITDA FY2 Growth (FY2/FY1)"
  }, {
    id: "Sales LTM YoY%",
    label: "Sales LTM YoY %"
  }],
  At = {
    economy: "Economy",
    sector: "Sector",
    subsector: "Subsector",
    industryGroup: "Industry Group",
    industry: "Industry",
    subindustry: "Subindustry"
  },
  hs = ["premium", "growth", "ratio", "rollCorr", "relReturn", "relRatio", "rawRatio",
    "rvVerdictTs", "similar"
  ],
  xs = {
    premium: "Premium",
    growth: "Growth Diff",
    ratio: "Prem ÷ Δg",
    rollCorr: "Rolling Corr",
    relReturn: "Rel Return",
    relRatio: "Rel Strength",
    rawRatio: "A / B Ratio",
    rvVerdictTs: "RV Verdict",
    similar: "Similar Setups"
  },
  it = "transparent",
  lt = "rgba(255,255,255,0.55)",
  $ = "rgba(255,255,255,0.05)",
  gs = "rgba(245,158,11,0.95)",
  Dt = "rgba(255,255,255,0.35)";

function bs(j, A = 1) {
  return Number.isFinite(j) ? `${j>0?"+":""}${j.toFixed(A)}%` : "—"
}

function Rr(j, A = 2) {
  return Number.isFinite(j) ? j.toFixed(A) : "—"
}

function ct(j) {
  return j.map(A => ({
    time: A.time,
    value: A.value
  }))
}

function vs(j) {
  const A = (j || "").trim();
  if (!A) return null;
  if (/^\d{4}$/.test(A)) return x => x.startsWith(A);
  if (/^\d{4}-\d{2}$/.test(A)) return x => x.startsWith(A);
  const le = A.match(/^(\d{4})-Q([1-4])$/i);
  if (le) {
    const x = le[1],
      ae = parseInt(le[2], 10),
      U = String((ae - 1) * 3 + 1).padStart(2, "0"),
      Tt = String((ae - 1) * 3 + 3).padStart(2, "0"),
      Be = `${x}-${U}`,
      Ye = `${x}-${Tt}`;
    return ze => {
      const Et = ze.slice(0, 7);
      return Et >= Be && Et <= Ye
    }
  }
  const fe = A.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
  if (fe) {
    let x = fe[1],
      ae = fe[2];
    if (x > ae) {
      const U = x;
      x = ae, ae = U
    }
    return U => U >= x && U <= ae
  }
  return null
}

function gn() {
  const [j, A] = n.useState([]), [le, fe] = n.useState(!0), [x, ae] = n.useState(""), [U, Tt] = n
    .useState("subindustry"), {
      available: Be,
      valuationMetric: Ye,
      growthMetric: ze
    } = on(), Et = n.useRef(!1), Pr = n.useRef(!1), [O, Vt] = n.useState(Ye), [K, Bt] = n.useState(
      ze), nr = n.useRef(Be);
  n.useEffect(() => {
    nr.current = Be
  }, [Be]);
  const Fr = n.useRef(Ye),
    $r = n.useRef(ze);
  n.useEffect(() => {
    Fr.current = Ye
  }, [Ye]), n.useEffect(() => {
    $r.current = ze
  }, [ze]), n.useEffect(() => {
    Be.size !== 0 && (!Et.current && !Be.has(O) && Vt(Ye), !Pr.current && !Be.has(K) && Bt(ze))
  }, [Be, Ye, ze, O, K]);
  const [Pe, ar] = n.useState(""), [Fe, _e] = n.useState(""), [ut, or] = n.useState("heatmap"), [mt,
      Gr
    ] = n.useState(60), [pt, Ar] = n.useState(0), [Lt, Dr] = n.useState(20), [It, Tr] = n.useState(
      252), [Nt, Er] = n.useState(30), [ft, Vr] = n.useState(.2), [yt, Br] = n.useState(!1), [ir,
      lr] = n.useState([]), [f, Ot] = n.useState("peer"), [D, cr] = n.useState(""), [we, Lr] = n
    .useState("subindustry"), [oe, Kt] = n.useState(""), [Ge, Ir] = n.useState("subindustry"), [he,
      dr
    ] = n.useState(tt), [Or, ys] = n.useState(0), [Wr, ws] = n.useState(0), [ce, ur] = n.useState(
      "classification"), [de, mr] = n.useState("classification"), [wt, Yr] = n.useState(""), [jt,
      zr] = n.useState(""), [ue, Wt] = n.useState(""), [js, kt] = n.useState(!1), [Le, pr] = n
    .useState("capWeighted"), {
      baskets: je,
      getBasket: St
    } = Ws(), [ee, _r] = n.useState(() => new Set(["premium", "growth", "relReturn", "similar"])), [
      y, Zt
    ] = n.useState([]), [C, Xt] = n.useState([]), [fr, Qt] = n.useState(0), [re, Hr] = n.useState(
      ""), [ht, hr] = n.useState(""), [xr, qr] = n.useState(!1), [Ur, Kr] = n.useState(null), [Ie,
      Yt
    ] = n.useState([]), [Oe, zt] = n.useState([]), [gr, Zr] = n.useState(!1), br = n.useRef(!1),
    ks = n.useCallback(() => ({
      target: x,
      dimension: U,
      valMetric: O,
      growthMetric: K,
      pinDate: Pe,
      periodFilter: Fe,
      rollWindow: mt,
      rollLag: pt,
      showEarnings: yt,
      compareMode: f,
      peerTicker: D,
      peerValueOverride: ht,
      groupADim: we,
      groupAValue: oe,
      groupBDim: Ge,
      groupBValue: he,
      groupAKind: ce,
      groupBKind: de,
      groupABasketId: wt,
      groupBBasketId: jt,
      basketId: ue,
      basketAggregation: Le,
      visibleCharts: Array.from(ee),
      similarN: Lt,
      similarExclusion: It,
      similarMinGap: Nt,
      scatterView: ut,
      rvBand: ft
    }), [x, U, O, K, Pe, Fe, mt, pt, yt, f, D, ht, we, oe, Ge, he, ce, de, wt, jt, ue, Le, ee, Lt,
      It, Nt, ut, ft
    ]), Ss = n.useCallback(e => {
      if (e) {
        if (typeof e.target == "string" && e.target && ae(e.target), typeof e.dimension ==
          "string" && e.dimension && Tt(e.dimension), typeof e.valMetric == "string" && e
          .valMetric) {
          const s = nr.current;
          s.size === 0 || s.has(e.valMetric) ? Vt(e.valMetric) : Vt(Fr.current)
        }
        if (typeof e.growthMetric == "string" && e.growthMetric) {
          const s = nr.current;
          s.size === 0 || s.has(e.growthMetric) ? Bt(e.growthMetric) : Bt($r.current)
        }
        if (typeof e.pinDate == "string" && ar(e.pinDate), typeof e.periodFilter == "string" &&
          _e(e.periodFilter), (e.scatterView === "heatmap" || e.scatterView === "points") && or(e
            .scatterView), typeof e.rollWindow == "number" && e.rollWindow > 1 && Gr(e
          .rollWindow), typeof e.rollLag == "number" && Number.isFinite(e.rollLag) && Ar(e
            .rollLag), typeof e.showEarnings == "boolean" && Br(e.showEarnings), (e
            .compareMode === "peer" || e.compareMode === "ticker" || e.compareMode === "group" ||
            e.compareMode === "basket") && Ot(e.compareMode), typeof e.peerTicker == "string" &&
          cr(e.peerTicker), typeof e.peerValueOverride == "string" && hr(e.peerValueOverride),
          typeof e.groupADim == "string" && Lr(e.groupADim), typeof e.groupAValue == "string" &&
          Kt(e.groupAValue), typeof e.groupBDim == "string" && Ir(e.groupBDim), typeof e
          .groupBValue == "string" && dr(e.groupBValue), (e.groupAKind === "classification" || e
            .groupAKind === "basket") && ur(e.groupAKind), (e.groupBKind === "classification" || e
            .groupBKind === "basket") && mr(e.groupBKind), typeof e.groupABasketId == "string" &&
          Yr(e.groupABasketId), typeof e.groupBBasketId == "string" && zr(e.groupBBasketId), (e
            .basketAggregation === "capWeighted" || e.basketAggregation === "median") && pr(e
            .basketAggregation), typeof e.basketId == "string" && Wt(e.basketId), Array.isArray(e
            .visibleCharts)) {
          const s = e.visibleCharts.filter(o => typeof o == "string" && hs.includes(o));
          s.length && _r(new Set(s))
        }
        typeof e.similarN == "number" && e.similarN >= 5 && e.similarN <= 200 && Dr(e.similarN),
          typeof e.similarExclusion == "number" && e.similarExclusion >= 0 && e
          .similarExclusion <= 1e3 && Tr(e.similarExclusion), typeof e.similarMinGap ==
          "number" && e.similarMinGap >= 0 && e.similarMinGap <= 504 && Er(e.similarMinGap),
          typeof e.rvBand == "number" && e.rvBand >= .05 && e.rvBand <= 2 && Vr(e.rvBand), br
          .current = !0
      }
    }, []), Ms = an();
  Ys("premium-discount", ks, Ss, {
    universeSig: Ms,
    resultFields: ["target", "peerTicker", "peerValueOverride", "basketId", "groupABasketId",
      "groupBBasketId"
    ]
  }), n.useEffect(() => {
    try {
      const e = sessionStorage.getItem("pd-screener-handoff");
      if (!e) return;
      sessionStorage.removeItem("pd-screener-handoff");
      const s = JSON.parse(e);
      typeof s.ticker == "string" && s.ticker && ae(s.ticker), typeof s.valMetric == "string" &&
        s.valMetric && Vt(s.valMetric), typeof s.growthMetric == "string" && s.growthMetric &&
        Bt(s.growthMetric), typeof s.dimension == "string" && s.dimension && Tt(s.dimension), br
        .current = !0
    } catch {}
  }, []);
  const He = n.useRef(null),
    qe = n.useRef(null),
    Ue = n.useRef(null),
    Ke = n.useRef(null),
    Ze = n.useRef(null),
    Xe = n.useRef(null),
    Qe = n.useRef(null),
    Je = n.useRef(null),
    Xr = n.useRef(null),
    xe = n.useRef(null),
    ge = n.useRef(null),
    be = n.useRef(null),
    ve = n.useRef(null),
    ke = n.useRef(null),
    Se = n.useRef(null),
    Me = n.useRef(null),
    $e = n.useRef(null),
    Mt = n.useRef(null),
    Rt = n.useRef(null),
    Ct = n.useRef(null),
    Jt = n.useRef(null),
    Pt = n.useRef(null),
    Ft = n.useRef(null),
    $t = n.useRef(null),
    Gt = n.useRef(null),
    _t = n.useRef(null),
    Qr = n.useRef(null),
    Jr = n.useRef(null),
    es = n.useRef(null),
    ts = n.useRef(null),
    rs = n.useRef(null),
    ss = n.useRef(null),
    ns = n.useRef(null),
    [X, as] = n.useState(null);
  n.useEffect(() => {
    let e = !0;
    return zs().then(s => {
      if (e && (A(s), s.length && !x && !br.current)) {
        const o = s.find(a => /AVB|EQR|O$|PLD|AMT|SPG/.test(a.ticker)) || s[0];
        ae(o.ticker)
      }
    }).finally(() => {
      e && fe(!1)
    }), () => {
      e = !1
    }
  }, []), n.useEffect(() => {
    if (ht) {
      Hr(ht);
      return
    }
    if (!x || j.length === 0) return;
    const e = j.find(s => s.ticker === x);
    if (e) {
      const s = e[U] || "";
      Hr(s)
    }
  }, [x, j, U, ht]), n.useEffect(() => {
    if (f !== "group" || j.length === 0 || !x || oe) return;
    const e = j.find(s => s.ticker === x);
    if (e) {
      const s = e[we] || "";
      s && Kt(s)
    }
  }, [f, x, j, we, oe]), n.useEffect(() => {
    if (!x) {
      lr([]);
      return
    }
    let e = !1;
    return _s(x).then(s => {
      if (e) return;
      lr((a => (a || []).map(r => {
        if (r.includes("-")) return r;
        const [c, i, d] = r.split("/");
        return `${d}-${c.padStart(2,"0")}-${i.padStart(2,"0")}`
      }).filter(r => r && r.length === 10).sort())(s.earnings))
    }).catch(() => {
      e || lr([])
    }), () => {
      e = !0
    }
  }, [x]);
  const Ht = n.useMemo(() => !re || j.length === 0 ? [] : kr(j, U, re), [j, U, re]),
    vr = n.useMemo(() => {
      const e = {
        economy: [],
        sector: [],
        subsector: [],
        industryGroup: [],
        industry: [],
        subindustry: []
      };
      for (const s of j) {
        const o = s;
        Object.keys(e).forEach(a => {
          const r = o[a];
          r && !e[a].includes(r) && e[a].push(r)
        })
      }
      return Object.keys(e).forEach(s => e[s].sort()), e
    }, [j]),
    se = n.useMemo(() => St(ue), [St, ue]),
    Re = n.useMemo(() => St(wt), [St, wt]),
    Ce = n.useMemo(() => St(jt), [St, jt]),
    xt = n.useCallback(async (e, s) => {
      if (Le === "capWeighted") {
        const o = async (c, i) => {
          try {
            return await ye(c, i)
          } catch {
            return await We(c, i)
          }
        }, {
          series: a
        } = await Hs(e, s, o), r = new Array(a.length).fill(e.tickers.length);
        return {
          groupSeries: a,
          peerTickers: e.tickers,
          peerCount: r
        }
      }
      return qs(e.tickers, s, ye)
    }, [Le]);
  n.useEffect(() => {
    if (f !== "group" && f !== "basket" && !x || f === "peer" && !re || f === "ticker" && (!D ||
        D === x) || f === "basket" && (!x || !se || se.tickers.length < 2)) return;
    if (f === "group") {
      const s = ce === "basket" ? Re && Re.tickers.length >= 2 : !!oe,
        o = de === "basket" ? Ce && Ce.tickers.length >= 2 : !!he;
      if (!s || !o || ce === "classification" && de === "classification" && we === Ge && oe ===
        he) return
    }
    let e = !0;
    return qr(!0), Kr(null), (async () => {
      try {
        if (f === "peer") {
          const s = await ds(x, U, re, O, "median", void 0, ye),
            o = rt(s.targetSeries, s.groupSeries, "pct"),
            a = await ds(x, U, re, K, "median", void 0, ye),
            r = rt(a.targetSeries, a.groupSeries, "abs");
          if (!e) return;
          Zt(o), Xt(r), Qt(s.peerTickers.length)
        } else if (f === "ticker") {
          const [s, o, a, r] = await Promise.all([ye(x, O).catch(() => []), ye(D, O)
            .catch(() => []), ye(x, K).catch(() => []), ye(D, K).catch(() => [])
          ]), c = rt(s, o, "pct"), i = rt(a, r, "abs");
          if (!e) return;
          Zt(c), Xt(i), Qt(1)
        } else if (f === "basket") {
          const s = se,
            [o, a, r, c] = await Promise.all([ye(x, O).catch(() => []), ye(x, K).catch(
            () => []), xt(s, O), xt(s, K)]),
            i = rt(o, r.groupSeries, "pct"),
            d = rt(a, c.groupSeries, "abs");
          if (!e) return;
          Zt(i), Xt(d), Qt(s.tickers.length)
        } else {
          const s = ce === "basket" && Re ? [xt(Re, O), xt(Re, K)] : [rr(we, oe, O,
              "median", ye), rr(we, oe, K, "median", ye)],
            o = de === "basket" && Ce ? [xt(Ce, O), xt(Ce, K)] : [rr(Ge, he, O, "median",
              ye), rr(Ge, he, K, "median", ye)],
            [a, r, c, i] = await Promise.all([...s, ...o]),
            d = rt(a.groupSeries, c.groupSeries, "pct"),
            p = rt(r.groupSeries, i.groupSeries, "abs");
          if (!e) return;
          Zt(d), Xt(p), Qt(a.peerTickers.length), ys(a.peerTickers.length), ws(c
            .peerTickers.length)
        }
      } catch (s) {
        if (!e) return;
        Kr(s?.message || "Failed to compute")
      } finally {
        e && qr(!1)
      }
    })(), () => {
      e = !1
    }
  }, [x, U, re, O, K, f, D, we, oe, Ge, he, ce, de, Re, Ce, se, ue, Le, xt]), n.useEffect(() => {
    if (f !== "group" && f !== "basket" && !x || f === "peer" && (!re || Ht.length === 0) ||
      f === "ticker" && (!D || D === x) || f === "basket" && (!se || se.tickers.length < 2) ||
      f === "group" && (!(ce === "basket" ? !!Re : !!oe) || !(de === "basket" ? !!Ce : !!he)))
      return;
    let e = !0;
    Zr(!0);
    const s = o => {
      const a = new Set,
        r = [];
      for (const d of o) {
        const p = new Map;
        let u = null;
        for (const g of d) !Number.isFinite(g.value) || g.value <= 0 || (u === null && (u = g
          .value), p.set(g.time, g.value / u), a.add(g.time));
        r.push(p)
      }
      const c = Array.from(a).sort(),
        i = [];
      for (const d of c) {
        const p = [];
        for (const w of r) {
          const k = w.get(d);
          k != null && Number.isFinite(k) && p.push(k)
        }
        if (p.length < 3) continue;
        p.sort((w, k) => w - k);
        const u = Math.floor(p.length / 2),
          g = p.length % 2 === 0 ? (p[u - 1] + p[u]) / 2 : p[u];
        i.push({
          time: d,
          value: g
        })
      }
      return i
    };
    return (async () => {
      try {
        if (f === "group") {
          const a = ce === "basket" && Re ? Re.tickers : kr(j, we, oe).map(d => d.ticker),
            r = de === "basket" && Ce ? Ce.tickers : kr(j, Ge, he).map(d => d.ticker),
            [c, i] = await Promise.all([Promise.all(a.map(d => We(d, "close").catch(
            () => []))), Promise.all(r.map(d => We(d, "close").catch(() => [])))]);
          if (!e) return;
          Yt(s(c)), zt(s(i));
          return
        }
        if (f === "basket") {
          const a = se,
            r = await We(x, "close").catch(() => []);
          if (Le === "capWeighted") {
            const c = a.tickers.filter(p => p !== x),
              i = c.length === a.tickers.length ? a : {
                ...a,
                tickers: c
              },
              d = await Us(i, We);
            if (!e) return;
            Yt(r), zt(d)
          } else {
            const c = await Promise.all(a.tickers.filter(i => i !== x).map(i => We(i,
              "close").catch(() => [])));
            if (!e) return;
            Yt(r), zt(s(c))
          }
          return
        }
        const o = await We(x, "close").catch(() => []);
        if (f === "ticker") {
          const a = await We(D, "close").catch(() => []);
          if (!e) return;
          Yt(o), zt(a)
        } else {
          const a = Ht.filter(c => c.ticker !== x).map(c => c.ticker),
            r = await Promise.all(a.map(c => We(c, "close").catch(() => [])));
          if (!e) return;
          Yt(o), zt(s(r))
        }
      } finally {
        e && Zr(!1)
      }
    })(), () => {
      e = !1
    }
  }, [x, f, D, re, Ht, j, we, oe, Ge, he, ce, de, Re, Ce, se, ue, Le]);
  const Nr = n.useMemo(() => D ? j.find(e => e.ticker === D)?.name || D : "", [j, D]),
    et = n.useMemo(() => ce === "basket" ? Re ? Re.name : "—" : oe === tt ? "All REITs" : oe || "—",
      [ce, Re, oe]),
    Ae = n.useMemo(() => de === "basket" ? Ce ? Ce.name : "—" : he === tt ? "All REITs" : he || "—",
      [de, Ce, he]),
    gt = n.useMemo(() => se ? se.name : "—", [se]);
  n.useEffect(() => {
    f === "basket" && (ue && je.find(e => e.id === ue) || (je.length > 0 ? Wt(je[0].id) : ue &&
      Wt(null)))
  }, [je, ue, f]), n.useEffect(() => {
    f === "basket" && !ue && je.length > 0 && Wt(je[0].id)
  }, [f, je, ue]), n.useEffect(() => {
    if (f !== "ticker" || j.length === 0 || !x || D && D !== x) return;
    const e = j.find(a => a.ticker !== x && a[U] === re),
      s = j.find(a => a.ticker !== x),
      o = e?.ticker || s?.ticker || "";
    o && cr(o)
  }, [f, x, D, j, U, re]), n.useEffect(() => {
    if (He.current) {
      if (!xe.current) {
        xe.current = st(He.current, {
          layout: {
            background: {
              type: at.Solid,
              color: it
            },
            textColor: lt,
            fontSize: 11
          },
          grid: {
            vertLines: {
              color: $
            },
            horzLines: {
              color: $
            }
          },
          rightPriceScale: {
            borderColor: $
          },
          timeScale: {
            borderColor: $,
            timeVisible: !1
          },
          crosshair: {
            mode: nt.Normal
          },
          handleScroll: {
            mouseWheel: !1,
            pressedMouseMove: !0,
            horzTouchDrag: !0,
            vertTouchDrag: !1
          },
          handleScale: !1,
          kineticScroll: {
            mouse: !1,
            touch: !1
          },
          height: 0
        }), xe.current.applyOptions({
          handleScale: {
            mouseWheel: !0,
            pinch: !1,
            axisPressedMouseMove: !1,
            axisDoubleClickReset: !1
          }
        }), ot(xe.current);
        const e = xe.current.addSeries(Sr, {
          lineColor: gs,
          topColor: "rgba(245,158,11,0.30)",
          bottomColor: "rgba(245,158,11,0.02)",
          lineWidth: 2,
          priceLineVisible: !1,
          lastValueVisible: !0
        });
        Mt.current = e, e.createPriceLine({
          price: 0,
          color: Dt,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: !1,
          title: ""
        })
      }
      Mt.current && (Mt.current.setData(ct(y)), xe.current?.timeScale().fitContent())
    }
  }, [y]), n.useEffect(() => {
    if (qe.current) {
      if (!ge.current) {
        ge.current = st(qe.current, {
          layout: {
            background: {
              type: at.Solid,
              color: it
            },
            textColor: lt,
            fontSize: 11
          },
          grid: {
            vertLines: {
              color: $
            },
            horzLines: {
              color: $
            }
          },
          rightPriceScale: {
            borderColor: $
          },
          timeScale: {
            borderColor: $,
            timeVisible: !1
          },
          crosshair: {
            mode: nt.Normal
          },
          handleScroll: {
            mouseWheel: !1,
            pressedMouseMove: !0,
            horzTouchDrag: !0,
            vertTouchDrag: !1
          },
          handleScale: !1,
          kineticScroll: {
            mouse: !1,
            touch: !1
          },
          height: 0
        }), ge.current.applyOptions({
          handleScale: {
            mouseWheel: !0,
            pinch: !1,
            axisPressedMouseMove: !1,
            axisDoubleClickReset: !1
          }
        }), ot(ge.current);
        const e = ge.current.addSeries(Ut, {
          color: "rgba(56,189,248,0.95)",
          lineWidth: 2,
          priceLineVisible: !1,
          lastValueVisible: !0
        });
        Rt.current = e, e.createPriceLine({
          price: 0,
          color: Dt,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: !1,
          title: ""
        })
      }
      Rt.current && (Rt.current.setData(ct(C)), ge.current?.timeScale().fitContent())
    }
  }, [C]);
  const Rs = .5,
    Cs = 50,
    me = n.useMemo(() => {
      if (y.length === 0 || C.length === 0) return [];
      const e = new Map;
      for (const o of C) e.set(o.time, o.value);
      const s = [];
      for (const o of y) {
        const a = e.get(o.time);
        if (a === void 0 || !Number.isFinite(a) || !Number.isFinite(o.value) || Math.abs(a) < Rs)
          continue;
        const r = o.value / a;
        !Number.isFinite(r) || Math.abs(r) > Cs || s.push({
          time: o.time,
          value: r
        })
      }
      return s
    }, [y, C]);
  n.useEffect(() => {
    if (Ue.current) {
      if (!be.current) {
        be.current = st(Ue.current, {
          layout: {
            background: {
              type: at.Solid,
              color: it
            },
            textColor: lt,
            fontSize: 11
          },
          grid: {
            vertLines: {
              color: $
            },
            horzLines: {
              color: $
            }
          },
          rightPriceScale: {
            borderColor: $
          },
          timeScale: {
            borderColor: $,
            timeVisible: !1
          },
          crosshair: {
            mode: nt.Normal
          },
          handleScroll: {
            mouseWheel: !1,
            pressedMouseMove: !0,
            horzTouchDrag: !0,
            vertTouchDrag: !1
          },
          handleScale: !1,
          kineticScroll: {
            mouse: !1,
            touch: !1
          },
          height: 0
        }), be.current.applyOptions({
          handleScale: {
            mouseWheel: !0,
            pinch: !1,
            axisPressedMouseMove: !1,
            axisDoubleClickReset: !1
          }
        }), ot(be.current);
        const e = be.current.addSeries(Ut, {
          color: "rgba(168,85,247,0.95)",
          lineWidth: 2,
          priceLineVisible: !1,
          lastValueVisible: !0
        });
        Ct.current = e, e.createPriceLine({
          price: 0,
          color: Dt,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: !1,
          title: ""
        })
      }
      Ct.current && (Ct.current.setData(ct(me)), be.current?.timeScale().fitContent())
    }
  }, [me]);
  const De = n.useMemo(() => us(y, C, mt, pt), [y, C, mt, pt]),
    er = n.useMemo(() => {
      if (y.length < 30 || C.length < 30) return null;
      const e = Ks(y, C, 60);
      return Zs(e)
    }, [y, C]),
    yr = n.useMemo(() => {
      if (Ie.length === 0 || Oe.length === 0) return {
        relReturn: [],
        relRatio: [],
        anchorDate: null
      };
      const e = new Map;
      for (const d of Oe) Number.isFinite(d.value) && d.value > 0 && e.set(d.time, d.value);
      const s = [];
      for (const d of Ie) {
        if (!Number.isFinite(d.value) || d.value <= 0) continue;
        const p = e.get(d.time);
        p != null && s.push({
          t: d.time,
          a: d.value,
          b: p
        })
      }
      if (s.length < 2) return {
        relReturn: [],
        relRatio: [],
        anchorDate: null
      };
      let o = 0;
      if (Pe && /^\d{4}-\d{2}-\d{2}$/.test(Pe)) {
        let d = 1 / 0;
        const p = Date.parse(Pe);
        if (Number.isFinite(p))
          for (let u = 0; u < s.length; u++) {
            const g = Date.parse(s[u].t);
            if (!Number.isFinite(g)) continue;
            const w = Math.abs(g - p);
            w < d && (d = w, o = u)
          }
      }
      const a = s[o].a,
        r = s[o].b,
        c = [],
        i = [];
      for (let d = o; d < s.length; d++) {
        const p = s[d],
          u = p.a / a - 1,
          g = p.b / r - 1,
          w = (u - g) * 100,
          k = p.a / a / (p.b / r);
        Number.isFinite(w) && c.push({
          time: p.t,
          value: w
        }), Number.isFinite(k) && k > 0 && i.push({
          time: p.t,
          value: k
        })
      }
      return {
        relReturn: c,
        relRatio: i,
        anchorDate: s[o].t
      }
    }, [Ie, Oe, Pe]),
    te = yr.relReturn,
    Te = yr.relRatio,
    bt = yr.anchorDate,
    Ne = n.useMemo(() => {
      if (Ie.length === 0 || Oe.length === 0) return [];
      const e = new Map;
      for (const o of Oe) Number.isFinite(o.value) && o.value > 0 && e.set(o.time, o.value);
      const s = [];
      for (const o of Ie) {
        if (!Number.isFinite(o.value) || o.value <= 0) continue;
        const a = e.get(o.time);
        if (a == null || !Number.isFinite(a) || a <= 0) continue;
        const r = o.value / a;
        Number.isFinite(r) && r > 0 && s.push({
          time: o.time,
          value: r
        })
      }
      return s
    }, [Ie, Oe]),
    os = n.useMemo(() => us(me, Ne, mt, pt), [me, Ne, mt, pt]);
  n.useEffect(() => {
    if (Ke.current) {
      if (!ve.current) {
        ve.current = st(Ke.current, {
          layout: {
            background: {
              type: at.Solid,
              color: it
            },
            textColor: lt,
            fontSize: 11
          },
          grid: {
            vertLines: {
              color: $
            },
            horzLines: {
              color: $
            }
          },
          rightPriceScale: {
            borderColor: $
          },
          timeScale: {
            borderColor: $,
            timeVisible: !1
          },
          crosshair: {
            mode: nt.Normal
          },
          handleScroll: {
            mouseWheel: !1,
            pressedMouseMove: !0,
            horzTouchDrag: !0,
            vertTouchDrag: !1
          },
          handleScale: !1,
          kineticScroll: {
            mouse: !1,
            touch: !1
          },
          height: 0
        }), ve.current.applyOptions({
          handleScale: {
            mouseWheel: !0,
            pinch: !1,
            axisPressedMouseMove: !1,
            axisDoubleClickReset: !1
          }
        }), ot(ve.current);
        const e = ve.current.addSeries(Sr, {
          lineColor: "rgba(20,184,166,0.95)",
          topColor: "rgba(20,184,166,0.30)",
          bottomColor: "rgba(20,184,166,0.02)",
          lineWidth: 2,
          priceLineVisible: !1,
          lastValueVisible: !0,
          autoscaleInfoProvider: () => ({
            priceRange: {
              minValue: -1,
              maxValue: 1
            }
          })
        });
        Pt.current = e, e.createPriceLine({
          price: 0,
          color: Dt,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: !1,
          title: ""
        }), e.createPriceLine({
          price: 1,
          color: "rgba(255,255,255,0.10)",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: !1,
          title: ""
        }), e.createPriceLine({
          price: -1,
          color: "rgba(255,255,255,0.10)",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: !1,
          title: ""
        });
        const s = ve.current.addSeries(Ut, {
          color: "rgba(217,70,239,0.95)",
          lineWidth: 2,
          priceLineVisible: !1,
          lastValueVisible: !0,
          autoscaleInfoProvider: () => ({
            priceRange: {
              minValue: -1,
              maxValue: 1
            }
          })
        });
        Jt.current = s
      }
      Pt.current && Pt.current.setData(ct(De)), Jt.current && Jt.current.setData(ct(os))
    }
  }, [De, os]), n.useEffect(() => {
    if (Ze.current) {
      if (!ke.current) {
        ke.current = st(Ze.current, {
          layout: {
            background: {
              type: at.Solid,
              color: it
            },
            textColor: lt,
            fontSize: 11
          },
          grid: {
            vertLines: {
              color: $
            },
            horzLines: {
              color: $
            }
          },
          rightPriceScale: {
            borderColor: $
          },
          timeScale: {
            borderColor: $,
            timeVisible: !1
          },
          crosshair: {
            mode: nt.Normal
          },
          handleScroll: {
            mouseWheel: !1,
            pressedMouseMove: !0,
            horzTouchDrag: !0,
            vertTouchDrag: !1
          },
          handleScale: !1,
          kineticScroll: {
            mouse: !1,
            touch: !1
          },
          height: 0
        }), ke.current.applyOptions({
          handleScale: {
            mouseWheel: !0,
            pinch: !1,
            axisPressedMouseMove: !1,
            axisDoubleClickReset: !1
          }
        }), ot(ke.current);
        const e = ke.current.addSeries(Sr, {
          lineColor: "rgba(16,185,129,0.95)",
          topColor: "rgba(16,185,129,0.30)",
          bottomColor: "rgba(16,185,129,0.02)",
          lineWidth: 2,
          priceLineVisible: !1,
          lastValueVisible: !0
        });
        Ft.current = e, e.createPriceLine({
          price: 0,
          color: Dt,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: !1,
          title: ""
        })
      }
      Ft.current && Ft.current.setData(ct(te))
    }
  }, [te, ee]), n.useEffect(() => {
    if (Xe.current) {
      if (!Se.current) {
        Se.current = st(Xe.current, {
          layout: {
            background: {
              type: at.Solid,
              color: it
            },
            textColor: lt,
            fontSize: 11
          },
          grid: {
            vertLines: {
              color: $
            },
            horzLines: {
              color: $
            }
          },
          rightPriceScale: {
            borderColor: $,
            mode: 1
          },
          timeScale: {
            borderColor: $,
            timeVisible: !1
          },
          crosshair: {
            mode: nt.Normal
          },
          handleScroll: {
            mouseWheel: !1,
            pressedMouseMove: !0,
            horzTouchDrag: !0,
            vertTouchDrag: !1
          },
          handleScale: !1,
          kineticScroll: {
            mouse: !1,
            touch: !1
          },
          height: 0
        }), Se.current.applyOptions({
          handleScale: {
            mouseWheel: !0,
            pinch: !1,
            axisPressedMouseMove: !1,
            axisDoubleClickReset: !1
          }
        }), ot(Se.current);
        const e = Se.current.addSeries(Ut, {
          color: "rgba(244,63,94,0.95)",
          lineWidth: 2,
          priceLineVisible: !1,
          lastValueVisible: !0
        });
        $t.current = e, e.createPriceLine({
          price: 1,
          color: Dt,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: !1,
          title: ""
        })
      }
      $t.current && $t.current.setData(ct(Te))
    }
  }, [Te, ee]), n.useEffect(() => {
    if (Qe.current) {
      if (!Me.current) {
        Me.current = st(Qe.current, {
          layout: {
            background: {
              type: at.Solid,
              color: it
            },
            textColor: lt,
            fontSize: 11
          },
          grid: {
            vertLines: {
              color: $
            },
            horzLines: {
              color: $
            }
          },
          rightPriceScale: {
            borderColor: $,
            mode: 1
          },
          timeScale: {
            borderColor: $,
            timeVisible: !1
          },
          crosshair: {
            mode: nt.Normal
          },
          handleScroll: {
            mouseWheel: !1,
            pressedMouseMove: !0,
            horzTouchDrag: !0,
            vertTouchDrag: !1
          },
          handleScale: !1,
          kineticScroll: {
            mouse: !1,
            touch: !1
          },
          height: 0
        }), Me.current.applyOptions({
          handleScale: {
            mouseWheel: !0,
            pinch: !1,
            axisPressedMouseMove: !1,
            axisDoubleClickReset: !1
          }
        }), ot(Me.current);
        const e = Me.current.addSeries(Ut, {
          color: "rgba(56,189,248,0.95)",
          lineWidth: 2,
          priceLineVisible: !1,
          lastValueVisible: !0
        });
        Gt.current = e
      }
      Gt.current && Gt.current.setData(ct(Ne))
    }
  }, [Ne, ee]);
  const wr = n.useDeferredValue(ft),
    is = ee.has("rvVerdictTs"),
    Ee = n.useMemo(() => {
      if (!is) return [];
      if (y.length < 60 || C.length < 60) return [];
      const e = new Map;
      for (const v of C) e.set(v.time, v.value);
      const s = y.length,
        o = new Array(s),
        a = new Float64Array(s),
        r = new Float64Array(s);
      let c = 0;
      for (const v of y) {
        const P = e.get(v.time);
        P !== void 0 && (!Number.isFinite(v.value) || !Number.isFinite(P) || (o[c] = v.time, a[
          c] = v.value, r[c] = P, c++))
      }
      if (c < 60) return [];
      const i = new Float64Array(c);

      function d(v, P, W, Z, Q, Y, V) {
        let J = Q,
          N = 0;
        for (let L = 0; L < 5; L++) {
          const H = J * Z,
            m = W - H,
            b = W + H;
          if (N = 0, P)
            for (let S = 0; S < v; S++) {
              const _ = r[S];
              _ >= m && _ <= b && (i[N++] = a[S])
            } else
              for (let S = 0; S < v; S++) {
                const _ = a[S];
                _ >= m && _ <= b && (i[N++] = r[S])
              }
          if (N >= Y) break;
          J *= 1.4
        }
        if (N < Y) return null;
        const B = i.subarray(0, N);
        B.sort();
        let ne = 0;
        for (let L = 0; L < N && B[L] < V; L++) ne++;
        return N > 1 ? ne / (N - 1) * 100 : 50
      }
      const p = [];
      let u = 0,
        g = 0,
        w = 0,
        k = 0;
      for (let v = 0; v < c; v++) {
        const P = a[v],
          W = r[v];
        if (v >= 60) {
          const Z = u / v,
            Q = g / v,
            Y = w / v - Z * Z,
            V = k / v - Q * Q,
            J = Math.sqrt(Math.max(0, Y)),
            N = Math.sqrt(Math.max(0, V));
          if (J > 0 && N > 0) {
            const B = d(v, !0, W, N, wr, 20, P),
              ne = d(v, !1, P, J, wr, 20, W);
            let L = 0,
              H = 0;
            B != null && (L = B <= 25 ? 1 : B >= 75 ? -1 : 0), ne != null && (H = ne >= 75 ? 1 :
              ne <= 25 ? -1 : 0);
            const m = L + H;
            let b = "Neutral";
            L === 1 && H === 1 ? b = "Attractive" : L === -1 && H === -1 ? b = "Expensive" : L ===
              1 && H >= 0 ? b = "Attractive" : L === -1 && H <= 0 ? b = "Expensive" : H === 1 &&
              L >= 0 ? b = "Attractive" : H === -1 && L <= 0 && (b = "Expensive"), p.push({
                time: o[v],
                score: m,
                label: b
              })
          }
        }
        u += P, g += W, w += P * P, k += W * W
      }
      return p
    }, [y, C, wr, is]);
  n.useEffect(() => {
    if (Je.current) {
      if (!$e.current) {
        $e.current = st(Je.current, {
          layout: {
            background: {
              type: at.Solid,
              color: it
            },
            textColor: lt,
            fontSize: 11
          },
          grid: {
            vertLines: {
              color: $
            },
            horzLines: {
              color: $
            }
          },
          rightPriceScale: {
            borderColor: $
          },
          timeScale: {
            borderColor: $,
            timeVisible: !1
          },
          crosshair: {
            mode: nt.Normal
          },
          handleScroll: {
            mouseWheel: !1,
            pressedMouseMove: !0,
            horzTouchDrag: !0,
            vertTouchDrag: !1
          },
          handleScale: !1,
          kineticScroll: {
            mouse: !1,
            touch: !1
          },
          height: 0
        }), $e.current.applyOptions({
          handleScale: {
            mouseWheel: !0,
            pinch: !1,
            axisPressedMouseMove: !1,
            axisDoubleClickReset: !1
          }
        }), ot($e.current);
        const e = $e.current.addSeries(Xs, {
          priceFormat: {
            type: "price",
            precision: 0,
            minMove: 1
          },
          priceLineVisible: !1,
          lastValueVisible: !0,
          base: 0
        });
        _t.current = e
      }
      if (_t.current) {
        const e = "rgba(34,197,94,0.95)",
          s = "rgba(34,197,94,0.55)",
          o = "rgba(239,68,68,0.95)",
          a = "rgba(239,68,68,0.55)",
          r = "rgba(156,163,175,0.55)",
          c = Ee.map(i => {
            let d = r;
            return i.score >= 2 ? d = e : i.score === 1 ? d = s : i.score <= -2 ? d = o : i
              .score === -1 && (d = a), {
                time: i.time,
                value: i.score,
                color: d
              }
          });
        _t.current.setData(c)
      }
    }
  }, [Ee, ee]), n.useEffect(() => {
    if (y.length === 0 && te.length === 0) return;
    const e = requestAnimationFrame(() => {
      try {
        xe.current?.timeScale().fitContent()
      } catch {}
      try {
        ge.current?.timeScale().fitContent()
      } catch {}
      try {
        be.current?.timeScale().fitContent()
      } catch {}
      try {
        ve.current?.timeScale().fitContent()
      } catch {}
      try {
        ke.current?.timeScale().fitContent()
      } catch {}
      try {
        Se.current?.timeScale().fitContent()
      } catch {}
      try {
        Me.current?.timeScale().fitContent()
      } catch {}
      try {
        $e.current?.timeScale().fitContent()
      } catch {}
    });
    return () => cancelAnimationFrame(e)
  }, [y, C, me, De, te, Te, Ne, Ee]), n.useEffect(() => {
    const e = [],
      s = () => {
        for (const {
            series: r,
            primitive: c
          }
          of e) try {
          r.detachPrimitive(c)
        } catch {}
        Qr.current = null, Jr.current = null, es.current = null, ts.current = null, rs.current =
          null, ss.current = null, ns.current = null
      };
    if (!yt || ir.length === 0) return s;
    const o = ir.map(r => ({
        time: r,
        color: "#f59e0b",
        label: "E"
      })),
      a = (r, c) => {
        if (!c) return;
        const i = new sn(o);
        try {
          c.attachPrimitive(i), r.current = i, e.push({
            series: c,
            primitive: i
          })
        } catch (d) {
          console.warn("Failed to attach earnings primitive:", d)
        }
      };
    return a(Qr, Mt.current), a(Jr, Rt.current), a(es, Ct.current), a(ts, Pt.current), a(rs, Ft
      .current), a(ss, $t.current), a(ns, Gt.current), requestAnimationFrame(() => {
      try {
        xe.current?.applyOptions({})
      } catch {}
      try {
        ge.current?.applyOptions({})
      } catch {}
      try {
        be.current?.applyOptions({})
      } catch {}
      try {
        ve.current?.applyOptions({})
      } catch {}
      try {
        ke.current?.applyOptions({})
      } catch {}
      try {
        Se.current?.applyOptions({})
      } catch {}
      try {
        Me.current?.applyOptions({})
      } catch {}
    }), s
  }, [ir, yt, y.length === 0, C.length === 0, me.length === 0, De.length === 0, te.length === 0,
    Te.length === 0, Ne.length === 0
  ]), n.useEffect(() => {
    const s = [{
      chart: xe.current,
      hasData: y.length > 0
    }, {
      chart: ge.current,
      hasData: C.length > 0
    }, {
      chart: be.current,
      hasData: me.length > 0
    }, {
      chart: ve.current,
      hasData: De.length > 0
    }, {
      chart: ke.current,
      hasData: te.length > 0
    }, {
      chart: Se.current,
      hasData: Te.length > 0
    }, {
      chart: Me.current,
      hasData: Ne.length > 0
    }, {
      chart: $e.current,
      hasData: Ee.length > 0
    }].filter(c => c.chart && c.hasData).map(c => c.chart);
    if (s.length < 2) return;
    let o = !1;
    const a = (c, i) => {
        if (!(o || !c)) try {
          o = !0;
          for (const d of s) d !== i && d.timeScale().setVisibleLogicalRange(c)
        } catch {} finally {
          o = !1
        }
      },
      r = [];
    for (const c of s) {
      const i = d => a(d, c);
      c.timeScale().subscribeVisibleLogicalRangeChange(i), r.push({
        chart: c,
        fn: i
      })
    }
    return () => {
      for (const {
          chart: c,
          fn: i
        }
        of r) try {
        c.timeScale().unsubscribeVisibleLogicalRangeChange(i)
      } catch {}
    }
  }, [y.length === 0, C.length === 0, me.length === 0, De.length === 0, te.length === 0, Te
    .length === 0, Ne.length === 0, Ee.length === 0, ee
  ]), n.useEffect(() => {
    const e = i => {
        if (i == null) return null;
        if (typeof i == "string") return i;
        if (typeof i == "object" && "year" in i) {
          const d = p => String(p).padStart(2, "0");
          return `${i.year}-${d(i.month)}-${d(i.day)}`
        }
        if (typeof i == "number") {
          const d = new Date(i * 1e3),
            p = u => String(u).padStart(2, "0");
          return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())}`
        }
        return null
      },
      o = [{
        chart: xe.current,
        series: Mt.current,
        hasData: y.length > 0
      }, {
        chart: ge.current,
        series: Rt.current,
        hasData: C.length > 0
      }, {
        chart: be.current,
        series: Ct.current,
        hasData: me.length > 0
      }, {
        chart: ve.current,
        series: Pt.current,
        hasData: De.length > 0
      }, {
        chart: ke.current,
        series: Ft.current,
        hasData: te.length > 0
      }, {
        chart: Se.current,
        series: $t.current,
        hasData: Te.length > 0
      }, {
        chart: Me.current,
        series: Gt.current,
        hasData: Ne.length > 0
      }, {
        chart: $e.current,
        series: _t.current,
        hasData: Ee.length > 0
      }].filter(i => !!i.chart && !!i.series && i.hasData);
    if (o.length === 0) return;
    let a = !1;
    const r = i => d => {
        if (!a) {
          a = !0;
          try {
            const p = d?.time ? e(d.time) : null;
            for (const {
                chart: u,
                series: g
              }
              of o)
              if (u !== i) try {
                d?.time && g ? u.setCrosshairPosition(NaN, d.time, g) : u
                  .clearCrosshairPosition()
              } catch {}
            as(u => u === p ? u : p)
          } finally {
            a = !1
          }
        }
      },
      c = [];
    for (const {
        chart: i
      }
      of o) {
      const d = r(i);
      i.subscribeCrosshairMove(d), c.push({
        chart: i,
        fn: d
      })
    }
    return () => {
      for (const {
          chart: i,
          fn: d
        }
        of c) try {
        i.unsubscribeCrosshairMove(d)
      } catch {}
      as(null)
    }
  }, [y.length === 0, C.length === 0, me.length === 0, De.length === 0, te.length === 0, Te
    .length === 0, Ne.length === 0, Ee.length === 0, ee
  ]);
  const Ps = n.useMemo(() => {
      const e = new Map;
      for (const s of y) e.set(s.time, s.value);
      return e
    }, [y]),
    Fs = n.useMemo(() => {
      const e = new Map;
      for (const s of C) e.set(s.time, s.value);
      return e
    }, [C]),
    $s = n.useMemo(() => {
      const e = new Map;
      for (const s of me) e.set(s.time, s.value);
      return e
    }, [me]),
    Gs = n.useMemo(() => {
      const e = new Map;
      for (const s of De) e.set(s.time, s.value);
      return e
    }, [De]),
    ls = n.useMemo(() => {
      const e = new Map;
      for (const s of te) e.set(s.time, s.value);
      return e
    }, [te]),
    cs = n.useMemo(() => {
      const e = new Map;
      for (const s of Te) e.set(s.time, s.value);
      return e
    }, [Te]),
    As = n.useMemo(() => {
      const e = new Map;
      for (const s of Ne) e.set(s.time, s.value);
      return e
    }, [Ne]);
  n.useEffect(() => {
    const e = () => {
      He.current && xe.current && xe.current.applyOptions({
        width: He.current.clientWidth,
        height: He.current.clientHeight
      }), qe.current && ge.current && ge.current.applyOptions({
        width: qe.current.clientWidth,
        height: qe.current.clientHeight
      }), Ue.current && be.current && be.current.applyOptions({
        width: Ue.current.clientWidth,
        height: Ue.current.clientHeight
      }), Ke.current && ve.current && ve.current.applyOptions({
        width: Ke.current.clientWidth,
        height: Ke.current.clientHeight
      }), Ze.current && ke.current && ke.current.applyOptions({
        width: Ze.current.clientWidth,
        height: Ze.current.clientHeight
      }), Xe.current && Se.current && Se.current.applyOptions({
        width: Xe.current.clientWidth,
        height: Xe.current.clientHeight
      }), Qe.current && Me.current && Me.current.applyOptions({
        width: Qe.current.clientWidth,
        height: Qe.current.clientHeight
      }), Je.current && $e.current && $e.current.applyOptions({
        width: Je.current.clientWidth,
        height: Je.current.clientHeight
      })
    };
    e();
    const s = new ResizeObserver(e);
    return He.current && s.observe(He.current), qe.current && s.observe(qe.current), Ue
      .current && s.observe(Ue.current), Ke.current && s.observe(Ke.current), Ze.current && s
      .observe(Ze.current), Xe.current && s.observe(Xe.current), Qe.current && s.observe(Qe
        .current), Je.current && s.observe(Je.current), window.addEventListener("resize", e),
    () => {
        s.disconnect(), window.removeEventListener("resize", e)
      }
  }, []), n.useEffect(() => () => {
    try {
      xe.current?.remove()
    } catch {}
    try {
      ge.current?.remove()
    } catch {}
    try {
      be.current?.remove()
    } catch {}
    try {
      ve.current?.remove()
    } catch {}
    try {
      ke.current?.remove()
    } catch {}
    try {
      Se.current?.remove()
    } catch {}
    try {
      Me.current?.remove()
    } catch {}
    try {
      $e.current?.remove()
    } catch {}
    xe.current = null, ge.current = null, be.current = null, ve.current = null, ke.current =
      null, Se.current = null, Me.current = null, $e.current = null, Mt.current = null, Rt
      .current = null, Ct.current = null, Pt.current = null, Jt.current = null, Ft.current =
      null, $t.current = null, Gt.current = null, _t.current = null
  }, []);
  const R = n.useMemo(() => {
      const e = y.length ? y[y.length - 1].value : NaN,
        s = C.length ? C[C.length - 1].value : NaN,
        o = Qs(y),
        a = ms(y, C),
        r = ms(me, Ne);
      let c = NaN;
      if (y.length > 30) {
        const p = y.map(w => w.value).filter(Number.isFinite),
          u = p.reduce((w, k) => w + k, 0) / p.length,
          g = Math.sqrt(p.reduce((w, k) => w + (k - u) ** 2, 0) / p.length);
        c = g > 0 ? (e - u) / g : NaN
      }
      const i = te.length ? te[te.length - 1].value : NaN;
      let d = NaN;
      if (te.length > 0 && bt) {
        const p = te.findIndex(w => w.time === bt),
          u = p >= 0 ? p : 0,
          g = Math.min(u + 252, te.length - 1);
        g > u + 5 && (d = te[g].value)
      }
      return {
        lastP: e,
        lastG: s,
        pctile: o,
        corr: a,
        corrRatioVsAB: r,
        z: c,
        relReturnSinceAnchor: i,
        forwardRelReturn252: d
      }
    }, [y, C, me, Ne, te, bt]),
    Ds = n.useMemo(() => {
      const e = {
        premGivenGrowth: null,
        growthGivenPrem: null,
        impliedPrem: NaN,
        premGap: NaN,
        impliedGrowth: NaN,
        growthGap: NaN,
        label: "—",
        score: 0,
        rationale: "insufficient history"
      };
      if (y.length < 60 || C.length < 60) return e;
      const {
        lastP: s,
        lastG: o
      } = R;
      if (!Number.isFinite(s) || !Number.isFinite(o)) return e;
      const a = new Map;
      for (const N of C) a.set(N.time, N.value);
      const r = [];
      for (const N of y) {
        const B = a.get(N.time);
        B !== void 0 && (!Number.isFinite(N.value) || !Number.isFinite(B) || r.push({
          p: N.value,
          g: B
        }))
      }
      if (r.length < 60) return e;
      const c = r.reduce((N, B) => N + B.p, 0) / r.length,
        i = r.reduce((N, B) => N + B.g, 0) / r.length,
        d = Math.sqrt(r.reduce((N, B) => N + (B.p - c) ** 2, 0) / r.length),
        p = Math.sqrt(r.reduce((N, B) => N + (B.g - i) ** 2, 0) / r.length);
      if (d === 0 || p === 0) return e;

      function u(N, B, ne, L, H, m) {
        const b = L * ne,
          S = B - b,
          _ = B + b,
          I = [];
        for (const F of r) {
          const G = N === "p" ? F.g : F.p;
          G >= S && G <= _ && I.push(N === "p" ? F.p : F.g)
        }
        if (I.length < H) return null;
        I.sort((F, G) => F - G);
        const l = F => {
          const G = Math.min(I.length - 1, Math.max(0, Math.floor(F * (I.length - 1))));
          return I[G]
        };
        let h = 0;
        for (const F of I)
          if (F < m) h++;
          else break;
        const M = I.length > 1 ? h / (I.length - 1) * 100 : 50;
        return {
          n: I.length,
          median: l(.5),
          p25: l(.25),
          p75: l(.75),
          bandLo: S,
          bandHi: _,
          todayPctile: M
        }
      }
      const g = u("p", o, p, ft, 20, s),
        w = u("g", s, d, ft, 20, o),
        k = g ? g.median : NaN,
        v = Number.isFinite(k) ? s - k : NaN,
        P = w ? w.median : NaN,
        W = Number.isFinite(P) ? o - P : NaN;
      let Z = 0,
        Q = 0;
      if (g) {
        const N = g.todayPctile;
        Z = N <= 25 ? 1 : N >= 75 ? -1 : 0
      }
      if (w) {
        const N = w.todayPctile;
        Q = N >= 75 ? 1 : N <= 25 ? -1 : 0
      }
      const Y = Z + Q;
      let V = "Neutral",
        J = "";
      return Z === 1 && Q === 1 ? (V = "Attractive", J =
          "premium below fair-for-growth & growth above fair-for-premium") : Z === -1 && Q === -
        1 ? (V = "Expensive", J =
        "premium above fair-for-growth & growth below fair-for-premium") : Z === 1 && Q >= 0 ? (
          V = "Attractive", J = "premium below what history pays for this growth") : Z === -1 &&
        Q <= 0 ? (V = "Expensive", J = "premium above what history pays for this growth") : Q ===
        1 && Z >= 0 ? (V = "Attractive", J =
        "growth above what history accompanies this premium") : Q === -1 && Z <= 0 ? (V =
          "Expensive", J = "growth below what history accompanies this premium") : Z === 1 &&
        Q === -1 ? (V = "Neutral", J = "cheap-for-growth but growth lagging — mixed") : Z === -
        1 && Q === 1 ? (V = "Neutral", J = "rich-for-growth but growth ripping — mixed") : (V =
          "Neutral", J = "within historical range"), {
          premGivenGrowth: g,
          growthGivenPrem: w,
          impliedPrem: k,
          premGap: v,
          impliedGrowth: P,
          growthGap: W,
          label: V,
          score: Y,
          rationale: J
        }
    }, [y, C, R, ft]),
    E = n.useMemo(() => {
      if (y.length < 60 || C.length < 60 || Ie.length < 60 || Oe.length < 60) return null;
      const e = new Map;
      for (const l of C) Number.isFinite(l.value) && e.set(l.time, l.value);
      const s = [];
      for (const l of y) {
        const h = e.get(l.time);
        h !== void 0 && (!Number.isFinite(l.value) || !Number.isFinite(h) || s.push({
          t: l.time,
          p: l.value,
          g: h
        }))
      }
      if (s.length < 60) return null;
      const o = s.map(l => l.p),
        a = s.map(l => l.g),
        r = o.reduce((l, h) => l + h, 0) / o.length,
        c = a.reduce((l, h) => l + h, 0) / a.length,
        i = Math.max(1, o.length - 1),
        d = Math.max(1, a.length - 1),
        p = Math.sqrt(o.reduce((l, h) => l + (h - r) ** 2, 0) / i),
        u = Math.sqrt(a.reduce((l, h) => l + (h - c) ** 2, 0) / d);
      if (p <= 0 || u <= 0) return null;
      const g = s[s.length - 1],
        w = (g.p - r) / p,
        k = (g.g - c) / u,
        v = new Float64Array(s.length),
        P = new Float64Array(s.length),
        W = new Float64Array(s.length),
        Z = new Float64Array(s.length);
      {
        let l = 0,
          h = 0,
          M = 0,
          F = 0,
          G = 0;
        for (let T = 0; T < s.length; T++) {
          l++;
          const z = s[T].p - h;
          h += z / l, M += z * (s[T].p - h);
          const q = s[T].g - F;
          F += q / l, G += q * (s[T].g - F), v[T] = h, W[T] = F, P[T] = l >= 2 ? Math.sqrt(M / (
            l - 1)) : p, Z[T] = l >= 2 ? Math.sqrt(G / (l - 1)) : u
        }
      }
      const Q = new Map;
      for (const l of Oe) Number.isFinite(l.value) && l.value > 0 && Q.set(l.time, l.value);
      const Y = [];
      for (const l of Ie) {
        if (!Number.isFinite(l.value) || l.value <= 0) continue;
        const h = Q.get(l.time);
        h != null && Y.push({
          t: l.time,
          a: l.value,
          b: h
        })
      }
      if (Y.length < 252) return null;
      const V = new Map;
      Y.forEach((l, h) => V.set(l.t, h));
      const J = Math.max(0, s.length - 1 - It),
        N = [];
      for (let l = 0; l < J; l++) {
        const h = s[l],
          M = P[l] > 0 ? P[l] : p,
          F = Z[l] > 0 ? Z[l] : u,
          G = (h.p - v[l]) / M,
          T = (h.g - W[l]) / F,
          z = G - w,
          q = T - k,
          pe = Math.sqrt(z * z + q * q),
          ie = V.get(h.t);
        if (ie === void 0) continue;
        const Ve = Y[ie].a,
          tr = Y[ie].b;
        if (!(Ve > 0) || !(tr > 0)) continue;
        const qt = Ls => {
            const jr = ie + Ls;
            if (jr >= Y.length) return NaN;
            const Is = Y[jr].a / Ve - 1,
              Os = Y[jr].b / tr - 1;
            return (Is - Os) * 100
          },
          Es = qt(63),
          Vs = qt(126),
          Bs = qt(252);
        N.push({
          date: h.t,
          zPrem: G,
          zGrowth: T,
          distance: pe,
          fwd3M: Es,
          fwd6M: Vs,
          fwd1Y: Bs,
          _pairIdx: ie
        })
      }
      if (N.length === 0) return null;
      N.sort((l, h) => l.distance - h.distance);
      const B = [],
        ne = [];
      let L = 0;
      for (const l of N) {
        if (ne.length >= Lt) break;
        let h = !1;
        if (Nt > 0) {
          for (const M of B)
            if (Math.abs(l._pairIdx - M) < Nt) {
              h = !0;
              break
            }
        }
        if (h) {
          L++;
          continue
        }
        ne.push(l), B.push(l._pairIdx)
      }
      const H = ne.map(({
          _pairIdx: l,
          ...h
        }) => h),
        m = l => {
          const h = l.filter(Number.isFinite);
          if (h.length === 0) return null;
          const M = [...h].sort((ie, Ve) => ie - Ve),
            F = ie => {
              const Ve = Math.min(M.length - 1, Math.max(0, Math.floor(ie * (M.length - 1))));
              return M[Ve]
            },
            G = h.reduce((ie, Ve) => ie + Ve, 0) / h.length,
            T = F(.5),
            z = F(.25),
            q = F(.75),
            pe = h.filter(ie => ie > 0).length / h.length * 100;
          return {
            median: T,
            mean: G,
            p25: z,
            p75: q,
            hitRate: pe,
            n: h.length,
            min: M[0],
            max: M[M.length - 1]
          }
        },
        b = new Map;
      let S = 1 / 0,
        _ = -1 / 0;
      for (const l of H) {
        const h = parseInt(l.date.slice(0, 4), 10);
        Number.isFinite(h) && (b.set(h, (b.get(h) || 0) + 1), h < S && (S = h), h > _ && (_ = h))
      }
      Number.isFinite(S) || (S = 0, _ = 0);
      let I = null;
      if (ne.length >= 4) {
        const l = [...ne].sort((q, pe) => q._pairIdx - pe._pairIdx),
          h = 90;
        let M = 0,
          F = 0,
          G = 0,
          T = 0;
        for (let q = 0; q < l.length; q++) {
          for (; l[q]._pairIdx - l[T]._pairIdx > h;) T++;
          const pe = q - T + 1;
          pe > G && (G = pe, M = T, F = q)
        }
        const z = G / ne.length;
        if (z > .5) {
          const q = Math.floor((M + F) / 2);
          I = {
            dominantMonth: l[q].date.slice(0, 7),
            share: z
          }
        }
      }
      return {
        matches: H,
        todayZPrem: w,
        todayZGrowth: k,
        h3M: m(H.map(l => l.fwd3M)),
        h6M: m(H.map(l => l.fwd6M)),
        h1Y: m(H.map(l => l.fwd1Y)),
        totalCandidates: N.length,
        droppedByGap: L,
        yearCounts: b,
        yearMin: S,
        yearMax: _,
        cluster: I
      }
    }, [y, C, Ie, Oe, Lt, It, Nt]);
  n.useEffect(() => {
    const e = Xr.current;
    if (!e) return;
    const s = window.devicePixelRatio || 1,
      o = e.clientWidth,
      a = e.clientHeight;
    e.width = o * s, e.height = a * s;
    const r = e.getContext("2d");
    r.setTransform(s, 0, 0, s, 0, 0), r.clearRect(0, 0, o, a);
    const c = new Map;
    for (const m of C) c.set(m.time, m.value);
    const i = [];
    let d = 0;
    const p = y.length;
    for (const m of y) {
      const b = c.get(m.time);
      b !== void 0 && Number.isFinite(b) && Number.isFinite(m.value) && i.push({
        x: b,
        y: m.value,
        t: m.time,
        ageRatio: p > 1 ? d / (p - 1) : 1
      }), d++
    }
    const u = {
        l: 64,
        r: 24,
        t: 16,
        b: 56
      },
      g = Math.max(0, o - u.l - u.r),
      w = Math.max(0, a - u.t - u.b);
    if (i.length < 5) {
      r.fillStyle = "rgba(255,255,255,0.45)", r.font = "12px ui-monospace, monospace", r
        .textAlign = "center", r.fillText(xr ? "Computing…" : "Not enough overlapping data", o /
          2, a / 2);
      return
    }
    let k = 1 / 0,
      v = -1 / 0,
      P = 1 / 0,
      W = -1 / 0;
    for (const m of i) m.x < k && (k = m.x), m.x > v && (v = m.x), m.y < P && (P = m.y), m.y >
      W && (W = m.y);
    const Z = (v - k) * .06 || 1,
      Q = (W - P) * .06 || 1;
    k -= Z, v += Z, P -= Q, W += Q, k > 0 && k < v - k && (k = 0), v < 0 && v > -(v - k) && (v =
      0), P > 0 && P < W - P && (P = 0), W < 0 && W > -(W - P) && (W = 0);
    const Y = m => u.l + (m - k) / (v - k) * g,
      V = m => u.t + (1 - (m - P) / (W - P)) * w,
      J = vs(Fe),
      N = J !== null,
      B = m => N && J(m),
      ne = (Pe || "").trim();
    let L = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(ne) && i.length > 0) {
      let m = i[0],
        b = 1 / 0;
      const S = Date.parse(ne);
      if (Number.isFinite(S)) {
        for (const _ of i) {
          const I = Date.parse(_.t);
          if (!Number.isFinite(I)) continue;
          const l = Math.abs(I - S);
          l < b && (b = l, m = _)
        }
        L = {
          x: m.x,
          y: m.y,
          t: m.t
        }
      }
    }
    r.strokeStyle = $, r.lineWidth = 1, r.strokeRect(u.l, u.t, g, w), r.fillStyle =
      "rgba(255,255,255,0.55)", r.font = "10px ui-monospace, monospace", r.textAlign = "right",
      r.textBaseline = "middle";
    for (let m = 0; m <= 4; m++) {
      const b = P + m / 4 * (W - P),
        S = V(b);
      r.fillText(`${Math.round(b)}%`, u.l - 6, S), r.strokeStyle = $, r.beginPath(), r.moveTo(u
        .l, S), r.lineTo(u.l + g, S), r.stroke()
    }
    r.textAlign = "center", r.textBaseline = "top";
    for (let m = 0; m <= 4; m++) {
      const b = k + m / 4 * (v - k),
        S = Y(b);
      r.fillText(`${Math.round(b)}`, S, u.t + w + 6), r.strokeStyle = $, r.beginPath(), r
        .moveTo(S, u.t), r.lineTo(S, u.t + w), r.stroke()
    }
    if (r.strokeStyle = "rgba(255,255,255,0.22)", r.setLineDash([3, 3]), k < 0 && v > 0) {
      const m = Y(0);
      r.beginPath(), r.moveTo(m, u.t), r.lineTo(m, u.t + w), r.stroke()
    }
    if (P < 0 && W > 0) {
      const m = V(0);
      r.beginPath(), r.moveTo(u.l, m), r.lineTo(u.l + g, m), r.stroke()
    }
    if (r.setLineDash([]), r.fillStyle = "rgba(255,255,255,0.75)", r.font =
      "11px ui-monospace, monospace", r.textAlign = "center", r.textBaseline = "alphabetic", r
      .fillText(`Growth differential (pp) — ${K}`, u.l + g / 2, a - 14), r.save(), r.translate(
        16, u.t + w / 2), r.rotate(-Math.PI / 2), r.fillText(`Premium / Discount (%) — ${O}`, 0,
        0), r.restore(), ut === "heatmap") {
      const b = Math.max(8, Math.floor(g / 32)),
        S = Math.max(1, Math.floor(g / b)),
        _ = Math.max(1, Math.floor(w / b)),
        I = Array.from({
          length: _
        }, () => new Array(S).fill(0));
      let l = 0;
      for (const M of i) {
        const F = Y(M.x),
          G = V(M.y),
          T = Math.floor((F - u.l) / b),
          z = Math.floor((G - u.t) / b);
        T < 0 || T >= S || z < 0 || z >= _ || (I[z][T]++, I[z][T] > l && (l = I[z][T]))
      }
      const h = M => {
        const F = Math.pow(Math.max(0, Math.min(1, M)), .55);
        if (F < .5) {
          const G = F / .5;
          return [Math.round(20 + 25 * G), Math.round(30 + 140 * G), Math.round(60 + 120 * G)]
        } else {
          const G = (F - .5) / .5;
          return [Math.round(45 + 200 * G), Math.round(170 + -12 * G), Math.round(180 + -169 *
            G)]
        }
      };
      if (l > 0) {
        for (let z = 0; z < _; z++)
          for (let q = 0; q < S; q++) {
            const pe = I[z][q];
            if (pe === 0) continue;
            const [ie, Ve, tr] = h(pe / l), qt = .45 + .5 * (pe / l);
            r.fillStyle = `rgba(${ie}, ${Ve}, ${tr}, ${qt})`, r.fillRect(u.l + q * b, u.t + z *
              b, b, b)
          }
        const M = 100,
          F = 8,
          G = u.l + g - M - 4,
          T = u.t + 6;
        for (let z = 0; z < M; z++) {
          const [q, pe, ie] = h(z / (M - 1));
          r.fillStyle = `rgba(${q}, ${pe}, ${ie}, 0.95)`, r.fillRect(G + z, T, 1, F)
        }
        r.strokeStyle = "rgba(255,255,255,0.25)", r.lineWidth = 1, r.strokeRect(G, T, M, F), r
          .fillStyle = "rgba(255,255,255,0.7)", r.font = "9px ui-monospace, monospace", r
          .textAlign = "left", r.textBaseline = "top", r.fillText("low", G, T + F + 2), r
          .textAlign = "right", r.fillText(`${l} days`, G + M, T + F + 2)
      }
      if (N)
        for (const M of i) B(M.t) && (r.fillStyle = "rgba(56,189,248,0.95)", r.beginPath(), r
          .arc(Y(M.x), V(M.y), 3.5, 0, Math.PI * 2), r.fill(), r.strokeStyle =
          "rgba(15,23,42,0.6)", r.lineWidth = .5, r.stroke())
    } else if (N) {
      for (const m of i) B(m.t) || (r.fillStyle = "rgba(255,255,255,0.06)", r.beginPath(), r
        .arc(Y(m.x), V(m.y), 2, 0, Math.PI * 2), r.fill());
      for (const m of i) B(m.t) && (r.fillStyle = "rgba(56,189,248,0.85)", r.beginPath(), r.arc(
        Y(m.x), V(m.y), 4, 0, Math.PI * 2), r.fill())
    } else
      for (const m of i) {
        const b = .18 + .65 * m.ageRatio,
          S = 2 + 2.5 * m.ageRatio,
          _ = Math.round(245 - 60 * (1 - m.ageRatio)),
          I = Math.round(158 - 80 * (1 - m.ageRatio)),
          l = Math.round(11 + 180 * (1 - m.ageRatio));
        r.fillStyle = `rgba(${_}, ${I}, ${l}, ${b})`, r.beginPath(), r.arc(Y(m.x), V(m.y), S, 0,
          Math.PI * 2), r.fill()
      }
    const H = i[i.length - 1];
    if (r.strokeStyle = gs, r.lineWidth = 2, r.beginPath(), r.arc(Y(H.x), V(H.y), 6, 0, Math
        .PI * 2), r.stroke(), r.fillStyle = "rgba(245,158,11,0.95)", r.font =
      "10px ui-monospace, monospace", r.textAlign = "left", r.textBaseline = "middle", r
      .fillText("today", Y(H.x) + 9, V(H.y)), L) {
      const m = Y(L.x),
        b = V(L.y),
        S = "rgba(34,197,94,0.95)";
      r.strokeStyle = "rgba(34,197,94,0.35)", r.setLineDash([4, 4]), r.lineWidth = 1, r
        .beginPath(), r.moveTo(u.l, b), r.lineTo(u.l + g, b), r.stroke(), r.beginPath(), r
        .moveTo(m, u.t), r.lineTo(m, u.t + w), r.stroke(), r.setLineDash([]), r.fillStyle = S, r
        .beginPath(), r.arc(m, b, 4, 0, Math.PI * 2), r.fill(), r.strokeStyle = S, r.lineWidth =
        2, r.beginPath(), r.arc(m, b, 9, 0, Math.PI * 2), r.stroke();
      const _ = `${L.t}  •  prem ${L.y.toFixed(1)}%  •  Δg ${L.x.toFixed(1)}pp`;
      r.font = "10px ui-monospace, monospace";
      const I = r.measureText(_).width + 12,
        l = 18;
      let h = m + 12,
        M = b - l - 12;
      h + I > u.l + g && (h = m - I - 12), M < u.t && (M = b + 12), r.fillStyle =
        "rgba(20,20,20,0.92)", r.fillRect(h, M, I, l), r.strokeStyle = S, r.lineWidth = 1, r
        .strokeRect(h, M, I, l), r.fillStyle = S, r.textAlign = "left", r.textBaseline =
        "middle", r.fillText(_, h + 6, M + l / 2)
    }
  }, [y, C, O, K, xr, Pe, Fe, ut]);

  function Ts() {
    const e = new Map;
    for (const p of C) e.set(p.time, p.value);
    const s = ls,
      o = cs,
      a = ["date,premium_pct,growth_diff_pp,rel_return_pp,rel_ratio"];
    for (const p of y) {
      const u = e.get(p.time),
        g = s.get(p.time),
        w = o.get(p.time);
      a.push(
        `${p.time},${p.value.toFixed(4)},${u!==void 0?u.toFixed(4):""},${g!==void 0?g.toFixed(4):""},${w!==void 0?w.toFixed(6):""}`
        )
    }
    const r = new Blob([a.join(`
`)], {
        type: "text/csv"
      }),
      c = URL.createObjectURL(r),
      i = document.createElement("a");
    i.href = c;
    const d = f === "peer" ? `${x}_vs_${U}_${O}_${K}.csv` : f === "ticker" ?
      `${x}_vs_${D}_${O}_${K}.csv` : f === "basket" ? `${x}_vs_basket_${gt}_${O}_${K}.csv` :
      `${et}_vs_${Ae}_${O}_${K}.csv`;
    i.download = d.replace(/\s+/g, "_"), i.click(), URL.revokeObjectURL(c)
  }
  return t.jsxs("div", {
    className: "flex flex-col h-full bg-background overflow-hidden",
    children: [t.jsxs("div", {
      className: "border-b border-border bg-card px-4 py-2.5 flex-shrink-0",
      children: [t.jsxs("div", {
        className: "flex items-end gap-3 flex-wrap",
        children: [t.jsxs("div", {
          className: "flex flex-col gap-0.5",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Ticker"
          }), t.jsx("select", {
            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[200px]",
            value: x,
            onChange: e => ae(e.target.value),
            disabled: le,
            "data-testid": "select-target",
            children: j.map(e => t.jsxs("option", {
              value: e.ticker,
              children: [e.ticker, " — ", e.name]
            }, e.ticker))
          })]
        }), t.jsxs("div", {
          className: "flex flex-col gap-0.5",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Compare To"
          }), t.jsxs("div", {
            className: "flex border border-border rounded overflow-hidden text-[10px] font-mono",
            children: [t.jsx("button", {
              onClick: () => Ot("peer"),
              className: `px-2 py-1 transition-colors ${f==="peer"?"bg-amber-500/15 text-amber-300":"bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`,
              "data-testid": "btn-mode-peer",
              title: "Compare target ticker against peer group median",
              children: "Peer Group"
            }), t.jsx("button", {
              onClick: () => Ot("ticker"),
              className: `px-2 py-1 transition-colors border-l border-border ${f==="ticker"?"bg-amber-500/15 text-amber-300":"bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`,
              "data-testid": "btn-mode-ticker",
              title: "Compare target ticker against a single chosen ticker",
              children: "Ticker"
            }), t.jsx("button", {
              onClick: () => Ot("group"),
              className: `px-2 py-1 transition-colors border-l border-border ${f==="group"?"bg-amber-500/15 text-amber-300":"bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`,
              "data-testid": "btn-mode-group",
              title: "Compare an entire classification group vs another (e.g. Net Lease vs All REITs)",
              children: "Group"
            }), t.jsx("button", {
              onClick: () => Ot("basket"),
              className: `px-2 py-1 transition-colors border-l border-border ${f==="basket"?"bg-amber-500/15 text-amber-300":"bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`,
              "data-testid": "btn-mode-basket",
              title: "Compare target ticker against a named custom basket",
              children: "Basket"
            })]
          })]
        }), f === "basket" && t.jsxs("div", {
          className: "flex flex-col gap-0.5",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Basket"
          }), t.jsx("div", {
            className: "flex gap-1 items-center",
            children: je.length === 0 ? t.jsxs("button", {
              type: "button",
              onClick: () => kt(!0),
              className: "flex items-center gap-1 text-[11px] font-mono px-2 py-1 border border-amber-500/60 bg-amber-500/10 text-amber-300 rounded hover:bg-amber-500/20 transition-colors",
              "data-testid": "btn-create-first-basket",
              title: "Create your first basket",
              children: [t.jsx(sr, {
                className: "w-3 h-3"
              }), "+ Create your first basket"]
            }) : t.jsxs(t.Fragment, {
              children: [t.jsxs("select", {
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[180px]",
                value: ue ?? "",
                onChange: e => Wt(e.target.value),
                "data-testid": "select-basket",
                children: [!ue && t.jsx("option", {
                  value: "",
                  children: "— select basket —"
                }), je.map(e => t.jsxs("option", {
                  value: e.id,
                  children: [e.name, " (", e.tickers
                    .length, ")"
                  ]
                }, e.id))]
              }), t.jsxs("button", {
                type: "button",
                onClick: () => kt(!0),
                className: "flex items-center gap-1 text-[10px] font-mono px-2 py-1 border border-dashed border-border rounded text-muted-foreground hover:text-foreground hover:border-amber-500/40 transition-colors",
                title: "Manage baskets",
                children: [t.jsx(sr, {
                  className: "w-3 h-3"
                }), "Manage"]
              })]
            })
          }), se && se.tickers.length < 2 && t.jsx("span", {
            className: "text-[10px] font-mono text-amber-400",
            children: "Add at least 2 tickers to this basket"
          }), se && se.tickers.length >= 2 && t.jsxs("span", {
            className: "text-[10px] font-mono text-muted-foreground",
            children: [se.tickers.length, " tickers"]
          }), t.jsxs("div", {
            className: "flex items-center gap-1 mt-1",
            "data-testid": "basket-aggregation-toggle",
            children: [t.jsx("span", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Aggregation"
            }), t.jsxs("div", {
              className: "flex border border-border rounded overflow-hidden",
              children: [t.jsx("button", {
                type: "button",
                onClick: () => pr("capWeighted"),
                className: `text-[10px] font-mono px-2 py-0.5 transition-colors ${Le==="capWeighted"?"bg-amber-500/20 text-amber-300":"text-muted-foreground hover:text-foreground"}`,
                title: "Cap-weighted (Charts-tab logic): harmonic for multiples, arithmetic for yields/growth/levels, sum for counts. Honors basket's weighting scheme.",
                children: "Cap-wtd"
              }), t.jsx("button", {
                type: "button",
                onClick: () => pr("median"),
                className: `text-[10px] font-mono px-2 py-0.5 transition-colors ${Le==="median"?"bg-amber-500/20 text-amber-300":"text-muted-foreground hover:text-foreground"}`,
                title: "Plain cross-sectional median across constituents per date. Matches classification-group peer comparison semantics.",
                children: "Median"
              })]
            })]
          })]
        }), f === "peer" ? t.jsxs("div", {
          className: "flex flex-col gap-0.5",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Peer Group"
          }), t.jsxs("div", {
            className: "flex gap-1",
            children: [t.jsx("select", {
              className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[110px]",
              value: U,
              onChange: e => {
                Tt(e.target.value), hr("")
              },
              "data-testid": "select-dimension",
              title: "Classification dimension for the peer group",
              children: Mr.map(e => t.jsx("option", {
                value: e,
                children: At[e]
              }, e))
            }), t.jsxs("select", {
              className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[170px]",
              value: ht || re || "",
              onChange: e => hr(e.target.value),
              "data-testid": "select-peer-value",
              title: "Classification value: defaults to the target ticker's own group; pick another to compare against any group",
              children: [re && re !== tt && t.jsxs("option", {
                value: re,
                children: [re, ht ? "" : " (auto)"]
              }), t.jsx("option", {
                value: tt,
                children: "All REITs"
              }), (vr[U] || []).filter(e => e !== re).map(e =>
                t.jsx("option", {
                  value: e,
                  children: e
                }, e))]
            })]
          })]
        }) : f === "ticker" ? t.jsxs("div", {
          className: "flex flex-col gap-0.5",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "vs Ticker"
          }), t.jsxs("select", {
            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[200px]",
            value: D,
            onChange: e => cr(e.target.value),
            disabled: le,
            "data-testid": "select-peer-ticker",
            children: [D === "" && t.jsx("option", {
              value: "",
              children: "— select a ticker —"
            }), j.filter(e => e.ticker !== x).map(e => t.jsxs(
              "option", {
                value: e.ticker,
                children: [e.ticker, " — ", e.name]
              }, e.ticker))]
          })]
        }) : f === "group" ? t.jsxs(t.Fragment, {
          children: [t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsxs("div", {
              className: "flex items-center gap-1.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Group A"
              }), t.jsxs("div", {
                className: "flex border border-border rounded overflow-hidden text-[9px] font-mono",
                children: [t.jsx("button", {
                  type: "button",
                  onClick: () => ur("classification"),
                  className: `px-1.5 py-0.5 transition-colors ${ce==="classification"?"bg-amber-500/15 text-amber-300":"bg-background text-muted-foreground hover:bg-accent"}`,
                  children: "Class"
                }), t.jsx("button", {
                  type: "button",
                  onClick: () => ur("basket"),
                  className: `px-1.5 py-0.5 border-l border-border transition-colors ${ce==="basket"?"bg-amber-500/15 text-amber-300":"bg-background text-muted-foreground hover:bg-accent"}`,
                  children: "Basket"
                })]
              })]
            }), ce === "classification" ? t.jsxs("div", {
              className: "flex gap-1",
              children: [t.jsx("select", {
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[110px]",
                value: we,
                onChange: e => {
                  Lr(e.target.value), Kt("")
                },
                "data-testid": "select-group-a-dim",
                title: "Classification dimension for Group A",
                children: Mr.map(e => t.jsx("option", {
                  value: e,
                  children: At[e]
                }, e))
              }), t.jsxs("select", {
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[170px]",
                value: oe,
                onChange: e => Kt(e.target.value),
                "data-testid": "select-group-a-value",
                title: "Classification value for Group A",
                children: [oe === "" && t.jsx("option", {
                  value: "",
                  children: "— select —"
                }), t.jsx("option", {
                  value: tt,
                  children: "All REITs"
                }), (vr[we] || []).map(e => t.jsx(
                  "option", {
                    value: e,
                    children: e
                  }, e))]
              })]
            }) : t.jsxs("div", {
              className: "flex gap-1 items-center",
              children: [je.length === 0 ? t.jsx("span", {
                className: "text-[10px] font-mono text-muted-foreground italic",
                children: "No baskets"
              }) : t.jsxs("select", {
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[180px]",
                value: wt,
                onChange: e => Yr(e.target.value),
                "data-testid": "select-group-a-basket",
                children: [!wt && t.jsx("option", {
                  value: "",
                  children: "— select basket —"
                }), je.map(e => t.jsxs("option", {
                  value: e.id,
                  children: [e.name, " (", e.tickers
                    .length, ")"
                  ]
                }, e.id))]
              }), t.jsx("button", {
                type: "button",
                onClick: () => kt(!0),
                className: "p-1 border border-dashed border-border rounded text-muted-foreground hover:text-amber-400 hover:border-amber-500/40 transition-colors",
                title: "Manage baskets",
                children: t.jsx(sr, {
                  className: "w-3 h-3"
                })
              })]
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsxs("div", {
              className: "flex items-center gap-1.5",
              children: [t.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Group B"
              }), t.jsxs("div", {
                className: "flex border border-border rounded overflow-hidden text-[9px] font-mono",
                children: [t.jsx("button", {
                  type: "button",
                  onClick: () => mr("classification"),
                  className: `px-1.5 py-0.5 transition-colors ${de==="classification"?"bg-amber-500/15 text-amber-300":"bg-background text-muted-foreground hover:bg-accent"}`,
                  children: "Class"
                }), t.jsx("button", {
                  type: "button",
                  onClick: () => mr("basket"),
                  className: `px-1.5 py-0.5 border-l border-border transition-colors ${de==="basket"?"bg-amber-500/15 text-amber-300":"bg-background text-muted-foreground hover:bg-accent"}`,
                  children: "Basket"
                })]
              })]
            }), de === "classification" ? t.jsxs("div", {
              className: "flex gap-1",
              children: [t.jsx("select", {
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[110px]",
                value: Ge,
                onChange: e => {
                  Ir(e.target.value), dr(tt)
                },
                "data-testid": "select-group-b-dim",
                title: "Classification dimension for Group B",
                children: Mr.map(e => t.jsx("option", {
                  value: e,
                  children: At[e]
                }, e))
              }), t.jsxs("select", {
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[170px]",
                value: he,
                onChange: e => dr(e.target.value),
                "data-testid": "select-group-b-value",
                title: "Classification value for Group B (or All REITs for entire universe)",
                children: [t.jsx("option", {
                  value: tt,
                  children: "All REITs"
                }), (vr[Ge] || []).map(e => t.jsx(
                  "option", {
                    value: e,
                    children: e
                  }, e))]
              })]
            }) : t.jsxs("div", {
              className: "flex gap-1 items-center",
              children: [je.length === 0 ? t.jsx("span", {
                className: "text-[10px] font-mono text-muted-foreground italic",
                children: "No baskets"
              }) : t.jsxs("select", {
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[180px]",
                value: jt,
                onChange: e => zr(e.target.value),
                "data-testid": "select-group-b-basket",
                children: [!jt && t.jsx("option", {
                  value: "",
                  children: "— select basket —"
                }), je.map(e => t.jsxs("option", {
                  value: e.id,
                  children: [e.name, " (", e.tickers
                    .length, ")"
                  ]
                }, e.id))]
              }), t.jsx("button", {
                type: "button",
                onClick: () => kt(!0),
                className: "p-1 border border-dashed border-border rounded text-muted-foreground hover:text-amber-400 hover:border-amber-500/40 transition-colors",
                title: "Manage baskets",
                children: t.jsx(sr, {
                  className: "w-3 h-3"
                })
              })]
            })]
          })]
        }) : null, t.jsxs("div", {
          className: "flex flex-col gap-0.5",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Valuation"
          }), t.jsx("select", {
            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[170px]",
            value: O,
            onChange: e => {
              Et.current = !0, Vt(e.target.value)
            },
            "data-testid": "select-val-metric",
            children: dn.map(e => t.jsx("option", {
              value: e.id,
              children: e.label
            }, e.id))
          })]
        }), t.jsxs("div", {
          className: "flex flex-col gap-0.5",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Growth"
          }), t.jsx("select", {
            className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[230px]",
            value: K,
            onChange: e => {
              Pr.current = !0, Bt(e.target.value)
            },
            "data-testid": "select-growth-metric",
            children: un.map(e => t.jsx("option", {
              value: e.id,
              children: e.label
            }, e.id))
          })]
        }), t.jsx("div", {
          className: "flex-1"
        }), t.jsxs("div", {
          className: "flex items-center gap-1.5",
          "data-testid": "chart-toggles",
          children: [t.jsxs("span", {
            className: "flex items-center gap-1 text-[9px] font-mono text-muted-foreground uppercase tracking-wider mr-1",
            children: [t.jsx(Js, {
              className: "w-3 h-3"
            }), " Charts"]
          }), hs.map(e => {
            const s = ee.has(e);
            return t.jsx("button", {
              onClick: () => {
                _r(o => {
                  const a = new Set(o);
                  return a.has(e) ? a.delete(e) : a.add(e), a
                })
              },
              className: `text-[10px] font-mono px-2 py-1 border rounded transition-colors ${s?"border-amber-500 bg-amber-500/15 text-amber-300":"border-border hover:bg-accent text-muted-foreground hover:text-foreground"}`,
              "data-testid": `toggle-chart-${e}`,
              title: `Show/hide ${xs[e]} chart`,
              children: xs[e]
            }, e)
          })]
        }), t.jsxs("div", {
          className: "flex items-center gap-2",
          children: [t.jsxs("button", {
            onClick: () => Br(!yt),
            className: `flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 border rounded ${yt?"border-amber-500 bg-amber-500/10 text-amber-400":"border-border hover:bg-accent text-muted-foreground hover:text-foreground"}`,
            "data-testid": "toggle-earnings",
            title: "Toggle earnings date markers",
            children: [t.jsx(fs, {
              className: "w-3.5 h-3.5"
            }), " Earnings"]
          }), t.jsxs("button", {
            onClick: Ts,
            className: "flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 border border-border rounded hover:bg-accent text-muted-foreground hover:text-foreground",
            "data-testid": "btn-csv",
            disabled: y.length === 0,
            children: [t.jsx(en, {
              className: "w-3.5 h-3.5"
            }), " CSV"]
          }), xr && t.jsxs("span", {
            className: "flex items-center gap-1 text-[10px] font-mono text-amber-400",
            children: [t.jsx(tn, {
              className: "w-3 h-3 animate-spin"
            }), " computing"]
          })]
        })]
      }), t.jsxs("div", {
        className: "mt-2 text-[10px] font-mono text-muted-foreground flex flex-wrap gap-x-4 gap-y-1",
        children: [f === "peer" ? t.jsxs(t.Fragment, {
          children: [t.jsxs("span", {
            children: [t.jsx("span", {
              className: "text-muted-foreground/60",
              children: "PEER GROUP:"
            }), " ", t.jsx("span", {
              className: "text-foreground",
              children: re || "—"
            }), " ", t.jsxs("span", {
              className: "text-muted-foreground/60",
              children: ["(", At[U], ")"]
            })]
          }), t.jsxs("span", {
            children: [t.jsx("span", {
              className: "text-muted-foreground/60",
              children: "PEERS:"
            }), " ", t.jsx("span", {
              className: "text-foreground",
              children: Ht.length
            }), fr > 0 && fr !== Ht.length && t.jsxs("span", {
              className: "text-muted-foreground/60",
              children: [" · ", fr, " with data"]
            })]
          }), t.jsxs("span", {
            children: [t.jsx("span", {
              className: "text-muted-foreground/60",
              children: "METHOD:"
            }), " ", t.jsx("span", {
              className: "text-foreground",
              children: "median, % diff vs peer"
            })]
          })]
        }) : f === "ticker" ? t.jsxs(t.Fragment, {
          children: [t.jsxs("span", {
            children: [t.jsx("span", {
              className: "text-muted-foreground/60",
              children: "PAIR:"
            }), " ", t.jsx("span", {
              className: "text-foreground",
              children: x || "—"
            }), " ", t.jsx("span", {
              className: "text-muted-foreground/60",
              children: "vs"
            }), " ", t.jsx("span", {
              className: "text-foreground",
              children: D || "—"
            }), Nr && Nr !== D && t.jsxs("span", {
              className: "text-muted-foreground/60",
              children: [" · ", Nr]
            })]
          }), t.jsxs("span", {
            children: [t.jsx("span", {
              className: "text-muted-foreground/60",
              children: "METHOD:"
            }), " ", t.jsx("span", {
              className: "text-foreground",
              children: "% diff vs ticker"
            })]
          })]
        }) : f === "basket" ? t.jsxs(t.Fragment, {
          children: [t.jsxs("span", {
            children: [t.jsx("span", {
              className: "text-muted-foreground/60",
              children: "BASKET:"
            }), " ", t.jsx("span", {
              className: "text-foreground",
              children: gt
            }), " ", se && t.jsxs("span", {
              className: "text-muted-foreground/60",
              children: ["(", se.tickers.length, " tickers)"]
            })]
          }), t.jsxs("span", {
            children: [t.jsx("span", {
              className: "text-muted-foreground/60",
              children: "TARGET:"
            }), " ", t.jsx("span", {
              className: "text-foreground",
              children: x || "—"
            })]
          }), t.jsxs("span", {
            children: [t.jsx("span", {
              className: "text-muted-foreground/60",
              children: "METHOD:"
            }), " ", t.jsx("span", {
              className: "text-foreground",
              children: "basket median, % diff"
            })]
          })]
        }) : t.jsxs(t.Fragment, {
          children: [t.jsxs("span", {
            children: [t.jsx("span", {
              className: "text-muted-foreground/60",
              children: "GROUP A:"
            }), " ", t.jsx("span", {
              className: "text-foreground",
              children: et
            }), " ", t.jsxs("span", {
              className: "text-muted-foreground/60",
              children: ["(", ce === "basket" ? `basket · ${Or}` :
                `${At[we]} · ${Or}`, ")"
              ]
            })]
          }), t.jsxs("span", {
            children: [t.jsx("span", {
              className: "text-muted-foreground/60",
              children: "GROUP B:"
            }), " ", t.jsx("span", {
              className: "text-foreground",
              children: Ae
            }), " ", t.jsxs("span", {
              className: "text-muted-foreground/60",
              children: ["(", de === "basket" ? `basket · ${Wr}` :
                `${At[Ge]} · ${Wr}`, ")"
              ]
            })]
          }), t.jsxs("span", {
            children: [t.jsx("span", {
              className: "text-muted-foreground/60",
              children: "METHOD:"
            }), " ", t.jsx("span", {
              className: "text-foreground",
              children: "median × median, % diff A vs B"
            })]
          })]
        }), Ur && t.jsx("span", {
          className: "text-red-400",
          children: Ur
        })]
      })]
    }), t.jsxs("div", {
      className: "grid grid-cols-2 md:grid-cols-7 gap-px bg-border border-b border-border flex-shrink-0",
      children: [t.jsx(dt, {
        label: "Premium / Discount",
        value: bs(R.lastP),
        sub: f === "peer" ? `vs ${O}` : f === "ticker" ? `vs ${D||"—"} · ${O}` :
          f === "basket" ? `vs basket ${gt} · ${O}` : `${et} vs ${Ae} · ${O}`,
        tone: R.lastP > 0 ? "rich" : R.lastP < 0 ? "cheap" : "neutral"
      }), t.jsx(dt, {
        label: "History percentile",
        value: Number.isFinite(R.pctile) ? `${R.pctile.toFixed(0)}%` : "—",
        sub: R.pctile > 80 ? "richest 20%" : R.pctile < 20 ? "cheapest 20%" :
          "mid-range",
        tone: R.pctile > 80 ? "rich" : R.pctile < 20 ? "cheap" : "neutral"
      }), t.jsx(dt, {
        label: "Z-score",
        value: Rr(R.z),
        sub: "vs own history",
        tone: R.z > 1.5 ? "rich" : R.z < -1.5 ? "cheap" : "neutral"
      }), t.jsx(dt, {
        label: "Growth differential",
        value: bs(R.lastG),
        sub: f === "peer" ? "pp vs peer median" : f === "ticker" ?
          `pp vs ${D||"—"}` : f === "basket" ? `pp vs basket ${gt}` :
          `pp · ${et} vs ${Ae}`,
        tone: R.lastG > 0 ? "cheap" : R.lastG < 0 ? "rich" : "neutral"
      }), t.jsx(dt, {
        label: "Premium ↔ Growth corr",
        value: Rr(R.corr),
        sub: R.corr > .4 ? "premium tracks growth" : R.corr < -.4 ?
          "premium fights growth" : "weak relationship",
        tone: "neutral"
      }), t.jsx(dt, {
        label: "Prem÷Δg ↔ A/B corr",
        value: Rr(R.corrRatioVsAB),
        sub: R.corrRatioVsAB > .4 ? "ratio tracks price spread" : R.corrRatioVsAB <
          -.4 ? "ratio fights price spread" : "weak relationship",
        tone: "neutral"
      }), t.jsx(dt, {
        label: "Rel return since anchor",
        value: Number.isFinite(R.relReturnSinceAnchor) ?
          `${R.relReturnSinceAnchor>=0?"+":""}${R.relReturnSinceAnchor.toFixed(1)}pp` :
          "—",
        sub: bt ? `since ${bt}${Pe?" (pin)":""}` : f === "peer" ? "vs peer median" :
          f === "ticker" ? `vs ${D||"—"}` : f === "basket" ? `vs basket ${gt}` :
          `${et} vs ${Ae}`,
        tone: R.relReturnSinceAnchor > 0 ? "cheap" : R.relReturnSinceAnchor < 0 ?
          "rich" : "neutral"
      }), t.jsx(dt, {
        label: "Forward 1Y rel return",
        value: Number.isFinite(R.forwardRelReturn252) ?
          `${R.forwardRelReturn252>=0?"+":""}${R.forwardRelReturn252.toFixed(1)}pp` :
          "—",
        sub: "252d after anchor",
        tone: R.forwardRelReturn252 > 0 ? "cheap" : R.forwardRelReturn252 < 0 ?
          "rich" : "neutral"
      })]
    }), (() => {
      const e = Ds,
        s = e.label === "Attractive" ?
        "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" : e.label ===
        "Expensive" ? "text-rose-300 border-rose-500/40 bg-rose-500/10" :
        "text-amber-300/90 border-amber-500/30 bg-amber-500/5",
        o = c => Number.isFinite(c) ? `${c>=0?"+":""}${c.toFixed(1)}pp` : "—",
        a = c => Number.isFinite(c) ? `${c>=0?"+":""}${c.toFixed(2)}%` : "—",
        r = ({
          p25: c,
          p50: i,
          p75: d,
          today: p,
          fmt: u
        }) => {
          const g = Math.min(c, i, d, p) - .5,
            w = Math.max(c, i, d, p) + .5,
            k = Math.max(.001, w - g),
            v = P => `${(P-g)/k*100}%`;
          return t.jsxs("div", {
            className: "relative h-5 w-full bg-muted/20 rounded-sm overflow-hidden",
            children: [t.jsx("div", {
              className: "absolute top-0 bottom-0 bg-cyan-500/15 border-l border-r border-cyan-400/40",
              style: {
                left: v(c),
                width: `calc(${v(d)} - ${v(c)})`
              },
              title: `IQR: ${u(c)} … ${u(d)}`
            }), t.jsx("div", {
              className: "absolute top-0 bottom-0 w-px bg-cyan-300",
              style: {
                left: v(i)
              },
              title: `Implied: ${u(i)}`
            }), t.jsx("div", {
              className: "absolute top-0 bottom-0 w-0.5 bg-amber-300",
              style: {
                left: v(p)
              },
              title: `Today: ${u(p)}`
            })]
          })
        };
      return t.jsxs("div", {
        className: "border-b border-border bg-card/60 flex-shrink-0",
        "data-testid": "rv-verdict-panel",
        children: [t.jsxs("div", {
          className: "px-3 py-2 flex items-center gap-3 flex-wrap",
          children: [t.jsx("span", {
            className: "text-[10px] font-mono text-amber-300 uppercase tracking-wider",
            children: "RV Verdict"
          }), t.jsx("span", {
            className: `text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${s}`,
            "data-testid": "rv-verdict-label",
            children: e.label
          }), t.jsx("span", {
            className: "text-[10px] font-mono text-muted-foreground",
            "data-testid": "rv-verdict-rationale",
            children: e.rationale
          }), t.jsxs("div", {
            className: "ml-auto flex items-center gap-2",
            children: [t.jsx("label", {
              className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
              children: "Band"
            }), t.jsxs("select", {
              "data-testid": "rv-band-select",
              value: String(ft),
              onChange: c => Vr(parseFloat(c.target.value)),
              className: "h-6 text-[11px] font-mono bg-background border border-border rounded px-1.5",
              children: [t.jsx("option", {
                value: "0.05",
                children: "Ultra Tight (0.05σ)"
              }), t.jsx("option", {
                value: "0.10",
                children: "Very Tight (0.10σ)"
              }), t.jsx("option", {
                value: "0.20",
                children: "Tight (0.20σ)"
              }), t.jsx("option", {
                value: "0.35",
                children: "Default (0.35σ)"
              }), t.jsx("option", {
                value: "0.50",
                children: "Loose (0.50σ)"
              })]
            })]
          })]
        }), t.jsxs("div", {
          className: "grid grid-cols-1 md:grid-cols-2 gap-px bg-border border-t border-border",
          children: [t.jsxs("div", {
            className: "px-3 py-2 bg-card/60",
            "data-testid": "rv-prem-given-growth",
            children: [t.jsxs("div", {
              className: "flex items-baseline justify-between gap-2 mb-1",
              children: [t.jsx("span", {
                className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Premium given growth"
              }), t.jsxs("span", {
                className: "text-[10px] font-mono text-muted-foreground/70",
                children: ["when Δg ∈ [", a(e.premGivenGrowth
                    ?.bandLo ?? NaN), ", ", a(e
                    .premGivenGrowth?.bandHi ?? NaN), "]", e
                  .premGivenGrowth ?
                  ` · n=${e.premGivenGrowth.n}` : ""
                ]
              })]
            }), e.premGivenGrowth ? t.jsxs(t.Fragment, {
              children: [t.jsxs("div", {
                className: "flex items-baseline gap-3 mb-1.5 flex-wrap",
                children: [t.jsxs("span", {
                  className: "text-[11px] font-mono",
                  children: [t.jsx("span", {
                    className: "text-muted-foreground",
                    children: "today "
                  }), t.jsx("span", {
                    className: "text-amber-300",
                    children: a(R.lastP)
                  })]
                }), t.jsxs("span", {
                  className: "text-[11px] font-mono",
                  children: [t.jsx("span", {
                    className: "text-muted-foreground",
                    children: "implied "
                  }), t.jsx("span", {
                    className: "text-cyan-300",
                    children: a(e.impliedPrem)
                  })]
                }), t.jsxs("span", {
                  className: `text-[11px] font-mono ${e.premGap<0?"text-emerald-300":e.premGap>0?"text-rose-300":"text-muted-foreground"}`,
                  "data-testid": "rv-prem-gap",
                  children: ["gap ", o(e.premGap), " ",
                    e.premGap < 0 ?
                    "→ cheap-for-growth" : e.premGap >
                    0 ? "→ rich-for-growth" : ""
                  ]
                })]
              }), t.jsx(r, {
                p25: e.premGivenGrowth.p25,
                p50: e.premGivenGrowth.median,
                p75: e.premGivenGrowth.p75,
                today: R.lastP,
                fmt: a
              }), t.jsxs("div", {
                className: "flex justify-between text-[9px] font-mono text-muted-foreground/70 mt-1",
                children: [t.jsxs("span", {
                  children: ["p25 ", a(e.premGivenGrowth
                    .p25)]
                }), t.jsxs("span", {
                  children: ["median ", a(e
                    .premGivenGrowth.median)]
                }), t.jsxs("span", {
                  children: ["p75 ", a(e.premGivenGrowth
                    .p75)]
                })]
              }), t.jsxs("div", {
                className: "text-[9px] font-mono text-muted-foreground/70 mt-0.5",
                children: ["today is at ", t.jsxs("span", {
                  className: "text-amber-300",
                  children: [e.premGivenGrowth
                    .todayPctile.toFixed(0),
                    "th pctile"
                  ]
                }), " of conditional sample"]
              })]
            }) : t.jsx("span", {
              className: "text-[11px] font-mono text-muted-foreground",
              children: "insufficient sample"
            })]
          }), t.jsxs("div", {
            className: "px-3 py-2 bg-card/60",
            "data-testid": "rv-growth-given-prem",
            children: [t.jsxs("div", {
              className: "flex items-baseline justify-between gap-2 mb-1",
              children: [t.jsx("span", {
                className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
                children: "Growth given premium"
              }), t.jsxs("span", {
                className: "text-[10px] font-mono text-muted-foreground/70",
                children: ["when premium ∈ [", a(e
                    .growthGivenPrem?.bandLo ?? NaN), ", ",
                  a(e.growthGivenPrem?.bandHi ?? NaN), "]",
                  e.growthGivenPrem ?
                  ` · n=${e.growthGivenPrem.n}` : ""
                ]
              })]
            }), e.growthGivenPrem ? t.jsxs(t.Fragment, {
              children: [t.jsxs("div", {
                className: "flex items-baseline gap-3 mb-1.5 flex-wrap",
                children: [t.jsxs("span", {
                  className: "text-[11px] font-mono",
                  children: [t.jsx("span", {
                    className: "text-muted-foreground",
                    children: "today "
                  }), t.jsx("span", {
                    className: "text-amber-300",
                    children: a(R.lastG)
                  })]
                }), t.jsxs("span", {
                  className: "text-[11px] font-mono",
                  children: [t.jsx("span", {
                    className: "text-muted-foreground",
                    children: "implied "
                  }), t.jsx("span", {
                    className: "text-cyan-300",
                    children: a(e.impliedGrowth)
                  })]
                }), t.jsxs("span", {
                  className: `text-[11px] font-mono ${e.growthGap>0?"text-emerald-300":e.growthGap<0?"text-rose-300":"text-muted-foreground"}`,
                  "data-testid": "rv-growth-gap",
                  children: ["gap ", o(e.growthGap),
                    " ", e.growthGap > 0 ?
                    "→ excess growth" : e.growthGap <
                    0 ? "→ weak growth" : ""
                  ]
                })]
              }), t.jsx(r, {
                p25: e.growthGivenPrem.p25,
                p50: e.growthGivenPrem.median,
                p75: e.growthGivenPrem.p75,
                today: R.lastG,
                fmt: a
              }), t.jsxs("div", {
                className: "flex justify-between text-[9px] font-mono text-muted-foreground/70 mt-1",
                children: [t.jsxs("span", {
                  children: ["p25 ", a(e.growthGivenPrem
                    .p25)]
                }), t.jsxs("span", {
                  children: ["median ", a(e
                    .growthGivenPrem.median)]
                }), t.jsxs("span", {
                  children: ["p75 ", a(e.growthGivenPrem
                    .p75)]
                })]
              }), t.jsxs("div", {
                className: "text-[9px] font-mono text-muted-foreground/70 mt-0.5",
                children: ["today is at ", t.jsxs("span", {
                  className: "text-amber-300",
                  children: [e.growthGivenPrem
                    .todayPctile.toFixed(0),
                    "th pctile"
                  ]
                }), " of conditional sample"]
              })]
            }) : t.jsx("span", {
              className: "text-[11px] font-mono text-muted-foreground",
              children: "insufficient sample"
            })]
          })]
        })]
      })
    })(), ee.has("similar") && t.jsxs("div", {
      className: "border-b border-border bg-card/60 flex-shrink-0",
      "data-testid": "similar-setups-panel",
      children: [t.jsxs("div", {
        className: "px-3 py-2 border-b border-border flex items-center gap-3 flex-wrap",
        children: [t.jsxs("div", {
          className: "flex items-center gap-1.5",
          children: [t.jsx("span", {
            className: "text-[10px] font-mono text-amber-300 uppercase tracking-wider",
            children: "Similar Setups"
          }), E && t.jsxs("span", {
            className: "text-[9px] font-mono text-muted-foreground",
            children: ["today z=(", E.todayZPrem.toFixed(2), ", ", E
              .todayZGrowth.toFixed(2), ") ·", " ", E.matches.length,
              "/", E.totalCandidates, " bars matched", E
              .droppedByGap > 0 && t.jsxs("span", {
                className: "text-muted-foreground/70",
                children: [" · ", E.droppedByGap, " dropped by gap"]
              })
            ]
          })]
        }), E && E.matches.length > 0 && E.yearMax >= E.yearMin && t.jsxs(
        "div", {
          className: "flex items-end gap-px h-5",
          "data-testid": "similar-year-spark",
          title: "Matches by calendar year",
          children: [(() => {
            const e = [];
            let s = 1;
            for (const o of E.yearCounts.values()) o > s && (s = o);
            for (let o = E.yearMin; o <= E.yearMax; o++) {
              const a = E.yearCounts.get(o) || 0,
                r = a === 0 ? 2 : Math.max(3, Math.round(a / s * 18));
              e.push(t.jsx("div", {
                className: a > 0 ? "bg-amber-400/80" :
                  "bg-muted-foreground/20",
                style: {
                  width: 4,
                  height: `${r}px`
                },
                title: `${o}: ${a}`
              }, o))
            }
            return e
          })(), t.jsxs("span", {
            className: "text-[8px] font-mono text-muted-foreground/70 ml-1 leading-none self-center",
            children: [E.yearMin, "–", E.yearMax]
          })]
        }), E && E.cluster && t.jsxs("span", {
          className: "text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5",
          title: "More than half of the matches fall in a single ~4-month window. Forward stats reflect that one regime, not a broad base rate.",
          "data-testid": "similar-cluster-warning",
          children: ["⚠ ", Math.round(E.cluster.share * 100), "% in ", E
            .cluster.dominantMonth
          ]
        }), t.jsx("div", {
          className: "flex-1"
        }), t.jsxs("div", {
          className: "flex items-center gap-2",
          children: [t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "N"
          }), t.jsx("select", {
            value: Lt,
            onChange: e => Dr(Number(e.target.value)),
            className: "text-[10px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
            "data-testid": "similar-n-select",
            children: [10, 20, 30, 50, 100].map(e => t.jsx("option", {
              value: e,
              children: e
            }, e))
          }), t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "exclude last"
          }), t.jsx("select", {
            value: It,
            onChange: e => Tr(Number(e.target.value)),
            className: "text-[10px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
            "data-testid": "similar-exclude-select",
            children: [{
              v: 63,
              l: "3M"
            }, {
              v: 126,
              l: "6M"
            }, {
              v: 252,
              l: "1Y"
            }, {
              v: 504,
              l: "2Y"
            }].map(e => t.jsx("option", {
              value: e.v,
              children: e.l
            }, e.v))
          }), t.jsx("label", {
            className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
            title: "Minimum trading-day spacing between accepted matches — prevents N matches from collapsing into a single regime.",
            children: "min gap"
          }), t.jsx("select", {
            value: Nt,
            onChange: e => Er(Number(e.target.value)),
            className: "text-[10px] font-mono px-1.5 py-0.5 bg-background border border-border rounded text-foreground",
            "data-testid": "similar-mingap-select",
            title: "Minimum trading-day spacing between accepted matches",
            children: [{
              v: 0,
              l: "none"
            }, {
              v: 5,
              l: "5d"
            }, {
              v: 21,
              l: "1M"
            }, {
              v: 30,
              l: "~6w"
            }, {
              v: 63,
              l: "3M"
            }, {
              v: 126,
              l: "6M"
            }, {
              v: 252,
              l: "1Y"
            }].map(e => t.jsx("option", {
              value: e.v,
              children: e.l
            }, e.v))
          })]
        })]
      }), E ? t.jsxs("div", {
        className: "grid grid-cols-1 md:grid-cols-3 gap-px bg-border",
        children: [t.jsx(Cr, {
          label: "Forward 3M",
          stats: E.h3M
        }), t.jsx(Cr, {
          label: "Forward 6M",
          stats: E.h6M
        }), t.jsx(Cr, {
          label: "Forward 1Y",
          stats: E.h1Y
        })]
      }) : t.jsx("div", {
        className: "px-3 py-3 text-[10px] font-mono text-muted-foreground",
        children: "Need at least 60 aligned bars and 252 paired closes — still loading or insufficient history."
      }), E && E.matches.length > 0 && t.jsxs("details", {
        className: "border-t border-border",
        children: [t.jsxs("summary", {
          className: "px-3 py-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground cursor-pointer select-none",
          children: ["Show top-", E.matches.length, " matched dates"]
        }), t.jsx("div", {
          className: "px-3 pb-2 overflow-x-auto",
          children: t.jsxs("table", {
            className: "w-full text-[10px] font-mono",
            children: [t.jsx("thead", {
              children: t.jsxs("tr", {
                className: "text-muted-foreground/70 uppercase tracking-wider",
                children: [t.jsx("th", {
                  className: "text-left font-normal pr-3 py-1",
                  children: "Date"
                }), t.jsx("th", {
                  className: "text-right font-normal pr-3 py-1",
                  children: "z‑prem"
                }), t.jsx("th", {
                  className: "text-right font-normal pr-3 py-1",
                  children: "z‑growth"
                }), t.jsx("th", {
                  className: "text-right font-normal pr-3 py-1",
                  children: "dist"
                }), t.jsx("th", {
                  className: "text-right font-normal pr-3 py-1",
                  children: "fwd 3M"
                }), t.jsx("th", {
                  className: "text-right font-normal pr-3 py-1",
                  children: "fwd 6M"
                }), t.jsx("th", {
                  className: "text-right font-normal py-1",
                  children: "fwd 1Y"
                })]
              })
            }), t.jsx("tbody", {
              children: E.matches.map(e => t.jsxs("tr", {
                className: "border-t border-border/40",
                "data-testid": `similar-row-${e.date}`,
                children: [t.jsx("td", {
                  className: "text-foreground pr-3 py-0.5",
                  children: e.date
                }), t.jsx("td", {
                  className: "text-right text-muted-foreground pr-3 py-0.5",
                  children: e.zPrem.toFixed(2)
                }), t.jsx("td", {
                  className: "text-right text-muted-foreground pr-3 py-0.5",
                  children: e.zGrowth.toFixed(2)
                }), t.jsx("td", {
                  className: "text-right text-muted-foreground pr-3 py-0.5",
                  children: e.distance.toFixed(2)
                }), t.jsx("td", {
                  className: `text-right pr-3 py-0.5 ${Number.isFinite(e.fwd3M)?e.fwd3M>=0?"text-green-400":"text-red-400":"text-muted-foreground/50"}`,
                  children: Number.isFinite(e.fwd3M) ?
                    `${e.fwd3M>=0?"+":""}${e.fwd3M.toFixed(1)}` :
                    "—"
                }), t.jsx("td", {
                  className: `text-right pr-3 py-0.5 ${Number.isFinite(e.fwd6M)?e.fwd6M>=0?"text-green-400":"text-red-400":"text-muted-foreground/50"}`,
                  children: Number.isFinite(e.fwd6M) ?
                    `${e.fwd6M>=0?"+":""}${e.fwd6M.toFixed(1)}` :
                    "—"
                }), t.jsx("td", {
                  className: `text-right py-0.5 ${Number.isFinite(e.fwd1Y)?e.fwd1Y>=0?"text-green-400":"text-red-400":"text-muted-foreground/50"}`,
                  children: Number.isFinite(e.fwd1Y) ?
                    `${e.fwd1Y>=0?"+":""}${e.fwd1Y.toFixed(1)}` :
                    "—"
                })]
              }, e.date))
            })]
          })
        })]
      })]
    }), t.jsxs("div", {
      className: "flex-1 grid grid-cols-1 lg:grid-cols-5 gap-px bg-border min-h-0 overflow-hidden",
      children: [t.jsxs("div", {
        className: "lg:col-span-3 flex flex-col gap-px bg-border min-h-0",
        children: [t.jsxs("div", {
          className: "flex flex-col bg-card flex-1 min-h-0",
          style: {
            display: ee.has("premium") ? void 0 : "none"
          },
          children: [t.jsxs("div", {
            className: "px-3 py-1.5 border-b border-border flex items-center justify-between gap-2",
            children: [t.jsx("span", {
              className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap",
              children: "Premium / Discount (%)"
            }), t.jsxs("div", {
              className: "flex items-center gap-2 text-[10px] font-mono",
              children: [t.jsx(vt, {
                hoverTime: X,
                value: X != null ? Ps.get(X) : void 0,
                format: e =>
                  `${e>=0?"+":""}${e.toFixed(2)}%`,
                color: "text-amber-300",
                testId: "hover-premium"
              }), t.jsx("span", {
                className: "text-foreground",
                children: O
              })]
            })]
          }), t.jsx("div", {
            ref: He,
            className: "flex-1 min-h-0",
            "data-testid": "chart-premium"
          })]
        }), t.jsxs("div", {
          className: "flex flex-col bg-card flex-1 min-h-0",
          style: {
            display: ee.has("growth") ? void 0 : "none"
          },
          children: [t.jsxs("div", {
            className: "px-3 py-1.5 border-b border-border flex items-center justify-between gap-2",
            children: [t.jsx("span", {
              className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap",
              children: "Growth Differential (pp)"
            }), t.jsxs("div", {
              className: "flex items-center gap-2 text-[10px] font-mono",
              children: [t.jsx(vt, {
                hoverTime: X,
                value: X != null ? Fs.get(X) : void 0,
                format: e =>
                  `${e>=0?"+":""}${e.toFixed(2)}pp`,
                color: "text-sky-300",
                testId: "hover-growth"
              }), t.jsx("span", {
                className: "text-foreground",
                children: K
              })]
            })]
          }), t.jsx("div", {
            ref: qe,
            className: "flex-1 min-h-0",
            "data-testid": "chart-growth"
          })]
        }), t.jsxs("div", {
          className: "flex flex-col bg-card flex-1 min-h-0",
          style: {
            display: ee.has("ratio") ? void 0 : "none"
          },
          children: [t.jsxs("div", {
            className: "px-3 py-1.5 border-b border-border flex items-center justify-between gap-2",
            children: [t.jsx("span", {
              className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap",
              children: "Premium ÷ Growth Diff (ratio)"
            }), t.jsxs("div", {
              className: "flex items-center gap-2 text-[10px] font-mono",
              children: [t.jsx(vt, {
                hoverTime: X,
                value: X != null ? $s.get(X) : void 0,
                format: e =>
                  `${e>=0?"+":""}${e.toFixed(2)}×`,
                color: "text-violet-300",
                testId: "hover-ratio"
              }), t.jsxs("span", {
                className: "text-purple-300",
                title: "Dropped when |Δg| < 0.5pp or |ratio| > 50",
                children: [me.length, " pts"]
              })]
            })]
          }), t.jsx("div", {
            ref: Ue,
            className: "flex-1 min-h-0",
            "data-testid": "chart-ratio"
          })]
        }), t.jsxs("div", {
          className: "flex flex-col bg-card flex-1 min-h-0",
          style: {
            display: ee.has("rollCorr") ? void 0 : "none"
          },
          children: [t.jsxs("div", {
            className: "px-3 py-1.5 border-b border-border flex items-center justify-between gap-3",
            children: [t.jsxs("span", {
              className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap flex items-center gap-2",
              children: [t.jsx("span", {
                children: "Rolling Corr"
              }), t.jsxs("span", {
                className: "flex items-center gap-1 normal-case tracking-normal",
                children: [t.jsx("span", {
                  className: "inline-block w-2 h-0.5 bg-teal-400"
                }), t.jsx("span", {
                  className: "text-teal-300",
                  children: "Prem↔Δg"
                })]
              }), t.jsxs("span", {
                className: "flex items-center gap-1 normal-case tracking-normal",
                children: [t.jsx("span", {
                  className: "inline-block w-2 h-0.5 bg-fuchsia-500"
                }), t.jsx("span", {
                  className: "text-fuchsia-400",
                  children: "Prem÷Δg↔A/B"
                })]
              })]
            }), t.jsxs("div", {
              className: "flex items-center gap-3 text-[10px] font-mono",
              children: [t.jsxs("label", {
                className: "flex items-center gap-1 text-muted-foreground",
                children: [t.jsx("span", {
                  className: "uppercase tracking-wider",
                  children: "Win"
                }), t.jsxs("select", {
                  value: mt,
                  onChange: e => Gr(Number(e.target
                    .value)),
                  className: "bg-background border border-border rounded px-1.5 py-0.5 text-[10px] font-mono text-foreground",
                  "data-testid": "select-roll-window",
                  children: [t.jsx("option", {
                    value: 30,
                    children: "30 (1M)"
                  }), t.jsx("option", {
                    value: 60,
                    children: "60 (3M)"
                  }), t.jsx("option", {
                    value: 120,
                    children: "120 (6M)"
                  }), t.jsx("option", {
                    value: 252,
                    children: "252 (1Y)"
                  })]
                })]
              }), t.jsxs("label", {
                className: "flex items-center gap-1 text-muted-foreground",
                children: [t.jsx("span", {
                  className: "uppercase tracking-wider",
                  title: "lag>0: growth leads premium · lag<0: premium leads growth",
                  children: "Lag"
                }), t.jsx("input", {
                  type: "number",
                  min: -60,
                  max: 60,
                  step: 1,
                  value: pt,
                  onChange: e => {
                    const s = Number(e.target
                    .value);
                    Number.isFinite(s) && Ar(Math
                      .max(-60, Math.min(60, Math
                        .round(s))))
                  },
                  className: "bg-background border border-border rounded px-1.5 py-0.5 w-[52px] text-[10px] font-mono text-foreground",
                  "data-testid": "input-roll-lag"
                }), t.jsx("span", {
                  className: "text-foreground",
                  children: "d"
                })]
              }), er ? t.jsxs("span", {
                className: "text-teal-300",
                title: "Best lag from full-sample cross-correlation (±60d)",
                children: ["Peak: ", er.lag >= 0 ? "+" : "",
                  er.lag, "d · ρ=", er.rho.toFixed(2)
                ]
              }) : t.jsx("span", {
                className: "text-muted-foreground",
                children: "Peak: —"
              }), t.jsx(vt, {
                hoverTime: X,
                value: X != null ? Gs.get(X) : void 0,
                format: e =>
                  `${e>=0?"+":""}${e.toFixed(2)}`,
                color: "text-teal-300",
                testId: "hover-rollcorr"
              })]
            })]
          }), t.jsx("div", {
            ref: Ke,
            className: "flex-1 min-h-0",
            "data-testid": "chart-roll-corr"
          })]
        }), t.jsxs("div", {
          className: "flex flex-col bg-card flex-1 min-h-0",
          style: {
            display: ee.has("relReturn") ? void 0 : "none"
          },
          children: [t.jsxs("div", {
            className: "px-3 py-1.5 border-b border-border flex items-center justify-between gap-2",
            children: [t.jsxs("span", {
              className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap",
              children: ["Rel Return (pp)", " ", t.jsxs("span", {
                className: "text-muted-foreground/60 normal-case tracking-normal",
                children: ["vs anchor: ", bt || "—"]
              })]
            }), t.jsxs("div", {
              className: "flex items-center gap-2 text-[10px] font-mono",
              children: [t.jsx(vt, {
                hoverTime: X,
                value: X != null ? ls.get(X) : void 0,
                format: e =>
                  `${e>=0?"+":""}${e.toFixed(2)}pp`,
                color: "text-emerald-300",
                testId: "hover-relreturn"
              }), gr ? t.jsx("span", {
                className: "text-muted-foreground/60",
                children: "loading…"
              }) : t.jsx("span", {
                className: "text-emerald-300",
                children: f === "peer" ?
                  "A vs peer median" : f === "ticker" ?
                  `A vs ${D||"—"}` : `${et} vs ${Ae}`
              })]
            })]
          }), t.jsx("div", {
            ref: Ze,
            className: "flex-1 min-h-0",
            "data-testid": "chart-rel-return"
          })]
        }), t.jsxs("div", {
          className: "flex flex-col bg-card flex-1 min-h-0",
          style: {
            display: ee.has("relRatio") ? void 0 : "none"
          },
          children: [t.jsxs("div", {
            className: "px-3 py-1.5 border-b border-border flex items-center justify-between gap-2",
            children: [t.jsxs("span", {
              className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap",
              children: ["Rel Strength (×, log)", " ", t.jsxs(
                "span", {
                  className: "text-muted-foreground/60 normal-case tracking-normal",
                  children: ["vs anchor: ", bt || "—"]
                })]
            }), t.jsxs("div", {
              className: "flex items-center gap-2 text-[10px] font-mono",
              children: [t.jsx(vt, {
                hoverTime: X,
                value: X != null ? cs.get(X) : void 0,
                format: e => `${e.toFixed(3)}×`,
                color: "text-rose-300",
                testId: "hover-relratio"
              }), gr ? t.jsx("span", {
                className: "text-muted-foreground/60",
                children: "loading…"
              }) : t.jsx("span", {
                className: "text-rose-300",
                children: f === "peer" ? "A / peer median" :
                  f === "ticker" ? `A / ${D||"—"}` :
                  `${et} / ${Ae}`
              })]
            })]
          }), t.jsx("div", {
            ref: Xe,
            className: "flex-1 min-h-0",
            "data-testid": "chart-rel-ratio"
          })]
        }), t.jsxs("div", {
          className: "flex flex-col bg-card flex-1 min-h-0",
          style: {
            display: ee.has("rawRatio") ? void 0 : "none"
          },
          children: [t.jsxs("div", {
            className: "px-3 py-1.5 border-b border-border flex items-center justify-between gap-2",
            children: [t.jsxs("span", {
              className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap",
              children: ["A / B Ratio (×, log)", " ", t.jsx(
                "span", {
                  className: "text-muted-foreground/60 normal-case tracking-normal",
                  children: "raw price ratio — no anchor"
                })]
            }), t.jsxs("div", {
              className: "flex items-center gap-2 text-[10px] font-mono",
              children: [t.jsx(vt, {
                hoverTime: X,
                value: X != null ? As.get(X) : void 0,
                format: e => `${e.toFixed(3)}×`,
                color: "text-sky-300",
                testId: "hover-rawratio"
              }), gr ? t.jsx("span", {
                className: "text-muted-foreground/60",
                children: "loading…"
              }) : t.jsx("span", {
                className: "text-sky-300",
                children: f === "peer" ? "A / peer median" :
                  f === "ticker" ? `A / ${D||"—"}` :
                  `${et} / ${Ae}`
              })]
            })]
          }), t.jsx("div", {
            ref: Qe,
            className: "flex-1 min-h-0",
            "data-testid": "chart-raw-ratio"
          })]
        }), t.jsxs("div", {
          className: "flex flex-col bg-card flex-1 min-h-0",
          style: {
            display: ee.has("rvVerdictTs") ? void 0 : "none"
          },
          children: [t.jsxs("div", {
            className: "px-3 py-1.5 border-b border-border flex items-center justify-between gap-2",
            children: [t.jsxs("span", {
              className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider whitespace-nowrap",
              children: ["RV Verdict (history)", " ", t.jsx(
                "span", {
                  className: "text-muted-foreground/60 normal-case tracking-normal",
                  children: "green = attractive · red = expensive · gray = neutral"
                })]
            }), t.jsx("div", {
              className: "flex items-center gap-3 text-[10px] font-mono",
              children: (() => {
                const e = Ee.length ? Ee[Ee.length - 1] :
                null;
                if (!e) return t.jsx("span", {
                  className: "text-muted-foreground/60",
                  children: "—"
                });
                const s = e.label === "Attractive" ?
                  "text-emerald-400" : e.label ===
                  "Expensive" ? "text-rose-400" :
                  "text-muted-foreground";
                return t.jsxs("span", {
                  className: s,
                  "data-testid": "hover-rvverdict",
                  children: [e.label, " (", e.score >= 0 ?
                    "+" : "", e.score, ")"
                  ]
                })
              })()
            })]
          }), t.jsx("div", {
            ref: Je,
            className: "flex-1 min-h-0",
            "data-testid": "chart-rv-verdict"
          })]
        })]
      }), t.jsxs("div", {
        className: "flex flex-col bg-card min-h-0 lg:col-span-2",
        children: [t.jsxs("div", {
          className: "px-3 py-1.5 border-b border-border flex items-center justify-between",
          children: [t.jsx("span", {
            className: "text-[10px] font-mono text-muted-foreground uppercase tracking-wider",
            children: "Growth × Premium (history)"
          }), t.jsxs("div", {
            className: "flex items-center gap-3 text-[10px] font-mono",
            children: [t.jsxs("div", {
              className: "flex border border-border rounded overflow-hidden",
              children: [t.jsx("button", {
                onClick: () => or("heatmap"),
                className: `px-2 py-0.5 transition-colors ${ut==="heatmap"?"bg-amber-500/15 text-amber-300":"bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`,
                "data-testid": "btn-scatter-heatmap",
                title: "Density heatmap — best for dense, multi-year history",
                children: "Heatmap"
              }), t.jsx("button", {
                onClick: () => or("points"),
                className: `px-2 py-0.5 transition-colors border-l border-border ${ut==="points"?"bg-amber-500/15 text-amber-300":"bg-background text-muted-foreground hover:bg-accent hover:text-foreground"}`,
                "data-testid": "btn-scatter-points",
                title: "Point cloud — each dot is one trading day, with age fade",
                children: "Points"
              })]
            }), Pe && t.jsx("span", {
              className: "text-green-400",
              children: "pin"
            }), Fe && t.jsx("span", {
              className: "text-sky-400",
              children: "filter"
            }), t.jsx("span", {
              className: "text-amber-400",
              children: "today"
            })]
          })]
        }), t.jsxs("div", {
          className: "px-3 py-2 border-b border-border flex items-end gap-3 flex-wrap",
          children: [t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsxs("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1",
              children: [t.jsx(cn, {
                className: "w-2.5 h-2.5"
              }), " Pin date"]
            }), t.jsxs("div", {
              className: "flex items-center gap-1",
              children: [t.jsx("input", {
                type: "date",
                value: Pe,
                onChange: e => ar(e.target.value),
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[150px] text-foreground",
                "data-testid": "input-pin-date"
              }), Pe && t.jsx("button", {
                onClick: () => ar(""),
                className: "text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent",
                title: "Clear pin",
                "data-testid": "btn-clear-pin",
                children: t.jsx(ps, {
                  className: "w-3 h-3"
                })
              })]
            })]
          }), t.jsxs("div", {
            className: "flex flex-col gap-0.5",
            children: [t.jsxs("label", {
              className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1",
              children: [t.jsx(fs, {
                className: "w-2.5 h-2.5"
              }), " Highlight range"]
            }), t.jsxs("div", {
              className: "flex items-center gap-1",
              children: [t.jsx("input", {
                type: "date",
                value: (() => {
                  const e = Fe.match(
                    /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/
                    );
                  return e ? e[1] : ""
                })(),
                onChange: e => {
                  const s = e.target.value,
                    o = Fe.match(
                      /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/
                      ),
                    a = o ? o[2] : "";
                  _e(s && a ? `${s}..${a}` : s ?
                    `${s}..${s}` : "")
                },
                title: "Start date",
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[140px] text-foreground placeholder:text-muted-foreground/50 [color-scheme:dark]",
                "data-testid": "input-period-start"
              }), t.jsx("span", {
                className: "text-[10px] font-mono text-muted-foreground",
                children: "to"
              }), t.jsx("input", {
                type: "date",
                value: (() => {
                  const e = Fe.match(
                    /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/
                    );
                  return e ? e[2] : ""
                })(),
                onChange: e => {
                  const s = e.target.value,
                    o = Fe.match(
                      /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/
                      ),
                    a = o ? o[1] : "";
                  _e(a && s ? `${a}..${s}` : s ?
                    `${s}..${s}` : "")
                },
                title: "End date",
                className: "text-xs font-mono bg-background border border-border rounded px-2 py-1 w-[140px] text-foreground placeholder:text-muted-foreground/50 [color-scheme:dark]",
                "data-testid": "input-period-end"
              }), Fe && t.jsx("button", {
                onClick: () => _e(""),
                className: "text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent",
                title: "Clear filter",
                "data-testid": "btn-clear-period",
                children: t.jsx(ps, {
                  className: "w-3 h-3"
                })
              })]
            })]
          }), Fe && t.jsx("span", {
            className: "text-[10px] font-mono text-sky-400 ml-auto",
            children: (() => {
              const e = vs(Fe);
              if (!e) return "invalid format";
              const s = new Map;
              for (const a of C) s.set(a.time, a.value);
              let o = 0;
              for (const a of y) s.has(a.time) && e(a.time) && o++;
              return `${o} dots highlighted`
            })()
          })]
        }), t.jsx("div", {
          className: "flex-1 min-h-0 relative",
          children: t.jsx("canvas", {
            ref: Xr,
            className: "w-full h-full block",
            "data-testid": "canvas-scatter"
          })
        }), t.jsx("div", {
          className: "px-3 py-1.5 border-t border-border text-[9px] font-mono text-muted-foreground/70 leading-snug",
          children: ut === "heatmap" ? t.jsxs(t.Fragment, {
            children: [
              "Each cell shows how many trading days landed in that (Δgrowth, premium) bucket — brighter = more frequent. Top-right = expensive AND faster-growing than",
              " ", f === "peer" ? "peers" : f === "ticker" ? D ||
              "comparison" : f === "basket" ? gt : Ae,
              "; bottom-left = cheap AND slower-growing. Switch to Points to see individual days."
            ]
          }) : t.jsxs(t.Fragment, {
            children: [
              "Each dot is one trading day. Older points fade purple→amber. Top-right = expensive AND faster-growing than",
              " ", f === "peer" ? "peers" : f === "ticker" ? D ||
              "comparison" : f === "basket" ? gt : Ae,
              "; bottom-left = cheap AND slower-growing. Pin a date or pick a start/end date range to inspect specific windows."
            ]
          })
        })]
      })]
    }), js && t.jsx("div", {
      className: "fixed inset-0 z-50 flex items-start justify-center pt-24",
      onClick: e => {
        e.target === e.currentTarget && kt(!1)
      },
      style: {
        background: "rgba(0,0,0,0.55)"
      },
      children: t.jsx(rn, {
        tickers: j,
        onClose: () => kt(!1),
        initialBasketId: ue || void 0
      })
    })]
  })
}

function vt({
  hoverTime: j,
  value: A,
  format: le,
  color: fe,
  testId: x
}) {
  if (!j) return null;
  const ae = A != null && Number.isFinite(A) ? le(A) : "—";
  return t.jsxs("span", {
    className: "flex items-center gap-1.5 text-[11px] font-mono",
    "data-testid": x,
    children: [t.jsx("span", {
      className: "text-muted-foreground",
      children: j
    }), t.jsx("span", {
      className: `${fe} tabular-nums font-semibold`,
      children: ae
    })]
  })
}

function dt({
  label: j,
  value: A,
  sub: le,
  tone: fe
}) {
  const x = fe === "rich" ? "text-red-400" : fe === "cheap" ? "text-green-400" : "text-foreground",
    ae = fe === "rich" ? nn : fe === "cheap" ? ln : null;
  return t.jsxs("div", {
    className: "bg-card px-3 py-2 flex flex-col gap-0.5",
    children: [t.jsx("span", {
      className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
      children: j
    }), t.jsxs("span", {
      className: `text-base font-mono font-semibold flex items-center gap-1 ${x}`,
      children: [ae && t.jsx(ae, {
        className: "w-3.5 h-3.5"
      }), A]
    }), t.jsx("span", {
      className: "text-[9px] font-mono text-muted-foreground/70 truncate",
      children: le
    })]
  })
}

function Cr({
  label: j,
  stats: A
}) {
  if (!A) return t.jsxs("div", {
    className: "bg-card px-3 py-2.5 flex flex-col gap-1",
    children: [t.jsx("span", {
      className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
      children: j
    }), t.jsx("span", {
      className: "text-base font-mono text-muted-foreground/50",
      children: "—"
    }), t.jsx("span", {
      className: "text-[9px] font-mono text-muted-foreground/60",
      children: "no data"
    })]
  });
  const le = x => `${x>=0?"+":""}${x.toFixed(1)}pp`,
    fe = A.median > 0 ? "text-green-400" : A.median < 0 ? "text-red-400" : "text-foreground";
  return t.jsxs("div", {
    className: "bg-card px-3 py-2.5 flex flex-col gap-0.5",
    children: [t.jsxs("div", {
      className: "flex items-center justify-between",
      children: [t.jsx("span", {
        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
        children: j
      }), t.jsxs("span", {
        className: "text-[9px] font-mono text-muted-foreground/70",
        children: ["n=", A.n]
      })]
    }), t.jsxs("div", {
      className: "flex items-baseline gap-2",
      children: [t.jsx("span", {
        className: `text-base font-mono font-semibold ${fe}`,
        children: le(A.median)
      }), t.jsx("span", {
        className: "text-[10px] font-mono text-muted-foreground",
        children: "median"
      })]
    }), t.jsxs("div", {
      className: "text-[9px] font-mono text-muted-foreground/80 flex flex-wrap gap-x-3",
      children: [t.jsxs("span", {
        children: ["mean ", le(A.mean)]
      }), t.jsxs("span", {
        children: ["hit ", A.hitRate.toFixed(0), "%"]
      })]
    }), t.jsxs("div", {
      className: "text-[9px] font-mono text-muted-foreground/60 flex flex-wrap gap-x-3",
      children: [t.jsxs("span", {
        children: ["p25 ", le(A.p25)]
      }), t.jsxs("span", {
        children: ["p75 ", le(A.p75)]
      })]
    })]
  })
}
export {
  gn as
  default
};