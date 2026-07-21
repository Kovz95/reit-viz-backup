import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Standalone verify server: current client source, data proxied to the 5001 container.
// The baked 5001 container lacks freshly-added server routes, so this config can
// serve them locally: /api/intraday/* is answered here by the same code path the
// real server uses (server/intradayPrices.ts).
export default defineConfig({
  plugins: [
    react(),
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
    port: 5199,
    strictPort: true,
    fs: { strict: false },
    proxy: {
      "/api": { target: "http://localhost:5001", changeOrigin: true },
      "/data": { target: "http://localhost:5001", changeOrigin: true },
    },
  },
});
