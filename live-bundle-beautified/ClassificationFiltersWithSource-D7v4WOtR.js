import {
    r as d,
    e as w,
    j as o,
    y as N
} from "./index-CsG73Aq_.js";
import {
    u as $
} from "./globalUniverse-DuqPcp2u.js";

function I(k) {
    const {
        workbookTickers: x,
        filters: h,
        onFiltersChange: s,
        search: p,
        onSearchChange: l,
        manualTickers: C,
        onManualTickersChange: a,
        filteredCount: f,
        totalCount: m,
        testIdPrefix: t,
        source: S,
        onSourceChange: n
    } = k, [v, y] = d.useState("workbook"), e = S ?? v, {
        metas: i,
        loading: c,
        error: r
    } = $(), b = d.useCallback(u => {
        u !== e && (s(w()), l(""), a(new Set), n ? n(u) : y(u))
    }, [e, s, l, a, n]), g = d.useMemo(() => {
        if (e === "global") return c || r ? [] : i
    }, [e, c, r, i]), j = x.length;
    return o.jsxs("div", {
        className: "flex flex-col gap-2 w-full",
        children: [o.jsxs("div", {
            className: "flex items-center gap-2 text-xs",
            "data-testid": `${t}-universe-source`,
            children: [o.jsx("span", {
                className: "text-slate-400 uppercase tracking-wide",
                children: "Universe Source:"
            }), o.jsxs("button", {
                type: "button",
                onClick: () => b("workbook"),
                className: `px-2 py-1 rounded border transition-colors ${e==="workbook"?"bg-sky-500/20 border-sky-500/60 text-sky-200":"bg-slate-800/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"}`,
                "data-testid": `${t}-source-workbook`,
                children: ["REIT Workbook (", j, ")"]
            }), o.jsxs("button", {
                type: "button",
                onClick: () => b("global"),
                className: `px-2 py-1 rounded border transition-colors ${e==="global"?"bg-sky-500/20 border-sky-500/60 text-sky-200":"bg-slate-800/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"}`,
                "data-testid": `${t}-source-global`,
                title: "FactSet/RBICS GLOBAL universe (~9,000 tickers, Yahoo-priced)",
                children: ["Global", " ", e === "global" ? c ? "(loading…)" : `(${i.length.toLocaleString()})` : "(~9k)"]
            }), e === "global" && r && o.jsx("span", {
                className: "text-rose-400",
                title: r,
                children: "load error"
            })]
        }), o.jsx(N, {
            filters: h,
            onFiltersChange: s,
            search: p,
            onSearchChange: l,
            manualTickers: C,
            onManualTickersChange: a,
            filteredCount: f,
            totalCount: e === "global" ? g?.length ?? 0 : m,
            testIdPrefix: t,
            tickerPoolOverride: g
        })]
    })
}
export {
    I as C
};