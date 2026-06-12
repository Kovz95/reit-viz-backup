# reit-viz backup

This repo holds the latest known state of the **reit-viz** REIT analysis application after a sandbox-recycle event on 2026-06-11 destroyed the active TypeScript source in the Perplexity Computer sandbox.

## Repo layout

- `stale-source/` — the older TypeScript source tree pulled from Vultr `/opt/reit-viz/`. **This is months behind the live deployment.** Use it to reference shared infrastructure (build config, server, server-side scripts) but treat all `client/src/` content as out-of-date.
- `recovered-bundle/` — **beautified** JavaScript of the live production build downloaded from Vultr on 2026-06-12 02:07 UTC. 59 chunks + main entry + CSS + index.html. Each chunk corresponds to one route or large lazy-loaded component (e.g. `MACrossoverOptimizer-*.js`, `SlowStochOptimizer-*.js`). Variable and function names are minified to single letters; types and comments are gone, but the program structure is readable enough to re-derive original source.
- `recovered-bundle-min/` — the original minified bundle, byte-for-byte what Vultr serves. Kept for reference and parity testing.

## Recovery notes

- **Live site** (http://45.63.20.126:8090/) is unaffected — it serves the compiled bundle in `recovered-bundle-min/` from Vultr's `/opt/reit-viz/dist/public/assets/`.
- **All recent work** (basket combined mode across optimizers, SlowStoch crash fix, MA Crossover Evaluate basket UI, ZScore Combined debug logging, basketOhlc helper, etc.) is **only** in the compiled bundle. To edit those components you must un-minify the relevant chunk.
- **What's missing from `stale-source/client/src/`** but present in the live bundle:
  - All recent optimizer pages: SlowStoch, Harsi, Combo, Range, TVA, DualMA, ROC, Oscillators, ZScore (with basket-combined branch), Momentum, RSI Regime
  - All basket infrastructure: `lib/basketOhlc.ts`, `lib/useBaskets.ts`, components/BasketPicker.tsx, BasketTickerPill.tsx, BasketManager
  - Presets infrastructure: `components/PresetBar.tsx`, `lib/optimizerPresets.tsx`
  - The Charts page in its current form (drawings/channels/fibs/S-R/patterns logic)
  - Many lib utilities: `dateRange.ts`, `useFrequency.ts`, `timeframe.ts`, `weeklyDownsample.ts`, `optimizerInputSeries.ts`, etc.

## Reconstruction workflow

For any file you need to edit:

1. Find the chunk in `recovered-bundle/` that contains the symbol (search for known string literals).
2. Trace minified identifiers back to readable React component / hook structure.
3. Reconstruct a `.tsx` file in a new `recovered-src/` tree.
4. Wire it into the build by replacing the stale equivalent in `stale-source/client/src/`.
5. `npx vite build` and parity-test against the live site.

## Deployment

The production deploy pipeline is:

```bash
cd <project> && npx vite build
tar --exclude='data.db*' --exclude='data/yahoo-cache' -czf /tmp/reit-viz-deploy.tar.gz -C dist/public .
sshpass -p '<REDACTED>' scp /tmp/reit-viz-deploy.tar.gz root@45.63.20.126:/tmp/
sshpass -p '<REDACTED>' ssh root@45.63.20.126 'tar xzf /tmp/reit-viz-deploy.tar.gz -C /opt/reit-viz/dist/public/ && pm2 restart reit-viz'
```

Do NOT use `npm run build` — it wipes `dist/`.
