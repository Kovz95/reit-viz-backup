// Series colors for multi-series overlay
export const SERIES_COLORS = [
  '#0ea5e9', // sky blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#a855f7', // purple
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#8b5cf6', // violet
  '#eab308', // yellow
  '#6366f1', // indigo
  '#84cc16', // lime
  '#e11d48', // rose
  '#0891b2', // dark cyan
  '#7c3aed', // deep purple
];

export function getSeriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

// Indicator colors
export const INDICATOR_COLORS = {
  sma: '#f59e0b',
  ema: '#a855f7',
  hma: '#06b6d4',
  // Extended moving averages — each gets its own hue so several can be shown at once.
  wma: '#84cc16',
  dema: '#f472b6',
  tema: '#38bdf8',
  kama: '#fb923c',
  frama: '#4ade80',
  t3: '#c084fc',
  alma: '#facc15',
  lsma: '#2dd4bf',
  slsma: '#fb7185',
  macd_line: '#0ea5e9',
  macd_signal: '#f59e0b',
  macd_histogram_pos: '#22c55e',
  macd_histogram_neg: '#ef4444',
  rsi_line: '#a855f7',
  rsi_overbought: 'rgba(239, 68, 68, 0.5)',
  rsi_oversold: 'rgba(34, 197, 94, 0.5)',
  mean: '#f59e0b',
  std_band: 'rgba(99, 102, 241, 0.15)',
  ha_up: '#22c55e',
  ha_down: '#ef4444',
  ha_signal_bull: '#22c55e',
  ha_signal_bear: '#ef4444',
  bollinger_basis: '#f59e0b',
  bollinger_band: 'rgba(245, 158, 11, 0.3)',
  atr: '#f97316',
  vwap: '#06b6d4',
  roc: '#ec4899',
  stoch_k: '#0ea5e9',
  stoch_d: '#f59e0b',
  stoch_overbought: 'rgba(239, 68, 68, 0.5)',
  stoch_oversold: 'rgba(34, 197, 94, 0.5)',
  obv: '#8b5cf6',
  fractal_resistance: '#ef4444',
  fractal_support: '#22c55e',
  fractal_pivot: 'rgba(148, 163, 184, 0.9)',
  // ── Registry indicators (see indicatorRegistry.ts) ──
  adx_adx: '#eab308',
  adx_plus: '#22c55e',
  adx_minus: '#ef4444',
  adx_ref: 'rgba(148, 163, 184, 0.4)',
  cci_line: '#06b6d4',
  cci_ref: 'rgba(239, 68, 68, 0.4)',
  williamsr_line: '#a855f7',
  williamsr_ref: 'rgba(148, 163, 184, 0.4)',
  slowstoch_k: '#0ea5e9',
  slowstoch_d: '#f97316',
  slowstoch_ref: 'rgba(168, 85, 247, 0.45)',
  aroon_up: '#22c55e',
  aroon_down: '#ef4444',
  aroon_ref: 'rgba(148, 163, 184, 0.35)',
  supertrend_up: '#22c55e',
  supertrend_down: '#ef4444',
  psar_up: '#22c55e',
  psar_down: '#ef4444',
  keltner_basis: '#f59e0b',
  keltner_band: 'rgba(14, 165, 233, 0.7)',
  donchian_upper: '#0ea5e9',
  donchian_lower: '#0ea5e9',
  donchian_mid: 'rgba(148, 163, 184, 0.6)',
  ichimoku_conversion: '#2962ff',
  ichimoku_base: '#b71c1c',
  ichimoku_lead_a: '#43a047',
  ichimoku_lead_b: '#ef9a9a',
  ichimoku_lagging: '#43a047',
};
