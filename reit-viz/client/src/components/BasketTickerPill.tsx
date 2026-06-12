// Reconstructed from recovered-bundle/BasketTickerPill-DA9Wjwwc.js on 2025-01-31

import { useState, useEffect, useRef } from "react";
import { useBaskets } from "@/lib/useBaskets";
import { isBasketTicker, extractBasketId } from "@/lib/basketUtils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Package, ChevronsUpDown, X, Check } from "lucide-react";

interface BasketTickerPillProps {
  activeTicker: string | null;
  onSelectTicker: (ticker: string) => void;
  fallbackTicker?: string | null;
  size?: "xs" | "sm";
  className?: string;
}

function BasketTickerPill({
  activeTicker,
  onSelectTicker,
  fallbackTicker,
  size = "sm",
  className = "",
}: BasketTickerPillProps) {
  const { baskets, getBasket } = useBaskets();
  const [open, setOpen] = useState(false);
  const lastNonBasketRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeTicker && !isBasketTicker(activeTicker)) {
      lastNonBasketRef.current = activeTicker;
    }
  }, [activeTicker]);

  const isBasket = !!activeTicker && isBasketTicker(activeTicker);
  const basketId = isBasket ? extractBasketId(activeTicker!) : null;
  const activeBasket = basketId ? getBasket(basketId) : null;
  const sortedBaskets = [...baskets].sort((a, b) => a.name.localeCompare(b.name));
  const heightClass = size === "xs" ? "h-6" : "h-7";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild={true}>
        <Button
          variant={isBasket ? "default" : "outline"}
          size="sm"
          className={`${heightClass} gap-1.5 px-2 max-w-[260px] ${isBasket ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30" : ""} ${className}`}
          data-testid="basket-pill"
        >
          <Package className="w-3.5 h-3.5 flex-shrink-0" />
          {isBasket && activeBasket ? (
            <span className="font-mono font-semibold text-xs truncate" title={activeBasket.name}>
              {activeBasket.name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Basket</span>
          )}
          {isBasket && activeBasket && (
            <span className="text-[10px] text-amber-300/70 flex-shrink-0">
              ({activeBasket.tickers.length})
            </span>
          )}
          <ChevronsUpDown className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search baskets..." className="h-8 text-xs" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>
              <div className="px-3 py-4 text-xs text-muted-foreground">
                No baskets yet. Create one in the Baskets tab.
              </div>
            </CommandEmpty>
            {isBasket && (
              <CommandGroup>
                <CommandItem
                  value="__exit_basket_mode__"
                  onSelect={() => {
                    const target = lastNonBasketRef.current ?? fallbackTicker ?? null;
                    if (target) onSelectTicker(target);
                    setOpen(false);
                  }}
                  className="text-xs text-muted-foreground"
                >
                  <X className="w-3 h-3 mr-1.5 flex-shrink-0" />
                  Exit basket mode
                  {(lastNonBasketRef.current || fallbackTicker) && (
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground/70">
                      → {lastNonBasketRef.current ?? fallbackTicker}
                    </span>
                  )}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading={sortedBaskets.length > 0 ? "Baskets" : undefined}>
              {sortedBaskets.map((basket) => (
                <CommandItem
                  key={basket.id}
                  value={`${basket.name} ${basket.tickers.join(" ")}`}
                  onSelect={() => {
                    onSelectTicker(`BASKET:${basket.id}`);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={`w-3 h-3 mr-1.5 flex-shrink-0 ${basketId === basket.id ? "opacity-100" : "opacity-0"}`}
                  />
                  <Package className="w-3 h-3 mr-1.5 text-amber-400 flex-shrink-0" />
                  <span
                    className="font-mono font-semibold mr-2 truncate"
                    title={basket.name}
                  >
                    {basket.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70 ml-auto flex-shrink-0">
                    {basket.tickers.length} • {basket.weighting ?? "market_cap"}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { BasketTickerPill, BasketTickerPill as B };
export default BasketTickerPill;
