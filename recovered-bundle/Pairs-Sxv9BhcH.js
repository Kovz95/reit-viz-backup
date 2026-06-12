import {
  c as Ut,
  r as c,
  j as e,
  ah as At,
  a5 as Gt,
  B,
  ai as Qe,
  a1 as Je,
  g as Qt,
  aj as Jt,
  b as Ke,
  ak as N,
  al as Xt,
  am as Ce,
  an as Re,
  ao as Ue,
  ap as Fe,
  x as Ge,
  I as pe,
  aq as Lt,
  ar as ae,
  P as es,
  X as Ye,
  as as ts,
  at as ss,
  au as as,
  Y as $t,
  z as ls,
  av as rs,
  aw as is,
  ax as ze,
  ay as ns,
  az as os,
  aA as cs,
  aB as ds,
  aC as xt,
  aD as ht,
  o as Xe,
  p as et,
  q as tt,
  t as st,
  v as Ae,
  aE as Pt,
  aF as Mt,
  aG as Dt,
  aH as Bt,
  aI as Ot,
  aJ as H,
  aK as ms,
  aL as xs,
  aM as hs,
  aN as us,
  aO as ps,
  aP as gs,
  aQ as fs,
  aR as bs,
  aS as vs,
  aT as Tt,
  aU as zt,
  aV as js,
  aW as Ss,
  aX as ut,
  $ as Ns,
  aY as ys,
  Z as de,
  aZ as ws,
  w as Yt,
  a_ as ks,
  a$ as Cs,
  b0 as Rs,
  b1 as Fs,
  b2 as As,
  b3 as Ls,
  b4 as Et,
  af as $s,
  b5 as pt,
  a3 as Oe,
  b6 as Ps
} from "./index-CsG73Aq_.js";
import {
  u as Ms
} from "./universeSignature-DAAu9BGh.js";
import {
  a as Ds,
  s as gt,
  f as ft,
  b as Bs
} from "./pairSignalAnalyzer-DF9nOwTp.js";
const Os = Ut("ListFilter", [
    ["path", {
      d: "M3 6h18",
      key: "d0wm0j"
    }],
    ["path", {
      d: "M7 12h10",
      key: "b7w52i"
    }],
    ["path", {
      d: "M10 18h4",
      key: "1ulq68"
    }]
  ]),
  Ts = ["raw_z", "ols_z", "spread_z", "pct"],
  bt = [{
    key: "5d",
    label: "5d"
  }, {
    key: "10d",
    label: "10d"
  }, {
    key: "20d",
    label: "20d"
  }, {
    key: "60d",
    label: "60d"
  }];

function zs(s) {
  return s == null || !isFinite(s) ? "—" : `${s>=0?"+":""}${s.toFixed(2)}%`
}

function Ys(s) {
  return s == null || !isFinite(s) ? "—" : `${s.toFixed(0)}%`
}

function vt(s) {
  return s == null || !isFinite(s) ? "—" : s >= 100 ? s.toFixed(2) : s >= 1 ? s.toFixed(4) : s
    .toFixed(5)
}

function Es(s) {
  return s == null ? "text-muted-foreground" : s > .5 ? "text-emerald-400" : s < -.5 ?
    "text-rose-400" : "text-muted-foreground"
}

function Zs(s) {
  return s == null ? "text-muted-foreground" : s >= 65 ? "text-emerald-400 font-semibold" : s >=
    55 ? "text-emerald-400/70" : s <= 35 ? "text-rose-400 font-semibold" : s <= 45 ?
    "text-rose-400/70" : "text-muted-foreground"
}

function Vs({
  priceA: s,
  priceB: p,
  tickerA: n,
  tickerB: g,
  isMaximized: j,
  onMaximize: V
}) {
  const [l, f] = c.useState("raw_z"), d = c.useMemo(() => {
    if (!s || !p || s.length < 200 || p.length < 200) return null;
    try {
      return Ds(s, p, n, g)
    } catch (o) {
      return console.warn("[PairSignalAnalyzer]", o), null
    }
  }, [s, p, n, g]);
  if (!d) return e.jsxs("div", {
    className: `flex flex-col ${j?"fixed inset-0 z-50 bg-background":"w-full h-full border border-border/30 min-h-0 overflow-hidden"}`,
    children: [e.jsx(jt, {
      tickerA: n,
      tickerB: g,
      isMaximized: j,
      onMaximize: V
    }), e.jsx("div", {
      className: "flex items-center justify-center h-full text-muted-foreground text-xs px-3",
      children: "Need at least 200 overlapping trading days to run signal analysis."
    })]
  });
  const F = d.bestNow,
    v = d.buckets[l],
    i = d.currentSignals.find(o => o.signal === l)?.value,
    x = v.findIndex(o => i != null && i >= o.low && i < o.high);
  return e.jsxs("div", {
    className: `flex flex-col ${j?"fixed inset-0 z-50 bg-background":"w-full h-full border border-border/30 min-h-0 overflow-hidden"}`,
    children: [e.jsx(jt, {
      tickerA: n,
      tickerB: g,
      isMaximized: j,
      onMaximize: V
    }), e.jsxs("div", {
      className: "flex-1 min-h-0 overflow-auto p-3 space-y-3 text-xs",
      children: [e.jsxs("div", {
        className: "grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]",
        children: [e.jsx(be, {
          label: "Pair",
          value: `${n}/${g}`
        }), e.jsx(be, {
          label: `${n}`,
          value: `$${d.currentA.toFixed(2)}`
        }), e.jsx(be, {
          label: `${g}`,
          value: `$${d.currentB.toFixed(2)}`
        }), e.jsx(be, {
          label: "Ratio",
          value: d.currentRatio.toFixed(4)
        }), e.jsx(be, {
          label: "Half-life",
          value: d.halfLifeDays ? `${d.halfLifeDays.toFixed(1)}d` : "—"
        })]
      }), F ? e.jsxs("div", {
        className: "rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2",
        children: [e.jsxs("div", {
          className: "flex items-center gap-2 text-amber-300",
          children: [e.jsx(At, {
            className: "w-3.5 h-3.5"
          }), e.jsx("span", {
            className: "text-[11px] font-semibold uppercase tracking-wider",
            children: "Best signal right now"
          }), e.jsxs("span", {
            className: "text-[10px] text-muted-foreground ml-auto",
            children: ["quality ", F.bucket.quality.toFixed(2), " · n=",
              F.bucket.n
            ]
          })]
        }), e.jsxs("div", {
          className: "text-[12px] text-foreground/90 leading-snug",
          children: [F.bucket.label, " on ", e.jsx("span", {
            className: "font-semibold",
            children: gt(F.signal)
          }), " (", ft(F.signal, F.currentSignalValue), ")"]
        }), e.jsx("div", {
          className: "text-[11px] text-muted-foreground leading-snug",
          children: F.rationale
        }), e.jsxs("div", {
          className: "grid grid-cols-2 md:grid-cols-4 gap-2 mt-1 pt-2 border-t border-amber-500/20",
          children: [e.jsx(be, {
            label: "20d expected",
            value: `${F.expectedMove20dPct>=0?"+":""}${F.expectedMove20dPct.toFixed(2)}%`,
            valueClass: F.expectedMove20dPct < 0 ? "text-rose-400" :
              "text-emerald-400"
          }), e.jsx(be, {
            label: "Ratio target",
            value: F.expectedRatio20d.toFixed(4)
          }), e.jsx(be, {
            label: `${n} target (${g} flat)`,
            value: `$${F.expectedAPrice20dIfBHolds.toFixed(2)}`
          }), e.jsx(be, {
            label: `${g} target (${n} flat)`,
            value: `$${F.expectedBPrice20dIfAHolds.toFixed(2)}`
          })]
        }), e.jsx("div", {
          className: "text-[10px] text-muted-foreground/80 pt-1 border-t border-amber-500/10",
          children: F.direction === "short_ratio" ?
            `Setup: short ${n} / long ${g} (sell the ratio)` : F.direction ===
            "long_ratio" ? `Setup: long ${n} / short ${g} (buy the ratio)` :
            "No actionable bias — the bucket is statistically flat."
        })]
      }) : e.jsxs("div", {
        className: "rounded-md border border-border/40 bg-card/30 p-3 text-[11px] text-muted-foreground",
        children: [e.jsx(Gt, {
            className: "inline w-3 h-3 mr-1.5 -mt-0.5"
          }),
          "All four current signals sit in low-edge / neutral buckets (n < 20 or |hit−50%| small). Wait for a stronger setup."
        ]
      }), e.jsx("div", {
        className: "flex items-center gap-1 flex-wrap pt-1",
        children: Ts.map(o => {
          const h = d.currentSignals.find(y => y.signal === o)?.value;
          return e.jsxs("button", {
            onClick: () => f(o),
            "data-testid": `btn-signal-${o}`,
            className: `px-2 py-1 rounded text-[10px] font-medium border transition-colors ${l===o?"bg-primary text-primary-foreground border-primary":"bg-card/30 text-muted-foreground border-border/40 hover:border-border"}`,
            children: [gt(o), h != null && e.jsxs("span", {
              className: "ml-1.5 opacity-80",
              children: ["(", ft(o, h), ")"]
            })]
          }, o)
        })
      }), e.jsx("div", {
        className: "overflow-x-auto border border-border/30 rounded",
        children: e.jsxs("table", {
          className: "w-full text-[10px] font-mono",
          children: [e.jsx("thead", {
            className: "bg-card/40 text-muted-foreground",
            children: e.jsxs("tr", {
              children: [e.jsx("th", {
                className: "text-left px-2 py-1.5",
                children: "Bucket"
              }), e.jsx("th", {
                className: "text-right px-2 py-1.5",
                children: "n"
              }), bt.map(o => e.jsxs("th", {
                className: "text-right px-2 py-1.5",
                colSpan: 2,
                children: [o.label, " avg / hit"]
              }, o.key)), e.jsx("th", {
                className: "text-right px-2 py-1.5",
                children: "Ratio range"
              }), e.jsxs("th", {
                className: "text-right px-2 py-1.5",
                title: `${n} price if ${g} stays flat at current`,
                children: [n, " $ tgt"]
              }), e.jsxs("th", {
                className: "text-right px-2 py-1.5",
                title: `${g} price if ${n} stays flat at current`,
                children: [g, " $ tgt"]
              }), e.jsx("th", {
                className: "text-right px-2 py-1.5",
                title: "Quality = |20d avg| × (20d hit% − 50) × log10(n+1)/100",
                children: "Q"
              })]
            })
          }), e.jsx("tbody", {
            children: v.map((o, h) => {
              const y = h === x;
              return e.jsxs("tr", {
                className: `border-t border-border/20 ${y?"bg-amber-500/10":""}`,
                "data-testid": `signal-bucket-${l}-${h}`,
                children: [e.jsxs("td", {
                  className: "px-2 py-1 text-foreground/90",
                  children: [y && e.jsx("span", {
                    className: "text-amber-400 mr-1",
                    children: "▶"
                  }), o.label]
                }), e.jsx("td", {
                  className: `px-2 py-1 text-right ${o.n<20?"text-muted-foreground/50":"text-foreground/80"}`,
                  children: o.n
                }), bt.map(r => e.jsx(Ws, {
                  avg: o[`avg_${r.key}`],
                  hit: o[`hit_${r.key}`]
                }, r.key)), e.jsxs("td", {
                  className: "px-2 py-1 text-right text-foreground/70",
                  children: [vt(o.ratioLevelLow), " – ", vt(
                    o.ratioLevelHigh)]
                }), e.jsx("td", {
                  className: "px-2 py-1 text-right text-foreground/85",
                  children: o.ratioLevelLow != null && o
                    .ratioLevelHigh != null && d.currentB >
                    0 ?
                    `$${((o.ratioLevelLow+o.ratioLevelHigh)/2*d.currentB).toFixed(2)}` :
                    "—"
                }), e.jsx("td", {
                  className: "px-2 py-1 text-right text-foreground/85",
                  children: o.ratioLevelLow != null && o
                    .ratioLevelHigh != null && d.currentA >
                    0 ?
                    `$${(d.currentA/((o.ratioLevelLow+o.ratioLevelHigh)/2)).toFixed(2)}` :
                    "—"
                }), e.jsx("td", {
                  className: `px-2 py-1 text-right ${o.quality>=1.5?"text-emerald-400 font-semibold":o.quality>=.5?"text-emerald-400/70":o.quality<=-.5?"text-rose-400/70":"text-muted-foreground"}`,
                  children: o.quality.toFixed(2)
                })]
              }, o.label)
            })
          })]
        })
      }), e.jsxs("div", {
        className: "text-[9.5px] text-muted-foreground/70 leading-snug px-1",
        children: [e.jsx("span", {
            className: "font-semibold",
            children: "avg"
          }), " = mean forward % change in ", n, "/", g, " ratio. ", e.jsx(
          "span", {
            className: "font-semibold",
            children: "hit"
          }), " = % of observations that reverted in the expected direction (",
          Bs(l).trim(), "). ", e.jsx("span", {
            className: "font-semibold",
            children: "Q"
          }),
          " = quality score on the 20-day horizon (size × edge × sample reliability).  Highlighted row = bucket the pair is currently sitting in.  Sample: ",
          d.firstDate, " → ", d.lastDate, " (", d.n.toLocaleString(), " days)."
        ]
      })]
    })]
  })
}

function jt({
  tickerA: s,
  tickerB: p,
  isMaximized: n,
  onMaximize: g
}) {
  return e.jsxs("div", {
    className: "flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0",
    onDoubleClick: () => g(n ? null : "signalAnalyzer"),
    children: [e.jsx(At, {
      className: "w-3 h-3 text-amber-400"
    }), e.jsxs("span", {
      className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
      children: ["Predictive Signals — ", s, "/", p]
    }), e.jsx("div", {
      className: "flex-1"
    }), e.jsx(B, {
      variant: "ghost",
      size: "sm",
      className: "h-5 w-5 p-0",
      onClick: j => {
        j.stopPropagation(), g(n ? null : "signalAnalyzer")
      },
      title: n ? "Restore" : "Maximize",
      children: n ? e.jsx(Qe, {
        className: "w-3 h-3"
      }) : e.jsx(Je, {
        className: "w-3 h-3"
      })
    })]
  })
}

function be({
  label: s,
  value: p,
  valueClass: n
}) {
  return e.jsxs("div", {
    className: "bg-card/30 border border-border/30 rounded px-2 py-1.5",
    children: [e.jsx("div", {
      className: "text-[9px] uppercase tracking-wider text-muted-foreground",
      children: s
    }), e.jsx("div", {
      className: `text-[12px] font-mono font-semibold ${n||"text-foreground"}`,
      children: p
    })]
  })
}

function Ws({
  avg: s,
  hit: p
}) {
  return e.jsxs(e.Fragment, {
    children: [e.jsx("td", {
      className: `px-2 py-1 text-right ${Es(s)}`,
      children: zs(s)
    }), e.jsx("td", {
      className: `px-2 py-1 text-right ${Zs(p)}`,
      children: Ys(p)
    })]
  })
}
const _s = [{
    label: "20d",
    value: 20
  }, {
    label: "60d",
    value: 60
  }, {
    label: "120d",
    value: 120
  }, {
    label: "250d",
    value: 250
  }],
  St = {},
  Nt = new Set(["prices", "ratio", "zscore", "percentileRank", "correlation", "olsScatter",
    "signalAnalyzer"
  ]),
  yt = [{
    id: "prices",
    label: "Prices",
    group: "Core"
  }, {
    id: "ratio",
    label: "Ratio",
    group: "Core"
  }, {
    id: "logRatio",
    label: "Log Ratio",
    group: "Core"
  }, {
    id: "zscore",
    label: "Raw Z-Score",
    group: "Z-Scores"
  }, {
    id: "spreadZ",
    label: "Spread Z",
    group: "Z-Scores"
  }, {
    id: "olsResidZ",
    label: "OLS Residual Z",
    group: "Z-Scores"
  }, {
    id: "percentileRank",
    label: "Percentile Rank",
    group: "Z-Scores"
  }, {
    id: "correlation",
    label: "Correlation",
    group: "Stats"
  }, {
    id: "spread",
    label: "Spread",
    group: "Stats"
  }, {
    id: "rollingBeta",
    label: "Rolling Beta",
    group: "Stats"
  }, {
    id: "betaAdjSpread",
    label: "Beta-Adj Spread",
    group: "Stats"
  }, {
    id: "rollingR2",
    label: "Rolling R²",
    group: "Stats"
  }, {
    id: "olsScatter",
    label: "OLS Scatter",
    group: "Stats"
  }, {
    id: "signalAnalyzer",
    label: "Predictive Signals",
    group: "Stats"
  }],
  Zt = {
    Price: ["close"],
    Volume: ["Volume"],
    Valuation: ["P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2",
      "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2", "Implied Cap Rate"
    ],
    Yields: ["FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
      "Dividend Yield"],
    Estimates: ["FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2", "EPS FY1", "EPS FY2", "EBITDA FY1",
      "EBITDA FY2"
    ],
    Growth: ["FY1 FFO Growth", "FY2 FFO Growth", "FY1 AFFO Growth", "FY2 AFFO Growth",
      "FY1 EPS Growth", "FY2 EPS Growth"
    ]
  },
  Hs = [{
    label: "Price / Price",
    metricA: "close",
    metricB: "close"
  }, {
    label: "P/FFO FY2 / P/FFO FY2",
    metricA: "P/FFO FY2",
    metricB: "P/FFO FY2"
  }, {
    label: "P/FFO LTM / P/FFO LTM",
    metricA: "P/FFO LTM",
    metricB: "P/FFO LTM"
  }, {
    label: "P/AFFO FY2 / P/AFFO FY2",
    metricA: "P/AFFO FY2",
    metricB: "P/AFFO FY2"
  }, {
    label: "P/AFFO LTM / P/AFFO LTM",
    metricA: "P/AFFO LTM",
    metricB: "P/AFFO LTM"
  }, {
    label: "FFO Yield FY2 / FFO Yield FY2",
    metricA: "FFO Yield FY2",
    metricB: "FFO Yield FY2"
  }, {
    label: "AFFO Yield FY2 / AFFO Yield FY2",
    metricA: "AFFO Yield FY2",
    metricB: "AFFO Yield FY2"
  }, {
    label: "Div Yield / Div Yield",
    metricA: "Dividend Yield",
    metricB: "Dividend Yield"
  }, {
    label: "EV/EBITDA FY2 / EV/EBITDA FY2",
    metricA: "EV/EBITDA FY2",
    metricB: "EV/EBITDA FY2"
  }, {
    label: "P/E FY2 / P/E FY2",
    metricA: "P/E FY2",
    metricB: "P/E FY2"
  }, {
    label: "Price / P/FFO FY2",
    metricA: "close",
    metricB: "P/FFO FY2"
  }, {
    label: "FFO Yield FY2 / Div Yield",
    metricA: "FFO Yield FY2",
    metricB: "Dividend Yield"
  }],
  Is = {
    layout: {
      background: {
        type: Bt.Solid,
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
      mode: Dt.Normal
    },
    rightPriceScale: {
      borderColor: "rgba(255,255,255,0.1)",
      minimumWidth: 80
    },
    timeScale: {
      borderColor: "rgba(255,255,255,0.1)",
      timeVisible: !1,
      rightOffset: 5,
      barSpacing: 3,
      minBarSpacing: 1
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
    }
  },
  qs = {
    handleScale: {
      mouseWheel: !0,
      pinch: !1,
      axisPressedMouseMove: !1,
      axisDoubleClickReset: !1
    }
  };

function Ks({
  charts: s,
  indicatorsMap: p,
  activeChartId: n,
  onSelectChart: g,
  onChangeIndicators: j,
  onClose: V
}) {
  const l = p[n] || {},
    f = t => j(n, t),
    d = () => {
      for (const t of s) t.id !== n && j(t.id, {
        ...l
      })
    },
    F = l.mean,
    [v, i] = c.useState(F?.rolling ?? !1),
    [x, o] = c.useState(F?.period ?? 200),
    [h, y] = c.useState(typeof l.rsi == "number" ? l.rsi : 14),
    [r, C] = c.useState(l.bollinger?.period ?? 20),
    [T, I] = c.useState(l.bollinger?.mult ?? 2),
    [Y, _] = c.useState(typeof l.atr == "number" ? l.atr : 14),
    [E, z] = c.useState(typeof l.roc == "number" ? l.roc : 12),
    [O, U] = c.useState(l.stochastic?.kPeriod ?? 14),
    [q, w] = c.useState(l.stochastic?.dPeriod ?? 3),
    G = l.heikinAshi,
    le = !!G,
    W = typeof G == "object" ? G : {
      type: "none",
      period: 10
    },
    [D, J] = c.useState(W.type),
    [re, ie] = c.useState(W.period),
    b = (t, R) => {
      J(t), ie(R), le && f({
        ...l,
        heikinAshi: t === "none" ? !0 : {
          type: t,
          period: R
        }
      })
    },
    m = t => {
      f(t ? {
        ...l,
        heikinAshi: D === "none" ? !0 : {
          type: D,
          period: re
        }
      } : {
        ...l,
        heikinAshi: void 0
      })
    },
    S = (t, R, ce) => {
      f({
        ...l,
        mean: t ? {
          rolling: R ?? v,
          period: ce ?? x
        } : void 0
      })
    };
  return e.jsxs("div", {
    className: "absolute right-0 top-0 bottom-0 w-[260px] border-l border-border bg-card/95 backdrop-blur overflow-y-auto z-30 flex-shrink-0",
    children: [e.jsxs("div", {
      className: "flex items-center justify-between px-3 py-2 border-b border-border",
      children: [e.jsxs("div", {
        className: "flex items-center gap-2",
        children: [e.jsx($t, {
          className: "w-3.5 h-3.5 text-primary"
        }), e.jsx("span", {
          className: "text-xs font-semibold",
          children: "Indicators"
        })]
      }), e.jsx(B, {
        variant: "ghost",
        size: "sm",
        className: "h-6 w-6 p-0",
        onClick: V,
        children: e.jsx(Ye, {
          className: "w-3.5 h-3.5"
        })
      })]
    }), s.length > 0 && e.jsxs("div", {
      className: "px-3 pt-3 space-y-1.5",
      children: [e.jsx(ae, {
        className: "text-[10px] text-muted-foreground font-semibold uppercase tracking-wider",
        children: "Apply to chart"
      }), e.jsxs("div", {
        className: "flex gap-1",
        children: [e.jsxs(Xe, {
          value: n,
          onValueChange: g,
          children: [e.jsx(et, {
            className: "h-7 text-[11px] flex-1",
            "data-testid": "pairs-indicator-chart-select",
            children: e.jsx(tt, {})
          }), e.jsx(st, {
            children: s.map(t => e.jsx(Ae, {
              value: t.id,
              children: t.title
            }, t.id))
          })]
        }), s.length > 1 && e.jsxs(B, {
          variant: "outline",
          size: "sm",
          className: "h-7 px-2 text-[10px] gap-1 flex-shrink-0",
          onClick: d,
          title: "Copy to all charts",
          "data-testid": "pairs-copy-indicators-all",
          children: [e.jsx(ys, {
            className: "w-3 h-3"
          }), " All"]
        })]
      })]
    }), e.jsxs("div", {
      className: "p-3 space-y-4",
      children: [e.jsx("p", {
        className: "text-[10px] text-muted-foreground font-semibold uppercase tracking-wider",
        children: "Moving Averages"
      }), e.jsx(ke, {
        label: "SMA",
        presets: [20, 50, 100, 200],
        defaultLen: 50,
        active: l.sma,
        onToggle: t => f({
          ...l,
          sma: t
        })
      }), e.jsx(ke, {
        label: "EMA",
        presets: [9, 21, 50, 100],
        defaultLen: 21,
        active: l.ema,
        onToggle: t => f({
          ...l,
          ema: t
        })
      }), e.jsx(ke, {
        label: "HMA",
        presets: [9, 20, 50, 100],
        defaultLen: 20,
        active: l.hma,
        onToggle: t => f({
          ...l,
          hma: t
        })
      }), e.jsx(ke, {
        label: "LSMA",
        presets: [14, 21, 50, 100],
        defaultLen: 21,
        active: l.lsma,
        onToggle: t => f({
          ...l,
          lsma: t
        })
      }), e.jsx(ke, {
        label: "SLSMA",
        presets: [14, 21, 50, 100],
        defaultLen: 21,
        active: l.slsma,
        onToggle: t => f({
          ...l,
          slsma: t
        })
      }), e.jsxs("div", {
        className: "border-t border-border pt-3",
        children: [e.jsx("p", {
          className: "text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3",
          children: "Oscillators"
        }), e.jsxs("div", {
          className: "space-y-2",
          children: [e.jsxs("div", {
            className: "flex items-center justify-between",
            children: [e.jsx(ae, {
              className: "text-xs font-medium",
              children: "RSI"
            }), e.jsx(de, {
              checked: l.rsi !== void 0,
              onCheckedChange: t => f({
                ...l,
                rsi: t ? h : void 0
              }),
              "data-testid": "toggle-rsi"
            })]
          }), e.jsxs("div", {
            className: "flex gap-1 items-center",
            children: [
              [7, 14, 21].map(t => e.jsx(B, {
                variant: h === t ? "default" : "secondary",
                size: "sm",
                className: "h-6 px-2 text-[10px] flex-1",
                onClick: () => {
                  y(t), l.rsi !== void 0 && f({
                    ...l,
                    rsi: t
                  })
                },
                children: t
              }, t)), e.jsx(pe, {
                type: "number",
                placeholder: "#",
                className: "h-6 w-14 text-[10px] px-1.5",
                min: 2,
                onChange: t => {
                  const R = parseInt(t.target.value);
                  R > 1 && (y(R), l.rsi !== void 0 && f({
                    ...l,
                    rsi: R
                  }))
                },
                "data-testid": "custom-rsi"
              })
            ]
          })]
        }), e.jsxs("div", {
          className: "flex items-center justify-between mt-3",
          children: [e.jsx(ae, {
            className: "text-xs font-medium",
            children: "MACD (12, 26, 9)"
          }), e.jsx(de, {
            checked: !!l.macd,
            onCheckedChange: t => f({
              ...l,
              macd: t || void 0
            }),
            "data-testid": "toggle-macd"
          })]
        }), e.jsxs("div", {
          className: "space-y-2 mt-3",
          children: [e.jsxs("div", {
            className: "flex items-center justify-between",
            children: [e.jsx(ae, {
              className: "text-xs font-medium",
              children: "Stochastic"
            }), e.jsx(de, {
              checked: l.stochastic !== void 0,
              onCheckedChange: t => f({
                ...l,
                stochastic: t ? {
                  kPeriod: O,
                  dPeriod: q
                } : void 0
              }),
              "data-testid": "toggle-stochastic"
            })]
          }), e.jsxs("div", {
            className: "flex gap-1 items-center",
            children: [e.jsx("span", {
              className: "text-[10px] text-muted-foreground w-8",
              children: "%K:"
            }), [9, 14, 21].map(t => e.jsx(B, {
              variant: O === t ? "default" : "secondary",
              size: "sm",
              className: "h-6 px-2 text-[10px] flex-1",
              onClick: () => {
                U(t), l.stochastic && f({
                  ...l,
                  stochastic: {
                    kPeriod: t,
                    dPeriod: q
                  }
                })
              },
              children: t
            }, t))]
          }), e.jsxs("div", {
            className: "flex gap-1 items-center",
            children: [e.jsx("span", {
              className: "text-[10px] text-muted-foreground w-8",
              children: "%D:"
            }), [3, 5, 7].map(t => e.jsx(B, {
              variant: q === t ? "default" : "secondary",
              size: "sm",
              className: "h-6 px-2 text-[10px] flex-1",
              onClick: () => {
                w(t), l.stochastic && f({
                  ...l,
                  stochastic: {
                    kPeriod: O,
                    dPeriod: t
                  }
                })
              },
              children: t
            }, t))]
          })]
        }), e.jsxs("div", {
          className: "space-y-2 mt-3",
          children: [e.jsxs("div", {
            className: "flex items-center justify-between",
            children: [e.jsx(ae, {
              className: "text-xs font-medium",
              children: "ROC (Rate of Change)"
            }), e.jsx(de, {
              checked: l.roc !== void 0,
              onCheckedChange: t => f({
                ...l,
                roc: t ? E : void 0
              }),
              "data-testid": "toggle-roc"
            })]
          }), e.jsxs("div", {
            className: "flex gap-1 items-center",
            children: [
              [9, 12, 20, 50].map(t => e.jsx(B, {
                variant: E === t ? "default" : "secondary",
                size: "sm",
                className: "h-6 px-2 text-[10px] flex-1",
                onClick: () => {
                  z(t), l.roc !== void 0 && f({
                    ...l,
                    roc: t
                  })
                },
                children: t
              }, t)), e.jsx(pe, {
                type: "number",
                placeholder: "#",
                className: "h-6 w-14 text-[10px] px-1.5",
                min: 1,
                onChange: t => {
                  const R = parseInt(t.target.value);
                  R > 0 && (z(R), l.roc !== void 0 && f({
                    ...l,
                    roc: R
                  }))
                },
                "data-testid": "custom-roc"
              })
            ]
          })]
        })]
      }), e.jsxs("div", {
        className: "border-t border-border pt-3",
        children: [e.jsx("p", {
          className: "text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3",
          children: "Volatility"
        }), e.jsxs("div", {
          className: "space-y-2",
          children: [e.jsxs("div", {
            className: "flex items-center justify-between",
            children: [e.jsx(ae, {
              className: "text-xs font-medium",
              children: "Bollinger Bands"
            }), e.jsx(de, {
              checked: l.bollinger !== void 0,
              onCheckedChange: t => f({
                ...l,
                bollinger: t ? {
                  period: r,
                  mult: T
                } : void 0
              }),
              "data-testid": "toggle-bollinger"
            })]
          }), e.jsxs("div", {
            className: "flex gap-1 items-center",
            children: [e.jsx("span", {
              className: "text-[10px] text-muted-foreground w-12",
              children: "Period:"
            }), [10, 20, 50].map(t => e.jsx(B, {
              variant: r === t ? "default" : "secondary",
              size: "sm",
              className: "h-6 px-2 text-[10px] flex-1",
              onClick: () => {
                C(t), l.bollinger && f({
                  ...l,
                  bollinger: {
                    period: t,
                    mult: T
                  }
                })
              },
              children: t
            }, t))]
          }), e.jsxs("div", {
            className: "flex gap-1 items-center",
            children: [e.jsx("span", {
              className: "text-[10px] text-muted-foreground w-12",
              children: "Width:"
            }), [1, 1.5, 2, 2.5, 3].map(t => e.jsxs(B, {
              variant: T === t ? "default" : "secondary",
              size: "sm",
              className: "h-6 px-1.5 text-[10px] flex-1",
              onClick: () => {
                I(t), l.bollinger && f({
                  ...l,
                  bollinger: {
                    period: r,
                    mult: t
                  }
                })
              },
              children: [t, "σ"]
            }, t))]
          })]
        }), e.jsxs("div", {
          className: "space-y-2 mt-3",
          children: [e.jsxs("div", {
            className: "flex items-center justify-between",
            children: [e.jsx(ae, {
              className: "text-xs font-medium",
              children: "ATR"
            }), e.jsx(de, {
              checked: l.atr !== void 0,
              onCheckedChange: t => f({
                ...l,
                atr: t ? Y : void 0
              }),
              "data-testid": "toggle-atr"
            })]
          }), e.jsxs("div", {
            className: "flex gap-1 items-center",
            children: [
              [7, 14, 21].map(t => e.jsx(B, {
                variant: Y === t ? "default" : "secondary",
                size: "sm",
                className: "h-6 px-2 text-[10px] flex-1",
                onClick: () => {
                  _(t), l.atr !== void 0 && f({
                    ...l,
                    atr: t
                  })
                },
                children: t
              }, t)), e.jsx(pe, {
                type: "number",
                placeholder: "#",
                className: "h-6 w-14 text-[10px] px-1.5",
                min: 2,
                onChange: t => {
                  const R = parseInt(t.target.value);
                  R > 1 && (_(R), l.atr !== void 0 && f({
                    ...l,
                    atr: R
                  }))
                },
                "data-testid": "custom-atr"
              })
            ]
          })]
        })]
      }), e.jsxs("div", {
        className: "border-t border-border pt-3",
        children: [e.jsx("p", {
          className: "text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3",
          children: "Overlays"
        }), e.jsxs("div", {
          className: "flex items-center justify-between",
          children: [e.jsxs("div", {
            children: [e.jsx(ae, {
              className: "text-xs font-medium",
              children: "VWAP"
            }), e.jsx("p", {
              className: "text-[10px] text-muted-foreground mt-0.5",
              children: "Cumulative avg overlay"
            })]
          }), e.jsx(de, {
            checked: !!l.vwap,
            onCheckedChange: t => f({
              ...l,
              vwap: t || void 0
            }),
            "data-testid": "toggle-vwap"
          })]
        })]
      }), e.jsxs("div", {
        className: "border-t border-border pt-3",
        children: [e.jsx("p", {
          className: "text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3",
          children: "Volume"
        }), e.jsxs("div", {
          className: "flex items-center justify-between",
          children: [e.jsxs("div", {
            children: [e.jsx(ae, {
              className: "text-xs font-medium",
              children: "OBV"
            }), e.jsx("p", {
              className: "text-[10px] text-muted-foreground mt-0.5",
              children: "On Balance Volume sub-pane"
            })]
          }), e.jsx(de, {
            checked: !!l.obv,
            onCheckedChange: t => f({
              ...l,
              obv: t || void 0
            }),
            "data-testid": "toggle-obv"
          })]
        })]
      }), e.jsxs("div", {
        className: "border-t border-border pt-3",
        children: [e.jsx("p", {
          className: "text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3",
          children: "Trend"
        }), e.jsxs("div", {
          className: "space-y-2",
          children: [e.jsxs("div", {
            className: "flex items-center justify-between",
            children: [e.jsxs("div", {
              children: [e.jsx(ae, {
                className: "text-xs font-medium",
                children: "Heikin-Ashi"
              }), e.jsx("p", {
                className: "text-[10px] text-muted-foreground mt-0.5",
                children: "Candle overlay on chart"
              })]
            }), e.jsx(de, {
              checked: le,
              onCheckedChange: m,
              "data-testid": "toggle-heikin-ashi"
            })]
          }), e.jsxs("div", {
            className: "flex gap-1 items-center",
            children: [e.jsx("span", {
              className: "text-[10px] text-muted-foreground w-12",
              children: "Smooth:"
            }), ["none", "SMA", "EMA", "WMA"].map(t => e.jsx(B, {
              variant: D === t ? "default" : "secondary",
              size: "sm",
              className: "h-5 px-1.5 text-[9px] flex-1",
              onClick: () => b(t, re),
              children: t === "none" ? "Off" : t
            }, t))]
          }), D !== "none" && e.jsxs("div", {
            className: "flex gap-1 items-center",
            children: [e.jsx("span", {
              className: "text-[10px] text-muted-foreground w-12",
              children: "Period:"
            }), [5, 10, 14, 20].map(t => e.jsx(B, {
              variant: re === t ? "default" : "secondary",
              size: "sm",
              className: "h-5 px-1.5 text-[9px] flex-1",
              onClick: () => b(D, t),
              children: t
            }, t)), e.jsx(pe, {
              type: "number",
              placeholder: "#",
              className: "h-5 w-12 text-[9px] px-1",
              min: 2,
              onChange: t => {
                const R = parseInt(t.target.value);
                R > 1 && b(D, R)
              },
              "data-testid": "custom-ha-smooth-period"
            })]
          })]
        }), e.jsxs("div", {
          className: "flex items-center justify-between mt-3",
          children: [e.jsxs("div", {
            children: [e.jsx(ae, {
              className: "text-xs font-medium",
              children: "HA Signals"
            }), e.jsxs("p", {
              className: "text-[10px] text-muted-foreground mt-0.5",
              children: [e.jsx("span", {
                className: "text-green-400",
                children: "▲"
              }), " / ", e.jsx("span", {
                className: "text-red-400",
                children: "▼"
              }), " arrows on color flips"]
            })]
          }), e.jsx(de, {
            checked: !!l.haSignals,
            onCheckedChange: t => f({
              ...l,
              haSignals: t || void 0
            }),
            "data-testid": "toggle-ha-signals"
          })]
        })]
      }), e.jsxs("div", {
        className: "border-t border-border pt-3",
        children: [e.jsx("p", {
          className: "text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-3",
          children: "Statistical"
        }), e.jsxs("div", {
          className: "space-y-2",
          children: [e.jsxs("div", {
            className: "flex items-center justify-between",
            children: [e.jsx(ae, {
              className: "text-xs font-medium",
              children: "Mean ± Std Bands"
            }), e.jsx(de, {
              checked: F !== void 0,
              onCheckedChange: t => S(t),
              "data-testid": "toggle-mean"
            })]
          }), e.jsxs("div", {
            className: "flex gap-1",
            children: [e.jsx(B, {
              variant: v ? "secondary" : "default",
              size: "sm",
              className: "h-6 px-3 text-[10px] flex-1",
              onClick: () => {
                i(!1), F && S(!0, !1)
              },
              children: "Static"
            }), e.jsx(B, {
              variant: v ? "default" : "secondary",
              size: "sm",
              className: "h-6 px-3 text-[10px] flex-1",
              onClick: () => {
                i(!0), F && S(!0, !0)
              },
              children: "Rolling"
            })]
          }), e.jsxs("div", {
            className: "flex gap-1 items-center",
            children: [
              [50, 100, 200, 500].map(t => e.jsx(B, {
                variant: x === t ? "default" : "secondary",
                size: "sm",
                className: "h-6 px-2 text-[10px] flex-1",
                onClick: () => {
                  o(t), F && S(!0, void 0, t)
                },
                children: t
              }, t)), e.jsx(pe, {
                type: "number",
                placeholder: "#",
                className: "h-6 w-14 text-[10px] px-1.5",
                min: 10,
                onChange: t => {
                  const R = parseInt(t.target.value);
                  R >= 10 && (o(R), F && S(!0, void 0, R))
                },
                "data-testid": "custom-mean-period"
              })
            ]
          })]
        })]
      }), e.jsx("div", {
        className: "border-t border-border pt-3",
        children: e.jsx("p", {
          className: "text-[10px] text-muted-foreground",
          children: "MAs, Bollinger, and VWAP overlay the chart. RSI, MACD, ATR, ROC, Stochastic, and OBV render in sub-panes below. Select which chart to apply to above."
        })
      }), e.jsx(ws, {})]
    })]
  })
}

function ke({
  label: s,
  presets: p,
  defaultLen: n,
  active: g,
  onToggle: j
}) {
  const [V, l] = c.useState(g ?? n), [f, d] = c.useState(""), F = v => {
    l(v), g !== void 0 && j(v)
  };
  return e.jsxs("div", {
    className: "space-y-1",
    children: [e.jsxs("div", {
      className: "flex items-center justify-between",
      children: [e.jsx(ae, {
        className: "text-xs font-medium",
        children: s
      }), e.jsx(de, {
        checked: g !== void 0,
        onCheckedChange: v => j(v ? V : void 0)
      })]
    }), e.jsxs("div", {
      className: "flex gap-1 items-center",
      children: [p.map(v => e.jsx(B, {
        variant: V === v ? "default" : "secondary",
        size: "sm",
        className: "h-5 px-2 text-[10px] flex-1",
        onClick: () => F(v),
        children: v
      }, v)), e.jsx(pe, {
        type: "number",
        placeholder: "Custom",
        className: "h-5 w-16 text-[10px] px-1.5",
        value: f,
        min: 1,
        onChange: v => {
          d(v.target.value);
          const i = parseInt(v.target.value);
          i > 0 && F(i)
        },
        "data-testid": `custom-${s.toLowerCase()}`
      })]
    })]
  })
}

function Us({
  priceA: s,
  priceB: p,
  tickerA: n,
  tickerB: g,
  isMaximized: j,
  onMaximize: V
}) {
  const l = c.useRef(null),
    f = c.useRef(null),
    [d, F] = c.useState(0);
  c.useEffect(() => {
    const i = f.current;
    if (!i) return;
    const x = new ResizeObserver(() => F(o => o + 1));
    return x.observe(i), () => x.disconnect()
  }, []);
  const v = c.useMemo(() => {
    if (s.length < 3 || p.length < 3) return null;
    const i = [],
      x = [];
    for (let w = 1; w < s.length; w++) s[w].value > 0 && s[w - 1].value > 0 && p[w].value > 0 &&
      p[w - 1].value > 0 && (i.push(Math.log(s[w].value / s[w - 1].value)), x.push(Math.log(p[w]
        .value / p[w - 1].value)));
    if (i.length < 10) return null;
    const o = i.length;
    let h = 0,
      y = 0,
      r = 0,
      C = 0;
    for (let w = 0; w < o; w++) h += x[w], y += i[w], r += x[w] * i[w], C += x[w] * x[w];
    const T = h / o,
      I = y / o,
      Y = C - o * T * T,
      _ = r - o * T * I,
      E = Y === 0 ? 0 : _ / Y,
      z = I - E * T;
    let O = 0,
      U = 0;
    for (let w = 0; w < o; w++) {
      const G = z + E * x[w];
      O += (i[w] - G) ** 2, U += (i[w] - I) ** 2
    }
    const q = U === 0 ? 0 : 1 - O / U;
    return {
      retA: i,
      retB: x,
      alpha: z,
      beta: E,
      r2: q,
      n: o
    }
  }, [s, p]);
  return c.useEffect(() => {
    const i = l.current,
      x = f.current;
    if (!i || !x || !v) return;
    const o = window.devicePixelRatio || 1,
      h = x.clientWidth,
      y = x.clientHeight;
    i.width = h * o, i.height = y * o, i.style.width = `${h}px`, i.style.height = `${y}px`;
    const r = i.getContext("2d");
    if (!r) return;
    r.scale(o, o), r.fillStyle = "#0d1117", r.fillRect(0, 0, h, y);
    const {
      retA: C,
      retB: T,
      alpha: I,
      beta: Y,
      r2: _,
      n: E
    } = v, z = {
      top: 30,
      right: 20,
      bottom: 35,
      left: 55
    }, O = h - z.left - z.right, U = y - z.top - z.bottom;
    let q = 1 / 0,
      w = -1 / 0,
      G = 1 / 0,
      le = -1 / 0;
    for (let m = 0; m < E; m++) T[m] < q && (q = T[m]), T[m] > w && (w = T[m]), C[m] < G && (G =
      C[m]), C[m] > le && (le = C[m]);
    const W = (w - q) * .05 || .01,
      D = (le - G) * .05 || .01;
    q -= W, w += W, G -= D, le += D;
    const J = m => z.left + (m - q) / (w - q) * O,
      re = m => z.top + U - (m - G) / (le - G) * U;
    r.strokeStyle = "rgba(255,255,255,0.06)", r.lineWidth = .5;
    for (let m = 0; m <= 4; m++) {
      const S = z.top + U / 4 * m;
      r.beginPath(), r.moveTo(z.left, S), r.lineTo(h - z.right, S), r.stroke();
      const t = z.left + O / 4 * m;
      r.beginPath(), r.moveTo(t, z.top), r.lineTo(t, z.top + U), r.stroke()
    }
    if (r.strokeStyle = "rgba(255,255,255,0.15)", r.lineWidth = .5, q < 0 && w > 0) {
      const m = J(0);
      r.beginPath(), r.moveTo(m, z.top), r.lineTo(m, z.top + U), r.stroke()
    }
    if (G < 0 && le > 0) {
      const m = re(0);
      r.beginPath(), r.moveTo(z.left, m), r.lineTo(h - z.right, m), r.stroke()
    }
    r.fillStyle = "rgba(14, 165, 233, 0.5)";
    for (let m = 0; m < E; m++) r.beginPath(), r.arc(J(T[m]), re(C[m]), 2, 0, Math.PI * 2), r
      .fill();
    const ie = I + Y * q,
      b = I + Y * w;
    r.strokeStyle = "#ef4444", r.lineWidth = 1.5, r.beginPath(), r.moveTo(J(q), re(ie)), r
      .lineTo(J(w), re(b)), r.stroke(), r.fillStyle = "#7a8a9e", r.font =
      "10px 'JetBrains Mono', monospace", r.textAlign = "center", r.fillText(`${g} Log Returns`,
        z.left + O / 2, y - 5), r.save(), r.translate(12, z.top + U / 2), r.rotate(-Math.PI /
      2), r.fillText(`${n} Log Returns`, 0, 0), r.restore(), r.textAlign = "center", r
      .textBaseline = "top";
    for (let m = 0; m <= 4; m++) {
      const S = q + (w - q) * (m / 4);
      r.fillText((S * 100).toFixed(1) + "%", J(S), z.top + U + 4)
    }
    r.textAlign = "right", r.textBaseline = "middle";
    for (let m = 0; m <= 4; m++) {
      const S = G + (le - G) * (m / 4);
      r.fillText((S * 100).toFixed(1) + "%", z.left - 5, re(S))
    }
    r.fillStyle = "#e0e0e0", r.font = "bold 10px 'JetBrains Mono', monospace", r.textAlign =
      "left", r.textBaseline = "top", r.fillText(
        `OLS: β = ${Y.toFixed(4)}, α = ${I.toFixed(6)}, R² = ${_.toFixed(4)}, n = ${E}`, z
        .left + 5, z.top + 5)
  }, [v, n, g, d]), e.jsxs("div", {
    className: `flex flex-col ${j?"fixed inset-0 z-50 bg-background":"w-full h-full border border-border/30 min-h-0 overflow-hidden"}`,
    onDoubleClick: () => V(j ? null : "olsScatter"),
    children: [e.jsxs("div", {
      className: "flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0",
      children: [e.jsxs("span", {
        className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
        children: ["OLS Scatter — ", n, " vs ", g, " Log Returns"]
      }), e.jsx("div", {
        className: "flex-1"
      }), e.jsx(B, {
        variant: "ghost",
        size: "sm",
        className: "h-5 w-5 p-0",
        onClick: i => {
          i.stopPropagation(), V(j ? null : "olsScatter")
        },
        title: j ? "Restore" : "Maximize",
        children: j ? e.jsx(Qe, {
          className: "w-3 h-3"
        }) : e.jsx(Je, {
          className: "w-3 h-3"
        })
      })]
    }), e.jsx("div", {
      ref: f,
      className: "flex-1 min-h-0 relative",
      children: v ? e.jsx("canvas", {
        ref: l,
        className: "absolute inset-0"
      }) : e.jsx("div", {
        className: "flex items-center justify-center h-full text-muted-foreground text-xs",
        children: "Insufficient data for OLS scatter"
      })
    })]
  })
}
const wt = 70;

function Gs(s) {
  const p = [];
  return typeof s.rsi == "number" && p.push("rsi"), s.macd && p.push("macd"), typeof s.roc ==
    "number" && p.push("roc"), s.stochastic && p.push("stochastic"), typeof s.atr == "number" && p
    .push("atr"), s.obv && p.push("obv"), p
}

function Qs({
  type: s,
  closeData: p,
  activeIndicators: n,
  parentChart: g,
  parentSeries: j
}) {
  const V = c.useRef(null),
    l = c.useRef(null),
    f = c.useRef(!1),
    {
      colors: d
    } = Pt();
  c.useEffect(() => {
    const v = V.current;
    if (!v || p.length === 0) return;
    if (l.current) {
      try {
        l.current.remove()
      } catch {}
      l.current = null
    }
    const i = v.getBoundingClientRect(),
      x = Mt(v, {
        width: i.width || 300,
        height: i.height || wt,
        layout: {
          background: {
            type: Bt.Solid,
            color: "transparent"
          },
          textColor: "#7a8a9e",
          fontSize: 10,
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace"
        },
        grid: {
          vertLines: {
            color: "rgba(255,255,255,0.03)"
          },
          horzLines: {
            color: "rgba(255,255,255,0.03)"
          }
        },
        crosshair: {
          mode: Dt.Normal
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.06)",
          minimumWidth: 80
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.06)",
          visible: !1,
          rightOffset: 5,
          barSpacing: 3,
          minBarSpacing: 1
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
        }
      });
    x.applyOptions({
      handleScale: {
        mouseWheel: !0,
        pinch: !1,
        axisPressedMouseMove: !1,
        axisDoubleClickReset: !1
      }
    }), l.current = x, Ot(x);
    let o = null;
    if (s === "rsi" && typeof n.rsi == "number") {
      const h = ks(p, n.rsi);
      if (h.length > 0) {
        const y = x.addSeries(H, {
          color: d.rsi_line,
          lineWidth: 1,
          title: `RSI ${n.rsi}`
        });
        y.setData(h.map(T => ({
          time: T.time,
          value: T.value
        }))), o = y;
        const r = h[0].time,
          C = h[h.length - 1].time;
        for (const [T, I] of [
            [70, d.rsi_overbought],
            [30, d.rsi_oversold]
          ]) x.addSeries(H, {
          color: I,
          lineWidth: 1,
          lineStyle: N.Dotted,
          title: "",
          crosshairMarkerVisible: !1
        }).setData([{
          time: r,
          value: T
        }, {
          time: C,
          value: T
        }]);
        x.timeScale().fitContent()
      }
    }
    if (s === "macd" && n.macd) {
      const h = Cs(p, 12, 26, 9);
      if (h.macdLine.length > 0) {
        const y = x.addSeries(H, {
          color: d.macd_line,
          lineWidth: 1,
          title: "MACD"
        });
        y.setData(h.macdLine.map(C => ({
          time: C.time,
          value: C.value
        }))), o = y, x.addSeries(H, {
          color: d.macd_signal,
          lineWidth: 1,
          title: "Signal",
          crosshairMarkerVisible: !1
        }).setData(h.signalLine.map(C => ({
          time: C.time,
          value: C.value
        }))), h.macdLine.length >= 2 && x.addSeries(H, {
          color: "rgba(255,255,255,0.15)",
          lineWidth: 1,
          lineStyle: N.Dotted,
          title: "",
          crosshairMarkerVisible: !1
        }).setData([{
          time: h.macdLine[0].time,
          value: 0
        }, {
          time: h.macdLine[h.macdLine.length - 1].time,
          value: 0
        }]), x.timeScale().fitContent()
      }
    }
    if (s === "ha" && n.heikinAshi) {
      const h = typeof n.heikinAshi == "object" ? n.heikinAshi : void 0,
        y = Tt(p, h);
      if (y.length > 0) {
        const r = x.addSeries(zt, {
          upColor: d.ha_up,
          downColor: d.ha_down,
          borderUpColor: d.ha_up,
          borderDownColor: d.ha_down,
          wickUpColor: d.ha_up,
          wickDownColor: d.ha_down,
          title: "HA"
        });
        r.setData(y.map(C => ({
          time: C.time,
          open: C.open,
          high: C.high,
          low: C.low,
          close: C.close
        }))), o = r, x.timeScale().fitContent()
      }
    }
    if (s === "roc" && typeof n.roc == "number") {
      const h = Rs(p, n.roc);
      if (h.length > 0) {
        const y = x.addSeries(H, {
          color: d.roc,
          lineWidth: 1,
          title: `ROC ${n.roc}`
        });
        y.setData(h.map(r => ({
          time: r.time,
          value: r.value
        }))), o = y, h.length >= 2 && x.addSeries(H, {
          color: "rgba(255,255,255,0.15)",
          lineWidth: 1,
          lineStyle: N.Dotted,
          title: "",
          crosshairMarkerVisible: !1
        }).setData([{
          time: h[0].time,
          value: 0
        }, {
          time: h[h.length - 1].time,
          value: 0
        }]), x.timeScale().fitContent()
      }
    }
    if (s === "stochastic" && n.stochastic) {
      const {
        kPeriod: h,
        dPeriod: y
      } = n.stochastic, r = Fs(p, h, y);
      if (r.k.length > 0) {
        const C = x.addSeries(H, {
          color: d.stoch_k,
          lineWidth: 1,
          title: `%K(${h})`
        });
        C.setData(r.k.map(Y => ({
          time: Y.time,
          value: Y.value
        }))), o = C, r.d.length > 0 && x.addSeries(H, {
          color: d.stoch_d,
          lineWidth: 1,
          title: `%D(${y})`,
          crosshairMarkerVisible: !1
        }).setData(r.d.map(_ => ({
          time: _.time,
          value: _.value
        })));
        const T = r.k[0].time,
          I = r.k[r.k.length - 1].time;
        for (const [Y, _] of [
            [80, d.stoch_overbought],
            [20, d.stoch_oversold]
          ]) x.addSeries(H, {
          color: _,
          lineWidth: 1,
          lineStyle: N.Dotted,
          title: "",
          crosshairMarkerVisible: !1
        }).setData([{
          time: T,
          value: Y
        }, {
          time: I,
          value: Y
        }]);
        x.timeScale().fitContent()
      }
    }
    if (s === "atr" && typeof n.atr == "number") {
      const h = As(p, n.atr);
      if (h.length > 0) {
        const y = x.addSeries(H, {
          color: d.atr,
          lineWidth: 1,
          title: `ATR ${n.atr}`
        });
        y.setData(h.map(r => ({
          time: r.time,
          value: r.value
        }))), o = y, x.timeScale().fitContent()
      }
    }
    if (s === "obv" && n.obv) {
      const h = Ls(p);
      if (h.length > 0) {
        const y = x.addSeries(H, {
          color: d.obv,
          lineWidth: 1,
          title: "OBV"
        });
        y.setData(h.map(r => ({
          time: r.time,
          value: r.value
        }))), o = y, x.timeScale().fitContent()
      }
    }
    if (g) {
      const h = () => {
          if (!f.current) {
            f.current = !0;
            try {
              const r = g.timeScale().getVisibleLogicalRange();
              r && x.timeScale().setVisibleLogicalRange(r)
            } catch {}
            requestAnimationFrame(() => {
              f.current = !1
            })
          }
        },
        y = () => {
          if (!f.current) {
            f.current = !0;
            try {
              const r = x.timeScale().getVisibleLogicalRange();
              r && g.timeScale().setVisibleLogicalRange(r)
            } catch {}
            requestAnimationFrame(() => {
              f.current = !1
            })
          }
        };
      if (g.timeScale().subscribeVisibleLogicalRangeChange(h), x.timeScale()
        .subscribeVisibleLogicalRangeChange(y), requestAnimationFrame(() => {
          try {
            const r = g.timeScale().getVisibleLogicalRange();
            r && x.timeScale().setVisibleLogicalRange(r)
          } catch {}
        }), o) {
        const r = C => {
          if (!f.current) {
            f.current = !0;
            try {
              C.time && o ? x.setCrosshairPosition(NaN, C.time, o) : x
              .clearCrosshairPosition()
            } catch {}
            f.current = !1
          }
        };
        g.subscribeCrosshairMove(r)
      }
      j && x.subscribeCrosshairMove(r => {
        if (!f.current) {
          f.current = !0;
          try {
            r.time && j ? g.setCrosshairPosition(NaN, r.time, j) : g
            .clearCrosshairPosition()
          } catch {}
          f.current = !1
        }
      })
    }
    return () => {
      l.current = null;
      try {
        x.remove()
      } catch {}
    }
  }, [p, n, s, g, j, d]), c.useEffect(() => {
    const v = V.current,
      i = l.current;
    if (!v || !i) return;
    const x = new ResizeObserver(() => {
      const {
        width: o,
        height: h
      } = v.getBoundingClientRect();
      o > 0 && h > 0 && i.applyOptions({
        width: o,
        height: h
      })
    });
    return x.observe(v), () => x.disconnect()
  }, []);
  const F = s === "rsi" ? "RSI" : s === "macd" ? "MACD" : s === "ha" ? "Heikin-Ashi" : s === "atr" ?
    "ATR" : s === "roc" ? "ROC" : s === "stochastic" ? "Stochastic" : s === "obv" ? "OBV" : s;
  return e.jsxs("div", {
    className: "relative w-full border-t border-border/30 flex-shrink-0",
    style: {
      height: s === "ha" ? 100 : wt
    },
    children: [e.jsx("div", {
      className: "absolute left-2 z-10 mt-0.5",
      children: e.jsx("span", {
        className: "text-[9px] font-mono text-muted-foreground/50 bg-background/80 px-1 py-0.5 rounded",
        children: F
      })
    }), e.jsx("div", {
      ref: V,
      className: "w-full h-full"
    })]
  })
}

function Vt({
  data: s,
  title: p,
  color: n,
  height: g,
  useFlexHeight: j,
  refLines: V,
  refBands: l,
  secondaryData: f,
  secondaryColor: d,
  secondaryLabel: F,
  id: v,
  activeIndicators: i,
  onMaximize: x,
  isMaximized: o,
  onRegisterChart: h,
  onUnregisterChart: y,
  onRegisterSeries: r,
  onCrosshairMove: C,
  onRemove: T
}) {
  const I = j || o,
    Y = c.useRef(null),
    _ = c.useRef(null),
    {
      colors: E
    } = Pt(),
    z = c.useRef(null),
    [O, U] = c.useState(!1),
    [q, w] = c.useState(0),
    G = c.useMemo(() => JSON.stringify(i), [i]);
  c.useEffect(() => {
    const W = Y.current;
    if (!W) return;
    _.current && (y(v), _.current.remove(), _.current = null);
    const D = Mt(W, {
      ...Is,
      width: W.clientWidth,
      height: I ? W.clientHeight || 300 : g
    });
    D.applyOptions(qs), _.current = D, Ot(D), h(v, D, s.length);
    const J = D.addSeries(H, {
      color: n,
      lineWidth: 1.5,
      priceLineVisible: !1,
      lastValueVisible: !0,
      crosshairMarkerRadius: 3
    });
    if (J.setData(s.map(b => ({
        time: b.time,
        value: b.value
      }))), z.current = J, r(v, J), w(b => b + 1), f && d) {
      const b = D.addSeries(H, {
        color: d,
        lineWidth: 1.5,
        priceLineVisible: !1,
        lastValueVisible: !0,
        priceScaleId: "right2"
      });
      b.setData(f.map(m => ({
        time: m.time,
        value: m.value
      }))), b.priceScale().applyOptions({
        scaleMargins: {
          top: .1,
          bottom: .1
        }
      })
    }
    if (V)
      for (const b of V) {
        const m = D.addSeries(H, {
          color: b.color,
          lineWidth: 1,
          lineStyle: b.style,
          title: b.label || "",
          priceLineVisible: !1,
          lastValueVisible: !1,
          crosshairMarkerVisible: !1
        });
        s.length >= 2 && m.setData([{
          time: s[0].time,
          value: b.value
        }, {
          time: s[s.length - 1].time,
          value: b.value
        }])
      }
    if (l)
      for (const b of l) {
        if (!b.data || b.data.length < 2) continue;
        D.addSeries(H, {
          color: b.color,
          lineWidth: 1,
          lineStyle: b.style,
          title: b.label || "",
          priceLineVisible: !1,
          lastValueVisible: !1,
          crosshairMarkerVisible: !1
        }).setData(b.data.map(S => ({
          time: S.time,
          value: S.value
        })))
      }
    if (s.length > 0) {
      if (i.sma) {
        const b = ms(s, i.sma);
        b.length > 0 && D.addSeries(H, {
          color: E.sma,
          lineWidth: 1,
          title: `SMA ${i.sma}`,
          lineStyle: N.Dashed
        }).setData(b.map(S => ({
          time: S.time,
          value: S.value
        })))
      }
      if (i.ema) {
        const b = xs(s, i.ema);
        b.length > 0 && D.addSeries(H, {
          color: E.ema,
          lineWidth: 1,
          title: `EMA ${i.ema}`
        }).setData(b.map(S => ({
          time: S.time,
          value: S.value
        })))
      }
      if (i.hma) {
        const b = hs(s, i.hma);
        b.length > 0 && D.addSeries(H, {
          color: E.hma,
          lineWidth: 2,
          title: `HMA ${i.hma}`
        }).setData(b.map(S => ({
          time: S.time,
          value: S.value
        })))
      }
      if (i.lsma) {
        const b = us(s, i.lsma, 0);
        b.length > 0 && D.addSeries(H, {
          color: E.lsma,
          lineWidth: 1,
          title: `LSMA ${i.lsma}`
        }).setData(b.map(S => ({
          time: S.time,
          value: S.value
        })))
      }
      if (i.slsma) {
        const b = ps(s, i.slsma, 0);
        b.length > 0 && D.addSeries(H, {
          color: E.slsma,
          lineWidth: 2,
          title: `SLSMA ${i.slsma}`
        }).setData(b.map(S => ({
          time: S.time,
          value: S.value
        })))
      }
      if (i.mean) {
        const {
          rolling: b,
          period: m
        } = i.mean;
        if (b) {
          const S = gs(s, m);
          if (S.mean.length > 0) {
            D.addSeries(H, {
              color: E.mean,
              lineWidth: 1,
              title: `Rolling Mean ${m}`,
              lineStyle: N.LargeDashed
            }).setData(S.mean.map(R => ({
              time: R.time,
              value: R.value
            })));
            for (const R of S.bands) D.addSeries(H, {
              color: Math.abs(R.mult) === 1 ? "rgba(99,102,241,0.4)" :
                "rgba(99,102,241,0.25)",
              lineWidth: 1,
              title: `${R.mult>0?"+":""}${R.mult}σ`,
              lineStyle: N.Dotted
            }).setData(R.data.map(te => ({
              time: te.time,
              value: te.value
            })))
          }
        } else {
          const S = m < s.length ? s.slice(-m) : s,
            t = fs(S);
          if (S.length >= 2) {
            const R = S[0].time,
              ce = S[S.length - 1].time;
            D.addSeries(H, {
              color: E.mean,
              lineWidth: 1,
              title: `Mean (${t.mean.toFixed(2)}) [${m}d]`,
              lineStyle: N.LargeDashed
            }).setData([{
              time: R,
              value: t.mean
            }, {
              time: ce,
              value: t.mean
            }]);
            for (const me of [1, -1, 2, -2]) D.addSeries(H, {
              color: Math.abs(me) === 1 ? "rgba(99,102,241,0.4)" : "rgba(99,102,241,0.25)",
              lineWidth: 1,
              title: `${me>0?"+":""}${me}σ`,
              lineStyle: N.Dotted
            }).setData([{
              time: R,
              value: t.mean + me * t.std
            }, {
              time: ce,
              value: t.mean + me * t.std
            }])
          }
        }
      }
      if (i.bollinger) {
        const {
          period: b,
          mult: m
        } = i.bollinger, S = bs(s, b, m);
        S.basis.length > 0 && (D.addSeries(H, {
          color: E.bollinger_basis,
          lineWidth: 1,
          title: `BB ${b},${m}`,
          lineStyle: N.LargeDashed
        }).setData(S.basis.map(te => ({
          time: te.time,
          value: te.value
        }))), D.addSeries(H, {
          color: E.bollinger_band,
          lineWidth: 1,
          title: "Upper",
          lineStyle: N.Dotted
        }).setData(S.upper.map(te => ({
          time: te.time,
          value: te.value
        }))), D.addSeries(H, {
          color: E.bollinger_band,
          lineWidth: 1,
          title: "Lower",
          lineStyle: N.Dotted
        }).setData(S.lower.map(te => ({
          time: te.time,
          value: te.value
        }))))
      }
      if (i.vwap) {
        const b = vs(s);
        b.length > 0 && D.addSeries(H, {
          color: E.vwap,
          lineWidth: 1,
          title: "VWAP",
          lineStyle: N.LargeDashed
        }).setData(b.map(S => ({
          time: S.time,
          value: S.value
        })))
      }
      if (i.heikinAshi) {
        const b = typeof i.heikinAshi == "object" ? i.heikinAshi : void 0,
          m = Tt(s, b);
        m.length > 0 && D.addSeries(zt, {
          upColor: E.ha_up,
          downColor: E.ha_down,
          borderUpColor: E.ha_up,
          borderDownColor: E.ha_down,
          wickUpColor: E.ha_up,
          wickDownColor: E.ha_down,
          title: "HA"
        }).setData(m.map(t => ({
          time: t.time,
          open: t.open,
          high: t.high,
          low: t.low,
          close: t.close
        })))
      }
      if (i.haSignals && J) {
        const b = typeof i.heikinAshi == "object" ? i.heikinAshi : void 0,
          m = js(s, b);
        if (m.length > 0) {
          const S = m.map(t => ({
            time: t.time,
            position: t.direction === "bullish" ? "belowBar" : "aboveBar",
            color: t.direction === "bullish" ? E.ha_signal_bull : E.ha_signal_bear,
            shape: t.direction === "bullish" ? "arrowUp" : "arrowDown",
            text: t.direction === "bullish" ? "▲" : "▼"
          }));
          S.sort((t, R) => String(t.time).localeCompare(String(R.time)));
          try {
            Ss(J, S)
          } catch (t) {
            console.warn("Failed to create HA signal markers in Pairs MiniChart:", t)
          }
        }
      }
    }
    const re = b => {
      if (!b.time || !b.seriesData) {
        C?.(v, null);
        return
      }
      const m = {};
      b.seriesData.forEach((S, t) => {
        const R = S?.value ?? S?.close;
        if (R != null) {
          const ce = t.options?.()?.title || p;
          m[ce || p] = R
        }
      }), Object.keys(m).length > 0 && C?.(v, {
        time: String(b.time),
        values: m
      })
    };
    D.subscribeCrosshairMove(re), D.timeScale().fitContent();
    const ie = new ResizeObserver(() => {
      _.current && W && _.current.applyOptions({
        width: W.clientWidth,
        height: I ? W.clientHeight || 300 : g
      })
    });
    return ie.observe(W), () => {
      ie.disconnect();
      try {
        D.unsubscribeCrosshairMove(re)
      } catch {}
      C?.(v, null), y(v), D.remove(), _.current = null
    }
  }, [s, f, n, d, g, v, G, o, I, E, l]), c.useEffect(() => {
    const W = _.current;
    if (W) try {
      W.priceScale("right").applyOptions({
        mode: O ? ut.Logarithmic : ut.Normal
      })
    } catch {}
  }, [O]);
  const le = Gs(i);
  return e.jsxs("div", {
    className: `flex flex-col ${o?"fixed inset-0 z-50 bg-background":I?"w-full h-full border border-border/30 min-h-0 overflow-hidden":"border-b border-border/30"}`,
    onDoubleClick: () => x(o ? null : v),
    children: [e.jsxs("div", {
      className: "flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0",
      children: [e.jsx("span", {
        className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
        children: p
      }), F && e.jsx("span", {
        className: "text-[10px] text-muted-foreground/60",
        children: F
      }), e.jsx("div", {
        className: "flex-1"
      }), e.jsx("button", {
        className: `text-[9px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${O?"bg-primary text-primary-foreground":"text-muted-foreground/60 hover:text-muted-foreground bg-transparent"}`,
        onClick: W => {
          W.stopPropagation(), U(!O)
        },
        title: "Toggle logarithmic scale",
        "data-testid": `pairs-chart-${v}-log`,
        children: "LOG"
      }), e.jsx("div", {
        onClick: W => W.stopPropagation(),
        children: e.jsx(Ns, {
          getChart: () => _.current,
          label: `Pairs_${p}`
        })
      }), e.jsx(B, {
        variant: "ghost",
        size: "sm",
        className: "h-5 w-5 p-0",
        onClick: W => {
          W.stopPropagation(), x(o ? null : v)
        },
        title: o ? "Restore" : "Maximize",
        children: o ? e.jsx(Qe, {
          className: "w-3 h-3"
        }) : e.jsx(Je, {
          className: "w-3 h-3"
        })
      }), T && e.jsx(B, {
        variant: "ghost",
        size: "sm",
        className: "h-5 w-5 p-0 text-muted-foreground hover:text-red-400",
        onClick: W => {
          W.stopPropagation(), T()
        },
        title: "Remove plot",
        "data-testid": `pairs-chart-${v}-remove`,
        children: e.jsx(Ye, {
          className: "w-3 h-3"
        })
      })]
    }), e.jsx("div", {
      ref: Y,
      style: I ? {
        flex: 1,
        overscrollBehavior: "contain"
      } : {
        height: g,
        overscrollBehavior: "contain"
      },
      className: I ? "flex-1 min-h-0" : ""
    }), le.map(W => e.jsx(Qs, {
      type: W,
      closeData: s,
      activeIndicators: i,
      parentChart: _.current,
      parentSeries: z.current
    }, W))]
  })
}

function Js({
  plot: s,
  tickerA: p,
  tickerB: n,
  zWindow: g,
  betaLookback: j,
  spreadZWindow: V,
  olsResidWindow: l,
  sigmaBandMode: f,
  zH: d,
  isMaximized: F,
  onMaximize: v,
  onRegisterChart: i,
  onUnregisterChart: x,
  onRegisterSeries: o,
  onCrosshairMove: h,
  onRemove: y,
  indicatorsForChart: r
}) {
  const C = `olsResidZ_extra_${s.id}`,
    {
      data: T,
      isLoading: I
    } = Ke({
      queryKey: ["pairs-extra-olsz", p, n, s.metricA, s.metricB, g, j, V, l],
      queryFn: () => Et(p, n, s.metricA, s.metricB, g, j, V, l),
      enabled: !!p && !!n
    }),
    Y = T?.olsResidZ || [],
    _ = c.useMemo(() => {
      if (f === "expanding") {
        const O = ze(Y, 2, 20),
          U = ze(Y, 1, 20),
          q = [];
        for (let w = 0; w < O.upper.length; w++) q.push({
          time: O.upper[w].time,
          value: (O.upper[w].value + O.lower[w].value) / 2
        });
        return {
          refLines: void 0,
          refBands: [{
            data: O.upper,
            color: "rgba(244,63,94,0.55)",
            style: N.Dashed,
            label: "+2σ"
          }, {
            data: U.upper,
            color: "rgba(255,255,255,0.18)",
            style: N.Dotted
          }, {
            data: q,
            color: "rgba(255,255,255,0.3)",
            style: N.Dashed
          }, {
            data: U.lower,
            color: "rgba(255,255,255,0.18)",
            style: N.Dotted
          }, {
            data: O.lower,
            color: "rgba(34,197,94,0.55)",
            style: N.Dashed,
            label: "-2σ"
          }]
        }
      }
      return {
        refLines: [{
          value: 2,
          color: "rgba(244,63,94,0.45)",
          style: N.Dashed,
          label: "+2σ"
        }, {
          value: 1,
          color: "rgba(255,255,255,0.12)",
          style: N.Dotted
        }, {
          value: 0,
          color: "rgba(255,255,255,0.25)",
          style: N.Dashed
        }, {
          value: -1,
          color: "rgba(255,255,255,0.12)",
          style: N.Dotted
        }, {
          value: -2,
          color: "rgba(34,197,94,0.45)",
          style: N.Dashed,
          label: "-2σ"
        }],
        refBands: void 0
      }
    }, [Y, f]),
    z = `OLS Residual Z — ${s.metricA===s.metricB?s.metricA:`${s.metricA} / ${s.metricB}`} (${l}d)`;
  return I && Y.length === 0 ? e.jsxs("div", {
    className: "flex flex-col border-b border-border/30",
    style: {
      minHeight: d
    },
    children: [e.jsxs("div", {
      className: "flex items-center gap-2 px-3 py-1 bg-card/50 flex-shrink-0",
      children: [e.jsx("span", {
        className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
        children: z
      }), e.jsx("div", {
        className: "flex-1"
      }), e.jsx(B, {
        variant: "ghost",
        size: "sm",
        className: "h-5 w-5 p-0 text-muted-foreground hover:text-red-400",
        onClick: y,
        title: "Remove plot",
        "data-testid": `pairs-chart-${C}-remove`,
        children: e.jsx(Ye, {
          className: "w-3 h-3"
        })
      })]
    }), e.jsx("div", {
      className: "flex items-center justify-center text-[10px] text-muted-foreground",
      style: {
        height: d
      },
      children: "Loading…"
    })]
  }) : e.jsx(Vt, {
    id: C,
    data: Y,
    title: z,
    color: "#a78bfa",
    height: d,
    useFlexHeight: !0,
    refLines: _.refLines,
    refBands: _.refBands,
    activeIndicators: r,
    onMaximize: v,
    isMaximized: F,
    onRegisterChart: i,
    onUnregisterChart: x,
    onRegisterSeries: o,
    onCrosshairMove: h,
    onRemove: y
  })
}

function Te() {
  return {
    priceA: [],
    priceB: [],
    ratio: [],
    logRatio: [],
    spread: [],
    zScore: [],
    spreadZ: [],
    olsResidZ: [],
    correlation: [],
    rollingBeta: [],
    betaAdjSpread: [],
    betaAdjSpreadRolling: [],
    rollingR2: [],
    percentileRank: [],
    cointStats: null
  }
}

function kt(s, p) {
  if (s.startsWith("BASKET:")) {
    const n = s.slice(7),
      g = p.find(j => j.id === n);
    return g ? g.name : s
  }
  return s
}

function sa() {
  const [s, p] = c.useState("ESS"), [n, g] = c.useState("MAA"), [j, V] = c.useState("close"), [l,
    f] = c.useState("close"), [d, F] = c.useState(60), [v, i] = c.useState(52), [x, o] = c.useState(
      8), [h, y] = c.useState(52), [r, C] = c.useState([]), [T, I] = c.useState("static"), [Y, _] =
    c.useState("rolling"), [E, z] = c.useState(""), [O, U] = c.useState(null), [q, w] = c.useState(!
      1), [G, le] = c.useState({}), [W, D] = c.useState("prices"), [J, re] = c.useState("1x1"), [ie,
      b
    ] = c.useState(() => new Set(Nt)), m = c.useCallback(() => ({
      tickerA: s,
      tickerB: n,
      metricA: j,
      metricB: l,
      zWindow: d,
      betaLookback: v,
      spreadZWindow: x,
      olsResidWindow: h,
      pairsLayout: J,
      visibleChartIds: [...ie],
      indicatorsMap: G,
      sigmaBandMode: T,
      betaAdjSpreadMode: Y,
      extraOlsZPlots: r
    }), [s, n, j, l, d, v, x, h, J, ie, G, T, Y, r]), S = c.useCallback(a => {
      a.tickerA !== void 0 && p(a.tickerA), a.tickerB !== void 0 && g(a.tickerB), a.metricA !==
        void 0 && V(a.metricA), a.metricB !== void 0 && f(a.metricB), a.zWindow !== void 0 && F(a
          .zWindow), a.betaLookback !== void 0 && i(a.betaLookback), a.spreadZWindow !== void 0 &&
        o(a.spreadZWindow), a.olsResidWindow !== void 0 && y(a.olsResidWindow), a.pairsLayout !==
        void 0 && re(a.pairsLayout), a.visibleChartIds && b(new Set(a.visibleChartIds)), a
        .indicatorsMap !== void 0 && le(a.indicatorsMap), a.sigmaBandMode !== void 0 && I(a
          .sigmaBandMode), (a.betaAdjSpreadMode === "rolling" || a.betaAdjSpreadMode ===
          "insample") && _(a.betaAdjSpreadMode), a.extraOlsZPlots !== void 0 && C(a
          .extraOlsZPlots)
    }, []), t = Ms();
  Qt("pairs", m, S, {
    universeSig: t,
    resultFields: ["tickerA", "tickerB"]
  });
  const R = c.useRef(null),
    [ce, te] = c.useState(null),
    me = c.useRef(new Map),
    Le = c.useRef(null),
    at = c.useCallback((a, u) => {
      u ? me.current.set(a, u) : me.current.delete(a), Le.current && cancelAnimationFrame(Le
        .current), Le.current = requestAnimationFrame(() => {
        const k = Array.from(me.current.values());
        if (k.length === 0) {
          te(null);
          return
        }
        const P = {};
        let M = k[0].time;
        for (const Z of k) {
          Z.time >= M && (M = Z.time);
          for (const [Q, X] of Object.entries(Z.values)) P[Q] = X
        }
        te({
          time: M,
          values: P
        })
      })
    }, []),
    Se = c.useRef(new Map),
    Ee = c.useRef(new Map),
    Ne = c.useRef(!1),
    Ze = c.useRef(new Map),
    Ve = c.useRef(new Map),
    lt = c.useCallback((a, u, k) => {
      Se.current.set(a, u), k != null && Ve.current.set(a, k), Wt(a, u), requestAnimationFrame(
      () => {
          const P = Array.from(Se.current.entries());
          if (P.length < 2) return;
          const M = P.find(([Z]) => Z === "prices") || P[0];
          if (M[0] !== a) try {
            const Z = M[1].timeScale().getVisibleLogicalRange();
            Z && u.timeScale().setVisibleLogicalRange(Z)
          } catch {}
        })
    }, []),
    rt = c.useCallback(a => {
      const u = Ze.current.get(a),
        k = Se.current.get(a);
      if (u && k) {
        try {
          k.timeScale().unsubscribeVisibleLogicalRangeChange(u.rangeHandler)
        } catch {}
        try {
          k.unsubscribeCrosshairMove(u.crosshairHandler)
        } catch {}
      }
      Ze.current.delete(a), Se.current.delete(a), Ee.current.delete(a), Ve.current.delete(a)
    }, []),
    it = c.useCallback((a, u) => {
      Ee.current.set(a, u)
    }, []),
    Wt = c.useCallback((a, u) => {
      const k = Z => {
          const Q = Math.max(1, ...Array.from(Ve.current.values())),
            X = 20;
          let {
            from: L,
            to: ee
          } = Z;
          const ue = ee - L;
          let ge = !1;
          return ee > Q - 1 + X && (ee = Q - 1 + X, L = ee - ue, ge = !0), L < -X && (L = -X, ee =
            L + ue, ge = !0), ge ? {
            from: L,
            to: ee
          } : null
        },
        P = () => {
          if (Ne.current) return;
          const Z = u.timeScale().getVisibleLogicalRange();
          if (!Z) return;
          const Q = k(Z),
            X = Q || Z;
          if (Ne.current = !0, Q) try {
            u.timeScale().setVisibleLogicalRange(Q)
          } catch {}
          Se.current.forEach((L, ee) => {
            if (ee !== a) try {
              L.timeScale().setVisibleLogicalRange(X)
            } catch {}
          }), requestAnimationFrame(() => {
            Ne.current = !1
          })
        };
      u.timeScale().subscribeVisibleLogicalRangeChange(P);
      const M = Z => {
        Ne.current || (Ne.current = !0, Se.current.forEach((Q, X) => {
          if (X !== a) try {
            if (Z.time) {
              const L = Ee.current.get(X);
              L && Q.setCrosshairPosition(NaN, Z.time, L)
            } else Q.clearCrosshairPosition()
          } catch {}
        }), Ne.current = !1)
      };
      u.subscribeCrosshairMove(M), Ze.current.set(a, {
        rangeHandler: P,
        crosshairHandler: M
      })
    }, []),
    {
      baskets: je,
      getBasket: nt
    } = Jt(),
    xe = kt(s, je),
    he = kt(n, je),
    {
      data: ot
    } = Ke({
      queryKey: ["tickers"],
      queryFn: $s
    }),
    ct = s.startsWith("BASKET:"),
    dt = n.startsWith("BASKET:"),
    _t = ct || dt,
    {
      data: A,
      isLoading: Ht
    } = Ke({
      queryKey: ["pairs", s, n, j, l, d, v, x, h],
      queryFn: async () => {
        if (_t) {
          let a;
          if (ct) {
            const P = nt(s.slice(7));
            if (!P) return Te();
            a = await pt(P, Oe)
          } else {
            if (a = await Oe(s, j), a.length === 0) return Te();
            const P = a[0].value;
            a = a.map(M => ({
              time: M.time,
              value: M.value / P * 100
            }))
          }
          let u;
          if (dt) {
            const P = nt(n.slice(7));
            if (!P) return Te();
            u = await pt(P, Oe)
          } else {
            if (u = await Oe(n, l), u.length === 0) return Te();
            const P = u[0].value;
            u = u.map(M => ({
              time: M.time,
              value: M.value / P * 100
            }))
          }
          return Ps(a, u, d, v, x, h)
        }
        return Et(s, n, j, l, d, v, x, h)
      },
      enabled: !!s && !!n
    }),
    It = c.useCallback(() => {
      p(n), g(s)
    }, [s, n]),
    $ = c.useMemo(() => {
      if (!A) return null;
      const {
        ratio: a,
        logRatio: u,
        zScore: k,
        spreadZ: P,
        olsResidZ: M,
        correlation: Z,
        percentileRank: Q
      } = A;
      if (a.length === 0) return null;
      const X = a[a.length - 1]?.value,
        L = u[u.length - 1]?.value,
        ee = k[k.length - 1]?.value,
        ue = P.length > 0 ? P[P.length - 1]?.value : void 0,
        ge = M.length > 0 ? M[M.length - 1]?.value : void 0,
        ye = Z[Z.length - 1]?.value,
        ne = Q.length > 0 ? Q[Q.length - 1]?.value : void 0,
        ve = a.map(fe => fe.value),
        Me = ve.reduce((fe, K) => fe + K, 0) / ve.length,
        oe = Math.sqrt(ve.reduce((fe, K) => fe + (K - Me) ** 2, 0) / ve.length),
        He = Math.min(...ve),
        Ie = Math.max(...ve),
        qe = A.rollingBeta.length > 0 ? A.rollingBeta[A.rollingBeta.length - 1]?.value : void 0,
        De = A.rollingR2.length > 0 ? A.rollingR2[A.rollingR2.length - 1]?.value : void 0;
      return {
        lastRatio: X,
        lastLogRatio: L,
        lastZScore: ee,
        lastSpreadZ: ue,
        lastOlsResidZ: ge,
        lastCorr: ye,
        lastBeta: qe,
        lastR2: De,
        lastPctRank: ne,
        ratioMean: Me,
        ratioStd: oe,
        ratioMin: He,
        ratioMax: Ie,
        dataPoints: a.length,
        cointStats: A.cointStats
      }
    }, [A]),
    qt = c.useCallback(() => {
      if (!A) return;
      const {
        priceA: a,
        priceB: u,
        ratio: k,
        logRatio: P,
        zScore: M,
        spreadZ: Z,
        olsResidZ: Q,
        correlation: X,
        rollingBeta: L,
        betaAdjSpread: ee,
        rollingR2: ue,
        percentileRank: ge
      } = A, ye = new Map, ne = (K, we) => {
        for (const Be of K) {
          const mt = ye.get(Be.time) || {
            date: Be.time
          };
          mt[we] = Be.value, ye.set(Be.time, mt)
        }
      };
      ne(a, "priceA"), ne(u, "priceB"), ne(k, "ratio"), ne(P, "logRatio"), ne(M, "zScore"), ne(Z,
        "spreadZ"), ne(Q, "olsResidZ"), ne(X, "correlation"), ne(L, "rollingBeta"), ne(ee,
        "betaAdjSpread"), ne(ue, "rollingR2"), ne(ge, "percentileRank");
      const ve = Array.from(ye.values()).sort((K, we) => K.date.localeCompare(we.date)),
        Me =
        `Date,${xe} ${j},${he} ${l},Ratio,Log Ratio,Z-Score (${d}d),Spread Z (${v}/${x}d),OLS Resid Z (${h}d),Pct Rank,Correlation (${d}d),Rolling Beta,Beta-Adj Spread,Rolling R2`,
        oe = (K, we) => K !== void 0 ? K.toFixed(we) : "",
        He = ve.map(K =>
          `${K.date},${oe(K.priceA,4)},${oe(K.priceB,4)},${oe(K.ratio,6)},${oe(K.logRatio,6)},${oe(K.zScore,4)},${oe(K.spreadZ,4)},${oe(K.olsResidZ,4)},${oe(K.percentileRank,2)},${oe(K.correlation,4)},${oe(K.rollingBeta,4)},${oe(K.betaAdjSpread,6)},${oe(K.rollingR2,4)}`
          ),
        Ie = [Me, ...He].join(`
`),
        qe = new Blob([Ie], {
          type: "text/csv"
        }),
        De = URL.createObjectURL(qe),
        fe = document.createElement("a");
      fe.href = De, fe.download = `pairs_${xe}_${he}.csv`, fe.click(), URL.revokeObjectURL(De)
    }, [A, s, n, j, l, d, v, x, h]),
    Kt = 180,
    $e = 160,
    Pe = 140,
    We = 120,
    _e = c.useMemo(() => {
      if (!A || A.ratio.length === 0) return [];
      const a = u => {
        if (T === "expanding") {
          const k = ze(u, 2, 20),
            P = ze(u, 1, 20),
            M = [];
          for (let Z = 0; Z < k.upper.length; Z++) M.push({
            time: k.upper[Z].time,
            value: (k.upper[Z].value + k.lower[Z].value) / 2
          });
          return {
            refLines: void 0,
            refBands: [{
              data: k.upper,
              color: "rgba(244,63,94,0.55)",
              style: N.Dashed,
              label: "+2σ"
            }, {
              data: P.upper,
              color: "rgba(255,255,255,0.18)",
              style: N.Dotted
            }, {
              data: M,
              color: "rgba(255,255,255,0.3)",
              style: N.Dashed
            }, {
              data: P.lower,
              color: "rgba(255,255,255,0.18)",
              style: N.Dotted
            }, {
              data: k.lower,
              color: "rgba(34,197,94,0.55)",
              style: N.Dashed,
              label: "-2σ"
            }]
          }
        }
        return {
          refLines: [{
            value: 2,
            color: "rgba(244,63,94,0.45)",
            style: N.Dashed,
            label: "+2σ"
          }, {
            value: 1,
            color: "rgba(255,255,255,0.12)",
            style: N.Dotted
          }, {
            value: 0,
            color: "rgba(255,255,255,0.25)",
            style: N.Dashed
          }, {
            value: -1,
            color: "rgba(255,255,255,0.12)",
            style: N.Dotted
          }, {
            value: -2,
            color: "rgba(34,197,94,0.45)",
            style: N.Dashed,
            label: "-2σ"
          }],
          refBands: void 0
        }
      };
      return [{
        id: "prices",
        data: A.priceA,
        secondaryData: A.priceB,
        title: `${xe} vs ${he} — ${j===l?j:j+" / "+l}`,
        secondaryLabel: `${xe} (blue) · ${he} (orange)`,
        color: "#0ea5e9",
        secondaryColor: "#f59e0b",
        height: Kt,
        refLines: void 0
      }, {
        id: "ratio",
        data: A.ratio,
        title: `Ratio (${xe} / ${he})`,
        testId: "pairs-ratio-chart",
        color: "#22c55e",
        height: $e
      }, {
        id: "logRatio",
        data: A.logRatio,
        title: `Log Ratio — ln(${xe} / ${he})`,
        color: "#a855f7",
        height: $e,
        refLines: [{
          value: 0,
          color: "rgba(255,255,255,0.2)",
          style: N.Dashed
        }]
      }, {
        id: "zscore",
        data: A.zScore,
        title: `Raw Ratio Z (${d}d)`,
        color: "#0ea5e9",
        height: Pe,
        ...a(A.zScore)
      }, {
        id: "spreadZ",
        data: A.spreadZ,
        title: `Spread Z (β=${v}d, z=${x}d)`,
        color: "#f43f5e",
        height: Pe,
        ...a(A.spreadZ)
      }, {
        id: "olsResidZ",
        data: A.olsResidZ,
        title: `OLS Residual Z (${h}d)`,
        color: "#a78bfa",
        height: Pe,
        ...a(A.olsResidZ)
      }, {
        id: "percentileRank",
        data: A.percentileRank,
        title: `Ratio Percentile Rank (${xe} / ${he})`,
        color: "#10b981",
        height: Pe,
        refLines: [{
          value: 50,
          color: "rgba(255,255,255,0.15)",
          style: N.Dashed
        }, {
          value: 25,
          color: "rgba(255,255,255,0.08)",
          style: N.Dotted
        }, {
          value: 75,
          color: "rgba(255,255,255,0.08)",
          style: N.Dotted
        }]
      }, {
        id: "correlation",
        data: A.correlation,
        title: `Rolling Correlation (${d}-day)`,
        color: "#f97316",
        height: We,
        refLines: [{
          value: 1,
          color: "rgba(255,255,255,0.1)",
          style: N.Dotted
        }, {
          value: 0,
          color: "rgba(255,255,255,0.15)",
          style: N.Dashed
        }, {
          value: -1,
          color: "rgba(255,255,255,0.1)",
          style: N.Dotted
        }, {
          value: .5,
          color: "rgba(255,255,255,0.06)",
          style: N.Dotted
        }, {
          value: -.5,
          color: "rgba(255,255,255,0.06)",
          style: N.Dotted
        }]
      }, {
        id: "spread",
        data: A.spread,
        title: `Spread (${xe} − ${he})`,
        color: "#14b8a6",
        height: $e,
        refLines: [{
          value: 0,
          color: "rgba(255,255,255,0.15)",
          style: N.Dashed
        }]
      }, {
        id: "rollingBeta",
        data: A.rollingBeta,
        title: `Rolling Beta (${xe} vs ${he}, ${d}d)`,
        color: "#ec4899",
        height: We,
        refLines: [{
          value: 1,
          color: "rgba(255,255,255,0.15)",
          style: N.Dashed
        }, {
          value: 0,
          color: "rgba(255,255,255,0.1)",
          style: N.Dotted
        }]
      }, {
        id: "betaAdjSpread",
        data: Y === "rolling" && A.betaAdjSpreadRolling.length > 0 ? A.betaAdjSpreadRolling :
          A.betaAdjSpread,
        title: Y === "rolling" && A.betaAdjSpreadRolling.length > 0 ?
          "Beta-Adjusted Spread (EG Residual, rolling β)" :
          "Beta-Adjusted Spread (EG Residual, in-sample β)",
        color: "#06b6d4",
        height: $e,
        refLines: [{
          value: 0,
          color: "rgba(255,255,255,0.15)",
          style: N.Dashed
        }]
      }, {
        id: "rollingR2",
        data: A.rollingR2,
        title: `Rolling R² (${d}d)`,
        color: "#8b5cf6",
        height: We,
        refLines: [{
          value: 1,
          color: "rgba(255,255,255,0.1)",
          style: N.Dotted
        }, {
          value: .5,
          color: "rgba(255,255,255,0.06)",
          style: N.Dotted
        }, {
          value: 0,
          color: "rgba(255,255,255,0.1)",
          style: N.Dotted
        }]
      }]
    }, [A, xe, he, j, l, d, v, x, h, T, Y]);
  return e.jsxs("div", {
    className: "flex flex-col h-full bg-background",
    "data-testid": "pairs-page",
    children: [e.jsxs("div", {
      className: "flex items-center gap-2 px-4 py-2 border-b border-border bg-card flex-wrap",
      children: [e.jsx("span", {
        className: "text-xs font-semibold text-muted-foreground",
        children: "A"
      }), e.jsx(Ct, {
        value: s,
        onChange: p,
        tickers: ot || [],
        baskets: je,
        testId: "pairs-ticker-a"
      }), e.jsx(B, {
        variant: "ghost",
        size: "sm",
        className: "h-7 w-7 p-0",
        onClick: It,
        "data-testid": "pairs-swap",
        title: "Swap tickers",
        children: e.jsx(Xt, {
          className: "w-3.5 h-3.5"
        })
      }), e.jsx("span", {
        className: "text-xs font-semibold text-muted-foreground",
        children: "B"
      }), e.jsx(Ct, {
        value: n,
        onChange: g,
        tickers: ot || [],
        baskets: je,
        testId: "pairs-ticker-b"
      }), e.jsx("div", {
        className: "h-5 w-px bg-border mx-1"
      }), je.length >= 2 && e.jsxs(Ce, {
        children: [e.jsx(Re, {
          asChild: !0,
          children: e.jsxs(B, {
            variant: "outline",
            size: "sm",
            className: "h-7 px-2 text-[10px] gap-1",
            "data-testid": "pairs-basket-presets-btn",
            children: [e.jsx(Ue, {
              className: "w-3 h-3"
            }), "Quick"]
          })
        }), e.jsxs(Fe, {
          className: "w-[260px] p-0",
          align: "start",
          children: [e.jsx("div", {
            className: "px-3 py-2 border-b border-border",
            children: e.jsx("span", {
              className: "text-[11px] font-semibold",
              children: "Basket Quick Presets"
            })
          }), e.jsx("div", {
            className: "py-1 max-h-[300px] overflow-y-auto",
            children: je.map((a, u) => je.slice(u + 1).map(k => e.jsxs(
              "button", {
                className: "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-accent/50 transition-colors text-muted-foreground",
                onClick: () => {
                  p(`BASKET:${a.id}`), g(`BASKET:${k.id}`)
                },
                "data-testid": `pair-spec-a-basket-${a.id}`,
                children: [e.jsx(Ue, {
                  className: "w-3 h-3 flex-shrink-0 text-amber-400"
                }), e.jsx("span", {
                  className: "font-mono text-foreground",
                  children: a.name
                }), e.jsx("span", {
                  className: "text-muted-foreground",
                  children: "/"
                }), e.jsx("span", {
                  className: "font-mono text-foreground",
                  children: k.name
                })]
              }, `${a.id}_${k.id}`)))
          })]
        })]
      }), e.jsx("div", {
        className: "h-5 w-px bg-border mx-1"
      }), e.jsxs(Ce, {
        children: [e.jsx(Re, {
          asChild: !0,
          children: e.jsxs(B, {
            variant: "outline",
            size: "sm",
            className: "h-7 px-2 text-[10px] gap-1",
            "data-testid": "pairs-template-btn",
            children: [e.jsx(Os, {
              className: "w-3 h-3"
            }), "Templates"]
          })
        }), e.jsxs(Fe, {
          className: "w-[240px] p-0",
          align: "start",
          children: [e.jsx("div", {
            className: "px-3 py-2 border-b border-border",
            children: e.jsx("span", {
              className: "text-[11px] font-semibold",
              children: "Metric Presets"
            })
          }), e.jsx("div", {
            className: "py-1 max-h-[300px] overflow-y-auto",
            children: Hs.map((a, u) => {
              const k = j === a.metricA && l === a.metricB;
              return e.jsxs("button", {
                className: `w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-accent/50 transition-colors ${k?"bg-accent/30 text-foreground font-medium":"text-muted-foreground"}`,
                onClick: () => {
                  V(a.metricA), f(a.metricB)
                },
                "data-testid": `pairs-template-${u}`,
                children: [k && e.jsx(Ge, {
                  className: "w-3 h-3 text-primary flex-shrink-0"
                }), !k && e.jsx("div", {
                  className: "w-3 flex-shrink-0"
                }), e.jsx("span", {
                  className: "font-mono",
                  children: a.label
                })]
              }, u)
            })
          })]
        })]
      }), e.jsx("div", {
        className: "h-5 w-px bg-border mx-0.5"
      }), e.jsx("span", {
        className: "text-xs font-semibold text-muted-foreground",
        children: "Metric A"
      }), e.jsx(Rt, {
        value: j,
        onChange: V,
        testId: "pairs-metric-a"
      }), e.jsx("span", {
        className: "text-xs font-semibold text-muted-foreground",
        children: "Metric B"
      }), e.jsx(Rt, {
        value: l,
        onChange: f,
        testId: "pairs-metric-b"
      }), e.jsx("div", {
        className: "h-5 w-px bg-border mx-1"
      }), e.jsx("span", {
        className: "text-xs font-semibold text-muted-foreground",
        children: "Raw Z"
      }), e.jsxs("div", {
        className: "flex items-center gap-0.5",
        children: [_s.map(a => e.jsx(B, {
          variant: d === a.value ? "default" : "ghost",
          size: "sm",
          className: "h-6 px-2 text-[10px]",
          onClick: () => F(a.value),
          "data-testid": `pairs-z-${a.value}`,
          children: a.label
        }, a.value)), e.jsx(pe, {
          type: "number",
          min: 2,
          max: 1e3,
          step: 1,
          value: d,
          onChange: a => {
            const u = parseInt(a.target.value);
            !isNaN(u) && u >= 2 && F(u)
          },
          className: "h-6 w-[52px] text-[10px] font-mono px-1.5 text-center",
          "data-testid": "pairs-z-custom"
        })]
      }), e.jsx("div", {
        className: "h-5 w-px bg-border mx-1"
      }), e.jsx("span", {
        className: "text-xs font-semibold text-muted-foreground",
        children: "Bands"
      }), e.jsxs("div", {
        className: "flex items-center gap-0.5",
        children: [e.jsx(B, {
          variant: T === "static" ? "default" : "ghost",
          size: "sm",
          className: "h-6 px-2 text-[10px]",
          onClick: () => I("static"),
          "data-testid": "pairs-bands-static",
          children: "Static"
        }), e.jsx(B, {
          variant: T === "expanding" ? "default" : "ghost",
          size: "sm",
          className: "h-6 px-2 text-[10px]",
          onClick: () => I("expanding"),
          "data-testid": "pairs-bands-expanding",
          children: "Expanding"
        })]
      }), e.jsx("div", {
        className: "h-5 w-px bg-border mx-1"
      }), e.jsx("span", {
        className: "text-xs font-semibold text-muted-foreground",
        title: "Beta-Adjusted Spread chart β mode",
        children: "EG-Spread β"
      }), e.jsxs("div", {
        className: "flex items-center gap-0.5",
        children: [e.jsx(B, {
          variant: Y === "rolling" ? "default" : "ghost",
          size: "sm",
          className: "h-6 px-2 text-[10px]",
          onClick: () => _("rolling"),
          "data-testid": "pairs-eg-rolling",
          title: "Rolling-window β (OOS-clean): β estimated using only past data at each bar. Eliminates look-ahead bias in the visualized spread.",
          children: "Rolling"
        }), e.jsx(B, {
          variant: Y === "insample" ? "default" : "ghost",
          size: "sm",
          className: "h-6 px-2 text-[10px]",
          onClick: () => _("insample"),
          "data-testid": "pairs-eg-insample",
          title: "Full-sample β (in-sample): matches the ADF cointegration test exactly, but the chart shows residuals computed from β that uses future data.",
          children: "In-sample"
        })]
      }), e.jsx("div", {
        className: "h-5 w-px bg-border mx-1"
      }), e.jsxs(Ce, {
        children: [e.jsx(Re, {
          asChild: !0,
          children: e.jsxs(B, {
            variant: "outline",
            size: "sm",
            className: "h-6 px-2 text-[10px] gap-1",
            "data-testid": "pairs-z-models-btn",
            children: ["Z-Models", e.jsx(Lt, {
              className: "w-2.5 h-2.5 opacity-60"
            })]
          })
        }), e.jsxs(Fe, {
          className: "w-[260px] p-3 space-y-3",
          align: "start",
          children: [e.jsxs("div", {
            className: "space-y-2",
            children: [e.jsx("div", {
              className: "text-[11px] font-semibold text-foreground",
              children: "Spread Z (dual-window)"
            }), e.jsxs("div", {
              className: "flex items-center gap-2",
              children: [e.jsx(ae, {
                className: "text-[10px] text-muted-foreground w-[50px] flex-shrink-0",
                children: "β lookback"
              }), e.jsx(pe, {
                type: "number",
                min: 5,
                max: 500,
                step: 1,
                value: v,
                onChange: a => i(Math.max(5, parseInt(a
                  .target.value) || 52)),
                className: "h-6 text-[10px] w-[80px] font-mono",
                "data-testid": "pairs-beta-lookback"
              }), e.jsx("span", {
                className: "text-[9px] text-muted-foreground",
                children: "days"
              })]
            }), e.jsxs("div", {
              className: "flex items-center gap-2",
              children: [e.jsx(ae, {
                className: "text-[10px] text-muted-foreground w-[50px] flex-shrink-0",
                children: "Z window"
              }), e.jsx(pe, {
                type: "number",
                min: 2,
                max: 200,
                step: 1,
                value: x,
                onChange: a => o(Math.max(2, parseInt(a
                  .target.value) || 8)),
                className: "h-6 text-[10px] w-[80px] font-mono",
                "data-testid": "pairs-spread-z-window"
              }), e.jsx("span", {
                className: "text-[9px] text-muted-foreground",
                children: "days"
              })]
            })]
          }), e.jsxs("div", {
            className: "border-t border-border pt-2 space-y-2",
            children: [e.jsx("div", {
              className: "text-[11px] font-semibold text-foreground",
              children: "OLS Residual Z"
            }), e.jsxs("div", {
              className: "flex items-center gap-2",
              children: [e.jsx(ae, {
                className: "text-[10px] text-muted-foreground w-[50px] flex-shrink-0",
                children: "Window"
              }), e.jsx(pe, {
                type: "number",
                min: 5,
                max: 500,
                step: 1,
                value: h,
                onChange: a => y(Math.max(5, parseInt(a
                  .target.value) || 52)),
                className: "h-6 text-[10px] w-[80px] font-mono",
                "data-testid": "pairs-ols-resid-window"
              }), e.jsx("span", {
                className: "text-[9px] text-muted-foreground",
                children: "days"
              })]
            })]
          }), e.jsxs("div", {
            className: "border-t border-border pt-2 space-y-2",
            children: [e.jsxs("div", {
              className: "flex items-center justify-between",
              children: [e.jsx("div", {
                className: "text-[11px] font-semibold text-foreground",
                children: "Extra OLS Z Plots"
              }), e.jsxs(B, {
                variant: "outline",
                size: "sm",
                className: "h-5 px-1.5 text-[9px] gap-1",
                onClick: () => {
                  const a =
                    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
                  C(u => [...u, {
                    id: a,
                    metricA: "P/FFO FY2",
                    metricB: "P/FFO FY2"
                  }])
                },
                "data-testid": "pairs-add-extra-olsz",
                children: [e.jsx(es, {
                  className: "w-2.5 h-2.5"
                }), "Add"]
              })]
            }), r.length === 0 ? e.jsx("div", {
              className: "text-[9px] text-muted-foreground/70 leading-tight",
              children: "Add additional OLS Residual Z plots with different metric pairs (e.g., P/FFO FY2, EV/EBITDA, FFO Yield)."
            }) : e.jsx("div", {
              className: "space-y-1.5 max-h-[260px] overflow-y-auto pr-1",
              children: r.map((a, u) => e.jsxs("div", {
                className: "flex items-center gap-1",
                "data-testid": `pairs-extra-olsz-row-${u}`,
                children: [e.jsx("span", {
                  className: "text-[9px] text-muted-foreground w-[10px]",
                  children: u + 1
                }), e.jsx(Ft, {
                  value: a.metricA,
                  onChange: k => C(P => P.map(M => M
                    .id === a.id ? {
                      ...M,
                      metricA: k
                    } : M)),
                  testId: `pairs-extra-olsz-${u}-a`
                }), e.jsx("span", {
                  className: "text-[9px] text-muted-foreground",
                  children: "/"
                }), e.jsx(Ft, {
                  value: a.metricB,
                  onChange: k => C(P => P.map(M => M
                    .id === a.id ? {
                      ...M,
                      metricB: k
                    } : M)),
                  testId: `pairs-extra-olsz-${u}-b`
                }), e.jsx(B, {
                  variant: "ghost",
                  size: "sm",
                  className: "h-5 w-5 p-0 text-muted-foreground hover:text-red-400 flex-shrink-0",
                  onClick: () => C(k => k.filter(P =>
                    P.id !== a.id)),
                  title: "Remove",
                  "data-testid": `pairs-extra-olsz-${u}-remove`,
                  children: e.jsx(Ye, {
                    className: "w-2.5 h-2.5"
                  })
                })]
              }, a.id))
            })]
          }), e.jsxs("div", {
            className: "text-[9px] text-muted-foreground/70 leading-tight",
            children: ["Spread Z: log(A) - ", "β", "*log(B), ", "β",
              " from rolling OLS, then z-scored.", e.jsx("br", {}),
              "OLS Resid Z: residual from rolling OLS with intercept, then z = resid / ",
              "σ", "."
            ]
          })]
        })]
      }), e.jsx("div", {
        className: "flex-1"
      }), $ && e.jsxs("span", {
        className: "text-[10px] text-muted-foreground font-mono",
        children: [A?.ratio.length ?? 0, " pts"]
      }), e.jsxs(Ce, {
        children: [e.jsx(Re, {
          asChild: !0,
          children: e.jsxs(B, {
            variant: "outline",
            size: "sm",
            className: "h-6 px-2 text-[10px] gap-1",
            "data-testid": "pairs-chart-picker-btn",
            children: [e.jsx(ts, {
              className: "w-3 h-3"
            }), "Charts (", ie.size, ")"]
          })
        }), e.jsxs(Fe, {
          className: "w-[220px] p-0",
          align: "end",
          children: [e.jsxs("div", {
            className: "px-3 py-2 border-b border-border flex items-center justify-between",
            children: [e.jsx("span", {
              className: "text-[11px] font-semibold",
              children: "Visible Charts"
            }), e.jsxs("div", {
              className: "flex gap-1",
              children: [e.jsx(B, {
                variant: "ghost",
                size: "sm",
                className: "h-5 px-1.5 text-[9px]",
                onClick: () => b(new Set(yt.map(a => a
                  .id))),
                "data-testid": "pairs-chart-picker-all",
                children: "All"
              }), e.jsx(B, {
                variant: "ghost",
                size: "sm",
                className: "h-5 px-1.5 text-[9px]",
                onClick: () => b(new Set(Nt)),
                "data-testid": "pairs-chart-picker-reset",
                children: "Reset"
              })]
            })]
          }), e.jsx("div", {
            className: "py-1",
            children: ["Core", "Z-Scores", "Stats"].map(a => e.jsxs(
              "div", {
                children: [e.jsx("div", {
                  className: "px-3 pt-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground",
                  children: a
                }), yt.filter(u => u.group === a).map(u => e
                  .jsxs("label", {
                    className: "flex items-center gap-2 px-3 py-1 hover:bg-accent/50 cursor-pointer",
                    children: [e.jsx(ss, {
                      checked: ie.has(u.id),
                      onCheckedChange: k => {
                        b(P => {
                          const M = new Set(P);
                          return k ? M.add(u.id) :
                            M.delete(u.id), M
                        })
                      },
                      className: "h-3.5 w-3.5",
                      "data-testid": `pairs-chart-toggle-${u.id}`
                    }), e.jsx("span", {
                      className: "text-[11px]",
                      children: u.label
                    })]
                  }, u.id))]
              }, a))
          })]
        })]
      }), e.jsx(as, {
        value: J,
        onChange: re,
        testId: "pairs-grid-picker"
      }), e.jsx("div", {
        className: "h-5 w-px bg-border mx-0.5"
      }), e.jsxs(B, {
        variant: q ? "default" : "ghost",
        size: "sm",
        className: "h-7 gap-1 text-xs",
        onClick: () => w(!q),
        "data-testid": "pairs-indicators-toggle",
        children: [e.jsx($t, {
          className: "w-3 h-3"
        }), "Indicators"]
      }), e.jsxs(B, {
        variant: "outline",
        size: "sm",
        className: "h-7 gap-1 text-xs",
        onClick: qt,
        "data-testid": "pairs-csv",
        children: [e.jsx(ls, {
          className: "w-3 h-3"
        }), "CSV"]
      })]
    }), $ && e.jsxs("div", {
      className: "flex items-center gap-4 px-4 py-1.5 border-b border-border/50 bg-card/30 flex-wrap",
      children: [e.jsx(se, {
        label: "Ratio",
        value: $.lastRatio?.toFixed(4)
      }), e.jsx(se, {
        label: "Log Ratio",
        value: $.lastLogRatio?.toFixed(4)
      }), e.jsx(se, {
        label: `Raw Z (${d}d)`,
        value: $.lastZScore?.toFixed(3),
        highlight: $.lastZScore !== void 0 ? Math.abs($.lastZScore) > 2 ? "red" :
          Math.abs($.lastZScore) > 1 ? "yellow" : "green" : void 0
      }), e.jsx(se, {
        label: "Spread Z",
        value: $.lastSpreadZ?.toFixed(3),
        highlight: $.lastSpreadZ !== void 0 ? Math.abs($.lastSpreadZ) > 2 ? "red" :
          Math.abs($.lastSpreadZ) > 1 ? "yellow" : "green" : void 0
      }), e.jsx(se, {
        label: "OLS Z",
        value: $.lastOlsResidZ?.toFixed(3),
        highlight: $.lastOlsResidZ !== void 0 ? Math.abs($.lastOlsResidZ) > 2 ?
          "red" : Math.abs($.lastOlsResidZ) > 1 ? "yellow" : "green" : void 0
      }), e.jsx(se, {
        label: "Pct Rank",
        value: $.lastPctRank !== void 0 ? `${$.lastPctRank.toFixed(1)}%` : void 0,
        highlight: $.lastPctRank !== void 0 ? $.lastPctRank > 90 || $.lastPctRank <
          10 ? "red" : $.lastPctRank > 75 || $.lastPctRank < 25 ? "yellow" :
          "green" : void 0
      }), e.jsx(se, {
        label: `Corr (${d}d)`,
        value: $.lastCorr?.toFixed(3)
      }), e.jsx("div", {
        className: "h-4 w-px bg-border"
      }), e.jsx(se, {
        label: "Ratio μ",
        value: $.ratioMean?.toFixed(4)
      }), e.jsx(se, {
        label: "Ratio σ",
        value: $.ratioStd?.toFixed(4)
      }), e.jsx(se, {
        label: "Ratio Range",
        value: `${$.ratioMin?.toFixed(3)} – ${$.ratioMax?.toFixed(3)}`
      }), e.jsx("div", {
        className: "h-4 w-px bg-border"
      }), e.jsx(se, {
        label: "Beta",
        value: $.lastBeta?.toFixed(3)
      }), e.jsx(se, {
        label: "R²",
        value: $.lastR2?.toFixed(3)
      }), $.cointStats && e.jsxs(e.Fragment, {
        children: [e.jsx("div", {
          className: "h-4 w-px bg-border"
        }), e.jsx(se, {
          label: "ADF",
          value: $.cointStats.adfStat.toFixed(3)
        }), e.jsx(se, {
          label: "Coint p",
          value: $.cointStats.pValue < .01 ? "<0.01" : $.cointStats.pValue
            .toFixed(3),
          highlight: $.cointStats.pValue < .05 ? "green" : $.cointStats
            .pValue < .1 ? "yellow" : "red"
        }), e.jsx(se, {
          label: "Hedge",
          value: $.cointStats.hedgeRatio.toFixed(3)
        }), e.jsx(se, {
          label: "Half-Life",
          value: $.cointStats.halfLife > 0 && $.cointStats.halfLife < 9999 ?
            `${$.cointStats.halfLife.toFixed(1)}d` : "N/A"
        })]
      }), ce && e.jsxs(e.Fragment, {
        children: [e.jsx("div", {
          className: "h-4 w-px bg-border"
        }), e.jsx("span", {
          className: "text-[10px] font-mono text-muted-foreground",
          children: ce.time
        }), Object.entries(ce.values).map(([a, u]) => e.jsxs("span", {
          className: "text-[10px] font-mono whitespace-nowrap",
          children: [e.jsxs("span", {
            className: "text-muted-foreground",
            children: [a, ": "]
          }), e.jsx("span", {
            className: "text-foreground font-semibold",
            children: typeof u == "number" ? u.toFixed(4) : u
          })]
        }, a))]
      })]
    }), e.jsxs("div", {
      className: "flex flex-1 overflow-hidden relative min-h-0",
      children: [(() => {
        const a = _e.filter(L => ie.has(L.id)),
          u = O ? a.filter(L => L.id === O) : a,
          k = O !== null,
          P = ie.has("olsScatter") && (O === null || O === "olsScatter"),
          M = ie.has("signalAnalyzer") && (O === null || O === "signalAnalyzer"),
          Z = O ? r.filter(L => `olsResidZ_extra_${L.id}` === O) : r,
          Q = u.length + (P ? 1 : 0) + (M ? 1 : 0) + Z.length,
          X = k ? {
            display: "grid",
            gridTemplateColumns: "1fr",
            gridTemplateRows: "1fr"
          } : (() => {
            const L = rs(J, Q),
              {
                cols: ee
              } = is(J),
              ue = Math.ceil(Q / ee);
            return {
              ...L,
              gridTemplateRows: `repeat(${ue}, minmax(260px, 1fr))`
            }
          })();
        return e.jsx("div", {
          ref: R,
          className: k ? "flex-1 min-h-0 overflow-hidden" :
            "flex-1 min-h-0 overflow-y-auto overflow-x-hidden",
          style: X,
          children: Ht ? e.jsx("div", {
            className: "flex items-center justify-center h-full text-muted-foreground text-sm",
            children: "Loading pairs data..."
          }) : _e.length === 0 ? e.jsx("div", {
            className: "flex items-center justify-center h-full text-muted-foreground text-sm",
            children: "Select two tickers to analyze their spread relationship"
          }) : e.jsxs(e.Fragment, {
            children: [u.map(L => e.jsx(Vt, {
              id: L.id,
              data: L.data,
              title: L.title,
              color: L.color,
              height: L.height,
              useFlexHeight: !0,
              refLines: L.refLines,
              refBands: L.refBands,
              secondaryData: L.secondaryData,
              secondaryColor: L.secondaryColor,
              secondaryLabel: L.secondaryLabel,
              activeIndicators: G[L.id] || St,
              onMaximize: U,
              isMaximized: O === L.id,
              onRegisterChart: lt,
              onUnregisterChart: rt,
              onRegisterSeries: it,
              onCrosshairMove: at
            }, L.id)), A && P && e.jsx(Us, {
              priceA: A.priceA,
              priceB: A.priceB,
              tickerA: s,
              tickerB: n,
              isMaximized: O === "olsScatter",
              onMaximize: U
            }), A && M && e.jsx(Vs, {
              priceA: A.priceA,
              priceB: A.priceB,
              tickerA: s,
              tickerB: n,
              isMaximized: O === "signalAnalyzer",
              onMaximize: U
            }), Z.map(L => {
              const ee = `olsResidZ_extra_${L.id}`;
              return e.jsx(Js, {
                plot: L,
                tickerA: s,
                tickerB: n,
                zWindow: d,
                betaLookback: v,
                spreadZWindow: x,
                olsResidWindow: h,
                sigmaBandMode: T,
                zH: 140,
                isMaximized: O === ee,
                onMaximize: U,
                onRegisterChart: lt,
                onUnregisterChart: rt,
                onRegisterSeries: it,
                onCrosshairMove: at,
                onRemove: () => C(ue => ue.filter(ge => ge.id !==
                  L.id)),
                indicatorsForChart: G[ee] || St
              }, L.id)
            })]
          })
        })
      })(), q && e.jsx(Ks, {
        charts: _e.map(a => ({
          id: a.id,
          title: a.title
        })),
        indicatorsMap: G,
        activeChartId: W,
        onSelectChart: D,
        onChangeIndicators: (a, u) => le(k => ({
          ...k,
          [a]: u
        })),
        onClose: () => w(!1)
      })]
    })]
  })
}

function Ct({
  value: s,
  onChange: p,
  tickers: n,
  baskets: g,
  testId: j
}) {
  const [V, l] = c.useState(!1), f = s.startsWith("BASKET:"), d = f ? s.slice(7) : null, F = d ? g
    .find(i => i.id === d) : null, v = F ? F.name : s || "Select...";
  return e.jsxs(Ce, {
    open: V,
    onOpenChange: l,
    children: [e.jsx(Re, {
      asChild: !0,
      children: e.jsxs(B, {
        variant: "outline",
        size: "sm",
        className: `h-7 w-[140px] justify-between px-2 font-mono font-bold text-xs ${f?"text-amber-300 border-amber-500/40":""}`,
        "data-testid": j,
        children: [e.jsx("span", {
          className: "truncate",
          children: v
        }), e.jsx(Lt, {
          className: "w-3 h-3 ml-1 opacity-50 flex-shrink-0"
        })]
      })
    }), e.jsx(Fe, {
      className: "w-[440px] p-0",
      align: "start",
      children: e.jsxs(ns, {
        children: [e.jsx(os, {
          placeholder: "Search ticker or basket...",
          className: "h-8 text-xs"
        }), e.jsxs(cs, {
          className: "max-h-[300px]",
          children: [e.jsx(ds, {
            children: "No match found."
          }), g.length > 0 && e.jsx(xt, {
            heading: "Baskets",
            children: g.map(i => e.jsxs(ht, {
              value: `BASKET:${i.id} ${i.name}`,
              onSelect: () => {
                p(`BASKET:${i.id}`), l(!1)
              },
              className: "text-xs",
              children: [e.jsx(Ge, {
                className: `w-3 h-3 mr-1.5 flex-shrink-0 ${s===`BASKET:${i.id}`?"opacity-100":"opacity-0"}`
              }), e.jsx(Ue, {
                className: "w-3 h-3 mr-1 text-amber-400 flex-shrink-0"
              }), e.jsx("span", {
                className: "font-mono font-bold mr-1.5 text-amber-300",
                children: i.name
              }), e.jsxs("span", {
                className: "text-muted-foreground text-[10px] truncate",
                children: [i.tickers.slice(0, 4).join(", "), i
                  .tickers.length > 4 ? "…" : ""
                ]
              })]
            }, i.id))
          }), e.jsx(xt, {
            heading: "Tickers",
            children: n.map(i => e.jsxs(ht, {
              value: `${i.ticker} ${i.name}`,
              onSelect: () => {
                p(i.ticker), l(!1)
              },
              className: "text-xs",
              children: [e.jsx(Ge, {
                className: `w-3 h-3 mr-1.5 flex-shrink-0 ${s===i.ticker?"opacity-100":"opacity-0"}`
              }), e.jsx("span", {
                className: "font-mono font-bold mr-1.5 whitespace-nowrap",
                children: i.ticker
              }), e.jsx("span", {
                className: "text-muted-foreground flex-1 min-w-0 truncate text-[10px]",
                title: i.name,
                children: i.name
              })]
            }, i.ticker))
          })]
        })]
      })
    })]
  })
}

function Rt({
  value: s,
  onChange: p,
  testId: n
}) {
  const g = Yt();
  return e.jsxs(Xe, {
    value: s,
    onValueChange: p,
    children: [e.jsx(et, {
      className: "h-7 text-xs w-[180px]",
      "data-testid": n,
      children: e.jsx(tt, {})
    }), e.jsxs(st, {
      className: "max-h-[420px]",
      children: [Object.entries(Zt).map(([j, V]) => e.jsxs("div", {
        children: [e.jsx("div", {
          className: "px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
          children: j
        }), V.map(l => e.jsx(Ae, {
          value: l,
          children: l
        }, l))]
      }, j)), g.length > 0 && e.jsxs("div", {
        children: [e.jsx("div", {
          className: "px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider",
          children: "Uploaded Fundamental"
        }), g.map(j => e.jsx(Ae, {
          value: j,
          children: j
        }, j))]
      })]
    })]
  })
}

function Ft({
  value: s,
  onChange: p,
  testId: n
}) {
  const g = Yt();
  return e.jsxs(Xe, {
    value: s,
    onValueChange: p,
    children: [e.jsx(et, {
      className: "h-6 text-[10px] flex-1 min-w-0 px-2",
      "data-testid": n,
      children: e.jsx(tt, {})
    }), e.jsxs(st, {
      className: "max-h-[420px]",
      children: [Object.entries(Zt).map(([j, V]) => e.jsxs("div", {
        children: [e.jsx("div", {
          className: "px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
          children: j
        }), V.map(l => e.jsx(Ae, {
          value: l,
          children: l
        }, l))]
      }, j)), g.length > 0 && e.jsxs("div", {
        children: [e.jsx("div", {
          className: "px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider",
          children: "Uploaded Fundamental"
        }), g.map(j => e.jsx(Ae, {
          value: j,
          children: j
        }, j))]
      })]
    })]
  })
}

function se({
  label: s,
  value: p,
  highlight: n
}) {
  const g = n === "red" ? "text-red-400" : n === "yellow" ? "text-amber-400" : n === "green" ?
    "text-emerald-400" : "text-foreground";
  return e.jsxs("div", {
    className: "flex items-center gap-1.5 text-[11px]",
    children: [e.jsxs("span", {
      className: "text-muted-foreground",
      children: [s, ":"]
    }), e.jsx("span", {
      className: `font-mono font-semibold ${g}`,
      children: p ?? "—"
    })]
  })
}
export {
  sa as
  default
};