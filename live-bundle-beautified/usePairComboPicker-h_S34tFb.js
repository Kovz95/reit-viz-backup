import {
    r as n,
    e as S,
    h as O,
    j as a
} from "./index-CsG73Aq_.js";
import {
    C as $
} from "./ClassificationFiltersWithSource-D7v4WOtR.js";
import {
    u as B
} from "./globalUniverse-DuqPcp2u.js";

function R(f, A, P = "paircombo", k = {}) {
    const N = k.warnThreshold ?? 50,
        m = k.maxPairs ?? 500,
        [s, d] = n.useState(() => S()),
        [i, b] = n.useState(""),
        [u, x] = n.useState(() => new Set),
        [l, j] = n.useState("workbook"),
        {
            metas: y,
            loading: w
        } = B(),
        c = n.useMemo(() => s.economy.size + s.sector.size + s.subsector.size + s.industryGroup.size + s.industry.size + s.subindustry.size + u.size + (i.trim().length > 0 ? 1 : 0) === 0 ? [] : O(l === "global" ? y : f, s, i, u).map(r => r.ticker.toUpperCase()).filter((r, h, p) => p.indexOf(r) === h), [f, y, l, s, i, u]),
        g = n.useMemo(() => {
            const e = c.length;
            return e >= 2 ? e * (e - 1) / 2 : 0
        }, [c]),
        F = n.useMemo(() => {
            const e = c;
            if (e.length < 2) return [];
            const t = [];
            e: for (let o = 0; o < e.length; o++)
                for (let r = o + 1; r < e.length; r++) {
                    const h = e[o],
                        p = e[r];
                    if (t.push({
                            label: `${h}/${p}`,
                            a: h,
                            b: p
                        }), t.length >= m) break e
                }
            return t
        }, [c, m]),
        z = F.length,
        C = g > m,
        M = n.useCallback(() => {
            d(S()), b(""), x(new Set)
        }, []),
        T = n.useCallback(() => {
            const e = {};
            for (const t of Object.keys(s)) e[t] = Array.from(s[t]);
            return {
                classFilters: e,
                search: i,
                manualTickers: Array.from(u),
                source: l
            }
        }, [s, i, u, l]),
        E = n.useCallback(e => {
            if (e) {
                if (e.classFilters) {
                    const t = S();
                    for (const o of Object.keys(t)) {
                        const r = e.classFilters[o];
                        Array.isArray(r) ? t[o] = new Set(r) : r instanceof Set && (t[o] = new Set(r))
                    }
                    d(t)
                }
                typeof e.search == "string" && b(e.search), Array.isArray(e.manualTickers) && x(new Set(e.manualTickers)), (e.source === "workbook" || e.source === "global") && j(e.source)
            }
        }, []),
        L = A ? a.jsxs("div", {
            className: "flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-card/10",
            children: [a.jsx("label", {
                className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider mr-1",
                children: "Pair legs"
            }), a.jsx($, {
                workbookTickers: f,
                filters: s,
                onFiltersChange: d,
                search: i,
                onSearchChange: b,
                manualTickers: u,
                onManualTickersChange: x,
                filteredCount: c.length,
                totalCount: l === "global" ? w ? 0 : y.length : f.length,
                testIdPrefix: `${P}-filter`,
                source: l,
                onSourceChange: j
            }), a.jsx("span", {
                className: "text-[10px] font-mono text-muted-foreground ml-auto",
                children: c.length < 2 ? a.jsx(a.Fragment, {
                    children: "Pick at least two legs to generate pairs."
                }) : a.jsxs(a.Fragment, {
                    children: [c.length, " legs → ", a.jsx("span", {
                        className: "text-cyan-400 font-bold",
                        children: z
                    }), " unordered pairs (A/B == B/A)", " ", C && a.jsxs("span", {
                        className: "text-amber-400 font-bold",
                        children: ["— capped at ", m, " (from ", g, ")"]
                    }), !C && g >= N && a.jsx("span", {
                        className: "ml-2 text-amber-400 font-bold",
                        title: "Each pair fetches two Yahoo series and runs the full analysis. Large scans take a while.",
                        children: "⚠ large scan"
                    })]
                })
            })]
        }) : null;
    return {
        pairs: F,
        legTickers: c,
        pairCount: g,
        cappedPairCount: z,
        capped: C,
        ui: L,
        source: l,
        globalLoading: l === "global" && w,
        serialize: T,
        hydrate: E,
        reset: M
    }
}
export {
    R as u
};