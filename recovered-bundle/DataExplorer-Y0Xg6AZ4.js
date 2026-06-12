import {
  c as _,
  r as n,
  g as xe,
  af as me,
  ae as pe,
  bB as fe,
  j as t,
  am as B,
  an as $,
  B as v,
  aq as ge,
  ap as G,
  bT as U,
  I as Y,
  x as q,
  bz as be,
  A as we,
  bR as je,
  X as Fe,
  z as ve,
  bA as W,
  O as ke
} from "./index-CsG73Aq_.js";
import {
  A as Ne
} from "./arrow-up-down-CNMI3GZb.js";
import {
  P as Se
} from "./pin-CcGsz7Zd.js";
const ye = _("Columns2", [
  ["rect", {
    width: "18",
    height: "18",
    x: "3",
    y: "3",
    rx: "2",
    key: "afitv7"
  }],
  ["path", {
    d: "M12 3v18",
    key: "108xh3"
  }]
]);
const Me = _("PinOff", [
  ["path", {
    d: "M12 17v5",
    key: "bb1du9"
  }],
  ["path", {
    d: "M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89",
    key: "znwnzq"
  }],
  ["path", {
    d: "m2 2 20 20",
    key: "1ooewy"
  }],
  ["path", {
    d: "M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11",
    key: "c9qhm2"
  }]
]);

function Pe() {
  const [p, X] = n.useState([]), [d, S] = n.useState("ESS"), [y, D] = n.useState(""), [C, J] = n
    .useState([]), [k, K] = n.useState({}), [Q, L] = n.useState(!1), [b, E] = n.useState(!1), [u,
    R] = n.useState(new Set(["close"])), [N, V] = n.useState(""), [Z, ee] = n.useState(!1), [x, M] =
    n.useState(null), O = n.useRef(null), w = 20, I = 12, [H, te] = n.useState(0), [se, re] = n
    .useState(600), P = n.useRef(null);
  n.useEffect(() => {
    const e = O.current;
    if (!e) return;
    const a = () => re(e.clientHeight);
    a();
    const r = new ResizeObserver(a);
    return r.observe(e), () => r.disconnect()
  }, []);
  const ae = n.useCallback(() => {
      const e = O.current;
      e && P.current == null && (P.current = requestAnimationFrame(() => {
        P.current = null, te(e.scrollTop)
      }))
    }, []),
    ne = n.useCallback(() => ({
      activeTicker: d,
      sortAsc: b,
      pinnedMetrics: [...u],
      visibleMetrics: x ? [...x] : null
    }), [d, b, u, x]),
    le = n.useCallback(e => {
      e.activeTicker && S(e.activeTicker), typeof e.sortAsc == "boolean" && E(e.sortAsc), Array
        .isArray(e.pinnedMetrics) && R(new Set(e.pinnedMetrics)), e.visibleMetrics === null ? M(
          null) : Array.isArray(e.visibleMetrics) && M(new Set(e.visibleMetrics))
    }, []);
  xe("data-explorer", ne, le), n.useEffect(() => {
    let e = !1;
    return me().then(a => {
      e || X(a)
    }), () => {
      e = !0
    }
  }, []), n.useEffect(() => {
    d && (L(!0), Promise.all([pe(), fe(d)]).then(([e, a]) => {
      J(e), K(a), L(!1)
    }).catch(() => L(!1)))
  }, [d]);
  const j = p.findIndex(e => e.ticker === d),
    oe = n.useMemo(() => {
      if (!y) return p;
      const e = y.toLowerCase();
      return p.filter(a => a.ticker.toLowerCase().includes(e) || a.name.toLowerCase().includes(
        e) || a.subindustry?.toLowerCase().includes(e))
    }, [p, y]),
    f = n.useMemo(() => Object.keys(k).sort((e, a) => e.localeCompare(a)), [k]),
    [T, ce] = n.useState(""),
    z = n.useMemo(() => {
      const e = {
          Price: ["close", "open", "high", "low"],
          Valuation: ["P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM",
            "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2",
            "Implied Cap Rate"
          ],
          Yields: ["FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2",
            "Dividend Yield"
          ],
          Estimates: ["EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2",
            "EBITDA FY1", "EBITDA FY2", "Sales FY1", "Sales FY2"
          ],
          LTM: ["EPS LTM", "FFO LTM", "AFFO LTM", "EBITDA LTM", "Sales LTM", "EPS FY0", "FFO FY0",
            "AFFO FY0"
          ],
          Growth: ["FY1 EPS Growth", "FY2 EPS Growth", "FY1 FFO Growth", "FY2 FFO Growth",
            "FY1 AFFO Growth", "FY2 AFFO Growth"
          ],
          Performance: ["52wk High", "52wk Low", "% off 52wk High", "% off 52wk Low",
            "1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%"
          ],
          "Short Interest": ["Short Interest%", "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M"],
          Volatility: ["HV 30D", "HV 60D", "HV 90D", "HV 180D", "HVOL 30D", "HVOL 60D",
            "HVOL 90D", "HVOL 180D"
          ],
          Other: ["Dividend", "Enterprise Value", "Buy Ratings", "Hold Ratings", "Sell Ratings",
            "Bull%", "Bear%"
          ]
        },
        a = new Set,
        r = [],
        s = T.trim().toLowerCase(),
        l = i => !s || i.toLowerCase().includes(s);
      for (const [i, o] of Object.entries(e)) {
        const g = o.filter(m => f.includes(m) && l(m));
        g.length && r.push([i, g]);
        for (const m of o) a.add(m)
      }
      const c = f.filter(i => !a.has(i) && l(i));
      return c.length && r.push(["Uncategorized", c]), r
    }, [f, T]),
    h = n.useMemo(() => {
      let e = x ? f.filter(s => x.has(s)) : f;
      if (N) {
        const s = N.toLowerCase();
        e = e.filter(l => l.toLowerCase().includes(s))
      }
      const a = e.filter(s => u.has(s)),
        r = e.filter(s => !u.has(s));
      return [...a, ...r]
    }, [f, x, N, u]),
    F = n.useMemo(() => {
      if (C.length === 0 || h.length === 0) return [];
      const e = h.map(s => {
          const l = new Map,
            c = k[s];
          if (c)
            for (const [i, o] of c) l.set(i, o);
          return l
        }),
        a = new Set;
      for (const s of h) {
        const l = k[s];
        if (l)
          for (const [c] of l) a.add(c)
      }
      const r = Array.from(a).sort((s, l) => s - l);
      return b || r.reverse(), r.map(s => ({
        dateIdx: s,
        date: C[s] ?? `idx:${s}`,
        values: e.map(l => l.get(s) ?? null)
      }))
    }, [C, h, k, b]),
    ie = (e, a) => {
      if (e === null) return "";
      const r = W(a),
        s = e * r;
      return ke(a) ? s.toFixed(2) + "%" : Math.abs(s) >= 1e3 ? s.toLocaleString(void 0, {
        maximumFractionDigits: 2
      }) : Math.abs(s) >= 1 ? s.toFixed(2) : s.toFixed(4)
    },
    de = () => {
      if (F.length === 0) return;
      const e = ["Date", ...h].join(","),
        a = F.map(i => [i.date, ...i.values.map((o, g) => {
          if (o === null) return "";
          const m = W(h[g]);
          return (o * m).toString()
        })].join(",")),
        r = [e, ...a].join(`
`),
        s = new Blob([r], {
          type: "text/csv"
        }),
        l = URL.createObjectURL(s),
        c = document.createElement("a");
      c.href = l, c.download = `${d}_data.csv`, c.click(), URL.revokeObjectURL(l)
    },
    he = e => {
      R(a => {
        const r = new Set(a);
        return r.has(e) ? r.delete(e) : r.add(e), r
      })
    },
    ue = e => {
      M(a => {
        if (!a) {
          const s = new Set(f);
          return s.delete(e), s
        }
        const r = new Set(a);
        return r.has(e) ? r.delete(e) : r.add(e), r
      })
    },
    A = p.find(e => e.ticker === d);
  return t.jsxs("div", {
    className: "flex flex-col h-full",
    children: [t.jsxs("div", {
      className: "flex items-center gap-2 px-3 py-1.5 border-b border-border flex-shrink-0 flex-wrap",
      children: [t.jsxs(B, {
        children: [t.jsx($, {
          asChild: !0,
          children: t.jsxs(v, {
            variant: "outline",
            size: "sm",
            className: "h-7 text-xs gap-1 min-w-[100px]",
            "data-testid": "data-ticker-picker",
            children: [t.jsx("span", {
              className: "font-bold",
              children: d
            }), t.jsx(ge, {
              className: "w-3 h-3 ml-1 opacity-50"
            })]
          })
        }), t.jsxs(G, {
          className: "w-[440px] p-0",
          align: "start",
          children: [t.jsx("div", {
            className: "p-2 border-b border-border",
            children: t.jsxs("div", {
              className: "relative",
              children: [t.jsx(U, {
                className: "absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground"
              }), t.jsx(Y, {
                className: "h-7 text-xs pl-7",
                placeholder: "Search tickers...",
                value: y,
                onChange: e => D(e.target.value),
                "data-testid": "data-ticker-search"
              })]
            })
          }), t.jsx("div", {
            className: "max-h-[300px] overflow-y-auto py-1",
            children: oe.map(e => t.jsxs("button", {
              className: `w-full flex items-center gap-2 px-3 py-1 text-xs hover:bg-accent/50 ${e.ticker===d?"bg-accent text-accent-foreground":""}`,
              onClick: () => {
                S(e.ticker), D("")
              },
              "data-testid": `data-ticker-${e.ticker}`,
              children: [t.jsx("span", {
                className: "font-bold w-14 text-left whitespace-nowrap",
                children: e.ticker
              }), t.jsx("span", {
                className: "text-muted-foreground flex-1 min-w-0 truncate text-left",
                title: e.name,
                children: e.name
              }), e.ticker === d && t.jsx(q, {
                className: "w-3 h-3 ml-auto text-primary"
              })]
            }, e.ticker))
          })]
        })]
      }), t.jsxs("div", {
        className: "flex gap-0.5",
        children: [t.jsx(v, {
          variant: "ghost",
          size: "sm",
          className: "h-7 w-7 p-0",
          disabled: j <= 0,
          onClick: () => j > 0 && S(p[j - 1].ticker),
          "data-testid": "data-ticker-prev",
          children: t.jsx(be, {
            className: "w-3.5 h-3.5"
          })
        }), t.jsx(v, {
          variant: "ghost",
          size: "sm",
          className: "h-7 w-7 p-0",
          disabled: j >= p.length - 1,
          onClick: () => j < p.length - 1 && S(p[j + 1].ticker),
          "data-testid": "data-ticker-next",
          children: t.jsx(we, {
            className: "w-3.5 h-3.5"
          })
        })]
      }), A && t.jsxs("span", {
        className: "text-[10px] text-muted-foreground",
        children: [A.name, " · ", A.subindustry]
      }), t.jsx("div", {
        className: "flex-1"
      }), t.jsxs("div", {
        className: "relative",
        children: [t.jsx(je, {
          className: "absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground"
        }), t.jsx(Y, {
          className: "h-7 text-xs pl-7 w-[160px]",
          placeholder: "Filter metrics...",
          value: N,
          onChange: e => V(e.target.value),
          "data-testid": "data-metric-filter"
        }), N && t.jsx("button", {
          className: "absolute right-2 top-1/2 -translate-y-1/2",
          onClick: () => V(""),
          children: t.jsx(Fe, {
            className: "w-3 h-3 text-muted-foreground hover:text-foreground"
          })
        })]
      }), t.jsxs(B, {
        open: Z,
        onOpenChange: ee,
        children: [t.jsx($, {
          asChild: !0,
          children: t.jsxs(v, {
            variant: "ghost",
            size: "sm",
            className: "h-7 px-2 text-[10px] gap-1",
            "data-testid": "data-column-picker",
            children: [t.jsx(ye, {
                className: "w-3 h-3"
              }), "Columns (", x ? x.size : f.length, "/", f.length,
              ")"]
          })
        }), t.jsxs(G, {
          className: "w-[400px] p-0",
          align: "end",
          children: [t.jsxs("div", {
            className: "p-2 border-b border-border/40 flex items-center gap-2",
            children: [t.jsx(U, {
              className: "w-3 h-3 text-muted-foreground flex-shrink-0"
            }), t.jsx(Y, {
              placeholder: "Search columns...",
              value: T,
              onChange: e => ce(e.target.value),
              className: "h-7 text-xs flex-1"
            }), t.jsx("button", {
              className: "text-[10px] text-primary hover:underline whitespace-nowrap",
              onClick: () => M(null),
              children: "Show all"
            })]
          }), t.jsxs("div", {
            className: "max-h-[420px] overflow-y-auto py-1",
            children: [z.length === 0 && t.jsx("div", {
              className: "px-3 py-2 text-xs text-muted-foreground",
              children: "No columns match."
            }), z.map(([e, a]) => t.jsxs("div", {
              children: [t.jsx("div", {
                className: "px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30",
                children: e
              }), a.map(r => {
                const s = !x || x.has(r);
                return t.jsxs("button", {
                  className: "w-full flex items-center gap-2 px-3 py-0.5 text-xs hover:bg-accent/50",
                  onClick: () => ue(r),
                  children: [t.jsx("div", {
                    className: `w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${s?"bg-primary border-primary":"border-muted-foreground/30"}`,
                    children: s && t.jsx(q, {
                      className: "w-2.5 h-2.5 text-primary-foreground"
                    })
                  }), t.jsx("span", {
                    className: `${u.has(r)?"font-semibold":""} truncate`,
                    title: r,
                    children: r
                  })]
                }, r)
              })]
            }, e))]
          })]
        })]
      }), t.jsxs(v, {
        variant: "ghost",
        size: "sm",
        className: "h-7 px-2 text-[10px] gap-1",
        onClick: () => E(!b),
        "data-testid": "data-sort-toggle",
        children: [t.jsx(Ne, {
          className: "w-3 h-3"
        }), b ? "Oldest" : "Newest"]
      }), t.jsxs(v, {
        variant: "ghost",
        size: "sm",
        className: "h-7 px-2 text-[10px] gap-1",
        onClick: de,
        "data-testid": "data-export-csv",
        children: [t.jsx(ve, {
          className: "w-3 h-3"
        }), "CSV"]
      }), t.jsxs("span", {
        className: "text-[10px] text-muted-foreground tabular-nums",
        children: [F.length, " rows · ", h.length, " cols"]
      })]
    }), Q ? t.jsxs("div", {
      className: "flex items-center justify-center flex-1 text-muted-foreground text-sm",
      children: ["Loading ", d, " data..."]
    }) : t.jsx("div", {
      ref: O,
      onScroll: ae,
      className: "flex-1 overflow-auto min-h-0",
      children: (() => {
        const e = F.length,
          a = e * w,
          r = Math.max(0, Math.floor(H / w) - I),
          s = Math.min(e, Math.ceil((H + se) / w) + I),
          l = F.slice(r, s),
          c = r * w,
          i = Math.max(0, a - s * w);
        return t.jsxs("table", {
          className: "w-full text-[11px] border-collapse",
          children: [t.jsx("thead", {
            className: "sticky top-0 bg-card z-20",
            children: t.jsxs("tr", {
              children: [t.jsx("th", {
                className: "sticky left-0 z-30 bg-card text-left px-2 py-1.5 font-semibold text-muted-foreground border-b border-r border-border min-w-[90px]",
                children: "Date"
              }), h.map(o => t.jsx("th", {
                className: `text-right px-2 py-1.5 font-medium border-b border-border whitespace-nowrap min-w-[80px] group cursor-default ${u.has(o)?"bg-primary/5":""}`,
                children: t.jsxs("div", {
                  className: "flex items-center justify-end gap-1",
                  children: [t.jsx("button", {
                    className: "opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity",
                    onClick: () => he(o),
                    title: u.has(o) ? "Unpin" :
                      "Pin to left",
                    children: u.has(o) ? t.jsx(Me, {
                      className: "w-2.5 h-2.5"
                    }) : t.jsx(Se, {
                      className: "w-2.5 h-2.5"
                    })
                  }), t.jsx("span", {
                    className: "text-[10px]",
                    children: o
                  })]
                })
              }, o))]
            })
          }), t.jsxs("tbody", {
            children: [c > 0 && t.jsx("tr", {
              style: {
                height: c
              },
              children: t.jsx("td", {
                colSpan: h.length + 1
              })
            }), l.map(o => t.jsxs("tr", {
              className: "hover:bg-accent/20 border-b border-border/30",
              style: {
                height: w
              },
              children: [t.jsx("td", {
                className: "sticky left-0 z-10 bg-card px-2 py-0.5 font-mono text-muted-foreground border-r border-border tabular-nums",
                children: o.date
              }), o.values.map((g, m) => t.jsx("td", {
                className: `text-right px-2 py-0.5 font-mono tabular-nums ${u.has(h[m])?"bg-primary/5":""} ${g!==null&&g<0?"text-red-400":""}`,
                children: ie(g, h[m])
              }, m))]
            }, o.dateIdx)), i > 0 && t.jsx("tr", {
              style: {
                height: i
              },
              children: t.jsx("td", {
                colSpan: h.length + 1
              })
            }), F.length === 0 && t.jsx("tr", {
              children: t.jsxs("td", {
                colSpan: h.length + 1,
                className: "text-center py-8 text-muted-foreground",
                children: ["No data available for ", d]
              })
            })]
          })]
        })
      })()
    })]
  })
}
export {
  Pe as
  default
};