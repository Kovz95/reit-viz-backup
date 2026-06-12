import {
    c as K,
    u as ae,
    r as a,
    b as D,
    d as k,
    M as g,
    j as e,
    dO as C,
    B as h,
    b7 as re,
    z as le,
    am as ie,
    an as ne,
    aq as de,
    ap as oe,
    ay as ce,
    az as xe,
    aA as me,
    aB as ue,
    aC as ge,
    aD as he,
    x as V,
    o as B,
    p as I,
    q as z,
    t as q,
    v as $,
    I as G,
    P as pe,
    bS as be,
    T as je,
    af as fe
} from "./index-CsG73Aq_.js";
const Ne = K("BellOff", [
    ["path", {
        d: "M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5",
        key: "o7mx20"
    }],
    ["path", {
        d: "M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7",
        key: "16f1lm"
    }],
    ["path", {
        d: "M10.3 21a1.94 1.94 0 0 0 3.4 0",
        key: "qgo35s"
    }],
    ["path", {
        d: "m2 2 20 20",
        key: "1ooewy"
    }]
]);
const ve = K("BellRing", [
        ["path", {
            d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9",
            key: "1qo2s2"
        }],
        ["path", {
            d: "M10.3 21a1.94 1.94 0 0 0 3.4 0",
            key: "qgo35s"
        }],
        ["path", {
            d: "M4 2C2.8 3.7 2 5.7 2 8",
            key: "tap9e0"
        }],
        ["path", {
            d: "M22 8c0-2.3-.8-4.3-2-6",
            key: "5bb3ad"
        }]
    ]),
    Fe = [{
        value: "<",
        label: "<"
    }, {
        value: ">",
        label: ">"
    }, {
        value: "<=",
        label: "≤"
    }, {
        value: ">=",
        label: "≥"
    }],
    S = {
        "<": "<",
        ">": ">",
        "<=": "≤",
        ">=": "≥"
    },
    Q = {
        Volume: ["Volume"],
        Valuation: ["P/E LTM", "P/E FY2", "P/S LTM", "P/S FY2", "EV/EBITDA LTM", "EV/EBITDA FY2", "P/FFO LTM", "P/FFO FY2", "P/AFFO LTM", "P/AFFO FY2"],
        Yields: ["FFO Yield LTM", "FFO Yield FY2", "AFFO Yield LTM", "AFFO Yield FY2", "Dividend Yield", "Implied Cap Rate"],
        Estimates: ["EPS FY1", "EPS FY2", "FFO FY1", "FFO FY2", "AFFO FY1", "AFFO FY2", "EBITDA FY1", "EBITDA FY2", "Sales FY1", "Sales FY2"],
        LTM: ["EPS LTM", "FFO LTM", "AFFO LTM", "Sales LTM", "EBITDA LTM"],
        Growth: ["FY1 EPS Growth", "FY2 EPS Growth", "FY1 FFO Growth", "FY2 FFO Growth", "FY1 AFFO Growth", "FY2 AFFO Growth"],
        Performance: ["1Y Price Chg%", "6M Price Chg%", "3M Price Chg%", "1M Price Chg%", "% off 52wk High", "% off 52wk Low"],
        Other: ["close", "Enterprise Value", "Dividend", "Short Interest%", "Buy Ratings", "Hold Ratings", "Sell Ratings"]
    };
Object.values(Q).flat();

function we() {
    const n = ae(),
        [c, p] = a.useState([]);
    D({
        queryKey: ["/api/tickers"],
        queryFn: async () => {
            const t = await fe();
            return p(t), t
        }
    });
    const {
        data: r = [],
        isLoading: b
    } = D({
        queryKey: ["/api/alerts"]
    }), x = k({
        mutationFn: t => g("POST", "/api/alerts", t),
        onSuccess: () => n.invalidateQueries({
            queryKey: ["/api/alerts"]
        })
    }), s = k({
        mutationFn: ({
            id: t,
            ...d
        }) => g("POST", `/api/alerts/${t}/update`, d),
        onSuccess: () => n.invalidateQueries({
            queryKey: ["/api/alerts"]
        })
    }), j = k({
        mutationFn: t => g("POST", `/api/alerts/${t}/delete`),
        onSuccess: () => n.invalidateQueries({
            queryKey: ["/api/alerts"]
        })
    }), [i, H] = a.useState(null), [O, A] = a.useState(!1), U = a.useCallback(async () => {
        A(!0);
        try {
            const d = await (await g("POST", "/api/alerts/evaluate")).json();
            H(d), n.invalidateQueries({
                queryKey: ["/api/alerts"]
            })
        } catch (t) {
            console.error("Alert evaluation failed:", t)
        }
        A(!1)
    }, [n]), [o, _] = a.useState(""), [f, W] = a.useState("P/FFO FY2"), [N, J] = a.useState("<"), [m, M] = a.useState(""), [v, Y] = a.useState(""), [X, P] = a.useState(!1), Z = a.useMemo(() => c.map(t => t.ticker).sort(), [c]), ee = a.useCallback(() => {
        !o || !m || (x.mutate({
            ticker: o,
            metric: f,
            operator: N,
            threshold: parseFloat(m),
            label: v || null
        }), M(""), Y(""))
    }, [o, f, N, m, v, x]), F = a.useCallback(t => {
        s.mutate({
            id: t.id,
            enabled: !t.enabled
        })
    }, [s]), y = a.useCallback(t => {
        s.mutate({
            id: t.id,
            triggered: !1,
            triggeredAt: null,
            triggeredValue: null
        })
    }, [s]), te = a.useCallback(() => {
        if (r.length === 0) return;
        const t = ["Ticker", "Metric", "Operator", "Threshold", "Label", "Enabled", "Triggered", "Triggered At", "Triggered Value", "Created"],
            d = r.map(l => [l.ticker, l.metric, S[l.operator] || l.operator, l.threshold, l.label || "", l.enabled ? "Yes" : "No", l.triggered ? "Yes" : "No", l.triggeredAt || "", l.triggeredValue || "", l.createdAt?.slice(0, 10) || ""]),
            u = [t.join(","), ...d.map(l => l.map(se => `"${String(se).replace(/"/g,'""')}"`).join(","))].join(`
`),
            w = document.createElement("a");
        w.href = URL.createObjectURL(new Blob([u], {
            type: "text/csv"
        })), w.download = `alerts_${new Date().toISOString().slice(0,10)}.csv`, w.click()
    }, [r]), L = a.useMemo(() => r.filter(t => t.enabled && !t.triggered), [r]), E = a.useMemo(() => r.filter(t => t.triggered), [r]), R = a.useMemo(() => r.filter(t => !t.enabled), [r]);
    return e.jsxs("div", {
        className: "flex flex-col h-full overflow-hidden",
        children: [e.jsx("div", {
            className: "flex-shrink-0 px-4 py-3 border-b border-border bg-card",
            children: e.jsxs("div", {
                className: "flex items-center gap-3 flex-wrap",
                children: [e.jsxs("div", {
                    className: "flex items-center gap-2",
                    children: [e.jsx(C, {
                        size: 14,
                        className: "text-primary"
                    }), e.jsx("h2", {
                        className: "text-sm font-bold text-foreground tracking-tight",
                        children: "Alerts / Watchlist"
                    }), e.jsxs("span", {
                        className: "text-[10px] font-mono text-muted-foreground",
                        children: [r.length, " alert", r.length !== 1 ? "s" : ""]
                    })]
                }), e.jsxs("div", {
                    className: "flex items-center gap-1.5 ml-auto",
                    children: [e.jsxs(h, {
                        variant: "outline",
                        size: "sm",
                        className: "h-7 gap-1 text-xs",
                        onClick: U,
                        disabled: O || r.length === 0,
                        "data-testid": "btn-evaluate",
                        children: [e.jsx(re, {
                            size: 12,
                            className: O ? "animate-spin" : ""
                        }), "Check Now"]
                    }), e.jsx(h, {
                        variant: "outline",
                        size: "sm",
                        className: "h-6 gap-1 text-[11px]",
                        onClick: te,
                        disabled: r.length === 0,
                        "data-testid": "alerts-export-csv",
                        children: e.jsx(le, {
                            className: "w-3 h-3"
                        })
                    })]
                })]
            })
        }), e.jsxs("div", {
            className: "flex-1 overflow-auto px-4 py-3",
            children: [e.jsxs("div", {
                className: "border border-border rounded-lg p-3 mb-4 bg-card",
                children: [e.jsx("div", {
                    className: "text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2",
                    children: "New Alert"
                }), e.jsxs("div", {
                    className: "flex items-end gap-2 flex-wrap",
                    children: [e.jsxs("div", {
                        className: "flex flex-col gap-1",
                        children: [e.jsx("label", {
                            className: "text-[10px] text-muted-foreground",
                            children: "Ticker"
                        }), e.jsxs(ie, {
                            open: X,
                            onOpenChange: P,
                            children: [e.jsx(ne, {
                                asChild: !0,
                                children: e.jsxs(h, {
                                    variant: "outline",
                                    role: "combobox",
                                    className: "w-[120px] h-8 justify-between text-xs",
                                    "data-testid": "select-alert-ticker",
                                    children: [o || "Select...", e.jsx(de, {
                                        className: "ml-1 h-3 w-3 shrink-0 opacity-50"
                                    })]
                                })
                            }), e.jsx(oe, {
                                className: "w-[180px] p-0",
                                align: "start",
                                children: e.jsxs(ce, {
                                    children: [e.jsx(xe, {
                                        placeholder: "Search ticker...",
                                        className: "h-8 text-xs"
                                    }), e.jsxs(me, {
                                        children: [e.jsx(ue, {
                                            children: "No ticker found."
                                        }), e.jsx(ge, {
                                            children: Z.map(t => e.jsxs(he, {
                                                value: t,
                                                onSelect: () => {
                                                    _(t), P(!1)
                                                },
                                                className: "text-xs",
                                                children: [e.jsx(V, {
                                                    className: `mr-1 h-3 w-3 ${o===t?"opacity-100":"opacity-0"}`
                                                }), t]
                                            }, t))
                                        })]
                                    })]
                                })
                            })]
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-1",
                        children: [e.jsx("label", {
                            className: "text-[10px] text-muted-foreground",
                            children: "Metric"
                        }), e.jsxs(B, {
                            value: f,
                            onValueChange: W,
                            children: [e.jsx(I, {
                                className: "w-[160px] h-8 text-xs",
                                "data-testid": "select-alert-metric",
                                children: e.jsx(z, {})
                            }), e.jsx(q, {
                                children: Object.entries(Q).map(([t, d]) => e.jsxs("div", {
                                    children: [e.jsx("div", {
                                        className: "px-2 py-1 text-[10px] text-muted-foreground font-semibold uppercase",
                                        children: t
                                    }), d.map(u => e.jsx($, {
                                        value: u,
                                        className: "text-xs",
                                        children: u
                                    }, u))]
                                }, t))
                            })]
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-1",
                        children: [e.jsx("label", {
                            className: "text-[10px] text-muted-foreground",
                            children: "Condition"
                        }), e.jsxs(B, {
                            value: N,
                            onValueChange: J,
                            children: [e.jsx(I, {
                                className: "w-[70px] h-8 text-xs",
                                "data-testid": "select-alert-operator",
                                children: e.jsx(z, {})
                            }), e.jsx(q, {
                                children: Fe.map(t => e.jsx($, {
                                    value: t.value,
                                    className: "text-xs",
                                    children: t.label
                                }, t.value))
                            })]
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-1",
                        children: [e.jsx("label", {
                            className: "text-[10px] text-muted-foreground",
                            children: "Threshold"
                        }), e.jsx(G, {
                            type: "number",
                            step: "any",
                            value: m,
                            onChange: t => M(t.target.value),
                            className: "w-[100px] h-8 text-xs",
                            placeholder: "e.g. 18",
                            "data-testid": "input-alert-threshold"
                        })]
                    }), e.jsxs("div", {
                        className: "flex flex-col gap-1",
                        children: [e.jsx("label", {
                            className: "text-[10px] text-muted-foreground",
                            children: "Label (optional)"
                        }), e.jsx(G, {
                            value: v,
                            onChange: t => Y(t.target.value),
                            className: "w-[180px] h-8 text-xs",
                            placeholder: "e.g. Valuation cheap",
                            "data-testid": "input-alert-label"
                        })]
                    }), e.jsxs(h, {
                        size: "sm",
                        className: "h-8 gap-1 text-xs",
                        onClick: ee,
                        disabled: !o || !m || x.isPending,
                        "data-testid": "btn-create-alert",
                        children: [e.jsx(pe, {
                            size: 12
                        }), "Add Alert"]
                    })]
                })]
            }), i && e.jsxs("div", {
                className: `border rounded-lg p-3 mb-4 ${i.triggered.length>0?"border-amber-500/50 bg-amber-500/5":"border-green-500/50 bg-green-500/5"}`,
                children: [e.jsxs("div", {
                    className: "flex items-center gap-2 mb-1",
                    children: [i.triggered.length > 0 ? e.jsx(ve, {
                        size: 14,
                        className: "text-amber-400"
                    }) : e.jsx(V, {
                        size: 14,
                        className: "text-green-400"
                    }), e.jsx("span", {
                        className: "text-xs font-semibold",
                        children: i.triggered.length > 0 ? `${i.triggered.length} alert${i.triggered.length!==1?"s":""} triggered` : `All ${i.checked} alerts checked — none triggered`
                    })]
                }), i.triggered.length > 0 && e.jsx("div", {
                    className: "flex flex-col gap-1 mt-2",
                    children: i.triggered.map(t => e.jsxs("div", {
                        className: "text-[11px] text-amber-300 font-mono",
                        children: [t.ticker, " ", t.metric, " = ", t.currentValue.toFixed(2), " (", S[t.operator] || t.operator, " ", t.threshold, ")", t.label && e.jsxs("span", {
                            className: "text-muted-foreground ml-2",
                            children: ["— ", t.label]
                        })]
                    }, t.id))
                })]
            }), b ? e.jsx("div", {
                className: "text-center text-muted-foreground text-xs py-8",
                children: "Loading alerts..."
            }) : r.length === 0 ? e.jsxs("div", {
                className: "text-center text-muted-foreground text-xs py-12",
                children: [e.jsx(C, {
                    size: 24,
                    className: "mx-auto mb-2 opacity-30"
                }), e.jsx("p", {
                    children: "No alerts yet. Create one above to start monitoring."
                })]
            }) : e.jsxs("div", {
                className: "flex flex-col gap-4",
                children: [E.length > 0 && e.jsx(T, {
                    title: "Triggered",
                    alerts: E,
                    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
                    onToggle: F,
                    onDelete: t => j.mutate(t.id),
                    onReset: y
                }), L.length > 0 && e.jsx(T, {
                    title: "Active",
                    alerts: L,
                    badgeClass: "bg-green-500/15 text-green-400 border-green-500/30",
                    onToggle: F,
                    onDelete: t => j.mutate(t.id),
                    onReset: y
                }), R.length > 0 && e.jsx(T, {
                    title: "Disabled",
                    alerts: R,
                    badgeClass: "bg-muted/30 text-muted-foreground border-border/50",
                    onToggle: F,
                    onDelete: t => j.mutate(t.id),
                    onReset: y
                })]
            })]
        })]
    })
}

function T({
    title: n,
    alerts: c,
    badgeClass: p,
    onToggle: r,
    onDelete: b,
    onReset: x
}) {
    return e.jsxs("div", {
        children: [e.jsxs("div", {
            className: "flex items-center gap-2 mb-1.5",
            children: [e.jsx("span", {
                className: `text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${p}`,
                children: n
            }), e.jsx("span", {
                className: "text-[10px] text-muted-foreground",
                children: c.length
            })]
        }), e.jsx("div", {
            className: "border border-border rounded-lg overflow-hidden",
            children: e.jsxs("table", {
                className: "w-full text-xs",
                children: [e.jsx("thead", {
                    children: e.jsxs("tr", {
                        className: "bg-muted/20 border-b border-border",
                        children: [e.jsx("th", {
                            className: "text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
                            children: "Ticker"
                        }), e.jsx("th", {
                            className: "text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
                            children: "Condition"
                        }), e.jsx("th", {
                            className: "text-left px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
                            children: "Label"
                        }), e.jsx("th", {
                            className: "text-right px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
                            children: "Last Value"
                        }), e.jsx("th", {
                            className: "text-right px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
                            children: "Triggered"
                        }), e.jsx("th", {
                            className: "text-center px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-[100px]",
                            children: "Actions"
                        })]
                    })
                }), e.jsx("tbody", {
                    children: c.map(s => e.jsxs("tr", {
                        className: "border-b border-border/30 hover:bg-muted/10 transition-colors",
                        children: [e.jsx("td", {
                            className: "px-3 py-1.5 font-mono font-bold text-primary",
                            "data-testid": `alert-ticker-${s.id}`,
                            children: s.ticker
                        }), e.jsxs("td", {
                            className: "px-3 py-1.5 font-mono",
                            children: [s.metric, " ", S[s.operator] || s.operator, " ", s.threshold]
                        }), e.jsx("td", {
                            className: "px-3 py-1.5 text-muted-foreground",
                            children: s.label || "—"
                        }), e.jsx("td", {
                            className: "px-3 py-1.5 text-right font-mono",
                            children: s.triggeredValue ? parseFloat(s.triggeredValue).toFixed(2) : "—"
                        }), e.jsx("td", {
                            className: "px-3 py-1.5 text-right text-muted-foreground",
                            children: s.triggeredAt ? new Date(s.triggeredAt).toLocaleDateString() : "—"
                        }), e.jsx("td", {
                            className: "px-3 py-1.5 text-center",
                            children: e.jsxs("div", {
                                className: "flex items-center justify-center gap-1",
                                children: [e.jsx("button", {
                                    onClick: () => r(s),
                                    className: "p-1 rounded hover:bg-muted/50 transition-colors",
                                    title: s.enabled ? "Disable alert" : "Enable alert",
                                    "data-testid": `btn-toggle-${s.id}`,
                                    children: s.enabled ? e.jsx(Ne, {
                                        size: 12,
                                        className: "text-muted-foreground"
                                    }) : e.jsx(C, {
                                        size: 12,
                                        className: "text-green-400"
                                    })
                                }), s.triggered && e.jsx("button", {
                                    onClick: () => x(s),
                                    className: "p-1 rounded hover:bg-muted/50 transition-colors",
                                    title: "Reset triggered state",
                                    "data-testid": `btn-reset-${s.id}`,
                                    children: e.jsx(be, {
                                        size: 12,
                                        className: "text-muted-foreground"
                                    })
                                }), e.jsx("button", {
                                    onClick: () => b(s),
                                    className: "p-1 rounded hover:bg-red-500/20 transition-colors",
                                    title: "Delete alert",
                                    "data-testid": `btn-delete-${s.id}`,
                                    children: e.jsx(je, {
                                        size: 12,
                                        className: "text-red-400"
                                    })
                                })]
                            })
                        })]
                    }, s.id))
                })]
            })
        })]
    })
}
export {
    we as
    default
};