import {
  a as wt,
  dR as Nt,
  r as g,
  bx as jt,
  M as Ye,
  a3 as Mt,
  dS as St,
  j as e,
  dT as Et,
  bT as Ct,
  X as Be,
  B as $e,
  a4 as ke,
  b7 as qe,
  z as Dt,
  C as Ge,
  bm as tt,
  bn as at
} from "./index-CsG73Aq_.js";
import {
  A as nt
} from "./arrow-up-down-CNMI3GZb.js";
const $t = [{
    label: "1Y",
    years: 1
  }, {
    label: "3Y",
    years: 3
  }, {
    label: "5Y",
    years: 5
  }, {
    label: "10Y",
    years: 10
  }, {
    label: "All",
    years: 999
  }],
  We = [{
    label: "30d",
    days: 30
  }, {
    label: "60d",
    days: 60
  }, {
    label: "90d",
    days: 90
  }, {
    label: "180d",
    days: 180
  }, {
    label: "1Y",
    days: 252
  }, {
    label: "2Y",
    days: 504
  }],
  At = 90,
  Qe = [{
    label: "1d",
    n: 1
  }, {
    label: "5d",
    n: 5
  }, {
    label: "10d",
    n: 10
  }, {
    label: "21d",
    n: 21
  }],
  Rt = 1,
  xe = .94,
  Ke = {
    broad: "Broad Market",
    style: "Style",
    sector: "S&P Sectors",
    reit: "REIT Benchmarks",
    sub_industry: "Sub-Industry",
    intl: "International",
    rates_bonds: "Rates & Bonds",
    commodities: "Commodities",
    vol_crypto: "Vol & Crypto"
  },
  Je = {
    broad: "Broad",
    style: "Style",
    sector: "Sectors",
    reit: "REITs",
    sub_industry: "Sub-Ind",
    intl: "Intl",
    rates_bonds: "Rates",
    commodities: "Commod",
    vol_crypto: "Vol/Cx"
  },
  Ze = ["broad", "style", "sector", "reit", "sub_industry", "intl", "rates_bonds", "commodities",
    "vol_crypto"
  ],
  Lt = [{
    ticker: "SPY",
    label: "SPY",
    name: "S&P 500 (SPY)",
    group: "broad"
  }, {
    ticker: "QQQ",
    label: "QQQ",
    name: "Nasdaq 100 (QQQ)",
    group: "broad"
  }, {
    ticker: "DIA",
    label: "DIA",
    name: "Dow Jones Industrial (DIA)",
    group: "broad"
  }, {
    ticker: "IWM",
    label: "IWM",
    name: "Russell 2000 (IWM)",
    group: "broad"
  }, {
    ticker: "MDY",
    label: "MDY",
    name: "S&P MidCap 400 (MDY)",
    group: "broad"
  }, {
    ticker: "VTI",
    label: "VTI",
    name: "Total US Market (VTI)",
    group: "broad"
  }, {
    ticker: "VTV",
    label: "VTV",
    name: "Vanguard Value (VTV)",
    group: "style"
  }, {
    ticker: "VUG",
    label: "VUG",
    name: "Vanguard Growth (VUG)",
    group: "style"
  }, {
    ticker: "XLK",
    label: "XLK",
    name: "Technology (XLK)",
    group: "sector"
  }, {
    ticker: "XLF",
    label: "XLF",
    name: "Financials (XLF)",
    group: "sector"
  }, {
    ticker: "XLE",
    label: "XLE",
    name: "Energy (XLE)",
    group: "sector"
  }, {
    ticker: "XLV",
    label: "XLV",
    name: "Health Care (XLV)",
    group: "sector"
  }, {
    ticker: "XLI",
    label: "XLI",
    name: "Industrials (XLI)",
    group: "sector"
  }, {
    ticker: "XLY",
    label: "XLY",
    name: "Consumer Discretionary (XLY)",
    group: "sector"
  }, {
    ticker: "XLP",
    label: "XLP",
    name: "Consumer Staples (XLP)",
    group: "sector"
  }, {
    ticker: "XLU",
    label: "XLU",
    name: "Utilities (XLU)",
    group: "sector"
  }, {
    ticker: "XLB",
    label: "XLB",
    name: "Materials (XLB)",
    group: "sector"
  }, {
    ticker: "XLC",
    label: "XLC",
    name: "Communication (XLC)",
    group: "sector"
  }, {
    ticker: "XLRE",
    label: "XLRE",
    name: "Real Estate Sector (XLRE)",
    group: "sector"
  }, {
    ticker: "VNQ",
    label: "VNQ",
    name: "Vanguard US REITs (VNQ)",
    group: "reit"
  }, {
    ticker: "IYR",
    label: "IYR",
    name: "iShares US Real Estate (IYR)",
    group: "reit"
  }, {
    ticker: "SCHH",
    label: "SCHH",
    name: "Schwab US REIT (SCHH)",
    group: "reit"
  }, {
    ticker: "RWR",
    label: "RWR",
    name: "SPDR Dow Jones REIT (RWR)",
    group: "reit"
  }, {
    ticker: "REM",
    label: "REM",
    name: "Mortgage REITs (REM)",
    group: "reit"
  }, {
    ticker: "MORT",
    label: "MORT",
    name: "VanEck Mortgage REIT (MORT)",
    group: "reit"
  }, {
    ticker: "SMH",
    label: "SMH",
    name: "Semiconductors (SMH)",
    group: "sub_industry"
  }, {
    ticker: "SOXX",
    label: "SOXX",
    name: "PHLX Semiconductor (SOXX)",
    group: "sub_industry"
  }, {
    ticker: "KRE",
    label: "KRE",
    name: "Regional Banks (KRE)",
    group: "sub_industry"
  }, {
    ticker: "KBE",
    label: "KBE",
    name: "Banks (KBE)",
    group: "sub_industry"
  }, {
    ticker: "ITB",
    label: "ITB",
    name: "Home Construction (ITB)",
    group: "sub_industry"
  }, {
    ticker: "XHB",
    label: "XHB",
    name: "Homebuilders (XHB)",
    group: "sub_industry"
  }, {
    ticker: "EFA",
    label: "EFA",
    name: "Developed Mkts ex-US (EFA)",
    group: "intl"
  }, {
    ticker: "EEM",
    label: "EEM",
    name: "Emerging Markets (EEM)",
    group: "intl"
  }, {
    ticker: "TLT",
    label: "TLT",
    name: "20+ Yr Treasuries (TLT)",
    group: "rates_bonds"
  }, {
    ticker: "IEF",
    label: "IEF",
    name: "7-10 Yr Treasuries (IEF)",
    group: "rates_bonds"
  }, {
    ticker: "SHY",
    label: "SHY",
    name: "1-3 Yr Treasuries (SHY)",
    group: "rates_bonds"
  }, {
    ticker: "TIP",
    label: "TIP",
    name: "TIPS (TIP)",
    group: "rates_bonds"
  }, {
    ticker: "LQD",
    label: "LQD",
    name: "Investment-Grade Corp (LQD)",
    group: "rates_bonds"
  }, {
    ticker: "HYG",
    label: "HYG",
    name: "High Yield Corp (HYG)",
    group: "rates_bonds"
  }, {
    ticker: "^TNX",
    label: "10Y",
    name: "10-Year Treasury Yield (^TNX)",
    group: "rates_bonds"
  }, {
    ticker: "GLD",
    label: "GLD",
    name: "Gold (GLD)",
    group: "commodities"
  }, {
    ticker: "SLV",
    label: "SLV",
    name: "Silver (SLV)",
    group: "commodities"
  }, {
    ticker: "USO",
    label: "USO",
    name: "Crude Oil (USO)",
    group: "commodities"
  }, {
    ticker: "UNG",
    label: "UNG",
    name: "Natural Gas (UNG)",
    group: "commodities"
  }, {
    ticker: "DBA",
    label: "DBA",
    name: "Agriculture (DBA)",
    group: "commodities"
  }, {
    ticker: "^VIX",
    label: "VIX",
    name: "CBOE Volatility Index (^VIX)",
    group: "vol_crypto"
  }, {
    ticker: "VXX",
    label: "VXX",
    name: "S&P 500 VIX Short-Term (VXX)",
    group: "vol_crypto"
  }, {
    ticker: "BTC-USD",
    label: "BTC",
    name: "Bitcoin (BTC-USD)",
    group: "vol_crypto"
  }, {
    ticker: "ETH-USD",
    label: "ETH",
    name: "Ethereum (ETH-USD)",
    group: "vol_crypto"
  }],
  It = ["broad", "reit", "rates_bonds"];
async function et(s) {
  const u = await fetch(`/api/yahoo-prices/${s}`);
  if (!u.ok) throw new Error(`HTTP ${u.status} for ${s}`);
  const d = await u.json();
  return {
    dates: d.dates,
    closes: d.adjCloses ?? d.closes
  }
}

function _t(s) {
  if (s.length < 2) return null;
  const u = s.reduce((b, p) => b + p, 0) / s.length,
    d = s.reduce((b, p) => b + (p - u) * (p - u), 0);
  return Math.sqrt(d / (s.length - 1))
}

function Tt(s) {
  const u = [];
  for (let d = 1; d < s.length; d++) {
    const b = s[d - 1],
      p = s[d];
    b != null && p != null && Number.isFinite(b) && Number.isFinite(p) && b > 0 && p > 0 && u.push(
      Math.log(p / b))
  }
  return u
}

function Ft(s, u) {
  if (u <= 1) return s.slice();
  if (s.length < u) return [];
  const d = new Array(s.length - u + 1);
  let b = 0;
  for (let p = 0; p < u; p++) b += s[p];
  d[0] = b;
  for (let p = u; p < s.length; p++) b += s[p] - s[p - u], d[p - u + 1] = b;
  return d
}

function zt(s, u = xe) {
  if (s.length < 5) return null;
  const d = Math.max(5, Math.min(20, Math.floor(s.length / 4))),
    b = s.slice(0, d),
    p = b.reduce((A, _) => A + _, 0) / d;
  let C = b.reduce((A, _) => A + (_ - p) * (_ - p), 0) / d;
  for (let A = d; A < s.length; A++) {
    const _ = s[A - 1];
    C = u * C + (1 - u) * _ * _
  }
  return !Number.isFinite(C) || C <= 0 ? null : Math.sqrt(C)
}

function Ae(s, u) {
  if (!Number.isFinite(u) || s.length === 0) return null;
  let d = 0,
    b = 0;
  for (const C of s) Number.isFinite(C) && (C < u ? d++ : C === u && b++);
  const p = s.length;
  return (d + .5 * b) / p * 100
}

function he(s, u, d, b) {
  if (u < 1) return {
    sigmaDaily: null,
    sigmaEwmaDaily: null,
    hvWindow: 0,
    nDayReturnDistribution: []
  };
  const p = Math.max(1, u - d + 1),
    C = s.slice(Math.max(0, p - 1), u + 1),
    A = Tt(C);
  if (A.length < 5) return {
    sigmaDaily: null,
    sigmaEwmaDaily: null,
    hvWindow: A.length,
    nDayReturnDistribution: []
  };
  const _ = _t(A),
    pe = zt(A),
    G = Ft(A, Math.max(1, b));
  return {
    sigmaDaily: _,
    sigmaEwmaDaily: pe,
    hvWindow: A.length,
    nDayReturnDistribution: G
  }
}

function K(s) {
  return s == null || !Number.isFinite(s) ? "—" : (s >= 100, s.toFixed(2))
}

function Re(s) {
  return s == null || !Number.isFinite(s) ? "—" : `${s>=0?"+":""}${s.toFixed(2)}`
}

function ve(s, u = 2) {
  return s == null || !Number.isFinite(s) ? "—" : `${s>=0?"+":""}${(s*100).toFixed(u)}%`
}

function U(s) {
  return s == null || !Number.isFinite(s) ? "—" : `${s>=0?"+":""}${s.toFixed(2)}σ`
}

function se(s) {
  return s == null || !Number.isFinite(s) ? "text-muted-foreground" : s > 0 ? "text-emerald-400" :
    s < 0 ? "text-red-400" : "text-muted-foreground"
}

function Y(s) {
  if (s == null || !Number.isFinite(s)) return "text-muted-foreground";
  const u = Math.abs(s);
  return u < 1 ? s > 0 ? "text-emerald-300/70" : "text-red-300/70" : u < 2 ? s > 0 ?
    "text-emerald-400" : "text-red-400" : u < 3 ? s > 0 ? "text-emerald-500 font-bold" :
    "text-orange-400 font-bold" : s > 0 ?
    "text-emerald-300 font-bold bg-emerald-500/10 px-1 rounded" :
    "text-red-300 font-bold bg-red-500/15 px-1 rounded"
}

function we(s) {
  if (s == null || !Number.isFinite(s)) return {
    label: "—",
    color: ""
  };
  const u = Math.abs(s);
  return u < 1 ? {
    label: "normal",
    color: "text-muted-foreground"
  } : u < 2 ? {
    label: "1σ",
    color: "text-amber-400"
  } : u < 3 ? {
    label: "2σ",
    color: "text-orange-400"
  } : {
    label: "3σ+",
    color: "text-red-400 font-bold"
  }
}

function Le(s) {
  return s == null || !Number.isFinite(s) ? "—" : s < 1 || s > 99 ? s.toFixed(2) + "%" : s.toFixed(
    1) + "%"
}

function Ie(s) {
  if (s == null || !Number.isFinite(s)) return "text-muted-foreground";
  const u = s,
    d = 100 - s,
    b = Math.min(u, d),
    p = s >= 50;
  return b < 1 ? p ? "text-emerald-300 font-bold bg-emerald-500/10 px-1 rounded" :
    "text-red-300 font-bold bg-red-500/15 px-1 rounded" : b < 5 ? p ? "text-emerald-500 font-bold" :
    "text-orange-400 font-bold" : b < 10 ? p ? "text-emerald-400" : "text-red-400" :
    "text-muted-foreground"
}

function Ot() {
  const {
    filteredTickersList: s
  } = wt(), {
      setLastQuoteFetchedAt: u
    } = Nt(), [d, b] = g.useState([]), [p, C] = g.useState(!1), [A, _] = g.useState(!1), [pe, G] = g
    .useState(null), [J, st] = g.useState(null), [ce, lt] = g.useState(null), [N, rt] = g.useState({
      key: "absSigmaMove",
      dir: "desc"
    }), [k, ot] = g.useState(() => {
      try {
        const n = localStorage.getItem("sigma-lookback-days-v1"),
          a = n == null ? NaN : parseInt(n, 10);
        if (We.some(r => r.days === a)) return a
      } catch {}
      return At
    });
  g.useEffect(() => {
    try {
      localStorage.setItem("sigma-lookback-days-v1", String(k))
    } catch {}
  }, [k]);
  const [h, it] = g.useState(() => {
    try {
      const n = localStorage.getItem("sigma-horizon-n-v1"),
        a = n == null ? NaN : parseInt(n, 10);
      if (Qe.some(r => r.n === a)) return a
    } catch {}
    return Rt
  });
  g.useEffect(() => {
    try {
      localStorage.setItem("sigma-horizon-n-v1", String(h))
    } catch {}
  }, [h]);
  const [y, _e] = g.useState(!1), [T, ct] = g.useState([]), [de, Te] = g.useState(!1), [W, dt] = g
    .useState(5), [I, ut] = g.useState({
      key: "absSigmaMove",
      dir: "desc"
    }), [Ne, je] = g.useState(null), [Me, mt] = g.useState([]), [gt, Fe] = g.useState(!1), ue = g
    .useRef(new Map), [be, ht] = g.useState([]), [Z, ze] = g.useState(() => {
      try {
        const n = localStorage.getItem("sigma-show-indices-v1");
        return n == null ? !0 : n === "1"
      } catch {
        return !0
      }
    });
  g.useEffect(() => {
    try {
      localStorage.setItem("sigma-show-indices-v1", Z ? "1" : "0")
    } catch {}
  }, [Z]);
  const [ee, xt] = g.useState(() => {
    try {
      const n = localStorage.getItem("sigma-index-groups-v1");
      if (n) {
        const a = JSON.parse(n);
        if (Array.isArray(a) && a.length > 0) {
          const r = a.filter(t => t in Ke);
          if (r.length > 0) return r
        }
      }
    } catch {}
    return It
  });
  g.useEffect(() => {
    try {
      localStorage.setItem("sigma-index-groups-v1", JSON.stringify(ee))
    } catch {}
  }, [ee]);
  const me = g.useMemo(() => Lt.filter(n => ee.includes(n.group)), [ee]),
    pt = g.useCallback(n => {
      xt(a => a.includes(n) ? a.filter(r => r !== n) : [...a, n])
    }, []),
    [le, Xe] = g.useState(""),
    Se = g.useMemo(() => le.toLowerCase().split(/[\s,]+/).map(n => n.trim()).filter(Boolean), [le]),
    Ve = g.useCallback((n, a) => {
      if (Se.length === 0) return !0;
      const r = n.toLowerCase(),
        t = (a || "").toLowerCase();
      return Se.some(l => r.includes(l) || t.includes(l))
    }, [Se]),
    Oe = g.useCallback(async () => {
      C(!0), G(null);
      try {
        const n = Math.max(k + h + 5, 504),
          a = await jt("close", n),
          r = new Set(s.map(l => l.ticker)),
          t = [];
        for (const l of a) {
          if (!r.has(l.ticker)) continue;
          const i = l.values || [],
            {
              sigmaDaily: m,
              sigmaEwmaDaily: o,
              hvWindow: c
            } = he(i, i.length - 1, k, h);
          t.push({
            ticker: l.ticker,
            name: l.name,
            sector: l.sector || "",
            subindustry: l.subindustry || "",
            closes: i,
            last: null,
            previousClose: null,
            quoteTime: null,
            marketState: null,
            dollarChange: null,
            pctChange: null,
            logReturnToday: null,
            logReturnN: null,
            pctChangeN: null,
            sigmaDaily: m,
            sigmaAnnualized: m != null ? m * Math.sqrt(252) : null,
            sigmaEwmaDaily: o,
            sigmaEwmaAnnualized: o != null ? o * Math.sqrt(252) : null,
            hvWindow: c,
            sigmaMove: null,
            sigmaMoveEwma: null,
            percentile: null,
            percentileN: 0
          })
        }
        t.sort((l, i) => l.ticker.localeCompare(i.ticker)), b(t)
      } catch (n) {
        G(n?.message || "Failed to load historical data")
      } finally {
        C(!1)
      }
    }, [s, k, h]);
  g.useEffect(() => {
    Oe()
  }, [Oe]);
  const He = g.useCallback(async () => {
    if (d.length) {
      _(!0), G(null);
      try {
        const n = d.map(m => m.ticker),
          a = await Ye("POST", "/api/quotes/live", {
            symbols: n
          });
        if (!a.ok) throw new Error(`HTTP ${a.status}`);
        const r = await a.json(),
          t = new Map;
        for (const m of r.quotes) t.set(m.symbol, m);
        const l = r.quotes.find(m => m.marketState);
        l?.marketState && lt(l.marketState);
        const i = Math.sqrt(Math.max(1, h));
        b(m => m.map(o => {
          const c = t.get(o.ticker);
          if (!c) return o;
          const f = c.last,
            D = c.previousClose,
            R = f != null && D != null ? f - D : null,
            w = f != null && D != null && D !== 0 ? (f - D) / D : null,
            j = f != null && D != null && f > 0 && D > 0 ? Math.log(f / D) : null,
            x = o.closes ?? [];
          let M = null;
          if (h <= 1) M = j;
          else if (f != null && f > 0 && x.length >= h) {
            const v = x[x.length - h];
            v != null && Number.isFinite(v) && v > 0 && (M = Math.log(f / v))
          }
          const z = M != null ? Math.exp(M) - 1 : null,
            L = M != null && o.sigmaDaily != null && o.sigmaDaily > 0 ? M / (o
              .sigmaDaily * i) : null,
            Q = M != null && o.sigmaEwmaDaily != null && o.sigmaEwmaDaily > 0 ? M / (o
              .sigmaEwmaDaily * i) : null;
          let S = null,
            $ = 0;
          if (M != null && x.length > 1) {
            const E = he(x, x.length - 1, k, h).nDayReturnDistribution;
            E.length > 0 && (S = Ae(E, M), $ = E.length)
          }
          return {
            ...o,
            last: f,
            previousClose: D,
            quoteTime: c.regularMarketTime,
            marketState: c.marketState,
            quoteError: c.error,
            dollarChange: R,
            pctChange: w,
            logReturnToday: j,
            logReturnN: M,
            pctChangeN: z,
            sigmaMove: L,
            sigmaMoveEwma: Q,
            percentile: S,
            percentileN: $
          }
        })), st(r.fetchedAt), u(Date.now())
      } catch (n) {
        G(n?.message || "Failed to fetch live quotes")
      } finally {
        _(!1)
      }
    }
  }, [d, k, h]);
  g.useEffect(() => {
    !y && d.length > 0 && !J && !A && He()
  }, [d.length, y]);
  const Pe = g.useCallback(async () => {
    Fe(!0);
    try {
      const n = me.map(l => l.ticker);
      await Promise.all(n.map(async l => {
        if (!ue.current.has(l)) try {
          const i = await et(l);
          ue.current.set(l, i)
        } catch (i) {
          console.warn("[Sigma] failed to load history for index", l, i?.message ??
            i)
        }
      }));
      let a = new Map;
      try {
        const l = await Ye("POST", "/api/quotes/live", {
          symbols: n
        });
        if (l.ok) {
          const i = await l.json();
          for (const m of i.quotes) a.set(m.symbol, m)
        }
      } catch {}
      const r = Math.sqrt(Math.max(1, h)),
        t = me.map(l => {
          const i = ue.current.get(l.ticker),
            m = a.get(l.ticker),
            o = i?.closes ?? [],
            {
              sigmaDaily: c,
              sigmaEwmaDaily: f,
              hvWindow: D,
              nDayReturnDistribution: R
            } = he(o, o.length - 1, k, h),
            w = m?.last ?? null,
            j = m?.previousClose ?? null,
            x = w != null && j != null ? w - j : null,
            M = w != null && j != null && j !== 0 ? (w - j) / j : null,
            z = w != null && j != null && w > 0 && j > 0 ? Math.log(w / j) : null;
          let L = null;
          if (h <= 1) L = z;
          else if (w != null && w > 0 && o.length >= h) {
            const E = o[o.length - h];
            E != null && Number.isFinite(E) && E > 0 && (L = Math.log(w / E))
          }
          const Q = L != null && c != null && c > 0 ? L / (c * r) : null,
            S = L != null && f != null && f > 0 ? L / (f * r) : null,
            $ = L != null && R.length > 0 ? Ae(R, L) : null,
            v = R.length;
          return {
            ticker: l.ticker,
            label: l.label,
            name: l.name,
            group: l.group,
            last: w,
            previousClose: j,
            dollarChange: x,
            pctChange: M,
            sigmaDaily: c,
            sigmaAnnualized: c != null ? c * Math.sqrt(252) : null,
            sigmaMove: Q,
            sigmaEwmaDaily: f,
            sigmaEwmaAnnualized: f != null ? f * Math.sqrt(252) : null,
            sigmaMoveEwma: S,
            percentile: $,
            percentileN: v,
            hvWindow: D,
            error: m?.error
          }
        });
      mt(t)
    } finally {
      Fe(!1)
    }
  }, [me, k, h]);
  g.useEffect(() => {
    y || Pe()
  }, [y, Pe, J]);
  const Ue = g.useCallback(async () => {
    Te(!0), G(null), je({
      done: 0,
      total: s.length
    });
    try {
      const a = `${new Date().getFullYear()-W}-01-01`,
        r = [],
        t = 8;
      for (let c = 0; c < s.length; c += t) {
        const f = s.slice(c, c + t),
          D = await Promise.all(f.map(async R => {
            try {
              const [w, j] = await Promise.all([Mt(R.ticker, "close"), St(R.ticker)]),
                x = (j.earnings || []).filter(v => typeof v == "string" && v.length ===
                  10).filter(v => W >= 999 || v >= a).sort(), M = Math.max(k + h + 5,
                  90);
              if (w.length < M || x.length === 0) return [];
              const z = w.map(v => v.time),
                L = w.map(v => v.value),
                Q = new Map;
              z.forEach((v, E) => Q.set(v, E));
              const S = Math.sqrt(Math.max(1, h)),
                $ = [];
              for (const v of x) {
                let E = Q.get(v);
                if (E == null) {
                  for (let ye = 0; ye < z.length; ye++)
                    if (z[ye] >= v) {
                      E = ye;
                      break
                    }
                }
                if (E == null || E < 1) continue;
                const te = E + h - 1;
                if (te >= z.length) continue;
                const ae = E - 1,
                  ne = L[te],
                  P = L[ae];
                if (ne == null || P == null || P <= 0 || ne <= 0) continue;
                const ge = ne - P,
                  re = ge / P,
                  fe = Math.log(ne / P),
                  {
                    sigmaDaily: oe,
                    sigmaEwmaDaily: ie,
                    hvWindow: ft,
                    nDayReturnDistribution: De
                  } = he(L, ae, k, h),
                  yt = oe != null && oe > 0 ? fe / (oe * S) : null,
                  kt = ie != null && ie > 0 ? fe / (ie * S) : null,
                  vt = De.length > 0 ? Ae(De, fe) : null;
                $.push({
                  ticker: R.ticker,
                  name: R.name,
                  earningsDate: v,
                  reactionDate: z[te],
                  priorDate: z[ae],
                  closeOnDate: ne,
                  priorClose: P,
                  dollarChange: ge,
                  pctChange: re,
                  logReturn: fe,
                  sigmaDaily: oe,
                  sigmaAnnualized: oe != null ? oe * Math.sqrt(252) : null,
                  sigmaEwmaDaily: ie,
                  sigmaEwmaAnnualized: ie != null ? ie * Math.sqrt(252) : null,
                  hvWindow: ft,
                  sigmaMove: yt,
                  sigmaMoveEwma: kt,
                  percentile: vt,
                  percentileN: De.length
                })
              }
              return $
            } catch {
              return []
            }
          }));
        for (const R of D) r.push(...R);
        je({
          done: Math.min(c + t, s.length),
          total: s.length
        })
      }
      ct(r);
      const l = Array.from(new Set(r.map(c => c.reactionDate))).sort(),
        i = new Map;
      for (const c of r) i.has(c.reactionDate) || i.set(c.reactionDate, c.priorDate);
      const m = [],
        o = Math.sqrt(Math.max(1, h));
      for (const c of me) {
        let f = ue.current.get(c.ticker);
        if (!f) try {
          f = await et(c.ticker), ue.current.set(c.ticker, f)
        } catch (S) {
          m.push({
            ticker: c.ticker,
            label: c.label,
            name: c.name,
            group: c.group,
            avgSigma: null,
            avgAbsSigma: null,
            pctAbsGte1: null,
            byDate: new Map,
            error: S?.message ?? String(S)
          });
          continue
        }
        const D = f.closes,
          R = f.dates,
          w = new Map;
        R.forEach((S, $) => w.set(S, $));
        const j = new Map,
          x = [];
        for (const S of l) {
          let $ = w.get(S);
          if ($ == null) {
            for (let re = 0; re < R.length; re++)
              if (R[re] >= S) {
                $ = re;
                break
              }
          }
          if ($ == null || $ < 1) continue;
          const v = Math.max(1, h),
            E = $ - v;
          if (E < 1) continue;
          const te = D[$],
            ae = D[E];
          if (!Number.isFinite(te) || !Number.isFinite(ae) || te <= 0 || ae <= 0) continue;
          const ne = Math.log(te / ae),
            {
              sigmaDaily: P
            } = he(D, E, k, h);
          if (P == null || P <= 0) continue;
          const ge = ne / (P * o);
          j.set(S, ge), x.push(ge)
        }
        const M = x.length,
          z = M > 0 ? x.reduce((S, $) => S + $, 0) / M : null,
          L = M > 0 ? x.reduce((S, $) => S + Math.abs($), 0) / M : null,
          Q = M > 0 ? x.filter(S => Math.abs(S) >= 1).length / M : null;
        m.push({
          ticker: c.ticker,
          label: c.label,
          name: c.name,
          group: c.group,
          avgSigma: z,
          avgAbsSigma: L,
          pctAbsGte1: Q,
          byDate: j
        })
      }
      ht(m)
    } catch (n) {
      G(n?.message || "Failed to compute earnings-day sigma moves")
    } finally {
      Te(!1), je(null)
    }
  }, [s, W, me, k, h]);
  g.useEffect(() => {
    y && Ue()
  }, [y, W, s, ee]);
  const Ee = g.useMemo(() => {
      const n = T.slice(),
        a = I.dir === "asc" ? 1 : -1;
      return n.sort((r, t) => {
        let l = null,
          i = null;
        const m = I.key;
        return m === "earningsDate" ? (l = r.earningsDate, i = t.earningsDate) : m ===
          "ticker" ? (l = r.ticker, i = t.ticker) : m === "closeOnDate" ? (l = r.closeOnDate,
            i = t.closeOnDate) : m === "dollarChange" ? (l = r.dollarChange, i = t
            .dollarChange) : m === "pctChange" ? (l = r.pctChange, i = t.pctChange) : m ===
          "sigmaAnnualized" ? (l = r.sigmaAnnualized, i = t.sigmaAnnualized) : m ===
          "sigmaEwmaAnnualized" ? (l = r.sigmaEwmaAnnualized, i = t.sigmaEwmaAnnualized) :
          m === "sigmaMove" ? (l = r.sigmaMove, i = t.sigmaMove) : m === "sigmaMoveEwma" ? (
            l = r.sigmaMoveEwma, i = t.sigmaMoveEwma) : m === "percentile" ? (l = r
            .percentile, i = t.percentile) : m === "absSigmaMove" && (l = r.sigmaMove ==
            null ? null : Math.abs(r.sigmaMove), i = t.sigmaMove == null ? null : Math.abs(t
              .sigmaMove)), l == null && i == null ? 0 : l == null ? 1 : i == null ? -1 :
          typeof l == "string" && typeof i == "string" ? l.localeCompare(i) * a : (l - i) * a
      }), n
    }, [T, I]),
    F = g.useMemo(() => {
      const n = T.filter(c => c.sigmaMove != null),
        a = n.length,
        r = n.filter(c => Math.abs(c.sigmaMove) >= 1).length,
        t = n.filter(c => Math.abs(c.sigmaMove) >= 2).length,
        l = n.filter(c => Math.abs(c.sigmaMove) >= 3).length,
        i = n.filter(c => (c.sigmaMove ?? 0) > 0).length,
        m = n.filter(c => (c.sigmaMove ?? 0) < 0).length,
        o = a > 0 ? n.reduce((c, f) => c + Math.abs(f.sigmaMove), 0) / a : null;
      return {
        total: a,
        oneSig: r,
        twoSig: t,
        threeSig: l,
        winners: i,
        losers: m,
        avgAbs: o
      }
    }, [T]),
    X = n => {
      ut(a => a.key === n ? {
        key: n,
        dir: a.dir === "asc" ? "desc" : "asc"
      } : {
        key: n,
        dir: "desc"
      })
    },
    Ce = g.useMemo(() => {
      const n = d.slice(),
        a = N.dir === "asc" ? 1 : -1;
      return n.sort((r, t) => {
        let l = null,
          i = null;
        return N.key === "ticker" ? (l = r.ticker, i = t.ticker) : N.key === "last" ? (l = r
            .last, i = t.last) : N.key === "dollarChange" ? (l = r.dollarChange, i = t
            .dollarChange) : N.key === "pctChange" ? (l = r.pctChange, i = t.pctChange) : N
          .key === "sigmaAnnualized" ? (l = r.sigmaAnnualized, i = t.sigmaAnnualized) : N
          .key === "sigmaEwmaAnnualized" ? (l = r.sigmaEwmaAnnualized, i = t
            .sigmaEwmaAnnualized) : N.key === "sigmaMove" ? (l = r.sigmaMove, i = t
          .sigmaMove) : N.key === "sigmaMoveEwma" ? (l = r.sigmaMoveEwma, i = t
          .sigmaMoveEwma) : N.key === "percentile" ? (l = r.percentile, i = t.percentile) : N
          .key === "absSigmaMove" && (l = r.sigmaMove == null ? null : Math.abs(r.sigmaMove),
            i = t.sigmaMove == null ? null : Math.abs(t.sigmaMove)), l == null && i == null ?
          0 : l == null ? 1 : i == null ? -1 : typeof l == "string" && typeof i == "string" ?
          l.localeCompare(i) * a : (l - i) * a
      }), n
    }, [d, N]),
    O = g.useMemo(() => {
      const n = d.filter(o => o.sigmaMove != null),
        a = n.length,
        r = n.filter(o => Math.abs(o.sigmaMove) >= 1).length,
        t = n.filter(o => Math.abs(o.sigmaMove) >= 2).length,
        l = n.filter(o => Math.abs(o.sigmaMove) >= 3).length,
        i = n.filter(o => (o.sigmaMove ?? 0) > 0).length,
        m = n.filter(o => (o.sigmaMove ?? 0) < 0).length;
      return {
        total: a,
        oneSig: r,
        twoSig: t,
        threeSig: l,
        winners: i,
        losers: m
      }
    }, [d]),
    H = n => {
      rt(a => a.key === n ? {
        key: n,
        dir: a.dir === "asc" ? "desc" : "asc"
      } : {
        key: n,
        dir: "desc"
      })
    },
    bt = g.useCallback(() => {
      if (y) {
        const o = ["ticker", "name", "earnings_date", "reaction_date", "prior_date",
            "close_on_date", "prior_close", "dollar_change", "pct_change", "sigma_daily",
            "sigma_annualized", "sigma_move", "sigma_ewma_daily", "sigma_ewma_annualized",
            "sigma_move_ewma", "percentile", "percentile_n", "hv_window"
          ],
          c = Ee.map(x => [x.ticker, `"${x.name.replace(/"/g,'""')}"`, x.earningsDate, x
            .reactionDate, x.priorDate, x.closeOnDate ?? "", x.priorClose ?? "", x
            .dollarChange ?? "", x.pctChange ?? "", x.sigmaDaily ?? "", x.sigmaAnnualized ?? "",
            x.sigmaMove ?? "", x.sigmaEwmaDaily ?? "", x.sigmaEwmaAnnualized ?? "", x
            .sigmaMoveEwma ?? "", x.percentile ?? "", x.percentileN ?? 0, x.hvWindow
          ]),
          D = [...["# Sigma Move — Earnings days",
            `# Lookback (years of prints): ${W>=999?"all":W+"Y"}`,
            `# Vol lookback: ${k}d  |  Horizon: ${h}d`,
            `# Universe: ${s.length} tickers / ${T.length} prints`
          ], o.join(","), ...c.map(x => x.join(","))].join(`
`),
          R = new Blob([D], {
            type: "text/csv"
          }),
          w = URL.createObjectURL(R),
          j = document.createElement("a");
        j.href = w, j.download =
          `sigma-move-earnings-${new Date().toISOString().slice(0,10)}.csv`, j.click(), URL
          .revokeObjectURL(w);
        return
      }
      const n = ["ticker", "name", "last", "previous_close", "dollar_change", "pct_change",
          "log_return_today", "log_return_n", "pct_change_n", "sigma_daily", "sigma_annualized",
          "sigma_move", "sigma_ewma_daily", "sigma_ewma_annualized", "sigma_move_ewma",
          "percentile", "percentile_n", "hv_window"
        ],
        a = Ce.map(o => [o.ticker, `"${o.name.replace(/"/g,'""')}"`, o.last ?? "", o
          .previousClose ?? "", o.dollarChange ?? "", o.pctChange ?? "", o.logReturnToday ?? "",
          o.logReturnN ?? "", o.pctChangeN ?? "", o.sigmaDaily ?? "", o.sigmaAnnualized ?? "", o
          .sigmaMove ?? "", o.sigmaEwmaDaily ?? "", o.sigmaEwmaAnnualized ?? "", o
          .sigmaMoveEwma ?? "", o.percentile ?? "", o.percentileN ?? 0, o.hvWindow
        ]),
        t = [...["# Sigma Move snapshot", `# Fetched: ${J||"n/a"}`,
          `# Market state: ${ce||"unknown"}`, `# Vol lookback: ${k}d  |  Horizon: ${h}d`,
          `# Universe: ${d.length} tickers`
        ], n.join(","), ...a.map(o => o.join(","))].join(`
`),
        l = new Blob([t], {
          type: "text/csv"
        }),
        i = URL.createObjectURL(l),
        m = document.createElement("a");
      m.href = i, m.download = `sigma-move-${new Date().toISOString().slice(0,10)}.csv`, m
      .click(), URL.revokeObjectURL(i)
    }, [y, Ce, Ee, J, ce, d.length, W, T.length, s.length, k, h]);
  return e.jsxs("div", {
    className: "flex flex-col h-full bg-background",
    children: [e.jsxs("div", {
      className: "border-b border-border bg-card px-4 py-2",
      children: [e.jsxs("div", {
        className: "flex items-center gap-3 flex-wrap",
        children: [e.jsxs("div", {
          className: "flex flex-col",
          children: [e.jsx("h1", {
            className: "text-sm font-bold uppercase tracking-wider",
            children: "Sigma Snapshot"
          }), e.jsx("span", {
            className: "text-[10px] text-muted-foreground",
            children: y ?
              `Sigma move on each earnings print. ${h}-day log return scaled by σ (RV / EWMA) over a ${k}-day window ending the trading day before the print.` :
              `${h===1?"Today's move":`${h}-day move`} scaled by ${k}-day log-return vol (RV / EWMA λ=${xe}) + empirical percentile rank. Live quotes via Yahoo Finance (~15-min delayed).`
          })]
        }), e.jsxs("div", {
          className: "flex items-center rounded border border-border overflow-hidden text-[11px]",
          children: [e.jsx("button", {
            type: "button",
            onClick: () => _e(!1),
            className: `px-2.5 py-1 transition-colors ${y?"text-muted-foreground hover:text-foreground":"bg-amber-500/15 text-amber-300"}`,
            "data-testid": "btn-mode-live",
            children: "Live (today)"
          }), e.jsxs("button", {
            type: "button",
            onClick: () => _e(!0),
            className: `px-2.5 py-1 inline-flex items-center gap-1 transition-colors ${y?"bg-amber-500/15 text-amber-300":"text-muted-foreground hover:text-foreground"}`,
            "data-testid": "btn-mode-earnings",
            children: [e.jsx(Et, {
              className: "w-3 h-3"
            }), "Earnings days"]
          })]
        }), y && e.jsx("div", {
          className: "flex items-center rounded border border-border overflow-hidden text-[10px] font-mono",
          children: $t.map(n => e.jsx("button", {
            type: "button",
            onClick: () => dt(n.years),
            className: `px-2 py-1 transition-colors ${W===n.years?"bg-amber-500/15 text-amber-300":"text-muted-foreground hover:text-foreground"}`,
            "data-testid": `btn-lookback-${n.label}`,
            children: n.label
          }, n.label))
        }), e.jsxs("div", {
          className: "flex items-center rounded border border-border overflow-hidden text-[10px] font-mono",
          title: "Lookback window used to compute realized vol, EWMA vol, and the empirical percentile distribution",
          children: [e.jsx("span", {
            className: "px-1.5 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/80 border-r border-border",
            children: "σ LB"
          }), We.map(n => e.jsx("button", {
            type: "button",
            onClick: () => ot(n.days),
            className: `px-2 py-1 transition-colors ${k===n.days?"bg-amber-500/15 text-amber-300":"text-muted-foreground hover:text-foreground"}`,
            "data-testid": `btn-sigma-lookback-${n.label}`,
            children: n.label
          }, n.label))]
        }), e.jsxs("div", {
          className: "flex items-center rounded border border-border overflow-hidden text-[10px] font-mono",
          title: `Return horizon in trading days. σ-move denominator scales by √N (= ${Math.sqrt(Math.max(1,h)).toFixed(2)})`,
          children: [e.jsx("span", {
            className: "px-1.5 py-1 text-[9px] uppercase tracking-wider text-muted-foreground/80 border-r border-border",
            children: "Horizon"
          }), Qe.map(n => e.jsx("button", {
            type: "button",
            onClick: () => it(n.n),
            className: `px-2 py-1 transition-colors ${h===n.n?"bg-amber-500/15 text-amber-300":"text-muted-foreground hover:text-foreground"}`,
            "data-testid": `btn-horizon-${n.label}`,
            children: n.label
          }, n.label))]
        }), e.jsx("div", {
          className: "flex-1"
        }), e.jsxs("div", {
          className: "flex items-center gap-3 text-[10px] font-mono text-muted-foreground",
          children: [!y && ce && e.jsxs("span", {
            className: "flex items-center gap-1",
            children: [e.jsx("span", {
              className: `w-1.5 h-1.5 rounded-full ${ce==="REGULAR"?"bg-emerald-400 animate-pulse":"bg-amber-400"}`
            }), ce]
          }), !y && J && e.jsxs("span", {
            title: J,
            children: ["Quotes: ", new Date(J).toLocaleTimeString(
              "en-US", {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit"
              })]
          }), y ? e.jsxs("span", {
            children: [T.length.toLocaleString(), " prints · ", s
              .length, " tickers"
            ]
          }) : e.jsxs("span", {
            children: [d.length, " tickers"]
          })]
        }), e.jsxs("div", {
          className: "relative flex items-center",
          children: [e.jsx(Ct, {
            className: "absolute left-2 w-3 h-3 text-muted-foreground pointer-events-none"
          }), e.jsx("input", {
            type: "text",
            value: le,
            onChange: n => Xe(n.target.value),
            placeholder: "Search ticker…",
            className: "h-7 pl-6 pr-7 text-[11px] font-mono bg-background border border-border rounded w-[160px] focus:outline-none focus:border-amber-500/60",
            "data-testid": "input-ticker-search"
          }), le && e.jsx("button", {
            type: "button",
            onClick: () => Xe(""),
            className: "absolute right-1 p-0.5 text-muted-foreground hover:text-foreground rounded",
            "data-testid": "btn-clear-ticker-search",
            "aria-label": "Clear search",
            children: e.jsx(Be, {
              className: "w-3 h-3"
            })
          })]
        }), !y && e.jsxs($e, {
          variant: "outline",
          size: "sm",
          className: "h-7 gap-1 text-[11px]",
          onClick: He,
          disabled: A || p || d.length === 0,
          "data-testid": "refresh-quotes",
          children: [A ? e.jsx(ke, {
            className: "w-3 h-3 animate-spin"
          }) : e.jsx(qe, {
            className: "w-3 h-3"
          }), "Refresh quotes"]
        }), y && e.jsxs($e, {
          variant: "outline",
          size: "sm",
          className: "h-7 gap-1 text-[11px]",
          onClick: Ue,
          disabled: de,
          "data-testid": "reload-earnings",
          children: [de ? e.jsx(ke, {
            className: "w-3 h-3 animate-spin"
          }) : e.jsx(qe, {
            className: "w-3 h-3"
          }), "Recompute"]
        }), e.jsxs($e, {
          variant: "outline",
          size: "sm",
          className: "h-7 gap-1 text-[11px]",
          onClick: bt,
          disabled: y ? T.length === 0 : d.length === 0,
          "data-testid": "export-csv",
          children: [e.jsx(Dt, {
            className: "w-3 h-3"
          }), "CSV"]
        })]
      }), !y && d.length > 0 && e.jsxs("div", {
        className: "flex items-center gap-3 mt-2 text-[10px] font-mono",
        children: [e.jsx(B, {
          label: "|σ| ≥ 1",
          value: O.oneSig,
          total: O.total,
          color: "text-amber-400"
        }), e.jsx(B, {
          label: "|σ| ≥ 2",
          value: O.twoSig,
          total: O.total,
          color: "text-orange-400"
        }), e.jsx(B, {
          label: "|σ| ≥ 3",
          value: O.threeSig,
          total: O.total,
          color: "text-red-400"
        }), e.jsx("span", {
          className: "text-muted-foreground",
          children: "|"
        }), e.jsx(B, {
          label: "up",
          value: O.winners,
          total: O.total,
          color: "text-emerald-400"
        }), e.jsx(B, {
          label: "down",
          value: O.losers,
          total: O.total,
          color: "text-red-400"
        })]
      }), y && T.length > 0 && e.jsxs("div", {
        className: "flex items-center gap-3 mt-2 text-[10px] font-mono",
        children: [e.jsx(B, {
          label: "|σ| ≥ 1",
          value: F.oneSig,
          total: F.total,
          color: "text-amber-400"
        }), e.jsx(B, {
          label: "|σ| ≥ 2",
          value: F.twoSig,
          total: F.total,
          color: "text-orange-400"
        }), e.jsx(B, {
          label: "|σ| ≥ 3",
          value: F.threeSig,
          total: F.total,
          color: "text-red-400"
        }), e.jsx("span", {
          className: "text-muted-foreground",
          children: "|"
        }), e.jsx(B, {
          label: "up",
          value: F.winners,
          total: F.total,
          color: "text-emerald-400"
        }), e.jsx(B, {
          label: "down",
          value: F.losers,
          total: F.total,
          color: "text-red-400"
        }), F.avgAbs != null && e.jsxs(e.Fragment, {
          children: [e.jsx("span", {
            className: "text-muted-foreground",
            children: "|"
          }), e.jsxs("span", {
            className: "flex items-center gap-1",
            children: [e.jsx("span", {
              className: "text-muted-foreground uppercase tracking-wider",
              children: "avg |σ|:"
            }), e.jsxs("span", {
              className: "text-foreground",
              children: [F.avgAbs.toFixed(2), "σ"]
            })]
          })]
        })]
      }), Z && e.jsxs("div", {
        className: "mt-2 text-[10px] font-mono",
        children: [e.jsxs("div", {
          className: "flex items-center gap-1.5 flex-wrap mb-1.5",
          children: [e.jsxs("span", {
            className: "inline-flex items-center gap-1 text-muted-foreground uppercase tracking-wider mr-1",
            children: [e.jsx(Ge, {
                className: "w-3 h-3"
              }), y ? "Index avg |σ| on these dates" :
              "Index σ today", ":"
            ]
          }), Ze.map(n => {
            const a = ee.includes(n);
            return e.jsxs("button", {
              type: "button",
              onClick: () => pt(n),
              title: `${Ke[n]} — click to ${a?"hide":"show"}`,
              "data-testid": `btn-index-group-${n}`,
              className: `px-2 py-0.5 rounded border text-[10px] transition-colors ${a?"border-amber-400/60 bg-amber-500/15 text-amber-200":"border-border bg-background text-muted-foreground hover:text-foreground hover:border-border"}`,
              children: [Je[n], a && e.jsx("span", {
                className: "ml-1 text-amber-300",
                children: "✓"
              })]
            }, n)
          }), e.jsx("span", {
            className: "flex-1"
          }), e.jsx("button", {
            type: "button",
            onClick: () => ze(!1),
            className: "text-muted-foreground hover:text-foreground px-1",
            title: "Hide index banner",
            "data-testid": "btn-hide-indices",
            children: e.jsx(Be, {
              className: "w-3 h-3"
            })
          })]
        }), !y && gt && Me.length === 0 && e.jsx("span", {
          className: "text-muted-foreground",
          children: "loading…"
        }), y && be.length === 0 && T.length > 0 && e.jsx("span", {
          className: "text-muted-foreground",
          children: "computing…"
        }), Ze.filter(n => ee.includes(n)).map(n => {
          const a = y ? [] : Me.filter(t => t.group === n),
            r = y ? be.filter(t => t.group === n) : [];
          return a.length === 0 && r.length === 0 ? null : e.jsxs("div", {
            className: "flex items-center gap-1.5 flex-wrap mb-1",
            "data-testid": `index-group-row-${n}`,
            children: [e.jsxs("span", {
              className: "inline-block w-[68px] text-[9px] uppercase tracking-wider text-muted-foreground/80",
              children: [Je[n], ":"]
            }), a.map(t => {
              const l = we(t.sigmaMove);
              return e.jsxs("span", {
                className: "inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background",
                title: `${t.name} — last: ${K(t.last)} · prev: ${K(t.previousClose)} · ${k}d HV ann: ${t.sigmaAnnualized!=null?(t.sigmaAnnualized*100).toFixed(1)+"%":"—"} · EWMA ann: ${t.sigmaEwmaAnnualized!=null?(t.sigmaEwmaAnnualized*100).toFixed(1)+"%":"—"}`,
                "data-testid": `index-chip-${t.ticker}`,
                children: [e.jsx("span", {
                  className: "text-foreground font-bold",
                  children: t.label
                }), e.jsx("span", {
                  className: se(t.pctChange),
                  children: ve(t.pctChange)
                }), e.jsx("span", {
                  className: `${Y(t.sigmaMove)} ml-0.5`,
                  children: U(t.sigmaMove)
                }), e.jsx("span", {
                  className: `text-[9px] uppercase ${l.color}`,
                  children: l.label
                })]
              }, t.ticker)
            }), r.map(t => e.jsxs("span", {
              className: "inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background",
              title: `${t.name} — avg signed σ: ${t.avgSigma!=null?t.avgSigma.toFixed(2):"—"} · share |σ| ≥ 1: ${t.pctAbsGte1!=null?(t.pctAbsGte1*100).toFixed(0)+"%":"—"}`,
              "data-testid": `index-chip-${t.ticker}`,
              children: [e.jsx("span", {
                className: "text-foreground font-bold",
                children: t.label
              }), e.jsx("span", {
                className: "text-foreground",
                children: t.avgAbsSigma != null ?
                  `${t.avgAbsSigma.toFixed(2)}σ` : "—"
              }), e.jsxs("span", {
                className: "text-muted-foreground",
                children: ["|σ|≥1: ", t.pctAbsGte1 != null ?
                  `${(t.pctAbsGte1*100).toFixed(0)}%` :
                  "—"
                ]
              })]
            }, t.ticker))]
          }, n)
        })]
      }), !Z && e.jsx("div", {
        className: "mt-2",
        children: e.jsxs("button", {
          type: "button",
          onClick: () => ze(!0),
          className: "inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5",
          "data-testid": "btn-show-indices",
          children: [e.jsx(Ge, {
            className: "w-3 h-3"
          }), "Show index σ"]
        })
      })]
    }), e.jsxs("div", {
      className: "flex-1 overflow-auto",
      children: [pe && e.jsx("div", {
        className: "m-4 text-sm text-red-400 p-3 border border-red-500/30 rounded bg-red-500/5",
        children: pe
      }), !y && p && d.length === 0 && e.jsxs("div", {
        className: "flex items-center justify-center h-32",
        children: [e.jsx(ke, {
          className: "w-5 h-5 animate-spin text-muted-foreground"
        }), e.jsxs("span", {
          className: "ml-2 text-sm text-muted-foreground",
          children: ["Loading ", k,
            "-day vol (RV + EWMA) + percentile distribution…"
          ]
        })]
      }), y && de && e.jsxs("div", {
        className: "flex items-center justify-center h-32",
        children: [e.jsx(ke, {
          className: "w-5 h-5 animate-spin text-muted-foreground"
        }), e.jsxs("span", {
          className: "ml-2 text-sm text-muted-foreground",
          children: ["Computing sigma move per earnings print", Ne ?
            ` · ${Ne.done}/${Ne.total} tickers` : "", "…"
          ]
        })]
      }), y && !de && T.length === 0 && e.jsx("div", {
        className: "flex items-center justify-center h-32 text-sm text-muted-foreground",
        children: "No earnings prints found in the selected lookback window."
      }), y && !de && T.length > 0 && (() => {
        const n = Ee.filter(a => Ve(a.ticker, a.name));
        return n.length === 0 ? e.jsxs("div", {
          className: "flex items-center justify-center h-32 text-sm text-muted-foreground",
          children: ["No tickers match “", le, "”."]
        }) : e.jsxs("table", {
          className: "w-full text-[11px] font-mono",
          children: [e.jsx("thead", {
            className: "sticky top-0 z-10 bg-card border-b border-border",
            children: e.jsxs("tr", {
              className: "text-muted-foreground",
              children: [e.jsx(V, {
                label: "Earnings Date",
                k: "earningsDate",
                sort: I,
                onClick: X,
                align: "left"
              }), e.jsx(V, {
                label: "Ticker",
                k: "ticker",
                sort: I,
                onClick: X,
                align: "left"
              }), e.jsx("th", {
                className: "text-left px-3 py-2 font-bold",
                children: "Name"
              }), e.jsx(V, {
                label: "Close",
                k: "closeOnDate",
                sort: I,
                onClick: X,
                align: "right"
              }), e.jsx("th", {
                className: "text-right px-3 py-2 font-bold",
                children: "Prior Close"
              }), e.jsx(V, {
                label: "$ Change",
                k: "dollarChange",
                sort: I,
                onClick: X,
                align: "right"
              }), e.jsx(V, {
                label: "% Change",
                k: "pctChange",
                sort: I,
                onClick: X,
                align: "right"
              }), e.jsx(V, {
                label: `${k}d HV (ann.)`,
                k: "sigmaAnnualized",
                sort: I,
                onClick: X,
                align: "right"
              }), e.jsx(V, {
                label: "EWMA HV (ann.)",
                k: "sigmaEwmaAnnualized",
                sort: I,
                onClick: X,
                align: "right"
              }), e.jsx(V, {
                label: "σ Move",
                k: "sigmaMove",
                sort: I,
                onClick: X,
                align: "right"
              }), e.jsx(V, {
                label: "σ Move (EWMA)",
                k: "sigmaMoveEwma",
                sort: I,
                onClick: X,
                align: "right"
              }), e.jsx(V, {
                label: "|σ|",
                k: "absSigmaMove",
                sort: I,
                onClick: X,
                align: "right"
              }), e.jsx(V, {
                label: "Pctile",
                k: "percentile",
                sort: I,
                onClick: X,
                align: "right"
              }), Z && e.jsxs(e.Fragment, {
                children: [e.jsx("th", {
                  className: "text-right px-3 py-2 font-bold text-amber-300/80",
                  title: "SPY σ move on the same reaction date — market context",
                  children: "SPY σ"
                }), e.jsx("th", {
                  className: "text-right px-3 py-2 font-bold text-amber-300/80",
                  title: "VNQ σ move on the same reaction date — REIT-sector context",
                  children: "VNQ σ"
                }), e.jsx("th", {
                  className: "text-right px-3 py-2 font-bold text-amber-300/80",
                  title: "Stock σ minus SPY σ — idiosyncratic component vs the broad market",
                  children: "Δσ vs SPY"
                })]
              })]
            })
          }), e.jsx("tbody", {
            children: (() => {
              const a = be.find(t => t.ticker === "SPY")?.byDate,
                r = be.find(t => t.ticker === "VNQ")?.byDate;
              return n.map((t, l) => {
                const i = we(t.sigmaMove),
                  m = t.reactionDate === t.earningsDate ? t
                  .earningsDate :
                  `${t.earningsDate} → ${t.reactionDate}`,
                  o = a?.get(t.reactionDate) ?? null,
                  c = r?.get(t.reactionDate) ?? null,
                  f = t.sigmaMove != null && o != null ? t
                  .sigmaMove - o : null;
                return e.jsxs("tr", {
                  className: "border-b border-border/50 hover:bg-white/5",
                  children: [e.jsx("td", {
                    className: "px-3 py-1.5 text-foreground",
                    title: m,
                    children: t.earningsDate
                  }), e.jsx("td", {
                    className: "px-3 py-1.5 font-bold text-foreground",
                    children: t.ticker
                  }), e.jsx("td", {
                    className: "px-3 py-1.5 text-muted-foreground truncate max-w-[260px]",
                    title: t.name,
                    children: t.name
                  }), e.jsx("td", {
                    className: "px-3 py-1.5 text-right",
                    children: K(t.closeOnDate)
                  }), e.jsx("td", {
                    className: "px-3 py-1.5 text-right text-muted-foreground",
                    children: K(t.priorClose)
                  }), e.jsx("td", {
                    className: `px-3 py-1.5 text-right ${se(t.dollarChange)}`,
                    children: Re(t.dollarChange)
                  }), e.jsx("td", {
                    className: `px-3 py-1.5 text-right ${se(t.pctChange)}`,
                    children: ve(t.pctChange)
                  }), e.jsx("td", {
                    className: "px-3 py-1.5 text-right text-muted-foreground",
                    title: t.sigmaDaily != null ?
                      `daily: ${(t.sigmaDaily*100).toFixed(2)}% · window: ${t.hvWindow} returns ending ${t.priorDate}` :
                      void 0,
                    children: t.sigmaAnnualized !=
                      null ?
                      `${(t.sigmaAnnualized*100).toFixed(1)}%` :
                      "—"
                  }), e.jsx("td", {
                    className: "px-3 py-1.5 text-right text-muted-foreground",
                    title: t.sigmaEwmaDaily != null ?
                      `EWMA daily (λ=${xe}): ${(t.sigmaEwmaDaily*100).toFixed(2)}% · ending ${t.priorDate}` :
                      void 0,
                    children: t.sigmaEwmaAnnualized !=
                      null ?
                      `${(t.sigmaEwmaAnnualized*100).toFixed(1)}%` :
                      "—"
                  }), e.jsx("td", {
                    className: `px-3 py-1.5 text-right ${Y(t.sigmaMove)}`,
                    children: U(t.sigmaMove)
                  }), e.jsx("td", {
                    className: `px-3 py-1.5 text-right ${Y(t.sigmaMoveEwma)}`,
                    title: t.sigmaMoveEwma != null ?
                      `Log return / (σ_EWMA · √${h})` :
                      void 0,
                    children: U(t.sigmaMoveEwma)
                  }), e.jsx("td", {
                    className: `px-3 py-1.5 text-right text-[10px] uppercase tracking-wider ${i.color}`,
                    children: i.label
                  }), e.jsx("td", {
                    className: `px-3 py-1.5 text-right ${Ie(t.percentile)}`,
                    title: t.percentile != null ?
                      `Rank of ${h}-day log return in trailing ${t.percentileN} obs (${k}d window)` :
                      void 0,
                    children: Le(t.percentile)
                  }), Z && e.jsxs(e.Fragment, {
                    children: [e.jsx("td", {
                      className: `px-3 py-1.5 text-right ${Y(o)}`,
                      "data-testid": `spy-sigma-${t.ticker}-${t.earningsDate}`,
                      children: U(o)
                    }), e.jsx("td", {
                      className: `px-3 py-1.5 text-right ${Y(c)}`,
                      children: U(c)
                    }), e.jsx("td", {
                      className: `px-3 py-1.5 text-right ${Y(f)}`,
                      title: "Stock σ minus SPY σ on the same day. Positive = stock moved more than market.",
                      children: U(f)
                    })]
                  })]
                }, `${t.ticker}-${t.earningsDate}-${l}`)
              })
            })()
          })]
        })
      })(), !y && d.length > 0 && (() => {
        const n = Ce.filter(a => Ve(a.ticker, a.name));
        return n.length === 0 ? e.jsxs("div", {
          className: "flex items-center justify-center h-32 text-sm text-muted-foreground",
          children: ["No tickers match “", le, "”."]
        }) : e.jsxs("table", {
          className: "w-full text-[11px] font-mono",
          children: [e.jsx("thead", {
            className: "sticky top-0 z-10 bg-card border-b border-border",
            children: e.jsxs("tr", {
              className: "text-muted-foreground",
              children: [e.jsx(q, {
                label: "Ticker",
                k: "ticker",
                sort: N,
                onClick: H,
                align: "left"
              }), e.jsx("th", {
                className: "text-left px-3 py-2 font-bold",
                children: "Name"
              }), e.jsx(q, {
                label: "Last",
                k: "last",
                sort: N,
                onClick: H,
                align: "right"
              }), e.jsx("th", {
                className: "text-right px-3 py-2 font-bold",
                children: "Prev Close"
              }), e.jsx(q, {
                label: "$ Change",
                k: "dollarChange",
                sort: N,
                onClick: H,
                align: "right"
              }), e.jsx(q, {
                label: "% Change",
                k: "pctChange",
                sort: N,
                onClick: H,
                align: "right"
              }), e.jsx(q, {
                label: `${k}d HV (ann.)`,
                k: "sigmaAnnualized",
                sort: N,
                onClick: H,
                align: "right"
              }), e.jsx(q, {
                label: "EWMA HV (ann.)",
                k: "sigmaEwmaAnnualized",
                sort: N,
                onClick: H,
                align: "right"
              }), e.jsx(q, {
                label: "σ Move",
                k: "sigmaMove",
                sort: N,
                onClick: H,
                align: "right"
              }), e.jsx(q, {
                label: "σ Move (EWMA)",
                k: "sigmaMoveEwma",
                sort: N,
                onClick: H,
                align: "right"
              }), e.jsx(q, {
                label: "|σ|",
                k: "absSigmaMove",
                sort: N,
                onClick: H,
                align: "right"
              }), e.jsx(q, {
                label: "Pctile",
                k: "percentile",
                sort: N,
                onClick: H,
                align: "right"
              })]
            })
          }), e.jsxs("tbody", {
            children: [Z && Me.map(a => {
              const r = we(a.sigmaMove);
              return e.jsxs("tr", {
                className: "border-b border-border bg-amber-500/5 hover:bg-amber-500/10",
                "data-testid": `index-row-${a.ticker}`,
                children: [e.jsx("td", {
                  className: "px-3 py-1.5 font-bold text-amber-300",
                  children: a.label
                }), e.jsx("td", {
                  className: "px-3 py-1.5 text-muted-foreground truncate max-w-[280px] italic",
                  title: a.name,
                  children: a.name
                }), e.jsx("td", {
                  className: "px-3 py-1.5 text-right",
                  children: K(a.last)
                }), e.jsx("td", {
                  className: "px-3 py-1.5 text-right text-muted-foreground",
                  children: K(a.previousClose)
                }), e.jsx("td", {
                  className: `px-3 py-1.5 text-right ${se(a.dollarChange)}`,
                  children: Re(a.dollarChange)
                }), e.jsx("td", {
                  className: `px-3 py-1.5 text-right ${se(a.pctChange)}`,
                  children: ve(a.pctChange)
                }), e.jsx("td", {
                  className: "px-3 py-1.5 text-right text-muted-foreground",
                  title: a.sigmaDaily != null ?
                    `daily: ${(a.sigmaDaily*100).toFixed(2)}% · window: ${a.hvWindow} returns` :
                    void 0,
                  children: a.sigmaAnnualized != null ?
                    `${(a.sigmaAnnualized*100).toFixed(1)}%` :
                    "—"
                }), e.jsx("td", {
                  className: "px-3 py-1.5 text-right text-muted-foreground",
                  title: a.sigmaEwmaDaily != null ?
                    `EWMA daily (λ=${xe}): ${(a.sigmaEwmaDaily*100).toFixed(2)}%` :
                    void 0,
                  children: a.sigmaEwmaAnnualized !=
                    null ?
                    `${(a.sigmaEwmaAnnualized*100).toFixed(1)}%` :
                    "—"
                }), e.jsx("td", {
                  className: `px-3 py-1.5 text-right ${Y(a.sigmaMove)}`,
                  children: U(a.sigmaMove)
                }), e.jsx("td", {
                  className: `px-3 py-1.5 text-right ${Y(a.sigmaMoveEwma)}`,
                  children: U(a.sigmaMoveEwma)
                }), e.jsx("td", {
                  className: `px-3 py-1.5 text-right text-[10px] uppercase tracking-wider ${r.color}`,
                  children: r.label
                }), e.jsx("td", {
                  className: `px-3 py-1.5 text-right ${Ie(a.percentile)}`,
                  title: a.percentile != null ?
                    `Rank of ${h}-day log return in trailing ${a.percentileN} obs (${k}d window)` :
                    void 0,
                  children: Le(a.percentile)
                })]
              }, `idx-${a.ticker}`)
            }), n.map(a => {
              const r = we(a.sigmaMove);
              return e.jsxs("tr", {
                className: "border-b border-border/50 hover:bg-white/5",
                children: [e.jsx("td", {
                  className: "px-3 py-1.5 font-bold text-foreground",
                  children: a.ticker
                }), e.jsx("td", {
                  className: "px-3 py-1.5 text-muted-foreground truncate max-w-[280px]",
                  title: a.name,
                  children: a.name
                }), e.jsx("td", {
                  className: "px-3 py-1.5 text-right",
                  children: K(a.last)
                }), e.jsx("td", {
                  className: "px-3 py-1.5 text-right text-muted-foreground",
                  children: K(a.previousClose)
                }), e.jsx("td", {
                  className: `px-3 py-1.5 text-right ${se(a.dollarChange)}`,
                  children: Re(a.dollarChange)
                }), e.jsx("td", {
                  className: `px-3 py-1.5 text-right ${se(a.pctChange)}`,
                  children: ve(a.pctChange)
                }), e.jsx("td", {
                  className: "px-3 py-1.5 text-right text-muted-foreground",
                  title: a.sigmaDaily != null ?
                    `daily: ${(a.sigmaDaily*100).toFixed(2)}% · window: ${a.hvWindow} returns` :
                    void 0,
                  children: a.sigmaAnnualized != null ?
                    `${(a.sigmaAnnualized*100).toFixed(1)}%` :
                    "—"
                }), e.jsx("td", {
                  className: "px-3 py-1.5 text-right text-muted-foreground",
                  title: a.sigmaEwmaDaily != null ?
                    `EWMA daily (λ=${xe}): ${(a.sigmaEwmaDaily*100).toFixed(2)}%` :
                    void 0,
                  children: a.sigmaEwmaAnnualized !=
                    null ?
                    `${(a.sigmaEwmaAnnualized*100).toFixed(1)}%` :
                    "—"
                }), e.jsx("td", {
                  className: `px-3 py-1.5 text-right ${Y(a.sigmaMove)}`,
                  children: U(a.sigmaMove)
                }), e.jsx("td", {
                  className: `px-3 py-1.5 text-right ${Y(a.sigmaMoveEwma)}`,
                  title: a.sigmaMoveEwma != null ?
                    `Log return / (σ_EWMA · √${h})` :
                    void 0,
                  children: U(a.sigmaMoveEwma)
                }), e.jsx("td", {
                  className: `px-3 py-1.5 text-right text-[10px] uppercase tracking-wider ${r.color}`,
                  children: r.label
                }), e.jsx("td", {
                  className: `px-3 py-1.5 text-right ${Ie(a.percentile)}`,
                  title: a.percentile != null ?
                    `Rank of ${h}-day log return in trailing ${a.percentileN} obs (${k}d window)` :
                    void 0,
                  children: Le(a.percentile)
                })]
              }, a.ticker)
            })]
          })]
        })
      })()]
    })]
  })
}

function B({
  label: s,
  value: u,
  total: d,
  color: b
}) {
  return e.jsxs("span", {
    className: "flex items-center gap-1",
    children: [e.jsxs("span", {
      className: "text-muted-foreground uppercase tracking-wider",
      children: [s, ":"]
    }), e.jsx("span", {
      className: b,
      children: u
    }), e.jsxs("span", {
      className: "text-muted-foreground",
      children: ["/ ", d]
    })]
  })
}

function q({
  label: s,
  k: u,
  sort: d,
  onClick: b,
  align: p = "left"
}) {
  const C = d.key === u;
  return e.jsx("th", {
    className: `px-3 py-2 font-bold cursor-pointer select-none hover:text-foreground transition-colors ${p==="right"?"text-right":"text-left"} ${C?"text-foreground":""}`,
    onClick: () => b(u),
    children: e.jsxs("span", {
      className: "inline-flex items-center gap-1",
      children: [s, C ? d.dir === "asc" ? e.jsx(tt, {
        className: "w-3 h-3"
      }) : e.jsx(at, {
        className: "w-3 h-3"
      }) : e.jsx(nt, {
        className: "w-3 h-3 opacity-30"
      })]
    })
  })
}

function V({
  label: s,
  k: u,
  sort: d,
  onClick: b,
  align: p = "left"
}) {
  const C = d.key === u;
  return e.jsx("th", {
    className: `px-3 py-2 font-bold cursor-pointer select-none hover:text-foreground transition-colors ${p==="right"?"text-right":"text-left"} ${C?"text-foreground":""}`,
    onClick: () => b(u),
    children: e.jsxs("span", {
      className: "inline-flex items-center gap-1",
      children: [s, C ? d.dir === "asc" ? e.jsx(tt, {
        className: "w-3 h-3"
      }) : e.jsx(at, {
        className: "w-3 h-3"
      }) : e.jsx(nt, {
        className: "w-3 h-3 opacity-30"
      })]
    })
  })
}
export {
  It as DEFAULT_INDEX_GROUPS, Ke as INDEX_GROUP_LABELS, Ze as INDEX_GROUP_ORDER,
  Je as INDEX_GROUP_SHORT, Ot as
  default
};