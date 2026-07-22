// Reconstructed from recovered-bundle/YieldCorrelation-Dp9JZcNi.js on 2026-06-11

// The embedded app runs on :8091. On HTTPS, a plain http:// iframe is blocked
// as mixed content, so prod nginx proxies it at /yield-corr-app/ (same-origin)
// — see .github/workflows/server-nginx-yieldcorr.yml. Plain-http contexts
// (local dev, the 5001 container) hit the port directly.
const EMBED_URL =
  typeof window !== "undefined" && window.location.protocol === "https:"
    ? "/yield-corr-app/"
    : "http://45.63.20.126:8091/";

export default function YieldCorrelation() {
  return (
    <div
      style={{
        height: "calc(100vh - 60px)",
        width: "100%",
        margin: 0,
        padding: 0,
      }}
    >
      <iframe
        src={EMBED_URL}
        title="REIT × Treasury Yield Correlation"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
        }}
      />
    </div>
  );
}
