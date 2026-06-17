# reit-viz

REIT analysis & visualization app — a Vite/React client + Express (TypeScript, tsx) server
with better-sqlite3 + drizzle-orm. The entire application lives in **`reit-viz/`**.

## Run locally (Docker)

```bash
docker build -t reit-viz ./reit-viz
docker run -d --name reit-viz -p 5000:5000 reit-viz
# open http://localhost:5000
```

Upload your REIT workbook from the in-app **Data Management** UI to populate ticker data
(the server stores it under `reit-viz/data/`).

## Run locally (dev)

```bash
cd reit-viz
npm ci
npm run build      # vite client -> dist/public, esbuild server -> dist/index.cjs
NODE_ENV=production node dist/index.cjs
```

## Deploy to Vultr (GitHub Actions)

Two manual workflows (Actions tab). Both need the `VULTR_SSH_PASSWORD` repo secret.

- **Deploy reit-viz to Vultr** — client-only (`dist/public`). Use for routine frontend changes.
  Run with the `deploy` box checked (unchecked = build-only dry run).
- **Deploy reit-viz FULL (server + client) to Vultr** — ships the server too; backs up the
  live install first and rolls back on failure. Type `DEPLOY-FULL` to confirm. Use only when
  you've changed server code (`reit-viz/server`).

Optional repo variables override the defaults: `VULTR_HOST` (45.63.20.126), `VULTR_USER`
(root), `VULTR_PATH` / `VULTR_DIR` (/opt/reit-viz), `PM2_APP` (reit-viz).

## Layout

```
reit-viz/            the app (client/ + server/ + shared/)
.github/workflows/   deploy pipelines
```

> History note: this repo previously held disaster-recovery artifacts (the recovered
> production bundle + a stale source tree) used to rebuild the app. Those were removed once
> the reconstruction reached parity; they remain retrievable via the `recovery-artifacts`
> git tag and in history.
