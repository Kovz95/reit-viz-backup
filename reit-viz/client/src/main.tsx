import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Auto-recover tabs left open across a deploy: each deploy replaces the
// hashed asset chunks, so a stale tab's next lazy import 404s (and the SPA
// fallback answers with text/html, which the module loader rejects). When
// that signature appears, reload once — the fresh index.html points at the
// new chunk graph. A 30s sessionStorage stamp prevents reload loops when
// the failure is something else (server truly down, adblock, etc.).
const CHUNK_RELOAD_KEY = "reit-viz:chunk-reload-at";
function isStaleChunkError(msg: string): boolean {
  return /dynamically imported module|Importing a module script failed|Loading chunk \d+ failed|Expected a JavaScript.* module script/i.test(msg);
}
function reloadOnceForStaleChunk(): void {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return; // no storage → can't guard against loops → don't auto-reload
  }
  window.location.reload();
}
window.addEventListener("unhandledrejection", (e) => {
  const msg = String((e.reason as { message?: unknown })?.message ?? e.reason ?? "");
  if (isStaleChunkError(msg)) {
    e.preventDefault();
    reloadOnceForStaleChunk();
  }
});
window.addEventListener("error", (e) => {
  if (isStaleChunkError(String(e.message ?? ""))) reloadOnceForStaleChunk();
}, true);

if (!window.location.hash) {
  window.location.hash = "#/";
}

createRoot(document.getElementById("root")!).render(<App />);
