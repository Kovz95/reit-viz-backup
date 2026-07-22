// Auto baskets: virtual, always-live baskets derived from the current universe.
// One basket per classification value on each of the six levels, top-level
// Country and Exchange splits, and per-subindustry Country / Exchange
// drill-downs. Never persisted: rebuilt from the workbook tickers (server-side
// exclusions applied) merged with this browser's reclassification overrides, so
// workbook uploads, ticker deletions, and Universe-tab reclassifications are
// reflected the next time the list is read — no manual maintenance.
//
// They flow into the app through useBaskets(), which appends them to the saved
// list, so every basket consumer (Charts BASKET: series, pickers, basket
// scopes, screeners) can use them like a saved basket. They are read-only:
// update/delete are no-ops, and the Baskets tab renders them in their own
// section without editing controls.

import { fetchWorkbookTickers } from "@/lib/fetchWorkbookTickers";
import { loadGlobalRecords } from "@/lib/globalUniverse";
import {
  loadOverrides,
  OVERRIDES_CHANGE_EVENT,
  OVERRIDES_STORAGE_KEY,
} from "@/lib/reclassificationOverrides";
import type { Basket } from "@/lib/useBaskets";

export const AUTO_BASKETS_CHANGED = "reit-viz:auto-baskets:changed";
const AUTO_ID_PREFIX = "auto:";

export function isAutoBasketId(id: string): boolean {
  return id.startsWith(AUTO_ID_PREFIX);
}

// ── Shared grouping for basket lists (BasketManager, Charts sidebar, …) ──
// Group key = the name prefix before ":" ("Auto Sub", "Auto Ctry", …), so the
// per-subindustry country/exchange drill-downs fold into the Subindustry group.

export const AUTO_BASKET_GROUP_ORDER = [
  "Auto Econ",
  "Auto Sect",
  "Auto Subsect",
  "Auto IndGrp",
  "Auto Ind",
  "Auto Sub",
  "Auto Ctry",
  "Auto Exch",
];

export const AUTO_BASKET_GROUP_LABELS: Record<string, string> = {
  "Auto Econ": "Economy",
  "Auto Sect": "Sector",
  "Auto Subsect": "Subsector",
  "Auto IndGrp": "Industry Group",
  "Auto Ind": "Industry",
  "Auto Sub": "Subindustry (incl. country / exchange splits)",
  "Auto Ctry": "Country",
  "Auto Exch": "Exchange",
};

/** Group auto baskets by kind, in drill-down order. */
export function groupAutoBaskets(autos: Basket[]): [string, Basket[]][] {
  const groups = new Map<string, Basket[]>();
  for (const b of autos) {
    const key = b.name.split(":")[0];
    const arr = groups.get(key);
    if (arr) arr.push(b);
    else groups.set(key, [b]);
  }
  return [...groups.entries()].sort(
    (a, b) =>
      (AUTO_BASKET_GROUP_ORDER.indexOf(a[0]) + 1 || 99) -
      (AUTO_BASKET_GROUP_ORDER.indexOf(b[0]) + 1 || 99),
  );
}

// Classification levels, in drill-down order, with the short label used in the
// basket name ("Auto Sub: Apartment"). Short labels keep names usable in the
// compact basket pickers while still disambiguating levels that share values.
const LEVELS: [field: string, label: string][] = [
  ["economy", "Econ"],
  ["sector", "Sect"],
  ["subsector", "Subsect"],
  ["industryGroup", "IndGrp"],
  ["industry", "Ind"],
  ["subindustry", "Sub"],
];

let cache: Basket[] = [];
let initDone = false;
let inflight: Promise<void> | null = null;

export function getAutoBaskets(): Basket[] {
  return cache;
}

function mkBasket(id: string, name: string, tickers: string[]): Basket {
  return {
    id,
    name,
    tickers,
    // Stable timestamps: these are derived, not created, and a changing
    // timestamp would churn memoized consumers on every rebuild.
    createdAt: 0,
    updatedAt: 0,
    weighting: "market_cap",
    rebalance: "monthly",
    customWeights: {},
    volLookback: 60,
  };
}

function push(groups: Map<string, string[]>, key: string, ticker: string): void {
  const arr = groups.get(key);
  if (arr) arr.push(ticker);
  else groups.set(key, [ticker]);
}

async function build(): Promise<Basket[]> {
  const metas = await fetchWorkbookTickers();
  const overrides = loadOverrides();
  // Same merge the UniverseProvider applies for the Universe grid.
  const merged = metas.map((t) => {
    const o = overrides[t.ticker];
    return o ? { ...t, ...o } : t;
  });

  // Geo lookup (nation + exchange) from the global-universe dataset — the
  // workbook itself carries no geography. Missing geo just skips those splits.
  const geo = new Map<string, { nation?: string | null; exchange?: string | null }>();
  try {
    const records = await loadGlobalRecords();
    for (const r of records) {
      const k = String(r.ticker).toUpperCase();
      if (!geo.has(k)) geo.set(k, { nation: r.nation ?? null, exchange: r.exchange ?? null });
    }
    for (const r of records) {
      if (!r.fdsTicker) continue;
      const k = String(r.fdsTicker).toUpperCase();
      if (!geo.has(k)) geo.set(k, { nation: r.nation ?? null, exchange: r.exchange ?? null });
    }
  } catch {
    /* no geo data — classification baskets still build */
  }

  const out: Basket[] = [];

  // One basket per value on each classification level.
  let subindustryGroups = new Map<string, string[]>();
  for (const [field, label] of LEVELS) {
    const groups = new Map<string, string[]>();
    for (const t of merged) {
      const v = String((t as Record<string, unknown>)[field] ?? "").trim();
      if (!v) continue;
      push(groups, v, String(t.ticker).toUpperCase());
    }
    for (const [v, tickers] of groups) {
      out.push(mkBasket(`auto:${field}:${v}`, `Auto ${label}: ${v}`, tickers));
    }
    if (field === "subindustry") subindustryGroups = groups;
  }

  // Top-level Country / Exchange splits across the whole universe.
  const byNation = new Map<string, string[]>();
  const byExchange = new Map<string, string[]>();
  for (const t of merged) {
    const tk = String(t.ticker).toUpperCase();
    const g = geo.get(tk);
    if (g?.nation) push(byNation, g.nation, tk);
    if (g?.exchange) push(byExchange, g.exchange, tk);
  }
  for (const [n, tickers] of byNation) {
    out.push(mkBasket(`auto:country:${n}`, `Auto Ctry: ${n}`, tickers));
  }
  for (const [e, tickers] of byExchange) {
    out.push(mkBasket(`auto:exchange:${e}`, `Auto Exch: ${e}`, tickers));
  }

  // Per-subindustry Country / Exchange drill-downs. Only when the subindustry
  // actually spans more than one country/exchange — a single-value split would
  // just duplicate the parent basket.
  for (const [v, tickers] of subindustryGroups) {
    const subNation = new Map<string, string[]>();
    const subExchange = new Map<string, string[]>();
    for (const tk of tickers) {
      const g = geo.get(tk);
      if (g?.nation) push(subNation, g.nation, tk);
      if (g?.exchange) push(subExchange, g.exchange, tk);
    }
    if (subNation.size >= 2) {
      for (const [n, tks] of subNation) {
        out.push(mkBasket(`auto:subindustry:${v}:country:${n}`, `Auto Sub: ${v} (${n})`, tks));
      }
    }
    if (subExchange.size >= 2) {
      for (const [e, tks] of subExchange) {
        out.push(mkBasket(`auto:subindustry:${v}:exchange:${e}`, `Auto Sub: ${v} (${e})`, tks));
      }
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Rebuild the auto-basket list and notify listeners. Coalesces concurrent calls. */
export function refreshAutoBaskets(): Promise<void> {
  if (inflight) return inflight;
  inflight = build()
    .then((b) => {
      cache = b;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(AUTO_BASKETS_CHANGED));
      }
    })
    .catch(() => {
      /* keep the previous cache on failure */
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Idempotent bootstrap: first build + rebuild on reclassification changes
 *  (this tab via the change event, other tabs via the storage event). If the
 *  geo dataset wasn't available yet (slow/failed first fetch), the country and
 *  exchange baskets come out missing — retry a few times until they appear. */
export function initAutoBaskets(): void {
  if (initDone || typeof window === "undefined") return;
  initDone = true;
  const hasGeoBaskets = () => cache.some((b) => b.id.startsWith("auto:country:"));
  let retries = 0;
  const buildWithRetry = () =>
    refreshAutoBaskets().then(() => {
      if (cache.length > 0 && !hasGeoBaskets() && retries < 3) {
        retries += 1;
        setTimeout(buildWithRetry, 4000);
      }
    });
  void buildWithRetry();
  window.addEventListener(OVERRIDES_CHANGE_EVENT, () => void refreshAutoBaskets());
  window.addEventListener("storage", (e) => {
    if (e.key === OVERRIDES_STORAGE_KEY) void refreshAutoBaskets();
  });
}
