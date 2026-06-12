import {
  aj as b,
  r as x,
  cN as i,
  dA as w,
  j as s,
  am as y,
  an as _,
  B as $,
  dB as h,
  aq as v,
  ap as E,
  ay as P,
  az as S,
  aA as I,
  aB as R,
  aC as p,
  aD as u,
  X as A,
  x as z
} from "./index-CsG73Aq_.js";

function O({
  activeTicker: a,
  onSelectTicker: d,
  fallbackTicker: o,
  size: f = "sm",
  className: j = ""
}) {
  const {
    baskets: g,
    getBasket: k
  } = b(), [N, l] = x.useState(!1), r = x.useRef(null);
  x.useEffect(() => {
    a && !i(a) && (r.current = a)
  }, [a]);
  const t = !!a && i(a),
    m = t ? w(a) : null,
    n = m ? k(m) : null,
    c = [...g].sort((e, C) => e.name.localeCompare(C.name)),
    B = f === "xs" ? "h-6" : "h-7";
  return s.jsxs(y, {
    open: N,
    onOpenChange: l,
    children: [s.jsx(_, {
      asChild: !0,
      children: s.jsxs($, {
        variant: t ? "default" : "outline",
        size: "sm",
        className: `${B} gap-1.5 px-2 max-w-[260px] ${t?"bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30":""} ${j}`,
        "data-testid": "basket-pill",
        children: [s.jsx(h, {
          className: "w-3.5 h-3.5 flex-shrink-0"
        }), t && n ? s.jsx("span", {
          className: "font-mono font-semibold text-xs truncate",
          title: n.name,
          children: n.name
        }) : s.jsx("span", {
          className: "text-xs text-muted-foreground",
          children: "Basket"
        }), t && n && s.jsxs("span", {
          className: "text-[10px] text-amber-300/70 flex-shrink-0",
          children: ["(", n.tickers.length, ")"]
        }), s.jsx(v, {
          className: "w-3 h-3 text-muted-foreground/50 flex-shrink-0"
        })]
      })
    }), s.jsx(E, {
      className: "w-[360px] p-0",
      align: "start",
      children: s.jsxs(P, {
        children: [s.jsx(S, {
          placeholder: "Search baskets...",
          className: "h-8 text-xs"
        }), s.jsxs(I, {
          className: "max-h-[320px]",
          children: [s.jsx(R, {
            children: s.jsx("div", {
              className: "px-3 py-4 text-xs text-muted-foreground",
              children: "No baskets yet. Create one in the Baskets tab."
            })
          }), t && s.jsx(p, {
            children: s.jsxs(u, {
              value: "__exit_basket_mode__",
              onSelect: () => {
                const e = r.current ?? o ?? null;
                e && d(e), l(!1)
              },
              className: "text-xs text-muted-foreground",
              children: [s.jsx(A, {
                className: "w-3 h-3 mr-1.5 flex-shrink-0"
              }), "Exit basket mode", (r.current || o) && s.jsxs(
                "span", {
                  className: "ml-auto text-[10px] font-mono text-muted-foreground/70",
                  children: ["→ ", r.current ?? o]
                })]
            })
          }), s.jsx(p, {
            heading: c.length > 0 ? "Baskets" : void 0,
            children: c.map(e => s.jsxs(u, {
              value: `${e.name} ${e.tickers.join(" ")}`,
              onSelect: () => {
                d(`BASKET:${e.id}`), l(!1)
              },
              className: "text-xs",
              children: [s.jsx(z, {
                className: `w-3 h-3 mr-1.5 flex-shrink-0 ${m===e.id?"opacity-100":"opacity-0"}`
              }), s.jsx(h, {
                className: "w-3 h-3 mr-1.5 text-amber-400 flex-shrink-0"
              }), s.jsx("span", {
                className: "font-mono font-semibold mr-2 truncate",
                title: e.name,
                children: e.name
              }), s.jsxs("span", {
                className: "text-[10px] text-muted-foreground/70 ml-auto flex-shrink-0",
                children: [e.tickers.length, " • ", e
                  .weighting ?? "market_cap"
                ]
              })]
            }, e.id))
          })]
        })]
      })
    })]
  })
}
export {
  O as B
};