import {
  a as X,
  r as m,
  e as J,
  s as Q,
  f as w,
  g as ee,
  b as te,
  h as se,
  j as t,
  o as B,
  p as A,
  q as G,
  t as U,
  v as Z,
  Y as ae,
  B as E,
  z as re,
  y as ne,
  N as _,
  by as le,
  aF as ie,
  aH as ce,
  aJ as L,
  aX as H,
  bz as oe,
  $ as de,
  af as ue,
  ae as xe,
  bw as me,
  bA as pe,
  bB as fe
} from "./index-CsG73Aq_.js";
import {
  T as he
} from "./trending-down-26dsT41Y.js";
import {
  E as ge
} from "./external-link-Cy9_YAtA.js";
import {
  A as be
} from "./arrow-up-down-CNMI3GZb.js";
const q = [{
    id: "DGS10",
    label: "10Y Treasury"
  }, {
    id: "DGS2",
    label: "2Y Treasury"
  }, {
    id: "DGS5",
    label: "5Y Treasury"
  }, {
    id: "DGS30",
    label: "30Y Treasury"
  }],
  Se = [{
    label: "3 Year",
    value: 756
  }, {
    label: "5 Year",
    value: 1260
  }, {
    label: "7 Year",
    value: 1764
  }, {
    label: "10 Year",
    value: 2520
  }, {
    label: "All",
    value: 99999
  }];

function ye(s) {
  if (s.length === 0) return {
    mean: 0,
    std: 0
  };
  const r = s.reduce((l, g) => l + g, 0) / s.length,
    x = s.reduce((l, g) => l + (g - r) ** 2, 0) / s.length;
  return {
    mean: r,
    std: Math.sqrt(x)
  }
}

function je(s, r) {
  return s.length <= 1 ? 50 : s.filter(l => l < r).length / (s.length - 1) * 100
}
async function ve(s, r) {
  const [x, l, g] = await Promise.all([ue(), xe(), me(s)]), p = new Map;
  for (const d of g) p.set(d.time, d.value);
  const y = new Map;
  let n = null;
  for (const d of l) {
    const b = p.get(d);
    b !== void 0 && Number.isFinite(b) ? (n = b, y.set(d, b)) : n !== null && y.set(d, n)
  }
  const a = pe("Dividend Yield"),
    v = [],
    F = 20;
  for (let d = 0; d < x.length; d += F) {
    const b = x.slice(d, d + F),
      k = await Promise.all(b.map(async u => {
        const o = {
          ticker: u.ticker,
          name: u.name,
          economy: u.economy || "",
          sector: u.sector || "",
          subsector: u.subsector || "",
          industryGroup: u.industryGroup || "",
          industry: u.industry || "",
          subindustry: u.subindustry || "",
          divYield: null,
          treasuryRate: null,
          spread: null,
          mean: null,
          std: null,
          zScore: null,
          histPctile: null,
          spreadSeries: [],
          sparkValues: []
        };
        try {
          const S = await fe(u.ticker);
          if (!S["Dividend Yield"]) return o;
          const N = S["Dividend Yield"],
            T = [];
          for (const [c, C] of N) {
            if (c >= l.length) continue;
            const z = l[c],
              R = y.get(z);
            if (R === void 0) continue;
            const f = C * a;
            T.push({
              time: z,
              value: +(f - R).toFixed(4)
            })
          }
          if (T.length === 0) return o;
          const i = (r >= T.length ? T : T.slice(-r)).map(c => c.value),
            {
              mean: D,
              std: j
            } = ye(i),
            P = T[T.length - 1].value,
            I = j > 0 ? (P - D) / j : null,
            W = je(i, P),
            $ = N[N.length - 1],
            V = $[1] * a;
          let e = null;
          for (let c = $[0]; c >= Math.max(0, $[0] - 10); c--)
            if (c < l.length && y.has(l[c])) {
              e = y.get(l[c]);
              break
            } o.divYield = V, o.treasuryRate = e, o.spread = P, o.mean = D, o.std = j, o
            .zScore = I, o.histPctile = W, o.spreadSeries = T, o.sparkValues = i.slice(-200)
        } catch {}
        return o
      }));
    v.push(...k)
  }
  return v
}

function ke({
  values: s,
  mean: r,
  std: x,
  current: l,
  width: g = 130,
  height: p = 32
}) {
  const y = m.useRef(null);
  return m.useEffect(() => {
    const n = y.current;
    if (!n || s.length < 2) return;
    const a = n.getContext("2d"),
      v = window.devicePixelRatio || 1;
    n.width = g * v, n.height = p * v, n.style.width = `${g}px`, n.style.height = `${p}px`, a
      .scale(v, v);
    let F = [...s];
    r !== null && x !== null && F.push(r + 2 * x, r - 2 * x);
    const d = Math.min(...F),
      k = Math.max(...F) - d || 1,
      u = 2,
      o = g - 2 * u,
      S = p - 2 * u,
      N = i => u + S - (i - d) / k * S,
      T = i => u + i / (s.length - 1) * o;
    if (a.clearRect(0, 0, g, p), r !== null && x !== null) {
      const i = N(r + x),
        D = N(r - x);
      a.fillStyle = "rgba(14, 165, 233, 0.07)", a.fillRect(u, i, o, D - i), a.beginPath(), a
        .strokeStyle = "rgba(14, 165, 233, 0.35)", a.lineWidth = .8, a.setLineDash([3, 3]);
      const j = N(r);
      a.moveTo(u, j), a.lineTo(u + o, j), a.stroke(), a.setLineDash([])
    }
    let Y = "rgba(14, 165, 233, 0.7)";
    if (r !== null && x !== null && l !== null && x > 0) {
      const i = (l - r) / x;
      i > 1 ? Y = "rgba(34, 197, 94, 0.75)" : i < -1 && (Y = "rgba(239, 68, 68, 0.75)")
    }
    a.beginPath(), a.strokeStyle = Y, a.lineWidth = 1.2;
    for (let i = 0; i < s.length; i++) {
      const D = T(i),
        j = N(s[i]);
      i === 0 ? a.moveTo(D, j) : a.lineTo(D, j)
    }
    if (a.stroke(), l !== null) {
      const i = u + o,
        D = N(l);
      a.beginPath(), a.arc(i, D, 2.5, 0, Math.PI * 2), a.fillStyle = Y, a.fill()
    }
  }, [s, r, x, l, g, p]), s.length < 2 ? t.jsx("span", {
    className: "text-[10px] text-muted-foreground/40",
    children: "—"
  }) : t.jsx("canvas", {
    ref: y,
    style: {
      width: g,
      height: p
    }
  })
}

function O(s) {
  return s === null ? "" : s >= 2 ? "text-green-400 font-semibold" : s >= 1 ? "text-green-400" :
    s >= .5 ? "text-green-300/80" : s <= -2 ? "text-red-400 font-semibold" : s <= -1 ?
    "text-red-400" : s <= -.5 ? "text-red-300/80" : "text-muted-foreground"
}

function Ne(s) {
  return s === null ? "" : s >= 2 ? "bg-green-500/10" : s >= 1 ? "bg-green-500/5" : s <= -2 ?
    "bg-red-500/10" : s <= -1 ? "bg-red-500/5" : ""
}

function K(s) {
  return s === null ? "" : s > 80 ? "text-green-400" : s < 20 ? "text-red-400" :
    "text-muted-foreground"
}

function Ce({
  row: s,
  treasuryLabel: r,
  onBack: x
}) {
  const [l, g] = m.useState(!1), p = m.useRef(null), y = m.useRef(null);
  return m.useEffect(() => {
    const n = p.current;
    if (!n || s.spreadSeries.length < 2) return;
    const a = ie(n, {
      width: n.clientWidth,
      height: n.clientHeight,
      layout: {
        background: {
          type: ce.Solid,
          color: "transparent"
        },
        textColor: "rgba(156,163,175,0.9)",
        fontSize: 11
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
        vertLine: {
          color: "rgba(255,255,255,0.15)",
          width: 1
        },
        horzLine: {
          color: "rgba(255,255,255,0.15)",
          width: 1
        }
      },
      rightPriceScale: {
        borderVisible: !1
      },
      timeScale: {
        borderVisible: !1,
        timeVisible: !1
      }
    });
    y.current = a, a.addSeries(L, {
      color: "rgba(14, 165, 233, 0.9)",
      lineWidth: 2,
      priceFormat: {
        type: "custom",
        formatter: b => b.toFixed(2) + "%"
      }
    }).setData(s.spreadSeries.map(b => ({
      time: b.time,
      value: b.value
    }))), s.mean !== null && a.addSeries(L, {
      color: "rgba(14, 165, 233, 0.35)",
      lineWidth: 1,
      lineStyle: 2,
      priceFormat: {
        type: "custom",
        formatter: k => k.toFixed(2) + "%"
      },
      crosshairMarkerVisible: !1,
      lastValueVisible: !0
    }).setData(s.spreadSeries.map(k => ({
      time: k.time,
      value: s.mean
    }))), s.mean !== null && s.std !== null && (a.addSeries(L, {
      color: "rgba(14, 165, 233, 0.15)",
      lineWidth: 1,
      lineStyle: 2,
      crosshairMarkerVisible: !1,
      lastValueVisible: !1
    }).setData(s.spreadSeries.map(S => ({
      time: S.time,
      value: s.mean + s.std
    }))), a.addSeries(L, {
      color: "rgba(14, 165, 233, 0.15)",
      lineWidth: 1,
      lineStyle: 2,
      crosshairMarkerVisible: !1,
      lastValueVisible: !1
    }).setData(s.spreadSeries.map(S => ({
      time: S.time,
      value: s.mean - s.std
    }))), a.addSeries(L, {
      color: "rgba(239, 68, 68, 0.15)",
      lineWidth: 1,
      lineStyle: 3,
      crosshairMarkerVisible: !1,
      lastValueVisible: !1
    }).setData(s.spreadSeries.map(S => ({
      time: S.time,
      value: s.mean + 2 * s.std
    }))), a.addSeries(L, {
      color: "rgba(239, 68, 68, 0.15)",
      lineWidth: 1,
      lineStyle: 3,
      crosshairMarkerVisible: !1,
      lastValueVisible: !1
    }).setData(s.spreadSeries.map(S => ({
      time: S.time,
      value: s.mean - 2 * s.std
    })))), a.timeScale().fitContent();
    const F = () => {
        n && a.applyOptions({
          width: n.clientWidth,
          height: n.clientHeight
        })
      },
      d = new ResizeObserver(F);
    return d.observe(n), () => {
      d.disconnect(), a.remove()
    }
  }, [s]), m.useEffect(() => {
    const n = y.current;
    if (n) try {
      n.priceScale("right").applyOptions({
        mode: l ? H.Logarithmic : H.Normal
      })
    } catch {}
  }, [l]), t.jsxs("div", {
    className: "flex flex-col h-full",
    "data-testid": "spread-detail",
    children: [t.jsxs("div", {
      className: "flex items-center gap-3 px-3 py-2 border-b border-border bg-card",
      children: [t.jsxs(E, {
        variant: "ghost",
        size: "sm",
        className: "h-6 text-[11px] gap-1",
        onClick: x,
        "data-testid": "spread-back-btn",
        children: [t.jsx(oe, {
          className: "w-3 h-3"
        }), " Back"]
      }), t.jsx("span", {
        className: "font-mono font-bold text-sm text-primary",
        children: s.ticker
      }), t.jsx("span", {
        className: "text-xs text-muted-foreground",
        children: s.name
      }), t.jsx("span", {
        className: "text-xs text-muted-foreground",
        children: "—"
      }), t.jsxs("span", {
        className: "text-xs text-foreground",
        children: ["Dividend Yield − ", r, " Spread"]
      }), t.jsx("div", {
        className: "flex-1"
      }), t.jsxs("div", {
        className: "flex items-center gap-3 text-[11px] font-mono",
        children: [t.jsxs("span", {
          children: ["Current:", " ", t.jsxs("span", {
            className: O(s.zScore),
            children: [s.spread?.toFixed(2), "%"]
          })]
        }), t.jsxs("span", {
          className: "text-muted-foreground",
          children: ["Mean: ", s.mean?.toFixed(2), "%"]
        }), t.jsxs("span", {
          className: "text-muted-foreground",
          children: ["σ: ", s.std?.toFixed(2), "%"]
        }), t.jsxs("span", {
          className: O(s.zScore),
          children: ["Z: ", s.zScore?.toFixed(2)]
        }), t.jsxs("span", {
          className: K(s.histPctile),
          children: ["Pctile: ", s.histPctile?.toFixed(0), "%"]
        })]
      }), t.jsx(E, {
        variant: l ? "default" : "ghost",
        size: "sm",
        className: "h-6 px-1.5 text-[10px] font-mono font-bold",
        onClick: () => g(!l),
        "data-testid": "spread-log-scale",
        title: "Toggle logarithmic price scale",
        children: "LOG"
      }), t.jsx(de, {
        getChart: () => y.current,
        label: `DivSpread_${s.ticker}_vs_${r}`
      })]
    }), t.jsx("div", {
      ref: p,
      className: "flex-1 min-h-0"
    })]
  })
}

function Re() {
  const {
    universeTickers: s
  } = X(), [r, x] = m.useState("DGS10"), [l, g] = m.useState(1260), [p, y] = m.useState("spread"), [
      n, a
    ] = m.useState("desc"), [v, F] = m.useState(""), [d, b] = m.useState(J), [k, u] = m.useState(
      new Set), [o, S] = m.useState(null), N = q.find(e => e.id === r)?.label ?? r, T = m
    .useCallback(() => ({
      treasuryId: r,
      lookback: l,
      sortCol: p,
      sortDir: n,
      search: v,
      classFilters: Q(d),
      manualTickers: [...k],
      selectedTicker: o
    }), [r, l, p, n, v, d, k, o]), Y = m.useCallback(e => {
      e.treasuryId !== void 0 && x(e.treasuryId), e.lookback !== void 0 && g(e.lookback), e
        .sortCol !== void 0 && y(e.sortCol), e.sortDir !== void 0 && a(e.sortDir), e.search !==
        void 0 && F(e.search), e.classFilters !== void 0 && b(w(e.classFilters)), e
        .manualTickers !== void 0 && u(new Set(e.manualTickers)), e.selectedTicker !== void 0 &&
        S(e.selectedTicker)
    }, []);
  ee("dividendSpread", T, Y);
  const {
    data: i = [],
    isLoading: D
  } = te({
    queryKey: ["dividend-spread", r, l],
    queryFn: () => ve(r, l)
  }), j = m.useMemo(() => {
    let e = i.filter(c => c.spread !== null);
    return s && (e = e.filter(c => s.has(c.ticker))), e = se(e, d, v, k), e.sort((c, C) => {
      const z = h => {
        const M = n === "asc" ? 1 / 0 : -1 / 0;
        switch (p) {
          case "ticker":
            return 0;
          case "divYield":
            return h.divYield ?? M;
          case "treasuryRate":
            return h.treasuryRate ?? M;
          case "spread":
            return h.spread ?? M;
          case "mean":
            return h.mean ?? M;
          case "zScore":
            return h.zScore ?? M;
          case "histPctile":
            return h.histPctile ?? M;
          default:
            return h.spread ?? M
        }
      };
      if (p === "ticker") return n === "asc" ? c.ticker.localeCompare(C.ticker) : C.ticker
        .localeCompare(c.ticker);
      const R = z(c),
        f = z(C);
      return n === "asc" ? R - f : f - R
    })
  }, [i, p, n, v, d, k, s]), P = m.useMemo(() => {
    const e = j.filter(f => f.zScore !== null);
    if (e.length === 0) return null;
    const c = e.filter(f => f.zScore > 1).length,
      C = e.filter(f => f.zScore >= -1 && f.zScore <= 1).length,
      z = e.filter(f => f.zScore < -1).length,
      R = [...e].sort((f, h) => f.zScore - h.zScore)[Math.floor(e.length / 2)].zScore;
    return {
      wideCount: c,
      fairCount: C,
      tightCount: z,
      medianZ: R,
      total: e.length
    }
  }, [j]), I = m.useMemo(() => o ? i.find(e => e.ticker === o) ?? null : null, [o, i]), W = e => {
    p === e ? a(n === "asc" ? "desc" : "asc") : (y(e), a(e === "ticker" ? "asc" : "desc"))
  }, $ = () => {
    const e = ["Rank", "Ticker", "Name", "Subindustry", "Div Yield %", `${N} %`, "Spread %",
        "Mean %", "Z-Score", "Hist %ile"
      ],
      c = j.map((h, M) => [M + 1, h.ticker, `"${h.name}"`, `"${h.subindustry}"`, h.divYield
        ?.toFixed(2) ?? "", h.treasuryRate?.toFixed(2) ?? "", h.spread?.toFixed(2) ?? "", h.mean
        ?.toFixed(2) ?? "", h.zScore?.toFixed(2) ?? "", h.histPctile?.toFixed(0) ?? ""
      ].join(",")),
      C = [e.join(","), ...c].join(`
`),
      z = new Blob([C], {
        type: "text/csv"
      }),
      R = URL.createObjectURL(z),
      f = document.createElement("a");
    f.href = R, f.download = `dividend_spread_vs_${r}.csv`, f.click(), URL.revokeObjectURL(R)
  }, V = ({
    col: e,
    label: c,
    className: C = ""
  }) => t.jsx("th", {
    className: `px-2 py-1.5 text-muted-foreground font-medium ${C}`,
    children: t.jsxs("button", {
      className: "inline-flex items-center gap-0.5 hover:text-foreground",
      onClick: () => W(e),
      "data-testid": `sort-${e}`,
      children: [c, t.jsx(be, {
        className: "w-2.5 h-2.5"
      })]
    })
  });
  return I ? t.jsx(Ce, {
    row: I,
    treasuryLabel: N,
    onBack: () => S(null)
  }) : t.jsxs("div", {
    className: "flex flex-col h-full bg-background",
    "data-testid": "dividend-spread-page",
    children: [t.jsxs("div", {
      className: "flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card flex-wrap",
      children: [t.jsx("span", {
        className: "text-xs font-semibold text-muted-foreground",
        children: "Rate"
      }), t.jsxs(B, {
        value: r,
        onValueChange: x,
        children: [t.jsx(A, {
          className: "h-6 text-[11px] w-[120px]",
          "data-testid": "spread-rate-select",
          children: t.jsx(G, {})
        }), t.jsx(U, {
          children: q.map(e => t.jsx(Z, {
            value: e.id,
            children: e.label
          }, e.id))
        })]
      }), t.jsx("div", {
        className: "h-5 w-px bg-border mx-1"
      }), t.jsx("span", {
        className: "text-xs font-semibold text-muted-foreground",
        children: "Lookback"
      }), t.jsxs(B, {
        value: String(l),
        onValueChange: e => g(parseInt(e)),
        children: [t.jsx(A, {
          className: "h-6 text-[11px] w-[90px]",
          "data-testid": "spread-lookback",
          children: t.jsx(G, {})
        }), t.jsx(U, {
          children: Se.map(e => t.jsx(Z, {
            value: String(e.value),
            children: e.label
          }, e.value))
        })]
      }), t.jsx("div", {
        className: "h-5 w-px bg-border mx-1"
      }), P && t.jsxs("div", {
        className: "flex items-center gap-2 ml-auto mr-2",
        children: [t.jsxs("span", {
          className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 font-mono",
          children: [t.jsx(ae, {
            className: "w-2.5 h-2.5"
          }), " Wide: ", P.wideCount]
        }), t.jsxs("span", {
          className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground font-mono",
          children: ["Fair: ", P.fairCount]
        }), t.jsxs("span", {
          className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 font-mono",
          children: [t.jsx(he, {
            className: "w-2.5 h-2.5"
          }), " Tight: ", P.tightCount]
        }), t.jsxs("span", {
          className: "text-[10px] text-muted-foreground/60 font-mono",
          children: ["Med Z: ", P.medianZ.toFixed(2)]
        })]
      }), t.jsxs(E, {
        variant: "outline",
        size: "sm",
        className: "h-6 gap-1 text-[11px]",
        onClick: $,
        "data-testid": "spread-export",
        children: [t.jsx(re, {
          className: "w-3 h-3"
        }), "CSV"]
      })]
    }), t.jsx("div", {
      className: "flex items-center gap-1.5 px-3 py-1 border-b border-border/50 flex-wrap",
      children: t.jsx(ne, {
        filters: d,
        onFiltersChange: b,
        search: v,
        onSearchChange: F,
        manualTickers: k,
        onManualTickersChange: u,
        filteredCount: j.length,
        totalCount: i.length,
        testIdPrefix: "spread"
      })
    }), t.jsx("div", {
      className: "flex-1 overflow-auto",
      children: D ? t.jsx("div", {
        className: "flex items-center justify-center h-64 text-muted-foreground text-sm",
        children: "Computing dividend spreads for all tickers..."
      }) : t.jsxs("table", {
        className: "w-full text-[11px]",
        "data-testid": "spread-table",
        children: [t.jsx("thead", {
          className: "sticky top-0 bg-card z-10",
          children: t.jsxs("tr", {
            className: "border-b border-border",
            children: [t.jsx("th", {
              className: "text-center px-2 py-1.5 w-8 text-muted-foreground font-medium",
              children: "#"
            }), t.jsx(V, {
              col: "ticker",
              label: "Ticker",
              className: "text-left w-14"
            }), t.jsx("th", {
              className: "text-left px-2 py-1.5 text-muted-foreground font-medium max-w-[140px]",
              children: "Name"
            }), t.jsx("th", {
              className: "text-left px-2 py-1.5 w-28 text-muted-foreground font-medium",
              children: "SubInd"
            }), t.jsx(V, {
              col: "divYield",
              label: "Div Yld",
              className: "text-right"
            }), t.jsx(V, {
              col: "treasuryRate",
              label: N.replace(" Treasury", ""),
              className: "text-right"
            }), t.jsx(V, {
              col: "spread",
              label: "Spread",
              className: "text-right"
            }), t.jsx(V, {
              col: "mean",
              label: "Mean",
              className: "text-right"
            }), t.jsx(V, {
              col: "zScore",
              label: "Z-Score",
              className: "text-right"
            }), t.jsx(V, {
              col: "histPctile",
              label: "Hist%",
              className: "text-right"
            }), t.jsx("th", {
              className: "text-center px-2 py-1.5 text-muted-foreground font-medium w-[140px]",
              children: "Trail"
            }), t.jsx("th", {
              className: "text-center px-2 py-1.5 text-muted-foreground font-medium w-10",
              children: "Flag"
            })]
          })
        }), t.jsx("tbody", {
          children: j.map((e, c) => {
            const C = e.zScore !== null && (e.zScore > 2 || e.zScore < -2);
            return t.jsxs("tr", {
              className: `group border-b border-border/20 hover:bg-accent/30 transition-colors cursor-pointer ${Ne(e.zScore)}`,
              onClick: () => _(e.ticker),
              "data-testid": `spread-row-${e.ticker}`,
              children: [t.jsx("td", {
                className: "px-2 py-1 text-muted-foreground font-mono tabular-nums text-center",
                children: c + 1
              }), t.jsx("td", {
                className: "px-2 py-1 font-mono font-bold",
                children: t.jsxs("button", {
                  className: "text-primary hover:text-primary/80 hover:underline inline-flex items-center gap-0.5",
                  onClick: z => {
                    z.stopPropagation(), _(e.ticker)
                  },
                  children: [e.ticker, t.jsx(ge, {
                    className: "w-2.5 h-2.5 opacity-0 group-hover:opacity-60"
                  })]
                })
              }), t.jsx("td", {
                className: "px-2 py-1 text-foreground truncate max-w-[140px]",
                children: e.name
              }), t.jsx("td", {
                className: "px-2 py-1 text-muted-foreground text-[10px] truncate",
                children: e.subindustry.replace(" Equity REITs",
                  "")
              }), t.jsxs("td", {
                className: "px-2 py-1 text-right font-mono tabular-nums",
                children: [e.divYield?.toFixed(2) ?? "—", "%"]
              }), t.jsxs("td", {
                className: "px-2 py-1 text-right font-mono tabular-nums text-muted-foreground",
                children: [e.treasuryRate?.toFixed(2) ?? "—", "%"]
              }), t.jsx("td", {
                className: `px-2 py-1 text-right font-mono tabular-nums font-semibold ${e.spread!==null?e.spread>0?"text-green-400":"text-red-400":""}`,
                children: e.spread !== null ?
                  `${e.spread>0?"+":""}${e.spread.toFixed(2)}%` :
                  "—"
              }), t.jsxs("td", {
                className: "px-2 py-1 text-right font-mono tabular-nums text-muted-foreground",
                children: [e.mean?.toFixed(2) ?? "—", "%"]
              }), t.jsx("td", {
                className: `px-2 py-1 text-right font-mono tabular-nums ${O(e.zScore)}`,
                children: e.zScore !== null ? e.zScore.toFixed(
                  2) : "—"
              }), t.jsx("td", {
                className: `px-2 py-1 text-right font-mono tabular-nums ${K(e.histPctile)}`,
                children: e.histPctile !== null ?
                  `${e.histPctile.toFixed(0)}%` : "—"
              }), t.jsx("td", {
                className: "px-1 py-1",
                children: t.jsx(ke, {
                  values: e.sparkValues,
                  mean: e.mean,
                  std: e.std,
                  current: e.spread
                })
              }), t.jsx("td", {
                className: "px-1 py-1 text-center",
                children: C && t.jsx(le, {
                  className: `w-3.5 h-3.5 mx-auto ${e.zScore>0?"text-green-400":"text-red-400"}`
                })
              })]
            }, e.ticker)
          })
        })]
      })
    })]
  })
}
export {
  Re as
  default
};