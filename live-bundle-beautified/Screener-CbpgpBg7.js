import {
    a as er,
    r as g,
    u as tr,
    b as ft,
    d as gt,
    g as rr,
    j as e,
    bR as bt,
    al as Ee,
    am as Ne,
    an as we,
    B as L,
    c6 as sr,
    ap as Se,
    T as ar,
    S as ir,
    I as O,
    ah as nr,
    E as Ge,
    o as E,
    p as V,
    q as z,
    t as _,
    v as N,
    bq as lr,
    X as Ct,
    y as or,
    P as cr,
    c7 as oe,
    bT as dr,
    A as ur,
    z as vt,
    c8 as xr,
    M as ce,
    ae as Pt,
    bm as jt,
    bn as kt,
    b8 as mr,
    c9 as Dt,
    O as pr,
    a3 as Fe,
    ay as hr,
    az as fr,
    aA as gr,
    aB as br,
    aC as vr,
    aD as jr,
    x as kr,
    w as yr,
    ca as Nr,
    cb as yt,
    b3 as wr,
    b1 as Nt,
    b2 as Sr,
    aR as Ve,
    a$ as ze,
    b0 as Fr,
    a_ as Mr,
    aO as Cr,
    aN as Pr,
    aM as Dr,
    aL as Ar,
    aK as Tr,
    af as Rr
} from "./index-CsG73Aq_.js";
import {
    u as Or
} from "./universeSignature-DAAu9BGh.js";
import {
    B as $r
} from "./badge-CQ2SEXX0.js";
import {
    u as Ir
} from "./usePairComboPicker-h_S34tFb.js";
import {
    P as ye
} from "./play-D7mVvggU.js";
import {
    A as wt
} from "./arrow-up-down-CNMI3GZb.js";
import {
    C as Yr
} from "./calendar-Tn9h7olV.js";
import "./ClassificationFiltersWithSource-D7v4WOtR.js";
import "./globalUniverse-DuqPcp2u.js";
const At = {
    Valuation: ["P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2", "Implied Cap Rate"],
    Yields: ["FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2", "Dividend Yield"],
    Estimates: ["EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2", "EBITDA FY1", "EBITDA FY2"],
    Growth: ["FY1 EPS Growth", "FY2 EPS Growth", "FY1 FFO Growth", "FY2 FFO Growth", "FY1 AFFO Growth", "FY2 AFFO Growth"],
    Performance: ["1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%", "% off 52wk High", "% off 52wk Low"],
    "Short Interest": ["Short Interest%", "SI Δ 1W", "SI Δ 1M", "SI Δ 3M", "SI Δ 6M"],
    Other: ["close", "Enterprise Value", "Dividend", "Buy Ratings", "Hold Ratings", "Sell Ratings"]
};
Object.values(At).flat();
const Me = "P/FFO FY2",
    Lr = {
        SMA: 20,
        EMA: 20,
        HMA: 20,
        LSMA: 21,
        SLSMA: 21,
        RSI: 14,
        ROC: 12,
        "MACD Line": 26,
        "MACD Signal": 26,
        "MACD Hist": 26,
        "BB Upper": 20,
        "BB Basis": 20,
        "BB Lower": 20,
        ATR: 14,
        "Stoch %K": 14,
        "Stoch %D": 14,
        OBV: 1
    },
    Br = [{
        value: "metric",
        label: "Single Metric"
    }, {
        value: "correlation",
        label: "Correlation"
    }, {
        value: "derived",
        label: "Pairs / Derived"
    }],
    Er = [">", "<", ">=", "<=", "crosses_above", "crosses_below"],
    Tt = {
        ">": ">",
        "<": "<",
        ">=": "≥",
        "<=": "≤",
        crosses_above: "crosses ↑",
        crosses_below: "crosses ↓"
    },
    Rt = [{
        label: "1M",
        value: 21
    }, {
        label: "3M",
        value: 63
    }, {
        label: "6M",
        value: 126
    }, {
        label: "1Y",
        value: 252
    }, {
        label: "2Y",
        value: 504
    }, {
        label: "5Y",
        value: 1260
    }],
    Ot = [{
        label: "1M",
        days: 21
    }, {
        label: "3M",
        days: 63
    }, {
        label: "6M",
        days: 126
    }, {
        label: "1Y",
        days: 252
    }, {
        label: "2Y",
        days: 504
    }, {
        label: "5Y",
        days: 1260
    }, {
        label: "Max",
        days: 99999
    }];

function _e() {
    return {
        id: Math.random().toString(36).slice(2),
        leftMetric: Me,
        operator: "<",
        rightType: "value",
        rightValue: 15,
        lookbackDays: 252
    }
}
const Vr = [{
    name: "Cheap P/FFO",
    description: "P/FFO FY2 < 15x",
    conditions: [{
        leftMetric: "P/FFO FY2",
        operator: "<",
        rightType: "value",
        rightValue: 15,
        lookbackDays: 252
    }]
}, {
    name: "Value + Yield",
    description: "P/FFO FY2 < 14x AND Div Yield > 4%",
    conditions: [{
        leftMetric: "P/FFO FY2",
        operator: "<",
        rightType: "value",
        rightValue: 14,
        lookbackDays: 252
    }, {
        leftMetric: "Dividend Yield",
        operator: ">",
        rightType: "value",
        rightValue: 4,
        lookbackDays: 252
    }]
}, {
    name: "High Yield",
    description: "Dividend Yield > 5%",
    conditions: [{
        leftMetric: "Dividend Yield",
        operator: ">",
        rightType: "value",
        rightValue: 5,
        lookbackDays: 252
    }]
}, {
    name: "Growth at Reasonable Price",
    description: "FY2 FFO Growth > 5% AND P/FFO FY2 < 18x",
    conditions: [{
        leftMetric: "FY2 FFO Growth",
        operator: ">",
        rightType: "value",
        rightValue: 5,
        lookbackDays: 252
    }, {
        leftMetric: "P/FFO FY2",
        operator: "<",
        rightType: "value",
        rightValue: 18,
        lookbackDays: 252
    }]
}, {
    name: "Momentum",
    description: "3M Price Chg > 10% AND 1M Price Chg > 0%",
    conditions: [{
        leftMetric: "3M Price Chg%",
        operator: ">",
        rightType: "value",
        rightValue: 10,
        lookbackDays: 252
    }, {
        leftMetric: "1M Price Chg%",
        operator: ">",
        rightType: "value",
        rightValue: 0,
        lookbackDays: 252
    }]
}, {
    name: "Beaten Down",
    description: "% off 52wk High < -25%",
    conditions: [{
        leftMetric: "% off 52wk High",
        operator: "<",
        rightType: "value",
        rightValue: -25,
        lookbackDays: 252
    }]
}, {
    name: "Historical Cheap",
    description: "P/FFO FY2 below 20th percentile (1Y)",
    conditions: [{
        leftMetric: "P/FFO FY2",
        operator: "<",
        rightType: "percentile",
        rightPercentile: 20,
        lookbackDays: 252
    }]
}, {
    name: "Short Squeeze Candidates",
    description: "Short Interest > 10% AND 1M Price Chg > 5%",
    conditions: [{
        leftMetric: "Short Interest%",
        operator: ">",
        rightType: "value",
        rightValue: 10,
        lookbackDays: 252
    }, {
        leftMetric: "1M Price Chg%",
        operator: ">",
        rightType: "value",
        rightValue: 5,
        lookbackDays: 252
    }]
}, {
    name: "AFFO Yield > FFO Yield",
    description: "AFFO Yield FY2 > FFO Yield FY2 (capital-light)",
    conditions: [{
        leftMetric: "AFFO Yield FY2",
        operator: ">",
        rightType: "metric",
        rightMetric: "FFO Yield FY2",
        lookbackDays: 252
    }]
}, {
    name: "RSI Oversold",
    description: "RSI(14) of close < 30",
    conditions: [{
        leftMetric: "close",
        leftIndicator: {
            type: "RSI",
            period: 14
        },
        operator: "<",
        rightType: "value",
        rightValue: 30,
        lookbackDays: 252
    }]
}];

function St(r, i) {
    if (!i) return r;
    switch (i.type) {
        case "SMA":
            return Tr(r, i.period);
        case "EMA":
            return Ar(r, i.period);
        case "HMA":
            return Dr(r, i.period);
        case "LSMA":
            return Pr(r, i.period, 0);
        case "SLSMA":
            return Cr(r, i.period, 0);
        case "RSI":
            return Mr(r, i.period);
        case "ROC":
            return Fr(r, i.period);
        case "MACD Line":
            return ze(r, 12, 26, 9).macdLine;
        case "MACD Signal":
            return ze(r, 12, 26, 9).signalLine;
        case "MACD Hist":
            return ze(r, 12, 26, 9).histogram;
        case "BB Upper":
            return Ve(r, i.period, 2).upper;
        case "BB Basis":
            return Ve(r, i.period, 2).basis;
        case "BB Lower":
            return Ve(r, i.period, 2).lower;
        case "ATR":
            return Sr(r, i.period);
        case "Stoch %K":
            return Nt(r, i.period, 3).k;
        case "Stoch %D":
            return Nt(r, i.period, 3).d;
        case "OBV":
            return wr(r);
        default:
            return r
    }
}
async function zr(r, i) {
    const d = i.sourceType ?? "metric";
    if (d === "metric") return await Fe(r, i.leftMetric);
    const o = i.sourceTicker2,
        b = i.sourceMetric2 ?? "close";
    if (!o) return [];
    const [c, u] = await Promise.all([Fe(r, i.leftMetric), Fe(o, b)]);
    if (c.length === 0 || u.length === 0) return [];
    const l = Nr(c, u);
    if (l.length === 0) return [];
    const s = i.derivedWindow ?? 60;
    if (d === "correlation") return yt("correlation", l, s);
    const v = i.derivedType ?? "ratio";
    return yt(v, l, s)
}

function Ft(r, i, d, o, b) {
    switch (i) {
        case ">":
            return r > d;
        case "<":
            return r < d;
        case ">=":
            return r >= d;
        case "<=":
            return r <= d;
        case "crosses_above":
            return o != null && b !== null && b !== void 0 && o <= b && r > d;
        case "crosses_below":
            return o != null && b !== null && b !== void 0 && o >= b && r < d
    }
    return !1
}
async function _r(r, i) {
    if (r.length === 0) return null;
    const d = r.length - 1,
        o = i.lookbackMode ?? "now";
    if (o === "now") return {
        startIdx: d,
        endIdx: d
    };
    if (o === "preset") {
        const b = i.lookbackPresetDays ?? 21,
            c = await Pt(),
            u = c.length - 1,
            l = Math.max(0, u - b + 1),
            s = c[l],
            v = c[u],
            $ = j => typeof j.time == "string" ? j.time : String(j.time);
        if ($(r[d]) < s) return null;
        let k = -1;
        for (let j = 0; j < r.length; j++)
            if ($(r[j]) >= s) {
                k = j;
                break
            } if (k === -1) return null;
        let y = d;
        for (let j = d; j >= k; j--)
            if ($(r[j]) <= v) {
                y = j;
                break
            } return k > y ? null : {
            startIdx: k,
            endIdx: y
        }
    }
    if (o === "custom") {
        const b = i.lookbackStartDate,
            c = i.lookbackEndDate;
        let u = 0,
            l = r.length - 1;
        if (b) {
            const s = b.replace(/-/g, "");
            if (u = r.findIndex(v => (typeof v.time == "string" ? v.time.replace(/-/g, "") : String(v.time)) >= s), u === -1) return null
        }
        if (c) {
            const s = c.replace(/-/g, "");
            for (let v = r.length - 1; v >= u; v--)
                if ((typeof r[v].time == "string" ? r[v].time.replace(/-/g, "") : String(r[v].time)) <= s) {
                    l = v;
                    break
                }
        }
        return {
            startIdx: u,
            endIdx: l
        }
    }
    return {
        startIdx: d,
        endIdx: d
    }
}
async function Zr(r, i) {
    const d = await zr(r, i);
    if (d.length === 0) return {
        leftVal: null,
        pass: !1,
        matchDate: null
    };
    const o = St(d, i.leftIndicator);
    if (o.length === 0) return {
        leftVal: null,
        pass: !1,
        matchDate: null
    };
    const b = i.operator === "crosses_above" || i.operator === "crosses_below",
        c = i.lookbackMode ?? "now";
    let u = null;
    if (i.rightType === "metric") {
        const y = i.rightMetric ?? Me,
            j = await Fe(r, y);
        if (j.length === 0) return {
            leftVal: o[o.length - 1].value,
            pass: !1,
            matchDate: null
        };
        if (u = St(j, i.rightIndicator), u.length === 0) return {
            leftVal: o[o.length - 1].value,
            pass: !1,
            matchDate: null
        }
    }
    if (c === "now") {
        const y = o[o.length - 1].value,
            j = b && o.length >= 2 ? o[o.length - 2].value : null;
        let w = null,
            T = null;
        if (i.rightType === "value") w = i.rightValue ?? 0, T = w;
        else if (i.rightType === "metric" && u) w = u[u.length - 1].value, T = b && u.length >= 2 ? u[u.length - 2].value : w;
        else if (i.rightType === "percentile") {
            const P = i.rightPercentile ?? 50,
                I = i.lookbackDays ?? 252,
                S = o.slice(-I).map(Z => Z.value).filter(Z => Number.isFinite(Z));
            if (S.length === 0) return {
                leftVal: y,
                pass: !1,
                matchDate: null
            };
            S.sort((Z, Pe) => Z - Pe);
            const Ce = Math.max(0, Math.min(S.length - 1, Math.round(P / 100 * (S.length - 1))));
            w = S[Ce], T = w
        }
        if (w === null) return {
            leftVal: y,
            pass: !1,
            matchDate: null
        };
        const C = Ft(y, i.operator, w, j, T);
        return {
            leftVal: y,
            pass: C,
            matchDate: null
        }
    }
    const l = await _r(o, i);
    if (!l) return {
        leftVal: null,
        pass: !1,
        matchDate: null
    };
    const {
        startIdx: s,
        endIdx: v
    } = l, $ = o[o.length - 1].value;
    let G = null;
    u && (G = new Map, u.forEach((y, j) => {
        const w = typeof y.time == "string" ? y.time : String(y.time);
        G.set(w, j)
    }));
    let k = null;
    if (i.rightType === "percentile") {
        const y = i.rightPercentile ?? 50,
            j = i.lookbackDays ?? 252,
            w = o.slice(-j).map(C => C.value).filter(C => Number.isFinite(C));
        if (w.length === 0) return {
            leftVal: $,
            pass: !1,
            matchDate: null
        };
        w.sort((C, P) => C - P);
        const T = Math.max(0, Math.min(w.length - 1, Math.round(y / 100 * (w.length - 1))));
        k = w[T]
    }
    for (let y = v; y >= s; y--) {
        const j = o[y].value,
            w = typeof o[y].time == "string" ? o[y].time : String(o[y].time),
            T = y > 0 ? o[y - 1].value : null;
        let C = null,
            P = null;
        if (i.rightType === "value") C = i.rightValue ?? 0, P = C;
        else if (i.rightType === "metric" && u && G) {
            const S = G.get(w);
            if (S === void 0) continue;
            C = u[S].value, P = S > 0 ? u[S - 1].value : C
        } else i.rightType === "percentile" && k !== null && (C = k, P = k);
        if (C === null) continue;
        if (Ft(j, i.operator, C, T, P)) return {
            leftVal: j,
            pass: !0,
            matchDate: w
        }
    }
    return {
        leftVal: $,
        pass: !1,
        matchDate: null
    }
}

function Ze(r) {
    const i = r.sourceType ?? "metric";
    let d = r.leftMetric;
    i === "correlation" ? d = `Corr(${r.leftMetric} × ${r.sourceTicker2??"?"}:${r.sourceMetric2??"close"}, ${r.derivedWindow??60}d)` : i === "derived" && (d = `${Dt.find(v=>v.type===r.derivedType)?.label??r.derivedType??"ratio"}(${r.leftMetric} × ${r.sourceTicker2??"?"}:${r.sourceMetric2??"close"})`);
    const o = r.leftIndicator ? `${r.leftIndicator.type}(${r.leftIndicator.period}) of ${d}` : d,
        b = Tt[r.operator];
    let c = "";
    if (r.rightType === "value") c = String(r.rightValue ?? "");
    else if (r.rightType === "metric") {
        const s = r.rightMetric ?? Me;
        c = r.rightIndicator ? `${r.rightIndicator.type}(${r.rightIndicator.period}) of ${s}` : s
    } else {
        const s = Rt.find(v => v.value === (r.lookbackDays ?? 252))?.label ?? "1Y";
        c = `${r.rightPercentile??50}th pctile (${s})`
    }
    const u = r.lookbackMode ?? "now";
    let l = "";
    if (u === "preset") l = ` (any in ${Ot.find(v=>v.days===(r.lookbackPresetDays??21))?.label??"1M"})`;
    else if (u === "custom") {
        const s = r.lookbackStartDate ?? "...",
            v = r.lookbackEndDate ?? "...";
        l = ` (any ${s} – ${v})`
    }
    return `${o} ${b} ${c}${l}`
}

function Gr(r, i) {
    if (r === null || isNaN(r)) return "—";
    const d = pr(i),
        o = d ? 1 : Math.abs(r) < 10 ? 2 : 1;
    return r.toFixed(o) + (d ? "%" : "")
}
const Ur = [{
    label: "Moving Averages",
    types: ["SMA", "EMA", "HMA", "LSMA", "SLSMA"]
}, {
    label: "Oscillators",
    types: ["RSI", "ROC", "Stoch %K", "Stoch %D"]
}, {
    label: "MACD",
    types: ["MACD Line", "MACD Signal", "MACD Hist"]
}, {
    label: "Bollinger",
    types: ["BB Upper", "BB Basis", "BB Lower"]
}, {
    label: "Other",
    types: ["ATR", "OBV"]
}];

function Mt({
    value: r,
    onChange: i,
    compact: d = !1
}) {
    const o = r?.type ?? "None",
        b = r?.period ?? 20,
        c = r && r.type !== "OBV";
    return e.jsxs("div", {
        className: "flex items-center gap-1",
        children: [e.jsxs(E, {
            value: o,
            onValueChange: u => {
                if (u === "None") i(void 0);
                else {
                    const l = u;
                    i({
                        type: l,
                        period: r?.period ?? Lr[l] ?? 20
                    })
                }
            },
            children: [e.jsx(V, {
                className: "h-7 text-[11px] border-border bg-muted/20 focus:ring-0 focus:ring-offset-0",
                style: {
                    width: d ? 80 : 100
                },
                "data-testid": "select-indicator-type",
                children: e.jsx(z, {})
            }), e.jsxs(_, {
                className: "text-xs max-h-72",
                children: [e.jsx(N, {
                    value: "None",
                    className: "text-xs py-1",
                    children: "None"
                }), Ur.map(u => e.jsxs("div", {
                    children: [e.jsx("div", {
                        className: "px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
                        children: u.label
                    }), u.types.map(l => e.jsx(N, {
                        value: l,
                        className: "text-xs py-1 pl-4",
                        children: l
                    }, l))]
                }, u.label))]
            })]
        }), c && e.jsx(O, {
            type: "number",
            min: 1,
            max: 500,
            value: b,
            onChange: u => {
                const l = parseInt(u.target.value) || 1;
                i({
                    type: r.type,
                    period: Math.max(1, l)
                })
            },
            className: "h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1",
            "data-testid": "input-indicator-period"
        })]
    })
}

function de({
    value: r,
    onChange: i,
    width: d = 150
}) {
    const o = yr();
    return e.jsxs(E, {
        value: r,
        onValueChange: i,
        children: [e.jsx(V, {
            className: "h-7 text-[11px] border-border bg-muted/20 focus:ring-0 focus:ring-offset-0 truncate",
            style: {
                width: d
            },
            "data-testid": "select-metric",
            children: e.jsx(z, {})
        }), e.jsxs(_, {
            className: "text-xs max-h-72",
            children: [Object.entries(At).map(([b, c]) => e.jsxs("div", {
                children: [e.jsx("div", {
                    className: "px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
                    children: b
                }), c.map(u => e.jsx(N, {
                    value: u,
                    className: "text-xs py-1 pl-4",
                    children: u
                }, u))]
            }, b)), o.length > 0 && e.jsxs("div", {
                children: [e.jsx("div", {
                    className: "px-2 py-1 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider",
                    children: "Uploaded Fundamental"
                }), o.map(b => e.jsx(N, {
                    value: b,
                    className: "text-xs py-1 pl-4",
                    children: b
                }, b))]
            })]
        })]
    })
}

function Hr({
    value: r,
    onChange: i,
    tickers: d,
    width: o = 100
}) {
    const [b, c] = g.useState(!1), u = d.find(l => l.ticker === r);
    return e.jsxs(Ne, {
        open: b,
        onOpenChange: c,
        children: [e.jsx(we, {
            asChild: !0,
            children: e.jsxs("button", {
                type: "button",
                role: "combobox",
                "aria-expanded": b,
                className: "h-7 text-[11px] border border-border bg-muted/20 rounded-md px-2 flex items-center justify-between gap-1 truncate font-mono hover:bg-muted/40 focus:outline-none focus:ring-0",
                style: {
                    width: o
                },
                "data-testid": "select-ticker2",
                title: u ? `${u.ticker} — ${u.name}` : "Select ticker",
                children: [e.jsx("span", {
                    className: "truncate",
                    children: u ? e.jsxs(e.Fragment, {
                        children: [e.jsx("span", {
                            children: u.ticker
                        }), e.jsx("span", {
                            className: "ml-1 text-muted-foreground text-[10px]",
                            children: u.name
                        })]
                    }) : e.jsx("span", {
                        className: "text-muted-foreground",
                        children: "Select…"
                    })
                }), e.jsx(Ge, {
                    size: 10,
                    className: "text-muted-foreground shrink-0"
                })]
            })
        }), e.jsx(Se, {
            className: "w-[420px] p-0",
            align: "start",
            children: e.jsxs(hr, {
                filter: (l, s) => {
                    const v = s.toLowerCase().trim();
                    return v ? l.includes(v) ? 1 : 0 : 1
                },
                children: [e.jsx(fr, {
                    placeholder: "Search ticker or name…",
                    className: "h-8 text-xs",
                    "data-testid": "input-ticker2-search"
                }), e.jsxs(gr, {
                    className: "max-h-[260px]",
                    children: [e.jsx(br, {
                        children: "No ticker found."
                    }), e.jsx(vr, {
                        children: d.map(l => e.jsxs(jr, {
                            value: `${l.ticker} ${l.name}`.toLowerCase(),
                            onSelect: () => {
                                i(l.ticker), c(!1)
                            },
                            className: "text-xs py-1 cursor-pointer",
                            "data-testid": `option-ticker2-${l.ticker}`,
                            children: [e.jsx("span", {
                                className: "font-mono w-14 shrink-0 whitespace-nowrap",
                                children: l.ticker
                            }), e.jsx("span", {
                                className: "ml-1 text-muted-foreground text-[10px] flex-1 min-w-0 truncate",
                                title: l.name,
                                children: l.name
                            }), r === l.ticker && e.jsx(kr, {
                                size: 10,
                                className: "ml-auto text-primary shrink-0"
                            })]
                        }, l.ticker))
                    })]
                })]
            })
        })]
    })
}
const Kr = ["Core", "Z-Score", "Stats"];

function Wr({
    value: r,
    onChange: i
}) {
    return e.jsxs(E, {
        value: r,
        onValueChange: d => i(d),
        children: [e.jsx(V, {
            className: "h-7 text-[11px] border-border bg-muted/20 focus:ring-0 focus:ring-offset-0",
            style: {
                width: 110
            },
            "data-testid": "select-derived-type",
            children: e.jsx(z, {})
        }), e.jsx(_, {
            className: "text-xs max-h-72",
            children: Kr.map(d => e.jsxs("div", {
                children: [e.jsx("div", {
                    className: "px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
                    children: d
                }), Dt.filter(o => o.group === d).map(o => e.jsx(N, {
                    value: o.type,
                    className: "text-xs py-1 pl-4",
                    title: o.tip,
                    children: o.label
                }, o.type))]
            }, d))
        })]
    })
}

function qr({
    condition: r,
    index: i,
    onChange: d,
    onRemove: o,
    tickers: b
}) {
    const c = r,
        u = c.sourceType ?? "metric";

    function l(s) {
        d({
            ...c,
            ...s
        })
    }
    return e.jsxs("div", {
        className: "flex flex-wrap items-center gap-x-1.5 gap-y-1.5 py-2 px-2 rounded border border-border/60 bg-muted/10",
        children: [i > 0 && e.jsx("span", {
            className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mr-1 w-7",
            children: "AND"
        }), i === 0 && e.jsx("span", {
            className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mr-1 w-7",
            children: "IF"
        }), e.jsx("div", {
            className: "flex rounded overflow-hidden border border-border/60 h-7",
            children: Br.map(s => e.jsx("button", {
                onClick: () => {
                    const v = {
                        sourceType: s.value
                    };
                    s.value !== "metric" && !c.sourceTicker2 && b.length > 0 && (v.sourceTicker2 = b[0]?.ticker ?? "", v.sourceMetric2 = "close", v.derivedWindow = 60), s.value === "derived" && !c.derivedType && (v.derivedType = "ratio"), l(v)
                },
                className: `px-1.5 text-[10px] font-medium transition-colors ${u===s.value?"bg-primary text-primary-foreground":"bg-muted/20 text-muted-foreground hover:bg-muted/40"}`,
                "data-testid": `btn-source-type-${s.value}`,
                children: s.label
            }, s.value))
        }), e.jsx(de, {
            value: c.leftMetric,
            onChange: s => l({
                leftMetric: s
            }),
            width: 148
        }), u !== "metric" && e.jsxs(e.Fragment, {
            children: [e.jsx("span", {
                className: "text-[10px] text-muted-foreground font-medium",
                children: "×"
            }), e.jsx(Hr, {
                value: c.sourceTicker2 ?? b[0]?.ticker ?? "",
                onChange: s => l({
                    sourceTicker2: s
                }),
                tickers: b,
                width: 90
            }), e.jsx(de, {
                value: c.sourceMetric2 ?? "close",
                onChange: s => l({
                    sourceMetric2: s
                }),
                width: 120
            }), e.jsxs("div", {
                className: "flex items-center gap-0.5",
                children: [e.jsx("span", {
                    className: "text-[10px] text-muted-foreground",
                    children: "win"
                }), e.jsx(O, {
                    type: "number",
                    min: 5,
                    max: 2e3,
                    value: c.derivedWindow ?? 60,
                    onChange: s => l({
                        derivedWindow: Math.max(5, parseInt(s.target.value) || 60)
                    }),
                    className: "h-7 w-12 text-[11px] bg-muted/20 border-border text-center px-0.5",
                    "data-testid": "input-derived-window"
                })]
            })]
        }), u === "derived" && e.jsx(Wr, {
            value: c.derivedType ?? "ratio",
            onChange: s => l({
                derivedType: s
            })
        }), e.jsx(Mt, {
            value: c.leftIndicator,
            onChange: s => l({
                leftIndicator: s
            })
        }), e.jsxs(E, {
            value: c.operator,
            onValueChange: s => l({
                operator: s
            }),
            children: [e.jsx(V, {
                className: "h-7 w-[100px] text-[11px] border-border bg-muted/20 focus:ring-0 focus:ring-offset-0",
                "data-testid": "select-operator",
                children: e.jsx(z, {})
            }), e.jsx(_, {
                className: "text-xs",
                children: Er.map(s => e.jsx(N, {
                    value: s,
                    className: "text-xs py-1",
                    children: Tt[s]
                }, s))
            })]
        }), e.jsx("div", {
            className: "flex rounded overflow-hidden border border-border/60 h-7",
            children: ["value", "metric", "percentile"].map(s => e.jsx("button", {
                onClick: () => l({
                    rightType: s
                }),
                className: `px-2 text-[10px] font-medium transition-colors ${c.rightType===s?"bg-primary text-primary-foreground":"bg-muted/20 text-muted-foreground hover:bg-muted/40"}`,
                "data-testid": `btn-right-type-${s}`,
                children: s === "value" ? "Value" : s === "metric" ? "Metric" : "Pctile"
            }, s))
        }), c.rightType === "value" && e.jsx(O, {
            type: "number",
            value: c.rightValue ?? "",
            onChange: s => l({
                rightValue: parseFloat(s.target.value) || 0
            }),
            className: "h-7 w-20 text-[11px] bg-muted/20 border-border text-center px-1",
            placeholder: "value",
            "data-testid": "input-right-value"
        }), c.rightType === "metric" && e.jsxs(e.Fragment, {
            children: [e.jsx(de, {
                value: c.rightMetric ?? Me,
                onChange: s => l({
                    rightMetric: s
                }),
                width: 148
            }), e.jsx(Mt, {
                value: c.rightIndicator,
                onChange: s => l({
                    rightIndicator: s
                })
            })]
        }), c.rightType === "percentile" && e.jsxs(e.Fragment, {
            children: [e.jsxs("div", {
                className: "flex items-center gap-1",
                children: [e.jsx(O, {
                    type: "number",
                    min: 1,
                    max: 99,
                    value: c.rightPercentile ?? 50,
                    onChange: s => l({
                        rightPercentile: Math.max(1, Math.min(99, parseInt(s.target.value) || 50))
                    }),
                    className: "h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1",
                    "data-testid": "input-percentile"
                }), e.jsx("span", {
                    className: "text-[10px] text-muted-foreground",
                    children: "pctile"
                })]
            }), e.jsxs(E, {
                value: String(c.lookbackDays ?? 252),
                onValueChange: s => l({
                    lookbackDays: parseInt(s)
                }),
                children: [e.jsx(V, {
                    className: "h-7 w-16 text-[11px] border-border bg-muted/20 focus:ring-0 focus:ring-offset-0",
                    "data-testid": "select-lookback",
                    children: e.jsx(z, {})
                }), e.jsx(_, {
                    className: "text-xs",
                    children: Rt.map(s => e.jsx(N, {
                        value: String(s.value),
                        className: "text-xs py-1",
                        children: s.label
                    }, s.value))
                })]
            })]
        }), e.jsxs("div", {
            className: "flex items-center gap-1 ml-1 border-l border-border/40 pl-1.5",
            children: [e.jsxs("div", {
                className: "flex rounded overflow-hidden border border-border/60 h-7",
                children: [e.jsx("button", {
                    onClick: () => l({
                        lookbackMode: "now"
                    }),
                    className: `px-1.5 text-[10px] font-medium transition-colors flex items-center gap-0.5 ${(c.lookbackMode??"now")==="now"?"bg-primary text-primary-foreground":"bg-muted/20 text-muted-foreground hover:bg-muted/40"}`,
                    "data-testid": "btn-lookback-now",
                    title: "Evaluate at latest data point only",
                    children: "Now"
                }), e.jsxs("button", {
                    onClick: () => l({
                        lookbackMode: "preset",
                        lookbackPresetDays: c.lookbackPresetDays ?? 21
                    }),
                    className: `px-1.5 text-[10px] font-medium transition-colors flex items-center gap-0.5 ${(c.lookbackMode??"now")==="preset"?"bg-primary text-primary-foreground":"bg-muted/20 text-muted-foreground hover:bg-muted/40"}`,
                    "data-testid": "btn-lookback-preset",
                    title: "True at any point in preset window",
                    children: [e.jsx(mr, {
                        size: 9
                    }), "Lookback"]
                }), e.jsxs("button", {
                    onClick: () => l({
                        lookbackMode: "custom"
                    }),
                    className: `px-1.5 text-[10px] font-medium transition-colors flex items-center gap-0.5 ${(c.lookbackMode??"now")==="custom"?"bg-primary text-primary-foreground":"bg-muted/20 text-muted-foreground hover:bg-muted/40"}`,
                    "data-testid": "btn-lookback-custom",
                    title: "True at any point in custom date range",
                    children: [e.jsx(Yr, {
                        size: 9
                    }), "Range"]
                })]
            }), (c.lookbackMode ?? "now") === "preset" && e.jsx("div", {
                className: "flex rounded overflow-hidden border border-border/60 h-7",
                children: Ot.map(s => e.jsx("button", {
                    onClick: () => l({
                        lookbackPresetDays: s.days
                    }),
                    className: `px-1.5 text-[10px] font-medium transition-colors ${(c.lookbackPresetDays??21)===s.days?"bg-accent text-accent-foreground":"bg-muted/20 text-muted-foreground hover:bg-muted/40"}`,
                    "data-testid": `btn-lb-preset-${s.label}`,
                    children: s.label
                }, s.days))
            }), (c.lookbackMode ?? "now") === "custom" && e.jsxs("div", {
                className: "flex items-center gap-1",
                children: [e.jsx(O, {
                    type: "date",
                    value: c.lookbackStartDate ?? "",
                    onChange: s => l({
                        lookbackStartDate: s.target.value
                    }),
                    className: "h-7 w-[120px] text-[10px] bg-muted/20 border-border px-1",
                    "data-testid": "input-lb-start-date"
                }), e.jsx("span", {
                    className: "text-[10px] text-muted-foreground",
                    children: "–"
                }), e.jsx(O, {
                    type: "date",
                    value: c.lookbackEndDate ?? "",
                    onChange: s => l({
                        lookbackEndDate: s.target.value
                    }),
                    className: "h-7 w-[120px] text-[10px] bg-muted/20 border-border px-1",
                    "data-testid": "input-lb-end-date"
                })]
            })]
        }), e.jsx("button", {
            onClick: o,
            className: "ml-auto h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors",
            "data-testid": "btn-remove-condition",
            "aria-label": "Remove condition",
            children: e.jsx(Ct, {
                size: 13
            })
        })]
    })
}

function ns() {
    const {
        universeTickers: r,
        isFiltered: i,
        filteredCount: d,
        totalCount: o,
        filters: b,
        setFilters: c,
        search: u,
        setSearch: l,
        manualTickers: s,
        setManualTickers: v
    } = er(), [$, G] = g.useState(!0), [k, y] = g.useState([_e()]), [j, w] = g.useState([]), [T, C] = g.useState(!1), [P, I] = g.useState(null), [S, Ce] = g.useState("all"), [Z, Pe] = g.useState("subsector"), [Ue, $t] = g.useState("P/FFO FY2"), [He, It] = g.useState("FY2 FFO Growth"), [De, Yt] = g.useState(.5), [B, ee] = g.useState(!1), [te, Ae] = g.useState(null), [ue, W] = g.useState(null), [Te, re] = g.useState(null), [R, Ke] = g.useState({
        key: "ticker",
        dir: "asc"
    }), [A, xe] = g.useState("single"), [U, We] = g.useState("close"), [H, qe] = g.useState("close"), [K, Re] = g.useState(60), [se, Je] = g.useState(52), [me, Qe] = g.useState(8), [pe, Xe] = g.useState(52), [ae, et] = g.useState(.5), [ie, tt] = g.useState(500), [ne, rt] = g.useState("all"), [he, Oe] = g.useState([]), [fe, $e] = g.useState(!1), [st, ge] = g.useState(null), [Y, at] = g.useState({
        key: "absRawZ",
        dir: "desc"
    }), be = g.useRef(!1), [Lt, it] = g.useState(!1), [Ie, nt] = g.useState(""), lt = tr(), {
        data: ot = []
    } = ft({
        queryKey: ["/api/screener-presets"],
        queryFn: async () => (await ce("GET", "/api/screener-presets")).json()
    }), Ye = gt({
        mutationFn: async t => (await ce("POST", "/api/screener-presets", t)).json(),
        onSuccess: () => {
            lt.invalidateQueries({
                queryKey: ["/api/screener-presets"]
            }), it(!1), nt("")
        }
    }), Bt = gt({
        mutationFn: async t => {
            await ce("POST", `/api/screener-presets/${t}/delete`)
        },
        onSuccess: () => {
            lt.invalidateQueries({
                queryKey: ["/api/screener-presets"]
            })
        }
    });

    function ct() {
        const t = Ie.trim();
        if (!t || k.length === 0) return;
        const a = k.map(({
            id: n,
            ...p
        }) => p);
        Ye.mutate({
            label: t,
            conditions: a
        })
    }

    function Et(t) {
        try {
            const a = JSON.parse(t.conditions);
            if (!Array.isArray(a)) return;
            const n = a.map(p => ({
                ...p,
                id: Math.random().toString(36).slice(2)
            }));
            y(n), w([]), C(!1), I(null)
        } catch {}
    }
    const {
        data: ve = []
    } = ft({
        queryKey: ["/universe-tickers"],
        queryFn: Rr
    }), je = g.useMemo(() => r ? ve.filter(t => r.has(t.ticker)) : ve, [ve, r]), le = Ir(je.map(t => t.ticker), A === "pairCombo", "screener-pc"), Vt = g.useCallback(() => ({
        conditions: k,
        runConditions: P,
        results: j,
        hasRun: T,
        sort: R,
        screenMode: A,
        pairsMetricA: U,
        pairsMetricB: H,
        pairsZWindow: K,
        pairsBetaLookback: se,
        pairsSpreadZWindow: me,
        pairsOlsResidWindow: pe,
        pairsMinCorr: ae,
        pairsMaxHalfLife: ie,
        pairsZFilter: ne,
        pairsResults: he,
        pairsHasRun: fe,
        pairsSort: Y,
        pairCombo: le.serialize()
    }), [k, P, j, T, R, A, U, H, K, se, me, pe, ae, ie, ne, he, fe, Y, le]), zt = g.useCallback(t => {
        if (!t) return;
        const a = Array.isArray(t.conditions) ? t.conditions : [];
        if (a.length > 0 && y(a), Array.isArray(t.results) && a.length > 0) {
            const n = a.map(m => m.id),
                p = t.results.map(m => {
                    if (!m.values || n.some(F => m.values[F] !== void 0)) return m;
                    const f = Object.keys(m.values),
                        x = {},
                        M = {};
                    for (let F = 0; F < Math.min(f.length, n.length); F++) x[n[F]] = m.values[f[F]], m.matchDates && (M[n[F]] = m.matchDates[f[F]]);
                    return {
                        ...m,
                        values: x,
                        matchDates: M
                    }
                });
            w(p)
        } else Array.isArray(t.results) && w(t.results);
        typeof t.hasRun == "boolean" && C(t.hasRun), Array.isArray(t.runConditions) ? I(t.runConditions) : t.hasRun && a.length > 0 ? I(a) : I(null), t.sort && Ke(t.sort), (t.screenMode === "single" || t.screenMode === "pairs" || t.screenMode === "pairCombo") && xe(t.screenMode), t.pairCombo && le.hydrate(t.pairCombo), t.pairsMetricA && We(t.pairsMetricA), t.pairsMetricB && qe(t.pairsMetricB), t.pairsZWindow !== void 0 && Re(t.pairsZWindow), t.pairsBetaLookback !== void 0 && Je(t.pairsBetaLookback), t.pairsSpreadZWindow !== void 0 && Qe(t.pairsSpreadZWindow), t.pairsOlsResidWindow !== void 0 && Xe(t.pairsOlsResidWindow), t.pairsMinCorr !== void 0 && et(t.pairsMinCorr), t.pairsMaxHalfLife !== void 0 && tt(t.pairsMaxHalfLife), t.pairsZFilter && rt(t.pairsZFilter), Array.isArray(t.pairsResults) && Oe(t.pairsResults), typeof t.pairsHasRun == "boolean" && $e(t.pairsHasRun), t.pairsSort && at(t.pairsSort)
    }, []), _t = Or();
    rr("screener", Vt, zt, {
        universeSig: _t,
        resultFields: ["results", "runConditions", "hasRun", "pairsResults", "pairsHasRun"]
    });

    function Zt() {
        y(t => [...t, _e()])
    }

    function Gt(t, a) {
        y(n => n.map(p => p.id === t ? a : p))
    }

    function Ut(t) {
        y(a => {
            const n = a.filter(p => p.id !== t);
            return n.length === 0 ? [_e()] : n
        })
    }
    async function Le() {
        if (B || k.length === 0) return;
        ee(!0), W(null), w([]), C(!1), I(null), re(null), be.current = !1;
        const t = je,
            a = t.length;
        Ae({
            done: 0,
            total: a
        });
        try {
            if (k.some(h => (h.lookbackMode ?? "now") === "preset")) {
                const h = await Pt(),
                    f = h[h.length - 1],
                    M = k.find(ke => (ke.lookbackMode ?? "now") === "preset").lookbackPresetDays ?? 21,
                    F = Math.max(0, h.length - M),
                    D = h[F];
                re(`Scan window: ${D} to ${f}`)
            }
        } catch {}
        const n = [],
            p = 20;
        try {
            for (let h = 0; h < t.length && !be.current; h += p) {
                const f = t.slice(h, h + p),
                    x = await Promise.all(f.map(async M => {
                        const F = await Promise.all(k.map(X => Zr(M.ticker, X))),
                            D = F.every(X => X.pass),
                            ke = {},
                            pt = {};
                        return k.forEach((X, ht) => {
                            ke[X.id] = F[ht].leftVal, pt[X.id] = F[ht].matchDate
                        }), {
                            ticker: M,
                            allPass: D,
                            values: ke,
                            matchDates: pt
                        }
                    }));
                for (const M of x) M.allPass && n.push({
                    ticker: M.ticker.ticker,
                    name: M.ticker.name,
                    sector: M.ticker.sector,
                    subsector: M.ticker.subsector,
                    values: M.values,
                    matchDates: M.matchDates
                });
                Ae({
                    done: Math.min(h + p, a),
                    total: a
                })
            }
            let m = n;
            if (S !== "all" && n.length > 0 && !be.current) {
                const h = Te;
                try {
                    re(D => D ? `${D} · Computing RV verdicts...` : "Computing RV verdicts...");
                    const x = await (await ce("POST", "/api/rv-verdict-batch", {
                            tickers: n.map(D => D.ticker),
                            dimension: Z,
                            valMetric: Ue,
                            growthMetric: He,
                            band: De
                        })).json(),
                        M = new Map;
                    for (const D of x.data || []) M.set(D.ticker, D);
                    const F = S === "attractive" ? "Attractive" : S === "expensive" ? "Expensive" : "Neutral";
                    m = n.map(D => ({
                        ...D,
                        rv: M.get(D.ticker)
                    })).filter(D => D.rv && D.rv.label === F), re(h)
                } catch (f) {
                    re(h), W(`RV filter failed: ${f?.message??"unknown error"}. Showing all matches.`)
                }
            }
            w(m), C(!0), I(JSON.parse(JSON.stringify(k)))
        } catch (m) {
            W(m?.message ?? "Scan failed")
        } finally {
            ee(!1), Ae(null)
        }
    }

    function Ht() {
        be.current = !0
    }

    function Kt(t) {
        const a = t.conditions.map(n => ({
            ...n,
            id: Math.random().toString(36).slice(2)
        }));
        y(a), w([]), C(!1), I(null)
    }
    async function dt() {
        if (!B) {
            ee(!0), Oe([]), $e(!1), W(null), ge("Computing pairs...");
            try {
                const t = A === "pairCombo",
                    a = le.pairs;
                let n;
                if (t) {
                    if (a.length === 0) {
                        W("Select at least one pair in the leg set."), ee(!1), ge(null);
                        return
                    }
                    n = Array.from(new Set(a.flatMap(x => [x.a.toUpperCase(), x.b.toUpperCase()])))
                } else n = je.map(x => x.ticker);
                const p = n.length * (n.length - 1) / 2;
                ge(t ? `Analyzing ${a.length} selected pair${a.length!==1?"s":""} (${n.length} unique legs)...` : `Analyzing ${p} pairs across ${n.length} tickers...`);
                let f = (await (await ce("POST", "/api/pairs-screen", {
                    tickers: n,
                    metricA: U,
                    metricB: H,
                    zWindow: K,
                    betaLookback: se,
                    spreadZWindow: me,
                    olsResidWindow: pe
                })).json()).results || [];
                if (t) {
                    const x = (F, D) => [F.toUpperCase(), D.toUpperCase()].sort().join("|"),
                        M = new Set(a.map(F => x(F.a, F.b)));
                    f = f.filter(F => M.has(x(F.tickerA, F.tickerB)))
                }
                ae > 0 && (f = f.filter(x => Math.abs(x.correlation) >= ae)), ie < 9999 && (f = f.filter(x => x.halfLife !== null && x.halfLife <= ie)), ne === "extreme" ? f = f.filter(x => Math.abs(x.rawZ) >= 1.5) : ne === "mean_revert" && (f = f.filter(x => Math.abs(x.rawZ) >= 1.5 && x.halfLife !== null && x.halfLife <= 300)), Oe(f), $e(!0)
            } catch (t) {
                W(t?.message ?? "Pairs scan failed")
            } finally {
                ee(!1), ge(null)
            }
        }
    }
    const q = g.useMemo(() => {
        const t = [...he];
        return t.sort((a, n) => {
            let p, m;
            const h = Y.key;
            if (h === "absRawZ") p = Math.abs(a.rawZ ?? 0), m = Math.abs(n.rawZ ?? 0);
            else if (h === "pair") {
                const x = a.tickerA.localeCompare(n.tickerA) || a.tickerB.localeCompare(n.tickerB);
                return Y.dir === "asc" ? x : -x
            } else p = a[h] ?? (Y.dir === "asc" ? 9999 : -9999), m = n[h] ?? (Y.dir === "asc" ? 9999 : -9999);
            const f = p - m;
            return Y.dir === "asc" ? f : -f
        }), t
    }, [he, Y]);

    function Wt(t) {
        at(a => a.key === t ? {
            key: t,
            dir: a.dir === "asc" ? "desc" : "asc"
        } : {
            key: t,
            dir: t === "halfLife" ? "asc" : "desc"
        })
    }

    function qt() {
        if (q.length === 0) return;
        const t = "Ticker A,Ticker B,Ratio,Log Ratio,Raw Z,Spread Z,OLS Resid Z,Correlation,Rolling Beta,Rolling R2,Beta-Adj Spread,Half-Life,Data Points",
            a = x => x ?? "N/A",
            n = q.map(x => `${x.tickerA},${x.tickerB},${a(x.ratio)},${a(x.logRatio)},${a(x.rawZ)},${a(x.spreadZ)},${a(x.olsResidZ)},${a(x.correlation)},${a(x.rollingBeta)},${a(x.rollingR2)},${a(x.betaAdjSpread)},${a(x.halfLife)},${a(x.dataPoints)}`),
            p = [t, ...n].join(`
`),
            m = new Blob([p], {
                type: "text/csv"
            }),
            h = URL.createObjectURL(m),
            f = document.createElement("a");
        f.href = h, f.download = `pairs_screen_${U}_${H}_z${K}.csv`, f.click(), URL.revokeObjectURL(h)
    }

    function J(t) {
        Ke(a => a.key === t ? {
            key: t,
            dir: a.dir === "asc" ? "desc" : "asc"
        } : {
            key: t,
            dir: "asc"
        })
    }
    const ut = g.useMemo(() => P && P.length > 0 ? P : k, [P, k]),
        xt = g.useMemo(() => {
            if (!T || !P) return !1;
            try {
                return JSON.stringify(k) !== JSON.stringify(P)
            } catch {
                return !1
            }
        }, [T, k, P]),
        mt = g.useMemo(() => {
            const t = [...j];
            return t.sort((a, n) => {
                let p, m;
                if (R.key === "ticker" ? (p = a.ticker, m = n.ticker) : R.key === "name" ? (p = a.name, m = n.name) : R.key === "sector" ? (p = a.sector, m = n.sector) : R.key === "rv_label" ? (p = a.rv?.label ?? "", m = n.rv?.label ?? "") : R.key === "rv_prem_pct" ? (p = a.rv?.premPctile ?? -1 / 0, m = n.rv?.premPctile ?? -1 / 0) : R.key === "rv_growth_pct" ? (p = a.rv?.growthPctile ?? -1 / 0, m = n.rv?.growthPctile ?? -1 / 0) : R.key === "rv_prem_gap" ? (p = a.rv?.premGap ?? -1 / 0, m = n.rv?.premGap ?? -1 / 0) : (p = a.values[R.key] ?? -1 / 0, m = n.values[R.key] ?? -1 / 0), p === m) return a.ticker.localeCompare(n.ticker);
                const h = typeof p == "string" ? p.localeCompare(m) : p - m;
                return R.dir === "asc" ? h : -h
            }), t
        }, [j, R]),
        Jt = () => {
            const t = P ?? k,
                a = mt.map(h => {
                    const f = {
                        ticker: h.ticker,
                        name: h.name,
                        sector: h.sector
                    };
                    return t.forEach(x => {
                        f[x.leftMetric] = h.values[x.id] ?? null
                    }), S !== "all" && h.rv && (f["RV Verdict"] = h.rv.label, f["Prem Pctile"] = h.rv.premPctile ?? null, f["Growth Pctile"] = h.rv.growthPctile ?? null, f["Prem Gap %"] = h.rv.premGap ?? null, f["Implied Prem %"] = h.rv.impliedPrem ?? null, f["Today Prem %"] = h.rv.lastP ?? null, f["Today Growth Diff (pp)"] = h.rv.lastG ?? null), f
                }),
                n = Object.keys(a[0] || {}),
                p = [n.join(","), ...a.map(h => n.map(f => `"${String(h[f]??"").replace(/"/g,'""')}"`).join(","))].join(`
`),
                m = document.createElement("a");
            m.href = URL.createObjectURL(new Blob([p], {
                type: "text/csv"
            })), m.download = `screener_results_${new Date().toISOString().slice(0,10)}.csv`, m.click()
        };

    function Q({
        colKey: t
    }) {
        return R.key !== t ? e.jsx(wt, {
            size: 10,
            className: "ml-0.5 text-muted-foreground/50 inline"
        }) : R.dir === "asc" ? e.jsx(jt, {
            size: 10,
            className: "ml-0.5 text-primary inline"
        }) : e.jsx(kt, {
            size: 10,
            className: "ml-0.5 text-primary inline"
        })
    }
    const Qt = i ? `${d} / ${o} tickers` : `${o} tickers`;

    function Be({
        label: t,
        sortKey: a
    }) {
        return e.jsxs("th", {
            className: "px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap",
            onClick: () => J(a),
            "data-testid": `th-${a}`,
            children: [t, e.jsx(Q, {
                colKey: a
            })]
        })
    }

    function Xt({
        colKey: t
    }) {
        return Y.key !== t ? e.jsx(wt, {
            size: 10,
            className: "ml-0.5 text-muted-foreground/50 inline"
        }) : Y.dir === "asc" ? e.jsx(jt, {
            size: 10,
            className: "ml-0.5 text-primary inline"
        }) : e.jsx(kt, {
            size: 10,
            className: "ml-0.5 text-primary inline"
        })
    }
    return e.jsxs("div", {
        className: "flex flex-col h-full min-h-0 bg-background text-foreground",
        children: [e.jsxs("div", {
            className: "flex items-center gap-2 px-3 py-2 border-b border-border shrink-0",
            children: [e.jsx(bt, {
                size: 14,
                className: "text-muted-foreground"
            }), e.jsx("span", {
                className: "text-sm font-semibold",
                children: "Screener"
            }), e.jsxs("div", {
                className: "flex rounded overflow-hidden border border-border/60 h-7 ml-2",
                children: [e.jsxs("button", {
                    onClick: () => xe("single"),
                    className: `px-2.5 text-[10px] font-medium transition-colors flex items-center gap-1 ${A==="single"?"bg-primary text-primary-foreground":"bg-muted/20 text-muted-foreground hover:bg-muted/40"}`,
                    "data-testid": "btn-mode-single",
                    children: [e.jsx(bt, {
                        size: 10
                    }), "Single"]
                }), e.jsxs("button", {
                    onClick: () => xe("pairs"),
                    className: `px-2.5 text-[10px] font-medium transition-colors flex items-center gap-1 ${A==="pairs"?"bg-primary text-primary-foreground":"bg-muted/20 text-muted-foreground hover:bg-muted/40"}`,
                    "data-testid": "btn-mode-pairs",
                    children: [e.jsx(Ee, {
                        size: 10
                    }), "Pairs"]
                }), e.jsxs("button", {
                    onClick: () => xe("pairCombo"),
                    className: `px-2.5 text-[10px] font-medium transition-colors flex items-center gap-1 ${A==="pairCombo"?"bg-primary text-primary-foreground":"bg-muted/20 text-muted-foreground hover:bg-muted/40"}`,
                    "data-testid": "btn-mode-pairCombo",
                    children: [e.jsx(Ee, {
                        size: 10
                    }), "Pair Combo"]
                })]
            }), A === "single" && e.jsxs(Ne, {
                children: [e.jsx(we, {
                    asChild: !0,
                    children: e.jsxs(L, {
                        size: "sm",
                        variant: "outline",
                        className: "h-7 text-xs px-2 gap-1",
                        "data-testid": "btn-templates",
                        children: [e.jsx(sr, {
                            size: 12
                        }), "Load"]
                    })
                }), e.jsxs(Se, {
                    className: "w-80 p-0",
                    align: "start",
                    children: [ot.length > 0 && e.jsxs(e.Fragment, {
                        children: [e.jsx("div", {
                            className: "p-2 border-b border-border",
                            children: e.jsx("span", {
                                className: "text-[11px] font-semibold text-primary uppercase tracking-wider",
                                children: "Saved Screens"
                            })
                        }), e.jsx("div", {
                            className: "max-h-48 overflow-auto",
                            children: ot.map(t => {
                                let a = 0;
                                try {
                                    a = JSON.parse(t.conditions).length
                                } catch {}
                                return e.jsxs("div", {
                                    className: "flex items-center gap-1 px-3 py-2 hover:bg-muted/30 transition-colors border-b border-border/20 last:border-0 group",
                                    children: [e.jsxs("button", {
                                        onClick: () => Et(t),
                                        className: "flex-1 text-left min-w-0",
                                        "data-testid": `btn-preset-${t.id}`,
                                        children: [e.jsx("div", {
                                            className: "text-xs font-medium text-foreground truncate",
                                            children: t.label
                                        }), e.jsxs("div", {
                                            className: "text-[10px] text-muted-foreground mt-0.5",
                                            children: [a, " condition", a !== 1 ? "s" : ""]
                                        })]
                                    }), e.jsx("button", {
                                        onClick: n => {
                                            n.stopPropagation(), Bt.mutate(t.id)
                                        },
                                        className: "shrink-0 h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all",
                                        "data-testid": `btn-delete-preset-${t.id}`,
                                        title: "Delete saved screen",
                                        children: e.jsx(ar, {
                                            size: 11
                                        })
                                    })]
                                }, t.id)
                            })
                        })]
                    }), e.jsx("div", {
                        className: "p-2 border-b border-border",
                        children: e.jsx("span", {
                            className: "text-[11px] font-semibold text-muted-foreground uppercase tracking-wider",
                            children: "Built-in Templates"
                        })
                    }), e.jsx("div", {
                        className: "max-h-48 overflow-auto",
                        children: Vr.map((t, a) => e.jsxs("button", {
                            onClick: () => Kt(t),
                            className: "w-full text-left px-3 py-2 hover:bg-muted/30 transition-colors border-b border-border/20 last:border-0",
                            "data-testid": `btn-template-${a}`,
                            children: [e.jsx("div", {
                                className: "text-xs font-medium text-foreground",
                                children: t.name
                            }), e.jsx("div", {
                                className: "text-[10px] text-muted-foreground mt-0.5",
                                children: t.description
                            })]
                        }, a))
                    })]
                })]
            }), A === "single" && e.jsxs(Ne, {
                open: Lt,
                onOpenChange: it,
                children: [e.jsx(we, {
                    asChild: !0,
                    children: e.jsxs(L, {
                        size: "sm",
                        variant: "outline",
                        className: "h-7 text-xs px-2 gap-1",
                        disabled: k.length === 0,
                        "data-testid": "btn-save-screen",
                        children: [e.jsx(ir, {
                            size: 12
                        }), "Save"]
                    })
                }), e.jsxs(Se, {
                    className: "w-64 p-3",
                    align: "start",
                    children: [e.jsx("div", {
                        className: "text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2",
                        children: "Save Current Screen"
                    }), e.jsxs("div", {
                        className: "flex gap-1.5",
                        children: [e.jsx(O, {
                            value: Ie,
                            onChange: t => nt(t.target.value),
                            placeholder: "Screen name…",
                            className: "h-7 text-xs flex-1",
                            onKeyDown: t => {
                                t.key === "Enter" && ct()
                            },
                            autoFocus: !0,
                            "data-testid": "input-save-name"
                        }), e.jsx(L, {
                            size: "sm",
                            className: "h-7 text-xs px-3",
                            disabled: !Ie.trim() || Ye.isPending,
                            onClick: ct,
                            "data-testid": "btn-confirm-save",
                            children: Ye.isPending ? "…" : "Save"
                        })]
                    }), e.jsxs("div", {
                        className: "text-[10px] text-muted-foreground mt-1.5",
                        children: ["Saves ", k.length, " condition", k.length !== 1 ? "s" : ""]
                    })]
                })]
            }), e.jsx("div", {
                className: "flex-1"
            }), A === "single" && e.jsxs(Ne, {
                children: [e.jsx(we, {
                    asChild: !0,
                    children: e.jsxs("button", {
                        className: `flex items-center gap-1 text-[10px] h-5 px-1.5 rounded border transition-colors ${S!=="all"?S==="attractive"?"border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400":S==="expensive"?"border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400":"border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400":"border-border text-muted-foreground hover:text-foreground"}`,
                        "data-testid": "btn-toggle-rv-filter",
                        title: "Filter results by Relative Value verdict (cross-sectional vs peer group)",
                        children: [e.jsx(nr, {
                            size: 9
                        }), "RV: ", S === "all" ? "Off" : S === "attractive" ? "Attractive" : S === "expensive" ? "Expensive" : "Neutral", e.jsx(Ge, {
                            size: 9
                        })]
                    })
                }), e.jsxs(Se, {
                    className: "w-72 p-3",
                    align: "end",
                    children: [e.jsx("div", {
                        className: "text-xs font-semibold mb-2",
                        children: "RV Verdict Filter"
                    }), e.jsx("div", {
                        className: "text-[10px] text-muted-foreground mb-3 leading-relaxed",
                        children: "Cross-sectional value: combines today's premium-vs-peers percentile (conditional on growth) and growth percentile (conditional on premium). Applied AFTER your other conditions."
                    }), e.jsx("div", {
                        className: "text-[10px] text-muted-foreground mb-1",
                        children: "Show only"
                    }), e.jsx("div", {
                        className: "flex gap-1 mb-3",
                        children: [{
                            v: "all",
                            label: "All",
                            cls: ""
                        }, {
                            v: "attractive",
                            label: "Attractive",
                            cls: "data-[active=true]:bg-emerald-500/15 data-[active=true]:border-emerald-500/50 data-[active=true]:text-emerald-700 dark:data-[active=true]:text-emerald-400"
                        }, {
                            v: "neutral",
                            label: "Neutral",
                            cls: "data-[active=true]:bg-amber-500/15 data-[active=true]:border-amber-500/50 data-[active=true]:text-amber-700 dark:data-[active=true]:text-amber-400"
                        }, {
                            v: "expensive",
                            label: "Expensive",
                            cls: "data-[active=true]:bg-rose-500/15 data-[active=true]:border-rose-500/50 data-[active=true]:text-rose-700 dark:data-[active=true]:text-rose-400"
                        }].map(t => e.jsx("button", {
                            "data-active": S === t.v,
                            onClick: () => Ce(t.v),
                            className: `flex-1 text-[10px] h-6 px-1 rounded border border-border transition-colors hover:bg-muted ${t.cls}`,
                            "data-testid": `btn-rv-filter-${t.v}`,
                            children: t.label
                        }, t.v))
                    }), e.jsxs("div", {
                        className: "border-t border-border pt-2 space-y-2",
                        children: [e.jsxs("div", {
                            children: [e.jsx("div", {
                                className: "text-[10px] text-muted-foreground mb-1",
                                children: "Peer dimension"
                            }), e.jsxs(E, {
                                value: Z,
                                onValueChange: Pe,
                                children: [e.jsx(V, {
                                    className: "h-7 text-[11px]",
                                    "data-testid": "select-rv-dimension",
                                    children: e.jsx(z, {})
                                }), e.jsxs(_, {
                                    children: [e.jsx(N, {
                                        value: "subsector",
                                        children: "Sub-industry"
                                    }), e.jsx(N, {
                                        value: "sector",
                                        children: "Sector"
                                    })]
                                })]
                            })]
                        }), e.jsxs("div", {
                            children: [e.jsx("div", {
                                className: "text-[10px] text-muted-foreground mb-1",
                                children: "Valuation metric"
                            }), e.jsxs(E, {
                                value: Ue,
                                onValueChange: $t,
                                children: [e.jsx(V, {
                                    className: "h-7 text-[11px]",
                                    "data-testid": "select-rv-val",
                                    children: e.jsx(z, {})
                                }), e.jsxs(_, {
                                    children: [e.jsx(N, {
                                        value: "P/FFO FY2",
                                        children: "P/FFO FY2"
                                    }), e.jsx(N, {
                                        value: "P/FFO LTM",
                                        children: "P/FFO LTM"
                                    }), e.jsx(N, {
                                        value: "P/AFFO FY2",
                                        children: "P/AFFO FY2"
                                    }), e.jsx(N, {
                                        value: "EV/EBITDA FY2",
                                        children: "EV/EBITDA FY2"
                                    }), e.jsx(N, {
                                        value: "EV/EBITDA LTM",
                                        children: "EV/EBITDA LTM"
                                    }), e.jsx(N, {
                                        value: "P/E FY2",
                                        children: "P/E FY2"
                                    }), e.jsx(N, {
                                        value: "P/E LTM",
                                        children: "P/E LTM"
                                    }), e.jsx(N, {
                                        value: "Dividend Yield",
                                        children: "Dividend Yield"
                                    }), e.jsx(N, {
                                        value: "FFO Yield FY2",
                                        children: "FFO Yield FY2"
                                    }), e.jsx(N, {
                                        value: "AFFO Yield FY2",
                                        children: "AFFO Yield FY2"
                                    })]
                                })]
                            })]
                        }), e.jsxs("div", {
                            children: [e.jsx("div", {
                                className: "text-[10px] text-muted-foreground mb-1",
                                children: "Growth metric"
                            }), e.jsxs(E, {
                                value: He,
                                onValueChange: It,
                                children: [e.jsx(V, {
                                    className: "h-7 text-[11px]",
                                    "data-testid": "select-rv-growth",
                                    children: e.jsx(z, {})
                                }), e.jsxs(_, {
                                    children: [e.jsx(N, {
                                        value: "FY1 FFO Growth",
                                        children: "FY1 FFO Growth"
                                    }), e.jsx(N, {
                                        value: "FY2 FFO Growth",
                                        children: "FY2 FFO Growth"
                                    }), e.jsx(N, {
                                        value: "FY2 AFFO Growth",
                                        children: "FY2 AFFO Growth"
                                    }), e.jsx(N, {
                                        value: "FY1 EPS Growth",
                                        children: "FY1 EPS Growth"
                                    }), e.jsx(N, {
                                        value: "FY2 EPS Growth",
                                        children: "FY2 EPS Growth"
                                    }), e.jsx(N, {
                                        value: "EBITDA FY2 Growth%",
                                        children: "EBITDA FY2 Growth"
                                    }), e.jsx(N, {
                                        value: "Sales LTM YoY%",
                                        children: "Sales LTM YoY%"
                                    })]
                                })]
                            })]
                        }), e.jsxs("div", {
                            children: [e.jsxs("div", {
                                className: "text-[10px] text-muted-foreground mb-1",
                                children: ["Conditional band: ±", De.toFixed(2), "σ"]
                            }), e.jsxs(E, {
                                value: String(De),
                                onValueChange: t => Yt(parseFloat(t)),
                                children: [e.jsx(V, {
                                    className: "h-7 text-[11px]",
                                    "data-testid": "select-rv-band",
                                    children: e.jsx(z, {})
                                }), e.jsxs(_, {
                                    children: [e.jsx(N, {
                                        value: "0.25",
                                        children: "±0.25σ (tight)"
                                    }), e.jsx(N, {
                                        value: "0.5",
                                        children: "±0.50σ"
                                    }), e.jsx(N, {
                                        value: "0.75",
                                        children: "±0.75σ"
                                    }), e.jsx(N, {
                                        value: "1",
                                        children: "±1.00σ (wide)"
                                    })]
                                })]
                            })]
                        })]
                    })]
                })]
            }), e.jsxs("button", {
                onClick: () => G(!$),
                className: `flex items-center gap-1 text-[10px] h-5 px-1.5 rounded border transition-colors ${i?"border-primary/50 bg-primary/10 text-primary":"border-border text-muted-foreground hover:text-foreground"}`,
                "data-testid": "btn-toggle-universe",
                children: [e.jsx(lr, {
                    size: 9
                }), Qt, e.jsx(Ge, {
                    size: 9,
                    className: `transition-transform ${$?"rotate-180":""}`
                })]
            }), B ? e.jsxs(L, {
                size: "sm",
                variant: "outline",
                className: "h-7 text-xs px-3",
                onClick: Ht,
                "data-testid": "btn-cancel",
                children: [e.jsx(Ct, {
                    size: 12,
                    className: "mr-1"
                }), "Cancel"]
            }) : A === "single" ? e.jsxs(L, {
                size: "sm",
                className: "h-7 text-xs px-3 gap-1",
                onClick: Le,
                disabled: k.length === 0,
                "data-testid": "btn-run-screen",
                children: [e.jsx(ye, {
                    size: 12
                }), "Run Screen"]
            }) : e.jsxs(L, {
                size: "sm",
                className: "h-7 text-xs px-3 gap-1",
                onClick: dt,
                "data-testid": "btn-run-pairs-screen",
                children: [e.jsx(ye, {
                    size: 12
                }), "Run Pairs Screen"]
            })]
        }), $ && e.jsx("div", {
            className: "px-3 py-1.5 border-b border-border shrink-0 bg-muted/10",
            children: e.jsx(or, {
                filters: b,
                onFiltersChange: c,
                search: u,
                onSearchChange: l,
                manualTickers: s,
                onManualTickersChange: v,
                filteredCount: d,
                totalCount: o,
                testIdPrefix: "screener-universe"
            })
        }), A === "single" && e.jsxs(e.Fragment, {
            children: [e.jsxs("div", {
                className: "px-3 pt-2 pb-2 border-b border-border shrink-0 bg-muted/5",
                children: [e.jsx("div", {
                    className: "flex flex-col gap-1.5",
                    children: k.map((t, a) => e.jsx(qr, {
                        condition: t,
                        index: a,
                        onChange: n => Gt(t.id, n),
                        onRemove: () => Ut(t.id),
                        tickers: ve
                    }, t.id))
                }), e.jsxs("button", {
                    onClick: Zt,
                    className: "mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors",
                    "data-testid": "btn-add-condition",
                    children: [e.jsx(cr, {
                        size: 12
                    }), "Add condition"]
                })]
            }), k.length > 0 && e.jsxs("div", {
                className: "px-3 py-1.5 border-b border-border/40 flex flex-wrap gap-1.5 items-center shrink-0",
                children: [e.jsx("span", {
                    className: "text-[10px] text-muted-foreground mr-0.5",
                    children: "Screening for:"
                }), k.map(t => e.jsx($r, {
                    variant: "secondary",
                    className: "text-[10px] h-5 px-1.5 font-normal max-w-xs truncate",
                    title: Ze(t),
                    children: Ze(t)
                }, t.id))]
            }), B && te && e.jsx("div", {
                className: "px-3 py-2 border-b border-border/40 shrink-0",
                children: e.jsxs("div", {
                    className: "flex items-center gap-2",
                    children: [e.jsx("div", {
                        className: "flex-1 h-1 bg-muted rounded-full overflow-hidden",
                        children: e.jsx("div", {
                            className: "h-full bg-primary transition-all duration-300 rounded-full",
                            style: {
                                width: `${te.done/te.total*100}%`
                            }
                        })
                    }), e.jsxs("span", {
                        className: "text-[10px] text-muted-foreground whitespace-nowrap",
                        children: ["Scanning ", te.done, " of ", te.total, " tickers…"]
                    })]
                })
            }), ue && A === "single" && e.jsxs("div", {
                className: "px-3 py-2 border-b border-destructive/30 flex items-center gap-2 text-xs text-destructive shrink-0",
                children: [e.jsx(oe, {
                    size: 13
                }), ue]
            }), e.jsxs("div", {
                className: "flex-1 overflow-auto min-h-0",
                children: [!T && !B && e.jsxs("div", {
                    className: "flex flex-col items-center justify-center h-full gap-3 text-muted-foreground",
                    children: [e.jsx("div", {
                        className: "w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center",
                        children: e.jsx(dr, {
                            size: 18,
                            className: "text-muted-foreground/60"
                        })
                    }), e.jsxs("div", {
                        className: "text-center",
                        children: [e.jsx("p", {
                            className: "text-sm font-medium text-foreground/70",
                            children: "Define conditions and run the screen"
                        }), e.jsx("p", {
                            className: "text-xs text-muted-foreground mt-0.5",
                            children: "All conditions are AND-ed. Use Lookback to find tickers where a condition was true at any point in a time window."
                        })]
                    }), e.jsxs(L, {
                        size: "sm",
                        className: "gap-1 text-xs mt-1",
                        onClick: Le,
                        "data-testid": "btn-run-empty-state",
                        children: [e.jsx(ye, {
                            size: 12
                        }), "Run Screen"]
                    })]
                }), T && !B && e.jsxs("div", {
                    className: "flex flex-col h-full min-h-0",
                    children: [e.jsxs("div", {
                        className: "px-3 py-1.5 border-b border-border/40 flex items-center gap-2 shrink-0 flex-wrap",
                        children: [e.jsxs("span", {
                            className: "text-[11px] font-semibold text-foreground",
                            "data-testid": "text-match-count",
                            children: [j.length, " of ", je.length, " tickers match"]
                        }), j.length > 0 && e.jsx(ur, {
                            size: 12,
                            className: "text-muted-foreground"
                        }), j.length === 0 && e.jsx("span", {
                            className: "text-[11px] text-muted-foreground",
                            children: "— no tickers pass all conditions"
                        }), Te && e.jsx("span", {
                            className: "text-[10px] text-muted-foreground",
                            children: Te
                        }), xt && e.jsxs("button", {
                            onClick: Le,
                            className: "ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors",
                            title: "Filters have changed since the last run. Click to re-run.",
                            "data-testid": "banner-stale-results",
                            children: [e.jsx(oe, {
                                size: 10
                            }), " Filters changed — re-run"]
                        }), j.length > 0 && e.jsx(L, {
                            variant: "outline",
                            size: "sm",
                            className: `h-6 gap-1 text-[11px] ${xt?"":"ml-auto"}`,
                            onClick: Jt,
                            "data-testid": "export-csv",
                            children: e.jsx(vt, {
                                className: "w-3 h-3"
                            })
                        })]
                    }), j.length === 0 ? e.jsxs("div", {
                        className: "flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground",
                        children: [e.jsx(oe, {
                            size: 18,
                            className: "text-muted-foreground/50"
                        }), e.jsx("p", {
                            className: "text-xs",
                            children: "No tickers matched all conditions. Try relaxing your criteria."
                        })]
                    }) : e.jsx("div", {
                        className: "overflow-auto flex-1 min-h-0",
                        children: e.jsxs("table", {
                            className: "w-full text-xs border-separate border-spacing-0",
                            children: [e.jsx("thead", {
                                className: "sticky top-0 z-10 bg-background",
                                children: e.jsxs("tr", {
                                    className: "border-b border-border",
                                    children: [e.jsx(Be, {
                                        label: "Ticker",
                                        sortKey: "ticker"
                                    }), e.jsx(Be, {
                                        label: "Name",
                                        sortKey: "name"
                                    }), e.jsx(Be, {
                                        label: "Sector",
                                        sortKey: "sector"
                                    }), ut.map(t => {
                                        const a = (t.lookbackMode ?? "now") !== "now";
                                        return [e.jsxs("th", {
                                            className: "px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap",
                                            onClick: () => J(t.id),
                                            "data-testid": `th-cond-${t.id}`,
                                            title: Ze(t),
                                            children: [e.jsx("span", {
                                                className: "truncate block max-w-[120px] text-right ml-auto",
                                                children: t.leftIndicator ? `${t.leftIndicator.type}(${t.leftIndicator.period})` : t.leftMetric
                                            }), e.jsx(Q, {
                                                colKey: t.id
                                            })]
                                        }, t.id), a && e.jsx("th", {
                                            className: "px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap",
                                            title: "Most recent date when condition was true",
                                            children: "Match Date"
                                        }, `${t.id}-date`)]
                                    }), S !== "all" && e.jsxs(e.Fragment, {
                                        children: [e.jsxs("th", {
                                            className: "px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap",
                                            onClick: () => J("rv_label"),
                                            title: "Relative Value verdict (cross-sectional vs peers)",
                                            "data-testid": "th-rv-label",
                                            children: ["Verdict ", e.jsx(Q, {
                                                colKey: "rv_label"
                                            })]
                                        }), e.jsxs("th", {
                                            className: "px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap",
                                            onClick: () => J("rv_prem_pct"),
                                            title: "Premium percentile within peers at similar growth (lower = cheaper)",
                                            "data-testid": "th-rv-prem-pct",
                                            children: ["Prem %ile ", e.jsx(Q, {
                                                colKey: "rv_prem_pct"
                                            })]
                                        }), e.jsxs("th", {
                                            className: "px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap",
                                            onClick: () => J("rv_growth_pct"),
                                            title: "Growth percentile within peers at similar premium (higher = stronger)",
                                            "data-testid": "th-rv-growth-pct",
                                            children: ["Growth %ile ", e.jsx(Q, {
                                                colKey: "rv_growth_pct"
                                            })]
                                        }), e.jsxs("th", {
                                            className: "px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap",
                                            onClick: () => J("rv_prem_gap"),
                                            title: "Today's premium minus the median premium of peers at similar growth (negative = below fair)",
                                            "data-testid": "th-rv-prem-gap",
                                            children: ["Prem Gap ", e.jsx(Q, {
                                                colKey: "rv_prem_gap"
                                            })]
                                        })]
                                    })]
                                })
                            }), e.jsx("tbody", {
                                children: mt.map((t, a) => e.jsxs("tr", {
                                    className: `border-b border-border/30 hover:bg-muted/20 transition-colors ${a%2===0?"":"bg-muted/5"}`,
                                    "data-testid": `row-ticker-${t.ticker}`,
                                    children: [e.jsx("td", {
                                        className: "px-2 py-1.5 whitespace-nowrap",
                                        children: e.jsx(xr, {
                                            href: "/",
                                            children: e.jsx("span", {
                                                className: "font-mono font-semibold text-primary hover:underline cursor-pointer",
                                                "data-testid": `link-ticker-${t.ticker}`,
                                                children: t.ticker
                                            })
                                        })
                                    }), e.jsx("td", {
                                        className: "px-2 py-1.5 text-muted-foreground max-w-[180px] truncate",
                                        title: t.name,
                                        "data-testid": `text-name-${t.ticker}`,
                                        children: t.name
                                    }), e.jsx("td", {
                                        className: "px-2 py-1.5 text-muted-foreground whitespace-nowrap",
                                        "data-testid": `text-sector-${t.ticker}`,
                                        children: t.sector || t.subsector || "—"
                                    }), ut.map((n, p) => {
                                        let m = t.values[n.id];
                                        if (m === void 0) {
                                            const M = Object.keys(t.values);
                                            p < M.length && (m = t.values[M[p]])
                                        }
                                        const h = Gr(m, n.leftMetric),
                                            f = (n.lookbackMode ?? "now") !== "now",
                                            x = t.matchDates?.[n.id];
                                        return [e.jsx("td", {
                                            className: "px-2 py-1.5 text-right font-mono tabular-nums text-foreground",
                                            "data-testid": `val-${t.ticker}-${n.id}`,
                                            children: h
                                        }, n.id), f && e.jsx("td", {
                                            className: "px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground text-[10px]",
                                            children: x ?? "—"
                                        }, `${n.id}-date`)]
                                    }), S !== "all" && e.jsxs(e.Fragment, {
                                        children: [e.jsx("td", {
                                            className: "px-2 py-1.5 whitespace-nowrap",
                                            "data-testid": `rv-label-${t.ticker}`,
                                            children: t.rv ? e.jsx("span", {
                                                className: `inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${t.rv.label==="Attractive"?"bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30":t.rv.label==="Expensive"?"bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30":"bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"}`,
                                                title: t.rv.rationale || "",
                                                children: t.rv.label
                                            }) : e.jsx("span", {
                                                className: "text-muted-foreground text-[10px]",
                                                children: "—"
                                            })
                                        }), e.jsx("td", {
                                            className: "px-2 py-1.5 text-right font-mono tabular-nums text-foreground",
                                            "data-testid": `rv-prem-pct-${t.ticker}`,
                                            children: t.rv?.premPctile != null ? t.rv.premPctile.toFixed(0) : "—"
                                        }), e.jsx("td", {
                                            className: "px-2 py-1.5 text-right font-mono tabular-nums text-foreground",
                                            "data-testid": `rv-growth-pct-${t.ticker}`,
                                            children: t.rv?.growthPctile != null ? t.rv.growthPctile.toFixed(0) : "—"
                                        }), e.jsx("td", {
                                            className: "px-2 py-1.5 text-right font-mono tabular-nums text-foreground",
                                            "data-testid": `rv-prem-gap-${t.ticker}`,
                                            children: t.rv?.premGap != null ? `${t.rv.premGap>0?"+":""}${t.rv.premGap.toFixed(1)}%` : "—"
                                        })]
                                    })]
                                }, t.ticker))
                            })]
                        })
                    })]
                })]
            })]
        }), (A === "pairs" || A === "pairCombo") && e.jsxs(e.Fragment, {
            children: [A === "pairCombo" && e.jsxs("div", {
                className: "px-3 pt-2 pb-2 border-b border-border shrink-0 bg-muted/5",
                children: [e.jsx("label", {
                    className: "text-[9px] font-mono text-muted-foreground uppercase tracking-wider block mb-1",
                    children: "Pair Combo — Leg Set"
                }), le.ui]
            }), e.jsxs("div", {
                className: "px-3 pt-2 pb-2 border-b border-border shrink-0 bg-muted/5",
                children: [e.jsxs("div", {
                    className: "flex flex-wrap items-center gap-x-3 gap-y-2",
                    children: [e.jsxs("div", {
                        className: "flex items-center gap-1.5",
                        children: [e.jsx("span", {
                            className: "text-[10px] text-muted-foreground font-medium uppercase tracking-wider",
                            children: "Metric A"
                        }), e.jsx(de, {
                            value: U,
                            onChange: We,
                            width: 138
                        })]
                    }), e.jsxs("div", {
                        className: "flex items-center gap-1.5",
                        children: [e.jsx("span", {
                            className: "text-[10px] text-muted-foreground font-medium uppercase tracking-wider",
                            children: "Metric B"
                        }), e.jsx(de, {
                            value: H,
                            onChange: qe,
                            width: 138
                        })]
                    }), e.jsxs("div", {
                        className: "flex items-center gap-1.5",
                        children: [e.jsx("span", {
                            className: "text-[10px] text-muted-foreground font-medium uppercase tracking-wider",
                            children: "Z-Window"
                        }), e.jsx("div", {
                            className: "flex rounded overflow-hidden border border-border/60 h-7",
                            children: [20, 60, 120, 250].map(t => e.jsxs("button", {
                                onClick: () => Re(t),
                                className: `px-2 text-[10px] font-medium transition-colors ${K===t?"bg-primary text-primary-foreground":"bg-muted/20 text-muted-foreground hover:bg-muted/40"}`,
                                "data-testid": `btn-pairs-z-${t}`,
                                children: [t, "d"]
                            }, t))
                        }), e.jsx(O, {
                            type: "number",
                            min: 5,
                            max: 2e3,
                            value: K,
                            onChange: t => Re(Math.max(5, parseInt(t.target.value) || 60)),
                            className: "h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1",
                            "data-testid": "input-pairs-z-window"
                        })]
                    })]
                }), e.jsxs("div", {
                    className: "flex flex-wrap items-center gap-x-3 gap-y-2 mt-2",
                    children: [e.jsxs("div", {
                        className: "flex items-center gap-1.5",
                        children: [e.jsx("span", {
                            className: "text-[10px] text-muted-foreground font-medium uppercase tracking-wider",
                            children: "β Lookback"
                        }), e.jsx(O, {
                            type: "number",
                            min: 5,
                            max: 2e3,
                            value: se,
                            onChange: t => Je(Math.max(5, parseInt(t.target.value) || 52)),
                            className: "h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1",
                            "data-testid": "input-pairs-beta-lookback"
                        })]
                    }), e.jsxs("div", {
                        className: "flex items-center gap-1.5",
                        children: [e.jsx("span", {
                            className: "text-[10px] text-muted-foreground font-medium uppercase tracking-wider",
                            children: "Spread Z Win"
                        }), e.jsx(O, {
                            type: "number",
                            min: 2,
                            max: 500,
                            value: me,
                            onChange: t => Qe(Math.max(2, parseInt(t.target.value) || 8)),
                            className: "h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1",
                            "data-testid": "input-pairs-spread-z-window"
                        })]
                    }), e.jsxs("div", {
                        className: "flex items-center gap-1.5",
                        children: [e.jsx("span", {
                            className: "text-[10px] text-muted-foreground font-medium uppercase tracking-wider",
                            children: "OLS Win"
                        }), e.jsx(O, {
                            type: "number",
                            min: 5,
                            max: 2e3,
                            value: pe,
                            onChange: t => Xe(Math.max(5, parseInt(t.target.value) || 52)),
                            className: "h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1",
                            "data-testid": "input-pairs-ols-window"
                        })]
                    }), e.jsxs("div", {
                        className: "flex items-center gap-1.5",
                        children: [e.jsx("span", {
                            className: "text-[10px] text-muted-foreground font-medium uppercase tracking-wider",
                            children: "Min Corr"
                        }), e.jsx(O, {
                            type: "number",
                            step: .05,
                            min: 0,
                            max: 1,
                            value: ae,
                            onChange: t => et(Math.max(0, Math.min(1, parseFloat(t.target.value) || 0))),
                            className: "h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1",
                            "data-testid": "input-pairs-min-corr"
                        })]
                    }), e.jsxs("div", {
                        className: "flex items-center gap-1.5",
                        children: [e.jsx("span", {
                            className: "text-[10px] text-muted-foreground font-medium uppercase tracking-wider",
                            children: "Max HL"
                        }), e.jsx(O, {
                            type: "number",
                            min: 1,
                            max: 9999,
                            value: ie,
                            onChange: t => tt(Math.max(1, parseInt(t.target.value) || 500)),
                            className: "h-7 w-14 text-[11px] bg-muted/20 border-border text-center px-1",
                            "data-testid": "input-pairs-max-half-life"
                        })]
                    }), e.jsxs("div", {
                        className: "flex items-center gap-1.5",
                        children: [e.jsx("span", {
                            className: "text-[10px] text-muted-foreground font-medium uppercase tracking-wider",
                            children: "Filter"
                        }), e.jsx("div", {
                            className: "flex rounded overflow-hidden border border-border/60 h-7",
                            children: ["all", "extreme", "mean_revert"].map(t => e.jsx("button", {
                                onClick: () => rt(t),
                                className: `px-2 text-[10px] font-medium transition-colors ${ne===t?"bg-primary text-primary-foreground":"bg-muted/20 text-muted-foreground hover:bg-muted/40"}`,
                                "data-testid": `btn-pairs-filter-${t}`,
                                children: t === "all" ? "All" : t === "extreme" ? "|Z| ≥ 1.5" : "Mean Revert"
                            }, t))
                        })]
                    })]
                })]
            }), B && st && e.jsx("div", {
                className: "px-3 py-2 border-b border-border/40 shrink-0",
                children: e.jsxs("div", {
                    className: "flex items-center gap-2",
                    children: [e.jsx("div", {
                        className: "animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full"
                    }), e.jsx("span", {
                        className: "text-[10px] text-muted-foreground",
                        children: st
                    })]
                })
            }), ue && (A === "pairs" || A === "pairCombo") && e.jsxs("div", {
                className: "px-3 py-2 border-b border-destructive/30 flex items-center gap-2 text-xs text-destructive shrink-0",
                children: [e.jsx(oe, {
                    size: 13
                }), ue]
            }), e.jsxs("div", {
                className: "flex-1 overflow-auto min-h-0",
                children: [!fe && !B && e.jsxs("div", {
                    className: "flex flex-col items-center justify-center h-full gap-3 text-muted-foreground",
                    children: [e.jsx("div", {
                        className: "w-10 h-10 rounded-full bg-muted/30 flex items-center justify-center",
                        children: e.jsx(Ee, {
                            size: 18,
                            className: "text-muted-foreground/60"
                        })
                    }), e.jsxs("div", {
                        className: "text-center",
                        children: [e.jsx("p", {
                            className: "text-sm font-medium text-foreground/70",
                            children: "Pairs screening"
                        }), e.jsx("p", {
                            className: "text-xs text-muted-foreground mt-0.5",
                            children: "Ratio, Log Ratio, Raw Z, Spread Z, OLS Resid Z, Correlation, Beta, R², Beta-Adj Spread, Half-Life"
                        })]
                    }), e.jsxs(L, {
                        size: "sm",
                        className: "gap-1 text-xs mt-1",
                        onClick: dt,
                        "data-testid": "btn-run-pairs-empty-state",
                        children: [e.jsx(ye, {
                            size: 12
                        }), "Run Pairs Screen"]
                    })]
                }), fe && !B && e.jsxs("div", {
                    className: "flex flex-col h-full min-h-0",
                    children: [e.jsxs("div", {
                        className: "px-3 py-1.5 border-b border-border/40 flex items-center gap-2 shrink-0",
                        children: [e.jsxs("span", {
                            className: "text-[11px] font-semibold text-foreground",
                            "data-testid": "text-pairs-count",
                            children: [q.length, " pairs"]
                        }), e.jsxs("span", {
                            className: "text-[10px] text-muted-foreground",
                            children: ["(", U, U !== H ? ` / ${H}` : "", ", z", K, "d, β", se, "d)"]
                        }), e.jsx("div", {
                            className: "flex-1"
                        }), q.length > 0 && e.jsxs(L, {
                            size: "sm",
                            variant: "outline",
                            className: "h-6 text-[10px] px-2 gap-1",
                            onClick: qt,
                            "data-testid": "btn-export-pairs-csv",
                            children: [e.jsx(vt, {
                                size: 10
                            }), "CSV"]
                        })]
                    }), q.length === 0 ? e.jsxs("div", {
                        className: "flex flex-col items-center justify-center flex-1 gap-2 text-muted-foreground",
                        children: [e.jsx(oe, {
                            size: 18,
                            className: "text-muted-foreground/50"
                        }), e.jsx("p", {
                            className: "text-xs",
                            children: "No pairs matched the current filters. Try relaxing correlation or half-life thresholds."
                        })]
                    }) : e.jsx("div", {
                        className: "overflow-auto flex-1 min-h-0",
                        children: e.jsxs("table", {
                            className: "w-full text-xs border-separate border-spacing-0",
                            children: [e.jsx("thead", {
                                className: "sticky top-0 z-10 bg-background",
                                children: e.jsx("tr", {
                                    className: "border-b border-border",
                                    children: [{
                                        key: "pair",
                                        label: "Pair",
                                        align: "left"
                                    }, {
                                        key: "ratio",
                                        label: "Ratio"
                                    }, {
                                        key: "logRatio",
                                        label: "Log Ratio"
                                    }, {
                                        key: "rawZ",
                                        label: "Raw Z"
                                    }, {
                                        key: "absRawZ",
                                        label: "|Raw Z|"
                                    }, {
                                        key: "spreadZ",
                                        label: "Spread Z"
                                    }, {
                                        key: "olsResidZ",
                                        label: "OLS Z"
                                    }, {
                                        key: "correlation",
                                        label: "Corr"
                                    }, {
                                        key: "rollingBeta",
                                        label: "Beta"
                                    }, {
                                        key: "rollingR2",
                                        label: "R²"
                                    }, {
                                        key: "betaAdjSpread",
                                        label: "β-Adj Sprd"
                                    }, {
                                        key: "halfLife",
                                        label: "Half-Life"
                                    }, {
                                        key: "dataPoints",
                                        label: "Pts"
                                    }].map(t => e.jsxs("th", {
                                        className: `px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground whitespace-nowrap ${t.align==="left"?"text-left":"text-right"}`,
                                        onClick: () => Wt(t.key),
                                        "data-testid": `th-${t.key}`,
                                        children: [t.label, " ", e.jsx(Xt, {
                                            colKey: t.key
                                        })]
                                    }, t.key))
                                })
                            }), e.jsx("tbody", {
                                children: q.map((t, a) => {
                                    const n = m => {
                                            if (m === null) return "text-muted-foreground";
                                            const h = Math.abs(m);
                                            return h >= 2 ? "text-red-400" : h >= 1.5 ? "text-amber-400" : "text-foreground"
                                        },
                                        p = (m, h = 2) => m != null ? Number(m).toFixed(h) : "—";
                                    return e.jsxs("tr", {
                                        className: `border-b border-border/30 hover:bg-muted/20 transition-colors ${a%2===0?"":"bg-muted/5"}`,
                                        "data-testid": `row-pair-${t.tickerA}-${t.tickerB}`,
                                        children: [e.jsxs("td", {
                                            className: "px-1.5 py-1.5 whitespace-nowrap",
                                            children: [e.jsx("span", {
                                                className: "font-mono font-semibold text-primary",
                                                children: t.tickerA
                                            }), e.jsx("span", {
                                                className: "text-muted-foreground mx-0.5",
                                                children: "/"
                                            }), e.jsx("span", {
                                                className: "font-mono font-semibold text-primary",
                                                children: t.tickerB
                                            })]
                                        }), e.jsx("td", {
                                            className: "px-1.5 py-1.5 text-right font-mono tabular-nums",
                                            children: p(t.ratio, 3)
                                        }), e.jsx("td", {
                                            className: "px-1.5 py-1.5 text-right font-mono tabular-nums",
                                            children: p(t.logRatio, 4)
                                        }), e.jsx("td", {
                                            className: `px-1.5 py-1.5 text-right font-mono tabular-nums ${n(t.rawZ)}`,
                                            children: p(t.rawZ)
                                        }), e.jsx("td", {
                                            className: `px-1.5 py-1.5 text-right font-mono tabular-nums ${n(t.rawZ)}`,
                                            children: t.rawZ !== null ? Math.abs(t.rawZ).toFixed(2) : "—"
                                        }), e.jsx("td", {
                                            className: `px-1.5 py-1.5 text-right font-mono tabular-nums ${n(t.spreadZ)}`,
                                            children: p(t.spreadZ)
                                        }), e.jsx("td", {
                                            className: `px-1.5 py-1.5 text-right font-mono tabular-nums ${n(t.olsResidZ)}`,
                                            children: p(t.olsResidZ)
                                        }), e.jsx("td", {
                                            className: "px-1.5 py-1.5 text-right font-mono tabular-nums",
                                            children: p(t.correlation, 3)
                                        }), e.jsx("td", {
                                            className: "px-1.5 py-1.5 text-right font-mono tabular-nums",
                                            children: p(t.rollingBeta, 3)
                                        }), e.jsx("td", {
                                            className: "px-1.5 py-1.5 text-right font-mono tabular-nums",
                                            children: p(t.rollingR2, 3)
                                        }), e.jsx("td", {
                                            className: "px-1.5 py-1.5 text-right font-mono tabular-nums",
                                            children: p(t.betaAdjSpread, 4)
                                        }), e.jsx("td", {
                                            className: "px-1.5 py-1.5 text-right font-mono tabular-nums",
                                            children: t.halfLife !== null ? t.halfLife.toFixed(1) : "N/A"
                                        }), e.jsx("td", {
                                            className: "px-1.5 py-1.5 text-right text-muted-foreground font-mono tabular-nums",
                                            children: t.dataPoints ?? "—"
                                        })]
                                    }, `${t.tickerA}-${t.tickerB}`)
                                })
                            })]
                        })
                    })]
                })]
            })]
        })]
    })
}
export {
    ns as
    default
};