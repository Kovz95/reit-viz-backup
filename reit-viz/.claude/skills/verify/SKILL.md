---
name: verify
description: Build/launch/drive recipe for verifying reit-viz client changes locally against the 5001 Docker API, with headless Chrome capture.
---

# Verifying reit-viz client changes

The editable build on 5001 is a Docker container with a baked-in bundle —
local edits never reach it. Verify by serving the editable client through a
standalone Vite dev server that proxies `/api` + `/data` to 5001, then drive
it with headless Chrome.

## Launch

```powershell
# 1. Confirm the API container is up (serves /api + /data):
Invoke-WebRequest -UseBasicParsing http://localhost:5001/api/tickers

# 2. Serve the editable client on 5210 (config lives in the repo):
npx vite --config vite.verify.config.mts    # run from reit-viz/, background it
```

`vite.verify.config.mts` mirrors vite.config.ts (same aliases/root) plus the
proxy + port 5210.

## Drive

Headless Chrome via **globally installed** puppeteer-core (there is no local
install — `createRequire('C:/Users/NickK/AppData/Roaming/npm/node_modules/')`,
Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`).
`verify-universal.mjs` in the repo root is a working full-flow driver to crib
from (waits on data-testids, runs sweeps, screenshots, IndexedDB-restore
check).

Gotchas learned:
- Vite config files outside the repo can't resolve `vite`/plugins — keep the
  verify config inside reit-viz.
- Router is hash-based: pages are `http://localhost:5210/#/<route>`.
- App state persists (localStorage settings + IndexedDB caches). For
  deterministic runs clear both first:
  `localStorage.clear(); indexedDB.deleteDatabase(...)` then reload.
- Typing into a controlled `<input type="number">` with `clickCount: 3` +
  `page.type` can append instead of replace in headless — verify the value
  took, or set via the native value setter + `input` event.
- In-page `import('/src/lib/<file>.ts')` works under the dev server — direct
  module probing is the fastest way to isolate engine vs UI-wiring bugs.

## Prod

Push to main auto-deploys the full Vultr pipeline. After deploy, drive
https://45.63.20.126 the same way (memory: prod data load is intermittent —
gate on a "N dates"/count signal before interacting).
