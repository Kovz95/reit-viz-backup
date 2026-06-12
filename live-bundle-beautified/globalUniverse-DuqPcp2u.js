import {
    r as s,
    bV as b
} from "./index-CsG73Aq_.js";
let n = null;

function m() {
    return n || (n = (async () => {
        const a = `${"./".replace(/\/$/,"")}/data/global-universe.json`,
            t = await fetch(a);
        if (!t.ok) throw new Error(`global-universe.json fetch failed: ${t.status} ${t.statusText}`);
        return (await t.json()).records || []
    })(), n)
}

function g(e) {
    return {
        ticker: e.ticker,
        name: e.name,
        economy: e.economy ?? "",
        sector: e.sector ?? "",
        subsector: e.subsector ?? "",
        industryGroup: e.industryGroup ?? "",
        industry: e.industry ?? "",
        subindustry: e.subindustry ?? "",
        dates: 0,
        metrics: []
    }
}

function h() {
    const [e, a] = s.useState([]), [t, c] = s.useState(!0), [l, d] = s.useState(null);
    s.useEffect(() => {
        let r = !1;
        return m().then(o => {
            r || (a(o), c(!1))
        }).catch(o => {
            r || (d(String(o?.message || o)), c(!1))
        }), () => {
            r = !0
        }
    }, []);
    const u = b("global"),
        i = s.useMemo(() => u.size === 0 ? e : e.filter(r => !u.has(r.ticker)), [e, u]),
        f = s.useMemo(() => i.map(g), [i]);
    return {
        records: i,
        metas: f,
        loading: t,
        error: l
    }
}
export {
    h as u
};