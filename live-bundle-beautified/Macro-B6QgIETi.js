import {
    u as Ce,
    r as u,
    g as Pe,
    b as fe,
    d as je,
    j as t,
    ar as he,
    B as _,
    A as Le,
    E as Ae,
    b7 as we,
    z as Ve,
    b8 as Me,
    au as De,
    b9 as ke,
    P as Ee,
    Y as Ie,
    av as Te,
    ba as Oe,
    bb as $e,
    aF as We,
    aG as He,
    aH as Be,
    aJ as N,
    aK as Ue,
    ak as k,
    bc as j,
    aL as Fe,
    aM as _e,
    aN as ze,
    aO as Ge,
    a_ as Ye,
    a$ as Xe,
    aP as qe,
    aQ as Ke,
    aR as Qe,
    b0 as Je,
    b1 as Ze,
    aX as pe,
    $ as et,
    ai as tt,
    a1 as st,
    bd as at,
    be as it,
    X as lt,
    bf as rt,
    bg as ot,
    bh as nt
} from "./index-CsG73Aq_.js";
const ct = {
        layout: {
            background: {
                type: Be.Solid,
                color: "transparent"
            },
            textColor: "#7a8a9e",
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace"
        },
        grid: {
            vertLines: {
                color: "rgba(255,255,255,0.04)"
            },
            horzLines: {
                color: "rgba(255,255,255,0.04)"
            }
        },
        crosshair: {
            mode: He.Normal
        },
        rightPriceScale: {
            borderColor: "rgba(255,255,255,0.1)"
        },
        timeScale: {
            borderColor: "rgba(255,255,255,0.1)",
            timeVisible: !1
        },
        handleScroll: !0,
        handleScale: !0
    },
    E = ["#0ea5e9", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16", "#e879f9", "#fb923c", "#2dd4bf", "#fbbf24"],
    dt = ["Solid", "Dotted", "Dashed", "LgDash"],
    ut = [{
        label: "Yield Curve",
        ids: ["DGS2", "DGS5", "DGS10", "DGS30"],
        group: "National"
    }, {
        label: "Spreads",
        ids: ["SPREAD_10Y_2Y", "SPREAD_5Y_2Y", "SPREAD_10Y_5Y"],
        group: "National"
    }, {
        label: "Real vs Nominal",
        ids: ["DGS10", "DFII10", "T10YIE"],
        group: "National"
    }, {
        label: "Policy Rates",
        ids: ["DFEDTARU", "SOFR", "DGS2"],
        group: "National"
    }, {
        label: "Housing Supply",
        ids: ["HOUST", "HOUST5F", "HOUST1F"],
        group: "National"
    }, {
        label: "Permits",
        ids: ["PERMIT", "PERMIT5", "PERMIT1"],
        group: "National"
    }, {
        label: "MF Pipeline",
        ids: ["HOUST5F", "PERMIT5", "UNDCONTSA"],
        group: "National"
    }, {
        label: "Starts vs Completions",
        ids: ["HOUST", "COMPU"],
        group: "National"
    }, {
        label: "Labor Market",
        ids: ["UNRATE", "PAYEMS", "ICSA"],
        group: "National"
    }, {
        label: "CPI vs PCE",
        ids: ["CPIAUCSL", "CPILFESL", "PCEPI", "PCEPILFE"],
        group: "National"
    }, {
        label: "Mortgage + 10Y",
        ids: ["MORTGAGE30US", "DGS10"],
        group: "National"
    }, {
        label: "Risk Indicators",
        ids: ["VIXCLS", "DCOILWTICO"],
        group: "National"
    }, {
        label: "Sunbelt Permits",
        ids: ["PHOE004BPPRIVSA", "DALL148BPPRIVSA", "ATLA013BPPRIVSA", "HOUS448BPPRIVSA", "AUST448BPPRIVSA", "NASH947BPPRIVSA"],
        group: "Regional"
    }, {
        label: "Coastal Permits",
        ids: ["NEWY636BPPRIVSA", "LOSA106BPPRIVSA", "SANF806BPPRIVSA", "BOST625BPPRIVSA", "SEAT653BPPRIVSA", "CHIC917BPPRIVSA"],
        group: "Regional"
    }, {
        label: "FL Permits",
        ids: ["TAMP312BPPRIVSA", "MIAM112BPPRIVSA", "ORLA712BPPRIVSA"],
        group: "Regional"
    }, {
        label: "TX Permits",
        ids: ["DALL148BPPRIVSA", "HOUS448BPPRIVSA", "AUST448BPPRIVSA"],
        group: "Regional"
    }, {
        label: "Sunbelt Unemp",
        ids: ["PHOE004URN", "DALL148URN", "ATLA013URN", "HOUS448URN", "AUST448URN", "NASH947URN"],
        group: "Regional"
    }, {
        label: "Coastal Unemp",
        ids: ["NEWY636URN", "LOSA106URN", "SANF806URN", "BOST625URN", "SEAT653URN", "CHIC917URN"],
        group: "Regional"
    }, {
        label: "Sunbelt Jobs",
        ids: ["PHOE004NA", "DALL148NA", "ATLA013NA", "HOUS448NA", "DENV708NA", "NASH947NA"],
        group: "Regional"
    }, {
        label: "Coastal Jobs",
        ids: ["NEWY636NA", "LOSA106NA", "SANF806NA", "BOST625NA", "SEAT653NA", "CHIC917NA"],
        group: "Regional"
    }, {
        label: "CS Sunbelt",
        ids: ["PHXRSA", "DAXRSA", "ATXRSA", "MIXRSA", "LVXRSA", "TPXRSA", "DNXRSA"],
        group: "Home Prices"
    }, {
        label: "CS Coastal",
        ids: ["NYXRSA", "LXXRSA", "SFXRSA", "BOXRSA", "SEXRSA", "CHXRSA"],
        group: "Home Prices"
    }, {
        label: "CS National",
        ids: ["CSUSHPISA", "SPCS20RSA"],
        group: "Home Prices"
    }, {
        label: "Sunbelt Listings",
        ids: ["MEDLISPRI38060", "MEDLISPRI19100", "MEDLISPRI12060", "MEDLISPRI26420", "MEDLISPRI12420", "MEDLISPRI19740"],
        group: "Home Prices"
    }];
let ce = 1;

function mt({
    pane: h,
    allData: R,
    height: A,
    isMaximized: x,
    onMaximize: $,
    useFlexHeight: z,
    onRegisterChart: oe,
    onUnregisterChart: U,
    onRegisterSeries: J,
    onCrosshairMove: F,
    activeIndicators: b,
    chartType: Z,
    onUpdatePane: ae,
    onRemoveSeriesFromPane: X,
    onToggleSeriesVisibility: ee,
    onUpdateSeriesStyle: W
}) {
    const I = z || x,
        T = u.useRef(null),
        V = u.useRef(null),
        g = u.useRef([]),
        [G, q] = u.useState(!1),
        [K, te] = u.useState(!1),
        [de, ue] = u.useState(null),
        H = u.useMemo(() => h.series.filter(a => a.visible).map(a => {
            const n = R[a.id];
            if (!n?.data?.length) return null;
            const M = $e(n.data, h.dataTransform, h.zScoreWindow || void 0);
            return {
                id: a.id,
                label: a.label,
                color: a.color,
                unit: n.meta.unit || "",
                lineWidth: a.lineWidth,
                lineStyle: a.lineStyle,
                data: M
            }
        }).filter(Boolean), [h.series, h.dataTransform, h.zScoreWindow, R]);
    return u.useEffect(() => {
        const a = T.current;
        if (!a || H.length === 0) return;
        V.current && (U(h.id), V.current.remove(), V.current = null);
        const n = We(a, {
            ...ct,
            width: a.clientWidth,
            height: I ? a.clientHeight || 300 : A
        });
        V.current = n, oe(h.id, n);
        const ie = new Set(H.map(r => r.unit)).size > 1,
            O = Z === "line-scatter";
        H.forEach((r, d) => {
            const o = ie ? d === 0 ? "right" : `scale_${d}` : "right",
                p = n.addSeries(N, {
                    color: r.color,
                    lineWidth: O ? 0 : r.lineWidth || 1.5,
                    lineStyle: r.lineStyle || 0,
                    priceLineVisible: !1,
                    lastValueVisible: !0,
                    crosshairMarkerRadius: O ? 2.5 : 3,
                    pointMarkersVisible: O,
                    pointMarkersRadius: O ? 1.5 : 0,
                    title: r.label,
                    priceScaleId: o
                });
            p.setData(r.data.map(f => ({
                time: f.time,
                value: f.value
            }))), d === 0 && J(h.id, p), ie && d > 0 && p.priceScale().applyOptions({
                scaleMargins: {
                    top: .1,
                    bottom: .1
                }
            })
        }), g.current = [];
        const P = H[0]?.data;
        if (P && P.length > 0) {
            if (b.sma) {
                const r = Ue(P, b.sma);
                if (r.length > 0) {
                    const d = n.addSeries(N, {
                        color: j.sma,
                        lineWidth: 1,
                        title: `SMA ${b.sma}`,
                        lineStyle: k.Dashed,
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    d.setData(r.map(o => ({
                        time: o.time,
                        value: o.value
                    }))), g.current.push(d)
                }
            }
            if (b.ema) {
                const r = Fe(P, b.ema);
                if (r.length > 0) {
                    const d = n.addSeries(N, {
                        color: j.ema,
                        lineWidth: 1,
                        title: `EMA ${b.ema}`,
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    d.setData(r.map(o => ({
                        time: o.time,
                        value: o.value
                    }))), g.current.push(d)
                }
            }
            if (b.hma) {
                const r = _e(P, b.hma);
                if (r.length > 0) {
                    const d = n.addSeries(N, {
                        color: j.hma,
                        lineWidth: 2,
                        title: `HMA ${b.hma}`,
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    d.setData(r.map(o => ({
                        time: o.time,
                        value: o.value
                    }))), g.current.push(d)
                }
            }
            if (b.lsma) {
                const r = ze(P, b.lsma, 0);
                if (r.length > 0) {
                    const d = n.addSeries(N, {
                        color: j.lsma,
                        lineWidth: 1,
                        title: `LSMA ${b.lsma}`,
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    d.setData(r.map(o => ({
                        time: o.time,
                        value: o.value
                    }))), g.current.push(d)
                }
            }
            if (b.slsma) {
                const r = Ge(P, b.slsma, 0);
                if (r.length > 0) {
                    const d = n.addSeries(N, {
                        color: j.slsma,
                        lineWidth: 2,
                        title: `SLSMA ${b.slsma}`,
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    d.setData(r.map(o => ({
                        time: o.time,
                        value: o.value
                    }))), g.current.push(d)
                }
            }
            if (typeof b.rsi == "number") {
                const r = Ye(P, b.rsi);
                if (r.length > 0) {
                    const d = n.addSeries(N, {
                        color: j.rsi_line,
                        lineWidth: 1,
                        title: `RSI ${b.rsi}`,
                        priceScaleId: "rsi",
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    d.setData(r.map(f => ({
                        time: f.time,
                        value: f.value
                    }))), g.current.push(d);
                    const o = r[0].time,
                        p = r[r.length - 1].time;
                    for (const [f, y] of [
                            [70, j.rsi_overbought],
                            [30, j.rsi_oversold]
                        ]) {
                        const C = n.addSeries(N, {
                            color: y,
                            lineWidth: 1,
                            lineStyle: k.Dotted,
                            title: "",
                            priceScaleId: "rsi",
                            crosshairMarkerVisible: !1,
                            priceLineVisible: !1,
                            lastValueVisible: !1
                        });
                        C.setData([{
                            time: o,
                            value: f
                        }, {
                            time: p,
                            value: f
                        }]), g.current.push(C)
                    }
                    d.priceScale().applyOptions({
                        scaleMargins: {
                            top: .75,
                            bottom: 0
                        }
                    })
                }
            }
            if (b.macd) {
                const r = Xe(P, 12, 26, 9);
                if (r.macdLine.length > 0) {
                    const d = n.addSeries(N, {
                        color: j.macd_line,
                        lineWidth: 1,
                        title: "MACD",
                        priceScaleId: "macd",
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    d.setData(r.macdLine.map(p => ({
                        time: p.time,
                        value: p.value
                    }))), g.current.push(d);
                    const o = n.addSeries(N, {
                        color: j.macd_signal,
                        lineWidth: 1,
                        title: "Signal",
                        priceScaleId: "macd",
                        crosshairMarkerVisible: !1,
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    if (o.setData(r.signalLine.map(p => ({
                            time: p.time,
                            value: p.value
                        }))), g.current.push(o), r.macdLine.length >= 2) {
                        const p = n.addSeries(N, {
                            color: "rgba(255,255,255,0.15)",
                            lineWidth: 1,
                            lineStyle: k.Dotted,
                            title: "",
                            priceScaleId: "macd",
                            crosshairMarkerVisible: !1,
                            priceLineVisible: !1,
                            lastValueVisible: !1
                        });
                        p.setData([{
                            time: r.macdLine[0].time,
                            value: 0
                        }, {
                            time: r.macdLine[r.macdLine.length - 1].time,
                            value: 0
                        }]), g.current.push(p)
                    }
                    d.priceScale().applyOptions({
                        scaleMargins: {
                            top: .8,
                            bottom: 0
                        }
                    })
                }
            }
            if (b.mean) {
                const {
                    rolling: r,
                    period: d
                } = b.mean;
                if (r) {
                    const o = qe(P, d);
                    if (o.mean.length > 0) {
                        const p = n.addSeries(N, {
                            color: j.mean,
                            lineWidth: 1,
                            title: `Rolling Mean ${d}`,
                            lineStyle: k.LargeDashed,
                            priceLineVisible: !1,
                            lastValueVisible: !1
                        });
                        p.setData(o.mean.map(f => ({
                            time: f.time,
                            value: f.value
                        }))), g.current.push(p);
                        for (const f of o.bands) {
                            const y = n.addSeries(N, {
                                color: Math.abs(f.mult) === 1 ? "rgba(99, 102, 241, 0.4)" : "rgba(99, 102, 241, 0.25)",
                                lineWidth: 1,
                                title: `${f.mult>0?"+":""}${f.mult}σ`,
                                lineStyle: k.Dotted,
                                priceLineVisible: !1,
                                lastValueVisible: !1
                            });
                            y.setData(f.data.map(C => ({
                                time: C.time,
                                value: C.value
                            }))), g.current.push(y)
                        }
                    }
                } else {
                    const o = d < P.length ? P.slice(-d) : P,
                        p = Ke(o);
                    if (o.length >= 2) {
                        const f = o[0].time,
                            y = o[o.length - 1].time,
                            C = n.addSeries(N, {
                                color: j.mean,
                                lineWidth: 1,
                                title: `Mean (${p.mean.toFixed(2)}) [${d}]`,
                                lineStyle: k.LargeDashed,
                                priceLineVisible: !1,
                                lastValueVisible: !1
                            });
                        C.setData([{
                            time: f,
                            value: p.mean
                        }, {
                            time: y,
                            value: p.mean
                        }]), g.current.push(C);
                        for (const w of [1, -1, 2, -2]) {
                            const Y = n.addSeries(N, {
                                color: Math.abs(w) === 1 ? "rgba(99, 102, 241, 0.4)" : "rgba(99, 102, 241, 0.25)",
                                lineWidth: 1,
                                title: `${w>0?"+":""}${w}σ`,
                                lineStyle: k.Dotted,
                                priceLineVisible: !1,
                                lastValueVisible: !1
                            });
                            Y.setData([{
                                time: f,
                                value: p.mean + w * p.std
                            }, {
                                time: y,
                                value: p.mean + w * p.std
                            }]), g.current.push(Y)
                        }
                    }
                }
            }
            if (b.bollinger) {
                const {
                    period: r,
                    mult: d
                } = b.bollinger, o = Qe(P, r, d);
                if (o.basis.length > 0) {
                    const p = n.addSeries(N, {
                        color: j.bollinger_basis,
                        lineWidth: 1,
                        title: `BB Mid ${r}`,
                        lineStyle: k.Dashed,
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    p.setData(o.basis.map(C => ({
                        time: C.time,
                        value: C.value
                    }))), g.current.push(p);
                    const f = n.addSeries(N, {
                        color: j.bollinger_band,
                        lineWidth: 1,
                        title: `BB +${d}σ`,
                        lineStyle: k.Dotted,
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    f.setData(o.upper.map(C => ({
                        time: C.time,
                        value: C.value
                    }))), g.current.push(f);
                    const y = n.addSeries(N, {
                        color: j.bollinger_band,
                        lineWidth: 1,
                        title: `BB -${d}σ`,
                        lineStyle: k.Dotted,
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    y.setData(o.lower.map(C => ({
                        time: C.time,
                        value: C.value
                    }))), g.current.push(y)
                }
            }
            if (typeof b.roc == "number") {
                const r = Je(P, b.roc);
                if (r.length > 0) {
                    const d = n.addSeries(N, {
                        color: j.roc,
                        lineWidth: 1,
                        title: `ROC ${b.roc}`,
                        priceScaleId: "roc",
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    if (d.setData(r.map(o => ({
                            time: o.time,
                            value: o.value
                        }))), g.current.push(d), r.length >= 2) {
                        const o = n.addSeries(N, {
                            color: "rgba(255,255,255,0.15)",
                            lineWidth: 1,
                            lineStyle: k.Dotted,
                            title: "",
                            priceScaleId: "roc",
                            crosshairMarkerVisible: !1,
                            priceLineVisible: !1,
                            lastValueVisible: !1
                        });
                        o.setData([{
                            time: r[0].time,
                            value: 0
                        }, {
                            time: r[r.length - 1].time,
                            value: 0
                        }]), g.current.push(o)
                    }
                    d.priceScale().applyOptions({
                        scaleMargins: {
                            top: .8,
                            bottom: 0
                        }
                    })
                }
            }
            if (b.stochastic) {
                const {
                    kPeriod: r,
                    dPeriod: d
                } = b.stochastic, o = Ze(P, r, d);
                if (o.k.length > 0) {
                    const p = n.addSeries(N, {
                        color: j.stoch_k,
                        lineWidth: 1,
                        title: `%K ${r}`,
                        priceScaleId: "stoch",
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    p.setData(o.k.map(y => ({
                        time: y.time,
                        value: y.value
                    }))), g.current.push(p);
                    const f = n.addSeries(N, {
                        color: j.stoch_d,
                        lineWidth: 1,
                        title: `%D ${d}`,
                        priceScaleId: "stoch",
                        priceLineVisible: !1,
                        lastValueVisible: !1
                    });
                    if (f.setData(o.d.map(y => ({
                            time: y.time,
                            value: y.value
                        }))), g.current.push(f), o.k.length >= 2) {
                        const y = o.k[0].time,
                            C = o.k[o.k.length - 1].time;
                        for (const [w, Y] of [
                                [80, j.rsi_overbought],
                                [20, j.rsi_oversold]
                            ]) {
                            const le = n.addSeries(N, {
                                color: Y,
                                lineWidth: 1,
                                lineStyle: k.Dotted,
                                title: "",
                                priceScaleId: "stoch",
                                crosshairMarkerVisible: !1,
                                priceLineVisible: !1,
                                lastValueVisible: !1
                            });
                            le.setData([{
                                time: y,
                                value: w
                            }, {
                                time: C,
                                value: w
                            }]), g.current.push(le)
                        }
                    }
                    p.priceScale().applyOptions({
                        scaleMargins: {
                            top: .75,
                            bottom: 0
                        }
                    })
                }
            }
        }
        const B = r => {
            if (!r.time || !r.seriesData) {
                F(h.id, null);
                return
            }
            const d = {};
            r.seriesData.forEach((o, p) => {
                const f = o?.value ?? o?.close;
                if (f != null) {
                    const y = p.options?.()?.title || h.label;
                    d[y || h.label] = f
                }
            }), Object.keys(d).length > 0 && F(h.id, {
                time: String(r.time),
                values: d
            })
        };
        n.subscribeCrosshairMove(B), n.timeScale().fitContent();
        const Q = new ResizeObserver(() => {
            V.current && a && V.current.applyOptions({
                width: a.clientWidth,
                height: I ? a.clientHeight || 300 : A
            })
        });
        return Q.observe(a), () => {
            Q.disconnect();
            try {
                n.unsubscribeCrosshairMove(B)
            } catch {}
            F(h.id, null), U(h.id), n.remove(), V.current = null, g.current = []
        }
    }, [H, A, h.id, x, I, b, Z]), u.useEffect(() => {
        const a = V.current;
        if (a) try {
            a.priceScale("right").applyOptions({
                mode: G ? pe.Logarithmic : pe.Normal
            })
        } catch {}
    }, [G]), t.jsxs("div", {
        className: `flex flex-col ${x?"fixed inset-0 z-50 bg-background":I?"w-full h-full border border-border/30 min-h-0 overflow-hidden":"border-b border-border/30"}`,
        onDoubleClick: () => $(x ? null : h.id),
        children: [t.jsxs("div", {
            className: "flex items-center gap-1 px-2 py-0.5 bg-card/50 flex-shrink-0 flex-wrap",
            children: [t.jsx("span", {
                className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate max-w-[150px]",
                children: h.label
            }), t.jsxs("div", {
                className: "flex items-center gap-0.5 ml-1",
                children: [h.series.map(a => t.jsx("button", {
                    className: `w-2.5 h-2.5 rounded-full border border-white/20 transition-opacity ${a.visible?"opacity-100":"opacity-30"}`,
                    style: {
                        backgroundColor: a.color
                    },
                    onClick: n => {
                        n.stopPropagation(), ee(h.id, a.id)
                    },
                    title: `${a.label} — click to ${a.visible?"hide":"show"}`
                }, a.id)), t.jsx("button", {
                    className: "text-[9px] text-muted-foreground/60 hover:text-muted-foreground ml-0.5",
                    onClick: a => {
                        a.stopPropagation(), te(!K)
                    },
                    title: "Toggle legend",
                    children: K ? "▾" : `${h.series.length}s`
                })]
            }), t.jsx("div", {
                className: "flex-1"
            }), t.jsxs("div", {
                className: "flex items-center gap-px",
                children: [
                    ["raw", "zscore", "percentile"].map(a => {
                        const n = a === "raw" ? "Raw" : a === "zscore" ? "Z" : "%";
                        return t.jsx("button", {
                            className: `text-[9px] font-mono font-bold px-1 py-0.5 rounded transition-colors ${h.dataTransform===a?"bg-primary text-primary-foreground":"bg-background/80 text-muted-foreground/60 hover:text-muted-foreground"}`,
                            onClick: M => {
                                M.stopPropagation(), ae(h.id, {
                                    dataTransform: a
                                })
                            },
                            title: a === "raw" ? "Raw data" : a === "zscore" ? "Z-Score" : "Percentile",
                            "data-testid": `macro-pane-${h.id}-transform-${a}`,
                            children: n
                        }, a)
                    }), h.dataTransform !== "raw" && t.jsxs("select", {
                        className: "text-[9px] font-mono bg-background/80 text-muted-foreground border border-border/50 rounded px-0.5 py-0.5 h-[18px] focus:outline-none ml-0.5",
                        value: h.zScoreWindow,
                        onChange: a => {
                            a.stopPropagation(), ae(h.id, {
                                zScoreWindow: Number(a.target.value)
                            })
                        },
                        title: "Lookback window (0 = expanding)",
                        "data-testid": `macro-pane-${h.id}-zscore-window`,
                        onClick: a => a.stopPropagation(),
                        children: [t.jsx("option", {
                            value: 0,
                            children: "All"
                        }), t.jsx("option", {
                            value: 63,
                            children: "63d"
                        }), t.jsx("option", {
                            value: 126,
                            children: "126d"
                        }), t.jsx("option", {
                            value: 252,
                            children: "1Y"
                        }), t.jsx("option", {
                            value: 504,
                            children: "2Y"
                        }), t.jsx("option", {
                            value: 756,
                            children: "3Y"
                        }), t.jsx("option", {
                            value: 1260,
                            children: "5Y"
                        })]
                    })
                ]
            }), t.jsx("button", {
                className: `text-[9px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${G?"bg-primary text-primary-foreground":"text-muted-foreground/60 hover:text-muted-foreground bg-transparent"}`,
                onClick: a => {
                    a.stopPropagation(), q(!G)
                },
                title: "Toggle logarithmic scale",
                "data-testid": `macro-chart-${h.id}-log`,
                children: "LOG"
            }), t.jsx("div", {
                onClick: a => a.stopPropagation(),
                children: t.jsx(et, {
                    getChart: () => V.current,
                    label: `Macro_${h.label}`
                })
            }), t.jsx(_, {
                variant: "ghost",
                size: "sm",
                className: "h-5 w-5 p-0",
                onClick: a => {
                    a.stopPropagation(), $(x ? null : h.id)
                },
                title: x ? "Restore" : "Maximize",
                children: x ? t.jsx(tt, {
                    className: "w-3 h-3"
                }) : t.jsx(st, {
                    className: "w-3 h-3"
                })
            })]
        }), K && t.jsx("div", {
            className: "px-2 py-1 bg-card/80 border-b border-border/20 flex flex-col gap-0.5 flex-shrink-0",
            onClick: a => a.stopPropagation(),
            children: h.series.map(a => t.jsxs("div", {
                className: "flex items-center gap-1.5 group",
                children: [t.jsx("button", {
                    className: "w-3 h-3 rounded-sm border border-white/20 flex-shrink-0",
                    style: {
                        backgroundColor: a.color
                    },
                    onClick: () => {
                        const n = E.indexOf(a.color),
                            M = E[(n + 1) % E.length];
                        W(h.id, a.id, {
                            color: M
                        })
                    },
                    title: "Click to change color"
                }), t.jsx("span", {
                    className: `text-[10px] font-mono truncate flex-1 ${a.visible?"text-foreground":"text-muted-foreground/40 line-through"}`,
                    children: a.label
                }), t.jsx("select", {
                    className: "text-[9px] font-mono bg-background/60 border border-border/40 rounded px-0.5 h-[16px] w-[34px]",
                    value: a.lineWidth,
                    onChange: n => W(h.id, a.id, {
                        lineWidth: Number(n.target.value)
                    }),
                    title: "Line width",
                    children: [1, 2, 3, 4].map(n => t.jsxs("option", {
                        value: n,
                        children: [n, "px"]
                    }, n))
                }), t.jsx("select", {
                    className: "text-[9px] font-mono bg-background/60 border border-border/40 rounded px-0.5 h-[16px] w-[48px]",
                    value: a.lineStyle,
                    onChange: n => W(h.id, a.id, {
                        lineStyle: Number(n.target.value)
                    }),
                    title: "Line style",
                    children: dt.map((n, M) => t.jsx("option", {
                        value: M,
                        children: n
                    }, M))
                }), t.jsx("button", {
                    className: "text-muted-foreground/60 hover:text-foreground",
                    onClick: () => ee(h.id, a.id),
                    title: a.visible ? "Hide" : "Show",
                    children: a.visible ? t.jsx(at, {
                        className: "w-3 h-3"
                    }) : t.jsx(it, {
                        className: "w-3 h-3"
                    })
                }), t.jsx("button", {
                    className: "text-muted-foreground/40 hover:text-red-400",
                    onClick: () => X(h.id, a.id),
                    title: "Remove from pane",
                    children: t.jsx(lt, {
                        className: "w-3 h-3"
                    })
                })]
            }, a.id))
        }), t.jsx("div", {
            ref: T,
            style: I ? {
                flex: 1
            } : {
                height: A
            },
            className: I ? "flex-1 min-h-0" : ""
        })]
    })
}

function ht() {
    const h = Ce(),
        [R, A] = u.useState([]),
        [x, $] = u.useState(["DGS2", "DGS5", "DGS10", "DGS30"]),
        [z, oe] = u.useState(null),
        [U, J] = u.useState(!1),
        [F, b] = u.useState({}),
        [Z, ae] = u.useState(null),
        [X, ee] = u.useState("1x1"),
        [W, I] = u.useState("line"),
        [T, V] = u.useState("overlay"),
        [g, G] = u.useState("auto"),
        [q, K] = u.useState(new Set(["Regional Permits (Sunbelt)", "Regional Permits (Coastal)", "Regional Labor (Sunbelt)", "Regional Labor (Coastal)", "Regional Employment (Sunbelt)", "Regional Employment (Coastal)", "Regional Listing Prices"])),
        te = u.useRef(!1),
        de = u.useCallback(() => ({
            panes: R,
            selectedIds: x,
            macroGridLayout: X,
            macroChartType: W,
            collapsedCategories: [...q],
            indicatorsMap: F,
            showIndicators: U,
            addMode: T,
            targetPaneId: g
        }), [R, x, X, W, q, F, U, T, g]),
        ue = u.useCallback(e => {
            e.panes !== void 0 && (A(e.panes), te.current = !0), e.selectedIds !== void 0 && $(e.selectedIds), e.macroGridLayout !== void 0 && ee(e.macroGridLayout), e.macroChartType !== void 0 && I(e.macroChartType), e.collapsedCategories !== void 0 && K(new Set(e.collapsedCategories)), e.indicatorsMap !== void 0 && b(e.indicatorsMap), typeof e.showIndicators == "boolean" && J(e.showIndicators), e.addMode !== void 0 && V(e.addMode), e.targetPaneId !== void 0 && G(e.targetPaneId)
        }, []);
    Pe("macro", de, ue);
    const [H, a] = u.useState(null), n = u.useRef(new Map), M = u.useRef(null), ie = u.useCallback((e, s) => {
        s ? n.current.set(e, s) : n.current.delete(e), M.current && cancelAnimationFrame(M.current), M.current = requestAnimationFrame(() => {
            const l = Array.from(n.current.values());
            if (l.length === 0) {
                a(null);
                return
            }
            const i = {};
            let c = l[0].time;
            for (const m of l) {
                m.time >= c && (c = m.time);
                for (const [S, L] of Object.entries(m.values)) i[S] = L
            }
            a({
                time: c,
                values: i
            })
        })
    }, []), O = u.useRef(new Map), P = u.useRef(new Map), B = u.useRef(!1), Q = u.useRef(new Map), r = u.useCallback((e, s) => {
        O.current.set(e, s);
        const l = c => {
            B.current || !c || (B.current = !0, O.current.forEach((m, S) => {
                if (S !== e) try {
                    m.timeScale().setVisibleLogicalRange(c)
                } catch {}
            }), B.current = !1)
        };
        s.timeScale().subscribeVisibleLogicalRangeChange(l);
        const i = c => {
            B.current || (B.current = !0, O.current.forEach((m, S) => {
                if (S !== e) try {
                    if (c.time) {
                        const L = P.current.get(S);
                        L && m.setCrosshairPosition(NaN, c.time, L)
                    } else m.clearCrosshairPosition()
                } catch {}
            }), B.current = !1)
        };
        s.subscribeCrosshairMove(i), Q.current.set(e, {
            rangeHandler: l,
            crosshairHandler: i
        })
    }, []), d = u.useCallback(e => {
        const s = Q.current.get(e),
            l = O.current.get(e);
        if (s && l) {
            try {
                l.timeScale().unsubscribeVisibleLogicalRangeChange(s.rangeHandler)
            } catch {}
            try {
                l.unsubscribeCrosshairMove(s.crosshairHandler)
            } catch {}
        }
        Q.current.delete(e), O.current.delete(e), P.current.delete(e)
    }, []), o = u.useCallback((e, s) => {
        P.current.set(e, s)
    }, []), {
        data: p
    } = fe({
        queryKey: ["macro-catalog"],
        queryFn: ot
    }), {
        data: f,
        isLoading: y,
        refetch: C
    } = fe({
        queryKey: ["macro-series", {
            ids: x.join(",")
        }],
        queryFn: () => nt(x),
        enabled: x.length > 0
    }), w = je({
        mutationFn: async () => {
            throw new Error("Refresh not available in static mode")
        },
        onSuccess: () => {
            rt(), h.invalidateQueries({
                queryKey: ["macro-series"]
            }), h.invalidateQueries({
                queryKey: ["macro-catalog"]
            }), C()
        }
    });
    u.useCallback(() => {
        const e = new Set(R.flatMap(s => s.series.map(l => l.color)));
        return E.find(s => !e.has(s)) || E[R.reduce((s, l) => s + l.series.length, 0) % E.length]
    }, [R]);
    const Y = u.useCallback((e, s, l) => {
            A(i => {
                for (const v of i)
                    if (v.series.some(D => D.id === e)) return i;
                const c = new Set(i.flatMap(v => v.series.map(D => D.color))),
                    m = E.find(v => !c.has(v)) || E[i.reduce((v, D) => v + D.series.length, 0) % E.length],
                    S = {
                        id: e,
                        label: s.label || e,
                        color: m,
                        unit: s.unit || "",
                        visible: !0,
                        lineWidth: 2,
                        lineStyle: 0
                    };
                if (T === "new" || i.length === 0) {
                    const v = `pane_${ce++}`;
                    return [...i, {
                        id: v,
                        label: s.label || e,
                        series: [S],
                        dataTransform: "raw",
                        zScoreWindow: 0
                    }]
                }
                const L = l && i.find(v => v.id === l) ? l : i[0].id;
                return i.map(v => v.id === L ? {
                    ...v,
                    series: [...v.series, S]
                } : v)
            })
        }, [T]),
        le = u.useCallback((e, s) => {
            A(l => l.map(c => c.id !== e ? c : {
                ...c,
                series: c.series.filter(m => m.id !== s)
            }).filter(c => c.series.length > 0)), $(l => l.filter(i => i !== s))
        }, []),
        be = u.useCallback((e, s) => {
            A(l => l.map(i => i.id !== e ? i : {
                ...i,
                series: i.series.map(c => c.id === s ? {
                    ...c,
                    visible: !c.visible
                } : c)
            }))
        }, []),
        ge = u.useCallback((e, s, l) => {
            A(i => i.map(c => c.id !== e ? c : {
                ...c,
                series: c.series.map(m => m.id === s ? {
                    ...m,
                    ...l
                } : m)
            }))
        }, []),
        xe = u.useCallback((e, s) => {
            A(l => l.map(i => i.id === e ? {
                ...i,
                ...s
            } : i))
        }, []);
    u.useCallback(e => {
        A(s => {
            const l = s.find(i => i.id === e);
            return l && $(i => i.filter(c => !l.series.some(m => m.id === c))), s.filter(i => i.id !== e)
        })
    }, []), u.useEffect(() => {
        if (!f || x.length === 0 || te.current && R.length > 0) return;
        const e = {};
        let s = 0;
        for (const i of x) {
            const c = f[i];
            if (!c?.data?.length || R.some(S => S.series.some(L => L.id === i))) continue;
            const m = c.meta.category || "Other";
            e[m] || (e[m] = []), e[m].push({
                id: i,
                label: c.meta.label || i,
                color: E[s % E.length],
                unit: c.meta.unit || "",
                visible: !0,
                lineWidth: 2,
                lineStyle: 0
            }), s++
        }
        if (Object.keys(e).length === 0) return;
        const l = Object.entries(e).map(([i, c]) => ({
            id: `pane_${ce++}`,
            label: i,
            series: c,
            dataTransform: "raw",
            zScoreWindow: 0
        }));
        A(i => [...i, ...l])
    }, [f, x]);
    const re = u.useMemo(() => {
            if (!p) return {};
            const e = {};
            for (const s of p) e[s.category] || (e[s.category] = []), e[s.category].push(s);
            return e
        }, [p]),
        Se = (e, s) => {
            x.includes(e) ? (A(i => i.map(m => ({
                ...m,
                series: m.series.filter(S => S.id !== e)
            })).filter(m => m.series.length > 0)), $(i => i.filter(c => c !== e))) : ($(i => [...i, e]), s && f?.[e] && Y(e, s, g !== "auto" ? g : void 0))
        };
    u.useEffect(() => {
        if (f)
            for (const e of x) {
                const s = f[e];
                if (!s?.data?.length) continue;
                R.some(i => i.series.some(c => c.id === e)) || Y(e, s.meta, g !== "auto" ? g : void 0)
            }
    }, [f]);
    const ve = e => {
            K(s => {
                const l = new Set(s);
                return l.has(e) ? l.delete(e) : l.add(e), l
            })
        },
        Re = e => {
            A([]), $(e), te.current = !1
        },
        Ne = u.useCallback(() => {
            if (!f) return;
            const e = new Map;
            for (const v of x) {
                const D = f[v];
                if (D)
                    for (const se of D.data) {
                        const me = e.get(se.time) || {};
                        me[v] = se.value, e.set(se.time, me)
                    }
            }
            const s = Array.from(e.entries()).sort((v, D) => v[0].localeCompare(D[0])),
                l = `Date,${x.join(",")}`,
                i = s.map(([v, D]) => `${v},${x.map(se=>D[se]?.toString()??"").join(",")}`),
                c = [l, ...i].join(`
`),
                m = new Blob([c], {
                    type: "text/csv"
                }),
                S = URL.createObjectURL(m),
                L = document.createElement("a");
            L.href = S, L.download = `macro_${x.join("_")}.csv`, L.click(), URL.revokeObjectURL(S)
        }, [f, x]),
        ye = ["Rates", "Housing", "Labor", "Inflation", "Economy", "Commodities", "Markets", "Home Prices", "Regional Permits (Sunbelt)", "Regional Permits (Coastal)", "Regional Labor (Sunbelt)", "Regional Labor (Coastal)", "Regional Employment (Sunbelt)", "Regional Employment (Coastal)", "Regional Listing Prices"],
        ne = u.useMemo(() => z ? R.filter(e => e.id === z) : R, [R, z]);
    return t.jsxs("div", {
        className: "flex h-full bg-background",
        "data-testid": "macro-page",
        children: [t.jsxs("div", {
            className: "w-[240px] border-r border-border bg-card flex flex-col flex-shrink-0 overflow-y-auto",
            children: [t.jsxs("div", {
                className: "px-3 py-2 border-b border-border space-y-1.5",
                children: [t.jsxs("div", {
                    className: "flex items-center gap-1.5",
                    children: [t.jsx(he, {
                        className: "text-[10px] text-muted-foreground",
                        children: "Add to:"
                    }), t.jsxs("div", {
                        className: "flex gap-0.5 flex-1",
                        children: [t.jsx("button", {
                            className: `flex-1 text-[9px] font-semibold px-1.5 py-0.5 rounded ${T==="overlay"?"bg-primary/20 text-primary":"text-muted-foreground hover:bg-accent/50"}`,
                            onClick: () => V("overlay"),
                            children: "Overlay"
                        }), t.jsx("button", {
                            className: `flex-1 text-[9px] font-semibold px-1.5 py-0.5 rounded ${T==="new"?"bg-primary/20 text-primary":"text-muted-foreground hover:bg-accent/50"}`,
                            onClick: () => V("new"),
                            children: "New Pane"
                        })]
                    })]
                }), T === "overlay" && R.length > 0 && t.jsxs("div", {
                    className: "flex items-center gap-1.5",
                    children: [t.jsx(he, {
                        className: "text-[10px] text-muted-foreground",
                        children: "Target:"
                    }), t.jsxs("select", {
                        className: "flex-1 text-[10px] font-mono bg-background border border-border/50 rounded px-1 py-0.5 h-[20px]",
                        value: g,
                        onChange: e => G(e.target.value),
                        children: [t.jsx("option", {
                            value: "auto",
                            children: "First Pane"
                        }), R.map(e => t.jsxs("option", {
                            value: e.id,
                            children: [e.label, " (", e.series.length, "s)"]
                        }, e.id))]
                    })]
                })]
            }), t.jsxs("div", {
                className: "px-3 py-2 border-b border-border",
                children: [t.jsx("p", {
                    className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5",
                    children: "Quick Views"
                }), ["National", "Regional", "Home Prices"].map(e => {
                    const s = ut.filter(l => l.group === e);
                    return s.length === 0 ? null : t.jsxs("div", {
                        className: "mb-1.5",
                        children: [t.jsx("p", {
                            className: "text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-0.5",
                            children: e
                        }), t.jsx("div", {
                            className: "flex flex-wrap gap-1",
                            children: s.map(l => t.jsx(_, {
                                variant: "ghost",
                                size: "sm",
                                className: `h-5 px-2 text-[10px] ${l.ids.every(i=>x.includes(i))&&l.ids.length===x.length?"bg-primary/20 text-primary":""}`,
                                onClick: () => Re(l.ids),
                                children: l.label
                            }, l.label))
                        })]
                    }, e)
                })]
            }), t.jsx("div", {
                className: "flex-1 overflow-y-auto",
                children: ye.filter(e => re[e]).map(e => t.jsxs("div", {
                    children: [t.jsxs("button", {
                        className: "flex items-center gap-1.5 w-full px-3 py-1.5 text-left hover:bg-accent/50",
                        onClick: () => ve(e),
                        children: [q.has(e) ? t.jsx(Le, {
                            className: "w-3 h-3 text-muted-foreground"
                        }) : t.jsx(Ae, {
                            className: "w-3 h-3 text-muted-foreground"
                        }), t.jsx("span", {
                            className: "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider",
                            children: e
                        }), t.jsxs("span", {
                            className: "text-[9px] text-muted-foreground/60 ml-auto",
                            children: [re[e].filter(s => x.includes(s.id)).length, "/", re[e].length]
                        })]
                    }), !q.has(e) && re[e].map(s => {
                        const l = x.includes(s.id),
                            i = R.find(c => c.series.some(m => m.id === s.id));
                        return t.jsxs("label", {
                            className: "flex items-center gap-2 px-3 py-0.5 cursor-pointer hover:bg-accent/30",
                            children: [t.jsx("input", {
                                type: "checkbox",
                                checked: l,
                                onChange: () => Se(s.id, s),
                                className: "w-3 h-3 rounded border-border accent-primary"
                            }), i && t.jsx("span", {
                                className: "w-2 h-2 rounded-full flex-shrink-0",
                                style: {
                                    backgroundColor: i.series.find(c => c.id === s.id)?.color
                                }
                            }), t.jsx("span", {
                                className: "text-[11px] text-foreground truncate flex-1",
                                children: s.label
                            }), t.jsx("span", {
                                className: "text-[9px] text-muted-foreground/60 font-mono",
                                children: s.freq
                            })]
                        }, s.id)
                    })]
                }, e))
            }), t.jsxs("div", {
                className: "px-3 py-2 border-t border-border space-y-2",
                children: [t.jsxs(_, {
                    variant: "outline",
                    size: "sm",
                    className: "w-full h-7 text-xs gap-1.5",
                    onClick: () => w.mutate(),
                    disabled: w.isPending,
                    children: [t.jsx(we, {
                        className: `w-3 h-3 ${w.isPending?"animate-spin":""}`
                    }), w.isPending ? "Refreshing..." : "Refresh All Data"]
                }), t.jsxs(_, {
                    variant: "outline",
                    size: "sm",
                    className: "w-full h-7 text-xs gap-1.5",
                    onClick: Ne,
                    disabled: x.length === 0,
                    children: [t.jsx(Ve, {
                        className: "w-3 h-3"
                    }), "CSV"]
                })]
            })]
        }), t.jsxs("div", {
            className: "flex-1 flex flex-col overflow-hidden min-h-0",
            children: [H && t.jsxs("div", {
                className: "flex items-center gap-3 px-4 py-1 border-b border-border/50 bg-card/30 flex-wrap flex-shrink-0",
                children: [t.jsx("span", {
                    className: "text-[10px] font-mono text-muted-foreground",
                    children: H.time
                }), Object.entries(H.values).map(([e, s]) => t.jsxs("span", {
                    className: "text-[10px] font-mono whitespace-nowrap",
                    children: [t.jsxs("span", {
                        className: "text-muted-foreground",
                        children: [e, ": "]
                    }), t.jsx("span", {
                        className: "text-foreground font-semibold",
                        children: typeof s == "number" ? s.toFixed(4) : s
                    })]
                }, e))]
            }), t.jsxs("div", {
                className: "flex items-center gap-2 px-4 py-1 border-b border-border/50 bg-card/30 flex-shrink-0",
                children: [t.jsx(Me, {
                    className: "w-3 h-3 text-muted-foreground"
                }), t.jsxs("span", {
                    className: "text-[10px] text-muted-foreground",
                    children: [x.length, " series · ", R.length, " pane", R.length !== 1 ? "s" : "", w.data && t.jsxs(t.Fragment, {
                        children: [" · Last refresh: ", new Date(w.data.timestamp).toLocaleString()]
                    })]
                }), t.jsx("span", {
                    className: "text-[10px] text-muted-foreground/60",
                    children: "· Source: FRED (St. Louis Fed)"
                }), t.jsx("div", {
                    className: "flex-1"
                }), t.jsx(De, {
                    value: X,
                    onChange: ee,
                    testId: "macro-grid-picker"
                }), t.jsxs("div", {
                    className: "flex gap-0.5 border border-border/50 rounded p-0.5",
                    children: [t.jsx(_, {
                        variant: W === "line" ? "default" : "ghost",
                        size: "sm",
                        className: "h-5 px-1.5 text-[9px]",
                        onClick: () => I("line"),
                        title: "Line chart",
                        "data-testid": "macro-chart-line",
                        children: "Line"
                    }), t.jsxs(_, {
                        variant: W === "line-scatter" ? "default" : "ghost",
                        size: "sm",
                        className: "h-5 px-1.5 text-[9px] gap-0.5",
                        onClick: () => I("line-scatter"),
                        title: "Scatter chart",
                        "data-testid": "macro-chart-scatter",
                        children: [t.jsx(ke, {
                            className: "w-2.5 h-2.5"
                        }), "Scatter"]
                    })]
                }), t.jsxs(_, {
                    variant: "ghost",
                    size: "sm",
                    className: "h-6 px-2 text-[10px] gap-1",
                    onClick: () => {
                        const e = `pane_${ce++}`;
                        A(s => [...s, {
                            id: e,
                            label: `Pane ${R.length+1}`,
                            series: [],
                            dataTransform: "raw",
                            zScoreWindow: 0
                        }])
                    },
                    "data-testid": "add-macro-pane",
                    title: "Add empty pane",
                    children: [t.jsx(Ee, {
                        className: "w-3 h-3"
                    }), "Pane"]
                }), t.jsxs(_, {
                    variant: U ? "default" : "ghost",
                    size: "sm",
                    className: "h-6 px-2 text-[10px] gap-1",
                    onClick: () => J(!U),
                    "data-testid": "toggle-indicators",
                    children: [t.jsx(Ie, {
                        className: "w-3 h-3"
                    }), "Indicators"]
                })]
            }), t.jsxs("div", {
                className: "flex-1 flex min-h-0 overflow-hidden",
                children: [(() => {
                    const s = z !== null ? {
                        display: "grid",
                        gridTemplateColumns: "1fr",
                        gridTemplateRows: "1fr"
                    } : Te(X, ne.length);
                    return t.jsx("div", {
                        className: "flex-1 min-h-0 overflow-hidden",
                        style: s,
                        children: y ? t.jsx("div", {
                            className: "flex items-center justify-center h-full text-muted-foreground text-sm",
                            children: "Loading macro data from FRED..."
                        }) : ne.length === 0 ? t.jsx("div", {
                            className: "flex items-center justify-center h-full text-muted-foreground text-sm",
                            children: "Select series from the sidebar or choose a preset"
                        }) : ne.map(l => t.jsx(mt, {
                            pane: l,
                            allData: f || {},
                            height: 0,
                            isMaximized: z === l.id,
                            onMaximize: oe,
                            useFlexHeight: !0,
                            onRegisterChart: r,
                            onUnregisterChart: d,
                            onRegisterSeries: o,
                            onCrosshairMove: ie,
                            activeIndicators: F[l.id] || {},
                            chartType: W,
                            onUpdatePane: xe,
                            onRemoveSeriesFromPane: le,
                            onToggleSeriesVisibility: be,
                            onUpdateSeriesStyle: ge
                        }, l.id))
                    })
                })(), U && (() => {
                    const e = new Map(R.map((m, S) => [m.id, S])),
                        s = new Map(R.map((m, S) => [S, m.id])),
                        l = R.map((m, S) => ({
                            id: S,
                            label: m.label
                        })),
                        i = Z ? e.get(Z) ?? 0 : 0,
                        c = {};
                    for (const [m, S] of Object.entries(F)) {
                        const L = e.get(m);
                        L !== void 0 && (c[L] = S)
                    }
                    return t.jsx(Oe, {
                        panes: l,
                        indicatorsMap: c,
                        activePaneId: i,
                        onSelectPane: m => {
                            const S = s.get(m);
                            S && ae(S)
                        },
                        onChangeIndicators: (m, S) => {
                            const L = s.get(m);
                            L && b(v => ({
                                ...v,
                                [L]: S
                            }))
                        },
                        onClose: () => J(!1)
                    })
                })()]
            })]
        })]
    })
}
export {
    ht as
    default
};