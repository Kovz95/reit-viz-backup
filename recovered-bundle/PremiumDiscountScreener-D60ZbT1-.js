import {
  r as s,
  aj as Ge,
  af as ye,
  j as t,
  bR as ce,
  o as R,
  p as D,
  q as O,
  t as L,
  v as P,
  di as de,
  I as he,
  B as xe,
  X as Se,
  a4 as Ee,
  bT as Me,
  dY as ue,
  dZ as me,
  d_ as pe,
  E as Ye,
  bC as Ce
} from "./index-CsG73Aq_.js";
import {
  u as Te
} from "./universeDefaults-D3Fnb4CP.js";
import {
  P as Ae
} from "./play-D7mVvggU.js";
import {
  E as Ve
} from "./external-link-Cy9_YAtA.js";
const re = {
  premGivenGrowth: null,
  growthGivenPrem: null,
  impliedPrem: NaN,
  premGap: NaN,
  impliedGrowth: NaN,
  growthGap: NaN,
  label: "—",
  score: 0,
  rationale: "insufficient history",
  lastP: NaN,
  lastG: NaN
};

function $e(u, M, B = .2) {
  if (u.length < 60 || M.length < 60) return re;
  const G = u[u.length - 1]?.value,
    W = M[M.length - 1]?.value;
  if (!Number.isFinite(G) || !Number.isFinite(W)) return re;
  const U = G,
    Y = W,
    $ = new Map;
  for (const r of M) $.set(r.time, r.value);
  const i = [];
  for (const r of u) {
    const c = $.get(r.time);
    c !== void 0 && (!Number.isFinite(r.value) || !Number.isFinite(c) || i.push({
      p: r.value,
      g: c
    }))
  }
  if (i.length < 60) return re;
  const ae = i.reduce((r, c) => r + c.p, 0) / i.length,
    H = i.reduce((r, c) => r + c.g, 0) / i.length,
    X = Math.sqrt(i.reduce((r, c) => r + (c.p - ae) ** 2, 0) / i.length),
    k = Math.sqrt(i.reduce((r, c) => r + (c.g - H) ** 2, 0) / i.length);
  if (X === 0 || k === 0) return re;

  function Z(r, c, ie, _, te, N) {
    let se = _,
      n = [],
      I = 0,
      T = 0;
    for (let j = 0; j < 5; j++) {
      const E = se * ie;
      I = c - E, T = c + E, n = [];
      for (const A of i) {
        const x = r === "p" ? A.g : A.p;
        x >= I && x <= T && n.push(r === "p" ? A.p : A.g)
      }
      if (n.length >= te) break;
      se *= 1.4
    }
    if (n.length < te) return null;
    n.sort((j, E) => j - E);
    const q = j => {
      const E = Math.min(n.length - 1, Math.max(0, Math.floor(j * (n.length - 1))));
      return n[E]
    };
    let S = 0;
    for (const j of n)
      if (j < N) S++;
      else break;
    const J = n.length > 1 ? S / (n.length - 1) * 100 : 50;
    return {
      n: n.length,
      median: q(.5),
      p25: q(.25),
      p75: q(.75),
      bandLo: I,
      bandHi: T,
      todayPctile: J
    }
  }
  const F = Z("p", Y, k, B, 20, U),
    C = Z("g", U, X, B, 20, Y),
    w = F ? F.median : NaN,
    le = Number.isFinite(w) ? U - w : NaN,
    y = C ? C.median : NaN,
    Q = Number.isFinite(y) ? Y - y : NaN;
  let h = 0,
    m = 0;
  if (F) {
    const r = F.todayPctile;
    h = r <= 25 ? 1 : r >= 75 ? -1 : 0
  }
  if (C) {
    const r = C.todayPctile;
    m = r >= 75 ? 1 : r <= 25 ? -1 : 0
  }
  const ee = h + m;
  let p = "Neutral",
    g = "";
  return h === 1 && m === 1 ? (p = "Attractive", g =
      "premium below fair-for-growth & growth above fair-for-premium") : h === -1 && m === -1 ? (p =
      "Expensive", g = "premium above fair-for-growth & growth below fair-for-premium") : h === 1 &&
    m >= 0 ? (p = "Attractive", g = "premium below what history pays for this growth") : h === -1 &&
    m <= 0 ? (p = "Expensive", g = "premium above what history pays for this growth") : m === 1 &&
    h >= 0 ? (p = "Attractive", g = "growth above what history accompanies this premium") : m === -
    1 && h <= 0 ? (p = "Expensive", g = "growth below what history accompanies this premium") :
    h === 1 && m === -1 ? (p = "Neutral", g = "cheap-for-growth but growth lagging — mixed") : h ===
    -1 && m === 1 ? (p = "Neutral", g = "rich-for-growth but growth ripping — mixed") : (p =
      "Neutral", g = "within historical range"), {
      premGivenGrowth: F,
      growthGivenPrem: C,
      impliedPrem: w,
      premGap: le,
      impliedGrowth: y,
      growthGap: Q,
      label: p,
      score: ee,
      rationale: g,
      lastP: U,
      lastG: Y
    }
}
const Ie = [{
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
  Re = [{
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
  z = {
    economy: "Economy",
    sector: "Sector",
    subsector: "Subsector",
    industryGroup: "Industry Group",
    industry: "Industry",
    subindustry: "Subindustry"
  };

function ge(u) {
  return u === "Attractive" ? 2 : u === "Neutral" ? 1 : u === "Expensive" ? 0 : -1
}

function Ue() {
  const {
    available: u,
    valuationMetric: M,
    growthMetric: B
  } = Te(), [G, W] = s.useState([]), [U, Y] = s.useState(!0), {
      baskets: $
    } = Ge(), [i, ae] = s.useState("workbook"), [H, X] = s.useState(""), [k, Z] = s.useState(
      "subindustry"), [F, C] = s.useState(""), [w, le] = s.useState("subindustry"), [y, Q] = s
    .useState(M), [h, m] = s.useState(B), ee = s.useRef(!1), p = s.useRef(!1);
  s.useEffect(() => {
    u.size !== 0 && (!ee.current && !u.has(y) && Q(M), !p.current && !u.has(h) && m(B))
  }, [u, M, B, y, h]);
  const [g, r] = s.useState(.2), [c, ie] = s.useState("all"), [_, te] = s.useState(""), [N, se] = s
    .useState({
      key: "score",
      dir: -1
    }), [n, I] = s.useState([]), [T, q] = s.useState(!1), [S, J] = s.useState({
      done: 0,
      total: 0,
      currentTask: ""
    }), [j, E] = s.useState(null), A = s.useRef(!1);
  s.useEffect(() => {
    let e = !0;
    return Y(!0), ye().then(o => {
      e && (W(o), Y(!1))
    }).catch(() => {
      e && Y(!1)
    }), () => {
      e = !1
    }
  }, []);
  const x = s.useMemo(() => {
      if (i === "workbook") return G.map(e => e.ticker);
      if (i === "basket") {
        const e = $.find(o => o.id === H);
        return e ? e.tickers : []
      }
      return F ? G.filter(e => e[k] === F).map(e => e.ticker) : []
    }, [i, H, $, k, F, G]),
    fe = s.useMemo(() => {
      const e = new Set;
      for (const o of G) {
        const a = o[k];
        a && e.add(a)
      }
      return Array.from(e).sort()
    }, [G, k]);
  async function be() {
    if (x.length === 0) {
      E("Universe is empty — pick a basket or classification value.");
      return
    }
    A.current = !1, E(null), q(!0), I([]), J({
      done: 0,
      total: x.length,
      currentTask: "starting…"
    });
    const e = [],
      o = new Map(G.map(a => [a.ticker, a]));
    for (let a = 0; a < x.length && !A.current; a++) {
      const l = x[a],
        d = o.get(l),
        b = d && d[w] || "";
      if (J({
          done: a,
          total: x.length,
          currentTask: l
        }), !b) {
        e.push({
          ticker: l,
          name: d?.name || l,
          peerClass: "—",
          verdict: "—",
          score: 0,
          lastP: NaN,
          lastG: NaN,
          premGap: NaN,
          growthGap: NaN,
          premPctile: null,
          growthPctile: null,
          n: 0,
          rationale: `no ${z[w]} classification`
        }), I([...e]);
        continue
      }
      try {
        const [K, oe] = await Promise.all([ue(l, w, b, y, "median", void 0, me), ue(l, w, b, h,
            "median", void 0, me)]), ve = pe(K.targetSeries, K.groupSeries, "pct"), ke = pe(oe
            .targetSeries, oe.groupSeries, "abs"), v = $e(ve, ke, g), Fe = v.premGivenGrowth?.n ??
          0, Pe = v.growthGivenPrem?.n ?? 0;
        e.push({
          ticker: l,
          name: d?.name || l,
          peerClass: b,
          verdict: v.label,
          score: v.score,
          lastP: v.lastP,
          lastG: v.lastG,
          premGap: v.premGap,
          growthGap: v.growthGap,
          premPctile: v.premGivenGrowth?.todayPctile ?? null,
          growthPctile: v.growthGivenPrem?.todayPctile ?? null,
          n: Math.min(Fe || 0, Pe || 0),
          rationale: v.rationale
        })
      } catch (K) {
        e.push({
          ticker: l,
          name: d?.name || l,
          peerClass: b,
          verdict: "—",
          score: 0,
          lastP: NaN,
          lastG: NaN,
          premGap: NaN,
          growthGap: NaN,
          premPctile: null,
          growthPctile: null,
          n: 0,
          rationale: K?.message ? `error: ${K.message}` : "computation failed"
        })
      }
      I([...e])
    }
    J({
      done: x.length,
      total: x.length,
      currentTask: ""
    }), q(!1)
  }

  function we() {
    A.current = !0
  }
  const ne = s.useMemo(() => {
      let e = n;
      if (c !== "all" && (e = e.filter(a => a.verdict === c)), _) {
        const a = _.toUpperCase();
        e = e.filter(l => l.ticker.includes(a) || l.name.toUpperCase().includes(a) || l.peerClass
          .toUpperCase().includes(a))
      }
      const o = N.dir;
      return e = [...e].sort((a, l) => {
        const d = a[N.key],
          b = l[N.key];
        return N.key === "verdict" ? o * (ge(a.verdict) - ge(l.verdict)) : d == null && b ==
          null ? 0 : d == null || typeof d == "number" && !Number.isFinite(d) ? 1 : b ==
          null || typeof b == "number" && !Number.isFinite(b) ? -1 : typeof d == "string" ?
          o * d.localeCompare(b) : o * (d - b)
      }), e
    }, [n, c, _, N]),
    V = s.useMemo(() => {
      let e = 0,
        o = 0,
        a = 0,
        l = 0;
      for (const d of n) d.verdict === "Attractive" ? e++ : d.verdict === "Expensive" ? o++ : d
        .verdict === "Neutral" ? a++ : l++;
      return {
        a: e,
        e: o,
        n: a,
        d: l
      }
    }, [n]);

  function Ne(e) {
    const o = N.key === e;
    se({
      key: e,
      dir: o && N.dir === -1 ? 1 : -1
    })
  }

  function f({
    k: e,
    label: o,
    align: a
  }) {
    const l = N.key === e;
    return t.jsx("th", {
      className: `px-2 py-1.5 cursor-pointer select-none hover:bg-white/5 ${a==="right"?"text-right":"text-left"}`,
      onClick: () => Ne(e),
      children: t.jsxs("span", {
        className: "inline-flex items-center gap-1",
        children: [o, l && (N.dir === -1 ? t.jsx(Ye, {
          className: "w-3 h-3"
        }) : t.jsx(Ce, {
          className: "w-3 h-3"
        }))]
      })
    })
  }

  function je(e) {
    const o = e === "Attractive" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" :
      e === "Expensive" ? "bg-rose-500/15 text-rose-300 border-rose-500/40" : e === "Neutral" ?
      "bg-amber-500/10 text-amber-300/90 border-amber-500/30" :
      "bg-white/5 text-muted-foreground border-white/10";
    return t.jsx("span", {
      className: `inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold ${o}`,
      children: e
    })
  }
  return t.jsxs("div", {
    className: "flex flex-col h-full overflow-hidden",
    children: [t.jsxs("div", {
      className: "border-b border-border bg-card/40 backdrop-blur",
      children: [t.jsxs("div", {
        className: "px-3 py-2 flex items-center gap-3 flex-wrap text-[11px]",
        children: [t.jsxs("div", {
          className: "flex items-center gap-1.5 font-semibold text-foreground",
          children: [t.jsx(ce, {
            className: "w-3.5 h-3.5 text-amber-400"
          }), "P/D Screener"]
        }), t.jsx("div", {
          className: "h-5 w-px bg-border"
        }), t.jsx("span", {
          className: "text-muted-foreground",
          children: "Universe"
        }), t.jsxs(R, {
          value: i,
          onValueChange: e => ae(e),
          children: [t.jsx(D, {
            className: "h-7 w-[150px] text-[11px]",
            children: t.jsx(O, {})
          }), t.jsxs(L, {
            children: [t.jsx(P, {
              value: "workbook",
              children: "Entire workbook"
            }), t.jsx(P, {
              value: "basket",
              children: "Basket…"
            }), t.jsx(P, {
              value: "classification",
              children: "Classification…"
            })]
          })]
        }), i === "basket" && t.jsxs(R, {
          value: H,
          onValueChange: X,
          children: [t.jsx(D, {
            className: "h-7 w-[180px] text-[11px]",
            children: t.jsx(O, {
              placeholder: "Pick basket…"
            })
          }), t.jsx(L, {
            children: $.length === 0 ? t.jsx(P, {
              value: "__empty",
              disabled: !0,
              children: "No baskets saved yet"
            }) : $.map(e => t.jsxs(P, {
              value: e.id,
              children: [e.name, " (", e.tickers.length, ")"]
            }, e.id))
          })]
        }), i === "classification" && t.jsxs(t.Fragment, {
          children: [t.jsxs(R, {
            value: k,
            onValueChange: e => {
              Z(e), C("")
            },
            children: [t.jsx(D, {
              className: "h-7 w-[140px] text-[11px]",
              children: t.jsx(O, {})
            }), t.jsx(L, {
              children: de.map(e => t.jsx(P, {
                value: e,
                children: z[e]
              }, e))
            })]
          }), t.jsxs(R, {
            value: F,
            onValueChange: C,
            children: [t.jsx(D, {
              className: "h-7 w-[200px] text-[11px]",
              children: t.jsx(O, {
                placeholder: `Pick ${z[k]}…`
              })
            }), t.jsx(L, {
              children: fe.map(e => t.jsx(P, {
                value: e,
                children: e
              }, e))
            })]
          })]
        }), t.jsx("div", {
          className: "h-5 w-px bg-border"
        }), t.jsx("span", {
          className: "text-muted-foreground",
          children: "Valuation"
        }), t.jsxs(R, {
          value: y,
          onValueChange: e => {
            ee.current = !0, Q(e)
          },
          children: [t.jsx(D, {
            className: "h-7 w-[140px] text-[11px]",
            children: t.jsx(O, {})
          }), t.jsx(L, {
            children: Ie.map(e => t.jsx(P, {
              value: e.id,
              children: e.label
            }, e.id))
          })]
        }), t.jsx("span", {
          className: "text-muted-foreground",
          children: "Growth"
        }), t.jsxs(R, {
          value: h,
          onValueChange: e => {
            p.current = !0, m(e)
          },
          children: [t.jsx(D, {
            className: "h-7 w-[200px] text-[11px]",
            children: t.jsx(O, {})
          }), t.jsx(L, {
            children: Re.map(e => t.jsx(P, {
              value: e.id,
              children: e.label
            }, e.id))
          })]
        }), t.jsx("span", {
          className: "text-muted-foreground",
          children: "Peers by"
        }), t.jsxs(R, {
          value: w,
          onValueChange: e => le(e),
          children: [t.jsx(D, {
            className: "h-7 w-[140px] text-[11px]",
            children: t.jsx(O, {})
          }), t.jsx(L, {
            children: de.map(e => t.jsx(P, {
              value: e,
              children: z[e]
            }, e))
          })]
        }), t.jsx("span", {
          className: "text-muted-foreground",
          children: "σ band"
        }), t.jsx(he, {
          type: "number",
          step: "0.05",
          value: g,
          onChange: e => r(Math.max(.05, parseFloat(e.target.value) || .2)),
          className: "h-7 w-16 text-[11px]"
        }), t.jsx("div", {
          className: "flex-1"
        }), T ? t.jsxs(xe, {
          size: "sm",
          variant: "destructive",
          className: "h-7 text-[11px]",
          onClick: we,
          children: [t.jsx(Se, {
            className: "w-3 h-3 mr-1"
          }), "Cancel"]
        }) : t.jsxs(xe, {
          size: "sm",
          className: "h-7 text-[11px]",
          onClick: be,
          disabled: U || x.length === 0,
          children: [t.jsx(Ae, {
            className: "w-3 h-3 mr-1"
          }), "Run screen"]
        })]
      }), t.jsxs("div", {
        className: "px-3 pb-2 flex items-center gap-3 text-[10px] text-muted-foreground",
        children: [t.jsxs("span", {
          children: ["Universe: ", t.jsx("span", {
            className: `font-mono ${x.length===0?"text-rose-400":"text-foreground"}`,
            children: x.length
          }), " tickers", x.length === 0 && t.jsx("span", {
            className: "ml-2 text-rose-400",
            children: i === "basket" ? "— pick a basket above" : i ===
              "classification" ? `— pick a ${z[k]}` :
              "— workbook is empty"
          })]
        }), T && t.jsxs("span", {
          className: "inline-flex items-center gap-1.5",
          children: [t.jsx(Ee, {
            className: "w-3 h-3 animate-spin text-amber-400"
          }), "Computing ", S.done, "/", S.total, " · ", S.currentTask]
        }), T && S.total > 0 && t.jsx("div", {
          className: "flex-1 h-1 bg-white/5 rounded overflow-hidden max-w-xs",
          children: t.jsx("div", {
            className: "h-full bg-amber-400/70",
            style: {
              width: `${S.done/S.total*100}%`
            }
          })
        }), j && t.jsx("span", {
          className: "text-rose-400",
          children: j
        })]
      }), n.length > 0 && t.jsxs("div", {
        className: "px-3 pb-2 flex items-center gap-2 flex-wrap text-[11px] border-t border-border/50 pt-2",
        children: [t.jsx("span", {
          className: "text-muted-foreground",
          children: "Verdict"
        }), ["all", "Attractive", "Neutral", "Expensive"].map(e => t.jsxs(
          "button", {
            onClick: () => ie(e),
            className: `px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${c===e?e==="Attractive"?"bg-emerald-500/20 text-emerald-200 border-emerald-500/50":e==="Expensive"?"bg-rose-500/20 text-rose-200 border-rose-500/50":e==="Neutral"?"bg-amber-500/20 text-amber-200 border-amber-500/50":"bg-white/10 text-foreground border-white/30":"bg-transparent text-muted-foreground border-white/10 hover:bg-white/5"}`,
            children: [e === "all" ? "All" : e, e !== "all" && t.jsxs(
            "span", {
              className: "ml-1 opacity-60",
              children: ["(", e === "Attractive" ? V.a : e ===
                "Expensive" ? V.e : V.n, ")"
              ]
            })]
          }, e)), t.jsx("div", {
          className: "h-4 w-px bg-border mx-1"
        }), t.jsx(Me, {
          className: "w-3 h-3 text-muted-foreground"
        }), t.jsx(he, {
          value: _,
          onChange: e => te(e.target.value),
          placeholder: "ticker / name / peer class",
          className: "h-7 w-44 text-[11px]"
        }), t.jsxs("span", {
          className: "text-muted-foreground ml-auto",
          children: ["Showing ", t.jsx("span", {
            className: "text-foreground",
            children: ne.length
          }), " / ", n.length, " · ", t.jsx("span", {
            className: "text-emerald-400",
            children: V.a
          }), " attractive ·", " ", t.jsx("span", {
            className: "text-amber-400",
            children: V.n
          }), " neutral ·", " ", t.jsx("span", {
            className: "text-rose-400",
            children: V.e
          }), " expensive", V.d > 0 && t.jsxs(t.Fragment, {
            children: [" · ", t.jsx("span", {
              className: "text-muted-foreground",
              children: V.d
            }), " n/a"]
          })]
        })]
      })]
    }), t.jsx("div", {
      className: "flex-1 overflow-auto",
      children: n.length === 0 && !T ? t.jsxs("div", {
        className: "flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2",
        children: [t.jsx(ce, {
          className: "w-10 h-10 opacity-30"
        }), t.jsxs("div", {
          children: ["Pick a universe and metrics above, then click ", t.jsx(
            "span", {
              className: "text-foreground font-medium",
              children: "Run screen"
            }), "."]
        }), t.jsx("div", {
          className: "text-[10px] opacity-70 max-w-md text-center",
          children: "Each ticker is screened the same way the P/D page screens a single ticker: today's premium vs peer median is compared to the historical distribution of premiums seen at this ticker's current growth differential. Same metrics, same band, same verdict math."
        })]
      }) : t.jsxs("table", {
        className: "w-full text-[11px] font-mono",
        children: [t.jsx("thead", {
          className: "sticky top-0 bg-card/95 backdrop-blur text-muted-foreground border-b border-border",
          children: t.jsxs("tr", {
            children: [t.jsx(f, {
              k: "ticker",
              label: "Ticker"
            }), t.jsx(f, {
              k: "name",
              label: "Name"
            }), t.jsx(f, {
              k: "peerClass",
              label: `Peer ${z[w]}`
            }), t.jsx(f, {
              k: "verdict",
              label: "Verdict"
            }), t.jsx(f, {
              k: "score",
              label: "Score",
              align: "right"
            }), t.jsx(f, {
              k: "lastP",
              label: "Prem %",
              align: "right"
            }), t.jsx(f, {
              k: "premGap",
              label: "Prem gap",
              align: "right"
            }), t.jsx(f, {
              k: "premPctile",
              label: "Prem pct",
              align: "right"
            }), t.jsx(f, {
              k: "lastG",
              label: "Growth Δ",
              align: "right"
            }), t.jsx(f, {
              k: "growthGap",
              label: "Growth gap",
              align: "right"
            }), t.jsx(f, {
              k: "growthPctile",
              label: "Growth pct",
              align: "right"
            }), t.jsx(f, {
              k: "n",
              label: "n",
              align: "right"
            }), t.jsx("th", {
              className: "px-2 py-1.5 text-left",
              children: "Rationale"
            }), t.jsx("th", {
              className: "px-2 py-1.5"
            })]
          })
        }), t.jsx("tbody", {
          children: ne.map(e => t.jsxs("tr", {
            className: "border-b border-border/30 hover:bg-white/5",
            children: [t.jsx("td", {
              className: "px-2 py-1 font-semibold text-foreground",
              children: e.ticker
            }), t.jsx("td", {
              className: "px-2 py-1 text-foreground/70 truncate max-w-[180px]",
              children: e.name
            }), t.jsx("td", {
              className: "px-2 py-1 text-foreground/60 truncate max-w-[160px]",
              children: e.peerClass
            }), t.jsx("td", {
              className: "px-2 py-1",
              children: je(e.verdict)
            }), t.jsx("td", {
              className: `px-2 py-1 text-right font-semibold ${e.score>0?"text-emerald-300":e.score<0?"text-rose-300":"text-foreground/70"}`,
              children: e.score > 0 ? `+${e.score}` : e.score
            }), t.jsx("td", {
              className: "px-2 py-1 text-right",
              children: Number.isFinite(e.lastP) ?
                `${e.lastP>0?"+":""}${e.lastP.toFixed(1)}%` : "—"
            }), t.jsx("td", {
              className: `px-2 py-1 text-right ${e.premGap<0?"text-emerald-300/80":e.premGap>0?"text-rose-300/80":""}`,
              children: Number.isFinite(e.premGap) ?
                `${e.premGap>0?"+":""}${e.premGap.toFixed(1)}` : "—"
            }), t.jsx("td", {
              className: `px-2 py-1 text-right ${e.premPctile!=null&&e.premPctile<=25?"text-emerald-300":e.premPctile!=null&&e.premPctile>=75?"text-rose-300":""}`,
              children: e.premPctile != null ?
                `${e.premPctile.toFixed(0)}%` : "—"
            }), t.jsx("td", {
              className: "px-2 py-1 text-right",
              children: Number.isFinite(e.lastG) ?
                `${e.lastG>0?"+":""}${e.lastG.toFixed(1)}pp` : "—"
            }), t.jsx("td", {
              className: `px-2 py-1 text-right ${e.growthGap>0?"text-emerald-300/80":e.growthGap<0?"text-rose-300/80":""}`,
              children: Number.isFinite(e.growthGap) ?
                `${e.growthGap>0?"+":""}${e.growthGap.toFixed(1)}` :
                "—"
            }), t.jsx("td", {
              className: `px-2 py-1 text-right ${e.growthPctile!=null&&e.growthPctile>=75?"text-emerald-300":e.growthPctile!=null&&e.growthPctile<=25?"text-rose-300":""}`,
              children: e.growthPctile != null ?
                `${e.growthPctile.toFixed(0)}%` : "—"
            }), t.jsx("td", {
              className: "px-2 py-1 text-right text-foreground/60",
              children: e.n || "—"
            }), t.jsx("td", {
              className: "px-2 py-1 text-foreground/55 text-[10px] italic truncate max-w-[260px]",
              title: e.rationale,
              children: e.rationale
            }), t.jsx("td", {
              className: "px-2 py-1 text-right",
              children: t.jsxs("a", {
                href: "#/premium-discount",
                onClick: () => {
                  try {
                    sessionStorage.setItem(
                      "pd-screener-handoff", JSON
                    .stringify({
                        ticker: e.ticker,
                        valMetric: y,
                        growthMetric: h,
                        dimension: w
                      }))
                  } catch {}
                },
                className: "inline-flex items-center gap-0.5 text-[10px] text-amber-400 hover:text-amber-300",
                title: "Open in Premium/Discount page",
                children: ["open ", t.jsx(Ve, {
                  className: "w-2.5 h-2.5"
                })]
              })
            })]
          }, e.ticker))
        })]
      })
    })]
  })
}
export {
  Ue as
  default
};