import {
  r as d,
  j as e,
  b8 as je,
  E as ye,
  bC as Ne,
  Y as ve,
  a as we,
  e as Se,
  s as ke,
  f as Ce,
  g as De,
  b as O,
  h as Fe,
  bD as Z,
  bE as I,
  bF as W,
  bG as B,
  I as K,
  bH as Me,
  B as Ee,
  z as Re,
  y as $e,
  bI as Y,
  bm as Te,
  bn as Ae,
  bJ as Le,
  bK as We,
  bL as Ue,
  bM as Pe
} from "./index-CsG73Aq_.js";
import {
  T as _e
} from "./trending-down-26dsT41Y.js";
import {
  A as Oe
} from "./arrow-up-down-CNMI3GZb.js";

function re(o, a) {
  const [c, u] = o.split("-").map(Number), b = a.getFullYear();
  return new Date(b, c - 1, u)
}

function U(o, a) {
  return Math.round((a.getTime() - o.getTime()) / 864e5)
}

function oe(o, a, c) {
  const u = a.getFullYear();
  let b = re(o.startMMDD, a),
    p = re(o.endMMDD, a);
  if (p <= b) {
    const f = new Date(u + 1, p.getMonth(), p.getDate()),
      E = U(a, b),
      s = U(a, f),
      i = new Date(u - 1, b.getMonth(), b.getDate()),
      l = U(a, i),
      j = U(a, p);
    if (j >= -7 && l <= c) {
      const A = l <= 0 && j >= 0;
      return j < -7 || !A && l > c ? null : {
        daysUntilStart: l,
        daysUntilEnd: j,
        isActive: A
      }
    }
    const k = E <= 0 && s >= 0;
    return s < -7 || !k && E > c ? null : {
      daysUntilStart: E,
      daysUntilEnd: s,
      isActive: k
    }
  }
  const T = U(a, b),
    y = U(a, p),
    N = T <= 0 && y >= 0;
  return y < -7 || !N && T > c ? null : {
    daysUntilStart: T,
    daysUntilEnd: y,
    isActive: N
  }
}
const Ie = [{
  label: "2 weeks",
  days: 14
}, {
  label: "30 days",
  days: 30
}, {
  label: "60 days",
  days: 60
}, {
  label: "90 days",
  days: 90
}];

function Be({
  data: o
}) {
  const [a, c] = d.useState(30), [u, b] = d.useState(!1), [p, T] = d.useState("all"), y = d.useMemo(
    () => {
      const s = new Date;
      return s.setHours(0, 0, 0, 0), s
    }, []), N = d.useMemo(() => {
    const s = [];
    for (const i of o) {
      for (const l of i.bullish) {
        const j = oe(l, y, a);
        j && s.push({
          ticker: i.ticker,
          name: i.name,
          window: l,
          direction: "bullish",
          ...j
        })
      }
      for (const l of i.bearish) {
        const j = oe(l, y, a);
        j && s.push({
          ticker: i.ticker,
          name: i.name,
          window: l,
          direction: "bearish",
          ...j
        })
      }
    }
    return s.sort((i, l) => i.isActive && !l.isActive ? -1 : !i.isActive && l.isActive ? 1 : i
      .daysUntilStart - l.daysUntilStart), p !== "all" ? s.filter(i => i.direction === p) : s
  }, [o, y, a, p]), f = N.filter(s => s.isActive).length, E = N.filter(s => !s.isActive).length;
  return e.jsxs("div", {
    className: "border-b border-border bg-card/50",
    children: [e.jsxs("div", {
      className: "flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent/20 transition-colors",
      onClick: () => b(!u),
      children: [e.jsx(je, {
        className: "w-3.5 h-3.5 text-blue-400"
      }), e.jsx("span", {
        className: "text-xs font-medium text-foreground",
        children: "Upcoming Windows"
      }), f > 0 && e.jsxs("span", {
        className: "text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium",
        children: [f, " active now"]
      }), E > 0 && e.jsxs("span", {
        className: "text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium",
        children: [E, " upcoming"]
      }), N.length === 0 && e.jsx("span", {
        className: "text-[10px] text-muted-foreground",
        children: "None in range"
      }), e.jsx("div", {
        className: "ml-auto flex items-center gap-1",
        children: u ? e.jsx(ye, {
          className: "w-3.5 h-3.5 text-muted-foreground"
        }) : e.jsx(Ne, {
          className: "w-3.5 h-3.5 text-muted-foreground"
        })
      })]
    }), !u && e.jsxs("div", {
      className: "px-3 pb-2",
      children: [e.jsxs("div", {
        className: "flex items-center gap-2 mb-1.5",
        children: [e.jsx("div", {
          className: "flex items-center bg-muted rounded p-0.5",
          children: Ie.map(s => e.jsx("button", {
            className: `px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${a===s.days?"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`,
            onClick: () => c(s.days),
            children: s.label
          }, s.days))
        }), e.jsx("div", {
          className: "flex items-center bg-muted rounded p-0.5",
          children: ["all", "bullish", "bearish"].map(s => e.jsx("button", {
            className: `px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${p===s?s==="bullish"?"bg-emerald-600/30 text-emerald-400 shadow-sm":s==="bearish"?"bg-red-600/30 text-red-400 shadow-sm":"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`,
            onClick: () => T(s),
            children: s === "all" ? "All" : s === "bullish" ?
              "Bullish" : "Bearish"
          }, s))
        }), e.jsxs("span", {
          className: "text-[10px] text-muted-foreground ml-auto",
          children: [N.length, " window", N.length !== 1 ? "s" : ""]
        })]
      }), N.length > 0 ? e.jsx("div", {
        className: "max-h-[220px] overflow-y-auto rounded border border-border/50",
        children: e.jsxs("table", {
          className: "w-full text-xs",
          children: [e.jsx("thead", {
            className: "sticky top-0 bg-card border-b border-border/50",
            children: e.jsxs("tr", {
              children: [e.jsx("th", {
                className: "px-2 py-1 text-left text-[10px] font-medium text-muted-foreground w-10",
                children: "Status"
              }), e.jsx("th", {
                className: "px-2 py-1 text-left text-[10px] font-medium text-muted-foreground w-14",
                children: "Ticker"
              }), e.jsx("th", {
                className: "px-2 py-1 text-left text-[10px] font-medium text-muted-foreground w-10",
                children: "Dir"
              }), e.jsx("th", {
                className: "px-2 py-1 text-left text-[10px] font-medium text-muted-foreground",
                children: "Window"
              }), e.jsx("th", {
                className: "px-2 py-1 text-right text-[10px] font-medium text-muted-foreground w-14",
                children: "Starts"
              }), e.jsx("th", {
                className: "px-2 py-1 text-right text-[10px] font-medium text-muted-foreground w-12",
                children: "Avg"
              }), e.jsx("th", {
                className: "px-2 py-1 text-right text-[10px] font-medium text-muted-foreground w-12",
                children: "Win%"
              }), e.jsx("th", {
                className: "px-2 py-1 text-right text-[10px] font-medium text-muted-foreground w-8",
                children: "N"
              }), e.jsx("th", {
                className: "px-2 py-1 text-right text-[10px] font-medium text-muted-foreground w-12",
                children: "t-stat"
              })]
            })
          }), e.jsx("tbody", {
            children: N.map((s, i) => e.jsxs("tr", {
                className: `border-b border-border/20 hover:bg-accent/30 transition-colors ${s.isActive?"bg-amber-500/5":""}`,
                children: [e.jsx("td", {
                  className: "px-2 py-1",
                  children: s.isActive ? e.jsxs("span", {
                    className: "inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-400",
                    children: [e.jsx("span", {
                      className: "w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"
                    }), "Live"]
                  }) : e.jsx("span", {
                    className: "text-[10px] text-muted-foreground",
                    children: "Soon"
                  })
                }), e.jsx("td", {
                  className: "px-2 py-1 font-mono font-semibold",
                  children: s.ticker
                }), e.jsx("td", {
                  className: "px-2 py-1",
                  children: s.direction === "bullish" ? e.jsx(
                    ve, {
                      className: "w-3 h-3 text-emerald-400"
                    }) : e.jsx(_e, {
                    className: "w-3 h-3 text-red-400"
                  })
                }), e.jsxs("td", {
                  className: "px-2 py-1 whitespace-nowrap",
                  children: [e.jsx("span", {
                    className: s.direction === "bullish" ?
                      "text-emerald-400 font-medium" :
                      "text-red-400 font-medium",
                    children: s.window.startLabel
                  }), e.jsx("span", {
                    className: "text-muted-foreground mx-0.5",
                    children: "→"
                  }), e.jsx("span", {
                    className: s.direction === "bullish" ?
                      "text-emerald-400 font-medium" :
                      "text-red-400 font-medium",
                    children: s.window.endLabel
                  })]
                }), e.jsx("td", {
                  className: "px-2 py-1 text-right font-mono tabular-nums",
                  children: s.isActive ? e.jsxs("span", {
                    className: "text-amber-400",
                    children: [s.daysUntilEnd, "d left"]
                  }) : s.daysUntilEnd < 0 ? e.jsxs("span", {
                    className: "text-muted-foreground",
                    children: ["Ended ", Math.abs(s
                      .daysUntilEnd), "d ago"]
                  }) : e.jsxs("span", {
                    className: "text-blue-400",
                    children: ["In ", s.daysUntilStart, "d"]
                  })
                }), e.jsx("td", {
                  className: "px-2 py-1 text-right",
                  children: e.jsxs("span", {
                    className: `font-mono tabular-nums ${s.window.avgReturn>0?"text-emerald-400":"text-red-400"}`,
                    children: [s.window.avgReturn > 0 ?
                      "+" : "", s.window.avgReturn
                      .toFixed(2), "%"
                    ]
                  })
                }), e.jsxs("td", {
                  className: "px-2 py-1 text-right font-mono tabular-nums text-foreground",
                  children: [s.window.winRate.toFixed(0), "%"]
                }), e.jsx("td", {
                  className: "px-2 py-1 text-right font-mono tabular-nums text-muted-foreground",
                  children: s.window.years
                }), e.jsx("td", {
                  className: "px-2 py-1 text-right font-mono tabular-nums text-muted-foreground",
                  children: s.window.tStat.toFixed(2)
                })]
              },
              `${s.ticker}-${s.direction}-${s.window.startMMDD}-${s.window.endMMDD}-${i}`
              ))
          })]
        })
      }) : e.jsxs("div", {
        className: "text-center py-3 text-[11px] text-muted-foreground",
        children: ["No seasonal windows starting within ", a, " days"]
      })]
    })]
  })
}
const le = {
    earnings: "Post-Earnings",
    ex_div: "Post-Ex-Div",
    CPI: "CPI",
    NFP: "NFP",
    FOMC: "FOMC",
    GDP: "GDP"
  },
  ee = ["1W", "1M", "3M", "6M", "12M"],
  te = ["Q1", "Q2", "Q3", "Q4"];

function V({
  value: o,
  suffix: a = "%"
}) {
  if (o === null) return e.jsx("span", {
    className: "text-muted-foreground",
    children: "-"
  });
  const c = o > 0 ? "text-emerald-500" : o < 0 ? "text-red-500" : "text-foreground";
  return e.jsxs("span", {
    className: `font-mono text-xs tabular-nums ${c}`,
    children: [o > 0 ? "+" : "", o.toFixed(2), a]
  })
}

function $({
  value: o
}) {
  if (o === null) return e.jsx("span", {
    className: "text-muted-foreground",
    children: "-"
  });
  const c = Math.max(-5, Math.min(5, o)) / 5,
    u = Math.abs(c) * .25,
    b = c > 0 ? `rgba(34, 197, 94, ${u})` : c < 0 ? `rgba(239, 68, 68, ${u})` : "transparent",
    p = o > 0 ? "text-emerald-400" : o < 0 ? "text-red-400" : "text-foreground";
  return e.jsxs("span", {
    className: `font-mono text-xs tabular-nums ${p} px-1.5 py-0.5 rounded`,
    style: {
      backgroundColor: b
    },
    children: [o > 0 ? "+" : "", o.toFixed(2), "%"]
  })
}

function ze() {
  const {
    universeTickers: o
  } = we(), [a, c] = d.useState("periods"), [u, b] = d.useState(Se), [p, T] = d.useState(""), [y,
    N] = d.useState(new Set), [f, E] = d.useState(""), [s, i] = d.useState(""), [l, j] = d.useState(
      "12M"), [k, A] = d.useState(!1), [v, z] = d.useState("earnings"), [D, se] = d.useState("avg"),
    [P, ae] = d.useState(30), [_, ne] = d.useState(180), de = d.useCallback(() => ({
      viewMode: a,
      filters: ke(u),
      manualTickers: [...y],
      customStart: f,
      customEnd: s,
      sortKey: l,
      sortAsc: k,
      eventType: v,
      eventStat: D,
      seasonalMinDays: P,
      seasonalMaxDays: _
    }), [a, u, y, f, s, l, k, v, D, P, _]), ie = d.useCallback(t => {
      t.viewMode !== void 0 && c(t.viewMode), t.filters !== void 0 && b(Ce(t.filters)), t
        .manualTickers !== void 0 && N(new Set(t.manualTickers)), t.customStart !== void 0 && E(t
          .customStart), t.customEnd !== void 0 && i(t.customEnd), t.sortKey !== void 0 && j(t
          .sortKey), t.sortAsc !== void 0 && A(t.sortAsc), t.eventType !== void 0 && z(t
          .eventType), t.eventStat !== void 0 && se(t.eventStat), t.seasonalMinDays !== void 0 &&
        ae(t.seasonalMinDays), t.seasonalMaxDays !== void 0 && ne(t.seasonalMaxDays)
    }, []);
  De("performance", de, ie);
  const {
    data: H,
    isLoading: xe
  } = O({
      queryKey: ["/perf-data", f, s],
      queryFn: () => Le(f || void 0, s || void 0)
    }), {
      data: Q,
      isLoading: ce
    } = O({
      queryKey: ["/monthly-seasonality"],
      queryFn: We,
      enabled: a === "monthly"
    }), {
      data: q,
      isLoading: me
    } = O({
      queryKey: ["/event-returns", v],
      queryFn: () => Ue(v),
      enabled: a === "events"
    }), {
      data: G,
      isLoading: ue
    } = O({
      queryKey: ["/seasonal-patterns", P, _],
      queryFn: () => Pe(5, P, _),
      enabled: a === "seasonal-patterns"
    }), J = a === "periods" || a === "seasonality" ? xe : a === "monthly" ? ce : a ===
    "seasonal-patterns" ? ue : me, F = d.useMemo(() => {
      let t = [];
      return a === "periods" || a === "seasonality" ? t = H || [] : a === "monthly" ? t = Q ||
      [] : a === "seasonal-patterns" ? t = G || [] : t = q || [], o && (t = t.filter(n => o.has(n
          .ticker))), [...Fe(t, u, p, y)].sort((n, C) => {
          let x, r;
          if (a === "events" && l.startsWith("w_")) {
            const m = parseInt(l.replace("w_", ""));
            x = n[D]?.[m] ?? null, r = C[D]?.[m] ?? null
          } else x = n[l], r = C[l];
          return x === null && r === null ? 0 : x === null ? 1 : r === null ? -1 : typeof x ==
            "string" ? k ? x.localeCompare(r) : r.localeCompare(x) : k ? x - r : r - x
        })
    }, [H, Q, q, G, a, u, p, y, l, k, o, v, D]), pe = d.useCallback(t => {
      l === t ? A(!k) : (j(t), A(!1))
    }, [l, k]), he = d.useCallback(() => {
      if (!F.length) return;
      let t, S;
      if (a === "periods") t = ["ticker", "name", "lastClose", ...ee, ...f && s ? ["custom"] :
      []], S = t.map(m => m === "lastClose" ? "Last Close" : m === "custom" ?
          `Custom (${f} to ${s})` : m);
      else if (a === "seasonality") t = ["ticker", "name", "lastClose", ...te], S = t.map(m =>
        m === "lastClose" ? "Last Close" : `Avg ${m}`);
      else if (a === "monthly") t = ["ticker", "name", ...Z.map(m => m), "yearsOfData"], S = t;
      else if (a === "seasonal-patterns") {
        const g = [
          ["Ticker", "Name", "Years", "Type", "Window Start", "Window End", "Days",
            "Avg Return %", "Median Return %", "Win Rate %", "N", "t-stat"
          ].join(",")
        ];
        for (const be of F) {
          const R = be;
          for (const h of R.bullish) g.push([R.ticker, `"${R.name}"`, R.yearsOfData, "Bullish", h
            .startLabel, h.endLabel, h.calendarDays ?? "", h.avgReturn.toFixed(4), h
            .medianReturn.toFixed(4), h.winRate.toFixed(1), h.years, h.tStat.toFixed(2)
          ].join(","));
          for (const h of R.bearish) g.push([R.ticker, `"${R.name}"`, R.yearsOfData, "Bearish", h
            .startLabel, h.endLabel, h.calendarDays ?? "", h.avgReturn.toFixed(4), h
            .medianReturn.toFixed(4), h.winRate.toFixed(1), h.years, h.tStat.toFixed(2)
          ].join(","))
        }
        const M = new Blob([g.join(`
`)], {
            type: "text/csv"
          }),
          L = URL.createObjectURL(M),
          X = document.createElement("a");
        X.href = L, X.download = `seasonal_patterns_${new Date().toISOString().slice(0,10)}.csv`,
          X.click(), URL.revokeObjectURL(L);
        return
      } else {
        const m = Y(v) ? [...I, ...W] : [...W];
        t = ["ticker", "name", "eventCount", ...m.map(g => `${B[g]} Avg`), ...m.map(g =>
          `${B[g]} WinRate`)], S = t
      }
      const n = [S.join(",")];
      for (const m of F)
        if (a === "events") {
          const g = m,
            M = Y(v) ? [...I, ...W] : [...W];
          n.push([g.ticker, `"${g.name}"`, g.eventCount, ...M.map(L => g.avg[L]?.toFixed(4) ??
            ""), ...M.map(L => g.winRate[L]?.toFixed(1) ?? "")
          ].join(","))
        } else n.push(t.map(g => {
          const M = m[g];
          return M == null ? "" : typeof M == "number" ? M.toFixed(4) :
            `"${String(M).replace(/"/g,'""')}"`
        }).join(","));
      const C = new Blob([n.join(`
`)], {
          type: "text/csv"
        }),
        x = URL.createObjectURL(C),
        r = document.createElement("a");
      r.href = x, r.download = `performance_${a}_${new Date().toISOString().slice(0,10)}.csv`, r
        .click(), URL.revokeObjectURL(x)
    }, [F, a, f, s, v]), fe = ({
      col: t
    }) => l !== t ? e.jsx(Oe, {
      className: "w-3 h-3 opacity-40"
    }) : k ? e.jsx(Te, {
      className: "w-3 h-3"
    }) : e.jsx(Ae, {
      className: "w-3 h-3"
    }), w = ({
      col: t,
      label: S,
      className: n
    }) => e.jsx("th", {
      className: `px-2 py-1.5 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap ${n||""}`,
      onClick: () => pe(t),
      children: e.jsxs("div", {
        className: "flex items-center gap-1",
        children: [S, e.jsx(fe, {
          col: t
        })]
      })
    }), ge = [{
      key: "periods",
      label: "Periods"
    }, {
      key: "seasonality",
      label: "Quarterly"
    }, {
      key: "monthly",
      label: "Monthly"
    }, {
      key: "events",
      label: "Event Returns"
    }, {
      key: "seasonal-patterns",
      label: "Seasonal Patterns"
    }];
  return e.jsxs("div", {
    className: "flex flex-col h-full",
    "data-testid": "performance-page",
    children: [e.jsxs("div", {
      className: "flex flex-col gap-1.5 px-3 py-1.5 border-b border-border bg-card flex-shrink-0",
      children: [e.jsxs("div", {
        className: "flex items-center gap-2 flex-wrap",
        children: [e.jsx("div", {
          className: "flex items-center bg-muted rounded p-0.5",
          children: ge.map(t => e.jsx("button", {
            className: `px-2.5 py-0.5 text-[11px] font-medium rounded transition-colors ${a===t.key?"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`,
            onClick: () => {
              c(t.key), j(t.key === "monthly" ? "Jan" : t.key ===
                "events" ? "w_21" : t.key === "seasonality" ? "Q1" :
                t.key === "seasonal-patterns" ? "ticker" : "12M")
            },
            "data-testid": `view-${t.key}`,
            children: t.label
          }, t.key))
        }), a === "periods" && e.jsxs("div", {
          className: "flex items-center gap-1.5",
          children: [e.jsx("span", {
            className: "text-[11px] text-muted-foreground",
            children: "Custom:"
          }), e.jsx(K, {
            type: "date",
            value: f,
            onChange: t => E(t.target.value),
            className: "h-6 w-28 text-[11px]",
            "data-testid": "custom-start"
          }), e.jsx("span", {
            className: "text-[11px] text-muted-foreground",
            children: "to"
          }), e.jsx(K, {
            type: "date",
            value: s,
            onChange: t => i(t.target.value),
            className: "h-6 w-28 text-[11px]",
            "data-testid": "custom-end"
          })]
        }), a === "seasonal-patterns" && e.jsxs("div", {
          className: "flex items-center gap-1.5",
          children: [e.jsx("span", {
            className: "text-[11px] text-muted-foreground",
            children: "Window:"
          }), e.jsx(K, {
            type: "number",
            min: 5,
            max: 365,
            value: P,
            onChange: t => ae(Math.max(5, parseInt(t.target.value) ||
              5)),
            className: "h-6 w-16 text-[11px] text-center",
            "data-testid": "seasonal-min-days"
          }), e.jsx("span", {
            className: "text-[11px] text-muted-foreground",
            children: "to"
          }), e.jsx(K, {
            type: "number",
            min: 5,
            max: 365,
            value: _,
            onChange: t => ne(Math.max(5, parseInt(t.target.value) ||
              180)),
            className: "h-6 w-16 text-[11px] text-center",
            "data-testid": "seasonal-max-days"
          }), e.jsx("span", {
            className: "text-[11px] text-muted-foreground",
            children: "days"
          })]
        }), a === "events" && e.jsxs("div", {
          className: "flex items-center gap-2 flex-wrap",
          children: [e.jsx("div", {
            className: "flex items-center bg-muted rounded p-0.5",
            children: ["earnings", "ex_div"].map(t => e.jsx("button", {
              className: `px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${v===t?"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`,
              onClick: () => z(t),
              "data-testid": `event-${t}`,
              children: le[t]
            }, t))
          }), e.jsx("div", {
            className: "flex items-center bg-muted rounded p-0.5",
            children: Me.map(t => e.jsx("button", {
              className: `px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${v===t?"bg-blue-600 text-white shadow-sm":"text-muted-foreground hover:text-foreground"}`,
              onClick: () => z(t),
              "data-testid": `event-${t}`,
              children: le[t]
            }, t))
          }), e.jsx("div", {
            className: "flex items-center bg-muted rounded p-0.5",
            children: ["avg", "median", "winRate"].map(t => e.jsx(
              "button", {
                className: `px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${D===t?"bg-background text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`,
                onClick: () => se(t),
                "data-testid": `event-stat-${t}`,
                children: t === "avg" ? "Avg Return" : t ===
                  "median" ? "Median" : "Win Rate"
              }, t))
          })]
        }), e.jsx("div", {
          className: "ml-auto",
          children: e.jsxs(Ee, {
            variant: "outline",
            size: "sm",
            className: "h-6 px-2 text-[11px]",
            onClick: he,
            "data-testid": "export-csv",
            children: [e.jsx(Re, {
              className: "w-3 h-3 mr-1"
            }), "CSV"]
          })
        })]
      }), e.jsx($e, {
        filters: u,
        onFiltersChange: b,
        search: p,
        onSearchChange: T,
        manualTickers: y,
        onManualTickersChange: N,
        filteredCount: F.length,
        totalCount: (a === "periods" || a === "seasonality" ? H : a === "monthly" ?
          Q : a === "seasonal-patterns" ? G : q)?.length ?? 0,
        testIdPrefix: "perf"
      })]
    }), e.jsx("div", {
      className: "flex-1 overflow-auto",
      children: J ? e.jsx("div", {
        className: "flex items-center justify-center h-full text-muted-foreground text-sm",
        children: a === "seasonal-patterns" ?
          "Detecting seasonal patterns (this may take a moment)..." : "Loading..."
      }) : a === "seasonal-patterns" ? e.jsxs(e.Fragment, {
        children: [e.jsx(Be, {
          data: F
        }), "/* ── Seasonal Patterns View ─────────────────────── */", e.jsxs(
          "table", {
            className: "w-full text-xs",
            "data-testid": "seasonal-patterns-table",
            children: [e.jsxs("thead", {
              className: "sticky top-0 bg-card border-b border-border z-10",
              children: [e.jsxs("tr", {
                children: [e.jsx("th", {
                  className: "px-2 py-1.5 text-left text-xs font-medium text-muted-foreground w-16",
                  children: "Ticker"
                }), e.jsx("th", {
                  className: "px-2 py-1.5 text-left text-xs font-medium text-muted-foreground w-44",
                  children: "Name"
                }), e.jsx("th", {
                  className: "px-2 py-1.5 text-center text-xs font-medium text-muted-foreground w-10",
                  children: "Yrs"
                }), e.jsx("th", {
                  className: "px-2 py-1.5 text-left text-xs font-medium text-emerald-500",
                  colSpan: 7,
                  children: "Top Bullish Windows"
                }), e.jsx("th", {
                  className: "px-2 py-1.5 text-left text-xs font-medium text-red-500",
                  colSpan: 7,
                  children: "Top Bearish Windows"
                })]
              }), e.jsxs("tr", {
                className: "border-b border-border/30",
                children: [e.jsx("th", {
                  colSpan: 3
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal",
                  children: "Window"
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right",
                  children: "Days"
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right",
                  children: "Avg"
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right",
                  children: "Med"
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right",
                  children: "Win%"
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right",
                  children: "N"
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right",
                  children: "t-stat"
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal",
                  children: "Window"
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right",
                  children: "Days"
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right",
                  children: "Avg"
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right",
                  children: "Med"
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right",
                  children: "Win%"
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right",
                  children: "N"
                }), e.jsx("th", {
                  className: "px-1.5 py-1 text-[10px] text-muted-foreground font-normal text-right",
                  children: "t-stat"
                })]
              })]
            }), e.jsxs("tbody", {
              children: [F.map((t, S) => {
                const n = t,
                  C = Math.max(n.bullish.length, n.bearish.length, 1);
                return Array.from({
                  length: C
                }, (x, r) => e.jsxs("tr", {
                  className: `border-b border-border/20 hover:bg-accent/30 transition-colors ${S%2===0?"":"bg-muted/10"}`,
                  "data-testid": r === 0 ?
                    `perf-row-${n.ticker}` : void 0,
                  children: [r === 0 ? e.jsxs(e.Fragment, {
                    children: [e.jsx("td", {
                      className: "px-2 py-1 font-mono font-semibold text-xs",
                      rowSpan: C,
                      children: n.ticker
                    }), e.jsx("td", {
                      className: "px-2 py-1 text-xs text-muted-foreground truncate max-w-[180px]",
                      rowSpan: C,
                      title: n.name,
                      children: n.name
                    }), e.jsx("td", {
                      className: "px-2 py-1 text-center font-mono text-xs text-muted-foreground",
                      rowSpan: C,
                      children: n.yearsOfData
                    })]
                  }) : null, n.bullish[r] ? e.jsxs(e
                    .Fragment, {
                      children: [e.jsxs("td", {
                        className: "px-1.5 py-1 text-xs whitespace-nowrap",
                        children: [e.jsx("span", {
                          className: "text-emerald-400 font-medium",
                          children: n.bullish[r]
                            .startLabel
                        }), e.jsx("span", {
                          className: "text-muted-foreground mx-0.5",
                          children: "→"
                        }), e.jsx("span", {
                          className: "text-emerald-400 font-medium",
                          children: n.bullish[r]
                            .endLabel
                        })]
                      }), e.jsx("td", {
                        className: "px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground",
                        children: n.bullish[r]
                          .calendarDays ?? "—"
                      }), e.jsx("td", {
                        className: "px-1.5 py-1 text-right",
                        children: e.jsx($, {
                          value: n.bullish[r]
                            .avgReturn
                        })
                      }), e.jsx("td", {
                        className: "px-1.5 py-1 text-right",
                        children: e.jsx($, {
                          value: n.bullish[r]
                            .medianReturn
                        })
                      }), e.jsxs("td", {
                        className: "px-1.5 py-1 text-right font-mono text-xs tabular-nums text-foreground",
                        children: [n.bullish[r]
                          .winRate.toFixed(0), "%"
                        ]
                      }), e.jsx("td", {
                        className: "px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground",
                        children: n.bullish[r].years
                      }), e.jsx("td", {
                        className: "px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground",
                        children: n.bullish[r].tStat
                          .toFixed(2)
                      })]
                    }) : e.jsx(e.Fragment, {
                    children: e.jsx("td", {
                      colSpan: 7
                    })
                  }), n.bearish[r] ? e.jsxs(e.Fragment, {
                    children: [e.jsxs("td", {
                      className: "px-1.5 py-1 text-xs whitespace-nowrap",
                      children: [e.jsx("span", {
                        className: "text-red-400 font-medium",
                        children: n.bearish[r]
                          .startLabel
                      }), e.jsx("span", {
                        className: "text-muted-foreground mx-0.5",
                        children: "→"
                      }), e.jsx("span", {
                        className: "text-red-400 font-medium",
                        children: n.bearish[r]
                          .endLabel
                      })]
                    }), e.jsx("td", {
                      className: "px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground",
                      children: n.bearish[r]
                        .calendarDays ?? "—"
                    }), e.jsx("td", {
                      className: "px-1.5 py-1 text-right",
                      children: e.jsx($, {
                        value: n.bearish[r]
                          .avgReturn
                      })
                    }), e.jsx("td", {
                      className: "px-1.5 py-1 text-right",
                      children: e.jsx($, {
                        value: n.bearish[r]
                          .medianReturn
                      })
                    }), e.jsxs("td", {
                      className: "px-1.5 py-1 text-right font-mono text-xs tabular-nums text-foreground",
                      children: [n.bearish[r]
                        .winRate.toFixed(0), "%"
                      ]
                    }), e.jsx("td", {
                      className: "px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground",
                      children: n.bearish[r].years
                    }), e.jsx("td", {
                      className: "px-1.5 py-1 text-right font-mono text-xs tabular-nums text-muted-foreground",
                      children: n.bearish[r].tStat
                        .toFixed(2)
                    })]
                  }) : e.jsx(e.Fragment, {
                    children: e.jsx("td", {
                      colSpan: 7
                    })
                  })]
                }, `${n.ticker}-${r}`))
              }), F.length === 0 && !J && e.jsx("tr", {
                children: e.jsx("td", {
                  colSpan: 17,
                  className: "text-center py-8 text-muted-foreground",
                  children: "No tickers match the current filters"
                })
              })]
            })]
          })]
      }) : e.jsxs("table", {
        className: "w-full text-xs",
        "data-testid": "performance-table",
        children: [e.jsx("thead", {
          className: "sticky top-0 bg-card border-b border-border z-10",
          children: e.jsxs("tr", {
            children: [e.jsx(w, {
              col: "ticker",
              label: "Ticker",
              className: "text-left sticky left-0 bg-card z-20"
            }), e.jsx(w, {
              col: "name",
              label: "Name",
              className: "text-left"
            }), a === "periods" && e.jsxs(e.Fragment, {
              children: [e.jsx(w, {
                col: "lastClose",
                label: "Last Close",
                className: "text-right"
              }), ee.map(t => e.jsx(w, {
                col: t,
                label: t,
                className: "text-right"
              }, t)), f && s && e.jsx(w, {
                col: "custom",
                label: "Custom",
                className: "text-right"
              })]
            }), a === "seasonality" && e.jsxs(e.Fragment, {
              children: [e.jsx(w, {
                col: "lastClose",
                label: "Last Close",
                className: "text-right"
              }), te.map(t => e.jsx(w, {
                col: t,
                label: `Avg ${t}`,
                className: "text-right"
              }, t))]
            }), a === "monthly" && e.jsxs(e.Fragment, {
              children: [Z.map(t => e.jsx(w, {
                col: t,
                label: t,
                className: "text-right"
              }, t)), e.jsx(w, {
                col: "yearsOfData",
                label: "Years",
                className: "text-right"
              })]
            }), a === "events" && e.jsxs(e.Fragment, {
              children: [e.jsx(w, {
                col: "eventCount",
                label: "Events",
                className: "text-right"
              }), Y(v) && e.jsxs(e.Fragment, {
                children: [I.map(t => e.jsx(w, {
                  col: `w_${t}`,
                  label: B[t],
                  className: "text-right"
                }, t)), e.jsx("th", {
                  className: "px-0.5 py-1.5 w-[1px] bg-border/50"
                })]
              }), W.map(t => e.jsx(w, {
                col: `w_${t}`,
                label: B[t],
                className: "text-right"
              }, t))]
            })]
          })
        }), e.jsxs("tbody", {
          children: [F.map((t, S) => e.jsxs("tr", {
            className: `border-b border-border/50 hover:bg-accent/50 transition-colors ${S%2===0?"":"bg-muted/20"}`,
            "data-testid": `perf-row-${t.ticker}`,
            children: [e.jsx("td", {
              className: "px-2 py-1.5 font-mono font-semibold text-xs sticky left-0 bg-inherit",
              children: t.ticker
            }), e.jsx("td", {
              className: "px-2 py-1.5 text-xs text-muted-foreground max-w-[200px] truncate",
              title: t.name,
              children: t.name
            }), a === "periods" && e.jsxs(e.Fragment, {
              children: [e.jsx("td", {
                className: "px-2 py-1.5 text-right font-mono text-xs tabular-nums",
                children: t.lastClose !== null ?
                  `$${t.lastClose.toFixed(2)}` : "-"
              }), ee.map(n => e.jsx("td", {
                className: "px-2 py-1.5 text-right",
                children: e.jsx(V, {
                  value: t[n]
                })
              }, n)), f && s && e.jsx("td", {
                className: "px-2 py-1.5 text-right",
                children: e.jsx(V, {
                  value: t.custom
                })
              })]
            }), a === "seasonality" && e.jsxs(e.Fragment, {
              children: [e.jsx("td", {
                className: "px-2 py-1.5 text-right font-mono text-xs tabular-nums",
                children: t.lastClose !== null ?
                  `$${t.lastClose.toFixed(2)}` : "-"
              }), te.map(n => e.jsx("td", {
                className: "px-2 py-1.5 text-right",
                children: e.jsx($, {
                  value: t[n]
                })
              }, n))]
            }), a === "monthly" && e.jsxs(e.Fragment, {
              children: [Z.map(n => e.jsx("td", {
                className: "px-2 py-1.5 text-right",
                children: e.jsx($, {
                  value: t[n]
                })
              }, n)), e.jsx("td", {
                className: "px-2 py-1.5 text-right font-mono text-xs text-muted-foreground tabular-nums",
                children: t.yearsOfData
              })]
            }), a === "events" && e.jsxs(e.Fragment, {
              children: [e.jsx("td", {
                className: "px-2 py-1.5 text-right font-mono text-xs text-muted-foreground tabular-nums",
                children: t.eventCount
              }), Y(v) && e.jsxs(e.Fragment, {
                children: [I.map(n => {
                  const x = t[D]?.[n] ?? null;
                  return e.jsx("td", {
                    className: "px-2 py-1.5 text-right",
                    children: D === "winRate" ? e
                      .jsx(V, {
                        value: x,
                        suffix: "%"
                      }) : e.jsx($, {
                        value: x
                      })
                  }, n)
                }), e.jsx("td", {
                  className: "px-0 py-1.5 w-[1px] bg-border/50"
                })]
              }), W.map(n => {
                const x = t[D]?.[n] ?? null;
                return e.jsx("td", {
                  className: "px-2 py-1.5 text-right",
                  children: D === "winRate" ? e.jsx(V, {
                    value: x,
                    suffix: "%"
                  }) : e.jsx($, {
                    value: x
                  })
                }, n)
              })]
            })]
          }, t.ticker)), F.length === 0 && !J && e.jsx("tr", {
            children: e.jsx("td", {
              colSpan: 20,
              className: "text-center py-8 text-muted-foreground",
              children: "No tickers match the current filters"
            })
          })]
        })]
      })
    })]
  })
}
export {
  ze as
  default
};