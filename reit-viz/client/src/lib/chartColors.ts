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
// Default line thickness (px, 1–4) for the moving-average overlays. User
// overrides live in IndicatorColorsContext; these are the fall-back defaults
// and match the widths the MA lines shipped with.
export const INDICATOR_WIDTHS: Record<string, number> = {
  sma: 1,
  ema: 1,
  hma: 2,
  wma: 1,
  dema: 2,
  tema: 2,
  kama: 2,
  frama: 2,
  t3: 2,
  alma: 1,
  lsma: 1,
  slsma: 2,
};

// Opacity presets the MA line-opacity control cycles through (1 = fully opaque).
export const MA_OPACITY_STEPS: number[] = [1, 0.75, 0.5, 0.25];

// Line style for the moving-average overlays. Stored as a readable token and
// mapped to lightweight-charts' LineStyle enum at render time. Defaults match
// what the MA lines shipped with (only SMA was dashed).
export type MaLineStyle = "solid" | "dashed" | "dotted" | "largeDashed" | "sparseDotted";
export const MA_LINE_STYLES: MaLineStyle[] = ["solid", "dashed", "dotted", "largeDashed", "sparseDotted"];
/** Human-readable labels for tooltips. */
export const MA_LINE_STYLE_LABELS: Record<MaLineStyle, string> = {
  solid: "solid",
  dashed: "dashed",
  dotted: "dotted",
  largeDashed: "large dashed",
  sparseDotted: "sparse dotted",
};
export const INDICATOR_LINE_STYLES: Record<string, MaLineStyle> = {
  sma: "dashed",
  ema: "solid",
  hma: "solid",
  wma: "solid",
  dema: "solid",
  tema: "solid",
  kama: "solid",
  frama: "solid",
  t3: "solid",
  alma: "solid",
  lsma: "solid",
  slsma: "solid",
};

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
  madist_line: '#14b8a6',
  madist_band: 'rgba(239, 68, 68, 0.4)',
  madist_zero: 'rgba(148, 163, 184, 0.4)',
  maslope_line: '#60a5fa',
  maslope_zero: 'rgba(148, 163, 184, 0.4)',
  autocorr_line: '#e879f9',
  autocorr_band: 'rgba(239, 68, 68, 0.4)',
  autocorr_zero: 'rgba(148, 163, 184, 0.4)',
  zscore_line: '#38bdf8',
  zscore_ref: 'rgba(239, 68, 68, 0.4)',
  pctrank_line: '#fbbf24',
  pctrank_ref: 'rgba(239, 68, 68, 0.4)',
  robustz_line: '#fb7185',
  robustz_ref: 'rgba(239, 68, 68, 0.4)',
  minmax_line: '#5eead4',
  minmax_ref: 'rgba(148, 163, 184, 0.4)',
  regresid_line: '#c4b5fd',
  regresid_zero: 'rgba(148, 163, 184, 0.4)',
  fracdiff_line: '#fcd34d',
  fracdiff_zero: 'rgba(148, 163, 184, 0.4)',
  skew_line: '#f0abfc',
  skew_zero: 'rgba(148, 163, 184, 0.4)',
  kurt_line: '#fdba74',
  kurt_zero: 'rgba(148, 163, 184, 0.4)',
  entropy_line: '#67e8f9',
  entropy_ref: 'rgba(148, 163, 184, 0.4)',
  winsorz_line: '#f9a8d4',
  winsorz_ref: 'rgba(239, 68, 68, 0.4)',
  iqrpos_line: '#93c5fd',
  iqrpos_band: 'rgba(148, 163, 184, 0.4)',
  iqrpos_fence: 'rgba(239, 68, 68, 0.45)',
  persistence_pos: '#22c55e',
  persistence_neg: '#ef4444',
  persistence_zero: 'rgba(148, 163, 184, 0.4)',
  rankroc_line: '#a3e635',
  rankroc_zero: 'rgba(148, 163, 184, 0.4)',
  pctldisp_line: '#fca5a5',
  pctldisp_ref: 'rgba(148, 163, 184, 0.4)',
  td_buy: '#22c55e',
  td_buy_perfect: '#bef264',
  td_buy_cd: '#22d3ee',
  td_sell: '#ef4444',
  td_sell_perfect: '#fda4af',
  td_sell_cd: '#f59e0b',
  tdst_resistance: 'rgba(239, 68, 68, 0.85)',
  tdst_support: 'rgba(34, 197, 94, 0.85)',
  demarker_line: '#c084fc',
  demarker_ref: 'rgba(239, 68, 68, 0.4)',
  tdrei_line: '#38bdf8',
  tdrei_ref: 'rgba(239, 68, 68, 0.4)',
  tdrei_zero: 'rgba(148, 163, 184, 0.4)',
  prpctl_rank: '#14b8a6',
  prpctl_src: '#fb923c',
  prpctl_upper: '#ef4444',
  prpctl_mid: 'rgba(148, 163, 184, 0.8)',
  prpctl_lower: '#22c55e',
  prpctl_ref: 'rgba(148, 163, 184, 0.35)',
  pctlbands_upper: '#ef4444',
  pctlbands_mid: 'rgba(148, 163, 184, 0.75)',
  pctlbands_lower: '#22c55e',
  chop_line: '#eab308',
  chop_ref: 'rgba(148, 163, 184, 0.4)',
  vhf_line: '#2dd4bf',
  vhf_ref: 'rgba(148, 163, 184, 0.4)',
  vortex_plus: '#22c55e',
  vortex_minus: '#ef4444',
  vortex_ref: 'rgba(148, 163, 184, 0.4)',
  ttm_up_strong: '#22c55e',
  ttm_up_weak: '#15803d',
  ttm_dn_weak: '#7f1d1d',
  ttm_dn_strong: '#ef4444',
  ttm_sqz_on: '#f59e0b',
  ttm_sqz_off: 'rgba(148, 163, 184, 0.55)',
  ttm_zero: 'rgba(255,255,255,0.15)',
  realizedvol_line: '#f472b6',
  drawdown_line: '#ef4444',
  bbpctb_line: '#a78bfa',
  bbpctb_ref: 'rgba(148, 163, 184, 0.4)',
  bbwidth_line: '#22d3ee',
  halflife_line: '#4ade80',
  hurst_line: '#fb923c',
  hurst_ref: 'rgba(148, 163, 184, 0.5)',
  effratio_line: '#c084fc',
  effratio_ref: 'rgba(148, 163, 184, 0.4)',
  regslope_line: '#34d399',
  regslope_r2: 'rgba(148, 163, 184, 0.7)',
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
  // Adaptive / regime overlays
  kalman_line: '#e879f9',
  kalman_band: 'rgba(232, 121, 249, 0.55)',
  cusum_mean_up: '#22c55e',
  cusum_mean_down: '#ef4444',
  cusum_vol_up: '#f59e0b',
  cusum_vol_down: '#38bdf8',
  // HMM shade colors are applied at low opacity by the indicator itself.
  hmm_bear: '#ef4444',
  hmm_chop: '#64748b',
  hmm_bull: '#22c55e',
};
