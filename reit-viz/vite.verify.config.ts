import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Standalone verify server: current client source, data proxied to the 5001 container.
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
    port: 5199,
    strictPort: true,
    fs: { strict: false },
    proxy: {
      "/api": { target: "http://localhost:5001", changeOrigin: true },
      "/data": { target: "http://localhost:5001", changeOrigin: true },
    },
  },
});
