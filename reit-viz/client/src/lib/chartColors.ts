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
};
