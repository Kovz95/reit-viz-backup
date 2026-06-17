// Reconstructed from recovered-bundle/Baskets-CFu3VD0m.js on 2026-06-11

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBaskets } from "@/lib/useBaskets";
import { getTickers } from "@/lib/dataService";
import { useGlobalUniverse } from "@/lib/globalUniverse";
import { BasketEditorPanel } from "@/lib/basketEditorPanel";
import { FolderOpen, Layers, ChevronDown, ChevronRight, Sparkles } from "lucide-react";

export default function Baskets() {
  // New-basket draft controls (faithful to production BasketEditorPanel controls).
  const [weightingScheme, setWeightingScheme] = useState("equal");
  const [rebalance, setRebalance] = useState("none");
  const [showSmartPresets, setShowSmartPresets] = useState(false);
  const { data: workbookTickers } = useQuery({
    queryKey: ["tickers"],
    queryFn: getTickers,
  });
  const { baskets } = useBaskets();
  const [source, setSource] = useState("workbook");
  const { metas, loading, error } = useGlobalUniverse();
  const tickerList = useMemo(
    () => (source === "workbook" ? workbookTickers : metas),
    [source, workbookTickers, metas]
  );

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen className="w-5 h-5 text-amber-400" />
          <h1 className="text-base font-semibold text-foreground">Baskets</h1>
          <span className="text-[11px] font-mono text-muted-foreground ml-2">
            {baskets.length} saved
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Centralized basket library. Baskets created here are available across
          Charts, Pairs, Scanner, Premium/Discount, Distributions, and every
          optimizer. Each basket stores its ticker list, weighting scheme
          (equal, market-cap from workbook, Yahoo cap, inverse-vol, price, or
          custom) and rebalance frequency.
        </p>
        <div
          className="flex items-center gap-2 text-xs mb-3"
          data-testid="baskets-universe-source"
        >
          <span className="text-slate-400 uppercase tracking-wide">
            Search Source:
          </span>
          <button
            type="button"
            onClick={() => setSource("workbook")}
            className={`px-2 py-1 rounded border transition-colors ${
              source === "workbook"
                ? "bg-sky-500/20 border-sky-500/60 text-sky-200"
                : "bg-slate-800/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
            }`}
            data-testid="baskets-source-workbook"
          >
            REIT Workbook ({workbookTickers?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setSource("global")}
            className={`px-2 py-1 rounded border transition-colors ${
              source === "global"
                ? "bg-sky-500/20 border-sky-500/60 text-sky-200"
                : "bg-slate-800/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
            }`}
            data-testid="baskets-source-global"
            title="FactSet/RBICS GLOBAL universe (~9,000 tickers, Yahoo-priced)"
          >
            Global{" "}
            {source === "global"
              ? loading
                ? "(loading…)"
                : `(${metas.length.toLocaleString()})`
              : "(~9k)"}
          </button>
          {source === "global" && error && (
            <span className="text-rose-400" title={error}>
              load error
            </span>
          )}
        </div>
        {/* New-basket draft controls (mirror BasketEditorPanel) */}
        <div className="bg-card border border-border rounded-md p-2 mb-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 border border-border rounded text-muted-foreground transition-colors hover:text-amber-300 hover:border-amber-500/40"
              title="Bulk-add tickers by classification group"
              data-testid="basket-add-by-classification"
            >
              <Layers className="w-3 h-3" />
              Add by group
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider w-20 flex-shrink-0">
              Weighting
            </label>
            <select
              data-testid="basket-weighting-scheme"
              value={weightingScheme}
              onChange={(e) => setWeightingScheme(e.target.value)}
              className="flex-1 text-[10px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-amber-500/50"
            >
              <option value="equal">Equal</option>
              <option value="market_cap">Market Cap (workbook)</option>
              <option value="yahoo_cap">Yahoo Cap (current snapshot)</option>
              <option value="fmp_cap_daily">Market Cap Daily (FMP)</option>
              <option value="inverse_vol">Inverse Vol</option>
              <option value="price">Price-Weighted</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider w-20 flex-shrink-0">
              Rebalance
            </label>
            <select
              data-testid="basket-rebalance"
              value={rebalance}
              onChange={(e) => setRebalance(e.target.value)}
              className="flex-1 text-[10px] font-mono bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-amber-500/50"
            >
              <option value="none">None (drift)</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
          <div className="border border-border rounded bg-background/30">
            <button
              type="button"
              onClick={() => setShowSmartPresets((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-background/50 transition-colors"
              data-testid="smart-presets-toggle"
            >
              <div className="flex items-center gap-1.5">
                {showSmartPresets ? (
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                )}
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-mono font-medium text-foreground">
                  Smart presets
                </span>
              </div>
            </button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-md p-2">
          {tickerList ? (
            <BasketEditorPanel
              tickers={tickerList}
              onClose={() => {}}
              hideClose={true}
              embedded={true}
            />
          ) : (
            <div className="text-xs font-mono text-muted-foreground p-4">
              Loading tickers…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
