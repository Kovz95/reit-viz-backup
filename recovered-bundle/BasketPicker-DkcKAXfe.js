import {
  r as l,
  aj as H,
  j as t,
  c6 as Q,
  S as X,
  X as _,
  x as G,
  T as J,
  dC as D
} from "./index-CsG73Aq_.js";

function Z({
  tickers: g,
  value: s,
  onChange: i,
  disabled: m,
  label: A = "Basket",
  maxTickers: f = 50,
  testIdPrefix: d = "basket"
}) {
  const [a, j] = l.useState(""), [v, h] = l.useState(!1), [N, b] = l.useState(0), [w, p] = l
    .useState(null), [C, E] = l.useState(""), $ = l.useRef(null), M = l.useRef(null), {
      baskets: B,
      addBasket: L,
      updateBasket: R,
      deleteBasket: Y
    } = H(), k = l.useMemo(() => [...B].sort((e, o) => o.updatedAt - e.updatedAt), [B]);
  l.useEffect(() => {
    function e(o) {
      $.current && ($.current.contains(o.target) || (h(!1), p(null)))
    }
    return document.addEventListener("mousedown", e), () => document.removeEventListener(
      "mousedown", e)
  }, []);
  const c = l.useMemo(() => {
      const e = a.trim().toLowerCase(),
        o = new Set(s.map(r => r.toUpperCase()));
      if (!e) return g.filter(r => !o.has(r.ticker.toUpperCase())).slice(0, 50);
      const n = [];
      for (const r of g) {
        if (o.has(r.ticker.toUpperCase())) continue;
        const x = r.ticker.toLowerCase(),
          K = (r.name || "").toLowerCase();
        let u = -1;
        x === e ? u = 0 : x.startsWith(e) ? u = 1 : x.includes(e) ? u = 2 : K.includes(e) && (u =
          3), u >= 0 && n.push({
          t: r,
          rank: u
        })
      }
      return n.sort((r, x) => r.rank - x.rank || r.t.ticker.localeCompare(x.t.ticker)), n.slice(0,
        50).map(r => r.t)
    }, [g, a, s]),
    O = e => {
      const o = e.trim().toUpperCase();
      o && (s.length >= f || s.some(n => n.toUpperCase() === o) || i([...s, o]))
    },
    S = e => {
      const o = e.split(/[\s,;\n\t]+/).map(r => r.trim()).filter(Boolean);
      if (o.length === 0) return;
      const n = D([...s, ...o]).slice(0, f);
      i(n)
    },
    T = e => {
      i(s.filter((o, n) => n !== e))
    },
    y = e => {
      /[\s,;]/.test(e) ? S(e) : O(e), j(""), b(0)
    },
    q = e => {
      if (!v && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        h(!0);
        return
      }
      if (e.key === "ArrowDown") e.preventDefault(), b(o => Math.min(o + 1, Math.max(c.length - 1,
        0)));
      else if (e.key === "ArrowUp") e.preventDefault(), b(o => Math.max(o - 1, 0));
      else if (e.key === "Enter" || e.key === "Tab" || e.key === "," || e.key === " ") {
        if (!a.trim()) return e.key === "Tab", void 0;
        e.preventDefault(), v && c[N] ? y(c[N].ticker) : y(a)
      } else e.key === "Backspace" && !a ? s.length > 0 && i(s.slice(0, -1)) : e.key === "Escape" &&
        h(!1)
    },
    z = e => {
      const o = e.clipboardData.getData("text");
      o && /[\s,;\n\t]/.test(o) && (e.preventDefault(), S(o), j(""))
    },
    U = () => {
      const e = C.trim();
      if (!e || s.length === 0) return;
      const o = D(s),
        n = B.find(r => r.name === e);
      n ? R(n.id, {
        tickers: o
      }) : L(e, o, {
        weighting: "equal",
        rebalance: "none"
      }), E(""), p(null)
    },
    F = e => {
      const o = k.find(n => n.id === e);
      o && (i(D(o.tickers).slice(0, f)), p(null))
    },
    W = e => g.some(o => o.ticker.toUpperCase() === e.toUpperCase());
  return t.jsxs("div", {
    ref: $,
    className: "flex flex-col gap-0.5 relative",
    children: [t.jsxs("div", {
      className: "flex items-center justify-between gap-2",
      children: [t.jsxs("label", {
        className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider",
        children: [A, " ", t.jsxs("span", {
          className: "opacity-60",
          children: ["(", s.length, "/", f, ")"]
        })]
      }), t.jsxs("div", {
        className: "flex items-center gap-1",
        children: [t.jsxs("button", {
          type: "button",
          className: "text-[9px] font-mono text-muted-foreground hover:text-foreground border border-border rounded px-1 py-0.5 flex items-center gap-1",
          onClick: () => p(e => e === "load" ? null : "load"),
          disabled: m,
          "data-testid": `${d}-load-btn`,
          title: "Load a saved basket",
          children: [t.jsx(Q, {
            className: "h-3 w-3"
          }), " Load"]
        }), t.jsxs("button", {
          type: "button",
          className: "text-[9px] font-mono text-muted-foreground hover:text-foreground border border-border rounded px-1 py-0.5 flex items-center gap-1",
          onClick: () => p(e => e === "save" ? null : "save"),
          disabled: m || s.length === 0,
          "data-testid": `${d}-save-btn`,
          title: "Save current basket",
          children: [t.jsx(X, {
            className: "h-3 w-3"
          }), " Save"]
        }), s.length > 0 && t.jsx("button", {
          type: "button",
          className: "text-[9px] font-mono text-muted-foreground hover:text-foreground border border-border rounded px-1 py-0.5",
          onClick: () => i([]),
          disabled: m,
          "data-testid": `${d}-clear-btn`,
          title: "Clear basket",
          children: "Clear"
        })]
      })]
    }), t.jsxs("div", {
      className: "flex flex-wrap items-center gap-1 min-w-[420px] max-w-[760px] border border-border rounded px-1.5 py-1 bg-background",
      children: [s.map((e, o) => {
        const n = W(e);
        return t.jsxs("span", {
          className: `inline-flex items-center gap-1 text-[10px] font-mono rounded px-1.5 py-0.5 ${n?"bg-blue-500/15 text-blue-700 dark:text-blue-300":"bg-amber-500/15 text-amber-700 dark:text-amber-300"}`,
          "data-testid": `${d}-chip-${e}`,
          title: n ? "Workbook ticker (data still fetched from Yahoo)" :
            "Yahoo symbol",
          children: [t.jsx("span", {
            className: "font-bold",
            children: e
          }), t.jsx("button", {
            type: "button",
            onClick: () => T(o),
            disabled: m,
            className: "hover:opacity-80",
            "aria-label": `Remove ${e}`,
            children: t.jsx(_, {
              className: "h-2.5 w-2.5"
            })
          })]
        }, `${e}-${o}`)
      }), t.jsx("input", {
        ref: M,
        type: "text",
        placeholder: s.length === 0 ? "Type a ticker, press Enter…" :
          "Add another…",
        value: a,
        onChange: e => {
          j(e.target.value.toUpperCase()), h(!0), b(0)
        },
        onFocus: () => h(!0),
        onKeyDown: q,
        onPaste: z,
        disabled: m || s.length >= f,
        className: "text-[11px] font-mono bg-transparent flex-1 min-w-[140px] focus:outline-none px-1",
        "data-testid": `${d}-input`
      })]
    }), v && !w && t.jsxs("div", {
      className: "absolute z-50 mt-0.5 top-full left-0 w-[420px] max-h-[300px] overflow-auto bg-popover border border-border rounded shadow-lg",
      children: [c.length === 0 && !a.trim() ? t.jsx("div", {
        className: "px-2 py-1.5 text-[11px] font-mono text-muted-foreground",
        children: "All workbook tickers are already in the basket, or type any Yahoo symbol and press Enter."
      }) : c.length === 0 ? t.jsxs("div", {
        className: "px-2 py-1.5 text-[11px] font-mono text-muted-foreground",
        children: ["No workbook match. Press Enter to add", " ", t.jsx("span", {
          className: "text-foreground font-bold",
          children: a.trim().toUpperCase() || "—"
        }), " ", "as a Yahoo symbol."]
      }) : c.map((e, o) => t.jsxs("button", {
        type: "button",
        className: `w-full text-left px-2 py-1 text-[11px] font-mono flex items-center gap-2 ${o===N?"bg-accent text-accent-foreground":"hover:bg-accent/50"}`,
        onMouseEnter: () => b(o),
        onMouseDown: n => {
          n.preventDefault(), y(e.ticker)
        },
        children: [t.jsx("span", {
          className: "font-bold w-14 shrink-0",
          children: e.ticker
        }), t.jsx("span", {
          className: "text-muted-foreground truncate flex-1",
          children: e.name || ""
        }), t.jsx("span", {
          className: "text-[9px] font-mono px-1 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0",
          children: "REIT"
        })]
      }, e.ticker)), a.trim() && !c.find(e => e.ticker.toUpperCase() === a.trim()
        .toUpperCase()) && t.jsxs("button", {
        type: "button",
        className: "w-full text-left px-2 py-1 text-[11px] font-mono flex items-center gap-2 border-t border-border hover:bg-accent/50",
        onMouseDown: e => {
          e.preventDefault(), y(a)
        },
        children: [t.jsx("span", {
          className: "font-bold w-14 shrink-0",
          children: a.trim().toUpperCase()
        }), t.jsx("span", {
          className: "text-muted-foreground flex-1",
          children: "Add as Yahoo symbol"
        }), t.jsx("span", {
          className: "text-[9px] font-mono px-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0",
          children: "Yahoo"
        })]
      })]
    }), w === "save" && t.jsxs("div", {
      className: "absolute z-50 mt-0.5 top-full right-0 w-[320px] bg-popover border border-border rounded shadow-lg p-2 flex flex-col gap-1",
      children: [t.jsxs("div", {
        className: "text-[10px] font-mono text-muted-foreground",
        children: ["Save these ", s.length, " tickers as a named basket"]
      }), t.jsxs("div", {
        className: "flex items-center gap-1",
        children: [t.jsx("input", {
          type: "text",
          placeholder: "Basket name…",
          value: C,
          onChange: e => E(e.target.value),
          onKeyDown: e => {
            e.key === "Enter" && (e.preventDefault(), U()), e.key ===
              "Escape" && p(null)
          },
          className: "text-[11px] font-mono bg-background border border-border rounded px-1.5 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-primary",
          maxLength: 64,
          autoFocus: !0,
          "data-testid": `${d}-save-name-input`
        }), t.jsxs("button", {
          type: "button",
          onClick: U,
          disabled: !C.trim() || s.length === 0,
          className: "text-[10px] font-mono font-bold px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50",
          "data-testid": `${d}-save-confirm-btn`,
          children: [t.jsx(G, {
            className: "h-3 w-3 inline-block mr-1"
          }), "Save"]
        })]
      }), k.length > 0 && t.jsx("div", {
        className: "text-[9px] font-mono text-muted-foreground mt-1",
        children: "Existing names will be overwritten. Manage all baskets at /baskets."
      })]
    }), w === "load" && t.jsx("div", {
      className: "absolute z-50 mt-0.5 top-full right-0 w-[360px] max-h-[300px] overflow-auto bg-popover border border-border rounded shadow-lg",
      children: k.length === 0 ? t.jsx("div", {
        className: "px-2 py-2 text-[11px] font-mono text-muted-foreground",
        children: "No saved baskets yet. Add tickers and click Save."
      }) : k.map(e => t.jsxs("div", {
        className: "flex items-center gap-1 px-2 py-1 hover:bg-accent/50 text-[11px] font-mono group",
        children: [t.jsxs("button", {
          type: "button",
          className: "flex-1 text-left flex flex-col gap-0.5",
          onClick: () => F(e.id),
          "data-testid": `${d}-load-${e.name}`,
          children: [t.jsx("span", {
            className: "font-bold",
            children: e.name
          }), t.jsxs("span", {
            className: "text-muted-foreground text-[9px] truncate",
            children: [e.tickers.length, " tickers · ", e.tickers.slice(
              0, 6).join(", "), e.tickers.length > 6 ? "…" : ""]
          })]
        }), t.jsx("button", {
          type: "button",
          onClick: () => Y(e.id),
          className: "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1",
          title: `Delete "${e.name}"`,
          "data-testid": `${d}-delete-${e.name}`,
          children: t.jsx(J, {
            className: "h-3 w-3"
          })
        })]
      }, e.id))
    })]
  })
}
export {
  Z as B
};