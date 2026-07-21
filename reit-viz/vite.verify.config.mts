// Standalone verify config: serves the editable client with /api + /data
// proxied to the Docker build on 5001. Used by the verify workflow only —
// not part of the build. Launch:
//   npx vite --config vite.verify.config.mts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
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
