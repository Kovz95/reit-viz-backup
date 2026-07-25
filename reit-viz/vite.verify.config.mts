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
