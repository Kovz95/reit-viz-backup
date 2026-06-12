# live-runtime-bundle branch

This branch contains the production JavaScript bundle that was actually running on Vultr (`http://45.63.20.126:8090/`) as of **June 11, 2026 23:58 UTC**.

## Why this exists

The original TypeScript source for the features added between April 19, 2026 and June 11, 2026 was lost. The running app on Vultr is the only artifact that contains those features. This branch preserves that artifact so it can be reverse-engineered into source when needed.

## Contents

- `live-bundle-raw/` — Exact files pulled from `/opt/reit-viz/dist/public/assets/` on Vultr. Minified, content-hashed. 88 chunks + main bundle + CSS.
- `live-bundle-beautified/` — Same files run through `js-beautify`. Readable, but variable names are mangled (e.g. `a`, `b`, `t`, `c4`).

## Entry point

`live-bundle-raw/index-CsG73Aq_.js` is the main bundle. Chunks are dynamic-imported by route.

## How to recover a feature

1. Identify the route or component (e.g. `/baskets` lives in `Baskets-CFu3VD0m.js`)
2. Read the beautified file
3. Rewrite as proper TypeScript on the `main` branch
4. Verify build with `npx vite build`

## DO NOT deploy this branch

This is a forensic artifact, not a deployable app. To deploy, build from `main` (or future source branches).
