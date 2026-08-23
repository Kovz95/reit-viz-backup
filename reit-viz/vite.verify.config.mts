// Standalone verify config: serves the editable client with /api + /data
// proxied to the Docker build on 5001. Used by the verify workflow only —
// not part of the build. Launch:
//   npx vite --config vite.verify.config.mts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    // The baked 5001 container lacks freshly-added server routes; answer
    // /api/intraday/* here via the same code path the real server uses.
    {
      name: "verify-intraday-route",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const m = req.url?.match(/^\/api\/intraday\/([^/?]+)(?:\?(.*))?$/);
          if (!m) return next();
          try {
            const { fetchYahooIntraday } = await import("./server/intradayPrices");
            const params = new URLSearchParams(m[2] ?? "");
            const days = params.get("days");
            const data = await fetchYahooIntraday(
              decodeURIComponent(m[1]),
              params.get("interval") ?? "60m",
              days ? parseInt(days) : undefined,
            );
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
          } catch (e: any) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: e?.message ?? String(e) }));
          }
        });
      },
    },
    // The baked 5001 container's /api/liquidity/adv predates the median/p25
    // fields — answer it here via the edited server/adv.ts so the Liquidity
    // Capacity page can be verified against real computed medians.
    {
      name: "verify-adv-route",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!/^\/api\/liquidity\/adv(\?|$)/.test(req.url ?? "") || req.method !== "POST") return next();
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", async () => {
            try {
              const { getAdvBatch } = await import("./server/adv");
              const parsed = JSON.parse(body || "{}");
              const tickers: string[] = Array.isArray(parsed.tickers) ? parsed.tickers.map(String) : [];
              const window = Number.isFinite(Number(parsed.window)) && Number(parsed.window) > 0
                ? Math.min(Math.floor(Number(parsed.window)), 504) : 90;
              const results = await getAdvBatch(tickers.slice(0, 600), window, parsed.refresh === true);
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ window, results }));
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: e?.message ?? String(e) }));
            }
          });
        });
      },
    },
    // Bulk/nightly ADV routes (also newer than the baked container).
    {
      name: "verify-adv-bulk-routes",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const json = (body: unknown, code = 200) => {
            res.statusCode = code;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(body));
          };
          if (req.url?.startsWith("/api/liquidity/adv-bulk") && req.method === "GET") {
            import("./server/advNightly").then(({ getGlobalAdvBulk, nightlyStatus, GLOBAL_ADV_WINDOW }) => {
              json({ window: GLOBAL_ADV_WINDOW, results: getGlobalAdvBulk(), nightly: nightlyStatus() });
            }).catch((e) => json({ error: e?.message ?? String(e) }, 500));
            return;
          }
          if (req.url?.startsWith("/api/liquidity/adv-nightly") && req.method === "POST") {
            let body = "";
            req.on("data", (c) => (body += c));
            req.on("end", async () => {
              try {
                const { runGlobalAdvRefresh } = await import("./server/advNightly");
                const limit = Number(JSON.parse(body || "{}").limit) || 25;
                json({ status: await runGlobalAdvRefresh(limit) });
              } catch (e: any) {
                json({ error: e?.message ?? String(e) }, 500);
              }
            });
            return;
          }
          next();
        });
      },
    },
    // Cache-only recent-closes bulk read (newer than the baked container) —
    // powers the Liquidity Capacity pair-correlation column.
    {
      name: "verify-yahoo-closes-route",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!/^\/api\/yahoo-prices\/closes(\?|$)/.test(req.url ?? "") || req.method !== "POST") return next();
          let body = "";
          req.on("data", (c) => (body += c));
          req.on("end", async () => {
            try {
              const { readCachedPrices } = await import("./server/yahooPrices");
              const parsed = JSON.parse(body || "{}");
              const tickers: string[] = Array.isArray(parsed.tickers) ? parsed.tickers.map(String) : [];
              const d = Math.min(Math.max(Math.floor(Number(parsed.days)) || 80, 10), 300);
              const results: Record<string, { dates: string[]; closes: number[] }> = {};
              for (const raw of tickers.slice(0, 250)) {
                const sym = raw.toUpperCase();
                const data = readCachedPrices(sym);
                if (!data || !Array.isArray(data.dates) || data.dates.length === 0) continue;
                const closes = data.adjCloses?.length === data.dates.length ? data.adjCloses : data.closes;
                if (!Array.isArray(closes)) continue;
                // Same phantom-tail trim as the real route (dead tickers get
                // zero-volume padded bars from Yahoo).
                let end = data.dates.length;
                if (Array.isArray(data.volumes) && data.volumes.length === data.dates.length) {
                  const floor = Math.max(0, end - 15);
                  while (end > floor && !(data.volumes[end - 1] > 0)) end--;
                }
                if (end === 0) continue;
                const n = Math.min(d, end);
                results[sym] = { dates: data.dates.slice(end - n, end), closes: closes.slice(end - n, end) };
              }
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ days: d, results }));
            } catch (e: any) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: e?.message ?? String(e) }));
            }
          });
        });
      },
    },
    // The baked 5001 container also predates /api/prefs (generic KV backing
    // the server-synced template stores). An in-memory map is enough for
    // verification — it persists across page reloads within one vite session.
    {
      name: "verify-prefs-route",
      configureServer(server) {
        const prefs = new Map<string, string>();
        server.middlewares.use((req, res, next) => {
          const m = req.url?.match(/^\/api\/prefs\/([^/?]+)(\/delete)?(?:\?.*)?$/);
          if (!m) return next();
          const key = decodeURIComponent(m[1]);
          const json = (body: unknown) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(body));
          };
          if (req.method === "GET") {
            const raw = prefs.get(key);
            return json({ key, value: raw === undefined ? null : JSON.parse(raw) });
          }
          if (req.method === "POST" && m[2]) {
            return json({ ok: prefs.delete(key) });
          }
          if (req.method === "POST") {
            let body = "";
            req.on("data", (c) => (body += c));
            req.on("end", () => {
              try {
                prefs.set(key, JSON.stringify(JSON.parse(body).value));
                json({ ok: true, key });
              } catch (e: any) {
                res.statusCode = 400;
                json({ error: e?.message ?? String(e) });
              }
            });
            return;
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  base: "./",
  server: {
    port: 5210,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:5001",
      "/data": "http://localhost:5001",
    },
  },
});
