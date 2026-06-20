// Reconstructed from recovered-bundle/index-CsG73Aq_.js on 2026-06-17
import { useState, useEffect } from "react";
import { TrendingUp, Sparkles, RefreshCcw, ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  usePatternSettings,
  notifyPatternsSettingsChanged,
  type RelevantPattern,
} from "@/lib/patternSettings";

interface PatternsPanelProps {
  paneId: number;
}

const PATTERN_LIST: { key: string; label: string }[] = [
  { key: "asc_triangle", label: "Ascending Triangle" },
  { key: "desc_triangle", label: "Descending Triangle" },
  { key: "sym_triangle", label: "Symmetrical Triangle" },
  { key: "rising_wedge", label: "Rising Wedge" },
  { key: "falling_wedge", label: "Falling Wedge" },
  { key: "bull_flag", label: "Bull Flag" },
  { key: "bear_flag", label: "Bear Flag" },
  { key: "rectangle", label: "Rectangle / Channel" },
  { key: "head_shoulders", label: "Head & Shoulders" },
  { key: "inv_head_shoulders", label: "Inverse Head & Shoulders" },
  { key: "double_top", label: "Double Top" },
  { key: "double_bottom", label: "Double Bottom" },
  { key: "triple_top", label: "Triple Top" },
  { key: "triple_bottom", label: "Triple Bottom" },
  { key: "cup_handle", label: "Cup & Handle" },
  { key: "inv_cup_handle", label: "Inverse Cup & Handle" },
  { key: "rounding_top", label: "Rounding Top" },
  { key: "rounding_bottom", label: "Rounding Bottom" },
];

const TIMEFRAMES: {
  key: "daily" | "weekly" | "both";
  label: string;
  desc: string;
}[] = [
  { key: "daily", label: "Daily", desc: "Detect on daily bars" },
  { key: "weekly", label: "Weekly", desc: "Detect on weekly bars (overlaid on chart)" },
  { key: "both", label: "Both", desc: "Daily (solid) + Weekly (dashed, thicker)" },
];

export default function PatternsPanel({ paneId }: PatternsPanelProps) {
  const [settings, update] = usePatternSettings(paneId);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detectedCount, setDetectedCount] = useState(0);
  const [relevant, setRelevant] = useState<RelevantPattern[]>([]);

  useEffect(() => {
    const handler = (event: Event) => {
      const e = event as CustomEvent;
      if (e.detail?.paneId === paneId) {
        setDetectedCount(e.detail.patterns?.length ?? 0);
      }
    };
    window.addEventListener("reit-viz:patterns-detected", handler);
    return () =>
      window.removeEventListener("reit-viz:patterns-detected", handler);
  }, [paneId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const e = event as CustomEvent;
      if (e.detail?.paneId === paneId) {
        setRelevant(Array.isArray(e.detail.relevant) ? e.detail.relevant : []);
      }
    };
    window.addEventListener("reit-viz:patterns-most-relevant", handler);
    return () =>
      window.removeEventListener("reit-viz:patterns-most-relevant", handler);
  }, [paneId]);

  const change = (patch: Parameters<typeof update>[0]) => {
    update(patch);
    notifyPatternsSettingsChanged(paneId);
  };

  const setPerPattern = (key: string, val: boolean) => {
    const prev = settings.perPattern ?? {};
    change({ perPattern: { ...prev, [key]: val } });
  };

  const isPatternEnabled = (key: string) =>
    !settings.perPattern || settings.perPattern[key] === undefined
      ? true
      : !!settings.perPattern[key];

  const rescan = () => {
    try {
      window.dispatchEvent(
        new CustomEvent("reit-viz:patterns-rescan", {
          detail: { paneId },
        }),
      );
    } catch {}
  };

  return (
    <div
      className="rounded-md border border-border bg-card/40 p-3 space-y-3"
      data-testid="patterns-panel"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <Label className="text-sm font-semibold">Pattern Recognition</Label>
          {settings.enabled && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              data-testid="patterns-detected-count"
            >
              {detectedCount} detected
            </span>
          )}
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(v) => change({ enabled: !!v })}
          data-testid="patterns-master-switch"
        />
      </div>
      {settings.enabled && (
        <>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Sensitivity</Label>
              <span className="text-xs font-mono text-foreground">
                {settings.sensitivity}
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[settings.sensitivity]}
              onValueChange={(v) => change({ sensitivity: v[0] ?? 60 })}
              data-testid="patterns-sensitivity-slider"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground/60">
              <span>Strict (few, strong)</span>
              <span>Loose (many, weak)</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Max patterns drawn
              </Label>
              <span className="text-xs font-mono text-foreground">
                {settings.maxPatterns === 0 ? "∞" : settings.maxPatterns}
              </span>
            </div>
            <Slider
              min={0}
              max={50}
              step={1}
              value={[settings.maxPatterns]}
              onValueChange={(v) => change({ maxPatterns: v[0] ?? 12 })}
              data-testid="patterns-maxpatterns-slider"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground/60">
              <span>0 = unlimited</span>
              <span>50</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Lookback (bars)
              </Label>
              <span className="text-xs font-mono text-foreground">
                {settings.lookbackBars === 0 ? "All" : settings.lookbackBars}
              </span>
            </div>
            <Slider
              min={0}
              max={1000}
              step={10}
              value={[settings.lookbackBars]}
              onValueChange={(v) => change({ lookbackBars: v[0] ?? 0 })}
              data-testid="patterns-lookback-slider"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground/60">
              <span>0 = all history</span>
              <span>last 1000</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Timeframe</Label>
            <div
              className="grid grid-cols-3 gap-1"
              data-testid="patterns-timeframe-group"
            >
              {TIMEFRAMES.map((tf) => (
                <Button
                  key={tf.key}
                  size="sm"
                  variant={settings.timeframe === tf.key ? "default" : "secondary"}
                  className="h-7 text-[11px]"
                  title={tf.desc}
                  onClick={() => change({ timeframe: tf.key })}
                  data-testid={`patterns-timeframe-${tf.key}`}
                >
                  {tf.label}
                </Button>
              ))}
            </div>
            <div className="text-[9px] text-muted-foreground/60">
              Weekly patterns overlay on the daily chart (dashed lines)
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Most Relevant Today
              </Label>
              <Switch
                checked={settings.showMostRelevant}
                onCheckedChange={(v) => change({ showMostRelevant: !!v })}
                data-testid="patterns-mostrelevant-switch"
              />
            </div>
            {settings.showMostRelevant && relevant.length > 0 && (
              <div
                className="rounded border border-amber-500/30 bg-amber-500/5 p-1.5 space-y-1"
                data-testid="patterns-mostrelevant-list"
              >
                {relevant.map((item, i) => {
                  const color =
                    item.direction > 0
                      ? "text-green-500"
                      : item.direction < 0
                        ? "text-red-500"
                        : "text-blue-500";
                  const arrow =
                    item.direction > 0 ? "↑" : item.direction < 0 ? "↓" : "↔";
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-1 text-[10px]"
                      data-testid={`patterns-mostrelevant-item-${i}`}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-amber-500 font-semibold">
                          #{i + 1}
                        </span>
                        <span className={`${color} font-bold`}>{arrow}</span>
                        <span className="truncate text-foreground/90">
                          {item.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className="font-mono text-foreground/80"
                          title={`conf ${(item.components.confidence * 100).toFixed(0)} · recency ${(item.components.recency * 100).toFixed(0)} · proximity ${(item.components.proximity * 100).toFixed(0)}`}
                        >
                          {Math.round(item.relevance * 100)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {settings.showMostRelevant && relevant.length === 0 && (
              <div className="text-[10px] text-muted-foreground/60 italic py-0.5">
                No active patterns near current price.
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              onClick={rescan}
              data-testid="patterns-rescan-btn"
            >
              <RefreshCcw className="w-3 h-3 mr-1" />
              Re-scan
            </Button>
            <div className="flex items-center gap-2">
              <Label
                htmlFor={`pat-auto-${paneId}`}
                className="text-xs text-muted-foreground"
              >
                Auto
              </Label>
              <Switch
                id={`pat-auto-${paneId}`}
                checked={settings.autoRescan}
                onCheckedChange={(v) => change({ autoRescan: !!v })}
                data-testid="patterns-autorescan-switch"
              />
            </div>
          </div>
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-between text-xs px-2"
                data-testid="patterns-advanced-toggle"
              >
                <span>Advanced</span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-1.5">
              {PATTERN_LIST.map((p) => (
                <div
                  key={p.key}
                  className="flex items-center justify-between py-0.5"
                >
                  <Label
                    htmlFor={`pat-${p.key}-${paneId}`}
                    className="text-xs text-foreground/85 cursor-pointer"
                  >
                    {p.label}
                  </Label>
                  <Switch
                    id={`pat-${p.key}-${paneId}`}
                    checked={isPatternEnabled(p.key)}
                    onCheckedChange={(v) => setPerPattern(p.key, !!v)}
                    data-testid={`patterns-toggle-${p.key}`}
                  />
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </div>
  );
}
