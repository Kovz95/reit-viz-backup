import {
    b as d,
    aj as b,
    r as n,
    j as e,
    c4 as x,
    c5 as u,
    af as k
} from "./index-CsG73Aq_.js";
import {
    u as m
} from "./globalUniverse-DuqPcp2u.js";

function p() {
    const {
        data: t
    } = d({
        queryKey: ["tickers"],
        queryFn: k
    }), {
        baskets: i
    } = b(), [s, a] = n.useState("workbook"), {
        metas: r,
        loading: c,
        error: o
    } = m(), l = n.useMemo(() => s === "workbook" ? t : r, [s, t, r]);
    return e.jsx("div", {
        className: "flex-1 overflow-y-auto bg-background",
        children: e.jsxs("div", {
            className: "max-w-4xl mx-auto p-4 sm:p-6",
            children: [e.jsxs("div", {
                className: "flex items-center gap-2 mb-4",
                children: [e.jsx(x, {
                    className: "w-5 h-5 text-amber-400"
                }), e.jsx("h1", {
                    className: "text-base font-semibold text-foreground",
                    children: "Baskets"
                }), e.jsxs("span", {
                    className: "text-[11px] font-mono text-muted-foreground ml-2",
                    children: [i.length, " saved"]
                })]
            }), e.jsx("p", {
                className: "text-xs text-muted-foreground mb-4 leading-relaxed",
                children: "Centralized basket library. Baskets created here are available across Charts, Pairs, Scanner, Premium/Discount, Distributions, and every optimizer. Each basket stores its ticker list, weighting scheme (equal, market-cap from workbook, Yahoo cap, inverse-vol, price, or custom) and rebalance frequency."
            }), e.jsxs("div", {
                className: "flex items-center gap-2 text-xs mb-3",
                "data-testid": "baskets-universe-source",
                children: [e.jsx("span", {
                    className: "text-slate-400 uppercase tracking-wide",
                    children: "Search Source:"
                }), e.jsxs("button", {
                    type: "button",
                    onClick: () => a("workbook"),
                    className: `px-2 py-1 rounded border transition-colors ${s==="workbook"?"bg-sky-500/20 border-sky-500/60 text-sky-200":"bg-slate-800/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"}`,
                    "data-testid": "baskets-source-workbook",
                    children: ["REIT Workbook (", t?.length ?? 0, ")"]
                }), e.jsxs("button", {
                    type: "button",
                    onClick: () => a("global"),
                    className: `px-2 py-1 rounded border transition-colors ${s==="global"?"bg-sky-500/20 border-sky-500/60 text-sky-200":"bg-slate-800/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"}`,
                    "data-testid": "baskets-source-global",
                    title: "FactSet/RBICS GLOBAL universe (~9,000 tickers, Yahoo-priced)",
                    children: ["Global", " ", s === "global" ? c ? "(loading…)" : `(${r.length.toLocaleString()})` : "(~9k)"]
                }), s === "global" && o && e.jsx("span", {
                    className: "text-rose-400",
                    title: o,
                    children: "load error"
                })]
            }), e.jsx("div", {
                className: "bg-card border border-border rounded-md p-2",
                children: l ? e.jsx(u, {
                    tickers: l,
                    onClose: () => {},
                    hideClose: !0,
                    embedded: !0
                }) : e.jsx("div", {
                    className: "text-xs font-mono text-muted-foreground p-4",
                    children: "Loading tickers…"
                })
            })]
        })
    })
}
export {
    p as
    default
};